// The pure part of the live viewer (src/app/live-viewer.js), run in Node:
// the XML of a source link, the diagram the viewer opens, the viewbox of each
// zoom step, the fingers that count on a touch screen and a move of them.
// That the viewer starts, zooms, moves and goes is checked by the browser
// runs (tests/vergleich.mjs, tests/durchlaeufe.mjs, tests/speichern.mjs);
// here only whether the run-time pass starts one for a view already open,
// with a stand-in for bpmn-js.
//
//   npm test          (node --test tests/*.test.mjs)

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { sourceXml, diagramToOpen, stepViewbox, countedFingers, touchStep, attachLiveViewers, stopLiveViewers, FIT_MARGIN, FIT_MOST, START_MARGIN, LIVE_HINT, LIVE_CLASS } from '../src/app/live-viewer.js';
import { sourceDataUrl } from '../src/app/diagram-downloads.js';
import { drawDiagrams, DIAGRAM_KINDS } from '../src/app/diagrams.js';

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
// A finger: its identifier and its point in the viewer.
const f = (id, x, y) => ({ id, x, y });

test('one finger moves the diagram with it, and zooms nothing', () => {
  assert.deepEqual(touchStep([f(1, 100, 200)], [f(1, 70, 260)]), { dx: -30, dy: 60, factor: 1, center: { x: 70, y: 260 } });
});

test('two fingers move the diagram with their middle and zoom it at that middle by their distance', () => {
  const step = touchStep([f(1, 100, 100), f(2, 200, 100)], [f(1, 90, 120), f(2, 290, 120)]);
  assert.equal(step.dx, 40);
  assert.equal(step.dy, 20);
  assert.equal(step.factor, 2);
  assert.deepEqual(step.center, { x: 190, y: 120 });
  assert.equal(touchStep([f(1, 0, 0), f(2, 300, 400)], [f(1, 50, 50), f(2, 200, 250)]).factor, 0.5);
});

test('the fingers are paired by their identifier, not by their place in the list', () => {
  const before = [f(7, 100, 100), f(3, 200, 100)];
  const after = [f(3, 290, 120), f(7, 90, 120)];
  assert.deepEqual(touchStep(before, after), { dx: 40, dy: 20, factor: 2, center: { x: 190, y: 120 } });
  assert.deepEqual(countedFingers(before, after), [f(7, 90, 120), f(3, 290, 120)]);
  assert.deepEqual(touchStep([f(5, 10, 10)], [f(5, 30, 0)]), { dx: 20, dy: -10, factor: 1, center: { x: 30, y: 0 } });
});

test('a finger more or less below two, or none, moves nothing: the diagram does not jump', () => {
  assert.equal(touchStep([f(1, 0, 0)], [f(1, 0, 0), f(2, 300, 0)]), null);
  assert.equal(touchStep([f(1, 0, 0), f(2, 300, 0)], [f(1, 10, 0)]), null);
  assert.equal(touchStep([], []), null);
  assert.equal(touchStep([], [f(1, 0, 0)]), null);
  assert.equal(touchStep([f(1, 0, 0)], []), null);
  assert.equal(touchStep([f(1, 0, 0)], [f(2, 50, 0)]), null);
  assert.deepEqual(countedFingers([f(1, 0, 0)], [f(1, 0, 0), f(2, 300, 0)]), [f(1, 0, 0), f(2, 300, 0)]);
  assert.deepEqual(countedFingers([f(1, 0, 0), f(2, 300, 0)], [f(2, 310, 0)]), [f(2, 310, 0)]);
  assert.deepEqual(countedFingers([f(1, 0, 0)], []), []);
});

test('a third finger is ignored, also where it lands first in the list; the two of before keep counting', () => {
  const before = [f(1, 0, 0), f(2, 100, 0)];
  const after = [f(9, 900, 900), f(1, 0, 0), f(2, 100, 0)];
  assert.deepEqual(countedFingers(before, after), [f(1, 0, 0), f(2, 100, 0)]);
  assert.deepEqual(touchStep(before, after), { dx: 0, dy: 0, factor: 1, center: { x: 50, y: 0 } });
  assert.deepEqual(touchStep(before, [f(2, 200, 0), f(9, 0, 0), f(1, 0, 0)]), { dx: 50, dy: 0, factor: 2, center: { x: 100, y: 0 } });
});

