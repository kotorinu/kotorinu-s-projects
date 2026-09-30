"""月次請求書PDFを作る。

文字として選択・検索できるPDF（画像埋め込みではない）を ReportLab で出力する。
宛先・住所・口座・金額などの個人情報は Git に入れず、プロファイルJSONから読む。

使い方:
  pip install reportlab
  python scripts/invoice/generate_invoice.py --month 2026-09 \
      --profile invoices/profile.local.json --out invoices/out

月を省略すると実行日の月を使う。請求日はその月の末日。
"""

from __future__ import annotations

import argparse
import calendar
import datetime as dt
import json
import sys
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

FONT = "HeiseiMin-W3"
NAVY = (0.1, 0.14, 0.28)
INK = (0.1, 0.1, 0.15)
BODY = (0.25, 0.25, 0.3)
ROW = (0.15, 0.15, 0.2)
SHADE = (0.925, 0.937, 0.949)

LEFT = 62.3622
RIGHT = 532.9134
WIDTH = RIGHT - LEFT

REQUIRED = {
    "invoice_number_suffix",
    "client",
    "issuer",
    "item_label",
    "unit_price",
    "quantity",
    "tax_rate",
    "bank",
}


def yen(n: int) -> str:
    return f"¥{n:,}"


def parse_month(value: str | None) -> tuple[int, int]:
    if not value:
        today = dt.date.today()
        return today.year, today.month
    year, month = value.split("-")
    return int(year), int(month)


def load_profile(path: Path) -> dict:
    profile = json.loads(path.read_text(encoding="utf-8"))
    missing = REQUIRED - profile.keys()
    if missing:
        raise SystemExit(f"プロファイルに不足している項目: {', '.join(sorted(missing))}")
    return profile


def build_invoice(profile: dict, year: int, month: int) -> dict:
    last_day = calendar.monthrange(year, month)[1]
    subtotal = int(profile["unit_price"]) * int(profile["quantity"])
    tax = subtotal * int(profile["tax_rate"]) // 100
    yyyymm = f"{year}{month:02d}"
    return {
        "number": f"{yyyymm}-{profile['invoice_number_suffix']}",
        "date": f"{year}年{month}月{last_day}日",
        "item": profile["item_label"].format(month=month),
        "subtotal": subtotal,
        "tax": tax,
        "total": subtotal + tax,
        "filename": profile.get("filename", "{yyyymm}_請求書_{issuer}.pdf").format(
            yyyymm=yyyymm, issuer=profile["issuer"]["name"].replace(" ", "")
        ),
    }


