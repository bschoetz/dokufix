// The free-text filter of a table, run in Node: no browser, no page.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/filter.js is a module of pure logic, so this file imports it as it
// is and hands the marker pass, the pass "Tabellen" and the run-time pass a
// fragment that linkedom parses; linkedom dispatches the events a reader's
// typing would. The markup of every Markdown table is what marked 18.0.14
// emits, as in tests/facets.test.mjs.
//
// The cases are the matrix of the story as far as it needs no layout: the
// field and its counter, what a term matches, which text counts, the filter
// beside a facet filter, which marker becomes a warning, a second run of the
// pass, Escape, and what the export step takes out. Where the field stands on
// the page, that nothing scrolls and where the preview of a footnote in a
// cell stands is for the browser runs (tests/vergleich.mjs).
//
// The last cases read src/doc.css, src/app/render.js, the export path and the
// built file.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { MARKERS, readMarker, judgeMarker, applyMarkers } from '../src/app/markers.js';
import {
  FILTER, FILTER_ATTR, FILTER_CLASS, FILTER_INPUT_CLASS, FILTER_COUNT_CLASS, FILTER_OUT_CLASS, FILTER_PLACEHOLDER, FILTER_LABEL,
  markFilter, filterRowText, filterMatches, filterCountText, applyFilter, attachTableFilters, removeFilterMarks,
} from '../src/app/filter.js';
import { FACETS_CLASS } from '../src/app/facets.js';
import { buildChips } from '../src/app/chips.js';
import { buildTables, TABLE_CLASS } from '../src/app/tables.js';
import { TRANSIENT_ATTR, removeTransient } from '../src/app/transient.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// A root like the preview, holding the given markup, with the window it lives in.
function rootWith(html){
  const { document } = parseHTML('<!DOCTYPE html><html><body><article id="root" class="dokufix-doc">' + html + '</article></body></html>');
  return document.getElementById('root');
}
// The document passes the filter needs, then the run-time pass, as render() runs them.
function rendered(html){
  const root = rootWith(html);
  buildChips(root);
  applyMarkers(root);
  buildTables(root);
  attachTableFilters(root);
  return root;
}
const cell = (tag, html) => '<' + tag + '>' + html + '</' + tag + '>\n';
// A Markdown table as marked emits it.
const table = (head, rows) => '<table>\n<thead>\n<tr>\n' + head.map(h => cell('th', h)).join('') + '</tr>\n</thead>\n<tbody>' +
  rows.map(r => '<tr>\n' + r.map(c => cell('td', c)).join('') + '</tr>\n').join('') + '</tbody></table>\n';
const marker = text => '<!-- dokufix: ' + text + ' -->\n';

// Types a term into the n-th field, as a reader does: the value, then "input".
function type(root, term, n = 0){
  const input = root.querySelectorAll('.' + FILTER_INPUT_CLASS)[n];
  input.value = term;
  input.dispatchEvent(new (root.ownerDocument.defaultView.Event)('input', { bubbles: true }));
}
// Which data rows are shown, by their first cell, and what the counter says.
function state(root, n = 0){
  const tables = Array.from(root.querySelectorAll('table[' + FILTER_ATTR + ']'));
  const rows = Array.from(tables[n].querySelectorAll(':scope > tbody > tr'));
  return {
    shown: rows.filter(tr => !tr.classList.contains(FILTER_OUT_CLASS)).map(tr => tr.querySelector('td').textContent.trim()),
    count: root.querySelectorAll('.' + FILTER_COUNT_CLASS)[n].textContent,
  };
}
const warnings = root => Array.from(root.querySelectorAll('.dokufix-warning')).map(w => w.textContent);

// The words of the warnings, written out here a second time on purpose: a
// reader sees them.
const W = {
  table: written => 'Warnung: Die Markierung „' + written + '“ erwartet direkt danach eine Tabelle.',
  twice: written => 'Warnung: Die Markierung „' + written + '“ steht mehr als einmal vor demselben Block.',
};

