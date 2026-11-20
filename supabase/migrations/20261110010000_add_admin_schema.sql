-- ============================================================
-- Migration bổ sung Cơ sở dữ liệu cho Quản trị viên (Admin)
-- Tuân thủ chuẩn bảo mật Supabase RLS & Postgres Best Practices
-- ============================================================

-- 1. Mở rộng bảng public.organizations phục vụ quy trình Admin duyệt KYC & Whitelist On-chain
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS proposed_by_student_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS proposed_by_label      TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_by_admin_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved_at            TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS whitelist_tx_hash      TEXT,
    ADD COLUMN IF NOT EXISTS rejection_reason       TEXT,
    ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ NOT NULL DEFAULT now();

-- Cập nhật ràng buộc kyc_status để hỗ trợ trạng thái 'lead' (SV đề xuất) và 'revoked' (Admin thu hồi quyền ký số)
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_kyc_status_check;
ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_kyc_status_check
    CHECK (kyc_status IN ('pending', 'verified', 'lead', 'rejected', 'revoked'));

CREATE INDEX IF NOT EXISTS idx_orgs_kyc_status          ON public.organizations(kyc_status);
CREATE INDEX IF NOT EXISTS idx_orgs_owner_user          ON public.organizations(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_orgs_proposed_by_student ON public.organizations(proposed_by_student_id);
CREATE INDEX IF NOT EXISTS idx_orgs_reviewed_by_admin   ON public.organizations(reviewed_by_admin_id);

DROP TRIGGER IF EXISTS on_organizations_updated ON public.organizations;
CREATE TRIGGER on_organizations_updated
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. Tạo bảng public.admin_audit_logs (Nhật ký thẩm định KYC & Whitelist On-chain của Admin)
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    admin_id        UUID REFERENCES public.users(id) ON DELETE SET NULL,
    org_id          UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    action          TEXT NOT NULL
                        CHECK (action IN ('register_org', 'propose_lead', 'approve_org', 'reject_org', 'revoke_org')),
    tone            TEXT NOT NULL DEFAULT 'ok'
                        CHECK (tone IN ('ok', 'bad', 'info')),
    icon            TEXT NOT NULL DEFAULT 'ok'
                        CHECK (icon IN ('ok', 'award', 'x', 'bell')),
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    tx_hash         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin   ON public.admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_org     ON public.admin_audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON public.admin_audit_logs(created_at DESC);

-- 3. Tạo bảng public.system_settings (Cấu hình hệ thống dành cho Super Admin)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key                 TEXT PRIMARY KEY,
    auto_domain_kyc     BOOLEAN NOT NULL DEFAULT TRUE,
    gasless_relayer     BOOLEAN NOT NULL DEFAULT TRUE,
    contract_address    TEXT NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
    chain_id            INTEGER NOT NULL DEFAULT 43113,
    updated_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_settings_updated_by ON public.system_settings(updated_by);

-- 4. Chính sách bảo mật Row Level Security (RLS) chuẩn Supabase (sử dụng TO anon, authenticated)
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.organizations TO anon, authenticated;
GRANT SELECT, INSERT ON public.admin_audit_logs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.system_settings TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can register or propose organization" ON public.organizations;
CREATE POLICY "Anyone can register or propose organization" ON public.organizations
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Admin or owner updates organization" ON public.organizations;
CREATE POLICY "Admin or owner updates organization" ON public.organizations
    FOR UPDATE
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Public/Admin read audit logs" ON public.admin_audit_logs;
CREATE POLICY "Public/Admin read audit logs" ON public.admin_audit_logs
    FOR SELECT
    TO anon, authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "Public/Admin insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Public/Admin insert audit logs" ON public.admin_audit_logs
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Public read system settings" ON public.system_settings;
CREATE POLICY "Public read system settings" ON public.system_settings
    FOR SELECT
    TO anon, authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "Admin update system settings" ON public.system_settings;
CREATE POLICY "Admin update system settings" ON public.system_settings
    FOR UPDATE
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);
