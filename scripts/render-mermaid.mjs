#!/usr/bin/env node
// Extract ```mermaid blocks from BOOK.{pt-BR,en,es}.md and render each to SVG via mmdc.
// Writes typst/assets/diagrams/diagram-NNN.svg plus a manifest.json
// that md-to-typst.mjs uses to map blocks to image paths.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { KIT_ROOT, PROJECT_ROOT } from './lib/config.mjs';

// Source + generated diagrams live in the project; the toolchain (mmdc, configs)
// lives in the kit.
const candidates = [process.env.SOURCE_MD, 'BOOK.pt-BR.md', 'BOOK.en.md'].filter(Boolean);
let MD = null;
for (const c of candidates) {
  const p = resolve(PROJECT_ROOT, c);
  if (existsSync(p)) { MD = p; break; }
}
if (!MD) {
  console.error('No source Markdown file found (tried BOOK.pt-BR.md, BOOK.en.md).');
  process.exit(1);
}
console.log(`▸ Source: ${MD.replace(PROJECT_ROOT + '/', '')}`);

const OUT_DIR = resolve(PROJECT_ROOT, 'typst/assets/diagrams');
const MANIFEST = resolve(OUT_DIR, 'manifest.json');

const MMDC = resolve(KIT_ROOT, 'node_modules/.bin/mmdc');
const PUPPETEER_CONFIG = resolve(KIT_ROOT, 'scripts/puppeteer.config.json');
// Mermaid config forces htmlLabels:false so labels render as SVG <text>
// (not <foreignObject>, which Typst can't draw — text would vanish in the PDF).
const MERMAID_CONFIG = resolve(KIT_ROOT, 'scripts/mermaid.config.json');

if (!existsSync(MMDC)) {
  console.error('mmdc not found. Run `npm install` first.');
  process.exit(1);
}

// Mermaid's `look: handDrawn` hardcodes rough.js fillStyle:"hachure" (a diagonal
// scribble), which fights text legibility on filled nodes. Convert node fills to
// SOLID: rough.js emits, per filled shape, a hachure path (fill=none, stroke = the
// fill colour, stroke-width≈4, a very long `d`) immediately followed by the rough
// outline path. We fill that outline with the hachure's colour and drop the
// hachure. Edges (marker-end / flowchart-link / data-edge) are left untouched.
function solidifyHandDrawn(svg, classNames = []) {
  let out = svg;
  // Handwriting font (Kalam) with Inter as the fallback so symbols Kalam lacks
  // (→, ↑, ↓) render as a clean glyph instead of a serif default. And use the
  // real Kalam Bold for legibility (labels ship as font-weight:normal).
  out = out.replace(/--mermaid-font-family:[^;}]*/g, '--mermaid-font-family:"Kalam","Inter"');
  out = out.replace(/font-weight="normal"/g, 'font-weight="bold"');
  out = out.replace(/font-weight:\s*normal/g, 'font-weight:bold');
  // Drop the clean CSS border on node rects — only the rough (hand-drawn) outline
  // should draw the border, so nodes never look machine-ruled. The class names
  // come from the diagram's classDefs (shared kit classes + inline ones).
  if (classNames.length) {
    const reClassed = new RegExp(`\\.(?:${classNames.join('|')}) rect\\{[^}]*\\}`, 'g');
    out = out.replace(reClassed,
      (m) => m.replace(/stroke(?:-width)?:[^;}]*;?/g, ''));
  }
  // Connector weight is governed by CSS (.edge-thickness-normal), which OVERRIDES the
  // per-path stroke-width attribute — so bump it here. A node border is a rough double
  // stroke (~2× a 1px pass spread apart); match that visual band with a single solid line.
  out = out.replace(/\.edge-thickness-normal\{stroke-width:[^}]*\}/g,
    '.edge-thickness-normal{stroke-width:2.2px;}');
  // The arrowhead is a fixed-size marker (markerUnits="userSpaceOnUse"), so it does NOT
  // grow with the thicker connector — enlarge the pointEnd triangle to keep it in
  // proportion with the line.
  out = out.replace(/(<marker\b[^>]*?pointEnd[^>]*?)markerWidth="8" markerHeight="8"/g,
    '$1markerWidth="12" markerHeight="12"');
  // ...and move the anchor toward the tip (refX 5 → 8.5) so the bigger triangle sits ON
  // TOP of the node border instead of half-penetrating it (which hid the tip).
  out = out.replace(/(<marker\b[^>]*?pointEnd[^>]*?)refX="5"/g, '$1refX="8.5"');
  for (const p of out.match(/<path\b[^>]*?\/>/g) || []) {
    if (/flowchart-link|data-edge/.test(p)) continue;  // connector width set via CSS above
    if (/marker-end/.test(p)) continue;           // arrowhead markers etc.
    if (!/fill="none"/.test(p)) continue;         // only node fill/outline paths
    const stroke = (p.match(/stroke="([^"]*)"/) || [])[1];
    const sw = parseFloat((p.match(/stroke-width="([^"]*)"/) || [])[1] || '0');
    const d = (p.match(/ d="([^"]*)"/) || [])[1] || '';
    if (stroke && stroke !== 'none' && sw >= 3.5 && d.length >= 5000) {
      // Hachure fill (fill=none, stroke = fill colour, thick, huge `d`) → replace
      // with a soft rounded highlighter swash (translucent marker) at its bbox.
      const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      const xs = nums.filter((_, i) => i % 2 === 0);
      const ys = nums.filter((_, i) => i % 2 === 1);
      if (!xs.length) continue;
      const x = Math.min(...xs), y = Math.min(...ys);
      const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
      out = out.replace(p, `<rect x="${(x - 2).toFixed(1)}" y="${(y - 1).toFixed(1)}" width="${(w + 4).toFixed(1)}" height="${(h + 2).toFixed(1)}" rx="9" fill="${stroke}" fill-opacity="0.6"/>`);
    } else {
      // The rough node outline IS the hand-drawn border — keep it and thicken it
      // so it clearly reads as hand-made, not a thin machine rule.
      out = out.replace(p, p.replace(/stroke-width="[^"]*"/, 'stroke-width="1.8"'));
    }
  }
  return out;
}

// ─── Shared Kit node classes ──────────────────────────────────────
// Kit-owned semantic classDefs (scripts/mermaid.classes.mmd) are injected into
// every classDef-capable diagram right after its header line, so any book can
// write `class N accent;` with zero setup. A book adds or overrides classes by
// dropping a mermaid.classes.mmd next to its book.config.json — those lines
// are injected after the kit's, and later definitions win in Mermaid, so:
// inline classDef > book file > kit defaults.
const classFiles = [
  resolve(KIT_ROOT, 'scripts/mermaid.classes.mmd'),
  resolve(PROJECT_ROOT, 'mermaid.classes.mmd'),
];
const sharedClasses = classFiles
  .filter((p) => existsSync(p))
  .flatMap((p) => readFileSync(p, 'utf8').split('\n'))
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('%%'));

