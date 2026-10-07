// The layout's client, run in Node: src/app/layout-client.js with a fake
// worker, which answers, keeps silent, fails or is aborted, and without one.
//
//   npm test          (node --test tests/*.test.mjs)
//
// The worker is the fake's: postMessage() records, terminate() records, and
// the test answers through onmessage or fails through onerror when it wants.
// Its answers are answerLayout()'s, what src/layout-worker.js posts; that the
// built block answers so is tests/build.test.mjs's, and that a browser runs
// it, tests/durchlaeufe.mjs's.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLayoutClient, pageWorker, LAYOUT_TIME_LIMIT, LAYOUT_START_LIMIT, LAYOUT_ABORTED, LAYOUT_WORKER_FAILED, layoutTimeLimitText, layoutStartText } from '../src/app/layout-client.js';
import { layoutJob, answerLayout } from '../src/app/bpmn-layout-job.js';
import { LAYOUT_NOTHING } from '../src/app/bpmn-layout.js';

const XML = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="P"><bpmn:startEvent id="S" name="Los"/><bpmn:task id="A" name="Tun"/>' +
  '<bpmn:sequenceFlow id="F" sourceRef="S" targetRef="A"/></bpmn:process></bpmn:definitions>';
const OTHER = XML.replace('name="Tun"', 'name="Lassen"');
const EMPTY = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="P1"/></bpmn:definitions>';

// Fake workers: every one made is in made, with what it was sent and whether
// it was terminated. Each says { ready: true } once it is made, as
// src/layout-worker.js does once it is loaded, in a microtask, after the
// client has set its listeners; ready: false makes workers that keep silent
// until the test calls ready().
function fakeWorkers({ ready = true } = {}){
  const made = [];
  class FakeWorker {
    constructor(){
      this.sent = []; this.terminated = false; this.onmessage = null; this.onerror = null; this.onmessageerror = null;
      made.push(this);
      if (ready) queueMicrotask(() => this.ready());
    }
    postMessage(m){ this.sent.push(structuredClone(m)); }
    terminate(){ this.terminated = true; }
    ready(){ this.onmessage && this.onmessage({ data: { ready: true } }); }
    // The worker's answer to its last message, as src/layout-worker.js gives it.
    answer(message = this.sent.at(-1)){ this.onmessage && this.onmessage({ data: structuredClone(answerLayout(message)) }); }
    fail(message){ const e = { message, prevented: false, preventDefault(){ this.prevented = true; } }; this.error = e; this.onerror && this.onerror(e); }
    // An answer the page could not read: a messageerror carries no message.
    unreadable(){ const e = { prevented: false, preventDefault(){ this.prevented = true; } }; this.onmessageerror && this.onmessageerror(e); }
  }
  return { made, makeWorker: () => new FakeWorker() };
}
// A log that keeps its lines.
const quiet = () => { const lines = []; return { lines, info: line => lines.push(line) }; };
// Timers of the test's own: they fire when told, and tell what is pending.
// fire(ms) fires those set for ms: the time limit, or the start limit.
function fakeTimers(){
  let next = 1;
  const pending = new Map();
  return {
    pending,
    setTimeout(fn, ms){ const id = next++; pending.set(id, { fn, ms }); return id; },
    clearTimeout(id){ pending.delete(id); },
    fireAll(){ for (const [id, t] of [...pending]){ pending.delete(id); t.fn(); } },
    fire(ms){ for (const [id, t] of [...pending]) if (t.ms === ms){ pending.delete(id); t.fn(); } },
    limits: () => [...pending.values()].map(t => t.ms).sort((a, b) => a - b),
  };
}
// The microtasks of now, the fake workers' "ready" among them.
const tick = () => new Promise(r => setImmediate(r));
// Whether a promise has settled by now.
const settledYet = async p => { let done = false; p.then(() => { done = true; }, () => { done = true; }); await new Promise(r => setImmediate(r)); return done; };

