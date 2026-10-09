import { addBpmnTypeClasses, bpmnTypeClasses } from '../app/bpmn.js';
import { addLineJumps } from '../app/line-jumps.js';

// --- What the BPMN tools do to a drawn diagram -----------------------------
// decorate() after the import, in a viewer and so in its saveSVG() too; the
// pool's head (poolHeads()); the X of merging gateways (mergeMarkerOff()); the
// stopgap lines of the assistant (signalLines()). Shared by the BPMN
// Assistant and the Layouter Audi; until story 2.38 the Audi carried a copy.
//
// decorate() and poolHeads() work on a viewer of the page's bpmn-js and use
// what it hands them; mergeMarkerOff() is pure text; sequenceGraph() and
// signalLines() use the page's DOMParser. Nothing done on loading.

// After the import: the type classes of the app, the same classes on the
// labels outside the shape (events, gateways, flows) so that the label's
// colour goes by type, the sign in task, gateway and event marked, lanes
// filled opaque (bpmn-js fills them at 35 % over the pool otherwise), and the
// pool's head. jumps: whether line jumps are drawn (src/app/line-jumps.js).
export function decorate(viewer, { jumps = false } = {}){
  addBpmnTypeClasses(viewer);
  if (jumps) addLineJumps(viewer.get('canvas').getContainer());
  const registry = viewer.get('elementRegistry');
  registry.forEach(el => {
    const gfx = registry.getGraphics(el);
    if (!gfx) return;
    if (el.type === 'label' && el.labelTarget){ const c = bpmnTypeClasses(el.labelTarget.type); if (c.length) gfx.classList.add(...c); }
    // The symbol top left of a task: what lies in the shape top left besides frame and text (loop and multi-instance markers below do not).
    if (/Task$/.test(el.type) && el.type !== 'label'){
      const [, ...rest] = gfx.querySelector('.djs-visual').children;
      for (const c of rest) if (c.localName !== 'text'){ const b = c.getBBox(); if (b.y < 30 && b.x < 40) c.classList.add('dokufix-bpmn-icon'); }
    }
    // The sign in a gateway: everything in the shape but the diamond (X, +, circle, pentagon, star).
    if (/Gateway$/.test(el.type)){
      const [, ...rest] = gfx.querySelector('.djs-visual').children;
      for (const c of rest) if (c.localName !== 'text') c.classList.add('dokufix-bpmn-icon');
    }
    // The sign in an event: everything in the shape but the rings (the outer one, for intermediate events the inner one too; radius above three quarters of the outer).
    if (/Event$/.test(el.type)){
      const vis = gfx.querySelector('.djs-visual'), outer = el.width / 2;
      for (const c of vis.children){
        if (c.localName === 'text') continue;
        if (c.localName === 'circle' && +c.getAttribute('r') > outer * 0.75) continue;
        c.classList.add('dokufix-bpmn-icon');
      }
    }
    if (el.type === 'bpmn:Lane'){ const r = gfx.querySelector('.djs-visual rect'); if (r) r.style.fillOpacity = '1'; }
  });
  poolHeads(viewer);
}

// The pool's head: bpmn-js draws a pool as a rectangle with a dividing line
// 30 px from its edge. The strip before it gets a rectangle of its own in
// --dokufix-bpmn-head, inset by half the stroke's width; it lies under the
// dividing line and the label. A collapsed pool has no dividing line and no
// head; it gets the class dokufix-bpmn-box (story 2.29).
export function poolHeads(viewer){
  const registry = viewer.get('elementRegistry');
  for (const el of registry.filter(e => e.type === 'bpmn:Participant')){
    const gfx = registry.getGraphics(el), vis = gfx?.querySelector('.djs-visual');
    const frame = vis && vis.querySelector('rect');
    if (frame && !vis.querySelector('path,polyline')) gfx.classList.add('dokufix-bpmn-box');
    if (!frame || !vis.querySelector('path,polyline')) continue;
    const sw = parseFloat(frame.style.strokeWidth) || 1.5, i = sw / 2;
    const across = el.di && el.di.isHorizontal === false;
    const r = frame.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', i); r.setAttribute('y', i);
    r.setAttribute('width', across ? el.width - sw : 30 - i);
    r.setAttribute('height', across ? 30 - i : el.height - sw);
    r.setAttribute('class', 'dokufix-bpmn-head');
    r.setAttribute('style', 'fill:var(--dokufix-bpmn-head);stroke:none');
    frame.after(r);
  }
}

