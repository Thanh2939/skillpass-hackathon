// Local PostgreSQL/WASM integration test. Never connects to a remote Supabase.
// Set PGLITE_PACKAGE to a separately installed @electric-sql/pglite package path.
const { PGlite } = require(process.env.PGLITE_PACKAGE || 'C:/Users/DELL/AppData/Local/Temp/opencode/skillpass-feedback-tests/node_modules/@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const db = new PGlite();
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
      $$ SELECT current_user::text $$;
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
  const directory = path.resolve(__dirname, '../migrations');
  for (const file of fs.readdirSync(directory).filter((f) => f.endsWith('.sql')).sort()) {
    // uuid-ossp is provided by Supabase; WASM uses PostgreSQL's built-in UUID generator.
    const sql = fs.readFileSync(path.join(directory, file), 'utf8')
      .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '');
    try { await db.exec(sql); } catch (error) {
      throw new Error(`Migration ${file}: ${error.message}`, { cause: error });
    }
    console.log(`PASS migration ${file}`);
  }
  await db.exec(`
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon, authenticated;
    GRANT SELECT ON storage.buckets TO anon, authenticated;
  `);
  const owner = '10000000-0000-4000-8000-000000000001';
  const receiver = '10000000-0000-4000-8000-000000000002';
  const stranger = '10000000-0000-4000-8000-000000000003';
  const unconfirmed = '10000000-0000-4000-8000-000000000004';
  const org = '20000000-0000-4000-8000-000000000001';
  const cert = '30000000-0000-4000-8000-000000000001';
  const draft = '30000000-0000-4000-8000-000000000002';
  for (const [id, email, confirmed] of [
    [owner, 'student@example.com', true], [receiver, 'receiver@example.com', true],
    [stranger, 'stranger@example.com', true], [unconfirmed, 'unconfirmed@example.com', false],
  ]) {
    await db.query(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ($1,$2,$3)`, [id, email, confirmed ? new Date().toISOString() : null]);
  }
  await db.query(`INSERT INTO public.organizations(id,name,domain) VALUES($1,'Issuer','issuer.example')`, [org]);
  await db.query(`INSERT INTO public.certificates(id,student_id,org_id,title,status) VALUES
    ($1,$3,$4,'Approved certificate','approved'),($2,$3,$4,'Private pending certificate','submitted')`,
  [cert, draft, owner, org]);
  await db.query(`INSERT INTO public.shared_links(user_id,code,status,access_mode,allowed_emails) VALUES
    ($1,'SP-PUBLIC','active','public','{}'),
    ($1,'SP-PRIVATE','active','restricted',ARRAY['receiver@example.com','unconfirmed@example.com']),
    ($1,'SP-REVOKED','revoked','public','{}'),
    ($1,'SP-EXPIRED','expired','public','{}')`, [owner]);
  await db.query(`UPDATE public.users SET share_code='SP-LEGACY' WHERE id=$1`, [owner]);
  await db.query(`INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES
    ('certificates','evidence/proof.png',$1::uuid,$1::uuid::text),
    ('certificates','evidence/other-private.png',$2::uuid,$2::uuid::text)`, [owner, stranger]);
  await db.query(`INSERT INTO public.evidence_documents(certificate_id,file_name,storage_path,sha256_hash)
    VALUES($1,'proof.png','evidence/proof.png','test')`, [cert]);

  async function caller(id = '', email = '') {
    await db.exec('RESET ROLE');
    await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`,
      [id, JSON.stringify({ sub: id, email })]);
    await db.exec(id ? 'SET ROLE authenticated' : 'SET ROLE anon');
  }
  async function rpc(code, certificate) {
    const result = certificate
      ? await db.query('SELECT public.get_shared_certificate($1,$2) AS data', [code, certificate])
      : await db.query('SELECT public.get_shared_profile($1) AS data', [code]);
    return result.rows[0].data;
  }
  let count = 0;
  function check(name, fn) { fn(); console.log(`PASS ${name}`); count++; }

  await caller();
  const profile = await rpc('SP-PUBLIC');
  check('anonymous public link contains only approved certificates', () => {
    assert.equal(profile.status, 'ok');
    assert.equal(profile.certificates.length, 1);
    assert.equal(profile.certificates[0].id, cert);
  });
  assert.equal((await rpc('SP-PRIVATE')).status, 'login_required');
  console.log('PASS anonymous restricted link requires login'); count++;
  assert.equal((await rpc('SP-REVOKED')).status, 'revoked'); count++;
  assert.equal((await rpc('SP-EXPIRED')).status, 'expired'); count++;
  assert.equal((await rpc('SP-LEGACY')).status, 'not_found'); count++;
  assert.equal((await rpc('SP-PUBLIC', draft)).status, 'not_found'); count++;
  assert.equal((await rpc('SP-PUBLIC', cert)).status, 'ok'); count++;
  for (const table of ['users', 'certificates', 'evidence_documents', 'shared_links', 'badges']) {
    assert.equal((await db.query(`SELECT * FROM public.${table}`)).rows.length, 0, `anon must not read ${table}`);
    console.log(`PASS anon cannot directly read ${table}`); count++;
  }
  await caller(stranger, 'stranger@example.com');
  assert.equal((await rpc('SP-PRIVATE')).status, 'denied'); count++;
  assert.equal((await db.query('SELECT * FROM public.certificates')).rows.length, 0); count++;
  const strangerObjects = (await db.query('SELECT * FROM storage.objects')).rows;
  assert.equal(strangerObjects.some((row) => row.name === 'evidence/proof.png'), false, 'stranger cannot sign another student evidence'); count++;
  await caller(stranger, 'receiver@example.com');
  assert.equal((await rpc('SP-PRIVATE')).status, 'denied', 'email source must be confirmed auth identity, not a supplied claim alone'); count++;
  await caller(unconfirmed, 'unconfirmed@example.com');
  assert.notEqual((await rpc('SP-PRIVATE')).status, 'ok', 'unconfirmed email cannot open restricted link'); count++;
  await caller(receiver, 'receiver@example.com');
  assert.equal((await rpc('SP-PRIVATE')).status, 'ok'); count++;
  assert.equal((await rpc('SP-PRIVATE', cert)).status, 'ok'); count++;
  assert.equal((await db.query('SELECT * FROM public.certificates')).rows.length, 0, 'recipient only sees data through scoped RPC'); count++;
  let ownershipRpcDenied = false;
  try { await db.query(`SELECT public.storage_object_owned_by('evidence/proof.png',$1)`, [owner]); }
  catch { ownershipRpcDenied = true; }
  assert.equal(ownershipRpcDenied, true, 'ownership helper is service-role only'); count++;
  assert.equal((await db.query(`UPDATE public.certificates SET title='tampered' WHERE id=$1 RETURNING id`, [cert])).rows.length, 0); count++;
  let elevated = false;
  try { await db.query(`UPDATE public.users SET role='admin' WHERE id=$1`, [receiver]); elevated = true; } catch {}
  assert.equal(elevated, false, 'self elevation must fail'); count++;
  await caller(owner, 'student@example.com');
  assert.equal((await db.query('SELECT * FROM public.certificates')).rows.length, 2); count++;
  const ownerObjects = (await db.query('SELECT * FROM storage.objects')).rows;
  assert.equal(ownerObjects.length, 1);
  assert.equal(ownerObjects[0].name, 'evidence/proof.png'); count++;
  await db.query(`INSERT INTO public.evidence_documents(certificate_id,file_name,storage_path,sha256_hash)
    VALUES($1,'own.png','evidence/proof.png','own')`, [draft]);
  count++; console.log('PASS owner can attach their real storage object');
  let borrowed = false;
  try {
    await db.query(`INSERT INTO public.evidence_documents(certificate_id,file_name,storage_path,sha256_hash)
      VALUES($1,'stolen.png','evidence/other-private.png','fake')`, [draft]);
    borrowed = true;
  } catch {}
  assert.equal(borrowed, false, 'student cannot attach a different student storage object to get it signed'); count++;
  await db.query(`UPDATE public.shared_links SET status='revoked' WHERE code='SP-PRIVATE'`);
  await caller(receiver, 'receiver@example.com');
  assert.equal((await rpc('SP-PRIVATE')).status, 'revoked'); count++;
  console.log(`PASS ${count} database assertions; no remote database touched`);
  await db.close();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
