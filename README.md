# dentAI — Hệ thống AI chẩn đoán viêm lợi từ ảnh trong miệng

dentAI là hệ thống hỗ trợ bác sĩ nha khoa chẩn đoán **viêm lợi (gingivitis)** từ ảnh nội nha
(intraoral photograph). Hệ thống gồm hai phần:

- **`inferences/`** — pipeline AI: phát hiện mức độ viêm lợi từng răng và sinh mô tả lâm sàng.
- **`web/`** — ứng dụng web demo cho bác sĩ: upload ảnh, xem kết quả, chỉnh sửa, xuất báo cáo.

---

## 1. Pipeline AI (`inferences/`)

### 1.1. Ý tưởng

Thay vì phân loại nhị phân toàn ảnh (có/không viêm lợi), dentAI **chấm điểm mức độ viêm cho
từng răng** theo thang **Modified Gingival Index (MGI 0–4)** trên 12 răng cửa
(hàm trên: 13, 12, 11, 21, 22, 23; hàm dưới: 43, 42, 41, 31, 32, 33 — ký hiệu FDI).

Kết quả từng răng được biểu diễn dưới dạng **chuỗi cấu trúc**, rồi mới đưa qua mô hình ngôn ngữ
để sinh mô tả lâm sàng (**structured-to-text**), thay vì sinh caption trực tiếp từ ảnh
(image-to-text). Nhờ vậy mô tả lâm sàng luôn **truy vết được tới từng răng** và **giảm đáng kể
hallucination**.

### 1.2. Luồng xử lý

```
Ảnh nội nha đầu vào
    ↓
[best_vqt.pt]  YOLOv9 — phát hiện cung hàm trên / hàm dưới (ROI)
    ↓ crop ROI
┌──────────────────────────────┬───────────────────────────────┐
│ [best_vl.pt]                 │ [best_seg.pt]                 │
│ YOLOv9 detection             │ YOLOv9 segmentation           │
│ → vùng viêm lợi + MGI 0–4    │ → mask từng răng (FDI)        │
└──────────────────────────────┴───────────────────────────────┘
    ↓
Tooth–Disease Matching  (ghép vùng viêm ↔ răng)
    score = 0.5·IoU + 0.4·(1 − centroid_dist_norm) + 0.1·area_ratio
    → Hungarian algorithm (tối ưu ghép cặp toàn cục)
    ↓
Confidence gate (ngưỡng 0.5)
    ├── FAIL → cảnh báo độ tin cậy thấp, đề nghị chụp lại / khám lâm sàng
    └── PASS ↓
[T5]  seq2seq — sinh mô tả lâm sàng
    Input:  "Tooth gingivitis levels: 2, 1, 0, 1, 2, 0, 3, 2, 1, 0, 1, 2"
    Output: mô tả lâm sàng bằng ngôn ngữ tự nhiên
    ↓
Ảnh chú thích (box + mask) + mô tả lâm sàng
```

### 1.3. Thành phần chính

| File | Vai trò |
|------|---------|
| `inferences/main.py` | Orchestrator toàn pipeline, entry point |
| `inferences/get_image.py` | `get_mask` / `get_roi` / `get_box` / `draw_box_on_mask` |
| `inferences/matching.py` | Hungarian matching + confidence gate |
| `inferences/get_caption.py` | Load T5, build input, sinh caption (beam search width=5) |
| `inferences/detect_dual_custom.py` | Wrapper YOLOv9 detection |
| `inferences/evaluate_captions.py` | Đánh giá caption: BLEU-1→4, ROUGE-L, METEOR |
| `inferences/models/` | Trọng số: `best_vqt.pt`, `best_vl.pt`, `best_seg.pt` |
| `inferences/t5_training/t5_gingivitis_model/` | Mô hình T5 (định dạng HuggingFace) |

### 1.4. Quy ước

- Thứ tự răng trong chuỗi T5: `13, 12, 11, 21, 22, 23, 43, 42, 41, 31, 32, 33`
  (hàm trên phải→trái, hàm dưới phải→trái). Răng không ghép được → mặc định MGI `0`.