test('the time limit is 120 s, and the reason says it in seconds', () => {
  assert.equal(LAYOUT_TIME_LIMIT, 120000);
  assert.equal(layoutTimeLimitText(120000), 'Das Layout hat die Zeitgrenze von 120 s überschritten.');
  assert.equal(layoutTimeLimitText(50), 'Das Layout hat die Zeitgrenze von 0,05 s überschritten.');
});

test('a worker that answers: the result is layoutJob()\'s, the worker is made once and the requests go one after the other', async () => {
  const { made, makeWorker } = fakeWorkers();
  const timers = fakeTimers(), log = quiet();
  const client = makeLayoutClient({ makeWorker, timers, log });
  assert.equal(made.length, 0, 'no worker before the first request');
  const first = client.layout(XML), second = client.layout(OTHER);
  assert.equal(made.length, 1);
  const w = made[0];
  assert.deepEqual(w.sent.map(m => m.id), [1], 'the second waits for the first');
  assert.deepEqual(timers.limits(), [LAYOUT_START_LIMIT, LAYOUT_TIME_LIMIT], 'the worker\'s start limit and the running request\'s time limit');
  await tick();
  assert.deepEqual(timers.limits(), [LAYOUT_TIME_LIMIT], 'it said it was ready: one time limit runs, the running request\'s');
  assert.equal(await settledYet(first), false);
  w.answer();
  assert.deepEqual(await first, layoutJob(XML));
  assert.deepEqual(w.sent.map(m => m.id), [1, 2]);
  assert.deepEqual(w.sent[1], { id: 2, xml: OTHER });
  w.answer();
  assert.deepEqual(await second, layoutJob(OTHER));
  // The worker stays for the next render.
  const third = client.layout(XML);
  w.answer();
  await third;
  assert.equal(made.length, 1);
  assert.equal(w.terminated, false);
  assert.equal(timers.pending.size, 0, 'no timer left');
  assert.deepEqual(log.lines, []);
  assert.equal(client.withoutWorker(), false);
});

test('a refusal of the layout comes back as an Error with its reason, and the next request is answered', async () => {
  const { made, makeWorker } = fakeWorkers();
  const client = makeLayoutClient({ makeWorker, timers: fakeTimers(), log: quiet() });
  const refused = client.layout(EMPTY), next = client.layout(XML);
  made[0].answer();
  await assert.rejects(refused, e => e instanceof Error && e.message === LAYOUT_NOTHING);
  made[0].answer();
  assert.deepEqual(await next, layoutJob(XML));
  assert.equal(made.length, 1, 'a refusal is no fault of the worker');
});

test('a silent worker: after the time limit it is terminated, the request rejects with the reason, the next one gets a new worker', async () => {
  const { made, makeWorker } = fakeWorkers();
  // A short limit and the real timers.
  const client = makeLayoutClient({ makeWorker, timeLimit: 30, log: quiet() });
  const silent = client.layout(XML), next = client.layout(OTHER);
  const t = performance.now();
  await assert.rejects(silent, { message: layoutTimeLimitText(30) });
  assert.ok(performance.now() - t >= 25, 'not before the limit');
  assert.equal(made[0].terminated, true);
  assert.equal(made.length, 2, 'the next request got a new worker');
  assert.deepEqual(made[1].sent, [{ id: 2, xml: OTHER }]);
  // A late answer of the old worker is heard by nobody.
  made[0].answer(made[0].sent[0]);
  assert.equal(await settledYet(next), false);
  made[1].answer();
  assert.deepEqual(await next, layoutJob(OTHER));
});

test('an answer to another request than the one running is not taken for it', async () => {
  const { made, makeWorker } = fakeWorkers();
  const client = makeLayoutClient({ makeWorker, timers: fakeTimers(), log: quiet() });
  const p = client.layout(XML);
  made[0].onmessage({ data: { id: 99, ok: true, result: { xml: 'falsch' } } });
  made[0].onmessage({ data: null });
  assert.equal(await settledYet(p), false);
  made[0].answer();
  assert.deepEqual(await p, layoutJob(XML));
});

