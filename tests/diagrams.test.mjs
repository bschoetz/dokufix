// The figure every diagram stands in, run in Node: no browser, no library.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/diagrams.js makes the figure, finds its title and hands each diagram
// to the renderer of its kind. The renderers need a page and a library; here
// drawDiagrams() gets renderers of the test's own, so what is checked is the
// markup around a diagram, its title, the order and the containment of a
// renderer that throws. That a library draws into the figure is checked by the
// browser runs (tests/vergleich.mjs, tests/durchlaeufe.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { diagramTitle, diagramFigure, drawDiagrams, removeRendererLeftovers, DIAGRAM_CLASS, DIAGRAM_SVG_CLASS, DIAGRAM_TITLE_DEFAULT, DIAGRAM_KINDS, MERMAID_NO_LIBRARY } from '../src/app/diagrams.js';
import { buildChips } from '../src/app/chips.js';

function rootWith(html){
  const { document } = parseHTML('<!DOCTYPE html><html><body><article id="root" class="dokufix-doc">' + html + '</article></body></html>');
  return document.getElementById('root');
}
const block = (kind, text) => '<pre><code class="language-' + kind + '">' + text + '</code></pre>';
// A renderer that writes what it was handed into the holder, as an SVG would stand there.
const drawn = [];
const fake = { render(d){ drawn.push(d.title); d.holder.innerHTML = '<svg data-kind="' + d.kind + '"><title>' + d.source + '</title></svg>'; }, warning: () => 'Ein Diagramm konnte nicht gezeichnet werden.' };

// ---------- the title ----------
test('the title is the label of the last heading before the diagram, at any level', () => {
  const root = rootWith('<h1>Dokument</h1><h2>Ausleihe</h2><h3>Ablauf</h3><p>Text.</p>' + block('mermaid', 'a') + '<h2>Danach</h2>');
  assert.equal(diagramTitle(root.querySelector('pre'), root), 'Ablauf');
  const deeper = rootWith('<h2>Ausleihe</h2><h5>Ganz tief</h5>' + block('mermaid', 'a'));
  assert.equal(diagramTitle(deeper.querySelector('pre'), deeper), 'Ganz tief');
});

test('no heading before the diagram: "Diagramm"', () => {
  const root = rootWith('<p>Vorweg.</p>' + block('mermaid', 'a') + '<h2>Erst danach</h2>');
  assert.equal(diagramTitle(root.querySelector('pre'), root), DIAGRAM_TITLE_DEFAULT);
  assert.equal(DIAGRAM_TITLE_DEFAULT, 'Diagramm');
});

test('a heading inside a callout does not count: "Diagramm", or the document heading before the callout', () => {
  const callout = '<div class="dokufix-callout dokufix-callout-note" role="note"><h3>Im Hinweis</h3><p>Text.</p></div>';
  const only = rootWith(callout + block('mermaid', 'a'));
  assert.equal(diagramTitle(only.querySelector('pre'), only), 'Diagramm');
  const before = rootWith('<h2>Rückgabe</h2>' + callout + block('mermaid', 'a'));
  assert.equal(diagramTitle(before.querySelector('pre'), before), 'Rückgabe');
  // A diagram inside the callout gets the document heading before the callout too.
  const inside = rootWith('<h2>Rückgabe</h2><div class="dokufix-callout"><h3>Im Hinweis</h3>' + block('mermaid', 'a') + '</div>');
  assert.equal(diagramTitle(inside.querySelector('pre'), inside), 'Rückgabe');
});

test('the title is the heading as the table of contents shows it: a status chip by its label, a footnote preview left out', () => {
  const root = rootWith('<h2>Automat <code>🟢 in Betrieb</code></h2>' + block('mermaid', 'a'));
  buildChips(root);
  assert.equal(diagramTitle(root.querySelector('pre'), root), 'Automat in Betrieb');
  const note = rootWith('<h2>Fristen<sup class="dokufix-fn-host"><a data-footnote-ref href="#fn">1</a><span class="dokufix-fn-preview">Die ganze Fußnote.</span></sup></h2>' + block('mermaid', 'a'));
  assert.equal(diagramTitle(note.querySelector('pre'), note), 'Fristen1');
});

test('a heading with no text gives "Diagramm"', () => {
  const root = rootWith('<h2>  </h2>' + block('mermaid', 'a'));
  assert.equal(diagramTitle(root.querySelector('pre'), root), 'Diagramm');
});

