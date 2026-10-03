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
import { diagramTitle, diagramFigure, drawDiagrams, drawnWidth, removeRendererLeftovers, removeViewerLeftovers, DIAGRAM_CLASS, DIAGRAM_SVG_CLASS, DIAGRAM_TITLE_DEFAULT, DIAGRAM_KINDS, DIAGRAM_ZOOM_STEPS, MERMAID_NO_LIBRARY } from '../src/app/diagrams.js';
import { buildChips } from '../src/app/chips.js';
import { DIAGRAM_LANGUAGES } from '../src/app/diagram-kinds.js';

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
// An element as markup with its attributes in alphabetical order: linkedom
// writes them in an order of its own.
const canon = el => el.nodeType === 3 ? el.textContent
  : '<' + el.tagName.toLowerCase() + Array.from(el.attributes).map(a => [a.name, a.value]).sort().map(([n, v]) => ' ' + n + (v === '' ? '' : '="' + v + '"')).join('') + '>' +
    Array.from(el.childNodes).map(canon).join('') + (el.tagName === 'INPUT' ? '' : '</' + el.tagName.toLowerCase() + '>');
// The figure of the n-th diagram as diagrams.js writes it, the SVG container empty.
const FIGURE_INSIDE = n =>
  '<input class="dokufix-diagram-toggle" type="checkbox" id="dokufix-diagram-' + n + '-open" aria-label="Ablauf groß anzeigen">' +
  ['fit', '100', '150', '200'].map(v => '<input class="dokufix-diagram-zoom" type="radio" name="dokufix-diagram-' + n + '-zoom" value="' + v + '" id="dokufix-diagram-' + n + '-' + v + '"' + (v === 'fit' ? ' checked' : '') + '>').join('') +
  '<div class="dokufix-diagram-view"><div class="dokufix-diagram-bar"><span class="dokufix-diagram-name">Ablauf</span>' +
  '<span class="dokufix-diagram-steps" role="group" aria-label="Zoom">' +
  [['fit', 'Einpassen'], ['100', '100 %'], ['150', '150 %'], ['200', '200 %']].map(([v, t]) => '<label class="dokufix-diagram-step" for="dokufix-diagram-' + n + '-' + v + '">' + t + '</label>').join('') +
  '</span><label class="dokufix-diagram-close" for="dokufix-diagram-' + n + '-open">Schließen</label></div>' +
  '<label class="dokufix-diagram-stage" for="dokufix-diagram-' + n + '-open"><div class="dokufix-diagram-svg"></div></label></div>';

test('the figure: its classes, the title as its accessible name, the controls of the large view, the SVG container in the stage', () => {
  const root = rootWith('');
  const { figure, holder } = diagramFigure(root.ownerDocument, 'mermaid', 'Ablauf', undefined, 3);
  assert.equal(figure.tagName, 'FIGURE');
  assert.deepEqual(Array.from(figure.attributes).map(a => [a.name, a.value]).sort(), [['aria-label', 'Ablauf'], ['class', 'dokufix-diagram dokufix-diagram-mermaid']]);
  const inside = el => Array.from(el.childNodes).map(canon).join('');
  assert.equal(inside(figure), inside(rootWith(FIGURE_INSIDE(3))));
  assert.equal(figure.querySelector('.dokufix-diagram-stage > .dokufix-diagram-svg'), holder);
  assert.equal(DIAGRAM_CLASS, 'dokufix-diagram');
  assert.equal(DIAGRAM_SVG_CLASS, 'dokufix-diagram-svg');
  assert.deepEqual(DIAGRAM_ZOOM_STEPS.map(z => z.label), ['Einpassen', '100 %', '150 %', '200 %']);
  // "checked" stands on "Einpassen" alone, as an attribute; nothing is open.
  assert.deepEqual(Array.from(figure.querySelectorAll('input')).filter(i => i.hasAttribute('checked')).map(i => i.id), ['dokufix-diagram-3-fit']);
  // Every label names a control of its own figure.
  const ids = new Set(Array.from(figure.querySelectorAll('input')).map(i => i.id));
  assert.ok(Array.from(figure.querySelectorAll('label')).every(l => ids.has(l.getAttribute('for'))));
  // The title is set as an attribute and as text, so markup in it stays text.
  const odd = diagramFigure(root.ownerDocument, 'mermaid', 'A "<b>" & B', undefined, 1).figure;
  assert.equal(odd.getAttribute('aria-label'), 'A "<b>" & B');
  assert.equal(odd.querySelector('.dokufix-diagram-name').textContent, 'A "<b>" & B');
  assert.equal(odd.querySelector('.dokufix-diagram-toggle').getAttribute('aria-label'), 'A "<b>" & B groß anzeigen');
  assert.equal(odd.querySelectorAll('b').length, 0);
});

