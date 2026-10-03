// Block markers with cards and step lists, run in Node: no browser, no page.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/markers.js, cards.js and steps.js are modules of pure logic, so this
// file imports them as they are and hands the pass a fragment that linkedom
// parses; linkedom keeps a comment as a node, as a browser does. The markup of
// every case is what marked 18.0.14 emits for the Markdown named beside it,
// measured in Chromium with { gfm: true, breaks: false } as render() calls it;
// marked itself comes from the CDN and is not installed here. The cases are
// the matrix of the story: what a marker reads as, what cards and steps do to
// their list, which marker becomes a warning and with which words, and what is
// no marker at all.
//
// The third marker, "facets", has its cases in tests/facets.test.mjs, the
// fourth, "filter", in tests/filter.test.mjs. Here they stand in the list,
// and the cases on what a component may answer, a refusal with its reason,
// are driven with a list of their own.
//
// The last cases read src/doc.css, src/app/render.js and the built file: both
// components have their rules in the document styles, and the pass has its
// place in the list.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { MARKERS, BLOCKS, readMarker, judgeMarker, refusedMarker, applyMarkerList, applyMarkers } from '../src/app/markers.js';
import { CARDS, CARDS_CLASS, CARD_TITLE_CLASS, buildCards } from '../src/app/cards.js';
import { STEPS, STEPS_CLASS, STEP_NUMBER_CLASS, STEP_ACTOR_CLASS, buildSteps } from '../src/app/steps.js';
import { FACETS, buildFacets } from '../src/app/facets.js';
import { FILTER, markFilter } from '../src/app/filter.js';
import { buildWarning } from '../src/app/warning.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// A root like the preview, holding the given markup.
function rootWith(html){
  const { document } = parseHTML('<!DOCTYPE html><html><body><article id="root" class="dokufix-doc">' + html + '</article></body></html>');
  return document.getElementById('root');
}
// The pass over the markup; returns the root.
function passOver(html){
  const root = rootWith(html);
  applyMarkers(root);
  return root;
}
// Runs fn with console.error collected instead of printed.
function quiet(t, fn){
  const logged = t.mock.method(console, 'error', () => {});
  const result = fn();
  return { result, logged: logged.mock.calls.map(c => c.arguments) };
}
// A warning as buildWarning() writes it and linkedom serialises it; what it
// is made of is a case of its own below.
const warningHtml = (text, detail) => buildWarning(rootWith('').ownerDocument, text, detail).outerHTML;
const warnings = root => Array.from(root.querySelectorAll('.dokufix-warning')).map(w => w.textContent);
// Every comment under the root, by its text.
function comments(root){
  const out = [];
  const walk = node => { for (const child of node.childNodes){ if (child.nodeType === 8) out.push(child.data); else if (child.nodeType === 1) walk(child); } };
  walk(root);
  return out;
}

// The words of the warnings, written out here a second time on purpose: a
// reader sees them, so a change to them is a change this file has to be told.
const KNOWN = 'Bekannt sind: cards, steps, facets, filter.';
const W = {
  unknown: written => 'Unbekannte Markierung „' + written + '“. ' + KNOWN,
  noName: written => 'Die Markierung „' + written + '“ nennt keine Komponente. ' + KNOWN,
  argument: written => 'Die Markierung „' + written + '“ nimmt keine Angabe hinter ihrem Namen.',
  list: written => 'Die Markierung „' + written + '“ erwartet direkt danach eine Aufzählung.',
  numbered: written => 'Die Markierung „' + written + '“ erwartet direkt danach eine nummerierte Liste.',
  twice: written => 'Die Markierung „' + written + '“ steht mehr als einmal vor demselben Block.',
};

// ---------- reading a marker ----------
test('readMarker: name, argument and the marker as written', () => {
  assert.deepEqual(readMarker(' dokufix: cards '), { written: 'dokufix: cards', name: 'cards', argument: '', quoted: false });
  assert.deepEqual(readMarker('dokufix:steps'), { written: 'dokufix:steps', name: 'steps', argument: '', quoted: false });
  assert.deepEqual(readMarker(' dokufix: facets Standort '), { written: 'dokufix: facets Standort', name: 'facets', argument: 'Standort', quoted: false });
  assert.deepEqual(readMarker(' dokufix: side-note wichtig '), { written: 'dokufix: side-note wichtig', name: 'side-note', argument: 'wichtig', quoted: false });
  assert.deepEqual(readMarker(' dokufix: facets Entgelt je Woche '), { written: 'dokufix: facets Entgelt je Woche', name: 'facets', argument: 'Entgelt je Woche', quoted: false });
});
test('readMarker: an argument in double quotes is read without them', () => {
  assert.deepEqual(readMarker(' dokufix: filter "Spalte A" '), { written: 'dokufix: filter "Spalte A"', name: 'filter', argument: 'Spalte A', quoted: true });
  // Blanks inside the quotes belong to the argument; an empty pair is an argument too.
  assert.deepEqual(readMarker('dokufix: filter " a "'), { written: 'dokufix: filter " a "', name: 'filter', argument: ' a ', quoted: true });
  assert.deepEqual(readMarker('dokufix: cards ""'), { written: 'dokufix: cards ""', name: 'cards', argument: '', quoted: true });
  // One quote alone is text.
  assert.deepEqual(readMarker('dokufix: filter "Spalte'), { written: 'dokufix: filter "Spalte', name: 'filter', argument: '"Spalte', quoted: false });
});
test('readMarker: "dokufix:" and the name in any case, the name handed on in small letters', () => {
  assert.equal(readMarker(' DOKUFIX: Cards ').name, 'cards');
  assert.equal(readMarker(' Dokufix: STEPS ').name, 'steps');
  assert.equal(readMarker(' DOKUFIX: Cards ').written, 'DOKUFIX: Cards');
});
test('readMarker: a comment over several lines is one marker, named on one line', () => {
  // <!--
  //   dokufix: cards
  // -->
  assert.deepEqual(readMarker('\n  dokufix: cards\n'), { written: 'dokufix: cards', name: 'cards', argument: '', quoted: false });
  assert.equal(readMarker('\n dokufix:   facets\n   Standort\n').written, 'dokufix: facets Standort');
});
test('readMarker: no name that can be read gives the name ""', () => {
  for (const text of [' dokufix: ', 'dokufix:', ' dokufix: "cards" ', ' dokufix: 123 ', ' dokufix: cards,steps ', ' dokufix: -cards ', ' dokufix: __proto__ ', ' dokufix: cärds ']){
    const marker = readMarker(text);
    assert.ok(marker, JSON.stringify(text) + ' is a marker');
    assert.equal(marker.name, '', JSON.stringify(text));
    assert.equal(marker.argument, '', JSON.stringify(text));
    assert.equal(marker.written, text.trim(), JSON.stringify(text));
  }
});
test('readMarker: a comment that does not start with "dokufix:" is no marker', () => {
  for (const text of ['', ' Notiz ', ' dokufix ', ' dokufix cards ', ' dokufix : cards ', ' Hinweis: dokufix: cards ', ' cards ', ' x dokufix: cards ']){
    assert.equal(readMarker(text), null, JSON.stringify(text));
  }
});
test('readMarker: a long marker is named with its first 80 characters', () => {
  const marker = readMarker(' dokufix: cards ' + 'x'.repeat(200) + ' ');
  assert.equal(marker.written.length, 81);
  assert.ok(marker.written.endsWith('x…'));
  assert.equal(marker.argument.length, 200, 'the argument is not cut');
});

