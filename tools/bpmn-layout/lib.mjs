// Gemeinsames der Layout-Werkzeuge (aus Spike 2.26 im Store übernommen, 2026-10-07, auf LMM umgestellt):
// die Eingaben lesen, mit dem Layout eines Stands anordnen, wie die Seite es tut (readProcess → kanonisch →
// layoutGeometry → appendDiagram), Brüche zählen, Größe, Blöcke und Nähe zu einer Referenz messen, die ein Mensch
// gezeichnet hat. Seit LMM braucht eine Eingabe nur ihr XML: keine Rohpositionen von Mermaid, keine gemessenen
// Labelgrößen.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DOMParser } from 'linkedom';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../..');
// Alles, was die Werkzeuge schreiben: Läufe, das Archiv der Feedback-Sätze, die Auswertungen, die Seiten. Nicht im
// Repository (.gitignore): Läufe und Archiv enthalten die angeordneten externen Eingaben.
export const ARBEIT = process.env.DOKUFIX_LAYOUT_ARBEIT || path.join(HERE, 'arbeit');
const EINGABEN = path.join(HERE, 'eingaben');
// Die externen Eingaben (Fremddateien, nicht im Repository): der Ordner von Spike 2.26 im Store.
export const EXTERN_ROOT = process.env.DOKUFIX_EXTERN || path.join(REPO, '_bmad-output/initiative-dokufix/spike-2-26');

// Die Sätze. Der Satz von 70 (Spike 2.26): sauber (48, 19 davon die Fixtures), ben (2), extern (20). Die Sätze mit
// Pools, Black Boxes, angehefteten Ereignissen und Notizen (Stories 2.12, 2.29 bis 2.31), je eigen und extern.
// laufzeit (Bens hund3, A2 braucht dafür 10 s) nur auf Nennung.
const FIXTURES = ['demo2', 'demo3', 'ereignis', 'hund', 'hund2', 'mehrere', 'r01', 'r02', 'r03', 'r08', 'r10', 'r12', 'r19', 'r20', 'ref3', 'ref4', 'ref8', 'reparatur', 'zwei'];
const SATZ_ORDNER = [
  ['sauber', path.join(EINGABEN, 'sauber'), false],
  ['ben', path.join(EINGABEN, 'ben'), false],
  ['extern', path.join(EXTERN_ROOT, 'extern/auswahl'), true],
  ['pools', path.join(EINGABEN, 'pools'), false],
  ['pools', path.join(EXTERN_ROOT, 'extern/pools'), true],
  ['blackbox', path.join(EINGABEN, 'blackbox'), false],
  ['blackbox', path.join(EXTERN_ROOT, 'extern/blackbox'), true],
  ['angeheftet', path.join(EINGABEN, 'angeheftet'), false],
  ['angeheftet', path.join(EXTERN_ROOT, 'extern/angeheftet'), true],
  ['notizen', path.join(EINGABEN, 'notizen'), false],
  ['notizen', path.join(EXTERN_ROOT, 'extern/notizen'), true],
  ['laufzeit', path.join(EINGABEN, 'laufzeit'), false],
];
// Eigene Eingaben, die auf einer externen beruhen, bleiben bei den externen.
const EXTERN_EINZELN = [['notizen', path.join(EXTERN_ROOT, 'eingaben/notizen/nz23-x-tm1.bpmn')]];
export const POOL_SAETZE = ['pools', 'blackbox', 'angeheftet', 'notizen'];
export const STANDARD_SAETZE = ['sauber', 'ben', 'extern', ...POOL_SAETZE];

