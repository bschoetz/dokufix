// --- BPMN without coordinates ------------------------------------------------
// A fenced `bpmn` block whose XML holds only the process (lanes, steps, flows)
// and no diagram part is laid out before bpmn-js draws it. Mermaid gives the
// order of the columns, not the picture, and is not the writing format:
//
//   1. readProcess() reads the XML into one pool's lanes, flow nodes and
//      sequence flows, or refuses with the reason
//   2. mermaidSource() writes that as Mermaid swimlane-beta text, with ids
//      of its own (n1…, l1…), so that Mermaid never sees the author's ids
//   3. Mermaid renders it off-screen (src/app/bpmn.js, the one part that needs
//      a page); only the positions are taken from its SVG, and the layout
//      reads no more of them than the x of each node's middle
//   4. layoutGeometry() puts the nodes on a grid: Mermaid's columns, the
//      lanes, and rows within each lane. The rules R1–R16 give each node its
//      lane, row and column, a router draws every flow on the grid anew, and
//      the labels get their places, in the size the page measures for them
//      (bpmn-js's text renderer) or, without a page, as estimated
//   5. appendDiagram() writes the result as a diagram part (BPMN-DI) into the
//      author's XML, before its closing definitions tag; a node a rule put in
//      another lane moves there in the lane set too, nothing else changes
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
// The grid, its rules and its router come from spike 2.26 (variant A2, Ben,
// 2026-10-06); src/README.md, Diagrams, describes them.

// The Mermaid version the layout and its checks are made with. src/index.html
// pins the same one; tests/licences.test.mjs fails when the two differ, so a
// newer Mermaid is only taken together with the layout's regression check
// (tests/vergleich.mjs on tests/referenz.md).
export const MERMAID_LAYOUT_VERSION = '12.0.0';

// The distances the layout keeps besides the grid's (below), 12 px but the
// last, each by what it is for:
// ATTACH_CLEARANCE  an end on a task's side keeps this far from a corner
//                   (the ports in finishGrid())
// RING_CLEARANCE    a lane that grows for a label (growLane()) grows until
//                   the label keeps this far less LABEL_GAP from the border
// FRAME_MARGIN      every waypoint and label keeps this far from the edge of
//                   the outer lanes and the pool (finishLabelsAndFrame())
// LABEL_GAP         4 px: a label across the border of its owner's lane with
//                   another lane lies this far inside once that lane has
//                   grown (labelRoom()), as far as a flow's label keeps from
//                   its piece
const ATTACH_CLEARANCE = 12, RING_CLEARANCE = 12, FRAME_MARGIN = 12, LABEL_GAP = 4;
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
  // of its own; the stand-in is not drawn, and the grid gives the lane its row.
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

// Consecutive points closer than a pixel on both axes become one: a corner
// the router puts where two pieces meet at an end. A flow keeps at least its
// two ends. inner: of a pair at an end the inner point stays, which carries
// the direction of the piece after it; otherwise the end stays.
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

// A lane grows where a line comes closer than RING_CLEARANCE to its border
// with another lane: everything beyond the border moves away by what the
// line needs (the lanes, the symbols in box, the flows' points and obstacles,
// and the levels in placed). Its one caller is labelRoom(), which hands it a
// stand-in for the edge of a label (a ring of a flow back once, the name
// stays): ring: { r, dir, y, cy }, r with the points that stay ({ pts: [] }),
// the side (1 the bottom border, -1 the top), the level y and the middle cy
// of the lane it lies in; placed, the levels that move with it ([]). In no
// lane, or by an outer lane's outer border, nothing grows. Returns by how
// much the lane grew: 0 where it did not.
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

// After the labels, not the spike's (story 2.21). A label that lies in no
// lane, across the border of its owner's lane with another lane, makes that
// lane grow there as a ring does (growLane()), until the label lies
// LABEL_GAP inside: everything beyond the border moves away, and the label
// stays beside its owner. Each label moves with its owner: anchor, the
// symbol of an event or a gateway (its box in box, moved by growLane()), or
// for a flow's label the point of its flow nearest the label's middle (a
// point { x, y } of its own, on the piece the label stands beside); the
// owner's lane is the lane that holds the anchor. After each growth every
// other label moves by what its anchor moved, whichever side of the border
// the label lies on, and every label is checked again until none crosses a
// border (a growth can bring a label that lay wholly in the next lane across
// the border that moved), so that the order of the labels does not change
// the result. A label beyond an outer lane's outer border grows nothing
// here: the frame grows afterwards (finishLabelsAndFrame()). labels: [{ boxes,
// anchor }], boxes the arrays [x, y, w, h] that move together, the first
// the label's text, which is checked; lanes: the boxes of every lane.
// Returns { up, down }: by how much the lanes grew upwards and
// downwards.
export function labelRoom(labels, lanes, box, routes){
  const grown = { up: 0, down: 0 };
  if (!lanes.length) return grown;
  const inside = (x, y, l) => x >= l[0] && x <= l[0] + l[2] && y >= l[1] && y <= l[1] + l[3];
  const within = ([x, y, w, h], l) => inside(x, y, l) && inside(x + w, y + h, l);
  const ay = a => 'cy' in a ? a.cy : a.y;
  // The anchors of flow labels move with the flows' points.
  const points = { pts: labels.map(l => l.anchor).filter(a => !('cy' in a)), obstacles: [] };
  // One pass over the labels: whether a lane grew.
  const pass = () => {
    let grew = false;
    for (const l of labels){
      const text = l.boxes[0];
      if (lanes.some(b => within(text, b))) continue;
      for (const dir of [-1, 1]){
        const lane = lanes.find(b => b[1] <= ay(l.anchor) && ay(l.anchor) <= b[1] + b[3]);
        if (!lane) break;
        const [, y, , h] = text, border = dir > 0 ? lane[1] + lane[3] : lane[1], edge = dir > 0 ? y + h : y;
        if ((edge - border) * dir <= 0) continue;
        const before = labels.map(o => ay(o.anchor));
        // growLane() keeps a ring's level RING_CLEARANCE from the border.
        const need = growLane({ r: { pts: [] }, dir, y: edge + dir * (LABEL_GAP - RING_CLEARANCE), cy: lane[1] + lane[3] / 2 }, lanes, box, routes.concat(points), []);
        if (!need) continue;
        grew = true;
        if (dir > 0) grown.down += need; else grown.up += need;
        labels.forEach((o, i) => {
          const moved = ay(o.anchor) - before[i];
          if (moved) for (const b of o.boxes) b[1] += moved;
        });
      }
    }
    return grew;
  };
  // A label once inside its owner's lane stays there, so each grows its lane
  // at most once a side: the passes end.
  for (let n = 0; n <= 2 * labels.length && pass(); n++);
  return grown;
}

