// The queue of render(), run in Node: src/app/render-queue.js with a
// renderOnce of the test's own, whose renders end when the test says so.
//
//   npm test          (node --test tests/*.test.mjs)
//
// What a render does is the browser runs' (tests/durchlaeufe.mjs, case 15:
// an export asked for during a layout, a render during the layout of
// hund3); here, when each runs, with what signal, and when whoever waits
// for one is answered.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRenderQueue } from '../src/app/render-queue.js';

// A renderOnce whose every run is kept, { signal, end() }, and ends when the
// test calls end(); a run looks at its signal when it ends, as the passes do.
function renders(){
  const runs = [];
  const renderOnce = signal => new Promise(resolve => {
    const run = { signal, ended: false, abortedAtEnd: null };
    run.end = () => { run.ended = true; run.abortedAtEnd = signal.aborted; resolve(); };
    runs.push(run);
  });
  return { runs, renderOnce };
}
// The microtasks and the promise callbacks of now.
const tick = () => new Promise(r => setImmediate(r));
// Whether a promise has settled by now.
const settledYet = async p => { let done = false; p.then(() => { done = true; }, () => { done = true; }); await tick(); return done; };

test('an export\'s render, then a new one: the export is answered only when the new one is done, and its own was aborted', async () => {
  const { runs, renderOnce } = renders();
  const render = makeRenderQueue(renderOnce);
  const forExport = render();
  await tick();
  assert.equal(runs.length, 1, 'the export\'s render runs');
  // A new render while it runs (a layout in its worker, say): the one running is aborted.
  const newer = render();
  assert.equal(runs[0].signal.aborted, true);
  runs[0].end();
  await tick();
  assert.equal(await settledYet(forExport), false, 'the preview is about to be replaced: the export waits');
  assert.equal(runs.length, 2, 'the new render runs once the one before it has ended');
  assert.equal(runs[1].signal.aborted, false);
  runs[1].end();
  await forExport;
  await newer;
  assert.equal(runs.length, 2);
});

test('a render aborted before its turn runs nothing; one requested twice in the same turn runs once', async () => {
  const { runs, renderOnce } = renders();
  const render = makeRenderQueue(renderOnce);
  const first = render();
  await tick();
  const second = render(), third = render();
  runs[0].end();
  await tick();
  assert.equal(runs.length, 2, 'the second never ran');
  assert.equal(runs[1].signal.aborted, false, 'the third runs, with a signal of its own');
  runs[1].end();
  await Promise.all([first, second, third]);
  assert.equal(runs.length, 2);
  // Two in the same turn, none running: only the second runs.
  const a = render(), b = render();
  await tick();
  assert.equal(runs.length, 3);
  runs[2].end();
  await Promise.all([a, b]);
  assert.equal(runs.length, 3);
});

test('a quick chain of renders does not starve: every promise is answered once the newest is done, and that one ran to its end unaborted', async () => {
  const { runs, renderOnce } = renders();
  const render = makeRenderQueue(renderOnce);
  const asked = [];
  // Fifty requests, some in the same turn, some while a render runs; each running render ends a turn later.
  for (let i = 0; i < 50; i++){
    asked.push(render());
    if (i % 3 === 0) await tick();
    for (const run of runs) if (!run.ended && i % 2) run.end();
  }
  // From here no more requests: each run that is still open ends as it comes.
  while (runs.some(run => !run.ended) || !(await settledYet(Promise.all(asked)))){
    for (const run of runs) if (!run.ended) run.end();
    await tick();
  }
  await Promise.all(asked);
  assert.ok(runs.length < 50, runs.length + ' runs: those aborted before their turn did not run');
  // Only the newest render's signal is never aborted.
  assert.equal(runs.at(-1).signal.aborted, false, 'the last one to run is the newest');
  assert.equal(runs.at(-1).abortedAtEnd, false, 'and it ran to its end unaborted');
  assert.ok(runs.slice(0, -1).every(run => run.signal.aborted), 'every other one was aborted by a newer request');
  assert.ok(runs.every(run => run.ended), 'one at a time, each to its end');
});

test('one at a time: a render begins only when the one before it has ended, even an aborted one', async () => {
  const { runs, renderOnce } = renders();
  const render = makeRenderQueue(renderOnce);
  render();
  await tick();
  render();
  await tick();
  assert.equal(runs.length, 1, 'the second waits, though the first is aborted');
  runs[0].end();
  await tick();
  assert.equal(runs.length, 2);
  runs[1].end();
});

test('a renderOnce that rejected does not stop the queue', async () => {
  let n = 0;
  const render = makeRenderQueue(async () => { n++; if (n === 1) throw new Error('kaputt'); });
  await render().catch(() => {});
  await render();
  assert.equal(n, 2);
});