test('no worker to make (no Worker API, no block, a page that forbids it): laid out on the page, in the same call, decided once with one line', async () => {
  const log = quiet();
  let asked = 0;
  const client = makeLayoutClient({ makeWorker: () => { asked++; throw new Error('the page has no Worker'); }, log });
  const p = client.layout(XML);
  assert.equal(await settledYet(p), true, 'settled in the same turn');
  assert.deepEqual(await p, layoutJob(XML));
  await assert.rejects(client.layout(EMPTY), { message: LAYOUT_NOTHING });
  assert.deepEqual(await client.layout(OTHER), layoutJob(OTHER));
  assert.equal(asked, 1, 'decided once');
  assert.deepEqual(log.lines, ['BPMN layout on the page, without a worker: the page has no Worker']);
  assert.equal(client.withoutWorker(), true);
});

test('in Node the page\'s worker is refused, since there is no Worker, and the default client lays out on the page', async () => {
  assert.equal(typeof Worker, 'undefined');
  assert.throws(() => pageWorker(), { message: 'the page has no Worker' });
  const log = quiet();
  const client = makeLayoutClient({ log });
  assert.deepEqual(await client.layout(XML), layoutJob(XML));
  assert.equal(log.lines.length, 1);
});

test('a worker that fails before it ever answered does not start in this page: that request and every later one are laid out on the page', async () => {
  const { made, makeWorker } = fakeWorkers({ ready: false });
  const timers = fakeTimers(), log = quiet();
  const client = makeLayoutClient({ makeWorker, timers, log });
  const p = client.layout(XML), q = client.layout(OTHER);
  made[0].fail('');
  assert.equal(made[0].error.prevented, true, 'the event is handled, not the page\'s error');
  assert.equal(made[0].terminated, true);
  assert.deepEqual(await p, layoutJob(XML));
  assert.deepEqual(await q, layoutJob(OTHER));
  assert.deepEqual(await client.layout(XML), layoutJob(XML));
  assert.equal(made.length, 1, 'no second worker');
  assert.deepEqual(log.lines, ['BPMN layout on the page, without a worker: the worker did not start']);
  assert.equal(timers.pending.size, 0);
});

test('a worker that fails after it has answered: the request it was on rejects with the reason, the next one gets a new worker', async () => {
  const { made, makeWorker } = fakeWorkers();
  const timers = fakeTimers(), log = quiet();
  const client = makeLayoutClient({ makeWorker, timers, log });
  const ok = client.layout(XML);
  made[0].answer();
  await ok;
  const lost = client.layout(OTHER), next = client.layout(XML);
  made[0].fail('Uncaught RangeError: Maximum call stack size exceeded');
  await assert.rejects(lost, { message: LAYOUT_WORKER_FAILED + ' Uncaught RangeError: Maximum call stack size exceeded' });
  assert.equal(made[0].terminated, true);
  assert.equal(made.length, 2);
  made[1].answer();
  assert.deepEqual(await next, layoutJob(XML));
  assert.deepEqual(log.lines, [], 'the page keeps its worker');
  assert.equal(timers.pending.size, 0);
});

test('aborted: a waiting request leaves the queue unsent, a running one ends with its worker, an aborted signal is refused at once', async () => {
  const { made, makeWorker } = fakeWorkers();
  const timers = fakeTimers();
  const client = makeLayoutClient({ makeWorker, timers, log: quiet() });
  const a = new AbortController(), b = new AbortController();
  const running = client.layout(XML, { signal: a.signal }), waiting = client.layout(OTHER, { signal: b.signal }), after = client.layout(XML);
  b.abort();
  await assert.rejects(waiting, e => e.name === 'AbortError' && e.message === LAYOUT_ABORTED);
  assert.deepEqual(made[0].sent.map(m => m.id), [1], 'the aborted one was never sent');
  a.abort();
  await assert.rejects(running, e => e.name === 'AbortError' && e.message === LAYOUT_ABORTED);
  assert.equal(made[0].terminated, true, 'the worker of the running request is terminated');
  assert.equal(made.length, 2, 'the request after them gets a new worker');
  assert.deepEqual(made[1].sent.map(m => m.id), [3]);
  made[1].answer();
  assert.deepEqual(await after, layoutJob(XML));
  // Aborted before it was asked: no worker is made, nothing sent.
  const c = new AbortController();
  c.abort();
  await assert.rejects(client.layout(XML, { signal: c.signal }), { name: 'AbortError' });
  assert.equal(made.length, 2);
  assert.equal(made[1].sent.length, 1);
  // An abort after the answer changes nothing.
  const d = new AbortController();
  const done = client.layout(OTHER, { signal: d.signal });
  made[1].answer();
  await done;
  d.abort();
  assert.equal(made[1].terminated, false);
  assert.equal(timers.pending.size, 0);
});

