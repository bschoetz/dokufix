// The second entry of the build: the free-text filter for the read-only
// exports that run a script, `schlank` and `kompakt` (Ben, 2026-10-03).
//
// build.mjs bundles this file with src/app/filter.js and what it imports into
// one small script, minified, and writes it into the data block
// #dokufix-filter-js of the page, where it does not run. The two exports copy
// that block's text into their file: `schlank` runs it when the file opens,
// behind its document; `kompakt` runs it after it has unpacked its document.
// `nur-lesen` gets nothing and stays without a script.
//
// It does in the exported file what the run-time pass "Tabellenfilter" does in
// the page: every table marked data-dokufix-filter in the content container
// gets its search field. Without scripts the table stays complete.
import { attachTableFilters } from './app/filter.js';

const root = document.querySelector('main.reader-body');
if (root) attachTableFilters(root);