// The point of a flow nearest to (x, y): on the nearest of its pieces.
export function nearestOnFlow(pts, x, y){
  let best = null, least = Infinity;
  for (let i = 1; i < pts.length; i++){
    const a = pts[i - 1], b = pts[i];
    const px = Math.min(Math.max(a.x, b.x), Math.max(Math.min(a.x, b.x), x)), py = Math.min(Math.max(a.y, b.y), Math.max(Math.min(a.y, b.y), y));
    const d = Math.hypot(px - x, py - y);
    if (d < least){ least = d; best = { x: px, y: py }; }
  }
  return best;
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
// its leg, the run along its level (its longest horizontal piece: a ring
// from a side corner has a stub before it, and its level may be shorter
// than the piece up to it), inside the ring first, between the leg and the
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
    const level = pieces.filter(p => Math.abs(p.a.y - p.b.y) < 1);
    const first = loop && level.length ? level.reduce((m, p) => p.len > m.len ? p : m) : pieces.length > 1 && pieces[0].len < 20 ? pieces[1] : pieces[0];
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

// The diagram part's coordinates: the nodes on the grid, the flows routed on
// it, the labels placed.
// raw: what Mermaid's SVG says, in its own units; read is only
//   nodes: { key: { cx, … } }   the x of each node's centre: nodes less than
//                               a unit apart share a column, and the columns
//                               keep Mermaid's order; an empty lane's stand-in
//                               is not read, its row is EMPTY_ROW
// Returns { pool, lanes, nodes, labels, flows, flowLabels, laneOf }: the
// pool's box or null, and per element id its box [x, y, w, h], its label box,
// or the waypoints of a flow [[x, y], …]; laneOf: per node the id of the lane
// it stands in on the grid, which a rule may have changed (R1, R12), for
// nodes in a lane with an id. Throws where raw lacks a node of the model.
// measure: the size { w, h } a label's text takes as bpmn-js draws it; the
// page gives one that asks bpmn-js's text renderer in the document's font
// (src/app/bpmn.js), the tests and anything without a page keep the estimate
// labelSize().
// options: which of the rules R1–R16 apply, keyed as in DEFAULT_RULES; a key
// left out keeps its default, so { startAlign: false } leaves out R15 in this
// call only. R7 and the router's second pass always apply.
export function layoutGeometry(model, raw, measure = labelSize, options = DEFAULT_RULES){
  const rules = Object.fromEntries(Object.keys(DEFAULT_RULES).map(k => [k, options[k] ?? DEFAULT_RULES[k]]));
  return layoutGrid(model, raw, measure, rules);
}

// ---------- the grid: Mermaid's columns, rows in each lane, routes in channels ----------
// Mermaid gives the order of the columns and each node's lane; the rules give
// nodes rows above and below the backbone of their lane and gateways the lane
// of their predecessor; a router draws every flow on the grid (cells, the
// channels between rows, the gaps between columns). The rules that can be left
// out, all on by default; frozen, since every call starts from it. Marked
// pure, so that no bundle that leaves it unused keeps the call (the reader
// bundle reaches this module through src/app/diagrams.js).
export const DEFAULT_RULES = /* @__PURE__ */ Object.freeze({
  gatewayLane: true,  // R1  ein Gateway oder End-Ereignis steht in der Bahn seines nächsten Vorgängers; ein paralleler Join in der seines Splits; ein paralleler Split mit Armen in drei oder mehr Bahnen in der mittleren
  pathRows: true,     // R2  zwei Zweige einer Entscheidung, die in einer Bahn weiterlaufen, bekommen eigene Zeilen
  loopAbove: true,    // R3  die Schritte einer Schleife stehen in der Zeile über ihrem Gateway, von dort nach links
  branchBelow: true,  // R4  ein Schritt, der die Bahn verlässt, während ein anderer Zweig in der Zeile bleibt, steht in der Spalte des Gateways auf der Seite der Zielbahn
  fan: true,          // R5  Fächer: die Zweige eines parallelen Blocks nehmen in anderen Bahnen die Zeile, die dem Split am nächsten liegt; sie verlassen den Split senkrecht und gehen senkrecht in den Join, nur der nächste Arm waagerecht über Ost- und Westport, wenn keiner in der Zeile der Gateways liegt
  jumpAbove: true,    // R6  der eine Schritt zwischen dem Ausgang einer Schleife und einem Merge steht in der Spalte des Merge
  block: true,        // R8  ein paralleler Block ist so breit wie der Raum zwischen seinen Gateways: jedes Zweigelement steht waagerecht zwischen Split und Join, kein fremder Knoten darin, fremde Flüsse möglichst außen herum; der Knoten davor und der danach nie in der Spalte von Split bzw. Join
  rowProbe: true,     // R10 Zeilenprobe: bei Kreuzungen jede Zeile, die R2 einem Zweig gibt, auf der Gegenseite probieren; nur übernehmen, wenn es echt weniger Kreuzungen werden
  firstColumn: true,  // R9  (Spike 2.26, Ben) „die jeweils ersten Shapes der Äste eines parallelen Gateways liegen zentriert auf derselben X-Koordinate, sind also untereinander“
  crossProbe: true,   // R12 Kreuzungsprobe: ein Zweig nach einer exklusiven Entscheidung in eine zusätzliche Zeile, ein Merge in eine andere Bahn; nur bei echt weniger Kreuzungen
  combProbe: true,    // R14 Kamm: bei einer exklusiven Verzweigung mit drei oder mehr Zweigen die Köpfe in verschiedenen Zeilen probeweise in eine Spalte (R9 als Probe)
  stagger: true,      // R16 zwei Gateways übereinander in einer Spalte: eines probeweise eine Spalte weiter
  stepAside: true,    // R13 ein Nachfolger in der Spalte seines Vorgängers, zu dem der Fluss drei oder mehr Knicke braucht, probeweise eine Spalte weiter; ebenso der nahe von zwei Geschwistern auf derselben Seite einer Verzweigung
  startAlign: true,   // R15 Start-Ereignisse in der ersten Spalte, jedes in einer eigenen Zeile, um ihren Nachfolger verteilt
  endAlign: true,     // R11 Enden ausrichten: ein End-Ereignis in die letzte Spalte, wenn seine Zeile dorthin frei ist und das Bild nicht schlechter wird; weiche Empfehlung
});

// Maße des Rasters.
const GAP_BASE = 48;        // eine Spaltenlücke ohne Strecken
const CHANNEL_BASE = 44;    // ein Kanal zwischen zwei Zeilen ohne Strecken
const EDGE_BASE = 32;       // der Kanal am Rand einer Bahn ohne Strecken
const TRACK = 16;           // Abstand zweier Strecken in einem Kanal
const TRACK_MARGIN = 12;    // Rand eines Kanals neben seiner äußersten Strecke
const EMPTY_ROW = 40;       // die Zeile einer leeren Bahn
const PORT_STEP = 30;       // Abstand zweier Enden an einer Seite einer Task
const BEND = 0.005;         // Kosten eines Knicks im Router: ein halber Rasterschritt (Länge / 100)

// Das Raster aus Modell und Mermaids Rohpositionen:
//   cells: id → { n, lane, row, col, pin }   Bahnindex, Zeile (Zahl, 0 das Rückgrat, negativ darüber), Spalte (Mermaids Rang)
//   fwdOut, fwdIn: id → [flow]  Vorwärtsflüsse (Rückkanten per Tiefensuche ausgenommen); back: Set der Rückkanten-Ids
function buildGrid(model, raw){
  const laneOf = new Map();
  model.lanes.forEach((l, i) => l.nodes.forEach(id => laneOf.set(id, i)));
  const xs = [];
  for (const n of model.nodes){
    const r = raw.nodes[n.key];
    if (!r) throw new Error('Mermaid hat das Element „' + n.id + '“ nicht angeordnet.');
    if (!xs.some(x => Math.abs(x - r.cx) < 1)) xs.push(r.cx);
  }
  xs.sort((a, b) => a - b);
  const cells = new Map();
  for (const n of model.nodes){
    const r = raw.nodes[n.key];
    cells.set(n.id, { n, lane: laneOf.get(n.id) ?? 0, row: 0, col: xs.findIndex(x => Math.abs(x - r.cx) < 1), pin: null });
  }
  const out = new Map(model.nodes.map(n => [n.id, []]));
  for (const f of model.flows) out.get(f.from).push(f);
  // Rückkanten: Tiefensuche von den Startknoten aus, in der Reihenfolge der Flüsse.
  const state = new Map(), back = new Set();
  const visit = id => {
    state.set(id, 1);
    for (const f of out.get(id)){
      const s = state.get(f.to);
      if (s === 1) back.add(f.id); else if (!s) visit(f.to);
    }
    state.set(id, 2);
  };
  const hasIn = new Set(model.flows.map(f => f.to));
  for (const n of model.nodes) if (!hasIn.has(n.id) && !state.has(n.id)) visit(n.id);
  for (const n of model.nodes) if (!state.has(n.id)) visit(n.id);
  const fwdOut = new Map(model.nodes.map(n => [n.id, []])), fwdIn = new Map(model.nodes.map(n => [n.id, []]));
  for (const f of model.flows){
    if (back.has(f.id)) continue;
    fwdOut.get(f.from).push(f); fwdIn.get(f.to).push(f);
  }
  const reach = new Map();
  const reachable = id => {
    if (reach.has(id)) return reach.get(id);
    const seen = new Set(); const stack = [id];
    while (stack.length){ const x = stack.pop(); for (const f of fwdOut.get(x)) if (!seen.has(f.to)){ seen.add(f.to); stack.push(f.to); } }
    reach.set(id, seen);
    return seen;
  };
  const at = (lane, row, col) => { for (const c of cells.values()) if (c.lane === lane && c.row === row && c.col === col) return c; return null; };
  // Die nächste Zeile von base aus in Richtung dir (−1 darüber, 1 darunter), deren Zelle in col frei ist:
  // die nächste vorhandene Zeile, oder eine neue dazwischen, wo deren Zelle besetzt ist.
  const rowsOf = lane => [...new Set([...cells.values()].filter(c => c.lane === lane).map(c => c.row))].sort((a, b) => a - b);
  const newRow = (lane, base, dir, col) => {
    const rows = rowsOf(lane);
    const next = dir < 0 ? rows.filter(r => r < base).pop() : rows.find(r => r > base);
    if (next === undefined) return base + dir;
    if (!at(lane, next, col)) return next;
    let r = (base + next) / 2;
    while (at(lane, r, col)) r = (base + r) / 2;
    return r;
  };
  // Eine neue Zeile direkt neben base in Richtung dir, immer eine eigene (für Stapel).
  const freshRow = (lane, base, dir) => {
    const rows = rowsOf(lane);
    const next = dir < 0 ? rows.filter(r => r < base).pop() : rows.find(r => r > base);
    return next === undefined ? base + dir : (base + next) / 2;
  };
  const isSplit = id => fwdOut.get(id).length >= 2;
  return { cells, fwdOut, fwdIn, back, reachable, at, rowsOf, newRow, freshRow, isSplit, lanes: model.lanes.length };
}

const byCol = (g, ids) => [...ids].sort((p, q) => g.cells.get(p).col - g.cells.get(q).col);

// R1. Ein Gateway oder ein End-Ereignis steht in der Bahn seines nächsten
// Vorwärtsvorgängers (der mit der größten Spalte vor ihm); ein paralleler
// Join in der Bahn des parallelen Splits, von dem aus alle seine Vorgänger
// erreichbar sind. End-Ereignisse immer (Ben, 2026-10-05: „das Ende ist ein
// Event, keine Eigenschaft einer Rolle“). Garantie: der Fluss vom Vorgänger
// ins Gateway oder ins Ende wechselt die Bahn nicht; der Weg wechselt die
// Bahn erst nach der Entscheidung. In Spaltenfolge, so steht der Vorgänger
// eines Endes schon fest, wenn er ein Gateway ist. Ausnahme (Ben, 2026-10-05,
// morgenroutine: „Bei 3 Lanes bietet sich eine Zentrierung der parallelen Gateways
// an“): ein paralleler Split, dessen Arme in drei oder mehr Bahnen beginnen, steht
// in der mittleren dieser Bahnen (bei gerader Zahl der oberen der beiden mittleren);
// so hat jeder Arm einen eigenen Port. Sein Join folgt ihm. Zwischenereignisse
// bleiben in ihrer Bahn (Ben: sie gehören der Rolle, vor allem Throw und Catch).
function ruleGatewayLane(g, model){
  for (const id of byCol(g, model.nodes.filter(n => n.type === 'gateway' || n.tag === 'endEvent').map(n => n.id))){
    const c = g.cells.get(id), preds = g.fwdIn.get(id);
    if (c.n.tag === 'parallelGateway' && g.isSplit(id)){
      const armLanes = [...new Set(g.fwdOut.get(id).map(f => g.cells.get(f.to).lane))].sort((a, b) => a - b);
      if (armLanes.length >= 3){ c.lane = armLanes[Math.floor((armLanes.length - 1) / 2)]; continue; }
    }
    if (!preds.length) continue;
    let from = null;
    if (c.n.tag === 'parallelGateway' && preds.length >= 2){
      const splits = model.nodes.filter(n => n.tag === 'parallelGateway' && g.isSplit(n.id) && g.cells.get(n.id).col < c.col && preds.every(p => p.from === n.id || g.reachable(n.id).has(p.from)));
      if (splits.length) from = byCol(g, splits.map(n => n.id)).pop();
    }
    if (!from) from = preds.reduce((m, p) => g.cells.get(p.from).col > g.cells.get(m).col ? p.from : m, preds[0].from);
    c.lane = g.cells.get(from).lane;
    // In die Bahn seiner Zweige (Ben, 2026-10-05, x-tm1: „Gateways zentriert“, x-rg3: „Ereignisbasiertes Gateway
    // zentriert.“): ein Split, dessen drei oder mehr Zweige alle in derselben anderen Bahn beginnen, steht in dieser
    // Bahn; R9 setzt ihn in die mittlere Zeile seiner Zweige. Nur Köpfe, deren Bahn feststeht (keine Gateways, keine
    // Enden); ein Gateway darf in jeder Bahn liegen, Zwischenereignisse wechseln sie nie.
    const heads = g.fwdOut.get(id).map(f => g.cells.get(f.to));
    if (c.n.type === 'gateway' && heads.length >= 3 && heads.every(h => h.n.type !== 'gateway' && h.n.tag !== 'endEvent') && heads.every(h => h.lane === heads[0].lane) && heads[0].lane !== c.lane){
      c.lane = heads[0].lane;
      (g.laneSplits ||= new Set()).add(id);
    }
  }
}

// Die Zweige einer Verzweigung G: je Ausgang die vorwärts erreichbaren
// Knoten ohne die, die auch ein anderer Zweig erreicht (den Merge und alles danach).
function branchRegions(g, id){
  const regions = g.fwdOut.get(id).map(f => new Set([f.to, ...g.reachable(f.to)]));
  const count = new Map();
  for (const r of regions) for (const x of r) count.set(x, (count.get(x) || 0) + 1);
  return regions.map((r, i) => ({ flow: g.fwdOut.get(id)[i], nodes: [...r].filter(x => count.get(x) === 1) }));
}

// Die parallelen Blöcke: je paralleler Split P der nächste parallele Join J,
// von P aus sind alle seine Vorgänger erreichbar; inner: die Knoten der
// Zweige zwischen beiden. [{ P, J, inner: Set }]
function parallelBlocks(g, model){
  const out = [];
  for (const n of model.nodes){
    if (n.tag !== 'parallelGateway' || !g.isSplit(n.id)) continue;
    const joins = model.nodes.filter(m => m.tag === 'parallelGateway' && g.fwdIn.get(m.id).length >= 2 && g.cells.get(m.id).col > g.cells.get(n.id).col && g.fwdIn.get(m.id).every(f => f.from === n.id || g.reachable(n.id).has(f.from)));
    if (!joins.length) continue;
    const J = byCol(g, joins.map(m => m.id))[0];
    const inner = new Set(branchRegions(g, n.id).flatMap(r => r.nodes).filter(x => x !== J && !g.reachable(J).has(x)));
    out.push({ P: n.id, J, inner });
  }
  return out;
}

// R2. Zwei Zweige einer Entscheidung, die beide in einer Bahn weiterlaufen
// (je mindestens zwei Knoten dort, Schleifenschritte nach R3 nicht gezählt),
// bekommen dort eigene Zeilen: es bleibt der Zweig, aus dem eine Rückkante in
// die Zeile der Bahn führt, sonst der mit den meisten Knoten in der Bahn,
// sonst der erste; jeder weitere nimmt eine Zeile auf der Seite, die der Bahn
// des Gateways zugewandt ist (in der eigenen Bahn: darunter). Garantie: zwei
// Wege einer Entscheidung stehen nie in einer Zeile.
function rulePathRows(g, model){
  const loopSteps = new Set();
  for (const f of model.flows) if (g.back.has(f.id)){ const ch = loopChain(g, f); if (ch) ch.steps.forEach(s => loopSteps.add(s)); }
  for (const id of byCol(g, model.nodes.filter(n => g.isSplit(n.id)).map(n => n.id))){
    const G = g.cells.get(id), regions = branchRegions(g, id);
    for (let lane = 0; lane < g.lanes; lane++){
      const here = regions.map(r => ({ all: r.nodes, nodes: r.nodes.filter(x => { const c = g.cells.get(x); return c.lane === lane && c.row === 0 && !loopSteps.has(x); }) })).filter(r => r.nodes.length >= 2);
      if (here.length < 2) continue;
      // Der Zweig, aus dem eine Rückkante in die Zeile der Bahn führt (auch aus einem Schleifenschritt), bleibt.
      const loops = here.map(r => r.all.some(x => model.flows.some(f => g.back.has(f.id) && f.from === x && g.cells.get(f.to).lane === lane && g.cells.get(f.to).row === 0 && !r.all.includes(f.to))));
      let stay = loops.indexOf(true);
      if (stay < 0) stay = here.reduce((m, r, i) => r.nodes.length > here[m].nodes.length ? i : m, 0);
      const dir = lane === G.lane ? 1 : G.lane > lane ? 1 : -1;
      let k = 0;
      here.forEach((r, i) => {
        if (i === stay) return;
        k++;
        for (const x of r.nodes) g.cells.get(x).row = dir * k;
        // Für R10: die Zeile, die R2 hier angelegt hat, mit ihren Knoten.
        (g.pathRowGroups = g.pathRowGroups || []).push({ lane, row: dir * k, ids: r.nodes.slice() });
      });
    }
  }
}

// Die Schleife einer Rückkante u→v: die Kette von u rückwärts über eindeutige
// Vorwärtsvorgänger bis zur Verzweigung G, die sie öffnet; { G, steps } mit
// den Schritten in Flussrichtung, oder null (keine Verzweigung, keine Task darin).
function loopChain(g, f){
  const steps = [];
  let x = f.from;
  while (!g.isSplit(x)){
    if (steps.includes(x) || x === f.to) return null;
    steps.unshift(x);
    const preds = g.fwdIn.get(x);
    if (preds.length !== 1) return null;
    x = preds[0].from;
  }
  // Ein Schritt ist eine Task oder ein Zwischenereignis (Ben, 2026-10-05, ereignis: „Pfad der zu End-Event führt
  // sollte für Ost-Gate präferiert werden“; die Warteschleife über einen Timer geht aus der Zeile, der Weg zum Ende
  // bleibt gerade). Eine Kette nur aus Gateways ist keine Schleife.
  if (!steps.some(s => ['task', 'inter'].includes(g.cells.get(s).n.type))) return null;
  // Führt der Zweig der Kette hinter ihr zu einem Ende, das kein anderer Zweig
  // von G erreicht, ist die Kette der Weg dorthin, keine Schleife.
  const others = new Set(g.fwdOut.get(x).filter(o => o.to !== steps[0]).flatMap(o => [o.to, ...g.reachable(o.to)]));
  const beyond = [...g.reachable(steps[0])].filter(y => !steps.includes(y) && !others.has(y));
  if (beyond.some(y => g.cells.get(y).n.type === 'end')) return null;
  return { G: x, steps };
}

// R3. Die Schritte einer Schleife stehen in der Zeile über ihrem Gateway: der
// erste in dessen Spalte, jeder weitere eine Spalte weiter links, bis zur
// Spalte nach dem Ziel der Rückkante; was nicht mehr hineinpasst, in der
// Zeile darüber wieder von der Spalte des Gateways aus. Nur Schritte in der
// Bahn des Gateways. Garantie: ein Schleifenschritt kostet keine Spalte des
// Rückgrats; die Schleife ist ein Rechteck über ihrer Zeile.
function ruleLoopAbove(g, model){
  for (const f of model.flows){
    if (!g.back.has(f.id)) continue;
    const chain = loopChain(g, f);
    if (!chain) continue;
    const G = g.cells.get(chain.G), target = g.cells.get(f.to);
    // Die Zeile über der des Gateways in dessen Bahn, über der des Ziels in dessen Bahn.
    const baseOf = lane => lane === G.lane ? G : lane === target.lane ? target : null;
    const rows = new Map(), colAt = new Map();
    for (const s of chain.steps){
      const c = g.cells.get(s), base = baseOf(c.lane);
      if (!base || c.row !== base.row || c.pin) continue;
      if (!rows.has(c.lane)){ rows.set(c.lane, g.newRow(c.lane, base.row, -1, G.col)); colAt.set(c.lane, G.col); }
      let row = rows.get(c.lane), col = colAt.get(c.lane);
      while (col > target.col && g.at(c.lane, row, col)) col--;                      // eine zweite Schleife desselben Gateways: weiter links in derselben Zeile
      if (col <= target.col){ col = G.col; row = g.newRow(c.lane, row, -1, col); rows.set(c.lane, row); }
      c.row = row; c.col = col; c.pin = { anchor: chain.G, dx: col - G.col };
      colAt.set(c.lane, col - 1);
    }
  }
}

// R4. Ein Schritt, mit dem ein Zweig die Bahn verlässt (eine Task, deren
// einziger Nachfolger in einer anderen Bahn liegt), während ein anderer Zweig
// in der Zeile des Gateways bleibt, steht in der Spalte des Gateways, in der
// Zeile auf der Seite der Zielbahn. Garantie: die Übergabe bleibt eine
// senkrechte Spalte; der Ausnahmeschritt kostet keine Spalte des Rückgrats.
function ruleBranchBelow(g, model){
  for (const id of byCol(g, model.nodes.filter(n => g.isSplit(n.id)).map(n => n.id))){
    const G = g.cells.get(id), firsts = g.fwdOut.get(id).map(f => g.cells.get(f.to));
    const stays = firsts.filter(c => c.lane === G.lane && c.row === G.row && !c.pin);
    for (const c of firsts){
      if (c.n.type !== 'task' || c.lane !== G.lane || c.row !== G.row || c.pin || g.fwdOut.get(c.n.id).length !== 1) continue;
      const succ = g.cells.get(g.fwdOut.get(c.n.id)[0].to);
      if (succ.lane === G.lane || !stays.some(s => s !== c)) continue;
      const dir = succ.lane > G.lane ? 1 : -1;
      c.row = g.newRow(G.lane, G.row, dir, G.col); c.col = G.col; c.pin = { anchor: id, dx: 0 };
    }
  }
}

// R5. Fächer. Die Zweige eines parallelen Blocks, die in einer anderen Bahn
// als der Split liegen, nehmen dort die vorhandene Zeile, die der Bahn des
// Splits am nächsten liegt (die unterste einer Bahn darüber, die oberste
// einer Bahn darunter); ist deren Zelle besetzt, die nächste nach außen. Die
// Arme verlassen den Split senkrecht und biegen dann nach rechts ab, und sie
// kommen von links in die Höhe des Joins und gehen senkrecht in ihn (im
// Router: fanCost()). Garantie: die Arme des Fächers sind so kurz wie die
// Bahnen es zulassen; der Fächer öffnet und schließt sich senkrecht.
function ruleFan(g, model){
  for (const id of byCol(g, model.nodes.filter(n => n.tag === 'parallelGateway' && g.isSplit(n.id)).map(n => n.id))){
    const P = g.cells.get(id);
    for (const r of branchRegions(g, id)) for (const x of r.nodes){
      const c = g.cells.get(x);
      if (c.lane === P.lane || c.row !== 0 || c.pin) continue;
      const rows = g.rowsOf(c.lane), dir = P.lane > c.lane ? 1 : -1;
      let row = dir > 0 ? rows[rows.length - 1] : rows[0];
      while (g.at(c.lane, row, c.col) && g.at(c.lane, row, c.col) !== c) row = g.newRow(c.lane, row, dir, c.col);
      c.row = row;
    }
  }
}

// R6. Der eine Schritt zwischen dem Ausgang einer Schleife (einem
// Schleifenschritt nach R3) und einem Merge weiter rechts steht in der
// Spalte des Merge, in der Zeile seines Vorgängers, wo die frei ist, sonst
// eine weiter außen; der Fluss fällt senkrecht in den Merge. Garantie: ein
// langer Sprung kostet keine Spalte und endet senkrecht in seinem Merge.
function ruleJumpAbove(g, model){
  for (const n of model.nodes){
    const c = g.cells.get(n.id);
    if (n.type !== 'task' || c.pin || g.fwdIn.get(n.id).length !== 1 || g.fwdOut.get(n.id).length !== 1) continue;
    const P = g.cells.get(g.fwdIn.get(n.id)[0].from), M = g.cells.get(g.fwdOut.get(n.id)[0].to);
    if (!P.pin || M.n.type !== 'gateway' || g.fwdIn.get(M.n.id).length < 2 || M.col < c.col + 2) continue;
    const dir = P.row < 0 ? -1 : 1;
    let row = P.row;
    const between = r => [...g.cells.values()].some(o => o !== c && o.lane === c.lane && o.row === r && o.col > P.col && o.col <= M.col);
    while (between(row)) row = g.newRow(c.lane, row, dir, M.col);
    c.row = row; c.col = M.col; c.pin = { anchor: M.n.id, dx: 0, late: true };
  }
}

// R9 (Spike 2.26, Ben, 2026-10-05): „die jeweils ersten Shapes der Äste
// eines parallelen Gateways liegen zentriert auf derselben X-Koordinate, sind
// also untereinander.“ Lesart: je parallelem Split die ersten Knoten seiner
// Zweige (nicht ein Join, auf den ein Zweig direkt führt, nicht ein schon
// angehefteter Knoten); zwei davon in derselben Zeile einer Bahn: der zweite
// Zweig nimmt mit seinen Knoten dieser Zeile die nächste Zeile darunter. Die
// Gruppe kommt nach g.columnGroups; R7 setzt sie in eine Spalte.
// Ebenso ein exklusiver Block (Ben, 2026-10-05, x-wv6: „Das Problem war, dass die
// intermediate events verstreut waren, obwohl sie vom selben Gateway abgingen. Ich
// habe sie zwischen den beiden gateways gestackt“): eine Verzweigung, die kein
// paralleles Gateway ist, mit drei oder mehr Zweigen, die alle an einem Merge wieder
// zusammenlaufen.
function exclusiveBlock(g, model, id, min = 3){
  if (g.fwdOut.get(id).length < min) return null;
  const G = g.cells.get(id);
  const merges = model.nodes.filter(m => m.type === 'gateway' && m.tag !== 'parallelGateway' && m.id !== id && g.fwdIn.get(m.id).length >= 2 && g.cells.get(m.id).col > G.col
    && g.fwdOut.get(id).every(f => f.to === m.id || g.reachable(f.to).has(m.id)) && g.fwdIn.get(m.id).every(f => f.from === id || g.reachable(id).has(f.from)));
  return merges.length ? byCol(g, merges.map(m => m.id))[0] : null;
}
function ruleFirstColumn(g, model){
  g.columnGroups = [];
  // Zwei Alternativen untereinander (Ben, 2026-10-05, krankheit: „Ich habe die Alternativen bei ‚Notfall?‘ lesbarer
  // gemacht“): eine Verzweigung, die kein paralleles Gateway ist, mit genau zwei Zweigen, die an einem Merge wieder
  // zusammenlaufen, beide Köpfe noch in ihrer Zeile (keiner direkt im Merge, keiner angeheftet).
  const pair = n => {
    if (n.type !== 'gateway' || n.tag === 'parallelGateway' || g.fwdOut.get(n.id).length !== 2 || !exclusiveBlock(g, model, n.id, 2)) return false;
    const P = g.cells.get(n.id);
    return g.fwdOut.get(n.id).every(f => { const c = g.cells.get(f.to); return c.n.type !== 'gateway' && !c.pin && c.lane === P.lane && c.row === P.row; });
  };
  const fans = n => g.isSplit(n.id) && (n.tag === 'parallelGateway' || (n.type === 'gateway' && exclusiveBlock(g, model, n.id)) || pair(n));
  for (const id of byCol(g, model.nodes.filter(fans).map(n => n.id))){
    const P = g.cells.get(id), regions = branchRegions(g, id);
    const firsts = [];
    for (const r of regions){
      const x = r.flow.to, c = g.cells.get(x);
      if (c.pin || (c.n.type === 'gateway' && g.fwdIn.get(x).length >= 2) || firsts.some(f => f.x === x)) continue;
      firsts.push({ x, c, r });
    }
    if (firsts.length < 2) continue;
    // Der Zweig in der Zeile des Splits bleibt dort.
    firsts.sort((a, b) => (b.c.lane === P.lane && b.c.row === P.row) - (a.c.lane === P.lane && a.c.row === P.row));
    // Drei oder mehr Köpfe in der Zeile des Splits verteilen sich um sie (Ben, 2026-10-05, x-dg2: „Ich habe die
    // ersten Schritte nach dem Start zentriert“): der mittlere (in der Reihenfolge der Flüsse) bleibt, die davor
    // gehen nach oben, die danach nach unten; so steht der Split in der Mitte seiner Arme und das Rückgrat läuft
    // gerade durch. Ergänzt die Zentrierung des Splits unten, die greift, wo die Arme anders verteilt sind.
    const own = firsts.filter(f => f.c.lane === P.lane && f.c.row === P.row);
    const done = new Set();
    if (own.length >= 3){
      const mid = Math.floor((own.length - 1) / 2), row0 = P.row;
      const move = (f, row) => { for (const x of f.r.nodes){ const c = g.cells.get(x); if (c.lane === P.lane && c.row === row0 && !c.pin) c.row = row; } done.add(f); };
      // Je Arm eine neue Zeile direkt neben der vorigen (Ben, 2026-10-05, x-wv6: „du stackst die intermediate events
      // nicht“): keine vorhandene Zeile weiter weg, in der anderswo schon Knoten stehen.
      let row = row0;
      for (let i = mid - 1; i >= 0; i--){ row = g.freshRow(P.lane, row, -1); move(own[i], row); }
      row = row0;
      for (let i = mid + 1; i < own.length; i++){ row = g.freshRow(P.lane, row, 1); move(own[i], row); }
    }
    // Zwei Alternativen (Ben, 2026-10-05, krankheit: „Bei einem exklusiven block mit 2 tasks ist der zweite block
    // mittig nach unten gestackt.“; drei Zeilen, einer darüber und einer darunter, waren „sehr unelegant“): der erste
    // Zweig bleibt gerade in der Zeile von Split und Merge, der zweite geht in eine neue Zeile direkt darunter, in
    // dieselbe Spalte.
    else if (own.length === 2 && P.n.tag !== 'parallelGateway' && g.fwdOut.get(id).length === 2){
      const row0 = P.row, move = (f, row) => { for (const x of f.r.nodes){ const c = g.cells.get(x); if (c.lane === P.lane && c.row === row0 && !c.pin) c.row = row; } done.add(f); };
      move(own[1], g.freshRow(P.lane, row0, 1));
      done.add(own[0]);
    }
    for (let i = 1; i < firsts.length; i++){
      const f = firsts[i];
      if (done.has(f)) continue;
      if (!firsts.slice(0, i).some(o => o.c.lane === f.c.lane && o.c.row === f.c.row)) continue;
      const lane = f.c.lane, row0 = f.c.row;
      let row = g.newRow(lane, row0, 1, f.c.col);
      while (firsts.slice(0, i).some(o => o.c.lane === lane && o.c.row === row)) row = g.newRow(lane, row, 1, f.c.col);
      for (const x of f.r.nodes){ const c = g.cells.get(x); if (c.lane === lane && c.row === row0 && !c.pin) c.row = row; }
    }
    g.columnGroups.push(firsts.map(f => f.x));
    // In der Bahn zentriert (Ben, 2026-10-05, x-dg2: „Ich habe die parallelen gateways zentriert“; wie R1 über
    // Bahnen): beginnen die Arme in der Bahn des Splits in drei oder mehr Zeilen, stehen Split und Join in der
    // mittleren davon (bei gerader Zahl der oberen der beiden mittleren); so hat jeder Arm einen eigenen Port.
    const armRows = [...new Set(g.fwdOut.get(id).map(f => g.cells.get(f.to)).filter(c => c.lane === P.lane).map(c => c.row))].sort((a, b) => a - b);
    if (armRows.length >= 3){
      const mid = armRows[Math.floor((armRows.length - 1) / 2)];
      P.row = mid;
      const blk = parallelBlocks(g, model).find(b => b.P === id), J = blk && g.cells.get(blk.J);
      if (J && J.lane === P.lane && !J.pin) J.row = mid;
    }
    // Der Join eines Blocks (parallel oder exklusiv) steht in der Zeile seines Splits (Ben, 2026-10-05, x-wv6: Split
    // und Join des Blocks gehören in eine Zeile; ein Join, der nur Starts bündelt, und ein Split, der nur in Enden
    // auffächert, bilden keinen Block).
    const Jid = P.n.tag === 'parallelGateway' ? parallelBlocks(g, model).find(b => b.P === id)?.J : exclusiveBlock(g, model, id, 2);
    const Jc = Jid && g.cells.get(Jid);
    if (Jc && Jc.lane === P.lane && !Jc.pin) Jc.row = P.row;
  }
}

// Ein Split, den R1 in die Bahn seiner Zweige gesetzt hat und der keinen Block bildet (x-rg3), steht ebenso in der
// mittleren Zeile seiner Zweige; zu Beginn jedes Laufs ab R7, damit er auch nach einer Probe (R10, R12), die Zeilen
// der Zweige verschiebt, in der Mitte steht.
function centreLaneSplits(g, model){
  for (const id of g.laneSplits || []){
    const P = g.cells.get(id);
    if (P.n.tag === 'parallelGateway' || exclusiveBlock(g, model, id)) continue;
    const armRows = [...new Set(g.fwdOut.get(id).map(f => g.cells.get(f.to)).filter(c => c.lane === P.lane).map(c => c.row))].sort((a, b) => a - b);
    if (armRows.length >= 3) P.row = armRows[Math.floor((armRows.length - 1) / 2)];
  }
}

// R15. Start-Ereignisse links bündig (Ben, 2026-10-05, x-wv6: „Der Schlamassel geht
// schon damit los, dass die startevent nicht left aligned sind. das habe ich
// nachgezogen und sie dann sinnvoll an das parallele gateway angedockt. den vierten
// startevent habe ich nach oben verlegt, da dort sein flow stattfindet.“). Stehen
// zwei oder mehr Start-Ereignisse in einer Zeile einer Bahn, bekommt jedes eine
// eigene: die Starts mit demselben Nachfolger verteilen sich um dessen Zeile (der
// mittlere bleibt, die davor nach oben, die danach nach unten, wie die Arme nach
// Vorschlag 7); die größte Gruppe bleibt in der Zeile, jede weitere geht in neue
// Zeilen darüber. R7 setzt dann jeden Start in die erste Spalte, weil ihm in seiner
// Zeile nichts mehr vorangeht. Garantie: alle Starts einer Bahn stehen links bündig.
function ruleStartAlign(g, model){
  const starts = model.nodes.filter(n => n.tag === 'startEvent' && !g.fwdIn.get(n.id).length).map(n => g.cells.get(n.id));
  const rowsSeen = new Set(starts.map(c => c.lane + '|' + c.row));
  for (const key of rowsSeen){
    const here = starts.filter(c => c.lane + '|' + c.row === key && !c.pin);
    if (here.length < 2) continue;
    const lane = here[0].lane, row0 = here[0].row;
    const bySucc = new Map();
    for (const c of here){
      const f = g.fwdOut.get(c.n.id)[0], k = f ? f.to : c.n.id;
      (bySucc.get(k) || bySucc.set(k, []).get(k)).push(c);
    }
    const groups = [...bySucc.values()].sort((a, b) => b.length - a.length);
    let top = row0;
    groups.forEach((grp, gi) => {
      const succ = g.cells.get(g.fwdOut.get(grp[0].n.id)[0]?.to);
      let base = gi === 0 ? (succ && succ.lane === lane ? succ.row : row0) : (top = g.newRow(lane, top, -1, 0));
      const mid = Math.floor((grp.length - 1) / 2);
      grp[mid].row = base;
      let r = base;
      for (let i = mid - 1; i >= 0; i--){ r = g.newRow(lane, r, -1, 0); grp[i].row = r; }
      if (gi === 0) top = Math.min(top, r);
      r = base;
      for (let i = mid + 1; i < grp.length; i++){ r = g.newRow(lane, r, 1, 0); grp[i].row = r; }
    });
    // Der einzige Nachfolger eines Starts, der so eine eigene Zeile bekommen hat, folgt ihm, wenn er keinen anderen
    // Vorgänger hat; ist er der Split eines Blocks, mit seinem Join (Ben, 2026-10-05, x-wv6: „den vierten startevent
    // habe ich nach oben verlegt, da dort sein flow stattfindet“).
    for (const c of here){
      if (c.row === row0) continue;
      const out = g.fwdOut.get(c.n.id);
      if (out.length !== 1) continue;
      const t = g.cells.get(out[0].to);
      if (t.lane !== lane || t.pin || g.fwdIn.get(t.n.id).length !== 1) continue;
      const blk = parallelBlocks(g, model).find(b => b.P === t.n.id), J = blk && g.cells.get(blk.J);
      if (J && J.lane === lane && J.row === t.row && !J.pin) J.row = c.row;
      t.row = c.row;
    }
  }
}

// Nach der Box: Starts mit demselben Nachfolger in seiner Bahn stehen wieder um
// dessen Zeile, in neuen Zeilen direkt daneben. Gibt zurück, ob sich etwas bewegt hat.
function redockStarts(g, model){
  const bySucc = new Map();
  for (const n of model.nodes){
    if (n.tag !== 'startEvent' || g.fwdIn.get(n.id).length) continue;
    const out = g.fwdOut.get(n.id);
    if (out.length !== 1) continue;
    const c = g.cells.get(n.id), t = g.cells.get(out[0].to);
    if (c.pin || t.lane !== c.lane) continue;
    (bySucc.get(t) || bySucc.set(t, []).get(t)).push(c);
  }
  let moved = false;
  for (const [t, grp] of bySucc){
    if (grp.length < 2) continue;
    grp.sort((a, b) => a.row - b.row);
    const mid = Math.floor((grp.length - 1) / 2);
    if (grp[mid].row === t.row) continue;
    for (const c of grp) c.row = NaN;
    grp[mid].row = t.row;
    let r = t.row;
    for (let i = mid - 1; i >= 0; i--){ r = g.freshRow(t.lane, r, -1); grp[i].row = r; }
    r = t.row;
    for (let i = mid + 1; i < grp.length; i++){ r = g.freshRow(t.lane, r, 1); grp[i].row = r; }
    moved = true;
  }
  return moved;
}

// R7. Spalten schließen: jede Spalte ist der längste Weg in Mermaids
// Reihenfolge; ein Nachfolger in einer anderen Zeile darf die Spalte seines
// Vorgängers teilen, einer in derselben Zeile steht eine weiter rechts, und
// die Reihenfolge jeder Zeile bleibt die Mermaids. Angeheftete Knoten (R3,
// R4, R6) behalten ihren Abstand zu ihrem Anker. Garantie: keine Spalte ohne
// Knoten; die Ordnung von links nach rechts ist Mermaids.
function ruleCompact(g, model, rules){
  // Mermaids Reihenfolge, aber kein Knoten vor einem seiner Vorwärtsvorgänger.
  const byMermaid = (a, b) => a.col - b.col || a.lane - b.lane || a.row - b.row;
  const waiting = [...g.cells.values()].sort(byMermaid), order = [];
  const done = new Set();
  while (waiting.length){
    let i = waiting.findIndex(c => g.fwdIn.get(c.n.id).every(f => done.has(f.from)));
    if (i < 0) i = 0;
    const c = waiting.splice(i, 1)[0];
    done.add(c.n.id); order.push(c);
  }
  const placed = new Map();
  const blocks = parallelBlocks(g, model);
  // Parallele Splits ohne Join: der Knoten davor steht auch dort nie in ihrer Spalte (Ben, 2026-10-05, morgenroutine).
  const lonePar = new Set(model.nodes.filter(n => n.tag === 'parallelGateway' && g.isSplit(n.id) && !blocks.some(b => b.P === n.id)).map(n => n.id));
  const isPlaced = c => placed.get(c.lane + '|' + c.row + '|' + c.col) === c;
  const pos = c => c.lane * 1e6 + c.row, between = (o, a, b) => (pos(o) - pos(a)) * (pos(o) - pos(b)) < 0;
  const lastInRow = new Map();
  // Senkrechte Übergaben in einer Spalte (Vorgänger und Nachfolger in derselben Spalte) halten die Zellen dazwischen frei.
  const spans = [];
  const put = (c, col) => {
    const rowKey = c.lane + '|' + c.row;
    while (placed.has(c.lane + '|' + c.row + '|' + col) || spans.some(sp => sp.col === col && between(c, sp.a, sp.b))) col++;
    placed.set(c.lane + '|' + c.row + '|' + col, c); c.col = col;
    lastInRow.set(rowKey, Math.max(lastInRow.get(rowKey) ?? -1, col));
  };
  const late = [];
  for (const c of order){
    if (c.pin) continue;
    let col = 0;
    for (const f of g.fwdIn.get(c.n.id)){
      const p = g.cells.get(f.from);
      // Ein angehefteter Vorgänger zählt mit der Spalte seines Ankers, sobald der steht.
      const pc = p.pin ? (!p.pin.late && isPlaced(g.cells.get(p.pin.anchor)) ? g.cells.get(p.pin.anchor).col + p.pin.dx : null) : isPlaced(p) ? p.col : null;
      if (pc === null) continue;
      // Dieselbe Spalte wie der Vorgänger nur, wo die Übergabe senkrecht frei ist: keine Zelle dazwischen besetzt.
      const sameRow = p.lane === c.lane && p.row === c.row;
      const blocked = !sameRow && [...placed.values()].some(o => o.col === pc && o !== p && between(o, p, c));
      // R8: ein Zweigelement steht nie in der Spalte des Splits, der Join nie in der eines Zweigelements.
      // Ebenso (Ben, 2026-10-05, x-wv3): der Knoten vor einem parallelen Split und der nach einem parallelen Join
      // stehen nie in der Spalte des Gateways, auch in einer anderen Zeile nicht, sondern links bzw. rechts versetzt.
      const edge = rules.block && blocks.some(b => (p.n.id === b.P && b.inner.has(c.n.id)) || (c.n.id === b.J && b.inner.has(p.n.id))
        || (c.n.id === b.P && !b.inner.has(p.n.id)) || (p.n.id === b.J && !b.inner.has(c.n.id) && c.n.id !== b.P))
        || (rules.block && lonePar.has(c.n.id))
        // Ebenso vor einem Split, den R1 in die Bahn seiner Zweige gesetzt hat (Ben, 2026-10-05, x-rg3): er braucht
        // Nord- und Südport für die Zweige; stünde der Knoten davor in seiner Spalte, käme der Fluss senkrecht.
        || (g.laneSplits?.has(c.n.id) ?? false);
      col = Math.max(col, pc + (sameRow || blocked || edge ? 1 : 0));
    }
    const last = lastInRow.get(c.lane + '|' + c.row);
    if (last !== undefined) col = Math.max(col, last + 1);
    // R8: ein fremder Knoten steht nicht in einem geschlossenen parallelen Block (Split und Join schon gesetzt).
    if (rules.block) for (const b of blocks){
      if (b.inner.has(c.n.id) || c.n.id === b.P || c.n.id === b.J) continue;
      const P = g.cells.get(b.P), J = g.cells.get(b.J);
      if (!isPlaced(P) || !isPlaced(J)) continue;
      const lanes = [b.P, b.J, ...b.inner].map(id => g.cells.get(id).lane);
      if (c.lane >= Math.min(...lanes) && c.lane <= Math.max(...lanes) && col > P.col && col < J.col) col = J.col + 1;
    }
    col = Math.max(col, g.minCol?.get(c.n.id) ?? 0, g.alignCol?.get(c.n.id) ?? 0, g.asideCol?.get(c.n.id) ?? 0);
    put(c, col);
    for (const f of g.fwdIn.get(c.n.id)){ const p = g.cells.get(f.from); if (isPlaced(p) && p.col === c.col && (p.lane !== c.lane || p.row !== c.row)) spans.push({ col: c.col, a: p, b: c }); }
  }
  // Angeheftete Knoten nach ihrem Anker; die an einen späteren Merge zuletzt.
  for (const c of order){
    if (!c.pin) continue;
    if (c.pin.late){ late.push(c); continue; }
    put(c, g.cells.get(c.pin.anchor).col + c.pin.dx);
  }
  for (const c of late) put(c, g.cells.get(c.pin.anchor).col + c.pin.dx);
}

// R8, Abstand zur Box (Ben, 2026-10-05, x-dg2: „Das Problem war, dass das
// ‚insurance'-x-gateway keinen Abstand zur Box des parallelen flow hatte. wenn man
// es eine zeile darunter bewegt, klappt es besser.“). Die Box eines parallelen
// Blocks: von der Spalte des Splits bis zu der des Joins, je Bahn über die Zeilen,
// die seine Knoten dort belegen. Ein fremder Knoten darin, der nicht
// angeheftet ist, rückt in die nächste Zeile außerhalb: darunter, wenn er in der
// unteren Hälfte der Box steht, sonst darüber; mit ihm die Knoten seiner Zeile
// rechts von ihm bis zur Spalte des Joins nicht. Nach R7, R7 läuft danach neu.
// Gibt zurück, ob ein Knoten bewegt wurde.
function ruleBlockBox(g, model){
  let moved = false;
  for (const b of parallelBlocks(g, model)){
    const ids = [b.P, b.J, ...b.inner], cs = ids.map(id => g.cells.get(id));
    const P = g.cells.get(b.P), J = g.cells.get(b.J);
    // Je Bahn reicht die Box über die Zeilen, die der Block dort belegt (Ben, 2026-10-05, x-wv6: ein Block über
    // drei Bahnen; über alle Bahnen gerechnet käme ein fremder Knoten der mittleren Bahn nie aus der Box). Die
    // fremden Knoten einer Bahn gehen gemeinsam auf eine Seite, die der Mehrheit, und behalten ihre Reihenfolge
    // (sonst riss die Box einen Stapel auseinander).
    for (let lane = 0; lane < g.lanes; lane++){
      const mine = cs.filter(o => o.lane === lane).map(o => o.row);
      if (mine.length < 2) continue;
      const lo = Math.min(...mine), hi = Math.max(...mine);
      const inside = [...g.cells.values()].filter(c => c.lane === lane && !ids.includes(c.n.id) && !c.pin && c.col >= P.col && c.col <= J.col && c.row >= lo && c.row <= hi);
      if (!inside.length) continue;
      const down = inside.filter(c => c.row - lo >= hi - c.row).length * 2 >= inside.length;
      const rows = [...new Set(inside.map(c => c.row))].sort((a, b) => down ? a - b : b - a);
      const to = new Map();
      let edge = down ? hi : lo;
      for (const r of rows){ edge = g.freshRow(lane, edge, down ? 1 : -1); to.set(r, edge); }
      for (const c of inside) c.row = to.get(c.row);
      moved = true;
    }
  }
  return moved;
}

// Das Raster in Pixel, die Flüsse auf dem Raster geroutet: das fertige DI.
//
// The order of the rules, and which needs which. They share the grid g and
// some of its fields, so the order is part of the result (code review of A2,
// D4: R16 before R13 drops R16's result; R12 before R10 gives another one):
//   R1   first: gateways and ends take their lane (and g.laneSplits, read by
//        R7, the router and centreLaneSplits()); every later rule compares lanes
//   R2   rows for the ways of a decision; leaves out the loop steps of R3
//        (loopChain()); records its rows in g.pathRowGroups for R10
//   R3   loop steps above their gateway, pinned to it
//   R4   a step leaving the lane, pinned to its gateway; skips R3's pins
//   R5   the arms of a parallel block in the nearest row; only unpinned nodes
//        still in the backbone, so after R2–R4
//   R6   needs R3's pins: the step after a loop's exit, pinned to its merge
//   R9   starts g.columnGroups anew (R14 adds to it, R7 reads it); reads the
//        rows R2 and R5 gave, skips pins
//   R15  the starts, after R9, whose rows it may move with the start's
//        successor
// From here each rule is a trial: it lays the picture out to the end (runGrid():
// R7, R8, the router; finishGrid()) and keeps a change only where the picture
// gets no worse.
//   R10  only with g.pathRowGroups (R2)
//   R12  after R10
//   R14  after R12, which with R2 and R10 puts the ways on their rows; adds to
//        R9's g.columnGroups
//   R13  starts g.asideCol anew, so before R16, which adds to it
//   R16  after R13
//   R11  last, on the picture all others give; returns it
// R7 and R8 run in finishGrid(), on every trial and on the picture returned.
function layoutGrid(model, raw, measure, rules){
  const g = buildGrid(model, raw);
  if (rules.gatewayLane) ruleGatewayLane(g, model);
  if (rules.pathRows) rulePathRows(g, model);
  if (rules.loopAbove) ruleLoopAbove(g, model);
  if (rules.branchBelow) ruleBranchBelow(g, model);
  if (rules.fan) ruleFan(g, model);
  if (rules.jumpAbove) ruleJumpAbove(g, model);
  if (rules.firstColumn) ruleFirstColumn(g, model);
  if (rules.startAlign) ruleStartAlign(g, model);
  if (rules.rowProbe && (g.pathRowGroups || []).length) ruleRowProbe(g, model, measure, rules);
  if (rules.crossProbe) ruleCrossProbe(g, model, measure, rules);
  if (rules.combProbe) ruleCombProbe(g, model, measure, rules);
  if (rules.stepAside) ruleStepAside(g, model, measure, rules);
  if (rules.stagger) ruleStagger(g, model, measure, rules);
  if (rules.endAlign) return ruleEndAlign(g, model, measure, rules);
  return finishGrid(g, model, measure, rules);
}

// Ein Probelauf ab R7: das fertige DI, seine Güte und die Spalten, die R7
// vergeben hat; danach stehen die Zellen wieder wie vorher (R10, R11).
function runGrid(g, model, measure, rules){
  const once = reroute => {
    const before = new Map([...g.cells.values()].map(c => [c, { lane: c.lane, row: c.row, col: c.col, pin: c.pin }]));
    const di = finishGrid(g, model, measure, rules, reroute);
    const cols = new Map([...g.cells.values()].map(c => [c, c.col]));
    for (const [c, v] of before) Object.assign(c, v);
    return { di, q: gridQuality(di, model), cols, last: Math.max(...cols.values()) };
  };
  // Der zweite Durchgang des Routers macht jeden Fluss billiger, das Bild nicht immer besser: beide rechnen, das
  // bessere nehmen (Kreuzungen, Flüsse durch Knoten, Überlappung, Linien, Beschriftungen, gemeinsame Stücke, Knicke).
  const a = once(true);
  const b = once(false);
  for (const k of ['crossings', 'through', 'overlaps', 'lines', 'labels', 'shared', 'bends']){
    if (a.q[k] < b.q[k]) return a;
    if (b.q[k] < a.q[k]) return b;
  }
  return b;
}

// R10. Zeilenprobe (Ben, 2026-10-05: „bei Überschneidungen probieren, ob es
// hilft, die Zeilen zu vertauschen“). Hat das Bild Kreuzungen, wird für jede
// Zeile, die R2 einem Zweig gegeben hat, die Gegenseite probiert (+k → −k),
// eine nach der anderen; Knoten, die eine spätere Regel versetzt oder
// angeheftet hat (R3, R4, R5, R6, R9), bleiben, wo sie sind. Übernommen wird
// eine Probe nur bei echt weniger Kreuzungen, ohne mehr Flüsse durch fremde
// Knoten und ohne überlappende Knoten; sonst bleibt R2. Garantie: die Probe
// macht das Bild nie schlechter. Bens Maßgabe (2026-10-05, nach x-rg2 und
// x-wv4): kein Tausch bei mehr Brüchen, kein Tausch bei mehr Kreuzungen. Die Bahn wird danach von selbst wieder
// schmaler, weil die Bänder aus den belegten Zeilen entstehen.
function ruleRowProbe(g, model, measure, rules){
  const snap = () => new Map([...g.cells.values()].map(c => [c, { lane: c.lane, row: c.row, col: c.col, pin: c.pin }]));
  const restore = m => { for (const [c, v] of m) Object.assign(c, v); };
  const run = () => runGrid(g, model, measure, rules);
  let best = run();
  for (const grp of g.pathRowGroups){
    if (!best.q.crossings) break;
    const cells = grp.ids.map(x => g.cells.get(x)).filter(c => c.lane === grp.lane && c.row === grp.row && !c.pin);
    if (!cells.length) continue;
    const keep = snap();
    for (const c of cells) c.row = -c.row;
    const t = run();
    if (t.q.crossings < best.q.crossings && t.q.through <= best.q.through && t.q.lines <= best.q.lines && t.q.labels <= best.q.labels && !t.q.overlaps) best = t;
    else restore(keep);
  }
  return best;
}

// R12. Kreuzungsprobe (Ben, 2026-10-05, reklamation: „Bei vielen Überkreuzungen
// nach X-Gates in einer lane prüfen, ob eine zusätzliche Zeile hilft. Bei vielen
// Überkreuzungen prüfen ob Merge Gate in andere Lane wechseln sollte“). Nach R10,
// solange das Bild Kreuzungen hat. Proben: (a) je Verzweigung, die kein paralleles
// Gateway ist, und je Zweig, der in der Zeile des Gateways weiterläuft, während ein
// anderer es auch tut: die Knoten des Zweigs in dieser Zeile in eine neue Zeile
// gleich darüber oder darunter; (b) je Merge, der kein paralleles Gateway ist: jede
// andere Bahn zwischen der obersten und der untersten Bahn seiner Vorgänger und
// Nachfolger, dort in der Zeile eines Vorgängers oder Nachfolgers, sonst im Rückgrat.
// Je Runde wird jede Probe einzeln gerechnet und die beste übernommen, wenn sie echt
// weniger Kreuzungen hat und sonst nichts schlechter macht (wie R10); bis keine mehr
// hilft. Garantie: die Probe macht das Bild nie schlechter.
function ruleCrossProbe(g, model, measure, rules){
  let best = runGrid(g, model, measure, rules);
  const probes = () => {
    const out = [];
    for (const n of model.nodes){
      if (n.type !== 'gateway' || n.tag === 'parallelGateway') continue;
      const G = g.cells.get(n.id);
      if (g.isSplit(n.id)){
        const inRow = branchRegions(g, n.id).map(r => r.nodes.map(x => g.cells.get(x)).filter(c => c.lane === G.lane && c.row === G.row && !c.pin));
        if (inRow.filter(cs => cs.length).length >= 2) for (const cs of inRow) if (cs.length) for (const dir of [-1, 1])
          out.push({ go(){ const row = g.freshRow(G.lane, G.row, dir); for (const c of cs) c.row = row; } });
      }
      if (g.fwdIn.get(n.id).length >= 2){
        const near = [...g.fwdIn.get(n.id).map(f => g.cells.get(f.from)), ...g.fwdOut.get(n.id).map(f => g.cells.get(f.to))];
        const lanes = near.map(c => c.lane), lo = Math.min(...lanes), hi = Math.max(...lanes);
        for (let l = lo; l <= hi; l++){
          if (l === G.lane || G.pin) continue;
          out.push({ go(){ const c = near.find(x => x.lane === l); G.lane = l; G.row = c ? c.row : 0; } });
        }
      }
    }
    return out;
  };
  const snap = () => new Map([...g.cells.values()].map(c => [c, { lane: c.lane, row: c.row, col: c.col, pin: c.pin }]));
  const restore = m => { for (const [c, v] of m) Object.assign(c, v); };
  for (let round = 0; round < 6 && best.q.crossings; round++){
    let pick = null;
    for (const p of probes()){
      const keep = snap();
      p.go();
      const t = runGrid(g, model, measure, rules);
      const ok = t.q.crossings < best.q.crossings && t.q.through <= best.q.through && t.q.lines <= best.q.lines && t.q.labels <= best.q.labels && !t.q.overlaps;
      if (ok && (!pick || t.q.crossings < pick.t.q.crossings)) pick = { p, t, after: snap() };
      restore(keep);
    }
    if (!pick) break;
    restore(pick.after);
    best = pick.t;
  }
}

// R14. Kamm (Ben, 2026-10-05, u13: A und C eine Spalte weiter, alle Zweige von
// „Was?“ beginnen in einer Spalte). R9 als Probe für Verzweigungen, die kein
// paralleles Gateway sind, mit drei oder mehr Vorwärtszweigen; nach R12, weil erst
// R2, R10 und R12 die Zweige auf Zeilen verteilen. Die Köpfe der Zweige (der erste
// Knoten jedes Zweigs, nicht angeheftet, kein Merge), je Zeile der am weitesten
// links, kommen probeweise in eine Spalte (g.columnGroups, R7 wie bei R9). Neue
// Zeilen legt die Probe nicht an. Übernommen nur, wenn keine Kennzahl der Güte
// steigt. Bei zwei Zweigen bleibt die senkrechte Übergabe in der Spalte des Gateways.
function ruleCombProbe(g, model, measure, rules){
  let best = runGrid(g, model, measure, rules);
  const keys = ['crossings', 'through', 'overlaps', 'lines', 'labels'];
  for (const n of model.nodes){
    if (n.type !== 'gateway' || n.tag === 'parallelGateway' || g.fwdOut.get(n.id).length < 3) continue;
    const heads = new Map();
    for (const f of g.fwdOut.get(n.id)){
      const c = g.cells.get(f.to);
      if (c.pin || g.fwdIn.get(f.to).length >= 2) continue;
      const k = c.lane + '|' + c.row, o = heads.get(k);
      if (!o || best.cols.get(c) < best.cols.get(o)) heads.set(k, c);
    }
    const grp = [...heads.values()];
    if (grp.length < 2 || grp.every(c => best.cols.get(c) === best.cols.get(grp[0]))) continue;
    (g.columnGroups = g.columnGroups || []).push(grp.map(c => c.n.id));
    const t = runGrid(g, model, measure, rules);
    const ok = keys.every(k => t.q[k] <= best.q[k]);
    if (ok) best = t; else g.columnGroups.pop();
  }
}

// R13. Eine Spalte weiter (Ben, 2026-10-05, x-rg2: „Danach Abstand bei ‚Wir
// schreiben keine Briefe' auf die selbe Weise erhöht, um Knicke zu reduzieren“).
// Nach R12: ein Nachfolger, der in der Spalte seines Vorgängers steht (R7 lässt das
// in einer anderen Zeile zu), zu dem der Vorwärtsfluss aber drei oder mehr Knicke
// braucht (der senkrechte Weg ist versperrt, der Fluss geht hinaus und zurück),
// rückt probeweise eine Spalte nach rechts (Mindestspalte in R7). Übernommen nur,
// wenn der Fluss weniger Knicke hat und keine Kennzahl der Güte steigt. Garantie:
// ein Übergang in eine andere Zeile ist ein gerades Stück oder ein L, wo das geht.
function ruleStepAside(g, model, measure, rules){
  g.asideCol = new Map();
  let best = runGrid(g, model, measure, rules);
  const bends = (di, f) => Math.max(0, (di.flows[f.id] || []).length - 2);
  const keys = ['crossings', 'through', 'overlaps', 'lines', 'labels'];
  // Teilt der Fluss ein Stück mit einem anderen (Ben, 2026-10-05, r22 und r15: „Spalte eingefügt, um durch den
  // Versatz einen Ausgang freizumachen“; der Eingang oben am Nachfolger wird auch von einem zweiten Fluss
  // gebraucht), rückt der Nachfolger ebenso probeweise eine Spalte weiter; übernommen, wenn es weniger gemeinsame
  // Stücke werden und keine Kennzahl der Güte steigt.
  const sharedOf = (di, f) => sharedPieces(di, model).filter(pair => pair.includes(f.id)).length;
  for (const f of model.flows){
    if (g.back.has(f.id)) continue;
    const a = g.cells.get(f.from), b = g.cells.get(f.to);
    if (b.pin || best.cols.get(a) !== best.cols.get(b)) continue;
    const many = bends(best.di, f) >= 3, shares = sharedOf(best.di, f) > 0;
    if (!many && !shares) continue;
    g.asideCol.set(b.n.id, best.cols.get(b) + 1);
    const t = runGrid(g, model, measure, rules);
    const ok = keys.every(k => t.q[k] <= best.q[k]) && ((many && bends(t.di, f) < bends(best.di, f)) || (shares && t.q.shared < best.q.shared));
    if (ok) best = t; else g.asideCol.delete(b.n.id);
  }
  // Geschwister (Ben, 2026-10-05, x-tm1: „Task in nächste Spalte verschoben, damit Nordausgang und Ostausgang des
  // Gates genutzt werden können.“; reklamation: „hier habe ich kreuzungen eliminiert“): steht ein Nachfolger einer
  // Verzweigung in ihrer Spalte und liegt ein anderer Nachfolger auf derselben Seite weiter weg, rückt der nahe
  // probeweise eine Spalte weiter; der fernere bekommt den Port in seine Richtung, der nahe den Ostport. Übernommen
  // bei weniger Kreuzungen oder Knicken, wenn keine Kennzahl der Güte steigt.
  const pos = c => c.lane * 1e6 + c.row;
  for (const n of model.nodes){
    if (n.type !== 'gateway' || !g.isSplit(n.id)) continue;
    const G = g.cells.get(n.id), succ = g.fwdOut.get(n.id).map(f => g.cells.get(f.to));
    for (const b of succ){
      if (b.pin || best.cols.get(b) !== best.cols.get(G) || pos(b) === pos(G)) continue;
      const side = Math.sign(pos(b) - pos(G));
      if (!succ.some(o => o !== b && Math.sign(pos(o) - pos(G)) === side && Math.abs(pos(o) - pos(G)) > Math.abs(pos(b) - pos(G)))) continue;
      const was = g.asideCol.get(b.n.id);
      g.asideCol.set(b.n.id, best.cols.get(b) + 1);
      const t = runGrid(g, model, measure, rules);
      const ok = keys.every(k => t.q[k] <= best.q[k]) && t.q.shared <= best.q.shared && (t.q.crossings < best.q.crossings || t.q.bends < best.q.bends);
      if (ok) best = t; else if (was === undefined) g.asideCol.delete(b.n.id); else g.asideCol.set(b.n.id, was);
    }
  }
}

// R16. Gateways versetzen (Ben, 2026-10-05, x-wv6: „Wenn wir mehrere x-gateways
// übereinander haben, kann es helfen sie in verschiedene spalten zu verschieben, da
// dann die süd/nord-ausgänge häufiger frei sind.“). Nach R13: stehen zwei Gateways
// einer Bahn in derselben Spalte, rückt probeweise eines eine Spalte nach rechts
// (Mindestspalte in R7; was nach ihm kommt, rückt mit), erst das untere, dann das
// obere. Übernommen wird die beste Probe, wenn keine Kennzahl der Güte steigt und
// das Bild weniger gemeinsame Stücke oder weniger Knicke hat.
function ruleStagger(g, model, measure, rules){
  g.asideCol = g.asideCol || new Map();
  let best = runGrid(g, model, measure, rules);
  const keys = ['crossings', 'through', 'overlaps', 'lines', 'labels'];
  const better = (t, b) => keys.every(k => t.q[k] <= b.q[k]) && (t.q.shared < b.q.shared || (t.q.shared === b.q.shared && t.q.bends < b.q.bends));
  for (let round = 0; round < 4; round++){
    // Auch ein Gateway über oder unter einem anderen Knoten derselben Spalte, in jeder Bahn (Ben, 2026-10-05, r09:
    // „Eine Spalte puffer einfügen, um den südausgang von wohin zu öffnen“); dann rückt das Gateway.
    const all = [...g.cells.values()].filter(c => !c.pin);
    const pos = c => c.lane * 1e6 + c.row;
    let pick = null;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++){
      const a = all[i], b = all[j];
      if (pos(a) === pos(b) || best.cols.get(a) !== best.cols.get(b)) continue;
      const ga = a.n.type === 'gateway', gb = b.n.type === 'gateway';
      if (!ga && !gb) continue;
      const movers = ga && gb ? (pos(a) > pos(b) ? [a, b] : [b, a]) : [ga ? a : b];
      for (const c of movers){
        const was = g.asideCol.get(c.n.id);
        g.asideCol.set(c.n.id, best.cols.get(c) + 1);
        const t = runGrid(g, model, measure, rules);
        if (better(t, pick ? pick.t : best)) pick = { c, col: best.cols.get(c) + 1, t };
        if (was === undefined) g.asideCol.delete(c.n.id); else g.asideCol.set(c.n.id, was);
      }
    }
    if (!pick) break;
    g.asideCol.set(pick.c.n.id, pick.col);
    best = pick.t;
  }
}

