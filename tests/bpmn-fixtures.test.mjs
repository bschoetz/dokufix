// The laid-out XML of every fixture of BPMN without coordinates, in Node:
// each input of tests/fixtures/bpmn-layout/ laid out with the label sizes the
// page measured and with the estimate gives its expected XML byte for byte.
// A difference names the input, the element and the first line that differs.
// After an intended change: npm run fixtures -- --write (tests/bpmn-fixtures.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MERMAID_LAYOUT_VERSION } from '../src/app/bpmn-layout.js';
import { FIXTURE_DIR, FIXTURE_FILES, MODES, fixtureIndex, fixtureNames, readFixture, layOut, expectedFile, firstDifference, differenceText } from './bpmn-fixtures.mjs';

const names = fixtureNames();

test('the fixtures: 36 inputs, each with its five files, the index and the known breaks, nothing else in the folder, raw positions of the pinned Mermaid', () => {
  assert.equal(names.length, 36);
  const files = fs.readdirSync(FIXTURE_DIR).sort();
  const wanted = ['index.json', 'known-breaks.json', ...names.flatMap(n => FIXTURE_FILES.map(e => n + e))].sort();
  assert.deepEqual(files, wanted);
  assert.equal(fixtureIndex().mermaid, MERMAID_LAYOUT_VERSION, 'a new Mermaid: capture the raw positions anew (npm run capture)');
});

for (const name of names){
  const fx = readFixture(name);
  for (const mode of MODES){
    test(name + ', ' + mode + ': the laid-out XML is the expected one', () => {
      const d = firstDifference(fs.readFileSync(expectedFile(name, mode), 'utf8'), layOut(fx, mode));
      assert.ok(!d, d && differenceText(name, mode, d));
    });
  }
}

test('a difference names the element and the first line that differs', () => {
  const xml = fs.readFileSync(expectedFile('r01', 'measured'), 'utf8');
  const changed = xml.replace('<di:waypoint x="', '<di:waypoint x="1');
  const d = firstDifference(xml, changed);
  const line = xml.split('\n').findIndex(l => l.includes('<di:waypoint x="')) + 1;
  assert.equal(d.line, line);
  assert.equal(d.element, /bpmnElement="([^"]+)"/.exec(xml.split('\n')[line - 1])[1]);
  assert.match(differenceText('r01', 'measured', d), /^r01, measured: F1_s_a differs, first at line \d+\n {2}expected: .*\n {2}actual: {3}/);
  assert.equal(firstDifference(xml, xml), null);
  assert.equal(firstDifference(xml, xml + 'x').element, '(no element)');
});

test('an input without labels has no sizes, and both modes give the same XML', () => {
  const fx = readFixture('r11');
  assert.deepEqual(fx.sizes, {});
  assert.equal(layOut(fx, 'measured'), layOut(fx, 'estimated'));
});
