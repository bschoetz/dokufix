// The laid-out XML of every fixture of BPMN without coordinates, in Node:
// each input of tests/fixtures/bpmn-layout/ laid out with the label sizes the
// page measured and with the estimate gives its expected XML byte for byte.
// A difference names the input, the element and the first line that differs.
// After an intended change: npm run fixtures -- --write (tests/bpmn-fixtures.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MERMAID_LAYOUT_VERSION } from '../src/app/bpmn-layout.js';
import { FIXTURE_DIR, FIXTURE_FILES, MODES, fixtureIndex, fixtureNames, readFixture, layOut, expectedFile, firstDifference, differenceText } from './bpmn-fixtures.mjs';

const names = fixtureNames();
const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_COMMAND = path.join(here, 'bpmn-fixtures.mjs'), CAPTURE_COMMAND = path.join(here, 'capture-bpmn.mjs');

test('the fixtures: 49 inputs, each with its five files, the index and the known breaks, nothing else in the folder, raw positions of the pinned Mermaid', () => {
  assert.equal(names.length, 49);
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

// The two commands from outside, as Ben runs them: on a copy of the fixtures,
// so that the folder itself is never written by a test.
const run = (script, args, env) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

test('npm run fixtures names a changed expected XML, and --write writes it back and leaves the known list as it is', () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'dokufix-fixtures-'));
  try {
    fs.cpSync(FIXTURE_DIR, copy, { recursive: true });
    const file = path.join(copy, 'zwei.measured.bpmn'), good = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, good.replace(/<di:waypoint x="(\d+)"/, (m, x) => '<di:waypoint x="' + (Number(x) + 1) + '"'));
    const env = { DOKUFIX_FIXTURE_DIR: copy };
    const check = run(FIXTURES_COMMAND, [], env);
    assert.equal(check.status, 1);
    assert.match(check.stdout, /zwei, measured/);
    assert.match(check.stdout, /1 laid-out XML differ/);
    const write = run(FIXTURES_COMMAND, ['--write'], env);
    assert.equal(write.status, 0, write.stderr);
    assert.match(write.stdout, /written: zwei\.measured; known breaks unchanged/);
    assert.equal(fs.readFileSync(file, 'utf8'), good);
    assert.equal(fs.readFileSync(path.join(copy, 'known-breaks.json'), 'utf8'), fs.readFileSync(path.join(FIXTURE_DIR, 'known-breaks.json'), 'utf8'));
    assert.equal(run(FIXTURES_COMMAND, [], env).status, 0);
  } finally { fs.rmSync(copy, { recursive: true, force: true }); }
});

test('npm run capture without Chromium stops with exit 1 and says where it looked', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dokufix-capture-'));
  try {
    const r = run(CAPTURE_COMMAND, ['--out', out, path.join(FIXTURE_DIR, 'zwei.bpmn')], { CHROMIUM: path.join(out, 'no-chromium') });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Chromium not found at .*no-chromium/);
    assert.deepEqual(fs.readdirSync(out), []);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('npm run capture skips an input with a diagram part, naming it, so the fixtures\' glob captures the author XML alone', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dokufix-capture-'));
  try {
    const laidOut = ['zwei.measured.bpmn', 'zwei.estimated.bpmn'].map(f => path.join(FIXTURE_DIR, f));
    const only = run(CAPTURE_COMMAND, ['--out', out, ...laidOut], { CHROMIUM: path.join(out, 'no-chromium') });
    assert.equal(only.status, 0, only.stderr);
    assert.equal(only.stdout.match(/^skipped, it has a diagram part: .*zwei\.(measured|estimated)\.bpmn$/gm).length, 2);
    const mixed = run(CAPTURE_COMMAND, ['--out', out, path.join(FIXTURE_DIR, 'zwei.bpmn'), ...laidOut], { CHROMIUM: path.join(out, 'no-chromium') });
    assert.equal(mixed.status, 1, 'the author XML is left: it needs Chromium');
    assert.doesNotMatch(mixed.stdout, /zwei\.bpmn$/m);
    assert.deepEqual(fs.readdirSync(out), []);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
