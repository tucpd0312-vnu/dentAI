# dentAI

Hệ thống hỗ trợ chẩn đoán viêm lợi từ ảnh trong miệng và quản lý dữ liệu nha khoa.
Đây là ứng dụng nghiên cứu/demo, không thay thế đánh giá lâm sàng của bác sĩ.

## Chức năng chính

- Phân tích ảnh viêm lợi từ máy tính hoặc kho dữ liệu; xem, chỉnh sửa theo quyền và xuất kết quả.
- Kho dữ liệu: tải lên, phân loại, lưu thông tin bệnh nhân, xem và tải xuống ảnh, DICOM, tài liệu.
- Quản lý và chia sẻ phim CBCT răng nanh ngầm 3D, tích hợp với 3D Slicer.
- Tài khoản admin/bác sĩ/bệnh nhân, xác thực OTP, phê duyệt vai trò và khôi phục mật khẩu.

AI hiện hỗ trợ viêm lợi; module CBCT hỗ trợ quản lý/xử lý phim và mở trong Slicer,
chưa tự chẩn đoán bằng AI. Dữ liệu trong kho chỉ được truy cập theo quyền, không tự công khai.

## Công nghệ và cấu trúc

Next.js 14 · TypeScript · Django REST Framework · PostgreSQL · Celery · Redis · PyTorch/YOLOv9.
Caption hỗ trợ T5 hoặc bộ luật dự phòng.

```text
inferences/          Pipeline AI và cấu hình mô hình
web/backend/         API, tài khoản, kho dữ liệu và tác vụ nền
web/frontend/        Giao diện web
web/slicer_bridge/   Cầu nối với 3D Slicer
web/docs/            Tài liệu hệ thống
```

## Chạy dự án

### 1. Khởi động web

Cần Git và Docker Desktop. Tại thư mục gốc, chạy PowerShell:

```powershell
if (!(Test-Path web/.env)) { Copy-Item web/.env.example web/.env }
if (!(Test-Path web/backend/.env)) { Copy-Item web/backend/.env.example web/backend/.env }
# Kiểm tra cấu hình DB, SECRET_KEY và tài khoản admin trong web/.env trước khi chạy.
cd web
docker compose up -d --build
docker compose ps
```

Compose chạy DB, Redis, backend, frontend và worker xử lý kho/CBCT; backend tự chạy migration.
Truy cập [Web](http://localhost:3001) hoặc [Django Admin](http://localhost:8002/admin/).
Tài khoản quản trị ban đầu được cấu hình qua `SEED_ADMIN_*` trong `web/.env`.

Mặc định OTP được in trong log backend (`docker compose logs --tail 50 backend`).
Muốn gửi email thật, cấu hình SMTP và `EMAIL_BACKEND`, rồi tạo lại container backend.

### 2. Khởi động worker AI

AI viêm lợi cần mã YOLOv9 tại `yolov9/` và ba trọng số trong `inferences/models/`:
`best_vqt.pt`, `best_vl.pt`, `best_seg.pt`. Các tài nguyên này cần chuẩn bị riêng.
Chuẩn bị môi trường Python `.venv` có phụ thuộc backend và inference tương thích với CPU/GPU;
`web/requirements.worker.txt` là cấu hình CUDA, không phải bộ cài CPU phổ dụng.

Mở PowerShell khác tại thư mục gốc (ví dụ chạy CPU):

```powershell
$projectRoot = (Get-Location).Path
$workerPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
$env:DATABASE_URL = 'postgres://dentai:dentai@localhost:5432/dentai'
$env:CELERY_BROKER_URL = 'redis://localhost:6380/0'
$env:CELERY_RESULT_BACKEND = 'redis://localhost:6380/0'
$env:MEDIA_ROOT = Join-Path $projectRoot 'web\media'
$env:INFERENCES_DIR = Join-Path $projectRoot 'inferences'
$env:YOLOV9_DIR = Join-Path $projectRoot 'yolov9'
$env:INFERENCE_DEVICE = 'cpu'
$env:CAPTION_MODE = 'auto'
cd web/backend
& $workerPython -m celery -A config.celery worker --loglevel=info --pool=solo --concurrency=1 -Q inference
```

Điều chỉnh `DATABASE_URL` cho khớp `web/.env`; biến Compose không tự nạp vào PowerShell.
Web/kho dữ liệu/CBCT vẫn chạy khi chưa có worker AI, nhưng ca viêm lợi sẽ chờ xử lý.

### 3. Caption và 3D Slicer

- `CAPTION_MODE=auto`: dùng T5 khi checkpoint đầy đủ; thiếu/lỗi thì dùng luật.
- `CAPTION_MODE=rule`: chỉ dùng luật. `CAPTION_MODE=t5`: bắt buộc có T5.
- `T5_MODEL_DIR`: thư mục checkpoint; mặc định `inferences/t5_training/t5_gingivitis_model/`.
  Cần mô hình đã huấn luyện phù hợp tác vụ; khởi động lại worker sau khi thay đổi cấu hình.
- Thiết lập Slicer tại `/downloads/3d-slicer/`; xem [hướng dẫn Bridge](web/slicer_bridge/README.md).

## Cập nhật và kiểm tra

Sau khi lấy mã mới từ nhánh `develop`, chạy trong thư mục `web`:

```powershell
docker compose up -d --build backend frontend scans_worker
docker compose exec -T backend python manage.py migrate
docker compose exec -T backend python manage.py check
docker compose exec -T frontend npm run lint
```

Khởi động lại worker AI khi thay mã/cấu hình và tải lại trình duyệt bằng Ctrl+F5.
Để kiểm tra bản build: `docker compose run --rm --no-deps frontend npm run build`.

Không commit `.env`, trọng số mô hình hoặc dữ liệu bệnh nhân. Sao lưu DB và các thư mục
`web/media/`, `web/backend/library_storage/`, `web/backend/scans_storage/`.
Không dùng `docker compose down -v` để cập nhật vì có thể mất dữ liệu.
Trước triển khai thật cần HTTPS, secret riêng và cơ chế phục vụ dữ liệu có xác thực;
cấu hình Compose hiện tại dành cho demo.

Tài liệu chi tiết: [Thiết kế hệ thống](web/docs/SYSTEM_DESIGN.md).
