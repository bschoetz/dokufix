// BPMN without coordinates, run in Node: no browser, no Mermaid, no bpmn-js.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/bpmn-layout.js reads the XML into lanes, flow nodes and flows,
// writes the Mermaid text, computes the coordinates from Mermaid's positions
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
  readProcess, leftOutLine, mermaidSource, layoutGeometry, appendDiagram, axisMap, attach, nudge, detour, tidy, fanOut, spreadPorts, separateTwins,
  flowLabel, flowLabelPlaces, labelPlaces, bestPlace, labelSize, exitSide, dedupe, unfold, orthogonal, loopBack, LEVEL_STEP,
  portEnds, portCandidates, conflictScore, growLane, dockApart, labelRoom, nearestOnFlow, MERMAID_LAYOUT_VERSION, LAYOUT_SEVERAL_POOLS, LAYOUT_NOTHING, layoutStrayText,
} from '../src/app/bpmn-layout.js';

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

test('the axis is scaled piecewise: each column to its size, each gap into 36 to 70 px, order kept', () => {
  const map = axisMap([{ lo: 0, hi: 200, size: 120 }, { lo: 300, hi: 340, size: 36 }, { lo: 1000, hi: 1100, size: 50 }, { lo: 20, hi: 180, size: 50 }], 36, 70);
  assert.equal(map(0), 0);
  assert.equal(map(200), 120);
  assert.equal(map(300), 180);            // 120 + gap min(70, max(36, 100 · 0.6))
  assert.equal(map(340), 216);
  assert.equal(map(1000), 286);           // the long gap is held at 70
  assert.equal(map(1100), 336);
  assert.equal(map(-10), -10);            // beyond the ends: unscaled
  assert.equal(map(1110), 346);
  const values = [-5, 0, 50, 199, 250, 320, 600, 1050, 1200].map(map);
  assert.deepEqual(values, [...values].sort((a, b) => a - b), 'monotonic');
});

test('a flow end is docked on the outline: a task anywhere on its side, a circle and a diamond on their axis', () => {
  const task = node(100, 100, 120, 80, true), circle = node(300, 100, 36, 36);
  // Horizontal end into the left side of a task, 15 px off its centre: kept, on the side.
  let pts = ptsOf([[0, 115], [50, 115]]);
  attach(pts, false, task);
  assert.deepEqual(pts.at(-1), P(40, 115));
  // Closer than NEAR to the middle, 10 px off: at the middle; the flow turns halfway to get there.
  pts = ptsOf([[0, 110], [50, 110]]);
  attach(pts, false, task);
  assert.deepEqual(pts.at(-1), P(40, 100));
  assert.ok(pts.every((p, i) => !i || p.x === pts[i - 1].x || p.y === pts[i - 1].y), 'right angles kept');
  pts = ptsOf([[0, 112], [50, 112]]);
  attach(pts, false, task);
  assert.deepEqual(pts.at(-1), P(40, 112), '12 px off is kept');
  // Into a circle off its axis: a jog is put in, the end is on the axis.
  pts = ptsOf([[200, 110], [250, 110]]);
  attach(pts, false, circle);
  assert.deepEqual(pts.at(-1), P(282, 100));
  assert.ok(pts.every((p, i) => !i || p.x === pts[i - 1].x || p.y === pts[i - 1].y), 'right angles kept');
  // An end that ran beside its node in Mermaid's positions docks from that side.
  pts = ptsOf([[100, 300], [130, 300], [130, 160]]);
  attach(pts, false, task, { axis: 'x', sign: 1 });
  assert.deepEqual(pts.at(-1), P(160, 100));
});

test('a flow keeps 12 px to its own symbol before it turns: a run 1 px inside its task moves 12 px off it, the other end kept', () => {
  const task = node(100, 100, 120, 80, true);
  // Mermaid's run lies 1 px above the task's bottom once scaled (story 2.20, the dog's loop).
  const pts = ptsOf([[130, 120], [130, 139], [300, 139], [300, 300]]);
  attach(pts, true, task);
  assert.deepEqual(pts, ptsOf([[130, 140], [130, 152], [300, 152], [300, 300]]));
  // A run already 12 px or more off its side stays where it is.
  const far = ptsOf([[130, 120], [130, 160], [300, 160], [300, 300]]);
  attach(far, true, task);
  assert.deepEqual(far, ptsOf([[130, 140], [130, 160], [300, 160], [300, 300]]));
  // The same at the end of a flow, leaving by the side: the run moves, the start stays.
  const end = ptsOf([[0, 300], [165, 300], [165, 85], [150, 85]]);
  attach(end, false, task);
  assert.deepEqual(end, ptsOf([[0, 300], [172, 300], [172, 85], [160, 85]]));
  // At the end, with corners put in before it: the run beside the symbol is the one that moves.
  const bent = ptsOf([[200, 300], [155, 150], [155, 138]]);
  attach(bent, false, task);
  assert.deepEqual(bent, ptsOf([[200, 300], [155, 150], [155, 152], [148, 152], [148, 140]]));
});

test('correction 1: an inner piece through a foreign symbol moves beside it', () => {
  const pts = ptsOf([[0, 0], [0, 45], [100, 45], [100, 120]]);
  nudge(pts, [{ x1: 40, y1: 30, x2: 80, y2: 70 }]);
  assert.deepEqual(pts.map(p => p.y), [0, 18, 18, 120]);
});

