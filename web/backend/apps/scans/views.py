import hashlib
import io
import math
import os
import secrets
import shutil
import zipfile
from datetime import timedelta
from urllib.parse import urlencode
from uuid import uuid4

from django.conf import settings
from django.db import transaction
from django.db.models import Max
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.models import Patient
from apps.users.activity import get_client_ip, log_activity
from apps.users.admin_serializers import ActivityLogSerializer
from apps.users.models import ActivityLog, LogAction, LogCategory
from apps.users.permissions import IsActiveUser, IsAdminOrDoctor

from .access import can_contribute_scan, can_manage_scan, scoped_scans
from .models import Scan, ScanAccessToken, Segmentation
from .serializers import (
    ScanDetailSerializer,
    ScanListSerializer,
    ScanUploadInitSerializer,
    SegmentationSerializer,
    SegmentationUploadSerializer,
)
from .tasks import process_scan_upload

OPEN_TOKEN_TTL = timedelta(minutes=5)


def _chunks_dir(scan_id) -> str:
    return os.path.join(settings.SCANS_ROOT, str(scan_id), "chunks")


def _get_uploading_scan(request, pk):
    """Phim của MÌNH (hoặc admin) đang ở phiên upload — 404 ngoài phạm vi, cùng quy
    ước 404-thay-403 toàn dự án; KHÔNG lọc theo `is_deleted` qua `scoped_scans()` vì
    phim đang upload luôn chưa từng bị xoá."""
    scan = get_object_or_404(Scan.objects.select_related("patient"), pk=pk)
    if not can_manage_scan(request.user, scan):
        raise Http404
    return scan


class ScanPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class SlicerBridgeDownloadView(APIView):
    """Đóng gói bridge từ nguồn hiện hành để trang web luôn tải đúng phiên bản.

    Danh sách file cố định, không nhận đường dẫn từ request nên không có traversal.
    Gói này không chứa dữ liệu y tế và có thể tải trước khi đăng nhập.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    FILES = (
        "README.md",
        "open_scan.py",
        "install_windows.ps1",
        "install_linux.sh",
        "install_macos.sh",
    )

    def get(self, request):
        root = settings.SLICER_BRIDGE_ROOT
        paths = [(name, os.path.join(root, name)) for name in self.FILES]
        if any(not os.path.isfile(path) for _, path in paths):
            return Response(
                {"detail": "Gói DentAI Slicer Bridge chưa được cấu hình trên server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            for name, path in paths:
                bundle.write(path, arcname=f"dentai-slicer-bridge/{name}")
        archive.seek(0)
        return FileResponse(
            archive,
            as_attachment=True,
            filename="dentai-slicer-bridge.zip",
            content_type="application/zip",
        )


class ScanListView(APIView):
    # "admin|doctor" — KHÔNG dùng IsActiveUser: bệnh nhân không có khái niệm "phim của
    # tôi" ở module này (khác apps.cases, nơi patient có danh sách ca hợp lệ của mình),
    # nên chặn thẳng ở permission thay vì để lọt qua rồi trả mảng rỗng.
    permission_classes = [IsAdminOrDoctor]

    def get(self, request):
        qs = scoped_scans(request.user).order_by("-created_at")

        q = (request.query_params.get("q") or "").strip()
        if q:
            from django.db.models import Q
            qs = qs.filter(
                Q(patient__name__icontains=q) | Q(patient__patient_code__icontains=q)
            )

        uploaded_by = request.query_params.get("uploaded_by")
        if uploaded_by:
            qs = qs.filter(uploaded_by_id=uploaded_by)

        paginator = ScanPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            ScanListSerializer(page, many=True, context={"request": request}).data
        )


class ScanUploadInitView(APIView):
    """Bước 1/3 của chunked upload (§4.2, thay `POST /api/scans/` single-shot cũ —
    413 qua Cloudflare Tunnel với CBCT thật >100MB). Tạo Patient + Scan(status=
    uploading) + thư mục chunks/ rỗng, trả `chunk_size` server chọn (nguồn chân lý
    duy nhất, tránh lệch hằng số FE/BE) + `total_chunks` client cần gửi."""

    permission_classes = [IsAdminOrDoctor]

    def post(self, request):
        ser = ScanUploadInitSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        patient_code = d.get("patient_code", "").strip()
        if patient_code:
            patient, _ = Patient.objects.get_or_create(
                patient_code=patient_code,
                defaults={"name": d["patient_name"], "notes": d.get("note", "")},
            )
        else:
            # Mã bệnh nhân để trống → tự sinh mã duy nhất, cùng quy ước CBCT- thay vì
            # BN- (apps.cases) để phân biệt khi tra trong Django admin.
            patient = Patient.objects.create(
                name=d["patient_name"],
                patient_code=f"CBCT-{uuid4().hex[:8].upper()}",
                notes=d.get("note", ""),
            )

        chunk_size = settings.SCANS_UPLOAD_CHUNK_SIZE
        total_size = d["total_size"]
        total_chunks = math.ceil(total_size / chunk_size)

        scan = Scan.objects.create(
            patient=patient, uploaded_by=request.user,
            status=Scan.Status.UPLOADING, note=d.get("note", ""),
            upload_total_chunks=total_chunks,
            upload_chunk_size=chunk_size,
            upload_total_size=total_size,
        )
        os.makedirs(_chunks_dir(scan.pk), exist_ok=True)

        return Response(
            {"scan_id": scan.pk, "chunk_size": chunk_size, "total_chunks": total_chunks},
            status=status.HTTP_201_CREATED,
        )


class ScanUploadChunkView(APIView):
    """Bước 2/3 — nhận từng chunk thô (`Content-Type: application/octet-stream`, KHÔNG
    multipart — tránh chi phí ghi tạm 2 lần của `MultiPartParser` cho vô ích với chunk
    chỉ ~20MB). Ghi đè idempotent theo `index`: client gửi lại một chunk lỗi thoải mái,
    không cần hỏi trước qua GET .../ ."""

    permission_classes = [IsAdminOrDoctor]

    def put(self, request, pk, index):
        scan = _get_uploading_scan(request, pk)
        if scan.status != Scan.Status.UPLOADING:
            return Response(
                {"detail": "Phiên tải lên đã đóng."}, status=status.HTTP_409_CONFLICT
            )

        index = int(index)
        if index < 0 or index >= scan.upload_total_chunks:
            return Response(
                {"detail": "Chỉ số chunk không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST
            )

        chunks_dir = _chunks_dir(scan.pk)
        os.makedirs(chunks_dir, exist_ok=True)
        chunk_path = os.path.join(chunks_dir, f"{index:06d}.part")
        with open(chunk_path, "wb") as f:
            f.write(request.body)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ScanUploadStatusView(APIView):
    """Client dùng để resume sau lỗi giữa chừng — liệt kê chunk đã tới đọc thẳng từ
    đĩa (KHÔNG lưu ở DB, một nguồn sự thật duy nhất)."""

    permission_classes = [IsActiveUser]

    def get(self, request, pk):
        scan = _get_uploading_scan(request, pk)
        chunks_dir = _chunks_dir(scan.pk)
        received = []
        if os.path.isdir(chunks_dir):
            for name in os.listdir(chunks_dir):
                if name.endswith(".part"):
                    try:
                        received.append(int(name[:-len(".part")]))
                    except ValueError:
                        continue
        received.sort()
        return Response({
            "received_chunks": received,
            "total_chunks": scan.upload_total_chunks,
            "chunk_size": scan.upload_chunk_size,
        })


class ScanUploadCompleteView(APIView):
    """Bước 3/3 — ghép chunk theo thứ tự thành `original.zip`, xoá thư mục chunks/,
    rồi tiếp tục ĐÚNG luồng cũ (enqueue Celery, ghi `scan_upload`)."""

    permission_classes = [IsAdminOrDoctor]

    def post(self, request, pk):
        scan = _get_uploading_scan(request, pk)
        if scan.status != Scan.Status.UPLOADING:
            return Response(
                {"detail": "Phiên tải lên đã đóng."}, status=status.HTTP_409_CONFLICT
            )

        chunks_dir = _chunks_dir(scan.pk)
        total = scan.upload_total_chunks
        missing = [
            i for i in range(total)
            if not os.path.exists(os.path.join(chunks_dir, f"{i:06d}.part"))
        ]
        if missing:
            return Response(
                {"detail": "Thiếu chunk, chưa thể ghép file.", "missing_chunks": missing},
                status=status.HTTP_409_CONFLICT,
            )

        scan_dir = os.path.join(settings.SCANS_ROOT, str(scan.pk))
        zip_path = os.path.join(scan_dir, "original.zip")
        with open(zip_path, "wb") as out:
            for i in range(total):
                chunk_path = os.path.join(chunks_dir, f"{i:06d}.part")
                with open(chunk_path, "rb") as part:
                    shutil.copyfileobj(part, out)
        shutil.rmtree(chunks_dir, ignore_errors=True)

        scan.zip_path = zip_path
        scan.status = Scan.Status.PROCESSING
        scan.file_size = os.path.getsize(zip_path)
        scan.save(update_fields=["zip_path", "status", "file_size"])

        process_scan_upload.apply_async(args=[scan.pk], queue="scans")

        log_activity(
            LogCategory.BUSINESS, LogAction.SCAN_UPLOAD,
            actor=request.user, request=request, target_scan=scan,
            detail={"patient_code": scan.patient.patient_code},
        )
        return Response({"id": scan.pk, "status": scan.status})


class ScanDetailView(APIView):
    permission_classes = [IsActiveUser]

    def get(self, request, pk):
        # Ngoài phạm vi → 404, không phải 403 — cùng quy ước apps.cases (§9 CLAUDE.md):
        # 403 vô tình xác nhận phim đó tồn tại, rò rỉ thông tin với dữ liệu y tế.
        scan = get_object_or_404(scoped_scans(request.user), pk=pk)
        return Response(ScanDetailSerializer(scan, context={"request": request}).data)

    def delete(self, request, pk):
        """Xoá mềm — giữ vết cho ActivityLog/Segmentation đã tạo. KHÔNG xoá file vật
        lý (SCANS_ROOT/{pk}/): chưa có endpoint restore nên đây gần như vĩnh viễn về
        mặt hiển thị, nhưng dọn đĩa là việc vận hành riêng, không tự ý làm ở đây."""
        scan = get_object_or_404(scoped_scans(request.user), pk=pk)
        if not can_manage_scan(request.user, scan):
            raise Http404
        scan.soft_delete()
        log_activity(
            LogCategory.BUSINESS, LogAction.SCAN_DELETE,
            actor=request.user, request=request, target_scan=scan,
            detail={"patient_code": scan.patient.patient_code},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ScanStatusView(APIView):
    permission_classes = [IsActiveUser]

    def get(self, request, pk):
        scan = get_object_or_404(scoped_scans(request.user), pk=pk)
        return Response({
            "id": scan.pk,
            "status": scan.status,
            "error_message": scan.error_message,
        })


class ScanPreviewView(APIView):
    permission_classes = [IsActiveUser]

    def get(self, request, pk, index):
        scan = get_object_or_404(scoped_scans(request.user), pk=pk)
        if not scan.preview_dir:
            raise Http404
        path = os.path.join(scan.preview_dir, f"{int(index):04d}.png")
        if not os.path.exists(path):
            raise Http404
        return FileResponse(open(path, "rb"), content_type="image/png")


class ScanOpenTokenView(APIView):
    """Phát vé một lần cho 3D Slicer — xem `ScanAccessToken` (apps.scans.models) và
    PLAN_3D_CANINE.md §6.3. Chỉ phát cho phim đã `status=ready`: phát vé cho phim
    chưa/không xử lý xong chỉ để nó fail vô ích ở bước download."""

    permission_classes = [IsActiveUser]

    def post(self, request, pk):
        scan = get_object_or_404(scoped_scans(request.user), pk=pk)
        if scan.status != Scan.Status.READY:
            return Response(
                {"detail": "Phim chưa xử lý xong, chưa thể mở trong 3D Slicer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_token = secrets.token_urlsafe(32)
        expires_at = timezone.now() + OPEN_TOKEN_TTL
        ScanAccessToken.objects.create(
            scan=scan, user=request.user,
            token_hash=ScanAccessToken.hash_token(raw_token),
            expires_at=expires_at,
        )

        # server= để script mở phim (§6.3, chạy trên desktop bác sĩ) gọi thẳng
        # download/{token}/ mà không cần biết trước địa chỉ backend.
        query = urlencode({"token": raw_token, "server": settings.SCANS_PUBLIC_BASE_URL})
        open_url = f"dentai://open?{query}"

        log_activity(
            LogCategory.BUSINESS, LogAction.SCAN_OPEN_REQUESTED,
            actor=request.user, request=request, target_scan=scan,
        )
        return Response({"token": raw_token, "open_url": open_url, "expires_at": expires_at})


class ScanDownloadView(APIView):
    """3D Slicer gọi endpoint này trực tiếp — KHÔNG có JWT, token TỰ LÀ xác thực.

    Điểm nhạy cảm nhất của cầu nối 3D Slicer (PLAN_3D_CANINE.md §4): dùng một lần,
    TTL 5 phút, khoá hàng (`select_for_update`) để hai request đến gần như đồng thời
    không thể cùng dùng chung một token (TOCTOU).
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, token):
        token_hash = ScanAccessToken.hash_token(token)
        with transaction.atomic():
            token_obj = (
                ScanAccessToken.objects.select_for_update()
                .select_related("scan", "user")
                .filter(token_hash=token_hash)
                .first()
            )
            if token_obj is None:
                raise Http404
            if not token_obj.is_valid():
                return Response(
                    {"detail": "Đường dẫn tải phim đã hết hạn hoặc đã được dùng."},
                    status=status.HTTP_410_GONE,
                )

            scan = token_obj.scan
            # Bất thường hiếm gặp (phim đổi trạng thái giữa lúc phát vé và lúc dùng) —
            # KHÔNG đánh dấu used_at ở nhánh này, để vé còn dùng lại được khi phim sẵn
            # sàng thật. Chốt is_anonymized=False không được phục vụ — xem docstring
            # Scan.is_anonymized.
            if not scan.is_anonymized or scan.status != Scan.Status.READY or not scan.zip_path:
                return Response(
                    {"detail": "Phim chưa sẵn sàng để tải."},
                    status=status.HTTP_409_CONFLICT,
                )

            token_obj.used_at = timezone.now()
            token_obj.ip_address = get_client_ip(request)
            token_obj.user_agent = request.META.get("HTTP_USER_AGENT", "")[:300]
            token_obj.save(update_fields=["used_at", "ip_address", "user_agent"])

        if not os.path.exists(scan.zip_path):
            raise Http404

        # Gọi thành công tới đây CHÍNH LÀ mốc nhật ký scan_downloaded (PLAN §1.2) —
        # bằng chứng server đã thực sự truyền bytes đi, không phải chỉ "đã yêu cầu".
        log_activity(
            LogCategory.BUSINESS, LogAction.SCAN_DOWNLOADED,
            actor=token_obj.user, request=request, target_scan=scan,
        )
        return FileResponse(
            open(scan.zip_path, "rb"), as_attachment=True,
            filename=f"scan_{scan.pk}.zip", content_type="application/zip",
        )


