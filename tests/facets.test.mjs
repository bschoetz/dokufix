// The facet filter of a table, run in Node: no browser, no page.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/facets.js is a module of pure logic, so this file imports it as it
// is and hands the marker pass a fragment that linkedom parses. The markup of
// every Markdown table is what marked 18.0.14 emits for the Markdown named
// beside it, measured in Chromium with { gfm: true, breaks: false } as
// render() calls it; marked itself comes from the CDN and is not installed
// here. A table written as HTML arrives as written; linkedom adds no <tbody>
// where the browser's parser would, so both forms stand here.
//
// The cases are the matrix of the story as far as it needs no layout: which
// controls a column gives, what the value of a cell is, how values are kept
// apart, that markup in a heading or a cell stays text, which marker becomes
// a warning and with which words.
//
// The last cases read src/doc.css and the built file: the rules that hide
// rows are fixed, one per key from 1 to FACET_MAX, and nothing generates one.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { MARKERS, BLOCKS, readMarker, judgeMarker, refusedMarker, applyMarkers } from '../src/app/markers.js';
import {
  FACETS, FACET_MAX, FACETS_CLASS, FACET_BAR_CLASS, FACET_CONTROLS_CLASS, FACET_COUNT_CLASS, FACET_ROW_CLASS, FACET_ALL, FACET_EMPTY, FACET_REFUSALS,
  facetKeyClass, facetGroupName, findFacetColumn, groupFacetValues, planFacets, facetValue, buildFacets,
} from '../src/app/facets.js';
import { buildChips } from '../src/app/chips.js';
import { buildTables, TABLE_CLASS } from '../src/app/tables.js';
import { buildWarning } from '../src/app/warning.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// A root like the preview, holding the given markup.
function rootWith(html){
  const { document } = parseHTML('<!DOCTYPE html><html><body><article id="root" class="dokufix-doc">' + html + '</article></body></html>');
  return document.getElementById('root');
}
// The marker pass over the markup; returns the root.
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
const warningHtml = text => buildWarning(rootWith('').ownerDocument, text).outerHTML;
const warnings = root => Array.from(root.querySelectorAll('.dokufix-warning')).map(w => w.textContent);
function comments(root){
  const out = [];
  const walk = node => { for (const child of node.childNodes){ if (child.nodeType === 8) out.push(child.data); else if (child.nodeType === 1) walk(child); } };
  walk(root);
  return out;
}

// A Markdown table as marked emits it. head: the header cells; rows: the
// cells of each row, each as the HTML marked writes into the cell.
function table(head, rows){
  return '<table>\n<thead>\n<tr>\n' + head.map(h => '<th>' + h + '</th>\n').join('') + '</tr>\n</thead>\n<tbody>' +
    rows.map(row => '<tr>\n' + row.map(cell => '<td>' + cell + '</td>\n').join('') + '</tr>\n').join('') + '</tbody></table>\n';
}
const marker = text => '<!-- dokufix: ' + text + ' -->\n';

// What a group shows: the legend and, per control, its label's text, its
// count, its key, the name of its group and whether it carries "checked".
function describe(group){
  const bar = group.querySelector(':scope > fieldset.' + FACET_BAR_CLASS);
  return {
    legend: bar.querySelector(':scope > legend').textContent,
    controls: Array.from(bar.querySelectorAll(':scope > .dokufix-facet-controls > label')).map(label => {
      const input = label.querySelector(':scope > input');
      const count = label.querySelector(':scope > .' + FACET_COUNT_CLASS);
      const text = Array.from(label.childNodes).filter(n => n.nodeType === 3).map(n => n.data).join('');
      return [text.trim(), Number(count.textContent), input.className, input.getAttribute('name'), input.hasAttribute('checked')];
    }),
  };
}
// The labels of the controls with their counts, "Text 2".
const pills = group => describe(group).controls.map(c => c[0] + ' ' + c[1]);
// The keys of the data rows, in the order of the table.
const rowKeys = group => Array.from(group.querySelectorAll('tr.' + FACET_ROW_CLASS)).map(tr => tr.className);

// The words of the warnings, written out here a second time on purpose: a
// reader sees them, so a change to them is a change this file has to be told.
const W = {
  table: written => 'Die Markierung „' + written + '“ erwartet direkt danach eine Tabelle.',
  noColumn: written => 'Die Markierung „' + written + '“ nennt keine Spalte.',
  noHeader: written => 'Die Markierung „' + written + '“ braucht eine Tabelle mit Kopfzeile.',
  unknownColumn: written => 'Die Markierung „' + written + '“ nennt eine Spalte, die die Tabelle nicht hat.',
  tooMany: (written, count) => 'Die Markierung „' + written + '“ trifft auf ' + count + ' verschiedene Werte in ihrer Spalte; mehr als 32 kann sie nicht filtern.',
  nested: written => 'Die Markierung „' + written + '“ steht in einer Tabelle, die schon gefiltert wird.',
  list: written => 'Die Markierung „' + written + '“ erwartet direkt danach eine Aufzählung.',
  twice: written => 'Die Markierung „' + written + '“ steht mehr als einmal vor demselben Block.',
};

