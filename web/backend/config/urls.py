from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.users.urls")),
    path("api/", include("apps.users.admin_urls")),
    path("api/", include("apps.dashboard.urls")),
    path("api/", include("apps.cases.urls")),
    path("api/", include("apps.scans.urls")),
    path("api/", include("apps.library.urls")),
    path("api/", include("apps.reception.urls")),
    path("api/settings", include("apps.settings_app.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
