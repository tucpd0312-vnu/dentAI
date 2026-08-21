# Quy tắc làm việc trên Git — dentAI

---

## 1. Nhánh

| Loại               | Format                           | Ví dụ                            | Rẽ từ     |
| ------------------ | -------------------------------- | -------------------------------- | --------- |
| Production         | `main`                           | —                                | —         |
| Tích hợp           | `develop`                        | —                                | —         |
| Tính năng          | `feature/<module>-<wbs>-<mô-tả>` | `feature/training-2.1.2-courses` | `develop` |
| Sửa lỗi            | `fix/<mô-tả>`                    | `fix/otp-expired-message`        | `develop` |
| Sửa gấp production | `hotfix/<mô-tả>`                 | `hotfix/login-500`               | `main`    |

**Quy tắc:**
- Tên nhánh **viết thường, không dấu**, dùng `-` ngăn cách từ.
- Nhánh Phase 2 **bắt buộc gắn mã WBS** (`training-2.1.2`) để đối chiếu với kế hoạch và biết ai đang
  làm gì — 4 người cùng làm trong một app `apps/training`, không gắn mã là loạn ngay.
- Một nhánh = **một đầu việc WBS**. Xong thì merge, không nuôi nhánh sống hàng tuần.
- **Không commit trực tiếp lên `develop` hay `main`.** Mọi thay đổi đi qua PR.
- **Không force push** lên `develop` / `main`, và không force push lên nhánh feature mà người khác
  đang cùng làm.
---

## 2. Commit message

```
<type>(<scope>): <mô tả>

[body tuỳ chọn]
```

| Type       | Dùng khi                                      |
| ---------- | --------------------------------------------- |
| `feat`     | Thêm tính năng mới                            |
| `fix`      | Sửa lỗi                                       |
| `docs`     | Sửa tài liệu (`README.md`, `rules/`, `docs/`) |
| `style`    | Format code, không đổi logic                  |
| `refactor` | Cấu trúc lại code, không thêm tính năng       |
| `test`     | Thêm/sửa test                                 |
| `chore`    | Dependency, Docker, cấu hình, `.gitignore`    |
| `perf`     | Cải thiện hiệu năng                           |
| `revert`   | Hoàn tác commit trước                         |

**Scope — theo đúng module trong repo:**

| Scope        | Tương ứng                                              |
| ------------ | ------------------------------------------------------ |
| `auth`       | `apps/users` — đăng nhập, JWT, OTP, phân quyền         |
| `cases`      | `apps/cases` — ca chẩn đoán, ảnh, box, caption         |
| `training`   | `apps/training` — module quản lý đào tạo (Phase 2)     |
| `settings`   | `apps/settings_app`                                    |
| `frontend`   | `web/frontend`                                         |
| `docker`     | `docker-compose.yml`, các `Dockerfile.*`, requirements |
| `inferences` | pipeline AI                                            |
| `docs`       | tài liệu                                               |

Ví dụ:

```
feat(training): thêm API năm học và môn học (WBS 2.1.2.1, 2.1.2.2)
feat(auth): mở rộng Role thêm giáo vụ, giảng viên, sinh viên
fix(training): chặn nộp bài sau deadline khi allow_late=false
refactor(training): tách views.py thành package theo nhóm chức năng
chore(docker): thêm pytest và pytest-django vào requirements.backend.txt
docs(rules): viết lại coding-rules cho stack Django + Next.js
```

**Quy tắc:**
- Mô tả viết **thường**, không chấm câu cuối, **tối đa 72 ký tự**, tiếng Việt hoặc tiếng Anh nhưng
  **thống nhất trong một PR**.
- Có mã WBS thì ghi vào cuối mô tả hoặc trong body — rất đỡ khi nghiệm thu Phase 2.
- Mỗi commit = **một thay đổi logic**. Đừng gộp "sửa lỗi + đổi format + thêm tính năng".
- Body giải thích **WHAT và WHY**, không giải thích HOW.
- Cấm commit message vô nghĩa: `update`, `fix bug`, `Update project files`, `abc`, `.`
  (repo đang có commit `Update project files` — không ai biết nó làm gì, đừng lặp lại).

