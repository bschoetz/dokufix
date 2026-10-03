// BPMN diagrams, run in Node: no browser, no bpmn-js.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/bpmn.js decides, without the library: whether XML holds coordinates,
// which class an element gets by its type, what the warning says, and what is
// done to the SVG before it goes into the document. Those are checked here as
// they are. The renderer itself, renderBpmn(), is run with a stand-in for the
// library (the global BpmnJS): that is enough for its refusals, its host and
// the order of what it does. XML without coordinates goes through the layout
// first, with a stand-in for Mermaid (the global mermaid) that answers with an
// SVG of the shape Mermaid 12.0.0 writes; the layout itself is checked in
// tests/bpmn-layout.test.mjs. That bpmn-js draws every element, with the
// colours of the document styles, and that Mermaid lays out as expected, is
// checked by the browser runs (tests/vergleich.mjs, tests/durchlaeufe.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML, DOMParser } from 'linkedom';
import { hasCoordinates, bpmnTypeClasses, bpmnWarningText, finishBpmnSvg, renderBpmn, BPMN_NO_LIBRARY, BPMN_NO_MERMAID, BPMN_CREDIT, BPMN_VIEWER_CONFIG } from '../src/app/bpmn.js';
import { LAYOUT_SEVERAL_POOLS } from '../src/app/bpmn-layout.js';
import { drawDiagrams, DIAGRAM_KINDS } from '../src/app/diagrams.js';

const WITH_DI = '<bpmn:definitions xmlns:bpmn="m" xmlns:bpmndi="d"><bpmn:process id="P"><bpmn:task id="A"/></bpmn:process>' +
  '<bpmndi:BPMNDiagram><bpmndi:BPMNPlane bpmnElement="P"><bpmndi:BPMNShape bpmnElement="A"/></bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>';
const WITHOUT_DI = '<bpmn:definitions xmlns:bpmn="m"><bpmn:process id="P"><bpmn:startEvent id="S" name="Los"/><bpmn:task id="A" name="Tun"/>' +
  '<bpmn:sequenceFlow id="F" sourceRef="S" targetRef="A"/></bpmn:process></bpmn:definitions>';

// The SVG as saveSVG() writes it, in the parts that matter here.
const SAVED = '<?xml version="1.0" encoding="utf-8"?>\n<!-- created with bpmn-js / http://bpmn.io -->\n' +
  '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="140" viewBox="5 15 420 140" version="1.1">' +
  '<g class="djs-element djs-connection" data-element-id="F1"><g class="djs-visual"><defs><marker id="marker-abc"><path d="M 1 5 Z"/></marker></defs>' +
  '<path style="fill: none; stroke: var(--dokufix-bpmn-stroke); marker-end: url(\'#marker-abc\');" d="M0,0L10,0"/></g>' +
  '<path class="djs-hit djs-hit-stroke" d="M0,0L10,0" style="stroke: white;"/></g>' +
  '<g class="djs-element djs-shape" data-element-id="A"><g class="djs-visual"><rect width="100" height="80" style="fill: var(--dokufix-bpmn-fill);"/></g>' +
  '<rect class="djs-hit djs-hit-all" width="100" height="80" style="stroke: white;"/></g>' +
  '<use href="#marker-abc"/><use xlink:href="#marker-abc"/></svg>';
const svgOf = text => new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;

// ---------- what needs no library ----------
test('coordinates: an XML with a BPMNShape has them, whatever its prefix; one without has none', () => {
  assert.equal(hasCoordinates(WITH_DI), true);
  assert.equal(hasCoordinates(WITH_DI.replace(/bpmndi:/g, 'di2:')), true);
  assert.equal(hasCoordinates(WITH_DI.replace(/bpmndi:/g, '')), true);
  assert.equal(hasCoordinates(WITHOUT_DI), false);
  assert.equal(hasCoordinates('<bpmndi:BPMNShapeX/>'), false);
  assert.equal(hasCoordinates(''), false);
  // A shape in a comment or a CDATA section places nothing.
  assert.equal(hasCoordinates(WITHOUT_DI.replace('</bpmn:definitions>', '<!-- <bpmndi:BPMNShape bpmnElement="A"/> --></bpmn:definitions>')), false);
  assert.equal(hasCoordinates(WITHOUT_DI.replace('</bpmn:definitions>', '<![CDATA[<bpmndi:BPMNShape/>]]></bpmn:definitions>')), false);
  assert.equal(hasCoordinates('<!-- x --><bpmndi:BPMNShape/>'), true);
});

