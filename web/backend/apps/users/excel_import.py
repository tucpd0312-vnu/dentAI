"""Đọc bảng tài khoản Excel bằng thư viện chuẩn Python.

Chỉ cần phần dữ liệu ô của sheet đầu tiên nên không kéo cả pandas/openpyxl vào
image backend. XLSX vốn là ZIP chứa XML; bộ đọc nhỏ này hỗ trợ hai kiểu chuỗi mà
Excel/LibreOffice/Google Sheets thường xuất: shared string và inline string.
"""
from __future__ import annotations

import csv
import io
import posixpath
import re
import unicodedata
import zipfile
from xml.etree import ElementTree as ET


class WorkbookError(ValueError):
    pass


def _plain(value: object) -> str:
    return " ".join(str(value or "").strip().split())


def _key(value: object) -> str:
    text = unicodedata.normalize("NFD", _plain(value).lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("đ", "d")
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


HEADER_ALIASES = {
    "username": "username", "ten_dang_nhap": "username", "tai_khoan": "username",
    "email": "email", "thu_dien_tu": "email",
    "password": "password", "mat_khau": "password",
    "role": "role", "vai_tro": "role",
    "first_name": "first_name", "ten": "first_name",
    "last_name": "last_name", "ho": "last_name", "ho_dem": "last_name",
    "phone": "phone", "so_dien_thoai": "phone", "sdt": "phone",
}

ROLE_ALIASES = {
    "admin": "admin", "quan_tri_vien": "admin", "quan_tri": "admin",
    "doctor": "doctor", "bac_si": "doctor", "giang_vien": "doctor",
    "student": "student", "sinh_vien": "student",
    "patient": "patient", "benh_nhan": "patient",
    "receptionist": "receptionist", "le_tan": "receptionist",
}

REQUIRED_HEADERS = ("username", "email", "password", "role")


def _column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference.upper())
    if not letters:
        return 0
    value = 0
    for char in letters.group(0):
        value = value * 26 + ord(char) - 64
    return value - 1


def _xlsx_rows(content: bytes) -> list[list[str]]:
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        raise WorkbookError("Tệp .xlsx không hợp lệ hoặc đã bị hỏng.") from exc

    with archive:
        try:
            workbook = ET.fromstring(archive.read("xl/workbook.xml"))
            rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        except (KeyError, ET.ParseError) as exc:
            raise WorkbookError("Không đọc được cấu trúc workbook Excel.") from exc

        rel_map = {
            rel.attrib.get("Id", ""): rel.attrib.get("Target", "")
            for rel in rels
        }
        sheets = workbook.findall(".//{*}sheet")
        if not sheets:
            raise WorkbookError("Workbook không có sheet dữ liệu.")
        relation_id = sheets[0].attrib.get(
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id", ""
        )
        target = rel_map.get(relation_id, "worksheets/sheet1.xml")
        sheet_path = posixpath.normpath(posixpath.join("xl", target.lstrip("/")))
        if sheet_path.startswith("xl/xl/"):
            sheet_path = sheet_path[3:]

        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            try:
                root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
                shared = ["".join(node.text or "" for node in item.findall(".//{*}t")) for item in root]
            except ET.ParseError as exc:
                raise WorkbookError("Không đọc được bảng chuỗi trong workbook.") from exc

        try:
            sheet = ET.fromstring(archive.read(sheet_path))
        except (KeyError, ET.ParseError) as exc:
            raise WorkbookError("Không đọc được sheet đầu tiên của workbook.") from exc

        rows: list[list[str]] = []
        for row in sheet.findall(".//{*}sheetData/{*}row"):
            values: dict[int, str] = {}
            for cell in row.findall("{*}c"):
                index = _column_index(cell.attrib.get("r", "A1"))
                cell_type = cell.attrib.get("t", "")
                if cell_type == "inlineStr":
                    value = "".join(node.text or "" for node in cell.findall(".//{*}t"))
                else:
                    node = cell.find("{*}v")
                    raw = node.text if node is not None and node.text is not None else ""
                    if cell_type == "s" and raw:
                        try:
                            value = shared[int(raw)]
                        except (ValueError, IndexError) as exc:
                            raise WorkbookError("Workbook chứa tham chiếu chuỗi không hợp lệ.") from exc
                    else:
                        value = raw
                values[index] = _plain(value)
            if values:
                rows.append([values.get(i, "") for i in range(max(values) + 1)])
        return rows


def _csv_rows(content: bytes) -> list[list[str]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise WorkbookError("Tệp CSV phải dùng mã hoá UTF-8.") from exc
    return [[_plain(value) for value in row] for row in csv.reader(io.StringIO(text))]


def parse_account_workbook(filename: str, content: bytes, max_rows: int = 500) -> list[dict[str, str]]:
    lower = filename.lower()
    if lower.endswith(".xlsx"):
        rows = _xlsx_rows(content)
    elif lower.endswith(".csv"):
        rows = _csv_rows(content)
    else:
        raise WorkbookError("Chỉ chấp nhận tệp Excel .xlsx hoặc CSV .csv.")

    rows = [row for row in rows if any(_plain(value) for value in row)]
    if not rows:
        raise WorkbookError("Tệp không có dữ liệu.")

    headers = [HEADER_ALIASES.get(_key(value), "") for value in rows[0]]
    missing = [name for name in REQUIRED_HEADERS if name not in headers]
    if missing:
        raise WorkbookError(
            "Thiếu cột bắt buộc: " + ", ".join(missing) + "."
        )
    if len(rows) - 1 > max_rows:
        raise WorkbookError(f"Mỗi lần chỉ nhập tối đa {max_rows} tài khoản.")

    output: list[dict[str, str]] = []
    for excel_row, values in enumerate(rows[1:], start=2):
        item = {"_row": str(excel_row)}
        for index, field in enumerate(headers):
            if field:
                item[field] = _plain(values[index] if index < len(values) else "")
        if not any(item.get(field) for field in REQUIRED_HEADERS):
            continue
        role_key = _key(item.get("role", ""))
        item["role"] = ROLE_ALIASES.get(role_key, item.get("role", "").lower())
        output.append(item)
    if not output:
        raise WorkbookError("Tệp chưa có dòng tài khoản nào.")
    return output
