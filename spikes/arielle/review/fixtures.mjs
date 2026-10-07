// arielle against the 57 fixtures: the column order of Mermaid's raw positions, and the laid-out XML of both modes.
import fs from 'node:fs';
import { arielleExakt as arielle } from './ranks-exakt.mjs';
import { sameOrder } from './gen.mjs';
const R = '/home/user/dokufix/';
const { fixtureNames, readFixture, readModel, layOut, expectedFile } = await import(R + 'tests/bpmn-fixtures.mjs');
const names = fixtureNames();
let order = 0, xmlE = 0, xmlM = 0; const bad = [];
for (const name of names){
  const fx = readFixture(name), model = readModel(fx.xml).model;
  const rank = arielle(model);
  const ok = sameOrder(model, rank, Object.fromEntries(model.nodes.map(n => [n.key, fx.raw.nodes[n.key].cx])));
  const raw = { nodes: Object.fromEntries(model.nodes.map(n => [n.key, { cx: rank[n.key] * 100 }])) };
  const e = layOut({ ...fx, raw }, 'estimated') === fs.readFileSync(expectedFile(name, 'estimated'), 'utf8');
  const m = layOut({ ...fx, raw }, 'measured') === fs.readFileSync(expectedFile(name, 'measured'), 'utf8');
  order += ok; xmlE += e; xmlM += m;
  if (!ok || !e || !m) bad.push(name + (ok ? '' : ' (Ordnung)') + (e ? '' : ' (estimated)') + (m ? '' : ' (measured)'));
}
console.log('arielle, ' + names.length + ' Fixtures: Spaltenordnung gleich ' + order + ', XML estimated gleich ' + xmlE + ', measured gleich ' + xmlM + (bad.length ? ', abweichend: ' + bad.join(', ') : ''));
