import { TRANSIENT_ATTR } from './transient.js';
import { maskNotMarkup } from './bpmn-layout.js';
import { makeLayoutClient } from './layout-client.js';
import { showLayoutNotice } from './layout-notice.js';
import { LABEL_FONT, TEXT_FONT_SIZE, LABEL_FONT_SIZE } from './label-size.js';

// --- BPMN diagrams ---------------------------------------------------------
// A fenced block of the language `bpmn` holds BPMN 2.0 XML, with its diagram
// part (BPMN-DI), the coordinates a modeler wrote, or without it; XML without
// one is laid out first (src/app/bpmn-layout.js, the columns from LMM,
// src/app/lmm.js) and then drawn as if it had come with it. bpmn-js, the navigated
// viewer the page loads from the CDN (global BpmnJS), draws it off-screen;
// the document gets only the SVG of its export function saveSVG(). The
// library is used as it is; it never runs in a read-only export.
//
//   1. the library has to be there and the XML has to parse; otherwise the
//      diagram is refused with the reason, and diagrams.js puts a warning in
//      its place. XML without coordinates is laid out (layoutJob() of
//      src/app/bpmn-layout-job.js), in the layout's worker where the page can
//      make one (src/app/layout-client.js), with a notice in the diagram's
//      container that counts the seconds (src/app/layout-notice.js); or it is
//      refused with the reason the layout gives, the time limit's included;
//      XML the browser cannot read goes to bpmn-js as it is, which words the
//      reason
//   2. bpmn-js draws into a host of its own: transient, fixed off-screen,
//      outside the document, in <body>; it is destroyed and the host removed
//      after each diagram, whether it was drawn or not
//   3. before the export each element gets a class by its type, which the
//      document styles colour (src/doc.css): the viewer is told to draw with
//      custom properties (var(--dokufix-bpmn-…)) instead of colours, so no
//      colour is fixed in the SVG
//   4. the SVG is finished (finishBpmnSvg()): the viewer's hit areas out, the
//      title as its accessible name, the width as every diagram of the
//      document has it (drawnWidth() in src/app/diagrams.js), ids made unique
//      in the document
//
// Pure logic, apart from renderBpmn(), which needs a page: the library
// (BpmnJS) and the page's DOMParser, the exception
// to the rule for such modules (src/README.md). It draws in the holder's
// document. The rest works on the strings and elements it is handed.
// tests/bpmn.test.mjs runs all of it in Node, renderBpmn() with a stand-in
// for the library, and with a fake worker or without one: Node has no
// Worker, so there the layout runs in the same call, on the page.

export const BPMN_NO_LIBRARY = 'Die Bibliothek bpmn-js wurde nicht geladen.';
// The attribution below every BPMN diagram: "Gezeichnet mit bpmn-js", the
// name of the library a link to bpmn.io (Ben, 2026-10-03; it read "gerendert
// mit bpmn.io" before, which sounded as if data went to an outside service).
export const BPMN_CREDIT = { before: 'Gezeichnet mit ', href: 'https://bpmn.io', text: 'bpmn-js' };

// The warning that stands where a BPMN diagram could not be drawn; its detail
// is the reason.
export function bpmnWarningText(title){
  return 'Das Diagramm „' + title + '“ konnte nicht gezeichnet werden.';
}

// Whether the XML places anything: a BPMNShape, whatever its prefix, outside
// comments, CDATA sections and PIs (maskNotMarkup(), linear in the text: this
// runs before any parser, on whatever the block holds).
export function hasCoordinates(xml){
  return /<(?:[\w.-]+:)?BPMNShape\b/.test(maskNotMarkup(String(xml)));
}

// The font bpmn-js draws in: its own default, "Arial, sans-serif",
// the font the layout of XML without coordinates measures the labels in
// (src/app/label-size.js), so the labels fit the boxes the layout gave them,
// here as in the Camunda Modeler. Until the layout measured for itself it was
// the document's system font stack (src/app.css), and the labels were measured
// in it when the diagram was drawn, differently on every machine. No font is
// embedded: Windows and macOS have Arial, Linux usually Liberation Sans in its
// place, with the same widths; a machine with neither draws the labels in
// another width than the boxes.
export const BPMN_FONT = LABEL_FONT;