class ScanSegmentationListCreateView(APIView):
    permission_classes = [IsActiveUser]

    def get(self, request, pk):
        scan = get_object_or_404(scoped_scans(request.user), pk=pk)
        segs = scan.segmentations.select_related("author")
        return Response(SegmentationSerializer(segs, many=True).data)

    def post(self, request, pk):
        scan = get_object_or_404(scoped_scans(request.user), pk=pk)
        if not can_contribute_scan(request.user, scan):
            return Response(
                {"detail": "Bạn chỉ có quyền xem phim này."},
                status=status.HTTP_403_FORBIDDEN,
            )
        ser = SegmentationUploadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        upload = d["file"]
        ext = os.path.splitext(upload.name)[1] or ".bin"
        next_version = (
            scan.segmentations.aggregate(Max("version"))["version__max"] or 0
        ) + 1

        seg_dir = os.path.join(settings.SCANS_ROOT, str(scan.pk), "segmentations")
        os.makedirs(seg_dir, exist_ok=True)
        file_path = os.path.join(seg_dir, f"v{next_version}{ext}")

        sha = hashlib.sha256()
        with open(file_path, "wb") as f:
            for chunk in upload.chunks():
                sha.update(chunk)
                f.write(chunk)

        seg = Segmentation.objects.create(
            scan=scan, author=request.user, version=next_version,
            file_path=file_path, file_hash=sha.hexdigest(),
            note=d.get("note", ""),
        )
        log_activity(
            LogCategory.BUSINESS, LogAction.SEGMENTATION_UPLOAD,
            actor=request.user, request=request, target_scan=scan,
            detail={"version": next_version, "file_hash": seg.file_hash[:16]},
        )
        return Response(SegmentationSerializer(seg).data, status=status.HTTP_201_CREATED)


