// Strings the HTML edition's chrome uses (navigation, buttons, search). These
// belong to the engine, like the Chapter/Part labels in chapter-splitter.mjs;
// a book can override any of them under `languages.<lang>.ui` in book.config.json.

const UI = {
  en: {
    contents: 'Contents', onThisPage: 'On this page', next: 'Next', prev: 'Previous',
    search: 'Search', menu: 'Menu', theme: 'Toggle light/dark theme', skip: 'Skip to content',
    copy: 'copy', copied: 'copied', copyFailed: 'failed', expand: 'expand', close: 'close',
    startReading: 'Start reading', download: 'Download PDF/EPUB', copyright: 'Copyright', anchor: 'Link to this section',
    notIncluded: 'Not in this edition. Available in the PDF and EPUB.', home: 'Book home',
    searchPlaceholder: 'Search the book…', searchEmpty: 'Type to search every chapter.',
    searchNone: 'No results for', searchLoading: 'Searching…', searchError: 'Search is unavailable here.',
    searchHintMove: 'navigate', searchHintOpen: 'open', searchHintClose: 'close',
    searchCount: ['result', 'results'], inSection: 'in',
  },
  pt: {
    contents: 'Sumário', onThisPage: 'Nesta página', next: 'Próximo', prev: 'Anterior',
    search: 'Buscar', menu: 'Menu', theme: 'Alternar tema claro/escuro', skip: 'Ir para o conteúdo',
    copy: 'copiar', copied: 'copiado', copyFailed: 'falhou', expand: 'ampliar', close: 'fechar',
    startReading: 'Começar a ler', download: 'Baixar PDF/EPUB', copyright: 'Direitos autorais', anchor: 'Link para esta seção',
    notIncluded: 'Fora desta edição. Disponível no PDF e no EPUB.', home: 'Início do livro',
    searchPlaceholder: 'Buscar no livro…', searchEmpty: 'Digite para buscar em todos os capítulos.',
    searchNone: 'Nenhum resultado para', searchLoading: 'Buscando…', searchError: 'A busca não está disponível aqui.',
    searchHintMove: 'navegar', searchHintOpen: 'abrir', searchHintClose: 'fechar',
    searchCount: ['resultado', 'resultados'], inSection: 'em',
  },
};
UI.es = {
  ...UI.pt,
  contents: 'Contenido', onThisPage: 'En esta página', next: 'Siguiente', prev: 'Anterior',
  search: 'Buscar', theme: 'Cambiar tema claro/oscuro', skip: 'Ir al contenido',
  copy: 'copiar', copied: 'copiado', copyFailed: 'falló', expand: 'ampliar', close: 'cerrar',
  startReading: 'Empezar a leer', download: 'Descargar PDF/EPUB', copyright: 'Derechos de autor', anchor: 'Enlace a esta sección',
  notIncluded: 'Fuera de esta edición. Disponible en el PDF y el EPUB.', home: 'Inicio del libro',
  searchPlaceholder: 'Buscar en el libro…', searchEmpty: 'Escribe para buscar en todos los capítulos.',
  searchNone: 'Sin resultados para', searchLoading: 'Buscando…', searchError: 'La búsqueda no está disponible aquí.',
  searchHintMove: 'navegar', searchHintOpen: 'abrir', searchHintClose: 'cerrar',
  searchCount: ['resultado', 'resultados'], inSection: 'en',
};

export function uiFor(baseLang, overrides = {}) {
  const base = UI[baseLang] ?? UI.en;
  return { ...base, ...overrides };
}
