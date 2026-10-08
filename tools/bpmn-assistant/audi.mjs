// Baut dist/bpmn-layouter-audi.html, den BPMN-Layouter Audi (Ben, 2026-10-08): die abgespeckte Fassung des
// Assistenten (bauen.mjs daneben). Hochgeladene .bpmn-Dateien mit ihren eigenen Koordinaten, unverändert angeordnet,
// in den Farben der Vorlage „Audi-Stil“ des Assistenten; wählbar nur das X an zusammenführenden Gateways (dieselbe
// Regel wie fürs Original im Assistenten) und die Sprungbögen. Je Datei das Bild, die Großansicht und der Download
// als .svg und .png. Kein Anordnen, kein Modellierer, kein .bpmn-Download, keine Beispiele, keine Handreichung, keine
// Farbwahl. bpmn-js 18.31.0, der Viewer, eingebettet aus vendor/bpmn-js/ wie im Assistenten, damit die Seite ohne
// Netz läuft; die Typklassen, das Bild zum Herunterladen und die Sprungbögen aus src/app/, die Dokumentstile aus
// dist/dokufix.html.
//
//   npm run layouter-audi      (dist/dokufix.html gebaut: npm run build)
//
// Was die Seite zeichnet, ist aus bauen.mjs übernommen (decorate(), poolHeads(), withBackground(), applyTheme(),
// mergeMarkerOff() und die Farben des Audi-Stils); eine Änderung dort gehört auch hierher.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { NOTICES, LICENCE_TEXTS } from '../../src/app/licences.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '../..');

const bundle = (await esbuild.build({
  stdin: {
    contents: `
      import { BPMN_VIEWER_CONFIG, addBpmnTypeClasses, bpmnTypeClasses } from '${REPO}/src/app/bpmn.js';
      import { pictureOf, diagramFileName } from '${REPO}/src/app/diagram-downloads.js';
      import { addLineJumps } from '${REPO}/src/app/line-jumps.js';
      window.T = { BPMN_VIEWER_CONFIG, addBpmnTypeClasses, bpmnTypeClasses, pictureOf, diagramFileName, addLineJumps };
    `,
    resolveDir: HERE, loader: 'js',
  },
  bundle: true, format: 'iife', write: false, charset: 'utf8', logLevel: 'silent', minify: true,
})).outputFiles[0].text;

