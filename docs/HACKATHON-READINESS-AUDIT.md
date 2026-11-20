# SkillPass — Hackathon readiness audit

Ngày rà soát: 19/11/2026. Phạm vi: PWA/mobile frontend, Supabase Auth/Database/Edge Functions, trang xác minh và smart contract Avalanche Fuji. Đây là đánh giá cho bản thử nghiệm, không phải chứng nhận sẵn sàng chạy production thương mại.

## Kết luận

Luồng Web2 chính đủ điều kiện demo sau khi sửa các lỗi quyền truy cập và đồng bộ quy trình đối tác. Bản web đã build và deploy production. Phần Avalanche đã có mã tích hợp thật nhưng **chưa thể thực hiện giao dịch mới** cho tới khi cấu hình ví demo, nạp AVAX Fuji và deploy lại contract.

## Đã sửa

- Quy trình tài khoản đối tác thống nhất ba bước: `Gửi xác minh` → `Chờ xác minh` → `Đã xác minh`.
- Admin xác minh hồ sơ sẽ tạo/mở tài khoản doanh nghiệp và đánh dấu đơn vị `verified` trong cùng một quyết định.
- Edge Function Avalanche không còn chấp nhận publishable key như quyền ghi. Mọi giao dịch ghi yêu cầu JWT; mint yêu cầu business thuộc đúng đơn vị đã xác minh và đúng hồ sơ đang chờ.
- Chỉ Admin quản lý một ví Relayer chung và tài trợ AVAX. Doanh nghiệp không có ví/private key riêng; trạng thái `verified` là quyền sử dụng relayer.
- Gỡ policy thử nghiệm cho phép anon đọc/sửa toàn bộ notifications; giữ đọc/cập nhật theo người nhận.
- Cập nhật màn Admin để không báo blockchain sẵn sàng khi contract không có bytecode hoặc relayer hết gas.
- Đồng bộ regression test đăng ký doanh nghiệp và lịch với giao diện hiện tại.

## Kết quả kiểm tra

- TypeScript typecheck: đạt.
- ESLint/Expo lint: đạt.
- PWA production export: đạt.
- Trang verifier Next.js production build: đạt.
- Smart contract: 11/11 test đạt; compile đạt.
- Registration behavior: 9/9 đạt.
- Certificate submit behavior: 9/9 đạt.
- Shared-link security behavior: 4/4 đạt.
- Calendar utility: 5/5 đạt.
- UI đăng ký: sinh viên 3 tình huống + doanh nghiệp 1 tình huống đạt.
- UI gửi hồ sơ trường: success/denied/timeout đạt.
- UI mobile smoke: 9/9 tình huống đạt.
- Relayer production không có JWT trả `401`: đạt.
- Supabase health advisor: không có cảnh báo.

## Việc còn lại trước khi trình diễn blockchain

1. Tạo ví demo và đặt `RELAYER_PRIVATE_KEY` trực tiếp trong Supabase Secrets.
2. Nạp AVAX Fuji cho đúng địa chỉ relayer.
3. Deploy `SkillBadgeSBT` bằng cùng ví và đặt `CONTRACT_ADDRESS`.
4. Chạy một hồ sơ mẫu end-to-end và mở transaction trên explorer.

Xem hướng dẫn chi tiết tại `docs/AVALANCHE-FUJI-DEMO.md`.

## Rủi ro chấp nhận cho prototype

- Confirm email đang tắt theo yêu cầu demo; người dùng có thể đăng ký mà không sở hữu hộp thư.
- Supabase leaked-password protection đang tắt.
- Hai RPC chia sẻ hồ sơ dùng `SECURITY DEFINER` và cho phép anon có chủ đích; dữ liệu trả về đã được giới hạn theo link chia sẻ.
- Còn cảnh báo tối ưu RLS/index ở quy mô lớn; không phải blocker cho dữ liệu demo nhỏ.
- `npm audit` và `expo-doctor` trực tuyến chưa chạy vì môi trường không cho gửi metadata dependency ra registry. Build, typecheck, lint và test cục bộ đã chạy thay thế.