// Fourteen rows, as the example handbook's table of customer fields.
// | Merkmal | Typ | Wofür |
const FIELDS = [
  ['PK_LETZTE', 'Kategorie', 'Welche Probekiste zuletzt bestellt wurde'],
  ['PK_LETZTE_AM', 'Datum', 'Wann'],
  ['<code>PK_GEMUESE</code><br><code>PK_OBST</code>', 'Ja/Nein<br><em>je eines</em>', 'Die Bestellhistorie'],
  ['ERLAUBNIS', 'Ja/Nein', 'Ob wir schreiben dürfen'],
  ['ANREDE', 'Kategorie', 'Ansprache'],
  ['ORT', 'Text', 'Zuordnung zu einer Tour'],
  ['TELEFON', 'Text', 'Rückruf am Ort'],
  ['QUELLE_SEITE', 'Text', 'Von welcher Seite'],
  ['WUNSCH_TOUR', 'Text', 'Die gewählte Tour'],
  ['ANFRAGE_AM', 'Datum', 'Angelegt'],
  ['STATUS', 'Kategorie', '<code>🟢 Live</code> oder nicht'],
  ['ABO_KUNDE', 'Ja/Nein', 'Wer schon ein Abo hat'],
  ['TOUR_FAHRER', 'Benutzer', 'Zuständiger Fahrer vor Ort'],
  ['VORLIEBE', 'Kategorie', 'Zurückgestellt'],
];
const FIELDS_TABLE = table(['Merkmal', 'Typ', 'Wofür'], FIELDS);
const first = row => row[0].replace(/<br>/g, '').replace(/<[^>]+>/g, '');

// ---------- the entry ----------
test('the entry: "filter" before a table, handed what follows its name', () => {
  assert.deepEqual([FILTER.name, FILTER.block, FILTER.argument], ['filter', 'TABLE', 'text']);
  assert.ok(FILTER.apply === markFilter);
  assert.ok(MARKERS.includes(FILTER), 'it stands in the one list of markers');
  assert.ok(judgeMarker(readMarker('dokufix: filter "Suchen …"'), 'TABLE').entry === FILTER);
  assert.ok(judgeMarker(readMarker('dokufix: filter'), 'TABLE').entry === FILTER);
  assert.deepEqual(judgeMarker(readMarker('dokufix: filter'), 'UL'), { warning: W.table('dokufix: filter').slice('Warnung: '.length) });
});

// ---------- the field ----------
test('the document: the marker is gone and the table carries the placeholder, nothing else', () => {
  const root = rootWith(marker('filter "Merkmal oder Zweck suchen …"') + FIELDS_TABLE);
  applyMarkers(root);
  const t = root.querySelector('table');
  assert.equal(t.getAttribute(FILTER_ATTR), 'Merkmal oder Zweck suchen …');
  assert.ok(!root.innerHTML.includes('<!--'), 'the comment is gone');
  assert.equal(root.querySelectorAll('.' + FILTER_CLASS).length, 0, 'no field in the document');
  assert.equal(root.querySelectorAll('.' + FILTER_OUT_CLASS).length, 0);
});
test('the field: one search field directly above the wrapper, with the placeholder, a name for assistive technology and the counter "14 Zeilen"; transient', () => {
  const root = rendered(marker('filter "Merkmal oder Zweck suchen …"') + FIELDS_TABLE);
  const fields = root.querySelectorAll('.' + FILTER_CLASS);
  assert.equal(fields.length, 1);
  const field = fields[0];
  assert.equal(field.tagName, 'DIV');
  assert.ok(field.hasAttribute(TRANSIENT_ATTR), 'transient');
  assert.ok(field.nextElementSibling.classList.contains(TABLE_CLASS), 'directly above the wrapper');
  assert.equal(field.parentNode, root, 'outside the wrapper');
  assert.deepEqual(Array.from(field.nextElementSibling.children).map(c => c.tagName), ['TABLE'], 'the wrapper holds the table alone');
  const input = field.querySelector(':scope > input.' + FILTER_INPUT_CLASS);
  assert.deepEqual(['type', 'placeholder', 'aria-label', 'autocomplete'].map(a => input.getAttribute(a)), ['search', 'Merkmal oder Zweck suchen …', FILTER_LABEL, 'off']);
  assert.equal(FILTER_LABEL, 'Tabelle filtern');
  const count = field.querySelector(':scope > span.' + FILTER_COUNT_CLASS);
  assert.equal(count.getAttribute('role'), 'status', 'a change is announced');
  assert.equal(count.textContent, '14 Zeilen');
  assert.deepEqual(state(root).shown, FIELDS.map(first));
  // Nothing made per table: no style, no id.
  for (const el of [field, ...field.querySelectorAll('*')]) assert.ok(!el.hasAttribute('style') && !el.hasAttribute('id'), el.outerHTML);
});
test('no argument: the field has the default placeholder', () => {
  for (const written of ['filter', 'filter ""', 'filter "   "']){
    const root = rendered(marker(written) + FIELDS_TABLE);
    assert.equal(root.querySelector('.' + FILTER_INPUT_CLASS).getAttribute('placeholder'), FILTER_PLACEHOLDER, written);
  }
  assert.equal(FILTER_PLACEHOLDER, 'Suchen …');
  // Without double quotes the rest of the comment is the placeholder.
  assert.equal(rendered(marker('filter Feld suchen') + FIELDS_TABLE).querySelector('.' + FILTER_INPUT_CLASS).getAttribute('placeholder'), 'Feld suchen');
});
test('markup in the placeholder stays text', () => {
  const root = rendered(marker('filter "<img src=x onerror=alarm()> & so"') + FIELDS_TABLE);
  const field = root.querySelector('.' + FILTER_CLASS);
  assert.equal(field.querySelectorAll('img').length, 0);
  assert.equal(field.querySelector('input').getAttribute('placeholder'), '<img src=x onerror=alarm()> & so');
});

