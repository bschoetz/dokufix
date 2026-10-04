import { findHits, excerpt, tooShort } from './search-match.js';
import { collectPlaces, groupResults, nodeRanges, KIND_META, KIND_CODE } from './search-places.js';
import { TRANSIENT_ATTR } from './transient.js';
import { DIAGRAM_CLASS } from './diagrams.js';
import { largeViewOpen } from './large-view.js';
import { FILTER_CLASS, FILTER_INPUT_CLASS, FILTER_OUT_CLASS } from './filter.js';
import { FACETS_CLASS, FACET_BAR_CLASS } from './facets.js';
import { TABLE_CLASS } from './tables.js';

// --- Search: the panel ---------------------------------------------------------
// In read mode the key "/" opens a search panel on the right of the window. It
// lists one result per place of the document that holds the term, in the
// order of the document, each with a part of its text and the term marked in
// it, under a line that says how many hits there are at how many places in how
// many sections. The results stand grouped under the headings H2 to H4 the
// rail lists (groupResults() in search-places.js), each group heading with the
// hits and places of its branch; a group heading is text, not a button, a
// heading of its level for assistive technology (role, aria-level), and
// stays at the top of the list while its results scroll under it. Both lists
// say role="list", which keeps a list a list without list-style in Safari
// and VoiceOver. A click on
// a result scrolls the document to its place; the panel stays open.
//
// A place with a kind, a table row, a diagram, the metadata panel or a code
// block (search-places.js), says it before its text: "Tabelle: ",
// "BPMN-Diagramm: ", "Mermaid-Diagramm: ", "Metadaten: " or "Code: " in a
// span of its own, which is no text of the place, so nothing in it is
// marked. A diagram's text is its labels; a click on its result scrolls the
// start of its figure to the top of the window, and nothing in it is
// highlighted. A click on the result of the metadata panel or of a code
// block brings its first hit to the middle of the window, so a hit deep in a
// tall block is in view, a code block scrolled sideways to it as well; the
// metadata panel, a <details>, is opened first where it is closed, and stays
// open, as if the reader had opened it. Its `open` is no part of a file: a
// `Mit Editor` file is saved from the source, an export renders anew. A row a table's filter hides, the free-text filter
// by its class or a facet filter by CSS alone (a row of a facet table without
// a box), is
// listed like any row, marked " (ausgeblendet)" after its text; a click on it
// scrolls to the table's filter controls, the facet buttons, else the field of
// the free-text filter, else the table, and the filter stays as it is.
// Whether a row is hidden is read when the search runs and again on the click.
// While the panel is open and holds a term, a change of a table filter in the
// root (typing in its field, choosing a facet value) runs the search again
// after the same pause as typing, so the marks follow.
//
//   <div class="search-panel" role="search" aria-label="Suche im Dokument" data-dokufix-transient hidden>
//   <label class="search-label"><span class="search-label-text">Im Dokument suchen</span>
//   <input type="search" class="search-input" autocomplete="off" spellcheck="false"></label>
//   <button type="button" class="search-close" aria-label="Suche schließen">×</button>
//   <div class="search-switches">
//   <label class="search-switch"><input type="checkbox">Groß- und Kleinschreibung beachten</label>
//   <label class="search-switch"><input type="checkbox">Leerzeichen, Bindestriche und Punkte ignorieren</label>
//   </div>
//   <p class="search-summary" role="status">3 Treffer an 2 Stellen in 2 Abschnitten</p>
//   <ol class="search-results" role="list">
//   <li class="search-group search-group-h2">
//   <div class="search-group-head" role="heading" aria-level="2"><span class="search-group-title">Eine Tabelle</span><span class="search-group-count">2 Treffer an 1 Stelle</span></div>
//   <ol class="search-group-list" role="list">
//   <li><button type="button" class="search-result">… eine <mark>Tabelle</mark> mit …</button></li>
//   <li><button type="button" class="search-result"><span class="search-kind">Tabelle: </span>Karten Block …<span class="search-hidden"> (ausgeblendet)</span></button></li>
//   <li class="search-group search-group-h3">…</li>
//   </ol>
//   </li>
//   </ol>
//   </div>
//
// Two callers run it, each with its root and its read mode (registerSearch()):
// the page, over the preview, in read mode, which src/app.js closes the panel
// on leaving; and the reader bundle of `schlank` and `kompakt` (src/reader.js),
// over main.reader-body, always in read mode, where "×" and Escape close it. This
// module reads no element of the page itself.
//
// The panel is frame, not document: it is made once, at load, in <body>
// outside the root, and carries data-dokufix-transient, so a saved file has
// neither the panel nor a term typed into it. No element of it has an id: an
// id of the document, the anchor of a heading "Search Input" say, could be
// the same; the field stands in its label, which names it so. Nothing of it touches the
// root's DOM: the places and their text are read (search-places.js), the
// hits found in that text (search-match.js), and the results are made with
// createElement and textContent, so the document's text stays text. Its
// styles are src/search.css.
//
// A magnifier opens the panel as well, for a reader who does not know the key
// (FR48): a button with the 16 px Octicon "search" and the tooltip
// "Suchen (/)", made once at load beside the panel, in <body>, transient like
// it. A click opens the panel and puts the focus into its field; on an open
// panel it does no more than that, it does not close it. One element, placed
// by CSS alone, src/search.css and, in the editor, src/app.css, at the same
// place at every width, with a rail or without: fixed at the top right, in the
// editor left of "Editor ↩", hidden there outside read mode. It lies under an open
// panel and under the large view of a diagram.
//
//   <button type="button" class="search-magnifier" aria-label="Suchen" aria-keyshortcuts="/" title="Suchen (/)" data-dokufix-transient>
//   <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="…"/></svg>
//   </button>
//
// "/" opens the panel in read mode only, without Ctrl, Alt or Meta, and not
// while the focus is in a field, where it is typed, nor while the large view
// of a diagram is open (large-view.js), which lies over the panel. It puts
// the focus into the panel's field. The close button closes it, and so does Escape, which then
// does nothing else (registerSearch()); a focus in the panel goes back to
// what had it before, else to the magnifier (closeSearch()). A closed panel forgets its term;
// opened again, it reads the root afresh. The search runs on typing, after a
// short pause, outside the render, so a failure in it breaks no render.
//
// A diagram of a `schlank` file is packed (data-gz) until the file's decoder
// has unpacked it. The file writes its content container with the mark
// UNPACKING_ATTR wherever it writes the decoder, and the decoder takes the
// mark when it has gone through every packed diagram, whether each came out
// or not, then announces its end with UNPACKED_EVENT on the document. A
// search over a root with the mark lists nothing and says so in the summary,
// "Diagramme werden entpackt …", and runs on the event. A root without it,
// the preview and every other file, never waits, whatever it holds: packed
// markup an author writes is markup.
//
// Enter in the field follows the first result, as a click on it does; Down
// puts the focus on it, and Down and Up go through the results, Up from the
// first back to the field. Escape is as above.
//
// Two switches below the field change how the term is compared
// (search-match.js): case-sensitive, and light fuzzy, which ignores white
// space, hyphens and dots. Both start off; flipping one searches again at
// once. They keep their state when the panel closes, the term does not. A
// term too short is not searched: the summary says so and nothing is listed.
//
// While the panel is open, every hit of every listed place is highlighted in
// the document, all of them, with the CSS Custom Highlight API: one Highlight
// under the name HIGHLIGHT in CSS.highlights, of StaticRanges over the text
// nodes the hits came from (nodeRanges() in search-places.js), drawn by
// ::highlight() in src/search.css. Nothing is added to the root or changed in
// it, so a file saved or exported while the panel is open is the file it
// would be without it. Every search replaces the highlight; a term too short,
// an empty field and closing the panel take it away. A render that replaces
// the root's nodes leaves ranges over nodes no longer in the document, which
// draw nothing; a click on a result then searches again. Where the browser
// has no CSS.highlights, the results are listed without highlight.

