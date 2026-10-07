// BPMN without coordinates, run in Node: no browser, no bpmn-js.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/bpmn-layout.js reads the XML into lanes, flow nodes and flows, lays
// the nodes out on a grid from the columns it is given and writes them back
// as the diagram part. All of it is pure logic, so all of it is checked here:
// the reading on XML parsed by linkedom, the geometry on positions made up
// for the purpose, the labels in the size the layout's own measurer gives
// them (src/app/label-size.js, checked in tests/label-size.test.mjs). The
// columns the page gives, LMM's (src/app/lmm.js), are checked in
// tests/lmm.test.mjs and, with the whole layout, on the fixtures
// (tests/bpmn-fixtures.test.mjs). Whatever linkedom reads differently from a
// browser (lookup by namespace, XML that is not well-formed) is checked by the
// browser runs (tests/vergleich.mjs, tests/durchlaeufe.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from 'linkedom';
import {
  readProcess, leftOutLine, layoutGeometry, appendDiagram, DEFAULT_RULES,
  flowLabel, flowLabelPlaces, labelPlaces, bestPlace, dedupe, orthogonal,
  growLane, labelRoom, nearestOnFlow, LAYOUT_NOTHING, layoutStrayText,
  noteSize, notePlaces, associationWay, wayAlong, NOTE_WIDTHS,
} from '../src/app/bpmn-layout.js';
import { layoutJob, answerLayout } from '../src/app/bpmn-layout-job.js';
import { breaksOf } from './bpmn-rules.mjs';
import { readFixture, readModel, fixtureNames, gridInput } from './bpmn-fixtures.mjs';
import { measureLabel } from '../src/app/label-size.js';
import { parseXml } from '../src/app/xml-parser.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// The reference input of story 2.8: 1 pool, 4 lanes, 16 symbols, 17 flows.
const REFERENCE = fs.readFileSync(path.join(here, '../spikes/komponenten-aus-markdown/diagramme/uebergabe-ohne-koordinaten.bpmn'), 'utf8');
const NS = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"';
const xmlOf = body => '<bpmn:definitions ' + NS + ' id="D" targetNamespace="http://example.org/dokufix">' + body + '</bpmn:definitions>';
const parse = xml => new DOMParser().parseFromString(xml, 'text/xml');
// The model as the page reads it, with the layout's own parser.
const read = xml => readProcess(parseXml(xml));
const LINE = '<bpmn:startEvent id="S" name="Los"/><bpmn:task id="T" name="Tun"/><bpmn:endEvent id="E" name="Fertig"/>' +
  '<bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T"/><bpmn:sequenceFlow id="F2" sourceRef="T" targetRef="E"/>';

// ---------- reading ----------
test('the reference input: the pool, 4 lanes, 16 flow nodes with their kinds, 17 flows, nothing left out', () => {
  const { model, leftOut } = read(REFERENCE);
  assert.deepEqual(model.pools, [{ id: 'Participant_1', name: 'Übergabe an die Tourenplanung' }]);
  assert.deepEqual([model.messages, model.insert], [[], null]);
  assert.equal(model.plane, 'Collaboration_1');
  assert.deepEqual(model.lanes.map(l => [l.id, l.name, l.nodes.length, l.key, l.synthetic]),
    [['Lane_Kunde', 'Kunde', 3, 'l1', false], ['Lane_Hofbuero', 'Hofbüro', 7, 'l2', false], ['Lane_Kundenkartei', 'Kundenkartei', 4, 'l3', false], ['Lane_Tourenplanung', 'Tourenplanung', 2, 'l4', false]]);
  assert.equal(model.nodes.length, 16);
  assert.equal(model.flows.length, 17);
  const kinds = Object.fromEntries(model.nodes.map(n => [n.id, n.type + ' ' + n.tag]));
  assert.equal(kinds.Start, 'start startEvent');
  assert.equal(kinds.Weg, 'gateway exclusiveGateway');
  assert.equal(kinds.Antworten, 'task sendTask');
  assert.equal(kinds.Postfach, 'inter intermediateCatchEvent');
  assert.equal(kinds.Teilen, 'gateway parallelGateway');
  assert.equal(kinds.AboAnfrage, 'task callActivity');
  assert.equal(kinds.BeiTouren, 'end endEvent');
  assert.deepEqual(model.nodes.map(n => n.key), Array.from({ length: 16 }, (_, i) => 'n' + (i + 1)));
  assert.deepEqual(model.flows.find(f => f.id === 'Flow_9'), { id: 'Flow_9', from: 'Art', to: 'Teilen', name: 'Anfrage' });
  assert.deepEqual(leftOut, []);
});