// ---------- the list ----------
test('the list of markers: cards before a bullet list, steps before a numbered list, neither takes an argument; facets and filter before a table, with the column and the placeholder as their argument', () => {
  assert.deepEqual(MARKERS.map(m => [m.name, m.block, m.argument]), [['cards', 'UL', 'none'], ['steps', 'OL', 'none'], ['facets', 'TABLE', 'text'], ['filter', 'TABLE', 'text']]);
  assert.ok(MARKERS[0] === CARDS && MARKERS[1] === STEPS && MARKERS[2] === FACETS && MARKERS[3] === FILTER, 'the entries are the ones the components export');
  assert.ok(MARKERS[0].apply === buildCards && MARKERS[1].apply === buildSteps && MARKERS[2].apply === buildFacets && MARKERS[3].apply === markFilter);
  assert.deepEqual(BLOCKS, { UL: 'eine Aufzählung', OL: 'eine nummerierte Liste', TABLE: 'eine Tabelle' });
});
test('every entry of the list is complete: a name in small letters, a block a warning has a word for, how its argument is read, what it does', () => {
  const names = new Set();
  for (const entry of MARKERS){
    assert.match(entry.name, /^[a-z][a-z0-9-]*$/, entry.name);
    assert.ok(!names.has(entry.name), entry.name + ' stands in the list once');
    names.add(entry.name);
    assert.ok(typeof BLOCKS[entry.block] === 'string' && BLOCKS[entry.block], entry.name + ': BLOCKS names ' + entry.block);
    assert.ok(['none', 'text'].includes(entry.argument), entry.name + ': argument ' + entry.argument);
    assert.equal(typeof entry.apply, 'function', entry.name);
    // What an author writes reads back as this entry.
    assert.equal(readMarker(' dokufix: ' + entry.name + ' ').name, entry.name);
  }
});
test('judgeMarker: the entry when the marker can act, otherwise the text of its warning', () => {
  assert.ok(judgeMarker(readMarker('dokufix: cards'), 'UL').entry === CARDS);
  assert.ok(judgeMarker(readMarker('dokufix: steps'), 'OL').entry === STEPS);
  assert.deepEqual(judgeMarker(readMarker('dokufix: cards'), 'OL'), { warning: W.list('dokufix: cards') });
  assert.deepEqual(judgeMarker(readMarker('dokufix: cards'), ''), { warning: W.list('dokufix: cards') });
  assert.deepEqual(judgeMarker(readMarker('dokufix: steps'), 'UL'), { warning: W.numbered('dokufix: steps') });
  assert.deepEqual(judgeMarker(readMarker('dokufix: crads'), 'UL'), { warning: W.unknown('dokufix: crads') });
  assert.deepEqual(judgeMarker(readMarker('dokufix:'), 'UL'), { warning: W.noName('dokufix:') });
  assert.deepEqual(judgeMarker(readMarker('dokufix: cards zwei'), 'UL'), { warning: W.argument('dokufix: cards zwei') });
  assert.deepEqual(judgeMarker(readMarker('dokufix: cards ""'), 'UL'), { warning: W.argument('dokufix: cards ""') });
});