const PANEL_CLASS = 'search-panel';
const MAGNIFIER_CLASS = 'search-magnifier';
// The Octicon "search", 16 px (@primer/octicons 19.38.0, build/svg/search-16.svg).
const MAGNIFIER_PATH = 'M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z';
const SVG_NS = 'http://www.w3.org/2000/svg';
// What the decoder of a `schlank` file dispatches on the document when it has
// gone through every packed diagram (src/app/downloads/readonly-slim.js).
export const UNPACKED_EVENT = 'dokufix-diagrams-unpacked';
// The mark of the content container of a `schlank` file while its decoder
// runs: written with the decoder, taken by it before UNPACKED_EVENT.
export const UNPACKING_ATTR = 'data-dokufix-unpacking';
// How long typing pauses before the search runs, in milliseconds.
const PAUSE = 150;
// How many characters of a place's text a result shows at most.
const EXCERPT_MAX = 160;
// The name of the highlight of the hits in the document (src/search.css).
export const HIGHLIGHT = 'search-hit';

let panel = null;
let magnifier = null;
// What had the focus when the panel opened, outside it; null for the body.
let opener = null;
let input = null;
let summary = null;
let list = null;
let caseBox = null;
let fuzzyBox = null;
let timer = 0;
// From the caller: the element searched, and whether "/" may open the panel.
let rootOf = () => null;
let inReadMode = () => false;
// The places of the root, kept between searches (placesOf()), the root they
// are of, and the observer that drops them.
let places = null;
let observed = null;
let observer = null;

