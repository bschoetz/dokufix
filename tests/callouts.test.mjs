// Callouts, run in Node: no browser, no page.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/callouts.js is a module of pure logic, so this file imports it as it
// is and hands its pass a fragment that linkedom parses. The markup of every
// case is what marked 18.0.14 emits for the Markdown named beside it, measured
// with { gfm: true, breaks: false } as render() calls it; marked itself comes
// from the CDN and is not installed here. The cases are the matrix of the
// story: what becomes a callout, what stays a quotation, and what is left where
// the marker stood.
//
// The last cases read src/doc.css and the built file: the five symbols are
// data: URIs in the document styles, and the build has to hand them on as they
// are written.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { buildCallouts, CALLOUT_CLASS, CALLOUT_LABELS } from '../src/app/callouts.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// A root like the preview, holding the given markup.
function rootWith(html){
  const { document } = parseHTML('<!DOCTYPE html><html><body><article id="root" class="dokufix-doc">' + html + '</article></body></html>');
  return document.getElementById('root');
}
// The pass over the markup; returns the root.
function passOver(html){
  const root = rootWith(html);
  buildCallouts(root);
  return root;
}
const callouts = root => Array.from(root.querySelectorAll('.' + CALLOUT_CLASS));
// The element children of a callout as "tag.class" or "tag".
const shape = el => Array.from(el.children).map(k => k.tagName.toLowerCase() + (k.className ? '.' + k.className : ''));

const TYPES = [
  ['NOTE', 'note', 'Hinweis'],
  ['TIP', 'tip', 'Tipp'],
  ['IMPORTANT', 'important', 'Wichtig'],
  ['WARNING', 'warning', 'Achtung'],
  ['CAUTION', 'caution', 'Vorsicht'],
];

