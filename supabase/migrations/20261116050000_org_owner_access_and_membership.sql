-- Migration: 20261116050000_org_owner_access_and_membership.sql
-- Description:
-- 1. Sync organization owner to organization_members automatically.
-- 2. Backfill existing organization owners into organization_members.
-- 3. Extend RLS policies on certificates, evidence_documents, and badges to allow
--    organization owners (via organizations.owner_user_id) alongside organization_members.

-- 1. Trigger to synchronize organization owner into organization_members
CREATE OR REPLACE FUNCTION public.sync_organization_owner_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.owner_user_id IS NOT NULL THEN
    INSERT INTO public.organization_members (org_id, user_id, member_role, status)
    VALUES (NEW.id, NEW.owner_user_id, 'owner', 'active')
    ON CONFLICT (org_id, user_id)
    DO UPDATE SET member_role = 'owner', status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_org_owner_membership ON public.organizations;
CREATE TRIGGER trg_sync_org_owner_membership
AFTER INSERT OR UPDATE OF owner_user_id ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_owner_membership();

REVOKE EXECUTE ON FUNCTION public.sync_organization_owner_membership() FROM PUBLIC, anon, authenticated;

-- 2. Backfill existing organization owners
INSERT INTO public.organization_members (org_id, user_id, member_role, status)
SELECT id, owner_user_id, 'owner', 'active'
FROM public.organizations
WHERE owner_user_id IS NOT NULL
ON CONFLICT (org_id, user_id)
DO UPDATE SET member_role = 'owner', status = 'active';

-- 3. Update certificates RLS
DROP POLICY IF EXISTS "Students view own certificates" ON public.certificates;
DROP POLICY IF EXISTS "Reviewers view org certificates" ON public.certificates;
DROP POLICY IF EXISTS "Users read own or org certificates" ON public.certificates;

CREATE POLICY "Users read own or org certificates" ON public.certificates
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = student_id
    OR public.is_admin()
    OR org_id IN (SELECT id FROM public.organizations WHERE owner_user_id = auth.uid())
    OR org_id IN (SELECT m.org_id FROM public.organization_members m WHERE m.user_id = auth.uid() AND m.status = 'active')
  );

DROP POLICY IF EXISTS "Reviewers update org certificates" ON public.certificates;
CREATE POLICY "Reviewers update org certificates" ON public.certificates
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR org_id IN (SELECT id FROM public.organizations WHERE owner_user_id = auth.uid())
    OR org_id IN (SELECT m.org_id FROM public.organization_members m WHERE m.user_id = auth.uid() AND m.status = 'active')
  )
  WITH CHECK (
    public.is_admin()
    OR org_id IN (SELECT id FROM public.organizations WHERE owner_user_id = auth.uid())
    OR org_id IN (SELECT m.org_id FROM public.organization_members m WHERE m.user_id = auth.uid() AND m.status = 'active')
  );

-- 4. Update evidence_documents RLS
DROP POLICY IF EXISTS "Users read evidence visible certs" ON public.evidence_documents;
CREATE POLICY "Users read evidence visible certs" ON public.evidence_documents
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR certificate_id IN (
      SELECT c.id FROM public.certificates c
      WHERE c.student_id = auth.uid()
         OR c.org_id IN (SELECT id FROM public.organizations WHERE owner_user_id = auth.uid())
         OR c.org_id IN (SELECT m.org_id FROM public.organization_members m WHERE m.user_id = auth.uid() AND m.status = 'active')
    )
  );

-- 5. Update badges RLS
DROP POLICY IF EXISTS "Reviewers Admin insert badges" ON public.badges;
DROP POLICY IF EXISTS "Reviewers / Admin insert badges" ON public.badges;
CREATE POLICY "Reviewers / Admin insert badges" ON public.badges
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR org_id IN (SELECT id FROM public.organizations WHERE owner_user_id = auth.uid())
    OR org_id IN (SELECT m.org_id FROM public.organization_members m WHERE m.user_id = auth.uid() AND m.status = 'active')
  );