// bpmn-js 18.31.0, der Viewer mit seinem Stylesheet, davor der Text der bpmn.io License (wie in bauen.mjs).
const BPMN_JS = path.join(HERE, 'vendor', 'bpmn-js');
const bpmnJs = name => {
  const text = fs.readFileSync(path.join(BPMN_JS, name), 'utf8');
  if (/<\/?(script|style)/i.test(text)) throw new Error('vendor/bpmn-js/' + name + ' enthält ein Tag script oder style');
  return text;
};
const viewerJs = bpmnJs('bpmn-navigated-viewer.production.min.js');
const viewerCss = bpmnJs('diagram-js.css');
const bpmnJsEntry = NOTICES.find(n => n.package === 'bpmn-js');
const bpmnJsNotice = [bpmnJsEntry.name + ' ' + bpmnJsEntry.version, ...bpmnJsEntry.copyright, LICENCE_TEXTS[bpmnJsEntry.licence].title, ...LICENCE_TEXTS[bpmnJsEntry.licence].paragraphs]
  .join('\n\n').replace(/\*\//g, '* /');
// Im Bündel stecken wenige Konstanten des Textrenderers von bpmn-js (src/app/label-size.js); Kommentare fallen beim
// Bündeln weg, deshalb der Hinweis hier.
const bundleNotice = 'In diesem Skript stecken wenige Konstanten des Textrenderers von bpmn-js 18.31.0 (bpmn.io License, Copyright (c) 2014-present Camunda Services GmbH), über src/app/label-size.js von dokufix.';

const dist = fs.readFileSync(path.join(REPO, 'dist/dokufix.html'), 'utf8');
const docCss = /<style id="dokufix-doc-css">([\s\S]*?)<\/style>/.exec(dist)[1];

// Der Audi-Stil, wie ihn die Vorlage des Assistenten führt (PRESETS.audi in bauen.mjs).
const AUDI = {
  'task-fill': '#ffffff', 'task-stroke': '#333333', 'task-label': '#1a1a1a', 'task-icon': '#000000', 'sub-fill': '#ffffff', 'sub-stroke': '#333333',
  'sub-label': '#1a1a1a', 'start-fill': '#ffffff', 'start-stroke': '#f50537', 'start-label': '#1a1a1a', 'start-icon': '#4c4c4c', 'inter-fill': '#ffffff',
  'inter-stroke': '#000000', 'inter-label': '#1a1a1a', 'inter-icon': '#f50537', 'end-fill': '#ffffff', 'end-stroke': '#f50537', 'end-label': '#1a1a1a',
  'end-icon': '#4c4c4c', 'gwx-fill': '#ffffff', 'gwx-stroke': '#f50537', 'gwx-label': '#1a1a1a', 'gwx-icon': '#4c4c4c', 'gwp-fill': '#ffffff',
  'gwp-stroke': '#f50537', 'gwp-label': '#1a1a1a', 'gwp-icon': '#4c4c4c', 'gwo-fill': '#ffffff', 'gwo-stroke': '#f50537', 'gwo-label': '#1a1a1a',
  'gwo-icon': '#4c4c4c', 'gwe-fill': '#ffffff', 'gwe-stroke': '#f50537', 'gwe-label': '#1a1a1a', 'gwe-icon': '#4c4c4c', 'flow-stroke': '#4c4c4c',
  'flow-label': '#4c4c4c', 'msg-stroke': '#808080', 'msg-label': '#1a1a1a', 'pool-fill': '#f2f2f2', 'pool-stroke': '#000000', 'head-fill': '#000000',
  'head-label': '#ffffff', 'lane-fill': '#f2f2f2', 'lane-stroke': '#b3b3b3', 'lane-label': '#1a1a1a',
};
// Die Klassen, die addBpmnTypeClasses() je Typ vergibt (src/app/bpmn.js), wie SEL in bauen.mjs.
const SEL = {
  task: '.dokufix-bpmn-task',
  sub: ':is(.dokufix-bpmn-subprocess,.dokufix-bpmn-callactivity)',
  start: '.dokufix-bpmn-startevent',
  inter: ':is(.dokufix-bpmn-intermediatecatchevent,.dokufix-bpmn-intermediatethrowevent,.dokufix-bpmn-boundaryevent)',
  end: '.dokufix-bpmn-endevent',
  gwx: '.dokufix-bpmn-exclusivegateway',
  gwp: '.dokufix-bpmn-parallelgateway',
  gwo: '.dokufix-bpmn-inclusivegateway',
  gwe: ':is(.dokufix-bpmn-eventbasedgateway,.dokufix-bpmn-complexgateway)',
  flow: '.dokufix-bpmn-sequenceflow',
  msg: '.dokufix-bpmn-messageflow',
  lane: '.dokufix-bpmn-lane',
};
// Die Farben als Stilblock, wie applyTheme() in bauen.mjs ihn schreibt, hier einmal beim Bauen.
const themeCss = (() => {
  const t = AUDI, d = '.dokufix-doc .dokufix-diagram-bpmn';
  const vars = (f, s, l) => (f ? '--dokufix-bpmn-fill:' + f + ';' : '') + (s ? '--dokufix-bpmn-stroke:' + s + ';' : '') + (l ? '--dokufix-bpmn-label:' + l + ';' : '');
  let css = d + '{' + vars(t['task-fill'], t['flow-stroke'], t['task-label']) + '}';
  for (const [k, sel] of Object.entries(SEL)) css += d + ' ' + sel + '{' + vars(t[k + '-fill'], t[k + '-stroke'], t[k + '-label']) + '}';
  css += d + ' .dokufix-bpmn-task .dokufix-bpmn-icon{--dokufix-bpmn-stroke:' + t['task-icon'] + '}';
  for (const [k, sel] of Object.entries(SEL)) if (t[k + '-icon'] && k !== 'task') css += d + ' ' + sel + ' .dokufix-bpmn-icon{--dokufix-bpmn-stroke:' + t[k + '-icon'] + '}';
  css += d + ' .dokufix-bpmn-pool{' + vars(t['pool-fill'], t['pool-stroke'], t['head-label']) + '--dokufix-bpmn-head:' + t['head-fill'] + '}';
  css += d + ' .dokufix-bpmn-pool.dokufix-bpmn-box{' + vars(null, null, t['lane-label']) + '}';
  return css;
})();

const svgIcon = d => '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const ICON = {
  upload: svgIcon('<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>'),
  download: svgIcon('<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>'),
};
// Das Favicon: ein exklusives Gateway in den Farben des Audi-Stils.
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 1.8 30.2 16 16 30.2 1.8 16z" fill="#fff" stroke="#f50537" stroke-width="2.6" stroke-linejoin="round"/><path d="M11 11l10 10M21 11 11 21" stroke="#4c4c4c" stroke-width="2.8" stroke-linecap="round"/></svg>');

