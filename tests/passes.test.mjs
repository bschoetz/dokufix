// The pass runner and the modules of pure logic around it, run in Node.
//
//   npm test          (node --test tests/*.test.mjs)
//
// No browser: linkedom parses a fragment and the runner drives passes over it.
// That is enough for what a pass does to the markup. What needs layout or
// Mermaid stays in the browser runs (tests/durchlaeufe.mjs, tests/vergleich.mjs).
//
// The modules imported here are the ones that load without a page:
// passes.js, warning.js, transient.js, toc.js, frontmatter.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { runPasses } from '../src/app/passes.js';
import { buildWarning } from '../src/app/warning.js';
import { TRANSIENT_ATTR, removeTransient } from '../src/app/transient.js';
import { assignHeadingIds, processInlineToc, documentHeadings } from '../src/app/toc.js';
import { splitFrontmatter, injectFrontmatterPanel } from '../src/app/frontmatter.js';

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
