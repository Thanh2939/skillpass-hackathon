// Actual TypeScript auth logic against stubs; no real account or email is created.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, dependencies) {
  const source = fs.readFileSync(require.resolve(relative), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, process: { env: {} }, console: { warn() {}, log() {}, error() {} },
    URL, Date, Set, Map, JSON, AbortController, setTimeout, clearTimeout,
    require: name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
  });
  return exports;
}
const payload = { email: ' Student@Example.test ', password: 'test-only-password',
  fullName: 'Sinh viên kiểm thử', role: 'student', mssv: 'TEST01' };
const user = { id: 'student-1', email: 'student@example.test', identities: [{ id: 'identity-1' }] };
function service(signUp) {
  let loginCalls = 0;
  const api = load('../src/services/supabase.ts', { '@supabase/supabase-js': { createClient: () => ({
    auth: { signUp, signInWithPassword: () => { loginCalls++; throw new Error('Unexpected automatic login'); } },
  }) } });
  return { api, loginCalls: () => loginCalls };
}

test('email quota stays a failure and preserves its machine-readable error code', async () => {
  const { api } = service(async () => ({
    data: { user: null, session: null },
    error: { code: 'over_email_send_rate_limit', status: 429, message: 'email rate limit exceeded' },
  }));
  const result = await api.signUpWithEmail(payload);
  assert.equal(result.errorCode, 'over_email_send_rate_limit');
  assert.equal(result.user, null);
  assert.match(result.error, /giới hạn gửi email/);
  assert.match(result.error, /SMTP/);
});

test('confirmation-required signup never attempts password login or fabricates a session', async () => {
  const { api, loginCalls } = service(async request => {
    assert.equal(request.email, 'student@example.test');
    assert.equal(request.options.data.role, 'student');
    assert.equal(request.options.data.mssv, 'TEST01');
    return { data: { user, session: null }, error: null };
  });
  const result = await api.signUpWithEmail(payload);
  assert.equal(result.user, user);
  assert.equal(result.session, null);
  assert.equal(result.error, null);
  assert.equal(loginCalls(), 0);
});

test('legacy Auth responses without an error code still identify the email quota', async () => {
  const { api } = service(async () => ({
    data: { user: null, session: null },
    error: { status: 429, message: 'email rate limit exceeded' },
  }));
  const result = await api.signUpWithEmail(payload);
  assert.equal(result.errorCode, 'over_email_send_rate_limit');
  assert.match(result.error, /SMTP/);
});

test('existing-account response is not treated as a newly authenticated account', async () => {
  const { api, loginCalls } = service(async () => ({
    data: { user: { ...user, identities: [] }, session: null }, error: null,
  }));
  const result = await api.signUpWithEmail(payload);
  assert.equal(result.errorCode, 'user_already_exists');
  assert.equal(result.user, null);
  assert.equal(loginCalls(), 0);
});

test('successful signup preserves the actual session', async () => {
  const session = { user, access_token: 'local-test-only' };
  const { api } = service(async () => ({ data: { user, session }, error: null }));
  const result = await api.signUpWithEmail(payload);
  assert.equal(result.session, session);
  assert.equal(result.error, null);
});

test('network failures return a safe recoverable registration result', async () => {
  const { api } = service(async () => { throw new Error('Failed to fetch'); });
  const result = await api.signUpWithEmail(payload);
  assert.equal(result.user, null);
  assert.match(result.error, /Kiểm tra hộp thư trước khi thử lại/);
});

test('provider restrictions, invalid addresses and request throttling have different guidance', () => {
  const { api } = service(async () => {});
  assert.match(api.registrationErrorMessage({ code: 'email_address_not_authorized' }), /SMTP riêng/);
  assert.match(api.registrationErrorMessage({ code: 'email_address_invalid' }), /email thật/);
  assert.match(api.registrationErrorMessage({ code: 'over_request_rate_limit', status: 429 }), /quá nhiều yêu cầu/);
  assert.doesNotMatch(api.registrationErrorMessage({ status: 429 }), /giờ|phút/);
});

function app(signUpWithEmail) {
  const react = {
    createContext: () => ({ Provider: 'Provider' }), createElement: (_type, props) => props,
    useContext() {}, useEffect() {}, useRef: initial => ({ current: initial }),
    useState: initial => [initial, () => {}],
  };
  let profileReads = 0;
  const api = load('../src/store/AppContext.tsx', {
    react, '../services/supabase': {
      signUpWithEmail, getUserProfile: () => { profileReads++; throw new Error('No authenticated profile yet'); },
    },
    '../services/pinata': {}, '../services/web3': {}, '../utils/authPortal': { portalError: () => null },
  });
  return { state: api.AppProvider({ children: null }).value, profileReads: () => profileReads };
}

test('provider reports needsConfirm without querying protected profile data', async () => {
  const { state, profileReads } = app(async () => ({ user, session: null, error: null }));
  const result = await state.signUp(payload);
  assert.equal(result.ok, true);
  assert.equal(result.needsConfirm, true);
  assert.equal(profileReads(), 0);
});

test('provider blocks simultaneous signup and releases the guard after a failure', async () => {
  let resolve;
  let calls = 0;
  const { state } = app(() => { calls++; return new Promise(r => { resolve = r; }); });
  const first = state.signUp(payload);
  const second = await state.signUp(payload);
  assert.equal(second.ok, false);
  assert.equal(calls, 1);
  resolve({ user: null, session: null, error: 'quota', errorCode: 'over_email_send_rate_limit' });
  assert.equal((await first).errorCode, 'over_email_send_rate_limit');
  const retry = state.signUp(payload);
  assert.equal(calls, 2);
  resolve({ user: null, session: null, error: 'quota' });
  assert.equal((await retry).ok, false);
});