test('correction 2: an end piece through a foreign symbol docks from the side and runs outside both', () => {
  const c = node(100, 100, 120, 80, true);
  const pts = ptsOf([[150, 140], [150, 300], [400, 300]]);
  detour(pts, true, c, [{ x1: 130, y1: 180, x2: 250, y2: 260 }]);
  assert.deepEqual(pts.slice(0, 3), [P(160, 100), P(262, 100), P(262, 300)]);
});

test('correction 3: steps of up to 5 px are smoothed, the ends stay, points on a line go', () => {
  const pts = ptsOf([[0, 0], [50, 0], [50, 3], [100, 3], [100, 50]]);
  tidy(pts);
  assert.deepEqual(pts, ptsOf([[0, 0], [100, 0], [100, 50]]));
  const untouched = ptsOf([[0, 0], [50, 0], [50, 30], [100, 30]]);
  tidy(untouched);
  assert.equal(untouched.length, 4);
});

test('correction 4: of two flows leaving a gateway at one corner, the one that turns takes the free corner', () => {
  const box = { G: node(100, 100, 50, 50), A: node(300, 100, 120, 80, true), B: node(300, 300, 120, 80, true) };
  const routes = [
    { f: { from: 'G', to: 'A' }, pts: ptsOf([[125, 100], [240, 100]]), obstacles: [] },
    { f: { from: 'G', to: 'B' }, pts: ptsOf([[125, 100], [150, 100], [150, 300], [240, 300]]), obstacles: [] },
  ];
  fanOut(routes, box, ['G']);
  assert.deepEqual(routes[1].pts[0], P(100, 125), 'from the bottom corner');
  assert.equal(exitSide(routes[1].pts), 'y+');
  assert.equal(exitSide(routes[0].pts), 'x+');
});

test('correction 5: an arrow in and an arrow out at one place on a task move apart', () => {
  const box = { A: node(100, 100, 120, 80, true), B: node(300, 100, 120, 80, true), C: node(300, 300, 120, 80, true) };
  const routes = [
    { f: { from: 'A', to: 'B' }, pts: ptsOf([[160, 100], [240, 100]]) },
    { f: { from: 'C', to: 'A' }, pts: ptsOf([[240, 300], [200, 300], [200, 104], [160, 104]]) },
  ];
  spreadPorts(routes, box);
  assert.equal(routes[0].pts[0].y, 100);
  assert.equal(routes[1].pts.at(-1).y, 118);
  assert.equal(routes[1].pts.at(-2).y, 118);
});

test('correction 6: the second flow between one pair runs below both nodes, the third above; nodes one above the other, beside', () => {
  const box = { G: node(100, 100, 50, 50), T: node(300, 100, 120, 80, true), U: node(100, 300, 120, 80, true) };
  const same = () => ptsOf([[125, 100], [240, 100]]);
  const routes = [1, 2, 3].map(() => ({ f: { from: 'G', to: 'T' }, pts: same(), obstacles: [] }));
  separateTwins(routes, box);
  assert.deepEqual(routes[0].pts, same());
  assert.deepEqual(routes[1].pts, ptsOf([[100, 125], [100, 160], [300, 160], [300, 140]]));
  assert.deepEqual(routes[2].pts, ptsOf([[100, 75], [100, 40], [300, 40], [300, 60]]));
  const stacked = [1, 2].map(() => ({ f: { from: 'G', to: 'U' }, pts: ptsOf([[100, 125], [100, 260]]), obstacles: [] }));
  separateTwins(stacked, box);
  assert.deepEqual(stacked[1].pts, ptsOf([[125, 100], [180, 100], [180, 300], [160, 300]]));
  // A way a foreign symbol blocks is not taken.
  const blocked = [1, 2].map(() => ({ f: { from: 'G', to: 'T' }, pts: same(), obstacles: [{ x1: 180, y1: 150, x2: 220, y2: 170 }] }));
  separateTwins(blocked, box);
  assert.deepEqual(blocked[1].pts, same());
});

test('correction 6: the level of a twin lies 20 px beyond the tallest symbol of the row within its span, not 5 px under it', () => {
  const box = { G1: node(100, 100, 50, 50), T: node(250, 100, 120, 80, true), G2: node(400, 100, 50, 50) };
  const routes = [1, 2, 3].map(() => ({ f: { from: 'G1', to: 'G2' }, pts: ptsOf([[125, 100], [375, 100]]), obstacles: [{ x1: 190, y1: 60, x2: 310, y2: 140 }] }));
  separateTwins(routes, box);
  assert.deepEqual(routes[1].pts, ptsOf([[100, 125], [100, 160], [400, 160], [400, 125]]), 'below the task\'s bottom at 140, not the diamonds\' at 125');
  assert.deepEqual(routes[2].pts, ptsOf([[100, 75], [100, 40], [400, 40], [400, 75]]), 'above the task\'s top at 60');
});

