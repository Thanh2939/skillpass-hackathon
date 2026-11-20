const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real TypeScript service against a stubbed Supabase client.
// No credentials, network requests, remote writes, or source-regex "tests".
function loadService(client) {
  const source = fs.readFileSync(require.resolve('../src/services/supabase.ts'), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, process: { env: {} }, console: { warn() {}, log() {}, error() {} },
    URL, Date, Set, JSON,
    fetch: () => { throw new Error('Unexpected network request'); },
    require: (name) => {
      assert.equal(name, '@supabase/supabase-js');
      return { createClient: () => client };
    },
  });
  return exports;
}

test('profile RPC outage never falls back to direct table reads', async () => {
  let directReads = 0;
  const service = loadService({
    rpc: async () => ({ data: null, error: { message: 'RPC missing', code: 'PGRST202' } }),
    from: () => { directReads++; throw new Error('Unsafe direct-table fallback'); },
  });
  let result;
  try { result = await service.getSharedProfile('SP-PRIVATE'); } catch {}
  assert.notEqual(result?.status, 'ok');
  assert.equal(directReads, 0);
});

test('certificate RPC outage never falls back to direct table reads', async () => {
  let directReads = 0;
  const service = loadService({
    rpc: async () => ({ data: null, error: { message: 'offline' } }),
    from: () => { directReads++; throw new Error('Unsafe direct-table fallback'); },
  });
  let result;
  try { result = await service.getSharedCertificate('SP-PRIVATE', 'cert-1'); } catch {}
  assert.notEqual(result?.status, 'ok');
  assert.equal(directReads, 0);
});

test('restricted link insert cannot silently downgrade to public on missing columns', async () => {
  const payloads = [];
  const service = loadService({
    from: () => ({
      insert: (payload) => {
        payloads.push(payload);
        return { select: () => ({ single: async () => ({ data: null, error: { message: 'column access_mode does not exist', code: '42703' } }) }) };
      },
    }),
  });
  let result;
  try { result = await service.createSharedLink('owner', 'Receiver', 'SP-PRIVATE', { accessMode: 'restricted', allowedEmails: ['receiver@example.com'] }); } catch {}
  assert.ok(!result, 'migration failure must not fabricate a working restricted link');
  assert.equal(payloads.length, 1, 'do not retry a restricted insert as public');
  assert.equal(payloads[0][0].access_mode, 'restricted');
});

test('server access-denied result returns no private data', async () => {
  const service = loadService({
    rpc: async () => ({ data: { status: 'denied', access_mode: 'restricted' }, error: null }),
  });
  const result = await service.getSharedProfile('SP-PRIVATE');
  assert.equal(result.status, 'denied');
  assert.equal(result.profile, undefined);
  assert.ok(!result.certificates?.length);
});
