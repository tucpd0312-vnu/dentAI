from django.urls import re_path

from .views import AssignmentWorkbookUploadView, LatestAssignmentWorkbookView


urlpatterns = [
    re_path(
        r"^reception/assignments/?$",
        AssignmentWorkbookUploadView.as_view(),
        name="reception-assignment-upload",
    ),
    re_path(
        r"^reception/assignments/latest/?$",
        LatestAssignmentWorkbookView.as_view(),
        name="reception-assignment-latest",
    ),
]
