// The layout of BPMN without coordinates as one job, run in Node: layoutJob()
// and answerLayout() of src/app/bpmn-layout-job.js, what the layout's worker
// (src/layout-worker.js) and the page without one run.
//
//   npm test          (node --test tests/*.test.mjs)
//
// The job is the chain the page ran in layoutBpmn() of src/app/bpmn.js until
// the worker came: the fixtures check that it gives their XML byte for byte.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { layoutJob, answerLayout } from '../src/app/bpmn-layout-job.js';
import { LAYOUT_NOTHING, layoutStrayText } from '../src/app/bpmn-layout.js';
import { fixtureNames, readFixture, expectedFile } from './bpmn-fixtures.mjs';

const WITHOUT_DI = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="P"><bpmn:startEvent id="S" name="Los"/><bpmn:task id="A" name="Tun"/>' +
  '<bpmn:sequenceFlow id="F" sourceRef="S" targetRef="A"/></bpmn:process></bpmn:definitions>';
const EMPTY = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="P1"/></bpmn:definitions>';
const STRAY = WITHOUT_DI.replace('<bpmn:process id="P">', '<bpmn:process id="P"><bpmn:laneSet id="LS"><bpmn:lane id="L1"><bpmn:flowNodeRef>S</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>');

test('the job lays out XML without coordinates: the author\'s XML with the diagram part, the diagram bpmn-js opens, nothing left out', () => {
  const r = layoutJob(WITHOUT_DI);
  assert.deepEqual(Object.keys(r), ['xml', 'open', 'leftOut']);
  const close = WITHOUT_DI.lastIndexOf('</bpmn:definitions>');
  assert.equal(r.xml.slice(0, close), WITHOUT_DI.slice(0, close));
  assert.deepEqual((r.xml.match(/bpmnElement="[^"]+"/g) || []).map(m => m.slice(13, -1)), ['P', 'S', 'A', 'F']);
  assert.equal(r.open, 'dokufix_diagram');
  assert.deepEqual(r.leftOut, []);
});

test('every fixture: the job gives its laid-out XML byte for byte, as the page laid it out before the worker', () => {
  const names = fixtureNames();
  assert.equal(names.length, 57);
  for (const name of names){
    const r = layoutJob(readFixture(name).xml);
    assert.equal(r.xml, fs.readFileSync(expectedFile(name), 'utf8'), name);
  }
});

test('what the layout leaves out comes back as a line each, for the console of the page', () => {
  const xml = WITHOUT_DI.replace('</bpmn:process>', '<bpmn:dataStoreReference id="B"/><bpmn:sequenceFlow id="G" sourceRef="B" targetRef="A"/></bpmn:process>');
  assert.deepEqual(layoutJob(xml).leftOut, ['dataStoreReference B: not laid out', 'sequenceFlow G: touches B, which is not laid out']);
});

test('XML the layout\'s parser rejects, and XML that is no BPMN definitions, come back as they are, without a diagram to open', () => {
  for (const xml of ['<bpmn:definitions>kein BPMN', '<process id="P"><task id="A"/></process>', '']){
    assert.deepEqual(layoutJob(xml), { xml });
  }
});

test('the layout\'s refusals are thrown with their reason', () => {
  assert.throws(() => layoutJob(EMPTY), { message: LAYOUT_NOTHING });
  assert.throws(() => layoutJob(STRAY), { message: layoutStrayText(['A']) });
});

test('the answer to a message: the result with its id, or the reason with its id; it never throws', () => {
  assert.deepEqual(answerLayout({ id: 7, xml: WITHOUT_DI }), { id: 7, ok: true, result: layoutJob(WITHOUT_DI) });
  assert.deepEqual(answerLayout({ id: 8, xml: '<x' }), { id: 8, ok: true, result: { xml: '<x' } });
  assert.deepEqual(answerLayout({ id: 9, xml: EMPTY }), { id: 9, ok: false, error: LAYOUT_NOTHING });
  assert.deepEqual(answerLayout({ id: 10, xml: STRAY }), { id: 10, ok: false, error: layoutStrayText(['A']) });
  // A message that is no job is answered as well, with what went wrong.
  const odd = answerLayout(null);
  assert.equal(odd.ok, false);
  assert.equal(odd.id, undefined);
  assert.equal(typeof odd.error, 'string');
});

test('the answer is plain data: the structured clone of a message keeps all of it', () => {
  const a = answerLayout({ id: 1, xml: WITHOUT_DI });
  assert.deepEqual(structuredClone(a), a);
  const b = answerLayout({ id: 2, xml: EMPTY });
  assert.deepEqual(structuredClone(b), b);
});
