// Status chips, run in Node: no browser, no page.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/chips.js is a module of pure logic, so this file imports it as it is
// and hands its pass a fragment that linkedom parses. The markup of every case
// is what marked 18.0.14 emits for the Markdown named beside it, measured with
// { gfm: true, breaks: false } as render() calls it; marked itself comes from
// the CDN and is not installed here. The cases are the matrix of the story:
// what becomes a chip, what stays code, and where a chip may stand.
//
// The last cases read src/doc.css, src/app/render.js and the built file: the
// five colours with their marks are rules of the document styles, and the pass
// has its place in the list.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { buildChips, buildChip, readChip, CHIP_CLASS, CHIP_STATUS_CLASS, CHIP_COLOURS } from '../src/app/chips.js';
import { buildCallouts } from '../src/app/callouts.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// A root like the preview, holding the given markup.
function rootWith(html){
  const { document } = parseHTML('<!DOCTYPE html><html><body><article id="root" class="dokufix-doc">' + html + '</article></body></html>');
  return document.getElementById('root');
}
// The pass over the markup; returns the root.
function passOver(html){
  const root = rootWith(html);
  buildChips(root);
  return root;
}
const chips = root => Array.from(root.querySelectorAll('.' + CHIP_CLASS));
// A chip as the pass writes it.
const chipHtml = (colour, word, label) =>
  '<span class="dokufix-chip dokufix-chip-' + colour + '"><span class="dokufix-chip-status">' + word + ': </span>' + label + '</span>';

const COLOURS = [
  ['🟢', 'green', 'grün'],
  ['🟡', 'yellow', 'gelb'],
  ['🔴', 'red', 'rot'],
  ['⚪', 'grey', 'grau'],
  ['🔵', 'blue', 'blau'],
];