// ---------- what becomes a callout ----------
test('the five types: a class naming the type, the label as first child, the marker gone', () => {
  for (const [marker, type, label] of TYPES){
    // > [!NOTE]
    // > text **fett**
    const root = passOver('<blockquote>\n<p>[!' + marker + ']\ntext <strong>fett</strong></p>\n</blockquote>\n');
    assert.equal(root.querySelectorAll('blockquote').length, 0, marker + ': the blockquote is gone');
    const [box] = callouts(root);
    assert.ok(box, marker + ': a callout');
    assert.equal(box.tagName, 'DIV');
    assert.equal(box.className, 'dokufix-callout dokufix-callout-' + type);
    assert.equal(box.getAttribute('role'), 'note');
    assert.deepEqual(shape(box), ['p.dokufix-callout-label', 'p']);
    assert.equal(box.firstElementChild.textContent, label);
    // The label is plain text: the type is a word in the markup.
    assert.equal(box.firstElementChild.children.length, 0);
    assert.equal(box.children[1].innerHTML, 'text <strong>fett</strong>');
    assert.ok(!root.textContent.includes('[!'), marker + ': no marker text left');
  }
});
test('the labels are the five decided words, in the order NOTE, TIP, IMPORTANT, WARNING, CAUTION', () => {
  assert.deepEqual(Object.entries(CALLOUT_LABELS), TYPES.map(([, type, label]) => [type, label]));
  // "Warnung" belongs to the product's own warning.
  assert.ok(!Object.values(CALLOUT_LABELS).includes('Warnung'));
});
test('the marker is recognised in any case', () => {
  for (const marker of ['[!note]', '[!Note]', '[!nOtE]']){
    const [box] = callouts(passOver('<blockquote>\n<p>' + marker + '\ntext</p>\n</blockquote>\n'));
    assert.ok(box, marker);
    assert.equal(box.className, 'dokufix-callout dokufix-callout-note');
    assert.equal(box.firstElementChild.textContent, 'Hinweis');
  }
});
test('blanks behind the marker do not count', () => {
  // "> [!NOTE] " with a line behind it, and "> [!CAUTION]  " alone.
  const one = callouts(passOver('<blockquote>\n<p>[!NOTE] \ntext</p>\n</blockquote>\n'))[0];
  assert.equal(one.children[1].textContent, 'text');
  const two = callouts(passOver('<blockquote>\n<p>[!CAUTION]  </p>\n</blockquote>\n'))[0];
  assert.deepEqual(shape(two), ['p.dokufix-callout-label']);
});
test('the content keeps its formatting when it starts with an inline element', () => {
  // > [!NOTE]
  // > **fett** zuerst
  const [box] = callouts(passOver('<blockquote>\n<p>[!NOTE]\n<strong>fett</strong> zuerst</p>\n</blockquote>\n'));
  assert.equal(box.children[1].innerHTML, '<strong>fett</strong> zuerst');
});
test('marker, then a list: no empty paragraph where the marker was', () => {
  // > [!WARNING]
  // > - a
  // > - b
  const [box] = callouts(passOver('<blockquote>\n<p>[!WARNING]</p>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n</blockquote>\n'));
  assert.deepEqual(shape(box), ['p.dokufix-callout-label', 'ul']);
  assert.deepEqual(Array.from(box.querySelectorAll('li')).map(li => li.textContent), ['a', 'b']);
  assert.equal(box.firstElementChild.textContent, 'Achtung');
});
test('marker, then a new paragraph, a code block or a quote: the same', () => {
  const para = callouts(passOver('<blockquote>\n<p>[!WARNING]</p>\n<p>neuer Absatz</p>\n</blockquote>\n'))[0];
  assert.deepEqual(shape(para), ['p.dokufix-callout-label', 'p']);
  assert.equal(para.children[1].textContent, 'neuer Absatz');
  const code = callouts(passOver('<blockquote>\n<p>[!NOTE]</p>\n<pre><code>code\n</code></pre>\n</blockquote>\n'))[0];
  assert.deepEqual(shape(code), ['p.dokufix-callout-label', 'pre']);
  assert.equal(code.querySelector('code').textContent, 'code\n');
  // > [!NOTE]
  // > > inner          the inner quote is an ordinary one and stays
  const quote = callouts(passOver('<blockquote>\n<p>[!NOTE]</p>\n<blockquote>\n<p>inner</p>\n</blockquote>\n</blockquote>\n'))[0];
  assert.deepEqual(shape(quote), ['p.dokufix-callout-label', 'blockquote']);
});
test('marker with a hard break: no line break left at the start', () => {
  // "> [!IMPORTANT]  " with two blanks, or with a backslash, at the end of the line
  const [box] = callouts(passOver('<blockquote>\n<p>[!IMPORTANT]<br>text</p>\n</blockquote>\n'));
  assert.deepEqual(shape(box), ['p.dokufix-callout-label', 'p']);
  assert.equal(box.children[1].innerHTML, 'text');
  assert.equal(box.querySelectorAll('br').length, 0);
});
test('marker alone: a callout with its label and nothing else', () => {
  // > [!CAUTION]
  const root = passOver('<blockquote>\n<p>[!CAUTION]</p>\n</blockquote>\n');
  const [box] = callouts(root);
  assert.deepEqual(shape(box), ['p.dokufix-callout-label']);
  assert.equal(box.textContent.trim(), 'Vorsicht');
});
test('a heading inside stays a heading element in the callout', () => {
  // > [!TIP]
  // > ### Titel
  // >
  // > text
  const [box] = callouts(passOver('<blockquote>\n<p>[!TIP]</p>\n<h3>Titel</h3>\n<p>text</p>\n</blockquote>\n'));
  assert.deepEqual(shape(box), ['p.dokufix-callout-label', 'h3', 'p']);
});
test('nested: in a quote inside a quote, in a list item, in another callout', () => {
  // > aussen
  // >
  // > > [!NOTE]
  // > > innen
  const inQuote = passOver('<blockquote>\n<p>aussen</p>\n<blockquote>\n<p>[!NOTE]\ninnen</p>\n</blockquote>\n</blockquote>\n');
  assert.equal(inQuote.children.length, 1);
  assert.equal(inQuote.firstElementChild.tagName, 'BLOCKQUOTE');
  assert.deepEqual(shape(inQuote.firstElementChild), ['p', 'div.dokufix-callout dokufix-callout-note']);
  assert.equal(callouts(inQuote)[0].children[1].textContent, 'innen');

  // - punkt
  //
  //   > [!TIP]
  //   > im Punkt
  const inList = passOver('<ul>\n<li><p>punkt</p>\n<blockquote>\n<p>[!TIP]\nim Punkt</p>\n</blockquote>\n</li>\n</ul>\n');
  assert.deepEqual(shape(inList.querySelector('li')), ['p', 'div.dokufix-callout dokufix-callout-tip']);
  // - > [!TIP]
  //   > im Punkt
  const tight = passOver('<ul>\n<li><blockquote>\n<p>[!TIP]\nim Punkt</p>\n</blockquote>\n</li>\n</ul>\n');
  assert.deepEqual(shape(tight.querySelector('li')), ['div.dokufix-callout dokufix-callout-tip']);

  // > [!WARNING]
  // > aussen
  // >
  // > > [!NOTE]
  // > > innen
  const inCallout = passOver('<blockquote>\n<p>[!WARNING]\naussen</p>\n<blockquote>\n<p>[!NOTE]\ninnen</p>\n</blockquote>\n</blockquote>\n');
  assert.equal(inCallout.querySelectorAll('blockquote').length, 0);
  const outer = inCallout.firstElementChild;
  assert.deepEqual(shape(outer), ['p.dokufix-callout-label', 'p', 'div.dokufix-callout dokufix-callout-note']);
  assert.equal(outer.firstElementChild.textContent, 'Achtung');
  assert.equal(outer.children[2].firstElementChild.textContent, 'Hinweis');
});
test('several callouts and a quotation between them: each is judged on its own', () => {
  const root = passOver(
    '<blockquote>\n<p>[!NOTE]\neins</p>\n</blockquote>\n' +
    '<blockquote>\n<p>nur ein Zitat</p>\n</blockquote>\n' +
    '<blockquote>\n<p>[!TIP]\nzwei</p>\n</blockquote>\n');
  assert.deepEqual(shape(root), ['div.dokufix-callout dokufix-callout-note', 'blockquote', 'div.dokufix-callout dokufix-callout-tip']);
});

