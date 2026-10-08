// The rules a laid-out BPMN diagram keeps, checked on the laid-out fixtures
// (tests/bpmn-fixtures.mjs), and the known list of what breaks them today.
//
// Each break is one string, "<rule> <element ids>": the rule, then the ids of
// the elements that break it, in the order the rule names them. The rules, from
// the pre-analysis of story 2.21 (2026-10-04), on the coordinates of the
// diagram part as written:
//   slanted, zero-length      a piece of a flow neither horizontal nor
//                             vertical; a piece of no length
//   small-step                an inner piece of 8 px or less
//   start-off-outline,        the first or last waypoint not on its symbol's
//   end-off-outline           outline (task: its box; gateway: its diamond;
//                             event: its circle; a pool, the end of a message
//                             flow at it: the top or bottom edge of its frame,
//                             story 2.29; 1 px tolerance)
//   through, through-own      a piece through a foreign symbol, or through its
//                             own source or target
//   on-outline                a piece along the side of a foreign symbol
//   double-headed             a flow in and a flow out ending within 3 px of
//                             each other at one symbol: <symbol> <flow> <flow>
//   on-one-line-shared,       two pieces of different flows on one line, side
//   on-one-line-foreign,      by side, sharing a source or a target or not; or
//   parallel                  closer than 12 px; not two flows that arrive at
//                             one gateway and share the whole rest of their
//                             way into one docking point from where they meet
//                             (also in the middle of a piece of the other),
//                             at most one of them turning there (a T or an
//                             L, not a ⊤): a merge (story 2.21; a split is no
//                             merge)
//   point-outside-lanes       a waypoint in no lane
//   node-outside-lane         a symbol not inside the lane that holds it (a
//                             boundary event: its host's lane)
//   off-border                a boundary event whose middle is not on its
//                             host's outline: <event> <host> (story 2.30)
//   boundary-overlap          two boundary events of one host that overlap
//   lane-gap                  two lanes one below the other that do not meet
//   label-on-flow,            a label on a piece of a flow, on a foreign
//   label-on-node,            symbol, on another label: <label's element>
//   label-on-label            <what it lies on>
//   label-outside-lane,       a label not inside one lane, not inside its pool
//   label-outside-pool
// and with several pools (story 2.12):
//   node-outside-pool         a symbol not inside its pool
//   sequence-outside-pool     a waypoint of a sequence flow outside its pool
//   pool-overlap              two pools that overlap or touch
//   message-side              a message flow that leaves its source or enters
//                             its target other than vertically; out of an end
//                             event it may leave to the east
//   label-on-pool-edge        a message flow's label across the frame of a
//                             pool: <label's flow> <pool>
// and with text annotations (story 2.31), each its box, each association its
// waypoints:
//   note-on-node, note-on-flow, a text annotation on a symbol, on a piece of a
//   note-on-label, note-on-note flow or within 2 px of it (its bracket would
//                             read as one line with the flow), on a label, on
//                             another text annotation: <annotation> <what it
//                             lies on>
//   association-through       an association through a symbol or a label not
//                             its partner's: <association> <what it passes>
//   association-off           an association whose end at its text annotation
//                             is not on the annotation's box, or whose other
//                             end is not on its partner (a symbol's outline, a
//                             piece of a flow, a pool's frame): <association>
//                             <the end's element>
// and with data object and data store references (story 2.32), each its box,
// its name's box a label, each data association its waypoints:
//   data-on-node, data-on-flow, a reference on a symbol, on a piece of a flow
//   data-on-label, data-on-note, (within 2 px), on a label, on a text
//   data-on-data              annotation, on another reference: <reference>
//                             <what it lies on>
//   data-outside-lane         a reference in no lane of its pool (a pool with
//                             lanes drawn): <reference>
//   data-association-through  a data association through a symbol, a label, a
//                             text annotation or a reference not its ends:
//                             <association> <what it passes>
//   data-association-off      a data association whose end at its reference
//                             is not on the reference's box, or whose end at
//                             its node is not on the node's outline:
//                             <association> <the end's element>
//   data-association-along    two data associations, or one and a flow, on
//                             one line: <association> <the other>
// An association is no flow for any other rule; a text annotation no symbol;
// a data association no flow and a reference no symbol either, its name a
// label as an event's.
// A message flow counts as a flow for every rule but point-outside-lanes;
// its label is in no lane and no pool. A boundary event (story 2.30) counts as
// a symbol, an event, for every rule; that it lies across its host's outline
// is no break.
// A label is its box in the diagram part; an event's or a gateway's is as wide
// as a label can be (90 px) and bpmn-js centres the text in it, so its box is
// the text's width as measured (src/app/label-size.js) centred there.
// Crossings and nearness to a symbol are not rules: a diagram has them by design.
//
// tests/fixtures/bpmn-layout/known-breaks.json: { "<fixture>": ["<break>", …] },
// every fixture, its breaks sorted. tests/bpmn-rules.test.mjs fails on a
// break not on the list and on a listed break that is gone; npm run fixtures
// -- --write writes the list anew with the expected XML.

