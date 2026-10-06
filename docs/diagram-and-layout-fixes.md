# Fixing diagram, table, and code-block layout problems

A field guide for the next AI session (or human) that gets asked to "fix the
tiny diagram on page 11" or "this table looks cramped." Written after a
full page-by-page audit of a 170+ page, two-language book built on this kit
turned up a recurring set of problems — all fixable at the kit level, not by
hand-patching one page.

Everything here was true for Typst 0.15.x and Mermaid 11.x at the time of
writing. Re-verify against current versions before trusting a claim blindly.

## The audit loop

Don't eyeball the Markdown source and guess. **Render the actual PDF to page
images and look at every page.** Layout bugs are invisible in source and
obvious in the rendered output.

```bash
mise exec -- bash scripts/build.sh --pdf          # or your book's own build command
pdftoppm -r 100 -png dist/book-en.pdf /tmp/audit/p # → /tmp/audit/p-001.png … p-NNN.png
```

For anything longer than ~40 pages, don't read them yourself — you'll run out
of context long before page 100. Split the page range across a handful of
parallel subagents (4 agents × ~40 pages each works well), each told to
**read every page image** and report findings as one line per problem:

```
p.NNN | <section/chapter> | "<exact snippet to locate it>" | <category> | <severity> | <what's wrong> | <suggested fix>
```

Give them an explicit "don't flag this" list of intentional design choices
(hand-drawn style, the running header, chapter-opener blank pages) — otherwise
half the report is noise. Fix what comes back, rebuild, and **run the audit
again on the new render** before calling it done — a fix for one page
sometimes repaginates the whole book and moves the problem, or introduces a
new one elsewhere. Budget for at least two full passes.

