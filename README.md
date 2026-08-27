# dentAI — Hỗ trợ chẩn đoán nha khoa và quản lý dữ liệu

dentAI là hệ thống hỗ trợ bác sĩ nha khoa chẩn đoán **viêm lợi (gingivitis)** từ ảnh nội nha
(intraoral photograph). Hệ thống gồm hai phần:

- **`inferences/`** — pipeline AI: phát hiện mức độ viêm lợi từng răng và sinh mô tả lâm sàng.
- **`web/`** — ứng dụng demo: tài khoản/phân quyền, chẩn đoán viêm lợi, kho dữ liệu,
  quản lý phim RNNHT 3D và tích hợp 3D Slicer.

Đây là công cụ hỗ trợ nghiên cứu/demo, không thay thế đánh giá của bác sĩ.

---

## 1. Pipeline AI (`inferences/`)

### 1.1. Ý tưởng

Thay vì phân loại nhị phân toàn ảnh (có/không viêm lợi), dentAI **chấm điểm mức độ viêm cho
từng răng** theo thang **Modified Gingival Index (MGI 0–4)** trên 12 răng cửa
(hàm trên: 13, 12, 11, 21, 22, 23; hàm dưới: 43, 42, 41, 31, 32, 33 — ký hiệu FDI).

Kết quả từng răng được biểu diễn dưới dạng **chuỗi cấu trúc**, rồi đưa qua backend T5 hoặc
bộ luật dự phòng để sinh mô tả lâm sàng (**structured-to-text**), thay vì sinh caption trực tiếp từ ảnh
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
[Caption backend]  auto: T5 khi có checkpoint, nếu không dùng bộ luật
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
| `inferences/get_caption.py` | Build input, tự chọn T5 hoặc caption theo luật |
| `inferences/detect_dual_custom.py` | Wrapper YOLOv9 detection |
| `inferences/evaluate_captions.py` | Đánh giá caption: BLEU-1→4, ROUGE-L, METEOR |
| `inferences/models/` | Trọng số: `best_vqt.pt`, `best_vl.pt`, `best_seg.pt` |
| `inferences/t5_training/t5_gingivitis_model/` | Mô hình T5 (định dạng HuggingFace) |

### 1.4. Quy ước

- Thứ tự răng trong chuỗi T5: `13, 12, 11, 21, 22, 23, 43, 42, 41, 31, 32, 33`
  (hàm trên phải→trái, hàm dưới phải→trái). Răng không ghép được → mặc định MGI `0`.
- Backend T5 sinh caption tất định: `num_beams=5`, `do_sample=False`.
- `CAPTION_MODE=auto` (mặc định) chỉ nạp T5 khi checkpoint đầy đủ; nếu thiếu hoặc lỗi thì
  tự chuyển sang caption theo luật và pipeline vẫn hoàn thành.
- Khoảng cách tâm luôn được chuẩn hoá theo kích thước ảnh để không phụ thuộc độ phân giải.

### 1.5. Đánh giá

- Detection / grading: Precision, mAP@50, Sensitivity, Specificity.
- Caption: BLEU-1→4, ROUGE-L, METEOR (so với 3 mô tả tham chiếu của chuyên gia).

---

## 2. Ứng dụng web

### 2.1. Chức năng đã có

- [x] Sidebar gom các mục bệnh vào **AI hỗ trợ chẩn đoán lâm sàng**, có icon và nhóm Lưu trữ.
- [x] Tổng quan theo quyền; đăng ký, xác thực OTP, đăng nhập bằng username/email,
  yêu cầu vai trò bác sĩ và admin phê duyệt.
- [x] Nút hiện/ẩn mật khẩu ở đăng nhập, đăng ký (cả hai ô mật khẩu); quên mật khẩu bằng OTP.
- [x] Kho dữ liệu cho mọi vai trò: tải lên theo từng phần, nhập thông tin bệnh nhân,
  chọn/tạo phân loại, chọn loại dữ liệu, xem trước, tìm kiếm và tải xuống.
- [x] Quản lý phim viêm lợi; xem, sửa nhãn theo quyền và xuất kết quả.
- [x] Quản lý phim răng nanh ngầm 3D (RNNHT 3D), chia sẻ cho tài khoản cụ thể,
  lưu phim vào kho; lưu ảnh viêm lợi gốc hoặc có chú thích vào kho.
