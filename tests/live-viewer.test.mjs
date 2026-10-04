// The pure part of the live viewer (src/app/live-viewer.js), run in Node:
// the XML of a source link, the diagram the viewer opens, the viewbox of each
// zoom step, a move of the fingers on a touch screen. That the viewer starts, zooms, moves and goes is checked by the
// browser runs (tests/vergleich.mjs, tests/durchlaeufe.mjs, tests/speichern.mjs).
//
//   npm test          (node --test tests/*.test.mjs)

import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceXml, diagramToOpen, stepViewbox, touchStep, FIT_MARGIN, FIT_MOST, START_MARGIN, LIVE_HINT, TOUCH_SCALE } from '../src/app/live-viewer.js';
import { sourceDataUrl } from '../src/app/diagram-downloads.js';

const MIME = 'application/xml;charset=utf-8';

// ---------- the XML of the source link ----------
test('the XML of a source link is the text sourceDataUrl() wrote into it, whatever it holds', () => {
  const xmls = [
    '<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d">\n\t<bpmn:process id="p" name="Rückgabe &amp; „Prüfung“ #1 100 % \'x\' <y>"/>\n</bpmn:definitions>\n',
    'a,b,c: the first comma ends the head of the URL, the others are text',
    'trailing blanks   ',
    '😀 ä ß € \u0001',
  ];
  for (const xml of xmls) assert.equal(sourceXml(sourceDataUrl(xml, MIME)), xml);
});

// ---------- the diagram the viewer opens ----------
const SHAPE = '<bpmndi:BPMNShape id="s" bpmnElement="a"><dc:Bounds x="0" y="0" width="100" height="80"/></bpmndi:BPMNShape>';
const definitions = inner => '<?xml version="1.0"?>\n<bpmn:definitions xmlns:bpmn="m" xmlns:bpmndi="di" xmlns:dc="dc" id="defs"><bpmn:process id="p"><bpmn:task id="a"/></bpmn:process>' + inner + '</bpmn:definitions>';

test('XML with coordinates: the viewer opens its diagram', () => {
  assert.equal(diagramToOpen(definitions('<bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="pl" bpmnElement="p">' + SHAPE + '</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>')), 'BPMNDiagram_1');
});

test('laid-out XML after an empty diagram of the author: the viewer opens the laid-out one', () => {
  const xml = definitions('<bpmndi:BPMNDiagram id="leer"><bpmndi:BPMNPlane id="pl0" bpmnElement="p"/></bpmndi:BPMNDiagram>' +
    '<bpmndi:BPMNDiagram id="dokufix_diagram_1"><bpmndi:BPMNPlane id="pl1" bpmnElement="p">' + SHAPE + '</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>');
  assert.equal(diagramToOpen(xml), 'dokufix_diagram_1');
});

test('laid-out XML after a self-closing diagram of the author: the viewer opens the laid-out one, never the empty one', () => {
  const xml = definitions('<bpmndi:BPMNDiagram id="BPMNDiagram_1"/>' +
    '<bpmndi:BPMNDiagram id="dokufix_diagram_1"><bpmndi:BPMNPlane id="pl1" bpmnElement="p">' + SHAPE + '</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>');
  assert.equal(diagramToOpen(xml), 'dokufix_diagram_1');
  assert.equal(diagramToOpen(definitions('<bpmndi:BPMNDiagram id="leer" />')), null);
});

test('any prefix, or none; single quotes; a shape in a comment or a CDATA section does not count', () => {
  assert.equal(diagramToOpen('<definitions><BPMNDiagram id=\'d1\'><BPMNPlane>' + SHAPE.replace(/bpmndi:/g, '') + '</BPMNPlane></BPMNDiagram></definitions>'), 'd1');
  const hidden = definitions('<di:BPMNDiagram id="leer"><!-- ' + SHAPE + ' --><![CDATA[' + SHAPE + ']]></di:BPMNDiagram>' +
    '<di:BPMNDiagram data-id="nein" id="voll">' + SHAPE + '</di:BPMNDiagram>');
  assert.equal(diagramToOpen(hidden), 'voll');
});

test('no diagram that places anything, or one without an id: null, and bpmn-js opens the first', () => {
  assert.equal(diagramToOpen(definitions('')), null);
  assert.equal(diagramToOpen(definitions('<bpmndi:BPMNDiagram id="leer"><bpmndi:BPMNPlane bpmnElement="p"/></bpmndi:BPMNDiagram>')), null);
  assert.equal(diagramToOpen(definitions('<bpmndi:BPMNDiagram>' + SHAPE + '</bpmndi:BPMNDiagram>')), null);
  assert.equal(diagramToOpen('kein XML'), null);
});

// ---------- the viewbox of each step ----------
const near = (a, b) => Math.abs(a - b) < 1e-9;
const scaleOf = (box, outer) => outer.width / box.width;

