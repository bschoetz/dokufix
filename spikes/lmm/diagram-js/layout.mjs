// Die Wirkung auf das Layout: Für wie viele der 57 Fixtures ergibt der Prototyp in Node dasselbe angeordnete XML wie
// die Größen, die bpmn-js im selben Chromium gemessen hat? Die Vergleichsgrößen stammen aus
//   CHROMIUM=/opt/pw-browsers/chromium node tests/capture-bpmn.mjs --out spikes/lmm/diagram-js/groessen-hier tests/fixtures/bpmn-layout/*.bpmn
// Angeordnet wird wie tests/bpmn-fixtures.mjs (readModel → layoutGeometry → appendDiagram), mit den Rohpositionen
// der Fixtures (Mermaid 12.0.0; der Lauf hier liefert dieselben, das wird mitgeprüft).
//   node layout.mjs
import fs from 'node:fs';
import { messer, breitenFunktion } from './messer.mjs';

const R = '/home/user/dokufix/';
const HIER = new URL('./groessen-hier/', import.meta.url).pathname; // in diesem Chromium erfasst (capture-bpmn.mjs --out), aus dem Scratchpad gesichert
const { fixtureNames, readFixture, readModel, measureOf, expectedFile } = await import(R + 'tests/bpmn-fixtures.mjs');
const { layoutGeometry, appendDiagram, labelSize } = await import(R + 'src/app/bpmn-layout.js');
const read = f => JSON.parse(fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8'));
const INTER = read('breiten-inter-12px.json'), LIB = read('breiten-liberation-sans-12px.json');

const layOut = (fx, measure) => { const { model } = readModel(fx.xml); return appendDiagram(fx.xml, model, layoutGeometry(model, fx.raw, measure)).xml; };
const candidates = {
  'Prototyp, Inter, mit Kerning': () => messer(INTER),
  'Prototyp, Inter, ohne Kerning': () => messer(INTER, { kerning: false }),
  'Prototyp, Liberation Sans (andere Schrift)': () => messer(LIB),
  'heute: labelSize()': () => labelSize,
  'gespeicherte Größen (anderer Rechner)': fx => measureOf(fx.sizes, 'measured'),
};
const names = fixtureNames();
const counts = Object.fromEntries(Object.keys(candidates).map(k => [k, { same: 0, differ: [] }]));
let rawSame = 0, sizesSameAsStored = 0, measuredFileSame = 0, rawLayoutSame = 0;
for (const name of names){
  const fx = readFixture(name);
  const sizesHier = JSON.parse(fs.readFileSync(HIER + name + '.sizes.json', 'utf8'));
  const rawHier = JSON.parse(fs.readFileSync(HIER + name + '.raw.json', 'utf8'));
  if (JSON.stringify(rawHier) === JSON.stringify(fx.raw)) rawSame++;
  if (JSON.stringify(sizesHier) === JSON.stringify(fx.sizes)) sizesSameAsStored++;
  const reference = layOut(fx, measureOf(sizesHier, 'measured'));
  if (reference === fs.readFileSync(expectedFile(name, 'measured'), 'utf8')) measuredFileSame++;
  // Die Rohpositionen von hier statt der gespeicherten: dasselbe Bild? (Nur die Ordnung der cx zählt.)
  if (layOut({ ...fx, raw: rawHier }, measureOf(sizesHier, 'measured')) === reference) rawLayoutSame++;
  for (const [k, make] of Object.entries(candidates)){
    const xml = layOut(fx, make(fx));
    if (xml === reference) counts[k].same++; else counts[k].differ.push(name);
  }
}
console.log('Fixtures:', names.length, '| Rohpositionen hier gleich den gespeicherten:', rawSame, '| Größen hier gleich den gespeicherten (anderer Rechner):', sizesSameAsStored, '| Referenz-XML gleich der gespeicherten measured-Datei:', measuredFileSame, '| Layout mit den Rohpositionen von hier gleich:', rawLayoutSame);
console.log('\n| Messer in Node | XML gleich der Chromium-Messung | anders |');
console.log('|---|---|---|');
for (const [k, c] of Object.entries(counts)) console.log(`| ${k} | ${c.same} / ${names.length} | ${c.differ.length ? c.differ.join(', ') : '–'} |`);
fs.writeFileSync(new URL('./layout.json', import.meta.url), JSON.stringify({ fixtures: names.length, rawSame, sizesSameAsStored, measuredFileSame, rawLayoutSame, counts }, null, 1));