// What the viewer is told: colours are custom properties that the document
// styles define on the figure, and the text renderer uses the layout's font in
// bpmn-js's own default sizes, 12 px and, for the labels of events, gateways
// and flows, 11 px (src/app/label-size.js), as the Camunda Modeler draws them.
// Until the layout measured in 11 px they were drawn at 12 px too.
export const BPMN_VIEWER_CONFIG = {
  bpmnRenderer: {
    defaultFillColor: 'var(--dokufix-bpmn-fill)',
    defaultStrokeColor: 'var(--dokufix-bpmn-stroke)',
    defaultLabelColor: 'var(--dokufix-bpmn-label)',
  },
  textRenderer: {
    defaultStyle: { fontFamily: BPMN_FONT, fontSize: TEXT_FONT_SIZE },
    externalStyle: { fontSize: LABEL_FONT_SIZE },
  },
};

// The classes of an element of the given BPMN type ("bpmn:UserTask"): its kind,
// which the document styles colour, and, where the kind has several types,
// the type itself. [] for what gets no class of its own.
export function bpmnTypeClasses(type){
  const name = String(type).replace(/^bpmn:/, '');
  const own = 'dokufix-bpmn-' + name.toLowerCase();
  if (name === 'Participant') return ['dokufix-bpmn-pool'];
  if (name === 'Lane') return ['dokufix-bpmn-lane'];
  if (name === 'CallActivity') return ['dokufix-bpmn-callactivity'];
  if (/^(SubProcess|AdHocSubProcess|Transaction)$/.test(name)) return ['dokufix-bpmn-subprocess', own];
  if (/Task$/.test(name)) return ['dokufix-bpmn-task', own];
  if (/Gateway$/.test(name)) return ['dokufix-bpmn-gateway', own];
  if (/^(StartEvent|EndEvent|IntermediateCatchEvent|IntermediateThrowEvent|BoundaryEvent)$/.test(name)) return ['dokufix-bpmn-event', own];
  if (/^(SequenceFlow|MessageFlow|Association|DataInputAssociation|DataOutputAssociation)$/.test(name)) return [own];
  if (/^(DataObjectReference|DataStoreReference|TextAnnotation|Group)$/.test(name)) return [own];
  return [];
}

// Every element a viewer drew gets the classes of its type (bpmnTypeClasses()),
// on its graphics: before the export of a diagram, and in the live viewer of
// the large view (src/app/live-viewer.js), so both draw in the same colours.
export function addBpmnTypeClasses(viewer){
  const registry = viewer.get('elementRegistry');
  registry.forEach(element => {
    const gfx = registry.getGraphics(element);
    const classes = element.type === 'label' ? [] : bpmnTypeClasses(element.type);
    if (gfx && classes.length) gfx.classList.add(...classes);
  });
}

// The SVG as saveSVG() made it, parsed, made ready for the document:
//   - the hit areas go, which only the running viewer uses
//   - role img and the title as its accessible name
//   - width 100 % and no height, its own width as the largest, as the other
//     diagrams of the document write their SVG (drawnWidth() in
//     src/app/diagrams.js reads them alike): never wider than the column,
//     never larger than drawn
//   - every id gets the prefix, and every reference to it with it, so two
//     diagrams in one document never share one
// Refused: an SVG with a foreignObject, which no picture outside a browser
// shows. Returns the element.
export function finishBpmnSvg(svg, title, prefix){
  if (svg.querySelector('foreignObject')) throw new Error('Das SVG enthält ein foreignObject.');
  svg.querySelectorAll('.djs-hit').forEach(el => el.remove());
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', title);
  const box = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const width = box.length === 4 && box[2] > 0 ? box[2] : Number(svg.getAttribute('width')) || 0;
  svg.setAttribute('width', '100%');
  svg.removeAttribute('height');
  if (width) svg.setAttribute('style', 'max-width: ' + Math.round(width) + 'px;');
  const ids = new Map();
  svg.querySelectorAll('[id]').forEach(el => {
    const id = prefix + (ids.size + 1);
    ids.set(el.getAttribute('id'), id);
    el.setAttribute('id', id);
  });
  if (ids.size){
    const swap = text => text
      .replace(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g, (all, quote, id) => ids.has(id) ? 'url(' + quote + '#' + ids.get(id) + quote + ')' : all);
    svg.querySelectorAll('*').forEach(el => {
      for (const attr of Array.from(el.attributes)){
        if ((attr.name === 'href' || attr.name === 'xlink:href') && attr.value.startsWith('#')){
          const id = attr.value.slice(1);
          if (ids.has(id)) el.setAttribute(attr.name, '#' + ids.get(id));
        } else if (attr.value.includes('url(')){
          const changed = swap(attr.value);
          if (changed !== attr.value) el.setAttribute(attr.name, changed);
        }
      }
    });
  }
  return svg;
}

