# Chuyển đổi Auth cho bản thử nghiệm (2026-11-19)

## Đã sửa trong mã nguồn

- Sinh viên đăng ký email/mật khẩu và vào ứng dụng ngay khi Supabase Auth trả về phiên đăng nhập. `supabase/config.toml` tắt email confirmation cho **local stack**.
- Đối tác nhập email/mật khẩu trong form. Edge Function tạo Auth user và khóa đăng nhập; mật khẩu chỉ nằm trong Supabase Auth, không ghi vào `partner_applications`. Admin duyệt thì tạo organization và mở khóa tài khoản. Từ chối thì xóa Auth user đang khóa.
- Hồ sơ đối tác cũ chưa có Auth user vẫn dùng link đặt mật khẩu một lần để tương thích.
- Đề xuất đơn vị từ sinh viên hiện trong khối riêng trên trang Admin, không lẫn với danh sách tổ chức.
- Migration `20261119010000_mark_unverified_mailboxes.sql` đánh dấu các hộp thư chưa chứng minh quyền sở hữu để link `restricted` không dựa vào `email_confirmed_at` tự động.

## Production — đã triển khai 2026-11-19

- Supabase project `vaxtkabqnvazdsiditgs`: hai migration mới đã áp; 16/16 tài khoản hiện có được đánh dấu `mailbox_unverified`, trigger bảo vệ tài khoản tạo sau đã tồn tại.
- Authentication → Sign In / Providers: **Confirm email = off** (đã kiểm tra sau khi tải lại trang).
- Authentication → Emails → SMTP Settings: **Custom SMTP = off** (đã kiểm tra sau khi tải lại trang). Brevo không còn được dùng để gửi Auth email.
- Edge Function `partner-applications` v3 đã deploy với `verify_jwt = false`; handler tự xác thực các thao tác admin.
- PWA production `https://skillpass-app-sooty.vercel.app` đã deploy và alias tới deployment `dpl_6Tqfu8ZwQVRAuor2UMKg4XTKDzWK`. Route `/biz/register` và `/admin` trả HTTP 200 qua Vercel CLI.

`config.toml` chỉ điều khiển local Supabase; hosted settings ở trên được đổi trực tiếp trong Dashboard. Khi không có SMTP tùy chỉnh, các email khôi phục mật khẩu hoặc đổi email không gửi được tới người ngoài nhóm dự án. Link chia sẻ `restricted` cũng từ chối tài khoản chưa xác minh hộp thư thực sự.