// ---------- cards ----------
test('cards: the marker before a bullet list makes each item a card; the comment is gone', () => {
  // <!-- dokufix: cards -->
  // - **Titel A** Text a
  // - **Titel B**
  //   Text b
  // - ohne Titel
  const root = passOver('<!-- dokufix: cards -->\n<ul>\n<li><strong>Titel A</strong> Text a</li>\n<li><strong>Titel B</strong>\nText b</li>\n<li>ohne Titel</li>\n</ul>\n');
  assert.equal(root.innerHTML,
    '<ul class="dokufix-cards">\n<li><strong class="dokufix-card-title">Titel A</strong> Text a</li>\n' +
    '<li><strong class="dokufix-card-title">Titel B</strong>\nText b</li>\n<li>ohne Titel</li>\n</ul>\n');
  assert.deepEqual(comments(root), []);
  assert.deepEqual(warnings(root), []);
  assert.equal(CARDS_CLASS, 'dokufix-cards');
  assert.equal(CARD_TITLE_CLASS, 'dokufix-card-title');
});
test('cards: the title is the bold text an item starts with, also in a list with blank lines between its items', () => {
  // <!-- dokufix: cards -->
  // - **Titel A** Text a
  //
  // - **Titel B**
  //
  //   Zweiter Absatz
  const root = passOver('<!-- dokufix: cards -->\n<ul>\n<li><p><strong>Titel A</strong> Text a</p>\n</li>\n<li><p><strong>Titel B</strong></p>\n<p>Zweiter Absatz</p>\n</li>\n</ul>\n');
  assert.equal(root.innerHTML,
    '<ul class="dokufix-cards">\n<li><p><strong class="dokufix-card-title">Titel A</strong> Text a</p>\n</li>\n' +
    '<li><p><strong class="dokufix-card-title">Titel B</strong></p>\n<p>Zweiter Absatz</p>\n</li>\n</ul>\n');
});
test('cards: bold text elsewhere in an item is no title', () => {
  // <!-- dokufix: cards -->
  // - Vorab **fett** mittendrin
  // - **Titel**
  const root = passOver('<!-- dokufix: cards -->\n<ul>\n<li>Vorab <strong>fett</strong> mittendrin</li>\n<li><strong>Titel</strong></li>\n</ul>\n');
  assert.equal(root.innerHTML, '<ul class="dokufix-cards">\n<li>Vorab <strong>fett</strong> mittendrin</li>\n<li><strong class="dokufix-card-title">Titel</strong></li>\n</ul>\n');
  // In a list with blank lines: bold text in the second paragraph of an item.
  const loose = passOver('<!-- dokufix: cards -->\n<ul>\n<li><p>Vorab</p>\n<p><strong>fett</strong></p>\n</li>\n<li><p>zwei</p>\n</li>\n</ul>\n');
  assert.equal(loose.querySelectorAll('.' + CARD_TITLE_CLASS).length, 0);
  assert.equal(loose.querySelectorAll('ul.' + CARDS_CLASS + ' > li').length, 2);
});
test('cards: a hard break behind the title goes, the title is a line of its own', () => {
  // - **Titel**␣␣      - **Titel**\      - **Titel**<br>Text
  //   Text               Text
  const root = passOver('<!-- dokufix: cards -->\n<ul>\n<li><strong>Titel</strong><br>Text</li>\n<li><strong>Titel</strong><br>Text</li>\n<li><strong>Titel</strong><br>Text</li>\n</ul>\n');
  assert.equal(root.querySelectorAll('br').length, 0);
  assert.equal(root.querySelector('li').innerHTML, '<strong class="dokufix-card-title">Titel</strong>Text');
  // A break further on stays.
  const later = passOver('<!-- dokufix: cards -->\n<ul>\n<li><strong>Titel</strong> Text<br>mehr</li>\n</ul>\n');
  assert.equal(later.querySelectorAll('br').length, 1);
});
test('cards: a colon directly behind the title goes, with the blanks around it', () => {
  // - **Titel**: Text     - **Titel** : Text     - **Titel**:Text     - **Titel**:
  const root = passOver('<!-- dokufix: cards -->\n<ul>\n<li><strong>Titel</strong>: Text</li>\n<li><strong>Titel</strong> : Text</li>\n<li><strong>Titel</strong>:Text</li>\n<li><strong>Titel</strong>:</li>\n</ul>\n');
  assert.deepEqual(Array.from(root.querySelectorAll('li')).map(li => li.innerHTML), [
    '<strong class="dokufix-card-title">Titel</strong>Text',
    '<strong class="dokufix-card-title">Titel</strong>Text',
    '<strong class="dokufix-card-title">Titel</strong>Text',
    '<strong class="dokufix-card-title">Titel</strong>',
  ]);
  // In a list with blank lines between its items, and with a hard break behind the colon.
  // - **Titel**: Text          - **Titel**:␣␣
  //                              Text
  const loose = passOver('<!-- dokufix: cards -->\n<ul>\n<li><p><strong>Titel</strong>: Text</p>\n</li>\n<li><p><strong>Titel</strong>:<br>Text</p>\n</li>\n</ul>\n');
  assert.deepEqual(Array.from(loose.querySelectorAll('li > p')).map(p => p.innerHTML), [
    '<strong class="dokufix-card-title">Titel</strong>Text',
    '<strong class="dokufix-card-title">Titel</strong>Text',
  ]);
  // A colon further on stays, and so does one inside the bold text or behind bold text that is no title.
  const kept = passOver('<!-- dokufix: cards -->\n<ul>\n<li><strong>Titel</strong> Text: mehr</li>\n<li><strong>Titel:</strong> Text</li>\n<li>Vorab <strong>fett</strong>: Text</li>\n</ul>\n');
  assert.deepEqual(Array.from(kept.querySelectorAll('li')).map(li => li.innerHTML), [
    '<strong class="dokufix-card-title">Titel</strong> Text: mehr',
    '<strong class="dokufix-card-title">Titel:</strong> Text',
    'Vorab <strong>fett</strong>: Text',
  ]);
});
test('cards: what else an item may start with is no title; a nested list is no list of cards', () => {
  // - ***Titel*** a   - *kursiv* a   - [**Link**](…) a   - **[Link](…)** a   - [ ] offen
  const root = passOver('<!-- dokufix: cards -->\n<ul>\n<li><em><strong>Titel</strong></em> a</li>\n<li><em>kursiv</em> a</li>\n' +
    '<li><a href="https://example.org"><strong>Link</strong></a> a</li>\n<li><strong><a href="https://example.org">Link</a></strong> a</li>\n' +
    '<li><input disabled="" type="checkbox"> offen</li>\n</ul>\n');
  const titles = Array.from(root.querySelectorAll('.' + CARD_TITLE_CLASS));
  assert.deepEqual(titles.map(t => t.outerHTML), ['<strong class="dokufix-card-title"><a href="https://example.org">Link</a></strong>']);
  // - **A** Text
  //   - unter a
  // - **B**
  const nested = passOver('<!-- dokufix: cards -->\n<ul>\n<li><strong>A</strong> Text<ul>\n<li><strong>unter a</strong></li>\n</ul>\n</li>\n<li><strong>B</strong></li>\n</ul>\n');
  assert.equal(nested.querySelectorAll('ul.' + CARDS_CLASS).length, 1);
  assert.deepEqual(Array.from(nested.querySelectorAll('.' + CARD_TITLE_CLASS)).map(t => t.textContent), ['A', 'B']);
  assert.equal(nested.querySelector('ul ul').attributes.length, 0);
});

