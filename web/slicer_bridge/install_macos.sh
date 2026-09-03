#!/usr/bin/env bash
# Đăng ký scheme dentai:// trên macOS, trỏ tới open_scan.py chạy trong 3D Slicer.
# Chạy MỘT LẦN cho mỗi máy bác sĩ trước khi nút "Mở phim DICOM" trên web dùng được.
#
# ⚠️ CHƯA kiểm chứng trên máy macOS thật (PLAN_3D_CANINE.md §6.1 chỉ kiểm chứng
# trực tiếp trên Windows) — macOS không có cơ chế đăng ký scheme nhẹ như .desktop
# của Linux, bắt buộc phải có một app bundle thật (LSHandlers trong Info.plist).
# Script này tự dựng một app bundle KHÔNG-UI nhỏ ở ~/Applications rồi đăng ký nó.
# Nếu chạy lỗi, báo lại kèm thông báo lỗi để chỉnh — đây là nhánh ít được test nhất.
#
# Cách dùng:
#   ./install_macos.sh                                          # mặc định /Applications/Slicer.app
#   ./install_macos.sh /path/to/Slicer.app/Contents/MacOS/Slicer  # chỉ định thẳng
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_OPEN_SCAN_PY="$SCRIPT_DIR/open_scan.py"

if [[ ! -f "$SOURCE_OPEN_SCAN_PY" ]]; then
    echo "Không tìm thấy open_scan.py cạnh script này ($SOURCE_OPEN_SCAN_PY)." >&2
    exit 1
fi

SLICER_PATH="${1:-/Applications/Slicer.app/Contents/MacOS/Slicer}"
if [[ ! -x "$SLICER_PATH" ]]; then
    echo "Không tìm thấy Slicer thực thi được tại: $SLICER_PATH" >&2
    echo "Chạy lại kèm đường dẫn: $0 /path/to/Slicer.app/Contents/MacOS/Slicer" >&2
    exit 1
fi

APP_DIR="$HOME/Applications/dentAI Slicer Bridge.app"
CONTENTS="$APP_DIR/Contents"
mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources"
OPEN_SCAN_PY="$CONTENTS/Resources/open_scan.py"
cp "$SOURCE_OPEN_SCAN_PY" "$OPEN_SCAN_PY"

# argv cuối cùng macOS truyền vào app khi mở qua URL scheme là chính URL đó.
cat > "$CONTENTS/MacOS/dentai-bridge" <<EOF
#!/usr/bin/env bash
exec "$SLICER_PATH" --no-splash --python-script "$OPEN_SCAN_PY" "\$@"
EOF
chmod +x "$CONTENTS/MacOS/dentai-bridge"

cat > "$CONTENTS/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>dentai-bridge</string>
    <key>CFBundleIdentifier</key>
    <string>local.dentai.slicerbridge</string>
    <key>CFBundleName</key>
    <string>dentAI Slicer Bridge</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSUIElement</key>
    <true/>
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>local.dentai.slicerbridge</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>dentai</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
PLIST

# Đăng ký lại app bundle với LaunchServices để macOS biết ai xử lý scheme dentai://.
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f "$APP_DIR"

echo ""
echo "Đã tạo và đăng ký: $APP_DIR"
echo "Kiểm tra: open 'dentai://open?token=test&server=http://localhost:8002'"
echo "Slicer sẽ khởi động và báo lỗi 'Server từ chối yêu cầu (HTTP 404)' — ĐÚNG như"
echo "mong đợi (token 'test' không tồn tại), nghĩa là scheme đã trỏ đúng."
echo ""
echo "⚠️  Nhánh macOS chưa được kiểm chứng trên máy thật — báo lại nếu có lỗi."