test('correction 6: a twin keeps off the first flow of its pair where Mermaid already ran it 20 px beyond the row', () => {
  const box = { G1: gateway(100, 100), T: node(250, 100, 120, 80, true), G2: gateway(400, 100) };
  const obstacles = [{ x1: 190, y1: 60, x2: 310, y2: 140 }];
  const first = ptsOf([[100, 125], [100, 160], [400, 160], [400, 125]]);
  const routes = [
    { f: { from: 'G1', to: 'G2' }, pts: ptsOf([[100, 125], [100, 160], [400, 160], [400, 125]]), obstacles },
    { f: { from: 'G1', to: 'G2' }, pts: ptsOf([[100, 125], [100, 162], [400, 162], [400, 125]]), obstacles },
  ];
  separateTwins(routes, box);
  assert.deepEqual(routes[0].pts, first, 'the first keeps Mermaid\'s route');
  assert.deepEqual(routes[1].pts, ptsOf([[100, 125], [100, 180], [400, 180], [400, 125]]), '20 px beyond the first, not on it');
});

// ---------- correction 7: flows back within a row (story 2.20) ----------
test('correction 7: a flow back within a row runs around the row, four points, none in the row\'s band', () => {
  const box = { A: node(100, 100, 120, 80, true), B: node(300, 100, 120, 80, true), G: node(450, 100, 50, 50) };
  const routes = [
    { f: { from: 'A', to: 'B' }, pts: ptsOf([[160, 100], [240, 100]]), obstacles: [] },
    { f: { from: 'B', to: 'G' }, pts: ptsOf([[360, 100], [425, 100]]), obstacles: [] },
    // Mermaid's route, scaled: on the bottom edges of the tasks.
    { f: { from: 'G', to: 'A' }, pts: ptsOf([[450, 125], [450, 141], [100, 141], [100, 140]]), obstacles: [], loopSide: 1 },
  ];
  assert.deepEqual(loopBack(routes, box), { up: 0, down: 0 });
  assert.deepEqual(routes[2].pts, ptsOf([[450, 125], [450, 160], [100, 160], [100, 140]]), 'out of the diamond\'s bottom, 20 px under the tasks, into the task\'s bottom');
  assert.ok(routes[2].pts.slice(1, 3).every(p => p.y > 140 || p.y < 60), 'no inner point in the row\'s band');
  assert.deepEqual(routes[0].pts, ptsOf([[160, 100], [240, 100]]), 'a flow forward stays');
});

test('correction 7: nested flows back on one side take distinct levels, the shorter inside; disjoint spans share the innermost', () => {
  const box = Object.fromEntries([1, 2, 3, 4, 5, 6].map(i => ['T' + i, node(i * 200 - 100, 100, 120, 80, true)]));
  const back = (from, to) => ({ f: { from, to }, pts: ptsOf([[box[from].cx, 60], [box[from].cx, 50], [box[to].cx, 50], [box[to].cx, 60]]), obstacles: [], loopSide: -1 });
  const routes = [back('T6', 'T1'), back('T4', 'T3'), back('T5', 'T2')];
  loopBack(routes, box);
  const level = r => r.pts[1].y;
  assert.ok(routes.every(r => r.pts.length === 4 && level(r) < 60), 'all above the row: ' + JSON.stringify(routes.map(r => r.pts)));
  assert.equal(level(routes[1]), 40, 'the shortest 20 px above the tasks');
  assert.equal(level(routes[2]), 40 - LEVEL_STEP, 'around it: the next level');
  assert.equal(level(routes[0]), 40 - 2 * LEVEL_STEP, 'the longest, around both, outermost');
  assert.deepEqual(routes[0].pts, ptsOf([[1100, 60], [1100, 40 - 2 * LEVEL_STEP], [100, 40 - 2 * LEVEL_STEP], [100, 60]]));
  const apart = [back('T2', 'T1'), back('T6', 'T5')];
  loopBack(apart, box);
  assert.deepEqual(apart.map(level), [40, 40], 'disjoint spans: one level');
  // Spans that overlap only partly: on one side the outer would cross the
  // inner, so the second takes the other side, 20 px below the tasks.
  const staggered = [back('T3', 'T1'), back('T4', 'T2')];
  loopBack(staggered, box);
  assert.deepEqual(staggered.map(level), [40, 160], 'partly overlapping: one above, one below');
  // Spans less than 12 px apart count as overlapping, 12 px or more apart do not.
  const events = x => Object.fromEntries(x.map((cx, i) => ['E' + i, node(cx, 100, 36, 36)]));
  const backOn = (b, from, to) => ({ f: { from, to }, pts: ptsOf([[b[from].cx, 82], [b[from].cx, 70], [b[to].cx, 70], [b[to].cx, 82]]), obstacles: [], loopSide: -1 });
  for (const [gap, levels] of [[10, 2], [12, 1]]){
    const b = events([100, 300, 300 + gap, 500]);
    const two = [backOn(b, 'E1', 'E0'), backOn(b, 'E3', 'E2')];
    loopBack(two, b);
    assert.equal(new Set(two.map(level)).size, levels, gap + ' px apart: ' + JSON.stringify(two.map(level)));
  }
});

test('correction 4 leaves a ring of correction 7 as it is: rebuilt from its pieces it would run through the row', () => {
  const box = { A: node(100, 100, 120, 80, true), G: node(300, 100, 50, 50), B: node(300, 300, 120, 80, true) };
  const ring = { f: { from: 'G', to: 'A' }, pts: ptsOf([[300, 125], [300, 160], [100, 160], [100, 140]]), obstacles: [], loop: true };
  const down = { f: { from: 'G', to: 'B' }, pts: ptsOf([[300, 125], [300, 260]]), obstacles: [] };
  const before = JSON.stringify(ring.pts);
  fanOut([ring, down], box, new Set(['G']));
  assert.equal(JSON.stringify(ring.pts), before);
});