// The X of merging exclusive gateways for a diagram with coordinates of its
// own (Ben, 2026-10-08): only where every exclusive gateway of the file
// carries isMarkerVisible="true", as bpmn-js sets it on each while modelling;
// then the editor decided the X, not the author. A merge (at least two flows
// in, at most one out, counted as appendDiagram() counts) loses the attribute
// and becomes an empty diamond. Where a gateway lacks it, or has "false", the
// file stays as it is, and the answer is null. graph: { gateways, flows }, the
// ids of the exclusive gateways (a Set) and the flows ({ from, to }) to count;
// the assistant takes them from the model readProcess() reads, the Audi from
// the sequence flows of the file (sequenceGraph()). Gives { xml, count }: count
// merges without the X.
export function mergeMarkerOff(xml, { gateways, flows }){
  const count = (end, id) => flows.filter(f => f[end] === id).length;
  const shape = /<(?:[\w.-]+:)?BPMNShape\b[^>]*>/g;
  const elementOf = tag => (tag.match(/\sbpmnElement\s*=\s*["']([^"']*)["']/) || [])[1];
  const visible = /\s+isMarkerVisible\s*=\s*["']true["']/;
  const tags = [...xml.matchAll(shape)].map(m => m[0]).filter(t => gateways.has(elementOf(t)));
  if (!tags.length || !tags.every(t => visible.test(t))) return null;
  const merges = new Set();
  const out = xml.replace(shape, t => {
    const id = elementOf(t);
    if (!gateways.has(id) || count('to', id) < 2 || count('from', id) > 1) return t;
    merges.add(id);
    return t.replace(visible, '');
  });
  return { xml: out, count: merges.size };
}
// The graph mergeMarkerOff() counts in, from the file itself: its exclusive
// gateways and its sequence flows, read with the page's DOMParser.
export function sequenceGraph(xml){
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return {
    gateways: new Set([...doc.getElementsByTagNameNS('*', 'exclusiveGateway')].map(g => g.getAttribute('id'))),
    flows: [...doc.getElementsByTagNameNS('*', 'sequenceFlow')].map(f => ({ from: f.getAttribute('sourceRef'), to: f.getAttribute('targetRef') })),
  };
}
// The graph of the model readProcess() reads (src/app/bpmn-layout.js).
export const modelGraph = model => ({ gateways: new Set(model.nodes.filter(n => n.tag === 'exclusiveGateway').map(n => n.id)), flows: model.flows });

// A stopgap of the assistant only (Ben, 2026-10-05): an association between
// two flow nodes (a signal throw → a signal catch, say), which no layout
// places, as a straight line across from edge to edge, written into the XML
// after the layout. Events as circles, gateways as diamonds, else rectangles.
// model: the author's, as readProcess() reads it. Gives { xml, count }.
export function signalLines(xml, model){
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const nodes = new Map(model.nodes.map(n => [n.id, n]));
  const shapes = {};
  for (const m of xml.matchAll(/<bpmndi:BPMNShape\b[^>]*bpmnElement="([^"]*)"[^>]*>\s*<dc:Bounds x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g))
    shapes[m[1]] = { x: +m[2], y: +m[3], w: +m[4], h: +m[5] };
  const edge = (from, to) => {
    const c = s => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });
    const a = c(shapes[from]), b = c(shapes[to]);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    // The distance from the centre to the edge in the direction (dx, dy).
    const reach = (id, dx, dy) => {
      const s = shapes[id], t = nodes.get(id).type, rw = s.w / 2, rh = s.h / 2;
      if (t === 'event') return rw;
      if (t === 'gateway') return 1 / (Math.abs(dx) / rw + Math.abs(dy) / rh);
      return Math.min(dx ? rw / Math.abs(dx) : Infinity, dy ? rh / Math.abs(dy) : Infinity);
    };
    const ra = reach(from, ux, uy), rb = reach(to, -ux, -uy);
    return [[a.x + ux * ra, a.y + uy * ra], [b.x - ux * rb, b.y - uy * rb]].map(([x, y]) => [Math.round(x), Math.round(y)]);
  };
  const add = [];
  for (const el of doc.getElementsByTagNameNS('*', 'association')){
    const id = el.getAttribute('id'), from = el.getAttribute('sourceRef'), to = el.getAttribute('targetRef');
    if (!id || !nodes.has(from) || !nodes.has(to) || !shapes[from] || !shapes[to]) continue;
    add.push('<bpmndi:BPMNEdge id="' + id + '_di" bpmnElement="' + id + '">' + edge(from, to).map(([x, y]) => '<di:waypoint x="' + x + '" y="' + y + '"/>').join('') + '</bpmndi:BPMNEdge>');
  }
  return { xml: add.length ? xml.replace('</bpmndi:BPMNPlane>', add.join('') + '</bpmndi:BPMNPlane>') : xml, count: add.length };
}
