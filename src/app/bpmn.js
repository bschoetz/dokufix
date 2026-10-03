import { TRANSIENT_ATTR } from './transient.js';

// --- BPMN diagrams ---------------------------------------------------------
// A fenced block of the language `bpmn` holds BPMN 2.0 XML with its diagram
// part (BPMN-DI): the coordinates a modeler wrote. bpmn-js, the navigated
// viewer the page loads from the CDN (global BpmnJS), draws it off-screen;
// the document gets only the SVG of its export function saveSVG(). The
// library is used as it is; it never runs in a read-only export.
//
//   1. the library has to be there, the XML has to parse, and it has to hold
//      coordinates; otherwise the diagram is refused with the reason, and
//      diagrams.js puts a warning in its place
//   2. bpmn-js draws into a host of its own: transient, fixed off-screen,
//      outside the document, in <body>; it is destroyed and the host removed
//      after each diagram, whether it was drawn or not
//   3. before the export each element gets a class by its type, which the
//      document styles colour (src/doc.css): the viewer is told to draw with
//      custom properties (var(--dokufix-bpmn-…)) instead of colours, so no
//      colour is fixed in the SVG
//   4. the SVG is finished (finishBpmnSvg()): the viewer's hit areas out, the
//      title as its accessible name, the width of a Mermaid diagram, ids made
//      unique in the document
//
// Pure logic, apart from renderBpmn(), which needs a page and the library:
// the rest works on the strings and elements it is handed.
// tests/bpmn.test.mjs runs all of it in Node, renderBpmn() with a stand-in
// for the library.

export const BPMN_NO_LIBRARY = 'Die Bibliothek bpmn-js wurde nicht geladen.';
export const BPMN_NO_COORDINATES = 'Das BPMN-XML enthält keine Koordinaten (BPMN-DI).';
export const BPMN_CREDIT = { href: 'https://bpmn.io', text: 'gerendert mit bpmn.io' };

// The warning that stands where a BPMN diagram could not be drawn; its detail
// is the reason.
export function bpmnWarningText(title){
  return 'Das Diagramm „' + title + '“ konnte nicht gezeichnet werden.';
}

// Whether the XML places anything: a BPMNShape, whatever its prefix.
export function hasCoordinates(xml){
  return /<(?:[\w.-]+:)?BPMNShape\b/.test(String(xml));
}

// The document's system font stack (src/app.css, the export frame), at 12 px:
// labels are measured with it when the diagram is drawn.
export const BPMN_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// What the viewer is told: colours are custom properties that the document
// styles define on the figure, and the text renderer uses the document's font.
export const BPMN_VIEWER_CONFIG = {
  bpmnRenderer: {
    defaultFillColor: 'var(--dokufix-bpmn-fill)',
    defaultStrokeColor: 'var(--dokufix-bpmn-stroke)',
    defaultLabelColor: 'var(--dokufix-bpmn-label)',
  },
  textRenderer: {
    defaultStyle: { fontFamily: BPMN_FONT, fontSize: 12 },
    externalStyle: { fontSize: 12 },
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

// The SVG as saveSVG() made it, parsed, made ready for the document:
//   - the hit areas go, which only the running viewer uses
//   - role img and the title as its accessible name
//   - width 100 % and no height, its own width as the largest, as Mermaid
//     writes its SVG: never wider than the column, never larger than drawn
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

// The host the viewer draws into: in <body>, outside the document, fixed and
// off-screen, so that it neither shows nor makes the page larger, and
// transient, so that no save takes it along if a save meets a render.
function offscreenHost(doc){
  const host = doc.createElement('div');
  host.setAttribute(TRANSIENT_ATTR, '');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:4000px;height:3000px;overflow:hidden';
  doc.body.appendChild(host);
  return host;
}

// Renderer of the kind bpmn (diagrams.js): draws diagram.source into
// diagram.holder, or throws with the reason. The ids of the SVG are numbered
// by the diagram's place in the document, diagram.index.
export async function renderBpmn(diagram){
  try {
    await drawBpmn(diagram);
  } catch (err){
    console.error('BPMN error:', err);
    throw err;
  }
}

async function drawBpmn(diagram){
  // A page whose script tag of bpmn-js failed has no BpmnJS.
  if (typeof BpmnJS !== 'function') throw new Error(BPMN_NO_LIBRARY);
  const xml = diagram.source;
  const doc = diagram.holder.ownerDocument;
  const host = offscreenHost(doc);
  let viewer = null;
  try {
    viewer = new BpmnJS({ container: host, ...BPMN_VIEWER_CONFIG });
    let result;
    try {
      result = await viewer.importXML(xml);
    } catch (err){
      // XML that parses but has no diagram part: bpmn-js has nothing to show.
      if (!hasCoordinates(xml) && /no diagram to display/i.test(String(err && err.message))) throw new Error(BPMN_NO_COORDINATES);
      throw err;
    }
    // A diagram part that places nothing draws an empty picture.
    if (!hasCoordinates(xml)) throw new Error(BPMN_NO_COORDINATES);
    // Elements bpmn-js does not know are drawn without them; that goes to the console only.
    for (const w of (result && result.warnings) || []) console.warn('BPMN import warning:', w && w.message ? w.message : w);
    const registry = viewer.get('elementRegistry');
    registry.forEach(element => {
      const gfx = registry.getGraphics(element);
      const classes = element.type === 'label' ? [] : bpmnTypeClasses(element.type);
      if (gfx && classes.length) gfx.classList.add(...classes);
    });
    const { svg } = await viewer.saveSVG();
    const parsed = new globalThis.DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    if (!parsed || parsed.nodeName.toLowerCase() !== 'svg') throw new Error('bpmn-js hat kein SVG geliefert.');
    finishBpmnSvg(parsed, diagram.title, 'dokufix-bpmn-' + diagram.index + '-');
    diagram.holder.replaceChildren(doc.importNode(parsed, true));
  } finally {
    try { if (viewer) viewer.destroy(); }
    finally { host.remove(); }
  }
}
