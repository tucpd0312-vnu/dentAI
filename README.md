# dentAI — Hệ thống AI hỗ trợ chẩn đoán và quản lý dữ liệu nha khoa

dentAI hỗ trợ phân tích viêm lợi (gingivitis) từ ảnh trong miệng, quản lý phim CBCT
và lưu trữ tư liệu nha khoa. Hệ thống gồm hai phần:

- **`inferences/`** — pipeline AI: phát hiện mức độ viêm lợi từng răng, ghép kết quả và sinh mô tả.
- **`web/`** — ứng dụng web: quản lý tài khoản, ca chẩn đoán, phim, kho dữ liệu,
  chia sẻ, xuất kết quả và giao diện chờ cho chức năng trò chuyện.

> Kết quả AI là thông tin hỗ trợ, cần được bác sĩ kiểm tra; không thay thế kết luận chuyên môn.
> Cấu hình Docker đi kèm phục vụ phát triển và thử nghiệm local.

---

## 1. Pipeline AI (`inferences/`)

### 1.1. Ý tưởng

Thay vì phân loại nhị phân toàn ảnh, dentAI chấm mức độ viêm theo thang
**Modified Gingival Index (MGI 0–4)** cho 12 răng vùng trước, theo ký hiệu FDI:

- Hàm trên: `13, 12, 11, 21, 22, 23`.
- Hàm dưới: `43, 42, 41, 31, 32, 33`.

Kết quả được chuyển thành chuỗi cấu trúc rồi sinh mô tả bằng **luật hoặc T5**.
Đầu vào cấu trúc giúp đối chiếu mô tả với kết quả từng răng; chất lượng vẫn phụ thuộc
vào mô hình nhận diện, phép ghép và bộ sinh mô tả.

### 1.2. Luồng xử lý

```text
Ảnh trong miệng đầu vào
    ├── [best_seg.pt] phân đoạn răng trên ảnh gốc → mask + nhãn FDI
    └── [best_vqt.pt] YOLOv9 phát hiện cung hàm → crop ROI
            └── [best_vl.pt] YOLOv9 phát hiện vùng viêm + MGI trên ROI
                    → quy đổi toạ độ về ảnh gốc
    ↓
Tooth–Disease Matching: ghép vùng viêm ↔ răng bằng Hungarian algorithm
    score = 0.5·IoU + 0.4·distance_score + 0.1·area_ratio_score
    ↓
Confidence gate (mặc định 0.5, xét điểm ghép cao nhất)
    ├── FAIL → trạng thái độ tin cậy thấp + cảnh báo
    └── PASS → chuỗi MGI theo thứ tự 12 răng
                    ↓
              CAPTION_MODE
                    ├── auto: có T5 hợp lệ → T5; thiếu/lỗi → luật
                    ├── rule: luôn dùng luật
                    └── t5: bắt buộc dùng T5; thiếu/lỗi → báo lỗi
                    ↓
              Ảnh chú thích + mô tả
```

`distance_score` chuẩn hoá khoảng cách tâm theo đường chéo ảnh; `area_ratio_score`
là điểm đánh giá tương quan diện tích, không phải tỉ lệ diện tích thô.
Trường hợp không tìm thấy răng hoặc không có vùng viêm có nhánh xử lý riêng,
xem quy ước bên dưới.

### 1.3. Thành phần chính

| File / thư mục | Vai trò |
|---|---|
| [inferences/main.py](inferences/main.py) | Chạy pipeline độc lập trên thư mục ảnh |
| [inferences/get_image.py](inferences/get_image.py) | Lấy mask, ROI, box và vẽ chú thích |
| [inferences/matching.py](inferences/matching.py) | Hungarian matching và confidence gate |
| [inferences/get_caption.py](inferences/get_caption.py) | Tạo đầu vào cấu trúc; chọn luật/T5 theo cấu hình |
| [inferences/detect_dual_custom.py](inferences/detect_dual_custom.py) | Wrapper YOLOv9 detection |
| [inferences/evaluate_captions.py](inferences/evaluate_captions.py) | Đánh giá BLEU-1→4, ROUGE-1/2/L, METEOR |
| `inferences/models/` | Ba trọng số: `best_vqt.pt`, `best_vl.pt`, `best_seg.pt` |
| `inferences/t5_training/t5_gingivitis_model/` | Checkpoint T5 cục bộ, không bắt buộc ở chế độ `auto`/`rule` |
| [web/backend/apps/cases/tasks.py](web/backend/apps/cases/tasks.py) | Điều phối pipeline cho web, cập nhật trạng thái và lưu kết quả vào DB |

Worker web gọi các thành phần pipeline qua `tasks.py`, không chạy trực tiếp `main.py`.

### 1.4. Quy ước

- Thứ tự chuỗi MGI cố định: `13, 12, 11, 21, 22, 23, 43, 42, 41, 31, 32, 33`.
  Răng không ghép được được điền `0`; đây là giá trị mặc định kỹ thuật, **không chứng minh răng đó khoẻ mạnh**.
- Không tìm thấy răng → độ tin cậy thấp. Có răng nhưng không phát hiện vùng viêm →
  chuỗi mặc định toàn `0`; vẫn cần kiểm tra ảnh và kết quả.
- T5 sinh văn bản với `num_beams=5`, `do_sample=False`. Chế độ luật không cần checkpoint T5.
- `CAPTION_MODE=auto` là mặc định. T5 chỉ nạp từ thư mục cục bộ, không tự tải từ Internet.
  Thêm checkpoint phù hợp và khởi động lại worker để dùng T5 mà không sửa code.
