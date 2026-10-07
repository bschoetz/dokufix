// Whether the XML survives the DOM round trip of permute-xml.mjs: without reordering, the laid-out diagram part must
// be the expected one; with reordering, the model must hold the same elements.
import fs from 'node:fs';
import { permuteXml } from './permute-xml.mjs';
import { arielleExakt as arielle } from './ranks-exakt.mjs';
const R = '/home/user/dokufix/';
const { fixtureNames, readFixture, readModel, expectedFile, measureOf } = await import(R + 'tests/bpmn-fixtures.mjs');
const { layoutGeometry, appendDiagram } = await import(R + 'src/app/bpmn-layout.js');
const { readDiagram } = await import(R + 'tests/bpmn-rules.mjs');
let same = 0, elements = 0; const bad = [];
for (const name of fixtureNames()){
  const fx = readFixture(name);
  const xml = permuteXml(fx.xml, () => 1 - 1e-9); // keeps every order: floor(rnd * (k + 1)) = k
  const model = readModel(xml).model;
  const raw = { nodes: Object.fromEntries(Object.entries(arielle(model)).map(([k, r]) => [k, { cx: r }])) };
  const laid = appendDiagram(xml, model, layoutGeometry(model, raw, measureOf(fx.sizes, 'measured'))).xml;
  const a = JSON.stringify(readDiagram(laid)), b = JSON.stringify(readDiagram(fs.readFileSync(expectedFile(name, 'measured'), 'utf8')));
  if (a === b) same++; else bad.push(name);
  const m2 = readModel(permuteXml(fx.xml, (s => () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)(5))).model, m1 = readModel(fx.xml).model;
  const ids = m => [m.nodes.map(n => n.id).sort().join(), m.flows.map(f => f.id).sort().join(), m.lanes.map(l => l.id + ':' + [...l.nodes].sort().join('+')).join(), (m.boundaries || []).map(b => b.id).sort().join()].join('|');
  if (ids(m1) === ids(m2)) elements++;
}
console.log('Round trip ohne Umordnung: Diagrammteil gleich ' + same + '/57' + (bad.length ? ' (anders: ' + bad.join(', ') + ')' : '') + '; mit Umordnung dieselben Elemente: ' + elements + '/57');