test('the reasons and the warning say what the plan says', () => {
  assert.equal(BPMN_NO_MERMAID, 'Die Bibliothek Mermaid wurde nicht geladen; sie ordnet BPMN ohne Koordinaten an.');
  assert.equal(BPMN_NO_LIBRARY, 'Die Bibliothek bpmn-js wurde nicht geladen.');
  assert.equal(bpmnWarningText('Rückgabe'), 'Das Diagramm „Rückgabe“ konnte nicht gezeichnet werden.');
  assert.deepEqual(BPMN_CREDIT, { before: 'Gezeichnet mit ', href: 'https://bpmn.io', text: 'bpmn-js' });
});

test('the viewer draws with the three custom properties and the document\'s font at 12 px', () => {
  assert.deepEqual(BPMN_VIEWER_CONFIG.bpmnRenderer, { defaultFillColor: 'var(--dokufix-bpmn-fill)', defaultStrokeColor: 'var(--dokufix-bpmn-stroke)', defaultLabelColor: 'var(--dokufix-bpmn-label)' });
  assert.equal(BPMN_VIEWER_CONFIG.textRenderer.defaultStyle.fontSize, 12);
  assert.match(BPMN_VIEWER_CONFIG.textRenderer.defaultStyle.fontFamily, /^-apple-system,.*sans-serif$/);
});

test('every element type gets the class of its kind, and its own where a kind has several', () => {
  const cases = {
    'bpmn:Participant': ['dokufix-bpmn-pool'], 'bpmn:Lane': ['dokufix-bpmn-lane'],
    'bpmn:Task': ['dokufix-bpmn-task', 'dokufix-bpmn-task'], 'bpmn:UserTask': ['dokufix-bpmn-task', 'dokufix-bpmn-usertask'],
    'bpmn:ServiceTask': ['dokufix-bpmn-task', 'dokufix-bpmn-servicetask'], 'bpmn:SendTask': ['dokufix-bpmn-task', 'dokufix-bpmn-sendtask'],
    'bpmn:ReceiveTask': ['dokufix-bpmn-task', 'dokufix-bpmn-receivetask'], 'bpmn:ManualTask': ['dokufix-bpmn-task', 'dokufix-bpmn-manualtask'],
    'bpmn:ScriptTask': ['dokufix-bpmn-task', 'dokufix-bpmn-scripttask'], 'bpmn:BusinessRuleTask': ['dokufix-bpmn-task', 'dokufix-bpmn-businessruletask'],
    'bpmn:CallActivity': ['dokufix-bpmn-callactivity'], 'bpmn:SubProcess': ['dokufix-bpmn-subprocess', 'dokufix-bpmn-subprocess'],
    'bpmn:StartEvent': ['dokufix-bpmn-event', 'dokufix-bpmn-startevent'], 'bpmn:EndEvent': ['dokufix-bpmn-event', 'dokufix-bpmn-endevent'],
    'bpmn:IntermediateCatchEvent': ['dokufix-bpmn-event', 'dokufix-bpmn-intermediatecatchevent'],
    'bpmn:IntermediateThrowEvent': ['dokufix-bpmn-event', 'dokufix-bpmn-intermediatethrowevent'],
    'bpmn:BoundaryEvent': ['dokufix-bpmn-event', 'dokufix-bpmn-boundaryevent'],
    'bpmn:ExclusiveGateway': ['dokufix-bpmn-gateway', 'dokufix-bpmn-exclusivegateway'], 'bpmn:ParallelGateway': ['dokufix-bpmn-gateway', 'dokufix-bpmn-parallelgateway'],
    'bpmn:InclusiveGateway': ['dokufix-bpmn-gateway', 'dokufix-bpmn-inclusivegateway'], 'bpmn:EventBasedGateway': ['dokufix-bpmn-gateway', 'dokufix-bpmn-eventbasedgateway'],
    'bpmn:SequenceFlow': ['dokufix-bpmn-sequenceflow'], 'bpmn:MessageFlow': ['dokufix-bpmn-messageflow'],
    'bpmn:TextAnnotation': ['dokufix-bpmn-textannotation'],
    'bpmn:Collaboration': [], 'bpmn:Process': [], 'label': [],
  };
  for (const [type, want] of Object.entries(cases)) assert.deepEqual(bpmnTypeClasses(type), want, type);
});

