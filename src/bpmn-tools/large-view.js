import { BPMN_VIEWER_CONFIG } from '../app/bpmn.js';
import { registerEscape } from '../app/escape.js';
import { ICON } from './icons.js';

// --- The large view of the BPMN tools --------------------------------------
// A click on a picture opens it over the whole window in a viewer, as the
// large view of dokufix: the title, the steps "Einpassen", 100, 150 and
// 200 %, "Schließen"; the mouse wheel zooms, dragging moves, + and - change
// the step, Escape closes. Shared by the BPMN Assistant (with "Bearbeiten",
// which opens the modeler) and the Layouter Audi (without); until story 2.38
// the Audi carried a copy.
//
// One view at a time, kept here. The keys come with registerLargeView(),
// which the page's entry calls once: Escape as a step of the one Escape
// listener of dokufix (src/app/escape.js), + and - on the document. Nothing
// done on loading.

let large = null;
export const largeOpen = () => !!large;

// title: the view's heading; decorate: what is done to the viewer after the
// import; edit: where the view has "Bearbeiten", what it does after the view
// closed.
export async function openLarge(title, xml, { decorate, edit } = {}){
  closeLarge();
  const box = document.createElement('div');
  box.id = 'large';
  box.innerHTML = '<div class="lbar"><strong></strong><span class="hint">Strg+Mausrad zoomt, Mausrad und Ziehen verschieben, + und - wechseln die Stufe, Escape schließt</span><span class="steps"><button data-z="fit">Einpassen</button><button data-z="1">100 %</button><button data-z="1.5">150 %</button><button data-z="2">200 %</button></span>'
    + (edit ? '<button class="edit">' + ICON.pencil + ' Bearbeiten</button>' : '') + '<button class="close">Schließen</button></div><div class="dokufix-doc lwrap"><div class="dokufix-diagram dokufix-diagram-bpmn lcanvas"></div></div>';
  box.querySelector('strong').textContent = title;
  document.body.appendChild(box);
  document.documentElement.style.overflow = 'hidden';
  const viewer = new BpmnJS({ container: box.querySelector('.lcanvas'), ...BPMN_VIEWER_CONFIG });
  large = { box, viewer };
  box.querySelector('.close').onclick = closeLarge;
  if (edit) box.querySelector('.edit').onclick = () => { closeLarge(); edit(); };
  for (const b of box.querySelectorAll('.steps button')) b.onclick = () => step(b.dataset.z);
  try {
    await viewer.importXML(xml);
    if (decorate) decorate(viewer);
    step('fit');
    // The step the view stands on is pressed; after the mouse wheel none.
    viewer.on('canvas.viewbox.changed', () => mark());
  } catch (e){ closeLarge(); alert(e.message); }
}
// The steps of the large view of dokufix: fit, 100, 150, 200 %.
export const STEPS = ['fit', '1', '1.5', '2'];
export function step(z){
  if (!large) return;
  const c = large.viewer.get('canvas');
  if (z === 'fit') c.zoom('fit-viewport', 'auto');
  else { const vb = c.viewbox(); c.zoom(Number(z), { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 }); }
  large.step = z; large.zoom = c.zoom();
  mark();
}
function mark(){
  if (!large) return;
  const now = large.viewer.get('canvas').zoom();
  if (Math.abs(now - large.zoom) > 1e-3) large.step = null;
  for (const b of large.box.querySelectorAll('.steps button')) b.setAttribute('aria-pressed', String(b.dataset.z === large.step));
}
export function closeLarge(){
  if (!large) return;
  try { large.viewer.destroy(); } catch {}
  large.box.remove(); large = null;
  document.documentElement.style.overflow = '';
}
// The step after + or - from the step z, or from a free zoom the step nearest to it.
export function nextStep(z, zoom, up){
  let i = STEPS.indexOf(z);
  if (i < 0) i = zoom < 1 ? 0 : zoom < 1.25 ? 1 : zoom < 1.75 ? 2 : 3;
  return STEPS[Math.max(0, Math.min(STEPS.length - 1, i + (up ? 1 : -1)))];
}

// The keys of the view, while it is open and blocked() is not true (the
// assistant's colour dialog or modeler over it): Escape closes it, + the next
// step, - the previous one, as in dokufix.
export function registerLargeView(doc, { blocked = () => false } = {}){
  registerEscape(doc, [{ applies: () => !!large && !blocked(), close: closeLarge }]);
  doc.addEventListener('keydown', e => {
    if (!large || blocked()) return;
    if (e.key === '+' || e.key === '-'){
      e.preventDefault();
      step(nextStep(large.step, large.viewer.get('canvas').zoom(), e.key === '+'));
    }
  });
}
