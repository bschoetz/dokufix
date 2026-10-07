import { TRANSIENT_ATTR } from './transient.js';
import { BPMN_VIEWER_CONFIG, BPMN_NO_LIBRARY, addBpmnTypeClasses } from './bpmn.js';
import { maskNotMarkup } from './bpmn-layout.js';
import { addLineJumps } from './line-jumps.js';
import { DIAGRAM_CLASS, DIAGRAM_SVG_CLASS, DIAGRAM_TOGGLE_CLASS, DIAGRAM_ZOOM_CLASS, DIAGRAM_VIEW_CLASS, removeViewerLeftovers } from './diagrams.js';

// --- The live viewer in the large view of a BPMN diagram (story 2.11) -------
// Where the app script runs, the editor and a `Mit Editor` file, opening the
// large view of a BPMN diagram starts the navigated viewer of bpmn-js (global
// BpmnJS) in place of the picture: Ctrl+wheel zooms at the pointer, the wheel
// and a drag move the diagram, Ctrl+arrow keys too, and the library shows its
// logo, bottom right, as its licence asks. bpmn-js hears only the mouse: on a
// touch screen one finger moves the diagram and two zoom it at their middle,
// by listeners of this module on the container (attachTouch(), story 2.23).
// The zoom steps of the view set its scale. The read-only exports never start
// it: the reader bundle does not carry this module, and a Mermaid diagram
// keeps the static view everywhere.
//
//   <div class="dokufix-diagram-view">
//     <div class="dokufix-diagram-bar">
//       … the steps
//       <span class="dokufix-diagram-hint" data-dokufix-transient>Strg + Mausrad: zoomen · Ziehen: verschieben</span>
//       <label class="dokufix-diagram-close" …>Schließen</label>
//     </div>
//     <div class="dokufix-diagram-live" data-dokufix-transient> … what bpmn-js puts into its container </div>
//     <label class="dokufix-diagram-stage" …> … the picture, hidden while the viewer stands before it </label>
//   </div>
//
// The container stands outside the stage, which is a label of the checkbox:
// a click or a drag in the viewer moves the diagram and closes nothing.
// "Schließen", Escape and Space on the checkbox close it. The document styles
// hide the stage behind the container (src/doc.css).
//
// The viewer draws the XML of the figure's source link (story 2.10), which is
// the XML the picture was drawn from, with the colours of the picture: the
// same configuration (BPMN_VIEWER_CONFIG) and the same classes by type. Where
// the author's XML had no coordinates, the link holds the laid-out XML, and
// the viewer opens the first diagram of it that places anything: the one
// dokufix laid out, not an empty one of the author's.
//
// Everything the viewer puts into the page is transient, and goes when the
// view closes, in whatever way, and with every render (render() destroys a
// viewer still running before it parses, stopLiveViewers()). What the
// library puts elsewhere, the lightbox of its logo in <body> and a cursor
// class on <body>, goes by name, here on closing and in a save
// (removeViewerLeftovers() in src/app/diagrams.js). A viewer that cannot start
// (no BpmnJS, an import that fails) leaves the static view of story 2.9, and
// says so in one line on the console; the reader gets no warning.
//
// The pure part, sourceXml(), diagramToOpen(), stepViewbox(),
// countedFingers() and touchStep(), works on the strings and numbers it is
// handed (tests/live-viewer.test.mjs). The rest needs a page and the library.

export const LIVE_CLASS = 'dokufix-diagram-live';
export const HINT_CLASS = 'dokufix-diagram-hint';
// Decided by Ben, 2026-10-03.
export const LIVE_HINT = 'Strg + Mausrad: zoomen · Ziehen: verschieben';
// "Einpassen": the margin around the diagram on every side, and the largest scale.
export const FIT_MARGIN = 24;
export const FIT_MOST = 1.5;
// Where a diagram is larger than the viewer, it starts at its top left, with this margin.
export const START_MARGIN = 20;
// The scales two fingers zoom between: those of Ctrl+wheel in bpmn-js.
export const TOUCH_SCALE = { min: 0.2, max: 4 };

