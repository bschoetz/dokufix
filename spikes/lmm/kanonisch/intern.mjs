// Task 3: the order inside the grid instead of a sorted model. bpmn-layout-intern.js (a copy of src/app/bpmn-layout.js)
// lets gridModel() sort the lists from raw.nodes[key].seq and raw.flows[id]; the model handed in keeps the author's
// order, so appendDiagram() writes the diagram part in that order. Compared per fixture: the diagram part per element
// id against the model sorted before layoutGeometry() (varianten.mjs), and whether the written XML keeps the author's
// order of the shapes.
//   node intern.mjs <variant>
import { fixtures, diagramKey, rules } from '../review/measure.mjs';
import { arielle } from '../review/ranks-optimiert.mjs';
import { canonicalWith, parse } from './varianten.mjs';
const { layoutGeometry, appendDiagram } = await import('/home/user/dokufix/src/app/bpmn-layout.js');
const intern = await import('./bpmn-layout-intern.js');
const o = parse(process.argv[2] || 'ranked/dfs/host');
let same = 0, orderKept = 0, n = 0;
for (const name of fixtures.fixtureNames()){
  const fx = fixtures.readFixture(name), model = fixtures.readModel(fx.xml).model, measure = fixtures.measureOf(fx.sizes, 'measured');
  const canon = canonicalWith(model, o), rank = arielle(model);
  const before = appendDiagram(fx.xml, canon, layoutGeometry(canon, { nodes: Object.fromEntries(canon.nodes.map(n => [n.key, { cx: rank[n.key] }])) }, measure)).xml;
  const seq = new Map(canon.nodes.map((x, i) => [x.id, i])), fseq = new Map(canon.flows.map((f, i) => [f.id, i]));
  const raw = { nodes: Object.fromEntries(model.nodes.map(x => [x.key, { cx: rank[x.key], seq: seq.get(x.id) }])), flows: Object.fromEntries(model.flows.map(f => [f.id, fseq.get(f.id)])) };
  const inside = appendDiagram(fx.xml, model, intern.layoutGeometry(model, raw, measure)).xml;
  n++;
  if (diagramKey(rules.readDiagram(before)) === diagramKey(rules.readDiagram(inside))) same++; else console.log('anders:', name);
  const shapes = xml => [...xml.matchAll(/<bpmndi:BPMNShape [^>]*bpmnElement="([^"]*)"/g)].map(m => m[1]).join(' ');
  const authors = [...model.pools.map(p => p.id).filter(Boolean), ...model.lanes.filter(l => !l.synthetic).map(l => l.id), ...model.nodes.map(x => x.id), ...(model.boundaries || []).map(b => b.id), ...(model.notes || []).map(x => x.id)].join(' ');
  if (shapes(inside) === authors) orderKept++;
}
console.log('Diagrammteil gleich (Modell vorher sortiert vs. im Raster sortiert): ' + same + '/' + n + '; Reihenfolge der Kästen im XML wie der Autor: ' + orderKept + '/' + n);
