#!/usr/bin/env node
// Verify the HTML edition against its Markdown source. Exits 1 on any failure.
//
// "Precise" is checked, not assumed:
//   1. Content parity, per chapter/appendix/preamble: the number of headings,
//      tables, code blocks, diagrams and list items in the HTML equals what the
//      Markdown tokens contain (the same token stream the PDF and EPUB use).
//   2. Totals: every Mermaid diagram in the manifest appears exactly once.
//   3. Integrity: every internal link/asset resolves, every #fragment has a
//      target id, no duplicate ids, exactly one <h1> per page, no placeholders.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { lexMarkdown } from './lib/chapter-splitter.mjs';
import { PROJECT_ROOT } from './lib/config.mjs';
import { resolveSource, loadMeta, loadDiagramManifest, stripTitleBlock, buildSections } from './lib/prepare.mjs';

const { path: MD, baseLang, rawLang } = resolveSource();
const SITE = resolve(PROJECT_ROOT, 'dist/html', rawLang);
if (!existsSync(SITE)) { console.error(`✗ ${SITE} not found. Build the HTML first.`); process.exit(1); }

const { cfg, meta } = loadMeta(baseLang);
const only = Array.isArray(cfg.html?.chapters) ? cfg.html.chapters.map((c) => String(c).toUpperCase()) : null;
const manifest = loadDiagramManifest();
// Count against the original source: mermaid blocks must stay tokens.
const raw = readFileSync(MD, 'utf8');
const sections = buildSections(raw, { baseLang, meta, path: MD });

const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

// ─── Source-side counts ─────────────────────────────────────────────
function count(tokens, acc = { heading: 0, table: 0, code: 0, diagram: 0, li: 0 }) {
  for (const t of tokens) {
    if (t.type === 'heading') acc.heading++;
    else if (t.type === 'table') acc.table++;
    else if (t.type === 'code') (t.lang || '').trim().split(/\s+/)[0] === 'mermaid' ? acc.diagram++ : acc.code++;
    else if (t.type === 'list') for (const it of t.items) { acc.li++; count(it.tokens ?? [], acc); }
    else if (t.type === 'blockquote') count(t.tokens ?? [], acc);
  }
  return acc;
}

const files = readdirSync(SITE).filter((f) => f.endsWith('.html'));
const read = (f) => readFileSync(resolve(SITE, f), 'utf8');
const article = (html) => (html.match(/<article[\s\S]*?<\/article>/) || [''])[0];
const htmlCounts = (html) => {
  const a = article(html);
  return {
    heading: (a.match(/<h[2-6] id=/g) || []).length,
    table: (a.match(/<table[ >]/g) || []).length,
    code: (a.match(/<div class="code"/g) || []).length,
    diagram: (a.match(/<figure class="diagram"/g) || []).length,
    li: (a.match(/<li[ >]/g) || []).length,
  };
};

let diagramsInSite = 0;
let comparedPages = 0;
for (const s of sections) {
  let file;
  let expected;
  if (s.kind === 'chapter') {
    if (only && !only.includes(String(s.number))) continue;
    file = files.find((f) => new RegExp(`^[a-z]+-${s.number}-`).test(f) && !/^(part|parte|appendix|apendice)-/.test(f));
    expected = count(s.tokens);
  } else if (s.kind === 'appendix') {
    if (only && !only.includes(s.letter)) continue;
    file = files.find((f) => new RegExp(`^(appendix|apendice)-${s.letter.toLowerCase()}-`).test(f));
    expected = count(s.tokens);
  } else if (s.kind === 'frontmatter') {
    const text = stripTitleBlock(s.sourceText);
    if (!text.trim()) continue;
    file = files.find((f) => !/^(index|copyright|direitos|part|parte|chapter|capitulo|appendix|apendice)/.test(f));
    expected = count(lexMarkdown(text));
  } else continue;

  const label = `${s.kind} ${s.number ?? s.letter ?? ''}`.trim();
  if (!file) { fail(label, 'no HTML page found'); continue; }
  const got = htmlCounts(read(file));
  diagramsInSite += got.diagram;
  comparedPages++;
  for (const k of Object.keys(expected)) {
    if (expected[k] !== got[k]) fail(`${label} (${file})`, `${k}: source ${expected[k]} ≠ html ${got[k]}`);
  }
}

if (!only && diagramsInSite !== manifest.length) {
  fail('diagrams', `manifest has ${manifest.length}, site has ${diagramsInSite}`);
}

// ─── Integrity ──────────────────────────────────────────────────────
const idsOf = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const allIds = new Map(files.map((f) => [f, new Set(idsOf(read(f)))]));
for (const f of files) {
  const html = read(f);
  const ids = idsOf(html);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) fail(f, `duplicate ids: ${[...new Set(dup)].slice(0, 3).join(', ')}`);
  if ((html.match(/<h1[ >]/g) || []).length > 1) fail(f, 'more than one <h1>');
  if (f !== 'index.html' && (html.match(/<h1[ >]/g) || []).length !== 1) fail(f, 'expected exactly one <h1>');
  if (!/<title>[^<]+<\/title>/.test(html)) fail(f, 'empty <title>');
  // Outside code blocks (prose may legitimately say "undefined"), and in attributes.
  const prose = html.replace(/<pre[\s\S]*?<\/pre>/g, '');
  if (/Missing diagram|\[object Object\]/.test(prose) || /(?:href|src|content|id|class)="[^"]*undefined/.test(html)) {
    fail(f, 'placeholder/undefined text in output');
  }

  for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const url = m[1];
    if (!url || /^(https?:|mailto:|data:|\/\/)/.test(url)) continue;
    const [pathQ, frag] = url.split('#');
    const path = pathQ.split('?')[0];   // cache-busting ?v=hash is not part of the file name
    // Links to another language's site are only checkable when that site was built too.
    if (path.startsWith('../') && !existsSync(resolve(SITE, '..', path.split('/')[1]))) continue;
    const target = path ? resolve(SITE, dirname(f), path) : null;
    if (target && !existsSync(target)) { fail(f, `broken link: ${url}`); continue; }
    if (frag) {
      const tf = path || f;
      const ids = allIds.get(tf.replace(/^\.\//, ''));
      if (ids && !ids.has(decodeURIComponent(frag))) fail(f, `missing anchor: ${url}`);
    }
  }
}

console.log(`▸ Checked ${comparedPages} content pages + ${files.length} files in ${SITE.replace(PROJECT_ROOT + '/', '')}/`);
if (failures.length) {
  console.error(`✗ ${failures.length} problem(s):`);
  for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('✓ HTML matches the source: headings, tables, code, diagrams, list items, links.');
