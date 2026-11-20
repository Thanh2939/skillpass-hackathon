-- An Auth user may exist while the application is pending. Approval still
-- requires a separate organization and account_created status.
CREATE OR REPLACE FUNCTION public.partner_application_claim(
    p_application_id UUID, p_admin_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_app public.partner_applications%ROWTYPE;
BEGIN
    IF current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'partner_application_claim is service-only';
    END IF;
    SELECT * INTO v_app FROM public.partner_applications
    WHERE id = p_application_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
    IF v_app.status = 'account_created' OR v_app.organization_id IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'already_provisioned');
    END IF;
    IF v_app.status = 'rejected' THEN RETURN jsonb_build_object('status', 'rejected'); END IF;
    IF v_app.status = 'provisioning'
       AND v_app.reviewed_at < now() - interval '5 minutes' THEN
        UPDATE public.partner_applications
        SET reviewed_at = now(), reviewed_by = p_admin_id
        WHERE id = p_application_id;
        RETURN jsonb_build_object('status', 'claimed', 'recovered', true);
    END IF;
    UPDATE public.partner_applications
    SET status = 'provisioning', reviewed_at = now(), reviewed_by = p_admin_id
    WHERE id = p_application_id AND status = 'pending';
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    RETURN jsonb_build_object('status', 'claimed');
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_application_release(
    p_application_id UUID, p_admin_id UUID, p_reason TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
    IF current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'partner_application_release is service-only';
    END IF;
    UPDATE public.partner_applications
    SET status = 'pending', reviewed_at = NULL, reviewed_by = NULL,
        rejection_reason = left(coalesce(p_reason, ''), 300)
    WHERE id = p_application_id AND status = 'provisioning'
      AND organization_id IS NULL;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_released'); END IF;
    RETURN jsonb_build_object('status', 'released');
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_application_reject(
    p_application_id UUID, p_admin_id UUID, p_reason TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_app public.partner_applications%ROWTYPE;
BEGIN
    IF current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'partner_application_reject is service-only';
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RETURN jsonb_build_object('status', 'invalid_reason');
    END IF;
    SELECT * INTO v_app FROM public.partner_applications
    WHERE id = p_application_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
    IF v_app.status = 'account_created' OR v_app.organization_id IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'already_provisioned');
    END IF;
    IF v_app.status = 'rejected' THEN
        RETURN jsonb_build_object('status', 'already_rejected');
    END IF;
    IF v_app.status <> 'pending' THEN
        RETURN jsonb_build_object('status', 'conflict');
    END IF;
    UPDATE public.partner_applications
    SET status = 'rejected', rejection_reason = btrim(p_reason),
        reviewed_at = now(), reviewed_by = p_admin_id
    WHERE id = p_application_id;
    RETURN jsonb_build_object('status', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.partner_application_claim(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_application_release(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_application_reject(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_application_claim(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_application_release(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_application_reject(UUID, UUID, TEXT) TO service_role;
