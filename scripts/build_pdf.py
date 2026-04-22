#!/usr/bin/env python3
"""Build print-ready PDFs from Markdown docs.

Usage:
  python3 scripts/build_pdf.py

Generates:
  dist/pdf/ManabiOps_機能説明書.pdf
  dist/pdf/ManabiOps_セットアップガイド.pdf
  dist/pdf/ManabiOps_印刷用パック.zip
"""

from __future__ import annotations

import re
import subprocess
import sys
import zipfile
from datetime import date
from pathlib import Path

import markdown
from weasyprint import CSS, HTML

ROOT = Path(__file__).resolve().parent.parent
FEATURES_DIR = ROOT / "docs" / "features"
SETUP_DIR = ROOT / "docs" / "setup-guide"
OUTPUT_DIR = ROOT / "dist" / "pdf"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

TODAY = date.today().isoformat()

# ---------------------------------------------------------------------------
# CSS (print style)
# ---------------------------------------------------------------------------

PRINT_CSS = r"""
@page {
  size: A4;
  margin: 18mm 16mm 22mm 16mm;
  @top-right {
    content: "ManabiOps ドキュメント";
    font-family: "Noto Sans CJK JP", sans-serif;
    font-size: 9pt;
    color: #6b7280;
  }
  @bottom-center {
    content: counter(page) " / " counter(pages);
    font-family: "Noto Sans CJK JP", sans-serif;
    font-size: 9pt;
    color: #6b7280;
  }
}

@page cover {
  margin: 0;
  @top-right { content: none; }
  @bottom-center { content: none; }
}

html { font-family: "Noto Sans CJK JP", sans-serif; }
body {
  font-family: "Noto Sans CJK JP", sans-serif;
  font-size: 10.5pt;
  line-height: 1.7;
  color: #1f2937;
}

/* Cover */
.cover {
  page: cover;
  page-break-after: always;
  height: 297mm;
  width: 210mm;
  box-sizing: border-box;
  padding: 60mm 20mm 20mm 20mm;
  background: linear-gradient(135deg, #fff7ed 0%, #fef3c7 50%, #ecfccb 100%);
  text-align: center;
}
.cover .logo { font-size: 72pt; margin-bottom: 10mm; }
.cover h1 {
  font-size: 32pt;
  color: #ea580c;
  margin: 0 0 6mm 0;
  border: none;
  padding: 0;
}
.cover .subtitle {
  font-size: 16pt;
  color: #374151;
  margin-bottom: 30mm;
}
.cover .meta {
  font-size: 11pt;
  color: #4b5563;
  margin-top: 40mm;
  line-height: 1.9;
}
.cover .version {
  display: inline-block;
  margin-top: 12mm;
  padding: 3mm 8mm;
  background: #ea580c;
  color: #fff;
  font-size: 12pt;
  border-radius: 3mm;
}

/* TOC */
.toc {
  page-break-after: always;
}
.toc h1 { border-bottom: 3px solid #ea580c; padding-bottom: 4mm; }
.toc ol { list-style: none; padding-left: 0; }
.toc ol li {
  padding: 2mm 0;
  border-bottom: 1px dotted #d1d5db;
  font-size: 11pt;
}

/* Headings */
h1 {
  font-size: 20pt;
  color: #ea580c;
  border-bottom: 3px solid #ea580c;
  padding-bottom: 2mm;
  margin-top: 8mm;
  margin-bottom: 5mm;
  page-break-before: always;
  page-break-after: avoid;
}
h1.no-break { page-break-before: auto; }
h2 {
  font-size: 15pt;
  color: #0369a1;
  border-left: 4px solid #0369a1;
  padding-left: 3mm;
  margin-top: 7mm;
  margin-bottom: 3mm;
  page-break-after: avoid;
}
h3 {
  font-size: 12pt;
  color: #0891b2;
  margin-top: 5mm;
  margin-bottom: 2mm;
  page-break-after: avoid;
}
h4 {
  font-size: 11pt;
  color: #4b5563;
  margin-top: 4mm;
  page-break-after: avoid;
}

p, li { orphans: 2; widows: 2; }

/* Links */
a { color: #0369a1; text-decoration: none; }

/* Code */
code {
  font-family: "Noto Sans Mono CJK JP", "Noto Sans Mono", monospace;
  font-size: 9pt;
  background: #f3f4f6;
  padding: 0.5mm 1.5mm;
  border-radius: 1mm;
  color: #be123c;
}
pre {
  font-family: "Noto Sans Mono CJK JP", "Noto Sans Mono", monospace;
  font-size: 8.5pt;
  line-height: 1.4;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-left: 4px solid #0369a1;
  padding: 3mm;
  overflow-x: hidden;
  white-space: pre-wrap;
  word-wrap: break-word;
  page-break-inside: avoid;
  border-radius: 1.5mm;
  color: #1f2937;
}
pre code { background: transparent; padding: 0; color: inherit; font-size: 8.5pt; }

/* Tables */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 3mm 0;
  font-size: 9.5pt;
  page-break-inside: avoid;
}
th {
  background: #fef3c7;
  border: 1px solid #d1d5db;
  padding: 1.5mm 2mm;
  text-align: left;
  font-weight: bold;
}
td {
  border: 1px solid #d1d5db;
  padding: 1.5mm 2mm;
  vertical-align: top;
}
tr:nth-child(even) td { background: #fafafa; }

/* Blockquote */
blockquote {
  margin: 3mm 0;
  padding: 2mm 4mm;
  background: #fff7ed;
  border-left: 4px solid #ea580c;
  color: #7c2d12;
  font-size: 10pt;
  border-radius: 0 2mm 2mm 0;
}

/* Lists */
ul, ol { padding-left: 6mm; margin: 2mm 0; }
li { margin: 1mm 0; }

/* Horizontal rule */
hr {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 5mm 0;
}

/* Inline emphasis */
strong { color: #dc2626; font-weight: bold; }

/* Section divider between chapters */
.chapter-break {
  page-break-before: always;
}

/* Footer info */
.doc-footer {
  margin-top: 15mm;
  padding-top: 3mm;
  border-top: 2px solid #ea580c;
  font-size: 9pt;
  color: #6b7280;
  text-align: center;
}
"""


