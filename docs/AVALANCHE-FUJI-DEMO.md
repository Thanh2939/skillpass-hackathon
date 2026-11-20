# Avalanche Fuji — checklist chạy demo

SkillPass dùng Avalanche Fuji C-Chain để mint `SkillBadgeSBT` sau khi đối tác xác minh chứng chỉ. Khóa ký chỉ nằm trong Supabase Edge Function; không đưa private key vào biến `EXPO_PUBLIC_*`, mã nguồn frontend hoặc ảnh chụp màn hình.

## Mô hình tài trợ gas

- Chỉ có **một ví Relayer do Admin SkillPass quản lý** và nạp AVAX Fuji.
- Doanh nghiệp không được tạo ví, không giữ private key và không nhận AVAX trực tiếp.
- Khi Admin xác minh tài khoản, hệ thống cấp quyền gọi relayer. Khi doanh nghiệp phê duyệt chứng chỉ, relayer ký giao dịch và trừ gas từ số dư AVAX chung của Admin.
- Khi Admin khóa doanh nghiệp, Edge Function từ chối giao dịch vì đơn vị không còn trạng thái `verified`.

## Cấu hình đã có

- Network: Avalanche Fuji C-Chain
- Chain ID: `43113`
- RPC: `https://api.avax-test.network/ext/bc/C/rpc`
- Smart contract: `contracts/contracts/SkillBadgeSBT.sol`
- Relayer: `supabase/functions/avalanche-relayer/index.ts`
- Mobile client: `mobile/src/services/web3.ts`

Relayer đã kiểm tra JWT và quyền trước mọi giao dịch ghi:

- `issueBadge`: chỉ tài khoản `business`, là thành viên của đúng đơn vị, đơn vị có `kyc_status = verified`, hồ sơ còn ở trạng thái chờ xử lý.

## Việc cần làm một lần trước buổi demo

1. Tạo một ví demo riêng, không dùng ví có tài sản thật. Đặt private key của ví này trực tiếp trong Supabase Edge Function Secret tên `RELAYER_PRIVATE_KEY`; không gửi private key qua chat.
2. Mở lại **Admin → Hệ thống** và sao chép địa chỉ `Ví Relayer` mới.
3. Mở [Core Testnet Faucet](https://core.app/tools/testnet-faucet), chọn Fuji C-Chain và gửi AVAX thử nghiệm vào đúng địa chỉ `0x...` đó. Faucet chỉ cấp token thử nghiệm, không có giá trị thật.
4. Trong `contracts/.env` trên máy của bạn, đặt cùng private key dưới tên `PRIVATE_KEY`, rồi chạy:

   ```powershell
   cd D:\SKILLPASS\contracts
   npm run deploy:fuji
   ```

5. Lấy địa chỉ contract in ra sau khi deploy. Trong Supabase, đặt Edge Function Secret `CONTRACT_ADDRESS` bằng địa chỉ này và cập nhật `public.system_settings.contract_address`.
6. Mở lại **Admin → Hệ thống**. Chỉ coi là sẵn sàng khi có đủ: block hiện tại, bytecode contract (hiện `Tổng SBT đã cấp`), địa chỉ relayer và số dư AVAX lớn hơn 0.
7. Dùng một hồ sơ thử để đối tác phê duyệt; lưu transaction hash và mở nó trên Avalanche Explorer.

## Lệnh kiểm tra cục bộ

```powershell
cd D:\SKILLPASS\contracts
npm test
npm run compile
```

Contract đang đặt `evmVersion: "cancun"`, phù hợp yêu cầu hiện tại của Avalanche C-Chain. Chỉ dùng Fuji cho bản hackathon; chưa chuyển RPC hoặc chain ID sang mainnet.
