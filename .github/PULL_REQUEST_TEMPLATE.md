## What

<!-- One paragraph: what changes and why. -->

## How it was verified

- [ ] `bash example/run.sh --all` builds clean (PDF + EPUB + cover)
- [ ] If the change affects rendering: I looked at the affected pages in the output PDF/EPUB
- [ ] If the change affects a real book consuming the kit as a submodule: that book still builds

## Design rules check

- [ ] No book-specific strings hardcoded in the engine (everything comes from `book.config.json`)
- [ ] Generated outputs (`typst/chapters`, `dist/`, diagrams) stay out of git
