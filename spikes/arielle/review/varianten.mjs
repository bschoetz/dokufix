// The variants of arielle under test, one function with options; exact = the replica of Mermaid.
//   labels:  'node'   a named flow gets a label vertex (Mermaid)
//            'none'   a name costs nothing
//            'weight' a name costs a column without a vertex (within a lane +2, across lanes +1)
//   order:   'mermaid'   Mermaid's: keys as strings, labels first, each generation sorted anew; the search for cycles
//                        from the nodes in lane order, their edges by target key
//            'xml'       the grid's (buildGrid()): the nodes in XML order, the flows in XML order
//            'canonical' from the structure: the sources by lane, then the tie-break; each vertex hands its order on
//                        to its successors (a generation in the order of discovery), successors by the tie-break
//   tie:     the tie-break of 'canonical' between the successors of one vertex and between the sources:
//            'id'     the element id
//            'name'   the flow's name, then the target's name, then its id
//            'struct' the target that reaches more nodes first, then the flow's name, then the id
//            'lane'   the target in the source's lane first, then as 'struct'
//            'full'   as 'struct', with the target's name before its id
import { cmp } from './gen.mjs';
const by = (...keys) => (p, q) => { for (const k of keys){ const d = typeof p[k] === 'number' ? p[k] - q[k] : cmp(p[k], q[k]); if (d) return d; } return 0; };

export const VARIANTS = {
  'exakt (Mermaid)': { labels: 'node', order: 'mermaid' },
  'ohne Beschriftungsspalte': { labels: 'none', order: 'mermaid' },
  'Beschriftung als Gewicht': { labels: 'weight', order: 'mermaid' },
  'XML-Reihenfolge wie buildGrid()': { labels: 'node', order: 'xml' },
  'kanonisch, Tie-Break Element-ID': { labels: 'node', order: 'canonical', tie: 'id' },
  'kanonisch, Tie-Break Name': { labels: 'node', order: 'canonical', tie: 'name' },
  'kanonisch, Tie-Break Struktur': { labels: 'node', order: 'canonical', tie: 'struct' },
  'kanonisch, Tie-Break Bahn+Struktur': { labels: 'node', order: 'canonical', tie: 'lane' },
  'kanonisch, Tie-Break Struktur+Name': { labels: 'node', order: 'canonical', tie: 'full' },
  'kanonisch Struktur+Name, ohne Beschriftungsspalte': { labels: 'none', order: 'canonical', tie: 'full' },
  'kanonisch Struktur, Beschriftung als Gewicht': { labels: 'weight', order: 'canonical', tie: 'struct' },
  'kanonisch Struktur, ohne Beschriftungsspalte': { labels: 'none', order: 'canonical', tie: 'struct' },
};