// ---------- typing ----------
test('typing: the rows that contain the term are shown, the counter says "3 von 14 Zeilen"', () => {
  const root = rendered(marker('filter') + FIELDS_TABLE);
  type(root, 'tour');
  assert.deepEqual(state(root), { shown: ['ORT', 'WUNSCH_TOUR', 'TOUR_FAHRER'], count: '3 von 14 Zeilen' });
  type(root, '');
  assert.deepEqual(state(root), { shown: FIELDS.map(first), count: '14 Zeilen' });
  type(root, 'gibt es nicht');
  assert.deepEqual(state(root), { shown: [], count: '0 von 14 Zeilen' });
});
test('case and blanks: "  ORT ", "ort" and "Ort" show the rows "ORT" shows', () => {
  const root = rendered(marker('filter') + FIELDS_TABLE);
  type(root, 'ORT');
  const expected = state(root);
  assert.deepEqual(expected.shown, ['ORT', 'TELEFON', 'TOUR_FAHRER'], 'ORT, and "Ort" in two texts');
  for (const term of ['  ORT ', 'ort', 'Ort', '\tort\n']){
    type(root, term);
    assert.deepEqual(state(root), expected, JSON.stringify(term));
  }
  // The term is one phrase: blanks inside it are collapsed, not taken apart.
  type(root, 'zu   einer');
  assert.deepEqual(state(root).shown, ['ORT']);
  type(root, 'einer zu');
  assert.deepEqual(state(root).shown, []);
});
test('the text of a row: its cells joined by a blank, so a term may reach across two cells', () => {
  const root = rendered(marker('filter') + FIELDS_TABLE);
  type(root, 'ort text');
  assert.deepEqual(state(root).shown, ['ORT']);
  type(root, 'ortText');
  assert.deepEqual(state(root).shown, []);
});
test('a line break counts as a blank: "PK_A<br>PK_B" matches "PK_B" and "PK_A PK_B"', () => {
  const root = rendered(marker('filter') + FIELDS_TABLE);
  type(root, 'PK_OBST');
  assert.deepEqual(state(root).shown, ['PK_GEMUESEPK_OBST']);
  type(root, 'pk_gemuese pk_obst');
  assert.deepEqual(state(root).shown, ['PK_GEMUESEPK_OBST']);
  type(root, 'je eines');
  assert.deepEqual(state(root).shown, ['PK_GEMUESEPK_OBST'], 'a sub-line is text of its cell');
});
test('hidden words: the word a chip carries for assistive technology and the preview of a footnote are no text of the row', () => {
  // As the preview pass leaves a footnote marker cited in a cell.
  const ref = '<sup class="dokufix-fn-host"><a href="#footnote-back-a" data-footnote-ref="">1</a><span class="dokufix-fn-preview" aria-hidden="true">Die Signatur steht auf dem Etikett.</span></sup>';
  const root = rendered(marker('filter') + table(['Gerät', 'Status'], [['Automat' + ref, '<code>🟢 in Betrieb</code>'], ['Klappe', '<code>🔴 gestört</code>']]));
  assert.equal(root.querySelectorAll('.dokufix-chip-status').length, 2, 'the chips carry their words');
  for (const term of ['grün', 'rot', 'Etikett', 'Signatur', '1']){
    type(root, term);
    assert.deepEqual(state(root), { shown: [], count: '0 von 2 Zeilen' }, term);
  }
  type(root, 'in Betrieb');
  assert.deepEqual(state(root).shown, ['Automat1Die Signatur steht auf dem Etikett.'], 'the label of a chip is text');
  type(root, 'automat in');
  assert.equal(state(root).count, '1 von 2 Zeilen', 'the marker is left out, not the cell around it');
  assert.equal(filterRowText(root.querySelector('tbody tr')), 'Automat in Betrieb');
});
test('the text of a row leaves out what is transient and the controls of a facet filter; a table in a cell is text of its cell', () => {
  const root = rootWith('<table><tbody><tr><td>eins<div data-dokufix-transient="">flüchtig</div></td><td><fieldset class="dokufix-facet-bar"><legend>X</legend>Alle 3</fieldset><table><tbody><tr><td>I</td><td>pq</td></tr></tbody></table></td></tr></tbody></table>');
  assert.equal(filterRowText(root.querySelector('tr')), 'eins I pq');
});
test('the header row and <tfoot> are never hidden; the counter counts the data rows', () => {
  const root = rendered(marker('filter') + '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>x</td></tr><tr><td>y</td></tr></tbody><tfoot><tr><td>Summe</td></tr></tfoot></table>');
  type(root, 'zzz');
  assert.equal(root.querySelectorAll('.' + FILTER_OUT_CLASS).length, 2);
  assert.ok(!root.querySelector('thead tr').classList.contains(FILTER_OUT_CLASS));
  assert.ok(!root.querySelector('tfoot tr').classList.contains(FILTER_OUT_CLASS));
  assert.equal(state(root).count, '0 von 2 Zeilen');
});
test('the counter: "14 Zeilen", "3 von 14 Zeilen", "1 Zeile", "0 von 1 Zeile", "0 Zeilen"', () => {
  assert.equal(filterCountText(14, 14), '14 Zeilen');
  assert.equal(filterCountText(3, 14), '3 von 14 Zeilen');
  assert.equal(filterCountText(1, 1), '1 Zeile');
  assert.equal(filterCountText(0, 1), '0 von 1 Zeile');
  assert.equal(filterCountText(0, 0), '0 Zeilen');
  const root = rendered(marker('filter') + table(['A'], [['x']]));
  assert.equal(state(root).count, '1 Zeile');
  type(root, 'y');
  assert.equal(state(root).count, '0 von 1 Zeile');
});
test('filterMatches: one phrase, case ignored, blanks collapsed; an empty term matches every row', () => {
  assert.ok(filterMatches('', 'x'));
  assert.ok(filterMatches('   ', 'x'));
  assert.ok(filterMatches('STRASSE', 'Hauptstrasse 1'));
  assert.ok(filterMatches('ÄNDERUNG', 'die Änderung'));
  assert.ok(filterMatches(' a  b ', 'x a b y'));
  assert.ok(!filterMatches('a b', 'a  c b'));
  assert.ok(filterMatches('a b', 'a\n b'), 'the text is collapsed as well');
});

