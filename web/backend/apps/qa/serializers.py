from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import QAMessage, QASession, QASessionShare

User = get_user_model()


class UserMiniSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "full_name", "role"]


class QAMessageSerializer(serializers.ModelSerializer):
    sender = UserMiniSerializer(read_only=True)

    class Meta:
        model = QAMessage
        fields = [
            "id",
            "session",
            "sender",
            "content",
            "bounding_box",
            "box_comment",
            "created_at",
        ]
        read_only_fields = ["id", "session", "sender", "created_at"]


class QASessionShareSerializer(serializers.ModelSerializer):
    shared_with = UserMiniSerializer(read_only=True)
    shared_by = UserMiniSerializer(read_only=True)
    shared_with_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True, is_deleted=False),
        source="shared_with",
        write_only=True,
    )

    class Meta:
        model = QASessionShare
        fields = [
            "id",
            "session",
            "shared_with",
            "shared_with_id",
            "shared_by",
            "can_reply",
            "created_at",
        ]
        read_only_fields = ["id", "session", "shared_with", "shared_by", "created_at"]


class QASessionListSerializer(serializers.ModelSerializer):
    created_by = UserMiniSerializer(read_only=True)
    messages_count = serializers.IntegerField(source="messages.count", read_only=True)
    latest_message = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()
    shared_with_count = serializers.IntegerField(source="shares.count", read_only=True)

    class Meta:
        model = QASession
        fields = [
            "id",
            "title",
            "created_by",
            "case",
            "image",
            "image_url",
            "status",
            "created_at",
            "updated_at",
            "messages_count",
            "latest_message",
            "is_owner",
            "shared_with_count",
        ]

    def get_latest_message(self, obj):
        latest = obj.messages.order_by("-created_at").first()
        if not latest:
            return None
        return {
            "content": latest.content[:100],
            "sender_name": latest.sender.get_full_name() or latest.sender.username,
            "sender_role": latest.sender.role,
            "created_at": latest.created_at,
            "has_box": bool(latest.bounding_box),
        }

    def get_is_owner(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.created_by_id == request.user.id


class QASessionDetailSerializer(serializers.ModelSerializer):
    created_by = UserMiniSerializer(read_only=True)
    messages = QAMessageSerializer(many=True, read_only=True)
    shares = QASessionShareSerializer(many=True, read_only=True)
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = QASession
        fields = [
            "id",
            "title",
            "created_by",
            "case",
            "image",
            "image_url",
            "status",
            "created_at",
            "updated_at",
            "messages",
            "shares",
            "is_owner",
        ]

    def get_is_owner(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.created_by_id == request.user.id
