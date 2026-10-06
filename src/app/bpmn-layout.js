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
  gatewayLane: true,  // R1  a gateway or end event stands in the lane of its nearest predecessor; a parallel join in that of its split; a parallel split whose arms begin in three or more lanes in the middle one
  pathRows: true,     // R2  two ways of a decision that go on in one lane get rows of their own
  loopAbove: true,    // R3  the steps of a loop stand in the row above their gateway, from there to the left
  branchBelow: true,  // R4  a step that leaves the lane while another way stays in the row stands in the gateway's column, on the side of its target lane
  fan: true,          // R5  fan: the arms of a parallel block in other lanes take the row nearest the split; they leave the split and enter the join vertically, only the nearest arm horizontally by the east and west ports when none lies in the gateways' row
  jumpAbove: true,    // R6  the one step between the exit of a loop and a merge stands in the merge's column
  block: true,        // R8  a parallel block is as wide as the room between its gateways: every element of an arm stands between split and join, no foreign node inside, foreign flows around it where they can; the node before and the node after never in the column of split or join
  rowProbe: true,     // R10 row trial: with crossings, each row R2 gives a way is tried on the other side; taken only with strictly fewer crossings
  firstColumn: true,  // R9  (spike 2.26, Ben) the first shapes of the arms of a parallel gateway are centred on one x, one above the other
  crossProbe: true,   // R12 crossing trial: a way after an exclusive decision in an extra row, a merge in another lane; only with strictly fewer crossings
  combProbe: true,    // R14 comb: for an exclusive split with three or more ways, the heads in different rows tried in one column (R9 as a trial)
  stagger: true,      // R16 two gateways above each other in one column: one tried a column further
  stepAside: true,    // R13 a successor in its predecessor's column, which the flow reaches with three or more bends, tried a column further; so is the nearer of two siblings on one side of a split
  startAlign: true,   // R15 start events in the first column, each in a row of its own, spread around their successor
  endAlign: true,     // R11 ends aligned: an end event in the last column where its row is free up to it and the picture gets no worse; a soft recommendation
});

// The grid's measures.
const GAP_BASE = 48;        // a gap between columns without tracks
const CHANNEL_BASE = 44;    // a channel between two rows without tracks
const EDGE_BASE = 32;       // the channel at the edge of a lane without tracks
const TRACK = 16;           // the distance of two tracks in a channel
const TRACK_MARGIN = 12;    // the margin of a channel beside its outermost track
const EMPTY_ROW = 40;       // the row of an empty lane
const PORT_STEP = 30;       // the distance of two ends on one side of a task
const BEND = 0.005;         // the cost of a bend in the router: half a grid step (length / 100)

// The grid from the model and Mermaid's raw positions:
//   cells: id → { n, lane, row, col, pin }   lane index, row (a number, 0 the backbone, negative above it), column (Mermaid's rank)
//   fwdOut, fwdIn: id → [flow]  forward flows (back edges by depth-first search left out); back: the set of back edge ids
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
  // Back edges: a depth-first search from the start nodes, in the order of the flows.
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
  // The rows of a lane, in order. Rows set to NaN, while starts are docked again (redockStarts()), are left out: sorted
  // with the others they upset the order.
  const rowsOf = lane => [...new Set([...cells.values()].filter(c => c.lane === lane).map(c => c.row))].filter(r => !Number.isNaN(r)).sort((a, b) => a - b);
  // The next row from base in direction dir (−1 above, 1 below) whose cell in col is free: the next existing row, or
  // a new one between, where its cell is taken.
  const newRow = (lane, base, dir, col) => {
    const rows = rowsOf(lane);
    const next = dir < 0 ? rows.filter(r => r < base).pop() : rows.find(r => r > base);
    if (next === undefined) return base + dir;
    if (!at(lane, next, col)) return next;
    let r = (base + next) / 2;
    while (at(lane, r, col)) r = (base + r) / 2;
    return r;
  };
  // A new row right beside base in direction dir, always one of its own (for stacks).
  const freshRow = (lane, base, dir) => {
    const rows = rowsOf(lane);
    const next = dir < 0 ? rows.filter(r => r < base).pop() : rows.find(r => r > base);
    return next === undefined ? base + dir : (base + next) / 2;
  };
  const isSplit = id => fwdOut.get(id).length >= 2;
  return { cells, fwdOut, fwdIn, back, reachable, at, rowsOf, newRow, freshRow, isSplit, lanes: model.lanes.length };
}

const byCol = (g, ids) => [...ids].sort((p, q) => g.cells.get(p).col - g.cells.get(q).col);

// R1. A gateway or an end event stands in the lane of its nearest forward
// predecessor (the one with the greatest column before it); a parallel join
// in the lane of the parallel split from which all its predecessors can be
// reached. End events always (Ben, 2026-10-05: the end is an event, not a
// property of a role). Guarantee: the flow from the predecessor into the
// gateway or the end does not change lane; the way changes lane only after
// the decision. In column order, so the predecessor of an end is settled when
// it is a gateway. Exception (Ben, 2026-10-05, morgenroutine: with three lanes
// the parallel gateways are best centred): a parallel split whose arms begin
// in three or more lanes stands in the middle one of them (with an even number
// the upper of the two in the middle), so each arm has a port of its own; its
// join follows it. Intermediate events stay in their lane (Ben: they belong to
// the role, throw and catch above all).
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
    // Into the lane of its ways (Ben, 2026-10-05, x-tm1 and x-rg3: gateways centred): a split whose three or more ways
    // all begin in one other lane stands in that lane; R9 puts it in the middle row of its ways. Only heads whose lane
    // is settled (no gateways, no ends); a gateway may lie in any lane, intermediate events never change theirs.
    const heads = g.fwdOut.get(id).map(f => g.cells.get(f.to));
    if (c.n.type === 'gateway' && heads.length >= 3 && heads.every(h => h.n.type !== 'gateway' && h.n.tag !== 'endEvent') && heads.every(h => h.lane === heads[0].lane) && heads[0].lane !== c.lane){
      c.lane = heads[0].lane;
      (g.laneSplits ||= new Set()).add(id);
    }
  }
}

// The ways of a split G: per exit the nodes reachable forward, without those
// another way reaches too (the merge and everything after it).
function branchRegions(g, id){
  const regions = g.fwdOut.get(id).map(f => new Set([f.to, ...g.reachable(f.to)]));
  const count = new Map();
  for (const r of regions) for (const x of r) count.set(x, (count.get(x) || 0) + 1);
  return regions.map((r, i) => ({ flow: g.fwdOut.get(id)[i], nodes: [...r].filter(x => count.get(x) === 1) }));
}

// The parallel blocks: per parallel split P the nearest parallel join J from
// which P reaches all predecessors; inner: the nodes of the arms between
// them. [{ P, J, inner: Set }]
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

