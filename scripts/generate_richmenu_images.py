#!/usr/bin/env python3
"""Generate LINE rich menu images deterministically using Pillow.

Output: 2500x1686 PNG images for main / owner / activity_day menus.
Why Pillow (in addition to AI versions)? Guaranteed correct Japanese text,
pixel-perfect cell boundaries that match the LINE Messaging API areas[] config.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "deliverables/richmenu"
OUT.mkdir(parents=True, exist_ok=True)

# LINE recommended size for full rich menu
W, H = 2500, 1686

FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc"
FONT_REG  = "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc"

# Brand palette
BG = (255, 253, 247)             # cream
BRAND = (46, 125, 50)
BRAND_DARK = (27, 94, 32)
ACCENT = (245, 124, 0)
GREEN_LIGHT = (232, 245, 233)
ORANGE_LIGHT = (255, 243, 224)
BLUE_LIGHT = (227, 242, 253)
YELLOW_LIGHT = (255, 248, 225)
PEACH_LIGHT = (255, 235, 222)
TEXT_DARK = (44, 44, 44)
DIVIDER = (200, 200, 200)

def font(size, bold=True):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

def draw_centered(d, xy, text, fnt, fill, anchor="mm"):
    d.text(xy, text, font=fnt, fill=fill, anchor=anchor)

def cell(img, x, y, w, h, bg, icon, label_main, label_sub="", text_color=BRAND_DARK):
    d = ImageDraw.Draw(img)
    # Cell background
    d.rectangle([x, y, x + w, y + h], fill=bg)
    # Soft inner border
    d.rectangle([x + 8, y + 8, x + w - 8, y + h - 8], outline=(255, 255, 255, 180), width=3)
    # Icon (emoji rendered as large text - works because Noto CJK has emoji-like coverage,
    # but for true emoji compatibility we draw a colored circle behind the emoji)
    cx, cy = x + w // 2, y + h // 2
    # Icon circle background
    icon_r = min(w, h) // 5
    d.ellipse([cx - icon_r, cy - icon_r - 90, cx + icon_r, cy + icon_r - 90],
              fill=(255, 255, 255), outline=text_color, width=4)
    # Icon (emoji)
    f_icon = font(140, True)
    draw_centered(d, (cx, cy - 90), icon, f_icon, text_color, anchor="mm")
    # Main label
    f_main = font(72, True)
    draw_centered(d, (cx, cy + 90), label_main, f_main, text_color, anchor="mm")
    # Sub label
    if label_sub:
        f_sub = font(48, True)
        draw_centered(d, (cx, cy + 170), label_sub, f_sub, TEXT_DARK, anchor="mm")


def make_grid_2x3(cells, out_name, header_text=""):
    """cells: 6 dicts {bg, icon, label_main, label_sub}"""
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    cw, ch = W // 3, H // 2
    for i, c in enumerate(cells):
        col = i % 3
        row = i // 3
        cell(img, col * cw, row * ch, cw, ch,
             c.get("bg", GREEN_LIGHT), c["icon"], c["label_main"], c.get("label_sub", ""),
             c.get("text_color", BRAND_DARK))
    # Dividers
    for x in [cw, cw * 2]:
        d.line([(x, 0), (x, H)], fill=DIVIDER, width=2)
    d.line([(0, ch), (W, ch)], fill=DIVIDER, width=2)
    out = OUT / out_name
    img.save(out, "PNG", optimize=True)
    print(f"✅ {out} ({out.stat().st_size // 1024} KB)")
    return out


def make_grid_2x2(cells, out_name):
    """cells: 4 dicts. Larger buttons for activity day."""
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    cw, ch = W // 2, H // 2
    for i, c in enumerate(cells):
        col = i % 2
        row = i // 2
        cell(img, col * cw, row * ch, cw, ch,
             c.get("bg", GREEN_LIGHT), c["icon"], c["label_main"], c.get("label_sub", ""),
             c.get("text_color", BRAND_DARK))
    d.line([(cw, 0), (cw, H)], fill=DIVIDER, width=3)
    d.line([(0, ch), (W, ch)], fill=DIVIDER, width=3)
    out = OUT / out_name
    img.save(out, "PNG", optimize=True)
    print(f"✅ {out} ({out.stat().st_size // 1024} KB)")
    return out


# === Main menu (Staff/Owner default) ===
main_cells = [
    {"icon": "🧾", "label_main": "領収書", "label_sub": "送信", "bg": GREEN_LIGHT},
    {"icon": "📋", "label_main": "名簿撮影", "label_sub": "送信", "bg": ORANGE_LIGHT},
    {"icon": "📷", "label_main": "活動写真", "label_sub": "送信", "bg": GREEN_LIGHT},
    {"icon": "📊", "label_main": "月次サマリー", "label_sub": "を見る", "bg": ORANGE_LIGHT},
    {"icon": "📮", "label_main": "承認待ち", "label_sub": "確認", "bg": GREEN_LIGHT},
    {"icon": "⚙", "label_main": "管理画面", "label_sub": "／ヘルプ", "bg": ORANGE_LIGHT},
]
make_grid_2x3(main_cells, "main_menu.png")

# === Owner menu ===
owner_cells = [
    {"icon": "👥", "label_main": "メンバー", "label_sub": "管理", "bg": ORANGE_LIGHT, "text_color": ACCENT},
    {"icon": "📊", "label_main": "詳細ダッシュ", "label_sub": "ボード", "bg": BLUE_LIGHT, "text_color": (21, 101, 192)},
    {"icon": "💰", "label_main": "経費レポート", "label_sub": "出力", "bg": ORANGE_LIGHT, "text_color": ACCENT},
    {"icon": "📱", "label_main": "SNS投稿", "label_sub": "履歴", "bg": BLUE_LIGHT, "text_color": (21, 101, 192)},
    {"icon": "⚠", "label_main": "アラート", "label_sub": "一覧", "bg": ORANGE_LIGHT, "text_color": ACCENT},
    {"icon": "🔄", "label_main": "通常メニュー", "label_sub": "へ戻る", "bg": GREEN_LIGHT, "text_color": BRAND_DARK},
]
make_grid_2x3(owner_cells, "owner_menu.png")

# === Activity day menu (2x2 large buttons) ===
activity_cells = [
    {"icon": "🍚", "label_main": "食材", "label_sub": "買い出し", "bg": GREEN_LIGHT},
    {"icon": "📋", "label_main": "出席名簿", "label_sub": "撮影", "bg": ORANGE_LIGHT},
    {"icon": "📷", "label_main": "活動写真", "label_sub": "送信", "bg": YELLOW_LIGHT, "text_color": ACCENT},
    {"icon": "✨", "label_main": "終了報告", "label_sub": "送信", "bg": PEACH_LIGHT, "text_color": ACCENT},
]
make_grid_2x2(activity_cells, "activity_menu.png")

print("\n🎨 All 3 rich menu images generated successfully.")