test('"100 %", "150 %" and "200 %" draw the diagram at 1, 1.5 and 2', () => {
  const inner = { x: 100, y: 50, width: 3000, height: 900 }, outer = { width: 1400, height: 800 };
  for (const [step, k] of [['100', 1], ['150', 1.5], ['200', 2]]){
    const box = stepViewbox(step, inner, outer);
    assert.ok(near(scaleOf(box, outer), k), step);
    assert.ok(near(outer.height / box.height, k), step);
  }
});

test('a diagram larger than the viewer starts at its top left, with a margin', () => {
  const box = stepViewbox('100', { x: 100, y: 50, width: 3000, height: 900 }, { width: 1400, height: 800 });
  assert.equal(box.x, 100 - START_MARGIN);
  assert.equal(box.y, 50 - START_MARGIN);
});

test('a diagram smaller than the viewer stands in its middle', () => {
  const inner = { x: 10, y: 20, width: 400, height: 200 }, outer = { width: 1400, height: 800 };
  const box = stepViewbox('100', inner, outer);
  assert.ok(near(box.x + box.width / 2, inner.x + inner.width / 2));
  assert.ok(near(box.y + box.height / 2, inner.y + inner.height / 2));
});

test('"Einpassen": the whole diagram with its margin, centred, the narrower side deciding', () => {
  const inner = { x: 0, y: 0, width: 2700, height: 600 }, outer = { width: 1400, height: 800 };
  const box = stepViewbox('fit', inner, outer);
  const k = scaleOf(box, outer);
  assert.ok(near(k, (outer.width - 2 * FIT_MARGIN) / inner.width));
  assert.ok(box.x <= inner.x && box.y <= inner.y && box.x + box.width >= inner.x + inner.width && box.y + box.height >= inner.y + inner.height);
  assert.ok(near(box.x + box.width / 2, inner.width / 2) && near(box.y + box.height / 2, inner.height / 2));
  const tall = stepViewbox('fit', { x: 0, y: 0, width: 400, height: 3000 }, outer);
  assert.ok(near(scaleOf(tall, outer), (outer.height - 2 * FIT_MARGIN) / 3000));
});

test('"Einpassen" enlarges a small diagram at most to 150 %', () => {
  const box = stepViewbox('fit', { x: 0, y: 0, width: 200, height: 100 }, { width: 1400, height: 800 });
  assert.equal(FIT_MOST, 1.5);
  assert.ok(near(scaleOf(box, { width: 1400 }), 1.5));
});

test('an empty diagram or a viewer of no size gives scale 1, never a box of no size or an infinite one', () => {
  for (const [inner, outer] of [[{ x: 0, y: 0, width: 0, height: 0 }, { width: 1400, height: 800 }], [{ x: 0, y: 0, width: 300, height: 200 }, { width: 10, height: 10 }]]){
    const box = stepViewbox('fit', inner, outer);
    assert.ok(Number.isFinite(box.width) && box.width > 0 && Number.isFinite(box.x), JSON.stringify(box));
  }
});

test('the hint in the bar reads as Ben decided', () => {
  assert.equal(LIVE_HINT, 'Strg + Mausrad: zoomen · Ziehen: verschieben');
});

// ---------- touch ----------
test('one finger moves the diagram with it, and zooms nothing', () => {
  assert.deepEqual(touchStep([{ x: 100, y: 200 }], [{ x: 70, y: 260 }]), { dx: -30, dy: 60, factor: 1, center: { x: 70, y: 260 } });
});

test('two fingers move the diagram with their middle and zoom it at that middle by their distance', () => {
  const step = touchStep([{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 90, y: 120 }, { x: 290, y: 120 }]);
  assert.equal(step.dx, 40);
  assert.equal(step.dy, 20);
  assert.equal(step.factor, 2);
  assert.deepEqual(step.center, { x: 190, y: 120 });
  assert.equal(touchStep([{ x: 0, y: 0 }, { x: 300, y: 400 }], [{ x: 50, y: 50 }, { x: 200, y: 250 }]).factor, 0.5);
});

test('a finger more or less, or none, moves nothing: the diagram does not jump', () => {
  assert.equal(touchStep([{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 300, y: 0 }]), null);
  assert.equal(touchStep([{ x: 0, y: 0 }, { x: 300, y: 0 }], [{ x: 10, y: 0 }]), null);
  assert.equal(touchStep([], []), null);
  assert.equal(touchStep([{ x: 0, y: 0 }], []), null);
});

test('a third finger is ignored, and two fingers on one point zoom nothing', () => {
  const step = touchStep([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 50 }], [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 900, y: 900 }]);
  assert.deepEqual(step, { dx: 0, dy: 0, factor: 1, center: { x: 50, y: 0 } });
  assert.equal(touchStep([{ x: 5, y: 5 }, { x: 5, y: 5 }], [{ x: 0, y: 0 }, { x: 10, y: 0 }]).factor, 1);
});

test('two fingers zoom between the scales of Ctrl+wheel in bpmn-js', () => {
  assert.deepEqual(TOUCH_SCALE, { min: 0.2, max: 4 });
});
