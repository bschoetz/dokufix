import { layoutJob } from './bpmn-layout-job.js';

// --- The layout's client ---------------------------------------------------
// The page's side of the layout's worker (src/layout-worker.js): the layout
// of BPMN without coordinates runs there, so that a large process does not
// stop the page while it is laid out (Ben's hund3: 17 to 19 s in Chromium,
// docs/konzept-worker.md).
//
//   const client = makeLayoutClient();
//   const { xml, open, leftOut } = await client.layout(source, { signal });
//
// layout() gives what layoutJob() of src/app/bpmn-layout-job.js gives, and
// throws what it throws, as an Error with the same message; so renderBpmn()
// is the same whether a worker laid the diagram out or the page did.
//
//   - One worker for the page, not one per diagram: it is made with the first
//     diagram to lay out and stays for the next renders, so its start (about
//     40 ms, the parse of its 98 KB included) is paid once.
//   - The requests run one after the other, in the order they came: the pass
//     draws one diagram at a time anyway, and bpmn-js draws on the page.
//   - The time limit: a request that takes longer than timeLimit is given up.
//     The worker is terminated, the promise rejects with
//     layoutTimeLimitText(), and the next request gets a new worker.
//   - The signal: an abort (a new render, src/app/render.js) takes a waiting
//     request out of the queue, or terminates the worker of a running one; the
//     promise rejects with LAYOUT_ABORTED, name AbortError.
//   - A worker that fails (its error event): before it has answered once, it
//     does not start in this page; the page lays out by itself from then on,
//     that request included. After that, the request it was on rejects with
//     the reason, and the next one gets a new worker.
//   - No worker: where makeWorker() throws (no Worker API, as in Node; no
//     block; a page that forbids a worker from a Blob URL), every request is
//     laid out on the page, synchronously, by layoutJob(): decided once, one
//     line on the console. That has no time limit, since synchronous code
//     cannot be stopped, and the page stops while it runs, as before.
//
// Pure logic: the worker comes from makeWorker(), the timer from timers; the
// tests hand in a fake of each (tests/layout-client.test.mjs). Only
// pageWorker(), the default, needs a page. Nothing is done on loading.

// How long one layout may take in the worker (Ben, 2026-10-07: 120 s; hund3
// takes 17 to 19 s in Chromium, and Firefox was half as slow again in spike
// 2.26).
export const LAYOUT_TIME_LIMIT = 120000;
// The block of the page that holds the worker's script (src/index.html).
export const LAYOUT_SCRIPT_ID = 'dokufix-layout-js';

// The reasons, in the words of the warning of a diagram (src/app/bpmn.js).
// ms: the limit, said in seconds, "120" or "0,05".
export const layoutTimeLimitText = ms => 'Das Layout hat die Zeitgrenze von ' + String(ms / 1000).replace('.', ',') + ' s überschritten.';
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
// terminate(), onmessage, onerror) or throws; job, what the page runs in
// place of a worker, layoutJob() unless another layout speaks the same
// protocol (the BPMN Assistant's bpmn.io, tools/bpmn-assistant/bauen.mjs); it
// may give a promise; timeLimit in ms; timers, with setTimeout() and
// clearTimeout(); log, with info(), for the one line of the page without a
// worker.
export function makeLayoutClient({ makeWorker = pageWorker, job: onPageJob = layoutJob, timeLimit = LAYOUT_TIME_LIMIT, timers = globalThis, log = console } = {}){
  let worker = null;     // the worker, made with the first request that needs it
  let answered = false;  // whether it has answered once: it started
  let onPage = false;    // no worker: every request is laid out here
  let ids = 0;
  const queue = [];
  let running = null;    // the request the worker is on

  function start(){
    let made;
    try { made = makeWorker(); }
    catch (e){
      onPage = true;
      log.info('BPMN layout on the page, without a worker: ' + (e && e.message ? e.message : e));
      return null;
    }
    answered = false;
    made.onmessage = e => receive(made, e.data);
    made.onerror = e => failed(made, e);
    return made;
  }
  // The worker goes; a late message of it is not heard.
  function drop(){
    const w = worker;
    worker = null;
    if (w){ w.onmessage = w.onerror = null; w.terminate(); }
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
        let result, error = null;
        try { result = onPageJob(job.xml); } catch (e){ error = e; }
        settle(job, error, result);
        continue;
      }
      running = job;
      job.timer = timers.setTimeout(() => { drop(); settle(job, new Error(layoutTimeLimitText(timeLimit))); next(); }, timeLimit);
      worker.postMessage({ id: job.id, xml: job.xml });
    }
  }
  function receive(from, data){
    // An answer of a worker that was dropped, or to a request given up, is
    // no answer to the request now running.
    if (from !== worker || !running || !data || data.id !== running.id) return;
    answered = true;
    settle(running, data.ok ? null : new Error(String(data.error)), data.ok ? data.result : undefined);
    next();
  }
  function failed(from, e){
    if (from !== worker) return;
    // The event is handled here: it is not the page's error.
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const job = running, started = answered, reason = e && e.message ? String(e.message) : '';
    drop();
    running = null;
    if (!started){
      // It never answered: a worker does not start in this page.
      onPage = true;
      log.info('BPMN layout on the page, without a worker: the worker did not start' + (reason ? ' (' + reason + ')' : ''));
      if (job){ timers.clearTimeout(job.timer); job.timer = undefined; queue.unshift(job); }
    } else if (job){
      settle(job, new Error(LAYOUT_WORKER_FAILED + (reason ? ' ' + reason : '')));
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
  // signal: an AbortSignal, or none.
  function layout(xml, { signal } = {}){
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(abortError());
      const job = { id: ++ids, xml: String(xml), resolve, reject, signal };
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
