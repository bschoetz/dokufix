// The third entry of the build: the layout of BPMN without coordinates, as the
// script of a Web Worker, so that a large process does not stop the page while
// it is laid out (docs/konzept-worker.md).
//
// build.mjs bundles this file with what it imports into one IIFE, minified,
// and writes it into the data block #dokufix-layout-js of the page, where it
// does not run. The page makes a classic worker of that block's text through a
// Blob URL (src/app/layout-client.js); a module worker from a Blob URL does not
// start in a page opened from file://. The BPMN Assistant
// (tools/bpmn-assistant/bauen.mjs) carries the same block.
//
// The protocol: once loaded, { ready: true } out, unasked, so that the page
// knows the worker started (a worker that never says so is taken for one that
// does not start, src/app/layout-client.js); then a message { id, xml,
// options } in, { id, ok, result | error } back (answerLayout() of
// src/app/bpmn-layout-job.js). The worker keeps no state between messages.
import { answerLayout } from './app/bpmn-layout-job.js';

self.onmessage = e => self.postMessage(answerLayout(e.data));
self.postMessage({ ready: true });
