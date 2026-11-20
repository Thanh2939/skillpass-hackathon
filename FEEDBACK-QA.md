# Kiểm thử feedback SkillPass — 13/11/2026

## Cập nhật triển khai ngày 13/11/2026

- Bản ứng dụng `2b2428c` đã lên production, Vercel READY `dpl_BUETKXXxoXRUgX6ZQhU1Lx4Nf9nk`, alias `https://skillpass-app-sooty.vercel.app/`. Bundle `entry-21857a3052fb01c839c873854fa90e45.js` trùng build local.
- Kiểm tra lại trên production đạt 15/15 ca hồi quy. Suite bổ sung đạt đăng nhập admin, chặn route sai vai trò, đăng xuất xóa phiên, bộ lọc, nút duyệt cuộn ở cả admin/doanh nghiệp và màn QR nhỏ. Kiểm tra API xác nhận mật khẩu admin sai bị từ chối và khách chưa đăng nhập không đọc được nhật ký admin.

- Đã sửa nút xử lý ở chi tiết chứng chỉ và tổ chức để cuộn theo hồ sơ. Minh chứng có khung riêng và số lượng tài liệu.
- Đã thêm bộ lọc chứng chỉ bị từ chối, lý do, hướng dẫn bổ sung và ngày xử lý. Admin có bộ lọc đối tác đăng ký và đề xuất sinh viên kèm số lượng, ngày gửi.
- Đã cố định chiều rộng nút đèn pin/chọn ảnh QR, rút gọn nhãn bật/tắt đèn. Khi camera lỗi, khung camera nhỏ lại và các phương án nhập mã/chọn ảnh nằm cùng vùng cuộn.
- Đã sửa đăng ký đối tác chỉ chuyển trạng thái sau khi lưu, có thể hoàn tất hồ sơ bằng tài khoản đã tạo. Từ chối/khóa đối tác chỉ cập nhật UI sau khi database xác nhận. Constraint database đã bổ sung trạng thái revoked.
- Admin đăng nhập bằng Supabase Auth và có chặn route theo vai trò, đăng xuất kết thúc phiên. Đã tạo tài khoản Auth cho email admin người dùng cung cấp. Máy chủ chặn sửa vai trò qua API và đăng ký tự nhận vai trò admin. Nhật ký/cấu hình hệ thống giới hạn cho admin.
- TypeScript đạt, lint không lỗi (6 cảnh báo có sẵn), build PWA đạt. Hồi quy local đạt 15/15. Kiểm tra bổ sung đạt đăng nhập/đăng xuất admin, route quản trị, bộ lọc và nút duyệt cuộn ở cả hai màn. Screenshot trong .expo/qa/feedback-update-*.
- Theo yêu cầu mới nhất, giữ phương án phê duyệt chứng chỉ hiện tại. Chưa thay đổi relayer hay cách cấp trên blockchain. Việc chống giao dịch lặp và xác nhận receipt thật vẫn còn trong danh sách cần xử lý của phần blockchain.
- Chưa hoàn tất phân quyền toàn bộ dữ liệu và kiểm tra link công khai phía máy chủ. Các policy đọc/ghi rộng còn lại và storage công khai vẫn là hạn chế bảo mật cần xử lý tiếp. Không coi sửa đăng nhập admin là hoàn tất toàn bộ phân quyền.
- Camera/đèn pin cần người dùng kiểm tra lại trên iPhone thật. Kiểm tra bằng trình duyệt giả lập không xác nhận phần cứng.

Các mục bên dưới là lịch sử rà soát trước đợt triển khai này.

Nguồn: phần comments của `feedback skillpass.docx` (13 comments, một số comment chứa nhiều ý), cùng hai yêu cầu đã thống nhất về đăng xuất và chuyển động xoay. Không coi 15 ca trong script tự động là 15 feedback; bảng dưới đối chiếu từng feedback riêng.