import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_DIR, fixtureNames, readFixture, readModel, expectedFile } from './bpmn-fixtures.mjs';
import { measureLabel } from '../src/app/label-size.js';

export const KNOWN_FILE = path.join(FIXTURE_DIR, 'known-breaks.json');

// The diagram part of a laid-out XML as appendDiagram() writes it: per element
// id its box [x, y, w, h], its label's box, a flow's waypoints [[x, y], …].
export function readDiagram(xml){
  const di = { shapes: {}, labels: {}, flows: {}, flowLabels: {} };
  const num = m => m.slice(1, 5).map(Number);
  const bounds = /<dc:Bounds x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"\/>/;
  const unesc = s => s.replace(/&(amp|lt|gt|quot);/g, (all, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"' }[e]));
  for (const m of xml.matchAll(/<bpmndi:BPMNShape [^>]*bpmnElement="([^"]*)"[^>]*>(.*?)<\/bpmndi:BPMNShape>/g)){
    const id = unesc(m[1]), [own, label] = m[2].split('<bpmndi:BPMNLabel>');
    di.shapes[id] = num(bounds.exec(own));
    if (label) di.labels[id] = num(bounds.exec(label));
  }
  for (const m of xml.matchAll(/<bpmndi:BPMNEdge [^>]*bpmnElement="([^"]*)">(.*?)<\/bpmndi:BPMNEdge>/g)){
    const id = unesc(m[1]), [way, label] = m[2].split('<bpmndi:BPMNLabel>');
    di.flows[id] = [...way.matchAll(/<di:waypoint x="([-\d.]+)" y="([-\d.]+)"\/>/g)].map(w => [Number(w[1]), Number(w[2])]);
    if (label) di.flowLabels[id] = num(bounds.exec(label));
  }
  return di;
}

// The breaks of one laid-out diagram, sorted, each once. model: readProcess()'s;
// sizes: label sizes by text where a test gives them; the rest are measured.
// The pieces two flows share as a merge, as pairs "<i> <j>" of the index of
// a piece of a and one of b (piece i: from waypoint i - 1 to i), or null
// where they are none. a and b: waypoints [[x, y], …] that end on one point.
// The way is walked back from that point while both run on in one
// direction; where they part, at most one of them may turn (a corner of it,
// or its first point, there).
export function mergedPieces(a, b){
  const same = (p, q) => p[0] === q[0] && p[1] === q[1];
  if (a.length < 2 || b.length < 2 || !same(a.at(-1), b.at(-1))) return null;
  const toward = (p, q) => [Math.sign(q[0] - p[0]), Math.sign(q[1] - p[1])].join();
  const pairs = new Set();
  let i = a.length - 1, j = b.length - 1, at = a[i];
  while (i > 0 && j > 0 && toward(at, a[i - 1]) === toward(at, b[j - 1])){
    pairs.add(i + ' ' + j);
    const la = Math.abs(a[i - 1][0] - at[0]) + Math.abs(a[i - 1][1] - at[1]), lb = Math.abs(b[j - 1][0] - at[0]) + Math.abs(b[j - 1][1] - at[1]);
    at = la <= lb ? a[i - 1] : b[j - 1];
    if (la <= lb) i--;
    if (lb <= la) j--;
  }
  if (!pairs.size) return null;
  // Turning where they part: a corner there, or the flow's first point.
  const turns = (w, k) => same(w[k], at) && (k === 0 || toward(at, w[k - 1]) !== toward(w[k + 1], at));
  return turns(a, i) && turns(b, j) ? null : pairs;
}

