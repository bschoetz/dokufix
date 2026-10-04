// The search panel, src/app/search.js, run in Node: no browser, no page.
//
//   npm test          (node --test tests/*.test.mjs)
//
// search.js uses `document` and `window` only inside its functions, so each
// case parses a page with linkedom, sets it as the global document, and
// imports the module afresh (a query string on its URL): the module keeps the
// panel and its state, and registerSearch() runs once per page. What linkedom
// does not have, each page gets a stand-in for: CSS.highlights as a Map,
// Highlight as a Set, StaticRange as a plain object; the focus
// (document.activeElement, focus(), blur()); a box (getClientRects()), which
// an element has unless it stands in a closed <details> or the case says it
// has none; scrollIntoView(), window.scrollBy() and a Range, which record
// where they were asked to scroll. linkedom has no capture phase, so the
// order of the Escape listeners is the browser runs' (tests/vergleich.mjs).
//
// The cases are what the panel does with the places and hits that
// tests/search.test.mjs pins: the pause before a search, the summary, the
// groups, a row's kind and " (ausgeblendet)", the search again on a changed
// filter, the highlight, where a click scrolls. Where the panel stands, how
// it looks and the order of Escape are for the browser runs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { TRANSIENT_ATTR } from '../src/app/transient.js';
import { FILTER_CLASS, FILTER_INPUT_CLASS, FILTER_OUT_CLASS } from '../src/app/filter.js';
import { FACETS_CLASS, FACET_BAR_CLASS } from '../src/app/facets.js';
import { TABLE_CLASS } from '../src/app/tables.js';
import { DIAGRAM_CLASS, DIAGRAM_SVG_CLASS } from '../src/app/diagrams.js';

// Longer than the pause of the search, 150 ms.
const AFTER = 220;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let loads = 0;
// Whether a is the element b, said by tag and class: an element in an
// assertion's message would be printed whole, with its document.
const name = el => el ? el.tagName + (el.className ? '.' + String(el.className).split(' ').join('.') : '') : String(el);
const same = (a, b, what) => assert.ok(a === b, (what ? what + ': ' : '') + name(a) + ' is not ' + name(b));

// A page as an export has it, the content container holding content, with
// the search registered over it. options:
//   noBox       a function: whether an element has no box, beside those in a closed <details>
//   highlights  false: the browser has no CSS.highlights
//   rangeBox    the box of a Range, the first hit of a place
//   main        attributes of the content container, as markup
async function open(content, { noBox = () => false, highlights = true, rangeBox = { left: 0, right: 10, top: 600, bottom: 610, width: 10, height: 10 }, main = '' } = {}){
  const { document, window } = parseHTML('<!DOCTYPE html><html><head></head><body><main class="reader-body dokufix-doc"' + main + '>' + content + '</main></body></html>');
  const root = document.querySelector('main');
  const scrolls = [];
  let active = null;
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => (active && active.isConnected ? active : document.body) });
  const html = window.HTMLElement.prototype;
  html.focus = function(){ active = this; };
  html.blur = function(){ if (active === this) active = null; };
  html.scrollIntoView = function(options){ scrolls.push({ el: this, options }); };
  const closedAround = el => {
    for (let n = el; n.parentElement; n = n.parentElement){
      const d = n.parentElement;
      if (d.tagName === 'DETAILS' && !(d.open || d.hasAttribute('open')) && n.tagName !== 'SUMMARY') return true;
    }
    return false;
  };
  window.Element.prototype.getClientRects = function(){ return noBox(this) || closedAround(this) ? [] : [{ width: 1, height: 1 }]; };
  document.createRange = () => ({ setStart(){}, setEnd(){}, getBoundingClientRect: () => rangeBox });
  window.scrollBy = (x, y) => { scrolls.push({ by: y }); };
  window.innerHeight = 900;
  Object.assign(globalThis, {
    document, window, MutationObserver: window.MutationObserver,
    CSS: highlights ? { highlights: new Map() } : {},
    Highlight: class extends Set {},
    StaticRange: class { constructor(init){ Object.assign(this, init); } },
  });
  const search = await import('../src/app/search.js?load=' + (++loads));
  search.registerSearch({ root, inReadMode: () => true });
  const panel = document.querySelector('body > .search-panel');
  const input = panel.querySelector('.search-input');
  const magnifier = document.querySelector('body > .search-magnifier');
  // A key pressed with the focus on target, the body by default.
  const key = (k, target = document.activeElement) => {
    const e = new window.Event('keydown', { bubbles: true, cancelable: true });
    e.key = k;
    target.dispatchEvent(e);
    return e;
  };
  // A term typed into the field; resolves once the pause has passed.
  const type = async term => {
    input.value = term;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(AFTER);
  };
  const summary = () => panel.querySelector('.search-summary').textContent;
  const results = () => Array.from(panel.querySelectorAll('.search-results .search-result'));
  const texts = () => results().map(b => b.textContent);
  const heads = () => Array.from(panel.querySelectorAll('.search-group-head')).map(h => h.querySelector('.search-group-title').textContent + ' | ' + h.querySelector('.search-group-count').textContent);
  const lit = () => (CSS.highlights && CSS.highlights.get(search.HIGHLIGHT)) || null;
  return { document, window, root, search, panel, input, magnifier, scrolls, key, type, summary, results, texts, heads, lit };
}

