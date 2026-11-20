-- ============================================================
-- SkillPass Database Seed Data (Dữ liệu mẫu ban đầu)
-- Chạy tệp này trong Supabase SQL Editor sau khi đã chạy migration
-- ============================================================

-- 1. Thêm danh sách Trường Đại học / Cao đẳng đối tác
INSERT INTO public.organizations (name, domain, org_type, verification_tier, kyc_status)
VALUES
    ('Trường ĐH Bách Khoa TP.HCM', 'hcmut.edu.vn', 'school', 'academic', 'verified'),
    ('Trường ĐH FPT', 'fpt.edu.vn', 'school', 'academic', 'verified'),
    ('Trường ĐH Khoa học Tự nhiên', 'hcmus.edu.vn', 'school', 'academic', 'verified'),
    ('Trường ĐH Công nghệ Thông tin', 'uit.edu.vn', 'school', 'academic', 'verified'),
    ('Trường ĐH Bách Khoa Hà Nội', 'hust.edu.vn', 'school', 'academic', 'verified'),
    ('Trường ĐH Kinh tế TP.HCM', 'ueh.edu.vn', 'school', 'academic', 'verified'),
    ('Trường ĐH Demo', 'demo.edu.vn', 'school', 'academic', 'verified')
ON CONFLICT (domain) DO NOTHING;

-- 2. Thêm danh sách Doanh nghiệp đối tác (Đã duyệt & Chờ Admin duyệt)
INSERT INTO public.organizations (name, domain, phone, tax_code, org_type, verification_tier, kyc_status, contact_email, contact_person, wallet_address, whitelist_tx_hash)
VALUES
    ('Công ty Công nghệ Mẫu C', 'congtymaauc.vn', '0312345678', '0312345678', 'company', 'enterprise', 'verified', 'hr@congtymaauc.vn', 'Lê Hoàng Nam', '0x71C9...38A4', '0x9b2e4f1a8c...d301'),
    ('Tập đoàn FPT Software', 'fpt.com', '02473007300', '0101248141', 'company', 'enterprise', 'pending', 'hr-recruitment@fpt.com', 'Trần Minh Tuấn (Giám đốc Nhân sự)', '0x8A4e...91B2', NULL),
    ('Công ty Cổ phần VNG', 'vng.com.vn', '02839623888', '0303490096', 'company', 'enterprise', 'pending', 'campus@vng.com.vn', 'Nguyễn Thu Hà (Talent Acquisition)', '0x4F2c...73E9', NULL),
    ('Trường Cao đẳng Kỹ thuật Công nghệ ABC', 'abc.edu.vn', '02838112233', 'Đang cập nhật', 'school', 'academic', 'lead', 'phongdaotao@abc.edu.vn', 'Cô Nguyễn Thị Lan, Phòng Đào tạo', '0x9C1d...40A1', NULL),
    ('Tập đoàn Mẫu B', 'tapdoanmaub.vn', '0901234567', '0309876543', 'company', 'enterprise', 'verified', 'hr@tapdoanmaub.vn', 'Phòng Nhân sự', '0x5B2d...11C8', '0x4d1e9a...b204'),
    ('Amazon Web Services', 'amazon.com', NULL, NULL, 'company', 'enterprise', 'verified', 'training@amazon.com', 'AWS Certification', '0x1A9f...88E2', '0x7f3a...c21e'),
    ('British Council', 'britishcouncil.org', NULL, NULL, 'company', 'enterprise', 'verified', 'exams@britishcouncil.org', 'IELTS Vietnam', '0x2C7b...64D5', '0x8c2b...a109')
ON CONFLICT (domain) DO NOTHING;

-- 3. Thêm cấu hình hệ thống mặc định cho Super Admin
INSERT INTO public.system_settings (key, auto_domain_kyc, gasless_relayer, contract_address, chain_id)
VALUES ('default', TRUE, TRUE, '0x0000000000000000000000000000000000000000', 43113)
ON CONFLICT (key) DO NOTHING;

-- 4. Thêm nhật ký thẩm định mẫu của Admin
INSERT INTO public.admin_audit_logs (action, tone, icon, title, body, tx_hash)
VALUES
    ('approve_org', 'ok', 'ok', 'Đã cấp quyền ký số (Whitelist) cho Công ty Công nghệ Mẫu C', 'Đã xác minh MST 0312345678 & tên miền @congtymaauc.vn. Ghi nhận authorizeIssuer lên Avalanche Fuji.', '0x9b2e4f1a8c...d301'),
    ('approve_org', 'ok', 'award', 'Đã cấp quyền ký số (Academic) cho Trường ĐH Demo', 'Đã xác minh tên miền @demo.edu.vn. Cho phép đồng bộ văn bằng tự động.', '0x5a1c7d8e2b...f412'),
    ('reject_org', 'bad', 'x', 'Từ chối hồ sơ Trung tâm Đào tạo X', 'Lý do: Sử dụng email cá nhân (@gmail.com), không trùng khớp tên miền doanh nghiệp và thiếu mã số thuế.', NULL);
