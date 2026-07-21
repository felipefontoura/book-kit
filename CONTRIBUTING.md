# Contributing to book-kit

Thanks for considering a contribution! This engine builds real, in-print books,
so the bar is: **every change must keep a real book building and looking right.**

## Setup

```bash
git clone https://github.com/felipefontoura/book-kit.git
cd book-kit
mise install        # Node + Typst, pinned in mise.toml
npm ci
bash example/run.sh # full pipeline → example/.build/dist/{book-en.pdf,book-en.epub,cover-en.png}
```

If you don't use [mise](https://mise.jdx.dev), install Node ≥ 20 and
[Typst](https://typst.app/docs/) manually and make sure both are on `PATH`.

## How to verify a change

1. `bash example/run.sh --all` must build clean. The example book intentionally
   exercises every feature (parts, chapters, appendix, tables, Mermaid, math,
   worksheets, front-matter pages) — if you add a feature, add it to
   `example/BOOK.en.md` too. CI runs exactly this.
2. **Look at the output.** Typography bugs don't throw errors. Open the PDF at
   the pages your change touches.
3. If you can, rebuild a real book that consumes the kit as a submodule
   (`bash kit/scripts/build.sh` from the book root).

## Design rules

These are the invariants that keep the engine portable — PRs that break them
won't be merged:

- **No book-specific strings in the engine.** Every title, label, or piece of
  copy comes from the consuming book's `book.config.json`.
- **Two roots.** `KIT_ROOT` (the engine, read-only) vs `PROJECT_ROOT` (the
  book, receives all generated output). See `scripts/lib/config.mjs`.
- **Generated files never enter git**: `typst/chapters*`, `typst/frontmatter*`,
  `typst/assets/diagrams/`, `dist/`.
- **One Markdown source feeds both targets.** A feature that only works in the
  PDF (or only in the EPUB) needs a very good reason.
- **Visual identity lives in the kit** (`typst/template.typ`, `cover.typ`,
  `scripts/epub.css`, `scripts/mermaid.classes.mmd`) — per-book deviations go
  through config/extension points, not forks of the template.

## Commit style

Conventional commits, as in the existing history: `feat:`, `fix:`, `docs:`,
`ci:`, `refactor:` — imperative mood, subject ≤ 72 chars.

## Reporting bugs

Use the bug template and include the **smallest Markdown snippet** that
reproduces the problem. Rendering bugs without a repro snippet are very hard
to act on.