def draw(c: canvas.Canvas, profile: dict, inv: dict) -> None:
    page_w, _ = A4
    client = profile["client"]
    issuer = profile["issuer"]
    bank = profile["bank"]
    tax_rate = int(profile["tax_rate"])

    def text(x, y, s, size=10, color=BODY, right=False):
        c.setFillColorRGB(*color)
        c.setFont(FONT, size)
        (c.drawRightString if right else c.drawString)(x, y, s)

    c.setFillColorRGB(*NAVY)
    c.rect(0, 819.2126, page_w, 22.67717, stroke=0, fill=1)

    text(LEFT, 742.6772, "請 求 書", 26, INK)
    text(RIGHT, 779.5276, f"請求書番号　{inv['number']}", 10, (0.3, 0.3, 0.35), right=True)
    text(RIGHT, 765.3543, f"請求日　{inv['date']}", 10, (0.3, 0.3, 0.35), right=True)

    # 宛先
    text(LEFT, 705.8268, f"{client['name']}　御中", 13, INK)
    c.setStrokeColorRGB(*NAVY)
    c.setLineWidth(1)
    c.line(LEFT, 701.5748, 283.4646, 701.5748)
    y = 685.9843
    for line in [f"〒{client['postal_code']}", *client["address_lines"], client["contact"]]:
        text(LEFT, y, line)
        y -= 14.1732

    # 発行者
    text(RIGHT, 705.8268, issuer["name"], 12, INK, right=True)
    y = 688.8189
    for line in [f"〒{issuer['postal_code']}", *issuer["address_lines"]]:
        text(RIGHT, y, line, right=True)
        y -= 14.1732

    # ご請求金額
    c.setFillColorRGB(*SHADE)
    c.rect(LEFT, 564.0945, WIDTH, 45.35433, stroke=0, fill=1)
    text(79.37008, 582.5197, "ご請求金額（税込）", 11, (0.2, 0.2, 0.25))
    text(515.9055, 579.685, yen(inv["total"]), 20, INK, right=True)

    # 明細
    c.setFillColorRGB(*NAVY)
    c.rect(LEFT, 504.5669, WIDTH, 25.51181, stroke=0, fill=1)
    header_y = 512.5039
    text(70.86614, header_y, "品目", color=(1, 1, 1))
    text(350, header_y, "数量", color=(1, 1, 1))
    text(415.1969, header_y, "単価", color=(1, 1, 1))
    text(504.4094, header_y, "金額", color=(1, 1, 1))

    rows = [
        (inv["item"], str(profile["quantity"]), yen(int(profile["unit_price"])), yen(inv["subtotal"])),
        (f"消費税（{tax_rate}%）", "", "", yen(inv["tax"])),
    ]
    row_y = 479.0551
    c.setStrokeColorRGB(0.8, 0.8, 0.82)
    for item, qty, unit, amount in rows:
        c.setFillColorRGB(1, 1, 1)
        c.rect(LEFT, row_y, WIDTH, 25.51181, stroke=1, fill=1)
        base = row_y + 7.937
        text(70.86614, base, item, color=ROW)
        if qty:
            c.setFillColorRGB(*ROW)
            c.setFont(FONT, 10)
            c.drawCentredString(360, base, qty)
        if unit:
            text(441.4469, base, unit, color=ROW, right=True)
        text(524.4094, base, amount, color=ROW, right=True)
        row_y -= 25.51181

    # 合計
    text(345.8268, 415.2756, "小計", color=ROW)
    text(521.5748, 415.2756, yen(inv["subtotal"]), color=ROW, right=True)
    text(345.8268, 392.5984, f"消費税（{tax_rate}%）", color=ROW)
    text(521.5748, 392.5984, yen(inv["tax"]), color=ROW, right=True)
    c.setFillColorRGB(*SHADE)
    c.rect(334.4882, 362.8346, 198.4252, 22.67717, stroke=0, fill=1)
    text(345.8268, 369.9213, "合計", 12, ROW)
    text(521.5748, 369.9213, yen(inv["total"]), 12, ROW, right=True)

    # お振込先
    text(LEFT, 334.4882, "お振込先", 11, INK)
    c.setStrokeColorRGB(0.6, 0.6, 0.6)
    c.setLineWidth(0.6)
    c.line(LEFT, 330.2362, 345.8268, 330.2362)
    y = 314.6457
    for line in [
        bank["bank_name"],
        bank["branch"],
        f"{bank['account_type']}　{bank['account_number']}",
        f"口座名義　{bank['account_holder']}",
    ]:
        text(LEFT, y, line, 10, (0.2, 0.2, 0.25))
        y -= 15.5906
    if profile.get("note"):
        text(LEFT, 246.6142, profile["note"], 8.5, (0.4, 0.4, 0.45))

    text(LEFT, 56.69291, f"発行者：{issuer['name']}", 9, (0.3, 0.3, 0.35))
    if profile.get("send_to"):
        text(RIGHT, 56.69291, f"送付先：{profile['send_to']}", 9, (0.3, 0.3, 0.35), right=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="月次請求書PDFを作る")
    parser.add_argument("--month", help="対象月 YYYY-MM（省略時は今月）")
    parser.add_argument("--profile", default="invoices/profile.local.json")
    parser.add_argument("--out", default="invoices/out")
    args = parser.parse_args(argv)

    profile_path = Path(args.profile)
    if not profile_path.exists():
        print(
            f"プロファイルがありません: {profile_path}\n"
            "scripts/invoice/profile.example.json をコピーして値を入れてください。",
            file=sys.stderr,
        )
        return 1

    profile = load_profile(profile_path)
    year, month = parse_month(args.month)
    inv = build_invoice(profile, year, month)

    pdfmetrics.registerFont(UnicodeCIDFont(FONT))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / inv["filename"]
    c = canvas.Canvas(str(out_path), pagesize=A4)
    c.setTitle(f"請求書 {inv['number']}")
    c.setAuthor(profile["issuer"]["name"])
    draw(c, profile, inv)
    c.showPage()
    c.save()
    print(out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