// name → { name, set, extern, file, ref }: ref die Referenz von Hand, wo es eine gibt (<name>.ref.bpmn daneben;
// hund2: Bens Handlayout).
export const INPUTS = (() => {
  const all = new Map();
  const add = (name, set, extern, file) => {
    if (all.has(name)) throw new Error('Eingabe doppelt: ' + name + ' (' + all.get(name).file + ', ' + file + ')');
    const ref = name === 'hund2' ? path.join(EINGABEN, 'referenzen/hund2.bpmn') : file.replace(/\.bpmn$/, '.ref.bpmn');
    all.set(name, { name, set, extern, file, ref: fs.existsSync(ref) ? ref : null });
  };
  for (const n of FIXTURES) add(n, 'sauber', false, path.join(REPO, 'tests/fixtures/bpmn-layout', n + '.bpmn'));
  for (const [set, dir, extern] of SATZ_ORDNER){
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.bpmn') && !f.endsWith('.ref.bpmn')).sort()) add(f.slice(0, -5), set, extern, path.join(dir, f));
  }
  for (const [set, file] of EXTERN_EINZELN) if (fs.existsSync(file)) add(path.basename(file, '.bpmn'), set, true, file);
  return all;
})();
export const externFehlt = () => !fs.existsSync(path.join(EXTERN_ROOT, 'extern'));
export const namesOf = sets => [...INPUTS.values()].filter(i => sets.includes(i.set)).map(i => i.name);

export function readInput(name){
  const i = INPUTS.get(name);
  if (!i) throw new Error('keine Eingabe ' + name);
  return { ...i, xml: fs.readFileSync(i.file, 'utf8') };
}
export const referenceOf = name => { const i = INPUTS.get(name); return i && i.ref ? fs.readFileSync(i.ref, 'utf8') : null; };

