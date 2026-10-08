#!/usr/bin/env node
// Convert BOOK.{pt-BR,en,es}.md into an EPUB 3 file using the shared chapter
// splitter and marked.parse() for HTML rendering. Mermaid blocks are
// substituted with <figure><img> tags pointing at the pre-rendered SVGs.
//
// Source resolution, metadata, Markdown clean-up and math live in
// lib/prepare.mjs, shared with md-to-html.mjs so both formats stay in sync.
//
// Cover: expects dist/cover-${lang}.png (rendered separately from
// typst/cover.typ via build.sh).
//
// Source of truth: BOOK.{pt-BR,en,es}.md. Re-run after every MD edit.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { EPub } from '@lesjoursfr/html-to-epub';
import { langFromFilename, frontmatterFiles, labelsFor } from './lib/chapter-splitter.mjs';
import { fixEpubMathml } from './lib/epub-mathml-fix.mjs';
import { KIT_ROOT, PROJECT_ROOT } from './lib/config.mjs';
import {
  resolveSource, loadMeta, loadDiagramManifest, prepareMarkdown, stripTitleBlock,
  escapeHtml, makeMarked, buildSections, promoteHeading,
} from './lib/prepare.mjs';

// ─── Source + metadata (book.config.json — single source of truth) ───
const { path: MD, baseLang, rawLang } = resolveSource();
console.log(`▸ Source: ${MD.replace(PROJECT_ROOT + '/', '')}`);
const { langTag, meta } = loadMeta(baseLang);
const labels = labelsFor(MD);

// ─── Cover ──────────────────────────────────────────────────────────
const COVER = resolve(PROJECT_ROOT,`dist/cover-${rawLang}.png`);
if (!existsSync(COVER)) {
  console.error(`Cover not found: ${COVER}`);
  console.error(`Run: typst compile typst/cover.typ dist/cover-${rawLang}.png --ppi 250 --format png ...`);
  process.exit(1);
}

// ─── Load + clean source ────────────────────────────────────────────
const { src, diagrams } = prepareMarkdown(readFileSync(MD, 'utf8'), {
  manifest: loadDiagramManifest(),
  figure: (entry, n) => {
    const absPath = resolve(PROJECT_ROOT, 'typst', entry.file);
    return `<figure><img src="${absPath}" alt="${labels.diagram} ${n}" /></figure>`;
  },
  missing: (n) => `<p><em>[Missing diagram #${n}]</em></p>`,
});
console.log(`▸ Substituted ${diagrams} Mermaid blocks.`);

// ─── Split and render each section to HTML ───────────────────────────
const sections = buildSections(src, { baseLang, meta, path: MD });
const marked = makeMarked();

const content = [];

for (const s of sections) {
  if (s.kind === 'frontmatter') {
    const html = marked.parse(stripTitleBlock(s.sourceText));
    if (html.trim()) {
      content.push({ title: s.displayTitle, data: `<div>${html}</div>` });
    }
    continue;
  }

  if (s.kind === 'part') {
    content.push({
      title: s.displayTitle,
      data: `<div class="part-divider">
        <p class="label">${meta.partsLabel} ${s.num}</p>
        <h1 class="name">${escapeHtml(s.name)}</h1>
      </div>`,
    });
    continue;
  }

  if (s.kind === 'chapter' || s.kind === 'appendix') {
    content.push({
      title: s.shortTitle ?? s.displayTitle,
      data: `<div>${marked.parse(promoteHeading(s.sourceText))}</div>`,
    });
    continue;
  }
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
