-- ============================================================
-- SkillPass — Chặn tự nâng quyền tài khoản (role escalation)
--
-- Bối cảnh: Cổng staff/Admin của app dựa vào public.users.role = 'admin'.
-- Migration này ngăn chặn việc tự đăng ký hoặc sửa role thành admin từ phía client.
--
-- Fix Review:
--   1. Xóa logic tạo địa chỉ ví fake từ MD5 32 chars (không đúng chuẩn Ethereum/Avalanche).
--      Mặc định wallet_address để NULL; địa chỉ thật được cập nhật khi kết nối ví.
--   2. Guard an toàn với to_regprocedure.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT private.is_admin();
$$;

-- Chặn người dùng tự gán hoặc sửa đổi role / id / email
CREATE OR REPLACE FUNCTION private.protect_account_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF current_user IN ('anon', 'authenticated')
       AND (
            TG_OP = 'INSERT'
            OR new.role IS DISTINCT FROM old.role
            OR new.id IS DISTINCT FROM old.id
            OR new.email IS DISTINCT FROM old.email
       )
    THEN
        RAISE EXCEPTION 'Account identity and roles are managed by the server';
    END IF;
    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS protect_account_role ON public.users;
CREATE TRIGGER protect_account_role
    BEFORE INSERT OR UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION private.protect_account_role();

-- Trigger khi user được tạo trong auth.users
-- role chỉ chấp nhận 'student' hoặc 'business'; 'admin' bị từ chối
-- wallet_address mặc định NULL (không sinh chuỗi md5 giả)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_name   TEXT;
    v_role   TEXT;
    v_code   TEXT;
    v_mssv   TEXT;
    v_school TEXT;
BEGIN
    v_name   := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1));
    v_role   := CASE WHEN new.raw_user_meta_data ->> 'role' IN ('student', 'business')
                     THEN new.raw_user_meta_data ->> 'role' ELSE 'student' END;
    v_code   := 'SP-' || upper(substr(md5(random()::text || new.id::text), 1, 6));
    v_mssv   := coalesce(nullif(new.raw_user_meta_data ->> 'mssv', ''), '');
    v_school := coalesce(nullif(new.raw_user_meta_data ->> 'school_name', ''), '');

    INSERT INTO public.users (id, email, full_name, role, share_code, mssv, school_name, wallet_address, school_verified, is_demo)
    VALUES (new.id, new.email, v_name, v_role, v_code, v_mssv, v_school, NULL, FALSE, FALSE)
    ON CONFLICT (id) DO UPDATE SET
        full_name   = excluded.full_name,
        mssv        = coalesce(nullif(public.users.mssv, ''), excluded.mssv),
        school_name = coalesce(nullif(public.users.school_name, ''), excluded.school_name),
        is_demo     = FALSE;

    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DO $$
BEGIN
    IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated';
    END IF;
END $$;
