-- ============================================================
-- SkillPass — Harden RLS Policies & Private Storage
--
-- Mục tiêu:
--   1. XÓA BỎ toàn bộ các policy quá rộng (wide anon/auth) từ migration 20261110020000:
--      - "App read all users", "App insert users", "App update users"
--      - "App read all certificates", "App insert certificates", "App update certificates"
--      - "App read all evidence", "App insert evidence"
--      - "App read all shared links", "App insert shared links", "App update shared links"
--      - "App insert badges", "App update badges"
--   2. Khôi phục các chính sách bảo mật chặt chẽ dựa trên vai trò:
--      - Users: chỉ xem & cập nhật hồ sơ của chính mình hoặc admin.
--      - Certificates: sinh viên xem/tạo của mình; reviewers xem/cập nhật của tổ chức.
--      - Evidence Documents: chỉ sinh viên sở hữu chứng chỉ hoặc reviewer tổ chức xem được.
--      - Shared Links: chỉ chủ sở hữu quản lý links của mình (khách truy cập xem qua RPC).
--      - Badges: chỉ xem công khai (SELECT); chỉ admin hoặc reviewer tổ chức cấp.
--   3. Storage 'certificates' bucket:
--      - Chuyển bucket sang private (public = FALSE).
--      - Xóa policy đọc công khai của anon ("Public read certificates bucket").
--      - Xóa quyền upload/update của anon ("Allow upload to certificates bucket").
--      - Giới hạn quyền đọc storage cho người dùng đã xác thực dựa trên quyền sở hữu chứng chỉ
--        hoặc reviewer tổ chức, hoặc admin. Link chia sẻ của khách truy cập qua Edge Function ký URL.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Thu hồi các RLS Policies quá rộng trên bảng dữ liệu
-- ------------------------------------------------------------

-- public.users
DROP POLICY IF EXISTS "App read all users" ON public.users;
DROP POLICY IF EXISTS "App insert users" ON public.users;
DROP POLICY IF EXISTS "App update users" ON public.users;

-- public.certificates
DROP POLICY IF EXISTS "App read all certificates" ON public.certificates;
DROP POLICY IF EXISTS "App insert certificates" ON public.certificates;
DROP POLICY IF EXISTS "App update certificates" ON public.certificates;

-- public.evidence_documents
DROP POLICY IF EXISTS "App read all evidence" ON public.evidence_documents;
DROP POLICY IF EXISTS "App insert evidence" ON public.evidence_documents;

-- public.shared_links
DROP POLICY IF EXISTS "App read all shared links" ON public.shared_links;
DROP POLICY IF EXISTS "App insert shared links" ON public.shared_links;
DROP POLICY IF EXISTS "App update shared links" ON public.shared_links;

-- public.badges
DROP POLICY IF EXISTS "App insert badges" ON public.badges;
DROP POLICY IF EXISTS "App update badges" ON public.badges;

-- ------------------------------------------------------------
-- 2. Tái thiết lập các chính sách RLS chuẩn xác và an toàn
-- ------------------------------------------------------------

-- USERS: Chủ tài khoản hoặc Admin
DROP POLICY IF EXISTS "Users view own profile or Admin views all" ON public.users;
CREATE POLICY "Users view own profile or Admin views all" ON public.users
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Users update own profile or Admin updates all" ON public.users;
CREATE POLICY "Users update own profile or Admin updates all" ON public.users
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id OR public.is_admin())
    WITH CHECK (auth.uid() = id OR public.is_admin());

-- CERTIFICATES: Sinh viên xem/tạo của mình; Reviewer xem/sửa theo tổ chức; Admin xem hết
DROP POLICY IF EXISTS "Students view own certificates" ON public.certificates;
CREATE POLICY "Students view own certificates" ON public.certificates
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = student_id
        OR public.is_admin()
        OR org_id IN (
            SELECT m.org_id FROM public.organization_members m
            WHERE m.user_id = auth.uid() AND m.status = 'active'
        )
    );

