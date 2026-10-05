// Code blocks: lines, numbers and the copy button (story 5.19), run in Node:
// no browser.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/code-blocks.js puts every line of a code block into an element of
// its own and gives a numbered block its copy button. The markup is what
// marked 18.0.14 writes for a fenced and an indented block. What needs a page,
// the numbers drawn, a long line wrapped and a real clipboard, is checked by
// the browser runs (tests/vergleich.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { buildCodeLines, attachCodeCopy, codeLines, copiedText, copyText,
  CODE_CLASS, LINE_CLASS, DIGITS_PROPERTY, COPY_CLASS, COPY_LABEL, COPIED_LABEL, FAILED_LABEL, COPIED_CLASS, FAILED_CLASS, FEEDBACK_MS } from '../src/app/code-blocks.js';
import { TRANSIENT_ATTR, removeTransient } from '../src/app/transient.js';
import { buildWarning } from '../src/app/warning.js';
import { injectFrontmatterPanel, splitFrontmatter } from '../src/app/frontmatter.js';

function rootWith(html){
  const { document, window } = parseHTML('<!DOCTYPE html><html><body><main>' + html + '</main></body></html>');
  return { root: document.querySelector('main'), document, window };
}
const lineTexts = pre => Array.from(pre.querySelectorAll('.' + LINE_CLASS)).map(l => l.textContent);
const CODE = 'function dokufix(md) {\n  const html = marked.parse(md);\n\n  return renderMermaidIn(html);\n}\n';

test('codeLines: every line with its "\\n", no empty line after the final one, an empty text one empty line', () => {
  assert.deepEqual(codeLines('a\nb\n'), ['a\n', 'b\n']);
  assert.deepEqual(codeLines('a\nb'), ['a\n', 'b']);
  assert.deepEqual(codeLines('a\n\nb\n'), ['a\n', '\n', 'b\n']);
  assert.deepEqual(codeLines('a\n\n'), ['a\n', '\n']);
  assert.deepEqual(codeLines('\n'), ['\n']);
  assert.deepEqual(codeLines(''), ['']);
  for (const text of ['a\nb\n', 'a\nb', 'a\n\nb\n', 'a\n\n', '\n', '', CODE]) assert.equal(codeLines(text).join(''), text);
});

test('buildCodeLines: a fenced block gets one line element per line, its text unchanged, the empty line numbered, no line after the final "\\n"', () => {
  const { root } = rootWith('<pre><code class="language-javascript">' + CODE.replace(/</g, '&lt;') + '</code></pre>\n');
  const pre = root.querySelector('pre'), code = pre.querySelector('code');
  buildCodeLines(root);
  assert.ok(pre.classList.contains(CODE_CLASS));
  assert.equal(code.className, 'language-javascript', 'the code keeps its class');
  assert.equal(code.textContent, CODE);
  assert.deepEqual(lineTexts(pre), ['function dokufix(md) {\n', '  const html = marked.parse(md);\n', '\n', '  return renderMermaidIn(html);\n', '}\n']);
  assert.ok(Array.from(code.childNodes).every(n => n.nodeType === 1 && n.tagName === 'SPAN' && n.className === LINE_CLASS));
  // Each line holds its text alone, one text node.
  assert.ok(Array.from(code.children).every(l => l.childNodes.length === 1 && l.firstChild.nodeType === 3));
  assert.equal(pre.getAttribute('style'), DIGITS_PROPERTY + ':1');
});

test('buildCodeLines: the gutter is as wide as the last number has digits', () => {
  const lines = n => Array.from({ length: n }, (_, i) => 'Zeile ' + (i + 1)).join('\n') + '\n';
  const { root } = rootWith([9, 10, 99, 100, 1000].map(n => '<pre><code>' + lines(n) + '</code></pre>').join('\n'));
  buildCodeLines(root);
  assert.deepEqual(Array.from(root.querySelectorAll('pre')).map(p => [p.querySelectorAll('.' + LINE_CLASS).length, p.getAttribute('style')]),
    [[9, DIGITS_PROPERTY + ':1'], [10, DIGITS_PROPERTY + ':2'], [99, DIGITS_PROPERTY + ':2'], [100, DIGITS_PROPERTY + ':3'], [1000, DIGITS_PROPERTY + ':4']]);
  // A style the author gave the pre stays.
  const styled = rootWith('<pre style="max-height:10em"><code>a\n</code></pre>');
  buildCodeLines(styled.root);
  assert.equal(styled.root.querySelector('pre').getAttribute('style'), 'max-height:10em;' + DIGITS_PROPERTY + ':1');
});

