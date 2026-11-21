# SkillPass

SkillPass là nền tảng hồ sơ năng lực số dành cho sinh viên, trường học và doanh nghiệp. Ứng dụng cho phép gửi minh chứng, xác minh chứng chỉ và phát hành chứng nhận số dạng Soulbound Token (SBT) trên Avalanche Fuji Testnet.

> Trạng thái: phiên bản thử nghiệm phục vụ hackathon. Dữ liệu, tài khoản và AVAX đang dùng trên môi trường testnet, không có giá trị tài chính thực.

## Truy cập nhanh

- Web production: <https://skillpass-app-sooty.vercel.app>
- Mạng blockchain: Avalanche Fuji C-Chain (`chainId 43113`)
- Hợp đồng `SkillBadgeSBT`: [`0x6eB168fb1A638F8a95007a3c240e23B879eBB6Ee`](https://testnet.snowtrace.io/address/0x6eB168fb1A638F8a95007a3c240e23B879eBB6Ee)
- Android: build bằng EAS profile `preview` để nhận file APK cài trực tiếp.

## Truy cập dành cho ban giám khảo

Các tài khoản dưới đây chỉ dùng cho bản demo hackathon và đã được kiểm tra đăng nhập thành công.

| Vai trò | Link đăng nhập | Tên đăng nhập | Mật khẩu |
| --- | --- | --- | --- |
| Sinh viên | [Cổng Sinh viên](https://skillpass-app-sooty.vercel.app/login) | `sinhvien.demo@skillpass.vn` | `SkillPass-Student@2026!` |
| Đại học | [Cổng Đối tác](https://skillpass-app-sooty.vercel.app/biz/login) | `daihoc.demo@skillpass.vn` | `SkillPass-Uni@2026!` |
| Công ty | [Cổng Đối tác](https://skillpass-app-sooty.vercel.app/biz/login) | `congty.demo@skillpass.vn` | `SkillPass-Co@2026!` |
| Quản trị viên | [Cổng Admin](https://skillpass-app-sooty.vercel.app/staff/login) | `admin@skillpass.vn` | `tltdt2007` |

Không sử dụng các mật khẩu demo trên cho tài khoản hoặc hệ thống khác. Nếu chia sẻ repository ngoài phạm vi chấm hackathon, hãy đổi toàn bộ mật khẩu demo trước.

## Chức năng chính

### Sinh viên

- Đăng ký và đăng nhập tài khoản thử nghiệm không cần xác nhận email.
- Tạo hồ sơ năng lực và cập nhật ảnh đại diện.
- Gửi chứng chỉ kèm thông tin, ngày cấp và tài liệu minh chứng.
- Theo dõi trạng thái hồ sơ: chờ xử lý, đang xác minh, đã duyệt hoặc bị từ chối.
- Nhận SBT sau khi đơn vị xác minh phê duyệt.
- Hiển thị mã QR và liên kết chia sẻ hồ sơ/chứng chỉ.
- Xem thông báo về quá trình xử lý hồ sơ.

### Trường học và doanh nghiệp

- Nộp hồ sơ đăng ký tài khoản đối tác kèm email và mật khẩu đăng nhập.
- Chờ quản trị viên kiểm tra và cấp quyền.
- Xử lý chứng chỉ theo ba bước:
  1. Gửi xác minh.
  2. Chờ xác minh.
  3. Đã xác minh.
- Phê duyệt hoặc từ chối hồ sơ thuộc phạm vi đơn vị.
- Theo dõi hạn mức AVAX thử nghiệm và gửi yêu cầu cấp thêm.
- Xem lịch sử hoạt động và thông báo liên quan.

### Quản trị viên

- Duyệt hoặc từ chối hồ sơ đăng ký đối tác.
- Quản lý trường học, doanh nghiệp và quyền xác minh.
- Theo dõi các đề xuất xác minh trường/đơn vị do sinh viên gửi riêng biệt với hồ sơ đăng ký đối tác.
- Quản lý hạn mức AVAX thử nghiệm của từng tổ chức.
- Theo dõi nhật ký quản trị và trạng thái hệ thống.
- Kiểm tra hợp đồng SBT, ví relayer, số dư AVAX và tổng số SBT đã phát hành.

## Luồng phát hành SBT

```text
Sinh viên gửi chứng chỉ
        ↓
Đơn vị kiểm tra minh chứng
        ↓
Đơn vị chọn phê duyệt
        ↓
Edge Function xác thực người duyệt và khóa certificate_id
        ↓
Metadata JSON được lưu công khai trên Supabase Storage
        ↓
Relayer ký giao dịch và mint SkillBadgeSBT trên Avalanche Fuji
        ↓
Database ghi badge + transaction + trạng thái chứng chỉ trong một giao dịch
```

Khóa phát hành theo `certificate_id` ngăn cùng một hồ sơ bị mint hai lần. Nếu giao dịch đã được phát lên blockchain nhưng bước lưu database gặp lỗi, hệ thống giữ trạng thái giao dịch để không tự động mint trùng.

## Kiến trúc

| Thành phần | Công nghệ | Vai trò |
| --- | --- | --- |
| Ứng dụng | Expo SDK 58, React Native, Expo Router | Giao diện Android và web |
| Web hosting | Vercel | Triển khai PWA/website production |
| Backend | Supabase Auth, Postgres, Storage, Edge Functions | Xác thực, dữ liệu, metadata và relayer |
| Blockchain | Avalanche Fuji C-Chain | Lưu SBT và transaction kiểm chứng |
| Smart contract | Solidity `SkillBadgeSBT` | Phát hành chứng nhận số không chuyển nhượng |
| Android build | Expo EAS Build | Ký và đóng gói APK/AAB |

## Vì sao SkillPass sử dụng Avalanche

- **Công khai và độc lập với ứng dụng:** bản ghi phát hành, chủ sở hữu, proof hash và transaction được lưu trên Avalanche Fuji. Các dữ liệu on-chain này vẫn có thể được tra cứu ngay cả khi giao diện hoặc database SkillPass không hoạt động.
- **Không thể chuyển nhượng:** `SkillBadgeSBT` chặn việc chuyển token giữa các tài khoản, vì vậy chứng nhận không thể được bán hoặc chuyển sang người khác.
- **Có lịch sử phát hành và thu hồi:** hợp đồng phát sự kiện `BadgeIssued` khi cấp chứng nhận và `BadgeRevoked` khi thu hồi. Lịch sử giao dịch vẫn tồn tại công khai để phục vụ kiểm toán.
- **Kiểm chứng không cần quyền truy cập database:** bên thứ ba có thể dùng địa chỉ hợp đồng, token ID, transaction hash và proof hash để kiểm tra chứng nhận trực tiếp qua Snowtrace hoặc RPC Avalanche.

Metadata chi tiết của phiên bản hackathon hiện được lưu công khai trên Supabase Storage. Avalanche đóng vai trò là lớp bằng chứng bất biến cho việc phát hành, chủ sở hữu, trạng thái thu hồi và giá trị hash dùng để đối chiếu dữ liệu ngoài chuỗi.

## Vai trò của Relayer

Trong phiên bản thử nghiệm, trường học và doanh nghiệp **không trực tiếp ký giao dịch blockchain** và không phải tự quản lý ví hay AVAX.

1. Tài khoản đối tác đã được Admin xác minh kiểm tra minh chứng và phê duyệt hồ sơ trong SkillPass.
2. Edge Function xác thực người duyệt, quyền của tổ chức, trạng thái chứng chỉ và khóa `certificate_id` để ngăn phát hành trùng.
3. Ví Relayer của nền tảng thay mặt gửi giao dịch `issueBadge` lên Avalanche Fuji và thanh toán phí gas.
4. Sau khi giao dịch được xác nhận, SkillPass lưu token ID, transaction hash và metadata vào database để hiển thị cho người dùng.

Do đó, địa chỉ `issuer` on-chain trong bản thử nghiệm là địa chỉ Relayer của SkillPass, không phải ví riêng của từng trường học hoặc doanh nghiệp. Danh tính đơn vị phê duyệt được hệ thống kiểm tra trước khi gửi giao dịch và được ghi trong metadata cùng nhật ký database.

## Cấu trúc thư mục

```text
assets/                 Icon, adaptive icon, splash và favicon
contracts/              Smart contract, script deploy và contract test
docs/                   Tài liệu bàn giao, kiến trúc và hướng dẫn demo
public/                 Tài nguyên PWA
scripts/                Regression test và công cụ QA
src/app/                Route của Expo Router
src/components/         Thành phần giao diện dùng lại
src/screens/            Màn hình theo vai trò
src/services/           Supabase, đối tác và Avalanche
src/store/              Trạng thái ứng dụng
src/types/              Kiểu dữ liệu TypeScript
src/utils/              Tiện ích ngày tháng và phân quyền cổng đăng nhập
supabase/               Migration, Edge Functions, seed và integration test
app.json                Cấu hình Expo/Android/web
eas.json                Cấu hình build APK và AAB
```

## Yêu cầu môi trường

- Node.js 20 trở lên.
- npm.
- Tài khoản Expo nếu muốn build bằng EAS.
- Dự án Supabase nếu triển khai một môi trường mới.
- Ví relayer có AVAX Fuji nếu muốn phát hành SBT.

## Cài đặt và chạy local

```bash
npm install
npm run start
```

Các lệnh thường dùng:

```bash
npm run web          # chạy trên trình duyệt
npm run android      # mở bằng thiết bị/emulator Android
npm run typecheck    # kiểm tra TypeScript
npm run lint         # kiểm tra ESLint
npm run build:pwa    # xuất bản web/PWA vào dist
```

Kiểm thử smart contract:

```bash
cd contracts
npm install
npm test
```

## Biến môi trường

Tạo `.env.local` trong thư mục dự án:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable-anon-key>
```

Không đưa các giá trị sau vào ứng dụng hoặc Git:

- Supabase service-role key.
- Private key của relayer.
- Seed phrase hoặc private key của MetaMask.

`RELAYER_PRIVATE_KEY` phải được lưu trong Supabase Edge Function Secrets. Ứng dụng khách chỉ gọi Edge Function sau khi đăng nhập; việc ký giao dịch diễn ra ở phía server.

## Build Android

### APK để kiểm thử

```bash
npm run build:apk
```

Lệnh sử dụng profile `preview` trong `eas.json` và tạo APK cài trực tiếp. Khi EAS hoàn tất, mở liên kết build trên điện thoại Android hoặc tải APK về máy.

### AAB để phát hành

```bash
npm run build:aab
```

Profile `production` tạo Android App Bundle. Trước khi phát hành thật cần bật xác nhận email, cấu hình SMTP, thay tài khoản demo, xoay private key và thực hiện kiểm thử bảo mật đầy đủ.

## Hướng dẫn sử dụng

### 1. Sinh viên gửi chứng chỉ

1. Mở SkillPass và chọn cổng sinh viên.
2. Đăng ký hoặc đăng nhập.
3. Chọn chức năng gửi chứng chỉ.
4. Điền tên chứng chỉ, đơn vị cấp, ngày cấp và thông tin cần thiết.
5. Tải tài liệu minh chứng.
6. Gửi hồ sơ và theo dõi trạng thái trong ứng dụng.

### 2. Đơn vị xác minh

1. Mở cổng doanh nghiệp/trường học và đăng nhập bằng tài khoản đã được Admin cấp.
2. Mở danh sách hồ sơ cần xử lý.
3. Kiểm tra thông tin sinh viên và minh chứng.
4. Chuyển hồ sơ qua các bước gửi xác minh và chờ xác minh.
5. Phê duyệt để phát hành SBT hoặc từ chối kèm lý do.
6. Sau khi phê duyệt, kiểm tra transaction Avalanche và mã token trong chi tiết chứng chỉ.

### 3. Admin duyệt đối tác

1. Đăng nhập tại cổng nhân sự/quản trị.
2. Mở hồ sơ đăng ký tài khoản đối tác.
3. Kiểm tra thông tin tổ chức và người phụ trách.
4. Phê duyệt để cấp tài khoản hoặc từ chối hồ sơ.
5. Thiết lập hạn mức AVAX thử nghiệm phù hợp cho tổ chức.
6. Theo dõi nhật ký và các yêu cầu cấp thêm AVAX.

### 4. Kiểm chứng SBT

1. Mở chi tiết chứng chỉ hoặc quét QR được chia sẻ.
2. Kiểm tra trạng thái, đơn vị xác minh và chủ sở hữu.
3. Mở transaction trên Avalanche Fuji explorer.
4. So sánh địa chỉ hợp đồng, token ID và metadata URI với thông tin trong SkillPass.

## Kiểm thử

Chạy các kiểm tra cơ bản trước khi commit:

```bash
npm run typecheck
npm run lint
node --test scripts/*.test.mjs
```

Các script `.cjs` trong `scripts/` bao gồm kiểm thử hành vi đăng ký, gửi chứng chỉ, chia sẻ hồ sơ, luồng xác minh đối tác và bảo vệ relayer. Một số bài QA trình duyệt yêu cầu Chrome hoặc website local đang chạy.

## Quy ước dữ liệu demo

- Không dùng email, mật khẩu hoặc giấy tờ thật.
- Không gửi AVAX mainnet vào ví thử nghiệm.
- Không tái sử dụng private key testnet cho môi trường production.
- Token cũ đã mint không thể sửa metadata vì dữ liệu blockchain có tính bất biến.
- Có thể xóa và tạo lại dữ liệu Supabase khi chuẩn bị một kịch bản demo mới.

## Giới hạn của phiên bản hackathon

- Xác nhận email đang tắt để tạo tài khoản thử nhanh.
- SMTP/Brevo không được sử dụng.
- Avalanche Fuji là testnet; AVAX không có giá trị thực.
- Relayer thanh toán gas tập trung, còn hạn mức theo tổ chức được quản lý trong ứng dụng.
- Chưa tối ưu database cho tải lớn và chưa thay thế quy trình thẩm định thủ công.
- Cần rà soát pháp lý, quyền riêng tư và bảo mật trước khi sử dụng dữ liệu người dùng thật.

## Giấy phép

Xem [LICENSE](./LICENSE).
