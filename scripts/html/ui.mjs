// Strings the HTML edition's chrome uses (navigation, buttons, search). These
// belong to the engine, like the Chapter/Part labels in chapter-splitter.mjs;
// a book can override any of them under `languages.<lang>.ui` in book.config.json.

const UI = {
  en: {
    contents: 'Contents', onThisPage: 'On this page', next: 'Next', prev: 'Previous',
    search: 'Search', menu: 'Menu', theme: 'Toggle light/dark theme', skip: 'Skip to content',
    copy: 'copy', copied: 'copied', copyFailed: 'failed', expand: 'expand', close: 'close',
    startReading: 'Start reading', copyright: 'Copyright', anchor: 'Link to this section',
    notIncluded: 'Not in this edition. Available in the PDF and EPUB.', home: 'Book home',
    pagefind: {
      placeholder: 'Search the book', clear_search: 'Clear', load_more: 'Load more results',
      search_label: 'Search this book', zero_results: 'No results for [SEARCH_TERM]',
      many_results: '[COUNT] results for [SEARCH_TERM]', one_result: '[COUNT] result for [SEARCH_TERM]',
      searching: 'Searching for [SEARCH_TERM]…', filters_label: 'Filters',
      alt_search: 'No results for [SEARCH_TERM]. Showing results for [DIFFERENT_TERM] instead',
      search_suggestion: 'No results for [SEARCH_TERM]. Try one of these instead:',
    },
  },
  pt: {
    contents: 'Sumário', onThisPage: 'Nesta página', next: 'Próximo', prev: 'Anterior',
    search: 'Buscar', menu: 'Menu', theme: 'Alternar tema claro/escuro', skip: 'Ir para o conteúdo',
    copy: 'copiar', copied: 'copiado', copyFailed: 'falhou', expand: 'ampliar', close: 'fechar',
    startReading: 'Começar a ler', copyright: 'Direitos autorais', anchor: 'Link para esta seção',
    notIncluded: 'Fora desta edição. Disponível no PDF e no EPUB.', home: 'Início do livro',
    pagefind: {
      placeholder: 'Buscar no livro', clear_search: 'Limpar', load_more: 'Mais resultados',
      search_label: 'Buscar neste livro', zero_results: 'Nenhum resultado para [SEARCH_TERM]',
      many_results: '[COUNT] resultados para [SEARCH_TERM]', one_result: '[COUNT] resultado para [SEARCH_TERM]',
      searching: 'Buscando [SEARCH_TERM]…', filters_label: 'Filtros',
      alt_search: 'Nenhum resultado para [SEARCH_TERM]. Mostrando resultados para [DIFFERENT_TERM]',
      search_suggestion: 'Nenhum resultado para [SEARCH_TERM]. Tente um destes:',
    },
  },
};
UI.es = {
  ...UI.pt,
  contents: 'Contenido', onThisPage: 'En esta página', next: 'Siguiente', prev: 'Anterior',
  search: 'Buscar', theme: 'Cambiar tema claro/oscuro', skip: 'Ir al contenido',
  copy: 'copiar', copied: 'copiado', copyFailed: 'falló', expand: 'ampliar', close: 'cerrar',
  startReading: 'Empezar a leer', copyright: 'Derechos de autor', anchor: 'Enlace a esta sección',
  notIncluded: 'Fuera de esta edición. Disponible en el PDF y el EPUB.', home: 'Inicio del libro',
  pagefind: {
    ...UI.pt.pagefind,
    placeholder: 'Buscar en el libro', clear_search: 'Borrar', load_more: 'Más resultados',
    search_label: 'Buscar en este libro', zero_results: 'Sin resultados para [SEARCH_TERM]',
    many_results: '[COUNT] resultados para [SEARCH_TERM]', one_result: '[COUNT] resultado para [SEARCH_TERM]',
    searching: 'Buscando [SEARCH_TERM]…',
  },
};

export function uiFor(baseLang, overrides = {}) {
  const base = UI[baseLang] ?? UI.en;
  return { ...base, ...overrides, pagefind: { ...base.pagefind, ...(overrides.pagefind ?? {}) } };
}
