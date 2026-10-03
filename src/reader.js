// The second entry of the build: the reader bundle of the read-only exports
// that run a script, `schlank` and `kompakt`. It carries the table filter and
// the search.
//
// build.mjs bundles this file with what it imports into one small script,
// minified, and writes it into the data block #dokufix-reader-js of the page,
// where it does not run. The two exports copy that block's text into every
// file they write, with a filter table or without: `schlank` runs it when the
// file opens, behind its document; `kompakt` runs it after it has unpacked its
// document. `nur-lesen` gets nothing and stays without a script.
//
// When it runs, in the exported file:
//   - the table filter, as the run-time pass "Tabellenfilter" does in the
//     page: every table marked data-dokufix-filter in the content container
//     gets its search field. Without scripts the table stays complete.
//   - the search (src/app/search.js) over the content container, always in
//     read mode: "/" opens the panel, "×" closes it. Its styles, src/search.css
//     minified, come in as SEARCH_CSS from the build and go into the head of
//     the file here, behind its stylesheet; the file's own <style> does not
//     carry them, so `nur-lesen`, which shares it, has none.
//
// It must not import src/app/dom.js, which looks up the editor's elements.
import { attachTableFilters } from './app/filter.js';
import { registerSearch } from './app/search.js';

/* global SEARCH_CSS */
const root = document.querySelector('main.reader-body');
if (root){
  attachTableFilters(root);
  const style = document.createElement('style');
  style.textContent = SEARCH_CSS;
  document.head.appendChild(style);
  registerSearch({ root, inReadMode: () => true });
}
