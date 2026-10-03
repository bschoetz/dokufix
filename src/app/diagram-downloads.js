import { TRANSIENT_ATTR } from './transient.js';

// --- The downloads below a diagram (story 2.10) ------------------------------
// Below every drawn diagram stands a line with what a reader can take along:
// its source and, where a script runs, its picture. Each is a small button
// with a download symbol and the extension of its file:
//
//   <div class="dokufix-diagram-downloads" role="group" aria-label="Herunterladen">
//     <a download="Rückgabe.bpmn" href="data:application/xml;charset=utf-8,…" title="BPMN-XML herunterladen: Rückgabe.bpmn">.bpmn</a>
//     <button type="button" data-dokufix-transient title="Bild herunterladen: Rückgabe.svg">.svg</button>
//   </div>
//
// The source link is document content: the pass `Diagramme` writes it into
// the figure, between the view and the credit (src/app/diagrams.js), so it
// reaches all four variants and works without a script. Its file stands in
// the link as a data: URL, the text percent-encoded only where it has to be
// (sourceDataUrl()). The picture button is transient: a run-time pass adds it
// where a script runs, the page and the reader bundle of `schlank` and
// `kompakt` (src/reader.js), and no download takes it along. At a click it
// makes the file from the SVG in the figure as it stands then: in `schlank`
// the decoder fills the SVG container after the reader bundle ran. The SVG
// stays once in every file; the picture is never stored beside it.
//
// Names: the title of the diagram, sanitised as the name of a download is
// (safeFilenameBase() in src/app/downloads/download.js), the same title a
// second time with -2, -3 …, compared without regard to case. Picture and
// source of one diagram share their name.
//
// Pure logic, apart from what runs at a click (pictureOf() and saving the
// file), which needs a page: the computed styles of the live SVG, the
// serialiser, a Blob. attachSvgDownloads() works on the root it is handed.
// tests/diagram-downloads.test.mjs runs the rest in Node.

export const DOWNLOADS_CLASS = 'dokufix-diagram-downloads';
export const DOWNLOADS_LABEL = 'Herunterladen';
export const PICTURE_EXT = '.svg';
export const PICTURE_MIME = 'image/svg+xml';
// The name of a diagram whose title gives none.
export const FILE_NAME_DEFAULT = 'Diagramm';

