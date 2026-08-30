"""API kho dữ liệu — tải lên (chunked), xem, tải xuống, sửa metadata, xoá mềm.

Ba nguyên tắc chi phối toàn bộ file này:

1. **Mọi queryset đi qua `access.scoped_assets()`.** Không có `DataAsset.objects.all()`
   nào ở đây; ra ngoài phạm vi thì `get_object_or_404` trả 404 chứ không phải 403 —
   403 vô tình xác nhận tư liệu đó tồn tại, rò rỉ thông tin với dữ liệu y tế.
2. **Bytes chỉ ra ngoài qua view có `permission_classes`.** `LIBRARY_ROOT` nằm ngoài
   `MEDIA_ROOT` nên không có đường vòng qua `static()`.
3. **Thông tin bệnh nhân (PHI) cắt ở serializer theo vai trò**, xem
   `access.can_see_patient_info()`.
"""
import mimetypes
import os
from uuid import uuid4

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.access import case_permission_for, scoped_images
from apps.cases.models import Image, Patient
from apps.common import chunked_upload
from apps.scans.access import can_manage_scan, scoped_scans
from apps.scans.models import Scan
from apps.users.activity import log_activity
from apps.users.models import LogAction, LogCategory, Role
from apps.users.permissions import IsActiveUser

from .access import (
    can_edit_asset,
    can_see_patient_info,
    can_view_asset,
    scoped_assets,
)
from .imports import SourceImportError, import_gingivitis_image, import_scan
from .models import DataAsset, DataCategory
from .serializers import (
    AssetDetailSerializer,
    AssetListSerializer,
    AssetSourceImportSerializer,
    AssetUpdateSerializer,
    AssetUploadInitSerializer,
    DataCategoryCreateSerializer,
    DataCategorySerializer,
    GingivitisSourceImportSerializer,
)
from .tasks import process_asset_task


def _original_path(asset_id, filename: str) -> str:
    return os.path.join(settings.LIBRARY_ROOT, str(asset_id), "original", filename)


def _get_uploading_asset(request, pk):
    """Tư liệu đang ở phiên upload của chính mình (hoặc admin).

    KHÔNG lọc qua `scoped_assets()` vì asset đang upload chưa từng bị xoá, và ta cần
    404 ngay cả khi nó tồn tại nhưng thuộc người khác.
    """
    asset = get_object_or_404(DataAsset, pk=pk)
    if not can_edit_asset(request.user, asset):
        raise Http404
    return asset


class AssetPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