test('a credit stands below the view, outside the SVG container', () => {
  const root = rootWith('');
  const { figure } = diagramFigure(root.ownerDocument, 'bpmn', 'Ablauf', { before: 'Gezeichnet mit ', href: 'https://bpmn.io', text: 'bpmn-js' }, 1);
  assert.deepEqual(Array.from(figure.children).map(k => k.tagName.toLowerCase() + '.' + k.getAttribute('class')),
    ['input.dokufix-diagram-toggle', 'input.dokufix-diagram-zoom', 'input.dokufix-diagram-zoom', 'input.dokufix-diagram-zoom', 'input.dokufix-diagram-zoom', 'div.dokufix-diagram-view', 'figcaption.dokufix-diagram-credit']);
  assert.equal(figure.lastElementChild.innerHTML, 'Gezeichnet mit <a href="https://bpmn.io">bpmn-js</a>');
});

test('the width as drawn: the SVG\'s max-width, else the width of its viewBox, else none', () => {
  const holder = svg => rootWith('<div class="dokufix-diagram-svg">' + svg + '</div>').firstElementChild;
  assert.equal(drawnWidth(holder('<svg width="100%" style="max-width: 812.25px;" viewBox="0 0 900 300"></svg>')), '812.25px');
  assert.equal(drawnWidth(holder('<svg width="100%" viewBox="-8 -8 640.5 300"></svg>')), '640.5px');
  assert.equal(drawnWidth(holder('<svg width="100%" style="max-width: 100%;" viewBox="0,0,500,300"></svg>')), '500px');
  assert.equal(drawnWidth(holder('<svg width="100%"></svg>')), '');
  assert.equal(drawnWidth(holder('')), '');
});

test('every block of a known kind becomes a figure in its place, drawn in the order of the document', async () => {
  drawn.length = 0;
  const root = rootWith('<h2>Eins</h2>' + block('mermaid', 'flowchart LR\n  A --&gt; B') + '<p>Mitte.</p><h2>Zwei</h2>' + block('mermaid', 'b') + block('js', 'const a = 1;'));
  await drawDiagrams(root, { mermaid: fake });
  const figures = Array.from(root.querySelectorAll('figure'));
  assert.deepEqual(figures.map(f => [f.className, f.getAttribute('aria-label')]), [['dokufix-diagram dokufix-diagram-mermaid', 'Eins'], ['dokufix-diagram dokufix-diagram-mermaid', 'Zwei']]);
  // The ids of the controls carry the diagram's place in the document.
  assert.deepEqual(figures.map(f => f.querySelector('.dokufix-diagram-toggle').id), ['dokufix-diagram-1-open', 'dokufix-diagram-2-open']);
  assert.deepEqual(drawn, ['Eins', 'Zwei']);
  assert.equal(figures[0].previousElementSibling.tagName, 'H2');
  assert.equal(figures[0].nextElementSibling.tagName, 'P');
  // The renderer got the source as text, with its markup unescaped.
  assert.equal(figures[0].querySelector('.dokufix-diagram-svg > svg > title').textContent, 'flowchart LR\n  A --> B');
  // The SVG of the test's renderer says no width: the figure gets none.
  assert.equal(figures[0].getAttribute('style'), null);
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
  // The warning has no control of a large view; the two figures have theirs, by their place.
  assert.equal(w.querySelectorAll('input, label').length, 0);
  assert.deepEqual(Array.from(root.querySelectorAll('.dokufix-diagram-toggle')).map(t => t.id), ['dokufix-diagram-1-open', 'dokufix-diagram-3-open']);
});

