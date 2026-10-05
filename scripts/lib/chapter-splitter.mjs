// Shared chapter splitter — used by both md-to-typst.mjs and md-to-epub.mjs.
//
// Walks marked's top-level tokens and groups them into structural sections:
//   - frontmatter (everything before the first PART/Chapter heading)
//   - part        (a "# PART X: ..." or "# PARTE X: ..." divider — no body)
//   - chapter     (a "## Chapter N: Title" or "## Capítulo N: Título" section)
//   - appendix    (a "## Appendix X: Title" or "## Apêndice X: Título" / "## Apéndice X: Título" section)
//
// Each section carries:
//   - tokens     — marked tokens belonging to this section (for the Typst path)
//   - sourceText — exact MD substring of the section (for the HTML/EPUB path)

import { existsSync, readdirSync } from 'node:fs';
import { Marked } from 'marked';
import { mathExtensions } from './math.mjs';

const RE_PART     = /^(PART|PARTE)\s+/i;
const RE_CHAPTER  = /^(Chapter|Cap[íi]tulo)\s+(\d+)\s*[:—-]\s*(.+)$/i;
const RE_APPENDIX = /^(Appendix|Ap[eêé]ndice)\s+([A-Z])\s*[:—-]\s*(.+)$/i;

export function splitSections(mdSource, { gfm = true } = {}) {
  const marked = new Marked({ gfm });
  // Recognise $$…$$ / \(…\) as math tokens (renderers fire only on the parse
  // path; here we only lex, so md-to-typst can walk the math tokens).
  marked.use({ extensions: mathExtensions() });
  const tokens = marked.lexer(mdSource);

  const sections = [];
  let current = { kind: 'frontmatter', title: 'Front Matter', tokens: [] };
  sections.push(current);

  for (const t of tokens) {
    if (t.type === 'heading' && t.depth === 1 && RE_PART.test(t.text.trim())) {
      sections.push({ kind: 'part', title: t.text.trim(), tokens: [] });
      current = sections[sections.length - 1];
      continue;
    }
    if (t.type === 'heading' && t.depth === 2) {
      const m = t.text.match(RE_CHAPTER);
      if (m) {
        current = {
          kind: 'chapter',
          number: parseInt(m[2], 10),
          title: m[3].trim(),
          rawHeading: t,
          tokens: [],
        };
        sections.push(current);
        continue;
      }
      const a = t.text.match(RE_APPENDIX);
      if (a) {
        current = {
          kind: 'appendix',
          letter: a[2].toUpperCase(),
          title: a[3].trim(),
          rawHeading: t,
          tokens: [],
        };
        sections.push(current);
        continue;
      }
    }
    current.tokens.push(t);
  }

  // Attach sourceText to each section by concatenating raw spans of its tokens.
  // The chapter/appendix heading is added back at the top (it's not in tokens
  // since it served as the boundary marker).
  for (const s of sections) {
    let buf = '';
    if ((s.kind === 'chapter' || s.kind === 'appendix') && s.rawHeading) {
      buf += (s.rawHeading.raw ?? '');
    }
    for (const t of s.tokens) {
      buf += (t.raw ?? '');
    }
    s.sourceText = buf;
  }

  return sections;
}

// Lex a standalone Markdown string into marked tokens (same config as the
// section splitter). Used to convert optional front-matter pages.
export function lexMarkdown(md, { gfm = true } = {}) {
  const marked = new Marked({ gfm });
  marked.use({ extensions: mathExtensions() });
  return marked.lexer(md);
}

// Discover optional front-matter pages in `dir`: any `*.md` whose name is
// language-neutral (no lang segment) or matches `langTag` (e.g. dedicatoria.md
// or dedicatoria.pt-BR.md for a pt-BR build). Returned sorted by filename, so a
// numeric prefix (01-, 02-) controls order.
export function frontmatterFiles(dir, langTag) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => {
    if (!f.endsWith('.md')) return false;
    const m = f.match(/\.([A-Za-z]{2}(?:-[A-Za-z]{2})?)\.md$/);
    if (!m) return true;                                   // language-neutral
    return m[1].toLowerCase() === (langTag || '').toLowerCase();
  }).sort();
}

export function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Detect language tag from filename: BOOK.pt-BR.md → "pt-BR", BOOK.en.md → "en".
// Returns null for unrecognised patterns.
export function langFromFilename(path) {
  const m = path.match(/BOOK\.([a-zA-Z-]+)\.md$/);
  return m ? m[1] : null;
}

// Base language of the source file (pt | es | en), from BOOK.<lang>.md.
// Anything unrecognised falls back to English.
export function baseLangFromFilename(path) {
  const base = (langFromFilename(path) ?? '').split('-')[0].toLowerCase();
  return base in LABELS ? base : 'en';
}

// Words the generated output uses when re-emitting headings. The source
// headings are matched in every language by the RE_* patterns above.
const LABELS = {
  en: { chapter: 'Chapter',  part: 'Part',  appendix: 'Appendix', appendixSlug: 'appendix',
        appendices: ['Appendices', 'Exercises, Templates & Resources'] },
  pt: { chapter: 'Capítulo', part: 'Parte', appendix: 'Apêndice', appendixSlug: 'apendice',
        appendices: ['Apêndices', 'Exercícios, Templates & Recursos'] },
  es: { chapter: 'Capítulo', part: 'Parte', appendix: 'Apéndice', appendixSlug: 'apendice',
        appendices: ['Apéndices', 'Ejercicios, Plantillas y Recursos'] },
};

export function labelsFor(path) {
  return LABELS[baseLangFromFilename(path)];
}
