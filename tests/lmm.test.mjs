// LMM, the columns of BPMN without coordinates, run in Node: no browser.
//
//   npm test          (node --test tests/*.test.mjs)
//   DOKUFIX_LMM_ROUNDS=10 node --test tests/lmm.test.mjs
//                     the invariance with ten reorderings and ten renamings
//                     per fixture instead of one each (about 20 s a round)
//
// src/app/lmm.js gives every flow node its column (lmm()) and the layout the
// model in its order (kanonisch()). The cases:
//   - one per rule of its comment: a lane is the unit, a flow within a lane
//     and into another, a flow back, the order among equals (the way that
//     reaches more, then the flow's name, the node's name, the id), a boundary
//     event's flows from its host, none from a host into its own event, no
//     column for a flow's name, no column from message flows, text
//     annotations or an empty lane;
//   - kanonisch(): the lists in LMM's order, the text annotations by the kind
//     and the place of their partner, those at a pool by pool, the message
//     flows and associations by their ends, lanes and pools as they were;
//   - the invariance: for every fixture, the finished diagram part is the
//     same when the XML is reordered where the order has no meaning (flow
//     nodes, boundary events, sequence flows, flowNodeRef, text annotations,
//     associations, message flows; lanes and pools keep theirs) and when the
//     ids are renamed. The reorderings and new ids come from a fixed seed, so
//     a failure comes again.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { DOMParser } from 'linkedom';
import { readProcess, layoutGeometry, appendDiagram } from '../src/app/bpmn-layout.js';
import { parseXml } from '../src/app/xml-parser.js';
import { lmm, kanonisch, lmmPositions, LMM_MERMAID_VERSION } from '../src/app/lmm.js';
import { fixtureNames, readFixture, readModel, expectedFile } from './bpmn-fixtures.mjs';
import { readDiagram } from './bpmn-rules.mjs';

const NS = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"';
const xmlOf = body => '<bpmn:definitions ' + NS + ' id="D" targetNamespace="http://example.org/dokufix">' + body + '</bpmn:definitions>';
const read = xml => readProcess(parseXml(xml)).model;
// A process from its lanes ({ lane: 'id …' }, or one string for a process without lanes) and the rest of its body.
const processOf = (lanes, body, id = 'P') => '<bpmn:process id="' + id + '">' + (typeof lanes === 'string' ? '' : '<bpmn:laneSet id="LS_' + id + '">' +
  Object.entries(lanes).map(([lane, ids]) => '<bpmn:lane id="' + lane + '">' + ids.split(' ').filter(Boolean).map(n => '<bpmn:flowNodeRef>' + n + '</bpmn:flowNodeRef>').join('') + '</bpmn:lane>').join('') +
  '</bpmn:laneSet>') + body + '</bpmn:process>';
const el = (tag, id, name) => '<bpmn:' + tag + ' id="' + id + '"' + (name ? ' name="' + name + '"' : '') + '/>';
const flow = (id, from, to, name) => '<bpmn:sequenceFlow id="' + id + '" sourceRef="' + from + '" targetRef="' + to + '"' + (name ? ' name="' + name + '"' : '') + '/>';
// The rank per node id.
const ranksOf = model => { const r = lmm(model); return Object.fromEntries(model.nodes.map(n => [n.id, r[n.key]])); };

// ---------- the columns ----------
test('a lane is the unit: two nodes of one lane never share a column, nodes of two lanes may', () => {
  const r = ranksOf(read(xmlOf(processOf({ L1: 'S A B', L2: 'C' }, el('startEvent', 'S') + el('task', 'A') + el('task', 'B') + el('task', 'C') +
    flow('F1', 'S', 'A') + flow('F2', 'S', 'B') + flow('F3', 'S', 'C')))));
  assert.notEqual(r.A, r.B, 'A and B, both after S in one lane');
  assert.deepEqual([r.S, Math.min(r.A, r.B), Math.max(r.A, r.B)], [0, 1, 2]);
  assert.equal(r.C, r.S, 'C in another lane, in the column of S');
});