// ---------- steps ----------
test('steps: the marker before a numbered list writes the number of each item into it; the comment is gone', () => {
  // <!-- dokufix: steps -->
  // 1. Erster
  // 2. Zweiter
  const root = passOver('<!-- dokufix: steps -->\n<ol>\n<li>Erster</li>\n<li>Zweiter</li>\n</ol>\n');
  assert.equal(root.innerHTML,
    '<ol class="dokufix-steps">\n<li><span class="dokufix-step-number">1</span>Erster</li>\n<li><span class="dokufix-step-number">2</span>Zweiter</li>\n</ol>\n');
  assert.deepEqual(comments(root), []);
  assert.deepEqual(warnings(root), []);
  assert.equal(STEPS_CLASS, 'dokufix-steps');
  assert.equal(STEP_NUMBER_CLASS, 'dokufix-step-number');
  // No inline style, nowhere.
  assert.equal(root.querySelectorAll('[style]').length, 0);
});
test('steps: a list that begins with 3 counts from 3, and one that begins with 0 from 0', () => {
  // <!-- dokufix: steps -->
  // 3. Dritter
  // 4. Vierter
  const root = passOver('<!-- dokufix: steps -->\n<ol start="3">\n<li>Dritter</li>\n<li>Vierter</li>\n</ol>\n');
  assert.deepEqual(Array.from(root.querySelectorAll('.' + STEP_NUMBER_CLASS)).map(n => n.textContent), ['3', '4']);
  // The list keeps its start value: that is what a browser hands to assistive technology.
  assert.equal(root.querySelector('ol').getAttribute('start'), '3');
  assert.equal(root.querySelectorAll('[style]').length, 0);
  const zero = passOver('<!-- dokufix: steps -->\n<ol start="0">\n<li>null</li>\n<li>eins</li>\n</ol>\n');
  assert.deepEqual(Array.from(zero.querySelectorAll('.' + STEP_NUMBER_CLASS)).map(n => n.textContent), ['0', '1']);
});
test('steps: Markdown numbers that jump do not: marked emits a start value and nothing else', () => {
  // 1. a   1. b   5. c
  const root = passOver('<!-- dokufix: steps -->\n<ol>\n<li>a</li>\n<li>b</li>\n<li>c</li>\n</ol>\n');
  assert.deepEqual(Array.from(root.querySelectorAll('.' + STEP_NUMBER_CLASS)).map(n => n.textContent), ['1', '2', '3']);
});
test('steps: a value attribute of an item, written as HTML, sets the number as a browser does', () => {
  const root = passOver('<!-- dokufix: steps -->\n<ol start="2">\n<li>a</li>\n<li value="7">b</li>\n<li>c</li>\n<li value="x">d</li>\n</ol>\n');
  assert.deepEqual(Array.from(root.querySelectorAll('.' + STEP_NUMBER_CLASS)).map(n => n.textContent), ['2', '7', '8', '9']);
});
test('steps: an item that starts with emphasised text ending in a colon names its actor; the colon goes', () => {
  // <!-- dokufix: steps -->
  // 1. *Website:* Formular absenden
  // 2. _Vertrieb:_ anrufen
  const root = passOver('<!-- dokufix: steps -->\n<ol>\n<li><em>Website:</em> Formular absenden</li>\n<li><em>Vertrieb:</em> anrufen</li>\n</ol>\n');
  assert.equal(root.innerHTML,
    '<ol class="dokufix-steps">\n<li><span class="dokufix-step-number">1</span><em class="dokufix-step-actor">Website</em> Formular absenden</li>\n' +
    '<li><span class="dokufix-step-number">2</span><em class="dokufix-step-actor">Vertrieb</em> anrufen</li>\n</ol>\n');
  assert.equal(STEP_ACTOR_CLASS, 'dokufix-step-actor');
});
test('steps: the actor in a list with blank lines between its items', () => {
  // 1. *Website:* Formular
  //
  // 2. Zweiter
  const root = passOver('<!-- dokufix: steps -->\n<ol>\n<li><p><em>Website:</em> Formular</p>\n</li>\n<li><p>Zweiter</p>\n</li>\n</ol>\n');
  assert.equal(root.innerHTML,
    '<ol class="dokufix-steps">\n<li><span class="dokufix-step-number">1</span><p><em class="dokufix-step-actor">Website</em> Formular</p>\n</li>\n' +
    '<li><span class="dokufix-step-number">2</span><p>Zweiter</p>\n</li>\n</ol>\n');
});
test('steps: emphasis without a colon is no actor and stays as it is', () => {
  // 1. *Nie* ohne Backup starten.
  // 2. *CRM*: der Doppelpunkt steht ausserhalb
  // 3. Text *Website:* am Ende
  // 4. **Fett:** kein Akteur
  const root = passOver('<!-- dokufix: steps -->\n<ol>\n<li><em>Nie</em> ohne Backup starten.</li>\n<li><em>CRM</em>: der Doppelpunkt steht ausserhalb</li>\n' +
    '<li>Text <em>Website:</em> am Ende</li>\n<li><strong>Fett:</strong> kein Akteur</li>\n</ol>\n');
  assert.equal(root.querySelectorAll('.' + STEP_ACTOR_CLASS).length, 0);
  assert.deepEqual(Array.from(root.querySelectorAll('em')).map(e => e.outerHTML), ['<em>Nie</em>', '<em>CRM</em>', '<em>Website:</em>']);
  assert.equal(root.querySelector('strong').outerHTML, '<strong>Fett:</strong>');
});
test('steps: the colon is taken from the end of the emphasis, whatever stands in it; a colon alone names nobody', () => {
  // 1. ***Website:*** a     2. *Website: mit* Rest     3. *A:* *B:* zwei     4. *:* nichts     5. *Stand 12:30 :* x
  const root = passOver('<!-- dokufix: steps -->\n<ol>\n<li><em><strong>Website:</strong></em> a</li>\n<li><em>Website: mit</em> Rest</li>\n' +
    '<li><em>A:</em> <em>B:</em> zwei</li>\n<li><em>:</em> nichts</li>\n<li><em>Stand 12:30 :</em> x</li>\n</ol>\n');
  const items = Array.from(root.querySelectorAll('ol > li')).map(li => li.innerHTML.replace(/^<span class="dokufix-step-number">\d+<\/span>/, ''));
  assert.deepEqual(items, [
    '<em class="dokufix-step-actor"><strong>Website</strong></em> a',
    '<em>Website: mit</em> Rest',
    '<em class="dokufix-step-actor">A</em> <em>B:</em> zwei',
    '<em>:</em> nichts',
    '<em class="dokufix-step-actor">Stand 12:30</em> x',
  ]);
});
test('steps: a list inside an item is no step list and gets no numbers', () => {
  // 1. *Website:* a
  //    - unter
  // 2. b
  //    1. *Innen:* innen
  const root = passOver('<!-- dokufix: steps -->\n<ol>\n<li><em>Website:</em> a<ul>\n<li>unter</li>\n</ul>\n</li>\n<li>b<ol>\n<li><em>Innen:</em> innen</li>\n</ol>\n</li>\n</ol>\n');
  assert.equal(root.querySelectorAll('.' + STEPS_CLASS).length, 1);
  assert.deepEqual(Array.from(root.querySelectorAll('.' + STEP_NUMBER_CLASS)).map(n => n.textContent), ['1', '2']);
  assert.equal(root.querySelectorAll('.' + STEP_ACTOR_CLASS).length, 1);
  assert.equal(root.querySelector('ol ol').innerHTML, '\n<li><em>Innen:</em> innen</li>\n');
});

// ---------- where a marker may stand ----------
test('blank lines between marker and block do not count', () => {
  // <!-- dokufix: cards -->
  //
  // - a
  const root = passOver('<!-- dokufix: cards --><ul>\n<li>a</li>\n<li>b</li>\n</ul>\n');
  assert.equal(root.innerHTML, '<ul class="dokufix-cards">\n<li>a</li>\n<li>b</li>\n</ul>\n');
});
test('a marker directly after a paragraph line, in a list item, in a quotation', () => {
  // Einleitung
  // <!-- dokufix: cards -->
  // - a
  const after = passOver('<p>Einleitung</p>\n<!-- dokufix: cards -->\n<ul>\n<li>a</li>\n</ul>\n');
  assert.equal(after.innerHTML, '<p>Einleitung</p>\n<ul class="dokufix-cards">\n<li>a</li>\n</ul>\n');
  // - Punkt
  //
  //   <!-- dokufix: steps -->
  //   1. a
  const item = passOver('<ul>\n<li><p>Punkt</p>\n<!-- dokufix: steps -->\n<ol>\n<li>a</li>\n</ol>\n</li>\n</ul>\n');
  assert.equal(item.innerHTML, '<ul>\n<li><p>Punkt</p>\n<ol class="dokufix-steps">\n<li><span class="dokufix-step-number">1</span>a</li>\n</ol>\n</li>\n</ul>\n');
  // > <!-- dokufix: cards -->
  // > - a
  const quote = passOver('<blockquote>\n<!-- dokufix: cards -->\n<ul>\n<li>a</li>\n</ul>\n</blockquote>\n');
  assert.equal(quote.innerHTML, '<blockquote>\n<ul class="dokufix-cards">\n<li>a</li>\n</ul>\n</blockquote>\n');
});
test('a comment over several lines, without blanks, in capitals: a marker each', () => {
  // <!--
  //   dokufix: cards
  // -->
  for (const comment of ['<!--\n  dokufix: cards\n-->', '<!--dokufix:cards-->', '<!-- DOKUFIX: Cards -->']){
    const root = passOver(comment + '\n<ul>\n<li>a</li>\n</ul>\n');
    assert.equal(root.innerHTML, '<ul class="dokufix-cards">\n<li>a</li>\n</ul>\n', comment);
  }
});

