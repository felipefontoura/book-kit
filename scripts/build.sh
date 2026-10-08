#!/usr/bin/env bash
# Full build pipeline: Markdown source → Mermaid SVGs → PDF (Typst) + EPUB + HTML site.
#
# Two roots keep the engine portable (single-repo, or shared as a git submodule):
#   KIT_ROOT     — this script's engine: scripts/, typst/{template,cover,worksheet}.typ,
#                  fonts, mermaid/puppeteer/epub configs, node_modules.
#   PROJECT_ROOT — the book: book.config.json, BOOK.*.md, and every generated
#                  output (typst/chapters, assets/diagrams, dist). Taken from
#                  $PROJECT_ROOT, else the current dir if it holds a
#                  book.config.json, else the kit itself (single-repo).
#
# Source selection (first match wins):
#   1. $SOURCE_MD env var (relative to PROJECT_ROOT, or absolute)
#   2. BOOK.pt-BR.md  (Brazilian Portuguese — primary)
#   3. BOOK.en.md     (English — fallback)
#
# Targets: --pdf | --epub | --html | --all (default: all three)

set -euo pipefail

KIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$PWD}"
[[ -f "$PROJECT_ROOT/book.config.json" ]] || PROJECT_ROOT="$KIT_ROOT"
export PROJECT_ROOT

target="all"
case "${1:-}" in
  --pdf)  target="pdf" ;;
  --epub) target="epub" ;;
  --html) target="html" ;;
  --all|"") target="all" ;;
  *)
    echo "Unknown target: $1 (use --pdf, --epub, --html, or --all)" >&2
    exit 2
    ;;
esac

# ─── Resolve source (in the project) ─────────────────────────────────
if [[ -n "${SOURCE_MD:-}" ]]; then
  SRC="$SOURCE_MD"
elif [[ -f "$PROJECT_ROOT/BOOK.pt-BR.md" ]]; then
  SRC="BOOK.pt-BR.md"
elif [[ -f "$PROJECT_ROOT/BOOK.en.md" ]]; then
  SRC="BOOK.en.md"
else
  echo "❌ No source Markdown file found (tried BOOK.pt-BR.md, BOOK.en.md)." >&2
  exit 1
fi
export SOURCE_MD="$SRC"
echo "▸ Source: $SRC  (target: $target)"

# ─── Detect language and output paths ───────────────────────────────
base="$(basename "$SRC" .md)"      # e.g. BOOK.pt-BR
lang="${base#BOOK.}"                # e.g. pt-BR
lang="${lang,,}"                    # lowercase: pt-br | en

DIST="$PROJECT_ROOT/dist"
mkdir -p "$DIST"
PDF="$DIST/book-$lang.pdf"
EPUB="$DIST/book-$lang.epub"
COVER="$DIST/cover-$lang.png"
HTML="$DIST/html/$lang"
HTML_ZIP="$DIST/book-$lang-html.zip"

# Metadata for cover renderer — read from book.config.json (single source of
# truth). CFG_LANG is the base language key (pt-br → pt).
CFG="$PROJECT_ROOT/book.config.json"
CFG_LANG="${lang%%-*}"
cfg_lang() { node -e 'let v=require(process.argv[1]).languages[process.argv[2]];for(const k of process.argv[3].split("."))v=v[k];process.stdout.write(String(v))' "$CFG" "$CFG_LANG" "$1"; }
cfg_root() { node -e 'let v=require(process.argv[1]);for(const k of process.argv[2].split("."))v=v[k];process.stdout.write(String(v))' "$CFG" "$1"; }
COVER_TITLE="$(cfg_lang cover.title)"
COVER_SUBTITLE="$(cfg_lang cover.subtitle)"
COVER_LABEL="$(cfg_lang cover.label)"
COVER_AUTHOR="$(cfg_root author)"

# ─── Tools (installed in the kit) ────────────────────────────────────
if ! command -v typst >/dev/null 2>&1; then
  echo "❌ typst not found in PATH. Run: mise install" >&2
  exit 1
fi
if [[ ! -d "$KIT_ROOT/node_modules" ]]; then
  echo "▸ Installing npm dependencies..."
  npm --prefix "$KIT_ROOT" install --no-audit --no-fund
fi

FONTS="$KIT_ROOT/typst/assets/fonts"

# ─── Pipeline ────────────────────────────────────────────────────────
echo "▸ Rendering Mermaid diagrams..."
node "$KIT_ROOT/scripts/render-mermaid.mjs"

if [[ "$target" == "pdf" || "$target" == "all" ]]; then
  echo "▸ Converting Markdown to Typst..."
  node "$KIT_ROOT/scripts/md-to-typst.mjs"

  echo "▸ Compiling PDF with Typst..."
  # Reduce locale tag to the base language (pt-br → pt) for the typst lang param.
  TYPST_LANG="${lang%%-*}"
  # --root = PROJECT_ROOT so the entry (which may live in a submodule) plus its
  # json("/book.config.json") and /typst/chapters.typ include resolve against
  # the book being built.
  typst compile --root "$PROJECT_ROOT" --font-path "$FONTS" \
    "$KIT_ROOT/typst/book.typ" "$PDF" \
    --input lang="$TYPST_LANG"
  echo "   PDF: $PDF ($(du -h "$PDF" | cut -f1))"
fi

# The cover feeds both the EPUB and the HTML landing page.
if [[ "$target" == "epub" || "$target" == "html" || "$target" == "all" ]]; then
  echo "▸ Rendering cover (Typst → PNG)..."
  typst compile --font-path "$FONTS" "$KIT_ROOT/typst/cover.typ" "$COVER" \
    --ppi 250 --format png \
    --input title="$COVER_TITLE" \
    --input subtitle="$COVER_SUBTITLE" \
    --input author="$COVER_AUTHOR" \
    --input label="$COVER_LABEL"
  echo "   Cover: $COVER ($(du -h "$COVER" | cut -f1))"
fi

if [[ "$target" == "epub" || "$target" == "all" ]]; then
  echo "▸ Building EPUB..."
  node "$KIT_ROOT/scripts/md-to-epub.mjs"
  echo "   EPUB: $EPUB ($(du -h "$EPUB" | cut -f1))"
fi

if [[ "$target" == "html" || "$target" == "all" ]]; then
  echo "▸ Building HTML site..."
  node "$KIT_ROOT/scripts/md-to-html.mjs"
  echo "▸ Indexing for search (Pagefind)..."
  "$KIT_ROOT/node_modules/.bin/pagefind" --site "$HTML" --quiet
  echo "▸ Verifying HTML against the source..."
  node "$KIT_ROOT/scripts/verify-html.mjs"
  echo "   HTML: $HTML ($(du -sh "$HTML" | cut -f1))"

  # Offline copy: the same folder, zipped (open index.html; search needs http).
  rm -f "$HTML_ZIP"
  (cd "$DIST/html" && zip -qr -X "$HTML_ZIP" "$lang")
  echo "   ZIP:  $HTML_ZIP ($(du -h "$HTML_ZIP" | cut -f1))"
fi

echo ""
echo "✅ Done."
