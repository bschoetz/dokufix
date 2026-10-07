// arielle: the column of every flow node of a model from readProcess(), as a
// rank per node key (n1…). Pure logic, no DOM; layoutGeometry() reads only
// the order of the ranks (buildGrid()), so the scale is free.
//
// The columns follow the structure of the process, not the order of the XML:
// a reordering of the flow nodes, the flowNodeRef or the sequence flows gives
// the same columns. The rules, in words:
//   - A lane is the unit in which two nodes never share a column.
//   - A flow within a lane puts its target at least one column right of its
//     source; a flow into another lane allows the same column.
//   - A flow that closes a cycle, found by a depth-first search, counts the
//     other way round.
//   - The nodes are ranked generation by generation: all whose predecessors
//     are ranked, then the next, each in the order it was reached. A node
//     takes the first free column of its lane that is not left of what its
//     predecessors demand.
//   - Where the structure leaves a choice (the ways out of one node, the
//     nodes nothing flows into) the way that reaches more nodes goes first,
//     the main way before a short exception; then the flow's name, then the
//     node's name, then its id, which is unique. The nodes nothing flows into
//     go by lane first. Names and ids are the author's, so a renaming can
//     change the order among equals; nothing else can.
// A flow from a boundary event leaves its host; a flow whose two ends are one
// node (the host and its own event too) sets nothing. A flow's name sets no
// column: the label finds its room on the routed flow (flowLabel()).
//
// The layering is the one of Mermaid 12.0.0's swimlane layout (MIT, its
// phase1.cycles.ts and phase2.laneAwareCompact.ts), which laid out BPMN
// before; only the order among equals is the process's own.

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function arielle(model){
  // The vertices: a node's lane and its flows out; a boundary event counts as its host, a node stands in the first
  // lane that names it.
  const vertexOf = new Map(model.nodes.map(n => [n.id, { id: n.id, key: n.key, name: n.name || '', lane: -1, out: [], in: 0, base: 0 }]));
  for (const b of model.boundaries || []) vertexOf.set(b.id, vertexOf.get(b.host));
  model.lanes.forEach((l, i) => l.nodes.forEach(id => { const v = vertexOf.get(id); if (v.lane < 0) v.lane = i; }));
  const nodes = model.nodes.map(n => vertexOf.get(n.id));
  const edges = [];
  for (const f of model.flows){ const src = vertexOf.get(f.from), dst = vertexOf.get(f.to); if (src !== dst) edges.push({ src, dst, name: f.name || '' }); }
  for (const e of edges){ e.src.out.push(e); e.dst.in++; }
  // How many nodes each reaches, cycles included: the bigger way first.
  for (const v of nodes){
    const seen = new Set([v]), stack = [v];
    while (stack.length) for (const e of stack.pop().out) if (!seen.has(e.dst)){ seen.add(e.dst); stack.push(e.dst); }
    v.reach = seen.size;
  }
  const ahead = (p, q) => q.dst.reach - p.dst.reach || cmp(p.name, q.name) || cmp(p.dst.name, q.dst.name) || cmp(p.dst.id, q.dst.id);
  const first = (p, q) => p.lane - q.lane || q.reach - p.reach || cmp(p.name, q.name) || cmp(p.id, q.id);
  for (const v of nodes) v.out.sort(ahead);

  // Cycles: a depth-first search from the nodes nothing flows into, then the rest; an edge back into the path
  // counts the other way round.
  const seeds = [...nodes].sort(first), state = new Map();
  const visit = v => {
    state.set(v, 1);
    for (const e of v.out){ const s = state.get(e.dst); if (s === undefined) visit(e.dst); else if (s === 1) e.back = true; }
    state.set(v, 2);
  };
  for (const v of [...seeds.filter(v => !v.in), ...seeds.filter(v => v.in)]) if (!state.has(v)) visit(v);
  for (const v of nodes){ v.out = []; v.in = 0; }
  for (const e of edges){ const [src, dst] = e.back ? [e.dst, e.src] : [e.src, e.dst]; src.out.push({ dst, name: e.name }); dst.in++; }
  for (const v of nodes) v.out.sort(ahead);

  // The ranks, generation by generation: a node takes the first free column of its lane at or after the column its
  // predecessors demand (one further within the lane, the same from another lane).
  const rank = {}, nextFree = new Map();
  let frontier = nodes.filter(v => !v.in).sort(first);
  while (frontier.length){
    const next = [];
    for (const v of frontier){
      const r = Math.max(v.base, nextFree.get(v.lane) ?? 0);
      nextFree.set(v.lane, r + 1);
      rank[v.key] = r;
      for (const { dst } of v.out){ dst.base = Math.max(dst.base, r + (dst.lane === v.lane ? 1 : 0)); if (--dst.in === 0) next.push(dst); }
    }
    frontier = next;
  }
  return rank;
}