// ---------- several markers ----------
test('two markers before one block: each takes effect or warns on that block', () => {
  // <!-- dokufix: cards -->
  // <!-- dokufix: crads -->
  // - a
  const root = passOver('<!-- dokufix: cards -->\n<!-- dokufix: crads -->\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n');
  assert.equal(root.innerHTML, warningHtml(W.unknown('dokufix: crads')) + '\n<ul class="dokufix-cards">\n<li>a</li>\n<li>b</li>\n</ul>\n');
  // The other way round: the warning first, and the marker behind it still finds the list.
  const turned = passOver('<!-- dokufix: crads -->\n<!-- dokufix: cards -->\n<ul>\n<li>a</li>\n</ul>\n');
  assert.equal(turned.innerHTML, warningHtml(W.unknown('dokufix: crads')) + '\n<ul class="dokufix-cards">\n<li>a</li>\n</ul>\n');
});
test('two markers on one line, and with blank lines between them', () => {
  // <!-- dokufix: cards --><!-- dokufix: steps -->
  // - a
  const line = passOver('<!-- dokufix: cards --><!-- dokufix: steps -->\n<ul>\n<li>a</li>\n</ul>\n');
  assert.equal(line.innerHTML, warningHtml(W.numbered('dokufix: steps')) + '\n<ul class="dokufix-cards">\n<li>a</li>\n</ul>\n');
  // <!-- dokufix: steps -->
  //
  // <!-- dokufix: cards -->
  //
  // - a
  const blank = passOver('<!-- dokufix: steps --><!-- dokufix: cards --><ul>\n<li>a</li>\n</ul>\n');
  assert.equal(blank.innerHTML, warningHtml(W.numbered('dokufix: steps')) + '<ul class="dokufix-cards">\n<li>a</li>\n</ul>\n');
});
test('two markers that both act on one block, driven with a list of two', () => {
  // As stories 2.5 and 2.6 will have it: two markers before one table.
  const seen = [];
  const list = [
    { name: 'eins', block: 'TABLE', argument: 'none', apply(block){ seen.push('eins ' + block.tagName); block.classList.add('a'); } },
    { name: 'zwei', block: 'TABLE', argument: 'text', apply(block, argument){ seen.push('zwei ' + block.tagName + ' ' + JSON.stringify(argument)); block.classList.add('b'); } },
  ];
  const root = rootWith('<!-- dokufix: eins -->\n<!-- dokufix: zwei "Spalte A" -->\n<table><tbody><tr><td>x</td></tr></tbody></table>\n');
  applyMarkerList(root, list);
  assert.deepEqual(seen, ['eins TABLE', 'zwei TABLE "Spalte A"']);
  assert.equal(root.innerHTML, '<table class="a b"><tbody><tr><td>x</td></tr></tbody></table>\n');
});
test('a component may refuse its block with a reason: the marker becomes a warning that names it as written, the block stays, nothing is logged', t => {
  const calls = [];
  const list = [
    { name: 'waehlerisch', block: 'UL', argument: 'text', apply(block, argument){ calls.push(argument); return argument === 'ja' ? undefined : { warning: 'kann mit „' + argument + '“ nichts anfangen.' }; } },
    CARDS,
  ];
  const root = rootWith('<!-- dokufix: waehlerisch nein -->\n<ul>\n<li>a</li>\n</ul>\n<!-- dokufix: cards -->\n<ul>\n<li>b</li>\n</ul>\n');
  const { logged } = quiet(t, () => applyMarkerList(root, list));
  assert.equal(root.innerHTML, warningHtml('Die Markierung „dokufix: waehlerisch nein“ kann mit „nein“ nichts anfangen.') + '\n<ul>\n<li>a</li>\n</ul>\n<ul class="dokufix-cards">\n<li>b</li>\n</ul>\n');
  assert.deepEqual(calls, ['nein']);
  assert.deepEqual(logged, [], 'a refusal is no failure');
  assert.equal(root.querySelector('.dokufix-warning-detail'), null, 'one line, no detail');
  assert.equal(refusedMarker(readMarker('dokufix: waehlerisch nein'), 'kann nichts.'), 'Die Markierung „dokufix: waehlerisch nein“ kann nichts.');
  // The reason is text: a component cannot write markup into the warning.
  const marked = rootWith('<!-- dokufix: waehlerisch <b>x</b> -->\n<ul>\n<li>a</li>\n</ul>\n');
  applyMarkerList(marked, list);
  assert.equal(marked.querySelectorAll('.dokufix-warning b').length, 0);
});
test('a marker that was refused did not act: the same marker behind it is the first that does, and no repetition', () => {
  const list = [{ name: 'waehlerisch', block: 'UL', argument: 'text', apply(block, argument){ if (argument !== 'ja') return { warning: 'will nicht.' }; block.classList.add('gewaehlt'); return undefined; } }];
  const root = rootWith('<!-- dokufix: waehlerisch nein -->\n<!-- dokufix: waehlerisch ja -->\n<!-- dokufix: waehlerisch ja -->\n<ul>\n<li>a</li>\n</ul>\n');
  applyMarkerList(root, list);
  assert.deepEqual(warnings(root), ['Warnung: Die Markierung „dokufix: waehlerisch nein“ will nicht.', 'Warnung: ' + W.twice('dokufix: waehlerisch ja')]);
  assert.equal(root.querySelector('ul').className, 'gewaehlt');
});
test('a component may move its block into a new parent: the markers behind it still act on that block', () => {
  // As "facets" does with its table, and as story 2.6 will find it.
  const list = [
    { name: 'huelle', block: 'UL', argument: 'none', apply(block){ const box = block.ownerDocument.createElement('div'); block.replaceWith(box); box.appendChild(block); } },
    CARDS,
  ];
  const root = rootWith('<!-- dokufix: huelle -->\n<!-- dokufix: cards -->\n<ul>\n<li>a</li>\n</ul>\n');
  applyMarkerList(root, list);
  assert.equal(root.innerHTML, '<div><ul class="dokufix-cards">\n<li>a</li>\n</ul></div>\n');
});
test('the same marker twice before one block: the component is applied once, every further one is a warning that says so', () => {
  // <!-- dokufix: steps -->
  // <!-- dokufix: steps -->
  // 3. a
  // 4. b
  const steps = passOver('<!-- dokufix: steps -->\n<!-- dokufix: steps -->\n<ol start="3">\n<li>a</li>\n<li>b</li>\n</ol>\n');
  assert.equal(steps.innerHTML, warningHtml(W.twice('dokufix: steps')) + '\n' +
    '<ol class="dokufix-steps" start="3">\n<li><span class="dokufix-step-number">3</span>a</li>\n<li><span class="dokufix-step-number">4</span>b</li>\n</ol>\n');
  // Three times, one of them written in capitals, with another marker among them.
  const cards = passOver('<!-- dokufix: cards -->\n<!-- DOKUFIX: Cards -->\n<!-- dokufix: crads -->\n<!-- dokufix: cards -->\n<ul>\n<li><strong>A</strong>: a</li>\n</ul>\n');
  assert.deepEqual(warnings(cards), ['Warnung: ' + W.twice('DOKUFIX: Cards'), 'Warnung: ' + W.unknown('dokufix: crads'), 'Warnung: ' + W.twice('dokufix: cards')]);
  assert.equal(cards.querySelector('ul').outerHTML, '<ul class="dokufix-cards">\n<li><strong class="dokufix-card-title">A</strong>a</li>\n</ul>');
  assert.deepEqual(comments(cards), []);
  // A marker that did not act does not count: the one behind it is the first that does.
  const first = passOver('<!-- dokufix: cards zwei -->\n<!-- dokufix: cards -->\n<ul>\n<li>a</li>\n</ul>\n');
  assert.deepEqual(warnings(first), ['Warnung: ' + W.argument('dokufix: cards zwei')]);
  assert.equal(first.querySelectorAll('ul.dokufix-cards').length, 1);
  // The same marker before two blocks is no repetition.
  const two = passOver('<!-- dokufix: cards -->\n<ul>\n<li>a</li>\n</ul>\n<!-- dokufix: cards -->\n<ul>\n<li>b</li>\n</ul>\n');
  assert.deepEqual(warnings(two), []);
  assert.equal(two.querySelectorAll('ul.dokufix-cards').length, 2);
});
test('a comment that is no marker may stand between a marker and its block', () => {
  const root = passOver('<!-- dokufix: cards -->\n<!-- Notiz -->\n<ul>\n<li>a</li>\n</ul>\n');
  assert.equal(root.innerHTML, '<!-- Notiz -->\n<ul class="dokufix-cards">\n<li>a</li>\n</ul>\n');
});

