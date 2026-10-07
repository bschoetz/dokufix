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

const { layoutGeometry, labelSize } = await import(R + 'src/app/bpmn-layout.js');
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// The model in a canonical order: nodes by column, lane, name, id; flows by their ends' columns, name, id; the rest by id.
function canonical(model){
  const rank = arielle(model), byId = new Map(model.nodes.map(n => [n.id, n]));
  const laneOf = new Map(); model.lanes.forEach((l, i) => l.nodes.forEach(id => laneOf.has(id) || laneOf.set(id, i)));
  const hostOf = new Map((model.boundaries || []).map(b => [b.id, b.host]));
  const r = id => rank[byId.get(hostOf.get(id) ?? id).key];
  const nodeKey = (a, b) => r(a.id) - r(b.id) || laneOf.get(a.id) - laneOf.get(b.id) || cmp(a.name || '', b.name || '') || cmp(a.id, b.id);
  const nodes = [...model.nodes].sort(nodeKey), pos = new Map(nodes.map((n, i) => [n.id, i]));
  const p = id => pos.get(hostOf.get(id) ?? id) ?? -1;
  const byIdKey = (a, b) => cmp(a.id || '', b.id || '');
  return { ...model, nodes,
    lanes: model.lanes.map(l => ({ ...l, nodes: [...l.nodes].sort((a, b) => pos.get(a) - pos.get(b)) })),
    flows: [...model.flows].sort((a, b) => p(a.from) - p(b.from) || p(a.to) - p(b.to) || cmp(a.name || '', b.name || '') || cmp(a.id, b.id)),
    boundaries: [...(model.boundaries || [])].sort((a, b) => p(a.host) - p(b.host) || cmp(a.name || '', b.name || '') || cmp(a.id, b.id)),
    messages: [...(model.messages || [])].sort(byIdKey), notes: [...(model.notes || [])].sort(byIdKey), associations: [...(model.associations || [])].sort(byIdKey) };
}

const { layoutWith, rules } = await import('../review/measure.mjs');
const known = rules.readKnownBreaks();
let tot = { a: [0, 0, 0], c: [0, 0, 0] }; const rows = [];
for (const name of fixtureNames()){
  const fx = readFixture(name), model = readModel(fx.xml).model, cm = canonical(model);
  const A = layoutWith(fx.xml, model, arielle(model), fx.sizes), C = layoutWith(fx.xml, cm, arielle(cm), fx.sizes);
  const k = known[name] || [];
  tot.a[0] += A.breaks.length; tot.a[1] += A.crossings; tot.a[2] += A.bends;
  tot.c[0] += C.breaks.length; tot.c[1] += C.crossings; tot.c[2] += C.bends;
  if (JSON.stringify(A.di) !== JSON.stringify(C.di) || A.breaks.join() !== C.breaks.join()){
    const added = C.breaks.filter(b => !A.breaks.includes(b)), gone = A.breaks.filter(b => !C.breaks.includes(b));
    rows.push(`| ${name} | ${A.breaks.length} → ${C.breaks.length} | ${A.crossings} → ${C.crossings} | ${A.bends} → ${C.bends} | ${added.join('; ') || '–'} | ${gone.join('; ') || '–'} |`);
  }
}
console.log('arielle allein:      Verstöße', tot.a[0], 'Kreuzungen', tot.a[1], 'Knicke', tot.a[2]);
console.log('arielle + kanonisch: Verstöße', tot.c[0], 'Kreuzungen', tot.c[1], 'Knicke', tot.c[2]);
console.log('| Fixture | Verstöße | Kreuzungen | Knicke | neu | weg |'); console.log('|---|---|---|---|---|---|'); rows.forEach(r => console.log(r));
