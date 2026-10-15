// Full-wrap print cover (KDP) — back + spine + front as one PDF page.
//
// Built by `build.sh --print` for each binding:
//   typst compile --root <book> typst/cover-print.typ dist/cover-en-paperback.pdf \
//     --input lang=en --input binding=paperback --input pages=180
// --input guides=true overlays trim, spine, safe-area and barcode guides
// (for checking against the KDP template; never upload a guided file).
//
// Geometry (inches, KDP — kdp.amazon.com/help/topic/G201953020 and
// GDTKFJPNQCBTMRV6):
//   paperback  0.125 bleed on every outer edge; spine = pages × the paper's
//              per-page thickness. Width = bleed + back + spine + front + bleed.
//   hardcover  0.51 wrap on every outer edge (folds over the board), 0.4 hinge
//              beside the spine, safe area 0.635 from the file edge. KDP gives
//              no formula for the case spine, so width, height and spine come
//              from the KDP cover template for the exact page count
//              (book.config.json → languages.<lang>.print.hardcover: each
//              edition has its own page count).
// The barcode box (2 × 1.2) is left empty: KDP prints the ISBN barcode in the
// lower corner of the back cover beside the spine.

#import "cover-front.typ": cover-front, label-line, design-width, bg, paper, secondary, muted, amber, voice, body, mono

#let cfg = json("/book.config.json")
#let lang = sys.inputs.at("lang", default: "en")
#let L = cfg.languages.at(lang)
#let binding = sys.inputs.at("binding", default: "paperback")
#let pages = int(sys.inputs.at("pages", default: "0"))
#let guides = sys.inputs.at("guides", default: "false") == "true"
#let print-cfg = cfg.at("print", default: (:))
#let back-cfg = L.cover.at("back", default: (:))

#let trim-w = 6in
#let trim-h = 9in

// Spine thickness per page, by interior paper (KDP paperback table).
#let per-page = (
  white:   0.002252in,
  cream:   0.0025in,
  premium-color:  0.002347in,
  standard-color: 0.002252in,
)

#let geo = if binding == "paperback" {
  let paper-kind = print-cfg.at("paper", default: "white")
  assert(paper-kind in per-page, message: "print.paper must be one of " + per-page.keys().join(", "))
  let spine = pages * per-page.at(paper-kind)
  let edge = 0.125in
  (
    edge: edge, spine: spine, panel-w: trim-w, panel-h: trim-h,
    width: 2 * edge + 2 * trim-w + spine, height: 2 * edge + trim-h,
    // Content keeps clear of the trim by this much (KDP minimum is 0.125").
    safe: 0.25in, hinge: 0in, barcode-bottom: 0.25in,
  )
} else if binding == "hardcover" {
  let hc = L.at("print", default: (:)).at("hardcover", default: none)
  assert(hc != none, message: "hardcover needs languages." + lang + ".print.hardcover { width, height, spine, pages } from the KDP cover template")
  assert(int(hc.pages) == pages, message: "languages." + lang + ".print.hardcover was taken from the KDP template for " + str(hc.pages) + " pages, but the interior has " + str(pages) + ": download a new template and update width/height/spine/pages")
  let edge = 0.51in
  let width = hc.width * 1in
  let height = hc.height * 1in
  let spine = hc.spine * 1in
  (
    edge: edge, spine: spine,
    panel-w: (width - spine - 2 * edge) / 2, panel-h: height - 2 * edge,
    width: width, height: height,
    // 0.635 from the file edge = 0.125 inside the fold.
    safe: 0.125in, hinge: 0.4in, barcode-bottom: 0.76in - edge,
  )
} else {
  panic("binding must be paperback or hardcover, got " + binding)
}

// Panel origins (top-left of the trimmed panel, in file coordinates).
#let back-x = geo.edge
#let spine-x = geo.edge + geo.panel-w
#let front-x = spine-x + geo.spine
#let top-y = geo.edge

#set page(width: geo.width, height: geo.height, margin: 0pt, fill: bg)
#set text(font: body, fill: paper, hyphenate: false)
#set par(justify: false, first-line-indent: 0pt)

// ─── Front: the ebook cover design, scaled to the trim width ──────────
#place(top + left, dx: front-x, dy: top-y, box(width: geo.panel-w, height: geo.panel-h,
  cover-front(
    title: L.cover.title,
    subtitle: L.cover.subtitle,
    author: cfg.author,
    label: L.cover.label,
    accent: L.cover.at("accent", default: none),
    mark: L.cover.at("monogram", default: none),
    s: geo.panel-w / design-width,
  ),
))