- Checkpoint cần `config.json`, tokenizer (`tokenizer.json` hoặc `spiece.model`) và
  `model.safetensors`/`pytorch_model.bin`, hoặc file index cùng đầy đủ các shard.
  Cần dùng checkpoint đã huấn luyện cho đầu vào MGI; mô hình T5 nền không mặc nhiên sinh được mô tả phù hợp.
- Hiện worker dùng ngưỡng mặc định trong `matching.py`. Giá trị lưu ở `/settings`
  và snapshot trên ca chưa được truyền vào lời gọi `confidence_gate`.

### 1.5. Đánh giá

- Detection / grading: đối chiếu nhãn chuyên gia, theo dõi Precision, mAP@50, Sensitivity, Specificity.
- Caption: script `evaluate_captions.py` so sánh CSV dự đoán và tham chiếu
  theo hai cột `Image name`, `caption`, tính BLEU, ROUGE và METEOR.
- Khi báo cáo chất lượng cần ghi rõ tập kiểm định, checkpoint và chế độ sinh mô tả.
  Các chỉ số văn bản không thay thế đánh giá đúng/sai về chuyên môn.

---

## 2. Ứng dụng web (`web/`)

Ứng dụng có năm vai trò: **quản trị viên**, **bác sĩ/giảng viên**, **sinh viên**,
**bệnh nhân** và **lễ tân**. Sinh viên dùng phạm vi dữ liệu như bệnh nhân nhưng
được sửa kết quả viêm lợi; lễ tân hiện chỉ dùng Tổng quan và tải file phân công.

### 2.1. Tech stack

| Layer | Công nghệ |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, PrimeReact, react-konva |
| Backend | Django 4.2 + Django REST Framework, xác thực JWT |
| Task queue | Celery + Redis; tách queue `inference` và `scans` |
| Database | PostgreSQL 15 |
| Đóng gói / xem phim 3D | Docker Compose / 3D Slicer desktop + DentAI Slicer Bridge |

### 2.2. Kiến trúc

```text
web/
├── frontend/             # Next.js app
├── backend/
│   ├── config/           # settings, urls, celery
│   ├── apps/
│   │   ├── users/        # tài khoản, OTP, vai trò, nhật ký hệ thống
│   │   ├── dashboard/    # thống kê tổng quan
│   │   ├── cases/        # ca viêm lợi, kết quả, chia sẻ, export
│   │   ├── scans/        # phim CBCT, chia sẻ, phân vùng
│   │   ├── library/      # kho dữ liệu, import và dùng dữ liệu để chẩn đoán
│   │   ├── reception/    # file Excel phân công của lễ tân
│   │   ├── common/       # tiện ích dùng chung
│   │   └── settings_app/
│   ├── scans_storage/    # phim CBCT; truy cập qua API có kiểm tra quyền
│   ├── library_storage/  # tư liệu trong kho; truy cập qua API có kiểm tra quyền
│   └── reception_assignments_storage/ # file phân công riêng tư
├── media/                # ảnh gốc, ảnh chú thích và file xuất của ca viêm lợi
├── slicer_bridge/        # cầu nối giao thức dentai://
└── docker-compose.yml
```

| Service | Vai trò | Port trên host | Khởi động |
|---|---|---|---|
| `frontend` | Next.js | 3001 | Mặc định |
| `backend` | Django + DRF | 8002 | Mặc định |
| `db` | PostgreSQL 15 | 5432 | Mặc định |
| `redis` | Redis 7 | 6380 (trong container: 6379) | Mặc định |
| `scans_worker` | CPU; xử lý CBCT **và kho dữ liệu**, queue `scans` | — | Mặc định |
| `worker` | Pipeline viêm lợi, queue `inference` | — | Profile `worker-docker`, hoặc chạy worker trên host |

### 2.3. Luồng sử dụng

**Tài khoản và quyền truy cập**

- Đăng ký → xác thực OTP → đăng nhập bằng tên đăng nhập hoặc email.
  Đăng nhập/đăng ký có nút hiện mật khẩu; quên mật khẩu dùng OTP để đặt lại.
- Người đăng ký làm bác sĩ vẫn có vai trò bệnh nhân trong lúc chờ admin phê duyệt.
  Phê duyệt đổi vai trò, không đổi mật khẩu.
- Tài khoản lễ tân do admin tạo. Lễ tân chỉ vào Tổng quan, nhận thông báo và tải
  file phân công `.xlsx`/`.xls` tối đa 10 MB; mỗi lần tải được giữ thành một phiên bản.
- Tài khoản sinh viên do admin cấp. Sinh viên chỉ xem dữ liệu của mình hoặc được
  chia sẻ, được sửa kết quả viêm lợi nhưng không được nộp phân vùng CBCT.
- Kho dữ liệu dùng được với mọi vai trò. Người dùng thường chỉ thấy dữ liệu của mình
  hoặc được chia sẻ; admin có quyền xem toàn hệ thống.
- Admin, bác sĩ, sinh viên và bệnh nhân được dùng các luồng AI theo phạm vi dữ liệu.
  Bệnh nhân luôn chỉ xem kết quả; sinh viên sửa nhãn viêm lợi trên ca mình sở hữu
  hoặc được chia sẻ quyền sửa.
- Nộp phân vùng RNNHT 3D chỉ dành cho admin hoặc bác sĩ có quyền trên phim.

**Chẩn đoán viêm lợi**

1. Vào `/analysis/new`, nhập thông tin bệnh nhân, chọn ảnh từ máy hoặc **từ kho dữ liệu**.
2. Backend tạo ca mới và xếp từng ảnh vào queue `inference`.
3. Trang Processing theo dõi tiến độ mỗi 2 giây; worker lưu box, mask, mô tả và ảnh chú thích.
4. Xem từng kết quả; bác sĩ có quyền sửa được chỉnh box, nhãn răng, mức MGI và mô tả.
5. Xuất ZIP một ảnh/cả ca, chia sẻ ca cho tài khoản khác hoặc lưu ảnh vào kho.
   Ảnh gốc và ảnh có chú thích được lưu thành hai bản riêng; lưu lại cùng một bản không ghi đè tư liệu đã có.

