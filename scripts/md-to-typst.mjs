#!/usr/bin/env node
// Convert BOOK.{pt-BR,en}.md into Typst chapter files under typst/chapters/.
// Also generates typst/chapters.typ which orders the chapters and
// inserts part dividers. Mermaid blocks are replaced by figure(image())
// references using typst/assets/diagrams/manifest.json.
//
// Source of truth: BOOK.{pt-BR,en}.md. Re-run after every MD edit.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { splitSections, slugify, isPortugueseFilename, langFromFilename, frontmatterFiles, lexMarkdown } from './lib/chapter-splitter.mjs';
import { MITEX_VERSION } from './lib/math.mjs';
import { PROJECT_ROOT, loadConfig, kitDir } from './lib/config.mjs';

// Generated Typst output lives in the project; kit-owned modules (template,
// worksheet) are referenced by absolute-from-root path (prefixed with the kit's
// submodule dir) so the includes resolve whether the engine is this repo or a
// git submodule. KIT_PREFIX is "" in single-repo mode.
const KIT_PREFIX = kitDir(loadConfig()) ? '/' + kitDir(loadConfig()) : '';
const CHAPTERS_DIR = resolve(PROJECT_ROOT, 'typst/chapters');
const CHAPTERS_INDEX = resolve(PROJECT_ROOT, 'typst/chapters.typ');
const MANIFEST = resolve(PROJECT_ROOT, 'typst/assets/diagrams/manifest.json');

// Source resolution: env override → PT-BR default → EN fallback.
const candidates = [process.env.SOURCE_MD, 'BOOK.pt-BR.md', 'BOOK.en.md'].filter(Boolean);
let MD = null;
for (const c of candidates) {
  const p = resolve(PROJECT_ROOT, c);
  if (existsSync(p)) { MD = p; break; }
}
if (!MD) {
  console.error('No source Markdown file found.');
  process.exit(1);
}
console.log(`▸ Source: ${MD.replace(PROJECT_ROOT + '/', '')}`);

const isPortuguese = isPortugueseFilename(MD);

// ─── Load Mermaid manifest ────────────────────────────────────────────
let diagramManifest = [];
if (existsSync(MANIFEST)) {
  diagramManifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
}
let diagramCursor = 0;

// ─── Load + clean source, split into sections ────────────────────────
let src = readFileSync(MD, 'utf8');

// Strip Obsidian wikilinks — the PT source comes from a vault and may contain
// [[slug]] / [[slug|label]] links that have no meaning standalone.
src = src.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
         .replace(/\[\[([^\]]+)\]\]/g, (_, slug) => slug.replace(/-/g, ' '));

const sections = splitSections(src);

// ─── Token → Typst renderer ───────────────────────────────────────────

// mitex renders the (LaTeX) math source inside Typst. Imported per-file only
// when a file actually contains math, so equation-free builds never need the
// package. Reset before each file; checked after rendering its body.
const MITEX_IMPORT = `#import "@preview/mitex:${MITEX_VERSION}": mi, mitex`;
// worksheet.typ is a kit module — import it by absolute-from-root path so it
// resolves whether the engine is this repo or a submodule (KIT_PREFIX="" locally).
const WORKSHEET_IMPORT = `#import "${KIT_PREFIX}/typst/worksheet.typ": worksheet`;
let usesMath = false;
let usesWorksheet = false;

function fenceLen(code) {
  let max = 0, cur = 0;
  for (const c of code) {
    if (c === '`') { cur++; if (cur > max) max = cur; }
    else cur = 0;
  }
  return Math.max(3, max + 1);
}

