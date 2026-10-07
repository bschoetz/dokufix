// Where the grid's own volatility comes from, with the canonical columns (which do not change): for each reordering
// whose layout changes, whether buildGrid()'s back edges (a depth-first search in the order of the XML) changed too.
//   node grid-share.mjs [K]
import { arielle } from './ranks-optimiert.mjs';
import { permuteXml, makeRandom } from './permute-xml.mjs';
import { fixtures, layoutWith, diagramKey } from './measure.mjs';
const K = Number(process.argv[2] || 10);
// buildGrid()'s back edges, by flow id (a flow from a boundary event is its host's, gridModel()).
function gridBack(model){
  const hostOf = new Map((model.boundaries || []).map(b => [b.id, b.host]));
  const flows = model.flows.map(f => ({ ...f, from: hostOf.get(f.from) ?? f.from }));
  const out = new Map(model.nodes.map(n => [n.id, []])); for (const f of flows) out.get(f.from).push(f);
  const state = new Map(), back = new Set();
  const visit = id => { state.set(id, 1); for (const f of out.get(id)){ const s = state.get(f.to); if (s === 1) back.add(f.id); else if (!s) visit(f.to); } state.set(id, 2); };
  const hasIn = new Set(flows.map(f => f.to));
  for (const n of model.nodes) if (!hasIn.has(n.id) && !state.has(n.id)) visit(n.id);
  for (const n of model.nodes) if (!state.has(n.id)) visit(n.id);
  return [...back].sort().join();
}
const names = fixtures.fixtureNames();
let changed = 0, withBack = 0, total = 0; const byFixture = [];
for (const name of names){
  const fx = fixtures.readFixture(name), model0 = fixtures.readModel(fx.xml).model;
  const key0 = diagramKey(layoutWith(fx.xml, model0, arielle(model0), fx.sizes).di), back0 = gridBack(model0);
  const rnd = makeRandom(97 + names.indexOf(name));
  let c = 0, b = 0;
  for (let k = 0; k < K; k++){
    const xml = permuteXml(fx.xml, rnd), model = fixtures.readModel(xml).model;
    total++;
    if (diagramKey(layoutWith(xml, model, arielle(model), fx.sizes).di) === key0) continue;
    c++; changed++;
    if (gridBack(model) !== back0){ b++; withBack++; }
  }
  if (c) byFixture.push(name + ' ' + c + '/' + K + (b ? ' (Rückwärtsflüsse anders: ' + b + ')' : ''));
  process.stderr.write('.');
}
console.log('\nkanonische Spalten, ' + total + ' Umordnungen: Layout geändert ' + changed + ', davon mit anderen Rückwärtsflüssen von buildGrid() ' + withBack);
console.log(byFixture.join('; '));