test('the time limit is the running request\'s alone: a request waiting in the queue starts its own when it is sent', async () => {
  const { made, makeWorker } = fakeWorkers();
  const timers = fakeTimers();
  const client = makeLayoutClient({ makeWorker, timers, log: quiet() });
  const first = client.layout(XML), second = client.layout(OTHER);
  await tick();
  timers.fireAll();
  await assert.rejects(first, { message: layoutTimeLimitText(LAYOUT_TIME_LIMIT) });
  assert.equal(await settledYet(second), false, 'the second is not given up with it');
  await tick();
  assert.deepEqual(timers.limits(), [LAYOUT_TIME_LIMIT], 'it runs, with a limit of its own');
  made[1].answer();
  assert.deepEqual(await second, layoutJob(OTHER));
});

test('another layout of the same protocol: without a worker the page runs the job it is given, and a promise of it is waited for', async () => {
  const log = quiet();
  const client = makeLayoutClient({ makeWorker: () => { throw new Error('the page has no Worker'); }, job: async xml => ({ xml: xml + '!' }), log });
  assert.deepEqual(await client.layout('<a/>'), { xml: '<a/>!' });
  const failing = makeLayoutClient({ makeWorker: () => { throw new Error('no'); }, job: async () => { throw new Error('kaputt'); }, log });
  await assert.rejects(failing.layout('<a/>'), { message: 'kaputt' });
});

// ---------- the fallback is the page's, not the worker's ----------
test('a worker made anew after a time limit that fails before it answers: the request fails, the page keeps its workers', async () => {
  // Workers that never say "ready": whether the page has heard from one rests on the first answer alone.
  const { made, makeWorker } = fakeWorkers({ ready: false });
  const timers = fakeTimers(), log = quiet();
  const client = makeLayoutClient({ makeWorker, timers, log });
  const first = client.layout(XML);
  made[0].answer();
  assert.deepEqual(await first, layoutJob(XML));
  // The time limit: the worker goes, the next request gets a new one.
  const slow = client.layout(OTHER), after = client.layout(XML);
  timers.fire(LAYOUT_TIME_LIMIT);
  await assert.rejects(slow, { message: layoutTimeLimitText(LAYOUT_TIME_LIMIT) });
  assert.equal(made.length, 2);
  // The new one fails before it has answered once: that is this request's failure.
  made[1].fail('Uncaught InternalError: too much recursion');
  await assert.rejects(after, { message: LAYOUT_WORKER_FAILED + ' Uncaught InternalError: too much recursion' });
  assert.equal(made[1].terminated, true);
  assert.equal(client.withoutWorker(), false, 'the page does not turn to laying out by itself');
  assert.deepEqual(log.lines, []);
  // The next request gets a worker again, and its time limit.
  const again = client.layout(OTHER);
  assert.equal(made.length, 3);
  assert.deepEqual(timers.limits(), [LAYOUT_START_LIMIT, LAYOUT_TIME_LIMIT]);
  made[2].answer();
  assert.deepEqual(await again, layoutJob(OTHER));
  assert.equal(timers.pending.size, 0);
});