| # | Feedback | Kiểm tra đã thực hiện | Kết quả |
|---|---|---|---|
| 1 | Minh chứng sinh viên đẹp, giữ nhiều file | Chọn hai ảnh có tên QA, thấy hai hàng có thumbnail; gửi đến trường kiểm thử; database lưu đủ hai evidence_documents; mở lại chi tiết thấy cả hai | Đạt trên web |
| 2 | Gửi thông tin trường | Tái hiện lỗi CHECK constraint do gửi `lead`; sửa thành `pending`; gửi bằng tài khoản SV; thấy bản ghi trong database; admin kích hoạt trường thử từ danh sách | Đạt trên bản sửa |
| 3 | Ngày cấp | Nhập 12112026 thành 12/11/2026; 31/02/2026 bị chặn; ngày hợp lệ lưu được cùng hồ sơ QA | Đạt |
| 4 | Quản lý quyền link và QR | Tạo link thật; mở khi không đăng nhập thấy hồ sơ đã duyệt; thu hồi SP-59OO0Q lưu đúng trạng thái revoked; mở lại trên production không hiển thị hồ sơ; mã SP-9V00XT vẫn mở được | Luồng UI đạt; quyền database chưa bảo đảm chống truy cập vòng qua UI, chờ quyết định mở rộng sửa phân quyền |
| 5 | Chỉ hồ sơ chờ duyệt; đổi ảnh SV | Danh sách có hồ sơ QA chờ duyệt, không có hai chứng chỉ đã duyệt; mở chi tiết đúng trạng thái; chọn ảnh, xem trước, hủy, lưu, tải lại; khôi phục ảnh gốc | Đạt |
| 6 | Sao chép đủ link | Cho phép clipboard trong tab có focus; nội dung clipboard trùng URL đầy đủ của mã chia sẻ cả local và production; tải được PNG QR | Đạt |
| 7 | Mã chứng thực không có dấu ... | Đối chiếu nguyên hash 66 ký tự với database; sửa tràn ngang thành khối có xuống dòng; screenshot điện thoại xác nhận đọc được đủ | Đạt |
| 8 | Hiện/ẩn mật khẩu | Kiểm tra cả đăng nhập và đăng ký SV/DN: toggle đổi type password/text và trở lại | Đạt |
| 9 | Ảnh đại diện DN | Chọn ảnh, xem trước, lưu, tải lại thấy ảnh đã lưu; khôi phục ảnh cũ | Đạt |
| 10 | Yêu cầu cần xử lý và nhật ký | Nút thao tác nhanh mở đúng trang hồ sơ QA; nhật ký mở rộng thêm nội dung; không bấm phê duyệt tài liệu giả | Đạt |
| 11 | Mở tài liệu SV gửi | Đăng nhập DN thử; mở hồ sơ QA, thấy hai ảnh; phóng to và xác nhận ảnh tải thành công | Đạt |
| 12 | Placeholder ô mã QR | Khi nhập mã, placeholder không chồng lên nội dung | Đạt |
| 13 | Chọn ảnh QR, lỗi mã, Kiểm tra, đèn pin | Thử ô trống, mã sai, QR không thuộc SkillPass, ảnh không có QR, QR thật; có lỗi hoặc điều hướng đúng; ảnh không đè lên camera; chỉ hiện đèn nếu camera hỗ trợ | Web đạt; chờ camera/đèn pin trên điện thoại thật |
| 14 | Đăng xuất SV | Xóa phiên, trở lại /login; đăng nhập DN sau đó đúng tài khoản DN | Đạt |
| 15 | Xoay đều màn chào | So sánh transform theo thời gian, giữ chuyển động liên tục | Đạt |

## Các sửa bổ sung phát hiện khi kiểm thử

- Avatar dùng hộp thoại xem trước riêng, nút lưu/hủy rõ, không ép nút lưu vào hàng thông tin cá nhân.
- Danh sách chia sẻ có thẻ quyền truy cập, trạng thái, nút mở và thu hồi; trạng thái rỗng có hướng dẫn.
- Màn quét cuộn được trên điện thoại thấp; lỗi đặt dưới ô nhập; camera không chạy thì không giả hiệu ứng đang quét.
- Trang chi tiết chứng chỉ chờ dữ liệu khi tải lại thay vì tự chuyển về ví.
- Trang admin chi tiết không kẹt spinner khi dữ liệu tổ chức từ context tới trước truy vấn riêng.
- Nút chọn trường đóng danh sách sau khi chọn; danh sách dài không bị cắt bởi maxHeight thiếu vùng cuộn.

