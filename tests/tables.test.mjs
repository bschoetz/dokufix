// The pass "Tabellen", run in Node: no browser, no page.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/tables.js is a module of pure logic, so this file imports it as it
// is and hands the pass a fragment that linkedom parses. The markup of every
// Markdown table is what marked 18.0.14 emits for the Markdown named beside
// it, measured in Chromium with { gfm: true, breaks: false } as render() calls
// it; marked itself comes from the CDN and is not installed here.
//
// The cases: every table gets one wrapper, once, whoever wrote it and wherever
// it stands; and which emphasis in a cell is a sub-line. That a wide table
// scrolls inside its wrapper needs layout and is the comparison run's
// (tests/vergleich.mjs).
//
// The last cases read src/app/render.js, src/doc.css and the built file.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { buildTables, TABLE_CLASS, CELL_SUB_CLASS } from '../src/app/tables.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// A root like the preview, holding the given markup.
function rootWith(html){
  const { document } = parseHTML('<!DOCTYPE html><html><body><article id="root" class="dokufix-doc">' + html + '</article></body></html>');
  return document.getElementById('root');
}
// The pass over the markup; returns the root.
function passOver(html){
  const root = rootWith(html);
  buildTables(root);
  return root;
}
// | A | B |
// |---|---|
// | 1 | 2 |
const TABLE = '<table>\n<thead>\n<tr>\n<th>A</th>\n<th>B</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>1</td>\n<td>2</td>\n</tr>\n</tbody></table>';
const WRAPPED = '<div class="dokufix-table">' + TABLE + '</div>';
// A table of one row, marked writes each cell as given.
const row = (...cells) => '<table>\n<thead>\n<tr>\n<th>Kopf</th>\n</tr>\n</thead>\n<tbody><tr>\n' + cells.map(c => '<td>' + c + '</td>\n').join('') + '</tr>\n</tbody></table>\n';
const subs = root => Array.from(root.querySelectorAll('.' + CELL_SUB_CLASS)).map(el => el.outerHTML);

// ---------- the wrapper ----------
test('a table gets a wrapper around it and is itself what it was', () => {
  const root = passOver('<p>davor</p>\n' + TABLE + '\n<p>danach</p>\n');
  assert.equal(root.innerHTML, '<p>davor</p>\n' + WRAPPED + '\n<p>danach</p>\n');
  assert.equal(TABLE_CLASS, 'dokufix-table');
  // No inline style, no id: how the wrapper scrolls is said in the document styles.
  assert.equal(root.querySelectorAll('[style], [id]').length, 0);
});
test('every table: several in one document, each with a wrapper of its own', () => {
  const root = passOver(TABLE + '\n' + TABLE + '\n<p>dazwischen</p>\n' + TABLE + '\n');
  assert.equal(root.innerHTML, WRAPPED + '\n' + WRAPPED + '\n<p>dazwischen</p>\n' + WRAPPED + '\n');
});
test('every table, at any depth: in a list item, a quotation, a callout, a footnote, a cell of another table', () => {
  // - Punkt
  //
  //   | A | B |
  const item = passOver('<ul>\n<li><p>Punkt</p>\n' + TABLE + '\n</li>\n</ul>\n');
  assert.equal(item.innerHTML, '<ul>\n<li><p>Punkt</p>\n' + WRAPPED + '\n</li>\n</ul>\n');
  // > | A | B |
  const quote = passOver('<blockquote>\n' + TABLE + '\n</blockquote>\n');
  assert.equal(quote.innerHTML, '<blockquote>\n' + WRAPPED + '\n</blockquote>\n');
  // As the callout pass leaves it.
  const callout = passOver('<div class="dokufix-callout dokufix-callout-note" role="note"><p class="dokufix-callout-label">Hinweis</p>\n' + TABLE + '\n</div>\n');
  assert.equal(callout.querySelector('.dokufix-callout > .' + TABLE_CLASS + ' > table').outerHTML, TABLE);
  const footnote = passOver('<section class="footnotes" data-footnotes="">\n<ol>\n<li id="footnote-a">\n<p>Text</p>\n' + TABLE + '\n</li>\n</ol>\n</section>\n');
  assert.equal(footnote.querySelectorAll('li > .' + TABLE_CLASS + ' > table').length, 1);
  // A table in a cell, written as HTML: both are wrapped, the inner one inside its cell.
  const nested = passOver('<table><tbody><tr><td>aussen<table><tbody><tr><td>innen</td></tr></tbody></table></td></tr></tbody></table>');
  assert.equal(nested.innerHTML, '<div class="dokufix-table"><table><tbody><tr><td>aussen<div class="dokufix-table"><table><tbody><tr><td>innen</td></tr></tbody></table></div></td></tr></tbody></table></div>');
});
test('every table, whoever wrote it: a table written as HTML, with attributes, with a caption, without <tbody>', () => {
  const raw = '<table class="eigene" id="t1" border="1"><caption>Titel</caption><tr><th>A</th></tr><tr><td>1</td></tr></table>';
  const root = passOver(raw);
  assert.equal(root.innerHTML, '<div class="dokufix-table">' + raw + '</div>');
  // In a <div> of the author's: the wrapper stands between the two.
  const boxed = passOver('<div class="rahmen">' + raw + '</div>');
  assert.equal(boxed.innerHTML, '<div class="rahmen"><div class="dokufix-table">' + raw + '</div></div>');
});
test('once: a second pass changes nothing', () => {
  const root = passOver(TABLE + '\n<ul>\n<li>' + TABLE + '</li>\n</ul>\n' + row('<strong>Alpha</strong><br><em>Zusatz A</em>'));
  const once = root.innerHTML;
  assert.equal(root.querySelectorAll('.' + TABLE_CLASS).length, 3);
  buildTables(root);
  assert.equal(root.innerHTML, once);
  assert.equal(root.querySelectorAll('.' + TABLE_CLASS + ' .' + TABLE_CLASS).length, 0);
});
test('a document without a table comes through the pass as it went in', () => {
  const markup = '<h1>Titel</h1>\n<p>Text<br><em>kursiv nach einem Umbruch</em></p>\n<ul>\n<li>a<br><em>b</em></li>\n</ul>\n<pre><code>| A | B |\n</code></pre>\n';
  assert.equal(passOver(markup).innerHTML, markup);
});
test('the pass takes the root alone and makes its elements with the document of that root', () => {
  const root = rootWith(TABLE);
  buildTables(root, { frontmatter: { kind: null } });
  assert.ok(root.firstElementChild.ownerDocument === root.ownerDocument);
  assert.equal(root.querySelectorAll('.' + TABLE_CLASS + ' > table').length, 1);
});

