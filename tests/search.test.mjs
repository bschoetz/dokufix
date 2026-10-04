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
// shows, and which places there are with which text; and, of story 2, case,
// light fuzzy and the minimum length; of story 4, the results grouped under
// the headings, with the numbers of each branch; of story 5, the map of a
// place's text onto the text nodes it came from and the node ranges of its
// hits, across nodes, without what the text leaves out, over collapsed white
// space; of story 6, table rows as places, their text that of the free-text
// filter, their hits one range per cell; of story 7, a diagram as one place,
// its text the labels of its SVG, its lines joined, nothing of its frame or
// source, no range of its hits; of story 8, the metadata panel and every code
// block as one place each, the panel's keys and values apart and without its
// summary, a diagram's source, a warning's detail and the footer of an export
// no code. What the panel does with them, src/app/search.js, is for
// tests/search-panel.test.mjs; where it stands, the group headings that stay
// at the top while the list scrolls, the highlight drawn, the order of Escape
// and a saved file without the panel are for the browser runs
// (tests/vergleich.mjs, tests/speichern.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { findHits, excerpt, tooShort } from '../src/app/search-match.js';
import { collectPlaces, groupResults, nodeRanges, FIRST_GROUP_LABEL, KIND_ROW, KIND_META, KIND_CODE } from '../src/app/search-places.js';
import { DIAGRAM_LANGUAGES } from '../src/app/diagram-kinds.js';
import { diagramFigure, DIAGRAM_CLOSE_TEXT, DIAGRAM_ZOOM_STEPS } from '../src/app/diagrams.js';
import { buildWarning } from '../src/app/warning.js';
import { splitFrontmatter, injectFrontmatterPanel } from '../src/app/frontmatter.js';
import { filterRowText } from '../src/app/filter.js';
import { headingLabelText } from '../src/app/toc.js';
import { buildChips } from '../src/app/chips.js';
import { buildSteps } from '../src/app/steps.js';
import { TRANSIENT_ATTR } from '../src/app/transient.js';

// What the search calls a diagram of each language (src/app/diagram-kinds.js).
const KIND_BPMN = DIAGRAM_LANGUAGES.bpmn.label;
const KIND_MERMAID = DIAGRAM_LANGUAGES.mermaid.label;

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

// ---------- the switches: case and light fuzzy (story 2) ----------
test('findHits, light fuzzy: a term without its hyphen finds the word with it, the hit over the whole word', () => {
  const text = 'ein Status-Chip.';
  assert.deepEqual(findHits('statuschip', text, { fuzzy: true }), [{ start: 4, end: 15 }]);
  assert.deepEqual(covered(text, findHits('statuschip', text, { fuzzy: true })), ['Status-Chip']);
  assert.equal(covered(text, findHits('statuschip', text, { fuzzy: true }))[0].length, 11);
});

test('findHits, fuzzy off: a term without the hyphen does not find the word with it', () => {
  assert.deepEqual(findHits('statuschip', 'Status-Chip'), []);
  assert.deepEqual(findHits('statuschip', 'Status-Chip', { fuzzy: false }), []);
});

test('findHits, light fuzzy: blanks, hyphens and dots in the term are ignored as well', () => {
  const text = 'ein Status-Chip.';
  for (const term of ['Status Chip', 'status.chip', 'Status-Chip', 'sta-tus. chip', ' status chip ']){
    assert.deepEqual(findHits(term, text, { fuzzy: true }), [{ start: 4, end: 15 }], term);
  }
});

test('findHits, light fuzzy: every character it ignores, between the matched ones and not before or after them', () => {
  // A blank, a no-break space, "-", U+2010, U+2011, the soft hyphen and a dot.
  for (const gap of [' ', '\u00A0', '-', '\u2010', '\u2011', '\u00AD', '.', ' - ', '..']){
    const text = 'x' + gap + 'Sta' + gap + 'tus' + gap + 'y';
    assert.deepEqual(covered(text, findHits('status', text, { fuzzy: true })), ['Sta' + gap + 'tus'], JSON.stringify(gap));
  }
  // Ignored characters around the hit are no part of it.
  const text = '-. Status .-';
  assert.deepEqual(covered(text, findHits('status', text, { fuzzy: true })), ['Status']);
  // Every hit, not overlapping, ranges of the original text.
  const two = 'Status-Chip und STATUS CHIP und status.chip';
  assert.deepEqual(covered(two, findHits('statuschip', two, { fuzzy: true })), ['Status-Chip', 'STATUS CHIP', 'status.chip']);
});

test('findHits, light fuzzy: nothing else is ignored or folded, no umlaut, no "oe" for "ö", no letters swapped', () => {
  assert.deepEqual(findHits('Groesse', 'Größe', { fuzzy: true }), []);
  assert.deepEqual(findHits('Große', 'Groesse', { fuzzy: true }), []);
  assert.deepEqual(findHits('Strasse', 'Straße', { fuzzy: true }), []);
  assert.deepEqual(findHits('Tabelle', 'Tabllee', { fuzzy: true }), []);
  assert.deepEqual(findHits('a_b', 'ab', { fuzzy: true }), []);
  assert.deepEqual(findHits('a/b', 'ab', { fuzzy: true }), []);
});

test('findHits, light fuzzy: a word broken by emphasis is one string in its place, and found', () => {
  const [place] = collectPlaces(rootWith('<p>ein Sta<em>tus</em>-Chip.</p>'));
  assert.equal(place.text, 'ein Status-Chip.');
  assert.deepEqual(covered(place.text, findHits('statuschip', place.text, { fuzzy: true })), ['Status-Chip']);
});

test('findHits, case-sensitive: case counts, in the term and in the text', () => {
  assert.deepEqual(findHits('tabelle', 'Tabelle', { caseSensitive: true }), []);
  assert.deepEqual(findHits('Tabelle', 'Tabelle', { caseSensitive: true }), [{ start: 0, end: 7 }]);
  const text = 'TABELLE und tabelle und Tabelle';
  assert.deepEqual(covered(text, findHits('Tabelle', text, { caseSensitive: true })), ['Tabelle']);
  assert.deepEqual(covered(text, findHits('tabelle', text, { caseSensitive: false })), ['TABELLE', 'tabelle', 'Tabelle']);
});

test('findHits, case-sensitive and light fuzzy: the hyphen is ignored, the case is not', () => {
  assert.deepEqual(findHits('Status-chip', 'Status-Chip', { caseSensitive: true, fuzzy: true }), []);
  assert.deepEqual(findHits('Status chip', 'Status-Chip', { caseSensitive: true, fuzzy: true }), []);
  assert.deepEqual(findHits('StatusChip', 'Status-Chip', { caseSensitive: true, fuzzy: true }), [{ start: 0, end: 11 }]);
});

test('findHits, light fuzzy: a term it leaves empty finds nothing', () => {
  assert.deepEqual(findHits('-.-', 'a-.-b', { fuzzy: true }), []);
  assert.deepEqual(findHits(' . ', 'a . b', { fuzzy: true }), []);
});

test('findHits: where lowering changes the length, ranges stay ranges of the original text with fuzzy and with case', () => {
  const text = 'İstanbul, Status-Chip, İSTANBUL';
  assert.deepEqual(covered(text, findHits('statuschip', text, { fuzzy: true })), ['Status-Chip']);
  assert.deepEqual(covered(text, findHits('İstanbul', text, { fuzzy: true })), ['İstanbul', 'İSTANBUL']);
  assert.deepEqual(covered(text, findHits('İstanbul', text, { caseSensitive: true })), ['İstanbul']);
  assert.deepEqual(covered(text, findHits('status-chip', text, { caseSensitive: true })), []);
  const emoji = '🚧 Bau-stelle 🚧';
  assert.deepEqual(covered(emoji, findHits('baustelle', emoji, { fuzzy: true })), ['Bau-stelle']);
});

// ---------- the minimum length (story 2) ----------
test('tooShort: fewer than three letters or digits is too short, umlauts are letters, a blank is neither', () => {
  for (const term of ['T', 'Ta', 'ä', 'Äh', '12', 'a b', ' a ', '1 2', 'ß']) assert.equal(tooShort(term), true, term);
  for (const term of ['Tab', 'abc', 'äöü', '123', 'a b c', 'Ta1']) assert.equal(tooShort(term), false, term);
});

test('tooShort: "ae", "oe", "ue" and "ss" in any case are searched', () => {
  for (const term of ['ae', 'oe', 'ue', 'ss', 'OE', 'Oe', 'oE', 'SS', 'Ue', ' oe ']) assert.equal(tooShort(term), false, term);
  for (const term of ['ae', 'OE']) assert.equal(tooShort(term, { fuzzy: true }), false, term);
  assert.equal(tooShort('ou'), true);
  assert.equal(tooShort('o e'), true);
});

test('tooShort: a term with another character is searched, however short', () => {
  for (const term of ['🟢', 'C#', '#', '-', 'a-', '§', '%', '€', '/']) assert.equal(tooShort(term), false, term);
});

