import { findHits, excerpt, tooShort } from './search-match.js';
import { collectPlaces, groupResults, nodeRanges } from './search-places.js';
import { TRANSIENT_ATTR } from './transient.js';
import { DIAGRAM_SVG_CLASS } from './diagrams.js';
import { largeViewOpen } from './large-view.js';

// --- Search: the panel ---------------------------------------------------------
// In read mode the key "/" opens a search panel on the right of the window. It
// lists one result per place of the document that holds the term, in the
// order of the document, each with a part of its text and the term marked in
// it, under a line that says how many hits there are at how many places in how
// many sections. The results stand grouped under the headings H2 to H4 the
// rail lists (groupResults() in search-places.js), each group heading with the
// hits and places of its branch; a group heading is text, not a button, and
// stays at the top of the list while its results scroll under it. A click on
// a result scrolls the document to its place; the panel stays open.
//
//   <div class="search-panel" role="search" aria-label="Suche im Dokument" data-dokufix-transient hidden>
//   <div class="search-head">
//   <label class="search-label" for="search-input">Im Dokument suchen</label>
//   <button type="button" class="search-close" aria-label="Suche schließen">×</button>
//   </div>
//   <input type="search" id="search-input" class="search-input" autocomplete="off" spellcheck="false">
//   <div class="search-switches">
//   <label class="search-switch"><input type="checkbox">Groß- und Kleinschreibung beachten</label>
//   <label class="search-switch"><input type="checkbox">Leerzeichen, Bindestriche und Punkte ignorieren</label>
//   </div>
//   <p class="search-summary" role="status">3 Treffer an 2 Stellen in 2 Abschnitten</p>
//   <ol class="search-results">
//   <li class="search-group search-group-h2">
//   <div class="search-group-head"><span class="search-group-title">Eine Tabelle</span><span class="search-group-count">2 Treffer an 1 Stelle</span></div>
//   <ol class="search-group-list">
//   <li><button type="button" class="search-result">… eine <mark>Tabelle</mark> mit …</button></li>
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
// neither the panel nor a term typed into it. Nothing of it touches the
// root's DOM: the places and their text are read (search-places.js), the
// hits found in that text (search-match.js), and the results are made with
// createElement and textContent, so the document's text stays text. Its
// styles are src/search.css.
//
// "/" opens the panel in read mode only, without Ctrl, Alt or Meta, and not
// while the focus is in a field, where it is typed, nor while the large view
// of a diagram is open (large-view.js), which lies over the panel. It puts
// the focus into the panel's field. The close button closes it, and so does Escape, which then
// does nothing else (registerSearch()). A closed panel forgets its term;
// opened again, it reads the root afresh. The search runs on typing, after a
// short pause, outside the render, so a failure in it breaks no render.
//
// A diagram of a `schlank` file is packed (data-gz) until the file's decoder
// has unpacked it, and the decoder announces its end with UNPACKED_EVENT on
// the document, whether every diagram came out or not. A search over a root
// that still holds a packed diagram waits for that event, then runs. A root
// without one, the preview and every other file, never waits.
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
// What the decoder of a `schlank` file dispatches on the document when it has
// gone through every packed diagram (src/app/downloads/readonly-slim.js).
export const UNPACKED_EVENT = 'dokufix-diagrams-unpacked';
// What the decoder fills: the SVG container of a diagram's figure, packed. An
// attribute of that name an author writes elsewhere is no diagram to wait for.
const PACKED_SEL = '.' + DIAGRAM_SVG_CLASS + '[data-gz]';
// How long typing pauses before the search runs, in milliseconds.
const PAUSE = 150;
// How many characters of a place's text a result shows at most.
const EXCERPT_MAX = 160;
// The name of the highlight of the hits in the document (src/search.css).
export const HIGHLIGHT = 'search-hit';

let panel = null;
let input = null;
let summary = null;
let list = null;
let caseBox = null;
let fuzzyBox = null;
let timer = 0;
// From the caller: the element searched, and whether "/" may open the panel.
let rootOf = () => null;
let inReadMode = () => false;
// Whether the decoder has announced its end.
let unpacked = false;

export const isSearchOpen = () => !!panel && !panel.hidden;

// What the line above the results says when the term is too short.
const TOO_SHORT = 'Zu kurz: mindestens drei Buchstaben oder Ziffern';

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

// A result: a button with the part of its place's text, which scrolls the
// document to the place.
function resultItem({ place, at }){
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'search-result';
  button.append(previewOf(place.text, at));
  button.addEventListener('click', () => {
    // The root was rendered anew since: search it again.
    if (!place.el.isConnected){ search(); return; }
    place.el.scrollIntoView({ block: 'center' });
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

// Runs the search for what the field holds, over the root as it is now; over
// a root with a packed diagram once the decoder is done.
function search(){
  clearTimeout(timer);
  timer = 0;
  const root = rootOf();
  if (!unpacked && root && root.querySelector(PACKED_SEL)) return;
  const term = input.value;
  const options = matchOptions();
  try {
    const found = [];
    let hits = 0;
    const short = !!term.trim() && tooShort(term, options);
    if (term.trim() && !short){
      for (const place of root ? collectPlaces(root) : []){
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

  const head = document.createElement('div');
  head.className = 'search-head';
  const label = document.createElement('label');
  label.className = 'search-label';
  label.htmlFor = 'search-input';
  label.textContent = 'Im Dokument suchen';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'search-close';
  close.setAttribute('aria-label', 'Suche schließen');
  close.textContent = '×';
  close.addEventListener('click', closeSearch);
  head.append(label, close);

  input = document.createElement('input');
  input.type = 'search';
  input.id = 'search-input';
  input.className = 'search-input';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, PAUSE);
  });

  const switches = document.createElement('div');
  switches.className = 'search-switches';
  caseBox = makeSwitch(switches, 'Groß- und Kleinschreibung beachten');
  fuzzyBox = makeSwitch(switches, 'Leerzeichen, Bindestriche und Punkte ignorieren');

  summary = document.createElement('p');
  summary.className = 'search-summary';
  summary.setAttribute('role', 'status');

  list = document.createElement('ol');
  list.className = 'search-results';

  panel.append(head, input, switches, summary, list);
  document.body.appendChild(panel);
}

// Opens the panel, empty, and puts the focus into its field; an open panel
// keeps its term and only gets the focus.
export function openSearch(){
  if (!isSearchOpen()){
    input.value = '';
    clearResults();
    panel.hidden = false;
  }
  input.focus();
}

// Closes the panel and forgets its term and results; the switches keep
// their state. A closed panel stays as it is.
export function closeSearch(){
  if (!isSearchOpen()) return;
  clearTimeout(timer);
  timer = 0;
  const hadFocus = panel.contains(document.activeElement);
  panel.hidden = true;
  input.value = '';
  clearResults();
  if (hadFocus) document.activeElement.blur();
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
  // A search that waits for a packed diagram runs when the decoder is done.
  document.addEventListener(UNPACKED_EVENT, () => {
    unpacked = true;
    if (isSearchOpen() && input.value) search();
  }, { once: true });
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