// ---------- what becomes a chip ----------
test('the five colours: a class naming the colour, the dot gone, the label stays', () => {
  // `🟢 x` `🟡 x` `🔴 x` `⚪ x` `🔵 x`
  const root = passOver('<p>' + COLOURS.map(([dot]) => '<code>' + dot + ' x</code>').join(' ') + '</p>\n');
  assert.equal(root.querySelectorAll('code').length, 0, 'no code span left');
  const found = chips(root);
  assert.equal(found.length, 5);
  COLOURS.forEach(([dot, colour, word], i) => {
    const chip = found[i];
    assert.equal(chip.tagName, 'SPAN');
    assert.equal(chip.className, 'dokufix-chip dokufix-chip-' + colour);
    assert.equal(chip.outerHTML, chipHtml(colour, word, 'x'));
    assert.ok(!chip.textContent.includes(dot), colour + ': the dot is gone');
    // The label is the chip's own text; the word stands in the inner span.
    assert.equal(chip.lastChild.nodeType, 3);
    assert.equal(chip.lastChild.data, 'x');
    assert.equal(chip.querySelector('.' + CHIP_STATUS_CLASS).textContent, word + ': ');
  });
  assert.equal(root.innerHTML, '<p>' + COLOURS.map(([, colour, word]) => chipHtml(colour, word, 'x')).join(' ') + '</p>\n');
});
test('the colours are the five decided ones, each with a class and a German word of its own', () => {
  assert.deepEqual(Object.entries(CHIP_COLOURS).map(([dot, c]) => [dot, c.colour, c.word]), COLOURS);
  assert.equal(new Set(COLOURS.map(c => c[1])).size, 5);
  assert.equal(new Set(COLOURS.map(c => c[2])).size, 5);
});
test('readChip: colour, word and label of a status, null for anything else', () => {
  assert.deepEqual(readChip('🟢 Live'), { colour: 'green', word: 'grün', label: 'Live' });
  assert.deepEqual(readChip('🔵 im Test'), { colour: 'blue', word: 'blau', label: 'im Test' });
  for (const text of ['', 'x', 'x 🟢', '🟢', '🟢x', '🟢 ', ' 🟢 x', '🟣 x', '🟠 x', '⚫ x', '●  x', '🟢\u00a0x', '🟢\tx', '\uFE0F x']){
    assert.equal(readChip(text), null, JSON.stringify(text));
  }
});
test('the dot may carry a variation selector', () => {
  // `⚪️ geplant`: U+26AA U+FE0F, the form an emoji keyboard writes
  const root = passOver('<p><code>⚪\uFE0F geplant</code></p>\n');
  assert.equal(root.innerHTML, '<p>' + chipHtml('grey', 'grau', 'geplant') + '</p>\n');
  assert.deepEqual(readChip('🟢\uFE0F Live'), { colour: 'green', word: 'grün', label: 'Live' });
  // The selector alone is no blank.
  assert.equal(readChip('⚪\uFE0Fgeplant'), null);
});
test('more than one blank behind the dot, and blanks behind the label, do not count', () => {
  // `🟢  zwei Wörter` and `🟢 x ` (a code span keeps a blank at its end when it has none at its start)
  const root = passOver('<p><code>🟢  zwei Wörter</code> <code>🟢 x </code></p>\n');
  assert.deepEqual(chips(root).map(c => c.lastChild.data), ['zwei Wörter', 'x']);
});
test('the label is text: what marked escaped stays escaped', () => {
  // `🟢 a < b & c`
  const root = passOver('<p><code>🟢 a &lt; b &amp; c</code></p>\n');
  const [chip] = chips(root);
  assert.equal(chip.lastChild.data, 'a < b & c');
  assert.equal(chip.children.length, 1, 'only the word is an element');
  assert.equal(root.innerHTML, '<p>' + chipHtml('green', 'grün', 'a &lt; b &amp; c') + '</p>\n');
});
test('buildChip makes the element with the document it is handed', () => {
  const root = rootWith('');
  const chip = buildChip(root.ownerDocument, readChip('🔴 gesperrt'));
  assert.equal(chip.outerHTML, chipHtml('red', 'rot', 'gesperrt'));
  assert.ok(chip.ownerDocument === root.ownerDocument);
});
test('a second pass changes nothing', () => {
  const root = passOver('<p>Text <code>🟢 Live</code> und <code>x</code>.</p>\n');
  const once = root.innerHTML;
  buildChips(root);
  assert.equal(root.innerHTML, once);
});

// ---------- where it stands ----------
const live = chipHtml('green', 'grün', 'Live');
const PLACES = {
  'running text, "Text `🟢 Live` weiter."':
    ['<p>Text <code>🟢 Live</code> weiter.</p>\n',
     '<p>Text ' + live + ' weiter.</p>\n'],
  'a table cell':
    ['<table>\n<thead>\n<tr>\n<th>A</th>\n<th>B</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>x</td>\n<td><code>🟢 Live</code></td>\n</tr>\n</tbody></table>\n',
     '<table>\n<thead>\n<tr>\n<th>A</th>\n<th>B</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>x</td>\n<td>' + live + '</td>\n</tr>\n</tbody></table>\n'],
  'a heading, "## Bestellung `🟢 Live`"':
    ['<h2>Bestellung <code>🟢 Live</code></h2>\n',
     '<h2>Bestellung ' + live + '</h2>\n'],
  'a heading that is only a chip, "## `🟢 Live`"':
    ['<h2><code>🟢 Live</code></h2>\n',
     '<h2>' + live + '</h2>\n'],
  'inside a link, "[`🟢 Live`](https://example.org/a)"':
    ['<p><a href="https://example.org/a"><code>🟢 Live</code></a></p>\n',
     '<p><a href="https://example.org/a">' + live + '</a></p>\n'],
  'inside bold text, "**`🟢 Live`**"':
    ['<p><strong><code>🟢 Live</code></strong></p>\n',
     '<p><strong>' + live + '</strong></p>\n'],
  'inside emphasis and struck text':
    ['<p><em><code>🟢 Live</code></em> <del><code>🟢 Live</code></del></p>\n',
     '<p><em>' + live + '</em> <del>' + live + '</del></p>\n'],
  'a list item, "- `🟢 Live`"':
    ['<ul>\n<li><code>🟢 Live</code></li>\n<li>zwei</li>\n</ul>\n',
     '<ul>\n<li>' + live + '</li>\n<li>zwei</li>\n</ul>\n'],
  'an ordinary blockquote':
    ['<blockquote>\n<p>Zitat <code>🟢 Live</code></p>\n</blockquote>\n',
     '<blockquote>\n<p>Zitat ' + live + '</p>\n</blockquote>\n'],
};
for (const [name, [html, want]] of Object.entries(PLACES)){
  test('a chip in ' + name, () => {
    assert.equal(passOver(html).innerHTML, want);
  });
}
test('a chip in a callout, with the callout pass before it as in render.js', () => {
  // > [!NOTE]
  // > Im Hinweis: `🟡 gestört`.
  const root = rootWith('<blockquote>\n<p>[!NOTE]\nIm Hinweis: <code>🟡 gestört</code>.</p>\n</blockquote>\n');
  buildCallouts(root);
  buildChips(root);
  const box = root.querySelector('.dokufix-callout');
  assert.equal(box.children[1].innerHTML, 'Im Hinweis: ' + chipHtml('yellow', 'gelb', 'gestört') + '.');
  // The label of the callout is not touched.
  assert.equal(box.firstElementChild.textContent, 'Hinweis');
});

