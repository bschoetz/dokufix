// arielle against the exact replica (../ranks.mjs) on random models: node fuzz, no browser.
//   node fuzz.mjs [count]
import { arielleExakt as arielle } from './ranks-exakt.mjs';
import { mermaidRanks } from '../ranks.mjs';
import { randomModel, sameOrder } from './gen.mjs';
const N = Number(process.argv[2] || 20000);
let same = 0, exact = 0; const bad = [];
const stats = { boundaries: 0, parallel10: 0, pools: 0, labelsBlank: 0, big: 0 };
for (let i = 0; i < N; i++){
  const m = randomModel(i);
  // The replica ../ranks.mjs still takes a name q() blanks for a label; Mermaid does not (browser.mjs), arielle neither.
  const a = arielle(m), b = mermaidRanks({ ...m, flows: m.flows.map(f => ({ ...f, name: f.name.replace(/["<>&#`\\]/g, ' ').trim() })) });
  if (sameOrder(m, a, b)) same++; else bad.push(i);
  if (m.nodes.every(n => a[n.key] === b[n.key])) exact++;
  if (m.boundaries.length) stats.boundaries++;
  if (m.pools.length > 1) stats.pools++;
  if (m.nodes.length >= 20) stats.big++;
  const pairs = new Map(); for (const f of m.flows){ const k = f.from + '>' + f.to; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
  if ([...pairs.values()].some(c => c >= 10)) stats.parallel10++;
  if (m.flows.some(f => f.name && !f.name.replace(/["<>&#`\\]/g, ' ').trim())) stats.labelsBlank++;
}
console.log(N + ' Zufallsmodelle: Spaltenordnung gleich ' + same + ', Ränge exakt gleich ' + exact + (bad.length ? ', abweichend: ' + bad.slice(0, 20).join(', ') : ''));
console.log('davon mit angehefteten Ereignissen ' + stats.boundaries + ', mehreren Pools ' + stats.pools + ', >= 10 parallelen Flüssen ' + stats.parallel10 + ', >= 20 Knoten ' + stats.big + ', Beschriftung nur aus Sonderzeichen ' + stats.labelsBlank);
