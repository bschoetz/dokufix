// Der BPMN-Layouter Audi (dist/bpmn-layouter-audi.html, Ben, 2026-10-08): die abgespeckte Fassung des Assistenten.
// Hochgeladene .bpmn-Dateien mit ihren eigenen Koordinaten, unverändert angeordnet, in den Farben der Vorlage
// „Audi-Stil“ (PRESETS.audi in src/bpmn-tools/theme.js; tools/bpmn-assistant/audi.mjs schreibt ihren Stilblock beim
// Bauen); wählbar nur das X an zusammenführenden Gateways (dieselbe Regel wie fürs Original im Assistenten) und die
// Sprungbögen. Je Datei das Bild, die Großansicht und der Download als .svg und .png. Kein Anordnen, kein Modellierer,
// kein .bpmn-Download, keine Beispiele, keine Handreichung, keine Farbwahl.
//
// Der Einstieg des Skripts der Seite, gebündelt über tools/seiten.mjs. Bis Story 2.38 trug das Bauskript Kopien aus
// dem des Assistenten; seither zeichnet die Seite mit denselben Modulen (src/bpmn-tools/).
import { hasCoordinates } from '../app/bpmn.js';
import { pictureOf } from '../app/diagram-downloads.js';
import { decorate, mergeMarkerOff, sequenceGraph } from '../bpmn-tools/decorate.js';
import { draw as drawPicture, fileBase as baseOf, namesOf, svgLink, pngButton } from '../bpmn-tools/downloads.js';
import { openLarge, closeLarge, registerLargeView } from '../bpmn-tools/large-view.js';

const $ = id => document.getElementById(id);
// Die geladenen Dateien, { name, xml }; eine Änderung eines Häkchens zeichnet sie neu.
let files = [], run = 0;

// Nach dem Import, im Viewer und damit auch im Bild: decorate(), die Sprungbögen nach dem Häkchen.
const decorateHere = viewer => decorate(viewer, { jumps: $('jumps').checked });

// Der Name eines Bilds: der Name des Modells (definitions name), sonst der Dateiname, und die Zeit des Klicks, wie
// im Assistenten.
const fileBase = (xml, fileName) => baseOf(namesOf(xml).own || fileName.replace(/\.[^.]*$/, ''));

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function section(title){
  const s = document.createElement('section');
  s.innerHTML = '<h2>' + esc(title) + ' <small></small></h2>';
  $('out').appendChild(s);
  return s;
}
function error(s, msg){ const d = document.createElement('div'); d.className = 'err'; d.textContent = msg; s.appendChild(d); }

// Das Bild mit .svg und .png; die Großansicht ohne „Bearbeiten“.
async function draw(s, xml, fileName){
  const pic = await drawPicture(s, xml, { decorate: decorateHere, open: () => openLarge(fileName, xml, { decorate: decorateHere }) });
  const svg = () => pictureOf(pic.querySelector('svg'));
  s.querySelector('h2').append(svgLink(() => fileBase(xml, fileName), svg), pngButton(() => fileBase(xml, fileName), svg));
}

async function render(){
  const my = ++run;
  closeLarge();
  $('out').replaceChildren();
  for (const f of files){
    const s = section(f.name);
    if (!hasCoordinates(f.xml)){ error(s, 'Die Datei hat keine Koordinaten. Dieses Werkzeug ordnet nicht an; es zeichnet nur, was gezeichnet wurde.'); continue; }
    let xml = f.xml;
    if (!$('merge-x').checked){
      let r = null;
      try { r = mergeMarkerOff(xml, sequenceGraph(xml)); } catch {}
      if (r){ xml = r.xml; if (r.count) s.querySelector('small').textContent = r.count + (r.count === 1 ? ' zusammenführendes Gateway' : ' zusammenführende Gateways') + ' ohne X'; }
      else s.querySelector('small').textContent = 'X wie in der Datei gesetzt';
    }
    try { await draw(s, xml, f.name); } catch (e){ error(s, (e && e.message) || String(e)); }
    if (my !== run) return;
  }
}

async function load(list){
  const read = [...list];
  if (!read.length) return;
  files = await Promise.all(read.map(async f => ({ name: f.name, xml: await f.text() })));
  render();
}
$('up').onclick = () => $('file').click();
$('file').onchange = async () => { await load($('file').files); $('file').value = ''; };
// Ziehen und Ablegen auf die ganze Seite.
let depth = 0;
document.addEventListener('dragenter', e => { if (e.dataTransfer?.types.includes('Files')){ e.preventDefault(); depth++; document.body.classList.add('drag'); } });
document.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
document.addEventListener('dragleave', () => { if (--depth <= 0){ depth = 0; document.body.classList.remove('drag'); } });
document.addEventListener('drop', e => { e.preventDefault(); depth = 0; document.body.classList.remove('drag'); if (e.dataTransfer?.files.length) load(e.dataTransfer.files); });

// Die Häkchen, gemerkt; eine Änderung zeichnet neu.
for (const [id, key] of [['merge-x', 'bpmn-layouter-audi-merge-x'], ['jumps', 'bpmn-layouter-audi-sprungboegen']]){
  try { if (localStorage.getItem(key) === 'aus') $(id).checked = false; } catch {}
  $(id).onchange = () => {
    try { localStorage.setItem(key, $(id).checked ? 'an' : 'aus'); } catch {}
    render();
  };
}

// Die Großansicht wie im Assistenten, ohne Bearbeiten: + und - wechseln die Stufe, Escape schließt.
registerLargeView(document);
