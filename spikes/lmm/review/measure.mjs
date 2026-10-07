// Shared measuring: a model laid out with given ranks (measured mode, as the rules test checks the fixtures), the
// diagram part by element id, the breaks of the rules, crossings and bends.
const R = '/home/user/dokufix/';
export const fixtures = await import(R + 'tests/bpmn-fixtures.mjs');
export const rules = await import(R + 'tests/bpmn-rules.mjs');
const { layoutGeometry, appendDiagram } = await import(R + 'src/app/bpmn-layout.js');

// The columns per element id, dense, from ranks per key.
export function columnsOf(model, rank){
  const xs = [...new Set(model.nodes.map(n => rank[n.key]))].sort((a, b) => a - b);
  return Object.fromEntries(model.nodes.map(n => [n.id, xs.indexOf(rank[n.key])]));
}

// Laid out: the XML with its diagram part, the diagram part read back, the breaks, crossings, bends.
export function layoutWith(xml, model, rank, sizes){
  const raw = { nodes: Object.fromEntries(model.nodes.map(n => [n.key, { cx: rank[n.key] }])) };
  const laid = appendDiagram(xml, model, layoutGeometry(model, raw, fixtures.measureOf(sizes, 'measured'))).xml;
  const di = rules.readDiagram(laid);
  return { laid, di, breaks: rules.breaksOf(laid, model, sizes), ...quality(di) };
}

// Crossings: a horizontal and a vertical piece of two flows cutting each other inside; bends: waypoints beyond two.
export function quality(di){
  const segs = [];
  for (const [f, pts] of Object.entries(di.flows)) for (let i = 1; i < pts.length; i++) segs.push({ f, a: pts[i - 1], b: pts[i] });
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
  const bends = Object.values(di.flows).reduce((n, pts) => n + Math.max(0, pts.length - 2), 0);
  // The picture's size: the box around all shapes.
  const boxes = Object.values(di.shapes);
  const x1 = Math.min(...boxes.map(b => b[0])), y1 = Math.min(...boxes.map(b => b[1])), x2 = Math.max(...boxes.map(b => b[0] + b[2])), y2 = Math.max(...boxes.map(b => b[1] + b[3]));
  return { crossings, bends, width: x2 - x1, height: y2 - y1 };
}

// The diagram part as a string per element id, independent of the order of the elements in the XML.
export const diagramKey = di => JSON.stringify(Object.fromEntries(['shapes', 'labels', 'flows', 'flowLabels'].map(k => [k, Object.fromEntries(Object.keys(di[k]).sort().map(id => [id, di[k][id]]))])));
