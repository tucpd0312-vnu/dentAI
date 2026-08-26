#. Coding rules

---

## 1. Stack
| Tầng        | Công nghệ                            | Ghi chú                                       |
| ----------- | ------------------------------------ | --------------------------------------------- |
| Backend     | Django 4.2 + DRF 3.15                | View kiểu **`APIView`**, không ViewSet/Router |
| Auth        | simplejwt 5.3                        | Access 2h · Refresh 7 ngày · `Bearer`         |
| Async       | Celery 5.4 + Redis 7                 | Chỉ dùng cho việc nặng (AI, import lớn)       |
| DB          | PostgreSQL 15                        | Migration Django, không viết SQL tay          |
| Frontend    | Next.js 14 App Router + TypeScript 5 | `strict: true`                                |
| CSS         | Tailwind 3.4                         | Utility inline; PrimeReact dùng rất ít        |
| Icon        | Material Symbols Outlined            |                                               |
| HTTP client | axios (1 instance ở `@/lib/api`)     |                                               |
| State       | `useState` / `useEffect`             | **Không** React Query / Redux / Zustand       |

---

## 2. Đặt tên

### 2.1. Backend (Python — theo PEP 8)

| Loại                            | Quy tắc                                 | Ví dụ                                                |
| ------------------------------- | --------------------------------------- | ---------------------------------------------------- |
| Django app                      | snake_case, số nhiều hoặc danh từ chung | `cases`, `users`, `training`                         |
| Module                          | snake_case                              | `models.py`, `email_service.py`, `permissions.py`    |
| Class (model, view, serializer) | PascalCase                              | `Detection`, `CaseListCreateView`, `ImageSerializer` |
| Hàm / biến                      | snake_case                              | `run_inference_task`, `local_media_path`             |
| Hằng số module                  | UPPER_SNAKE_CASE                        | `MGI_COLORS`, `_CSV_HEADER`                          |
| Hàm/biến private của module     | `_` đầu tên                             | `_build_image_zip`, `_update_case_status`            |
| Cột DB                          | snake_case                              | `created_at`, `is_deleted`, `tooth_fdi`              |
| Tên view                        | `<Resource><Hành động>View`             | `AcademicYearListCreateView`, `DetectionUpdateView`  |
| Tên Celery task                 | `apps.<app>.tasks.<verb>_task`          | `apps.cases.tasks.run_inference_task`                |
| Tên URL (`name=`)               | kebab-case                              | `case-list-create`, `academic-year-detail`           |

### 2.2. Frontend (TypeScript/React)

| Loại                | Quy tắc                                | Ví dụ                                               |
| ------------------- | -------------------------------------- | --------------------------------------------------- |
| Component file      | PascalCase.tsx                         | `Sidebar.tsx`, `ResultsCanvas.tsx`, `RoleGuard.tsx` |
| Page (App Router)   | luôn là `page.tsx` trong thư mục route | `app/(main)/history/page.tsx`                       |
| Layout              | `layout.tsx`                           | `app/(main)/layout.tsx`                             |
| Thư mục route       | kebab-case                             | `analysis/new`, `verify-otp`, `academic-years`      |
| Route động          | `[param]`                              | `analysis/[caseId]/results/[imageIndex]`            |
| Route group         | `(tên)` — không xuất hiện trong URL    | `(auth)`, `(main)`                                  |
| Module trong `lib/` | camelCase.ts                           | `api.ts`, `auth.ts`                                 |
| Hook                | camelCase, prefix `use`                | `useAuth`                                           |
| Biến / hàm          | camelCase                              | `handleSubmit`, `pageNumbers`                       |
| Hằng số module      | UPPER_SNAKE_CASE                       | `PAGE_SIZE`, `STATUS_LABEL`, `NAV`                  |
| Type / Interface    | PascalCase                             | `AuthUser`, `CaseListItem`, `StatusFilter`          |

### 2.3. Nguyên tắc chung khi đặt tên

- Tên phải **mô tả rõ mục đích**, không viết tắt khó hiểu.
- Hàm bắt đầu bằng **động từ**: `get_`, `create_`, `build_`, `render_`, `validate_`, `handle`.
- Boolean bắt đầu bằng `is_`, `has_`, `can_`, `should_`: `is_low_confidence`, `is_edited`.
- Không dùng tên 1 ký tự trừ biến vòng lặp (`i`, `idx`) hoặc quy ước quá quen (`w`, `h` cho
  width/height ảnh).