// R2. Two ways of a decision that both go on in one lane (at least two nodes
// there each, loop steps after R3 not counted) get rows of their own there:
// the way from which a back edge leads into the lane's row stays, else the
// one with the most nodes in the lane, else the first; each other takes a row
// on the side facing the gateway's lane (in its own lane: below). Guarantee:
// two ways of a decision never share a row.
function rulePathRows(g, model){
  const loopSteps = new Set();
  for (const f of model.flows) if (g.back.has(f.id)){ const ch = loopChain(g, f); if (ch) ch.steps.forEach(s => loopSteps.add(s)); }
  for (const id of byCol(g, model.nodes.filter(n => g.isSplit(n.id)).map(n => n.id))){
    const G = g.cells.get(id), regions = branchRegions(g, id);
    for (let lane = 0; lane < g.lanes; lane++){
      const here = regions.map(r => ({ all: r.nodes, nodes: r.nodes.filter(x => { const c = g.cells.get(x); return c.lane === lane && c.row === 0 && !loopSteps.has(x); }) })).filter(r => r.nodes.length >= 2);
      if (here.length < 2) continue;
      // The way from which a back edge leads into the lane's row (from a loop step too) stays.
      const loops = here.map(r => r.all.some(x => model.flows.some(f => g.back.has(f.id) && f.from === x && g.cells.get(f.to).lane === lane && g.cells.get(f.to).row === 0 && !r.all.includes(f.to))));
      let stay = loops.indexOf(true);
      if (stay < 0) stay = here.reduce((m, r, i) => r.nodes.length > here[m].nodes.length ? i : m, 0);
      const dir = lane === G.lane ? 1 : G.lane > lane ? 1 : -1;
      let k = 0;
      here.forEach((r, i) => {
        if (i === stay) return;
        k++;
        for (const x of r.nodes) g.cells.get(x).row = dir * k;
        // For R10: the row R2 made here, with its nodes.
        (g.pathRowGroups = g.pathRowGroups || []).push({ lane, row: dir * k, ids: r.nodes.slice() });
      });
    }
  }
}

// The loop of a back edge u→v: the chain from u backwards over single forward
// predecessors up to the split G that opens it; { G, steps } with the steps in
// the direction of flow, or null (no split, no task in it).
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
  // A step is a task or an intermediate event (Ben, 2026-10-05, ereignis: the way that leads to the end event should
  // have the gateway's east port; the waiting loop over a timer leaves the row, the way to the end stays straight).
  // A chain of gateways only is no loop.
  if (!steps.some(s => ['task', 'inter'].includes(g.cells.get(s).n.type))) return null;
  // Where the chain's way leads on to an end no other way of G reaches, the
  // chain is the way there, not a loop.
  const others = new Set(g.fwdOut.get(x).filter(o => o.to !== steps[0]).flatMap(o => [o.to, ...g.reachable(o.to)]));
  const beyond = [...g.reachable(steps[0])].filter(y => !steps.includes(y) && !others.has(y));
  if (beyond.some(y => g.cells.get(y).n.type === 'end')) return null;
  return { G: x, steps };
}

// R3. The steps of a loop stand in the row above their gateway: the first in
// its column, each further one a column to the left, up to the column after
// the back edge's target; what does not fit goes into the row above, again
// from the gateway's column. Only steps in the gateway's lane (or the
// target's). Guarantee: a loop step costs no column of the backbone; the loop
// is a rectangle above its row.
function ruleLoopAbove(g, model){
  for (const f of model.flows){
    if (!g.back.has(f.id)) continue;
    const chain = loopChain(g, f);
    if (!chain) continue;
    const G = g.cells.get(chain.G), target = g.cells.get(f.to);
    // The row above the gateway's in its lane, above the target's in the target's lane.
    const baseOf = lane => lane === G.lane ? G : lane === target.lane ? target : null;
    const rows = new Map(), colAt = new Map();
    for (const s of chain.steps){
      const c = g.cells.get(s), base = baseOf(c.lane);
      if (!base || c.row !== base.row || c.pin) continue;
      if (!rows.has(c.lane)){ rows.set(c.lane, g.newRow(c.lane, base.row, -1, G.col)); colAt.set(c.lane, G.col); }
      let row = rows.get(c.lane), col = colAt.get(c.lane);
      while (col > target.col && g.at(c.lane, row, col)) col--;                      // a second loop of the same gateway: further left in the same row
      if (col <= target.col){ col = G.col; row = g.newRow(c.lane, row, -1, col); rows.set(c.lane, row); }
      c.row = row; c.col = col; c.pin = { anchor: chain.G, dx: col - G.col };
      colAt.set(c.lane, col - 1);
    }
  }
}

// R4. A step with which a way leaves the lane (a task whose one successor
// lies in another lane), while another way stays in the gateway's row, stands
// in the gateway's column, in the row on the side of the target lane.
// Guarantee: the hand-over stays one vertical column; the exceptional step
// costs no column of the backbone.
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

// R5. Fan. The arms of a parallel block that lie in another lane than the
// split take there the existing row nearest the split's lane (the lowest of a
// lane above, the highest of a lane below); where its cell is taken, the next
// one outwards. The arms leave the split vertically and then turn right, and
// they come from the left to the join's height and enter it vertically (in
// the router: fanCost()). Guarantee: the fan's arms are as short as the lanes
// allow; the fan opens and closes vertically.
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

// R6. The one step between the exit of a loop (a loop step after R3) and a
// merge further right stands in the merge's column, in its predecessor's row
// where that is free, else one further out; the flow drops vertically into
// the merge. Guarantee: a long jump costs no column and ends vertically in
// its merge.
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