## Dữ liệu kiểm thử

- Trường: `Trường Kiểm thử SkillPass QA 12-11`, ID `7d7fa2a4-f38e-4895-80b4-d57ec38f9e72`, đã được admin kích hoạt theo yêu cầu người dùng.
- Một yêu cầu xác nhận sinh viên gửi trường này, hai ảnh ghi rõ `TEST FILE - NOT A CERTIFICATE`.
- Một hồ sơ `QA 15 feedback - kiểm thử tài liệu` gửi Công ty Mẫu A, hai ảnh QA, vẫn chờ duyệt. Không phê duyệt chứng nhận giả hoặc yêu cầu của người dùng khác.
- Ảnh đại diện cả hai tài khoản thử đã được khôi phục sau thử nghiệm.
- Screenshot và kết quả từng vòng trong `.expo/qa/` (không commit ảnh hồ sơ cá nhân hoặc thông tin đăng nhập).
- Gửi xác nhận trường thử đã cập nhật trường đang theo học của tài khoản SV thử sang tên trường QA; hồ sơ vẫn chưa được trường phê duyệt. Giữ dữ liệu có nhãn QA để người dùng đối chiếu.

## Triển khai và các vòng kiểm tra

- Commit ứng dụng: `84fe6ea`, nhánh chính hiện tại `master`.
- Vercel production READY: `dpl_C97CCkhS7WwUdFQKWgN6mLRQKZ5Z`, alias `https://skillpass-app-sooty.vercel.app/`.
- Bundle production trùng build đã kiểm tra: `entry-715617672056717d9dee961ae77fda4d.js`.
- TypeScript đạt; lint 0 lỗi, 6 cảnh báo có sẵn; build PWA đạt.
- Vòng regression local: 15/15 ca đạt. Vòng regression production: 15/15 ca đạt, không có exception JavaScript. Các ca này là kiểm tra kỹ thuật, không thay thế xác nhận đủ 15 feedback.
- Sau xem screenshot 320x568, tiếp tục sửa khung camera nhỏ lại và minWidth ô nhập; kiểm tra nút Kiểm tra nằm trong viewport. Đã kiểm tra bổ sung trên production: link thu hồi, link công khai còn hiệu lực, clipboard đúng URL, tải PNG, xóa một ảnh giữ nguyên ảnh còn lại.
- Chờ người dùng xác nhận quét camera/đèn pin điện thoại và quyết định phạm vi sửa hệ thống phân quyền. Chưa tuyên bố toàn bộ 15 feedback hoàn tất.

## Giới hạn và vấn đề ngoài 15 feedback

- Camera/đèn pin cần thử trên điện thoại thật; Chrome headless không xác nhận được phần cứng.
- Kiểm tra trực tiếp phát hiện đăng nhập admin hiện dùng nhánh chuyển trang theo email, chưa xác thực mật khẩu với Supabase Auth; email admin được cung cấp chưa có bản ghi Auth. Các policy database cũ cũng đang mở rộng quyền đọc/ghi. Chưa sửa hệ thống phân quyền trong đợt chỉnh 15 feedback này; không coi kết quả UI đạt là xác nhận an toàn bảo mật production.
- Kiểm thử không xác nhận giao dịch blockchain có receipt hợp lệ. Việc admin hiện trạng thái kích hoạt là kiểm tra luồng ứng dụng/database.

## Ghi chú cho vòng cải tiến doanh nghiệp và admin

### Giao diện

- Đã thống nhất bố trí nút duyệt cuộn theo trang. Ở màn duyệt chứng chỉ của doanh nghiệp, đặt các nút “Phê duyệt” và “Từ chối” cuối nội dung, sau phần tài liệu minh chứng. Làm nổi mục “Tài liệu minh chứng” và hiển thị số tài liệu. Ở màn duyệt trường của admin, đặt các nút xử lý cuối nội dung, sau phần thông tin thẩm định. Kiểm tra trên điện thoại để xác nhận các nút cuộn cùng nội dung và chỉ xuất hiện khi cuộn tới cuối hồ sơ. Chưa triển khai.
- Đề xuất giao diện doanh nghiệp. Thêm mục “Đã từ chối” để tra lại hồ sơ, lý do và ngày xử lý. Bộ lọc hiện tại chỉ nhận hồ sơ chờ duyệt và đã duyệt từ lớp dữ liệu.
- Đề xuất giao diện admin. Tách hàng chờ “Đối tác đăng ký” và “Trường do sinh viên đề xuất”. Hiển thị số lượng và ngày gửi để người xử lý biết nên bắt đầu ở đâu.
- Đề xuất màn quét QR. Khi camera không mở được, thu gọn khung camera và đặt “Chọn ảnh QR” cùng ô nhập mã gần thông báo lỗi để người dùng dễ tiếp tục. Chưa chốt triển khai.