// One title as the base of a file name: the characters a file name cannot
// take and blanks become "-", at most 80 characters, as safeFilenameBase()
// does for a document; and "%", which Firefox saves as "_" and Chromium keeps.
export function diagramFileName(title){
  const base = String(title).replace(/[<>:"/\\|?*%\x00-\x1f]/g, '-').replace(/\s+/g, '-').slice(0, 80);
  return base || FILE_NAME_DEFAULT;
}

// The base names of the diagrams of a document, by their titles in the order
// of the document: each title sanitised, a name taken before, in any case,
// with -2, -3 … until it is free.
export function diagramFileNames(titles){
  const used = new Set();
  return titles.map(title => {
    const base = diagramFileName(title);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = base + '-' + n;
    used.add(name.toLowerCase());
    return name;
  });
}

// A data: URL with the text as its body, UTF-8. Percent-encoded is only what
// has to be: "%", which starts an escape; "#", which would end the URL; the
// characters an attribute or the HTML around it would escape (< > " & ');
// tab, line feeds and the other control characters, which a URL parser drops
// or a browser would not keep; every character beyond ASCII; and blanks at
// the very end, which a URL parser strips. Serialising the attribute then
// escapes nothing, and the body is about a quarter larger than the text
// (base64: a third; encodeURIComponent(): more than half).
export function sourceDataUrl(text, mime){
  const body = String(text).replace(/[\x00-\x1f\x7f%#<>"&']|[^\x00-\x7f]+| +$/g, m => m === "'" ? '%27' : encodeURIComponent(m));
  return 'data:' + mime + ',' + body;
}

// Every var(--name) in text, and var(--name, fallback), replaced by what
// lookup(name) gives, or by its fallback where that is empty; one with
// neither stays. A var() in a fallback is resolved first.
export function resolveCustomProperties(text, lookup){
  const VAR = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*?))?\s*\)/g;
  let out = String(text), before;
  do {
    before = out;
    out = out.replace(VAR, (all, name, fallback) => {
      const value = String(lookup(name) || '').trim();
      return value || (fallback !== undefined ? fallback : all);
    });
  } while (out !== before);
  return out;
}

// The line of a drawn diagram, with its source link: name, the base name of
// its files; source: { ext, mime, what, text }, what its kind downloads.
export function downloadsLine(doc, name, source){
  const line = doc.createElement('div');
  line.className = DOWNLOADS_CLASS;
  line.setAttribute('role', 'group');
  line.setAttribute('aria-label', DOWNLOADS_LABEL);
  const file = name + source.ext;
  const link = doc.createElement('a');
  link.setAttribute('download', file);
  link.setAttribute('href', sourceDataUrl(source.text, source.mime));
  link.setAttribute('title', source.what + ' herunterladen: ' + file);
  link.textContent = source.ext;
  line.appendChild(link);
  return line;
}

// The picture of the SVG as a file of its own: a copy in which every
// var(--…) is what the live element computes, so a BPMN diagram keeps its
// colours without the document styles; its size that of its viewBox, without
// the max-width it has in the column. Needs a page: the computed styles and
// the serialiser of the SVG's window.
export function pictureOf(svg){
  const win = svg.ownerDocument.defaultView;
  const copy = svg.cloneNode(true);
  const live = [svg, ...svg.querySelectorAll('*')], copies = [copy, ...copy.querySelectorAll('*')];
  live.forEach((el, i) => {
    const target = copies[i];
    let style = null;
    const lookup = name => (style = style || win.getComputedStyle(el)).getPropertyValue(name);
    for (const attr of Array.from(target.attributes)){
      if (attr.value.includes('var(')) target.setAttribute(attr.name, resolveCustomProperties(attr.value, lookup));
    }
    if (target.localName === 'style' && target.textContent.includes('var(')) target.textContent = resolveCustomProperties(target.textContent, lookup);
  });
  const box = String(copy.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (box.length === 4 && box[2] > 0 && box[3] > 0){
    copy.setAttribute('width', String(box[2]));
    copy.setAttribute('height', String(box[3]));
  }
  copy.style.removeProperty('max-width');
  if (!String(copy.getAttribute('style') || '').trim()) copy.removeAttribute('style');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new win.XMLSerializer().serializeToString(copy) + '\n';
}

// Hands the text to the browser as a file of that name.
function saveFile(doc, name, text, mime){
  const win = doc.defaultView;
  const url = win.URL.createObjectURL(new win.Blob([text], { type: mime }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  a.setAttribute(TRANSIENT_ATTR, '');
  doc.body.appendChild(a);
  a.click();
  a.remove();
  win.setTimeout(() => win.URL.revokeObjectURL(url), 1500);
}

// Run-time pass "Diagramm-Bilder", and the reader bundle of `schlank` and
// `kompakt`: every line of a drawn diagram gets its picture button, once,
// behind the source link. A click makes the picture of the SVG that stands
// in the figure then; where there is none, as in `schlank` when a diagram
// could not be unpacked, nothing is saved and the console says so. Only the
// SVG in the figure's SVG container counts, never one of a live viewer.
export function attachSvgDownloads(root){
  for (const line of Array.from(root.querySelectorAll('.' + DOWNLOADS_CLASS))){
    const source = line.querySelector('a[download]');
    if (!source || line.querySelector('button[' + TRANSIENT_ATTR + ']')) continue;
    const figure = line.parentElement;
    const name = source.getAttribute('download').replace(/\.[^.]*$/, '') + PICTURE_EXT;
    const doc = line.ownerDocument;
    const button = doc.createElement('button');
    button.setAttribute('type', 'button');
    button.setAttribute(TRANSIENT_ATTR, '');
    button.setAttribute('title', 'Bild herunterladen: ' + name);
    button.textContent = PICTURE_EXT;
    button.addEventListener('click', () => {
      // The picture in the SVG container: the live viewer of the large view
      // (src/app/live-viewer.js) stands beside it with SVGs of its own.
      const svg = figure && figure.querySelector('.dokufix-diagram-svg svg');
      if (!svg){ console.error('SVG download: no SVG in the figure', name); return; }
      saveFile(doc, name, pictureOf(svg), PICTURE_MIME);
    });
    line.appendChild(button);
  }
}