export const isSearchOpen = () => !!panel && !panel.hidden;

// What the line above the results says when the term is too short, and
// while the decoder of a `schlank` file unpacks its diagrams.
const TOO_SHORT = 'Zu kurz: mindestens drei Buchstaben oder Ziffern';
const UNPACKING = 'Diagramme werden entpackt …';

// How the switches say the term is compared.
const matchOptions = () => ({ caseSensitive: caseBox.checked, fuzzy: fuzzyBox.checked });

// How many hits at how many places: the numbers of a group heading.
const countText = (hits, places) => hits + ' Treffer an ' + places + (places === 1 ? ' Stelle' : ' Stellen');

// What the line above the results says: "" for no term.
function summaryText(term, hits, places, sections, short){
  if (!term.trim()) return '';
  if (short) return TOO_SHORT;
  if (!places) return 'Keine Treffer';
  return countText(hits, places) + ' in ' + sections + (sections === 1 ? ' Abschnitt' : ' Abschnitten');
}

// The part of a place's text a result shows, with its hits marked.
function previewOf(text, hits){
  const part = excerpt(text, hits, EXCERPT_MAX);
  const frag = document.createDocumentFragment();
  let at = 0;
  if (part.cutStart) frag.append('… ');
  for (const hit of part.hits){
    if (hit.start > at) frag.append(part.text.slice(at, hit.start));
    const mark = document.createElement('mark');
    mark.textContent = part.text.slice(hit.start, hit.end);
    frag.append(mark);
    at = hit.end;
  }
  if (at < part.text.length) frag.append(part.text.slice(at));
  if (part.cutEnd) frag.append(' …');
  return frag;
}

// What a hidden row says after its text.
const HIDDEN_NOTE = ' (ausgeblendet)';

const hasClass = (el, cls) => !!el && el.nodeType === 1 && el.classList.contains(cls);

// Whether a table filter hides a row now: the free-text filter gives it a
// class; a facet filter hides it by CSS alone, so a row of a facet table
// without a box is hidden. A row without a box elsewhere, in a closed
// <details> say, is not hidden by a filter, and counts as shown.
const rowHidden = row => row.classList.contains(FILTER_OUT_CLASS) ||
  (!!row.closest('.' + FACETS_CLASS) && !row.getClientRects().length);

// The filter controls of a row's table: the facet buttons, else the field of
// the free-text filter, else the table. As filter.js finds them: the field
// stands directly above the table's wrapper, and the wrapper of a facet table
// stands in the facet group beside the buttons.
function controlsOf(row){
  const table = row.closest('table');
  const anchor = hasClass(table.parentNode, TABLE_CLASS) ? table.parentNode : table;
  const group = anchor.parentNode;
  const bar = hasClass(group, FACETS_CLASS) && group.querySelector(':scope > .' + FACET_BAR_CLASS);
  if (bar) return bar;
  const field = anchor.previousElementSibling;
  return hasClass(field, FILTER_CLASS) ? field : table;
}

