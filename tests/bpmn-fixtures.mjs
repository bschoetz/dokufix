// The laid-out XML of BPMN without coordinates, kept as fixtures, and laid out
// again in Node: the net under src/app/bpmn-layout.js.
//
//   npm run fixtures                 lays out every fixture in both modes and
//                                    names each one whose XML differs; exit 1 then
//   npm run fixtures -- --write      writes the expected XML anew, and the known
//                                    list of breaks (tests/bpmn-rules.mjs), after
//                                    an intended change: git diff shows each change
//
// tests/fixtures/bpmn-layout/ holds per input <n>:
//   <n>.bpmn            the author's XML, without coordinates
//   <n>.raw.json        Mermaid's raw positions, as mermaidPositions() in
//                       src/app/bpmn.js reads them from the built page
//   <n>.sizes.json      the label sizes the page measured, by text ({} where
//                       nothing is measured)
//   <n>.measured.bpmn   the laid-out XML with those sizes, what the page draws
//   <n>.estimated.bpmn  the laid-out XML with the estimate labelSize(), what
//                       a run without a page gives
// and index.json the Mermaid version of the raw positions and per input where
// it comes from. tests/capture-bpmn.mjs ("npm run capture") makes raw and
// sizes from the built page; tests/bpmn-fixtures.test.mjs compares both XML
// byte for byte, tests/bpmn-rules.test.mjs checks the rules on the measured.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from 'linkedom';
import { readProcess, layoutGeometry, appendDiagram, labelSize } from '../src/app/bpmn-layout.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = path.join(here, 'fixtures/bpmn-layout');
export const MODES = ['measured', 'estimated'];
// The files each input has, by their ending.
export const FIXTURE_FILES = ['.bpmn', '.raw.json', '.sizes.json', '.measured.bpmn', '.estimated.bpmn'];

export const fixtureIndex = () => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'index.json'), 'utf8'));
export const fixtureNames = () => Object.keys(fixtureIndex().fixtures);
export const fixtureFile = (name, ending) => path.join(FIXTURE_DIR, name + ending);
export const expectedFile = (name, mode) => fixtureFile(name, '.' + mode + '.bpmn');

// The author's XML, the raw positions and the measured sizes of one input.
export function readFixture(name){
  const text = ending => fs.readFileSync(fixtureFile(name, ending), 'utf8');
  return { name, xml: text('.bpmn'), raw: JSON.parse(text('.raw.json')), sizes: JSON.parse(text('.sizes.json')) };
}

// The model as the page reads it. A browser's parser reads "&amp;" as "&",
// which mermaidSource() writes as a blank; linkedom keeps the entity, so it
// is read as a blank first. The stored raw positions depend on it.
export function readModel(xml){
  return readProcess(new DOMParser().parseFromString(xml.replace(/&amp;/g, ' '), 'text/xml'));
}

// The measure of a mode: the sizes the page measured, a text it did not
// measure estimated as the page does; or the estimate alone.
export const measureOf = (sizes, mode) => mode === 'measured' ? text => sizes[text] || labelSize(text) : labelSize;

// The laid-out XML of an input in a mode, as the page lays it out: readProcess
// → layoutGeometry → appendDiagram on the author's XML.
export function layOut(fx, mode){
  const { model } = readModel(fx.xml);
  return appendDiagram(fx.xml, model, layoutGeometry(model, fx.raw, measureOf(fx.sizes, mode))).xml;
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

export const differenceText = (name, mode, d) =>
  name + ', ' + mode + ': ' + d.element + ' differs, first at line ' + d.line + '\n  expected: ' + d.expected.trim() + '\n  actual:   ' + d.actual.trim();

// The command: compare, or with --write write the expected XML and the known list.
async function main(argv){
  const write = argv.includes('--write');
  const unknown = argv.filter(a => a !== '--write');
  if (unknown.length) throw new Error('unknown argument: ' + unknown.join(' '));
  const names = fixtureNames();
  const differing = [];
  for (const name of names){
    const fx = readFixture(name);
    for (const mode of MODES){
      const xml = layOut(fx, mode), file = expectedFile(name, mode);
      const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      const d = firstDifference(old, xml);
      if (!d) continue;
      differing.push(name + '.' + mode);
      if (write) fs.writeFileSync(file, xml);
      else console.log(differenceText(name, mode, d));
    }
  }
  let known = null;
  if (write && fs.existsSync(path.join(here, 'bpmn-rules.mjs'))){
    const { writeKnownBreaks } = await import('./bpmn-rules.mjs');
    known = writeKnownBreaks();
  }
  console.log(names.length + ' fixtures, ' + MODES.join(' and ') + ': ' + (differing.length ? differing.length + ' laid-out XML ' + (write ? 'written: ' + differing.join(', ') : 'differ') : 'no difference') +
    (known ? '; known breaks ' + (known.changed ? 'written' : 'unchanged') + ' (' + known.count + ')' : ''));
  return write || !differing.length ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, err => { console.error(err.message); process.exitCode = 1; });
}
