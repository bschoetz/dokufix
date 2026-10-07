// Independent check of kanonisch-notizen.mjs on the 57 fixtures (measured mode, the diagram part per element id):
//   quality      breaks, crossings, bends in all; the breaks of the text annotations (note-on-*, association-*);
//                against kanonisch() today (kanonisch/kanonisch.mjs): fixtures whose picture changes, breaks new
//                and gone
//   invariance   per fixture K reorderings of the XML (permute-notizen.mjs: flow nodes, boundary events, sequence
//                flows, flowNodeRef, message flows, text annotations, associations) and K renamings of the ids
//                (rename-notizen.mjs: the same lists): how many layouts differ from the fixture's
//   node pruefen.mjs [--k=N] [--xml-pools]    --xml-pools: the stack at a pool in the XML's order (option poolNotes)
// K = 10 takes about 4 minutes (notiz-hund2 needs 4 s per layout); K = 2 about one.
import { fixtures, layoutWith, diagramKey } from '../review/measure.mjs';
import { kanonisch as kanonischHeute } from '../kanonisch/kanonisch.mjs';
import { kanonisch } from './kanonisch-notizen.mjs';
import { permuteAll, makeRandom } from './permute-notizen.mjs';
import { renameAll } from './rename-notizen.mjs';
const args = process.argv.slice(2);
const K = Number((args.find(a => a.startsWith('--k=')) || '--k=10').slice(4));
const opt = { poolNotes: args.includes('--xml-pools') ? 'xml' : 'canon' };
const names = fixtures.fixtureNames();
const lay = (xml, model, sizes) => { const k = kanonisch(model, opt); return layoutWith(xml, k.model, k.rank, sizes); };
const translate = (di, back) => Object.fromEntries(['shapes', 'labels', 'flows', 'flowLabels'].map(k => [k, Object.fromEntries(Object.entries(di[k]).map(([id, v]) => [back.get(id) ?? id, v]))]));
const sum = { breaks: 0, noteBreaks: 0, crossings: 0, bends: 0, before: { breaks: 0, noteBreaks: 0, crossings: 0, bends: 0 } };
const changed = [], added = [], gone = [];
let permChanged = 0, renChanged = 0, total = 0;
const volatile = [];
for (const name of names){
  const fx = fixtures.readFixture(name), model = fixtures.readModel(fx.xml).model;
  const h = kanonischHeute(model), A = layoutWith(fx.xml, h.model, h.rank, fx.sizes), C = lay(fx.xml, model, fx.sizes), key = diagramKey(C.di);
  const noteBreaks = b => b.filter(x => /^(note-on-|association-)/.test(x)).length;
  sum.breaks += C.breaks.length; sum.noteBreaks += noteBreaks(C.breaks); sum.crossings += C.crossings; sum.bends += C.bends;
  sum.before.breaks += A.breaks.length; sum.before.noteBreaks += noteBreaks(A.breaks); sum.before.crossings += A.crossings; sum.before.bends += A.bends;
  added.push(...C.breaks.filter(b => !A.breaks.includes(b)).map(b => name + ': ' + b));
  gone.push(...A.breaks.filter(b => !C.breaks.includes(b)).map(b => name + ': ' + b));
  if (diagramKey(A.di) !== key) changed.push(name + ' (Verstöße ' + A.breaks.length + '→' + C.breaks.length + ', Kreuzungen ' + A.crossings + '→' + C.crossings + ', Knicke ' + A.bends + '→' + C.bends + ', ' + A.width + '×' + A.height + '→' + C.width + '×' + C.height + ')');
  const rnd = makeRandom(2026 + names.indexOf(name)), rr = makeRandom(7 + names.indexOf(name));
  let pc = 0, rc = 0;
  for (let i = 0; i < K; i++){
    const xml = permuteAll(fx.xml, rnd), L = lay(xml, fixtures.readModel(xml).model, fx.sizes);
    if (diagramKey(L.di) !== key) pc++;
    const { xml: rx, back } = renameAll(fx.xml, rr), R = lay(rx, fixtures.readModel(rx).model, fx.sizes);
    if (diagramKey(translate(R.di, back)) !== key) rc++;
    total++;
  }
  permChanged += pc; renChanged += rc;
  if (pc || rc) volatile.push(name + ' (Umordnung ' + pc + '/' + K + ', Umbenennung ' + rc + '/' + K + ')');
  process.stderr.write('.');
}
process.stderr.write('\n');
console.log('kanonisch-notizen.mjs (Notizen an Pools: ' + opt.poolNotes + '), ' + names.length + ' Fixtures, Messart measured');
console.log('Qualität:  Verstöße ' + sum.before.breaks + ' → ' + sum.breaks + ' (davon Notiz-Verstöße ' + sum.before.noteBreaks + ' → ' + sum.noteBreaks + '), Kreuzungen ' + sum.before.crossings + ' → ' + sum.crossings + ', Knicke ' + sum.before.bends + ' → ' + sum.bends + ' (vorher: kanonisch() heute)');
console.log('Bild anders als mit kanonisch() heute: ' + changed.length + (changed.length ? '\n  ' + changed.join('\n  ') : ''));
console.log('Verstöße neu: ' + (added.length ? added.join('; ') : 'keine') + '\nVerstöße weg: ' + (gone.length ? gone.join('; ') : 'keine'));
console.log('Invarianz: Umordnung (inkl. Nachrichtenflüsse, Notizen, Assoziationen) Layout anders ' + permChanged + '/' + total + ' (' + (100 * permChanged / total).toFixed(1) + ' %), Umbenennung (inkl. derselben) ' + renChanged + '/' + total + ' (' + (100 * renChanged / total).toFixed(1) + ' %)' + (volatile.length ? '\n  volatil: ' + volatile.join(', ') : ''));