// ---------- what stays code ----------
// Each of these comes back as it went in, byte for byte.
const ORDINARY = {
  'ordinary code, "`x`"':
    '<p><code>x</code></p>\n',
  'the dot at the end, "`x 🟢`"':
    '<p><code>x 🟢</code></p>\n',
  'the dot in the middle':
    '<p><code>Status 🟢 Live</code></p>\n',
  'no label, "`🟢`"':
    '<p><code>🟢</code></p>\n',
  'no label, only a blank, "`🟢 `"':
    '<p><code>🟢 </code></p>\n',
  'no blank, "`🟢x`"':
    '<p><code>🟢x</code></p>\n',
  'a blank before the dot, "` 🟢 x`": the way round a false positive':
    '<p><code> 🟢 x</code></p>\n',
  'a tab instead of the blank':
    '<p><code>🟢\tx</code></p>\n',
  'a dot that is none of the five':
    '<p><code>🟣 x</code> <code>🟠 x</code> <code>⚫ x</code></p>\n',
  'a fenced code block with a line "🟢 x"':
    '<pre><code>🟢 x\n</code></pre>\n',
  'a fenced code block with a language':
    '<pre><code class="language-text">🟢 x\n🔴 y\n</code></pre>\n',
  'an indented code block':
    '<pre><code>🟢 x\n</code></pre>\n',
  'a <code> written as HTML that holds markup':
    '<p><code>🟢 <b>x</b></code></p>\n',
  'the dot and the label outside any code span':
    '<p>🟢 Live</p>\n<h2>🟢 Live</h2>\n',
};
for (const [name, html] of Object.entries(ORDINARY)){
  test('unchanged: ' + name, () => {
    assert.equal(passOver(html).innerHTML, html);
  });
}
test('unchanged: a no-break space instead of the blank', () => {
  // Compared by its text: linkedom writes the no-break space as a reference.
  const root = passOver('<p><code>🟢\u00a0x</code></p>\n');
  assert.equal(chips(root).length, 0);
  assert.equal(root.querySelector('code').textContent, '🟢\u00a0x');
});

