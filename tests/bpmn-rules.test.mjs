// The rules a laid-out BPMN diagram keeps (tests/bpmn-rules.mjs), on every
// measured fixture of tests/fixtures/bpmn-layout/: what breaks them is exactly
// the known list, known-breaks.json. A new break fails, naming the input, the
// rule and the elements; so does a listed break that is gone, which is taken
// off the list (npm run fixtures -- --write writes it anew).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixtureNames, readFixture, readModel, expectedFile } from './bpmn-fixtures.mjs';
import { breaksOf, fixtureBreaks, readKnownBreaks, compareBreaks, readDiagram } from './bpmn-rules.mjs';

const names = fixtureNames();
const known = readKnownBreaks();

test('the known list names every fixture, in their order, each list sorted and without repeats', () => {
  assert.deepEqual(Object.keys(known), names);
  for (const list of Object.values(known)) assert.deepEqual(list, [...new Set(list)].sort());
});

for (const name of names){
  test(name + ': the breaks of the rules are the known ones', () => {
    const lines = compareBreaks(name, fixtureBreaks(name), known[name]);
    assert.ok(!lines.length, lines.join('\n'));
  });
}

// One fixture with a piece changed, as a change of the layout would change it.
const r01 = readFixture('r01'), model = readModel(r01.xml).model;
const laid = fs.readFileSync(expectedFile('r01', 'measured'), 'utf8');
const firstWay = laid.split('\n').find(l => l.includes('bpmnElement="F1_s_a"'));

test('the diagram part is read back: boxes, label boxes, waypoints', () => {
  const di = readDiagram(laid);
  assert.equal(Object.keys(di.flows).length, model.flows.length);
  assert.ok(model.nodes.every(n => di.shapes[n.id].length === 4));
  assert.deepEqual(di.flows.F1_s_a, [...firstWay.matchAll(/x="(-?\d+)" y="(-?\d+)"/g)].map(m => [Number(m[1]), Number(m[2])]));
  assert.ok(di.labels.c && di.flowLabels.F4_c_d);
});