test('no lanes: one synthetic lane with every node; a participant is the pool, without one there is none', () => {
  const bare = read(xmlOf('<bpmn:process id="P">' + LINE + '</bpmn:process>')).model;
  assert.deepEqual(bare.pools, [{ id: null, name: '' }]);
  assert.equal(bare.plane, 'P');
  assert.deepEqual(bare.lanes.map(l => [l.id, l.nodes, l.synthetic]), [['', ['S', 'T', 'E'], true]]);
  const pooled = read(xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="Pool" name="Leihstelle" processRef="P"/></bpmn:collaboration><bpmn:process id="P">' + LINE + '</bpmn:process>')).model;
  assert.deepEqual(pooled.pools, [{ id: 'Pool', name: 'Leihstelle' }]);
  assert.equal(pooled.plane, 'K');
  assert.deepEqual(pooled.lanes.map(l => [l.name, l.synthetic]), [['Leihstelle', true]]);
});

test('a default namespace instead of a prefix reads the same', () => {
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D"><process id="P">' + LINE.replace(/bpmn:/g, '') + '</process></definitions>\n<!-- Ende -->\n';
  const { model } = read(xml);
  assert.deepEqual([model.nodes.length, model.flows.length, model.plane], [3, 2, 'P']);
});

test('the refusals: nothing to place, nodes in no lane', () => {
  assert.throws(() => read(xmlOf('<bpmn:process id="P"/>')), { message: LAYOUT_NOTHING });
  assert.throws(() => read(xmlOf('<bpmn:process id="P"><bpmn:sequenceFlow id="F" sourceRef="a" targetRef="b"/></bpmn:process>')), { message: LAYOUT_NOTHING });
  // A pool without a process of its own, alone: nothing to place.
  assert.throws(() => read(xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="A" name="Draußen"/></bpmn:collaboration><bpmn:process id="P">' + LINE + '</bpmn:process>')), { message: LAYOUT_NOTHING });
  assert.throws(() => read(xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="A" processRef="Q"/></bpmn:collaboration><bpmn:process id="P">' + LINE + '</bpmn:process>')), { message: LAYOUT_NOTHING });
  const stray = xmlOf('<bpmn:process id="P"><bpmn:laneSet id="LS"><bpmn:lane id="L" name="Eins"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>' +
    '<bpmn:task id="A"/><bpmn:task id="B"/><bpmn:task id="C"/></bpmn:process>');
  assert.throws(() => read(stray), { message: 'Diese Elemente liegen in keiner Bahn: B, C.' });
  assert.equal(layoutStrayText(['A']), 'Diese Elemente liegen in keiner Bahn: A.');
  assert.equal(LAYOUT_NOTHING, 'Das BPMN-XML enthält kein Element, das sich anordnen lässt.');
});

test('a document that is no BPMN definitions is not judged here', () => {
  assert.equal(read('<process id="P"><task id="A"/></process>'), null);
  assert.equal(readProcess(null), null);
});

test('what the layout cannot place is left out, with every flow that touches it; the rest is read', () => {
  const xml = xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="Pool" processRef="P"/><bpmn:textAnnotation id="KA"/><bpmn:messageFlow id="M" sourceRef="T" targetRef="Pool"/></bpmn:collaboration>' +
    '<bpmn:process id="P"><bpmn:startEvent id="S"/><bpmn:task id="T"><bpmn:dataOutputAssociation id="DA"><bpmn:targetRef>DO</bpmn:targetRef></bpmn:dataOutputAssociation></bpmn:task>' +
    '<bpmn:boundaryEvent id="B" attachedToRef="T"/><bpmn:task id="Mahnen"/>' +
    '<bpmn:subProcess id="SP"><bpmn:startEvent id="SP_S"/><bpmn:task id="SP_T"/><bpmn:sequenceFlow id="SP_F" sourceRef="SP_S" targetRef="SP_T"/></bpmn:subProcess>' +
    '<bpmn:dataObjectReference id="DO" dataObjectRef="DOB"/><bpmn:dataObject id="DOB"/><bpmn:dataStoreReference id="DS"/>' +
    '<bpmn:textAnnotation id="N"><bpmn:text>Notiz</bpmn:text></bpmn:textAnnotation><bpmn:association id="AS" sourceRef="T" targetRef="N"/><bpmn:group id="GR"/>' +
    '<bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T"/><bpmn:sequenceFlow id="F2" sourceRef="T" targetRef="SP"/>' +
    '<bpmn:sequenceFlow id="F3" sourceRef="B" targetRef="Mahnen"/><bpmn:sequenceFlow id="F4" sourceRef="T" targetRef="SP_T"/></bpmn:process>' +
    '<bpmn:process id="Q"><bpmn:task id="QT"/></bpmn:process>');
  const { model, leftOut } = read(xml);
  assert.deepEqual(model.nodes.map(n => n.id), ['S', 'T', 'Mahnen', 'SP']);
  assert.deepEqual(model.flows.map(f => f.id), ['F1', 'F2', 'F3']);
  assert.deepEqual(model.boundaries, [{ id: 'B', name: '', host: 'T', cancel: true }]);
  // A text annotation with its association is read (story 2.31); one without text is left out.
  assert.deepEqual(model.notes, [{ id: 'N', text: 'Notiz', pool: 0 }]);
  assert.deepEqual(model.associations, [{ id: 'AS', note: 'N', partner: 'T', kind: 'node', toNote: true }]);
  // A process no participant refers to is named once, after what the collaboration holds (review of 2.31).
  assert.deepEqual(leftOut.map(x => x.id), ['KA', 'M', 'Q', 'DA', 'SP_S', 'SP_T', 'SP_F', 'DO', 'DOB', 'DS', 'GR', 'F4']);
  assert.equal(leftOutLine(leftOut[0]), 'textAnnotation KA: has no text');
  assert.equal(leftOutLine(leftOut[2]), 'process Q: no participant refers to it');
  assert.equal(leftOutLine(leftOut.find(x => x.id === 'SP_T')), 'task SP_T: inside the sub-process SP');
});

test('nested lanes: the inner lanes are laid out, the outer one is left out; an empty lane is kept, empty', () => {
  const xml = xmlOf('<bpmn:process id="P"><bpmn:laneSet id="LS"><bpmn:lane id="Aussen" name="Haus"><bpmn:flowNodeRef>A</bpmn:flowNodeRef><bpmn:flowNodeRef>B</bpmn:flowNodeRef>' +
    '<bpmn:childLaneSet id="CS"><bpmn:lane id="I1" name="Oben"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane><bpmn:lane id="I2" name="Unten"><bpmn:flowNodeRef>B</bpmn:flowNodeRef></bpmn:lane></bpmn:childLaneSet></bpmn:lane>' +
    '<bpmn:lane id="Leer" name="Leer"/></bpmn:laneSet><bpmn:task id="A"/><bpmn:task id="B"/></bpmn:process>');
  const { model, leftOut } = read(xml);
  assert.deepEqual(model.lanes.map(l => [l.id, l.nodes, l.key]), [['I1', ['A'], 'l1'], ['I2', ['B'], 'l2'], ['Leer', [], 'l3']]);
  assert.deepEqual(leftOut.map(leftOutLine), ['lane Aussen: a lane with lanes inside']);
});

test('a node two lanes name stands in the first; a reference to nothing is ignored', () => {
  const xml = xmlOf('<bpmn:process id="P"><bpmn:laneSet id="LS"><bpmn:lane id="L1"><bpmn:flowNodeRef>A</bpmn:flowNodeRef><bpmn:flowNodeRef>Nix</bpmn:flowNodeRef></bpmn:lane>' +
    '<bpmn:lane id="L2"><bpmn:flowNodeRef>A</bpmn:flowNodeRef><bpmn:flowNodeRef>B</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet><bpmn:task id="A"/><bpmn:task id="B"/></bpmn:process>');
  assert.deepEqual(read(xml).model.lanes.map(l => l.nodes), [['A'], ['B']]);
});

test('ids and names as read: every node and lane a key of the layout\'s own, in the order of the XML; names with their blanks collapsed', () => {
  // The cases of the spike of story 2.8: ids that look like keywords or like the layout's own keys.
  const xml = xmlOf('<bpmn:process id="Process_1"><bpmn:laneSet id="LS"><bpmn:lane id="subgraph" name="Bahn eins">' +
    ['end', 'Flow_1', 'graph', 'style', 'L_n1_n2_0'].map(id => '<bpmn:flowNodeRef>' + id + '</bpmn:flowNodeRef>').join('') + '</bpmn:lane></bpmn:laneSet>' +
    '<bpmn:startEvent id="end" name="Start"/><bpmn:task id="Flow_1" name="end"/><bpmn:exclusiveGateway id="graph"/>' +
    '<bpmn:task id="style" name="  zwei\n  Zeilen "/><bpmn:endEvent id="L_n1_n2_0"/>' +
    '<bpmn:sequenceFlow id="Process_2" sourceRef="end" targetRef="Flow_1"/><bpmn:sequenceFlow id="subgraph2" sourceRef="Flow_1" targetRef="graph" name="ja|nein"/>' +
    '<bpmn:sequenceFlow id="F" sourceRef="graph" targetRef="style"/><bpmn:sequenceFlow id="G" sourceRef="style" targetRef="L_n1_n2_0"/></bpmn:process>');
  const { model } = read(xml);
  assert.deepEqual(model.lanes.map(l => [l.id, l.name, l.key]), [['subgraph', 'Bahn eins', 'l1']]);
  assert.deepEqual(model.nodes.map(n => [n.id, n.key, n.type, n.name]), [
    ['end', 'n1', 'start', 'Start'], ['Flow_1', 'n2', 'task', 'end'], ['graph', 'n3', 'gateway', ''], ['style', 'n4', 'task', 'zwei Zeilen'], ['L_n1_n2_0', 'n5', 'end', '']]);
  assert.deepEqual(model.flows.map(f => [f.id, f.from, f.to, f.name]), [
    ['Process_2', 'end', 'Flow_1', ''], ['subgraph2', 'Flow_1', 'graph', 'ja|nein'], ['F', 'graph', 'style', ''], ['G', 'style', 'L_n1_n2_0', '']]);
});

test('two flows between one pair are two flows', () => {
  const xml = xmlOf('<bpmn:process id="P"><bpmn:exclusiveGateway id="G" name="Frage?"/><bpmn:task id="T" name="Ziel"/>' +
    '<bpmn:sequenceFlow id="F1" sourceRef="G" targetRef="T" name="ja"/><bpmn:sequenceFlow id="F2" sourceRef="G" targetRef="T" name="nein"/></bpmn:process>');
  const { model } = read(xml);
  assert.deepEqual(model.flows.map(f => [f.id, f.from, f.to, f.name]), [['F1', 'G', 'T', 'ja'], ['F2', 'G', 'T', 'nein']]);
});

// ---------- the geometry, on positions made up for it ----------
const node = (cx, cy, w, h, task = false) => ({ cx, cy, w, h, task });
const P = (x, y) => ({ x, y });
const ptsOf = list => list.map(([x, y]) => P(x, y));
const gateway = (cx, cy) => ({ ...node(cx, cy, 50, 50), gateway: true });

// ---------- a lane grows around what reaches across its border (story 2.24) ----------
test('growLane: a ring closer than 12 px to the border with another lane makes its lane grow; what lies beyond moves, the ring stays; by an outer border nothing grows', () => {
  const lanes = [[0, 0, 1000, 140], [0, 140, 1000, 120], [0, 260, 1000, 100]];
  const box = { T: node(300, 200, 120, 80, true), B: node(300, 320, 120, 80, true) };
  const ring = { f: { from: 'T', to: 'T0' }, pts: ptsOf([[300, 240], [300, 255], [100, 255], [100, 240]]), obstacles: [] };
  const down = { f: { from: 'T', to: 'B' }, pts: ptsOf([[300, 240], [300, 280]]), obstacles: [{ x1: 240, y1: 280, x2: 360, y2: 360 }] };
  const before = { r: {}, dir: 1, y: 300, cy: 320 };
  const placed = [before, { r: ring, dir: 1, y: 255, cy: 200 }];
  assert.equal(growLane(placed[1], lanes, box, [ring, down], placed), 7, '255 + 12 - 260');
  assert.deepEqual(lanes, [[0, 0, 1000, 140], [0, 140, 1000, 127], [0, 267, 1000, 100]]);
  assert.equal(box.B.cy, 327);
  assert.equal(box.T.cy, 200);
  assert.deepEqual(ring.pts, ptsOf([[300, 240], [300, 255], [100, 255], [100, 240]]), 'the ring as it was');
  assert.deepEqual(down.pts, ptsOf([[300, 240], [300, 287]]));
  assert.deepEqual(down.obstacles[0], { x1: 240, y1: 287, x2: 360, y2: 367 });
  assert.equal(before.y, 307, 'a level placed before, beyond the border, moved');
  assert.equal(growLane({ r: ring, dir: 1, y: 240, cy: 200 }, lanes, box, [ring], []), 0, 'far enough from the border');
  assert.equal(growLane({ r: ring, dir: -1, y: 0, cy: 50 }, lanes, box, [ring], []), 0, 'by the top of the outer lane: the frame grows later');
  assert.equal(growLane({ r: ring, dir: 1, y: 255, cy: 900 }, lanes, box, [ring], []), 0, 'in no lane');
});

// ---------- labels across a lane's border (story 2.21) ----------
test('labelRoom: a label across the border of its owner\'s middle lane makes that lane grow 4 px beyond it; what lies beyond moves, each label with its owner', () => {
  const lanes = [[0, 0, 1000, 140], [0, 140, 1000, 120], [0, 260, 1000, 100]];
  const box = { G: { ...gateway(200, 220) }, B: node(400, 320, 120, 80, true), E: node(600, 320, 36, 36) };
  const flow = { f: { from: 'G', to: 'B' }, pts: ptsOf([[200, 245], [200, 320], [340, 320]]), obstacles: [{ x1: 340, y1: 280, x2: 460, y2: 360 }] };
  const g = { boxes: [[185, 250, 30, 20], [155, 250, 90, 20]], anchor: box.G };
  const e = { boxes: [[585, 342, 30, 15], [555, 342, 90, 15]], anchor: box.E };
  assert.deepEqual(labelRoom([g, e], lanes, box, [flow]), { up: 0, down: 14 }, '270 + 4 - 260');
  assert.deepEqual(lanes, [[0, 0, 1000, 140], [0, 140, 1000, 134], [0, 274, 1000, 100]]);
  assert.deepEqual(g.boxes, [[185, 250, 30, 20], [155, 250, 90, 20]], 'the label stays beside its gateway');
  assert.equal(box.G.cy, 220);
  assert.deepEqual([box.B.cy, box.E.cy], [334, 334]);
  assert.deepEqual(e.boxes, [[585, 356, 30, 15], [555, 356, 90, 15]], 'the event\'s label moved with its event');
  assert.deepEqual(flow.pts, ptsOf([[200, 245], [200, 334], [340, 334]]));
  assert.deepEqual(flow.obstacles[0], { x1: 340, y1: 294, x2: 460, y2: 374 });
  // A label inside its lane, or beyond an outer lane's outer border, grows nothing here.
  const top = { boxes: [[185, -10, 30, 15]], anchor: node(200, 30, 36, 36) };
  assert.deepEqual(labelRoom([top], lanes, { T: top.anchor }, []), { up: 0, down: 0 });
  assert.deepEqual(labelRoom([g], [], box, []), { up: 0, down: 0 }, 'no lanes');
});

test('labelRoom: several labels at one border give the same layout in either order, each at its distance to its owner', () => {
  const run = order => {
    const lanes = [[0, 0, 1000, 140], [0, 140, 1000, 120], [0, 260, 1000, 100]];
    const box = { G1: gateway(200, 220), G2: gateway(600, 220), E: node(800, 290, 36, 36) };
    const labels = {
      G1: { boxes: [[185, 250, 30, 20]], anchor: box.G1 },             // below its gateway, across the border down
      G2: { boxes: [[585, 252, 30, 29]], anchor: box.G2 },             // farther down
      E: { boxes: [[785, 254, 30, 15]], anchor: box.E },               // above its event in the lane below, across the border up
    };
    const grown = labelRoom(order.map(k => labels[k]), lanes, box, []);
    return { grown, lanes, labels: Object.fromEntries(Object.entries(labels).map(([k, l]) => [k, [l.boxes[0][1] - l.anchor.cy, l.boxes[0][1]]])), cy: Object.fromEntries(Object.entries(box).map(([k, c]) => [k, c.cy])) };
  };
  const a = run(['G1', 'G2', 'E']), b = run(['E', 'G2', 'G1']);
  assert.deepEqual(a, b);
  assert.deepEqual(a.grown, { up: 10, down: 25 });
  assert.deepEqual(a.lanes, [[0, -10, 1000, 140], [0, 130, 1000, 145], [0, 275, 1000, 110]]);
  assert.deepEqual(Object.values(a.labels).map(l => l[0]), [30, 32, -36], 'each label at its distance to its owner');
});

test('labelRoom: a flow\'s label beside its piece in the next lane, reaching back across the border into the source\'s lane: the piece\'s lane grows, the label stays beside its piece', () => {
  const lanes = [[0, 0, 1000, 140], [0, 140, 1000, 120], [0, 260, 1000, 100]];
  const box = { T: node(300, 200, 120, 80, true), B: node(500, 320, 120, 80, true) };
  const flow = { f: { from: 'T', to: 'B' }, pts: ptsOf([[300, 240], [300, 275], [500, 275], [500, 280]]), obstacles: [] };
  const text = [370, 252, 60, 19];
  assert.deepEqual(nearestOnFlow(flow.pts, 400, 261.5), P(400, 275), 'the anchor on the piece it stands above');
  const label = { boxes: [text], anchor: nearestOnFlow(flow.pts, 400, 261.5) };
  assert.deepEqual(labelRoom([label], lanes, box, [flow]), { up: 12, down: 0 }, '260 + 4 - 252');
  assert.deepEqual(lanes, [[0, -12, 1000, 140], [0, 128, 1000, 120], [0, 248, 1000, 112]], 'the lane below grew upwards, the lanes above moved');
  assert.deepEqual(text, [370, 252, 60, 19], 'the label stays, 4 px above its piece');
  assert.deepEqual(flow.pts, ptsOf([[300, 228], [300, 275], [500, 275], [500, 280]]), 'the source moved up with its lane');
  assert.equal(box.T.cy, 188);
});

test('labelRoom: a label wholly in the next lane is checked again after a growth; in either order the same lanes, no label across a border', () => {
  const run = order => {
    const lanes = [[0, 0, 1000, 140], [0, 140, 1000, 120], [0, 260, 1000, 100]];
    const box = { G1: gateway(200, 220), G2: gateway(600, 240) };
    const labels = { G1: { boxes: [[185, 250, 30, 20]], anchor: box.G1 }, G2: { boxes: [[585, 262, 30, 15]], anchor: box.G2 } };
    labelRoom(order.map(k => labels[k]), lanes, box, []);
    return { lanes, labels: Object.values(labels).map(l => l.boxes[0]) };
  };
  const a = run(['G2', 'G1']), b = run(['G1', 'G2']);
  assert.deepEqual(a, b);
  assert.deepEqual(a.lanes, [[0, 0, 1000, 140], [0, 140, 1000, 141], [0, 281, 1000, 100]], '14 px for G1\'s label, then 7 for G2\'s, which the border reached');
});

test('labels: measured at most 90 px wide, wrapped; a flow label above a horizontal piece, beside a vertical one, at a gateway right at the exit', () => {
  // In Arial at 11 px, bpmn-js's size for such a label: "ja" 8.6 px wide, rounded up; a line 13.2 px high, rounded up.
  assert.deepEqual(measureLabel('ja'), { w: 9, h: 14 });
  assert.deepEqual(measureLabel('Abwesenheit, nichts zu tun'), { w: 67, h: 27 }, 'two lines of 13.2 px');
  const pts = ptsOf([[0, 100], [40, 100], [40, 300], [400, 300]]);
  assert.deepEqual(flowLabel(pts, 'mitte', false), [208, 282, 24, 14]);   // the longest piece, above it
  assert.deepEqual(flowLabel(pts, 'ja', true), [10, 82, 9, 14]);         // right at the exit
  assert.deepEqual(flowLabel(ptsOf([[0, 0], [0, 10], [200, 10]]), 'nein', true), [10, -8, 21, 14], 'a stub too short: the piece after it');
  assert.deepEqual(flowLabel(ptsOf([[0, 0], [0, 200]]), 'unten', true), [6, 8, 28, 14]);
});

// A model and positions made up for it: two lanes, a start, a gateway, two
// tasks, an end; the gateway's flows leave by one corner.
function sample(){
  const xml = xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="Pool" name="Ausleihe" processRef="P"/></bpmn:collaboration><bpmn:process id="P">' +
    '<bpmn:laneSet id="LS"><bpmn:lane id="L1" name="Theke"><bpmn:flowNodeRef>S</bpmn:flowNodeRef><bpmn:flowNodeRef>G</bpmn:flowNodeRef><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane>' +
    '<bpmn:lane id="L2" name="Magazin"><bpmn:flowNodeRef>B</bpmn:flowNodeRef><bpmn:flowNodeRef>E</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>' +
    '<bpmn:startEvent id="S" name="Leserin fragt"/><bpmn:exclusiveGateway id="G" name="Vorrätig?"/><bpmn:task id="A" name="Ausgeben"/>' +
    '<bpmn:task id="B" name="Bestellen"/><bpmn:endEvent id="E" name="Erledigt"/>' +
    '<bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="G"/><bpmn:sequenceFlow id="F2" sourceRef="G" targetRef="A" name="ja"/>' +
    '<bpmn:sequenceFlow id="F3" sourceRef="G" targetRef="B" name="nein"/><bpmn:sequenceFlow id="F4" sourceRef="A" targetRef="E"/><bpmn:sequenceFlow id="F5" sourceRef="B" targetRef="E"/></bpmn:process>');
  const raw = {
    nodes: { n1: { cx: 100, cy: 100, w: 90, h: 90 }, n2: { cx: 300, cy: 100, w: 110, h: 110 }, n3: { cx: 520, cy: 100, w: 160, h: 60 },
             n4: { cx: 520, cy: 320, w: 160, h: 60 }, n5: { cx: 760, cy: 320, w: 80, h: 80 } },
    lanes: { l1: { x1: 0, y1: 20, x2: 860, y2: 200 }, l2: { x1: 0, y1: 220, x2: 860, y2: 420 } },
    edges: [
      [P(145, 100), P(245, 100)],
      [P(355, 100), P(440, 100)],
      [P(355, 100), P(380, 100), P(380, 320), P(440, 320)],
      [P(600, 100), P(760, 100), P(760, 280)],
      [P(600, 320), P(720, 320)],
    ],
  };
  return { xml, ...read(xml), raw };
}
// Whether a point lies on the outline of a box [x, y, w, h] of a kind.
function onOutline(p, [x, y, w, h], type){
  const cx = x + w / 2, cy = y + h / 2, eps = 1;
  if (type === 'task') return p[0] >= x - eps && p[0] <= x + w + eps && p[1] >= y - eps && p[1] <= y + h + eps &&
    Math.min(Math.abs(p[0] - x), Math.abs(p[0] - x - w), Math.abs(p[1] - y), Math.abs(p[1] - y - h)) <= eps;
  if (type === 'gateway') return Math.abs(Math.abs(p[0] - cx) / (w / 2) + Math.abs(p[1] - cy) / (h / 2) - 1) * (w / 2) <= eps;
  return Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - w / 2) <= eps;
}

test('the geometry: BPMN sizes, the pool around the lanes, every flow on the outlines of its nodes, right angles, labels off the flows', () => {
  const { model, raw } = sample();
  const di = layoutGeometry(model, raw);
  assert.deepEqual(Object.keys(di.nodes), ['S', 'G', 'A', 'B', 'E']);
  assert.deepEqual(model.nodes.map(n => di.nodes[n.id].slice(2)), [[36, 36], [50, 50], [120, 80], [120, 80], [36, 36]]);
  const [px, py, pw, ph] = Object.values(di.pools)[0], l1 = di.lanes.L1, l2 = di.lanes.L2;
  assert.equal(px + 30, l1[0], 'the pool\'s head before the lanes');
  assert.deepEqual([py, py + ph], [l1[1], l2[1] + l2[3]]);
  assert.equal(px + pw, l1[0] + l1[2]);
  const type = Object.fromEntries(model.nodes.map(n => [n.id, n.type]));
  for (const f of model.flows){
    const way = di.flows[f.id];
    assert.ok(onOutline(way[0], di.nodes[f.from], type[f.from]), f.id + ' starts on the outline of ' + f.from + ': ' + JSON.stringify(way));
    assert.ok(onOutline(way.at(-1), di.nodes[f.to], type[f.to]), f.id + ' ends on the outline of ' + f.to + ': ' + JSON.stringify(way));
    assert.ok(way.every((p, i) => !i || p[0] === way[i - 1][0] || p[1] === way[i - 1][1]), f.id + ' right angles: ' + JSON.stringify(way));
  }
  // Two flows leave the gateway; they leave by different corners.
  assert.notDeepEqual(di.flows.F2[0], di.flows.F3[0]);
  assert.deepEqual(Object.keys(di.flowLabels), ['F2', 'F3']);
  // Event and gateway labels: one each, 90 wide, on no flow.
  assert.deepEqual(Object.keys(di.labels), ['S', 'G', 'E']);
  for (const [id, [x, y, w, h]] of Object.entries(di.labels)){
    assert.equal(w, 90);
    const size = measureLabel(model.nodes.find(n => n.id === id).name), box = [x + 45 - size.w / 2, y, size.w, h];
    for (const way of Object.values(di.flows)) for (let i = 1; i < way.length; i++){
      const seg = [Math.min(way[i - 1][0], way[i][0]), Math.min(way[i - 1][1], way[i][1]), Math.abs(way[i - 1][0] - way[i][0]), Math.abs(way[i - 1][1] - way[i][1])];
      const hit = box[0] < seg[0] + seg[2] && seg[0] < box[0] + box[2] && box[1] < seg[1] + seg[3] && seg[1] < box[1] + box[3];
      assert.equal(hit, false, 'the label of ' + id + ' lies on a flow');
    }
  }
});

test('the geometry takes the label sizes from a given measure, the measurer\'s without one', () => {
  const { model, raw } = sample();
  const asked = [];
  const di = layoutGeometry(model, raw, text => { asked.push(text); return { w: 40, h: 44 }; });
  // Each trial picture of the rules (R10–R16) asks again.
  assert.deepEqual([...new Set(asked)].sort(), ['Erledigt', 'Leserin fragt', 'Vorrätig?', 'ja', 'nein'].sort());
  for (const id of ['S', 'G', 'E']) assert.equal(di.labels[id][3], 44, id);
  for (const id of ['F2', 'F3']) assert.deepEqual(di.flowLabels[id].slice(2), [40, 44], id);
  const measured = layoutGeometry(model, raw);
  assert.equal(measured.labels.S[3], measureLabel('Leserin fragt').h);
});

test('the geometry refuses positions that lack a node (LMM gives every node one); the lanes and edges of raw it does not read', () => {
  const { model, raw } = sample();
  assert.throws(() => layoutGeometry(model, { ...raw, nodes: { ...raw.nodes, n3: undefined } }), { message: 'layoutGeometry(): raw has no column for the node A (n3)' });
  assert.deepEqual(layoutGeometry(model, { nodes: raw.nodes }), layoutGeometry(model, raw));
});

test('without lanes no lane is written; without a participant no pool', () => {
  const { model } = read(xmlOf('<bpmn:process id="P">' + LINE + '</bpmn:process>'));
  const raw = { nodes: { n1: { cx: 50, cy: 50, w: 60, h: 60 }, n2: { cx: 200, cy: 50, w: 120, h: 50 }, n3: { cx: 350, cy: 50, w: 60, h: 60 } },
                lanes: { l1: { x1: 0, y1: 0, x2: 400, y2: 100 } }, edges: [[P(80, 50), P(140, 50)], [P(260, 50), P(320, 50)]] };
  const di = layoutGeometry(model, raw);
  // The parts of the diagram have no prototype (an id may be "constructor"): compared as plain objects.
  assert.deepEqual({ ...di.pools }, {});
  assert.deepEqual({ ...di.lanes }, {});
  const { xml } = appendDiagram(xmlOf('<bpmn:process id="P">' + LINE + '</bpmn:process>'), model, di);
  assert.equal((xml.match(/<bpmndi:BPMNShape /g) || []).length, 3);
  assert.match(xml, /<bpmndi:BPMNPlane id="dokufix_plane" bpmnElement="P">/);
});

// ---------- the diagram part (AC3) ----------
test('the diagram part is added before the closing definitions tag; the author\'s XML stays as written', () => {
  const { xml, model, raw } = sample();
  // R1 off: the end stays in its lane, and the lane set as written.
  const { xml: out, diagram } = appendDiagram(xml, model, layoutGeometry(model, raw, measureLabel, { gatewayLane: false }));
  assert.equal(diagram, 'dokufix_diagram');
  const at = xml.lastIndexOf('</bpmn:definitions>');
  assert.equal(out.slice(0, at), xml.slice(0, at), 'everything before the tag unchanged');
  assert.equal(out.slice(-'</bpmn:definitions>'.length), '</bpmn:definitions>');
  const added = out.slice(at, out.length - '</bpmn:definitions>'.length);
  assert.equal((added.match(/<bpmndi:BPMNDiagram\b/g) || []).length, 1);
  assert.match(added, /^ {2}<bpmndi:BPMNDiagram xmlns:bpmndi="http:\/\/www\.omg\.org\/spec\/BPMN\/20100524\/DI" xmlns:dc="http:\/\/www\.omg\.org\/spec\/DD\/20100524\/DC" xmlns:di="http:\/\/www\.omg\.org\/spec\/DD\/20100524\/DI" id="dokufix_diagram">/);
  assert.match(added, /<bpmndi:BPMNPlane id="dokufix_plane" bpmnElement="K">/);
  // One shape per pool, lane and node, one edge per flow, and the gateway's marker.
  assert.deepEqual((added.match(/bpmnElement="[^"]+"/g) || []).map(m => m.slice(13, -1)), ['K', 'Pool', 'L1', 'L2', 'S', 'G', 'A', 'B', 'E', 'F1', 'F2', 'F3', 'F4', 'F5']);
  assert.match(added, /bpmnElement="G" isMarkerVisible="true">/);
  assert.match(added, /bpmnElement="Pool" isHorizontal="true">/);
  // Parsed again: every element and id of the original is there, unchanged, and only the diagram part is new.
  const ids = doc => [...doc.querySelectorAll('*')].map(el => el.getAttribute('id')).filter(Boolean);
  const before = ids(parse(xml)), after = ids(parse(out));
  assert.deepEqual(after.slice(0, before.length), before);
  assert.deepEqual(after.slice(before.length), ['dokufix_diagram', 'dokufix_plane', 'Pool_di', 'L1_di', 'L2_di', 'S_di', 'G_di', 'A_di', 'B_di', 'E_di', 'F1_di', 'F2_di', 'F3_di', 'F4_di', 'F5_di']);
});

// The X of exclusive gateways: X1 splits, MX takes two flows in and gives two out, M merges.
const GATEWAYS = xmlOf('<bpmn:process id="P"><bpmn:startEvent id="S"/><bpmn:exclusiveGateway id="X1"/><bpmn:task id="A"/><bpmn:task id="B"/>' +
  '<bpmn:exclusiveGateway id="MX"/><bpmn:task id="C"/><bpmn:task id="D"/><bpmn:exclusiveGateway id="M"/><bpmn:endEvent id="E"/>' +
  [['S', 'X1'], ['X1', 'A'], ['X1', 'B'], ['A', 'MX'], ['B', 'MX'], ['MX', 'C'], ['MX', 'D'], ['C', 'M'], ['D', 'M'], ['M', 'E']]
    .map(([from, to], i) => '<bpmn:sequenceFlow id="F' + i + '" sourceRef="' + from + '" targetRef="' + to + '"/>').join('') + '</bpmn:process>');
const marked = xml => [...xml.matchAll(/bpmnElement="(\w+)" isMarkerVisible="true"/g)].map(m => m[1]);

test('by default every exclusive gateway has its X, the merge included', () => {
  assert.deepEqual(marked(layoutJob(GATEWAYS).xml), ['X1', 'MX', 'M']);
});

test('mergeMarker false leaves the X off a merge (two in, at most one out); a split and a gateway with two in and two out keep it', () => {
  assert.deepEqual(marked(layoutJob(GATEWAYS, { mergeMarker: false }).xml), ['X1', 'MX']);
});

test('answerLayout() hands the options of the worker\'s message to the layout', () => {
  const answer = answerLayout({ id: 7, xml: GATEWAYS, options: { mergeMarker: false } });
  assert.equal(answer.ok, true);
  assert.deepEqual(marked(answer.result.xml), ['X1', 'MX']);
});

test('the lane set follows the grid: the layout names each node\'s lane in laneOf, and that lane gets its flowNodeRef, not the one its box lies in', () => {
  const { xml, model, raw } = sample();
  const di = layoutGeometry(model, raw);
  assert.deepEqual(Object.keys(di.laneOf).sort(), ['A', 'B', 'E', 'G', 'S']);
  assert.ok(Object.values(di.laneOf).every(id => id === 'L1' || id === 'L2'));
  const lanesOf = out => Object.fromEntries(read(out).model.lanes.flatMap(l => l.nodes.map(id => [id, l.id])));
  assert.deepEqual(lanesOf(appendDiagram(xml, model, di).xml), { ...di.laneOf }, 'as laid out');
  // The grid moved G to L2, its box still in L1: G goes to L2.
  const moved = { ...di, laneOf: { ...di.laneOf, G: 'L2' } };
  assert.equal(lanesOf(appendDiagram(xml, model, moved).xml).G, 'L2');
  // A's box in L2, the grid's lane L1, the author's: the lane set stays.
  const [, ly] = di.lanes.L2, [ax, , aw, ah] = di.nodes.A;
  const boxed = { ...di, nodes: { ...di.nodes, A: [ax, ly + 10, aw, ah] }, laneOf: { ...di.laneOf, A: 'L1' } };
  assert.equal(lanesOf(appendDiagram(xml, model, boxed).xml).A, 'L1');
});

test('a node the grid moves into an empty lane gets its flowNodeRef there, a self-closing lane opened; it leaves its old lane', () => {
  const lanesOf = out => Object.fromEntries(read(out).model.lanes.flatMap(l => l.nodes.map(id => [id, l.id])));
  const tasks = '<bpmn:task id="A"/><bpmn:task id="B"/><bpmn:task id="C"/><bpmn:sequenceFlow id="F1" sourceRef="A" targetRef="B"/><bpmn:sequenceFlow id="F2" sourceRef="B" targetRef="C"/>';
  for (const empty of ['<bpmn:lane id="L2" name="Leer"/>', '<bpmn:lane id="L2" name="Leer"></bpmn:lane>']){
    const xml = xmlOf('<bpmn:process id="P"><bpmn:laneSet id="LS"><bpmn:lane id="L1" name="Eins"><bpmn:flowNodeRef>A</bpmn:flowNodeRef>' +
      '<bpmn:flowNodeRef>B</bpmn:flowNodeRef><bpmn:flowNodeRef>C</bpmn:flowNodeRef></bpmn:lane>' + empty + '</bpmn:laneSet>' + tasks + '</bpmn:process>');
    const { model } = read(xml);
    const di = { pool: null, lanes: { L1: [0, 0, 500, 100], L2: [0, 100, 500, 100] }, nodes: { A: [10, 10, 100, 80], B: [200, 110, 100, 80], C: [350, 110, 100, 80] },
      labels: {}, flows: { F1: [[110, 50], [200, 150]], F2: [[300, 150], [350, 150]] }, flowLabels: {}, laneOf: { A: 'L1', B: 'L2', C: 'L2' } };
    const out = appendDiagram(xml, model, di).xml;
    assert.deepEqual(lanesOf(out), { A: 'L1', B: 'L2', C: 'L2' }, empty);
    assert.equal((out.match(/<bpmn:flowNodeRef>/g) || []).length, 3, empty);
  }
});

test('the lane set is read with attributes: a flowNodeRef with an id is found and moved, a lane with ">" in a quoted value is read', () => {
  const xml = xmlOf('<bpmn:process id="P"><bpmn:laneSet id="LS"><bpmn:lane id="L1" name="Eins"><bpmn:flowNodeRef>A</bpmn:flowNodeRef>' +
    '<bpmn:flowNodeRef id="r1">B</bpmn:flowNodeRef></bpmn:lane><bpmn:lane id="L2" name="a > b"/><bpmn:lane id="L3" name="c > d">' +
    '<bpmn:flowNodeRef>C</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>' +
    '<bpmn:task id="A"/><bpmn:task id="B"/><bpmn:task id="C"/><bpmn:sequenceFlow id="F1" sourceRef="A" targetRef="B"/><bpmn:sequenceFlow id="F2" sourceRef="B" targetRef="C"/></bpmn:process>');
  const { model } = read(xml);
  const di = { pool: null, lanes: { L1: [0, 0, 500, 100], L2: [0, 100, 500, 100], L3: [0, 200, 500, 100] }, nodes: { A: [10, 10, 100, 80], B: [200, 110, 100, 80], C: [350, 210, 100, 80] },
    labels: {}, flows: { F1: [[110, 50], [200, 150]], F2: [[300, 150], [350, 250]] }, flowLabels: {}, laneOf: { A: 'L1', B: 'L2', C: 'L3' } };
  const out = appendDiagram(xml, model, di).xml;
  assert.deepEqual(read(out).model.lanes.map(l => [l.id, l.nodes]), [['L1', ['A']], ['L2', ['B']], ['L3', ['C']]]);
  assert.equal((out.match(/<bpmn:flowNodeRef\b/g) || []).length, 3);
});

test('what follows the closing tag stays, a closing tag in a comment is not the one, and the diagram\'s ids are free', () => {
  const body = '<process id="P">' + LINE.replace(/bpmn:/g, '') + '<task id="S_di" name="Schon da"/></process>';
  const xml = '<?xml version="1.0"?>\n<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="dokufix_diagram">' + body + '</definitions>\n<!-- nicht </definitions> -->\n';
  const { model } = read(xml);
  const di = { pool: null, lanes: {}, nodes: Object.fromEntries(model.nodes.map(n => [n.id, [0, 0, 10, 10]])), labels: {}, flows: Object.fromEntries(model.flows.map(f => [f.id, [[0, 0], [1, 0]]])), flowLabels: {} };
  const { xml: out, diagram } = appendDiagram(xml, model, di);
  assert.equal(diagram, 'dokufix_diagram_2');
  const at = xml.indexOf('</definitions>');
  assert.equal(out.slice(0, at), xml.slice(0, at));
  assert.ok(out.endsWith('</definitions>\n<!-- nicht </definitions> -->\n'));
  // Nor is one in a processing instruction, which the parser takes after the root as well (review of 2026-10-07).
  const pi = xml + '<?pi </definitions> ?>\n';
  const withPi = appendDiagram(pi, read(pi).model, di).xml;
  assert.ok(withPi.endsWith('</definitions>\n<!-- nicht </definitions> -->\n<?pi </definitions> ?>\n'));
  assert.equal(parseXml(withPi).documentElement.children.filter(el => el.localName === 'BPMNDiagram').length, 1);
  assert.match(out, /id="dokufix_diagram_2"/);
  assert.match(out, /id="S_di_2" bpmnElement="S"/);
  assert.throws(() => appendDiagram('<definitions/>', model, di), { message: LAYOUT_NOTHING });
});

test('the reference input end to end, with positions made up in the shape Mermaid gave: one shape per pool, lane and symbol, one edge per flow', () => {
  const { model } = read(REFERENCE);
  // A grid made up: each lane a row, the nodes in it in the order of the XML; lanes and edges as Mermaid's SVG gave them, which the layout does not read.
  const raw = { nodes: {}, lanes: {}, edges: [] };
  model.lanes.forEach((l, row) => {
    raw.lanes[l.key] = { x1: 0, y1: row * 200, x2: 2000, y2: row * 200 + 180 };
    l.nodes.forEach((id, col) => { raw.nodes[model.nodes.find(n => n.id === id).key] = { cx: 150 + col * 250, cy: row * 200 + 90, w: 140, h: 70 }; });
  });
  const at = id => raw.nodes[model.nodes.find(n => n.id === id).key];
  for (const f of model.flows){
    const a = at(f.from), b = at(f.to);
    raw.edges.push(a.cy === b.cy ? [P(a.cx + 70, a.cy), P(b.cx - 70, b.cy)] : [P(a.cx, a.cy + Math.sign(b.cy - a.cy) * 35), P(a.cx, (a.cy + b.cy) / 2), P(b.cx, (a.cy + b.cy) / 2), P(b.cx, b.cy - Math.sign(b.cy - a.cy) * 35)]);
  }
  const di = layoutGeometry(model, raw);
  const out = appendDiagram(REFERENCE, model, di).xml;
  assert.equal((out.match(/<bpmndi:BPMNShape /g) || []).length, 1 + 4 + 16);
  assert.equal((out.match(/<bpmndi:BPMNEdge /g) || []).length, 17);
  // Outside the lane set the XML stays as written; in it each node stands in the lane its symbol lies in.
  const laneSet = x => /<bpmn:laneSet[\s\S]*?<\/bpmn:laneSet>/.exec(x)[0];
  assert.equal(out.replace(laneSet(out), '').replace(/ {2}<bpmndi:BPMNDiagram[\s\S]*<\/bpmndi:BPMNDiagram>\n/, ''), REFERENCE.replace(laneSet(REFERENCE), ''));
  const again = read(out).model;
  for (const n of again.nodes){
    const lane = again.lanes.find(l => l.nodes.includes(n.id)), [lx, ly, lw, lh] = di.lanes[lane.id], [x, y, w, h] = di.nodes[n.id];
    assert.ok(x + w / 2 >= lx && x + w / 2 <= lx + lw && y + h / 2 >= ly && y + h / 2 <= ly + lh, n.id + ' in ' + lane.id);
  }
});

// ---------- the findings of the review (pass 1) ----------
test('a flow from a node to itself is left out: the router has no way for it yet', () => {
  const { model, leftOut } = read(xmlOf('<bpmn:process id="P">' + LINE + '<bpmn:sequenceFlow id="Nochmal" sourceRef="T" targetRef="T" name="nochmal"/></bpmn:process>'));
  assert.deepEqual(model.flows.map(f => f.id), ['F1', 'F2']);
  assert.deepEqual(leftOut.map(leftOutLine), ['sequenceFlow Nochmal: a flow from a node to itself']);
});

test('a lane without an id keeps its row and is not written; a participant without an id gets no pool', () => {
  const xml = xmlOf('<bpmn:collaboration id="K"><bpmn:participant name="Ohne" processRef="P"/></bpmn:collaboration><bpmn:process id="P"><bpmn:laneSet id="LS">' +
    '<bpmn:lane name="X"><bpmn:flowNodeRef>S</bpmn:flowNodeRef><bpmn:flowNodeRef>T</bpmn:flowNodeRef></bpmn:lane><bpmn:lane id="L2" name="Y"><bpmn:flowNodeRef>E</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>' + LINE + '</bpmn:process>');
  const { model, leftOut } = read(xml);
  assert.deepEqual(model.pools, [{ id: null, name: 'Ohne' }]);
  assert.deepEqual(model.lanes.map(l => [l.id, l.nodes, l.synthetic]), [['', ['S', 'T'], true], ['L2', ['E'], false]]);
  assert.deepEqual(leftOut.map(leftOutLine), ['lane (no id): has no id; its row is laid out, the lane is not drawn', 'participant (no id): has no id; it is not drawn as a pool']);
  const raw = { nodes: { n1: { cx: 50, cy: 50, w: 60, h: 60 }, n2: { cx: 200, cy: 50, w: 120, h: 50 }, n3: { cx: 350, cy: 250, w: 60, h: 60 } },
                lanes: { l1: { x1: 0, y1: 0, x2: 400, y2: 150 }, l2: { x1: 0, y1: 150, x2: 400, y2: 350 } }, edges: [[P(80, 50), P(140, 50)], [P(260, 50), P(350, 50), P(350, 220)]] };
  const out = appendDiagram(xml, model, layoutGeometry(model, raw)).xml;
  assert.deepEqual((out.match(/bpmnElement="[^"]*"/g) || []).map(m => m.slice(13, -1)), ['K', 'L2', 'S', 'T', 'E', 'F1', 'F2']);
});

test('a node only an outer lane names stands in that lane\'s first inner lane', () => {
  const xml = xmlOf('<bpmn:process id="P"><bpmn:laneSet id="LS"><bpmn:lane id="Aussen"><bpmn:flowNodeRef>A</bpmn:flowNodeRef><bpmn:flowNodeRef>B</bpmn:flowNodeRef>' +
    '<bpmn:childLaneSet id="CS"><bpmn:lane id="I1"><bpmn:flowNodeRef>X</bpmn:flowNodeRef></bpmn:lane><bpmn:lane id="I2"><bpmn:flowNodeRef>B</bpmn:flowNodeRef></bpmn:lane></bpmn:childLaneSet></bpmn:lane></bpmn:laneSet>' +
    '<bpmn:task id="A"/><bpmn:task id="B"/><bpmn:task id="X"/></bpmn:process>');
  assert.deepEqual(read(xml).model.lanes.map(l => [l.id, l.nodes]), [['I1', ['X', 'A']], ['I2', ['B']]]);
});

test('the last safeguard: a slanted piece gets a corner in the direction of the piece before it; doubled points go', () => {
  const pts = ptsOf([[0, 0], [50, 0], [50, 0], [80, 40], [80, 60]]);
  orthogonal(pts);
  assert.deepEqual(pts, ptsOf([[0, 0], [80, 0], [80, 60]]));
  const two = ptsOf([[0, 0], [0, 0]]);
  dedupe(two);
  assert.equal(two.length, 2, 'a flow keeps its two ends');
  // Before docking the inner point of a pair at an end stays; after, the end.
  const before = ptsOf([[0, 0], [0.7, 0], [0.7, 50], [40, 50], [40.4, 50.6]]);
  dedupe(before, true);
  assert.deepEqual(before, ptsOf([[0.7, 0], [0.7, 50], [40, 50]]));
  const after = ptsOf([[0, 0], [0.7, 0], [0.7, 50], [40, 50], [40.4, 50.6]]);
  dedupe(after);
  assert.deepEqual(after, ptsOf([[0, 0], [0.7, 50], [40.4, 50.6]]));
});

test('the lanes and the pool grow until every waypoint and every label lies inside, 12 px from the edge', () => {
  // Review input r06, one lane: the grid's lane ends 1 px above a label and 1 px below the lowest one; the frame
  // grows 11 px up and 11 px down.
  const { model, raw } = gridInput(readFixture('r06').xml);
  const di = layoutGeometry(model, raw);
  const [px, py, pw, ph] = Object.values(di.pools)[0], lane = di.lanes.Lane_1;
  const inside = ([x, y]) => x >= lane[0] + 12 && x <= lane[0] + lane[2] - 12 && y >= py + 12 && y <= py + ph - 12;
  for (const way of Object.values(di.flows)) for (const p of way) assert.ok(inside(p), JSON.stringify(p) + ' outside ' + JSON.stringify(di.pools));
  for (const [x, y, w, h] of Object.values(di.flowLabels)) assert.ok(inside([x, y]) && inside([x + w, y + h]), 'label ' + JSON.stringify([x, y, w, h]));
  for (const [, y, , h] of Object.values(di.labels)) assert.ok(y >= py + 12 && y + h <= py + ph - 12, 'label at ' + y);
  assert.ok(py < 0, 'the frame grew upwards: ' + py);
  assert.deepEqual([lane[1], lane[3]], [py, ph], 'the lane grew with the pool');
  assert.equal(px + 30, lane[0]);
  assert.equal(px + pw, lane[0] + lane[2]);
});

test('flow labels keep off other labels, flows and symbols, the own gateway included; with no free place the least covered', () => {
  const pts = ptsOf([[125, 100], [300, 100]]);
  const first = flowLabel(pts, 'ja', true);
  // That place taken by another label: the other side of the piece.
  assert.deepEqual(flowLabel(pts, 'ja', true, [first]), [135, 104, 9, 14]);
  // The short-stub rule: the label of the piece after the stub does not lie on the gateway.
  const gw = [75, 75, 50, 50];
  const stub = ptsOf([[100, 125], [100, 135], [300, 135]]);
  const placed = flowLabel(stub, 'nein', true, [gw]);
  assert.ok(!(placed[0] < gw[0] + gw[2] && gw[0] < placed[0] + placed[2] && placed[1] < gw[1] + gw[3] && gw[1] < placed[1] + placed[3]), JSON.stringify(placed));
  // Every place covered, one of them only by a 2 px square: that one.
  const all = flowLabelPlaces(pts, 'ja', true);
  const cover = all.map((p, i) => i === 2 ? [p[0] + 4, p[1] + 4, 2, 2] : p);
  assert.notDeepEqual(all[2], all[0]);
  assert.deepEqual(flowLabel(pts, 'ja', true, cover), all[2]);
});

test('the label of a flow back from a gateway stands at the gateway\'s end of its leg, inside the ring first, so the corner beside the gateway stays free', () => {
  // A ring out of a gateway's top (100, 75), up to its leg at y 40, left to x 0, down into its target.
  const ring = ptsOf([[100, 75], [100, 40], [0, 40], [0, 75]]);
  const size = { w: 30, h: 15 };
  const [first, second] = flowLabelPlaces(ring, 'nein', true, size, true);
  assert.deepEqual(first, [60, 44, 30, 15], 'below the leg, inside the ring, 10 px from its corner');
  assert.deepEqual(second, [60, 21, 30, 15], 'then above it');
  const below = ptsOf([[100, 125], [100, 160], [0, 160], [0, 125]]);
  assert.deepEqual(flowLabelPlaces(below, 'nein', true, size, true)[0], [60, 141, 30, 15], 'a ring below the row: above its leg first');
  // A ring from a gateway's side corner, its level shorter than the piece up
  // to it: the label stays on the level, inside the ring first.
  const corner = ptsOf([[275, 100], [263, 100], [263, 160], [230, 160], [230, 140]]);
  assert.deepEqual(flowLabelPlaces(corner, 'nein', true, size, true)[0], [223, 141, 30, 15], 'above the level, 10 px from its corner');
  // Not a flow back: the place beside the stub at the exit, as before.
  assert.deepEqual(flowLabelPlaces(ring, 'nein', true, size)[0], [106, 52, 30, 15]);
});

test('a long flow label is as wide as bpmn-js wraps it, 90 px at most, and as high as its lines', () => {
  const text = 'eine sehr lange Beschriftung eines Flusses, die bpmn-js auf mehrere Zeilen umbricht';
  const [, , w, h] = flowLabel(ptsOf([[0, 0], [600, 0]]), text, false);
  assert.ok(w <= 90, String(w));
  assert.equal(h, measureLabel(text).h);
  assert.ok(h >= 60);
});

test('an event label with its four near places taken goes to a farther one; with every place covered, to the one covered least', () => {
  const c = node(100, 100, 36, 36), size = measureLabel('Erledigt');
  const places = labelPlaces(c, size, false);
  assert.equal(places.length, 12);
  // The four near places blocked: below, farther out, is free.
  assert.deepEqual(bestPlace(places, places.slice(0, 4)), places[4]);
  assert.ok(places[4][1] > places[0][1] + places[0][3], 'farther below than the near place below');
  // A gateway tries above first, near and far.
  const gw = labelPlaces(node(100, 100, 50, 50), size, true);
  assert.ok(gw[0][1] < 75 && gw[4][1] < gw[0][1]);
  // Every place covered, the last corner least: that one.
  const cover = places.map((p, i) => i === 11 ? [p[0] + 3, p[1] + 3, 2, 2] : p);
  assert.deepEqual(bestPlace(places, cover), places[11]);
});

test('the event and gateway labels of the sample lie on no flow', () => {
  const { model, raw } = sample();
  const di = layoutGeometry(model, raw);
  for (const id of ['S', 'G', 'E']){
    const [x, y, w, h] = di.labels[id], size = measureLabel(model.nodes.find(n => n.id === id).name);
    const box = [x + w / 2 - size.w / 2, y, size.w, h];
    for (const way of Object.values(di.flows)) for (let i = 1; i < way.length; i++){
      const seg = [Math.min(way[i - 1][0], way[i][0]), Math.min(way[i - 1][1], way[i][1]), Math.abs(way[i - 1][0] - way[i][0]), Math.abs(way[i - 1][1] - way[i][1])];
      assert.ok(!(box[0] < seg[0] + seg[2] && seg[0] < box[0] + box[2] && box[1] < seg[1] + seg[3] && seg[1] < box[1] + box[3]), id + ' on a flow');
    }
  }
});

// ---------- the findings of review pass 2 ----------
test('a lane without an id above a drawn lane in a pool: the drawn lane keeps its row, the pool is the lanes\' extent, every node in its lane\'s row', () => {
  const xml = xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="Pool" processRef="P"/></bpmn:collaboration><bpmn:process id="P"><bpmn:laneSet id="LS">' +
    '<bpmn:lane name="X"><bpmn:flowNodeRef>S</bpmn:flowNodeRef><bpmn:flowNodeRef>T</bpmn:flowNodeRef></bpmn:lane><bpmn:lane id="Y" name="Y"><bpmn:flowNodeRef>E</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>' + LINE + '</bpmn:process>');
  const { model } = read(xml);
  const raw = { nodes: { n1: { cx: 50, cy: 75, w: 60, h: 60 }, n2: { cx: 200, cy: 75, w: 120, h: 50 }, n3: { cx: 350, cy: 225, w: 60, h: 60 } } };
  // R1 off, the end stays in lane Y; with it, the end stands in its predecessor's lane X and Y keeps an empty row.
  for (const [options, inY] of [[{ gatewayLane: false }, true], [{}, false]]){
    const di = layoutGeometry(model, raw, measureLabel, options);
    const y = di.lanes.Y, [px, py, pw, ph] = Object.values(di.pools)[0], t = di.nodes.T, e = di.nodes.E;
    assert.ok(y[1] >= t[1] + t[3], 'lane Y starts below the task of lane X: ' + JSON.stringify({ y, t }));
    assert.equal(e[1] >= y[1] && e[1] + e[3] <= y[1] + y[3], inY, 'E in lane Y: ' + inY);
    if (!inY) assert.equal(e[1] + e[3] / 2, t[1] + t[3] / 2, 'E in the row of T');
    assert.equal(py, 0, 'the pool starts with the top lane');
    assert.equal(py + ph, y[1] + y[3], 'the pool ends with the bottom lane');
    assert.equal(px + pw, y[0] + y[2]);
  }
});

test('an id with a "|" in it is laid out as any other (review of 2.31)', () => {
  const xml = xmlOf('<bpmn:process id="P"><bpmn:startEvent id="a|b"/><bpmn:task id="T|1" name="Tun"/><bpmn:endEvent id="E"/>' +
    '<bpmn:sequenceFlow id="F|1" sourceRef="a|b" targetRef="T|1"/><bpmn:sequenceFlow id="F2" sourceRef="T|1" targetRef="E"/></bpmn:process>');
  const { model } = read(xml);
  const di = layoutGeometry(model, rawOf(model, { 'a|b': 0, 'T|1': 1, E: 2 }));
  const [x, y, w, h] = di.nodes['T|1'], [px, py] = di.flows['F|1'].at(-1);
  assert.ok(px === x && py > y && py < y + h, 'the flow ends on the task\'s left side: ' + JSON.stringify([di.flows['F|1'], di.nodes['T|1']]));
  assert.match(appendDiagram(xml, model, di).xml, /bpmnElement="a\|b"/);
});

test('a flow from a node to itself whose node is not laid out names it once', () => {
  const { leftOut } = read(xmlOf('<bpmn:process id="P">' + LINE + '<bpmn:dataStoreReference id="Z"/><bpmn:sequenceFlow id="ZZ" sourceRef="Z" targetRef="Z"/></bpmn:process>'));
  assert.equal(leftOutLine(leftOut.find(x => x.id === 'ZZ')), 'sequenceFlow ZZ: touches Z, which is not laid out');
});

// ---------- the rules of the grid (story 2.27) ----------
// A process in one pool from a short description: per lane 'id:kind:column …'
// (kind s start, e end, x exclusive gateway, p parallel gateway, t task, i
// intermediate event; column made up, as LMM would give it), flows 'from>to
// …'. The raw positions are the columns alone: the grid reads no more. Returns per node
// the middle of its symbol and its lane.
const KIND = { s: 'startEvent', e: 'endEvent', x: 'exclusiveGateway', p: 'parallelGateway', t: 'task', i: 'intermediateCatchEvent' };
function laidOut(lanes, flows, options){
  const kinds = [], col = {};
  let body = '<bpmn:laneSet id="LS">';
  for (const [lane, spec] of lanes){
    const ids = spec.split(' ').map(s => { const [id, kind, c] = s.split(':'); kinds.push([id, kind]); col[id] = +c; return id; });
    body += '<bpmn:lane id="' + lane + '" name="' + lane + '">' + ids.map(id => '<bpmn:flowNodeRef>' + id + '</bpmn:flowNodeRef>').join('') + '</bpmn:lane>';
  }
  body += '</bpmn:laneSet>' + kinds.map(([id, kind]) => '<bpmn:' + KIND[kind] + ' id="' + id + '" name="' + id + '"/>').join('');
  flows.split(' ').forEach((f, i) => { const [a, b] = f.split('>'); body += '<bpmn:sequenceFlow id="F' + i + '" sourceRef="' + a + '" targetRef="' + b + '"/>'; });
  const { model } = read(xmlOf('<bpmn:process id="P">' + body + '</bpmn:process>'));
  const raw = { nodes: Object.fromEntries(model.nodes.map(n => [n.key, { cx: col[n.id] * 100, cy: 0, w: 10, h: 10 }])) };
  const di = layoutGeometry(model, raw, measureLabel, options);
  const inLane = y => Object.keys(di.lanes).find(l => y >= di.lanes[l][1] && y <= di.lanes[l][1] + di.lanes[l][3]);
  return Object.fromEntries(model.nodes.map(n => { const [x, y, w, h] = di.nodes[n.id]; return [n.id, { x: x + w / 2, y: y + h / 2, lane: inLane(y + h / 2) }]; }));
}
// Each rule's guarantee holds with the rule, and not with its switch off.
const RULE_CASES = [
  ['R1: a gateway stands in the lane of its nearest predecessor; the way changes lane after the decision', 'gatewayLane',
    [['A', 'S:s:0 T:t:1'], ['B', 'G:x:2 U:t:3 V:t:3 E:e:4']], 'S>T T>G G>U G>V U>E V>E',
    at => at.G.lane === 'A'],
  // Review of 2.31: the split of x-rg3 (external, so made up here), whose three ways begin in one other lane.
  ['R1: a split whose three or more ways all begin in one other lane stands in that lane', 'gatewayLane',
    [['A', 'S:s:0 T:t:1 G:x:2'], ['B', 'X:t:3 Y:t:3 Z:t:3 M:x:4 E:e:5']], 'S>T T>G G>X G>Y G>Z X>M Y>M Z>M M>E',
    at => at.G.lane === 'B'],
  // Ben's feedback on x-miwg4 (2026-10-07): a merge of two lanes stands in the row of the step after it.
  ['R1: a merge whose ways come from several lanes stands in the lane of the step after it', 'gatewayLane',
    [['A', 'S:s:0 G:x:1 T:t:3 E:e:4'], ['B', 'U:t:2 M:x:2']], 'S>G G>M G>U U>M M>T T>E',
    at => at.M.lane === 'A'],
  // R9 stacks two such ways as well (Ben, 2026-10-07, lizenzprozess-gemini): R2 alone, without R9.
  ['R2: two ways of a decision that go on in one lane never share a row; the other one goes below', 'pathRows',
    [['A', 'S:s:0 G:x:1 T1:t:2 T2:t:3 E1:e:4 U1:t:2 U2:t:3 E2:e:4']], 'S>G G>T1 T1>T2 T2>E1 G>U1 U1>U2 U2>E2',
    at => at.T1.y === at.G.y && at.T2.y === at.G.y && at.U1.y === at.U2.y && at.U1.y > at.G.y, { firstColumn: false }],
  ['R3: the step of a loop stands in the row above its gateway, in its column', 'loopAbove',
    [['A', 'S:s:0 K:t:1 H:x:2 L:t:3 E:e:3']], 'S>K K>H H>L L>K H>E',
    at => at.L.x === at.H.x && at.L.y < at.H.y],
  ['R4: a step that leaves the lane while another way stays stands in the gateway\'s column, on the side of its target lane', 'branchBelow',
    [['A', 'S:s:0 G:x:1 T:t:2 E:e:3 X:t:2'], ['B', 'Y:t:3 E2:e:4']], 'S>G G>T T>E G>X X>Y Y>E2',
    at => at.X.x === at.G.x && at.X.y > at.G.y && at.T.y === at.G.y],
  ['R5: an arm of a parallel block in another lane takes the row of that lane nearest the split', 'fan',
    [['A', 'S:s:0 P:p:1 Y:t:2 J:p:4 E:e:5'], ['B', 'S2:s:0 K:t:1 H:x:2 L:t:3 X:t:2 E2:e:5']], 'S>P P>Y P>X Y>J X>J J>E S2>K K>H H>L L>K H>E2',
    at => at.X.lane === 'B' && at.X.y < at.L.y && at.L.y < at.K.y],
  ['R6: the one step between the exit of a loop and a merge further right stands in the merge\'s column', 'jumpAbove',
    [['A', 'S:s:0 A1:t:1 G:x:2 X:t:3 L:t:3 Y:t:4 H:x:4 Z:t:5 N:t:5 W:t:6 M:x:7 E:e:8']], 'S>A1 A1>G G>X X>Y Y>Z Z>W W>M G>L L>H H>A1 H>N N>M M>E',
    at => at.N.x === at.M.x && at.N.y < at.M.y],
  // Ben's feedback on ref3 (2026-10-07): the end of a short exception stood in the split's column, inside the block.
  ['R8: a foreign node in the column of a parallel split stands left of it, outside the block', 'block',
    [['A', 'S:s:0 G:x:1 P:p:2 X:e:3 Y:t:4 J:p:5 E:e:6'], ['B', 'Z:t:2 Z2:t:3'], ['C', 'W:t:2 W2:e:3']], 'S>G G>P G>X G>W W>W2 P>Y P>Z Z>Z2 Y>J Z2>J J>E',
    at => at.X.x < at.P.x],
  ['R9: the first steps of the arms of a parallel gateway stand in one column', 'firstColumn',
    [['A', 'S:s:0 P:p:1 X:t:2 J:p:5 E:e:6'], ['B', 'S2:s:0 Z:t:1 Z2:t:2 Y:t:3 E2:e:6']], 'S>P P>X X>J P>Y Y>J J>E S2>Z Z>Z2 Z2>E2',
    at => at.X.x === at.Y.x],
  ['R11: an end whose row is free to the right stands in the last column', 'endAlign',
    [['A', 'S:s:0 G:x:1 T:t:2 E1:e:3 U:t:2 V:t:3 W:t:4 E2:e:5']], 'S>G G>T T>E1 G>U U>V V>W W>E2',
    at => at.E1.x === at.E2.x && at.E1.y !== at.E2.y],
  // Review of 2.31: R12 and R16 made up from random processes, as x-rg2 and x-wv6 show them (external inputs).
  ['R12: where the picture has crossings, a merge is tried in another lane', 'crossProbe',
    [['A', 'S:s:0 T:t:2 E:e:4'], ['B', 'G:x:1 H:x:2 U:t:2 M:x:3']], 'S>G G>H H>M G>T T>M G>U U>M M>E H>E',
    at => at.M.lane === 'B'],
  ['R16: of a gateway and a node below it in one column, the gateway is tried a column further', 'stagger',
    [['A', 'S:s:0 G:x:1 E:e:5'], ['B', 'T:t:2 X:x:2 M:x:4'], ['C', 'U:x:3']], 'S>G G>T T>U U>M G>X X>M M>E U>E X>E',
    at => at.X.x !== at.U.x],
  // Ben's feedback on x-wv6 (2026-10-07): a node of another flow between a decision and its step in another lane.
  ['R18: the step of a decision\'s way in another lane stands in the gateway\'s column; a node of another flow between gives way', 'handOver',
    [['A', 'S:s:0 T:t:1 G:x:2'], ['B', 'S2:s:0 U:t:1 X:t:2 Y:t:3'], ['C', 'V:t:3 M:x:4 M2:x:5 E:e:6']], 'S>T T>G G>V G>M V>M S2>U U>X X>Y Y>M2 M>M2 M2>E',
    at => at.V.x === at.G.x && at.X.x > at.G.x],
  ['R15: the starts of a lane stand left-aligned, each in a row of its own', 'startAlign',
    [['A', 'S1:s:0 S2:s:1 T:t:2 E:e:3']], 'S1>T S2>T T>E',
    at => at.S1.x === at.S2.x && at.S1.y !== at.S2.y],
];
// base: rules switched off in both calls, where another rule gives the guarantee too.
for (const [name, key, lanes, flows, holds, base = {}] of RULE_CASES){
  test(name, () => {
    assert.equal(holds(laidOut(lanes, flows, base)), true, 'with the rule');
    assert.equal(holds(laidOut(lanes, flows, { ...base, [key]: false })), false, 'with ' + key + ' off');
  });
}

test('the rules are switched per call: one call without a rule leaves the next as the default lays out', () => {
  const lanes = [['A', 'S1:s:0 S2:s:1 T:t:2 E:e:3']], flows = 'S1>T S2>T T>E';
  const before = laidOut(lanes, flows);
  assert.notDeepEqual(laidOut(lanes, flows, { startAlign: false }), before);
  assert.deepEqual(laidOut(lanes, flows), before);
  assert.deepEqual(laidOut(lanes, flows, {}), before);
  assert.deepEqual(laidOut(lanes, flows, { startAlign: true, compact: false, reroute: false }), before, 'R7 and the second pass are no switches');
});

test('the default rules: R1–R19 but R7, all on, frozen', () => {
  assert.deepEqual(Object.keys(DEFAULT_RULES).sort(), ['block', 'boundaryBelow', 'branchBelow', 'combProbe', 'crossProbe', 'endAlign', 'fan', 'firstColumn', 'gatewayLane', 'handOver', 'jumpAbove', 'loopAbove', 'messageSide', 'pathRows', 'rowProbe', 'stagger', 'startAlign', 'stepAside']);
  assert.ok(Object.values(DEFAULT_RULES).every(v => v === true));
  assert.ok(Object.isFrozen(DEFAULT_RULES));
  assert.throws(() => { DEFAULT_RULES.startAlign = false; }, TypeError);
  assert.equal(DEFAULT_RULES.startAlign, true);
});

test('starts docked again after the block box stand in neighbouring rows: no other row lies between two of them', () => {
  // The block box moves Q off the block's row; the four starts into Q dock to
  // it again (R15). While they are moved their rows are NaN; sorted with the
  // others, in this order of the nodes, a NaN left the lane's rows out of
  // order, and X1 went above A10's row instead of next to X3.
  const at = laidOut([['L0', 'A10:t:2 X1:s:2 J:p:3 X3:s:2 A00:t:2 Q:t:3 E:e:4 S:s:0 P:p:1 Z:e:6 R:t:4 X2:s:2 X0:s:2']],
    'S>P P>A00 A00>J P>A10 A10>J J>E Q>R R>Z X0>Q X1>Q X2>Q X3>Q');
  const starts = ['X0', 'X1', 'X2', 'X3'].map(id => at[id].y).sort((a, b) => a - b);
  const others = Object.entries(at).filter(([id]) => !/^X/.test(id)).map(([, p]) => p.y);
  for (let i = 1; i < starts.length; i++){
    assert.ok(!others.some(y => y > starts[i - 1] && y < starts[i]), 'a row between ' + starts[i - 1] + ' and ' + starts[i] + ': ' + JSON.stringify(at));
  }
});

test('the router merges two pieces of one direction: a Z whose middle piece has length 0 runs straight between its ends, no waypoint takes an x for a y', () => {
  // With every rule off, r03 and r09 each lay one flow over a Z from the gap
  // right of its source to the gap left of its target, two columns apart; its
  // middle piece has length 0. Taken as two vertical pieces, the corner
  // between them took the second one's x as its y, below the target's row.
  const off = Object.fromEntries(Object.keys(DEFAULT_RULES).map(k => [k, false]));
  for (const [name, id] of [['r03', 'F4_k1_c'], ['r09', 'F8_t2_b1']]){
    const { model, raw } = gridInput(readFixture(name).xml);
    const pts = layoutGeometry(model, raw, measureLabel, off).flows[id];
    const [lo, hi] = [pts[0][1], pts[pts.length - 1][1]].sort((a, b) => a - b);
    assert.ok(pts.every(([, y]) => y >= lo && y <= hi), name + ' ' + id + ': ' + JSON.stringify(pts));
  }
});

// ---------- several pools (story 2.12) ----------
// Two pools: "Kunde" without lanes (S1 → A → E1), "Firma" with lanes L1 (S2 → B) and L2 (C → E2); message
// flows A → S2 and C → E1's predecessor … as each case needs.
const POOLS = xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="PK" name="Kunde" processRef="P1"/><bpmn:participant id="PF" name="Firma" processRef="P2"/>' +
  '<bpmn:messageFlow id="M1" name="Anfrage" sourceRef="A" targetRef="S2"/><bpmn:messageFlow id="M2" name="Antwort" sourceRef="C" targetRef="W"/></bpmn:collaboration>' +
  '<bpmn:process id="P1"><bpmn:startEvent id="S1"/><bpmn:sendTask id="A" name="Anfragen"/><bpmn:intermediateCatchEvent id="W" name="Antwort da"/><bpmn:endEvent id="E1"/>' +
  '<bpmn:sequenceFlow id="F1" sourceRef="S1" targetRef="A"/><bpmn:sequenceFlow id="F2" sourceRef="A" targetRef="W"/><bpmn:sequenceFlow id="F3" sourceRef="W" targetRef="E1"/></bpmn:process>' +
  '<bpmn:process id="P2"><bpmn:laneSet id="LS"><bpmn:lane id="L1" name="Eingang"><bpmn:flowNodeRef>S2</bpmn:flowNodeRef><bpmn:flowNodeRef>B</bpmn:flowNodeRef></bpmn:lane>' +
  '<bpmn:lane id="L2" name="Versand"><bpmn:flowNodeRef>C</bpmn:flowNodeRef><bpmn:flowNodeRef>E2</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>' +
  '<bpmn:startEvent id="S2"/><bpmn:task id="B" name="Prüfen"/><bpmn:sendTask id="C" name="Antworten"/><bpmn:endEvent id="E2"/>' +
  '<bpmn:sequenceFlow id="G1" sourceRef="S2" targetRef="B"/><bpmn:sequenceFlow id="G2" sourceRef="B" targetRef="C"/><bpmn:sequenceFlow id="G3" sourceRef="C" targetRef="E2"/></bpmn:process>');
// Raw positions made up as LMM gives them, no message flow setting a column: each pool from column 0.
const rawOf = (model, cx) => ({ nodes: Object.fromEntries(model.nodes.map(n => [n.key, { cx: cx[n.id], cy: 0, w: 50, h: 50 }])) });
const box = (di, id) => di.nodes[id] || di.pools[id] || di.lanes[id];
const within = ([x, y, w, h], [X, Y, W, H]) => x >= X && y >= Y && x + w <= X + W && y + h <= Y + H;

test('several pools: one per participant in its order, the lanes of each next to each other, message flows between flow nodes', () => {
  const { model, leftOut } = read(POOLS);
  assert.deepEqual(model.pools, [{ id: 'PK', name: 'Kunde' }, { id: 'PF', name: 'Firma' }]);
  assert.equal(model.plane, 'K');
  assert.deepEqual(model.lanes.map(l => [l.id, l.name, l.key, l.pool, l.synthetic]), [['', 'Kunde', 'l1', 0, true], ['L1', 'Eingang', 'l2', 1, false], ['L2', 'Versand', 'l3', 1, false]]);
  assert.deepEqual(model.nodes.map(n => n.key), ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8']);
  assert.deepEqual(model.flows.map(f => f.id), ['F1', 'F2', 'F3', 'G1', 'G2', 'G3']);
  assert.deepEqual(model.messages, [{ id: 'M1', from: 'A', to: 'S2', name: 'Anfrage' }, { id: 'M2', from: 'C', to: 'W', name: 'Antwort' }]);
  assert.deepEqual([model.insert, leftOut], [null, []]);
});

test('several pools: what is left out, each a line, in the order of the XML', () => {
  const xml = POOLS.replace('<bpmn:messageFlow id="M1"', '<bpmn:messageFlow id="MI" sourceRef="S2" targetRef="C"/><bpmn:messageFlow id="MY" sourceRef="B" targetRef="NIX"/>' +
    '<bpmn:messageFlow sourceRef="B" targetRef="PK"/><bpmn:messageFlow id="MP" sourceRef="C" targetRef="PF"/><bpmn:messageFlow id="M1"');
  const { model, leftOut } = read(xml);
  assert.deepEqual(model.pools.map(p => p.id), ['PK', 'PF']);
  assert.deepEqual(model.messages.map(m => m.id), ['M1', 'M2']);
  assert.deepEqual(leftOut.map(leftOutLine), ['messageFlow MI: a message flow within one pool', 'messageFlow MY: touches NIX, which is not laid out',
    'messageFlow (no id): has no id', 'messageFlow MP: a message flow within one pool']);
});

// Story 2.29: a pool without a process of its own (a black box) beside pools with one.
const BOXES = (order, flows) => xmlOf('<bpmn:collaboration id="K">' + order.map(id => id === 'PF' ? '<bpmn:participant id="PF" name="Firma" processRef="P2"/>' : '<bpmn:participant id="' + id + '" name="' + id + '"/>').join('') + flows + '</bpmn:collaboration>' +
  '<bpmn:process id="P2"><bpmn:laneSet id="LS"><bpmn:lane id="L1" name="Eingang"><bpmn:flowNodeRef>S2</bpmn:flowNodeRef><bpmn:flowNodeRef>B</bpmn:flowNodeRef></bpmn:lane>' +
  '<bpmn:lane id="L2" name="Versand"><bpmn:flowNodeRef>C</bpmn:flowNodeRef><bpmn:flowNodeRef>E2</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>' +
  '<bpmn:startEvent id="S2"/><bpmn:task id="B" name="Prüfen"/><bpmn:sendTask id="C" name="Antworten"/><bpmn:endEvent id="E2"/>' +
  '<bpmn:sequenceFlow id="G1" sourceRef="S2" targetRef="B"/><bpmn:sequenceFlow id="G2" sourceRef="B" targetRef="C"/><bpmn:sequenceFlow id="G3" sourceRef="C" targetRef="E2"/></bpmn:process>');
const RAW_BOXES = { S2: 0, B: 100, C: 200, E2: 300 };
const layBoxes = xml => { const { model, leftOut } = read(xml); const di = layoutGeometry(model, rawOf(model, RAW_BOXES)); return { model, leftOut, di, xml: appendDiagram(xml, model, di).xml }; };
// A message flow's end at a pool: vertical, on the top or bottom edge of its frame, inside it from left to right.
const atFrame = (w, k, frame) => {
  const [p, q] = k === 'from' ? [w[0], w[1]] : [w.at(-1), w.at(-2)];
  assert.equal(p[0], q[0], 'vertical at the frame');
  assert.ok(p[1] === frame[1] || p[1] === frame[1] + frame[3], 'on the top or bottom edge: ' + JSON.stringify({ p, frame }));
  assert.ok(p[0] > frame[0] && p[0] < frame[0] + frame[2], 'within the frame');
  return p[1] === frame[1] ? 'top' : 'bottom';
};
const noSymbolCrossed = (w, di, model, except) => {
  for (let i = 1; i < w.length; i++){
    const [x1, x2, y1, y2] = [Math.min(w[i - 1][0], w[i][0]), Math.max(w[i - 1][0], w[i][0]), Math.min(w[i - 1][1], w[i][1]), Math.max(w[i - 1][1], w[i][1])];
    for (const n of model.nodes) if (!except.includes(n.id)){ const [x, y, bw, bh] = di.nodes[n.id]; assert.ok(!(x2 > x && x1 < x + bw && y2 > y && y1 < y + bh), 'through ' + n.id + ': ' + JSON.stringify(w)); }
  }
};

test('a black box below: a pool of its own without lanes, 60 px high, as wide as the others; message flows straight from their node to its top edge', () => {
  const { model, leftOut, di, xml } = layBoxes(BOXES(['PF', 'Kunde'], '<bpmn:messageFlow id="M1" name="Anfrage" sourceRef="Kunde" targetRef="S2"/><bpmn:messageFlow id="M2" name="Antwort" sourceRef="C" targetRef="Kunde"/>'));
  assert.deepEqual([model.pools, leftOut], [[{ id: 'PF', name: 'Firma' }, { id: 'Kunde', name: 'Kunde', box: true }], []]);
  assert.deepEqual(model.messages, [{ id: 'M1', from: 'Kunde', to: 'S2', name: 'Anfrage', fromPool: 1 }, { id: 'M2', from: 'C', to: 'Kunde', name: 'Antwort', toPool: 1 }]);
  const [pf, box] = [di.pools.PF, di.pools.Kunde];
  assert.equal(box[3], 60);
  assert.deepEqual([box[0], box[2]], [pf[0], pf[2]], 'as wide');
  assert.ok(box[1] >= pf[1] + pf[3] + 40, 'below, with a gap');
  assert.equal(atFrame(di.flows.M1, 'from', box), 'top');
  assert.equal(atFrame(di.flows.M2, 'to', box), 'top');
  // Straight: one piece from the node's bottom to the frame.
  assert.equal(di.flows.M2.length, 2, JSON.stringify(di.flows.M2));
  assert.equal(di.flows.M2[0][1], di.nodes.C[1] + di.nodes.C[3]);
  for (const m of ['M1', 'M2']){ noSymbolCrossed(di.flows[m], di, model, ['S2', 'C']); assert.ok(di.flowLabels[m], m + ' has its label'); }
  assert.ok(xml.includes('bpmnElement="Kunde" isHorizontal="true"') && xml.includes('bpmnElement="M1">') && xml.includes('bpmnElement="M2">'));
});

test('a black box on top and one between two pools: in the participants\' order, a gap on either side', () => {
  const top = layBoxes(BOXES(['Kunde', 'PF'], '<bpmn:messageFlow id="M1" sourceRef="Kunde" targetRef="S2"/>'));
  const [box, pf] = [top.di.pools.Kunde, top.di.pools.PF];
  assert.ok(pf[1] >= box[1] + box[3] + 40, 'the box above, with a gap');
  assert.equal(atFrame(top.di.flows.M1, 'from', box), 'bottom');
  const xml = xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="P1" processRef="Q1"/><bpmn:participant id="Bank"/><bpmn:participant id="P3" processRef="Q3"/>' +
    '<bpmn:messageFlow id="M" sourceRef="A" targetRef="C"/><bpmn:messageFlow id="N" sourceRef="A" targetRef="Bank"/></bpmn:collaboration>' +
    '<bpmn:process id="Q1"><bpmn:startEvent id="S1"/><bpmn:task id="A"/><bpmn:sequenceFlow id="F1" sourceRef="S1" targetRef="A"/></bpmn:process>' +
    '<bpmn:process id="Q3"><bpmn:startEvent id="C"/><bpmn:task id="D"/><bpmn:sequenceFlow id="F4" sourceRef="C" targetRef="D"/></bpmn:process>');
  const { model } = read(xml);
  assert.deepEqual(model.lanes.map(l => l.pool), [0, 2]);
  const di = layoutGeometry(model, rawOf(model, { S1: 0, A: 100, C: 0, D: 100 }));
  const [p1, bank, p3] = [di.pools.P1, di.pools.Bank, di.pools.P3];
  assert.ok(bank[1] >= p1[1] + p1[3] + 40 && p3[1] >= bank[1] + bank[3] + 40, JSON.stringify({ p1, bank, p3 }));
  assert.equal(atFrame(di.flows.N, 'to', bank), 'top');
  // M from the first pool to the third crosses the black box.
  const w = di.flows.M;
  assert.ok(w.slice(1).some(([, y], i) => Math.min(y, w[i][1]) < bank[1] && Math.max(y, w[i][1]) > bank[1] + bank[3]), 'it crosses the box');
});

test('a message flow at a pool with lanes ends on the edge of its frame facing the node; one between two pools runs in a gap between columns', () => {
  const xml = xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="P1" processRef="Q1"/><bpmn:participant id="Bank"/><bpmn:participant id="P3" processRef="Q3"/>' +
    '<bpmn:messageFlow id="N" sourceRef="A" targetRef="P3"/><bpmn:messageFlow id="O" sourceRef="Bank" targetRef="P1"/><bpmn:messageFlow id="Q" sourceRef="P3" targetRef="Bank"/></bpmn:collaboration>' +
    '<bpmn:process id="Q1"><bpmn:startEvent id="S1"/><bpmn:task id="A"/><bpmn:sequenceFlow id="F1" sourceRef="S1" targetRef="A"/></bpmn:process>' +
    '<bpmn:process id="Q3"><bpmn:laneSet id="LS3"><bpmn:lane id="L3" name="Eins"><bpmn:flowNodeRef>C</bpmn:flowNodeRef><bpmn:flowNodeRef>D</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>' +
    '<bpmn:startEvent id="C"/><bpmn:task id="D"/><bpmn:sequenceFlow id="F4" sourceRef="C" targetRef="D"/></bpmn:process>');
  const { model, leftOut } = read(xml);
  assert.deepEqual([model.messages.map(m => [m.id, m.fromPool, m.toPool]), leftOut], [[['N', undefined, 2], ['O', 1, 0], ['Q', 2, 1]], []]);
  const di = layoutGeometry(model, rawOf(model, { S1: 0, A: 100, C: 0, D: 100 }));
  assert.equal(atFrame(di.flows.N, 'to', di.pools.P3), 'top');
  assert.equal(atFrame(di.flows.O, 'from', di.pools.Bank), 'top');
  assert.equal(atFrame(di.flows.O, 'to', di.pools.P1), 'bottom');
  assert.equal(atFrame(di.flows.Q, 'from', di.pools.P3), 'top');
  assert.equal(atFrame(di.flows.Q, 'to', di.pools.Bank), 'bottom');
  for (const m of ['O', 'Q']){
    assert.equal(di.flows[m].length, 2, m + ' straight: ' + JSON.stringify(di.flows[m]));
    const x = di.flows[m][0][0];
    for (const n of model.nodes){ const [nx, , nw] = di.nodes[n.id]; assert.ok(x < nx || x > nx + nw, m + ' in a gap between columns, not at ' + n.id); }
  }
  noSymbolCrossed(di.flows.N, di, model, ['A']);
});

test('a message flow to a black box whose way down its column a symbol blocks goes beside it, through no symbol', () => {
  // A in the first pool and B2 in the second stand in one column; the way from A down to the box passes beside B2.
  const xml = xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="P1" processRef="Q1"/><bpmn:participant id="P2" processRef="Q2"/><bpmn:participant id="Bank"/>' +
    '<bpmn:messageFlow id="M" sourceRef="A" targetRef="Bank"/></bpmn:collaboration>' +
    '<bpmn:process id="Q1"><bpmn:startEvent id="S1"/><bpmn:task id="A"/><bpmn:sequenceFlow id="F1" sourceRef="S1" targetRef="A"/></bpmn:process>' +
    '<bpmn:process id="Q2"><bpmn:task id="B1"/><bpmn:task id="B2"/><bpmn:task id="B3"/><bpmn:sequenceFlow id="F2" sourceRef="B1" targetRef="B2"/><bpmn:sequenceFlow id="F3" sourceRef="B2" targetRef="B3"/></bpmn:process>');
  const { model } = read(xml);
  const di = layoutGeometry(model, rawOf(model, { S1: 0, A: 100, B1: 0, B2: 100, B3: 200 }));
  const cx = id => di.nodes[id][0] + di.nodes[id][2] / 2;
  assert.equal(cx('A'), cx('B2'), 'A above B2');
  assert.ok(di.flows.M.length > 2, 'not straight: ' + JSON.stringify(di.flows.M));
  atFrame(di.flows.M, 'to', di.pools.Bank);
  noSymbolCrossed(di.flows.M, di, model, ['A']);
});

// A fixture's process as a pool beside black boxes, from the participants' order: 'B' a black box, 'P' the fixture's
// process, 'Q' a small process of its own (Review of story 2.29).
const boxedFixture = (name, order) => {
  const fx = readFixture(name);
  const proc = /<(?:\w+:)?process\b[^>]*\bid="([^"]+)"/.exec(fx.xml)[1];
  const parts = order.map((k, i) => k === 'B' ? '<bpmn:participant id="BX' + i + '" name="Box"/>' : k === 'P' ? '<bpmn:participant id="PX" processRef="' + proc + '"/>' : '<bpmn:participant id="QX" processRef="QP"/>').join('');
  const xml = fx.xml.replace(/<(?:\w+:)?collaboration\b[\s\S]*?<\/(?:\w+:)?collaboration>\s*/, '').replace(/(<(?:\w+:)?process\b)/, '<bpmn:collaboration id="KX" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">' + parts + '</bpmn:collaboration>$1')
    .replace(/(<\/(?:\w+:)?definitions>)/, '<bpmn:process id="QP" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:startEvent id="QS"/><bpmn:task id="QT"/><bpmn:sequenceFlow id="QF" sourceRef="QS" targetRef="QT"/></bpmn:process>$1');
  const { model } = readModel(xml);
  // The fixture's columns (LMM's, as the page gives them) by id, under the keys the nodes get here; Q's nodes from column 0.
  const fixture = gridInput(fx.xml);
  const own = new Map(fixture.model.nodes.map(n => [n.id, fixture.raw.nodes[n.key]]));
  const raw = { nodes: Object.fromEntries(model.nodes.map(n => [n.key, own.get(n.id) || { cx: n.id === 'QS' ? 0 : 100, cy: 0, w: 50, h: 50 }])) };
  // A text annotation is measured in a width (story 2.31).
  const di = layoutGeometry(model, raw);
  return model.pools.map(p => [p.id, di.pools[p.id]]);
};
const gapsOf = frames => frames.slice(1).map(([, f], i) => f[1] - (frames[i][1][1] + frames[i][1][3]));

