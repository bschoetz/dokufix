import { ICON } from './icons.js';

// --- The modeler of the BPMN tools -----------------------------------------
// bpmn-js Modeler 18.31.0, the same version as the viewer, in the page in the
// blocks #bpmn-modeler-js and #bpmn-modeler-css (tools/seiten.mjs puts them
// there): run only when it is first opened. Its script sets window.BpmnJS as
// the viewer's does; the viewer is put back afterwards, the modeler stays
// under a name of its own. Over the whole window, in the standard colours of
// bpmn-js. The BPMN Assistant opens it; moved here with story 2.38 for the
// workbench.
//
// One modeler at a time, kept here. Nothing done on loading.

let Modeler = null, modeler = null;
export const modelerOpen = () => !!modeler;

export function loadModeler(){
  if (Modeler) return Promise.resolve(Modeler);
  const Viewer = window.BpmnJS;
  const css = document.createElement('style'); css.textContent = document.getElementById('bpmn-modeler-css').textContent; document.head.appendChild(css);
  const sc = document.createElement('script'); sc.textContent = document.getElementById('bpmn-modeler-js').textContent;
  // An inserted script runs at once; it reports an error to the page, not here: then BpmnJS is still the viewer.
  try { document.head.appendChild(sc); }
  finally { if (window.BpmnJS !== Viewer) Modeler = window.BpmnJS; window.BpmnJS = Viewer; }
  return Modeler ? Promise.resolve(Modeler) : Promise.reject(new Error('Der Modellierer konnte nicht geladen werden.'));
}
// title: the heading; take: what "Als Original übernehmen" does with the
// modelled XML, after the modeler closed; takeLabel: that button's words
// where they are others (the workbench: "Als meine Fassung übernehmen");
// fileBase: the name of the .bpmn download, from the XML.
export async function openModeler(title, xml, { take, fileBase, takeLabel = 'Als Original übernehmen' }){
  closeModeler(true);
  const box = document.createElement('div');
  box.id = 'modeler';
  box.innerHTML = '<div class="mbar"><strong></strong><span class="hint">Elemente aus der Leiste links ziehen, verbinden, doppelklicken zum Beschriften; Strg+Z macht rückgängig.</span>'
    + '<button class="primary take">' + ICON.play + ' </button><button class="dl">' + ICON.download + ' als .bpmn herunterladen</button><button class="close">Schließen</button></div><div class="mcanvas"></div>';
  box.querySelector('strong').textContent = 'Modellierer: ' + title;
  box.querySelector('.take').append(takeLabel);
  document.body.appendChild(box);
  document.documentElement.style.overflow = 'hidden';
  modeler = { box, m: null, dirty: false };
  box.querySelector('.close').onclick = () => closeModeler(false);
  try {
    const M = await loadModeler();
    if (!modeler || modeler.box !== box) return;
    const m = new M({ container: box.querySelector('.mcanvas'), keyboard: { bindTo: document } });
    modeler.m = m;
    await m.importXML(xml);
    m.get('canvas').zoom('fit-viewport', 'auto');
    m.on('commandStack.changed', () => { if (modeler) modeler.dirty = true; });
  } catch (e){
    const d = document.createElement('div'); d.className = 'err'; d.style.margin = '16px'; d.textContent = (e && e.message) || String(e);
    box.querySelector('.mcanvas').replaceChildren(d);
    return;
  }
  const current = async () => (await modeler.m.saveXML({ format: true })).xml;
  box.querySelector('.take').onclick = async () => {
    const x = await current();
    closeModeler(true);
    take(x);
  };
  box.querySelector('.dl').onclick = async () => {
    const a = document.createElement('a');
    const x = await current();
    a.download = fileBase(x) + '.bpmn';
    a.href = URL.createObjectURL(new Blob([x], { type: 'application/xml' }));
    a.click();
  };
}
// force: without asking (taken over or opened anew).
export function closeModeler(force){
  if (!modeler) return;
  if (!force && modeler.dirty && !window.confirm('Ihre Änderungen im Modellierer gehen verloren. Trotzdem schließen?')) return;
  try { modeler.m && modeler.m.destroy(); } catch {}
  modeler.box.remove(); modeler = null;
  document.documentElement.style.overflow = '';
}
