// Headless local UI regression suite; all Supabase HTTP/WebSocket traffic is mocked.
// No production credentials, registrations, uploads, database writes or deployments.
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright-core');
const assert = require('node:assert/strict');
const base = process.env.FEEDBACK_BASE_URL || 'http://localhost:8082';
const executablePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const owner = '10000000-0000-4000-8000-000000000001';
const orgId = '20000000-0000-4000-8000-000000000001';
const certId = '30000000-0000-4000-8000-000000000001';
const certificate = { id: certId, student_id: owner, org_id: orgId, title: 'Chứng chỉ kiểm thử', org_name: 'Đơn vị kiểm thử', org_type: 'company', status: 'approved', auto_sync: false, student_name: 'Sinh viên kiểm thử', student_mssv: 'TEST01', issue_date_original: '12/03/2026', evidence_documents: [] };
const profile = { id: owner, full_name: 'Sinh viên kiểm thử', email: 'student@example.com', role: 'student', mssv: 'TEST01', school_name: 'Trường kiểm thử', avatar_url: null, wallet_address: null, share_code: 'SP-TEST', push_enabled: true, school_verified: false };
let passed = 0;

async function main() {
  const browser = await chromium.launch({ executablePath, headless: true });
  async function scenario(name, fn) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    let activeRole = 'student';
    await context.routeWebSocket(/supabase\.co/, (socket) => socket.close());
    await context.route(/https:\/\/[^/]+\.supabase\.co\/.*/, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      let response = [];
      let status = 200;
      if (url.pathname.includes('/auth/v1/token')) {
        const email = request.postDataJSON().email;
        activeRole = email.startsWith('admin') ? 'admin' : email.startsWith('business') ? 'business' : 'student';
        const user = { id: owner, email, role: 'authenticated', aud: 'authenticated', user_metadata: {}, email_confirmed_at: new Date().toISOString() };
        const claims = { sub: owner, email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 };
        response = { access_token: `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.test`, refresh_token: 'local-test-only', token_type: 'bearer', expires_in: 3600, user };
      } else if (url.pathname.includes('/auth/v1/logout')) response = {};
      else if (url.pathname.includes('/auth/v1/user')) response = { ...profile, role: 'authenticated', email_confirmed_at: new Date().toISOString() };
      else if (url.pathname.includes('/rpc/get_shared_profile')) {
        const code = request.postDataJSON().p_code;
        response = code === 'SP-PRIVATE' ? { status: 'login_required', access_mode: 'restricted' } : { status: 'ok', access_mode: 'public', profile, certificates: [certificate] };
      } else if (url.pathname.includes('/rpc/get_shared_certificate')) response = { status: 'ok', certificate };
      else if (url.pathname.includes('/functions/v1/shared-evidence-url')) response = { status: 'ok', avatar_url: null, evidence: [] };
      else if (url.pathname.includes('/functions/v1/avalanche-relayer')) response = { chainId: 43113, contractAddress: `0x${'1'.repeat(40)}`, relayer: `0x${'2'.repeat(40)}`, balance: '0', totalBadges: '0', blockNumber: 123 };
      else if (url.pathname.includes('/rest/v1/users')) response = { ...profile, role: activeRole, email: `${activeRole}@example.com` };
      else if (url.pathname.includes('/rest/v1/certificates')) response = [certificate];
      else if (url.pathname.includes('/rest/v1/organizations')) response = [{ id: orgId, name: 'Đơn vị kiểm thử', org_type: 'company', domain: 'example.com', verification_tier: 'enterprise', kyc_status: 'verified', owner_user_id: owner, contact_email: 'business@example.com', contact_person: 'Người kiểm thử', created_at: new Date().toISOString() }];
      else if (url.pathname.includes('/rest/v1/shared_links')) response = [];
      if (Array.isArray(response) && request.headers().accept?.includes('vnd.pgrst.object+json')) response = response[0] || null;
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(response), headers: { 'access-control-allow-origin': '*' } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    try { await fn(page); passed++; console.log(`PASS UI ${name}`); }
    catch (error) { console.error(`FAIL UI ${name}: ${error.message}`); throw error; }
    finally { await context.close(); }
  }
  try {
    await scenario('staff login separate, validates empty fields, one password reveal', async (page) => {
      await page.goto(`${base}/staff/login`);
      await page.getByRole('button', { name: 'Đăng nhập quản trị', exact: true }).click();
      await page.getByText('Vui lòng nhập email và mật khẩu do công ty cấp.').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Hiện mật khẩu', exact: true }).count(), 1);
      await page.getByRole('button', { name: 'Hiện mật khẩu', exact: true }).click();
      assert.equal(await page.locator('input[type=password]').count(), 0);
      assert.equal(await page.getByText('Đăng ký tài khoản mới', { exact: true }).count(), 0);
    });
    await scenario('anonymous admin route goes only to staff login', async (page) => {
      await page.goto(`${base}/admin`);
      await page.waitForURL('**/staff/login');
      await page.getByText('Đăng nhập nội bộ', { exact: true }).waitFor();
    });
    await scenario('customer login rejects staff identity', async (page) => {
      await page.goto(`${base}/biz/login`);
      await page.locator('input').first().fill('admin@example.com');
      await page.locator('input[type=password]').fill('local-test-password');
      await page.getByRole('button', { name: 'Đăng nhập Doanh nghiệp', exact: true }).click();
      await page.getByText('Tài khoản nhân viên phải đăng nhập tại cổng nội bộ SkillPass.').waitFor();
      assert.ok(!new URL(page.url()).pathname.startsWith('/admin'));
    });
    await scenario('calendar date can be selected and replaced', async (page) => {
      await page.goto(`${base}/submit`);
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      await page.getByRole('button', { name: 'Ngày cấp: chưa chọn', exact: true }).click();
      await page.getByRole('button', { name: `Ngày 1 tháng ${month} năm ${year}`, exact: true }).click();
      await page.getByRole('button', { name: `Ngày cấp: 01/${String(month).padStart(2, '0')}/${year}`, exact: true }).click();
      await page.getByRole('button', { name: `Ngày 2 tháng ${month} năm ${year}`, exact: true }).click();
      await page.getByRole('button', { name: `Ngày cấp: 02/${String(month).padStart(2, '0')}/${year}`, exact: true }).waitFor();
    });
    await scenario('QR creation offers public and restricted receiver choices', async (page) => {
      await page.goto(`${base}/qr?create=1`);
      await page.getByRole('button', { name: 'Chỉ người nhận được chỉ định', exact: true }).click();
      await page.getByPlaceholder('hr@congty.vn, reviewer@truong.edu.vn').fill('receiver@example.com');
      await page.getByText('Email người được xem', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Bất kỳ ai có link hoặc QR', exact: true }).click();
      assert.equal(await page.getByPlaceholder('hr@congty.vn, reviewer@truong.edu.vn').count(), 0);
    });
    await scenario('restricted shared link prompts recipient authentication', async (page) => {
      await page.goto(`${base}/verify/SP-PRIVATE`);
      await page.getByText('Liên kết chỉ dành cho người nhận', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Đăng nhập để xem hồ sơ', exact: true }).waitFor();
      assert.equal(await page.getByText('Chứng chỉ kiểm thử', { exact: true }).count(), 0);
    });
    await scenario('public certificate opens scoped detail and closes to shared result', async (page) => {
      await page.goto(`${base}/verify/SP-PUBLIC`);
      await page.getByText('Chứng chỉ kiểm thử', { exact: true }).click();
      await page.waitForURL('**/shared-cert/**');
      await page.getByText('Chưa có tài liệu', { exact: true }).waitFor();
      assert.equal(await page.getByText('Về ví', { exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Đóng chi tiết', exact: true }).click();
      await page.waitForURL('**/verify/SP-PUBLIC');
    });
    await scenario('staff system has full addresses, no demo shortcuts, logout goes to role chooser', async (page) => {
      await page.goto(`${base}/staff/login`);
      await page.locator('input').first().fill('admin@example.com');
      await page.locator('input[type=password]').fill('local-test-password');
      await page.getByRole('button', { name: 'Đăng nhập quản trị', exact: true }).click();
      await page.waitForURL('**/admin');
      await page.goto(`${base}/admin/profile`);
      await page.getByText(`0x${'1'.repeat(40)}`, { exact: true }).waitFor();
      await page.getByText(`0x${'2'.repeat(40)}`, { exact: true }).waitFor();
      assert.equal(await page.getByText(/Xem giao diện.*Demo/).count(), 0);
      await page.getByText(/Đăng xuất/).click();
      await page.waitForURL(`${base}/`);
      await page.getByText('Bạn dùng SkillPass với vai trò nào?').waitFor();
    });
    await scenario('business logout returns to role chooser, not student login', async (page) => {
      await page.goto(`${base}/biz/login`);
      await page.locator('input').first().fill('business@example.com');
      await page.locator('input[type=password]').fill('local-test-password');
      await page.getByRole('button', { name: 'Đăng nhập Doanh nghiệp', exact: true }).click();
      await page.waitForURL(`${base}/biz`);
      await page.goto(`${base}/biz/profile`);
      await page.getByText('Đăng xuất', { exact: true }).click();
      await page.waitForURL(`${base}/`);
      await page.getByText('Bạn dùng SkillPass với vai trò nào?').waitFor();
    });
    console.log(`PASS ${passed} local mobile-viewport UI scenarios (Supabase fully mocked)`);
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