// ─── Spine: title head-to-foot (US/UK convention), author at the foot ──
// KDP prints spine text only above 79 pages, kept 0.0625" off each fold
// (plus 0.0625" of allowed drift), so the type is sized from the spine width.
#if pages > 79 {
  let clear = 0.125in
  let size = calc.min(14pt, (geo.spine - 2 * clear) * 0.9)
  place(top + left, dx: spine-x, dy: top-y, box(width: geo.spine, height: geo.panel-h,
    align(center + horizon, rotate(90deg, reflow: true, box(width: geo.panel-h - 2 * 0.6in, {
      set par(leading: 0em)
      grid(
        columns: (auto, 1fr, auto),
        align: horizon,
        text(font: voice, size: size, weight: 400, fill: paper, tracking: -0.01em, L.cover.title),
        [],
        text(font: body, size: size * 0.62, weight: 500, fill: secondary, tracking: 0.02em, cfg.author),
      )
    }))),
  ))
}

// ─── Back: category, headline, blurb, points and author bio ───────────
// From languages.<lang>.cover.back { category, headline, blurb: [..],
// pointsTitle, points: [..], bio }, every key optional. The top line is the
// category (mono amber, like the front label), or the front label without one.
// The text column stops above the barcode band (KDP prints the ISBN barcode
// beside the spine), and the build fails if the copy does not fit, rather than
// letting it run under the barcode.
#let s = geo.panel-w / design-width
#let back-x-pad = 0.55in * s
#let back-top = 1.1in * s
#let barcode-top = geo.barcode-bottom + 1.2in
#let column-w = geo.panel-w - 2 * back-x-pad
#let column-h = geo.panel-h - back-top - barcode-top - 0.3in
#let body-tone = paper.mix((secondary, 40%))

#let back-copy = {
  label-line(back-cfg.at("category", default: L.cover.label), s, mark: L.cover.at("monogram", default: none))
  v(0.4in)
  if "headline" in back-cfg {
    block({
      set text(font: voice, size: 22pt, weight: 400, fill: paper, tracking: -0.015em)
      set par(leading: 0.42em)
      back-cfg.headline
    })
    v(0.26in)
  }
  {
    set text(size: 10.5pt, fill: body-tone)
    set par(leading: 0.68em, spacing: 1.05em)
    for p in back-cfg.at("blurb", default: ()) { par(p) }
  }
  if "points" in back-cfg {
    v(0.16in)
    set text(size: 10pt, fill: body-tone)
    set par(leading: 0.62em)
    if "pointsTitle" in back-cfg {
      text(weight: 500, fill: paper, back-cfg.pointsTitle)
      v(0.08in)
    }
    set list(marker: text(fill: amber)[–], indent: 0pt, body-indent: 0.55em, spacing: 0.55em)
    list(..back-cfg.points)
  }
  if "bio" in back-cfg {
    v(0.24in)
    line(length: 0.8in, stroke: 1pt + amber)
    v(0.12in)
    block({
      set text(size: 9pt, fill: secondary)
      set par(leading: 0.65em)
      back-cfg.bio
    })
  }
}

#context {
  let h = measure(block(width: column-w, back-copy)).height
  assert(h <= column-h, message: "back cover copy is " + str(calc.round((h - column-h) / 1in, digits: 2)) + "in too tall for the space above the barcode: shorten languages." + lang + ".cover.back")
}

#place(top + left, dx: back-x + back-x-pad, dy: top-y + back-top, block(width: column-w, back-copy))

// Site line on the same baseline band as the front panel's.
#place(top + left, dx: back-x, dy: top-y, box(width: geo.panel-w, height: geo.panel-h,
  pad(left: back-x-pad, bottom: 0.85in * s, align(bottom + left,
    text(size: 9pt * s, weight: 400, fill: muted, font: mono, tracking: 0.06em, lower("felipefontoura.com"))))))

// ─── Guides (preview only) ───────────────────────────────────────────
#if guides {
  let g = 0.5pt + rgb("#00B7FF")
  let r = 0.5pt + rgb("#FF3B6B")
  // Trim box of each panel and the spine folds.
  for x in (back-x, front-x) {
    place(top + left, dx: x, dy: top-y, rect(width: geo.panel-w, height: geo.panel-h, stroke: g))
  }
  place(top + left, dx: spine-x, dy: top-y, rect(width: geo.spine, height: geo.panel-h, stroke: g))
  // Safe area (and hinge on hardcover).
  for (x, l, rr) in ((back-x, geo.safe, calc.max(geo.safe, geo.hinge)), (front-x, calc.max(geo.safe, geo.hinge), geo.safe)) {
    place(top + left, dx: x + l, dy: top-y + geo.safe,
      rect(width: geo.panel-w - l - rr, height: geo.panel-h - 2 * geo.safe, stroke: (paint: rgb("#00B7FF"), thickness: 0.4pt, dash: "dashed")))
  }
  // Barcode box: lower corner of the back cover, beside the spine.
  place(top + left,
    dx: spine-x - calc.max(geo.safe, geo.hinge + 0.25in) - 2in,
    dy: top-y + geo.panel-h - geo.barcode-bottom - 1.2in,
    rect(width: 2in, height: 1.2in, fill: white, stroke: r))
}
