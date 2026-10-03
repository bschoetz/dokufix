// Browser run for what a render and an export do when something fails, when two
// renders meet, and when the page holds an element that is not the document.
//
//   node tests/durchlaeufe.mjs
//
// Options
//   --file <file>      the file under test (default: ../dist/dokufix.html)
//   --browser <name>   chromium | firefox | all (default: all)
//   --out <dir>        where exports and saved files go (default: out/durchlaeufe, emptied first)
//
// Why this exists. tests/vergleich.mjs shows that a valid document looks as it
// did. It says nothing about a document that is not valid, or about a pass that
// breaks: before story 2.15 a pass that threw stopped every step after it and
// left half a preview without a word, and a Mermaid block with an error shipped
// Mermaid's error picture into every export. This run is the check for the
// other side: every failure ends as a warning in the document, the rest of the
// document renders, the rail is rebuilt, and the warning travels.
//
// What it does, per browser, on the file under test:
//
//   1. a diagram with an error   one Mermaid block with a syntax error between
//                                two valid ones: that block is a warning with
//                                Mermaid's message, the other two are drawn,
//                                no error picture and nothing of Mermaid's
//                                outside the preview; then all four downloads,
//                                reopened: the warning is in each, styled
//   2. overlapping renders       a second render is requested while the first
//                                is in its passes: they run one after the
//                                other, and the preview ends as the second's
//   3. a transient element       elements marked data-dokufix-transient in
//                                <head>, in <body> and inside the interface:
//                                none is in the saved "Mit Editor" file. The
//                                link "license information" is such an element,
//                                twice; its views are open while the files are
//                                written: the saved file has neither, and each
//                                read-only export carries the element it writes
//                                itself, once and closed
//   4. Markdown cannot be parsed marked is made to throw: the warning is
//                                all the preview holds, the rail is rebuilt and
//                                empty; then the three read-only exports
//   7. a broken marker           one block marker with a misspelt name among
//                                working ones: it is a warning at its place and
//                                its list stays a list, the cards and the step
//                                list around it are built, no pass failed and
//                                nothing is on the console; then all four
//                                downloads, reopened: the same in each
//   8. a facet filter            a facet marker that cannot act beside one that
//                                can: the first is a warning at its place and
//                                its table stays a table in its wrapper, the
//                                second filters. A value is chosen in the page
//                                while each of the four files is written: every
//                                file opens with all rows and the control for
//                                all rows chosen, and filters there. A third
//                                filter stands in a footnote: the preview of
//                                that footnote holds none of its controls
//   9. a free-text filter        a "filter" marker that cannot act beside one
//                                that can: the first is a warning at its place,
//                                the second gives its table a field that
//                                filters. A term is typed in the page while
//                                each of the four files is written: every file
//                                opens with all rows; nur-lesen has no field and
//                                no mark of the filter; schlank, kompakt and
//                                "Mit Editor" open with an empty field that
//                                filters. A
//                                third filter stands in a footnote: its table
//                                gets a field in the list of footnotes, and the
//                                preview of that footnote holds none
//  10. a BPMN block that cannot  a block of broken XML beside a valid one: it is
//      be drawn                  a warning naming its title and the reason, the
//                                valid one is drawn with its credit, nothing of
//                                the drawing is left in <body>; then all four
//                                downloads, reopened: the same in each, and no
//                                read-only file carries anything of bpmn-js
//  11. bpmn-js cannot be loaded  the page's request for the library fails: each
//                                BPMN diagram is the warning that says so, and
//                                the rest of the document renders, Mermaid
//                                included; the three read-only downloads too
//  12. BPMN without coordinates  a block laid out by dokufix beside two it
//                                cannot lay out (several pools, a node in no
//                                lane): the first is drawn with its credit, the
//                                other two are warnings naming the reason;
//                                nothing of the drawing or the layout is left in
//                                <body>, no Mermaid error picture; then all four
//                                downloads, reopened: the same in each, and no
//                                read-only file carries anything of bpmn-js or
//                                of Mermaid's layout
//  13. Mermaid cannot be loaded  the page's request for Mermaid fails, bpmn-js
//                                is there: the script runs, the BPMN diagram
//                                with coordinates is drawn, the one without and
//                                the Mermaid diagram are each the warning that
//                                says so; the three read-only downloads too
//
// and on a copy of src/ built with two passes more, as tests/speichern.mjs
// builds a copy with another demo text (the product has no switch for this):
//
//   5. a pass throws             a document pass that throws stands in the
//                                middle of the list: one warning names it at
//                                the top, every other pass did its work, the
//                                rail is built; the three read-only exports
//                                carry the warning. A run-time pass that adds a
//                                transient element and then throws: its warning
//                                and its element are in the page and in no export
//
// and on a second copy, built with one export step more:
//
//   6. an export step throws     each of the three read-only downloads ends in
//                                a dialog that says the download failed, with
//                                the step's message; no file is handed over,
//                                and the download buttons are enabled again
//
// In the diagram cases (1, 10 to 13) every figure, in the page and in each
// file, has the checkbox of its large view (story 2.9) and the line of its
// downloads, a source link and, where a script runs, a picture button (story
// 2.10), and a diagram that became a warning has none of these. In case 13
// the refused diagrams have no line, and the drawn BPMN diagram keeps its own.
//
// In every case the error is on the console and no promise is rejected: the
// run collects console errors and page errors and looks at both.
//
// The page is known by its DOM only, as in tests/vergleich.mjs: a render is
// finished when a marker put into the rail is gone. marked is the library the
// page loads, a global of the page and not a name of its script; case 4 gives
// it, from outside and through its own marked.use(), a hook that throws.
//
// Every opening gets a browser context of its own, in one browser process per
// browser; the libraries the page loads from jsDelivr are served to every
// context from tests/.cdn/ (tests/cdn.mjs).
//
// Exit code 1 when anything fails, and when the page asked for a library the
// file under test does not pin.

import { chromium, firefox } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareLibraries, librariesLine } from './cdn.mjs';
// What the warning of a BPMN diagram says, and the reason of a page without
// the library, are asked where the product decides them.
import { bpmnWarningText, BPMN_NO_LIBRARY, BPMN_NO_MERMAID, BPMN_CREDIT } from '../src/app/bpmn.js';
import { LAYOUT_SEVERAL_POOLS, layoutStrayText } from '../src/app/bpmn-layout.js';
import { MERMAID_NO_LIBRARY } from '../src/app/diagrams.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

// ---------- arguments ----------
function parseArgs(argv){
  const a = { browser: 'all', file: path.join(root, 'dist/dokufix.html'), out: path.join(here, 'out/durchlaeufe') };
  for (let i = 0; i < argv.length; i++){
    const k = argv[i];
    if (['--file', '--browser', '--out'].includes(k)){
      if (argv[i + 1] === undefined) throw new Error(k + ' needs a value');
      a[k.slice(2)] = argv[++i];
    }
    else throw new Error('unknown argument: ' + k);
  }
  if (!['chromium', 'firefox', 'all'].includes(a.browser)) throw new Error('--browser must be chromium, firefox or all');
  a.file = path.resolve(a.file);
  a.out = path.resolve(a.out);
  if (!fs.existsSync(a.file)) throw new Error('file under test not found: ' + a.file);
  return a;
}

// ---------- browsers ----------
function findFirefox(){
  if (process.env.FIREFOX) return process.env.FIREFOX;
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  const dirs = fs.existsSync(cache)
    ? fs.readdirSync(cache).filter(d => /^firefox-\d+$/.test(d)).sort((x, y) => Number(y.split('-')[1]) - Number(x.split('-')[1]))
    : [];
  for (const d of dirs){
    const exe = path.join(cache, d, 'firefox', 'firefox');
    if (fs.existsSync(exe)) return exe;
  }
  throw new Error('No Firefox found. Set FIREFOX=/path/to/firefox or install the Playwright build.');
}
const BROWSERS = {
  chromium: () => chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium' }),
  firefox:  () => firefox.launch({ executablePath: findFirefox() }),
};

// ---------- the documents ----------
const FENCE = '```';
const diagram = lines => FENCE + 'mermaid\n' + lines.join('\n') + '\n' + FENCE;
const GOOD_FLOW = diagram(['flowchart LR', '    A[Anfang] --> B[Ende]']);
const GOOD_SEQUENCE = diagram(['sequenceDiagram', '    Anna->>Ben: Hallo']);
const BAD_FLOW = diagram(['flowchart LR', '    A[ --> B']);
// Three diagrams, the one in the middle with a syntax error.
const DOC_DIAGRAMS = [
  '# Drei Diagramme', '[[toc]]',
  '## Eins', GOOD_FLOW,
  '## Zwei', BAD_FLOW,
  '## Drei', GOOD_SEQUENCE,
  '## Vier', 'Ein Absatz mit Fußnote.[^a]',
  '[^a]: Die Fußnote.',
].join('\n\n') + '\n';
// Two documents for the overlap, told apart by every heading.
const overlapDoc = name => [
  '# Dokument ' + name,
  '## ' + name + ' eins', GOOD_FLOW,
  '## ' + name + ' zwei', GOOD_SEQUENCE,
  '## ' + name + ' drei', 'Text.',
  '## ' + name + ' vier', 'Text.',
].join('\n\n') + '\n';
// A BPMN diagram with coordinates, and one block that is no XML.
const BPMN_GOOD = FENCE + 'bpmn\n' + [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitionen" targetNamespace="http://example.org/dokufix">',
  '  <bpmn:process id="Prozess" isExecutable="false">',
  '    <bpmn:startEvent id="Start" name="Los"/>',
  '    <bpmn:task id="Tun" name="Etwas tun"/>',
  '    <bpmn:endEvent id="Ende" name="Fertig"/>',
  '    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Tun"/>',
  '    <bpmn:sequenceFlow id="F2" sourceRef="Tun" targetRef="Ende"/>',
  '  </bpmn:process>',
  '  <bpmndi:BPMNDiagram id="Diagramm">',
  '    <bpmndi:BPMNPlane id="Ebene" bpmnElement="Prozess">',
  '      <bpmndi:BPMNShape id="Start_di" bpmnElement="Start"><dc:Bounds x="32" y="32" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="5" y="73" width="90" height="27"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>',
  '      <bpmndi:BPMNShape id="Tun_di" bpmnElement="Tun"><dc:Bounds x="120" y="10" width="100" height="80"/></bpmndi:BPMNShape>',
  '      <bpmndi:BPMNShape id="Ende_di" bpmnElement="Ende"><dc:Bounds x="272" y="32" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="245" y="73" width="90" height="27"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>',
  '      <bpmndi:BPMNEdge id="F1_di" bpmnElement="F1"><di:waypoint x="68" y="50"/><di:waypoint x="120" y="50"/></bpmndi:BPMNEdge>',
  '      <bpmndi:BPMNEdge id="F2_di" bpmnElement="F2"><di:waypoint x="220" y="50"/><di:waypoint x="272" y="50"/></bpmndi:BPMNEdge>',
  '    </bpmndi:BPMNPlane>',
  '  </bpmndi:BPMNDiagram>',
  '</bpmn:definitions>',
].join('\n') + '\n' + FENCE;
const BPMN_BROKEN = FENCE + 'bpmn\n<bpmn:definitions>kein BPMN\n' + FENCE;
// Two BPMN blocks, the second broken, and a valid one after it.
const DOC_BPMN = [
  '# Prozesse', '[[toc]]',
  '## Gut', BPMN_GOOD,
  '## Kaputt', BPMN_BROKEN,
  '## Noch eins', BPMN_GOOD,
  '## Schluss', 'Ein Absatz mit Fußnote.[^a]',
  '[^a]: Die Fußnote.',
].join('\n\n') + '\n';
// A page without bpmn-js: a Mermaid diagram and a BPMN diagram.
const DOC_NO_LIBRARY = [
  '# Ohne Bibliothek', '[[toc]]',
  '## Mermaid', GOOD_FLOW,
  '## BPMN', BPMN_GOOD,
  '## Schluss', 'Ein Absatz mit Fußnote.[^a]',
  '[^a]: Die Fußnote.',
].join('\n\n') + '\n';
// BPMN without coordinates: one block that is laid out, one with two pools,
// one with a node in no lane.
const bpmnBlock = lines => FENCE + 'bpmn\n<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitionen" targetNamespace="http://example.org/dokufix">\n' +
  lines.map(l => '  ' + l + '\n').join('') + '</bpmn:definitions>\n' + FENCE;
