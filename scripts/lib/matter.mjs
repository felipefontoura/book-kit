// Back-matter pages and local images, shared by the three outputs.
//
// backmatter/*.md are pages after the last appendix (an "About the author", a
// colophon…), discovered like frontmatter/*.md: language-neutral or matching
// the edition's lang, ordered by filename. Unlike front matter they are real
// pages of the book: a page's own "# Title" is a heading (it opens on a recto
// in the PDF and is listed in every table of contents).
//
// Local images: `![alt](photo.jpg "40%")`. The path is relative to the
// Markdown file that holds it (as on GitHub); an optional title that is a
// percentage sets the width.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frontmatterFiles } from './chapter-splitter.mjs';

const fileTitle = (f) => f.replace(/\.[A-Za-z]{2}(?:-[A-Za-z]{2})?\.md$/, '').replace(/\.md$/, '')
  .replace(/^\d+[-_]/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// [{ file, md, title, dir }] for every page in `dir`, in reading order.
export function matterPages(dir, langTag) {
  return frontmatterFiles(dir, langTag).map((file) => {
    const md = readFileSync(resolve(dir, file), 'utf8');
    const own = md.match(/^\s*#\s+([^\n]+)\n/);
    return { file, md, title: own ? own[1].trim() : fileTitle(file), dir };
  });
}

export const isLocalImage = (src) => !/^(?:[a-z]+:|\/\/|#)/i.test(src);

// A Markdown image title that is a width ("40%"), or null.
export const imageWidth = (title) => (/^\d+(?:\.\d+)?%$/.test(title ?? '') ? title : null);

// Rewrite the <img> tags marked renders: local sources go through `toSrc`
// (given the absolute file path), a percentage title becomes the width.
export function rewriteImages(html, baseDir, toSrc) {
  return html.replace(/<img src="([^"]+)" alt="([^"]*)"(?: title="([^"]*)")?\s*\/?>/g, (m, src, alt, title) => {
    if (!isLocalImage(src)) return m;
    const w = imageWidth(title);
    const extra = w ? ` style="width: ${w}"` : title ? ` title="${title}"` : '';
    return `<img src="${toSrc(resolve(baseDir, src))}" alt="${alt}"${extra} />`;
  });
}
