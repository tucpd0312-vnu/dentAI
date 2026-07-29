from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, EmailOTP


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