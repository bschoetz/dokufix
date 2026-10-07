// Independent check: shuffle meaningless XML order, compare column relations by element id.
const R = '/home/user/dokufix/';
const { DOMParser } = await import(R + 'node_modules/linkedom/esm/index.js');
const { fixtureNames, readFixture, readModel } = await import(R + 'tests/bpmn-fixtures.mjs');
const { arielle } = await import('../review/ranks-optimiert.mjs');
const { arielleExakt } = await import('../review/ranks-exakt.mjs');
let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const local = el => String(el.localName || el.nodeName).replace(/^.*:/, '');
function permute(xml){
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const all = []; const walk = e => { all.push(e); for (const k of e.children) walk(k); }; walk(doc.documentElement);
  for (const el of all){
    const kids = [...el.children];
    const movable = local(el) === 'process' ? kids.filter(k => !['laneSet', 'textAnnotation', 'association'].includes(local(k)))
                  : local(el) === 'lane' ? kids.filter(k => local(k) === 'flowNodeRef') : [];
    if (movable.length < 2) continue;
    const anchor = movable[movable.length - 1].nextSibling;
    for (const k of movable) k.remove();
    for (const k of shuffle(movable)) el.insertBefore(k, anchor);
  }
  return doc.toString();
}
const relation = (model, rank) => { const ids = model.nodes.map(n => n.id).sort(), key = new Map(model.nodes.map(n => [n.id, n.key])); return ids.flatMap(a => ids.map(b => Math.sign(rank[key.get(a)] - rank[key.get(b)]))).join(''); };
{ const fx = readFixture('r05'); console.log('Probe r05:', readModel(fx.xml).model.nodes.map(n => n.id).join(' '), '->', readModel(permute(fx.xml)).model.nodes.map(n => n.id).join(' ')); }
for (const [label, fn] of [['exakt', arielleExakt], ['arielle', arielle]]){
  let changed = 0, total = 0;
  for (const name of fixtureNames()){
    const fx = readFixture(name), base = readModel(fx.xml).model, ref = relation(base, fn(base));
    for (let i = 0; i < 10; i++){ const m = readModel(permute(fx.xml)).model; total++; if (relation(m, fn(m)) !== ref) changed++; }
  }
  console.log(label.padEnd(8), 'Umordnungen mit anderen Spalten:', changed + '/' + total, '(' + (100 * changed / total).toFixed(1) + ' %)');
}