// R11. Enden ausrichten (Ben, 2026-10-05: Enden ausrichten ist „eine weiche
// Empfehlung, meine Stilpräferenz“; sie darf keine andere Regel überstimmen).
// Nach R10, auf dem Bild, das alle anderen Regeln ergeben: ein End-Ereignis,
// das nicht in der letzten Spalte steht, wird probeweise dorthin gesetzt (R7
// gibt ihm die letzte Spalte als Mindestspalte; Bahn und Zeile bleiben, gleiche
// Spalte heißt gleiches x). Nicht, wenn rechts von ihm in seiner Zeile ein
// Knoten steht, und nicht für ein angeheftetes Ende. Eines nach dem anderen,
// das der letzten Spalte nächste zuerst. Übernommen wird eine Probe nur, wenn
// das Bild nicht breiter wird und keine Kennzahl der Güte steigt (Kreuzungen,
// Flüsse durch Knoten, Überlappung, Stücke auf einer Linie, Beschriftungen auf
// Flüssen); bei Gleichstand gewinnt die Ausrichtung. Garantie: die Ausrichtung
// macht das Bild nie schlechter; was nicht passt, bleibt, wo die Regeln es setzen.
function ruleEndAlign(g, model, measure, rules){
  g.alignCol = new Map();
  let best = runGrid(g, model, measure, rules);
  const ends = model.nodes.filter(n => n.tag === 'endEvent').map(n => g.cells.get(n.id)).filter(c => !c.pin);
  ends.sort((a, b) => best.cols.get(b) - best.cols.get(a));
  const keys = ['crossings', 'through', 'overlaps', 'lines', 'labels'];
  for (const c of ends){
    const col = best.cols.get(c), last = best.last;
    if (col === last) continue;
    if ([...g.cells.values()].some(o => o !== c && o.lane === c.lane && o.row === c.row && best.cols.get(o) > col)) continue;
    g.alignCol.set(c.n.id, last);
    const t = runGrid(g, model, measure, rules);
    const ok = t.last === last && t.cols.get(c) === last && keys.every(k => t.q[k] <= best.q[k]);
    if (ok) best = t; else g.alignCol.delete(c.n.id);
  }
  return best.di;
}