test('a pool below one that grows down keeps its height: its labels move with it, where they are and where they were kept (review of 2.31)', () => {
  const xml = xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="PA" name="A" processRef="P"/><bpmn:participant id="PB" name="B" processRef="Q"/></bpmn:collaboration>' +
    '<bpmn:process id="P"><bpmn:startEvent id="S" name="Los"/><bpmn:task id="T" name="Tun"/><bpmn:endEvent id="E" name="Ende"/><bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T"/><bpmn:sequenceFlow id="F2" sourceRef="T" targetRef="E"/></bpmn:process>' +
    '<bpmn:process id="Q"><bpmn:startEvent id="S2" name="Auch"/><bpmn:task id="X" name="Annehmen"/><bpmn:sequenceFlow id="G" sourceRef="S2" targetRef="X"/></bpmn:process>');
  const { model } = read(xml);
  const raw = rawOf(model, { S: 0, T: 1, E: 2, S2: 0, X: 1 });
  // The end's label below it, as tall as given: pool A grows down by it, and pool B moves down.
  const heights = [15, 100, 200].map(h => layoutGeometry(model, raw, (t, w) => t === 'Ende' ? { w: 90, h } : measureLabel(t, w)).pools.PB[3]);
  assert.deepEqual(heights, [144, 144, 144]);
});

