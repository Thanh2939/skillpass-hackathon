-- ============================================================
-- SkillPass Database Migration (Web2.5 Architecture)
-- Based on actual UI/UX specifications
-- ============================================================

-- Bật extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT UNIQUE NOT NULL,
    full_name       TEXT NOT NULL,
    mssv            TEXT,
    avatar_url      TEXT,
    role            TEXT NOT NULL DEFAULT 'student'
                        CHECK (role IN ('student', 'business', 'admin')),
    wallet_address  TEXT,
    share_code      TEXT UNIQUE,
    push_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    school_name     TEXT,
    school_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. ORGANIZATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organizations (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                    TEXT NOT NULL,
    domain                  TEXT UNIQUE,
    phone                   TEXT,
    tax_code                TEXT,
    org_type                TEXT NOT NULL DEFAULT 'company'
                                CHECK (org_type IN ('school', 'company', 'other')),
    verification_tier       TEXT NOT NULL DEFAULT 'community'
                                CHECK (verification_tier IN ('community', 'academic', 'enterprise')),
    kyc_status              TEXT NOT NULL DEFAULT 'pending'
                                CHECK (kyc_status IN ('pending', 'verified', 'lead', 'rejected', 'revoked')),
    wallet_address          TEXT UNIQUE,
    logo_url                TEXT,
    contact_email           TEXT,
    contact_person          TEXT,
    owner_user_id           UUID REFERENCES public.users(id) ON DELETE SET NULL,
    proposed_by_student_id  UUID REFERENCES public.users(id) ON DELETE SET NULL,
    proposed_by_label       TEXT,
    reviewed_by_admin_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
    approved_at             TIMESTAMPTZ,
    whitelist_tx_hash       TEXT,
    rejection_reason        TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. ORGANIZATION_MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organization_members (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    member_role TEXT NOT NULL DEFAULT 'reviewer'
                    CHECK (member_role IN ('owner', 'reviewer', 'viewer')),
    status      TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('invited', 'active', 'revoked')),
    joined_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE (org_id, user_id)
);

-- ============================================================
-- 4. CERTIFICATES (Yêu cầu xét duyệt & thông tin chứng chỉ)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.certificates (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    reviewer_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
    title               TEXT NOT NULL,
    org_type_label      TEXT,
    issue_date_original TEXT,
    auto_sync           BOOLEAN NOT NULL DEFAULT FALSE,
    time_range          TEXT,
    status              TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','submitted','under_review',
                                              'approved','rejected','issued')),
    rejection_reason    TEXT,
    fix_guide           TEXT,
    expected_result     TEXT,
    submitted_at        TIMESTAMPTZ,
    reviewed_at         TIMESTAMPTZ,
    rejected_at         TIMESTAMPTZ
);

-- ============================================================
-- 5. EVIDENCE_DOCUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.evidence_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    certificate_id  UUID NOT NULL REFERENCES public.certificates(id) ON DELETE CASCADE,
    file_name       TEXT NOT NULL,
    storage_path    TEXT,
    ipfs_cid        TEXT,
    sha256_hash     TEXT NOT NULL,
    mime_type       TEXT,
    file_size       BIGINT CHECK (file_size >= 0 AND file_size <= 10485760),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. BADGES (Soulbound Token Record trên Avalanche Fuji)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.badges (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    certificate_id      UUID UNIQUE NOT NULL REFERENCES public.certificates(id) ON DELETE RESTRICT,
    student_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    token_id            BIGINT UNIQUE NOT NULL,
    contract_address    TEXT NOT NULL,
    chain_id            INTEGER NOT NULL DEFAULT 43113,
    tx_hash             TEXT UNIQUE NOT NULL,
    metadata_uri        TEXT NOT NULL,
    proof_hash          TEXT NOT NULL,
    tier                TEXT NOT NULL CHECK (tier IN ('community', 'academic', 'enterprise')),
    is_revoked          BOOLEAN NOT NULL DEFAULT FALSE,
    revocation_reason   TEXT,
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at          TIMESTAMPTZ
);

-- ============================================================
-- 7. SHARED_LINKS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shared_links (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    code            TEXT UNIQUE NOT NULL,
    target_company  TEXT,
    status          TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'revoked', 'expired')),
    note            TEXT,
    view_count      INTEGER NOT NULL DEFAULT 0,
    shared_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ
);