- [x] Trang cài 3D Slicer + DentAI Bridge và bước xác nhận trước khi mở phim trên desktop.
- [x] Chọn ảnh từ kho để tạo ca viêm lợi mới, hoặc chọn ZIP DICOM từ kho để tạo phim RNNHT 3D.
- [x] Nút chuyển từ danh sách/chi tiết kho sang đúng luồng theo phân loại và quyền.
- [x] Phân biệt dữ liệu của mình, được chia sẻ trực tiếp và dữ liệu admin xem bằng quyền quản trị.
- [x] Caption lai `auto/rule/t5`: có hoặc không có checkpoint T5 không cần sửa mã nguồn.

Phạm vi cần phân biệt:

- **Viêm lợi** có pipeline AI. **RNNHT 3D** hiện là xử lý/quản lý DICOM và mở trong
  3D Slicer; chưa phải mô hình AI tự chẩn đoán răng nanh ngầm.
- **Mảng bám răng** hiện là trang giữ chỗ, chưa có API/pipeline. Pano, cephalo,
  tài liệu và phân loại tự nhập vẫn lưu/xem/tải xuống được nhưng chưa có luồng AI tương ứng.
- Thêm dữ liệu vào kho **không tự công khai cho tất cả tài khoản**, cũng không tự chạy AI.

### 2.2. Kiến trúc và màn hình

Frontend: Next.js 14, TypeScript, Tailwind CSS, PrimeReact, react-konva.
Backend: Django 4.2, Django REST Framework, JWT. CSDL: PostgreSQL 15.
Tác vụ nền: Celery + Redis.

| Thành phần | Vai trò |
|---|---|
| `web/backend/apps/users/` | Tài khoản, OTP, quyền, chia sẻ, nhật ký |
| `web/backend/apps/cases/` | Ca viêm lợi, ảnh, kết quả, inference |
| `web/backend/apps/library/` | Kho dữ liệu, phân loại, phạm vi truy cập, nhập/xuất từ module |
| `web/backend/apps/scans/` | Phim CBCT, preview, chia sẻ và token mở 3D Slicer |
| `web/backend/apps/dashboard/` | Tổng quan |
| `web/frontend/src/components/library/LibraryAssetPicker.tsx` | Bộ chọn tư liệu dùng chung |
| `web/slicer_bridge/` | Bridge desktop cho giao thức `dentai://` |

| Route | Chức năng |
|---|---|
| `/dashboard/` | Tổng quan |
| `/analysis/new/` | Viêm lợi: ảnh từ máy tính hoặc Kho dữ liệu |
| `/analysis/[caseId]/processing/` | Theo dõi xử lý |
| `/analysis/[caseId]/results/[imageIndex]/` | Kết quả; đường dẫn con `edit/` để sửa nhãn theo quyền |
| `/gingivitis/`, `/history/` | Quản lý phim viêm lợi và lịch sử ca |
| `/library/`, `/library/new/`, `/library/[id]/` | Kho: danh sách, tải lên và chi tiết |
| `/scans/`, `/scans/new/`, `/scans/[id]/` | RNNHT 3D: danh sách, tạo phim và chi tiết |
| `/downloads/3d-slicer/` | Hướng dẫn cài Slicer/Bridge và kiểm tra tích hợp |
| `/login/`, `/register/`, `/forgot-password/` | Đăng nhập, đăng ký, khôi phục mật khẩu |
| `/users/`, `/system-log/` | Quản trị người dùng và nhật ký, dành cho admin |

## 3. Dùng dữ liệu trong kho để chẩn đoán lại

### 3.1. Từ màn hình chẩn đoán

1. Mở **AI hỗ trợ chẩn đoán lâm sàng → Chẩn đoán viêm lợi**.
2. Trong **Ảnh đầu vào**, chọn **Từ Kho dữ liệu**.
3. Tìm kiếm/lọc **Của tôi**, **Được chia sẻ** hoặc toàn bộ dữ liệu được quyền truy cập.
4. Chọn tối đa 20 ảnh cùng bệnh nhân. Dữ liệu không có bệnh nhân không được trộn
   với ảnh đã gắn bệnh nhân trong cùng ca.