test('a black box on top of a pool whose lanes grow upward: the pool moves down, the box keeps its gap (review of story 2.29)', () => {
  // r12's top lane grows for its labels; hund2's lanes grow for labels across a border (labelRoom()); notiz-r12's lane
  // grows by a stripe for its text annotation (review of 2.31).
  for (const name of ['r12', 'hund2', 'notiz-r12']) assert.deepEqual(gapsOf(boxedFixture(name, ['B', 'P'])), [40], name);
});

test('a black box between two pools and below one whose lanes grow keeps its gaps (review of story 2.29)', () => {
  for (const name of ['r12', 'hund2', 'notiz-r12']){
    assert.deepEqual(gapsOf(boxedFixture(name, ['P', 'B'])), [40], name + ' box below');
    assert.deepEqual(gapsOf(boxedFixture(name, ['P', 'B', 'Q'])), [40, 40], name + ' box between');
    assert.deepEqual(gapsOf(boxedFixture(name, ['Q', 'B', 'P'])), [40, 40], name + ' box between, the growing pool below');
  }
});

test('a black box without message flows is drawn; black boxes alone are nothing to place; a participant without an id and without a process is left out', () => {
  const { model, di, xml } = layBoxes(BOXES(['PF', 'Kunde'], ''));
  assert.equal(model.messages.length, 0);
  assert.equal(di.pools.Kunde[3], 60);
  assert.ok(xml.includes('bpmnElement="Kunde" isHorizontal="true"'));
  assert.throws(() => read(xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="A"/><bpmn:participant id="B"/><bpmn:messageFlow id="M" sourceRef="A" targetRef="B"/></bpmn:collaboration>')), { message: LAYOUT_NOTHING });
  const noId = read(BOXES(['PF'], '').replace('</bpmn:collaboration>', '<bpmn:participant name="Ohne"/></bpmn:collaboration>'));
  assert.deepEqual([noId.model.pools.map(p => p.id), noId.leftOut.map(leftOutLine)], [['PF'], ['participant (no id): has no id; it is not drawn as a pool']]);
});

test('processes without a collaboration: drawn as pools, the collaboration inserted before the first process, nothing else of the XML changed', () => {
  const body = '<bpmn:process id="P1" name="Kunde">' + LINE + '</bpmn:process>\n  <bpmn:process id="P2"><bpmn:task id="X" name="Tun"/></bpmn:process>';
  const xml = '<?xml version="1.0"?>\n<bpmn:definitions ' + NS + ' id="dokufix_pool_1">\n  ' + body + '\n</bpmn:definitions>\n';
  const { model } = read(xml);
  assert.deepEqual(model.insert, { id: 'dokufix_zusammenarbeit', participants: [{ id: 'dokufix_pool_1_2', name: 'Kunde', process: 'P1' }, { id: 'dokufix_pool_2', name: '', process: 'P2' }] });
  assert.deepEqual(model.pools, [{ id: 'dokufix_pool_1_2', name: 'Kunde' }, { id: 'dokufix_pool_2', name: '' }]);
  assert.equal(model.plane, 'dokufix_zusammenarbeit');
  const di = layoutGeometry(model, rawOf(model, { S: 0, T: 100, E: 200, X: 0 }));
  const out = appendDiagram(xml, model, di).xml;
  assert.ok(out.includes('\n  <bpmn:collaboration id="dokufix_zusammenarbeit">\n    <bpmn:participant id="dokufix_pool_1_2" name="Kunde" processRef="P1"/>\n    <bpmn:participant id="dokufix_pool_2" processRef="P2"/>\n  </bpmn:collaboration>\n  <bpmn:process id="P1"'), out);
  assert.equal(out.replace(/\n  <bpmn:collaboration[\s\S]*?<\/bpmn:collaboration>/, '').replace(/  <bpmndi:BPMNDiagram[\s\S]*<\/bpmndi:BPMNDiagram>\n/, ''), xml);
  assert.ok(out.includes('bpmnElement="dokufix_zusammenarbeit"') && out.includes('bpmnElement="dokufix_pool_1_2" isHorizontal="true"'));
  // A process without an id is left out, it could have no participant; a lane without an id keeps its name.
  const odd = xmlOf('<bpmn:process name="Ohne"><bpmn:task id="Q"/></bpmn:process><bpmn:process id="P3" name="Drei"><bpmn:laneSet id="LS3"><bpmn:lane name="Theke"><bpmn:flowNodeRef>R</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet><bpmn:task id="R"/></bpmn:process>' +
    '<bpmn:process id="P4" name="Vier"><bpmn:task id="U"/></bpmn:process><bpmn:process id="P5"/>');
  const r = read(odd);
  assert.deepEqual(r.model.insert.participants.map(p => [p.name, p.process]), [['Drei', 'P3'], ['Vier', 'P4']]);
  assert.deepEqual(r.model.lanes.map(l => [l.name, l.synthetic]), [['Theke', true], ['Vier', true]]);
  assert.deepEqual(r.leftOut.map(leftOutLine), ['process (no id): has no id', 'lane (no id): has no id; its row is laid out, the lane is not drawn', 'process P5: a process with nothing to lay out']);
  // The same with read again: the inserted collaboration is read as the author's would be.
  assert.deepEqual(read(out.replace(/<bpmndi:BPMNDiagram[\s\S]*<\/bpmndi:BPMNDiagram>/, '')).model.pools, model.pools);
});

test('several pools laid out: one below the other with a gap, each symbol and sequence flow in its pool, the lanes in theirs', () => {
  const { model } = read(POOLS);
  const di = layoutGeometry(model, rawOf(model, { S1: 0, A: 100, W: 200, E1: 300, S2: 0, B: 100, C: 200, E2: 300 }));
  const [pk, pf] = [di.pools.PK, di.pools.PF];
  assert.ok(pf[1] >= pk[1] + pk[3] + 40, 'a gap of 40 px at least: ' + JSON.stringify({ pk, pf }));
  assert.deepEqual([pk[0], pk[2]], [pf[0], pf[2]], 'both as wide');
  for (const l of ['L1', 'L2']) assert.ok(within(di.lanes[l], pf));
  assert.equal(di.lanes.L1[1] + di.lanes.L1[3], di.lanes.L2[1]);
  const poolOf = { S1: pk, A: pk, W: pk, E1: pk, S2: pf, B: pf, C: pf, E2: pf };
  for (const [id, p] of Object.entries(poolOf)) assert.ok(within(di.nodes[id], p), id);
  for (const f of model.flows) for (const [x, y] of di.flows[f.id]) assert.ok(within([x, y, 0, 0], poolOf[f.from]), f.id + ' at ' + [x, y]);
});

test('a message flow: from its source to its target, vertically at both ends on the side facing the other pool, through no symbol, with its name', () => {
  const { model } = read(POOLS);
  const di = layoutGeometry(model, rawOf(model, { S1: 0, A: 100, W: 200, E1: 300, S2: 0, B: 100, C: 200, E2: 300 }));
  for (const m of model.messages){
    const w = di.flows[m.id], s = box(di, m.from), t = box(di, m.to);
    const down = t[1] > s[1];
    assert.equal(w[0][0], w[1][0], m.id + ' leaves vertically');
    assert.equal(w.at(-1)[0], w.at(-2)[0], m.id + ' enters vertically');
    assert.equal(w[0][1], down ? s[1] + s[3] : s[1], m.id + ' leaves on the side facing the target');
    assert.ok(Math.abs(w.at(-1)[1] - (down ? t[1] : t[1] + t[3])) <= 1, m.id + ' enters on the side facing the source');
    for (let i = 1; i < w.length; i++){
      const [x1, x2, y1, y2] = [Math.min(w[i - 1][0], w[i][0]), Math.max(w[i - 1][0], w[i][0]), Math.min(w[i - 1][1], w[i][1]), Math.max(w[i - 1][1], w[i][1])];
      for (const n of model.nodes) if (n.id !== m.from && n.id !== m.to){ const [x, y, bw, bh] = di.nodes[n.id]; assert.ok(!(x2 > x && x1 < x + bw && y2 > y && y1 < y + bh), m.id + ' through ' + n.id); }
    }
    assert.ok(di.flowLabels[m.id], m.id + ' has its label');
  }
  // R7: the target of a message flow stands in its source's column at the earliest: S2 below A, W below C.
  const cx = id => di.nodes[id][0] + di.nodes[id][2] / 2;
  assert.ok(cx('S2') >= cx('A') - 1 && cx('W') >= cx('C') - 1, JSON.stringify({ A: cx('A'), S2: cx('S2'), C: cx('C'), W: cx('W') }));
  // In the diagram part: a shape per pool, an edge per message flow.
  const xml = appendDiagram(POOLS, model, di).xml;
  assert.ok(xml.includes('bpmnElement="PK" isHorizontal="true"') && xml.includes('bpmnElement="PF" isHorizontal="true"'));
  assert.ok(xml.includes('bpmnElement="M1">') && xml.includes('bpmnElement="M2">'));
});

test('three pools: a message flow from the first to the third crosses the second through no symbol', () => {
  const xml = xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="P1" processRef="Q1"/><bpmn:participant id="P2" processRef="Q2"/><bpmn:participant id="P3" processRef="Q3"/>' +
    '<bpmn:messageFlow id="M" sourceRef="A" targetRef="C"/></bpmn:collaboration>' +
    '<bpmn:process id="Q1"><bpmn:startEvent id="S1"/><bpmn:task id="A"/><bpmn:sequenceFlow id="F1" sourceRef="S1" targetRef="A"/></bpmn:process>' +
    '<bpmn:process id="Q2"><bpmn:task id="B1"/><bpmn:task id="B2"/><bpmn:task id="B3"/><bpmn:sequenceFlow id="F2" sourceRef="B1" targetRef="B2"/><bpmn:sequenceFlow id="F3" sourceRef="B2" targetRef="B3"/></bpmn:process>' +
    '<bpmn:process id="Q3"><bpmn:startEvent id="C"/><bpmn:task id="D"/><bpmn:sequenceFlow id="F4" sourceRef="C" targetRef="D"/></bpmn:process>');
  const { model } = read(xml);
  const di = layoutGeometry(model, rawOf(model, { S1: 0, A: 100, B1: 0, B2: 100, B3: 200, C: 0, D: 100 }));
  const w = di.flows.M;
  assert.ok(di.pools.P2[1] > di.pools.P1[1] && di.pools.P3[1] > di.pools.P2[1]);
  for (let i = 1; i < w.length; i++){
    const [x1, x2, y1, y2] = [Math.min(w[i - 1][0], w[i][0]), Math.max(w[i - 1][0], w[i][0]), Math.min(w[i - 1][1], w[i][1]), Math.max(w[i - 1][1], w[i][1])];
    for (const id of ['S1', 'B1', 'B2', 'B3', 'D']){ const [x, y, bw, bh] = di.nodes[id]; assert.ok(!(x2 > x && x1 < x + bw && y2 > y && y1 < y + bh), 'through ' + id + ': ' + JSON.stringify(w)); }
  }
  assert.ok(w.slice(1).some(([, y], i) => Math.min(y, w[i][1]) < di.pools.P2[1] && Math.max(y, w[i][1]) > di.pools.P2[1] + di.pools.P2[3]), 'it crosses the second pool');
});

test('two message flows back and forth between two symbols lie side by side, each straight, and do not cross (Ben, 2026-10-06, p-rs2)', () => {
  const xml = xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="PA" processRef="QA"/><bpmn:participant id="PB" processRef="QB"/>' +
    '<bpmn:messageFlow id="Hin" sourceRef="A" targetRef="B"/><bpmn:messageFlow id="Her" sourceRef="B" targetRef="A"/></bpmn:collaboration>' +
    '<bpmn:process id="QA"><bpmn:startEvent id="S"/><bpmn:task id="A"/><bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="A"/></bpmn:process>' +
    '<bpmn:process id="QB"><bpmn:startEvent id="T"/><bpmn:task id="B"/><bpmn:sequenceFlow id="F2" sourceRef="T" targetRef="B"/></bpmn:process>');
  const { model } = read(xml);
  const di = layoutGeometry(model, rawOf(model, { S: 0, A: 100, T: 0, B: 100 }));
  const [hin, her] = [di.flows.Hin, di.flows.Her];
  assert.equal(hin.length, 2, JSON.stringify(hin));
  assert.equal(her.length, 2, JSON.stringify(her));
  assert.notEqual(hin[0][0], her[0][0], 'side by side');
});