// Die Paare von Flüssen mit gemeinsamer Quelle oder gemeinsamem Ziel, deren Stücke
// gleichläufig auf einer Linie liegen: [[flowId, flowId], …] (wie shared in gridQuality()).
function sharedPieces(di, model){
  const segs = [];
  for (const f of model.flows){ const pts = di.flows[f.id] || []; for (let i = 1; i < pts.length; i++) segs.push({ f: f.id, a: pts[i - 1], b: pts[i] }); }
  const flowOf = new Map(model.flows.map(f => [f.id, f]));
  const out = [];
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++){
    const p = segs[i], q = segs[j];
    if (p.f === q.f) continue;
    const A = flowOf.get(p.f), B = flowOf.get(q.f);
    if (A.from !== B.from && A.to !== B.to) continue;
    if (A.to === B.to && A.from !== B.from && model.nodes.find(n => n.id === A.to)?.type === 'gateway') continue;
    let dp, dq;
    if (p.a[1] === p.b[1] && q.a[1] === q.b[1] && p.a[1] === q.a[1] && Math.min(Math.max(p.a[0], p.b[0]), Math.max(q.a[0], q.b[0])) - Math.max(Math.min(p.a[0], p.b[0]), Math.min(q.a[0], q.b[0])) > 0){ dp = Math.sign(p.b[0] - p.a[0]); dq = Math.sign(q.b[0] - q.a[0]); }
    else if (p.a[0] === p.b[0] && q.a[0] === q.b[0] && p.a[0] === q.a[0] && Math.min(Math.max(p.a[1], p.b[1]), Math.max(q.a[1], q.b[1])) - Math.max(Math.min(p.a[1], p.b[1]), Math.min(q.a[1], q.b[1])) > 0){ dp = Math.sign(p.b[1] - p.a[1]); dq = Math.sign(q.b[1] - q.a[1]); }
    else continue;
    if (dp === dq) out.push([p.f, q.f]);
  }
  return out;
}

