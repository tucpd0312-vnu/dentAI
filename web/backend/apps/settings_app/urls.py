from django.urls import re_path
from .views import SettingsView

urlpatterns = [
    re_path(r"^/?$", SettingsView.as_view(), name="settings"),
]