const BPMN_LAID_OUT = bpmnBlock([
  '<bpmn:collaboration id="Zusammenarbeit"><bpmn:participant id="Pool" name="Ausleihe" processRef="Prozess"/></bpmn:collaboration>',
  '<bpmn:process id="Prozess" isExecutable="false">',
  '  <bpmn:laneSet id="Bahnen">',
  '    <bpmn:lane id="Theke" name="Theke"><bpmn:flowNodeRef>Start</bpmn:flowNodeRef><bpmn:flowNodeRef>Frage</bpmn:flowNodeRef><bpmn:flowNodeRef>Ausgeben</bpmn:flowNodeRef></bpmn:lane>',
  '    <bpmn:lane id="Magazin" name="Magazin"><bpmn:flowNodeRef>Holen</bpmn:flowNodeRef><bpmn:flowNodeRef>Ende</bpmn:flowNodeRef></bpmn:lane>',
  '  </bpmn:laneSet>',
  '  <bpmn:startEvent id="Start" name="Leserin fragt"/>',
  '  <bpmn:exclusiveGateway id="Frage" name="Am Platz?"/>',
  '  <bpmn:task id="Ausgeben" name="Ausgeben"/>',
  '  <bpmn:task id="Holen" name="Aus dem Magazin holen"/>',
  '  <bpmn:endEvent id="Ende" name="Erledigt"/>',
  '  <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Frage"/>',
  '  <bpmn:sequenceFlow id="F2" sourceRef="Frage" targetRef="Ausgeben" name="ja"/>',
  '  <bpmn:sequenceFlow id="F3" sourceRef="Frage" targetRef="Holen" name="nein"/>',
  '  <bpmn:sequenceFlow id="F4" sourceRef="Holen" targetRef="Ende"/>',
  '  <bpmn:sequenceFlow id="F5" sourceRef="Ausgeben" targetRef="Ende"/>',
  '</bpmn:process>',
]);
const BPMN_POOLS = bpmnBlock([
  '<bpmn:collaboration id="Zusammenarbeit"><bpmn:participant id="A" name="Leser" processRef="PA"/><bpmn:participant id="B" name="Bibliothek" processRef="PB"/></bpmn:collaboration>',
  '<bpmn:process id="PA"><bpmn:task id="Bestellen" name="Bestellen"/></bpmn:process>',
  '<bpmn:process id="PB"><bpmn:task id="Liefern" name="Liefern"/></bpmn:process>',
]);
const BPMN_STRAY = bpmnBlock([
  '<bpmn:process id="Prozess"><bpmn:laneSet id="Bahnen"><bpmn:lane id="Theke" name="Theke"><bpmn:flowNodeRef>Annehmen</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>',
  '  <bpmn:task id="Annehmen" name="Annehmen"/><bpmn:task id="Verbuchen" name="Verbuchen"/><bpmn:task id="Ablegen" name="Ablegen"/>',
  '</bpmn:process>',
]);
const DOC_LAYOUT = [
  '# Anordnung', '[[toc]]',
  '## Angeordnet', BPMN_LAID_OUT,
  '## Mehrere Pools', BPMN_POOLS,
  '## Ohne Bahn', BPMN_STRAY,
  '## Schluss', 'Ein Absatz mit Fußnote.[^a]',
  '[^a]: Die Fußnote.',
].join('\n\n') + '\n';
// What a laid-out diagram leaves in a file only through Mermaid: its URL, its
// swimlane classes, its node ids, the host's render id.
const LAYOUT_TRACES = /npm\/mermaid@|swimlane|-flowchart-|dokufix-bpmn-layout/;
// A page without Mermaid: a Mermaid diagram, BPMN with and without coordinates.
const DOC_NO_MERMAID = [
  '# Ohne Mermaid', '[[toc]]',
  '## Fluss', GOOD_FLOW,
  '## Mit Koordinaten', BPMN_GOOD,
  '## Ohne Koordinaten', BPMN_LAID_OUT,
  '## Schluss', 'Ein Absatz mit Fußnote.[^a]',
  '[^a]: Die Fußnote.',
].join('\n\n') + '\n';
const MARKED_MESSAGE = 'Absicht: marked.parse wirft (durchlaeufe)';
// Three block markers, the one in the middle with a misspelt name.
const DOC_MARKERS = [
  '# Markierungen', '[[toc]]',
  '## Karten', '<!-- dokufix: cards -->\n- **Eins** Am Automaten.\n- **Zwei** An der Theke.',
  '## Kaputt', '<!-- dokufix: crads -->\n- bleibt eine Aufzählung\n- mit zwei Einträgen',
  '## Schritte', '<!-- dokufix: steps -->\n3. *Leserin:* Medium einlegen.\n4. Beleg mitnehmen.',
  '## Schluss', 'Ein Absatz mit Fußnote.[^a]',
  '[^a]: Die Fußnote.',
].join('\n\n') + '\n';
const MARKER_WARNING = 'Unbekannte Markierung „dokufix: crads“.';
// Three facet markers: the first names a column its table has, the second one
// its table does not have, the third stands in the definition of a footnote.
const DOC_FACETS = [
  '# Facetten', '[[toc]]',
  '## Wirkt', '<!-- dokufix: facets Typ -->\n| Merkmal | Typ |\n|---|---|\n| ORT | Text |\n| STATUS | Kategorie |\n| TELEFON | Text |\n| ANREDE | Kategorie |\n| ANLASS | Datum |',
  '## Wirkt nicht', '<!-- dokufix: facets Tpy -->\n| Merkmal | Typ |\n|---|---|\n| ORT | Text |',
  '## Schluss', 'Ein Absatz mit Fußnote.[^a]',
  '[^a]: Die Fußnote mit einer Tabelle.',
  '    <!-- dokufix: facets Art -->\n    | Name | Art |\n    |---|---|\n    | a | eins |\n    | b | zwei |',
].join('\n\n') + '\n';
const FACET_WARNING = 'Die Markierung „dokufix: facets Tpy“ nennt eine Spalte, die die Tabelle nicht hat.';
const FACET_CONTROLS = 'Alle 5|Text 2|Kategorie 2|Datum 1';
const FACET_CONTROLS_IN_FOOTNOTE = 'Alle 2|eins 1|zwei 1';
// The rows the working filter shows with "Kategorie", its third control, chosen.
const FACET_CHOICE = 2, FACET_ROWS_CHOSEN = [false, true, false, true, false];
// Three free-text filters: the first before a table, the second before a
// paragraph, the third in the definition of a footnote.
const DOC_FILTER = [
  '# Suchfeld', '[[toc]]',
  '## Wirkt', '<!-- dokufix: filter "Merkmal suchen …" -->\n| Merkmal | Typ |\n|---|---|\n| ORT | Text |\n| STATUS | Kategorie |\n| TELEFON | Text |\n| ANREDE | Kategorie |\n| ANLASS | Datum |',
  '## Wirkt nicht', '<!-- dokufix: filter "Suchen …" -->\nEin Absatz, keine Tabelle.',
  '## Schluss', 'Ein Absatz mit Fußnote.[^a]',
  '[^a]: Die Fußnote mit einer Tabelle.',
  '    <!-- dokufix: filter -->\n    | Name | Art |\n    |---|---|\n    | a | eins |\n    | b | zwei |',
].join('\n\n') + '\n';
const FILTER_WARNING = 'Die Markierung „dokufix: filter "Suchen …"“ erwartet direkt danach eine Tabelle.';
// What is typed while the files are written, and the rows of the first table it shows.
const FILTER_TERM = 'kategorie', FILTER_ROWS_TYPED = [false, true, false, true, false];

