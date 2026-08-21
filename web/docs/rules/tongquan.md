# Tổng quan dự án

---

## 1. Thư mục

```

 dentAI/                            ← git repo\
  (branch mặc định: develop)
    ├── README.md                      hướng dẫn cài đặt/chạy (có bản Windows)
    ├── inferences/                    pipeline AI (chỉ liên quan module chẩn đoán)
    │   ├── get_image.py               
    │   ├── matching.py                
    │   ├── detect_dual_custom.py      
    │   ├── t5_training/               
    │   └── models/                    
    │
    └── web/
        ├── docker-compose.yml         5 service: db, redis, backend, worker, frontend
        ├── rules/coding-rules.md      quy ước code
        ├── init-db/                   lược đồ SQL + ERD module đào tạo
        ├── docs/training_management/  tài liệu thiết kế Phase 2
        ├── media/                     gitignored — ảnh gốc + ảnh annotated
        │
        ├── backend/                   Django project
        │   ├── config/                settings.py · urls.py · celery.py
        │   └── apps/
        │       ├── users/             User, Role, EmailOTP, JWT, gửi OTP email
        │       ├── cases/             Patient · Case · Image · Detection · Mask · Caption
        │       ├── settings_app/      cấu hình key-value (ngưỡng confidence)
        │       └── training/          (New) module đào tạo — Phase 2 tạo ở đây
        │
        └── frontend/                  Next.js 14 (App Router)
            └── src/
                ├── app/(auth)/        login · register · verify-otp
                ├── app/(main)/        analysis · history · settings · help
                │                      (New) training/ — Phase 2 tạo ở đây
                ├── components/        layout/ · providers/ · results/ (react-konva)
                └── lib/               api.ts, auth.ts
```

---

## 2. Techstack

| Tầng     | Công nghệ                                                                                | Nằm ở đâu                                         |
| -------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Frontend | **TypeScript** · Next.js 14 App Router · Tailwind CSS · PrimeReact · react-konva · axios | `web/frontend/`                                   |
| Backend  | **Python 3** · Django 4.2 · Django REST Framework · SimpleJWT                            | `web/backend/`                                    |
| Hàng đợi | Celery 5 + Redis 7 (chạy AI bất đồng bộ)                                                 | `backend/config/celery.py`, `apps/cases/tasks.py` |
| CSDL     | **PostgreSQL 15**                                                                        | service `db`                                      |
| AI       | Python · PyTorch · YOLOv9 (detect + segment) · T5 (HuggingFace)                          | `inferences/`                                     |
| Đóng gói | Docker Compose                                                                           | `web/docker-compose.yml`                          |

---

## 3. Hệ thống chạy

```
Trình duyệt :3001 ──► frontend (Next.js)
                          │  gọi /api/* (Next rewrite proxy)
                          ▼
                     backend :8002 (Django + DRF) ──► db :5432 (PostgreSQL)
                          │                             ▲
                          │ đẩy task nặng               │ ghi kết quả
                          ▼                             │
                     redis :6380 ──► worker (Celery + GPU) ──► inferences/ (YOLOv9 + T5)
```

| Service    | Vai trò                   | Port trên máy bạn               |
| ---------- | ------------------------- | ------------------------------- |
| `frontend` | Next.js                   | **3001**                        |
| `backend`  | Django + DRF              | **8002**                        |
| `db`       | PostgreSQL 15             | 5432                            |
| `redis`    | broker Celery             | **6380** (trong Docker là 6379) |
| `worker`   | chạy pipeline AI, cần GPU | — (không tự bật cùng `up`)      |

---

## 4. Luồng dự án

### 4.1. Luồng nghiệp vụ — module chẩn đoán (Phase 1, đã chạy)

```
Bác sĩ upload ảnh + thông tin bệnh nhân
  → Django tạo Case + Image (status = queued), đẩy task vào Celery, trả về ngay
  → Màn hình Processing poll trạng thái mỗi 2 giây
  → Worker chạy YOLOv9 (phát hiện viêm lợi + mask răng) → ghép răng ↔ vùng viêm
    → T5 sinh mô tả lâm sàng → lưu box/mask/caption/ảnh annotated vào DB
  → Bác sĩ xem kết quả, sửa box & caption (bản AI gốc KHÔNG bị ghi đè)
  → Xuất ZIP (ảnh annotated + nhãn YOLO + caption)
```

### 4.2. Luồng nghiệp vụ — module đào tạo (Phase 2)

