"""Routes quản trị — mount tại `/api/` (xem config/urls.py).

Tách khỏi `urls.py` (mount tại `/api/auth/`) vì đây không phải endpoint xác thực.
`search/` phải đứng TRƯỚC `<int:pk>/` — nếu không Django sẽ không bao giờ khớp tới nó.
"""
from django.urls import path, re_path

from . import admin_views

urlpatterns = [
    re_path(r"^users/search/?$", admin_views.UserSearchView.as_view(), name="user-search"),
    re_path(r"^users/?$", admin_views.UserListCreateView.as_view(), name="user-list"),
    path("users/<int:pk>/restore/", admin_views.UserRestoreView.as_view(), name="user-restore"),
    path("users/<int:pk>/restore", admin_views.UserRestoreView.as_view()),
    path("users/<int:pk>/", admin_views.UserDetailView.as_view(), name="user-detail"),
    path("users/<int:pk>", admin_views.UserDetailView.as_view()),
    re_path(r"^role-requests/?$", admin_views.RoleRequestListView.as_view(),
            name="role-request-list"),
    re_path(r"^role-requests/(?P<pk>\d+)/(?P<action>approve|reject)/?$",
            admin_views.RoleRequestReviewView.as_view(), name="role-request-review"),
    re_path(r"^activity-logs/summary/?$", admin_views.ActivityLogSummaryView.as_view(),
            name="activity-log-summary"),
    re_path(r"^activity-logs/?$", admin_views.ActivityLogListView.as_view(),
            name="activity-log-list"),
]