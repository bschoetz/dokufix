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
    const movable = local(el) === 'process' ? kids.filter(k => local(k) !== 'laneSet')
                  : local(el) === 'collaboration' ? kids.filter(k => ['messageFlow', 'textAnnotation', 'association'].includes(local(k)))
                  : local(el) === 'lane' ? kids.filter(k => local(k) === 'flowNodeRef') : [];
    if (movable.length < 2) continue;
    const anchor = movable[movable.length - 1].nextSibling;
    for (const k of movable) k.remove();
    for (const k of shuffle(movable)) el.insertBefore(k, anchor);
  }
  return doc.toString();
}

// Independent check of kanonisch(): own permutation, measured layout per element id, quality totals.
const { kanonisch: kanonischAlt } = await import('../kanonisch/kanonisch.mjs');
const { kanonisch } = await import('../notizen/kanonisch-notizen.mjs');
const { layoutWith, diagramKey } = await import('../review/measure.mjs');
const run = (fx, model, sort) => { if (sort){ const k = (sort === 'alt' ? kanonischAlt : kanonisch)(model); return layoutWith(fx.xml, k.model, k.rank, fx.sizes); } return layoutWith(fx.xml, model, arielle(model), fx.sizes); };
for (const sort of ['alt', 'neu']){
  let changed = 0, total = 0, br = 0, cr = 0, be = 0; const fixtures = new Set();
  for (const name of fixtureNames()){
    const fx = readFixture(name), base = run(fx, readModel(fx.xml).model, sort), ref = diagramKey(base.di);
    br += base.breaks.length; cr += base.crossings; be += base.bends;
    for (let i = 0; i < 10; i++){ total++; const m = readModel(permute(fx.xml)).model; if (diagramKey(run(fx, m, sort).di) !== ref){ changed++; fixtures.add(name); } }
  }
  console.log((sort === 'alt' ? 'kanonisch() bisher' : 'kanonisch() mit Notizen').padEnd(24), 'Layout geändert bei Umordnung:', changed + '/' + total, '(' + fixtures.size + ' Fixtures) | Verstöße', br, 'Kreuzungen', cr, 'Knicke', be);
}
