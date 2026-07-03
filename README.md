# book-kit — portable Typst → PDF/EPUB engine

This is the shared build engine behind the author's books: a Markdown → PDF (Typst)
+ EPUB 3 pipeline with print typography, a KDP cover renderer, Mermaid diagrams,
math, and worksheet "folhas". A book consumes it as a **git submodule**, so every
book inherits the same pipeline, typography and fixes from one place — the only
per-book file is `book.config.json`.

Consume it from a book repo:

```bash
git submodule add git@github.com:felipefontoura/book-kit.git kit
# in the book's book.config.json set  "kit": { "dir": "kit" }
bash kit/scripts/build.sh --all       # run from the book root
```

## What is engine vs. what is book

| Owner | Files | Notes |
|---|---|---|
| **Kit** (engine, shareable) | `scripts/` · `typst/{template,cover,worksheet,book}.typ` · `typst/assets/fonts/` · `mermaid.config.json` · `puppeteer.config.json` · `scripts/epub.css` · `package.json` · `mise.toml` | Read-only. Same for every book. |
| **Book** (per project) | `book.config.json` · `BOOK.*.md` · generated `typst/chapters/` · `typst/chapters.typ` · `typst/assets/diagrams/` · `dist/` | The only things you author/generate per book. |

## The two roots

The scripts resolve two directories (see `scripts/lib/config.mjs`):

- **`KIT_ROOT`** — where the engine lives (the script's `../..`). Read-only:
  template/cover/worksheet, fonts, mermaid/puppeteer/epub configs, `node_modules`.
- **`PROJECT_ROOT`** — the book being built. Holds `book.config.json` and
  `BOOK.*.md`, and receives every generated output. Resolved as
  `$PROJECT_ROOT` → the current dir if it has a `book.config.json` → else the
  kit itself.

In single-repo mode the two are the same directory, so nothing changes.

Typst is compiled with `--root PROJECT_ROOT`, so **absolute-from-root** paths
(`/…`) resolve against the book. Kit-owned modules are imported with the kit's
submodule dir as a prefix (`book.config.json → kit.dir`), which is `""` locally
and e.g. `kit` under a submodule. That single knob is what makes the generated
`#import "/kit/typst/template.typ"` work from anywhere.

## Customizing a book — `book.config.json`

Every book-specific string lives here (nothing is hardcoded in the engine). Per
language (`languages.pt`, `languages.en`, …):

| Field | Feeds |
|---|---|
| `title`, `subtitle`, `eyebrow` | **title page** (Typst) + EPUB metadata |
| `copyright` (array of paragraphs) | **copyright page** — see below |
| `tocName` | table-of-contents heading |
| `cover.{title,subtitle,label}` | the KDP cover (`cover.typ`) |
| `preambleTitle`, `partsLabel`, `appendixLabel` | EPUB navigation labels |
| `description`, `langTag` | EPUB metadata |
| top-level `author`, `publisher` | title page, copyright, cover, EPUB |

### The copyright page

The copyright page is generated from `languages.<lang>.copyright` — a plain
**array of paragraphs**. `book.typ` renders a bold *title* + *subtitle* header
(pulled automatically), then each array entry as its own spaced paragraph. To
change the copyright text, edit that array; add/remove entries to add/remove
paragraphs. No Typst editing required.

The title page (eyebrow · title · subtitle · author) is likewise fully driven by
the fields above — `template.typ` only owns the *layout*, never the words.

### Front-matter pages (dedication, epigraph, …)

Extra front-matter pages are **optional Markdown files**, discovered by
convention — no config entry. Drop them in a `frontmatter/` folder at the book
root:

```
frontmatter/
  dedicatoria.pt-BR.md        # or dedication.md (language-neutral)
  01-epigrafe.pt-BR.md        # numeric prefix controls order
```

- A file is included when its name is **language-neutral** (`*.md`) or matches
  the book's language (`*.pt-BR.md` for a pt-BR build). Missing folder → nothing
  happens.
- Rendered order is **filename sort order** — prefix with `01-`, `02-` to order.
- Each becomes its own page, **unnumbered and header-less**, placed between the
  copyright page and the TOC (PDF) / before everything in the reader nav (EPUB).
- **Never listed in the Sumário / TOC.** Markdown headings inside are rendered as
  soft centred titles (not chapter headings), so they touch neither the outline
  nor the running header.
- Content is prose only (paragraphs, emphasis, blockquotes, headings) — no
  diagrams. It flows through the same Markdown converter as the chapters.

The generated Typst (`typst/frontmatter.typ`, `typst/frontmatter/`) is a build
artifact and git-ignored, like `typst/chapters/`.

**Design tokens** (palette, fonts, page geometry) intentionally stay in the kit
(`template.typ` / `cover.typ`) because they are the shared visual identity, not
per-book copy. If a future book needs its own palette, we expose those tokens in
`book.config.json` too — ask and it's a small addition.

## Turning the engine into a submodule (later)

When you extract the engine into its own repo and add it to a book as a
submodule at, say, `kit/`:

1. `git submodule add <engine-repo-url> kit`
2. In the book's `book.config.json`, set `"kit": { "dir": "kit" }`.
3. Build with `bash kit/scripts/build.sh` from the book root (or
   `PROJECT_ROOT=$PWD bash kit/scripts/build.sh`).

The book repo then holds only `book.config.json`, `BOOK.*.md` and its generated
output; everything else is inherited from the submodule and updated with
`git submodule update --remote`.