const table = rows => '<div class="' + TABLE_CLASS + '"><table><tbody>' + rows.map(r => '<tr' + (r.cls ? ' class="' + r.cls + '"' : '') + '><td>' + r.text + '</td></tr>').join('') + '</tbody></table></div>';
const facetTable = rows => '<div class="' + FACETS_CLASS + '"><div class="' + FACET_BAR_CLASS + '"><input type="radio" name="f"></div>' + table(rows) + '</div>';
const filterField = '<div class="' + FILTER_CLASS + '" ' + TRANSIENT_ATTR + '><input type="search" class="' + FILTER_INPUT_CLASS + '"></div>';

// ---------- the panel ----------
test('the panel and the magnifier are made once, at load, in <body> outside the root, transient; the panel is closed', async () => {
  const p = await open('<p>Eine Tabelle.</p>');
  assert.equal(p.document.querySelectorAll('.search-panel').length, 1);
  assert.equal(p.document.querySelectorAll('.search-magnifier').length, 1);
  assert.ok(p.panel.hasAttribute(TRANSIENT_ATTR) && p.magnifier.hasAttribute(TRANSIENT_ATTR));
  assert.ok(!p.root.querySelector('.search-panel, .search-magnifier'));
  assert.ok(p.panel.hidden && !p.search.isSearchOpen());
  assert.equal(p.panel.getAttribute('role'), 'search');
  assert.equal(p.panel.querySelector('.search-summary').getAttribute('role'), 'status');
});

test('"/" opens the panel, empty, with the focus in its field; "×" closes it and forgets the term; the switches keep their state', async () => {
  const p = await open('<p>Eine Tabelle.</p>');
  const e = p.key('/', p.document.body);
  assert.ok(e.defaultPrevented && !p.panel.hidden);
  same(p.document.activeElement, p.input);
  await p.type('Tabelle');
  const fuzzy = p.panel.querySelectorAll('.search-switch input')[1];
  fuzzy.checked = true;
  p.panel.querySelector('.search-close').click();
  assert.ok(p.panel.hidden && p.input.value === '' && p.summary() === '' && p.results().length === 0);
  p.key('/', p.document.body);
  assert.ok(!p.panel.hidden && p.input.value === '' && fuzzy.checked);
  // "/" typed into a field is text.
  p.panel.querySelector('.search-close').click();
  const typed = p.key('/', p.input);
  assert.ok(!typed.defaultPrevented && p.panel.hidden);
});

test('typing searches after a pause of 150 ms, not before; the summary says how many hits at how many places in how many sections', async () => {
  const p = await open('<p>Eine Tabelle, noch eine Tabelle.</p><ul><li>Tabelle</li></ul><p>Nichts.</p>');
  p.search.openSearch();
  p.input.value = 'Tabelle';
  p.input.dispatchEvent(new p.window.Event('input', { bubbles: true }));
  await sleep(60);
  assert.equal(p.summary(), '', 'nothing before the pause');
  p.input.value = 'Tabell';
  p.input.dispatchEvent(new p.window.Event('input', { bubbles: true }));
  await sleep(110);
  assert.equal(p.summary(), '', 'a key restarts the pause');
  await sleep(AFTER);
  assert.equal(p.summary(), '3 Treffer an 2 Stellen in 1 Abschnitt');
  assert.deepEqual(p.texts(), ['Eine Tabelle, noch eine Tabelle.', 'Tabelle']);
  assert.deepEqual(p.results().map(b => Array.from(b.querySelectorAll('mark')).map(m => m.textContent)), [['Tabell', 'Tabell'], ['Tabell']]);
  await p.type('xyzzy');
  assert.equal(p.summary(), 'Keine Treffer');
  await p.type('Ta');
  assert.equal(p.summary(), 'Zu kurz: mindestens drei Buchstaben oder Ziffern');
  assert.equal(p.results().length, 0);
  await p.type('  ');
  assert.equal(p.summary(), '');
});

