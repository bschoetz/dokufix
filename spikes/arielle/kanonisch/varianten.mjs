// The canonical orders under test, each a function model → model with its lists sorted anew. The lanes and pools
// keep their order (they are the picture's top-to-bottom order); lane.nodes is sorted like the nodes.
//   nodes:   col      arielle's column, then lane, then name, then id (check/canon.mjs)
//            ranked   the order arielle gave the ranks in (generation by generation, main way first)
//            dfs      the order arielle's depth-first search reached the nodes (path first)
//            lanecol  lane, then column, then ranked (the author's view: top to bottom, left to right)
//            colrank  column, then lane, then ranked
//            xml      unchanged
//   flows:   ends     the position of the source, then of the target, then name, then id (check/canon.mjs)
//            ahead    the position of the source, then arielle's order of the ways out of it, then name, then id
//            dfs      the order arielle's depth-first search walked the flows
//            target   the position of the target, then of the source, then name, then id
//            xml      unchanged
//   rest:    id       boundaries by host position, name, id; messages, notes, associations by id (check/canon.mjs)
//            host     boundaries by host position, then as in the XML; the others unchanged
//            xml      unchanged
import { arielleOrder } from './arielle-order.mjs';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const NODE_ORDERS = ['xml', 'col', 'ranked', 'dfs', 'lanecol', 'colrank'];
export const FLOW_ORDERS = ['xml', 'ends', 'ahead', 'dfs', 'target'];
export const REST_ORDERS = ['xml', 'id', 'host'];

export function canonicalWith(model, { nodes: no = 'col', flows: fo = 'ends', rest: ro = 'id' } = {}){
  const a = arielleOrder(model), byId = new Map(model.nodes.map(n => [n.id, n]));
  const hostOf = new Map((model.boundaries || []).map(b => [b.id, b.host]));
  const own = id => hostOf.get(id) ?? id;
  const col = id => a.rank[byId.get(own(id)).key];
  const lane = id => a.laneOf(own(id));
  const rankedPos = new Map(a.ranked.map((id, i) => [id, i])), dfsPos = new Map(a.dfs.map((id, i) => [id, i]));
  const xmlPos = new Map(model.nodes.map((n, i) => [n.id, i]));
  const nodeKey = {
    xml: (p, q) => xmlPos.get(p.id) - xmlPos.get(q.id),
    col: (p, q) => col(p.id) - col(q.id) || lane(p.id) - lane(q.id) || cmp(p.name || '', q.name || '') || cmp(p.id, q.id),
    ranked: (p, q) => rankedPos.get(p.id) - rankedPos.get(q.id),
    dfs: (p, q) => dfsPos.get(p.id) - dfsPos.get(q.id),
    lanecol: (p, q) => lane(p.id) - lane(q.id) || col(p.id) - col(q.id) || rankedPos.get(p.id) - rankedPos.get(q.id),
    colrank: (p, q) => col(p.id) - col(q.id) || lane(p.id) - lane(q.id) || rankedPos.get(p.id) - rankedPos.get(q.id),
  }[no];
  const nodes = [...model.nodes].sort(nodeKey), pos = new Map(nodes.map((n, i) => [n.id, i]));
  const p = id => pos.get(own(id));
  const flowKey = {
    xml: () => 0,
    ends: (f, g) => p(f.from) - p(g.from) || p(f.to) - p(g.to) || cmp(f.name || '', g.name || '') || cmp(f.id, g.id),
    ahead: (f, g) => p(f.from) - p(g.from) || a.ahead(f, g) || cmp(f.name || '', g.name || '') || cmp(f.id, g.id),
    dfs: (f, g) => a.edgeSeq.get(f) - a.edgeSeq.get(g),
    target: (f, g) => p(f.to) - p(g.to) || p(f.from) - p(g.from) || cmp(f.name || '', g.name || '') || cmp(f.id, g.id),
  }[fo];
  const byIdKey = (x, y) => cmp(x.id || '', y.id || '');
  const boundaries = model.boundaries || [];
  const rest = {
    xml: { boundaries, messages: model.messages, notes: model.notes, associations: model.associations },
    id: { boundaries: [...boundaries].sort((x, y) => p(x.host) - p(y.host) || cmp(x.name || '', y.name || '') || cmp(x.id, y.id)),
      messages: [...(model.messages || [])].sort(byIdKey), notes: [...(model.notes || [])].sort(byIdKey), associations: [...(model.associations || [])].sort(byIdKey) },
    host: { boundaries: [...boundaries].sort((x, y) => p(x.host) - p(y.host)), messages: model.messages, notes: model.notes, associations: model.associations },
  }[ro];
  return { ...model, nodes, lanes: model.lanes.map(l => ({ ...l, nodes: [...l.nodes].sort((x, y) => pos.get(x) - pos.get(y)) })), flows: [...model.flows].sort(flowKey), ...rest };
}

// The variants by name: "nodes/flows/rest".
export const nameOf = o => [o.nodes, o.flows, o.rest].join('/');
export const parse = name => { const [nodes, flows, rest] = name.split('/'); return { nodes, flows, rest }; };
