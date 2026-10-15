// Cover renderer — single page, KDP-compatible aspect (5:8 / 1600×2560 @ 250ppi).
// The ebook / HTML cover. The design itself lives in cover-front.typ, shared
// with the full-wrap print cover (cover-print.typ).
//
// Parameters via CLI:
//   typst compile typst/cover.typ dist/cover-pt-br.png \
//     --ppi 250 --format png \
//     --input title="..." --input subtitle="..." \
//     --input author="..." --input label="..." [--input accent="..."] [--input monogram="..."]

#import "cover-front.typ": cover-front, bg, design-width

#set page(
  width:  design-width,
  height: 10.24in,
  margin: 0pt,
  fill: bg,
)

#cover-front(
  title:    sys.inputs.at("title",    default: "Book Title"),
  subtitle: sys.inputs.at("subtitle", default: ""),
  author:   sys.inputs.at("author",   default: "Author Name"),
  label:    sys.inputs.at("label",    default: ""),
  accent:   sys.inputs.at("accent",   default: none),
  mark:     sys.inputs.at("monogram", default: none),
)
