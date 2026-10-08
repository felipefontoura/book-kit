// Web fonts for the HTML site: the same families the print edition bundles
// (Inter, Newsreader, JetBrains Mono, Kalam), subset to the characters this
// book actually uses and re-encoded as woff2.
//
// Kalam matters most: Mermaid diagrams are inlined as SVG whose labels are set
// in Kalam, so the page must ship it or the diagrams fall back to a system face.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import subsetFont from 'subset-font';
import { KIT_ROOT } from './config.mjs';

// family, weight, style, source file. Only the faces the CSS actually uses.
const FACES = [
  { family: 'Inter',          weight: 400, style: 'normal', file: 'Inter-Regular',            preload: true },
  { family: 'Inter',          weight: 400, style: 'italic', file: 'Inter-Italic' },
  { family: 'Inter',          weight: 600, style: 'normal', file: 'Inter-SemiBold' },
  { family: 'Newsreader',     weight: 400, style: 'normal', file: 'Newsreader-400',           preload: true },
  { family: 'Newsreader',     weight: 400, style: 'italic', file: 'Newsreader-400Italic' },
  { family: 'Newsreader',     weight: 500, style: 'normal', file: 'Newsreader-500' },
  { family: 'JetBrains Mono', weight: 400, style: 'normal', file: 'JetBrainsMono-Regular' },
  { family: 'JetBrains Mono', weight: 500, style: 'normal', file: 'JetBrainsMono-Medium' },
  { family: 'Kalam',          weight: 400, style: 'normal', file: 'Kalam-Regular' },
  { family: 'Kalam',          weight: 700, style: 'normal', file: 'Kalam-Bold' },
];

// Printable ASCII + Latin-1 always (UI strings, future edits), plus every
// character the sources use (arrows, box drawing, typographic quotes…).
function charset(text) {
  let all = '';
  for (let c = 0x20; c < 0x7f; c++) all += String.fromCharCode(c);
  for (let c = 0xa0; c < 0x100; c++) all += String.fromCharCode(c);
  return all + text;
}

// Writes assets/fonts/*.woff2 under `outDir`; returns the @font-face CSS and
// the URLs worth preloading (relative to the stylesheet's directory's parent).
export async function buildSiteFonts({ text, outDir }) {
  const dir = resolve(outDir, 'assets/fonts');
  mkdirSync(dir, { recursive: true });
  const chars = charset(text);
  const css = [];
  const preload = [];
  let bytes = 0;

  for (const f of FACES) {
    const src = readFileSync(resolve(KIT_ROOT, 'typst/assets/fonts', `${f.file}.ttf`));
    const woff2 = await subsetFont(src, chars, { targetFormat: 'woff2' });
    const name = `${f.file}.woff2`;
    writeFileSync(resolve(dir, name), woff2);
    bytes += woff2.length;
    css.push(
      `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};` +
      `font-display:swap;src:url("fonts/${name}") format("woff2");}`,
    );
    if (f.preload) preload.push(`assets/fonts/${name}`);
  }
  return { css: css.join('\n'), preload, bytes };
}
