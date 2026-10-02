// The pass runner and the modules of pure logic around it, run in Node.
//
//   npm test          (node --test tests/*.test.mjs)
//
// No browser: linkedom parses a fragment and the runner drives passes over it.
// That is enough for what a pass does to the markup. What needs layout or
// Mermaid stays in the browser runs (tests/durchlaeufe.mjs, tests/vergleich.mjs).
//
// The modules imported here are the ones that load without a page:
// passes.js, warning.js, transient.js, toc.js, frontmatter.js, callouts.js,
// chips.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { runPasses } from '../src/app/passes.js';
import { buildWarning } from '../src/app/warning.js';
import { TRANSIENT_ATTR, removeTransient } from '../src/app/transient.js';
import { assignHeadingIds, processInlineToc, documentHeadings, headingLabelText } from '../src/app/toc.js';
import { splitFrontmatter, injectFrontmatterPanel } from '../src/app/frontmatter.js';
import { buildCallouts } from '../src/app/callouts.js';
import { buildChips } from '../src/app/chips.js';

// A root like the preview, holding the given markup.
function rootWith(html){
  const { document } = parseHTML('<!DOCTYPE html><html><body><article id="root" class="dokufix-doc">' + html + '</article></body></html>');
  return document.getElementById('root');
}
// Runs fn with console.error collected instead of printed.
async function quiet(t, fn){
  const logged = t.mock.method(console, 'error', () => {});
  const result = await fn();
  return { result, logged: logged.mock.calls.map(c => c.arguments) };
}
const mark = text => root => { root.insertAdjacentHTML('beforeend', '<p class="spur">' + text + '</p>'); };
const trail = root => Array.from(root.querySelectorAll('.spur')).map(p => p.textContent);
const later = () => new Promise(resolve => setTimeout(resolve, 5));

// ---------- the runner ----------
test('passes run in the order of the list, each with the root and the context', async () => {
  const root = rootWith('<h1>Titel</h1>');
  const context = { frontmatter: { kind: null } };
  const seen = [];
  const pass = name => ({ name, run(r, c){ seen.push([name, r === root, c === context]); } });
  const failed = await runPasses(root, [pass('eins'), pass('zwei'), pass('drei')], context);
  assert.deepEqual(seen, [['eins', true, true], ['zwei', true, true], ['drei', true, true]]);
  assert.deepEqual(failed, []);
  assert.equal(root.innerHTML, '<h1>Titel</h1>');
});
test('a pass that returns a promise is finished before the next one starts', async () => {
  const root = rootWith('');
  await runPasses(root, [
    { name: 'langsam', async run(r){ await later(); mark('langsam')(r); } },
    { name: 'schnell', run: mark('schnell') },
  ]);
  assert.deepEqual(trail(root), ['langsam', 'schnell']);
});
test('an empty list does nothing', async () => {
  const root = rootWith('<p>Text</p>');
  assert.deepEqual(await runPasses(root, []), []);
  assert.equal(root.innerHTML, '<p>Text</p>');
});
test('a pass that throws: the others run, one warning names it at the top, the error is logged', async t => {
  const root = rootWith('<h1>Titel</h1>');
  const boom = new Error('mit <Absicht> & "so"');
  const { result: failed, logged } = await quiet(t, () => runPasses(root, [
    { name: 'davor', run: mark('davor') },
    { name: 'Prüfschritt', run(){ throw boom; } },
    { name: 'danach', run: mark('danach') },
  ]));
  assert.deepEqual(trail(root), ['davor', 'danach']);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].name, 'Prüfschritt');
  assert.equal(failed[0].error, boom);
  const warnings = root.querySelectorAll('.dokufix-warning');
  assert.equal(warnings.length, 1);
  // Compared with ===: a failed assert.equal on two elements would print both trees.
  assert.ok(warnings[0] === root.firstElementChild, 'the warning is the first thing in the document');
  assert.ok(warnings[0] === failed[0].warning, 'the failure carries its warning');
  assert.equal(warnings[0].querySelector('.dokufix-warning-title').textContent,
    'Warnung: Der Schritt „Prüfschritt“ ist fehlgeschlagen. Das Dokument kann unvollständig sein.');
  // The message is text, not markup.
  assert.equal(warnings[0].querySelector('.dokufix-warning-detail').textContent, 'mit <Absicht> & "so"');
  assert.equal(warnings[0].querySelector('.dokufix-warning-detail').children.length, 0);
  assert.equal(logged.length, 1);
  assert.match(String(logged[0][0]), /Prüfschritt/);
  assert.equal(logged[0][1], boom);
});
test('a pass whose promise is rejected is contained the same way, and the runner does not reject', async t => {
  const root = rootWith('');
  const { result: failed } = await quiet(t, () => runPasses(root, [
    { name: 'später kaputt', async run(){ await later(); throw new Error('zu spät'); } },
    { name: 'danach', run: mark('danach') },
  ]));
  assert.deepEqual(failed.map(f => f.name), ['später kaputt']);
  assert.deepEqual(trail(root), ['danach']);
  assert.equal(root.querySelectorAll('.dokufix-warning').length, 1);
});
test('several failures: one warning each, at the top, in the order of the list', async t => {
  const root = rootWith('<h1>Titel</h1>');
  const { result: failed } = await quiet(t, () => runPasses(root, [
    { name: 'A', run(){ throw new Error('a'); } },
    { name: 'B', run: mark('b') },
    { name: 'C', run(){ throw 'nur ein Text'; } },
  ]));
  assert.deepEqual(failed.map(f => f.name), ['A', 'C']);
  const kids = Array.from(root.children);
  assert.deepEqual(kids.map(k => k.className || k.tagName), ['dokufix-warning', 'dokufix-warning', 'H1', 'spur']);
  assert.match(kids[0].textContent, /„A“/);
  assert.match(kids[1].textContent, /„C“/);
  // Something thrown that is no Error still gives its text.
  assert.equal(kids[1].querySelector('.dokufix-warning-detail').textContent, 'nur ein Text');
});
test('a pass sees what the passes before it did, and what a failed one had done so far stays', async t => {
  const root = rootWith('<p>eins</p><p>zwei</p>');
  await quiet(t, () => runPasses(root, [
    { name: 'halb', run(r){ r.firstElementChild.className = 'erledigt'; throw new Error('mittendrin'); } },
    { name: 'zählt', run(r){ r.setAttribute('data-erledigt', String(r.querySelectorAll('.erledigt').length)); } },
  ]));
  assert.equal(root.getAttribute('data-erledigt'), '1');
});

