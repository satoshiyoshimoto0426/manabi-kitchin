#!/usr/bin/env python3
"""Build the ManabiOps 5-minute introduction video.

Combines AI-generated scene images + TTS narrations + title cards + BGM
into a single 1920x1080 mp4. Uses Pillow for title cards (Japanese text via
Noto Sans CJK) and ffmpeg for final composition.
"""
from __future__ import annotations
import subprocess, json, shutil, os, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "dist/video/assets"
IMG = ASSETS / "images"
AUD = ASSETS / "audio"
WORK = ROOT / "dist/video/work"
OUT_DIR = ROOT / "dist/video"
WORK.mkdir(parents=True, exist_ok=True)

W, H = 1920, 1080
FPS = 30

# --- Japanese fonts ---
FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc"
FONT_REG  = "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc"

COLOR_BRAND = (46, 125, 50)
COLOR_BRAND_DARK = (27, 94, 32)
COLOR_ACCENT = (245, 124, 0)
COLOR_CREAM = (255, 253, 247)
COLOR_TEXT = (44, 44, 44)
COLOR_WHITE = (255, 255, 255)


def ffprobe_duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def load_font(size: int, bold=True) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD if bold else FONT_REG
    return ImageFont.truetype(path, size)


def draw_text(draw, xy, text, font, fill, stroke_width=0, stroke_fill=None, anchor="la"):
    draw.text(xy, text, font=font, fill=fill,
              stroke_width=stroke_width, stroke_fill=stroke_fill, anchor=anchor)


def make_gradient_bg(color1, color2, w=W, h=H, vertical=False) -> Image.Image:
    img = Image.new("RGB", (w, h), color1)
    px = img.load()
    for i in range(h if vertical else w):
        t = i / (h if vertical else w)
        r = int(color1[0] * (1 - t) + color2[0] * t)
        g = int(color1[1] * (1 - t) + color2[1] * t)
        b = int(color1[2] * (1 - t) + color2[2] * t)
        for j in range(w if vertical else h):
            if vertical:
                px[j, i] = (r, g, b)
            else:
                px[i, j] = (r, g, b)
    return img


def base_scene(bg_image_path: Path, darken=0.35) -> Image.Image:
    """Load scene image, resize to fill 1920x1080, and darken with semi-transparent overlay."""
    src = Image.open(bg_image_path).convert("RGB")
    # Cover fit
    sw, sh = src.size
    ratio = max(W / sw, H / sh)
    nw, nh = int(sw * ratio), int(sh * ratio)
    src = src.resize((nw, nh), Image.LANCZOS)
    left = (nw - W) // 2
    top = (nh - H) // 2
    canvas = src.crop((left, top, left + W, top + H))
    # Darken overlay for text legibility
    ov = Image.new("RGB", (W, H), (0, 0, 0))
    canvas = Image.blend(canvas, ov, darken)
    return canvas


def draw_title_card(title: str, subtitle: str = "", tag: str = "") -> Image.Image:
    img = make_gradient_bg((232, 245, 233), (255, 243, 224))  # brand-green → warm-orange
    d = ImageDraw.Draw(img)
    # Accent bar
    d.rectangle([(140, 440), (175, 640)], fill=COLOR_ACCENT)
    f_tag = load_font(44, True)
    f_title = load_font(120, True)
    f_sub = load_font(60, True)
    if tag:
        draw_text(d, (200, 430), tag, f_tag, COLOR_BRAND_DARK)
    draw_text(d, (200, 490), title, f_title, COLOR_BRAND_DARK)
    if subtitle:
        draw_text(d, (200, 650), subtitle, f_sub, COLOR_TEXT)
    # Footer
    f_foot = load_font(28, True)
    draw_text(d, (W - 60, H - 50), "ManabiOps", f_foot, COLOR_BRAND_DARK, anchor="ra")
    return img


def scene_image_with_caption(bg_path: Path, headline: str, sub: str = "",
                             darken: float = 0.45) -> Image.Image:
    img = base_scene(bg_path, darken=darken)
    d = ImageDraw.Draw(img)
    # Dark gradient bar at bottom for caption legibility
    bar = Image.new("RGBA", (W, 420), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bar)
    for y in range(420):
        alpha = int(255 * (y / 420) * 0.75)
        bd.rectangle([(0, y), (W, y + 1)], fill=(0, 0, 0, alpha))
    img = img.convert("RGBA")
    img.alpha_composite(bar, (0, H - 420))
    img = img.convert("RGB")
    d = ImageDraw.Draw(img)
    f_head = load_font(96, True)
    f_sub = load_font(52, True)
    draw_text(d, (120, H - 330), headline, f_head, COLOR_WHITE,
              stroke_width=3, stroke_fill=(0, 0, 0))
    if sub:
        draw_text(d, (120, H - 180), sub, f_sub, COLOR_ACCENT,
                  stroke_width=2, stroke_fill=(0, 0, 0))
    return img


