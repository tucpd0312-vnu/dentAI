from django.urls import path
from . import views

urlpatterns = [
    # Cases
    path("cases", views.CaseListCreateView.as_view(), name="case-list-create"),
    path("cases/<int:case_id>/status", views.CaseStatusView.as_view(), name="case-status"),
    path("cases/<int:case_id>/export", views.CaseExportView.as_view(), name="case-export"),

    # Images inside a case
    path("cases/<int:case_id>/images/<int:image_index>", views.ImageDetailView.as_view(), name="image-detail"),
    path("cases/<int:case_id>/images/<int:image_index>/export", views.ImageExportView.as_view(), name="image-export"),

    # Detections
    path("cases/<int:case_id>/images/<int:image_index>/detections", views.DetectionCreateView.as_view(), name="detection-create"),
    path("detections/<int:pk>", views.DetectionUpdateView.as_view(), name="detection-update"),
]
