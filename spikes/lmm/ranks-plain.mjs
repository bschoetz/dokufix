// Replica of Mermaid 12.0.0's swimlane layering (ignoreCrossLaneEdges: true, LR), compared with the fixtures.
import fs from 'node:fs';
const R = '/home/user/dokufix/';
const { fixtureNames, readFixture, readModel, layOut, expectedFile } = await import(R + 'tests/bpmn-fixtures.mjs');
const { layoutGeometry, appendDiagram, labelSize } = await import(R + 'src/app/bpmn-layout.js');
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function mermaidRanks(model, { labelNodes = true } = {}){
  const byId = new Map(model.nodes.map(n => [n.id, n]));
  for (const b of model.boundaries || []) byId.set(b.id, byId.get(b.host));
  const parent = new Map(), groups = [], vertices = [];
  for (const l of model.lanes){
    groups.push(l.key);
    for (const id of l.nodes){ const k = byId.get(id).key; if (!parent.has(k)){ vertices.push(k); parent.set(k, l.key); } }
    if (l.hold){ vertices.push(l.hold); parent.set(l.hold, l.key); }
  }
  const edges = [], labelVertices = [], layoutOnly = [];
  for (const f of model.flows){
    const a = byId.get(f.from).key, b = byId.get(f.to).key;
    if (byId.get(f.from) === byId.get(f.to)) continue;
    const before = edges.filter(e => e.src === a && e.dst === b).length;
    const id = 'L_' + a + '_' + b + '_' + (before ? before + 1 : 0);
    const e = { id, src: a, dst: b };
    edges.push(e);
    if (labelNodes && f.name){
      const ln = 'edge-label-' + a + '-' + b + '-' + id;
      labelVertices.push(ln);
      parent.set(ln, parent.get(a) !== parent.get(b) ? parent.get(b) : parent.get(a));
      e.labelled = true;
      layoutOnly.push({ id: id + '-to-label', src: a, dst: ln }, { id: id + '-from-label', src: ln, dst: b });
    }
  }
  const nodes = [...groups].reverse().concat(vertices, labelVertices);
  const isGroup = new Set(groups);
  let E = edges.filter(e => !e.labelled).concat(layoutOnly);
  // phase 1: DFS cycle removal
  const adj = new Map(nodes.map(v => [v, []]));
  for (const e of E) adj.get(e.src).push(e);
  for (const arr of adj.values()) arr.sort((a, b) => a.dst === b.dst ? cmp(a.id, b.id) : cmp(a.dst, b.dst));
  const indeg0 = new Map(nodes.map(v => [v, 0])); for (const e of E) indeg0.set(e.dst, indeg0.get(e.dst) + 1);
  const color = Object.fromEntries(nodes.map(v => [v, 0])), reversed = new Set();
  const dfs = u => { color[u] = 1; for (const e of adj.get(u)){ if (color[e.dst] === 0) dfs(e.dst); else if (color[e.dst] === 1) reversed.add(e); } color[u] = 2; };
  for (const v of [...nodes.filter(v => indeg0.get(v) === 0), ...nodes.filter(v => indeg0.get(v) !== 0)]) if (color[v] === 0) dfs(v);
  E = E.map(e => reversed.has(e) ? { id: e.id, src: e.dst, dst: e.src } : e);
  // phase 2: generation order, lane-aware compact ranks
  const indeg = new Map(nodes.map(v => [v, 0])); for (const e of E) indeg.set(e.dst, indeg.get(e.dst) + 1);
  const succ = new Map(nodes.map(v => [v, []])); for (const e of E) succ.get(e.src).push(e.dst); for (const s of succ.values()) s.sort(cmp);
  let frontier = [...indeg].filter(([, d]) => d === 0).map(([v]) => v).sort(cmp); const order = [];
  while (frontier.length){ const next = []; for (const u of frontier){ order.push(u); for (const v of succ.get(u)){ indeg.set(v, indeg.get(v) - 1); if (indeg.get(v) === 0) next.push(v); } } frontier = next.sort(cmp); }
  if (order.length !== nodes.length) throw new Error('not acyclic');
  const lane = v => parent.get(v) ?? v, rank = {}, nextFree = new Map();
  for (const v of order){
    if (isGroup.has(v)) continue;
    let base = 0;
    for (const e of E) if (e.dst === v) base = Math.max(base, (rank[e.src] ?? 0) + (lane(e.src) === lane(v) ? 1 : 0));
    const L = Math.max(base, nextFree.get(lane(v)) ?? 0);
    rank[v] = L; nextFree.set(lane(v), L + 1);
  }
  return rank;
}

if (process.argv[1].endsWith("ranks.mjs")) {
const names = fixtureNames();
const sign = x => Math.abs(x) < 1 ? 0 : Math.sign(x);
let orderSame = 0, xmlE = 0, xmlM = 0; const bad = [];
let noLabel = { orderSame: 0, xmlE: 0 };
for (const name of names){
  const fx = readFixture(name), model = readModel(fx.xml).model;
  for (const variant of ['mermaid', 'nolabel']){
    const rank = mermaidRanks(model, { labelNodes: variant === 'mermaid' });
    const keys = model.nodes.map(n => n.key);
    let ok = true;
    for (const a of keys) for (const b of keys) if (sign(rank[a] - rank[b]) !== sign(fx.raw.nodes[a].cx - fx.raw.nodes[b].cx)) ok = false;
    const raw = { nodes: Object.fromEntries(keys.map(k => [k, { cx: rank[k] * 100 }])) };
    const e = layOut({ ...fx, raw }, 'estimated') === fs.readFileSync(expectedFile(name, 'estimated'), 'utf8');
    if (variant === 'mermaid'){
      const m = layOut({ ...fx, raw }, 'measured') === fs.readFileSync(expectedFile(name, 'measured'), 'utf8');
      orderSame += ok; xmlE += e; xmlM += m; if (!ok || !e || !m) bad.push(name + (ok ? '' : ' (Ordnung)') + (e ? '' : ' (estimated)') + (m ? '' : ' (measured)'));
    } else { noLabel.orderSame += ok; noLabel.xmlE += e; }
  }
}
console.log('Nachbau: Spaltenordnung gleich', orderSame + '/' + names.length, 'XML estimated gleich', xmlE, 'measured gleich', xmlM, 'abweichend:', bad);
console.log('ohne Beschriftungsknoten: Ordnung gleich', noLabel.orderSame, 'XML gleich', noLabel.xmlE);
}
