// Build-time syntax highlighting for the HTML site (no JS shipped to readers).
//
// Shiki's `css-variables` theme emits `color:var(--shiki-token-*)` instead of
// hard-coded hex, so the site's light/dark palettes live in site.css and the
// highlighted HTML stays theme-agnostic.

import { createHighlighter, createCssVariablesTheme, bundledLanguages, bundledLanguagesAlias } from 'shiki';
import { escapeHtml } from './prepare.mjs';

const theme = createCssVariablesTheme({
  name: 'css-variables',
  variablePrefix: '--shiki-',
  variableDefaults: {},
  fontStyle: true,
});

const known = (lang) => lang in bundledLanguages || lang in bundledLanguagesAlias;

// Fence info strings may carry extras ("typescript title=x"): keep the first word.
export const fenceLang = (info) => (info || '').trim().split(/\s+/)[0].toLowerCase();

// `sourceMd` is scanned for fence languages so only the grammars the book
// actually uses get loaded.
export async function createCodeRenderer(sourceMd) {
  const used = new Set();
  for (const m of sourceMd.matchAll(/^[ \t]*(?:`{3,}|~{3,})[ \t]*([^\s`]+)/gm)) {
    const l = fenceLang(m[1]);
    if (known(l)) used.add(l);
  }
  const highlighter = await createHighlighter({ themes: [theme], langs: [...used] });

  // Returns the <pre> HTML for one fenced block, wrapped so CSS/JS can label
  // it (language chip) and attach a copy button.
  return function renderCode(code, info) {
    const lang = fenceLang(info);
    const text = code.replace(/\n$/, '');
    let pre;
    if (lang && used.has(lang)) {
      pre = highlighter.codeToHtml(text, { lang, theme: 'css-variables' });
    } else {
      pre = `<pre class="shiki plain" tabindex="0"><code>${escapeHtml(text)}</code></pre>`;
    }
    const label = lang && lang !== 'text' && lang !== 'txt' && lang !== 'plaintext' ? ` data-lang="${escapeHtml(lang)}"` : '';
    return `<div class="code"${label}>${pre}</div>\n`;
  };
}