// ---------- what stays a quotation ----------
// Each of these comes back as it went in, byte for byte.
const ORDINARY = {
  'an ordinary blockquote, "> text"':
    '<blockquote>\n<p>text</p>\n</blockquote>\n',
  'text on the marker\'s line, "> [!NOTE] text"':
    '<blockquote>\n<p>[!NOTE] text</p>\n</blockquote>\n',
  'an inline element on the marker\'s line, "> [!NOTE]**fett**"':
    '<blockquote>\n<p>[!NOTE]<strong>fett</strong></p>\n</blockquote>\n',
  'an unknown type, "> [!FOO]"':
    '<blockquote>\n<p>[!FOO]\ntext</p>\n</blockquote>\n',
  'an unknown type that starts like a known one, "> [!NOTES]"':
    '<blockquote>\n<p>[!NOTES]\ntext</p>\n</blockquote>\n',
  'a marker that is not on the first line':
    '<blockquote>\n<p>text\n[!NOTE]</p>\n</blockquote>\n',
  'a marker in the second paragraph':
    '<blockquote>\n<p>text</p>\n<p>[!NOTE]</p>\n</blockquote>\n',
  'a marker written as code':
    '<blockquote>\n<p><code>[!NOTE]</code>\ntext</p>\n</blockquote>\n',
  'a quotation that opens with a list':
    '<blockquote>\n<ul>\n<li>[!NOTE]</li>\n</ul>\n</blockquote>\n',
  'an empty blockquote':
    '<blockquote>\n</blockquote>\n',
  'a marker in a paragraph outside any blockquote':
    '<p>[!NOTE]\ntext</p>\n',
};
for (const [name, html] of Object.entries(ORDINARY)){
  test('unchanged: ' + name, () => {
    const root = passOver(html);
    assert.equal(root.innerHTML, html);
  });
}