def _import_response(request, asset, created):
    return Response(
        {
            "created": created,
            "asset": AssetDetailSerializer(
                asset, context={"request": request}
            ).data,
        },
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


# ── Phân loại ────────────────────────────────────────────────────────────────

class CategoryListCreateView(APIView):
    """Liệt kê và tạo phân loại — mở cho mọi tài khoản đang hoạt động.

    Tên được chuẩn hoá và chống trùng không phân biệt hoa/thường để lựa chọn
    "Khác — nhập tên mới" không làm sinh các danh mục tương đương.
    """

    def get_permissions(self):
        return [IsActiveUser()]

    def get(self, request):
        qs = DataCategory.objects.annotate(
            asset_count=Count("assets", filter=Q(assets__is_deleted=False))
        )
        return Response(DataCategorySerializer(qs, many=True).data)

    def post(self, request):
        ser = DataCategoryCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        name = ser.validated_data["name"]

        # Trùng tên (không phân biệt hoa/thường) → TRẢ VỀ danh mục đã có, 200. Không
        # báo lỗi: người dùng chỉ muốn có một danh mục tên đó, việc nó đã tồn tại
        # không phải lỗi của họ — và đây chính là cách chặn "Viêm lợi"/"viêm lợi".
        existing = DataCategory.objects.filter(name__iexact=name).first()
        if existing:
            return Response(DataCategorySerializer(existing).data)

        base = slugify(name, allow_unicode=True) or "phan-loai"
        slug = base
        i = 2
        while DataCategory.objects.filter(slug=slug).exists():
            slug = f"{base}-{i}"
            i += 1

        category = DataCategory.objects.create(
            name=name, slug=slug, is_builtin=False, created_by=request.user
        )
        return Response(
            DataCategorySerializer(category).data, status=status.HTTP_201_CREATED
        )


# ── Danh sách tư liệu ────────────────────────────────────────────────────────

class AssetListView(APIView):
    permission_classes = [IsActiveUser]

    def get(self, request):
        qs = scoped_assets(request.user)

        q = (request.query_params.get("q") or "").strip()
        if q:
            filters = Q(title__icontains=q) | Q(original_filename__icontains=q)
            patient_filters = Q(patient__name__icontains=q) | Q(
                patient__patient_code__icontains=q
            )
            # Vai trò chuyên môn tìm PHI trong toàn phạm vi. Bệnh nhân chỉ tìm PHI
            # trên tư liệu của chính họ, không dò được tên trong dữ liệu được chia sẻ.
            if can_see_patient_info(request.user):
                filters |= patient_filters
            elif request.user.role == Role.PATIENT:
                filters |= Q(uploaded_by=request.user) & patient_filters
            qs = qs.filter(filters)

        category = request.query_params.get("category")
        if category:
            qs = qs.filter(category_id=category)

        data_type = request.query_params.get("data_type")
        if data_type:
            qs = qs.filter(data_type=data_type)

        diagnosis = request.query_params.get("diagnosis")
        if diagnosis:
            from .diagnosis import TARGET_RULES

            if diagnosis not in TARGET_RULES:
                return Response(
                    {"detail": "Loại chẩn đoán không hợp lệ."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            category_slug, target_data_type = TARGET_RULES[diagnosis]
            qs = qs.filter(
                category__slug=category_slug,
                data_type=target_data_type,
                status=DataAsset.Status.READY,
                is_anonymized=True,
            )
            if diagnosis == "canine3d" and request.user.role not in (
                Role.ADMIN, Role.DOCTOR, Role.PATIENT,
            ):
                qs = qs.none()

        patient = request.query_params.get("patient")
        if patient:
            if can_see_patient_info(request.user):
                qs = qs.filter(patient_id=patient)
            elif request.user.role == Role.PATIENT:
                qs = qs.filter(patient_id=patient, uploaded_by=request.user)

        uploaded_by = request.query_params.get("uploaded_by")
        if uploaded_by:
            qs = qs.filter(uploaded_by_id=uploaded_by)

        # Tab "Của tôi" / "Được chia sẻ" — với admin, `mine=1` là cách duy nhất để lọc
        # ra tư liệu của chính họ giữa toàn bộ kho.
        if request.query_params.get("mine") == "1":
            qs = qs.filter(uploaded_by=request.user)
        if request.query_params.get("shared") == "1":
            qs = qs.filter(shares__shared_with=request.user).exclude(uploaded_by=request.user).distinct()
        if request.query_params.get("others") == "1":
            # Quyền quản trị toàn hệ thống không phải một lời chia sẻ cá nhân.
            if request.user.role != Role.ADMIN:
                return Response({"detail": "Chỉ quản trị viên được dùng bộ lọc này."}, status=403)
            qs = qs.exclude(uploaded_by=request.user)

        qs = qs.order_by("-created_at")
        paginator = AssetPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            AssetListSerializer(page, many=True, context={"request": request}).data
        )


# ── Sao chép từ module nghiệp vụ vào Kho dữ liệu ─────────────────────────────

class ScanSourceImportView(APIView):
    """Lưu một phim RNNHT 3D đã khử PHI vào Kho dữ liệu của người gửi."""

    permission_classes = [IsActiveUser]

    def post(self, request, scan_id):
        ser = AssetSourceImportSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        with transaction.atomic():
            # `scoped_scans()` dùng DISTINCT để gộp quan hệ chia sẻ. PostgreSQL
            # không cho SELECT FOR UPDATE trên DISTINCT, nên xác nhận phạm vi trước
            # rồi mới khóa bản ghi gốc bằng một truy vấn riêng.
            if not scoped_scans(request.user).filter(pk=scan_id).exists():
                raise Http404
            scan = get_object_or_404(
                Scan.objects.select_related("patient", "uploaded_by").select_for_update(
                    of=("self",)
                ),
                pk=scan_id,
            )
            if not can_manage_scan(request.user, scan):
                return Response(
                    {"detail": "Chỉ chủ phim hoặc quản trị viên được lưu phim vào Kho dữ liệu."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if scan.status != Scan.Status.READY or not scan.is_anonymized:
                return Response(
                    {"detail": "Phim phải xử lý và khử thông tin cá nhân xong trước khi chia sẻ."},
                    status=status.HTTP_409_CONFLICT,
                )

            try:
                asset, created = import_scan(
                    scan=scan,
                    user=request.user,
                    title=data.get("title", ""),
                    condition_note=data.get("condition_note", scan.note or ""),
                )
            except SourceImportError as exc:
                return Response(
                    {"detail": str(exc)}, status=status.HTTP_409_CONFLICT
                )

        if created:
            process_asset_task.apply_async(args=[asset.pk], queue="scans")
            log_activity(
                LogCategory.BUSINESS, LogAction.ASSET_UPLOAD,
                actor=request.user, request=request,
                detail={
                    "asset_id": asset.pk,
                    "source": "rnnht_3d",
                    "source_scan_id": scan.pk,
                    "file_size": asset.file_size,
                },
            )
        return _import_response(request, asset, created)


class GingivitisSourceImportView(APIView):
    """Lưu ảnh gốc hoặc ảnh chú thích của một kết quả viêm lợi vào Kho dữ liệu."""

    permission_classes = [IsActiveUser]

    def post(self, request, case_id, image_index):
        ser = GingivitisSourceImportSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        with transaction.atomic():
            # Tương tự phim 3D: `scoped_images()` có DISTINCT nên không thể khóa
            # trực tiếp trên PostgreSQL. Giữ 404 ngoài phạm vi ở truy vấn đầu, sau
            # đó khóa đúng Image trong bảng gốc.
            visible_image = scoped_images(request.user).filter(
                case_id=case_id, order_index=image_index
            ).values_list("pk", flat=True).first()
            if visible_image is None:
                raise Http404
            image = get_object_or_404(
                Image.objects
                .select_related("case__patient", "case__created_by", "caption")
                .select_for_update(of=("self",)),
                pk=visible_image,
            )
            if case_permission_for(request.user, image.case) not in ("owner", "admin"):
                return Response(
                    {"detail": "Chỉ chủ ca hoặc quản trị viên được lưu kết quả vào Kho dữ liệu."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if image.status not in (Image.Status.DONE, Image.Status.LOW_CONFIDENCE):
                return Response(
                    {"detail": "Ảnh chưa xử lý xong nên chưa thể chia sẻ."},
                    status=status.HTTP_409_CONFLICT,
                )

            caption = getattr(image, "caption", None)
            default_note = ""
            if caption:
                default_note = (
                    caption.edited_text if caption.is_edited else caption.ai_text
                ) or ""
            try:
                asset, created = import_gingivitis_image(
                    image=image,
                    user=request.user,
                    variant=data["variant"],
                    title=data.get("title", ""),
                    condition_note=data.get("condition_note", default_note),
                )
            except SourceImportError as exc:
                return Response(
                    {"detail": str(exc)}, status=status.HTTP_409_CONFLICT
                )

        if created:
            process_asset_task.apply_async(args=[asset.pk], queue="scans")
            log_activity(
                LogCategory.BUSINESS, LogAction.ASSET_UPLOAD,
                actor=request.user, request=request,
                target_case=image.case,
                detail={
                    "asset_id": asset.pk,
                    "source": "gingivitis",
                    "source_case_id": image.case_id,
                    "source_image_id": image.pk,
                    "variant": data["variant"],
                    "file_size": asset.file_size,
                },
            )
        return _import_response(request, asset, created)


# ── Chunked upload (3 bước) ──────────────────────────────────────────────────

class AssetUploadInitView(APIView):
    """Bước 1/3 — tạo `DataAsset(status=uploading)` + `Patient` (nếu có khai) và trả
    `chunk_size` do server chọn (nguồn chân lý duy nhất, tránh lệch hằng số FE/BE)."""

    permission_classes = [IsActiveUser]

    def post(self, request):
        ser = AssetUploadInitSerializer(
            data=request.data,
            context={"request": request, "max_size": settings.LIBRARY_MAX_ASSET_SIZE},
        )
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        patient = self._resolve_patient(request, d)

        chunk_size = settings.LIBRARY_UPLOAD_CHUNK_SIZE
        total_chunks = chunked_upload.plan_chunks(d["total_size"], chunk_size)

        asset = DataAsset.objects.create(
            title=d["title"].strip(),
            patient=patient,
            condition_note=d["condition_note"].strip() if patient else "",
            category=d["category"],
            data_type=d["data_type"],
            data_type_other=d.get("data_type_other", "").strip(),
            uploaded_by=request.user,
            status=DataAsset.Status.UPLOADING,
            original_filename=os.path.basename(d["filename"]),
            upload_total_chunks=total_chunks,
            upload_chunk_size=chunk_size,
            upload_total_size=d["total_size"],
        )
        chunked_upload.start_upload(settings.LIBRARY_ROOT, asset.pk)

        return Response(
            {
                "asset_id": asset.pk,
                "chunk_size": chunk_size,
                "total_chunks": total_chunks,
            },
            status=status.HTTP_201_CREATED,
        )

    def _resolve_patient(self, request, d):
        """Tạo/tìm bệnh nhân từ metadata — trả None khi người dùng không khai gì."""
        name = d.get("patient_name", "").strip()
        code = d.get("patient_code", "").strip()
        if not name and not code:
            return None

        # Patient không được phép gắn mã đã tồn tại rồi đọc ngược hồ sơ của người
        # khác. Giao diện không hỏi mã ở vai trò này; server luôn sinh mã riêng.
        if request.user.role == Role.PATIENT:
            if not name:
                return None
            return Patient.objects.create(
                name=name,
                patient_code=f"LIB-{uuid4().hex[:8].upper()}",
                gender=d.get("gender", ""),
                birth_year=d.get("birth_year"),
            )

        if code:
            patient, created = Patient.objects.get_or_create(
                patient_code=code,
                defaults={
                    "name": name or code,
                    "gender": d.get("gender", ""),
                    "birth_year": d.get("birth_year"),
                },
            )
            # Bệnh nhân đã có (vd. đã có ca viêm lợi) mà lần này khai thêm giới tính /
            # năm sinh → bổ sung, nhưng KHÔNG ghi đè giá trị đã có bằng giá trị rỗng.
            if not created:
                patch = {}
                if d.get("gender") and not patient.gender:
                    patch["gender"] = d["gender"]
                if d.get("birth_year") and not patient.birth_year:
                    patch["birth_year"] = d["birth_year"]
                if patch:
                    for field, value in patch.items():
                        setattr(patient, field, value)
                    patient.save(update_fields=list(patch))
            return patient

        # Không khai mã → tự sinh, cùng quy ước BN- (cases) và CBCT- (scans).
        return Patient.objects.create(
            name=name,
            patient_code=f"LIB-{uuid4().hex[:8].upper()}",
            gender=d.get("gender", ""),
            birth_year=d.get("birth_year"),
        )


class AssetUploadChunkView(APIView):
    """Bước 2/3 — nhận từng chunk thô (`application/octet-stream`, KHÔNG multipart)."""

    permission_classes = [IsActiveUser]

    def put(self, request, pk, index):
        asset = _get_uploading_asset(request, pk)
        if asset.status != DataAsset.Status.UPLOADING:
            return Response(
                {"detail": "Phiên tải lên đã đóng."}, status=status.HTTP_409_CONFLICT
            )

        index = int(index)
        if index < 0 or index >= asset.upload_total_chunks:
            return Response(
                {"detail": "Chỉ số chunk không hợp lệ."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        chunked_upload.write_chunk(settings.LIBRARY_ROOT, asset.pk, index, request.body)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssetUploadStatusView(APIView):
    """Client dùng để resume sau lỗi giữa chừng."""

    permission_classes = [IsActiveUser]

    def get(self, request, pk):
        asset = _get_uploading_asset(request, pk)
        return Response({
            "received_chunks": chunked_upload.received_chunks(
                settings.LIBRARY_ROOT, asset.pk
            ),
            "total_chunks": asset.upload_total_chunks,
            "chunk_size": asset.upload_chunk_size,
        })


class AssetUploadCompleteView(APIView):
    """Bước 3/3 — ghép chunk thành file gốc rồi đẩy sang Celery xử lý nền."""

    permission_classes = [IsActiveUser]

    def post(self, request, pk):
        asset = _get_uploading_asset(request, pk)
        if asset.status != DataAsset.Status.UPLOADING:
            return Response(
                {"detail": "Phiên tải lên đã đóng."}, status=status.HTTP_409_CONFLICT
            )

        missing = chunked_upload.missing_chunks(
            settings.LIBRARY_ROOT, asset.pk, asset.upload_total_chunks
        )
        if missing:
            return Response(
                {"detail": "Thiếu chunk, chưa thể ghép file.", "missing_chunks": missing},
                status=status.HTTP_409_CONFLICT,
            )

        dest = _original_path(asset.pk, asset.original_filename)
        size = chunked_upload.assemble(
            settings.LIBRARY_ROOT, asset.pk, asset.upload_total_chunks, dest
        )

        asset.file_path = dest
        asset.file_size = size
        asset.mime_type = mimetypes.guess_type(asset.original_filename)[0] or ""
        asset.status = DataAsset.Status.PROCESSING
        asset.save(update_fields=["file_path", "file_size", "mime_type", "status"])

        process_asset_task.apply_async(args=[asset.pk], queue="scans")

        log_activity(
            LogCategory.BUSINESS, LogAction.ASSET_UPLOAD,
            actor=request.user, request=request,
            detail={
                "asset_id": asset.pk,
                "title": asset.title,
                "data_type": asset.data_type,
                "file_size": size,
            },
        )
        return Response({"id": asset.pk, "status": asset.status})


# ── Chi tiết / sửa / xoá ─────────────────────────────────────────────────────

class AssetDetailView(APIView):
    permission_classes = [IsActiveUser]

    def get(self, request, pk):
        asset = get_object_or_404(scoped_assets(request.user), pk=pk)
        return Response(
            AssetDetailSerializer(asset, context={"request": request}).data
        )

    def patch(self, request, pk):
        asset = get_object_or_404(scoped_assets(request.user), pk=pk)
        if not can_edit_asset(request.user, asset):
            return Response(
                {"detail": "Bạn không có quyền sửa tư liệu này."},
                status=status.HTTP_403_FORBIDDEN,
            )

        data = dict(request.data)
        # `condition_note` thuộc khối PHI — người không được xem thì cũng không ghi đè
        # được (nếu không, một tài khoản được chia sẻ quyền edit có thể xoá trắng mô tả
        # mình chưa từng đọc).
        if not can_see_patient_info(request.user, asset):
            data.pop("condition_note", None)

        ser = AssetUpdateSerializer(asset, data=data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(
            AssetDetailSerializer(asset, context={"request": request}).data
        )

    def delete(self, request, pk):
        """Xoá mềm — giữ vết cho ActivityLog/chia sẻ đã tạo. KHÔNG xoá file vật lý:
        dọn đĩa là việc vận hành riêng, cùng quy ước `ScanDetailView.delete`."""
        asset = get_object_or_404(scoped_assets(request.user), pk=pk)
        # Người được chia sẻ quyền `edit` sửa được metadata nhưng KHÔNG xoá được —
        # cùng quy ước với chia sẻ ca ở apps.cases.
        is_owner = asset.uploaded_by_id == request.user.pk
        if not (is_owner or request.user.role == Role.ADMIN):
            return Response(
                {"detail": "Chỉ người tải lên hoặc quản trị viên mới xoá được tư liệu này."},
                status=status.HTTP_403_FORBIDDEN,
            )

        asset.soft_delete()
        log_activity(
            LogCategory.BUSINESS, LogAction.ASSET_DELETE,
            actor=request.user, request=request,
            detail={"asset_id": asset.pk, "title": asset.title},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssetStatusView(APIView):
    """Polling trong lúc Celery xử lý — trang chi tiết gọi mỗi 2s cho tới khi xong."""

    permission_classes = [IsActiveUser]

    def get(self, request, pk):
        asset = get_object_or_404(scoped_assets(request.user), pk=pk)
        return Response({
            "id": asset.pk,
            "status": asset.status,
            "preview_count": asset.preview_count,
            "error_message": asset.error_message,
        })


class AssetPreviewView(APIView):
    """PNG xem trước lát thứ `index` (ảnh thường thì chỉ có index 0).

    Cần JWT ⇒ frontend KHÔNG dùng được `<img src>` thẳng, phải tải qua axios rồi dựng
    object URL — giống `fetchScanPreviewBlob`.
    """

    permission_classes = [IsActiveUser]

    def get(self, request, pk, index):
        asset = get_object_or_404(scoped_assets(request.user), pk=pk)
        if not asset.preview_dir:
            raise Http404
        path = os.path.join(asset.preview_dir, f"{int(index):04d}.png")
        if not os.path.exists(path):
            raise Http404
        return FileResponse(open(path, "rb"), content_type="image/png")


class AssetThumbnailView(APIView):
    """Ảnh nhỏ (JPEG ~256px) cho cột đầu bảng danh sách.

    Tách khỏi `preview/{n}/` chứ không dùng lại preview index 0: bảng có 20 dòng, mỗi
    preview là PNG tới 512px — tải đủ 20 cái chỉ để hiện ô 40px là lãng phí băng thông
    của người dùng.
    """

    permission_classes = [IsActiveUser]

    def get(self, request, pk):
        asset = get_object_or_404(scoped_assets(request.user), pk=pk)
        if not asset.thumbnail_path or not os.path.exists(asset.thumbnail_path):
            raise Http404
        return FileResponse(open(asset.thumbnail_path, "rb"), content_type="image/jpeg")


class AssetDownloadView(APIView):
    permission_classes = [IsActiveUser]

    def get(self, request, pk):
        asset = get_object_or_404(scoped_assets(request.user), pk=pk)
        if not can_view_asset(request.user, asset):
            raise Http404

        if asset.status != DataAsset.Status.READY or not asset.file_path:
            return Response(
                {"detail": "Tư liệu chưa xử lý xong, chưa thể tải xuống."},
                status=status.HTTP_409_CONFLICT,
            )
        # Header DICOM mang PHI ngay trong file — chưa khử xong thì KHÔNG phục vụ,
        # cùng chốt chặn với `ScanDownloadView`.
        if not asset.is_anonymized:
            return Response(
                {"detail": "Tệp DICOM chưa khử xong thông tin cá nhân, chưa thể tải xuống."},
                status=status.HTTP_409_CONFLICT,
            )
        if not os.path.exists(asset.file_path):
            raise Http404

        log_activity(
            LogCategory.BUSINESS, LogAction.ASSET_DOWNLOAD,
            actor=request.user, request=request,
            detail={"asset_id": asset.pk, "title": asset.title},
        )
        return FileResponse(
            open(asset.file_path, "rb"),
            as_attachment=True,
            filename=asset.original_filename or f"asset_{asset.pk}",
            content_type=asset.mime_type or "application/octet-stream",
        )
