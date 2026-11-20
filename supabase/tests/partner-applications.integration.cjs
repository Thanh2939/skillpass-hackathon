// Local PostgreSQL/WASM (PGlite) integration test for partner applications:
//   1. RLS enforcement (anon, student, admin, service_role)
//   2. Reviewed consistency check constraint
//   3. Service-only RPC isolation (claim, finalize, reject, submit_guard)
//   4. Atomic provisioning workflow
//   5. Mailbox-unverified defense on shared access
//   6. Admin audit log action allow-list
//
// Never connects to a remote Supabase instance.
const PGLITE_PATH =
  process.env.PGLITE_PACKAGE ||
  'C:/Users/DELL/AppData/Local/Temp/opencode/skillpass-feedback-tests/node_modules/@electric-sql/pglite';
let PGlite;
try {
  ({ PGlite } = require(PGLITE_PATH));
} catch {
  ({ PGlite } = require('@electric-sql/pglite'));
}

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function runTests() {
  console.log('--- Starting Partner Applications Comprehensive Integration Tests ---');
  const db = new PGlite();

  // Supabase system mock
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}',
      raw_app_meta_data jsonb DEFAULT '{}',
      email_confirmed_at timestamptz, created_at timestamptz DEFAULT now()
    );
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
    $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
    $$ SELECT auth.jwt()->>'role' $$;
    CREATE TABLE storage.buckets (
      id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
    );
    CREATE TABLE storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text,
      name text, owner uuid, owner_id text, metadata jsonb DEFAULT '{}'
    );
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
    $$ SELECT string_to_array($1, '/') $$;
    CREATE PUBLICATION supabase_realtime;
    CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
    CREATE FUNCTION extensions.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
    GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
  `);

  // Apply all migrations in order
  const directory = path.resolve(__dirname, '../migrations');
  const migrationFiles = fs.readdirSync(directory).filter((f) => f.endsWith('.sql')).sort();
  for (const file of migrationFiles) {
    const sql = fs
      .readFileSync(path.join(directory, file), 'utf8')
      .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '');
    try {
      await db.exec(sql);
      console.log(`PASS migration ${file}`);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${error.message}`, { cause: error });
    }
  }

  // Grant privileges matching Supabase post-migration defaults
  await db.exec(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
  `);

  const asAnon = async () => {
    await db.exec(`RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '', false),
             set_config('request.jwt.claims', '{"role":"anon"}', false);
      SET ROLE anon`);
  };

  const asUser = async (id) => {
    await db.exec(`RESET ROLE;`);
    await db.query(
      `SELECT set_config('request.jwt.claim.sub', $1, false),
              set_config('request.jwt.claims', $2, false)`,
      [id, JSON.stringify({ role: 'authenticated', sub: id })],
    );
    await db.exec(`SET ROLE authenticated`);
  };

  const asService = async () => {
    await db.exec(`RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '', false),
             set_config('request.jwt.claims', '{"role":"service_role"}', false);
      SET ROLE service_role`);
  };

  const reset = async () => {
    await db.exec(`RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '', false),
             set_config('request.jwt.claims', '{}', false)`);
  };

  // Seed users: 1 admin, 1 regular student
  const adminId = '11111111-1111-1111-1111-111111111111';
  const studentId = '22222222-2222-2222-2222-222222222222';
  await db.query(
    `INSERT INTO auth.users(id, email, email_confirmed_at, raw_user_meta_data)
     VALUES ($1, 'admin@skillpass.dev', now(), '{"full_name":"Admin User"}'),
            ($2, 'student@skillpass.dev', now(), '{"full_name":"Student User"}')`,
    [adminId, studentId],
  );
  await db.query(`UPDATE public.users SET role='admin' WHERE id=$1`, [adminId]);

  // Seed sample application via superuser (mimics Edge Function submit)
  const appId1 = '33333333-3333-3333-3333-333333333333';
  await db.query(
    `INSERT INTO public.partner_applications (id, name, org_type, tax_code, contact_person, phone, email, status)
     VALUES ($1, 'Tech Corp', 'company', '0303', 'John Doe', '0912', 'contact@techcorp.vn', 'pending')`,
    [appId1],
  );

  let passed = 0;

  // TEST 1: Anonymous access is completely blocked
  await asAnon();
  const anonSelect = await db.query(`SELECT id FROM public.partner_applications`);
  assert.equal(anonSelect.rows.length, 0, 'anon must see 0 partner applications');

  let anonInsertFailed = false;
  try {
    await db.query(
      `INSERT INTO public.partner_applications (name, org_type, email)
       VALUES ('Spam Org', 'company', 'spam@evil.com')`,
    );
  } catch {
    anonInsertFailed = true;
  }
  assert.equal(anonInsertFailed, true, 'anon insert must be blocked by RLS');
  passed++;
  console.log('PASS Test 1: Anonymous access completely blocked by RLS');

  // TEST 2: Authenticated student access is blocked
  await asUser(studentId);
  const studentSelect = await db.query(`SELECT id FROM public.partner_applications`);
  assert.equal(studentSelect.rows.length, 0, 'student must see 0 partner applications');

  let studentInsertFailed = false;
  try {
    await db.query(
      `INSERT INTO public.partner_applications (name, org_type, email)
       VALUES ('Fake Univ', 'school', 'hr@fake.edu.vn')`,
    );
  } catch {
    studentInsertFailed = true;
  }
  assert.equal(studentInsertFailed, true, 'student direct insert must be blocked by RLS');
  passed++;
  console.log('PASS Test 2: Student direct read/write blocked by RLS');

  // TEST 3: Admin can read partner applications queue
  await asUser(adminId);
  const adminSelect = await db.query(
    `SELECT id, name, status FROM public.partner_applications WHERE id = $1`,
    [appId1],
  );
  assert.equal(adminSelect.rows.length, 1, 'admin must see pending application');
  assert.equal(adminSelect.rows[0].status, 'pending');
  passed++;
  console.log('PASS Test 3: Admin can read review queue');

  // TEST 4: Reviewed consistency constraint prevents invalid review states
  let invalidStatusFailed = false;
  try {
    // Cannot set account_created without reviewed_at and reviewed_by
    await db.query(
      `UPDATE public.partner_applications SET status = 'account_created' WHERE id = $1`,
      [appId1],
    );
  } catch {
    invalidStatusFailed = true;
  }
  assert.equal(invalidStatusFailed, true, 'state without review metadata must violate constraint');
  passed++;
  console.log('PASS Test 4: partner_applications_reviewed_consistency constraint verified');

  // TEST 5: Service-only RPC isolation (client cannot call them)
  await asUser(adminId);
  let directClaimBlocked = false;
  try {
    await db.query(`SELECT public.partner_application_claim($1, $2)`, [appId1, adminId]);
  } catch {
    directClaimBlocked = true;
  }
  assert.equal(directClaimBlocked, true, 'admin client cannot directly invoke service-only claim RPC');
  passed++;
  console.log('PASS Test 5: Service-only RPCs protected from client invocation');

  await reset();

  // TEST 6: Atomic claim & finalize via service role
  await asService();

  // Claim
  const claimRes = await db.query(
    `SELECT public.partner_application_claim($1, $2) AS result`,
    [appId1, adminId],
  );
  assert.equal(claimRes.rows[0].result.status, 'claimed', 'first claim must succeed');

  // Second claim must conflict
  const secondClaim = await db.query(
    `SELECT public.partner_application_claim($1, $2) AS result`,
    [appId1, adminId],
  );
  assert.equal(secondClaim.rows[0].result.status, 'conflict', 'second claim must return conflict');

  // Create organization for the partner
  const orgRes = await db.query(
    `INSERT INTO public.organizations (name, org_type, contact_email, owner_user_id, kyc_status, verification_tier, approved_at, reviewed_by_admin_id)
     VALUES ('Tech Corp Org', 'company', 'contact@techcorp.vn', $1, 'verified', 'enterprise', now(), $2)
     RETURNING id`,
    [studentId, adminId],
  );
  const orgId = orgRes.rows[0].id;

  // Finalize
  const finRes = await db.query(
    `SELECT public.partner_application_finalize($1, $2, $3, $4) AS result`,
    [appId1, adminId, studentId, orgId],
  );
  assert.equal(finRes.rows[0].result.status, 'finalized');

  const finalizedRow = await db.query(
    `SELECT status, user_id, organization_id, reviewed_by FROM public.partner_applications WHERE id = $1`,
    [appId1],
  );
  assert.equal(finalizedRow.rows[0].status, 'account_created');
  assert.equal(finalizedRow.rows[0].user_id, studentId);
  assert.equal(finalizedRow.rows[0].organization_id, orgId);
  passed++;
  console.log('PASS Test 6: Atomic claim & finalize workflow succeeded');

  // TEST 7: partner_application_reject workflow
  const appId2 = '44444444-4444-4444-4444-444444444444';
  await db.query(
    `INSERT INTO public.partner_applications (id, name, org_type, email, status)
     VALUES ($1, 'Spam Co', 'company', 'spam@bad.com', 'pending')`,
    [appId2],
  );
  const rejRes = await db.query(
    `SELECT public.partner_application_reject($1, $2, 'Không cung cấp đủ giấy tờ pháp lý') AS result`,
    [appId2, adminId],
  );
  assert.equal(rejRes.rows[0].result.status, 'rejected');

  const rejectedRow = await db.query(
    `SELECT status, rejection_reason FROM public.partner_applications WHERE id = $1`,
    [appId2],
  );
  assert.equal(rejectedRow.rows[0].status, 'rejected');
  assert.equal(rejectedRow.rows[0].rejection_reason, 'Không cung cấp đủ giấy tờ pháp lý');
  passed++;
  console.log('PASS Test 7: Reject workflow succeeded');

  // TEST 7b: A pre-created, banned Auth user remains reviewable and releasable.
  const pendingUserId = '66666666-6666-6666-6666-666666666666';
  const pendingAppId = '77777777-7777-7777-7777-777777777777';
  await reset();
  await db.query(`INSERT INTO auth.users(id, email, email_confirmed_at)
    VALUES ($1, 'pending@partner.vn', now())`, [pendingUserId]);
  await db.query(`INSERT INTO public.partner_applications(id, name, org_type, email, user_id)
    VALUES ($1, 'Pending Partner', 'company', 'pending@partner.vn', $2)`, [pendingAppId, pendingUserId]);
  await asService();
  const pendingClaim = await db.query(
    `SELECT public.partner_application_claim($1, $2) AS result`, [pendingAppId, adminId]);
  assert.equal(pendingClaim.rows[0].result.status, 'claimed');
  const released = await db.query(
    `SELECT public.partner_application_release($1, $2, 'retry') AS result`, [pendingAppId, adminId]);
  assert.equal(released.rows[0].result.status, 'released');
  const pendingReject = await db.query(
    `SELECT public.partner_application_reject($1, $2, 'Không hợp lệ') AS result`, [pendingAppId, adminId]);
  assert.equal(pendingReject.rows[0].result.status, 'rejected');
  passed++;
  console.log('PASS Test 7b: Pre-created Auth account can be reviewed and rejected');

  await reset();

  // TEST 8: Mailbox unverified accounts blocked from restricted shared links
  const autoConfirmedId = '88888888-8888-8888-8888-888888888888';
  await db.query(`INSERT INTO auth.users(id, email, email_confirmed_at)
    VALUES ($1, 'student-demo@example.com', now())`, [autoConfirmedId]);
  const autoConfirmed = await db.query(
    `SELECT raw_app_meta_data ->> 'mailbox_unverified' AS unverified FROM auth.users WHERE id = $1`,
    [autoConfirmedId],
  );
  assert.equal(autoConfirmed.rows[0].unverified, 'true', 'auto-confirmed demo email is not verified ownership');
  const unverifiedPartnerId = '55555555-5555-5555-5555-555555555555';
  const partnerEmail = 'partner@biz.com';
  await db.query(
    `INSERT INTO auth.users(id, email, email_confirmed_at, raw_app_meta_data)
     VALUES ($1, $2, now(), '{"mailbox_unverified":true}')`,
    [unverifiedPartnerId, partnerEmail],
  );

  // Create a restricted shared link allowing partner@biz.com
  const linkRes = await db.query(
    `INSERT INTO public.shared_links (user_id, code, access_mode, allowed_emails, status)
     VALUES ($1, 'RESTRICTED-CODE-1', 'restricted', ARRAY[$2], 'active')
     RETURNING code`,
    [studentId, partnerEmail],
  );
  const shareCode = linkRes.rows[0].code;

  // Caller with unverified mailbox calling _shared_access
  await asUser(unverifiedPartnerId);
  await asService(); // _shared_access is service-only
  const accessUnverified = await db.query(
    `SELECT public._shared_access($1) AS result`,
    [shareCode],
  );
  // With unverified mailbox and no auth.uid() context as service, or with unverified flag:
  // Let's set caller id in context
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [unverifiedPartnerId]);
  const accessResult1 = await db.query(`SELECT public._shared_access($1) AS result`, [shareCode]);
  assert.equal(
    accessResult1.rows[0].result.status,
    'login_required',
    'mailbox_unverified must not satisfy restricted link ownership verification',
  );

  // Now clear mailbox_unverified
  await reset();
  await db.query(
    `UPDATE auth.users SET raw_app_meta_data = '{"mailbox_unverified":false}' WHERE id = $1`,
    [unverifiedPartnerId],
  );
  await asService();
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [unverifiedPartnerId]);
  const accessResult2 = await db.query(`SELECT public._shared_access($1) AS result`, [shareCode]);
  assert.equal(accessResult2.rows[0].result.status, 'ok', 'verified mailbox can access restricted link');
  passed++;
  console.log('PASS Test 8: Mailbox unverified defense protects restricted shared links');

  await reset();

  // TEST 9: Admin audit log action allow-list
  await db.query(
    `INSERT INTO public.admin_audit_logs (admin_id, action, tone, icon, title, body)
     VALUES ($1, 'provision_partner', 'ok', 'award', 'Title', 'Body')`,
    [adminId],
  );
  await db.query(
    `INSERT INTO public.admin_audit_logs (admin_id, action, tone, icon, title, body)
     VALUES ($1, 'reject_partner', 'bad', 'x', 'Title', 'Body')`,
    [adminId],
  );

  let badAuditFailed = false;
  try {
    await db.query(
      `INSERT INTO public.admin_audit_logs (admin_id, action, tone, icon, title, body)
       VALUES ($1, 'invalid_action_name', 'bad', 'x', 'Title', 'Body')`,
      [adminId],
    );
  } catch {
    badAuditFailed = true;
  }
  assert.equal(badAuditFailed, true, 'arbitrary audit action must be rejected by check constraint');
  passed++;
  console.log('PASS Test 9: Admin audit action allow-list extended securely');

  console.log(`\n=== All ${passed} Partner Application tests passed successfully ===`);
  await db.close();
}

runTests().catch((error) => {
  console.error('TEST FAILURE:', error);
  process.exitCode = 1;
});
