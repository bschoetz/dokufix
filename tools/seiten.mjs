// Der gemeinsame Seitenbauer der BPMN-Werkzeuge (Story 2.38): der BPMN Assistant (tools/bpmn-assistant/bauen.mjs),
// der Layouter Audi (tools/bpmn-assistant/audi.mjs) und die Layout-Werkbank (tools/werkbank/bauen.mjs). Jede Seite hat
// unter src/ ein index.html mit Slots, ein Stylesheet und einen Einstieg ihres Skripts; das Geteilte liegt in
// src/bpmn-tools/. buildPage() bündelt den Einstieg und den Worker des Layouts mit demselben esbuild-Weg wie die App
// (bundleScript(), minifyCss() aus build.mjs), liest bpmn-js aus tools/bpmn-assistant/vendor/ und die Dokumentstile
// aus src/doc.css und füllt die Slots der Vorlage. Er schreibt nichts; das tut das Bauskript der Seite.
//
// Nicht build(): das ist an src/index.html und seine sieben Slots gebunden, und dist/dokufix.html bleibt so Byte für
// Byte, was es war (npm run check).
//
// Die Vorlage nennt jeden Slot höchstens einmal als {{slot:<name>}}; die Slots, die buildPage() selbst kennt und nur
// baut, wo die Vorlage sie nennt (einer, den sie nicht nennt, ist kein Fehler):
//
//   {{slot:favicon}}          das Favicon als data:-URL, aus favicon (ein SVG)
//   {{slot:bpmn-viewer.css}}  das Stylesheet des Viewers von bpmn-js, davor der Text der bpmn.io License
//   {{slot:bpmn-viewer.js}}   der Viewer von bpmn-js (setzt window.BpmnJS), davor derselbe Text
//   {{slot:bpmn-modeler.js}}  der Modellierer, für einen Block <script type="text/plain">, ausgeführt erst beim
//   {{slot:bpmn-modeler.css}} ersten Öffnen (src/bpmn-tools/modeler.js), und seine zwei Stylesheets
//   {{slot:doc.css}}          die Dokumentstile von dokufix (src/doc.css), minifiziert
//   {{slot:layout.js}}        der Worker des Layouts (src/layout-worker.js), gebündelt und minifiziert, für den Block
//                             #dokufix-layout-js, wie die App ihn trägt; davor als Kommentar die Hinweise auf das,
//                             was er von anderen trägt (layoutNotice())
//   {{slot:page.css}}         das Stylesheet der Seite (css), minifiziert
//   {{slot:page.js}}          ihr Skript: der Einstieg (entry) mit dem, was er importiert, ein IIFE, minifiziert, davor
//                             notice als Kommentar
//
// dazu die der Seite (parts: Name → { json } für einen Datenblock, { script } für einen Text, der in einem
// <script> steht, { text } für Markup). {{icon:<name>}} wird zum Symbol ICON[name] aus src/bpmn-tools/icons.js.
//
// Was buildPage() prüft, nach dem Vorbild von assemble() in build.mjs, aber nicht dasselbe: ein Slot, der doppelt
// steht oder unbekannt ist, ein Teil der Seite (parts), dessen Slot die Vorlage nicht nennt → Fehler. Was es selbst
// baut: das Skript der Seite und der Worker mit "</script" oder "<!--" (bundleScript() schreibt "<!--" als
// "\x3c!--"), das Stylesheet der Seite und doc.css mit "</style" → Fehler; ein Datenblock ({ json }) schreibt jedes
// "<" als \u003c (jsonForDataBlock()); ein { script } wird nach seinem ersten Kommentar auf "</script" und "<!--"
// geprüft. Ein { text } geht ungeprüft in die Seite: Markup oder Text, für den der Aufrufer einsteht (etwa die Farben
// des Audi in einem <style>, die tools/bpmn-assistant/audi.mjs selbst erzeugt). Fremder Code (bpmn-js,
// bpmn-auto-layout, vendorFile()) darf kein Tag script oder style öffnen oder schließen; ein "<!--" ohne "<script"
// dahinter schadet dort nicht, und der Viewer von bpmn-js hat eines.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundleScript, minifyCss, jsonForDataBlock, BuildError } from '../build.mjs';
import { NOTICES, LICENCE_TEXTS } from '../src/app/licences.js';
import { ICON } from '../src/bpmn-tools/icons.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.join(HERE, '..');
const SRC = path.join(REPO, 'src');
export const VENDOR = path.join(REPO, 'tools/bpmn-assistant/vendor');
const BPMN_JS = path.join(VENDOR, 'bpmn-js');

