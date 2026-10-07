import { readProcess, layoutGeometry, appendDiagram, leftOutLine } from './bpmn-layout.js';
import { kanonisch, lmmPositions } from './lmm.js';
import { parseXml, XmlError } from './xml-parser.js';

// --- The layout of BPMN without coordinates, as one job ---------------------
// What the page asks of the layout for one diagram, from the author's XML to
// the XML bpmn-js draws: the layout's own parser (src/app/xml-parser.js),
// readProcess() → kanonisch() → layoutGeometry() → appendDiagram()
// (src/app/bpmn-layout.js, src/app/lmm.js). It runs in the layout's worker
// (src/layout-worker.js, through answerLayout()) and, where the page has no
// worker, on the page (src/app/layout-client.js); the same code either way, so
// the same XML gives the same picture.
//
// Pure logic, and more: no page at all, neither document nor DOMParser nor a
// library, since a worker has none of them. It does nothing when it is loaded.

// The job for one diagram's XML:
//   { xml }                    XML the layout's parser rejects, or that is no
//                              BPMN definitions (readProcess() gives null), as
//                              it is: bpmn-js then says what is wrong with it.
//                              The parser is the layout's own, not the page's
//                              DOMParser, so the same XML gives the same
//                              layout in every browser and in the tests
//   { xml, open, leftOut }     laid out: the author's XML with a diagram part
//                              added, the id of that diagram, which bpmn-js
//                              opens, and one line for each element the layout
//                              left out (leftOutLine()), for the console; a
//                              worker has no console the reader's tools show
// Throws the layout's refusal (LAYOUT_NOTHING, layoutStrayText()). LMM gives
// the columns and the layout measures the labels as bpmn-js will draw them
// (src/app/label-size.js); no library is asked. kanonisch() hands the grid the
// model in LMM's order, so that the picture does not depend on the order of
// the XML; the author's model writes the diagram part, so that it keeps the
// order of the XML.
export function layoutJob(xml){
  let parsed;
  try { parsed = parseXml(xml); }
  catch (e){ if (e instanceof XmlError) return { xml }; throw e; }
  const read = readProcess(parsed);
  if (!read) return { xml };
  const sorted = kanonisch(read.model);
  const laidOut = appendDiagram(xml, read.model, layoutGeometry(sorted.model, lmmPositions(sorted.model, sorted.rank)));
  return { xml: laidOut.xml, open: laidOut.diagram, leftOut: read.leftOut.map(leftOutLine) };
}

// The answer to one message of the worker's protocol, { id, xml }:
// { id, ok: true, result } with the result of layoutJob(), or
// { id, ok: false, error } with the message of whatever it threw. Never
// throws, so that a worker always answers. Without the Worker API, so that
// Node runs it as it is (tests/bpmn-layout-job.test.mjs).
export function answerLayout(message){
  const id = message ? message.id : undefined;
  try {
    return { id, ok: true, result: layoutJob(String(message.xml)) };
  } catch (e){
    return { id, ok: false, error: e && e.message ? String(e.message) : String(e) };
  }
}
