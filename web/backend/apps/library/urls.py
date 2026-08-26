from django.urls import re_path

from . import views

# APPEND_SLASH = False ⇒ mọi pattern phải chấp nhận cả hai dạng có/không dấu "/" cuối.
# Thứ tự quan trọng: "assets/uploads/..." phải đứng TRƯỚC "assets/(?P<pk>\d+)/" để
# "uploads" không bị hiểu nhầm là một khoá chính.
urlpatterns = [
    re_path(
        r"^library/categories/?$",
        views.CategoryListCreateView.as_view(), name="library-category-list",
    ),
    re_path(r"^library/assets/?$", views.AssetListView.as_view(), name="library-asset-list"),

    # ── Sao chép dữ liệu đã xử lý từ module nghiệp vụ ───────────────────────
    re_path(
        r"^library/imports/scans/(?P<scan_id>\d+)/?$",
        views.ScanSourceImportView.as_view(), name="library-import-scan",
    ),
    re_path(
        r"^library/imports/cases/(?P<case_id>\d+)/images/(?P<image_index>\d+)/?$",
        views.GingivitisSourceImportView.as_view(), name="library-import-gingivitis",
    ),

    # ── Chunked upload (3 bước) ───────────────────────────────────────────────
    re_path(
        r"^library/assets/uploads/?$",
        views.AssetUploadInitView.as_view(), name="library-upload-init",
    ),
    re_path(
        r"^library/assets/uploads/(?P<pk>\d+)/complete/?$",
        views.AssetUploadCompleteView.as_view(), name="library-upload-complete",
    ),
    re_path(
        r"^library/assets/uploads/(?P<pk>\d+)/(?P<index>\d+)/?$",
        views.AssetUploadChunkView.as_view(), name="library-upload-chunk",
    ),
    re_path(
        r"^library/assets/uploads/(?P<pk>\d+)/?$",
        views.AssetUploadStatusView.as_view(), name="library-upload-status",
    ),

    re_path(
        r"^library/assets/(?P<pk>\d+)/?$",
        views.AssetDetailView.as_view(), name="library-asset-detail",
    ),
    re_path(
        r"^library/assets/(?P<pk>\d+)/status/?$",
        views.AssetStatusView.as_view(), name="library-asset-status",
    ),
    re_path(
        r"^library/assets/(?P<pk>\d+)/preview/(?P<index>\d+)/?$",
        views.AssetPreviewView.as_view(), name="library-asset-preview",
    ),
    re_path(
        r"^library/assets/(?P<pk>\d+)/thumbnail/?$",
        views.AssetThumbnailView.as_view(), name="library-asset-thumbnail",
    ),
    re_path(
        r"^library/assets/(?P<pk>\d+)/download/?$",
        views.AssetDownloadView.as_view(), name="library-asset-download",
    ),
]
