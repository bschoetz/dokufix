// ELK (elkjs) als Anordner für BPMN-XML ohne Koordinaten, am Beispiel Prozess 4.
// Drei Varianten, jede wird zu BPMN-DI und läuft durch dieselbe Darstellung wie der Spike:
//   flach    alle Knoten in einem Graphen, ohne Bahnen (Grundgüte von ELK)
//   gruppen  jede Bahn ist ein Gruppenknoten (hierarchyHandling: INCLUDE_CHILDREN)
//   anker    wie gruppen, dazu je Bahn ein unsichtbarer Knoten in der ersten und letzten Schicht,
//            damit jede Bahn über die ganze Breite reicht und die Bahnen untereinander stehen
//   vorgabe  flacher Graph in zwei Durchgängen: der erste liefert die Schichten, daraus bekommt jede Bahn ein Band mit
//            festen Höhen. Im zweiten hält ELK diese Höhen (nodePlacement und crossingMinimization INTERACTIVE) und routet.
// Zum Vergleich werden dieselben Kennzahlen für die Mermaid-Anordnung (Diagramm 5 im Export) berechnet.
// node tests/elk-test.mjs   (braucht vorher node build.mjs für den Vergleich)
import { chromium } from 'playwright-core';
import ELK from 'elkjs/lib/elk.bundled.js';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { assemble, here } from '../assemble.mjs';

const out = f => path.join(here, 'tests', 'out', f);
const { diXml } = vm.runInNewContext(fs.readFileSync(path.join(here, 'src/bpmn.js'), 'utf8') + '\nDokufixBpmn');
const xml = fs.readFileSync(path.join(here, 'diagramme/uebergabe-ohne-koordinaten.bpmn'), 'utf8');

// --- XML lesen (das Format der Datei ist bekannt, deshalb reichen reguläre Ausdrücke) ---
const typeOf = t => t === 'startEvent' ? 'start' : t === 'endEvent' ? 'end' : /Event$/.test(t) ? 'inter' : /Gateway$/.test(t) ? 'gateway' : 'task';
const nodes = [...xml.matchAll(/<bpmn:(\w+(?:Event|Gateway|Task|Activity)|task) id="([^"]+)"(?: name="([^"]*)")?/g)].map(m => ({ id: m[2], tag: m[1], type: typeOf(m[1]), name: m[3] || '', classes: [] }));
const flows = [...xml.matchAll(/<bpmn:sequenceFlow id="([^"]+)" sourceRef="([^"]+)" targetRef="([^"]+)"(?: name="([^"]*)")?/g)].map(m => ({ id: m[1], from: m[2], to: m[3], name: m[4] || '' }));
const lanes = [...xml.matchAll(/<bpmn:lane id="([^"]+)" name="([^"]*)">(.*?)<\/bpmn:lane>/g)].map(m => ({ id: m[1], name: m[2], nodes: [...m[3].matchAll(/<bpmn:flowNodeRef>([^<]+)</g)].map(r => r[1]) }));
const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
console.log('Modell:', nodes.length, 'Knoten,', flows.length, 'Kanten,', lanes.length, 'Bahnen');

