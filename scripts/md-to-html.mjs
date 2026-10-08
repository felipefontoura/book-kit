#!/usr/bin/env node
// Convert BOOK.{pt-BR,en,es}.md into a static, multi-page HTML edition:
//
//   dist/html/<lang>/index.html            landing + full contents
//   dist/html/<lang>/<chapter>.html        one page per preamble/part/chapter/appendix
//   dist/html/<lang>/assets/               css, js, subset woff2 fonts, cover
//   dist/html/<lang>/sitemap.xml           (only when html.baseUrl is configured)
//   dist/html/<lang>/pagefind/             search index (added by build.sh)
//
// Same sources and the same shared preparation as the EPUB (lib/prepare.mjs):
// identical sections, identical diagram order, identical title handling.
// Pages are flat `.html` files with relative links, so the site works from
// file://, any static host and S3/R2-style buckets with no directory-index rules.
//
// Optional `html` block in book.config.json:
//   baseUrl   absolute URL of the folder that holds <lang>/ — enables canonical,
//             hreflang, og:image and sitemap.xml
//   chapters  e.g. [1, 2, "A"] — publish only these chapters/appendices (a free
//             preview); the rest stay listed in the contents, greyed out

import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { frontmatterFiles, labelsFor, langFromFilename, baseLangFromFilename, slugify as baseSlugify } from './lib/chapter-splitter.mjs';
import { KIT_ROOT, PROJECT_ROOT } from './lib/config.mjs';
import {
  resolveSource, loadMeta, loadDiagramManifest, prepareMarkdown, stripTitleBlock,
  escapeHtml, makeMarked, buildSections,
} from './lib/prepare.mjs';
import { createCodeRenderer } from './lib/highlight.mjs';
import { buildSiteFonts } from './lib/site-fonts.mjs';
import { uiFor } from './html/ui.mjs';

