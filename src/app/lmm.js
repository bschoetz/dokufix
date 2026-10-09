// --- LMM: the columns of BPMN without coordinates ----------------------------
// The layout of BPMN without coordinates (src/app/bpmn-layout.js) starts from
// a column for every flow node: layoutGeometry() puts the nodes on a grid in
// that order, and its rules move them from there. LMM ("Little Mermaid", a pun
// on LLM, with whose help it was made) gives those columns, from the model
// readProcess() reads: pure arithmetic on the process, no page, no library.
// Until it did, Mermaid drew the process as a swimlane diagram off-screen and
// the layout read the columns from its SVG.
//
// The columns, in words:
//   - A lane is the unit in which two nodes never share a column.
//   - A flow within a lane puts its target at least one column right of its
//     source; a flow into another lane allows the same column. The lanes of
//     all pools are one list here: the pools share their columns. Message
//     flows set no column; R7 of the layout sees to them.
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
//     go by lane first, from the top.
//   - A flow from a boundary event leaves its host; a flow whose two ends are
//     one node (the host and its own event too) sets nothing.
//   - A flow's name sets no column: its label finds its room on the routed
//     flow (flowLabel() in src/app/bpmn-layout.js).
// The columns follow the structure of the process, not the order of the XML,
// which has no meaning in BPMN: a reordering of the flow nodes, the
// flowNodeRef or the sequence flows gives the same columns. Names and ids are
// the author's, so a renaming can change the order among equals; nothing else
// can. Mermaid took them in the order of its own ids, made in the order of
// the XML, so a meaningless reordering changed the columns in about a quarter
// of the cases (docs/analyse-mermaid-im-bpmn-code.md, section 3a).
//
// The grid's rules follow the order of the model's lists wherever they have a
// tie, and that order, too, is the XML's. kanonisch() therefore hands the
// layout the model in LMM's order, which the walk gives anyway: then the
// finished picture does not change with the order of the XML either (section
// 3b). The author's model, unsorted, still writes the diagram part
// (appendDiagram()), so the XML keeps its order.
//
// Replicated from Mermaid 12.0.0, the layering of its swimlane layout:
// src/rendering-util/layout-algorithms/swimlanes/phase1.cycles.ts
// (removeCycles_DFS()) and phase2.laneAwareCompact.ts
// (topoSortByGenerationIfAcyclic(), assignLayers_LaneAwareCompact()), adapted
// and shortened. The layering is Mermaid's; the order among equals (the start
// of the search, the order of the ways out of a node, the order within a
// generation) is LMM's own, and so are a flow's name that costs no column
// (Mermaid gave a label a column of its own) and the order of kanonisch().
//
// Mermaid: The MIT License (MIT), Copyright (c) 2014 - 2022 Knut Sveidqvist.
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions: The
// above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED
// "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
// LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
// PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
// HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
// The notice is on the list behind the link "license information" of every
// dokufix file (src/app/licences.js).
//
// Pure logic: no page, no library, no import, nothing done when the module
// loads, so that a bundle which reaches it without calling it (the reader
// bundle of the exports, through src/app/bpmn.js) leaves it out.
// tests/lmm.test.mjs runs it in Node.

// The Mermaid version the layering is replicated from. tests/licences.test.mjs
// compares it with the entry of the list; it stays when the page loads another
// Mermaid for the Mermaid diagrams.
export const LMM_MERMAID_VERSION = '12.0.0';

