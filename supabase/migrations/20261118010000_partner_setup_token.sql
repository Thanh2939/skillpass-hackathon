-- ============================================================
-- Partner account self-service password setup
--
-- Admin provisioning no longer returns a password. It stores a hashed,
-- short-lived setup token; the partner opens the one-time link and chooses
-- their own password.
-- ============================================================

ALTER TABLE public.partner_applications
    ADD COLUMN IF NOT EXISTS setup_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS setup_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_partner_applications_setup_token
    ON public.partner_applications (setup_token_hash)
    WHERE setup_token_hash IS NOT NULL;

-- The token must expire; a null expiry is treated as unusable.
CREATE OR REPLACE FUNCTION public.partner_application_set_setup_token(
    p_application_id UUID,
    p_token_hash TEXT,
    p_expires_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'partner_application_set_setup_token is service-only';
    END IF;

    IF p_token_hash IS NULL OR btrim(p_token_hash) = ''
       OR p_expires_at IS NULL OR p_expires_at <= now() THEN
        RETURN jsonb_build_object('status', 'invalid_token');
    END IF;

    UPDATE public.partner_applications
    SET setup_token_hash = p_token_hash,
        setup_token_expires_at = p_expires_at
    WHERE id = p_application_id
      AND status = 'account_created'
      AND user_id IS NOT NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_ready');
    END IF;

    RETURN jsonb_build_object('status', 'stored');
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_application_consume_setup_token(
    p_token_hash TEXT
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
        RAISE EXCEPTION 'partner_application_consume_setup_token is service-only';
    END IF;

    SELECT * INTO v_app
    FROM public.partner_applications
    WHERE setup_token_hash = p_token_hash
      AND setup_token_expires_at IS NOT NULL
      AND setup_token_expires_at > now()
      AND status = 'account_created'
      AND user_id IS NOT NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'invalid_or_expired');
    END IF;

    -- Single use: clear the token while the row is locked so a replay or a
    -- concurrent request cannot set a second password.
    UPDATE public.partner_applications
    SET setup_token_hash = NULL,
        setup_token_expires_at = NULL
    WHERE id = v_app.id;

    RETURN jsonb_build_object(
        'status', 'consumed',
        'application_id', v_app.id,
        'user_id', v_app.user_id,
        'email', v_app.email
    );
END;
$$;

DO $$
DECLARE
    v_name TEXT;
BEGIN
    FOR v_name IN SELECT unnest(ARRAY[
        'partner_application_set_setup_token',
        'partner_application_consume_setup_token'
    ]) LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC, anon, authenticated', v_name);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO service_role', v_name);
    END LOOP;
END $$;