5. Kiểm tra tên, mã bệnh nhân và ghi chú được điền sẵn nếu được phép xem.
   Với dữ liệu đã ẩn thông tin bệnh nhân, nhập thông tin cho ca mới.
6. Bấm **Bắt đầu phân tích**. Hệ thống tạo ca mới của người thao tác và đưa vào queue
   `inference`; ca/kết quả/tư liệu nguồn được giữ nguyên.

Với RNNHT 3D: mở **Phim răng nanh ngầm 3D → Tải phim** (`/scans/new/`),
chọn **Từ Kho dữ liệu**, chọn một ZIP DICOM rồi bấm **Tạo phim từ Kho dữ liệu**.
Queue `scans` sẽ xử lý bản sao và tạo preview.

### 3.2. Từ Kho dữ liệu

Nút thao tác xuất hiện ở cả danh sách và trang chi tiết khi tư liệu phù hợp:

| Phân loại hệ thống | Loại dữ liệu | Nút / đích đến | Vai trò |
|---|---|---|---|
| Viêm lợi (`viem-loi`) | Ảnh trong miệng (`intraoral`) | Chẩn đoán viêm lợi → `/analysis/new/?library_asset=<id>` | Mọi tài khoản hoạt động có quyền xem |
| Răng nanh ngầm (`rang-nanh-ngam`) | Chuỗi DICOM ZIP (`dicom_series`) | Mở luồng RNNHT 3D → `/scans/new/?library_asset=<id>` | Bác sĩ/admin có quyền xem |
| Phân loại/loại file khác | Bất kỳ | Không hiện nút chẩn đoán | Vẫn xem/tải xuống theo quyền |

Tư liệu phải ở trạng thái **Sẵn sàng**, đã qua xử lý của kho
(`is_anonymized=true`; DICOM cần khử thông tin định danh trong header).
Một file `.dcm` đơn lẻ không thay thế được ZIP chuỗi DICOM của luồng RNNHT 3D.
Nên chẩn đoán lại từ **ảnh gốc chưa vẽ box/nhãn**.

### 3.3. Quyền và ý nghĩa các tab

- **Của tôi**: tư liệu do tài khoản hiện tại tải lên/lưu vào kho.
- **Được chia sẻ**: có bản ghi `DataAssetShare` chia sẻ trực tiếp cho tài khoản,
  không bao gồm dữ liệu của chính mình.
- **Tất cả**: dữ liệu của mình + dữ liệu được chia sẻ; với admin là **Tất cả hệ thống**.
- **Của người khác**: chỉ admin, lọc tư liệu không do admin hiện tại tải lên.

Vì vậy admin có thể thấy hai ảnh ở **Tất cả hệ thống**, một ảnh ở **Của tôi** và
không có ảnh ở **Được chia sẻ** nếu chưa có lời chia sẻ trực tiếp. Đây không phải
mất dữ liệu. `visibility=shared` đơn thuần không cấp quyền; bản ghi chia sẻ mới quyết định.

Chia sẻ phim RNNHT 3D qua giao diện là quyền trên **phim**, không tự chuyển thành
quyền trên một bản sao trong **kho**. Hiện việc tạo/thu hồi chia sẻ trực tiếp của
tư liệu kho được quản trị qua **Django Admin → Data asset shares**; chưa có hộp thoại
chia sẻ cá nhân riêng trong trang kho. Không dùng quyền admin để giả lập một lời chia sẻ.

Người nhận quyền xem được tạo ca mới từ ảnh được chia sẻ nhưng không được sửa nguồn.
Bệnh nhân không được đọc tên/tuổi/giới tính/mô tả của người khác qua chia sẻ.
Backend kiểm tra lại quyền, loại dữ liệu, trạng thái, file nguồn và bệnh nhân khi gửi
yêu cầu; sửa ID trên URL không vượt qua được quyền API.

Dùng lại đúng mã bệnh nhân nguồn chỉ khi được phép đọc hồ sơ đó. Để trống mã sẽ tạo
hồ sơ mới; mã trùng một hồ sơ khác bị từ chối. Việc nhập tên/ghi chú mới không sửa
hồ sơ bệnh nhân nguồn khi đang dùng lại mã cũ. Dữ liệu được **sao chép**, không di chuyển.

