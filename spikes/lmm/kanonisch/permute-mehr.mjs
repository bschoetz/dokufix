// Beyond permute-xml.mjs: the message flows of the collaboration, the text annotations and the associations of a
// process are reordered too (their order is the author's by design, review of 2.31; here measured, not claimed).
//   node permute-mehr.mjs [K]   → share of reorderings whose layout differs, arielle alone and with kanonisch()
import { fixtures, layoutWith, diagramKey } from '../review/measure.mjs';
import { permuteXml, makeRandom } from '../review/permute-xml.mjs';
import { arielle } from '../review/ranks-optimiert.mjs';
import { kanonisch } from './kanonisch.mjs';
const { DOMParser } = await import('/home/user/dokufix/node_modules/linkedom/esm/index.js');
const local = el => String(el.localName || '').replace(/^.*:/, '');
const shuffle = (arr, rnd) => { const a = [...arr]; for (let k = a.length - 1; k > 0; k--){ const j = Math.floor(rnd() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
function reorder(parent, test, rnd, doc){
  const els = [...parent.children].filter(test);
  if (els.length < 2) return;
  const slots = els.map(e => { const p = doc.createComment('slot'); e.replaceWith(p); return p; });
  shuffle(els, rnd).forEach((e, i) => slots[i].replaceWith(e));
}
function permuteMore(xml, rnd){
  const doc = new DOMParser().parseFromString(permuteXml(xml, rnd), 'text/xml');
  for (const el of [...doc.documentElement.children]){
    if (local(el) === 'collaboration') reorder(el, k => local(k) === 'messageFlow', rnd, doc);
    if (local(el) === 'process' || local(el) === 'collaboration'){ reorder(el, k => local(k) === 'textAnnotation', rnd, doc); reorder(el, k => local(k) === 'association', rnd, doc); }
  }
  return doc.toString();
}
const K = Number(process.argv[2] || 5), names = fixtures.fixtureNames();
const res = { allein: { changed: 0, fixtures: [] }, kanonisch: { changed: 0, fixtures: [] } };
let total = 0;
for (const name of names){
  const fx = fixtures.readFixture(name), model0 = fixtures.readModel(fx.xml).model;
  const k0 = kanonisch(model0);
  const key = { allein: diagramKey(layoutWith(fx.xml, model0, arielle(model0), fx.sizes).di), kanonisch: diagramKey(layoutWith(fx.xml, k0.model, k0.rank, fx.sizes).di) };
  const rnd = makeRandom(555 + names.indexOf(name));
  const c = { allein: 0, kanonisch: 0 };
  for (let i = 0; i < K; i++){
    const xml = permuteMore(fx.xml, rnd), m = fixtures.readModel(xml).model, k = kanonisch(m);
    total++;
    if (diagramKey(layoutWith(xml, m, arielle(m), fx.sizes).di) !== key.allein) c.allein++;
    if (diagramKey(layoutWith(xml, k.model, k.rank, fx.sizes).di) !== key.kanonisch) c.kanonisch++;
  }
  for (const v of ['allein', 'kanonisch']){ res[v].changed += c[v]; if (c[v]) res[v].fixtures.push(name + ' ' + c[v] + '/' + K); }
  process.stderr.write('.');
}
for (const v of ['allein', 'kanonisch']) console.log('\n' + v + ': Layout anders ' + res[v].changed + '/' + total + ' (' + (100 * res[v].changed / total).toFixed(1) + ' %): ' + res[v].fixtures.join(', '));