# ---------------------------------------------------------------------------
# Markdown -> HTML
# ---------------------------------------------------------------------------

MD_EXTENSIONS = [
    "fenced_code",
    "tables",
    "toc",
    "sane_lists",
    "nl2br",
]


def md_to_html(md_text: str) -> str:
    """Convert Markdown text to HTML fragment."""
    # Remove internal markdown navigation (arrows and "次に読む" sections are
    # less useful in a printed doc but we keep them; they render fine).
    html = markdown.markdown(md_text, extensions=MD_EXTENSIONS, output_format="html5")
    return html


def load_chapter(path: Path) -> str:
    """Load a chapter markdown file and convert to HTML."""
    text = path.read_text(encoding="utf-8")
    # Remove the trailing "👉 次に読むもの" sections links (optional cleanup).
    return md_to_html(text)


# ---------------------------------------------------------------------------
# Book builders
# ---------------------------------------------------------------------------


def _cover(title: str, subtitle: str, version: str = "1.0") -> str:
    return f"""
    <section class="cover">
      <div class="logo">🍙</div>
      <h1>{title}</h1>
      <div class="subtitle">{subtitle}</div>
      <div class="version">Version {version}</div>
      <div class="meta">
        こども食堂「まなびキッチン」運営支援システム<br/>
        発行日: {TODAY}<br/>
        リポジトリ: github.com/satoshiyoshimoto0426/manabi-kitchin
      </div>
    </section>
    """


def _toc(items: list[tuple[str, str]]) -> str:
    lis = "\n".join(
        f'<li><strong>{num}.</strong> {title}</li>' for num, title in items
    )
    return f"""
    <section class="toc">
      <h1 class="no-break">📚 目次</h1>
      <ol>{lis}</ol>
    </section>
    """


def _footer() -> str:
    return f"""
    <div class="doc-footer">
      このドキュメントは ManabiOps プロジェクトの成果物です。<br/>
      © {date.today().year} まなびキッチン / MIT License
    </div>
    """


