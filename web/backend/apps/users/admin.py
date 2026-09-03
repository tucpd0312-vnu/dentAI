from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import EmailOTP, Notification, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (
        ("Role & Verification", {"fields": ("role", "phone", "email_verified")}),
    )
    list_display = BaseUserAdmin.list_display + ("role", "email_verified")
    list_filter = BaseUserAdmin.list_filter + ("role", "email_verified")


@admin.register(EmailOTP)
class EmailOTPAdmin(admin.ModelAdmin):
    list_display = ("user", "code", "purpose", "used", "created_at", "expires_at")
    list_filter = ("purpose", "used")
    readonly_fields = ("code", "created_at", "expires_at")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("recipient", "kind", "level", "title", "read_at", "created_at")
    list_filter = ("kind", "level", "read_at")
    search_fields = ("recipient__username", "recipient__email", "title", "message")
    readonly_fields = ("created_at",)