// Types that support classDef: flowchart/graph and stateDiagram(-v2).
const RE_CLASSABLE = /^(graph|flowchart|stateDiagram)\b/;

function injectSharedClasses(code) {
  if (!sharedClasses.length) return code;
  const lines = code.split('\n');
  // Skip a YAML frontmatter block (`---` … `---`): its `flowchart:` config key
  // would otherwise be mistaken for the diagram header.
  const body = lines[0]?.trim() === '---' ? lines.indexOf('---', 1) + 1 : 0;
  const head = lines.findIndex((l, i) => i >= body && RE_CLASSABLE.test(l.trim()));
  if (head === -1) return code;  // sequence/er/etc. — themeVariables only
  lines.splice(head + 1, 0, ...sharedClasses.map((l) => '    ' + l));
  return lines.join('\n');
}

const src = readFileSync(MD, 'utf8');

// Match fenced mermaid blocks. Tolerate optional whitespace after the fence.
const RE = /```mermaid[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
const blocks = [];
let m;
while ((m = RE.exec(src)) !== null) {
  blocks.push({ index: blocks.length + 1, charOffset: m.index, code: m[1] });
}
console.log(`Found ${blocks.length} Mermaid diagrams.`);

if (blocks.length === 0) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MANIFEST, '[]\n');
  process.exit(0);
}

// Clean output dir to avoid stale SVGs lingering after diagram removals.
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const work = resolve(tmpdir(), `mmd-${process.pid}-${Date.now()}`);
mkdirSync(work, { recursive: true });

const manifest = [];
for (const b of blocks) {
  const id = String(b.index).padStart(3, '0');
  const inFile = resolve(work, `diagram-${id}.mmd`);
  const outFile = resolve(OUT_DIR, `diagram-${id}.svg`);
  const code = injectSharedClasses(b.code);
  // Every class name defined for this diagram (shared + inline), for the
  // CSS-border cleanup in solidifyHandDrawn. classDef accepts a,b,c lists.
  const classNames = [...code.matchAll(/classDef\s+([A-Za-z0-9_,-]+)/g)]
    .flatMap((m) => m[1].split(','));
  writeFileSync(inFile, code);
  process.stdout.write(`  ↳ diagram-${id}.svg ... `);
  try {
    execFileSync(
      MMDC,
      [
        '-i', inFile,
        '-o', outFile,
        '-b', 'transparent',
        '-c', MERMAID_CONFIG,
        '-p', PUPPETEER_CONFIG,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    writeFileSync(outFile, solidifyHandDrawn(readFileSync(outFile, 'utf8'), classNames));
    console.log('ok');
    manifest.push({ index: b.index, file: `assets/diagrams/diagram-${id}.svg` });
  } catch (err) {
    console.log('FAILED');
    console.error(err.stderr?.toString() ?? err.message);
    process.exit(1);
  }
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
rmSync(work, { recursive: true, force: true });
console.log(`Wrote ${manifest.length} diagrams + manifest.`);