// ---------- the SVG ----------
test('the finished SVG: no hit areas, role img with the title, the width of a Mermaid diagram', () => {
  const svg = finishBpmnSvg(svgOf(SAVED), 'Rückgabe', 'dokufix-bpmn-2-');
  assert.equal(svg.querySelectorAll('.djs-hit').length, 0);
  assert.equal(svg.getAttribute('role'), 'img');
  assert.equal(svg.getAttribute('aria-label'), 'Rückgabe');
  assert.equal(svg.getAttribute('width'), '100%');
  assert.equal(svg.hasAttribute('height'), false);
  assert.equal(svg.getAttribute('style'), 'max-width: 420px;');
  assert.equal(svg.getAttribute('viewBox'), '5 15 420 140');
  // What bpmn-js wrote besides stays: its classes, the element ids as data.
  assert.equal(svg.querySelectorAll('[data-element-id="A"] rect').length, 1);
  assert.doesNotMatch(svg.toString(), /white/);
});

test('every id gets the prefix, and so does every reference to it', () => {
  const svg = finishBpmnSvg(svgOf(SAVED), 'Rückgabe', 'dokufix-bpmn-2-');
  assert.deepEqual(Array.from(svg.querySelectorAll('[id]')).map(el => el.getAttribute('id')), ['dokufix-bpmn-2-1']);
  const text = svg.toString();
  assert.match(text, /marker-end: url\('#dokufix-bpmn-2-1'\);/);
  assert.match(text, /<use href="#dokufix-bpmn-2-1"/);
  assert.match(text, /<use xlink:href="#dokufix-bpmn-2-1"/);
  assert.doesNotMatch(text, /marker-abc/);
  // Two diagrams in one document: no id in common.
  const other = finishBpmnSvg(svgOf(SAVED), 'Zwei', 'dokufix-bpmn-3-');
  assert.equal(other.querySelector('[id]').getAttribute('id'), 'dokufix-bpmn-3-1');
});

test('an SVG with a foreignObject is refused', () => {
  const svg = svgOf('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><foreignObject><p>x</p></foreignObject></svg>');
  assert.throws(() => finishBpmnSvg(svg, 'T', 'p-'), /foreignObject/);
});

// ---------- the renderer, with a stand-in for the library ----------
// A stand-in for bpmn-js: records what it is asked, and answers as told.
function standIn({ importError = null, warnings = [], svg = SAVED, types = ['bpmn:Participant', 'bpmn:UserTask', 'label', 'bpmn:SequenceFlow'] } = {}){
  const log = [];
  class Viewer {
    constructor(options){
      this.options = options;
      const host = options.container;
      log.push({ made: true, host, inBody: host.parentNode === host.ownerDocument.body, style: host.getAttribute('style'),
                 transient: host.hasAttribute('data-dokufix-transient'), hidden: host.getAttribute('aria-hidden') });
      this.gfx = types.map(type => ({ type, el: host.ownerDocument.createElement('g') }));
      Viewer.last = this;
    }
    async importXML(xml, diagram){ log.push({ imported: xml, diagram }); if (importError) throw importError; return { warnings }; }
    get(name){
      assert.equal(name, 'elementRegistry');
      return { forEach: fn => this.gfx.forEach(g => fn({ type: g.type })), getGraphics: element => this.gfx.find(g => g.type === element.type).el };
    }
    async saveSVG(){ log.push({ saved: true }); return { svg }; }
    destroy(){ log.push({ destroyed: true }); }
  }
  return { Viewer, log };
}
function page(){
  const { document } = parseHTML('<!DOCTYPE html><html><body><article id="preview" class="dokufix-doc"></article></body></html>');
  return document;
}
async function withLibrary(Viewer, fn, mermaid = null){
  const before = { BpmnJS: globalThis.BpmnJS, DOMParser: globalThis.DOMParser, mermaid: globalThis.mermaid };
  if (Viewer) globalThis.BpmnJS = Viewer; else delete globalThis.BpmnJS;
  if (mermaid) globalThis.mermaid = mermaid; else delete globalThis.mermaid;
  globalThis.DOMParser = DOMParser;
  try { return await fn(); }
  finally {
    for (const name of ['BpmnJS', 'DOMParser', 'mermaid']){
      if (before[name] === undefined) delete globalThis[name]; else globalThis[name] = before[name];
    }
  }
}
function diagramIn(document, source){
  const holder = document.createElement('div');
  document.getElementById('preview').appendChild(holder);
  return { holder, source, title: 'Rückgabe', index: 4 };
}