// ---------- the sub-line ----------
test('emphasis directly after a line break in a cell is a sub-line', () => {
  // | **Alpha**<br>*Zusatz A* |
  const root = passOver(row('<strong>Alpha</strong><br><em>Zusatz A</em>'));
  assert.equal(root.querySelector('td').innerHTML, '<strong>Alpha</strong><br><em class="dokufix-cell-sub">Zusatz A</em>');
  assert.equal(CELL_SUB_CLASS, 'dokufix-cell-sub');
  assert.equal(root.querySelectorAll('[style]').length, 0);
});
test('blanks between the line break and the emphasis do not count', () => {
  // | Delta  <br>  *mit Blanks* |
  const root = passOver(row('Delta  <br>  <em>mit Blanks</em>'));
  assert.equal(root.querySelector('td').innerHTML, 'Delta  <br>  <em class="dokufix-cell-sub">mit Blanks</em>');
});
test('a sub-line in a header cell, underscores for the emphasis, a line break written as <br/>, bold inside the emphasis, two sub-lines in one cell', () => {
  // | Kopf<br>*klein* |      | a<br/>_b_ |      | a<br>***b*** |      | a<br>*b*<br>*c* |
  const head = passOver('<table>\n<thead>\n<tr>\n<th>Kopf<br><em>klein</em></th>\n</tr>\n</thead>\n<tbody><tr>\n<td>a<br><em>b</em></td>\n</tr>\n<tr>\n<td>a<br><em><strong>b</strong></em></td>\n</tr>\n<tr>\n<td>a<br><em>b</em><br><em>c</em></td>\n</tr>\n</tbody></table>\n');
  assert.deepEqual(subs(head), [
    '<em class="dokufix-cell-sub">klein</em>', '<em class="dokufix-cell-sub">b</em>', '<em class="dokufix-cell-sub"><strong>b</strong></em>',
    '<em class="dokufix-cell-sub">b</em>', '<em class="dokufix-cell-sub">c</em>',
  ]);
});
test('a sub-line behind a status chip, as the chip pass leaves the cell', () => {
  // | `🟢 Live`<br>*seit Mai* |
  const root = passOver(row('<span class="dokufix-chip dokufix-chip-green"><span class="dokufix-chip-status">grün: </span>Live</span><br><em>seit Mai</em>'));
  assert.deepEqual(subs(root), ['<em class="dokufix-cell-sub">seit Mai</em>']);
});
test('emphasis elsewhere is no sub-line', () => {
  const cases = {
    // | *nur kursiv* |
    'emphasis alone in a cell': '<em>nur kursiv</em>',
    // | Gamma<br>normal *spät* |
    'text between the line break and the emphasis': 'Gamma<br>normal <em>spät</em>',
    // | Text *kursiv* mehr |
    'emphasis in the first line': 'Text <em>kursiv</em> mehr',
    // | *vorn*<br>hinten |
    'emphasis before the line break': '<em>vorn</em><br>hinten',
    // | a<br>**fett** |
    'bold text after the line break': 'a<br><strong>fett</strong>',
    // | a<br>**fett *innen*** |
    'emphasis inside bold text after the line break': 'a<br><strong>fett <em>innen</em></strong>',
    // | a<br>[*Verweis*](…) |
    'emphasis inside a link after the line break': 'a<br><a href="https://example.org"><em>Verweis</em></a>',
    // | a<br>`code` *kursiv* |
    'code between the two': 'a<br><code>code</code> <em>kursiv</em>',
  };
  for (const [name, cell] of Object.entries(cases)){
    const markup = row(cell);
    const root = passOver(markup);
    assert.equal(root.querySelectorAll('.' + CELL_SUB_CLASS).length, 0, name);
    assert.equal(root.querySelector('td').innerHTML, cell, name);
  }
  // Outside a table: a paragraph, a list item, a quotation, a heading.
  const outside = '<p>Absatz<br><em>kursiv</em></p>\n<ul>\n<li>Punkt<br><em>kursiv</em></li>\n</ul>\n<blockquote>\n<p>Zitat<br><em>kursiv</em></p>\n</blockquote>\n<h2>Titel<br><em>kursiv</em></h2>\n';
  assert.equal(passOver(outside).innerHTML, outside);
  // In a paragraph inside a cell, written as HTML: the emphasis is no child of the cell.
  const inner = passOver('<table><tbody><tr><td><p>a<br><em>b</em></p></td></tr></tbody></table>');
  assert.equal(inner.querySelectorAll('.' + CELL_SUB_CLASS).length, 0);
});

