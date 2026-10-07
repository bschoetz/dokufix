// Welche Form gibt der Router einem Fluss? Je Sequenzfluss über mehrere Spalten (im Lauf produkt) die Lage beim
// Austritt aus jedem Band und beim Eintritt ins nächste, eingeordnet als L (Zeile des linken Knotens, ±31 px), R (des
// rechten), o / u (über / unter beiden: eine Rinne), m (dazwischen), und daraus die Form: alles L, alles R, ein Z in
// einer Lücke, eine Rinne. Nach der Art des Flusses: aus einem Split, in ein Merge, rückwärts (mit der Lage der Quelle),
// sonst (Arten der Knoten, abwärts oder aufwärts; „undefined“ ist ein angeheftetes Ereignis). Daraus stammen die
// Vorlieben der Regeln bpmn und mini in zaehlmodell.mjs (BERICHT.md, Teil b2).
//
//   node spikes/ordnungsphase/formen.mjs
import fs from 'node:fs'; import path from 'node:path';
import { loadStand, readInput, readModel, readLauf, laufDir } from '../../tools/bpmn-layout/lib.mjs';
import { diagramm } from './zaehlmodell.mjs';
const stand = await loadStand(); const tab = {}; const bsp = {};
const yBei = (p, x) => { for (let i = 1; i < p.length; i++){ const [x1, y1] = p[i-1], [x2, y2] = p[i]; if (x1 === x2){ if (Math.abs(x1 - x) < .5) return (y1+y2)/2; continue; } if (Math.min(x1,x2) <= x && x <= Math.max(x1,x2)) return y1 + (y2-y1)*(x-x1)/(x2-x1); } return null; };
for (const name of Object.keys(readLauf('produkt').inputs)){
  const xml = fs.readFileSync(path.join(laufDir('produkt'), name + '.bpmn'), 'utf8'), model = readModel(stand, readInput(name).xml).model;
  const { formen, wege } = diagramm(xml);
  const xs = [], halb = [];
  for (const n of model.nodes){ const f = formen.get(n.id); if (!f) continue; const k = xs.findIndex(x => Math.abs(x - f.cx) < 1); if (k === -1){ xs.push(f.cx); halb.push(f.w/2); } else halb[k] = Math.max(halb[k], f.w/2); }
  const o = xs.map((x,k)=>k).sort((a,b)=>xs[a]-xs[b]), X = o.map(k=>xs[k]), H = o.map(k=>halb[k]);
  const sp = cx => X.reduce((b, x, k) => Math.abs(x - cx) < Math.abs(X[b] - cx) ? k : b, 0);
  const aus = {}, ein = {}; for (const f of model.flows){ aus[f.from] = (aus[f.from]||0)+1; ein[f.to] = (ein[f.to]||0)+1; }
  const typ = Object.fromEntries(model.nodes.map(n => [n.id, n.type]));
  for (const f of model.flows){
    const a = formen.get(f.from), b = formen.get(f.to); if (!a || !b) continue;
    let sa = sp(a.cx), sb = sp(b.cx); if (sa === sb) continue;
    const rueck = sa > sb; const [L, R] = rueck ? [b, a] : [a, b]; if (rueck) [sa, sb] = [sb, sa];
    const pts = wege.get(f.id) || [];
    const lab = y => y === null ? '?' : Math.abs(y - L.cy) <= 31 ? 'L' : Math.abs(y - R.cy) <= 31 ? 'R' : y < Math.min(L.cy, R.cy) ? 'o' : y > Math.max(L.cy, R.cy) ? 'u' : 'm';
    let shape = '';
    for (let k = sa; k < sb; k++) shape += lab(yBei(pts, X[k] + H[k])) + lab(yBei(pts, X[k+1] - H[k+1])) + ' ';
    const same = Math.abs(L.cy - R.cy) < 1;
    const rel = R.cy < L.cy - 1 ? 'Quelle oben' : R.cy > L.cy + 1 ? 'Quelle unten' : 'gleiche Zeile';
    const art = rueck ? 'rück, ' + rel : same ? 'gleiche Zeile' : typ[f.from] === 'gateway' && aus[f.from] > 1 ? 'aus Split' : typ[f.to] === 'gateway' && ein[f.to] > 1 ? 'in Merge' : 'sonst ' + typ[f.from] + '→' + typ[f.to] + (L.cy < R.cy ? ' abwärts' : ' aufwärts');
    // normalise: compress shape tokens
    const t = shape.trim().split(' ');
    const norm = t.every(x => x === 'LL') ? 'alles L' : t.every(x => x === 'RR') ? 'alles R' : t.length === 1 && t[0] === 'LR' ? 'Z in der Lücke' : t[0] === 'LR' && t.slice(1).every(x => x === 'RR') ? 'Z nach Quelle' : t[t.length-1] === 'LR' && t.slice(0,-1).every(x => x === 'LL') ? 'Z vor Ziel' : t.every(x => x === 'oo') ? 'Rinne oben' : t.every(x => x === 'uu') ? 'Rinne unten' : 'anders: ' + t.join(' ');
    const key = art + ' → ' + (norm.startsWith('anders') ? 'anders' : norm);
    tab[key] = (tab[key]||0)+1; if (norm.startsWith('anders') && !bsp[art]) bsp[art] = name + ' ' + f.id + ' ' + norm;
  }
}
for (const [k, n] of Object.entries(tab).sort()) console.log(String(n).padStart(4), k);
console.log(bsp);