test('the renderer draws into a transient host in <body>, off-screen, then destroys the viewer and removes the host', async () => {
  const { Viewer, log } = standIn();
  const document = page();
  const d = diagramIn(document, WITH_DI);
  await withLibrary(Viewer, () => renderBpmn(d));
  const made = log[0];
  assert.equal(made.inBody, true, 'the host stands in <body>, outside the document');
  assert.equal(made.transient, true);
  assert.equal(made.hidden, 'true');
  assert.match(made.style, /position:\s*fixed/);
  assert.match(made.style, /left:\s*-10000px/);
  assert.deepEqual(log.slice(1).map(x => Object.keys(x)[0]), ['imported', 'saved', 'destroyed']);
  assert.equal(Viewer.last.options.bpmnRenderer.defaultStrokeColor, 'var(--dokufix-bpmn-stroke)');
  assert.equal(document.querySelectorAll('[data-dokufix-transient]').length, 0, 'the host is gone');
  assert.deepEqual(Array.from(document.body.children).map(el => el.id), ['preview']);
  // The SVG is in the holder, finished, its ids numbered by the diagram's place.
  const svg = d.holder.firstElementChild;
  assert.equal(d.holder.children.length, 1);
  assert.equal(svg.tagName.toLowerCase(), 'svg');
  assert.equal(svg.getAttribute('aria-label'), 'Rückgabe');
  assert.equal(svg.querySelector('marker').getAttribute('id'), 'dokufix-bpmn-4-1');
  assert.equal(d.holder.innerHTML.includes('bpmn-js'), false, 'the comment of saveSVG() is not taken along');
  // Each element got the classes of its type before the export; a label none.
  assert.deepEqual(Viewer.last.gfx.map(g => g.el.getAttribute('class') || ''), ['dokufix-bpmn-pool', 'dokufix-bpmn-task dokufix-bpmn-usertask', '', 'dokufix-bpmn-sequenceflow']);
});

test('without the library: refused with its reason, and no host is made', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const document = page();
  const d = diagramIn(document, WITH_DI);
  await withLibrary(null, () => assert.rejects(renderBpmn(d), { message: BPMN_NO_LIBRARY }));
  assert.deepEqual(Array.from(document.body.children).map(el => el.id), ['preview']);
  // A refusal is a line on the console as well.
  assert.equal(logged.mock.calls.length, 1);
  assert.equal(logged.mock.calls[0].arguments[0], 'BPMN error:');
});

// XML that does not parse and has no BPMNShape goes to bpmn-js unchanged as
// well; linkedom reports no parser error for it, so that is the browser runs'.
test('XML that bpmn-js cannot import: refused with the library\'s message; the viewer destroyed, the host removed', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const { Viewer, log } = standIn({ importError: new Error('unparsable content kein BPMN detected') });
  const document = page();
  await withLibrary(Viewer, () => assert.rejects(renderBpmn(diagramIn(document, '<bpmn:definitions><bpmndi:BPMNShape/>kein BPMN')), { message: 'unparsable content kein BPMN detected' }));
  assert.deepEqual(log.slice(1).map(x => Object.keys(x)[0]), ['imported', 'destroyed']);
  assert.equal(document.querySelectorAll('[data-dokufix-transient]').length, 0);
});

