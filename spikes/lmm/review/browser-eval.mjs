// Mermaid's raw positions saved by browser.mjs (browser-raws.json), compared again in Node: the exact replica with
// the blank-label rule (a name q() leaves blank is no label) against Mermaid, and the old replica ../ranks.mjs.
import fs from 'node:fs';
import { arielleExakt as exakt } from './ranks-exakt.mjs';
import { mermaidRanks } from '../ranks.mjs';
import { randomModel, sameOrder } from './gen.mjs';
const { targeted, N, raws } = JSON.parse(fs.readFileSync(new URL('./browser-raws.json', import.meta.url), 'utf8'));
let same = 0, old = 0, errors = 0; const bad = [], oldBad = [];
for (let i = 0; i < N; i++){
  const raw = raws[targeted + i], model = randomModel(i);
  if (raw.error){ errors++; continue; }
  const cx = Object.fromEntries(model.nodes.map(n => [n.key, raw.nodes[n.key] && raw.nodes[n.key].cx]));
  if (Object.values(cx).some(x => typeof x !== 'number')){ errors++; continue; }
  if (sameOrder(model, exakt(model), cx)) same++; else bad.push(i);
  if (sameOrder(model, mermaidRanks(model), cx)) old++; else oldBad.push(i);
}
console.log(N + ' Zufallsmodelle gegen Mermaid: exakter Nachbau mit Leerzeichen-Regel gleich ' + same + ', alter Nachbau gleich ' + old + ', Fehler ' + errors + (bad.length ? '; abweichend: ' + bad.slice(0, 10).join(', ') : ''));
const blank = oldBad.filter(i => randomModel(i).flows.some(f => f.name && !f.name.replace(/["<>&#`\\]/g, ' ').trim())).length;
console.log('Abweichungen des alten Nachbaus mit einer Beschriftung, die q() leert: ' + blank + ' von ' + oldBad.length);