// ---------- the copy of src/ with two passes more ----------
// The diagrams of the demo text: five of Mermaid (two of them the special
// cases of the large view, one that of the downloads), six of BPMN (two with
// coordinates, four without).
const DEMO_DIAGRAMS = 11;
const THROWING_PASS = 'Prüfschritt';
const THROWING_MESSAGE = 'Absicht: der Prüfschritt wirft (durchlaeufe)';
const RUNTIME_PASS = 'Laufzeit-Prüfschritt';
const RUNTIME_MESSAGE = 'Absicht: der Laufzeit-Prüfschritt wirft (durchlaeufe)';
const TRANSIENT_ID = 'durchlaeufe-nur-zur-laufzeit';
// Each entry: the line of src/app/render.js the new pass is put next to.
const PASS_EDITS = [
  { before: "  { name: 'Inhaltsverzeichnis', run: processInlineToc },\n",
    add: "  { name: '" + THROWING_PASS + "', run(){ throw new Error('" + THROWING_MESSAGE + "'); } },\n" },
  { after: "  { name: 'Sprungmarken im Inhaltsverzeichnis', run: attachTocClicks },\n",
    add: "  { name: '" + RUNTIME_PASS + "', run(root){ const el = root.ownerDocument.createElement('p'); el.id = '" + TRANSIENT_ID +
         "'; el.setAttribute(TRANSIENT_ATTR, ''); el.textContent = 'nur in der laufenden Seite'; root.appendChild(el); throw new Error('" + RUNTIME_MESSAGE + "'); } },\n" },
];
const EXPORT_STEP_MESSAGE = 'Absicht: der Exportschritt wirft (durchlaeufe)';
const EXPORT_EDITS = [
  { after: "const EXPORT_STEPS = [removeTransientElements, showFilteredRows, inlineImages];\n",
    add: "EXPORT_STEPS.push(() => { throw new Error('" + EXPORT_STEP_MESSAGE + "'); });\n" },
];
// Builds a copy of src/ in which one module got the given lines.
function buildCopy(outDir, module, edits, name){
  const srcCopy = path.join(outDir, 'src');
  fs.cpSync(path.join(root, 'src'), srcCopy, { recursive: true });
  const file = path.join(srcCopy, module);
  let text = fs.readFileSync(file, 'utf8');
  for (const edit of edits){
    const anchor = edit.before || edit.after;
    if (text.split(anchor).length !== 2) throw new Error('src/' + module + ': expected exactly once, to put a line next to it: ' + anchor.trim());
    text = text.replace(anchor, () => edit.before ? edit.add + anchor : anchor + edit.add);
  }
  fs.writeFileSync(file, text);
  const built = path.join(outDir, name);
  const r = spawnSync(process.execPath, [path.join(root, 'build.mjs'), '--src', srcCopy, '--out', built], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('could not build ' + name + ':\n' + r.stderr);
  fs.rmSync(srcCopy, { recursive: true });
  return built;
}

// A file's text without its scripts: schlank and kompakt carry the reader
// bundle, whose code names the class and the attribute of the filter's field.
const withoutScripts = text => text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
// What is transient in a read-only export once it has opened: the fields of the
// filter, and in schlank and kompakt the panel of the search, once, and the
// picture button below each diagram (story 2.10).
const onlyOwnTransient = (s, x) => x.searchPanels === (s.endsWith('nur-lesen') ? 0 : 1) && x.svgButtons === (s.endsWith('nur-lesen') ? 0 : x.figures.length) &&
  x.transient === x.filters.length + x.searchPanels + x.svgButtons;

// ---------- results ----------
const results = [];
const check = (scope, name, ok, detail) => results.push({ scope, name, ok: !!ok, detail: ok || detail === undefined ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });

// ---------- the page, through its DOM ----------
// A time window, and the only fixed wait of the run: where a check proves that
// something does NOT happen (a second render, a late download), there is no
// condition to wait on, only the time it would have taken to show.
const QUIET_WINDOW = 500;
const READONLY = [
  { key: 'nur-lesen', download: 'readonly-open' },
  { key: 'schlank',   download: 'readonly-slim' },
  { key: 'kompakt',   download: 'readonly-compact' },
];
// Opens a file in a context of its own, with what the console and the page
// report as errors collected. ready: what to wait for.
// options.withoutBpmn: the page's request for bpmn-js fails; withoutMermaid:
// the page's request for Mermaid fails.
async function open(browser, file, ready, options = {}){
  const context = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  await libraries.serve(context);
  const page = await context.newPage();
  // A route of the page goes before the one of the context.
  if (options.withoutBpmn) await page.route(url => /\/npm\/bpmn-js@/.test(String(url)), route => route.abort('failed'));
  if (options.withoutMermaid) await page.route(url => /\/npm\/mermaid@/.test(String(url)), route => route.abort('failed'));
  const consoleErrors = [], pageErrors = [], dialogs = [], downloads = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('dialog', d => { dialogs.push({ type: d.type(), message: d.message() }); return d.type() === 'prompt' ? d.accept('Stand aus durchlaeufe.mjs') : d.accept(); });
  page.on('download', d => downloads.push(d.suggestedFilename()));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(ready, null, { timeout: 90000 });
  return { context, page, consoleErrors, pageErrors, dialogs, downloads };
}
// An editor file: init and the first render are done when the rail is filled.
const editorReady = () => !!document.querySelector('#dokufix-rail.has-items');
const READY = {
  'mit-editor': editorReady,
  'nur-lesen': () => true,
  'schlank': () => !document.querySelector('[data-gz], [data-gz-href]'),
  'kompakt': () => { const d = document.getElementById('d'); return !!d && d.children.length > 0 && !document.querySelector('.dokufix-rail-pending'); },
};
// Presses a button that ends in a render and waits for the render: a marker
// put into the rail is gone when the rail has been rebuilt.
async function pressAndWaitForRender(page, selector){
  await page.evaluate(() => {
    const marker = document.createElement('i');
    marker.id = 'durchlaeufe-render-pending';
    document.getElementById('dokufix-rail').appendChild(marker);
  });
  await page.click(selector);
  await page.waitForFunction(() => !document.getElementById('durchlaeufe-render-pending'), null, { timeout: 90000 });
}
async function editMode(page){
  if (await page.evaluate(() => document.body.classList.contains('mode-view'))) await page.click('#edit-btn');
}
async function typeAndRender(page, text){
  await editMode(page);
  await page.fill('#source', text);
  await pressAndWaitForRender(page, '#render-btn');
}
async function download(page, variant, file){
  await editMode(page);
  await page.click('#download-btn');
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.click('button[data-download="' + variant + '"]'),
  ]);
  await dl.saveAs(file);
  await page.waitForFunction(() => !document.querySelector('button[data-download]:disabled'));
}