test('a worker made anew after an abort that fails before it answers: the same, the request fails and the next gets a worker', async () => {
  const { made, makeWorker } = fakeWorkers({ ready: false });
  const timers = fakeTimers(), log = quiet();
  const client = makeLayoutClient({ makeWorker, timers, log });
  const first = client.layout(XML);
  made[0].answer();
  await first;
  const a = new AbortController();
  const aborted = client.layout(OTHER, { signal: a.signal });
  a.abort();
  await assert.rejects(aborted, { name: 'AbortError' });
  const after = client.layout(XML);
  made[1].fail('');
  await assert.rejects(after, { message: LAYOUT_WORKER_FAILED });
  assert.equal(client.withoutWorker(), false);
  const again = client.layout(XML);
  assert.equal(made.length, 3);
  made[2].answer();
  await again;
  assert.deepEqual(log.lines, []);
});

// ---------- an answer the page cannot read ----------
test('a messageerror is a failure of the worker: after it was heard from, the request rejects and the next gets a new worker; before, the page lays out by itself', async () => {
  const { made, makeWorker } = fakeWorkers();
  const timers = fakeTimers(), log = quiet();
  const client = makeLayoutClient({ makeWorker, timers, log });
  const p = client.layout(XML), q = client.layout(OTHER);
  assert.equal(typeof made[0].onmessageerror, 'function', 'the client listens for it');
  await tick();
  made[0].unreadable();
  await assert.rejects(p, { message: LAYOUT_WORKER_FAILED });
  assert.equal(made[0].terminated, true);
  assert.equal(made[0].onmessageerror, null, 'a dropped worker is not heard any more');
  assert.equal(made.length, 2);
  made[1].answer();
  assert.deepEqual(await q, layoutJob(OTHER));
  assert.deepEqual(log.lines, []);

  const silent = fakeWorkers({ ready: false }), log2 = quiet();
  const onPage = makeLayoutClient({ makeWorker: silent.makeWorker, timers: fakeTimers(), log: log2 });
  const r = onPage.layout(XML);
  silent.made[0].unreadable();
  assert.deepEqual(await r, layoutJob(XML));
  assert.equal(onPage.withoutWorker(), true);
  assert.deepEqual(log2.lines, ['BPMN layout on the page, without a worker: the worker did not start']);
});

// ---------- the worker's start ----------
test('the start limit is 5 s, and its reason says it in seconds', () => {
  assert.equal(LAYOUT_START_LIMIT, 5000);
  assert.equal(layoutStartText(5000), 'Das Layout im Hintergrund ist nicht innerhalb von 5 s gestartet.');
  assert.equal(layoutStartText(20), 'Das Layout im Hintergrund ist nicht innerhalb von 0,02 s gestartet.');
});

test('a worker that says it is ready: its start limit ends, and the page has heard from a worker', async () => {
  const { made, makeWorker } = fakeWorkers({ ready: false });
  const timers = fakeTimers(), log = quiet();
  const client = makeLayoutClient({ makeWorker, timers, log });
  const first = client.layout(XML);
  assert.deepEqual(timers.limits(), [LAYOUT_START_LIMIT, LAYOUT_TIME_LIMIT]);
  made[0].ready();
  assert.deepEqual(timers.limits(), [LAYOUT_TIME_LIMIT], 'only the time limit is left');
  assert.equal(await settledYet(first), false, '"ready" is no answer');
  // It fails before its first answer: it had started, so the request fails and the page keeps its workers.
  made[0].fail('Uncaught RangeError: Maximum call stack size exceeded');
  await assert.rejects(first, { message: LAYOUT_WORKER_FAILED + ' Uncaught RangeError: Maximum call stack size exceeded' });
  assert.equal(client.withoutWorker(), false);
  assert.deepEqual(log.lines, []);
  assert.equal(timers.pending.size, 0);
});

