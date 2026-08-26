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
- [x] Kho dữ liệu đã có model, API tải lên theo chunk, xem, tải xuống, phân loại, phân quyền và giao diện cho mọi vai trò.
- [x] Mọi vai trò đều nhập được tên, tuổi, giới tính, mô tả tình trạng và phân loại **Khác** khi tải lên; bệnh nhân chỉ đọc PHI trên tư liệu do chính họ tải.
- [x] Chia sẻ cá nhân cho RNNHT 3D đã được bổ sung trong đợt triển khai này.
- [x] Tiền điều kiện `source_scan`, `source_case`, `source_image` của Kho dữ liệu đã được đồng nghiệp bổ sung và merge vào `develop`.

## Các việc có thể thực hiện ngay

### UI-01 — Sidebar

- [x] Đổi đúng tên nhóm thành **AI hỗ trợ chẩn đoán lâm sàng**.
- [x] Các danh mục hiện đã dùng Material Symbols; không cần bộ tài nguyên icon bên ngoài.
- Tiêu chí hoàn thành: dropdown vẫn đóng/mở được, trạng thái active và phân quyền vai trò không đổi.

### AUTH-01 — Hiện/ẩn mật khẩu

- [x] Thêm nút hiện/ẩn mật khẩu ở trang đăng nhập.
- [x] Thêm nút hiện/ẩn cho cả mật khẩu và xác nhận mật khẩu ở trang đăng ký.
- [x] Đăng nhập chấp nhận tên đăng nhập hoặc email; duyệt vai trò bác sĩ không làm thay đổi mật khẩu.
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

### SHARE-3D-02 — Chia sẻ RNNHT 3D lên Kho dữ liệu

- [x] Thêm API sao chép phim CBCT đã xử lý vào danh mục **Răng nanh ngầm**.
- [x] Chỉ chủ phim hoặc admin được thực hiện; người nhận quyền `view/edit` không được sao chép tiếp.
- [x] Chỉ nhận phim ở trạng thái `ready` và đã khử PHI.
- [x] File trong kho là bản sao độc lập, có `source_scan` để truy vết và chống tạo trùng.
- [x] Chạy lại pipeline Kho dữ liệu để tạo preview/thumbnail và kiểm tra DICOM.
- [x] Thêm nút **Lưu vào Kho dữ liệu** và modal metadata trên trang chi tiết phim.

### REPOSITORY-01 — Chia sẻ kết quả Viêm lợi lên Kho dữ liệu

- [x] Thêm API sao chép ảnh kết quả vào danh mục **Viêm lợi**.
- [x] Cho chọn ảnh gốc hoặc ảnh có chú thích; tự điền mô tả lâm sàng từ caption cuối cùng.
- [x] Gắn `source_case` và `source_image`, sao chép file độc lập và chống tạo trùng theo người dùng/ảnh nguồn.
- [x] Chỉ chủ ca hoặc admin được thực hiện; người nhận ca được chia sẻ không được sao chép tiếp.
- [x] Vai trò bệnh nhân được lưu ca do chính họ tạo, nhưng API Kho dữ liệu vẫn cắt PHI theo chính sách vai trò.
- [x] Thêm nút **Lưu vào Kho dữ liệu** và modal chọn bản ảnh trên trang kết quả viêm lợi.

### DASHBOARD-01 — Thiết kế lại Tổng quan

- [x] Thiết kế khối chào mừng và lối tắt tạo chẩn đoán/tải dữ liệu.
- [x] Bổ sung thẻ RNNHT 3D và Kho dữ liệu với số tổng, sẵn sàng, đang xử lý và được chia sẻ.
- [x] Mọi số liệu dùng chung chính sách phạm vi của backend; bệnh nhân không nhận thống kê phim CBCT.
- [x] Giữ các KPI lâm sàng MGI hiện có, không tự phát minh số liệu y tế mới.

### SLICER-01 — Trang tải và kiểm tra tích hợp