// ---------- XML without coordinates, with a stand-in for Mermaid ----------
// A stand-in for Mermaid: records what it is asked and answers with an SVG of
// the shape Mermaid 12.0.0 writes for WITHOUT_DI: the synthetic lane l1, the
// start n1 and the task n2, and the flow between them. Its boxes are in
// data-bbox, which the stand-in's getBBox() reads: linkedom lays nothing out.
const LAYOUT_SVG = id => '<svg xmlns="http://www.w3.org/2000/svg" id="' + id + '">' +
  '<g class="cluster swimlane" data-id="l1"><rect class="swimlane-body" data-bbox="0 0 500 200"/><rect class="swimlane-title" data-bbox="0 0 40 200"/></g>' +
  '<g class="node" id="' + id + '-flowchart-n1-0" transform="translate(100, 100)" data-bbox="-40 -40 80 80"/>' +
  '<g class="node" id="' + id + '-flowchart-n2-1" transform="translate(300, 100)" data-bbox="-70 -30 140 60"/>' +
  '<path data-edge="true" data-id="L_n1_n2_0" data-points="' + Buffer.from(JSON.stringify([{ x: 140, y: 100 }, { x: 230, y: 100 }])).toString('base64') + '"/></svg>';
function mermaidStandIn({ error = null } = {}){
  const log = [];
  return { log, render: async (id, text, container) => {
    log.push({ id, text, transient: container.hasAttribute('data-dokufix-transient'), inBody: container.parentNode === container.ownerDocument.body, style: container.getAttribute('style') });
    if (error) throw error;
    return { svg: LAYOUT_SVG(id) };
  } };
}
// getBBox() for linkedom's elements, from data-bbox, while fn runs.
async function withBoxes(document, fn){
  let proto = Object.getPrototypeOf(document.createElement('div'));
  while (proto && !Object.prototype.hasOwnProperty.call(proto, 'getAttribute')) proto = Object.getPrototypeOf(proto);
  proto.getBBox = function(){ const [x, y, width, height] = (this.getAttribute('data-bbox') || '0 0 0 0').split(' ').map(Number); return { x, y, width, height }; };
  try { return await fn(); } finally { delete proto.getBBox; }
}

