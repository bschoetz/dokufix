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
//   <n>.raw.json        Mermaid's raw positions, as mermaidPositions() in
//                       src/app/bpmn.js reads them from the built page
//   <n>.laid-out.bpmn   the laid-out XML, what the page draws: the labels in
//                       the size the layout measures for them itself
//                       (src/app/label-size.js), the same in Node as in the page
// and index.json the Mermaid version of the raw positions and per input where
// it comes from. tests/capture-bpmn.mjs ("npm run capture") makes the raw
// positions from the built page; tests/bpmn-fixtures.test.mjs compares the
// XML byte for byte, tests/bpmn-rules.test.mjs checks the rules on it. Until
// the layout measured for itself, each input had the sizes the page measured
// in its machine's font (<n>.sizes.json) and two expected XML, with those
// sizes and with an estimate; the label sizes now follow the fixed font of the
// measurer, so there is one.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from 'linkedom';
import { readProcess, layoutGeometry, appendDiagram } from '../src/app/bpmn-layout.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// DOKUFIX_FIXTURE_DIR points the command at a copy (tests/bpmn-fixtures.test.mjs
// checks --write on one).
export const FIXTURE_DIR = process.env.DOKUFIX_FIXTURE_DIR || path.join(here, 'fixtures/bpmn-layout');
// The files each input has, by their ending.
export const FIXTURE_FILES = ['.bpmn', '.raw.json', '.laid-out.bpmn'];

export const fixtureIndex = () => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'index.json'), 'utf8'));
export const fixtureNames = () => Object.keys(fixtureIndex().fixtures);
export const fixtureFile = (name, ending) => path.join(FIXTURE_DIR, name + ending);
export const expectedFile = name => fixtureFile(name, '.laid-out.bpmn');

// The author's XML and the raw positions of one input.
export function readFixture(name){
  const text = ending => fs.readFileSync(fixtureFile(name, ending), 'utf8');
  return { name, xml: text('.bpmn'), raw: JSON.parse(text('.raw.json')) };
}

// The model as the page reads it. A browser's parser reads "&amp;" as "&",
// which mermaidSource() writes as a blank; linkedom keeps the entity, so it
// is read as a blank first. The stored raw positions depend on it.
export function readModel(xml){
  return readProcess(new DOMParser().parseFromString(xml.replace(/&amp;/g, ' '), 'text/xml'));
}

// The laid-out XML of an input, as the page lays it out: readProcess →
// layoutGeometry → appendDiagram on the author's XML, the labels measured by
// the layout's own measurer.
export function layOut(fx){
  const { model } = readModel(fx.xml);
  return appendDiagram(fx.xml, model, layoutGeometry(model, fx.raw)).xml;
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
