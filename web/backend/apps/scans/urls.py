from django.urls import re_path

from . import share_views, views

urlpatterns = [
    re_path(
        r"^downloads/slicer-bridge/?$", views.SlicerBridgeDownloadView.as_view(),
        name="slicer-bridge-download",
    ),
    # "download/{token}" phải đứng TRƯỚC pattern `(?P<pk>\d+)` cho rõ ý định — token
    # không phải số nên không thực sự đụng nhau, nhưng giữ đúng quy ước cases/urls.py.
    re_path(
        r"^scans/download/(?P<token>[A-Za-z0-9_-]+)/?$",
        views.ScanDownloadView.as_view(), name="scan-download",
    ),
    re_path(r"^scans/?$", views.ScanListView.as_view(), name="scan-list"),
    re_path(r"^scans/from-library/?$", views.ScanFromLibraryView.as_view(), name="scan-from-library"),
    re_path(
        r"^scans/shared-with-me/?$", share_views.ScansSharedWithMeView.as_view(),
        name="scans-shared-with-me",
    ),
    # ── Chunked upload (§4.2) ──────────────────────────────────────────────────
    re_path(
        r"^scans/uploads/?$", views.ScanUploadInitView.as_view(), name="scan-upload-init",
    ),
    re_path(
        r"^scans/uploads/(?P<pk>\d+)/complete/?$",
        views.ScanUploadCompleteView.as_view(), name="scan-upload-complete",
    ),
    re_path(
        r"^scans/uploads/(?P<pk>\d+)/(?P<index>\d+)/?$",
        views.ScanUploadChunkView.as_view(), name="scan-upload-chunk",
    ),
    re_path(
        r"^scans/uploads/(?P<pk>\d+)/?$",
        views.ScanUploadStatusView.as_view(), name="scan-upload-status",
    ),
    re_path(r"^scans/(?P<pk>\d+)/?$", views.ScanDetailView.as_view(), name="scan-detail"),
    re_path(
        r"^scans/(?P<scan_id>\d+)/shares/?$",
        share_views.ScanShareListCreateView.as_view(), name="scan-share-list",
    ),
    re_path(
        r"^scan-shares/(?P<share_id>\d+)/?$",
        share_views.ScanShareDetailView.as_view(), name="scan-share-detail",
    ),
    re_path(r"^scans/(?P<pk>\d+)/status/?$", views.ScanStatusView.as_view(), name="scan-status"),
    re_path(
        r"^scans/(?P<pk>\d+)/preview/(?P<index>\d+)/?$",
        views.ScanPreviewView.as_view(), name="scan-preview",
    ),
    re_path(
        r"^scans/(?P<pk>\d+)/open-token/?$",
        views.ScanOpenTokenView.as_view(), name="scan-open-token",
    ),
    re_path(
        r"^scans/(?P<pk>\d+)/segmentations/?$",
        views.ScanSegmentationListCreateView.as_view(), name="scan-segmentation-list",
    ),
    re_path(
        r"^segmentations/(?P<pk>\d+)/file/?$",
        views.SegmentationFileView.as_view(), name="segmentation-file",
    ),
    re_path(
        r"^scans/(?P<pk>\d+)/logs/?$",
        views.ScanActivityLogView.as_view(), name="scan-logs",
    ),
]
