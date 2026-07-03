// Book template — IA Consultant
//
// Visual system: Kit (carvão warm + âmbar ouro-velho) adapted for print.
// References: felipefontoura.com design tokens,
//             felipefontoura.com/src/styles/global.css (live).
//
// Trim 6×9" (KDP-Print compatible). The three Kit voices apply:
//   serif (Newsreader) = voice (titles, chapter headings, tese, quotes)
//   sans  (Inter)      = body, action labels, captions
//   mono  (JetBrains)  = labels, eyebrows, metadata, code
//
// Print uses the LIGHT theme tokens from felipefontoura.com (paper background,
// ouro-velho amber for accents — never the bright LED amber that only reads
// on dark). Bright amber lives only on the cover (typst/cover.typ).

// ─── Kit light-theme tokens ─────────────────────────────────────
#let bg          = rgb("#FBF8F2")   // paper warm (slightly lifted from #ECE7DF to spare ink)
#let text-main   = rgb("#14120F")   // carvão warm — chapter title + body strong
#let text-body   = rgb("#1A1206")   // text-on-amber colour, used as body ink (subtly warmer than pure carvão)
#let text-secondary = rgb("#5D564B") // captions, leads
#let text-muted  = rgb("#837B6D")   // metadata, page numbers, hr

#let amber       = rgb("#AD7A14")   // ouro velho — accent on paper (never the bright LED)
#let amber-deep  = rgb("#8C6210")   // headings on light bg, link emphasis
#let amber-soft  = rgb("#FCEAC5")   // optional tints

#let codebg      = rgb("#F0EAE0")   // bg-muted of the light theme (tinted, not gray)
#let codestroke  = rgb("#AD7A14")   // ouro-velho rule on code blocks (Kit left-bar)
#let rule        = rgb("#CFC7BA")   // hr / table borders
#let rule-strong = rgb("#B3A896")

// ─── Font families (bundled in typst/assets/fonts/) ───────────────
// Note: bundled Newsreader is instanced from the variable opsz axis, so
// Typst registers the family as "Newsreader 16pt". Libertinus Serif is the
// graceful fallback for environments without the bundled font.
#let voice  = ("Newsreader 16pt", "Libertinus Serif", "Liberation Serif")
#let body   = ("Inter", "Liberation Sans")
#let mono   = ("JetBrains Mono", "JetBrainsMono NF", "IBM Plex Mono", "DejaVu Sans Mono")