// What a page shows, in the editor file as in an export.
const facts = page => page.evaluate(() => {
  // The content container: the preview in the editor file, <main> in an export
  // (in kompakt the unpacked body sits in #d inside it).
  const container = document.querySelector('#preview') || document.querySelector('main.reader-body #d') || document.querySelector('main.reader-body');
  const warnings = Array.from(container.querySelectorAll('.dokufix-warning'));
  const styleOf = w => {
    const cs = getComputedStyle(w), detail = w.querySelector('.dokufix-warning-detail'), ds = detail && getComputedStyle(detail);
    return { border: cs.borderLeftWidth + ' ' + cs.borderLeftStyle, background: cs.backgroundColor, padding: cs.paddingLeft,
             detail: ds ? ds.whiteSpace + ' on ' + ds.backgroundColor : 'none' };
  };
  const kids = Array.from(container.children);
  const rail = document.querySelector('.dokufix-rail');
  return {
    warnings: warnings.map(w => ({
      text: w.textContent, label: (w.querySelector('.dokufix-warning-title > strong') || { textContent: '' }).textContent,
      transient: w.hasAttribute('data-dokufix-transient'), style: styleOf(w),
      before: w.previousElementSibling ? w.previousElementSibling.tagName + '#' + w.previousElementSibling.id : '',
      after: w.nextElementSibling ? w.nextElementSibling.tagName + '.' + w.nextElementSibling.className : '',
    })),
    // Cards and step lists: the title of each card, the number and the actor
    // of each step, and whether the document styles reach them.
    cards: Array.from(container.querySelectorAll('ul.dokufix-cards > li')).map(li => (li.querySelector(':scope > .dokufix-card-title') || { textContent: '' }).textContent),
    steps: Array.from(container.querySelectorAll('ol.dokufix-steps > li')).map(li =>
      (li.querySelector(':scope > .dokufix-step-number') || { textContent: '' }).textContent + ' ' + (li.querySelector(':scope > .dokufix-step-actor') || { textContent: '' }).textContent),
    componentLook: (() => {
      const list = container.querySelector('ul.dokufix-cards'), card = list && list.querySelector(':scope > li'), tile = container.querySelector('.dokufix-step-number');
      return [list ? getComputedStyle(list).display : '', card ? getComputedStyle(card).borderTopWidth : '', tile ? getComputedStyle(tile).backgroundColor : ''].join(' ');
    })(),
    // Tables and facet filters: how many tables stand in a wrapper of their
    // own, and per filter its controls, which of them is chosen, which carry
    // the attribute "checked", which rows are shown, whether the bar is.
    tables: container.querySelectorAll('table').length + ' tables, ' + container.querySelectorAll('.dokufix-table > table').length + ' wrapped',
    facets: Array.from(container.querySelectorAll('.dokufix-facets')).map(group => {
      const inputs = Array.from(group.querySelectorAll('.dokufix-facet-bar > .dokufix-facet-controls > label > input'));
      return {
        controls: Array.from(group.querySelectorAll('.dokufix-facet-bar > .dokufix-facet-controls > label')).map(l => l.textContent).join('|'),
        chosen: inputs.map((x, k) => x.checked ? k : -1).filter(k => k >= 0), attribute: inputs.map((x, k) => x.hasAttribute('checked') ? k : -1).filter(k => k >= 0),
        shown: Array.from(group.querySelectorAll('tr.dokufix-facet-row')).map(tr => getComputedStyle(tr).display !== 'none'),
        bar: getComputedStyle(group.querySelector('.dokufix-facet-bar')).display,
        next: group.nextElementSibling ? group.nextElementSibling.tagName + '#' + group.nextElementSibling.id : '',
      };
    }),
    // Free-text filters: per field its placeholder, value and counter, and the
    // rows of its table shown; the marks of a filter table and the hidden rows.
    filters: Array.from(container.querySelectorAll('.dokufix-filter')).map(field => ({
      placeholder: field.querySelector('input').getAttribute('placeholder'), value: field.querySelector('input').value,
      count: field.querySelector('.dokufix-filter-count').textContent, transient: field.hasAttribute('data-dokufix-transient'),
      shown: Array.from(field.nextElementSibling.querySelectorAll(':scope > table > tbody > tr')).map(tr => getComputedStyle(tr).display !== 'none'),
    })),
    filterMarks: container.querySelectorAll('[data-dokufix-filter]').length,
    hiddenRows: container.querySelectorAll('.dokufix-filter-out').length,
    rowsShown: Array.from(container.querySelectorAll('tbody > tr')).map(tr => getComputedStyle(tr).display !== 'none'),
    // The previews of the footnotes: their text, and the controls in them.
    previewTexts: Array.from(container.querySelectorAll('.dokufix-fn-preview')).map(p => p.textContent.replace(/\s+/g, ' ').trim()),
    previewControls: container.querySelectorAll('.dokufix-fn-preview :is(fieldset, legend, label, input, .dokufix-filter)').length,
    // A block marker that is still a comment.
    markersLeft: (() => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
      let n = 0;
      while (walker.nextNode()) if (/^\s*dokufix:/i.test(walker.currentNode.data)) n++;
      return n;
    })(),
    children: kids.map(k => k.tagName.toLowerCase() + (k.className ? '.' + String(k.className).split(' ')[0] : '')),
    diagrams: container.querySelectorAll('figure.dokufix-diagram .dokufix-diagram-svg > svg').length,
    // The checkboxes of the large view (story 2.9), and the controls of one inside a warning.
    toggles: container.querySelectorAll('figure.dokufix-diagram > .dokufix-diagram-toggle').length,
    warningControls: container.querySelectorAll('.dokufix-warning :is(.dokufix-diagram-toggle, .dokufix-diagram-zoom, .dokufix-diagram-view)').length,
    // The line of the downloads below a diagram (story 2.10): the source links,
    // the picture buttons, and a line inside a warning.
    sourceLinks: Array.from(container.querySelectorAll('figure.dokufix-diagram > .dokufix-diagram-downloads > a[download]')).map(a => a.getAttribute('download')),
    svgButtons: container.querySelectorAll('figure.dokufix-diagram > .dokufix-diagram-downloads > button[data-dokufix-transient]').length,
    warningDownloads: container.querySelectorAll('.dokufix-warning :is(.dokufix-diagram-downloads, a[download])').length,
    // The figures, by their title.
    figures: Array.from(container.querySelectorAll('figure.dokufix-diagram')).map(f => f.getAttribute('aria-label')),
    // The BPMN diagrams: title, whether the SVG is there, and the markup of the credit below it.
    bpmn: Array.from(container.querySelectorAll('figure.dokufix-diagram-bpmn')).map(f => f.getAttribute('aria-label') + ' ' + !!f.querySelector(':scope > .dokufix-diagram-view > .dokufix-diagram-stage > .dokufix-diagram-svg > svg[role="img"]') + ' ' +
      (f.querySelector(':scope > figcaption > a[href="https://bpmn.io"]') ? f.querySelector(':scope > figcaption').innerHTML : '')),
    // An element of the drawing left in <body>: the host is transient and fixed.
    hosts: Array.from(document.querySelectorAll('body > [data-dokufix-transient]')).filter(el => getComputedStyle(el).position === 'fixed').length,
    // Mermaid's error picture: an SVG with this role and this sentence in it.
    errorPictures: document.querySelectorAll('svg[aria-roledescription="error"], .error-icon, .error-text').length +
      (document.body.textContent.includes('Syntax error in text') ? 1 : 0),
    // Mermaid names its drawing and its temporary elements after the diagram's id.
    mermaidOutside: Array.from(document.querySelectorAll('[id^="dmermaid"], [id^="imermaid"], [id^="mermaid-"]'))
      .filter(el => !container.contains(el)).map(el => el.tagName + '#' + el.id),
    transient: document.querySelectorAll('[data-dokufix-transient]').length,
    // The panel of the search, which the reader bundle of schlank and kompakt makes when the file opens.
    searchPanels: document.querySelectorAll('body > .search-panel[data-dokufix-transient]').length,
    panel: !!container.querySelector('details.dokufix-frontmatter'),
    // A heading inside a callout gets no id, by design (see src/README.md, Callouts).
    headingsWithoutId: Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(h => !h.id && !h.closest('.dokufix-callout')).length,
    tocLinks: container.querySelectorAll('nav.dokufix-toc a').length,
    markers: container.querySelectorAll('a[data-footnote-ref]').length,
    previews: container.querySelectorAll('sup.dokufix-fn-host > .dokufix-fn-preview').length,
    returnPaths: container.querySelectorAll('a[data-footnote-backref][id^="footnote-back-"]').length,
    railLinks: rail ? rail.querySelectorAll('a').length : 0,
    railHasItems: !!rail && rail.classList.contains('has-items'),
    footer: !!document.querySelector('footer.dokufix-meta'),
    // The link "license information" with its view: where each stands and whether it is open.
    licences: Array.from(document.querySelectorAll('details.dokufix-licences')).map(d => ({
      open: d.open, transient: d.hasAttribute('data-dokufix-transient'),
      firstInBody: d.parentElement === document.body && d === document.body.firstElementChild,
    })),
  };
});
const STYLED = { border: '6px solid', background: 'rgb(255, 248, 225)', padding: '16px', detail: 'pre-wrap on rgba(0, 0, 0, 0)' };
const isStyled = (w, look = STYLED) => Object.keys(look).every(k => w.style[k] === look[k]);
// A warning that is one line: the warning of a marker has no detail below it.
const STYLED_ONE_LINE = { ...STYLED, detail: 'none' };
// The large view of a diagram (story 2.9): every figure has its checkbox, and
// a diagram that became a warning has none, nor any other of its controls.
const checkViewControls = (scope, x) => {
  check(scope, 'every figure has the checkbox of its large view, and no warning carries a control of one',
    x.toggles === x.figures.length && x.warningControls === 0, { toggles: x.toggles, figures: x.figures.length, warningControls: x.warningControls });
  // And the line of its downloads (story 2.10): a source link per figure, a
  // picture button where a script runs, nothing below a warning.
  const buttons = scope.endsWith('nur-lesen') ? 0 : x.figures.length;
  check(scope, 'every figure has its source link' + (buttons ? ' and its picture button' : ', no picture button') + ', and no warning carries a download',
    x.sourceLinks.length === x.figures.length && x.svgButtons === buttons && x.warningDownloads === 0, { sourceLinks: x.sourceLinks, svgButtons: x.svgButtons, figures: x.figures.length, warningDownloads: x.warningDownloads });
};
// The one warning a case expects, by the texts it has to contain.
function checkWarning(scope, f, texts, what, look = STYLED){
  const visible = f.warnings.filter(w => !w.transient);
  const w = visible[0];
  check(scope, 'one warning, ' + what, visible.length === 1 && texts.every(t => w.text.includes(t)), f.warnings.map(x => x.text));
  if (!w) return;
  check(scope, 'the warning says "Warnung:" in its text, so it is recognisable without colour', w.label === 'Warnung:' && w.text.startsWith('Warnung: '), w.text.slice(0, 60));
  check(scope, 'the warning is styled by the document styles', isStyled(w, look), w.style);
}
function checkErrors(scope, o, expected){
  check(scope, 'the error is on the console', expected.every(t => o.consoleErrors.some(e => e.includes(t))), o.consoleErrors.join(' | ').slice(0, 400) || 'nothing logged');
  check(scope, 'no page error and no rejected promise', o.pageErrors.length === 0, o.pageErrors.join(' | '));
}
// Saves the given read-only exports of the page as it is and checks each reopened.
async function checkExports(scope, browser, page, dir, prefix, variants, each){
  for (const v of variants){
    const file = path.join(dir, prefix + '-' + v.key + '.html');
    await download(page, v.download, file);
    const o = await open(browser, file, READY[v.key]);
    try {
      const f = await facts(o.page);
      each(scope + ', ' + v.key, f, fs.readFileSync(file, 'utf8'));
      check(scope + ', ' + v.key, 'opens without an error', o.pageErrors.length === 0 && o.consoleErrors.length === 0, o.pageErrors.concat(o.consoleErrors).join(' | '));
    } finally { await o.context.close(); }
  }
}