### Logic và thứ tự ưu tiên

- Ưu tiên 1 — Xác thực và phân quyền. Xác thực admin qua Supabase Auth, kiểm tra vai trò phía máy chủ trước khi xem hoặc xử lý hồ sơ quản trị. Giới hạn quyền đọc/ghi theo vai trò và đơn vị. Máy chủ cần kiểm tra link còn hiệu lực trước khi trả dữ liệu hồ sơ cho người mở link hoặc quét QR.
- Ưu tiên 2 — Trạng thái đăng ký và xử lý đối tác phải phản ánh kết quả lưu thật, đồng thời đăng xuất admin phải kết thúc phiên.
- Ưu tiên 3 — Ngăn giao dịch cấp chứng chỉ lặp khi xử lý đồng thời hoặc thử lại sau lỗi lưu.

#### Các lỗi ghi nhận qua rà mã

- Rà mã đăng ký doanh nghiệp cho thấy bước tạo tài khoản có thể thành công dù bước lưu tổ chức thất bại. Màn hình vẫn chuyển sang chờ duyệt, trong khi admin có thể không nhận được hồ sơ. Cần báo lỗi lưu và cho gửi lại hồ sơ bằng tài khoản đã tạo.
- Rà mã admin cho thấy từ chối và khóa đối tác cập nhật giao diện trước khi xác nhận lưu database, đồng thời bỏ qua kết quả `false`. Cần chỉ báo thành công khi trạng thái đã lưu. Nút đăng xuất admin cũng chỉ chuyển về màn chào và chưa gọi hàm đăng xuất phiên.
- Rà mã ký chứng chỉ cho thấy giao dịch blockchain được gửi trước khi cập nhật có điều kiện trong database. Nếu giao dịch thành công nhưng lưu thất bại, hoặc hai người xử lý cùng lúc, thao tác lại có nguy cơ tạo thêm giao dịch. Cần chặn xử lý đồng thời và đối soát giao dịch trước khi cho thử lại.
- Các lỗi logic trên được ghi nhận qua rà mã. Chưa tái hiện các tình huống thất bại hoặc xử lý đồng thời trên production.

### Lỗi giao diện trên điện thoại — Nút Chọn ảnh QR đổi vị trí khi bật/tắt đèn pin

- **Trạng thái:** Đã ghi nhận, chưa sửa và chưa triển khai. Xử lý cùng lượt với các feedback còn lại.
- **Bước kiểm tra:** Mở “Quét mã QR” trên iPhone và quan sát vị trí nút “Chọn ảnh QR” trước và sau khi bật hoặc tắt đèn pin.
- **Biểu hiện:** Nút “Chọn ảnh QR” dịch chuyển khi trạng thái đèn pin thay đổi.
- **Kết quả mong đợi:** Nút “Chọn ảnh QR” giữ nguyên vị trí khi bật và tắt đèn pin. Kiểm tra lại trên điện thoại thật.

## Chạy lại

`scripts/qa-feedback.cjs` dùng Chrome headless với remote debugging port 9430 và helper `scripts/qa-browser.cjs`. Cung cấp `QA_ORIGIN`, `QA_STUDENT_EMAIL`, `QA_STUDENT_PASSWORD`, `QA_BIZ_EMAIL`, `QA_BIZ_PASSWORD` qua môi trường; không ghi mật khẩu vào file. Cần fixture ảnh QA tại `.expo/qa/evidence.json` và hồ sơ thử ở trên. Suite không submit/approve hồ sơ, kết quả ghi tại `.expo/qa/regression-results.json`.
