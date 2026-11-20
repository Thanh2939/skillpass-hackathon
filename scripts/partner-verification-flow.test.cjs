const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/partner-applications/index.ts'), 'utf8');
const pending = fs.readFileSync(path.join(root, 'mobile/src/screens/BizPendingScreen.tsx'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'mobile/src/screens/AdminHomeScreen.tsx'), 'utf8');

assert.match(edge, /kyc_status: "verified"/);
assert.match(edge, /approved_at: new Date\(\)\.toISOString\(\)/);
assert.doesNotMatch(edge, /kyc_status: "pending"/);

for (const label of ['Gửi xác minh', 'Chờ xác minh', 'Đã xác minh']) {
  assert.match(pending, new RegExp(label));
}
assert.match(admin, /account_created: \{ tone: 'ok', label: 'Đã xác minh' \}/);

console.log('PASS partner verification uses one three-step flow');
