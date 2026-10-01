// node build.mjs
// 1. baut spike.html (Markdown + CSS + JS in eine Datei, Bibliotheken vom CDN wie im PoC)
// 2. rendert sie im Headless-Chromium und schreibt dist/beispiel-prozesse.nur-lesen.html (ohne jedes <script>)
// 3. macht Screenshots des Exports: hell, dunkel, mobil
// Jede Erwartung wird geprüft. Schlägt eine fehl, endet der Lauf mit Exit-Code 1.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { assemble, exportStatic, here } from './assemble.mjs';

const sizes = {};
const failures = [];
const expect = (label, actual, wanted) => {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  console.log((ok ? 'ok    ' : 'FEHLER') + ' ' + label + ': ' + JSON.stringify(actual) + (ok ? '' : ' (erwartet ' + JSON.stringify(wanted) + ')'));
  if (!ok) failures.push(label);
};

const spike = assemble(fs.readFileSync(path.join(here, 'beispiel-prozesse.md'), 'utf8'));
fs.writeFileSync(path.join(here, 'spike.html'), spike);
sizes['spike.html (ohne die Bibliotheken vom CDN)'] = Buffer.byteLength(spike);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium' });
const shots = path.join(here, 'dist', 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const pageErrors = [];

async function open(file, opts = {}) {
  const page = await browser.newPage({ viewport: { width: opts.width || 1440, height: 900 }, colorScheme: opts.dark ? 'dark' : 'light' });
  page.on('console', m => { if (m.type() === 'error') pageErrors.push(path.basename(file) + ': ' + m.text().slice(0, 240)); });
  page.on('pageerror', e => pageErrors.push(path.basename(file) + ': ' + String(e).slice(0, 240)));
  await page.goto('file://' + file);
  if (opts.waitReady) await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return page;
}

// --- Spike rendern, JS-freien Export ziehen ---
let page = await open(path.join(here, 'spike.html'), { waitReady: true });
await page.screenshot({ path: path.join(shots, 'spike-hell.png'), fullPage: true });
const stats = await page.evaluate(() => ({
  navLinks: document.querySelectorAll('.dokufix-nav > a').length,
  navGroups: document.querySelectorAll('.dokufix-navgrp').length,
  cards: document.querySelectorAll('ul.dokufix-cards > li').length,
  cardTitles: document.querySelectorAll('.dokufix-card-title').length,
  steps: document.querySelectorAll('ol.dokufix-steps > li').length,
  who: document.querySelectorAll('.dokufix-who').length,
  callouts: document.querySelectorAll('.dokufix-callout').length,
  chips: document.querySelectorAll('.dokufix-chip').length,
  tables: document.querySelectorAll('table').length,
  subLines: document.querySelectorAll('.dokufix-sub').length,
  diagrams: document.querySelectorAll('.dokufix-diagram svg:not([aria-roledescription="error"])').length,
  bpmnDiagrams: document.querySelectorAll('.dokufix-diagram-bpmn svg').length,
  lanes: document.querySelectorAll('.dokufix-diagram .dokufix-bpmn-lane').length,
  bpmnDownloads: document.querySelectorAll('.dokufix-diagram figcaption a[download$=".bpmn"]').length,
  warnings: document.querySelectorAll('.dokufix-warnung').length,
  leftoverPragmas: (document.querySelector('main').innerHTML.match(/<!--\s*dokufix/g) || []).length,
  leftoverAlertMarkers: (document.querySelector('main').textContent.match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gi) || []).length
}));
// Sollwerte = gezählte Elemente der Vorlage, die der Spike nachgebaut hat (siehe docs/komponenten-aus-markdown.md).
// Das Beispieldokument im Repo ist frei erfunden und hat dieselbe Anzahl jeder Komponente.
// Ausnahme: Die Diagramme 3 bis 5 (Prozess 4) gab es in der Vorlage nicht. Sie zeigen weitere BPMN-Symbole, dreimal derselbe
// Ablauf: aus Mermaid-Text, aus BPMN-XML mit eigenen Koordinaten (diagramme/uebergabe.mjs) und aus BPMN-XML ohne Koordinaten.
expect('Komponenten im Spike', stats, { navLinks: 13, navGroups: 4, cards: 6, cardTitles: 6, steps: 17, who: 13, callouts: 10, chips: 11, tables: 14, subLines: 5, diagrams: 5, bpmnDiagrams: 5, lanes: 20, bpmnDownloads: 5, warnings: 0, leftoverPragmas: 0, leftoverAlertMarkers: 0 });
const symbols = ['parallelgateway', 'intermediatecatchevent', 'sendtask', 'usertask', 'servicetask', 'callactivity', 'exclusivegateway', 'startevent', 'endevent', 'sequenceflow'];
expect('Diagramm 3 (Mermaid), 4 (XML) und 5 (XML ohne Koordinaten): dieselben Symbole, darunter Parallel-Gateways, Nachrichten-Ereignis, Sende-, Benutzer-, Service-Aufgaben, Aufruf-Aktivität',
  await page.evaluate(names => [2, 3, 4].map(i => names.map(n => document.querySelectorAll('figure.dokufix-diagram-bpmn')[i].querySelectorAll('.dokufix-bpmn-' + n).length)), symbols), [[2, 1, 3, 2, 1, 1, 2, 1, 3, 17], [2, 1, 3, 2, 1, 1, 2, 1, 3, 17], [2, 1, 3, 2, 1, 1, 2, 1, 3, 17]]);
