import { BPMN_VIEWER_CONFIG } from '../app/bpmn.js';
import { diagramFileName } from '../app/diagram-downloads.js';
import { ICON } from './icons.js';

// --- The picture of a diagram and its downloads in the BPMN tools ----------
// draw() renders the picture of a diagram off screen with the page's bpmn-js;
// the links and buttons below give it as .bpmn, .svg and .png, each named by
// fileBase(): the model's name and the time of the click. The SVG is made as
// dokufix makes it (pictureOf() of src/app/diagram-downloads.js, by the
// caller), withBackground() puts the page's background behind it. Shared by
// the BPMN Assistant and the Layouter Audi; until story 2.38 the Audi carried
// a copy.
//
// fileBase(), namesOf() and withBackground() are pure, apart from the page's
// DOMParser and XMLSerializer; the rest makes elements of the page and runs
// at a click. Nothing done on loading.

// A downloaded file's name (Ben, 2026-10-07): the name and the time of the
// click, "Urlaubsantrag_2026-10-07_19-15-02", cleaned as dokufix cleans a
// diagram's (diagramFileName()). Without a name "Diagramm".
export function fileBase(name, d = new Date()){
  const two = n => String(n).padStart(2, '0');
  return diagramFileName(name || 'Diagramm') + '_' + d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + '_' + two(d.getHours()) + '-' + two(d.getMinutes()) + '-' + two(d.getSeconds());
}
// The model's name: the attribute name of definitions, the root every BPMN
// file has, with pools or without; and in its place the name of the
// collaboration, then of the first process, then the names of the pools, at
// most three, joined with "-"; ids not, which are mostly "Collaboration_1".
// Gives { own, fallback }.
export function namesOf(xml){
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const named = tag => [...doc.getElementsByTagNameNS('*', tag)].map(el => (el.getAttribute('name') || '').trim()).filter(Boolean);
  return { own: named('definitions')[0] || '', fallback: named('collaboration')[0] || named('process')[0] || named('participant').slice(0, 3).join('-') };
}

// The SVG to download with the page's background as the first rectangle over
// the whole viewBox; bg "transparent" (or none) leaves it without.
export function withBackground(text, bg){
  if (!bg || bg === 'transparent') return text;
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), svg = doc.documentElement;
  const [x, y, w, h] = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (!(w > 0 && h > 0)) return text;
  const r = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  for (const [a, v] of [['x', x], ['y', y], ['width', w], ['height', h], ['fill', bg]]) r.setAttribute(a, v);
  svg.insertBefore(r, svg.firstChild);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg) + '\n';
}

// The picture as .png (Ben, 2026-10-08): the SVG of the download, drawn on a
// canvas at twice its size, so that it stays sharp enlarged; a transparent
// background stays transparent. Loaded as a data: URL, so that the canvas
// stays readable under file:// as well.
export const PNG_SCALE = 2;
export function pngOf(text){
  return new Promise((resolve, reject) => {
    const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
    const vb = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const w = parseFloat(svg.getAttribute('width')) || vb[2], h = parseFloat(svg.getAttribute('height')) || vb[3];
    if (!(w > 0 && h > 0)) { reject(new Error('Das Bild hat keine Größe.')); return; }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(w * PNG_SCALE); c.height = Math.round(h * PNG_SCALE);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? resolve(b) : reject(new Error('Das PNG ließ sich nicht erzeugen.')), 'image/png');
    };
    img.onerror = () => reject(new Error('Das SVG ließ sich nicht als Bild laden.'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
  });
}
// A button that makes the PNG at the click and then downloads it. name and
// svgText: functions, asked at the click.
export function pngButton(name, svgText){
  const p = document.createElement('a');
  p.className = 'btn small'; p.innerHTML = ICON.download + ' .png'; p.title = 'Diagramm als .png herunterladen'; p.href = '#';
  p.onclick = async e => {
    e.preventDefault();
    try {
      const a = document.createElement('a');
      a.download = name() + '.png';
      a.href = URL.createObjectURL(await pngOf(svgText()));
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    } catch (err){ alert(err.message); }
  };
  return p;
}
// The link of the .svg: named and made at the click. initial: the name it
// carries before (the assistant's "A2.svg"), or none.
export function svgLink(name, svgText, initial){
  const v = document.createElement('a');
  v.className = 'btn small';
  if (initial) v.download = initial + '.svg';
  v.innerHTML = ICON.download + ' .svg'; v.title = 'Diagramm als .svg herunterladen'; v.href = '#';
  v.onclick = () => { v.download = name() + '.svg'; v.href = URL.createObjectURL(new Blob([svgText()], { type: 'image/svg+xml' })); };
  return v;
}
// The link of the .bpmn: the XML as it is, named at the click.
export function bpmnLink(name, xml, initial){
  const a = document.createElement('a');
  a.className = 'btn small'; a.download = initial + '.bpmn'; a.innerHTML = ICON.download + ' .bpmn'; a.title = 'Diagramm als .bpmn herunterladen';
  a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
  a.onclick = () => { a.download = name() + '.bpmn'; };
  return a;
}

// First a picture (SVG, as wide as the page, never larger than drawn) in the
// section s; a click on it calls open, the large view. decorate: what is done
// to the viewer after the import. Gives the element .pic that holds the SVG.
export async function draw(s, xml, { decorate, open }){
  const holder = document.createElement('div');
  holder.className = 'dokufix-doc'; holder.style.maxWidth = 'none'; holder.style.margin = '0'; holder.style.padding = '0';
  holder.innerHTML = '<figure class="dokufix-diagram dokufix-diagram-bpmn" style="margin:0"><div class="pic" title="Klicken: Großansicht"></div></figure>';
  s.appendChild(holder);
  const pic = holder.querySelector('.pic');
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:4000px;height:3000px;overflow:hidden';
  document.body.appendChild(host);
  const off = new BpmnJS({ container: host, ...BPMN_VIEWER_CONFIG });
  try {
    await off.importXML(xml);
    decorate(off);
    pic.innerHTML = (await off.saveSVG()).svg;
  } finally { off.destroy(); host.remove(); }
  pic.onclick = open;
  return pic;
}
