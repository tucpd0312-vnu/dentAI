"""Khử thông tin định danh (PHI) trong header DICOM trước khi lưu trữ.

Danh sách tag dưới đây được xác nhận có PHI thật qua khảo sát trên một file CBCT
thật (2026-08-18, xem `web/tools/inspect_dicom.py` — công cụ khảo sát độc lập, danh
sách ở đây KHÔNG import từ đó vì hai nơi phục vụ hai mục đích khác nhau: một là công
cụ kiểm tra thủ công ngoài repo, một là code chạy trong pipeline chính thức).

`StudyDate`/`StudyTime` CỐ Ý nằm trong danh sách khử — phải trích ra `Scan.acquired_at`
TRƯỚC khi gọi `anonymize_dataset()`, không phải sau.

⚠️ Giới hạn đã biết: đây chỉ khử PHI ở HEADER. Một số máy chụp burn thông tin bệnh
nhân trực tiếp vào pixel data (overlay ảnh) — trường hợp đó KHÔNG được xử lý ở đây.
Ngoài phạm vi bước hiện tại (module vẫn ở giai đoạn minh hoạ), nhưng cần biết trước
khi coi đầu ra của hàm này là "đã ẩn danh hoàn toàn".
"""

PHI_TAGS = [
    "PatientName", "PatientID", "PatientBirthDate", "PatientSex", "PatientAge",
    "PatientAddress", "PatientTelephoneNumbers", "OtherPatientIDs", "OtherPatientNames",
    "InstitutionName", "InstitutionAddress", "InstitutionalDepartmentName",
    "ReferringPhysicianName", "PerformingPhysicianName", "OperatorsName",
    "PhysiciansOfRecord", "NameOfPhysiciansReadingStudy",
    "StudyID", "AccessionNumber", "StudyDate", "StudyTime",
    "StationName", "DeviceSerialNumber", "InstanceCreatorUID",
]


def anonymize_dataset(ds) -> None:
    """Xoá tại chỗ các tag PHI khỏi `ds` (một `pydicom.Dataset`)."""
    for tag in PHI_TAGS:
        if tag in ds:
            delattr(ds, tag)