// ---------- markers that cannot take effect ----------
// [name, markup as marked emits it, what is left]. The block stays what it was.
const LIST = '<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n';
const TABLE = '<table>\n<thead>\n<tr>\n<th>A</th>\n<th>B</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>1</td>\n<td>2</td>\n</tr>\n</tbody></table>\n';
const BROKEN = [
  ['an unknown name, "<!-- dokufix: crads -->"',
    '<!-- dokufix: crads -->\n' + LIST,
    warningHtml(W.unknown('dokufix: crads')) + '\n' + LIST],
  ['steps before a bullet list',
    '<!-- dokufix: steps -->\n' + LIST,
    warningHtml(W.numbered('dokufix: steps')) + '\n' + LIST],
  ['cards before a numbered list',
    '<!-- dokufix: cards -->\n<ol>\n<li>a</li>\n</ol>\n',
    warningHtml(W.list('dokufix: cards')) + '\n<ol>\n<li>a</li>\n</ol>\n'],
  ['cards before a table',
    '<!-- dokufix: cards -->\n' + TABLE,
    warningHtml(W.list('dokufix: cards')) + '\n' + TABLE],
  ['a paragraph between marker and list',
    '<!-- dokufix: cards -->\n<p>Eine Einleitung.</p>\n' + LIST,
    warningHtml(W.list('dokufix: cards')) + '\n<p>Eine Einleitung.</p>\n' + LIST],
  ['a paragraph between marker and list, after a blank line',
    '<!-- dokufix: cards --><p>Eine Einleitung.</p>\n' + LIST,
    warningHtml(W.list('dokufix: cards')) + '<p>Eine Einleitung.</p>\n' + LIST],
  ['text on the marker\'s line, "<!-- dokufix: cards --> Text dahinter"',
    '<!-- dokufix: cards --> Text dahinter' + LIST,
    warningHtml(W.list('dokufix: cards')) + ' Text dahinter' + LIST],
  ['a heading between marker and list',
    '<!-- dokufix: cards -->\n<h2>Titel</h2>\n' + LIST,
    warningHtml(W.list('dokufix: cards')) + '\n<h2>Titel</h2>\n' + LIST],
  ['a marker at the end of the document',
    '<p>Text</p>\n<!-- dokufix: cards -->',
    '<p>Text</p>\n' + warningHtml(W.list('dokufix: cards'))],
  ['a marker after its list',
    LIST + '<!-- dokufix: cards -->\n',
    LIST + warningHtml(W.list('dokufix: cards')) + '\n'],
  ['a name with a hyphen and something behind it, "<!-- dokufix: side-note wichtig -->"',
    '<!-- dokufix: side-note wichtig -->\n' + LIST,
    warningHtml(W.unknown('dokufix: side-note wichtig')) + '\n' + LIST],
  ['no name, "<!-- dokufix: -->"',
    '<!-- dokufix: -->\n' + LIST,
    warningHtml(W.noName('dokufix:')) + '\n' + LIST],
  ['something behind the name of a marker that takes nothing, "<!-- dokufix: cards zwei -->"',
    '<!-- dokufix: cards zwei -->\n' + LIST,
    warningHtml(W.argument('dokufix: cards zwei')) + '\n' + LIST],
  ['two hyphens in the comment, "<!-- dokufix: cards -- x -->"',
    '<!-- dokufix: cards -- x -->\n' + LIST,
    warningHtml(W.argument('dokufix: cards -- x')) + '\n' + LIST],
];
for (const [name, html, want] of BROKEN){
  test('a warning at its place, the block as it was: ' + name, t => {
    const { result: root, logged } = quiet(t, () => passOver(html));
    assert.equal(root.innerHTML, want);
    assert.deepEqual(comments(root), [], 'the marker is gone');
    assert.deepEqual(logged, [], 'nothing was thrown and nothing logged');
  });
}
test('the warning is the product\'s one warning, made by buildWarning()', () => {
  const root = passOver('<!-- dokufix: crads -->\n' + LIST);
  const box = root.firstElementChild;
  assert.equal(box.className, 'dokufix-warning');
  assert.equal(box.getAttribute('role'), 'note');
  assert.equal(box.querySelector('.dokufix-warning-title > strong').textContent, 'Warnung:');
  assert.equal(box.textContent, 'Warnung: ' + W.unknown('dokufix: crads'));
  // One line: the marker has no detail to show.
  assert.equal(box.querySelector('.dokufix-warning-detail'), null);
});
test('a marker inside a paragraph has no block; its warning stands after the paragraph, not in it', () => {
  // Text <!-- dokufix: cards --> weiter
  //
  // - a
  const root = passOver('<p>Text <!-- dokufix: cards --> weiter</p>\n' + LIST);
  assert.equal(root.innerHTML, '<p>Text  weiter</p>' + warningHtml(W.list('dokufix: cards')) + '\n' + LIST);
  assert.equal(root.querySelectorAll('p .dokufix-warning').length, 0);
  // At the end of the paragraph, directly before the list: still inside the paragraph.
  const end = passOver('<p>Text <!-- dokufix: cards --></p>\n' + LIST);
  assert.equal(end.innerHTML, '<p>Text </p>' + warningHtml(W.list('dokufix: cards')) + '\n' + LIST);
});
test('two markers inside one paragraph: their warnings follow it in the order of the markers', () => {
  const root = passOver('<p>a <!-- dokufix: crads --> b <!-- dokufix: steps --> c</p>\n');
  assert.equal(root.innerHTML, '<p>a  b  c</p>' + warningHtml(W.unknown('dokufix: crads')) + warningHtml(W.numbered('dokufix: steps')) + '\n');
});
test('a marker inside a heading, a table cell, a tight list item: the warning stands where a block may stand', () => {
  // ## Titel <!-- dokufix: cards -->
  const heading = passOver('<h2>Titel <!-- dokufix: cards --></h2>\n');
  assert.equal(heading.innerHTML, '<h2>Titel </h2>' + warningHtml(W.list('dokufix: cards')) + '\n');
  // In a paragraph of a list item: after that paragraph, inside the item.
  const item = passOver('<ul>\n<li><p>Punkt <!-- dokufix: crads --></p>\n</li>\n</ul>\n');
  assert.equal(item.innerHTML, '<ul>\n<li><p>Punkt </p>' + warningHtml(W.unknown('dokufix: crads')) + '\n</li>\n</ul>\n');
  // An item and a cell may hold a block: the warning takes the marker's place.
  const tight = passOver('<ul>\n<li>Punkt <!-- dokufix: crads --></li>\n</ul>\n');
  assert.equal(tight.innerHTML, '<ul>\n<li>Punkt ' + warningHtml(W.unknown('dokufix: crads')) + '</li>\n</ul>\n');
  // Emphasis in a paragraph: out of both.
  const deep = passOver('<p>a <em>b <!-- dokufix: crads --></em> c</p>\n');
  assert.equal(deep.innerHTML, '<p>a <em>b </em> c</p>' + warningHtml(W.unknown('dokufix: crads')) + '\n');
  // Written as HTML between the items of a list, where no block may stand: after the list.
  const between = passOver('<ul><!-- dokufix: crads --><li>a</li></ul>');
  assert.equal(between.innerHTML, '<ul><li>a</li></ul>' + warningHtml(W.unknown('dokufix: crads')));
});
test('a broken marker among working ones: it warns, every other marker still takes effect, nothing is thrown', t => {
  // <!-- dokufix: side-note wichtig -->     <!-- dokufix: -->     <!-- dokufix: cards -->     <!-- dokufix: steps -->
  // - a                                     - b                   - c                         1. d
  const { result: root, logged } = quiet(t, () => passOver(
    '<!-- dokufix: side-note wichtig -->\n<ul>\n<li>a</li>\n</ul>\n<!-- dokufix: -->\n<ul>\n<li>b</li>\n</ul>\n' +
    '<!-- dokufix: cards -->\n<ul>\n<li>c</li>\n</ul>\n<!-- dokufix: steps -->\n<ol>\n<li>d</li>\n</ol>\n'));
  assert.equal(root.innerHTML,
    warningHtml(W.unknown('dokufix: side-note wichtig')) + '\n<ul>\n<li>a</li>\n</ul>\n' +
    warningHtml(W.noName('dokufix:')) + '\n<ul>\n<li>b</li>\n</ul>\n' +
    '<ul class="dokufix-cards">\n<li>c</li>\n</ul>\n' +
    '<ol class="dokufix-steps">\n<li><span class="dokufix-step-number">1</span>d</li>\n</ol>\n');
  assert.deepEqual(logged, []);
});
test('an author cannot set a class through a marker: only names of the list act', t => {
  // The names of classes the product uses, and of properties every object has.
  const names = ['dokufix-warning', 'warning', 'callout', 'dokufix-cards', 'card-title', 'step-number', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'];
  const { result: root, logged } = quiet(t, () => passOver(names.map(n => '<!-- dokufix: ' + n + ' -->\n<p>Absatz</p>\n<ul>\n<li>a</li>\n</ul>\n').join('')));
  assert.deepEqual(warnings(root), names.map(n => 'Warnung: ' + W.unknown('dokufix: ' + n)));
  // The blocks of the document carry nothing: no class, no attribute.
  for (const el of root.querySelectorAll(':scope > p, ul, li')) assert.equal(el.attributes.length, 0, el.outerHTML);
  assert.deepEqual(logged, []);
  // And what follows the name of a known marker sets nothing either.
  const argued = passOver('<!-- dokufix: cards dokufix-warning -->\n' + LIST);
  assert.equal(argued.querySelector('ul').attributes.length, 0);
});
test('a marker whose component throws becomes a warning with the message; the markers after it are applied, and nothing reaches the caller', t => {
  const list = [
    { name: 'kaputt', block: 'UL', argument: 'none', apply(){ throw new Error('mit <Absicht>'); } },
    CARDS,
  ];
  const root = rootWith('<!-- dokufix: kaputt -->\n<ul>\n<li>a</li>\n</ul>\n<!-- dokufix: cards -->\n<ul>\n<li>b</li>\n</ul>\n');
  const { logged } = quiet(t, () => applyMarkerList(root, list));
  assert.equal(root.innerHTML,
    warningHtml('Die Markierung „dokufix: kaputt“ konnte nicht angewendet werden.', 'mit <Absicht>') + '\n<ul>\n<li>a</li>\n</ul>\n<ul class="dokufix-cards">\n<li>b</li>\n</ul>\n');
  assert.equal(root.querySelector('.dokufix-warning-detail').textContent, 'mit <Absicht>');
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], 'Marker "dokufix: kaputt" failed:');
});
test('the text of a warning is text: a marker cannot write markup into it', () => {
  const root = passOver('<!-- dokufix: <b>fett</b> & "so" -->\n' + LIST);
  const box = root.querySelector('.dokufix-warning');
  assert.equal(box.querySelectorAll('b').length, 0);
  assert.equal(box.textContent, 'Warnung: ' + W.noName('dokufix: <b>fett</b> & "so"'));
});