// R9 (spike 2.26, Ben, 2026-10-05): the first shapes of the arms of a
// parallel gateway are centred on one x, one above the other. Read as: per
// parallel split the first nodes of its ways (not a join a way leads to
// directly, not a node already pinned); two of them in one row of a lane: the
// second way takes the next row below with its nodes of that row. The group
// goes to g.columnGroups; R7 puts it in one column.
// So does an exclusive block (Ben, 2026-10-05, x-wv6: the intermediate events
// lay scattered though they left the same gateway; he stacked them between the
// two gateways): a split that is no parallel gateway, with three or more ways
// that all run together again at one merge. exclusiveBlock() gives that merge,
// or null.
function exclusiveBlock(g, model, id, min = 3){
  if (g.fwdOut.get(id).length < min) return null;
  const G = g.cells.get(id);
  const merges = model.nodes.filter(m => m.type === 'gateway' && m.tag !== 'parallelGateway' && m.id !== id && g.fwdIn.get(m.id).length >= 2 && g.cells.get(m.id).col > G.col
    && g.fwdOut.get(id).every(f => f.to === m.id || g.reachable(f.to).has(m.id)) && g.fwdIn.get(m.id).every(f => f.from === id || g.reachable(id).has(f.from)));
  return merges.length ? byCol(g, merges.map(m => m.id))[0] : null;
}
function ruleFirstColumn(g, model){
  g.columnGroups = [];
  // Two alternatives one above the other (Ben, 2026-10-05, krankheit: he made the alternatives at "Notfall?" easier
  // to read): a split that is no parallel gateway, with exactly two ways that run together again at a merge, both
  // heads still in its row (none directly the merge, none pinned).
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
    // The way in the split's row stays there.
    firsts.sort((a, b) => (b.c.lane === P.lane && b.c.row === P.row) - (a.c.lane === P.lane && a.c.row === P.row));
    // Three or more heads in the split's row spread around it (Ben, 2026-10-05, x-dg2: he centred the first steps
    // after the start): the middle one (in the order of the flows) stays, those before go up, those after down; so
    // the split stands in the middle of its arms and the backbone runs straight through. Adds to the centring of the
    // split below, which applies where the arms are spread otherwise.
    const own = firsts.filter(f => f.c.lane === P.lane && f.c.row === P.row);
    const done = new Set();
    if (own.length >= 3){
      const mid = Math.floor((own.length - 1) / 2), row0 = P.row;
      const move = (f, row) => { for (const x of f.r.nodes){ const c = g.cells.get(x); if (c.lane === P.lane && c.row === row0 && !c.pin) c.row = row; } done.add(f); };
      // Per arm a new row right beside the one before (Ben, 2026-10-05, x-wv6: the intermediate events were not
      // stacked): no existing row further away in which nodes already stand elsewhere.
      let row = row0;
      for (let i = mid - 1; i >= 0; i--){ row = g.freshRow(P.lane, row, -1); move(own[i], row); }
      row = row0;
      for (let i = mid + 1; i < own.length; i++){ row = g.freshRow(P.lane, row, 1); move(own[i], row); }
    }
    // Two alternatives (Ben, 2026-10-05, krankheit: in an exclusive block with two tasks the second is stacked below,
    // centred; three rows, one above and one below, were very inelegant): the first way stays straight in the row of
    // split and merge, the second goes into a new row right below, in the same column.
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
    // Centred in the lane (Ben, 2026-10-05, x-dg2: he centred the parallel gateways; as R1 does across lanes): where
    // the arms begin in three or more rows of the split's lane, split and join stand in the middle one of them (with
    // an even number the upper of the two in the middle); so each arm has a port of its own.
    const armRows = [...new Set(g.fwdOut.get(id).map(f => g.cells.get(f.to)).filter(c => c.lane === P.lane).map(c => c.row))].sort((a, b) => a - b);
    if (armRows.length >= 3){
      const mid = armRows[Math.floor((armRows.length - 1) / 2)];
      P.row = mid;
      const blk = parallelBlocks(g, model).find(b => b.P === id), J = blk && g.cells.get(blk.J);
      if (J && J.lane === P.lane && !J.pin) J.row = mid;
    }
    // The join of a block (parallel or exclusive) stands in its split's row (Ben, 2026-10-05, x-wv6: split and join
    // of a block belong in one row; a join that only gathers starts and a split that only fans out into ends make no
    // block).
    const Jid = P.n.tag === 'parallelGateway' ? parallelBlocks(g, model).find(b => b.P === id)?.J : exclusiveBlock(g, model, id, 2);
    const Jc = Jid && g.cells.get(Jid);
    if (Jc && Jc.lane === P.lane && !Jc.pin) Jc.row = P.row;
  }
}

// A split R1 put in the lane of its ways and that makes no block (x-rg3) stands likewise in the middle row of its
// ways; at the start of each run from R7 on, so that it stands in the middle after a trial (R10, R12) that moves the
// ways' rows too.
function centreLaneSplits(g, model){
  for (const id of g.laneSplits || []){
    const P = g.cells.get(id);
    if (P.n.tag === 'parallelGateway' || exclusiveBlock(g, model, id)) continue;
    const armRows = [...new Set(g.fwdOut.get(id).map(f => g.cells.get(f.to)).filter(c => c.lane === P.lane).map(c => c.row))].sort((a, b) => a - b);
    if (armRows.length >= 3) P.row = armRows[Math.floor((armRows.length - 1) / 2)];
  }
}

// R15. Start events left-aligned (Ben, 2026-10-05, x-wv6: the start events were
// not left-aligned; he aligned them, docked them to the parallel gateway, and
// moved the fourth one up, where its flow runs). Where two or more start events
// stand in one row of a lane, each gets one of its own: the starts with the
// same successor spread around its row (the middle one stays, those before go
// up, those after down, as the arms after proposal 7); the largest group stays
// in the row, each further one goes into new rows above. R7 then puts each
// start in the first column, since nothing precedes it in its row any more.
// Guarantee: all starts of a lane stand left-aligned.
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
    // The one successor of a start that got a row of its own this way follows it, where it has no other
    // predecessor; where it is the split of a block, with its join (Ben, 2026-10-05, x-wv6: he moved the fourth
    // start event up, where its flow runs).
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

// After the box (R8): starts with the same successor in its lane stand around
// its row again, in new rows right beside it (R15). Returns whether anything
// moved.
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