test('correction 7: a flow back keeps off the ring of a twin, which separateTwins() routed before it and which it leaves alone', () => {
  const box = { A: node(100, 100, 120, 80, true), B: node(300, 100, 120, 80, true) };
  const routes = [
    { f: { from: 'A', to: 'B' }, pts: ptsOf([[160, 100], [240, 100]]), obstacles: [] },
    { f: { from: 'A', to: 'B' }, pts: ptsOf([[160, 104], [240, 104]]), obstacles: [], loopSide: 1 },
    { f: { from: 'B', to: 'A' }, pts: ptsOf([[300, 140], [300, 150], [100, 150], [100, 140]]), obstacles: [], loopSide: 1 },
  ];
  separateTwins(routes, box);
  assert.deepEqual(routes[1].pts, ptsOf([[100, 140], [100, 160], [300, 160], [300, 140]]), 'the twin 20 px below');
  loopBack(routes, box);
  assert.deepEqual(routes[1].pts, ptsOf([[100, 140], [100, 160], [300, 160], [300, 140]]), 'the twin as it was');
  // The middle of both bottoms taken: the corners away from the other end, so
  // the flow back crosses nothing, one level farther out.
  assert.deepEqual(routes[2].pts, ptsOf([[340, 140], [340, 160 + LEVEL_STEP], [60, 160 + LEVEL_STEP], [60, 140]]));
});

test('correction 7: at an event the flow back docks on the top or bottom centre; a port another flow uses counts as a conflict', () => {
  const box = { E1: node(100, 100, 36, 36), T: node(300, 100, 120, 80, true), E2: node(500, 100, 36, 36), X: node(100, -100, 120, 80, true) };
  const routes = [
    { f: { from: 'X', to: 'E1' }, pts: ptsOf([[100, -60], [100, 82]]), obstacles: [] },
    { f: { from: 'E1', to: 'T' }, pts: ptsOf([[118, 100], [240, 100]]), obstacles: [] },
    { f: { from: 'T', to: 'E2' }, pts: ptsOf([[360, 100], [482, 100]]), obstacles: [] },
    { f: { from: 'E2', to: 'E1' }, pts: ptsOf([[500, 82], [500, 70], [100, 70], [100, 82]]), obstacles: [], loopSide: -1 },
  ];
  loopBack(routes, box);
  assert.deepEqual(routes[3].pts, ptsOf([[500, 118], [500, 160], [100, 160], [100, 118]]), 'below: the top of E1 is taken');
});

test('correction 7: a flow back in a middle lane stays in its lane, 12 px from the border; the lane grows and what lies beyond moves', () => {
  const lanes = [[0, 0, 1000, 140], [0, 140, 1000, 120], [0, 260, 1000, 100]];
  const box = { T1: node(100, 200, 120, 80, true), T2: node(300, 200, 120, 80, true), B: node(300, 320, 120, 80, true) };
  const routes = [
    { f: { from: 'T1', to: 'T2' }, pts: ptsOf([[160, 200], [240, 200]]), obstacles: [] },
    { f: { from: 'T2', to: 'B' }, pts: ptsOf([[300, 240], [300, 280]]), obstacles: [{ x1: 240, y1: 280, x2: 360, y2: 360 }] },
    { f: { from: 'T2', to: 'T1' }, pts: ptsOf([[300, 240], [300, 250], [100, 250], [100, 240]]), obstacles: [], loopSide: 1 },
  ];
  assert.deepEqual(loopBack(routes, box, lanes), { up: 0, down: 12 });
  assert.deepEqual(routes[2].pts, ptsOf([[260, 240], [260, 260], [100, 260], [100, 240]]), 'beside the flow down, 20 px under the tasks');
  assert.deepEqual(lanes, [[0, 0, 1000, 140], [0, 140, 1000, 132], [0, 272, 1000, 100]], 'the middle lane grew by 12 px, the lane below moved');
  assert.equal(box.B.cy, 332, 'the symbol below moved');
  assert.deepEqual(routes[1].pts, ptsOf([[300, 240], [300, 292]]), 'the flow down: its end moved, its start stayed');
  assert.deepEqual(routes[1].obstacles[0], { x1: 240, y1: 292, x2: 360, y2: 372 });
});

// ---------- the seams of the routing (story 2.24) ----------
test('portEnds: the ends of the flows at a symbol, in the order of the routes, the route\'s own points', () => {
  const a = { f: { from: 'A', to: 'B' }, pts: ptsOf([[10, 0], [20, 0], [20, 30], [40, 30]]) };
  const b = { f: { from: 'C', to: 'A' }, pts: ptsOf([[0, 50], [0, 20], [5, 20]]) };
  const c = { f: { from: 'C', to: 'D' }, pts: ptsOf([[0, 50], [0, 90]]) };
  const ends = portEnds([a, b, c], 'A');
  assert.deepEqual(ends.map(e => [e.r === a ? 'a' : 'b', e.out]), [['a', true], ['b', false]]);
  assert.ok(ends[0].p === a.pts[0] && ends[0].q === a.pts[1], 'a leaving flow: its first point and the one after');
  assert.ok(ends[1].p === b.pts[2] && ends[1].q === b.pts[1], 'an arriving flow: its last point and the one before');
  a.pts[0].y = 5;
  assert.equal(ends[0].p.y, 5, 'live: what moves the route moves the end');
  assert.deepEqual(portEnds([c], 'A'), []);
});

