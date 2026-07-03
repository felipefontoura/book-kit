// Shared path + config resolution for the build engine.
//
// The engine (this scripts/ dir plus typst/template.typ, cover.typ,
// worksheet.typ, the bundled fonts and the mermaid/puppeteer/epub configs) can
// live either inside the book repo (single-repo) or as a git submodule shared
// across many books. Two roots keep that portable:
//
//   KIT_ROOT     — where the engine lives (this file's ../..). Read-only inputs:
//                  template/cover/worksheet, fonts, mermaid/puppeteer configs,
//                  epub.css, node_modules.
//   PROJECT_ROOT — the book being built. Holds book.config.json and BOOK.*.md,
//                  and receives every generated output (typst/chapters,
//                  assets/diagrams, dist). Taken from $PROJECT_ROOT, else cwd.
//
// In single-repo mode the two roots are the same directory, so nothing changes.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const PROJECT_ROOT = process.env.PROJECT_ROOT
  ? resolve(process.env.PROJECT_ROOT)
  : process.cwd();

export function loadConfig() {
  const p = resolve(PROJECT_ROOT, 'book.config.json');
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, 'utf8'));
}

// Submodule path of the engine relative to PROJECT_ROOT ("" = single-repo).
// Used to build Typst absolute-from-root import paths for kit-owned modules.
export function kitDir(cfg = loadConfig()) {
  return ((cfg.kit && cfg.kit.dir) || '').replace(/^\/+|\/+$/g, '');
}
