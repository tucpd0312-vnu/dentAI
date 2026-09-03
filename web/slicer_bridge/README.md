# dentAI Slicer Bridge

Cầu nối giữa nút **"Mở phim DICOM"** trên web dentAI và **3D Slicer** trên máy bác sĩ.
Xem đặc tả đầy đủ: [`../.claude/PLAN_3D_CANINE.md`](../.claude/PLAN_3D_CANINE.md) §6.

Đây **không phải** một Extension của Slicer — chỉ là một file Python (`open_scan.py`)
được Slicer chạy tươi mỗi lần qua `--python-script`, cộng với script đăng ký scheme
`dentai://` ở tầng hệ điều hành (mỗi máy chạy đúng một lần).

## Cài đặt (chạy một lần mỗi máy)

Chọn đúng hệ điều hành của máy bác sĩ, chạy từ thư mục này:

| OS | Lệnh |
|----|------|
| Windows | `powershell -ExecutionPolicy Bypass -File install_windows.ps1` |
| Linux | `./install_linux.sh` |
| macOS | `./install_macos.sh` ⚠️ chưa kiểm chứng trên máy thật |

Mỗi script tự dò đường dẫn Slicer đã cài; nếu không tìm thấy, truyền tay:

```bash
./install_linux.sh /path/to/Slicer
```
```powershell
powershell -ExecutionPolicy Bypass -File install_windows.ps1 -SlicerPath "C:\Program Files\Slicer 5.10.0\Slicer.exe"
```

Script cài đặt sao chép `open_scan.py` vào vị trí cố định của người dùng rồi mới
đăng ký `dentai://`. Vì vậy có thể xóa thư mục ZIP đã giải nén sau khi cài. Khi tải
Bridge phiên bản mới, chạy lại script một lần để cập nhật bản đã cài.

## Kiểm tra đã đăng ký đúng chưa

Gõ vào trình duyệt (hoặc chạy `xdg-open`/`open` tương ứng OS):

```
dentai://open?token=test&server=http://localhost:8002
```

Slicer phải khởi động và hiện dialog lỗi **"Server từ chối yêu cầu (HTTP 404)"** —
đó là kết quả ĐÚNG (token `test` không tồn tại thật), nghĩa là:
1. Hệ điều hành đã trỏ đúng scheme `dentai://` tới Slicer.
2. Slicer đã chạy `open_scan.py` tới tận bước gọi mạng.
3. Lỗi hiện ra bằng dialog Qt rõ ràng, không phải traceback thô hay treo máy.

Nếu không có gì xảy ra khi bấm link thật từ trang web (nút "Mở phim DICOM"), trình
duyệt có thể đã chặn hộp thoại "Mở 3D Slicer?" — kiểm tra thanh địa chỉ có icon
chặn popup không, hoặc thử trình duyệt khác.

## Khi nào cần cài lại

- Cài Slicer ở đường dẫn mới / gỡ rồi cài lại → chạy lại script cài đặt.
- Đổi máy chủ dentAI (đổi domain/IP) → **không cần** cài lại — `server=` được server
  nhúng sẵn trong link `dentai://` mỗi lần bấm, `open_scan.py` không hard-code địa chỉ.

## Giới hạn đã biết

- Trình duyệt không bao giờ báo cho JS biết scheme handler có chạy hay không — trang
  web không thể tự xác nhận "đã mở thành công", xem PLAN_3D_CANINE.md §5.1.
- Lượt **Kiểm tra mở Slicer** dùng token `test` và không giữ khóa mở phim. Lock của
  bản Bridge cũ hoặc tiến trình đã thoát được tự dọn ở lần mở tiếp theo; khi tải/nạp
  phim lỗi, cửa sổ hiện tại cũng nhả lock để người dùng thử lại ngay.
- Bấm "Mở phim DICOM" khi đã có một Slicer khác đang mở phim từ dentAI → cửa sổ Slicer
  mới vẫn nháy lên một chút rồi dừng kèm thông báo, KHÔNG tự chuyển phim sang cửa sổ
  cũ (chỉ tránh tải phim thừa/chất RAM, không phải bring-to-front thật). Nhận biết qua
  lock file `%TEMP%/dentai_slicer_open.lock`.
- `open_scan.py` dùng `DICOMUtils.TemporaryDICOMDatabase()` để tránh nạp nhầm bệnh
  nhân từ lần mở trước còn tồn trong kho DICOM vĩnh viễn của Slicer — API này **chưa
  được kiểm chứng trên máy Slicer thật** (dev machine không cài Slicer). Nếu báo lỗi
  `AttributeError` liên quan `TemporaryDICOMDatabase`, xem ghi chú trong
  `open_scan.py` để đổi sang `slicer.dicomDatabase`.
- Nhánh macOS dựng app bundle thủ công, chưa test trên máy macOS thật.