// ---------- one browser ----------
async function runBrowser(name, opts, copyWithPasses, copyWithExportStep){
  const dir = path.join(opts.out, name);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await BROWSERS[name]();
  // A case that ends in an exception (a wait that times out, say) is a failed
  // check; the cases after it still run.
  const attempt = async (label, fn) => {
    try { await fn(); }
    catch (e){ check(label, 'the case ran to its end', false, String(e && e.message || e).split('\n')[0]); }
  };
  try {
    // ----- 1. a diagram with an error
    await attempt(name + ' diagram with an error', async () => {
      const scope = name + ' diagram with an error';
      let o = await open(browser, opts.file, editorReady);
      const bodyBefore = await o.page.evaluate(() => Array.from(document.body.children).length);
      await typeAndRender(o.page, DOC_DIAGRAMS);
      const f = await facts(o.page);
      checkWarning(scope, f, ['Ein Diagramm konnte nicht gezeichnet werden.', 'Parse error'], 'with Mermaid\'s message');
      check(scope, 'the warning stands where the diagram would be', f.warnings.length === 1 && f.warnings[0].before === 'H2#zwei', f.warnings.map(w => w.before));
      check(scope, 'the other two diagrams are drawn, each in its figure named after the heading before it', f.diagrams === 2 && f.figures.join('|') === 'Eins|Drei', { diagrams: f.diagrams, figures: f.figures });
      check(scope, 'no Mermaid error picture anywhere', f.errorPictures === 0, f.errorPictures);
      const bodyAfter = await o.page.evaluate(() => Array.from(document.body.children).length);
      check(scope, 'nothing of Mermaid\'s is left outside the preview', f.mermaidOutside.length === 0 && bodyAfter === bodyBefore, { outside: f.mermaidOutside, bodyChildren: [bodyBefore, bodyAfter] });
      check(scope, 'the passes around it ran and the rail is built', f.tocLinks >= 4 && f.previews === 1 && f.returnPaths === 1 && f.railHasItems && f.railLinks >= 4, f);
      checkErrors(scope, o, ['Mermaid error']);
      const diagramExport = (s, x, text) => {
        checkWarning(s, x, ['Ein Diagramm konnte nicht gezeichnet werden.', 'Parse error'], 'with Mermaid\'s message');
        check(s, 'two diagrams in their figures, no error picture', x.diagrams === 2 && x.figures.join('|') === 'Eins|Drei' && x.errorPictures === 0, { diagrams: x.diagrams, figures: x.figures, errorPictures: x.errorPictures });
        checkViewControls(s, x);
        if (s.endsWith('nur-lesen')) check(s, 'contains no <script>', !/<script/i.test(text));
      };
      await checkExports(scope, browser, o.page, dir, 'diagramm', READONLY, diagramExport);
      // "Mit Editor": the saved file renders its document again when it is opened.
      const saved = path.join(dir, 'diagramm-mit-editor.html');
      await download(o.page, 'full', saved);
      await o.context.close();
      o = await open(browser, saved, editorReady);
      diagramExport(scope + ', mit-editor', await facts(o.page), '');
      checkErrors(scope + ', mit-editor', o, ['Mermaid error']);
      await o.context.close();
    });

    // ----- 2. overlapping renders
    await attempt(name + ' overlapping renders', async () => {
      const scope = name + ' overlapping renders';
      const o = await open(browser, opts.file, editorReady);
      await o.page.evaluate(([a, b]) => {
        const source = document.getElementById('source'), button = document.getElementById('render-btn');
        const preview = document.getElementById('preview'), rail = document.getElementById('dokufix-rail');
        const h1 = () => (preview.querySelector('h1') || { textContent: '' }).textContent;
        const log = window.durchlaeufe = { rails: [], railsWhenSecondWasRequested: null };
        // Every rebuild of the rail, with what the preview showed at that moment.
        new MutationObserver(() => {
          log.rails.push({ rail: (rail.querySelector('a') || { textContent: '' }).textContent, preview: h1() });
        }).observe(rail, { childList: true });
        // The first render has put document A into the preview and is in its
        // passes: now request the second.
        const first = new MutationObserver(() => {
          if (h1() !== 'Dokument A') return;
          first.disconnect();
          log.railsWhenSecondWasRequested = log.rails.length;
          source.value = b;
          button.click();
        });
        first.observe(preview, { childList: true });
        source.value = a;
        button.click();
      }, [overlapDoc('A'), overlapDoc('B')]);
      await o.page.waitForFunction(() => window.durchlaeufe.rails.some(r => r.rail === 'B eins'), null, { timeout: 90000 });
      await o.page.waitForTimeout(QUIET_WINDOW);   // a render still running would show up as one more rail
      const log = await o.page.evaluate(() => ({ ...window.durchlaeufe, h1: document.querySelector('#preview h1').textContent,
        diagrams: document.querySelectorAll('#preview figure.dokufix-diagram .dokufix-diagram-svg > svg').length }));
      check(scope, 'the second render was requested while the first ran', log.railsWhenSecondWasRequested === 0, log);
      check(scope, 'they ran one after the other: each rail was built from the document the preview showed',
        JSON.stringify(log.rails) === JSON.stringify([{ rail: 'A eins', preview: 'Dokument A' }, { rail: 'B eins', preview: 'Dokument B' }]), log.rails);
      check(scope, 'the preview ends as the second one\'s, complete', log.h1 === 'Dokument B' && log.diagrams === 2, log);
      check(scope, 'no error', o.pageErrors.length === 0 && o.consoleErrors.length === 0, o.pageErrors.concat(o.consoleErrors).join(' | '));
      await o.context.close();
    });

    // ----- 3. a transient element
    await attempt(name + ' transient element', async () => {
      const scope = name + ' transient element';
      const o = await open(browser, opts.file, editorReady);
      const placed = await o.page.evaluate(() => {
        const make = (tag, id, marked) => {
          const el = document.createElement(tag);
          el.id = id;
          if (marked) el.setAttribute('data-dokufix-transient', '');
          el.textContent = tag === 'style' ? '.durchlaeufe{color:red}' : 'durchlaeufe';
          return el;
        };
        document.head.appendChild(make('style', 'durchlaeufe-t-head', true));
        document.body.appendChild(make('div', 'durchlaeufe-t-body', true));
        document.getElementById('header-actions').appendChild(make('span', 'durchlaeufe-t-header', true));
        const nested = make('div', 'durchlaeufe-t-outer', true);
        nested.appendChild(make('b', 'durchlaeufe-t-inner', false));
        document.querySelector('.pane-preview').appendChild(nested);
        // Not marked: this one is a leftover, and the save takes it along.
        document.body.appendChild(make('i', 'durchlaeufe-nicht-markiert', false));
        return document.querySelectorAll('[data-dokufix-transient][id^="durchlaeufe-"]').length;
      });
      // The page's own transient elements: the link "license information", in
      // <body> for read mode and in the toolbar. Both views are opened, the
      // first while the page is still in read mode.
      await o.page.click('body > details.dokufix-licences > summary');
      await editMode(o.page);
      await o.page.click('#header-actions > details.dokufix-licences > summary');
      const views = () => o.page.evaluate(() => Array.from(document.querySelectorAll('details.dokufix-licences'))
        .map(d => d.open && d.hasAttribute('data-dokufix-transient')));
      check(scope, 'the page has the licence link twice, marked, and both views are open', JSON.stringify(await views()) === '[true,true]', await views());
      const withTransient = path.join(dir, 'transient-mit-editor.html');
      await download(o.page, 'full', withTransient);
      const savedText = fs.readFileSync(withTransient, 'utf8');
      check(scope, 'the page held four marked elements of this run when it was saved', placed === 4, placed);
      check(scope, 'the marked elements are still in the running page', await o.page.evaluate(() => document.querySelectorAll('[data-dokufix-transient][id^="durchlaeufe-"]').length) === 4);
      // The read-only exports, written while both views are open: each writes
      // the element itself, so it is there once, closed and not marked.
      await checkExports(scope, browser, o.page, dir, 'transient', READONLY, (s, x, text) => {
        const written = text.match(/<details class="dokufix-licences"[^>]*>/g) || [];
        check(s, 'carries the licence element once, directly after <body>, closed, although the views were open',
          written.length === 1 && written[0] === '<details class="dokufix-licences">' && x.licences.length === 1 && !x.licences[0].open && x.licences[0].firstInBody, { written, licences: x.licences });
        // The search fields and the search panel that schlank and kompakt make
        // themselves when they open are transient; the code that makes them
        // names the attribute.
        check(s, 'nothing transient but the fields, the search panel and the picture buttons the file makes: not the attribute, not an element of this run', onlyOwnTransient(s, x) && !withoutScripts(text).includes('data-dokufix-transient') && !text.includes('durchlaeufe-'), { transient: x.transient, filters: x.filters.length, panels: x.searchPanels, svgButtons: x.svgButtons });
        if (s.endsWith('nur-lesen')) check(s, 'contains no <script>', !/<script/i.test(text));
      });
      check(scope, 'both views are still open in the running page', JSON.stringify(await views()) === '[true,true]', await views());
      await o.context.close();
      // The saved file, read with scripts off: its script names the attribute, so
      // the text of the file cannot be searched for it.
      const off = await browser.newContext({ javaScriptEnabled: false });
      await libraries.serve(off);
      const offPage = await off.newPage();
      await offPage.goto(pathToFileURL(withTransient).href);
      const left = await offPage.evaluate(() => ({
        marked: document.querySelectorAll('[data-dokufix-transient]').length,
        ids: Array.from(document.querySelectorAll('[id^="durchlaeufe-"]')).map(el => el.id),
        licences: document.querySelectorAll('details.dokufix-licences').length,
      }));
      await off.close();
      check(scope, 'no marked element, and nothing inside one, is in the saved file', left.marked === 0 && !savedText.includes('durchlaeufe-t-'), left);
      check(scope, 'the saved file has no licence element: the script makes it when the file is opened', left.licences === 0, left);
      check(scope, 'control: the element that was not marked is in the saved file', left.ids.join(' ') === 'durchlaeufe-nicht-markiert', left);
    });

    // ----- 4. Markdown cannot be parsed
    await attempt(name + ' Markdown cannot be parsed', async () => {
      const scope = name + ' Markdown cannot be parsed';
      const o = await open(browser, opts.file, editorReady);
      await o.page.evaluate(message => { marked.use({ hooks: { preprocess(){ throw new Error(message); } } }); }, MARKED_MESSAGE);
      await typeAndRender(o.page, DOC_DIAGRAMS);
      const f = await facts(o.page);
      checkWarning(scope, f, ['Das Markdown konnte nicht verarbeitet werden.', MARKED_MESSAGE], 'with the message of marked');
      check(scope, 'the warning replaces the content', f.children.join(' ') === 'div.dokufix-warning', f.children);
      check(scope, 'the rail is rebuilt, and empty', !f.railHasItems && f.railLinks === 0, { railHasItems: f.railHasItems, railLinks: f.railLinks });
      checkErrors(scope, o, ['Markdown error']);
      await checkExports(scope, browser, o.page, dir, 'markdown', READONLY, (s, x, text) => {
        checkWarning(s, x, ['Das Markdown konnte nicht verarbeitet werden.', MARKED_MESSAGE], 'with the message of marked');
        check(s, 'the warning and the export\'s footer, no rail', x.children[0] === 'div.dokufix-warning' && x.footer && x.railLinks === 0, { children: x.children, footer: x.footer, railLinks: x.railLinks });
        if (s.endsWith('nur-lesen')) check(s, 'contains no <script>', !/<script/i.test(text));
      });
      await o.context.close();
    });

    // ----- 7. a broken marker among working ones
    await attempt(name + ' a broken marker', async () => {
      const scope = name + ' a broken marker';
      let o = await open(browser, opts.file, editorReady);
      await typeAndRender(o.page, DOC_MARKERS);
      const markerPage = (s, x, text) => {
        checkWarning(s, x, [MARKER_WARNING], 'naming the marker', STYLED_ONE_LINE);
        check(s, 'the warning stands at the marker\'s place, and its list stays a list', x.warnings.length === 1 && x.warnings[0].before === 'H2#kaputt' && x.warnings[0].after === 'UL.', x.warnings.map(w => [w.before, w.after]));
        check(s, 'the working markers took effect: two cards with their titles, two steps counted from 3, one with its actor; no marker is left',
          x.cards.join('|') === 'Eins|Zwei' && x.steps.join('|') === '3 Leserin|4 ' && x.markersLeft === 0, { cards: x.cards, steps: x.steps, markersLeft: x.markersLeft });
        check(s, 'cards and steps are styled by the document styles', x.componentLook === 'grid 1px rgb(240, 240, 243)', x.componentLook);
        check(s, 'the passes around it ran', x.headingsWithoutId === 0 && x.tocLinks >= 4 && x.previews === 1 && x.returnPaths === 1, x);
        if (s.endsWith('nur-lesen')) check(s, 'contains no <script>', !/<script/i.test(text));
      };
      const f = await facts(o.page);
      markerPage(scope, f, '');
      check(scope, 'the rail is built', f.railHasItems && f.railLinks >= 4, { railHasItems: f.railHasItems, railLinks: f.railLinks });
      // A marker that cannot act is no failure of a pass: nothing is logged.
      check(scope, 'no pass failed: nothing on the console, no page error', o.consoleErrors.length === 0 && o.pageErrors.length === 0, o.consoleErrors.concat(o.pageErrors).join(' | '));
      await checkExports(scope, browser, o.page, dir, 'markierung', READONLY, markerPage);
      // "Mit Editor": the saved file renders its document again when it is opened.
      const saved = path.join(dir, 'markierung-mit-editor.html');
      await download(o.page, 'full', saved);
      await o.context.close();
      o = await open(browser, saved, editorReady);
      markerPage(scope + ', mit-editor', await facts(o.page), '');
      check(scope + ', mit-editor', 'opens without an error', o.consoleErrors.length === 0 && o.pageErrors.length === 0, o.consoleErrors.concat(o.pageErrors).join(' | '));
      await o.context.close();
    });

    // ----- 8. a facet filter: a marker that cannot act beside one that can; a value chosen while the files are written
    await attempt(name + ' a facet filter', async () => {
      const scope = name + ' a facet filter';
      let o = await open(browser, opts.file, editorReady);
      await typeAndRender(o.page, DOC_FACETS);
      // Chooses the control at this place in the first filter of the page, through its label.
      const choose = (page, k) => page.evaluate(k => {
        const container = document.querySelector('#preview') || document.querySelector('main.reader-body #d') || document.querySelector('main.reader-body');
        container.querySelectorAll('.dokufix-facets .dokufix-facet-bar > .dokufix-facet-controls > label')[k].click();
      }, k);
      const all = FACET_ROWS_CHOSEN.map(() => true);
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      // What a file has to show when it opens, and that it filters there.
      const facetPage = async (s, x, text, page) => {
        checkWarning(s, x, [FACET_WARNING], 'naming the marker and what is wrong with it', STYLED_ONE_LINE);
        check(s, 'the warning stands at the marker\'s place, and its table stays a table, in its wrapper', x.warnings.length === 1 && x.warnings[0].before === 'H2#wirkt-nicht' && x.warnings[0].after === 'DIV.dokufix-table' && x.tables === '3 tables, 3 wrapped',
          { warnings: x.warnings.map(w => [w.before, w.after]), tables: x.tables });
        const group = x.facets[0];
        check(s, 'the working markers took effect: a facet filter with a control per value and its row count, shown, and a second one in the footnote; no marker is left',
          x.facets.length === 2 && group.controls === FACET_CONTROLS && group.bar === 'block' && group.next === 'H2#wirkt-nicht' && x.facets[1].controls === FACET_CONTROLS_IN_FOOTNOTE && x.markersLeft === 0, { facets: x.facets, markersLeft: x.markersLeft });
        check(s, 'the preview of the footnote holds the text of its table and none of the controls of its filter',
          x.previewTexts.length === 1 && /^Die Fußnote mit einer Tabelle\. Name Art a eins b zwei$/.test(x.previewTexts[0]) && x.previewControls === 0, { previewTexts: x.previewTexts, previewControls: x.previewControls });
        check(s, 'all rows are shown and the control for all rows is chosen, which alone carries "checked"',
          !!group && x.facets.every(y => same(y.chosen, [0]) && same(y.attribute, [0]) && y.shown.every(Boolean)) && same(group.shown, all), x.facets);
        check(s, 'the passes around it ran', x.headingsWithoutId === 0 && x.tocLinks >= 3 && x.previews === 1 && x.returnPaths === 1, x);
        if (s.endsWith('nur-lesen')) check(s, 'contains no <script>', !/<script/i.test(text));
        if (!group) return;
        await choose(page, FACET_CHOICE);
        const chosen = (await facts(page)).facets[0];
        check(s, 'choosing a value shows only its rows', same(chosen.chosen, [FACET_CHOICE]) && same(chosen.shown, FACET_ROWS_CHOSEN), chosen);
      };
      await facetPage(scope, await facts(o.page), '', o.page);
      const f = await facts(o.page);
      check(scope, 'the rail is built', f.railHasItems && f.railLinks >= 3, { railHasItems: f.railHasItems, railLinks: f.railLinks });
      // A marker its component refuses is no failure of a pass: nothing is logged.
      check(scope, 'no pass failed: nothing on the console, no page error', o.consoleErrors.length === 0 && o.pageErrors.length === 0, o.consoleErrors.concat(o.pageErrors).join(' | '));
      // What a download serialises is the markup. A copy of the preview, taken
      // with the value still chosen, carries "checked" on the control for all
      // rows and nowhere else.
      const copied = await o.page.evaluate(() => {
        const copy = document.getElementById('preview').cloneNode(true);
        return { chosenInThePage: Array.from(document.querySelectorAll('#preview .dokufix-facet-bar input')).findIndex(x => x.checked), written: copy.innerHTML.match(/<input[^>]*>/g) };
      });
      check(scope, 'with a value chosen, a copy of the preview as a download writes it carries "checked" on the control for all rows alone',
        copied.chosenInThePage === FACET_CHOICE && copied.written.length === 7 && copied.written.filter(t => /\bchecked\b/.test(t)).length === 2 && copied.written.filter(t => /\bchecked\b/.test(t)).every(t => /dokufix-facet-0/.test(t)), copied);
      // The four files, each written while the value is chosen. It is chosen
      // anew before every download: a read-only download renders, and a render
      // starts with all rows.
      for (const v of READONLY){
        await choose(o.page, FACET_CHOICE);
        check(scope + ', ' + v.key, 'the value is chosen in the page when the file is written', same((await facts(o.page)).facets[0].chosen, [FACET_CHOICE]));
        const file = path.join(dir, 'facetten-' + v.key + '.html');
        await download(o.page, v.download, file);
        const r = await open(browser, file, READY[v.key]);
        try {
          await facetPage(scope + ', ' + v.key, await facts(r.page), fs.readFileSync(file, 'utf8'), r.page);
          check(scope + ', ' + v.key, 'opens without an error', r.pageErrors.length === 0 && r.consoleErrors.length === 0, r.pageErrors.concat(r.consoleErrors).join(' | '));
        } finally { await r.context.close(); }
      }
      // "Mit Editor": the saved file renders its document again when it is opened.
      await choose(o.page, FACET_CHOICE);
      check(scope + ', mit-editor', 'the value is chosen in the page when the file is written', same((await facts(o.page)).facets[0].chosen, [FACET_CHOICE]));
      const saved = path.join(dir, 'facetten-mit-editor.html');
      await download(o.page, 'full', saved);
      await o.context.close();
      o = await open(browser, saved, editorReady);
      await facetPage(scope + ', mit-editor', await facts(o.page), '', o.page);
      check(scope + ', mit-editor', 'opens without an error', o.consoleErrors.length === 0 && o.pageErrors.length === 0, o.consoleErrors.concat(o.pageErrors).join(' | '));
      await o.context.close();
    });

    // ----- 9. a free-text filter: a marker that cannot act beside one that can; a term typed while the files are written
    await attempt(name + ' a free-text filter', async () => {
      const scope = name + ' a free-text filter';
      let o = await open(browser, opts.file, editorReady);
      await typeAndRender(o.page, DOC_FILTER);
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const all = FILTER_ROWS_TYPED.map(() => true);
      const typeTerm = (page, term) => page.locator(':is(#preview, main.reader-body) .dokufix-filter-input').first().fill(term, { timeout: 5000 });
      // What every file shows, with or without a field.
      const common = (s, x, text) => {
        checkWarning(s, x, [FILTER_WARNING], 'naming the marker', STYLED_ONE_LINE);
        check(s, 'the warning stands at the marker\'s place, and its paragraph stays a paragraph', x.warnings.length === 1 && x.warnings[0].before === 'H2#wirkt-nicht' && x.warnings[0].after === 'P.', x.warnings.map(w => [w.before, w.after]));
        check(s, 'the preview of the footnote holds the text of its table and no field', x.previewTexts.length === 1 && /^Die Fußnote mit einer Tabelle\. Name Art a eins b zwei$/.test(x.previewTexts[0]) && x.previewControls === 0, { previewTexts: x.previewTexts, previewControls: x.previewControls });
        check(s, 'no marker is left, and the passes around it ran', x.markersLeft === 0 && x.headingsWithoutId === 0 && x.tocLinks >= 3 && x.previews === 1 && x.returnPaths === 1 && x.tables === '2 tables, 2 wrapped', x);
        if (s.endsWith('nur-lesen')) check(s, 'contains no <script>', !/<script/i.test(text));
      };
      // An editor, schlank and kompakt: two fields, the one in the list of footnotes as well, all rows, and typing filters.
      const editorPage = async (s, x, page) => {
        common(s, x, '');
        check(s, 'two fields, each transient, empty, with its placeholder and the counter of all rows; all rows shown',
          same(x.filters.map(f => [f.placeholder, f.value, f.count, f.transient]), [['Merkmal suchen …', '', '5 Zeilen', true], ['Suchen …', '', '2 Zeilen', true]]) && x.filters.every(f => f.shown.every(Boolean)), x.filters);
        await typeTerm(page, FILTER_TERM);
        const typed = (await facts(page)).filters[0];
        check(s, 'typing shows only the rows with the term, and the counter says so', same(typed.shown, FILTER_ROWS_TYPED) && typed.count === '2 von 5 Zeilen', typed);
      };
      await editorPage(scope, await facts(o.page), o.page);
      // A marker that cannot act is no failure of a pass: nothing is logged.
      check(scope, 'no pass failed: nothing on the console, no page error', o.consoleErrors.length === 0 && o.pageErrors.length === 0, o.consoleErrors.concat(o.pageErrors).join(' | '));
      // The three read-only files, each written while the term is typed.
      for (const v of READONLY){
        await typeTerm(o.page, FILTER_TERM);
        const before = (await facts(o.page)).filters[0];
        check(scope + ', ' + v.key, 'the term is typed in the page when the file is written', before.value === FILTER_TERM && same(before.shown, FILTER_ROWS_TYPED), before);
        const file = path.join(dir, 'suchfeld-' + v.key + '.html');
        await download(o.page, v.download, file);
        const r = await open(browser, file, READY[v.key]);
        try {
          const x = await facts(r.page), text = fs.readFileSync(file, 'utf8');
          check(scope + ', ' + v.key, 'every row shown, none hidden', x.hiddenRows === 0 && same(x.rowsShown, [...all, true, true]), { hidden: x.hiddenRows, rows: x.rowsShown });
          if (v.key === 'nur-lesen'){
            // No script, so no field (Ben, 2026-10-03: the field in schlank and kompakt, not here).
            common(scope + ', ' + v.key, x, text);
            check(scope + ', ' + v.key, 'no field and no mark of the filter', x.filters.length === 0 && x.filterMarks === 0, { filters: x.filters, marks: x.filterMarks });
            check(scope + ', ' + v.key, 'outside its stylesheet the file holds nothing of the filter', !/dokufix-filter/.test(text.replace(/<style>[\s\S]*?<\/style>/g, '')));
          } else {
            // The filter's code runs when the file opens: both tables keep their mark and get their field.
            check(scope + ', ' + v.key, 'both filter tables keep their mark', x.filterMarks === 2, x.filterMarks);
            await editorPage(scope + ', ' + v.key, x, r.page);
          }
          check(scope + ', ' + v.key, 'opens without an error', r.pageErrors.length === 0 && r.consoleErrors.length === 0, r.pageErrors.concat(r.consoleErrors).join(' | '));
        } finally { await r.context.close(); }
      }
      // "Mit Editor": written while the term is typed; it opens with all rows and a field that filters.
      await typeTerm(o.page, FILTER_TERM);
      check(scope + ', mit-editor', 'the term is typed in the page when the file is written', (await facts(o.page)).filters[0].value === FILTER_TERM);
      const saved = path.join(dir, 'suchfeld-mit-editor.html');
      await download(o.page, 'full', saved);
      await o.context.close();
      o = await open(browser, saved, editorReady);
      await editorPage(scope + ', mit-editor', await facts(o.page), o.page);
      check(scope + ', mit-editor', 'opens without an error', o.consoleErrors.length === 0 && o.pageErrors.length === 0, o.consoleErrors.concat(o.pageErrors).join(' | '));
      await o.context.close();
    });

    // ----- 10. a BPMN block that cannot be drawn, beside valid ones
    await attempt(name + ' a BPMN block that cannot be drawn', async () => {
      const scope = name + ' a BPMN block that cannot be drawn';
      let o = await open(browser, opts.file, editorReady);
      const bodyBefore = await o.page.evaluate(() => Array.from(document.body.children).map(el => el.tagName + '.' + el.className).join(' '));
      await typeAndRender(o.page, DOC_BPMN);
      const drawnPage = (s, x, text) => {
        checkWarning(s, x, [bpmnWarningText('Kaputt'), 'unparsable content'], 'naming the diagram and the reason');
        check(s, 'the warning stands where the diagram would be', x.warnings.length === 1 && x.warnings[0].before === 'H2#kaputt', x.warnings.map(w => w.before));
        const credit = BPMN_CREDIT.before + '<a href="' + BPMN_CREDIT.href + '">' + BPMN_CREDIT.text + '</a>';
        check(s, 'the other two are drawn, each with "' + BPMN_CREDIT.before + BPMN_CREDIT.text + '" below it, the name a link', x.bpmn.join('|') === 'Gut true ' + credit + '|Noch eins true ' + credit, x.bpmn);
        check(s, 'the passes around it ran', x.headingsWithoutId === 0 && x.tocLinks >= 4 && x.previews === 1 && x.returnPaths === 1, x);
        checkViewControls(s, x);
        if (text){
          // Nothing of the library: no tag or URL, none of its code, not the comment of its export.
          const library = /BpmnJS|bpmn-navigated-viewer|npm\/bpmn-js|created with bpmn-js/;
          check(s, 'the file carries nothing of bpmn-js: no tag, no URL, no code, not the comment of its export', !library.test(text), (text.match(new RegExp('.{0,40}(' + library.source + ').{0,40}')) || [''])[0]);
        }
        if (s.endsWith('nur-lesen')) check(s, 'contains no <script>', !/<script/i.test(text));
      };
      const f = await facts(o.page);
      drawnPage(scope, f, '');
      const bodyAfter = await o.page.evaluate(() => Array.from(document.body.children).map(el => el.tagName + '.' + el.className).join(' '));
      check(scope, 'nothing of the drawing is left in <body>: no host, the children it had', f.hosts === 0 && bodyAfter === bodyBefore, { hosts: f.hosts, before: bodyBefore, after: bodyAfter });
      check(scope, 'the rail is built', f.railHasItems && f.railLinks >= 4, { railHasItems: f.railHasItems, railLinks: f.railLinks });
      checkErrors(scope, o, ['BPMN error']);
      await checkExports(scope, browser, o.page, dir, 'bpmn', READONLY, drawnPage);
      // "Mit Editor": the saved file renders its document again when it is opened.
      const saved = path.join(dir, 'bpmn-mit-editor.html');
      await download(o.page, 'full', saved);
      await o.context.close();
      o = await open(browser, saved, editorReady);
      const g = await facts(o.page);
      drawnPage(scope + ', mit-editor', g, '');
      check(scope + ', mit-editor', 'no host of the drawing in the page', g.hosts === 0, g.hosts);
      checkErrors(scope + ', mit-editor', o, ['BPMN error']);
      await o.context.close();
    });

    // ----- 11. bpmn-js cannot be loaded
    await attempt(name + ' bpmn-js cannot be loaded', async () => {
      const scope = name + ' bpmn-js cannot be loaded';
      const o = await open(browser, opts.file, editorReady, { withoutBpmn: true });
      await typeAndRender(o.page, DOC_NO_LIBRARY);
      const withoutLibrary = (s, x, text) => {
        checkWarning(s, x, [bpmnWarningText('BPMN'), BPMN_NO_LIBRARY], 'that the library was not loaded');
        check(s, 'the warning stands in place of the BPMN diagram', x.warnings.length === 1 && x.warnings[0].before === 'H2#bpmn', x.warnings.map(w => w.before));
        check(s, 'the rest renders: the Mermaid diagram in its figure, the passes around it', x.diagrams === 1 && x.figures.join('|') === 'Mermaid' && x.bpmn.length === 0 &&
          x.headingsWithoutId === 0 && x.tocLinks >= 3 && x.previews === 1 && x.returnPaths === 1, x);
        checkViewControls(s, x);
        if (s.endsWith('nur-lesen')) check(s, 'contains no <script>', !/<script/i.test(text));
      };
      const f = await facts(o.page);
      withoutLibrary(scope, f, '');
      check(scope, 'the rail is built', f.railHasItems && f.railLinks >= 3, { railHasItems: f.railHasItems, railLinks: f.railLinks });
      check(scope, 'the library was asked for and not loaded', await o.page.evaluate(() => typeof BpmnJS === 'undefined'));
      checkErrors(scope, o, ['BPMN error']);
      await checkExports(scope, browser, o.page, dir, 'ohne-bpmn-js', READONLY, withoutLibrary);
      await o.context.close();
    });

    // ----- 12. BPMN without coordinates: one laid out, two that cannot be
    await attempt(name + ' BPMN without coordinates', async () => {
      const scope = name + ' BPMN without coordinates';
      let o = await open(browser, opts.file, editorReady);
      const bodyBefore = await o.page.evaluate(() => Array.from(document.body.children).map(el => el.tagName + '.' + el.className).join(' '));
      await typeAndRender(o.page, DOC_LAYOUT);
      const credit = BPMN_CREDIT.before + '<a href="' + BPMN_CREDIT.href + '">' + BPMN_CREDIT.text + '</a>';
      const laidOut = (s, x, text) => {
        const visible = x.warnings.filter(w => !w.transient);
        check(s, 'two warnings, each naming its diagram and the reason the layout gives, where the diagram would be',
          visible.length === 2 && visible[0].text.includes(bpmnWarningText('Mehrere Pools')) && visible[0].text.includes(LAYOUT_SEVERAL_POOLS) && visible[0].before === 'H2#mehrere-pools' &&
          visible[1].text.includes(bpmnWarningText('Ohne Bahn')) && visible[1].text.includes(layoutStrayText(['Verbuchen', 'Ablegen'])) && visible[1].before === 'H2#ohne-bahn',
          visible.map(w => [w.before, w.text]));
        check(s, 'the warnings are styled by the document styles', visible.every(w => isStyled(w)), visible.map(w => w.style));
        check(s, 'the block without coordinates is drawn, with "' + BPMN_CREDIT.before + BPMN_CREDIT.text + '" below it', x.bpmn.join('|') === 'Angeordnet true ' + credit, x.bpmn);
        check(s, 'no Mermaid error picture', x.errorPictures === 0, x.errorPictures);
        check(s, 'the passes around it ran', x.headingsWithoutId === 0 && x.tocLinks >= 4 && x.previews === 1 && x.returnPaths === 1, x);
        checkViewControls(s, x);
        if (text){
          const library = /BpmnJS|bpmn-navigated-viewer|npm\/bpmn-js|created with bpmn-js/;
          check(s, 'the file carries nothing of bpmn-js: no tag, no URL, no code, not the comment of its export', !library.test(text), (text.match(new RegExp('.{0,40}(' + library.source + ').{0,40}')) || [''])[0]);
          check(s, 'the file carries nothing of Mermaid\'s layout: no URL, no swimlane, no node id of its, not the render id', !LAYOUT_TRACES.test(text), (text.match(new RegExp('.{0,40}(' + LAYOUT_TRACES.source + ').{0,40}')) || [''])[0]);
        }
        if (s.endsWith('nur-lesen')) check(s, 'contains no <script>', !/<script/i.test(text));
      };
      const f = await facts(o.page);
      laidOut(scope, f, '');
      const bodyAfter = await o.page.evaluate(() => Array.from(document.body.children).map(el => el.tagName + '.' + el.className).join(' '));
      check(scope, 'nothing of the drawing or the layout is left in <body>: no host, the children it had, nothing of Mermaid\'s outside the preview',
        f.hosts === 0 && bodyAfter === bodyBefore && f.mermaidOutside.length === 0,
        { hosts: f.hosts, before: bodyBefore, after: bodyAfter, outside: f.mermaidOutside });
      check(scope, 'no element of Mermaid\'s layout anywhere in the page', await o.page.evaluate(() => document.querySelectorAll('[id^="dokufix-bpmn-layout"], [id^="ddokufix-bpmn-layout"], .swimlane').length === 0));
      check(scope, 'the rail is built', f.railHasItems && f.railLinks >= 4, { railHasItems: f.railHasItems, railLinks: f.railLinks });
      checkErrors(scope, o, ['BPMN error']);
      await checkExports(scope, browser, o.page, dir, 'anordnung', READONLY, laidOut);
      const saved = path.join(dir, 'anordnung-mit-editor.html');
      await download(o.page, 'full', saved);
      await o.context.close();
      o = await open(browser, saved, editorReady);
      const g = await facts(o.page);
      laidOut(scope + ', mit-editor', g, '');
      check(scope + ', mit-editor', 'no host of the drawing or the layout in the page', g.hosts === 0, g.hosts);
      checkErrors(scope + ', mit-editor', o, ['BPMN error']);
      await o.context.close();
    });

    // ----- 13. Mermaid cannot be loaded, bpmn-js can
    await attempt(name + ' Mermaid cannot be loaded', async () => {
      const scope = name + ' Mermaid cannot be loaded';
      const o = await open(browser, opts.file, editorReady, { withoutMermaid: true });
      await typeAndRender(o.page, DOC_NO_MERMAID);
      const credit = BPMN_CREDIT.before + '<a href="' + BPMN_CREDIT.href + '">' + BPMN_CREDIT.text + '</a>';
      const withoutMermaid = (s, x, text) => {
        const visible = x.warnings.filter(w => !w.transient);
        check(s, 'two warnings: the Mermaid diagram and the BPMN diagram without coordinates, each saying that Mermaid was not loaded, where the diagram would be',
          visible.length === 2 && visible[0].text.includes('Ein Diagramm konnte nicht gezeichnet werden.') && visible[0].text.includes(MERMAID_NO_LIBRARY) && visible[0].before === 'H2#fluss' &&
          visible[1].text.includes(bpmnWarningText('Ohne Koordinaten')) && visible[1].text.includes(BPMN_NO_MERMAID) && visible[1].before === 'H2#ohne-koordinaten',
          visible.map(w => [w.before, w.text]));
        check(s, 'the BPMN diagram with coordinates is drawn with its credit, and the passes around it ran',
          x.bpmn.join('|') === 'Mit Koordinaten true ' + credit && x.diagrams === 1 && x.headingsWithoutId === 0 && x.tocLinks >= 4 && x.previews === 1 && x.returnPaths === 1, x);
        checkViewControls(s, x);
        check(s, 'the drawn BPMN diagram keeps its source link, the refused ones have none', JSON.stringify(x.sourceLinks) === JSON.stringify(['Mit-Koordinaten.bpmn']), x.sourceLinks);
        if (s.endsWith('nur-lesen')) check(s, 'contains no <script>', !/<script/i.test(text));
      };
      const f = await facts(o.page);
      withoutMermaid(scope, f, '');
      check(scope, 'the script ran: the rail is built', f.railHasItems && f.railLinks >= 4, { railHasItems: f.railHasItems, railLinks: f.railLinks });
      check(scope, 'Mermaid was asked for and not loaded; bpmn-js is there', await o.page.evaluate(() => typeof mermaid === 'undefined' && typeof BpmnJS === 'function'));
      check(scope, 'no host left in the page', f.hosts === 0, f.hosts);
      checkErrors(scope, o, ['Mermaid error', 'BPMN error']);
      await checkExports(scope, browser, o.page, dir, 'ohne-mermaid', READONLY, withoutMermaid);
      await o.context.close();
    });

    // ----- 5. a pass throws (the copy with two passes more)
    await attempt(name + ' a pass throws', async () => {
      const scope = name + ' a pass throws';
      const o = await open(browser, copyWithPasses, editorReady);
      const f = await facts(o.page);   // the demo text: metadata, table of contents, footnotes, its ten diagrams
      checkWarning(scope, f, ['Der Schritt „' + THROWING_PASS + '“ ist fehlgeschlagen.', THROWING_MESSAGE], 'naming the pass');
      const firstContent = f.children.findIndex(c => c !== 'div.dokufix-warning');
      check(scope, 'the warnings stand at the top of the document', firstContent === f.warnings.length && f.children[firstContent] === 'details.dokufix-frontmatter', f.children.slice(0, 5));
      check(scope, 'every other document pass ran: metadata, heading ids, table of contents, footnote previews, return paths, diagrams',
        f.panel && f.headingsWithoutId === 0 && f.tocLinks > 0 && f.markers > 0 && f.previews === f.markers && f.returnPaths > 0 && f.diagrams === DEMO_DIAGRAMS && f.errorPictures === 0, f);
      check(scope, 'the rail is built', f.railHasItems && f.railLinks >= 4, { railHasItems: f.railHasItems, railLinks: f.railLinks });
      const live = f.warnings.filter(w => w.transient);
      check(scope, 'the run-time pass that threw has its warning in the page, marked transient',
        live.length === 1 && live[0].text.includes('„' + RUNTIME_PASS + '“') && live[0].text.includes(RUNTIME_MESSAGE) && isStyled(live[0]), f.warnings);
      check(scope, 'and the element it added is in the page', await o.page.evaluate(id => !!document.querySelector('#preview #' + id + '[data-dokufix-transient]'), TRANSIENT_ID));
      // The names only: Firefox prints an error object on the console as "Error".
      checkErrors(scope, o, ['Pass "' + THROWING_PASS + '" failed', 'Pass "' + RUNTIME_PASS + '" failed']);
      await checkExports(scope, browser, o.page, dir, 'schritt', READONLY, (s, x, text) => {
        checkWarning(s, x, ['Der Schritt „' + THROWING_PASS + '“ ist fehlgeschlagen.', THROWING_MESSAGE], 'naming the pass');
        check(s, 'it is the first thing in the document, and the rest is there', x.children[0] === 'div.dokufix-warning' && x.children[1] === 'details.dokufix-frontmatter' && x.tocLinks > 0 && x.diagrams === DEMO_DIAGRAMS, x.children.slice(0, 4));
        check(s, 'nothing transient: neither the run-time warning nor the element of the run-time pass',
          onlyOwnTransient(s, x) && x.warnings.length === 1 && !text.includes(TRANSIENT_ID) && !withoutScripts(text).includes('data-dokufix-transient') && !text.includes(RUNTIME_PASS), x.warnings.map(w => w.text));
        if (s.endsWith('nur-lesen')) check(s, 'contains no <script>', !/<script/i.test(text));
      });
      await o.context.close();
    });

    // ----- 6. an export step throws (the copy with one export step more)
    await attempt(name + ' an export step throws', async () => {
      const o = await open(browser, copyWithExportStep, editorReady);
      await editMode(o.page);
      for (const v of READONLY){
        const scope = name + ' an export step throws, ' + v.key;
        const before = o.dialogs.length;
        await o.page.click('#download-btn');
        await Promise.all([
          o.page.waitForEvent('dialog', { timeout: 60000 }),
          o.page.click('button[data-download="' + v.download + '"]'),
        ]);
        await o.page.waitForFunction(() => !document.querySelector('button[data-download]:disabled'));
        await o.page.waitForTimeout(QUIET_WINDOW);   // a download that started after all would show up by now
        const said = o.dialogs.slice(before);
        check(scope, 'one dialog says that the download failed, and why',
          said.length === 1 && said[0].type === 'alert' && said[0].message.includes('Der Download ist fehlgeschlagen') && said[0].message.includes(EXPORT_STEP_MESSAGE), said);
        check(scope, 'no download starts', o.downloads.length === 0, o.downloads);
        check(scope, 'the download buttons are enabled again', await o.page.evaluate(() => document.querySelectorAll('button[data-download]:disabled').length === 0
          && document.querySelectorAll('button[data-download]').length === 4));
      }
      const scope = name + ' an export step throws';
      check(scope, 'the error is on the console, once per download', o.consoleErrors.filter(e => e.includes('Download failed')).length === READONLY.length, o.consoleErrors.join(' | ').slice(0, 400) || 'nothing logged');
      check(scope, 'no page error and no rejected promise', o.pageErrors.length === 0, o.pageErrors.join(' | '));
      await o.context.close();
    });
  } finally {
    await browser.close();
  }
}

