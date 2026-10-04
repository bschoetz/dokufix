import { ELEMENT, TEXT } from './nodes.js';
import { CHIP_STATUS_CLASS } from './chips.js';
import { FACETS_CLASS, FACET_BAR_CLASS, facetKeyClass, isFootnoteMarker, rowsOf } from './facets.js';
import { TABLE_CLASS } from './tables.js';
import { TRANSIENT_ATTR } from './transient.js';
import { findHits } from './search-match.js';

// --- Free-text filter ------------------------------------------------------
// A table with the marker "filter" before it gets a search field above it
// where a script runs, and typing hides the rows that do not contain the text:
//
//   <!-- dokufix: filter "Merkmal suchen …" -->
//   | Merkmal | Typ   |
//   |---------|-------|
//   | ORT     | Text  |
//   | STATUS  | Liste |
//
// The marker is read and applied in markers.js. In the document it only marks
// its table, with the placeholder of the field:
//
//   <table data-dokufix-filter="Merkmal suchen …"> … </table>
//
// The field is no part of the document. A run-time pass puts it directly above
// the table's wrapper (tables.js), outside it, so that it does not scroll
// sideways with a wide table; in a facet filter it stands between the controls
// and the wrapper. It carries data-dokufix-transient, so no download takes it
// along:
//
//   <div class="dokufix-filter" data-dokufix-transient>
//   <input type="search" class="dokufix-filter-input" placeholder="Merkmal suchen …" aria-label="Tabelle filtern" autocomplete="off">
//   <span class="dokufix-filter-count" role="status">2 Zeilen</span>
//   </div>
//
// A row that does not match gets the class dokufix-filter-out, which the
// document styles (src/doc.css) hide on screen and not in print. The field
// exists where JavaScript runs: the editor, "Mit Editor", and the read-only
// exports `schlank` and `kompakt`, which carry this code in their reader
// bundle (src/reader.js) and run it when they open (Ben, 2026-10-03). `nur-lesen`
// has no script and shows the complete table without a field; that is the
// documented exception to NFR1 and NFR2 (see src/README.md, "Tables"). One
// export step takes the class of a hidden row out of all three read-only
// exports; another, which `nur-lesen` alone runs, takes the table's mark.
//
// Beside a facet filter on the same table a row is shown only when both hold:
// it matches the text and has the value chosen there. Each hides by a class of
// its own, and the counter reads both from the classes, so it needs no layout.
//
// Everything is made with createElement, setAttribute and textContent: the
// placeholder an author wrote is text.
//
// Pure logic: the component and the pass work on what they are handed and
// make their elements with its document, so this loads and runs without a
// page. The listeners the pass attaches use nothing but the elements. So the
// pass runs unchanged in an exported file, on its content container.

export const FILTER_ATTR = 'data-dokufix-filter';
export const FILTER_CLASS = 'dokufix-filter';
export const FILTER_INPUT_CLASS = 'dokufix-filter-input';
export const FILTER_COUNT_CLASS = 'dokufix-filter-count';
export const FILTER_OUT_CLASS = 'dokufix-filter-out';

// What a reader sees: the placeholder when the marker names none, and the
// name of the field for assistive technology.
export const FILTER_PLACEHOLDER = 'Suchen …';
export const FILTER_LABEL = 'Tabelle filtern';

// White space collapsed, none at the ends.
const tidy = text => String(text).replace(/\s+/g, ' ').trim();

const tagOf = node => node.nodeType === ELEMENT ? node.tagName.toUpperCase() : '';

// What holds no text a reader reads: a picture, a stylesheet, a script, a
// template. The search of the reading view leaves the same out, and its
// test holds the two readings of a row together.
const TEXTLESS_TAGS = new Set(['SVG', 'SCRIPT', 'STYLE', 'TEMPLATE']);

// The text of a row as the filter searches it: its cells joined by a blank, a
// line break as a blank, without the word a status chip carries for assistive
// technology, without a footnote marker and its preview, without the controls
// of a facet filter, without anything transient and without an SVG, a
// stylesheet, a script or a template. A table nested in a cell is text of its
// cell, its cells joined by a blank as well.
export function filterRowText(row){
  let text = '';
  const read = node => {
    for (let child = node.firstChild; child; child = child.nextSibling){
      if (child.nodeType === TEXT){ text += child.data; continue; }
      if (child.nodeType !== ELEMENT) continue;
      const tag = tagOf(child);
      if (tag === 'BR'){ text += ' '; continue; }
      if (child.hasAttribute(TRANSIENT_ATTR) || isFootnoteMarker(child) ||
          child.classList.contains(CHIP_STATUS_CLASS) || child.classList.contains(FACET_BAR_CLASS) || TEXTLESS_TAGS.has(tag)) continue;
      const cell = tag === 'TD' || tag === 'TH';
      if (cell) text += ' ';
      read(child);
      if (cell) text += ' ';
    }
  };
  read(row);
  return tidy(text);
}

// Whether a row's text matches a term, by the rules of the search with both
// of its switches off (findHits() of search-match.js, story 11 of epic 5): the
// term, blanks collapsed, as one phrase anywhere in the text, case ignored; a
// blank at an edge of the term marks a word boundary (story 14). An empty term matches every row. The filter has no
// switches and no minimum length: it filters from the first character typed,
// tooShort() is the search's.
export function filterMatches(term, text){
  return !tidy(term) || findHits(term, tidy(text)).length > 0;
}

// What the counter says: "14 Zeilen" when every row is shown, else
// "3 von 14 Zeilen"; "1 Zeile" and "0 von 1 Zeile" for a table of one row.
export function filterCountText(shown, total){
  const rows = total === 1 ? ' Zeile' : ' Zeilen';
  return shown === total ? total + rows : shown + ' von ' + total + rows;
}

