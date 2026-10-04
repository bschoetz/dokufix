import { DIAGRAM_TOGGLE_CLASS, DIAGRAM_ZOOM_CLASS, DIAGRAM_CLASS } from './diagrams.js';
import { documentOf } from './escape.js';

// --- The large view of a diagram: its keys -----------------------------------
// The view itself is document content and works without a script
// (src/app/diagrams.js, src/doc.css): its checkbox opens and closes it, its
// radio buttons choose the zoom step. Where a script runs, the page in the
// editor and in a `Mit Editor` file, and the reader bundle of `schlank` and
// `kompakt` (src/reader.js), this module adds three keys while a view is open:
//
//   Escape   closes the view, and does nothing else
//   +  -     the next or the previous zoom step, held at the first and the last
//
// Escape is a step of the one Escape listener (largeViewStep, src/app/escape.js),
// the first of its list, so an open view is the first thing Escape closes (see
// the README, "Keys and events"). "+" and "-" have their own listener on
// window, in the capture phase, before every listener on the document.
// It sets the checked property of the controls, never their attribute: a file
// written while a view is open opens closed, at "Einpassen". Each key then
// dispatches a bubbling `change` on the control it set, as a click, Space or
// an arrow does through the browser: whoever follows the view (the live viewer
// of a BPMN diagram, src/app/live-viewer.js) listens in one place and misses
// no way of closing it or choosing a step.
//
// Pure logic apart from the listener: largeViewOpen() and the steps read the
// document they are handed, largeViewStep the document of its event.

const OPEN_SEL = '.' + DIAGRAM_TOGGLE_CLASS;

// The checkbox of the view that is open, the last one in the document where
// more than one is (the one painted on top), or null.
function openToggle(doc){
  const open = Array.from(doc.querySelectorAll(OPEN_SEL)).filter(t => t.checked);
  return open.length ? open[open.length - 1] : null;
}

// Whether a large view is open in doc.
export const largeViewOpen = doc => !!openToggle(doc);

// Closes the view of toggle. Focus that was on a control of the view, which
// is not shown once it is closed, goes to the checkbox, so the next Tab goes on
// from the diagram.
export function closeLargeView(toggle){
  const doc = toggle.ownerDocument;
  const figure = toggle.closest('.' + DIAGRAM_CLASS);
  const active = doc.activeElement;
  toggle.checked = false;
  if (active && active !== toggle && figure && figure.contains(active)) toggle.focus();
  changed(toggle);
}

// The event the browser fires when a click or a key changes a control.
function changed(control){
  control.dispatchEvent(new control.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

// Moves the zoom of the view of toggle by delta steps, held at the ends.
// Focus on a step of the view moves with it, so an arrow key goes on from
// the step chosen, and the focus ring stands on its label.
export function stepLargeView(toggle, delta){
  const figure = toggle.closest('.' + DIAGRAM_CLASS);
  if (!figure) return;
  const radios = Array.from(figure.querySelectorAll('.' + DIAGRAM_ZOOM_CLASS));
  if (!radios.length) return;
  const at = Math.max(0, radios.findIndex(r => r.checked));
  const next = radios[Math.min(radios.length - 1, Math.max(0, at + delta))];
  next.checked = true;
  if (radios.includes(toggle.ownerDocument.activeElement) && toggle.ownerDocument.activeElement !== next) next.focus();
  changed(next);
}

// The step of Escape (src/app/escape.js): an open view, the last one, closes.
export const largeViewStep = {
  applies: e => largeViewOpen(documentOf(e)),
  close: e => closeLargeView(openToggle(documentOf(e))),
};

const STEP_KEYS = { '+': 1, '-': -1 };

// "+" and "-" while a view is open.
export function registerLargeViewKeys(doc){
  const win = doc.defaultView;
  win.addEventListener('keydown', e => {
    if (e.isComposing || e.defaultPrevented) return;
    if (!(e.key in STEP_KEYS) || e.ctrlKey || e.altKey || e.metaKey) return;
    const toggle = openToggle(doc);
    if (!toggle) return;
    e.preventDefault();
    stepLargeView(toggle, STEP_KEYS[e.key]);
  }, true);
}
