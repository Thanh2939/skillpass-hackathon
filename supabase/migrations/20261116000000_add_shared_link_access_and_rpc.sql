-- ============================================================
-- SkillPass — Feedback #2 & #7
-- Migration: Quyền truy cập liên kết chia sẻ (public | restricted) + RPC xác minh an toàn
--
-- Mục tiêu bảo mật:
--   1. Cột access_mode ('public' | 'restricted') & allowed_emails TEXT[] trên shared_links.
--   2. Không fallback public.users.share_code (chống bypass revoke / restricted).
--   3. Ở chế độ restricted: email người xem PHẢI được kiểm chứng từ auth.users
--      (id = auth.uid() VÀ email_confirmed_at IS NOT NULL).
--      Tuyệt đối KHÔNG đọc từ public.users.email (mutable) và KHÔNG tin cậy email chưa confirm.
--   4. RPC get_shared_profile & get_shared_certificate SECURITY DEFINER
--      chỉ trả approved fields của chứng chỉ (status in ('issued', 'approved')).
--   5. Gỡ bỏ trigger auto_confirm_auth_user; guard an toàn với to_regprocedure.
--   6. Thêm cột is_demo nếu chưa có để đảm bảo tương thích khi chạy trên database mới.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Đảm bảo cột is_demo tồn tại trên các bảng cốt lõi (tương thích migration độc lập)
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.certificates
    ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS slug_id TEXT,
    ADD COLUMN IF NOT EXISTS org_name TEXT,
    ADD COLUMN IF NOT EXISTS org_type TEXT DEFAULT 'company',
    ADD COLUMN IF NOT EXISTS student_name TEXT,
    ADD COLUMN IF NOT EXISTS student_mssv TEXT,
    ADD COLUMN IF NOT EXISTS student_school TEXT,
    ADD COLUMN IF NOT EXISTS reviewer_label TEXT,
    ADD COLUMN IF NOT EXISTS tx_hash TEXT,
    ADD COLUMN IF NOT EXISTS evidence_name TEXT,
    ADD COLUMN IF NOT EXISTS evidence_url TEXT;

ALTER TABLE public.shared_links
    ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'public'
        CHECK (access_mode IN ('public', 'restricted')),
    ADD COLUMN IF NOT EXISTS allowed_emails TEXT[] NOT NULL DEFAULT '{}'::text[];

-- Chuẩn hóa dữ liệu email trong allowed_emails về chữ thường, loại bỏ rỗng/trùng
UPDATE public.shared_links
SET allowed_emails = coalesce(
    (
        SELECT array_agg(DISTINCT lower(btrim(e)))
        FROM unnest(allowed_emails) AS e
        WHERE btrim(e) <> ''
    ),
    '{}'::text[]
)
WHERE allowed_emails IS NOT NULL AND array_length(allowed_emails, 1) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shared_links_code_upper
    ON public.shared_links (upper(code));

-- ------------------------------------------------------------
-- 1. Helper nội bộ: _shared_access(p_code TEXT)
--    Xác thực quyền truy cập server-side fail-closed.
--    Tuyệt đối KHÔNG fallback public.users.share_code.
-- ------------------------------------------------------------
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

    -- Tra cứu mã link chính xác
    SELECT * INTO v_link
    FROM public.shared_links sl
    WHERE upper(sl.code) = v_code
    LIMIT 1;

    IF NOT FOUND THEN
        -- KHÔNG fallback public.users.share_code để tránh bypass revoke / restricted
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

        -- Xác thực email CHỈ từ auth.users VÀ BẮT BUỘC email_confirmed_at IS NOT NULL
        -- Tuyệt đối không đọc từ public.users.email (người dùng tự sửa được)
        SELECT lower(btrim(u.email)) INTO v_email
        FROM auth.users u
        WHERE u.id = v_caller_id
          AND u.email_confirmed_at IS NOT NULL;

        IF v_email IS NULL THEN
            -- Email chưa confirm hoặc không tìm thấy trong auth.users -> từ chối
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

-- ------------------------------------------------------------
-- 2. RPC: get_shared_profile(p_code TEXT)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shared_profile(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_access    JSONB;
    v_status    TEXT;
    v_user      public.users%ROWTYPE;
    v_certs     JSONB;
BEGIN
    v_access := public._shared_access(p_code);
    v_status := v_access ->> 'status';

    IF v_status <> 'ok' THEN
        RETURN jsonb_build_object(
            'status', v_status,
            'access_mode', v_access ->> 'access_mode'
        );
    END IF;

    SELECT * INTO v_user
    FROM public.users u
    WHERE u.id = (v_access ->> 'user_id')::uuid;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id',                  c.id,
                'slug_id',             c.slug_id,
                'student_id',          c.student_id,
                'org_id',              c.org_id,
                'title',               c.title,
                'org_name',            c.org_name,
                'org_type',            c.org_type,
                'org_type_label',      c.org_type_label,
                'issue_date_original', c.issue_date_original,
                'time_range',          c.time_range,
                'status',              c.status,
                'tx_hash',             c.tx_hash,
                'reviewed_at',         c.reviewed_at,
                'submitted_at',        c.submitted_at
            )
            ORDER BY c.submitted_at DESC NULLS LAST
        ),
        '[]'::jsonb
    )
    INTO v_certs
    FROM public.certificates c
    WHERE c.student_id = v_user.id
      AND c.status IN ('issued', 'approved')
      AND c.is_demo = false;

    RETURN jsonb_build_object(
        'status',         'ok',
        'access_mode',    v_access ->> 'access_mode',
        'target_company', v_access ->> 'target_company',
        'profile', jsonb_build_object(
            'id',             v_user.id,
            'full_name',      v_user.full_name,
            'mssv',           v_user.mssv,
            'school_name',    v_user.school_name,
            'avatar_url',     v_user.avatar_url,
            'share_code',     v_user.share_code,
            'wallet_address', v_user.wallet_address,
            -- Ở restricted: KHÔNG trả email sinh viên để bảo vệ dữ liệu cá nhân
            'email', CASE WHEN (v_access ->> 'access_mode') = 'public'
                          THEN v_user.email ELSE NULL END
        ),
        'certificates', v_certs
    );
