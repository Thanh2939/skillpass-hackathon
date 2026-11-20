# Bàn giao: Luồng hồ sơ đối tác (không tự đăng ký)

> Tài liệu lịch sử ngày 18/11. Luồng đăng ký email/mật khẩu chờ Admin duyệt và kế hoạch bỏ SMTP cũ được cập nhật tại [DEMO-AUTH-CHANGEOVER.md](DEMO-AUTH-CHANGEOVER.md). Phần hướng dẫn Brevo bên dưới không còn là hướng xử lý hiện tại.

Trạng thái: **code hoàn tất, kiểm thử cục bộ đạt, CHƯA triển khai production.**

## 1. Quyết định nghiệp vụ

Đối tác (trường học/doanh nghiệp) **không tự tạo tài khoản**. Họ gửi hồ sơ liên hệ công khai;
Admin duyệt rồi hệ thống mới cấp tài khoản. Không có email xác thực, không có mật khẩu do
đối tác đặt, không có màn hình "chờ xác nhận email" cho đối tác.

- Sinh viên: vẫn đăng ký bình thường (email confirm của Supabase).
- Đối tác: hồ sơ công khai → hàng chờ Admin → Admin cấp tài khoản.
- Tài khoản được cấp có `email_confirm = true` (để đăng nhập được) nhưng mang dấu
  `app_metadata.mailbox_unverified = true`. Mọi link chia sẻ chế độ `restricted` phải từ chối
  tài khoản có dấu này cho tới khi mailbox thực sự được xác thực.
- Tổ chức tạo ra khi cấp tài khoản giữ `kyc_status = 'pending'`, **không** được gọi Relayer.
  Khi Admin xác minh, `kyc_status = 'verified'` đồng thời cấp quyền dùng Relayer chung; Admin
  chi trả gas AVAX. Doanh nghiệp không có ví, private key hoặc số dư AVAX riêng.

## 2. Thành phần đã thêm/sửa

| Tệp | Nội dung |
| --- | --- |
| `supabase/migrations/20261118000000_partner_applications.sql` | Bảng `partner_applications`, RLS chỉ admin, RPC service-only: `partner_application_submit_guard`, `_claim`, `_finalize`, `_reject`, `_release`; định nghĩa lại `_shared_access` từ chối `raw_app_meta_data.mailbox_unverified`; mở rộng allow-list `admin_audit_logs.action` |
| `supabase/functions/partner-applications/index.ts` | `submit` công khai; `provision`/`reject` yêu cầu Bearer + `public.users.role='admin'`; claim nguyên tử, tạo Auth user + organization, finalize; rollback khi lỗi |
| `supabase/config.toml` | `[functions.partner-applications] verify_jwt = false` (hàm tự xác thực admin) |
| `supabase/functions/shared-evidence-url/index.ts` | Từ chối `app_metadata.mailbox_unverified` cho link restricted |
| `supabase/tests/partner-applications.integration.cjs` | 9 nhóm test PGlite |
| `supabase/tests/shared-access.integration.cjs`, `org-ownership-guard.integration.cjs` | Mock `auth.users` có `raw_app_meta_data` |
| `mobile/src/types/partnerApplications.ts` | Hợp đồng dữ liệu |
| `mobile/src/services/partnerApplications.ts` | Gọi Edge Function + đọc hàng chờ qua RLS |
| `mobile/src/screens/BizRegisterScreen.tsx` | Bỏ mật khẩu/`signUp`; gửi hồ sơ công khai; không điều hướng `/biz/pending` |
| `mobile/src/screens/AdminHomeScreen.tsx` | Hàng chờ hồ sơ đối tác riêng, chỉ admin tải; refresh tay + 60s |
| `mobile/src/screens/AdminPartnerApplicationScreen.tsx`, `mobile/src/app/admin/application/[id].tsx` | Màn chi tiết, nút duyệt cấp tài khoản, từ chối có lý do, link đặt mật khẩu một lần (có nút sao chép) |
| `mobile/src/screens/BizSetPasswordScreen.tsx`, `mobile/src/app/biz/set-password.tsx` | Đối tác tự đặt mật khẩu từ link một lần (24h) |
| `supabase/migrations/20261118010000_partner_setup_token.sql` | Cột + RPC `partner_application_set_setup_token` / `_consume_setup_token` (service-only) |

## 3. Bất biến bảo mật

1. Client công khai **không** gửi được `role`, `status`, `owner_user_id`, `password`, `approved_at`.
   Edge Function chỉ nhận đúng 6 trường liên hệ.
2. Guard rate-limit/dedupe là RPC `SECURITY DEFINER`, `EXECUTE` chỉ cấp cho `service_role`;
   anon/authenticated gọi sẽ lỗi. Cửa sổ 60 giây: 3/IP-hash, 3/email-hash, 30 toàn cục;
   trùng email còn `pending` trong 24h → coi là trùng, không tạo bản ghi mới.
3. RLS: admin đọc/ghi; anon và người dùng thường không đọc được hàng chờ.
4. Claim dùng `SELECT ... FOR UPDATE`, chỉ `pending → provisioning`; admin thứ hai nhận `conflict`.
5. `provision` không bao giờ đổi chủ sở hữu hay đặt lại mật khẩu của email đã có tài khoản.
6. Duyệt hồ sơ **không trả mật khẩu**. Server tạo token 64 hex, chỉ lưu SHA-256 trong
   `partner_applications.setup_token_hash` (hạn 24h, dùng một lần). Đối tác mở
   `/biz/set-password?token=…` để tự đặt mật khẩu.
   `complete_setup` tiêu thụ token trước (khoá `FOR UPDATE`) rồi mới đổi mật khẩu, nên replay
   hoặc request song song không thể đặt mật khẩu lần hai.
