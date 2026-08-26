from django.contrib import admin

from .models import DataAsset, DataAssetShare, DataCategory


@admin.register(DataCategory)
class DataCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "is_builtin", "created_by", "created_at"]
    list_filter = ["is_builtin"]
    search_fields = ["name", "slug"]


@admin.register(DataAsset)
class DataAssetAdmin(admin.ModelAdmin):
    list_display = [
        "id", "title", "category", "data_type", "status",
        "uploaded_by", "is_deleted", "created_at",
    ]
    list_filter = ["status", "data_type", "is_deleted", "category"]
    search_fields = ["title", "original_filename", "patient__name", "patient__patient_code"]
    # Chỉ đọc: đây là dấu vết do pipeline ghi, sửa tay ở admin chỉ tạo trạng thái lệch
    # giữa DB và đĩa.
    readonly_fields = [
        "file_path", "preview_dir", "preview_count", "thumbnail_path",
        "file_size", "mime_type", "upload_total_chunks", "upload_chunk_size",
        "upload_total_size", "created_at", "updated_at",
    ]


@admin.register(DataAssetShare)
class DataAssetShareAdmin(admin.ModelAdmin):
    list_display = ["asset", "shared_with", "permission", "shared_by", "created_at"]
    list_filter = ["permission"]
