// Baut dist/bpmn-assistant.html, den Dokufix BPMN Assistant: BPMN-XML einfügen oder als Datei hochladen; oben das
// Original mit seinen eigenen Koordinaten (nur wenn es welche hat), darunter A2 angeordnet, das Modul des Produkts,
// src/app/bpmn-layout.js, mit allen Regeln, mit einem Satz, was die Ansicht ausmacht, Brüchen, Zeit, Großansicht wie
// in dokufix und Download als .bpmn und .svg; ein Fehler steht an Stelle des Diagramms. Dazu die Handreichung für
// LLMs zum Kopieren und Herunterladen, sechs Beispiele und die Diagrammfarben (Vorlagen oder eigene). Wie die App:
// bpmn-js 18.31.0 (die Version von src/index.html), seit 2026-10-07 in die Seite eingebettet statt vom CDN, damit sie
// ohne Netz läuft, die Spalten und die Ordnung des Modells aus kanonisch()
// (src/app/lmm.js, LMM, ohne Browser; seit 2026-10-07 ohne Mermaid, das die Seite deshalb nicht mehr lädt), die
// Größe der Beschriftungen aus measureLabel() (src/app/label-size.js, ohne Browser, in der Schrift und den Größen
// von bpmn-js), die Farben aus den Dokumentstilen von dist/dokufix.html. Dazu die Anordnung
// von bpmn.io, bpmn-auto-layout 2.0.0-alpha.2, gebündelt in die Seite, ohne CDN, mit den Lizenzhinweisen der
// gebündelten Pakete davor.
//
// A2 ordnet wie die App im Worker des Layouts an (docs/konzept-worker.md, Ben, 2026-10-07): derselbe Block
// #dokufix-layout-js, aus dist/dokufix.html übernommen (src/layout-worker.js, gebündelt von build.mjs), derselbe
// Client (src/app/layout-client.js) mit der Zeitgrenze von 120 s und derselbe Hinweis mit den Sekunden
// (src/app/layout-notice.js). Im Worker läuft, was reine Logik ist und das meiste an Zeit kostet: Lesen, LMM,
// Raster, Diagrammteil. Auf der Seite bleibt, was sie braucht oder was schnell ist: das Lesen fürs Nicht-Angeordnete
// und das Modell der Regelprüfung, die Behelfslinien (DOMParser), die Brüche, das Zeichnen mit bpmn-js und die
// Anordnung von bpmn.io, eine fremde Bibliothek, die nicht in den Worker gehört.
//
//   npm run assistant          (dist/dokufix.html gebaut: npm run build)
//
// Herkunft: das Bauskript des Spikes 2.26 (spike-2-26/testtool/bauen.mjs im Store), am 2026-10-07 ins Repository
// übernommen, damit der Assistant mit dem Produkt gebaut werden kann. Was es aus dem Store las, liegt seither hier,
// einmal aus der damals gebauten dist/bpmn-assistant.html gezogen: die Handreichung (handreichung.md), die Beispiele
// (beispiele/, mit beispiele.json für Reihenfolge und Beschriftung) und bpmn-auto-layout mit seinen Abhängigkeiten,
// fertig gebündelt und minifiziert (vendor/bpmn-auto-layout.min.js, vendor/bpmn-auto-layout.LIZENZEN.txt): Das
// Paket ist keine Abhängigkeit des Produkts und bleibt es so. Ein neueres bpmn-auto-layout wird im Store gebündelt
// und als Datei hier ersetzt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { NOTICES, LICENCE_TEXTS } from '../../src/app/licences.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '../..');

// Was die Regelprüfung aus Node braucht, gibt es im Browser nicht; breaksOf() braucht es nicht.
const stubs = {
  name: 'stubs',
  setup(b){
    b.onResolve({ filter: /^node:|bpmn-fixtures\.mjs$/ }, a => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'const j = (...a) => a.join("/"); const P = { join: j, resolve: j, dirname: s => String(s), basename: s => String(s), relative: () => "" }; export default P; export const join = j, resolve = j, dirname = P.dirname, basename = P.basename, existsSync = () => false, readFileSync = () => "", writeFileSync = () => {}, FIXTURE_DIR = "", fixtureNames = () => [], readFixture = () => null, readModel = () => null, expectedFile = () => "", fileURLToPath = () => "", pathToFileURL = () => "";', loader: 'js' }));
  },
};
const bundle = (await esbuild.build({
  stdin: {
    contents: `
      import { BPMN_VIEWER_CONFIG, addBpmnTypeClasses, bpmnTypeClasses } from '${REPO}/src/app/bpmn.js';
      import * as a2 from '${REPO}/src/app/bpmn-layout.js';
      import { kanonisch, lmmPositions } from '${REPO}/src/app/lmm.js';
      import { breaksOf } from '${REPO}/tests/bpmn-rules.mjs';
      import { pictureOf, diagramFileName } from '${REPO}/src/app/diagram-downloads.js';
      import { parseXml } from '${REPO}/src/app/xml-parser.js';
      import { makeLayoutClient } from '${REPO}/src/app/layout-client.js';
      import { showLayoutNotice } from '${REPO}/src/app/layout-notice.js';
      import { addLineJumps } from '${REPO}/src/app/line-jumps.js';
      window.T = { parseXml, kanonisch, lmmPositions, BPMN_VIEWER_CONFIG, addBpmnTypeClasses, bpmnTypeClasses, breaksOf, pictureOf, diagramFileName, makeLayoutClient, showLayoutNotice, addLineJumps, a2 };
    `,
    resolveDir: HERE, loader: 'js',
  },
  bundle: true, format: 'iife', write: false, charset: 'utf8', logLevel: 'silent', plugins: [stubs],
})).outputFiles[0].text;

// bpmn-auto-layout von bpmn.io, die Vorabversion (Ben, 2026-10-06: „die alpha … ohne cdn einbetten“), mit seinen
// Abhängigkeiten (bpmn-moddle, moddle, moddle-xml, saxen, min-dash) fertig gebündelt aus vendor/, davor ihre
// Lizenzhinweise, wie der Spike sie aus den Paketen las (bpmn-auto-layout hat keine Lizenzdatei, MIT steht in seiner
// package.json und seiner README).
const VENDOR = path.join(HERE, 'vendor');
const balBundle = fs.readFileSync(path.join(VENDOR, 'bpmn-auto-layout.min.js'), 'utf8');
const balNotice = fs.readFileSync(path.join(VENDOR, 'bpmn-auto-layout.LIZENZEN.txt'), 'utf8');
const BAL_VERSION = /bpmn-auto-layout ([^)\s]+)\)/.exec(balNotice)[1];

