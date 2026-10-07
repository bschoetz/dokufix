// kanonisch, extended to the text annotations: the model in LMM's order for the grid, now with the lists kanonisch()
// left unsorted (kanonisch/kanonisch.mjs: nodes, flows, boundaries, lane.nodes are sorted there and taken over
// unchanged, as are lanes and pools). layoutGeometry() reads these three lists in order too:
//   notes         placed one after the other (finishLabelsAndFrame()), each taking the first free place of
//                 notePlaces() and keeping off every text annotation placed before it: the first one takes the
//                 better place. Those at a pool are stacked right of its frame, one below the other, in list order
//   associations  assocs.find(x => x.note === n.id): the first association of a text annotation names its partner
//                 (and, in readNotes(), its pool); the other associations only get their waypoints
//   messages      the router lays message flows of equal span in list order (the first takes the better port and
//                 track); their labels follow the routes
// What is sorted, and by what (all keys are positions in the sorted model, texts and names; ids last):
//   messages      by the position of the source, then of the target (a pool after every node), then name, then id
//   associations  grouped by text annotation (in the notes' order); within one, by the place of the partner, then
//                 the one written towards the partner first, then id. The first is the one the layout reads, and
//                 the text annotation's pool is taken from it anew (readNotes() took it from the XML's first)
//   notes         by the place of the partner of their first association: the partner's position among the nodes
//                 (a boundary event after its host, a flow after its source, a message flow after the earlier of
//                 its ends; among those, the position of the boundary event, flow or message in its list), then
//                 the text, then id. Measured best of the orders tried (BERICHT.md): in reading order of the
//                 process, the first text annotation at a node takes the near place, the one at the node's event
//                 or outgoing flow the next
//   notes at pools   by pool, then text, then id (option poolNotes: 'xml' keeps the XML's stack order; BERICHT.md,
//                 Abschnitt 4). They are placed apart from the others, so only their order among themselves counts
// The order hangs on ids only where two text annotations have the same partner and the same text, two message
// flows the same ends and name, or two associations of one text annotation the same partner and direction.
import { kanonisch as kanonischBasis } from '../kanonisch/kanonisch.mjs';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const lex = (p, q) => { for (let i = 0; i < p.length; i++){ const d = p[i] - q[i]; if (d) return d; } return 0; };
const KIND = { node: 0, boundary: 1, flow: 2, message: 3, pool: 4 };

export function kanonisch(model, { poolNotes = 'canon' } = {}){
  const { model: m, rank } = kanonischBasis(model);
  const pos = new Map(m.nodes.map((n, i) => [n.id, i]));
  const boundaries = m.boundaries || [], hostOf = new Map(boundaries.map(b => [b.id, b.host])), bPos = new Map(boundaries.map((b, i) => [b.id, i]));
  const flowPos = new Map(m.flows.map((f, i) => [f.id, i])), flowOf = new Map(m.flows.map(f => [f.id, f]));
  const poolIdx = new Map(m.pools.map((p, i) => [p.id, i]).filter(([id]) => id));
  const laneOf = new Map(); m.lanes.forEach((l, i) => l.nodes.forEach(id => { if (!laneOf.has(id)) laneOf.set(id, i); }));
  const own = id => hostOf.get(id) ?? id;
  const N = m.nodes.length;
  // The position of an end: a node, a boundary event (its host), a pool (after every node).
  const endPos = id => pos.has(id) ? pos.get(id) : hostOf.has(id) ? pos.get(hostOf.get(id)) : N + (poolIdx.get(id) ?? 0);
  const messages = [...(m.messages || [])].sort((a, b) => endPos(a.from) - endPos(b.from) || endPos(a.to) - endPos(b.to) || cmp(a.name || '', b.name || '') || cmp(a.id, b.id));
  const msgPos = new Map(messages.map((x, i) => [x.id, i])), msgOf = new Map(messages.map(x => [x.id, x]));
  // The place of a partner: [position of its node, kind, position within the kind].
  const place = a => a.kind === 'node' ? [pos.get(a.partner), KIND.node, 0]
    : a.kind === 'boundary' ? [pos.get(hostOf.get(a.partner)), KIND.boundary, bPos.get(a.partner)]
    : a.kind === 'flow' ? [pos.get(own(flowOf.get(a.partner).from)), KIND.flow, flowPos.get(a.partner)]
    : a.kind === 'message' ? [Math.min(endPos(msgOf.get(a.partner).from), endPos(msgOf.get(a.partner).to)), KIND.message, msgPos.get(a.partner)]
    : [N + poolIdx.get(a.partner), KIND.pool, 0];
  // The pool of a partner, as readNotes() gives it: that of its node's lane; a message flow's none.
  const nodeOf = a => a.kind === 'node' ? a.partner : a.kind === 'boundary' ? hostOf.get(a.partner) : a.kind === 'flow' ? own(flowOf.get(a.partner).from) : null;
  const poolOfPartner = a => a.kind === 'pool' ? poolIdx.get(a.partner) : a.kind === 'message' ? null : (m.lanes[laneOf.get(nodeOf(a))]?.pool ?? 0);
  const assocKey = (a, b) => lex(place(a), place(b)) || (a.toNote ? 1 : 0) - (b.toNote ? 1 : 0) || cmp(a.id, b.id);
  const firstOf = new Map();
  for (const a of [...(m.associations || [])].sort(assocKey)) if (!firstOf.has(a.note)) firstOf.set(a.note, a);
  const first = n => firstOf.get(n.id), P = n => place(first(n));
  const noteKey = (x, y) => lex(P(x), P(y)) || cmp(x.text, y.text) || cmp(x.id, y.id);
  const all = (m.notes || []).map(n => ({ ...n, pool: poolOfPartner(first(n)) }));
  const atPool = n => first(n).kind === 'pool';
  const notes = [...all.filter(n => !atPool(n)).sort(noteKey), ...(poolNotes === 'xml' ? all.filter(atPool) : all.filter(atPool).sort(noteKey))];
  const notePos = new Map(notes.map((n, i) => [n.id, i]));
  const associations = [...(m.associations || [])].sort((a, b) => notePos.get(a.note) - notePos.get(b.note) || assocKey(a, b));
  return { model: { ...m, messages, notes, associations }, rank };
}

export { rawOf } from '../kanonisch/kanonisch.mjs';