test('a worker that never says it is ready, on a page that never heard from one: after the start limit the page lays out by itself, that request included', async () => {
  const { made, makeWorker } = fakeWorkers({ ready: false });
  const timers = fakeTimers(), log = quiet();
  const client = makeLayoutClient({ makeWorker, timers, log });
  const p = client.layout(XML), q = client.layout(OTHER);
  timers.fire(LAYOUT_START_LIMIT);
  assert.equal(made[0].terminated, true);
  assert.deepEqual(await p, layoutJob(XML));
  assert.deepEqual(await q, layoutJob(OTHER));
  assert.deepEqual(await client.layout(XML), layoutJob(XML));
  assert.equal(made.length, 1, 'no second worker');
  assert.equal(client.withoutWorker(), true);
  assert.deepEqual(log.lines, ['BPMN layout on the page, without a worker: the worker did not start (no "ready" within 5000 ms)']);
  assert.equal(timers.pending.size, 0, 'neither the start limit nor the time limit is left');
});

test('a worker that never says it is ready, after one was heard from: the request fails with the reason, the next one gets a new worker', async () => {
  const { made, makeWorker } = fakeWorkers({ ready: false });
  const timers = fakeTimers(), log = quiet();
  const client = makeLayoutClient({ makeWorker, timers, log });
  const first = client.layout(XML);
  made[0].ready();
  made[0].answer();
  await first;
  // A worker made anew after a time limit, which does not start.
  const slow = client.layout(OTHER);
  timers.fire(LAYOUT_TIME_LIMIT);
  await assert.rejects(slow, { message: layoutTimeLimitText(LAYOUT_TIME_LIMIT) });
  const lost = client.layout(XML), next = client.layout(OTHER);
  assert.equal(made.length, 2);
  timers.fire(LAYOUT_START_LIMIT);
  await assert.rejects(lost, { message: layoutStartText(LAYOUT_START_LIMIT) });
  assert.equal(made[1].terminated, true);
  assert.equal(client.withoutWorker(), false);
  assert.equal(made.length, 3, 'the next request got a new worker');
  assert.deepEqual(made[2].sent, [{ id: 4, xml: OTHER }]);
  made[2].ready();
  made[2].answer();
  assert.deepEqual(await next, layoutJob(OTHER));
  assert.deepEqual(log.lines, []);
  assert.equal(timers.pending.size, 0);
});

test('a worker that says it is ready too late is not heard: its request was decided at the start limit (a limit of 20 ms and the real timers)', async () => {
  const { made, makeWorker } = fakeWorkers({ ready: false });
  const log = quiet();
  const client = makeLayoutClient({ makeWorker, startLimit: 20, log });
  const p = client.layout(XML);
  const t = performance.now();
  // The page lays out by itself once the limit is past: it never heard from a worker.
  assert.deepEqual(await p, layoutJob(XML));
  assert.ok(performance.now() - t >= 15, 'not before the limit');
  assert.equal(made[0].terminated, true);
  // Too late: nobody listens, and nothing changes.
  assert.equal(made[0].onmessage, null);
  made[0].ready();
  made[0].answer(made[0].sent[0]);
  assert.equal(client.withoutWorker(), true);
  assert.deepEqual(log.lines, ['BPMN layout on the page, without a worker: the worker did not start (no "ready" within 20 ms)']);

  // On a page that heard from a worker, a late one costs its request, and the next gets a new worker.
  const second = fakeWorkers({ ready: false }), log2 = quiet();
  const heard = makeLayoutClient({ makeWorker: second.makeWorker, startLimit: 20, timeLimit: 60, log: log2 });
  const ok = heard.layout(XML);
  second.made[0].answer();
  await ok;
  const slow = heard.layout(OTHER);
  await assert.rejects(slow, { message: layoutTimeLimitText(60) });
  const late = heard.layout(XML);
  await assert.rejects(late, { message: layoutStartText(20) });
  second.made[1].ready();
  assert.equal(heard.withoutWorker(), false);
  const next = heard.layout(OTHER);
  assert.equal(second.made.length, 3);
  second.made[2].ready();
  second.made[2].answer();
  assert.deepEqual(await next, layoutJob(OTHER));
  assert.deepEqual(log2.lines, []);
});