test('portCandidates: the middle of a side, or on a task with the middle taken the two points 20 px in from the corners, the one facing the other end first', () => {
  const t = node(100, 100, 120, 80, true), g = node(300, 100, 50, 50);
  assert.deepEqual(portCandidates(t, 1, 0, []), [P(100, 140)]);
  assert.deepEqual(portCandidates(t, -1, 0, [P(100, 140)]), [P(100, 60)], 'the bottom middle taken does not touch the top');
  assert.deepEqual(portCandidates(t, 1, 0, [P(110, 140)]), [P(60, 140), P(140, 140)], 'taken within 14 px of the middle; the other end lies left');
  assert.deepEqual(portCandidates(t, 1, 500, [P(110, 140)]), [P(140, 140), P(60, 140)], 'the other end right');
  assert.deepEqual(portCandidates(t, 1, 0, [P(114, 140)]), [P(100, 140)], '14 px off the middle is free');
  assert.deepEqual(portCandidates(g, 1, 0, [P(300, 125)]), [P(300, 125)], 'a symbol of 50 px that is no gateway keeps its vertex: a used one is a conflict');
});

test('portCandidates on a gateway: its vertex while free; used, the side corners with a stub of 12 px, the one facing the other end first, then the one away, then the vertex', () => {
  const g = gateway(300, 100);
  assert.deepEqual(portCandidates(g, 1, 0, []), [P(300, 125)]);
  assert.deepEqual(portCandidates(g, 1, 0, [P(300, 75)]), [P(300, 125)], 'the top used does not touch the bottom');
  const left = { ...P(275, 100), stub: P(263, 100) }, right = { ...P(325, 100), stub: P(337, 100) };
  assert.deepEqual(portCandidates(g, 1, 0, [P(301, 126)]), [left, { ...right, away: true }, P(300, 125)], 'the other end left');
  assert.deepEqual(portCandidates(g, -1, 500, [P(300, 75)]), [right, { ...left, away: true }, P(300, 75)], 'the other end right');
  assert.deepEqual(portCandidates(g, 1, 0, [P(300, 125), P(275, 100)]), [{ ...right, away: true }, P(300, 125)], 'the facing corner used: the one away');
  assert.deepEqual(portCandidates(g, 1, 0, [P(300, 125), P(275, 100), P(325, 100)]), [P(300, 125)], 'all used: the vertex');
});

test('correction 7: a flow back from a gateway whose vertices flows forward use leaves a side corner, 12 px out, then to its level', () => {
  const box = { A: node(100, 100, 120, 80, true), G: gateway(300, 100), D: node(300, 300, 120, 80, true), X: node(300, -100, 120, 80, true) };
  const ring = () => ({ f: { from: 'G', to: 'A' }, pts: ptsOf([[300, 125], [300, 150], [100, 150], [100, 140]]), obstacles: [], loopSide: 1 });
  const routes = [
    { f: { from: 'X', to: 'G' }, pts: ptsOf([[300, -60], [300, 75]]), obstacles: [] },
    { f: { from: 'G', to: 'D' }, pts: ptsOf([[300, 125], [300, 260]]), obstacles: [] },
    ring(),
  ];
  loopBack(routes, box);
  assert.deepEqual(routes[2].pts, ptsOf([[275, 100], [263, 100], [263, 160], [100, 160], [100, 140]]), 'five points, from the corner facing A');
  // The left corner taken as well: the right one, away from A, at one
  // conflict more; the used bottom vertex would lie on the flow down.
  routes[2] = ring();
  routes.push({ f: { from: 'A', to: 'G' }, pts: ptsOf([[160, 100], [275, 100]]), obstacles: [] });
  loopBack(routes, box);
  assert.deepEqual(routes[2].pts, ptsOf([[325, 100], [337, 100], [337, 160], [100, 160], [100, 140]]), 'from the corner away from A, back under the gateway');
});

test('correction 7: of two flows back out of one gateway\'s top, the second leaves the corner away from its target where the facing one is taken', () => {
  const box = { A: node(100, 100, 120, 80, true), B: node(300, 100, 120, 80, true), G: gateway(500, 100), D: node(500, 300, 120, 80, true) };
  const back = to => ({ f: { from: 'G', to }, pts: ptsOf([[500, 75], [500, 50], [box[to].cx, 50], [box[to].cx, 60]]), obstacles: [], loopSide: -1 });
  const routes = [
    { f: { from: 'B', to: 'G' }, pts: ptsOf([[360, 100], [475, 100]]), obstacles: [] },
    { f: { from: 'G', to: 'D' }, pts: ptsOf([[500, 125], [500, 260]]), obstacles: [] },
    back('A'), back('B'),
  ];
  loopBack(routes, box);
  assert.deepEqual(routes[3].pts, ptsOf([[500, 75], [500, 40], [300, 40], [300, 60]]), 'the shorter out of the top');
  assert.deepEqual(routes[2].pts, ptsOf([[525, 100], [537, 100], [537, 40 - LEVEL_STEP], [100, 40 - LEVEL_STEP], [100, 60]]), 'the longer from the right corner, 12 px out, up and back over the gateway');
});