// Brings the first hit of a place to the middle of the window, opening the
// place first if it is a closed <details>, the metadata panel. Where the hit
// has no range of the document, or its range no box, the place itself.
function centreHit(place, hit){
  const el = place.el;
  if (el.tagName.toUpperCase() === 'DETAILS' && !el.open) el.open = true;
  const r = hit && nodeRanges(place.map, hit)[0];
  if (!r){ el.scrollIntoView({ block: 'center' }); return; }
  const range = document.createRange();
  range.setStart(r.startNode, r.startOffset);
  range.setEnd(r.endNode, r.endOffset);
  // A hit with no box, inside an author's closed <details> say: the place.
  const box = range.getBoundingClientRect(), frame = el.getBoundingClientRect();
  if (!box.width && !box.height){ el.scrollIntoView({ block: 'center' }); return; }
  // Sideways first: a long line of code scrolls inside its block.
  if (box.left < frame.left || box.right > frame.right) el.scrollLeft += box.left - frame.left - (frame.width - box.width) / 2;
  const at = range.getBoundingClientRect();
  window.scrollBy(0, at.top + at.height / 2 - window.innerHeight / 2);
}

// A result: a button with the kind of its place, if it has one, and the part
// of its text, which scrolls the document to the place, a diagram to its
// start, the metadata panel and a code block to their first hit; a hidden
// row says so and scrolls to its table's filter controls.
function resultItem({ place, at }){
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'search-result';
  const row = !!place.kind && place.el.tagName.toUpperCase() === 'TR';
  if (place.kind){
    const kind = document.createElement('span');
    kind.className = 'search-kind';
    kind.textContent = place.kind + ': ';
    button.append(kind);
  }
  button.append(previewOf(place.text, at));
  if (row && rowHidden(place.el)){
    const note = document.createElement('span');
    note.className = 'search-hidden';
    note.textContent = HIDDEN_NOTE;
    button.append(note);
  }
  button.addEventListener('click', () => {
    // The root was rendered anew since: search it again.
    if (!place.el.isConnected){ search(); return; }
    if (hasClass(place.el, DIAGRAM_CLASS)){ place.el.scrollIntoView({ block: 'start' }); return; }
    if (place.kind === KIND_META || place.kind === KIND_CODE){ centreHit(place, at[0]); return; }
    (row && rowHidden(place.el) ? controlsOf(place.el) : place.el).scrollIntoView({ block: 'center' });
  });
  li.append(button);
  return li;
}

// A group: its heading with the numbers of its branch, then its own results
// and the groups below it.
function groupItem(group){
  const li = document.createElement('li');
  li.className = 'search-group search-group-h' + group.level;
  const head = document.createElement('div');
  head.className = 'search-group-head';
  head.setAttribute('role', 'heading');
  head.setAttribute('aria-level', group.level);
  const title = document.createElement('span');
  title.className = 'search-group-title';
  title.textContent = group.label;
  title.title = group.label;
  const count = document.createElement('span');
  count.className = 'search-group-count';
  count.textContent = countText(group.hits, group.places);
  head.append(title, count);
  const list = document.createElement('ol');
  list.className = 'search-group-list';
  list.setAttribute('role', 'list');
  list.append(...group.results.map(resultItem), ...group.children.map(groupItem));
  li.append(head, list);
  return li;
}

function clearResults(){
  summary.textContent = '';
  list.replaceChildren();
  clearHighlight();
}

// Whether the browser draws highlights.
const canHighlight = () => typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight === 'function' && typeof StaticRange === 'function';

function clearHighlight(){
  if (canHighlight()) CSS.highlights.delete(HIGHLIGHT);
}

// Highlights every hit of the places found, in place of what was highlighted.
// found: [{ place, at }], at the hits of the place's text. A failure here
// takes the highlight away and leaves the results listed.
function drawHighlight(found){
  if (!canHighlight()) return;
  try {
    const highlight = new Highlight();
    for (const { place, at } of found){
      for (const hit of at){
        for (const r of nodeRanges(place.map, hit)){
          highlight.add(new StaticRange({ startContainer: r.startNode, startOffset: r.startOffset, endContainer: r.endNode, endOffset: r.endOffset }));
        }
      }
    }
    if (highlight.size) CSS.highlights.set(HIGHLIGHT, highlight);
    else CSS.highlights.delete(HIGHLIGHT);
  } catch (err){
    console.error('Markieren der Treffer fehlgeschlagen:', err);
    clearHighlight();
  }
}

