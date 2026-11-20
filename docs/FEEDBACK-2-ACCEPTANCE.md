# Feedback SkillPass 2 — đối chiếu nghiệm thu

Nguồn: `feedback skillpass 2.docx` (14 ảnh, 13 Word comments, đoạn yêu cầu cuối).
Ngày bắt đầu: 16/11/2026. Không coi sửa mã là đã nghiệm thu production.

| ID | Yêu cầu | Tiêu chí kiểm tra |
|---|---|---|
| F00 | Chỉnh ảnh đại diện như Zalo | Chọn ảnh, di chuyển/vị trí, zoom, xoay; lưu đúng ảnh xem trước, hủy không đổi |
| F01 | Ngày cấp nhập bị kẹt | Nhập/xóa/sửa ngày bất kỳ, kiểm tra ngày thực và năm nhuận, không tự nhảy về 11/20 |
| F02 | Quyền chia sẻ public hoặc người nhận cụ thể | Public mở qua link/QR; restricted yêu cầu email xác thực trong allowlist; sai người bị chặn tại server |
| F03 | Nhật ký doanh nghiệp thiếu chi tiết | Mở sự kiện thấy hồ sơ, người gửi, ngày, trạng thái, minh chứng; mở đúng yêu cầu |
| F04 | Tìm kiếm/duyệt nhanh không thao tác | Focus, gõ và xóa bình thường; lọc đúng; duyệt nhanh có kết quả/empty state rõ |
| F05 | Đăng ký đối tác phải báo kết quả dễ thấy | Lỗi/thành công hiện ngay nơi thao tác; không mất dữ liệu; retry không tạo trùng tài khoản |
| F06 | Đang đăng ký lại báo email đang đăng nhập | Luồng đăng ký mới, confirm email, tài khoản đã tạo và retry phân biệt chính xác |
| F07 | Người nhận không xem được chi tiết/minh chứng, nút Về ví sai vai trò | Mở chứng chỉ trong phạm vi link; có ảnh/PDF; đóng về kết quả, không chuyển sang login sinh viên |
| F08 | Mật khẩu hai biểu tượng mắt | Chỉ một điều khiển hiện/ẩn, thao tác và accessibility đúng |
| F09 | Admin không cần nút xem demo vai trò khác | Bỏ nút demo khỏi hệ thống, không dẫn sang cổng khách |
| F10 | Địa chỉ blockchain rút gọn không rõ | Hiển thị đầy đủ/copy; không giả số liệu khi mất kết nối |
| F11 | Nhãn Từ chối | Dùng “Đã từ chối”, phân biệt “Đã khóa” (revoked) |
| F12 | Search không tự nhiên, logout sai trang | Search focus rõ không outline đen; logout các vai trò về `/` |
| F13 | Cổng nhân viên riêng | `/staff/login` email/password công ty cấp, không chọn vịt, không đăng ký admin; cổng khách từ chối tài khoản admin |

## Quy tắc nghiệm thu

- Chạy lint, TypeScript, build web và kiểm tra trình duyệt khi có thể.
- Restricted sharing cần migration/RPC/RLS và Storage private; không được tuyên bố an toàn khi chưa rollout và test API.
- Không deploy, không thay đổi database từ xa, không tạo tài khoản quản trị tự động.
- QA agent hiện lỗi endpoint hai lần; Tech Lead phải tự kiểm tra thay, ghi rõ thiếu kiểm tra độc lập.

## Biên bản triển khai production (16/11/2026)

Đã được người dùng phê duyệt: áp migration + deploy Edge Function + deploy web.

- Supabase production: áp 6 migration (chia sẻ restricted + RPC, chặn tự nâng quyền,
  storage private + RLS chặt, chống confused-deputy, RPC ownership service-only,
  khoá EXECUTE hàm nội bộ do Supabase default privileges tự cấp cho anon).
  Kiểm chứng sau apply: `_shared_access`/`is_admin` RPC → 401 với anon;
  `get_shared_profile` RPC hoạt động; Edge Function `shared-evidence-url` ACTIVE, verify_jwt=false.
- Vercel: `skillpass-app-sooty.vercel.app` (PWA tĩnh, SPA rewrite) và
  `web-verify-snowy.vercel.app` (Next.js 14.2.35) deployment READY, kiểm tra browser production PASS.
- QA độc lập: agent hết hạn mức miễn phí (3 lần); thay bằng 28/28 DB PGlite +
  13/13 unit + 9/9 UI smoke + đối chiếu thủ công của Tech Lead.

## Rủi ro còn lại (đã ghi nhận, người dùng chấp nhận)

1. **Auto-confirm email vẫn bật** trên Dashboard: người mới đăng ký vẫn có thể được
   tự xác nhận email. Trigger DB `auto_confirm_auth_user` đã gỡ nhưng cần tắt setting
   Dashboard (Auth → Settings) để chắc chắn.
2. **Tài khoản cũ giai đoạn auto-confirm** có `email_confirmed_at` mà chưa xác thực
   hộp thư thật: cần xác thực lại email trước khi cấp quyền restricted link cho HR.
3. Bucket `certificates` đã chuyển private: object legacy không có owner sẽ không
   ký được signed URL (fail-closed) — cần audit theo `supabase/ROLLOUT.md`.
4. Chưa nghiệm thu bằng thiết bị thật (quét QR, upload, mint on-chain) — người dùng
   thử ở bước nghiệm thu cuối.