// ---------- the warning ----------
test('the warning says "Warnung" in its markup and carries the detail as text', () => {
  const root = rootWith('');
  const w = buildWarning(root.ownerDocument, 'Ein Diagramm konnte nicht gezeichnet werden.', '  Parse error on line 3:\n...-->\n----^\n');
  assert.equal(w.className, 'dokufix-warning');
  assert.equal(w.querySelector('.dokufix-warning-title > strong').textContent, 'Warnung:');
  assert.equal(w.querySelector('.dokufix-warning-title').textContent, 'Warnung: Ein Diagramm konnte nicht gezeichnet werden.');
  assert.equal(w.querySelector('pre.dokufix-warning-detail').textContent, 'Parse error on line 3:\n...-->\n----^');
  // No heading in it: a warning never becomes an entry of the rail or the table of contents.
  root.appendChild(w);
  assert.equal(documentHeadings(root).length, 0);
});
test('a warning without a detail has none', () => {
  const root = rootWith('');
  for (const detail of [undefined, null, '', '   ']){
    assert.ok(buildWarning(root.ownerDocument, 'Text.', detail).querySelector('.dokufix-warning-detail') === null, 'no detail for ' + JSON.stringify(detail));
  }
});

// ---------- transient elements ----------
test('removeTransient takes out every marked element, at any depth, and nothing else', () => {
  const root = rootWith('<p>bleibt</p><div ' + TRANSIENT_ATTR + '><p>geht</p></div><ul><li ' + TRANSIENT_ATTR + '="">geht</li><li>bleibt</li></ul>');
  removeTransient(root);
  assert.equal(root.innerHTML, '<p>bleibt</p><ul><li>bleibt</li></ul>');
});