test('a new break fails, naming the input, the rule and the elements', () => {
  // The second waypoint of F1_s_a 5 px lower: its first piece is slanted.
  const changed = laid.replace(firstWay, firstWay.replace(/(<di:waypoint x="-?\d+" y="-?\d+"\/><di:waypoint x="-?\d+" y=")(-?\d+)/, (all, head, y) => head + (Number(y) + 5)));
  assert.notEqual(changed, laid);
  const found = breaksOf(changed, model, r01.sizes);
  assert.ok(found.includes('slanted F1_s_a'), found.join('\n'));
  assert.ok(compareBreaks('r01', found, known.r01).includes('r01: new break: slanted F1_s_a'));
});

test('a listed break that is gone fails as well', () => {
  assert.deepEqual(compareBreaks('r01', [], ['label-on-label F8_e_d e']), ['r01: listed break gone: label-on-label F8_e_d e']);
  assert.deepEqual(compareBreaks('r01', ['a b'], ['a b']), []);
});

// A diagram made up for the rules: in the pool, lane L1 holds the tasks A and
// B side by side and the gateway G beyond them, lane L2 below it the task C.
const M = {
  pool: { id: 'P' },
  lanes: [{ id: 'L1', nodes: ['A', 'B', 'G'] }, { id: 'L2', nodes: ['C'] }],
  nodes: [{ id: 'A', type: 'task', name: 'A' }, { id: 'B', type: 'task', name: 'B' }, { id: 'G', type: 'gateway', name: 'G?' }, { id: 'C', type: 'task', name: 'C' }],
  flows: [{ id: 'F1', from: 'A', to: 'B' }, { id: 'F2', from: 'B', to: 'A' }, { id: 'F3', from: 'A', to: 'G' }, { id: 'F4', from: 'G', to: 'C' }],
};
const SHAPES = { P: [0, 0, 1000, 400], L1: [30, 0, 970, 200], L2: [30, 200, 970, 200], A: [100, 50, 120, 80], B: [300, 50, 120, 80], G: [500, 65, 50, 50], C: [100, 250, 120, 80] };
const SIZES = { 'G?': { w: 20, h: 15 } };
const bounds = b => '<dc:Bounds x="' + b[0] + '" y="' + b[1] + '" width="' + b[2] + '" height="' + b[3] + '"/>';
const label = b => b ? '<bpmndi:BPMNLabel>' + bounds(b) + '</bpmndi:BPMNLabel>' : '';
// flows: { id: [waypoints, label box] }; shapes and labels: changes to SHAPES, and the label boxes of shapes.
function made({ flows = {}, shapes = {}, labels = {} }){
  const all = { ...SHAPES, ...shapes };
  return breaksOf('<x>\n' + Object.entries(all).map(([id, b]) => '      <bpmndi:BPMNShape id="' + id + '_di" bpmnElement="' + id + '">' + bounds(b) + label(labels[id]) + '</bpmndi:BPMNShape>\n').join('') +
    Object.entries(flows).map(([id, [w, l]]) => '      <bpmndi:BPMNEdge id="' + id + '_di" bpmnElement="' + id + '">' + w.map(([x, y]) => '<di:waypoint x="' + x + '" y="' + y + '"/>').join('') + label(l) + '</bpmndi:BPMNEdge>\n').join('') + '</x>',
  { ...M, flows: M.flows.filter(f => flows[f.id]) }, SIZES);
}

test('each rule on a diagram made up for it', () => {
  const cases = [
    ['a straight flow between two tasks breaks nothing', { flows: { F1: [[[220, 90], [300, 90]]] } }, []],
    ['slanted', { flows: { F1: [[[220, 90], [300, 95]]] } }, ['slanted F1']],
    ['an inner piece of 5 px', { flows: { F1: [[[220, 90], [260, 90], [260, 95], [300, 95]]] } }, ['small-step F1']],
    ['an end short of its target', { flows: { F1: [[[220, 90], [290, 90]]] } }, ['end-off-outline F1 B']],
    ['through a foreign symbol', { flows: { F3: [[[220, 90], [500, 90]]] } }, ['through F3 B']],
    ['through its own source', { flows: { F1: [[[220, 90], [260, 90], [260, 40], [200, 40], [200, 140], [260, 140], [260, 100], [300, 100]]] } }, ['through-own F1 A']],
    ['along the side of a foreign symbol', { flows: { F3: [[[220, 90], [260, 90], [260, 50], [525, 50], [525, 65]]] } }, ['on-outline F3 B']],
    ['in and out at one port', { flows: { F1: [[[220, 90], [300, 90]]], F2: [[[300, 90], [220, 90]]] } }, ['double-headed A F1 F2', 'double-headed B F1 F2', 'on-one-line-foreign F1 F2']],
    ['two runs 10 px apart', { flows: { F1: [[[220, 80], [300, 80]]], F2: [[[300, 90], [220, 90]]] } }, ['parallel F1 F2']],
    ['two flows from one port on one line', { flows: { F1: [[[220, 90], [300, 90]]], F3: [[[220, 90], [260, 90], [260, 160], [525, 160], [525, 115]]] } }, ['on-one-line-shared F1 F3']],
    ['a waypoint below the lanes', { flows: { F4: [[[550, 90], [600, 90], [600, 420], [260, 420], [260, 290], [220, 290]]] } }, ['point-outside-lanes F4']],
    ['a task across the border of its lane', { shapes: { C: [100, 150, 120, 80] } }, ['node-outside-lane C L2']],
    ['a gap between two lanes', { shapes: { L2: [30, 210, 970, 190] } }, ['lane-gap L1 L2']],
    ['a flow label on its flow and on a task', { flows: { F1: [[[220, 90], [300, 90]], [290, 82, 30, 15]] } }, ['label-on-flow F1 F1', 'label-on-node F1 B']],
    ['two labels on each other: the gateway\'s text, 20 px wide, is centred in its box of 90 px', { flows: { F1: [[[220, 90], [300, 90]], [250, 30, 30, 15]] }, labels: { G: [220, 30, 90, 15] } }, ['label-on-label F1 G']],
    ['the box of 90 px is not the text', { flows: { F1: [[[220, 90], [300, 90]], [480, 10, 30, 15]] }, labels: { G: [480, 10, 90, 15] } }, []],
    ['a label beyond the lanes and the pool', { labels: { G: [-60, -20, 90, 15] } }, ['label-outside-lane G', 'label-outside-pool G']],
  ];
  for (const [what, input, expected] of cases) assert.deepEqual(made(input), expected, what);
});
