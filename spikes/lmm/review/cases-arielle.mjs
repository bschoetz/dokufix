// Hand-made cases for the canonical arielle (ranks-optimiert.mjs), one per rule of its header, and its invariance
// against the order of the XML: a draft for tests/arielle.test.mjs.   node --test cases-arielle.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arielle } from './ranks-optimiert.mjs';
import { permuteXml, makeRandom } from './permute-xml.mjs';
import { renameXml } from './rename-xml.mjs';
const R = '/home/user/dokufix/';
const { fixtureNames, readFixture, readModel } = await import(R + 'tests/bpmn-fixtures.mjs');

// A model from a short notation: lanes as lists of node ids, flows as "a>b" or "a>b:name"; names from a map.
function model(laneLists, flowList, { boundaries = [], names = {} } = {}){
  const ids = laneLists.flat();
  const nodes = ids.map((id, i) => ({ id, name: names[id] ?? '', type: 'task', key: 'n' + (i + 1) }));
  const lanes = laneLists.map((l, i) => ({ id: 'L' + i, name: 'Bahn ' + i, nodes: l, key: 'l' + (i + 1) }));
  const flows = flowList.map((s, i) => { const [pair, name = ''] = s.split(':'); const [from, to] = pair.split('>'); return { id: 'F' + i, from, to, name }; });
  return { pools: [{ id: 'P', name: '' }], lanes, nodes, flows, boundaries, messages: [], notes: [], associations: [] };
}
const ranks = m => { const r = arielle(m); return Object.fromEntries(m.nodes.map(n => [n.id, r[n.key]])); };
// The columns by element id, dense.
const columns = m => { const r = arielle(m), xs = [...new Set(Object.values(r))].sort((a, b) => a - b); return Object.fromEntries(m.nodes.map(n => [n.id, xs.indexOf(r[n.key])])); };

test('a flow within a lane puts its target one column right; another lane allows the same column', () => {
  assert.deepEqual(ranks(model([['a', 'b'], ['c']], ['a>b', 'a>c'])), { a: 0, b: 1, c: 0 });
});
test('two nodes of a lane never share a column, even without a flow between them', () => {
  assert.deepEqual(ranks(model([['a', 'b', 'c']], [])), { a: 0, b: 1, c: 2 });
});
test('a name on a flow costs no column', () => {
  assert.deepEqual(ranks(model([['a', 'b']], ['a>b:ja'])), { a: 0, b: 1 });
});
test('a flow that closes a cycle counts the other way round', () => {
  assert.deepEqual(ranks(model([['a', 'b', 'c']], ['a>b', 'b>c', 'c>a'])), { a: 0, b: 1, c: 2 });
});
test('of two ways out of one node the one that reaches more nodes goes first', () => {
  // g → x → y → z (the main way) and g → e (a short exception), all in one lane: x takes the column after g.
  const m = model([['g', 'e', 'x', 'y', 'z']], ['g>e', 'g>x', 'x>y', 'y>z']);
  assert.deepEqual(ranks(m), { g: 0, x: 1, e: 2, y: 3, z: 4 });
});
test('equal ways go by the name of the flow, then of the node, then by the id', () => {
  assert.deepEqual(ranks(model([['g', 'b', 'a']], ['g>b:ja', 'g>a:nein'])), { g: 0, b: 1, a: 2 });
  assert.deepEqual(ranks(model([['g', 'b', 'a']], ['g>b', 'g>a'], { names: { b: 'Anfang', a: 'Ende' } })), { g: 0, b: 1, a: 2 });
  assert.deepEqual(ranks(model([['g', 'b', 'a']], ['g>b', 'g>a'])), { g: 0, a: 1, b: 2 });
});
test('the nodes nothing flows into go by lane first', () => {
  assert.deepEqual(ranks(model([['s2', 'x'], ['s1']], ['s2>x', 's1>x'])), { s2: 0, s1: 0, x: 1 });
});
test('a boundary event counts as its host; a flow back into the host sets nothing', () => {
  const m = model([['a', 'b', 'c']], ['a>b', 'B1>c', 'B1>a'], { boundaries: [{ id: 'B1', name: '', host: 'a', cancel: true }] });
  assert.deepEqual(ranks(m), { a: 0, b: 1, c: 2 });
});
test('the columns do not depend on the order of the nodes, the flowNodeRef or the flows in the XML', () => {
  for (const name of fixtureNames()){
    const fx = readFixture(name), base = columns(readModel(fx.xml).model), rnd = makeRandom(11);
    for (let k = 0; k < 20; k++) assert.deepEqual(columns(readModel(permuteXml(fx.xml, rnd)).model), base, name + ', reordering ' + k);
  }
});
test('the columns do not depend on the ids where names tell the ways apart (the fixtures)', () => {
  let changed = 0;
  for (const name of fixtureNames()){
    const fx = readFixture(name), base = columns(readModel(fx.xml).model), rnd = makeRandom(13);
    for (let k = 0; k < 5; k++){ const { xml, back } = renameXml(fx.xml, rnd); const c = columns(readModel(xml).model); if (Object.entries(c).some(([id, col]) => base[back.get(id)] !== col)) changed++; }
  }
  assert.equal(changed, 0);
});
