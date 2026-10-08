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

  // ── Search (Pagefind, built after the pages) ─────────────────────
  const sbtn = $('.search-btn');
  // Pagefind fetches its index, which browsers block on file:// (e.g. the downloaded zip).
  if (sbtn && location.protocol === 'file:') sbtn.hidden = true;
  else if (sbtn) {
    let dlg;
    const open = async () => {
      if (!dlg) {
        dlg = document.createElement('dialog');
        dlg.className = 'search';
        dlg.setAttribute('aria-label', ui.search || 'Search');
        dlg.innerHTML = '<div class="search-body"><div id="search"></div></div>';
        document.body.append(dlg);
        dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
        const base = new URL(document.baseURI);
        const root = $('meta[name="site-root"]')?.content || './';
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = new URL(root + 'pagefind/pagefind-ui.css', base).href;
        document.head.append(css);
        await new Promise((ok, fail) => {
          const s = document.createElement('script');
          s.src = new URL(root + 'pagefind/pagefind-ui.js', base).href;
          s.onload = ok; s.onerror = fail;
          document.head.append(s);
        });
        new PagefindUI({
          element: '#search', showSubResults: true, resetStyles: false,
          baseUrl: new URL(root, base).pathname, translations: ui.pagefind || {},
        });
      }
      dlg.showModal();
      $('input', dlg)?.focus();
    };
    sbtn.addEventListener('click', () => open().catch(() => { dlg?.close(); sbtn.hidden = true; }));
    addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault(); sbtn.click();
      }
    });
  }
})();