## 4. Cài đặt và chạy trên Windows (PowerShell)

### 4.1. Chuẩn bị

- Docker Desktop đang chạy; Git; các cổng 3001, 8002, 5432, 6380 không bị chiếm.
- Riêng AI viêm lợi cần môi trường Python inference và ba trọng số:
  `inferences/models/best_vqt.pt`, `best_vl.pt`, `best_seg.pt`, cùng mã YOLOv9 tại `yolov9/`.
- T5 là **tuỳ chọn** với `CAPTION_MODE=auto`. Giao diện/kho/CBCT không cần T5.
- `web/environment.worker.yml` là bản môi trường Linux, không dùng nguyên file cho Windows.
  `web/requirements.worker.txt` khóa PyTorch CUDA 12.6; không phải bộ cài CPU phổ dụng.
  Dùng môi trường inference đã kiểm chứng với máy của bạn; cần cả phụ thuộc backend
  trong `web/requirements.backend.txt`.

### 4.2. Khởi động web

Tại thư mục gốc dự án, chỉ tạo file cấu hình nếu chưa có (không ghi đè cấu hình cũ):

```powershell
if (!(Test-Path web/.env)) { Copy-Item web/.env.example web/.env }
if (!(Test-Path web/backend/.env)) { Copy-Item web/backend/.env.example web/backend/.env }
cd web
docker compose up -d --build
docker compose ps
```

Chạy 5 service: `db`, `redis`, `backend`, `frontend`, `scans_worker`.
Backend tự migrate và tạo admin ban đầu bằng `seed_admin`; khởi động lại giữ nguyên
mật khẩu đã có. Đổi thông tin mặc định trong `web/.env` trước khi dùng ngoài máy local.

