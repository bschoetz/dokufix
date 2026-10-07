// Measures the orders of varianten-notizen.mjs on the 57 fixtures, measured mode, the diagram part per element id
// (review/measure.mjs), against kanonisch() as it is today (notes, associations, message flows unsorted):
//   quality      breaks (new / gone against kanonisch()), crossings, bends; the breaks of the text annotations alone
//                (note-on-*, association-*); the mean gap between a text annotation and its partner (px); fixtures
//                whose picture changes
//   permutation  K reorderings per fixture with permute-notizen.mjs (nodes, flows, boundary events, flowNodeRef,
//                message flows, text annotations, associations): share whose layout differs
//   renaming     K renamings per fixture with rename-notizen.mjs (the same lists): share whose layout differs
//   node messen-notizen.mjs <variant>… [--k=N] [--no-invariance] [--out=file.json] [--only=notes]
// A variant is "notes/pools/messages/assocs" (varianten-notizen.mjs); "heute" is kanonisch() unchanged. "all" runs
// every note order with pools canon, messages ends, assocs canon. --only=notes measures the 9 fixtures with text
// annotations only (quality); the totals then cover those.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixtures, layoutWith, diagramKey } from '../review/measure.mjs';
import { kanonisch as kanonischHeute } from '../kanonisch/kanonisch.mjs';
import { kanonischWith, parse, NOTE_ORDERS } from './varianten-notizen.mjs';
import { permuteAll, makeRandom } from './permute-notizen.mjs';
import { renameAll } from './rename-notizen.mjs';
const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

const args = process.argv.slice(2);
const K = Number((args.find(a => a.startsWith('--k=')) || '--k=10').slice(4));
const invariance = !args.includes('--no-invariance');
const outFile = (args.find(a => a.startsWith('--out=')) || '').slice(6);
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7);
let variants = isMain ? args.filter(a => !a.startsWith('--')) : [];
if (variants.includes('all')) variants = ['heute', ...NOTE_ORDERS.map(n => n + '/canon/ends/canon')];

const names = fixtures.fixtureNames();
export const loaded = names.map(name => { const fx = fixtures.readFixture(name); return { name, fx, model: fixtures.readModel(fx.xml).model }; })
  .filter(l => only !== 'notes' || (l.model.notes || []).length);
export const prepare = (model, v) => v === 'heute' ? kanonischHeute(model) : kanonischWith(model, parse(v));
export const lay = (xml, model, sizes, v) => { const k = prepare(model, v); return { ...layoutWith(xml, k.model, k.rank, sizes), model: k.model }; };

// The gap between a text annotation's box and its partner: between two boxes the distance of the nearest edges,
// to a flow the distance to its nearest piece; at a pool always NOTE_GAP, left out.
const gapBoxes = ([x, y, w, h], [X, Y, W, H]) => Math.hypot(Math.max(0, X - (x + w), x - (X + W)), Math.max(0, Y - (y + h), y - (Y + H)));
const gapLine = ([x, y, w, h], pts) => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++){
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    // The nearest point of the box to the segment, sampled along it.
    for (let t = 0; t <= 1; t += 0.05){ const px = ax + (bx - ax) * t, py = ay + (by - ay) * t; best = Math.min(best, gapBoxes([x, y, w, h], [px, py, 0, 0])); }
  }
  return best;
};
export function noteGaps(L){
  const out = [];
  for (const n of L.model.notes || []){
    const a = (L.model.associations || []).find(x => x.note === n.id), box = L.di.shapes[n.id];
    if (!a || !box || a.kind === 'pool') continue;
    out.push(a.kind === 'flow' || a.kind === 'message' ? gapLine(box, L.di.flows[a.partner]) : gapBoxes(box, L.di.shapes[a.partner]));
  }
  return out;
}
export const isNoteBreak = b => /^(note-on-|association-)/.test(b);

const translate = (di, back) => { const t = {}; for (const k of ['shapes', 'labels', 'flows', 'flowLabels']) t[k] = Object.fromEntries(Object.entries(di[k]).map(([id, v]) => [back.get(id) ?? id, v])); return t; };

const base = {};
for (const { name, fx, model } of loaded) base[name] = lay(fx.xml, model, fx.sizes, 'heute');