test('a flow within a lane puts its target a column further; one into another lane allows the same column', () => {
  const r = ranksOf(read(xmlOf(processOf({ L1: 'S A', L2: 'B E' }, el('startEvent', 'S') + el('task', 'A') + el('task', 'B') + el('endEvent', 'E') +
    flow('F1', 'S', 'A') + flow('F2', 'A', 'B') + flow('F3', 'B', 'E')))));
  assert.deepEqual(r, { S: 0, A: 1, B: 1, E: 2 });
});

test('a flow back, found by the depth-first search, counts the other way round: it pushes nothing', () => {
  const body = el('startEvent', 'S') + el('task', 'A') + el('task', 'B') + el('exclusiveGateway', 'G') + el('endEvent', 'E') +
    flow('F1', 'S', 'A') + flow('F2', 'A', 'B') + flow('F3', 'B', 'G') + flow('Zurueck', 'G', 'A', 'nochmal') + flow('F4', 'G', 'E');
  assert.deepEqual(ranksOf(read(xmlOf(processOf('', body)))), { S: 0, A: 1, B: 2, G: 3, E: 4 });
  // In the walk the way back stands where the search met it: out of G, and first there, since A reaches more than E.
  assert.deepEqual(kanonisch(read(xmlOf(processOf('', body)))).model.flows.map(f => f.id), ['F1', 'F2', 'F3', 'Zurueck', 'F4']);
});

// A split in one lane with two ways; the way first in the order takes the nearer column.
const split = (a, b) => xmlOf(processOf('', el('startEvent', 'S') + el('exclusiveGateway', 'G') + a + b + flow('F0', 'S', 'G')));

test('among equals the way that reaches more goes first: the main way before the short exception, whatever the names and the XML say', () => {
  const kurz = el('endEvent', 'Aus', 'Abbruch') + flow('FK', 'G', 'Aus', 'abbrechen');
  const lang = el('task', 'Weiter', 'Zuletzt') + el('task', 'Z') + el('endEvent', 'E') + flow('FL', 'G', 'Weiter', 'weiter') + flow('FZ', 'Weiter', 'Z') + flow('FE', 'Z', 'E');
  for (const xml of [split(kurz, lang), split(lang, kurz)]){
    const r = ranksOf(read(xml));
    assert.deepEqual([r.Weiter, r.Aus], [2, 3]);
  }
  // So do the nodes nothing flows into, within their lane.
  const starts = xmlOf(processOf('', el('startEvent', 'A1', 'Aaa') + el('endEvent', 'A2') + el('startEvent', 'B1', 'Bbb') + el('task', 'B2') + el('endEvent', 'B3') +
    flow('FA', 'A1', 'A2') + flow('FB', 'B1', 'B2') + flow('FC', 'B2', 'B3')));
  const r = ranksOf(read(starts));
  assert.ok(r.B1 < r.A1, JSON.stringify(r));
});

test('among ways that reach as much: the flow\'s name, then the node\'s name, then the id', () => {
  const way = (id, name, flowName, end) => el('task', id, name) + el('endEvent', end) + flow('F' + id, 'G', id, flowName) + flow('E' + id, id, end);
  const first = xml => { const r = ranksOf(read(xml)); return r.a < r.b ? 'a' : 'b'; };
  // The flow's name: "ja" before "nein", though the node's name and the id say otherwise.
  assert.equal(first(split(way('a', 'Anfang', 'nein', 'E1'), way('b', 'Zuletzt', 'ja', 'E2'))), 'b');
  assert.equal(first(split(way('b', 'Zuletzt', 'ja', 'E2'), way('a', 'Anfang', 'nein', 'E1'))), 'b');
  // No flow names: the node's name, "Alpha" before "Beta", though the id says otherwise.
  assert.equal(first(split(way('a', 'Beta', '', 'E1'), way('b', 'Alpha', '', 'E2'))), 'b');
  assert.equal(first(split(way('b', 'Alpha', '', 'E2'), way('a', 'Beta', '', 'E1'))), 'b');
  // Nothing but the ids: the smaller first, in either order of the XML; a renaming can change it.
  assert.equal(first(split(way('a', '', '', 'E1'), way('b', '', '', 'E2'))), 'a');
  assert.equal(first(split(way('b', '', '', 'E2'), way('a', '', '', 'E1'))), 'a');
});

