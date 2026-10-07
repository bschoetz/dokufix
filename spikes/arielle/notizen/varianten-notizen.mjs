// The orders under test for the lists kanonisch() leaves unsorted: text annotations, associations and message
// flows. Each builds on kanonisch/kanonisch.mjs (nodes, flows, boundaries in LMM's order, unchanged here) and takes
// the positions of that model as keys, so that nothing hangs on the XML's order.
//   kanonischWith(model, { notes, pools, messages, assocs }) → { model, rank }
// notes (text annotations at nodes, boundary events, sequence and message flows):
//   xml       unchanged (kanonisch() today)
//   id        by id
//   text      by text, then id
//   partner   by the place of the partner of the first association, then text, then id (the place: the partner's
//             position among the nodes; a boundary event after its host, a flow after its source, a message flow
//             after the earlier of its ends; among equals, the position of the boundary event, flow or message)
//   partner-id  as partner, but id instead of text
//   lanecol   lane of the partner, then LMM's column, then as partner (the author's reading order: top to bottom,
//             left to right)
//   kind      the kind of the partner first (boundary event, flow, message flow, node: the more constrained first),
//             then as partner
//   long      the longer text first (bigger box, fewer free places), then as partner
//   rpartner  partner reversed (right to left), as a control
// pools (text annotations at pools, stacked right of the frame):
//   xml       the stack in the XML's order (review of 2.31)
//   canon     by pool index, then text, then id
// messages:  xml unchanged · ends by the position of the ends (a pool after every node), then name, then id
// assocs:    xml unchanged · canon grouped by text annotation (in the notes' order), within one by the place of
//             the partner, then direction (to the partner first), then id; the first association names the
//             partner, and the text annotation's pool is taken from it anew
import { kanonisch as kanonischBasis } from '../kanonisch/kanonisch.mjs';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const lex = (p, q) => { for (let i = 0; i < p.length; i++){ const d = p[i] - q[i]; if (d) return d; } return 0; };

export const NOTE_ORDERS = ['xml', 'id', 'text', 'partner', 'partner-id', 'lanecol', 'kind', 'long', 'rpartner'];
export const POOL_ORDERS = ['xml', 'canon'];
export const MSG_ORDERS = ['xml', 'ends'];
export const ASSOC_ORDERS = ['xml', 'canon'];
const KIND = { node: 0, boundary: 1, flow: 2, message: 3, pool: 4 };