export function ranksWith(model, o){
  const vertexOf = new Map(model.nodes.map((n, i) => [n.id, { id: n.id, key: n.key, name: n.name || '', xml: i, lane: -1, out: [], in: 0, base: 0, sort: [1, n.key] }]));
  for (const b of model.boundaries || []) vertexOf.set(b.id, vertexOf.get(b.host));
  const nodes = [];
  model.lanes.forEach((l, i) => l.nodes.forEach(id => { const v = vertexOf.get(id); if (v.lane < 0){ v.lane = i; nodes.push(v); } }));
  const xmlNodes = model.nodes.map(n => vertexOf.get(n.id));
  const edges = [], labels = [], pairs = new Map();
  model.flows.forEach((f, i) => {
    const a = vertexOf.get(f.from), b = vertexOf.get(f.to);
    if (a === b) return;
    const n = pairs.get(a.key + '>' + b.key) ?? 0; pairs.set(a.key + '>' + b.key, n + 1);
    const same = a.lane === b.lane;
    const name = o.order === 'mermaid' && o.labels === 'node' ? f.name.replace(/["<>&#`\\]/g, ' ').trim() : f.name; // Mermaid saw no label where mermaidSource()'s q() left a blank
    if (!name || o.labels === 'none'){ edges.push({ src: a, dst: b, w: same ? 1 : 0, name: f.name || '', i }); return; }
    if (o.labels === 'weight'){ edges.push({ src: a, dst: b, w: same ? 2 : 1, name: f.name, i }); return; }
    const label = { id: f.id, key: null, name: f.name, xml: xmlNodes.length + i, lane: same ? a.lane : b.lane, out: [], in: 0, base: 0, sort: [0, a.key, b.key, String(n ? n + 1 : 0)] };
    labels.push(label);
    edges.push({ src: a, dst: label, w: label.lane === a.lane ? 1 : 0, name: f.name, i }, { src: label, dst: b, w: label.lane === b.lane ? 1 : 0, name: f.name, i });
  });
  const vertices = [...nodes, ...labels];
  // The order: a position per vertex for 'mermaid' and 'xml'; a comparator of edges (and of sources) for 'canonical'.
  if (o.order === 'mermaid') [...vertices].sort((p, q) => { for (let i = 0; i < p.sort.length; i++){ const d = cmp(p.sort[i], q.sort[i]); if (d) return d; } return 0; }).forEach((v, i) => { v.pos = i; });
  if (o.order === 'xml') for (const v of vertices) v.pos = v.xml;
  let edgeOrder, seedOrder;
  if (o.order === 'canonical'){
    // How many vertices each reaches, cycles included: the bigger way first.
    for (const e of edges) e.src.out.push(e);
    for (const v of vertices){ const seen = new Set([v]), stack = [v]; while (stack.length) for (const e of stack.pop().out) if (!seen.has(e.dst)){ seen.add(e.dst); stack.push(e.dst); } v.reach = seen.size; }
    for (const v of vertices) v.out = [];
    const tie = { id: (e, d) => [d.id], name: (e, d) => [e ? e.name : '', d.name, d.id], struct: (e, d) => [-d.reach, e ? e.name : '', d.id], lane: (e, d) => [e && e.src.lane === d.lane ? 0 : 1, -d.reach, e ? e.name : '', d.id], full: (e, d) => [-d.reach, e ? e.name : '', d.name, d.id] }[o.tie];
    const tuple = (p, q) => { for (let i = 0; i < p.length; i++){ const d = typeof p[i] === 'number' ? p[i] - q[i] : cmp(p[i], q[i]); if (d) return d; } return 0; };
    edgeOrder = (p, q) => tuple(tie(p, p.dst), tie(q, q.dst));
    seedOrder = (p, q) => p.lane - q.lane || tuple(tie(null, p), tie(null, q));
  } else {
    edgeOrder = o.order === 'xml' ? by('i') : (p, q) => p.dst.pos - q.dst.pos;
    seedOrder = (p, q) => p.pos - q.pos;
  }
  // Cycles by depth-first search; the seeds: nodes without a flow into them first, then the rest.
  for (const e of edges){ e.src.out.push(e); e.dst.in++; }
  for (const v of vertices) v.out.sort(edgeOrder);
  const seedList = o.order === 'mermaid' ? nodes : o.order === 'xml' ? xmlNodes : [...nodes].sort(seedOrder);
  const state = new Map();
  const visit = v => { state.set(v, 1); for (const e of v.out){ const s = state.get(e.dst); if (s === undefined) visit(e.dst); else if (s === 1) e.back = true; } state.set(v, 2); };
  for (const v of [...seedList.filter(v => !v.in), ...seedList.filter(v => v.in)]) if (!state.has(v)) visit(v);
  for (const v of vertices){ v.out = []; v.in = 0; }
  for (const e of edges){ const [src, dst] = e.back ? [e.dst, e.src] : [e.src, e.dst]; src.out.push({ ...e, src, dst }); dst.in++; }
  for (const v of vertices) v.out.sort(edgeOrder);
  // The ranks, generation by generation.
  const rank = {}, nextFree = new Map();
  let frontier = vertices.filter(v => !v.in).sort(seedOrder);
  while (frontier.length){
    const next = [];
    for (const v of frontier){
      const r = Math.max(v.base, nextFree.get(v.lane) ?? 0);
      nextFree.set(v.lane, r + 1);
      if (v.key) rank[v.key] = r;
      for (const e of v.out){ e.dst.base = Math.max(e.dst.base, r + e.w); if (--e.dst.in === 0) next.push(e.dst); }
    }
    frontier = o.order === 'canonical' ? next : next.sort(seedOrder);
  }
  return rank;
}