test('XML without coordinates is laid out by Mermaid in a transient host, then drawn with a diagram part added to the author\'s XML', async t => {
  const warned = t.mock.method(console, 'warn', () => {});
  const { Viewer, log } = standIn();
  const layout = mermaidStandIn();
  const document = page();
  const d = diagramIn(document, WITHOUT_DI);
  await withBoxes(document, () => withLibrary(Viewer, () => renderBpmn(d), layout));
  assert.equal(layout.log.length, 1);
  const asked = layout.log[0];
  assert.match(asked.id, /^dokufix-bpmn-layout-4-\d+$/, 'named by the diagram\'s place and the layout\'s number, without "-flowchart-"');
  assert.equal(asked.text, 'swimlane-beta LR\n  subgraph l1[" "]\n    n1(("Los"))\n    n2["Tun"]\n  end\n  n1 --> n2\n');
  assert.equal(asked.transient, true);
  assert.equal(asked.inBody, true);
  assert.match(asked.style, /position:\s*fixed/);
  // bpmn-js got the author's XML with the diagram part before the closing tag.
  const xml = log.find(x => x.imported).imported;
  const close = WITHOUT_DI.lastIndexOf('</bpmn:definitions>');
  assert.equal(xml.slice(0, close), WITHOUT_DI.slice(0, close));
  assert.ok(xml.endsWith('</bpmn:definitions>'));
  assert.deepEqual((xml.match(/bpmnElement="[^"]+"/g) || []).map(m => m.slice(13, -1)), ['P', 'S', 'A', 'F']);
  assert.equal(d.xml, xml, 'the laid-out XML is kept on the diagram');
  assert.equal(log.find(x => x.imported).diagram, 'dokufix_diagram', 'bpmn-js opens the laid-out diagram');
  assert.equal(d.holder.firstElementChild.tagName.toLowerCase(), 'svg');
  // Both hosts are gone: Mermaid's and the viewer's.
  assert.equal(document.querySelectorAll('[data-dokufix-transient]').length, 0);
  assert.deepEqual(Array.from(document.body.children).map(el => el.id), ['preview']);
  assert.equal(warned.mock.calls.length, 0, 'nothing left out, nothing on the console');
});

test('XML with coordinates is drawn as written, and Mermaid is not asked', async () => {
  const { Viewer, log } = standIn();
  const layout = mermaidStandIn();
  const d = diagramIn(page(), WITH_DI);
  await withLibrary(Viewer, () => renderBpmn(d), layout);
  assert.equal(layout.log.length, 0);
  assert.equal(log.find(x => x.imported).imported, WITH_DI);
  assert.equal(log.find(x => x.imported).diagram, undefined, 'bpmn-js opens the first diagram, as it always did');
  assert.equal(d.xml, WITH_DI);
});

test('an empty diagram part of the author\'s (a plane without shapes) stays as written, and bpmn-js opens the laid-out diagram after it', async t => {
  t.mock.method(console, 'warn', () => {});
  const { Viewer, log } = standIn();
  const document = page();
  const empty = WITHOUT_DI.replace('</bpmn:definitions>', '<bpmndi:BPMNDiagram id="BD"><bpmndi:BPMNPlane id="BP" bpmnElement="P"/></bpmndi:BPMNDiagram></bpmn:definitions>');
  const d = diagramIn(document, empty);
  await withBoxes(document, () => withLibrary(Viewer, () => renderBpmn(d), mermaidStandIn()));
  const asked = log.find(x => x.imported);
  const close = empty.lastIndexOf('</bpmn:definitions>');
  assert.equal(asked.imported.slice(0, close), empty.slice(0, close), 'the author\'s empty diagram part as written');
  assert.equal((asked.imported.match(/<bpmndi:BPMNDiagram\b/g) || []).length, 2);
  assert.equal(asked.diagram, 'dokufix_diagram');
  assert.equal(d.holder.firstElementChild.tagName.toLowerCase(), 'svg');
});

test('what the layout leaves out is a line on the console each, and the rest is drawn', async t => {
  const warned = t.mock.method(console, 'warn', () => {});
  const { Viewer } = standIn();
  const document = page();
  const xml = WITHOUT_DI.replace('</bpmn:process>', '<bpmn:boundaryEvent id="B" attachedToRef="A"/><bpmn:sequenceFlow id="G" sourceRef="B" targetRef="A"/></bpmn:process>');
  const d = diagramIn(document, xml);
  await withBoxes(document, () => withLibrary(Viewer, () => renderBpmn(d), mermaidStandIn()));
  assert.equal(d.holder.firstElementChild.tagName.toLowerCase(), 'svg');
  assert.deepEqual(warned.mock.calls.map(c => c.arguments.join(' ')), ['BPMN layout, left out: boundaryEvent B: not laid out', 'BPMN layout, left out: sequenceFlow G: touches B, which is not laid out']);
});

test('XML without coordinates and without Mermaid: refused with that reason; no host is made', async t => {
  t.mock.method(console, 'error', () => {});
  const { Viewer, log } = standIn();
  const document = page();
  await withLibrary(Viewer, () => assert.rejects(renderBpmn(diagramIn(document, WITHOUT_DI)), { message: BPMN_NO_MERMAID }));
  assert.equal(log.length, 0, 'bpmn-js is not asked');
  assert.deepEqual(Array.from(document.body.children).map(el => el.id), ['preview']);
});

test('a refusal of the layout comes before Mermaid is asked; an error of Mermaid is the reason, and its host is removed', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const { Viewer } = standIn();
  const layout = mermaidStandIn();
  const two = '<bpmn:definitions xmlns:bpmn="m"><bpmn:process id="P1"><bpmn:task id="A"/></bpmn:process><bpmn:process id="P2"><bpmn:task id="B"/></bpmn:process></bpmn:definitions>';
  let document = page();
  await withLibrary(Viewer, () => assert.rejects(renderBpmn(diagramIn(document, two)), { message: LAYOUT_SEVERAL_POOLS }), layout);
  assert.equal(layout.log.length, 0);
  assert.equal(logged.mock.calls.at(-1).arguments[0], 'BPMN error:');
  document = page();
  const failing = mermaidStandIn({ error: new Error('Parse error on line 3') });
  await withLibrary(Viewer, () => assert.rejects(renderBpmn(diagramIn(document, WITHOUT_DI)), { message: 'Parse error on line 3' }), failing);
  assert.equal(failing.log.length, 1);
  assert.deepEqual(Array.from(document.body.children).map(el => el.id), ['preview']);
});

test('XML that is no BPMN definitions goes to bpmn-js as it is, and its message is the reason', async t => {
  t.mock.method(console, 'error', () => {});
  const { Viewer, log } = standIn({ importError: new Error('unparsable content <process> detected') });
  const layout = mermaidStandIn();
  const xml = '<process id="P"><task id="A"/></process>';
  await withLibrary(Viewer, () => assert.rejects(renderBpmn(diagramIn(page(), xml)), { message: 'unparsable content <process> detected' }), layout);
  assert.equal(log.find(x => x.imported).imported, xml);
  assert.equal(layout.log.length, 0);
});

test('import warnings go to the console, and the diagram is drawn', async t => {
  const warned = t.mock.method(console, 'warn', () => {});
  const { Viewer } = standIn({ warnings: [{ message: 'unknown type <bpmn:Fantasie>' }] });
  const d = diagramIn(page(), WITH_DI);
  await withLibrary(Viewer, () => renderBpmn(d));
  assert.equal(d.holder.firstElementChild.tagName.toLowerCase(), 'svg');
  assert.equal(warned.mock.calls.length, 1);
  assert.match(String(warned.mock.calls[0].arguments[1]), /Fantasie/);
});

test('an SVG with a foreignObject from the library is refused, and the host removed', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const { Viewer } = standIn({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><foreignObject/></svg>' });
  const document = page();
  await withLibrary(Viewer, () => assert.rejects(renderBpmn(diagramIn(document, WITH_DI)), /foreignObject/));
  assert.equal(document.querySelectorAll('[data-dokufix-transient]').length, 0);
});

// ---------- in the figure ----------
test('a bpmn block becomes a figure with the credit below the SVG container; a refused one the warning naming its title', async t => {
  t.mock.method(console, 'error', () => {});
  const document = page();
  const root = document.getElementById('preview');
  root.innerHTML = '<h2>Rückgabe</h2><pre><code class="language-bpmn">' + WITH_DI.replace(/</g, '&lt;') + '</code></pre>' +
    '<h2>Ohne</h2><pre><code class="language-bpmn">' + WITHOUT_DI.replace(/</g, '&lt;') + '</code></pre>';
  const { Viewer } = standIn();
  let got = null;
  await withLibrary(Viewer, async () => {
    // The kind as the product has it, its renderer watched. The second block
    // has no coordinates, and the page no Mermaid to lay it out.
    await drawDiagrams(root, { bpmn: { ...DIAGRAM_KINDS.bpmn, render: d => { got = got || d.source; return DIAGRAM_KINDS.bpmn.render(d); } } });
  });
  assert.equal(got, WITH_DI, 'the renderer got the XML as text');
  const figure = root.querySelector('figure');
  assert.equal(figure.getAttribute('class'), 'dokufix-diagram dokufix-diagram-bpmn');
  assert.equal(figure.getAttribute('aria-label'), 'Rückgabe');
  assert.deepEqual(Array.from(figure.children).slice(-2).map(k => k.tagName.toLowerCase() + '.' + k.getAttribute('class')), ['div.dokufix-diagram-view', 'figcaption.dokufix-diagram-credit']);
  assert.ok(figure.querySelector('.dokufix-diagram-view > .dokufix-diagram-stage > .dokufix-diagram-svg > svg'));
  // Its width as drawn, the SVG's max-width, is on the figure.
  assert.equal(figure.getAttribute('style'), '--dokufix-diagram-width:' + figure.querySelector('svg').style.maxWidth);
  const link = figure.querySelector('figcaption > a');
  assert.equal(link.getAttribute('href'), 'https://bpmn.io');
  assert.equal(link.textContent, 'bpmn-js');
  assert.equal(figure.querySelector('figcaption').textContent, 'Gezeichnet mit bpmn-js');
  assert.equal(figure.querySelector('figcaption').innerHTML, 'Gezeichnet mit <a href="https://bpmn.io">bpmn-js</a>');
  assert.equal(figure.querySelector('.dokufix-diagram-svg > svg').getAttribute('aria-label'), 'Rückgabe');
  const w = root.querySelector('.dokufix-warning');
  assert.equal(w.querySelector('.dokufix-warning-title').textContent, 'Warnung: Das Diagramm „Ohne“ konnte nicht gezeichnet werden.');
  assert.equal(w.querySelector('.dokufix-warning-detail').textContent, BPMN_NO_MERMAID);
  assert.equal(root.querySelectorAll('figure').length, 1);
});