// bpmn-js 18.31.0, die Dateien, die die Seite bis 2026-10-07 vom CDN lud (Ben: „einfach einbetten, dann ist er
// offlinetauglich“), unverändert aus dem Paket (dist/ und dist/assets/), in vendor/bpmn-js/: der Viewer mit seinem
// Stylesheet im Kopf der Seite, der Modellierer mit seinen zwei Stylesheets (das zweite trägt die Schrift der
// Werkzeugleiste als data:-URL) als Blöcke, die erst beim ersten Öffnen ausgeführt werden. Davor der Text der
// bpmn.io License aus der Lizenzliste des Produkts (src/app/licences.js); das Logo, das sie verlangt, zeichnen
// Viewer und Modellierer selbst. Keine Datei darf das Element beenden, in dem sie steht, noch ein Skript öffnen.
const BPMN_JS = path.join(VENDOR, 'bpmn-js');
const bpmnJs = name => {
  const text = fs.readFileSync(path.join(BPMN_JS, name), 'utf8');
  if (/<\/?(script|style)/i.test(text)) throw new Error('vendor/bpmn-js/' + name + ' enthält ein Tag script oder style');
  return text;
};
const viewerJs = bpmnJs('bpmn-navigated-viewer.production.min.js');
const viewerCss = bpmnJs('diagram-js.css');
const modelerJs = bpmnJs('bpmn-modeler.production.min.js');
const modelerCss = bpmnJs('bpmn-js.css') + '\n' + bpmnJs('bpmn-embedded.css');
const bpmnJsEntry = NOTICES.find(n => n.package === 'bpmn-js');
const bpmnJsNotice = [bpmnJsEntry.name + ' ' + bpmnJsEntry.version, ...bpmnJsEntry.copyright, LICENCE_TEXTS[bpmnJsEntry.licence].title, ...LICENCE_TEXTS[bpmnJsEntry.licence].paragraphs]
  .join('\n\n').replace(/\*\//g, '* /');

// Was im Bündel oben von anderen stammt: der Nachbau des Textlayouts von diagram-js (src/app/label-size.js) und der
// Nachbau der Schichtung aus dem Swimlane-Layout von Mermaid (src/app/lmm.js), beide MIT, mit den Hinweisen, wie
// sie die Lizenzliste des Produkts führt (src/app/licences.js); die wenigen Konstanten und Formeln aus dem
// Textrenderer von bpmn-js stehen unter dessen Lizenz, und bpmn-js lädt die Seite vom CDN. Kommentare des
// Quelltexts fallen beim Bündeln weg, deshalb steht der Hinweis hier.
const djs = NOTICES.find(n => n.package === 'diagram-js');
const lmm = NOTICES.find(n => n.package === 'mermaid' && n.use === 'embedded');
const bundleNotice = ['In diesem Skript steckt ein Nachbau des Textlayouts von ' + djs.name + ' ' + djs.version +
  ' (src/app/label-size.js von dokufix, lib/util/Text.js von diagram-js), dazu wenige Konstanten und Formeln des Textrenderers von bpmn-js 18.31.0 (bpmn.io License, Copyright (c) 2014-present Camunda Services GmbH),' +
  ' und LMM (src/app/lmm.js von dokufix), ein Nachbau der Schichtung aus ' + lmm.name + ' ' + lmm.version + ' (src/rendering-util/layout-algorithms/swimlanes/ von Mermaid).',
  djs.name + ' ' + djs.version, ...djs.copyright, lmm.name + ' ' + lmm.version, ...lmm.copyright, LICENCE_TEXTS[djs.licence].title, ...LICENCE_TEXTS[djs.licence].paragraphs]
  .join('\n\n').replace(/\*\//g, '* /');

const dist = fs.readFileSync(path.join(REPO, 'dist/dokufix.html'), 'utf8');
const docCss = /<style id="dokufix-doc-css">([\s\S]*?)<\/style>/.exec(dist)[1];
// Der Worker des Layouts, wie ihn die App trägt: der Block, aus dem der Client den Worker macht. build.mjs hat ihn
// gegen "</script" und "<!--" geprüft.
const layoutJs = /<script type="text\/plain" id="dokufix-layout-js">([\s\S]*?)<\/script>/.exec(dist)[1];
// Die Beispiele (Ben, 2026-10-06; seit Story 2.31 drei mit Textanmerkungen): Reihenfolge und Beschriftung in
// beispiele/beispiele.json, das XML je Datei daneben. Die Handreichung für LLMs: handreichung.md.
const handreichung = fs.readFileSync(path.join(HERE, 'handreichung.md'), 'utf8');
const beispiele = JSON.parse(fs.readFileSync(path.join(HERE, 'beispiele', 'beispiele.json'), 'utf8'))
  .map(({ label, datei }) => ({ label, xml: fs.readFileSync(path.join(HERE, 'beispiele', datei), 'utf8') }));

// Kleine Symbole für die Knöpfe, 16 px, in der Farbe des Textes.
const svgIcon = d => '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const ICON = {
  pencil: svgIcon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
  play: svgIcon('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
  upload: svgIcon('<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>'),
  download: svgIcon('<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>'),
  copy: svgIcon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  doc: svgIcon('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  palette: svgIcon('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1-.1-2.2 1.1-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/>'),
};

// Das Favicon (Ben, 2026-10-07): ein exklusives Gateway mit Fragezeichen, in den Gateway-Farben der Vorlage „Gelb“;
// das Fragezeichen als Pfad, nicht als Schrift, damit es überall gleich aussieht.
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 1.8 30.2 16 16 30.2 1.8 16z" fill="#f0f8ff" stroke="#0066cc" stroke-width="2.6" stroke-linejoin="round"/><path d="M12.2 12.6a3.9 3.9 0 1 1 5.6 3.5c-1.2.6-1.8 1.4-1.8 2.7v.6" fill="none" stroke="#004080" stroke-width="2.8" stroke-linecap="round"/><circle cx="16" cy="23.4" r="1.7" fill="#004080"/></svg>');

const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dokufix BPMN Assistant</title>
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
<style>
:root{--bg:#fff;--fg:#1d1d1f;--mute:#6e6e73;--line:#e5e5ea;--acc:#0066cc;--err:#a50e0e;--errbg:#fce8e6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:32px 40px 28px;border-bottom:1px solid var(--line)}
main{padding:8px 40px 48px}
@media (max-width:700px){header{padding:20px 16px}main{padding:8px 16px 32px}}
h1{font-size:24px;font-weight:650;letter-spacing:-.01em;margin:0}
.tag{color:var(--mute);margin:4px 0 0}
.head{display:flex;gap:24px 56px;flex-wrap:wrap;align-items:flex-start;margin:28px 0 36px}
.intro{flex:1 1 380px;max-width:600px}
.intro p{margin:0 0 12px}
.intro ol{margin:0;padding-left:1.3em}
.intro li{margin:0 0 8px;padding-left:4px}
.intro li::marker{color:var(--mute);font-weight:600}
.intro code,.hint code{font-size:13px}
.aside{flex:0 1 380px;display:flex;flex-direction:column;gap:24px}
.label{display:block;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);margin:0 0 6px}
.aside p{margin:0 0 10px;font-size:14px;color:var(--mute)}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#ex{display:none}
.hint{color:var(--mute);font-size:13px}
.sub{display:block;font-size:15px;font-weight:600;margin:0 0 8px}
textarea{width:100%;height:220px;font:12px/1.45 ui-monospace,monospace;padding:10px 12px;border:1px solid var(--line);border-radius:8px;resize:vertical;background:#fbfbfd}
textarea:focus{outline:2px solid var(--acc);outline-offset:-1px;background:#fff}
.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
.bar .hint{flex-basis:100%;margin-top:4px}
#name-l{display:inline-flex;gap:6px;align-items:center;font-size:14px;margin-left:8px}
#name{height:34px;width:240px;padding:0 10px;font:inherit;font-size:14px;border:1px solid #d2d2d7;border-radius:7px}
#name:focus{outline:2px solid var(--acc);outline-offset:-1px}
#merge-x-l,#jumps-l{display:inline-flex;gap:6px;align-items:center;font-size:14px;margin-left:8px;cursor:pointer}
.bar #theme-now{display:inline-flex;flex-direction:column;justify-content:space-between;height:34px;padding:2px 0;margin-left:4px}
.bar #theme-name{display:block;flex:none;font-size:12px;line-height:14px;margin:0}
#theme-sw{display:flex;gap:3px}#theme-sw i{width:12px;height:12px;border-radius:3px;border:1px solid #0002}
.checker{background:repeating-conic-gradient(#e5e5ea 0 25%,#fff 0 50%) 0 0/8px 8px}
button,a.btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;font:inherit;font-size:14px;color:var(--fg);background:#fff;border:1px solid #d2d2d7;border-radius:7px;cursor:pointer;text-decoration:none;white-space:nowrap}
button:hover,a.btn:hover{background:#f5f5f7}
button:focus-visible,a.btn:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
button.primary{background:var(--acc);border-color:var(--acc);color:#fff;font-weight:600}
button.primary:hover{background:#0055aa}
.ic{flex:none}
section{border-top:1px solid var(--line);padding:20px 0 8px}
section:first-of-type{border-top:0}
h2{font-size:17px;font-weight:650;margin:0 0 8px;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
h2 small{font-weight:400;color:var(--mute);font-size:13px}
.about{margin:-4px 0 10px;color:var(--mute);font-size:14px;max-width:820px}
.pic{cursor:zoom-in;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--assistant-bg,#fff)}
.pic svg{display:block;max-width:100%;height:auto}
.err{background:var(--errbg);color:var(--err);padding:10px 12px;border-radius:8px;white-space:pre-wrap;font:13px/1.4 ui-monospace,monospace}
details{font-size:13px;color:var(--mute);margin:0 0 8px}
.dls{display:inline-flex;gap:6px}
#large{position:fixed;inset:0;z-index:10;background:#fff;display:flex;flex-direction:column}
#large .lbar{display:flex;gap:12px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
#large .lbar strong{font-size:17px}#large .lbar .hint{flex:1}
#large .steps{display:flex}#large .steps button{border-radius:0;margin-left:-1px}#large .steps button:first-child{border-radius:7px 0 0 7px;margin-left:0}#large .steps button:last-child{border-radius:0 7px 7px 0}
#large .steps button[aria-pressed=true]{background:var(--acc);color:#fff;border-color:var(--acc)}
#large .lwrap{flex:1;max-width:none;margin:0;padding:0;min-height:0;display:flex}
#large .lcanvas{flex:1;min-height:0;background:var(--assistant-bg,#fff)}
dialog#theme{border:1px solid var(--line);border-radius:12px;padding:20px 24px;width:min(980px,calc(100vw - 32px));max-width:none;box-shadow:0 12px 40px #0002}
dialog#theme::backdrop{background:#0003}
dialog#theme h2{font-size:18px;margin:0 0 12px}
dialog#theme fieldset{border:0;border-top:1px solid var(--line);margin:0 0 12px;padding:10px 0 0}
dialog#theme legend{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);padding:0 8px 0 0}
.presets label{display:inline-flex;gap:6px;align-items:center;margin:2px 14px 2px 0;white-space:nowrap}
.role label,#roles label{display:inline-flex;gap:4px;align-items:center;margin-left:10px;font-size:13px;color:var(--mute);cursor:pointer}
#roles{display:grid;grid-template-columns:1fr repeat(4,56px);gap:5px 10px;align-items:center;font-size:14px}
#roles .colh{font-size:12px;color:var(--mute);text-align:center}
#roles .sw{height:22px;width:100%;padding:0;border:1px solid #0003;border-radius:5px}
#roles .sw[aria-pressed=true]{outline:2px solid var(--acc);outline-offset:2px}
.editor{display:flex;gap:16px 32px;flex-wrap:wrap;align-items:flex-start}
.editor #roles{flex:1 1 420px}
.side{flex:0 0 340px;display:flex;flex-direction:column;gap:10px}
#pick{display:flex;gap:8px;align-items:center;font-size:14px}
#pick-name{flex:1;font-weight:600}
#sv{position:relative;height:150px;border-radius:6px;cursor:crosshair;touch-action:none;background:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(var(--h,0),100%,50%))}
#sv[data-mode=hsl]{background:linear-gradient(to bottom,#fff,#fff0 50%,#0000 50%,#000),linear-gradient(to right,#808080,hsl(var(--h,0),100%,50%))}
#nums{display:flex;gap:8px}
#nums label{flex:1;display:flex;align-items:center;gap:5px;font-size:12px;color:var(--mute)}
#nums span{width:10px}
#nums input{width:100%;min-width:0;font:13px ui-monospace,monospace;padding:4px 6px;border:1px solid #d2d2d7;border-radius:5px}
#nums input.bad{outline:2px solid var(--err)}
#field-mode{display:flex}
#field-mode button{height:24px;padding:0 10px;font-size:12px;border-radius:0;margin-left:-1px}
#field-mode button:first-child{border-radius:6px 0 0 6px;margin-left:0}
#field-mode button:last-child{border-radius:0 6px 6px 0}
#field-mode button[aria-pressed=true]{background:#1d1d1f;border-color:#1d1d1f;color:#fff}
#sv-dot{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #0006;pointer-events:none}
#hue{-webkit-appearance:none;appearance:none;width:100%;height:14px;margin:0;border-radius:7px;background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)}
#hue::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;border:1px solid #0006}
#hue::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:1px solid #0006}
#pick-hex{font:13px ui-monospace,monospace;padding:4px 6px;width:106px;border:1px solid #d2d2d7;border-radius:5px}
#pick-hex.bad{outline:2px solid var(--err)}
#palette,#used{display:grid;grid-template-columns:repeat(11,1fr);gap:5px}
:is(#palette,#used) button{height:24px;border:1px solid #0002;border-radius:5px;padding:0}
.sub-l{font-size:12px;color:var(--mute);margin:4px 0 -4px}
.dbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#theme-msg{flex:1;min-width:120px}
#theme-msg.bad{color:var(--err)}
button.small,a.btn.small{height:28px;padding:0 10px;font-size:13px;font-weight:400}
#modeler{position:fixed;inset:0;z-index:20;background:#fff;display:flex;flex-direction:column}
#modeler .mbar{display:flex;gap:10px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
#modeler .mbar strong{font-size:17px}#modeler .mbar .hint{flex:1}
#modeler .mcanvas{flex:1;min-height:0;position:relative}
</style>
</head>
<body>
<header>
<h1>Dokufix BPMN Assistant</h1>
<p class="tag">Prozessdiagramme mit einem Sprachmodell schreiben und von dokufix anordnen lassen.</p>
<div class="head">
<div class="intro">
<p>Sie beschreiben den Ablauf, das LLM schreibt daraus BPMN-XML, und dokufix ordnet das Diagramm selbst an, ohne dass Sie ein Element von Hand platzieren.</p>
<ol>
<li><strong>LLM vorbereiten.</strong> Kopieren Sie die Handreichung für LLMs und geben Sie sie Ihrem Sprachmodell zusammen mit einer Beschreibung Ihres Prozesses: Wer ist beteiligt, wer tauscht mit wem Nachrichten, welche Schritte gibt es, wo wird entschieden, was läuft parallel?</li>
<li><strong>Rendern.</strong> Fügen Sie das gelieferte XML unten ein oder laden Sie es als Datei hoch. Sie sehen die Anordnung von dokufix (<em>A2</em>), auch mit mehreren Pools, Pools ohne eigenen Prozess (Black Box) und Nachrichtenflüssen. Hat die Datei eigene Koordinaten, steht ihr Bild darüber als „Original BPMN“.</li>
<li><strong>Feinschleifen.</strong> Die Bilder sind Vorschläge. Laden Sie die beste Variante als <code>.bpmn</code> herunter und bearbeiten Sie sie in einem BPMN-Modellierer wie dem <a href="https://camunda.com/download/modeler/" target="_blank" rel="noopener">Camunda Modeler</a> oder <a href="https://demo.bpmn.io/" target="_blank" rel="noopener">demo.bpmn.io</a> nach.</li>
<li><strong>Weiterverwenden.</strong> Laden Sie die fertige Datei wieder hoch, um sie zu prüfen, und nehmen Sie das Bild als <code>.svg</code> in Ihre Dokumente, in den gewählten Diagrammfarben.</li>
</ol>
</div>
<div class="aside">
<div>
<span class="label">Handreichung für LLMs</span>
<p>Sagt einem Sprachmodell, welches BPMN-XML ohne Koordinaten dokufix zeichnen kann.</p>
<div class="row"><button id="llm-copy">${ICON.copy} Text für LLM in Zwischenablage kopieren</button><a id="llm-dl" class="btn" download="bpmn-ohne-koordinaten-fuer-llms.md">${ICON.download} als .md herunterladen</a><span id="llm-ok" class="hint"></span></div>
</div>
<div>
<span class="label">Beispieldiagramme</span>
<p>Klicken, um Beispiel zu laden.</p>
<div class="row"><span id="ex"></span></div>
</div>
</div>
</div>
<label class="sub" for="xml">BPMN einfügen oder hochladen</label>
<textarea id="xml" spellcheck="false" placeholder="BPMN-XML hier einfügen"></textarea>
<div class="bar">
<button id="go" class="primary">${ICON.play} Rendern</button>
<button id="up" title="Eine .bpmn-Datei laden und rendern">${ICON.upload} Datei hochladen …</button><input type="file" id="file" accept=".bpmn,.xml,application/xml,text/xml" hidden>
<label id="name-l" title="Der Name des Modells (definitions name): Enter schreibt ihn ins XML und rendert neu; er gibt auch den Downloads ihren Namen">Name <input type="text" id="name" spellcheck="false" autocomplete="off"></label>
<button id="theme-btn" title="Farben der Diagramme">${ICON.palette} Diagrammfarben ändern</button><span id="theme-now"><span class="hint" id="theme-name"></span><span id="theme-sw" aria-hidden="true"></span></span>
<label id="merge-x-l" title="Ohne Häkchen zeichnet A2 exklusive Gateways, die zusammenführen, als leere Raute"><input type="checkbox" id="merge-x" checked> X an zusammenführenden Gateways</label>
<label id="jumps-l" title="Wo sich zwei Linien kreuzen, springt die waagrechte mit einem kleinen Bogen über die senkrechte"><input type="checkbox" id="jumps" checked> Sprungbögen</label>
<span class="hint">Strg+Enter rendert. Ein Klick auf ein Diagramm öffnet die Großansicht (Strg+Mausrad zoomt, Escape schließt).</span>
</div>
</header>
<dialog id="theme" aria-labelledby="theme-h">
<form method="dialog">
<h2 id="theme-h">Farben der Diagramme</h2>
<fieldset class="presets"><legend>Vorlage</legend></fieldset>
<fieldset><legend>Eigene Farben</legend>
<p class="hint">Ein Feld anklicken, dann rechts die Farbe wählen, den Hexcode eintippen oder eine Farbe aus der Palette nehmen.</p>
<div class="editor">
<div id="roles"></div>
<div class="side">
<div id="pick"><span id="pick-name"></span><input type="text" id="pick-hex" maxlength="11" spellcheck="false" aria-label="Hexcode"></div>
<div id="field-mode" role="group" aria-label="Farbfeld"><button type="button" data-m="hsv" title="Sättigung nach rechts, Helligkeit (Value) nach oben">HSV</button><button type="button" data-m="hsl" title="Sättigung nach rechts, Helligkeit (Lightness) nach oben, die reine Farbe in halber Höhe">HSL</button></div>
<div id="sv" aria-label="Sättigung und Helligkeit"><i id="sv-dot"></i></div>
<input type="range" id="hue" min="0" max="360" step="1" aria-label="Farbton">
<div id="nums"><label><span>H</span><input type="number" data-i="0" min="0" max="360" step="1" aria-label="Farbton in Grad"></label><label><span>S</span><input type="number" data-i="1" min="0" max="100" step="1" aria-label="Sättigung in Prozent"></label><label><span id="num3">V</span><input type="number" data-i="2" min="0" max="100" step="1" aria-label="Helligkeit in Prozent"></label></div>
<div id="palette" aria-label="Palette"></div>
<span class="sub-l">Im Thema verwendet</span>
<div id="used" aria-label="Im Thema verwendete Farben"></div>
</div>
</div>
</fieldset>
<div class="dbar"><button type="button" id="theme-export" title="Die Farben als .json herunterladen">${ICON.download} Exportieren</button><button type="button" id="theme-import" title="Farben aus einer .json-Datei laden">${ICON.upload} Importieren</button><input type="file" id="theme-file" accept=".json,application/json" hidden><span class="hint" id="theme-msg" role="status"></span><button type="button" id="theme-reset">Zurücksetzen</button><button value="close" id="theme-close">Schließen</button></div>
</form>
</dialog>
<main id="out"></main>
<script type="text/plain" id="dokufix-layout-js">${layoutJs}</script>
<script type="text/plain" id="bpmn-modeler-js">${modelerJs}</script>
<script type="text/plain" id="bpmn-modeler-css">${modelerCss}</script>
<script>/*
${bundleNotice}
*/
${bundle}</script>
<script id="bpmn-io-js">/*
${balNotice}*/
${balBundle}</script>
<script>
const BEISPIELE = ${JSON.stringify(beispiele)};
const HANDREICHUNG = ${JSON.stringify(handreichung)};
const $ = id => document.getElementById(id);
// Farben der Diagramme (Spike Dokufix BPMN Assistant): die Variablen, die
// src/doc.css je Elementart setzt, in einem eigenen Stilblock nach den
// Dokumentstilen überschrieben; gilt für Bilder, Großansicht und SVG-Download.
// Farbvariablen je Elementtyp (Ben, 2026-10-05): je Typ Füllung, Linie und
// Schrift, soweit der Typ sie hat. Der Schlüssel ist Typ-Eigenschaft, etwa
// task-fill; nur bg-fill darf auch transparent sein.
const TYPES = [
  ['task', 'Aufgabe', 'fsli'],
  ['sub', 'Teilprozess und Aufruf', 'fsl'],
  ['start', 'Startereignis', 'fsli'],
  ['inter', 'Zwischenereignis', 'fsli'],
  ['end', 'Endereignis', 'fsli'],
  ['gwx', 'Gateway exklusiv', 'fsli'],
  ['gwp', 'Gateway parallel', 'fsli'],
  ['gwo', 'Gateway inklusiv', 'fsli'],
  ['gwe', 'Gateway ereignisbasiert, komplex', 'fsli'],
  ['flow', 'Sequenzfluss', 'sl'],
  ['msg', 'Nachrichtenfluss', 'sl'],
  ['pool', 'Pool', 'fs'],
  ['head', 'Poolkopf', 'fl'],
  ['lane', 'Bahn', 'fsl'],
  ['bg', 'Seitenhintergrund', 'f'],
];
const PROPS = { f: ['fill', 'Füllung'], s: ['stroke', 'Linie'], l: ['label', 'Schrift'], i: ['icon', 'Symbol'] };
const KEYS = TYPES.flatMap(([t, , ps]) => [...ps].map(p => t + '-' + PROPS[p][0]));
const NAMES = Object.fromEntries(TYPES.flatMap(([t, n, ps]) => [...ps].map(p => [t + '-' + PROPS[p][0], n + ' · ' + PROPS[p][1]])));
// Die Klassen, die addBpmnTypeClasses() je Typ vergibt (src/app/bpmn.js).
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
const HEX = /^#[0-9a-f]{6}$/i;
const valid = (k, v) => HEX.test(v) || (k === 'bg-fill' && v === 'transparent');
// Kontrast nach WCAG, für die Schrift im Poolkopf einer älteren Wahl.
function lum(hex){
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const headLabel = r => contrast(r.label, r.head) >= 4.5 ? r.label : contrast('#ffffff', r.head) >= contrast('#000000', r.head) ? '#ffffff' : '#000000';
// Aus den zehn Rollen des vorigen Stands alle Variablen, dazu, was ein Thema je Typ anders setzt.
function fromRoles(r, over = {}){
  const t = {};
  for (const k of ['task', 'sub', 'start', 'inter']) Object.assign(t, { [k + '-fill']: r.fill, [k + '-stroke']: r.sym, [k + '-label']: r.label });
  Object.assign(t, {
    'end-fill': r.fill, 'end-stroke': r.end, 'end-label': r.label,
    'task-icon': r.sym,
    'flow-stroke': r.line, 'flow-label': r.label,
    'msg-stroke': r.line, 'msg-label': r.label,
    'pool-fill': r.poolFill, 'pool-stroke': r.poolLine,
    'head-fill': r.head || r.poolFill, 'head-label': headLabel({ label: r.label, head: r.head || r.poolFill }),
    'lane-fill': r.poolFill, 'lane-stroke': r.poolLine, 'lane-label': r.label,
    'bg-fill': r.bg || '#ffffff',
  });
  for (const g of ['gwx', 'gwp', 'gwo', 'gwe']) Object.assign(t, { [g + '-fill']: r.fill, [g + '-stroke']: r.gw || r.sym, [g + '-label']: r.label });
  // Das Symbol (Task oben links, Zeichen in Ereignis und Gateway) folgt der Linie, wenn das Thema es nicht eigens setzt.
  const out = { ...t, ...over };
  for (const [k, , ps] of TYPES) if (ps.includes('i') && !((k + '-icon') in over)) out[k + '-icon'] = out[k + '-stroke'];
  return out;
}
const PRESETS = {
  // Gelb: von Ben im Werkzeug gestaltet und als .json exportiert (2026-10-07), alle Werte ausdrücklich; seitdem die
  // Vorgabe des Assistenten. Aufgaben hellgelb mit Ocker, Gateways exklusiv blau, parallel und die übrigen violett,
  // Nachrichtenflüsse und Zwischenereignisse Ocker, Poolkopf schwarz; Hintergrund transparent.
  gelb: { name: 'Gelb',
    'task-fill': '#fffbdb', 'task-stroke': '#b3a00f', 'task-label': '#1c1c1e', 'task-icon': '#000000',
    'sub-fill': '#ffffff', 'sub-stroke': '#0066cc', 'sub-label': '#1c1c1e', 'start-fill': '#ffffff',
    'start-stroke': '#000000', 'start-label': '#1c1c1e', 'start-icon': '#c38209', 'inter-fill': '#ffffff',
    'inter-stroke': '#c38209', 'inter-label': '#1c1c1e', 'inter-icon': '#000000', 'end-fill': '#ffffff',
    'end-stroke': '#1c1c1e', 'end-label': '#1c1c1e', 'end-icon': '#1c1c1e', 'gwx-fill': '#f0f8ff',
    'gwx-stroke': '#0066cc', 'gwx-label': '#1c1c1e', 'gwx-icon': '#004080', 'gwp-fill': '#faf3fc',
    'gwp-stroke': '#ad33cc', 'gwp-label': '#1c1c1e', 'gwp-icon': '#8a29a3', 'gwo-fill': '#ffffff',
    'gwo-stroke': '#ad33cc', 'gwo-label': '#1c1c1e', 'gwo-icon': '#8a29a3', 'gwe-fill': '#ffffff',
    'gwe-stroke': '#ad33cc', 'gwe-label': '#1c1c1e', 'gwe-icon': '#8a29a3', 'flow-stroke': '#3a3a3f',
    'flow-label': '#1c1c1e', 'msg-stroke': '#c38209', 'msg-label': '#1c1c1e', 'pool-fill': '#ffffff',
    'pool-stroke': '#2c2c2c', 'head-fill': '#000000', 'head-label': '#ffffff', 'lane-fill': '#ffffff',
    'lane-stroke': '#2c2c2c', 'lane-label': '#1c1c1e', 'bg-fill': 'transparent' },
  // Wie dokufix zeichnet (src/doc.css:269–274), Nachrichtenflüsse dort #6e6e73.
  blau: { name: 'Blau (dokufix)', ...fromRoles({ sym: '#0066cc', end: '#1c1c1e', line: '#3a3a3f', poolLine: '#8e8e92', poolFill: '#fafafa', head: '#fafafa', fill: '#ffffff', label: '#1c1c1e', bg: '#ffffff' }, { 'msg-stroke': '#6e6e73' }) },
  sw: { name: 'Schwarzweiß', ...fromRoles({ sym: '#000000', end: '#000000', line: '#000000', poolLine: '#000000', poolFill: '#ffffff', head: '#ffffff', fill: '#ffffff', label: '#000000', bg: '#ffffff' }) },
  synthwave: { name: 'Synthwave', ...fromRoles({ sym: '#00f0ff', gw: '#f9f871', end: '#ff2a6d', line: '#b967ff', poolLine: '#ff2fd6', poolFill: '#1a0b2e', head: '#ff2fd6', fill: '#2a1050', label: '#fdf0ff', bg: '#0f0520' },
    { 'sub-stroke': '#b967ff', 'inter-stroke': '#f9f871', 'task-icon': '#ff2fd6', 'gwp-stroke': '#00f0ff', 'gwo-stroke': '#b967ff', 'msg-stroke': '#ff2fd6', 'flow-label': '#d9b8ff', 'head-label': '#0f0520', 'lane-fill': '#1a0b2e' }) },
  // Audi-Stil: von Ben im Werkzeug gestaltet und als .json exportiert (2026-10-05), alle Werte ausdrücklich.
  // Grautöne aus Audis CI-Guide, Schwarz und Weiß, Rot #f50537 (Audis „Progressive Red“) an Start- und
  // Endereignis, Gateways und Zwischenereignis-Zeichen; Hintergrund transparent.
  audi: { name: 'Audi-Stil',
    'task-fill': '#ffffff', 'task-stroke': '#333333', 'task-label': '#1a1a1a', 'task-icon': '#000000', 'sub-fill': '#ffffff', 'sub-stroke': '#333333',
    'sub-label': '#1a1a1a', 'start-fill': '#ffffff', 'start-stroke': '#f50537', 'start-label': '#1a1a1a', 'start-icon': '#4c4c4c', 'inter-fill': '#ffffff',
    'inter-stroke': '#000000', 'inter-label': '#1a1a1a', 'inter-icon': '#f50537', 'end-fill': '#ffffff', 'end-stroke': '#f50537', 'end-label': '#1a1a1a',
    'end-icon': '#4c4c4c', 'gwx-fill': '#ffffff', 'gwx-stroke': '#f50537', 'gwx-label': '#1a1a1a', 'gwx-icon': '#4c4c4c', 'gwp-fill': '#ffffff',
    'gwp-stroke': '#f50537', 'gwp-label': '#1a1a1a', 'gwp-icon': '#4c4c4c', 'gwo-fill': '#ffffff', 'gwo-stroke': '#f50537', 'gwo-label': '#1a1a1a',
    'gwo-icon': '#4c4c4c', 'gwe-fill': '#ffffff', 'gwe-stroke': '#f50537', 'gwe-label': '#1a1a1a', 'gwe-icon': '#4c4c4c', 'flow-stroke': '#4c4c4c',
    'flow-label': '#4c4c4c', 'msg-stroke': '#808080', 'msg-label': '#1a1a1a', 'pool-fill': '#f2f2f2', 'pool-stroke': '#000000', 'head-fill': '#000000',
    'head-label': '#ffffff', 'lane-fill': '#f2f2f2', 'lane-stroke': '#b3b3b3', 'lane-label': '#1a1a1a', 'bg-fill': 'transparent' },
  // STI Consulting: die Farben des Theme-Stylesheets von sti-consulting.com (2026-10-05): Primär Oliv #7E904C,
  // Dunkelblau #1D2C49 der dunklen Abschnitte (hier auch der Poolkopf), Text #333, Überschriften #1a1a1a, Hintergrund #FAFAFA.
  sti: { name: 'STI Consulting', ...fromRoles({ sym: '#7e904c', end: '#1d2c49', line: '#333333', poolLine: '#1d2c49', poolFill: '#fafafa', head: '#1d2c49', fill: '#ffffff', label: '#1a1a1a', bg: '#ffffff' },
    { 'flow-label': '#333333', 'lane-label': '#1d2c49', 'msg-stroke': '#1d2c49', 'task-icon': '#1d2c49', 'gwp-stroke': '#1d2c49' }) },
};
// Die Palette, 5 Reihen zu 11 (Konzept eines Fable-Agenten, Ben, 2026-10-05),
// in OKLCH gerechnet, Chroma bei Bedarf bis in den sRGB-Raum gekürzt.
// Spalten: Rot 25°, Orange 55°, Gelb 95°, Limette 125°, Grün 150°, Türkis
// 185°, Himmelblau 225°, Blau 262°, Violett 295°, Magenta 345°, Braun 60°
// (gedämpftes Orange).
const PALETTE = [
  // Grau: OKLab L 0, .20, .295 … .96, 1, neutral
  '#000000', '#161616', '#2c2c2c', '#454545', '#5f5f5f', '#7a7a7a', '#979797', '#b4b4b4', '#d2d2d2', '#f2f2f2', '#ffffff',
  // Dunkel: L .45, C .13 (Braun .06), für Linien und Schrift, auf Weiß 7:1 und mehr
  '#90302e', '#834100', '#665400', '#475f00', '#00672c', '#00635b', '#005f79', '#2b519c', '#5c4295', '#853166', '#6e4d32',
  // Kräftig: L je Farbton (Gelb .88 bis Violett .52), C .14–.22, für Marker und Hervorhebung
  '#e62b34', '#f68000', '#fdd500', '#a1d206', '#00af50', '#00b7a8', '#00b5e4', '#2669ed', '#7640d2', '#d0399c', '#835935',
  // Hell: L .87, C .09, für Füllungen von Aufgaben
  '#ffc3bd', '#ffc7a1', '#efd369', '#c2e289', '#aae5b5', '#8ce8dc', '#95e1ff', '#bed5ff', '#d7ccff', '#ffbde1', '#ebceb7',
  // Sehr hell: L .95, C .035, für Pool, Bahnen und Hintergrund
  '#ffe9e6', '#ffeadc', '#f6efd5', '#e9f3da', '#dff6e2', '#d6f7f1', '#d9f4ff', '#e6efff', '#efebff', '#ffe7f3', '#f9ece1'];
const THEME_KEY = 'bpmn-assistant-farben';
const CHECKER = 'repeating-conic-gradient(#e5e5ea 0 25%,#fff 0 50%) 0 0/16px 16px';
const presetOf = t => (Object.entries(PRESETS).find(([, c]) => KEYS.every(k => c[k] === t[k])) || ['eigene'])[0];
// Eine Wahl aus einem älteren Stand (gespeichert oder importiert) in die Schlüssel von heute.
function migrate(t){
  // Der Stand mit zehn Rollen: eine Vorlage bleibt die Vorlage, Eigenes wird umgerechnet.
  if (!t['task-fill'] && HEX.test(t.sym || '')) t = PRESETS[t.preset] ? { ...PRESETS[t.preset] } : fromRoles(t);
  // Der Stand mit einem Gateway-Typ und ohne Task-Symbol: jede Gateway-Art wie das Gateway, das Symbol wie die Linie.
  if (t['gw-fill'] && !t['gwx-fill']) for (const g of ['gwx', 'gwp', 'gwo', 'gwe']) for (const p of ['fill', 'stroke', 'label']) t[g + '-' + p] = t['gw-' + p];
  // Ein Stand ohne eigenes Symbol (Aufgabe, Ereignisse, Gateways): das Symbol wie die Linie.
  for (const [k, , ps] of TYPES) if (ps.includes('i') && t[k + '-stroke'] && !t[k + '-icon']) t[k + '-icon'] = t[k + '-stroke'];
  return t;
}
let theme = { preset: 'gelb', ...PRESETS.gelb };
try {
  const t = JSON.parse(localStorage.getItem(THEME_KEY) || 'null');
  const m = t && migrate(t);
  if (m && KEYS.every(k => valid(k, m[k]))) theme = { ...Object.fromEntries(KEYS.map(k => [k, m[k]])), preset: presetOf(m) };
} catch {}
let activeKey = 'task-fill';
// Eigener Farbwähler (Ben, 2026-10-05): er beginnt immer bei der Farbe des
// gewählten Felds. Der des Browsers (unter Linux der GTK-Dialog) beginnt eine
// neue eigene Farbe bei einem festen Rot. Die Fläche zeigt wahlweise HSV
// (Sättigung nach rechts, Helligkeit/Value nach oben) oder HSL (Sättigung nach
// rechts, Helligkeit/Lightness nach oben, die reine Farbe in halber Höhe).
// pickHue: Farbton 0–360; er bleibt bei Grau, Schwarz und Weiß, wie er war.
// pickPos: die Stelle in der Fläche (x, y 0–1) und die Farbe, die sie ergab;
// solange das Feld diese Farbe hat, bleibt der Punkt dort.
const FIELD_KEY = 'bpmn-assistant-farbfeld';
let fieldMode = 'hsv';
try { if (localStorage.getItem(FIELD_KEY) === 'hsl') fieldMode = 'hsl'; } catch {}
let pickHue = 0, pickPos = null;
function hexToHsv(hex){
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d){ h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, max ? d / max : 0, max];
}
function hsvToHex([h, s, v]){
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
function hexToHsl(hex){
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  return [hexToHsv(hex)[0], d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
}
function hslToHex([h, s, l]){
  const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
// Die Farbe an der Stelle (x, y) der Fläche, y von oben.
const colorAt = (x, y) => fieldMode === 'hsl' ? hslToHex([pickHue, x, 1 - y]) : hsvToHex([pickHue, x, 1 - y]);
function themeMsg(text, bad){ const m = $('theme-msg'); m.textContent = text; m.classList.toggle('bad', !!bad); }
const themeStyle = document.createElement('style');
document.head.appendChild(themeStyle);
function applyTheme(){
  const t = theme, d = '.dokufix-doc .dokufix-diagram-bpmn';
  const vars = (f, s, l) => (f ? '--dokufix-bpmn-fill:' + f + ';' : '') + (s ? '--dokufix-bpmn-stroke:' + s + ';' : '') + (l ? '--dokufix-bpmn-label:' + l + ';' : '');
  // Grundwerte für alles ohne eigenen Typ (Daten, Notizen, Assoziationen): wie Aufgaben, Linien wie Sequenzflüsse.
  let css = d + '{' + vars(t['task-fill'], t['flow-stroke'], t['task-label']) + '--assistant-bg:' + (t['bg-fill'] === 'transparent' ? CHECKER : t['bg-fill']) + '}';
  for (const [k, sel] of Object.entries(SEL)) css += d + ' ' + sel + '{' + vars(t[k + '-fill'], t[k + '-stroke'], t[k + '-label']) + '}';
  // Das Symbol (decorate() markiert es): seine Linie, und was bpmn-js darin in der Linienfarbe füllt.
  css += d + ' .dokufix-bpmn-task .dokufix-bpmn-icon{--dokufix-bpmn-stroke:' + t['task-icon'] + '}';
  for (const [k, sel] of Object.entries(SEL)) if (t[k + '-icon'] && k !== 'task') css += d + ' ' + sel + ' .dokufix-bpmn-icon{--dokufix-bpmn-stroke:' + t[k + '-icon'] + '}';
  // Der Pool: seine Schrift steht im Kopf.
  css += d + ' .dokufix-bpmn-pool{' + vars(t['pool-fill'], t['pool-stroke'], t['head-label']) + '--dokufix-bpmn-head:' + t['head-fill'] + '}';
  // Ein zugeklappter Pool (Black Box, Story 2.29) hat keinen Kopf; sein Name steht auf der Poolfläche, in der Farbe
  // der Bahnbeschriftung (Ben, 2026-10-06).
  css += d + ' .dokufix-bpmn-pool.dokufix-bpmn-box{' + vars(null, null, t['lane-label']) + '}';
  themeStyle.textContent = css;
  try { localStorage.setItem(THEME_KEY, JSON.stringify(theme)); } catch {}
  syncThemeForm();
}
function setKey(k, v){
  theme = { ...theme, [k]: v.toLowerCase() };
  theme.preset = presetOf(theme);
  applyTheme();
}
const paint = (el, v) => { el.classList.toggle('checker', v === 'transparent'); el.style.background = v === 'transparent' ? '' : v; };
function syncThemeForm(){
  $('theme-name').textContent = 'Aktuell gewählt: ' + (PRESETS[theme.preset] ? PRESETS[theme.preset].name : 'Eigene');
  // Ein Quadrat je Typ: seine Linie, sonst seine Füllung.
  $('theme-sw').replaceChildren(...TYPES.map(([t, n, ps]) => {
    const q = document.createElement('i'), k = t + '-' + (ps.includes('s') ? 'stroke' : 'fill');
    paint(q, theme[k]);
    q.title = [...ps].map(p => n + ' · ' + PROPS[p][1] + ': ' + theme[t + '-' + PROPS[p][0]]).join('\\n');
    return q;
  }));
  for (const r of document.querySelectorAll('#theme .presets input')) r.checked = r.value === theme.preset;
  for (const b of document.querySelectorAll('#roles .sw')){
    paint(b, theme[b.dataset.k]);
    b.title = NAMES[b.dataset.k] + ': ' + theme[b.dataset.k];
    b.setAttribute('aria-pressed', String(b.dataset.k === activeKey));
  }
  const v = theme[activeKey], hex = $('pick-hex');
  $('pick-name').textContent = NAMES[activeKey];
  if (document.activeElement !== hex){ hex.value = v; hex.classList.remove('bad'); }
  // Der Farbwähler steht auf der Farbe des Felds (transparent: auf Weiß).
  const c = HEX.test(v) ? v : '#ffffff';
  if (!pickPos || pickPos.hex !== c){
    const [h, s, b] = hexToHsv(c);
    if (s && b) pickHue = h;
    const [, x, y] = fieldMode === 'hsl' ? hexToHsl(c) : [h, s, b];
    pickPos = { x, y: 1 - y, hex: c };
  }
  $('sv').dataset.mode = fieldMode;
  $('sv').style.setProperty('--h', pickHue);
  $('sv-dot').style.left = pickPos.x * 100 + '%'; $('sv-dot').style.top = pickPos.y * 100 + '%';
  $('hue').value = pickHue;
  // Die drei Werte als Zahlen: H in Grad, S und V oder L in Prozent; ein Feld, in dem gerade getippt wird, bleibt.
  $('num3').textContent = fieldMode === 'hsl' ? 'L' : 'V';
  const nums = [pickHue, pickPos.x * 100, (1 - pickPos.y) * 100];
  for (const n of document.querySelectorAll('#nums input')) if (document.activeElement !== n){ n.value = Math.round(nums[n.dataset.i]); n.classList.remove('bad'); }
  for (const b of document.querySelectorAll('#field-mode button')) b.setAttribute('aria-pressed', String(b.dataset.m === fieldMode));
  $('bg-none').checked = theme['bg-fill'] === 'transparent';
  // Die Farben des Themas, je Farbe ein Feld in der Reihenfolge der Tabelle, ohne transparent; beim Darüberfahren, wo sie vorkommt.
  const used = new Map();
  for (const k of KEYS) if (HEX.test(theme[k])) (used.get(theme[k]) || used.set(theme[k], []).get(theme[k])).push(NAMES[k]);
  $('used').replaceChildren(...[...used].map(([c, where]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.style.background = c; b.title = c + '\\n' + where.join('\\n'); b.setAttribute('aria-label', c);
    b.onclick = () => setKey(activeKey, c);
    return b;
  }));
}
(function buildThemeForm(){
  const pre = document.querySelector('#theme .presets');
  for (const [k, c] of [...Object.entries(PRESETS), ['eigene', { name: 'Eigene' }]]){
    const l = document.createElement('label');
    l.innerHTML = '<input type="radio" name="preset" value="' + k + '"> ' + c.name;
    l.querySelector('input').onchange = () => { if (PRESETS[k]){ theme = { ...PRESETS[k], preset: k }; delete theme.name; applyTheme(); } };
    pre.appendChild(l);
  }
  // Eine Tabelle: eine Zeile je Typ, Spalten Füllung, Linie, Schrift; ein Klick auf ein Feld wählt es.
  const grid = $('roles');
  grid.innerHTML = '<span></span>' + Object.values(PROPS).map(([, n]) => '<span class="colh">' + n + '</span>').join('');
  for (const [t, n, ps] of TYPES){
    const name = document.createElement('span');
    name.textContent = n;
    if (t === 'bg'){
      // Transparent: ohne Fläche hinter dem Diagramm; im Werkzeug als Schachbrett, im SVG ohne Hintergrund.
      const l = document.createElement('label');
      l.innerHTML = '<input type="checkbox" id="bg-none"> transparent';
      let before = '#ffffff';
      l.querySelector('input').onchange = e => {
        activeKey = 'bg-fill';
        if (e.target.checked){ if (HEX.test(theme['bg-fill'])) before = theme['bg-fill']; setKey('bg-fill', 'transparent'); }
        else setKey('bg-fill', before);
      };
      name.appendChild(l);
    }
    grid.appendChild(name);
    for (const p of 'fsli'){
      if (!ps.includes(p)){ grid.appendChild(document.createElement('span')); continue; }
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sw'; b.dataset.k = t + '-' + PROPS[p][0];
      b.setAttribute('aria-label', NAMES[b.dataset.k]);
      b.onclick = () => { activeKey = b.dataset.k; syncThemeForm(); };
      grid.appendChild(b);
    }
  }
  const hex = $('pick-hex');
  hex.oninput = () => { let v = hex.value.trim().toLowerCase(); if (v !== 'transparent' && !v.startsWith('#')) v = '#' + v; const ok = valid(activeKey, v); hex.classList.toggle('bad', !ok); if (ok) setKey(activeKey, v); };
  hex.onblur = () => syncThemeForm();
  // Der eigene Farbwähler: die Fläche (HSV oder HSL), darunter der Farbton.
  const sv = $('sv'), clamp = x => Math.min(1, Math.max(0, x));
  const put = (x, y) => { const hex = colorAt(x, y); pickPos = { x, y, hex }; setKey(activeKey, hex); };
  const fromPointer = e => { const r = sv.getBoundingClientRect(); put(clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)); };
  sv.onpointerdown = e => { sv.setPointerCapture(e.pointerId); fromPointer(e); sv.onpointermove = fromPointer; };
  sv.onpointerup = sv.onpointercancel = () => { sv.onpointermove = null; };
  $('hue').oninput = e => { pickHue = +e.target.value; put(pickPos.x, pickPos.y); };
  for (const n of document.querySelectorAll('#nums input')){
    n.oninput = () => {
      const v = n.value.trim() === '' ? NaN : Number(n.value), max = n.dataset.i === '0' ? 360 : 100;
      const ok = Number.isFinite(v) && v >= 0 && v <= max;
      n.classList.toggle('bad', !ok);
      if (!ok) return;
      if (n.dataset.i === '0'){ pickHue = v; put(pickPos.x, pickPos.y); }
      else if (n.dataset.i === '1') put(v / 100, pickPos.y);
      else put(pickPos.x, 1 - v / 100);
    };
    n.onblur = () => syncThemeForm();
  }
  for (const b of document.querySelectorAll('#field-mode button')) b.onclick = () => {
    fieldMode = b.dataset.m; pickPos = null;
    try { localStorage.setItem(FIELD_KEY, fieldMode); } catch {}
    syncThemeForm();
  };
  // Export und Import als .json: die Farben in der Reihenfolge der Tabelle, dazu ihre Namen zum Lesen.
  $('theme-export').onclick = () => {
    const data = { format: 'dokufix-bpmn-assistant-farben', version: 1, vorlage: PRESETS[theme.preset] ? PRESETS[theme.preset].name : 'Eigene',
      farben: Object.fromEntries(KEYS.map(k => [k, theme[k]])), bedeutung: NAMES };
    const a = document.createElement('a');
    a.download = 'diagrammfarben-' + theme.preset + '.json';
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\\n'], { type: 'application/json' }));
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    themeMsg('Exportiert als ' + a.download + '.');
  };
  $('theme-import').onclick = () => $('theme-file').click();
  $('theme-file').onchange = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      let j;
      try { j = JSON.parse(await f.text()); } catch { throw new Error('keine gültige JSON-Datei.'); }
      if (!j || typeof j !== 'object') throw new Error('Keine Farben gefunden.');
      const t = migrate({ ...(j.farben && typeof j.farben === 'object' ? j.farben : j) });
      const known = KEYS.filter(k => typeof t[k] === 'string');
      if (!known.length) throw new Error('Keine Farben gefunden.');
      const bad = known.filter(k => !valid(k, t[k].trim().toLowerCase()));
      if (bad.length) throw new Error('ungültig: ' + bad.map(k => NAMES[k] + ' (' + t[k] + ')').join(', '));
      // Fehlende Farben bleiben, wie sie sind.
      theme = { ...theme, ...Object.fromEntries(known.map(k => [k, t[k].trim().toLowerCase()])) };
      theme.preset = presetOf(theme);
      applyTheme();
      themeMsg(known.length === KEYS.length ? 'Importiert: ' + f.name + '.' : 'Importiert: ' + known.length + ' von ' + KEYS.length + ' Farben aus ' + f.name + ', die übrigen bleiben.');
    } catch (err){ themeMsg('Import fehlgeschlagen: ' + err.message, true); }
  };
  for (const c of PALETTE){
    const b = document.createElement('button');
    b.type = 'button'; b.style.background = c; b.title = c; b.setAttribute('aria-label', c);
    b.onclick = () => setKey(activeKey, c);
    $('palette').appendChild(b);
  }
  $('theme-btn').onclick = () => { themeMsg(''); syncThemeForm(); $('theme').showModal(); };
  $('theme-reset').onclick = () => { theme = { ...PRESETS.gelb, preset: 'gelb' }; delete theme.name; applyTheme(); };
})();
theme = { ...theme }; delete theme.name;
applyTheme();

// Nach dem Import, im Viewer und damit auch in saveSVG(): die Typklassen der
// App, dieselben Klassen an den Labels außerhalb der Form (Ereignisse,
// Gateways, Flüsse), damit die Schrift je Typ gilt, Bahnen deckend gefüllt
// (bpmn-js füllt sie sonst zu 35 % über dem Pool) und der Poolkopf.
function decorate(viewer){
  T.addBpmnTypeClasses(viewer);
  if ($('jumps').checked) T.addLineJumps(viewer.get('canvas').getContainer());
  const registry = viewer.get('elementRegistry');
  registry.forEach(el => {
    const gfx = registry.getGraphics(el);
    if (!gfx) return;
    if (el.type === 'label' && el.labelTarget){ const c = T.bpmnTypeClasses(el.labelTarget.type); if (c.length) gfx.classList.add(...c); }
    // Das Symbol oben links einer Aufgabe: was in der Form außer Rahmen und Schrift oben links liegt (Schleifen- und Mehrfachmarker unten nicht).
    if (/Task$/.test(el.type) && el.type !== 'label'){
      const [frame, ...rest] = gfx.querySelector('.djs-visual').children;
      for (const c of rest) if (c.localName !== 'text'){ const b = c.getBBox(); if (b.y < 30 && b.x < 40) c.classList.add('dokufix-bpmn-icon'); }
    }
    // Das Zeichen in einem Gateway: alles in der Form außer der Raute (X, +, Kreis, Fünfeck, Stern).
    if (/Gateway$/.test(el.type)){
      const [frame, ...rest] = gfx.querySelector('.djs-visual').children;
      for (const c of rest) if (c.localName !== 'text') c.classList.add('dokufix-bpmn-icon');
    }
    // Das Zeichen in einem Ereignis: alles in der Form außer den Ringen (der äußere, bei Zwischenereignissen auch der innere; Radius über drei Viertel des äußeren).
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
  poolHeads(viewer);
}

// Der Poolkopf: bpmn-js zeichnet einen Pool als ein Rechteck mit einer
// Trennlinie 30 px vom Rand. Der Streifen davor bekommt ein eigenes Rechteck
// in --dokufix-bpmn-head, um die halbe Randbreite eingerückt; es liegt unter
// der Trennlinie und der Schrift. Ein zugeklappter Pool hat keine Trennlinie
// und keinen Kopf; er bekommt die Klasse dokufix-bpmn-box (Story 2.29).
function poolHeads(viewer){
  const registry = viewer.get('elementRegistry');
  for (const el of registry.filter(e => e.type === 'bpmn:Participant')){
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
// Das SVG zum Herunterladen mit dem Seitenhintergrund als erstes Rechteck
// über die ganze viewBox; transparent bleibt ohne.
function withBackground(text){
  if (theme['bg-fill'] === 'transparent') return text;
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), svg = doc.documentElement;
  const [x, y, w, h] = String(svg.getAttribute('viewBox') || '').trim().split(/[\\s,]+/).map(Number);
  if (!(w > 0 && h > 0)) return text;
  const r = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  for (const [a, v] of [['x', x], ['y', y], ['width', w], ['height', h], ['fill', theme['bg-fill']]]) r.setAttribute(a, v);
  svg.insertBefore(r, svg.firstChild);
  return '<?xml version="1.0" encoding="UTF-8"?>\\n' + new XMLSerializer().serializeToString(svg) + '\\n';
}
$('llm-dl').href = URL.createObjectURL(new Blob([HANDREICHUNG], { type: 'text/markdown;charset=utf-8' }));
$('llm-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(HANDREICHUNG); }
  catch {
    // Ohne Zugriff auf die Zwischenablage (etwa file:// in manchen Browsern): über ein unsichtbares Feld.
    const t = document.createElement('textarea'); t.value = HANDREICHUNG; t.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
  }
  $('llm-ok').textContent = 'kopiert';
  setTimeout(() => { $('llm-ok').textContent = ''; }, 2000);
};
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const stripDi = xml => xml.replace(/<([\\w.-]+:)?BPMNDiagram\\b[\\s\\S]*?<\\/([\\w.-]+:)?BPMNDiagram>\\s*/g, '');
const hasDi = xml => /<(?:[\\w.-]+:)?BPMNDiagram\\b/.test(xml.replace(/<!--[\\s\\S]*?-->/g, ''));
// Koordinaten hat ein XML, sobald es eine Form trägt; so entscheidet auch die App (hasCoordinates()).
const hasShapes = xml => /<(?:[\\w.-]+:)?BPMNShape\\b/.test(xml.replace(/<!--[\\s\\S]*?-->|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>/g, ''));
let viewers = [], run = 0;
// Der Client des Layouts: ein Worker für die Seite, beim ersten Rendern gemacht. Jedes Rendern bricht das vorige ab,
// auch ein Layout, das noch im Worker läuft.
const LAYOUT = T.makeLayoutClient();
let aborter = null;
// Die Anordnung von bpmn.io ist reine Logik wie A2 (bpmn-moddle, ohne DOM) und braucht bei großen Prozessen ebenso
// lange (hund3: 17 s in Chromium); sie läuft deshalb auch in einem Worker, mit demselben Protokoll und Client, aus dem
// Text ihres Skripts oben (window ist dort self), "ready" nach dem Laden eingeschlossen. Ohne Worker ordnet sie auf der
// Seite an, wie bisher.
function balAnswer(r){
  return { xml: r.xml, warnings: (r.warnings || []).map(w => [w.code, w.message].filter(Boolean).join(': ') || String(w)) };
}
const BAL_HANDLER = 'self.onmessage = async e => { const m = e.data || {}; try { self.postMessage({ id: m.id, ok: true, result: balAnswer(await self.BAL.layoutProcess(String(m.xml))) }); }'
  + ' catch (err){ self.postMessage({ id: m.id, ok: false, error: err && err.message ? String(err.message) : String(err) }); } };'
  // Geladen: gemeldet wie der Worker der App (src/layout-worker.js); ein Worker, der sich nicht meldet, gilt dem Client
  // als nicht gestartet.
  + ' self.postMessage({ ready: true });';
let balUrl = null;
function balWorker(){
  if (typeof Worker !== 'function') throw new Error('the page has no Worker');
  if (!balUrl) balUrl = URL.createObjectURL(new Blob(['var window = self;\\n', $('bpmn-io-js').textContent, '\\n', String(balAnswer), '\\n', BAL_HANDLER], { type: 'text/javascript' }));
  return new Worker(balUrl);
}
const BAL_LAYOUT = T.makeLayoutClient({ makeWorker: balWorker, job: async xml => balAnswer(await window.BAL.layoutProcess(xml)), log: { info: line => console.info('bpmn.io: ' + line) } });

try { const s = localStorage.getItem('bpmn-testtool-xml'); if (s) $('xml').value = s; } catch {}
for (const b of [...BEISPIELE].reverse()){
  const k = document.createElement('button');
  k.innerHTML = ${JSON.stringify(ICON.doc)} + ' '; k.append(b.label); k.title = 'Beispiel laden und rendern: ' + b.label;
  k.onclick = () => { $('xml').value = b.xml; render(); };
  $('ex').after(k);
}
$('go').onclick = () => render();
// Das Feld „Name“ (Ben, 2026-10-07; zuerst der Name der Kollaboration, die nicht jedes XML hat): der Name des Modells,
// das Attribut name von definitions; ohne einen der Ersatz der Downloads (namesOf()) als Platzhalter. Geändert (Enter
// oder das Feld verlassen) steht er im Tag von definitions, leer ohne das Attribut; der Rest des XML bleibt, wie er
// ist, und die Seite rendert neu. Ein Tag in einem Kommentar zählt nicht.
const ROOT_TAG = /<((?:[\\w.-]+:)?)definitions\\b([^>]*?)(\\/?)>/;
function setModelName(xml, name){
  const m = ROOT_TAG.exec(xml.replace(/<!--[\\s\\S]*?-->/g, c => ' '.repeat(c.length)));
  if (!m) return xml;
  let attrs = m[2].replace(/\\s+name\\s*=\\s*("[^"]*"|'[^']*')/, '');
  if (name) attrs += ' name="' + name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') + '"';
  return xml.slice(0, m.index) + '<' + m[1] + 'definitions' + attrs + m[3] + '>' + xml.slice(m.index + m[0].length);
}
function syncName(){
  const n = namesOf($('xml').value);
  $('name').value = n.own;
  $('name').placeholder = n.fallback || 'Diagramm';
}
$('name').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); $('name').blur(); } });
$('name').onchange = () => {
  $('xml').value = setModelName($('xml').value, $('name').value.trim());
  render();
};
$('xml').addEventListener('change', syncName);
syncName();
$('up').onclick = () => $('file').click();
$('file').onchange = async () => {
  const f = $('file').files[0];
  if (!f) return;
  $('xml').value = await f.text();
  $('file').value = '';
  render();
};
$('xml').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); render(); } });
// Das X an zusammenführenden exklusiven Gateways (mergeMarker von appendDiagram(), src/app/bpmn-layout.js): gesetzt wie
// in der App; abgewählt zeichnet A2 solche Gateways als leere Raute. Gemerkt wie die übrigen Einstellungen; eine
// Änderung ordnet neu an wie eine neue Eingabe.
const MERGE_X_KEY = 'bpmn-assistant-merge-x';
try { if (localStorage.getItem(MERGE_X_KEY) === 'aus') $('merge-x').checked = false; } catch {}
$('merge-x').onchange = () => {
  try { localStorage.setItem(MERGE_X_KEY, $('merge-x').checked ? 'an' : 'aus'); } catch {}
  render();
};
// Das Häkchen gilt auch fürs Original (Ben, 2026-10-08), aber nur, wenn jedes exklusive Gateway der Datei
// isMarkerVisible="true" trägt, wie bpmn-js es beim Modellieren an jedes setzt: dann hat der Editor das X geregelt,
// nicht der Autor. Abgewählt verliert ein Merge (gezählt wie in appendDiagram(): mindestens zwei Flüsse hinein,
// höchstens einer hinaus) das Attribut und wird zur leeren Raute, auch im .bpmn-Download und im Modellierer. Fehlt es
// an einem Gateway oder steht dort "false", bleibt die Datei, wie sie ist. Gibt { xml, count } zurück: count Merges
// ohne X.
function mergeMarkerOff(xml, model){
  const gateways = new Set(model.nodes.filter(n => n.tag === 'exclusiveGateway').map(n => n.id));
  const count = (end, id) => model.flows.filter(f => f[end] === id).length;
  const shape = /<(?:[\\w.-]+:)?BPMNShape\\b[^>]*>/g;
  const elementOf = tag => (tag.match(/\\sbpmnElement\\s*=\\s*["']([^"']*)["']/) || [])[1];
  const visible = /\\s+isMarkerVisible\\s*=\\s*["']true["']/;
  const tags = [...xml.matchAll(shape)].map(m => m[0]).filter(t => gateways.has(elementOf(t)));
  if (!tags.length || !tags.every(t => visible.test(t))) return { xml, count: 0 };
  const merges = new Set();
  const out = xml.replace(shape, t => {
    const id = elementOf(t);
    if (!gateways.has(id) || count('to', id) < 2 || count('from', id) > 1) return t;
    merges.add(id);
    return t.replace(visible, '');
  });
  return { xml: out, count: merges.size };
}
// Sprungbögen (src/app/line-jumps.js, Prototyp): gesetzt wie in der App, in Bild und Großansicht; der Modellierer
// zeichnet ohne. Gemerkt wie das Häkchen davor; eine Änderung zeichnet neu.
const JUMPS_KEY = 'bpmn-assistant-sprungboegen';
try { if (localStorage.getItem(JUMPS_KEY) === 'aus') $('jumps').checked = false; } catch {}
$('jumps').onchange = () => {
  try { localStorage.setItem(JUMPS_KEY, $('jumps').checked ? 'an' : 'aus'); } catch {}
  render();
};

// Was jede Ansicht ausmacht, ein Satz unter ihrer Überschrift.
const ABOUT = {
  'Original BPMN': 'Das Diagramm mit den Koordinaten aus der Datei, so wie es gezeichnet wurde.',
  ['bpmn.io (' + ${JSON.stringify(BAL_VERSION)} + ')']: 'Zum Vergleich die Anordnung der Bibliothek bpmn-auto-layout von bpmn.io in der Vorabversion ' + ${JSON.stringify(BAL_VERSION)} + ', unverändert in diese Seite eingebettet: sie liest das XML selbst und setzt Pools, Bahnen, Nachrichtenflüsse und Black Boxes nach eigenen Regeln. Brüche zählt dieselbe Regelprüfung wie bei A2.',
  A2: 'Die Anordnung von dokufix (A2): ein eigener Router auf einem Raster aus Zeilen und Spalten; Gateways und Blöcke zentriert, Zweige einer Entscheidung in eigenen Zeilen, Starts links bündig, Enden rechts, Proben gegen Kreuzungen, Knicke und geteilte Ports; mehrere Pools untereinander, Nachrichtenflüsse senkrecht zwischen ihnen.',
};
function section(title){
  const s = document.createElement('section');
  s.innerHTML = '<h2>' + esc(title) + ' <small></small></h2>' + (ABOUT[title] ? '<p class="about">' + esc(ABOUT[title]) + '</p>' : '');
  $('out').appendChild(s);
  return s;
}
function error(s, msg){ const d = document.createElement('div'); d.className = 'err'; d.textContent = msg; s.appendChild(d); }

// Zuerst ein Bild (SVG, so breit wie die Seite, nie größer als gezeichnet);
// ein Klick darauf öffnet es über dem ganzen Fenster im Viewer, wie die
// Großansicht von dokufix: Titel, „Einpassen“, „Schließen“; Mausrad zoomt,
// Ziehen verschiebt, + und - zoomen, Escape schließt.
// Der Name einer heruntergeladenen .bpmn oder .svg (Ben, 2026-10-07): der Name des Modells und die Zeit des Klicks,
// „Urlaubsantrag_2026-10-07_19-15-02“. Der Name des Modells ist das Attribut name von definitions, der Wurzel, die
// jede BPMN-Datei hat, mit Pools oder ohne; ohne ihn der Name der Kollaboration, dann der des ersten Prozesses, dann
// die Namen der Pools, höchstens drei, mit „-“, dann „Diagramm“; Ids nicht, die sind meist „Collaboration_1“.
// Wie in dokufix gesäubert (diagramFileName()).
// namesOf(): { own, fallback }: der Name von definitions und der Ersatz, wenn es keinen trägt.
function namesOf(xml){
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const named = tag => [...doc.getElementsByTagNameNS('*', tag)].map(el => (el.getAttribute('name') || '').trim()).filter(Boolean);
  return { own: named('definitions')[0] || '', fallback: named('collaboration')[0] || named('process')[0] || named('participant').slice(0, 3).join('-') };
}
function fileBase(xml){
  const n = namesOf(xml), name = n.own || n.fallback;
  const d = new Date(), two = n => String(n).padStart(2, '0');
  return T.diagramFileName(name || 'Diagramm') + '_' + d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + '_' + two(d.getHours()) + '-' + two(d.getMinutes()) + '-' + two(d.getSeconds());
}
async function draw(s, xml, name){
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
  pic.onclick = () => openLarge(s.querySelector('h2').firstChild.textContent.trim(), xml);
  const a = document.createElement('a');
  a.className = 'btn small'; a.download = name + '.bpmn'; a.innerHTML = ${JSON.stringify(ICON.download)} + ' .bpmn'; a.title = 'Diagramm als .bpmn herunterladen';
  a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
  a.onclick = () => { a.download = fileBase(xml) + '.bpmn'; };
  // Das Bild wie in dokufix (pictureOf()): die Farben der Dokumentstile fest eingesetzt, beim Klick aus dem Bild gemacht.
  const v = document.createElement('a');
  v.className = 'btn small'; v.download = name + '.svg'; v.innerHTML = ${JSON.stringify(ICON.download)} + ' .svg'; v.title = 'Diagramm als .svg herunterladen'; v.href = '#';
  v.onclick = () => { v.download = fileBase(xml) + '.svg'; v.href = URL.createObjectURL(new Blob([withBackground(T.pictureOf(pic.querySelector('svg')))], { type: 'image/svg+xml' })); };
  const dl = document.createElement('span');
  dl.className = 'dls'; dl.append(a, v);
  const ed = document.createElement('button');
  ed.className = 'small'; ed.innerHTML = ${JSON.stringify(ICON.pencil)} + ' Im Modellierer bearbeiten';
  ed.onclick = () => openModeler(s.querySelector('h2').firstChild.textContent.trim(), xml);
  s.querySelector('h2').append(dl, ed);
}

// Behelf nur im Testwerkzeug (Ben, 2026-10-05): eine Assoziation zwischen
// zwei Flussknoten (etwa Signal-Wurf → Signal-Fang), die keine Variante
// anordnet, als Gerade quer von Rand zu Rand, nach dem Anordnen in die XML
// geschrieben. Ereignisse als Kreis, Gateways als Raute, sonst Rechteck.
function signalLines(xml, model){
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const nodes = new Map(model.nodes.map(n => [n.id, n]));
  const shapes = {};
  for (const m of xml.matchAll(/<bpmndi:BPMNShape\\b[^>]*bpmnElement="([^"]*)"[^>]*>\\s*<dc:Bounds x="([-\\d.]+)" y="([-\\d.]+)" width="([-\\d.]+)" height="([-\\d.]+)"/g))
    shapes[m[1]] = { x: +m[2], y: +m[3], w: +m[4], h: +m[5] };
  const edge = (from, to) => {
    const c = s => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });
    const a = c(shapes[from]), b = c(shapes[to]);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    // Abstand von der Mitte bis zum Rand in Richtung (dx, dy).
    const reach = (id, dx, dy) => {
      const s = shapes[id], t = nodes.get(id).type, rw = s.w / 2, rh = s.h / 2;
      if (t === 'event') return rw;
      if (t === 'gateway') return 1 / (Math.abs(dx) / rw + Math.abs(dy) / rh);
      return Math.min(dx ? rw / Math.abs(dx) : Infinity, dy ? rh / Math.abs(dy) : Infinity);
    };
    const ra = reach(from, ux, uy), rb = reach(to, -ux, -uy);
    return [[a.x + ux * ra, a.y + uy * ra], [b.x - ux * rb, b.y - uy * rb]].map(([x, y]) => [Math.round(x), Math.round(y)]);
  };
  const add = [];
  for (const el of doc.getElementsByTagNameNS('*', 'association')){
    const id = el.getAttribute('id'), from = el.getAttribute('sourceRef'), to = el.getAttribute('targetRef');
    if (!id || !nodes.has(from) || !nodes.has(to) || !shapes[from] || !shapes[to]) continue;
    add.push('<bpmndi:BPMNEdge id="' + id + '_di" bpmnElement="' + id + '">' + edge(from, to).map(([x, y]) => '<di:waypoint x="' + x + '" y="' + y + '"/>').join('') + '</bpmndi:BPMNEdge>');
  }
  return { xml: add.length ? xml.replace('</bpmndi:BPMNPlane>', add.join('') + '</bpmndi:BPMNPlane>') : xml, count: add.length };
}

// Der Modellierer (bpmn-js Modeler 18.31.0, dieselbe Version wie der Viewer, in
// der Seite in den Blöcken #bpmn-modeler-js und #bpmn-modeler-css): erst beim
// ersten Öffnen ausgeführt. Sein Skript setzt wie das des Viewers window.BpmnJS;
// der Viewer wird danach wieder eingesetzt, der Modeler bleibt unter eigenem
// Namen. Über dem ganzen Fenster, in den Standardfarben von bpmn-js.
let Modeler = null, modeler = null;
function loadModeler(){
  if (Modeler) return Promise.resolve(Modeler);
  const Viewer = window.BpmnJS;
  const css = document.createElement('style'); css.textContent = $('bpmn-modeler-css').textContent; document.head.appendChild(css);
  const sc = document.createElement('script'); sc.textContent = $('bpmn-modeler-js').textContent;
  // Ein eingefügtes Skript läuft sofort; einen Fehler meldet es der Seite, nicht hier: dann ist BpmnJS noch der Viewer.
  try { document.head.appendChild(sc); }
  finally { if (window.BpmnJS !== Viewer) Modeler = window.BpmnJS; window.BpmnJS = Viewer; }
  return Modeler ? Promise.resolve(Modeler) : Promise.reject(new Error('Der Modellierer konnte nicht geladen werden.'));
}
async function openModeler(title, xml){
  closeModeler(true);
  const box = document.createElement('div');
  box.id = 'modeler';
  box.innerHTML = '<div class="mbar"><strong></strong><span class="hint">Elemente aus der Leiste links ziehen, verbinden, doppelklicken zum Beschriften; Strg+Z macht rückgängig.</span>'
    + '<button class="primary take">${ICON.play} Als Original übernehmen</button><button class="dl">${ICON.download} als .bpmn herunterladen</button><button class="close">Schließen</button></div><div class="mcanvas"></div>';
  box.querySelector('strong').textContent = 'Modellierer: ' + title;
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
    $('xml').value = x;
    closeModeler(true);
    render();
    window.scrollTo({ top: 0 });
  };
  box.querySelector('.dl').onclick = async () => {
    const a = document.createElement('a');
    const x = await current();
    a.download = fileBase(x) + '.bpmn';
    a.href = URL.createObjectURL(new Blob([x], { type: 'application/xml' }));
    a.click();
  };
}
// force: ohne Rückfrage (übernommen oder neu geöffnet).
function closeModeler(force){
  if (!modeler) return;
  if (!force && modeler.dirty && !window.confirm('Ihre Änderungen im Modellierer gehen verloren. Trotzdem schließen?')) return;
  try { modeler.m && modeler.m.destroy(); } catch {}
  modeler.box.remove(); modeler = null;
  document.documentElement.style.overflow = '';
}

let large = null;
async function openLarge(title, xml){
  closeLarge();
  const box = document.createElement('div');
  box.id = 'large';
  box.innerHTML = '<div class="lbar"><strong></strong><span class="hint">Strg+Mausrad zoomt, Mausrad und Ziehen verschieben, + und - wechseln die Stufe, Escape schließt</span><span class="steps"><button data-z="fit">Einpassen</button><button data-z="1">100 %</button><button data-z="1.5">150 %</button><button data-z="2">200 %</button></span><button class="edit">${ICON.pencil} Bearbeiten</button><button class="close">Schließen</button></div><div class="dokufix-doc lwrap"><div class="dokufix-diagram dokufix-diagram-bpmn lcanvas"></div></div>';
  box.querySelector('strong').textContent = title;
  document.body.appendChild(box);
  document.documentElement.style.overflow = 'hidden';
  const viewer = new BpmnJS({ container: box.querySelector('.lcanvas'), ...T.BPMN_VIEWER_CONFIG });
  large = { box, viewer };
  box.querySelector('.close').onclick = closeLarge;
  box.querySelector('.edit').onclick = () => { closeLarge(); openModeler(title, xml); };
  for (const b of box.querySelectorAll('.steps button')) b.onclick = () => step(b.dataset.z);
  try {
    await viewer.importXML(xml);
    decorate(viewer);
    step('fit');
    // Die Stufe, auf der die Ansicht steht, ist gedrückt; nach Mausrad keine.
    viewer.on('canvas.viewbox.changed', () => mark());
  } catch (e){ closeLarge(); alert(e.message); }
}
// Die Stufen der Großansicht von dokufix: Einpassen, 100, 150, 200 %.
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
  if (!large || $('theme').open || modeler) return;
  if (e.key === 'Escape'){ e.preventDefault(); closeLarge(); }
  else if (e.key === '+' || e.key === '-'){
    e.preventDefault();
    // Wie dokufix: + die nächste Stufe, - die vorige; nach freiem Zoomen von der Stufe, die dem Zoom am nächsten liegt.
    let i = STEPS.indexOf(large.step);
    if (i < 0){ const z = large.viewer.get('canvas').zoom(); i = z < 1 ? 0 : z < 1.25 ? 1 : z < 1.75 ? 2 : 3; }
    step(STEPS[Math.max(0, Math.min(STEPS.length - 1, i + (e.key === '+' ? 1 : -1)))]);
  }
});

async function render(){
  const my = ++run;
  if (aborter) aborter.abort();
  const signal = (aborter = new AbortController()).signal;
  closeLarge();
  for (const v of viewers) try { v.destroy(); } catch {}
  viewers = [];
  $('out').replaceChildren();
  const input = $('xml').value.trim();
  syncName();
  try { localStorage.setItem('bpmn-testtool-xml', input); } catch {}
  if (!input){ error(section('Eingabe'), 'Kein XML.'); return; }
  const xml = hasDi(input) ? stripDi(input) : input;
  // Mit dem Leser des Layouts (src/app/xml-parser.js), wie layoutJob() in der App (src/app/bpmn-layout-job.js), nicht mit
  // dem DOMParser der Seite.
  let doc;
  try { doc = T.parseXml(xml); } catch (e){ error(section('Eingabe'), 'Das XML ist nicht lesbar:\\n' + e.message); return; }
  // Vor dem Original gelesen, denn das Häkchen zum X zählt die Flüsse im Modell; der Fehler erst nach dem Original.
  let read, readError;
  try {
    read = T.a2.readProcess(doc);
    if (!read) throw new Error('Keine BPMN-Definitionen (das Wurzelelement ist nicht definitions).');
    // Die Spalten gibt LMM, die Beschriftungen misst das Layout selbst (measureLabel(), wie in der App): weder Mermaid
    // noch ein Viewer zum Messen.
  } catch (e){ readError = e; }
  // Zuerst das Original, wenn die Datei eigene Koordinaten hat: so gezeichnet, in der gewählten Palette; sonst kein
  // Abschnitt (Ben, 2026-10-06: „nur noch Original (falls vorhanden) und A2“).
  if (hasShapes(input)){
    const orig = section('Original BPMN');
    const own = read && !$('merge-x').checked ? mergeMarkerOff(input, read.model) : { xml: input, count: 0 };
    if (own.count) orig.querySelector('small').textContent = own.count + (own.count === 1 ? ' zusammenführendes Gateway' : ' zusammenführende Gateways') + ' ohne X';
    try { await draw(orig, own.xml, 'original'); } catch (e){ error(orig, (e && e.message) || String(e)); }
  }
  if (my !== run) return;
  if (readError){ error(section('Eingabe'), readError.message || String(readError)); return; }
  if (read.leftOut.length){
    const d = document.createElement('details');
    d.innerHTML = '<summary>' + read.leftOut.length + ' Elemente nicht angeordnet (wie in der App)</summary>' + read.leftOut.map(l => esc(l.tag + ' ' + (l.id || '') + ': ' + l.reason)).join('<br>');
    $('out').appendChild(d);
  }
  // A2, ein Abschnitt und keine Schleife über Varianten: der Worker der App ordnet nur A2 an, eine zweite Variante
  // bekäme dort still A2s Bild.
  {
    const name = 'A2', s = section(name);
    // Im Worker, wie in der App (layoutJob() in src/app/bpmn-layout-job.js): das Modell in LMMs Ordnung mit seinen
    // Spalten fürs Raster, das des Autors für den Diagrammteil. Solange er rechnet, zählt der Hinweis die Sekunden, und
    // die Seite bleibt bedienbar; nach 120 s gibt der Client auf, mit dem Grund an Stelle des Diagramms.
    const wait = document.createElement('div');
    s.appendChild(wait);
    const notice = T.showLayoutNotice(wait);
    let laid = null, ms;
    try {
      const t0 = performance.now();
      laid = await LAYOUT.layout(xml, { signal, options: { mergeMarker: $('merge-x').checked } });
      ms = performance.now() - t0;
    } catch (e){
      // Abgebrochen von einem neueren Rendern: dessen Abschnitte stehen schon da.
      if (my !== run) return;
      error(s, (e && e.message) || String(e));
    } finally { notice.stop(); wait.remove(); }
    if (my !== run) return;
    // Abgelehnt (der Grund steht im Abschnitt): weiter mit bpmn.io.
    if (laid) try {
      // Das Modell des Autors, auf der Seite gelesen (read oben), für die Behelfslinien und die Regelprüfung.
      const sig = signalLines(laid.xml, read.model);
      let info = Math.round(ms) + ' ms' + (LAYOUT.withoutWorker() ? ' (ohne Worker)' : ' im Worker') + (sig.count ? ' · ' + sig.count + ' Assoziationen zwischen Flussknoten als Gerade (Behelf)' : '');
      try {
        // Gateways und End-Ereignisse dürfen in jeder Bahn liegen (wie splitBreaks() im Lauf; A2 setzt auch Enden um).
        const breaks = T.breaksOf(laid.xml, read.model, {}).filter(b => !(b.startsWith('node-outside-lane ') && read.model.nodes.some(n => (n.type === 'gateway' || n.tag === 'endEvent') && n.id === b.split(' ')[1])));
        info = breaks.length + ' Brüche · ' + info;
        if (breaks.length){ const d = document.createElement('details'); d.innerHTML = '<summary>Brüche</summary>' + breaks.map(esc).join('<br>'); s.appendChild(d); }
      } catch (e){ info += ' · Regelprüfung: ' + e.message; }
      s.querySelector('small').textContent = info;
      await draw(s, sig.xml, name);
    } catch (e){ error(s, (e && e.stack) || String(e)); }
    if (my !== run) return;
  }
  // Die Anordnung von bpmn.io (Ben, 2026-10-06), unter A2; die Brüche mit dem Modell, das dokufix liest.
  const title = 'bpmn.io (' + ${JSON.stringify(BAL_VERSION)} + ')', s = section(title);
  const wait = document.createElement('div');
  s.appendChild(wait);
  const notice = T.showLayoutNotice(wait);
  let res, ms;
  try {
    const t0 = performance.now();
    // layoutProcess() gibt { xml, warnings } zurück; die Warnungen der Bibliothek stehen unter dem Bild.
    res = await BAL_LAYOUT.layout(xml, { signal });
    ms = performance.now() - t0;
  } catch (e){
    if (my === run) error(s, (e && e.message) || String(e));
    return;
  } finally { notice.stop(); wait.remove(); }
  if (my !== run) return;
  try {
    const out = res.xml, warn = res.warnings;
    let info = Math.round(ms) + ' ms' + (BAL_LAYOUT.withoutWorker() ? ' (ohne Worker)' : ' im Worker') + (warn.length ? ' · ' + warn.length + ' Warnungen' : '');
    if (warn.length){ const d = document.createElement('details'); d.innerHTML = '<summary>Warnungen von bpmn.io</summary>' + warn.map(esc).join('<br>'); s.appendChild(d); }
    try {
      // Die Regelprüfung liest das DI in der Form, die dokufix schreibt: ein Element je Zeile, ohne Leerraum vor />.
      const flat = out.replace(/>\\s+</g, '><').replace(/\\s+\\/>/g, '/>');
      const breaks = T.breaksOf(flat, read.model, {}).filter(b => !(b.startsWith('node-outside-lane ') && read.model.nodes.some(n => (n.type === 'gateway' || n.tag === 'endEvent') && n.id === b.split(' ')[1])));
      info = breaks.length + ' Brüche · ' + info;
      if (breaks.length){ const d = document.createElement('details'); d.innerHTML = '<summary>Brüche</summary>' + breaks.map(esc).join('<br>'); s.appendChild(d); }
    } catch (e){ info += ' · Regelprüfung: ' + e.message; }
    if (my !== run) return;
    s.querySelector('small').textContent = info;
    await draw(s, out, 'bpmn-io');
  } catch (e){ error(s, (e && e.message) || String(e)); }
}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(REPO, 'dist/bpmn-assistant.html'), html);
console.log('dist/bpmn-assistant.html', html.length, 'B');