// The host the viewer draws into: in <body>, outside
// the document, fixed and off-screen, so that it neither shows nor makes the
// page larger, and transient, so that no save takes it along if a save meets
// a render.
function offscreenHost(doc){
  const host = doc.createElement('div');
  host.setAttribute(TRANSIENT_ATTR, '');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:4000px;height:3000px;overflow:hidden';
  doc.body.appendChild(host);
  return host;
}

// The layout's client of the page: one, made with the first diagram that
// needs it, so the worker it makes serves every render.
let pageClient = null;
const pageLayoutClient = () => pageClient || (pageClient = makeLayoutClient());

// Renderer of the kind bpmn (diagrams.js): draws diagram.source into
// diagram.holder, or throws with the reason. The ids of the SVG are numbered
// by the diagram's place in the document, diagram.index. diagram.signal, where
// the render gives one, aborts a layout still running (src/app/render.js).
// options, for the tests: client, the layout's client (makeLayoutClient());
// timers and now, the notice's (showLayoutNotice()). A diagram whose
// render was aborted by a newer one throws as well, the layout's AbortError,
// but logs nothing: an abort is no failure, and the preview it stands in is
// about to be replaced (drawDiagrams() in src/app/diagrams.js).
export async function renderBpmn(diagram, options = {}){
  try {
    await drawBpmn(diagram, options);
  } catch (err){
    if (!(diagram.signal && diagram.signal.aborted)) console.error('BPMN error:', err);
    throw err;
  }
}

async function drawBpmn(diagram, { client, timers, now } = {}){
  // A page whose script tag of bpmn-js failed has no BpmnJS.
  if (typeof BpmnJS !== 'function') throw new Error(BPMN_NO_LIBRARY);
  const doc = diagram.holder.ownerDocument;
  // The viewer is made once there is something to draw: a diagram refused
  // before that, and one the layout refuses, makes no host.
  let host = null, viewer = null;
  try {
    // The XML that is drawn, with coordinates where they could be made, and the
    // diagram in it bpmn-js opens: the laid-out one, else its first.
    let xml = diagram.source, open;
    if (!hasCoordinates(xml)){
      const notice = showLayoutNotice(diagram.holder, { timers, now });
      let leftOut;
      try {
        ({ xml, open, leftOut } = await (client || pageLayoutClient()).layout(diagram.source, { signal: diagram.signal }));
      } finally { notice.stop(); }
      // What the layout leaves out is a line on the console each.
      for (const line of leftOut || []) console.warn('BPMN layout, left out:', line);
    }
    diagram.xml = xml;
    host = offscreenHost(doc);
    viewer = new BpmnJS({ container: host, ...BPMN_VIEWER_CONFIG });
    const result = await (open ? viewer.importXML(xml, open) : viewer.importXML(xml));
    // Elements bpmn-js does not know are drawn without them; that goes to the console only.
    for (const w of (result && result.warnings) || []) console.warn('BPMN import warning:', w && w.message ? w.message : w);
    addBpmnTypeClasses(viewer);
    const { svg } = await viewer.saveSVG();
    const parsed = new globalThis.DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    if (!parsed || parsed.nodeName.toLowerCase() !== 'svg') throw new Error('bpmn-js hat kein SVG geliefert.');
    finishBpmnSvg(parsed, diagram.title, 'dokufix-bpmn-' + diagram.index + '-');
    diagram.holder.replaceChildren(doc.importNode(parsed, true));
  } finally {
    try { if (viewer) viewer.destroy(); }
    finally { if (host) host.remove(); }
  }
}