test('correction 8: an arrow arriving at a gateway\'s vertex another flow leaves by docks on a free vertex', () => {
  const box = { U: node(100, -100, 120, 80, true), G: gateway(300, 100), C: node(560, 100, 120, 80, true), D: node(300, 460, 120, 80, true) };
  const out = () => ({ f: { from: 'G', to: 'C' }, pts: ptsOf([[325, 100], [500, 100]]), obstacles: [] });
  // From above, its run before passing over the gateway: it turns down from there.
  const over = { f: { from: 'U', to: 'G' }, pts: ptsOf([[160, -100], [337, -100], [337, 100], [325, 100]]), obstacles: [] };
  dockApart([out(), over], box, ['G']);
  assert.deepEqual(over.pts, ptsOf([[160, -100], [300, -100], [300, 75]]));
  // Its run before not over the gateway: 12 px beyond the top vertex, then into it.
  box.V = node(560, -100, 120, 80, true);
  const beside = { f: { from: 'V', to: 'G' }, pts: ptsOf([[560, 60], [560, -30], [337, -30], [337, 100], [325, 100]]), obstacles: [] };
  dockApart([out(), beside], box, ['G']);
  assert.deepEqual(beside.pts, ptsOf([[560, 60], [560, -30], [337, -30], [337, 63], [300, 63], [300, 75]]));
  const besideBlocked = { f: { from: 'V', to: 'G' }, pts: ptsOf([[560, 60], [560, -30], [380, -30], [380, 100], [325, 100]]), obstacles: [{ x1: 370, y1: 20, x2: 390, y2: 40 }] };
  dockApart([out(), besideBlocked], box, ['G']);
  assert.deepEqual(besideBlocked.pts, ptsOf([[560, 60], [560, -30], [380, -30], [380, 100], [325, 100]]), 'the piece on from its last corner blocked: the end stays');
  // A vertical end at the bottom vertex: to the side corner it comes from.
  const down = { f: { from: 'G', to: 'D' }, pts: ptsOf([[300, 125], [300, 420]]), obstacles: [] };
  box.W = node(500, 340, 120, 80, true);
  const up = { f: { from: 'W', to: 'G' }, pts: ptsOf([[500, 300], [500, 200], [300, 200], [300, 125]]), obstacles: [] };
  dockApart([down, up], box, ['G']);
  assert.deepEqual(up.pts, ptsOf([[500, 300], [500, 200], [337, 200], [337, 100], [325, 100]]));
  // A way a foreign symbol blocks: the end stays.
  const blockedWay = { f: { from: 'U', to: 'G' }, pts: ptsOf([[160, -100], [337, -100], [337, 100], [325, 100]]), obstacles: [{ x1: 280, y1: 0, x2: 320, y2: 40 }] };
  dockApart([out(), blockedWay], box, ['G']);
  assert.deepEqual(blockedWay.pts, ptsOf([[160, -100], [337, -100], [337, 100], [325, 100]]));
  // A flow back leaving there is routed later by loopBack(): it is no clash.
  box.L = node(100, 100, 120, 80, true);
  const backOut = { f: { from: 'G', to: 'L' }, pts: ptsOf([[325, 100], [337, 100], [337, 160], [100, 160], [100, 140]]), obstacles: [] };
  const stays = { f: { from: 'U', to: 'G' }, pts: ptsOf([[160, -100], [337, -100], [337, 100], [325, 100]]), obstacles: [] };
  dockApart([backOut, stays], box, ['G']);
  assert.deepEqual(stays.pts, ptsOf([[160, -100], [337, -100], [337, 100], [325, 100]]));
});

test('correction 8: an arrival whose free vertex lies only across the flow it leaves stays; an end moved counts at its new vertex; no point twice', () => {
  const box = { G: gateway(300, 100), C: node(560, 100, 120, 80, true), X: node(300, -100, 120, 80, true), V: node(560, -100, 120, 80, true), U: node(240, -40, 120, 80, true) };
  const out = () => ({ f: { from: 'G', to: 'C' }, pts: ptsOf([[325, 100], [500, 100]]), obstacles: [] });
  // The top taken by a flow from above: the bottom vertex is reached only across the flow out.
  const top = { f: { from: 'X', to: 'G' }, pts: ptsOf([[300, -60], [300, 75]]), obstacles: [] };
  const across = { f: { from: 'V', to: 'G' }, pts: ptsOf([[560, -60], [560, -30], [337, -30], [337, 100], [325, 100]]), obstacles: [] };
  dockApart([out(), top, across], box, ['G']);
  assert.deepEqual(across.pts, ptsOf([[560, -60], [560, -30], [337, -30], [337, 100], [325, 100]]), 'the end stays');
  // Two arrivals from above: the first takes the top; there it counts, and the second does not follow it.
  const one = { f: { from: 'V', to: 'G' }, pts: ptsOf([[560, -60], [560, -30], [337, -30], [337, 100], [325, 100]]), obstacles: [] };
  const two = { f: { from: 'V', to: 'G' }, pts: ptsOf([[520, -60], [520, -20], [345, -20], [345, 100], [325, 100]]), obstacles: [] };
  dockApart([out(), one, two], box, ['G']);
  assert.deepEqual(one.pts, ptsOf([[560, -60], [560, -30], [337, -30], [337, 63], [300, 63], [300, 75]]));
  assert.deepEqual(two.pts, ptsOf([[520, -60], [520, -20], [345, -20], [345, 100], [325, 100]]), 'the top taken, the bottom across the flow out: it stays');
  // The run before ends on the vertex's axis: the turn would be that point again and goes.
  const axis = { f: { from: 'U', to: 'G' }, pts: ptsOf([[300, -40], [337, -40], [337, 100], [325, 100]]), obstacles: [] };
  dockApart([out(), axis], box, ['G']);
  assert.deepEqual(axis.pts, ptsOf([[300, -40], [300, 75]]));
});

