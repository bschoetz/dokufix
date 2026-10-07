// The laid-out XML of BPMN without coordinates, kept as fixtures, and laid out
// again in Node: the net under src/app/bpmn-layout.js.
//
//   npm run fixtures                 lays out every fixture and names each one
//                                    whose XML differs; exit 1 then
//   npm run fixtures -- --write      writes the expected XML anew, and the known
//                                    list of breaks (tests/bpmn-rules.mjs), after
//                                    an intended change: git diff shows each change
//
// tests/fixtures/bpmn-layout/ holds per input <n>:
//   <n>.bpmn            the author's XML, without coordinates
//   <n>.laid-out.bpmn   the laid-out XML, what the page draws: the columns
//                       from LMM (src/app/lmm.js), the labels in the size the
//                       layout measures for them itself (src/app/label-size.js),
//                       the same in Node as in the page
// and index.json per input where it comes from. tests/bpmn-fixtures.test.mjs
// compares the XML byte for byte, tests/bpmn-rules.test.mjs checks the rules on
// it. Until the layout measured for itself, each input had the sizes the page
// measured in its machine's font (<n>.sizes.json) and two expected XML, with
// those sizes and with an estimate; the label sizes now follow the fixed font
// of the measurer, so there is one. Until LMM gave the columns (2026-10-07),
// each input had Mermaid's raw positions as well (<n>.raw.json), taken from
// the built page in Chromium (tests/capture-bpmn.mjs, "npm run capture"); LMM
// needs no page, so the whole layout runs here.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from 'linkedom';
import { readProcess, layoutGeometry, appendDiagram } from '../src/app/bpmn-layout.js';
import { kanonisch, lmmPositions } from '../src/app/lmm.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// DOKUFIX_FIXTURE_DIR points the command at a copy (tests/bpmn-fixtures.test.mjs
// checks --write on one).
export const FIXTURE_DIR = process.env.DOKUFIX_FIXTURE_DIR || path.join(here, 'fixtures/bpmn-layout');
// The files each input has, by their ending.
export const FIXTURE_FILES = ['.bpmn', '.laid-out.bpmn'];

export const fixtureIndex = () => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'index.json'), 'utf8'));
export const fixtureNames = () => Object.keys(fixtureIndex().fixtures);
export const fixtureFile = (name, ending) => path.join(FIXTURE_DIR, name + ending);
export const expectedFile = name => fixtureFile(name, '.laid-out.bpmn');

// The author's XML of one input.
export function readFixture(name){
  return { name, xml: fs.readFileSync(fixtureFile(name, '.bpmn'), 'utf8') };
}

// The model as the page reads it. linkedom keeps "&amp;" in an attribute as it
// stands, where a browser's parser reads "&"; it is read as a blank here, as
// Mermaid saw it when its raw positions were the fixtures' columns
// (mermaidSource() wrote "&" as a blank). The expected XML of hund, hund2,
// notiz-hund2 and ref8 depends on it: their labels with "&" are measured with
// a blank in its place.
export function readModel(xml){
  return readProcess(new DOMParser().parseFromString(xml.replace(/&amp;/g, ' '), 'text/xml'));
}

// What the page hands the grid for an input's XML (layoutBpmn() in
// src/app/bpmn.js): { model, raw, author }, the model in LMM's order, its
// columns in the form layoutGeometry() reads, and the author's model, which
// appendDiagram() gets.
export function gridInput(xml){
  const { model } = readModel(xml);
  const sorted = kanonisch(model);
  return { model: sorted.model, raw: lmmPositions(sorted.model, sorted.rank), author: model };
}

// The laid-out XML of an input, as the page lays it out: readProcess →
// kanonisch → layoutGeometry on the model in LMM's order with its columns →
// appendDiagram on the author's XML and model, the labels measured by the
// layout's own measurer, or by measure.
export function layOut(fx, measure){
  const { model, raw, author } = gridInput(fx.xml);
  return appendDiagram(fx.xml, author, layoutGeometry(model, raw, measure)).xml;
}

// The first line two laid-out XML differ in, with the element it describes
// (each shape and each flow of the diagram part is one line): null when equal.
export function firstDifference(expected, actual){
  if (expected === actual) return null;
  const a = expected.split('\n'), b = actual.split('\n');
  for (let i = 0; ; i++){
    if (a[i] === b[i]) continue;
    const element = (/bpmnElement="([^"]+)"/.exec(b[i] || '') || /bpmnElement="([^"]+)"/.exec(a[i] || '') || [])[1] || '(no element)';
    return { line: i + 1, element, expected: a[i] ?? '(end of file)', actual: b[i] ?? '(end of file)' };
  }
}

export const differenceText = (name, d) =>
  name + ': ' + d.element + ' differs, first at line ' + d.line + '\n  expected: ' + d.expected.trim() + '\n  actual:   ' + d.actual.trim();

// The command: compare, or with --write write the expected XML and the known list.
async function main(argv){
  const write = argv.includes('--write');
  const unknown = argv.filter(a => a !== '--write');
  if (unknown.length) throw new Error('unknown argument: ' + unknown.join(' '));
  const names = fixtureNames();
  const differing = [];
  for (const name of names){
    const xml = layOut(readFixture(name)), file = expectedFile(name);
    const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const d = firstDifference(old, xml);
    if (!d) continue;
    differing.push(name);
    if (write) fs.writeFileSync(file, xml);
    else console.log(differenceText(name, d));
  }
  let known = null;
  if (write && fs.existsSync(path.join(here, 'bpmn-rules.mjs'))){
    const { writeKnownBreaks } = await import('./bpmn-rules.mjs');
    known = writeKnownBreaks();
  }
  console.log(names.length + ' fixtures: ' + (differing.length ? differing.length + ' laid-out XML ' + (write ? 'written: ' + differing.join(', ') : 'differ') : 'no difference') +
    (known ? '; known breaks ' + (known.changed ? 'written' : 'unchanged') + ' (' + known.count + ')' : ''));
  return write || !differing.length ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, err => { console.error(err.message); process.exitCode = 1; });
}
