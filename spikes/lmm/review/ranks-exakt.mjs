// arielleExakt: the reference, an exact replica of Mermaid 12.0.0's columns.
// The column of every flow node of a model from readProcess(), as a rank per
// node key (n1…). Pure logic, no DOM; layoutGeometry() reads only
// the order of the ranks (buildGrid()), so the scale is free.
//
// The ranks are those Mermaid 12.0.0's swimlane layout gave the nodes (its
// x-order for swimlane-beta, LR, ignoreCrossLaneEdges), so that the picture
// stays the one the fixtures hold. The rules, in words:
//   - A lane is the unit in which two nodes never share a column.
//   - A flow within a lane puts its target at least one column right of its
//     source; a flow into another lane allows the same column.
//   - A flow with a name costs a column of its own: its label stands between
//     source and target, as a vertex of the source's lane, of the target's
//     lane when the flow changes lane.
//   - A flow that closes a cycle, found by a depth-first search, counts the
//     other way round.
//   - The vertices are ranked generation by generation: all whose predecessors
//     are ranked, then the next. Within a generation Mermaid takes them in the
//     order of its ids as strings, labels ("edge-label-…") before nodes ("n…"),
//     nodes by key as a string ("n1" < "n10" < "n2").
//   - A vertex takes the first free column of its lane that is not left of
//     what its predecessors demand.
// A flow from a boundary event leaves its host; a flow whose two ends are one
// node (the host and its own event too) sets nothing. The lanes themselves and
// the placeholder of an empty lane set nothing either.

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// Mermaid's order of two vertices: by the sort key, element by element.
const byId = (p, q) => { for (let i = 0; i < p.sort.length; i++){ const d = cmp(p.sort[i], q.sort[i]); if (d) return d; } return 0; };

export function arielleExakt(model){
  // The vertices of the nodes, lane by lane as Mermaid lists them; a boundary event counts as its host, a node
  // stands in the first lane that names it.
  const vertexOf = new Map(model.nodes.map(n => [n.id, { key: n.key, sort: [1, n.key], lane: -1, out: [], in: 0, base: 0 }]));
  for (const b of model.boundaries || []) vertexOf.set(b.id, vertexOf.get(b.host));
  const nodes = [];
  model.lanes.forEach((l, i) => l.nodes.forEach(id => { const v = vertexOf.get(id); if (v.lane < 0){ v.lane = i; nodes.push(v); } }));
  // The edges, a named flow as two with its label vertex between. Mermaid numbers the flows of one pair 0, 2, 3, …,
  // and the number is part of the label's id.
  const edges = [], labels = [], pairs = new Map();
  for (const f of model.flows){
    const a = vertexOf.get(f.from), b = vertexOf.get(f.to);
    if (a === b) continue;
    const pair = a.key + '>' + b.key, n = pairs.get(pair) ?? 0;
    pairs.set(pair, n + 1);
    // Mermaid got the name without " < > & # ` \ (mermaidSource()); one with nothing else left was no label to it.
    if (!f.name.replace(/["<>&#`\\]/g, ' ').trim()){ edges.push({ src: a, dst: b }); continue; }
    const label = { sort: [0, a.key, b.key, String(n ? n + 1 : 0)], lane: a.lane === b.lane ? a.lane : b.lane, out: [], in: 0, base: 0 };
    labels.push(label);
    edges.push({ src: a, dst: label }, { src: label, dst: b });
  }
  const vertices = [...nodes, ...labels];
  vertices.sort(byId).forEach((v, i) => { v.pos = i; });
  const byPos = (p, q) => p.pos - q.pos;

  // Cycles: a depth-first search along the edges of each vertex in its targets' order, from the nodes without a
  // flow into them first, then the rest, each in lane order; an edge back into the path counts the other way round.
  for (const e of edges){ e.src.out.push(e); e.dst.in++; }
  for (const v of vertices) v.out.sort((p, q) => byPos(p.dst, q.dst));
  const state = new Map();
  const visit = v => {
    state.set(v, 1);
    for (const e of v.out){
      const s = state.get(e.dst);
      if (s === undefined) visit(e.dst); else if (s === 1) e.back = true;
    }
    state.set(v, 2);
  };
  for (const v of [...nodes.filter(v => !v.in), ...nodes.filter(v => v.in)]) if (!state.has(v)) visit(v);
  for (const v of vertices){ v.out = []; v.in = 0; }
  for (const e of edges){ const [src, dst] = e.back ? [e.dst, e.src] : [e.src, e.dst]; src.out.push(dst); dst.in++; }

  // The ranks, generation by generation in Mermaid's order: a vertex takes the first free column of its lane at or
  // after the column its predecessors demand (one further within the lane, the same from another lane).
  const rank = {}, nextFree = new Map();
  let frontier = vertices.filter(v => !v.in).sort(byPos);
  while (frontier.length){
    const next = [];
    for (const v of frontier){
      const r = Math.max(v.base, nextFree.get(v.lane) ?? 0);
      nextFree.set(v.lane, r + 1);
      if (v.key) rank[v.key] = r;
      for (const w of v.out){
        w.base = Math.max(w.base, r + (w.lane === v.lane ? 1 : 0));
        if (--w.in === 0) next.push(w);
      }
    }
    frontier = next.sort(byPos);
  }
  return rank;
}