#let book(
  title: none,
  subtitle: none,
  author: none,
  lang: "pt",
  region: auto,
  eyebrow: "Consultoria estratégica em IA",
  copyright-body: none,
  frontmatter: none,
  body-content,
) = {
  // Default region from lang when not explicit.
  let resolved-region = if region == auto {
    if lang == "pt" { "br" } else if lang == "en" { "us" } else { "" }
  } else {
    region
  }

  // ─── Page geometry ────────────────────────────────────────────────
  set page(
    width:  6in,
    height: 9in,
    margin: (
      inside:  0.85in,
      outside: 0.65in,
      top:     0.85in,
      bottom:  0.85in,
    ),
    fill: bg,
    numbering: "1",
    number-align: center,
    header: context {
      let here-page = here().page()
      let displayed-num = counter(page).at(here()).first()
      if displayed-num <= 1 { return }
      let all-chapters = query(heading.where(level: 1))
      if all-chapters.any(c => c.location().page() == here-page) { return }
      let prev = all-chapters.filter(c => c.location().page() < here-page)
      if prev.len() == 0 { return }
      // Mono lowercase eyebrow in the running header (Kit §12.3 — mono
      // is the rótulo voice; uppercase + tracking would read "estêncil
      // militar" per the design-system anti-pattern).
      set text(
        size: 7.5pt,
        fill: text-muted,
        font: mono,
        tracking: 0.04em,
      )
      if calc.even(displayed-num) {
        align(left, lower(title))
      } else {
        align(right, lower(prev.last().body))
      }
    },
  )

  // ─── Typography baseline ──────────────────────────────────────────
  set text(
    font: body,
    size: 10.5pt,
    weight: 400,
    fill: text-body,
    lang: lang,
    region: resolved-region,
    hyphenate: true,
  )
  set par(
    justify: true,
    leading: 0.72em,                       // 1.6-ish to mirror Kit body leading
    first-line-indent: (amount: 1.1em, all: false),
  )
  // List markers align with the paragraph first-line indent (otherwise bullets
  // hang out into the left margin against the indented body text).
  set list(indent: 1.1em, body-indent: 0.5em)
  set enum(indent: 1.1em, body-indent: 0.5em)

  // ─── Headings ─────────────────────────────────────────────────────
  // Display headings = serif voice 400 (editorial, atemporal).
  // Component headings = serif voice 500. Per Kit §3.2: serif fina é
  // o "ar de livro"; subir só onde 400 ficaria trêmulo.
  show heading: set text(font: voice, fill: text-main, hyphenate: false)

  show heading.where(level: 1): it => {
    pagebreak(weak: true, to: "odd")
    v(1.5in)
    set par(justify: false, first-line-indent: 0pt, leading: 0.55em)
    // Chapter labels (Capítulo N) in mono lowercase eyebrow above the title.
    let parts = it.body.has("text") and ("text" in it.fields()) and false
    set text(size: 26pt, weight: 400, fill: text-main, tracking: -0.02em)
    it.body
    v(0.45in)
  }
  // sticky: true keeps a section heading on the same page as the content that
  // follows it (no heading stranded at a page foot). The gap BELOW is a hard
  // v() after the block: a block's `below` spacing collapses away against the
  // following paragraph here, so an explicit non-weak v() is the reliable way
  // to keep the heading from gluing to its first line.
  show heading.where(level: 2): it => {
    block(sticky: true, above: 1.5em, {
      set text(size: 16pt, weight: 500, tracking: -0.01em)
      it.body
    })
    v(0.8em, weak: false)
  }
  show heading.where(level: 3): it => {
    block(sticky: true, above: 1em, {
      set text(size: 12pt, weight: 500, tracking: -0.005em)
      it.body
    })
    v(0.7em, weak: false)
  }
  show heading.where(level: 4): it => {
    block(sticky: true, above: 0.8em, {
      set text(size: 10.5pt, weight: 500, style: "italic", fill: text-main)
      it.body
    })
    v(0.5em, weak: false)
  }

  // ─── Strong + emph (function-form rendering from md-to-typst) ─────
  show strong: it => text(weight: 600, fill: text-main, it.body)
  show emph:   it => text(style: "italic", it.body)

  // Lead-in label paragraphs (those opening in bold — the B.A.S.E. steps,
  // "Etapa N:", "Primeiro:", …) must not strand at the foot of a page, cut
  // off from the text they introduce. Detect the bold lead and keep the
  // paragraph on the same page as the block that follows it.
  show par: it => {
    let b = it.body
    let leads-bold = if b.func() == strong {
      true
    } else if b.has("children") {
      let ch = b.children
      ch.len() > 0 and ch.first().func() == strong
    } else {
      false
    }
    // Wrapping in a block collapses the normal paragraph spacing, so restore
    // air: clear separation above (a new labelled step) and a small gap below
    // before the text it introduces.
    if leads-bold { block(sticky: true, above: 1.3em, below: 0.65em, it) } else { it }
  }

  // ─── Code blocks (Kit — ouro-velho left bar) ───────────────────
  show raw.where(block: true): it => {
    block(
      width: 100%,
      fill: codebg,
      stroke: (left: 2pt + codestroke),
      inset: (x: 12pt, y: 10pt),
      radius: 3pt,
      breakable: true,
      text(
        font: mono,
        size: 8.5pt,
        fill: text-main,
        it,
      ),
    )
  }
  show raw.where(block: false): it => {
    box(
      fill: codebg,
      inset: (x: 3pt, y: 1pt),
      outset: (y: 2pt),
      radius: 2pt,
      text(
        font: mono,
        size: 9pt,
        fill: amber-deep,                   // inline code in ouro-velho (Kit prose code colour)
        it,
      ),
    )
  }

  // ─── Tables (Kit: separation by rule + edge-light, not heavy borders) ─
  set table(
    stroke: (x, y) => if y == 0 {
      (bottom: 1pt + rule-strong)
    } else {
      (bottom: 0.4pt + rule)
    },
    inset: (x: 8pt, y: 6pt),
  )
  show table.cell.where(y: 0): it => {
    set text(
      font: mono,
      weight: 500,
      size: 8.5pt,
      fill: text-main,
      tracking: 0.02em,
    )
    lower(it)                              // mono header = lowercase per Kit §3.4
  }

  // ─── Links ─────────────────────────────────────────────────────────
  // Only external URLs get the ouro-velho underline. Internal jumps (TOC
  // entries, cross-references) stay plain dark text — an underline on every
  // clickable line would muddy the print.
  show link: it => {
    if type(it.dest) == str {
      set text(fill: amber-deep)
      underline(offset: 1.5pt, stroke: 0.4pt + amber, it)
    } else {
      it
    }
  }

  // ─── Blockquotes (serif italic, amber bar) ────────────────────────
  show quote: it => {
    block(
      width: 100%,
      stroke: (left: 2pt + amber),
      inset: (left: 14pt, top: 4pt, bottom: 4pt),
    )[
      #set text(font: voice, style: "italic", fill: text-main, weight: 400, size: 11pt)
      #set par(first-line-indent: 0pt, leading: 0.7em)
      #it.body
    ]
  }

  // ─── Figures ──────────────────────────────────────────────────────
  show figure.where(kind: image): it => {
    align(center)[
      #v(0.5em)
      #it.body
      #v(0.3em)
      #if it.caption != none [
        #text(font: mono, size: 8pt, fill: text-muted, tracking: 0.02em, lower(it.caption))
      ]
      #v(0.8em)
    ]
  }

  // ─── Title page (Kit editorial — serif voice, mono eyebrow) ────
  page(numbering: none, header: none, fill: bg)[
    #set par(justify: false, leading: 0.45em, first-line-indent: 0pt)
    #set text(hyphenate: false)
    #v(2in)
    #align(center)[
      // Mono eyebrow (Kit §3.4 lowercase + gentle tracking)
      #text(font: mono, size: 9pt, fill: amber-deep, tracking: 0.18em, weight: 500, lower(eyebrow))
      #v(0.8em)
      #text(font: voice, size: 30pt, weight: 400, fill: text-main, tracking: -0.025em, title)
      #v(0.5em)
      #if subtitle != none [
        #text(font: body, size: 12pt, weight: 400, fill: text-secondary, subtitle)
      ]
    ]
    #v(1fr)
    #if author != none {
      align(center, text(font: body, size: 11pt, weight: 500, fill: text-main, author))
    }
    #v(0.5in)
  ]

  // ─── Copyright page (front matter, unnumbered, left-hand page) ────
  if copyright-body != none {
    page(numbering: none, header: none, fill: bg)[
      #set par(justify: false, leading: 0.7em, first-line-indent: 0pt)
      #set text(font: body, size: 9pt, fill: text-secondary, hyphenate: false)
      #v(1fr)
      #copyright-body
      #v(0.4in)
    ]
  }

  // Optional front-matter pages (dedication / epigraph / …) — unnumbered and
  // header-less like the title/copyright pages, rendered BEFORE the body page
  // numbering starts so they never shift the folios or reach the TOC.
  if frontmatter != none { frontmatter }

  counter(page).update(1)
  body-content
}

