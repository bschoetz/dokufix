// --- BPMN without coordinates ------------------------------------------------
// A fenced `bpmn` block whose XML holds only the process (lanes, steps, flows)
// and no diagram part is laid out before bpmn-js draws it. Mermaid is the
// layout engine, not the writing format and not what draws:
//
//   1. readProcess() reads the XML into one pool's lanes, flow nodes and
//      sequence flows, or refuses with the reason
//   2. mermaidSource() writes that as Mermaid swimlane-beta text, with ids
//      of its own (n1…, l1…), so that Mermaid never sees the author's ids
//   3. Mermaid renders it off-screen (src/app/bpmn.js, the one part that needs
//      a page); only the positions are taken from its SVG
//   4. layoutGeometry() scales those positions down to BPMN sizes, docks the
//      flows on the smaller symbols, corrects what Mermaid routes untidily
//      and gives the labels their places, in the size the page measures
//      for them (bpmn-js's text renderer) or, without a page, as estimated
//   5. appendDiagram() writes the result as a diagram part (BPMN-DI) into the
//      author's XML, before its closing definitions tag; nothing else changes
//
// Mermaid's picture never reaches the document. bpmn-js draws the XML from
// step 5 exactly as it draws XML that came with coordinates.
//
// What the layout cannot place is left out, and the rest is laid out and
// drawn (Ben, 2026-10-03): boundary events, text annotations, data objects and
// stores, associations, groups, parent lanes of nested lanes, the content of
// a sub-process, and every flow that touches one of them. readProcess() lists
// them; the page names each on the console, not in the document.
//
// Pure logic: no page, no library. The XML comes in as a parsed document; the
// reader walks its elements and compares local names with their prefix taken
// off, because the DOM library of the tests reports "bpmn:laneSet" where a
// browser reports "laneSet", and finds nothing by namespace.
// tests/bpmn-layout.test.mjs runs all of it in Node.
//
// The routing corrections are the spike's (spikes/komponenten-aus-markdown/
// src/bpmn.js), ported with their behaviour; src/README.md, Diagrams, has the
// limits of Mermaid's arrangement.

// The Mermaid version the layout and its checks are made with. src/index.html
// pins the same one; tests/licences.test.mjs fails when the two differ, so a
// newer Mermaid is only taken together with the layout's regression check
// (tests/vergleich.mjs on tests/referenz.md).
export const MERMAID_LAYOUT_VERSION = '12.0.0';

// The distances of 12 px the layout keeps (the geometry, below), each by what
// it is for:
// ATTACH_CLEARANCE  where a flow docks: the piece that leaves its symbol runs
//                   this far before it turns, and an end on a task's side
//                   keeps this far from a corner (attach())
// OBSTACLE_OFFSET   a run moved off a foreign symbol lies this far beside it
//                   (nudge(), detour())
// FAN_ROOM          a flow from a gateway's corner needs this much between the
//                   gateway's middle and its target's side (fanOut())
// NEAR              two parallel runs closer than this read as one (near(),
//                   the conflicts of a ring in loopBack()); an end on a
//                   task's side closer than this to its middle docks at the
//                   middle (attach())
// SPAN_TOLERANCE    the spans of two rings closer than this count as
//                   overlapping, and the rings take distinct levels (loopBack())
// RING_CLEARANCE    a ring keeps this far from the border with another lane;
//                   nearer, its lane grows (growLane())
// FRAME_MARGIN      every waypoint and label keeps this far from the edge of
//                   the outer lanes and the pool (layoutGeometry())
const ATTACH_CLEARANCE = 12, OBSTACLE_OFFSET = 12, FAN_ROOM = 12, NEAR = 12, SPAN_TOLERANCE = 12, RING_CLEARANCE = 12, FRAME_MARGIN = 12;
// They stand among the module's first declarations: esbuild writes such a
// constant's value in place of its name only before the first declaration
// that is no such constant, and so the built page carries no names for them.

// The reasons a laid-out diagram is refused, the detail of the BPMN warning.
export const LAYOUT_SEVERAL_POOLS = 'Mehrere Pools lassen sich ohne Koordinaten noch nicht anordnen.';
export const LAYOUT_NOTHING = 'Das BPMN-XML enthält kein Element, das sich anordnen lässt.';
export function layoutStrayText(ids){
  return 'Diese Elemente liegen in keiner Bahn: ' + ids.join(', ') + '.';
}

// Local name of an element, its prefix taken off: "laneSet" for <bpmn:laneSet>.
const local = el => String(el.localName || el.nodeName || '').replace(/^.*:/, '');
const kids = el => Array.from(el.children || []);
const attr = (el, name) => (el && el.getAttribute(name)) || '';
function descendants(el){
  const out = [];
  for (const k of kids(el)){ out.push(k); out.push(...descendants(k)); }
  return out;
}
const clean = text => String(text || '').replace(/\s+/g, ' ').trim();

// The flow nodes the layout places, by their tag, and the kind it gives each.
function nodeType(tag){
  if (tag === 'startEvent') return 'start';
  if (tag === 'endEvent') return 'end';
  if (tag === 'intermediateCatchEvent' || tag === 'intermediateThrowEvent') return 'inter';
  if (/Gateway$/.test(tag)) return 'gateway';
  if (/^(task|\w+Task|callActivity|subProcess|adHocSubProcess|transaction)$/.test(tag)) return 'task';
  return null;
}
const HOLDS_CONTENT = new Set(['subProcess', 'adHocSubProcess', 'transaction']);
// What a process or a collaboration may hold that the layout leaves out.
const LEFT_OUT = new Set(['boundaryEvent', 'textAnnotation', 'dataObject', 'dataObjectReference', 'dataStoreReference', 'association', 'group', 'messageFlow']);
// What a flow node may hold that is drawn and left out with it.
const LEFT_OUT_INSIDE = new Set(['dataInputAssociation', 'dataOutputAssociation']);