// ---------- telling chips apart without colour ----------
test('the same label in two colours: the class differs, and so does the text for assistive technology', () => {
  // `🟢 Test` `🔴 Test`, and `⚪ x` `🔵 x`, which the spike gave one look
  for (const [a, b] of [['🟢 Test', '🔴 Test'], ['⚪ x', '🔵 x']]){
    const [one, two] = chips(passOver('<p><code>' + a + '</code> <code>' + b + '</code></p>\n'));
    assert.equal(one.lastChild.data, two.lastChild.data, 'the same label');
    assert.notEqual(one.className, two.className);
    assert.notEqual(one.textContent, two.textContent);
    assert.notEqual(one.querySelector('.' + CHIP_STATUS_CLASS).textContent, two.querySelector('.' + CHIP_STATUS_CLASS).textContent);
  }
});
test('the text of a chip names its colour in words, before the label', () => {
  const [chip] = chips(passOver('<p><code>🟢 Live</code></p>\n'));
  assert.equal(chip.textContent, 'grün: Live');
  // Text, in the markup: no attribute carries it, and nothing hides it from a screen reader.
  const word = chip.firstElementChild;
  assert.equal(word.className, CHIP_STATUS_CLASS);
  assert.equal(word.attributes.length, 1);
  assert.equal(chip.attributes.length, 1);
});

// ---------- the known limit ----------
test('known limit: a code span that only happens to start like a status becomes a chip', () => {
  // `🔴 = Fehler` in a legend. The way round it is the blank before the dot,
  // which is among the unchanged cases above. See src/README.md, "Status chips".
  const root = passOver('<p><code>🔴 = Fehler</code></p>\n');
  assert.equal(root.innerHTML, '<p>' + chipHtml('red', 'rot', '= Fehler') + '</p>\n');
});

