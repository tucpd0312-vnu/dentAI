from pathlib import Path
from uuid import uuid4

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsReceptionist

from .models import AssignmentWorkbook
from .serializers import AssignmentWorkbookSerializer


ALLOWED_EXTENSIONS = {".xlsx", ".xls"}
XLSX_SIGNATURE = b"PK\x03\x04"
XLS_SIGNATURE = bytes.fromhex("D0CF11E0A1B11AE1")


def _validate_workbook(uploaded_file):
    original_name = Path(uploaded_file.name or "").name
    extension = Path(original_name).suffix.lower()

    if not original_name or extension not in ALLOWED_EXTENSIONS:
        raise ValidationError(
            {"file": "Chỉ chấp nhận file Excel có định dạng .xlsx hoặc .xls."}
        )
    if uploaded_file.size == 0:
        raise ValidationError({"file": "File tải lên đang trống."})
    if uploaded_file.size > settings.RECEPTION_ASSIGNMENT_MAX_SIZE:
        max_mb = settings.RECEPTION_ASSIGNMENT_MAX_SIZE // (1024 * 1024)
        raise ValidationError({"file": f"File Excel không được vượt quá {max_mb} MB."})

    header = uploaded_file.read(8)
    uploaded_file.seek(0)
    expected = XLSX_SIGNATURE if extension == ".xlsx" else XLS_SIGNATURE
    if not header.startswith(expected):
        raise ValidationError(
            {"file": "Nội dung file không đúng với định dạng Excel đã chọn."}
        )
    return original_name[:255], extension


class AssignmentWorkbookUploadView(APIView):
    permission_classes = [IsReceptionist]
    parser_classes = [MultiPartParser]
    allow_receptionist = True

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            raise ValidationError({"file": "Vui lòng chọn file Excel để tải lên."})

        original_name, extension = _validate_workbook(uploaded_file)
        storage_name = f"{request.user.pk}/{uuid4().hex}{extension}"
        root = Path(settings.RECEPTION_ASSIGNMENTS_ROOT).resolve()
        target = (root / storage_name).resolve()
        # storage_name do server tạo, nhưng vẫn kiểm tra biên để phòng lỗi hồi quy.
        if root not in target.parents:
            raise ValidationError({"file": "Đường dẫn lưu file không hợp lệ."})

        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            with target.open("xb") as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)
            workbook = AssignmentWorkbook.objects.create(
                uploaded_by=request.user,
                original_filename=original_name,
                storage_name=storage_name,
                file_size=uploaded_file.size,
            )
        except Exception:
            target.unlink(missing_ok=True)
            raise

        return Response(
            AssignmentWorkbookSerializer(workbook).data,
            status=status.HTTP_201_CREATED,
        )


class LatestAssignmentWorkbookView(APIView):
    permission_classes = [IsReceptionist]
    allow_receptionist = True

    def get(self, request):
        workbook = AssignmentWorkbook.objects.filter(uploaded_by=request.user).first()
        return Response(
            {
                "latest": (
                    AssignmentWorkbookSerializer(workbook).data if workbook else None
                )
            }
        )