test('the results stand under their group headings, each with the numbers of its branch', async () => {
  const p = await open('<h1>Titel</h1><p>Eine Tabelle vorab.</p><h2>Eins</h2><p>Text.</p><h3>Zwei</h3><p>Tabelle und Tabelle.</p><h2>Drei</h2><p>Tabelle.</p>');
  p.search.openSearch();
  await p.type('Tabelle');
  assert.equal(p.summary(), '4 Treffer an 3 Stellen in 3 Abschnitten');
  assert.deepEqual(p.heads(), ['Titel | 1 Treffer an 1 Stelle', 'Eins | 2 Treffer an 1 Stelle', 'Zwei | 2 Treffer an 1 Stelle', 'Drei | 1 Treffer an 1 Stelle']);
  const groups = Array.from(p.panel.querySelectorAll('.search-results .search-group'));
  assert.deepEqual(groups.map(g => g.className), ['search-group search-group-h2', 'search-group search-group-h2', 'search-group search-group-h3', 'search-group search-group-h2']);
  assert.ok(groups[1].querySelector(':scope > .search-group-list > .search-group') === groups[2], 'the H3 group stands in the H2 group');
});

test('a row says its kind before its text, no text of the place; a row a filter hides says " (ausgeblendet)" after it, and a click on it goes to the filter controls', async () => {
  const hiddenByFacet = new Set();
  const p = await open(
    filterField + table([{ text: 'Zitronenfalter Nord' }, { text: 'Zitronenfalter Süd', cls: FILTER_OUT_CLASS }]) +
    facetTable([{ text: 'Zitronenfalter Ost' }, { text: 'Zitronenfalter West' }]) +
    '<details><summary>Mehr</summary>' + table([{ text: 'Zitronenfalter im Detail' }]) + '</details>',
    { noBox: el => hiddenByFacet.has(el) });
  hiddenByFacet.add(p.root.querySelectorAll('.' + FACETS_CLASS + ' tr')[1]);
  p.search.openSearch();
  await p.type('Zitronenfalter');
  assert.deepEqual(p.texts(), ['Tabelle: Zitronenfalter Nord', 'Tabelle: Zitronenfalter Süd (ausgeblendet)', 'Tabelle: Zitronenfalter Ost', 'Tabelle: Zitronenfalter West (ausgeblendet)', 'Tabelle: Zitronenfalter im Detail']);
  assert.deepEqual(p.results().map(b => (b.querySelector('.search-kind') || {}).textContent), Array(5).fill('Tabelle: '));
  assert.deepEqual(p.results().map(b => !!b.querySelector('.search-hidden')), [false, true, false, true, false]);
  // The kind is no text: "Tabelle" finds no row.
  await p.type('Tabelle');
  assert.equal(p.summary(), 'Keine Treffer');
  await p.type('Zitronenfalter');
  const at = i => { p.scrolls.length = 0; p.results()[i].click(); return p.scrolls[0]; };
  same(at(0).el, p.root.querySelectorAll('tr')[0], 'a shown row: the row');
  assert.deepEqual(at(0).options, { block: 'center' });
  same(at(1).el, p.root.querySelector('.' + FILTER_CLASS), 'hidden by the free-text filter: its field');
  same(at(3).el, p.root.querySelector('.' + FACET_BAR_CLASS), 'hidden by the facet filter: the facet buttons');
  // Whether a row is hidden is read again on the click.
  hiddenByFacet.clear();
  same(at(3).el, p.root.querySelectorAll('.' + FACETS_CLASS + ' tr')[1]);
});

test('a change of a table filter in the root searches again after the pause while the panel is open and holds a term', async () => {
  const p = await open(filterField + table([{ text: 'Zitronenfalter Nord' }, { text: 'Zitronenfalter Süd' }]));
  p.search.openSearch();
  await p.type('Zitronenfalter');
  assert.deepEqual(p.results().map(b => !!b.querySelector('.search-hidden')), [false, false]);
  p.root.querySelectorAll('tr')[1].classList.add(FILTER_OUT_CLASS);
  p.root.querySelector('.' + FILTER_INPUT_CLASS).dispatchEvent(new p.window.Event('input', { bubbles: true }));
  assert.deepEqual(p.results().map(b => !!b.querySelector('.search-hidden')), [false, false], 'not before the pause');
  await sleep(AFTER);
  assert.deepEqual(p.results().map(b => !!b.querySelector('.search-hidden')), [false, true]);
  // An input elsewhere is no filter.
  p.root.querySelectorAll('tr')[1].classList.remove(FILTER_OUT_CLASS);
  p.panel.querySelector('.search-switch input').dispatchEvent(new p.window.Event('input', { bubbles: true }));
  await sleep(AFTER);
  assert.deepEqual(p.results().map(b => !!b.querySelector('.search-hidden')), [false, true]);
});