// ---------- the entry ----------
test('the entry: "facets" before a table, handed what follows its name', () => {
  assert.deepEqual([FACETS.name, FACETS.block, FACETS.argument], ['facets', 'TABLE', 'text']);
  assert.ok(FACETS.apply === buildFacets);
  assert.ok(MARKERS.includes(FACETS), 'it stands in the one list of markers');
  assert.equal(BLOCKS.TABLE, 'eine Tabelle');
  assert.ok(judgeMarker(readMarker('dokufix: facets Typ'), 'TABLE').entry === FACETS);
  assert.ok(judgeMarker(readMarker('dokufix: facets "Entgelt je Woche"'), 'TABLE').entry === FACETS);
  // No column named is the component's to refuse, not the list's.
  assert.ok(judgeMarker(readMarker('dokufix: facets'), 'TABLE').entry === FACETS);
  assert.deepEqual(judgeMarker(readMarker('dokufix: facets Typ'), 'UL'), { warning: W.table('dokufix: facets Typ') });
  assert.equal(FACET_MAX, 32);
});

// ---------- the controls ----------
// <!-- dokufix: facets Typ -->
// | Merkmal | Typ | Wofür |
// |---|---|---|
// | ORT | Text | Tour |
// | STATUS | Kategorie | Stand |
// | TELEFON | Text | Rückruf |
// | ANLASS | Datum | Wann |
const FIELDS = table(['Merkmal', 'Typ', 'Wofür'], [['ORT', 'Text', 'Tour'], ['STATUS', 'Kategorie', 'Stand'], ['TELEFON', 'Text', 'Rückruf'], ['ANLASS', 'Datum', 'Wann']]);
test('facets: one control per distinct value of the column with its row count, in the order of first appearance, plus one for all rows, chosen; the comment is gone', () => {
  const root = passOver(marker('facets Typ') + FIELDS);
  const group = root.firstElementChild;
  assert.equal(group.tagName, 'DIV');
  assert.equal(group.className, 'dokufix-facets');
  assert.deepEqual(describe(group), {
    legend: 'Typ',
    controls: [
      ['Alle', 4, 'dokufix-facet-0', 'dokufix-facet-1', true],
      ['Text', 2, 'dokufix-facet-1', 'dokufix-facet-1', false],
      ['Kategorie', 1, 'dokufix-facet-2', 'dokufix-facet-1', false],
      ['Datum', 1, 'dokufix-facet-3', 'dokufix-facet-1', false],
    ],
  });
  assert.deepEqual(Array.from(group.querySelectorAll('input')).map(i => i.getAttribute('type')), ['radio', 'radio', 'radio', 'radio']);
  // The group holds the bar and the table, in that order, and nothing else.
  assert.deepEqual(Array.from(group.children).map(c => c.tagName), ['FIELDSET', 'TABLE']);
  assert.deepEqual(rowKeys(group), ['dokufix-facet-row dokufix-facet-1', 'dokufix-facet-row dokufix-facet-2', 'dokufix-facet-row dokufix-facet-1', 'dokufix-facet-row dokufix-facet-3']);
  // The header row is no data row.
  assert.equal(group.querySelector('thead tr').attributes.length, 0);
  assert.deepEqual(comments(root), []);
  assert.deepEqual(warnings(root), []);
  assert.equal(root.lastChild.data, '\n', 'the line break behind the table stays behind the group');
  assert.equal(FACETS_CLASS, 'dokufix-facets');
  assert.equal(FACET_BAR_CLASS, 'dokufix-facet-bar');
  assert.equal(FACET_CONTROLS_CLASS, 'dokufix-facet-controls');
  // The bar holds the legend and one container with every control, in that order.
  assert.deepEqual(Array.from(group.querySelector('fieldset').children).map(c => c.tagName + '.' + c.className), ['LEGEND.', 'DIV.dokufix-facet-controls']);
  assert.equal(FACET_ROW_CLASS, 'dokufix-facet-row');
  assert.equal(FACET_COUNT_CLASS, 'dokufix-facet-count');
  assert.equal(FACET_ALL, 'Alle');
  assert.equal(facetKeyClass(7), 'dokufix-facet-7');
  assert.equal(facetGroupName(2), 'dokufix-facet-2');
});
test('facets: the table itself is what it was, apart from the keys on its data rows', () => {
  const root = passOver(marker('facets Typ') + FIELDS);
  const now = root.querySelector('table').outerHTML.replace(/ class="dokufix-facet-row dokufix-facet-\d+"/g, '');
  assert.equal(now + '\n', FIELDS);
});
test('facets: nothing is generated per table: no <style>, no inline style, no id', () => {
  const root = passOver(marker('facets Typ') + FIELDS + marker('facets Merkmal') + FIELDS);
  assert.equal(root.querySelectorAll('style, [style], [id]').length, 0);
  // And the module has no way to: it neither makes a style element nor writes a style.
  const src = fs.readFileSync(path.join(here, '../src/app/facets.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/createElement\(\s*['"]style['"]/.test(src) && !/\.style\b/.test(src) && !/innerHTML|insertAdjacentHTML|outerHTML/.test(src), 'createElement and textContent only');
});
test('facets: the controls of the second table of a document are a group of their own', () => {
  const root = passOver(marker('facets Typ') + FIELDS + '<p>dazwischen</p>\n' + marker('facets Wofür') + FIELDS);
  const groups = Array.from(root.querySelectorAll('.' + FACETS_CLASS));
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(g => [...new Set(describe(g).controls.map(c => c[3]))]), [['dokufix-facet-1'], ['dokufix-facet-2']]);
  // Each has its own control for all rows, chosen; the keys start at 1 in both.
  assert.deepEqual(groups.map(g => describe(g).controls.filter(c => c[4]).map(c => c[0])), [['Alle'], ['Alle']]);
  assert.deepEqual(pills(groups[1]), ['Alle 4', 'Tour 1', 'Stand 1', 'Rückruf 1', 'Wann 1']);
});
test('facets: a table without data rows gets the control for all rows alone', () => {
  const root = passOver(marker('facets B') + '<table>\n<thead>\n<tr>\n<th>A</th>\n<th>B</th>\n</tr>\n</thead>\n</table>\n');
  assert.deepEqual(pills(root.querySelector('.' + FACETS_CLASS)), ['Alle 0']);
  assert.deepEqual(warnings(root), []);
});