// --- ELK-Graph ---
const SIZE = { task: [120, 80], gateway: [50, 50], start: [36, 36], end: [36, 36], inter: [36, 36] };
const labelBox = text => { const w = Math.min(90, Math.max(24, Math.round(text.length * 6.2) + 8)); return { text, width: w, height: 14 * Math.ceil((text.length * 6.2 + 8) / 90) }; };
const elkNode = n => ({
  id: n.id, width: SIZE[n.type][0], height: SIZE[n.type][1],
  labels: n.type !== 'task' && n.name ? [labelBox(n.name)] : [],
  layoutOptions: n.type === 'task' ? {} : { 'elk.nodeLabels.placement': n.type === 'gateway' ? 'OUTSIDE V_TOP H_CENTER' : 'OUTSIDE V_BOTTOM H_CENTER' }
});
const elkEdges = flows.map(f => ({ id: f.id, sources: [f.from], targets: [f.to], labels: f.name ? [{ text: f.name, width: Math.round(f.name.length * 6.2) + 8, height: 14 }] : [] }));
const base = {
  'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.spacing.nodeNodeBetweenLayers': '50', 'elk.spacing.nodeNode': '36', 'elk.spacing.edgeNode': '18', 'elk.spacing.edgeEdge': '12',
  'elk.layered.spacing.edgeNodeBetweenLayers': '18', 'elk.spacing.edgeLabel': '4', 'elk.spacing.nodeSelfLoop': '20',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.json.shapeCoords': 'ROOT', 'elk.json.edgeCoords': 'ROOT'
};
const lanePad = { 'elk.padding': '[top=24,left=56,bottom=24,right=24]' };
const anchor = (lane, which) => ({ id: lane.id + '__' + which, width: 1, height: 1, layoutOptions: { 'elk.layered.layering.layerConstraint': which === 'a' ? 'FIRST' : 'LAST' } });
const variants = {
  flach: { id: 'root', layoutOptions: base, children: nodes.map(elkNode), edges: elkEdges },
  gruppen: { id: 'root', layoutOptions: { ...base, 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
    children: lanes.map(l => ({ id: l.id, layoutOptions: lanePad, children: l.nodes.map(id => elkNode(byId[id])) })), edges: elkEdges },
  anker: { id: 'root', layoutOptions: { ...base, 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.layered.crossingMinimization.forceNodeModelOrder': 'true' },
    children: lanes.map(l => ({ id: l.id, layoutOptions: lanePad, children: [anchor(l, 'a'), ...l.nodes.map(id => elkNode(byId[id])), anchor(l, 'z')] })), edges: elkEdges }
};

// --- ELK-Ergebnis → BPMN-DI ---
const R = Math.round;
// Kantenende an Kreis oder Raute heranführen: ELK kennt nur Rechtecke
function dock(p, q, n, box) {
  if (n.type === 'task') return;
  const cx = box[0] + box[2] / 2, cy = box[1] + box[3] / 2, r = box[2] / 2;
  if (Math.abs(p.y - q.y) < 0.5) { const d = Math.min(r, Math.abs(p.y - cy)); p.x = cx + Math.sign(q.x - cx) * (n.type === 'gateway' ? r - d : Math.sqrt(r * r - d * d)); }
  else if (Math.abs(p.x - q.x) < 0.5) { const d = Math.min(r, Math.abs(p.x - cx)); p.y = cy + Math.sign(q.y - cy) * (n.type === 'gateway' ? r - d : Math.sqrt(r * r - d * d)); }
}
function toDi(g, withLanes, stretch) {
  const di = { lanes: {}, nodes: {}, labels: {}, flows: {}, flowLabels: {} };
  const leafs = withLanes ? g.children.flatMap(l => l.children) : g.children;
  for (const c of leafs) {
    if (!byId[c.id]) continue;
    di.nodes[c.id] = [R(c.x), R(c.y), c.width, c.height];
    const l = (c.labels || [])[0];
    if (l) { const rel = l.x < c.x - 200 || (Math.abs(l.x) < 200 && c.x > 400); di.labels[c.id] = [R(rel ? c.x + l.x : l.x), R(rel ? c.y + l.y : l.y), l.width, l.height]; }
  }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const boxes = withLanes ? g.children.map(l => [l.x, l.y, l.width, l.height]) : Object.values(di.nodes).concat(Object.values(di.labels));
  for (const b of boxes) { x1 = Math.min(x1, b[0]); y1 = Math.min(y1, b[1]); x2 = Math.max(x2, b[0] + b[2]); y2 = Math.max(y2, b[1] + b[3]); }
  if (!withLanes) { x1 -= 30; y1 -= 24; x2 += 24; y2 += 24; }
  if (withLanes) for (const l of g.children) di.lanes[l.id] = stretch ? [R(x1), R(l.y), R(x2 - x1), R(l.height)] : [R(l.x), R(l.y), R(l.width), R(l.height)];
  di.pool = [R(x1 - 30), R(y1), R(x2 - x1 + 30), R(y2 - y1)];
  for (const e of g.edges) {
    const s = e.sections[0], pts = [s.startPoint, ...(s.bendPoints || []), s.endPoint].map(p => ({ x: p.x, y: p.y }));
    const f = flows.find(f => f.id === e.id);
    dock(pts[0], pts[1], byId[f.from], di.nodes[f.from]);
    dock(pts[pts.length - 1], pts[pts.length - 2], byId[f.to], di.nodes[f.to]);
    di.flows[e.id] = pts.map(p => [R(p.x), R(p.y)]);
    const l = (e.labels || [])[0];
    if (l) di.flowLabels[e.id] = [R(l.x), R(l.y), l.width, l.height];
  }
  return di;
}

// --- Kennzahlen einer Anordnung, aus dem BPMN-DI gelesen ---
function metrics(diagramXml) {
  const shapes = Object.fromEntries([...diagramXml.matchAll(/<bpmndi:BPMNShape id="[^"]*" bpmnElement="([^"]+)"[^>]*><dc:Bounds x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(m => [m[1], m.slice(2).map(Number)]));
  const refs = Object.fromEntries([...diagramXml.matchAll(/<bpmn:sequenceFlow id="([^"]+)" sourceRef="([^"]+)" targetRef="([^"]+)"/g)].map(m => [m[1], [m[2], m[3]]]));
  const edges = [...diagramXml.matchAll(/<bpmndi:BPMNEdge id="[^"]*" bpmnElement="([^"]+)">(.*?)<\/bpmndi:BPMNEdge>/g)].map(m => ({ id: m[1], pts: [...m[2].matchAll(/<di:waypoint x="(-?[\d.]+)" y="(-?[\d.]+)"/g)].map(w => [+w[1], +w[2]]) }));
  const laneIds = [...diagramXml.matchAll(/<bpmn:lane id="([^"]+)"/g)].map(m => m[1]);
  const isNode = id => refs && Object.values(refs).some(r => r.includes(id));
  const segs = edges.flatMap(e => e.pts.slice(1).map((p, i) => ({ e: e.id, a: e.pts[i], b: p })));
  let crossings = 0, overlap = 0, through = 0;
  const hor = s => Math.abs(s.a[1] - s.b[1]) < 0.5, lo = (s, k) => Math.min(s.a[k], s.b[k]), hi = (s, k) => Math.max(s.a[k], s.b[k]);
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const s = segs[i], t = segs[j];
    if (s.e === t.e) continue;
    if (hor(s) !== hor(t)) {                                   // echte Kreuzung: einer quer, einer längs, Schnitt im Inneren beider
      const h = hor(s) ? s : t, v = hor(s) ? t : s;
      if (v.a[0] > lo(h, 0) + 1 && v.a[0] < hi(h, 0) - 1 && h.a[1] > lo(v, 1) + 1 && h.a[1] < hi(v, 1) - 1) crossings++;
    } else {                                                   // gleiche Richtung: liegen sie aufeinander?
      const k = hor(s) ? 0 : 1, o = 1 - k;
      if (Math.abs(s.a[o] - t.a[o]) < 2) overlap += Math.max(0, Math.min(hi(s, k), hi(t, k)) - Math.max(lo(s, k), lo(t, k)));
    }
  }
  for (const s of segs) for (const [id, b] of Object.entries(shapes)) {
    if (!isNode(id) || refs[s.e].includes(id)) continue;
    if (hi(s, 0) > b[0] + 1 && lo(s, 0) < b[0] + b[2] - 1 && hi(s, 1) > b[1] + 1 && lo(s, 1) < b[1] + b[3] - 1) through++;
  }
  // Liegt jeder Knoten in seiner Bahn, und überlappen sich Bahnen?
  const laneOf = Object.fromEntries([...diagramXml.matchAll(/<bpmn:lane id="([^"]+)"[^>]*>(.*?)<\/bpmn:lane>/g)].flatMap(m => [...m[2].matchAll(/<bpmn:flowNodeRef>([^<]+)</g)].map(r => [r[1], m[1]])));
  let outside = 0, laneOverlap = 0;
  for (const [id, lane] of Object.entries(laneOf)) { const n = shapes[id], l = shapes[lane]; if (n && l && !(n[0] >= l[0] && n[1] >= l[1] && n[0] + n[2] <= l[0] + l[2] && n[1] + n[3] <= l[1] + l[3])) outside++; }
  const drawn = laneIds.filter(id => shapes[id]);
  for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) { const a = shapes[drawn[i]], b = shapes[drawn[j]]; if (a[0] < b[0] + b[2] - 1 && b[0] < a[0] + a[2] - 1 && a[1] < b[1] + b[3] - 1 && b[1] < a[1] + a[3] - 1) laneOverlap++; }
  const pool = shapes.Participant_1 || [0, 0, 0, 0];
  return { breite: R(pool[2]), hoehe: R(pool[3]), bahnen: drawn.length, bahnenUeberlappen: laneOverlap, knotenAusserhalbIhrerBahn: outside, kreuzungen: crossings, kanteDurchSymbol: through, kantenAufeinanderPx: R(overlap), knicke: edges.reduce((n, e) => n + e.pts.length - 2, 0) };
}

// --- rechnen ---
const elk = new ELK();

// Variante „vorgabe“: Schichten aus einem ersten Durchgang, daraus je Bahn ein Band
const ROW = 116, PAD = 30;
const bands = {};
{
  const first = await elk.layout(structuredClone(variants.flach));
  const layers = [];                                             // Knoten mit überlappendem x-Bereich bilden eine Schicht
  for (const c of [...first.children].sort((a, b) => a.x - b.x)) {
    const last = layers[layers.length - 1];
    if (last && c.x < last.hi - 1) { last.ids.push(c.id); last.hi = Math.max(last.hi, c.x + c.width); } else layers.push({ ids: [c.id], hi: c.x + c.width });
  }
  const y = {};
  let top = 0;
  for (const l of lanes) {
    const rows = Math.max(1, ...layers.map(layer => layer.ids.filter(id => l.nodes.includes(id)).length));
    for (const layer of layers) layer.ids.filter(id => l.nodes.includes(id)).sort((a, b) => l.nodes.indexOf(a) - l.nodes.indexOf(b)).forEach((id, slot) => { y[id] = top + PAD + slot * ROW + (80 - SIZE[byId[id].type][1]) / 2; });
    bands[l.id] = [top, rows * ROW + 2 * PAD - (ROW - 80)];
    top += bands[l.id][1];
  }
  console.log('Schichten im ersten Durchgang:', layers.length, '· Bandhöhen:', JSON.stringify(Object.values(bands).map(b => b[1])));
  variants.vorgabe = { id: 'root', layoutOptions: { ...base, 'elk.layered.crossingMinimization.strategy': 'INTERACTIVE', 'elk.layered.nodePlacement.strategy': 'INTERACTIVE' },
    children: nodes.map(n => ({ ...elkNode(n), x: 0, y: y[n.id] })), edges: elkEdges };
}
const ns = ' xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI"';
const results = {};
for (const [name, graph] of Object.entries(variants)) {
  const t0 = performance.now();
  let g;
  try { g = await elk.layout(structuredClone(graph)); } catch (err) { console.log(name + ': ELK-FEHLER ' + String(err && err.message || err).slice(0, 300)); continue; }
  const ms = performance.now() - t0;
  const withLanes = name === 'gruppen' || name === 'anker';
  const di = toDi(g, withLanes, name === 'anker');
  if (name === 'vorgabe') {                                      // Bänder aus der Vorgabe, verschoben um das, was ELK oben abgeschnitten hat
    const dy = di.nodes[nodes[0].id][1] - variants.vorgabe.children[0].y;
    const x1 = di.pool[0] + 30, w = di.pool[2] - 30;
    for (const l of lanes) di.lanes[l.id] = [x1 - 26, R(bands[l.id][0] + dy), w + 26, bands[l.id][1]];
    const ys = Object.values(di.lanes);
    di.pool = [x1 - 56, ys[0][1], w + 56, ys[ys.length - 1][1] + ys[ys.length - 1][3] - ys[0][1]];
  }
  const model = { vertical: false, nodes, flows, lanes: withLanes || name === 'vorgabe' ? lanes : [] };
  const full = xml.replace(/<\/bpmn:definitions>\s*$/, diXml(model, di, 'Collaboration_1', 'Participant_1', ns) + '</bpmn:definitions>\n');
  fs.writeFileSync(out('elk-' + name + '.bpmn'), full);
  results['ELK ' + name] = { xml: full, ms: R(ms) };
}
// Vergleich: Mermaid-Anordnung aus dem gebauten Export (Diagramm 5) und die Handanordnung (Diagramm 4)
const exportFile = path.join(here, 'dist', 'beispiel-prozesse.nur-lesen.html');
if (fs.existsSync(exportFile)) {
  const links = [...fs.readFileSync(exportFile, 'utf8').matchAll(/href="data:application\/xml;charset=utf-8,([^"]*)"/g)].map(m => decodeURIComponent(m[1]));
  if (links[4]) results['Mermaid (Diagramm 5)'] = { xml: links[4] };
  if (links[3]) results['von Hand (Diagramm 4)'] = { xml: links[3] };
}
console.table(Object.fromEntries(Object.entries(results).map(([k, r]) => [k, { ...metrics(r.xml), ms: r.ms ?? '' }])));

// --- zeichnen: dieselbe Darstellung wie im Spike, Bibliotheken lokal ---
const fence = '```';
const md = '# ELK\n\n## Varianten\n\n' + Object.entries(results).filter(([k]) => k.startsWith('ELK')).map(([k, r]) => '### ' + k + '\n\n' + fence + 'bpmn\n' + r.xml + fence + '\n').join('\n');
const local = p => 'file://' + path.join(here, 'node_modules', p);
const html = assemble(md)
  .replace('https://cdn.jsdelivr.net/npm/marked@18/lib/marked.umd.js', local('marked/lib/marked.umd.js'))
  .replace('https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.min.js', local('mermaid/dist/mermaid.min.js'))
  .replace('https://cdn.jsdelivr.net/npm/bpmn-js@18/dist/bpmn-navigated-viewer.production.min.js', local('bpmn-js/dist/bpmn-navigated-viewer.production.min.js'));
fs.writeFileSync(out('_elk.html'), html);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 2600, height: 1200 } });
page.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
await page.goto('file://' + out('_elk.html'));
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
console.log('Warnungen auf der Seite:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.dokufix-warnung')].map(w => w.textContent))));
await page.evaluate(() => { document.querySelector('.dokufix-wrap').style.cssText = 'display:block;max-width:none'; document.querySelectorAll('.dokufix-stage').forEach(s => { s.style.maxWidth = 'none'; const svg = s.querySelector('svg'); svg.style.width = svg.viewBox.baseVal.width + 'px'; }); });
const figs = page.locator('figure.dokufix-diagram-bpmn');
const names = Object.keys(results).filter(k => k.startsWith('ELK'));
for (let i = 0; i < await figs.count(); i++) await figs.nth(i).locator('.dokufix-stage svg').screenshot({ path: out('elk-' + names[i].slice(4) + '.png') });
await browser.close();

const lib = fs.readFileSync(path.join(here, 'node_modules/elkjs/lib/elk.bundled.js'));
console.log('elkjs', JSON.parse(fs.readFileSync(path.join(here, 'node_modules/elkjs/package.json'), 'utf8')).version, 'elk.bundled.js:', lib.length, 'Bytes,', zlib.gzipSync(lib).length, 'gzip');