**Kho dữ liệu và dùng lại dữ liệu để chẩn đoán**

1. Vào `/library/new`: nhập tiêu đề, chọn phân loại hoặc tạo phân loại khác, chọn loại dữ liệu.
   Có thể bổ sung tên, tuổi, giới tính và mô tả tình trạng bệnh nhân; tuổi được quy đổi thành năm sinh.
2. Tải file lên, đợi trạng thái `ready`, sau đó xem trước/tải xuống trong phạm vi quyền truy cập.
   Hỗ trợ DICOM đơn, chuỗi DICOM ZIP, ảnh trong miệng, pano, cephalo, phim quanh chóp, ảnh mặt, tài liệu và loại khác.
3. Tab **Của tôi** là dữ liệu tự tải lên; **Được chia sẻ** chỉ gồm chia sẻ trực tiếp cho tài khoản.
   Admin có thêm **Của người khác**; quyền xem toàn hệ thống không đồng nghĩa được chia sẻ.
   Bộ lọc nằm trong một thanh gọn và có thể bấm để hiện/ẩn; trang Quản lý người dùng
   dùng cùng cách bố trí để tránh chiếm nhiều chiều cao màn hình.
4. Nút chẩn đoán trong kho hoặc bộ chọn ảnh ở trang AI chỉ nhận dữ liệu đã sẵn sàng,
   có quyền truy cập và phù hợp bảng dưới. Một ca viêm lợi nhận tối đa 20 ảnh cùng bệnh nhân.
5. Dùng dữ liệu trong kho tạo **ca/phim mới bằng bản sao**; không di chuyển hoặc ghi đè nguồn.

| Phân loại trong kho | Loại dữ liệu | Đích sử dụng |
|---|---|---|
| Viêm lợi (`viem-loi`) | Ảnh trong miệng (`intraoral`) | Phân tích viêm lợi |
| Răng nanh ngầm (`rang-nanh-ngam`) | Chuỗi DICOM ZIP (`dicom_series`) | Tạo phim RNNHT 3D; mọi vai trò, theo phạm vi dữ liệu |
| Phân loại/loại dữ liệu khác | Các loại được kho chấp nhận | Lưu trữ, xem và tải; chưa có luồng chẩn đoán tương ứng |

Dữ liệu DICOM được xử lý ẩn danh header trước khi sẵn sàng; không được coi đây là
bảo đảm loại bỏ mọi thông tin nhận dạng trong nội dung ảnh/tài liệu.
Thông tin bệnh nhân trên tư liệu được chia sẻ được ẩn với người nhận có vai trò bệnh nhân.

**RNNHT 3D, chia sẻ và 3D Slicer**

- Tải chuỗi DICOM ZIP từ máy hoặc chọn từ kho → xử lý → xem preview →
  mở trong 3D Slicer; người có quyền sửa có thể nộp kết quả phân vùng.
- Admin xem mọi phim; bác sĩ xem phim mình tải hoặc được chia sẻ; bệnh nhân và sinh
  viên chỉ xem phim do chính tài khoản tải lên, không được nộp phân vùng.
- Chia sẻ cá nhân có quyền xem/sửa. Chủ sở hữu hoặc admin quản lý chia sẻ;
  người nhận phim không được cấp lại quyền cho người khác.
  Phim chỉ chia sẻ tới doctor/admin; patient có thể chia sẻ phim mình sở hữu cho tài
  khoản chuyên môn nhưng không nhận phim 3D của người khác.
- **Lưu vào kho không công khai dữ liệu.** Bản sao trong kho có quyền độc lập,
  không tự kế thừa danh sách người nhận của ca/phim.
  Chia sẻ tư liệu trong kho hiện được quản lý bằng `DataAssetShare` trong Django Admin.
- Lần đầu mở phim, giao diện kiểm tra điều kiện thiết lập và dẫn đến
  `/downloads/3d-slicer`: cài Slicer, cài Bridge, thử mở rồi xác nhận.
  Trình duyệt chỉ nhận biết gần đúng qua giao thức `dentai://`; không thể xác nhận chắc chắn phần mềm đã cài.
- Token mở/tải phim có hạn 5 phút và dùng một lần. Thu hồi chia sẻ làm mất hiệu lực
  token chưa dùng; khi tải, server kiểm tra lại quyền hiện tại.
- Module 3D hiện hỗ trợ quản lý phim và thao tác bằng Slicer, **chưa chạy mô hình AI
  chẩn đoán răng nanh ngầm**. Trang mảng bám vẫn là giao diện chờ triển khai.

### 2.4. Màn hình

| Route | Chức năng |
|---|---|
| `/login`, `/register`, `/verify-otp`, `/forgot-password` | Đăng nhập, đăng ký, xác thực, đặt lại mật khẩu |
| `/dashboard` | Tổng quan theo quyền; lễ tân tải và xem metadata file phân công mới nhất |
| `/gingivitis` | Quản lý phim/ca viêm lợi |
| `/analysis/new` | Tạo ca từ máy hoặc kho dữ liệu |
| `/analysis/[caseId]/processing` | Theo dõi xử lý |
| `/analysis/[caseId]/results/[imageIndex]` | Xem kết quả |
| `/analysis/[caseId]/results/[imageIndex]/edit` | Chỉnh sửa box và mô tả |
| `/scans`, `/scans/new`, `/scans/[id]` | Quản lý, tải lên, xem và chia sẻ phim CBCT |
| `/library`, `/library/new`, `/library/[id]` | Kho dữ liệu, tải lên, xem chi tiết và dùng để chẩn đoán |
| `/downloads/3d-slicer` | Hướng dẫn cài Slicer và Bridge, kiểm tra tích hợp |
| `/history` | Lịch sử ca/phim trong phạm vi quyền truy cập |
| `/chat` | Trò chuyện — hiện hiển thị “Hệ thống đang được phát triển”; mọi vai trò |
| `/users`, `/system-log` | Quản lý tài khoản, duyệt vai trò và nhật ký; dành cho admin |
| `/settings`, `/help` | Cấu hình và hướng dẫn |
| `/plaque` | Mảng bám — chưa có pipeline xử lý |