// ---------- what is no marker ----------
// Each of these comes back as it went in, byte for byte.
const UNTOUCHED = {
  'the marker in a code span, "`<!-- dokufix: cards -->`"':
    '<p>Die Markierung <code>&lt;!-- dokufix: cards --&gt;</code> steht vor der Liste.</p>\n<ul>\n<li>a</li>\n</ul>\n',
  'the marker in a fenced code block':
    '<pre><code class="language-html">&lt;!-- dokufix: cards --&gt;\n</code></pre>\n<ul>\n<li>a</li>\n</ul>\n',
  'the marker in an indented code block':
    '<pre><code>&lt;!-- dokufix: cards --&gt;\n</code></pre>\n<ul>\n<li>a</li>\n</ul>\n',
  'a masked marker, "\\<!-- dokufix: cards -->"':
    '<p>&lt;!-- dokufix: cards --&gt;</p>\n<ul>\n<li>a</li>\n</ul>\n',
  'another comment, "<!-- Notiz -->"':
    '<!-- Notiz -->\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n',
  'a comment that names dokufix without the colon':
    '<!-- dokufix cards -->\n<ul>\n<li>a</li>\n</ul>\n',
  'a comment that has "dokufix:" further on':
    '<!-- Notiz: dokufix: cards -->\n<ul>\n<li>a</li>\n</ul>\n',
  'lists without a marker':
    '<ul>\n<li><strong>Titel</strong> Text</li>\n</ul>\n<ol start="3">\n<li><em>Website:</em> Text</li>\n</ol>\n',
  'a document without a comment':
    '<h1>Titel</h1>\n<p>Text</p>\n',
};
for (const [name, html] of Object.entries(UNTOUCHED)){
  test('unchanged: ' + name, () => {
    assert.equal(passOver(html).innerHTML, html);
  });
}
test('a second pass changes nothing', () => {
  const root = passOver('<!-- dokufix: cards -->\n<ul>\n<li><strong>A</strong> a</li>\n</ul>\n<!-- dokufix: steps -->\n<ol start="3">\n<li><em>Wer:</em> b</li>\n</ol>\n<!-- dokufix: crads -->\n' + LIST);
  const once = root.innerHTML;
  applyMarkers(root);
  assert.equal(root.innerHTML, once);
});

