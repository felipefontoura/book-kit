// Post-process an EPUB to make its KaTeX MathML valid.
//
// @lesjoursfr/html-to-epub re-serialises every content document through
// rehype (HTML mode), which DROPS the `xmlns` namespace that KaTeX puts on
// each <math> element. In an XHTML (XML) content document that namespace is
// mandatory: without it a <math> falls into the XHTML namespace and reading
// systems won't render it as math. The library also never tags the manifest
// <item> with properties="mathml" (required by EPUB 3 / epubcheck for any
// document that contains MathML).
//
// This pass re-opens the finished .epub and fixes both, then rewrites the
// archive with the mimetype entry first and stored (the EPUB OCF rule).
//
// Kindle's classic MathML support stays weak regardless — this only makes the
// math correct in the readers that DO support MathML (Apple Books, Google
// Play Books, Thorium, Kobo, newer Kindle KFX). For Kindle-grade fidelity the
// alternative is rendering equations to SVG (the same path the Mermaid
// diagrams already take).

import { createWriteStream } from 'node:fs';
import yauzl from 'yauzl';
import archiver from 'archiver';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

function readEntries(path) {
  return new Promise((res, rej) => {
    const entries = [];
    yauzl.open(path, { lazyEntries: true }, (err, zip) => {
      if (err) return rej(err);
      zip.readEntry();
      zip.on('entry', (entry) => {
        if (entry.fileName.endsWith('/')) { zip.readEntry(); return; }
        zip.openReadStream(entry, (e, stream) => {
          if (e) return rej(e);
          const chunks = [];
          stream.on('data', (c) => chunks.push(c));
          stream.on('error', rej);
          stream.on('end', () => {
            entries.push({ name: entry.fileName, data: Buffer.concat(chunks) });
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => res(entries));
      zip.on('error', rej);
    });
  });
}

function writeEntries(path, entries) {
  return new Promise((res, rej) => {
    const out = createWriteStream(path);
    const archive = archiver('zip', { zlib: { level: 9 } });
    out.on('close', res);
    out.on('error', rej);
    archive.on('error', rej);
    archive.pipe(out);
    // OCF: "mimetype" must be the first entry and stored uncompressed.
    const mimetype = entries.find((e) => e.name === 'mimetype');
    if (mimetype) archive.append(mimetype.data, { name: 'mimetype', store: true });
    for (const e of entries) {
      if (e.name === 'mimetype') continue;
      archive.append(e.data, { name: e.name });
    }
    archive.finalize();
  });
}

export async function fixEpubMathml(epubPath) {
  const entries = await readEntries(epubPath);
  const mathDocs = new Set();

  // 1. Re-add the MathML namespace to every <math> that lost it.
  for (const e of entries) {
    if (!e.name.endsWith('.xhtml')) continue;
    let html = e.data.toString('utf8');
    if (!html.includes('<math')) continue;
    const fixed = html.replace(/<math(?![^>]*\bxmlns=)/g, `<math xmlns="${MATHML_NS}"`);
    if (fixed !== html) e.data = Buffer.from(fixed, 'utf8');
    mathDocs.add(e.name.replace(/^OEBPS\//, ''));
  }

  if (mathDocs.size === 0) return 0;

  // 2. Flag the manifest items that carry MathML with properties="mathml".
  const opf = entries.find((e) => e.name.endsWith('.opf'));
  if (opf) {
    let xml = opf.data.toString('utf8');
    xml = xml.replace(/<item\b[^>]*?\/>/g, (item) => {
      const href = item.match(/\bhref="([^"]+)"/)?.[1];
      if (!href || !mathDocs.has(href)) return item;
      if (/\bproperties="/.test(item)) {
        return item.replace(/\bproperties="([^"]*)"/, (m, p) =>
          p.split(/\s+/).includes('mathml') ? m : `properties="${p} mathml"`);
      }
      return item.replace(/\s*\/>$/, ' properties="mathml"/>');
    });
    opf.data = Buffer.from(xml, 'utf8');
  }

  await writeEntries(epubPath, entries);
  return mathDocs.size;
}