// ---------- beside a facet filter ----------
// Chooses the control with this key in the first facet group, as a click does:
// checked, then "change" bubbling from the radio button.
function choose(root, key){
  const inputs = Array.from(root.querySelectorAll('.' + FACETS_CLASS + ' input'));
  for (const input of inputs) input.checked = input.classList.contains('dokufix-facet-' + key);
  const input = inputs.find(i => i.checked);
  input.dispatchEvent(new (root.ownerDocument.defaultView.Event)('change', { bubbles: true }));
}
for (const [order, head] of [['filter, then facets', marker('filter') + marker('facets Typ')], ['facets, then filter', marker('facets Typ') + marker('filter')]]){
  test('with facets (' + order + '): both act; a row is shown when both hold, and the counter counts those out of all rows', () => {
    const root = rendered(head + FIELDS_TABLE);
    assert.deepEqual(warnings(root), []);
    const group = root.querySelector('.' + FACETS_CLASS);
    assert.ok(group, 'the facet filter is built');
    // The field stands between the controls and the wrapper.
    assert.deepEqual(Array.from(group.children).map(c => c.tagName + '.' + c.className), ['FIELDSET.dokufix-facet-bar', 'DIV.' + FILTER_CLASS, 'DIV.' + TABLE_CLASS]);
    assert.equal(state(root).count, '14 Zeilen');
    // "Text" is the key 4: ORT, TELEFON, QUELLE_SEITE, WUNSCH_TOUR.
    choose(root, 4);
    assert.equal(state(root).count, '4 von 14 Zeilen', 'a value chosen, no term');
    type(root, 'tour');
    // The filter hides by its class the rows without the term; the facet
    // filter by its rule the rows without the value. Shown are both.
    assert.deepEqual(state(root).shown, ['ORT', 'WUNSCH_TOUR', 'TOUR_FAHRER']);
    const both = Array.from(root.querySelectorAll('tbody tr')).filter(tr => !tr.classList.contains(FILTER_OUT_CLASS) && tr.classList.contains('dokufix-facet-4'));
    assert.deepEqual(both.map(tr => tr.querySelector('td').textContent), ['ORT', 'WUNSCH_TOUR']);
    assert.equal(state(root).count, '2 von 14 Zeilen');
    choose(root, 0);
    assert.equal(state(root).count, '3 von 14 Zeilen', 'back to all values');
  });
}

