import { makeLayoutClient } from '../app/layout-client.js';

// --- The layouts of the BPMN tools: A2 and bpmn.io -------------------------
// Both run in a Web Worker, through the client of dokufix
// (src/app/layout-client.js), with its time limit of 120 s; without a worker
// the page lays out by itself.
//
//   A2, dokufix's layout: in the layout's worker of the page, the block
//   #dokufix-layout-js (src/layout-worker.js, tools/seiten.mjs bundles it).
//   The BPMN Assistant and the layout workbench.
//
//   bpmn.io, bpmn-auto-layout: pure logic as A2 (bpmn-moddle, no DOM), and as
//   slow on large processes (hund3: 17 s in Chromium); in a worker of its
//   own, made from the text of its script, the block #bpmn-io-js, which sets
//   window.BAL (window is self there), with the same protocol, "ready" after
//   loading included. The BPMN Assistant.
//
// The clients make their worker with the first request, not on loading; a
// page whose worker is refused lays out by itself (no throw). Nothing done on
// loading.

// A2's client: one worker for the page.
export const makeA2Client = () => makeLayoutClient();

// What bpmn.io answers, as the client wants it: { xml, warnings }, each warning a line.
export function balAnswer(r){
  return { xml: r.xml, warnings: (r.warnings || []).map(w => [w.code, w.message].filter(Boolean).join(': ') || String(w)) };
}
// The same function as the worker's text. Written out, not String(balAnswer):
// the page's script is minified, and its name with it.
const BAL_ANSWER = 'function balAnswer(r){ return { xml: r.xml, warnings: (r.warnings || []).map(w => [w.code, w.message].filter(Boolean).join(": ") || String(w)) }; }';
const BAL_HANDLER = 'self.onmessage = async e => { const m = e.data || {}; try { self.postMessage({ id: m.id, ok: true, result: balAnswer(await self.BAL.layoutProcess(String(m.xml))) }); }'
  + ' catch (err){ self.postMessage({ id: m.id, ok: false, error: err && err.message ? String(err.message) : String(err) }); } };'
  // Loaded: said as the app's worker says it (src/layout-worker.js); a worker that does not say so counts for the
  // client as not started.
  + ' self.postMessage({ ready: true });';
// The text of the worker of bpmn.io: its script, then the answer and the handler.
export const balWorkerSource = script => ['var window = self;\n', script, '\n', BAL_ANSWER, '\n', BAL_HANDLER];

// bpmn.io's client. log: where the client's lines go.
export function makeBalClient({ log = { info: line => console.info('bpmn.io: ' + line) } } = {}){
  let url = null;
  const makeWorker = () => {
    if (typeof Worker !== 'function') throw new Error('the page has no Worker');
    if (!url) url = URL.createObjectURL(new Blob(balWorkerSource(document.getElementById('bpmn-io-js').textContent), { type: 'text/javascript' }));
    return new Worker(url);
  };
  return makeLayoutClient({ makeWorker, job: async xml => balAnswer(await window.BAL.layoutProcess(xml)), log });
}
