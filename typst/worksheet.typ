// Diagnostic worksheet ("folha") renderer — a filled FORM, not a code block.
// Kept as its own tiny module so chapter files can import just this, without
// pulling the full book template into every chapter's scope. Tokens mirror
// template.typ (Light theme).
//
// Rendered from ```worksheet fences (parsed in scripts/md-to-typst.mjs). Mono
// field labels read as the pre-printed form; values in the reading font read
// as filled in by hand and — the whole point — wrap naturally inside their
// column, so nothing is ever clipped in print.
// rows: array of ("section", name) | ("field", label, value) | ("note", text).

#let _codebg      = rgb("#F0EAE0")
#let _codestroke  = rgb("#AD7A14")
#let _amber-deep  = rgb("#8C6210")
#let _text-main   = rgb("#14120F")
#let _text-body   = rgb("#1A1206")
#let _text-muted  = rgb("#837B6D")
#let _rule        = rgb("#CFC7BA")
#let _rule-strong = rgb("#B3A896")
#let _mono = ("JetBrains Mono",)
#let _body = ("Inter",)

#let worksheet(title: none, rows: ()) = block(
  width: 100%,
  fill: _codebg,
  stroke: (left: 2pt + _codestroke),
  inset: (x: 14pt, y: 13pt),
  radius: 3pt,
  breakable: true,
  {
    set par(justify: false, first-line-indent: 0pt, leading: 0.62em)
    if title != none {
      text(font: _mono, size: 8pt, fill: _amber-deep, tracking: 0.14em, weight: 500, lower(title))
      v(4pt)
      line(length: 100%, stroke: 0.6pt + _rule-strong)
      v(7pt)
    }
    let first = true
    for r in rows {
      let kind = r.at(0)
      if kind == "section" {
        if not first { v(8pt) }
        first = false
        // Keep the section label glued to the row that follows it, so a long
        // folha never breaks with an orphaned header at the foot of a page.
        block(sticky: true, breakable: false, {
          text(font: _mono, size: 7.5pt, fill: _text-main, tracking: 0.12em, weight: 500, lower(r.at(1)))
          v(3pt)
          line(length: 100%, stroke: 0.4pt + _rule)
        })
        v(5pt)
      } else if kind == "field" {
        first = false
        grid(
          columns: (1.35in, 1fr),
          column-gutter: 10pt,
          text(font: _mono, size: 7.5pt, fill: _text-muted, r.at(1)),
          text(font: _body, size: 9.5pt, fill: _text-body, r.at(2)),
        )
        v(4pt)
      } else if kind == "note" {
        first = false
        v(2pt)
        text(font: _body, size: 9.5pt, fill: _text-main, style: "italic", r.at(1))
      }
    }
  },
)