// ---------- the pass has its place in the list ----------
test('render.js runs the pass "Tabellen" directly after "Markierungen" and before "Überschriften" and the footnote previews', () => {
  // render.js looks up elements of the page when it loads, so it is read, not imported.
  const src = fs.readFileSync(path.join(here, '../src/app/render.js'), 'utf8');
  const list = src.slice(src.indexOf('export const DOCUMENT_PASSES = ['), src.indexOf('];', src.indexOf('export const DOCUMENT_PASSES = [')));
  const names = Array.from(list.matchAll(/name: '([^']+)'/g)).map(m => m[1]);
  const at = names.indexOf('Tabellen');
  assert.ok(at > 0, 'the pass is in the list: ' + names.join(', '));
  assert.equal(names[at - 1], 'Markierungen');
  assert.equal(names[at + 1], 'Überschriften');
  assert.ok(names.indexOf('Fußnoten-Vorschau') > at);
  assert.match(list, /\{ name: 'Tabellen', run: buildTables \}/);
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
test('the wrapper scrolls sideways on its own and carries the table\'s bottom margin', () => {
  const wrapper = ruleOf(bare, '.dokufix-doc .dokufix-table');
  assert.ok(wrapper, 'a rule for the wrapper');
  assert.equal(wrapper['overflow-x'], 'auto');
  assert.equal(wrapper['margin-bottom'], '14px');
  assert.deepEqual(Object.keys(wrapper).sort(), ['margin-bottom', 'overflow-x'], 'and nothing else: it is the scroll container alone');
  assert.equal(ruleOf(bare, '.dokufix-doc .dokufix-table > table')['margin-bottom'], '0');
});
test('the sub-line is styled by its class: subdued, smaller, upright; no rule asks where an <em> stands', () => {
  const sub = ruleOf(bare, '.dokufix-doc .dokufix-cell-sub');
  assert.ok(sub, 'a rule for the sub-line');
  assert.equal(sub['font-style'], 'normal');
  assert.match(sub['font-size'], /^1[0-3]px$/);
  assert.match(sub.color, /^#[0-9a-f]{6}$/);
  // NFR11: which element is a sub-line is decided in the pass.
  const block = bare.slice(bare.indexOf('.dokufix-doc .dokufix-table{'), bare.indexOf('.dokufix-doc .dokufix-cards{'));
  const selectors = Array.from(block.matchAll(/([^{}]+)\{/g)).map(m => m[1].trim()).filter(s => !s.startsWith('@'));
  assert.ok(selectors.length >= 10, selectors.join(' | '));
  for (const selector of selectors) assert.ok(!/\b(strong|em|b|i|td|th|br)\b/.test(selector.replace(/\.[\w-]+/g, '')), selector);
});
test('the built file carries the rules of wrapper and sub-line', () => {
  const built = fs.readFileSync(path.join(here, '../dist/dokufix.html'), 'utf8');
  const block = built.match(/<style id="dokufix-doc-css">([\s\S]*?)<\/style>/);
  assert.ok(block, 'the block of the document styles');
  for (const name of ['.dokufix-table{overflow-x:auto;margin-bottom:14px}', '.dokufix-table>table{margin-bottom:0}', '.dokufix-cell-sub{']) assert.ok(block[1].includes(name), name);
});