test('conflictScore: one per piece of another flow crossed, lain on or run beside closer than 12 px, one per used port of a gateway or an event', () => {
  const ring = ptsOf([[300, 125], [300, 160], [100, 160], [100, 140]]);
  const g = node(300, 100, 50, 50), t = node(100, 100, 120, 80, true);
  const route = list => ({ pts: ptsOf(list) });
  assert.equal(conflictScore(ring, [route([[200, 0], [200, 50]])], [[g, ring[0], []], [t, ring[3], []]]), 0);
  assert.equal(conflictScore(ring, [route([[200, 100], [200, 300]])], [[g, ring[0], []], [t, ring[3], []]]), 1, 'crossed once');
  assert.equal(conflictScore(ring, [route([[150, 170], [250, 170]])], [[g, ring[0], []], [t, ring[3], []]]), 1, '10 px beside its level');
  assert.equal(conflictScore(ring, [route([[150, 172], [250, 172]])], [[g, ring[0], []], [t, ring[3], []]]), 0, '12 px beside: apart');
  assert.equal(conflictScore(ring, [], [[g, ring[0], [P(301, 126)]], [t, ring[3], []]]), 1, 'the gateway\'s bottom used');
  assert.equal(conflictScore(ring, [], [[g, ring[0], []], [t, ring[3], [P(100, 140)]]]), 0, 'a task\'s port is chosen by portCandidates(), not counted');
});

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
  assert.deepEqual(asked.sort(), ['Erledigt', 'Leserin fragt', 'Vorrätig?', 'ja', 'nein'].sort());
  for (const id of ['S', 'G', 'E']) assert.equal(di.labels[id][3], 44, id);
  for (const id of ['F2', 'F3']) assert.deepEqual(di.flowLabels[id].slice(2), [40, 44], id);
  const estimated = layoutGeometry(model, raw);
  assert.equal(estimated.labels.S[3], labelSize('Leserin fragt').h);
});

