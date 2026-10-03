import { ELEMENT, TEXT } from './nodes.js';
import { CHIP_STATUS_CLASS } from './chips.js';

// --- Facet filter ----------------------------------------------------------
// A table with the marker "facets" before it gets one control per distinct
// value of the column the marker names, and choosing one hides the other rows:
//
//   <!-- dokufix: facets Typ -->
//   | Merkmal | Typ   |
//   |---------|-------|
//   | ORT     | Text  |
//   | STATUS  | Liste |
//   | TELEFON | Text  |
//
//   <div class="dokufix-facets">
//   <fieldset class="dokufix-facet-bar">
//   <legend>Typ</legend>
//   <label><input type="radio" name="dokufix-facet-1" class="dokufix-facet-0" checked>Alle <span class="dokufix-facet-count">3</span></label>
//   <label><input type="radio" name="dokufix-facet-1" class="dokufix-facet-1">Text <span class="dokufix-facet-count">2</span></label>
//   <label><input type="radio" name="dokufix-facet-1" class="dokufix-facet-2">Liste <span class="dokufix-facet-count">1</span></label>
//   </fieldset>
//   <table> … <tr class="dokufix-facet-row dokufix-facet-1"> … </table>
//   </div>
//
// The marker is read and applied in markers.js; this module is the entry for
// its list and what the component does to its block.
//
// It filters without JavaScript. The document styles (src/doc.css) hold one
// fixed rule per key, "where the control with key 7 is chosen, a data row
// without key 7 is not shown", for the keys 1 to FACET_MAX. Nothing is
// generated per table: no <style>, no inline style, no id. A table only gets
// keys, so a column with more distinct values than there are rules cannot be
// filtered, and the marker says so. The controls of one table are one group of
// radio buttons, told apart from the next table's by their name; "checked" is
// an attribute of the control for all rows alone, so a file that is written
// while a value is chosen opens with all rows.
//
// The controls are made with createElement and textContent only: what an
// author wrote into a heading or a cell is text here, whatever it looks like.
//
// Pure logic: the component works on the table it is handed and makes its
// elements with the document of that table, so this loads and runs without a
// page.

// How many distinct values a column may have. One rule per value stands in
// src/doc.css, in every file; tests/facets.test.mjs holds the two together.
export const FACET_MAX = 16;

export const FACETS_CLASS = 'dokufix-facets';
export const FACET_BAR_CLASS = 'dokufix-facet-bar';
export const FACET_COUNT_CLASS = 'dokufix-facet-count';
export const FACET_ROW_CLASS = 'dokufix-facet-row';
// The class a control and its rows share. Key 0 is the control for all rows.
export const facetKeyClass = key => 'dokufix-facet-' + key;
// The name the controls of the n-th facet table of a document share.
export const facetGroupName = n => 'dokufix-facet-' + n;

// What a reader sees: the control for all rows, and the one for an empty cell.
export const FACET_ALL = 'Alle';
export const FACET_EMPTY = '(leer)';

// Why the component refuses a table. Each text ends the sentence that
// markers.js starts with the marker as written: "Die Markierung „dokufix:
// facets Tpy“ nennt eine Spalte, die die Tabelle nicht hat."
export const FACET_REFUSALS = {
  noColumn: 'nennt keine Spalte.',
  noHeader: 'braucht eine Tabelle mit Kopfzeile.',
  unknownColumn: 'nennt eine Spalte, die die Tabelle nicht hat.',
  tooMany: count => 'trifft auf ' + count + ' verschiedene Werte in ihrer Spalte; mehr als ' + FACET_MAX + ' kann sie nicht filtern.',
  nested: 'steht in einer Tabelle, die schon gefiltert wird.',
};

// White space collapsed, none at the ends.
const tidy = text => String(text).replace(/\s+/g, ' ').trim();

// Which column the marker names: its place among the headings, -1 when none
// has that name. headings are the first lines of the header cells. The name is
// compared with white space collapsed and without regard to case; the first
// match wins.
export function findFacetColumn(headings, name){
  const wanted = tidy(name).toLowerCase();
  return headings.findIndex(heading => tidy(heading).toLowerCase() === wanted);
}

// The distinct values of a column in the order of their first appearance,
// each with the number of its rows and its key, counted from 1; and the key
// of every row. Values are compared exactly, case included: "C", "C++" and
// "c" are three. An empty value is a value like any other.
export function groupFacetValues(values){
  const groups = [], byValue = new Map(), keys = [];
  for (const value of values){
    let group = byValue.get(value);
    if (!group){
      group = { value, label: value === '' ? FACET_EMPTY : value, count: 0, key: groups.length + 1 };
      byValue.set(value, group);
      groups.push(group);
    }
    group.count++;
    keys.push(group.key);
  }
  return { groups, keys };
}

// What the marker comes to on a table that is given as texts: { warning },
// the reason it cannot act, or { index, legend, groups, keys }. The comparison
// run asks here as well, with a table it read from the Markdown.
//
//   argument   what follows the marker's name: the column
//   headings   the first line of each header cell, or null when the table has
//              no header row
//   valuesOf   (index) the value of every data row in that column
export function planFacets(argument, headings, valuesOf){
  if (!tidy(argument)) return { warning: FACET_REFUSALS.noColumn };
  if (!headings) return { warning: FACET_REFUSALS.noHeader };
  const index = findFacetColumn(headings, argument);
  if (index < 0) return { warning: FACET_REFUSALS.unknownColumn };
  const { groups, keys } = groupFacetValues(valuesOf(index));
  if (groups.length > FACET_MAX) return { warning: FACET_REFUSALS.tooMany(groups.length) };
  return { index, legend: tidy(headings[index]), groups, keys };
}

