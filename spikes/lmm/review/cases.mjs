// Hand-made cases, one per rule of arielle's header: a draft for a tests/arielle.test.mjs. Each is checked against
// the exact replica too.   node --test cases.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arielleExakt as arielle } from './ranks-exakt.mjs';
import { mermaidRanks } from '../ranks.mjs';

// A model from a short notation: lanes as lists of node ids, flows as "a>b" or "a>b:name".
function model(laneLists, flowList, boundaries = []){
  const ids = laneLists.flat();
  const nodes = ids.map((id, i) => ({ id, name: id, type: 'task', key: 'n' + (i + 1) }));
  const lanes = laneLists.map((l, i) => ({ id: 'L' + i, name: 'Bahn ' + i, nodes: l, key: 'l' + (i + 1), ...(l.length ? {} : { hold: 'h' + (i + 1) }) }));
  const flows = flowList.map((s, i) => { const [pair, name = ''] = s.split(':'); const [from, to] = pair.split('>'); return { id: 'F' + i, from, to, name }; });
  return { pools: [{ id: 'P', name: '' }], lanes, nodes, flows, boundaries, messages: [], notes: [], associations: [] };
}
// The replica also ranks labels and placeholders; compared are the nodes.
const ranks = m => { const r = arielle(m), x = mermaidRanks(m); assert.deepEqual(r, Object.fromEntries(m.nodes.map(n => [n.key, x[n.key]])), 'as the replica'); return Object.fromEntries(m.nodes.map(n => [n.id, r[n.key]])); };

test('a flow within a lane puts its target one column right; another lane allows the same column', () => {
  assert.deepEqual(ranks(model([['a', 'b'], ['c']], ['a>b', 'a>c'])), { a: 0, b: 1, c: 0 });
});
test('two nodes of a lane never share a column, even without a flow between them', () => {
  assert.deepEqual(ranks(model([['a', 'b', 'c']], [])), { a: 0, b: 1, c: 2 });
});
test('a named flow costs a column: its label stands between', () => {
  assert.deepEqual(ranks(model([['a', 'b']], ['a>b:ja'])), { a: 0, b: 2 });
  // Across lanes the label stands in the target's lane, so the target moves one column right, not none.
  assert.deepEqual(ranks(model([['a'], ['b']], ['a>b:ja'])), { a: 0, b: 1 });
});
test('the label is ranked before the nodes of its generation and takes the next free column of its lane', () => {
  // a → b named, a → c: the label takes column 1, c column 2, b column 3.
  assert.deepEqual(ranks(model([['a', 'b', 'c']], ['a>b:ja', 'a>c'])), { a: 0, b: 3, c: 2 });
});
test('a flow that closes a cycle counts the other way round', () => {
  assert.deepEqual(ranks(model([['a', 'b', 'c']], ['a>b', 'b>c', 'c>a'])), { a: 0, b: 1, c: 2 });
});
test('within a generation the keys are ordered as strings: n10 before n2', () => {
  const ids = Array.from({ length: 10 }, (_, i) => 'x' + i); // x0 = n1 … x9 = n10
  const r = ranks(model([ids], ids.slice(1).map(id => 'x0>' + id)));
  // All nine successors are one generation; "n10" (x9) sorts before "n2" (x1).
  assert.equal(r.x9, 1); assert.equal(r.x1, 2);
});
test('a boundary event counts as its host; a flow back into the host sets nothing', () => {
  const m = model([['a', 'b', 'c']], ['a>b', 'B1>c', 'B1>a'], [{ id: 'B1', name: '', host: 'a', cancel: true }]);
  assert.deepEqual(ranks(m), { a: 0, b: 1, c: 2 });
});
test('an empty lane and the lanes of several pools change nothing', () => {
  const m = model([['a'], [], ['b']], ['a>b']);
  m.lanes[2].pool = 1; m.pools.push({ id: 'Q', name: '' });
  assert.deepEqual(ranks(m), { a: 0, b: 0 });
});
test('parallel flows of one pair, named or not, give one rank per node', () => {
  assert.deepEqual(ranks(model([['a', 'b', 'c']], ['a>b', 'a>b:x', 'a>b:y', 'b>c'])), { a: 0, b: 3, c: 4 });
});
test('a node in two lanes stands in the first', () => {
  const m = model([['a', 'b'], ['c']], ['a>b']); m.lanes[1].nodes.push('b');
  assert.deepEqual(ranks(m), { a: 0, b: 1, c: 0 });
});
