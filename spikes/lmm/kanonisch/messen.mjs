// Measures canonical orders of the model (varianten.mjs) on the 57 fixtures, measured mode, the diagram part per
// element id (review/measure.mjs: layoutWith(), diagramKey()):
//   quality      breaks (against arielle alone: new, gone), crossings, bends, fixtures whose layout changes
//   permutation  K reorderings of the XML per fixture (review/permute-xml.mjs): share whose layout differs
//   renaming     K renamings of the ids per fixture (review/rename-xml.mjs): share whose layout differs
//   node messen.mjs <variant>… [--k N] [--no-invariance] [--out file.json]
// A variant is "nodes/flows/rest" (varianten.mjs) or "xml/xml/xml" for arielle alone. "all" runs every combination
// for quality only.
import fs from 'node:fs';
import { fixtures, layoutWith, diagramKey } from '../review/measure.mjs';
import { permuteXml, makeRandom } from '../review/permute-xml.mjs';
import { renameXml } from '../review/rename-xml.mjs';
import { arielle } from '../review/ranks-optimiert.mjs';
import { canonicalWith, parse, NODE_ORDERS, FLOW_ORDERS, REST_ORDERS } from './varianten.mjs';
import { fileURLToPath } from 'node:url';
import { kanonisch } from './kanonisch.mjs';
// The command part runs only when this file is the script, not when alle.mjs imports it.
const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

const args = process.argv.slice(2);
const K = Number((args.find(a => a.startsWith('--k=')) || '--k=10').slice(4));
const invariance = !args.includes('--no-invariance');
const outFile = (args.find(a => a.startsWith('--out=')) || '').slice(6);
let variants = isMain ? args.filter(a => !a.startsWith('--')) : [];
if (variants.includes('all')) variants = NODE_ORDERS.flatMap(n => FLOW_ORDERS.flatMap(f => REST_ORDERS.map(r => [n, f, r].join('/'))));

const names = fixtures.fixtureNames();
const loaded = names.map(name => { const fx = fixtures.readFixture(name); return { name, fx, model: fixtures.readModel(fx.xml).model }; });
// The variant "kanonisch" is the recommended module kanonisch.mjs itself.
const prepare = (model, o) => o.nodes === 'kanonisch' ? kanonisch(model).model : (o.nodes === 'xml' && o.flows === 'xml' && o.rest === 'xml') ? model : canonicalWith(model, o);
const lay = (xml, model, sizes, o) => { const m = prepare(model, o); return layoutWith(xml, m, arielle(m), sizes); };

// arielle alone: the reference of the breaks per fixture.
const base = {};
for (const { name, fx, model } of loaded) base[name] = lay(fx.xml, model, fx.sizes, parse('xml/xml/xml'));

const translate = (di, back) => { const t = {}; for (const k of ['shapes', 'labels', 'flows', 'flowLabels']) t[k] = Object.fromEntries(Object.entries(di[k]).map(([id, v]) => [back.get(id) ?? id, v])); return t; };

export function measure(variant, { k = K, inv = invariance } = {}){
  const o = parse(variant);
  const r = { variant, breaks: 0, crossings: 0, bends: 0, width: 0, height: 0, changed: [], added: [], gone: [], perFixture: {}, permChanged: 0, permTotal: 0, permFixtures: [], renChanged: 0, renTotal: 0, renFixtures: [], permBreaksMean: null };
  let permBreaks = 0;
  for (const { name, fx, model } of loaded){
    const A = base[name], C = lay(fx.xml, model, fx.sizes, o), key = diagramKey(C.di);
    r.breaks += C.breaks.length; r.crossings += C.crossings; r.bends += C.bends; r.width += C.width; r.height += C.height;
    const added = C.breaks.filter(b => !A.breaks.includes(b)), gone = A.breaks.filter(b => !C.breaks.includes(b));
    r.added.push(...added.map(b => name + ': ' + b)); r.gone.push(...gone.map(b => name + ': ' + b));
    const changed = diagramKey(A.di) !== key;
    if (changed) r.changed.push(name);
    r.perFixture[name] = { breaks: C.breaks.length, crossings: C.crossings, bends: C.bends, width: C.width, height: C.height, changed, added, gone, before: { breaks: A.breaks.length, crossings: A.crossings, bends: A.bends } };
    if (!inv) continue;
    const rnd = makeRandom(97 + names.indexOf(name));
    let pc = 0;
    for (let i = 0; i < k; i++){
      const xml = permuteXml(fx.xml, rnd), m = fixtures.readModel(xml).model, L = lay(xml, m, fx.sizes, o);
      r.permTotal++; permBreaks += L.breaks.length;
      if (diagramKey(L.di) !== key){ pc++; r.permChanged++; }
    }
    if (pc) r.permFixtures.push(name + ' ' + pc + '/' + k);
    const rr = makeRandom(4242 + names.indexOf(name));
    let rc = 0;
    for (let i = 0; i < k; i++){
      const { xml, back } = renameXml(fx.xml, rr), m = fixtures.readModel(xml).model, L = lay(xml, m, fx.sizes, o);
      r.renTotal++;
      if (diagramKey(translate(L.di, back)) !== key){ rc++; r.renChanged++; }
    }
    if (rc) r.renFixtures.push(name + ' ' + rc + '/' + k);
    process.stderr.write('.');
  }
  if (inv) r.permBreaksMean = permBreaks / k;
  return r;
}

export const row = r => '| ' + [r.variant, r.changed.length, r.breaks + ' (+' + r.added.length + ' / −' + r.gone.length + ')', r.crossings, r.bends,
  r.permTotal ? (100 * r.permChanged / r.permTotal).toFixed(1) + ' % (' + r.permFixtures.length + ')' : '–',
  r.renTotal ? (100 * r.renChanged / r.renTotal).toFixed(1) + ' % (' + r.renFixtures.length + ')' : '–',
  r.permBreaksMean === null ? '–' : r.permBreaksMean.toFixed(1)].join(' | ') + ' |';
export const head = '| Variante (Knoten/Flüsse/Rest) | Layout anders (57) | Verstöße (neu / weg) | Kreuzungen | Knicke | Umordnung: Layout anders (Fixtures) | Umbenennung: Layout anders (Fixtures) | Verstöße Ø je Umordnungssatz |\n|---|---|---|---|---|---|---|---|';

if (variants.length){
  const results = [];
  console.log(head);
  for (const v of variants){
    const r = measure(v);
    results.push(r);
    process.stderr.write('\n');
    console.log(row(r));
  }
  for (const r of results){
    if (!r.changed.length && !r.added.length && !r.gone.length) continue;
    console.log('\n### ' + r.variant + '\nLayout anders: ' + (r.changed.join(', ') || 'keins'));
    for (const l of r.added) console.log('  + ' + l);
    for (const l of r.gone) console.log('  - ' + l);
    const diff = names.filter(n => r.perFixture[n].changed).map(n => { const f = r.perFixture[n]; return n + ' (V ' + f.before.breaks + '→' + f.breaks + ', K ' + f.before.crossings + '→' + f.crossings + ', Kn ' + f.before.bends + '→' + f.bends + ')'; });
    console.log('Geändert: ' + diff.join('; '));
    if (r.permFixtures.length) console.log('Umordnung volatil: ' + r.permFixtures.join(', '));
    if (r.renFixtures.length) console.log('Umbenennung volatil: ' + r.renFixtures.join(', '));
  }
  if (outFile) fs.writeFileSync(new URL('./' + outFile, import.meta.url), JSON.stringify(results, null, 1));
}
