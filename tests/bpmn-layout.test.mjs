// BPMN without coordinates, run in Node: no browser, no Mermaid, no bpmn-js.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/bpmn-layout.js reads the XML into lanes, flow nodes and flows,
// writes the Mermaid text, lays the nodes out on a grid from Mermaid's columns
// and writes them back as the diagram part. None of that needs a layout, so
// all of it is checked here: the reading on XML parsed by linkedom, the
// geometry on positions made up for the purpose. What Mermaid's rendering
// gives, and whatever linkedom reads differently from a browser (lookup by
// namespace, XML that is not well-formed), is checked by the browser runs
// (tests/vergleich.mjs, tests/durchlaeufe.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from 'linkedom';
import {
  readProcess, leftOutLine, mermaidSource, layoutGeometry, appendDiagram, DEFAULT_RULES,
  flowLabel, flowLabelPlaces, labelPlaces, bestPlace, labelSize, dedupe, orthogonal,
  growLane, labelRoom, nearestOnFlow, MERMAID_LAYOUT_VERSION, LAYOUT_SEVERAL_POOLS, LAYOUT_NOTHING, layoutStrayText,
} from '../src/app/bpmn-layout.js';
import { readFixture, readModel } from './bpmn-fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// The reference input of story 2.8: 1 pool, 4 lanes, 16 symbols, 17 flows.
const REFERENCE = fs.readFileSync(path.join(here, '../spikes/komponenten-aus-markdown/diagramme/uebergabe-ohne-koordinaten.bpmn'), 'utf8');
const NS = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"';
const xmlOf = body => '<bpmn:definitions ' + NS + ' id="D" targetNamespace="http://example.org/dokufix">' + body + '</bpmn:definitions>';
const parse = xml => new DOMParser().parseFromString(xml, 'text/xml');
const read = xml => readProcess(parse(xml));
const LINE = '<bpmn:startEvent id="S" name="Los"/><bpmn:task id="T" name="Tun"/><bpmn:endEvent id="E" name="Fertig"/>' +
  '<bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T"/><bpmn:sequenceFlow id="F2" sourceRef="T" targetRef="E"/>';

