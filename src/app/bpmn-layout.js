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
//      and gives the labels their places
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
// circle and a diamond are met on their axis, a task anywhere on its side.
// side: where the end ran beside its node in Mermaid's unscaled positions;
// then the flow docks from that side with a short stub, instead of being
// pulled through the symbol and its neighbours in the same column. A slanted
// end piece (Mermaid ends a flow on a diamond's slanted side, and draws a
// flow back as a diagonal) docks on the side that faces the point before it,
// with a corner put in, so that the piece is horizontal or vertical; a flow
// of two points, a diagonal from end to end, gets two corners halfway, so
// that neither lies in the symbol at the other end. The piece that leaves
// the symbol keeps 12 px before the flow turns: a run Mermaid laid just
// beside its own, larger node lies on the edge of the BPMN symbol once
// scaled, or inside it; the run moves 12 px off the side, the other end
// left where it is.
export function attach(pts, atStart, c, side){
  const i = atStart ? 0 : pts.length - 1, j = atStart ? 1 : pts.length - 2, k = atStart ? 2 : pts.length - 3;
  const p = pts[i], q = pts[j];
  const ins = (...extra) => pts.splice(atStart ? 1 : pts.length - 1, 0, ...(atStart ? extra : extra.reverse()));
  const aim = (v, mid, half) => c.task ? Math.min(mid + half - 12, Math.max(mid - half + 12, v)) : mid;
  const dock = pt => pts.splice(atStart ? 0 : pts.length, 0, pt);
  const clear = (axis, dir) => {
    if (pts.length < 3) return;
    const edge = pts[i][axis], need = edge + dir * 12, run = pts[j][axis];
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
  if (side && side.axis === 'x'){ p.x = q.x = c.cx + side.sign * (c.w / 2 + 12); p.y = c.cy; dock({ x: c.cx + side.sign * c.w / 2, y: c.cy }); return; }
  if (side && side.axis === 'y'){ p.y = q.y = c.cy + side.sign * (c.h / 2 + 12); p.x = c.cx; dock({ x: c.cx, y: c.cy + side.sign * c.h / 2 }); return; }
  // An end piece beside the symbol keeps 12 px from its side, as one docked by side does: Mermaid runs it a pixel off.
  if (Math.abs(p.x - q.x) < 1 && Math.abs(p.x - c.cx) > c.w / 2 + 0.5){
    const sign = Math.sign(p.x - c.cx);
    p.x = q.x = c.cx + sign * Math.max(Math.abs(p.x - c.cx), c.w / 2 + 12); p.y = c.cy; dock({ x: c.cx + sign * c.w / 2, y: c.cy }); return;
  }
  if (Math.abs(p.y - q.y) < 1 && Math.abs(p.y - c.cy) > c.h / 2 + 0.5){
    const sign = Math.sign(p.y - c.cy);
    p.y = q.y = c.cy + sign * Math.max(Math.abs(p.y - c.cy), c.h / 2 + 12); p.x = c.cx; dock({ x: c.cx, y: c.cy + sign * c.h / 2 }); return;
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
      for (const o of obstacles) if (a.x > o.x1 - 8 && a.x < o.x2 + 8 && hi > o.y1 && lo < o.y2) a.x = b.x = (a.x - o.x1 < o.x2 - a.x) ? o.x1 - 12 : o.x2 + 12;
    } else if (Math.abs(a.y - b.y) < 1){
      const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
      for (const o of obstacles) if (a.y > o.y1 - 8 && a.y < o.y2 + 8 && hi > o.x1 && lo < o.x2) a.y = b.y = (a.y - o.y1 < o.y2 - a.y) ? o.y1 - 12 : o.y2 + 12;
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
    const x = sign > 0 ? Math.max(c.cx + c.w / 2, ...hit.map(o => o.x2)) + 12 : Math.min(c.cx - c.w / 2, ...hit.map(o => o.x1)) - 12;
    p.x = q.x = x; p.y = c.cy; dock({ x: c.cx + sign * c.w / 2, y: c.cy });
  } else if (Math.abs(p.y - q.y) < 1){
    const lo = Math.min(p.x, q.x), hi = Math.max(p.x, q.x);
    const hit = obstacles.filter(o => p.y > o.y1 - 2 && p.y < o.y2 + 2 && hi > o.x1 && lo < o.x2);
    if (!hit.length) return;
    const sign = p.y >= c.cy ? 1 : -1;
    const y = sign > 0 ? Math.max(c.cy + c.h / 2, ...hit.map(o => o.y2)) + 12 : Math.min(c.cy - c.h / 2, ...hit.map(o => o.y1)) - 12;
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

// Correction 4. Two flows that leave a gateway at the same corner lie on top
// of each other on their first piece. Where one of them turns at once, it
// takes the free corner in its direction instead. And a flow that leaves on
// the side where a flow arrives looks as if it branched before the gateway;
// it starts at the corner in its direction instead, sharing a short piece
// with another flow there if need be.
// routes: [{ f, pts, obstacles }]; box: node id → { cx, cy, w, h }.
export function fanOut(routes, box, gateways){
  for (const id of gateways){
    const c = box[id], outs = routes.filter(r => r.f.from === id);
    const used = new Set(outs.map(r => exitSide(r.pts)));
    routes.filter(r => r.f.to === id).forEach(r => used.add(exitSide([...r.pts].reverse())));
    for (const r of outs){
      const pts = r.pts, side = exitSide(pts);
      if (pts.length < 3 || !side || !outs.some(o => o !== r && exitSide(o.pts) === side)) continue;
      const u = side[0], v = u === 'x' ? 'y' : 'x', cu = 'c' + u, cv = 'c' + v, sv = v === 'x' ? 'w' : 'h', su = u === 'x' ? 'w' : 'h';
      if (Math.abs(pts[1][u] - pts[2][u]) > 0.5) continue;                   // the second piece has to turn
      const dir = Math.sign(pts[2][v] - pts[1][v]), corner = v + (dir > 0 ? '+' : '-');
      if (!dir || used.has(corner)) continue;
      const start = { [u]: c[cu], [v]: c[cv] + dir * c[sv] / 2 };
      let next;
      if (pts.length === 3){                                                  // ended in the target from above or below: now from the side
        const t = box[r.f.to], du = Math.sign(pts[1][u] - pts[0][u]), edge = t[cu] - du * t[su] / 2;
        if ((edge - c[cu]) * du < 12) continue;
        next = [start, { [u]: c[cu], [v]: t[cv] }, { [u]: edge, [v]: t[cv] }];
      } else {
        if (Math.abs(pts[2][v] - pts[3][v]) > 0.5) continue;
        next = [start, { [u]: c[cu], [v]: pts[2][v] }, ...pts.slice(3)];
      }
      if (blocked(next[0], next[1], r.obstacles) || blocked(next[1], next[2], r.obstacles)) continue;
      pts.splice(0, pts.length, ...next);
      used.add(corner);
    }
    const arriving = new Set(routes.filter(r => r.f.to === id).map(r => exitSide([...r.pts].reverse())));
    for (const r of outs){
      const pts = r.pts, side = exitSide(pts);
      if (pts.length < 4 || !side || !arriving.has(side)) continue;
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
  for (const r of routes) for (const atStart of [true, false]){
    const c = box[atStart ? r.f.from : r.f.to];
    if (!c.task) continue;
    const pts = r.pts, p = pts[atStart ? 0 : pts.length - 1], q = pts[atStart ? 1 : pts.length - 2];
    const vertical = Math.abs(p.x - q.x) < 1;
    if (!vertical && Math.abs(p.y - q.y) >= 1) continue;
    ends.push({ p, q, c, vertical, out: atStart, side: vertical ? (p.y < c.cy ? 'top' : 'bottom') : (p.x < c.cx ? 'left' : 'right'), movable: pts.length >= 3 });
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
// above the other, right and left. A way that a foreign symbol blocks is not
// taken.
export function separateTwins(routes, box){
  const seen = new Map();
  for (const r of routes){
    const pair = r.f.from + '\u0000' + r.f.to;
    const n = seen.get(pair) || 0;
    seen.set(pair, n + 1);
    if (!n) continue;
    const s = box[r.f.from], t = box[r.f.to], dir = n % 2 ? 1 : -1, ring = 20 * Math.ceil(n / 2);
    const [u, v, su] = Math.abs(s.cx - t.cx) >= 1 ? ['y', 'x', 'h'] : ['x', 'y', 'w'];
    const edge = c => c['c' + u] + dir * c[su] / 2;
    const out = dir > 0 ? Math.max(edge(s), edge(t)) + ring : Math.min(edge(s), edge(t)) - ring;
    const at = (c, w) => ({ [u]: w, [v]: c['c' + v] });
    const next = [at(s, edge(s)), at(s, out), at(t, out), at(t, edge(t))];
    if (next.slice(1).some((q, i) => blocked(next[i], q, r.obstacles))) continue;
    r.pts.splice(0, r.pts.length, ...next);
  }
}

// A label as bpmn-js lays it out: at most 90 px wide, wrapped at blanks,
// 12 px text. Estimated, since no font is measured here: { w, h }.
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
// the middle of every other piece, longest first, both sides. Each [x, y, w,
// h], the size labelSize() estimates; bpmn-js centres the text on x + w/2,
// starts it at y and wraps it at 90 px.
export function flowLabelPlaces(pts, text, atGateway){
  const { w, h } = labelSize(text);
  const pieces = pts.slice(1).map((b, i) => ({ a: pts[i], b, len: Math.abs(pts[i].x - b.x) + Math.abs(pts[i].y - b.y) }));
  const places = [];
  const beside = (a, b, exit) => {
    if (Math.abs(a.y - b.y) < 1){
      const dir = Math.sign(b.x - a.x) || 1;
      const x = exit ? (dir > 0 ? a.x + 10 : a.x - 10 - w) : (a.x + b.x) / 2 - w / 2;
      places.push([R(x), R(a.y - 4 - h), R(w), h], [R(x), R(a.y + 4), R(w), h]);
    } else {
      const dir = Math.sign(b.y - a.y) || 1;
      const y = exit ? (dir > 0 ? a.y + 8 : a.y - 8 - h) : (a.y + b.y) / 2 - h / 2;
      places.push([R(a.x + 6), R(y), R(w), h], [R(a.x - 6 - w), R(y), R(w), h]);
    }
  };
  if (atGateway){
    const first = pieces.length > 1 && pieces[0].len < 20 ? pieces[1] : pieces[0];
    beside(first.a, first.b, true);
  }
  for (const piece of [...pieces].sort((x, y) => y.len - x.len)) beside(piece.a, piece.b, false);
  return places;
}

// The label of a flow: the first of flowLabelPlaces() that keeps off avoid
// (boxes [x, y, w, h]: other labels, symbols, pieces of flows), or the one
// covered least.
export function flowLabel(pts, text, atGateway, avoid = []){
  return bestPlace(flowLabelPlaces(pts, text, atGateway), avoid);
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
export function layoutGeometry(model, raw){
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
    // A point Mermaid gives twice, or a stub under a pixel, would read as an
    // end of no direction or of the wrong one.
    dedupe(pts, true);
    attach(pts, true, box[f.from], sideFrom);
    attach(pts, false, box[f.to], sideTo);
    const obstacles = model.nodes.filter(n => n.id !== f.from && n.id !== f.to).map(n => rect(box[n.id]));
    detour(pts, true, box[f.from], obstacles);
    detour(pts, false, box[f.to], obstacles);
    nudge(pts, obstacles);
    tidy(pts);
    routes.push({ f, pts, obstacles });
  });
  separateTwins(routes, box);
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
  for (const { f, pts } of routes){
    if (!f.name) continue;
    // Two flows leaving one corner of a gateway: their labels go to their
    // longest pieces, not both to that corner.
    const alone = !routes.some(o => o.f !== f && o.f.from === f.from && exitSide(o.pts) === exitSide(pts));
    const place = flowLabel(pts, f.name, gateways.has(f.from) && alone, [...symbols, ...segments, ...taken]);
    di.flowLabels[f.id] = place;
    taken.push(place);
  }
  for (const n of model.nodes){
    if (n.type === 'task' || !n.name) continue;
    const place = bestPlace(labelPlaces(box[n.id], labelSize(n.name), n.type === 'gateway'), [...symbols.filter(b => b !== di.nodes[n.id]), ...segments, ...taken]);
    // bpmn-js centres the text on the box: the box is as wide as a label can be.
    const [x, y, w, h] = place;
    di.labels[n.id] = [R(x + w / 2 - LABEL_WIDTH / 2), R(y), LABEL_WIDTH, R(h)];
    taken.push(place);
  }

  // Flows routed around a row, and labels, can lie beyond Mermaid's lanes:
  // the outer lanes and the pool grow until every waypoint and every label
  // lies inside, 12 px from the edge (the top lane up, the bottom lane down,
  // every lane and the pool left and right). The frame is every lane, the
  // synthetic ones included: a lane without an id keeps its row.
  const drawn = model.lanes.filter(l => !l.synthetic).map(l => di.lanes[l.id]);
  if (di.pool || drawn.length){
    const M = 12, xs = [], ys = [];
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