// Texts compared by their code units, not by a locale: the same order in every
// browser and in Node.
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// The walk both exports share: { rank, ranked, seq }
//   rank    { key: rank }, per node key (n1…)
//   ranked  the node ids in the order their rank was given
//   seq     Map(flow → n), the flows in the order the depth-first search met
//           them, every flow once; one whose two ends are one vertex has no
//           place in the search and comes after all others, in the model's
//           order
function walk(model){
  // The vertices: a node with its lane and its flows out; a boundary event is
  // its host's vertex, a node stands in the first lane that names it.
  const vertexOf = new Map(model.nodes.map(n => [n.id, { id: n.id, key: n.key, name: n.name || '', lane: -1, out: [], in: 0, base: 0 }]));
  for (const b of model.boundaries || []) vertexOf.set(b.id, vertexOf.get(b.host));
  model.lanes.forEach((l, i) => l.nodes.forEach(id => { const v = vertexOf.get(id); if (v.lane < 0) v.lane = i; }));
  const nodes = model.nodes.map(n => vertexOf.get(n.id));
  const edges = [], loops = [];
  for (const f of model.flows){
    const src = vertexOf.get(f.from), dst = vertexOf.get(f.to);
    if (src !== dst) edges.push({ src, dst, name: f.name || '', f }); else loops.push(f);
  }
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

  // Cycles (Mermaid's phase 1): a depth-first search from the nodes nothing
  // flows into, then from the rest; an edge back into the path counts the
  // other way round.
  const seeds = [...nodes].sort(first), state = new Map(), seq = new Map();
  // With a stack of its own, not by recursion, in the same order: a long chain
  // would overflow the call stack (security review of 2026-10-07).
  const visit = root => {
    const path = [{ v: root, k: 0 }];
    state.set(root, 1);
    while (path.length){
      const top = path[path.length - 1];
      if (top.k === top.v.out.length){ state.set(top.v, 2); path.pop(); continue; }
      const e = top.v.out[top.k++];
      seq.set(e.f, seq.size);
      const s = state.get(e.dst);
      if (s === undefined){ state.set(e.dst, 1); path.push({ v: e.dst, k: 0 }); } else if (s === 1) e.back = true;
    }
  };
  for (const v of [...seeds.filter(v => !v.in), ...seeds.filter(v => v.in)]) if (!state.has(v)) visit(v);
  for (const f of loops) seq.set(f, seq.size);
  for (const v of nodes){ v.out = []; v.in = 0; }
  for (const e of edges){ const [src, dst] = e.back ? [e.dst, e.src] : [e.src, e.dst]; src.out.push({ dst, name: e.name }); dst.in++; }
  for (const v of nodes) v.out.sort(ahead);

  // The ranks (Mermaid's phase 2), generation by generation: a node takes the
  // first free column of its lane at or after the column its predecessors
  // demand, one further within the lane, the same from another lane.
  const rank = {}, nextFree = new Map(), ranked = [];
  let frontier = nodes.filter(v => !v.in).sort(first);
  while (frontier.length){
    const next = [];
    for (const v of frontier){
      const r = Math.max(v.base, nextFree.get(v.lane) ?? 0);
      nextFree.set(v.lane, r + 1);
      rank[v.key] = r;
      ranked.push(v.id);
      for (const { dst } of v.out){
        dst.base = Math.max(dst.base, r + (dst.lane === v.lane ? 1 : 0));
        if (--dst.in === 0) next.push(dst);
      }
    }
    frontier = next;
  }
  return { rank, ranked, seq };
}

// The column of every flow node of a model from readProcess(), as a rank per
// node key: { n1: 0, n2: 1, … }. Only the order counts: equal ranks share a
// column, and gaps mean nothing.
export function lmm(model){
  return walk(model).rank;
}

// The ranks in the form layoutGeometry() reads them, the x of each node's
// middle: { nodes: { key: { cx: rank } } }.
export function lmmPositions(model, rank){
  return { nodes: Object.fromEntries(model.nodes.map(n => [n.key, { cx: rank[n.key] }])) };
}

// The order of the kinds of what a text annotation comments: the fewer
// anchors it has, the earlier (one box against the points of every piece of a
// flow); a pool's text annotations are stacked apart from the others; those at a
// reference (story 2.32) are placed once the references are.
const KIND = { node: 0, boundary: 1, flow: 2, message: 3, pool: 4, data: 5 };
const lex = (p, q) => { for (let i = 0; i < p.length; i++){ const d = p[i] - q[i]; if (d) return d; } return 0; };
// The place of what stands on its own, a text annotation or a reference without a partner (story 2.32): its pool (the
// diagram area, null, last), then its lane in the order of the lanes (none, the pool's, first).