// ---------- reading ----------
test('the reference input: the pool, 4 lanes, 16 flow nodes with their kinds, 17 flows, nothing left out', () => {
  const { model, leftOut } = read(REFERENCE);
  assert.deepEqual(model.pool, { id: 'Participant_1', name: 'Übergabe an die Tourenplanung' });
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
  assert.equal(bare.pool, null);
  assert.equal(bare.plane, 'P');
  assert.deepEqual(bare.lanes.map(l => [l.id, l.nodes, l.synthetic]), [['', ['S', 'T', 'E'], true]]);
  const pooled = read(xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="Pool" name="Leihstelle" processRef="P"/></bpmn:collaboration><bpmn:process id="P">' + LINE + '</bpmn:process>')).model;
  assert.deepEqual(pooled.pool, { id: 'Pool', name: 'Leihstelle' });
  assert.equal(pooled.plane, 'K');
  assert.deepEqual(pooled.lanes.map(l => [l.name, l.synthetic]), [['Leihstelle', true]]);
});

test('a default namespace instead of a prefix reads the same', () => {
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D"><process id="P">' + LINE.replace(/bpmn:/g, '') + '</process></definitions>\n<!-- Ende -->\n';
  const { model } = read(xml);
  assert.deepEqual([model.nodes.length, model.flows.length, model.plane], [3, 2, 'P']);
});

test('the refusals: several pools, nothing to place, nodes in no lane', () => {
  const two = xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="A" processRef="P1"/><bpmn:participant id="B" processRef="P2"/></bpmn:collaboration>' +
    '<bpmn:process id="P1"><bpmn:task id="X"/></bpmn:process><bpmn:process id="P2"><bpmn:task id="Y"/></bpmn:process>');
  assert.throws(() => read(two), { message: LAYOUT_SEVERAL_POOLS });
  assert.throws(() => read(xmlOf('<bpmn:process id="P1"><bpmn:task id="X"/></bpmn:process><bpmn:process id="P2"><bpmn:task id="Y"/></bpmn:process>')), { message: LAYOUT_SEVERAL_POOLS });
  // A black-box pool beside one with a process is several pools too.
  assert.throws(() => read(xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="A" processRef="P"/><bpmn:participant id="B"/></bpmn:collaboration><bpmn:process id="P">' + LINE + '</bpmn:process>')), { message: LAYOUT_SEVERAL_POOLS });
  assert.throws(() => read(xmlOf('<bpmn:process id="P"/>')), { message: LAYOUT_NOTHING });
  assert.throws(() => read(xmlOf('<bpmn:process id="P"><bpmn:sequenceFlow id="F" sourceRef="a" targetRef="b"/></bpmn:process>')), { message: LAYOUT_NOTHING });
  // A pool without a process of its own, alone: nothing to place.
  assert.throws(() => read(xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="A" name="Draußen"/></bpmn:collaboration><bpmn:process id="P">' + LINE + '</bpmn:process>')), { message: LAYOUT_NOTHING });
  assert.throws(() => read(xmlOf('<bpmn:collaboration id="K"><bpmn:participant id="A" processRef="Q"/></bpmn:collaboration><bpmn:process id="P">' + LINE + '</bpmn:process>')), { message: LAYOUT_NOTHING });
  const stray = xmlOf('<bpmn:process id="P"><bpmn:laneSet id="LS"><bpmn:lane id="L" name="Eins"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>' +
    '<bpmn:task id="A"/><bpmn:task id="B"/><bpmn:task id="C"/></bpmn:process>');
  assert.throws(() => read(stray), { message: 'Diese Elemente liegen in keiner Bahn: B, C.' });
  assert.equal(layoutStrayText(['A']), 'Diese Elemente liegen in keiner Bahn: A.');
  assert.equal(LAYOUT_SEVERAL_POOLS, 'Mehrere Pools lassen sich ohne Koordinaten noch nicht anordnen.');
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
    '<bpmn:sequenceFlow id="F3" sourceRef="B" targetRef="Mahnen"/><bpmn:sequenceFlow id="F4" sourceRef="T" targetRef="SP_T"/></bpmn:process>');
  const { model, leftOut } = read(xml);
  assert.deepEqual(model.nodes.map(n => n.id), ['S', 'T', 'Mahnen', 'SP']);
  assert.deepEqual(model.flows.map(f => f.id), ['F1', 'F2']);
  assert.deepEqual(leftOut.map(x => x.id), ['KA', 'M', 'DA', 'B', 'SP_S', 'SP_T', 'SP_F', 'DO', 'DOB', 'DS', 'N', 'AS', 'GR', 'F3', 'F4']);
  assert.equal(leftOutLine(leftOut.find(x => x.id === 'F3')), 'sequenceFlow F3: touches B, which is not laid out');
  assert.equal(leftOutLine(leftOut.find(x => x.id === 'SP_T')), 'task SP_T: inside the sub-process SP');
  assert.equal(leftOutLine(leftOut.find(x => x.id === 'B')), 'boundaryEvent B: not laid out');
});

test('nested lanes: the inner lanes are laid out, the outer one is left out; an empty lane holds a stand-in', () => {
  const xml = xmlOf('<bpmn:process id="P"><bpmn:laneSet id="LS"><bpmn:lane id="Aussen" name="Haus"><bpmn:flowNodeRef>A</bpmn:flowNodeRef><bpmn:flowNodeRef>B</bpmn:flowNodeRef>' +
    '<bpmn:childLaneSet id="CS"><bpmn:lane id="I1" name="Oben"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane><bpmn:lane id="I2" name="Unten"><bpmn:flowNodeRef>B</bpmn:flowNodeRef></bpmn:lane></bpmn:childLaneSet></bpmn:lane>' +
    '<bpmn:lane id="Leer" name="Leer"/></bpmn:laneSet><bpmn:task id="A"/><bpmn:task id="B"/></bpmn:process>');
  const { model, leftOut } = read(xml);
  assert.deepEqual(model.lanes.map(l => [l.id, l.nodes, l.hold]), [['I1', ['A'], undefined], ['I2', ['B'], undefined], ['Leer', [], 'h3']]);
  assert.deepEqual(leftOut.map(leftOutLine), ['lane Aussen: a lane with lanes inside']);
  assert.match(mermaidSource(model), /subgraph l3\["Leer"\]\n {4}h3\[" "\]\n {2}end/);
});

test('a node two lanes name stands in the first; a reference to nothing is ignored', () => {
  const xml = xmlOf('<bpmn:process id="P"><bpmn:laneSet id="LS"><bpmn:lane id="L1"><bpmn:flowNodeRef>A</bpmn:flowNodeRef><bpmn:flowNodeRef>Nix</bpmn:flowNodeRef></bpmn:lane>' +
    '<bpmn:lane id="L2"><bpmn:flowNodeRef>A</bpmn:flowNodeRef><bpmn:flowNodeRef>B</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet><bpmn:task id="A"/><bpmn:task id="B"/></bpmn:process>');
  assert.deepEqual(read(xml).model.lanes.map(l => l.nodes), [['A'], ['B']]);
});

// ---------- the Mermaid text ----------
test('the Mermaid text: lanes as subgraphs, every id Mermaid\'s own', () => {
  // The spike's cases: ids that look like Mermaid's or like the XML's own.
  const xml = xmlOf('<bpmn:process id="Process_1"><bpmn:laneSet id="LS"><bpmn:lane id="subgraph" name="Bahn eins">' +
    ['end', 'Flow_1', 'graph', 'style', 'L_n1_n2_0'].map(id => '<bpmn:flowNodeRef>' + id + '</bpmn:flowNodeRef>').join('') + '</bpmn:lane></bpmn:laneSet>' +
    '<bpmn:startEvent id="end" name="Start"/><bpmn:task id="Flow_1" name="end"/><bpmn:exclusiveGateway id="graph"/>' +
    '<bpmn:task id="style" name="  zwei\n  Zeilen "/><bpmn:endEvent id="L_n1_n2_0"/>' +
    '<bpmn:sequenceFlow id="Process_2" sourceRef="end" targetRef="Flow_1"/><bpmn:sequenceFlow id="subgraph2" sourceRef="Flow_1" targetRef="graph" name="ja|nein"/>' +
    '<bpmn:sequenceFlow id="F" sourceRef="graph" targetRef="style"/><bpmn:sequenceFlow id="G" sourceRef="style" targetRef="L_n1_n2_0"/></bpmn:process>');
  const text = mermaidSource(read(xml).model);
  assert.equal(text, [
    'swimlane-beta LR',
    '  subgraph l1["Bahn eins"]',
    '    n1(("Start"))',
    '    n2["end"]',
    '    n3{"+"}',
    '    n4["zwei Zeilen"]',
    '    n5((" "))',
    '  end',
    '  n1 --> n2',
    '  n2 -->|"ja|nein"| n3',
    '  n3 --> n4',
    '  n4 --> n5',
    '',
  ].join('\n'));
  for (const id of ['Flow_1', 'Process_1', 'style', 'L_n1']) assert.equal(text.includes(id), false, id);
});

test('the Mermaid text: a label loses what would end it or start an entity or a Markdown string', () => {
  // As a browser reads them, entities decoded (linkedom leaves them in attributes, so the model is written here).
  const model = { lanes: [{ key: 'l1', name: 'Bahn "eins"', nodes: ['a', 'b'] }], flows: [{ from: 'a', to: 'b', name: '<b>ja</b>' }],
                  nodes: [{ id: 'a', key: 'n1', type: 'start', name: 'Start <jetzt>' }, { id: 'b', key: 'n2', type: 'task', name: 'A & B #1 `x` \\ y' }] };
  assert.equal(mermaidSource(model), 'swimlane-beta LR\n  subgraph l1["Bahn eins"]\n    n1(("Start jetzt"))\n    n2["A B 1 x y"]\n  end\n  n1 -->|"b ja /b"| n2\n');
});

test('two flows between one pair are two edges', () => {
  const xml = xmlOf('<bpmn:process id="P"><bpmn:exclusiveGateway id="G" name="Frage?"/><bpmn:task id="T" name="Ziel"/>' +
    '<bpmn:sequenceFlow id="F1" sourceRef="G" targetRef="T" name="ja"/><bpmn:sequenceFlow id="F2" sourceRef="G" targetRef="T" name="nein"/></bpmn:process>');
  const { model } = read(xml);
  assert.deepEqual(model.flows.map(f => f.id), ['F1', 'F2']);
  assert.match(mermaidSource(model), /n1 -->\|"ja"\| n2\n {2}n1 -->\|"nein"\| n2\n$/);
});

test('the Mermaid version the layout is made with is the one the epic pins', () => {
  assert.equal(MERMAID_LAYOUT_VERSION, '12.0.0');
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

test('labels: estimated at most 90 px wide, wrapped; a flow label above a horizontal piece, beside a vertical one, at a gateway right at the exit', () => {
  assert.deepEqual(labelSize('ja'), { w: 13.2, h: 15 });
  assert.equal(labelSize('Abwesenheit, nichts zu tun').h, 30);
  assert.equal(labelSize('Abwesenheit, nichts zu tun').w <= 90, true);
  const pts = ptsOf([[0, 100], [40, 100], [40, 300], [400, 300]]);
  assert.deepEqual(flowLabel(pts, 'mitte', false), [204, 281, 33, 15]);   // the longest piece, above it
  assert.deepEqual(flowLabel(pts, 'ja', true), [10, 81, 13, 15]);        // right at the exit
  assert.deepEqual(flowLabel(ptsOf([[0, 0], [0, 10], [200, 10]]), 'nein', true), [10, -9, 26, 15], 'a stub too short: the piece after it');
  assert.deepEqual(flowLabel(ptsOf([[0, 0], [0, 200]]), 'unten', true), [6, 8, 33, 15]);
});

// A model and Mermaid's positions for it: two lanes, a start, a gateway, two
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
  const [px, py, pw, ph] = di.pool, l1 = di.lanes.L1, l2 = di.lanes.L2;
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
    const size = labelSize(model.nodes.find(n => n.id === id).name), box = [x + 45 - size.w / 2, y, size.w, h];
    for (const way of Object.values(di.flows)) for (let i = 1; i < way.length; i++){
      const seg = [Math.min(way[i - 1][0], way[i][0]), Math.min(way[i - 1][1], way[i][1]), Math.abs(way[i - 1][0] - way[i][0]), Math.abs(way[i - 1][1] - way[i][1])];
      const hit = box[0] < seg[0] + seg[2] && seg[0] < box[0] + box[2] && box[1] < seg[1] + seg[3] && seg[1] < box[1] + box[3];
      assert.equal(hit, false, 'the label of ' + id + ' lies on a flow');
    }
  }
});

test('the geometry takes the label sizes from a given measure, the estimate without one', () => {
  const { model, raw } = sample();
  const asked = [];
  const di = layoutGeometry(model, raw, text => { asked.push(text); return { w: 40, h: 44 }; });
  // Each trial picture of the rules (R10–R16) asks again.
  assert.deepEqual([...new Set(asked)].sort(), ['Erledigt', 'Leserin fragt', 'Vorrätig?', 'ja', 'nein'].sort());
  for (const id of ['S', 'G', 'E']) assert.equal(di.labels[id][3], 44, id);
  for (const id of ['F2', 'F3']) assert.deepEqual(di.flowLabels[id].slice(2), [40, 44], id);
  const estimated = layoutGeometry(model, raw);
  assert.equal(estimated.labels.S[3], labelSize('Leserin fragt').h);
});

test('the geometry refuses positions that lack a node; Mermaid\'s lanes and flows it does not read', () => {
  const { model, raw } = sample();
  assert.throws(() => layoutGeometry(model, { ...raw, nodes: { ...raw.nodes, n3: undefined } }), /„A“ nicht angeordnet/);
  assert.deepEqual(layoutGeometry(model, { nodes: raw.nodes }), layoutGeometry(model, raw));
});

test('without lanes no lane is written; without a participant no pool', () => {
  const { model } = read(xmlOf('<bpmn:process id="P">' + LINE + '</bpmn:process>'));
  const raw = { nodes: { n1: { cx: 50, cy: 50, w: 60, h: 60 }, n2: { cx: 200, cy: 50, w: 120, h: 50 }, n3: { cx: 350, cy: 50, w: 60, h: 60 } },
                lanes: { l1: { x1: 0, y1: 0, x2: 400, y2: 100 } }, edges: [[P(80, 50), P(140, 50)], [P(260, 50), P(320, 50)]] };
  const di = layoutGeometry(model, raw);
  assert.equal(di.pool, null);
  assert.deepEqual(di.lanes, {});
  const { xml } = appendDiagram(xmlOf('<bpmn:process id="P">' + LINE + '</bpmn:process>'), model, di);
  assert.equal((xml.match(/<bpmndi:BPMNShape /g) || []).length, 3);
  assert.match(xml, /<bpmndi:BPMNPlane id="dokufix_plane" bpmnElement="P">/);
});

// ---------- the diagram part (AC3) ----------
test('the diagram part is added before the closing definitions tag; the author\'s XML stays as written', () => {
  const { xml, model, raw } = sample();
  // R1 off: the end stays in its lane, and the lane set as written.
  const { xml: out, diagram } = appendDiagram(xml, model, layoutGeometry(model, raw, labelSize, { gatewayLane: false }));
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

test('the lane set follows the grid: the layout names each node\'s lane in laneOf, and that lane gets its flowNodeRef, not the one its box lies in', () => {
  const { xml, model, raw } = sample();
  const di = layoutGeometry(model, raw);
  assert.deepEqual(Object.keys(di.laneOf).sort(), ['A', 'B', 'E', 'G', 'S']);
  assert.ok(Object.values(di.laneOf).every(id => id === 'L1' || id === 'L2'));
  const lanesOf = out => Object.fromEntries(read(out).model.lanes.flatMap(l => l.nodes.map(id => [id, l.id])));
  assert.deepEqual(lanesOf(appendDiagram(xml, model, di).xml), di.laneOf, 'as laid out');
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
  assert.match(out, /id="dokufix_diagram_2"/);
  assert.match(out, /id="S_di_2" bpmnElement="S"/);
  assert.throws(() => appendDiagram('<definitions/>', model, di), { message: LAYOUT_NOTHING });
});

test('the reference input end to end, with positions in the shape Mermaid gives: one shape per pool, lane and symbol, one edge per flow', () => {
  const { model } = read(REFERENCE);
  // A grid as Mermaid would lay it out: each lane a row, the nodes in it in the order of the XML.
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
test('a flow from a node to itself is left out, so Mermaid never sees it', () => {
  const { model, leftOut } = read(xmlOf('<bpmn:process id="P">' + LINE + '<bpmn:sequenceFlow id="Nochmal" sourceRef="T" targetRef="T" name="nochmal"/></bpmn:process>'));
  assert.deepEqual(model.flows.map(f => f.id), ['F1', 'F2']);
  assert.deepEqual(leftOut.map(leftOutLine), ['sequenceFlow Nochmal: a flow from a node to itself']);
  assert.equal(mermaidSource(model).includes('n2 --> n2'), false);
});

test('a lane without an id keeps its row and is not written; a participant without an id gets no pool', () => {
  const xml = xmlOf('<bpmn:collaboration id="K"><bpmn:participant name="Ohne" processRef="P"/></bpmn:collaboration><bpmn:process id="P"><bpmn:laneSet id="LS">' +
    '<bpmn:lane name="X"><bpmn:flowNodeRef>S</bpmn:flowNodeRef><bpmn:flowNodeRef>T</bpmn:flowNodeRef></bpmn:lane><bpmn:lane id="L2" name="Y"><bpmn:flowNodeRef>E</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>' + LINE + '</bpmn:process>');
  const { model, leftOut } = read(xml);
  assert.equal(model.pool, null);
  assert.deepEqual(model.lanes.map(l => [l.id, l.nodes, l.synthetic]), [['', ['S', 'T'], true], ['L2', ['E'], false]]);
  assert.deepEqual(leftOut.map(leftOutLine), ['lane (no id): has no id; its row is laid out, the lane is not drawn', 'participant (no id): has no id; it is not drawn as a pool']);
  assert.match(mermaidSource(model), /subgraph l1\["X"\]/);
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
  const fx = readFixture('r06'), { model } = readModel(fx.xml);
  const di = layoutGeometry(model, fx.raw);
  const [px, py, pw, ph] = di.pool, lane = di.lanes.Lane_1;
  const inside = ([x, y]) => x >= lane[0] + 12 && x <= lane[0] + lane[2] - 12 && y >= py + 12 && y <= py + ph - 12;
  for (const way of Object.values(di.flows)) for (const p of way) assert.ok(inside(p), JSON.stringify(p) + ' outside ' + JSON.stringify(di.pool));
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
  assert.deepEqual(flowLabel(pts, 'ja', true, [first]), [135, 104, 13, 15]);
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
  assert.equal(h, labelSize(text).h);
  assert.ok(h >= 60);
});

test('an event label with its four near places taken goes to a farther one; with every place covered, to the one covered least', () => {
  const c = node(100, 100, 36, 36), size = labelSize('Erledigt');
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
    const [x, y, w, h] = di.labels[id], size = labelSize(model.nodes.find(n => n.id === id).name);
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
    const di = layoutGeometry(model, raw, labelSize, options);
    const y = di.lanes.Y, [px, py, pw, ph] = di.pool, t = di.nodes.T, e = di.nodes.E;
    assert.ok(y[1] >= t[1] + t[3], 'lane Y starts below the task of lane X: ' + JSON.stringify({ y, t }));
    assert.equal(e[1] >= y[1] && e[1] + e[3] <= y[1] + y[3], inY, 'E in lane Y: ' + inY);
    if (!inY) assert.equal(e[1] + e[3] / 2, t[1] + t[3] / 2, 'E in the row of T');
    assert.equal(py, 0, 'the pool starts with the top lane');
    assert.equal(py + ph, y[1] + y[3], 'the pool ends with the bottom lane');
    assert.equal(px + pw, y[0] + y[2]);
  }
});

test('a flow from a node to itself whose node is not laid out names it once', () => {
  const { leftOut } = read(xmlOf('<bpmn:process id="P">' + LINE + '<bpmn:boundaryEvent id="Z" attachedToRef="T"/><bpmn:sequenceFlow id="ZZ" sourceRef="Z" targetRef="Z"/></bpmn:process>'));
  assert.equal(leftOutLine(leftOut.find(x => x.id === 'ZZ')), 'sequenceFlow ZZ: touches Z, which is not laid out');
});

// ---------- the rules of the grid (story 2.27) ----------
// A process in one pool from a short description: per lane 'id:kind:column …'
// (kind s start, e end, x exclusive gateway, p parallel gateway, t task, i
// intermediate event; column Mermaid's), flows 'from>to …'. Mermaid's raw
// positions are the columns alone: the grid reads no more. Returns per node
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
  const di = layoutGeometry(model, raw, labelSize, options);
  const inLane = y => Object.keys(di.lanes).find(l => y >= di.lanes[l][1] && y <= di.lanes[l][1] + di.lanes[l][3]);
  return Object.fromEntries(model.nodes.map(n => { const [x, y, w, h] = di.nodes[n.id]; return [n.id, { x: x + w / 2, y: y + h / 2, lane: inLane(y + h / 2) }]; }));
}
// Each rule's guarantee holds with the rule, and not with its switch off.
const RULE_CASES = [
  ['R1: a gateway stands in the lane of its nearest predecessor; the way changes lane after the decision', 'gatewayLane',
    [['A', 'S:s:0 T:t:1'], ['B', 'G:x:2 U:t:3 V:t:3 E:e:4']], 'S>T T>G G>U G>V U>E V>E',
    at => at.G.lane === 'A'],
  ['R2: two ways of a decision that go on in one lane never share a row; the other one goes below', 'pathRows',
    [['A', 'S:s:0 G:x:1 T1:t:2 T2:t:3 E1:e:4 U1:t:2 U2:t:3 E2:e:4']], 'S>G G>T1 T1>T2 T2>E1 G>U1 U1>U2 U2>E2',
    at => at.T1.y === at.G.y && at.T2.y === at.G.y && at.U1.y === at.U2.y && at.U1.y > at.G.y],
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
  ['R9: the first steps of the arms of a parallel gateway stand in one column', 'firstColumn',
    [['A', 'S:s:0 P:p:1 X:t:2 J:p:5 E:e:6'], ['B', 'S2:s:0 Z:t:1 Z2:t:2 Y:t:3 E2:e:6']], 'S>P P>X X>J P>Y Y>J J>E S2>Z Z>Z2 Z2>E2',
    at => at.X.x === at.Y.x],
  ['R11: an end whose row is free to the right stands in the last column', 'endAlign',
    [['A', 'S:s:0 G:x:1 T:t:2 E1:e:3 U:t:2 V:t:3 W:t:4 E2:e:5']], 'S>G G>T T>E1 G>U U>V V>W W>E2',
    at => at.E1.x === at.E2.x && at.E1.y !== at.E2.y],
  ['R15: the starts of a lane stand left-aligned, each in a row of its own', 'startAlign',
    [['A', 'S1:s:0 S2:s:1 T:t:2 E:e:3']], 'S1>T S2>T T>E',
    at => at.S1.x === at.S2.x && at.S1.y !== at.S2.y],
];
for (const [name, key, lanes, flows, holds] of RULE_CASES){
  test(name, () => {
    assert.equal(holds(laidOut(lanes, flows)), true, 'with the rule');
    assert.equal(holds(laidOut(lanes, flows, { [key]: false })), false, 'with ' + key + ' off');
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

test('the default rules: R1–R16 but R7, all on, frozen', () => {
  assert.deepEqual(Object.keys(DEFAULT_RULES).sort(), ['block', 'branchBelow', 'combProbe', 'crossProbe', 'endAlign', 'fan', 'firstColumn', 'gatewayLane', 'jumpAbove', 'loopAbove', 'pathRows', 'rowProbe', 'stagger', 'startAlign', 'stepAside']);
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
    const fx = readFixture(name), { model } = readModel(fx.xml);
    const pts = layoutGeometry(model, fx.raw, t => fx.sizes[t] || labelSize(t), off).flows[id];
    const [lo, hi] = [pts[0][1], pts[pts.length - 1][1]].sort((a, b) => a - b);
    assert.ok(pts.every(([, y]) => y >= lo && y <= hi), name + ' ' + id + ': ' + JSON.stringify(pts));
  }
});