export function breaksOf(xml, model, sizes = {}){
  const out = new Set();
  const add = (rule, ...ids) => out.add([rule, ...ids].join(' '));
  const di = readDiagram(xml);
  // The associations' edges are no flows (story 2.31).
  const associations = model.associations || [], assocWays = {};
  for (const a of associations) if (di.flows[a.id]){ assocWays[a.id] = di.flows[a.id]; delete di.flows[a.id]; }
  // Nor are the data associations' (story 2.32).
  const dataAssocs = model.dataAssociations || [], dataWays = {};
  for (const a of dataAssocs) if (di.flows[a.id]){ dataWays[a.id] = di.flows[a.id]; delete di.flows[a.id]; }
  // An edge of no flow the model knows (another layout's association to what dokufix leaves out, as bpmn.io draws it in
  // the BPMN Assistant) is not checked.
  const known = new Set(model.flows.concat(model.messages || []).map(f => f.id));
  for (const id of Object.keys(di.flows)) if (!known.has(id)) delete di.flows[id];
  const boundaries = model.boundaries || [];
  const nodes = Object.fromEntries(model.nodes.concat(boundaries).map(n => [n.id, di.shapes[n.id]]));
  const type = Object.fromEntries(model.nodes.map(n => [n.id, n.type]).concat(boundaries.map(b => [b.id, 'inter'])));
  const hostOf = Object.fromEntries(boundaries.map(b => [b.id, b.host]));
  const messages = model.messages || [];
  const flowOf = Object.fromEntries(model.flows.concat(messages).map(f => [f.id, f]));
  const isMessage = new Set(messages.map(m => m.id));
  const drawnLanes = model.lanes.filter(l => !l.synthetic);
  const lanes = drawnLanes.map(l => di.shapes[l.id]);
  const pools = model.pools || (model.pool ? [model.pool] : []);
  const poolBox = i => pools[i] && pools[i].id ? di.shapes[pools[i].id] : null;
  const poolOf = {};
  for (const l of model.lanes) for (const id of l.nodes) poolOf[id] = l.pool ?? 0;
  for (const b of boundaries) poolOf[b.id] = poolOf[b.host];
  const inside = (x, y, [lx, ly, lw, lh]) => x >= lx && x <= lx + lw && y >= ly && y <= ly + lh;
  const within = ([x, y, w, h], box) => inside(x, y, box) && inside(x + w, y + h, box);

  const segs = [];
  for (const [id, w] of Object.entries(di.flows)) for (let i = 1; i < w.length; i++) segs.push({ id, i, a: w[i - 1], b: w[i], n: w.length });
  for (const s of segs){
    if (s.a[0] !== s.b[0] && s.a[1] !== s.b[1]) add('slanted', s.id);
    if (s.a[0] === s.b[0] && s.a[1] === s.b[1]) add('zero-length', s.id);
    const len = Math.abs(s.a[0] - s.b[0]) + Math.abs(s.a[1] - s.b[1]);
    if (len > 0 && len <= 8 && s.i > 1 && s.i < s.n - 1) add('small-step', s.id);
  }

  const onOutline = (p, [x, y, w, h], t) => {
    const cx = x + w / 2, cy = y + h / 2, eps = 1;
    if (t === 'task') return p[0] >= x - eps && p[0] <= x + w + eps && p[1] >= y - eps && p[1] <= y + h + eps && Math.min(Math.abs(p[0] - x), Math.abs(p[0] - x - w), Math.abs(p[1] - y), Math.abs(p[1] - y - h)) <= eps;
    if (t === 'gateway') return Math.abs(Math.abs(p[0] - cx) / (w / 2) + Math.abs(p[1] - cy) / (h / 2) - 1) * (w / 2) <= eps;
    // A message flow's end at a pool (story 2.29): on the top or bottom edge of its frame.
    if (t === 'pool') return p[0] >= x && p[0] <= x + w && (Math.abs(p[1] - y) <= eps || Math.abs(p[1] - y - h) <= eps);
    return Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - w / 2) <= eps;
  };
  const shapeOf = id => nodes[id] || di.shapes[id], typeOf = id => type[id] || 'pool';
  for (const [id, w] of Object.entries(di.flows)){
    const f = flowOf[id];
    if (!onOutline(w[0], shapeOf(f.from), typeOf(f.from))) add('start-off-outline', id, f.from);
    if (!onOutline(w.at(-1), shapeOf(f.to), typeOf(f.to))) add('end-off-outline', id, f.to);
  }

  for (const s of segs){
    const f = flowOf[s.id];
    const x1 = Math.min(s.a[0], s.b[0]), x2 = Math.max(s.a[0], s.b[0]), y1 = Math.min(s.a[1], s.b[1]), y2 = Math.max(s.a[1], s.b[1]);
    for (const [nid, [nx, ny, nw, nh]] of Object.entries(nodes)){
      const own = nid === f.from || nid === f.to;
      // A flow from a boundary event starts below its host's outline: into the host counts as through its own, along
      // its outline as on-outline.
      const host = hostOf[f.from] === nid;
      if (x2 > nx + 1 && x1 < nx + nw - 1 && y2 > ny + 1 && y1 < ny + nh - 1) add(own || host ? 'through-own' : 'through', s.id, nid);
      const onH = y1 === y2 && (Math.abs(y1 - ny) <= 1 || Math.abs(y1 - ny - nh) <= 1) && Math.min(x2, nx + nw) - Math.max(x1, nx) > 2;
      const onV = x1 === x2 && (Math.abs(x1 - nx) <= 1 || Math.abs(x1 - nx - nw) <= 1) && Math.min(y2, ny + nh) - Math.max(y1, ny) > 2;
      if ((onH || onV) && !own) add('on-outline', s.id, nid);
    }
  }

  const ends = [];
  for (const [id, w] of Object.entries(di.flows)){ const f = flowOf[id]; ends.push({ id, node: f.from, p: w[0], out: true }, { id, node: f.to, p: w.at(-1), out: false }); }
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++){
    const a = ends[i], b = ends[j];
    if (a.node === b.node && a.out !== b.out && Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) < 3) add('double-headed', a.node, ...[a.id, b.id].sort());
  }

  const merges = new Map();
  for (let p = 0; p < segs.length; p++) for (let q = p + 1; q < segs.length; q++){
    const s = segs[p], t = segs[q];
    if (s.id === t.id) continue;
    const hs = s.a[1] === s.b[1], ht = t.a[1] === t.b[1];
    if (hs !== ht) continue;
    const [u, v] = hs ? [1, 0] : [0, 1];
    const d = Math.abs(s.a[u] - t.a[u]);
    const overlap = Math.min(Math.max(s.a[v], s.b[v]), Math.max(t.a[v], t.b[v])) - Math.max(Math.min(s.a[v], s.b[v]), Math.min(t.a[v], t.b[v]));
    if (d >= 12 || overlap <= 0) continue;
    const sf = flowOf[s.id], tf = flowOf[t.id];
    if (!d && sf.to === tf.to && type[sf.to] === 'gateway'){
      const key = s.id + ' ' + t.id;
      if (!merges.has(key)) merges.set(key, mergedPieces(di.flows[s.id], di.flows[t.id]));
      if (merges.get(key)?.has(s.i + ' ' + t.i)) continue;
    }
    const ids = [s.id, t.id].sort();
    if (d) add('parallel', ...ids);
    else add(sf.from === tf.from || sf.to === tf.to ? 'on-one-line-shared' : 'on-one-line-foreign', ...ids);
  }

  // Lanes count for a pool that has lanes drawn; a pool without lanes is checked against its frame below.
  const lanesOfPool = k => drawnLanes.filter(l => (l.pool ?? 0) === k).map(l => di.shapes[l.id]);
  for (const [id, w] of Object.entries(di.flows)){
    if (isMessage.has(id)) continue;
    const own = lanesOfPool(poolOf[flowOf[id].from]);
    if (own.length) for (const [x, y] of w) if (!own.some(l => inside(x, y, l))) add('point-outside-lanes', id);
  }
  for (const [id, w] of Object.entries(di.flows)){
    const f = flowOf[id];
    if (isMessage.has(id)){
      // Out of an end event also to the east, where no flow leaves (Ben, 2026-10-07, nz18-fluss2).
      const east = type[f.from] === 'end' && w[0][1] === w[1][1] && w[1][0] > w[0][0];
      if ((w[0][0] !== w[1][0] && !east) || w.at(-1)[0] !== w.at(-2)[0]) add('message-side', id);
      continue;
    }
    const box = poolBox(poolOf[f.from]);
    if (box && w.some(([x, y]) => !inside(x, y, box))) add('sequence-outside-pool', id);
  }
  for (const n of model.nodes){ const box = poolBox(poolOf[n.id]); if (box && !within(nodes[n.id], box)) add('node-outside-pool', n.id, pools[poolOf[n.id]].id); }
  for (let i = 0; i < pools.length; i++) for (let j = i + 1; j < pools.length; j++){
    const a = poolBox(i), b = poolBox(j);
    if (a && b && a[0] <= b[0] + b[2] && b[0] <= a[0] + a[2] && a[1] <= b[1] + b[3] && b[1] <= a[1] + a[3]) add('pool-overlap', pools[i].id, pools[j].id);
  }
  for (const l of drawnLanes) for (const id of l.nodes) if (!within(nodes[id], di.shapes[l.id])) add('node-outside-lane', id, l.id);
  for (const b of boundaries){
    const l = drawnLanes.find(x => x.nodes.includes(b.host));
    if (l && !within(nodes[b.id], di.shapes[l.id])) add('node-outside-lane', b.id, l.id);
    const [x, y, w, h] = nodes[b.id];
    if (!onOutline([x + w / 2, y + h / 2], nodes[b.host], 'task')) add('off-border', b.id, b.host);
  }
  for (let i = 0; i < boundaries.length; i++) for (let j = i + 1; j < boundaries.length; j++){
    const a = boundaries[i], b = boundaries[j], [ax, ay, aw, ah] = nodes[a.id], [bx, by, bw, bh] = nodes[b.id];
    if (a.host === b.host && Math.min(ax + aw, bx + bw) > Math.max(ax, bx) && Math.min(ay + ah, by + bh) > Math.max(ay, by)) add('boundary-overlap', a.id, b.id);
  }
  for (let k = 0; k < Math.max(1, pools.length); k++){
    const stacked = drawnLanes.filter(l => (l.pool ?? 0) === k).map(l => [l.id, di.shapes[l.id]]).sort((a, b) => a[1][1] - b[1][1]);
    for (let i = 1; i < stacked.length; i++){
      const [aid, a] = stacked[i - 1], [bid, b] = stacked[i];
      if (b[1] !== a[1] + a[3]) add('lane-gap', aid, bid);
    }
  }

  const labels = [];
  for (const n of model.nodes.concat(boundaries)){
    const box = di.labels[n.id];
    if (!box) continue;
    const [x, y, w, h] = box, s = sizes[n.label ?? n.name] || measureLabel(n.label ?? n.name);
    labels.push({ id: n.id, box: [x + w / 2 - s.w / 2, y, s.w, h], node: n.id, pool: poolOf[n.id] });
  }
  for (const f of model.flows) if (di.flowLabels[f.id]) labels.push({ id: f.id, box: di.flowLabels[f.id], pool: poolOf[f.from] });
  // A reference's name, as an event's (story 2.32); its pool, the one whose frame holds the reference.
  const refs = (model.data || []).map(d => ({ ...d, box: di.shapes[d.id] })).filter(d => d.box);
  const poolAt = b => { const k = pools.findIndex((p, i) => poolBox(i) && within(b, poolBox(i))); return k < 0 ? undefined : k; };
  for (const d of refs){
    const box = di.labels[d.id];
    if (!box) continue;
    const [x, y, w, h] = box, s = sizes[d.label ?? d.name] || measureLabel(d.label ?? d.name);
    labels.push({ id: d.id, box: [x + w / 2 - s.w / 2, y, s.w, h], node: d.id, pool: poolAt(d.box), data: true });
  }
  for (const f of messages) if (di.flowLabels[f.id]) labels.push({ id: f.id, box: di.flowLabels[f.id], message: true });
  for (const l of labels){
    const [x, y, w, h] = l.box;
    for (const s of segs){
      const x1 = Math.min(s.a[0], s.b[0]), x2 = Math.max(s.a[0], s.b[0]), y1 = Math.min(s.a[1], s.b[1]), y2 = Math.max(s.a[1], s.b[1]);
      if (x2 > x && x1 < x + w && y2 > y && y1 < y + h) add('label-on-flow', l.id, s.id);
    }
    for (const [nid, [nx, ny, nw, nh]] of Object.entries(nodes)) if (nid !== l.node && nx < x + w && nx + nw > x && ny < y + h && ny + nh > y) add('label-on-node', l.id, nid);
    for (const m of labels){
      if (m === l) continue;
      const [a, b, c, d] = m.box;
      if (a < x + w && a + c > x && b < y + h && b + d > y) add('label-on-label', ...[l.id, m.id].sort());
    }
    if (l.message){
      pools.forEach((p, k) => {
        const b = poolBox(k);
        if (!b) return;
        const across = (lo, hi, at) => lo < at && at < hi;
        const inX = x < b[0] + b[2] && x + w > b[0], inY = y < b[1] + b[3] && y + h > b[1];
        if ((inX && (across(y, y + h, b[1]) || across(y, y + h, b[1] + b[3]))) || (inY && (across(x, x + w, b[0]) || across(x, x + w, b[0] + b[2])))) add('label-on-pool-edge', l.id, p.id);
      });
      continue;
    }
    // A reference beside the pools has a label in none (story 2.32).
    if (l.data && l.pool === undefined) continue;
    const own = lanesOfPool(l.pool);
    if (own.length && !own.some(ln => within(l.box, ln))) add('label-outside-lane', l.id);
    const pool = poolBox(l.pool);
    if (pool && !within(l.box, pool)) add('label-outside-pool', l.id);
  }

  // Text annotations (story 2.31).
  const notes = (model.notes || []).map(n => ({ id: n.id, box: di.shapes[n.id] })).filter(n => n.box);
  const overlaps = ([x, y, w, h], [a, b, c, d]) => a < x + w && a + c > x && b < y + h && b + d > y;
  for (const n of notes){
    const [x, y, w, h] = n.box;
    for (const [nid, b] of Object.entries(nodes)) if (overlaps(n.box, b)) add('note-on-node', n.id, nid);
    for (const sg of segs){
      const x1 = Math.min(sg.a[0], sg.b[0]), x2 = Math.max(sg.a[0], sg.b[0]), y1 = Math.min(sg.a[1], sg.b[1]), y2 = Math.max(sg.a[1], sg.b[1]);
      if (x2 >= x - 2 && x1 <= x + w + 2 && y2 >= y - 2 && y1 <= y + h + 2) add('note-on-flow', n.id, sg.id);
    }
    for (const l of labels) if (overlaps(n.box, l.box)) add('note-on-label', n.id, l.id);
    for (const m of notes) if (m !== n && overlaps(n.box, m.box)) add('note-on-note', ...[n.id, m.id].sort());
  }
  const noteBox = Object.fromEntries(notes.map(n => [n.id, n.box]));
  // A point of a way strictly inside a box (1 px in), the way sampled every 2 px.
  const passes = (w, [bx, by, bw, bh]) => {
    for (let i = 1; i < w.length; i++){
      const [x1, y1] = w[i - 1], [x2, y2] = w[i], k = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2));
      for (let j = 0; j <= k; j++){ const px = x1 + (x2 - x1) * j / k, py = y1 + (y2 - y1) * j / k; if (px > bx + 1 && px < bx + bw - 1 && py > by + 1 && py < by + bh - 1) return true; }
    }
    return false;
  };
  const onBox = (p, [x, y, w, h]) => onOutline(p, [x, y, w, h], 'task');
  const onWay = (p, w) => w.some((q, i) => i && Math.min(q[0], w[i - 1][0]) - 1 <= p[0] && p[0] <= Math.max(q[0], w[i - 1][0]) + 1 && Math.min(q[1], w[i - 1][1]) - 1 <= p[1] && p[1] <= Math.max(q[1], w[i - 1][1]) + 1);
  for (const a of associations){
    const w = assocWays[a.id];
    if (!w || !noteBox[a.note]) continue;
    const [atNote, atPartner] = a.toNote ? [w.at(-1), w[0]] : [w[0], w.at(-1)];
    if (!onBox(atNote, noteBox[a.note])) add('association-off', a.id, a.note);
    const partnerOk = a.kind === 'flow' || a.kind === 'message' ? !!di.flows[a.partner] && onWay(atPartner, di.flows[a.partner])
      : a.kind === 'pool' ? !!di.shapes[a.partner] && onBox(atPartner, di.shapes[a.partner])
      : !!nodes[a.partner] && onOutline(atPartner, nodes[a.partner], typeOf(a.partner));
    if (!partnerOk) add('association-off', a.id, a.partner);
    for (const [nid, b] of Object.entries(nodes)) if (nid !== a.partner && passes(w, b)) add('association-through', a.id, nid);
    for (const l of labels) if (l.id !== a.partner && passes(w, l.box)) add('association-through', a.id, l.id);
    for (const m of notes) if (m.id !== a.note && passes(w, m.box)) add('association-through', a.id, m.id);
  }

  // Data object and data store references and their data associations (story 2.32).
  const refBox = Object.fromEntries(refs.map(d => [d.id, d.box]));
  for (const d of refs){
    for (const [nid, b] of Object.entries(nodes)) if (overlaps(d.box, b)) add('data-on-node', d.id, nid);
    for (const sg of segs){
      const [x, y, w, h] = d.box, x1 = Math.min(sg.a[0], sg.b[0]), x2 = Math.max(sg.a[0], sg.b[0]), y1 = Math.min(sg.a[1], sg.b[1]), y2 = Math.max(sg.a[1], sg.b[1]);
      if (x2 >= x - 2 && x1 <= x + w + 2 && y2 >= y - 2 && y1 <= y + h + 2) add('data-on-flow', d.id, sg.id);
    }
    for (const l of labels) if (l.id !== d.id && overlaps(d.box, l.box)) add('data-on-label', d.id, l.id);
    for (const n of notes) if (overlaps(d.box, n.box)) add('data-on-note', d.id, n.id);
    for (const e of refs) if (e !== d && overlaps(d.box, e.box)) add('data-on-data', ...[d.id, e.id].sort());
    const k = poolAt(d.box), own = k === undefined ? [] : lanesOfPool(k);
    if (own.length && !own.some(ln => within(d.box, ln))) add('data-outside-lane', d.id);
  }
  const dataPieces = dataAssocs.filter(a => dataWays[a.id]).flatMap(a => dataWays[a.id].slice(1).map((b, i) => ({ id: a.id, a: dataWays[a.id][i], b })));
  for (const a of dataAssocs){
    const w = dataWays[a.id];
    if (!w || !refBox[a.ref] || !nodes[a.node]) continue;
    const [atRef, atNode] = a.dir === 'in' ? [w[0], w.at(-1)] : [w.at(-1), w[0]];
    if (!onBox(atRef, refBox[a.ref])) add('data-association-off', a.id, a.ref);
    if (!onOutline(atNode, nodes[a.node], typeOf(a.node))) add('data-association-off', a.id, a.node);
    for (const [nid, b] of Object.entries(nodes)) if (nid !== a.node && passes(w, b)) add('data-association-through', a.id, nid);
    for (const l of labels) if (l.id !== a.ref && passes(w, l.box)) add('data-association-through', a.id, l.id);
    for (const n of notes) if (passes(w, n.box)) add('data-association-through', a.id, n.id);
    for (const e of refs) if (e.id !== a.ref && passes(w, e.box)) add('data-association-through', a.id, e.id);
  }
  // Two pieces on one line: both horizontal or both vertical, within 3 px, side by side for more than 4 px.
  const along = (p, q) => {
    const hp = p.a[1] === p.b[1], hq = q.a[1] === q.b[1], vp = p.a[0] === p.b[0], vq = q.a[0] === q.b[0];
    if (hp && hq) return Math.abs(p.a[1] - q.a[1]) <= 3 && Math.min(Math.max(p.a[0], p.b[0]), Math.max(q.a[0], q.b[0])) - Math.max(Math.min(p.a[0], p.b[0]), Math.min(q.a[0], q.b[0])) > 4;
    if (vp && vq) return Math.abs(p.a[0] - q.a[0]) <= 3 && Math.min(Math.max(p.a[1], p.b[1]), Math.max(q.a[1], q.b[1])) - Math.max(Math.min(p.a[1], p.b[1]), Math.min(q.a[1], q.b[1])) > 4;
    return false;
  };
  for (let i = 0; i < dataPieces.length; i++){
    for (let j = i + 1; j < dataPieces.length; j++) if (dataPieces[i].id !== dataPieces[j].id && along(dataPieces[i], dataPieces[j])) add('data-association-along', ...[dataPieces[i].id, dataPieces[j].id].sort());
    for (const sg of segs) if (along(dataPieces[i], sg)) add('data-association-along', dataPieces[i].id, sg.id);
  }
  return [...out].sort();
}

// The breaks of a fixture: its laid-out XML.
export function fixtureBreaks(name){
  return breaksOf(fs.readFileSync(expectedFile(name), 'utf8'), readModel(readFixture(name).xml).model);
}

export const readKnownBreaks = () => JSON.parse(fs.readFileSync(KNOWN_FILE, 'utf8'));

// What differs from the known list, one line each: a break not on it, a
// listed break that is gone.
export function compareBreaks(name, found, known = []){
  return [...found.filter(b => !known.includes(b)).map(b => name + ': new break: ' + b),
          ...known.filter(b => !found.includes(b)).map(b => name + ': listed break gone: ' + b)];
}

// Writes the known list from today's breaks: { changed, count }.
export function writeKnownBreaks(){
  const list = Object.fromEntries(fixtureNames().map(name => [name, fixtureBreaks(name)]));
  const text = JSON.stringify(list, null, 1) + '\n';
  const changed = !fs.existsSync(KNOWN_FILE) || fs.readFileSync(KNOWN_FILE, 'utf8') !== text;
  if (changed) fs.writeFileSync(KNOWN_FILE, text);
  return { changed, count: Object.values(list).reduce((sum, l) => sum + l.length, 0) };
}
