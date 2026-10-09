// --- What changed between two layouts of one process -----------------------
// The measures of tools/bpmn-layout/feedback-auswerten.mjs, moved here with
// story 2.40 so that the layout workbench marks on its canvas what the
// evaluation lists, by the same code: a node in another lane (by its centre
// in a lane's bounds), a node with another order left–right against any
// other node or another row against a node of its lane (each pair counted
// for the node that moved more along that axis; tolerances 30 and 20 px),
// a flow with other waypoints. Pure, for Node and the browser; the model is
// readProcess()'s (src/app/bpmn-layout.js) of the input.
//
// Nothing done on loading.

const attr = (tag, name) => { const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; };

// The diagram part of an XML: { shapes: { id: { id, x, y, w, h, cx, cy } }, flows: { id: [[x, y], …] } }.
export function readDi(xml){
  const shapes = {};
  for (const m of xml.matchAll(/<(?:[\w-]+:)?BPMNShape\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?BPMNShape>/g)){
    const b = /<(?:[\w-]+:)?Bounds\b([^>]*)\/?>/.exec(m[2]);
    if (!b) continue;
    const id = attr(m[1], 'bpmnElement'), x = +attr(b[1], 'x'), y = +attr(b[1], 'y'), w = +attr(b[1], 'width'), h = +attr(b[1], 'height');
    shapes[id] = { id, x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }
  const flows = {};
  for (const m of xml.matchAll(/<(?:[\w-]+:)?BPMNEdge\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?BPMNEdge>/g))
    flows[attr(m[1], 'bpmnElement')] = [...m[2].matchAll(/<(?:[\w-]+:)?waypoint\b([^>]*)\/?>/g)].map(w => [+attr(w[1], 'x'), +attr(w[1], 'y')]);
  return { shapes, flows };
}

// What changed from the layout `erzeugt` to `bearbeitet` (XML or readDi()'s result), for the nodes, lanes and flows
// of `model`:
//   lanes:  [{ id, von, nach }]          nodes in another lane, the lane ids (null: in none)
//   x, y:   [{ id, d, mit: [id, …] }]     nodes with another order left–right, another row in their lane; d the
//                                         shift in px, mit the nodes the relation changed to; most partners first
//   flows:  [{ id, from, to, vor, nach }] flows with other waypoints, vor and nach their bends
export function aenderungen(erzeugt, bearbeitet, model){
  const g = typeof erzeugt === 'string' ? readDi(erzeugt) : erzeugt;
  const e = typeof bearbeitet === 'string' ? readDi(bearbeitet) : bearbeitet;
  const lanes = model.lanes.filter(l => !l.synthetic).map(l => l.id);
  const laneOf = (di, id) => { const s = di.shapes[id]; return (s && lanes.find(l => { const L = di.shapes[l]; return L && s.cy >= L.y && s.cy <= L.y + L.h; })) || null; };
  const ids = model.nodes.map(n => n.id).filter(id => g.shapes[id] && e.shapes[id]);
  const laneMoves = ids.filter(id => laneOf(g, id) !== laneOf(e, id)).map(id => ({ id, von: laneOf(g, id), nach: laneOf(e, id) }));
  const rel = (u, v, tol) => Math.abs(u - v) < tol ? 0 : Math.sign(u - v);
  const moved = { x: new Map(), y: new Map() };
  const blame = (axis, p, q) => {
    const d = id => Math.abs(e.shapes[id]['c' + axis] - g.shapes[id]['c' + axis]);
    const who = d(p) >= d(q) ? p : q, other = who === p ? q : p;
    (moved[axis].get(who) || moved[axis].set(who, []).get(who)).push(other);
  };
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++){
    const p = ids[i], q = ids[j];
    if (rel(g.shapes[p].cx, g.shapes[q].cx, 30) !== rel(e.shapes[p].cx, e.shapes[q].cx, 30)) blame('x', p, q);
    if (laneOf(e, p) && laneOf(e, p) === laneOf(e, q) && rel(g.shapes[p].cy, g.shapes[q].cy, 20) !== rel(e.shapes[p].cy, e.shapes[q].cy, 20)) blame('y', p, q);
  }
  const listOf = axis => [...moved[axis]].sort((u, v) => v[1].length - u[1].length)
    .map(([id, mit]) => ({ id, d: Math.round(e.shapes[id]['c' + axis] - g.shapes[id]['c' + axis]), mit }));
  const bends = pts => Math.max(0, (pts || []).length - 2);
  const flows = model.flows.filter(f => g.flows[f.id] && e.flows[f.id] && JSON.stringify(g.flows[f.id]) !== JSON.stringify(e.flows[f.id]))
    .map(f => ({ id: f.id, from: f.from, to: f.to, vor: bends(g.flows[f.id]), nach: bends(e.flows[f.id]) }));
  return { lanes: laneMoves, x: listOf('x'), y: listOf('y'), flows };
}

// The ids aenderungen() names as changed: the nodes in another lane, order or row, the flows with another route.
export const geaenderteIds = a => new Set([...a.lanes, ...a.x, ...a.y, ...a.flows].map(c => c.id));