- Sinh caption tất định: `num_beams=5`, `do_sample=False`.
- Khoảng cách tâm luôn được chuẩn hoá theo kích thước ảnh để không phụ thuộc độ phân giải.

### 1.5. Đánh giá

- Detection / grading: Precision, mAP@50, Sensitivity, Specificity.
- Caption: BLEU-1→4, ROUGE-L, METEOR (so với 3 mô tả tham chiếu của chuyên gia).

---

## 2. Ứng dụng web (`web/`)

Web demo dành cho bác sĩ nha khoa, chạy local qua Docker Compose.

### 2.1. Tech stack

| Layer | Công nghệ |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, PrimeReact, react-konva |
| Backend | Django 4.2 + Django REST Framework |
| Task queue | Celery + Redis (chạy inference bất đồng bộ) |
| Database | PostgreSQL 15 |
| Đóng gói | Docker Compose |

### 2.2. Kiến trúc

```
web/
├── frontend/            # Next.js app
├── backend/             # Django project
│   ├── config/          # settings, urls, celery
│   └── apps/
│       ├── cases/       # models, views, serializers, tasks, render, export
│       └── settings_app/
├── media/               # ảnh gốc + ảnh annotated
└── docker-compose.yml
```

Dịch vụ:

| Service | Vai trò | Port (host) |
|---------|---------|-------------|
| `frontend` | Next.js | 3001 |
| `backend` | Django + DRF | 8002 |
| `worker` | Celery worker chạy pipeline AI | — |
| `db` | PostgreSQL 15 | 5432 |
| `redis` | Redis 7 (broker Celery) | 6380 |

### 2.3. Luồng sử dụng

1. Bác sĩ nhập thông tin bệnh nhân và upload một hoặc nhiều ảnh nội nha.
2. Backend tạo `Case` + các `Image` (status `queued`) và đẩy task vào Celery.
3. Màn hình Processing hiển thị tiến độ (poll mỗi 2 giây).
4. Worker chạy pipeline `inferences/` cho từng ảnh (tuần tự, tránh OOM), lưu vào DB:
   bounding box viêm lợi, mask răng, caption, ảnh annotated.
5. Xong tất cả → tự chuyển sang màn hình kết quả ảnh đầu tiên.
6. Bác sĩ xem ảnh annotated (bật/tắt box và mask), đọc mô tả lâm sàng, chuyển ảnh trước/sau.
7. Bác sĩ có thể vào chế độ Edit: kéo/resize/thêm/xoá box, đổi răng và mức MGI, sửa caption.
8. Xuất kết quả dạng ZIP (ảnh annotated render lại theo box hiện hành + nhãn YOLO + caption).

### 2.4. Màn hình

| Route | Chức năng |
|-------|-----------|
| `/analysis/new` | Upload ảnh + thông tin bệnh nhân |
| `/analysis/[caseId]/processing` | Theo dõi tiến độ xử lý |
| `/analysis/[caseId]/results/[imageIndex]` | Xem kết quả (ảnh annotated + caption) |
| `/analysis/[caseId]/results/[imageIndex]/edit` | Chỉnh sửa box và caption |
| `/history` | Lịch sử ca, tìm kiếm, lọc theo trạng thái |
| `/settings` | Cấu hình ngưỡng confidence |
| `/help` | Hướng dẫn sử dụng |

### 2.5. API chính

```
POST   /api/cases/                                # Tạo case + upload ảnh (multipart)
GET    /api/cases/                                # Danh sách ca
GET    /api/cases/{id}/status/                    # Trạng thái xử lý (polling)
GET    /api/cases/{id}/images/{idx}/              # Kết quả một ảnh
PATCH  /api/cases/{id}/images/{idx}/              # Lưu chỉnh sửa caption

POST   /api/cases/{id}/images/{idx}/detections/   # Thêm box mới
PATCH  /api/detections/{id}/                      # Sửa box
DELETE /api/detections/{id}/                      # Xoá box (soft delete)

GET    /api/cases/{id}/images/{idx}/export/       # Tải ZIP một ảnh
GET    /api/cases/{id}/export/                    # Tải ZIP cả ca
GET/PATCH /api/settings/                          # Ngưỡng confidence
```

