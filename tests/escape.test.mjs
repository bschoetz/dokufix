// The one Escape listener, src/app/escape.js, run in Node: no browser, no page.
//
//   npm test          (node --test tests/*.test.mjs)
//
// runEscape() is pure: it is handed the steps and an event, here a stand-in
// that records what is done to it. The matrix of story 5.9 in unit form: the
// first step that applies closes and stops the event, no later step runs; no
// step applies and the event goes on untouched; a key of an input method that
// is composing, and one already taken, run no step. Then the steps of the
// large view and of a table filter's field, registered on a page that
// linkedom parses, and the lists of src/app.js and src/reader.js as written.
// Which listener of a page hears the key first, window in the capture phase
// before the document, is for the browser runs (tests/vergleich.mjs): linkedom
// calls a listener on window last.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { runEscape, registerEscape, documentOf } from '../src/app/escape.js';
import { largeViewStep, largeViewOpen } from '../src/app/large-view.js';
import { filterFieldStep, FILTER_CLASS, FILTER_INPUT_CLASS } from '../src/app/filter.js';
import { diagramFigure, DIAGRAM_TOGGLE_CLASS } from '../src/app/diagrams.js';
import { TRANSIENT_ATTR } from '../src/app/transient.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '../src');

// A keydown that records preventDefault() and stopPropagation().
function keydown(key = 'Escape', more = {}){
  const e = { key, isComposing: false, defaultPrevented: false, stopped: false, target: null, ...more };
  e.preventDefault = () => { e.defaultPrevented = true; };
  e.stopPropagation = () => { e.stopped = true; };
  return e;
}
// A step that applies or not, and records what was asked of it.
function step(applies, log, name){
  return {
    applies: () => { log.push(name + '?'); return applies; },
    close: () => { log.push(name); },
  };
}

// ---------- runEscape ----------
test('the first step that applies closes; the event is preventDefaulted and stopped; no later step is asked', () => {
  const log = [];
  const e = keydown();
  const closed = runEscape([step(false, log, 'a'), step(true, log, 'b'), step(true, log, 'c')], e);
  assert.equal(closed, true);
  assert.deepEqual(log, ['a?', 'b?', 'b']);
  assert.ok(e.defaultPrevented);
  assert.ok(e.stopped);
});
test('no step applies: nothing closes and the event goes on untouched', () => {
  const log = [];
  const e = keydown();
  assert.equal(runEscape([step(false, log, 'a'), step(false, log, 'b')], e), false);
  assert.deepEqual(log, ['a?', 'b?']);
  assert.ok(!e.defaultPrevented);
  assert.ok(!e.stopped);
  assert.equal(runEscape([], keydown()), false, 'an empty list');
});
test('a key of an input method that is composing, a key already taken and every other key run no step', () => {
  for (const e of [keydown('Escape', { isComposing: true }), keydown('Escape', { defaultPrevented: true }), keydown('Enter'), keydown('Esc')]){
    const log = [];
    assert.equal(runEscape([step(true, log, 'a')], e), false, e.key);
    assert.deepEqual(log, [], e.key);
    assert.ok(!e.stopped, e.key);
  }
});
test('applies and close are handed the event', () => {
  const e = keydown();
  const seen = [];
  runEscape([{ applies: ev => { seen.push(ev); return true; }, close: ev => seen.push(ev) }], e);
  assert.equal(seen.length, 2);
  assert.ok(seen.every(ev => ev === e));
});

// ---------- on a page ----------
function page(){
  const { document, window } = parseHTML('<!DOCTYPE html><html><body><main class="reader-body"></main></body></html>');
  const main = document.querySelector('main');
  const { figure } = diagramFigure(document, 'mermaid', 'Ablauf', undefined, 1);
  main.appendChild(figure);
  const field = document.createElement('div');
  field.className = FILTER_CLASS;
  field.setAttribute(TRANSIENT_ATTR, '');
  const input = document.createElement('input');
  input.className = FILTER_INPUT_CLASS;
  field.appendChild(input);
  main.appendChild(field);
  const toggle = figure.querySelector('.' + DIAGRAM_TOGGLE_CLASS);
  const key = target => {
    const e = new window.Event('keydown', { bubbles: true, cancelable: true });
    e.key = 'Escape';
    target.dispatchEvent(e);
    return e;
  };
  return { document, window, toggle, input, key };
}
test('documentOf: the document of an element, of the document, of the window', () => {
  const p = page();
  assert.ok(documentOf({ target: p.input }) === p.document);
  assert.ok(documentOf({ target: p.document }) === p.document);
  assert.ok(documentOf({ target: p.window }) === p.document);
});
test('registered with the large view, the filter field and a last step: one Escape, one thing closed, in that order', () => {
  const p = page();
  let left = 0;
  registerEscape(p.document, [largeViewStep, filterFieldStep, { applies: () => true, close: () => left++ }]);
  let filtered = 0;
  p.input.addEventListener('input', () => filtered++);
  p.input.value = 'tour';
  p.toggle.checked = true;
  assert.ok(largeViewOpen(p.document));
  // The view first, wherever the focus is: here in the filled field.
  const first = p.key(p.input);
  assert.ok(!largeViewOpen(p.document), 'the view is closed');
  assert.equal(p.input.value, 'tour', 'the field keeps its text');
  assert.equal(left, 0);
  assert.ok(first.defaultPrevented);
  // Then the field, which fires input as typing does.
  p.key(p.input);
  assert.equal(p.input.value, '');
  assert.equal(filtered, 1);
  assert.equal(left, 0, 'read mode stays');
  // In the empty field Escape goes on to the last step.
  p.key(p.input);
  assert.equal(left, 1);
});
test('the filter field\'s step: only the pass\'s own field, only with text, only with the focus in it', () => {
  const p = page();
  p.input.value = 'tour';
  assert.ok(filterFieldStep.applies({ target: p.input }));
  assert.ok(!filterFieldStep.applies({ target: p.document.body }), 'focus elsewhere');
  p.input.value = '';
  assert.ok(!filterFieldStep.applies({ target: p.input }), 'empty');
  const author = p.document.createElement('input');
  author.className = FILTER_INPUT_CLASS;
  author.value = 'x';
  p.document.body.appendChild(author);
  assert.ok(!filterFieldStep.applies({ target: author }), 'an author\'s element with the class');
});

// ---------- the sources ----------
const read = name => fs.readFileSync(path.join(src, name), 'utf8');
const code = text => text.split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
function jsFiles(dir){
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const full = path.join(dir, d.name);
    return d.isDirectory() ? jsFiles(full) : d.name.endsWith('.js') ? [full] : [];
  });
}
test('the one place for Escape: no module under src/ but src/app/escape.js names the key in its code', () => {
  const with_ = jsFiles(src).filter(f => /['"]Escape['"]/.test(code(fs.readFileSync(f, 'utf8')))).map(f => path.relative(src, f));
  assert.deepEqual(with_, [path.join('app', 'escape.js')]);
});
test('the order as written: src/app.js lists all five steps, src/reader.js the three of the exports', () => {
  assert.match(code(read('app.js')), /registerEscape\(document, \[largeViewStep, searchStep, filterFieldStep, menuStep, readModeStep\]\);/);
  assert.match(code(read('reader.js')), /registerEscape\(document, \[largeViewStep, searchStep, filterFieldStep\]\);/);
  assert.doesNotMatch(read('app/escape.js'), /^import /m, 'escape.js imports nothing, dom.js least of all');
});