// Zwei Abgänge an derselben Ecke eines Gateways („Abmeldung“, „Anfrage“): Beschriftungen dürfen nicht aufeinander liegen
expect('Diagramm 3: Kantenbeschriftungen überlappen sich nicht', await page.evaluate(() => {
  const xml = decodeURIComponent(document.querySelectorAll('figure.dokufix-diagram-bpmn')[2].querySelector('a[download]').getAttribute('href').split(',').slice(1).join(','));
  const boxes = [...xml.matchAll(/<bpmndi:BPMNEdge[^>]*>.*?<bpmndi:BPMNLabel><dc:Bounds x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)"/g)].map(m => m.slice(1).map(Number));
  let overlaps = 0;
  boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => { if (a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]) overlaps++; }));
  return [boxes.length, overlaps];
}), [5, 0]);
// Diagramm 5 hat im Markdown keine Koordinaten. Die heruntergeladene Datei hat sie, das Original steht unverändert davor.
expect('Diagramm 5: Download enthält das Original und die errechneten Koordinaten (Formen, Kanten)', await page.evaluate(() => {
  const xml = decodeURIComponent(document.querySelectorAll('figure.dokufix-diagram-bpmn')[4].querySelector('a[download]').getAttribute('href').split(',').slice(1).join(','));
  return [xml.includes('<bpmn:parallelGateway id="Teilen"/>'), (xml.match(/<bpmndi:BPMNShape /g) || []).length, (xml.match(/<bpmndi:BPMNEdge /g) || []).length];
}), [true, 21, 17]);
console.log('       Diagrammbreiten:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.dokufix-diagram svg')].map(s => Math.round(s.viewBox.baseVal.width)))));

const exported = await page.evaluate(exportStatic);
const exportFile = path.join(here, 'dist', 'beispiel-prozesse.nur-lesen.html');
fs.writeFileSync(exportFile, exported.html);
sizes['dist/beispiel-prozesse.nur-lesen.html'] = Buffer.byteLength(exported.html);
expect('ausführbares JavaScript im Export (script, on*-Attribute, javascript:-URLs)',
  [(exported.html.match(/<script/gi) || []).length, exported.handlers, exported.jsUrls], [0, 0, 0]);
console.log('       externe Adressen im Export:', JSON.stringify([...new Set(exported.html.match(/(?:href|src)="https?:\/\/[^"/]+/g) || [])]));
await page.close();

// --- Screenshots des Exports ---
for (const [name, file, opts] of [
  ['export-hell', exportFile, {}],
  ['export-dunkel', exportFile, { dark: true }],
  ['export-mobil', exportFile, { width: 420 }]
]) {
  page = await open(file, opts);
  await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: true });
  await page.close();
}

// --- CSS-only-Facettenfilter im JS-freien Export prüfen (JavaScript im Browser abgeschaltet) ---
// reducedMotion: sonst kollidiert scroll-behavior:smooth mit Playwrights Scroll-vor-Klick (Harness-Effekt, kein Produktfehler)
const ctx = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
page = await ctx.newPage();
await page.goto('file://' + exportFile);
const before = await page.locator('.dokufix-table[id] tbody tr:visible').count();
await page.locator('.dokufix-facet-ui label', { hasText: 'Datum' }).click();
const after = await page.locator('.dokufix-table[id] tbody tr:visible').count();
await page.locator('.dokufix-table[id]').screenshot({ path: path.join(shots, 'export-facette-datum-ohne-js.png') });
expect('Facettenfilter ohne JS, Zeilen vor und nach Klick auf „Datum“', [before, after], [14, 2]);
await page.emulateMedia({ media: 'print' });
expect('Druckansicht zeigt trotz gewählter Facette alle Zeilen', await page.locator('.dokufix-table[id] tbody tr:visible').count(), 14);
await ctx.close();

// --- Freitextfilter im Spike (mit JS) ---
page = await open(path.join(here, 'spike.html'), { waitReady: true });
await page.locator('.dokufix-filter-ui input').fill('tour');
expect('Freitextfilter „tour“', await page.locator('.dokufix-filter-ui span').textContent(), '4 von 14 Zeilen');
await page.locator('.dokufix-table[data-filter]').screenshot({ path: path.join(shots, 'spike-filter-tour.png') });
// Export aus einer Seite mit aktivem Filter darf keine versteckten Zeilen mitnehmen
const dirty = await page.evaluate(exportStatic);
expect('Export bei aktivem Filter: versteckte Zeilen', (dirty.html.match(/<tr[^>]*\shidden/g) || []).length, 0);
await page.close();

await browser.close();
expect('Fehler in der Browser-Konsole', pageErrors, []);
sizes['beispiel-prozesse.md'] = fs.statSync(path.join(here, 'beispiel-prozesse.md')).size;
console.log('Größen (Bytes):', JSON.stringify(sizes, null, 1));
if (failures.length) { console.error(failures.length + ' Prüfung(en) fehlgeschlagen.'); process.exit(1); }
