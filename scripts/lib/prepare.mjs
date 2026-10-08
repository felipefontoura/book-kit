// Shared "Markdown → renderable sections" preparation for the HTML-family
// targets (EPUB and the HTML site).
//
// Both targets used to carry their own copy of these steps; keeping a single
// implementation is what guarantees the formats stay in sync (same wikilink
// handling, same diagram order, same title-block stripping, same math).
//
// The Typst path walks marked *tokens* instead (md-to-typst.mjs), but it shares
// the splitter and the manifest, so section boundaries and diagram numbering
// are identical across all three formats.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Marked } from 'marked';
import katex from 'katex';
import { splitSections, baseLangFromFilename, langFromFilename, labelsFor } from './chapter-splitter.mjs';
import { mathExtensions } from './math.mjs';
import { PROJECT_ROOT } from './config.mjs';

// ─── Source + metadata ──────────────────────────────────────────────

// First match wins: $SOURCE_MD, BOOK.pt-BR.md, BOOK.en.md (same order as build.sh).
export function resolveSource() {
  const candidates = [process.env.SOURCE_MD, 'BOOK.pt-BR.md', 'BOOK.en.md'].filter(Boolean);
  for (const c of candidates) {
    const p = resolve(PROJECT_ROOT, c);
    if (existsSync(p)) {
      const baseLang = baseLangFromFilename(p);
      return { path: p, baseLang, rawLang: (langFromFilename(p) ?? baseLang).toLowerCase() };
    }
  }
  console.error('No source Markdown file found.');
  process.exit(1);
}

export function loadMeta(baseLang) {
  const cfg = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'book.config.json'), 'utf8'));
  const L = cfg.languages[baseLang];
  return {
    cfg,
    L,
    langTag: L.langTag,
    meta: {
      title: L.title,
      subtitle: L.subtitle,
      eyebrow: L.eyebrow,
      author: cfg.author,
      publisher: cfg.publisher,
      tocTitle: L.tocName,
      preambleTitle: L.preambleTitle,
      partsLabel: L.partsLabel,
      appendixLabel: L.appendixLabel,
      description: L.description,
      copyright: L.copyright ?? [],
    },
  };
}

// Pre-rendered Mermaid SVGs, in document order (written by render-mermaid.mjs).
export function loadDiagramManifest() {
  const p = resolve(PROJECT_ROOT, 'typst/assets/diagrams/manifest.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
}

// ─── Markdown clean-up ──────────────────────────────────────────────

// Strip Obsidian wikilinks, then swap each ```mermaid block for whatever
// `figure(entry, n)` returns (raw HTML — marked passes block HTML through).
// Returns the rewritten source and how many blocks were substituted.
export function prepareMarkdown(src, { manifest, figure, missing }) {
  src = src.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
           .replace(/\[\[([^\]]+)\]\]/g, (_, slug) => slug.replace(/-/g, ' '));

  let n = 0;
  src = src.replace(/```mermaid[ \t]*\r?\n[\s\S]*?\r?\n```/g, () => {
    n++;
    const entry = manifest[n - 1];
    return entry ? figure(entry, n) : missing(n);
  });
  return { src, diagrams: n };
}

// The leading title block (H1 title + H2 subtitle + H3 tagline + optional
// `---`) duplicates what the cover/metadata already show, so the "Why this
// book exists" preamble starts after it.
export function stripTitleBlock(text) {
  const beforeHr = text.match(/^([\s\S]*?)(\r?\n---\r?\n)/);
  if (beforeHr) return text.slice(beforeHr[0].length);
  return text.replace(/^#\s+[^\n]+\n+/, '');
}

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── marked + math ──────────────────────────────────────────────────

// Math → KaTeX MathML (output: 'mathml' needs no CSS/fonts and is native to
// EPUB 3 and every current browser). Display equations get a centring wrapper;
// inline stays in flow. `extra` lets a target add its own marked extension
// (the HTML site hooks heading ids and code highlighting there).
export function makeMarked(extra = {}) {
  const marked = new Marked({ gfm: true, breaks: false });
  const katexMathml = (tex, displayMode) =>
    katex.renderToString(tex, { displayMode, throwOnError: false, output: 'mathml' });
  marked.use({ extensions: mathExtensions({
    block:  (t) => `<div class="equation">${katexMathml(t.text, true)}</div>`,
    inline: (t) => katexMathml(t.text, false),
  }) });
  if (extra && Object.keys(extra).length) marked.use(extra);
  return marked;
}

// ─── Sections ───────────────────────────────────────────────────────

// Split into structural sections and attach the pieces every HTML target needs
// (localized display title, part number/name). Rendering stays with the caller.
export function buildSections(src, { baseLang, meta, path }) {
  const labels = labelsFor(path);
  return splitSections(src).map((s) => {
    if (s.kind === 'part') {
      const m = s.title.match(/^(?:PART|PARTE)\s+([IVX]+)\s*[:—-]\s*(.+)$/i);
      const num = m ? m[1] : '';
      const name = m ? m[2].trim() : s.title;
      return { ...s, num, name, displayTitle: `${meta.partsLabel} ${num}: ${name}` };
    }
    if (s.kind === 'chapter') {
      return { ...s, displayTitle: `${labels.chapter} ${s.number}: ${s.title}` };
    }
    if (s.kind === 'appendix') {
      return { ...s, displayTitle: `${meta.appendixLabel} ${s.letter}: ${s.title}` };
    }
    return { ...s, displayTitle: meta.preambleTitle };
  });
}

// Chapter/appendix sources start with "## Chapter N: …"; in a standalone page
// that heading is the page's H1.
export function promoteHeading(sourceText) {
  return sourceText.replace(/^##\s+/, '# ');
}