// ---------- the pass has its place in the list ----------
test('render.js runs the pass "Markierungen" after "Status-Chips" and before "Tabellen" and "Überschriften"', () => {
  // render.js looks up elements of the page when it loads, so it is read, not imported.
  const src = fs.readFileSync(path.join(here, '../src/app/render.js'), 'utf8');
  const list = src.slice(src.indexOf('export const DOCUMENT_PASSES = ['), src.indexOf('];', src.indexOf('export const DOCUMENT_PASSES = [')));
  const names = Array.from(list.matchAll(/name: '([^']+)'/g)).map(m => m[1]);
  const at = names.indexOf('Markierungen');
  assert.ok(at > 0, 'the pass is in the list: ' + names.join(', '));
  assert.equal(names[at - 1], 'Status-Chips');
  // The tables come directly behind: a marker finds its table as the element
  // directly after it, before the table gets its wrapper.
  assert.equal(names[at + 1], 'Tabellen');
  assert.equal(names[at + 2], 'Überschriften');
  assert.match(list, /\{ name: 'Markierungen', run: applyMarkers \}/);
});
test('the pass takes the root alone: the runner\'s context is not mistaken for a list of markers', () => {
  const root = rootWith('<!-- dokufix: cards -->\n' + LIST);
  applyMarkers(root, { frontmatter: { kind: null } });
  assert.equal(root.querySelectorAll('ul.dokufix-cards').length, 1);
});

// ---------- the look in the document styles ----------
const docCss = fs.readFileSync(path.join(here, '../src/doc.css'), 'utf8');
// The declarations of the rule with exactly this selector, as { property: value }.
function ruleOf(css, selector){
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp('(?:^|[}\\s])' + escaped + '\\s*\\{([^}]*)\\}'));
  if (!m) return null;
  const out = {};
  for (const part of m[1].split(';')){
    const at = part.indexOf(':');
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}
test('cards have their rules: a grid that wraps, columns of at least 210 px, a thin border, the title a line of its own', () => {
  const grid = ruleOf(docCss, '.dokufix-doc .dokufix-cards');
  assert.ok(grid, 'a rule for the list');
  assert.equal(grid.display, 'grid');
  assert.match(grid['grid-template-columns'], /^repeat\(auto-fit,minmax\(min\(210px,100%\),1fr\)\)$/);
  assert.equal(grid['list-style'], 'none');
  const card = ruleOf(docCss, '.dokufix-doc .dokufix-cards > li');
  assert.ok(card, 'a rule for a card');
  assert.match(card.border, /^1px solid #[0-9a-f]{6}$/);
  const title = ruleOf(docCss, '.dokufix-doc .dokufix-card-title');
  assert.ok(title, 'a rule for the title');
  assert.equal(title.display, 'block');
});
test('step lists have their rules: no marker of the list, the number a tile left of its item, the actor a line of its own', () => {
  const list = ruleOf(docCss, '.dokufix-doc .dokufix-steps');
  assert.ok(list, 'a rule for the list');
  assert.equal(list['list-style'], 'none');
  const item = ruleOf(docCss, '.dokufix-doc .dokufix-steps > li');
  assert.ok(item, 'a rule for an item');
  const number = ruleOf(docCss, '.dokufix-doc .dokufix-step-number');
  assert.ok(number, 'a rule for the number');
  // The tile floats into the item's padding. It is not placed against the
  // item: a positioned item would be the containing block of the preview of
  // a footnote cited in the step.
  assert.equal(number.float, 'left');
  assert.equal(item.position, undefined);
  assert.equal(number.position, undefined);
  assert.match(number.margin, new RegExp(' -' + item['padding-left'] + '$'), 'pulled back by the padding of the item');
  assert.match(number.background, /^#[0-9a-f]{6}$/);
  assert.equal(number['print-color-adjust'], 'exact');
  assert.equal(number['-webkit-print-color-adjust'], 'exact');
  const actor = ruleOf(docCss, '.dokufix-doc .dokufix-step-actor');
  assert.ok(actor, 'a rule for the actor');
  assert.equal(actor.display, 'block');
});
test('no rule of cards and step lists positions anything: a footnote preview is placed against the page', () => {
  const block = docCss.slice(docCss.indexOf('/* Cards'), docCss.indexOf('/* Footnotes')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/position\s*:/.test(block), 'no position declaration');
});
test('in the preview of a footnote the number and the actor of a step are plain text of the line', () => {
  const rule = ruleOf(docCss, '.dokufix-doc .dokufix-fn-preview :is(.dokufix-step-number,.dokufix-step-actor)');
  assert.ok(rule, 'one rule for both');
  assert.equal(rule.display, 'inline');
  assert.equal(rule.float, 'none');
  assert.equal(rule.font, 'inherit');
  assert.equal(rule['text-transform'], 'none');
  assert.equal(rule.background, 'none');
  // It stands behind the rules it takes back, with a selector that outweighs them.
  assert.ok(docCss.indexOf('.dokufix-fn-preview :is(.dokufix-step-number') > docCss.indexOf('.dokufix-doc .dokufix-step-actor{'));
});
test('the styles go by the classes the pass sets, never by where a <strong> or an <em> stands', () => {
  // NFR11: which element is a title, a number or an actor is decided in the pass.
  const block = docCss.slice(docCss.indexOf('/* Cards'), docCss.indexOf('/* Footnotes'));
  assert.ok(block.length > 500, 'the block of cards and step lists');
  const selectors = Array.from(block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)).map(m => m[1].trim());
  assert.ok(selectors.length >= 8, selectors.join(' | '));
  for (const selector of selectors) assert.ok(!/\b(strong|em|b|i)\b/.test(selector.replace(/\.[\w-]+/g, '')), selector);
  // No new colour: every colour of these rules is one the document styles used before.
  const before = docCss.slice(0, docCss.indexOf('/* Cards')) + docCss.slice(docCss.indexOf('/* Footnotes'));
  const colours = new Set(Array.from(block.matchAll(/#[0-9a-f]{6}\b/g)).map(m => m[0]));
  assert.ok(colours.size > 0);
  for (const colour of colours) assert.ok(before.includes(colour), colour + ' is a colour of the document styles');
});
test('the built file carries the rules of both components and the name of every marker', () => {
  const built = fs.readFileSync(path.join(here, '../dist/dokufix.html'), 'utf8');
  const block = built.match(/<style id="dokufix-doc-css">([\s\S]*?)<\/style>/);
  assert.ok(block, 'the block of the document styles');
  for (const name of ['.dokufix-cards{', '.dokufix-cards>li{', '.dokufix-card-title{', '.dokufix-steps{', '.dokufix-steps>li{', '.dokufix-step-number{', '.dokufix-step-actor{']){
    assert.ok(block[1].includes(name), name);
  }
  for (const entry of MARKERS) assert.ok(built.includes('name:"' + entry.name + '"'), 'the entry of ' + entry.name);
});