const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BPMN-Layouter Audi</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON}">
<style>/*
${bpmnJsNotice}
*/
${viewerCss}</style>
<script>/*
${bpmnJsNotice}
*/
${viewerJs}</script>
<style>${docCss}</style>
<style>${themeCss}</style>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--mute:#666;--line:#e5e5e5;--acc:#000;--err:#a50e0e;--errbg:#fce8e6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:32px 40px 24px;border-bottom:1px solid var(--line)}
main{padding:8px 40px 48px}
@media (max-width:700px){header{padding:20px 16px}main{padding:8px 16px 32px}}
h1{font-size:24px;font-weight:650;letter-spacing:-.01em;margin:0}
.intro{max-width:680px;margin:12px 0 20px}
.bar{display:flex;gap:8px 16px;align-items:center;flex-wrap:wrap}
.bar label{display:inline-flex;gap:6px;align-items:center;font-size:14px;cursor:pointer}
.hint{color:var(--mute);font-size:13px}
button,a.btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;font:inherit;font-size:14px;color:var(--fg);background:#fff;border:1px solid #ccc;border-radius:7px;cursor:pointer;text-decoration:none;white-space:nowrap}
button:hover,a.btn:hover{background:#f2f2f2}
button:focus-visible,a.btn:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
button.primary{background:var(--acc);border-color:var(--acc);color:#fff;font-weight:600}
button.primary:hover{background:#333}
button.small,a.btn.small{height:28px;padding:0 10px;font-size:13px}
.ic{flex:none}
body.drag main{outline:2px dashed var(--mute);outline-offset:-8px}
section{border-top:1px solid var(--line);padding:20px 0 8px}
section:first-of-type{border-top:0}
h2{font-size:17px;font-weight:650;margin:0 0 8px;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
h2 small{font-weight:400;color:var(--mute);font-size:13px}
.pic{cursor:zoom-in;border:1px solid var(--line);border-radius:8px;padding:8px;background:#fff}
.pic svg{display:block;max-width:100%;height:auto}
.err{background:var(--errbg);color:var(--err);padding:10px 12px;border-radius:8px;white-space:pre-wrap;font:13px/1.4 ui-monospace,monospace}
#large{position:fixed;inset:0;z-index:10;background:#fff;display:flex;flex-direction:column}
#large .lbar{display:flex;gap:12px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
#large .lbar strong{font-size:17px}#large .lbar .hint{flex:1}
#large .steps{display:flex}#large .steps button{border-radius:0;margin-left:-1px}#large .steps button:first-child{border-radius:7px 0 0 7px;margin-left:0}#large .steps button:last-child{border-radius:0 7px 7px 0}
#large .steps button[aria-pressed=true]{background:var(--acc);color:#fff;border-color:var(--acc)}
#large .lwrap{flex:1;max-width:none;margin:0;padding:0;min-height:0;display:flex}
#large .lcanvas{flex:1;min-height:0;background:#fff}
</style>
</head>
<body>
<header>
<h1>BPMN-Layouter Audi</h1>
<p class="intro">Laden Sie eine oder mehrere BPMN-Dateien hoch, oder ziehen Sie sie auf die Seite. Jedes Diagramm erscheint so angeordnet, wie es gezeichnet wurde, in den Farben des Audi-Stils. Auf Wunsch fallen die X an zusammenführenden Gateways weg, und wo sich Linien kreuzen, springt die waagrechte mit einem Bogen. Ein Klick auf ein Diagramm öffnet die Großansicht; jedes Bild lässt sich als SVG oder PNG herunterladen.</p>
<div class="bar">
<button id="up" class="primary">${ICON.upload} BPMN-Dateien hochladen …</button><input type="file" id="file" accept=".bpmn,.xml,application/xml,text/xml" multiple hidden>
<label title="Ohne Häkchen werden exklusive Gateways, die zusammenführen, als leere Raute gezeichnet, wenn die Datei das X an jedem exklusiven Gateway setzt, wie es Modellierer tun"><input type="checkbox" id="merge-x" checked> X an zusammenführenden Gateways</label>
<label title="Wo sich zwei Linien kreuzen, springt die waagrechte mit einem kleinen Bogen über die senkrechte"><input type="checkbox" id="jumps" checked> Sprungbögen</label>
</div>
</header>
<main id="out"></main>
<script>/*
${bundleNotice}
*/
${bundle}</script>
<script>
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// Koordinaten hat ein XML, sobald es eine Form trägt (wie hasCoordinates() der App).
const hasShapes = xml => /<(?:[\\w.-]+:)?BPMNShape\\b/.test(xml.replace(/<!--[\\s\\S]*?-->|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>/g, ''));
// Die geladenen Dateien, { name, xml }; eine Änderung eines Häkchens zeichnet sie neu.
let files = [], run = 0;

// Nach dem Import, im Viewer und damit auch im Bild: die Typklassen der App, dieselben Klassen an den Labels außerhalb
// der Form, das Zeichen in Aufgabe, Gateway und Ereignis, Bahnen deckend und der Poolkopf (decorate() in bauen.mjs).
function decorate(viewer){
  T.addBpmnTypeClasses(viewer);
  if ($('jumps').checked) T.addLineJumps(viewer.get('canvas').getContainer());
  const registry = viewer.get('elementRegistry');
  registry.forEach(el => {
    const gfx = registry.getGraphics(el);
    if (!gfx) return;
    if (el.type === 'label' && el.labelTarget){ const c = T.bpmnTypeClasses(el.labelTarget.type); if (c.length) gfx.classList.add(...c); }
    if (/Task$/.test(el.type) && el.type !== 'label'){
      const [frame, ...rest] = gfx.querySelector('.djs-visual').children;
      for (const c of rest) if (c.localName !== 'text'){ const b = c.getBBox(); if (b.y < 30 && b.x < 40) c.classList.add('dokufix-bpmn-icon'); }
    }
    if (/Gateway$/.test(el.type)){
      const [frame, ...rest] = gfx.querySelector('.djs-visual').children;
      for (const c of rest) if (c.localName !== 'text') c.classList.add('dokufix-bpmn-icon');
    }
    if (/Event$/.test(el.type)){
      const vis = gfx.querySelector('.djs-visual'), outer = el.width / 2;
      for (const c of vis.children){
        if (c.localName === 'text') continue;
        if (c.localName === 'circle' && +c.getAttribute('r') > outer * 0.75) continue;
        c.classList.add('dokufix-bpmn-icon');
      }
    }
    if (el.type === 'bpmn:Lane'){ const r = gfx.querySelector('.djs-visual rect'); if (r) r.style.fillOpacity = '1'; }
  });
  const pools = registry.filter(e => e.type === 'bpmn:Participant');
  for (const el of pools){
    const gfx = registry.getGraphics(el), vis = gfx?.querySelector('.djs-visual');
    const frame = vis && vis.querySelector('rect');
    if (frame && !vis.querySelector('path,polyline')) gfx.classList.add('dokufix-bpmn-box');
    if (!frame || !vis.querySelector('path,polyline')) continue;
    const sw = parseFloat(frame.style.strokeWidth) || 1.5, i = sw / 2;
    const across = el.di && el.di.isHorizontal === false;
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', i); r.setAttribute('y', i);
    r.setAttribute('width', across ? el.width - sw : 30 - i);
    r.setAttribute('height', across ? 30 - i : el.height - sw);
    r.setAttribute('class', 'dokufix-bpmn-head');
    r.setAttribute('style', 'fill:var(--dokufix-bpmn-head);stroke:none');
    frame.after(r);
  }
}

// Das X an zusammenführenden Gateways (mergeMarkerOff() in bauen.mjs): nur wenn jedes exklusive Gateway der Datei
// isMarkerVisible="true" trägt, wie Modellierer es setzen; dann verliert ein Merge (mindestens zwei Sequenzflüsse
// hinein, höchstens einer hinaus) das Attribut. Sonst hat der Autor gewählt, und die Datei bleibt. Gibt { xml, count }
// zurück, count Merges ohne X, oder null, wenn die Regel nicht greift.
function mergeMarkerOff(xml){
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const gateways = new Set([...doc.getElementsByTagNameNS('*', 'exclusiveGateway')].map(g => g.getAttribute('id')));
  const flows = [...doc.getElementsByTagNameNS('*', 'sequenceFlow')].map(f => ({ from: f.getAttribute('sourceRef'), to: f.getAttribute('targetRef') }));
  const count = (end, id) => flows.filter(f => f[end] === id).length;
  const shape = /<(?:[\\w.-]+:)?BPMNShape\\b[^>]*>/g;
  const elementOf = tag => (tag.match(/\\sbpmnElement\\s*=\\s*["']([^"']*)["']/) || [])[1];
  const visible = /\\s+isMarkerVisible\\s*=\\s*["']true["']/;
  const tags = [...xml.matchAll(shape)].map(m => m[0]).filter(t => gateways.has(elementOf(t)));
  if (!tags.length || !tags.every(t => visible.test(t))) return null;
  const merges = new Set();
  const out = xml.replace(shape, t => {
    const id = elementOf(t);
    if (!gateways.has(id) || count('to', id) < 2 || count('from', id) > 1) return t;
    merges.add(id);
    return t.replace(visible, '');
  });
  return { xml: out, count: merges.size };
}

// Der Name eines Bilds: der Name des Modells (definitions name), sonst der Dateiname, und die Zeit des Klicks, wie
// im Assistenten.
function fileBase(xml, fileName){
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const own = (doc.documentElement.getAttribute('name') || '').trim();
  const d = new Date(), two = n => String(n).padStart(2, '0');
  return T.diagramFileName(own || fileName.replace(/\\.[^.]*$/, '') || 'Diagramm') + '_' + d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + '_' + two(d.getHours()) + '-' + two(d.getMinutes()) + '-' + two(d.getSeconds());
}

function section(title){
  const s = document.createElement('section');
  s.innerHTML = '<h2>' + esc(title) + ' <small></small></h2>';
  $('out').appendChild(s);
  return s;
}
function error(s, msg){ const d = document.createElement('div'); d.className = 'err'; d.textContent = msg; s.appendChild(d); }
// Das Bild als .png (Ben, 2026-10-08): das SVG des Downloads, in doppelter Größe auf eine Leinwand gezeichnet, damit
// es auch vergrößert scharf bleibt; ein durchsichtiger Hintergrund bleibt durchsichtig. Als data:-URL geladen, damit
// die Leinwand auch unter file:// lesbar bleibt.
const PNG_SCALE = 2;
function pngOf(text){
  return new Promise((resolve, reject) => {
    const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
    const vb = String(svg.getAttribute('viewBox') || '').trim().split(/[\\s,]+/).map(Number);
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
// Ein Knopf, der beim Klick erst das PNG macht und es dann herunterlädt.
function pngButton(name, svgText){
  const p = document.createElement('a');
  p.className = 'btn small'; p.innerHTML = ${JSON.stringify(ICON.download)} + ' .png'; p.title = 'Diagramm als .png herunterladen'; p.href = '#';
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

async function draw(s, xml, fileName){
  const holder = document.createElement('div');
  holder.className = 'dokufix-doc'; holder.style.maxWidth = 'none'; holder.style.margin = '0'; holder.style.padding = '0';
  holder.innerHTML = '<figure class="dokufix-diagram dokufix-diagram-bpmn" style="margin:0"><div class="pic" title="Klicken: Großansicht"></div></figure>';
  s.appendChild(holder);
  const pic = holder.querySelector('.pic');
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:4000px;height:3000px;overflow:hidden';
  document.body.appendChild(host);
  const off = new BpmnJS({ container: host, ...T.BPMN_VIEWER_CONFIG });
  try {
    await off.importXML(xml);
    decorate(off);
    pic.innerHTML = (await off.saveSVG()).svg;
  } finally { off.destroy(); host.remove(); }
  pic.onclick = () => openLarge(fileName, xml);
  const v = document.createElement('a');
  v.className = 'btn small'; v.innerHTML = ${JSON.stringify(ICON.download)} + ' .svg'; v.title = 'Diagramm als .svg herunterladen'; v.href = '#';
  v.onclick = () => { v.download = fileBase(xml, fileName) + '.svg'; v.href = URL.createObjectURL(new Blob([T.pictureOf(pic.querySelector('svg'))], { type: 'image/svg+xml' })); };
  const png = pngButton(() => fileBase(xml, fileName), () => T.pictureOf(pic.querySelector('svg')));
  s.querySelector('h2').append(v, png);
}

async function render(){
  const my = ++run;
  closeLarge();
  $('out').replaceChildren();
  for (const f of files){
    const s = section(f.name);
    if (!hasShapes(f.xml)){ error(s, 'Die Datei hat keine Koordinaten. Dieses Werkzeug ordnet nicht an; es zeichnet nur, was gezeichnet wurde.'); continue; }
    let xml = f.xml;
    if (!$('merge-x').checked){
      let r = null;
      try { r = mergeMarkerOff(xml); } catch {}
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

// Die Großansicht wie im Assistenten, ohne Bearbeiten: Einpassen, 100, 150, 200 %; + und - wechseln die Stufe,
// Escape schließt.
let large = null;
async function openLarge(title, xml){
  closeLarge();
  const box = document.createElement('div');
  box.id = 'large';
  box.innerHTML = '<div class="lbar"><strong></strong><span class="hint">Strg+Mausrad zoomt, Mausrad und Ziehen verschieben, + und - wechseln die Stufe, Escape schließt</span><span class="steps"><button data-z="fit">Einpassen</button><button data-z="1">100 %</button><button data-z="1.5">150 %</button><button data-z="2">200 %</button></span><button class="close">Schließen</button></div><div class="dokufix-doc lwrap"><div class="dokufix-diagram dokufix-diagram-bpmn lcanvas"></div></div>';
  box.querySelector('strong').textContent = title;
  document.body.appendChild(box);
  document.documentElement.style.overflow = 'hidden';
  const viewer = new BpmnJS({ container: box.querySelector('.lcanvas'), ...T.BPMN_VIEWER_CONFIG });
  large = { box, viewer };
  box.querySelector('.close').onclick = closeLarge;
  for (const b of box.querySelectorAll('.steps button')) b.onclick = () => step(b.dataset.z);
  try {
    await viewer.importXML(xml);
    decorate(viewer);
    step('fit');
    viewer.on('canvas.viewbox.changed', () => mark());
  } catch (e){ closeLarge(); alert(e.message); }
}
const STEPS = ['fit', '1', '1.5', '2'];
function step(z){
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
function closeLarge(){
  if (!large) return;
  try { large.viewer.destroy(); } catch {}
  large.box.remove(); large = null;
  document.documentElement.style.overflow = '';
}
document.addEventListener('keydown', e => {
  if (!large) return;
  if (e.key === 'Escape'){ e.preventDefault(); closeLarge(); }
  else if (e.key === '+' || e.key === '-'){
    e.preventDefault();
    let i = STEPS.indexOf(large.step);
    if (i < 0){ const z = large.viewer.get('canvas').zoom(); i = z < 1 ? 0 : z < 1.25 ? 1 : z < 1.75 ? 2 : 3; }
    step(STEPS[Math.max(0, Math.min(STEPS.length - 1, i + (e.key === '+' ? 1 : -1)))]);
  }
});
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(REPO, 'dist/bpmn-layouter-audi.html'), html);
console.log('dist/bpmn-layouter-audi.html', html.length, 'B');
