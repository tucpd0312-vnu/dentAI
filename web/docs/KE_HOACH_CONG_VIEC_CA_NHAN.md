# Kế hoạch và tiến độ phần việc cá nhân

Ngày rà soát: 26/08/2026  
Phạm vi phụ trách: từ **chia sẻ RNNHT 3D** đến các hạng mục giao diện được giao.

## Quy ước trạng thái

- `[x]` Đã hoàn thành và đã kiểm tra.
- `[ ]` Chưa hoàn thành.
- `BLOCKED` Chưa thể làm đúng nếu thiếu tiền điều kiện hoặc quyết định sản phẩm.

## Hiện trạng nhóm sau khi đọc mã nguồn

- [x] Dropdown nhóm các loại bệnh đã có trong sidebar.
- [x] Trang quản lý RNNHT 3D, tải CBCT theo chunk, xem lát cắt, mở Slicer, tải ZIP dự phòng và lưu phiên bản phân vùng đã có.
- [x] Chia sẻ ca viêm lợi cho tài khoản cá nhân đã có.
- [x] Phân quyền nền tảng theo ba vai trò admin, bác sĩ, bệnh nhân đã có.
- [ ] Kho dữ liệu dùng chung chưa có model, API, màn hình hay chính sách duyệt dữ liệu.
- [x] Chia sẻ cá nhân cho RNNHT 3D đã được bổ sung trong đợt triển khai này.

## Các việc có thể thực hiện ngay

### UI-01 — Sidebar

- [x] Đổi đúng tên nhóm thành **AI hỗ trợ chẩn đoán lâm sàng**.
- [x] Các danh mục hiện đã dùng Material Symbols; không cần bộ tài nguyên icon bên ngoài.
- Tiêu chí hoàn thành: dropdown vẫn đóng/mở được, trạng thái active và phân quyền vai trò không đổi.

### AUTH-01 — Hiện/ẩn mật khẩu

- [x] Thêm nút hiện/ẩn mật khẩu ở trang đăng nhập.
- [x] Nút có `aria-label`, không submit form và dùng được bằng bàn phím.
- Tiêu chí hoàn thành: đổi qua lại giữa `password` và `text`, không làm mất giá trị đã nhập.

### AUTH-02 — Quên mật khẩu bằng OTP

- [x] API yêu cầu mã OTP đặt lại mật khẩu; không tiết lộ email có tồn tại hay không.
- [x] Giới hạn tần suất gửi/thử mã theo IP.
- [x] API xác minh OTP, áp dụng cùng chính sách mật khẩu khi đăng ký và vô hiệu refresh token cũ.
- [x] Trang quên mật khẩu gồm hai bước: nhập email, rồi nhập OTP và mật khẩu mới.
- [x] Có liên kết qua lại với trang đăng nhập và nút hiện/ẩn mật khẩu mới.
- Tiêu chí hoàn thành: luồng thành công, OTP sai/hết hạn, mật khẩu yếu và xác nhận không khớp đều được xử lý.

### SHARE-3D-01 — Chia sẻ RNNHT 3D cho cá nhân

- [x] Thêm bảng chia sẻ phim, quyền `view` và `edit`, không có link công khai.
- [x] Chỉ chủ phim hoặc admin được chia sẻ, đổi quyền và thu hồi.
- [x] Chỉ tài khoản bác sĩ/admin đang hoạt động được nhận phim CBCT.
- [x] Người có quyền `view` chỉ xem, tải, mở Slicer; không được xoá hoặc nộp phân vùng.
- [x] Người có quyền `edit` được nộp phân vùng; vẫn không được xoá hay chia sẻ tiếp.
- [x] Thêm modal chia sẻ vào trang chi tiết phim.
- [x] Hiển thị phim được chia sẻ trong tab **Được chia sẻ với tôi** của Lịch sử.
- [x] Ghi nhật ký chia sẻ/thu hồi thuộc module Răng nanh ngầm 3D.
- Tiêu chí hoàn thành: kiểm thử ma trận chủ sở hữu/người xem/người sửa/người ngoài/admin.

### SLICER-01 — Trang tải và kiểm tra tích hợp

