import re
from rest_framework import serializers
from django.contrib.auth import authenticate
from django.core.validators import validate_email
from .models import User, EmailOTP


def _validate_password(value):
    if len(value) < 8:
        raise serializers.ValidationError("Mật khẩu phải có ít nhất 8 ký tự.")
    if not re.search(r'[A-Z]', value):
        raise serializers.ValidationError("Mật khẩu phải chứa ít nhất 1 chữ hoa.")
    if not re.search(r'[a-z]', value):
        raise serializers.ValidationError("Mật khẩu phải chứa ít nhất 1 chữ thường.")
    if not re.search(r'[0-9]', value):
        raise serializers.ValidationError("Mật khẩu phải chứa ít nhất 1 chữ số.")


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8, validators=[_validate_password])
    confirm_password = serializers.CharField(write_only=True)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Tên đăng nhập đã được sử dụng.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email đã được sử dụng.")
        return value

    def validate(self, data):
        if data["password"] != data["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Mật khẩu xác nhận không khớp."})
        return data

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        password = validated_data.pop("password")
        user = User.objects.create_user(
            **validated_data,
            is_active=False,
        )
        user.set_password(password)
        user.save(update_fields=["password"])
        return user


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        user = authenticate(username=data["username"], password=data["password"])
        if not user:
            raise serializers.ValidationError("Tên đăng nhập hoặc mật khẩu không đúng.")
        if not user.is_active:
            raise serializers.ValidationError("Tài khoản chưa được kích hoạt. Vui lòng xác thực email.")
        data["user"] = user
        return data


class VerifyOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6, min_length=6)


class ResendOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "role", "phone", "email_verified", "is_active",
            "date_joined", "last_login",
        ]
        read_only_fields = ["id", "email_verified", "date_joined", "last_login"]


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8, validators=[_validate_password])

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Mật khẩu hiện tại không đúng.")
        return value