When something looks wrong but you can't tell why from the page image alone,
isolate it: extract the exact generated `.typ` table/diagram snippet and
compile it standalone in a tiny scratch file (see [Isolating a Typst bug](#isolating-a-typst-bug)
below) rather than rebuilding the whole 170-page book on every guess.

## Diagrams (Mermaid)

### Diagnose with the viewBox, not your eyes

Every rendered diagram is an SVG with a `viewBox="minX minY width height"`.
Pull `width`/`height` out of it and you can compute, before ever opening an
image, whether a diagram will read too small:

```bash
vb=$(grep -o 'viewBox="[^"]*"' diagram.svg | head -1 | tr -d '"' | cut -d= -f2)
set -- $vb
awk -v w=$3 -v h=$4 'BEGIN{
  r = w/h
  wi = (r >= 4.5/6.5) ? 4.5 : 6.5*r        # fit inside MAX_W × MAX_H (inches)
  pt = 17 * wi * 72 / w                     # 17px = mermaid.config.json fontSize
  printf "%.2fin wide, label ≈ %.1fpt\n", wi, pt
}'
```

Anything under ~7pt is unreadable at print size; this kit caps diagram
scale-up so small diagrams never exceed ~9.5pt labels (see
[`md-to-typst.mjs`](../scripts/md-to-typst.mjs), `MAX_LABEL_PT`) — but a
diagram with **many nodes** can still come out tiny because it's bound by
`MAX_W`/`MAX_H`, not the label cap. Those need a layout fix, not a config
knob.

### Rebuild diagrams iteratively, outside the book build

Don't edit the Markdown, rebuild the whole book, and eyeball a PDF page for
every tweak — render the `.mmd` directly with `mmdc`, using the kit's own
config so WYSIWYG actually holds:

```bash
K=kit  # or wherever the kit submodule lives
CLS=$(grep '^classDef' $K/scripts/mermaid.classes.mmd | sed 's/^/    /')
awk -v cls="$CLS" '{print} /^flowchart|^stateDiagram/{print cls}' draft.mmd > draft.full.mmd
$K/node_modules/.bin/mmdc -i draft.full.mmd -o draft.svg -b transparent \
  -c $K/scripts/mermaid.config.json -p $K/scripts/puppeteer.config.json
$K/node_modules/.bin/mmdc -i draft.full.mmd -o draft.png -b white \
  -c $K/scripts/mermaid.config.json -p $K/scripts/puppeteer.config.json
```

Then `Read` the PNG. One `mmdc` call is a couple of seconds; one full book
build is tens of seconds to minutes. Iterate on the `.mmd`, not the book.

### Common failure shapes, and the fix that actually worked

- **Two small flowcharts crammed side by side in one `flowchart TB`/`LR`,
  each a separate `subgraph`.** Reads as two postage stamps. Give each
  subgraph `direction TB` explicitly and let them stack as two full-width
  columns instead of fighting for a shared row — or, if they're a genuine
  A/B comparison, put them in **separate sequential diagrams** rather than
  one cramped one.
- **A pipeline of 6-9 steps as one `flowchart LR`.** Comes out as a squashed
  horizontal strip with sub-7pt labels. Group the steps into 2-3 named
  `subgraph`s (e.g. "shape the work" / "write the spec" / "build and
  verify"), each `direction LR` internally, stacked `flowchart TB` overall.
  This also makes the diagram *say something* (phases), not just show
  arrows.
- **A directory tree that duplicates the code block right above it.** If the
  Markdown already has a fenced tree listing, the diagram is pure
  redundancy. Either drop one, or make the diagram say something the tree
  doesn't (e.g. group files by "changes rarely" vs. "evolves per feature"
  instead of repeating the same paths).
- **A state diagram or ER diagram with crossing lines in the middle.**
  Usually fixable by **reversing the relationship direction** on one or two
  edges (`A --> B` to `B --> A` changes layout, not meaning, in most
  layout engines) or by nesting a tight sub-cluster of states into a Mermaid
  **composite state** (`state Active { ... }`) so the busy part collapses to
  one box in the outer diagram.
- **An edge routed straight through a `subgraph` title.** Don't link
  directly into a node that's the first thing inside a titled subgraph —
  Mermaid often routes the incoming edge across the title bar. Link to a
  free-floating node placed *between* the two subgraphs instead (remove the
  wrapping subgraph if it isn't pulling its weight).
- **A label breaking mid-word** (`implementation_in_progre` / `ss`). The
  node is too narrow for its own text. Shorten the label, or, if it's a
  state name that must stay exact, give it its own line inside a
  `state X { direction LR ... }` block instead of forcing one wide box.

### Diagrams are measured at the wrong font weight by default

`mermaid.config.json` sets the label font, but if your post-processing
script bolds labels *after* Mermaid lays them out (common when a hand-drawn
look needs heavier strokes for legibility), Mermaid sized every box for the
**thinner, pre-bold** glyphs — so boxes render visibly too narrow for the
text they actually contain. Fix at the source: tell Mermaid to bold at
*layout* time via `themeCSS`, not in post-processing:

```json
"themeCSS": "text, tspan, .nodeLabel, .edgeLabel, .label, .messageText, .noteText, .actor tspan { font-weight: bold !important; }"
```

### A diagram inside a `---` YAML frontmatter block (per-diagram config, e.g.
`rankSpacing`) can break shared-class injection

If your pipeline finds "the diagram header line" by regex to insert shared
`classDef`s after it, make sure that search **skips the frontmatter block**
first — a frontmatter's own `flowchart:` config key reads exactly like a
diagram header to a naive regex, and classes get injected into YAML instead
of Mermaid source, hard-failing the render.

## Tables

### Equal-width columns are the default, and they're almost always wrong

`#table(columns: N, ...)` in Typst (and the naive Markdown-to-Typst
conversion that just counts header cells) gives every column identical
width. A table with a one-word label column next to two prose columns
squeezes the prose into tall, gappy, ragged cells while the label column
sits mostly empty. **Size columns by their actual content**, not by count:

- A column whose longest cell is short (an ID, a one-word label, `PASS`/
  `FAIL`) gets `auto` — it hugs its own text.
- The remaining columns share the rest of the width as `fr` units, weighted
  by their *average* cell length — but **dampen the ratio** (e.g. `sqrt` of
  the length ratio, capped at ~2-2.5×) so one long column doesn't starve its
  neighbor down to a single word per line.
- If too many columns qualify as "short," the `auto` columns alone can eat
  most of the table width and strangle the one prose column that's left —
  cap how much total width `auto` columns may claim, and demote the longest
  offender back to `fr` if they go over budget.

See [`columnSpec()` in `md-to-typst.mjs`](../scripts/md-to-typst.mjs) for a
working implementation of this heuristic.

### Justified text in a narrow cell is a word-spacer, not a strength

Body-text justification (stretching spaces so every line hits the right
margin) looks fine at a 4.5in column measure and actively ugly at a 1.5in
table-cell measure — "SE mais de 50" becomes "SE    mais    de    50" with
huge gaps. Table cells should be **ragged-right, unhyphenated, and a half
step smaller than body text** (e.g. 9.5pt in a 10.5pt-body book) — never
inherit the body paragraph's justify setting.

### Markdown pipes/brackets as literal text inside a Typst `[...]` cell

Unescaped `[` / `]` inside a cell's source text usually renders fine as
literal characters in Typst's markup mode (verify for your version — this
was tested and confirmed harmless on Typst 0.15), so don't assume escaping
brackets fixes a layout bug without reproducing it first. See
[Isolating a Typst bug](#isolating-a-typst-bug) — the actual fix for a
colliding-column bug we hit was content-level (reword the one cell whose
exact wrapped-line width triggered the edge case), not an escaping change.

## Code blocks

### Wrapped lines lose their indentation by default

A source line too long for the print measure wraps, and by default the
continuation snaps back to column 0 — destroying a directory tree's
indentation, a Prisma `@relation(...)`'s alignment, or a nested list's
structure. Give wrapped `raw` lines a **hanging indent** matched to the
line's own content:

```typst
show raw.where(block: true): it => {
  show raw.line: it => {
    let rest = it.text.trim(at: start)
    let lead = it.text.len() - rest.len()
    let marker = rest.match(regex("^([-*+] (\[[ xX]\] )?|\d+\. |\| |#+ |// |> )"))
    let hang = lead + if marker != none { marker.text.len() } else { 2 }
    box(width: 100%, par(justify: false, first-line-indent: 0pt,
      hanging-indent: hang * 0.6em, it.body))
  }
  block(/* ... your code-block chrome ... */)
}
```

A **Markdown table rendered inside a fenced code block** (a common pattern
for "here's a file's literal contents, and it happens to contain a table")
needs its own case: when a wrapped line still looks like a table row (starts
and ends with `|`, has ≥3 pipe characters), hang it under the **last
column's position**, not the line start — otherwise the wrapped remainder
loses its pipe alignment and the table reads as broken even though it's
technically "just a wrapped line."

### Hard-wrapped prose inside a code/text fence

Markdown source hand-wrapped at ~70-80 columns (a habit from plain-text
editors) looks fine in source but, once a renderer does its *own* wrapping
at a different measure, produces one short, ugly, left-flush line per
original source line instead of one naturally reflowing paragraph. Find and
rejoin these before they hit the renderer — a line that's long, doesn't end
in sentence punctuation, and is immediately followed by a lowercase-starting
continuation at the **same indentation** is almost always a hard wrap, not
a deliberate break:

```python
# Heuristic: join `prev` + `cur` when `prev` looks like it was wrapped
# for line-length rather than ending a sentence or starting a new list item.
ok = (len(prev) >= 45
      and not re.search(r'\S {3,}\S', prev)           # not a markdown table row
      and MARKER.match(cur.strip()) is None            # cur isn't a new list/heading/table item
      and re.match(r'^[a-z(`"\']', cur.strip())         # cur looks like a continuation
      and not prev.rstrip().endswith(('.', ':', '?', '!', ';'))
      and indent(cur) == indent(prev))                  # same nesting level