// ---------- markers that cannot act ----------
test('the wrong block: "filter" before a list, a paragraph, nothing; the warning names a table, and no field is made', () => {
  for (const [what, html] of [['a list', '<ul>\n<li>a</li>\n</ul>\n'], ['a paragraph', '<p>Text</p>\n'], ['nothing', '']]){
    const root = rendered(marker('filter "Suchen …"') + html);
    assert.deepEqual(warnings(root), [W.table('dokufix: filter "Suchen …"')], what);
    assert.equal(root.querySelectorAll('.' + FILTER_CLASS + ', [' + FILTER_ATTR + ']').length, 0, what);
  }
});
test('"filter" twice before one table: one field, the second marker warns', () => {
  const root = rendered(marker('filter "Eins"') + marker('filter "Zwei"') + FIELDS_TABLE);
  assert.equal(root.querySelectorAll('.' + FILTER_CLASS).length, 1);
  assert.equal(root.querySelector('.' + FILTER_INPUT_CLASS).getAttribute('placeholder'), 'Eins', 'the first acts');
  assert.deepEqual(warnings(root), [W.twice('dokufix: filter "Zwei"')]);
});

// ---------- once per table ----------
test('a second run of the pass, and a second run of all passes, leave exactly one field per table', () => {
  const root = rendered(marker('filter') + FIELDS_TABLE + marker('filter') + marker('facets Typ') + FIELDS_TABLE);
  assert.equal(root.querySelectorAll('.' + FILTER_CLASS).length, 2);
  type(root, 'tour');
  attachTableFilters(root);
  assert.equal(root.querySelectorAll('.' + FILTER_CLASS).length, 2);
  assert.equal(state(root).count, '3 von 14 Zeilen', 'the field that was there is the one that counts');
  buildTables(root);
  applyMarkers(root);
  attachTableFilters(root);
  assert.equal(root.querySelectorAll('.' + FILTER_CLASS).length, 2);
});
test('an author\'s element with the class of the field directly above a marked table is no field: the table gets its own', () => {
  const root = rendered('<div class="dokufix-filter">vom Autor</div>\n' + marker('filter') + FIELDS_TABLE);
  const own = root.querySelectorAll('.' + FILTER_CLASS + '[' + TRANSIENT_ATTR + ']');
  assert.equal(own.length, 1);
  assert.ok(own[0].nextElementSibling.classList.contains(TABLE_CLASS));
  assert.equal(own[0].previousElementSibling.textContent, 'vom Autor', 'the author\'s element stays');
  attachTableFilters(root);
  assert.equal(root.querySelectorAll('.' + FILTER_CLASS + '[' + TRANSIENT_ATTR + ']').length, 1, 'still one field after a second run');
});
test('without a wrapper (the pass "Tabellen" failed) the field stands directly above the table', () => {
  const root = rootWith(marker('filter') + FIELDS_TABLE);
  applyMarkers(root);
  attachTableFilters(root);
  assert.equal(root.querySelector('.' + FILTER_CLASS).nextElementSibling.tagName, 'TABLE');
  attachTableFilters(root);
  assert.equal(root.querySelectorAll('.' + FILTER_CLASS).length, 1);
});