test('the pieces of message flows in a gap take the order with the fewest crossings (Ben, 2026-10-06, p-miwg1)', () => {
  const chain = p => [0, 1, 2, 3, 4].map(i => '<bpmn:task id="' + p + i + '"/>').join('') + [0, 1, 2, 3].map(i => '<bpmn:sequenceFlow id="' + p + 'F' + i + '" sourceRef="' + p + i + '" targetRef="' + p + (i + 1) + '"/>').join('');
  const xml = xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="PA" processRef="QA"/><bpmn:participant id="PB" processRef="QB"/>' +
    '<bpmn:messageFlow id="Ab" sourceRef="A0" targetRef="B1"/><bpmn:messageFlow id="Auf" sourceRef="B2" targetRef="A0"/></bpmn:collaboration>' +
    '<bpmn:process id="QA">' + chain('A') + '</bpmn:process><bpmn:process id="QB">' + chain('B') + '</bpmn:process>');
  const { model } = read(xml);
  const di = layoutGeometry(model, rawOf(model, Object.fromEntries(model.nodes.map(n => [n.id, Number(n.id.slice(1)) * 100]))));
  const pieces = f => di.flows[f].slice(1).map((q, i) => [di.flows[f][i], q]);
  let crossings = 0;
  for (const [p, q] of pieces('Ab')) for (const [r, s] of pieces('Auf')){
    const ph = p[1] === q[1], rh = r[1] === s[1];
    if (ph === rh) continue;
    const [h1, h2, v1, v2] = ph ? [p, q, r, s] : [r, s, p, q];
    if (Math.min(h1[0], h2[0]) < v1[0] && v1[0] < Math.max(h1[0], h2[0]) && Math.min(v1[1], v2[1]) < h1[1] && h1[1] < Math.max(v1[1], v2[1])) crossings++;
  }
  assert.equal(crossings, 0, JSON.stringify([di.flows.Ab, di.flows.Auf]));
});

