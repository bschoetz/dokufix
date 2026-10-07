// Wo liegen die gezeichneten Kreuzungen, die das Zählmodell nicht sieht? Je gezeichnete Kreuzung zweier Sequenzflüsse
// (wie quality() in tools/bpmn-layout/lib.mjs) die Art der beiden Flüsse und die Lage des Schnittpunkts:
//   Art eines Flusses   vorwärts (Ziel rechts der Quelle), rückwärts (links), Spalte (beide in einer Spalte)
//   Lage                in einer Spalte (|x − Spaltenmitte| ≤ 30 px, der Bereich der Knoten) oder in einer Lücke
//
//   node spikes/ordnungsphase/diagnose.mjs [lauf]        Vorgabe: produkt
import fs from 'node:fs';
import path from 'node:path';
import { loadStand, readInput, readModel, readLauf, laufDir } from '../../tools/bpmn-layout/lib.mjs';
import { diagramm } from './zaehlmodell.mjs';

const lauf = process.argv[2] || 'produkt';
const stand = await loadStand();
const zahl = new Map(), beispiele = new Map();
let alle = 0;
for (const name of Object.keys(readLauf(lauf).inputs)){
  const datei = path.join(laufDir(lauf), name + '.bpmn');
  if (!fs.existsSync(datei)) continue;
  const xml = fs.readFileSync(datei, 'utf8'), model = readModel(stand, readInput(name).xml).model;
  const { formen, wege } = diagramm(xml);
  const xs = [];
  for (const n of model.nodes){ const f = formen.get(n.id); if (f && !xs.some(x => Math.abs(x - f.cx) < 1)) xs.push(f.cx); }
  xs.sort((a, b) => a - b);
  const spalte = cx => xs.reduce((best, x, k) => Math.abs(x - cx) < Math.abs(xs[best] - cx) ? k : best, 0);
  const art = new Map(model.flows.map(f => {
    const a = formen.get(f.from), b = formen.get(f.to);
    if (!a || !b) return [f.id, '?'];
    const d = spalte(b.cx) - spalte(a.cx);
    return [f.id, d > 0 ? 'vorwärts' : d < 0 ? 'rückwärts' : 'Spalte'];
  }));
  const segs = model.flows.flatMap(f => { const p = wege.get(f.id) || []; return p.slice(1).map((b, i) => ({ f: f.id, a: p[i], b })); });
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++){
    const p = segs[i], q = segs[j];
    if (p.f === q.f) continue;
    const ph = p.a[1] === p.b[1], qh = q.a[1] === q.b[1];
    if (ph === qh) continue;
    const [h, v] = ph ? [p, q] : [q, p];
    const x = v.a[0], y = h.a[1];
    if (!(x > Math.min(h.a[0], h.b[0]) && x < Math.max(h.a[0], h.b[0]) && y > Math.min(v.a[1], v.b[1]) && y < Math.max(v.a[1], v.b[1]))) continue;
    alle++;
    const lage = xs.some(c => Math.abs(c - x) <= 30) ? 'in Spalte' : 'in Lücke';
    const arten = [art.get(p.f), art.get(q.f)].sort().join(' × ');
    const key = arten + ', ' + lage;
    zahl.set(key, (zahl.get(key) || 0) + 1);
    if (!beispiele.has(key)) beispiele.set(key, name + ' (' + p.f + ', ' + q.f + ')');
  }
}
console.log(`${lauf}: ${alle} gezeichnete Kreuzungen von Sequenzflüssen`);
for (const [k, n] of [...zahl].sort((a, b) => b[1] - a[1])) console.log('  ' + String(n).padStart(4) + '  ' + k.padEnd(36) + 'z. B. ' + beispiele.get(k));
