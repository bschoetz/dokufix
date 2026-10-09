// --- Fingerprints and similarity of BPMN inputs ------------------------------
// The layout workbench and the tools of tools/bpmn-layout/ ask of two inputs
// whether they are the same case or the same shape, and which inputs are
// alike (story 2.37). This module answers, in pure logic, the same in Node and
// in every browser, synchronous and without a library: the workbench calls it
// from a file:// page, where crypto.subtle is not sure to exist.
//
//   sha256(text)            SHA-256 of the text as UTF-8, 64 hex digits
//   caseFingerprint(xml)    { hash, short }: the case, or null
//   shapeOf(xml)            { hash, short, features }: the shape, or null
//   similarity(a, b)        0 to 1, from the features of two shapes
//   nearest(name, all, k)   the k inputs nearest to one by shape
//
// The case is a SHA-256 over the cleaned XML. The cleaning keeps what the
// author wrote and the layout reads: ids, names with their line breaks, the
// texts, the order of lanes and pools. It drops what a tool adds or an editor
// changes without changing the case: the diagram part with every position,
// colours and tool extensions (extensionElements, and every element and
// attribute of a namespace other than BPMN's), the name, exporter,
// exporterVersion and targetNamespace of the definitions, comments and the
// blank text between tags; an element is its local name, whatever prefix
// binds BPMN's namespace (bpmn:, bpmn2:, none), and its attributes are sorted.
// And it sorts what has no order in BPMN and none for the layout
// (tests/lmm.test.mjs proves that the layout ignores it, Ben, 2026-10-09,
// decision 1b): flow nodes, boundary events, sequence flows, flowNodeRef,
// text annotations, associations, message flows, data references, data
// associations, and the incoming and outgoing of a node, each by its id or
// the id it names. The input itself is never changed.
//
// The shape is the process without its words: a graph read from the model
// readProcess() gives (src/app/bpmn-layout.js), hashed by a Weisfeiler-Lehman
// pass. Its vertices are the flow nodes, the boundary events, the sequence and
// message flows (subdivided, so that an association can reach one), the text
// annotations, the data references and the pools. A vertex starts with its
// class and kind (task, sub-process, event of a kind, gateway of a kind, data
// object or store, note, flow, message flow) and its place, the index of its
// pool and of its lane in the pool; an edge has its kind and direction. Each
// round labels a vertex anew by the hash of its label and its neighbours'
// labels, until the number of labels no longer grows. The hash covers every
// round and the pools (black box or not, drawn with a frame or, a process
// without a participant, without, their lanes and which of them are
// synthetic). Kept: classes, the kind of an event (start, intermediate, end,
// on a border) and of a gateway, flows with their direction, message flows,
// associations, data associations, the lane of each node, the order of lanes
// and pools, a pool's frame, boundary events at their host, black box or not, data object or
// data store (decision 2). Dropped: ids, every text, task subtypes, event
// definitions, cancelActivity (decision 2), metadata, colours. The same shape
// means very alike, not the same picture: ids and texts act on the picture
// through the size of a label and as the tie-break among equals.
//
// The features are the counts of the labels of rounds 0 to 3; the similarity
// of two shapes is their weighted Jaccard index, the sum of the smaller counts
// over the sum of the larger. Deeper rounds would make every input unlike
// every other.
//
// It does nothing when it loads. Nothing in the page imports it yet.

import { parseXml } from './xml-parser.js';
import { readProcess } from './bpmn-layout.js';

const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
// The length of a fingerprint as it is shown, in hex digits.
const SHORT = 12;
// The rounds whose labels are the features.
const FEATURE_ROUNDS = 3;

// ---------- SHA-256 (FIPS 180-4) ----------
// The round constants, made on the first call, not when the module loads.
let K = null;
function constants(){
  if (K) return K;
  K = new Uint32Array(64);
  const frac = x => ((x - Math.floor(x)) * 0x100000000) >>> 0;
  for (let n = 2, i = 0; i < 64; n++){
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0){ prime = false; break; }
    if (prime) K[i++] = frac(Math.cbrt(n));
  }
  return K;
}
const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