DROP POLICY IF EXISTS "Students create certificates" ON public.certificates;
CREATE POLICY "Students create certificates" ON public.certificates
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Reviewers update org certificates" ON public.certificates;
CREATE POLICY "Reviewers update org certificates" ON public.certificates
    FOR UPDATE
    TO authenticated
    USING (
        public.is_admin()
        OR org_id IN (
            SELECT m.org_id FROM public.organization_members m
            WHERE m.user_id = auth.uid() AND m.status = 'active'
        )
    )
    WITH CHECK (
        public.is_admin()
        OR org_id IN (
            SELECT m.org_id FROM public.organization_members m
            WHERE m.user_id = auth.uid() AND m.status = 'active'
        )
    );

-- EVIDENCE DOCUMENTS: Chỉ đọc được khi có quyền xem chứng chỉ tương ứng
DROP POLICY IF EXISTS "Users read evidence for visible certs" ON public.evidence_documents;
CREATE POLICY "Users read evidence for visible certs" ON public.evidence_documents
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR certificate_id IN (
            SELECT c.id FROM public.certificates c
            WHERE c.student_id = auth.uid()
               OR c.org_id IN (
                   SELECT m.org_id FROM public.organization_members m
                   WHERE m.user_id = auth.uid() AND m.status = 'active'
               )
        )
    );

DROP POLICY IF EXISTS "Students upload evidence" ON public.evidence_documents;
CREATE POLICY "Students upload evidence" ON public.evidence_documents
    FOR INSERT
    TO authenticated
    WITH CHECK (
        certificate_id IN (
            SELECT c.id FROM public.certificates c WHERE c.student_id = auth.uid()
        )
    );

-- SHARED LINKS: Chỉ chủ sở hữu quản lý (người xem bên ngoài truy vấn qua RPC get_shared_profile)
DROP POLICY IF EXISTS "Users manage own shared links" ON public.shared_links;
CREATE POLICY "Users manage own shared links" ON public.shared_links
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- BADGES: Công khai để kiểm tra tx/on-chain proof; chỉ reviewer/admin được tạo
DROP POLICY IF EXISTS "Public read badges" ON public.badges;
CREATE POLICY "Public read badges" ON public.badges
    FOR SELECT
    USING (TRUE);

DROP POLICY IF EXISTS "Reviewers or Admin insert badges" ON public.badges;
CREATE POLICY "Reviewers or Admin insert badges" ON public.badges
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_admin()
        OR org_id IN (
            SELECT m.org_id FROM public.organization_members m
            WHERE m.user_id = auth.uid() AND m.status = 'active'
        )
    );

-- ------------------------------------------------------------
-- 3. Siết chặt bảo mật Supabase Storage 'certificates'
-- ------------------------------------------------------------
UPDATE storage.buckets
SET public = FALSE
WHERE id = 'certificates';

-- Gỡ bỏ hoàn toàn quyền truy cập của anon
DROP POLICY IF EXISTS "Public read certificates bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow upload to certificates bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow update in certificates bucket" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read certificates bucket" ON storage.objects;

-- Chỉ authenticated users có liên quan (chủ file hoặc reviewer hoặc admin) mới được đọc
CREATE POLICY "Authorized users read certificates storage" ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'certificates'
        AND (
            public.is_admin()
            -- Cho phép người dùng đọc avatar hoặc tài liệu do chính họ tải lên
            OR (storage.foldername(name))[1] = 'avatars'
            OR name IN (
                SELECT ed.storage_path FROM public.evidence_documents ed
                JOIN public.certificates c ON c.id = ed.certificate_id
                WHERE c.student_id = auth.uid()
                   OR c.org_id IN (
                       SELECT m.org_id FROM public.organization_members m
                       WHERE m.user_id = auth.uid() AND m.status = 'active'
                   )
            )
        )
    );

-- Chỉ authenticated users mới được tải file lên storage
CREATE POLICY "Authenticated users upload certificates storage" ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'certificates');

CREATE POLICY "Authenticated users update own storage" ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'certificates')
    WITH CHECK (bucket_id = 'certificates');