test('every hit is highlighted, StaticRanges over the text nodes in CSS.highlights; a new search replaces it, closing takes it away; nothing in the root changes', async () => {
  const p = await open('<p>Eine <em>Tab</em>elle, noch eine Tabelle.</p><p>Tabelle.</p>');
  const before = p.root.outerHTML;
  p.search.openSearch();
  await p.type('Tabelle');
  const ranges = Array.from(p.lit());
  assert.equal(ranges.length, 3);
  assert.ok(ranges.every(r => p.root.contains(r.startContainer) && p.root.contains(r.endContainer)));
  assert.deepEqual([ranges[0].startContainer.data, ranges[0].startOffset, ranges[0].endContainer.data, ranges[0].endOffset], ['Tab', 0, 'elle, noch eine Tabelle.', 4]);
  await p.type('xyzzy');
  assert.equal(p.lit(), null);
  await p.type('Tabelle');
  p.panel.querySelector('.search-close').click();
  assert.equal(p.lit(), null);
  assert.equal(p.root.outerHTML, before);
});

test('without CSS.highlights the results are listed all the same', async () => {
  const p = await open('<p>Eine Tabelle.</p>', { highlights: false });
  p.search.openSearch();
  await p.type('Tabelle');
  assert.equal(p.summary(), '1 Treffer an 1 Stelle in 1 Abschnitt');
});

test('a click on a diagram\'s result scrolls the start of its figure; on the metadata panel\'s it opens the closed panel and brings the first hit to the middle of the window', async () => {
  const p = await open(
    '<details class="dokufix-frontmatter"><summary>Metadaten</summary><dl><dt>author</dt><dd>Beispiel-Autorin</dd></dl></details>' +
    '<figure class="' + DIAGRAM_CLASS + ' ' + DIAGRAM_CLASS + '-bpmn"><div class="' + DIAGRAM_SVG_CLASS + '"><svg><text>Abholbereit</text></svg></div></figure>' +
    '<pre><code>Abholbereit Beispiel-Autorin</code></pre>');
  p.search.openSearch();
  await p.type('Abholbereit');
  assert.deepEqual(p.texts(), ['BPMN-Diagramm: Abholbereit', 'Code: Abholbereit Beispiel-Autorin']);
  p.results()[0].click();
  assert.equal(p.scrolls.length, 1);
  same(p.scrolls[0].el, p.root.querySelector('figure'));
  assert.deepEqual(p.scrolls[0].options, { block: 'start' });
  await p.type('Beispiel-Autorin');
  const meta = p.root.querySelector('details');
  assert.ok(!meta.open);
  p.scrolls.length = 0;
  p.results()[0].click();
  assert.ok(meta.open, 'the panel is opened');
  // The hit at 600 to 610 px: the window scrolls by 605 - 450.
  assert.deepEqual(p.scrolls, [{ by: 155 }]);
});

test('a click on a code block\'s result whose hit has no box scrolls to the block itself', async () => {
  const p = await open('<pre><code>Abholbereit</code></pre>', { rangeBox: { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 } });
  p.search.openSearch();
  await p.type('Abholbereit');
  p.results()[0].click();
  assert.equal(p.scrolls.length, 1);
  same(p.scrolls[0].el, p.root.querySelector('pre'));
  assert.deepEqual(p.scrolls[0].options, { block: 'center' });
});

test('a click on a result whose place a render replaced since searches again', async () => {
  const p = await open('<p>Eine Tabelle.</p>');
  p.search.openSearch();
  await p.type('Tabelle');
  p.root.innerHTML = '<p>Zwei Tabellen.</p><p>Tabelle.</p>';
  p.results()[0].click();
  assert.equal(p.summary(), '2 Treffer an 2 Stellen in 1 Abschnitt');
  assert.equal(p.scrolls.length, 0);
});

