// Vergleicht zwei Läufe (lauf.mjs) Eingabe für Eingabe: das angeordnete XML Byte für Byte, und wo es anders ist,
// ob das Bild (der Diagrammteil) oder nur das Prozess-XML anders ist, mit den Brüchen vorher und nachher. Das Netz
// der Stories, die das Layout erweitern: "das DI jeder Eingabe ohne … ist byte-gleich zu vorher".
//
//   node tools/bpmn-layout/vergleich.mjs <vorher> <nachher> [--satz s,s]
//
// Zum Beispiel: lauf.mjs --stand main, dann lauf.mjs, dann vergleich.mjs stand-<commit> produkt.
// Exit 1, wenn sich ein Bild unterscheidet.
import fs from 'node:fs';
import path from 'node:path';
import { readLauf, laufDir, args } from './lib.mjs';

const a = args(process.argv.slice(2));
if (a._.length !== 2) throw new Error('Aufruf: node tools/bpmn-layout/vergleich.mjs <vorher> <nachher> [--satz s,s]');
const [va, vb] = a._;
const A = readLauf(va), B = readLauf(vb);
const sets = a.satz ? a.satz.split(',') : null;
const block = (xml, tag) => (new RegExp('<(?:[\\w.-]+:)?' + tag + '\\b[\\s\\S]*?</(?:[\\w.-]+:)?' + tag + '\\s*>').exec(xml) || [''])[0];
const read = (lauf, n) => { const f = path.join(laufDir(lauf), n + '.bpmn'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; };
const names = [...new Set([...Object.keys(A.inputs), ...Object.keys(B.inputs)])].filter(n => !sets || sets.includes((B.inputs[n] || A.inputs[n]).set));
const count = { gleich: 0, bild: 0, xml: 0, fehlt: 0 };
for (const n of names){
  const x = read(va, n), y = read(vb, n);
  if (!x || !y){ count.fehlt++; console.log(n.padEnd(28), 'nur in', x ? va : vb); continue; }
  if (x === y){ count.gleich++; continue; }
  const art = block(x, 'BPMNDiagram') !== block(y, 'BPMNDiagram') ? 'bild' : 'xml';
  count[art]++;
  const br = l => (l.inputs[n] && l.inputs[n].breaks || []).length;
  console.log(n.padEnd(28), (B.inputs[n] || A.inputs[n]).set.padEnd(11), art === 'bild' ? 'Bild anders' : 'nur Prozess-XML anders', `· Brüche ${br(A)} → ${br(B)}`);
}
console.log(`--- ${va} → ${vb}: ${names.length} Eingaben, ${count.gleich} gleich, ${count.bild} Bild anders, ${count.xml} nur Prozess-XML anders${count.fehlt ? ', ' + count.fehlt + ' nur in einem Lauf' : ''}`);
if (count.bild) process.exitCode = 1;
