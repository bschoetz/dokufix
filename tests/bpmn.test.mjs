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
// first, which asks no library and makes no host of its own; Node has no
// Worker, so the layout runs on the page there, as in a browser without one,
// and a fake worker handed to renderBpmn() stands for the worker of a page
// (src/app/layout-client.js, checked in tests/layout-client.test.mjs): LMM gives the
// columns (src/app/lmm.js, checked in tests/lmm.test.mjs), the layout itself is
// checked in tests/bpmn-layout.test.mjs. That bpmn-js draws every element, with
// the colours of the document styles, is checked by the browser runs
// (tests/vergleich.mjs, tests/durchlaeufe.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML, DOMParser } from 'linkedom';
import { hasCoordinates, bpmnTypeClasses, bpmnWarningText, finishBpmnSvg, renderBpmn, BPMN_NO_LIBRARY, BPMN_CREDIT, BPMN_VIEWER_CONFIG, BPMN_FONT } from '../src/app/bpmn.js';
import { LAYOUT_NOTHING, layoutStrayText } from '../src/app/bpmn-layout.js';
import { measureLabel, LABEL_FONT } from '../src/app/label-size.js';
import { drawDiagrams, DIAGRAM_KINDS } from '../src/app/diagrams.js';
import { makeLayoutClient, layoutTimeLimitText, LAYOUT_ABORTED } from '../src/app/layout-client.js';
import { answerLayout } from '../src/app/bpmn-layout-job.js';
import { LAYOUT_NOTICE_CLASS } from '../src/app/layout-notice.js';

const WITH_DI = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="d"><bpmn:process id="P"><bpmn:task id="A"/></bpmn:process>' +
  '<bpmndi:BPMNDiagram><bpmndi:BPMNPlane bpmnElement="P"><bpmndi:BPMNShape bpmnElement="A"/></bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>';
const WITHOUT_DI = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="P"><bpmn:startEvent id="S" name="Los"/><bpmn:task id="A" name="Tun"/>' +
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
  assert.equal(hasCoordinates(WITHOUT_DI.replace('</bpmn:definitions>', '<?pi <bpmndi:BPMNShape/> ?></bpmn:definitions>')), false);
  // Openings without their end, before any parser has seen the text: linear (security review of 2026-10-07; a lazy
  // pattern took 6.5 s for these 320 KB).
  const t = performance.now();
  assert.equal(hasCoordinates('<!--'.repeat(80000) + '<bpmndi:BPMNShape/>'), true);
  assert.ok(performance.now() - t < 600);
  assert.equal(hasCoordinates('<!-- x --><bpmndi:BPMNShape/>'), true);
});

test('the reasons and the warning say what the plan says', () => {
  assert.equal(BPMN_NO_LIBRARY, 'Die Bibliothek bpmn-js wurde nicht geladen.');
  assert.equal(bpmnWarningText('Rückgabe'), 'Das Diagramm „Rückgabe“ konnte nicht gezeichnet werden.');
  assert.deepEqual(BPMN_CREDIT, { before: 'Gezeichnet mit ', href: 'https://bpmn.io', text: 'bpmn-js' });
});

