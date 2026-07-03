#!/usr/bin/env node
// Convert BOOK.{pt-BR,en}.md into an EPUB 3 file using the shared chapter
// splitter and marked.parse() for HTML rendering. Mermaid blocks are
// substituted with <figure><img> tags pointing at the pre-rendered SVGs.
//
// Cover: expects dist/cover-${lang}.png (rendered separately from
// typst/cover.typ via build.sh).
//
// Source of truth: BOOK.{pt-BR,en}.md. Re-run after every MD edit.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import katex from 'katex';
import { EPub } from '@lesjoursfr/html-to-epub';
import { splitSections, isPortugueseFilename, langFromFilename, frontmatterFiles } from './lib/chapter-splitter.mjs';
import { mathExtensions } from './lib/math.mjs';
import { fixEpubMathml } from './lib/epub-mathml-fix.mjs';
import { KIT_ROOT, PROJECT_ROOT } from './lib/config.mjs';

// ─── Source resolution ──────────────────────────────────────────────
const candidates = [process.env.SOURCE_MD, 'BOOK.pt-BR.md', 'BOOK.en.md'].filter(Boolean);
let MD = null;
for (const c of candidates) {
  const p = resolve(PROJECT_ROOT,c);
  if (existsSync(p)) { MD = p; break; }
}
if (!MD) {
  console.error('No source Markdown file found.');
  process.exit(1);
}
console.log(`▸ Source: ${MD.replace(PROJECT_ROOT + '/', '')}`);

const isPt = isPortugueseFilename(MD);
const rawLang = (langFromFilename(MD) ?? (isPt ? 'pt-BR' : 'en')).toLowerCase();

// ─── Metadata (from book.config.json — single source of truth) ───────
const cfg = JSON.parse(readFileSync(resolve(PROJECT_ROOT,'book.config.json'), 'utf8'));
const L = cfg.languages[isPt ? 'pt' : 'en'];
const langTag = L.langTag;
const meta = {
  title: L.title,
  subtitle: L.subtitle,
  author: cfg.author,
  publisher: cfg.publisher,
  tocTitle: L.tocName,
  preambleTitle: L.preambleTitle,
  partsLabel: L.partsLabel,
  appendixLabel: L.appendixLabel,
  description: L.description,
};

// ─── Cover ──────────────────────────────────────────────────────────
const COVER = resolve(PROJECT_ROOT,`dist/cover-${rawLang}.png`);
if (!existsSync(COVER)) {
  console.error(`Cover not found: ${COVER}`);
  console.error(`Run: typst compile typst/cover.typ dist/cover-${rawLang}.png --ppi 250 --format png ...`);
  process.exit(1);
}

// ─── Mermaid manifest (pre-rendered SVGs) ───────────────────────────
const MANIFEST_PATH = resolve(PROJECT_ROOT,'typst/assets/diagrams/manifest.json');
let diagramManifest = [];
if (existsSync(MANIFEST_PATH)) {
  diagramManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

// ─── Load + clean source ────────────────────────────────────────────
let src = readFileSync(MD, 'utf8');

// Strip Obsidian wikilinks.
src = src.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
         .replace(/\[\[([^\]]+)\]\]/g, (_, slug) => slug.replace(/-/g, ' '));

// Replace ```mermaid blocks with raw HTML <figure><img>. Marked will pass
// raw block HTML through to the output untouched.
let mermaidCursor = 0;
src = src.replace(/```mermaid[ \t]*\r?\n[\s\S]*?\r?\n```/g, () => {
  mermaidCursor++;
  const entry = diagramManifest[mermaidCursor - 1];
  if (!entry) {
    return `<p><em>[Missing diagram #${mermaidCursor}]</em></p>`;
  }
  const absPath = resolve(PROJECT_ROOT,'typst', entry.file);
  return `<figure><img src="${absPath}" alt="Diagrama ${mermaidCursor}" /></figure>`;
});
console.log(`▸ Substituted ${mermaidCursor} Mermaid blocks.`);

// ─── Split and render each section to HTML ───────────────────────────
const sections = splitSections(src);
const marked = new Marked({ gfm: true, breaks: false });

// Math → KaTeX MathML (output: 'mathml' needs no CSS/fonts and is EPUB 3
// native). Display equations get a centring wrapper; inline stays in flow.
const katexMathml = (tex, displayMode) =>
  katex.renderToString(tex, { displayMode, throwOnError: false, output: 'mathml' });