// ---------- the figure ----------
test('the figure: its classes, the title as its accessible name, the SVG container as its one child', () => {
  const root = rootWith('');
  const { figure, holder } = diagramFigure(root.ownerDocument, 'mermaid', 'Ablauf');
  assert.equal(figure.tagName, 'FIGURE');
  assert.deepEqual(Array.from(figure.attributes).map(a => [a.name, a.value]).sort(), [['aria-label', 'Ablauf'], ['class', 'dokufix-diagram dokufix-diagram-mermaid']]);
  assert.equal(figure.innerHTML, '<div class="dokufix-diagram-svg"></div>');
  assert.equal(figure.firstElementChild, holder);
  assert.equal(DIAGRAM_CLASS, 'dokufix-diagram');
  assert.equal(DIAGRAM_SVG_CLASS, 'dokufix-diagram-svg');
  // The title is set as an attribute, so markup in it stays text.
  const odd = diagramFigure(root.ownerDocument, 'mermaid', 'A "<b>" & B').figure;
  assert.equal(odd.getAttribute('aria-label'), 'A "<b>" & B');
  assert.equal(odd.querySelectorAll('b').length, 0);
});

test('every block of a known kind becomes a figure in its place, drawn in the order of the document', async () => {
  drawn.length = 0;
  const root = rootWith('<h2>Eins</h2>' + block('mermaid', 'flowchart LR\n  A --&gt; B') + '<p>Mitte.</p><h2>Zwei</h2>' + block('mermaid', 'b') + block('js', 'const a = 1;'));
  await drawDiagrams(root, { mermaid: fake });
  const figures = Array.from(root.querySelectorAll('figure'));
  assert.deepEqual(figures.map(f => [f.className, f.getAttribute('aria-label')]), [['dokufix-diagram dokufix-diagram-mermaid', 'Eins'], ['dokufix-diagram dokufix-diagram-mermaid', 'Zwei']]);
  assert.deepEqual(drawn, ['Eins', 'Zwei']);
  assert.equal(figures[0].previousElementSibling.tagName, 'H2');
  assert.equal(figures[0].nextElementSibling.tagName, 'P');
  // The renderer got the source as text, with its markup unescaped.
  assert.equal(figures[0].querySelector('.dokufix-diagram-svg > svg > title').textContent, 'flowchart LR\n  A --> B');
  // A block of another language stays a code block.
  assert.equal(root.querySelectorAll('pre code.language-js').length, 1);
  assert.equal(root.querySelectorAll('pre code.language-mermaid').length, 0);
});

test('a diagram whose renderer throws becomes the warning of its kind, with the message; the others are drawn', async t => {
  const kinds = {
    mermaid: fake,
    kaputt: { render(){ throw new Error('Parse error on line 2'); }, warning: d => 'Das Diagramm „' + d.title + '“ konnte nicht gezeichnet werden.' },
  };
  const root = rootWith('<h2>Eins</h2>' + block('mermaid', 'a') + '<h2>Zwei</h2>' + block('kaputt', 'b') + '<h2>Drei</h2>' + block('mermaid', 'c'));
  await drawDiagrams(root, kinds);
  const kids = Array.from(root.children).map(k => k.tagName.toLowerCase() + '.' + String(k.className).split(' ')[0]);
  assert.deepEqual(kids, ['h2.', 'figure.dokufix-diagram', 'h2.', 'div.dokufix-warning', 'h2.', 'figure.dokufix-diagram']);
  const w = root.querySelector('.dokufix-warning');
  assert.equal(w.querySelector('.dokufix-warning-title').textContent, 'Warnung: Das Diagramm „Zwei“ konnte nicht gezeichnet werden.');
  assert.equal(w.querySelector('.dokufix-warning-detail').textContent, 'Parse error on line 2');
});

test('a document without diagrams is left as it is', async () => {
  const html = '<h2>Eins</h2><p>Text.</p><pre><code>ohne Sprache</code></pre>';
  const root = rootWith(html);
  await drawDiagrams(root, { mermaid: fake });
  assert.equal(root.innerHTML, html);
});

test('removeRendererLeftovers() takes Mermaid\'s tooltip out of a copy of the page, and nothing else', () => {
  const { document } = parseHTML('<!DOCTYPE html><html><body><div class="mermaidTooltip"></div><div class="dokufix-diagram"></div></body></html>');
  removeRendererLeftovers(document.documentElement);
  assert.equal(document.body.innerHTML, '<div class="dokufix-diagram"></div>');
});

test('without Mermaid in the page a Mermaid block is the warning that says so, on the console as well', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const before = globalThis.mermaid;
  delete globalThis.mermaid;
  try {
    const root = rootWith('<h2>Ablauf</h2>' + block('mermaid', 'flowchart LR\n  a --> b'));
    await drawDiagrams(root, DIAGRAM_KINDS);
    const w = root.querySelector('.dokufix-warning');
    assert.equal(w.querySelector('.dokufix-warning-title').textContent, 'Warnung: Ein Diagramm konnte nicht gezeichnet werden.');
    assert.equal(w.querySelector('.dokufix-warning-detail').textContent, MERMAID_NO_LIBRARY);
    assert.equal(MERMAID_NO_LIBRARY, 'Die Bibliothek Mermaid wurde nicht geladen.');
    assert.equal(logged.mock.calls[0].arguments[0], 'Mermaid error:');
  } finally {
    if (before !== undefined) globalThis.mermaid = before;
  }
});