7. Nếu tạo organization hoặc finalize lỗi: xoá org/user vừa tạo và `release` hồ sơ về `pending`
   để admin thử lại (không để hồ sơ kẹt `provisioning`).
8. `mailbox_unverified` chỉ đọc từ `raw_app_meta_data` (server kiểm soát), không bao giờ từ
   `user_metadata` (người dùng sửa được).

## 4. Kết quả kiểm tra cục bộ (2026-11-18)

- `node supabase/tests/partner-applications.integration.cjs` — 9/9 PASS
- `node supabase/tests/shared-access.integration.cjs` — 28 assertions PASS
- `node supabase/tests/org-ownership-guard.integration.cjs` — 27 tests PASS
- `mobile`: `npm run lint`, `npm run typecheck` — cần xác nhận lần chạy cuối cùng
- Chưa chạy lại browser/behavior test cho luồng đối tác mới.

## 5. Trạng thái triển khai (cập nhật 2026-11-18)

- **Đã áp migration** `partner_applications` và `partner_setup_token` lên project `vaxtkabqnvazdsiditgs`.
- **Đã deploy** Edge Function `partner-applications` (v2, verify_jwt = false) và bản mới của
  `shared-evidence-url` (v2, verify_jwt = false).
- **Đã deploy web/PWA** production `https://skillpass-app-sooty.vercel.app` từ `mobile/dist`;
  có route `/biz/set-password` (bundle `set-password-…`) và `complete_setup` trong `__common-…`.
  Lưu ý: khi đồng bộ `dist` vào `mobile/.vercel-deploy`, **phải giữ `vercel.json`** (rewrite mọi
  đường dẫn về `index.html`); thiếu file này thì `/staff/login`, `/biz/register`… trả 404 của Vercel.
- **Kiểm thử production (đã dọn dữ liệu test)**:
  - `submit` tạo hồ sơ: HTTP 201, trả `id`.
  - Gửi lặp cùng email: HTTP 200 `{"ok":true,"duplicate":true}` (không tạo trùng, không lộ hàng chờ).
  - `provision` không Bearer: HTTP 401 `unauthorized`.
  - Admin thật đăng nhập, đọc hàng chờ qua RLS; `provision` thành công:
    hồ sơ `account_created`, `public.users.role = business`,
    `raw_app_meta_data.mailbox_unverified = true`, `email_confirmed_at` có giá trị,
    organization `kyc_status = pending`, `owner_user_id` đúng. Response **không** có
    `initialPassword`; `setupUrl` dài 64 ký tự token, hạn 24h.
  - Mở link → `complete_setup`: `ok`, đăng nhập `/biz/login` bằng mật khẩu vừa đặt thành công;
    `setup_token_hash` = NULL sau khi dùng.
  - Token sai/đã dùng: HTTP 410 `invalid_or_expired`; mật khẩu yếu: HTTP 400 `weak_password`.
  - Đã xoá toàn bộ hồ sơ/tài khoản/tổ chức test (`deploycheck.%` còn 0).

### Việc còn lại

1. **Kiểm thử tay trên giao diện**: gửi hồ sơ từ trang đăng ký đối tác → admin thấy trong hàng chờ
   → duyệt → bấm "Sao chép link" → mở link trong trình duyệt → đặt mật khẩu → đăng nhập
   `/biz/login` → xác nhận link restricted bị từ chối trước khi xác thực mailbox.
2. **Brevo**: Supabase vẫn báo `525 5.7.1 Unauthorized IP address`. Cần tắt "IP blocking" cho
   SMTP key tại `https://app.brevo.com/security/authorised_ips` (giữ API-key blocking và 2FA).
3. **Rà soát độc lập**: subagent QA bị huỷ do dịch vụ model không ổn định; đã tự rà và vá 3 lỗi
   (kẹt `provisioning`, rollback nhầm khi finalize lặp, lộ email đã nộp). Nên chạy lại QA.

## 6. Rủi ro còn lại

- **P0 chưa xử lý**: `supabase/functions/avalanche-relayer/index.ts` là relayer không xác thực,
  chỉ kiểm tra tiền tố `apikey`, tự suy ra khoá ký và địa chỉ người nhận, không có `revokeBadge`,
  không idempotency. Không liên quan trực tiếp luồng hồ sơ nhưng là nợ bảo mật lớn.
- Link đặt mật khẩu phải chuyển cho đối tác ngoài kênh (điện thoại/email thật); hệ thống không
  gửi mail tự động. Link chỉ dùng một lần, hết hạn 24h; nếu lộ trong thời gian đó, người khác có
  thể đặt mật khẩu. Muốn thu hồi ngay: cấp lại hồ sơ hoặc đặt lại mật khẩu thủ công.
- Admin chỉ thấy link **một lần** trên màn chi tiết. Nếu bỏ qua, chưa có nút "cấp lại link" — phải
  dùng quên mật khẩu hoặc cấp lại qua thao tác quản trị.
- Hồ sơ bị từ chối có thể nộp lại cùng email (guard chỉ chặn `pending` 24h). Cần chính sách nếu
  muốn chặn vĩnh viễn.
- Tên miền tổ chức trùng sẽ được fallback `domain = null`; admin cần bổ sung thủ công.
- Sau khi cấp tài khoản, tổ chức vẫn `pending`; Admin cần hoàn tất bước xác minh để cấp quyền dùng
  Relayer chung. Đây là quyền được tài trợ gas, không phải chuyển AVAX hoặc tạo ví cho doanh nghiệp.
- Không có thông báo email cho đối tác khi hồ sơ được duyệt/từ chối; admin phải liên hệ tay.