// Kreuzungen zweier Flüsse (ein waagerechtes und ein senkrechtes Stück, die
// sich im Inneren schneiden), Stücke durch fremde Knoten, überlappende Knoten,
// Stücke zweier Flüsse auf einer Linie (gleiche Höhe oder Spalte, überlappend
// oder Ende an Ende, etwa frontal in einen Punkt)
// und Beschriftungen, durch die ein fremder Fluss läuft. Die Regelprüfung der
// Tests steht hier nicht zur Verfügung; das ist ihr Kern für den Vergleich.
function gridQuality(di, model){
  const segs = [];
  for (const f of model.flows){
    const pts = di.flows[f.id] || [];
    for (let i = 1; i < pts.length; i++) segs.push({ f: f.id, a: pts[i - 1], b: pts[i] });
  }
  let crossings = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++){
    const p = segs[i], q = segs[j];
    if (p.f === q.f) continue;
    const ph = p.a[1] === p.b[1], qh = q.a[1] === q.b[1];
    if (ph === qh) continue;
    const [h, v] = ph ? [p, q] : [q, p];
    const x = v.a[0], y = h.a[1];
    if (x > Math.min(h.a[0], h.b[0]) && x < Math.max(h.a[0], h.b[0]) && y > Math.min(v.a[1], v.b[1]) && y < Math.max(v.a[1], v.b[1])) crossings++;
  }
  let through = 0;
  for (const f of model.flows) for (const n of model.nodes){
    if (n.id === f.from || n.id === f.to) continue;
    const [x, y, w, h] = di.nodes[n.id], pts = di.flows[f.id] || [];
    for (let i = 1; i < pts.length; i++){
      const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
      if (Math.max(x1, x2) > x && Math.min(x1, x2) < x + w && Math.max(y1, y2) > y && Math.min(y1, y2) < y + h){ through++; break; }
    }
  }
  let overlaps = 0;
  const ns = model.nodes.map(n => di.nodes[n.id]);
  for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++){
    const [ax, ay, aw, ah] = ns[i], [bx, by, bw, bh] = ns[j];
    if (Math.min(ax + aw, bx + bw) - Math.max(ax, bx) > 2 && Math.min(ay + ah, by + bh) - Math.max(ay, by) > 2) overlaps++;
  }
  // Auf einer Linie zählen gegenläufige Stücke (frontal) und gleichläufige zweier Flüsse ohne gemeinsamen Knoten;
  // gleichläufige mit gemeinsamer Quelle oder gemeinsamem Ziel sind ein gewolltes Zusammenlaufen.
  const flowOf = new Map(model.flows.map(f => [f.id, f]));
  const shared = (p, q) => { const a = flowOf.get(p.f), b = flowOf.get(q.f); return a.from === b.from || a.to === b.to; };
  let lines = 0, sharedLines = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++){
    const p = segs[i], q = segs[j];
    if (p.f === q.f) continue;
    let dp, dq;
    if (p.a[1] === p.b[1] && q.a[1] === q.b[1] && p.a[1] === q.a[1] && Math.min(Math.max(p.a[0], p.b[0]), Math.max(q.a[0], q.b[0])) - Math.max(Math.min(p.a[0], p.b[0]), Math.min(q.a[0], q.b[0])) >= 0){ dp = Math.sign(p.b[0] - p.a[0]); dq = Math.sign(q.b[0] - q.a[0]); }
    else if (p.a[0] === p.b[0] && q.a[0] === q.b[0] && p.a[0] === q.a[0] && Math.min(Math.max(p.a[1], p.b[1]), Math.max(q.a[1], q.b[1])) - Math.max(Math.min(p.a[1], p.b[1]), Math.min(q.a[1], q.b[1])) >= 0){ dp = Math.sign(p.b[1] - p.a[1]); dq = Math.sign(q.b[1] - q.a[1]); }
    else continue;
    // Zusammenlaufen in ein Gateway ist erlaubt (wie in tests/bpmn-rules.mjs), sonst zählt ein gleichläufiges Stück
    // mit gemeinsamem Knoten als gemeinsames Stück.
    if (dp !== dq || !shared(p, q)) lines++;
    else if (!(flowOf.get(p.f).to === flowOf.get(q.f).to && model.nodes.find(n => n.id === flowOf.get(p.f).to)?.type === 'gateway')) sharedLines++;
  }
  let labels = 0;
  const hits = (box, own) => segs.some(sg => !own(sg.f) && Math.max(sg.a[0], sg.b[0]) > box[0] && Math.min(sg.a[0], sg.b[0]) < box[0] + box[2] && Math.max(sg.a[1], sg.b[1]) > box[1] && Math.min(sg.a[1], sg.b[1]) < box[1] + box[3]);
  for (const n of model.nodes){ const b = di.labels[n.id]; if (b && hits(b, f => model.flows.some(x => x.id === f && (x.from === n.id || x.to === n.id)))) labels++; }
  for (const f of model.flows){ const b = di.flowLabels[f.id]; if (b && hits(b, x => x === f.id)) labels++; }
  const bends = model.flows.reduce((n, f) => n + Math.max(0, (di.flows[f.id] || []).length - 2), 0);
  return { crossings, through, overlaps, lines, labels, shared: sharedLines, bends };
}

