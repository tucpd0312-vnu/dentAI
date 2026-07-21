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