def draw_logo_card(title="ManabiOps", tagline1="こども食堂の運営を、LINEひとつで。",
                   tagline2="事務はAIに、想いは人に。") -> Image.Image:
    img = make_gradient_bg((200, 230, 201), (255, 224, 178))
    d = ImageDraw.Draw(img)
    f_logo = load_font(220, True)
    f_t1 = load_font(56, True)
    f_t2 = load_font(72, True)
    # Center the logo
    draw_text(d, (W // 2, 350), title, f_logo, COLOR_BRAND_DARK, anchor="mm")
    # Underline
    d.rectangle([(W // 2 - 260, 490), (W // 2 + 260, 500)], fill=COLOR_ACCENT)
    draw_text(d, (W // 2, 590), tagline1, f_t1, COLOR_TEXT, anchor="mm")
    draw_text(d, (W // 2, 760), tagline2, f_t2, COLOR_ACCENT, anchor="mm")
    f_foot = load_font(32, True)
    draw_text(d, (W // 2, 920), "5分で分かる ManabiOps", f_foot, COLOR_BRAND_DARK, anchor="mm")
    return img


def draw_stats_card() -> Image.Image:
    img = make_gradient_bg((255, 253, 247), (232, 245, 233))
    d = ImageDraw.Draw(img)
    f_big = load_font(260, True)
    f_label = load_font(68, True)
    f_sub = load_font(48, True)
    draw_text(d, (W // 2, 200), "月 8 時間", f_label, COLOR_TEXT, anchor="mm")
    draw_text(d, (W // 2, 300), "の事務作業を", f_sub, COLOR_TEXT, anchor="mm")
    # Arrow
    f_arrow = load_font(160, True)
    draw_text(d, (W // 2, 540), "↓", f_arrow, COLOR_ACCENT, anchor="mm")
    draw_text(d, (W // 2, 770), "月 30 分", f_big, COLOR_ACCENT, anchor="mm")
    draw_text(d, (W // 2, 980), "LINEに送るだけ。", f_sub, COLOR_BRAND_DARK, anchor="mm")
    return img


def draw_outro() -> Image.Image:
    img = make_gradient_bg((232, 245, 233), (255, 243, 224))
    d = ImageDraw.Draw(img)
    f_big = load_font(96, True)
    f_mid = load_font(64, True)
    f_sm = load_font(36, True)
    draw_text(d, (W // 2, 300), "ManabiOps", f_big, COLOR_BRAND_DARK, anchor="mm")
    draw_text(d, (W // 2, 450), "事務はAIに、想いは人に。", f_mid, COLOR_ACCENT, anchor="mm")
    draw_text(d, (W // 2, 650), "📖 機能説明書 docs/features/ 10冊公開中", f_sm, COLOR_TEXT, anchor="mm")
    draw_text(d, (W // 2, 730), "⚙ セットアップガイド docs/setup-guide/ 15章", f_sm, COLOR_TEXT, anchor="mm")
    draw_text(d, (W // 2, 880), "学び舎キッチン / 2026年4月", f_sm, (107, 107, 107), anchor="mm")
    return img


# ============================================================
# Build scenes as (image, audio_path, duration_override) tuples
# ============================================================

def save(img: Image.Image, name: str) -> Path:
    p = WORK / f"{name}.png"
    img.save(p, "PNG")
    return p


def build():
    # Pre-render frames
    logo = save(draw_logo_card(), "00_logo")
    stats = save(draw_stats_card(), "00_stats")
    outro = save(draw_outro(), "99_outro")

    scene1a = save(scene_image_with_caption(
        IMG / "scene1_kitchen.png",
        "こども食堂の、大切な時間。",
        "毎月たくさんの写真、領収書、手書き名簿……"), "s1a")
    scene1b = save(scene_image_with_caption(
        IMG / "scene1_overwhelmed.png",
        "月 8 時間、事務作業に追われる。",
        "本来のこども対応に、使えない——"), "s1b")

    scene2 = save(scene_image_with_caption(
        IMG / "scene2_logo.png",
        "ManabiOps（マナビオプス）",
        "LINEに送るだけ。AIが下書き、人が承認。", darken=0.3), "s2a")

    scene3 = save(scene_image_with_caption(
        IMG / "scene3_line.png",
        "機能① 経理自動化",
        "領収書 → OCR → 勘定科目 → 承認 → Google Sheets", darken=0.4), "s3")

    scene4 = save(scene_image_with_caption(
        IMG / "scene4_encrypt.png",
        "機能② 参加者管理",
        "手書き名簿 → ハッシュ化 → AES-256 暗号化 → Firestore", darken=0.4), "s4")

    scene5 = save(scene_image_with_caption(
        IMG / "scene5_instagram.png",
        "機能③ SNS投稿",
        "自動顔ぼかし → リール編集 → 承認 → Instagram自動投稿", darken=0.4), "s5")

    scene6 = save(scene_image_with_caption(
        IMG / "scene6_celebrate.png",
        "月 ¥500〜¥3,000。最短 1 日で導入。",
        "事務はAIに、想いは人に。", darken=0.35), "s6")

    # Scene timeline: (image, audio, min_duration)
    scenes = [
        (logo, None, 2.5),                          # title card
        (scene1a, AUD / "scene1.mp3", 0),           # narration 20.5s
        (scene1b, None, 3.0),                       # dramatic pause (muted)
        (scene2, AUD / "scene2.mp3", 0),            # 24.5s
        (stats, None, 2.5),                         # big numbers
        (scene3, AUD / "scene3.mp3", 0),            # 37.7s
        (scene4, AUD / "scene4.mp3", 0),            # 29.6s
        (scene5, AUD / "scene5.mp3", 0),            # 42.7s
        (scene6, AUD / "scene6.mp3", 0),            # 51.7s
        (outro, None, 3.5),
    ]

    # For each scene make a short clip (image + audio or silence)
    segs = []
    total = 0.0
    for i, (img, aud, min_d) in enumerate(scenes):
        seg = WORK / f"seg_{i:02d}.mp4"
        if aud is not None:
            d = ffprobe_duration(aud) + 0.4  # small tail
            cmd = [
                "ffmpeg", "-y", "-loop", "1", "-i", str(img),
                "-i", str(aud),
                "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
                "-filter_complex",
                f"[0:v]scale={W}:{H},fps={FPS},format=yuv420p,"
                f"zoompan=z='min(zoom+0.0008,1.06)':d={int(d*FPS)}:s={W}x{H}:fps={FPS}[v];"
                f"[1:a]apad[a1];[2:a][a1]amix=inputs=2:duration=first:weights='0 1'[a]",
                "-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(d), "-shortest", str(seg),
            ]
        else:
            d = min_d
            cmd = [
                "ffmpeg", "-y", "-loop", "1", "-i", str(img),
                "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
                "-filter_complex",
                f"[0:v]scale={W}:{H},fps={FPS},format=yuv420p,"
                f"zoompan=z='min(zoom+0.0008,1.06)':d={int(d*FPS)}:s={W}x{H}:fps={FPS}[v]",
                "-map", "[v]", "-map", "1:a",
                "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(d), "-shortest", str(seg),
            ]
        print(f"  🎬 seg {i}: {d:.2f}s", flush=True)
        subprocess.run(cmd, check=True, capture_output=True)
        segs.append(seg)
        total += d

    # Build concat list
    concat_txt = WORK / "concat.txt"
    concat_txt.write_text("\n".join(f"file '{s}'" for s in segs))

    # Final concatenation with BGM (simple generated sine pad as fallback)
    out = OUT_DIR / "ManabiOps_紹介動画.mp4"
    # Generate soft ambient bgm with ffmpeg (harmonic triad over entire duration)
    bgm = WORK / "bgm.m4a"
    subprocess.run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"sine=frequency=261.63:duration={total}",  # C
        "-f", "lavfi", "-i", f"sine=frequency=329.63:duration={total}",  # E
        "-f", "lavfi", "-i", f"sine=frequency=392.00:duration={total}",  # G
        "-filter_complex",
        "[0:a]volume=0.05[a0];[1:a]volume=0.04[a1];[2:a]volume=0.04[a2];"
        "[a0][a1][a2]amix=inputs=3,atempo=1.0,afade=t=in:st=0:d=2,"
        f"afade=t=out:st={max(total-3,0):.2f}:d=3[a]",
        "-map", "[a]", "-c:a", "aac", "-b:a", "128k", str(bgm)
    ], check=True, capture_output=True)

    # Concatenate segments (re-encode to merge cleanly)
    concatted = WORK / "concatted.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_txt),
        "-c", "copy", str(concatted)
    ], check=True, capture_output=True)

    # Mix narration with BGM
    subprocess.run([
        "ffmpeg", "-y",
        "-i", str(concatted),
        "-i", str(bgm),
        "-filter_complex",
        "[0:a]volume=1.1[narr];[1:a]volume=0.8[mus];"
        "[narr][mus]amix=inputs=2:duration=first:dropout_transition=2[aout]",
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        str(out)
    ], check=True, capture_output=True)

    print(f"\n✅ Final video: {out}")
    print(f"   {out.stat().st_size // 1024 // 1024} MB, ~{total:.1f}s")


if __name__ == "__main__":
    build()