- [x] Tạo trang hướng dẫn cài 3D Slicer theo hệ điều hành.
- [x] Cung cấp gói DentAI Slicer Bridge từ server, không sao chép thủ công mã nguồn bridge.
- [x] Khi mở giao thức `dentai://`, dùng `blur`/`visibilitychange` làm kiểm tra gần đúng; nếu trình duyệt vẫn ở trang sau timeout thì chuyển sang trang cài đặt.
- [x] Giữ nút tải ZIP thủ công làm phương án dự phòng.
- Giới hạn kỹ thuật: JavaScript trên trình duyệt không có API xác nhận chắc chắn một ứng dụng desktop đã cài. Kiểm tra giao thức tùy chỉnh chỉ là heuristic và phải nói rõ trên giao diện.

### VERIFY-01 — Kiểm tra kỹ thuật

- [x] Chuỗi migration sau merge hợp lệ: `scans.0003` và `users.0006 → users.0007`; tính năng chia sẻ lên kho không cần đổi schema.
- [x] `manage.py check` và `makemigrations --check --dry-run` đạt.
- [x] 33/33 test `apps.library` đạt, gồm quyền nguồn, chống tạo trùng và sao chép file độc lập.
- [x] Toàn bộ 51/51 test backend đạt trên PostgreSQL, gồm phân quyền Kho dữ liệu, import nguồn, xác thực và số liệu Tổng quan.
- [x] API lưu phim 3D/ảnh viêm lợi vào Kho dữ liệu khóa bản ghi hợp lệ trên PostgreSQL, không dùng `FOR UPDATE` trực tiếp trên queryset `DISTINCT`.
- [x] Type-check và production build frontend đạt, sinh đủ 22 trang/route.
- [ ] ESLint độc lập — `next lint` đang yêu cầu khởi tạo cấu hình tương tác vì dự án chưa có file cấu hình ESLint; không tự chọn chuẩn thay nhóm.
- [x] `git diff --check` đạt; không có dấu xung đột hoặc khoảng trắng lỗi trong thay đổi mới.

Kết quả smoke-test giao diện:

- [x] Nút hiện mật khẩu đổi `type=password` sang `type=text` và giữ nguyên nội dung.
- [x] Liên kết Quên mật khẩu mở đúng trang hai bước và response gửi mã không lộ email tồn tại.
- [x] Trang `/downloads/3d-slicer/` nhận diện Windows, hiển thị đủ hai bước, link chính thức và link tải Bridge.
- [x] Endpoint Bridge trả HTTP 200, `application/zip`, dung lượng 11.285 byte.

## Các giới hạn môi trường còn lại

### SLICER-02 — Xác nhận cài đặt tuyệt đối — BLOCKED bởi nền tảng trình duyệt

- [ ] Nếu cần kết quả chắc chắn, phải bổ sung desktop helper/localhost health-check hoặc extension trình duyệt có API bắt tay.
- Bản web hiện tại chỉ có thể dùng heuristic và chuyển trang dự phòng.

### DEPLOY-01 — Bí mật và email môi trường thật — BLOCKED bởi cấu hình triển khai

- [ ] Thay `SECRET_KEY=change-me-in-production` bằng secret ngẫu nhiên tối thiểu 32 byte; test hiện cảnh báo khóa HMAC quá ngắn.
- [ ] Cấu hình SMTP thật và tắt việc in OTP ra console trước khi đưa lên production. Chế độ in OTP hiện được giữ lại để nhóm test local khi chưa có SMTP.

## Thứ tự thực hiện

1. [x] UI-01, AUTH-01 và AUTH-02.
2. [x] SHARE-3D-01 và SLICER-01.
3. [x] Merge Kho dữ liệu từ `origin/develop` và xử lý migration xung đột.
4. [x] SHARE-3D-02 và REPOSITORY-01.
5. [x] DASHBOARD-01.
6. [x] VERIFY-01; toàn bộ kiểm tra tự động đã đạt.
7. [x] Commit hoàn thiện trên `develop`.
