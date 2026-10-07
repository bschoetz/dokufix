// The volatility of a variant: each fixture's XML reordered K times (permute-xml.mjs), the model read anew.
//   (a) the share of reorderings whose columns per element id differ from the original's
//   (b) the share whose finished layout (diagram part per element id) differs from the original's
//   (c) the breaks over the reorderings: mean count, max, and how many fixtures have more than one set of breaks
//   (grid) with --grid: (b) with the original's columns held fixed per element id: what the grid alone changes
//   node permute.mjs "<variant>" [K] [--grid]   → permute-<n>.json, a summary line to stdout
import fs from 'node:fs';
import { ranksWith, VARIANTS } from './varianten.mjs';
import { permuteXml, makeRandom } from './permute-xml.mjs';
import { fixtures, layoutWith, columnsOf, diagramKey } from './measure.mjs';
const [variant, kArg, ...flags] = process.argv.slice(2);
const o = VARIANTS[variant]; if (!o) throw new Error('unknown variant: ' + variant);
const K = Number(kArg || 10), grid = flags.includes('--grid');
const names = fixtures.fixtureNames();
const out = { variant, K, fixtures: {} };
const dedupe = m => `${m.width}`;
for (const name of names){
  const fx = fixtures.readFixture(name), model0 = fixtures.readModel(fx.xml).model;
  const rank0 = ranksWith(model0, o), cols0 = columnsOf(model0, rank0);
  const base = layoutWith(fx.xml, model0, rank0, fx.sizes), key0 = diagramKey(base.di);
  const rnd = makeRandom(97 + names.indexOf(name));
  const f = { colsChanged: 0, layoutChanged: 0, gridChanged: 0, breaks: [base.breaks.length], breakSets: new Set([base.breaks.join('|')]), crossings: [base.crossings], bends: [base.bends] };
  for (let k = 0; k < K; k++){
    const xml = permuteXml(fx.xml, rnd), model = fixtures.readModel(xml).model;
    const rank = ranksWith(model, o), cols = columnsOf(model, rank);
    if (model.nodes.some(n => cols[n.id] !== cols0[n.id])) f.colsChanged++;
    const laid = layoutWith(xml, model, rank, fx.sizes);
    if (diagramKey(laid.di) !== key0) f.layoutChanged++;
    f.breaks.push(laid.breaks.length); f.breakSets.add(laid.breaks.join('|')); f.crossings.push(laid.crossings); f.bends.push(laid.bends);
    if (grid){
      // The original's columns by element id, as ranks of this model's keys.
      const fixed = Object.fromEntries(model.nodes.map(n => [n.key, cols0[n.id]]));
      if (diagramKey(layoutWith(xml, model, fixed, fx.sizes).di) !== key0) f.gridChanged++;
    }
  }
  out.fixtures[name] = { ...f, breakSets: f.breakSets.size };
  process.stderr.write('.');
}
process.stderr.write('\n');
const n = names.length, sum = k => names.reduce((s, name) => s + out.fixtures[name][k], 0);
const breaksAll = names.flatMap(name => out.fixtures[name].breaks);
out.summary = {
  colsChanged: sum('colsChanged') / (n * K), layoutChanged: sum('layoutChanged') / (n * K), gridChanged: grid ? sum('gridChanged') / (n * K) : null,
  fixturesColsVolatile: names.filter(name => out.fixtures[name].colsChanged).length, fixturesLayoutVolatile: names.filter(name => out.fixtures[name].layoutChanged).length,
  breaksMean: breaksAll.reduce((a, b) => a + b, 0) / breaksAll.length, breaksMax: Math.max(...breaksAll), fixturesWithSeveralBreakSets: names.filter(name => out.fixtures[name].breakSets > 1).length,
  crossingsMean: names.flatMap(name => out.fixtures[name].crossings).reduce((a, b) => a + b, 0) / (n * (K + 1)), bendsMean: names.flatMap(name => out.fixtures[name].bends).reduce((a, b) => a + b, 0) / (n * (K + 1)),
};
const file = 'permute-' + Object.keys(VARIANTS).indexOf(variant) + '.json';
fs.writeFileSync(new URL('./' + file, import.meta.url), JSON.stringify(out, null, 1));
const s = out.summary, pct = x => (100 * x).toFixed(1) + ' %';
console.log(variant + ' (K=' + K + '): Spalten geändert ' + pct(s.colsChanged) + ' (' + s.fixturesColsVolatile + ' Fixtures), Layout geändert ' + pct(s.layoutChanged) + ' (' + s.fixturesLayoutVolatile + ' Fixtures)' + (grid ? ', Raster allein ' + pct(s.gridChanged) : '') + '; Verstöße im Mittel ' + s.breaksMean.toFixed(2) + ', max ' + s.breaksMax + ', Fixtures mit mehreren Verstoßmengen ' + s.fixturesWithSeveralBreakSets + '; Kreuzungen im Mittel ' + s.crossingsMean.toFixed(2) + ', Knicke ' + s.bendsMean.toFixed(1));
