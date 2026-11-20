-- ============================================================
-- Migration: Bật Supabase Storage (bucket 'certificates')
-- và cho phép đồng bộ 2 chiều toàn bộ dữ liệu ứng dụng (Users, Certificates, Shared Links, Notifications, Badges)
-- ============================================================

-- 1. Tạo Storage Bucket 'certificates' (Public) để lưu ảnh minh chứng, PDF và ảnh đại diện
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'certificates',
    'certificates',
    TRUE,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = TRUE,
    file_size_limit = 10485760;

-- Chính sách RLS cho Storage Bucket 'certificates' (INSERT + SELECT + UPDATE)
CREATE POLICY "Public read certificates bucket" ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'certificates');

CREATE POLICY "Allow upload to certificates bucket" ON storage.objects
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (bucket_id = 'certificates');

CREATE POLICY "Allow update in certificates bucket" ON storage.objects
    FOR UPDATE
    TO anon, authenticated
    USING (bucket_id = 'certificates')
    WITH CHECK (bucket_id = 'certificates');

-- 2. Cho phép tạo hồ sơ Demo / Sinh viên mà không bị chặn FK vào auth.users khi chạy chế độ Web2.5 / Gasless
-- Mở quyền GRANT đầy đủ cho anon & authenticated trên các bảng nghiệp vụ
GRANT SELECT, INSERT, UPDATE ON public.users TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.certificates TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.evidence_documents TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.badges TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.shared_links TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notifications TO anon, authenticated;

-- Bổ sung RLS Policies cho phép ứng dụng đọc/ghi mượt mà trên cả tài khoản Auth và tài khoản Demo
CREATE POLICY "App read all users" ON public.users
    FOR SELECT
    TO anon, authenticated
    USING (TRUE);

CREATE POLICY "App insert users" ON public.users
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (TRUE);

CREATE POLICY "App update users" ON public.users
    FOR UPDATE
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "App read all certificates" ON public.certificates
    FOR SELECT
    TO anon, authenticated
    USING (TRUE);

CREATE POLICY "App insert certificates" ON public.certificates
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (TRUE);

CREATE POLICY "App update certificates" ON public.certificates
    FOR UPDATE
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "App read all evidence" ON public.evidence_documents
    FOR SELECT
    TO anon, authenticated
    USING (TRUE);

CREATE POLICY "App insert evidence" ON public.evidence_documents
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (TRUE);

CREATE POLICY "App insert badges" ON public.badges
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (TRUE);

CREATE POLICY "App update badges" ON public.badges
    FOR UPDATE
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "App read all shared links" ON public.shared_links
    FOR SELECT
    TO anon, authenticated
    USING (TRUE);

CREATE POLICY "App insert shared links" ON public.shared_links
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (TRUE);

CREATE POLICY "App update shared links" ON public.shared_links
    FOR UPDATE
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "App read all notifications" ON public.notifications
    FOR SELECT
    TO anon, authenticated
    USING (TRUE);

CREATE POLICY "App insert notifications" ON public.notifications
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (TRUE);

CREATE POLICY "App update notifications" ON public.notifications
    FOR UPDATE
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);
