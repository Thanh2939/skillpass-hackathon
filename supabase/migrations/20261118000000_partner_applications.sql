-- ============================================================
-- SkillPass — Partner application before account creation
--
-- A contact application is not an authenticated account. It has no password,
-- user metadata, role, or email-confirmed identity. Admin review is required
-- before Auth user/organization provisioning.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.partner_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    org_type TEXT NOT NULL CHECK (org_type IN ('school', 'company')),
    tax_code TEXT,
    contact_person TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
    ip_hash TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'provisioning', 'account_created', 'rejected')),
    rejection_reason TEXT,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT partner_applications_reviewed_consistency CHECK (
        (status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL)
        OR (status IN ('provisioning', 'account_created', 'rejected') AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
    )
);

-- Provision/reject actions are recorded in the existing admin audit trail.
ALTER TABLE public.admin_audit_logs
    DROP CONSTRAINT IF EXISTS admin_audit_logs_action_check;
ALTER TABLE public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_action_check
    CHECK (action IN (
        'register_org', 'propose_lead', 'approve_org', 'reject_org', 'revoke_org',
        'provision_partner', 'reject_partner'
    ));

ALTER TABLE public.partner_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partner applications admin only"
ON public.partner_applications
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Partner applications no anonymous access"
ON public.partner_applications
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_partner_applications_status_created
ON public.partner_applications (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_applications_email
ON public.partner_applications (email);

-- Shared access: a provisioned partner account is not mailbox-verified.
-- raw_app_meta_data is server-controlled; raw_user_meta_data is never trusted.
CREATE OR REPLACE FUNCTION public._shared_access(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_code      TEXT := upper(btrim(coalesce(p_code, '')));
    v_link      public.shared_links%ROWTYPE;
    v_access    TEXT := 'public';
    v_allowed   TEXT[] := '{}'::text[];
    v_caller_id UUID;
    v_email     TEXT;
BEGIN
    IF v_code = '' THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    SELECT * INTO v_link
    FROM public.shared_links sl
    WHERE upper(sl.code) = v_code
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_link.status = 'revoked' THEN
        RETURN jsonb_build_object('status', 'revoked');
    END IF;

    IF v_link.status = 'expired'
       OR (v_link.expires_at IS NOT NULL AND v_link.expires_at <= now()) THEN
        RETURN jsonb_build_object('status', 'expired');
    END IF;

    v_access  := coalesce(v_link.access_mode, 'public');
    v_allowed := coalesce(v_link.allowed_emails, '{}'::text[]);

    IF v_access = 'restricted' THEN
        v_caller_id := auth.uid();
        IF v_caller_id IS NULL THEN
            RETURN jsonb_build_object('status', 'login_required', 'access_mode', v_access);
        END IF;

        SELECT lower(btrim(u.email)) INTO v_email
        FROM auth.users u
        WHERE u.id = v_caller_id
          AND u.email_confirmed_at IS NOT NULL
          AND coalesce(u.raw_app_meta_data ->> 'mailbox_unverified', 'false') <> 'true';

        IF v_email IS NULL THEN
            RETURN jsonb_build_object('status', 'login_required', 'access_mode', v_access);
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM unnest(v_allowed) AS e
            WHERE lower(btrim(e)) = v_email
        ) THEN
            RETURN jsonb_build_object('status', 'denied', 'access_mode', v_access);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'status', 'ok',
        'access_mode', v_access,
        'user_id', v_link.user_id,
        'target_company', v_link.target_company
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_application_submit_guard(
    p_ip_hash TEXT,
    p_email_hash TEXT
)
RETURNS TABLE (
    accepted BOOLEAN,
    reason TEXT,
    retry_after_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
    v_ip_count INTEGER;
    v_email_count INTEGER;
    v_global_count INTEGER;
    v_duplicate BOOLEAN;
BEGIN
    IF current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'partner_application_submit_guard is service-only';
    END IF;

    IF p_ip_hash IS NULL OR btrim(p_ip_hash) = ''
       OR p_email_hash IS NULL OR btrim(p_email_hash) = '' THEN
        RAISE EXCEPTION 'Invalid submission guard input';
    END IF;

    -- One open application per contact email. Returning an existing pending
    -- application is not an error for the partner; the Edge Function treats it
    -- as an accepted duplicate so the UI does not leak queue contents.
    SELECT EXISTS (
        SELECT 1
        FROM public.partner_applications
        WHERE md5(lower(email)) = p_email_hash
          AND status = 'pending'
          AND created_at >= v_now - interval '24 hours'
    ) INTO v_duplicate;

    IF v_duplicate THEN
        RETURN QUERY SELECT false, 'duplicate'::text, 0;
    END IF;

    SELECT count(*) INTO v_ip_count
    FROM public.partner_applications
    WHERE created_at >= v_now - interval '60 seconds'
      AND ip_hash = p_ip_hash;

    SELECT count(*) INTO v_email_count
    FROM public.partner_applications
    WHERE created_at >= v_now - interval '60 seconds'
      AND md5(lower(email)) = p_email_hash;

    SELECT count(*) INTO v_global_count
    FROM public.partner_applications
    WHERE created_at >= v_now - interval '60 seconds';

    IF v_ip_count >= 3 OR v_email_count >= 3 OR v_global_count >= 30 THEN
        RETURN QUERY SELECT false, 'rate_limited'::text, 60;
    END IF;

    RETURN QUERY SELECT true, ''::text, 0;
END;
$$;

-- Rejections keep their reason; provisioning that fails before any Auth user
-- or organization exists is released back to the queue so an admin can retry.
CREATE OR REPLACE FUNCTION public.partner_application_release(
    p_application_id UUID,
    p_admin_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'partner_application_release is service-only';
    END IF;

    UPDATE public.partner_applications
    SET status = 'pending',
        reviewed_at = NULL,
        reviewed_by = NULL,
        rejection_reason = left(coalesce(p_reason, ''), 300)
    WHERE id = p_application_id
      AND status = 'provisioning'
      AND user_id IS NULL
      AND organization_id IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_released');
    END IF;

    RETURN jsonb_build_object('status', 'released');
END;
$$;


-- The Edge Function stores only a hash of the client IP for rate limiting.

CREATE OR REPLACE FUNCTION public.partner_application_claim(
    p_application_id UUID,
    p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_app public.partner_applications%ROWTYPE;
BEGIN
    IF current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'partner_application_claim is service-only';
    END IF;

    SELECT * INTO v_app
    FROM public.partner_applications
    WHERE id = p_application_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_app.status = 'account_created' OR v_app.user_id IS NOT NULL OR v_app.organization_id IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'already_provisioned', 'user_id', v_app.user_id, 'organization_id', v_app.organization_id);
    END IF;

    IF v_app.status = 'rejected' THEN
        RETURN jsonb_build_object('status', 'rejected');
    END IF;

    -- A previous attempt can die mid-provision (browser closed, function timeout).
    -- After five minutes without finalize, allow another admin to take over.
    IF v_app.status = 'provisioning'
       AND v_app.reviewed_at IS NOT NULL
       AND v_app.reviewed_at < now() - interval '5 minutes' THEN
        UPDATE public.partner_applications
        SET reviewed_at = now(),
            reviewed_by = p_admin_id
        WHERE id = p_application_id
          AND status = 'provisioning';
        RETURN jsonb_build_object('status', 'claimed', 'recovered', true);
    END IF;

    UPDATE public.partner_applications
    SET status = 'provisioning',
        reviewed_at = coalesce(reviewed_at, now()),
        reviewed_by = p_admin_id
    WHERE id = p_application_id AND status = 'pending';

    IF NOT FOUND THEN
        SELECT * INTO v_app FROM public.partner_applications WHERE id = p_application_id;
        IF v_app.status = 'account_created' OR v_app.user_id IS NOT NULL OR v_app.organization_id IS NOT NULL THEN
            RETURN jsonb_build_object('status', 'already_provisioned', 'user_id', v_app.user_id, 'organization_id', v_app.organization_id);
        END IF;
        RETURN jsonb_build_object('status', 'conflict');
    END IF;

    RETURN jsonb_build_object('status', 'claimed');
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_application_finalize(
    p_application_id UUID,
    p_admin_id UUID,
    p_user_id UUID,
    p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_app public.partner_applications%ROWTYPE;
BEGIN
    IF current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'partner_application_finalize is service-only';
    END IF;

    SELECT * INTO v_app
    FROM public.partner_applications
    WHERE id = p_application_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_app.status = 'account_created'
       AND (v_app.user_id IS NULL OR v_app.user_id = p_user_id)
       AND (v_app.organization_id IS NULL OR v_app.organization_id = p_organization_id) THEN
        RETURN jsonb_build_object('status', 'already_finalized', 'user_id', v_app.user_id, 'organization_id', v_app.organization_id);
    END IF;

    IF v_app.status = 'rejected' THEN
        RETURN jsonb_build_object('status', 'rejected');
    END IF;

    UPDATE public.partner_applications
    SET status = 'account_created',
        user_id = p_user_id,
        organization_id = p_organization_id,
        reviewed_at = coalesce(reviewed_at, now()),
        reviewed_by = p_admin_id
    WHERE id = p_application_id;

    RETURN jsonb_build_object('status', 'finalized', 'user_id', p_user_id, 'organization_id', p_organization_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_application_reject(
    p_application_id UUID,
    p_admin_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_app public.partner_applications%ROWTYPE;
BEGIN
    IF current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'partner_application_reject is service-only';
    END IF;

    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RETURN jsonb_build_object('status', 'invalid_reason');
    END IF;

    SELECT * INTO v_app
    FROM public.partner_applications
    WHERE id = p_application_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_app.status = 'account_created' OR v_app.user_id IS NOT NULL OR v_app.organization_id IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'already_provisioned');
    END IF;

    IF v_app.status = 'rejected' THEN
        RETURN jsonb_build_object('status', 'already_rejected');
    END IF;

    UPDATE public.partner_applications
    SET status = 'rejected',
        rejection_reason = btrim(p_reason),
        reviewed_at = coalesce(reviewed_at, now()),
        reviewed_by = p_admin_id
    WHERE id = p_application_id;

    RETURN jsonb_build_object('status', 'rejected');
END;
$$;

DO $$
DECLARE
    v_name TEXT;
BEGIN
    FOR v_name IN SELECT unnest(ARRAY[
        'partner_application_submit_guard',
        'partner_application_claim',
        'partner_application_finalize',
        'partner_application_reject',
        'partner_application_release'
    ]) LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC, anon, authenticated', v_name);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO service_role', v_name);
    END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public._shared_access(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_shared_profile(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_shared_certificate(TEXT, TEXT) TO anon, authenticated, service_role;