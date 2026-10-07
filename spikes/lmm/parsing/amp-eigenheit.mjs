// Macht der Prototyp die &amp;-Eigenheit von readModel() (tests/bpmn-fixtures.mjs)
// überflüssig? readModel() ersetzt "&amp;" durch ein Leerzeichen, bevor
// linkedom liest, weil linkedom "&amp;" in Attributen wörtlich lässt.
//
// Drei Lesarten je Fixture, Modell als JSON verglichen:
//   A  heute: linkedom nach readModel() (mit Ersetzung)
//   B  linkedom ohne Ersetzung
//   C  Prototyp ohne Ersetzung
//   D  Chromium (aus ergebnisse/ergebnisse.json, ohne Ersetzung)
// Dann wird jedes Fixture mit Lesart C in beiden Messarten angeordnet
// (layOut() aus tests/bpmn-fixtures.mjs, nur mit anderem Modell) und das XML
// mit den gespeicherten .measured.bpmn / .estimated.bpmn verglichen.
//
//   node amp-eigenheit.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '/home/user/dokufix/node_modules/linkedom/esm/index.js';
import { readProcess, layoutGeometry, appendDiagram } from '/home/user/dokufix/src/app/bpmn-layout.js';
import { fixtureNames, readFixture, readModel, measureOf, expectedFile, MODES, firstDifference } from '/home/user/dokufix/tests/bpmn-fixtures.mjs';
import { parseXml } from './leser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const chromium = JSON.parse(fs.readFileSync(path.join(here, 'ergebnisse', 'ergebnisse.json'), 'utf8')).umgebungen.chromium.results;
const json = r => JSON.stringify({ model: r.model, leftOut: r.leftOut });

const lines = [];
let withAmp = 0, cEqualsD = 0, aEqualsD = 0, xmlSame = 0, xmlDiffer = [];
for (const name of fixtureNames()){
  const fx = readFixture(name);
  const has = /&amp;/.test(fx.xml);
  if (has) withAmp++;
  const A = readModel(fx.xml);
  const B = readProcess(new DOMParser().parseFromString(fx.xml, 'application/xml'));
  const C = readProcess(parseXml(fx.xml));
  const D = chromium['fixture-' + name];
  const cd = json(C) === json(D), ad = json(A) === json(D), bd = json(B) === json(D);
  if (cd) cEqualsD++;
  if (ad) aEqualsD++;
  // Anordnen mit Lesart C.
  const diffs = [];
  for (const mode of MODES){
    const xml = appendDiagram(fx.xml, C.model, layoutGeometry(C.model, fx.raw, measureOf(fx.sizes, mode))).xml;
    const d = firstDifference(fs.readFileSync(expectedFile(name, mode), 'utf8'), xml);
    if (d) diffs.push(mode + ': ' + d.element + ' (Zeile ' + d.line + ')');
  }
  if (diffs.length) xmlDiffer.push(name + ' [' + diffs.join('; ') + ']'); else xmlSame++;
  if (has || !cd || !ad || !bd || diffs.length) lines.push('| ' + name + ' | ' + (has ? 'ja' : 'nein') + ' | ' + (ad ? '=' : 'abweichend') + ' | ' + (bd ? '=' : 'abweichend') + ' | ' + (cd ? '=' : 'abweichend') + ' | ' + (diffs.length ? diffs.join('; ') : '=') + ' |');
}
const md = '# Die &amp;-Eigenheit von readModel()\n\nFixtures mit `&amp;` im XML: ' + withAmp + ' von ' + fixtureNames().length + '.\n\n' +
  'Modell je Lesart gegen Chromium (D): heute (A, linkedom nach Ersetzung) gleich in ' + aEqualsD + ', Prototyp ohne Ersetzung (C) gleich in ' + cEqualsD + ' von ' + fixtureNames().length + ' Fixtures.\n\n' +
  'Angeordnetes XML mit Lesart C gegen die gespeicherten Erwartungen (.measured.bpmn, .estimated.bpmn): gleich in ' + xmlSame + ', abweichend in ' + xmlDiffer.length + (xmlDiffer.length ? ': ' + xmlDiffer.join(', ') : '') + '.\n\n' +
  '| Fixture | &amp; im XML | A heute = D | B linkedom roh = D | C Prototyp = D | XML mit C gegen Erwartung |\n|---|---|---|---|---|---|\n' + lines.join('\n') + '\n';
fs.writeFileSync(path.join(here, 'ergebnisse', 'amp-eigenheit.md'), md);
console.log(md);