-- ============================================================
-- 8. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    certificate_id  UUID REFERENCES public.certificates(id) ON DELETE SET NULL,
    tone            TEXT NOT NULL CHECK (tone IN ('ok', 'bad', 'info')),
    icon            TEXT NOT NULL CHECK (icon IN ('ok', 'award', 'x', 'bell')),
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    reason          TEXT,
    target_route    TEXT,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. ADMIN_AUDIT_LOGS (Nhật ký thẩm định KYC & Whitelist On-chain của Admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- ============================================================
-- 10. SYSTEM_SETTINGS (Cấu hình hệ thống dành cho Super Admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
    key                 TEXT PRIMARY KEY,
    auto_domain_kyc     BOOLEAN NOT NULL DEFAULT TRUE,
    gasless_relayer     BOOLEAN NOT NULL DEFAULT TRUE,
    contract_address    TEXT NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
    chain_id            INTEGER NOT NULL DEFAULT 43113,
    updated_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_share_code       ON public.users(share_code);
CREATE INDEX IF NOT EXISTS idx_users_role             ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_orgs_domain            ON public.organizations(domain);
CREATE INDEX IF NOT EXISTS idx_orgs_type              ON public.organizations(org_type);
CREATE INDEX IF NOT EXISTS idx_orgs_kyc_status        ON public.organizations(kyc_status);
CREATE INDEX IF NOT EXISTS idx_admin_logs_org         ON public.admin_audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created     ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_certs_student_status   ON public.certificates(student_id, status);
CREATE INDEX IF NOT EXISTS idx_certs_org_status       ON public.certificates(org_id, status);
CREATE INDEX IF NOT EXISTS idx_certs_reviewer         ON public.certificates(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_evidence_cert          ON public.evidence_documents(certificate_id);
CREATE INDEX IF NOT EXISTS idx_badges_student         ON public.badges(student_id);
CREATE INDEX IF NOT EXISTS idx_badges_token           ON public.badges(token_id);
CREATE INDEX IF NOT EXISTS idx_shared_user            ON public.shared_links(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_code            ON public.shared_links(code);
CREATE INDEX IF NOT EXISTS idx_notif_user_unread      ON public.notifications(user_id, is_read)
                                                      WHERE is_read = FALSE;

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_users_updated ON public.users;
CREATE TRIGGER on_users_updated
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_organizations_updated ON public.organizations;
CREATE TRIGGER on_organizations_updated
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Helper kiểm tra quyền Admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role = 'admin'
    );
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Users
CREATE POLICY "Users view own profile or Admin views all" ON public.users
    FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users update own profile or Admin updates all" ON public.users
    FOR UPDATE USING (auth.uid() = id OR public.is_admin());

-- Organizations (Ai cũng có thể đọc danh sách trường / công ty đối tác, gửi đăng ký mới, và Admin có toàn quyền duyệt)
CREATE POLICY "Public read organizations" ON public.organizations
    FOR SELECT USING (TRUE);

CREATE POLICY "Anyone can register or propose organization" ON public.organizations
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Admin or owner updates organization" ON public.organizations
    FOR UPDATE USING (public.is_admin() OR owner_user_id = auth.uid() OR auth.role() = 'anon');

-- Admin Audit Logs
CREATE POLICY "Public/Admin read audit logs" ON public.admin_audit_logs
    FOR SELECT USING (TRUE);

CREATE POLICY "Public/Admin insert audit logs" ON public.admin_audit_logs
    FOR INSERT WITH CHECK (TRUE);

-- System Settings
CREATE POLICY "Public read system settings" ON public.system_settings
    FOR SELECT USING (TRUE);

CREATE POLICY "Admin update system settings" ON public.system_settings
    FOR ALL USING (public.is_admin() OR auth.role() = 'anon');

-- Certificates
CREATE POLICY "Students view own certificates" ON public.certificates
    FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Students create certificates" ON public.certificates
    FOR INSERT WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Reviewers view org certificates" ON public.certificates
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM public.organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

CREATE POLICY "Reviewers update org certificates" ON public.certificates
    FOR UPDATE USING (
        org_id IN (
            SELECT org_id FROM public.organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- Evidence Documents
CREATE POLICY "Users read evidence for visible certs" ON public.evidence_documents
    FOR SELECT USING (
        certificate_id IN (
            SELECT id FROM public.certificates WHERE student_id = auth.uid()
            UNION
            SELECT c.id FROM public.certificates c
            JOIN public.organization_members m ON c.org_id = m.org_id
            WHERE m.user_id = auth.uid() AND m.status = 'active'
        )
    );

CREATE POLICY "Students upload evidence" ON public.evidence_documents
    FOR INSERT WITH CHECK (
        certificate_id IN (
            SELECT id FROM public.certificates WHERE student_id = auth.uid()
        )
    );

-- Notifications
CREATE POLICY "Users read own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- Shared Links
CREATE POLICY "Users manage own shared links" ON public.shared_links
    FOR ALL USING (auth.uid() = user_id);

-- Badges (Công khai để HR quét mã xác thực tức thì)
CREATE POLICY "Public read badges" ON public.badges
    FOR SELECT USING (TRUE);