// The places of the root, read once and kept while the root does not change:
// a MutationObserver on the root drops them on any change of its nodes or its
// text, a render, a diagram drawn late, the decoder of `schlank` unpacking,
// and the records it holds and has not delivered yet count as such a change.
// A change of an attribute does not: a filter hides a row by a class or by
// CSS, and whether a row is hidden is read when the search runs. The search
// thus knows nothing of the render. Without MutationObserver every search
// reads the root. Records of attributes are passed over, should an
// implementation deliver them unasked (linkedom does).
const changed = records => records.some(r => r.type !== 'attributes');
function placesOf(root){
  if (root !== observed){
    if (observer) observer.disconnect();
    observed = root;
    places = null;
    observer = typeof MutationObserver === 'function' ? new MutationObserver(records => { if (changed(records)) places = null; }) : null;
    if (observer) observer.observe(root, { childList: true, subtree: true, characterData: true });
  }
  if (!observer || changed(observer.takeRecords())) places = null;
  return places || (places = collectPlaces(root));
}

// Runs the search for what the field holds, over the root as it is now; over
// a root the decoder of `schlank` still unpacks, once it is done.
function search(){
  clearTimeout(timer);
  timer = 0;
  const root = rootOf();
  const term = input.value;
  if (root && root.hasAttribute(UNPACKING_ATTR)){
    list.replaceChildren();
    clearHighlight();
    summary.textContent = term.trim() ? UNPACKING : '';
    return;
  }
  const options = matchOptions();
  try {
    const found = [];
    let hits = 0;
    const short = !!term.trim() && tooShort(term, options);
    if (term.trim() && !short){
      for (const place of root ? placesOf(root) : []){
        const at = findHits(term, place.text, options);
        if (!at.length) continue;
        found.push({ el: place.el, hits: at.length, place, at });
        hits += at.length;
      }
    }
    const { groups, sections } = found.length ? groupResults(root, found) : { groups: [], sections: 0 };
    list.replaceChildren(...groups.map(groupItem));
    summary.textContent = summaryText(term, hits, found.length, sections, short);
    drawHighlight(found);
  } catch (err){
    console.error('Suche fehlgeschlagen:', err);
    clearHighlight();
    list.replaceChildren();
    summary.textContent = 'Die Suche ist fehlgeschlagen.';
  }
}

// A switch of the panel: a checkbox in its label, off, that searches again
// when it is flipped.
function makeSwitch(parent, text){
  const label = document.createElement('label');
  label.className = 'search-switch';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.addEventListener('change', search);
  label.append(box, text);
  parent.append(label);
  return box;
}

function buildPanel(){
  panel = document.createElement('div');
  panel.className = PANEL_CLASS;
  panel.setAttribute('role', 'search');
  panel.setAttribute('aria-label', 'Suche im Dokument');
  panel.setAttribute(TRANSIENT_ATTR, '');
  panel.hidden = true;

  input = document.createElement('input');
  input.type = 'search';
  input.className = 'search-input';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, PAUSE);
  });
  // Enter follows the first result, Down puts the focus on it, each after a
  // search that still waits for the pause. See the README, "Keys and events".
  input.addEventListener('keydown', e => {
    if ((e.key !== 'Enter' && e.key !== 'ArrowDown') || e.isComposing) return;
    if (timer) search();
    const first = list.querySelector('.search-result');
    if (!first) return;
    e.preventDefault();
    if (e.key === 'Enter') first.click();
    else first.focus();
  });

  const label = document.createElement('label');
  label.className = 'search-label';
  const title = document.createElement('span');
  title.className = 'search-label-text';
  title.textContent = 'Im Dokument suchen';
  label.append(title, input);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'search-close';
  close.setAttribute('aria-label', 'Suche schließen');
  close.textContent = '×';
  close.addEventListener('click', closeSearch);

  const switches = document.createElement('div');
  switches.className = 'search-switches';
  caseBox = makeSwitch(switches, 'Groß- und Kleinschreibung beachten');
  fuzzyBox = makeSwitch(switches, 'Leerzeichen, Bindestriche und Punkte ignorieren');

  summary = document.createElement('p');
  summary.className = 'search-summary';
  summary.setAttribute('role', 'status');

  list = document.createElement('ol');
  list.className = 'search-results';
  list.setAttribute('role', 'list');
  // Down and Up on a result: the next, the previous one, from the first back
  // to the field.
  list.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const results = Array.from(list.querySelectorAll('.search-result'));
    const at = results.indexOf(e.target);
    if (at < 0) return;
    e.preventDefault();
    const to = e.key === 'ArrowDown' ? results[at + 1] : results[at - 1] || input;
    if (to) to.focus();
  });

  panel.append(label, close, switches, summary, list);
  document.body.appendChild(panel);
}