---

## 3. Backend — Django + DRF

### 3.1. Model

```python
class Detection(models.Model):
    class Source(models.TextChoices):
        AI = "ai"
        DOCTOR = "doctor"

    image = models.ForeignKey(Image, on_delete=models.CASCADE, related_name="detections")
    source = models.CharField(max_length=8, choices=Source.choices, default=Source.AI)
    is_deleted = models.BooleanField(default=False)
    tooth_fdi = models.CharField(max_length=4)      # '11','12',...,'43'
    mgi_level = models.PositiveSmallIntegerField()  # 0–4
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["tooth_fdi"]

    def __str__(self):
        return f"Detection tooth={self.tooth_fdi} MGI{self.mgi_level} (image #{self.image_id})"
```

**Quy tắc:**
- Enum trạng thái dùng **`models.TextChoices`** lồng trong model, không dùng list tuple rời.
- Mọi `ForeignKey` phải đặt **`related_name`** rõ nghĩa (số nhiều): `detections`, `enrollments`.
- Mọi model phải có **`__str__`** hữu ích (hiện lên Django Admin, log, shell).
- Có `created_at = auto_now_add` và `updated_at = auto_now` cho model nghiệp vụ có vòng đời.
- **Soft delete** cho dữ liệu người dùng có thể khôi phục / cần vết lịch sử: dùng cờ `is_deleted`,
  không `DELETE` thật. Điểm số và bài nộp **bắt buộc** soft delete.
- **Không bao giờ ghi đè dữ liệu gốc.** Giữ bản gốc + bản sửa (`ai_text` / `edited_text`), hoặc
  ghi bảng lịch sử riêng (`GradeHistory`).
- Đơn vị đo phải chuẩn hoá và ghi rõ trong comment (toạ độ box đang lưu **YOLO normalized 0–1**).

### 3.2. Migration

```bash
docker compose exec backend python manage.py makemigrations <app>
docker compose exec backend python manage.py migrate
```

**Quy tắc:**
- Migration được **commit** cùng thay đổi model, cùng một PR.
- Không sửa tay file migration đã merge. Cần đổi → tạo migration mới.
- Không squash/xoá migration của người khác.
- Đổi `choices` của field → vẫn cần migration `AlterField` (Django coi là thay đổi schema-level).
- Trước khi tạo PR: `makemigrations --check --dry-run` phải sạch.

### 3.3. View

```python
class AcademicYearListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        years = AcademicYear.objects.order_by("-start_date")
        return Response(AcademicYearSerializer(years, many=True).data)

    def post(self, request):
        ser = AcademicYearSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(created_by=request.user)
        return Response(ser.data, status=status.HTTP_201_CREATED)
```

**Quy tắc:**
- Dùng **`APIView`** với method `get/post/patch/delete`. Không ViewSet, không Router — để đồng bộ
  với `apps/cases` và `apps/users` hiện có.
- **Mọi view phải khai báo `permission_classes` tường minh.** Mặc định toàn cục đang là `AllowAny`
  (xem `config/settings.py`) — dựa vào nó là để lộ dữ liệu.
- Validate qua **serializer**, không tự viết `if request.data.get(...)` rải rác.
  `ser.is_valid(raise_exception=True)` để DRF tự trả 400 đúng format.
- Lấy object bằng `get_object_or_404(...)` — không `try: Model.objects.get() except DoesNotExist`.
- Truy vấn liên quan dùng `select_related` / `prefetch_related` để tránh N+1:
  `Case.objects.select_related("patient")`.
- View **không chứa logic nghiệp vụ phức tạp**. Logic ≥ ~30 dòng → tách hàm module-level
  `_snake_case` ở cuối file (xem `_build_image_zip`, `_csv_rows` trong `apps/cases/views.py`),
  hoặc `services.py` nếu dùng chung nhiều nơi.
- Việc chạy > 1–2 giây (import Excel lớn, gửi hàng loạt email, chạy AI) → **đẩy sang Celery task**,
  trả `202` + endpoint cho client poll trạng thái. Không để request HTTP treo.