// Wrap a LaTeX string as a Typst raw literal so backslashes/quotes/# pass
// through untouched. Picks a backtick fence longer than any run in the text.
function typstRaw(s) {
  const runs = s.match(/`+/g);
  const n = runs ? Math.max(...runs.map(r => r.length)) + 1 : 1;
  const fence = '`'.repeat(n);
  return fence + s + fence;
}

// Escape characters that have meaning in Typst markup mode.
function escapeMarkup(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([#@$*_`<>])/g, '\\$1');
}

function escapeContent(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([\[\]#@$*_`])/g, '\\$1');
}

function renderInline(tokens) {
  let out = '';
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
        if (t.tokens && t.tokens.length) {
          out += renderInline(t.tokens);
        } else {
          out += escapeMarkup(t.text);
        }
        break;
      case 'strong':
        // Use function form (#strong[...]) instead of markup *...* because
        // Typst markup requires a word-boundary after the closing *, which
        // breaks for letter-leading cases like "*A*cknowledge".
        out += '#strong[' + renderInline(t.tokens) + ']';
        break;
      case 'em':
        // Same rationale as strong — use function form to avoid markup
        // ambiguity at word boundaries.
        out += '#emph[' + renderInline(t.tokens) + ']';
        break;
      case 'codespan': {
        // Function form, not markup fences: a 3+-backtick fence makes Typst
        // parse the first word as a language tag, silently swallowing spans
        // like `accent` (tag + empty body) or `github.com/...` (tag "github").
        const s = t.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        out += `#raw("${s}")`;
        break;
      }
      case 'del':
        out += '#strike[' + renderInline(t.tokens) + ']';
        break;
      case 'mathInline':
        usesMath = true;
        out += '#mi(' + typstRaw(t.text) + ')';
        break;
      case 'link': {
        const inner = renderInline(t.tokens);
        out += `#link("${t.href.replace(/"/g, '\\"')}")[${inner}]`;
        break;
      }
      case 'image':
        out += `#image("${t.href}", alt: "${(t.text || '').replace(/"/g, '\\"')}")`;
        break;
      case 'br':
        out += ' \\\n';
        break;
      case 'escape':
        out += escapeMarkup(t.text);
        break;
      case 'html':
        break;
      default:
        if (t.text) out += escapeMarkup(t.text);
    }
  }
  return out;
}

function renderTable(t) {
  const cols = t.header.length;
  const cells = [];
  for (const h of t.header) {
    cells.push('[' + renderInline(h.tokens) + ']');
  }
  for (const row of t.rows) {
    for (const cell of row) {
      cells.push('[' + renderInline(cell.tokens) + ']');
    }
  }
  return `#table(\n  columns: ${cols},\n  ${cells.join(', ')},\n)\n\n`;
}

function renderList(t) {
  const marker = t.ordered ? '+' : '-';
  let out = '';
  for (const item of t.items) {
    const body = renderBlocks(item.tokens, { inList: true }).trimEnd();
    const lines = body.split('\n');
    out += `${marker} ${lines[0]}\n`;
    for (let i = 1; i < lines.length; i++) {
      out += lines[i] === '' ? '\n' : `  ${lines[i]}\n`;
    }
  }
  return out + '\n';
}

function renderCode(t) {
  if ((t.lang || '').toLowerCase() === 'mermaid') {
    diagramCursor++;
    const entry = diagramManifest[diagramCursor - 1];
    if (!entry) {
      console.warn(`  ! Mermaid block #${diagramCursor} has no manifest entry — leaving placeholder.`);
      return `#block(fill: rgb("#fee"), inset: 8pt)[*Missing diagram ${diagramCursor}*]\n\n`;
    }
    // entry.file is "assets/diagrams/diagram-NNN.svg" (relative to typst/).
    // Chapter files live in typst/chapters/, so we prepend "../" so Typst
    // resolves the SVG relative to the chapter file's location.
    //
    // Fit the SVG within the print area. Mermaid emits width="100%" with only
    // a viewBox, so a tall flowchart at width:90% blows past the page height
    // and clips. Bind by the tighter dimension for the diagram's aspect ratio.
    const MAX_W = 4.5; // in — full text width (diagrams read bigger on the page)
    const MAX_H = 6.5;  // in — fits within the 7.3in text height with breathing room
    let sizing = `width: ${MAX_W}in`;
    try {
      const svg = readFileSync(resolve(PROJECT_ROOT, 'typst', entry.file), 'utf8');
      const vb = svg.match(/viewBox="[\d.eE+\-]+\s+[\d.eE+\-]+\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)"/);
      if (vb) {
        const w = parseFloat(vb[1]), h = parseFloat(vb[2]);
        if (w > 0 && h > 0) {
          sizing = (w / h >= MAX_W / MAX_H) ? `width: ${MAX_W}in` : `height: ${MAX_H}in`;
        }
      }
    } catch { /* fall back to width binding */ }
    return `#figure(\n  image("../${entry.file}", ${sizing}),\n  caption: none,\n)\n\n`;
  }
  // A ```worksheet block is the diagnostic "folha": a filled FORM, not code.
  // Parse its lines (title: / section: / note: / "Label | Value") into a
  // #worksheet(...) call so the template renders label→value rows whose values
  // wrap naturally instead of clipping like monospaced text.
  if ((t.lang || '').toLowerCase() === 'worksheet') {
    usesWorksheet = true;
    // Values are emitted as Typst STRINGS (not [content]) so nothing in them is
    // ever interpreted as markup — a value like "= a frase…" or "~250 h" would
    // otherwise be read as a heading / non-breaking space inside the container.
    const str = (s) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    let title = null;
    const rows = [];
    for (const raw of t.text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (/^title:/i.test(line)) title = line.replace(/^title:/i, '').trim();
      else if (/^section:/i.test(line)) rows.push(['section', line.replace(/^section:/i, '').trim()]);
      else if (/^note:/i.test(line)) rows.push(['note', line.replace(/^note:/i, '').trim()]);
      else if (line.includes('|')) {
        const i = line.indexOf('|');
        rows.push(['field', line.slice(0, i).trim(), line.slice(i + 1).trim()]);
      } else {
        rows.push(['note', line]);
      }
    }
    let out = '#worksheet(\n';
    if (title) out += `  title: ${str(title)},\n`;
    out += '  rows: (\n';
    for (const r of rows) {
      if (r[0] === 'section') out += `    ("section", ${str(r[1])}),\n`;
      else if (r[0] === 'note') out += `    ("note", ${str(r[1])}),\n`;
      else out += `    ("field", ${str(r[1])}, ${str(r[2])}),\n`;
    }
    out += '  ),\n)\n\n';
    return out;
  }

  const n = fenceLen(t.text);
  const fence = '`'.repeat(n);
  const lang = t.lang ? t.lang.split(/\s+/)[0] : '';
  return `${fence}${lang}\n${t.text}\n${fence}\n\n`;
}

function renderBlockquote(t) {
  const inner = renderBlocks(t.tokens).trimEnd();
  const indented = inner.split('\n').map(l => l ? '  ' + l : l).join('\n');
  return `#quote(block: true)[\n${indented}\n]\n\n`;
}

function renderHeading(t, demote = 0, frontmatter = false) {
  const text = renderInline(t.tokens);
  // Front-matter titles must NOT be real headings — a heading element would pull
  // them into the TOC and the running header. Render as a soft centred title.
  if (frontmatter) return `#align(center)[#text(weight: 600, size: 1.25em)[${text}]]\n\n`;
  const depth = Math.max(1, t.depth - demote);
  const level = '='.repeat(depth);
  return `${level} ${text}\n\n`;
}

function renderBlocks(tokens, opts = {}) {
  const demote = opts.demote ?? 0;
  let out = '';
  for (const t of tokens) {
    switch (t.type) {
      case 'heading':
        out += renderHeading(t, demote, opts.frontmatter);
        break;
      case 'paragraph':
        out += renderInline(t.tokens) + '\n\n';
        break;
      case 'text':
        if (t.tokens) out += renderInline(t.tokens) + '\n';
        else out += escapeMarkup(t.text) + '\n';
        break;
      case 'code':
        out += renderCode(t);
        break;
      case 'mathBlock':
        usesMath = true;
        // mitex(...) yields a Typst block equation (display, centred).
        out += `#mitex(${typstRaw(t.text)})\n\n`;
        break;
      case 'table':
        out += renderTable(t);
        break;
      case 'list':
        out += renderList(t);
        break;
      case 'blockquote':
        out += renderBlockquote(t);
        break;
      case 'hr':
        break;
      case 'space':
        break;
      case 'html':
        break;
      default:
        console.warn(`  ! Unhandled token type: ${t.type}`);
    }
  }
  return out;
}

// ─── Emit chapter files ───────────────────────────────────────────────

rmSync(CHAPTERS_DIR, { recursive: true, force: true });
mkdirSync(CHAPTERS_DIR, { recursive: true });

const indexEntries = [];

function pad2(n) { return String(n).padStart(2, '0'); }

let fileIdx = 0;
for (const s of sections) {
  if (s.kind === 'part') {
    indexEntries.push({ kind: 'part', title: s.title });
    continue;
  }

  let filename, heading;
  if (s.kind === 'frontmatter') {
    filename = '00-frontmatter.typ';
    fileIdx = 0;
    heading = null;
  } else if (s.kind === 'chapter') {
    fileIdx++;
    const slug = slugify(s.title);
    filename = `${pad2(fileIdx)}-${slug}.typ`;
    const chapterWord = isPortuguese ? 'Capítulo' : 'Chapter';
    heading = { level: 2, text: `${chapterWord} ${s.number}: ${s.title}` };
  } else if (s.kind === 'appendix') {
    fileIdx++;
    const slug = slugify(s.title);
    const appendixWord = isPortuguese ? 'apendice' : 'appendix';
    filename = `${pad2(fileIdx)}-${appendixWord}-${s.letter.toLowerCase()}-${slug}.typ`;
    const word = isPortuguese ? 'Apêndice' : 'Appendix';
    heading = { level: 2, text: `${word} ${s.letter}: ${s.title}` };
  }

  let body = '';
  let renderOpts = {};
  usesMath = false;
  usesWorksheet = false;
  if (s.kind === 'chapter' || s.kind === 'appendix') {
    body += `= ${escapeMarkup(heading.text)}\n\n`;
    renderOpts = { demote: 1 };
  } else if (s.kind === 'frontmatter') {
    // Drop the leading title block (H1 title + H2 subtitle + H3 tagline +
    // optional `---` separator). The template renders title/subtitle on
    // the title page; rendering them again here would duplicate them in
    // the TOC and body. The convention is that the first `hr` token marks
    // the boundary between the title block and the actual preamble.
    const firstHrIdx = s.tokens.findIndex(t => t.type === 'hr');
    const titleBlockOnly = s.tokens
      .slice(0, firstHrIdx === -1 ? s.tokens.length : firstHrIdx)
      .every(t => t.type === 'heading' || t.type === 'space' || t.type === 'blockquote' || t.type === 'paragraph');
    if (firstHrIdx !== -1 && firstHrIdx < 10 && titleBlockOnly) {
      s.tokens.splice(0, firstHrIdx + 1);
    } else {
      const firstH1Idx = s.tokens.findIndex(t => t.type === 'heading' && t.depth === 1);
      if (firstH1Idx !== -1 && firstH1Idx < 3) {
        s.tokens.splice(firstH1Idx, 1);
      }
    }
  }
  body += renderBlocks(s.tokens, renderOpts);

  // Prepend the mitex import only when this file emitted math.
  if (usesMath) body = `${MITEX_IMPORT}\n\n${body}`;
  if (usesWorksheet) body = `${WORKSHEET_IMPORT}\n\n${body}`;

  const filePath = resolve(CHAPTERS_DIR, filename);
  writeFileSync(filePath, body);
  indexEntries.push({ kind: 'file', filename, title: s.title });
  console.log(`  ↳ ${filename}`);
}

// ─── Front matter pages (optional MD files) ──────────────────────────
// frontmatter/*.md (language-neutral, or matching this book's lang) become
// pages placed between the copyright and the TOC. Processed AFTER chapters so a
// stray diagram here can't steal a chapter's manifest entry. frontmatter.typ is
// always (re)written so book.typ can include it unconditionally — it's just the
// import when there are no pages, which renders nothing.
const FM_DIR = resolve(PROJECT_ROOT, 'frontmatter');
const FM_OUT = resolve(PROJECT_ROOT, 'typst/frontmatter');
rmSync(FM_OUT, { recursive: true, force: true });
const fmList = frontmatterFiles(FM_DIR, langFromFilename(MD));
let fmIndex = '// Generated by scripts/md-to-typst.mjs — do not edit by hand.\n';
fmIndex += `#import "${KIT_PREFIX}/typst/template.typ": frontmatter-page\n\n`;
if (fmList.length) {
  mkdirSync(FM_OUT, { recursive: true });
  let fi = 0;
  for (const f of fmList) {
    fi++;
    usesMath = false;
    usesWorksheet = false;
    let fbody = renderBlocks(lexMarkdown(readFileSync(resolve(FM_DIR, f), 'utf8')), { frontmatter: true });
    if (usesMath) fbody = `${MITEX_IMPORT}\n\n${fbody}`;
    if (usesWorksheet) fbody = `${WORKSHEET_IMPORT}\n\n${fbody}`;
    const fn = `${pad2(fi)}.typ`;
    writeFileSync(resolve(FM_OUT, fn), fbody);
    fmIndex += `#frontmatter-page(include "frontmatter/${fn}")\n`;
    console.log(`  ↳ frontmatter/${fn}  (${f})`);
  }
}
writeFileSync(resolve(PROJECT_ROOT, 'typst/frontmatter.typ'), fmIndex);

// ─── Emit chapters.typ (the structural index) ────────────────────────

let index = '// Generated by scripts/md-to-typst.mjs — do not edit by hand.\n';
index += '// Re-run `bash scripts/build.sh` after editing the source MD.\n\n';
index += `#import "${KIT_PREFIX}/typst/template.typ": part-page\n\n`;

const partWord = isPortuguese ? 'Parte' : 'Part';
const appendicesTitle = isPortuguese
  ? ['Apêndices', 'Exercícios, Templates & Recursos']
  : ['Appendices', 'Exercises, Templates & Resources'];

for (const e of indexEntries) {
  if (e.kind === 'part') {
    const m = e.title.match(/^(?:PART|PARTE)\s+([IVX]+)\s*[:—-]\s*(.+)$/i);
    const label = m ? `${partWord} ${m[1]}` : e.title;
    const name = m ? m[2].trim() : '';
    const esc = (s) => s.replace(/"/g, '\\"');
    index += `#part-page("${esc(label)}", "${esc(name)}")\n`;
  } else {
    index += `#include "chapters/${e.filename}"\n`;
  }
}

const firstAppendixIdx = indexEntries.findIndex(e => e.kind === 'file' && /-(appendix|apendice)-/i.test(e.filename));
if (firstAppendixIdx > 0) {
  const before = index.split('\n');
  const insertLine = `#include "chapters/${indexEntries[firstAppendixIdx].filename}"`;
  for (let i = 0; i < before.length; i++) {
    if (before[i] === insertLine) {
      const esc = (s) => s.replace(/"/g, '\\"');
      before.splice(i, 0, `#part-page("${esc(appendicesTitle[0])}", "${esc(appendicesTitle[1])}")`);
      break;
    }
  }
  index = before.join('\n');
}

writeFileSync(CHAPTERS_INDEX, index);
console.log(`Wrote ${indexEntries.filter(e => e.kind === 'file').length} chapter files + chapters.typ.`);
console.log(`Used ${diagramCursor} Mermaid manifest entries (manifest has ${diagramManifest.length}).`);