// R7. Close the columns: each column is the longest way in Mermaid's order; a
// successor in another row may share its predecessor's column, one in the same
// row stands one further right, and the order of each row stays Mermaid's.
// Pinned nodes (R3, R4, R6) keep their distance to their anchor. Guarantee: no
// column without a node; the order from left to right is Mermaid's.
function ruleCompact(g, model, rules){
  // Mermaid's order, but no node before one of its forward predecessors.
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
  // Parallel splits without a join: there too the node before never stands in their column (Ben, 2026-10-05, morgenroutine).
  const lonePar = new Set(model.nodes.filter(n => n.tag === 'parallelGateway' && g.isSplit(n.id) && !blocks.some(b => b.P === n.id)).map(n => n.id));
  const isPlaced = c => placed.get(c.lane + '|' + c.row + '|' + c.col) === c;
  const pos = c => c.lane * 1e6 + c.row, between = (o, a, b) => (pos(o) - pos(a)) * (pos(o) - pos(b)) < 0;
  const lastInRow = new Map();
  // Vertical hand-overs in a column (predecessor and successor in the same column) keep the cells between them free.
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
      // A pinned predecessor counts with its anchor's column, once that is placed.
      const pc = p.pin ? (!p.pin.late && isPlaced(g.cells.get(p.pin.anchor)) ? g.cells.get(p.pin.anchor).col + p.pin.dx : null) : isPlaced(p) ? p.col : null;
      if (pc === null) continue;
      // The predecessor's column only where the vertical hand-over is free: no cell between them taken.
      const sameRow = p.lane === c.lane && p.row === c.row;
      const blocked = !sameRow && [...placed.values()].some(o => o.col === pc && o !== p && between(o, p, c));
      // R8: an element of an arm never stands in the split's column, the join never in that of an arm's element.
      // Likewise (Ben, 2026-10-05, x-wv3): the node before a parallel split and the one after a parallel join never
      // stand in the gateway's column, in another row neither, but one to the left or right.
      const edge = rules.block && blocks.some(b => (p.n.id === b.P && b.inner.has(c.n.id)) || (c.n.id === b.J && b.inner.has(p.n.id))
        || (c.n.id === b.P && !b.inner.has(p.n.id)) || (p.n.id === b.J && !b.inner.has(c.n.id) && c.n.id !== b.P))
        || (rules.block && lonePar.has(c.n.id))
        // Likewise before a split R1 put in the lane of its ways (Ben, 2026-10-05, x-rg3): it needs its north and
        // south ports for the ways; with the node before in its column, the flow would come in vertically.
        || (g.laneSplits?.has(c.n.id) ?? false);
      col = Math.max(col, pc + (sameRow || blocked || edge ? 1 : 0));
    }
    const last = lastInRow.get(c.lane + '|' + c.row);
    if (last !== undefined) col = Math.max(col, last + 1);
    // R8: a foreign node does not stand in a closed parallel block (split and join placed already).
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
  // Pinned nodes after their anchor; those pinned to a later merge last.
  for (const c of order){
    if (!c.pin) continue;
    if (c.pin.late){ late.push(c); continue; }
    put(c, g.cells.get(c.pin.anchor).col + c.pin.dx);
  }
  for (const c of late) put(c, g.cells.get(c.pin.anchor).col + c.pin.dx);
}