END;
$$;

-- ------------------------------------------------------------
-- 3. RPC: get_shared_certificate(p_code TEXT, p_cert TEXT)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shared_certificate(p_code TEXT, p_cert TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_access    JSONB;
    v_status    TEXT;
    v_user_id   UUID;
    v_cert      public.certificates%ROWTYPE;
    v_evidence  JSONB;
BEGIN
    v_access := public._shared_access(p_code);
    v_status := v_access ->> 'status';

    IF v_status <> 'ok' THEN
        RETURN jsonb_build_object(
            'status', v_status,
            'access_mode', v_access ->> 'access_mode'
        );
    END IF;

    IF p_cert IS NULL OR btrim(p_cert) = '' THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    v_user_id := (v_access ->> 'user_id')::uuid;

    SELECT * INTO v_cert
    FROM public.certificates c
    WHERE c.student_id = v_user_id
      AND c.status IN ('issued', 'approved')
      AND c.is_demo = false
      AND (
            c.id::text = btrim(p_cert)
            OR c.slug_id = btrim(p_cert)
          )
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id',           e.id,
                'certificate_id', e.certificate_id,
                'file_name',    e.file_name,
                'storage_path', e.storage_path,
                'ipfs_cid',     e.ipfs_cid,
                'sha256_hash',  e.sha256_hash,
                'mime_type',    e.mime_type,
                'file_size',    e.file_size,
                'created_at',   e.created_at
            )
            ORDER BY e.created_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_evidence
    FROM public.evidence_documents e
    WHERE e.certificate_id = v_cert.id;

    RETURN jsonb_build_object(
        'status',      'ok',
        'access_mode', v_access ->> 'access_mode',
        'certificate', jsonb_build_object(
            'id',                  v_cert.id,
            'slug_id',             v_cert.slug_id,
            'student_id',          v_cert.student_id,
            'org_id',              v_cert.org_id,
            'title',               v_cert.title,
            'org_name',            v_cert.org_name,
            'org_type',            v_cert.org_type,
            'org_type_label',      v_cert.org_type_label,
            'issue_date_original', v_cert.issue_date_original,
            'time_range',          v_cert.time_range,
            'status',              v_cert.status,
            'tx_hash',             v_cert.tx_hash,
            'reviewed_at',         v_cert.reviewed_at,
            'submitted_at',        v_cert.submitted_at,
            'expected_result',     v_cert.expected_result,
            'evidence_url',        v_cert.evidence_url,
            'evidence_name',       v_cert.evidence_name,
            'evidence_documents',  v_evidence
        )
    );
END;
$$;

-- ------------------------------------------------------------
-- 4. Phân quyền thực thi RPC
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public._shared_access(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shared_profile(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shared_certificate(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_shared_profile(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_certificate(TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- 5. Bảo mật trigger & xử lý lỗ hổng auto-confirm
-- ------------------------------------------------------------
-- Gỡ bỏ trigger tự động xác nhận email trên auth.users (ngăn chặn tấn công mạo danh email HR).
-- Production có schema drift: tên trigger có thể khác local, nên gỡ theo HÀM được gọi.
-- Giữ nguyên trigger dùng handle_new_user (cần cho tạo hồ sơ khi đăng ký).
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT t.tgname, p.proname
        FROM pg_trigger t
        JOIN pg_class tbl ON tbl.oid = t.tgrelid
        JOIN pg_namespace tn ON tn.oid = tbl.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
        JOIN pg_namespace pn ON pn.oid = p.pronamespace
        WHERE tn.nspname = 'auth' AND tbl.relname = 'users'
          AND NOT t.tgisinternal
          AND pn.nspname = 'public'
          AND p.proname = 'auto_confirm_auth_user'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users', r.tgname);
    END LOOP;
END $$;

-- Thu hồi quyền execute hàm trigger từ anon/authenticated (guard bằng to_regprocedure)
DO $$
BEGIN
    IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated';
    END IF;
    IF to_regprocedure('public.auto_confirm_auth_user()') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.auto_confirm_auth_user() FROM PUBLIC, anon, authenticated';
    END IF;
END $$;

-- ------------------------------------------------------------
-- 6. RLS Organization Members (tránh đệ quy vô hạn)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Members view own membership" ON public.organization_members;
CREATE POLICY "Members view own membership" ON public.organization_members
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

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
    );
