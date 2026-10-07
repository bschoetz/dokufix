// Story 2.12, Bens Befund vom 2026-10-06 (p-rs2): Nachrichtenflüsse hin und zurück zwischen denselben zwei Symbolen,
// die sich kreuzen. Zählt je angeordneter Eingabe eines Laufs die Paare von Nachrichtenflüssen zwischen denselben
// zwei Symbolen, deren Stücke sich kreuzen oder auf einer Linie laufen. Aus Spike 2.26 im Store übernommen.
//   node tools/bpmn-layout/kreuz.mjs [--lauf <lauf>]
import fs from 'node:fs';
import { laufDir, args } from './lib.mjs';
const OUT = laufDir(args(process.argv.slice(2)).lauf || 'produkt');
let all = 0;
for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.bpmn')).sort()){
  const t = fs.readFileSync(OUT + "/" + f, 'utf8');
  const msgs = [...t.matchAll(/<(?:[\w-]+:)?messageFlow\b[^>]*?\sid="([^"]+)"[^>]*?\ssourceRef="([^"]+)"[^>]*?\stargetRef="([^"]+)"/g)].map(m => ({ id: m[1], a: m[2], b: m[3] }));
  const way = id => { const m = new RegExp('bpmnElement="' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '">(.*?)</bpmndi:BPMNEdge>').exec(t); return m ? [...m[1].matchAll(/<di:waypoint x="([-\d.]+)" y="([-\d.]+)"/g)].map(w => [+w[1], +w[2]]) : []; };
  const cross = (p, q) => {
    for (let i = 1; i < p.length; i++) for (let j = 1; j < q.length; j++){
      const [a, b, c, d] = [p[i - 1], p[i], q[j - 1], q[j]];
      const ph = a[1] === b[1], qh = c[1] === d[1];
      // On one line, overlapping: the jogs of p-rs2 meet there and the flows swap sides.
      if (ph === qh){
        const [u, v] = ph ? [1, 0] : [0, 1];
        if (a[u] === c[u] && Math.min(Math.max(a[v], b[v]), Math.max(c[v], d[v])) > Math.max(Math.min(a[v], b[v]), Math.min(c[v], d[v]))) return true;
        continue;
      }
      const [h1, h2, v1, v2] = ph ? [a, b, c, d] : [c, d, a, b];
      if (Math.min(h1[0], h2[0]) < v1[0] && v1[0] < Math.max(h1[0], h2[0]) && Math.min(v1[1], v2[1]) < h1[1] && h1[1] < Math.max(v1[1], v2[1])) return true;
    }
    return false;
  };
  const pairs = [];
  for (let i = 0; i < msgs.length; i++) for (let j = i + 1; j < msgs.length; j++){
    const m = msgs[i], n = msgs[j];
    if (!((m.a === n.b && m.b === n.a) || (m.a === n.a && m.b === n.b))) continue;
    if (cross(way(m.id), way(n.id))) pairs.push(m.id + ' × ' + n.id);
  }
  all += pairs.length;
  if (pairs.length) console.log(f.slice(0, -5), pairs.length, 'gekreuzt');
}
console.log('zusammen', all);