```

Run this across the whole source once, by hand-review the diff before
committing — the heuristic will have false positives on deliberately
two-line formats (e.g. `WHEN x,\n  THE SYSTEM SHALL y.` in an EARS-style
requirement list is *intentionally* two lines; don't join those).

## Pagination

### A lead-in sentence can get stranded from the figure it introduces

"The main flow:" at the very bottom of a page, with the diagram/code/table
it's introducing pushed to the next page, reads as broken even though
nothing is technically wrong. If your Markdown→Typst conversion can detect
"a short paragraph ending in `:` immediately followed by a code/table/figure
block," wrap that paragraph in a **sticky** block (`#block(sticky: true)[...]`
in Typst) so the layout engine keeps it with what follows instead of letting
a page break fall between them.

## Isolating a Typst bug

When a layout defect doesn't make sense from reading the generated `.typ`
source, don't keep rebuilding the whole book to test hypotheses — pull the
*exact* generated snippet into a minimal standalone file and compile just
that:

```typst
#set page(width: 4.5in, height: auto, margin: 0pt, fill: white)
#set text(font: "Inter", size: 10.5pt)
// ...reproduce only the `set`/`show` rules that affect the one construct
// you're debugging (table stroke/inset, par justify, text size)...
#table(
  columns: (auto, 1.00fr, 1.41fr),
  // ...paste the exact generated cells for the row that's broken...
)
```

```bash
mise exec -- typst compile --font-path kit/typst/assets/fonts snippet.typ snippet.png --ppi 200
```

This compiles in under a second, so you can **bisect**: change one variable
at a time (column width, one word's length, the inset) and re-render, until
you've isolated exactly what triggers the bug. One real example from this
audit: a specific Portuguese word, inside a specific column-width
combination, produced a wrapped line that rendered flush against the next
column with zero gap — reproducible with **hand-typed** Typst source (so it
wasn't a Markdown-conversion bug), gone when that one word was 3 characters
shorter, independent of inset size. That's a Typst line-fit edge case at an
exact-width coincidence, not a bug in this kit's conversion pipeline — the
practical fix was rewording the one cell, not chasing the Typst internals
further.

## When you're done

1. Rebuild the full book (not just the one chapter you touched).
2. Re-render **every page** to PNG and re-run the audit loop — a fix is not
   verified until you've looked at the actual output again.
3. If page count changed, re-render from scratch rather than reusing stale
   page images; a stale cache makes an agent "verify" content that no
   longer exists at that page number.
