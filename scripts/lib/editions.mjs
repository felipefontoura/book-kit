// Edition-only blocks: one Markdown source, content that differs by edition.
//
//   <!-- only: md -->              Visible on GitHub (the markers are HTML
//   …Markdown…                     comments, which GitHub hides) and kept in
//   <!-- /only -->                 the built editions listed: `md` alone is a
//                                  call to action for readers of the repo that
//                                  never reaches the PDF, EPUB or HTML.
//
//   <!-- only: pdf epub html       Hidden on GitHub (it sits inside the
//   …Markdown…                     comment) and unwrapped in the editions
//   -->                            listed.
//
// Editions: md (the raw file, as GitHub renders it), pdf (screen and print:
// the print interior compiles the same pages), epub, html. Every Markdown read
// goes through selectEdition before anything else sees the text, so a block
// may hold any Markdown except a Mermaid diagram: render-mermaid numbers the
// figures once for all three editions, and a diagram that exists in only some
// of them would shift every figure after it.

import { readFileSync } from 'node:fs';

export const EDITIONS = ['md', 'pdf', 'epub', 'html'];

const OPENER = /^\s*<!--\s*only:\s*(.*?)\s*(-->)?\s*$/;
const MENTIONS_ONLY = /^\s*<!--\s*(?:\/only\b|only\s*:)/;
const VISIBLE_CLOSER = /^\s*<!--\s*\/only\s*-->\s*$/;
const HIDDEN_CLOSER = /^\s*-->\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

export function selectEdition(text, edition, file = 'Markdown') {
  if (!EDITIONS.includes(edition)) throw new Error(`Unknown edition "${edition}" (use ${EDITIONS.join(', ')})`);
  const fail = (n, msg) => { throw new Error(`${file}:${n}: ${msg}`); };
  const out = [];
  let block = null;   // { hidden, keep, start }
  let fence = null;   // the opening fence ("```", "~~~~"…) while inside code

  text.split('\n').forEach((line, i) => {
    const n = i + 1;

    // Inside a hidden block GitHub parses nothing: the comment ends at the
    // first "-->", wherever it is, so that is where the block must end.
    if (block?.hidden) {
      if (HIDDEN_CLOSER.test(line)) { block = null; return; }
      if (line.includes('-->')) fail(n, `"-->" inside a hidden "only:" block (opened at line ${block.start}) ends the comment on GitHub; close the block on a line of its own`);
      if (/^ {0,3}(`{3,}|~{3,})\s*mermaid\b/.test(line)) fail(n, `Mermaid diagram inside an "only:" block (opened at line ${block.start}): figures are numbered once for every edition`);
      if (block.keep) out.push(line);
      return;
    }

    const f = line.match(FENCE);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !f[2].trim()) fence = null;
      if (!block || block.keep) out.push(line);
      return;
    }
    if (f) {
      if (block && /^\s*mermaid\b/.test(f[2])) fail(n, `Mermaid diagram inside an "only:" block (opened at line ${block.start}): figures are numbered once for every edition`);
      fence = f[1];
      if (!block || block.keep) out.push(line);
      return;
    }

    if (MENTIONS_ONLY.test(line)) {
      if (VISIBLE_CLOSER.test(line)) {
        if (!block) fail(n, '"<!-- /only -->" without an open "only:" block');
        block = null;
        return;
      }
      const m = line.match(OPENER);
      if (!m) fail(n, 'malformed "only:" marker: write "<!-- only: md -->" or "<!-- only: pdf epub html" alone on its line');
      if (block) fail(n, `"only:" blocks don't nest (one is open since line ${block.start})`);
      const list = m[1].split(/[\s,]+/).filter(Boolean);
      const unknown = list.filter((e) => !EDITIONS.includes(e));
      if (!list.length || unknown.length) fail(n, `"only:" takes editions from ${EDITIONS.join(', ')}; got "${m[1]}"`);
      block = { hidden: !m[2], keep: list.includes(edition), start: n };
      return;
    }

    if (!block || block.keep) out.push(line);
  });

  if (block) fail(block.start, `"only:" block never closed (${block.hidden ? 'a line with "-->"' : '"<!-- /only -->"'})`);
  return out.join('\n');
}

export const readMarkdown = (path, edition) => selectEdition(readFileSync(path, 'utf8'), edition, path);
