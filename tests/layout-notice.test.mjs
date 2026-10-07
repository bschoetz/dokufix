// The notice in a BPMN diagram's container while its layout runs, in Node:
// src/app/layout-notice.js with a fake timer and a fake clock.
//
//   npm test          (node --test tests/*.test.mjs)

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { showLayoutNotice, LAYOUT_NOTICE_CLASS, LAYOUT_NOTICE_TEXT } from '../src/app/layout-notice.js';
import { removeTransient, TRANSIENT_ATTR } from '../src/app/transient.js';

function holder(){
  const { document } = parseHTML('<!DOCTYPE html><html><body><article id="preview" class="dokufix-doc"><div class="dokufix-diagram-svg">der Quelltext</div></article></body></html>');
  return document.querySelector('.dokufix-diagram-svg');
}
// An interval the test fires, and a clock it sets.
function fakeClock(){
  const clock = { t: 5000, intervals: new Map(), next: 1 };
  clock.now = () => clock.t;
  clock.timers = {
    setInterval: (fn, ms) => { const id = clock.next++; clock.intervals.set(id, { fn, ms }); return id; },
    clearInterval: id => clock.intervals.delete(id),
  };
  // The clock moves to at, and the interval fires once.
  clock.tick = at => { clock.t = 5000 + at; for (const { fn } of clock.intervals.values()) fn(); };
  return clock;
}

test('the notice takes the container\'s place, says what is done and counts from 0 s; transient, a status whose seconds are not read out', () => {
  const h = holder(), clock = fakeClock();
  const { element } = showLayoutNotice(h, clock);
  assert.equal(h.children.length, 1);
  assert.equal(h.firstElementChild, element);
  assert.equal(h.textContent, 'Diagramm wird angeordnet … 0 s');
  assert.equal(LAYOUT_NOTICE_TEXT, 'Diagramm wird angeordnet …');
  assert.equal(element.tagName.toLowerCase(), 'p');
  assert.equal(element.getAttribute('class'), LAYOUT_NOTICE_CLASS);
  assert.equal(element.hasAttribute(TRANSIENT_ATTR), true);
  assert.equal(element.getAttribute('role'), 'status');
  assert.match(element.getAttribute('style'), /tabular-nums/);
  const seconds = element.querySelector('span');
  assert.equal(seconds.getAttribute('aria-hidden'), 'true');
  assert.equal(seconds.textContent, '0 s');
  // One interval of a second.
  assert.deepEqual([...clock.intervals.values()].map(i => i.ms), [1000]);
});

test('the seconds count up once a second, by the clock: a tick that comes late shows the time that has passed', () => {
  const h = holder(), clock = fakeClock();
  showLayoutNotice(h, clock);
  clock.tick(1000);
  assert.equal(h.textContent, 'Diagramm wird angeordnet … 1 s');
  clock.tick(2004);
  assert.equal(h.textContent, 'Diagramm wird angeordnet … 2 s');
  // The page was busy: the next tick comes at 4.6 s.
  clock.tick(4600);
  assert.equal(h.textContent, 'Diagramm wird angeordnet … 5 s');
  clock.tick(119000);
  assert.equal(h.textContent, 'Diagramm wird angeordnet … 119 s');
});

test('stop() ends the count, as often as it is called; the notice stays until it is replaced', () => {
  const h = holder(), clock = fakeClock();
  const notice = showLayoutNotice(h, clock);
  clock.tick(1000);
  notice.stop();
  notice.stop();
  assert.equal(clock.intervals.size, 0, 'no interval left');
  clock.tick(3000);
  assert.equal(h.textContent, 'Diagramm wird angeordnet … 1 s', 'it counts no more');
  assert.equal(h.firstElementChild, notice.element);
});

test('nothing that leaves the page takes it along: removeTransient() takes it out', () => {
  const h = holder(), clock = fakeClock();
  showLayoutNotice(h, clock).stop();
  removeTransient(h.ownerDocument);
  assert.equal(h.children.length, 0);
  assert.equal(h.textContent, '');
});

test('with the page\'s own timers and clock it starts and stops as well', () => {
  const h = holder();
  const notice = showLayoutNotice(h);
  assert.equal(h.textContent, 'Diagramm wird angeordnet … 0 s');
  notice.stop();
});
