// One reordering whose layout changes although the columns do not: what differs first.
import { arielle } from './ranks-optimiert.mjs';
import { permuteXml, makeRandom } from './permute-xml.mjs';
import { fixtures, layoutWith, diagramKey } from './measure.mjs';
const names = fixtures.fixtureNames();
for (const name of process.argv.slice(2)){
  const fx = fixtures.readFixture(name), model0 = fixtures.readModel(fx.xml).model;
  const base = layoutWith(fx.xml, model0, arielle(model0), fx.sizes), key0 = diagramKey(base.di);
  const rnd = makeRandom(97 + names.indexOf(name));
  for (let k = 0; k < 10; k++){
    const xml = permuteXml(fx.xml, rnd), model = fixtures.readModel(xml).model;
    const laid = layoutWith(xml, model, arielle(model), fx.sizes);
    if (diagramKey(laid.di) === key0) continue;
    const diff = [];
    for (const kind of ['shapes', 'flows']) for (const id of Object.keys(base.di[kind])) if (JSON.stringify(base.di[kind][id]) !== JSON.stringify(laid.di[kind][id])) diff.push(kind.slice(0, -1) + ' ' + id);
    console.log(name + ', Umordnung ' + k + ': ' + diff.length + ' Elemente anders, z. B. ' + diff.slice(0, 4).join(', ') + '; Verstöße ' + base.breaks.length + ' → ' + laid.breaks.length + ', Kreuzungen ' + base.crossings + ' → ' + laid.crossings + ', Knicke ' + base.bends + ' → ' + laid.bends);
    const shape = id => base.di.shapes[id] && laid.di.shapes[id] ? id + ' ' + base.di.shapes[id].slice(0, 2) + ' → ' + laid.di.shapes[id].slice(0, 2) : '';
    console.log('   ' + diff.filter(d => d.startsWith('shape')).slice(0, 3).map(d => shape(d.slice(6))).join('; '));
    break;
  }
}