marked.use({ extensions: mathExtensions({
  block:  (t) => `<div class="equation">${katexMathml(t.text, true)}</div>`,
  inline: (t) => katexMathml(t.text, false),
}) });

const content = [];

for (const s of sections) {
  if (s.kind === 'frontmatter') {
    // Drop the leading title block (H1 title + H2 subtitle + H3 tagline +
    // optional `---` separator). EPUB cover/title metadata already shows
    // title + subtitle; repeating them would duplicate entries in the
    // reader's navigation.
    let text = s.sourceText;
    const beforeHr = text.match(/^([\s\S]*?)(\r?\n---\r?\n)/);
    if (beforeHr) {
      text = text.slice(beforeHr[0].length);
    } else {
      text = text.replace(/^#\s+[^\n]+\n+/, '');
    }
    const html = marked.parse(text);
    if (html.trim()) {
      content.push({
        title: meta.preambleTitle,
        data: `<div>${html}</div>`,
      });
    }
    continue;
  }

  if (s.kind === 'part') {
    const m = s.title.match(/^(?:PART|PARTE)\s+([IVX]+)\s*[:—-]\s*(.+)$/i);
    const num = m ? m[1] : '';
    const name = m ? m[2].trim() : s.title;
    content.push({
      title: `${meta.partsLabel} ${num}: ${name}`,
      data: `<div class="part-divider">
        <p class="label">${meta.partsLabel} ${num}</p>
        <h1 class="name">${escapeHtml(name)}</h1>
      </div>`,
    });
    continue;
  }

  if (s.kind === 'chapter') {
    const promoted = s.sourceText.replace(/^##\s+/, '# ');
    const html = marked.parse(promoted);
    content.push({
      title: `Cap. ${s.number}: ${s.title}`,
      data: `<div>${html}</div>`,
    });
    continue;
  }

  if (s.kind === 'appendix') {
    const promoted = s.sourceText.replace(/^##\s+/, '# ');
    const html = marked.parse(promoted);
    content.push({
      title: `${meta.appendixLabel} ${s.letter}: ${s.title}`,
      data: `<div>${html}</div>`,
    });
    continue;
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Front matter (optional MD pages) ────────────────────────────────
// Placed before every other section AND kept out of the reader's TOC via
// beforeToc:true. Title is derived from the filename (order prefix + lang tag
// stripped). Front matter is prose only — no diagrams.
function fmTitle(f) {
  return f.replace(/\.[A-Za-z]{2}(?:-[A-Za-z]{2})?\.md$/, '').replace(/\.md$/, '')
          .replace(/^\d+[-_]/, '')
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
}
const FM_DIR = resolve(PROJECT_ROOT, 'frontmatter');
const fmSections = frontmatterFiles(FM_DIR, langFromFilename(MD)).map((f) => ({
  title: fmTitle(f),
  data: `<div class="frontmatter">${marked.parse(readFileSync(resolve(FM_DIR, f), 'utf8'))}</div>`,
  beforeToc: true,
}));
content.unshift(...fmSections);
if (fmSections.length) console.log(`▸ Added ${fmSections.length} front-matter page(s).`);

// ─── Assemble EPUB ───────────────────────────────────────────────────
const OUTPUT = resolve(PROJECT_ROOT,`dist/book-${rawLang}.epub`);
const css = readFileSync(resolve(KIT_ROOT, 'scripts/epub.css'), 'utf8');

const options = {
  title: meta.title,
  author: [meta.author],
  publisher: meta.publisher,
  description: meta.description,
  lang: langTag,
  cover: COVER,
  tocTitle: meta.tocTitle,
  appendChapterTitles: false,
  css,
  content,
  verbose: false,
};

console.log(`▸ Building EPUB with ${content.length} sections...`);
const epub = new EPub(options, OUTPUT);
await epub.render();

// html-to-epub strips the MathML namespace and doesn't flag MathML manifest
// items — repair both so KaTeX equations are valid EPUB 3 MathML.
const fixedDocs = await fixEpubMathml(OUTPUT);
if (fixedDocs > 0) console.log(`▸ Repaired MathML in ${fixedDocs} document(s).`);

console.log(`✅ Built: ${OUTPUT}`);