export function measure(variant, { k = K, inv = invariance } = {}){
  const r = { variant, breaks: 0, noteBreaks: 0, crossings: 0, bends: 0, width: 0, height: 0, gapSum: 0, gapN: 0, changed: [], added: [], gone: [], perFixture: {}, permChanged: 0, permTotal: 0, permFixtures: [], renChanged: 0, renTotal: 0, renFixtures: [] };
  for (const { name, fx, model } of loaded){
    const A = base[name], C = lay(fx.xml, model, fx.sizes, variant), key = diagramKey(C.di);
    const gaps = noteGaps(C);
    r.breaks += C.breaks.length; r.noteBreaks += C.breaks.filter(isNoteBreak).length; r.crossings += C.crossings; r.bends += C.bends; r.width += C.width; r.height += C.height;
    r.gapSum += gaps.reduce((s, g) => s + g, 0); r.gapN += gaps.length;
    const added = C.breaks.filter(b => !A.breaks.includes(b)), gone = A.breaks.filter(b => !C.breaks.includes(b));
    r.added.push(...added.map(b => name + ': ' + b)); r.gone.push(...gone.map(b => name + ': ' + b));
    const changed = diagramKey(A.di) !== key;
    if (changed) r.changed.push(name);
    r.perFixture[name] = { breaks: C.breaks.length, noteBreaks: C.breaks.filter(isNoteBreak).length, crossings: C.crossings, bends: C.bends, width: C.width, height: C.height, gap: gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null, changed, added, gone,
      before: { breaks: A.breaks.length, noteBreaks: A.breaks.filter(isNoteBreak).length, crossings: A.crossings, bends: A.bends, width: A.width, height: A.height, gap: (g => g.length ? g.reduce((s, x) => s + x, 0) / g.length : null)(noteGaps(A)) } };
    if (!inv) continue;
    const rnd = makeRandom(777 + names.indexOf(name));
    let pc = 0;
    for (let i = 0; i < k; i++){
      const xml = permuteAll(fx.xml, rnd), m = fixtures.readModel(xml).model, L = lay(xml, m, fx.sizes, variant);
      r.permTotal++;
      if (diagramKey(L.di) !== key){ pc++; r.permChanged++; }
    }
    if (pc) r.permFixtures.push(name + ' ' + pc + '/' + k);
    const rr = makeRandom(31337 + names.indexOf(name));
    let rc = 0;
    for (let i = 0; i < k; i++){
      const { xml, back } = renameAll(fx.xml, rr), m = fixtures.readModel(xml).model, L = lay(xml, m, fx.sizes, variant);
      r.renTotal++;
      if (diagramKey(translate(L.di, back)) !== key){ rc++; r.renChanged++; }
    }
    if (rc) r.renFixtures.push(name + ' ' + rc + '/' + k);
    process.stderr.write('.');
  }
  return r;
}

export const row = r => '| ' + [r.variant, r.changed.length, r.breaks + ' (+' + r.added.length + ' / −' + r.gone.length + ')', r.noteBreaks, r.crossings, r.bends, r.gapN ? (r.gapSum / r.gapN).toFixed(1) : '–',
  r.permTotal ? (100 * r.permChanged / r.permTotal).toFixed(1) + ' % (' + r.permFixtures.length + ')' : '–',
  r.renTotal ? (100 * r.renChanged / r.renTotal).toFixed(1) + ' % (' + r.renFixtures.length + ')' : '–'].join(' | ') + ' |';
export const head = '| Variante (Notizen/Pools/Nachrichten/Assoziationen) | Bild anders (' + loaded.length + ') | Verstöße (neu / weg) | davon Notiz-Verstöße | Kreuzungen | Knicke | Ø Abstand Notiz–Partner (px) | Umordnung: Layout anders (Fixtures) | Umbenennung: Layout anders (Fixtures) |\n|---|---|---|---|---|---|---|---|---|';

if (variants.length){
  const results = [];
  console.log(head);
  for (const v of variants){
    const r = measure(v);
    results.push(r);
    if (invariance) process.stderr.write('\n');
    console.log(row(r));
  }
  for (const r of results){
    if (!r.changed.length && !r.added.length && !r.gone.length && !r.permFixtures.length && !r.renFixtures.length) continue;
    console.log('\n### ' + r.variant + '\nBild anders: ' + (r.changed.join(', ') || 'keins'));
    for (const l of r.added) console.log('  + ' + l);
    for (const l of r.gone) console.log('  - ' + l);
    const diff = loaded.filter(({ name }) => r.perFixture[name].changed).map(({ name }) => { const f = r.perFixture[name]; return name + ' (V ' + f.before.breaks + '→' + f.breaks + ', NV ' + f.before.noteBreaks + '→' + f.noteBreaks + ', K ' + f.before.crossings + '→' + f.crossings + ', Kn ' + f.before.bends + '→' + f.bends + ', Abstand ' + (f.before.gap === null ? '–' : f.before.gap.toFixed(1)) + '→' + (f.gap === null ? '–' : f.gap.toFixed(1)) + ', ' + f.before.width + '×' + f.before.height + '→' + f.width + '×' + f.height + ')'; });
    console.log('Geändert: ' + diff.join('; '));
    if (r.permFixtures.length) console.log('Umordnung volatil: ' + r.permFixtures.join(', '));
    if (r.renFixtures.length) console.log('Umbenennung volatil: ' + r.renFixtures.join(', '));
  }
  if (outFile) fs.writeFileSync(new URL('./' + outFile, import.meta.url), JSON.stringify(results, null, 1));
}