// ---------- the value of a cell ----------
test('values are kept apart exactly: "C", "C++", "C#", two scripts and an empty cell are six controls', () => {
  // | Name | Sprache |      | a | C |   | b | C++ |   | c | C# |   | d | 日本語 |   | e | 中文 |   | f | |
  const root = passOver(marker('facets Sprache') + table(['Name', 'Sprache'], [['a', 'C'], ['b', 'C++'], ['c', 'C#'], ['d', '日本語'], ['e', '中文'], ['f', '']]));
  assert.deepEqual(pills(root.querySelector('.' + FACETS_CLASS)), ['Alle 6', 'C 1', 'C++ 1', 'C# 1', '日本語 1', '中文 1', '(leer) 1']);
  assert.equal(FACET_EMPTY, '(leer)');
});
test('values are compared with their case; white space is collapsed', () => {
  // | x | Text |   | x | text |   | x | Zwei  Worte |   | x | Zwei Worte |
  const root = passOver(marker('facets B') + table(['A', 'B'], [['x', 'Text'], ['x', 'text'], ['x', 'Zwei  Worte'], ['x', ' Zwei Worte '], ['x', 'Text']]));
  assert.deepEqual(pills(root.querySelector('.' + FACETS_CLASS)), ['Alle 5', 'Text 2', 'text 1', 'Zwei Worte 2']);
});
test('the value of a cell is its first line: what follows a line break does not count', () => {
  // | PK | Ja/Nein<br>*je eines* |   | ERLAUBNIS | Ja/Nein |   | x | **Fett**<br>mehr |   | y | <br>nur unten |
  const root = passOver(marker('facets Typ') + table(['Merkmal', 'Typ'],
    [['PK', 'Ja/Nein<br><em>je eines</em>'], ['ERLAUBNIS', 'Ja/Nein'], ['x', '<strong>Fett</strong><br>mehr'], ['y', '<br>nur unten']]));
  assert.deepEqual(pills(root.querySelector('.' + FACETS_CLASS)), ['Alle 4', 'Ja/Nein 2', 'Fett 1', '(leer) 1']);
  const cell = html => rootWith('<table><tbody><tr><td>' + html + '</td></tr></tbody></table>').querySelector('td');
  assert.equal(facetValue(cell('Ja/Nein<br><em>je eines</em>')), 'Ja/Nein');
  // A line break inside bold text ends the line as well.
  assert.equal(facetValue(cell('<strong>oben<br>unten</strong> danach')), 'oben');
  assert.equal(facetValue(cell('  viel \n  Raum  ')), 'viel Raum');
  assert.equal(facetValue(cell('')), '');
  assert.equal(facetValue(null), '', 'no cell at that place: an empty value');
});
test('a column of status chips: the value is the chip\'s label, without the word for assistive technology', () => {
  // | Gerät | Status |   | Automat 1 | `🟢 Live` |   | Automat 2 | `🔴 Aus`<br>*seit Mai* |   | Automat 3 | `🟢 Live` |   | Automat 4 | `🔴 Live` |
  const root = rootWith(marker('facets Status') + table(['Gerät', 'Status'],
    [['Automat 1', '<code>🟢 Live</code>'], ['Automat 2', '<code>🔴 Aus</code><br><em>seit Mai</em>'], ['Automat 3', '<code>🟢 Live</code>'], ['Automat 4', '<code>🔴 Live</code>']]));
  buildChips(root);          // as in render.js: the chips are chips when the markers are applied
  applyMarkers(root);
  const group = root.querySelector('.' + FACETS_CLASS);
  // The label is the value: a green "Live" and a red "Live" are one value.
  assert.deepEqual(pills(group), ['Alle 4', 'Live 3', 'Aus 1']);
  assert.ok(!group.querySelector('fieldset').textContent.includes('grün'), 'the word is in no control');
  assert.equal(group.querySelectorAll('fieldset .dokufix-chip').length, 0, 'a control holds text, no chip');
  // The cells keep their chips, word included.
  assert.equal(group.querySelectorAll('td .dokufix-chip-status').length, 4);
});
test('a footnote marker is no part of a value, in a cell or in the heading', () => {
  // | Name[^a] | Art |   | Beta[^a] | x |   | Beta | y |
  const ref = '<sup><a id="footnote-ref-a" href="#footnote-a" data-footnote-ref="" aria-describedby="footnote-label">1</a></sup>';
  const root = passOver(marker('facets Name') + table(['Name' + ref, 'Art'], [['Beta' + ref, 'x'], ['Beta', 'y']]));
  const group = root.querySelector('.' + FACETS_CLASS);
  assert.equal(describe(group).legend, 'Name');
  assert.deepEqual(pills(group), ['Alle 2', 'Beta 2']);
  // After the preview pass a marker carries its preview; that is no part either.
  const cell = rootWith('<table><tbody><tr><td>Beta<sup class="dokufix-fn-host"><a href="#footnote-back-a" data-footnote-ref="">1</a><span class="dokufix-fn-preview" aria-hidden="true">Die Fußnote.</span></sup></td></tr></tbody></table>').querySelector('td');
  assert.equal(facetValue(cell), 'Beta');
});
test('markup in a heading or a cell is text in legend and control: no element is made of it', () => {
  // <!-- dokufix: facets Art <img src=x onerror=alarm()> -->
  // | Art \<img src=x onerror=alarm()\> | B |
  // | \<b\>neu\</b\> | 1 |      | A &amp; B | 2 |
  const root = passOver('<!-- dokufix: facets Art <img src=x onerror=alarm()> -->\n' +
    table(['Art &lt;img src=x onerror=alarm()&gt;', 'B'], [['&lt;b&gt;neu&lt;/b&gt;', '1'], ['A &amp; B', '2']]));
  const group = root.querySelector('.' + FACETS_CLASS);
  assert.ok(group, 'the column is found by its text');
  assert.equal(describe(group).legend, 'Art <img src=x onerror=alarm()>');
  assert.deepEqual(pills(group), ['Alle 2', '<b>neu</b> 1', 'A & B 1']);
  const bar = group.querySelector('fieldset');
  assert.equal(bar.querySelectorAll('img, b, script').length, 0);
  assert.deepEqual([...new Set(Array.from(bar.querySelectorAll('*')).map(el => el.tagName))].sort(), ['DIV', 'INPUT', 'LABEL', 'LEGEND', 'SPAN']);
  assert.ok(bar.innerHTML.includes('&lt;img src=x onerror=alarm()&gt;'), bar.innerHTML);
  // Markup that is markup in the cell, written as HTML, is read as its text.
  const raw = passOver(marker('facets B') + '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><a href="https://example.org" onclick="alarm()">Verweis</a></td></tr></tbody></table>');
  assert.deepEqual(pills(raw.querySelector('.' + FACETS_CLASS)), ['Alle 1', 'Verweis 1']);
  assert.equal(raw.querySelectorAll('fieldset a, fieldset [onclick]').length, 0);
});

