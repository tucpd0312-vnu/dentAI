"""dentAI — script mở phim CBCT trong 3D Slicer qua scheme dentai://.

CHẠY TRONG 3D SLICER qua `--python-script`, KHÔNG chạy bằng python thường — cần
module `slicer` và `DICOMLib` do Slicer inject sẵn vào namespace lúc khởi động.
KHÔNG phải một Extension: đây là file rời, Slicer nạp lại từ đầu mỗi lần chạy.

Đăng ký OS-level trỏ scheme `dentai://` tới file này — chạy MỘT LẦN cho mỗi máy
bác sĩ bằng install_windows.ps1 / install_linux.sh / install_macos.sh cạnh file
này. Sau khi đăng ký, Slicer được hệ điều hành tự gọi dạng:

    Slicer --no-splash --python-script open_scan.py "dentai://open?token=...&server=..."

argv[-1] luôn là URL — an toàn với mọi cờ Slicer/OS chèn thêm phía trước, không
phụ thuộc đúng vị trí argv[1].

File ZIP server trả về ĐÃ được ẩn danh PHI ở bước upload (xem
PLAN_3D_CANINE.md §4.3) — script này không tự xử lý PHI, chỉ tải và load.
"""
import os
import shutil
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile

import slicer
from DICOMLib import DICOMUtils

# Phim CBCT thật ~500MB (PLAN_3D_CANINE.md §6.1 mục E); LAN 100Mbps mất tới ~1
# phút, wifi có thể 1-3 phút — timeout phải đủ rộng, không phải giá trị mặc định
# ngắn của urllib.
REQUEST_TIMEOUT_SECONDS = 180

# Chống mở trùng: mỗi lần bấm "Mở phim DICOM" trên web, OS luôn spawn một tiến
# trình Slicer.exe MỚI trước khi dòng Python nào ở đây chạy — không chặn được ở
# tầng này. Chỉ phát hiện SAU KHI đã bị spawn: nếu PID trong lock file còn sống,
# tự đóng cửa sổ mới ngay, không tải lại phim nặng thừa.
LOCK_PATH = os.path.join(tempfile.gettempdir(), "dentai_slicer_open.lock")


def _fail(title, message):
    """Hiện dialog Qt rõ ràng rồi dừng tiến trình.

    BẮT BUỘC — không được để lỗi mạng/token rơi thành traceback thô hoặc im lặng,
    khiến bác sĩ tưởng Slicer bị treo (PLAN_3D_CANINE.md §6.3).
    """
    slicer.util.errorDisplay(message, windowTitle=title)
    sys.exit(1)


def _is_pid_alive(pid):
    if sys.platform == "win32":
        import ctypes
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if handle:
            ctypes.windll.kernel32.CloseHandle(handle)
            return True
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def _check_single_instance():
    """Best-effort — lỗi đọc/ghi lock file KHÔNG được chặn luồng chính (§ tiêu đề
    file: chống mở trùng là tiện ích phụ, không phải điều kiện để mở phim)."""
    try:
        if os.path.exists(LOCK_PATH):
            with open(LOCK_PATH) as f:
                old_pid = int(f.read().strip())
            if old_pid != os.getpid() and _is_pid_alive(old_pid):
                _fail(
                    "dentAI — Slicer đã đang mở",
                    "Đã có một cửa sổ Slicer khác đang mở phim từ dentAI.\n"
                    "Quay lại cửa sổ đó thay vì mở thêm — cửa sổ này sẽ tự đóng.",
                )
        with open(LOCK_PATH, "w") as f:
            f.write(str(os.getpid()))
    except SystemExit:
        raise
    except (OSError, ValueError):
        pass


def _parse_target():
    if len(sys.argv) < 2:
        _fail(
            "dentAI — thiếu tham số",
            "Slicer được mở mà không có link dentai://.\n"
            "Đừng chạy file này trực tiếp — quay lại trang web và bấm "
            '"Mở phim DICOM".',
        )

    raw_url = sys.argv[-1]
    parsed = urllib.parse.urlparse(raw_url)
    if parsed.scheme != "dentai":
        _fail(
            "dentAI — URL không hợp lệ",
            "Tham số nhận được không phải link dentai://:\n" + raw_url,
        )

    params = urllib.parse.parse_qs(parsed.query)
    token = params.get("token", [None])[0]
    server = params.get("server", [None])[0]
    if not token or not server:
        _fail(
            "dentAI — thiếu token/server",
            "Link dentai:// thiếu tham số token hoặc server:\n" + raw_url,
        )
    return token, server


def _open_progress_dialog(maximum):
    """`None` nếu API không có trên bản Slicer đang dùng — gọi vẫn tải được bình
    thường, chỉ mất thanh tiến trình đẹp, fallback status message bên dưới."""
    try:
        return slicer.util.createProgressDialog(
            windowTitle="dentAI", labelText="Đang mở phim ...", maximum=maximum,
        )
    except Exception:
        return None