// R8, distance to the box (Ben, 2026-10-05, x-dg2: the "insurance" gateway had
// no distance to the box of the parallel flow; one row below it worked
// better). The box of a parallel block: from the split's column to the join's,
// in each lane where the block holds two or more nodes over the rows they take
// there. The foreign nodes inside a lane's box that are not pinned leave it
// together, to one side: below when at least half of them stand in its lower
// half, else above. Each of their rows becomes a new row beyond the box's edge,
// in their order, so a stack stays whole. After R7; R7 runs again after it.
// Returns whether a node moved.
function ruleBlockBox(g, model){
  let moved = false;
  for (const b of parallelBlocks(g, model)){
    const ids = [b.P, b.J, ...b.inner], cs = ids.map(id => g.cells.get(id));
    const P = g.cells.get(b.P), J = g.cells.get(b.J);
    // The box spans in each lane the rows the block takes there (Ben, 2026-10-05, x-wv6: a block over three lanes;
    // reckoned over all lanes, a foreign node in the middle lane would never leave the box). A lane's foreign nodes
    // go to one side together, the majority's, and keep their order (else the box tore a stack apart).
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

// The rules on the grid, then the grid in pixels with the flows routed on it:
// the finished DI.
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

// A trial run from R7 on, for the trials R10 to R16 and R11: the finished DI,
// its quality and the columns R7 gave; afterwards the cells stand as before.
function runGrid(g, model, measure, rules){
  const once = reroute => {
    const before = new Map([...g.cells.values()].map(c => [c, { lane: c.lane, row: c.row, col: c.col, pin: c.pin }]));
    const di = finishGrid(g, model, measure, rules, reroute);
    const cols = new Map([...g.cells.values()].map(c => [c, c.col]));
    for (const [c, v] of before) Object.assign(c, v);
    return { di, q: gridQuality(di, model), cols, last: Math.max(...cols.values()) };
  };
  // The router's second pass makes each flow cheaper, the picture not always better: both are reckoned, the better
  // one taken (crossings, flows through nodes, overlaps, lines, labels, shared pieces, bends).
  const a = once(true);
  const b = once(false);
  for (const k of ['crossings', 'through', 'overlaps', 'lines', 'labels', 'shared', 'bends']){
    if (a.q[k] < b.q[k]) return a;
    if (b.q[k] < a.q[k]) return b;
  }
  return b;
}

// R10. Row trial (Ben, 2026-10-05: with crossings, try whether swapping the
// rows helps). Where the picture has crossings, each row R2 gave a way is
// tried on the other side (+k → −k), one after the other; nodes a later rule
// moved or pinned (R3, R4, R5, R6, R9) stay where they are. A trial is taken
// only with strictly fewer crossings, without more flows through foreign
// nodes, lines or labels on flows, and without overlapping nodes; else R2's
// row stays. Guarantee: the trial never makes the picture worse. Ben's rule
// (2026-10-05, after x-rg2 and x-wv4): no swap with more breaks, no swap with
// more crossings. The lane gets narrower again by itself, since the bands come
// from the rows taken.
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

// R12. Crossing trial (Ben, 2026-10-05, reklamation: with many crossings after
// exclusive gateways in a lane, check whether an extra row helps; with many
// crossings, check whether a merge gateway should change lane). After R10, as
// long as the picture has crossings. Trials: (a) per split that is no parallel
// gateway, and per way that goes on in the gateway's row while another does
// too: the way's nodes in that row into a new row right above or below; (b)
// per merge that is no parallel gateway: each other lane between the highest
// and the lowest lane of its predecessors and successors, there in the row of
// a predecessor or successor, else in the backbone. Each round reckons every
// trial on its own and takes the best where it has strictly fewer crossings
// and makes nothing else worse (as R10); until none helps. Guarantee: the
// trial never makes the picture worse.
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

// R14. Comb (Ben, 2026-10-05, u13: A and C one column further, all ways of
// "Was?" begin in one column). R9 as a trial for splits that are no parallel
// gateway, with three or more forward ways; after R12, since only R2, R10 and
// R12 spread the ways over rows. The heads of the ways (each way's first node,
// not pinned, no merge), per row the one furthest left, are tried in one
// column (g.columnGroups, R7 as for R9). The trial makes no new rows. Taken
// only where no measure of quality rises. With two ways the vertical hand-over
// stays in the gateway's column.
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

// R13. One column further (Ben, 2026-10-05, x-rg2: he widened the distance at
// "Wir schreiben keine Briefe" the same way, to cut bends). After R14: a
// successor that stands in its predecessor's column (R7 allows that in another
// row), but which the forward flow reaches only with three or more bends (the
// vertical way is blocked, the flow goes out and back), is tried one column to
// the right (a minimum column in R7). Taken only where the flow has fewer
// bends and no measure of quality rises. Guarantee: a change of row is a
// straight piece or an L where that can be.
function ruleStepAside(g, model, measure, rules){
  g.asideCol = new Map();
  let best = runGrid(g, model, measure, rules);
  const bends = (di, f) => Math.max(0, (di.flows[f.id] || []).length - 2);
  const keys = ['crossings', 'through', 'overlaps', 'lines', 'labels'];
  // Where the flow shares a piece with another (Ben, 2026-10-05, r22 and r15: he inserted a column so the offset
  // frees an exit; the successor's top entry is needed by a second flow too), the successor is likewise tried a
  // column further; taken where the shared pieces get fewer and no measure of quality rises.
  const sharedOf = (di, f) => sharedPieces(di, model).filter(pair => pair.includes(f.id)).length;
  for (const f of model.flows){
    if (g.back.has(f.id)) continue;
    const a = g.cells.get(f.from), b = g.cells.get(f.to);
    if (b.pin || best.cols.get(a) !== best.cols.get(b)) continue;
    const many = bends(best.di, f) >= 3, shares = sharedOf(best.di, f) > 0;
    if (!many && !shares) continue;
    // A node a flow before has already moved keeps that shift when this trial fails, as in the loop below.
    const was = g.asideCol.get(b.n.id);
    g.asideCol.set(b.n.id, best.cols.get(b) + 1);
    const t = runGrid(g, model, measure, rules);
    const ok = keys.every(k => t.q[k] <= best.q[k]) && ((many && bends(t.di, f) < bends(best.di, f)) || (shares && t.q.shared < best.q.shared));
    if (ok) best = t; else if (was === undefined) g.asideCol.delete(b.n.id); else g.asideCol.set(b.n.id, was);
  }
  // Siblings (Ben, 2026-10-05, x-tm1: he moved a task to the next column so the gateway's north and east exits can
  // both be used; reklamation: there he removed crossings): where a successor of a split stands in its column and
  // another successor lies further away on the same side, the near one is tried a column further; the far one gets
  // the port towards it, the near one the east port. Taken with fewer crossings or bends, where no measure of
  // quality rises.
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

// R16. Stagger gateways (Ben, 2026-10-05, x-wv6: with several exclusive
// gateways above each other it can help to move them into different columns,
// since their south and north exits are then free more often). After R13:
// where two gateways stand in one column, one is tried a column to the right
// (a minimum column in R7; what comes after it moves along), first the lower,
// then the upper. Per round the best trial is taken where no measure of
// quality rises and the picture has fewer shared pieces, or as many and fewer
// bends; up to four rounds.
function ruleStagger(g, model, measure, rules){
  g.asideCol = g.asideCol || new Map();
  let best = runGrid(g, model, measure, rules);
  const keys = ['crossings', 'through', 'overlaps', 'lines', 'labels'];
  const better = (t, b) => keys.every(k => t.q[k] <= b.q[k]) && (t.q.shared < b.q.shared || (t.q.shared === b.q.shared && t.q.bends < b.q.bends));
  for (let round = 0; round < 4; round++){
    // A gateway above or below another node of its column too, in any lane (Ben, 2026-10-05, r09: he inserted a
    // buffer column to open the south exit of "wohin"); then the gateway moves.
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

// R11. Align the ends (Ben, 2026-10-05: aligning the ends is a soft
// recommendation, his preference of style; it may overrule no other rule).
// Last, on the picture all other rules give: an end event that does not stand
// in the last column is tried there (R7 gives it the last column as its
// minimum; lane and row stay, the same column means the same x). Not where a
// node stands right of it in its row, and not for a pinned end. One after the
// other, the one nearest the last column first. A trial is taken only where
// the picture gets no wider and no measure of quality rises (crossings, flows
// through nodes, overlaps, pieces on one line, labels on flows); on a tie the
// alignment wins. Guarantee: the alignment never makes the picture worse; what
// does not fit stays where the rules put it.
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

// The pieces of every flow: { f: flowId, a: [x, y], b: [x, y] }.
function segmentsOf(di, model){
  const segs = [];
  for (const f of model.flows){
    const pts = di.flows[f.id] || [];
    for (let i = 1; i < pts.length; i++) segs.push({ f: f.id, a: pts[i - 1], b: pts[i] });
  }
  return segs;
}

// Pieces of two flows on one line, touching end to end or overlapping. lines:
// those running against each other (head on), and those running the same way
// whose flows share no node; shared: [[flowId, flowId], …] per pair of pieces
// running the same way whose flows share their source or their target, but not
// two flows running together into a gateway (allowed, as in tests/bpmn-rules.mjs).
// One count for R13 (sharedPieces()) and for gridQuality().
function onOneLine(segs, model){
  const flowOf = new Map(model.flows.map(f => [f.id, f]));
  const isGateway = id => model.nodes.find(n => n.id === id)?.type === 'gateway';
  let lines = 0;
  const shared = [];
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++){
    const p = segs[i], q = segs[j];
    if (p.f === q.f) continue;
    let dp, dq;
    if (p.a[1] === p.b[1] && q.a[1] === q.b[1] && p.a[1] === q.a[1] && Math.min(Math.max(p.a[0], p.b[0]), Math.max(q.a[0], q.b[0])) - Math.max(Math.min(p.a[0], p.b[0]), Math.min(q.a[0], q.b[0])) >= 0){ dp = Math.sign(p.b[0] - p.a[0]); dq = Math.sign(q.b[0] - q.a[0]); }
    else if (p.a[0] === p.b[0] && q.a[0] === q.b[0] && p.a[0] === q.a[0] && Math.min(Math.max(p.a[1], p.b[1]), Math.max(q.a[1], q.b[1])) - Math.max(Math.min(p.a[1], p.b[1]), Math.min(q.a[1], q.b[1])) >= 0){ dp = Math.sign(p.b[1] - p.a[1]); dq = Math.sign(q.b[1] - q.a[1]); }
    else continue;
    const A = flowOf.get(p.f), B = flowOf.get(q.f);
    if (dp !== dq || (A.from !== B.from && A.to !== B.to)) lines++;
    else if (!(A.to === B.to && isGateway(A.to))) shared.push([p.f, q.f]);
  }
  return { lines, shared };
}

// The pairs of flows whose pieces share a line (onOneLine()).
const sharedPieces = (di, model) => onOneLine(segmentsOf(di, model), model).shared;

function gridQuality(di, model){
  const segs = segmentsOf(di, model);
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
  const { lines, shared } = onOneLine(segs, model);
  let labels = 0;
  const hits = (box, own) => segs.some(sg => !own(sg.f) && Math.max(sg.a[0], sg.b[0]) > box[0] && Math.min(sg.a[0], sg.b[0]) < box[0] + box[2] && Math.max(sg.a[1], sg.b[1]) > box[1] && Math.min(sg.a[1], sg.b[1]) < box[1] + box[3]);
  for (const n of model.nodes){ const b = di.labels[n.id]; if (b && hits(b, f => model.flows.some(x => x.id === f && (x.from === n.id || x.to === n.id)))) labels++; }
  for (const f of model.flows){ const b = di.flowLabels[f.id]; if (b && hits(b, x => x === f.id)) labels++; }
  const bends = model.flows.reduce((n, f) => n + Math.max(0, (di.flows[f.id] || []).length - 2), 0);
  return { crossings, through, overlaps, lines, labels, shared: shared.length, bends };
}

// From R7 to the finished DI: close the columns, bands, router, pixels, labels.
// Changes the cells' columns (R7) and rows (R8, R15); runGrid() saves and
// restores them. reroute: whether the router runs its pair trial and second
// pass.
function finishGrid(g, model, measure, rules, reroute = true){
  centreLaneSplits(g, model);
  // R9: R7 until each group of first nodes of ways stands in one column; each
  // round from Mermaid's columns, the minimum columns only grow.
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
  // Where the box moved rows, the starts dock to their successor again (R15).
  if (boxed && rules.startAlign && redockStarts(g, model)) compactAll();

  // The rows of each lane numbered; bands (channel, row, channel, …) from top
  // to bottom over all lanes; columns and gaps from left to right.
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
  const place = new Map();    // id → { band, xo } (xo: 2*col+1; gap g: 2*g)
  const cellAt = new Map();   // band|xo → id
  for (const c of g.cells.values()){
    const band = rowBand.get(c.lane + '|' + laneRows[c.lane].indexOf(c.row));
    place.set(c.n.id, { band, xo: 2 * c.col + 1, cell: c });
    cellAt.set(band + '|' + (2 * c.col + 1), c.n.id);
  }
  const free = (band, xo) => !cellAt.has(band + '|' + xo);
  const channels = bands.map((b, i) => i).filter(i => bands[i].kind === 'ch');

  // ---- Router ----
  // A way is a sequence of pieces, horizontal { h: band, x1, x2 } or vertical
  // { v: xo, b1, b2 }; the ends name the side at the symbol. Per flow the
  // templates possible on the grid are made, and the one with the fewest
  // conflicts is taken: cells crossed 1000, a port of a gateway or event that
  // a flow of the other direction uses 100, a piece on one line with a foreign
  // piece in a row or column 3, a crossing 1, the length in grid steps / 100.
  const routed = [];          // { f, pieces, sides: [sideS, sideT], back }
  const portUse = new Map();  // id|side → { in, out }
  const H = (h, x1, x2) => ({ h, x1, x2 }), V = (v, b1, b2) => ({ v, b1, b2 });
  const sideOfFirst = (p, from) => p.h !== undefined ? (p.x2 > from.xo || (p.x2 === from.xo && p.x1 < from.xo) ? 'right' : 'left') : (p.b2 > from.band ? 'bottom' : 'top');
  const sideOfLast = (p, to) => p.h !== undefined ? (p.x1 < to.xo ? 'left' : 'right') : (p.b1 < to.band ? 'top' : 'bottom');
  const cellsCrossed = pieces => {
    let n = 0;
    // A corner between two pieces lies in a cell of a row: that must be free.
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
  // An end piece at a task can be offset along the side (ports beside each other): on one line with another it
  // counts little; at a gateway or event in full. A flow of one piece that begins at a task and goes into an event
  // counts in full there (Ben, 2026-10-05, x-rg1: he removed two bends; the flow from "Geldeingang" shared the line
  // into the end's west port with the straight flow from "Geld eintreiben", and that cost only 0.5, since its piece
  // begins at a task). Not into a gateway: flows run together there.
  const endWeight = (f, pieces, i) => {
    const id = i === 0 ? f.from : i === pieces.length - 1 ? f.to : null;
    if (pieces.length === 1 && !['task', 'gateway'].includes(g.cells.get(f.to).n.type)) return 3;
    return id && g.cells.get(id).n.type === 'task' ? 0.5 : 3;
  };
  const laneOfBand = b => bands[b].lane;
  // R8: the room of a parallel block in bands and columns; a piece of a
  // foreign flow in it costs 6: more than a piece on a foreign line (3) and
  // than the one to three crossings the way around it mostly costs; a cost, no
  // ban (Ben: it does not always work).
  const blockRooms = rules.block ? parallelBlocks(g, model).map(b => {
    const ids = [b.P, b.J, ...b.inner], bs = ids.map(id => place.get(id).band);
    return { ids: new Set(ids), x1: place.get(b.P).xo, x2: place.get(b.J).xo, b1: Math.min(...bs), b2: Math.max(...bs) };
  }) : [];
  // R5: an arm of the fan into another row leaves the split vertically and enters the join vertically; a horizontal
  // piece there costs 1. Exception (Ben, 2026-10-05, at first for parallel blocks only): where no arm lies in the
  // split's row, the nearest arm (the least distance, only where it is unique) leaves it horizontally by the east
  // port; a vertical start costs it 1. Mirrored at the join: where no arm lies in its row, the nearest enters
  // horizontally by the west port. The other arms as before. Guarantee: the nearest arm crosses none further away;
  // the arms make Ls lying one inside the other.
  const fanBlocks = rules.fan ? parallelBlocks(g, model) : [];
  const lonePar = new Set(model.nodes.filter(n => n.tag === 'parallelGateway' && g.isSplit(n.id) && !fanBlocks.some(b => b.P === n.id)).map(n => n.id));
  // An arm's distance: rows and columns together (Ben, 2026-10-05, x-wv4: a shape much further away horizontally
  // gives way to the nearer one for the east or west port). An arm in the gateway's row turns the exception off,
  // as before.
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
    const sameBand = place.get(own.from).band === place.get(own.to).band;   // the arm in the gateways' row goes straight
    for (const b of fanBlocks){
      if (sameBand) break;
      const near = fanNear.get(b.P);
      if (own.from === b.P && b.inner.has(own.to)) n += own.id === near.out ? (pieces[0].v !== undefined ? 1 : 0) : (pieces[0].h !== undefined ? 1 : 0);
      if (own.to === b.J && b.inner.has(own.from)){ const last = pieces[pieces.length - 1]; n += own.id === near.in ? (last.v !== undefined ? 1 : 0) : (last.h !== undefined ? 1 : 0); }
      // The flow out of the join leaves horizontally, the one into the split enters horizontally (Ben, 2026-10-05,
      // x-wv3: the node after stands offset to the right; the exit downwards would take the port an arm needs).
      if (own.from === b.J && !b.inner.has(own.to) && pieces[0].v !== undefined) n += 1;
      if (own.to === b.P && !b.inner.has(own.from) && pieces[pieces.length - 1].v !== undefined) n += 1;
    }
    // Likewise into a parallel split without a join (Ben, 2026-10-05, morgenroutine: the split is centred, its arms
    // need the north, east and south ports).
    if (!sameBand && rules.fan && lonePar.has(own.to) && pieces[pieces.length - 1].v !== undefined) n += 1;
    // And into a split in the lane of its ways (x-rg3).
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
    // A horizontal piece in a channel of a foreign lane: the flow back belongs in its own.
    const ownLanes = new Set([g.cells.get(own.from).lane, g.cells.get(own.to).lane]);
    for (const p of pieces) if (p.h !== undefined && bands[p.h].kind === 'ch' && !ownLanes.has(laneOfBand(p.h))) n += 2;
    for (const r of routed){
      if (r.f === own || r.off) continue;
      // Head on into one port (Ben, 2026-10-05, x-wv4): two flows into one target whose last pieces lie on one line
      // and whose pieces before come from opposite sides in one column (or row) (a ⊤, no running together); costs
      // as a piece on one line. One of them then takes the port on its side.
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
    // A bend costs half a grid step (Ben, 2026-10-05, hund2: try another exit to cut the bends of a line): with the
    // same length and conflicts the way with fewer bends wins, say out sideways rather than out below and at once to
    // the side. So that no bend is saved by a flow to the right taking a task from behind: where the target lies
    // right of the source or in its column, entering a task from the right or leaving it to the left costs two
    // bends (a gateway may be entered from the right, as Ben did in hund2).
    const ahead = t.xo >= s.xo;
    const behind = ahead ? (g.cells.get(f.to).n.type === 'task' && sideOfLast(pieces[pieces.length - 1], t) === 'right' ? 1 : 0) + (g.cells.get(f.from).n.type === 'task' && sideOfFirst(pieces[0], s) === 'left' ? 1 : 0) : 0;
    return cellsCrossed(pieces) * 1000 + portPenalty(f.from, sideOfFirst(pieces[0], s), true) + portPenalty(f.to, sideOfLast(pieces[pieces.length - 1], t), false) + conflicts(pieces, f) + length(pieces) / 100 + (pieces.length - 1 + 2 * behind) * BEND;
  };
  // The templates of a flow s→t.
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
        out.push([V(xs, ys, ys + d), H(ys + d, xs, gx), V(gx, ys + d, yt), H(yt, gx, xt)]);          // out over the channel, in from the side
        out.push([V(xs, ys, ys - d), H(ys - d, xs, gx), V(gx, ys - d, yt), H(yt, gx, xt)]);          // out on the other side, in from the side
        out.push([H(ys, xs, gx), V(gx, ys, yt - d), H(yt - d, gx, xt), V(xt, yt - d, yt)]);          // out sideways, in over the channel
        out.push([H(ys, xs, gx), V(gx, ys, yt), H(yt, gx, xt)]);                                    // out and in sideways
      }
      return out;
    }
    if (xt < xs){
      out.push([H(ys, xs, xt), V(xt, ys, yt)]);                                   // L to the left: first horizontal in the row, then vertical into the target
      out.push([V(xs, ys, yt), H(yt, xs, xt)]);                                   // L to the left: first vertical, then in the target's row
    }
    if (xt > xs){
      out.push([V(xs, ys, yt), H(yt, xs, xt)]);                                   // L: first vertical
      out.push([H(ys, xs, xt), V(xt, ys, yt)]);                                   // L: first horizontal
      out.push([H(ys, xs, xs + 1), V(xs + 1, ys, yt), H(yt, xs + 1, xt)]);        // Z over the gap right of the source
      out.push([H(ys, xs, xt - 1), V(xt - 1, ys, yt), H(yt, xt - 1, xt)]);        // Z over the gap left of the target
      const d = Math.sign(yt - ys);
      out.push([V(xs, ys, yt - d), H(yt - d, xs, xt), V(xt, yt - d, yt)]);        // Z over the channel at the target
      out.push([V(xs, ys, ys + d), H(ys + d, xs, xt), V(xt, ys + d, yt)]);        // Z over the channel at the source
      for (const ch of channels) out.push([H(ys, xs, xs + 1), V(xs + 1, ys, ch), H(ch, xs + 1, xt - 1), V(xt - 1, ch, yt), H(yt, xt - 1, xt)]);
      // Over a channel and vertically into the target, from the side facing away from the source too (Ben,
      // 2026-10-05, x-wv4: round below into the south port, rather than head on against another flow in the west port).
      for (const ch of channels){
        if (ch === yt) continue;
        out.push([V(xs, ys, ch), H(ch, xs, xt), V(xt, ch, yt)]);
        out.push([H(ys, xs, xs + 1), V(xs + 1, ys, ch), H(ch, xs + 1, xt), V(xt, ch, yt)]);
      }
      return out;
    }
    // Backwards across rows: a channel, vertical at source and target; else out sideways over a gap, in sideways or from above or below.
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
  // Pair trial (Ben, 2026-10-05, x-rg1: he removed two bends): each two flows into one event are taken out and laid
  // again in both orders, each on its cheapest way; the pair with the smaller sum stays. One at a time the router
  // finds no swap: in x-rg1 "Geldeingang" took the end's free south port in the first pass, before the longer flow
  // "kein Regress" was laid, and that one had to go round above. Before the second pass, so that it sees the swapped
  // ways already (else a detour stayed that avoided the old way).
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
    // Only into an event: it has four ports and no offset; at a task the ends lie beside each other, into a gateway
    // flows run together.
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

  // Second pass (Ben, 2026-10-05, r22: he inserted a column so the offset frees an exit): each flow is laid once more,
  // now with all others in the picture (the flows back came last in the first pass); it changes only where a way is
  // strictly cheaper than its present one. Up to three rounds, as long as a flow changes (Ben, 2026-10-05, x-tm1: a
  // flow laid again before another still saw that one's old port taken and stayed on the detour).
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
  // ---- Tracks in channels and gaps ----
  // Per channel the horizontal pieces in it, by the side their flow comes
  // from (from above, from below), shorter spans inside; per gap the vertical
  // ones likewise (from the left, from the right).
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
      // The side from which the flow comes into the channel: the band of the piece before, or the source's.
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
  // Room for the label (Ben, 2026-10-05, demo5 and x-rg2: where a text collides, check whether the break goes when
  // the horizontal distance grows): a named flow that goes straight from one column to the next gets a gap in which
  // its label fits between the two symbols; behind a gateway 10 px after its tip (as flowLabelPlaces()), else 6 px,
  // and 6 px before the target. Guarantee: the label of a straight flow lies on none of its nodes.
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
  // Room for a gateway's name (Ben, 2026-10-05, r01: widen the distance between the gateway and the next node a
  // little, and the collision goes): where flows take the top and bottom ports, the name finds no room above or
  // below and goes to a corner (labelPlaces()); where it fits neither right nor left between the gateway and the
  // neighbour in its row, the gap on the right gets so wide that it stands there 2 px after the tip and 6 px before
  // the next node, as the flow labels above.
  for (const c of g.cells.values()){
    if (c.n.type !== 'gateway' || !c.n.name) continue;
    const at = side => routed.some(r => (r.f.from === c.n.id && r.sides[0] === side) || (r.f.to === c.n.id && r.sides[1] === side));
    if (!at('top') || !at('bottom')) continue;
    const band = place.get(c.n.id).band, need = 2 + measure(c.n.name).w + 6;
    // How much is missing between the gateway and its neighbour in column col + d; the gap between them has index k.
    // Only a task reaches so high that it meets the corner above or below the gateway.
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

  // Ports: at a task several ends per side beside each other, sorted by the
  // piece after them, so that they do not cross; a gateway and an event at
  // their tip.
  // The order of the ends (Ben, 2026-10-05, r09: he resolved a crossing by changing the order of the flows into B2):
  // the piece after an end comes from one side (from left or right at a top or bottom side, from above or below at
  // a left or right one); the nearer it lies to the symbol, the further out its end stands on that side, and the
  // flow further away passes inside it. A straight flow keeps the middle. Sorting by the piece's place alone,
  // without its side, let ends from the left or from above cross.
  const ends = new Map(); // id|side → [{ r, out, far }]
  for (const r of routed){
    const farOf = (atStart) => {
      const n = r.pieces.length;
      if (n === 1) return 0;
      const [p, q] = atStart ? [r.pieces[0], r.pieces[1]] : [r.pieces[n - 1], r.pieces[n - 2]];
      const own = place.get(atStart ? r.f.from : r.f.to);
      // q lies across p: its distance to the symbol and the side it comes from (−1 left or above, +1 right or below).
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
    // A flow of one piece (straight to the neighbour) keeps the middle of the side; the others stand beside it, on the side they come from.
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
    // The fixed coordinate of each piece: at the start the port, at the end the port, between them the track.
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
    // A piece whose two ends lie apart (ports with an offset) gets a bend in its middle.
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

  // Lanes, pool, nodes.
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

// The lane set as the layout placed the nodes (spike 2.26, Ben, 2026-10-05): a
// node a rule put in another lane (R1, R12) would otherwise stay in the
// author's. Per node the lane di.laneOf names, the one it stands in on the
// grid; where that differs from the author's, every lane but it and its outer
// lanes loses the node's flowNodeRef, and it gets one before its closing tag
// (an empty lane between its tags, a self-closing one opened). Otherwise the
// text stays as written. Comments and CDATA do not count.
function relane(text, model, di){
  const masked = text.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, m => ' '.repeat(m.length));
  // The lanes in the text: id, prefix, range [open, close] and outer lane.
  const lanes = [], stack = [];
  // A tag's attributes: a quoted value may hold ">".
  for (const m of masked.matchAll(/<(\/?)((?:[\w.-]+:)?)lane\b((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g)){
    if (m[1]){ const l = stack.pop(); if (l) l.close = m.index; continue; }
    const id = (/\sid\s*=\s*["']([^"']+)["']/.exec(m[3]) || [])[1];
    const l = { id, prefix: m[2], open: m.index, openEnd: m.index + m[0].length, close: null, parent: stack[stack.length - 1] || null, selfClosing: !!m[4] };
    lanes.push(l);
    if (!m[4]) stack.push(l); else l.close = l.openEnd;
  }
  const byId = new Map(lanes.filter(l => l.id).map(l => [l.id, l]));
  const inLane = i => lanes.filter(l => l.open < i && l.close !== null && i < l.close).sort((p, q) => q.open - p.open)[0] || null;
  const refs = [...masked.matchAll(/([ \t]*)<((?:[\w.-]+:)?)flowNodeRef\b(?:"[^"]*"|'[^']*'|[^'">/])*>\s*([^<]*?)\s*<\/(?:[\w.-]+:)?flowNodeRef\s*>[ \t]*\r?\n?/g)]
    .map(m => ({ start: m.index, end: m.index + m[0].length, indent: m[1], prefix: m[2], id: m[3], lane: inLane(m.index) }));
  const edits = [], opened = new Map(); // an empty target lane → the ids it gets
  for (const n of model.nodes){
    const target = di.laneOf && Object.hasOwn(di.laneOf, n.id) ? di.laneOf[n.id] : null;
    const now = model.lanes.find(l => l.nodes.includes(n.id));
    if (!target || (now && now.id === target) || !byId.has(target)) continue;
    const keep = new Set();
    for (let l = byId.get(target); l; l = l.parent) keep.add(l);
    const mine = refs.filter(x => x.id === esc(n.id));
    for (const x of mine) if (!keep.has(x.lane)) edits.push({ at: x.start, end: x.end, put: '' });
    const t = byId.get(target);
    // An empty lane, <lane …/> or <lane …></lane>, gets the refs of all its nodes at once, between its tags.
    if (t.close === t.openEnd){ opened.set(t, [...(opened.get(t) || []), n.id]); continue; }
    if (!mine.some(x => x.lane === t) && t.close !== null){
      const sib = refs.find(x => x.lane === t);
      const indent = sib ? sib.indent : '';
      const pre = sib ? sib.prefix : t.prefix;
      // Before the closing tag, on a line of its own, indented as the lane's other flowNodeRefs.
      const lineStart = text.lastIndexOf('\n', t.close - 1) + 1;
      const at = /^[ \t]*$/.test(text.slice(lineStart, t.close)) ? lineStart : t.close;
      edits.push({ at, end: at, put: (at === lineStart ? '' : '\n') + indent + '<' + pre + 'flowNodeRef>' + esc(n.id) + '</' + pre + 'flowNodeRef>\n' });
    }
  }
  for (const [t, ids] of opened){
    const put = ids.map(id => '<' + t.prefix + 'flowNodeRef>' + esc(id) + '</' + t.prefix + 'flowNodeRef>').join('');
    if (t.selfClosing) edits.push({ at: t.openEnd - 2, end: t.openEnd, put: '>' + put + '</' + t.prefix + 'lane>' });
    else edits.push({ at: t.close, end: t.close, put });
  }
  edits.sort((p, q) => q.at - p.at || q.end - p.end);
  let out = text;
  for (const e of edits) out = out.slice(0, e.at) + e.put + out.slice(e.end);
  return out;
}

// The author's XML with the diagram part inserted before its last closing
// definitions tag, whatever its prefix; everything else, and whatever
// follows that tag, stays as written, but for the lane set where a node
// stands in another lane on the grid (relane()). The BPMNDiagram declares
// the bpmndi, dc and di namespaces itself. Its ids are made unique against
// every id of the XML. di: what layoutGeometry() returned. Returns { xml,
// diagram }: the XML and the id of the inserted BPMNDiagram, which bpmn-js is
// told to open, since it opens the first diagram, and that may be an empty
// one of the author's.
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