// ---------- main ----------
const opts = parseArgs(process.argv.slice(2));
// The libraries, served to every context from tests/.cdn/ (tests/cdn.mjs); a
// missing one is fetched once, before anything is built.
let libraries;
try { libraries = await prepareLibraries(opts.file); }
catch (e){ console.error(e.message); process.exit(1); }
fs.rmSync(opts.out, { recursive: true, force: true });
fs.mkdirSync(opts.out, { recursive: true });
const copyWithPasses = buildCopy(opts.out, 'app/render.js', PASS_EDITS, 'mit-werfenden-schritten.html');
const copyWithExportStep = buildCopy(opts.out, 'app/downloads/export-body.js', EXPORT_EDITS, 'mit-werfendem-exportschritt.html');

const names = opts.browser === 'all' ? ['chromium', 'firefox'] : [opts.browser];
// The browsers run side by side, each in its own folder. Their checks land in
// one list in the order they happen; the report lists them per browser.
await Promise.all(names.map(name => runBrowser(name, opts, copyWithPasses, copyWithExportStep)));

const byBrowser = r => names.findIndex(n => r.scope.startsWith(n));
results.sort((a, b) => byBrowser(a) - byBrowser(b));
const failed = results.filter(r => !r.ok);
for (const r of results) console.log((r.ok ? 'ok    ' : 'FAIL  ') + r.scope + ': ' + r.name + (r.detail ? ' — ' + r.detail : ''));
console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' green; exports and saved files: ' + opts.out);
console.log(librariesLine(libraries));
// A library the page asked for that is not pinned in the file under test was not fetched.
if (libraries.refused.length) console.log('refused, not pinned in the file under test: ' + libraries.refused.join(', '));
process.exit(failed.length || libraries.refused.length ? 1 : 0);
