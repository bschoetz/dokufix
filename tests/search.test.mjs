// The search of the reading view, run in Node: no browser, no page.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/search-match.js and src/app/search-places.js are modules of pure
// logic, so this file imports them as they are: the match over strings, the
// places over a fragment that linkedom parses. The markup is what marked
// 18.0.14 and marked-footnote 1.4.0 emit, after the passes that change it
// (footnote previews, status chips, the inline table of contents), as in
// tests/filter.test.mjs.
//
// The cases are the rows of the story's matrix that need no layout: the hit
// ranges, a text whose length changes when it is lowered, the part a result
// shows, and which places there are with which text. That "/" opens the
// panel, the summary and the marks in a browser, a click that scrolls and a
// saved file without the panel are for the browser runs (tests/vergleich.mjs,
// tests/speichern.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { findHits, excerpt } from '../src/app/search-match.js';
import { collectPlaces } from '../src/app/search-places.js';
import { buildChips } from '../src/app/chips.js';
import { buildSteps } from '../src/app/steps.js';
import { TRANSIENT_ATTR } from '../src/app/transient.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(here, '../src', name), 'utf8');

// A root like the preview, holding the given markup.
function rootWith(html){
  const { document } = parseHTML('<!DOCTYPE html><html><body><article id="root" class="dokufix-doc">' + html + '</article></body></html>');
  return document.getElementById('root');
}
// The places of a fragment: tag and text of each.
const places = html => collectPlaces(rootWith(html)).map(p => [p.el.tagName.toLowerCase(), p.text]);
// What a range covers.
const covered = (text, hits) => hits.map(h => text.slice(h.start, h.end));

// ---------- the match ----------
test('findHits: every occurrence, in order, as ranges of the text', () => {
  const text = 'Eine Tabelle, noch eine Tabelle.';
  assert.deepEqual(findHits('Tabelle', text), [{ start: 5, end: 12 }, { start: 24, end: 31 }]);
});

test('findHits: case is ignored, in the term and in the text', () => {
  const text = 'TABELLE und tabelle und Tabelle';
  for (const term of ['tabelle', 'Tabelle', 'TABELLE', 'tAbElLe']){
    assert.deepEqual(covered(text, findHits(term, text)), ['TABELLE', 'tabelle', 'Tabelle'], term);
  }
});