// ---------- Escape ----------
function escape(target){
  const ev = new (target.ownerDocument.defaultView.Event)('keydown', { bubbles: true, cancelable: true });
  ev.key = 'Escape';
  target.dispatchEvent(ev);
  return ev;
}
test('Escape in a field with text empties it and goes no further; in an empty field it reaches the page, which leaves read mode there', () => {
  const root = rendered(marker('filter') + FIELDS_TABLE);
  let reached = 0;
  root.ownerDocument.addEventListener('keydown', () => reached++);
  type(root, 'tour');
  const input = root.querySelector('.' + FILTER_INPUT_CLASS);
  const ev = escape(input);
  assert.equal(input.value, '');
  assert.equal(state(root).count, '14 Zeilen');
  assert.equal(reached, 0, 'read mode stays');
  assert.ok(ev.defaultPrevented);
  escape(input);
  assert.equal(reached, 1, 'in an empty field Escape does what it does everywhere');
});

// ---------- the export step ----------
test('the export step takes out the mark of the table and the class of a hidden row; with the transient elements gone, nothing of the filter is left', () => {
  const root = rendered(marker('filter "Suchen …"') + marker('facets Typ') + FIELDS_TABLE);
  type(root, 'tour');
  assert.equal(root.querySelectorAll('.' + FILTER_OUT_CLASS).length, 11);
  const copy = root.cloneNode(true);
  removeTransient(copy);
  removeFilterMarks(copy);
  assert.ok(!/dokufix-filter|data-dokufix-transient/.test(copy.outerHTML), 'no field, no mark, no hidden row');
  // A row that had no class of its own has none again; the facet keys stay.
  assert.ok(Array.from(copy.querySelectorAll('tbody tr')).every(tr => /^dokufix-facet-row dokufix-facet-\d+$/.test(tr.getAttribute('class'))));
  const plain = rendered(marker('filter') + FIELDS_TABLE);
  type(plain, 'tour');
  const plainCopy = plain.cloneNode(true);
  removeTransient(plainCopy);
  removeFilterMarks(plainCopy);
  assert.equal(plainCopy.querySelectorAll('tr[class]').length, 0, 'no row has a class');
  assert.equal(plainCopy.innerHTML, rendered(FIELDS_TABLE).innerHTML, 'the table as it is without the marker');
  // The live page is not touched by the step.
  assert.equal(plain.querySelectorAll('.' + FILTER_OUT_CLASS).length, 11);
});
test('the step sits in the export path, after the transient elements are gone and before the images', () => {
  const src = fs.readFileSync(path.join(here, '../src/app/downloads/export-body.js'), 'utf8');
  assert.match(src, /const EXPORT_STEPS = \[removeTransientElements, removeFilterMarks, inlineImages\];/);
});
test('applyFilter works on the table it is handed and returns how many rows are shown', () => {
  const root = rootWith(FIELDS_TABLE);
  assert.equal(applyFilter(root.querySelector('table'), 'datum', null), 2);
  assert.equal(root.querySelectorAll('.' + FILTER_OUT_CLASS).length, 12);
});