test('a message flow takes no needless bends: straight up across a flow that jumps over its source, not around (Ben, 2026-10-06, p-rs1)', () => {
  const xml = xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="PA" processRef="QA"/><bpmn:participant id="PB" processRef="QB"/>' +
    '<bpmn:messageFlow id="M" sourceRef="B1" targetRef="A2"/></bpmn:collaboration>' +
    '<bpmn:process id="QA"><bpmn:task id="A0"/><bpmn:task id="A1"/><bpmn:task id="A2"/><bpmn:task id="A3"/><bpmn:sequenceFlow id="F1" sourceRef="A0" targetRef="A1"/><bpmn:sequenceFlow id="F2" sourceRef="A1" targetRef="A2"/><bpmn:sequenceFlow id="F3" sourceRef="A2" targetRef="A3"/></bpmn:process>' +
    '<bpmn:process id="QB"><bpmn:task id="B0"/><bpmn:exclusiveGateway id="G" name="Gut?"/><bpmn:task id="B1"/><bpmn:task id="B2"/><bpmn:sequenceFlow id="G1" sourceRef="B0" targetRef="G"/>' +
    '<bpmn:sequenceFlow id="G2" sourceRef="G" targetRef="B1" name="nein"/><bpmn:sequenceFlow id="G3" sourceRef="B1" targetRef="B2"/><bpmn:sequenceFlow id="G4" sourceRef="G" targetRef="B2" name="ja"/></bpmn:process>');
  const { model } = read(xml);
  // Without R9, which stacks "ja" and "nein" since 2026-10-07 (lizenzprozess-gemini), so that B1 stays in the row.
  const di = layoutGeometry(model, rawOf(model, { A0: 0, A1: 100, A2: 300, A3: 400, B0: 0, G: 100, B1: 200, B2: 300 }), measureLabel, { firstColumn: false });
  assert.equal(di.flows.M.length, 2, 'straight: ' + JSON.stringify(di.flows.M));
});

// ---------- boundary events (story 2.30) ----------
// A process from its body, laid out with columns made up: per node id its column.
function boundaryLaid(body, cols){
  const xml = xmlOf('<bpmn:process id="P">' + body + '</bpmn:process>');
  const { model, leftOut } = read(xml);
  const raw = { nodes: Object.fromEntries(model.nodes.map(n => [n.key, { cx: cols[n.id] * 100, cy: 0, w: 10, h: 10 }])) };
  const di = layoutGeometry(model, raw);
  return { model, leftOut, di, xml: appendDiagram(xml, model, di).xml };
}
const bx = ([x, y, w, h]) => ({ x, y, w, h, cx: x + w / 2, cy: y + h / 2, bottom: y + h, right: x + w });
const TIMER = '<bpmn:timerEventDefinition id="TD"/>';

test('boundary events are read with their host and whether they interrupt; their flows leave them', () => {
  const { model, leftOut } = read(xmlOf('<bpmn:process id="P">' + LINE +
    '<bpmn:boundaryEvent id="B1" name="Frist" attachedToRef="T">' + TIMER + '</bpmn:boundaryEvent>' +
    '<bpmn:boundaryEvent id="B2" cancelActivity="false" attachedToRef="T"/>' +
    '<bpmn:boundaryEvent id="B3" attachedToRef="S"/><bpmn:boundaryEvent attachedToRef="T"/><bpmn:boundaryEvent id="B5" attachedToRef="Nichts"/>' +
    '<bpmn:task id="M" name="Mahnen"/><bpmn:sequenceFlow id="FB" sourceRef="B1" targetRef="M"/><bpmn:sequenceFlow id="FM" sourceRef="M" targetRef="E"/>' +
    '<bpmn:sequenceFlow id="FI" sourceRef="M" targetRef="B2"/><bpmn:sequenceFlow id="FX" sourceRef="B3" targetRef="M"/></bpmn:process>'));
  assert.deepEqual(model.boundaries, [{ id: 'B1', name: 'Frist', host: 'T', cancel: true }, { id: 'B2', name: '', host: 'T', cancel: false }]);
  assert.deepEqual(model.flows.map(f => [f.id, f.from, f.to]), [['F1', 'S', 'T'], ['F2', 'T', 'E'], ['FB', 'B1', 'M'], ['FM', 'M', 'E']]);
  assert.deepEqual(leftOut.map(leftOutLine), [
    'boundaryEvent B3: attached to S, which is not laid out', 'boundaryEvent (no id): has no id', 'boundaryEvent B5: attached to Nichts, which is not laid out',
    'sequenceFlow FI: enters the boundary event B2', 'sequenceFlow FX: touches B3, which is not laid out']);
});

test('a message flow at a boundary event is left out, saying so', () => {
  const { model, leftOut } = read(xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="A" processRef="P"/><bpmn:participant id="Q" name="Kunde"/>' +
    '<bpmn:messageFlow id="M" sourceRef="Q" targetRef="B"/></bpmn:collaboration><bpmn:process id="P">' + LINE + '<bpmn:boundaryEvent id="B" attachedToRef="T"/></bpmn:process>'));
  assert.deepEqual(model.messages, []);
  assert.equal(leftOutLine(leftOut.find(x => x.id === 'M')), 'messageFlow M: at a boundary event, which takes no message flow yet');
});

test('a boundary event inside a sub-process is left out with its content', () => {
  const { model, leftOut } = read(xmlOf('<bpmn:process id="P">' + LINE + '<bpmn:subProcess id="SP"><bpmn:task id="I"/><bpmn:boundaryEvent id="IB" attachedToRef="I"/></bpmn:subProcess></bpmn:process>'));
  assert.deepEqual(model.boundaries, []);
  assert.equal(leftOutLine(leftOut.find(x => x.id === 'IB')), 'boundaryEvent IB: inside the sub-process SP');
});

test('a boundary event sits on its host\'s lower edge; its flow leaves it downwards to a row below, a column further', () => {
  const { di, xml } = boundaryLaid(LINE + '<bpmn:boundaryEvent id="B" name="Frist" attachedToRef="T">' + TIMER + '</bpmn:boundaryEvent>' +
    '<bpmn:task id="M" name="Mahnen"/><bpmn:endEvent id="EM"/><bpmn:sequenceFlow id="FB" sourceRef="B" targetRef="M"/><bpmn:sequenceFlow id="FM" sourceRef="M" targetRef="EM"/>',
    { S: 0, T: 1, E: 2, M: 2, EM: 3 });
  const t = bx(di.nodes.T), b = bx(di.nodes.B), m = bx(di.nodes.M);
  assert.deepEqual([b.w, b.h], [36, 36]);
  assert.equal(b.cy, t.bottom, 'the event\'s middle on the host\'s lower edge');
  assert.equal(b.cx, t.cx, 'one event: in the middle of the edge');
  assert.ok(m.y > t.bottom, 'the target below the host');
  assert.ok(m.x > t.right, 'the target a column right of the host');
  assert.equal(bx(di.nodes.EM).cy, m.cy, 'the way after it in the target\'s row');
  const w = di.flows.FB;
  assert.deepEqual(w[0], [b.cx, b.bottom], 'the flow starts at the event\'s lower tip');
  assert.ok(w[1][0] === w[0][0] && w[1][1] > w[0][1], 'and runs down');
  assert.deepEqual(w.at(-1), [m.x, m.cy]);
  assert.match(xml, /<bpmndi:BPMNShape id="B_di" bpmnElement="B"><dc:Bounds x="\d+" y="\d+" width="36" height="36"\/><bpmndi:BPMNLabel>/);
  const [lx, ly] = di.labels.B;
  assert.ok(ly >= t.bottom, 'its name below the host\'s edge');
  assert.ok(lx + 45 > b.right, 'beside the event, on its right');
});