// The model in LMM's order, for layoutGeometry(), and the ranks with it, from
// one walk: { model, rank }. Every list whose order a rule of the grid reads
// on a tie is sorted by the structure of the process; what has a meaning
// stays:
//   nodes         the order LMM gave the ranks in: column by column, the main
//                 way first. lane.nodes likewise
//   flows         the order LMM's depth-first search met them in: the main way
//                 to its end, then the alternatives, each way's flow back
//                 where the search met it, the order an author writes a
//                 process down in and the one that measured best
//   boundaries    by the place of their host, then by the place of their first
//                 flow (an event without one after those with one), then
//                 name, then id
//   messages      by the place of the source, then of the target (a pool after
//                 every node), then name, then id: the router lays message
//                 flows of equal span in list order
//   associations  grouped by text annotation, in the notes' order; within one,
//                 by the place of the partner, then the one written towards
//                 the partner first, then id. Only the first counts: it names
//                 the text annotation's partner, so its pool is taken from it
//                 anew
//   notes         placed one after the other, each keeping off those placed
//                 before it, so the first takes the better place: by the kind
//                 of the partner of their first association (KIND), then by
//                 its place (a boundary event after its host, a flow after its
//                 source, a message flow after the earlier of its ends), then
//                 text, then id; those at a pool, stacked right of its frame,
//                 last, by pool, then text, then id; those without an
//                 association (story 2.32) after them, by where they stand
//                 (asidePlace()), then text, then id
//   data          the references, placed one after the other like the notes
//                 (story 2.32): by the place of their first user (a boundary
//                 event at its host's), then name, then id; those without a
//                 user after them, by where they stand (asidePlace()), then name,
//                 then id
//   dataAssociations  by the order of their references, then the place of
//                 their node, the one in before the one out, then id
//   lanes, pools  unchanged: they give the picture its order from top to
//                 bottom
// The order hangs on ids only where LMM's own does, and where two text
// annotations, message flows or associations are alike in all else.
export function kanonisch(model){
  const { rank, ranked, seq } = walk(model);
  const pos = new Map(ranked.map((id, i) => [id, i]));
  const allBoundaries = model.boundaries || [];
  const hostOf = new Map(allBoundaries.map(b => [b.id, b.host]));
  const nodes = [...model.nodes].sort((p, q) => pos.get(p.id) - pos.get(q.id));
  const flows = [...model.flows].sort((f, g) => seq.get(f) - seq.get(g));
  const firstFlow = new Map();
  for (const f of flows) if (hostOf.has(f.from) && !firstFlow.has(f.from)) firstFlow.set(f.from, seq.get(f));
  const boundaries = [...allBoundaries].sort((x, y) => pos.get(x.host) - pos.get(y.host) ||
    (firstFlow.get(x.id) ?? Infinity) - (firstFlow.get(y.id) ?? Infinity) || cmp(x.name || '', y.name || '') || cmp(x.id, y.id));
  const lanes = model.lanes.map(l => ({ ...l, nodes: [...l.nodes].sort((x, y) => pos.get(x) - pos.get(y)) }));

  // The places in the sorted lists, which the keys of the rest are made of.
  const bPos = new Map(boundaries.map((b, i) => [b.id, i]));
  const flowPos = new Map(flows.map((f, i) => [f.id, i])), flowOf = new Map(flows.map(f => [f.id, f]));
  const poolIdx = new Map(model.pools.map((p, i) => [p.id, i]).filter(([id]) => id));
  const laneOf = new Map();
  lanes.forEach((l, i) => l.nodes.forEach(id => { if (!laneOf.has(id)) laneOf.set(id, i); }));
  const own = id => hostOf.get(id) ?? id;
  const N = nodes.length;
  // The place of an end: a node, a boundary event (its host), a pool (after every node).
  const endPos = id => pos.has(id) ? pos.get(id) : hostOf.has(id) ? pos.get(hostOf.get(id)) : N + (poolIdx.get(id) ?? 0);
  const messages = [...(model.messages || [])].sort((a, b) => endPos(a.from) - endPos(b.from) || endPos(a.to) - endPos(b.to) ||
    cmp(a.name || '', b.name || '') || cmp(a.id, b.id));
  const msgPos = new Map(messages.map((x, i) => [x.id, i])), msgOf = new Map(messages.map(x => [x.id, x]));
  const laneIdx = new Map(lanes.map((l, i) => [l.key, i]));
  const asidePlace = x => [x.pool ?? model.pools.length, x.lane ? laneIdx.get(x.lane) + 1 : 0];
  const asideKey = (x, y, text) => lex(asidePlace(x), asidePlace(y)) || cmp(text(x), text(y)) || cmp(x.id, y.id);
  // The references: by the place of their first user.
  const dataAssocs = model.dataAssociations || [];
  const userPos = new Map();
  for (const a of dataAssocs){ const p = pos.get(own(a.node)); if (!userPos.has(a.ref) || p < userPos.get(a.ref)) userPos.set(a.ref, p); }
  const used = (model.data || []).filter(d => userPos.has(d.id)).sort((x, y) => userPos.get(x.id) - userPos.get(y.id) || cmp(x.name, y.name) || cmp(x.id, y.id));
  const data = [...used, ...(model.data || []).filter(d => !userPos.has(d.id)).sort((x, y) => asideKey(x, y, d => d.name))];
  const dataPos = new Map(data.map((d, i) => [d.id, i]));
  const refPos = dataPos, refPool = new Map(data.map(d => [d.id, d.pool]));
  // The place of an association's partner: [place of its node, kind, place within the kind].
  const place = a => a.kind === 'node' ? [pos.get(a.partner), KIND.node, 0]
    : a.kind === 'boundary' ? [pos.get(hostOf.get(a.partner)), KIND.boundary, bPos.get(a.partner)]
    : a.kind === 'flow' ? [pos.get(own(flowOf.get(a.partner).from)), KIND.flow, flowPos.get(a.partner)]
    : a.kind === 'message' ? [Math.min(endPos(msgOf.get(a.partner).from), endPos(msgOf.get(a.partner).to)), KIND.message, msgPos.get(a.partner)]
    : a.kind === 'data' ? [N + model.pools.length + (refPos.get(a.partner) ?? 0), KIND.data, 0]
    : [N + poolIdx.get(a.partner), KIND.pool, 0];
  // The pool of a partner, as readProcess() gives it: that of its node's lane; a message flow's none.
  const nodeOf = a => a.kind === 'node' ? a.partner : a.kind === 'boundary' ? hostOf.get(a.partner) : a.kind === 'flow' ? own(flowOf.get(a.partner).from) : null;
  const poolOf = a => a.kind === 'pool' ? poolIdx.get(a.partner) : a.kind === 'message' ? null : a.kind === 'data' ? refPool.get(a.partner) ?? null : (lanes[laneOf.get(nodeOf(a))]?.pool ?? 0);
  const assocKey = (a, b) => lex(place(a), place(b)) || (a.toNote ? 1 : 0) - (b.toNote ? 1 : 0) || cmp(a.id, b.id);
  const firstOf = new Map();
  for (const a of [...(model.associations || [])].sort(assocKey)) if (!firstOf.has(a.note)) firstOf.set(a.note, a);
  const P = n => place(firstOf.get(n.id)), kind = n => KIND[firstOf.get(n.id).kind];
  const noteKey = (x, y) => kind(x) - kind(y) || lex(P(x), P(y)) || cmp(x.text, y.text) || cmp(x.id, y.id);
  const all = (model.notes || []).filter(n => !n.lone).map(n => ({ ...n, pool: poolOf(firstOf.get(n.id)) }));
  const atPool = n => firstOf.get(n.id).kind === 'pool';
  const notes = [...all.filter(n => !atPool(n)).sort(noteKey), ...all.filter(atPool).sort(noteKey)];
  notes.push(...[...(model.notes || [])].filter(n => n.lone).sort((x, y) => asideKey(x, y, n => n.text)));
  const notePos = new Map(notes.map((n, i) => [n.id, i]));
  const associations = [...(model.associations || [])].sort((a, b) => notePos.get(a.note) - notePos.get(b.note) || assocKey(a, b));
  const dataAssociations = [...dataAssocs].sort((a, b) => dataPos.get(a.ref) - dataPos.get(b.ref) || pos.get(own(a.node)) - pos.get(own(b.node)) ||
    (a.node === b.node ? 0 : bPos.has(a.node) - bPos.has(b.node)) || (a.dir === b.dir ? 0 : a.dir === 'in' ? -1 : 1) || cmp(a.id, b.id));
  return { model: { ...model, nodes, lanes, flows, boundaries, messages, notes, associations, data, dataAssociations }, rank };
}