// Der Stand, mit dem angeordnet wird: der Arbeitsbaum (src/app) oder ein Commit, dessen src/app nach
// arbeit/staende/<commit>/ ausgepackt wird. Ein Stand vor LMM (f0ff93e) brauchte Mermaids Rohpositionen und geht
// nicht.
const MODULE_FILES = ['bpmn-layout.js', 'lmm.js', 'label-size.js'];
const PARSER_FILE = 'xml-parser.js';
export async function loadStand(ref){
  let dir = path.join(REPO, 'src/app'), commit, dirty = false;
  const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8' }).trim();
  if (ref){
    commit = git('rev-parse', '--verify', ref + '^{commit}');
    dir = path.join(ARBEIT, 'staende', commit.slice(0, 12));
    if (!fs.existsSync(path.join(dir, 'lmm.js'))){
      fs.mkdirSync(dir, { recursive: true });
      for (const f of MODULE_FILES){
        let text;
        try { text = execFileSync('git', ['show', commit + ':src/app/' + f], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
        catch { fs.rmSync(dir, { recursive: true, force: true }); throw new Error('Stand ' + ref + ' hat kein src/app/' + f + ': vor LMM (f0ff93e) ordnete Mermaid an, das geht hier nicht.'); }
        fs.writeFileSync(path.join(dir, f), text);
      }
    }
    // Der eigene XML-Leser des Layouts (seit 4e44726); ein älterer Stand hat keinen und liest mit linkedom.
    if (!fs.existsSync(path.join(dir, PARSER_FILE))){
      try { fs.writeFileSync(path.join(dir, PARSER_FILE), execFileSync('git', ['show', commit + ':src/app/' + PARSER_FILE], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); }
      catch { /* vor dem eigenen Leser */ }
    }
  } else {
    commit = git('rev-parse', 'HEAD');
    dirty = git('status', '--porcelain', '--', 'src/app').length > 0;
  }
  const layout = await import(pathToFileURL(path.join(dir, 'bpmn-layout.js')).href);
  const lmm = await import(pathToFileURL(path.join(dir, 'lmm.js')).href);
  const hasParser = fs.existsSync(path.join(dir, PARSER_FILE));
  const parser = hasParser ? await import(pathToFileURL(path.join(dir, PARSER_FILE)).href) : null;
  const hash = crypto.createHash('sha1');
  for (const f of [...MODULE_FILES, ...(hasParser ? [PARSER_FILE] : [])]) hash.update(fs.readFileSync(path.join(dir, f)));
  return { dir, commit, dirty, logik: hash.digest('hex').slice(0, 8), layout, lmm, parser, DEFAULT_RULES: layout.DEFAULT_RULES };
}

// Das Modell, wie die Fixtures es lesen (tests/bpmn-fixtures.mjs, readModel()): mit dem eigenen XML-Leser des Stands
// (src/app/xml-parser.js), wie die Seite. Ein Stand vor ihm (vor 4e44726) las mit linkedom, "&amp;" als Leerzeichen;
// sein readProcess() schneidet Präfixe ab und kommt damit zurecht, das heutige prüft den Namensraum, den linkedom
// nicht liefert.
export const readModel = (stand, xml) => stand.parser
  ? stand.layout.readProcess(stand.parser.parseXml(xml))
  : stand.layout.readProcess(new DOMParser().parseFromString(xml.replace(/&amp;/g, ' '), 'text/xml'));

// { xml, di, model, leftOut }: die Eingabe angeordnet wie auf der Seite (layoutBpmn() in src/app/bpmn.js): das
// Modell in LMMs Ordnung mit seinen Spalten an layoutGeometry(), das Modell des Autors an appendDiagram().
// options: die Regel-Schalter (DEFAULT_RULES).
export function layOut(stand, xml, options){
  const read = readModel(stand, xml);
  if (!read) throw new Error('kein BPMN');
  const sorted = stand.lmm.kanonisch(read.model);
  const di = stand.layout.layoutGeometry(sorted.model, stand.lmm.lmmPositions(sorted.model, sorted.rank), undefined, options);
  return { ...stand.layout.appendDiagram(xml, read.model, di), di, model: read.model, leftOut: read.leftOut };
}

export async function rules(){ return (await import(pathToFileURL(path.join(REPO, 'tests/bpmn-rules.mjs')).href)).breaksOf; }

// Ein Lauf: arbeit/<lauf>.json und arbeit/<lauf>/<name>.bpmn.
export const laufFile = lauf => path.join(ARBEIT, lauf + '.json');
export const laufDir = lauf => path.join(ARBEIT, lauf);
export function readLauf(lauf){
  if (!fs.existsSync(laufFile(lauf))) throw new Error('kein Lauf ' + lauf + ' (erst: node tools/bpmn-layout/lauf.mjs --lauf ' + lauf + ')');
  return JSON.parse(fs.readFileSync(laufFile(lauf), 'utf8'));
}

// Brüche ohne node-outside-lane für Gateways: ein Gateway darf in jeder Bahn
// liegen (Ben, 2026-10-04); die Zahl der so gezeichneten Gateways wird eigens gezählt.
export function splitBreaks(breaks, model){
  // Gateways und, seit R1 sie auch versetzt (Ben, 2026-10-05), End-Ereignisse: in einer anderen Bahn als in der Eingabe gewollt, kein Bruch.
  const gw = new Set(model.nodes.filter(n => n.type === 'gateway' || n.tag === 'endEvent').map(n => n.id));
  const moved = breaks.filter(b => { const [rule, id] = b.split(' '); return rule === 'node-outside-lane' && gw.has(id); });
  return { breaks: breaks.filter(b => !moved.includes(b)), movedGateways: moved.length };
}

export function poolSize(di){
  const ps = Object.values(di.pools || {});
  if (ps.length) return [Math.max(...ps.map(p => p[0] + p[2])) - Math.min(...ps.map(p => p[0])), Math.max(...ps.map(p => p[1] + p[3])) - Math.min(...ps.map(p => p[1]))];
  const xs = [], ys = [];
  for (const [x, y, w, h] of Object.values(di.nodes)){ xs.push(x, x + w); ys.push(y, y + h); }
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

// Das DI einer Datei: Knoten (Mitte), Bahnen, Flüsse; jedes Präfix, Attribute in jeder Reihenfolge.
const attr = (tag, name) => { const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; };
export function readDi(xml){
  const shapes = {};
  for (const m of xml.matchAll(/<(?:[\w-]+:)?BPMNShape\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?BPMNShape>/g)){
    const b = /<(?:[\w-]+:)?Bounds\b([^>]*)\/?>/.exec(m[2]);
    if (!b) continue;
    const id = attr(m[1], 'bpmnElement'), x = +attr(b[1], 'x'), y = +attr(b[1], 'y'), w = +attr(b[1], 'width'), h = +attr(b[1], 'height');
    shapes[id] = { id, x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }
  const flows = {};
  for (const m of xml.matchAll(/<(?:[\w-]+:)?BPMNEdge\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?BPMNEdge>/g))
    flows[attr(m[1], 'bpmnElement')] = [...m[2].matchAll(/<(?:[\w-]+:)?waypoint\b([^>]*)\/?>/g)].map(w => [+attr(w[1], 'x'), +attr(w[1], 'y')]);
  return { shapes, flows };
}

// Rückkanten per Tiefensuche über die Flüsse des Modells (in XML-Reihenfolge).
export function backEdges(model){
  const out = new Map(model.nodes.map(n => [n.id, []]));
  // A flow from a boundary event leaves its host (story 2.30).
  const hostOf = new Map((model.boundaries || []).map(b => [b.id, b.host]));
  for (const f of model.flows) out.get(hostOf.get(f.from) ?? f.from).push(f);
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
  return back;
}

// Nähe eines Layouts (di-Datei als XML) zu Bens Layout (XML), beide mit demselben Modell:
//   lane     Anteil der Knoten in Bens Bahn
//   gwLane   Anteil der Gateways in Bens Bahn
//   rows     Anteil der Knotenpaare derselben Bahn (bei Ben) mit gleicher Zeilenbeziehung (gleich / über / unter; gleich bei |dy| < 20)
//   cols     Anteil aller Knotenpaare mit gleicher Spaltenbeziehung (gleich / links / rechts; gleich bei |dx| < 30)
//   detour   Weglänge der Rückkanten geteilt durch ihren Manhattan-Abstand (1 = keine Umwege)
//   channel  Anteil der Rückkanten, deren waagerechte Stücke zwischen den Zeilen laufen (kein Stück im Höhenband eines Knotens derselben Bahnen, der nicht Quelle oder Ziel ist)
//   size     [w, h] des Pools, ratio = Fläche / Bens Fläche
export function closeness(xml, benXml, model){
  const a = readDi(xml), b = readDi(benXml);
  const laneIds = model.lanes.filter(l => !l.synthetic).map(l => l.id);
  const laneOf = (di, n) => { const s = di.shapes[n]; const l = laneIds.find(id => { const L = di.shapes[id]; return L && s.cy >= L.y && s.cy <= L.y + L.h; }); return l || '?'; };
  const ids = model.nodes.map(n => n.id).filter(id => a.shapes[id] && b.shapes[id]);
  const gws = model.nodes.filter(n => n.type === 'gateway').map(n => n.id).filter(id => ids.includes(id));
  const same = (p, q) => p === q;
  let lane = 0; for (const id of ids) if (same(laneOf(a, id), laneOf(b, id))) lane++;
  let gwLane = 0; for (const id of gws) if (same(laneOf(a, id), laneOf(b, id))) gwLane++;
  const rel = (u, v, tol) => Math.abs(u - v) < tol ? 0 : Math.sign(u - v);
  let rowsN = 0, rowsOk = 0, colsN = 0, colsOk = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++){
    const p = ids[i], q = ids[j];
    colsN++; if (rel(a.shapes[p].cx, a.shapes[q].cx, 30) === rel(b.shapes[p].cx, b.shapes[q].cx, 30)) colsOk++;
    if (laneOf(b, p) === laneOf(b, q)){ rowsN++; if (rel(a.shapes[p].cy, a.shapes[q].cy, 20) === rel(b.shapes[p].cy, b.shapes[q].cy, 20)) rowsOk++; }
  }
  const back = backEdges(model);
  let chN = 0, chOk = 0, len = 0, direct = 0;
  for (const f of model.flows){
    if (!back.has(f.id) || !a.flows[f.id]) continue;
    chN++;
    const pts = a.flows[f.id];
    for (let k = 1; k < pts.length; k++) len += Math.abs(pts[k][0] - pts[k - 1][0]) + Math.abs(pts[k][1] - pts[k - 1][1]);
    direct += Math.abs(pts[pts.length - 1][0] - pts[0][0]) + Math.abs(pts[pts.length - 1][1] - pts[0][1]);
    const bands = model.nodes.filter(n => n.id !== f.from && n.id !== f.to).map(n => a.shapes[n.id]).filter(Boolean);
    let clean = true;
    for (let k = 1; k < pts.length; k++){
      const [x1, y1] = pts[k - 1], [x2, y2] = pts[k];
      if (y1 !== y2) continue;
      const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
      if (bands.some(s => y1 > s.y && y1 < s.y + s.h && hi > s.x - 20 && lo < s.x + s.w + 20)) clean = false;
    }
    if (clean) chOk++;
  }
  const pool = di => { const p = Object.values(di.shapes).find(s => model.pools && model.pools.length === 1 && s.id === model.pools[0].id); return p ? [p.w, p.h] : [0, 0]; };
  const sa = pool(a), sb = pool(b);
  return { lane: lane / ids.length, gwLane: gws.length ? gwLane / gws.length : 1, rows: rowsN ? rowsOk / rowsN : 1, cols: colsN ? colsOk / colsN : 1, channel: chN ? chOk / chN : 1, backEdges: chN, detour: direct ? len / direct : 1, size: sa, ratio: sb[0] * sb[1] ? sa[0] * sa[1] / (sb[0] * sb[1]) : 0 };
}

export const pct = v => (Math.round(v * 1000) / 10).toFixed(1) + ' %';

export function args(argv, flags = []){
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++){
    const m = /^--(.+)$/.exec(argv[i]);
    if (!m) a._.push(argv[i]);
    else if (flags.includes(m[1])) a[m[1]] = true;
    else a[m[1]] = argv[++i];
  }
  return a;
}

// R8-Maß: je parallelem Block (Split, nächster Join, Zweige dazwischen) sein
// Rechteck im Layout (Split bis Join, über die Bahnen der Zweige); fremde
// Knoten, deren Mitte darin liegt, und fremde Flüsse mit einem Stück darin
// (nicht die Flüsse des Blocks und nicht die, die an Split oder Join enden).
// Dazu inColumns: Zweigelemente, deren Kasten waagerecht den des Splits oder des Joins überdeckt (Bens Muster 11: 0).
// { blocks, foreignNodes, foreignFlows, inColumns }
export function blockStats(xml, model){
  const di = readDi(xml), back = backEdges(model);
  const out = new Map(model.nodes.map(n => [n.id, []])), inn = new Map(model.nodes.map(n => [n.id, []]));
  const hostOf = new Map((model.boundaries || []).map(b => [b.id, b.host]));
  for (const f of model.flows) if (!back.has(f.id)){ out.get(hostOf.get(f.from) ?? f.from).push(f); inn.get(f.to).push(f); }
  const reach = id => { const seen = new Set(), st = [id]; while (st.length){ const x = st.pop(); for (const f of out.get(x)) if (!seen.has(f.to)){ seen.add(f.to); st.push(f.to); } } return seen; };
  const tag = Object.fromEntries(model.nodes.map(n => [n.id, n.tag]));
  let blocks = 0, foreignNodes = 0, foreignFlows = 0, inColumns = 0;
  for (const n of model.nodes){
    if (tag[n.id] !== 'parallelGateway' || out.get(n.id).length < 2) continue;
    const rp = reach(n.id);
    const joins = model.nodes.filter(m => m.tag === 'parallelGateway' && inn.get(m.id).length >= 2 && inn.get(m.id).every(f => f.from === n.id || rp.has(f.from)) && di.shapes[m.id] && di.shapes[m.id].cx > di.shapes[n.id].cx);
    if (!joins.length) continue;
    const J = joins.sort((a, b) => di.shapes[a.id].cx - di.shapes[b.id].cx)[0];
    const rj = reach(J.id);
    const inner = [...rp].filter(x => x !== J.id && !rj.has(x));
    const ids = new Set([n.id, J.id, ...inner]);
    const boxes = [...ids].map(id => di.shapes[id]).filter(Boolean);
    const x1 = di.shapes[n.id].x, x2 = di.shapes[J.id].x + di.shapes[J.id].w, y1 = Math.min(...boxes.map(b => b.y)), y2 = Math.max(...boxes.map(b => b.y + b.h));
    blocks++;
    // Zweigelemente in den Spalten der Gateways: ihr Kasten überdeckt waagerecht den des Splits oder des Joins.
    for (const id of inner){ const s = di.shapes[id]; if (s && [di.shapes[n.id], di.shapes[J.id]].some(gw => s.x < gw.x + gw.w && s.x + s.w > gw.x)) inColumns++; }
    for (const m of model.nodes){ const s = di.shapes[m.id]; if (!ids.has(m.id) && s && s.cx > x1 && s.cx < x2 && s.cy > y1 && s.cy < y2) foreignNodes++; }
    for (const f of model.flows){
      // Flüsse des Blocks und die, die an Split oder Join enden oder beginnen (sie betreten den Raum an seiner Grenze), zählen nicht.
      if ((ids.has(f.from) && ids.has(f.to)) || [f.from, f.to].some(id => id === n.id || id === J.id)) continue;
      const pts = di.flows[f.id] || [];
      let hit = false;
      for (let k = 1; k < pts.length; k++){
        const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
        if (Math.max(ax, bx) > x1 + 1 && Math.min(ax, bx) < x2 - 1 && Math.max(ay, by) > y1 + 1 && Math.min(ay, by) < y2 - 1) hit = true;
      }
      if (hit) foreignFlows++;
    }
  }
  return { blocks, foreignNodes, foreignFlows, inColumns };
}

// Prüfungen, die die Regelprüfung von Eintrag 24 nicht kennt (Spike 2.26, nach
// Bens Sichtung): node-overlap <a> <b>, zwei Knoten, deren Kästen sich mehr als
// 2 px überdecken. node-outside-pool prüft seit Story 2.12 die Regelprüfung selbst.
export function shapeBreaks(xml, model){
  const di = readDi(xml), ids = model.nodes.map(n => n.id).filter(id => di.shapes[id]), out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++){
    const p = di.shapes[ids[i]], q = di.shapes[ids[j]];
    if (Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 2 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 2) out.push(`node-overlap ${ids[i]} ${ids[j]}`);
  }
  return out;
}

// Alle Brüche einer angeordneten Fassung: die Regelprüfung (tests/bpmn-rules.mjs) und shapeBreaks(), ohne Gateways
// und End-Ereignisse in einer anderen Bahn. Der Modellierer schreibt eingerückt; die Regelprüfung liest das DI so,
// wie die Anordnung es schreibt, ohne Leerraum zwischen den Tags und "/>" ohne Leerzeichen.
export const compact = xml => xml.replace(/>\s+</g, '><').replace(/\s+\/>/g, '/>');
export function allBreaks(breaksOf, xml, model){ return splitBreaks([...breaksOf(xml, model), ...shapeBreaks(xml, model)], model); }
