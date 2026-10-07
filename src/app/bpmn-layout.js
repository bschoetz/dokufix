// --- BPMN without coordinates ------------------------------------------------
// A fenced `bpmn` block whose XML holds only the process (lanes, steps, flows)
// and no diagram part is laid out before bpmn-js draws it, in pure logic:
//
//   1. readProcess() reads the XML into its pools, each with its lanes, flow
//      nodes and sequence flows, a black box without lanes (story 2.29), the
//      events on an activity's border with their host (story 2.30), the
//      message flows between pools, and the text annotations with their
//      associations (story 2.31), or refuses with the reason
//   2. LMM (src/app/lmm.js) gives every flow node its column, from the
//      structure of the process, and kanonisch() there the model in LMM's
//      order, so that no tie of the grid follows the order of the XML
//   3. src/app/bpmn.js hands layoutGeometry() that sorted model and the
//      columns as the x of each node's middle (raw), of which only the order
//      counts, and appendDiagram() the author's model
//   4. layoutGeometry() puts the nodes on a grid: those columns, the
//      lanes, and rows within each lane. The rules R1–R18 give each node its
//      lane, row and column, a router draws every flow on the grid anew, and
//      the labels get their places, in the size bpmn-js will draw them in
//      (src/app/label-size.js, the text layout of diagram-js replicated, the
//      same in Node and in every browser); the text annotations last, each
//      beside what it comments, no node moved for it
//   5. appendDiagram() writes the result as a diagram part (BPMN-DI) into the
//      author's XML, before its closing definitions tag; a node a rule put in
//      another lane moves there in the lane set too, nothing else changes
//
// bpmn-js draws the XML from step 5 exactly as it draws XML that came with
// coordinates. Until 2026-10-07 the columns were read from the SVG of
// Mermaid, which drew the process off-screen; LMM replicates its layering
// (docs/analyse-mermaid-im-bpmn-code.md).
//
// What the layout cannot place is left out, and the rest is laid out and
// drawn (Ben, 2026-10-03): data objects and stores, groups, parent lanes of
// nested lanes, the content of a sub-process, a boundary event on what is no
// activity laid out, a message flow at a boundary event, a text annotation
// without text or without an association to something laid out, an
// association without a text annotation at one end, and every flow that
// touches one of them. readProcess() lists
// them; the page names each on the console, not in the document.
//
// Pure logic: no page, no library; the one import is the label measurer, pure
// logic itself. LMM is called by src/app/bpmn.js, not here: the grid takes
// any columns, the tests' made-up ones too. The XML comes in as a parsed
// document, from the layout's own parser (src/app/xml-parser.js), so that the
// same XML gives the same model in Node as in every browser. The reader takes
// an element by its namespace and local name, as bpmn-js does: a task of
// another namespace (signavio:task) is no task, and definitions of another
// namespace are no BPMN.
// tests/bpmn-layout.test.mjs runs all of it in Node.
//
// The grid, its rules and its router come from spike 2.26 (variant A2, Ben,
// 2026-10-06); src/README.md, Diagrams, describes them.

import { measureLabel } from './label-size.js';

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
// LABEL_CLEARANCE   a piece of a flow that ran through a foreign flow's label
//                   keeps this far from it once moved aside (finishLabelsAndFrame())
const ATTACH_CLEARANCE = 12, RING_CLEARANCE = 12, FRAME_MARGIN = 12, LABEL_GAP = 4, LABEL_CLEARANCE = 12;
// They stand among the module's first declarations: esbuild writes such a
// constant's value in place of its name only before the first declaration
// that is no such constant, and so the built page carries no names for them.

// The reasons a laid-out diagram is refused, the detail of the BPMN warning.
export const LAYOUT_NOTHING = 'Das BPMN-XML enthält kein Element, das sich anordnen lässt.';
export function layoutStrayText(ids){
  return 'Diese Elemente liegen in keiner Bahn: ' + ids.join(', ') + '.';
}

// The local name of an element of BPMN's namespace, whatever its prefix:
// "laneSet" for <bpmn:laneSet>, <bpmn2:laneSet> or <laneSet> in the default
// namespace; '' for an element of another namespace.
const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
const local = el => (el.namespaceURI === BPMN_NS ? el.localName : '');
const kids = el => Array.from(el.children || []);
const attr = (el, name) => (el && el.getAttribute(name)) || '';
// Every element below el, in document order; with a stack, not by recursion, so
// that a document deeper than the call stack is read as the parser reads it.
function descendants(el){
  const out = [], stack = kids(el).reverse();
  while (stack.length){
    const k = stack.pop();
    out.push(k);
    for (let i = k.children.length - 1; i >= 0; i--) stack.push(k.children[i]);
  }
  return out;
}
const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
// The text bpmn-js draws for a name with line breaks ("&#10;"; a literal line break in an attribute is a blank by
// then, xml-parser.js): the name as the author wrote it, which the labels are measured in (Ben, 2026-10-07,
// nz19-pool1: "verzögertes &#10;Ergebnis&#10;erhalten", three lines drawn, measured as two, lay on its event); the
// name itself stays clean for the order (LMM) and the rest. { label } where it differs, else nothing.
const labelOf = text => String(text || '').includes('\n') ? { label: String(text) } : {};
// The text a label of x is measured in.
const textOf = x => x.label ?? x.name;

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
// What a process or a collaboration may hold that the layout leaves out. A text annotation and an association are
// read since story 2.31 (NOTED), and left out only inside a sub-process.
const LEFT_OUT = new Set(['textAnnotation', 'dataObject', 'dataObjectReference', 'dataStoreReference', 'association', 'group', 'messageFlow']);
const NOTED = new Set(['textAnnotation', 'association']);
// A text annotation's text: its <text> child as written, every blank and line break kept. bpmn-js draws it so: moddle
// keeps the text node verbatim, and diagram-js's layoutText() splits it at each line break and keeps empty and
// indented lines; a pretty-printed <text> is drawn a line lower and indented, and its box is measured for that
// (review of 2.31). Like moddle, it joins the text and CDATA nodes of <text> and leaves out the text nodes that are
// blanks only: <text>\n  <![CDATA[x]]>\n</text> is "x", one line, as bpmn-js draws it (spikes/lmm/parsing/BERICHT.md,
// section 3.3). A CDATA section stays whatever it holds, as in moddle: <![CDATA[\n]]> between two lines is a line
// break. Whether it has text at all is asked of it with the blanks taken off.
const noteText = el => {
  const t = kids(el).find(k => local(k) === 'text');
  return t ? Array.from(t.childNodes).filter(k => k.nodeType === 4 || (k.nodeType === 3 && k.data.trim())).map(k => k.data).join('') : '';
};
// What a flow node may hold that is drawn and left out with it.
const LEFT_OUT_INSIDE = new Set(['dataInputAssociation', 'dataOutputAssociation']);

// The pools and their processes, read from the parsed XML:
//   { model, leftOut }
//   model: { pools, plane, lanes, nodes, flows, boundaries, messages, notes, associations, insert }
//     pools: [{ id, name, box }], one per pool laid out, top to bottom in
//            the order of the participants; id null where nothing is drawn as
//            a pool: a process without a participant, a participant without
//            an id; box true for a participant without a process of its own
//            (a black box, story 2.29), which has no lanes
//     plane: the id the diagram part refers to: the collaboration, or the process
//     lanes: [{ id, name, nodes: [node ids], key, synthetic, pool }],
//            the lanes of all pools, those of one pool next to each other; a
//            synthetic lane has its row on the grid and is left out of the
//            diagram part: the one lane holding every node where the process
//            has no lanes, and a lane without an id; pool, the index of its
//            pool in pools
//     nodes: [{ id, name, type, tag, key, markers }], type one of start, end,
//            inter, gateway, task; markers, only where there are any, how many
//            markers bpmn-js draws in the middle of an activity's lower edge
//            (story 2.30)
//     flows: [{ id, from, to, name }], the sequence flows, each inside its
//            pool; from may be a boundary event
//     boundaries: [{ id, name, host, cancel }], the events on an activity's
//            border (story 2.30): host, the activity's id; cancel, whether
//            it interrupts (cancelActivity)
//     messages: [{ id, from, to, name, fromPool, toPool }], the message
//            flows between two pools laid out, each end a flow node or a
//            participant; fromPool, toPool: where an end is a participant,
//            the index of its pool
//     notes: [{ id, text, pool }], the text annotations (story 2.31): text,
//            their text as written, blanks and line breaks kept, as bpmn-js
//            draws it; pool, the index of the
//            pool of their first association's partner, null at a message flow
//     associations: [{ id, note, partner, kind, toNote }], each from a text
//            annotation to its partner: kind node, boundary, flow, message or
//            pool; toNote where the text annotation is the target
//     insert: null, or where processes have no collaboration (Ben,
//            2026-10-06: drawn as pools) the collaboration appendDiagram()
//            inserts: { id, participants: [{ id, name, process }] }
//     key:   an id of the layout's own for it (n1…, l1…), by which the
//            columns are given (raw, src/app/lmm.js) and the grid keeps its
//            lanes
//   leftOut: [{ id, tag, reason }]; reason says why, in English, for the
//            console. First what the collaboration holds, in its order (a
//            message flow, a text annotation and an association keep their
//            place there, whatever is decided about them later); then the
//            processes no participant refers to (without a collaboration, the
//            processes without an id); then per participant, in their order,
//            what its process holds: its children in the order of the XML,
//            then its boundary events, its lanes and its sequence flows; then,
//            with nothing to lay out, the participants without an id and the
//            processes without a collaboration; last the participants with a
//            process but without an id
// null when the document is no BPMN definitions: bpmn-js has its own message
// for that. Throws with the reason where nothing can be laid out, or a node
// stands in no lane although its process has lanes. A pool without a process
// of its own beside pools with one is a black box (story 2.29); black boxes
// alone end in "nothing to place".
export function readProcess(doc){
  const root = doc && doc.documentElement;
  if (!root || local(root) !== 'definitions') return null;
  const all = descendants(root);
  const participants = all.filter(el => local(el) === 'participant');
  const processes = kids(root).filter(el => local(el) === 'process');
  const leftOut = [];
  const leave = (el, reason) => leftOut.push({ id: attr(el, 'id'), tag: local(el), reason });
  const collaboration = participants.length ? participants[0].parentElement : null;
  // The text annotations and associations of the collaboration and of each process, read once the pools are (story 2.31).
  const noted = [];
  const noteSlot = el => { const slot = { id: attr(el, 'id'), tag: local(el), reason: null }; leftOut.push(slot); noted.push({ el, slot }); };
  // A message flow keeps its place in the list; whether it is left out is known once the pools are read.
  const slots = new Map();
  if (collaboration) for (const el of kids(collaboration)){
    if (local(el) === 'messageFlow'){ slots.set(el, { id: attr(el, 'id'), tag: 'messageFlow', reason: null }); leftOut.push(slots.get(el)); }
    else if (NOTED.has(local(el))) noteSlot(el);
    else if (LEFT_OUT.has(local(el))) leave(el, 'not laid out');
  }

  // Each participant with its process, or, without a collaboration, each process.
  // By id, the first of an id: looked up once per participant, not searched, so
  // that many pools stay linear (security review of 2026-10-07).
  const processById = new Map();
  for (const p of processes) if (attr(p, 'id') && !processById.has(attr(p, 'id'))) processById.set(attr(p, 'id'), p);
  const procOf = pa => processById.get(attr(pa, 'processRef')) || null;
  // Without a collaboration a process without an id can be referred to by no participant: it is left out.
  const candidates = participants.length ? participants.map(pa => ({ participant: pa, proc: procOf(pa) }))
    : processes.filter(proc => attr(proc, 'id') || (leave(proc, 'has no id'), false)).map(proc => ({ participant: null, proc }));
  const referred = new Set(candidates.map(c => c.proc));
  if (participants.length) for (const p of processes) if (!referred.has(p)) leave(p, 'no participant refers to it');

  const nodes = [], lanes = [], flows = [], pools = [], boundaries = [];
  const byId = new Map(), poolOfNode = new Map();
  const blackBoxes = [];
  for (const { participant, proc } of candidates){
    const own = readPool(proc, participant, nodes, lanes, leave, noteSlot);
    // A participant without a process of its own (a black box) is a pool without lanes (story 2.29).
    if (!own && participant && attr(participant, 'id')){ pools.push({ id: attr(participant, 'id'), name: clean(attr(participant, 'name')), el: participant, proc, box: true }); continue; }
    if (!own){ blackBoxes.push({ participant, proc }); continue; }
    const index = pools.length;
    for (const l of own.lanes){ l.pool = index; lanes.push(l); }
    for (const n of own.nodes){ byId.set(n.id, n); poolOfNode.set(n.id, index); }
    flows.push(...own.flows);
    boundaries.push(...own.boundaries);
    pools.push({ id: participant && attr(participant, 'id') ? attr(participant, 'id') : null, name: participant ? clean(attr(participant, 'name')) : '', el: participant, proc, standIn: own.standIn });
  }
  if (!pools.some(p => !p.box)) throw new Error(LAYOUT_NOTHING);
  for (const { participant, proc } of blackBoxes){
    if (participant) leave(participant, 'has no id; it is not drawn as a pool');
    else leave(proc, 'a process with nothing to lay out');
  }

  // Where processes have no collaboration, one is inserted with a participant per process.
  let insert = null;
  if (!participants.length && pools.length > 1){
    const used = new Set(all.map(el => attr(el, 'id')).filter(Boolean));
    used.add(attr(root, 'id'));
    const fresh = base => { let id = base, n = 2; while (used.has(id)) id = base + '_' + n++; used.add(id); return id; };
    insert = { id: fresh('dokufix_zusammenarbeit'), participants: [] };
    pools.forEach((p, i) => {
      p.id = fresh('dokufix_pool_' + (i + 1));
      p.name = clean(attr(p.proc, 'name'));
      insert.participants.push({ id: p.id, name: p.name, process: attr(p.proc, 'id') });
    });
    // The one lane of a process without lanes is named as its pool, as a participant's would be.
    for (const p of pools) if (p.standIn) p.standIn.name = p.name;
  }
  const plane = insert ? insert.id : collaboration ? attr(collaboration, 'id') : attr(pools[0].proc, 'id');
  if (!plane) throw new Error(LAYOUT_NOTHING);

  // Message flows between two pools laid out, each end a flow node or a pool's frame (story 2.29); the rest is
  // left out.
  const messages = [];
  const poolIndex = new Map(pools.map((p, i) => [p.id, i]).filter(([id]) => id));
  const end = id => byId.has(id) ? { pool: poolOfNode.get(id) } : poolIndex.has(id) ? { pool: poolIndex.get(id), frame: true } : null;
  for (const [el, slot] of slots){
    const from = attr(el, 'sourceRef'), to = attr(el, 'targetRef'), a = end(from), b = end(to);
    if (!attr(el, 'id')) slot.reason = 'has no id';
    // A message flow at a boundary event is left out (story 2.30: not yet laid out).
    else if (boundaries.some(x => x.id === from || x.id === to)) slot.reason = 'at a boundary event, which takes no message flow yet';
    else if (!a || !b) slot.reason = 'touches ' + [...new Set([from, to].filter(id => !end(id)))].join(' and ') + ', which is not laid out';
    else if (a.pool === b.pool) slot.reason = 'a message flow within one pool';
    else messages.push({ id: attr(el, 'id'), from, to, name: clean(attr(el, 'name')), ...labelOf(attr(el, 'name')), ...(a.frame ? { fromPool: a.pool } : {}), ...(b.frame ? { toPool: b.pool } : {}) });
  }
  const { notes, associations } = readNotes(noted, { pools, byId, poolOfNode, boundaries, flows, messages });
  for (let i = leftOut.length - 1; i >= 0; i--) if (leftOut[i].reason === null) leftOut.splice(i, 1);
  // A participant without an id gets no pool shape.
  for (const p of pools) if (p.el && !attr(p.el, 'id')) leave(p.el, 'has no id; it is not drawn as a pool');
  return { model: { pools: pools.map(p => p.box ? { id: p.id, name: p.name, box: true } : { id: p.id, name: p.name }), plane, lanes, nodes, flows, boundaries, messages, notes, associations, insert }, leftOut };
}