export function kanonischWith(model, { notes: no = 'partner', pools: po = 'canon', messages: mo = 'ends', assocs: ao = 'canon' } = {}){
  const { model: m, rank } = kanonischBasis(model);
  const pos = new Map(m.nodes.map((n, i) => [n.id, i])), byId = new Map(m.nodes.map(n => [n.id, n]));
  const boundaries = m.boundaries || [], hostOf = new Map(boundaries.map(b => [b.id, b.host])), bPos = new Map(boundaries.map((b, i) => [b.id, i]));
  const flowPos = new Map(m.flows.map((f, i) => [f.id, i])), flowOf = new Map(m.flows.map(f => [f.id, f]));
  const poolIdx = new Map(m.pools.map((p, i) => [p.id, i]).filter(([id]) => id));
  const laneOf = new Map(); m.lanes.forEach((l, i) => l.nodes.forEach(id => { if (!laneOf.has(id)) laneOf.set(id, i); }));
  const own = id => hostOf.get(id) ?? id;
  const N = m.nodes.length;
  // The position of an end: a node, a boundary event (its host), a pool (after every node).
  const endPos = id => pos.has(id) ? pos.get(id) : hostOf.has(id) ? pos.get(hostOf.get(id)) : N + (poolIdx.get(id) ?? 0);
  const msgKey = (a, b) => endPos(a.from) - endPos(b.from) || endPos(a.to) - endPos(b.to) || cmp(a.name || '', b.name || '') || cmp(a.id, b.id);
  const messages = mo === 'xml' ? (m.messages || []) : [...(m.messages || [])].sort(msgKey);
  const msgPos = new Map(messages.map((x, i) => [x.id, i])), msgOf = new Map(messages.map(x => [x.id, x]));
  // The place of a partner: [position of its node, kind, position within the kind].
  const place = a => a.kind === 'node' ? [pos.get(a.partner), KIND.node, 0]
    : a.kind === 'boundary' ? [pos.get(hostOf.get(a.partner)), KIND.boundary, bPos.get(a.partner)]
    : a.kind === 'flow' ? [pos.get(own(flowOf.get(a.partner).from)), KIND.flow, flowPos.get(a.partner)]
    : a.kind === 'message' ? [Math.min(endPos(msgOf.get(a.partner).from), endPos(msgOf.get(a.partner).to)), KIND.message, msgPos.get(a.partner)]
    : [N + poolIdx.get(a.partner), KIND.pool, 0];
  // The node a place is beside (for lane and column).
  const nodeOf = a => a.kind === 'node' ? a.partner : a.kind === 'boundary' ? hostOf.get(a.partner) : a.kind === 'flow' ? own(flowOf.get(a.partner).from)
    : a.kind === 'message' ? [msgOf.get(a.partner).from, msgOf.get(a.partner).to].map(own).find(id => pos.has(id)) : null;
  const poolOfPartner = a => a.kind === 'pool' ? poolIdx.get(a.partner) : a.kind === 'message' ? null : (m.lanes[laneOf.get(nodeOf(a))]?.pool ?? 0);
  const assocKey = (a, b) => lex(place(a), place(b)) || (a.toNote ? 1 : 0) - (b.toNote ? 1 : 0) || cmp(a.id, b.id);
  const allAssocs = m.associations || [];
  const firstOf = new Map();
  for (const a of ao === 'xml' ? allAssocs : [...allAssocs].sort(assocKey)) if (!firstOf.has(a.note)) firstOf.set(a.note, a);
  const notes0 = (m.notes || []).map(n => ({ ...n, pool: ao === 'xml' ? n.pool : poolOfPartner(firstOf.get(n.id)) }));
  const first = n => firstOf.get(n.id);
  const P = n => place(first(n));
  const atPool = n => first(n).kind === 'pool';
  const byPartner = (x, y) => lex(P(x), P(y)) || cmp(x.text, y.text) || cmp(x.id, y.id);
  const col = n => rank[byId.get(nodeOf(first(n))).key], lane = n => laneOf.get(nodeOf(first(n)));
  const noteKey = {
    xml: () => 0,
    id: (x, y) => cmp(x.id, y.id),
    text: (x, y) => cmp(x.text, y.text) || cmp(x.id, y.id),
    partner: byPartner,
    'partner-id': (x, y) => lex(P(x), P(y)) || cmp(x.id, y.id),
    lanecol: (x, y) => lane(x) - lane(y) || col(x) - col(y) || byPartner(x, y),
    kind: (x, y) => KIND[first(x).kind] - KIND[first(y).kind] || byPartner(x, y),
    long: (x, y) => y.text.length - x.text.length || byPartner(x, y),
    rpartner: (x, y) => lex(P(y), P(x)) || cmp(x.text, y.text) || cmp(x.id, y.id),
  }[no];
  const poolKey = po === 'xml' ? () => 0 : (x, y) => lex(P(x), P(y)) || cmp(x.text, y.text) || cmp(x.id, y.id);
  // Those at pools are placed apart (one stack, by pool); their place in the list does not matter, only their order.
  const notes = [...notes0.filter(n => !atPool(n)).sort(noteKey), ...notes0.filter(atPool).sort(poolKey)];
  const notePos = new Map(notes.map((n, i) => [n.id, i]));
  const associations = ao === 'xml' ? allAssocs : [...allAssocs].sort((a, b) => notePos.get(a.note) - notePos.get(b.note) || assocKey(a, b));
  return { model: { ...m, messages, notes, associations }, rank };
}

export const nameOf = o => [o.notes, o.pools, o.messages, o.assocs].join('/');
export const parse = name => { const [notes, pools, messages, assocs] = name.split('/'); return { notes, pools, messages, assocs }; };
