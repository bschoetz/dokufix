// Der ganze Weg mit dem Prototyp, ohne Browser und ohne Mermaid: parseXml()
// → readProcess() → kanonisch() (spikes/lmm/kanonisch) → layoutGeometry()
// → appendDiagram(), für jeden Fall, den readProcess() annimmt. Geprüft wird,
// was appendDiagram() per Text voraussetzt:
//   - das Ergebnis ist wohlgeformt (der Prototyp liest es wieder) und Chromium
//     liest es genauso (gleiches Modell)
//   - genau ein BPMNDiagram, vor dem letzten schließenden definitions-Tag,
//     jede id darin neu (kein Zusammenstoß mit einer id des Autors, auch nicht
//     mit einer in Kommentar oder CDATA)
//   - BOM und Zeilenenden: was vorn stand, steht noch vorn; die eingefügten
//     Zeilen enden mit \n, auch in einer \r\n-Datei (gemischte Zeilenenden)
//   - das Modell aus dem Ergebnis hat dieselben Knoten, Flüsse und Notizen
// Schreibt ergebnisse/durchlauf.md.
//
//   node durchlauf.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProcess, layoutGeometry, appendDiagram, labelSize } from '/home/user/dokufix/src/app/bpmn-layout.js';
import { kanonisch, rawOf } from '../kanonisch/kanonisch.mjs';
import { alleFaelle } from './faelle.mjs';
import { parseXml } from './leser.mjs';
import { browserLesen } from './umgebungen/chromium.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rows = [];
const outputs = [];
let ok = 0, skipped = 0, failed = 0;
// gross-5000 bleibt außen vor: layoutGeometry() braucht für 5000 Knoten Minuten, das misst hier nichts.
for (const f of alleFaelle().filter(f => !/gross/.test(f.name))){
  let read;
  try { read = readProcess(parseXml(f.xml)); if (!read) throw new Error('kein definitions'); } catch (e){ skipped++; continue; }
  const notes = [];
  try {
    const { model, rank } = kanonisch(read.model);
    const di = layoutGeometry(model, rawOf(model, rank), labelSize);
    const { xml: out, diagram } = appendDiagram(f.xml, model, di);
    outputs.push({ name: f.name, xml: out });
    // Wohlgeformt, und wieder lesbar.
    const doc = parseXml(out);
    const again = readProcess(doc);
    const ids = doc.getElementsByTagName('*').map(el => el.getAttribute('id')).filter(Boolean);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    // Ein Block, der schon ein Diagramm mitbringt (referenz.md, demo.md: die App legt ihn dann nicht neu an), hat danach zwei.
    const own = doc.getElementsByTagName('bpmndi:BPMNDiagram').length - 1;
    const diagrams = doc.getElementsByTagName('bpmndi:BPMNDiagram');
    if (diagrams.length !== 1 + (parseXml(f.xml).getElementsByTagName('bpmndi:BPMNDiagram').length)) notes.push(diagrams.length + ' BPMNDiagram');
    if (!diagrams.some(d => d.getAttribute('id') === diagram)) notes.push('Diagramm-id ' + diagram + ' nicht gefunden');
    if (own) notes.push('hatte schon ' + own + ' eigenes Diagramm (die App ordnet so ein XML nicht an)');
    if (dup.length) notes.push('doppelte ids: ' + [...new Set(dup)].slice(0, 5).join(', '));
    if (f.xml.charCodeAt(0) === 0xFEFF && out.charCodeAt(0) !== 0xFEFF) notes.push('BOM verloren');
    const crlfIn = (f.xml.match(/\r\n/g) || []).length, crlfOut = (out.match(/\r\n/g) || []).length, lfOnly = (out.match(/[^\r]\n/g) || []).length;
    if (crlfIn && lfOnly) notes.push('gemischte Zeilenenden: ' + crlfOut + ' \\r\\n, ' + lfOnly + ' \\n');
    const pos = out.lastIndexOf('</' + (doc.documentElement.prefix ? doc.documentElement.prefix + ':' : '') + 'definitions');
    if (out.lastIndexOf('<bpmndi:BPMNDiagram') > pos) notes.push('Diagramm hinter dem schließenden Tag');
    const same = k => JSON.stringify(read.model[k].map(x => x.id).sort()) === JSON.stringify(again.model[k].map(x => x.id).sort());
    for (const k of ['nodes', 'flows', 'notes', 'boundaries', 'messages']) if (!same(k)) notes.push(k + ' verändert');
    if (notes.length) failed++; else ok++;
  } catch (e){ failed++; notes.push('Fehler: ' + String(e.message).slice(0, 120)); }
  if (notes.length) rows.push('| ' + f.name + ' | ' + notes.join('; ').replace(/\|/g, '\\|') + ' |');
}
// Chromium liest jedes Ergebnis: Status ok, und dasselbe Modell wie der Prototyp.
const { info, results } = await browserLesen('chromium', outputs);
let chromiumSame = 0;
const chromiumRows = [];
for (const o of outputs){
  const r = results[o.name];
  let p;
  try { const x = readProcess(parseXml(o.xml)); p = { status: 'ok', model: x.model, leftOut: x.leftOut }; } catch (e){ p = { status: 'error' }; }
  if (r.status === p.status && JSON.stringify([r.model, r.leftOut]) === JSON.stringify([p.model, p.leftOut])) chromiumSame++;
  else chromiumRows.push('| ' + o.name + ' | ' + r.status + (r.message ? ' ' + r.message.slice(0, 100) : ' Modell abweichend') + ' |');
}
const md = '# Durchlauf: Prototyp → readProcess → kanonisch → layoutGeometry → appendDiagram\n\n' +
  'Fälle angeordnet: ' + (ok + failed) + ' (ohne Befund ' + ok + ', mit Befund ' + failed + '), übersprungen (kein Modell): ' + skipped + '.\n\n' +
  (rows.length ? '| Fall | Befund |\n|---|---|\n' + rows.join('\n') + '\n' : 'Kein Befund.\n') +
  '\n## Chromium liest die Ergebnisse\n\n' + info + ': ' + chromiumSame + ' von ' + outputs.length + ' Ergebnisse gelesen wie der Prototyp (Status und Modell gleich).\n\n' +
  (chromiumRows.length ? '| Fall | Chromium |\n|---|---|\n' + chromiumRows.join('\n') + '\n' : '');
fs.writeFileSync(path.join(here, 'ergebnisse', 'durchlauf.md'), md);
console.log(md);