// ---------- the column ----------
test('the column is found by the first line of its heading: any case, white space collapsed, with or without double quotes, the first match', () => {
  const head = ['Medium', 'Entgelt je Woche<br><em>bei Verzug</em>', 'Größe', 'medium'];
  const rows = [['Buch', '1,00 €', 'klein', 'zweite']];
  const columnOf = text => { const g = passOver(marker(text) + table(head, rows)).querySelector('.' + FACETS_CLASS); return g ? pills(g)[1] : null; };
  assert.equal(columnOf('facets Entgelt je Woche'), '1,00 € 1');
  assert.equal(columnOf('facets "Entgelt je Woche"'), '1,00 € 1');
  assert.equal(columnOf('facets   entgelt   JE woche '), '1,00 € 1');
  assert.equal(columnOf('facets GRÖSSE'), null, 'ß is not SS');
  assert.equal(columnOf('facets größe'), 'klein 1');
  assert.equal(columnOf('facets medium'), 'Buch 1', 'the first column of that name');
  assert.equal(columnOf('facets Entgelt'), null, 'the whole first line, not its beginning');
  // The legend is the heading as the table writes it, not as the marker does.
  assert.equal(describe(passOver(marker('facets größe') + table(head, rows)).querySelector('.' + FACETS_CLASS)).legend, 'Größe');
  assert.equal(findFacetColumn(['A', ' b  c ', 'B C'], 'b c'), 1);
  assert.equal(findFacetColumn(['A', ''], ''), 1, 'the function itself compares; an empty name is refused before it is asked');
  assert.equal(findFacetColumn(['A'], 'B'), -1);
});

