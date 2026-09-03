<#
.SYNOPSIS
    Đăng ký scheme dentai:// trên Windows, trỏ tới open_scan.py chạy trong 3D Slicer.
    Chạy MỘT LẦN cho mỗi máy bác sĩ trước khi nút "Mở phim DICOM" trên web dùng được.

.DESCRIPTION
    Ghi registry dưới HKCU (KHÔNG phải HKLM) — không cần quyền Administrator, chỉ
    áp dụng cho user hiện tại. Đây là lựa chọn có chủ đích, không phải giới hạn kỹ
    thuật (xem PLAN_3D_CANINE.md §6.1, §6.3).

.PARAMETER SlicerPath
    Đường dẫn tới Slicer.exe. Bỏ trống để tự dò trong Program Files.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File install_windows.ps1
    powershell -ExecutionPolicy Bypass -File install_windows.ps1 -SlicerPath "D:\Slicer 5.10.0\Slicer.exe"
#>
param(
    [string]$SlicerPath
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceOpenScanPy = Join-Path $ScriptDir "open_scan.py"

if (-not (Test-Path $SourceOpenScanPy)) {
    Write-Error "Không tìm thấy open_scan.py cạnh script này ($SourceOpenScanPy)."
    exit 1
}

if (-not $SlicerPath) {
    Write-Host "Không có -SlicerPath, đang dò tìm Slicer.exe trong Program Files..."
    $candidates = @()
    foreach ($base in @("$Env:ProgramFiles", "${Env:ProgramFiles(x86)}")) {
        if ($base) {
            foreach ($folderPattern in @("Slicer*", "3D Slicer*")) {
                $candidates += Get-ChildItem -Path "$base\$folderPattern\Slicer.exe" -ErrorAction SilentlyContinue
            }
        }
    }
    if ($candidates.Count -eq 0) {
        Write-Error (
            "Không tự tìm thấy Slicer.exe. Chạy lại kèm tham số, ví dụ:`n" +
            '  powershell -ExecutionPolicy Bypass -File install_windows.ps1 -SlicerPath "C:\Program Files\Slicer 5.10.0\Slicer.exe"'
        )
        exit 1
    }
    # Nhiều bản Slicer cài song song → lấy bản mới nhất theo tên thư mục.
    $SlicerPath = ($candidates | Sort-Object FullName -Descending)[0].FullName
    Write-Host "Tìm thấy: $SlicerPath"
}

if (-not (Test-Path $SlicerPath)) {
    Write-Error "Đường dẫn Slicer.exe không tồn tại: $SlicerPath"
    exit 1
}

# Chép bridge vào vị trí cố định. Registry không còn trỏ vào Downloads nên người
# dùng có thể xóa thư mục ZIP sau khi cài và chạy lại script để cập nhật Bridge.
$InstallDir = Join-Path $Env:LOCALAPPDATA "DentAI\SlicerBridge"
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
$OpenScanPy = Join-Path $InstallDir "open_scan.py"
Copy-Item -LiteralPath $SourceOpenScanPy -Destination $OpenScanPy -Force

# --python-script (KHÔNG phải --python-code) — --python-code nhiều dòng bị vỡ do
# PowerShell escaping, đã kiểm chứng thực tế trên máy này (PLAN_3D_CANINE.md §6.1
# mục D1). "%1" là chỗ Windows chèn nguyên URL dentai://... khi người dùng bấm link.
$Command = '"' + $SlicerPath + '" --no-splash --python-script "' + $OpenScanPy + '" "%1"'

New-Item -Path "HKCU:\Software\Classes\dentai" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\dentai" -Name "(Default)" -Value "URL:dentAI Protocol"
Set-ItemProperty -Path "HKCU:\Software\Classes\dentai" -Name "URL Protocol" -Value ""

New-Item -Path "HKCU:\Software\Classes\dentai\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\dentai\shell\open\command" -Name "(Default)" -Value $Command

Write-Host ""
Write-Host "Đã đăng ký dentai:// — lệnh sẽ chạy khi bấm link:" -ForegroundColor Green
Write-Host "  $Command"
Write-Host "Bridge đã được cài tại: $InstallDir"
Write-Host ""
Write-Host "Kiểm tra: mở trình duyệt, gõ vào thanh địa chỉ:"
Write-Host "  dentai://open?token=test&server=http://localhost:8002"
Write-Host "Slicer sẽ khởi động và báo lỗi 'Server từ chối yêu cầu (HTTP 404)' — ĐÚNG"
Write-Host "như mong đợi (token 'test' không tồn tại), nghĩa là scheme đã trỏ đúng và"
Write-Host "open_scan.py đã chạy tới tận bước gọi server."