### 3.4. Serializer

```python
class GradeComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradeComponent
        fields = ["id", "course", "name", "weight", "max_score", "order"]
        read_only_fields = ["id"]

    def validate_weight(self, value):
        if not 0 < value <= 1:
            raise serializers.ValidationError("Trọng số phải nằm trong khoảng (0, 1].")
        return value
```

**Quy tắc:**
- `ModelSerializer` cho CRUD; `serializers.Serializer` cho input không map 1-1 với model
  (`CaseCreateSerializer`, `LoginSerializer`).
- **Liệt kê `fields` tường minh** — cấm `fields = "__all__"` (lộ trường không định expose).
- Trường không được client sửa → `read_only_fields` (`id`, `created_at`, `source`, `graded_by`…).
- Trường nhạy cảm → `write_only=True` (`password`).
- Validate nghiệp vụ đặt trong `validate_<field>()` (một trường) hoặc `validate()` (nhiều trường
  liên quan). **Message lỗi bằng tiếng Việt có dấu.**
- Giá trị suy ra từ người đăng nhập (`created_by`, `graded_by`) **luôn** đặt ở view qua
  `ser.save(created_by=request.user)` — không bao giờ nhận từ payload client.

### 3.5. URL

```python
from django.urls import re_path

from . import views

urlpatterns = [
    re_path(r"^courses/?$", views.CourseListCreateView.as_view(), name="course-list-create"),
    re_path(r"^courses/(?P<pk>\d+)/?$", views.CourseDetailView.as_view(), name="course-detail"),
]
```

**Quy tắc:**
- Dự án đặt `APPEND_SLASH = False`, nên **mọi pattern phải kết thúc bằng `/?$`** để chấp nhận cả
  `/api/training/courses` lẫn `/api/training/courses/`. Quên `/?` là frontend 404 mà không rõ lý do.
- Tên resource **số nhiều, kebab-case**: `academic-years`, `grade-components`, `teaching-hours`.
- Mọi endpoint có prefix `/api/`. App mới đăng ký trong `config/urls.py` bằng
  `path("api/<app>/", include("apps.<app>.urls"))`.
- Đặt `name=` cho mọi route (kebab-case) để `reverse()` và test dùng được.
- REST đúng nghĩa: `GET` đọc · `POST` tạo · `PATCH` sửa một phần · `DELETE` xoá.
  Dự án dùng `PATCH`, **không dùng `PUT`**.

### 3.6. Phân quyền

```python
class CanGradeCourse(permissions.BasePermission):
    """Role alone is not enough — a lecturer may teach one course and not another."""

    def has_object_permission(self, request, view, obj):
        if request.user.role == Role.ADMIN:
            return True
        return GradingPermission.objects.filter(course=obj.course, lecturer=request.user).exists()
```

**Quy tắc:**
- Permission class đặt ở `apps/<app>/permissions.py`, kế thừa `permissions.BasePermission`.
- Kiểm tra role → `has_permission`. Kiểm tra "có phải của mình / mình có quyền trên object này"
  → **`has_object_permission`** (nhớ gọi `self.check_object_permissions(request, obj)` trong view).
- **Role thôi là chưa đủ** với hầu hết nghiệp vụ đào tạo. Giảng viên chỉ chấm được môn mình được
  cấp quyền; sinh viên chỉ xem được điểm/bài của chính mình. Luôn cân nhắc object-level.
- Không kiểm tra quyền bằng `if request.user.role == "..."` rải rác trong view — gói vào
  permission class để tái sử dụng và test được.
- Chặn quyền ở frontend chỉ là UX. **Nguồn sự thật về quyền luôn ở backend.**

### 3.7. Xử lý lỗi & response

**Quy tắc:**
- Để **DRF tự sinh lỗi** cho các case chuẩn: `is_valid(raise_exception=True)` → 400,
  `get_object_or_404` → 404, `permission_classes` → 401/403. Không tự bọc try/except quanh chúng.
- Chỉ `try/except` khi thật sự xử lý được lỗi, và **phải nói rõ vì sao nuốt lỗi**:

```python
try:
    store.add_feedback(record)
except Exception:
    pass  # FALC bridge failure must not break the API response
```