### 2.5. API chính

Các đường dẫn dưới đây dùng tiền tố `/api/`. API nghiệp vụ yêu cầu
`Authorization: Bearer <access_token>`; các API đăng ký/đăng nhập/OTP là ngoại lệ.
`image_index` đánh số từ 0. Danh sách dưới đây tóm tắt endpoint chính, không thay thế serializer.

| Nhóm | Endpoint | Chức năng |
|---|---|---|
| Tài khoản | `POST auth/register/`, `auth/verify-otp/`, `auth/resend-otp/` | Đăng ký và xác thực |
| Tài khoản | `POST auth/login/`, `auth/refresh/`, `auth/logout/` | Phiên đăng nhập JWT |
| Tài khoản | `POST auth/forgot-password/`, `auth/reset-password/`; `GET auth/me/` | Đặt lại mật khẩu, đọc tài khoản |
| Quản trị | `GET/POST users/`; `GET role-requests/`; `POST role-requests/{id}/approve/` hoặc `role-requests/{id}/reject/` | Quản lý người dùng và duyệt bác sĩ |
| Tổng quan | `GET dashboard/`, `GET activity-logs/` | Thống kê và nhật ký theo quyền |
| Lễ tân | `POST reception/assignments/`; `GET reception/assignments/latest/` | Tải Excel và đọc metadata phiên bản mới nhất của chính tài khoản |
| Viêm lợi | `GET/POST cases/`; `POST cases/from-library/` | Danh sách, tạo ca từ máy/kho |
| Viêm lợi | `GET cases/{id}/status/`; `GET/PATCH cases/{id}/images/{image_index}/` | Theo dõi, đọc kết quả, sửa mô tả |
| Nhãn | `POST cases/{id}/images/{image_index}/detections/`; `PATCH/DELETE detections/{id}/` | Thêm/sửa/xoá box |
| Xuất kết quả | `GET cases/{id}/export/`; `GET cases/{id}/images/{image_index}/export/` | ZIP cả ca/một ảnh |
| Chia sẻ ca | `GET/POST cases/{id}/shares/`; `PATCH/DELETE shares/{id}/`; `GET cases/shared-with-me/` | Chia sẻ, cập nhật/thu hồi, danh sách nhận |
| CBCT | `GET scans/`, `scans/{id}/`, `scans/{id}/status/`; `POST scans/from-library/` | Danh sách, chi tiết, trạng thái, tạo phim từ kho |
| Upload CBCT | `POST scans/uploads/`; `PUT scans/uploads/{id}/{index}/`; `POST scans/uploads/{id}/complete/` | Khởi tạo, tải từng chunk, hoàn tất |
| Chia sẻ phim | `GET/POST scans/{id}/shares/`; `PATCH/DELETE scan-shares/{id}/`; `GET scans/shared-with-me/` | Chia sẻ và thu hồi quyền phim |
| Slicer | `POST scans/{id}/open-token/`; `GET scans/download/{token}/` | Tạo token; tải bằng token thay cho JWT |
| Phân vùng | `GET/POST scans/{id}/segmentations/` | Xem/nộp kết quả phân vùng |
| Kho dữ liệu | `GET/POST library/categories/`; `GET library/assets/` | Phân loại và danh sách tư liệu |
| Upload kho | `POST library/assets/uploads/`; `PUT library/assets/uploads/{id}/{index}/`; `POST library/assets/uploads/{id}/complete/` | Upload theo chunk |
| Tư liệu | `GET/PATCH/DELETE library/assets/{id}/`; `GET library/assets/{id}/download/` | Chi tiết, sửa metadata, xoá mềm, tải file |
| Lưu vào kho | `POST library/imports/scans/{id}/`; `POST library/imports/cases/{id}/images/{image_index}/` | Sao chép phim hoặc ảnh gốc/có chú thích vào kho |
| Bridge / cấu hình | `GET downloads/slicer-bridge/`; `GET/PATCH settings/` | Gói Bridge (không cần đăng nhập); cấu hình hệ thống |

### 2.6. Mô hình dữ liệu

| Model | Nội dung chính |
|---|---|
| `User`, `RoleRequest`, `EmailOTP`, `ActivityLog` | Tài khoản, yêu cầu vai trò, xác thực/đặt lại mật khẩu, nhật ký |
| `Patient` | Tên, mã, giới tính, năm sinh, ghi chú; dùng chung giữa ca, phim và kho |
| `Case`, `Image` | Ca phân tích và ảnh; ảnh có trạng thái `queued / processing / done / low_confidence / failed` |
| `Detection`, `Mask` | Box MGI, nhãn FDI, nguồn AI/bác sĩ, điểm ghép và polygon răng; box được xoá mềm |
| `Caption` | `ai_text` là bản sinh ban đầu từ T5/luật; `edited_text` lưu riêng bản bác sĩ sửa |
| `CaseShare`, `ScanShare` | Người nhận và quyền xem/sửa ca/phim |
| `Scan`, `Segmentation`, `ScanAccessToken` | Phim CBCT, kết quả phân vùng và token tải ngắn hạn |
| `DataCategory`, `DataAsset`, `DataAssetShare` | Phân loại, file + metadata, nguồn gốc/biến thể ảnh và quyền truy cập kho |
| `AssignmentWorkbook` | Lịch sử file Excel phân công theo tài khoản lễ tân |