// The text of a source link's data: URL, as sourceDataUrl() wrote it: the
// XML the picture was drawn from.
export function sourceXml(href){
  const s = String(href);
  return decodeURIComponent(s.slice(s.indexOf(',') + 1));
}

// The id of the first BPMNDiagram of the XML that holds a BPMNShape, whatever
// their prefix, outside comments, CDATA sections and PIs (maskNotMarkup(),
// linear in the text); null where none does, or where that diagram has no id:
// bpmn-js then opens the first.
export function diagramToOpen(xml){
  const text = maskNotMarkup(String(xml));
  // Each start tag; a self-closing one (<bpmndi:BPMNDiagram id="x"/>) holds nothing.
  const START = /<((?:[\w.-]+:)?BPMNDiagram)\b((?:[^>"'/]|"[^"]*"|'[^']*'|\/(?!>))*)(\/?)>/g;
  for (let m; (m = START.exec(text));){
    if (m[3]) continue;
    const end = new RegExp('<\\/' + m[1].replace(/\./g, '\\.') + '\\s*>', 'g');
    end.lastIndex = START.lastIndex;
    const close = end.exec(text);
    const body = text.slice(START.lastIndex, close ? close.index : text.length);
    if (close) START.lastIndex = end.lastIndex;
    if (!/<(?:[\w.-]+:)?BPMNShape\b/.test(body)) continue;
    const id = /(?:^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(m[2]);
    return id ? (id[1] !== undefined ? id[1] : id[2]) : null;
  }
  return null;
}

// The viewbox of the canvas for a zoom step: step, the value of its radio
// button ("fit", "100", "150", "200"); inner, the box of the diagram, and
// outer, the size of the viewer, as canvas.viewbox() gives them. "Einpassen"
// shows the whole diagram with 24 px around it, at most at 150 %; the others
// draw it at 1, 1.5 and 2. Where the diagram fits, it stands in the middle;
// where it does not, it starts at its top left, where a process begins.
export function stepViewbox(step, inner, outer){
  let scale = step === 'fit'
    ? Math.min((outer.width - 2 * FIT_MARGIN) / inner.width, (outer.height - 2 * FIT_MARGIN) / inner.height, FIT_MOST)
    : Number(step) / 100;
  if (!(scale > 0) || !Number.isFinite(scale)) scale = 1;
  const width = outer.width / scale, height = outer.height / scale;
  return {
    x: width >= inner.width ? inner.x - (width - inner.width) / 2 : inner.x - START_MARGIN,
    y: height >= inner.height ? inner.y - (height - inner.height) / 2 : inner.y - START_MARGIN,
    width, height,
  };
}

// The fingers on the viewer are { id, x, y }: the identifier of the touch and
// its point in the viewer, in pixels. Of all fingers, at most two count: the
// two (or the one) that counted before, while they all still touch and their
// number is still the one that counts, whatever the order of the touches;
// else the first two of now, afresh. So a third finger changes nothing, and a
// finger more or less below two, or one of the two lifted, starts afresh.
export function countedFingers(before, now){
  const kept = before.slice(0, 2).map(f => now.find(t => t.id === f.id));
  if (kept.length === Math.min(now.length, 2) && kept.every(Boolean)) return kept;
  return now.slice(0, 2);
}

// One move of the fingers: before, the fingers that counted (countedFingers());
// after, all fingers now, paired with those by id. One finger moves the
// diagram with it; two move it with their middle and zoom it at that middle
// by the change of their distance. { dx, dy, factor, center }, or null where
// the fingers that count changed (a finger more or less starts afresh, so
// the diagram does not jump) or none touches. Two fingers on one point zoom
// nothing.
export function touchStep(before, after){
  const now = countedFingers(before, after);
  if (!now.length || now.length !== before.length || now.some((f, k) => f.id !== before[k].id)) return null;
  if (now.length === 1) return { dx: now[0].x - before[0].x, dy: now[0].y - before[0].y, factor: 1, center: { x: now[0].x, y: now[0].y } };
  const middle = ([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const distance = ([a, b]) => Math.hypot(a.x - b.x, a.y - b.y);
  const from = middle(before), to = middle(now);
  const d0 = distance(before), d1 = distance(now);
  return { dx: to.x - from.x, dy: to.y - from.y, factor: d0 > 0 && d1 > 0 ? d1 / d0 : 1, center: to };
}

// --- in the page ---
// The viewers that run, by their figure: { viewer, box, hint, closed, importing }.
const running = new Map();

// Every running viewer destroyed, with what it left in <body>. render() calls
// it first, before it parses: a render that ends early (Markdown that cannot
// be parsed) replaces the preview all the same.
export function stopLiveViewers(){
  for (const figure of Array.from(running.keys())) stopViewer(figure);
}

// Run-time pass "BPMN-Ansicht": a viewer still running from before the render
// is destroyed; every BPMN figure follows its view: the checkbox opens and
// closes the viewer, a step (chosen again too) sets its scale. Every way of
// changing a control fires `change`: a click, Space and the arrows through
// the browser, Escape and + and - through src/app/large-view.js.
// A view already open when the pass runs gets its viewer at once. That is the
// view opened while the diagram was laid out: the notice of the layout stands
// in the stage, a label of the checkbox, so a click on it opens the view, and
// the change came before this pass listened (review of 2026-10-07). The view
// stays open to be used: it shows the notice large while the layout runs and
// the live viewer once the diagram is drawn. Blocking the view while a
// diagram waits would make a click do nothing visible, and would put a state
// on the checkbox, which is document content, to be taken off again after
// every layout and kept out of every file. Nothing here is written into the
// figure: the checked property is no attribute (src/app/large-view.js).
export function attachLiveViewers(root){
  stopLiveViewers();
  for (const figure of root.querySelectorAll('figure.' + DIAGRAM_CLASS + '-bpmn')){
    const toggle = figure.querySelector(':scope > .' + DIAGRAM_TOGGLE_CLASS);
    if (!toggle) continue;
    toggle.addEventListener('change', () => { if (toggle.checked) startViewer(figure); else stopViewer(figure); });
    for (const radio of figure.querySelectorAll(':scope > .' + DIAGRAM_ZOOM_CLASS)){
      const apply = () => { if (radio.checked) applyStep(figure); };
      radio.addEventListener('change', apply);
      radio.addEventListener('click', apply);
    }
    if (toggle.checked) startViewer(figure);
  }
}

// The step chosen in the figure, set on its viewer, if one is ready.
function applyStep(figure){
  const state = running.get(figure);
  if (!state || state.importing || state.closed) return;
  const radio = figure.querySelector(':scope > .' + DIAGRAM_ZOOM_CLASS + ':checked');
  const canvas = state.viewer.get('canvas');
  const { inner, outer } = canvas.viewbox();
  if (!(inner.width > 0) || !(inner.height > 0)) return;
  canvas.viewbox(stepViewbox(radio ? radio.value : 'fit', inner, outer));
}

async function startViewer(figure){
  if (running.has(figure)){ applyStep(figure); return; }
  const doc = figure.ownerDocument;
  const view = figure.querySelector(':scope > .' + DIAGRAM_VIEW_CLASS);
  const stage = view && view.querySelector(':scope > .' + DIAGRAM_CLASS + '-stage');
  const bar = view && view.querySelector(':scope > .' + DIAGRAM_CLASS + '-bar');
  const link = figure.querySelector(':scope > .' + DIAGRAM_CLASS + '-downloads > a[download]');
  // Without its source the figure keeps the static view.
  if (!stage || !bar || !link || !stage.querySelector('.' + DIAGRAM_SVG_CLASS + ' svg')) return;
  const state = { viewer: null, box: null, hint: null, closed: false, importing: true };
  running.set(figure, state);
  try {
    // A page whose script tag of bpmn-js failed, or one the library was taken from.
    if (typeof BpmnJS !== 'function') throw new Error(BPMN_NO_LIBRARY);
    const xml = sourceXml(link.getAttribute('href'));
    const box = doc.createElement('div');
    box.className = LIVE_CLASS;
    box.setAttribute(TRANSIENT_ATTR, '');
    view.insertBefore(box, stage);
    state.box = box;
    state.viewer = new BpmnJS({ container: box, ...BPMN_VIEWER_CONFIG });
    attachTouch(box, state.viewer.get('canvas'));
    const id = diagramToOpen(xml);
    const result = await (id ? state.viewer.importXML(xml, id) : state.viewer.importXML(xml));
    state.importing = false;
    // Closed while it was importing: stopViewer() has taken the rest out.
    if (state.closed){ destroy(state); return; }
    for (const w of (result && result.warnings) || []) console.warn('BPMN viewer, import warning:', w && w.message ? w.message : w);
    addBpmnTypeClasses(state.viewer);
    // The jumps of the picture (src/app/line-jumps.js), so that the large view draws it alike.
    addLineJumps(box);
    const hint = doc.createElement('span');
    hint.className = HINT_CLASS;
    hint.setAttribute(TRANSIENT_ATTR, '');
    hint.textContent = LIVE_HINT;
    bar.insertBefore(hint, bar.querySelector(':scope > .' + DIAGRAM_CLASS + '-close'));
    state.hint = hint;
    state.viewer.get('canvas').resized();
    applyStep(figure);
  } catch (err){
    console.error('BPMN viewer failed, the large view shows the picture:', err);
    state.importing = false;
    if (running.get(figure) === state) stopViewer(figure);
    else destroy(state);
  }
}

// Touch on the viewer's container (story 2.23): each move of the fingers
// moves the canvas and zooms it (touchStep()), between the scales of
// TOUCH_SCALE. The fingers are all touches that began in the container, read
// from e.touches and paired by identifier, not by their place in the list:
// e.targetTouches holds only those on the element the event's touch began
// on, and two fingers on two shapes are two lists of one. The move is
// prevented, so the browser neither scrolls nor zooms the page; the document
// styles say the same by touch-action. A tap stays a tap: touchstart is
// passive, and the logo, a step and "Schließen" get their click. The scale
// of a gesture is kept here, not read back from the canvas, which rounds it
// to three places at every move. The listeners go with the container.
function attachTouch(box, canvas){
  let last = [], scale = 1;
  const fingers = e => {
    const rect = canvas.getContainer().getBoundingClientRect();
    return Array.from(e.touches).filter(t => box.contains(t.target))
      .map(t => ({ id: t.identifier, x: t.clientX - rect.left, y: t.clientY - rect.top }));
  };
  const restart = e => { last = countedFingers(last, fingers(e)); scale = canvas.zoom(); };
  box.addEventListener('touchstart', restart, { passive: true });
  box.addEventListener('touchend', restart, { passive: true });
  box.addEventListener('touchcancel', restart, { passive: true });
  box.addEventListener('touchmove', e => {
    if (e.cancelable) e.preventDefault();
    const now = fingers(e);
    const step = touchStep(last, now);
    last = countedFingers(last, now);
    if (!step) return;
    if (step.dx || step.dy) canvas.scroll({ dx: step.dx, dy: step.dy });
    if (step.factor !== 1){
      scale = Math.min(TOUCH_SCALE.max, Math.max(TOUCH_SCALE.min, scale * step.factor));
      canvas.zoom(scale, step.center);
    }
  }, { passive: false });
}

// The viewer of the figure destroyed, its container and hint out, and what
// the library left in <body>. One that is still importing is destroyed when
// its import ends (startViewer()).
function stopViewer(figure){
  const state = running.get(figure);
  if (!state) return;
  running.delete(figure);
  state.closed = true;
  if (!state.importing) destroy(state);
  if (state.box) state.box.remove();
  if (state.hint) state.hint.remove();
  removeViewerLeftovers(figure.ownerDocument);
}

function destroy(state){
  try { if (state.viewer) state.viewer.destroy(); }
  catch (err){ console.error('BPMN viewer could not be destroyed:', err); }
  state.viewer = null;
}
