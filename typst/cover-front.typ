// Cover front panel + the dark tokens every cover surface shares.
//
// One design, two renderers: cover.typ draws it alone as the 5:8 ebook / HTML
// cover (1600×2560 PNG), and cover-print.typ draws it as the front panel of the
// full-wrap print cover (back + spine + front). The panel is laid out at the
// ebook width (6.4in) and scaled linearly by `s`, so the two never drift.
//
// Visual system: DARK theme (carvão warm + âmbar farol). The cover
// is the only artefact where the BRIGHT amber (#EDA921) appears — it lives
// as a "ponto de luz no escuro" per design system §2.2/§2.5. Interior uses the
// ouro-velho amber on light paper instead (see typst/template.typ).
//
// Every colour is opaque: a print cover must have no transparency to flatten
// (KDP checklist), so tints are pre-mixed over the background instead of
// drawn with alpha. Visually identical on screen.

// ─── DARK tokens (the carvão + amber LED) ───────────────────
#let bg       = rgb("#14120F")  // carvão warm
#let elevated = rgb("#1D1916")
#let paper    = rgb("#ECE7DF")  // text/primary on dark
#let secondary= rgb("#A39A8D")  // text/secondary on dark
#let muted    = rgb("#6E665C")
#let amber    = rgb("#EDA921")  // the farol (only on cover)
#let amber-deep = rgb("#AD7A14")
#let amber-tint = rgb("#5B4415") // amber-900 — subtle bottom glow
#let amber-wash = color.mix((amber, 15%), (bg, 85%)) // 15% amber over carvão

// ─── Font families (same bundle as template) ──────────────────────
#let voice = ("Newsreader 16pt",)
#let body  = ("Inter",)
#let mono  = ("JetBrains Mono",)

// The width the front panel is designed at; `s` = actual width / this.
#let design-width = 6.4in

// Optional brand monogram (serif voice — per design system §12.6, wordmark is
// serif, not mono). Off by default; a book opts in with cover.monogram.
#let monogram(s, mark) = box(
  width: 32pt * s, height: 32pt * s,
  stroke: 1pt * s + amber-deep,
  fill: amber-wash,
  inset: 0pt,
  align(center + horizon, text(
    font: voice, size: 16pt * s, weight: 500, fill: amber, tracking: -0.02em, mark,
  )),
)

// The label line that opens each panel: the mono eyebrow (§3.4), after the
// monogram when the book has one.
#let label-line(label, s, mark: none) = {
  let eyebrow = text(font: mono, size: 11pt * s, fill: amber, tracking: 0.12em, weight: 500, lower(label))
  if mark == none or mark == "" { eyebrow } else {
    grid(columns: (auto, 1fr), gutter: 12pt * s, monogram(s, mark), align(left + horizon, eyebrow))
  }
}

// The front panel, filling its container (width × height). The caller paints
// the background; this draws the amber glow and the type. The glow is not
// clipped: on the wrap it fades out across the spine (it reaches the background
// colour at its rim, so there is no edge).
//
// Built to read at thumbnail size (a store search result is ~160px wide): a
// heavy title across the full measure, the subtitle in paper (not grey), and
// `accent`, an optional part of the title set in amber italic (the site's
// accent-word signature).
#let cover-front(title: "", subtitle: "", author: "", label: "", accent: none, mark: none, s: 1.0) = {
  set text(font: body, fill: paper, hyphenate: false)
  set par(justify: false, leading: 0.5em, first-line-indent: 0pt)

  // ─── Background: subtle radial amber glow at top (the "LED") ──────
  // Approximation of the Kit hero glow without grain — Typst can't
  // render filter feTurbulence so we lean on the warm gradient alone.
  // The amber at ~15% creates the "ponto de luz" without flooding.
  // Centred on the top edge, like the glow behind the site's wordmark.
  place(
    top + center,
    dy: -2.4in * s,
    circle(radius: 4.8in * s, fill: gradient.radial(amber-wash, bg)),
  )

  let title-content = if accent != none and accent != "" and title.contains(accent) {
    let (before, ..rest) = title.split(accent)
    [#before#text(style: "italic", fill: amber)[#accent]#rest.join(accent)]
  } else { title }

  block(
    width:  100%,
    height: 100%,
    inset: (x: 0.55in * s, top: 1.1in * s, bottom: 0.85in * s),
  )[
    // ── Top: label (mono lowercase, §3.4), after the optional monogram ──
    #label-line(label, s, mark: mark)

    #v(1fr)

    // ── Serif voice title (the "voz" — design system §3.1) ──────────
    // Set like the site hero: Newsreader 400, the accent in amber italic.
    // Line height as the site's display type (1.07–1.12): leading here is
    // the gap from one baseline to the next line's cap height. Set on the
    // text's own size (a `par(leading:)` around it would resolve em against
    // the body size, not the title's).
    #block({
      set text(size: 64pt * s, weight: 400, fill: paper, tracking: -0.02em, font: voice)
      set par(leading: 0.5em)
      title-content
    })

    #v(0.4in * s)

    // A narrower measure than the title, so a two-line subtitle breaks
    // into two even lines instead of leaving one word behind.
    #if subtitle != "" [
      #block(width: 74%, {
        set text(size: 23pt * s, weight: 400, fill: paper.mix((secondary, 40%)), font: body)
        set par(leading: 0.5em)
        subtitle
      })
    ]

    #v(1fr)

    // ── Bottom: the author as the site wordmark — serif, amber full stop ──
    #text(size: 22pt * s, weight: 400, fill: paper, font: voice, tracking: -0.01em)[#author#text(fill: amber)[.]]
    #v(0.08in * s)
    // Mono lowercase contributor line (design system §3.4 — lowercase, tracking suave)
    #text(size: 9.5pt * s, weight: 400, fill: muted, font: mono, tracking: 0.06em, lower("felipefontoura.com"))
  ]
}
