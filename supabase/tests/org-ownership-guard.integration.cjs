// Local PostgreSQL/WASM integration test for organization ownership and membership guard.
// Never connects to a remote Supabase instance.
const PGLITE_PATH = process.env.PGLITE_PACKAGE || 'C:/Users/DELL/AppData/Local/Temp/opencode/skillpass-feedback-tests/node_modules/@electric-sql/pglite';
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
  console.log('--- Starting Org Ownership & Membership Guard Integration Tests ---');
  const db = new PGlite();

  // Supabase system mock
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}',
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
    GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated;
  `);

  // Apply all migrations
  const directory = path.resolve(__dirname, '../migrations');
  const migrationFiles = fs.readdirSync(directory).filter((f) => f.endsWith('.sql')).sort();
  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(directory, file), 'utf8')
      .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '');
    try {
      await db.exec(sql);
      console.log(`PASS migration ${file}`);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${error.message}`, { cause: error });
    }
  }

  await db.exec(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
  `);

  const ownerA = '10000000-0000-4000-8000-000000000001';
  const ownerB = '10000000-0000-4000-8000-000000000002';
  const memberC = '10000000-0000-4000-8000-000000000003';
  const org1 = '20000000-0000-4000-8000-000000000001';
  const orgLead = '20000000-0000-4000-8000-000000000002';

  for (const [id, email] of [
    [ownerA, 'ownera@example.com'],
    [ownerB, 'ownerb@example.com'],
    [memberC, 'memberc@example.com'],
  ]) {
    await db.query(`INSERT INTO auth.users(id, email, email_confirmed_at) VALUES ($1, $2, now())`, [id, email]);
  }

  async function setCaller(userId, email = '') {
    await db.exec('RESET ROLE');
    if (userId) {
      await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
        [userId, JSON.stringify({ sub: userId, email, role: 'authenticated' })]);
      await db.exec('SET ROLE authenticated');
    } else {
      await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false),
        set_config('request.jwt.claims', '{"role":"anon"}', false)`);
      await db.exec('SET ROLE anon');
    }
  }

  let count = 0;

  // TEST 1: Register organization with ownerA (mimicking client payload)
  console.log('Test 1: Registering organization with ownerA');
  await setCaller(ownerA, 'ownera@example.com');
  await db.query(`
    INSERT INTO public.organizations (id, name, org_type, contact_email, owner_user_id, kyc_status, is_demo)
    VALUES ($1, 'Acme Corp', 'company', 'contact@acme.com', $2, 'pending', false)
  `, [org1, ownerA]);

  // Verify ownerA is automatically synced in organization_members with role='owner', status='active'
  const membersAfterCreate = await db.query(`
    SELECT user_id, member_role, status FROM public.organization_members WHERE org_id = $1
  `, [org1]);
  assert.equal(membersAfterCreate.rows.length, 1);
  assert.equal(membersAfterCreate.rows[0].user_id, ownerA);
  assert.equal(membersAfterCreate.rows[0].member_role, 'owner');
  assert.equal(membersAfterCreate.rows[0].status, 'active');
  count++;
  console.log('PASS Test 1: Canonical owner automatically inserted into organization_members');

  // TEST 2: Owner A attempts to manually insert memberC with member_role = 'owner' -> MUST FAIL
  console.log('Test 2: Owner A attempts to directly insert another member with role=owner');
  let insertOwnerFailed = false;
  try {
    await db.query(`
      INSERT INTO public.organization_members (org_id, user_id, member_role, status)
      VALUES ($1, $2, 'owner', 'active')
    `, [org1, memberC]);
  } catch (err) {
    insertOwnerFailed = true;
  }
  assert.equal(insertOwnerFailed, true, 'Direct insert of member_role="owner" must fail');
  count++;
  console.log('PASS Test 2: Direct insert of member_role="owner" successfully blocked');

  // TEST 3: Owner A inserts memberC as 'reviewer' -> MUST SUCCEED
  console.log('Test 3: Owner A inserts memberC with role=reviewer');
  await db.query(`
    INSERT INTO public.organization_members (org_id, user_id, member_role, status)
    VALUES ($1, $2, 'reviewer', 'active')
  `, [org1, memberC]);
  const membersWithReviewer = await db.query(`
    SELECT user_id, member_role, status FROM public.organization_members WHERE org_id = $1 ORDER BY user_id
  `, [org1]);
  assert.equal(membersWithReviewer.rows.length, 2);
  count++;
  console.log('PASS Test 3: Owner successfully added reviewer');

  // TEST 4: Owner A attempts to reclassify memberC to role='owner' -> MUST FAIL
  console.log('Test 4: Owner A attempts to reclassify memberC to role=owner');
  let updateToOwnerFailed = false;
  try {
    await db.query(`
      UPDATE public.organization_members
      SET member_role = 'owner'
      WHERE org_id = $1 AND user_id = $2
    `, [org1, memberC]);
  } catch (err) {
    updateToOwnerFailed = true;
  }
  assert.equal(updateToOwnerFailed, true, 'Reclassifying member to owner must fail');
  count++;
  console.log('PASS Test 4: Reclassifying member to owner successfully blocked');

  // TEST 5: Owner A attempts to directly modify canonical owner membership -> MUST FAIL
  console.log('Test 5: Owner A attempts to modify canonical owner membership');
  let updateCanonicalOwnerFailed = false;
  try {
    await db.query(`
      UPDATE public.organization_members
      SET member_role = 'reviewer'
      WHERE org_id = $1 AND user_id = $2
    `, [org1, ownerA]);
  } catch (err) {
    updateCanonicalOwnerFailed = true;
  }
  assert.equal(updateCanonicalOwnerFailed, true, 'Direct modification of canonical owner row must fail');
  count++;
  console.log('PASS Test 5: Direct modification of canonical owner membership successfully blocked');

  // TEST 6: Owner A attempts to directly delete canonical owner membership -> MUST FAIL
  console.log('Test 6: Owner A attempts to delete canonical owner membership');
  let deleteCanonicalOwnerFailed = false;
  try {
    await db.query(`
      DELETE FROM public.organization_members
      WHERE org_id = $1 AND user_id = $2
    `, [org1, ownerA]);
  } catch (err) {
    deleteCanonicalOwnerFailed = true;
  }
  assert.equal(deleteCanonicalOwnerFailed, true, 'Direct deletion of canonical owner row must fail');
  count++;
  console.log('PASS Test 6: Direct deletion of canonical owner membership successfully blocked');

  // TEST 7: Owner A attempts to directly insert another canonical owner row -> MUST FAIL
  console.log('Test 7: Owner A attempts to insert canonical owner row');
  let insertCanonicalOwnerFailed = false;
  try {
    await db.query(`
      INSERT INTO public.organization_members (org_id, user_id, member_role, status)
      VALUES ($1, $2, 'reviewer', 'active')
    `, [org1, ownerA]);
  } catch (err) {
    insertCanonicalOwnerFailed = true;
  }
  assert.equal(insertCanonicalOwnerFailed, true, 'Direct insert of canonical owner row must fail');
  count++;
  console.log('PASS Test 7: Direct insert of canonical owner row successfully blocked');

  // TEST 8: Owner A updates memberC role to 'viewer' -> MUST SUCCEED
  console.log('Test 8: Owner A updates memberC role to viewer');
  await db.query(`
    UPDATE public.organization_members
    SET member_role = 'viewer'
    WHERE org_id = $1 AND user_id = $2
  `, [org1, memberC]);
  const memberCRow = await db.query(`
    SELECT member_role FROM public.organization_members WHERE org_id = $1 AND user_id = $2
  `, [org1, memberC]);
  assert.equal(memberCRow.rows[0].member_role, 'viewer');
  count++;
  console.log('PASS Test 8: Owner successfully updated reviewer to viewer');

  async function denied(sql, params = []) {
    await assert.rejects(() => db.query(sql, params));
    count++;
  }
  await denied('UPDATE public.organizations SET owner_user_id=$1 WHERE id=$2', [ownerB, org1]);
  await denied("UPDATE public.organizations SET kyc_status='verified' WHERE id=$1", [org1]);
  await denied("UPDATE public.organizations SET verification_tier='enterprise' WHERE id=$1", [org1]);
  await denied("UPDATE public.organizations SET domain='attacker.example' WHERE id=$1", [org1]);
  await denied("UPDATE public.organizations SET whitelist_tx_hash='fake' WHERE id=$1", [org1]);
  const edit = await db.query("UPDATE public.organizations SET phone='0123456789' WHERE id=$1 RETURNING id", [org1]);
  assert.equal(edit.rows.length, 1);
  count++;

  await setCaller(memberC);
  const takeover = await db.query('UPDATE public.organizations SET owner_user_id=$1 WHERE id=$2 RETURNING id', [memberC, org1]);
  assert.equal(takeover.rows.length, 0);
  count++;
  await denied("INSERT INTO public.organizations(name, owner_user_id) VALUES ('Spoof', $1)", [ownerA]);
  await denied("INSERT INTO public.organizations(name, owner_user_id, kyc_status) VALUES ('Fake verified', $1, 'verified')", [memberC]);
  await setCaller(null);
  const anonymousUpdate = await db.query('UPDATE public.organizations SET owner_user_id=$1 WHERE id=$2 RETURNING id', [memberC, org1]);
  assert.equal(anonymousUpdate.rows.length, 0);
  count++;
  await denied("INSERT INTO public.organizations(name) VALUES ('Anonymous')");
  console.log('PASS protected organization identity, self-approval, stranger/anon takeover, and normal contact edit');

  // TEST 9: Privileged database operation transfers org1; clients cannot self-transfer.
  // Old owner A must be deleted regardless of role/status, new owner B must become owner active
  console.log('Test 9: Transferring organization ownership from ownerA to ownerB');
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false),
    set_config('request.jwt.claims', '{}', false)`);
  await db.query(`
    UPDATE public.organizations
    SET owner_user_id = $1
    WHERE id = $2
  `, [ownerB, org1]);

  // Switch caller to new ownerB to view members under new ownership RLS
  await setCaller(ownerB, 'ownerb@example.com');
  const membersAfterTransfer = await db.query(`
    SELECT user_id, member_role, status FROM public.organization_members WHERE org_id = $1 ORDER BY user_id
  `, [org1]);
  // Expected: memberC (viewer) and ownerB (owner). ownerA MUST NOT BE PRESENT.
  const oldOwnerExists = membersAfterTransfer.rows.some((r) => r.user_id === ownerA);
  assert.equal(oldOwnerExists, false, 'Old owner must be deleted on transfer');
  const newOwnerRow = membersAfterTransfer.rows.find((r) => r.user_id === ownerB);
  assert.ok(newOwnerRow, 'New owner must be present');
  assert.equal(newOwnerRow.member_role, 'owner');
  assert.equal(newOwnerRow.status, 'active');
  count++;
  console.log('PASS Test 9: Transfer deleted old owner and established new owner');

  // TEST 10: Old Owner A can NO LONGER manage members of org1 (RLS check)
  console.log('Test 10: Verifying Old Owner A can no longer manage members');
  await setCaller(ownerA, 'ownera@example.com');
  const membersSeenByOldOwner = await db.query(`
    SELECT * FROM public.organization_members WHERE org_id = $1
  `, [org1]);
  assert.equal(membersSeenByOldOwner.rows.length, 0, 'Old owner cannot see org members via owner policy');

  let oldOwnerUpdateFailed = false;
  try {
    const res = await db.query(`
      UPDATE public.organization_members SET status = 'revoked' WHERE org_id = $1 AND user_id = $2
    `, [org1, memberC]);
    // If 0 rows updated, RLS prevented it
    if (res.rowCount === 0) oldOwnerUpdateFailed = true;
  } catch {
    oldOwnerUpdateFailed = true;
  }
  assert.equal(oldOwnerUpdateFailed, true, 'Old owner cannot update members');
  count++;
  console.log('PASS Test 10: Old owner locked out from managing members');

  // TEST 11: New Owner B CAN manage members of org1
  console.log('Test 11: Verifying New Owner B can manage members');
  await setCaller(ownerB, 'ownerb@example.com');
  const membersSeenByNewOwner = await db.query(`
    SELECT user_id, member_role FROM public.organization_members WHERE org_id = $1
  `, [org1]);
  assert.equal(membersSeenByNewOwner.rows.length, 2);

  // New Owner B removes memberC
  await db.query(`
    DELETE FROM public.organization_members WHERE org_id = $1 AND user_id = $2
  `, [org1, memberC]);
  const finalMembers = await db.query(`
    SELECT user_id FROM public.organization_members WHERE org_id = $1
  `, [org1]);
  assert.equal(finalMembers.rows.length, 1);
  assert.equal(finalMembers.rows[0].user_id, ownerB);
  count++;
  console.log('PASS Test 11: New owner successfully deleted non-owner member');

  // TEST 12: Lead Payload inspection (proposing organization without owner, e.g. createOtherOrg)
  console.log('Test 12: Proposing lead organization without owner');
  await setCaller(ownerA, 'ownera@example.com');
  await db.query(`
    INSERT INTO public.organizations (id, name, org_type, contact_email, proposed_by_label, kyc_status, is_demo)
    VALUES ($1, 'Proposed University', 'school', 'edu@example.com', 'Sinh viên đề xuất', 'pending', false)
  `, [orgLead]);

  const leadOrg = await db.query(`SELECT id, owner_user_id, kyc_status, proposed_by_label FROM public.organizations WHERE id = $1`, [orgLead]);
  assert.equal(leadOrg.rows.length, 1);
  assert.equal(leadOrg.rows[0].owner_user_id, null);
  assert.equal(leadOrg.rows[0].kyc_status, 'pending');
  assert.equal(leadOrg.rows[0].proposed_by_label, 'Sinh viên đề xuất');

  const leadMembers = await db.query(`SELECT count(*)::int AS count FROM public.organization_members WHERE org_id = $1`, [orgLead]);
  assert.equal(leadMembers.rows[0].count, 0, 'Lead organization has no members');
  count++;
  console.log('PASS Test 12: Lead proposal successfully inserted without owner or member rows');

  // Removing ownership must revoke access too, not leave an active former owner.
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false),
    set_config('request.jwt.claims', '{}', false)`);
  await db.query('UPDATE public.organizations SET owner_user_id=NULL WHERE id=$1', [org1]);
  const removed = await db.query('SELECT * FROM public.organization_members WHERE org_id=$1 AND user_id=$2', [org1, ownerB]);
  assert.equal(removed.rows.length, 0);
  count++;
  await setCaller(ownerB);
  const lostAccess = await db.query('UPDATE public.organizations SET phone=$1 WHERE id=$2 RETURNING id', ['bad', org1]);
  assert.equal(lostAccess.rows.length, 0);
  count++;
  console.log('PASS transfer to NULL removes old owner and update access');

  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false),
    set_config('request.jwt.claims', '{}', false)`);
  await db.query("UPDATE public.users SET role='admin' WHERE id=$1", [ownerA]);
  await setCaller(ownerA);
  const approved = await db.query("UPDATE public.organizations SET kyc_status='verified', approved_at=now(), owner_user_id=$1 WHERE id=$2 RETURNING id", [ownerB, org1]);
  assert.equal(approved.rows.length, 1, 'Admin can verify and transfer organization');
  count++;
  await db.exec(`RESET ROLE; GRANT USAGE ON SCHEMA public,auth TO service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    SELECT set_config('request.jwt.claim.sub', '', false),
    set_config('request.jwt.claims', '{"role":"service_role"}', false);
    SET ROLE service_role`);
  const service = await db.query("UPDATE public.organizations SET owner_user_id=NULL WHERE id=$1 RETURNING id", [org1]);
  assert.equal(service.rows.length, 1, 'Service role can remove owner');
  const revokedByService = await db.query('SELECT * FROM public.organization_members WHERE org_id=$1 AND user_id=$2', [org1, ownerB]);
  assert.equal(revokedByService.rows.length, 0);
  count++;
  console.log('PASS authenticated admin and trusted service maintenance paths');

  console.log(`\n=================================================`);
  console.log(`ALL ${count} TESTS PASSED SUCCESSFULLY!`);
  console.log(`=================================================`);
  await db.close();
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exitCode = 1;
});
