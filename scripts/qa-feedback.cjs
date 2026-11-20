// Browser regression checks. Requires Chrome on port 9430 (see qa-browser.cjs).
// Credentials are supplied through QA_STUDENT_EMAIL/PASSWORD and QA_BIZ_EMAIL/PASSWORD.
// This suite only reads records; file selection is cancelled and never submitted.
const fs = require('node:fs');
const QRCode = require('qrcode');
const { connect } = require('./qa-browser.cjs');

(async () => {
  const b = await connect();
  const results = [];
  const run = async (name, task) => {
    try { await task(); results.push({ name, pass: true }); }
    catch (e) { results.push({ name, pass: false, error: e.message }); }
    console.log(JSON.stringify(results.at(-1)));
  };
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const has = text => b.evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`);
  const login = async biz => {
    await b.open(biz ? '/biz/login' : '/login', `!!document.querySelector('input[type=password]')`);
    await b.input('input[type=email]', process.env[biz ? 'QA_BIZ_EMAIL' : 'QA_STUDENT_EMAIL']);
    await b.input('input[type=password]', process.env[biz ? 'QA_BIZ_PASSWORD' : 'QA_STUDENT_PASSWORD']);
    await b.click(biz ? 'Đăng nhập Doanh nghiệp' : 'Đăng nhập');
    await b.wait(`location.pathname === '${biz ? '/biz' : '/home'}'`);
  };
  try {
    await run('business login rejects student without keeping a session', async () => {
      await b.open('/biz/login', `!!document.querySelector('input[type=password]')`);
      await b.input('input[type=email]', process.env.QA_STUDENT_EMAIL);
      await b.input('input[type=password]', process.env.QA_STUDENT_PASSWORD);
      await b.click('Đăng nhập Doanh nghiệp');
      await b.wait(`document.body.innerText.includes('Vui lòng đăng nhập tại cổng sinh viên')`);
      assert(await b.evaluate(`location.pathname === '/biz/login' && !Object.keys(localStorage).some(k => k.endsWith('-auth-token'))`), 'Wrong portal retained a session or redirected');
    });
    for (const route of ['/login', '/biz/login', '/register', '/biz/register']) {
      await run('password visibility ' + route, async () => {
        await b.open(route, `!!document.querySelector('input[type=password]')`);
        await b.evaluate(`document.querySelector('[aria-label="Hiện mật khẩu"]').click()`);
        await b.pause(100);
        assert(await b.evaluate(`!!document.querySelector('[aria-label="Ẩn mật khẩu"]')`), 'Password not shown');
        await b.evaluate(`document.querySelector('[aria-label="Ẩn mật khẩu"]').click()`);
        await b.pause(100);
        assert(await b.evaluate(`!!document.querySelector('input[type=password]')`), 'Password not hidden');
      });
    }
    await run('welcome rotates continuously', async () => {
      await b.open('/', `document.body.innerText.includes('Chào mừng bạn')`);
      assert(await b.evaluate(`(async()=>{const e=document.querySelector('circle[stroke-dasharray]')?.closest('svg')?.parentElement;if(!e)return false;const first=getComputedStyle(e).transform;await new Promise(r=>setTimeout(r,350));return first!==getComputedStyle(e).transform})()`), 'Orbit is static');
    });
    await run('QR empty, invalid, placeholder and image errors', async () => {
      await b.open('/scan', `!!document.querySelector('input')`);
      await b.click('Kiểm tra'); assert(await has('Vui lòng nhập mã hồ sơ ứng viên'), 'Missing empty validation');
      await b.input('input', 'WRONG'); await b.click('Kiểm tra');
      assert(await has('Mã SkillPass không hợp lệ'), 'Missing invalid validation');
      assert(await b.evaluate(`!document.querySelector('input').placeholder`), 'Placeholder overlaps text');
      const blank = await QRCode.toDataURL('This is not a SkillPass code');
      await b.upload('Chọn ảnh QR', [{name:'unrelated-qr.png',data:blank}]);
      await b.wait(`document.body.innerText.includes('Mã SkillPass không hợp lệ')`);
      const nonQr = JSON.parse(fs.readFileSync('.expo/qa/evidence.json'));
      await b.upload('Chọn ảnh QR', [nonQr]);
      await b.wait(`document.body.innerText.includes('Không tìm thấy mã QR hợp lệ')`);
      assert(await b.evaluate(`!document.querySelector('#qr-reader-container img')`), 'Uploaded photo covers scanner');
    });
    await run('QR image navigates to real shared profile', async () => {
      await b.open('/scan', `document.body.innerText.includes('Chọn ảnh QR')`);
      const code = process.env.QA_SHARE_CODE || 'SP-59OO0Q';
      const data = await QRCode.toDataURL('https://skillpass-app-sooty.vercel.app/verify/' + code, {width:512});
      await b.upload('Chọn ảnh QR', [{name:'valid-qr.png',data}]);
      await b.wait(`location.pathname === '/verify/${code}'`);
      await b.wait(`document.body.innerText.includes('Văn bằng & Chứng chỉ') || document.body.innerText.includes('Liên kết đã bị thu hồi')`);
    });
    if (process.env.QA_STUDENT_EMAIL) {
      await run('student pending list and detail after refresh', async () => {
        await login(false);
        await b.open('/pending', `document.body.innerText.includes('QA 15 feedback')`);
        assert(!await has('Bằng tài khoản a'), 'Approved certificate leaked into pending');
        await b.click('QA 15 feedback - kiểm thử tài liệu');
        await b.wait(`document.body.innerText.includes('Đang chờ duyệt')`);
        const route = await b.evaluate('location.pathname');
        await b.open(route, `document.body.innerText.includes('QA-minh-chung-2.png')`);
      });
      await run('complete transaction hash stays inside viewport', async () => {
        await b.open('/cert/cert_1794374330409', `document.body.innerText.includes('Mã chứng thực số')`);
        const hash = '0x2d71da8970d4682a8b30e278bd16ec717c8f09e37761017a8e50a81fa6878cda';
        assert(await has(hash), 'Hash was truncated');
        assert(await b.evaluate(`(()=>{const e=[...document.querySelectorAll('div')].find(e=>e.childElementCount===0&&e.textContent===${JSON.stringify(hash)});const r=e?.getBoundingClientRect();return r&&r.width<=innerWidth&&r.right<=innerWidth&&r.left>=0})()`), 'Hash overflows viewport');
        await b.screenshot('regression-hash');
      });
      await run('avatar dialog cancel and student logout', async () => {
        await b.open('/profile', `!!document.querySelector('[aria-label="Đổi ảnh đại diện"]')`);
        await b.evaluate(`document.querySelector('[aria-label="Đổi ảnh đại diện"]').click()`);
        await b.wait(`document.body.innerText.includes('Chọn ảnh từ thư viện')`);
        await b.click('Hủy'); await b.click('Đăng xuất');
        await b.wait(`location.pathname === '/login'`);
      });
    }
    if (process.env.QA_BIZ_EMAIL) {
      await run('business pending navigation, documents, activity', async () => {
        await login(true); await b.wait(`document.body.innerText.includes('QA 15 feedback')`);
        await b.click('QA 15 feedback - kiểm thử tài liệu');
        await b.wait(`document.body.innerText.includes('QA-minh-chung-2.png')`);
        await b.click('Xem ảnh'); await b.pause(400);
        assert(await b.evaluate(`[...document.querySelectorAll('img')].some(e=>e.complete&&e.naturalWidth===480)`), 'Evidence image failed');
        await b.open('/biz/notif', `document.body.innerText.includes('Xem chi tiết')`);
        const count = await b.evaluate(`document.body.innerText.split('Xem chi tiết').length`);
        await b.click('Xem chi tiết');
        assert(await b.evaluate(`document.body.innerText.split('Xem chi tiết').length < ${count}`), 'Activity did not expand');
        await b.open('/biz/profile', `document.body.innerText.includes('Công ty Mẫu A')`);
        assert(await b.evaluate(`!!document.querySelector('[aria-label="Đổi ảnh đại diện"]')`), 'Business avatar not editable');
        await b.click('Đăng xuất');
      });
    }
    for (const [width,height] of [[320,568],[390,844],[1440,900]]) {
      await run(`responsive scan ${width}x${height}`, async () => {
        await b.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<520});
        await b.open('/scan', `document.body.innerText.includes('Kiểm tra')`);
        await b.input('input','WRONG'); await b.click('Kiểm tra');
        assert(await b.evaluate(`document.documentElement.scrollWidth <= innerWidth`), 'Page overflows horizontally');
        assert(await b.evaluate(`(()=>{const e=[...document.querySelectorAll('[role="button"]')].find(e=>e.textContent.includes('Kiểm tra'));const r=e?.getBoundingClientRect();return r&&r.right<=innerWidth&&r.left>=0})()`), 'Check button is clipped');
        await b.screenshot(`regression-scan-${width}`);
      });
    }
    results.push({name:'browser runtime exceptions',pass:b.errors.length===0,errors:b.errors});
  } finally {
    b.close();
    fs.mkdirSync('.expo/qa',{recursive:true});
    fs.writeFileSync('.expo/qa/regression-results.json',JSON.stringify({origin:process.env.QA_ORIGIN||'production',at:new Date().toISOString(),results},null,2));
    console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length}));
    if (results.some(r=>!r.pass)) process.exitCode=1;
  }
})().catch(e=>{console.error(e.message);process.exitCode=1});
