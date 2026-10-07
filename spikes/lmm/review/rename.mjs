// The other side of the volatility: the ids renamed (rename-xml.mjs), the order kept. (a) the share of renamings
// whose columns differ, (b) whose finished layout differs, per variant.
//   node rename.mjs "<variant>" [K]
import { ranksWith, VARIANTS } from './varianten.mjs';
import { renameXml } from './rename-xml.mjs';
import { makeRandom } from './permute-xml.mjs';
import { fixtures, layoutWith, columnsOf, diagramKey } from './measure.mjs';
const [variant, kArg] = process.argv.slice(2);
const o = VARIANTS[variant]; if (!o) throw new Error('unknown variant: ' + variant);
const K = Number(kArg || 10);
const names = fixtures.fixtureNames();
let cols = 0, layout = 0; const volatile = [];
const translate = (di, back) => { const t = {}; for (const k of ['shapes', 'labels', 'flows', 'flowLabels']) t[k] = Object.fromEntries(Object.entries(di[k]).map(([id, v]) => [back.get(id) ?? id, v])); return t; };
for (const name of names){
  const fx = fixtures.readFixture(name), model0 = fixtures.readModel(fx.xml).model;
  const rank0 = ranksWith(model0, o), cols0 = columnsOf(model0, rank0), key0 = diagramKey(layoutWith(fx.xml, model0, rank0, fx.sizes).di);
  const rnd = makeRandom(4242 + names.indexOf(name));
  let changed = false;
  for (let k = 0; k < K; k++){
    const { xml, back } = renameXml(fx.xml, rnd), model = fixtures.readModel(xml).model;
    const rank = ranksWith(model, o), c = columnsOf(model, rank);
    if (model.nodes.some(n => c[n.id] !== cols0[back.get(n.id)])) cols++;
    if (diagramKey(translate(layoutWith(xml, model, rank, fx.sizes).di, back)) !== key0){ layout++; changed = true; }
  }
  if (changed) volatile.push(name);
  process.stderr.write('.');
}
const pct = x => (100 * x / (names.length * K)).toFixed(1) + ' %';
console.log('\n' + variant + ' (Umbenennung, K=' + K + '): Spalten geändert ' + pct(cols) + ', Layout geändert ' + pct(layout) + ' (' + volatile.length + ' Fixtures' + (volatile.length && volatile.length <= 8 ? ': ' + volatile.join(', ') : '') + ')');
