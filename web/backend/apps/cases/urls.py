from django.urls import re_path
from . import share_views, views

urlpatterns = [
    # `cases/shared-with-me` phải đứng TRƯỚC `cases/(?P<case_id>\d+)/...` để không
    # bị pattern khác nuốt mất.
    re_path(r"^cases/shared-with-me/?$", share_views.SharedWithMeView.as_view(),
            name="cases-shared-with-me"),
    re_path(r"^cases/?$", views.CaseListCreateView.as_view(), name="case-list-create"),
    re_path(r"^cases/(?P<case_id>\d+)/shares/?$",
            share_views.CaseShareListCreateView.as_view(), name="case-share-list"),
    re_path(r"^shares/(?P<share_id>\d+)/?$",
            share_views.CaseShareDetailView.as_view(), name="case-share-detail"),
    re_path(r"^cases/(?P<case_id>\d+)/status/?$", views.CaseStatusView.as_view(), name="case-status"),
    re_path(r"^cases/(?P<case_id>\d+)/export/?$", views.CaseExportView.as_view(), name="case-export"),
    re_path(r"^cases/(?P<case_id>\d+)/images/(?P<image_index>\d+)/?$", views.ImageDetailView.as_view(), name="image-detail"),
    re_path(r"^cases/(?P<case_id>\d+)/images/(?P<image_index>\d+)/export/?$", views.ImageExportView.as_view(), name="image-export"),
    re_path(r"^cases/(?P<case_id>\d+)/images/(?P<image_index>\d+)/detections/?$", views.DetectionCreateView.as_view(), name="detection-create"),
    re_path(r"^detections/(?P<pk>\d+)/?$", views.DetectionUpdateView.as_view(), name="detection-update"),
]