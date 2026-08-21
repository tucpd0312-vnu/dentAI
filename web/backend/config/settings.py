import os
import dj_database_url
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

TIME_ZONE = "Asia/Ho_Chi_Minh"
USE_TZ = True

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure-key")
DEBUG = os.environ.get("DEBUG", "1") == "1"
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "*").split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "apps.users",
    "apps.cases",
    "apps.settings_app",
    "apps.dashboard",
    "apps.scans",
]

AUTH_USER_MODEL = "users.User"

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# ── Database ─────────────────────────────────────────────────────────────────
DATABASES = {
    "default": dj_database_url.config(
        default=os.environ.get("DATABASE_URL", "sqlite:///db.sqlite3"),
        conn_max_age=600,
    )
}

# ── Media files ───────────────────────────────────────────────────────────────
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", str(BASE_DIR / "media"))
MEDIA_URL = os.environ.get("MEDIA_URL", "/media/")

# ── Scans (CBCT / răng nanh ngầm 3D) ────────────────────────────────────────────
# CỐ Ý nằm NGOÀI MEDIA_ROOT (thư mục anh em, không lồng bên trong) — config/urls.py
# serve MEDIA_ROOT qua static() không kiểm quyền gì cả; mọi byte của phim CBCT chỉ
# được ra ngoài qua view có kiểm quyền. Xem PLAN_3D_CANINE.md §4.1.
SCANS_ROOT = os.environ.get("SCANS_ROOT", str(BASE_DIR / "scans_storage"))

# Địa chỉ backend "nhìn từ desktop bác sĩ" — dùng để build open_url
# (dentai://open?token=...&server=...) cho 3D Slicer gọi thẳng `download/{token}/`,
# KHÔNG đi qua trình duyệt/Next.js proxy. CỐ Ý không suy từ request.build_absolute_uri():
# khi request tới qua Next.js rewrite, Host header là "backend:8000" (tên nội bộ mạng
# Docker) — Slicer chạy trên desktop không resolve được tên đó. Đặt tường minh, khớp
# cổng host-expose thật của service backend trong docker-compose.yml (8002).
SCANS_PUBLIC_BASE_URL = os.environ.get("SCANS_PUBLIC_BASE_URL", "http://localhost:8002")

# Chunked upload (§4.2) — dưới xa ngưỡng 100MB/request cứng của Cloudflare Tunnel
# (dentai.datasphere.id.vn), còn nhiều dư địa nếu hạ tầng đổi.
SCANS_UPLOAD_CHUNK_SIZE = int(os.environ.get("SCANS_UPLOAD_CHUNK_SIZE", 20 * 1024 * 1024))
# ScanUploadChunkView đọc request.body thô (không multipart) — Django chặn DATA_UPLOAD_
# MAX_MEMORY_SIZE (mặc định 2.5MB) TRƯỚC khi vào view, phải nới theo đúng chunk size.
DATA_UPLOAD_MAX_MEMORY_SIZE = max(2621440, SCANS_UPLOAD_CHUNK_SIZE + 1024 * 1024)

STATIC_URL = "/static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# ── DRF ───────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    # KHÔNG đặt DEFAULT_PAGINATION_CLASS ở đây — GET /api/cases/ đang trả mảng phẳng
    # và trang History phụ thuộc vào shape đó. Pagination chỉ gắn ở view-level
    # (/api/users/, /api/activity-logs/).
}

# ── JWT ────────────────────────────────────────────────────────────────────────
# Phiên làm việc 1 giờ. Access và refresh CÙNG 1h + rotate ⇒ cửa sổ trượt:
# frontend gọi /auth/refresh/ khi người dùng còn tương tác nên phiên kéo dài liên
# tục; không hoạt động quá 1h thì cả hai token đều chết ở server. Đây là lớp phòng
# thủ thứ hai — lớp thứ nhất là idle timer ở frontend (src/lib/session.ts).
from datetime import timedelta

SESSION_IDLE_LIMIT = timedelta(hours=1)

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": SESSION_IDLE_LIMIT,
    "REFRESH_TOKEN_LIFETIME": SESSION_IDLE_LIMIT,
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
}

# ── Celery ────────────────────────────────────────────────────────────────────
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_TRACK_STARTED = True
# apps.scans dùng queue "scans" riêng, KHÔNG chung "inference": xử lý ZIP CBCT
# (giải nén/đọc header/sinh preview) là việc CPU-thuần, không cần GPU, nên không nên
# xếp hàng sau các job YOLO/T5 nặng — và ngược lại. Worker service hiện chỉ nghe
# "inference" (`-Q inference`, profile worker-docker, cần GPU); "scans" CHƯA có
# consumer nào ở dev — nối dây worker CPU tiêu thụ queue này là việc hạ tầng của
# bước sau (không chặn việc test logic task qua .run() đồng bộ).
CELERY_TASK_ROUTES = {
    "apps.cases.tasks.*": {"queue": "inference"},
    "apps.scans.tasks.*": {"queue": "scans"},
}

# ── AI pipeline paths ─────────────────────────
INFERENCES_DIR = os.environ.get("INFERENCES_DIR", "/inferences")
YOLOV9_DIR = os.environ.get("YOLOV9_DIR", "/yolov9")
INFERENCE_DEVICE = os.environ.get("INFERENCE_DEVICE", "cpu")

# ── Email (SMTP) ────────────────────────────────
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.environ.get("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "True").lower() in ("1", "true", "yes")
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "noreply@dentai.local")

APPEND_SLASH = False