- **Cấm `except: pass` trần không comment.** Nuốt lỗi im lặng là cách nhanh nhất để mất một buổi debug.
- Message lỗi trả client: tiếng Việt, ngắn, hành động được — `{"detail": "Bạn không có quyền chấm điểm môn này."}`.
- Không trả stack trace / thông tin nội bộ cho client.

| Tình huống                                                      | HTTP status |
| --------------------------------------------------------------- | ----------- |
| Dữ liệu đầu vào sai                                             | 400         |
| Chưa đăng nhập / token hỏng, hết hạn                            | 401         |
| Đã đăng nhập nhưng không đủ quyền                               | 403         |
| Không tìm thấy resource                                         | 404         |
| Trùng dữ liệu (mã môn, sinh viên đã trong lớp)                  | 409         |
| Vi phạm quy tắc nghiệp vụ (nộp sau deadline, tổng trọng số ≠ 1) | 422         |
| Lỗi hệ thống ngoài dự kiến                                      | 500         |

### 3.8. Celery task

```python
@shared_task(bind=True, name="apps.training.tasks.import_students_task")
def import_students_task(self, class_id: int, file_path: str) -> dict:
    ...
```

**Quy tắc:**
- Task nhận **id, không nhận object** — object không serialize được qua broker và sẽ cũ khi task chạy.
- Đặt `name=` tường minh dạng `apps.<app>.tasks.<verb>_task`.
- Task **tự cập nhật trạng thái** vào DB (`queued → processing → done/failed`) để client poll được.
- Lỗi phải ghi vào DB trước khi raise, đừng để record kẹt ở `processing` vĩnh viễn
  (xem `run_inference_task` dùng `finally` để cập nhật trạng thái case).
- Import nặng (torch, cv2, pandas) đặt **bên trong hàm task**, không ở đầu module — nếu không
  backend cũng phải load theo và khởi động chậm/lỗi.
- Task mới cần queue riêng → khai báo trong `CELERY_TASK_ROUTES` ở `config/settings.py`
  (`inference` là queue của GPU worker, **đừng** nhét task đào tạo vào đó).

### 3.9. Cấu hình & biến môi trường

**Quy tắc:**
- Mọi cấu hình đọc qua `os.environ.get("X", <default dev>)` trong `config/settings.py`, rồi
  các nơi khác `from django.conf import settings`. **Không** gọi `os.environ` rải rác ngoài settings.
- Thêm biến env mới → cập nhật đồng thời: `config/settings.py`, `docker-compose.yml`,
  và bảng biến môi trường trong `README.md` + `docs/ONBOARDING.md`.
- **Không hardcode** secret, password, API key, đường dẫn tuyệt đối của máy cá nhân.
- Cấu hình nhạy cảm (SMTP thật) để ở `docker-compose.override.yml` — file này đã bị gitignore.

### 3.10. Django Admin

Mỗi model mới **phải** đăng ký vào `admin.py`. Rẻ tiền, nhưng cứu cả nhóm khi debug và demo.

```python
@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "academic_year", "credits")
    list_filter = ("academic_year",)
    search_fields = ("code", "name")
```

---

## 4. Frontend — Next.js + TypeScript

### 4.1. Component & page

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import api, { CaseListItem } from '@/lib/api';

const PAGE_SIZE = 10;