// ---------- the field in its label (story 5.16, M3) ----------
test('the field stands in its label, which names it without an id: no element of the panel has an id, so a heading "Search Input" shares none with it', async () => {
  const p = await open('<h1 id="search-input">Search Input</h1>');
  const label = p.panel.querySelector('label.search-label');
  assert.ok(label && label.contains(p.input), 'the field in its label');
  assert.equal(label.textContent, 'Im Dokument suchen');
  assert.ok(!label.hasAttribute('for'));
  assert.deepEqual(Array.from(p.panel.querySelectorAll('[id]')).map(el => el.id), []);
  assert.deepEqual(Array.from(p.document.querySelectorAll('[id="search-input"]')).map(el => el.tagName), ['H1']);
});

// ---------- the focus after closing (story 5.16, M2) ----------
test('closing the panel with the focus in it puts the focus back on what had it when the panel opened, else on the magnifier, never on a result', async () => {
  const p = await open('<p>Eine Tabelle, <a href="#x">ein Verweis</a>.</p><p>Noch eine Tabelle.</p>');
  const link = p.root.querySelector('a');
  // Opened by the magnifier, which a click focused, closed by Escape: the magnifier.
  p.magnifier.focus();
  p.magnifier.click();
  same(p.document.activeElement, p.input);
  await p.type('Tabelle');
  p.key('Escape', p.input);
  assert.ok(p.panel.hidden);
  same(p.document.activeElement, p.magnifier);
  // Opened by a click on the magnifier that did not focus it (Safari), closed by "×": the magnifier.
  p.magnifier.blur();
  p.magnifier.click();
  p.panel.querySelector('.search-close').focus();
  p.panel.querySelector('.search-close').click();
  same(p.document.activeElement, p.magnifier);
  // Opened by "/" with the focus on the body, "×": the magnifier.
  p.magnifier.blur();
  p.key('/', p.document.body);
  p.panel.querySelector('.search-close').click();
  same(p.document.activeElement, p.magnifier);
  // Opened by "/" with the focus on a link of the document, closed from a result: the link.
  link.focus();
  p.key('/', link);
  await p.type('Tabelle');
  p.results()[1].focus();
  p.key('Escape', p.results()[1]);
  same(p.document.activeElement, link);
  // The link gone from the page by then: the magnifier.
  p.key('/', link);
  link.remove();
  p.key('Escape', p.input);
  same(p.document.activeElement, p.magnifier);
  // With the focus outside the panel, closing leaves it there.
  p.key('/', p.magnifier);
  const other = p.root.querySelector('p');
  other.focus();
  p.key('Escape', other);
  assert.ok(p.panel.hidden);
  same(p.document.activeElement, other);
});

// ---------- the wait for the decoder of `schlank` (story 5.16, M1) ----------
// The mark the decoder of a `schlank` file sets on the content container (src/app/downloads/readonly-slim.js).
const UNPACKING_ATTR = 'data-dokufix-unpacking';
const packed = '<figure class="' + DIAGRAM_CLASS + '"><div class="' + DIAGRAM_SVG_CLASS + '" data-gz="AAAA"></div></figure>';

test('a packed diagram in a root without the mark of a decoder, raw HTML in the editor say, is no reason to wait: the search runs', async () => {
  const p = await open(packed + '<p>Ein Zitronenfalter.</p>');
  p.search.openSearch();
  await p.type('Zitronenfalter');
  assert.equal(p.summary(), '1 Treffer an 1 Stelle in 1 Abschnitt');
});

test('while the root carries the mark of the decoder of `schlank`, the summary says "Diagramme werden entpackt …" and nothing is listed; the decoder takes the mark and sends its event, and the search runs', async () => {
  const p = await open(packed + '<p>Ein Zitronenfalter.</p>', { main: ' ' + UNPACKING_ATTR });
  p.search.openSearch();
  await p.type('Zitronenfalter');
  assert.equal(p.summary(), 'Diagramme werden entpackt …');
  assert.equal(p.results().length, 0);
  await p.type('');
  assert.equal(p.summary(), '', 'an empty field says nothing, unpacking or not');
  await p.type('Zitronenfalter');
  // The decoder: its diagram could not be unpacked, it takes the mark all the same and says it is done.
  p.root.removeAttribute(p.search.UNPACKING_ATTR);
  p.document.dispatchEvent(new p.window.Event(p.search.UNPACKED_EVENT));
  assert.equal(p.summary(), '1 Treffer an 1 Stelle in 1 Abschnitt');
  assert.equal(p.results().length, 1);
});
