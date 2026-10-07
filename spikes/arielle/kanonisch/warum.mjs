// Why a fixture's layout changes under a canonical order: which list makes the difference (nodes, flows, rest, in
// every combination), which rule is involved (the two layouts agree once the rule is off), whether buildGrid() finds
// other back edges, and what moves.
//   node warum.mjs <variant> <fixture>…
import { fixtures, layoutWith, diagramKey, rules as R } from '../review/measure.mjs';
import { arielle } from '../review/ranks-optimiert.mjs';
import { canonicalWith, parse } from './varianten.mjs';
const { layoutGeometry, DEFAULT_RULES } = await import('/home/user/dokufix/src/app/bpmn-layout.js');

import { kanonisch } from './kanonisch.mjs';
const [variant, ...names] = process.argv.slice(2);
const o = parse(variant);
// The variant "kanonisch" is the module itself; its parts for the list-wise check are ranked/dfs/host.
const sortWith = (model, opts) => opts.nodes === 'kanonisch' ? kanonisch(model).model : canonicalWith(model, opts);
const parts = o.nodes === 'kanonisch' ? parse('ranked/dfs/host') : o;
const rawOf = (m, rank) => ({ nodes: Object.fromEntries(m.nodes.map(n => [n.key, { cx: rank[n.key] }])) });
const geoKey = di => JSON.stringify(Object.fromEntries(['nodes', 'flows', 'labels', 'flowLabels'].map(k => [k, Object.fromEntries(Object.keys(di[k] || {}).sort().map(id => [id, di[k][id]]))])));
// buildGrid()'s back edges (a flow from a boundary event is its host's).
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
for (const name of names){
  const fx = fixtures.readFixture(name), model = fixtures.readModel(fx.xml).model, measure = fixtures.measureOf(fx.sizes, 'measured');
  const canon = sortWith(model, o);
  const A = layoutWith(fx.xml, model, arielle(model), fx.sizes), C = layoutWith(fx.xml, canon, arielle(canon), fx.sizes);
  console.log('## ' + name + ' (' + variant + ')');
  if (diagramKey(A.di) === diagramKey(C.di)){ console.log('gleich'); continue; }
  console.log('Verstöße ' + A.breaks.length + ' → ' + C.breaks.length + (C.breaks.filter(b => !A.breaks.includes(b)).length ? '; neu: ' + C.breaks.filter(b => !A.breaks.includes(b)).join('; ') : '') + (A.breaks.filter(b => !C.breaks.includes(b)).length ? '; weg: ' + A.breaks.filter(b => !C.breaks.includes(b)).join('; ') : ''));
  console.log('Kreuzungen ' + A.crossings + ' → ' + C.crossings + ', Knicke ' + A.bends + ' → ' + C.bends);
  // Which lists: every subset of { nodes, flows, rest } sorted, the others as in the XML.
  const partial = sub => canonicalWith(model, { nodes: sub.includes('nodes') ? parts.nodes : 'xml', flows: sub.includes('flows') ? parts.flows : 'xml', rest: sub.includes('rest') ? parts.rest : 'xml' });
  const subsets = [['nodes'], ['flows'], ['rest'], ['nodes', 'flows'], ['nodes', 'rest'], ['flows', 'rest']];
  const differing = subsets.filter(sub => { const m = partial(sub); return diagramKey(layoutWith(fx.xml, m, arielle(m), fx.sizes).di) !== diagramKey(A.di); });
  console.log('Sortiert, Layout anders: ' + (differing.map(s => s.join('+')).join(', ') || 'nur alle drei zusammen'));
  if (gridBack(model) !== gridBack(canon)) console.log('buildGrid(): andere Rückwärtsflüsse: ' + gridBack(model) + ' | ' + gridBack(canon));
  // Which rules: each rule off on its own; and all off (the router alone).
  const both = opts => geoKey(layoutGeometry(model, rawOf(model, arielle(model)), measure, opts)) === geoKey(layoutGeometry(canon, rawOf(canon, arielle(canon)), measure, opts));
  const involved = Object.keys(DEFAULT_RULES).filter(k => both({ ...DEFAULT_RULES, [k]: false }));
  const allOff = Object.fromEntries(Object.keys(DEFAULT_RULES).map(k => [k, false]));
  console.log('Regel aus → gleich: ' + (involved.join(', ') || 'keine einzelne') + '; alle Regeln aus (nur R7 und Router): ' + (both(allOff) ? 'gleich' : 'anders'));
  // What moves: shapes with another position, flows with another way.
  const moved = Object.keys(A.di.shapes).filter(id => JSON.stringify(A.di.shapes[id]) !== JSON.stringify(C.di.shapes[id]));
  const rerouted = Object.keys(A.di.flows).filter(id => JSON.stringify(A.di.flows[id]) !== JSON.stringify(C.di.flows[id]));
  console.log('Kästen anders (' + moved.length + '): ' + moved.map(id => id + ' ' + A.di.shapes[id].slice(0, 2) + '→' + C.di.shapes[id].slice(0, 2)).join('; '));
  console.log('Flüsse anders (' + rerouted.length + '): ' + rerouted.join(', '));
  console.log('Knoten vorher: ' + model.nodes.map(n => n.id).join(' ') + '\nKnoten kanonisch: ' + canon.nodes.map(n => n.id).join(' '));
  console.log('Flüsse vorher: ' + model.flows.map(f => f.id).join(' ') + '\nFlüsse kanonisch: ' + canon.flows.map(f => f.id).join(' ') + '\n');
}
