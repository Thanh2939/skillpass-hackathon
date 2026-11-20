const PGLITE_PATH =
  process.env.PGLITE_PACKAGE ||
  'C:/Users/DELL/AppData/Local/Temp/opencode/skillpass-feedback-tests/node_modules/@electric-sql/pglite';
const { PGlite } = require(PGLITE_PATH);
const fs = require('fs');

async function test() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE public.organizations (id uuid PRIMARY KEY);
  `.replace(/auth\./g, '').replace(/public\./g, '')); // simple mock
  const sql = fs.readFileSync('supabase/migrations/20261118000000_partner_applications.sql', 'utf8');
  // Just execute the table creation part:
  const tableSql = sql.slice(0, sql.indexOf('CREATE POLICY'));
  await db.exec(tableSql);
  const def = await db.query("SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.partner_applications'::regclass");
  console.log(def.rows);
  try {
    await db.query(`
      INSERT INTO public.partner_applications (id, name, org_type, tax_code, contact_person, phone, email, status)
      VALUES (gen_random_uuid(), 'Tech Corp', 'company', '0303', 'John Doe', '0912', 'contact@techcorp.vn', 'pending')
    `);
    console.log('INSERT SUCCESS!');
  } catch (e) {
    console.log('INSERT FAILED:', e.message);
  }
  await db.close();
}
test().catch(console.error);
