// HTML edition behaviour. Everything here is progressive enhancement: the book
// reads fine with JavaScript off (the TOC is static, diagrams are inline SVG).
(() => {
  const doc = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ui = JSON.parse($('#ui-strings')?.textContent || '{}');
  doc.classList.replace('no-js', 'js');

  // ── Theme ────────────────────────────────────────────────────────
  $('.theme-btn')?.addEventListener('click', () => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const cur = doc.dataset.theme || (dark ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    doc.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
  });

  // ── Mobile nav drawer ────────────────────────────────────────────
  const menu = $('.menu-btn');
  const setNav = (open) => {
    document.body.classList.toggle('nav-open', open);
    menu?.setAttribute('aria-expanded', String(open));
  };
  menu?.addEventListener('click', () => setNav(!document.body.classList.contains('nav-open')));
  $('.scrim')?.addEventListener('click', () => setNav(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setNav(false); });
  $('.sidebar a[aria-current="page"]')?.scrollIntoView({ block: 'center' });

  // ── Code: copy button ────────────────────────────────────────────
  $$('.code').forEach((box) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = ui.copy || 'copy';
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('pre', box).innerText.replace(/\n$/, ''));
        btn.textContent = ui.copied || 'copied';
      } catch { btn.textContent = ui.copyFailed || 'failed'; }
      setTimeout(() => { btn.textContent = ui.copy || 'copy'; }, 1600);
    });
    box.append(btn);
  });

  // ── Diagrams: view at natural size ───────────────────────────────
  const zoom = document.createElement('dialog');
  zoom.className = 'zoom';
  zoom.setAttribute('aria-label', ui.diagram || 'Diagram');
  zoom.innerHTML = `<form method="dialog"><button class="zoom-btn zoom-close" style="opacity:1">${ui.close || 'close'}</button></form><div class="zoom-body"></div>`;
  document.body.append(zoom);
  $$('.diagram').forEach((fig) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'zoom-btn';
    btn.textContent = ui.expand || 'expand';
    btn.addEventListener('click', () => {
      const svg = $('svg', fig).cloneNode(true);
      svg.removeAttribute('style');
      svg.style.setProperty('--nat', fig.querySelector('svg').style.getPropertyValue('--nat'));
      $('.zoom-body', zoom).replaceChildren(svg);
      zoom.showModal();
    });
    fig.append(btn);
  });
  zoom.addEventListener('click', (e) => { if (e.target === zoom) zoom.close(); });

  // ── "On this page" scroll-spy ────────────────────────────────────
  const links = $$('.page-aside a');
  if (links.length && 'IntersectionObserver' in window) {
    const byId = new Map(links.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
    const seen = new Set();
    const mark = () => {
      const first = [...byId.keys()].find((id) => seen.has(id));
      links.forEach((a) => a.classList.toggle('active', a === byId.get(first)));
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? seen.add(en.target.id) : seen.delete(en.target.id)));
      mark();
    }, { rootMargin: '-72px 0px -65% 0px' });
    byId.forEach((_, id) => { const h = document.getElementById(id); if (h) io.observe(h); });
  }

  // ── Search (Pagefind JS API, our own UI) ─────────────────────────
  // A command-palette: results grouped by chapter, sections underneath, keyboard
  // driven (↑ ↓ ↵ esc). The index is built by `pagefind` after the pages.
  const sbtn = $('.search-btn');
  if (sbtn && location.protocol === 'file:') sbtn.hidden = true;   // Pagefind fetches its index; file:// blocks that
  else if (sbtn) {
    const root = new URL($('meta[name="site-root"]')?.content || './', document.baseURI);
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let dlg, input, list, count, pf, timer, seq = 0;

    const build = () => {
      dlg = document.createElement('dialog');
      dlg.className = 'search';
      dlg.setAttribute('aria-label', ui.search);
      dlg.innerHTML = `
        <div class="s-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" role="combobox" aria-expanded="true" aria-controls="s-list" autocomplete="off" spellcheck="false" placeholder="${esc(ui.searchPlaceholder)}" aria-label="${esc(ui.search)}">
          <button type="button" class="s-esc" aria-label="${esc(ui.close)}"><kbd>esc</kbd></button>
        </div>
        <div class="s-body" id="s-list" role="listbox"></div>
        <div class="s-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> ${esc(ui.searchHintMove)}</span>
          <span><kbd>↵</kbd> ${esc(ui.searchHintOpen)}</span>
          <span><kbd>esc</kbd> ${esc(ui.searchHintClose)}</span>
          <span class="s-count" aria-live="polite"></span>
        </div>`;
      document.body.append(dlg);
      input = $('input', dlg); list = $('.s-body', dlg); count = $('.s-count', dlg);
      note(ui.searchEmpty);
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      $('.s-esc', dlg).addEventListener('click', () => dlg.close());
      input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
      dlg.addEventListener('keydown', onKey);
    };

    const note = (msg, cls = '') => { list.innerHTML = `<p class="s-note ${cls}">${msg}</p>`; count.textContent = ''; };
    const links = () => $$('a.s-hit', list);
    const setActive = (i) => {
      const all = links(); if (!all.length) return;
      const n = (i + all.length) % all.length;
      all.forEach((a, k) => { a.classList.toggle('active', k === n); a.setAttribute('aria-selected', String(k === n)); });
      all[n].scrollIntoView({ block: 'nearest' });
    };
    const onKey = (e) => {
      const all = links(); const cur = all.findIndex((a) => a.classList.contains('active'));
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(cur + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(cur < 0 ? all.length - 1 : cur - 1); }
      else if (e.key === 'Enter' && all.length) { e.preventDefault(); (all[cur] || all[0]).click(); }
    };

    const load = async () => {
      if (pf) return pf;
      pf = await import(new URL('pagefind/pagefind.js', root).href);
      await pf.options({ baseUrl: root.pathname, excerptLength: 18 });
      return pf;
    };

    const run = async () => {
      const q = input.value.trim();
      const my = ++seq;
      if (!q) return note(ui.searchEmpty);
      try {
        const api = await load();
        list.setAttribute('aria-busy', 'true');
        const res = await api.search(q);
        if (my !== seq) return;
        const hits = await Promise.all(res.results.slice(0, 8).map((r) => r.data()));
        if (my !== seq) return;
        list.removeAttribute('aria-busy');
        if (!hits.length) return note(`${esc(ui.searchNone)} <strong>“${esc(q)}”</strong>`);
        list.innerHTML = hits.map((h) => {
          const label = h.meta?.label ? `<span class="s-chip">${esc(h.meta.label)}</span>` : '';
          const subs = (h.sub_results || []).filter((s) => s.anchor).slice(0, 3);
          return `<section class="s-group">
            <a class="s-hit s-page" role="option" href="${esc(h.url)}"><span class="s-title">${esc(h.meta?.title || '')}</span>${label}<span class="s-ex">${h.excerpt}</span></a>
            ${subs.map((s) => `<a class="s-hit s-sub" role="option" href="${esc(s.url)}"><span class="s-sec">${esc(s.title)}</span><span class="s-ex">${s.excerpt}</span></a>`).join('')}
          </section>`;
        }).join('');
        const n = res.results.length;
        count.textContent = `${n} ${ui.searchCount[n === 1 ? 0 : 1]}`;
        setActive(0);
      } catch {
        if (my === seq) note(esc(ui.searchError), 'err');
      }
    };

    const open = () => {
      if (!dlg) build();
      dlg.showModal();
      input.focus(); input.select();
      load().catch(() => {});   // warm the index while the reader types
    };
    sbtn.addEventListener('click', open);
    addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault(); dlg?.open ? dlg.close() : open();
      }
    });
  }
})();