### 2.6. Mô hình dữ liệu

- **Patient** — thông tin bệnh nhân (tên, mã, ghi chú).
- **Case** — một lần upload + phân tích, có snapshot `confidence_threshold`.
- **Image** — mỗi ảnh trong ca; trạng thái `queued | processing | done | low_confidence | failed`.
- **Detection** — box viêm lợi: `tooth_fdi`, `mgi_level` (0–4), toạ độ YOLO normalized,
  `source` (`ai` / `doctor`), `is_modified`, `is_deleted` (soft delete), `match_score`.
- **Mask** — polygon răng (chỉ hiển thị, không chỉnh sửa).
- **Caption** — `ai_text` (bản gốc T5, không bao giờ ghi đè) và `edited_text` (bản bác sĩ sửa).

---

## 3. Cài đặt và chạy hệ thống web

### 3.1. Yêu cầu

- **Docker** và **Docker Compose** (v2+).
- **GPU NVIDIA + driver + NVIDIA Container Toolkit** nếu muốn chạy inference trên GPU
  (có thể chạy CPU nhưng rất chậm).
- **Conda** (Miniconda/Anaconda) — dùng cho worker chạy trực tiếp trên host (khuyến nghị,
  vì worker cần truy cập GPU và trọng số mô hình).
- Trọng số mô hình đã đặt sẵn tại `inferences/models/` và `inferences/t5_training/`
  (không được commit vào git — copy thủ công).
- Mã nguồn YOLOv9 tại `yolov9/` ở thư mục gốc project.

Kiểm tra trước khi chạy:

```bash
ls inferences/models/            # best_vqt.pt  best_vl.pt  best_seg.pt
ls inferences/t5_training/t5_gingivitis_model/
ls yolov9/                       # repo YOLOv9 (nếu chưa có thì clone từ github <https://github.com/ultralytics/yolov9>)
```

### 3.2. Khởi động hạ tầng + backend + frontend

```bash
cd web
docker compose up -d --build
```

Lệnh này bật 4 service: `db`, `redis`, `backend`, `frontend`
(service `worker` nằm trong profile riêng).
Backend tự chạy `manage.py migrate` khi khởi động.

Kiểm tra:

```bash
docker compose ps
docker compose logs -f backend
```

Truy cập:

- Web app: <http://localhost:3001>
- API: <http://localhost:8002/api/>

### 3.3. Chạy Celery worker (chạy inference)

Worker cần GPU và các thư viện ML nặng nên **khuyến nghị chạy trực tiếp trên host bằng conda**.

**Cách A — worker trên host (khuyến nghị):**

```bash
# 1. Tạo môi trường conda (lần đầu)
conda env create -f web/environment.worker.yml   # tạo env tên `dentai`
conda activate dentai

# 2. Chạy worker, trỏ vào Postgres/Redis đang chạy trong Docker
cd web/backend
export DJANGO_SETTINGS_MODULE=config.settings
export DATABASE_URL=postgres://dentai:dentai@localhost:5432/dentai
export CELERY_BROKER_URL=redis://localhost:6380/0
export CELERY_RESULT_BACKEND=redis://localhost:6380/0
export MEDIA_ROOT=$(cd .. && pwd)/media
export INFERENCES_DIR=$(cd ../.. && pwd)/inferences
export YOLOV9_DIR=$(cd ../.. && pwd)/yolov9
export INFERENCE_DEVICE=0        # "cpu" nếu không có GPU

celery -A config.celery worker --loglevel=info --concurrency=1 -Q inference
```

> Lưu ý: Redis trong Docker map ra host ở cổng **6380**.

**Cách B — worker trong Docker (cần NVIDIA Container Toolkit):**

```bash
cd web
docker compose --profile worker-docker up -d --build worker
docker compose logs -f worker
```

Image worker tự cài PyTorch CUDA theo `requirements.worker.txt`;
`inferences/`, `yolov9/` được mount read-only nên trọng số không đi vào image.

