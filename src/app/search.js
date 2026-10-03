import { previewEl } from './dom.js';
import { findHits, excerpt } from './search-match.js';
import { collectPlaces } from './search-places.js';
import { TRANSIENT_ATTR } from './transient.js';

// --- Search: the panel ---------------------------------------------------------
// In read mode the key "/" opens a search panel on the right of the window. It
// lists one result per place of the document that holds the term, in the
// order of the document, each with a part of its text and the term marked in
// it, under a line that says how many hits there are at how many places. A
// click on a result scrolls the document to its place; the panel stays open.
//
//   <div class="search-panel" role="search" aria-label="Suche im Dokument" data-dokufix-transient hidden>
//   <div class="search-head">
//   <label class="search-label" for="search-input">Im Dokument suchen</label>
//   <button type="button" class="search-close" aria-label="Suche schließen">×</button>
//   </div>
//   <input type="search" id="search-input" class="search-input" autocomplete="off" spellcheck="false">
//   <p class="search-summary" role="status">3 Treffer an 2 Stellen</p>
//   <ol class="search-results">
//   <li><button type="button" class="search-result">… eine <mark>Tabelle</mark> mit …</button></li>
//   </ol>
//   </div>
//
// The panel is frame, not document: it is made once, at load, in <body>
// outside the preview, and carries data-dokufix-transient, so a saved file has
// neither the panel nor a term typed into it. Nothing of it touches the
// preview's DOM: the places and their text are read (search-places.js), the
// hits found in that text (search-match.js), and the results are made with
// createElement and textContent, so the document's text stays text.
//
// "/" opens the panel in read mode only, without Ctrl, Alt or Meta, and not
// while the focus is in a field, where it is typed. It puts the focus into the
// panel's field. The close button closes it, and so does leaving read mode, in
// whatever way. A closed panel forgets its term; opened again, it reads the
// preview afresh. The search runs on typing, after a short pause, outside the
// render, so a failure in it breaks no render.

const PANEL_CLASS = 'search-panel';
// How long typing pauses before the search runs, in milliseconds.
const PAUSE = 150;
// How many characters of a place's text a result shows at most.
const EXCERPT_MAX = 160;

let panel = null;
let input = null;
let summary = null;
let list = null;
let timer = 0;

const inReadMode = () => document.body.classList.contains('mode-view');
const isOpen = () => !!panel && !panel.hidden;

// What the line above the results says: "" for no term.
function summaryText(term, hits, places){
  if (!term.trim()) return '';
  if (!places) return 'Keine Treffer';
  return hits + ' Treffer an ' + places + (places === 1 ? ' Stelle' : ' Stellen');
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

function clearResults(){
  summary.textContent = '';
  list.replaceChildren();
}

// Runs the search for what the field holds, over the preview as it is now.
function search(){
  clearTimeout(timer);
  timer = 0;
  const term = input.value;
  try {
    const found = [];
    let hits = 0;
    if (term.trim()){
      for (const place of collectPlaces(previewEl)){
        const at = findHits(term, place.text);
        if (!at.length) continue;
        found.push({ place, at });
        hits += at.length;
      }
    }
    const items = found.map(({ place, at }) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-result';
      button.append(previewOf(place.text, at));
      button.addEventListener('click', () => {
        // The preview was rendered anew since: search it again.
        if (!place.el.isConnected){ search(); return; }
        place.el.scrollIntoView({ block: 'center' });
      });
      li.append(button);
      return li;
    });
    list.replaceChildren(...items);
    summary.textContent = summaryText(term, hits, found.length);
  } catch (err){
    console.error('Suche fehlgeschlagen:', err);
    list.replaceChildren();
    summary.textContent = 'Die Suche ist fehlgeschlagen.';
  }
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

  summary = document.createElement('p');
  summary.className = 'search-summary';
  summary.setAttribute('role', 'status');

  list = document.createElement('ol');
  list.className = 'search-results';

  panel.append(head, input, summary, list);
  document.body.appendChild(panel);
}

// Opens the panel, empty, and puts the focus into its field; an open panel
// keeps its term and only gets the focus.
export function openSearch(){
  if (!isOpen()){
    input.value = '';
    clearResults();
    panel.hidden = false;
  }
  input.focus();
}

// Closes the panel and forgets its term and results.
export function closeSearch(){
  if (!panel) return;
  clearTimeout(timer);
  timer = 0;
  const hadFocus = panel.contains(document.activeElement);
  panel.hidden = true;
  input.value = '';
  clearResults();
  if (hadFocus) document.activeElement.blur();
}

// Where a "/" is text: a field, a list of choices, anything editable.
const typesText = el => !!el && el.nodeType === 1 &&
  (!!el.closest('input, textarea, select') || el.isContentEditable);

export function registerSearch(){
  buildPanel();
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.defaultPrevented) return;
    if (!inReadMode() || typesText(e.target)) return;
    e.preventDefault();
    openSearch();
  });
  // Leaving read mode, in whatever way, closes the panel.
  new MutationObserver(() => { if (!inReadMode() && isOpen()) closeSearch(); })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });
}