test('buildCodeLines: an indented block, a block in a list item and a block without a final "\\n" are numbered as well', () => {
  const { root } = rootWith('<pre><code>eingerückt\n</code></pre>\n<ul>\n<li>Punkt<pre><code class="language-text">Rückbuchungsbeleg ausdrucken\n</code></pre>\n</li>\n</ul>\n<pre><code>ohne Ende</code></pre>');
  buildCodeLines(root);
  assert.deepEqual(Array.from(root.querySelectorAll('pre')).map(lineTexts), [['eingerückt\n'], ['Rückbuchungsbeleg ausdrucken\n'], ['ohne Ende']]);
});

test('buildCodeLines: run again on a rendered root it changes nothing, no line inside a line', () => {
  const { root } = rootWith('<pre><code>a\n\nb\n</code></pre>');
  buildCodeLines(root);
  const once = root.innerHTML;
  buildCodeLines(root);
  attachCodeCopy(root);
  buildCodeLines(root);
  assert.equal(root.querySelectorAll('.' + LINE_CLASS + ' .' + LINE_CLASS).length, 0);
  removeTransient(root);
  assert.equal(root.innerHTML, once);
});

test('buildCodeLines: no lines for a raw pre without code, a code with markup, a diagram\'s source, the metadata panel\'s raw block, a warning\'s detail or anything transient; each stays as it is', () => {
  const { root, document } = rootWith(
    '<pre>roh ohne code\n</pre>\n' +
    '<pre><code>mit <b>Markup</b>\n</code></pre>\n' +
    '<pre><code class="language-mermaid">flowchart LR\n  a --> b\n</code></pre>\n' +
    '<pre><code class="language-bpmn">&lt;bpmn:process/&gt;\n</code></pre>\n' +
    '<pre ' + TRANSIENT_ATTR + '><code>flüchtig\n</code></pre>\n' +
    '<div ' + TRANSIENT_ATTR + '><pre><code>flüchtig\n</code></pre></div>\n' +
    '<pre><code>eins\n</code>zwei</pre>\n');
  injectFrontmatterPanel(root, splitFrontmatter('---\ntitle: Kaputt\nliste: [a, b\n---\n\n# Kaputt\n'));
  root.append(buildWarning(document, 'Ein Diagramm konnte nicht gezeichnet werden.', 'Parse error\nZeile 2'));
  assert.ok(root.querySelector('pre.dokufix-fm-raw') && root.querySelector('pre.dokufix-warning-detail'));
  const before = root.innerHTML;
  buildCodeLines(root);
  attachCodeCopy(root);
  assert.equal(root.innerHTML, before);
  assert.equal(root.querySelectorAll('.' + CODE_CLASS + ', .' + LINE_CLASS + ', .' + COPY_CLASS).length, 0);
});

test('attachCodeCopy: one transient button per numbered block, named "' + COPY_LABEL + '", after the code; run again it adds none', () => {
  const { root } = rootWith('<pre><code>a\n</code></pre>\n<pre><code>b\n</code></pre>\n<pre>roh</pre>');
  attachCodeCopy(root);
  assert.equal(root.querySelectorAll('button').length, 0, 'a block without its lines gets no button');
  buildCodeLines(root);
  attachCodeCopy(root);
  attachCodeCopy(root);
  const buttons = Array.from(root.querySelectorAll('button'));
  assert.equal(buttons.length, 2);
  for (const b of buttons){
    assert.equal(b.parentElement.tagName, 'PRE');
    assert.equal(b.previousElementSibling.tagName, 'CODE');
    assert.equal(b.className, COPY_CLASS);
    assert.equal(b.getAttribute('type'), 'button');
    assert.ok(b.hasAttribute(TRANSIENT_ATTR));
    assert.equal(b.getAttribute('aria-label'), COPY_LABEL);
    assert.equal(b.getAttribute('title'), COPY_LABEL);
    assert.equal(b.textContent, '', 'no text: the code\'s text and the place of the search stay as they are');
  }
  assert.equal(COPY_LABEL, 'Code kopieren');
  // The code's text is the same with the button; the button goes with the transient elements.
  assert.equal(root.querySelector('pre').textContent, 'a\n');
  removeTransient(root);
  assert.equal(root.querySelectorAll('button').length, 0);
});

test('copiedText: the code as written, without the numbers and without its final "\\n"', () => {
  const { root } = rootWith('<pre><code>' + CODE.replace(/</g, '&lt;') + '</code></pre>');
  buildCodeLines(root);
  assert.equal(copiedText(root.querySelector('code')), CODE.slice(0, -1));
  const { root: two } = rootWith('<pre><code>a\n\n</code></pre>');
  buildCodeLines(two);
  assert.equal(copiedText(two.querySelector('code')), 'a\n');
});

