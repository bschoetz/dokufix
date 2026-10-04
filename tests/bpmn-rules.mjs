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
//                             event: its circle; 1 px tolerance)
//   through, through-own      a piece through a foreign symbol, or through its
//                             own source or target
//   on-outline                a piece along the side of a foreign symbol
//   double-headed             a flow in and a flow out ending within 3 px of
//                             each other at one symbol: <symbol> <flow> <flow>
//   on-one-line-shared,       two pieces of different flows on one line, side
//   on-one-line-foreign,      by side, sharing a source or a target or not; or
//   parallel                  closer than 12 px; not two flows that arrive at
//                             one gateway and run together into one docking
//                             point on their last pieces: a merge (story 2.21)
//   point-outside-lanes       a waypoint in no lane
//   node-outside-lane         a symbol not inside the lane that holds it
//   lane-gap                  two lanes one below the other that do not meet
//   label-on-flow,            a label on a piece of a flow, on a foreign
//   label-on-node,            symbol, on another label: <label's element>
//   label-on-label            <what it lies on>
//   label-outside-lane,       a label not inside one lane, not inside the pool
//   label-outside-pool
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
export function breaksOf(xml, model, sizes = {}){
  const out = new Set();
  const add = (rule, ...ids) => out.add([rule, ...ids].join(' '));
  const di = readDiagram(xml);
  const nodes = Object.fromEntries(model.nodes.map(n => [n.id, di.shapes[n.id]]));
  const type = Object.fromEntries(model.nodes.map(n => [n.id, n.type]));
  const flowOf = Object.fromEntries(model.flows.map(f => [f.id, f]));
  const drawnLanes = model.lanes.filter(l => !l.synthetic);
  const lanes = drawnLanes.map(l => di.shapes[l.id]);
  const pool = model.pool ? di.shapes[model.pool.id] : null;
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
    return Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - w / 2) <= eps;
  };
  for (const [id, w] of Object.entries(di.flows)){
    const f = flowOf[id];
    if (!onOutline(w[0], nodes[f.from], type[f.from])) add('start-off-outline', id, f.from);
    if (!onOutline(w.at(-1), nodes[f.to], type[f.to])) add('end-off-outline', id, f.to);
  }

  for (const s of segs){
    const f = flowOf[s.id];
    const x1 = Math.min(s.a[0], s.b[0]), x2 = Math.max(s.a[0], s.b[0]), y1 = Math.min(s.a[1], s.b[1]), y2 = Math.max(s.a[1], s.b[1]);
    for (const [nid, [nx, ny, nw, nh]] of Object.entries(nodes)){
      const own = nid === f.from || nid === f.to;
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
    const merge = !d && sf.to === tf.to && type[sf.to] === 'gateway' && s.i === s.n - 1 && t.i === t.n - 1 && s.b[0] === t.b[0] && s.b[1] === t.b[1];
    if (merge) continue;
    const ids = [s.id, t.id].sort();
    if (d) add('parallel', ...ids);
    else add(sf.from === tf.from || sf.to === tf.to ? 'on-one-line-shared' : 'on-one-line-foreign', ...ids);
  }

  if (lanes.length) for (const [id, w] of Object.entries(di.flows)) for (const [x, y] of w) if (!lanes.some(l => inside(x, y, l))) add('point-outside-lanes', id);
  for (const l of drawnLanes) for (const id of l.nodes) if (!within(nodes[id], di.shapes[l.id])) add('node-outside-lane', id, l.id);
  const stacked = drawnLanes.map(l => [l.id, di.shapes[l.id]]).sort((a, b) => a[1][1] - b[1][1]);
  for (let i = 1; i < stacked.length; i++){
    const [aid, a] = stacked[i - 1], [bid, b] = stacked[i];
    if (b[1] !== a[1] + a[3]) add('lane-gap', aid, bid);
  }

  const labels = [];
  for (const n of model.nodes){
    const box = di.labels[n.id];
    if (!box) continue;
    const [x, y, w, h] = box, s = sizes[n.name] || labelSize(n.name);
    labels.push({ id: n.id, box: [x + w / 2 - s.w / 2, y, s.w, h], node: n.id });
  }
  for (const f of model.flows) if (di.flowLabels[f.id]) labels.push({ id: f.id, box: di.flowLabels[f.id] });
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
    if (lanes.length && !lanes.some(ln => within(l.box, ln))) add('label-outside-lane', l.id);
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
