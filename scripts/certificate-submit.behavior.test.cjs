// Execute the real client services/provider against local stubs. Never writes to Supabase.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, dependencies, globals = {}) {
  const output = ts.transpileModule(fs.readFileSync(require.resolve(relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, require: (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected import ${name}`);
      return dependencies[name];
    },
    process: { env: {} }, console: { warn() {}, log() {}, error() {} },
    URL, Date, Set, Map, JSON, AbortController, setTimeout, clearTimeout, ...globals,
  });
  return exports;
}

function service(client = {}, globals = {}) {
  return load('../src/services/supabase.ts', { '@supabase/supabase-js': { createClient: () => client } }, globals);
}

test('network deadline aborts the actual fetch, not just its caller', async () => {
  let signal;
  const api = service({}, {
    fetch: (_input, init) => new Promise((_resolve, reject) => {
      signal = init.signal;
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }),
  });
  await assert.rejects(api.fetchWithTimeout('https://example.test', {}, 5), /aborted/);
  assert.equal(signal.aborted, true);
});

test('network wrapper preserves explicit caller cancellation and request options', async () => {
  const caller = new AbortController();
  const api = service({}, {
    fetch: (_input, init) => new Promise((_resolve, reject) => {
      assert.equal(init.method, 'POST');
      assert.equal(init.body, 'payload');
      assert.equal(init.headers.apikey, 'public-test-key');
      init.signal.addEventListener('abort', () => reject(new Error('cancelled')));
    }),
  });
  const request = api.fetchWithTimeout('https://example.test', {
    signal: caller.signal, method: 'POST', headers: { apikey: 'public-test-key' }, body: 'payload',
  });
  caller.abort();
  await assert.rejects(request, /cancelled/);
});

test('unreadable file fails before any upload request', async () => {
  let uploads = 0;
  const api = service({ storage: { from: () => { uploads++; } } }, {
    fetch: async () => ({ ok: false }),
  });
  await assert.rejects(api.uploadFileToStorage('blob:missing', 'evidence', 'proof.png'), /chọn lại minh chứng/);
  assert.equal(uploads, 0);
});

test('upload uses original bytes, PNG MIME and no overwrite; returns stable locator', async () => {
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  let uploaded = false;
  const api = service({ storage: { from: (bucket) => {
    assert.equal(bucket, 'certificates');
    return {
      upload: async (_name, data, options) => {
        assert.equal(data, bytes);
        assert.equal(options.contentType, 'image/png');
        assert.equal(options.upsert, false);
        uploaded = true;
        return { error: null };
      },
      getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/storage/v1/object/public/certificates/evidence/proof.png' } }),
    };
  } } }, { fetch: async () => ({ ok: true, arrayBuffer: async () => bytes }) });
  assert.match(await api.uploadFileToStorage('blob:test', 'evidence', 'proof.png'), /evidence\/proof.png$/);
  assert.equal(uploaded, true);
});

test('storage rejection is visible, never treated as local-file success', async () => {
  const api = service({ storage: { from: () => ({
    upload: async () => ({ error: { message: 'JWT expired' } }),
  }) } }, { fetch: async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer }) });
  await assert.rejects(api.uploadFileToStorage('blob:test', 'evidence', 'proof.png'), /đăng nhập lại/);
});

test('certificate slug is resolved before querying a UUID evidence column', async () => {
  const certificateId = '30000000-0000-4000-8000-000000000001';
  const filters = [];
  const api = service({ from: table => ({
    select: () => ({
      eq: (column, value) => {
        filters.push([table, column, value]);
        return {
          limit: async () => ({ data: [{ id: certificateId }] }),
          order: async () => ({ data: [] }),
        };
      },
    }),
  }) });
  await api.getEvidenceDocuments('cert_12345');
  assert.deepEqual(filters, [
    ['certificates', 'slug_id', 'cert_12345'],
    ['evidence_documents', 'certificate_id', certificateId],
  ]);
});

const school = { id: 'school-1', name: 'Trường kiểm thử', orgType: 'school', status: 'verified', ownerUserId: 'reviewer' };
function provider(overrides = {}, organizations = [school]) {
  let stateIndex = 0;
  let refIndex = 0;
  const user = { id: 'student-1', role: 'student', email: 'student@example.test' };
  const calls = { uploads: 0, certificates: 0, evidence: 0, notifications: 0, profiles: 0 };
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    createElement: (_type, props) => props,
    useContext() {},
    useEffect() {},
    useRef: (initial) => ({ current: refIndex++ === 0 ? user : initial }),
    useState: (initial) => {
      const index = stateIndex++;
      const state = index === 8 ? organizations : initial;
      return [state, () => {}];
    },
  };
  const services = {
    uploadFileToStorage: async () => { calls.uploads++; return 'evidence/proof.png'; },
    submitCertificate: async () => { calls.certificates++; return { id: 'certificate-uuid' }; },
    addEvidenceDocument: async () => { calls.evidence++; return { id: 'evidence-uuid' }; },
    createNotification: async () => { calls.notifications++; return null; },
    updateUserProfile: async () => { calls.profiles++; return true; },
    ...overrides,
  };
  const api = load('../src/store/AppContext.tsx', {
    react, '../services/supabase': services,
    '../services/pinata': { calculateSha256: async () => 'a'.repeat(64) },
    '../services/web3': {}, '../utils/authPortal': { portalError: () => null },
  });
  return { state: api.AppProvider({ children: null }).value, calls };
}

test('school confirmation succeeds without waiting on notification or profile sync', async () => {
  const { state, calls } = provider({
    createNotification: () => new Promise(() => {}),
    updateUserProfile: () => new Promise(() => {}),
  });
  let timer;
  try {
    await Promise.race([
      state.verifyStudentSchool(school.name, [{ name: 'proof.png', uri: 'blob:test' }], school.id),
      new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Submission stuck')), 100); }),
    ]);
  } finally { clearTimeout(timer); }
  assert.equal(calls.certificates, 1);
  assert.equal(calls.evidence, 1);
});

test('company, unverified school and stale school IDs are rejected before uploading', async () => {
  for (const org of [
    { ...school, orgType: 'company' },
    { ...school, status: 'pending' },
    { ...school, id: 'different-id' },
  ]) {
    const { state, calls } = provider({}, [org]);
    await assert.rejects(state.verifyStudentSchool(school.name, [{ name: 'proof.png', uri: 'blob:test' }], school.id), /trường đã được SkillPass xác minh/);
    assert.equal(calls.uploads, 0);
  }
});

test('failed upload does not create a certificate or notification', async () => {
  const { state, calls } = provider({
    uploadFileToStorage: async () => { throw new Error('Upload unavailable'); },
  });
  await assert.rejects(state.verifyStudentSchool(school.name, [{ name: 'proof.png', uri: 'blob:test' }], school.id), /Upload unavailable/);
  assert.equal(calls.certificates, 0);
  assert.equal(calls.notifications, 0);
});