// ---------- real passes over a parsed fragment ----------
test('heading ids, the inline table of contents and the metadata panel, driven by the runner', async () => {
  const root = rootWith(
    '<h1>Handbuch</h1><p>[[toc]]</p><h2>Übersicht</h2><h3>Größe und Maß</h3><h2>Übersicht</h2>' +
    '<h4>zu tief für die Liste</h4><p><code>[[toc]]</code></p>');
  const context = { frontmatter: splitFrontmatter('---\ntitle: Handbuch\nversion: 3\n---\n') };
  const failed = await runPasses(root, [
    { name: 'Metadaten', run: (r, c) => injectFrontmatterPanel(r, c.frontmatter) },
    { name: 'Überschriften', run: assignHeadingIds },
    { name: 'Inhaltsverzeichnis', run: processInlineToc },
  ], context);
  assert.deepEqual(failed, []);
  assert.deepEqual(Array.from(documentHeadings(root)).map(h => h.id), ['handbuch', 'uebersicht', 'groesse-und-mass', 'uebersicht-2', 'zu-tief-fuer-die-liste']);
  const panel = root.firstElementChild;
  assert.equal(panel.className, 'dokufix-frontmatter');
  assert.equal(panel.querySelector('.dokufix-fm-digest').textContent, 'Handbuch · 3');
  const nav = root.querySelector('nav.dokufix-toc');
  assert.ok(nav, 'the marker became a table of contents');
  assert.deepEqual(Array.from(nav.querySelectorAll('a')).map(a => a.getAttribute('href') + ' ' + a.textContent),
    ['#uebersicht Übersicht', '#groesse-und-mass Größe und Maß', '#uebersicht-2 Übersicht']);
  // The marker written as code is talked about, not used.
  assert.equal(root.querySelector('p > code').textContent, '[[toc]]');
});
test('a real pass that fails on its input is contained like any other', async t => {
  const root = rootWith('<h2>Eins</h2><p>[[toc]]</p>');
  const { result: failed } = await quiet(t, () => runPasses(root, [
    { name: 'Metadaten', run: (r, c) => injectFrontmatterPanel(r, c.frontmatter) },   // no context: throws
    { name: 'Überschriften', run: assignHeadingIds },
    { name: 'Inhaltsverzeichnis', run: processInlineToc },
  ]));
  assert.deepEqual(failed.map(f => f.name), ['Metadaten']);
  assert.equal(root.firstElementChild.className, 'dokufix-warning');
  assert.equal(root.querySelector('nav.dokufix-toc a').getAttribute('href'), '#eins');
});

// ---------- which headings count ----------
// The markup is what marked emits for a callout with a heading in it, between
// two headings of the document, and for an ordinary quotation with a heading.
const WITH_CALLOUT_HEADING =
  '<h1>Handbuch</h1><p>[[toc]]</p><h2>Ausleihe</h2><h3>Vorher</h3>' +
  '<blockquote>\n<p>[!IMPORTANT]</p>\n<h3>Im Hinweis</h3>\n<p>Text.</p>\n</blockquote>\n' +
  '<h3>Nachher</h3>' +
  '<blockquote>\n<h3>Im Zitat</h3>\n<p>Text.</p>\n</blockquote>\n' +
  '<h2>Rückgabe</h2>';
test('a heading inside a callout is no document heading: no id, no entry in the table of contents', async () => {
  const root = rootWith(WITH_CALLOUT_HEADING);
  const failed = await runPasses(root, [
    { name: 'Hinweise', run: buildCallouts },
    { name: 'Überschriften', run: assignHeadingIds },
    { name: 'Inhaltsverzeichnis', run: processInlineToc },
  ], { frontmatter: { kind: null } });
  assert.deepEqual(failed, []);
  const inside = root.querySelector('.dokufix-callout h3');
  assert.equal(inside.textContent, 'Im Hinweis');
  assert.ok(!inside.hasAttribute('id'), 'the heading inside the callout has no id');
  // An array, so every user can filter and map it.
  assert.ok(Array.isArray(documentHeadings(root)));
  assert.deepEqual(documentHeadings(root).map(h => h.id), ['handbuch', 'ausleihe', 'vorher', 'nachher', 'im-zitat', 'rueckgabe']);
  // A heading in an ordinary quotation counts, as it did before there were callouts.
  assert.deepEqual(Array.from(root.querySelectorAll('nav.dokufix-toc a')).map(a => a.getAttribute('href') + ' ' + a.textContent),
    ['#ausleihe Ausleihe', '#vorher Vorher', '#nachher Nachher', '#im-zitat Im Zitat', '#rueckgabe Rückgabe']);
});
test('the heading rule sees callouts only when their pass ran first: that is the order in render.js', async () => {
  const root = rootWith(WITH_CALLOUT_HEADING);
  await runPasses(root, [
    { name: 'Überschriften', run: assignHeadingIds },
    { name: 'Hinweise', run: buildCallouts },
  ], { frontmatter: { kind: null } });
  // Wrong order: the heading was still in a blockquote when ids were given.
  assert.equal(root.querySelector('.dokufix-callout h3').id, 'im-hinweis');
});
test('a heading inside a callout that stands in a list item or in another callout does not count either', () => {
  const root = rootWith(
    '<h2>Eins</h2>' +
    '<ul>\n<li><p>punkt</p>\n<blockquote>\n<p>[!TIP]</p>\n<h4>Im Punkt</h4>\n</blockquote>\n</li>\n</ul>\n' +
    '<blockquote>\n<p>[!WARNING]\naussen</p>\n<blockquote>\n<p>[!NOTE]</p>\n<h2>Ganz innen</h2>\n</blockquote>\n</blockquote>\n' +
    '<h2>Zwei</h2>');
  buildCallouts(root);
  assignHeadingIds(root);
  assert.deepEqual(documentHeadings(root).map(h => h.textContent), ['Eins', 'Zwei']);
  assert.equal(root.querySelectorAll('h2[id], h4[id]').length, 2);
});