### 3.4. Biến môi trường quan trọng

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `DATABASE_URL` | `postgres://dentai:dentai@db:5432/dentai` | Kết nối PostgreSQL |
| `CELERY_BROKER_URL` | `redis://redis:6379/0` | Broker Celery |
| `MEDIA_ROOT` | `/app/media` | Nơi lưu ảnh gốc + annotated |
| `INFERENCES_DIR` | `/inferences` | Đường dẫn pipeline AI |
| `YOLOV9_DIR` | `/yolov9` | Đường dẫn mã nguồn YOLOv9 |
| `INFERENCE_DEVICE` | `cpu` | `0` = GPU đầu tiên, `cpu` = CPU |
| `NEXT_PUBLIC_API_URL` | `http://backend:8000` | Frontend proxy tới backend |
| `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` | dev defaults | Cấu hình Django |

Khi deploy thật, đổi `SECRET_KEY`, đặt `DEBUG=0` và giới hạn `ALLOWED_HOSTS`.

### 3.5. Kiểm tra hệ thống chạy đúng

1. Mở <http://localhost:3001> → chuyển tới màn hình Upload.
2. Nhập tên + mã bệnh nhân, kéo thả 1 ảnh nội nha, bấm phân tích.
3. Màn hình Processing hiển thị tiến độ; log worker phải có dòng
   `Task apps.cases.tasks.run_inference_task ... succeeded`.
4. Kết quả hiển thị ảnh annotated kèm mô tả lâm sàng.

### 3.6. Các lệnh thường dùng

```bash
cd web

docker compose logs -f backend         # log backend
docker compose restart backend         # khởi động lại backend
docker compose down                    # dừng toàn bộ
docker compose down -v                 # dừng + xoá DB volume (mất dữ liệu)

# Django management
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
docker compose exec backend python manage.py export_labels --out /app/media/labels
```

### 3.7. Xử lý sự cố

| Triệu chứng | Nguyên nhân / cách xử lý |
|-------------|--------------------------|
| Ảnh mãi ở trạng thái `queued` | Worker chưa chạy, hoặc trỏ sai `CELERY_BROKER_URL` (nhớ cổng 6380 khi chạy trên host) |
| Worker báo `FileNotFoundError` trọng số | Thiếu file trong `inferences/models/` hoặc `INFERENCES_DIR` sai |
| `CUDA out of memory` | Đặt `INFERENCE_DEVICE=cpu`, hoặc giữ `--concurrency=1` |
| Frontend gọi API lỗi 502 | Backend chưa sẵn sàng — kiểm tra `docker compose logs backend` |
| Ảnh annotated không hiển thị | `MEDIA_ROOT` của worker và backend phải trỏ cùng thư mục `web/media` |
| Kết quả trả về "độ tin cậy thấp" | Confidence gate fail — ảnh mờ/lệch góc, chụp lại hoặc hạ ngưỡng ở `/settings` |

---

## 4. Hướng dẫn nhanh (Windows — Docker Desktop)

> Dành cho Windows (cmd.exe) | cập nhật 2026-07-23

### 4.1. Yêu cầu

- **Docker Desktop** (đã cài đặt và đang chạy)
- **Git** (để clone repo)
- Trình duyệt (Chrome/Firefox/Edge)

### 4.2. Tải project

```cmd
git clone <repo-url> dentai
cd dentai
```

### 4.3. Khởi động toàn bộ hệ thống (backend + frontend + DB + Redis)

```cmd
cd web
docker compose down -v
docker compose up -d --build
```

Lệnh này chạy 4 service:
- `db` — PostgreSQL 15 (port **5432**)
- `redis` — Redis 7 (port **6380**)
- `backend` — Django REST API (port **8002**)
- `frontend` — Next.js web app (port **3001**)

Kiểm tra trạng thái:

```cmd
docker compose ps
docker compose logs backend --tail 20
```

Phải thấy dòng `Applying users.0001_initial... OK`.

### 4.4. Tạo tài khoản admin đầu tiên

```cmd
docker compose exec backend python manage.py createsuperuser
```

Nhập username, email, password theo hướng dẫn.

### 4.5. Truy cập

| URL | Chức năng |
|---|---|
| http://localhost:3001 | Web app (frontend) |
| http://localhost:3001/login/ | Đăng nhập |
| http://localhost:3001/register/ | Đăng ký tài khoản mới |
| http://localhost:8002/api/ | API backend |
| http://localhost:8002/admin/ | Django Admin (quản lý DB) |