test('the geometry refuses positions that lack a node, a lane or a flow', () => {
  const { model, raw } = sample();
  assert.throws(() => layoutGeometry(model, { ...raw, nodes: { ...raw.nodes, n3: undefined } }), /„A“ nicht angeordnet/);
  assert.throws(() => layoutGeometry(model, { ...raw, lanes: { l1: raw.lanes.l1 } }), /„Magazin“ nicht angeordnet/);
  assert.throws(() => layoutGeometry(model, { ...raw, edges: raw.edges.slice(0, 4) }), /„F5“ nicht angeordnet/);
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
  const { xml: out, diagram } = appendDiagram(xml, model, layoutGeometry(model, raw));
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
  const out = appendDiagram(REFERENCE, model, layoutGeometry(model, raw)).xml;
  assert.equal((out.match(/<bpmndi:BPMNShape /g) || []).length, 1 + 4 + 16);
  assert.equal((out.match(/<bpmndi:BPMNEdge /g) || []).length, 17);
  assert.equal(out.slice(0, REFERENCE.lastIndexOf('</bpmn:definitions>')), REFERENCE.slice(0, REFERENCE.lastIndexOf('</bpmn:definitions>')));
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

test('a slanted end piece is docked on the outline with a corner, so the flow has right angles only', () => {
  const gateway = node(100, 100, 50, 50), task = node(300, 200, 120, 80, true);
  // Mermaid ends on a diamond's slanted side.
  let pts = ptsOf([[110, 115], [108, 160], [240, 160]]);
  attach(pts, true, gateway);
  assert.deepEqual(pts.slice(0, 2), [P(100, 125), P(100, 160)]);
  // A flow back as a two-point diagonal: both ends docked, a corner between.
  pts = ptsOf([[290, 165], [115, 110]]);
  attach(pts, true, task);
  attach(pts, false, gateway);
  assert.ok(pts.every((p, i) => !i || p.x === pts[i - 1].x || p.y === pts[i - 1].y), 'right angles: ' + JSON.stringify(pts));
  assert.deepEqual(pts[0], P(240, 172), 'on the left side of the task, as near the point before as its corners allow');
  assert.deepEqual(pts.at(-1), P(125, 100), 'into the gateway\'s right corner');
  assert.equal(pts.length, 4, 'two corners halfway');
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

test('a way out and back goes before docking: the flow docks on the side it goes to, not through its own gateway', () => {
  const pts = ptsOf([[100, 0], [80, 0], [300, 0]]);
  unfold(pts);
  assert.deepEqual(pts, ptsOf([[100, 0], [300, 0]]), 'the stub on the far side goes');
  const down = ptsOf([[100, 0], [80, 0], [80, 50], [300, 50]]);
  unfold(down);
  assert.equal(down.length, 4, 'a stub that turns is a way, not a way back');
  const inner = ptsOf([[0, 0], [50, 0], [50, 40], [50, 20], [90, 20]]);
  unfold(inner);
  assert.deepEqual(inner, ptsOf([[0, 0], [50, 0], [50, 20], [90, 20]]), 'out and back inside the route goes as well');
  // The flow of the large example: a gateway at 1086..1136, Mermaid's stub 12 px left of it, the target right.
  const gateway = { cx: 1111, cy: -59, w: 50, h: 50, task: false };
  const flow = ptsOf([[1086, -59], [1074, -59], [1178, -59]]);
  unfold(flow);
  attach(flow, true, gateway);
  assert.deepEqual(flow[0], P(1136, -59), 'from the right corner');
  assert.ok(flow.every(p => p.x >= 1136), 'no piece in the gateway: ' + JSON.stringify(flow));
});

test('a point Mermaid gives twice does not turn the flow through its own source', () => {
  const { model, raw } = sample();
  // F4, from the task A rightwards, its first point doubled.
  raw.edges[3] = [P(600, 100), P(600, 100), P(760, 100), P(760, 280)];
  const di = layoutGeometry(model, raw), a = di.nodes.A, way = di.flows.F4;
  assert.equal(way[0][0], a[0] + a[2], 'leaves A by its right side: ' + JSON.stringify(way));
  assert.ok(way.every(p => p[0] >= a[0] + a[2] || p[1] < a[1] || p[1] > a[1] + a[3]), 'no point inside A');
});

test('the lanes and the pool grow until every waypoint and every label lies inside, 12 px from the edge', () => {
  const { model, raw } = sample();
  // F5 runs around below the bottom lane and right beyond both.
  raw.edges[4] = [P(520, 350), P(520, 470), P(900, 470), P(900, 320), P(800, 320)];
  model.flows[4].name = 'außen herum';
  const di = layoutGeometry(model, raw);
  const [px, py, pw, ph] = di.pool, l1 = di.lanes.L1, l2 = di.lanes.L2;
  const inside = ([x, y]) => x >= l1[0] + 12 && x <= l1[0] + l1[2] - 12 && y >= py + 12 && y <= py + ph - 12;
  for (const way of Object.values(di.flows)) for (const p of way) assert.ok(inside(p), JSON.stringify(p) + ' outside ' + JSON.stringify(di.pool));
  for (const [x, y, w, h] of Object.values(di.flowLabels)) assert.ok(inside([x, y]) && inside([x + w, y + h]), 'label ' + JSON.stringify([x, y, w, h]));
  assert.equal(l2[1] + l2[3], py + ph, 'the bottom lane grew with the pool');
  assert.equal(l1[1], py);
  assert.deepEqual([l1[0], l1[2]], [l2[0], l2[2]]);
  assert.equal(px + 30, l1[0]);
  assert.equal(px + pw, l1[0] + l1[2]);
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
  // F2 runs above the top row, so the lanes have to grow.
  const raw = { nodes: { n1: { cx: 50, cy: 75, w: 60, h: 60 }, n2: { cx: 200, cy: 75, w: 120, h: 50 }, n3: { cx: 350, cy: 225, w: 60, h: 60 } },
                lanes: { l1: { x1: 0, y1: 0, x2: 400, y2: 150 }, l2: { x1: 0, y1: 150, x2: 400, y2: 300 } },
                edges: [[P(80, 75), P(140, 75)], [P(200, 50), P(200, -40), P(350, -40), P(350, 195)]] };
  const di = layoutGeometry(model, raw);
  const y = di.lanes.Y, [px, py, pw, ph] = di.pool, t = di.nodes.T, e = di.nodes.E;
  assert.ok(y[1] >= t[1] + t[3], 'lane Y starts below the task of lane X: ' + JSON.stringify({ y, t }));
  assert.ok(e[1] >= y[1] && e[1] + e[3] <= y[1] + y[3], 'E in lane Y');
  assert.equal(py + ph, y[1] + y[3], 'the pool ends with the bottom lane');
  assert.ok(py <= -40 - 12 && py > -40 - 30, 'the pool grew above the flow by the margin, once: ' + py);
  assert.equal(px + pw, y[0] + y[2]);
});

test('a stub of 0.7 px at a task is no vertical end: the flow does not run inside its own source', () => {
  const task = node(100, 100, 120, 80, true);
  const pts = ptsOf([[160, 100], [160.7, 100], [160.7, 300], [400, 300]]);
  dedupe(pts, true);
  attach(pts, true, task);
  assert.ok(pts.every((p, i) => !i || Math.abs(p.x - pts[i - 1].x) < 0.01 || Math.abs(p.y - pts[i - 1].y) < 0.01), 'right angles: ' + JSON.stringify(pts));
  assert.ok(pts.every(p => !(p.x > 41 && p.x < 159 && p.y > 61 && p.y < 139)), 'no point inside the task: ' + JSON.stringify(pts));
  // It ran beside the task in Mermaid's positions: it leaves by the side and keeps 12 px from it.
  assert.deepEqual(pts.slice(0, 3), ptsOf([[160, 100], [172, 100], [172, 300]]));
});

test('a flow from a node to itself whose node is not laid out names it once', () => {
  const { leftOut } = read(xmlOf('<bpmn:process id="P">' + LINE + '<bpmn:boundaryEvent id="Z" attachedToRef="T"/><bpmn:sequenceFlow id="ZZ" sourceRef="Z" targetRef="Z"/></bpmn:process>'));
  assert.equal(leftOutLine(leftOut.find(x => x.id === 'ZZ')), 'sequenceFlow ZZ: touches Z, which is not laid out');
});