- [x] Tạo trang hướng dẫn cài 3D Slicer theo hệ điều hành.
- [x] Cung cấp gói DentAI Slicer Bridge từ server, không sao chép thủ công mã nguồn bridge.
- [x] Khi mở giao thức `dentai://`, dùng `blur`/`visibilitychange` làm kiểm tra gần đúng; nếu trình duyệt vẫn ở trang sau timeout thì chuyển sang trang cài đặt.
- [x] Giữ nút tải ZIP thủ công làm phương án dự phòng.
- Giới hạn kỹ thuật: JavaScript trên trình duyệt không có API xác nhận chắc chắn một ứng dụng desktop đã cài. Kiểm tra giao thức tùy chỉnh chỉ là heuristic và phải nói rõ trên giao diện.

### VERIFY-01 — Kiểm tra kỹ thuật

- [x] Tạo và chạy migration `scans.0003` và `users.0006`.
- [x] `manage.py check` đạt; 8/8 test backend mới đạt.
- [x] Type-check và production build frontend đạt, gồm đủ 19 route.
- [ ] ESLint độc lập — `next lint` đang yêu cầu khởi tạo cấu hình tương tác vì dự án chưa có file cấu hình ESLint; không tự chọn chuẩn thay nhóm.
- [x] `git diff --check -- web` đạt; không ghi đè các thay đổi cục bộ có sẵn của nhóm.

Kết quả smoke-test giao diện:

- [x] Nút hiện mật khẩu đổi `type=password` sang `type=text` và giữ nguyên nội dung.
- [x] Liên kết Quên mật khẩu mở đúng trang hai bước và response gửi mã không lộ email tồn tại.
- [x] Trang `/downloads/3d-slicer/` nhận diện Windows, hiển thị đủ hai bước, link chính thức và link tải Bridge.
- [x] Endpoint Bridge trả HTTP 200, `application/zip`, dung lượng 11.285 byte.

## Các việc đang thiếu tiền điều kiện

### REPOSITORY-01 — Chia sẻ dữ liệu viêm lợi lên Kho dữ liệu — BLOCKED

- [ ] Cần model/API Kho dữ liệu và định danh bản ghi đích.
- [ ] Cần chốt dữ liệu nào được sao chép hay chỉ liên kết: ảnh gốc, ảnh chú thích, detection, caption, thông tin bệnh nhân.
- [ ] Cần chốt ẩn danh hóa, người duyệt, quyền thu hồi, thời hạn lưu và audit log.
- Có thể bắt đầu sau khi các hợp đồng API và chính sách trên được duyệt.

### DASHBOARD-01 — Thiết kế lại Tổng quan — BLOCKED một phần

- [ ] Cần chốt KPI theo từng vai trò, nguồn dữ liệu, khoảng thời gian mặc định và mockup được duyệt.
- Có thể làm ngay sau khi có danh sách KPI; không nên tự đặt số liệu y tế hoặc quyền nhìn dữ liệu.

### SLICER-02 — Xác nhận cài đặt tuyệt đối — BLOCKED bởi nền tảng trình duyệt

- [ ] Nếu cần kết quả chắc chắn, phải bổ sung desktop helper/localhost health-check hoặc extension trình duyệt có API bắt tay.
- Bản web hiện tại chỉ có thể dùng heuristic và chuyển trang dự phòng.

### DEPLOY-01 — Bí mật và email môi trường thật — BLOCKED bởi cấu hình triển khai

- [ ] Thay `SECRET_KEY=change-me-in-production` bằng secret ngẫu nhiên tối thiểu 32 byte; test hiện cảnh báo khóa HMAC quá ngắn.
- [ ] Cấu hình SMTP thật và tắt việc in OTP ra console trước khi đưa lên production. Chế độ in OTP hiện được giữ lại để nhóm test local khi chưa có SMTP.

## Thứ tự thực hiện

1. UI-01 và AUTH-01.
2. AUTH-02.
3. SHARE-3D-01 (backend trước, frontend sau).
4. SLICER-01.
5. VERIFY-01; chỉ đánh dấu `[x]` khi kiểm tra tương ứng đạt.