// A click and what follows it. linkedom's window makes a new navigator at
// every read and has a clock of its own, so the document gets a window of
// its own: the navigator given, the clock stubbed.
function clickable(html, navigator, setup = () => {}){
  const ctx = rootWith(html);
  const { root, document, window } = ctx;
  const timers = [];
  const win = new Proxy(window, { get: (target, key) => {
    if (key === 'navigator') return navigator;
    if (key === 'setTimeout') return (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
    if (key === 'clearTimeout') return id => { if (timers[id - 1]) timers[id - 1].fn = null; };
    return Reflect.get(target, key);
  } });
  Object.defineProperty(document, 'defaultView', { value: win, configurable: true });
  const errors = [];
  const consoleError = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  setup(ctx);
  buildCodeLines(root);
  attachCodeCopy(root);
  const button = root.querySelector('.' + COPY_CLASS);
  const click = async () => {
    button.dispatchEvent(new window.Event('click'));
    for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  };
  const elapse = () => { for (const t of timers.splice(0)) if (t.fn) t.fn(); };
  const done = () => { console.error = consoleError; };
  return { ...ctx, button, click, elapse, timers, errors, done };
}

test('a click copies through the Clipboard API: the code without numbers and final "\\n"; for 2 s the button is named "' + COPIED_LABEL + '" and shows the check, then as before', async () => {
  const written = [];
  const c = clickable('<pre><code>' + CODE.replace(/</g, '&lt;') + '</code></pre>', { clipboard: { writeText: async text => { written.push(text); } } });
  try {
    await c.click();
    assert.deepEqual(written, [CODE.slice(0, -1)]);
    assert.equal(c.button.getAttribute('aria-label'), COPIED_LABEL);
    assert.equal(c.button.getAttribute('title'), COPIED_LABEL);
    assert.ok(c.button.classList.contains(COPIED_CLASS));
    assert.equal(c.timers.at(-1).ms, FEEDBACK_MS);
    assert.equal(FEEDBACK_MS, 2000);
    // A second click within the 2 s starts them anew.
    await c.click();
    assert.equal(c.timers.filter(t => t.fn).length, 1);
    c.elapse();
    assert.equal(c.button.getAttribute('aria-label'), COPY_LABEL);
    assert.equal(c.button.getAttribute('title'), COPY_LABEL);
    assert.ok(!c.button.classList.contains(COPIED_CLASS));
    assert.deepEqual(c.errors, []);
  } finally { c.done(); }
});

test('Clipboard API missing or refused: the copy goes through a hidden textarea and execCommand("copy"), which leaves nothing behind', async () => {
  for (const clipboard of [undefined, { writeText: async () => { throw new Error('NotAllowedError'); } }]){
    const copied = [];
    const c = clickable('<pre><code>eins\nzwei\n</code></pre>', clipboard ? { clipboard } : {}, ({ document }) => {
      document.execCommand = cmd => {
        const area = document.querySelector('textarea');
        copied.push([cmd, area && area.value, area && area.hasAttribute(TRANSIENT_ATTR)]);
        return true;
      };
    });
    try {
      await c.click();
      assert.deepEqual(copied, [['copy', 'eins\nzwei', true]]);
      assert.equal(c.document.querySelectorAll('textarea').length, 0, 'the textarea is gone');
      assert.equal(c.button.getAttribute('aria-label'), COPIED_LABEL);
      assert.deepEqual(c.errors, []);
    } finally { c.done(); }
  }
});

test('both ways fail: the button is named "' + FAILED_LABEL + '" for 2 s, and the console says why once', async () => {
  const c = clickable('<pre><code>eins\n</code></pre>', { clipboard: { writeText: async () => { throw new Error('NotAllowedError'); } } }, ({ document }) => {
    document.execCommand = () => false;
  });
  try {
    await c.click();
    assert.equal(c.button.getAttribute('aria-label'), FAILED_LABEL);
    assert.equal(c.button.getAttribute('title'), FAILED_LABEL);
    assert.ok(c.button.classList.contains(FAILED_CLASS) && !c.button.classList.contains(COPIED_CLASS));
    assert.equal(c.errors.length, 1);
    assert.match(c.errors[0], /NotAllowedError/);
    assert.equal(c.document.querySelectorAll('textarea').length, 0);
    c.elapse();
    assert.equal(c.button.getAttribute('aria-label'), COPY_LABEL);
    assert.ok(!c.button.classList.contains(FAILED_CLASS));
  } finally { c.done(); }
});

test('copyText: a document without execCommand fails without throwing', async () => {
  const { document } = rootWith('');
  document.execCommand = undefined;
  const failed = await copyText(document, 'x');
  assert.ok(failed instanceof Error);
  assert.equal(document.querySelectorAll('textarea').length, 0);
});