const SLOT_RE = /\{\{slot:([^{}]*)\}\}/g;
const ICON_RE = /\{\{icon:([^{}]*)\}\}/g;

// Ein Kommentar über fremdem Code; "*/" im Text beendet ihn nicht.
export const comment = text => '/*\n' + text.replace(/\*\//g, '* /') + '\n*/\n';

// Eine Datei des Pakets fremden Codes: kein Tag script oder style darf darin stehen.
export function vendorFile(file){
  const text = fs.readFileSync(file, 'utf8');
  if (/<\/?(script|style)/i.test(text)) throw new BuildError(path.relative(REPO, file) + ' enthält ein Tag script oder style');
  return text;
}
const bpmnJs = name => vendorFile(path.join(BPMN_JS, name));

// Der Text der bpmn.io License aus der Lizenzliste des Produkts (src/app/licences.js); das Logo, das sie verlangt,
// zeichnen Viewer und Modellierer selbst.
export function bpmnJsNotice(){
  const e = NOTICES.find(n => n.package === 'bpmn-js');
  return [e.name + ' ' + e.version, ...e.copyright, LICENCE_TEXTS[e.licence].title, ...LICENCE_TEXTS[e.licence].paragraphs].join('\n\n');
}
// Was ein Bündel mit dem Layout von anderen trägt: der Nachbau des Textlayouts von diagram-js (src/app/label-size.js)
// und der Nachbau der Schichtung aus dem Swimlane-Layout von Mermaid (src/app/lmm.js), beide MIT, mit den Hinweisen,
// wie sie die Lizenzliste des Produkts führt; die wenigen Konstanten und Formeln aus dem Textrenderer von bpmn-js
// stehen unter dessen Lizenz. Kommentare des Quelltexts fallen beim Bündeln weg, deshalb steht der Hinweis vor ihm.
export function layoutNotice(){
  const djs = NOTICES.find(n => n.package === 'diagram-js');
  const lmm = NOTICES.find(n => n.package === 'mermaid' && n.use === 'embedded');
  return ['In diesem Skript steckt ein Nachbau des Textlayouts von ' + djs.name + ' ' + djs.version +
    ' (src/app/label-size.js von dokufix, lib/util/Text.js von diagram-js), dazu wenige Konstanten und Formeln des Textrenderers von bpmn-js 18.31.0 (bpmn.io License, Copyright (c) 2014-present Camunda Services GmbH),' +
    ' und LMM (src/app/lmm.js von dokufix), ein Nachbau der Schichtung aus ' + lmm.name + ' ' + lmm.version + ' (src/rendering-util/layout-algorithms/swimlanes/ von Mermaid).',
    djs.name + ' ' + djs.version, ...djs.copyright, lmm.name + ' ' + lmm.version, ...lmm.copyright, LICENCE_TEXTS[djs.licence].title, ...LICENCE_TEXTS[djs.licence].paragraphs].join('\n\n');
}

// Was die Regelprüfung (tests/bpmn-rules.mjs) aus Node braucht, gibt es im Browser nicht; breaksOf() braucht es nicht.
export const NODE_STUBS = {
  name: 'stubs',
  setup(b){
    b.onResolve({ filter: /^node:|bpmn-fixtures\.mjs$/ }, a => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'const j = (...a) => a.join("/"); const P = { join: j, resolve: j, dirname: s => String(s), basename: s => String(s), relative: () => "" }; export default P; export const join = j, resolve = j, dirname = P.dirname, basename = P.basename, existsSync = () => false, readFileSync = () => "", writeFileSync = () => {}, FIXTURE_DIR = "", fixtureNames = () => [], readFixture = () => null, readModel = () => null, expectedFile = () => "", fileURLToPath = () => "", pathToFileURL = () => "";', loader: 'js' }));
  },
};

const scriptProblems = (name, text) => [
  ...(/<\/script/i.test(text) ? [name + ' enthält "</script"; es beendete das Element zu früh'] : []),
  ...(text.includes('<!--') ? [name + ' enthält "<!--"; mit einem "<script" dahinter endete das Element nicht'] : []),
];

