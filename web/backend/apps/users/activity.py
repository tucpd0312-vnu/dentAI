"""Helper ghi ActivityLog — dùng cho cả audit quản trị lẫn lịch sử hệ thống.

Nguyên tắc bất di bất dịch: **ghi log KHÔNG BAO GIỜ được làm hỏng nghiệp vụ chính.**
Mọi exception đều bị nuốt và chỉ đẩy sang logger của Django.

Dùng từ Celery worker được, nhưng khi đó KHÔNG có `request` — truyền `actor=None`
hoặc user object lấy từ DB.

    from apps.users.activity import log_activity
    from apps.users.models import LogCategory, LogAction

    log_activity(LogCategory.ADMIN, LogAction.USER_LOCK,
                 actor=request.user, request=request, target_user=victim,
                 detail={"before": {...}, "after": {...}})
"""
import logging

logger = logging.getLogger(__name__)

# Suy `module` mặc định từ `action` khi caller không tự truyền — nhờ đó MỌI chỗ gọi
# log_activity() hiện có trong apps.cases (case_create, labels_edited, ...) tự động ghi
# đúng module="gingivitis" mà không cần sửa lại từng call site.
#
# Cố ý định nghĩa TĨNH bằng tập tên action, không suy theo tiền tố chuỗi: action như
# `task_error` dùng chung cho nhiều module (pipeline viêm lợi lẫn tác vụ nền của
# apps.scans) nên không thể đoán đúng chỉ bằng tên. Nơi nào action dùng chung mà cần
# module khác mặc định PHẢI tự truyền `module=` khi gọi log_activity().
_GINGIVITIS_ACTIONS = frozenset({
    "case_create", "case_done", "case_failed", "labels_edited",
    "case_export", "case_share", "case_unshare", "pipeline_error",
})
_CANINE3D_ACTIONS = frozenset({
    "scan_upload", "scan_open_requested", "scan_downloaded",
    "scan_delete", "segmentation_upload",
})


def _default_module(action) -> str:
    from .models import LogModule

    action = str(action)
    if action in _GINGIVITIS_ACTIONS:
        return LogModule.GINGIVITIS
    if action in _CANINE3D_ACTIONS:
        return LogModule.CANINE3D
    return LogModule.SYSTEM


def get_client_ip(request):
    """IP thật của client, ưu tiên X-Forwarded-For (khi chạy sau reverse proxy)."""
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or None


def log_activity(
    category,
    action,
    *,
    actor=None,
    request=None,
    target_user=None,
    target_case=None,
    target_scan=None,
    module=None,
    detail=None,
):
    """Ghi một bản ghi ActivityLog. Không raise trong bất kỳ trường hợp nào."""
    try:
        from .models import ActivityLog

        # Suy ra actor từ request nếu không truyền tường minh.
        if actor is None and request is not None:
            candidate = getattr(request, "user", None)
            if candidate is not None and getattr(candidate, "is_authenticated", False):
                actor = candidate

        if actor is not None:
            actor_label = getattr(actor, "username", "") or str(actor)
        elif request is not None:
            actor_label = "anonymous"
        else:
            actor_label = "system"

        ActivityLog.objects.create(
            category=category,
            action=action,
            module=module or _default_module(action),
            actor=actor,
            actor_label=actor_label[:150],
            target_user=target_user,
            target_case=target_case,
            target_scan=target_scan,
            detail=detail or {},
            ip_address=get_client_ip(request),
            user_agent=(request.META.get("HTTP_USER_AGENT", "")[:300] if request else ""),
        )
    except Exception:  # noqa: BLE001 — log hỏng không được làm hỏng request
        logger.exception("Không ghi được ActivityLog (%s/%s)", category, action)


def diff_fields(before: dict, after: dict) -> dict:
    """Chỉ giữ các field thực sự đổi — tránh phình `detail` với dữ liệu vô nghĩa."""
    changed = {k: v for k, v in after.items() if before.get(k) != v}
    return {
        "before": {k: before.get(k) for k in changed},
        "after": changed,
    }