test('the viewer draws with the three custom properties and the measurer\'s font in bpmn-js\'s default sizes, 12 px and 11 px for the labels of events, gateways and flows', () => {
  assert.deepEqual(BPMN_VIEWER_CONFIG.bpmnRenderer, { defaultFillColor: 'var(--dokufix-bpmn-fill)', defaultStrokeColor: 'var(--dokufix-bpmn-stroke)', defaultLabelColor: 'var(--dokufix-bpmn-label)' });
  assert.deepEqual(BPMN_VIEWER_CONFIG.textRenderer, { defaultStyle: { fontFamily: 'Arial, sans-serif', fontSize: 12 }, externalStyle: { fontSize: 11 } });
  assert.equal(BPMN_FONT, LABEL_FONT, 'the labels are drawn in the font they are measured in');
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
// A stand-in for bpmn-js: records what it is asked, and answers as told. Its
// text renderer is not there: asking for it throws, as nothing should.
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
      if (name === 'textRenderer'){ log.push({ measured: true }); throw new Error('No provider for "textRenderer"'); }
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
// The page's globals while fn runs: BpmnJS, the stand-in or none, DOMParser,
// and mermaid, none unless one is given: the layout needs none.
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

// ---------- XML without coordinates ----------
// The hosts a render puts into <body>, in the order it makes them.
function watchHosts(document){
  const hosts = [], append = document.body.appendChild.bind(document.body);
  document.body.appendChild = el => { hosts.push(el); return append(el); };
  return hosts;
}
// A Mermaid in the page that records whatever it is asked: the BPMN layout asks it nothing.
const mermaidTrap = () => { const asked = []; return { asked, render: async (...args) => { asked.push(args); throw new Error('Mermaid was asked'); }, run: async (...args) => { asked.push(args); } }; };

test('XML without coordinates is laid out without Mermaid, in no host of its own, then drawn with a diagram part added to the author\'s XML', async t => {
  const warned = t.mock.method(console, 'warn', () => {});
  const { Viewer, log } = standIn();
  const document = page();
  const hosts = watchHosts(document);
  const d = diagramIn(document, WITHOUT_DI);
  await withLibrary(Viewer, () => { assert.equal(typeof globalThis.mermaid, 'undefined', 'the page has no Mermaid'); return renderBpmn(d); });
  // One host was made, the viewer's: transient, in <body>, off-screen.
  assert.equal(hosts.length, 1);
  assert.equal(log[0].host, hosts[0]);
  assert.equal(log[0].transient, true);
  // bpmn-js got the author's XML with the diagram part before the closing tag.
  const xml = log.find(x => x.imported).imported;
  const close = WITHOUT_DI.lastIndexOf('</bpmn:definitions>');
  assert.equal(xml.slice(0, close), WITHOUT_DI.slice(0, close));
  assert.ok(xml.endsWith('</bpmn:definitions>'));
  assert.deepEqual((xml.match(/bpmnElement="[^"]+"/g) || []).map(m => m.slice(13, -1)), ['P', 'S', 'A', 'F']);
  // The start left of the task: the columns LMM gave.
  const x = id => Number(new RegExp('bpmnElement="' + id + '"><dc:Bounds x="(-?[\\d.]+)"').exec(xml)[1]);
  assert.ok(x('S') < x('A'), xml);
  assert.equal(d.xml, xml, 'the laid-out XML is kept on the diagram');
  assert.equal(log.find(x => x.imported).diagram, 'dokufix_diagram', 'bpmn-js opens the laid-out diagram');
  assert.equal(d.holder.firstElementChild.tagName.toLowerCase(), 'svg');
  assert.equal(document.querySelectorAll('[data-dokufix-transient]').length, 0, 'the host is gone');
  assert.deepEqual(Array.from(document.body.children).map(el => el.id), ['preview']);
  assert.equal(warned.mock.calls.length, 0, 'nothing left out, nothing on the console');
});

test('the diagram part follows the structure of the process, not the order of the XML: the flow nodes and flows written the other way round give the same', async t => {
  t.mock.method(console, 'warn', () => {});
  const reversed = WITHOUT_DI.replace('<bpmn:startEvent id="S" name="Los"/><bpmn:task id="A" name="Tun"/>', '<bpmn:task id="A" name="Tun"/><bpmn:startEvent id="S" name="Los"/>');
  assert.notEqual(reversed, WITHOUT_DI, 'mutation target not found');
  const drawn = async source => {
    const { Viewer, log } = standIn();
    await withLibrary(Viewer, () => renderBpmn(diagramIn(page(), source)));
    const xml = log.find(x => x.imported).imported;
    return xml.slice(xml.indexOf('<bpmndi:BPMNDiagram'));
  };
  const [a, b] = [await drawn(WITHOUT_DI), await drawn(reversed)];
  // The same boxes and waypoints per element; the shapes stand in the order of the author's XML.
  const byElement = part => (part.match(/<bpmndi:BPMN(?:Shape|Edge) [^]*?<\/bpmndi:BPMN(?:Shape|Edge)>/g) || []).map(e => e.replace(/ id="[^"]*"/, '')).sort();
  assert.deepEqual(byElement(b), byElement(a));
  assert.ok(b.indexOf('bpmnElement="A"') < b.indexOf('bpmnElement="S"'), 'the reversed XML keeps its order in the diagram part');
});

const labelHeight = (xml, id) => Number(new RegExp('bpmnElement="' + id + '"><dc:Bounds[^>]*/><bpmndi:BPMNLabel><dc:Bounds [^>]*height="([\\d.]+)"').exec(xml)[1]);

test('the labels of a layout are measured by the layout itself, not by the viewer, which is made only to draw', async t => {
  t.mock.method(console, 'warn', () => {});
  const { Viewer, log } = standIn();
  const document = page();
  const d = diagramIn(document, WITHOUT_DI);
  await withLibrary(Viewer, () => renderBpmn(d));
  // "Los": one line of 13.2 px (11 px), rounded up, as measureLabel() gives it; the viewer's text renderer is never asked.
  assert.equal(labelHeight(log.find(x => x.imported).imported, 'S'), measureLabel('Los').h);
  assert.equal(labelHeight(log.find(x => x.imported).imported, 'S'), 14);
  assert.deepEqual(log.map(x => Object.keys(x)[0]), ['made', 'imported', 'saved', 'destroyed'], 'the viewer draws, nothing else');
  assert.equal(document.querySelectorAll('[data-dokufix-transient]').length, 0);
});

test('XML with coordinates is drawn as written; a Mermaid in the page is asked neither for it nor for XML without coordinates', async t => {
  t.mock.method(console, 'warn', () => {});
  const { Viewer, log } = standIn();
  const mermaid = mermaidTrap();
  const d = diagramIn(page(), WITH_DI);
  await withLibrary(Viewer, () => renderBpmn(d), mermaid);
  assert.equal(log.find(x => x.imported).imported, WITH_DI);
  assert.equal(log.find(x => x.imported).diagram, undefined, 'bpmn-js opens the first diagram, as it always did');
  assert.equal(d.xml, WITH_DI);
  const laidOut = diagramIn(page(), WITHOUT_DI);
  await withLibrary(standIn().Viewer, () => renderBpmn(laidOut), mermaid);
  assert.equal(laidOut.holder.firstElementChild.tagName.toLowerCase(), 'svg');
  assert.deepEqual(mermaid.asked, []);
});

test('an empty diagram part of the author\'s (a plane without shapes) stays as written, and bpmn-js opens the laid-out diagram after it', async t => {
  t.mock.method(console, 'warn', () => {});
  const { Viewer, log } = standIn();
  const document = page();
  const empty = WITHOUT_DI.replace('</bpmn:definitions>', '<bpmndi:BPMNDiagram xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" id="BD"><bpmndi:BPMNPlane id="BP" bpmnElement="P"/></bpmndi:BPMNDiagram></bpmn:definitions>');
  const d = diagramIn(document, empty);
  await withLibrary(Viewer, () => renderBpmn(d));
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
  const xml = WITHOUT_DI.replace('</bpmn:process>', '<bpmn:dataStoreReference id="B"/><bpmn:sequenceFlow id="G" sourceRef="B" targetRef="A"/></bpmn:process>');
  const d = diagramIn(document, xml);
  await withLibrary(Viewer, () => renderBpmn(d));
  assert.equal(d.holder.firstElementChild.tagName.toLowerCase(), 'svg');
  assert.deepEqual(warned.mock.calls.map(c => c.arguments.join(' ')), ['BPMN layout, left out: dataStoreReference B: not laid out', 'BPMN layout, left out: sequenceFlow G: touches B, which is not laid out']);
});

// ---------- XML without coordinates, through a worker ----------
// A worker of the test's: it answers as src/layout-worker.js when told.
function fakeWorker(){
  const w = { sent: [], terminated: false, onmessage: null, onerror: null };
  w.postMessage = m => w.sent.push(structuredClone(m));
  w.terminate = () => { w.terminated = true; };
  w.answer = () => w.onmessage({ data: structuredClone(answerLayout(w.sent.at(-1))) });
  return w;
}
// The notice's timer and clock: what is pending, and one tick.
function noticeTimers(){
  const t = { intervals: new Map(), next: 1, time: 0 };
  t.timers = { setInterval: (fn, ms) => { const id = t.next++; t.intervals.set(id, fn); return id; }, clearInterval: id => t.intervals.delete(id) };
  t.now = () => t.time;
  t.tick = ms => { t.time = ms; for (const fn of t.intervals.values()) fn(); };
  return t;
}
const until = async (test, what) => { for (let i = 0; i < 200 && !test(); i++) await new Promise(r => setImmediate(r)); assert.ok(test(), what); };

test('XML without coordinates through a worker: the notice counts in the container while the worker lays out, then the SVG of the same XML as on the page', async t => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'info', () => {});
  // On the page, without a worker: what bpmn-js is to get.
  const direct = standIn();
  await withLibrary(direct.Viewer, () => renderBpmn(diagramIn(page(), WITHOUT_DI)));
  const expected = direct.log.find(x => x.imported);
  const w = fakeWorker(), clock = noticeTimers();
  const client = makeLayoutClient({ makeWorker: () => w });
  const { Viewer, log } = standIn();
  const document = page();
  const d = diagramIn(document, WITHOUT_DI);
  await withLibrary(Viewer, async () => {
    const drawn = renderBpmn(d, { client, timers: clock.timers, now: clock.now });
    await until(() => w.sent.length === 1, 'the XML went to the worker');
    assert.deepEqual(w.sent[0], { id: 1, xml: WITHOUT_DI });
    const notice = d.holder.firstElementChild;
    assert.equal(notice.getAttribute('class'), LAYOUT_NOTICE_CLASS);
    assert.equal(d.holder.textContent, 'Diagramm wird angeordnet … 0 s');
    assert.equal(notice.hasAttribute('data-dokufix-transient'), true);
    clock.tick(1000);
    clock.tick(2000);
    assert.equal(d.holder.textContent, 'Diagramm wird angeordnet … 2 s');
    assert.equal(log.length, 0, 'no viewer while the worker lays out');
    w.answer();
    await drawn;
  });
  assert.deepEqual(log.find(x => x.imported), expected, 'bpmn-js got the same XML and opens the same diagram');
  assert.equal(d.xml, expected.imported);
  assert.equal(d.holder.firstElementChild.tagName.toLowerCase(), 'svg', 'the SVG took the notice\'s place');
  assert.equal(clock.intervals.size, 0, 'the count is stopped');
  assert.equal(document.querySelectorAll('[data-dokufix-transient]').length, 0);
});

test('through a worker, what the layout leaves out is a line on the console each, as on the page', async t => {
  const warned = t.mock.method(console, 'warn', () => {});
  const w = fakeWorker();
  const xml = WITHOUT_DI.replace('</bpmn:process>', '<bpmn:dataStoreReference id="B"/></bpmn:process>');
  const d = diagramIn(page(), xml);
  await withLibrary(standIn().Viewer, async () => {
    const drawn = renderBpmn(d, { client: makeLayoutClient({ makeWorker: () => w }) });
    await until(() => w.sent.length === 1, 'sent');
    w.answer();
    await drawn;
  });
  assert.deepEqual(warned.mock.calls.map(c => c.arguments.join(' ')), ['BPMN layout, left out: dataStoreReference B: not laid out']);
});

test('a worker that takes longer than the time limit: the diagram is refused with the reason, the count stopped, no host, the worker terminated', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const w = fakeWorker(), clock = noticeTimers();
  const { Viewer, log } = standIn();
  const document = page();
  const d = diagramIn(document, WITHOUT_DI);
  await withLibrary(Viewer, () => assert.rejects(renderBpmn(d, { client: makeLayoutClient({ makeWorker: () => w, timeLimit: 20 }), timers: clock.timers, now: clock.now }), { message: layoutTimeLimitText(20) }));
  assert.equal(w.terminated, true);
  assert.equal(clock.intervals.size, 0, 'the count is stopped');
  assert.equal(log.length, 0, 'bpmn-js is not asked');
  assert.deepEqual(Array.from(document.body.children).map(el => el.id), ['preview']);
  assert.equal(logged.mock.calls.at(-1).arguments[0], 'BPMN error:');
});

test('a layout refused in the worker is the reason, as on the page', async t => {
  t.mock.method(console, 'error', () => {});
  const w = fakeWorker();
  const empty = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="P1"/></bpmn:definitions>';
  const d = diagramIn(page(), empty);
  await withLibrary(standIn().Viewer, async () => {
    const drawn = renderBpmn(d, { client: makeLayoutClient({ makeWorker: () => w }) });
    await until(() => w.sent.length === 1, 'sent');
    w.answer();
    await assert.rejects(drawn, { message: LAYOUT_NOTHING });
  });
});

test('the render\'s signal aborts a layout in the worker: the diagram is refused, the worker terminated, the count stopped', async t => {
  t.mock.method(console, 'error', () => {});
  const w = fakeWorker(), clock = noticeTimers();
  const controller = new AbortController();
  const d = { ...diagramIn(page(), WITHOUT_DI), signal: controller.signal };
  await withLibrary(standIn().Viewer, async () => {
    const drawn = renderBpmn(d, { client: makeLayoutClient({ makeWorker: () => w }), timers: clock.timers, now: clock.now });
    await until(() => w.sent.length === 1, 'sent');
    controller.abort();
    await assert.rejects(drawn, { name: 'AbortError', message: LAYOUT_ABORTED });
  });
  assert.equal(w.terminated, true);
  assert.equal(clock.intervals.size, 0);
});

test('a BPMN block\'s container holds no source while the diagrams before it are drawn, and each diagram gets the render\'s signal', async t => {
  t.mock.method(console, 'info', () => {});
  const document = page();
  const root = document.getElementById('preview');
  root.innerHTML = '<h2>Eins</h2><pre><code class="language-bpmn">' + WITH_DI.replace(/</g, '&lt;') + '</code></pre>' +
    '<h2>Zwei</h2><pre><code class="language-bpmn">' + WITHOUT_DI.replace(/</g, '&lt;') + '</code></pre>';
  const seen = [];
  const controller = new AbortController();
  await withLibrary(standIn().Viewer, () => drawDiagrams(root, { bpmn: { ...DIAGRAM_KINDS.bpmn, render: d => {
    seen.push({ title: d.title, signal: d.signal === controller.signal, holders: Array.from(root.querySelectorAll('.dokufix-diagram-svg'), h => h.textContent) });
    return DIAGRAM_KINDS.bpmn.render(d);
  } } }, { signal: controller.signal }));
  assert.deepEqual(seen, [{ title: 'Eins', signal: true, holders: ['', ''] }, { title: 'Zwei', signal: true, holders: ['', ''] }]);
  assert.equal(root.querySelectorAll('figure .dokufix-diagram-svg > svg').length, 2);
});

// The order of the reasons: XML the layout's parser rejects, and XML that is no
// BPMN definitions, go to bpmn-js, which words the reason; then the layout's
// own refusals (nothing to place, a node in no lane), before any host.
test('a refusal of the layout is the reason, and no host is made', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const { Viewer, log } = standIn();
  const empty = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="P1"/></bpmn:definitions>';
  let document = page();
  await withLibrary(Viewer, () => assert.rejects(renderBpmn(diagramIn(document, empty)), { message: LAYOUT_NOTHING }));
  assert.equal(log.length, 0, 'bpmn-js is not asked');
  assert.deepEqual(Array.from(document.body.children).map(el => el.id), ['preview']);
  assert.equal(logged.mock.calls.at(-1).arguments[0], 'BPMN error:');
  // A node in no lane of a process with lanes.
  document = page();
  const stray = WITHOUT_DI.replace('<bpmn:process id="P">', '<bpmn:process id="P"><bpmn:laneSet id="LS"><bpmn:lane id="L1"><bpmn:flowNodeRef>S</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>');
  await withLibrary(Viewer, () => assert.rejects(renderBpmn(diagramIn(document, stray)), { message: layoutStrayText(['A']) }));
  assert.equal(log.length, 0, 'bpmn-js is not asked');
  assert.deepEqual(Array.from(document.body.children).map(el => el.id), ['preview']);
});

test('XML that is no BPMN definitions goes to bpmn-js as it is, and its message is the reason', async t => {
  t.mock.method(console, 'error', () => {});
  const { Viewer, log } = standIn({ importError: new Error('unparsable content <process> detected') });
  const xml = '<process id="P"><task id="A"/></process>';
  await withLibrary(Viewer, () => assert.rejects(renderBpmn(diagramIn(page(), xml)), { message: 'unparsable content <process> detected' }));
  assert.equal(log.find(x => x.imported).imported, xml);
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
  const empty = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="P1"/></bpmn:definitions>';
  root.innerHTML = '<h2>Rückgabe</h2><pre><code class="language-bpmn">' + WITH_DI.replace(/</g, '&lt;') + '</code></pre>' +
    '<h2>Ohne</h2><pre><code class="language-bpmn">' + WITHOUT_DI.replace(/</g, '&lt;') + '</code></pre>' +
    '<h2>Leer</h2><pre><code class="language-bpmn">' + empty.replace(/</g, '&lt;') + '</code></pre>';
  const { Viewer } = standIn();
  let got = null;
  await withLibrary(Viewer, async () => {
    // The kind as the product has it, its renderer watched. The second block
    // has no coordinates and is laid out, though the page has no Mermaid; the
    // third has nothing to place.
    await drawDiagrams(root, { bpmn: { ...DIAGRAM_KINDS.bpmn, render: d => { got = got || d.source; return DIAGRAM_KINDS.bpmn.render(d); } } });
  });
  assert.equal(got, WITH_DI, 'the renderer got the XML as text');
  const figure = root.querySelector('figure');
  assert.equal(figure.getAttribute('class'), 'dokufix-diagram dokufix-diagram-bpmn');
  assert.equal(figure.getAttribute('aria-label'), 'Rückgabe');
  assert.deepEqual(Array.from(figure.children).slice(-3).map(k => k.tagName.toLowerCase() + '.' + k.getAttribute('class')), ['div.dokufix-diagram-view', 'div.dokufix-diagram-downloads', 'figcaption.dokufix-diagram-credit']);
  // The source below it is the XML as drawn, here the author's, which has coordinates (story 2.10).
  const source = figure.querySelector('.dokufix-diagram-downloads > a');
  assert.equal(source.getAttribute('download'), 'Rückgabe.bpmn');
  assert.equal(decodeURIComponent(source.getAttribute('href').replace(/^data:application\/xml;charset=utf-8,/, '')), WITH_DI);
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
  assert.equal(w.querySelector('.dokufix-warning-title').textContent, 'Warnung: Das Diagramm „Leer“ konnte nicht gezeichnet werden.');
  assert.equal(w.querySelector('.dokufix-warning-detail').textContent, LAYOUT_NOTHING);
  assert.deepEqual(Array.from(root.querySelectorAll('figure')).map(f => f.getAttribute('aria-label')), ['Rückgabe', 'Ohne']);
  assert.equal(root.querySelectorAll('.dokufix-warning').length, 1);
});