// The text annotations and their associations (story 2.31): noted, [{ el, slot }] in the order of the XML, slot its
// entry in leftOut, whose reason stays null where it is laid out. A text annotation's pool is that of the partner of its
// first association (a message flow: none). An association with a text annotation at one end and at the other a flow node, a
// boundary event, a sequence or message flow, or a pool laid out is kept; the rest is left out. A text annotation
// without text, or without an association kept, is left out (Ben, 2026-10-06).
function readNotes(noted, { pools, byId, poolOfNode, boundaries, flows, messages }){
  const notes = [], associations = [];
  const poolIndex = new Map(pools.map((p, i) => [p.id, i]).filter(([id]) => id));
  const boundaryOf = new Map(boundaries.map(b => [b.id, b]));
  const flowOf = new Map(flows.map(f => [f.id, f])), messageOf = new Map(messages.map(m => [m.id, m]));
  const texts = new Map(), empty = new Set();
  for (const { el, slot } of noted) if (local(el) === 'textAnnotation'){
    if (!attr(el, 'id')) slot.reason = 'has no id';
    // A text annotation without text is no comment (Ben, 2026-10-06, nz13-rg1: Signavio's IT-system markers).
    else if (!clean(noteText(el))){ slot.reason = 'has no text'; empty.add(attr(el, 'id')); }
    else texts.set(attr(el, 'id'), { el, slot });
  }
  // The other end: its kind and the pool it lies in (a message flow in none).
  const partnerOf = id => byId.has(id) ? { kind: 'node', pool: poolOfNode.get(id) }
    : boundaryOf.has(id) ? { kind: 'boundary', pool: poolOfNode.get(boundaryOf.get(id).host) }
    : flowOf.has(id) ? { kind: 'flow', pool: poolOfNode.get(flowOf.get(id).to) }
    : messageOf.has(id) ? { kind: 'message', pool: null }
    : poolIndex.has(id) ? { kind: 'pool', pool: poolIndex.get(id) } : null;
  const linked = new Map();
  for (const { el, slot } of noted){
    if (local(el) !== 'association') continue;
    const id = attr(el, 'id'), from = attr(el, 'sourceRef'), to = attr(el, 'targetRef');
    const note = texts.has(from) && !texts.has(to) ? from : texts.has(to) && !texts.has(from) ? to : null;
    const other = note === from ? to : from, partner = note && partnerOf(other);
    if (!id) slot.reason = 'has no id';
    else if (!note && (empty.has(from) || empty.has(to))) slot.reason = 'its text annotation ' + (empty.has(from) ? from : to) + ' has no text';
    else if (!note) slot.reason = texts.has(from) ? 'between two text annotations' : 'has no text annotation at either end';
    else if (!partner) slot.reason = 'touches ' + (other || 'nothing') + ', which is not laid out';
    else {
      associations.push({ id, note, partner: other, kind: partner.kind, ...(note === to ? { toNote: true } : {}) });
      if (!linked.has(note)) linked.set(note, partner.pool);
    }
  }
  for (const [id, { el, slot }] of texts){
    if (!linked.has(id)) slot.reason = 'has no association to anything laid out';
    else notes.push({ id, text: noteText(el), pool: linked.get(id) });
  }
  return { notes, associations };
}