test('findHits: hits do not overlap', () => {
  assert.deepEqual(findHits('aa', 'aaaaa'), [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
});

test('findHits: an empty term, or one of blanks, finds nothing; so does a term that does not occur', () => {
  assert.deepEqual(findHits('', 'Tabelle'), []);
  assert.deepEqual(findHits('   ', 'Tabelle'), []);
  assert.deepEqual(findHits('xyzzy', 'Tabelle'), []);
  assert.deepEqual(findHits('Tabelle', ''), []);
});

test('findHits: blanks in the term collapse, and none count at its ends', () => {
  const text = 'eine Tabelle hier';
  assert.deepEqual(covered(text, findHits('  eine   Tabelle ', text)), ['eine Tabelle']);
});

test('findHits: where lowering changes the length, ranges are still ranges of the original text', () => {
  // "İ" lowers to "i̇", two units: every hit behind it would be one off.
  const text = 'İstanbul, Tabelle, İSTANBUL';
  assert.equal('İ'.toLocaleLowerCase('de').length, 2);
  assert.deepEqual(findHits('tabelle', text), [{ start: 10, end: 17 }]);
  assert.deepEqual(covered(text, findHits('İstanbul', text)), ['İstanbul', 'İSTANBUL']);
  // A term that matches part of what one character lowered to covers the whole character.
  assert.deepEqual(covered('İx', findHits('i', 'İx')), ['İ']);
  // The capital sharp s, and characters outside the BMP before the term.
  assert.deepEqual(covered('STRAẞE', findHits('straße', 'STRAẞE')), ['STRAẞE']);
  const emoji = '🚧 Baustelle 🚧 BAUSTELLE';
  assert.deepEqual(covered(emoji, findHits('baustelle', emoji)), ['Baustelle', 'BAUSTELLE']);
});

// ---------- the part a result shows ----------
test('excerpt: a short text is shown whole, with all its hits', () => {
  const text = 'Eine Tabelle, noch eine Tabelle.';
  const part = excerpt(text, findHits('tabelle', text), 160);
  assert.deepEqual(part, { text, hits: [{ start: 5, end: 12 }, { start: 24, end: 31 }], cutStart: false, cutEnd: false });
});

test('excerpt: a long text is cut around the first hit, at blanks, with the hits inside as ranges of the part', () => {
  const words = Array.from({ length: 80 }, (_, i) => 'wort' + i);
  words[40] = 'Tabelle';
  words[44] = 'TABELLE';
  words[75] = 'tabelle';
  const text = words.join(' ');
  const hits = findHits('tabelle', text);
  assert.equal(hits.length, 3);
  const part = excerpt(text, hits, 100);
  assert.ok(part.text.length <= 100, part.text.length);
  assert.ok(part.cutStart && part.cutEnd);
  assert.ok(text.includes(part.text));
  assert.ok(!part.text.startsWith(' ') && !part.text.endsWith(' '));
  // Every part starts and ends with a whole word.
  assert.match(part.text, /^wort\d+ /);
  assert.match(part.text, / wort\d+$/);
  // The first two hits are in it, the third is not.
  assert.deepEqual(covered(part.text, part.hits), ['Tabelle', 'TABELLE']);
  // Context before the first hit.
  assert.ok(part.hits[0].start >= 15, part.hits[0].start);
});

test('excerpt: a hit at the start of a long text, and one near its end', () => {
  const text = 'Tabelle ' + 'x '.repeat(200) + 'Ende Tabelle';
  const atStart = excerpt(text, [findHits('tabelle', text)[0]], 50);
  assert.equal(atStart.cutStart, false);
  assert.deepEqual(covered(atStart.text, atStart.hits), ['Tabelle']);
  const last = findHits('tabelle', text)[1];
  const atEnd = excerpt(text, [last], 50);
  assert.equal(atEnd.cutEnd, false);
  assert.deepEqual(covered(atEnd.text, atEnd.hits), ['Tabelle']);
});

// ---------- the places ----------
test('collectPlaces: paragraphs, list items and headings, in the order of the document', () => {
  assert.deepEqual(places('<h1>Titel</h1>\n<p>Absatz</p>\n<ul>\n<li>Punkt</li>\n</ul>\n<h2>Zwei</h2>\n<ol>\n<li>Erst</li>\n</ol>\n<h6>Sechs</h6>\n<blockquote>\n<p>Zitat</p>\n</blockquote>\n'),
    [['h1', 'Titel'], ['p', 'Absatz'], ['li', 'Punkt'], ['h2', 'Zwei'], ['li', 'Erst'], ['h6', 'Sechs'], ['p', 'Zitat']]);
});

test('collectPlaces: white space collapsed, a line break as a blank, a place without text is none', () => {
  assert.deepEqual(places('<p>  Erste\n  Zeile<br>zweite   Zeile </p>\n<p></p>\n<p><img src="x.png" alt="Bild"></p>\n<p> </p>'),
    [['p', 'Erste Zeile zweite Zeile']]);
});

test('collectPlaces: a footnote marker and its preview are no text of the paragraph; the definition is a place of its own', () => {
  const html = '<p>Die Frist<sup class="dokufix-fn-host"><a href="#footnote-back-a" data-footnote-ref="" aria-describedby="footnote-label">1</a>' +
    '<span class="dokufix-fn-preview" aria-hidden="true">Laut Tabelle drei.</span></sup> läuft.</p>\n' +
    '<section class="footnotes" data-footnotes="">\n<h2 id="footnote-label" class="sr-only">Fußnoten</h2>\n<ol>\n' +
    '<li id="footnote-a">\n<p>Laut Tabelle drei. <a href="#footnote-ref-a" data-footnote-backref="" aria-label="Back to reference 1" id="footnote-back-a">↩</a></p>\n</li>\n' +
    '</ol>\n</section>\n';
  // The heading of the list of footnotes is hidden by the document styles: no place.
  assert.deepEqual(places(html), [['p', 'Die Frist läuft.'], ['p', 'Laut Tabelle drei.']]);
  const root = rootWith(html);
  const hits = collectPlaces(root).filter(p => findHits('Tabelle', p.text).length);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].el.closest('section').className, 'footnotes');
});

