from django.urls import re_path

from .views import DashboardView

urlpatterns = [
    re_path(r"^dashboard/?$", DashboardView.as_view(), name="dashboard"),
]