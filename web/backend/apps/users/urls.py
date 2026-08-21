from django.urls import path, re_path
from . import views

urlpatterns = [
    re_path(r"^register/?$", views.RegisterView.as_view(), name="auth-register"),
    re_path(r"^verify-otp/?$", views.VerifyOTPView.as_view(), name="auth-verify-otp"),
    re_path(r"^resend-otp/?$", views.ResendOTPView.as_view(), name="auth-resend-otp"),
    re_path(r"^login/?$", views.LoginView.as_view(), name="auth-login"),
    re_path(r"^refresh/?$", views.RefreshView.as_view(), name="auth-refresh"),
    re_path(r"^logout/?$", views.LogoutView.as_view(), name="auth-logout"),
    re_path(r"^me/?$", views.MeView.as_view(), name="auth-me"),
    re_path(r"^change-password/?$", views.ChangePasswordView.as_view(), name="auth-change-password"),
]