// The process of one pool, read from the parsed XML:
//   { model, leftOut }
//   model: { pool, plane, lanes, nodes, flows }
//     pool:  { id, name } of the participant, or null for a process without one
//     plane: the id the diagram part refers to: the collaboration, or the process
//     lanes: [{ id, name, nodes: [node ids], key, synthetic, hold }]; a
//            synthetic lane gives Mermaid its row and is left out of the
//            diagram part: the one lane holding every node where the process
//            has no lanes, and a lane without an id; hold, the Mermaid id of
//            the stand-in an empty lane holds (h1…)
//     nodes: [{ id, name, type, tag, key }], type one of start, end, inter,
//            gateway, task
//     flows: [{ id, from, to, name }]
//     key:   the id Mermaid gets for it (n1…, l1…)
//   leftOut: [{ id, tag, reason }], in the order of the XML; reason says why,
//            in English, for the console
// null when the document is no BPMN definitions: bpmn-js has its own message
// for that. Throws with the reason where the process cannot be laid out:
// several pools, nothing to place, a node in no lane although lanes exist. A
// pool without a process of its own ends in one of those (epic Boundaries).
export function readProcess(doc){
  const root = doc && doc.documentElement;
  if (!root || local(root) !== 'definitions') return null;
  const all = descendants(root);
  const participants = all.filter(el => local(el) === 'participant');
  const processes = kids(root).filter(el => local(el) === 'process');
  if (participants.length > 1 || processes.length > 1) throw new Error(LAYOUT_SEVERAL_POOLS);
  const participant = participants[0] || null;
  const proc = participant ? processes.find(p => attr(p, 'id') && attr(p, 'id') === attr(participant, 'processRef')) || null : processes[0] || null;
  const collaboration = participant ? participant.parentElement : null;
  const plane = participant ? attr(collaboration, 'id') : attr(proc, 'id');
  if (!proc || !plane) throw new Error(LAYOUT_NOTHING);

  const leftOut = [];
  const leave = (el, reason) => leftOut.push({ id: attr(el, 'id'), tag: local(el), reason });
  if (collaboration) for (const el of kids(collaboration)) if (LEFT_OUT.has(local(el))) leave(el, 'not laid out');

  const nodes = [];
  for (const el of kids(proc)){
    const tag = local(el), type = nodeType(tag), id = attr(el, 'id');
    if (type && id){
      nodes.push({ id, name: clean(attr(el, 'name')), type, tag, key: 'n' + (nodes.length + 1) });
      // A sub-process is drawn as one symbol; what it holds is left out.
      if (HOLDS_CONTENT.has(tag)){
        for (const inner of descendants(el)) if (attr(inner, 'id') && (nodeType(local(inner)) || LEFT_OUT.has(local(inner)) || local(inner) === 'sequenceFlow')) leave(inner, 'inside the sub-process ' + id);
      }
      for (const inner of descendants(el)) if (LEFT_OUT_INSIDE.has(local(inner))) leave(inner, 'not laid out');
    } else if (type) leave(el, 'has no id');
    else if (LEFT_OUT.has(tag)) leave(el, 'not laid out');
  }
  if (!nodes.length) throw new Error(LAYOUT_NOTHING);
  const byId = new Map(nodes.map(n => [n.id, n]));

  // The lanes, nested ones included; only those without lanes inside are laid
  // out, each node in the first that names it. A node only an outer lane
  // names stands in that lane's first inner one. A lane without an id keeps
  // its row and is not drawn.
  const allLanes = kids(proc).filter(el => local(el) === 'laneSet').flatMap(set => descendants(set).filter(el => local(el) === 'lane'));
  const placed = new Set();
  const lanes = [], laneOf = new Map();
  const refsOf = el => kids(el).filter(k => local(k) === 'flowNodeRef').map(k => k.textContent.trim()).filter(id => byId.has(id) && !placed.has(id));
  const outer = el => descendants(el).some(inner => local(inner) === 'lane');
  for (const el of allLanes){
    if (outer(el)){ leave(el, 'a lane with lanes inside'); continue; }
    const refs = refsOf(el);
    refs.forEach(id => placed.add(id));
    if (!attr(el, 'id')) leave(el, 'has no id; its row is laid out, the lane is not drawn');
    const lane = { id: attr(el, 'id'), name: clean(attr(el, 'name')), nodes: refs, key: 'l' + (lanes.length + 1), synthetic: !attr(el, 'id') };
    lanes.push(lane);
    laneOf.set(el, lane);
  }
  for (const el of allLanes){
    const first = outer(el) && descendants(el).find(inner => laneOf.has(inner));
    if (!first) continue;
    const refs = refsOf(el);
    refs.forEach(id => placed.add(id));
    laneOf.get(first).nodes.push(...refs);
  }
  if (lanes.length){
    const stray = nodes.filter(n => !placed.has(n.id));
    if (stray.length) throw new Error(layoutStrayText(stray.map(n => n.id)));
  } else lanes.push({ id: '', name: participant ? clean(attr(participant, 'name')) : '', nodes: nodes.map(n => n.id), key: 'l1', synthetic: true });
  // An empty lane holds a stand-in for Mermaid, or Mermaid draws it as a strip
  // of its own; the stand-in keeps the lane's row and is not drawn.
  for (const l of lanes) if (!l.nodes.length) l.hold = 'h' + l.key.slice(1);

  const flows = [];
  for (const el of kids(proc)){
    if (local(el) !== 'sequenceFlow') continue;
    const from = attr(el, 'sourceRef'), to = attr(el, 'targetRef');
    // Mermaid's swimlane layout fails on a flow from a node to itself.
    if (from === to && byId.has(from) && attr(el, 'id')) leave(el, 'a flow from a node to itself');
    else if (byId.has(from) && byId.has(to) && attr(el, 'id')) flows.push({ id: attr(el, 'id'), from, to, name: clean(attr(el, 'name')) });
    else leave(el, !attr(el, 'id') ? 'has no id' : 'touches ' + [...new Set([from, to].filter(id => !byId.has(id)))].join(' and ') + ', which is not laid out');
  }
  // A participant without an id gets no pool shape.
  if (participant && !attr(participant, 'id')) leave(participant, 'has no id; it is not drawn as a pool');
  return { model: { pool: participant && attr(participant, 'id') ? { id: attr(participant, 'id'), name: clean(attr(participant, 'name')) } : null, plane, lanes, nodes, flows }, leftOut };
}

// One line per left-out element for the console.
export function leftOutLine(item){
  return item.tag + ' ' + (item.id || '(no id)') + ': ' + item.reason;
}

