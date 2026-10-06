// The rules a laid-out BPMN diagram keeps, checked on the measured fixtures
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
//                             its target other than vertically
//   label-on-pool-edge        a message flow's label across the frame of a
//                             pool: <label's flow> <pool>
// A message flow counts as a flow for every rule but point-outside-lanes;
// its label is in no lane and no pool. A boundary event (story 2.30) counts as
// a symbol, an event, for every rule; that it lies across its host's outline
// is no break.
// A label is its box in the diagram part; an event's or a gateway's is as wide
// as a label can be (90 px) and bpmn-js centres the text in it, so its box is
// the text's measured width (<n>.sizes.json, else the estimate) centred there.
// Crossings and nearness to a symbol are not rules: a diagram has them by design.
//
// tests/fixtures/bpmn-layout/known-breaks.json: { "<fixture>": ["<break>", …] },
// every fixture, its breaks sorted. tests/bpmn-rules.test.mjs fails on a
// break not on the list and on a listed break that is gone; npm run fixtures
// -- --write writes the list anew with the expected XML.

import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_DIR, fixtureNames, readFixture, readModel, expectedFile } from './bpmn-fixtures.mjs';
import { labelSize } from '../src/app/bpmn-layout.js';

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
// sizes: the measured label sizes by text.
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
      // A flow from a boundary event starts on its host's outline: along it or into it counts as through its own.
      if (hostOf[f.from] === nid && x2 > nx + 1 && x1 < nx + nw - 1 && y2 > ny + 1 && y1 < ny + nh - 1){ add('through-own', s.id, nid); continue; }
      if (hostOf[f.from] === nid) continue;
      if (x2 > nx + 1 && x1 < nx + nw - 1 && y2 > ny + 1 && y1 < ny + nh - 1) add(own ? 'through-own' : 'through', s.id, nid);
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
      if (w[0][0] !== w[1][0] || w.at(-1)[0] !== w.at(-2)[0]) add('message-side', id);
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
    const [x, y, w, h] = box, s = sizes[n.name] || labelSize(n.name);
    labels.push({ id: n.id, box: [x + w / 2 - s.w / 2, y, s.w, h], node: n.id, pool: poolOf[n.id] });
  }
  for (const f of model.flows) if (di.flowLabels[f.id]) labels.push({ id: f.id, box: di.flowLabels[f.id], pool: poolOf[f.from] });
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
    const own = lanesOfPool(l.pool);
    if (own.length && !own.some(ln => within(l.box, ln))) add('label-outside-lane', l.id);
    const pool = poolBox(l.pool);
    if (pool && !within(l.box, pool)) add('label-outside-pool', l.id);
  }
  return [...out].sort();
}

// The breaks of a fixture: its measured XML, checked with its measured sizes.
export function fixtureBreaks(name){
  const fx = readFixture(name);
  return breaksOf(fs.readFileSync(expectedFile(name, 'measured'), 'utf8'), readModel(fx.xml).model, fx.sizes);
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
