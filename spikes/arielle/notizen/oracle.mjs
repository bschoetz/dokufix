// What any order of the text annotations can reach: per fixture with text annotations every order of those not at a
// pool (up to 120), else N random ones, each laid out (measured mode), and where the orders of varianten-notizen.mjs
// stand among them. The orders of nodes, flows, boundary events, message flows and associations are kanonisch()'s and
// the canonical ones of varianten-notizen.mjs; only the notes vary.
//   node oracle.mjs [N=150] [fixture…]   → a table, and oracle.json
import fs from 'node:fs';
import { fixtures, layoutWith, diagramKey } from '../review/measure.mjs';
import { kanonischWith } from './varianten-notizen.mjs';
import { noteGaps, isNoteBreak } from './messen-notizen.mjs';
import { makeRandom } from './permute-notizen.mjs';

const N = Number(process.argv[2] || 150);
const names = fixtures.fixtureNames().filter(n => !process.argv[3] || process.argv.slice(3).includes(n));
const perms = arr => arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map(p => [x, ...p]));
const shuffle = (arr, rnd) => { const a = [...arr]; for (let k = a.length - 1; k > 0; k--){ const j = Math.floor(rnd() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
const VARIANTS = ['xml', 'id', 'text', 'partner', 'lanecol', 'kind', 'long', 'rpartner'];
const score = L => { const gaps = noteGaps(L); return { breaks: L.breaks.length, noteBreaks: L.breaks.filter(isNoteBreak).length, crossings: L.crossings, bends: L.bends, width: L.width, height: L.height, gap: gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0 }; };
const better = (a, b) => a.breaks - b.breaks || a.crossings - b.crossings || a.bends - b.bends || a.height - b.height || a.gap - b.gap;
const out = {};
console.log('| Fixture | Notizen (frei) | Ordnungen | beste (V / K / Kn / Höhe / Ø Abstand) | schlechteste | Bilder | heute | partner | kind | long | id |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const name of names){
  const fx = fixtures.readFixture(name), model = fixtures.readModel(fx.xml).model;
  if (!(model.notes || []).length) continue;
  const k = kanonischWith(model, { notes: 'partner', pools: 'canon', messages: 'ends', assocs: 'canon' });
  const free = k.model.notes.filter(n => k.model.associations.find(a => a.note === n.id).kind !== 'pool'), atPool = k.model.notes.filter(n => !free.includes(n));
  const orders = free.length <= 5 ? perms(free) : (() => { const rnd = makeRandom(99); const s = new Set(); const o = []; while (o.length < N){ const p = shuffle(free, rnd); const key = p.map(n => n.id).join(); if (!s.has(key)){ s.add(key); o.push(p); } } return o; })();
  const seen = new Map();  // order key → result
  const keys = new Set();
  const layOrder = notes => {
    const key = notes.map(n => n.id).join('|');
    if (seen.has(key)) return seen.get(key);
    const notePos = new Map(notes.map((n, i) => [n.id, i]));
    const m = { ...k.model, notes, associations: [...k.model.associations].sort((a, b) => notePos.get(a.note) - notePos.get(b.note)) };
    const L = { ...layoutWith(fx.xml, m, k.rank, fx.sizes), model: m };
    const s = { ...score(L), key: diagramKey(L.di), order: key };
    keys.add(s.key);
    seen.set(key, s);
    return s;
  };
  const all = orders.map(o => layOrder([...o, ...atPool]));
  const sorted = [...all].sort(better);
  const rankOf = s => sorted.findIndex(x => better(x, s) >= 0) + 1;
  const fmt = s => s.breaks + ' / ' + s.crossings + ' / ' + s.bends + ' / ' + s.height + ' / ' + s.gap.toFixed(0);
  const at = {};
  for (const v of VARIANTS){
    const kv = kanonischWith(model, { notes: v, pools: 'canon', messages: 'ends', assocs: 'canon' });
    const s = layOrder(kv.model.notes);
    at[v] = { ...s, rank: rankOf(s) };
  }
  out[name] = { free: free.length, orders: all.length, best: sorted[0], worst: sorted[sorted.length - 1], pictures: keys.size, at, all: all.map(s => ({ order: s.order, breaks: s.breaks, crossings: s.crossings, bends: s.bends, height: s.height, gap: +s.gap.toFixed(1) })) };
  const cell = v => fmt(at[v]) + ' (Platz ' + at[v].rank + ')';
  console.log('| ' + [name, free.length, all.length, fmt(sorted[0]), fmt(sorted[sorted.length - 1]), keys.size, cell('xml'), cell('partner'), cell('kind'), cell('long'), cell('id')].join(' | ') + ' |');
  process.stderr.write(name + ' ');
}
fs.writeFileSync(new URL('./oracle.json', import.meta.url), JSON.stringify(out, null, 1));
