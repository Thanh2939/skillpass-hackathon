const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const relayer = fs.readFileSync(path.join(root, 'supabase/functions/avalanche-relayer/index.ts'), 'utf8');
const client = fs.readFileSync(path.join(root, 'src/services/web3.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/store/AppContext.tsx'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261120145000_atomic_badge_issuance.sql'), 'utf8');

const keyPatternSource = relayer.match(/!\/(.+)\/.test\(envPk.trim\(\)\)/)?.[1];
if (!keyPatternSource) throw new Error('Private key validation pattern missing');
const keyPattern = new RegExp(keyPatternSource);
for (const value of ['a'.repeat(64), `0x${'a'.repeat(64)}`]) {
  if (!keyPattern.test(value)) throw new Error('Valid private key format rejected');
}
for (const value of ['', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), `0x${'a'.repeat(40)}`]) {
  if (keyPattern.test(value)) throw new Error('Invalid private key format accepted');
}

for (const expected of [
  'admin.auth.getUser(token)',
  'role !== "business"',
  'organization.kyc_status !== "verified"',
  'certificate.tx_hash',
]) {
  if (!relayer.includes(expected)) throw new Error(`Relayer security check missing: ${expected}`);
}
if (relayer.includes('action === "authorizeIssuer"')) throw new Error('Businesses must not receive per-organization on-chain wallets or issuer keys');
if (relayer.includes('skillpass-relayer-v1:') || relayer.includes('derivedPk')) {
  throw new Error('Relayer must fail closed instead of deriving a fallback wallet');
}
if (!relayer.includes('RELAYER_PRIVATE_KEY chưa được cấu hình hoặc không hợp lệ.')) {
  throw new Error('Relayer must reject a missing or invalid private key');
}
if (relayer.indexOf('const token = bearerToken(req)') > relayer.indexOf('const body = await req.json()')) {
  throw new Error('Relayer must reject unauthenticated requests before parsing the request body');
}
if (!client.includes('Authorization: `Bearer ${accessToken}`')) throw new Error('Client does not send the user JWT');
if (!client.includes('certificateId: string')) throw new Error('Relayer request is not tied to a certificate');
if (!app.includes('certificateId: targetId')) throw new Error('Approval flow does not send the certificate ID');
if (app.includes('supabaseService.approveCertificate(targetId')) {
  throw new Error('Client must not finalize a certificate after the relayer has already minted it');
}
for (const expected of [
  'badge-metadata',
  'badge_issuance_locks',
  'finalize_badge_issuance',
  'insert into public.badges',
]) {
  if (!relayer.includes(expected) && !migration.includes(expected)) {
    throw new Error(`Atomic issuance requirement missing: ${expected}`);
  }
}

console.log('Avalanche relayer security regression checks passed.');
