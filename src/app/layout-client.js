import { layoutJob } from './bpmn-layout-job.js';

// --- The layout's client ---------------------------------------------------
// The page's side of the layout's worker (src/layout-worker.js): the layout
// of BPMN without coordinates runs there, so that a large process does not
// stop the page while it is laid out (Ben's hund3: 17 to 19 s in Chromium,
// docs/konzept-worker.md).
//
//   const client = makeLayoutClient();
//   const { xml, open, leftOut } = await client.layout(source, { signal, options });
//
// layout() gives what layoutJob() of src/app/bpmn-layout-job.js gives, and
// throws what it throws, as an Error with the same message; so renderBpmn()
// is the same whether a worker laid the diagram out or the page did.
//
//   - One worker for the page, not one per diagram: it is made with the first
//     diagram to lay out and stays for the next renders, so its start (about
//     40 ms, the parse of its 98 KB included) is paid once.
//   - The worker's start: once loaded, a worker says { ready: true } (see
//     src/layout-worker.js). One that says nothing within startLimit has not
//     started, and is taken for one that failed (below), with the reason
//     layoutStartText(). Without it, a worker that never starts and never
//     fails would hold its request for the whole time limit.
//   - In the worker the requests run one after the other, in the order they
//     came: the pass draws one diagram at a time anyway, and bpmn-js draws on
//     the page.
//   - The time limit: a request that takes longer than timeLimit is given up.
//     The worker is terminated, the promise rejects with
//     layoutTimeLimitText(), and the next request gets a new worker.
//   - The signal: an abort (a new render, src/app/render.js) takes a waiting
//     request out of the queue, or terminates the worker of a running one; the
//     promise rejects with LAYOUT_ABORTED, name AbortError.
//   - A worker that fails (its error or messageerror event, or no "ready" in
//     time) is judged by the page, not by the worker: as long as no worker of
//     this client has ever been heard from (an answer, or "ready"), workers do
//     not start in this page, and the page lays out by itself from then on,
//     that request included. Once one has been heard from, a failure is the
//     failure of the request it was on, which rejects with the reason, and
//     the next one gets a new worker; so a worker made anew after a time limit
//     or an abort that fails does not turn the page to the way without a time
//     limit for good.
//   - No worker: where makeWorker() throws (no Worker API, as in Node; no
//     block; a page that forbids a worker from a Blob URL), every request is
//     laid out on the page by job: decided once, one line on the console.
//     That has no time limit, since synchronous code cannot be stopped, and
//     the page stops while it runs, as before. A request is run when its turn
//     comes and settles with what the job gives; layoutJob() is synchronous,
//     so its requests run one after the other. A job that gives a promise
//     (the assistant's bpmn.io) is not waited for before the next request
//     starts, so those run side by side, and an abort does not reach one that
//     has started: its signal is let go once the job is called.
//
// Pure logic: the worker comes from makeWorker(), the timers from timers; the
// tests hand in a fake of each (tests/layout-client.test.mjs). Only
// pageWorker(), the default, needs a page. Nothing is done on loading.

// How long one layout may take in the worker (Ben, 2026-10-07: 120 s; hund3
// takes 17 to 19 s in Chromium, and Firefox was half as slow again in spike
// 2.26).
export const LAYOUT_TIME_LIMIT = 120000;
// The block of the page that holds the worker's script (src/index.html).
export const LAYOUT_SCRIPT_ID = 'dokufix-layout-js';

// How long a worker may take to say that it is ready, in ms. Its start took
// 31 to 45 ms in Chromium (the parse of its 98 KB included); 5 s leaves a
// slow machine a hundred times that, and a page whose worker never starts
// lays out by itself after 5 s, not after the 120 s of the time limit.
export const LAYOUT_START_LIMIT = 5000;

// The reasons, in the words of the warning of a diagram (src/app/bpmn.js).
// ms: the limit, said in seconds, "120" or "0,05".
const inSeconds = ms => String(ms / 1000).replace('.', ',');
export const layoutTimeLimitText = ms => 'Das Layout hat die Zeitgrenze von ' + inSeconds(ms) + ' s überschritten.';
export const layoutStartText = ms => 'Das Layout im Hintergrund ist nicht innerhalb von ' + inSeconds(ms) + ' s gestartet.';
export const LAYOUT_ABORTED = 'Das Layout wurde abgebrochen.';
export const LAYOUT_WORKER_FAILED = 'Das Layout ist im Hintergrund fehlgeschlagen.';

// The worker of the page: a classic worker of the block's text through a Blob
// URL. A module worker from a Blob URL does not start where the page's origin
// is opaque, under file:// and about:blank; a classic one does. The URL is
// made once and kept: a worker made anew after a time limit loads it again.
// Throws where the page has no worker to give, with the reason.
let blobUrl = null;
export function pageWorker(){
  if (typeof Worker !== 'function') throw new Error('the page has no Worker');
  const block = document.getElementById(LAYOUT_SCRIPT_ID);
  if (!block || !block.textContent.trim()) throw new Error('the page has no block #' + LAYOUT_SCRIPT_ID);
  if (!blobUrl) blobUrl = URL.createObjectURL(new Blob([block.textContent], { type: 'text/javascript' }));
  return new Worker(blobUrl);
}

function abortError(){
  const e = new Error(LAYOUT_ABORTED);
  e.name = 'AbortError';
  return e;
}