// Die Seite als Text. template: das index.html; entry: der Einstieg des Skripts; css: das Stylesheet der Seite;
// favicon: ein SVG; notice: der Kommentar vor dem Skript; plugins: esbuild-Plugins fürs Skript (NODE_STUBS);
// parts: die Slots der Seite.
export async function buildPage({ template, entry, css, favicon, notice = '', plugins = [], parts = {} }){
  const html = fs.readFileSync(template, 'utf8');
  const found = [...html.matchAll(SLOT_RE)].map(m => m[1]);
  const problems = [];
  for (const name of new Set(found)){
    const n = found.filter(f => f === name).length;
    if (n > 1) problems.push('Slot {{slot:' + name + '}} steht ' + n + '-mal in ' + path.relative(REPO, template) + ', erwartet einmal');
  }
  // Jeder Slot, den die Vorlage nennt, als Funktion, die seinen Text gibt; nur die genannten werden gebaut.
  const known = {
    'favicon': () => 'data:image/svg+xml,' + encodeURIComponent(fs.readFileSync(favicon, 'utf8').trim()),
    'bpmn-viewer.css': () => comment(bpmnJsNotice()) + bpmnJs('diagram-js.css'),
    'bpmn-viewer.js': () => comment(bpmnJsNotice()) + bpmnJs('bpmn-navigated-viewer.production.min.js'),
    'bpmn-modeler.js': () => bpmnJs('bpmn-modeler.production.min.js'),
    'bpmn-modeler.css': () => bpmnJs('bpmn-js.css') + '\n' + bpmnJs('bpmn-embedded.css'),
    'doc.css': async () => { const t = await minifyCss(fs.readFileSync(path.join(SRC, 'doc.css'), 'utf8'), 'doc.css', false); if (/<\/style/i.test(t)) problems.push('doc.css enthält "</style"'); return t; },
    'layout.js': async () => { const t = await bundleScript(path.join(SRC, 'layout-worker.js'), false, null); problems.push(...scriptProblems('der Worker des Layouts', t)); return comment(layoutNotice()) + t; },
    'page.css': async () => { const t = await minifyCss(fs.readFileSync(css, 'utf8'), path.basename(css), false); if (/<\/style/i.test(t)) problems.push(path.basename(css) + ' enthält "</style"'); return t; },
    'page.js': async () => { const t = await bundleScript(entry, false, null, {}, plugins); problems.push(...scriptProblems('das Skript der Seite', t)); return (notice ? comment(notice) : '') + t; },
  };
  for (const [name, part] of Object.entries(parts)){
    if (known[name]) problems.push('Slot ' + name + ' kennt buildPage() selbst');
    else if ('json' in part) known[name] = () => jsonForDataBlock(part.json);
    else if ('script' in part) known[name] = () => { problems.push(...scriptProblems('Slot ' + name, part.script.replace(/^\/\*[\s\S]*?\*\/\n?/, ''))); return part.script; };
    else known[name] = () => part.text;
    if (!found.includes(name)) problems.push('Slot {{slot:' + name + '}} fehlt in ' + path.relative(REPO, template));
  }
  for (const name of new Set(found)) if (!known[name]) problems.push('unbekannter Slot {{slot:' + name + '}} in ' + path.relative(REPO, template));
  for (const m of html.matchAll(ICON_RE)) if (!ICON[m[1]]) problems.push('unbekanntes Symbol {{icon:' + m[1] + '}}; die Symbole sind ' + Object.keys(ICON).join(', '));
  if (problems.length) throw new BuildError(problems.join('\n'));
  const filled = {};
  try {
    for (const name of new Set(found)) filled[name] = await known[name]();
  } catch (e){
    if (!e || !Array.isArray(e.errors)) throw e;
    throw new BuildError(e.errors.map(x => (x.location ? x.location.file + ':' + x.location.line + ':' + x.location.column + ': ' : '') + x.text).join('\n'));
  }
  if (problems.length) throw new BuildError(problems.join('\n'));
  // Erst die Symbole, im Markup der Vorlage, dann die Slots; eine Funktion als Ersatz, damit "$&" in einem Text Text
  // bleibt.
  return html.replace(ICON_RE, (m, name) => ICON[name]).replace(SLOT_RE, (m, name) => filled[name]);
}

// Schreibt eine gebaute Seite nach dist/ und sagt, wie groß sie ist.
export function writePage(file, html){
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  console.log(path.relative(process.cwd(), file) + ' ' + Buffer.byteLength(html).toLocaleString('en-US').replace(/,/g, ' ') + ' B');
}
// Ob das Modul als Befehl läuft, nicht importiert (wie in build.mjs).
export const runAsCommand = url => !!process.argv[1] && fs.existsSync(process.argv[1]) && url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