test('a counted finger lifted while a third touches starts afresh with the first two of now', () => {
  const before = [f(1, 0, 0), f(2, 100, 0)];
  const after = [f(2, 100, 0), f(9, 300, 0)];
  assert.equal(touchStep(before, after), null);
  assert.deepEqual(countedFingers(before, after), [f(2, 100, 0), f(9, 300, 0)]);
  assert.deepEqual(touchStep(countedFingers(before, after), [f(9, 400, 0), f(2, 100, 0)]), { dx: 50, dy: 0, factor: 1.5, center: { x: 250, y: 0 } });
});

test('two fingers on one point zoom nothing, they only move', () => {
  assert.deepEqual(touchStep([f(1, 5, 5), f(2, 5, 5)], [f(1, 0, 0), f(2, 10, 0)]), { dx: 0, dy: -5, factor: 1, center: { x: 5, y: 0 } });
  assert.equal(touchStep([f(1, 0, 0), f(2, 10, 0)], [f(1, 7, 7), f(2, 7, 7)]).factor, 1);
});

// ---------- a view opened before the pass ran ----------
// The view of a BPMN diagram opened while it was laid out: the notice stands
// in the stage, a label of the checkbox, so a click on it checks the box
// before the run-time pass listens (review of 2026-10-07).
test('a large view already open when the pass runs gets its viewer at once; a closed one gets none until it is opened', async () => {
  const { document } = parseHTML('<!DOCTYPE html><html><body><article id="preview" class="dokufix-doc"></article></body></html>');
  const root = document.getElementById('preview');
  const XML = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d"/>';
  root.innerHTML = '<h2>Offen</h2><pre><code class="language-bpmn">a</code></pre><h2>Zu</h2><pre><code class="language-bpmn">b</code></pre>';
  // Drawn as renderBpmn() leaves it: an SVG in the container, the XML as drawn in the source link.
  await drawDiagrams(root, { bpmn: { ...DIAGRAM_KINDS.bpmn, render: d => { d.holder.innerHTML = '<svg viewBox="0 0 100 50"></svg>'; d.xml = XML; } } });
  const [open, closed] = Array.from(root.querySelectorAll('figure.dokufix-diagram-bpmn'));
  open.querySelector('.dokufix-diagram-toggle').checked = true;
  const imported = [];
  class Viewer {
    constructor({ container }){ this.container = container; }
    async importXML(xml){ imported.push({ xml, container: this.container }); return { warnings: [] }; }
    get(name){
      if (name === 'elementRegistry') return { forEach(){}, getGraphics(){ return null; } };
      const box = { x: 0, y: 0, width: 100, height: 50 };
      return { getContainer: () => this.container, resized(){}, viewbox: v => v ? v : { inner: box, outer: { width: 800, height: 600 } }, zoom: () => 1 };
    }
    destroy(){}
  }
  const before = globalThis.BpmnJS;
  globalThis.BpmnJS = Viewer;
  try {
    attachLiveViewers(root);
    await new Promise(r => setImmediate(r));
    assert.equal(imported.length, 1, 'one viewer, the open view\'s');
    assert.equal(imported[0].xml, XML);
    assert.equal(imported[0].container.parentNode, open.querySelector('.dokufix-diagram-view'));
    assert.equal(open.querySelectorAll('.' + LIVE_CLASS + '[data-dokufix-transient]').length, 1);
    assert.equal(closed.querySelectorAll('.' + LIVE_CLASS).length, 0);
    // The checked property is no attribute: nothing of the open view is written into the figure.
    assert.equal(open.querySelector('.dokufix-diagram-toggle').hasAttribute('checked'), false);
    // The closed one starts when it is opened, as before.
    const toggle = closed.querySelector('.dokufix-diagram-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new document.defaultView.Event('change'));
    await new Promise(r => setImmediate(r));
    assert.equal(imported.length, 2);
  } finally {
    stopLiveViewers();
    if (before === undefined) delete globalThis.BpmnJS; else globalThis.BpmnJS = before;
  }
  assert.equal(root.querySelectorAll('.' + LIVE_CLASS).length, 0, 'stopped, the containers are gone');
});