// ---------- the pass has its place in the list ----------
test('render.js runs the pass "Tabellenfilter" as a run-time pass, after every document pass', () => {
  // render.js looks up elements of the page when it loads, so it is read, not imported.
  const src = fs.readFileSync(path.join(here, '../src/app/render.js'), 'utf8');
  const list = src.slice(src.indexOf('export const RUNTIME_PASSES = ['), src.indexOf('];', src.indexOf('export const RUNTIME_PASSES = [')));
  assert.match(list, /\{ name: 'Tabellenfilter', run: attachTableFilters \}/);
  const documentPasses = src.slice(src.indexOf('export const DOCUMENT_PASSES = ['), src.indexOf('];', src.indexOf('export const DOCUMENT_PASSES = [')));
  assert.ok(!documentPasses.includes('attachTableFilters'), 'not a document pass');
});

// ---------- the look in the document styles ----------
const docCss = fs.readFileSync(path.join(here, '../src/doc.css'), 'utf8');
const bare = docCss.replace(/\/\*[\s\S]*?\*\//g, '');
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
// The text between the braces of every block that starts with this head.
function blocksOf(css, head){
  const found = [];
  for (let at = css.indexOf(head); at >= 0; at = css.indexOf(head, at + 1)){
    const open = css.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < css.length; i++){
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0){ found.push(css.slice(open + 1, i)); break; }
    }
  }
  return found;
}
test('on screen the field is shown and a row that does not match is hidden; in print neither: no field, every row', () => {
  const screen = blocksOf(bare, '@media not print').find(b => b.includes('.dokufix-filter'));
  assert.ok(screen, 'a block "@media not print" for the filter');
  assert.equal(ruleOf(screen, '.dokufix-doc .dokufix-filter').display, 'flex');
  assert.equal(ruleOf(screen, '.dokufix-doc .dokufix-filter-out').display, 'none');
  const outside = bare.replace('@media not print{' + screen + '}', '');
  assert.equal(ruleOf(outside, '.dokufix-doc .dokufix-filter').display, 'none');
  assert.ok(!outside.includes('.dokufix-filter-out'), 'no row is hidden outside the block');
});
test('nothing the field adds is positioned or made a containing block', () => {
  const rules = Array.from(bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)).flatMap(m => m[1].split(',').map(s => ({ selector: s.replace(/\s+/g, ' ').trim(), body: m[2] })));
  const about = rules.filter(r => /\.dokufix-filter/.test(r.selector));
  assert.ok(about.length >= 5, about.map(r => r.selector).join(' | '));
  for (const r of about){
    for (const property of ['position', 'transform', 'translate', 'rotate', 'scale', 'filter', 'backdrop-filter', 'perspective', 'contain', 'container-type', 'container', 'will-change', 'content-visibility', 'overflow', 'overflow-x', 'overflow-y']){
      assert.ok(!new RegExp('(?:^|;|\\s)' + property + '\\s*:').test(r.body), r.selector + ' sets ' + property);
    }
  }
});
test('the look: a field of at most 320 px, the counter small and grey beside it, the focus outline in the link colour', () => {
  const input = ruleOf(bare, '.dokufix-doc .dokufix-filter-input');
  assert.equal(input.width, '320px');
  assert.equal(input['max-width'], '100%');
  assert.match(ruleOf(bare, '.dokufix-doc .dokufix-filter-count')['font-size'], /^1[0-3]px$/);
  assert.equal(ruleOf(bare, '.dokufix-doc .dokufix-filter-input:focus-visible').outline, '2px solid #0066cc');
});
test('the built file carries the rules and the entry of the marker', () => {
  const built = fs.readFileSync(path.join(here, '../dist/dokufix.html'), 'utf8');
  const block = built.match(/<style id="dokufix-doc-css">([\s\S]*?)<\/style>/);
  assert.ok(block, 'the block of the document styles');
  for (const name of ['.dokufix-filter{display:none', '.dokufix-filter-input{', '.dokufix-filter-count{', '@media not print{.dokufix-doc .dokufix-filter{display:flex}.dokufix-doc .dokufix-filter-out{display:none}}']){
    assert.ok(block[1].includes(name), name);
  }
  assert.ok(built.includes('name:"filter"'), 'the entry of the marker');
  assert.ok(built.includes('"Tabellenfilter"'), 'the run-time pass');
});