// Ab R7 bis zum fertigen DI: Spalten schließen, Bänder, Router, Pixel, Labels.
// Verändert die Spalten der Zellen (R7); R10 sichert und stellt sie zurück.
function finishGrid(g, model, measure, rules, reroute = true){
  centreLaneSplits(g, model);
  // R9: R7 so oft, bis jede Gruppe erster Zweigknoten in einer Spalte steht;
  // jede Runde von Mermaids Spalten aus, die Mindestspalten wachsen nur.
  const orig = new Map([...g.cells.values()].map(c => [c, c.col]));
  const compactAll = () => {
    g.minCol = new Map();
    for (let round = 0; round < 8; round++){
      for (const [c, col] of orig) c.col = col;
      ruleCompact(g, model, rules);
      let settled = true;
      for (const grp of g.columnGroups || []){
        const cols = grp.map(x => g.cells.get(x).col), max = Math.max(...cols);
        if (cols.every(c => c === max)) continue;
        settled = false;
        for (const x of grp) g.minCol.set(x, max);
      }
      if (settled) break;
    }
  };
  compactAll();
  let boxed = false;
  for (let round = 0; rules.block && round < 3 && ruleBlockBox(g, model); round++){ boxed = true; compactAll(); }
  // Hat die Box Zeilen verschoben, docken die Starts wieder an ihren Nachfolger an (R15).
  if (boxed && rules.startAlign && redockStarts(g, model)) compactAll();

  // Zeilen je Bahn durchnummeriert; Bänder (Kanal, Zeile, Kanal, …) von oben
  // nach unten über alle Bahnen; Spalten und Lücken von links nach rechts.
  const laneRows = [];
  for (let l = 0; l < g.lanes; l++){
    const rows = g.rowsOf(l);
    laneRows.push(rows.length ? rows : [0]);
  }
  const bands = [];           // { kind: 'ch'|'row', lane, row }
  const rowBand = new Map();  // lane|rowIndex → band index
  for (let l = 0; l < g.lanes; l++){
    bands.push({ kind: 'ch', lane: l, edge: 'top' });
    laneRows[l].forEach((r, i) => {
      if (i) bands.push({ kind: 'ch', lane: l });
      rowBand.set(l + '|' + i, bands.length);
      bands.push({ kind: 'row', lane: l, row: i });
    });
    bands.push({ kind: 'ch', lane: l, edge: 'bottom' });
  }
  const cols = Math.max(...[...g.cells.values()].map(c => c.col)) + 1;
  const place = new Map();    // id → { band, xo } (xo: 2*col+1; Lücke g: 2*g)
  const cellAt = new Map();   // band|xo → id
  for (const c of g.cells.values()){
    const band = rowBand.get(c.lane + '|' + laneRows[c.lane].indexOf(c.row));
    place.set(c.n.id, { band, xo: 2 * c.col + 1, cell: c });
    cellAt.set(band + '|' + (2 * c.col + 1), c.n.id);
  }
  const free = (band, xo) => !cellAt.has(band + '|' + xo);
  const channels = bands.map((b, i) => i).filter(i => bands[i].kind === 'ch');

  // ---- Router ----
  // Ein Weg ist eine Folge von Stücken, waagerecht { h: band, x1, x2 } oder
  // senkrecht { v: xo, b1, b2 }; die Enden nennen die Seite am Symbol. Je
  // Fluss werden die Schablonen gebildet, die auf dem Raster möglich sind,
  // und die mit den wenigsten Konflikten genommen: durchquerte Zellen 1000,
  // ein Port eines Gateways oder Ereignisses, den ein Fluss der anderen
  // Richtung nutzt, 100, ein Stück auf einer Linie mit einem fremden Stück
  // in einer Zeile oder Spalte 3, eine Kreuzung 1, Länge in Rasterschritten /100.
  const routed = [];          // { f, pieces, sides: [sideS, sideT], back }
  const portUse = new Map();  // id|side → { in, out }
  const H = (h, x1, x2) => ({ h, x1, x2 }), V = (v, b1, b2) => ({ v, b1, b2 });
  const sideOfFirst = (p, from) => p.h !== undefined ? (p.x2 > from.xo || (p.x2 === from.xo && p.x1 < from.xo) ? 'right' : 'left') : (p.b2 > from.band ? 'bottom' : 'top');
  const sideOfLast = (p, to) => p.h !== undefined ? (p.x1 < to.xo ? 'left' : 'right') : (p.b1 < to.band ? 'top' : 'bottom');
  const cellsCrossed = pieces => {
    let n = 0;
    // Eine Ecke zwischen zwei Stücken liegt in einer Zelle einer Zeile: die muss frei sein.
    for (let i = 0; i + 1 < pieces.length; i++){
      const a = pieces[i], b = pieces[i + 1];
      const h = a.h !== undefined ? a : b, v = a.h !== undefined ? b : a;
      if (h.h !== undefined && v.v !== undefined && bands[h.h].kind === 'row' && v.v % 2 && !free(h.h, v.v)) n++;
    }
    for (const p of pieces){
      if (p.h !== undefined){ if (bands[p.h].kind === 'row') for (let x = Math.min(p.x1, p.x2) + 1; x < Math.max(p.x1, p.x2); x++) if (!free(p.h, x)) n++; }
      else if (p.v % 2) for (let b = Math.min(p.b1, p.b2) + 1; b < Math.max(p.b1, p.b2); b++) if (!free(b, p.v)) n++;
    }
    return n;
  };
  const overlap = (a1, a2, b1, b2) => Math.min(Math.max(a1, a2), Math.max(b1, b2)) > Math.max(Math.min(a1, a2), Math.min(b1, b2));
  // Ein Endstück an einer Task kann an der Seite versetzt werden (Ports nebeneinander):
  // auf einer Linie mit einem anderen zählt es wenig; an einem Gateway oder Ereignis voll.
  // Ein Fluss aus einem Stück, der an einer Task beginnt und in ein Ereignis geht, zählt dort voll (Ben, 2026-10-05,
  // x-rg1: „Ich habe aber mal 2 Knicke entfernt.“ Der Fluss von „Geldeingang“ teilte die Linie in den Westport des
  // Endes mit dem geraden Fluss von „Geld eintreiben“, und das kostete nur 0,5, weil dessen Stück an einer Task
  // beginnt). In ein Gateway nicht: dort laufen Flüsse zusammen.
  const endWeight = (f, pieces, i) => {
    const id = i === 0 ? f.from : i === pieces.length - 1 ? f.to : null;
    if (pieces.length === 1 && !['task', 'gateway'].includes(g.cells.get(f.to).n.type)) return 3;
    return id && g.cells.get(id).n.type === 'task' ? 0.5 : 3;
  };
  const laneOfBand = b => bands[b].lane;
  // R8: der Raum eines parallelen Blocks in Bändern und Spalten; ein Stück
  // eines fremden Flusses darin kostet 6: mehr als ein Stück auf fremder Linie
  // (3) und als die ein bis drei Kreuzungen, die der Weg außen herum meist
  // kostet; eine Kostenstelle, kein Verbot (Ben: „es klappt nicht immer“).
  const blockRooms = rules.block ? parallelBlocks(g, model).map(b => {
    const ids = [b.P, b.J, ...b.inner], bs = ids.map(id => place.get(id).band);
    return { ids: new Set(ids), x1: place.get(b.P).xo, x2: place.get(b.J).xo, b1: Math.min(...bs), b2: Math.max(...bs) };
  }) : [];
  // R5: ein Arm des Fächers in eine andere Zeile verlässt den Split senkrecht und geht senkrecht in den Join; ein waagerechtes Stück dort kostet 1.
  // Ausnahme (Ben, 2026-10-05, zuerst nur für parallele Blöcke): liegt kein Arm in der Zeile des Splits, verlässt
  // ihn der nächste Arm (der kleinste Abstand der Zeilen, nur wenn er eindeutig ist) waagerecht über den Ostport;
  // ein senkrechter Anfang kostet ihn 1. Am Join gespiegelt: liegt kein Arm in seiner Zeile, kommt der nächste
  // waagerecht über den Westport hinein. Die übrigen Arme wie bisher. Garantie: der nächste Arm kreuzt die
  // ferneren nicht, die Arme bilden ineinander liegende L.
  const fanBlocks = rules.fan ? parallelBlocks(g, model) : [];
  const lonePar = new Set(model.nodes.filter(n => n.tag === 'parallelGateway' && g.isSplit(n.id) && !fanBlocks.some(b => b.P === n.id)).map(n => n.id));
  // Der Abstand eines Arms: Zeilen und Spalten zusammen (Ben, 2026-10-05, x-wv4: ein Shape, das waagerecht viel
  // weiter weg ist, tritt für den Ost- oder Westport hinter das nähere zurück). Ein Arm in der Zeile des
  // Gateways schaltet die Ausnahme ab wie bisher.
  const nearestArm = (gw, arms, end) => {
    const gp = place.get(gw);
    if (arms.some(f => place.get(f[end]).band === gp.band)) return null;
    const d = arms.map(f => ({ f, d: Math.abs(place.get(f[end]).band - gp.band) + Math.abs(place.get(f[end]).xo - gp.xo) }));
    if (!d.length) return null;
    const min = Math.min(...d.map(x => x.d)), near = d.filter(x => x.d === min);
    return near.length === 1 ? near[0].f.id : null;
  };
  const fanNear = new Map(fanBlocks.map(b => [b.P, {
    out: nearestArm(b.P, model.flows.filter(f => f.from === b.P && b.inner.has(f.to)), 'to'),
    in: nearestArm(b.J, model.flows.filter(f => f.to === b.J && b.inner.has(f.from)), 'from'),
  }]));
  const fanCost = (pieces, own) => {
    let n = 0;
    const sameBand = place.get(own.from).band === place.get(own.to).band;   // der Arm in der Zeile der Gateways geht gerade
    for (const b of fanBlocks){
      if (sameBand) break;
      const near = fanNear.get(b.P);
      if (own.from === b.P && b.inner.has(own.to)) n += own.id === near.out ? (pieces[0].v !== undefined ? 1 : 0) : (pieces[0].h !== undefined ? 1 : 0);
      if (own.to === b.J && b.inner.has(own.from)){ const last = pieces[pieces.length - 1]; n += own.id === near.in ? (last.v !== undefined ? 1 : 0) : (last.h !== undefined ? 1 : 0); }
      // Der Fluss aus dem Join geht waagerecht hinaus, der in den Split waagerecht hinein (Ben, 2026-10-05, x-wv3:
      // der Knoten danach steht rechts versetzt, der Ausgang nach unten nähme den Port, den ein Arm braucht).
      if (own.from === b.J && !b.inner.has(own.to) && pieces[0].v !== undefined) n += 1;
      if (own.to === b.P && !b.inner.has(own.from) && pieces[pieces.length - 1].v !== undefined) n += 1;
    }
    // Ebenso in einen parallelen Split ohne Join (Ben, 2026-10-05, morgenroutine: der Split ist zentriert, seine
    // Arme brauchen Nord-, Ost- und Südport).
    if (!sameBand && rules.fan && lonePar.has(own.to) && pieces[pieces.length - 1].v !== undefined) n += 1;
    // Und in einen Split in der Bahn seiner Zweige (x-rg3).
    if (!sameBand && g.laneSplits?.has(own.to) && pieces[pieces.length - 1].v !== undefined) n += 1;
    return n;
  };
  const blockCost = (pieces, own) => {
    let n = fanCost(pieces, own);
    for (const r of blockRooms){
      if (r.ids.has(own.from) && r.ids.has(own.to)) continue;
      for (const p of pieces){
        if (p.h !== undefined){ if (p.h >= r.b1 && p.h <= r.b2 && Math.min(p.x1, p.x2) < r.x2 && Math.max(p.x1, p.x2) > r.x1) n += 6; }
        else if (p.v > r.x1 && p.v < r.x2 && Math.min(p.b1, p.b2) <= r.b2 && Math.max(p.b1, p.b2) >= r.b1) n += 6;
      }
    }
    return n;
  };
  const conflicts = (pieces, own) => {
    let n = blockCost(pieces, own);
    // Ein waagerechtes Stück in einem Kanal einer fremden Bahn: der Rückfluss gehört in die eigene.
    const ownLanes = new Set([g.cells.get(own.from).lane, g.cells.get(own.to).lane]);
    for (const p of pieces) if (p.h !== undefined && bands[p.h].kind === 'ch' && !ownLanes.has(laneOfBand(p.h))) n += 2;
    for (const r of routed){
      if (r.f === own || r.off) continue;
      // Frontal in denselben Port (Ben, 2026-10-05, x-wv4): zwei Flüsse in dasselbe Ziel, deren letzte Stücke auf
      // einer Linie liegen und deren Stücke davor in derselben Spalte (oder Zeile) von entgegengesetzten Seiten
      // kommen (ein ⊤, kein Zusammenlaufen); kostet wie ein Stück auf einer Linie. Der eine nimmt dann den Port
      // auf seiner Seite.
      if (r.f.to === own.to && pieces.length > 1 && r.pieces.length > 1){
        const a1 = pieces[pieces.length - 1], a0 = pieces[pieces.length - 2], b1 = r.pieces[r.pieces.length - 1], b0 = r.pieces[r.pieces.length - 2];
        if (a1.h !== undefined && b1.h !== undefined && a1.h === b1.h && a0.v !== undefined && b0.v !== undefined && a0.v === b0.v && Math.sign(a0.b2 - a0.b1) === -Math.sign(b0.b2 - b0.b1)) n += 3;
        if (a1.v !== undefined && b1.v !== undefined && a1.v === b1.v && a0.h !== undefined && b0.h !== undefined && a0.h === b0.h && Math.sign(a0.x2 - a0.x1) === -Math.sign(b0.x2 - b0.x1)) n += 3;
      }
      pieces.forEach((p, i) => r.pieces.forEach((q, j) => {
        if (p.h !== undefined && q.h !== undefined){
          if (p.h === q.h && overlap(p.x1, p.x2, q.x1, q.x2)) n += bands[p.h].kind === 'row' ? Math.min(endWeight(own, pieces, i), endWeight(r.f, r.pieces, j)) : 0.3;
        } else if (p.v !== undefined && q.v !== undefined){
          if (p.v === q.v && overlap(p.b1, p.b2, q.b1, q.b2)) n += p.v % 2 ? Math.min(endWeight(own, pieces, i), endWeight(r.f, r.pieces, j)) : 0.3;
        } else {
          const [h, v] = p.h !== undefined ? [p, q] : [q, p];
          if (Math.min(h.x1, h.x2) < v.v && v.v < Math.max(h.x1, h.x2) && Math.min(v.b1, v.b2) < h.h && h.h < Math.max(v.b1, v.b2)) n += 1;
        }
      }));
    }
    return n;
  };
  const length = pieces => pieces.reduce((s, p) => s + (p.h !== undefined ? Math.abs(p.x2 - p.x1) : Math.abs(p.b2 - p.b1)), 0);
  const portPenalty = (id, side, out) => {
    const c = g.cells.get(id);
    if (c.n.type === 'task') return 0;
    const u = portUse.get(id + '|' + side);
    return u && (out ? u.in : u.out) ? 100 : 0;
  };
  const score = (f, pieces) => {
    const s = place.get(f.from), t = place.get(f.to);
    // Ein Knick kostet einen halben Rasterschritt (Ben, 2026-10-05, hund2: „Anderen Ausgang prüfen, um Linienknicke
    // zu mindern“): bei gleicher Länge und gleichen Konflikten gewinnt der Weg mit weniger Knicken, etwa seitlich
    // hinaus statt unten hinaus und gleich wieder zur Seite. Damit kein Knick gespart wird, indem ein Fluss nach rechts
    // eine Task von hinten nimmt: liegt das Ziel rechts der Quelle oder in ihrer Spalte, kostet es zwei Knicke, von rechts in eine Task zu
    // gehen oder sie nach links zu verlassen (ein Gateway darf von rechts genommen werden, wie Ben es in hund2 tat).
    const ahead = t.xo >= s.xo;
    const behind = ahead ? (g.cells.get(f.to).n.type === 'task' && sideOfLast(pieces[pieces.length - 1], t) === 'right' ? 1 : 0) + (g.cells.get(f.from).n.type === 'task' && sideOfFirst(pieces[0], s) === 'left' ? 1 : 0) : 0;
    return cellsCrossed(pieces) * 1000 + portPenalty(f.from, sideOfFirst(pieces[0], s), true) + portPenalty(f.to, sideOfLast(pieces[pieces.length - 1], t), false) + conflicts(pieces, f) + length(pieces) / 100 + (pieces.length - 1 + 2 * behind) * BEND;
  };
  // Die Schablonen eines Flusses s→t.
  const templates = (s, t) => {
    const out = [];
    const ys = s.band, yt = t.band, xs = s.xo, xt = t.xo;
    if (ys === yt){
      out.push([H(ys, xs, xt)]);
      for (const ch of channels) out.push([V(xs, ys, ch), H(ch, xs, xt), V(xt, ch, yt)]);
      return out;
    }
    if (xs === xt){
      const d = Math.sign(yt - ys);
      out.push([V(xs, ys, yt)]);
      for (const gx of [xs - 1, xs + 1]){
        out.push([V(xs, ys, ys + d), H(ys + d, xs, gx), V(gx, ys + d, yt), H(yt, gx, xt)]);          // hinaus über den Kanal, seitlich hinein
        out.push([V(xs, ys, ys - d), H(ys - d, xs, gx), V(gx, ys - d, yt), H(yt, gx, xt)]);          // hinaus auf der anderen Seite, seitlich hinein
        out.push([H(ys, xs, gx), V(gx, ys, yt - d), H(yt - d, gx, xt), V(xt, yt - d, yt)]);          // seitlich hinaus, über den Kanal hinein
        out.push([H(ys, xs, gx), V(gx, ys, yt), H(yt, gx, xt)]);                                    // seitlich hinaus und hinein
      }
      return out;
    }
    if (xt < xs){
      out.push([H(ys, xs, xt), V(xt, ys, yt)]);                                   // L nach links: erst waagerecht in der Zeile, dann senkrecht ins Ziel
      out.push([V(xs, ys, yt), H(yt, xs, xt)]);                                   // L nach links: erst senkrecht, dann in der Zielzeile
    }
    if (xt > xs){
      out.push([V(xs, ys, yt), H(yt, xs, xt)]);                                   // L: erst senkrecht
      out.push([H(ys, xs, xt), V(xt, ys, yt)]);                                   // L: erst waagerecht
      out.push([H(ys, xs, xs + 1), V(xs + 1, ys, yt), H(yt, xs + 1, xt)]);        // Z über die Lücke rechts der Quelle
      out.push([H(ys, xs, xt - 1), V(xt - 1, ys, yt), H(yt, xt - 1, xt)]);        // Z über die Lücke links des Ziels
      const d = Math.sign(yt - ys);
      out.push([V(xs, ys, yt - d), H(yt - d, xs, xt), V(xt, yt - d, yt)]);        // Z über den Kanal am Ziel
      out.push([V(xs, ys, ys + d), H(ys + d, xs, xt), V(xt, ys + d, yt)]);        // Z über den Kanal an der Quelle
      for (const ch of channels) out.push([H(ys, xs, xs + 1), V(xs + 1, ys, ch), H(ch, xs + 1, xt - 1), V(xt - 1, ch, yt), H(yt, xt - 1, xt)]);
      // Über einen Kanal und senkrecht ins Ziel, auch von der Seite, die von der Quelle abgewandt ist (Ben,
      // 2026-10-05, x-wv4: unten herum in den Südport, statt frontal auf einen anderen Fluss im Westport).
      for (const ch of channels){
        if (ch === yt) continue;
        out.push([V(xs, ys, ch), H(ch, xs, xt), V(xt, ch, yt)]);
        out.push([H(ys, xs, xs + 1), V(xs + 1, ys, ch), H(ch, xs + 1, xt), V(xt, ch, yt)]);
      }
      return out;
    }
    // Rückwärts über Zeilen: Kanal, senkrecht an Quelle und Ziel; sonst seitlich hinaus über eine Lücke, seitlich hinein oder von oben/unten.
    for (const ch of channels) out.push([V(xs, ys, ch), H(ch, xs, xt), V(xt, ch, yt)]);
    for (const ch of channels) for (const gs of [xs - 1, xs + 1]){
      out.push([H(ys, xs, gs), V(gs, ys, ch), H(ch, gs, xt), V(xt, ch, yt)]);
      out.push([V(xs, ys, ch), H(ch, xs, gs === xs - 1 ? xt + 1 : xt - 1), V(gs === xs - 1 ? xt + 1 : xt - 1, ch, yt), H(yt, gs === xs - 1 ? xt + 1 : xt - 1, xt)]);
      for (const gt of [xt - 1, xt + 1]) out.push([H(ys, xs, gs), V(gs, ys, ch), H(ch, gs, gt), V(gt, ch, yt), H(yt, gt, xt)]);
    }
    return out;
  };
  // A template without its pieces of length 0, and two neighbours of one
  // direction merged into one piece, until none is left: the tracks, the
  // conflicts and the waypoints take H and V in turn (the middle H of a Z with
  // xt = xs + 2 has length 0, and its two V would give a waypoint an x for a y).
  const clean = raw => {
    for (let pieces = raw;;){
      const out = [];
      for (const p of pieces){
        if (p.h !== undefined ? p.x1 === p.x2 : p.b1 === p.b2) continue;
        const q = out[out.length - 1];
        if (q && (q.h !== undefined) === (p.h !== undefined)) out[out.length - 1] = q.h !== undefined ? H(q.h, q.x1, p.x2) : V(q.v, q.b1, p.b2);
        else out.push(p);
      }
      if (out.length === pieces.length) return out;
      pieces = out;
    }
  };
  const flowOrder = [...model.flows].sort((a, b) => {
    const ba = g.back.has(a.id), bb = g.back.has(b.id);
    if (ba !== bb) return ba ? 1 : -1;
    const la = Math.abs(place.get(a.to).xo - place.get(a.from).xo) + Math.abs(place.get(a.to).band - place.get(a.from).band);
    const lb = Math.abs(place.get(b.to).xo - place.get(b.from).xo) + Math.abs(place.get(b.to).band - place.get(b.from).band);
    return la - lb;
  });
  for (const f of flowOrder){
    const s = place.get(f.from), t = place.get(f.to);
    let best = null;
    for (const raw of templates(s, t)){
      const pieces = clean(raw);
      if (!pieces.length) continue;
      const sc = score(f, pieces);
      if (!best || sc < best.sc) best = { pieces, sc };
    }
    const sideS = sideOfFirst(best.pieces[0], s), sideT = sideOfLast(best.pieces[best.pieces.length - 1], t);
    const use = (id, side, out) => { const k = id + '|' + side; const u = portUse.get(k) || { in: 0, out: 0 }; u[out ? 'out' : 'in']++; portUse.set(k, u); };
    use(f.from, sideS, true); use(f.to, sideT, false);
    routed.push({ f, pieces: best.pieces, sides: [sideS, sideT], back: g.back.has(f.id) });
  }
  // Paarprobe (Ben, 2026-10-05, x-rg1: „Ich habe aber mal 2 Knicke entfernt.“): je zwei Flüsse in dasselbe Ereignis werden
  // herausgenommen und in beiden Reihenfolgen neu gelegt, jeder auf seinem billigsten Weg; das Paar mit der kleineren
  // Summe bleibt. Einzeln findet der Router keinen Tausch: in x-rg1 nahm „Geldeingang“ im ersten Durchgang den freien
  // Südport des Endes, bevor der längere Fluss „kein Regress“ gelegt war, und der musste oben herum. Vor dem zweiten
  // Durchgang, damit der die getauschten Wege schon sieht (sonst blieb ein Umweg, der dem alten Weg auswich).
  if (reroute){
    const portAdd = (id, side, out, d) => { const k = id + '|' + side; const u = portUse.get(k) || { in: 0, out: 0 }; u[out ? 'out' : 'in'] += d; portUse.set(k, u); };
    const lift = r => { portAdd(r.f.from, r.sides[0], true, -1); portAdd(r.f.to, r.sides[1], false, -1); r.off = true; };
    const lay = (r, pieces) => {
      const s = place.get(r.f.from), t = place.get(r.f.to);
      r.pieces = pieces; r.sides = [sideOfFirst(pieces[0], s), sideOfLast(pieces[pieces.length - 1], t)]; r.off = false;
      portAdd(r.f.from, r.sides[0], true, 1); portAdd(r.f.to, r.sides[1], false, 1);
    };
    const cheapest = f => {
      let best = null;
      for (const raw of templates(place.get(f.from), place.get(f.to))){
        const pieces = clean(raw);
        if (!pieces.length) continue;
        const sc = score(f, pieces);
        if (!best || sc < best.sc) best = { pieces, sc };
      }
      return best.pieces;
    };
    // Nur in ein Ereignis: es hat vier Ports und keinen Versatz; an einer Task liegen die Enden nebeneinander, in ein
    // Gateway laufen Flüsse zusammen.
    for (const n of model.nodes){
      if (['task', 'gateway'].includes(n.type)) continue;
      const into = routed.filter(r => r.f.to === n.id);
      for (let i = 0; i < into.length; i++) for (let j = i + 1; j < into.length; j++){
        const a = into[i], b = into[j];
        const sum = () => score(a.f, a.pieces) + score(b.f, b.pieces);
        let best = { sc: sum(), p: [a.pieces, b.pieces] };
        for (const [x, y] of [[a, b], [b, a]]){
          lift(a); lift(b);
          lay(x, cheapest(x.f)); lay(y, cheapest(y.f));
          const sc = sum();
          if (sc < best.sc - 1e-9) best = { sc, p: [a.pieces, b.pieces] };
        }
        lift(a); lift(b); lay(a, best.p[0]); lay(b, best.p[1]);
      }
    }
  }

  // Zweiter Durchgang (Ben, 2026-10-05, r22: „Spalte eingefügt, um durch den Versatz einen Ausgang
  // freizumachen“): jeder Fluss wird noch einmal gelegt, jetzt mit allen anderen im Bild (die Rückflüsse kamen im
  // ersten Durchgang erst zuletzt); er wechselt nur, wenn ein Weg echt billiger ist als sein bisheriger. Bis zu drei
  // Runden, solange ein Fluss wechselt (Ben, 2026-10-05, x-tm1: ein Fluss, der vor einem anderen neu gelegt wurde,
  // sah dessen alten Port noch belegt und blieb auf dem Umweg).
  for (let round = 0, moved = true; reroute && moved && round < 3; round++){ moved = false; for (const f of flowOrder){
    const i = routed.findIndex(r => r.f === f), old = routed[i];
    const s = place.get(f.from), t = place.get(f.to);
    const unuse = (id, side, out) => { const u = portUse.get(id + '|' + side); if (u) u[out ? 'out' : 'in']--; };
    unuse(f.from, old.sides[0], true); unuse(f.to, old.sides[1], false);
    let best = { pieces: old.pieces, sc: score(f, old.pieces) };
    for (const raw of templates(s, t)){
      const pieces = clean(raw);
      if (!pieces.length) continue;
      const sc = score(f, pieces);
      if (sc < best.sc - 1e-9) best = { pieces, sc };
    }
    const sideS = sideOfFirst(best.pieces[0], s), sideT = sideOfLast(best.pieces[best.pieces.length - 1], t);
    const use = (id, side, out) => { const k = id + '|' + side; const u = portUse.get(k) || { in: 0, out: 0 }; u[out ? 'out' : 'in']++; portUse.set(k, u); };
    use(f.from, sideS, true); use(f.to, sideT, false);
    if (best.pieces !== old.pieces) moved = true;
    routed[i] = { f, pieces: best.pieces, sides: [sideS, sideT], back: old.back };
  } }
  // ---- Strecken in Kanälen und Lücken ----
  // Je Kanal die waagerechten Stücke in ihm, nach der Seite, von der ihr
  // Fluss kommt (von oben, von unten), kürzere Spannen innen; je Lücke die
  // senkrechten ebenso (von links, von rechts).
  const tracks = new Map(); // piece → { side, i }
  const assign = (items, side) => {
    const sorted = [...items].sort((a, b) => a.len - b.len);
    const lanesUsed = [];
    for (const it of sorted){
      let i = 0;
      while (lanesUsed[i] && lanesUsed[i].some(o => overlap(o.lo, o.hi, it.lo, it.hi))) i++;
      (lanesUsed[i] ||= []).push(it);
      tracks.set(it.p, { side, i });
    }
    return lanesUsed.length;
  };
  const chTracks = new Map(), gapTracks = new Map();
  for (const ch of channels){
    const items = [];
    for (const r of routed) r.pieces.forEach((p, i) => {
      if (p.h !== ch) return;
      // Von welcher Seite der Fluss in den Kanal kommt: das Band des Stücks davor oder danach.
      const before = r.pieces[i - 1];
      const fromBand = before ? before.b1 : place.get(r.f.from).band;
      const side = (fromBand < ch ? 'top' : 'bottom');
      items.push({ p, lo: Math.min(p.x1, p.x2), hi: Math.max(p.x1, p.x2), len: Math.abs(p.x2 - p.x1), side });
    });
    const top = assign(items.filter(x => x.side === 'top'), 'top'), bottom = assign(items.filter(x => x.side === 'bottom'), 'bottom');
    chTracks.set(ch, { top, bottom });
  }
  for (let gx = 0; gx <= 2 * cols; gx += 2){
    const items = [];
    for (const r of routed) r.pieces.forEach((p, i) => {
      if (p.v !== gx) return;
      const before = r.pieces[i - 1];
      const fromX = before ? before.x1 : place.get(r.f.from).xo;
      items.push({ p, lo: Math.min(p.b1, p.b2), hi: Math.max(p.b1, p.b2), len: Math.abs(p.b2 - p.b1), side: fromX < gx ? 'left' : 'right' });
    });
    const left = assign(items.filter(x => x.side === 'left'), 'left'), right = assign(items.filter(x => x.side === 'right'), 'right');
    gapTracks.set(gx, { left, right });
  }

  // ---- Pixel ----
  const widthOf = n => n.type === 'task' ? SIZE.task[0] : n.type === 'gateway' ? SIZE.gateway[0] : EVENT_LABEL;
  const colW = Array.from({ length: cols }, () => 0), rowH = bands.map(() => 0);
  for (const c of g.cells.values()){
    colW[c.col] = Math.max(colW[c.col], widthOf(c.n));
    const b = place.get(c.n.id).band;
    rowH[b] = Math.max(rowH[b], SIZE[c.n.type][1]);
  }
  for (let b = 0; b < bands.length; b++){
    if (bands[b].kind === 'row'){ if (!rowH[b]) rowH[b] = EMPTY_ROW; continue; }
    const t = chTracks.get(b), n = t.top + t.bottom;
    const base = bands[b].edge ? EDGE_BASE : CHANNEL_BASE;
    rowH[b] = Math.max(base, n ? 2 * TRACK_MARGIN + (n - 1) * TRACK + (bands[b].edge ? 0 : 8) : 0);
  }
  const gapW = [];
  for (let gx = 0; gx <= 2 * cols; gx += 2){
    const t = gapTracks.get(gx), n = t.left + t.right;
    gapW[gx / 2] = Math.max(GAP_BASE, n ? 2 * TRACK_MARGIN + (n - 1) * TRACK + 12 : 0);
  }
  // Platz für die Beschriftung (Ben, 2026-10-05, demo5 und x-rg2: „Bei Textkollision prüfen, ob Bruch verschwindet
  // wenn h-Abstand erhöht wird“): ein benannter Fluss, der gerade von einer Spalte in die nächste geht, bekommt
  // eine Lücke, in der seine Beschriftung zwischen den beiden Symbolen Platz hat; hinter einem Gateway 10 px nach
  // dessen Spitze (wie flowLabelPlaces()), sonst 6 px, und 6 px vor dem Ziel. Garantie: die Beschriftung eines
  // geraden Flusses liegt auf keinem seiner Knoten.
  for (const r of routed){
    if (!r.f.name || r.pieces.length !== 1 || r.pieces[0].h === undefined || bands[r.pieces[0].h].kind !== 'row') continue;
    const p = r.pieces[0];
    if (Math.abs(p.x2 - p.x1) !== 2) continue;
    const a = g.cells.get(r.f.from), b = g.cells.get(r.f.to), [l, rt] = p.x1 < p.x2 ? [a, b] : [b, a];
    const spare = (colW[l.col] - SIZE[l.n.type][0]) / 2 + (colW[rt.col] - SIZE[rt.n.type][0]) / 2;
    const need = (a.n.type === 'gateway' ? 10 : 6) + measure(r.f.name).w + 6;
    const k = Math.max(l.col, rt.col);
    gapW[k] = Math.max(gapW[k], Math.ceil(need - spare));
  }
  // Platz für den Namen eines Gateways (Ben, 2026-10-05, r01: „Abstand zwischen gateway und folgennode leicht erhöhen,
  // dann verschwindet die kollision.“): nehmen Flüsse den Port oben und unten, findet der Name weder darüber noch
  // darunter Platz und geht in eine Ecke (labelPlaces()); passt er weder rechts noch links zwischen das Gateway und den
  // Nachbarn seiner Zeile, wird die Lücke rechts so breit, dass er dort 2 px nach der Spitze und 6 px vor dem nächsten
  // Knoten steht, wie bei Vorschlag 1.
  for (const c of g.cells.values()){
    if (c.n.type !== 'gateway' || !c.n.name) continue;
    const at = side => routed.some(r => (r.f.from === c.n.id && r.sides[0] === side) || (r.f.to === c.n.id && r.sides[1] === side));
    if (!at('top') || !at('bottom')) continue;
    const band = place.get(c.n.id).band, need = 2 + measure(c.n.name).w + 6;
    // Wie viel fehlt zwischen dem Gateway und seinem Nachbarn in Spalte col + d; die Lücke dazwischen hat den Index k.
    // Nur eine Task reicht so hoch, dass sie die Ecke über oder unter dem Gateway erreicht.
    const short = d => {
      const id = cellAt.get(band + '|' + (2 * (c.col + d) + 1));
      if (!id || g.cells.get(id).n.type !== 'task') return 0;
      const nc = g.cells.get(id), k = d > 0 ? nc.col : c.col;
      return need - (colW[c.col] - SIZE.gateway[0]) / 2 - (colW[nc.col] - SIZE[nc.n.type][0]) / 2 - gapW[k];
    };
    const right = short(1);
    if (right <= 0 || short(-1) <= 0) continue;
    gapW[c.col + 1] += Math.ceil(right);
  }
  const colX = [], gapX = [];
  let x = HEAD;
  for (let c = 0; c <= cols; c++){
    gapX[c] = x; x += gapW[c];
    if (c < cols){ colX[c] = x; x += colW[c]; }
  }
  const totalW = x;
  const bandY = [];
  let y = 0;
  for (let b = 0; b < bands.length; b++){ bandY[b] = y; y += rowH[b]; }
  const totalH = y;

  const box = {};
  for (const c of g.cells.values()){
    const b = place.get(c.n.id).band, [w, h] = SIZE[c.n.type];
    box[c.n.id] = { cx: colX[c.col] + colW[c.col] / 2, cy: bandY[b] + rowH[b] / 2, w, h, task: c.n.type === 'task', gateway: c.n.type === 'gateway' };
  }
  const trackY = p => {
    const t = tracks.get(p), b = p.h, h = rowH[b];
    return t.side === 'top' ? bandY[b] + TRACK_MARGIN + t.i * TRACK + (bands[b].edge ? 0 : 4) : bandY[b] + h - TRACK_MARGIN - t.i * TRACK - (bands[b].edge ? 0 : 4);
  };
  const trackX = p => {
    const t = tracks.get(p), gx = p.v / 2, w = gapW[gx];
    return t.side === 'left' ? gapX[gx] + TRACK_MARGIN + t.i * TRACK : gapX[gx] + w - TRACK_MARGIN - t.i * TRACK;
  };

  // Ports: an einer Task mehrere Enden je Seite nebeneinander, sortiert nach
  // dem Stück danach, damit sie sich nicht kreuzen; ein Gateway und ein Ereignis
  // an ihrer Spitze.
  // Reihenfolge der Enden (Ben, 2026-10-05, r09: „außerdem habe ich eine Kreuzung gelöst, in dem ich die reihenfolge
  // der Flows die zu B2 gehen geändert habe“): das Stück danach kommt von einer Seite (von links oder rechts an
  // einer oberen oder unteren Seite, von oben oder unten an einer linken oder rechten); je näher es am Symbol liegt,
  // desto weiter steht sein Ende auf dieser Seite, der fernere Fluss geht innen daran vorbei. Ein gerader Fluss
  // behält die Mitte. Vorher nur nach der Lage des Stücks, ohne die Seite; von links oder oben kreuzten sie sich.
  const ends = new Map(); // id|side → [{ r, out, far }]
  for (const r of routed){
    const farOf = (atStart) => {
      const n = r.pieces.length;
      if (n === 1) return 0;
      const [p, q] = atStart ? [r.pieces[0], r.pieces[1]] : [r.pieces[n - 1], r.pieces[n - 2]];
      const own = place.get(atStart ? r.f.from : r.f.to);
      // q liegt quer zu p: sein Abstand zum Symbol und die Seite, von der er kommt (−1 links/oben, +1 rechts/unten).
      if (p.h !== undefined){
        const far = atStart ? q.b2 : q.b1, d = Math.abs(q.v - own.xo);
        return Math.sign(far - own.band) / (d || 0.5);
      }
      const far = atStart ? q.x2 : q.x1, d = Math.abs(q.h - own.band);
      return Math.sign(far - own.xo) / (d || 0.5);
    };
    const add = (id, side, out, far) => { const k = id + '|' + side; (ends.get(k) || ends.set(k, []).get(k)).push({ r, out, far }); };
    add(r.f.from, r.sides[0], true, farOf(true));
    add(r.f.to, r.sides[1], false, farOf(false));
  }
  const portOf = new Map(); // r|out → { x, y }
  for (const [k, list] of ends){
    const [id, side] = k.split('|'), c = box[id];
    const vertical = side === 'top' || side === 'bottom';
    const base = { x: side === 'left' ? c.cx - c.w / 2 : side === 'right' ? c.cx + c.w / 2 : c.cx, y: side === 'top' ? c.cy - c.h / 2 : side === 'bottom' ? c.cy + c.h / 2 : c.cy };
    const sorted = [...list].sort((a, b) => a.far - b.far || (a.out === b.out ? 0 : a.out ? 1 : -1));
    const n = sorted.length, room = (vertical ? c.w : c.h) - 2 * ATTACH_CLEARANCE;
    const step = c.task && n > 1 ? Math.min(PORT_STEP, room / (n - 1)) : 0;
    // Ein Fluss aus einem Stück (gerade zum Nachbarn) behält die Mitte der Seite; die anderen stehen daneben, auf der Seite, von der sie kommen.
    const straight = c.task && n > 1 ? sorted.filter(e => e.r.pieces.length === 1) : [];
    const offsets = new Map();
    if (straight.length === 1){
      const m = straight[0];
      offsets.set(m, 0);
      let lo = 0, hi = 0;
      for (const e of sorted){ if (e === m) continue; if (e.far < m.far || (e.far === m.far && lo === 0 && hi > 0)) offsets.set(e, -step * ++lo); else offsets.set(e, step * ++hi); }
    } else sorted.forEach((e, i) => offsets.set(e, step * (i - (n - 1) / 2)));
    for (const e of sorted){
      const off = Math.max(-room / 2, Math.min(room / 2, offsets.get(e)));
      portOf.set(e.r.f.id + '|' + e.out, { x: base.x + (vertical ? off : 0), y: base.y + (vertical ? 0 : off) });
    }
  }

  const routes = [];
  for (const r of routed){
    const p0 = portOf.get(r.f.id + '|true'), pn = portOf.get(r.f.id + '|false');
    const n = r.pieces.length;
    // Die feste Koordinate jedes Stücks: am Anfang der Port, am Ende der Port, dazwischen die Strecke.
    const fixed = r.pieces.map((p, i) => {
      if (p.h !== undefined) return i === 0 ? p0.y : i === n - 1 ? pn.y : (bands[p.h].kind === 'ch' ? trackY(p) : p0.y);
      return i === 0 ? p0.x : i === n - 1 ? pn.x : (p.v % 2 === 0 ? trackX(p) : p0.x);
    });
    const pts = [{ ...p0 }];
    for (let i = 0; i + 1 < n; i++){
      const a = r.pieces[i];
      pts.push(a.h !== undefined ? { x: fixed[i + 1], y: fixed[i] } : { x: fixed[i], y: fixed[i + 1] });
    }
    pts.push({ ...pn });
    // Ein Stück, dessen beide Enden verschieden liegen (Ports mit Versatz), bekommt einen Knick in der Mitte.
    for (let i = pts.length - 2; i >= 0; i--){
      const a = pts[i], b = pts[i + 1];
      if (Math.abs(a.x - b.x) >= 0.5 && Math.abs(a.y - b.y) >= 0.5){
        const piece = r.pieces[Math.min(i, n - 1)];
        if (piece.h !== undefined){ const mx = (a.x + b.x) / 2; pts.splice(i + 1, 0, { x: mx, y: a.y }, { x: mx, y: b.y }); }
        else { const my = (a.y + b.y) / 2; pts.splice(i + 1, 0, { x: a.x, y: my }, { x: b.x, y: my }); }
      }
    }
    dedupe(pts);
    const obstacles = model.nodes.filter(m => m.id !== r.f.from && m.id !== r.f.to).map(m => { const c = box[m.id]; return { x1: c.cx - c.w / 2, x2: c.cx + c.w / 2, y1: c.cy - c.h / 2, y2: c.cy + c.h / 2 }; });
    routes.push({ f: r.f, pts, obstacles, loop: r.back });
  }

  // Bahnen, Pool, Knoten.
  const di = { pool: null, lanes: {}, nodes: {}, labels: {}, flows: {}, flowLabels: {}, laneOf: {} };
  for (const n of model.nodes){ const l = model.lanes[g.cells.get(n.id).lane]; if (!l.synthetic) di.laneOf[n.id] = l.id; }
  const laneBox = {};
  model.lanes.forEach((l, i) => {
    const first = bands.findIndex(b => b.lane === i), last = bands.length - 1 - [...bands].reverse().findIndex(b => b.lane === i);
    laneBox[l.key] = [R(HEAD), R(bandY[first]), R(totalW - HEAD), R(bandY[last] + rowH[last] - bandY[first])];
    if (!l.synthetic) di.lanes[l.id] = laneBox[l.key];
  });
  if (model.pool) di.pool = [0, 0, R(totalW), R(totalH)];
  for (const n of model.nodes){ const { cx, cy, w, h } = box[n.id]; di.nodes[n.id] = [R(cx - w / 2), R(cy - h / 2), w, h]; }
  for (const { pts } of routes) orthogonal(pts);
  for (const { f, pts } of routes) di.flows[f.id] = pts.map(p => [R(p.x), R(p.y)]);
  const gateways = new Set(model.nodes.filter(n => n.type === 'gateway').map(n => n.id));
  finishLabelsAndFrame(model, di, box, routes, laneBox, measure, gateways);
  return di;
}