export default function HistoryPage() {
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get<CaseListItem[]>('/cases/')
      .then(r => { setCases(r.data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  // …
}
```

**Quy tắc:**
- Chỉ dùng **function component**, `export default` cho component chính của file.
- Có state/hook/event handler → **`'use client'` ở dòng đầu tiên**.
- Component phụ chỉ dùng trong 1 file (dưới ~30 dòng) được đặt cuối file đó — xem `NavBtn` trong
  `history/page.tsx`. Dùng chung ≥ 2 nơi → tách sang `src/components/`.
- Component dùng chung theo nhóm chức năng: `components/layout/`, `components/providers/`,
  `components/results/`. Module đào tạo tạo `components/training/`.
- Hằng số ánh xạ (nhãn trạng thái, class màu, cấu hình nav) đặt **ngoài component**, dạng
  `const STATUS_LABEL: Record<string, string> = {...}` — không tạo lại mỗi lần render.

### 4.2. Ba trạng thái bắt buộc

Mọi màn hình có gọi API **phải** xử lý đủ: `loading` · `error` · `empty`. Dùng
`app/(main)/history/page.tsx` làm mẫu chuẩn:

```tsx
{loading   ? <Spinner />
 : error   ? <ErrorState onRetry={...} />
 : items.length === 0 ? <EmptyState />
 : <RealContent />}
```

Thiếu một trong ba = màn hình trắng, người dùng không biết chuyện gì đang xảy ra → PR bị trả lại.

### 4.3. Gọi API

**Quy tắc:**
- **Luôn** `import api from '@/lib/api'`. Cấm `axios.get()` / `fetch()` trực tiếp trong component
  — instance chung lo `baseURL`, header `Bearer`, xử lý 401.
- Đường dẫn truyền vào `api` là **relative** (`/training/courses/`), không lặp lại `/api`.
- Type response tường minh: `api.get<Course[]>('/training/courses/')`.
- Không gọi thẳng `http://localhost:8002` — Next đã rewrite `/api/*` và `/media/*` sang backend
  (xem `next.config.mjs`); hardcode host sẽ vỡ khi deploy.
- Type dùng chung của API khai báo trong `@/lib/api` và **export**, để component canvas/bảng cùng
  dùng một định nghĩa (`Detection`, `Mask`, `CaseListItem`…).

### 4.4. State

- **Server state:** `useState` + `useEffect` + `api`. Dự án **không** dùng React Query.
- **Global state:** duy nhất `AuthProvider` (Context). Không thêm store toàn cục mới.
- Việc chạy nền (Celery) → **poll** bằng `setInterval` và **nhớ `clearInterval` trong cleanup**
  của `useEffect`. Không có WebSocket trong dự án.

### 4.5. Định tuyến & phân quyền

- App Router với route group: `(auth)` cho màn hình chưa đăng nhập, `(main)` cho màn hình có
  Sidebar/Topbar. Route group **không xuất hiện trong URL**.
- Chặn đăng nhập làm **ở layout** (`(main)/layout.tsx`), không phải middleware.
- Chặn theo role dùng `RoleGuard` (xem `docs/ONBOARDING.md` mục 10.6), không copy-paste
  `useEffect` kiểm tra role vào từng trang.
- Thêm route mới → cập nhật **cả hai**: `components/layout/Sidebar.tsx` (mục nav, lọc theo role)
  và `components/layout/Topbar.tsx` (hàm `getTitle`).
- Điều hướng nội bộ dùng `<Link href>`; điều hướng trong code dùng `useRouter().push()`.
  Dự án viết URL **có dấu `/` cuối** (`/analysis/new/`) — giữ nhất quán.

### 4.6. Styling

**Quy tắc:**
- Tailwind utility viết inline trên JSX. Không tạo file CSS riêng cho từng component.
- **Dùng token màu trong `tailwind.config.ts`**, không hardcode hex trong JSX:
  `primary`, `surface` / `surface.lowest` / `surface.low`, `mgi.0`–`mgi.4`.
  Cần màu mới → thêm vào config, không rải `#094cb2` khắp nơi.
- Icon: `<span className="material-symbols-outlined text-[18px]">school</span>`. Kích thước bằng
  arbitrary value `text-[Npx]` cho khớp text xung quanh.
- Bảng dữ liệu: bọc trong `overflow-x-auto` + `min-w-[...]` để không vỡ layout trên màn hình hẹp.
- Chữ số căn cột dùng `tabular-nums` (ngày tháng, điểm, id).
- PrimeReact chỉ dùng khi component thuần Tailwind quá tốn công (DataTable phức tạp, Calendar).
  Đã dùng thì đừng lai tạp nửa Prime nửa Tailwind trong cùng một khối UI.

### 4.7. TypeScript

- `strict: true` — **cấm `any`**. Không biết kiểu thì dùng `unknown` rồi narrow:

```tsx
catch (err: unknown) {
  const data = (err as { response?: { data?: { detail?: string } } })?.response?.data;
  setError(data?.detail ?? 'Đăng nhập thất bại. Vui lòng thử lại.');
}
```

- Union type cho tập giá trị hữu hạn: `type StatusFilter = 'all' | 'processing' | 'done' | 'failed';`
- Ép kiểu literal tuple bằng `as const` khi map sang UI:
  `(['all','processing','done'] as const).map(...)`.
- Import chỉ dùng làm type → `import type { Mask } from '@/lib/api';`

---

## 5. Thứ tự import

**Python** — nhóm cách nhau một dòng trống:

```python
import os                                   # 1. stdlib
import zipfile

from django.conf import settings            # 2. Django / thư viện ngoài
from rest_framework.views import APIView

from .models import Case, Image             # 3. nội bộ app (relative)
from .serializers import CaseListSerializer
```

**TypeScript** — nhóm cách nhau một dòng trống:

```tsx
import { useEffect, useState } from 'react';   // 1. react / next
import Link from 'next/link';

import api, { CaseListItem } from '@/lib/api'; // 2. nội bộ (alias @/)
import { useAuth } from '@/components/providers/AuthProvider';
```

Xoá import không dùng trước khi commit.

---

## 6. Kiểm thử

Repo hiện chưa có test — Phase 2 dựng khung ngay từ đầu (WBS 2.1.9*, 2.2.4*).

```ini
# web/backend/pytest.ini
[pytest]
DJANGO_SETTINGS_MODULE = config.settings
python_files = test_*.py
```

```bash
docker compose exec backend pytest apps/training -v
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
```

**Quy tắc:**
- Test đặt trong `apps/<app>/tests/test_<chủ_đề>.py`.
- Mỗi endpoint mới tối thiểu **2 test**: happy path + một case **bị từ chối quyền** (403).
- Nghiệp vụ có ràng buộc (tổng trọng số = 1, nộp sau deadline, trùng enrollment) phải có test
  cho nhánh bị từ chối.
- Không gọi service ngoài thật trong test (SMTP, Celery) — mock hoặc dùng `CELERY_TASK_ALWAYS_EAGER`.
- `npm run build` phải pass trước khi tạo PR (lỗi TypeScript chỉ lộ ra ở bước build).

---

## 7. Git & pull request

- Branch mặc định: **`develop`**. `main` là bản ổn định.
- Nhánh tính năng: `feature/<module>-<wbs>-<mô-tả>` — vd `feature/training-2.1.2-courses`.
  Sửa lỗi: `fix/<mô-tả>`.
- Commit message tiếng Anh, dạng `<type>: <mô tả>` — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`.
- **Không push thẳng lên `main` / `develop`**, không force push lên nhánh chung.
- PR phải: build pass · test pass · có migration kèm theo (nếu đổi model) · mô tả rõ WBS liên quan.
- Một PR = một đầu việc WBS. PR 2000 dòng trộn nhiều chức năng sẽ bị trả lại.

---

## 8. Chú ý

**Backend**
- Cấm view không khai báo `permission_classes` (mặc định toàn cục là `AllowAny`).
- Cấm `fields = "__all__"` trong serializer.
- Cấm nhận `created_by` / `graded_by` / `role` từ payload client.
- Cấm `except: pass` không kèm comment giải thích.
- Cấm SQL nối chuỗi — dùng ORM hoặc query có tham số.
- Cấm sửa/xoá migration đã merge.
- Cấm `print()` để debug trong code commit — dùng `logging` hoặc xoá.
- Cấm import thư viện nặng (torch, cv2) ở top-level module của backend.
- Cấm ghi đè dữ liệu gốc do người dùng/AI tạo (điểm, caption, bài nộp) mà không giữ lịch sử.

**Frontend**
- Cấm `any`.
- Cấm gọi `axios` / `fetch` trực tiếp thay vì `@/lib/api`.
- Cấm hardcode `http://localhost:8002` hay bất kỳ host backend nào.
- Cấm hardcode mã màu hex — dùng token Tailwind.
- Cấm để màn hình thiếu trạng thái loading/error/empty.
- Cấm `console.log` sót lại trong code commit.
- Cấm `setInterval` không `clearInterval` trong cleanup.

**Chung**
- Cấm hardcode secret, password, API key, đường dẫn tuyệt đối máy cá nhân.
- Cấm commit: `node_modules/`, `.next/`, `web/media/`, `*.pt`, `db.sqlite3`, `.env`,
  `docker-compose.override.yml`.
- Cấm sửa `.env` / cấu hình local của người khác.
- Cấm đưa dependency mới vào mà không thống nhất trong nhóm.
