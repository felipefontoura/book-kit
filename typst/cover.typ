// Cover renderer — single page, KDP-compatible aspect (5:8 / 1600×2560 @ 250ppi).
//
// Visual system: Kit DARK theme (carvão warm + âmbar farol). The cover
// is the only artefact where the BRIGHT amber (#EDA921) appears — it lives
// as a "ponto de luz no escuro" per Kit §2.2/§2.5. Interior uses the
// ouro-velho amber on light paper instead (see typst/template.typ).
//
// Parameters via CLI:
//   typst compile typst/cover.typ dist/cover-pt-br.png \
//     --ppi 250 --format png \
//     --input title="..." --input subtitle="..." \
//     --input author="..." --input label="..."

#let title    = sys.inputs.at("title",    default: "A IA é a Parte Fácil")
#let subtitle = sys.inputs.at("subtitle", default: "")
#let author   = sys.inputs.at("author",   default: "Felipe Fontoura")
#let label    = sys.inputs.at("label",    default: "Guia estratégico de consultoria em IA")

// ─── Kit DARK tokens (the carvão + amber LED) ───────────────────
#let bg       = rgb("#14120F")  // carvão warm
#let elevated = rgb("#1D1916")
#let paper    = rgb("#ECE7DF")  // text/primary on dark
#let secondary= rgb("#A39A8D")  // text/secondary on dark
#let muted    = rgb("#6E665C")
#let amber    = rgb("#EDA921")  // the farol (only on cover)
#let amber-deep = rgb("#AD7A14")
#let amber-tint = rgb("#5B4415") // amber-900 — subtle bottom glow

// ─── Font families (same bundle as template) ──────────────────────
#let voice = ("Newsreader 16pt", "Libertinus Serif")
#let body  = ("Inter", "Liberation Sans")
#let mono  = ("JetBrains Mono", "JetBrainsMono NF", "IBM Plex Mono", "DejaVu Sans Mono")

#set page(
  width:  6.4in,
  height: 10.24in,
  margin: 0pt,
  fill: bg,
)

#set text(font: body, fill: paper, hyphenate: false)
#set par(justify: false, leading: 0.5em, first-line-indent: 0pt)

// ─── Background: subtle radial amber glow at top (the "LED") ──────
// Approximation of the Kit hero glow without grain — Typst can't
// render filter feTurbulence so we lean on the warm gradient alone.
// The amber-900 tint at ~9% creates the "ponto de luz" without flooding.
#place(
  top + center,
  dx: 1in,
  dy: -0.6in,
  circle(
    radius: 4.5in,
    fill: gradient.radial(
      amber.transparentize(85%),
      bg.transparentize(100%),
    ),
  ),
)

#block(
  width:  100%,
  height: 100%,
  inset: (x: 0.7in, top: 1.6in, bottom: 1in),
)[
  // ── Top: brand mark + label (mono lowercase, §3.4) ───────────────
  #grid(
    columns: (auto, 1fr),
    gutter: 12pt,
    // Monogram (serif voice — per Kit §12.6, wordmark is serif, not mono)
    box(
      width: 32pt, height: 32pt,
      stroke: 1pt + amber-deep,
      fill: amber.transparentize(85%),
      inset: 0pt,
      align(center + horizon, text(
        font: voice, size: 16pt, weight: 500, fill: amber, tracking: -0.02em, "FF",
      )),
    ),
    align(left + horizon, text(
      font: mono, size: 10pt, fill: secondary, tracking: 0.18em, weight: 500, lower(label),
    )),
  )

  #v(1fr)

  // ── Center: serif voice title (the "voz" — Kit §3.1) ──────────
  #par(leading: 0.4em)[
    #text(size: 60pt, weight: 400, fill: paper, tracking: -0.03em, font: voice, title)
  ]

  #v(0.4in)

  #if subtitle != "" [
    #par(leading: 0.55em)[
      #text(size: 17pt, weight: 400, fill: secondary, font: body, subtitle)
    ]
  ]

  #v(1fr)

  // ── Bottom: thin amber rule + author ─────────────────────────────
  #line(length: 1.2in, stroke: 1.5pt + amber)
  #v(0.25in)
  #text(size: 13pt, weight: 500, fill: paper, font: body, author)
  #v(0.05in)
  // Mono lowercase contributor line (Kit §3.4 — lowercase, tracking suave)
  #text(size: 9pt, weight: 400, fill: muted, font: mono, tracking: 0.06em, lower("felipefontoura.com"))
]