// The labels and the frame of the routed picture. The labels keep off every
// symbol, every piece of a flow and every label placed before them: first the
// flows' labels, then those of events and gateways; where every place is
// taken, the one covered least.
function finishLabelsAndFrame(model, di, box, routes, laneBox, measure, gateways){
  const segments = routes.flatMap(r => r.pts.slice(1).map((q, i) => segmentBox(r.pts[i], q)));
  const symbols = model.nodes.map(n => di.nodes[n.id]);
  const taken = [], owners = [];
  for (const { f, pts, loop } of routes){
    if (!f.name) continue;
    // Two flows leaving one corner of a gateway: their labels go to their
    // longest pieces, not both to that corner.
    const alone = !routes.some(o => o.f !== f && o.f.from === f.from && exitSide(o.pts) === exitSide(pts));
    const place = flowLabel(pts, f.name, gateways.has(f.from) && alone, [...symbols, ...segments, ...taken], measure(f.name), !!loop);
    di.flowLabels[f.id] = place;
    taken.push(place);
    owners.push({ boxes: [place], anchor: nearestOnFlow(pts, place[0] + place[2] / 2, place[1] + place[3] / 2) });
  }
  for (const n of model.nodes){
    if (n.type === 'task' || !n.name) continue;
    const place = bestPlace(labelPlaces(box[n.id], measure(n.name), n.type === 'gateway'), [...symbols.filter(b => b !== di.nodes[n.id]), ...segments, ...taken]);
    // bpmn-js centres the text on the box: the box is as wide as a label can be.
    const [x, y, w, h] = place;
    di.labels[n.id] = [R(x + w / 2 - LABEL_WIDTH / 2), R(y), LABEL_WIDTH, R(h)];
    taken.push(place);
    owners.push({ boxes: [place, di.labels[n.id]], anchor: box[n.id] });
  }
  // A lane a label reaches out of grows, and what lies beyond moves, each
  // label with its owner.
  const room = labelRoom(owners, model.lanes.map(l => laneBox[l.key]), box, routes);
  if (room.up || room.down){
    for (const n of model.nodes){ const { cx, cy, w, h } = box[n.id]; di.nodes[n.id] = [R(cx - w / 2), R(cy - h / 2), w, h]; }
    for (const { f, pts } of routes) di.flows[f.id] = pts.map(p => [R(p.x), R(p.y)]);
    if (di.pool){ di.pool[1] -= room.up; di.pool[3] += room.up + room.down; }
  }

  // Flows routed in the outer channels, and labels, can lie beyond the lanes:
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
// The lane set as the layout placed the nodes (spike 2.26, Ben, 2026-10-05): a
// node a rule put in another lane (R1, R12) would otherwise stay in the
// author's. Per node the lane di.laneOf names, the one it stands in on the
// grid; where that differs from the author's, every lane but it and its outer
// lanes loses the node's flowNodeRef, and it gets one before its closing tag.
// Otherwise the text stays as written. Comments and CDATA do not count.
function relane(text, model, di){
  const masked = text.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, m => ' '.repeat(m.length));
  // Bahnen im Text: Id, Präfix, Bereich [Öffnen, Schließen] und äußere Bahn.
  const lanes = [], stack = [];
  for (const m of masked.matchAll(/<(\/?)((?:[\w.-]+:)?)lane\b([^>]*?)(\/?)>/g)){
    if (m[1]){ const l = stack.pop(); if (l) l.close = m.index; continue; }
    const id = (/\sid\s*=\s*["']([^"']+)["']/.exec(m[3]) || [])[1];
    const l = { id, prefix: m[2], open: m.index, openEnd: m.index + m[0].length, close: null, parent: stack[stack.length - 1] || null };
    lanes.push(l);
    if (!m[4]) stack.push(l); else l.close = l.openEnd;
  }
  const byId = new Map(lanes.filter(l => l.id).map(l => [l.id, l]));
  const inLane = i => lanes.filter(l => l.open < i && l.close !== null && i < l.close).sort((p, q) => q.open - p.open)[0] || null;
  const refs = [...masked.matchAll(/([ \t]*)<((?:[\w.-]+:)?)flowNodeRef\s*>\s*([^<]*?)\s*<\/(?:[\w.-]+:)?flowNodeRef\s*>[ \t]*\r?\n?/g)]
    .map(m => ({ start: m.index, end: m.index + m[0].length, indent: m[1], prefix: m[2], id: m[3], lane: inLane(m.index) }));
  const edits = [];
  for (const n of model.nodes){
    const target = di.laneOf && Object.hasOwn(di.laneOf, n.id) ? di.laneOf[n.id] : null;
    const now = model.lanes.find(l => l.nodes.includes(n.id));
    if (!target || (now && now.id === target) || !byId.has(target)) continue;
    const keep = new Set();
    for (let l = byId.get(target); l; l = l.parent) keep.add(l);
    const mine = refs.filter(x => x.id === esc(n.id));
    for (const x of mine) if (!keep.has(x.lane)) edits.push({ at: x.start, end: x.end, put: '' });
    const t = byId.get(target);
    if (!mine.some(x => x.lane === t) && t.close !== null && t.close > t.openEnd){
      const sib = refs.find(x => x.lane === t);
      const indent = sib ? sib.indent : '';
      const pre = sib ? sib.prefix : t.prefix;
      // Vor dem schließenden Tag, auf eigener Zeile, eingerückt wie die anderen flowNodeRefs der Bahn.
      const lineStart = text.lastIndexOf('\n', t.close - 1) + 1;
      const at = /^[ \t]*$/.test(text.slice(lineStart, t.close)) ? lineStart : t.close;
      edits.push({ at, end: at, put: (at === lineStart ? '' : '\n') + indent + '<' + pre + 'flowNodeRef>' + esc(n.id) + '</' + pre + 'flowNodeRef>\n' });
    }
  }
  edits.sort((p, q) => q.at - p.at || q.end - p.end);
  let out = text;
  for (const e of edits) out = out.slice(0, e.at) + e.put + out.slice(e.end);
  return out;
}

export function appendDiagram(xml, model, di){
  const text = relane(String(xml), model, di);
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