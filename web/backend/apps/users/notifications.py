"""Tạo thông báo mà không để lỗi phụ làm hỏng nghiệp vụ chính."""
import logging

logger = logging.getLogger(__name__)


def notify_user(recipient, *, kind, title, message="", link="", level="info"):
    """Tạo một thông báo cho tài khoản đang hoạt động; lỗi được ghi log và bỏ qua."""
    if not recipient or not getattr(recipient, "is_active", False):
        return None
    if getattr(recipient, "is_deleted", False):
        return None
    try:
        from .models import Notification

        return Notification.objects.create(
            recipient=recipient,
            kind=kind,
            level=level,
            title=str(title)[:160],
            message=str(message)[:500],
            link=str(link)[:500],
        )
    except Exception:  # noqa: BLE001 — thông báo hỏng không được làm hỏng nghiệp vụ
        logger.exception("Không tạo được thông báo cho user_id=%s", recipient.pk)
        return None


def notify_users(recipients, **kwargs):
    """Tạo cùng một thông báo cho nhiều tài khoản, loại bản ghi trùng ID."""
    seen = set()
    created = []
    for recipient in recipients:
        if not recipient or recipient.pk in seen:
            continue
        seen.add(recipient.pk)
        item = notify_user(recipient, **kwargs)
        if item is not None:
            created.append(item)
    return created
