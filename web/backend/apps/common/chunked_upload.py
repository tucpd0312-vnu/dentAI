"""Hạ tầng chunked upload dùng chung cho `apps.scans` (phim CBCT) và `apps.library`
(kho dữ liệu).

Vì sao phải chunk thay vì một request duy nhất: hạ tầng thật đi qua Cloudflare Tunnel
giới hạn CỨNG 100MB/request, mà một chuỗi DICOM thật lên tới vài trăm MB. Xem
PLAN_3D_CANINE.md §4.2 — đây là bản tách ra từ `apps/scans/views.py` sau khi
`apps.library` cần đúng luồng đó (docs/02-KE-HOACH-NANG-CAP.md §B.5).

Nguyên tắc: **danh sách chunk đã nhận đọc thẳng từ đĩa, KHÔNG lưu ở DB** — một nguồn
sự thật duy nhất, không có cửa cho DB và đĩa lệch nhau khi tiến trình chết giữa chừng.
Model gọi tới đây chỉ cần lưu `upload_total_chunks` / `upload_chunk_size` /
`upload_total_size` để biết phiên upload dự kiến gồm bao nhiêu phần.

Mọi hàm nhận `root` (thư mục gốc của module: `SCANS_ROOT` hoặc `LIBRARY_ROOT`) và
`obj_id` (khoá chính của Scan/DataAsset) — không import model nào, không đụng DB.
"""
import math
import os
import shutil


def chunks_dir(root: str, obj_id) -> str:
    """`{root}/{obj_id}/chunks` — nơi giữ các phần đã nhận của một phiên upload."""
    return os.path.join(root, str(obj_id), "chunks")


def object_dir(root: str, obj_id) -> str:
    """`{root}/{obj_id}` — thư mục riêng của một đối tượng."""
    return os.path.join(root, str(obj_id))


def plan_chunks(total_size: int, chunk_size: int) -> int:
    """Số chunk client phải gửi cho một file `total_size` byte."""
    return math.ceil(total_size / chunk_size)


def start_upload(root: str, obj_id) -> str:
    """Tạo thư mục chunks/ rỗng cho phiên upload mới. Trả đường dẫn thư mục đó."""
    path = chunks_dir(root, obj_id)
    os.makedirs(path, exist_ok=True)
    return path


def write_chunk(root: str, obj_id, index: int, data: bytes) -> None:
    """Ghi (hoặc GHI ĐÈ) chunk thứ `index`.

    Idempotent theo `index` là chủ đích: client gửi lại một chunk lỗi thoải mái mà
    không phải hỏi trước xem nó đã tới nơi chưa.
    """
    path = chunks_dir(root, obj_id)
    os.makedirs(path, exist_ok=True)
    with open(os.path.join(path, f"{index:06d}.part"), "wb") as f:
        f.write(data)


def received_chunks(root: str, obj_id) -> list[int]:
    """Chỉ số các chunk đã nằm trên đĩa, tăng dần — client dùng để resume."""
    path = chunks_dir(root, obj_id)
    received: list[int] = []
    if os.path.isdir(path):
        for name in os.listdir(path):
            if name.endswith(".part"):
                try:
                    received.append(int(name[: -len(".part")]))
                except ValueError:
                    continue
    received.sort()
    return received


def missing_chunks(root: str, obj_id, total_chunks: int) -> list[int]:
    """Chỉ số các chunk còn thiếu để ghép được file hoàn chỉnh."""
    path = chunks_dir(root, obj_id)
    return [
        i for i in range(total_chunks)
        if not os.path.exists(os.path.join(path, f"{i:06d}.part"))
    ]


def assemble(root: str, obj_id, total_chunks: int, dest_path: str) -> int:
    """Nối các chunk theo đúng thứ tự thành `dest_path`, xoá thư mục chunks/.

    Trả về dung lượng file kết quả (byte). Người gọi PHẢI kiểm `missing_chunks()`
    trước — hàm này không tự kiểm để tránh quét thư mục hai lần.
    """
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    src_dir = chunks_dir(root, obj_id)
    with open(dest_path, "wb") as out:
        for i in range(total_chunks):
            with open(os.path.join(src_dir, f"{i:06d}.part"), "rb") as part:
                shutil.copyfileobj(part, out)
    shutil.rmtree(src_dir, ignore_errors=True)
    return os.path.getsize(dest_path)