// ---------- the table as elements ----------
const tagOf = node => node.nodeType === ELEMENT ? node.tagName.toUpperCase() : '';
const childrenOf = (el, ...tags) => Array.from(el.children).filter(child => tags.includes(tagOf(child)));
const cellsOf = row => childrenOf(row, 'TD', 'TH');

// How many columns a cell takes: its colspan, as HTML reads one.
function spanOf(cell){
  const m = /^\s*(\d+)/.exec(cell.getAttribute('colspan') || '');
  const span = m ? parseInt(m[1], 10) : 1;
  return span >= 1 && span <= 1000 ? span : 1;
}
// The cell of a row that covers the column at this place, or null. rowspan is
// not followed.
function cellAt(row, index){
  let at = 0;
  for (const cell of cellsOf(row)){
    const span = spanOf(cell);
    if (index < at + span) return cell;
    at += span;
  }
  return null;
}

// A footnote marker, as marked-footnote emits one: <sup><a data-footnote-ref>.
const isFootnoteMarker = el => (tagOf(el) === 'A' && el.hasAttribute('data-footnote-ref')) ||
  (tagOf(el) === 'SUP' && Array.from(el.children).some(child => tagOf(child) === 'A' && child.hasAttribute('data-footnote-ref')));

// The value of a cell: its text up to the first line break, without the word
// a status chip carries for assistive technology and without a footnote
// marker, white space collapsed. '' for an empty cell and for no cell.
export function facetValue(cell){
  let text = '';
  // False when a <br> was met: nothing behind it counts.
  const read = node => {
    for (let child = node.firstChild; child; child = child.nextSibling){
      if (child.nodeType === TEXT){ text += child.data; continue; }
      if (child.nodeType !== ELEMENT) continue;
      if (tagOf(child) === 'BR') return false;
      if (child.classList.contains(CHIP_STATUS_CLASS) || isFootnoteMarker(child)) continue;
      if (!read(child)) return false;
    }
    return true;
  };
  if (cell) read(cell);
  return tidy(text);
}

// The header row and the data rows of a table. The header row is the first
// row of <thead>, or else the table's first row when all its cells are <th>.
// Data rows are the rows of the table's own <tbody>s and rows directly in the
// table: never a row of a table nested in a cell, and never one of <tfoot>.
function rowsOf(table){
  const head = childrenOf(table, 'THEAD')[0];
  let header = head ? childrenOf(head, 'TR')[0] || null : null;
  const body = [];
  for (const child of Array.from(table.children)){
    if (tagOf(child) === 'TR') body.push(child);
    else if (tagOf(child) === 'TBODY') body.push(...childrenOf(child, 'TR'));
  }
  if (!head && body.length){
    const cells = cellsOf(body[0]);
    if (cells.length && cells.every(cell => tagOf(cell) === 'TH')) header = body.shift();
  }
  return { header, body };
}

// The topmost ancestor of a node: the document, or the fragment it stands in.
function topOf(node){
  let top = node;
  while (top.parentNode) top = top.parentNode;
  return top;
}

// One control: a radio button in its label, the label's text and the count.
function buildControl(doc, name, key, text, count){
  const label = doc.createElement('label');
  const input = doc.createElement('input');
  input.setAttribute('type', 'radio');
  input.setAttribute('name', name);
  input.className = facetKeyClass(key);
  if (key === 0) input.setAttribute('checked', '');
  const number = doc.createElement('span');
  number.className = FACET_COUNT_CLASS;
  number.textContent = String(count);
  label.append(input, doc.createTextNode(text + ' '), number);
  return label;
}

// Puts the controls above the table and gives every data row its key.
// Returns { warning } with the reason when it cannot, and leaves the table as
// it was then.
export function buildFacets(table, argument){
  let outer = table.parentNode;
  while (outer && !(outer.nodeType === ELEMENT && outer.classList.contains(FACETS_CLASS))) outer = outer.parentNode;
  if (outer) return { warning: FACET_REFUSALS.nested };

  const { header, body } = rowsOf(table);
  // The headings by column: a cell that spans three columns names the first
  // of them, and the other two have no name.
  const headings = header && cellsOf(header).flatMap(cell => [facetValue(cell), ...Array(spanOf(cell) - 1).fill('')]);
  const plan = planFacets(argument, headings, index => body.map(row => facetValue(cellAt(row, index))));
  if (plan.warning) return plan;

  const doc = table.ownerDocument;
  body.forEach((row, i) => row.classList.add(FACET_ROW_CLASS, facetKeyClass(plan.keys[i])));

  const name = facetGroupName(topOf(table).querySelectorAll('.' + FACETS_CLASS).length + 1);
  const bar = doc.createElement('fieldset');
  bar.className = FACET_BAR_CLASS;
  const legend = doc.createElement('legend');
  legend.textContent = plan.legend;
  bar.append(legend, buildControl(doc, name, 0, FACET_ALL, body.length));
  for (const group of plan.groups) bar.append(buildControl(doc, name, group.key, group.label, group.count));

  const group = doc.createElement('div');
  group.className = FACETS_CLASS;
  table.replaceWith(group);
  group.append(bar, table);
  return undefined;
}

// The entry for the list of markers (markers.js): the name an author writes,
// the block the marker expects directly after it, by tag, and that what
// follows the name is handed to the component: the column.
export const FACETS = { name: 'facets', block: 'TABLE', argument: 'text', apply: buildFacets };