// ---------- the pass has its place in the list ----------
test('render.js runs the pass "Status-Chips" after "Hinweise" and before "Überschriften"', () => {
  // render.js looks up elements of the page when it loads, so it is read, not imported.
  const src = fs.readFileSync(path.join(here, '../src/app/render.js'), 'utf8');
  const list = src.slice(src.indexOf('export const DOCUMENT_PASSES = ['), src.indexOf('];', src.indexOf('export const DOCUMENT_PASSES = [')));
  const names = Array.from(list.matchAll(/name: '([^']+)'/g)).map(m => m[1]);
  const at = names.indexOf('Status-Chips');
  assert.ok(at > 0, 'the pass is in the list: ' + names.join(', '));
  assert.equal(names[at - 1], 'Hinweise');
  // Between the two stands the pass of the block markers (story 2.4).
  assert.ok(names.indexOf('Überschriften') > at, 'before the headings: ' + names.join(', '));
  assert.match(list, /\{ name: 'Status-Chips', run: buildChips \}/);
});
test('no module but chips.js tests for a colour dot', () => {
  const dots = new RegExp(Object.keys(CHIP_COLOURS).join('|'), 'u');
  const hits = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()){ walk(file); continue; }
      if (!file.endsWith('.js') || file.endsWith(path.join('app', 'chips.js'))) continue;
      // A comment may show the convention; code may not use a dot.
      const code = fs.readFileSync(file, 'utf8').split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
      if (dots.test(code)) hits.push(path.relative(path.join(here, '..'), file));
    }
  };
  walk(path.join(here, '../src'));
  assert.deepEqual(hits, []);
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
const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// The label is a darker shade than the mark, so that it reads well at 11 px
// (Ben, 2026-10-02): at least 6.5 : 1 on its tint. The mark keeps the colour of
// the callouts' palette, grey its own, at least 4.5 : 1.
test('each colour has its rule: the label dark on a tint, contrast at least 6.5 : 1; the mark in a colour of the callouts\' palette or grey, at least 4.5 : 1', () => {
  const palette = { green: '#1a7f37', yellow: '#9a6700', red: '#cf222e', blue: '#0969da' };
  const tints = new Set();
  for (const [, colour] of COLOURS){
    const rule = ruleOf(docCss, '.dokufix-doc .dokufix-chip-' + colour);
    assert.ok(rule, colour + ': a rule');
    assert.match(rule.color || '', /^#[0-9a-f]{6}$/, colour + ': a text colour');
    assert.match(rule.background || '', /^#[0-9a-f]{6}$/, colour + ': a background');
    const mark = ruleOf(docCss, '.dokufix-doc .dokufix-chip-' + colour + '::before');
    assert.ok(mark, colour + ': a rule for its mark');
    assert.match(mark.color || '', /^#[0-9a-f]{6}$/, colour + ': a colour of the mark');
    if (palette[colour]){
      assert.equal(mark.color, palette[colour], colour + ': the mark has the colour of the callouts\' palette');
      assert.ok(docCss.includes('border-left-color:' + palette[colour]), colour + ': a callout has that colour');
    }
    const ratio = contrast(rule.color, rule.background);
    assert.ok(ratio >= 6.5, colour + ': contrast of the label ' + ratio.toFixed(2) + ' : 1');
    assert.ok(luminance(rule.color) < luminance(mark.color), colour + ': the label is darker than the mark');
    const markRatio = contrast(mark.color, rule.background);
    assert.ok(markRatio >= 4.5, colour + ': contrast of the mark ' + markRatio.toFixed(2) + ' : 1');
    tints.add(rule.background);
  }
  assert.equal(tints.size, 5, 'five different tints');
  // A chip without a colour class does not exist, but the base rule is readable too.
  const base = ruleOf(docCss, '.dokufix-doc .dokufix-chip');
  assert.ok(contrast(base.color, base.background) >= 6.5);
});
test('each colour has a mark of its own shape, drawn in the styles: no font, no image', () => {
  const base = ruleOf(docCss, '.dokufix-doc .dokufix-chip::before');
  assert.ok(base, 'the mark is the ::before of the chip');
  assert.equal(base.content, '""', 'the mark is no character of a font');
  assert.equal(base.background, 'currentColor', 'the mark is filled with its own colour, which each colour\'s rule sets');
  const shapes = new Map();
  for (const [, colour] of COLOURS){
    const own = ruleOf(docCss, '.dokufix-doc .dokufix-chip-' + colour + '::before') || {};
    const mark = { ...base, ...own };
    assert.ok(!/url\(/.test(Object.values(mark).join(' ')), colour + ': no image');
    // What makes the outline: rounding, a cut, and whether the box is filled.
    const shape = [mark['border-radius'] || 'none', mark['clip-path'] || 'none', mark.background === 'transparent' ? 'ring ' + mark.border : 'filled'].join(' | ');
    assert.ok(!shapes.has(shape), colour + ' has the shape of ' + shapes.get(shape) + ': ' + shape);
    shapes.set(shape, colour);
  }
  assert.equal(shapes.size, 5);
});
test('tint and mark are kept in print, and the text for assistive technology is hidden from the eye only', () => {
  for (const selector of ['.dokufix-doc .dokufix-chip', '.dokufix-doc .dokufix-chip::before']){
    const rule = ruleOf(docCss, selector);
    assert.equal(rule['print-color-adjust'], 'exact', selector);
    assert.equal(rule['-webkit-print-color-adjust'], 'exact', selector);
  }
  const hidden = ruleOf(docCss, '.dokufix-doc .dokufix-chip-status');
  assert.ok(hidden, 'a rule for the hidden text');
  assert.equal(hidden.position, 'absolute');
  assert.equal(hidden['clip-path'], 'inset(50%)');
  // These two would take the text from a screen reader as well.
  assert.equal(hidden.display, undefined);
  assert.equal(hidden.visibility, undefined);
  assert.ok(!/\.dokufix-chip-status[^{]*\{[^}]*(display:none|visibility:hidden)/.test(docCss));
});
test('the built file carries the rules of the five colours', () => {
  const built = fs.readFileSync(path.join(here, '../dist/dokufix.html'), 'utf8');
  const block = built.match(/<style id="dokufix-doc-css">([\s\S]*?)<\/style>/);
  assert.ok(block, 'the block of the document styles');
  for (const [, colour] of COLOURS){
    assert.ok(block[1].includes('.dokufix-chip-' + colour + '{'), colour + ': its rule');
  }
  assert.ok(block[1].includes('.dokufix-chip-status{'), 'the rule of the hidden text');
  assert.ok(block[1].includes('.dokufix-chip:before{') || block[1].includes('.dokufix-chip::before{'), 'the rule of the mark');
});
