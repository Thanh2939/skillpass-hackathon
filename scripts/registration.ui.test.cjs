// Local PWA only. Intercept all Supabase requests; never creates accounts or sends email.
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE ||
  'C:/Users/DELL/AppData/Local/Temp/opencode/skillpass-feedback-tests/node_modules/playwright-core');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.FEEDBACK_BASE_URL || 'http://127.0.0.1:8084';

async function main() {
  let server;
  let browser;
  try {
    if (!process.env.FEEDBACK_BASE_URL) {
      server = spawn(process.execPath, [path.join(__dirname, 'serve-feedback-test.cjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
      await new Promise((resolve, reject) => {
        server.stdout.once('data', resolve);
        server.once('error', reject);
        server.once('exit', code => reject(new Error(`Local server exited: ${code}`)));
      });
    }
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
    for (const portal of ['student', 'business']) {
      for (const mode of portal === 'student' ? ['quota', 'confirmation', 'duplicate'] : ['success']) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        let signupCalls = 0;
        let loginCalls = 0;
        await context.routeWebSocket(/supabase\.co/, socket => socket.close());
        await context.route(/https:\/\/[^/]+\.supabase\.co\/.*/, async route => {
          const url = new URL(route.request().url());
          let status = 200;
          let response = [];
          if (url.pathname.includes('/functions/v1/partner-applications')) {
            signupCalls++;
            const request = route.request().postDataJSON();
            assert.equal(request.action, 'submit');
            assert.equal(request.payload.email, 'signup@example.test');
            response = { ok: true };
          } else if (url.pathname.includes('/auth/v1/signup')) {
            signupCalls++;
            const payload = route.request().postDataJSON();
            assert.equal(payload.email, 'signup@example.test');
            assert.equal(payload.data.role, portal);
            status = mode === 'quota' ? 429 : 200;
            response = mode === 'quota'
              ? { code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }
              : { id: '10000000-0000-4000-8000-000000000001', email: payload.email,
                role: 'authenticated', aud: 'authenticated', user_metadata: payload.data,
                identities: mode === 'duplicate' ? [] : [{ id: 'local-test-identity' }] };
          } else if (url.pathname.includes('/auth/v1/token')) {
            loginCalls++;
            status = 400;
            response = { code: 'email_not_confirmed', msg: 'Email not confirmed' };
          }
          await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(response),
            headers: { 'access-control-allow-origin': '*' } });
        });
        const page = await context.newPage();
        page.setDefaultTimeout(12000);
        try {
          await page.goto(`${base}${portal === 'student' ? '/register' : '/biz/register'}`);
          if (portal === 'student') {
            await page.getByPlaceholder('Ví dụ: Trần Văn An', { exact: true }).fill('Sinh viên kiểm thử');
            await page.getByPlaceholder('Ví dụ: 22520123', { exact: true }).fill('TEST01');
            await page.getByPlaceholder('ten@gmail.com hoặc email sinh viên', { exact: true }).fill('signup@example.test');
            await page.getByPlaceholder('Nhập lại mật khẩu', { exact: true }).fill('local-test-password1');
          } else {
            await page.getByPlaceholder('Ví dụ: Công ty Công nghệ Mẫu C', { exact: true }).fill('Đối tác kiểm thử');
            await page.getByPlaceholder('hr@congty.vn hoặc daotao@truong.edu.vn', { exact: true }).fill('signup@example.test');
          }
          const passwordField = page.getByPlaceholder(
            portal === 'student' ? 'Tối thiểu 6 ký tự' : 'Ít nhất 10 ký tự, gồm chữ và số',
            { exact: true },
          );
          await passwordField.fill('local-test-password1');
          const button = page.getByRole('button', { name: portal === 'student' ? 'Tạo tài khoản' : 'Gửi hồ sơ đăng ký tới Admin', exact: true });
          await button.waitFor();
          await button.evaluate(element => { element.click(); element.click(); });
          if (portal === 'business') {
            await page.getByText('Đã gửi hồ sơ tới Admin', { exact: true }).waitFor();
          } else if (mode === 'confirmation') {
            await page.getByText('Kiểm tra hộp thư', { exact: true }).waitFor();
            assert.equal(await page.getByText(/Spam\/Thư rác/).count() > 0, true);
          } else if (mode === 'quota') {
            await page.getByText('Chưa gửi được email xác nhận', { exact: true }).waitFor();
            assert.equal(await page.getByText(/SMTP riêng/).count() > 0, true);
            assert.equal(await button.isEnabled(), true);
            assert.equal(await passwordField.inputValue(), 'local-test-password1');
          } else {
            await page.getByText(/Email này đã được đăng ký/).waitFor();
            assert.equal(await button.isEnabled(), true);
          }
          assert.equal(new URL(page.url()).pathname, portal === 'student' ? '/register' : '/biz/register');
          assert.equal(signupCalls, 1, 'two clicks must not create two requests');
          assert.equal(loginCalls, 0, 'no automatic login before email confirmation');
          console.log(`PASS UI registration ${portal}: ${mode}`);
        } catch (error) {
          console.error('LOCAL REGISTRATION UI:', await page.locator('body').innerText());
          throw error;
        } finally { await context.close(); }
      }
    }
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
