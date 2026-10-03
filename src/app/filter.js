import { ELEMENT, TEXT } from './nodes.js';
import { CHIP_STATUS_CLASS } from './chips.js';
import { FACETS_CLASS, FACET_BAR_CLASS, facetKeyClass, isFootnoteMarker, rowsOf } from './facets.js';
import { TABLE_CLASS } from './tables.js';
import { TRANSIENT_ATTR } from './transient.js';

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
// document styles (src/doc.css) hide on screen and not in print. The three
// read-only exports show the complete table without a field: an export step
// takes the attribute and that class out of their copy. The field exists only
// where JavaScript runs, the editor and "Mit Editor"; that is the documented
// exception to NFR1 and NFR2 (see src/README.md, "Tables").
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
// page. The listeners the pass attaches use nothing but the elements.

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
// The form in which a term and a row's text are compared: case ignored.
const folded = text => tidy(text).toLocaleLowerCase('de');

const tagOf = node => node.nodeType === ELEMENT ? node.tagName.toUpperCase() : '';

// The text of a row as the filter searches it: its cells joined by a blank, a
// line break as a blank, without the word a status chip carries for assistive
// technology, without a footnote marker and its preview, without the controls
// of a facet filter and without anything transient. A table nested in a cell
// is text of its cell, its cells joined by a blank as well.
export function filterRowText(row){
  let text = '';
  const read = node => {
    for (let child = node.firstChild; child; child = child.nextSibling){
      if (child.nodeType === TEXT){ text += child.data; continue; }
      if (child.nodeType !== ELEMENT) continue;
      const tag = tagOf(child);
      if (tag === 'BR'){ text += ' '; continue; }
      if (child.hasAttribute(TRANSIENT_ATTR) || isFootnoteMarker(child) ||
          child.classList.contains(CHIP_STATUS_CLASS) || child.classList.contains(FACET_BAR_CLASS)) continue;
      const cell = tag === 'TD' || tag === 'TH';
      if (cell) text += ' ';
      read(child);
      if (cell) text += ' ';
    }
  };
  read(row);
  return tidy(text);
}

// Whether a row's text matches a term: the term, blanks collapsed and none at
// its ends, as one phrase anywhere in the text, case ignored. An empty term
// matches every row.
export function filterMatches(term, text){
  const wanted = folded(term);
  return !wanted || folded(text).includes(wanted);
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
// that holds text empties it and goes no further, so it does not leave read
// mode; in an empty field it does what it does everywhere.
export function attachTableFilters(root){
  for (const table of Array.from(root.querySelectorAll('table[' + FILTER_ATTR + ']'))){
    const anchor = anchorOf(table);
    if (isElement(anchor.previousElementSibling, FILTER_CLASS)) continue;
    const { field, input, count } = buildField(table);
    anchor.parentNode.insertBefore(field, anchor);
    const update = () => applyFilter(table, input.value, count);
    input.addEventListener('input', update);
    input.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !input.value) return;
      e.preventDefault();
      e.stopPropagation();
      input.value = '';
      update();
    });
    const group = facetGroupOf(table);
    if (group) group.addEventListener('change', update);
    update();
  }
}

// Export step: what the filter left in the copy of the preview a read-only
// export is made from, taken out. The field is transient and gone by then; the
// mark of the table and the class of a hidden row are not. An export renders
// before it copies, so no row is hidden then, but the step does not count on it.
export function removeFilterMarks(copy){
  for (const el of Array.from(copy.querySelectorAll('[' + FILTER_ATTR + ']'))) el.removeAttribute(FILTER_ATTR);
  for (const el of Array.from(copy.querySelectorAll('.' + FILTER_OUT_CLASS))){
    el.classList.remove(FILTER_OUT_CLASS);
    if (!el.classList.length) el.removeAttribute('class');
  }
}