// ---------- tables written as HTML ----------
test('merged cells: a cell that spans columns is the cell of each of them; nothing throws', t => {
  // <!-- dokufix: facets B -->
  // <table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td colspan="2">beides</td></tr><tr><td>1</td><td>x</td></tr><tr><td>nur a</td></tr></tbody></table>
  const { result: root, logged } = quiet(t, () => passOver(marker('facets B') +
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td colspan="2">beides</td></tr><tr><td>1</td><td>x</td></tr><tr><td>nur a</td></tr></tbody></table>\n'));
  assert.deepEqual(pills(root.querySelector('.' + FACETS_CLASS)), ['Alle 3', 'beides 1', 'x 1', '(leer) 1']);
  assert.deepEqual(warnings(root), []);
  assert.deepEqual(logged, []);
});
test('merged cells in the header row: the column\'s place counts colspan', () => {
  const root = passOver(marker('facets Art') +
    '<table><thead><tr><th colspan="2">Name</th><th>Art</th></tr></thead><tbody><tr><td>a</td><td>b</td><td>eins</td></tr><tr><td colspan="3">alles</td></tr></tbody></table>');
  assert.deepEqual(pills(root.querySelector('.' + FACETS_CLASS)), ['Alle 2', 'eins 1', 'alles 1']);
  // The second column under "Name" has no name of its own.
  const none = passOver(marker('facets ""') + '<table><thead><tr><th colspan="2">Name</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
  assert.deepEqual(warnings(none), ['Warnung: ' + W.noColumn('dokufix: facets ""')]);
  // A colspan that is no number counts as one column.
  const odd = passOver(marker('facets B') + '<table><thead><tr><th colspan="x">A</th><th>B</th></tr></thead><tbody><tr><td colspan="0">1</td><td>zwei</td></tr></tbody></table>');
  assert.deepEqual(pills(odd.querySelector('.' + FACETS_CLASS)), ['Alle 1', 'zwei 1']);
});
test('a table written as HTML without <thead>: its first row is the header row when all its cells are <th>', () => {
  // As linkedom parses it, rows directly in the table; and as a browser does, in a <tbody>.
  for (const [open, close] of [['', ''], ['<tbody>', '</tbody>']]){
    const root = passOver(marker('facets Art') + '<table>' + open + '<tr><th>Name</th><th>Art</th></tr><tr><td>a</td><td>eins</td></tr><tr><td>b</td><td>eins</td></tr>' + close + '</table>');
    const group = root.querySelector('.' + FACETS_CLASS);
    assert.deepEqual(pills(group), ['Alle 2', 'eins 2'], open || 'rows in the table');
    assert.deepEqual(Array.from(group.querySelectorAll('tr')).map(tr => tr.className), ['', 'dokufix-facet-row dokufix-facet-1', 'dokufix-facet-row dokufix-facet-1']);
  }
});
test('data rows are the rows of the table\'s own bodies: not <tfoot>, not a second header row, not the rows of a table in a cell', () => {
  const root = passOver(marker('facets Art') +
    '<table><thead><tr><th>Name</th><th>Art</th></tr><tr><th>zweite</th><th>Kopfzeile</th></tr></thead>' +
    '<tbody><tr><td>a</td><td>eins</td></tr></tbody>' +
    '<tbody><tr><td>b<table><tbody><tr><td>innen</td><td>innen</td></tr></tbody></table></td><td>zwei</td></tr></tbody>' +
    '<tfoot><tr><td>Summe</td><td>2</td></tr></tfoot></table>');
  const group = root.querySelector('.' + FACETS_CLASS);
  assert.deepEqual(pills(group), ['Alle 2', 'eins 1', 'zwei 1']);
  assert.equal(group.querySelectorAll('tr.' + FACET_ROW_CLASS).length, 2);
  assert.equal(group.querySelector('tfoot tr').className, '');
  assert.equal(group.querySelector('table table tr').className, '');
});

// ---------- markers that cannot take effect ----------
const SMALL = table(['A', 'Typ'], [['1', 'x'], ['2', 'y']]);
const REFUSED = [
  ['a column the table does not have, "facets Tpy"', marker('facets Tpy') + SMALL, W.unknownColumn('dokufix: facets Tpy')],
  ['no column named, "facets"', marker('facets') + SMALL, W.noColumn('dokufix: facets')],
  ['an empty pair of quotes, "facets """', marker('facets ""') + SMALL, W.noColumn('dokufix: facets ""')],
  ['a table without a header row', marker('facets Typ') + '<table><tbody><tr><td>A</td><td>Typ</td></tr><tr><td>1</td><td>x</td></tr></tbody></table>\n', W.noHeader('dokufix: facets Typ')],
  ['a table whose first row mixes <th> and <td>', marker('facets Typ') + '<table><tr><th>A</th><td>Typ</td></tr><tr><td>1</td><td>x</td></tr></table>\n', W.noHeader('dokufix: facets Typ')],
  ['a <thead> without a row', marker('facets Typ') + '<table><thead></thead><tbody><tr><th>A</th><th>Typ</th></tr></tbody></table>\n', W.noHeader('dokufix: facets Typ')],
  ['more distinct values than there are rules: ' + (FACET_MAX + 1), marker('facets Nr') + table(['Nr', 'B'], Array.from({ length: FACET_MAX + 1 }, (x, i) => ['Regal ' + (i + 1), 'x'])), W.tooMany('dokufix: facets Nr', FACET_MAX + 1)],
];
for (const [name, html, want] of REFUSED){
  test('a warning at the marker\'s place, the table as it was: ' + name, t => {
    const { result: root, logged } = quiet(t, () => passOver(html));
    const tableHtml = html.slice(html.indexOf('<table'));
    assert.equal(root.innerHTML, warningHtml(want) + '\n' + tableHtml);
    assert.deepEqual(comments(root), [], 'the marker is gone');
    assert.equal(root.querySelectorAll('.' + FACETS_CLASS + ', fieldset, input, [class*="dokufix-facet"]').length, 0, 'no controls, no keys');
    assert.deepEqual(logged, [], 'a refusal is no failure: nothing is logged');
  });
}
test('the warning for too many values names both numbers; exactly as many as there are rules can be filtered', () => {
  const many = n => marker('facets Nr') + table(['Nr'], Array.from({ length: n }, (x, i) => ['Regal ' + (i + 1)]));
  assert.deepEqual(warnings(passOver(many(FACET_MAX + 1))), ['Warnung: Die Markierung „dokufix: facets Nr“ trifft auf ' + (FACET_MAX + 1) + ' verschiedene Werte in ihrer Spalte; mehr als ' + FACET_MAX + ' kann sie nicht filtern.']);
  const full = passOver(many(FACET_MAX));
  assert.deepEqual(warnings(full), []);
  assert.equal(pills(full.querySelector('.' + FACETS_CLASS)).length, FACET_MAX + 1);
  // Many rows are no obstacle: it is the distinct values that count.
  const rows = passOver(marker('facets B') + table(['A', 'B'], Array.from({ length: 200 }, (x, i) => [String(i), 'Wert ' + (i % 3)])));
  assert.deepEqual(pills(rows.querySelector('.' + FACETS_CLASS)), ['Alle 200', 'Wert 0 67', 'Wert 1 67', 'Wert 2 66']);
});
test('the wrong block: "facets" before a list, a paragraph, nothing; the warning names a table', () => {
  for (const block of ['<ul>\n<li>a</li>\n</ul>\n', '<p>Ein Absatz.</p>\n', '<ol>\n<li>a</li>\n</ol>\n', '']){
    const root = passOver(marker('facets Typ') + block);
    assert.equal(root.innerHTML, warningHtml(W.table('dokufix: facets Typ')) + '\n' + block, block);
  }
});
test('two markers before one table: "facets" acts, "cards" warns, in either order', () => {
  // <!-- dokufix: cards -->
  // <!-- dokufix: facets Typ -->
  // | A | Typ |
  for (const pair of [marker('cards') + marker('facets Typ'), marker('facets Typ') + marker('cards')]){
    const root = passOver(pair + SMALL);
    assert.deepEqual(warnings(root), ['Warnung: ' + W.list('dokufix: cards')], pair);
    assert.deepEqual(Array.from(root.children).map(c => c.className), ['dokufix-warning', 'dokufix-facets'], pair);
    assert.deepEqual(pills(root.querySelector('.' + FACETS_CLASS)), ['Alle 2', 'x 1', 'y 1']);
    assert.equal(root.querySelector('table').classList.length, 0, 'the table is no list of cards');
  }
});
test('"facets" twice before one table: it acts once, the second is a warning; a marker that was refused does not count', () => {
  const twice = passOver(marker('facets Typ') + marker('facets A') + SMALL);
  assert.deepEqual(warnings(twice), ['Warnung: ' + W.twice('dokufix: facets A')]);
  assert.equal(twice.querySelectorAll('fieldset').length, 1);
  assert.equal(describe(twice.querySelector('.' + FACETS_CLASS)).legend, 'Typ');
  const second = passOver(marker('facets Tpy') + marker('facets Typ') + SMALL);
  assert.deepEqual(warnings(second), ['Warnung: ' + W.unknownColumn('dokufix: facets Tpy')]);
  assert.equal(describe(second.querySelector('.' + FACETS_CLASS)).legend, 'Typ');
});
test('a table inside a table that already filters is refused: one group cannot stand in another', () => {
  // The outer table is written as HTML; the inner marker stands in one of its cells.
  const inner = '<table><thead><tr><th>I</th></tr></thead><tbody><tr><td>p</td></tr><tr><td>q</td></tr></tbody></table>';
  const root = passOver(marker('facets A') + '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>eins<!-- dokufix: facets I -->' + inner + '</td></tr><tr><td>zwei</td></tr></tbody></table>');
  assert.deepEqual(warnings(root), ['Warnung: ' + W.nested('dokufix: facets I')]);
  assert.equal(root.querySelectorAll('.' + FACETS_CLASS).length, 1);
  assert.equal(root.querySelectorAll('fieldset').length, 1);
  assert.equal(root.querySelector('table table').outerHTML, inner);
  // The outer value is the text of its cell, the inner table's included: a known limit.
  assert.deepEqual(pills(root.querySelector('.' + FACETS_CLASS)), ['Alle 2', 'einsIpq 1', 'zwei 1']);
  // In a table that does not filter, the inner one may.
  const free = passOver('<table><tbody><tr><td><!-- dokufix: facets I -->' + inner + '</td></tr></tbody></table>');
  assert.deepEqual(warnings(free), []);
  assert.deepEqual(pills(free.querySelector('td > .' + FACETS_CLASS)), ['Alle 2', 'p 1', 'q 1']);
});
test('the texts of the refusals end the sentence the marker pass starts with the marker as written', () => {
  assert.deepEqual(FACET_REFUSALS.noColumn, 'nennt keine Spalte.');
  assert.equal(refusedMarker(readMarker(' dokufix: facets Tpy '), FACET_REFUSALS.unknownColumn), W.unknownColumn('dokufix: facets Tpy'));
  assert.equal(refusedMarker(readMarker('dokufix: facets Nr'), FACET_REFUSALS.tooMany(40)), W.tooMany('dokufix: facets Nr', 40));
  assert.equal(refusedMarker(readMarker('dokufix: facets I'), FACET_REFUSALS.nested), W.nested('dokufix: facets I'));
  assert.equal(refusedMarker(readMarker('dokufix: facets Typ'), FACET_REFUSALS.noHeader), W.noHeader('dokufix: facets Typ'));
  // A long marker is named with its first 80 characters, as in every warning.
  const long = readMarker(' dokufix: facets ' + 'x'.repeat(200));
  assert.equal(refusedMarker(long, FACET_REFUSALS.unknownColumn).length, 'Die Markierung „“ '.length + 81 + FACET_REFUSALS.unknownColumn.length);
});

// ---------- the pure core ----------
test('groupFacetValues: the distinct values in the order of first appearance, with count and key, and the key of every row', () => {
  assert.deepEqual(groupFacetValues(['b', 'a', 'b', '', 'a', 'b']), {
    groups: [{ value: 'b', label: 'b', count: 3, key: 1 }, { value: 'a', label: 'a', count: 2, key: 2 }, { value: '', label: '(leer)', count: 1, key: 3 }],
    keys: [1, 2, 1, 3, 2, 1],
  });
  assert.deepEqual(groupFacetValues([]), { groups: [], keys: [] });
  // Names of properties every object has are values like any other.
  assert.deepEqual(groupFacetValues(['constructor', '__proto__', 'constructor']).groups.map(g => [g.value, g.count]), [['constructor', 2], ['__proto__', 1]]);
});
test('planFacets: what the marker comes to on a table given as texts', () => {
  const rows = [['a', 'x'], ['b', 'y'], ['c', 'x']];
  const valuesOf = index => rows.map(r => r[index]);
  assert.deepEqual(planFacets('art', ['Name', ' Art '], valuesOf), {
    index: 1, legend: 'Art',
    groups: [{ value: 'x', label: 'x', count: 2, key: 1 }, { value: 'y', label: 'y', count: 1, key: 2 }],
    keys: [1, 2, 1],
  });
  assert.deepEqual(planFacets('  ', ['Name', 'Art'], valuesOf), { warning: FACET_REFUSALS.noColumn });
  assert.deepEqual(planFacets('Art', null, valuesOf), { warning: FACET_REFUSALS.noHeader });
  assert.deepEqual(planFacets('Tpy', ['Name', 'Art'], valuesOf), { warning: FACET_REFUSALS.unknownColumn });
  assert.deepEqual(planFacets('n', ['n'], () => Array.from({ length: 40 }, (x, i) => String(i))), { warning: FACET_REFUSALS.tooMany(40) });
});

// ---------- with the pass "Tabellen" behind it, as in render.js ----------
test('the wrapper of the table stands inside the group, below the controls, and holds the table alone', () => {
  const root = passOver(marker('facets Typ') + FIELDS);
  buildTables(root);
  const group = root.firstElementChild;
  assert.deepEqual(Array.from(group.children).map(c => c.tagName + '.' + c.className), ['FIELDSET.dokufix-facet-bar', 'DIV.' + TABLE_CLASS]);
  assert.deepEqual(Array.from(group.lastElementChild.children).map(c => c.tagName), ['TABLE']);
  // The rule that hides reaches the rows from the group, through the wrapper.
  assert.equal(group.querySelectorAll('.' + TABLE_CLASS + ' tr.' + FACET_ROW_CLASS).length, 4);
});

// ---------- the look in the document styles ----------
const docCss = fs.readFileSync(path.join(here, '../src/doc.css'), 'utf8');
const bare = docCss.replace(/\/\*[\s\S]*?\*\//g, '');
// The text between the braces of the first block that starts with this head.
function blockOf(css, head){
  const at = css.indexOf(head);
  if (at < 0) return null;
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i++){
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  return null;
}
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
const hidingSelector = key => '.dokufix-doc .dokufix-facets:has(.dokufix-facet-' + key + ':checked) .dokufix-facet-row:not(.dokufix-facet-' + key + ')';
test('src/doc.css holds exactly one hiding rule per value from 1 to FACET_MAX, in one rule, written out and not generated', () => {
  const selectors = Array.from(bare.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .flatMap(m => m[1].split(',').map(s => ({ selector: s.replace(/\s+/g, ' ').trim(), body: m[2].trim() })))
    .filter(r => /:has\(\.dokufix-facet-\d+:checked\)/.test(r.selector));
  assert.deepEqual(selectors.map(r => r.selector), Array.from({ length: FACET_MAX }, (x, i) => hidingSelector(i + 1)));
  assert.deepEqual([...new Set(selectors.map(r => r.body))], ['display:none'], 'one rule, and all it does is hide');
  // No key beyond the last, and none for the control of all rows.
  assert.ok(!bare.includes('.dokufix-facet-0'), 'the control for all rows hides nothing');
  assert.ok(!bare.includes('.dokufix-facet-' + (FACET_MAX + 1)));
  // No selector names a table: no id anywhere in the block of the tables.
  const block = bare.slice(bare.indexOf('.dokufix-doc .dokufix-table{'), bare.indexOf('.dokufix-doc .dokufix-cards{'));
  assert.ok(block.length > 1500);
  assert.ok(!/#[A-Za-z_][\w-]*[^;{}]*\{/.test(block.replace(/#[0-9a-f]{3,8}\b/gi, '')), 'no id selector');
});
test('the hiding rule and the visible bar stand inside "@media not print" and "@supports selector(:has(a))": in print and without :has() every row is shown and no control', () => {
  const media = blockOf(bare, '@media not print');
  assert.ok(media, 'the media block');
  const supports = blockOf(media, '@supports selector(:has(a))');
  assert.ok(supports, 'the supports block inside it');
  assert.ok(supports.includes(hidingSelector(1)) && supports.includes(hidingSelector(FACET_MAX)));
  assert.match(supports.replace(/\s+/g, ''), /\.dokufix-doc\.dokufix-facet-bar\{display:block\}/);
  // Outside the two blocks nothing hides a row and nothing shows the bar.
  const outside = bare.replace('@media not print{' + media + '}', '');
  assert.ok(!outside.includes('.dokufix-facet-row'), 'no rule for a row outside the block');
  assert.equal(ruleOf(outside, '.dokufix-doc .dokufix-facet-bar').display, 'none');
  assert.equal((outside.match(/\.dokufix-facet-bar\s*\{/g) || []).length, 1);
});
test('neither the wrapper of a table nor the group of a facet filter is positioned or made a containing block in any other way', () => {
  // The preview of a footnote cited in a cell is placed against the page.
  const rules = Array.from(bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)).flatMap(m => m[1].split(',').map(s => ({ selector: s.replace(/\s+/g, ' ').trim(), body: m[2] })));
  // A rule is about the wrapper or the group when its last compound names one.
  const about = rules.filter(r => /\.dokufix-(table|facets)(?![\w-])[^ >+~]*$/.test(r.selector));
  assert.ok(about.some(r => r.selector === '.dokufix-doc .dokufix-table'), 'the wrapper has its rule');
  for (const r of about){
    for (const property of ['position', 'transform', 'translate', 'rotate', 'scale', 'filter', 'backdrop-filter', 'perspective', 'contain', 'container-type', 'container', 'will-change', 'content-visibility']){
      assert.ok(!new RegExp('(?:^|;|\\s)' + property + '\\s*:').test(r.body), r.selector + ' sets ' + property);
    }
  }
  const wrapper = ruleOf(bare, '.dokufix-doc .dokufix-table');
  assert.equal(wrapper['overflow-x'], 'auto');
  // The table's bottom margin stands on the wrapper: 1em at the table's 14 px.
  assert.equal(wrapper['margin-bottom'], '14px');
  assert.match(ruleOf(bare, '.dokufix-doc table')['font-size'], /^14px$/);
  assert.equal(ruleOf(bare, '.dokufix-doc .dokufix-table > table')['margin-bottom'], '0');
  // In a facet filter the group carries it, so that the rules that take the
  // last child's margin away (callout, card, step) reach the margin itself.
  assert.equal(ruleOf(bare, '.dokufix-doc .dokufix-facets')['margin-bottom'], '14px');
  assert.equal(ruleOf(bare, '.dokufix-doc .dokufix-facets > .dokufix-table')['margin-bottom'], '0');
  for (const host of ['.dokufix-doc .dokufix-callout > :last-child', '.dokufix-doc .dokufix-cards > li > :last-child:not(.dokufix-card-title)', '.dokufix-doc .dokufix-steps > li > :last-child']){
    assert.equal(ruleOf(bare, host)['margin-bottom'], '0', host);
  }
});
test('the controls are a flex container of their own beside the floating legend: every line of them starts beside the legend', () => {
  assert.equal(ruleOf(bare, '.dokufix-doc .dokufix-facet-bar legend').float, 'left');
  const controls = ruleOf(bare, '.dokufix-doc .dokufix-facet-controls');
  assert.ok(controls, 'a rule for the container');
  assert.equal(controls.display, 'flex');
  assert.equal(controls['flex-wrap'], 'wrap');
  assert.equal(controls.gap, '6px');
  assert.equal(ruleOf(bare, '.dokufix-doc .dokufix-facet-bar label').margin, '0', 'the gap is the container\'s');
});
test('the radio button is hidden from the eye, not from the keyboard, and placed against its label', () => {
  const input = ruleOf(bare, '.dokufix-doc .dokufix-facet-bar input');
  assert.ok(input, 'a rule for the radio button');
  assert.equal(input.position, 'absolute');
  assert.equal(input.opacity, '0');
  assert.ok(!('display' in input) && !('visibility' in input), 'neither display:none nor visibility:hidden: it takes the focus');
  assert.equal(ruleOf(bare, '.dokufix-doc .dokufix-facet-bar label').position, 'relative');
  // The chosen control is marked by more than a colour, and the focused one is marked.
  const chosenMark = ruleOf(bare, '.dokufix-doc .dokufix-facet-bar label:has(input:checked)::before');
  assert.ok(chosenMark && chosenMark['border-width'], 'the ring of the chosen control is filled');
  assert.ok(ruleOf(bare, '.dokufix-doc .dokufix-facet-bar label:has(input:focus-visible)').outline);
});
test('the styles of tables and facets use no colour the document styles did not have', () => {
  const start = docCss.indexOf('/* Tables'), end = docCss.indexOf('/* Cards');
  assert.ok(start > 0 && end > start);
  const block = docCss.slice(start, end);
  const before = docCss.slice(0, start) + docCss.slice(end);
  const colours = new Set(Array.from(block.matchAll(/#[0-9a-f]{6}\b/g)).map(m => m[0]));
  assert.ok(colours.size > 0);
  for (const colour of colours) assert.ok(before.includes(colour), colour + ' is a colour of the document styles');
});
test('the built file carries the rules: one hiding selector per value, the bar, the entry of the marker', () => {
  const built = fs.readFileSync(path.join(here, '../dist/dokufix.html'), 'utf8');
  const block = built.match(/<style id="dokufix-doc-css">([\s\S]*?)<\/style>/);
  assert.ok(block, 'the block of the document styles');
  for (let key = 1; key <= FACET_MAX; key++) assert.equal(block[1].split(hidingSelector(key)).length - 1, 1, 'key ' + key);
  assert.ok(!block[1].includes('.dokufix-facet-' + (FACET_MAX + 1) + ':'));
  assert.ok(block[1].includes('@media not print{@supports selector(:has(a)){.dokufix-doc .dokufix-facet-bar{display:block}'));
  for (const name of ['.dokufix-facet-bar{display:none', '.dokufix-facet-bar legend{', '.dokufix-facet-controls{display:flex;flex-wrap:wrap;gap:6px', '.dokufix-facet-bar label{', '.dokufix-facet-bar input{', '.dokufix-facet-count{']){
    assert.ok(block[1].includes(name), name);
  }
  assert.ok(built.includes('name:"facets"'), 'the entry of the marker');
});
