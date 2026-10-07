// arielle with its orders laid open: the same ranks as review/ranks-optimiert.mjs (arielle-order-check.mjs proves
// it on the fixtures), and besides them the orders the algorithm walks, so that a canonical sorting of the model can
// take them as keys:
//   rank      { key: rank }                       as arielle()
//   ranked    [id, …]   the nodes in the order their rank was given (generation by generation, each in the order it
//                       was reached: the main way before the short exception)
//   dfs       [id, …]   the nodes in the order the depth-first search for cycles reached them (path first)
//   edgeSeq   Map(flow → n)  the flows in the order the depth-first search walked them (every flow once)
//   back      Set(flow)      the flows the search turned round
//   ahead(f, g)              arielle's order of two flows out of one node: the bigger way first, then the flow's
//                            name, the target's name, the target's id (the original direction, not the turned one)
// A flow whose two ends are one vertex (a node to itself, a host and its own event) has no place in the search; it
// gets a sequence number after all others, in the order of the model.
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function arielleOrder(model){
  const vertexOf = new Map(model.nodes.map(n => [n.id, { id: n.id, key: n.key, name: n.name || '', lane: -1, out: [], in: 0, base: 0 }]));
  for (const b of model.boundaries || []) vertexOf.set(b.id, vertexOf.get(b.host));
  model.lanes.forEach((l, i) => l.nodes.forEach(id => { const v = vertexOf.get(id); if (v.lane < 0) v.lane = i; }));
  const nodes = model.nodes.map(n => vertexOf.get(n.id));
  const edges = [], loops = [];
  for (const f of model.flows){ const src = vertexOf.get(f.from), dst = vertexOf.get(f.to); if (src !== dst) edges.push({ src, dst, name: f.name || '', f }); else loops.push(f); }
  for (const e of edges){ e.src.out.push(e); e.dst.in++; }
  for (const v of nodes){
    const seen = new Set([v]), stack = [v];
    while (stack.length) for (const e of stack.pop().out) if (!seen.has(e.dst)){ seen.add(e.dst); stack.push(e.dst); }
    v.reach = seen.size;
  }
  const ahead = (p, q) => q.dst.reach - p.dst.reach || cmp(p.name, q.name) || cmp(p.dst.name, q.dst.name) || cmp(p.dst.id, q.dst.id);
  const first = (p, q) => p.lane - q.lane || q.reach - p.reach || cmp(p.name, q.name) || cmp(p.id, q.id);
  for (const v of nodes) v.out.sort(ahead);

  const seeds = [...nodes].sort(first), state = new Map();
  const dfs = [], edgeSeq = new Map(), back = new Set();
  const visit = v => {
    state.set(v, 1); dfs.push(v.id);
    for (const e of v.out){ edgeSeq.set(e.f, edgeSeq.size); const s = state.get(e.dst); if (s === undefined) visit(e.dst); else if (s === 1){ e.back = true; back.add(e.f); } }
    state.set(v, 2);
  };
  for (const v of [...seeds.filter(v => !v.in), ...seeds.filter(v => v.in)]) if (!state.has(v)) visit(v);
  for (const f of loops) edgeSeq.set(f, edgeSeq.size);
  for (const v of nodes){ v.out = []; v.in = 0; }
  for (const e of edges){ const [src, dst] = e.back ? [e.dst, e.src] : [e.src, e.dst]; src.out.push({ dst, name: e.name }); dst.in++; }
  for (const v of nodes) v.out.sort(ahead);

  const rank = {}, nextFree = new Map(), ranked = [];
  let frontier = nodes.filter(v => !v.in).sort(first);
  while (frontier.length){
    const next = [];
    for (const v of frontier){
      const r = Math.max(v.base, nextFree.get(v.lane) ?? 0);
      nextFree.set(v.lane, r + 1);
      rank[v.key] = r; ranked.push(v.id);
      for (const { dst } of v.out){ dst.base = Math.max(dst.base, r + (dst.lane === v.lane ? 1 : 0)); if (--dst.in === 0) next.push(dst); }
    }
    frontier = next;
  }
  // The order of two flows of the model as arielle sorts the ways out of one node; flows of different sources or
  // without a vertex of their own (loops) compare equal here.
  const edgeOf = new Map(edges.map(e => [e.f, e]));
  const aheadOf = (f, g) => { const p = edgeOf.get(f), q = edgeOf.get(g); return p && q && p.src === q.src ? ahead(p, q) : 0; };
  return { rank, ranked, dfs, edgeSeq, back, ahead: aheadOf, laneOf: id => vertexOf.get(id).lane, reach: id => vertexOf.get(id).reach };
}
