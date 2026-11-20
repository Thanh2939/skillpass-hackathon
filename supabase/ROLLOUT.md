# Hướng dẫn Rollout & Bảo mật Hạ tầng Supabase (Feedback F02 & F07)

Tài liệu này dành cho Tech Lead và DevOps khi chuẩn bị triển khai các cập nhật backend lên môi trường Staging / Production.

---

## 1. BLOCKER QUAN TRỌNG: Historical Accounts & `email_confirmed_at`

### Nguy cơ:
Trước đây dự án bật tính năng **"Auto-confirm email"** trong Supabase Dashboard (Auth > Settings > Email Auth). Tất cả các tài khoản được tạo trong giai đoạn này đều có trường `auth.users.email_confirmed_at` tự động được điền thời gian hiện tại, mặc dù người dùng có thể chưa bao giờ sở hữu hộp thư email đó (ví dụ nhập bừa `hr@google.com`).

Khi áp dụng migration `20261116000000_add_shared_link_access_and_rpc.sql`, RPC `get_shared_profile` và `get_shared_certificate` kiểm tra:
```sql
WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
```
Nếu một kẻ tấn công đã tạo tài khoản với email của HR trong giai đoạn auto-confirm, tài khoản đó sẽ vẫn có `email_confirmed_at IS NOT NULL` và có thể mở các liên kết restricted được chia sẻ cho HR đó!

### Hành động bắt buộc trước khi rollout:
1. **Tắt Auto-confirm emails** trên Supabase Dashboard:
   - Vào **Authentication** -> **Providers** -> **Email**.
   - Bật tùy chọn **"Confirm email"** (yêu cầu người dùng bấm link kích hoạt).
2. **Re-verify tài khoản lịch sử**:
   - Đối với các tài khoản tạo trước ngày triển khai, chạy script đặt `email_confirmed_at = NULL` và gửi email kích hoạt lại, HOẶC yêu cầu admin rà soát danh sách user trước khi cấp quyền truy cập các link chia sẻ doanh nghiệp.
   - **Tuyệt đối không áp dụng migration lên remote database khi chưa hoàn thành bước này.**

---

## 2. Deploy Edge Function `shared-evidence-url`

Link chia sẻ hỗ trợ 2 chế độ:
- **`public`**: Bất kỳ ai có mã link / quét mã QR (nhà tuyển dụng, ban giám khảo, người duyệt nhanh) đều có thể xem hồ sơ mà không cần đăng nhập. Phía client chỉ gửi `apikey: publishable_key` (không có Bearer JWT của người dùng).
- **`restricted`**: Bắt buộc đăng nhập với email nằm trong `allowed_emails`. Phía client gửi kèm `Authorization: Bearer <user_jwt>`.

Vì vậy, Edge Function Gateway **PHẢI** cho phép request không có JWT đi qua (`--no-verify-jwt`), và logic bên trong handler sẽ tự xác thực bằng `service.auth.getUser(token)` khi link ở chế độ `restricted`.

### Lệnh Deploy CLI:
```bash
supabase functions deploy shared-evidence-url --no-verify-jwt
```
*(Cấu hình này cũng đã được khai báo sẵn trong `supabase/config.toml` dưới mục `[functions.shared-evidence-url]`)*.

---

## 3. Rà soát Thủ công (Manual Audit) các Storage Objects Cũ

### Cơ chế chống Confused-Deputy:
Migration `20261116030000_prevent_storage_confused_deputy.sql` và Edge Function `shared-evidence-url` đã thiết lập cơ chế kiểm tra quyền sở hữu chặt chẽ:
- File trong bucket `certificates` **bắt buộc** phải có `owner = student_id` hoặc `owner_id = student_id::text` khớp với sinh viên sở hữu chứng chỉ.
- **Fail-Closed với Unowned Legacy**: Mọi file trong `storage.objects` có `owner IS NULL` và `owner_id IS NULL` sẽ **tuyệt đối không được tự trust** và hệ thống sẽ từ chối cấp signed URL.

### Quy trình Manual Audit trước khi go-live:
Chạy câu lệnh kiểm tra các file chưa có owner trong bucket `certificates`:
```sql
SELECT id, name, bucket_id, created_at
FROM storage.objects
WHERE bucket_id = 'certificates'
  AND owner IS NULL
  AND owner_id IS NULL;
```
Nếu có các file minh chứng cũ được upload trước đây, đối chiếu với bảng `public.certificates` và `public.evidence_documents` để gán đúng `owner` và `owner_id` cho sinh viên tương ứng:
```sql
UPDATE storage.objects so
SET owner = c.student_id,
    owner_id = c.student_id::text
FROM public.evidence_documents ed
JOIN public.certificates c ON c.id = ed.certificate_id
WHERE so.bucket_id = 'certificates'
  AND so.name = ed.storage_path
  AND so.owner IS NULL;
```

---

## 4. Thứ tự thực thi Migrations

Khi áp dụng lên database từ database trống:
1. `20261110000000_create_skillpass_tables.sql` (Cấu trúc bảng gốc)
2. `20261110010000_add_admin_schema.sql` (Schema admin & RBAC)
3. `20261110020000_enable_storage_and_full_app_sync.sql` (Storage cơ bản)
4. `20261116000000_add_shared_link_access_and_rpc.sql` (RPC chia sẻ link public/restricted)
5. `20261116010000_harden_user_role.sql` (Chặn leo quyền Admin, bỏ MD5 wallet address)
6. `20261116020000_private_evidence_storage.sql` (Bucket certificates chuyển sang private, xóa anon policies)
7. `20261116030000_prevent_storage_confused_deputy.sql` (Trigger chặn confused-deputy, siết chặt Storage RLS)
