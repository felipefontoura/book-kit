// Shared math support for both build targets (Typst/PDF + EPUB).
//
// Authoring language is LaTeX — the universal math notation, native to KaTeX
// (EPUB) and renderable in Typst via the `mitex` package. One source, two
// renderers, no hand-rolled translator and no syntax drift.
//
// Delimiters (deliberately chosen to never collide with the book's pervasive
// currency `$` — e.g. "$300.000", "$5 milhões", "$100k"):
//
//   Display math:  $$ ...latex... $$   (own block; blank line before/after)
//   Inline math:   \( ...latex... \)   (single `$` stays currency, untouched)
//
// Both converters register these tokenizers on their `marked` instance:
//   - chapter-splitter.mjs lexes → md-to-typst.mjs walks the `mathBlock` /
//     `mathInline` tokens and emits `#mitex(...)` / `#mi(...)`.
//   - md-to-epub.mjs parses → the renderers below turn each token into KaTeX
//     MathML (output: 'mathml' — no CSS/fonts needed, EPUB 3 native).

const DISPLAY_RE = /^\$\$([\s\S]+?)\$\$/;
const INLINE_RE  = /^\\\(([\s\S]+?)\\\)/;

// Build the marked extension pair. Pass `{ block, inline }` render callbacks
// (each receives the token, returns an HTML string) for the parse path; omit
// them for the lexer-only path (the splitter), where renderers never fire.
export function mathExtensions(render = {}) {
  return [
    {
      name: 'mathBlock',
      level: 'block',
      start(src) { const i = src.indexOf('$$'); return i === -1 ? undefined : i; },
      tokenizer(src) {
        const m = DISPLAY_RE.exec(src);
        if (m) return { type: 'mathBlock', raw: m[0], text: m[1].trim() };
      },
      renderer(token) { return render.block ? render.block(token) : token.raw; },
    },
    {
      name: 'mathInline',
      level: 'inline',
      start(src) { const i = src.indexOf('\\('); return i === -1 ? undefined : i; },
      tokenizer(src) {
        const m = INLINE_RE.exec(src);
        if (m) return { type: 'mathInline', raw: m[0], text: m[1].trim() };
      },
      renderer(token) { return render.inline ? render.inline(token) : token.raw; },
    },
  ];
}

// Pinned to match the import emitted into generated Typst chapter files.
export const MITEX_VERSION = '0.2.5';