// ─── TOC title ────────────────────────────────────────────────────
#let toc-title(name) = {
  pagebreak(weak: true, to: "odd")
  v(1.5in)
  par(justify: false, first-line-indent: 0pt)[
    #set text(size: 26pt, weight: 400, fill: text-main, hyphenate: false, font: voice, tracking: -0.02em)
    #name
  ]
  v(0.45in)
}

// ─── Part divider (Kit: mono eyebrow + serif voice 400) ─────────
#let part-page(label, name) = {
  pagebreak(weak: true, to: "odd")
  page(header: none, numbering: none, fill: bg)[
    // Invisible marker so the custom TOC (book.typ) can list parts with the
    // divider page number. Rendered nothing; queried via the <part-entry> label.
    #metadata((label: label, name: name)) <part-entry>
    #set par(justify: false, first-line-indent: 0pt)
    #set text(hyphenate: false)
    #v(3in)
    #align(center)[
      // Mono lowercase eyebrow (§3.4)
      #text(font: mono, size: 9.5pt, fill: amber-deep, tracking: 0.20em, weight: 500, lower(label))
      #v(0.6em)
      #text(font: voice, size: 26pt, weight: 400, fill: text-main, tracking: -0.02em, name)
    ]
  ]
}

// ─── Front-matter page (optional dedication / epigraph / etc.) ──────
// Rendered from an optional Markdown file, placed between the copyright page and
// the TOC. Headings inside are forced outlined:false so these pages never leak
// into the Sumário. Content sits in the upper third, centred, in a soft voice.
#let frontmatter-page(content) = {
  // Unnumbered, header-less page (like the title/copyright pages). The converter
  // renders any Markdown heading here as centred text (never a heading element),
  // so nothing leaks into the TOC or the running header.
  page(numbering: none, header: none, fill: bg)[
    #v(1fr)
    #align(center, block(width: 76%)[
      #set par(justify: false, leading: 0.8em)
      #set text(font: body, size: 11.5pt, fill: text-secondary)
      #content
    ])
    #v(2fr)
  ]
}

// ─── Callout (warm amber tint — for the rare boxed aside) ──────────
#let callout(body) = block(
  width: 100%,
  fill: amber-soft,
  stroke: (left: 2pt + amber),
  inset: (x: 14pt, y: 12pt),
  radius: 3pt,
  body,
)
