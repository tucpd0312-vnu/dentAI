import os

from django.conf import settings


def local_media_path(stored: str) -> str:
    """Resolve a stored filesystem path to this process's MEDIA_ROOT.

    The Django backend runs in Docker (MEDIA_ROOT=/app/media) while the Celery
    worker runs on the host (MEDIA_ROOT=<repo>/web/media). Both point at the
    same physical directory through the docker-compose volume mount, but the
    absolute prefix differs. Paths are stored in the DB by whichever process
    created the file, so any reader must re-anchor the path against its own
    MEDIA_ROOT by matching the shared ``/media/`` segment.
    """
    if not stored:
        return stored
    if os.path.exists(stored):
        return stored
    norm = stored.replace("\\", "/")
    marker = "/media/"
    idx = norm.rfind(marker)
    if idx != -1:
        rel = norm[idx + len(marker):]
        return os.path.join(settings.MEDIA_ROOT, *rel.split("/"))
    return stored


def library_save_options(img):
    """Availability is based on the readable original and current annotations,
    rather than an absolute path left by another process's AI output.
    """
    from PIL import Image as PILImage
    ready = img.status in ("done", "low_confidence")
    readable = False
    path = local_media_path(img.original_path)
    if ready and path and os.path.isfile(path):
        try:
            with PILImage.open(path) as source:
                source.verify()
            readable = True
        except (OSError, ValueError, PILImage.DecompressionBombError):
            pass
    annotated = readable and (
        not img.is_low_confidence or img.detections.filter(is_deleted=False).exists()
        or img.masks.exists()
    )
    reason = ("" if annotated else "Ảnh gốc bị thiếu hoặc không đọc được." if ready and not readable
              else "Ảnh chưa có chú thích hợp lệ để lưu." if ready else "Ảnh chưa xử lý xong.")
    return {"original": readable, "annotated": bool(annotated), "reason": reason}