const LINE = el('startEvent', 'S') + el('task', 'T') + el('endEvent', 'E') + flow('F1', 'S', 'T') + flow('F2', 'T', 'E');

test('a flow from a boundary event leaves its host; one from the event back into its host sets nothing', () => {
  const body = LINE + '<bpmn:boundaryEvent id="B" attachedToRef="T"/>' + el('task', 'M') + flow('FB', 'B', 'M');
  const model = read(xmlOf(processOf('', body)));
  assert.deepEqual(ranksOf(model), { S: 0, T: 1, E: 2, M: 3 });
  const back = read(xmlOf(processOf('', body + flow('FR', 'B', 'T'))));
  assert.deepEqual(back.flows.map(f => f.id), ['F1', 'F2', 'FB', 'FR'], 'the flow is read');
  assert.deepEqual(ranksOf(back), ranksOf(model));
  // In the walk it has no place: last, after all others.
  assert.equal(kanonisch(back).model.flows.at(-1).id, 'FR');
});

test('a flow\'s name costs no column (Mermaid gave its label one): the target a column further, named or not', () => {
  const named = ranksOf(read(xmlOf(processOf('', el('exclusiveGateway', 'G') + el('task', 'A') + flow('F', 'G', 'A', 'ja, gleich')))));
  assert.deepEqual(named, { G: 0, A: 1 });
  // Two flows between one pair, both named: one step still, "ja" before "nein" in the walk.
  const pair = read(xmlOf(processOf('', el('exclusiveGateway', 'G') + el('task', 'A') + flow('F2', 'G', 'A', 'nein') + flow('F1', 'G', 'A', 'ja'))));
  assert.deepEqual(ranksOf(pair), { G: 0, A: 1 });
  assert.deepEqual(kanonisch(pair).model.flows.map(f => f.id), ['F1', 'F2']);
});

test('the pools share their columns; message flows, text annotations and an empty lane set none', () => {
  const pools = (messages, notes = '') => xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="PA" processRef="P1"/><bpmn:participant id="PB" processRef="P2"/>' + messages + notes + '</bpmn:collaboration>' +
    processOf({ L1: 'S1 A1', Leer: '' }, el('startEvent', 'S1') + el('task', 'A1', 'Anfragen') + flow('F1', 'S1', 'A1'), 'P1') +
    processOf('', el('startEvent', 'S2') + el('task', 'A2') + flow('F2', 'S2', 'A2'), 'P2'));
  const plain = read(pools(''));
  assert.deepEqual(plain.lanes.map(l => [l.id, l.nodes.length]), [['L1', 2], ['Leer', 0], ['', 2]]);
  assert.deepEqual(ranksOf(plain), { S1: 0, A1: 1, S2: 0, A2: 1 });
  const full = read(pools('<bpmn:messageFlow id="M" sourceRef="A1" targetRef="S2"/>',
    '<bpmn:textAnnotation id="N"><bpmn:text>Notiz</bpmn:text></bpmn:textAnnotation><bpmn:association id="AN" sourceRef="N" targetRef="S2"/>'));
  assert.deepEqual([full.messages.length, full.notes.length], [1, 1]);
  assert.deepEqual(ranksOf(full), ranksOf(plain));
});

test('every node has a rank; lmmPositions() gives them in the form layoutGeometry() reads', () => {
  const model = read(xmlOf(processOf('', LINE)));
  assert.deepEqual(lmm(model), { n1: 0, n2: 1, n3: 2 });
  assert.deepEqual(lmmPositions(model, lmm(model)), { nodes: { n1: { cx: 0 }, n2: { cx: 1 }, n3: { cx: 2 } } });
  assert.equal(LMM_MERMAID_VERSION, '12.0.0');
});