export function sha256(text){
  const k = constants();
  const data = new TextEncoder().encode(String(text));
  const bits = data.length * 8;
  // The message, a 1 bit, zeros, and its length in bits as 64 bits.
  const total = Math.ceil((data.length + 9) / 64) * 64;
  const m = new Uint8Array(total);
  m.set(data);
  m[data.length] = 0x80;
  const view = new DataView(m.buffer);
  view.setUint32(total - 8, Math.floor(bits / 0x100000000));
  view.setUint32(total - 4, bits >>> 0);
  const h = H0.slice();
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64){
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(off + 4 * t);
    for (let t = 16; t < 64; t++){
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++){
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + k[t] + w[t]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return h.map(x => x.toString(16).padStart(8, '0')).join('');
}

const fingerprint = hash => ({ hash, short: hash.slice(0, SHORT) });

// The parsed document of xml, or null where it is no BPMN definitions or the
// parser rejects it.
function definitions(xml){
  let doc;
  try { doc = parseXml(xml); } catch { return null; }
  const root = doc.documentElement;
  return root && root.namespaceURI === BPMN_NS && root.localName === 'definitions' ? doc : null;
}

// ---------- the case ----------
// What the cleaning sorts, by local name: each group among itself, by the id
// of its element or, for a reference, the id it names.
const FLOW_NODE = /^(startEvent|endEvent|intermediateCatchEvent|intermediateThrowEvent|\w*Gateway|task|\w+Task|callActivity|subProcess|adHocSubProcess|transaction)$/;
const GROUPS = ['boundaryEvent', 'sequenceFlow', 'dataReference', 'textAnnotation', 'association', 'messageFlow', 'flowNodeRef', 'incoming', 'outgoing', 'dataInputAssociation', 'dataOutputAssociation'];
const groupOf = name => FLOW_NODE.test(name) ? 'flowNode' : /^data(Object|Store)Reference$/.test(name) ? 'dataReference' : GROUPS.includes(name) ? name : null;
const GROUP_ORDER = ['flowNode', ...GROUPS];
const REFERENCE = new Set(['flowNodeRef', 'incoming', 'outgoing']);
// What the definitions carry that a tool writes, not the author.
const TOOL_ATTRIBUTES = new Set(['name', 'exporter', 'exporterVersion', 'targetNamespace']);
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// The cleaned document as one string: per element [localName, [[attribute,
// value]…, sorted], children…], a text as a string, written as JSON, so that
// no question of escaping arises. Walked with a stack, not by recursion, as
// the parser walks, so a deep document is cleaned too.
function cleaned(root){
  const out = new Map();
  const keep = el => el.namespaceURI === BPMN_NS && el.localName !== 'extensionElements';
  const stack = [[root, false]];
  while (stack.length){
    const [el, done] = stack.pop();
    if (!done){
      stack.push([el, true]);
      for (const k of el.children) if (keep(k)) stack.push([k, false]);
      continue;
    }
    const attrs = el.attributes
      .filter(a => a.namespaceURI === null && !(el === root && TOOL_ATTRIBUTES.has(a.localName)))
      .map(a => [a.localName, a.value])
      .sort((a, b) => byText(a[0], b[0]));
    // Texts that are blanks only go (a CDATA section stays, as in bpmn-js); a
    // text left beside a text, where a comment or an element dropped stood
    // between them, joins it.
    const fixed = [], groups = new Map();
    let text = null;
    // A reference's text trimmed, as readProcess() reads it.
    const flush = () => { if (text !== null){ fixed.push(JSON.stringify(REFERENCE.has(el.localName) ? text.trim() : text)); text = null; } };
    for (const node of el.childNodes){
      if (node.nodeType === 3 || node.nodeType === 4){
        if (node.nodeType === 3 && !node.data.trim()) continue;
        text = (text ?? '') + node.data;
        continue;
      }
      if (node.nodeType !== 1 || !keep(node)) continue;
      flush();
      const group = groupOf(node.localName);
      if (!group){ fixed.push(out.get(node)); continue; }
      const key = REFERENCE.has(node.localName) ? node.textContent.trim() : (node.getAttribute('id') || '');
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push([key, out.get(node)]);
    }
    flush();
    const sorted = GROUP_ORDER.filter(g => groups.has(g)).flatMap(g => groups.get(g).sort((a, b) => byText(a[0], b[0]) || byText(a[1], b[1])).map(x => x[1]));
    out.set(el, '[' + [JSON.stringify(el.localName), JSON.stringify(attrs), ...fixed, ...sorted].join(',') + ']');
    for (const k of el.children) out.delete(k);
  }
  return out.get(root);
}

// The case of xml: { hash, short }, or null where it is no BPMN definitions.
export function caseFingerprint(xml){
  const doc = definitions(xml);
  return doc ? fingerprint(sha256(cleaned(doc.documentElement))) : null;
}

// ---------- the shape ----------
const HOLDS = new Set(['subProcess', 'adHocSubProcess', 'transaction', 'callActivity']);
// A flow node's class and kind.
const classOf = n => n.type === 'gateway' ? 'gateway:' + n.tag : n.type === 'task' ? (HOLDS.has(n.tag) ? 'subprocess' : 'task') : 'event:' + n.type;

// The graph of a model: { labels, adjacent, pools }, labels the first label
// of each vertex, adjacent per vertex its [edge, vertex] pairs, an edge its
// kind and ">" where the vertex is its source, "<" where it is its target.
function graphOf(model){
  const labels = [], adjacent = [];
  const vertex = label => { labels.push(label); adjacent.push([]); return labels.length - 1; };
  const edge = (a, b, kind) => { adjacent[a].push([kind + '>', b]); adjacent[b].push([kind + '<', a]); };
  // A lane's index in its pool, and the lane of each node.
  const laneIndex = new Map(), laneOfNode = new Map(), seen = new Map();
  for (const lane of model.lanes){
    const i = seen.get(lane.pool) || 0;
    seen.set(lane.pool, i + 1);
    laneIndex.set(lane.key, i);
    for (const id of lane.nodes) if (!laneOfNode.has(id)) laneOfNode.set(id, lane);
  }
  const place = lane => lane ? lane.pool + '|' + laneIndex.get(lane.key) : '-|-';
  // A pool without an id is drawn without a frame: a process alone, without a participant.
  const pools = model.pools.map((p, i) => (p.box ? 'box' : p.id ? 'pool' : 'bare') + ':' + model.lanes.filter(l => l.pool === i).map(l => l.synthetic ? 's' : 'l').join(''));
  const poolV = pools.map((p, i) => vertex('pool|' + i + '|' + p));
  const poolOf = new Map(model.pools.map((p, i) => [p.id, i]).filter(([id]) => id));
  const nodeV = new Map(), boundaryV = new Map(), flowV = new Map(), messageV = new Map(), noteV = new Map(), dataV = new Map();
  for (const n of model.nodes) nodeV.set(n.id, vertex(classOf(n) + '|' + place(laneOfNode.get(n.id))));
  for (const b of model.boundaries){
    boundaryV.set(b.id, vertex('event:boundary|' + place(laneOfNode.get(b.host))));
    edge(boundaryV.get(b.id), nodeV.get(b.host), 'host');
  }
  const at = id => nodeV.get(id) ?? boundaryV.get(id);
  for (const f of model.flows){
    flowV.set(f.id, vertex('flow'));
    edge(at(f.from), flowV.get(f.id), 'flow');
    edge(flowV.get(f.id), at(f.to), 'flow');
  }
  for (const m of model.messages){
    messageV.set(m.id, vertex('message'));
    edge(m.fromPool !== undefined ? poolV[m.fromPool] : at(m.from), messageV.get(m.id), 'message');
    edge(messageV.get(m.id), m.toPool !== undefined ? poolV[m.toPool] : at(m.to), 'message');
  }
  const aside = (pool, laneKey) => (pool ?? '-') + '|' + (laneKey ? laneIndex.get(laneKey) : '-');
  for (const d of model.data) dataV.set(d.id, vertex('data:' + d.kind + '|' + aside(d.pool, d.lane)));
  for (const n of model.notes) noteV.set(n.id, vertex('note|' + aside(n.pool, n.lone ? n.lane : null)));
  const partner = { node: id => nodeV.get(id), boundary: id => boundaryV.get(id), flow: id => flowV.get(id), message: id => messageV.get(id), pool: id => poolV[poolOf.get(id)], data: id => dataV.get(id) };
  for (const a of model.associations){
    const other = partner[a.kind](a.partner), note = noteV.get(a.note);
    if (a.toNote) edge(other, note, 'association');
    else edge(note, other, 'association');
  }
  for (const d of model.dataAssociations){
    if (d.dir === 'in') edge(dataV.get(d.ref), at(d.node), 'data');
    else edge(at(d.node), dataV.get(d.ref), 'data');
  }
  return { labels, adjacent, pools };
}

// The rounds of the Weisfeiler-Lehman pass: the first labels, then each
// vertex's label anew from its own and its neighbours', until the number of
// labels no longer grows, and at least up to the last round of the features.
function rounds(graph){
  const out = [graph.labels];
  const distinct = list => new Set(list).size;
  for (;;){
    const last = out[out.length - 1];
    const next = last.map((label, v) => sha256(label + '(' + graph.adjacent[v].map(([e, u]) => e + last[u]).sort(byText).join(',') + ')').slice(0, 16));
    const grew = distinct(next) > distinct(last);
    if (!grew && out.length > FEATURE_ROUNDS) break;
    out.push(next);
  }
  return out;
}

// The shape of xml: { hash, short, features }, features the count of each
// label of rounds 0 to 3 ("<round>:<label>"); null where it is no BPMN
// definitions or readProcess() finds nothing to lay out.
export function shapeOf(xml){
  const doc = definitions(xml);
  if (!doc) return null;
  let read;
  try { read = readProcess(doc); } catch { return null; }
  if (!read) return null;
  const graph = graphOf(read.model);
  const all = rounds(graph);
  const features = Object.create(null);
  all.slice(0, FEATURE_ROUNDS + 1).forEach((list, r) => { for (const label of list) features[r + ':' + label] = (features[r + ':' + label] || 0) + 1; });
  const hash = sha256(JSON.stringify({ pools: graph.pools, rounds: all.map(list => [...list].sort(byText)) }));
  return { ...fingerprint(hash), features };
}

// The similarity of two shapes, 0 to 1: the weighted Jaccard index of their
// features. 1 for the same features; two shapes without any are alike. A
// shape may stand as itself, as the form of { form } (lib.mjs), or as its
// features alone.
const featuresOf = x => !x ? {} : x.features ? x.features : 'form' in x ? (x.form ? x.form.features : {}) : x;
export function similarity(a, b){
  const fa = featuresOf(a), fb = featuresOf(b);
  let min = 0, max = 0;
  for (const key of new Set([...Object.keys(fa), ...Object.keys(fb)])){
    const x = fa[key] || 0, y = fb[key] || 0;
    min += Math.min(x, y);
    max += Math.max(x, y);
  }
  return max ? min / max : 1;
}

// The k inputs nearest by shape: [{ name, similarity }], the most alike
// first, among equals by name. name is the name of an input of all, which is
// left out, or a shape of its own; all, a Map or an object of name → shape,
// where a shape may be null (left out) or stand as the form of { form }.
export function nearest(name, all, k = 3){
  const entries = all instanceof Map ? [...all] : Object.entries(all);
  const shape = x => x && x.features ? x : x && x.form ? x.form : null;
  const own = typeof name === 'string' ? shape(entries.find(([n]) => n === name)?.[1]) : shape(name);
  if (!own) return [];
  return entries
    .filter(([n, x]) => n !== name && shape(x))
    .map(([n, x]) => ({ name: n, similarity: similarity(own, shape(x)) }))
    .sort((a, b) => b.similarity - a.similarity || byText(a.name, b.name))
    .slice(0, k);
}
