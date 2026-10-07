// kanonisch: the model in arielle's order, for the grid. layoutGeometry()'s rules follow the order of model.nodes,
// model.flows and model.boundaries wherever a rule has a tie (byCol(), at(), the loops over the lists, the router's
// order of flows of equal length); that order is the XML's, which has no meaning in BPMN. Sorted once, here, the
// finished layout no longer changes when the XML is reordered.
//
// What is sorted, and by what:
//   nodes        the order arielle gave the ranks in: column by column within a generation, the main way first
//   lane.nodes   as the nodes (no reader of the grid depends on it; sorted for consistency)
//   flows        the order arielle's depth-first search walked them: the main way to its end, then the
//                alternatives, each way's flow back where the search met it; a flow from a node to itself last.
//                This is the one list whose order the rules read most, and the walk's order is the one that
//                measured best (BERICHT.md): the author's "main path first" order, from the structure
//   boundaries   by the position of their host, then by the position of their first flow in the walk (an event
//                without a flow after those with one), then name, then id
// What is not sorted, on purpose:
//   lanes, pools the picture's order from top to bottom: meaning, not noise
//   messages, notes, associations   their order in the XML is the author's and is read as such (a text annotation
//                placed earlier takes the better place, review of 2.31); permute-xml.mjs does not move them either.
//                Sorting the notes by id costs a break (notiz-morgen)
// The ranks come with the order, so a caller needs the walk only once: kanonisch(model) → { model, rank }.
// The order hangs on ids only where arielle's own order does (two ways equal in reach, flow name and node name).
import { arielleOrder } from './arielle-order.mjs';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function kanonisch(model){
  const a = arielleOrder(model);
  const pos = new Map(a.ranked.map((id, i) => [id, i]));
  const hostOf = new Map((model.boundaries || []).map(b => [b.id, b.host]));
  const nodes = [...model.nodes].sort((p, q) => pos.get(p.id) - pos.get(q.id));
  const flows = [...model.flows].sort((f, g) => a.edgeSeq.get(f) - a.edgeSeq.get(g));
  const firstFlow = new Map();
  for (const f of flows) if (hostOf.has(f.from) && !firstFlow.has(f.from)) firstFlow.set(f.from, a.edgeSeq.get(f));
  const boundaries = [...(model.boundaries || [])].sort((x, y) => pos.get(x.host) - pos.get(y.host) || (firstFlow.get(x.id) ?? Infinity) - (firstFlow.get(y.id) ?? Infinity) || cmp(x.name || '', y.name || '') || cmp(x.id, y.id));
  const lanes = model.lanes.map(l => ({ ...l, nodes: [...l.nodes].sort((x, y) => pos.get(x) - pos.get(y)) }));
  return { model: { ...model, nodes, lanes, flows, boundaries }, rank: a.rank };
}

// For layoutGeometry(): the raw positions in the form it reads today.
export const rawOf = (model, rank) => ({ nodes: Object.fromEntries(model.nodes.map(n => [n.key, { cx: rank[n.key] }])) });