// The flow nodes, lanes and sequence flows of one pool's process, keyed on
// from the nodes and lanes of the pools before it, and standIn, the one lane
// of a process without lanes, or null; null for a pool with nothing to place. Throws where a node stands in no lane although the
// process has lanes.
function readPool(proc, participant, before, beforeLanes, leave, note){
  if (!proc) return null;
  const nodes = [];
  for (const el of kids(proc)){
    const tag = local(el), type = nodeType(tag), id = attr(el, 'id');
    if (type && id){
      // markers: how many markers bpmn-js draws in the middle of an activity's lower edge (story 2.30): a sub-process's
      // "+", a loop or multi-instance marker, an ad-hoc sub-process's "~", a compensation marker.
      const markers = type !== 'task' ? 0 : (HOLDS_CONTENT.has(tag) || tag === 'callActivity' ? 1 : 0) + (tag === 'adHocSubProcess' ? 1 : 0) + (attr(el, 'isForCompensation') === 'true' ? 1 : 0) +
        (kids(el).some(k => ['standardLoopCharacteristics', 'multiInstanceLoopCharacteristics'].includes(local(k))) ? 1 : 0);
      nodes.push({ id, name: clean(attr(el, 'name')), ...labelOf(attr(el, 'name')), type, tag, key: 'n' + (before.length + nodes.length + 1), ...(markers ? { markers } : {}) });
      // A sub-process is drawn as one symbol; what it holds is left out.
      if (HOLDS_CONTENT.has(tag)){
        for (const inner of descendants(el)) if (attr(inner, 'id') && (nodeType(local(inner)) || LEFT_OUT.has(local(inner)) || ['sequenceFlow', 'boundaryEvent'].includes(local(inner)))) leave(inner, 'inside the sub-process ' + id);
      }
      for (const inner of descendants(el)) if (LEFT_OUT_INSIDE.has(local(inner))) leave(inner, 'not laid out');
    } else if (type) leave(el, 'has no id');
    else if (NOTED.has(tag)) note(el);
    else if (LEFT_OUT.has(tag)) leave(el, 'not laid out');
  }
  if (!nodes.length){
    // A boundary event of a process with nothing to lay out has no host laid out (review of 2.30, R5).
    for (const el of kids(proc)) if (local(el) === 'boundaryEvent') leave(el, attr(el, 'id') ? 'attached to ' + (attr(el, 'attachedToRef') || 'nothing') + ', which is not laid out' : 'has no id');
    return null;
  }
  before.push(...nodes);
  const byId = new Map(nodes.map(n => [n.id, n]));
  // Events on an activity's border (story 2.30): each with its host and whether it interrupts; one whose host is no
  // activity laid out here is left out.
  const boundaries = [];
  for (const el of kids(proc)){
    if (local(el) !== 'boundaryEvent') continue;
    const id = attr(el, 'id'), host = attr(el, 'attachedToRef');
    if (!id) leave(el, 'has no id');
    else if (!byId.has(host) || byId.get(host).type !== 'task') leave(el, 'attached to ' + (host || 'nothing') + ', which is not laid out');
    else boundaries.push({ id, name: clean(attr(el, 'name')), ...labelOf(attr(el, 'name')), host, cancel: attr(el, 'cancelActivity') !== 'false' });
  }
  const boundaryIds = new Set(boundaries.map(b => b.id));

  // The lanes, nested ones included; only those without lanes inside are laid
  // out, each node in the first that names it. A node only an outer lane
  // names stands in that lane's first inner one. A lane without an id keeps
  // its row and is not drawn.
  const allLanes = kids(proc).filter(el => local(el) === 'laneSet').flatMap(set => descendants(set).filter(el => local(el) === 'lane'));
  const placed = new Set();
  const lanes = [], laneOf = new Map();
  const key = () => 'l' + (beforeLanes.length + lanes.length + 1);
  const refsOf = el => kids(el).filter(k => local(k) === 'flowNodeRef').map(k => k.textContent.trim()).filter(id => byId.has(id) && !placed.has(id));
  const outer = el => descendants(el).some(inner => local(inner) === 'lane');
  for (const el of allLanes){
    if (outer(el)){ leave(el, 'a lane with lanes inside'); continue; }
    const refs = refsOf(el);
    refs.forEach(id => placed.add(id));
    if (!attr(el, 'id')) leave(el, 'has no id; its row is laid out, the lane is not drawn');
    const lane = { id: attr(el, 'id'), name: clean(attr(el, 'name')), nodes: refs, key: key(), synthetic: !attr(el, 'id') };
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
  let standIn = null;
  if (lanes.length){
    const stray = nodes.filter(n => !placed.has(n.id));
    if (stray.length) throw new Error(layoutStrayText(stray.map(n => n.id)));
  } else lanes.push(standIn = { id: '', name: participant ? clean(attr(participant, 'name')) : '', nodes: nodes.map(n => n.id), key: key(), synthetic: true });

  const flows = [];
  for (const el of kids(proc)){
    if (local(el) !== 'sequenceFlow') continue;
    const from = attr(el, 'sourceRef'), to = attr(el, 'targetRef');
    // A flow from a node to itself is left out: the router has no way for it yet.
    if (from === to && byId.has(from) && attr(el, 'id')) leave(el, 'a flow from a node to itself');
    // A flow leaves a boundary event and never enters one.
    else if ((byId.has(from) || boundaryIds.has(from)) && byId.has(to) && attr(el, 'id')) flows.push({ id: attr(el, 'id'), from, to, name: clean(attr(el, 'name')), ...labelOf(attr(el, 'name')) });
    else leave(el, !attr(el, 'id') ? 'has no id' : boundaryIds.has(to) ? 'enters the boundary event ' + to : 'touches ' + [...new Set([from, to].filter(id => !byId.has(id) && !boundaryIds.has(id)))].join(' and ') + ', which is not laid out');
  }
  return { nodes, lanes, flows, boundaries, standIn };
}

// One line per left-out element for the console.
export function leftOutLine(item){
  return item.tag + ' ' + (item.id || '(no id)') + ': ' + item.reason;
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

// The box of an event's or a gateway's label in the diagram part is as wide
// as bpmn-js lays a label out, 90 px; bpmn-js centres the text in it.
const LABEL_WIDTH = 90;
// The widths a text annotation may take, the narrowest first (story 2.31).
export const NOTE_WIDTHS = [100, 150, 200, 250];

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
// measureLabel() gives, or the size given; bpmn-js centres the text on
// x + w/2, starts it at y and wraps it at 90 px.
export function flowLabelPlaces(pts, text, atGateway, size = measureLabel(text), loop = false){
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
export function flowLabel(pts, text, atGateway, avoid = [], size = measureLabel(text), loop = false){
  return bestPlace(flowLabelPlaces(pts, text, atGateway, size, loop), avoid);
}

// The places a label of an event or a gateway may take, in the order they
// are tried; c: the symbol, size: measureLabel(). Below, above, right, left
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

// ---------- text annotations (story 2.31) ----------
// A text annotation keeps NOTE_GAP from its partner, room for its association that the eye can follow (Ben,
// 2026-10-06, nz02-fluss: "Zeile muss höher sein, damit genug platz ist für die Verbindung"; bpmn-js keeps 50 too).
const NOTE_GAP = 50;
// What a text annotation keeps off symbols, flows, labels and other text annotations.
const NOTE_CLEAR = 6;
// The sides in the order they are tried: right of the partner first (Ben, 2026-10-06,
// nz03-pool, nz06-hund2: "Kommentare rechts vom Ziel …; in manchen Diagrammen geht es einfach nicht, dann ist es schon
// ok, wenn der Kommentar links vom Ziel steht").
const NOTE_SIDES = ['right', 'upRight', 'downRight', 'up', 'down', 'upLeft', 'downLeft', 'left'];
// How much further out each round of places lies than the first (Ben, 2026-10-06, nz20-ohne1: "Hätte näher an den
// Knoten gepasst"; his notes 75 to 150 px from their partners): all sides near, then all a little further.
export const NOTE_ROUNDS = [0, 25, 50, 100];

// The size of a text annotation: the narrowest of NOTE_WIDTHS whose text stays at most a third as high as it is wide
// (Ben, 2026-10-06, nz06-hund2: wider and flatter), else the widest. measure(text, width), as measureLabel().
export function noteSize(text, measure = measureLabel){
  for (const w of NOTE_WIDTHS){
    const s = measure(text, w);
    if (s.h <= w / 3 || w === NOTE_WIDTHS[NOTE_WIDTHS.length - 1]) return { w, h: Math.ceil(s.h) };
  }
}

// The places a text annotation of size { w, h } may take beside c ({ cx, cy, w, h }, a symbol or, w and h 0, a point
// on a flow), far px further out than the nearest, in the order of NOTE_SIDES; above and below centred first, then
// moved right and left, beside right and left level first, then moved down and up, so that the association can stand
// beside a flow's end in the middle. Each [x, y, w, h].
export function notePlaces(c, size, far = 0){
  const { w, h } = size;
  const xs = [c.cx - w / 2, c.cx + 10, c.cx - 10 - w, c.cx - w + 20, c.cx - 20], ys = [c.cy - h / 2, c.cy + 10, c.cy - 10 - h];
  const d = NOTE_GAP / 2 + far;
  const at = side => ({
    up: xs.map(x => [x, c.cy - c.h / 2 - NOTE_GAP - far - h]),
    upRight: [[c.cx + c.w / 2 + d, c.cy - c.h / 2 - d - h]],
    downRight: [[c.cx + c.w / 2 + d, c.cy + c.h / 2 + d]],
    down: xs.map(x => [x, c.cy + c.h / 2 + NOTE_GAP + far]),
    upLeft: [[c.cx - c.w / 2 - d - w, c.cy - c.h / 2 - d - h]],
    downLeft: [[c.cx - c.w / 2 - d - w, c.cy + c.h / 2 + d]],
    right: ys.map(y => [c.cx + c.w / 2 + NOTE_GAP + far, y]),
    left: ys.map(y => [c.cx - c.w / 2 - NOTE_GAP - far - w, y]),
  })[side];
  return NOTE_SIDES.flatMap(side => at(side).map(p => [...p.map(R), w, h]));
}

// The shape of an association's partner: { kind: 'rect' | 'circle' | 'diamond' | 'point', cx, cy, w, h }.
// The point where a line from inside the shape's middle towards (x, y) leaves it.
function outline(s, x, y){
  const dx = x - s.cx, dy = y - s.cy;
  if (s.kind === 'point' || (!dx && !dy)) return { x: s.cx, y: s.cy };
  const t = s.kind === 'circle' ? (s.w / 2) / Math.hypot(dx, dy)
    : s.kind === 'diamond' ? 1 / (Math.abs(dx) / (s.w / 2) + Math.abs(dy) / (s.h / 2))
    : Math.min(dx ? (s.w / 2) / Math.abs(dx) : Infinity, dy ? (s.h / 2) / Math.abs(dy) : Infinity);
  return { x: s.cx + dx * t, y: s.cy + dy * t };
}
// Where a vertical line at x meets the shape's edge on the side dir (−1 its top, 1 its bottom); a horizontal one at
// y when across.
function edgeAt(s, v, dir, across){
  const [c, oc, half, ohalf] = across ? [s.cy, s.cx, s.h / 2, s.w / 2] : [s.cx, s.cy, s.w / 2, s.h / 2];
  const d = Math.abs(v - c);
  const reach = s.kind === 'point' ? 0 : s.kind === 'circle' ? Math.sqrt(Math.max(0, half * half - d * d))
    : s.kind === 'diamond' ? Math.max(0, ohalf * (1 - d / half)) : ohalf;
  return oc + dir * reach;
}

// The waypoints of an association from a text annotation's box n ([x, y, w, h]) to its partner's shape s. A box
// right of the partner: from the middle of its bracket, its left edge (Ben, 2026-10-06: "verbindungslinie auf die
// Bracket gerichtet"), across where the partner reaches that height, else straight to the partner's outline.
// Otherwise from the middle of the box's side facing the partner (Ben, 2026-10-06, nz05-r12: "wenn wir nicht die
// Bracket verbinden können, dann den Text möglichst mittig mit der Linie ansteuern") to the partner's nearest point:
// on a task's facing side ATTACH_CLEARANCE from its corners where the side allows, on an event's or a gateway's
// outline towards that middle. [[x, y], …].
export function associationWay(n, s){
  const [x, y, w, h] = n, mx = x + w / 2, my = y + h / 2;
  const sx1 = s.cx - s.w / 2, sx2 = s.cx + s.w / 2, sy1 = s.cy - s.h / 2, sy2 = s.cy + s.h / 2;
  if (x >= sx2 + 1){
    // The height rounded first, the end towards the partner's middle, so that it lies on the outline, not beside it.
    if (my >= sy1 && my <= sy2){ const v = R(my); return [[R(x), v], [Math.floor(edgeAt(s, v, 1, true)), v]]; }
    const b = outline(s, x, my);
    return [[x, my], [b.x, b.y]].map(p => p.map(R));
  }
  // The side of the box facing the partner: above or below it where they overlap across, else beside it.
  const across = Math.min(x + w, sx2) - Math.max(x, sx1) > 0 || !(Math.min(y + h, sy2) - Math.max(y, sy1) > 0) && Math.abs(my - s.cy) - h / 2 >= Math.abs(mx - s.cx) - w / 2;
  const a = across ? { x: mx, y: my < s.cy ? y + h : y } : { x: mx < s.cx ? x + w : x, y: my };
  const clamp = (v, lo, hi) => lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
  const b = s.kind === 'rect'
    ? (across ? { x: clamp(a.x, sx1 + ATTACH_CLEARANCE, sx2 - ATTACH_CLEARANCE), y: my < s.cy ? sy1 : sy2 } : { x: mx < s.cx ? sx1 : sx2, y: clamp(a.y, sy1 + ATTACH_CLEARANCE, sy2 - ATTACH_CLEARANCE) })
    : outline(s, a.x, a.y);
  return [[a.x, a.y], [b.x, b.y]].map(p => p.map(R));
}

// Whether a way [[x, y], …] comes within 2 px of a piece of a flow (segmentBox(): [x, y, w, h], one of w, h 0).
export function wayTouches(way, segs){
  return wayHits(way, segs.map(([x, y, w, h]) => [x - 3, y - 3, w + 6, h + 6]));
}
// Whether a way runs along a piece of a flow: a horizontal or vertical piece of it within 3 px of one of the flow's
// on more than 4 px. Crossing a flow is no running along (Ben, 2026-10-06: his associations cross flows).
export function wayAlong(way, segs){
  for (let i = 1; i < way.length; i++){
    const [x1, y1] = way[i - 1], [x2, y2] = way[i];
    const level = Math.abs(y1 - y2) < 1, upright = Math.abs(x1 - x2) < 1;
    if (!level && !upright) continue;
    for (const [sx, sy, sw, sh] of segs){
      if (level && sh === 0 && Math.abs(sy - y1) <= 3 && Math.min(Math.max(x1, x2), sx + sw) - Math.max(Math.min(x1, x2), sx) > 4) return true;
      if (upright && sw === 0 && Math.abs(sx - x1) <= 3 && Math.min(Math.max(y1, y2), sy + sh) - Math.max(Math.min(y1, y2), sy) > 4) return true;
    }
  }
  return false;
}
// Whether a way [[x, y], …] passes through one of the boxes [x, y, w, h] (1 px in from their edges).
export function wayHits(way, boxes){
  for (let i = 1; i < way.length; i++){
    const [x1, y1] = way[i - 1], [x2, y2] = way[i], n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3));
    for (let k = 0; k <= n; k++){
      const px = x1 + (x2 - x1) * k / n, py = y1 + (y2 - y1) * k / n;
      if (boxes.some(b => px > b[0] + 1 && px < b[0] + b[2] - 1 && py > b[1] + 1 && py < b[1] + b[3] - 1)) return true;
    }
  }
  return false;
}

// The diagram part's coordinates: the nodes on the grid, the flows routed on
// it, the labels placed.
// raw: the columns, as the x of each node's middle in units of their own;
// read is only
//   nodes: { key: { cx, … } }   nodes less than a unit apart share a column,
//                               and the columns keep the order of the x: in
//                               the page LMM's ranks (lmmPositions() of
//                               src/app/lmm.js), in a test any made up
// Returns { pool, lanes, nodes, labels, flows, flowLabels, laneOf }: the
// pool's box or null, and per element id its box [x, y, w, h], its label box,
// or the waypoints of a flow [[x, y], …]; laneOf: per node the id of the lane
// it stands in on the grid, which a rule may have changed (R1, R12), for
// nodes in a lane with an id. Throws where raw lacks a node of the model,
// which LMM never does.
// measure: the size { w, h } a label's text takes as bpmn-js draws it, and
// with a width a text annotation's: measureLabel() (src/app/label-size.js),
// in the page as in Node; a test may give another.
// options: which of the rules R1–R18 apply, keyed as in DEFAULT_RULES; a key
// left out keeps its default, so { startAlign: false } leaves out R15 in this
// call only. R7 and the router's second pass always apply.
// An object keyed by the author's ids, without a prototype: an id such as
// "constructor", "toString" or "__proto__" is a key like any other, not a
// property every object has (security review of 2026-10-07: such an id gave
// x="undefined" in the diagram part).
const byId = () => Object.create(null);

// options: the rules (DEFAULT_RULES), each on unless set false; and runs, an
// object the call fills with how often finishGrid() ran, per rule whose trials
// ran it ("R10" …) and "final" for the picture returned: for the layout tools
// (tools/bpmn-layout/lauf.mjs), no effect on the picture. rowOrder: true
// decides R10 by counting instead of trying (ruleRowOrder()), an experiment of
// the ordering phase (docs/konzept-ordnungsphase.md), off unless set; it is no
// rule of DEFAULT_RULES, so that every picture stays as it was without it.
export function layoutGeometry(model, raw, measure = measureLabel, options = DEFAULT_RULES){
  const rules = Object.fromEntries(Object.keys(DEFAULT_RULES).map(k => [k, options[k] ?? DEFAULT_RULES[k]]));
  rules.runs = options.runs || null;
  rules.rowOrder = options.rowOrder === true;
  // Each text measured once per width (none for a label): every trial of the rules lays the labels out again, and
  // each measure lays the text out anew, a text annotation in up to four widths (review of 2.31).
  const sizes = new Map();
  const once = (text, width) => {
    const key = (width ?? '') + ':' + text;
    if (!sizes.has(key)) sizes.set(key, measure(text, width));
    return sizes.get(key);
  };
  return layoutGrid(model, raw, once, rules);
}

// ---------- the grid: the columns, rows in each lane, routes in channels ----------
// raw gives the order of the columns, the model each node's lane; the rules give
// nodes rows above and below the backbone of their lane and gateways the lane
// of their predecessor; a router draws every flow on the grid (cells, the
// channels between rows, the gaps between columns). The rules that can be left
// out, all on by default; frozen, since every call starts from it. Marked
// pure, so that no bundle that leaves it unused keeps the call (the reader
// bundle reaches this module through src/app/diagrams.js). Keyed in the order
// of the rules' numbers; layoutGrid() gives the order they run in.
export const DEFAULT_RULES = /* @__PURE__ */ Object.freeze({
  gatewayLane: true,  // R1  a gateway or end event stands in the lane of its nearest predecessor, a merge of several lanes in that of its next step; a parallel join in that of its split; a parallel split whose arms begin in three or more lanes in the middle one
  pathRows: true,     // R2  two ways of a decision that go on in one lane get rows of their own
  loopAbove: true,    // R3  the steps of a loop stand in the row above their gateway, from there to the left
  branchBelow: true,  // R4  a step that leaves the lane while another way stays in the row stands in the gateway's column, on the side of its target lane
  fan: true,          // R5  fan: the arms of a parallel block in other lanes take the row nearest the split; they leave the split and enter the join vertically, only the nearest arm horizontally by the east and west ports when none lies in the gateways' row
  jumpAbove: true,    // R6  the one step between the exit of a loop and a merge stands in the merge's column
  block: true,        // R8  a parallel block is as wide as the room between its gateways: every element of an arm stands between split and join, no foreign node inside, foreign flows around it where they can; the node before and the node after never in the column of split or join; a foreign node in the split's column moves the split right of it
  firstColumn: true,  // R9  (spike 2.26, Ben) the first shapes of the arms of a parallel gateway are centred on one x, one above the other
  rowProbe: true,     // R10 row trial: with crossings, each row R2 gives a way is tried on the other side; taken only with strictly fewer crossings
  endAlign: true,     // R11 ends aligned: an end event in the last column where its row is free up to it and the picture gets no worse; a soft recommendation
  crossProbe: true,   // R12 crossing trial: a way after an exclusive decision in an extra row, a merge in another lane; only with strictly fewer crossings
  stepAside: true,    // R13 a successor in its predecessor's column, which the flow reaches with three or more bends, tried a column further; so is the nearer of two siblings on one side of a split
  combProbe: true,    // R14 comb: for an exclusive split with three or more ways, the heads in different rows tried in one column (R9 as a trial)
  startAlign: true,   // R15 start events in the first column, each in a row of its own, spread around their successor
  stagger: true,      // R16 two gateways above each other in one column: one tried a column further
  boundaryBelow: true, // R17 the way after a boundary event stands in a row below its host, in another lane in a row facing it (story 2.30)
  handOver: true,     // R18 the one step of a decision's way in another lane or row tried in the gateway's column, the nodes of another flow between moved a column (Ben, 2026-10-07, x-wv6)
  messageSide: true,  // R19 an end where ways from several rows meet and that sends a message stands in the row of the way on the side of the message's other end (Ben, 2026-10-07, nz18-fluss2)
});


// The grid's measures.
const GAP_BASE = 48;        // a gap between columns without tracks
const CHANNEL_BASE = 44;    // a channel between two rows without tracks
const EDGE_BASE = 32;       // the channel at the edge of a lane without tracks
const TRACK = 16;           // the distance of two tracks in a channel
const TRACK_MARGIN = 12;    // the margin of a channel beside its outermost track
const EMPTY_ROW = 40;       // the row of an empty lane
const POOL_GAP = 40;        // the gap between two pools without tracks (story 2.12)
const BOX_H = 60;           // the height of a pool without a process of its own (story 2.29)
const GAP_TRACK = 20;       // in a gap the distance of two tracks and the margin beside the outermost (Ben, 2026-10-06: more room where message flows run)
const PORT_STEP = 30;       // the distance of two ends on one side of a task
const MARKER = 20;          // the room one marker of bpmn-js takes in the middle of an activity's lower edge (story 2.30)
const MARKERS = 56;         // the room of two or more side by side: bpmn-js puts a sub-process's loop marker 18 px left of its "+", the "~" of an ad-hoc one 10 px right
const BEND = 0.005;         // the cost of a bend in the router: half a grid step (length / 100)
const MSG_BEND = 0.5;       // the cost of a bend of a message flow: two cost as much as a crossing (Ben, 2026-10-06, p-rs1: needless bends)
const EVENT_BEND = 1;       // the cost of a bend of a flow from a boundary event: as much as a crossing (Ben, 2026-10-06, on r12, llm-antrag, sonder-bahnen: the exception path straighter)

// The grid from the model and the raw positions of its columns:
//   cells: id → { n, lane, row, col, pin }   lane index, row (a number, 0 the backbone, negative above it), column (the rank raw gives)
//   fwdOut, fwdIn: id → [flow]  forward flows (back edges by depth-first search left out); back: the set of back edge ids
function buildGrid(model, raw){
  const laneOf = new Map();
  model.lanes.forEach((l, i) => l.nodes.forEach(id => laneOf.set(id, i)));
  const xs = [];
  for (const n of model.nodes){
    const r = raw.nodes[n.key];
    // An assertion: LMM gives every node a column; only a caller's own raw can lack one.
    if (!r) throw new Error('layoutGeometry(): raw has no column for the node ' + n.id + ' (' + n.key + ')');
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
  // Per lane its pool; per node the message flows into it.
  const poolOfLane = model.lanes.map(l => l.pool ?? 0);
  const msgIn = new Map(model.nodes.map(n => [n.id, []]));
  for (const m of model.messages || []) if (m.fromPool === undefined && m.toPool === undefined) msgIn.get(m.to).push(m);
  return { cells, fwdOut, fwdIn, back, reachable, at, rowsOf, newRow, freshRow, isSplit, lanes: model.lanes.length, poolOfLane, msgIn };
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
// the role, throw and catch above all). A merge whose ways come from several
// lanes stands in the lane of the step after it (Ben, 2026-10-07, x-miwg4).
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
    // A merge whose ways come from several lanes (Ben, 2026-10-07, x-miwg4: "In Zweifelsfällen ist es besser, das
    // Merge-Gateway in die Zeile des nächsten Prozessschrittes zu packen"): one way changes lane anyway, so the merge
    // stands in the lane of the step after it. Not a parallel join, which follows its split; only where the step's
    // lane is settled (no gateway, no end).
    const outs = g.fwdOut.get(id), next = outs.length === 1 && g.cells.get(outs[0].to);
    if (c.n.type === 'gateway' && c.n.tag !== 'parallelGateway' && preds.length >= 2 && new Set(preds.map(p => g.cells.get(p.from).lane)).size >= 2
      && next && next.n.type !== 'gateway' && next.n.tag !== 'endEvent'){ c.lane = next.lane; continue; }
    // Into the lane of its ways (Ben, 2026-10-05, x-tm1 and x-rg3: gateways centred): a split whose three or more ways
    // all begin in one other lane stands in that lane; R9 puts it in the middle row of its ways. Only heads whose lane
    // is settled (no gateways, no ends); a gateway may lie in any lane, intermediate events never change theirs.
    // So does the split of an exclusive block with two ways (Ben, 2026-10-07, lizenzprozess-gemini: "deutlich
    // lesbarer, wenn man wieder in X-Gate-Gruppen layoutet"): split, arms and merge stay together in one lane, and R9
    // stacks the arms there.
    const heads = g.fwdOut.get(id).map(f => g.cells.get(f.to));
    if (c.n.type === 'gateway' && (heads.length >= 3 || (heads.length === 2 && c.n.tag !== 'parallelGateway' && exclusiveBlock(g, model, id, 2))) && heads.every(h => h.n.type !== 'gateway' && h.n.tag !== 'endEvent') && heads.every(h => h.lane === heads[0].lane) && heads[0].lane !== c.lane){
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
  // to read): a split that is no parallel gateway, with exactly two ways, both heads still in its row (none directly
  // a merge, none pinned). The ways need not run together again (Ben, 2026-10-07, lizenzprozess-gemini: "Der untere
  // ja/nein-Split sollte auch gestapelt sein").
  const pair = n => {
    if (n.type !== 'gateway' || n.tag === 'parallelGateway' || g.fwdOut.get(n.id).length !== 2) return false;
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
      // The way "ja" stays straight, "nein" goes below (Ben, 2026-10-07, lizenzprozess-gemini); else the first flow
      // stays.
      if (/^(nein|no)$/i.test((own[0].r.flow.name || '').trim()) || /^(ja|yes)$/i.test((own[1].r.flow.name || '').trim())) own.reverse();
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

// R7. Close the columns: each column is the longest way in the columns'
// order; a successor in another row may share its predecessor's column, one
// in the same row stands one further right, and the order of each row stays
// the columns'. Pinned nodes (R3, R4, R6) keep their distance to their anchor.
// Guarantee: no column without a node; the order from left to right is the
// columns'.
function ruleCompact(g, model, rules){
  // The columns' order, but no node before one of its forward predecessors.
  const byColumns = (a, b) => a.col - b.col || a.lane - b.lane || a.row - b.row;
  const waiting = [...g.cells.values()].sort(byColumns), order = [];
  const done = new Set();
  while (waiting.length){
    let i = waiting.findIndex(c => g.fwdIn.get(c.n.id).every(f => done.has(f.from)) && g.msgIn.get(c.n.id).every(m => done.has(m.from)));
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
        || (g.laneSplits?.has(c.n.id) ?? false)
        // And before an end R19 moved (nz18-fluss2): the way from the other row comes in from above or below, a
        // column to the right, not down the end's own column into the port its message needs.
        || (g.msgSide?.has(c.n.id) ?? false);
      // A boundary event's way begins a column right of its host (story 2.30).
      col = Math.max(col, pc + (sameRow || blocked || edge || f.event ? 1 : 0));
    }
    // A message flow's target stands in its source's column at the earliest (story 2.12): the flow goes down or up.
    for (const m of g.msgIn.get(c.n.id)){ const s = g.cells.get(m.from); if (isPlaced(s)) col = Math.max(col, s.col); }
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
    col = Math.max(col, g.minCol?.get(c.n.id) ?? 0, g.alignCol?.get(c.n.id) ?? 0, g.asideCol?.get(c.n.id) ?? 0, g.blockCol?.get(c.n.id) ?? 0, g.handCol?.get(c.n.id) ?? 0);
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

// R8, the split's column (Ben, 2026-10-07, ref3: "End-Event ragt in den
// Parallel-Block rein und sorgt dadurch für hässlichen Knick"): the column of a
// parallel split belongs to its block, from the split down or up to the first
// nodes of its arms, over the lanes between. A foreign node that is not pinned
// and stands there (a short exception that took the next column of the decision
// before the split) keeps its place, and the split moves a column right of it,
// its arms and join with it, as Ben laid ref3 out by hand; it leaves its group
// of R9 (the first nodes of a decision's ways), which would follow it. Sets g.blockCol,
// which R7 reads; after R7 and the box, R7 runs again after it. Returns whether
// a split moved.
function ruleBlockColumn(g, model){
  let moved = false;
  const pos = c => c.lane * 1e6 + c.row;
  for (const b of parallelBlocks(g, model)){
    // Between the split and the first nodes of its arms, where its ways leave it up or down (Ben, 2026-10-07,
    // x-wv6: reckoned to the block's farthest node, a separate flow far below the arms moved the split away).
    const ids = [b.P, b.J, ...b.inner], P = g.cells.get(b.P);
    const ps = [b.P, ...g.fwdOut.get(b.P).map(f => f.to)].map(id => pos(g.cells.get(id))), lo = Math.min(...ps), hi = Math.max(...ps);
    const inside = [...g.cells.values()].filter(c => !ids.includes(c.n.id) && !c.pin && c.col === P.col && pos(c) > lo && pos(c) < hi);
    if (!inside.length) continue;
    g.blockCol.set(b.P, Math.max(g.blockCol.get(b.P) ?? 0, P.col + 1));
    moved = true;
  }
  return moved;
}

// R18. The hand-over of a decision (Ben, 2026-10-07, x-wv6: "Versicherung
// abschließen" stood a column right of its gateway, because a gateway of
// another flow stood between them in its column, and the way "Ja" ran across
// that flow's block). A trial, after R16: where the one step of a way of a
// decision, a gateway that is no parallel one, stands in another lane or row a
// column right of the gateway, and nodes between them in the gateway's column
// keep the hand-over from going straight, those nodes are tried a column right
// (a minimum column in R7; what follows them moves along), as Ben laid x-wv6 out
// by hand. Only nodes of another flow, none the gateway reaches, none pinned
// (r19: of two ways that leave a gateway down, the other does not push the
// first away) and no start event, which R15 places (p-miwg1: a start event of
// another flow moved, and the picture got worse). Per round the best trial is
// taken where no measure of quality rises and the picture has fewer crossings,
// or as many and fewer bends; up to four rounds. After R15, before the other
// trials, which then decide on its columns (x-wv6: run last, it left the
// merges of the lowest lane in one column).
function ruleHandOver(g, model, measure, rules){
  let best = runGrid(g, model, measure, rules);
  const keys = ['crossings', 'through', 'overlaps', 'lines', 'labels', 'shared'];
  const better = (t, b) => keys.every(k => t.q[k] <= b.q[k]) && (t.q.crossings < b.q.crossings || (t.q.crossings === b.q.crossings && t.q.bends < b.q.bends));
  for (let round = 0; round < 4; round++){
    // Columns and rows of the picture the trials give, not the grid's before finishGrid().
    const col = c => best.cols.get(c), pos = c => best.at.get(c);
    let pick = null;
    for (const c of g.cells.values()){
      const ins = g.fwdIn.get(c.n.id);
      if (ins.length !== 1 || c.pin) continue;
      const p = g.cells.get(ins[0].from);
      if (p.n.type !== 'gateway' || p.n.tag === 'parallelGateway' || pos(p) === pos(c) || col(c) !== col(p) + 1) continue;
      const lo = Math.min(pos(p), pos(c)), hi = Math.max(pos(p), pos(c));
      const between = [...g.cells.values()].filter(o => o !== p && o !== c && col(o) === col(p) && pos(o) > lo && pos(o) < hi);
      if (!between.length || between.some(o => o.pin || o.n.tag === 'startEvent' || g.reachable(p.n.id).has(o.n.id))) continue;
      const was = new Map(between.map(o => [o, g.handCol.get(o.n.id)]));
      for (const o of between) g.handCol.set(o.n.id, col(p) + 1);
      const t = runGrid(g, model, measure, rules);
      if (better(t, pick ? pick.t : best)) pick = { between, to: col(p) + 1, t };
      for (const [o, w] of was) if (w === undefined) g.handCol.delete(o.n.id); else g.handCol.set(o.n.id, w);
    }
    if (!pick) break;
    for (const o of pick.between) g.handCol.set(o.n.id, pick.to);
    best = pick.t;
  }
}

// The rules on the grid, then the grid in pixels with the flows routed on it:
// the finished DI.
//
// The order of the rules, and which needs which. They share the grid g and
// some of its fields, so the order is part of the result (code review of A2,
// D4: R16 before R13 drops R16's result; R12 before R10 gives another one):
//   R1   first: gateways and ends take their lane (and g.laneSplits, read by
//        R7, the router and centreLaneSplits()); every later rule compares lanes
//   R17  after R1, so that an end on the way after a boundary event has its
//        lane; that way's nodes in the host's row take a row below it, those in
//        another lane a row facing the host's; before R2, which then sees no
//        two ways in the host's row (reads gridModel()'s flows from an event)
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
//   R19  an end that sends messages into the row of its way on their side,
//        after the rules that give the ways their rows; g.msgSide, which R7
//        reads
//   R18  a trial, after R15, whose starts it leaves in place, and before the
//        other trials, which decide on its columns; g.handCol, which R7 reads
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
  model = gridModel(model);
  const g = buildGrid(model, raw);
  g.runs = rules.runs;
  if (rules.gatewayLane) ruleGatewayLane(g, model);
  if (rules.boundaryBelow) ruleBoundaryBelow(g, model);
  if (rules.pathRows) rulePathRows(g, model);
  if (rules.loopAbove) ruleLoopAbove(g, model);
  if (rules.branchBelow) ruleBranchBelow(g, model);
  if (rules.fan) ruleFan(g, model);
  if (rules.jumpAbove) ruleJumpAbove(g, model);
  if (rules.firstColumn) ruleFirstColumn(g, model);
  if (rules.startAlign) ruleStartAlign(g, model);
  if (rules.messageSide) ruleMessageSide(g, model);
  g.handCol = new Map();
  // g.stage names the rule whose trials run finishGrid(), for the count in g.runs.
  g.stage = 'R18';
  if (rules.handOver) ruleHandOver(g, model, measure, rules);
  g.stage = 'R10';
  if (rules.rowOrder && rules.rowProbe && (g.pathRowGroups || []).length) ruleRowOrder(g, model, measure, rules);
  else if (rules.rowProbe && (g.pathRowGroups || []).length) ruleRowProbe(g, model, measure, rules);
  g.stage = 'R12';
  if (rules.crossProbe) ruleCrossProbe(g, model, measure, rules);
  g.stage = 'R14';
  if (rules.combProbe) ruleCombProbe(g, model, measure, rules);
  g.stage = 'R13';
  if (rules.stepAside) ruleStepAside(g, model, measure, rules);
  g.stage = 'R16';
  if (rules.stagger) ruleStagger(g, model, measure, rules);
  g.stage = 'R11';
  if (rules.endAlign) return ruleEndAlign(g, model, measure, rules);
  g.stage = 'final';
  return finishGrid(g, model, measure, rules);
}

// R19 (Ben, 2026-10-07, nz18-fluss2: the end where both ways of the event-based gateway met stood in the upper way's
// row; its message to the pool below left by the south port, which the lower way's flow came in by. He moved the end
// into the lower way's row: the upper way comes in from above, the south port is the message's alone). An end with
// ways in from two or more rows of its lane, whose messages all go to one side (or come from it), stands in the row of
// the way furthest on that side, where its cell there is free, and a column right of every way's last node (R7).
function ruleMessageSide(g, model){
  for (const n of model.nodes){
    if (n.type !== 'end') continue;
    const c = g.cells.get(n.id);
    if (c.pin) continue;
    const rows = g.fwdIn.get(n.id).map(f => g.cells.get(f.from)).filter(p => p.lane === c.lane).map(p => p.row);
    if (new Set(rows).size < 2) continue;
    const pool = g.poolOfLane[c.lane];
    const dirs = (model.messages || []).filter(m => m.from === n.id || m.to === n.id).map(m => {
      const out = m.from === n.id, framePool = out ? m.toPool : m.fromPool;
      if (framePool !== undefined) return Math.sign(framePool - pool);
      const o = g.cells.get(out ? m.to : m.from);
      return o ? Math.sign(o.lane - c.lane) : 0;
    });
    if (!dirs.length || dirs.some(d => d !== dirs[0]) || !dirs[0]) continue;
    const row = dirs[0] > 0 ? Math.max(...rows) : Math.min(...rows);
    if ((row - c.row) * dirs[0] <= 0) continue;
    const there = g.at(c.lane, row, c.col);
    if (there && there !== c) continue;
    c.row = row;
    (g.msgSide ||= new Set()).add(n.id);
  }
}

// The model as the grid sees it (story 2.30): a flow from a boundary event is
// one from its host, with event, the event's id; the rules look for
// predecessors and branches at the host, the router leaves the host through
// the event. Without boundary events the model itself.
function gridModel(model){
  if (!(model.boundaries || []).length) return model;
  const hostOf = new Map(model.boundaries.map(b => [b.id, b.host]));
  return { ...model, flows: model.flows.map(f => hostOf.has(f.from) ? { ...f, from: hostOf.get(f.from), event: f.from } : f) };
}

// R17 (story 2.30). The way after a boundary event stands below its host, as
// an exception path does in a modeler: the nodes of that way (reached by no
// other way of the host) in the host's lane and row take a row of their own
// below it, one per event's way; R7 puts the first a column right of the host.
// In another lane, where other nodes stand in its row too, they take a row of
// their own on the side facing the host's lane (Ben, 2026-10-06, sonder-bahnen),
// as the arms of R5 do. After R1, so that an end has its lane; before R2, which
// then sees no two ways in one row.
// The ways of a host's boundary events: per flow from an event, the nodes it
// reaches that no flow from the host itself reaches, each with the first event
// way that reaches it (Ben's review of 2.30, R1: two events into one node; per
// event, as branchRegions() gives them, that node belonged to neither way).
function boundaryWays(g, id){
  const outs = g.fwdOut.get(id);
  const main = new Set(outs.filter(f => !f.event).flatMap(f => [f.to, ...g.reachable(f.to)]));
  const taken = new Set([id]);
  return outs.filter(f => f.event).map(f => {
    const nodes = [f.to, ...g.reachable(f.to)].filter(x => !main.has(x) && !taken.has(x));
    nodes.forEach(x => taken.add(x));
    return { flow: f, nodes };
  });
}
function ruleBoundaryBelow(g, model){
  const hosts = [...new Set(model.flows.filter(f => f.event).map(f => f.from))];
  for (const id of byCol(g, hosts)){
    const H = g.cells.get(id);
    let row = H.row;
    for (const r of boundaryWays(g, id)){
      const mine = r.nodes.filter(x => { const c = g.cells.get(x); return c.lane === H.lane && c.row === H.row && !c.pin; });
      if (mine.length){
        row = g.freshRow(H.lane, row, 1);
        for (const x of mine) g.cells.get(x).row = row;
      }
      for (let lane = 0; lane < g.lanes; lane++){
        if (lane === H.lane || g.poolOfLane[lane] !== g.poolOfLane[H.lane]) continue;
        const there = r.nodes.filter(x => { const c = g.cells.get(x); return c.lane === lane && c.row === 0 && !c.pin; });
        const rest = [...g.cells.values()].some(c => c.lane === lane && c.row === 0 && !r.nodes.includes(c.n.id));
        if (!there.length || !rest) continue;
        const dir = lane < H.lane ? 1 : -1, rows = g.rowsOf(lane);
        const to = g.freshRow(lane, dir > 0 ? rows[rows.length - 1] : rows[0], dir);
        for (const x of there) g.cells.get(x).row = to;
      }
    }
  }
}

// A trial run from R7 on, for the trials R10 to R16 and R11: the finished DI,
// its quality and the columns R7 gave; afterwards the cells stand as before.
function runGrid(g, model, measure, rules){
  const once = reroute => {
    const before = new Map([...g.cells.values()].map(c => [c, { lane: c.lane, row: c.row, col: c.col, pin: c.pin }]));
    const di = finishGrid(g, model, measure, rules, reroute);
    const cols = new Map([...g.cells.values()].map(c => [c, c.col]));
    // Where each node ends up, by lane and row (R8 and R15 move rows in finishGrid()), for R18.
    const at = new Map([...g.cells.values()].map(c => [c, c.lane * 1e6 + c.row]));
    for (const [c, v] of before) Object.assign(c, v);
    return { di, q: gridQuality(di, model), cols, at, last: Math.max(...cols.values()) };
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
// more crossings. The crossings count the message flows too, and no swap adds
// bends to them; a swap with as many crossings is taken where the message
// flows bend less and nothing else gets worse (Ben, 2026-10-07, b-wv2: the way
// that sends messages to a black box below was swapped above, each message
// bending twice around the other way). The lane gets narrower again by itself, since the bands come
// from the rows taken.
function ruleRowProbe(g, model, measure, rules){
  const snap = () => new Map([...g.cells.values()].map(c => [c, { lane: c.lane, row: c.row, col: c.col, pin: c.pin }]));
  const restore = m => { for (const [c, v] of m) Object.assign(c, v); };
  const run = () => runGrid(g, model, measure, rules);
  let best = run();
  // A swap that leaves the crossings as they are counts where the message flows bend less (Ben, 2026-10-07, b-wv2:
  // the way that sends the messages to a black box below took the row above, and each message bent twice around
  // the other way): no measure of the sequence flows gets worse, their bends neither.
  // The crossings of all flows, message flows too; a swap never adds bends to the message flows.
  const cross = q => q.crossings + q.msgCrossings;
  const fewer = t => t.q.msgBends <= best.q.msgBends && (cross(t.q) < cross(best.q)
    || (cross(t.q) === cross(best.q) && t.q.msgBends < best.q.msgBends && t.q.bends <= best.q.bends && t.q.shared <= best.q.shared));
  for (const grp of g.pathRowGroups){
    if (!cross(best.q) && !best.q.msgBends) break;
    const cells = grp.ids.map(x => g.cells.get(x)).filter(c => c.lane === grp.lane && c.row === grp.row && !c.pin);
    if (!cells.length) continue;
    const keep = snap();
    for (const c of cells) c.row = -c.row;
    const t = run();
    if (fewer(t) && t.q.through <= best.q.through && t.q.lines <= best.q.lines && t.q.labels <= best.q.labels && !t.q.overlaps) best = t;
    else restore(keep);
  }
  return best;
}

// R10 by counting (options.rowOrder; the ordering phase, step c of
// docs/konzept-ordnungsphase.md). Per group of rows R2 gave a way, as R10
// tries it, the crossings are counted with the group on its side and on the
// other, without routing (gridCrossings()). Where the count sees a
// difference, it decides; where it sees none, R10's trial decides as before,
// with all its measures, the message flows' among them (Ben, 2026-10-07,
// b-wv2). The count never pointed the wrong way in the spike, but misses
// crossings (tracks, ports at a task's side), so a tie is no reason to keep a
// side (spikes/ordnungsphase/BERICHT.md). It counts where the nodes stand after
// the last trial run (columns and rows after R7, R8, R9 and R15), not on the
// grid before it: R7 and R9 put nodes in their gateway's column, and the flows
// within a column carry most crossings.
function ruleRowOrder(g, model, measure, rules){
  const snap = () => new Map([...g.cells.values()].map(c => [c, { lane: c.lane, row: c.row, col: c.col, pin: c.pin }]));
  const restore = m => { for (const [c, v] of m) Object.assign(c, v); };
  let best = runGrid(g, model, measure, rules), stale = false;
  const fresh = () => { if (stale){ best = runGrid(g, model, measure, rules); stale = false; } for (const c of g.cells.values()) c.turned = false; };
  const colOf = c => best.cols.get(c);
  // The place after the last trial run, a row turned over since turned over.
  const keyOf = c => { const k = best.at.get(c), lane = c.lane * 1e6; return c.turned ? lane - (k - lane) : k; };
  // R10's measures (ruleRowProbe()).
  const cross = q => q.crossings + q.msgCrossings;
  const better = t => t.q.msgBends <= best.q.msgBends && (cross(t.q) < cross(best.q)
    || (cross(t.q) === cross(best.q) && t.q.msgBends < best.q.msgBends && t.q.bends <= best.q.bends && t.q.shared <= best.q.shared))
    && t.q.through <= best.q.through && t.q.lines <= best.q.lines && t.q.labels <= best.q.labels && !t.q.overlaps;
  fresh();
  for (const grp of g.pathRowGroups){
    const cells = grp.ids.map(x => g.cells.get(x)).filter(c => c.lane === grp.lane && c.row === grp.row && !c.pin);
    if (!cells.length) continue;
    const before = gridCrossings(g, model, colOf, keyOf);
    for (const c of cells) c.turned = !c.turned;
    const after = gridCrossings(g, model, colOf, keyOf);
    for (const c of cells) c.turned = !c.turned;
    if (after < before){ for (const c of cells){ c.row = -c.row; c.turned = !c.turned; } stale = true; continue; }
    if (after > before) continue;
    fresh();
    if (!cross(best.q) && !best.q.msgBends) continue;
    const keep = snap();
    for (const c of cells) c.row = -c.row;
    const t = runGrid(g, model, measure, rules);
    if (better(t)){ best = t; for (const c of g.cells.values()) c.turned = false; }
    else restore(keep);
  }
  for (const c of g.cells.values()) delete c.turned;
}

// The crossings of the sequence flows, counted without routing, with each
// cell's column (colOf) and place top to bottom (key; lane × 10⁶ + row, as the
// grid stands, unless given) (spike ordnungsphase, "mini", spikes/ordnungsphase/
// BERICHT.md): a router at the level of columns. Each flow over several columns has per column a place
// entering it and one leaving it, a vertical piece between (a port above or
// below); it runs at one place between its ends: its source's row, its
// target's, or the channel above or below every node of its lane in the
// columns it spans. Of these it takes the cheapest: a node it would run
// through 1000, a crossing with a flow laid before 1, then the router's usual
// choice (from a split or a boundary event the target's row, else the
// source's; a flow back from its row in the channel above, from a row above in
// its source's row, from one below in the channel below), short forward flows
// first, flows back last. Two flows cross in a gap where their order differs
// on its two sides, and in a column where one runs vertically and the other
// through it. In the spike it never pointed the wrong way in the 18 pairs of
// pictures that differ in their crossings, and got all six of R10.
function gridCrossings(g, model, colOf = c => c.col, key = c => c.lane * 1e6 + c.row){
  const byCol = new Map();
  for (const c of g.cells.values()){ const x = colOf(c); if (!byCol.has(x)) byCol.set(x, []); byCol.get(x).push(c); }
  const cols = [...byCol.keys()].sort((a, b) => a - b), index = new Map(cols.map((x, k) => [x, k]));
  const inCol = k => byCol.get(cols[k]) || [];
  const outs = new Map();
  for (const f of model.flows) outs.set(f.from, (outs.get(f.from) || 0) + 1);
  const placed = [], open = [];
  for (const f of model.flows){
    const a = g.cells.get(f.from), b = g.cells.get(f.to);
    if (!a || !b || a === b) continue;
    let sa = index.get(colOf(a)), sb = index.get(colOf(b));
    if (sa === sb){ placed.push({ sa, sb, enter: new Map([[sa, key(a)]]), leave: new Map([[sa, key(b)]]) }); continue; }
    const back = sa > sb, [L, R] = back ? [b, a] : [a, b];
    if (back) [sa, sb] = [sb, sa];
    const there = [];
    for (let k = sa; k <= sb; k++) for (const c of inCol(k)) if (c.lane === L.lane) there.push(key(c));
    const above = Math.min(...there) - 0.5, below = Math.max(...there) + 0.5, same = key(L) === key(R);
    let options;
    if (!back) options = same ? [[key(L), 0]] : (a.n.type === 'gateway' && outs.get(f.from) > 1) || f.event ? [[key(R), 0], [key(L), 0.01]] : [[key(L), 0], [key(R), 0.01]];
    else if (same) options = [[above, 0], [below, 0.01], [key(L), 0.05]];
    else if (key(R) < key(L)) options = [[key(R), 0], [key(L), 0.03]];
    else options = [[key(R), 0.01], [key(L), 0.03]];
    if (!back || !same) options.push([above, back && key(R) < key(L) ? 0.01 : back ? 0.02 : 0.05], [below, back && key(R) > key(L) ? 0 : back ? 0.02 : 0.06]);
    open.push({ sa, sb, L, R, back, options });
  }
  const at = (o, y) => {
    const enter = new Map(), leave = new Map();
    for (let k = o.sa; k <= o.sb; k++){ enter.set(k, k === o.sa ? key(o.L) : y); leave.set(k, k === o.sb ? key(o.R) : y); }
    return { sa: o.sa, sb: o.sb, enter, leave };
  };
  const hits = (k, y1, y2, but) => inCol(k).filter(c => c !== but && key(c) > Math.min(y1, y2) && key(c) < Math.max(y1, y2)).length;
  open.sort((p, q) => (p.back - q.back) || ((p.sb - p.sa) - (q.sb - q.sa)));
  for (const o of open){
    let best = null;
    for (const [y, liking] of o.options){
      const way = at(o, y);
      let cost = liking + 1000 * (hits(o.sa, key(o.L), y, o.L) + hits(o.sb, key(o.R), y, o.R));
      for (let k = o.sa + 1; k < o.sb; k++) cost += 1000 * inCol(k).filter(c => key(c) === y).length;
      for (const other of placed) cost += waysCross(way, other);
      if (!best || cost < best.cost) best = { cost, way };
    }
    placed.push(best.way);
  }
  let n = 0;
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) n += waysCross(placed[i], placed[j]);
  return n;
}
// How often two ways of gridCrossings() cross: in each gap both span where
// their order differs on its two sides, and in each column where one runs
// vertically and the other through it, strictly between the vertical's ends.
function waysCross(a, b){
  let n = 0;
  for (let k = Math.max(a.sa, b.sa); k < Math.min(a.sb, b.sb); k++)
    if ((a.leave.get(k) - b.leave.get(k)) * (a.enter.get(k + 1) - b.enter.get(k + 1)) < 0) n++;
  const through = (v, h) => {
    let m = 0;
    for (let k = Math.max(v.sa, h.sa + 1); k <= Math.min(v.sb, h.sb - 1); k++){
      const e = v.enter.get(k), o = v.leave.get(k), y = h.enter.get(k);
      if (e !== o && y === h.leave.get(k) && y > Math.min(e, o) && y < Math.max(e, o)) m++;
    }
    return m;
  };
  return n + through(a, b) + through(b, a);
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
      if (pos(a) === pos(b) || best.cols.get(a) !== best.cols.get(b) || g.poolOfLane[a.lane] !== g.poolOfLane[b.lane]) continue;
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

// The quality of a laid-out picture, for the trials R10 to R16 and R11 and for
// runGrid()'s choice between the router's passes: crossings of two flows (a
// horizontal and a vertical piece cutting each other inside), flows through a
// foreign node, overlapping nodes, pieces of two flows on one line (lines),
// labels a foreign flow runs through, shared pieces (onOneLine()) and bends.
// It stands in for the tests' rule check (tests/bpmn-rules.mjs), which is not
// available here.
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
  // The message flows' crossings (with any flow) and bends, for R10 alone (Ben, 2026-10-07, b-wv2).
  const msgBends = (model.messages || []).reduce((n, f) => n + Math.max(0, (di.flows[f.id] || []).length - 2), 0);
  let msgCrossings = 0;
  const msgSegs = [];
  for (const m of model.messages || []){ const pts = di.flows[m.id] || []; for (let i = 1; i < pts.length; i++) msgSegs.push({ f: m.id, a: pts[i - 1], b: pts[i] }); }
  for (const p of msgSegs) for (const q of [...segs, ...msgSegs]){
    if (p.f === q.f || (msgSegs.includes(q) && q.f < p.f)) continue;
    const ph = p.a[1] === p.b[1], qh = q.a[1] === q.b[1];
    if (ph === qh) continue;
    const [h, v] = ph ? [p, q] : [q, p];
    const x = v.a[0], y = h.a[1];
    if (x > Math.min(h.a[0], h.b[0]) && x < Math.max(h.a[0], h.b[0]) && y > Math.min(v.a[1], v.b[1]) && y < Math.max(v.a[1], v.b[1])) msgCrossings++;
  }
  return { crossings, through, overlaps, lines, labels, shared: shared.length, bends, msgBends, msgCrossings };
}

// From R7 to the finished DI: close the columns, bands, router, pixels, labels.
// Changes the cells' columns (R7) and rows (R8, R15); runGrid() saves and
// restores them. reroute: whether the router runs its pair trial and second
// pass.
function finishGrid(g, model, measure, rules, reroute = true){
  if (g.runs) g.runs[g.stage] = (g.runs[g.stage] || 0) + 1;
  centreLaneSplits(g, model);
  // R9: R7 until each group of first nodes of ways stands in one column; each
  // round from the columns raw gave, the minimum columns only grow.
  const orig = new Map([...g.cells.values()].map(c => [c, c.col]));
  const compactAll = () => {
    g.minCol = new Map();
    for (let round = 0; round < 8; round++){
      for (const [c, col] of orig) c.col = col;
      ruleCompact(g, model, rules);
      let settled = true;
      for (const all of g.columnGroups || []){
        // A split R8 moved off a foreign node in its column (ruleBlockColumn()) leaves its group: else the group
        // followed it, the foreign node with it.
        const grp = all.filter(x => !g.blockCol.has(x));
        if (!grp.length) continue;
        const cols = grp.map(x => g.cells.get(x).col), max = Math.max(...cols);
        if (cols.every(c => c === max)) continue;
        settled = false;
        for (const x of grp) g.minCol.set(x, max);
      }
      if (settled) break;
    }
  };
  g.blockCol = new Map();
  compactAll();
  let boxed = false;
  for (let round = 0; rules.block && round < 3 && ruleBlockBox(g, model); round++){ boxed = true; compactAll(); }
  for (let round = 0; rules.block && round < 3 && ruleBlockColumn(g, model); round++) compactAll();
  // Where the box moved rows, the starts dock to their successor again (R15).
  if (boxed && rules.startAlign && redockStarts(g, model)) compactAll();

  // The rows of each lane numbered; bands (channel, row, channel, …) from top
  // to bottom over all lanes; columns and gaps from left to right.
  const laneRows = [];
  for (let l = 0; l < g.lanes; l++){
    const rows = g.rowsOf(l);
    laneRows.push(rows.length ? rows : [0]);
  }
  // A gap stands between two pools, above the second; a black box is a band of its own, without lanes (story 2.29).
  const bands = [];           // { kind: 'ch'|'row'|'gap'|'box', lane, row, pool }
  const rowBand = new Map();  // lane|rowIndex → band index
  model.pools.forEach((p, k) => {
    if (bands.length) bands.push({ kind: 'gap' });
    if (p.box){ bands.push({ kind: 'box', pool: k }); return; }
    for (let l = 0; l < g.lanes; l++){
      if (g.poolOfLane[l] !== k) continue;
      bands.push({ kind: 'ch', lane: l, edge: 'top', pool: k });
      laneRows[l].forEach((r, i) => {
        if (i) bands.push({ kind: 'ch', lane: l, pool: k });
        rowBand.set(l + '|' + i, bands.length);
        bands.push({ kind: 'row', lane: l, row: i, pool: k });
      });
      bands.push({ kind: 'ch', lane: l, edge: 'bottom', pool: k });
    }
  });
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
  const gaps = bands.map((b, i) => i).filter(i => bands[i].kind === 'gap');
  // A sequence flow keeps to the channels of its pool.
  const poolOfBand = b => bands[b].pool;
  const channelsOf = new Map();
  for (const ch of channels) (channelsOf.get(poolOfBand(ch)) || channelsOf.set(poolOfBand(ch), []).get(poolOfBand(ch))).push(ch);

  // A message flow's end at a pool's frame (story 2.29) is a place of its own: the band of a black box, or the outer
  // channel of a pool with lanes on the side facing the other end; its column is the other end's.
  const msgEnds = new Map();  // message id → { from, to }, the places of its ends at a frame
  const endAt = (f, k) => msgEnds.get(f.id)?.[k] || place.get(f[k]);
  const typeOf = id => g.cells.get(id)?.n.type ?? 'pool';
  const poolBands = k => bands.map((b, i) => i).filter(i => bands[i].pool === k);
  const facing = (k, band) => { const own = poolBands(k); return band < own[0] ? own[0] : own[own.length - 1]; };
  for (const m of model.messages || []){
    if (m.fromPool === undefined && m.toPool === undefined) continue;
    const e = {};
    if (m.fromPool !== undefined && m.toPool !== undefined){
      e.from = { band: facing(m.fromPool, poolBands(m.toPool)[0]), xo: -1 };
      e.to = { band: facing(m.toPool, poolBands(m.fromPool)[0]), xo: -1 };
    } else if (m.toPool !== undefined){ const s = place.get(m.from); e.to = { band: facing(m.toPool, s.band), xo: s.xo }; }
    else { const t = place.get(m.to); e.from = { band: facing(m.fromPool, t.band), xo: t.xo }; }
    msgEnds.set(m.id, e);
  }

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
    if (pieces.length === 1 && !['task', 'gateway'].includes(typeOf(f.to))) return 3;
    return id && typeOf(id) === 'task' ? 0.5 : 3;
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
    const sameBand = endAt(own, 'from').band === endAt(own, 'to').band;   // the arm in the gateways' row goes straight
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
  const msgIds = new Set((model.messages || []).map(m => m.id));
  // Whether piece k of flow f is the first piece of a named flow out of a gateway and the crossing of h and v lies
  // in the gap or channel next to the gateway.
  const exitLabel = (f, k, h, v) => {
    if (k !== 0 || !f.name || typeOf(f.from) !== 'gateway') return false;
    const s = endAt(f, 'from');
    return (Math.abs(v.v - s.xo) === 1 && h.h === s.band) || (Math.abs(h.h - s.band) === 1 && v.v === s.xo);
  };
  const conflicts = (pieces, own) => {
    let n = blockCost(pieces, own);
    // A horizontal piece in a channel of a foreign lane: the flow back belongs in its own.
    const ownLanes = new Set([g.cells.get(own.from)?.lane, g.cells.get(own.to)?.lane]);
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
          if (Math.min(h.x1, h.x2) < v.v && v.v < Math.max(h.x1, h.x2) && Math.min(v.b1, v.b2) < h.h && h.h < Math.max(v.b1, v.b2)){
            n += 1;
            // A message flow right at the exit of a gateway, where the label of its flow stands (flowLabelPlaces()):
            // the crossing costs as much as a piece on a foreign line (Ben, 2026-10-07, llm-reklamation: the message
            // flow crossed "Ersatz" through its label; he led it over the merge's arm, which bears none).
            if (msgIds.has(own.id) && exitLabel(r.f, j, h, v)) n += 3;
          }
        }
      }));
    }
    return n;
  };
  const length = pieces => pieces.reduce((s, p) => s + (p.h !== undefined ? Math.abs(p.x2 - p.x1) : Math.abs(p.b2 - p.b1)), 0);
  const portPenalty = (id, side, out) => {
    const c = g.cells.get(id);
    if (!c || c.n.type === 'task') return 0;
    const u = portUse.get(id + '|' + side);
    return u && (out ? u.in : u.out) ? 100 : 0;
  };
  // A host's lower edge belongs to its boundary events (story 2.30): a flow from one leaves it downwards (else 200),
  // another flow does not use it (100, as a port of the other direction).
  const hosts = new Set((model.boundaries || []).map(b => b.host));
  const boundaryCost = (f, pieces, s, t) => {
    if (!hosts.size) return 0;
    if (f.event) return pieces[0].v !== undefined && pieces[0].b2 > pieces[0].b1 ? 0 : 200;
    return (hosts.has(f.from) && sideOfFirst(pieces[0], s) === 'bottom' ? 100 : 0) + (hosts.has(f.to) && sideOfLast(pieces[pieces.length - 1], t) === 'bottom' ? 100 : 0);
  };
  const score = (f, pieces) => {
    const s = endAt(f, 'from'), t = endAt(f, 'to');
    // A bend costs half a grid step (Ben, 2026-10-05, hund2: try another exit to cut the bends of a line): with the
    // same length and conflicts the way with fewer bends wins, say out sideways rather than out below and at once to
    // the side. So that no bend is saved by a flow to the right taking a task from behind: where the target lies
    // right of the source or in its column, entering a task from the right or leaving it to the left costs two
    // bends (a gateway may be entered from the right, as Ben did in hund2).
    const ahead = t.xo >= s.xo;
    const behind = ahead ? (typeOf(f.to) === 'task' && sideOfLast(pieces[pieces.length - 1], t) === 'right' ? 1 : 0) + (typeOf(f.from) === 'task' && sideOfFirst(pieces[0], s) === 'left' ? 1 : 0) : 0;
    return cellsCrossed(pieces) * 1000 + boundaryCost(f, pieces, s, t) + portPenalty(f.from, sideOfFirst(pieces[0], s), true) + portPenalty(f.to, sideOfLast(pieces[pieces.length - 1], t), false) + conflicts(pieces, f) + length(pieces) / 100 + (pieces.length - 1 + 2 * behind) * (msgIds.has(f.id) ? MSG_BEND : f.event ? EVENT_BEND : BEND);
  };
  // The templates of a flow s→t.
  const templates = (s, t) => {
    const out = [];
    const ys = s.band, yt = t.band, xs = s.xo, xt = t.xo;
    const channels = channelsOf.get(poolOfBand(ys));
    // From a boundary event back into its host (story 2.30): down, beside the host, in from the side.
    if (ys === yt && xs === xt){
      for (const ch of channels) for (const gx of [xs + 1, xs - 1]) out.push([V(xs, ys, ch), H(ch, xs, gx), V(gx, ch, ys), H(ys, gx, xs)]);
      return out;
    }
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
  // From a boundary event (story 2.30) besides: down into a channel below the host, along it to a gap between
  // columns, up or down that gap and in from the side; so a way to a lane above leaves the event downwards too.
  const waysOf = (f, s, t) => {
    if (!f.event) return templates(s, t);
    const out = templates(s, t);
    for (const ch of channelsOf.get(poolOfBand(s.band))){
      if (ch < s.band) continue;
      for (const gx of [s.xo + 1, t.xo - 1, t.xo + 1]) out.push([V(s.xo, s.band, ch), H(ch, s.xo, gx), V(gx, ch, t.band), H(t.band, gx, t.xo)]);
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
    for (const raw of waysOf(f, s, t)){
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
      for (const raw of waysOf(f, place.get(f.from), place.get(f.to))){
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
    for (const raw of waysOf(f, s, t)){
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
  // ---- Message flows (story 2.12) ----
  // After the sequence flows, which do not see them. A message flow leaves its
  // source and enters its target vertically, on the side facing the other
  // pool; it runs horizontally in a gap between pools, or in the channel next
  // to an end, and vertically in a column or a gap between columns, through
  // pools between the two.
  const msgTemplates = (s, t) => {
    const out = [], ys = s.band, yt = t.band, xs = s.xo, xt = t.xo, d = Math.sign(yt - ys);
    const between = gaps.filter(G => (G - ys) * (G - yt) < 0);
    if (xs === xt) out.push([V(xs, ys, yt)]);
    for (const G of between){
      out.push([V(xs, ys, G), H(G, xs, xt), V(xt, G, yt)]);
      for (const gx of [xs - 1, xs + 1]) out.push([V(xs, ys, ys + d), H(ys + d, xs, gx), V(gx, ys + d, G), H(G, gx, xt), V(xt, G, yt)]);
      for (const gx of [xt - 1, xt + 1]) out.push([V(xs, ys, G), H(G, xs, gx), V(gx, G, yt - d), H(yt - d, gx, xt), V(xt, yt - d, yt)]);
      for (const G2 of between) if ((G2 - G) * d > 0) for (const gx of [xs - 1, xs + 1, xt - 1, xt + 1]) out.push([V(xs, ys, G), H(G, xs, gx), V(gx, G, G2), H(G2, gx, xt), V(xt, G2, yt)]);
      // Out beside the source and in beside the target, so that neither column is run through (Ben, 2026-10-07,
      // nz19-pool1: the way into "Verzögerungsmeldung erhalten" ran through the event below it in its column; he
      // bent it into the channel below the target).
      for (const gs of [xs - 1, xs + 1]) for (const gt of [xt - 1, xt + 1]) out.push([V(xs, ys, ys + d), H(ys + d, xs, gs), V(gs, ys + d, G), H(G, gs, gt), V(gt, G, yt - d), H(yt - d, gt, xt), V(xt, yt - d, yt)]);
    }
    return out;
  };
  // To a frame (story 2.29): vertical from the node straight to the frame, or out beside it, over the channel next
  // to it or a gap between pools, into a gap between columns; from a frame the same way back; from frame to frame
  // vertical in a gap between columns.
  const toFrame = (xs, ys, B) => {
    const out = [[V(xs, ys, B)]], d = Math.sign(B - ys);
    const between = gaps.filter(G => (G - ys) * (G - B) < 0);
    for (const gx of [xs - 1, xs + 1]){
      out.push([V(xs, ys, ys + d), H(ys + d, xs, gx), V(gx, ys + d, B)]);
      for (const G of between) out.push([V(xs, ys, G), H(G, xs, gx), V(gx, G, B)]);
    }
    return out;
  };
  const reverse = pieces => [...pieces].reverse().map(p => p.h !== undefined ? H(p.h, p.x2, p.x1) : V(p.v, p.b2, p.b1));
  const frameTemplates = (m, s, t) => {
    const e = msgEnds.get(m.id);
    if (e.from && e.to){ const out = []; for (let gx = 0; gx <= 2 * cols; gx += 2) out.push([V(gx, s.band, t.band)]); return out; }
    return e.to ? toFrame(s.xo, s.band, t.band) : toFrame(t.xo, t.band, s.band).map(reverse);
  };
  // From an end event also out of its east port, which no flow uses (Ben, 2026-10-07, nz18-fluss2: of two message
  // flows out of one end the second left by the east port, rather than sharing the north port with the first): along
  // its row to the target's column, or to the gap after the end and over a gap between pools, then into the target
  // vertically.
  const eastTemplates = (s, t) => {
    const out = [], ys = s.band, yt = t.band, xs = s.xo, xt = t.xo;
    if (xt <= xs) return out;
    out.push([H(ys, xs, xt), V(xt, ys, yt)]);
    for (const G of gaps.filter(G => (G - ys) * (G - yt) < 0)) out.push([H(ys, xs, xs + 1), V(xs + 1, ys, G), H(G, xs + 1, xt), V(xt, G, yt)]);
    return out;
  };
  const span = f => Math.abs(endAt(f, 'to').xo - endAt(f, 'from').xo) + Math.abs(endAt(f, 'to').band - endAt(f, 'from').band);
  for (const m of [...(model.messages || [])].sort((a, b) => span(a) - span(b))){
    const s = endAt(m, 'from'), t = endAt(m, 'to');
    let best = null;
    for (const raw of msgEnds.has(m.id) ? frameTemplates(m, s, t) : [...msgTemplates(s, t), ...(typeOf(m.from) === 'end' ? eastTemplates(s, t) : [])]){
      const pieces = clean(raw);
      if (!pieces.length) continue;
      const sc = score(m, pieces);
      if (!best || sc < best.sc) best = { pieces, sc };
    }
    const sideS = sideOfFirst(best.pieces[0], s), sideT = sideOfLast(best.pieces[best.pieces.length - 1], t);
    for (const [id, side, out] of [[m.from, sideS, true], [m.to, sideT, false]]){ if (!g.cells.has(id)) continue; const k = id + '|' + side; const u = portUse.get(k) || { in: 0, out: 0 }; u[out ? 'out' : 'in']++; portUse.set(k, u); }
    routed.push({ f: m, pieces: best.pieces, sides: [sideS, sideT], back: false, message: true });
  }

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
      const fromBand = before ? before.b1 : endAt(r.f, 'from').band;
      const side = (fromBand < ch ? 'top' : 'bottom');
      items.push({ p, lo: Math.min(p.x1, p.x2), hi: Math.max(p.x1, p.x2), len: Math.abs(p.x2 - p.x1), side });
    });
    const top = assign(items.filter(x => x.side === 'top'), 'top'), bottom = assign(items.filter(x => x.side === 'bottom'), 'bottom');
    chTracks.set(ch, { top, bottom });
  }
  // A gap between pools (story 2.12): its pieces in the order, from top to bottom, with the fewest crossings with the
  // vertical pieces before and after them (Ben, 2026-10-06, p-miwg1: two message flows swapped, two crossings
  // fewer). Start from the order the channels give (from above, the shorter span higher; then from below, the
  // shorter span lower), then swap neighbours while that crosses less; the first as many as come from above stack from
  // the top, the rest from the bottom, each on the first track beyond every piece before it that it overlaps.
  for (const ch of gaps){
    const items = [];
    for (const r of routed) r.pieces.forEach((p, i) => {
      if (p.h !== ch) return;
      const before = r.pieces[i - 1], after = r.pieces[i + 1];
      const ends = [];
      if (before && before.v !== undefined) ends.push({ x: before.v, up: before.b1 < ch });
      if (after && after.v !== undefined) ends.push({ x: after.v, up: after.b2 < ch });
      const fromBand = before ? before.b1 : endAt(r.f, 'from').band;
      items.push({ p, lo: Math.min(p.x1, p.x2), hi: Math.max(p.x1, p.x2), len: Math.abs(p.x2 - p.x1), fromAbove: fromBand < ch, ends });
    });
    // The crossings of a above b: a's verticals down through b, b's verticals up through a.
    const cost = (a, b) => a.ends.filter(e => !e.up && b.lo < e.x && e.x < b.hi).length + b.ends.filter(e => e.up && a.lo < e.x && e.x < a.hi).length;
    const order = [...items.filter(x => x.fromAbove).sort((a, b) => a.len - b.len), ...items.filter(x => !x.fromAbove).sort((a, b) => b.len - a.len)];
    for (let swapped = true, n = 0; swapped && n < 50; n++){
      swapped = false;
      for (let i = 0; i + 1 < order.length; i++) if (cost(order[i + 1], order[i]) < cost(order[i], order[i + 1])){ [order[i], order[i + 1]] = [order[i + 1], order[i]]; swapped = true; }
    }
    // The first as many as come from above take tracks from the top, the rest from the bottom, as in a channel.
    const k = items.filter(x => x.fromAbove).length;
    const stack = (list, side) => {
      let levels = 0;
      list.forEach((it, j) => {
        const i = Math.max(-1, ...list.slice(0, j).filter(o => overlap(o.lo, o.hi, it.lo, it.hi)).map(o => tracks.get(o.p).i)) + 1;
        tracks.set(it.p, { side, i });
        levels = Math.max(levels, i + 1);
      });
      return levels;
    };
    chTracks.set(ch, { top: stack(order.slice(0, k), 'top'), bottom: stack(order.slice(k).reverse(), 'bottom') });
  }
  for (let gx = 0; gx <= 2 * cols; gx += 2){
    const items = [];
    for (const r of routed) r.pieces.forEach((p, i) => {
      if (p.v !== gx) return;
      const before = r.pieces[i - 1];
      const fromX = before ? before.x1 : endAt(r.f, 'from').xo;
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
    // A host's row holds its boundary events below its lower edge, and as much above (story 2.30).
    rowH[b] = Math.max(rowH[b], SIZE[c.n.type][1] + (hosts.has(c.n.id) ? SIZE.inter[1] : 0));
  }
  for (let b = 0; b < bands.length; b++){
    if (bands[b].kind === 'row'){ if (!rowH[b]) rowH[b] = EMPTY_ROW; continue; }
    if (bands[b].kind === 'box'){ rowH[b] = BOX_H; continue; }
    const t = chTracks.get(b), n = t.top + t.bottom;
    const base = bands[b].kind === 'gap' ? POOL_GAP : bands[b].edge ? EDGE_BASE : CHANNEL_BASE;
    const [margin, step] = bands[b].kind === 'gap' ? [GAP_TRACK, GAP_TRACK] : [TRACK_MARGIN, TRACK];
    rowH[b] = Math.max(base, n ? 2 * margin + (n - 1) * step + (bands[b].edge ? 0 : 8) : 0);
    // A gap is as tall as the tallest label of a message flow across it, 6 px clear of either pool (story 2.12).
    if (bands[b].kind === 'gap') for (const m of model.messages || []){
      const s = endAt(m, 'from').band, e = endAt(m, 'to').band;
      if (m.name && (b - s) * (b - e) < 0) rowH[b] = Math.max(rowH[b], measure(textOf(m)).h + 12);
    }
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
    const need = (a.n.type === 'gateway' ? 10 : 6) + measure(textOf(r.f)).w + 6;
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
    const band = place.get(c.n.id).band, need = 2 + measure(textOf(c.n)).w + 6;
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

  const box = byId();
  for (const c of g.cells.values()){
    const b = place.get(c.n.id).band, [w, h] = SIZE[c.n.type];
    box[c.n.id] = { cx: colX[c.col] + colW[c.col] / 2, cy: bandY[b] + rowH[b] / 2, w, h, task: c.n.type === 'task', gateway: c.n.type === 'gateway' };
  }
  const trackY = p => {
    const t = tracks.get(p), b = p.h, h = rowH[b];
    const [margin, step] = bands[b].kind === 'gap' ? [GAP_TRACK, GAP_TRACK] : [TRACK_MARGIN, TRACK];
    return t.side === 'top' ? bandY[b] + margin + t.i * step + (bands[b].edge ? 0 : 4) : bandY[b] + h - margin - t.i * step - (bands[b].edge ? 0 : 4);
  };
  const trackX = p => {
    const t = tracks.get(p), gx = p.v / 2, w = gapW[gx];
    return t.side === 'left' ? gapX[gx] + TRACK_MARGIN + t.i * TRACK : gapX[gx] + w - TRACK_MARGIN - t.i * TRACK;
  };

  // Boundary events (story 2.30) side by side in the middle of their host's lower edge, 8 px apart where the host
  // allows: those whose way turns left first, then those going straight down or without a flow, then those turning
  // right; of two turning alike the one going deeper stands further in, so that their ways do not cross. A flow
  // from one leaves its lower tip.
  const byHost = new Map();
  for (const b of model.boundaries || []) (byHost.get(b.host) || byHost.set(b.host, []).get(b.host)).push(b);
  for (const [host, list] of byHost){
    const c = box[host];
    const key = b => {
      const r = routed.find(o => o.f.event === b.id), q = r && r.pieces[1];
      if (!q || q.h === undefined) return 0;
      const turn = Math.sign(q.x2 - q.x1);
      return turn * (1 + 1 / (1 + Math.abs(q.h - place.get(host).band)));
    };
    const sorted = [...list].sort((a, b) => key(a) - key(b));
    const n = sorted.length, step = n > 1 ? Math.min(SIZE.inter[0] + 8, (c.w - SIZE.inter[0]) / (n - 1)) : 0;
    // A sub-process, a call activity, a loop or a multi-instance activity carries its markers in the middle of that
    // edge (MARKER each): one or two events stand beside them, one alone on the right.
    const markers = g.cells.get(host).n.markers || 0, room = markers > 1 ? MARKERS : MARKER;
    const at = i => markers && n <= 2 ? (n === 1 || i === 1 ? 1 : -1) * Math.min(room / 2 + SIZE.inter[0] / 2, c.w / 2 - ATTACH_CLEARANCE) : step * (i - (n - 1) / 2);
    sorted.forEach((b, i) => { box[b.id] = { cx: c.cx + at(i), cy: c.cy + c.h / 2, w: SIZE.inter[0], h: SIZE.inter[1] }; });
  }

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
    const e = msgEnds.get(r.f.id);
    if (!e?.from && !r.f.event) add(r.f.from, r.sides[0], true, farOf(true));
    if (!e?.to) add(r.f.to, r.sides[1], false, farOf(false));
  }
  const portOf = new Map(); // r|out → { x, y }
  for (const [k, list] of ends){
    // Split at the last "|": an author's id may hold one (review of 2.31), a side never does.
    const cut = k.lastIndexOf('|'), id = k.slice(0, cut), side = k.slice(cut + 1), c = box[id];
    const vertical = side === 'top' || side === 'bottom';
    const base = { x: side === 'left' ? c.cx - c.w / 2 : side === 'right' ? c.cx + c.w / 2 : c.cx, y: side === 'top' ? c.cy - c.h / 2 : side === 'bottom' ? c.cy + c.h / 2 : c.cy };
    // Two message flows that come from one side alike take their places by their ids, the same at both ends, so that
    // two flows back and forth between two symbols lie side by side and do not cross (Ben, 2026-10-06, p-rs2);
    // in or out would swap their places from one end to the other.
    // Two flows from boundary events of one host that come alike take their places by their events: the one whose
    // event lies nearer stands as the nearer piece would (review of 2.30, R1: else their ways crossed).
    const nearer = (a, b) => {
      if (!a.r.f.event || !b.r.f.event || a.out || b.out || a.r.f.from !== b.r.f.from || !a.far) return 0;
      const d = e => Math.abs(box[e.r.f.event].cx - c.cx) + Math.abs(box[e.r.f.event].cy - c.cy);
      return a.far < 0 ? d(a) - d(b) : d(b) - d(a);
    };
    const sorted = [...list].sort((a, b) => a.far - b.far || nearer(a, b) || (a.r.message && b.r.message ? (a.r.f.id < b.r.f.id ? -1 : a.r.f.id > b.r.f.id ? 1 : 0) : 0) || (a.out === b.out ? 0 : a.out ? 1 : -1));
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

  for (const r of routed) if (r.f.event){ const e = box[r.f.event]; portOf.set(r.f.id + '|true', { x: e.cx, y: e.cy + e.h / 2 }); }

  // An end at a frame (story 2.29) lies on the line of its piece, a vertical one: in a gap between columns on its
  // track, in a column at the other end's port; on the edge of its band facing the other end.
  for (const r of routed){
    const e = msgEnds.get(r.f.id);
    if (!e) continue;
    const n = r.pieces.length;
    for (const [out, k, p] of [[true, 'from', r.pieces[0]], [false, 'to', r.pieces[n - 1]]]){
      if (!e[k]) continue;
      const B = e[k].band, other = out ? Math.max(p.b1, p.b2) > B : Math.min(p.b1, p.b2) < B;
      const x = p.v % 2 === 0 ? trackX(p) : n === 1 ? portOf.get(r.f.id + '|' + !out).x : colX[(p.v - 1) / 2] + colW[(p.v - 1) / 2] / 2;
      // other: the rest of the way lies below the frame's band (from a frame) or above it (to a frame).
      portOf.set(r.f.id + '|' + out, { x, y: out ? (other ? bandY[B] + rowH[B] : bandY[B]) : (other ? bandY[B] : bandY[B] + rowH[B]) });
    }
  }

  const routes = [];
  for (const r of routed){
    const p0 = portOf.get(r.f.id + '|true'), pn = portOf.get(r.f.id + '|false');
    const n = r.pieces.length;
    // The fixed coordinate of each piece: at the start the port, at the end the port, between them the track.
    const fixed = r.pieces.map((p, i) => {
      if (p.h !== undefined) return i === 0 ? p0.y : i === n - 1 ? pn.y : (bands[p.h].kind !== 'row' ? trackY(p) : p0.y);
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

  // Lanes, pools, nodes. Each part keyed by the author's ids (byId()).
  const di = { pools: byId(), lanes: byId(), nodes: byId(), labels: byId(), flows: byId(), flowLabels: byId(), laneOf: byId() };
  for (const n of model.nodes){ const l = model.lanes[g.cells.get(n.id).lane]; if (!l.synthetic) di.laneOf[n.id] = l.id; }
  const laneBox = byId();
  model.lanes.forEach((l, i) => {
    const first = bands.findIndex(b => b.lane === i), last = bands.length - 1 - [...bands].reverse().findIndex(b => b.lane === i);
    laneBox[l.key] = [R(HEAD), R(bandY[first]), R(totalW - HEAD), R(bandY[last] + rowH[last] - bandY[first])];
    if (!l.synthetic) di.lanes[l.id] = laneBox[l.key];
  });
  model.pools.forEach((p, i) => {
    if (!p.id) return;
    const own = bands.map((b, k) => k).filter(k => bands[k].kind !== 'gap' && poolOfBand(k) === i);
    const first = own[0], last = own[own.length - 1];
    di.pools[p.id] = [0, R(bandY[first]), R(totalW), R(bandY[last] + rowH[last] - bandY[first])];
  });
  for (const n of [...model.nodes, ...(model.boundaries || [])]){ const { cx, cy, w, h } = box[n.id]; di.nodes[n.id] = [R(cx - w / 2), R(cy - h / 2), w, h]; }
  for (const { pts } of routes) orthogonal(pts);
  for (const { f, pts } of routes) di.flows[f.id] = pts.map(p => [R(p.x), R(p.y)]);
  const gateways = new Set(model.nodes.filter(n => n.type === 'gateway').map(n => n.id));
  const poolOf = new Map([...g.cells.values()].map(c => [c.n.id, g.poolOfLane[c.lane]]));
  for (const b of model.boundaries || []) poolOf.set(b.id, poolOf.get(b.host));
  finishLabelsAndFrame(model, di, box, routes, laneBox, measure, gateways, poolOf);
  return di;
}

// The labels and the frame of the routed picture. The labels keep off every
// symbol, every piece of a flow and every label placed before them: first the
// flows' labels, then those of events and gateways; where every place is
// taken, the one covered least. poolOf: per node the index of its pool.
function finishLabelsAndFrame(model, di, box, routes, laneBox, measure, gateways, poolOf){
  const segments = routes.flatMap(r => r.pts.slice(1).map((q, i) => segmentBox(r.pts[i], q)));
  const boundaries = model.boundaries || [];
  const symbols = [...model.nodes, ...boundaries].map(n => di.nodes[n.id]);
  const taken = [], owners = [];
  const message = new Set((model.messages || []).map(m => m.id));
  // Per label the pool it belongs to; a message flow's label to none.
  const takenPool = [];
  // A message flow's label keeps off the frames of the pools as well: their edges, 1 px either side; it is tried
  // first in a gap between two pools, beside each vertical piece that passes the gap's middle, right and then left of it,
  // then where any flow's label goes (story 2.12).
  const frames = Object.values(di.pools).sort((a, b) => a[1] - b[1]);
  const frameEdges = ([x, y, w, h]) => [[x, y - 1, w, 2], [x, y + h - 1, w, 2], [x - 1, y, 2, h], [x + w - 1, y, 2, h]];
  const edges = frames.flatMap(frameEdges);
  const gapsY = frames.slice(1).map((b, i) => [frames[i][1] + frames[i][3], b[1]]).filter(([a, b]) => b > a);
  const inGaps = (pts, { w, h }) => {
    const out = [];
    for (let i = 1; i < pts.length; i++){
      const a = pts[i - 1], b = pts[i];
      if (Math.abs(a.x - b.x) >= 1) continue;
      for (const [y1, y2] of gapsY){
        // The piece passes the middle of the gap.
        const yc = (y1 + y2) / 2;
        if (Math.min(a.y, b.y) > yc || Math.max(a.y, b.y) < yc) continue;
        const y = yc - h / 2;
        out.push([a.x + 6, y, w, h], [a.x - 6 - w, y, w, h]);
      }
    }
    return out;
  };
  for (const { f, pts, loop } of routes){
    if (!f.name) continue;
    // Two flows leaving one corner of a gateway: their labels go to their
    // longest pieces, not both to that corner.
    const alone = !routes.some(o => o.f !== f && o.f.from === f.from && exitSide(o.pts) === exitSide(pts));
    const avoid = [...symbols, ...segments, ...taken];
    const place = message.has(f.id)
      ? bestPlace([...inGaps(pts, measure(textOf(f))), ...flowLabelPlaces(pts, textOf(f), false, measure(textOf(f)))], [...avoid, ...edges])
      : flowLabel(pts, textOf(f), gateways.has(f.from) && alone, avoid, measure(textOf(f)), !!loop);
    di.flowLabels[f.id] = place;
    taken.push(place);
    takenPool.push(message.has(f.id) ? null : poolOf.get(f.from));
    owners.push({ boxes: [place], anchor: nearestOnFlow(pts, place[0] + place[2] / 2, place[1] + place[3] / 2) });
  }
  for (const n of model.nodes){
    if (n.type === 'task' || !n.name) continue;
    const place = bestPlace(labelPlaces(box[n.id], measure(textOf(n)), n.type === 'gateway'), [...symbols.filter(b => b !== di.nodes[n.id]), ...segments, ...taken]);
    // bpmn-js centres the text on the box: the box is as wide as a label can be, 90 px or the wider box of a long word (labelBox()).
    const [x, y, w, h] = place;
    di.labels[n.id] = [R(x + w / 2 - Math.max(LABEL_WIDTH, w) / 2), R(y), Math.max(LABEL_WIDTH, w), R(h)];
    taken.push(place);
    takenPool.push(poolOf.get(n.id));
    owners.push({ boxes: [place, di.labels[n.id]], anchor: box[n.id] });
  }
  // A boundary event's name 4 px below its host's edge, beside the event: right first, then left (story 2.30).
  for (const b of boundaries){
    if (!b.name) continue;
    const c = box[b.id], size = measure(textOf(b));
    const places = [[c.cx + c.w / 2 + 2, c.cy + 4, size.w, size.h], [c.cx - c.w / 2 - 2 - size.w, c.cy + 4, size.w, size.h], ...labelPlaces(c, size, false)];
    const place = bestPlace(places, [...symbols.filter(x => x !== di.nodes[b.id]), ...segments, ...taken]);
    const [x, y, w, h] = place;
    di.labels[b.id] = [R(x + w / 2 - Math.max(LABEL_WIDTH, w) / 2), R(y), Math.max(LABEL_WIDTH, w), R(h)];
    taken.push(place);
    takenPool.push(poolOf.get(b.id));
    owners.push({ boxes: [place, di.labels[b.id]], anchor: box[b.id] });
  }
  // A middle piece of a flow that runs upright through a foreign flow's label moves aside, LABEL_CLEARANCE beside the
  // label, the nearer side first, where it and its neighbours then touch no symbol and no label and cross no more
  // flows than before (Ben, 2026-10-07, p-rs1: "Kollision durch mehr Abstand behoben"; the label stays beside its own
  // flow). Its ends at the symbols stay.
  {
    const crossesOf = (a, b, skip) => {
      let n = 0;
      for (const o of routes){
        if (o === skip) continue;
        for (let i = 1; i < o.pts.length; i++){
          const c = o.pts[i - 1], d = o.pts[i];
          const [h, v] = Math.abs(a.y - b.y) < 1 ? [[a, b], [c, d]] : [[c, d], [a, b]];
          if (Math.abs(h[0].y - h[1].y) >= 1 || Math.abs(v[0].x - v[1].x) >= 1) continue;
          if (v[0].x > Math.min(h[0].x, h[1].x) && v[0].x < Math.max(h[0].x, h[1].x) && h[0].y > Math.min(v[0].y, v[1].y) && h[0].y < Math.max(v[0].y, v[1].y)) n++;
        }
      }
      return n;
    };
    const hitsBox = (a, b, boxes) => boxes.some(q => Math.max(a.x, b.x) > q[0] - 1 && Math.min(a.x, b.x) < q[0] + q[2] + 1 && Math.max(a.y, b.y) > q[1] - 1 && Math.min(a.y, b.y) < q[1] + q[3] + 1);
    const nearLine = (a, b, skip) => routes.some(o => o !== skip && o.pts.slice(1).some((d, i) => { const c = o.pts[i]; return Math.abs(c.x - d.x) < 1 && Math.abs(c.x - a.x) < LABEL_CLEARANCE / 2 && Math.min(Math.max(c.y, d.y), Math.max(a.y, b.y)) > Math.max(Math.min(c.y, d.y), Math.min(a.y, b.y)); }));
    for (const lab of routes.filter(r => r.f.name && di.flowLabels[r.f.id])){
      const L = di.flowLabels[lab.f.id];
      for (const r of routes){
        if (r === lab) continue;
        for (let k = 2; k < r.pts.length - 1; k++){
          const a = r.pts[k - 1], b = r.pts[k];
          if (Math.abs(a.x - b.x) >= 1 || !hitsBox(a, b, [L])) continue;
          const pre = r.pts[k - 2], post = r.pts[k + 1], before = [[pre, a], [a, b], [b, post]].reduce((n, [c, d]) => n + crossesOf(c, d, r), 0);
          const others = [...taken, ...symbols];
          const xs = [L[0] - LABEL_CLEARANCE, L[0] + L[2] + LABEL_CLEARANCE].sort((p, q) => Math.abs(p - a.x) - Math.abs(q - a.x));
          for (const x of xs){
            const a2 = { x, y: a.y }, b2 = { x, y: b.y };
            const pieces = [[pre, a2], [a2, b2], [b2, post]];
            // The neighbours keep their ends: a symbol at one of them does not block.
            const blocked = hitsBox(a2, b2, others) || hitsBox(pre, a2, others.filter(q => !hitsBox(pre, pre, [q]))) || hitsBox(b2, post, others.filter(q => !hitsBox(post, post, [q])));
            if (blocked || nearLine(a2, b2, r) || pieces.reduce((n, [c, d]) => n + crossesOf(c, d, r), 0) > before) continue;
            a.x = x; b.x = x;
            di.flows[r.f.id] = r.pts.map(q => [R(q.x), R(q.y)]);
            break;
          }
        }
      }
    }
    segments.length = 0;
    segments.push(...routes.flatMap(r => r.pts.slice(1).map((q, i) => segmentBox(r.pts[i], q))));
  }
  // The text annotations (story 2.31), each beside the partner of its first association, after the labels, keeping
  // off every symbol, piece of a flow, label and text annotation placed before it, its association off symbols and
  // labels: the first free place of notePlaces() in the rounds NOTE_ROUNDS; where none is free, at the border of its
  // partner's lane, which grows there. A text annotation at a pool stands right of its frame, once that is done.
  const notes = model.notes || [], assocs = model.associations || [];
  const notePool = new Map();
  // Per text annotation at a flow the point it was placed for, relative to its box: the association ends on the flow
  // nearest that point, wherever lanes and pools have moved the two since.
  const aimOf = new Map();
  let stripes = false;
  if (notes.length){
    di.notes = byId(); di.associations = byId();
    const nodeOf = new Map([...model.nodes, ...boundaries].map(n => [n.id, n]));
    const routeOf = new Map(routes.map(r => [r.f.id, r]));
    const kindOf = id => { const t = nodeOf.get(id).type; return t === 'task' ? 'rect' : t === 'gateway' ? 'diamond' : 'circle'; };
    const lanesAll = () => model.lanes.map(l => laneBox[l.key]);
    const ay = a => 'cy' in a ? a.cy : a.y;
    // Moves down by d everything at or below cut: lanes (the one cut runs through grows, or grow: the lane whose
    // border it is), symbols, flows, labels and their owners, text annotations placed, black boxes; extra: points of
    // no flow that move with them.
    const openStripe = (cut, d, extra, grow = null) => {
      stripes = true;
      const before = owners.map(o => ay(o.anchor));
      for (const b of lanesAll()){ if (b === grow) b[3] += d; else if (b[1] >= cut) b[1] += d; else if (b[1] + b[3] > cut) b[3] += d; }
      for (const c of Object.values(box)) if (c.cy >= cut) c.cy += d;
      const moved = new Set();
      for (const o of routes){
        for (const q of o.pts) if (q.y >= cut && !moved.has(q)){ moved.add(q); q.y += d; }
        for (const ob of o.obstacles || []) if ((ob.y1 + ob.y2) / 2 >= cut && !moved.has(ob)){ moved.add(ob); ob.y1 += d; ob.y2 += d; }
      }
      for (const q of [...owners.map(o => o.anchor).filter(a => !('cy' in a)), ...extra]) if (q.y >= cut && !moved.has(q)){ moved.add(q); q.y += d; }
      owners.forEach((o, i) => { const m = ay(o.anchor) - before[i]; if (m) for (const b of o.boxes) b[1] += m; });
      model.pools.forEach(p => { if (p.box && di.pools[p.id][1] >= cut) di.pools[p.id][1] += d; });
      // A pool with lanes is as high as its lanes, and the edges the text annotations keep off follow its frame.
      model.pools.forEach((p, i) => {
        if (!p.id || p.box) return;
        const ls = model.lanes.filter(l => (l.pool ?? 0) === i).map(l => laneBox[l.key]), top = Math.min(...ls.map(b => b[1]));
        di.pools[p.id][1] = top; di.pools[p.id][3] = Math.max(...ls.map(b => b[1] + b[3])) - top;
      });
      edges.splice(0, edges.length, ...Object.values(di.pools).flatMap(frameEdges));
      for (const n of [...model.nodes, ...boundaries]){ const { cx, cy, w, h } = box[n.id]; di.nodes[n.id][0] = R(cx - w / 2); di.nodes[n.id][1] = R(cy - h / 2); }
      segments.length = 0;
      segments.push(...routes.flatMap(r => r.pts.slice(1).map((q, i) => segmentBox(r.pts[i], q))));
    };
    const add = (n, place, anchor) => {
      di.notes[n.id] = place;
      taken.push(place);
      takenPool.push(n.pool ?? null);
      owners.push({ boxes: [place], anchor });
    };
    for (const n of notes){
      notePool.set(n.id, n.pool ?? undefined);
      const size = noteSize(n.text, measure), a = assocs.find(x => x.note === n.id);
      if (a.kind === 'pool') continue;
      // At a flow: points on it, the middles of its horizontal pieces first, longest first, then of the others; on a
      // piece longer than 160 px also a quarter in from either end.
      const anchors = [];
      if (a.kind === 'flow' || a.kind === 'message'){
        const pts = routeOf.get(a.partner).pts;
        const pieces = pts.slice(1).map((q, i) => ({ p: pts[i], q, len: Math.abs(pts[i].x - q.x) + Math.abs(pts[i].y - q.y), level: Math.abs(pts[i].y - q.y) < 1 }))
          .sort((u, v) => (v.level - u.level) || v.len - u.len);
        for (const pc of pieces) for (const t of pc.len > 160 ? [0.5, 0.25, 0.75] : [0.5]) anchors.push({ x: R(pc.p.x + (pc.q.x - pc.p.x) * t), y: R(pc.p.y + (pc.q.y - pc.p.y) * t), level: pc.level });
      } else anchors.push(box[a.partner]);
      const centre = an => 'cy' in an ? an : { cx: an.x, cy: an.y, w: 0, h: 0 };
      const shape = an => 'cy' in an ? { kind: kindOf(a.partner), cx: an.cx, cy: an.cy, w: an.w, h: an.h } : { kind: 'point', cx: an.x, cy: an.y, w: 0, h: 0 };
      const others = () => [...symbols.filter(b => !nodeOf.has(a.partner) || b !== di.nodes[a.partner]), ...taken];
      // A flow's own pieces are where its association ends.
      const foreign = () => nodeOf.has(a.partner) ? segments : routes.filter(r => r.f.id !== a.partner).flatMap(r => r.pts.slice(1).map((q, i) => segmentBox(r.pts[i], q)));
      // Free: the box NOTE_CLEAR off everything (its bracket on a flow's line reads as one line with it), its association
      // through no symbol, label or text annotation and along no flow; crossing none, where the round has such a place.
      // One at a message flow belongs to no pool, and no frame grows around it: it keeps off the pools' frames, as a
      // message flow's label (review of 2.31: one lay across two frames); the frame of a pool grows around its own.
      const offFrames = n.pool != null ? () => true : place => covered(place, edges) === 0;
      // Nor does it lie on the border between two lanes (review of 2.31, demo-notizen: one's lower edge on it): a line
      // 1 px either side, as wide as anything, since the lanes widen later to whatever stands beside them.
      const borders = model.lanes.slice(1).flatMap((l, i) => {
        const above = model.lanes[i];
        return (above.pool ?? 0) === (l.pool ?? 0) && !(above.synthetic && l.synthetic) ? [[-1e6, laneBox[l.key][1] - 1, 2e6, 2]] : [];
      });
      const clear = (place, an, crossing) => { const way = associationWay(place, shape(an)); return covered(place, [...symbols, ...segments, ...taken, ...borders], NOTE_CLEAR) === 0 && offFrames(place) && !wayHits(way, others()) && !wayAlong(way, foreign()) && (crossing || !wayTouches(way, foreign())); };
      let place = null, anchor = anchors[0];
      rounds: for (const far of NOTE_ROUNDS) for (const crossing of [false, true]) for (const an of anchors){
        place = notePlaces(centre(an), size, far).find(p => clear(p, an, crossing));
        if (place){ anchor = an; break rounds; }
      }
      // At the border of the partner's lane, which grows there by a stripe across the pools (everything beyond moves
      // away): above first, below first for an event on an activity's lower edge. The first
      // place whose association keeps off symbols, labels, text annotations and flows within the lane, and that no
      // flow crosses the stripe at; else the one with the fewest of these faults, the nearest first.
      if (!place){
        const below = a.kind === 'boundary';
        let first = null, least = Infinity;
        for (const down of [below, !below]) for (const an of anchors){
          if (place) break;
          const c = centre(an), lane = lanesAll().find(b => b[1] <= c.cy && c.cy <= b[1] + b[3]);
          if (!lane) continue;
          const cut = down ? lane[1] + lane[3] : lane[1];
          const inLane = b => b[1] + b[3] / 2 >= lane[1] && b[1] + b[3] / 2 <= lane[1] + lane[3];
          const step = size.w + 10;
          const xs = [c.cx + c.w / 2 + 10, c.cx + 10, c.cx - size.w / 2, c.cx - 10 - size.w].concat([1, -1, 2, -2].map(k => c.cx - size.w / 2 + k * step));
          for (const x of xs){
            // In the stripe, NOTE_GAP / 2 below the border.
            const p = [R(x), R(cut + NOTE_GAP / 2), size.w, size.h];
            const try_ = { p, an, lane, cut, down };
            // What reaches across the border stays where it is, in the stripe: a vertical piece of a flow, a label, a text
            // annotation.
            const crossing = segments.some(sg => sg[3] > 0 && sg[1] < cut && sg[1] + sg[3] > cut && sg[0] >= p[0] - 3 && sg[0] <= p[0] + p[2] + 3);
            const onBox = taken.some(b => b[1] < cut && b[1] + b[3] > cut && b[0] < p[0] + p[2] && b[0] + b[2] > p[0]);
            // The way as it will be: above, the partner moves down with the stripe.
            const shifted = down ? p : [p[0], p[1] - size.h - NOTE_GAP, p[2], p[3]];
            const way = associationWay(shifted, shape(an));
            // Lying on a label or a text annotation is worst.
            const faults = (onBox ? 5 : 0) + (crossing ? 1 : 0) + (wayHits(way, others().filter(inLane)) ? 1 : 0) + (wayAlong(way, foreign().filter(inLane)) ? 1 : 0);
            if (!faults){ place = try_; break; }
            if (faults < least){ least = faults; first = try_; }
          }
        }
        const t = place || first;
        if (t){
          anchor = t.an;
          const d = size.h + NOTE_GAP;
          openStripe(t.cut, d, 'cy' in anchor ? [] : [anchor], t.lane);
          place = t.p;
        } else place = bestPlace(NOTE_ROUNDS.flatMap(far => notePlaces(centre(anchor), size, far)), [...symbols, ...segments, ...taken]);
      }
      if (!('cy' in anchor)) aimOf.set(n.id, { dx: anchor.x - place[0], dy: anchor.y - place[1] });
      add(n, place, anchor);
    }
  }

  // A lane a label reaches out of grows, and what lies beyond moves, each
  // label with its owner.
  // A black box keeps its distance to the lanes of the pool below it, or, with none below, of the pool above, while
  // lanes grow for labels (story 2.29): growLane() moves lanes, symbols and flows, not a box's frame.
  const laneEdge = (j, top) => { const ls = model.lanes.filter(l => (l.pool ?? 0) === j).map(l => laneBox[l.key]); return top ? Math.min(...ls.map(b => b[1])) : Math.max(...ls.map(b => b[1] + b[3])); };
  const anchors = model.pools.map((p, k) => {
    if (!p.box) return null;
    let j = model.pools.findIndex((q, i) => i > k && !q.box), top = true;
    if (j < 0){ top = false; for (let i = k - 1; i >= 0; i--) if (!model.pools[i].box){ j = i; break; } }
    return { j, top, d: di.pools[p.id][1] - laneEdge(j, top) };
  });
  const room = labelRoom(owners, model.lanes.map(l => laneBox[l.key]), box, routes);
  if (room.up || room.down || stripes){
    for (const n of [...model.nodes, ...boundaries]){ const { cx, cy, w, h } = box[n.id]; di.nodes[n.id] = [R(cx - w / 2), R(cy - h / 2), w, h]; }
    for (const { f, pts } of routes) di.flows[f.id] = pts.map(p => [R(p.x), R(p.y)]);
    model.pools.forEach((p, k) => { const a = anchors[k]; if (a) di.pools[p.id][1] = laneEdge(a.j, a.top) + a.d; });
  }

  // Flows routed in the outer channels, and labels, can lie beyond the lanes:
  // the outer lanes of each pool grow until every waypoint of its sequence
  // flows and every label of its own lies inside, FRAME_MARGIN from the edge
  // (the top lane up, the bottom lane down, every lane left and right, as far
  // as the pool that needs most). The top pool grows upwards; a pool below
  // moves down, and with it everything below its top. The frame of a pool is
  // every lane of it, the synthetic ones included: a lane without an id keeps
  // its row.
  const M = FRAME_MARGIN;
  const lanesOf = i => model.lanes.filter(l => (l.pool ?? 0) === i).map(l => laneBox[l.key]);
  const framed = i => model.pools[i].id || model.lanes.some(l => (l.pool ?? 0) === i && !l.synthetic);
  const pointsOf = i => {
    const xs = [], ys = [];
    for (const f of model.flows) if (poolOf.get(f.from) === i) for (const [x, y] of di.flows[f.id]){ xs.push(x); ys.push(y); }
    taken.forEach(([x, y, w, h], k) => { if (takenPool[k] === i){ xs.push(x, x + w); ys.push(y, y + h); } });
    return { xs, ys };
  };
  const pools = model.pools.map((p, i) => i).filter(i => framed(i) && !model.pools[i].box);
  // The top pool may be a black box, which does not grow; a pool below it moves down as any other (story 2.29).
  const topmost = model.pools.findIndex((p, i) => framed(i));
  let west = 0, east = 0;
  for (const i of pools){
    const { xs } = pointsOf(i), frame = lanesOf(i);
    const left = Math.min(...frame.map(b => b[0])), right = Math.max(...frame.map(b => b[0] + b[2]));
    west = Math.max(west, R(left - (Math.min(...xs) - M))); east = Math.max(east, R(Math.max(...xs) + M - right));
  }
  // Moves down by dy what belongs to a pool own() names, and what belongs to no pool (the message flows) at or
  // below y0: symbols, labels, lanes, the points of every flow.
  const flowPool = new Map(model.flows.map(f => [f.id, poolOf.get(f.from)]));
  // The places of the labels of events and gateways kept in taken, which pointsOf() reads, are arrays of their own
  // beside di.labels and move with them; a flow's label and a text annotation share their array with taken and move
  // once (review of 2.31: a pool further down grew for where its labels had been).
  const shift = (dy, own, y0) => {
    const moves = (k, y) => k === undefined ? y >= y0 : own(k);
    const moved = new Set();
    for (const [id, b] of [...Object.entries(di.nodes), ...Object.entries(di.labels)]) if (moves(poolOf.get(id), b[1])) b[1] += dy;
    for (const [id, b] of Object.entries(di.flowLabels)){ moved.add(b); if (moves(flowPool.get(id), b[1])) b[1] += dy; }
    for (const [id, b] of Object.entries(di.notes || {})){ moved.add(b); if (moves(notePool.get(id), b[1])) b[1] += dy; }
    taken.forEach((b, k) => { if (!moved.has(b) && moves(takenPool[k] ?? undefined, b[1])) b[1] += dy; });
    for (const l of model.lanes) if (own(l.pool ?? 0)) laneBox[l.key][1] += dy;
    model.pools.forEach((p, k) => { if (p.box && own(k)) di.pools[p.id][1] += dy; });
    for (const [id, way] of Object.entries(di.flows)) for (const p of way) if (moves(flowPool.get(id), p[1])) p[1] += dy;
  };
  for (const i of pools){
    const { ys } = pointsOf(i), frame = lanesOf(i);
    const top = Math.min(...frame.map(b => b[1])), bottom = Math.max(...frame.map(b => b[1] + b[3]));
    const up = Math.max(0, R(top - (Math.min(...ys) - M))), down = Math.max(0, R(Math.max(...ys) + M - bottom));
    // The top lane grows up; below the top pool, this pool and those below move down by as much instead.
    if (up && i !== topmost) shift(up, k => k >= i, top);
    const now = i !== topmost ? top + up : top;
    if (up) for (const b of frame) if (b[1] === now){ b[1] -= up; b[3] += up; }
    // The bottom lane grows down; what lies below moves down.
    if (down){ shift(down, k => k > i, bottom + (i !== topmost ? up : 0)); for (const b of frame) if (b[1] + b[3] === bottom + (i !== topmost ? up : 0)) b[3] += down; }
  }
  if (pools.length) for (const b of Object.values(laneBox)){ b[0] -= west; b[2] += west + east; }
  // Each pool around its lanes, its head left of them.
  // A black box as wide as the lanes, with a head as theirs; it keeps its band's height (story 2.29).
  const lanesAll = Object.values(laneBox);
  model.pools.forEach((p, i) => {
    if (!p.id) return;
    if (p.box){
      const left = Math.min(...lanesAll.map(b => b[0])) - HEAD, right = Math.max(...lanesAll.map(b => b[0] + b[2]));
      di.pools[p.id] = [left, di.pools[p.id][1], right - left, di.pools[p.id][3]];
      return;
    }
    const frame = lanesOf(i);
    const top = Math.min(...frame.map(b => b[1])), bottom = Math.max(...frame.map(b => b[1] + b[3]));
    const left = Math.min(...frame.map(b => b[0])) - HEAD, right = Math.max(...frame.map(b => b[0] + b[2]));
    di.pools[p.id] = [left, top, right - left, bottom - top];
  });
  // A message flow's end at a pool lies on the edge of its frame facing the way (story 2.29), however the pools grew
  // and moved.
  for (const m of model.messages || []) for (const [k, at] of [['fromPool', 0], ['toPool', -1]]){
    if (m[k] === undefined) continue;
    const pts = di.flows[m.id], [, y, , h] = di.pools[model.pools[m[k]].id];
    const end = pts.at(at), next = pts.at(at === 0 ? 1 : -2);
    end[1] = next[1] < y ? y : y + h;
  }

  // A text annotation at a pool right of its frame, beside its top, several below each other; then every
  // association from its text annotation to where its partner now stands. One stack over all pools, top to bottom,
  // those of a pool in the order of the XML (review of 2.31): each starts beside its pool's top, or 8 px below the one
  // placed before it where that reaches further down, so that those of two pools close together (two black boxes)
  // never overlap.
  if (notes.length){
    const poolAt = id => model.pools.findIndex(p => p.id === id);
    const atPools = notes.map(n => [n, assocs.find(x => x.note === n.id)]).filter(([, a]) => a && a.kind === 'pool')
      .sort(([, a], [, b]) => poolAt(a.partner) - poolAt(b.partner));
    let next = -Infinity;
    for (const [n, a] of atPools){
      const [x, y, w] = di.pools[a.partner], size = noteSize(n.text, measure), at = Math.max(y, next);
      di.notes[n.id] = [x + w + NOTE_GAP, at, size.w, size.h];
      next = at + size.h + 8;
    }
    const kindOf = id => { const t = model.nodes.find(n => n.id === id)?.type; return t === 'task' ? 'rect' : t === 'gateway' ? 'diamond' : 'circle'; };
    for (const a of assocs){
      const nb = di.notes[a.note];
      let s;
      if (a.kind === 'flow' || a.kind === 'message'){
        const aim = aimOf.get(a.note), at = aim && assocs.find(x => x.note === a.note) === a ? [nb[0] + aim.dx, nb[1] + aim.dy] : [nb[0] + nb[2] / 2, nb[1] + nb[3] / 2];
        const p = nearestOnFlow(di.flows[a.partner].map(([x, y]) => ({ x, y })), ...at);
        s = { kind: 'point', cx: p.x, cy: p.y, w: 0, h: 0 };
      } else {
        const [x, y, w, h] = a.kind === 'pool' ? di.pools[a.partner] : di.nodes[a.partner];
        s = { kind: a.kind === 'pool' ? 'rect' : kindOf(a.partner), cx: x + w / 2, cy: y + h / 2, w, h };
      }
      // Its waypoints run from its source to its target.
      const way = associationWay(nb, s);
      di.associations[a.id] = a.toNote ? way.reverse() : way;
    }
  }
}

// ---------- the diagram part ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The text with every comment, CDATA section and processing instruction blanked
// out, each character a blank, so that every place stays where it was: a tag or
// an id written in one is not the XML's. The parser takes a PI after the root
// as well, so a closing definitions tag in it must not catch the diagram part.
// src/app/bpmn.js and src/app/live-viewer.js ask it of XML no parser has seen.
// A walk with indexOf, not a pattern: a lazy pattern ran to the end of the text
// for every opening without its end, quadratic in time ('<!--' a thousand
// times; security review of 2026-10-07). Here an end that is not found once is
// not looked for again: none can follow.
const NOT_MARKUP = [['<!--', '-->'], ['<![CDATA[', ']]>'], ['<?', '?>']];
export function maskNotMarkup(text){
  const next = NOT_MARKUP.map(() => -2); // per kind its next opening at or after i; -1 none
  let out = '', i = 0;
  for (;;){
    let kind = -1;
    for (let k = 0; k < NOT_MARKUP.length; k++){
      if (next[k] !== -1 && next[k] < i) next[k] = text.indexOf(NOT_MARKUP[k][0], i);
      if (next[k] !== -1 && (kind === -1 || next[k] < next[kind])) kind = k;
    }
    if (kind === -1) return out + text.slice(i);
    const [open, close] = NOT_MARKUP[kind], start = next[kind];
    const end = text.indexOf(close, start + open.length);
    if (end === -1){ next[kind] = -1; continue; }
    out += text.slice(i, start) + ' '.repeat(end + close.length - start);
    i = end + close.length;
  }
}

// The lane set as the layout placed the nodes (spike 2.26, Ben, 2026-10-05): a
// node a rule put in another lane (R1, R12) would otherwise stay in the
// author's. Per node the lane di.laneOf names, the one it stands in on the
// grid; where that differs from the author's, every lane but it and its outer
// lanes loses the node's flowNodeRef, and it gets one before its closing tag
// (an empty lane between its tags, a self-closing one opened). Otherwise the
// text stays as written. Comments, CDATA and PIs do not count.
function relane(text, model, di){
  const masked = maskNotMarkup(text);
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
  // The content is taken whole and trimmed after: blanks matched around a lazy
  // middle made a long run of blanks backtrack in cubic time (security review
  // of 2026-10-07).
  const refs = [...masked.matchAll(/([ \t]*)<((?:[\w.-]+:)?)flowNodeRef\b(?:"[^"]*"|'[^']*'|[^'">/])*>([^<]*)<\/(?:[\w.-]+:)?flowNodeRef\s*>[ \t]*\r?\n?/g)]
    .map(m => ({ start: m.index, end: m.index + m[0].length, indent: m[1], prefix: m[2], id: m[3].trim(), lane: inLane(m.index) }));
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

// The collaboration readProcess() made for processes without one (model.insert),
// inserted before the first process tag, with that tag's prefix and
// indentation, a participant per process; comments, CDATA and PIs do not count.
function insertCollaboration(text, model){
  if (!model.insert) return text;
  const masked = maskNotMarkup(text);
  const m = /<((?:[\w.-]+:)?)process\b/.exec(masked);
  if (!m) return text;
  const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
  const indent = /^[ \t]*$/.test(text.slice(lineStart, m.index)) ? text.slice(lineStart, m.index) : '';
  const at = indent || lineStart === m.index ? lineStart : m.index;
  const pre = m[1], c = model.insert;
  const put = indent + '<' + pre + 'collaboration id="' + esc(c.id) + '">\n' +
    c.participants.map(p => indent + '  <' + pre + 'participant id="' + esc(p.id) + '"' + (p.name ? ' name="' + esc(p.name) + '"' : '') + ' processRef="' + esc(p.process) + '"/>\n').join('') +
    indent + '</' + pre + 'collaboration>\n';
  return text.slice(0, at) + put + text.slice(at);
}

// The author's XML with the diagram part inserted before its last closing
// definitions tag, whatever its prefix; everything else, and whatever
// follows that tag, stays as written, but for the lane set where a node
// stands in another lane on the grid (relane()), and the collaboration
// inserted where processes have none (insertCollaboration()). The BPMNDiagram declares
// the bpmndi, dc and di namespaces itself. Its ids are made unique against
// every id of the XML. di: what layoutGeometry() returned. Returns { xml,
// diagram }: the XML and the id of the inserted BPMNDiagram, which bpmn-js is
// told to open, since it opens the first diagram, and that may be an empty
// one of the author's.
// options: mergeMarker, true unless the X of a merging exclusive gateway is
// left off. bpmn-js draws the X only with isMarkerVisible="true", so every
// exclusive gateway gets it by default; with false, a merge (two or more flows
// in, at most one out, counted in the author's model, so a flow from a
// boundary event counts at the event) gets none and is drawn as an empty
// diamond, as Ben laid out by hand and finds easier to read. Both are valid
// BPMN 2.0 and mean the same; the Camunda Modeler turns the X back on by hand.
// Not a rule of DEFAULT_RULES: the geometry stays the same.
export function appendDiagram(xml, model, di, { mergeMarker = true } = {}){
  const text = insertCollaboration(relane(String(xml), model, di), model);
  // Comments, CDATA sections and PIs are blanked out first: a closing tag or an
  // id written in one is not the XML's.
  const masked = maskNotMarkup(text);
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
  for (const p of model.pools) if (p.id && di.pools[p.id]) out += shape(p.id, di.pools[p.id], ' isHorizontal="true"');
  for (const l of model.lanes) if (!l.synthetic) out += shape(l.id, di.lanes[l.id], ' isHorizontal="true"');
  const count = (end, id) => model.flows.filter(f => f[end] === id).length;
  const marker = n => n.tag === 'exclusiveGateway' && (mergeMarker || count('to', n.id) < 2 || count('from', n.id) > 1);
  for (const n of model.nodes) out += shape(n.id, di.nodes[n.id], marker(n) ? ' isMarkerVisible="true"' : '', di.labels[n.id]);
  for (const b of model.boundaries || []) out += shape(b.id, di.nodes[b.id], '', di.labels[b.id]);
  for (const n of model.notes || []) out += shape(n.id, di.notes[n.id]);
  for (const f of model.flows){
    out += '      <bpmndi:BPMNEdge id="' + esc(fresh(f.id + '_di')) + '" bpmnElement="' + esc(f.id) + '">' +
      di.flows[f.id].map(p => '<di:waypoint x="' + p[0] + '" y="' + p[1] + '"/>').join('') + label(di.flowLabels[f.id]) + '</bpmndi:BPMNEdge>\n';
  }
  for (const f of model.messages || []){
    out += '      <bpmndi:BPMNEdge id="' + esc(fresh(f.id + '_di')) + '" bpmnElement="' + esc(f.id) + '">' +
      di.flows[f.id].map(p => '<di:waypoint x="' + p[0] + '" y="' + p[1] + '"/>').join('') + label(di.flowLabels[f.id]) + '</bpmndi:BPMNEdge>\n';
  }
  for (const a of model.associations || []){
    out += '      <bpmndi:BPMNEdge id="' + esc(fresh(a.id + '_di')) + '" bpmnElement="' + esc(a.id) + '">' +
      di.associations[a.id].map(p => '<di:waypoint x="' + p[0] + '" y="' + p[1] + '"/>').join('') + '</bpmndi:BPMNEdge>\n';
  }
  out += '    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n';
  return { xml: text.slice(0, at) + out + text.slice(at), diagram };
}