// Apostrophes vanish instead of becoming dashes ("This Book's" → this-books).
const slugify = (s) => baseSlugify(s.replace(/['’]/g, ''));

// ─── Source + metadata ──────────────────────────────────────────────
const { path: MD, baseLang, rawLang } = resolveSource();
console.log(`▸ Source: ${MD.replace(PROJECT_ROOT + '/', '')}`);
const { cfg, L, langTag, meta } = loadMeta(baseLang);
const labels = labelsFor(MD);
const ui = uiFor(baseLang, L.ui);
const htmlCfg = cfg.html ?? {};
const baseUrl = (htmlCfg.baseUrl || '').replace(/\/+$/, '');
const only = Array.isArray(htmlCfg.chapters) ? htmlCfg.chapters.map((c) => String(c).toUpperCase()) : null;

const OUT = resolve(PROJECT_ROOT, 'dist/html', rawLang);
const COVER = resolve(PROJECT_ROOT, `dist/cover-${rawLang}.png`);

// ─── Page plan (names + order), reusable for the other languages ────
function planPages(mdPath, rawSrc) {
  const bl = baseLangFromFilename(mdPath);
  const { meta: m, L: Lx } = loadMeta(bl);
  const lb = labelsFor(mdPath);
  const u = uiFor(bl, Lx.ui);
  const sections = buildSections(rawSrc, { baseLang: bl, meta: m, path: mdPath });
  const pages = [];
  let part = null;
  for (const s of sections) {
    if (s.kind === 'frontmatter') {
      if (stripTitleBlock(s.sourceText).trim()) {
        pages.push({ kind: 'preamble', key: 'preamble', file: `${slugify(m.preambleTitle)}.html`, title: m.preambleTitle, s });
      }
    } else if (s.kind === 'part') {
      part = { kind: 'part', key: `part-${s.num.toLowerCase()}`, num: s.num, name: s.name,
               file: `${slugify(lb.part)}-${s.num.toLowerCase()}-${slugify(s.name)}.html`, title: s.displayTitle, s, chapters: [] };
      pages.push(part);
    } else if (s.kind === 'chapter') {
      const p = { kind: 'chapter', key: `chapter-${s.number}`, part, label: `${lb.chapter} ${s.number}`, num: String(s.number),
                  file: `${slugify(lb.chapter)}-${s.number}-${slugify(s.title)}.html`, title: s.displayTitle, name: s.title, s };
      part?.chapters.push(p);
      pages.push(p);
    } else if (s.kind === 'appendix') {
      pages.push({ kind: 'appendix', key: `appendix-${s.letter}`, label: `${m.appendixLabel} ${s.letter}`, num: s.letter,
                   file: `${lb.appendixSlug}-${s.letter.toLowerCase()}-${slugify(s.title)}.html`, title: s.displayTitle, name: s.title, s });
    }
  }
  pages.push({ kind: 'copyright', key: 'copyright', file: `${slugify(u.copyright)}.html`, title: u.copyright });
  return { pages, meta: m, labels: lb, ui: u, langTag: Lx.langTag };
}

const rawSource = readFileSync(MD, 'utf8');
const plan = planPages(MD, rawSource);
const pages = plan.pages;

// Optional front-matter pages (frontmatter/*.md), same discovery as the EPUB.
const FM_DIR = resolve(PROJECT_ROOT, 'frontmatter');
const fmTitle = (f) => f.replace(/\.[A-Za-z]{2}(?:-[A-Za-z]{2})?\.md$/, '').replace(/\.md$/, '')
  .replace(/^\d+[-_]/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const fmPages = frontmatterFiles(FM_DIR, langFromFilename(MD)).map((f) => ({
  kind: 'front', key: `front-${f}`, file: `${slugify(fmTitle(f))}.html`, title: fmTitle(f),
  md: readFileSync(resolve(FM_DIR, f), 'utf8'),
}));
pages.unshift(...fmPages);

const isIncluded = (p) => {
  if (!only) return true;
  if (p.kind === 'chapter') return only.includes(p.num);
  if (p.kind === 'appendix') return only.includes(p.num);
  return true;
};
const flow = pages.filter((p) => p.kind !== 'part' && isIncluded(p));   // reading order

// Other editions that exist next to this one, for the language switcher and hreflang.
const alternates = readdirSync(PROJECT_ROOT)
  .filter((f) => /^BOOK\.[A-Za-z-]+\.md$/.test(f) && resolve(PROJECT_ROOT, f) !== MD)
  .map((f) => {
    const p = resolve(PROJECT_ROOT, f);
    const lang = (langFromFilename(p) ?? '').toLowerCase();
    const alt = planPages(p, readFileSync(p, 'utf8'));
    const name = new Intl.DisplayNames([alt.langTag], { type: 'language' }).of(alt.langTag.split('-')[0]);
    return { lang, langTag: alt.langTag, name: name.charAt(0).toUpperCase() + name.slice(1), plan: alt };
  });
// Map a page to its counterpart in another language (same kind + number).
function counterpart(page, alt) {
  return alt.plan.pages.find((q) => q.key === page.key) ?? { file: 'index.html' };
}

// ─── Markdown → HTML ────────────────────────────────────────────────
const manifest = loadDiagramManifest();
const { src: preparedSrc, diagrams } = prepareMarkdown(rawSource, {
  manifest,
  // Placeholder survives marked as a block; swapped for the inline SVG after rendering.
  figure: (_entry, n) => `\n<figure data-diagram="${n}"></figure>\n`,
  missing: (n) => `<p><em>[Missing diagram #${n}]</em></p>`,
});
console.log(`▸ Substituted ${diagrams} Mermaid blocks.`);
// Re-split the prepared source (diagrams swapped) so each page body is ready to render.
const preparedSections = buildSections(preparedSrc, { baseLang, meta, path: MD });
const prepByKey = new Map();
for (const s of preparedSections) {
  const key = s.kind === 'frontmatter' ? 'preamble' : s.kind === 'part' ? `part-${s.num.toLowerCase()}`
    : s.kind === 'chapter' ? `chapter-${s.number}` : `appendix-${s.letter}`;
  prepByKey.set(key, s);
}

const renderCode = await createCodeRenderer(rawSource);

// Per-page render context: heading ids are unique within a page, and the
// "on this page" list is collected while rendering.
let ctx = { ids: new Set(), headings: [], shift: 0 };
const stripTags = (h) => h.replace(/<[^>]+>/g, '');
const unescapeHtml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

const marked = makeMarked({
  renderer: {
    heading({ tokens, depth }) {
      const inner = this.parser.parseInline(tokens);
      const level = Math.min(6, Math.max(1, depth - ctx.shift));
      let id = slugify(unescapeHtml(stripTags(inner))) || 'section';
      for (let i = 2; ctx.ids.has(id); i++) id = `${id.replace(/-\d+$/, '')}-${i}`;
      ctx.ids.add(id);
      if (level === 2 || level === 3) ctx.headings.push({ level, id, text: stripTags(inner) });
      const anchor = level >= 2 && level <= 4
        ? `<a class="anchor" data-pagefind-ignore href="#${id}" aria-label="${escapeHtml(ui.anchor)}">#</a>` : '';
      return `<h${level} id="${id}">${inner}${anchor}</h${level}>\n`;
    },
    code({ text, lang }) { return renderCode(text, lang); },
  },
});

function inlineSvg(n) {
  const entry = manifest[n - 1];
  const id = `dgm-${String(n).padStart(3, '0')}`;
  let svg = readFileSync(resolve(PROJECT_ROOT, 'typst', entry.file), 'utf8').trim()
    .replaceAll('my-svg', id);   // ids/markers/CSS are scoped by this id; make it unique per page
  const w = parseFloat((svg.match(/max-width:\s*([\d.]+)px/) || [])[1] || '600');
  const min = Math.round(w * 0.62);   // below ~62% the 17px labels stop being legible → scroll instead
  svg = svg
    .replace(/role="[^"]*"/, `role="img" aria-label="${escapeHtml(labels.diagram)} ${n}" focusable="false"`)
    .replace(/style="[^"]*"/, `style="max-width: ${w}px; --nat: ${w}px; --min: ${min}px;"`);
  return `<figure class="diagram">${svg}</figure>`;
}

function finishHtml(html) {
  return html
    .replace(/<figure data-diagram="(\d+)"><\/figure>/g, (_, n) => inlineSvg(Number(n)))
    .replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>')
    .replace(/<th(?=[ >])/g, '<th scope="col"')
    .replace(/<a href="(https?:\/\/[^"]+)"/g, '<a rel="noopener" href="$1"');
}

// Strip the trailing `---` that separated sections in the single-file source.
const dropTrailingHr = (t) => t.replace(/\n-{3,}\s*$/, '\n');

function renderBody(page) {
  ctx = { ids: new Set(), headings: [], shift: 0 };
  const s = prepByKey.get(page.key);
  let eyebrow = '';
  let h1 = '';
  let md = '';

  if (page.kind === 'preamble') {
    h1 = escapeHtml(meta.preambleTitle);
    md = stripTitleBlock(s.sourceText);
    // The source marks this heading with a bold line; the page H1 replaces it.
    md = md.replace(/^\s*\*\*([^*\n]+)\*\*\s*\n/, (m, t) => (t.trim().toLowerCase() === meta.preambleTitle.toLowerCase() ? '' : m));
  } else if (page.kind === 'front') {
    h1 = escapeHtml(page.title);
    md = page.md;
  } else if (page.kind === 'chapter' || page.kind === 'appendix') {
    eyebrow = page.label;
    h1 = marked.parseInline(page.name);
    ctx.shift = 1;   // "###" sections become <h2>: no skipped levels under the page <h1>
    md = s.sourceText.replace(/^##[^\n]*\n/, '');
  } else if (page.kind === 'part') {
    eyebrow = `${meta.partsLabel} ${page.num}`;
    h1 = escapeHtml(page.name);
  }

  let body = md ? finishHtml(marked.parse(dropTrailingHr(md))) : '';
  if (page.kind === 'part') {
    body = `<ol class="part-list">${page.chapters.map((c) => {
      const inner = `<span class="num">${escapeHtml(c.num)}</span>${escapeHtml(c.name)}`;
      return isIncluded(c) ? `<li><a href="${c.file}">${inner}</a></li>` : `<li><span class="off">${inner}</span></li>`;
    }).join('')}</ol>`;
  }
  return { eyebrow, h1, body, headings: ctx.headings };
}

// Copyright page from the config lines, bare domains turned into links.
const linkify = (line) => escapeHtml(line).replace(
  /\b((?:[a-z0-9-]+\.)+(?:com|org|io|dev|net|br)(?:\/[^\s<]*)?)/gi,
  (m) => { const url = m.replace(/[.,;:)]+$/, ''); return `<a rel="noopener" href="https://${url}">${url}</a>${m.slice(url.length)}`; },
);
function renderCopyright() {
  return { eyebrow: '', h1: escapeHtml(ui.copyright), body: meta.copyright.map((l) => `<p>${linkify(l)}</p>`).join('\n'), headings: [] };
}

// ─── Page chrome ────────────────────────────────────────────────────
const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  sun: '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
};
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#14120F"/><rect x="8" y="7" width="16" height="3" rx="1.5" fill="#D9A441"/><rect x="8" y="14.5" width="16" height="3" rx="1.5" fill="#D9A441" opacity=".7"/><rect x="8" y="22" width="10" height="3" rx="1.5" fill="#D9A441" opacity=".45"/></svg>');

const absUrl = (file) => (baseUrl ? `${baseUrl}/${rawLang}/${file === 'index.html' ? '' : file}` : '');

function tocItem(p, current, withNum = true) {
  const num = withNum && p.num ? `<span class="num">${escapeHtml(p.num)}</span>` : '';
  const label = escapeHtml(p.kind === 'chapter' || p.kind === 'appendix' ? p.name : p.title);
  if (!isIncluded(p)) return `<li><span class="off" title="${escapeHtml(ui.notIncluded)}">${num}${label}</span></li>`;
  const cur = current && current.file === p.file ? ' aria-current="page"' : '';
  return `<li><a href="${p.file}"${cur}>${num}${label}</a></li>`;
}

function tocHtml(current, cls = 'toc') {
  const lead = pages.filter((p) => p.kind === 'front' || p.kind === 'preamble');
  const parts = pages.filter((p) => p.kind === 'part');
  const apps = pages.filter((p) => p.kind === 'appendix');
  const out = [`<nav class="${cls}" aria-label="${escapeHtml(ui.contents)}">`];
  if (lead.length) out.push(`<ul>${lead.map((p) => tocItem(p, current)).join('')}</ul>`);
  for (const part of parts) {
    const cur = current && current.file === part.file ? ' aria-current="page"' : '';
    out.push(`<div class="toc-group"><a class="toc-label" href="${part.file}"${cur}>${escapeHtml(part.title)}</a>` +
      `<ul>${part.chapters.map((c) => tocItem(c, current)).join('')}</ul></div>`);
  }
  if (apps.length) {
    out.push(`<div class="toc-group"><span class="toc-label">${escapeHtml(plan.labels.appendices[0])}</span>` +
      `<ul>${apps.map((p) => tocItem(p, current)).join('')}</ul></div>`);
  }
  const cp = pages.find((p) => p.kind === 'copyright');
  out.push(`<div class="toc-group"><ul>${tocItem(cp, current, false)}</ul></div>`, '</nav>');
  return out.join('\n');
}

function plainDescription(html, fallback) {
  const m = html.match(/<p>([\s\S]*?)<\/p>/);
  if (!m) return fallback;
  const t = unescapeHtml(stripTags(m[1])).replace(/\s+/g, ' ').trim();
  if (t.length <= 160) return t;
  return t.slice(0, 157).replace(/\s+\S*$/, '') + '…';
}

const fontsAndCss = { css: '', preload: [] };   // filled before pages are written

function pageHtml({ page, eyebrow, h1, body, headings, description, isIndex = false }) {
  const file = isIndex ? 'index.html' : page.file;
  const title = isIndex ? `${meta.title}: ${meta.subtitle}` : `${page.title} · ${meta.title}`;
  const canonical = absUrl(file);
  const alts = alternates.map((a) => {
    const target = isIndex ? { file: 'index.html' } : counterpart(page, a);
    return { ...a, file: target.file };
  });
  const jsonLd = isIndex
    ? { '@context': 'https://schema.org', '@type': 'Book', name: meta.title, alternativeHeadline: meta.subtitle,
        author: { '@type': 'Person', name: meta.author }, publisher: meta.publisher, inLanguage: langTag,
        description: meta.description, license: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
        ...(baseUrl && { url: canonical, image: `${baseUrl}/${rawLang}/assets/cover.png` }) }
    : page.kind === 'chapter' || page.kind === 'appendix'
      ? { '@context': 'https://schema.org', '@type': 'Chapter', name: page.title, inLanguage: langTag,
          isPartOf: { '@type': 'Book', name: meta.title, author: { '@type': 'Person', name: meta.author } },
          ...(baseUrl && { url: canonical }) }
      : null;

  const i = flow.indexOf(page);
  const prev = !isIndex && i > 0 ? flow[i - 1] : null;
  const next = !isIndex && i >= 0 && i < flow.length - 1 ? flow[i + 1] : null;
  const pager = !isIndex && (prev || next) ? `<nav class="pager" aria-label="${escapeHtml(ui.contents)}">
${prev ? `<a class="prev" rel="prev" href="${prev.file}"><small>← ${escapeHtml(ui.prev)}</small>${escapeHtml(prev.title)}</a>` : ''}
${next ? `<a class="next" rel="next" href="${next.file}"><small>${escapeHtml(ui.next)} →</small>${escapeHtml(next.title)}</a>` : ''}
</nav>` : '';

  const aside = headings.length >= 2 ? `<aside class="page-aside" aria-label="${escapeHtml(ui.onThisPage)}">
<p class="aside-title">${escapeHtml(ui.onThisPage)}</p>
<ol>${headings.map((h) => `<li${h.level === 3 ? ' class="sub"' : ''}><a href="#${h.id}">${escapeHtml(unescapeHtml(h.text))}</a></li>`).join('')}</ol>
</aside>` : '';

  const article = isIndex ? body : `<article class="page${page.kind === 'part' ? ' part-page' : ''}" data-pagefind-body${page.kind === 'part' ? ' data-pagefind-ignore' : ''}>
${eyebrow ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
<h1>${h1}</h1>
${body}
${pager}
${footer()}
</article>`;

  return `<!doctype html>
<html lang="${langTag}" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="author" content="${escapeHtml(meta.author)}">
<meta name="site-root" content="./">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#FBF8F2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#14120F" media="(prefers-color-scheme: dark)">
${canonical ? `<link rel="canonical" href="${canonical}">` : ''}
${baseUrl ? alts.map((a) => `<link rel="alternate" hreflang="${a.langTag}" href="${baseUrl}/${a.lang}/${a.file === 'index.html' ? '' : a.file}">`).join('\n') : ''}
${baseUrl ? `<link rel="alternate" hreflang="${langTag}" href="${canonical}">` : ''}
<meta property="og:type" content="${isIndex ? 'book' : 'article'}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:locale" content="${langTag.replace('-', '_')}">
${canonical ? `<meta property="og:url" content="${canonical}">` : ''}
${baseUrl ? `<meta property="og:image" content="${baseUrl}/${rawLang}/assets/cover.png">\n<meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="icon" href="${FAVICON}">
${fontsAndCss.preload.map((f) => `<link rel="preload" href="${f}" as="font" type="font/woff2" crossorigin>`).join('\n')}
<link rel="stylesheet" href="assets/site.css">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<a class="skip-link" href="#content">${escapeHtml(ui.skip)}</a>
<header class="site-header">
${isIndex ? '' : `<button class="hbtn menu-btn" type="button" aria-controls="sidebar" aria-expanded="false" aria-label="${escapeHtml(ui.menu)}" data-needs-js>${ICON.menu}</button>`}
<a class="brand" href="index.html" title="${escapeHtml(ui.home)}">${escapeHtml(meta.title)}</a>
<button class="hbtn search-btn" type="button" aria-label="${escapeHtml(ui.search)}" data-needs-js>${ICON.search}<span>${escapeHtml(ui.search)}</span><kbd>/</kbd></button>
${alts.map((a) => `<a class="hbtn" hreflang="${a.langTag}" lang="${a.langTag}" href="../${a.lang}/${a.file}">${escapeHtml(a.name)}</a>`).join('')}
<button class="hbtn theme-btn" type="button" aria-label="${escapeHtml(ui.theme)}" data-needs-js>${ICON.sun}${ICON.moon}</button>
</header>
<div class="scrim"></div>
<div class="layout${aside ? '' : ' no-aside'}${isIndex ? ' no-sidebar' : ''}">
${isIndex ? '' : `<aside class="sidebar" id="sidebar">
${tocHtml(page)}
</aside>`}
<main id="content">
${article}
</main>
${aside}
</div>
<script type="application/json" id="ui-strings">${JSON.stringify({ ...ui, diagram: labels.diagram }).replace(/</g, '\\u003c')}</script>
<script src="assets/site.js" defer></script>
</body>
</html>
`;
}

function footer() {
  const cp = pages.find((p) => p.kind === 'copyright');
  return `<footer class="site-footer">
<p>${escapeHtml(meta.copyright[0] ?? '')} <a href="${cp.file}">${escapeHtml(ui.copyright)}</a></p>
</footer>`;
}

// ─── Landing page ───────────────────────────────────────────────────
function indexBody() {
  const first = flow[0];
  return `<div class="page landing">
<section class="hero">
<img src="assets/cover.png" width="1600" height="2560" alt="${escapeHtml(meta.title)}">
<div>
<p class="eyebrow">${escapeHtml(meta.eyebrow ?? '')}</p>
<h1>${escapeHtml(meta.title)}</h1>
<p class="subtitle">${escapeHtml(meta.subtitle)}</p>
<p class="desc">${escapeHtml(meta.description)}</p>
<a class="cta" href="${first.file}">${escapeHtml(ui.startReading)}</a>
</div>
</section>
<div class="index-toc" data-pagefind-ignore>${tocHtml(null, 'toc')}</div>
${footer()}
</div>`;
}

// ─── Write the site ─────────────────────────────────────────────────
rmSync(OUT, { recursive: true, force: true });
mkdirSync(resolve(OUT, 'assets'), { recursive: true });

// Fonts are subset to the characters this book uses (sources + config strings).
const siteText = rawSource + JSON.stringify(L) + Object.values(ui).filter((v) => typeof v === 'string').join('');
const fonts = await buildSiteFonts({ text: siteText, outDir: OUT });
fontsAndCss.preload = fonts.preload;
writeFileSync(resolve(OUT, 'assets/site.css'), fonts.css + '\n' + readFileSync(resolve(KIT_ROOT, 'scripts/html/site.css'), 'utf8'));
copyFileSync(resolve(KIT_ROOT, 'scripts/html/site.js'), resolve(OUT, 'assets/site.js'));
if (existsSync(COVER)) copyFileSync(COVER, resolve(OUT, 'assets/cover.png'));
else console.warn(`⚠ Cover not found (${COVER}); the landing page will have no image.`);
console.log(`▸ Fonts: ${(fonts.bytes / 1024).toFixed(0)} KB woff2 (subset).`);

const written = [];
for (const page of pages) {
  if (!isIncluded(page)) continue;
  const r = page.kind === 'copyright' ? renderCopyright() : renderBody(page);
  const description = plainDescription(r.body, meta.description);
  writeFileSync(resolve(OUT, page.file), pageHtml({ page, ...r, description }));
  written.push(page.file);
}
writeFileSync(resolve(OUT, 'index.html'),
  pageHtml({ page: null, eyebrow: '', h1: '', body: indexBody(), headings: [], description: meta.description, isIndex: true }));
written.unshift('index.html');

if (baseUrl) {
  const urls = written.map((f) => `  <url><loc>${absUrl(f)}</loc></url>`).join('\n');
  writeFileSync(resolve(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}

console.log(`✅ Built: ${OUT.replace(PROJECT_ROOT + '/', '')}/  (${written.length} pages)`);