test('two boundary events of one task stand side by side; the ways do not cross; one without a flow is drawn too', () => {
  const { di } = boundaryLaid(LINE + '<bpmn:boundaryEvent id="B1" attachedToRef="T"/><bpmn:boundaryEvent id="B2" attachedToRef="T"/><bpmn:boundaryEvent id="B3" cancelActivity="false" attachedToRef="T"/>' +
    '<bpmn:task id="M1"/><bpmn:task id="M2"/><bpmn:sequenceFlow id="G1" sourceRef="B1" targetRef="M1"/><bpmn:sequenceFlow id="G2" sourceRef="B2" targetRef="M2"/>',
    { S: 0, T: 1, E: 2, M1: 2, M2: 2 });
  const t = bx(di.nodes.T), bs = ['B1', 'B2', 'B3'].map(id => bx(di.nodes[id]));
  for (const b of bs) assert.equal(b.cy, t.bottom);
  const xs = bs.map(b => b.cx).sort((a, b) => a - b);
  assert.ok(xs[1] - xs[0] >= 36 && xs[2] - xs[1] >= 36, 'no two overlap');
  assert.ok(xs[0] >= t.x && xs[2] <= t.right, 'all on the edge');
  const [m1, m2] = [bx(di.nodes.M1), bx(di.nodes.M2)];
  assert.notEqual(m1.cy, m2.cy, 'each way a row of its own');
  // The deeper way's event stands further in: its vertical does not cross the other's horizontal.
  const [deep, flat] = m1.cy > m2.cy ? ['G1', 'G2'] : ['G2', 'G1'];
  assert.ok(di.flows[deep][0][0] < di.flows[flat][0][0]);
});

test('on a sub-process the marker in the middle of the lower edge stays free', () => {
  const { di } = boundaryLaid('<bpmn:startEvent id="S"/><bpmn:subProcess id="T"/><bpmn:endEvent id="E"/><bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T"/><bpmn:sequenceFlow id="F2" sourceRef="T" targetRef="E"/>' +
    '<bpmn:boundaryEvent id="B" attachedToRef="T"/><bpmn:endEvent id="X"/><bpmn:sequenceFlow id="G" sourceRef="B" targetRef="X"/>', { S: 0, T: 1, E: 2, X: 2 });
  const t = bx(di.nodes.T), b = bx(di.nodes.B);
  assert.ok(b.x >= t.cx + 10, 'right of the marker');
});

test('a flow from a boundary event back into its host or before it leaves the event downwards', () => {
  const { di } = boundaryLaid(LINE + '<bpmn:boundaryEvent id="B" attachedToRef="T"/><bpmn:boundaryEvent id="C" attachedToRef="T"/>' +
    '<bpmn:sequenceFlow id="R" sourceRef="B" targetRef="T"/><bpmn:sequenceFlow id="Z" sourceRef="C" targetRef="S"/>', { S: 0, T: 1, E: 2 });
  const t = bx(di.nodes.T);
  for (const [id, ev] of [['R', 'B'], ['Z', 'C']]){
    const w = di.flows[id], b = bx(di.nodes[ev]);
    assert.deepEqual(w[0], [b.cx, b.bottom]);
    assert.ok(w[1][1] > w[0][1], id + ' runs down first');
    for (let i = 1; i < w.length; i++) assert.ok(w[i - 1][0] === w[i][0] || w[i - 1][1] === w[i][1], id + ' right angles');
  }
  const r = di.flows.R.at(-1);
  assert.ok(r[0] === t.x || r[0] === t.right, 'back into the host from the side');
});

test('boundary events: the rule R17 puts the way below; without it the way stays in the host\'s row', () => {
  const body = LINE + '<bpmn:boundaryEvent id="B" attachedToRef="T"/><bpmn:task id="M"/><bpmn:endEvent id="EM"/><bpmn:sequenceFlow id="FB" sourceRef="B" targetRef="M"/><bpmn:sequenceFlow id="FM" sourceRef="M" targetRef="EM"/>';
  const xml = xmlOf('<bpmn:process id="P">' + body + '</bpmn:process>');
  const { model } = read(xml);
  const raw = { nodes: Object.fromEntries(model.nodes.map(n => [n.key, { cx: ({ S: 0, T: 1, E: 2, M: 2, EM: 3 })[n.id] * 100, cy: 0, w: 10, h: 10 }])) };
  const on = layoutGeometry(model, raw), off = layoutGeometry(model, raw, measureLabel, { boundaryBelow: false });
  assert.ok(bx(on.nodes.M).cy > bx(on.nodes.T).cy);
  assert.equal(bx(off.nodes.M).cy, bx(off.nodes.T).cy);
});

test('a flow from a boundary event takes the straighter way: down and in from the side, across a flow back rather than beside it (Ben, 2026-10-06, r12)', () => {
  const { di } = boundaryLaid('<bpmn:startEvent id="S"/><bpmn:task id="A"/><bpmn:task id="T"/><bpmn:exclusiveGateway id="G"/><bpmn:endEvent id="E"/>' +
    '<bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="A"/><bpmn:sequenceFlow id="F2" sourceRef="A" targetRef="T"/><bpmn:sequenceFlow id="F3" sourceRef="T" targetRef="G"/>' +
    '<bpmn:sequenceFlow id="F4" sourceRef="G" targetRef="A" name="Nein, weitere Unterlagen anfordern"/><bpmn:sequenceFlow id="F5" sourceRef="G" targetRef="T" name="Teilweise"/><bpmn:sequenceFlow id="F6" sourceRef="G" targetRef="E" name="Ja"/>' +
    '<bpmn:boundaryEvent id="B" name="Nach zehn Arbeitstagen ohne Entscheidung" attachedToRef="T"/><bpmn:task id="M"/><bpmn:endEvent id="EM"/><bpmn:sequenceFlow id="FB" sourceRef="B" targetRef="M" name="Frist verstrichen"/><bpmn:sequenceFlow id="FM" sourceRef="M" targetRef="EM"/>',
    { S: 0, A: 1, T: 2, G: 3, E: 4, M: 3, EM: 4 });
  assert.equal(di.flows.FB.length, 3, 'one bend: ' + JSON.stringify(di.flows.FB));
});

test('R17 in another lane: the way of a boundary event takes a row of its own there, on the side facing the host\'s lane (Ben, 2026-10-06, sonder-bahnen)', () => {
  const body = '<bpmn:laneSet id="LS"><bpmn:lane id="Oben"><bpmn:flowNodeRef>F</bpmn:flowNodeRef><bpmn:flowNodeRef>FE</bpmn:flowNodeRef><bpmn:flowNodeRef>N</bpmn:flowNodeRef><bpmn:flowNodeRef>NE</bpmn:flowNodeRef></bpmn:lane>' +
    '<bpmn:lane id="Unten"><bpmn:flowNodeRef>S</bpmn:flowNodeRef><bpmn:flowNodeRef>T</bpmn:flowNodeRef><bpmn:flowNodeRef>U</bpmn:flowNodeRef><bpmn:flowNodeRef>B</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>' +
    '<bpmn:startEvent id="S"/><bpmn:task id="T"/><bpmn:task id="U"/><bpmn:task id="F"/><bpmn:endEvent id="FE"/><bpmn:task id="N"/><bpmn:endEvent id="NE"/>' +
    '<bpmn:boundaryEvent id="B" attachedToRef="T"/><bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T"/><bpmn:sequenceFlow id="F2" sourceRef="T" targetRef="U"/>' +
    '<bpmn:sequenceFlow id="F3" sourceRef="U" targetRef="F"/><bpmn:sequenceFlow id="F4" sourceRef="F" targetRef="FE"/><bpmn:sequenceFlow id="FB" sourceRef="B" targetRef="N"/><bpmn:sequenceFlow id="F5" sourceRef="N" targetRef="NE"/>';
  const xml = xmlOf('<bpmn:process id="P">' + body + '</bpmn:process>');
  const { model } = read(xml);
  const cols = { S: 0, T: 1, U: 2, F: 3, FE: 4, N: 2, NE: 3 };
  const raw = { nodes: Object.fromEntries(model.nodes.map(n => [n.key, { cx: cols[n.id] * 100, cy: 0, w: 10, h: 10 }])) };
  const on = layoutGeometry(model, raw), off = layoutGeometry(model, raw, measureLabel, { boundaryBelow: false });
  assert.ok(bx(on.nodes.N).cy > bx(on.nodes.F).cy, 'below the lane\'s other row, toward the host');
  assert.equal(bx(on.nodes.NE).cy, bx(on.nodes.N).cy);
  assert.ok(bx(off.nodes.N).cy <= bx(off.nodes.F).cy, 'without R17 R2 puts it in the row or above, away from the host');
});

test('two boundary events whose ways meet in one node: that way goes below the host, the host\'s own flow stays straight (review of 2.30, R1)', () => {
  const { di } = boundaryLaid(LINE + '<bpmn:task id="M"/><bpmn:endEvent id="ME"/><bpmn:boundaryEvent id="B1" attachedToRef="T"/><bpmn:boundaryEvent id="B2" attachedToRef="T"/>' +
    '<bpmn:sequenceFlow id="G1" sourceRef="B1" targetRef="M"/><bpmn:sequenceFlow id="G2" sourceRef="B2" targetRef="M"/><bpmn:sequenceFlow id="F3" sourceRef="M" targetRef="ME"/>',
    { S: 0, T: 1, M: 2, E: 3, ME: 3 });
  assert.ok(bx(di.nodes.M).cy > bx(di.nodes.T).cy, 'the shared target below the host');
  assert.equal(di.flows.F2.length, 2, 'the host\'s flow straight: ' + JSON.stringify(di.flows.F2));
  // The two ways into M do not cross: a horizontal piece of one cuts no vertical piece of the other.
  const pieces = w => w.slice(1).map((q, i) => [w[i], q]);
  const cross = (u, v) => pieces(u).some(([a, b]) => a[1] === b[1] && pieces(v).some(([p, q]) => p[0] === q[0] && p[0] > Math.min(a[0], b[0]) && p[0] < Math.max(a[0], b[0]) && a[1] > Math.min(p[1], q[1]) && a[1] < Math.max(p[1], q[1])));
  assert.ok(!cross(di.flows.G1, di.flows.G2) && !cross(di.flows.G2, di.flows.G1), JSON.stringify([di.flows.G1, di.flows.G2]));
});

test('a loop or multi-instance marker in the middle of the lower edge stays free; two markers of a sub-process too (review of 2.30, R2)', () => {
  const { model, di } = boundaryLaid('<bpmn:startEvent id="S"/><bpmn:task id="T"><bpmn:standardLoopCharacteristics/></bpmn:task>' +
    '<bpmn:subProcess id="U"><bpmn:multiInstanceLoopCharacteristics/></bpmn:subProcess><bpmn:endEvent id="E"/>' +
    '<bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T"/><bpmn:sequenceFlow id="F2" sourceRef="T" targetRef="U"/><bpmn:sequenceFlow id="F3" sourceRef="U" targetRef="E"/>' +
    '<bpmn:boundaryEvent id="B" attachedToRef="T"/><bpmn:boundaryEvent id="C" attachedToRef="U"/><bpmn:endEvent id="X"/><bpmn:endEvent id="Y"/>' +
    '<bpmn:sequenceFlow id="G" sourceRef="B" targetRef="X"/><bpmn:sequenceFlow id="H" sourceRef="C" targetRef="Y"/>', { S: 0, T: 1, U: 2, E: 3, X: 2, Y: 3 });
  assert.deepEqual(model.nodes.filter(n => n.markers).map(n => [n.id, n.markers]), [['T', 1], ['U', 2]]);
  assert.ok(bx(di.nodes.B).x >= bx(di.nodes.T).cx + 10, 'beside the loop marker');
  assert.ok(bx(di.nodes.C).x >= bx(di.nodes.U).cx + 27, 'beside the "+" and the multi-instance marker');
});

test('a boundary event of a process with nothing else to lay out is named on the console (review of 2.30, R5)', () => {
  const { leftOut } = read(xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="A" processRef="P"/><bpmn:participant id="Q" processRef="R"/></bpmn:collaboration>' +
    '<bpmn:process id="P">' + LINE + '</bpmn:process><bpmn:process id="R"><bpmn:boundaryEvent id="B" attachedToRef="X"/></bpmn:process>'));
  assert.equal(leftOutLine(leftOut.find(x => x.id === 'B')), 'boundaryEvent B: attached to X, which is not laid out');
});

// ---------- text annotations (story 2.31) ----------
// A process (or, with collab, a collaboration around it and further processes) laid out with columns made up, per
// node id its column; the breaks of the rules that concern text annotations.
function notesLaid(body, cols, collab = null){
  const xml = xmlOf((collab || '') + (collab ? '' : '<bpmn:process id="P">' + body + '</bpmn:process>'));
  const { model, leftOut } = read(collab ? xmlOf(collab) : xml);
  const raw = { nodes: Object.fromEntries(model.nodes.map(n => [n.key, { cx: cols[n.id] * 100, cy: 0, w: 10, h: 10 }])) };
  const di = layoutGeometry(model, raw);
  const out = appendDiagram(collab ? xmlOf(collab) : xml, model, di).xml;
  return { model, leftOut, di, xml: out, breaks: breaksOf(out, model).filter(b => /^(note|association)-/.test(b)) };
}
const note = (id, text) => '<bpmn:textAnnotation id="' + id + '"><bpmn:text>' + text + '</bpmn:text></bpmn:textAnnotation>';
const assoc = (id, from, to) => '<bpmn:association id="' + id + '" sourceRef="' + from + '" targetRef="' + to + '"/>';
const LINE_COLS = { S: 0, T: 1, E: 2 };

test('text annotations are read with their text, line breaks kept; an association either way, at a node, an event, a flow', () => {
  const { model, leftOut } = read(xmlOf('<bpmn:process id="P">' + LINE + '<bpmn:boundaryEvent id="B" attachedToRef="T"/>' +
    '<bpmn:textAnnotation id="N1"><bpmn:text>  erste Zeile  \n  zweite   Zeile </bpmn:text></bpmn:textAnnotation>' + note('N2', 'am Fluss') + note('N3', 'am Ereignis') +
    assoc('A1', 'T', 'N1') + assoc('A2', 'N2', 'F1') + assoc('A3', 'N3', 'B') + '</bpmn:process>'));
  // The text as written, every blank and line break kept: bpmn-js draws it so (review of 2.31).
  assert.deepEqual(model.notes, [{ id: 'N1', text: '  erste Zeile  \n  zweite   Zeile ', pool: 0 }, { id: 'N2', text: 'am Fluss', pool: 0 }, { id: 'N3', text: 'am Ereignis', pool: 0 }]);
  assert.deepEqual(model.associations, [
    { id: 'A1', note: 'N1', partner: 'T', kind: 'node', toNote: true }, { id: 'A2', note: 'N2', partner: 'F1', kind: 'flow' }, { id: 'A3', note: 'N3', partner: 'B', kind: 'boundary' }]);
  assert.deepEqual(leftOut, []);
});

test('in a collaboration: a text annotation at a pool, at a black box, at a message flow', () => {
  const collab = '<bpmn:collaboration id="K"><bpmn:participant id="PA" name="A" processRef="P"/><bpmn:participant id="PB" name="Bank"/>' +
    '<bpmn:messageFlow id="M" sourceRef="T" targetRef="PB"/>' + note('N1', 'Vertrag') + assoc('A1', 'PA', 'N1') + note('N2', 'Nur SEPA') + assoc('A2', 'N2', 'PB') +
    note('N3', 'per EDI') + assoc('A3', 'M', 'N3') + '</bpmn:collaboration><bpmn:process id="P">' + LINE + '</bpmn:process>';
  const { model } = read(xmlOf(collab));
  assert.deepEqual(model.associations.map(a => [a.id, a.kind]), [['A1', 'pool'], ['A2', 'pool'], ['A3', 'message']]);
  assert.deepEqual(model.notes.map(n => [n.id, n.pool]), [['N1', 0], ['N2', 1], ['N3', null]]);
});

test('a pretty-printed text annotation is measured as bpmn-js draws it: the empty line and the indentation count (review of 2.31)', () => {
  const { model } = read(xmlOf('<bpmn:process id="P">' + LINE + '<bpmn:textAnnotation id="N">\n  <bpmn:text>\n        Bitte prüfen\n      </bpmn:text>\n</bpmn:textAnnotation>' + assoc('A', 'T', 'N') + '</bpmn:process>'));
  assert.equal(model.notes[0].text, '\n        Bitte prüfen\n      ');
  // Four lines of 14.4 px and the padding: the empty first line, the indented one, which bpmn-js cuts in the word
  // where no blank fits ("        Bitte prüfe" and "n"), and the blank last line.
  assert.equal(measureLabel(model.notes[0].text, 100).h, 72);
  assert.ok(noteSize(model.notes[0].text).h > noteSize('Bitte prüfen').h);
  // Blanks alone are no text.
  assert.deepEqual(read(xmlOf('<bpmn:process id="P">' + LINE + note('L', '\n   ') + assoc('A', 'T', 'L') + '</bpmn:process>')).model.notes, []);
});

test('a text annotation\'s text as bpmn-moddle reads it: text nodes of blanks only left out, a CDATA section kept whatever it holds (review of 2026-10-07)', () => {
  const textOf = inner => read(xmlOf('<bpmn:process id="P">' + LINE + '<bpmn:textAnnotation id="N"><bpmn:text>' + inner + '</bpmn:text></bpmn:textAnnotation>' + assoc('A', 'T', 'N') + '</bpmn:process>')).model.notes.map(n => n.text);
  assert.deepEqual(textOf('\n  <![CDATA[x]]>\n'), ['x']);
  assert.deepEqual(textOf('\n  <!-- c -->\n  Hallo\n'), ['\n  Hallo\n']);
  assert.deepEqual(textOf('Zeile 1<![CDATA[\n]]>Zeile 2'), ['Zeile 1\nZeile 2']);
  assert.deepEqual(textOf('A &amp; &amp; B'), ['A & & B']);
});

test('options.runs counts the runs of the grid per rule whose trials ran it, and changes nothing in the picture', () => {
  const { model, raw } = gridInput(readFixture('hund2').xml);
  const runs = {};
  const counted = layoutGeometry(model, raw, undefined, { ...DEFAULT_RULES, runs });
  assert.deepEqual(counted, layoutGeometry(model, raw));
  assert.ok(Object.keys(runs).every(k => ['R18', 'R10', 'R12', 'R14', 'R13', 'R16', 'R11', 'final'].includes(k)), Object.keys(runs).join());
  assert.equal(Object.values(runs).reduce((n, v) => n + v, 0), 68);
  // Without the trials the grid runs once, for the picture returned.
  const none = {};
  layoutGeometry(model, raw, undefined, { handOver: false, rowProbe: false, crossProbe: false, combProbe: false, stepAside: false, stagger: false, endAlign: false, runs: none });
  assert.deepEqual(none, { final: 1 });
});

test('options.rowOrder decides R10 by counting where the count sees a difference, else by its trial: hund2 as without it, in fewer runs', () => {
  const { model, raw } = gridInput(readFixture('hund2').xml);
  const tried = {}, counted = {};
  const di = layoutGeometry(model, raw, undefined, { ...DEFAULT_RULES, runs: tried });
  assert.deepEqual(layoutGeometry(model, raw, undefined, { ...DEFAULT_RULES, rowOrder: true, runs: counted }), di);
  assert.ok(counted.R10 < tried.R10, counted.R10 + ' < ' + tried.R10);
  // Off unless set: no rule of DEFAULT_RULES.
  assert.equal('rowOrder' in DEFAULT_RULES, false);
});