// ---------- the model in LMM's order ----------
test('kanonisch(): the ranks of lmm(), the nodes in the order their ranks were given, lane.nodes likewise; lanes and pools as they were; the model handed in untouched', () => {
  const xml = xmlOf(processOf({ L2: 'E T M', L1: 'S' }, el('endEvent', 'E') + el('task', 'T') + el('startEvent', 'S') +
    flow('F2', 'T', 'E') + flow('F1', 'S', 'T') + '<bpmn:boundaryEvent id="B2" attachedToRef="T"/><bpmn:boundaryEvent id="B1" attachedToRef="T"/>' +
    el('task', 'M') + flow('FM', 'B1', 'M')));
  const model = read(xml), before = JSON.stringify(model);
  const k = kanonisch(model);
  assert.equal(JSON.stringify(model), before);
  assert.deepEqual(k.rank, lmm(model));
  assert.deepEqual(k.model.nodes.map(n => n.id), ['S', 'T', 'E', 'M']);
  assert.deepEqual(k.model.lanes.map(l => [l.id, l.nodes]), [['L2', ['T', 'E', 'M']], ['L1', ['S']]]);
  assert.deepEqual(k.model.pools, model.pools);
  assert.deepEqual(k.model.flows.map(f => f.id), ['F1', 'F2', 'FM']);
  // The boundary events by their host, then by their first flow (one without a flow after), then name and id.
  assert.deepEqual(k.model.boundaries.map(b => b.id), ['B1', 'B2']);
});

// A collaboration with a pool PA (S → T → E, T with the boundary event B), a black box PB, the message flows M1 (E to
// PB) and M2 (S to PB), and text annotations at each kind of partner, written in a muddled order.
const note = (id, text) => '<bpmn:textAnnotation id="' + id + '"><bpmn:text>' + text + '</bpmn:text></bpmn:textAnnotation>';
const assoc = (id, from, to) => '<bpmn:association id="' + id + '" sourceRef="' + from + '" targetRef="' + to + '"/>';
const NOTES = xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="PA" processRef="P"/><bpmn:participant id="PB" name="Bank"/>' +
  '<bpmn:messageFlow id="M1" sourceRef="E" targetRef="PB"/><bpmn:messageFlow id="M2" sourceRef="S" targetRef="PB"/>' +
  note('NM', 'an M2') + assoc('AM', 'M2', 'NM') + note('NB2', 'an der Bank') + assoc('AB2', 'NB2', 'PB') +
  note('NA2', 'zz am Pool') + assoc('AA2', 'NA2', 'PA') + note('NA1', 'mm am Pool') + assoc('AA1', 'PA', 'NA1') + '</bpmn:collaboration>' +
  processOf('', LINE + '<bpmn:boundaryEvent id="B" attachedToRef="T"/>' +
    note('NF', 'am Fluss') + assoc('AF', 'NF', 'F1') + note('NE', 'am Ereignis') + assoc('AE', 'B', 'NE') +
    note('NEnde', 'am Ende') + assoc('AEnde', 'NEnde', 'E') + note('NTb', 'b an T') + assoc('ATb', 'NTb', 'T') + note('NTa', 'a an T') + assoc('ATa', 'T', 'NTa') +
    // Two associations: the one to the earlier partner (S) counts, written second.
    note('NZwei', 'an E und S') + assoc('AZ1', 'NZwei', 'E') + assoc('AZ2', 'S', 'NZwei')));

test('kanonisch(): the text annotations by the kind of their partner, then its place, then text, then id; those at a pool last, by pool', () => {
  const model = read(NOTES);
  assert.deepEqual(model.notes.map(n => n.id), ['NM', 'NB2', 'NA2', 'NA1', 'NF', 'NE', 'NEnde', 'NTb', 'NTa', 'NZwei'], 'read in the order of the XML');
  const k = kanonisch(model).model;
  assert.deepEqual(k.notes.map(n => n.id), [
    'NZwei',                // at a node: S, the earlier of its two partners
    'NTa', 'NTb',           // at T, by text
    'NEnde',                // at E
    'NE',                   // at a boundary event
    'NF',                   // at a sequence flow
    'NM',                   // at a message flow
    'NA1', 'NA2', 'NB2',    // at a pool: PA by text, then PB
  ]);
  // Its pool from the association that counts.
  assert.deepEqual(k.notes.map(n => [n.id, n.pool]).filter(([id]) => ['NZwei', 'NM', 'NA1', 'NB2'].includes(id)), [['NZwei', 0], ['NM', null], ['NA1', 0], ['NB2', 1]]);
});