def _download_zip(token, server):
    url = f"{server.rstrip('/')}/api/scans/download/{token}/"
    # UA mặc định của urllib ("Python-urllib/x.y") nằm trong danh sách chặn của
    # Cloudflare Bot Fight Mode (error code 1010) khi server đứng sau Cloudflare
    # Tunnel — xác nhận qua curl -A "Python-urllib/3.11" cùng domain thật, 403.
    request = urllib.request.Request(url, headers={"User-Agent": "dentAI-SlicerBridge/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            content_length = resp.getheader("Content-Length")
            total_mb = int(content_length) // (1024 * 1024) if content_length else 0
            progress = _open_progress_dialog(maximum=100 if total_mb else 0)

            # resp.read() trần chặn Qt event loop suốt thời gian tải (~10-15s với
            # CBCT thật qua mạng) → Windows báo "Not Responding". Đọc từng khối +
            # processEvents() giữa các khối để Slicer vẫn bơm được sự kiện UI —
            # đồng thời cập nhật tiến trình để bác sĩ biết đang tải, không tưởng treo.
            try:
                chunks = []
                downloaded = 0
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    chunks.append(chunk)
                    downloaded += len(chunk)
                    downloaded_mb = downloaded // (1024 * 1024)
                    label = f"Đang mở phim ... {downloaded_mb}MB"
                    if total_mb:
                        label += f" / {total_mb}MB"
                    if progress is not None:
                        if total_mb:
                            progress.value = min(100, int(downloaded * 100 / (total_mb * 1024 * 1024)))
                        progress.labelText = label
                    else:
                        slicer.util.showStatusMessage(f"dentAI: {label}", 2000)
                    slicer.app.processEvents()
            finally:
                if progress is not None:
                    progress.close()
            return b"".join(chunks)
    except urllib.error.HTTPError as e:
        if e.code == 410:
            _fail(
                "dentAI — vé đã hết hạn",
                "Vé mở phim này đã dùng hoặc đã hết hạn (chỉ sống 5 phút, dùng "
                'được một lần). Quay lại trang web và bấm lại "Mở phim DICOM".',
            )
        else:
            _fail(
                "dentAI — server từ chối yêu cầu",
                f"Server trả lỗi HTTP {e.code} khi tải phim.\nChi tiết: {e.reason}",
            )
    except urllib.error.URLError as e:
        _fail(
            "dentAI — không kết nối được server",
            f"Không kết nối được tới {server}.\n"
            "Kiểm tra mạng, hoặc URL server đã đổi (đăng ký lại bằng script cài "
            f"đặt nếu server chuyển chỗ khác).\nChi tiết: {e.reason}",
        )
    except TimeoutError:
        _fail(
            "dentAI — tải phim quá lâu",
            f"Không tải xong phim sau {REQUEST_TIMEOUT_SECONDS}s. Mạng có thể "
            "quá chậm cho phim CBCT (~500MB) — thử lại ở mạng dây thay vì wifi.",
        )


def _import_from_db(tmp_dir, db):
    DICOMUtils.importDicom(tmp_dir, db)
    patient_uids = db.patients()
    if not patient_uids:
        _fail(
            "dentAI — không đọc được DICOM",
            "Tải phim thành công nhưng Slicer không nhận diện được file "
            "DICOM nào bên trong. ZIP có thể bị hỏng — thử tải lại phim.",
        )
    DICOMUtils.loadPatientByUID(patient_uids[0])


def _import_and_load(zip_bytes):
    tmp_dir = tempfile.mkdtemp(prefix="dentai_scan_")
    try:
        zip_path = f"{tmp_dir}/original.zip"
        with open(zip_path, "wb") as f:
            f.write(zip_bytes)
        try:
            with zipfile.ZipFile(zip_path) as zf:
                zf.extractall(tmp_dir)
        except zipfile.BadZipFile:
            _fail(
                "dentAI — file phim bị hỏng",
                "Tải xong nhưng ZIP không mở được — có thể mạng bị ngắt giữa "
                'chừng. Quay lại trang web và bấm lại "Mở phim DICOM".',
            )

        slicer.util.showStatusMessage("dentAI: đang mở phim ...", 5000)
        slicer.app.processEvents()
        try:
            # Dùng DB TẠM (KHÔNG phải slicer.dicomDatabase — kho DICOM vĩnh viễn của
            # máy) để db.patients() sau importDicom() CHỈ chứa đúng phim vừa tải, chứ
            # không cộng dồn các lần mở trước — nếu không, loadPatientByUID(patients[0])
            # có thể nạp NHẦM bệnh nhân của lần trước.
            with DICOMUtils.TemporaryDICOMDatabase() as db:
                _import_from_db(tmp_dir, db)
        except AttributeError:
            # Bản Slicer đang dùng không có TemporaryDICOMDatabase — fallback kho
            # vĩnh viễn (xác nhận thật trên máy có Slicer, 2026-08-20).
            _import_from_db(tmp_dir, slicer.dicomDatabase)
    except SystemExit:
        raise
    except Exception as e:
        _fail(
            "dentAI — lỗi khi nạp phim vào Slicer",
            f"Tải phim thành công nhưng nạp vào Slicer thất bại.\nChi tiết: {e}",
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def main():
    _check_single_instance()
    token, server = _parse_target()
    zip_bytes = _download_zip(token, server)
    _import_and_load(zip_bytes)
    slicer.util.showStatusMessage("dentAI: đã mở phim.", 5000)


if __name__ == "__main__":
    main()