```
Giáo vụ  : tạo năm học → môn học → gán giảng viên → lớp học phần → ghi danh SV (tay/Excel)
           → cấu hình thành phần điểm (Chuyên cần/Giữa kỳ/Cuối kỳ)
           → khởi tạo bảng điểm → CẤP QUYỀN CHẤM cho giảng viên theo từng thành phần
Sinh viên: tạo thư mục cá nhân/nhóm → nộp hồ sơ bệnh án / tiểu luận (nộp lại = bản mới)
Giảng viên: mở bài nộp → chấm → điểm TỰ ĐẨY vào bảng điểm kèm tên người chấm + lưu vết sửa
Sinh viên: xem điểm của chính mình
```

- **Được phân công dạy ≠ được chấm điểm.** Quyền chấm do giáo vụ cấp riêng từng thành phần điểm.
- **Giáo vụ không chấm điểm được.** 

### 4.3. Luồng một request đi qua code (backend)

```
config/urls.py → apps/<app>/urls.py → views.py → serializers.py → models.py → PostgreSQL
                                        ↑
                                  permissions.py  (2 tầng: theo vai trò + theo từng bản ghi)
```

Việc chạy quá 1–2 giây (import Excel lớn, chạy AI) → đẩy sang **Celery**, trả `202` rồi cho
client hỏi trạng thái. Không bắt người dùng đợi trong request.

### 4.4. Luồng làm việc của nhóm

```
develop (branch mặc định)
   └── feature/<ten-viec>   ← code ở đây, pull develop mỗi sáng
          └── Pull Request  ← ≥ 2 test (happy path + 1 case bị chặn quyền) → review → merge
```

---

## 5. Chạy thử

```bash
git clone <repo> && cd dentAI/web
docker compose up -d --build          # db + redis + backend + frontend (KHÔNG có worker)
docker compose exec backend python manage.py createsuperuser
```

Mở <http://localhost:3001> — đăng nhập được là xong. Django Admin: <http://localhost:8002/admin/>.

```bash
docker compose logs -f backend        # xem log
docker compose exec backend python manage.py migrate
docker compose down                   # dừng (thêm -v để xoá sạch dữ liệu)
```

> Worker AI chạy riêng bằng conda trên máy có GPU (xem `README.md` mục 3.3). **Module đào tạo
> không cần worker** — không chạy được worker cũng làm việc bình thường.

---

## 6. Chú ý

**6.1. Clone xong frontend không build được.** `.gitignore` có dòng `lib/` nên nuốt luôn
`frontend/src/lib/api.ts` và `auth.ts` — hai file mà 9 file khác đang import. Xin file từ người đã
chạy được, và sửa `.gitignore` thành `/lib/`. 

**6.2. Worker chẩn đoán đang thiếu file** (`main.py`, `get_caption.py` đã bị xoá khỏi repo) → task
inference sẽ `ImportError`. Không phải bạn làm hỏng. Module đào tạo không chạm vào đây.

**6.3. API hiện tại KHÔNG yêu cầu đăng nhập.** Mặc định của dự án là `AllowAny`. Với module đào
tạo, **mọi view mới phải khai `permission_classes` tường minh** — điểm số và hồ sơ sinh viên là dữ
liệu nhạy cảm, quên khai là lộ dữ liệu cho người lạ.

**6.4. Repo chưa có test, chưa có CI.** Phase 2 bắt buộc: mỗi PR kèm ít nhất 2 test.

Vặt nhưng hay mất thời gian: Redis ra host là port **6380** · chưa có phân trang server-side
(module đào tạo phải tự thêm) · file trong `media/` hiện ai biết đường dẫn là tải được — Phase 2
phải chặn lại.

---

## 7. Quy ước code

1. **Không ghi đè dữ liệu gốc.** Bản AI giữ nguyên, bản người sửa lưu cột khác; sửa điểm phải ghi
   lịch sử; nộp lại bài tạo bản mới, không đè bản cũ.
2. **Xoá là xoá mềm** (`is_deleted = True`), không `DELETE` thật.
3. **`GET` đọc · `POST` tạo · `PATCH` sửa · `DELETE` xoá — dự án không dùng `PUT`.**
   URL số nhiều kebab-case, kết thúc bằng `/?$`, có tiền tố `/api/`.
4. **Serializer phải liệt kê `fields` rõ ràng**, cấm `fields = "__all__"`.
5. **Phân quyền đủ hai tầng:** vai trò (`has_permission`) *và* từng bản ghi
   (`has_object_permission`). Chặn quyền ở frontend chỉ để giao diện đẹp — quyền thật ở backend.
6. **Message lỗi tiếng Việt, ngắn gọn**, không trả stack trace: `{"detail": "..."}`.
   Mã lỗi: 400 sai dữ liệu · 403 không đủ quyền · 409 trùng · 422 sai quy tắc nghiệp vụ.