test('kanonisch(): the associations grouped by text annotation, the one to the earlier partner first; the message flows by their ends', () => {
  const k = kanonisch(read(NOTES)).model;
  assert.deepEqual(k.associations.map(a => a.id), ['AZ2', 'AZ1', 'ATa', 'ATb', 'AEnde', 'AE', 'AF', 'AM', 'AA1', 'AA2', 'AB2']);
  assert.deepEqual(k.messages.map(m => m.id), ['M2', 'M1']);
});

test('kanonisch(): a reordering of the XML gives the same model, but for its keys', () => {
  const strip = m => JSON.stringify({ ...m, nodes: m.nodes.map(({ key, ...n }) => n), lanes: m.lanes.map(({ key, ...l }) => l) });
  const reversed = NOTES.replace(/(<bpmn:textAnnotation[^]*?<\/bpmn:textAnnotation>)(<bpmn:association [^>]*\/>)/g, '$2$1');
  assert.notEqual(reversed, NOTES);
  assert.equal(strip(kanonisch(read(reversed)).model), strip(kanonisch(read(NOTES)).model));
});

// ---------- the invariance on the fixtures ----------
const ROUNDS = Number(process.env.DOKUFIX_LMM_ROUNDS) || 1;
const local = e => String(e.localName || '').replace(/^.*:/, '');
const NODE = /^(startEvent|endEvent|intermediateCatchEvent|intermediateThrowEvent|\w*Gateway|task|\w+Task|callActivity|subProcess|adHocSubProcess|transaction)$/;
const RENAMED = /^(startEvent|endEvent|intermediateCatchEvent|intermediateThrowEvent|\w*Gateway|task|\w+Task|callActivity|subProcess|adHocSubProcess|transaction|boundaryEvent|sequenceFlow|messageFlow|textAnnotation|association|dataObjectReference|dataStoreReference|dataInputAssociation|dataOutputAssociation)$/;
// A fixed sequence of numbers in [0, 1), from a seed.
const random = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
// The children of parent that pass test, each put where another of them stood.
function reorder(parent, pass, rnd, doc){
  const els = [...parent.children].filter(pass);
  if (els.length < 2) return;
  const slots = els.map(e => { const c = doc.createComment('slot'); e.replaceWith(c); return c; });
  for (let i = els.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [els[i], els[j]] = [els[j], els[i]]; }
  els.forEach((e, i) => slots[i].replaceWith(e));
}
// What has no meaning in BPMN XML, reordered: in each process the flow nodes, the boundary events, the sequence
// flows, the text annotations and the associations, the data references (story 2.32), each among their places, the
// data associations of each node among theirs, and the flowNodeRef of each lane; in the collaboration the message
// flows, text annotations and associations. Lanes and pools keep their places.
function permuted(xml, rnd){
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  for (const part of [...doc.documentElement.children]){
    const kind = local(part);
    if (kind === 'process'){
      reorder(part, e => NODE.test(local(e)), rnd, doc);
      reorder(part, e => local(e) === 'boundaryEvent', rnd, doc);
      reorder(part, e => local(e) === 'sequenceFlow', rnd, doc);
      reorder(part, e => /^data(Object|Store)Reference$/.test(local(e)), rnd, doc);
      for (const node of [...part.children]) for (const kind of ['dataInputAssociation', 'dataOutputAssociation']) reorder(node, e => local(e) === kind, rnd, doc);
      for (const lane of part.querySelectorAll('*')) if (local(lane) === 'lane') reorder(lane, e => local(e) === 'flowNodeRef', rnd, doc);
    }
    if (kind === 'collaboration') reorder(part, e => local(e) === 'messageFlow', rnd, doc);
    if (kind === 'process' || kind === 'collaboration'){
      reorder(part, e => local(e) === 'textAnnotation', rnd, doc);
      reorder(part, e => local(e) === 'association', rnd, doc);
    }
  }
  return doc.toString();
}
// New ids for the flow nodes, boundary events, sequence and message flows, text annotations and associations, data
// references and data associations, every reference kept (a data association's in its sourceRef and targetRef): { xml, back }, back the old id of each new one. Lanes and pools keep theirs.
function renamed(xml, rnd){
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const all = [...doc.querySelectorAll('*')], map = new Map(), back = new Map();
  const used = new Set(all.map(e => e.getAttribute('id')).filter(Boolean));
  for (const e of all){
    if (!RENAMED.test(local(e)) || !e.getAttribute('id')) continue;
    let id; do { id = 'id_' + Math.floor(rnd() * 1e9).toString(36); } while (used.has(id));
    used.add(id); map.set(e.getAttribute('id'), id); back.set(id, e.getAttribute('id'));
    e.setAttribute('id', id);
  }
  for (const e of all){
    for (const a of ['sourceRef', 'targetRef', 'attachedToRef']) if (map.has(e.getAttribute(a))) e.setAttribute(a, map.get(e.getAttribute(a)));
    if (['flowNodeRef', 'sourceRef', 'targetRef'].includes(local(e)) && map.has(e.textContent.trim())) e.textContent = map.get(e.textContent.trim());
  }
  return { xml: doc.toString(), back };
}
// The diagram part laid out as the page lays it out (src/app/bpmn.js), per element id and in the ids of the
// fixture: every box, label box and waypoint, whatever the order of the elements in the XML.
function diagramOf(xml, back = new Map()){
  const di = readDiagram(xml);
  const id = x => back.get(x) ?? x;
  return Object.fromEntries(['shapes', 'labels', 'flows', 'flowLabels'].map(k => [k, Object.fromEntries(Object.keys(di[k]).map(x => [id(x), di[k][x]]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))]));
}
function laidOut(xml){
  const { model } = readModel(xml);
  const k = kanonisch(model);
  return appendDiagram(xml, model, layoutGeometry(k.model, lmmPositions(k.model, k.rank))).xml;
}