// The component: marks the table with the placeholder of its field. It never
// refuses a table.
export function markFilter(table, argument){
  table.setAttribute(FILTER_ATTR, tidy(argument) || FILTER_PLACEHOLDER);
  return undefined;
}

// The entry for the list of markers (markers.js): the name an author writes,
// the block the marker expects directly after it, by tag, and that what
// follows the name is handed to the component: the placeholder.
export const FILTER = { name: 'filter', block: 'TABLE', argument: 'text', apply: markFilter };

// ---------- at run time ----------
const isElement = (node, cls) => !!node && node.nodeType === ELEMENT && node.classList.contains(cls);

// The wrapper of the table, or the table itself when it has none: the
// element the field stands directly above.
const anchorOf = table => isElement(table.parentNode, TABLE_CLASS) ? table.parentNode : table;

// The group of the facet filter on the same table, or null.
function facetGroupOf(table){
  const parent = anchorOf(table).parentNode;
  return isElement(parent, FACETS_CLASS) ? parent : null;
}

// The key of the control chosen in a facet group: 0 for all rows. Read from
// the property: the attribute "checked" stays on the control for all rows.
function chosenFacetKey(group){
  const inputs = group ? Array.from(group.querySelectorAll(':scope > .' + FACET_BAR_CLASS + ' input')) : [];
  const input = inputs.find(i => i.checked);
  const m = input && /(?:^|\s)dokufix-facet-(\d+)(?:\s|$)/.exec(input.className);
  return m ? Number(m[1]) : 0;
}

// Hides the rows that do not match the term, and says on the counter how many
// are shown: those that match and, beside a facet filter, have the value
// chosen there.
export function applyFilter(table, term, count){
  const { body } = rowsOf(table);
  const key = chosenFacetKey(facetGroupOf(table));
  let shown = 0;
  for (const row of body){
    const match = filterMatches(term, filterRowText(row));
    row.classList.toggle(FILTER_OUT_CLASS, !match);
    if (match && (key === 0 || row.classList.contains(facetKeyClass(key)))) shown++;
  }
  if (count) count.textContent = filterCountText(shown, body.length);
  return shown;
}

// The field of one table, made with the document of the table.
function buildField(table){
  const doc = table.ownerDocument;
  const field = doc.createElement('div');
  field.className = FILTER_CLASS;
  field.setAttribute(TRANSIENT_ATTR, '');
  const input = doc.createElement('input');
  input.setAttribute('type', 'search');
  input.className = FILTER_INPUT_CLASS;
  input.setAttribute('placeholder', table.getAttribute(FILTER_ATTR) || FILTER_PLACEHOLDER);
  input.setAttribute('aria-label', FILTER_LABEL);
  input.setAttribute('autocomplete', 'off');
  const count = doc.createElement('span');
  count.className = FILTER_COUNT_CLASS;
  count.setAttribute('role', 'status');
  field.append(input, count);
  return { field, input, count };
}

// Run-time pass "Tabellenfilter": every table marked by the component gets its
// field, once, directly above its wrapper. Typing filters; choosing a value of
// a facet filter on the same table updates the counter. Escape in a field
// that holds text empties it (filterFieldStep, below).
export function attachTableFilters(root){
  for (const table of Array.from(root.querySelectorAll('table[' + FILTER_ATTR + ']'))){
    const anchor = anchorOf(table);
    // The pass's own field: the class alone could be an author's element.
    const before = anchor.previousElementSibling;
    if (isElement(before, FILTER_CLASS) && before.hasAttribute(TRANSIENT_ATTR)) continue;
    const { field, input, count } = buildField(table);
    anchor.parentNode.insertBefore(field, anchor);
    const update = () => applyFilter(table, input.value, count);
    input.addEventListener('input', update);
    const group = facetGroupOf(table);
    if (group) group.addEventListener('change', update);
    update();
  }
}

// The field of the pass that holds the focus of e and some text, or null.
function filledField(e){
  const input = e.target;
  if (!isElement(input, FILTER_INPUT_CLASS) || !input.value) return null;
  const field = input.parentNode;
  return isElement(field, FILTER_CLASS) && field.hasAttribute(TRANSIENT_ATTR) ? input : null;
}

// The step of Escape (src/app/escape.js): a field that holds text, with the
// focus in it, is emptied, and Escape goes no further, so it does not leave
// read mode; in an empty field it does what it does everywhere. Emptied, the
// field fires `input`, as typing does, and its table is filtered anew.
export const filterFieldStep = {
  applies: e => !!filledField(e),
  close: e => {
    const input = filledField(e);
    input.value = '';
    input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
  },
};

// Export step of all three read-only exports: no row is hidden in what leaves
// the page. An export renders before it copies, so no row is hidden then, but
// the step does not count on it. The field is transient and gone by then.
export function showFilteredRows(copy){
  for (const el of Array.from(copy.querySelectorAll('.' + FILTER_OUT_CLASS))){
    el.classList.remove(FILTER_OUT_CLASS);
    if (!el.classList.length) el.removeAttribute('class');
  }
}

// Export step of `nur-lesen` alone, which has no script and so no field: the
// mark of a filter table goes. `schlank` and `kompakt` keep it; the filter
// they run when they open (src/reader.js) finds its tables by it.
export function removeFilterMarks(copy){
  for (const el of Array.from(copy.querySelectorAll('[' + FILTER_ATTR + ']'))) el.removeAttribute(FILTER_ATTR);
}
