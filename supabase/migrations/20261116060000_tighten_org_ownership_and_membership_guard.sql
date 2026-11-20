-- Migration: 20261116060000_tighten_org_ownership_and_membership_guard.sql
-- Description:
-- 1. Tighten organization ownership sync: on transfer, automatically delete old owner's
--    membership row regardless of role or status.
-- 2. Guard organization_members table: prevent manual assignment of member_role = 'owner',
--    and protect canonical owner membership rows from direct modification or deletion.
-- 3. Update RLS policy "Org owners manage organization members" to disallow assigning 'owner' role.

-- Replace every write policy, not just one historical policy name: permissive
-- policies are OR-ed together. Keep the existing public SELECT policy.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organizations'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.organizations', p.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "Authenticated register or propose organizations"
ON public.organizations FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR (auth.uid() IS NOT NULL AND kyc_status = 'pending' AND NOT is_demo
      AND (owner_user_id = auth.uid() OR owner_user_id IS NULL))
);

CREATE POLICY "Owners or admins update organizations"
ON public.organizations FOR UPDATE TO authenticated
USING (public.is_admin() OR owner_user_id = auth.uid())
WITH CHECK (public.is_admin() OR owner_user_id = auth.uid());

-- RLS limits rows; this guard limits sensitive columns, including future columns.
-- An owner cannot self-approve, rewrite an issuer identity, or transfer ownership.
CREATE OR REPLACE FUNCTION public.guard_organization_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR (session_user IN ('postgres', 'supabase_admin')
         AND coalesce(current_setting('role', true), 'none') IN ('none', 'postgres', 'supabase_admin'))
     OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.kyc_status IS DISTINCT FROM 'pending'
       OR NEW.is_demo IS DISTINCT FROM false
       OR (NEW.owner_user_id IS NOT NULL AND NEW.owner_user_id <> auth.uid())
       OR NEW.approved_at IS NOT NULL OR NEW.reviewed_by_admin_id IS NOT NULL
       OR NEW.whitelist_tx_hash IS NOT NULL OR NEW.rejection_reason IS NOT NULL
       OR (NEW.proposed_by_student_id IS NOT NULL AND NEW.proposed_by_student_id <> auth.uid())
    THEN
      RAISE EXCEPTION 'Invalid organization registration or proposal' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF OLD.owner_user_id IS DISTINCT FROM auth.uid()
       OR (to_jsonb(NEW) - ARRAY['phone','contact_email','contact_person','logo_url','updated_at'])
          IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['phone','contact_email','contact_person','logo_url','updated_at'])
    THEN
      RAISE EXCEPTION 'Only admins may change organization identity or verification'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_organization_identity
BEFORE INSERT OR UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.guard_organization_identity();
REVOKE ALL ON FUNCTION public.guard_organization_identity() FROM PUBLIC, anon, authenticated;

-- 1. Update sync_organization_owner_membership trigger function
CREATE OR REPLACE FUNCTION public.sync_organization_owner_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- When ownership is transferred to a different user, remove the old owner from organization_members
  IF TG_OP = 'UPDATE' AND OLD.owner_user_id IS NOT NULL AND OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id THEN
    DELETE FROM public.organization_members
    WHERE org_id = NEW.id AND user_id = OLD.owner_user_id;
  END IF;

  -- Ensure new owner has canonical active owner membership
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

-- 2. Guard trigger on organization_members
CREATE OR REPLACE FUNCTION public.guard_organization_members_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_canonical_owner UUID;
BEGIN
  -- Internal trigger executions (like sync_organization_owner_membership) must be allowed
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Canonical owner for this organization
  SELECT owner_user_id INTO v_canonical_owner
  FROM public.organizations
  WHERE id = CASE WHEN TG_OP = 'INSERT' THEN NEW.org_id ELSE OLD.org_id END;

  -- Prevent manual assignment of member_role = 'owner'
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.member_role = 'owner' THEN
    RAISE EXCEPTION 'member_role "owner" is automatically managed and cannot be manually assigned';
  END IF;

  -- Prevent modifying or deleting the canonical owner's membership row directly
  IF TG_OP IN ('UPDATE', 'DELETE') AND v_canonical_owner IS NOT NULL AND OLD.user_id = v_canonical_owner THEN
    RAISE EXCEPTION 'Canonical organization owner membership cannot be modified or deleted directly';
  END IF;

  -- Prevent inserting a row directly for the canonical owner
  IF TG_OP = 'INSERT' AND v_canonical_owner IS NOT NULL AND NEW.user_id = v_canonical_owner THEN
    RAISE EXCEPTION 'Canonical organization owner membership is automatically managed';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_organization_owner_membership() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_organization_members_membership() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_organization_members_membership ON public.organization_members;
CREATE TRIGGER trg_guard_organization_members_membership
BEFORE INSERT OR UPDATE OR DELETE ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION public.guard_organization_members_membership();

-- 3. Tighten RLS policy for organization_members
DROP POLICY IF EXISTS "Org owners manage organization members" ON public.organization_members;
CREATE POLICY "Org owners manage organization members" ON public.organization_members
FOR ALL
TO authenticated
USING (
  org_id IN (
    SELECT o.id FROM public.organizations o WHERE o.owner_user_id = auth.uid()
  )
)
WITH CHECK (
  org_id IN (
    SELECT o.id FROM public.organizations o WHERE o.owner_user_id = auth.uid()
  )
  AND member_role <> 'owner'
);