test('collectPlaces: a heading listed in the inline table of contents is a place once, as the heading', () => {
  const html = '<nav class="dokufix-toc" aria-label="Inhaltsverzeichnis"><ol><li><a href="#tabelle">Tabelle</a><ol><li><a href="#mehr">Mehr</a></li></ol></li></ol></nav>\n' +
    '<h2 id="tabelle">Tabelle</h2>\n<h3 id="mehr">Mehr</h3>\n';
  assert.deepEqual(places(html), [['h2', 'Tabelle'], ['h3', 'Mehr']]);
});

test('collectPlaces: in a loose list the paragraph is the place, and the item adds none', () => {
  assert.deepEqual(places('<ul>\n<li><p>Eins</p>\n</li>\n<li><p>Zwei</p>\n<p>Noch zwei</p>\n</li>\n</ul>\n'),
    [['p', 'Eins'], ['p', 'Zwei'], ['p', 'Noch zwei']]);
});

test('collectPlaces: an item with a nested list is read without it, and each nested item is a place', () => {
  assert.deepEqual(places('<ul>\n<li>Außen<ul>\n<li>Innen eins</li>\n<li>Innen zwei<ol>\n<li>Tief</li>\n</ol>\n</li>\n</ul>\n</li>\n<li>Danach</li>\n</ul>\n'),
    [['li', 'Außen'], ['li', 'Innen eins'], ['li', 'Innen zwei'], ['li', 'Tief'], ['li', 'Danach']]);
});

test('collectPlaces: warnings, facet bars, tables with their cells, code blocks, diagrams with their credit, the metadata panel and transient elements are no places', () => {
  const html =
    '<div class="dokufix-warning" role="note"><p class="dokufix-warning-title"><strong>Warnung:</strong> Tabelle kaputt.</p><pre class="dokufix-warning-detail">Tabelle</pre></div>\n' +
    '<div class="dokufix-facets"><fieldset class="dokufix-facet-bar"><legend>Tabelle</legend><div class="dokufix-facet-controls"><label><input type="radio">Tabelle</label></div></fieldset>' +
    '<div class="dokufix-table"><table><thead><tr><th>Tabelle</th></tr></thead><tbody><tr><td><p>Tabelle</p><ul><li>Tabelle</li></ul></td></tr></tbody></table></div></div>\n' +
    '<pre><code>Tabelle</code></pre>\n' +
    '<div class="mermaid"><svg><foreignObject><div><p>Tabelle</p></div></foreignObject></svg></div>\n' +
    '<figure class="dokufix-diagram dokufix-diagram-bpmn" aria-label="Tabelle"><div class="dokufix-diagram-svg"><svg><text>Tabelle</text></svg></div>' +
    '<figcaption class="dokufix-diagram-credit"><p>Gezeichnet mit Tabelle</p></figcaption></figure>\n' +
    '<details class="dokufix-frontmatter"><summary><span class="dokufix-fm-label">Metadaten</span></summary><div class="dokufix-fm-body"><dl class="dokufix-fm-rows"><dt>titel</dt><dd><ul class="dokufix-fm-list"><li>Tabelle</li></ul></dd></dl></div></details>\n' +
    '<div class="dokufix-meta"><p>Tabelle</p></div>\n' +
    '<div class="dokufix-filter" ' + TRANSIENT_ATTR + '><p>Tabelle</p></div>\n' +
    '<p>Die eine Tabelle.</p>\n';
  assert.deepEqual(places(html), [['p', 'Die eine Tabelle.']]);
});

test('collectPlaces: the word a status chip carries for assistive technology is no text, in a paragraph and in a heading', () => {
  const root = rootWith('<h2>Bestellung:<code>🟢 Live</code></h2>\n<p>Status <code>🔴 Aus</code> seit gestern.</p>\n<ul>\n<li><code>🟡 Prüfung</code> läuft</li>\n</ul>\n');
  buildChips(root);
  assert.deepEqual(collectPlaces(root).map(p => p.text), ['Bestellung: Live', 'Status Aus seit gestern.', 'Prüfung läuft']);
});