class SegmentationFileView(APIView):
    permission_classes = [IsActiveUser]

    def get(self, request, pk):
        seg = get_object_or_404(Segmentation.objects.select_related("scan"), pk=pk)
        # SCOPE dựa trên ca chứa nó (Segmentation không tự có chủ sở hữu riêng).
        if not scoped_scans(request.user).filter(pk=seg.scan_id).exists():
            raise Http404
        if not seg.file_path or not os.path.exists(seg.file_path):
            raise Http404
        return FileResponse(
            open(seg.file_path, "rb"), as_attachment=True,
            filename=os.path.basename(seg.file_path),
        )


class ScanActivityLogView(APIView):
    """Nhật ký truy cập MỘT phim — khác `/api/activity-logs/` (chỉ admin, toàn hệ
    thống): endpoint này SCOPE theo scan, chủ sở hữu xem được nhật ký của chính phim
    mình mà không cần quyền admin (vd. muốn biết ai đã tải phim bệnh nhân về máy)."""

    permission_classes = [IsActiveUser]

    def get(self, request, pk):
        scan = get_object_or_404(scoped_scans(request.user), pk=pk)
        if not can_manage_scan(request.user, scan):
            raise Http404
        logs = (
            ActivityLog.objects.filter(target_scan=scan)
            .select_related("actor", "target_user")
            .order_by("-created_at")[:50]
        )
        return Response(ActivityLogSerializer(logs, many=True).data)