// ---------- the known limit ----------
test('known limit: a masked marker arrives as the same markup and becomes a callout', () => {
  // "> \[!NOTE\]" and "> [!NOTE]" both give <p>[!NOTE]\ntext</p>. Telling them
  // apart needs the tokens; see src/README.md, "Callouts".
  const [box] = callouts(passOver('<blockquote>\n<p>[!NOTE]\ntext</p>\n</blockquote>\n'));
  assert.ok(box);
});

// ---------- the symbols in the document styles ----------
const docCss = fs.readFileSync(path.join(here, '../src/doc.css'), 'utf8');
const symbolOf = type => {
  const rule = new RegExp('\\.dokufix-doc \\.dokufix-callout-' + type + ' > \\.dokufix-callout-label::before\\{background-image:url\\("(data:image/svg\\+xml,[^"]*)"\\)\\}');
  const m = docCss.match(rule);
  return m ? m[1] : null;
};
test('each type has its symbol in the document styles: an SVG of 16 px with one path, as a data: URI', () => {
  const seen = new Set();
  for (const [, type] of TYPES){
    const uri = symbolOf(type);
    assert.ok(uri, type + ': a rule with a data: URI');
    // Nothing in it may end a style element or a CSS string, and "#" would cut the URI off.
    assert.ok(!/[<>"#\\\n]/.test(uri), type + ': the URI is escaped');
    const svg = decodeURIComponent(uri.slice('data:image/svg+xml,'.length));
    const { document } = parseHTML('<!DOCTYPE html><html><body>' + svg + '</body></html>');
    const el = document.querySelector('svg');
    assert.ok(el, type + ': an svg element');
    assert.equal(el.getAttribute('xmlns'), 'http://www.w3.org/2000/svg');
    assert.equal(el.getAttribute('viewBox'), '0 0 16 16');
    assert.equal(el.getAttribute('width'), '16');
    assert.equal(el.getAttribute('height'), '16');
    assert.match(el.getAttribute('fill'), /^#[0-9a-f]{6}$/);
    assert.equal(el.children.length, 1);
    assert.equal(el.firstElementChild.tagName.toLowerCase(), 'path');
    assert.match(el.firstElementChild.getAttribute('d'), /^M[\d\sA-Za-z.,-]+Z$/);
    // The symbol has the colour of its label and of its edge.
    const colour = el.getAttribute('fill');
    assert.ok(docCss.includes('.dokufix-doc .dokufix-callout-' + type + '{border-left-color:' + colour + '}'), type + ': the edge has the symbol\'s colour');
    assert.ok(docCss.includes('.dokufix-doc .dokufix-callout-' + type + ' > .dokufix-callout-label{color:' + colour + '}'), type + ': the label has the symbol\'s colour');
    seen.add(uri);
  }
  assert.equal(seen.size, TYPES.length, 'five different symbols');
});
test('the build hands every symbol on as it is written', () => {
  // esbuild minifies doc.css; a url() it rewrote would still have to be the
  // same picture, and this would not know. So: the same text.
  const built = fs.readFileSync(path.join(here, '../dist/dokufix.html'), 'utf8');
  const block = built.match(/<style id="dokufix-doc-css">([\s\S]*?)<\/style>/);
  assert.ok(block, 'the block of the document styles');
  for (const [, type] of TYPES){
    assert.ok(block[1].includes('url("' + symbolOf(type) + '")'), type + ': its URI stands in the built file unchanged');
  }
});
