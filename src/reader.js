// The second entry of the build: the reader bundle of the read-only exports
// that run a script, `schlank` and `kompakt`. It carries the table filter,
// the search, the keys of the large view and the picture button of a diagram.
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
//     read mode: "/" opens the panel, "×" and Escape close it. Its styles, src/search.css
//     minified, come in as SEARCH_CSS from the build and go into the head of
//     the file here, behind its stylesheet; the file's own <style> does not
//     carry them, so `nur-lesen`, which shares it, has none.
//   - the keys of the large view of a diagram (src/app/large-view.js):
//     Escape closes it, "+" and "-" change its zoom step. The view itself
//     works without them, as in `nur-lesen`.
//   - the picture button below every drawn diagram (src/app/diagram-downloads.js),
//     as the run-time pass "Diagramm-Bilder" does in the page: a click saves
//     the SVG of the figure as a file. In `schlank` it reads the SVG at the
//     click, after the decoder has filled the container. The source link
//     beside it is document content and needs no script.
//
// It must not import src/app/dom.js, which looks up the editor's elements.
import { attachTableFilters } from './app/filter.js';
import { registerSearch } from './app/search.js';
import { registerLargeViewKeys } from './app/large-view.js';
import { attachSvgDownloads } from './app/diagram-downloads.js';

/* global SEARCH_CSS */
const root = document.querySelector('main.reader-body');
if (root){
  attachTableFilters(root);
  attachSvgDownloads(root);
  const style = document.createElement('style');
  style.textContent = SEARCH_CSS;
  document.head.appendChild(style);
  registerSearch({ root, inReadMode: () => true });
  registerLargeViewKeys(document);
}