// The magnifier: a button in <body>, transient, that opens the panel.
function buildMagnifier(){
  const button = document.createElement('button');
  button.type = 'button';
  button.className = MAGNIFIER_CLASS;
  button.setAttribute('aria-label', 'Suchen');
  button.setAttribute('aria-keyshortcuts', '/');
  button.title = 'Suchen (/)';
  button.setAttribute(TRANSIENT_ATTR, '');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', MAGNIFIER_PATH);
  svg.append(path);
  button.append(svg);
  button.addEventListener('click', openSearch);
  document.body.appendChild(button);
  magnifier = button;
}

// Opens the panel, empty, and puts the focus into its field; an open panel
// keeps its term and only gets the focus. It remembers what had the focus.
export function openSearch(){
  if (!isSearchOpen()){
    const at = document.activeElement;
    opener = at && at !== document.body && !panel.contains(at) ? at : null;
    input.value = '';
    clearResults();
    panel.hidden = false;
  }
  input.focus();
}

// Closes the panel and forgets its term and results; the switches keep
// their state. A closed panel stays as it is. Where the focus was in the
// panel, it goes back to what had it when the panel opened, where that is
// still in the page, else to the magnifier; never to a result, nor into the
// document, which the search does not change.
export function closeSearch(){
  if (!isSearchOpen()) return;
  clearTimeout(timer);
  timer = 0;
  const hadFocus = panel.contains(document.activeElement);
  panel.hidden = true;
  input.value = '';
  clearResults();
  if (hadFocus) (opener && opener.isConnected ? opener : magnifier).focus();
  opener = null;
}

// Where a "/" is text: a field, a list of choices, anything editable; not a
// checkbox or a radio button, which take no text.
const typesText = el => !!el && el.nodeType === 1 &&
  (!!el.closest('input:not([type="checkbox"], [type="radio"]), textarea, select') || el.isContentEditable);

// Makes the panel and listens for "/". options:
//   root        the element searched, or a function that returns it
//   inReadMode  a function: whether "/" may open the panel now
export function registerSearch({ root, inReadMode: readMode }){
  rootOf = typeof root === 'function' ? root : () => root;
  inReadMode = readMode;
  buildPanel();
  buildMagnifier();
  // A change of a table filter in the root searches again while the panel is
  // open and holds a term, after the filter's own listeners, which sit on the
  // field and the facet group. See the README, "Keys and events".
  const FILTER_CONTROL_SEL = '.' + FILTER_INPUT_CLASS + ', .' + FACET_BAR_CLASS + ' input';
  const onFilter = e => {
    if (!isSearchOpen() || !input.value.trim()) return;
    const el = e.target;
    const root = rootOf();
    if (!el || el.nodeType !== 1 || !el.matches(FILTER_CONTROL_SEL) || !root || !root.contains(el)) return;
    clearTimeout(timer);
    timer = setTimeout(search, PAUSE);
  };
  document.addEventListener('input', onFilter);
  document.addEventListener('change', onFilter);
  // A search that waits for the decoder runs when it is done.
  document.addEventListener(UNPACKED_EVENT, () => {
    if (isSearchOpen() && input.value) search();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.defaultPrevented) return;
    if (typesText(e.target)) return;
    // Over an open large view, in either mode, it opens nothing, and the
    // browser's own use of "/" (Firefox's quick find) is held back too.
    if (largeViewOpen(document)){ e.preventDefault(); return; }
    if (!inReadMode()) return;
    e.preventDefault();
    openSearch();
  });
  // Escape closes an open panel and nothing else. It listens in the capture
  // phase of the document, before every other listener of Escape (a table
  // filter's field, the download menu, leaving read mode in editor.js), and
  // stops the event there: one Escape, one thing closed. Only the large view
  // of a diagram comes before it, on window (large-view.js). See the README,
  // "Keys and events".
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.isComposing || !isSearchOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    closeSearch();
  }, true);
}