- Web: [localhost:3001](http://localhost:3001).
- Django Admin: [localhost:8002/admin/](http://localhost:8002/admin/).
- API: [localhost:8002/api/](http://localhost:8002/api/).

Compose mặc định dùng email console để test OTP, đọc ở `docker compose logs --tail 50 backend`.
Muốn gửi email thật, đổi `EMAIL_BACKEND` trong Compose sang SMTP, cấu hình credential
trong `web/backend/.env`, rồi tạo lại container backend. Không commit secret.
Tài khoản đăng ký bác sĩ vẫn có quyền bệnh nhân cho đến khi admin duyệt yêu cầu.

### 4.3. Worker AI trên Windows

Mở PowerShell **thứ hai**, tại thư mục gốc dự án. Ví dụ dưới dùng môi trường
`.venv` đã cài đủ thư viện inference; thay đường dẫn Python nếu bạn dùng Conda.

```powershell
$projectRoot = (Get-Location).Path
$workerPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
$env:DJANGO_SETTINGS_MODULE = 'config.settings'
$env:DATABASE_URL = 'postgres://dentai:dentai@localhost:5432/dentai'
$env:CELERY_BROKER_URL = 'redis://localhost:6380/0'
$env:CELERY_RESULT_BACKEND = 'redis://localhost:6380/0'
$env:MEDIA_ROOT = Join-Path $projectRoot 'web\media'
$env:INFERENCES_DIR = Join-Path $projectRoot 'inferences'
$env:YOLOV9_DIR = Join-Path $projectRoot 'yolov9'
$env:INFERENCE_DEVICE = 'cpu'
$env:CAPTION_MODE = 'auto'
$env:T5_DEVICE = 'auto'
cd web/backend
& $workerPython -m celery -A config.celery worker --loglevel=info --pool=solo --concurrency=1 -Q inference
```

Sửa `DATABASE_URL` nếu thông tin PostgreSQL trong `web/.env` khác mặc định.
Biến trong `web/.env` không tự nạp vào PowerShell. Nếu dùng GPU đã cấu hình,
đổi `INFERENCE_DEVICE` thành `0`.

Worker Docker có profile riêng và yêu cầu môi trường NVIDIA phù hợp:

```powershell
cd web
docker compose --profile worker-docker up -d --build worker
```

Chọn một cách chạy inference. Không bật đồng thời hai worker khác môi trường nếu
chưa bảo đảm cả hai đều đọc được trọng số và cùng thư mục media.

### 4.4. Caption T5 / theo luật

| Biến | Giá trị | Hành vi |
|---|---|---|
| `CAPTION_MODE` | `auto` (mặc định) | Có checkpoint đầy đủ thì dùng T5; thiếu/lỗi thì dùng luật |
| `CAPTION_MODE` | `rule` | Luôn dùng luật, không nạp T5 |
| `CAPTION_MODE` | `t5` | Bắt buộc T5; báo lỗi nếu thiếu/hỏng |
| `T5_MODEL_DIR` | Thư mục checkpoint | Mặc định `inferences/t5_training/t5_gingivitis_model/` |
| `T5_DEVICE` | `auto`, `cpu`, `cuda`, `cuda:0`, số GPU | Thiết bị chạy caption |

Để thêm T5 sau này, chép đầy đủ config, tokenizer và checkpoint
(`model.safetensors`/`pytorch_model.bin`, hoặc các shard kèm index) vào
`T5_MODEL_DIR`, rồi khởi động lại worker. Không cần sửa code.
Model T5 nền tải từ mạng không tương đương mô hình đã huấn luyện cho chuỗi MGI;
cần checkpoint phù hợp tác vụ và ngôn ngữ.

### 4.5. Mở phim bằng 3D Slicer

1. Bác sĩ/admin mở một phim đã xử lý xong, bấm mở bằng 3D Slicer.
2. Nếu chưa xác nhận cài đặt trên trình duyệt này, trang chuyển tới
   `/downloads/3d-slicer/`.
3. Cài 3D Slicer, tải gói DentAI Bridge ở trang này, làm theo
   [hướng dẫn Bridge](web/slicer_bridge/README.md).
4. Kiểm tra tích hợp và xác nhận đã cài, quay lại phim rồi mở lại.

Trình duyệt không thể quét chắc chắn phần mềm đã cài trên máy: cơ chế dùng
xác nhận của người dùng và thử giao thức `dentai://`, không phải kiểm kê hệ điều hành.
Nếu mở từ máy khác, cấu hình `SCANS_PUBLIC_BASE_URL` là địa chỉ backend mà máy
đó truy cập được, không để `localhost` của máy chủ.

## 5. Cập nhật sau khi pull/merge

Nhánh tích hợp của remote hiện là **`develop`** (được gọi là “dev” trong trao đổi).

```powershell
# Tại thư mục gốc, lưu các thay đổi riêng của bạn trước khi chuyển nhánh/pull.
git switch develop
git pull --ff-only origin develop
cd web
docker compose up -d --build backend frontend scans_worker
docker compose exec -T backend python manage.py migrate
```

Sau đó tải lại web bằng **Ctrl+F5**. Khi đổi code hoặc biến môi trường của worker
AI, dừng worker host bằng Ctrl+C và chạy lại lệnh ở mục 4.3; worker Docker thì
tạo lại service `worker` theo mục 4.3. Thay đổi luồng nhập từ kho này không thêm migration.

- `docker compose restart` chỉ khởi động lại container, **không** áp dụng biến môi trường/image mới.
- **Không dùng `docker compose down -v` để cập nhật**: lệnh đó xoá volume, có thể mất DB/Redis.
- Giữ và sao lưu `web/media/`, `web/backend/scans_storage/`,
  `web/backend/library_storage/` và volume PostgreSQL. Các thư mục dữ liệu không commit.
- Compose hiện là cấu hình demo (`DEBUG=1`, media ảnh 2D được phục vụ như static).
  Trước triển khai thật cần HTTPS, secret riêng, giới hạn host, cơ chế phục vụ media
  có xác thực và chính sách bảo vệ dữ liệu bệnh nhân; không coi demo là cấu hình production.

## 6. API liên quan và kiểm tra

Các API dưới đây yêu cầu đăng nhập, trừ API xác thực và tải gói Bridge công khai.

| Method / API | Chức năng |
|---|---|
| `POST /api/cases/` | Tạo ca từ multipart `images` |
| `POST /api/cases/from-library/` | JSON: `patient_name`, `asset_ids` (1–20), `patient_code`/`notes` tuỳ chọn |
| `POST /api/scans/from-library/` | JSON: `patient_name`, `asset_id`, `patient_code`/`note` tuỳ chọn |
| `GET /api/library/assets/` | Bộ lọc `q`, `category`, `data_type`, `mine=1`, `shared=1`, `others=1` (admin), `page`, `page_size` |
| `GET /api/library/assets/?diagnosis=gingivitis` | Ảnh tương thích viêm lợi trong phạm vi quyền |
| `GET /api/library/assets/?diagnosis=canine3d` | ZIP tương thích RNNHT 3D; chỉ bác sĩ/admin |
| `GET /api/library/assets/{id}/` | Chi tiết, `category_slug`, `diagnosis_target` hoặc `null` |
| `POST /api/library/assets/uploads/` | Khởi tạo tải tư liệu; PUT chunk và POST complete ở đường dẫn con |
| `GET /api/library/assets/{id}/download/` | Tải file đã xử lý theo quyền |
| `POST /api/library/imports/scans/{id}/` | Lưu bản sao phim vào kho |
| `POST /api/library/imports/cases/{id}/images/{index}/` | Lưu ảnh viêm lợi vào kho (`variant: original/annotated`) |
| `GET/POST /api/scans/{id}/shares/` | Danh sách/cấp quyền chia sẻ phim |
| `DELETE /api/scan-shares/{id}/` | Thu hồi chia sẻ phim |
| `GET /api/downloads/slicer-bridge/` | Tải gói tích hợp desktop |

API nhập từ kho trả `201` và `id/status` của ca/phim mới.
Không có quyền hoặc đã xoá: `404`; sai dữ liệu: `400`; sai vai trò: `403`;
lỗi sao chép: `409` và không giữ ca/phim tạo dở.

Kiểm tra hồi quy (chạy trong thư mục `web`, dùng CSDL test riêng):

```powershell
docker compose exec -T backend python manage.py check
docker compose exec -T backend python manage.py makemigrations --check --dry-run
docker compose exec -T backend python manage.py test --noinput
docker compose run --rm --no-deps frontend npm run build
```

Nên dùng CSDL thử nghiệm khi kiểm tra giao diện: chọn ảnh của mình/ảnh được chia sẻ,
chuyển giữa các tab, thử ảnh sai phân loại, dữ liệu đã xoá/thu hồi quyền, rồi tạo ca/phim
và xác nhận nguồn/kết quả cũ không thay đổi. Kiểm tra AI thực cần worker và trọng số;
unit test/build không thay thế đánh giá chất lượng chẩn đoán.

## 7. Xử lý sự cố

| Triệu chứng | Cách kiểm tra |
|---|---|
| Không thấy Kho dữ liệu trên sidebar | Mở nhóm **Lưu trữ**, xác nhận đang chạy đúng checkout, cập nhật frontend và Ctrl+F5 |
| All có dữ liệu nhưng Shared trống | Xem mục 3.3: quyền admin hoặc lưu vào kho không phải chia sẻ trực tiếp |
| Không thấy ảnh ở bộ chọn chẩn đoán | Kiểm tra phân loại, loại dữ liệu, trạng thái Sẵn sàng và phạm vi quyền |
| Mã bệnh nhân bị từ chối khi nhập từ kho | Dùng mã đúng của hồ sơ nguồn được quyền xem, hoặc để trống tạo hồ sơ mới |
| Ca mãi queued | Worker inference chưa chạy/sai queue hoặc sai Redis; host dùng cổng 6380 |
| Kho/CBCT mãi processing | Kiểm tra `docker compose logs --tail 50 scans_worker` |
| Lỗi thiếu file khi nhập từ kho | Kiểm tra file trong LIBRARY_ROOT và volume backend; không chỉ sao chép DB |
| Thiếu checkpoint T5 | Dùng `CAPTION_MODE=auto` hoặc `rule`; restart worker sau khi đổi |
| API 500/502 | Xem `docker compose logs --tail 50 backend`; không xoá DB để chữa lỗi route |
| Không thấy OTP | Compose mặc định in OTP trong log backend; dùng SMTP khi triển khai |
| Không thấy bước cài Slicer | Mở trực tiếp `/downloads/3d-slicer/`; có thể trình duyệt đã lưu xác nhận |