// options: makeWorker, a function that gives a worker (postMessage(),
// terminate(), onmessage, onerror, onmessageerror) or throws; job, what the
// page runs in place of a worker, layoutJob() unless another layout speaks the
// same protocol (the BPMN Assistant's bpmn.io, tools/bpmn-assistant/bauen.mjs);
// it may give a promise; timeLimit and startLimit in ms; timers, with
// setTimeout() and clearTimeout(); log, with info(), for the one line of the
// page without a worker.
export function makeLayoutClient({ makeWorker = pageWorker, job: onPageJob = layoutJob, timeLimit = LAYOUT_TIME_LIMIT, startLimit = LAYOUT_START_LIMIT, timers = globalThis, log = console } = {}){
  let worker = null;       // the worker, made with the first request that needs it
  let startTimer;          // runs from the worker's making until it is heard from
  // Whether any worker of this client was ever heard from, by "ready" or an
  // answer: then workers start in this page, and one that fails is a failure
  // of its request. Kept for the page, not reset with each new worker.
  let everHeard = false;
  let onPage = false;      // no worker: every request is laid out here
  let ids = 0;
  const queue = [];
  let running = null;      // the request the worker is on

  function start(){
    let made;
    try { made = makeWorker(); }
    catch (e){
      onPage = true;
      log.info('BPMN layout on the page, without a worker: ' + (e && e.message ? e.message : e));
      return null;
    }
    made.onmessage = e => receive(made, e.data);
    made.onerror = e => failed(made, e);
    // An answer the page cannot read (its structured clone failed) never
    // comes: the request it was for fails, as with an error.
    made.onmessageerror = e => failed(made, e);
    startTimer = timers.setTimeout(() => lost(made, layoutStartText(startLimit), 'no "ready" within ' + startLimit + ' ms'), startLimit);
    return made;
  }
  function stopStartTimer(){
    if (startTimer !== undefined) timers.clearTimeout(startTimer);
    startTimer = undefined;
  }
  // The worker goes; a late message of it is not heard.
  function drop(){
    const w = worker;
    worker = null;
    stopStartTimer();
    if (w){ w.onmessage = w.onerror = w.onmessageerror = null; w.terminate(); }
  }
  // A request leaves: its timer and its listener go with it.
  function settle(job, error, result){
    if (job.timer !== undefined) timers.clearTimeout(job.timer);
    if (job.signal) job.signal.removeEventListener('abort', job.onAbort);
    if (running === job) running = null;
    if (error) job.reject(error); else job.resolve(result);
  }
  function next(){
    while (!running && queue.length){
      const job = queue.shift();
      if (!onPage && !worker) worker = start();
      if (onPage){
        // On the page a request is settled with what the job gives, in this
        // turn of the loop: a synchronous job (layoutJob()) is done before the
        // next request starts; a promise of one is not waited for, so the
        // next starts beside it, and settle() has let go of its signal.
        let result, error = null;
        try { result = onPageJob(job.xml, job.options); } catch (e){ error = e; }
        settle(job, error, result);
        continue;
      }
      running = job;
      job.timer = timers.setTimeout(() => { drop(); settle(job, new Error(layoutTimeLimitText(timeLimit))); next(); }, timeLimit);
      worker.postMessage({ id: job.id, xml: job.xml, options: job.options });
    }
  }
  function receive(from, data){
    if (from !== worker) return;
    // Whatever it says, it has started.
    everHeard = true;
    stopStartTimer();
    // "ready", an answer to a request given up, or one to another id, is no
    // answer to the request now running.
    if (!running || !data || data.ready || data.id !== running.id) return;
    settle(running, data.ok ? null : new Error(String(data.error)), data.ok ? data.result : undefined);
    next();
  }
  function failed(from, e){
    if (from !== worker) return;
    // The event is handled here: it is not the page's error.
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const reason = e && e.message ? String(e.message) : '';
    lost(from, LAYOUT_WORKER_FAILED + (reason ? ' ' + reason : ''), reason);
  }
  // The worker failed, or did not start in time. message: the reason the
  // request it was on rejects with; detail: what the console line adds.
  function lost(from, message, detail){
    if (from !== worker) return;
    const job = running;
    drop();
    running = null;
    if (!everHeard){
      // No worker was ever heard from on this page: workers do not start here.
      onPage = true;
      log.info('BPMN layout on the page, without a worker: the worker did not start' + (detail ? ' (' + detail + ')' : ''));
      if (job){ timers.clearTimeout(job.timer); job.timer = undefined; queue.unshift(job); }
    } else if (job){
      settle(job, new Error(message));
    }
    next();
  }
  function abort(job){
    const waiting = queue.indexOf(job);
    if (waiting >= 0) queue.splice(waiting, 1);
    else if (running === job) drop();
    else return;
    settle(job, abortError());
    next();
  }

  // The layout of one diagram's XML, in the worker where there is one.
  // signal: an AbortSignal, or none; options: what layoutJob() takes
  // (mergeMarker), handed to the worker or the job as they are.
  function layout(xml, { signal, options = {} } = {}){
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(abortError());
      const job = { id: ++ids, xml: String(xml), options, resolve, reject, signal };
      if (signal){
        job.onAbort = () => abort(job);
        signal.addEventListener('abort', job.onAbort, { once: true });
      }
      queue.push(job);
      next();
    });
  }
  // Whether the page lays out by itself: no worker, or one that did not start.
  const withoutWorker = () => onPage;
  return { layout, withoutWorker };
}
