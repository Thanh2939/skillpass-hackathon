const { connect } = require('./qa-browser.cjs');
(async () => {
  const b = await connect();
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const login = async (email, password, path) => {
    await b.open('/login', '!!document.querySelector("input[type=password]")');
    await b.input('input[type=email]', email);
    await b.input('input[type=password]', password);
    await b.click('Đăng nhập');
    await b.wait(`location.pathname === '${path}'`);
  };
  const scrollableAction = async (label) => b.evaluate(`(() => {
    const button = [...document.querySelectorAll('div')].reverse().find(e => e.textContent.trim() === ${JSON.stringify(label)});
    if (!button) return false;
    let parent = button.parentElement;
    while (parent && !['auto','scroll'].includes(getComputedStyle(parent).overflowY)) parent = parent.parentElement;
    if (!parent) return false;
    parent.scrollTop = 0;
    const before = button.getBoundingClientRect().top;
    parent.scrollTop = parent.scrollHeight;
    return button.getBoundingClientRect().top < before;
  })()`);
  try {
    await b.open('/admin');
    await b.wait('location.pathname === "/login"');
    await login(process.env.QA_ADMIN_EMAIL, process.env.QA_ADMIN_PASSWORD, '/admin');
    await b.wait('document.body.innerText.includes("Đối tác đăng ký")');
    await b.screenshot('feedback-update-admin');
    await b.open('/admin/org/7d7fa2a4-f38e-4895-80b4-d57ec38f9e72');
    await b.wait('document.body.innerText.includes("Tạm khóa quyền đối tác")');
    assert(await scrollableAction('Tạm khóa quyền đối tác'), 'Admin action must scroll');
    await b.screenshot('feedback-update-admin-actions');
    await b.open('/admin/profile');
    await b.click('Đăng xuất Quản trị viên');
    await b.wait('location.pathname === "/login"');
    assert(await b.evaluate('!Object.keys(localStorage).some(k => k.endsWith("-auth-token"))'), 'Admin session not cleared');
    await login(process.env.QA_BIZ_EMAIL, process.env.QA_BIZ_PASSWORD, '/biz');
    await b.wait('document.body.innerText.includes("Đã từ chối")');
    await b.click('Đã từ chối');
    await b.screenshot('feedback-update-rejected');
    await b.open('/biz');
    await b.wait('document.body.innerText.includes("QA 15 feedback")');
    await b.evaluate(`(() => { const e=[...document.querySelectorAll('div')].reverse().find(e=>e.textContent.trim()==='QA 15 feedback - kiểm thử tài liệu'); e?.click(); })()`);
    await b.wait('location.pathname === "/biz/review"');
    await b.wait('document.body.innerText.includes("Phê duyệt chứng nhận")');
    assert(await scrollableAction('Phê duyệt chứng nhận'), 'Business action must scroll');
    await b.screenshot('feedback-update-business-actions');
    await b.open('/scan');
    await b.wait('document.body.innerText.includes("Chọn ảnh QR")');
    await b.call('Emulation.setDeviceMetricsOverride', {width:320,height:568,deviceScaleFactor:1,mobile:true});
    await b.pause(1000);
    await b.screenshot('feedback-update-scan-small');
    assert(b.errors.length === 0, b.errors.join('\n'));
    console.log('PASS: admin authentication, protected route, logout, queues, rejected filter, scrolling actions, small QR layout');
  } finally { b.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