test('collectPlaces: a heading without its footnote marker, its preview or a line break run together', () => {
  assert.deepEqual(places('<h2>Frist<sup class="dokufix-fn-host"><a href="#footnote-back-q" data-footnote-ref="">1</a>' +
    '<span class="dokufix-fn-preview" aria-hidden="true">Die ganze Fußnote.</span></sup> und<br>Ende</h2>'),
  [['h2', 'Frist und Ende']]);
});

test('collectPlaces: the number tile of a step is no text; a loose step item adds no place of its number', () => {
  const root = rootWith('<ol>\n<li><em>Autorin:</em> Den Text schreiben.</li>\n<li>Prüfen.</li>\n</ol>\n<ol start="3">\n<li><p><em>Website:</em> Den Text zeigen.</p>\n</li>\n<li><p>Fertig.</p>\n</li>\n</ol>\n');
  for (const list of Array.from(root.querySelectorAll('ol'))) buildSteps(list);
  assert.equal(root.querySelectorAll('.dokufix-step-number').length, 4);
  assert.deepEqual(collectPlaces(root).map(p => [p.el.tagName.toLowerCase(), p.text]),
    [['li', 'Autorin Den Text schreiben.'], ['li', 'Prüfen.'], ['p', 'Website Den Text zeigen.'], ['p', 'Fertig.']]);
});

test('collectPlaces: a callout\'s label and paragraphs are places', () => {
  assert.deepEqual(places('<div class="dokufix-callout dokufix-callout-note" role="note"><p class="dokufix-callout-label">Hinweis</p>\n<p>Eine Tabelle.</p>\n</div>'),
    [['p', 'Hinweis'], ['p', 'Eine Tabelle.']]);
});

test('collectPlaces changes nothing in the document', () => {
  const root = rootWith('<h2>Bestellung <code>x</code><br>zwei</h2>\n<p>Text<sup class="dokufix-fn-host"><a data-footnote-ref="" href="#a">1</a><span class="dokufix-fn-preview">P</span></sup></p>\n<ul>\n<li>A<ul>\n<li>B</li>\n</ul>\n</li>\n</ul>\n');
  const before = root.outerHTML;
  collectPlaces(root);
  assert.equal(root.outerHTML, before);
});

test('a search over the places: one result per place that holds the term, every hit counted', () => {
  const root = rootWith('<h2>Tabellen</h2>\n<p>Eine Tabelle und noch eine tabelle.</p>\n<p>Keine hier.</p>\n<ul>\n<li>TABELLE</li>\n</ul>\n<table><tbody><tr><td>Tabelle</td></tr></tbody></table>\n');
  const found = collectPlaces(root).map(p => ({ tag: p.el.tagName, hits: findHits('tabelle', p.text).length })).filter(r => r.hits);
  assert.deepEqual(found, [{ tag: 'H2', hits: 1 }, { tag: 'P', hits: 2 }, { tag: 'LI', hits: 1 }]);
});

// ---------- the sources ----------
test('the panel makes its elements with createElement and textContent: no innerHTML, no insertAdjacentHTML in the search', () => {
  for (const name of ['app/search.js', 'app/search-match.js', 'app/search-places.js']){
    assert.doesNotMatch(read(name), /innerHTML|outerHTML|insertAdjacentHTML/, name);
  }
});

test('the match and the places are pure: neither imports the page\'s elements', () => {
  for (const name of ['app/search-match.js', 'app/search-places.js']){
    assert.doesNotMatch(read(name), /from '\.\/(dom|rail|persistence|editor)\.js'|\bdocument\.[a-zA-Z]|\bwindow\.[a-zA-Z]/, name);
  }
});

test('the panel is transient, and the script calls registerSearch() after registerLicences(); render.js knows nothing of the search', () => {
  assert.match(read('app/search.js'), /panel\.setAttribute\(TRANSIENT_ATTR, ''\)/);
  const app = read('app.js');
  assert.ok(app.indexOf('registerSearch();') > app.indexOf('registerLicences();') && app.indexOf('registerLicences();') > 0);
  assert.doesNotMatch(read('app/render.js'), /search(-match|-places)?\.js|collectPlaces|findHits|Search/);
});