// The model as Mermaid swimlane-beta text, left to right: a subgraph per lane
// with its nodes, then the flows. Every id is Mermaid's own (n1…, l1…), so
// ids such as "end", "subgraph" or "1" never reach Mermaid's parser; labels
// lose what could end a quoted label or start an entity or a Markdown string.
export function mermaidSource(model){
  const q = text => '"' + (clean(String(text).replace(/["<>&#`\\]/g, ' ')) || ' ') + '"';
  const byId = new Map(model.nodes.map(n => [n.id, n]));
  const shape = n => n.key + (n.type === 'task' ? '[' + q(n.name) + ']' : n.type === 'gateway' ? '{' + q(n.name || '+') + '}' : '((' + q(n.name) + '))');
  return 'swimlane-beta LR\n' +
    model.lanes.map(l => '  subgraph ' + l.key + '[' + q(l.name) + ']\n' + l.nodes.map(id => '    ' + shape(byId.get(id)) + '\n').join('') +
      (l.hold ? '    ' + l.hold + '[" "]\n' : '') + '  end\n').join('') +
    model.flows.map(f => '  ' + byId.get(f.from).key + ' -->' + (f.name ? '|' + q(f.name) + '|' : '') + ' ' + byId.get(f.to).key + '\n').join('');
}

// ---------- the geometry ----------
// BPMN sizes, as a modeler draws them.
const SIZE = { task: [120, 80], gateway: [50, 50], start: [36, 36], end: [36, 36], inter: [36, 36] };
// The width a column with an event keeps, for the label below it.
const EVENT_LABEL = 84;
// The width of a pool's head in bpmn-js.
const HEAD = 30;
const R = n => Math.round(n);

// Mermaid decides the arrangement, the layout the sizes: Mermaid's nodes are
// large (text in a circle, wide boxes), BPMN symbols small. The axis is
// scaled piecewise linearly: each column to the size of its largest BPMN
// symbol, each gap to a fixed range. Orders and right angles are kept.
// items: [{ lo, hi, size }] along one axis. Returns the map of a coordinate.
export function axisMap(items, minGap, maxGap){
  const ranks = [];
  for (const it of [...items].sort((a, b) => a.lo - b.lo)){
    const last = ranks[ranks.length - 1];
    if (last && it.lo < last.hi - 1){ last.hi = Math.max(last.hi, it.hi); last.size = Math.max(last.size, it.size); }
    else ranks.push({ lo: it.lo, hi: it.hi, size: it.size });
  }
  let cur = ranks[0].lo;
  ranks.forEach((r, i) => {
    r.nlo = cur; r.nhi = cur + r.size;
    const next = ranks[i + 1];
    if (next) cur = r.nhi + Math.min(maxGap, Math.max(minGap, (next.lo - r.hi) * 0.6));
  });
  return v => {
    const first = ranks[0], last = ranks[ranks.length - 1];
    if (v <= first.lo) return first.nlo - (first.lo - v);
    if (v >= last.hi) return last.nhi + (v - last.hi);
    for (let i = 0; i < ranks.length; i++){
      const r = ranks[i], n = ranks[i + 1];
      if (v <= r.hi) return r.nlo + (v - r.lo) / (r.hi - r.lo || 1) * (r.nhi - r.nlo);
      if (v < n.lo) return r.nhi + (v - r.hi) / (n.lo - r.hi) * (n.nlo - r.nhi);
    }
    return v;
  };
}

// Brings one end of a flow to its BPMN symbol (c: { cx, cy, w, h, task }). A
// circle and a diamond are met on their axis, a task anywhere on its side;
// an end Mermaid docked closer than NEAR to the middle of a task's side
// docks at the middle, where an offset of a few pixels would give a small
// step and a run beside another flow's.
// side: where the end ran beside its node in Mermaid's unscaled positions;
// then the flow docks from that side with a short stub, instead of being
// pulled through the symbol and its neighbours in the same column. A slanted
// end piece (Mermaid ends a flow on a diamond's slanted side, and draws a
// flow back as a diagonal) docks on the side that faces the point before it,
// with a corner put in, so that the piece is horizontal or vertical; a flow
// of two points, a diagonal from end to end, gets two corners halfway, so
// that neither lies in the symbol at the other end. The piece that leaves
// the symbol keeps ATTACH_CLEARANCE before the flow turns: a run Mermaid
// laid just beside its own, larger node lies on the edge of the BPMN symbol
// once scaled, or inside it; the run moves that far off the side, the other
// end left where it is.
export function attach(pts, atStart, c, side){
  const i = atStart ? 0 : pts.length - 1, j = atStart ? 1 : pts.length - 2, k = atStart ? 2 : pts.length - 3;
  const p = pts[i], q = pts[j];
  const ins = (...extra) => pts.splice(atStart ? 1 : pts.length - 1, 0, ...(atStart ? extra : extra.reverse()));
  const aim = (v, mid, half) => c.task && Math.abs(v - mid) >= NEAR ? Math.min(mid + half - ATTACH_CLEARANCE, Math.max(mid - half + ATTACH_CLEARANCE, v)) : mid;
  const dock = pt => pts.splice(atStart ? 0 : pts.length, 0, pt);
  // The end and its neighbour are read anew: ins() may have put corners in.
  const clear = (axis, dir) => {
    if (pts.length < 3) return;
    const e = atStart ? 0 : pts.length - 1, j = atStart ? 1 : pts.length - 2;
    const edge = pts[e][axis], need = edge + dir * ATTACH_CLEARANCE, run = pts[j][axis];
    if ((run - need) * dir >= 0) return;
    for (let n = j; n > 0 && n < pts.length - 1 && Math.abs(pts[n][axis] - run) < 0.5; n += atStart ? 1 : -1) pts[n][axis] = need;
  };
  if (!side && Math.abs(p.x - q.x) >= 1 && Math.abs(p.y - q.y) >= 1){
    const dx = (q.x - c.cx) / (c.w / 2), dy = (q.y - c.cy) / (c.h / 2);
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return;                // the point before lies in the symbol
    const diagonal = pts.length === 2;
    if (Math.abs(dx) > 1 && (Math.abs(dy) <= 1 || Math.abs(dx) >= Math.abs(dy))){
      const y = aim(q.y, c.cy, c.h / 2);
      p.x = c.cx + Math.sign(dx) * c.w / 2; p.y = y;
      const mx = (p.x + q.x) / 2;
      if (Math.abs(y - q.y) >= 1) ins(...(diagonal ? [{ x: mx, y }, { x: mx, y: q.y }] : [{ x: q.x, y }]));
    } else {
      const x = aim(q.x, c.cx, c.w / 2);
      p.x = x; p.y = c.cy + Math.sign(dy) * c.h / 2;
      const my = (p.y + q.y) / 2;
      if (Math.abs(x - q.x) >= 1) ins(...(diagonal ? [{ x, y: my }, { x: q.x, y: my }] : [{ x, y: q.y }]));
    }
    return;
  }
  if (side && side.axis === 'x'){ p.x = q.x = c.cx + side.sign * (c.w / 2 + ATTACH_CLEARANCE); p.y = c.cy; dock({ x: c.cx + side.sign * c.w / 2, y: c.cy }); return; }
  if (side && side.axis === 'y'){ p.y = q.y = c.cy + side.sign * (c.h / 2 + ATTACH_CLEARANCE); p.x = c.cx; dock({ x: c.cx, y: c.cy + side.sign * c.h / 2 }); return; }
  // An end piece beside the symbol keeps ATTACH_CLEARANCE from its side, as one docked by side does: Mermaid runs it a pixel off.
  if (Math.abs(p.x - q.x) < 1 && Math.abs(p.x - c.cx) > c.w / 2 + 0.5){
    const sign = Math.sign(p.x - c.cx);
    p.x = q.x = c.cx + sign * Math.max(Math.abs(p.x - c.cx), c.w / 2 + ATTACH_CLEARANCE); p.y = c.cy; dock({ x: c.cx + sign * c.w / 2, y: c.cy }); return;
  }
  if (Math.abs(p.y - q.y) < 1 && Math.abs(p.y - c.cy) > c.h / 2 + 0.5){
    const sign = Math.sign(p.y - c.cy);
    p.y = q.y = c.cy + sign * Math.max(Math.abs(p.y - c.cy), c.h / 2 + ATTACH_CLEARANCE); p.x = c.cx; dock({ x: c.cx, y: c.cy + sign * c.h / 2 }); return;
  }
  if (Math.abs(p.x - q.x) < 1){                                   // a vertical end
    const dir = Math.sign(q.y - c.cy) || 1, tx = aim(p.x, c.cx, c.w / 2);
    if (Math.abs(p.x - tx) > 1){
      if (pts[k] && Math.abs(pts[k].y - q.y) < 1) q.x = tx;          // the piece before runs across: move the end
      else { const my = (p.y + q.y) / 2; ins({ x: tx, y: my }, { x: q.x, y: my }); }
    }
    p.x = tx; p.y = c.cy + dir * c.h / 2;
    clear('y', dir);
  } else if (Math.abs(p.y - q.y) < 1){                            // a horizontal end
    const dir = Math.sign(q.x - c.cx) || 1, ty = aim(p.y, c.cy, c.h / 2);
    if (Math.abs(p.y - ty) > 1){
      if (pts[k] && Math.abs(pts[k].x - q.x) < 1) q.y = ty;
      else { const mx = (p.x + q.x) / 2; ins({ x: mx, y: ty }, { x: mx, y: q.y }); }
    }
    p.y = ty; p.x = c.cx + dir * c.w / 2;
    clear('x', dir);
  }
}

// Correction 1. Mermaid routes flows past its own, larger nodes. Once scaled,
// an inner piece of a flow can lie on or in a foreign symbol; it moves beside
// that symbol's nearest side. obstacles: [{ x1, y1, x2, y2 }].
export function nudge(pts, obstacles){
  for (let i = 1; i < pts.length - 2; i++){
    const a = pts[i], b = pts[i + 1];
    if (Math.abs(a.x - b.x) < 1){
      const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
      for (const o of obstacles) if (a.x > o.x1 - 8 && a.x < o.x2 + 8 && hi > o.y1 && lo < o.y2) a.x = b.x = (a.x - o.x1 < o.x2 - a.x) ? o.x1 - OBSTACLE_OFFSET : o.x2 + OBSTACLE_OFFSET;
    } else if (Math.abs(a.y - b.y) < 1){
      const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
      for (const o of obstacles) if (a.y > o.y1 - 8 && a.y < o.y2 + 8 && hi > o.x1 && lo < o.x2) a.y = b.y = (a.y - o.y1 < o.y2 - a.y) ? o.y1 - OBSTACLE_OFFSET : o.y2 + OBSTACLE_OFFSET;
    }
  }
}

// Correction 2. Mermaid likes to run a flow just inside the side of a
// neighbouring node. Where an end piece runs through a foreign symbol that
// way, the flow docks from the side instead and runs outside both.
export function detour(pts, atStart, c, obstacles){
  if (pts.length < 3) return;
  const p = pts[atStart ? 0 : pts.length - 1], q = pts[atStart ? 1 : pts.length - 2];
  const dock = pt => pts.splice(atStart ? 0 : pts.length, 0, pt);
  if (Math.abs(p.x - q.x) < 1){
    const lo = Math.min(p.y, q.y), hi = Math.max(p.y, q.y);
    const hit = obstacles.filter(o => p.x > o.x1 - 2 && p.x < o.x2 + 2 && hi > o.y1 && lo < o.y2);
    if (!hit.length) return;
    const sign = p.x >= c.cx ? 1 : -1;
    const x = sign > 0 ? Math.max(c.cx + c.w / 2, ...hit.map(o => o.x2)) + OBSTACLE_OFFSET : Math.min(c.cx - c.w / 2, ...hit.map(o => o.x1)) - OBSTACLE_OFFSET;
    p.x = q.x = x; p.y = c.cy; dock({ x: c.cx + sign * c.w / 2, y: c.cy });
  } else if (Math.abs(p.y - q.y) < 1){
    const lo = Math.min(p.x, q.x), hi = Math.max(p.x, q.x);
    const hit = obstacles.filter(o => p.y > o.y1 - 2 && p.y < o.y2 + 2 && hi > o.x1 && lo < o.x2);
    if (!hit.length) return;
    const sign = p.y >= c.cy ? 1 : -1;
    const y = sign > 0 ? Math.max(c.cy + c.h / 2, ...hit.map(o => o.y2)) + OBSTACLE_OFFSET : Math.min(c.cy - c.h / 2, ...hit.map(o => o.y1)) - OBSTACLE_OFFSET;
    p.y = q.y = y; p.x = c.cx; dock({ x: c.cx, y: c.cy + sign * c.h / 2 });
  }
}

// Correction 3. Mermaid offsets flows that share a port by a few pixels; once
// scaled, steps of 1 to 5 px are left. They are smoothed without moving the
// ends of the flow, and points on a straight line go.
export function tidy(pts){
  const same = (a, b, k) => Math.abs(a[k] - b[k]) < 0.5;
  for (let i = 0; i < pts.length - 1; i++){
    const a = pts[i], b = pts[i + 1];
    const k = same(a, b, 'y') ? 'x' : same(a, b, 'x') ? 'y' : null;        // the axis the step lies on
    if (!k || Math.abs(a[k] - b[k]) > 5 || same(a, b, k)) continue;
    let hi = i + 1, lo = i;
    while (hi + 1 < pts.length && same(pts[hi + 1], b, k)) hi++;
    while (lo > 0 && same(pts[lo - 1], a, k)) lo--;
    if (hi < pts.length - 1){ const v = a[k]; for (let j = i + 1; j <= hi; j++) pts[j][k] = v; }
    else if (lo > 0){ const v = b[k]; for (let j = lo; j <= i; j++) pts[j][k] = v; }
  }
  for (let i = pts.length - 2; i > 0; i--){
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    if ((same(a, b, 'x') && same(b, c, 'x')) || (same(a, b, 'y') && same(b, c, 'y'))) pts.splice(i, 1);
  }
}

// Consecutive points closer than a pixel on both axes become one, the
// threshold attach() reads an end's axis by: a stub Mermaid draws 1.2 px long
// is 0.7 px once scaled, and would be read as a vertical end. A flow keeps
// at least its two ends. inner: of a pair at an end the inner point stays,
// which carries the direction of the piece after it (before docking, when
// the end is placed anew); otherwise the end stays.
export function dedupe(pts, inner = false){
  for (let i = pts.length - 1; i > 0 && pts.length > 2; i--){
    if (Math.abs(pts[i].x - pts[i - 1].x) >= 1 || Math.abs(pts[i].y - pts[i - 1].y) >= 1) continue;
    pts.splice(i === pts.length - 1 ? (inner ? i : i - 1) : (i === 1 && inner ? 0 : i), 1);
  }
}

// A point on one line with its two neighbours but outside them, a way out
// and back: it adds nothing to the route, and as an end's neighbour it is
// read as the end's direction. Mermaid starts a flow with 20 px on the far
// side of a diamond, the side then read to dock on, and runs out and back on
// a detour. Each such point goes; the ends stay.
export function unfold(pts){
  for (let i = pts.length - 2; i > 0 && pts.length > 2; i--){
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const back = (u, v) => Math.abs(a[v] - b[v]) < 0.5 && Math.abs(b[v] - c[v]) < 0.5 && (b[u] - a[u]) * (c[u] - b[u]) < 0;
    if (back('x', 'y') || back('y', 'x')){ pts.splice(i, 1); if (i < pts.length - 1) i++; }
  }
}

// The last safeguard for right angles: a slanted piece gets a corner, so
// that it goes on in the direction of the piece before it (the first piece:
// leaves its end as it would dock). Then doubled points and points between
// two others on a line go.
export function orthogonal(pts){
  for (let i = 0; i < pts.length - 1; i++){
    const a = pts[i], b = pts[i + 1];
    if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) continue;
    const before = pts[i - 1], horizontal = before ? Math.abs(before.y - a.y) < 0.5 : Math.abs(a.x - b.x) >= Math.abs(a.y - b.y);
    pts.splice(i + 1, 0, horizontal ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
  }
  dedupe(pts);
  const line = (a, b, c) => (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) || (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5);
  for (let i = pts.length - 2; i > 0; i--) if (line(pts[i - 1], pts[i], pts[i + 1])) pts.splice(i, 1);
}

// The side a flow leaves by: 'x+', 'x-', 'y+', 'y-', or '' for a slanted start.
export const exitSide = pts => Math.abs(pts[0].y - pts[1].y) < 0.5 ? (pts[1].x > pts[0].x ? 'x+' : 'x-') : Math.abs(pts[0].x - pts[1].x) < 0.5 ? (pts[1].y > pts[0].y ? 'y+' : 'y-') : '';
const blocked = (a, b, obstacles) => obstacles.some(o => Math.max(a.x, b.x) > o.x1 - 2 && Math.min(a.x, b.x) < o.x2 + 2 && Math.max(a.y, b.y) > o.y1 - 2 && Math.min(a.y, b.y) < o.y2 + 2);

// The ends of the flows at one symbol, read where they lie when asked, in the
// order of routes: [{ r, p, q, out }], the route, its end point at the
// symbol, the point next to it, and whether the flow leaves there. p and q
// are the route's own points: what moves them moves the flow. The corrections
// that ask which ports are used read them here (fanOut(), spreadPorts(),
// loopBack()), each at its own moment and on its own routes.
export function portEnds(routes, id){
  const ends = [];
  for (const r of routes){
    const pts = r.pts;
    if (r.f.from === id) ends.push({ r, p: pts[0], q: pts[1], out: true });
    if (r.f.to === id) ends.push({ r, p: pts[pts.length - 1], q: pts[pts.length - 2], out: false });
  }
  return ends;
}

// Correction 4. Two flows that leave a gateway at the same corner lie on top
// of each other on their first piece. Where one of them turns at once, it
// takes the free corner in its direction instead. And a flow that leaves on
// the side where a flow arrives looks as if it branched before the gateway;
// it starts at the corner in its direction instead, sharing a short piece
// with another flow there if need be. A ring of loopBack() (r.loop) keeps
// its route: rebuilt from its pieces it would run through the row.
// routes: [{ f, pts, obstacles }]; box: node id → { cx, cy, w, h }.
export function fanOut(routes, box, gateways){
  for (const id of gateways){
    const c = box[id], outs = routes.filter(r => r.f.from === id);
    const used = new Set(portEnds(routes, id).map(e => exitSide([e.p, e.q])));
    for (const r of outs){
      const pts = r.pts, side = exitSide(pts);
      if (r.loop || pts.length < 3 || !side || !outs.some(o => o !== r && exitSide(o.pts) === side)) continue;
      const u = side[0], v = u === 'x' ? 'y' : 'x', cu = 'c' + u, cv = 'c' + v, sv = v === 'x' ? 'w' : 'h', su = u === 'x' ? 'w' : 'h';
      if (Math.abs(pts[1][u] - pts[2][u]) > 0.5) continue;                   // the second piece has to turn
      const dir = Math.sign(pts[2][v] - pts[1][v]), corner = v + (dir > 0 ? '+' : '-');
      if (!dir || used.has(corner)) continue;
      const start = { [u]: c[cu], [v]: c[cv] + dir * c[sv] / 2 };
      let next;
      if (pts.length === 3){                                                  // ended in the target from above or below: now from the side
        const t = box[r.f.to], du = Math.sign(pts[1][u] - pts[0][u]), edge = t[cu] - du * t[su] / 2;
        if ((edge - c[cu]) * du < FAN_ROOM) continue;
        next = [start, { [u]: c[cu], [v]: t[cv] }, { [u]: edge, [v]: t[cv] }];
      } else {
        if (Math.abs(pts[2][v] - pts[3][v]) > 0.5) continue;
        next = [start, { [u]: c[cu], [v]: pts[2][v] }, ...pts.slice(3)];
      }
      if (blocked(next[0], next[1], r.obstacles) || blocked(next[1], next[2], r.obstacles)) continue;
      pts.splice(0, pts.length, ...next);
      used.add(corner);
    }
    const arriving = new Set(portEnds(routes, id).filter(e => !e.out).map(e => exitSide([e.p, e.q])));
    for (const r of outs){
      const pts = r.pts, side = exitSide(pts);
      if (r.loop || pts.length < 4 || !side || !arriving.has(side)) continue;
      const u = side[0], v = u === 'x' ? 'y' : 'x', cu = 'c' + u, cv = 'c' + v, sv = v === 'x' ? 'w' : 'h';
      if (Math.abs(pts[1][u] - pts[2][u]) > 0.5) continue;
      const dir = Math.sign(pts[2][v] - pts[1][v]);
      const start = { [u]: c[cu], [v]: c[cv] + dir * c[sv] / 2 }, stem = start[v] + dir * 14;
      if (!dir || (pts[2][v] - stem) * dir <= 0) continue;
      const next = [start, { [u]: c[cu], [v]: stem }, { [u]: pts[1][u], [v]: stem }];
      if (blocked(next[0], next[1], r.obstacles) || blocked(next[1], next[2], r.obstacles) || blocked(next[2], pts[2], r.obstacles)) continue;
      pts.splice(0, 2, ...next);
    }
  }
}

// Correction 5. Where a flow arrives at the same side of a task as another
// leaves it, the two look like one double-headed arrow; the one that can
// move goes aside.
export function spreadPorts(routes, box){
  const ends = [];
  // Ends only meet ends at the same task, so the tasks are read one by one.
  for (const [id, c] of Object.entries(box)) if (c.task) for (const { r, p, q, out } of portEnds(routes, id)){
    const vertical = Math.abs(p.x - q.x) < 1;
    if (!vertical && Math.abs(p.y - q.y) >= 1) continue;
    ends.push({ p, q, c, vertical, out, side: vertical ? (p.y < c.cy ? 'top' : 'bottom') : (p.x < c.cx ? 'left' : 'right'), movable: r.pts.length >= 3 });
  }
  for (const a of ends) for (const b of ends){
    if (a === b || a.c !== b.c || a.side !== b.side || a.out === b.out) continue;
    const va = a.vertical ? a.p.x : a.p.y, vb = b.vertical ? b.p.x : b.p.y;
    if (Math.abs(va - vb) >= 14) continue;
    const m = a.movable ? a : b.movable ? b : null;
    if (!m) continue;
    const other = m === a ? vb : va, mid = m.vertical ? m.c.cx : m.c.cy, half = (m.vertical ? m.c.w : m.c.h) / 2 - 10;
    let v = other + (other <= mid ? 18 : -18);
    v = Math.min(mid + half, Math.max(mid - half, v));
    if (m.vertical) m.p.x = m.q.x = v; else m.p.y = m.q.y = v;
  }
}

// Correction 6, not the spike's. Two flows between the same two nodes:
// Mermaid draws them a few pixels apart, and scaled they lie almost on top of
// each other. Each after the first runs around both nodes instead: the second
// below them, out of the bottom of its source and into the bottom of its
// target, the third above, the fourth further below, and so on; for nodes one
// above the other, right and left. The first level lies 20 px beyond the
// outermost edge of the two nodes and of every symbol of their row within
// the span, each further one 20 px farther. A way that a foreign symbol
// blocks is not taken.
export function separateTwins(routes, box){
  const seen = new Map();
  for (const r of routes){
    const pair = r.f.from + '\u0000' + r.f.to;
    const n = seen.get(pair) || 0;
    seen.set(pair, n + 1);
    if (!n) continue;
    const s = box[r.f.from], t = box[r.f.to], dir = n % 2 ? 1 : -1, ring = 20 * Math.ceil(n / 2);
    const [u, v, su, sv] = Math.abs(s.cx - t.cx) >= 1 ? ['y', 'x', 'h', 'w'] : ['x', 'y', 'w', 'h'];
    const edge = c => c['c' + u] + dir * c[su] / 2;
    const lo = Math.min(s['c' + v], t['c' + v]), hi = Math.max(s['c' + v], t['c' + v]);
    const row = Object.values(box).filter(c => (Math.abs(c['c' + u] - s['c' + u]) < 1 || Math.abs(c['c' + u] - t['c' + u]) < 1) && c['c' + v] + c[sv] / 2 > lo && c['c' + v] - c[sv] / 2 < hi);
    const edges = [s, t, ...row].map(edge);
    const out = dir > 0 ? Math.max(...edges) + ring : Math.min(...edges) - ring;
    const at = (c, w) => ({ [u]: w, [v]: c['c' + v] });
    const next = [at(s, edge(s)), at(s, out), at(t, out), at(t, edge(t))];
    if (next.slice(1).some((q, i) => blocked(next[i], q, r.obstacles))) continue;
    r.pts.splice(0, r.pts.length, ...next);
    r.twin = true;
  }
}

// Two pieces, each horizontal or vertical, that cross or lie on each other.
function meets(a, b, c, d){
  const flat = (p, q) => Math.abs(p.y - q.y) < 0.5;
  const lo = (p, q, k) => Math.min(p[k], q[k]) - 0.5, hi = (p, q, k) => Math.max(p[k], q[k]) + 0.5;
  if (flat(a, b) && flat(c, d)) return Math.abs(a.y - c.y) < 1 && lo(a, b, 'x') < hi(c, d, 'x') && lo(c, d, 'x') < hi(a, b, 'x');
  if (!flat(a, b) && !flat(c, d)) return Math.abs(a.x - c.x) < 1 && lo(a, b, 'y') < hi(c, d, 'y') && lo(c, d, 'y') < hi(a, b, 'y');
  const [h, v] = flat(a, b) ? [[a, b], [c, d]] : [[c, d], [a, b]];
  return v[0].x > lo(h[0], h[1], 'x') && v[0].x < hi(h[0], h[1], 'x') && h[0].y > lo(v[0], v[1], 'y') && h[0].y < hi(v[0], v[1], 'y');
}

// Two parallel pieces that run less than NEAR apart and side by side.
function near(a, b, c, d){
  const flat = (p, q) => Math.abs(p.y - q.y) < 0.5;
  if (flat(a, b) !== flat(c, d)) return false;
  const [u, v] = flat(a, b) ? ['y', 'x'] : ['x', 'y'];
  return Math.abs(a[u] - c[u]) < NEAR && Math.min(a[v], b[v]) < Math.max(c[v], d[v]) && Math.min(c[v], d[v]) < Math.max(a[v], b[v]);
}

// The distance between two levels of flows back on one side of a row,
// measured on a process with many (story 2.20): the smallest at which the
// lines and their labels read apart.
export const LEVEL_STEP = 16;

// Correction 7, not the spike's (story 2.20). A flow back within one row, its
// target left of its source at the same height: Mermaid routes it through
// the row, and scaled it lies on the symbols' edges or ties a knot at its
// gateway. It runs around the row instead: out of the top or the bottom of
// its source, along a level beyond the row's symbols, into the top or the
// bottom of its target.
//   - The level: 20 px beyond the outermost edge of the row's symbols within
//     the flow's span; a flow back on the same side whose span overlaps
//     (less than SPAN_TOLERANCE apart) takes the next level out, LEVEL_STEP
//     farther. The flows back are taken shortest first, so a nested one lies
//     inside; those with disjoint spans share the innermost level. Where a
//     level out, up to three, has fewer conflicts, the ring takes that one.
//   - The side: the one with fewer conflicts at its level (conflictScore());
//     at a tie, the side Mermaid's route kept to (r.loopSide: 1 below, -1
//     above). A way a foreign symbol blocks is not taken.
//   - The ports (portCandidates()): a circle and a diamond on their top or
//     bottom; a task at the middle of the side, or, when another flow docks
//     at the middle, 20 px in from a corner: the one with fewer conflicts, at
//     a tie the one facing the other end.
//   - A twin separateTwins() routed (r.twin) is left as it is; it runs
//     before, so its ring is one of the flows a flow back keeps off.
//   - lanes: the boxes [x, y, w, h] of every lane. A ring that comes closer
//     than RING_CLEARANCE to the border with another lane makes its lane grow
//     there (growLane()). Beyond the outer lanes the growth at the end of
//     layoutGeometry() makes room.
// Returns { up, down }: by how much the lanes grew upwards and downwards.
export function loopBack(routes, box, lanes = []){
  const grown = { up: 0, down: 0 };
  const isBack = r => {
    const s = box[r.f.from], t = box[r.f.to];
    return !r.twin && Math.abs(s.cy - t.cy) < 1 && t.cx + t.w / 2 < s.cx - s.w / 2;
  };
  const back = routes.filter(isBack).sort((p, q) => Math.abs(box[p.f.from].cx - box[p.f.to].cx) - Math.abs(box[q.f.from].cx - box[q.f.to].cx));
  if (!back.length) return grown;
  const fixed = routes.filter(r => !back.includes(r));
  const placed = [];
  for (const r of back){
    const s = box[r.f.from], t = box[r.f.to];
    // The flows a ring keeps off: all but the flows back not yet placed.
    const others = fixed.concat(placed.map(p => p.r));
    const usedAt = id => portEnds(others, id).map(e => e.p);
    const usedS = usedAt(r.f.from), usedT = usedAt(r.f.to);
    let best = null;
    const mermaid = r.loopSide || -1;
    for (const dir of [mermaid, -mermaid]){
      let side = null;
      for (const a of portCandidates(s, dir, t.cx, usedS)) for (const b of portCandidates(t, dir, s.cx, usedT)){
        const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
        const row = Object.values(box).filter(c => Math.abs(c.cy - s.cy) < 1 && c.cx + c.w / 2 > lo && c.cx - c.w / 2 < hi);
        let y = (dir > 0 ? Math.max(...row.map(c => c.cy + c.h / 2)) : Math.min(...row.map(c => c.cy - c.h / 2))) + dir * 20;
        for (const p of placed){
          if (p.dir !== dir || Math.abs(p.cy - s.cy) >= 1 || p.lo >= hi + SPAN_TOLERANCE || lo >= p.hi + SPAN_TOLERANCE) continue;
          y = dir > 0 ? Math.max(y, p.y + LEVEL_STEP) : Math.min(y, p.y - LEVEL_STEP);
        }
        // The level, or up to three farther out where that has fewer conflicts.
        for (let k = 0; k < 4 && !(side && !side.conflicts); k++){
          const out = y + dir * k * LEVEL_STEP, next = [a, { x: a.x, y: out }, { x: b.x, y: out }, b];
          if (next.slice(1).some((q, i) => blocked(next[i], q, r.obstacles))) continue;
          const conflicts = conflictScore(next, others, [[s, a, usedS], [t, b, usedT]]);
          if (!side || conflicts < side.conflicts) side = { next, conflicts, dir, y: out, lo, hi };
        }
      }
      if (side && (!best || side.conflicts < best.conflicts)) best = side;
    }
    if (!best) continue;
    r.pts.splice(0, r.pts.length, ...best.next);
    r.loop = true;
    const ring = { r, dir: best.dir, y: best.y, lo: best.lo, hi: best.hi, cy: s.cy };
    placed.push(ring);
    const need = growLane(ring, lanes, box, routes, placed);
    if (ring.dir > 0) grown.down += need; else grown.up += need;
  }
  return grown;
}

// The ports a ring may take on one side of the symbol c (dir: 1 its bottom,
// -1 its top): the middle; on a task where another flow docks at the middle
// (used: the end points of the other flows at c), 20 px in from either
// corner, the one facing the ring's other end (toward: its x) first.
export function portCandidates(c, dir, toward, used){
  const y = c.cy + dir * c.h / 2;
  if (!c.task || !used.some(p => Math.abs(p.y - y) < 1 && Math.abs(p.x - c.cx) < 14)) return [{ x: c.cx, y }];
  const facing = Math.sign(toward - c.cx) || 1;
  return [facing, -facing].map(sign => ({ x: c.cx + sign * (c.w / 2 - 20), y }));
}

// The conflicts of a ring's way next ([{ x, y }, …]) with the flows others:
// one per piece of another flow it crosses, lies on or runs beside closer
// than NEAR, per piece of its own; and one per port of the ring on a gateway
// or an event that another flow uses. ports: [[c, port, used]], the ring's
// two ends, each with its symbol and the end points of the other flows there.
export function conflictScore(next, others, ports){
  let conflicts = 0;
  for (const o of others) for (let i = 1; i < o.pts.length; i++) for (let j = 1; j < next.length; j++){
    if (meets(next[j - 1], next[j], o.pts[i - 1], o.pts[i]) || near(next[j - 1], next[j], o.pts[i - 1], o.pts[i])) conflicts++;
  }
  for (const [c, p, used] of ports) if (!c.task && used.some(q => Math.abs(q.x - p.x) < 2 && Math.abs(q.y - p.y) < 2)) conflicts++;
  return conflicts;
}

// The lane of a ring grows where the ring comes closer than RING_CLEARANCE
// to the border with another lane: everything beyond the border moves away
// by what the ring needs (the lanes, the symbols in box, the flows' points
// and obstacles, and the levels of the rings placed before). The ring itself
// stays: the lane grows around it. ring: { r, dir, y, cy }, its route, its
// side (1 below the row, -1 above), its level and the row's middle. A ring
// in no lane, or by an outer lane's outer border, grows nothing. Returns by
// how much the lane grew: 0 where it did not.
export function growLane(ring, lanes, box, routes, placed){
  const { r, dir, y, cy } = ring;
  const lane = lanes.find(b => b[1] <= cy && cy <= b[1] + b[3]);
  if (!lane) return 0;
  const border = dir > 0 ? lane[1] + lane[3] : lane[1];
  const beyond = lanes.some(b => b !== lane && Math.abs((dir > 0 ? b[1] : b[1] + b[3]) - border) < 1);
  const need = Math.ceil((y + dir * RING_CLEARANCE - border) * dir);
  if (!beyond || need <= 0) return 0;
  const away = v => (v - border) * dir > 0;
  for (const b of lanes){
    if (b === lane){ b[3] += need; if (dir < 0) b[1] -= need; }
    else if (away(b[1] + b[3] / 2)) b[1] += dir * need;
  }
  for (const c of Object.values(box)) if (away(c.cy)) c.cy += dir * need;
  const moved = new Set(r.pts);
  for (const o of routes){
    for (const p of o.pts) if (away(p.y) && !moved.has(p)){ moved.add(p); p.y += dir * need; }
    for (const ob of o.obstacles || []) if (away((ob.y1 + ob.y2) / 2) && !moved.has(ob)){ moved.add(ob); ob.y1 += dir * need; ob.y2 += dir * need; }
  }
  for (const p of placed) if (p.r !== r && away(p.y)) p.y += dir * need;
  return need;
}

// A label as bpmn-js lays it out: at most 90 px wide, wrapped at blanks,
// 12 px text. Estimated, since no font is measured here: { w, h }. The page
// measures each label as bpmn-js will draw it (src/app/bpmn.js) and keeps
// this estimate for a label it cannot measure; Node keeps it for all.
const CHAR = 6.6, LINE = 15, LABEL_WIDTH = 90;
export function labelSize(text){
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)){
    const next = line ? line + ' ' + word : word;
    if (line && next.length * CHAR > LABEL_WIDTH) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return { w: Math.min(LABEL_WIDTH, Math.max(...lines.map(l => l.length * CHAR), 0)), h: Math.max(1, lines.length) * LINE };
}

// How much a box [x, y, w, h] covers of what a label must keep off: the
// summed area of its overlaps with boxes and with pieces of flows, each
// grown by gap. 0: free.
const segmentBox = (p, q) => [Math.min(p.x, q.x), Math.min(p.y, q.y), Math.abs(p.x - q.x), Math.abs(p.y - q.y)];
function covered(box, avoid, gap = 2){
  let sum = 0;
  for (const b of avoid){
    const w = Math.min(box[0] + box[2], b[0] + b[2] + gap) - Math.max(box[0], b[0] - gap);
    const h = Math.min(box[1] + box[3], b[1] + b[3] + gap) - Math.max(box[1], b[1] - gap);
    if (w > 0 && h > 0) sum += w * h;
  }
  return sum;
}
// The first place nothing covers, or the one covered least.
export function bestPlace(places, avoid){
  let best = places[0], least = Infinity;
  for (const p of places){
    const c = covered(p, avoid);
    if (c === 0) return p;
    if (c < least){ least = c; best = p; }
  }
  return best;
}

// The places a label of a flow may take, in the order they are tried. Behind
// a gateway first right at the exit ("ja", "nein"; a stub shorter than 20 px
// is skipped), otherwise first in the middle of the longest piece; above a
// horizontal piece, right of a vertical one, then on its other side; then
// the middle of every other piece, longest first, both sides. A flow back
// routed around its row (loop) from a gateway starts at the gateway's end of
// its longest piece, its leg, inside the ring first, between the leg and the
// row: beside the stub it would take the corner the gateway's own label
// needs where two flows back leave the gateway. Each [x, y, w, h], the size
// labelSize() estimates, or the size given; bpmn-js centres the text on
// x + w/2, starts it at y and wraps it at 90 px.
export function flowLabelPlaces(pts, text, atGateway, size = labelSize(text), loop = false){
  const { w, h } = size;
  const pieces = pts.slice(1).map((b, i) => ({ a: pts[i], b, len: Math.abs(pts[i].x - b.x) + Math.abs(pts[i].y - b.y) }));
  const places = [];
  // inside: 1 below a horizontal piece first, otherwise above first.
  const beside = (a, b, exit, inside = 0) => {
    if (Math.abs(a.y - b.y) < 1){
      const dir = Math.sign(b.x - a.x) || 1;
      const x = exit ? (dir > 0 ? a.x + 10 : a.x - 10 - w) : (a.x + b.x) / 2 - w / 2;
      const pair = [[R(x), R(a.y - 4 - h), R(w), h], [R(x), R(a.y + 4), R(w), h]];
      places.push(...(inside > 0 ? pair.reverse() : pair));
    } else {
      const dir = Math.sign(b.y - a.y) || 1;
      const y = exit ? (dir > 0 ? a.y + 8 : a.y - 8 - h) : (a.y + b.y) / 2 - h / 2;
      places.push([R(a.x + 6), R(y), R(w), h], [R(a.x - 6 - w), R(y), R(w), h]);
    }
  };
  if (atGateway){
    const first = loop ? pieces.reduce((m, p) => p.len > m.len ? p : m) : pieces.length > 1 && pieces[0].len < 20 ? pieces[1] : pieces[0];
    beside(first.a, first.b, true, loop ? Math.sign(pts[0].y - first.a.y) : 0);
  }
  for (const piece of [...pieces].sort((x, y) => y.len - x.len)) beside(piece.a, piece.b, false);
  return places;
}

// The label of a flow: the first of flowLabelPlaces() that keeps off avoid
// (boxes [x, y, w, h]: other labels, symbols, pieces of flows), or the one
// covered least.
export function flowLabel(pts, text, atGateway, avoid = [], size = labelSize(text), loop = false){
  return bestPlace(flowLabelPlaces(pts, text, atGateway, size, loop), avoid);
}

// The places a label of an event or a gateway may take, in the order they
// are tried; c: the symbol, size: labelSize(). Below, above, right, left
// (a gateway: above first), then the same farther out, then the four
// corners. Each [x, y, w, h], centred.
export function labelPlaces(c, size, gateway){
  const places = [];
  for (const far of [0, 20]){
    const below = [c.cx - size.w / 2, c.cy + c.h / 2 + 4 + far, size.w, size.h];
    const above = [c.cx - size.w / 2, c.cy - c.h / 2 - 4 - far - size.h, size.w, size.h];
    const right = [c.cx + c.w / 2 + 6 + far, c.cy - size.h / 2, size.w, size.h];
    const left = [c.cx - c.w / 2 - 6 - far - size.w, c.cy - size.h / 2, size.w, size.h];
    places.push(...(gateway ? [above, below, right, left] : [below, above, right, left]));
  }
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]){
    places.push([sx > 0 ? c.cx + c.w / 2 + 2 : c.cx - c.w / 2 - 2 - size.w, sy > 0 ? c.cy + c.h / 2 + 2 : c.cy - c.h / 2 - 2 - size.h, size.w, size.h]);
  }
  return places;
}

// Mermaid's positions as the diagram part's coordinates.
// raw: what Mermaid's SVG says, in its own units:
//   nodes: { key: { cx, cy, w, h } }   the centre and size of each node, and
//                                      of the stand-in of each empty lane
//   lanes: { key: { x1, y1, x2, y2 } } the box of each lane, title included
//   edges: [[{ x, y }, …]]             the points of each flow, in the order of model.flows
// Returns { pool, lanes, nodes, labels, flows, flowLabels }: the pool's box or
// null, and per element id its box [x, y, w, h], its label box, or the
// waypoints of a flow [[x, y], …]. Throws where raw lacks a node, a lane or a
// flow of the model.
// measure: the size { w, h } a label's text takes as bpmn-js draws it; the
// page gives one that asks bpmn-js's text renderer in the document's font
// (src/app/bpmn.js), the tests and anything without a page keep the estimate
// labelSize().
export function layoutGeometry(model, raw, measure = labelSize){
  const rawOf = {};
  for (const n of model.nodes){
    const r = raw.nodes[n.key];
    if (!r) throw new Error('Mermaid hat das Element „' + n.id + '“ nicht angeordnet.');
    const event = n.type === 'start' || n.type === 'end' || n.type === 'inter';
    rawOf[n.id] = { ...r, size: SIZE[n.type], reserveX: event ? EVENT_LABEL : SIZE[n.type][0] };
  }
  const all = Object.values(rawOf);
  const mapX = axisMap(all.map(r => ({ lo: r.cx - r.w / 2, hi: r.cx + r.w / 2, size: r.reserveX })), 36, 70);
  // The stand-in of an empty lane keeps a row of 40 px.
  const holds = model.lanes.filter(l => l.hold && raw.nodes[l.hold]).map(l => raw.nodes[l.hold]);
  const mapY = axisMap(all.map(r => ({ lo: r.cy - r.h / 2, hi: r.cy + r.h / 2, size: r.size[1] }))
    .concat(holds.map(r => ({ lo: r.cy - r.h / 2, hi: r.cy + r.h / 2, size: 40 }))), 36, 70);

  const di = { pool: null, lanes: {}, nodes: {}, labels: {}, flows: {}, flowLabels: {} };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  // Every lane's box, the synthetic ones too, which are not written.
  const laneBox = {};
  for (const l of model.lanes){
    const r = raw.lanes[l.key];
    if (!r) throw new Error('Mermaid hat die Bahn „' + (l.name || l.id) + '“ nicht angeordnet.');
    const a = mapX(r.x1), b = mapY(r.y1), c = mapX(r.x2), d = mapY(r.y2);
    laneBox[l.key] = [R(a), R(b), R(c - a), R(d - b)];
    if (!l.synthetic) di.lanes[l.id] = laneBox[l.key];
    x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d);
  }
  if (model.pool) di.pool = [R(x1 - HEAD), R(y1), R(x2 - x1 + HEAD), R(y2 - y1)];

  const box = {};
  for (const n of model.nodes){
    const r = rawOf[n.id], cx = mapX(r.cx), cy = mapY(r.cy), [w, h] = r.size;
    di.nodes[n.id] = [R(cx - w / 2), R(cy - h / 2), w, h];
    box[n.id] = { cx, cy, w, h, task: n.type === 'task' };
  }
  const rect = c => ({ x1: c.cx - c.w / 2, x2: c.cx + c.w / 2, y1: c.cy - c.h / 2, y2: c.cy + c.h / 2 });

  const routes = [];
  model.flows.forEach((f, i) => {
    const orig = raw.edges[i];
    if (!orig || orig.length < 2) throw new Error('Mermaid hat den Fluss „' + f.id + '“ nicht angeordnet.');
    const beside = (o, o2, r) =>
      Math.abs(o.x - o2.x) < 1 && Math.abs(o.x - r.cx) > r.w / 2 + 0.5 ? { axis: 'x', sign: Math.sign(o.x - r.cx) } :
      Math.abs(o.y - o2.y) < 1 && Math.abs(o.y - r.cy) > r.h / 2 + 0.5 ? { axis: 'y', sign: Math.sign(o.y - r.cy) } : null;
    const sideFrom = beside(orig[0], orig[1], rawOf[f.from]), sideTo = beside(orig[orig.length - 1], orig[orig.length - 2], rawOf[f.to]);
    const pts = orig.map(p => ({ x: mapX(p.x), y: mapY(p.y) }));
    // A point Mermaid gives twice, a stub under a pixel, or a way out and
    // back would read as an end of no direction or of the wrong one.
    dedupe(pts, true);
    unfold(pts);
    attach(pts, true, box[f.from], sideFrom);
    attach(pts, false, box[f.to], sideTo);
    const obstacles = model.nodes.filter(n => n.id !== f.from && n.id !== f.to).map(n => rect(box[n.id]));
    detour(pts, true, box[f.from], obstacles);
    detour(pts, false, box[f.to], obstacles);
    nudge(pts, obstacles);
    tidy(pts);
    // The side of the row Mermaid's route keeps to: where its farthest point lies.
    const rc = rawOf[f.from].cy, far = orig.reduce((m, p) => Math.abs(p.y - rc) > Math.abs(m) ? p.y - rc : m, 0);
    routes.push({ f, pts, obstacles, loopSide: far > 0 ? 1 : -1 });
  });
  // The twins first, so that a flow back keeps off their rings; a twin
  // routed there is no flow back of loopBack()'s. A middle lane a flow back
  // needs room in grows, and what lies beyond it moves.
  separateTwins(routes, box);
  const grown = loopBack(routes, box, model.lanes.map(l => laneBox[l.key]));
  if (grown.up || grown.down){
    for (const n of model.nodes){ const { cx, cy, w, h } = box[n.id]; di.nodes[n.id] = [R(cx - w / 2), R(cy - h / 2), w, h]; }
    if (di.pool){ di.pool[1] -= grown.up; di.pool[3] += grown.up + grown.down; }
  }
  const gateways = new Set(model.nodes.filter(n => n.type === 'gateway').map(n => n.id));
  fanOut(routes, box, gateways);
  spreadPorts(routes, box);
  for (const { pts } of routes) orthogonal(pts);
  for (const { f, pts } of routes) di.flows[f.id] = pts.map(p => [R(p.x), R(p.y)]);

  // The labels keep off every symbol, every piece of a flow and every label
  // placed before them: first the flows' labels, then those of events and
  // gateways; where every place is taken, the one covered least.
  const segments = routes.flatMap(r => r.pts.slice(1).map((q, i) => segmentBox(r.pts[i], q)));
  const symbols = model.nodes.map(n => di.nodes[n.id]);
  const taken = [];
  for (const { f, pts, loop } of routes){
    if (!f.name) continue;
    // Two flows leaving one corner of a gateway: their labels go to their
    // longest pieces, not both to that corner.
    const alone = !routes.some(o => o.f !== f && o.f.from === f.from && exitSide(o.pts) === exitSide(pts));
    const place = flowLabel(pts, f.name, gateways.has(f.from) && alone, [...symbols, ...segments, ...taken], measure(f.name), !!loop);
    di.flowLabels[f.id] = place;
    taken.push(place);
  }
  for (const n of model.nodes){
    if (n.type === 'task' || !n.name) continue;
    const place = bestPlace(labelPlaces(box[n.id], measure(n.name), n.type === 'gateway'), [...symbols.filter(b => b !== di.nodes[n.id]), ...segments, ...taken]);
    // bpmn-js centres the text on the box: the box is as wide as a label can be.
    const [x, y, w, h] = place;
    di.labels[n.id] = [R(x + w / 2 - LABEL_WIDTH / 2), R(y), LABEL_WIDTH, R(h)];
    taken.push(place);
  }

  // Flows routed around a row, and labels, can lie beyond Mermaid's lanes:
  // the outer lanes and the pool grow until every waypoint and every label
  // lies inside, FRAME_MARGIN from the edge (the top lane up, the bottom lane down,
  // every lane and the pool left and right). The frame is every lane, the
  // synthetic ones included: a lane without an id keeps its row.
  const drawn = model.lanes.filter(l => !l.synthetic).map(l => di.lanes[l.id]);
  if (di.pool || drawn.length){
    const M = FRAME_MARGIN, xs = [], ys = [];
    for (const way of Object.values(di.flows)) for (const [x, y] of way){ xs.push(x); ys.push(y); }
    for (const [x, y, w, h] of taken){ xs.push(x, x + w); ys.push(y, y + h); }
    const frame = model.lanes.map(l => laneBox[l.key]);
    const top = Math.min(...frame.map(b => b[1])), bottom = Math.max(...frame.map(b => b[1] + b[3]));
    const left = Math.min(...frame.map(b => b[0])), right = Math.max(...frame.map(b => b[0] + b[2]));
    const up = Math.max(0, R(top - (Math.min(...ys) - M))), down = Math.max(0, R(Math.max(...ys) + M - bottom));
    const west = Math.max(0, R(left - (Math.min(...xs) - M))), east = Math.max(0, R(Math.max(...xs) + M - right));
    for (const b of frame){
      const atBottom = b[1] + b[3] === bottom;
      if (b[1] === top){ b[1] -= up; b[3] += up; }
      if (atBottom) b[3] += down;
      b[0] -= west; b[2] += west + east;
    }
    if (di.pool){ di.pool[1] -= up; di.pool[3] += up + down; di.pool[0] -= west; di.pool[2] += west + east; }
  }
  return di;
}

