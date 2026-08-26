"""API tổng quan — một endpoint duy nhất trả mọi số liệu cho trang `/dashboard`.

Gộp một request thay vì nhiều để trang không phải chờ nhiều vòng mạng.

MỌI số liệu về ca đều đi qua `scoped_cases()`: bác sĩ/bệnh nhân chỉ thấy thống kê
của ca mình (+ ca được chia sẻ), admin thấy toàn hệ thống. Khối `users` và
`activity` chỉ có trong response của admin.
"""
from datetime import timedelta

from django.db.models import Count
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.access import scoped_cases
from apps.cases.models import Case, Detection, Image
from apps.cases.serializers import CaseListSerializer
from apps.library.access import scoped_assets
from apps.library.models import DataAsset
from apps.scans.access import scoped_scans
from apps.scans.models import Scan
from apps.users.models import ActivityLog, LogCategory, Role, RoleRequest, User
from apps.users.permissions import IsActiveUser

RECENT_CASES = 5


def _counts(qs, field, choices):
    """Đếm theo enum, đảm bảo mọi giá trị đều xuất hiện (kể cả 0)."""
    rows = qs.values(field).annotate(n=Count("id"))
    out = {c: 0 for c in choices}
    out.update({r[field]: r["n"] for r in rows})
    return out


class DashboardView(APIView):
    permission_classes = [IsActiveUser]

    def get(self, request):
        user = request.user
        is_admin = user.role == Role.ADMIN
        cases = scoped_cases(user)
        scans = scoped_scans(user)
        assets = scoped_assets(user)

        images = Image.objects.filter(case__in=cases)
        recent = cases.order_by("-created_at")[:RECENT_CASES]

        data = {
            "scope": "all" if is_admin else "own",
            "cases": {
                "total": cases.count(),
                "by_status": _counts(cases, "status", Case.Status.values),
                "images_total": images.count(),
                "low_confidence": images.filter(is_low_confidence=True).count(),
                "shared_with_me": Case.objects.filter(shares__shared_with=user).distinct().count(),
                "recent": CaseListSerializer(
                    recent, many=True, context={"request": request}
                ).data,
            },
            "mgi": self._mgi_distribution(cases),
            "scans": {
                "total": scans.count(),
                "by_status": _counts(scans, "status", Scan.Status.values),
                "shared_with_me": Scan.objects.filter(
                    is_deleted=False, shares__shared_with=user
                ).distinct().count(),
            },
            "library": {
                "total": assets.count(),
                "by_status": _counts(assets, "status", DataAsset.Status.values),
                "shared_with_me": DataAsset.objects.filter(
                    is_deleted=False, shares__shared_with=user
                ).distinct().count(),
            },
        }

        if is_admin:
            data["users"] = self._user_stats()
            data["activity"] = self._activity_stats()

        return Response(data)

    def _mgi_distribution(self, cases):
        """Phân bố MGI 0–4 trên các box còn hiệu lực (đã loại box bác sĩ xoá)."""
        rows = (
            Detection.objects.filter(image__case__in=cases, is_deleted=False)
            .values("mgi_level")
            .annotate(n=Count("id"))
        )
        dist = {str(lvl): 0 for lvl in range(5)}
        for r in rows:
            dist[str(r["mgi_level"])] = r["n"]
        return dist

    def _user_stats(self):
        week_ago = timezone.now() - timedelta(days=7)
        alive = User.objects.filter(is_deleted=False)
        return {
            "total": alive.count(),
            "by_role": _counts(alive, "role", Role.values),
            "unverified": alive.filter(email_verified=False).count(),
            "locked": alive.filter(is_active=False).count(),
            "deleted": User.objects.filter(is_deleted=True).count(),
            "new_7d": alive.filter(date_joined__gte=week_ago).count(),
            "pending_role_requests": RoleRequest.actionable_count(),
        }

    def _activity_stats(self):
        week_ago = timezone.now() - timedelta(days=7)
        rows = (
            ActivityLog.objects.filter(created_at__gte=week_ago)
            .values("category")
            .annotate(n=Count("id"))
        )
        by_cat = {c: 0 for c in LogCategory.values}
        by_cat.update({r["category"]: r["n"] for r in rows})
        return {"last_7d_by_category": by_cat}
