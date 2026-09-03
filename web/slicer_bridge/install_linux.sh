#!/usr/bin/env bash
# Đăng ký scheme dentai:// trên Linux, trỏ tới open_scan.py chạy trong 3D Slicer.
# Chạy MỘT LẦN cho mỗi máy bác sĩ trước khi nút "Mở phim DICOM" trên web dùng được.
# Không cần sudo — chỉ ghi vào $HOME (~/.local/share/applications).
#
# Cách dùng:
#   ./install_linux.sh                      # tự dò lệnh `Slicer` trong PATH
#   ./install_linux.sh /path/to/Slicer       # chỉ định thẳng
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_OPEN_SCAN_PY="$SCRIPT_DIR/open_scan.py"

if [[ ! -f "$SOURCE_OPEN_SCAN_PY" ]]; then
    echo "Không tìm thấy open_scan.py cạnh script này ($SOURCE_OPEN_SCAN_PY)." >&2
    exit 1
fi

SLICER_PATH="${1:-}"
if [[ -z "$SLICER_PATH" ]]; then
    SLICER_PATH="$(command -v Slicer || true)"
fi
if [[ -z "$SLICER_PATH" ]]; then
    echo "Không tự tìm thấy lệnh 'Slicer' trong PATH." >&2
    echo "Chạy lại kèm đường dẫn: $0 /đường/dẫn/tới/Slicer" >&2
    exit 1
fi
if [[ ! -x "$SLICER_PATH" ]]; then
    echo "Không thực thi được: $SLICER_PATH" >&2
    exit 1
fi

INSTALL_DIR="$HOME/.local/share/dentai-slicer-bridge"
mkdir -p "$INSTALL_DIR"
OPEN_SCAN_PY="$INSTALL_DIR/open_scan.py"
cp "$SOURCE_OPEN_SCAN_PY" "$OPEN_SCAN_PY"

APPS_DIR="$HOME/.local/share/applications"
mkdir -p "$APPS_DIR"
DESKTOP_FILE="$APPS_DIR/dentai-slicer.desktop"

# %u — nơi hệ thống chèn nguyên URL dentai://... khi người dùng bấm link.
# NoDisplay=true — đây là handler nội bộ, không phải app để bác sĩ tự bấm mở.
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=dentAI (mở trong 3D Slicer)
Comment=Handler nội bộ cho scheme dentai:// — không tự bấm chạy tay
Exec=$SLICER_PATH --no-splash --python-script $OPEN_SCAN_PY %u
Terminal=false
NoDisplay=true
MimeType=x-scheme-handler/dentai;
EOF
chmod +x "$DESKTOP_FILE"

update-desktop-database "$APPS_DIR" 2>/dev/null || true
xdg-mime default dentai-slicer.desktop x-scheme-handler/dentai

echo ""
echo "Đã đăng ký dentai:// — lệnh sẽ chạy khi bấm link:"
echo "  $SLICER_PATH --no-splash --python-script $OPEN_SCAN_PY %u"
echo "Bridge đã được cài tại: $INSTALL_DIR"
echo ""
echo "Kiểm tra: xdg-open 'dentai://open?token=test&server=http://localhost:8002'"
echo "Slicer sẽ khởi động và báo lỗi 'Server từ chối yêu cầu (HTTP 404)' — ĐÚNG như"
echo "mong đợi (token 'test' không tồn tại), nghĩa là scheme đã trỏ đúng và"
echo "open_scan.py đã chạy tới tận bước gọi server."