def build_features_pdf() -> Path:
    """Build the feature guide PDF (for sharing with teammates)."""
    files = sorted(p for p in FEATURES_DIR.glob("0*.md"))
    toc_items: list[tuple[str, str]] = []
    bodies: list[str] = []
    for idx, path in enumerate(files, 1):
        # Derive title from first H1
        first_line = next(
            (line for line in path.read_text(encoding="utf-8").splitlines() if line.startswith("# ")),
            path.stem,
        )
        title = first_line.lstrip("# ").strip()
        toc_items.append((f"{idx:02d}", title))
        bodies.append(load_chapter(path))

    body_html = "".join(bodies)
    html_doc = f"""<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>ManabiOps 機能説明書</title></head>
<body>
  {_cover("ManabiOps 機能説明書", "仲間と共有するための 9章ガイド")}
  {_toc(toc_items)}
  {body_html}
  {_footer()}
</body></html>
"""
    out = OUTPUT_DIR / "ManabiOps_機能説明書.pdf"
    HTML(string=html_doc, base_url=str(ROOT)).write_pdf(
        target=str(out), stylesheets=[CSS(string=PRINT_CSS)]
    )
    print(f"[OK] {out.relative_to(ROOT)}  ({out.stat().st_size // 1024} KB)")
    return out


def build_setup_pdf() -> Path:
    """Build the setup guide PDF (for operators)."""
    files = sorted(p for p in SETUP_DIR.glob("*.md") if p.name != "README.md")
    toc_items = []
    bodies = []
    for path in files:
        first_line = next(
            (line for line in path.read_text(encoding="utf-8").splitlines() if line.startswith("# ")),
            path.stem,
        )
        title = first_line.lstrip("# ").strip()
        # Use number from filename prefix
        num = path.stem.split("_", 1)[0]
        toc_items.append((num, title))
        bodies.append(load_chapter(path))

    body_html = "".join(bodies)
    html_doc = f"""<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>ManabiOps セットアップガイド</title></head>
<body>
  {_cover("ManabiOps セットアップガイド", "本番稼働までの完全手順書 (00-14)")}
  {_toc(toc_items)}
  {body_html}
  {_footer()}
</body></html>
"""
    out = OUTPUT_DIR / "ManabiOps_セットアップガイド.pdf"
    HTML(string=html_doc, base_url=str(ROOT)).write_pdf(
        target=str(out), stylesheets=[CSS(string=PRINT_CSS)]
    )
    print(f"[OK] {out.relative_to(ROOT)}  ({out.stat().st_size // 1024} KB)")
    return out


def build_individual_pdfs() -> list[Path]:
    """Also build each features/* as a single-chapter PDF for targeted handouts."""
    outs = []
    for path in sorted(FEATURES_DIR.glob("0*.md")):
        title = next(
            (line.lstrip("# ").strip() for line in path.read_text(encoding="utf-8").splitlines() if line.startswith("# ")),
            path.stem,
        )
        body_html = load_chapter(path)
        html_doc = f"""<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>{title}</title></head>
<body>
  {_cover(title, "ManabiOps 機能説明書 (単章版)")}
  <div class="chapter-break">{body_html}</div>
  {_footer()}
</body></html>
"""
        out = OUTPUT_DIR / "individual" / f"{path.stem}.pdf"
        out.parent.mkdir(parents=True, exist_ok=True)
        HTML(string=html_doc, base_url=str(ROOT)).write_pdf(
            target=str(out), stylesheets=[CSS(string=PRINT_CSS)]
        )
        outs.append(out)
        print(f"[OK] {out.relative_to(ROOT)}  ({out.stat().st_size // 1024} KB)")
    return outs


def build_zip(paths: list[Path]) -> Path:
    out = OUTPUT_DIR / "ManabiOps_印刷用パック.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for p in paths:
            z.write(p, arcname=p.relative_to(OUTPUT_DIR))
    print(f"[OK] {out.relative_to(ROOT)}  ({out.stat().st_size // 1024} KB)")
    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    print(f"→ PDF生成開始 ({TODAY})")
    outs = []
    outs.append(build_features_pdf())
    outs.append(build_setup_pdf())
    outs.extend(build_individual_pdfs())
    build_zip(outs)
    print("→ 完了")
    return 0


if __name__ == "__main__":
    sys.exit(main())
