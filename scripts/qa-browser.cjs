// Local QA helper. Screenshots and browser profiles stay in ignored .expo/qa.
const fs = require('node:fs');
const path = require('node:path');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function connect() {
  const tabs = await (await fetch('http://127.0.0.1:9430/json/list')).json();
  const tab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const calls = new Map(), errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && calls.has(m.id)) { calls.get(m.id)(m); calls.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
  };
  const call = async (method, params = {}) => {
    const result = await new Promise(resolve => { calls.set(++id, resolve); ws.send(JSON.stringify({ id, method, params })); });
    if (result.error) throw Error(JSON.stringify(result.error));
    return result.result;
  };
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const wait = async expression => {
    for (let n = 0; n < 80; n++) { if (await evaluate(expression)) return; await pause(250); }
    throw Error('Timed out: ' + expression);
  };
  const open = async (route, condition = 'document.body?.innerText.length > 80') => {
    await call('Page.navigate', { url: (process.env.QA_ORIGIN || 'https://skillpass-app-sooty.vercel.app') + route });
    await wait(condition); await pause(600);
  };
  const click = async text => {
    const done = await evaluate(`(() => {const e = [...document.querySelectorAll('div,span,button,a')].reverse().find(e => e.textContent.trim() === ${JSON.stringify(text)}); if (!e) return false; e.click(); return true;})()`);
    if (!done) throw Error('Missing control: ' + text);
    await pause(300);
  };
  const input = async (selector, value) => {
    await evaluate(`(() => {const e = document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await pause(150);
  };
  const screenshot = async name => {
    await evaluate('document.fonts.ready.then(() => true)');
    const {data} = await call('Page.captureScreenshot', { format: 'png' });
    const file = path.resolve('.expo/qa', name + '.png'); fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, Buffer.from(data,'base64')); return file;
  };
  const upload = async (buttonText, files) => {
    await evaluate(`(() => {
      const files = ${JSON.stringify(files)};
      const handler = e => {
        const input = e.target;
        if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
        e.preventDefault(); document.removeEventListener('click', handler, true);
        const dt = new DataTransfer();
        for (const file of files) {
          const bytes = Uint8Array.from(atob(file.data.split(',').pop()), c => c.charCodeAt(0));
          dt.items.add(new File([bytes], file.name, {type: file.type || 'image/png'}));
        }
        input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles:true}));
      };
      document.addEventListener('click', handler, true);
    })()`);
    await click(buttonText); await pause(700);
  };
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  return { call, evaluate, wait, open, click, input, screenshot, upload, pause, errors, close: () => ws.close() };
}
module.exports = { connect };