---

## 3. Cài đặt và chạy hệ thống web

Các khối lệnh ở mục 3 dùng **Bash/Linux**. Người dùng Windows PowerShell xem mục 4.
Mọi lệnh `docker compose` chạy trong thư mục `web/`.

### 3.1. Yêu cầu

- Git, Docker và Docker Compose v2. Chỉ chạy web/kho dữ liệu/CBCT thì không cần GPU hay T5.
- Để phân tích viêm lợi: ba file trọng số tại `inferences/models/` và mã YOLOv9 tại `yolov9/`.
  Trọng số cần được cung cấp riêng, không mặc định có đủ sau khi clone.
- Worker inference trên host cần môi trường Python có các thư viện backend và ML phù hợp:
  PyTorch/torchvision, Ultralytics, OpenCV, SciPy; dùng T5 thì cần thêm Transformers và tokenizer.
- [web/environment.worker.yml](web/environment.worker.yml) là bản xuất Conda cho **Linux**.
  [web/requirements.worker.txt](web/requirements.worker.txt) ghim các gói PyTorch CUDA 12.6;
  không dùng nguyên bản như một bộ cài chung cho Windows/CPU.
- Chạy worker Docker hiện cần GPU NVIDIA, driver và cấu hình hỗ trợ GPU trong Docker.
  Không có GPU thì dùng worker trên host với `INFERENCE_DEVICE=cpu`.
- T5 là tuỳ chọn; xem mục 1.4 và 3.4. Xem phim 3D bằng ứng dụng desktop cần Slicer + Bridge.

Kiểm tra tài nguyên AI từ thư mục gốc nếu cần chạy inference:

```bash
ls inferences/models/best_vqt.pt inferences/models/best_vl.pt inferences/models/best_seg.pt
ls yolov9/
```

### 3.2. Khởi động hạ tầng + backend + frontend

Từ thư mục gốc, tạo cấu hình local nếu chưa có; không ghi đè file `.env` đang dùng:

```bash
cd web
test -f .env || cp .env.example .env
test -f backend/.env || cp backend/.env.example backend/.env
```

Sửa `web/.env` để đặt secret, thông tin DB và `SEED_ADMIN_*` của môi trường local.
`web/backend/.env` dành cho thông tin SMTP; không commit hai file này.
Sau đó chạy:

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=50 backend scans_worker
```

Lệnh trên bật **5 service mặc định**: `db`, `redis`, `backend`, `frontend`,
`scans_worker`. Backend tự chạy migration và `seed_admin`.
Worker viêm lợi **chưa chạy**; chọn một cách ở mục 3.3 khi cần phân tích ảnh.

- [Web app](http://localhost:3001) — đăng nhập rồi sử dụng các module.
- Backend tại `http://localhost:8002`; API nghiệp vụ dưới `/api/`
  (không có trang danh mục chung tại `/api/`).