for (const [i, name] of fixtureNames().entries()){
  test(name + ': the diagram part is the same when the XML is reordered and when its ids are renamed', () => {
    // The fixture's expected XML is its layout (tests/bpmn-fixtures.test.mjs checks that).
    const want = diagramOf(fs.readFileSync(expectedFile(name), 'utf8'));
    const xml = readFixture(name).xml, rnd = random(1000 + i);
    for (let round = 0; round < ROUNDS; round++){
      const shuffled = permuted(xml, rnd);
      assert.deepEqual(diagramOf(laidOut(shuffled)), want, name + ', reordered (round ' + (round + 1) + ')');
      const r = renamed(permuted(xml, rnd), rnd);
      assert.deepEqual(diagramOf(laidOut(r.xml), r.back), want, name + ', reordered and renamed (round ' + (round + 1) + ')');
    }
  });
}

// The depth-first search walks with a stack of its own (security review of
// 2026-10-07): a chain longer than the call stack is deep is ranked, not a
// RangeError. A long enough chain for the default stack takes seconds to rank,
// so the case runs in a child with a small stack, where 3000 nodes are deeper
// than the stack and the recursive search gave the RangeError.
test('a chain deeper than the call stack is ranked: the search keeps a stack of its own', () => {
  const script = `
    const { kanonisch } = await import(${JSON.stringify(new URL('../src/app/lmm.js', import.meta.url).href)});
    const n = 3000, nodes = [], flows = [];
    for (let i = 0; i < n; i++) nodes.push({ id: 'T' + i, name: '', type: 'task', key: 'n' + (i + 1) });
    for (let i = 1; i < n; i++) flows.push({ id: 'F' + i, from: 'T' + (i - 1), to: 'T' + i, name: '' });
    const lanes = [{ id: 'L', name: '', nodes: nodes.map(x => x.id), key: 'l1', pool: 0 }];
    const { rank } = kanonisch({ pools: [{ id: null, name: '' }], lanes, nodes, flows, boundaries: [], messages: [], notes: [], associations: [] });
    console.log(rank.n1 + ' ' + rank.n3000);`;
  const r = spawnSync(process.execPath, ['--stack-size=200', '--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(r.stderr, '');
  assert.equal(r.stdout.trim(), '0 2999');
});