---

## 3. Quy trình làm việc

### Bước 1 — Rẽ nhánh từ `develop`

```bash
cd dentAI
git checkout develop
git pull origin develop
git checkout -b feature/training-2.1.2-courses
```

### Bước 2 — Code và commit

```bash
git status                  # xem mình sắp commit cái gì
git diff                    # đọc lại thay đổi trước khi add
git add apps/training/       # hạn chế `git add .`
vd: git commit -m "feat(training): thêm model AcademicYear và Course (WBS 2.1.2)"
```

> Đổi model thì **migration phải nằm cùng commit** với model. Tách ra là người pull về sẽ gặp
> "table does not exist".

### Bước 3 — Đồng bộ với `develop` trước khi tạo PR

```bash
git fetch origin
git rebase origin/develop        # khi nhánh CHỈ MÌNH BẠN làm và chưa ai pull
# hoặc
git merge origin/develop         # khi nhánh đã push và người khác đang dùng
```

> Rebase viết lại lịch sử → chỉ rebase nhánh riêng của bạn. Nhánh đã chia sẻ thì dùng merge,
> tránh bắt người khác phải `git pull --force`.

### Bước 4 — Đẩy lên remote

```bash
git push -u origin feature/training-2.1.2-courses
```

### Bước 5 — Tạo Pull Request trên GitHub

- **Base = `develop`** (mặc định GitHub có thể chọn `main` — phải đổi lại).
- Tiêu đề theo convention: `feat(training): thêm API năm học và môn học`.
- Mô tả theo mẫu ở mục 6.

### Bước 6 — Review, merge, dọn nhánh

```bash
git checkout develop
git pull origin develop
git branch -d feature/training-2.1.2-courses      # xoá nhánh local
git push origin --delete feature/training-2.1.2-courses   # xoá nhánh remote
```

---

## 4. Xung đột hay gặp ở Phase 2 

### 4.1. File dùng chung
| File                                         | Sử dụng     | Cách giảm xung đột                                                                                                           |
| -------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `config/settings.py` (`INSTALLED_APPS`)      | mọi người   | Chỉ thêm **một dòng**, thêm ở **cuối** danh sách                                                                             |
| `config/urls.py`                             | mọi người   | Thêm ở cuối `urlpatterns`, giữ nguyên thứ tự cũ                                                                              |
| `apps/training/models.py`                    | mọi người   | Model nền do 2.0.1 định nghĩa trước; sau đó **tách thành package `models/`** nếu > ~300 dòng                                 |
| `apps/training/urls.py`                      | mọi người   | Nhóm theo chức năng, có comment phân cách; luôn **thêm cuối nhóm của mình**                                                  |
| `apps/training/views.py`                     | mọi người   | **Tách sớm** thành `views/catalog.py`, `views/grading.py`, `views/materials.py`, `views/submissions.py` — mỗi người một file |
| `components/layout/Sidebar.tsx` (mảng `NAV`) | mọi người   | Thêm một phần tử ở cuối mảng, không sắp xếp lại                                                                              |
| `components/layout/Topbar.tsx` (`getTitle`)  | mọi người   | Thêm một dòng `if` ở cuối                                                                                                    |
| `frontend/src/lib/api.ts` (type)             | mọi người   | Thêm type ở cuối file, không đụng type của người khác                                                                        |
| `requirements.backend.txt` / `package.json`  | ai thêm lib | Báo cả nhóm để mọi người rebuild image                                                                                       |

**Nguyên tắc chung:** với file dùng chung, **chỉ thêm vào cuối, không sắp xếp lại, không format lại
cả file**. Một lần "format lại cho đẹp" = xung đột với cả 3 người còn lại.

### 4.2. Khi bị conflict

```bash
git status                       # xem file nào conflict
# mở file, xử lý các dấu <<<<<<< ======= >>>>>>>
git add <file-đã-xử-lý>
git rebase --continue            # hoặc: git commit  (nếu đang merge)
```