// What a hostile document of a few KB made slow, each bounded far below what it took (security review of
// 2026-10-07): the bound is a tenth of the old time or less, so a slow machine passes and a return of the old
// algorithm fails.
const msOf = fn => { const t = performance.now(); fn(); return performance.now() - t; };

test('1000 pools and processes are read in linear time: each process looked up by its id, not searched', () => {
  const n = 1000;
  let parts = '', procs = '';
  for (let i = 0; i < n; i++){ parts += '<bpmn:participant id="pa' + i + '" processRef="p' + i + '"/>'; procs += '<bpmn:process id="p' + i + '"/>'; }
  const xml = xmlOf('<bpmn:collaboration id="C">' + parts + '</bpmn:collaboration>' + procs);
  // Old: 6.6 s.
  assert.ok(msOf(() => assert.throws(() => read(xml), { message: LAYOUT_NOTHING })) < 600);
});

test('a flowNodeRef with a long run of blanks around an element: the lane set is read in linear time', () => {
  const blanks = ' '.repeat(4000);
  const xml = xmlOf('<bpmn:process id="P"><bpmn:laneSet id="LS"><bpmn:lane id="L1"><bpmn:flowNodeRef>S</bpmn:flowNodeRef><bpmn:flowNodeRef>T</bpmn:flowNodeRef>' +
    '<bpmn:flowNodeRef>E</bpmn:flowNodeRef><bpmn:flowNodeRef>' + blanks + '<bpmn:x/>' + blanks + '</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>' + LINE + '</bpmn:process>');
  const { model, raw, author } = gridInput(xml);
  const di = layoutGeometry(model, raw);
  // Old: 10 s.
  assert.ok(msOf(() => appendDiagram(xml, author, di)) < 1000);
});

test('a document deeper than the call stack is read as the parser reads it: every element found without recursion', () => {
  const depth = 20000;
  const xml = xmlOf('<bpmn:process id="P">' + LINE + '<bpmn:extensionElements>' + '<x>'.repeat(depth) + '</x>'.repeat(depth) + '</bpmn:extensionElements></bpmn:process>');
  assert.deepEqual(read(xml).model.nodes.map(n => n.id), ['S', 'T', 'E']);
});

test('what is no comment is left out, saying why: no text, no association, an association between two annotations or none', () => {
  const { model, leftOut } = read(xmlOf('<bpmn:process id="P">' + LINE + '<bpmn:task id="K" isForCompensation="true"/><bpmn:boundaryEvent id="B" attachedToRef="T"><bpmn:compensateEventDefinition id="CD"/></bpmn:boundaryEvent>' +
    '<bpmn:textAnnotation id="Leer"/>' + assoc('AL', 'Leer', 'T') + note('Allein', 'ohne Linie') + note('X', 'x') + note('Y', 'y') + assoc('AXY', 'X', 'Y') +
    assoc('AK', 'B', 'K') + note('Z', 'zu nichts') + assoc('AZ', 'Z', 'Nichts') +
    '<bpmn:subProcess id="SP"><bpmn:task id="I"/>' + note('IN', 'innen') + assoc('IA', 'I', 'IN') + '</bpmn:subProcess></bpmn:process>'));
  assert.deepEqual(model.notes, []);
  assert.deepEqual(leftOut.map(leftOutLine), [
    'textAnnotation Leer: has no text', 'association AL: its text annotation Leer has no text',
    'textAnnotation Allein: has no association to anything laid out', 'textAnnotation X: has no association to anything laid out',
    'textAnnotation Y: has no association to anything laid out', 'association AXY: between two text annotations',
    'association AK: has no text annotation at either end', 'textAnnotation Z: has no association to anything laid out', 'association AZ: touches Nichts, which is not laid out',
    'task I: inside the sub-process SP', 'textAnnotation IN: inside the sub-process SP', 'association IA: inside the sub-process SP']);
});

test('a text annotation stands right of its task first, 50 px off; its association runs level to the middle of its bracket', () => {
  // The task last, so that right of it is free.
  const { di, xml, breaks } = notesLaid('<bpmn:startEvent id="S"/><bpmn:task id="T" name="Tun"/><bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T"/>' +
    note('N', 'Checkliste') + assoc('A', 'T', 'N'), { S: 0, T: 1 });
  const t = bx(di.nodes.T), n = bx(di.notes.N);
  assert.equal(n.x, t.right + 50);
  assert.equal(n.cy, t.cy);
  // From its source, the task, to its target, the note's bracket.
  assert.deepEqual(di.associations.A, [[t.right, n.cy], [n.x, n.cy]]);
  assert.match(xml, /<bpmndi:BPMNShape id="N_di" bpmnElement="N"><dc:Bounds x="\d+" y="\d+" width="\d+" height="\d+"\/><\/bpmndi:BPMNShape>/);
  assert.match(xml, /<bpmndi:BPMNEdge id="A_di" bpmnElement="A"><di:waypoint x="\d+" y="\d+"\/><di:waypoint x="\d+" y="\d+"\/><\/bpmndi:BPMNEdge>/);
  assert.deepEqual(breaks, []);
});

test('text annotations without coordinates leave every input without one as it was', () => {
  const body = LINE + '<bpmn:task id="X" name="Weiter"/><bpmn:sequenceFlow id="F3" sourceRef="E" targetRef="X"/>'.replace(/E" targetRef="X"/, 'T" targetRef="X"');
  const plain = notesLaid(body, { ...LINE_COLS, X: 2 });
  assert.equal(plain.di.notes, undefined);
  const withNote = notesLaid(body + note('N', 'n') + assoc('A', 'X', 'N'), { ...LINE_COLS, X: 2 });
  assert.deepEqual(withNote.di.nodes, plain.di.nodes, 'the symbols stand where they stood');
});

test('two text annotations at one task, at a gateway with a label, at an event: none on another, none on a label', () => {
  const body = '<bpmn:startEvent id="S" name="Los"/><bpmn:task id="T" name="Prüfen"/><bpmn:exclusiveGateway id="G" name="Eilig?"/><bpmn:task id="A" name="Sofort"/>' +
    '<bpmn:task id="B" name="Einplanen"><bpmn:standardLoopCharacteristics id="LC"/></bpmn:task><bpmn:endEvent id="E" name="Erledigt"/>' +
    '<bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T"/><bpmn:sequenceFlow id="F2" sourceRef="T" targetRef="G"/><bpmn:sequenceFlow id="F3" sourceRef="G" targetRef="A" name="ja"/>' +
    '<bpmn:sequenceFlow id="F4" sourceRef="G" targetRef="B" name="nein"/><bpmn:sequenceFlow id="F5" sourceRef="A" targetRef="E"/><bpmn:sequenceFlow id="F6" sourceRef="B" targetRef="E"/>' +
    note('N1', 'Checkliste A verwenden') + assoc('A1', 'T', 'N1') + note('N2', 'Bei Großkunden zusätzlich Vertrag prüfen') + assoc('A2', 'T', 'N2') +
    note('N3', 'Eilig heißt: Frist kürzer als zwei Arbeitstage, oder die Geschäftsleitung hat den Auftrag ausdrücklich als dringend markiert.') + assoc('A3', 'N3', 'G') +
    note('N4', 'Wöchentlich') + assoc('A4', 'B', 'N4') + note('N5', 'Kunde per Mail informieren') + assoc('A5', 'E', 'N5');
  const { di, breaks } = notesLaid(body, { S: 0, T: 1, G: 2, A: 3, B: 3, E: 4 });
  assert.deepEqual(breaks, []);
  assert.equal(Object.keys(di.notes).length, 5);
  assert.ok(di.notes.N3[2] >= 200, 'the long one wider: ' + di.notes.N3);
});

test('a text annotation at a flow: its association ends on the flow, at the point it was placed for', () => {
  const { di, breaks } = notesLaid(LINE + note('N', 'Innerhalb von 4 Stunden') + assoc('A', 'F2', 'N'), LINE_COLS);
  const w = di.associations.A, end = w[0];
  assert.ok(nearestOnFlow(di.flows.F2.map(([x, y]) => ({ x, y })), ...end).x === end[0] && di.flows.F2.some(([, y]) => y === end[1]), 'on F2: ' + JSON.stringify(w));
  assert.deepEqual(breaks, []);
});

test('a text annotation at a pool stands right of its frame, its association level to the frame', () => {
  const collab = '<bpmn:collaboration id="K"><bpmn:participant id="PA" name="A" processRef="P"/><bpmn:participant id="PB" name="Bank"/>' +
    '<bpmn:messageFlow id="M" sourceRef="T" targetRef="PB"/>' + note('N1', 'Vertrag') + assoc('A1', 'PA', 'N1') + note('N2', 'Nur SEPA') + assoc('A2', 'N2', 'PB') +
    note('N3', 'per EDI') + assoc('A3', 'M', 'N3') + '</bpmn:collaboration><bpmn:process id="P">' + LINE + '</bpmn:process>';
  const { di, breaks } = notesLaid(null, LINE_COLS, collab);
  for (const [n, a, p] of [['N1', 'A1', 'PA'], ['N2', 'A2', 'PB']]){
    const pool = bx(di.pools[p]), box = bx(di.notes[n]);
    assert.equal(box.x, pool.right + 50);
    assert.deepEqual(di.associations[a].map(q => q[0]).sort((u, v) => u - v), [pool.right, box.x]);
  }
  assert.deepEqual(breaks, []);
});

test('text annotations at pools stand in one stack: two at one pool, those of two black boxes close together, none on another (review of 2.31)', () => {
  const long = 'Rahmenvertrag mit Laufzeit bis Ende 2027, Kündigung mit drei Monaten Frist';
  const collab = '<bpmn:collaboration id="K"><bpmn:participant id="PA" name="A" processRef="P"/><bpmn:participant id="PB" name="Bank"/><bpmn:participant id="PC" name="Amt"/>' +
    '<bpmn:messageFlow id="M" sourceRef="T" targetRef="PB"/><bpmn:messageFlow id="M2" sourceRef="PC" targetRef="E"/>' +
    note('N1', long) + assoc('A1', 'PB', 'N1') + note('N2', long) + assoc('A2', 'N2', 'PB') + note('N3', long) + assoc('A3', 'PC', 'N3') + note('N4', 'Vertrag') + assoc('A4', 'PA', 'N4') +
    '</bpmn:collaboration><bpmn:process id="P">' + LINE + '</bpmn:process>';
  const { di, breaks } = notesLaid(null, LINE_COLS, collab);
  const boxes = ['N4', 'N1', 'N2', 'N3'].map(id => bx(di.notes[id]));
  assert.ok(boxes[0].y === bx(di.pools.PA).y && boxes[1].y === bx(di.pools.PB).y, 'beside the top of their pool');
  for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i].y >= boxes[i - 1].bottom + 8, 'below the one before: ' + JSON.stringify(boxes));
  assert.deepEqual(breaks, []);
});

test('a text annotation at a message flow keeps off the pools\' frames (review of 2.31)', () => {
  const collab = '<bpmn:collaboration id="K"><bpmn:participant id="PA" name="A" processRef="P"/><bpmn:participant id="PB" name="B" processRef="Q"/>' +
    '<bpmn:messageFlow id="M" sourceRef="E" targetRef="X"/>' + note('N', 'Per Kurier mit Empfangsbestätigung und Kopie an die Buchhaltung') + assoc('A', 'M', 'N') +
    '</bpmn:collaboration><bpmn:process id="P">' + LINE + '</bpmn:process><bpmn:process id="Q"><bpmn:task id="X" name="Annehmen"/><bpmn:task id="Y" name="Weiter"/><bpmn:sequenceFlow id="G" sourceRef="X" targetRef="Y"/></bpmn:process>';
  const { di, breaks } = notesLaid(null, { ...LINE_COLS, X: 1, Y: 2 }, collab);
  const n = bx(di.notes.N);
  for (const p of ['PA', 'PB']){
    const f = bx(di.pools[p]);
    const across = (lo, hi, v) => lo < v && v < hi;
    const inside = n.right > f.x && n.x < f.right && n.bottom > f.y && n.y < f.bottom;
    assert.ok(!(inside && (across(n.y, n.bottom, f.y) || across(n.y, n.bottom, f.bottom) || across(n.x, n.right, f.x) || across(n.x, n.right, f.right))), 'across the frame of ' + p + ': ' + JSON.stringify([n, f]));
  }
  assert.deepEqual(breaks, []);
});

test('no text annotation lies on the border between two lanes: each keeps 6 px off it, in every fixture with text annotations (review of 2.31)', () => {
  for (const name of fixtureNames()){
    const fx = readFixture(name);
    if (!fx.xml.includes('textAnnotation')) continue;
    const { model, raw } = gridInput(fx.xml), di = layoutGeometry(model, raw);
    // The borders between two lanes of one pool; a box keeps NOTE_CLEAR off the line, 1 px either side of it.
    const borders = model.lanes.slice(1).filter((l, i) => (l.pool ?? 0) === (model.lanes[i].pool ?? 0) && di.lanes[l.id]).map(l => di.lanes[l.id][1]);
    // Not checked here: a text annotation in another lane than its partner's, which that lane grows around until it
    // lies LABEL_GAP (4 px) inside (labelRoom(); notiz-morgen's Notiz_Kreuzung).
    for (const [id, [, y, , h]] of Object.entries(di.notes || {})) for (const b of borders){
      if (y === b + 4 || y + h === b - 4) continue;
      assert.ok(y + h <= b - 7 || y >= b + 7, name + ': ' + id + ' at ' + y + '–' + (y + h) + ', the border at ' + b);
    }
  }
});

test('each text is measured once per width, however many trials lay the labels out (review of 2.31)', () => {
  const { model, raw } = gridInput(readFixture('notiz-r12').xml), calls = new Map();
  const di = layoutGeometry(model, raw, (t, w) => { const k = w + ':' + t; calls.set(k, (calls.get(k) || 0) + 1); return measureLabel(t, w); });
  assert.ok(Object.keys(di.notes).length && calls.size > 1);
  assert.deepEqual([...calls].filter(([, n]) => n > 1), []);
});

test('where nothing near is free, the lane grows at its border for the text annotation; the symbols keep their order (notiz-r12)', () => {
  const fx = readFixture('notiz-r12');
  const measure = measureLabel;
  const plainXml = fx.xml.replace(/<bpmn:textAnnotation[^]*?<\/bpmn:textAnnotation>|<bpmn:association [^>]*\/>/g, '');
  const { model: withNotes, raw } = gridInput(fx.xml), plain = gridInput(plainXml);
  const di = layoutGeometry(withNotes, raw, measure), before = layoutGeometry(plain.model, plain.raw, measure);
  const lane = Object.keys(di.lanes)[0];
  assert.ok(di.lanes[lane][3] > before.lanes[lane][3], 'the lane higher: ' + di.lanes[lane] + ' / ' + before.lanes[lane]);
  const order = (d, k) => Object.keys(d.nodes).sort((p, q) => d.nodes[p][k] - d.nodes[q][k] || (p < q ? -1 : 1));
  assert.deepEqual(order(di, 0), order(before, 0), 'the columns kept');
  assert.deepEqual(order(di, 1), order(before, 1), 'the rows kept');
  // No break of a text annotation or an association. (Measured at 12 px, the label of the event's flow, "Frist
  // verstrichen", was 86 px wide and the association grazed its left edge; at 11 px, bpmn-js's size, it keeps off.)
  assert.deepEqual(breaksOf(appendDiagram(fx.xml, withNotes, di).xml, withNotes).filter(b => /^(note|association)-/.test(b)), []);
});

test('the size of a text annotation: the narrowest width a third as high as wide, at least 40 px high', () => {
  assert.deepEqual(NOTE_WIDTHS, [100, 150, 200, 250]);
  assert.deepEqual(measureLabel('kurz', 100), { w: 100, h: 40 });
  // Three lines of 14.4 px and 14 px of padding, rounded: 57.
  assert.equal(measureLabel('eins\nzwei\ndrei', 100).h, 57, 'the author\'s line breaks count');
  // As diagram-js lays the text out: an empty line is a line, a line keeps its leading blanks (review of 2.31).
  assert.equal(measureLabel('\n\neins', 100).h, 57, 'empty lines count');
  assert.equal(measureLabel('          Bitte prüfen', 100).h, 43, 'the indentation counts: two lines in 86 px, where the text alone takes one');
  assert.equal(measureLabel('Bitte prüfen', 100).h, 40);
  assert.deepEqual(noteSize('kurz'), { w: 150, h: 40 }, '40 px is more than a third of 100');
  const long = 'Eilig heißt: Frist kürzer als zwei Arbeitstage, oder die Geschäftsleitung hat den Auftrag ausdrücklich als dringend markiert. Im Zweifel nachfragen.';
  assert.equal(noteSize(long).w, 250);
  assert.deepEqual(noteSize('x', (t, w) => ({ w, h: w === 200 ? 57 : 72 })), { w: 200, h: 57 }, 'Ben\'s Behandeln: 200 × 57, not 150 × 72');
});

test('the places of a text annotation: right first, then up and down right, above, below, up and down left, left; further out by round', () => {
  const c = { cx: 100, cy: 100, w: 120, h: 80 }, size = { w: 100, h: 40 };
  const near = notePlaces(c, size), far = notePlaces(c, size, 25);
  assert.deepEqual(near[0], [210, 80, 100, 40], 'right, level');
  assert.deepEqual(far[0], [235, 80, 100, 40]);
  assert.deepEqual(near[3], [185, -5, 100, 40], 'up right');
  assert.deepEqual(near.at(-3), [-110, 80, 100, 40], 'left, level, last');
});

test('the way of an association: to the bracket where the box stands right, else to the middle of its facing side', () => {
  const task = { kind: 'rect', cx: 100, cy: 100, w: 120, h: 80 };
  assert.deepEqual(associationWay([210, 80, 100, 40], task), [[210, 100], [160, 100]], 'level to the bracket');
  assert.deepEqual(associationWay([185, -5, 100, 40], task), [[185, 15], [140, 60]], 'slanted from the bracket to the outline, towards the middle');
  // Above, overlapping the task: from the middle of the box's lower side to the nearest point of the task's top, 12 px off its corner (Ben, nz05-r12).
  assert.deepEqual(associationWay([-28, -50, 150, 43], task), [[47, -7], [52, 60]]);
  assert.deepEqual(associationWay([-200, 80, 100, 40], { kind: 'circle', cx: 100, cy: 100, w: 36, h: 36 }), [[-100, 100], [82, 100]]);
  assert.deepEqual(associationWay([150, 0, 100, 40], { kind: 'point', cx: 120, cy: 200, w: 0, h: 0 }), [[150, 20], [120, 200]]);
});

test('an association may cross a flow, not run along one', () => {
  const along = [[100, 0, 0, 200]], across = [[0, 100, 300, 0]];
  assert.equal(wayAlong([[100, 50], [100, 150]], along), true);
  assert.equal(wayAlong([[102, 50], [102, 150]], along), true, 'within 3 px');
  assert.equal(wayAlong([[50, 50], [150, 50]], along), false, 'across');
  assert.equal(wayAlong([[100, 50], [100, 150]], across), false);
});
