# SkillPass — Database Schema & Architecture

Tài liệu chi tiết về mô hình dữ liệu của SkillPass được lưu tại [database_design.md](file:///C:/Users/DELL/.gemini/antigravity/brain/8c004b81-fd35-4696-8ce6-cb397071a4c4/database_design.md).

Vui lòng xem file trên hoặc kiểm tra các bảng chính:
- `users`: Tài khoản người dùng (Sinh viên, Issuer, HR, Admin).
- `organizations`: Doanh nghiệp & Trường học kèm domain KYC và phân hạng 3-tier.
- `organization_members`: Phân quyền người duyệt chứng nhận.
- `badge_requests`: Đơn nộp yêu cầu cấp chứng nhận và số giờ thực tập.
- `evidence_documents`: Minh chứng file thô & băm SHA-256 đối soát.
- `badges`: Bản ghi chứng chỉ Soulbound Token (SBT) kết nối on-chain Avalanche Fuji.
- `verification_logs`: Lịch sử quét mã QR đối soát của HR.