- Resolve conflict **trên nhánh feature**, không bao giờ trên `develop`.
- Conflict ở phần code của người khác → **hỏi họ**, đừng đoán rồi xoá.
- Sau khi resolve: chạy lại `migrate` + `npm run build` rồi mới push.
- Rối quá thì `git rebase --abort` / `git merge --abort` để quay về trạng thái cũ, làm lại từ đầu.

---

## 5. Pull Request

**Mẫu mô tả PR:**

```markdown
## WBS
2.1.2.2 — Chức năng thêm môn học trong năm học

## Vấn đề
Giáo vụ chưa có cách tạo môn học gắn với năm học.

## Giải pháp
- Thêm model Course (FK academic_year) + migration 0003
- API GET/POST /api/training/courses/ — chỉ giáo vụ được POST
- Màn hình /training/courses với 3 trạng thái loading/error/empty

## Cách kiểm tra
1. docker compose up -d --build && manage.py migrate
2. Đăng nhập tài khoản role=academic_affairs
3. Vào /training/courses → tạo môn mới → F5 vẫn còn
4. Đăng nhập role=student → POST trả 403

## Checklist
- [x] migrate chạy sạch, makemigrations --check không còn thay đổi
- [x] Mọi view có permission_classes tường minh
- [x] npm run build pass
- [ ] Test — sẽ bổ sung ở PR 2.1.9
```

**Quy tắc:**
- **Base branch = `develop`.**
- PR **nhỏ và tập trung**: một mục tiêu, khuyến nghị **≤ 400 dòng thay đổi**. Repo từng phải tạo
  nhánh `revert-1-phineasupdate` để hoàn tác một PR lớn khó review — đừng lặp lại.
- Tiêu đề theo Conventional Commits.
- Có thay đổi giao diện → **đính screenshot**.
- Ít nhất **1 reviewer approve** mới merge. Reviewer đối chiếu với `coding-rules.md`, đặc biệt là
  `permission_classes` và validate nghiệp vụ.
- Tự resolve conflict trước, không đẩy việc cho người merge.
- **Không tự approve và tự merge PR của mình.**

---

## Checklist

**Trước mỗi commit:**

- [ ] `git status` — không có file lạ, file nhạy cảm, file rác
- [ ] `git diff --cached` — đọc lại đúng thứ mình định commit
- [ ] Commit message đúng convention, có scope
- [ ] Sửa model thì migration nằm cùng commit

**Trước khi tạo PR** (chưa có CI, phải tự chạy):

```bash
cd dentAI/web

docker compose exec backend python manage.py makemigrations --check --dry-run   # phải sạch
docker compose exec backend python manage.py migrate                            # chạy được
docker compose exec backend pytest apps/training -v    # khi đã dựng khung test (WBS 2.1.9)
docker compose exec frontend npm run lint
docker compose exec frontend npm run build             # lỗi TypeScript chỉ lộ ở bước này
```

- [ ] Các lệnh trên pass hết
- [ ] Đã `git fetch` + rebase/merge `develop`, không còn conflict
- [ ] Đã tự test tay luồng chính trên trình duyệt
- [ ] PR mô tả đầy đủ, có mã WBS, đã gán reviewer, base là `develop`

---

## Xử lý sự cố thường gặp

```bash
# Lỡ code trên develop, chưa commit → chuyển sang nhánh mới, giữ nguyên thay đổi
git checkout -b feature/training-2.1.2-courses

# Lỡ COMMIT vào develop, chưa push → mang commit sang nhánh mới
git branch feature/training-2.1.2-courses
git reset --hard origin/develop
git checkout feature/training-2.1.2-courses

# Sửa commit message vừa tạo (chưa push)
git commit --amend

# Bỏ commit cuối nhưng giữ code
git reset --soft HEAD~1

# Cất tạm việc đang làm để pull/đổi nhánh
git stash
git pull origin develop
git stash pop

# Xem ai sửa dòng này, vì sao
git log -p --follow apps/training/models.py
git blame apps/training/models.py

# Hoàn tác một commit đã push (an toàn — tạo commit ngược, không rewrite history)
git revert <commit-hash>

# Lấy lại nhánh sạch từ remote (MẤT thay đổi local chưa commit)
git fetch origin && git reset --hard origin/develop
```