// ---------- headings with a status chip ----------
// The markup is what marked emits for
//
//   # Handbuch
//   [[toc:4]]
//   ## Bestellung `🟢 Live`
//   ## `🟢 Live`
//   ### Lager `x 🟢`
//   ## `🔴 Live`
//   #### Vormerkung `⚪ geplant` und `🔵 im Test`
//
// The passes are the ones of render.js, in its order.
const WITH_CHIP_HEADINGS =
  '<h1>Handbuch</h1>\n<p>[[toc:4]]</p>\n<h2>Bestellung <code>🟢 Live</code></h2>\n<h2><code>🟢 Live</code></h2>\n' +
  '<h3>Lager <code>x 🟢</code></h3>\n<h2><code>🔴 Live</code></h2>\n' +
  '<h4>Vormerkung <code>⚪ geplant</code> und <code>🔵 im Test</code></h4>\n';
const CHIP_PASSES = [
  { name: 'Hinweise', run: buildCallouts },
  { name: 'Status-Chips', run: buildChips },
  { name: 'Überschriften', run: assignHeadingIds },
  { name: 'Inhaltsverzeichnis', run: processInlineToc },
];
test('a heading with a chip: its entry reads the label, its anchor is the one of that text', async () => {
  const root = rootWith(WITH_CHIP_HEADINGS);
  const failed = await runPasses(root, CHIP_PASSES, { frontmatter: { kind: null } });
  assert.deepEqual(failed, []);
  assert.equal(root.querySelectorAll('h2 .dokufix-chip, h4 .dokufix-chip').length, 5);
  assert.deepEqual(documentHeadings(root).map(h => h.id),
    ['handbuch', 'bestellung-live', 'live', 'lager-x', 'live-2', 'vormerkung-geplant-und-im-test']);
  assert.deepEqual(Array.from(root.querySelectorAll('nav.dokufix-toc a')).map(a => a.getAttribute('href') + ' ' + a.textContent),
    ['#bestellung-live Bestellung Live', '#live Live', '#lager-x Lager x 🟢', '#live-2 Live', '#vormerkung-geplant-und-im-test Vormerkung geplant und im Test']);
  // The label the rails use is the same function.
  assert.deepEqual(documentHeadings(root).map(headingLabelText),
    ['Handbuch', 'Bestellung Live', 'Live', 'Lager x 🟢', 'Live', 'Vormerkung geplant und im Test']);
  // The heading itself still carries the text for assistive technology.
  assert.equal(root.querySelector('h2').textContent, 'Bestellung grün: Live');
});
test('a heading that is only a chip has an entry and an anchor, never empty ones', async () => {
  // ## `🟢 Live`, and "## `🟡 !`", whose label has nothing an anchor can be made of
  const root = rootWith('<p>[[toc]]</p>\n<h2><code>🟢 Live</code></h2>\n<h2><code>🟡 !</code></h2>\n');
  await runPasses(root, CHIP_PASSES, { frontmatter: { kind: null } });
  assert.deepEqual(documentHeadings(root).map(h => h.id), ['live', 'section']);
  const entries = Array.from(root.querySelectorAll('nav.dokufix-toc a')).map(a => a.textContent);
  assert.deepEqual(entries, ['Live', '!']);
  assert.ok(entries.every(text => text.trim() !== ''));
});
test('the word for assistive technology is in neither entry nor anchor, whatever the colour', async () => {
  const dots = ['🟢', '🟡', '🔴', '⚪', '🔵'];
  const root = rootWith('<p>[[toc]]</p>\n' + dots.map((dot, i) => '<h2>Teil ' + (i + 1) + ' <code>' + dot + ' Stand</code></h2>\n').join(''));
  await runPasses(root, CHIP_PASSES, { frontmatter: { kind: null } });
  assert.deepEqual(documentHeadings(root).map(h => h.id), [1, 2, 3, 4, 5].map(n => 'teil-' + n + '-stand'));
  assert.deepEqual(Array.from(root.querySelectorAll('nav.dokufix-toc a')).map(a => a.textContent), [1, 2, 3, 4, 5].map(n => 'Teil ' + n + ' Stand'));
  // Five headings, five words, none of them in a label.
  assert.equal(new Set(Array.from(root.querySelectorAll('.dokufix-chip-status')).map(s => s.textContent)).size, 5);
});
test('the anchors of headings with a chip are the ones they had as code spans, and other anchors do not move', () => {
  // Before there were chips the code span was part of the heading's text and
  // the dot fell out of the anchor. So a document that already wrote a status
  // into a heading keeps its links.
  const markup = WITH_CHIP_HEADINGS +
    // a heading with a footnote marker, as marked-footnote emits it, and two alike
    '<h2>Frist<sup><a id="footnote-ref-quelle" href="#footnote-quelle" data-footnote-ref="" aria-describedby="footnote-label">1</a></sup></h2>\n' +
    '<h3>Größe und Maß</h3>\n<h3>Größe und Maß</h3>\n<h2><code>Code</code> im Titel</h2>\n' +
    // A status that touches the text before it: "## Bestellung:`🟢 Live`",
    // "## Stand`🟢 Live`" and "## `🟢 Live`/`🔴 Tot`". The blank that kept the
    // two words apart stood inside the code span, behind the dot.
    '<h2>Bestellung:<code>🟢 Live</code></h2>\n<h2>Stand<code>🟢 Live</code></h2>\n<h2><code>🟢 Live</code>/<code>🔴 Tot</code></h2>\n';
  const before = rootWith(markup);
  assignHeadingIds(before);
  const after = rootWith(markup);
  buildChips(after);
  assignHeadingIds(after);
  assert.deepEqual(documentHeadings(after).map(h => h.id), documentHeadings(before).map(h => h.id));
  assert.deepEqual(documentHeadings(after).map(h => h.id).slice(6),
    ['frist1', 'groesse-und-mass', 'groesse-und-mass-2', 'code-im-titel', 'bestellung-live-2', 'stand-live', 'live-tot']);
  // Their entries keep the words apart as well, with one blank; a heading
  // that has a blank before its chip does not get a second one.
  assert.deepEqual(documentHeadings(after).map(headingLabelText).slice(10), ['Bestellung: Live', 'Stand Live', 'Live/ Tot']);
  assert.deepEqual(documentHeadings(after).map(headingLabelText).slice(1, 3), ['Bestellung Live', 'Live']);
});
test('the table of contents sees chips only when their pass ran first: that is the order in render.js', async () => {
  const root = rootWith(WITH_CHIP_HEADINGS);
  await runPasses(root, [
    { name: 'Überschriften', run: assignHeadingIds },
    { name: 'Inhaltsverzeichnis', run: processInlineToc },
    { name: 'Status-Chips', run: buildChips },
  ], { frontmatter: { kind: null } });
  // Wrong order: the entry was written while the heading still held the code span with its dot.
  assert.equal(root.querySelector('nav.dokufix-toc a').textContent, 'Bestellung 🟢 Live');
});
test('a chip in a heading inside a callout: a chip, and the heading still does not count', async () => {
  // > [!TIP]
  // > ### Automat `🟢 Live`
  const root = rootWith('<h2>Eins</h2>\n<blockquote>\n<p>[!TIP]</p>\n<h3>Automat <code>🟢 Live</code></h3>\n</blockquote>\n');
  await runPasses(root, CHIP_PASSES, { frontmatter: { kind: null } });
  const inside = root.querySelector('.dokufix-callout h3');
  assert.equal(inside.querySelectorAll('.dokufix-chip-green').length, 1);
  assert.ok(!inside.hasAttribute('id'));
  assert.deepEqual(documentHeadings(root).map(h => h.id), ['eins']);
});
test('the label of a heading leaves out the footnote preview and the chip\'s word, both', () => {
  // As the heading stands after every document pass: a chip and a marker with its preview.
  const root = rootWith('<h2>Frist <span class="dokufix-chip dokufix-chip-green"><span class="dokufix-chip-status">grün: </span>Live</span>' +
    '<sup class="dokufix-fn-host"><a href="#footnote-back-quelle" data-footnote-ref="">1</a><span class="dokufix-fn-preview" aria-hidden="true">Die ganze Fußnote.</span></sup></h2>');
  assert.equal(headingLabelText(root.querySelector('h2')), 'Frist Live1');
  // The heading is not changed by being asked.
  assert.equal(root.querySelectorAll('.dokufix-chip-status, .dokufix-fn-preview').length, 2);
});