- [Django Admin](http://localhost:8002/admin/) — quản trị dữ liệu bằng tài khoản admin.

### 3.3. Chạy Celery worker (chạy inference)

Chọn **một** trong hai cách cho môi trường local; tránh chạy nhầm nhiều worker
với đường dẫn hoặc phiên bản trọng số khác nhau trên cùng queue `inference`.

**Cách A — worker trên host**

Nếu dùng bản Conda Linux tương thích, tạo môi trường một lần từ thư mục gốc:

```bash
conda env create -f web/environment.worker.yml
conda activate dentai
```

Hoặc kích hoạt môi trường ML đã chuẩn bị riêng cho máy. Trong terminal tại thư mục gốc:

```bash
PROJECT_ROOT="$(pwd)"
cd web/backend
export DJANGO_SETTINGS_MODULE=config.settings
# Ví dụ bên dưới dùng thông tin DB mặc định; sửa cho khớp web/.env.
export DATABASE_URL='postgres://dentai:dentai@localhost:5432/dentai'
export CELERY_BROKER_URL='redis://localhost:6380/0'
export CELERY_RESULT_BACKEND='redis://localhost:6380/0'
export MEDIA_ROOT="$PROJECT_ROOT/web/media"
export INFERENCES_DIR="$PROJECT_ROOT/inferences"
export YOLOV9_DIR="$PROJECT_ROOT/yolov9"
export INFERENCE_DEVICE=cpu
export CAPTION_MODE=auto
export T5_DEVICE=auto

python -m celery -A config.celery worker --loglevel=info --concurrency=1 -Q inference -n inference-host@%h
```


Giữ terminal worker chạy. Đặt `INFERENCE_DEVICE=0` nếu môi trường PyTorch nhận GPU phù hợp.
Host dùng Redis cổng **6380**, không dùng tên service `redis`/`db` của mạng Docker.
Các biến trong `web/.env` **không tự được nạp vào terminal host**.

**Cách B — worker Docker có GPU**

Trong `web/`:

```bash
docker compose --profile worker-docker up -d --build worker
docker compose logs -f worker
```

Image dùng `requirements.worker.txt`; pipeline và trọng số được mount read-only.
Compose có khai báo cấp GPU NVIDIA: chỉ đổi `INFERENCE_DEVICE=cpu` không tự bỏ yêu cầu GPU
của service này. Máy không có GPU dùng cách A với môi trường CPU phù hợp.

### 3.4. Biến môi trường quan trọng

Giá trị dưới đây mô tả cấu hình Compose đi kèm; đường dẫn trên host phải đổi tương ứng.

| Biến | Cấu hình / ý nghĩa |
|---|---|
| `DATABASE_URL` | Compose kết nối `db:5432`; worker host dùng `localhost:5432`, cùng thông tin DB |
| `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` | Compose: `redis://redis:6379/0`; host: `redis://localhost:6380/0` |
| `MEDIA_ROOT` | Compose: `/app/media`; host: đường dẫn tuyệt đối tới `web/media` |
| `SCANS_ROOT`, `LIBRARY_ROOT`, `RECEPTION_ASSIGNMENTS_ROOT` | Các vùng lưu file riêng tư ngoài media công khai |
| `INFERENCES_DIR`, `YOLOV9_DIR` | Worker Docker: `/inferences`, `/yolov9`; host: đường dẫn tương ứng trong repo |
| `INFERENCE_DEVICE` | `cpu` hoặc số GPU; mặc định Django là `cpu`, worker Docker đặt `0` |
| `CAPTION_MODE` | `auto` (mặc định, T5 hoặc luật), `rule` (chỉ luật), `t5` (bắt buộc T5) |
| `T5_MODEL_DIR` | Mặc định thư mục `t5_training/t5_gingivitis_model` bên cạnh `get_caption.py`; có thể trỏ checkpoint khác |
| `T5_DEVICE` | `auto`, `cpu`, `cuda`, `cuda:0` hoặc số GPU; độc lập với thiết bị YOLO |
| `NEXT_PUBLIC_API_URL` | `http://backend:8000` trong Docker; Next.js chuyển tiếp API đến backend |
| `SEED_ADMIN_USERNAME/EMAIL/PASSWORD` | Cấu hình tài khoản admin khởi tạo trong `web/.env`; xem mục 4.4 |
| `EMAIL_*`, `DEFAULT_FROM_EMAIL` | Mặc định email ra log; gửi email thật theo mục 4.8 |
| `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` | Compose đang dùng cấu hình phát triển, không phù hợp để công khai nguyên trạng |

Để thêm T5 sau này, đặt checkpoint đầy đủ vào thư mục mặc định hoặc đặt `T5_MODEL_DIR`,
giữ `CAPTION_MODE=auto` rồi khởi động lại worker. Trong Docker, đường dẫn phải nằm
**trong container và được mount**; không dùng trực tiếp đường dẫn ổ đĩa Windows.

Khi triển khai ngoài local cần cấu hình riêng cho HTTPS, secret, host được phép,
SMTP, sao lưu và quyền truy cập file. Đặc biệt, ảnh viêm lợi trong `MEDIA_ROOT`
đang được phục vụ trực tiếp khi `DEBUG=1`; không dùng cấu hình demo cho dữ liệu bệnh nhân thật.

### 3.5. Kiểm tra hệ thống chạy đúng

1. `docker compose ps` cho thấy 5 service mặc định đang chạy; backend không lỗi migration.
2. Đăng nhập admin hoặc đăng ký và xác thực OTP; mở được Dashboard và Kho dữ liệu.
3. Tải một tư liệu thử nghiệm vào kho → chuyển `processing` sang `ready` → xem/tải được.
4. Khi worker `inference` đã sẵn sàng, tạo ca từ ảnh trên máy hoặc ảnh hợp lệ trong kho.
   Log phải xuất hiện task `apps.cases.tasks.run_inference_task` và kết quả hoặc cảnh báo độ tin cậy thấp.
5. Với tài khoản đang hoạt động và ZIP DICOM hợp lệ, kiểm tra preview CBCT trong đúng
   phạm vi vai trò; với bệnh nhân/sinh viên, danh sách chỉ chứa phim do tài khoản đó tải lên.
   Kiểm tra mở phim thật trong Slicer trên máy đã cài Slicer + Bridge.

Dùng dữ liệu thử nghiệm đã được phép sử dụng, không tải thông tin bệnh nhân thật lên môi trường demo.

### 3.6. Các lệnh thường dùng

Chạy trong `web/`; chỉ chọn lệnh phù hợp với thao tác cần làm:

```bash
docker compose logs -f backend scans_worker
docker compose restart backend scans_worker
docker compose exec backend python manage.py check
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py export_labels --out /app/media/labels
docker compose up -d --build backend frontend scans_worker
docker compose down
```

- Backend/frontend mount mã nguồn nên phần lớn thay đổi được tự nạp; worker cần khởi động lại khi sửa Python.
- Thay dependency, Dockerfile hoặc biến Compose: dùng `up -d --build` để dựng lại/tạo lại service;
  `restart` không nạp cấu hình môi trường mới.
- Worker host: dừng bằng `Ctrl+C`, chạy lại trong đúng môi trường.
  Worker Docker: cập nhật với `docker compose --profile worker-docker up -d --build worker`.
- `docker compose down` giữ named volume. Không thêm `-v` để sửa lỗi thông thường:
  tuỳ chọn này xoá volume DB/Redis. Sao lưu DB cùng `web/media`,
  `web/backend/scans_storage`, `web/backend/library_storage` và
  `web/backend/reception_assignments_storage` trước thao tác ảnh hưởng dữ liệu.

### 3.7. Xử lý sự cố

| Triệu chứng | Kiểm tra / cách xử lý |
|---|---|
| Ảnh viêm lợi ở `queued` | Worker có nhận queue `inference` không? Kiểm tra broker, DB, trọng số và log worker |
| Kho dữ liệu/phim ở `processing` | Kiểm tra `docker compose logs --tail=100 scans_worker`; worker này nhận queue `scans` |
| Không tìm thấy trọng số/ảnh | Kiểm tra ba file `.pt`, `INFERENCES_DIR`, `YOLOV9_DIR`; host và backend phải dùng cùng thư mục media |
| Lỗi thiếu `model.safetensors`/`pytorch_model.bin` | Dùng `CAPTION_MODE=auto`/`rule` khi chưa có T5; chế độ `t5` cần checkpoint đầy đủ; khởi động lại worker |
| CUDA hết bộ nhớ / không có GPU | Worker host dùng `INFERENCE_DEVICE=cpu`, `T5_DEVICE=cpu`, concurrency 1; xem lưu ý GPU Docker ở mục 3.3 |
| API 500/502, migration lỗi | Xem log backend; kiểm tra DB và migration, dựng lại service khi cần; không xoá volume |
| Kết quả độ tin cậy thấp | Kiểm tra ảnh, mask và phép ghép; không coi cảnh báo là kết luận bệnh; giới hạn ngưỡng hiện tại ở mục 1.4 |
| Có dữ liệu ở “Tất cả” nhưng không ở “Được chia sẻ” | Admin nhìn thấy dữ liệu toàn hệ thống; tab chia sẻ chỉ lọc `DataAssetShare` cấp trực tiếp |
| Không có nút chẩn đoán trong kho | Kiểm tra quyền, trạng thái `ready`, phân loại và loại dữ liệu theo bảng ở mục 2.3 |

---

## 4. Hướng dẫn nhanh (Windows — Docker Desktop)

> Các lệnh dưới đây dùng **PowerShell**, không dùng cú pháp `set VAR=...` của cmd.exe.
> Không cần xoá database hay clone lại project để thấy thay đổi mã nguồn.

### 4.1. Yêu cầu

- Docker Desktop đã khởi động, dùng Linux containers.
- Git, PowerShell và trình duyệt.
- Nếu chạy AI trên host: môi trường Python/ML đã chuẩn bị và ba trọng số ở mục 3.1.
  Không có T5 vẫn chạy được bằng `CAPTION_MODE=auto` hoặc `rule`.
- Nếu cần mở phim 3D: cài 3D Slicer và Bridge theo trang hướng dẫn của ứng dụng.

### 4.2. Tải project

Thay `<repo-url>` bằng URL repository của nhóm. Nếu đã có project, mở PowerShell
tại thư mục gốc chứa `README.md`, không clone thêm bản khác.

```powershell
git clone "<repo-url>" dentai
Set-Location dentai
```

### 4.3. Khởi động toàn bộ hệ thống (backend + frontend + DB + Redis)

Từ thư mục gốc, tạo hai file cấu hình nếu chưa có:

```powershell
Set-Location web
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
if (-not (Test-Path -LiteralPath backend/.env)) {
    Copy-Item -LiteralPath backend/.env.example -Destination backend/.env
}
```

Chỉnh `web/.env` để đặt secret, thông tin DB và tài khoản admin cho môi trường local,
rồi chạy trong thư mục `web`:

```powershell
docker compose up -d --build
docker compose ps
docker compose logs --tail=50 backend scans_worker
```

Có **5 service mặc định**, gồm cả `scans_worker` để xử lý kho dữ liệu và phim CBCT.
Backend tự migrate và tạo admin khởi đầu. Không bắt buộc log có dòng
`Applying ...` nếu các migration đã được áp dụng từ lần trước.
Muốn phân tích viêm lợi, chạy thêm worker ở mục 4.6 hoặc worker Docker GPU ở mục 3.3.

### 4.4. Tạo tài khoản admin đầu tiên

- Đặt `SEED_ADMIN_USERNAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` trong
  `web/.env` **trước lần khởi động đầu tiên**. Không dùng mật khẩu mẫu cho môi trường chia sẻ.
- `seed_admin` tự chạy sau migration, thiết lập cả vai trò admin của ứng dụng
  và quyền Django Admin; không cần chạy `createsuperuser` cho luồng khởi tạo này.
- Chạy lại không ghi đè mật khẩu tài khoản đã tồn tại. Đổi `SEED_ADMIN_PASSWORD`
  trong file không phải là thao tác đổi mật khẩu cho tài khoản cũ; dùng chức năng đổi/đặt lại mật khẩu.

### 4.5. Truy cập

| Địa chỉ | Chức năng |
|---|---|
| [localhost:3001](http://localhost:3001) | Web app |
| [Đăng nhập](http://localhost:3001/login), [Đăng ký](http://localhost:3001/register) | Tài khoản |
| [Kho dữ liệu](http://localhost:3001/library) | Lưu trữ và dùng lại tư liệu |
| [Trò chuyện](http://localhost:3001/chat) | Trang chờ chức năng trò chuyện; mọi vai trò |
| [Cài đặt 3D Slicer](http://localhost:3001/downloads/3d-slicer) | Phần mềm desktop và Bridge |
| [Django Admin](http://localhost:8002/admin/) | Quản trị dữ liệu; cần tài khoản có quyền |

### 4.6. Luồng sử dụng cơ bản

#### Đăng ký tài khoản mới

1. Mở trang đăng ký, nhập thông tin, mật khẩu và xác nhận mật khẩu; chọn vai trò muốn đăng ký.
2. Nhận OTP 6 số và nhập trên trang xác thực. Mặc định môi trường local in email ra log:

```powershell
docker compose logs --tail=100 backend
```

3. Nếu đăng ký bác sĩ, chờ admin duyệt yêu cầu tại trang quản lý tài khoản.
   Trước khi được duyệt, tài khoản vẫn có quyền bệnh nhân. Không chia sẻ log chứa OTP.

#### Đăng nhập

Dùng tên đăng nhập **hoặc email** và mật khẩu đã đặt. Sau khi admin duyệt bác sĩ,
đăng nhập lại bằng chính mật khẩu đó. Nếu quên, dùng **Quên mật khẩu** trên trang đăng nhập;
email/OTP vẫn dùng cấu hình gửi thư của môi trường hiện tại.

#### Phân tích ảnh (cần Celery worker)

Mở **terminal PowerShell thứ hai tại thư mục gốc project**. Ví dụ sau dùng
`.venv` tại gốc, đã cài đủ thư viện theo mục 3.1; sửa `$workerPython` nếu dùng môi trường khác.
Ví dụ DB dùng giá trị mặc định, phải đổi cho khớp `web/.env` của bạn.

```powershell
$projectRoot = (Get-Location).Path
$workerPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $workerPython)) {
    throw 'Chưa tìm thấy Python của môi trường ML. Kiểm tra lại $workerPython.'
}

Set-Location (Join-Path $projectRoot 'web\backend')
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

& $workerPython -m celery -A config.celery worker --loglevel=info --pool=solo --concurrency=1 -Q inference -n inference-host@%h
```

Giữ terminal này chạy. Vào `/analysis/new`, chọn ảnh từ máy hoặc từ kho rồi phân tích.
Không cần worker inference để chỉ tải/xem dữ liệu trong kho; việc đó do `scans_worker` đảm nhiệm.

Với phim 3D, làm theo luồng ở mục 2.3. Trang cài Slicer lưu xác nhận trong trình duyệt;
có thể mở lại `/downloads/3d-slicer` và chọn **Kiểm tra/cài đặt lại**.
Gói Bridge có hướng dẫn riêng tại [web/slicer_bridge/README.md](web/slicer_bridge/README.md).
Nếu phép thử mở Slicer báo HTTP 404 cho `token=test`, đó là token thử không tồn tại,
không phải lỗi tải phim thật.

### 4.7. Các lệnh thường dùng (Windows)

Chạy trong `web`, chọn lệnh theo nhu cầu:

| Thao tác | Lệnh |
|---|---|
| Xem trạng thái | `docker compose ps` |
| Xem log | `docker compose logs --tail=100 backend frontend scans_worker` |
| Áp dụng migration | `docker compose exec backend python manage.py migrate` |
| Nạp lại backend và worker kho/phim | `docker compose restart backend scans_worker` |
| Cập nhật image/cấu hình service | `docker compose up -d --build backend frontend scans_worker` |
| Kiểm tra Django | `docker compose exec backend python manage.py check` |
| Dừng hệ thống, giữ volume | `docker compose down` |

Sau khi đổi mã Python pipeline, dừng worker host bằng `Ctrl+C` rồi chạy lại.
Sau khi cập nhật frontend, tải lại trình duyệt; nếu còn giao diện cũ thử `Ctrl+F5`.
Không xoá volume DB để làm mới giao diện.

### 4.8. Cấu hình email thật (SMTP)

Mặc định email xác thực và đặt lại mật khẩu chỉ xuất hiện trong log.
Để gửi thật:

1. Điền `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` trong
   `web/backend/.env`, theo thông tin nhà cung cấp SMTP. Không ghi mật khẩu vào Compose/README.
2. Trong khối `x-django-env` của `web/docker-compose.yml`, đổi `EMAIL_BACKEND`
   sang SMTP và cấu hình máy chủ/cổng/TLS tương ứng. Ví dụ cấu hình máy chủ đang có trong dự án:

```yaml
EMAIL_BACKEND: django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST: smtp.gmail.com
EMAIL_PORT: "587"
EMAIL_USE_TLS: "True"
```

3. Tạo lại service để nhận môi trường mới; chỉ `restart` là chưa đủ:

```powershell
docker compose up -d backend scans_worker
```

Nếu đang dùng worker Docker, tạo lại service `worker` theo mục 3.3.
Thử gửi OTP mới và kiểm tra log lỗi nếu chưa nhận được email.

### 4.9. Xử lý sự cố (Windows)

| Triệu chứng | Kiểm tra / cách xử lý |
|---|---|
| Docker không kết nối được | Mở Docker Desktop, đợi engine sẵn sàng; kiểm tra `docker version` |
| Thiếu `backend/.env` khi chạy Compose | Tạo từ `.env.example` theo mục 4.3, không ghi đè cấu hình cũ |
| Không thấy chức năng/giao diện mới | Kiểm tra đúng thư mục chạy project; cập nhật service ở mục 4.7 rồi tải lại trình duyệt |
| Đăng ký/API trả 404/500/502 | Xem log backend/frontend và kiểm tra đúng route; dựng lại service khi cần, không xoá DB |
| Không thấy OTP | Xem log backend khi dùng console; với SMTP, kiểm tra thông tin gửi thư và thư rác |
| Không đăng nhập được sau xác thực/duyệt vai trò | Kiểm tra username/email, mật khẩu, trạng thái kích hoạt và xác thực ở Django Admin; duyệt vai trò không đổi mật khẩu |
| Worker không chạy hoặc không nhận task | Dùng đúng Python/môi trường ML, `--pool=solo`, queue `inference` và Redis host cổng 6380 |
| Không thấy trang thiết lập Slicer | Mở trực tiếp `/downloads/3d-slicer`; trạng thái đã xác nhận được lưu riêng theo trình duyệt |
| Bấm mở phim nhưng Slicer không mở | Kiểm tra đã cài cả Slicer và Bridge, cho phép mở `dentai://`; thử lại để lấy token mới hoặc tải phim thủ công |
| Port 3001/8002/5432/6380 đã bị chiếm | Xác định ứng dụng đang dùng port; nếu đổi mapping Compose, cập nhật các URL/biến host tương ứng |

Các lỗi trọng số, T5, quyền kho dữ liệu và queue xử lý xem thêm mục 3.7.