test('a drawn diagram\'s figure gets its width as drawn, for the zoom steps of its large view', async () => {
  const sized = { render(d){ d.holder.innerHTML = d.source; }, warning: () => '' };
  const root = rootWith('<h2>Eins</h2>' + block('mermaid', '&lt;svg width="100%" style="max-width: 812.5px;" viewBox="0 0 812.5 200"&gt;&lt;/svg&gt;') +
    '<h2>Zwei</h2>' + block('mermaid', '&lt;svg width="100%" viewBox="0 0 431 200"&gt;&lt;/svg&gt;'));
  await drawDiagrams(root, { mermaid: sized });
  assert.deepEqual(Array.from(root.querySelectorAll('figure')).map(f => f.getAttribute('style')), ['--dokufix-diagram-width:812.5px', '--dokufix-diagram-width:431px']);
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

test('removeRendererLeftovers() takes what the live viewer of bpmn-js leaves out: the lightbox of its logo, its cursor classes on <body>', () => {
  const { document } = parseHTML('<!DOCTYPE html><html><body class="mode-view djs-cursor-grab djs-cursor-grabbing numbered"><div class="bjs-powered-by-lightbox"><div class="backdrop"></div></div><div class="dokufix-diagram"></div></body></html>');
  removeRendererLeftovers(document.documentElement);
  assert.equal(document.body.innerHTML, '<div class="dokufix-diagram"></div>');
  assert.equal(document.body.className, 'mode-view numbered');
  // The live page itself, by its document, on closing (src/app/live-viewer.js).
  const live = parseHTML('<!DOCTYPE html><html><body class="djs-cursor-grab"><div class="bjs-powered-by-lightbox"></div><p>x</p></body></html>').document;
  removeViewerLeftovers(live);
  assert.equal(live.body.innerHTML, '<p>x</p>');
  assert.equal(live.body.classList.length, 0);
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

// ---------- the downloads (story 2.10) ----------
// A kind of the test's own with what the product's kinds download: the text
// read after the render, as BPMN reads the XML it drew.
const withSource = { ...fake, credit: { before: 'Gezeichnet mit ', href: 'https://example.org', text: 'x' },
  render(d){ fake.render(d); d.drawnText = 'gezeichnet: ' + d.source; },
  download: { ext: '.x', mime: 'text/plain;charset=utf-8', what: 'X-Text', text: d => d.drawnText } };

test('a drawn diagram gets the line of its downloads between the view and the credit, its source as drawn, named by its title', async () => {
  drawn.length = 0;
  const root = rootWith('<h2>Ablauf</h2>' + block('x', 'a # 5 % &amp; ä') + block('mermaid', 'flowchart LR'));
  await drawDiagrams(root, { x: withSource, mermaid: { ...fake, download: DIAGRAM_KINDS.mermaid.download } });
  const [first, second] = Array.from(root.querySelectorAll('figure'));
  assert.deepEqual(Array.from(first.children).slice(-3).map(k => k.tagName.toLowerCase() + '.' + k.getAttribute('class')),
    ['div.dokufix-diagram-view', 'div.dokufix-diagram-downloads', 'figcaption.dokufix-diagram-credit']);
  const link = first.querySelector('.dokufix-diagram-downloads > a');
  assert.equal(link.getAttribute('download'), 'Ablauf.x');
  assert.equal(link.textContent, '.x');
  assert.equal(link.getAttribute('href'), 'data:text/plain;charset=utf-8,gezeichnet: a %23 5 %25 %26 %C3%A4');
  // Without a credit the line is the last child; the same title gives -2.
  assert.equal(second.lastElementChild.className, 'dokufix-diagram-downloads');
  const mmd = second.lastElementChild.firstElementChild;
  assert.equal(mmd.getAttribute('download'), 'Ablauf-2.mmd');
  assert.equal(decodeURIComponent(mmd.getAttribute('href').replace(/^data:text\/plain;charset=utf-8,/, '')), 'flowchart LR');
  assert.equal(mmd.getAttribute('title'), 'Mermaid-Text herunterladen: Ablauf-2.mmd');
  // The line is not in the view: not in the stage, not in the SVG container.
  assert.equal(root.querySelectorAll('.dokufix-diagram-view .dokufix-diagram-downloads').length, 0);
  // A kind without a download, as the test's other kinds, gets no line.
  const plain = rootWith('<h2>Eins</h2>' + block('mermaid', 'a'));
  await drawDiagrams(plain, { mermaid: fake });
  assert.equal(plain.querySelectorAll('.dokufix-diagram-downloads').length, 0);
});

test('a diagram that becomes a warning has no downloads; the names count it, so the others keep theirs', async () => {
  const kinds = {
    mermaid: { ...fake, download: DIAGRAM_KINDS.mermaid.download },
    kaputt: { render(){ throw new Error('kaputt'); }, warning: () => 'Warnung', download: { ext: '.k', mime: 'text/plain', what: 'K', text: () => '' } },
  };
  const root = rootWith('<h2>Gleich</h2>' + block('mermaid', 'a') + block('kaputt', 'b') + block('mermaid', 'c') + '<h2>Ohne</h2>' + block('kaputt', 'd'));
  await drawDiagrams(root, kinds);
  assert.equal(root.querySelectorAll('.dokufix-warning .dokufix-diagram-downloads, .dokufix-warning a[download]').length, 0);
  assert.deepEqual(Array.from(root.querySelectorAll('.dokufix-diagram-downloads > a')).map(a => a.getAttribute('download')), ['Gleich.mmd', 'Gleich-3.mmd']);
});

test('no heading before the diagram: its files are named "Diagramm"', async () => {
  const root = rootWith(block('mermaid', 'a') + block('mermaid', 'b'));
  await drawDiagrams(root, { mermaid: { ...fake, download: DIAGRAM_KINDS.mermaid.download } });
  assert.deepEqual(Array.from(root.querySelectorAll('.dokufix-diagram-downloads > a')).map(a => a.getAttribute('download')), ['Diagramm.mmd', 'Diagramm-2.mmd']);
});

test('the kinds drawn are the languages of diagram-kinds.js, the one source of their names', () => {
  assert.deepEqual(Object.keys(DIAGRAM_KINDS).sort(), Object.keys(DIAGRAM_LANGUAGES).sort());
});

test('the kinds download their source: Mermaid the block\'s text as .mmd, BPMN the XML as drawn as .bpmn', () => {
  const { mermaid, bpmn } = DIAGRAM_KINDS;
  assert.deepEqual([mermaid.download.ext, bpmn.download.ext], ['.mmd', '.bpmn']);
  assert.equal(mermaid.download.text({ source: 'flowchart LR\n' }), 'flowchart LR\n');
  assert.equal(bpmn.download.text({ source: '<a/>', xml: '<a><di/></a>' }), '<a><di/></a>');
  assert.equal(bpmn.download.text({ source: '<a/>' }), '<a/>');
});