// ---------- the diagram part ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The author's XML with the diagram part inserted before its last closing
// definitions tag, whatever its prefix; everything else, and whatever
// follows that tag, stays as written. The BPMNDiagram declares the bpmndi, dc
// and di namespaces itself. Its ids are made unique against every id of the
// XML. di: what layoutGeometry() returned. Returns { xml, diagram }: the XML
// and the id of the inserted BPMNDiagram, which bpmn-js is told to open, since
// it opens the first diagram, and that may be an empty one of the author's.
export function appendDiagram(xml, model, di){
  const text = String(xml);
  // Comments and CDATA sections are blanked out first: a closing tag or an id
  // written in one is not the XML's.
  const masked = text.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, m => ' '.repeat(m.length));
  const closes = [...masked.matchAll(/<\/(?:[\w.-]+:)?definitions\s*>/g)];
  if (!closes.length) throw new Error(LAYOUT_NOTHING);
  const at = closes[closes.length - 1].index;
  const used = new Set([...masked.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map(m => m[1]));
  const fresh = base => { let id = base, n = 2; while (used.has(id)) id = base + '_' + n++; used.add(id); return id; };
  const b = r => '<dc:Bounds x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '"/>';
  const label = r => r ? '<bpmndi:BPMNLabel>' + b(r) + '</bpmndi:BPMNLabel>' : '';
  const shape = (id, r, extra = '', lbl = null) => '      <bpmndi:BPMNShape id="' + esc(fresh(id + '_di')) + '" bpmnElement="' + esc(id) + '"' + extra + '>' + b(r) + label(lbl) + '</bpmndi:BPMNShape>\n';
  const diagram = fresh('dokufix_diagram');
  let out = '  <bpmndi:BPMNDiagram xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="' + esc(diagram) + '">\n' +
    '    <bpmndi:BPMNPlane id="' + esc(fresh('dokufix_plane')) + '" bpmnElement="' + esc(model.plane) + '">\n';
  if (model.pool && di.pool) out += shape(model.pool.id, di.pool, ' isHorizontal="true"');
  for (const l of model.lanes) if (!l.synthetic) out += shape(l.id, di.lanes[l.id], ' isHorizontal="true"');
  for (const n of model.nodes) out += shape(n.id, di.nodes[n.id], n.tag === 'exclusiveGateway' ? ' isMarkerVisible="true"' : '', di.labels[n.id]);
  for (const f of model.flows){
    out += '      <bpmndi:BPMNEdge id="' + esc(fresh(f.id + '_di')) + '" bpmnElement="' + esc(f.id) + '">' +
      di.flows[f.id].map(p => '<di:waypoint x="' + p[0] + '" y="' + p[1] + '"/>').join('') + label(di.flowLabels[f.id]) + '</bpmndi:BPMNEdge>\n';
  }
  out += '    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n';
  return { xml: text.slice(0, at) + out + text.slice(at), diagram };
}