test('tooShort, light fuzzy: the rule applies to what is compared', () => {
  assert.equal(tooShort('S-C'), false);
  assert.equal(tooShort('S-C', { fuzzy: true }), true);
  assert.equal(tooShort('S.C', { fuzzy: true }), true);
  assert.equal(tooShort('S-C-D', { fuzzy: true }), false);
  assert.equal(tooShort('o-e', { fuzzy: true }), false);
  assert.equal(tooShort('-.-', { fuzzy: true }), true);
  assert.equal(tooShort('C#', { fuzzy: true }), false);
});

test('tooShort: an empty term, or one of blanks, is too short; case does not matter to the rule', () => {
  assert.equal(tooShort(''), true);
  assert.equal(tooShort('   '), true);
  assert.equal(tooShort('Ta', { caseSensitive: true }), true);
  assert.equal(tooShort('OE', { caseSensitive: true }), false);
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

test('collectPlaces: warnings, facet bars, an SVG outside a diagram\'s figure, the metadata of an export\'s footer and transient elements are no places, nor a table or code block inside a warning; the metadata panel and a code block are one place each, nothing inside them a place of its own', () => {
  const html =
    '<div class="dokufix-warning" role="note"><p class="dokufix-warning-title"><strong>Warnung:</strong> Tabelle kaputt.</p><pre class="dokufix-warning-detail">Tabelle</pre>' +
    '<table><tbody><tr><td>Tabelle</td></tr></tbody></table></div>\n' +
    '<div class="dokufix-facets"><fieldset class="dokufix-facet-bar"><legend>Tabelle</legend><div class="dokufix-facet-controls"><label><input type="radio">Tabelle</label></div></fieldset>' +
    '<div class="dokufix-table"><table><thead><tr><th>Art</th></tr></thead><tbody><tr><td><p>Wert</p><ul><li>Eins</li></ul></td></tr></tbody></table></div></div>\n' +
    '<pre><code>Tabelle</code></pre>\n' +
    '<div class="mermaid"><svg><foreignObject><div><p>Tabelle</p></div></foreignObject></svg></div>\n' +
    '<details class="dokufix-frontmatter"><summary><span class="dokufix-fm-label">Metadaten</span></summary><div class="dokufix-fm-body"><dl class="dokufix-fm-rows"><dt>titel</dt><dd><ul class="dokufix-fm-list"><li>Tabelle</li></ul>' +
    '<table><tbody><tr><td>Tabelle</td></tr></tbody></table></dd></dl></div></details>\n' +
    '<div class="dokufix-meta"><p>Tabelle</p><table><tbody><tr><td>Tabelle</td></tr></tbody></table></div>\n' +
    '<div class="dokufix-filter" ' + TRANSIENT_ATTR + '><p>Tabelle</p></div>\n' +
    '<p>Die eine Tabelle.</p>\n';
  // The rows of the facet table are places, the cell's paragraph and list text of its row (story 6);
  // the code block and the metadata panel are one place each, with what they hold (story 8).
  assert.deepEqual(places(html), [['tr', 'Art'], ['tr', 'WertEins'], ['pre', 'Tabelle'], ['details', 'titel Tabelle Tabelle'], ['p', 'Die eine Tabelle.']]);
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

// ---------- the hits in the document (story 5) ----------
// The text nodes under root, in the order of the document.
function textNodes(node, out = []){
  for (let child = node.firstChild; child; child = child.nextSibling){
    if (child.nodeType === 3) out.push(child);
    else textNodes(child, out);
  }
  return out;
}
// What a node range covers in the document, every text node between its ends
// included: what a Range over it would read.
function rangeText(root, r){
  const nodes = textNodes(root);
  const from = nodes.indexOf(r.startNode), to = nodes.indexOf(r.endNode);
  assert.ok(from >= 0 && to >= from, 'the range runs forward over text nodes of the root');
  if (from === to) return r.startNode.data.slice(r.startOffset, r.endOffset);
  return r.startNode.data.slice(r.startOffset) + nodes.slice(from + 1, to).map(n => n.data).join('') + r.endNode.data.slice(0, r.endOffset);
}
// The hits of a term in the places of a root, each as the texts of its node ranges.
function hitTexts(root, term, options){
  return collectPlaces(root).flatMap(p => findHits(term, p.text, options).map(hit => nodeRanges(p.map, hit).map(r => rangeText(root, r))));
}
// The old reading of a heading's text, on a copy (story 4): the walk must read the same.
function headingTextOfCopy(h){
  const copy = h.cloneNode(true);
  for (const el of Array.from(copy.querySelectorAll('*'))){
    if (el.tagName === 'BR') el.replaceWith(copy.ownerDocument.createTextNode(' '));
    else if ((el.matches('.dokufix-fn-host, .dokufix-fn-preview, [data-footnote-ref]') || el.hasAttribute(TRANSIENT_ATTR))) el.remove();
  }
  return headingLabelText(copy).replace(/\s+/g, ' ').trim();
}

test('collectPlaces, the map: every unit of a place\'s text maps to the character of a text node it came from, a blank to white space or to none', () => {
  const root = rootWith('<h2>Bestellung:<code>🟢 Live</code> und<br>mehr</h2>\n<p>  Erste\n  <em>Zeile</em><br>zweite   <a href="#x">Zeile</a> 😀 İ<sup class="dokufix-fn-host"><a href="#f" data-footnote-ref="">1</a><span class="dokufix-fn-preview">P</span></sup>. </p>\n<ul>\n<li>Außen<ul>\n<li>Innen</li>\n</ul>\n danach</li>\n</ul>\n');
  buildChips(root);
  const found = collectPlaces(root);
  assert.deepEqual(found.map(p => p.text), ['Bestellung: Live und mehr', 'Erste Zeile zweite Zeile 😀 İ.', 'Außen danach', 'Innen']);
  for (const { text, map } of found){
    assert.equal(map.nodes.length, text.length, text);
    assert.equal(map.offsets.length, text.length, text);
    assert.equal(map.parts.length, text.length, text);
    for (let i = 0; i < text.length; i++){
      const node = map.nodes[i];
      if (text[i] === ' '){
        assert.ok(!node || /\s/.test(node.data[map.offsets[i]]), text + ' at ' + i);
      } else {
        assert.ok(node && node.nodeType === 3 && root.contains(node), text + ' at ' + i);
        assert.equal(node.data[map.offsets[i]], text[i], text + ' at ' + i);
      }
    }
  }
});

test('collectPlaces: a heading reads as headingLabelText() reads its copy without what is left out, chip, footnote and line break in every order', () => {
  const html = ['Bestellung:<code>🟢 Live</code>', 'Bestellung <code>🟢 Live</code>', '<code>🟢 Live</code> vorn', 'a<code>🟢 Eins</code><code>🔴 Zwei</code>b',
    'Frist<sup class="dokufix-fn-host"><a href="#f" data-footnote-ref="">1</a><span class="dokufix-fn-preview">Fußnote</span></sup> und<br>Ende',
    'Zeile<br><code>🟡 Prüfung</code> danach', '  <em>Weit</em>   gefasst\n  '].map(h => '<h3>' + h + '</h3>').join('\n');
  const root = rootWith(html);
  buildChips(root);
  const headings = Array.from(root.querySelectorAll('h3'));
  assert.deepEqual(collectPlaces(root).map(p => p.text), headings.map(headingTextOfCopy));
});

test('nodeRanges: a hit over several text nodes is one range over exactly its characters: "statuschip" with light fuzzy in Sta<em>tus</em>-Chip', () => {
  const root = rootWith('<p>ein Sta<em>tus</em>-Chip.</p>');
  const [place] = collectPlaces(root);
  const [hit] = findHits('statuschip', place.text, { fuzzy: true });
  const ranges = nodeRanges(place.map, hit);
  assert.equal(ranges.length, 1);
  const [first, , last] = textNodes(root);
  assert.deepEqual(ranges[0], { startNode: first, startOffset: 4, endNode: last, endOffset: 5 });
  assert.equal(rangeText(root, ranges[0]), 'Status-Chip');
});

test('nodeRanges: every hit of a place, each with its ranges; a link and emphasis inside a hit keep it one range', () => {
  const root = rootWith('<p>Eine Tab<a href="#t">el</a>le, noch eine <strong>Tabelle</strong> und <em>Tab</em>elle.</p>');
  assert.deepEqual(hitTexts(root, 'tabelle'), [['Tabelle'], ['Tabelle'], ['Tabelle']]);
});

test('nodeRanges: a footnote marker inside a hit is left out, the hit is two ranges around it; a hit next to it has the marker in none', () => {
  const root = rootWith('<p>Die Frist<sup class="dokufix-fn-host"><a href="#footnote-back-a" data-footnote-ref="" aria-describedby="footnote-label">1</a>' +
    '<span class="dokufix-fn-preview" aria-hidden="true">Laut Tabelle drei.</span></sup> läuft.</p>');
  assert.deepEqual(hitTexts(root, 'Frist läuft'), [['Frist', 'läuft']]);
  assert.deepEqual(hitTexts(root, 'Frist'), [['Frist']]);
  assert.deepEqual(hitTexts(root, 'läuft'), [['läuft']]);
  assert.deepEqual(hitTexts(root, 'Tabelle'), []);
});

test('nodeRanges: in a heading with a status chip the chip\'s word is in no range, its label is', () => {
  const root = rootWith('<h2>Bestellung:<code>🟢 Live</code></h2>\n<h2>Status <code>🔴 Aus</code> seit gestern</h2>\n');
  buildChips(root);
  const word = root.querySelector('.dokufix-chip-status').textContent;
  assert.deepEqual(hitTexts(root, 'Bestellung: Live'), [['Bestellung:', 'Live']]);
  assert.deepEqual(hitTexts(root, 'Live'), [['Live']]);
  assert.deepEqual(hitTexts(root, 'Status Aus seit'), [['Status', 'Aus seit']]);
  assert.ok(!hitTexts(root, 'Bestellung: Live').flat().some(t => t.includes(word.trim())), word);
});

test('nodeRanges: the number tile of a step is in no range, and neither is a nested list', () => {
  const root = rootWith('<ol>\n<li><em>Autorin:</em> Den Text schreiben.</li>\n</ol>\n<ul>\n<li>Außen<ul>\n<li>Innen</li>\n</ul>\n danach</li>\n</ul>\n');
  buildSteps(root.querySelector('ol'));
  // The tile stands before the actor: a hit from the actor on begins behind it.
  assert.deepEqual(hitTexts(root, 'Autorin Den'), [['Autorin Den']]);
  const step = collectPlaces(root)[0];
  const [r] = nodeRanges(step.map, findHits('Autorin', step.text)[0]);
  assert.equal(r.startNode.parentNode.className, 'dokufix-step-actor');
  assert.equal(step.map.nodes.filter(n => n && n.parentNode.classList.contains('dokufix-step-number')).length, 0);
  assert.deepEqual(hitTexts(root, 'Außen danach'), [['Außen', 'danach']]);
});

test('nodeRanges: over collapsed white space and a line break a range ends on the right characters, with no blank at its ends', () => {
  const root = rootWith('<p>  Erste\n  Zeile<br>zweite   Zeile </p>');
  const [place] = collectPlaces(root);
  assert.equal(place.text, 'Erste Zeile zweite Zeile');
  assert.deepEqual(hitTexts(root, 'Erste Zeile'), [['Erste\n  Zeile']]);
  assert.deepEqual(hitTexts(root, 'Zeile zweite'), [['Zeilezweite']]);
  assert.deepEqual(hitTexts(root, 'zweite Zeile'), [['zweite   Zeile']]);
  const [, last] = findHits('Zeile', place.text);
  const [r] = nodeRanges(place.map, last);
  assert.equal(r.endOffset, 'zweite   Zeile'.length);
  assert.deepEqual(hitTexts(root, 'erste', { fuzzy: true }), [['Erste']]);
});

test('nodeRanges: where lowering changes the length, a range still covers whole characters of the node', () => {
  const root = rootWith('<p>😀 <em>İ</em>stanbul und STRAẞE</p>');
  assert.deepEqual(hitTexts(root, 'i̇stanbul'), [['İstanbul']]);
  assert.deepEqual(hitTexts(root, 'straße'), [['STRAẞE']]);
});

test('nodeRanges changes nothing in the document and needs no Range: plain objects of nodes and offsets', () => {
  const root = rootWith('<p>Eine <em>Tabelle</em> hier.</p>');
  const before = root.outerHTML;
  const [place] = collectPlaces(root);
  const ranges = nodeRanges(place.map, findHits('Tabelle', place.text)[0]);
  assert.deepEqual(Object.keys(ranges[0]), ['startNode', 'startOffset', 'endNode', 'endOffset']);
  assert.equal(root.outerHTML, before);
});

test('a search over the places: one result per place that holds the term, every hit counted', () => {
  const root = rootWith('<h2>Tabellen</h2>\n<p>Eine Tabelle und noch eine tabelle.</p>\n<p>Keine hier.</p>\n<ul>\n<li>TABELLE</li>\n</ul>\n<table><tbody><tr><td>Tabelle</td></tr></tbody></table>\n');
  const found = collectPlaces(root).map(p => ({ tag: p.el.tagName, hits: findHits('tabelle', p.text).length })).filter(r => r.hits);
  assert.deepEqual(found, [{ tag: 'H2', hits: 1 }, { tag: 'P', hits: 2 }, { tag: 'LI', hits: 1 }, { tag: 'TR', hits: 1 }]);
});

// ---------- hits in tables (story 6) ----------
// A table as marked emits it, in its wrapper (tables.js).
const tableHtml = (head, rows) => '<div class="dokufix-table"><table>\n<thead>\n<tr>\n' + head.map(h => '<th>' + h + '</th>\n').join('') + '</tr>\n</thead>\n<tbody>' +
  rows.map(r => '<tr>\n' + r.map(c => '<td>' + c + '</td>\n').join('') + '</tr>\n').join('') + '</tbody></table></div>\n';
// The place of each hit of a term, with the texts of its node ranges.
const rowHits = (root, term, options) => collectPlaces(root).flatMap(p => findHits(term, p.text, options).map(hit => ({ tag: p.el.tagName, kind: p.kind, ranges: nodeRanges(p.map, hit).map(r => rangeText(root, r)) })));

test('collectPlaces: every table row is a place of the kind "' + KIND_ROW + '", the header row included, its text the cells joined by a blank', () => {
  assert.equal(KIND_ROW, 'Tabelle');
  const root = rootWith('<h2>Sonderfälle</h2>\n<p>Davor.</p>\n' + tableHtml(['Art', 'Name'], [['Falter', 'Zitronenfalter'], ['', ''], ['Käfer', 'Hirsch<br><em>käfer</em>']]));
  const found = collectPlaces(root);
  assert.deepEqual(found.map(p => [p.el.tagName, p.text, p.kind]),
    [['H2', 'Sonderfälle', undefined], ['P', 'Davor.', undefined], ['TR', 'Art Name', 'Tabelle'], ['TR', 'Falter Zitronenfalter', 'Tabelle'], ['TR', 'Käfer Hirsch käfer', 'Tabelle']]);
  // The term only in a cell: one result, the row; the hit highlighted in its cell.
  assert.deepEqual(rowHits(root, 'Zitronenfalter'), [{ tag: 'TR', kind: 'Tabelle', ranges: ['Zitronenfalter'] }]);
  // A term only in the header row.
  assert.deepEqual(rowHits(root, 'Name'), [{ tag: 'TR', kind: 'Tabelle', ranges: ['Name'] }]);
  // A row's results group as any place's do.
  const results = found.filter(p => findHits('falter', p.text).length).map(p => ({ el: p.el, hits: findHits('falter', p.text).length }));
  assert.deepEqual(groupResults(root, results).groups.map(g => [g.label, g.hits, g.places]), [['Sonderfälle', 2, 1]]);
});

test('collectPlaces: several hits in one row are one place, every hit counted, each highlighted in its cell', () => {
  const root = rootWith(tableHtml(['Baustein', 'Art'], [['Karte', 'Karte im Block'], ['Liste', 'Block']]));
  const found = collectPlaces(root).filter(p => findHits('Karte', p.text).length);
  assert.equal(found.length, 1);
  assert.equal(findHits('Karte', found[0].text).length, 2);
  assert.deepEqual(rowHits(root, 'Karte').map(h => h.ranges), [['Karte'], ['Karte']]);
  const [row] = found;
  const cellsOfHits = findHits('Karte', row.text).flatMap(hit => nodeRanges(row.map, hit).map(r => r.startNode.parentNode));
  assert.deepEqual(cellsOfHits, Array.from(row.el.querySelectorAll('td')));
});

test('nodeRanges: a hit across two cells is one hit with one range per cell, never one over the edge', () => {
  const root = rootWith(tableHtml(['A', 'B', 'C'], [['Hinweis', 'Block', 'Zitat'], ['Ein <em>Hin</em>weis', 'Block', '']]));
  const hits = rowHits(root, 'HinweisBlock', { fuzzy: true });
  assert.deepEqual(hits.map(h => h.ranges), [['Hinweis', 'Block'], ['Hinweis', 'Block']]);
  // Without light fuzzy the blank between the cells is text of the row, as the filter reads it.
  assert.deepEqual(rowHits(root, 'Hinweis Block').map(h => h.ranges), [['Hinweis', 'Block'], ['Hinweis', 'Block']]);
  for (const place of collectPlaces(root)){
    for (const hit of findHits('weisblockzit', place.text, { fuzzy: true }).concat(findHits('HinweisBlock', place.text, { fuzzy: true }))){
      for (const r of nodeRanges(place.map, hit)) assert.equal(r.startNode.parentNode.closest('td, th'), r.endNode.parentNode.closest('td, th'));
    }
  }
  assert.deepEqual(rowHits(root, 'weisblockzit', { fuzzy: true }).map(h => h.ranges), [['weis', 'Block', 'Zit']]);
});

test('collectPlaces: a chip\'s word and a footnote marker in a cell are no text of the row, and in no range', () => {
  const ref = '<sup class="dokufix-fn-host"><a href="#footnote-back-a" data-footnote-ref="">1</a><span class="dokufix-fn-preview" aria-hidden="true">Ein Morgenrot.</span></sup>';
  const root = rootWith(tableHtml(['Stand', 'Text'], [['<code>🔵 im Test</code>', 'Frist' + ref + ' läuft']]));
  buildChips(root);
  const word = root.querySelector('.dokufix-chip-status').textContent.trim();
  const row = collectPlaces(root)[1];
  assert.equal(row.text, 'im Test Frist läuft');
  assert.deepEqual(rowHits(root, word), []);
  assert.deepEqual(rowHits(root, 'Morgenrot'), []);
  assert.deepEqual(rowHits(root, '1'), []);
  assert.deepEqual(rowHits(root, 'Frist läuft').map(h => h.ranges), [['Frist', 'läuft']]);
  assert.deepEqual(rowHits(root, 'im Test').map(h => h.ranges), [['im Test']]);
});

test('collectPlaces: a table nested in a cell is text of the outer row, and its rows are no places', () => {
  const root = rootWith('<table><tbody><tr><td>außen</td><td><table><tbody><tr><td>innen</td><td>zwei</td></tr><tr><td>drei</td></tr></tbody></table></td></tr></tbody></table>');
  assert.deepEqual(collectPlaces(root).map(p => [p.el, p.text]), [[root.querySelector('tr'), 'außen innen zwei drei']]);
  assert.deepEqual(rowHits(root, 'innen zwei').map(h => h.ranges), [['innen', 'zwei']]);
});

test('collectPlaces: a table in a list item is no text of the item; each of its rows is a place', () => {
  const root = rootWith('<ul>\n<li>Ein Punkt mit Tabelle\n' + tableHtml(['Kopf'], [['Zeile eins'], ['Zeile zwei']]) + 'und danach</li>\n</ul>\n');
  assert.deepEqual(places(root.innerHTML), [['li', 'Ein Punkt mit Tabelle und danach'], ['tr', 'Kopf'], ['tr', 'Zeile eins'], ['tr', 'Zeile zwei']]);
  // The item's hit around the table is two ranges, the table in neither.
  assert.deepEqual(rowHits(root, 'Tabelle und').map(h => h.ranges), [['Tabelle', 'und']]);
});

test('collectPlaces: the text of every row is filterRowText() of the row, over a varied table', () => {
  const ref = n => '<sup class="dokufix-fn-host"><a href="#footnote-back-' + n + '" data-footnote-ref="">' + n + '</a><span class="dokufix-fn-preview" aria-hidden="true">Vorschau ' + n + '</span></sup>';
  const html = '<div class="dokufix-facets"><fieldset class="dokufix-facet-bar"><legend>Art</legend><div class="dokufix-facet-controls"><label><input type="radio" class="dokufix-facet-0" checked>Alle <span class="dokufix-facet-count">5</span></label></div></fieldset>' +
    '<div class="dokufix-filter" ' + TRANSIENT_ATTR + '><input type="search" class="dokufix-filter-input"><span class="dokufix-filter-count">5 Zeilen</span></div>' +
    '<div class="dokufix-table"><table>\n<thead>\n<tr>\n<th>Baustein</th>\n<th align="left">Art</th>\n<th>  Geschrieben   als </th>\n</tr>\n</thead>\n<tbody>' +
    '<tr class="dokufix-facet-row dokufix-facet-1">\n<td>Hinweis<br><em class="dokufix-cell-sub">fünf Marken</em></td>\n<td>Block</td>\n<td>Zitat mit <strong>Marke</strong>' + ref(1) + '</td>\n</tr>\n' +
    '<tr>\n<td><code>🟢 Live</code> seit<br>gestern</td>\n<td><a href="#x">Text</a></td>\n<td></td>\n</tr>\n' +
    '<tr>\n<td></td>\n<td></td>\n<td></td>\n</tr>\n' +
    '<tr>\n<td>flüchtig<span ' + TRANSIENT_ATTR + '>weg</span>da</td>\n<td><p>Absatz</p>\n<ul>\n<li>Punkt</li>\n</ul></td>\n<td><table><tbody><tr><td>in</td><td>nen<code>🔴 Aus</code></td></tr></tbody></table></td>\n</tr>\n' +
    '<tr>\n<td colspan="2"> 😀 İ <!-- Kommentar --> ẞ </td>\n<td><fieldset class="dokufix-facet-bar"><legend>X</legend>Alle 3</fieldset>Rest' + ref(2) + '.</td>\n</tr>\n' +
    '</tbody><tfoot><tr><td>Summe</td><td>5</td><td></td></tr></tfoot></table></div></div>\n';
  const root = rootWith(html);
  buildChips(root);
  const rows = Array.from(root.querySelectorAll('tr')).filter(tr => !tr.parentNode.closest('td, th'));
  const places = collectPlaces(root);
  assert.deepEqual(places.map(p => p.el), rows.filter(tr => filterRowText(tr)), 'every row with text is a place, a nested row none');
  for (const place of places) assert.equal(place.text, filterRowText(place.el));
  assert.equal(places.length, 6);
  // The map holds as for every place: each unit from the character of a text node.
  for (const { text, map } of places){
    assert.equal(map.nodes.length, text.length);
    for (let i = 0; i < text.length; i++){
      if (text[i] !== ' ') assert.equal(map.nodes[i].data[map.offsets[i]], text[i], text + ' at ' + i);
    }
  }
});

test('the kind of a row is no text of it: "Tabelle" finds no row that does not hold it, and the hits count the row text alone', () => {
  const root = rootWith(tableHtml(['Art'], [['Karten'], ['Tabelle und Tabelle']]));
  const found = collectPlaces(root).filter(p => findHits('Tabelle', p.text).length);
  assert.deepEqual(found.map(p => [p.text, findHits('Tabelle', p.text)]), [['Tabelle und Tabelle', [{ start: 0, end: 7 }, { start: 12, end: 19 }]]]);
  assert.deepEqual(excerpt(found[0].text, findHits('Tabelle', found[0].text), 160).text, 'Tabelle und Tabelle');
});

// ---------- hits in diagrams (story 7) ----------
// A diagram as the page shows it: its figure with the controls of its large
// view and, for BPMN, the credit (diagrams.js), the SVG drawn into its holder.
// The SVGs are cut down from what bpmn-js 18 and Mermaid 12 draw: a BPMN
// label a text.djs-label with a tspan per line, a Mermaid flowchart label a
// foreignObject > div > span > p, a sequence diagram's actor a text drawn at
// the top and at the bottom, Mermaid's styles in a <style> of the SVG.
const credit = { before: 'Gezeichnet mit ', href: 'https://bpmn.io', text: 'bpmn-js' };
function diagramRoot(diagrams, before = '<h2>Abläufe</h2>\n', after = '<p>Danach.</p>\n'){
  const root = rootWith(before + '<div id="here"></div>' + after);
  const here = root.querySelector('#here');
  diagrams.forEach(([kind, svg], i) => {
    const { figure, holder } = diagramFigure(root.ownerDocument, kind, 'Rückgabe', kind === 'bpmn' ? credit : null, i + 1);
    if (svg !== null) holder.innerHTML = svg;
    here.before(figure);
  });
  here.remove();
  return root;
}
const label = (...lines) => '<g class="djs-element"><g class="djs-visual"><rect width="100" height="80"></rect><text class="djs-label" style="font-family: Arial">' +
  lines.map((l, i) => '<tspan x="10" y="' + (20 + 14 * i) + '">' + l + '</tspan>').join('') + '</text></g></g>';
const bpmnSvg = (...labels) => '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Rückgabe" viewBox="0 0 400 200"><defs><marker id="pfeil"><path d="M 1 5 L 11 10 L 1 15 Z"></path></marker></defs>' +
  labels.join('') + '</svg>';
const mermaidSvg = (...labels) => '<svg id="mermaid-1" class="flowchart" role="graphics-document document" aria-roledescription="flowchart-v2">' +
  '<style>#mermaid-1{font-family:"trebuchet ms";fill:#333;}#mermaid-1 .node rect{fill:#ECECFF;stroke:#9370DB;}</style>' +
  '<title>Titel der Quelle</title><desc>Beschreibung der Quelle</desc><g class="root"><g class="nodes">' +
  labels.map(l => '<g class="node default"><rect class="basic label-container"></rect><g class="label"><foreignObject width="120" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap;"><span class="nodeLabel"><p>' + l + '</p></span></div></foreignObject></g></g>').join('') +
  '</g></g></svg>';

test('the diagram languages and their labels come from diagram-kinds.js alone: a figure of each language has its label, a fenced block of each is no code, and search-places.js names no language', () => {
  for (const [lang, { label }] of Object.entries(DIAGRAM_LANGUAGES)){
    const { document } = parseHTML('<html><body><main><figure class="dokufix-diagram dokufix-diagram-' + lang + '"><div class="dokufix-diagram-svg"><svg><text>Wort</text></svg></div></figure>' +
      '<pre><code class="language-' + lang + '">Quelle</code></pre></main></body></html>');
    assert.deepEqual(collectPlaces(document.querySelector('main')).map(p => [p.el.tagName, p.text, p.kind]), [['FIGURE', 'Wort', label]], lang);
  }
  const code = fs.readFileSync(new URL('../src/app/search-places.js', import.meta.url), 'utf8').split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
  assert.doesNotMatch(code, /mermaid|bpmn|Diagramm/i);
});

const diagramPlaces = root => collectPlaces(root).filter(p => p.kind === KIND_BPMN || p.kind === KIND_MERMAID);

test('collectPlaces: a diagram is one place, its figure, of the kind "' + KIND_BPMN + '" or "' + KIND_MERMAID + '"; its text is the labels of its SVG, never the frame around it', () => {
  assert.equal(KIND_BPMN, 'BPMN-Diagramm');
  assert.equal(KIND_MERMAID, 'Mermaid-Diagramm');
  const root = diagramRoot([['bpmn', bpmnSvg(label('Medium zurück'), label('Etikett ', 'scannen'))], ['mermaid', mermaidSvg('Antrag', 'Prüfen')]]);
  const found = collectPlaces(root);
  assert.deepEqual(found.map(p => [p.el.tagName, p.el.className, p.text, p.kind]), [
    ['H2', '', 'Abläufe', undefined],
    ['FIGURE', 'dokufix-diagram dokufix-diagram-bpmn', 'Medium zurück Etikett scannen', KIND_BPMN],
    ['FIGURE', 'dokufix-diagram dokufix-diagram-mermaid', 'Antrag Prüfen', KIND_MERMAID],
    ['P', '', 'Danach.', undefined],
  ]);
  // The bar of the large view, its title, steps and "Schließen", the credit and the figure's name are no text of it.
  for (const word of ['Rückgabe', ...DIAGRAM_ZOOM_STEPS.map(s => s.label), DIAGRAM_CLOSE_TEXT, 'Gezeichnet', 'bpmn-js', 'groß anzeigen']){
    assert.deepEqual(found.filter(p => findHits(word, p.text).length), [], word);
  }
});

test('collectPlaces: a BPMN label\'s lines are joined, with nothing after a blank or a hyphen at the end of a line and one blank otherwise', () => {
  const root = diagramRoot([['bpmn', bpmnSvg(label('Fernleihe ', 'bestellen'), label('Rückgabe-', 'Automatenbedienung'), label('Vormerkung', 'gemeldet'),
    label('Persönlich ', 'antworten am ', 'selben Tag'), label('Hin-', 'und Rückweg'), label('Kurz‐', 'weg'), label('Lang‑', 'weg'), label('  Viel   ', '  Raum  '))]]);
  const [place] = diagramPlaces(root);
  assert.equal(place.text, 'Fernleihe bestellen Rückgabe-Automatenbedienung Vormerkung gemeldet Persönlich antworten am selben Tag Hin-und Rückweg Kurz‐weg Lang‑weg Viel Raum');
  // Both found with light fuzzy off; a word split at a hyphen with light fuzzy, as "Hin- und Rückweg" is.
  for (const term of ['Vormerkung gemeldet', 'Rückgabe-Automatenbedienung', 'Fernleihe bestellen', 'antworten am selben']){
    assert.equal(findHits(term, place.text).length, 1, term);
  }
  assert.equal(findHits('Hin- und Rückweg', place.text).length, 0);
  assert.equal(findHits('Hin- und Rückweg', place.text, { fuzzy: true }).length, 1);
});

test('collectPlaces: in a Mermaid diagram a line break is a blank, and neither its styles nor its title and description are text', () => {
  const root = diagramRoot([['mermaid', mermaidSvg('Zeile eins<br>Zeile zwei', 'Ende')]]);
  const [place] = diagramPlaces(root);
  assert.equal(place.text, 'Zeile eins Zeile zwei Ende');
  for (const word of ['fill', 'ECECFF', 'trebuchet', 'Titel', 'Beschreibung', 'flowchart']) assert.equal(findHits(word, place.text).length, 0, word);
});

test('collectPlaces: what a hit counts is what the reader sees: several labels with the term are one place with every hit, a sequence diagram\'s actor drawn twice holds it twice', () => {
  const several = diagramPlaces(diagramRoot([['bpmn', bpmnSvg(label('Medium ', 'einlegen'), label('Medium ', 'annehmen'), label('Beleg'), label('Medium'))]]));
  assert.equal(several.length, 1);
  assert.equal(findHits('Medium', several[0].text).length, 3);
  const actor = y => '<g><rect class="actor"></rect><text x="75" y="' + y + '" dominant-baseline="central" alignment-baseline="central" class="actor actor-box"><tspan x="75" dy="0">Automat</tspan></text></g>';
  const sequence = '<svg id="mermaid-2" aria-roledescription="sequence"><style>#mermaid-2 .actor{stroke:#ccc;}</style>' + actor(32) +
    '<text x="200" y="80" class="messageText" dy="1em">Signatur melden</text>' + actor(300) + '</svg>';
  const [place] = diagramPlaces(diagramRoot([['mermaid', sequence]]));
  assert.equal(place.text, 'Automat Signatur melden Automat');
  assert.equal(findHits('Automat', place.text).length, 2);
});

test('collectPlaces: a diagram whose SVG is not drawn, still its source while it is drawn or packed in a `schlank` file, is no place; nor is a diagram that failed, which is a warning', () => {
  const source = '<bpmn:process id="Prozess_Neu" isExecutable="false"><bpmn:task id="N_E_Stempeln" name="Stempeln"/></bpmn:process>';
  const root = diagramRoot([['bpmn', null], ['mermaid', null]]);
  root.querySelectorAll('.dokufix-diagram-svg')[0].textContent = source;
  root.querySelectorAll('.dokufix-diagram-svg')[1].setAttribute('data-gz', 'H4sIAAAAAAAA');
  root.append(buildWarning(root.ownerDocument, 'Das BPMN-Diagramm konnte nicht gezeichnet werden.', 'Stempeln: Prozess_Neu'));
  assert.deepEqual(diagramPlaces(root), []);
  for (const word of ['Stempeln', 'Prozess_Neu', 'isExecutable']) assert.deepEqual(collectPlaces(root).filter(p => findHits(word, p.text).length), [], word);
});

test('collectPlaces: a diagram in a list item is no text of the item, and a place of its own; a transient diagram is none', () => {
  const root = diagramRoot([['mermaid', mermaidSvg('Abholbereit')], ['bpmn', bpmnSvg(label('Abholbereit'))]], '<ul>\n<li>Davor <span id="in"></span></li>\n</ul>\n', '');
  root.querySelector('#in').replaceWith(root.querySelector('figure'));
  root.querySelectorAll('figure')[1].setAttribute(TRANSIENT_ATTR, '');
  assert.deepEqual(collectPlaces(root).map(p => [p.el.tagName, p.text, p.kind]), [['LI', 'Davor', undefined], ['FIGURE', 'Abholbereit', KIND_MERMAID]]);
});

test('nodeRanges: a hit in a diagram is no range of the document, so nothing in it is highlighted; the diagram stands under its heading', () => {
  const root = diagramRoot([['bpmn', bpmnSvg(label('Abholbereit'), label('Buch ', 'abholbereit'))]], '<h2>Fernleihe</h2>\n<p>Abholbereit ist das Buch.</p>\n');
  const found = collectPlaces(root).map(p => ({ el: p.el, text: p.text, kind: p.kind, map: p.map, hits: findHits('abholbereit', p.text).length })).filter(p => p.hits);
  assert.deepEqual(found.map(p => [p.el.tagName, p.hits]), [['P', 1], ['FIGURE', 2]]);
  assert.deepEqual(findHits('abholbereit', found[1].text).flatMap(hit => nodeRanges(found[1].map, hit)), []);
  assert.deepEqual(findHits('abholbereit', found[0].text).flatMap(hit => nodeRanges(found[0].map, hit)).map(r => rangeText(root, r)), ['Abholbereit']);
  const { groups } = groupResults(root, found);
  assert.deepEqual(groups.map(g => [g.label, g.hits, g.places]), [['Fernleihe', 3, 2]]);
});

test('diagrams.js knows nothing of the search', () => {
  assert.doesNotMatch(read('app/diagrams.js'), /search(-places)?\.js|collectPlaces/);
});

// ---------- hits in the metadata panel and in code blocks (story 8) ----------
// A root with the metadata panel frontmatter.js makes of source, before the
// markup given, as the render pass puts it before the first heading.
function metaRoot(source, html = '<h1>Willkommen</h1>\n<p>Davor.</p>\n<h2>Eins</h2>\n'){
  const root = rootWith(html);
  injectFrontmatterPanel(root, splitFrontmatter(source));
  return root;
}
const FM = '---\ntitle: Willkommen bei dokufix\nauthor: Beispiel-Autorin\nleer:\ntags:\n  - markdown\n  - eine-datei\nfreigabe:\n  rolle: Informationssicherheit\n  gueltig_bis: 2027-06-30\n---\n\n# Willkommen\n';
const metaPlaces = root => collectPlaces(root).filter(p => p.kind === KIND_META);
const codePlaces = root => collectPlaces(root).filter(p => p.kind === KIND_CODE);

test('collectPlaces: the metadata panel is one place of the kind "' + KIND_META + '", its text every key and value, a blank between each, never its summary or the mark of an empty value', () => {
  assert.equal(KIND_META, 'Metadaten');
  const root = metaRoot(FM);
  const panel = root.querySelector('details.dokufix-frontmatter');
  assert.ok(panel && panel.querySelector('.dokufix-fm-empty'), 'the panel holds an empty value');
  const found = collectPlaces(root);
  assert.deepEqual(found.map(p => [p.el.tagName, p.text, p.kind]), [
    ['DETAILS', 'title Willkommen bei dokufix author Beispiel-Autorin leer tags markdown eine-datei freigabe rolle Informationssicherheit gueltig_bis 2027-06-30', KIND_META],
    ['H1', 'Willkommen', undefined], ['P', 'Davor.', undefined], ['H2', 'Eins', undefined],
  ]);
  // The summary's label and digest are no text: "Metadaten" finds nothing, the title counts once.
  assert.match(panel.querySelector('summary').textContent, /Metadaten.*Willkommen bei dokufix · Beispiel-Autorin/);
  assert.deepEqual(metaPlaces(root).filter(p => findHits('Metadaten', p.text).length), []);
  assert.equal(findHits('Willkommen bei dokufix', metaPlaces(root)[0].text).length, 1);
  assert.equal(findHits('—', metaPlaces(root)[0].text).length, 0);
  // Its keys, values and list items are no places of their own.
  assert.deepEqual(found.filter(p => panel.contains(p.el) && p.el !== panel), []);
  // A digest of the count, when no row names it, is no text either.
  const counted = metaRoot('---\neins: a\nzwei: b\n---\n');
  assert.match(counted.querySelector('summary').textContent, /2 Einträge/);
  assert.deepEqual(collectPlaces(counted).filter(p => findHits('Einträge', p.text).length), []);
});

test('collectPlaces: in the metadata panel a key and its value are never glued, and no range of a hit runs over their edge', () => {
  const root = rootWith('<details class="dokufix-frontmatter"><summary><span class="dokufix-fm-label">Metadaten</span><span class="dokufix-fm-digest">Willkommen</span></summary>' +
    '<div class="dokufix-fm-body"><dl class="dokufix-fm-rows"><dt>title</dt><dd>Willkommen</dd><dt>tags</dt><dd><ul class="dokufix-fm-list"><li>eins</li><li>zwei</li></ul></dd></dl></div></details>');
  const [place] = metaPlaces(root);
  assert.equal(place.text, 'title Willkommen tags eins zwei');
  assert.deepEqual(findHits('titleWillkommen', place.text), []);
  assert.deepEqual(hitTexts(root, 'title Willkommen'), [['title', 'Willkommen']]);
  assert.deepEqual(hitTexts(root, 'eins zwei'), [['eins', 'zwei']]);
  assert.deepEqual(hitTexts(root, 'Willkommen'), [['Willkommen']]);
});

test('collectPlaces: a metadata block that could not be read is searched in its raw text', () => {
  const root = metaRoot('---\ntitle: Kaputt\nliste: [a, b\n  zweite: Zeile\n---\n\n# Kaputt\n');
  const panel = root.querySelector('details.dokufix-fm-unparsed');
  assert.ok(panel && panel.querySelector('pre.dokufix-fm-raw'), 'the raw panel');
  const [place, ...rest] = metaPlaces(root);
  assert.equal(rest.length, 0);
  assert.equal(place.el, panel);
  assert.equal(place.text, 'title: Kaputt liste: [a, b zweite: Zeile');
  // Not its digest, "nicht lesbar — Originaltext"; and its pre is no code block.
  assert.deepEqual(collectPlaces(root).filter(p => findHits('Originaltext', p.text).length), []);
  assert.deepEqual(codePlaces(root), []);
  assert.deepEqual(hitTexts(root, 'zweite'), [['zweite']]);
});

test('the metadata panel stands in the first group, as everything before the first H2, labelled with the H1', () => {
  const root = metaRoot(FM);
  const found = collectPlaces(root).map(p => ({ el: p.el, text: p.text, hits: findHits('Beispiel-Autorin', p.text).length })).filter(p => p.hits);
  assert.deepEqual(found.map(p => p.el.tagName), ['DETAILS']);
  assert.deepEqual(groupResults(root, found).groups.map(g => [g.label, g.level, g.hits, g.places]), [['Willkommen', 2, 1, 1]]);
});

test('collectPlaces: a code block is one place of the kind "' + KIND_CODE + '", its text with white space collapsed, every hit a range in it; inline code is text of its paragraph', () => {
  assert.equal(KIND_CODE, 'Code');
  const root = rootWith('<h2>Code-Block</h2>\n<p>Mit <code>renderMermaid</code> inline.</p>\n<pre><code class="language-javascript">function dokufix(md) {\n  const html = marked.parse(md);\n  return renderMermaidIn(html);\n}\n</code></pre>\n<pre>ohne   code</pre>\n');
  assert.deepEqual(collectPlaces(root).map(p => [p.el.tagName, p.text, p.kind]), [
    ['H2', 'Code-Block', undefined], ['P', 'Mit renderMermaid inline.', undefined],
    ['PRE', 'function dokufix(md) { const html = marked.parse(md); return renderMermaidIn(html); }', KIND_CODE],
    ['PRE', 'ohne code', KIND_CODE],
  ]);
  assert.deepEqual(codePlaces(root).filter(p => findHits('renderMermaidIn', p.text).length).map(p => p.el.tagName), ['PRE']);
  assert.deepEqual(hitTexts(root, 'renderMermaidIn'), [['renderMermaidIn']]);
  // Over a line break of the code, one range over the collapsed white space.
  assert.deepEqual(hitTexts(root, 'parse(md); return'), [['parse(md);\n  return']]);
});

test('collectPlaces: a code block in a list item is no text of the item, and a place of its own', () => {
  const root = rootWith('<ul>\n<li>Ein Punkt mit Code:<pre><code class="language-text">Quittung drucken\n</code></pre>\nund danach</li>\n<li>Noch einer</li>\n</ul>\n');
  assert.deepEqual(collectPlaces(root).map(p => [p.el.tagName, p.text, p.kind]),
    [['LI', 'Ein Punkt mit Code: und danach', undefined], ['PRE', 'Quittung drucken', KIND_CODE], ['LI', 'Noch einer', undefined]]);
  assert.deepEqual(hitTexts(root, 'Code: und'), [['Code:', 'und']]);
});

test('collectPlaces: a pre in a table cell is text of its row, as filterRowText() reads it, and no code block', () => {
  const root = rootWith('<table><tbody><tr><td>Befehl</td><td><pre><code>npm   run pruefung\n</code></pre></td></tr></tbody></table>\n');
  const row = root.querySelector('tr');
  assert.deepEqual(collectPlaces(root).map(p => [p.el.tagName, p.text, p.kind]), [['TR', 'Befehl npm run pruefung', KIND_ROW]]);
  assert.equal(collectPlaces(root)[0].text, filterRowText(row));
  assert.deepEqual(codePlaces(root), []);
});

test('collectPlaces: a diagram\'s fenced source, a warning\'s detail and the footer of an export are no code; a transient code block is none', () => {
  const root = diagramRoot([['bpmn', bpmnSvg(label('Abholbereit'))]], '<pre><code class="language-mermaid">flowchart LR\n  a[Stempeln] --> b</code></pre>\n<pre><code class="language-bpmn">&lt;bpmn:process isExecutable="false"/&gt;</code></pre>\n',
    '<footer class="dokufix-meta"><p>Exportiert: 2026-10-03</p><pre>Exportiert</pre></footer>\n<pre ' + TRANSIENT_ATTR + '>Stempeln</pre>\n');
  root.append(buildWarning(root.ownerDocument, 'Ein Diagramm konnte nicht gezeichnet werden.', 'Parse error: Stempeln'));
  assert.ok(root.querySelector('.dokufix-warning pre'), 'the warning holds its detail in a pre');
  assert.deepEqual(codePlaces(root), []);
  for (const word of ['Stempeln', 'isExecutable', 'Exportiert', 'Parse']) assert.deepEqual(collectPlaces(root).filter(p => findHits(word, p.text).length), [], word);
});

test('frontmatter.js knows nothing of the search, and search-places.js imports neither it nor DIAGRAM_KINDS', () => {
  assert.doesNotMatch(read('app/frontmatter.js'), /search(-places)?\.js|collectPlaces/);
  // search-places.js names the panel's classes and the diagrams' languages: importing frontmatter.js or DIAGRAM_KINDS would bring them into the reader bundle.
  assert.doesNotMatch(read('app/search-places.js'), /from '\.\/frontmatter\.js'|import \{[^}]*\bDIAGRAM_KINDS\b/);
});

// ---------- the results under their headings (story 4) ----------
// The groups of a search for term over the fragment, as plain data: level,
// label, the numbers of the branch, the text of each own result, the children.
function grouped(html, term){
  const root = rootWith(html);
  const found = collectPlaces(root).map(p => ({ el: p.el, text: p.text, hits: findHits(term, p.text).length })).filter(r => r.hits);
  const { groups, sections } = groupResults(root, found);
  const shape = g => ({ level: g.level, label: g.label, hits: g.hits, places: g.places, results: g.results.map(r => r.text), children: g.children.map(shape) });
  return { groups: groups.map(shape), sections };
}
const group = (level, label, hits, places, results, children = []) => ({ level, label, hits, places, results, children });

test('groupResults, two depths: the first H2 with its result; the second H2 as parent, without own results, with its H3; numbers per branch', () => {
  const html = '<h1>Titel</h1>\n<h2>Eins</h2>\n<p>Eine Tabelle.</p>\n<h2>Zwei</h2>\n<p>Nichts hier.</p>\n<h3>Drei</h3>\n<p>Tabelle und Tabelle.</p>\n<ul>\n<li>Noch eine Tabelle</li>\n</ul>\n<h3>Vier</h3>\n<p>Leer.</p>\n<h2>Fünf</h2>\n';
  assert.deepEqual(grouped(html, 'Tabelle'), {
    groups: [
      group(2, 'Eins', 1, 1, ['Eine Tabelle.']),
      group(2, 'Zwei', 3, 2, [], [group(3, 'Drei', 3, 2, ['Tabelle und Tabelle.', 'Noch eine Tabelle'])]),
    ],
    sections: 2,
  });
});

test('groupResults, before the first H2: a group of its own, first, at the level of an H2, labelled with the H1', () => {
  const html = '<h1>Willkommen</h1>\n<p>Eine Tabelle vorab.</p>\n<h2>Teil</h2>\n<p>Die Tabelle im Teil.</p>\n';
  assert.deepEqual(grouped(html, 'Tabelle'), {
    groups: [group(2, 'Willkommen', 1, 1, ['Eine Tabelle vorab.']), group(2, 'Teil', 1, 1, ['Die Tabelle im Teil.'])],
    sections: 2,
  });
  // The H1 that holds the term is a result of that group.
  assert.deepEqual(grouped('<h1>Tabellen</h1>\n<p>Text.</p>\n<h2>Teil</h2>\n', 'Tabelle').groups, [group(2, 'Tabellen', 1, 1, ['Tabellen'])]);
});

test('groupResults, no H1: the first group is "' + FIRST_GROUP_LABEL + '"', () => {
  assert.equal(FIRST_GROUP_LABEL, 'Am Anfang');
  assert.deepEqual(grouped('<p>Eine Tabelle vorab.</p>\n<h2>Teil</h2>\n<p>Tabelle.</p>\n', 'Tabelle').groups,
    [group(2, 'Am Anfang', 1, 1, ['Eine Tabelle vorab.']), group(2, 'Teil', 1, 1, ['Tabelle.'])]);
  // An H1 after the first H2 labels nothing; an H1 without text neither.
  assert.equal(grouped('<p>Tabelle.</p>\n<h2>Teil</h2>\n<h1>Spät</h1>\n', 'Tabelle').groups[0].label, 'Am Anfang');
  assert.equal(grouped('<h1><img src="x.png" alt=""></h1>\n<p>Tabelle.</p>\n', 'Tabelle').groups[0].label, 'Am Anfang');
});

test('groupResults, the heading holds the term: the heading is a result in its own group', () => {
  assert.deepEqual(grouped('<h2>Einleitung</h2>\n<p>Text.</p>\n<h2>Status-Chips</h2>\n<p>Ein Status.</p>\n', 'Status'),
    { groups: [group(2, 'Status-Chips', 2, 2, ['Status-Chips', 'Ein Status.'])], sections: 1 });
});

test('groupResults, H5 and H6: a result under them is in the H4 group above, and so are the headings', () => {
  const html = '<h2>A</h2>\n<h3>B</h3>\n<h4>C</h4>\n<h5>D</h5>\n<p>Eine Tabelle.</p>\n<h6>Tabelle sechs</h6>\n<p>Und Tabelle.</p>\n';
  assert.deepEqual(grouped(html, 'Tabelle'), {
    groups: [group(2, 'A', 3, 3, [], [group(3, 'B', 3, 3, [], [group(4, 'C', 3, 3, ['Eine Tabelle.', 'Tabelle sechs', 'Und Tabelle.'])])])],
    sections: 1,
  });
});

test('groupResults, a callout\'s heading: a result of the group the callout stands in, no group of its own', () => {
  const html = '<h2>Hinweise</h2>\n<div class="dokufix-callout dokufix-callout-note" role="note"><p class="dokufix-callout-label">Hinweis</p>\n<h3>Tabelle im Hinweis</h3>\n<p>Text.</p>\n</div>\n<p>Danach eine Tabelle.</p>\n';
  assert.deepEqual(grouped(html, 'Tabelle'),
    { groups: [group(2, 'Hinweise', 2, 2, ['Tabelle im Hinweis', 'Danach eine Tabelle.'])], sections: 1 });
});

test('groupResults, no heading at all: one group "Am Anfang", one section', () => {
  assert.deepEqual(grouped('<p>Eine Tabelle.</p>\n<p>Noch eine Tabelle.</p>\n', 'Tabelle'),
    { groups: [group(2, 'Am Anfang', 2, 2, ['Eine Tabelle.', 'Noch eine Tabelle.'])], sections: 1 });
});

test('groupResults: an H3 or H4 before the first H2 is a child of the first group; an H4 right under an H2 its child', () => {
  const html = '<h1>Titel</h1>\n<h3>Vorab</h3>\n<p>Tabelle.</p>\n<h2>Teil</h2>\n<h4>Tief</h4>\n<p>Tabelle.</p>\n';
  assert.deepEqual(grouped(html, 'Tabelle').groups, [
    group(2, 'Titel', 1, 1, [], [group(3, 'Vorab', 1, 1, ['Tabelle.'])]),
    group(2, 'Teil', 1, 1, [], [group(4, 'Tief', 1, 1, ['Tabelle.'])]),
  ]);
});

test('groupResults: a group heading is labelled as the rail labels it, without footnote, chip word or line break', () => {
  const root = rootWith('<h2>Frist<sup class="dokufix-fn-host"><a href="#f" data-footnote-ref="">1</a><span class="dokufix-fn-preview">Fußnote.</span></sup> und<br>Ende</h2>\n' +
    '<h3>Bestellung:<code>🟢 Live</code></h3>\n<p>Eine Tabelle.</p>\n');
  buildChips(root);
  const found = collectPlaces(root).filter(p => findHits('Tabelle', p.text).length).map(p => ({ el: p.el, hits: 1 }));
  const [a] = groupResults(root, found).groups;
  assert.deepEqual([a.label, a.children[0].label], ['Frist und Ende', 'Bestellung: Live']);
});

test('groupResults: it goes by the order of the document alone, so any element can be a result, and changes nothing', () => {
  const root = rootWith('<h2>A</h2>\n<p>Text.</p>\n<h3>B</h3>\n<table><tbody><tr><td>Zelle</td></tr></tbody></table>\n<pre><code>Code</code></pre>\n<h2>C</h2>\n');
  const before = root.outerHTML;
  const td = root.querySelector('td'), pre = root.querySelector('pre');
  const { groups, sections } = groupResults(root, [{ el: td, hits: 2 }, { el: pre, hits: 1 }]);
  assert.equal(sections, 1);
  assert.deepEqual(groups.map(g => [g.label, g.hits, g.places, g.children.map(c => [c.label, c.results.map(r => r.el)])]), [['A', 3, 2, [['B', [td, pre]]]]]);
  assert.equal(root.outerHTML, before);
  assert.deepEqual(groupResults(root, []), { groups: [], sections: 0 });
});

test('groupResults: the group headings are those of the rail, H2 to H4 of documentHeadings(); the source says so', () => {
  assert.match(read('app/rail.js'), /documentHeadings\(root\)\)\.filter\(h => \/\^H\[234\]\$\/\.test\(h\.tagName\)\)/);
  assert.match(read('app/search-places.js'), /const GROUP_TAG = \/\^H\[234\]\$\/;/);
});

// ---------- the sources ----------
test('the panel makes its elements with createElement and textContent: no innerHTML, no insertAdjacentHTML in the search', () => {
  for (const name of ['app/search.js', 'app/search-match.js', 'app/search-places.js']){
    assert.doesNotMatch(read(name), /innerHTML|outerHTML|insertAdjacentHTML/, name);
  }
});

test('the panel takes its root and its read mode from its caller: it imports none of the page\'s elements', () => {
  assert.doesNotMatch(read('app/search.js'), /from '\.\/(dom|rail|persistence|editor|render)\.js'|getElementById|mode-view/);
});

test('the match and the places are pure: neither imports the page\'s elements', () => {
  for (const name of ['app/search-match.js', 'app/search-places.js']){
    assert.doesNotMatch(read(name), /from '\.\/(dom|rail|persistence|editor)\.js'|\bdocument\.[a-zA-Z]|\bwindow\.[a-zA-Z]/, name);
  }
});

test('the reader bundle registers the search over its content container, always in read mode; render.js and filter.js know nothing of the search', () => {
  assert.match(read('reader.js'), /registerSearch\(\{ root, inReadMode: \(\) => true \}\)/);
  assert.doesNotMatch(read('app/render.js'), /search(-match|-places)?\.js|collectPlaces|findHits|Search/);
  // The search reads the filter's classes, the filter knows nothing of the search.
  assert.doesNotMatch(read('app/filter.js'), /search(-places)?\.js|collectPlaces|registerSearch/);
});

// ---------- run time (story 5.16, N5) ----------
test('groupResults walks into no diagram, code block or metadata panel: none holds a group heading', () => {
  const root = rootWith('<h2>A</h2>\n<figure class="dokufix-diagram"><div class="dokufix-diagram-svg"><svg><g><text>Tabelle</text></g></svg></div></figure>\n' +
    '<pre><code><span>Tabelle</span></code></pre>\n<details class="dokufix-frontmatter"><summary>Metadaten</summary><dl><dt>a</dt><dd>Tabelle</dd></dl></details>\n<h2>B</h2>\n<p>Tabelle.</p>\n');
  const walked = [];
  for (const el of root.querySelectorAll('figure *, pre *, details *')){
    const first = el.firstElementChild;
    Object.defineProperty(el, 'firstElementChild', { configurable: true, get: () => { walked.push(el.tagName); return first; } });
  }
  const found = collectPlaces(root).map(p => ({ el: p.el, hits: findHits('Tabelle', p.text).length })).filter(p => p.hits);
  walked.length = 0;
  const { groups } = groupResults(root, found);
  assert.deepEqual(groups.map(g => [g.label, g.hits, g.results.map(r => r.el.tagName)]), [['A', 3, ['FIGURE', 'PRE', 'DETAILS']], ['B', 1, ['P']]]);
  assert.deepEqual(walked, []);
});

test('findHits lowers a text whose length lowering does not change as a whole, not one character at a time', () => {
  const lower = String.prototype.toLocaleLowerCase;
  let calls = 0;
  String.prototype.toLocaleLowerCase = function(...a){ calls++; return lower.apply(this, a); };
  try {
    const text = 'Der Zitronenfalter fliegt früh im Jahr. '.repeat(50);
    assert.equal(findHits('zitronenfalter', text).length, 50);
    assert.ok(calls <= 4, calls + ' calls');
  } finally {
    String.prototype.toLocaleLowerCase = lower;
  }
});

test('findHits: what lowering a whole text would change is lowered one character at a time, as before: the capital sigma, a longer lowered form, a character outside the BMP', () => {
  // Lowered whole, "ΟΔΟΣ" would end in the final sigma "ς"; one at a time it is "σ", and stays so.
  assert.equal('ΟΔΟΣ'.toLocaleLowerCase('de'), 'οδος');
  assert.deepEqual(findHits('οδοσ', 'Die ΟΔΟΣ hier'), [{ start: 4, end: 8 }]);
  assert.deepEqual(findHits('οδος', 'Die ΟΔΟΣ hier'), []);
  assert.deepEqual(findHits('ΟΔΟΣ', 'die οδοσ'), [{ start: 4, end: 8 }]);
  // "İ" lowers to two units: the hits behind it keep the ranges of the original text.
  assert.deepEqual(findHits('tabelle', 'İ Tabelle'), [{ start: 2, end: 9 }]);
  // A surrogate pair, lowered whole: a hit behind it and one over it.
  assert.deepEqual(findHits('tabelle', '𝔄 Tabelle 🚧'), [{ start: 3, end: 10 }]);
  assert.deepEqual(findHits('🚧 tab', 'x 🚧 Tabelle'), [{ start: 2, end: 8 }]);
  assert.deepEqual(findHits('𐐨', 'a 𐐀 b'), [{ start: 2, end: 4 }]);
  // Case-sensitive, and light fuzzy, as they were.
  assert.deepEqual(findHits('Tabelle', 'tabelle Tabelle', { caseSensitive: true }), [{ start: 8, end: 15 }]);
  assert.deepEqual(findHits('statuschip', 'ein Status-Chip.', { fuzzy: true }), [{ start: 4, end: 15 }]);
});

// ---------- raw HTML (story 5.16, N1) ----------
test('collectPlaces: text directly in a block that is no place, a div, a dt and a dd, a summary, a figcaption, a bare blockquote, makes it a place of its own, read as a paragraph; an image\'s alt is no text', () => {
  const html = '<div>Zitronenfalter im <em>div</em></div>\n<dl>\n<dt>Zitronenfalter</dt>\n<dd>Ein Falter, gelb</dd>\n</dl>\n' +
    '<details><summary>Mehr zum Zitronenfalter</summary>\n<p>Ein Absatz im details.</p>\n</details>\n<blockquote>Zitronenfalter, zitiert</blockquote>\n' +
    '<figure><img src="x.png" alt="Zitronenfalter im Bild"><figcaption>Ein Zitronenfalter</figcaption></figure>\n<p>Ein Absatz.</p>\n';
  assert.deepEqual(places(html), [['div', 'Zitronenfalter im div'], ['dt', 'Zitronenfalter'], ['dd', 'Ein Falter, gelb'], ['summary', 'Mehr zum Zitronenfalter'],
    ['p', 'Ein Absatz im details.'], ['blockquote', 'Zitronenfalter, zitiert'], ['figcaption', 'Ein Zitronenfalter'], ['p', 'Ein Absatz.']]);
  // Its hits are ranges of the document like any other.
  assert.deepEqual(hitTexts(rootWith(html), 'Zitronenfalter im div'), [['Zitronenfalter im div']]);
});

test('collectPlaces: such a block is read without the places, lists and tables in it, which are places of their own; a block in it is text of it; one in a place is text of the place', () => {
  const html = '<div>Davor\n<p>Ein Absatz</p>\ndanach <span>und</span>\n<div>innen</div>\n<ul><li>Punkt</li></ul>\n</div>\n' +
    '<ul><li>Ein Punkt mit <div>Block</div></li></ul>\n<blockquote>\n<p>Ein Zitat</p>\n</blockquote>\n<div><strong>Nur fett</strong></div>\n';
  assert.deepEqual(places(html), [['div', 'Davor danach und innen'], ['p', 'Ein Absatz'], ['li', 'Punkt'], ['li', 'Ein Punkt mit Block'], ['p', 'Ein Zitat'], ['strong', 'Nur fett']]);
});

test('collectPlaces: no block of the page\'s own is a place for its text: the field of a table filter with its counter, a warning, the inline table of contents, a callout, a facet group, a table\'s wrapper, a transient element', () => {
  const html = '<div class="dokufix-filter" ' + TRANSIENT_ATTR + '><input type="search" class="dokufix-filter-input"><span class="dokufix-filter-count" role="status">2 Zeilen</span></div>\n' +
    '<div class="dokufix-table"><table><tbody><tr><td>Zeile</td></tr></tbody></table></div>\n' +
    '<div class="dokufix-warning" role="note">Warnung direkt<p>Text</p></div>\n' +
    '<nav class="dokufix-toc">Inhalt<ol><li><a href="#a">A</a></li></ol></nav>\n' +
    '<div class="dokufix-callout dokufix-callout-note" role="note"><p class="dokufix-callout-label">Hinweis</p>\n<p>Im Hinweis.</p>\n</div>\n' +
    '<div class="dokufix-facets"><fieldset class="dokufix-facet-bar"><legend>Art</legend>Alle</fieldset><div class="dokufix-table"><table><tbody><tr><td>Wert</td></tr></tbody></table></div></div>\n' +
    '<div ' + TRANSIENT_ATTR + '>Flüchtig</div>\n<section class="footnotes"><h2>Fußnoten</h2>\n<ol><li id="fn-1">Fußnote <a href="#r" data-footnote-backref="">↩</a></li></ol></section>\n';
  assert.deepEqual(places(html), [['tr', 'Zeile'], ['p', 'Hinweis'], ['p', 'Im Hinweis.'], ['tr', 'Wert'], ['li', 'Fußnote']]);
});
