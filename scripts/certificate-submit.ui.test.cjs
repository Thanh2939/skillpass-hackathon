// Local exported PWA only. All Supabase HTTP/WS traffic is intercepted.
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE ||
  'C:/Users/DELL/AppData/Local/Temp/opencode/skillpass-feedback-tests/node_modules/playwright-core');
const assert = require('node:assert/strict');
const base = process.env.FEEDBACK_BASE_URL || 'http://127.0.0.1:8084';
const owner = '10000000-0000-4000-8000-000000000001';
const schoolId = '20000000-0000-4000-8000-000000000001';
const certificateId = '30000000-0000-4000-8000-000000000001';
const user = { id: owner, email: 'student@example.test', aud: 'authenticated', role: 'authenticated',
  email_confirmed_at: new Date().toISOString(), user_metadata: {} };
const profile = { ...user, role: 'student', full_name: 'Sinh viên kiểm thử', mssv: 'TEST01',
  school_name: '', avatar_url: null, share_code: 'SP-TEST', school_verified: false };
const claims = { sub: owner, email: user.email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 };
const session = { user, access_token: `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.test`,
  refresh_token: 'local-only', token_type: 'bearer', expires_in: 3600, expires_at: claims.exp };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYZkAAAAASUVORK5CYII=', 'base64');

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    for (const mode of ['success', 'denied', 'timeout']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      let uploads = 0;
      let certificates = 0;
      await context.routeWebSocket(/supabase\.co/, socket => socket.close());
      await context.addInitScript(({ session, mode }) => {
        localStorage.setItem('sb-vaxtkabqnvazdsiditgs-auth-token', JSON.stringify(session));
        if (mode === 'timeout') {
          const original = window.setTimeout.bind(window);
          window.setTimeout = (fn, delay, ...args) => original(fn, delay === 45000 ? 100 : delay, ...args);
        }
      }, { session, mode });
      await context.route(/https:\/\/[^/]+\.supabase\.co\/.*/, async route => {
        const req = route.request();
        const url = new URL(req.url());
        const method = req.method();
        let body = [];
        let status = 200;
        if (url.pathname.includes('/auth/v1/user')) body = user;
        else if (url.pathname.includes('/auth/v1/token')) body = session;
        else if (url.pathname.startsWith('/storage/v1/object/certificates/')) {
          uploads++;
          assert.equal(req.headers()['x-upsert'], 'false');
          if (mode === 'timeout') return; // Real AbortController must release the submit UI.
          status = mode === 'denied' ? 403 : 200;
          body = mode === 'denied' ? { statusCode: 403, error: 'Unauthorized', message: 'JWT expired' } :
            { Id: 'local-storage-id', Key: url.pathname.split('/object/')[1] };
        } else if (url.pathname.includes('/rest/v1/users')) body = profile;
        else if (url.pathname.includes('/rest/v1/organizations')) body = [
          { id: schoolId, name: 'Trường kiểm thử', org_type: 'school', kyc_status: 'verified',
            domain: 'school.example.test', owner_user_id: 'reviewer', is_demo: false },
          { id: 'company-1', name: 'Công ty A', org_type: 'company', kyc_status: 'verified',
            domain: 'company.example.test', is_demo: false },
        ];
        else if (url.pathname.includes('/rest/v1/certificates') && method === 'POST') {
          certificates++;
          body = { ...req.postDataJSON()[0], id: certificateId };
          assert.equal(body.student_id, owner);
          assert.equal(body.org_id, schoolId);
          assert.equal(body.org_type, 'school');
        } else if (url.pathname.includes('/rest/v1/evidence_documents') && method === 'POST') {
          body = { ...req.postDataJSON()[0], id: 'evidence-1' };
          assert.equal(body.certificate_id, certificateId);
        } else if (url.pathname.includes('/rest/v1/notifications') && method === 'POST') {
          return; // A stalled notification must NOT delay successful certificate submission.
        }
        if (Array.isArray(body) && req.headers().accept?.includes('vnd.pgrst.object+json')) body = body[0] || null;
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body),
          headers: { 'access-control-allow-origin': '*' } });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      try {
        await page.goto(`${base}/school`);
        await page.getByText('Tìm trường đại học, cao đẳng đã hợp tác', { exact: true }).click();
        assert.equal(await page.getByText('Công ty A', { exact: true }).count(), 0);
        await page.getByText('Trường kiểm thử', { exact: true }).click();
        const chooser = page.waitForEvent('filechooser');
        await page.getByRole('button', { name: /Tải minh chứng sinh viên/ }).click();
        await (await chooser).setFiles({ name: 'proof.png', mimeType: 'image/png', buffer: png });
        await page.getByText('proof.png', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Gửi xác nhận', exact: true }).click();
        if (mode === 'success') {
          await page.getByText('Đã gửi xác nhận sinh viên', { exact: true }).waitFor();
          assert.equal(certificates, 1);
        } else {
          await page.getByText('Chưa thể gửi hồ sơ', { exact: true }).waitFor();
          assert.equal(await page.getByRole('button', { name: 'Gửi xác nhận', exact: true }).isEnabled(), true);
          assert.equal(await page.getByText('proof.png', { exact: true }).count(), 1);
          assert.equal(certificates, 0);
        }
        assert.equal(uploads, 1);
        console.log(`PASS UI school submission: ${mode}`);
      } catch (error) {
        console.error('LOCAL UI STATE:', await page.locator('body').innerText());
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
