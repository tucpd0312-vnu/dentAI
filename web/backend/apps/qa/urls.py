from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import QASessionViewSet

router = DefaultRouter()
router.register(r"qa/sessions", QASessionViewSet, basename="qa-session")

urlpatterns = [
    path("", include(router.urls)),
]