### 4.6. Luồng sử dụng cơ bản

#### Đăng ký tài khoản mới

1. Mở http://localhost:3001/register/
2. Nhập username, email, password, confirm password
3. Submit → backend gửi mã OTP 6 số (in ra console log)
4. Xem OTP code trong log:

```cmd
docker compose logs backend --tail 30
```

Tìm dòng: `Mã xác thực email của bạn là: XXXXXX`

5. Mở http://localhost:3001/verify-otp/?email=... (tự động redirect sau đăng ký)
6. Nhập mã 6 số → tài khoản được kích hoạt → vào màn hình phân tích

#### Đăng nhập

1. Mở http://localhost:3001/login/
2. Nhập username + password
3. Đăng nhập thành công → vào màn hình phân tích

#### Phân tích ảnh (cần Celery worker)

Nếu muốn chạy pipeline AI, cần chạy thêm Celery worker:

```cmd
cd web\backend
set DJANGO_SETTINGS_MODULE=config.settings
set DATABASE_URL=postgres://dentai:dentai@localhost:5432/dentai
set CELERY_BROKER_URL=redis://localhost:6380/0
set CELERY_RESULT_BACKEND=redis://localhost:6380/0
set MEDIA_ROOT=G:\AIdent\dentaI\web\media
set INFERENCES_DIR=G:\AIdent\dentaI\inferences
set YOLOV9_DIR=G:\AIdent\dentaI\yolov9
set INFERENCE_DEVICE=cpu

..\.venv\Scripts\celery.exe -A config.celery worker --loglevel=info --pool=solo --concurrency=1 -Q inference
```

Sau đó vào http://localhost:3001/analysis/new/ → upload ảnh → xem kết quả.

### 4.7. Các lệnh thường dùng (Windows)

```cmd
:: Xem log
docker compose logs -f backend
docker compose logs -f frontend

:: Restart 1 service
docker compose restart backend
docker compose restart frontend

:: Rebuild 1 service (khi sửa code)
docker compose up -d --build backend
docker compose up -d --build frontend

:: Dừng toàn bộ
docker compose down

:: Dừng + xoá DB (mất hết dữ liệu)
docker compose down -v

:: Kiểm tra danh sách user
docker compose exec backend python manage.py shell -c "from apps.users.models import User; [print(u.username, u.email, u.role) for u in User.objects.all()]"

:: Django Admin (quản lý DB qua web)
:: Mở http://localhost:8002/admin/ — đăng nhập bằng superuser
```

### 4.8. Cấu hình email thật (SMTP)

Hiện tại OTP code in ra console log. Để gửi email thật qua Gmail:

Thêm vào docker-compose.yml trong block `environment` của service `backend`:

```yaml
EMAIL_BACKEND: django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST: smtp.gmail.com
EMAIL_PORT: 587
EMAIL_USE_TLS: "True"
EMAIL_HOST_USER: your@gmail.com
EMAIL_HOST_PASSWORD: app-password-16-chars
DEFAULT_FROM_EMAIL: noreply@dentai.local
```

> Dùng App Password của Google (không phải mật khẩu Gmail thật).

### 4.9. Xử lý sự cố (Windows)

| Triệu chứng | Cách xử lý |
|---|---|
| Frontend gọi API lỗi 500/502 | `docker compose logs backend --tail 20` — kiểm tra backend có chạy không |
| Đăng ký lỗi 404 | Backend chưa rebuild với code mới → `docker compose down -v` rồi `docker compose up -d --build` |
| Không thấy OTP code | `docker compose logs backend \| findstr "OTP\|xác thực"` |
| Không đăng nhập được sau khi verify | Kiểm tra `is_active=True`: `docker compose exec backend python manage.py shell -c "from apps.users.models import User; u=User.objects.get(username='...'); print(u.is_active, u.email_verified)"` |
| Docker không chạy | Mở Docker Desktop, đợi status "Running" |
| Port 3001/8002 đã bị chiếm | Đổi port trong docker-compose.yml |
