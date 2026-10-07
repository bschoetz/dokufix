// Run time: arielle and the exact replica on the 57 fixtures and on large random models.
import { arielleExakt } from './ranks-exakt.mjs';
import { arielle } from './ranks-optimiert.mjs';
import { mermaidRanks } from '../ranks.mjs';
import { randomModel } from './gen.mjs';
const R = '/home/user/dokufix/';
const { fixtureNames, readFixture, readModel } = await import(R + 'tests/bpmn-fixtures.mjs');
const ms = fixtureNames().map(n => readModel(readFixture(n).xml).model);
const big = Array.from({ length: 200 }, (_, i) => randomModel(i, { big: true }));
const time = (fn, models, runs = 20) => { fn(models[0]); const t = performance.now(); for (let i = 0; i < runs; i++) for (const m of models) fn(m); return ((performance.now() - t) / runs).toFixed(2); };
console.log('57 Fixtures je Durchlauf: Nachbau ' + time(mermaidRanks, ms) + ' ms, exakt ' + time(arielleExakt, ms) + ' ms, arielle ' + time(arielle, ms) + ' ms');
console.log('200 große Zufallsmodelle (' + Math.min(...big.map(m => m.nodes.length)) + '–' + Math.max(...big.map(m => m.nodes.length)) + ' Knoten): Nachbau ' + time(mermaidRanks, big, 5) + ' ms, exakt ' + time(arielleExakt, big, 5) + ' ms, arielle ' + time(arielle, big, 5) + ' ms');
// A long chain: the depth of the search.
const chain = n => ({ pools: [{ id: 'P', name: '' }], lanes: [{ id: 'L', name: '', nodes: Array.from({ length: n }, (_, j) => 'X' + j), key: 'l1' }], nodes: Array.from({ length: n }, (_, j) => ({ id: 'X' + j, name: '', type: 'task', key: 'n' + (j + 1) })), flows: Array.from({ length: n - 1 }, (_, j) => ({ id: 'F' + j, from: 'X' + j, to: 'X' + (j + 1), name: '' })), boundaries: [] });
for (const n of [1000, 5000]){ try { const t = performance.now(); arielle(chain(n)); console.log('Kette mit ' + n + ' Knoten: arielle ' + (performance.now() - t).toFixed(1) + ' ms'); } catch (e){ console.log('Kette mit ' + n + ' Knoten: ' + e.constructor.name + ' ' + String(e.message).slice(0, 60)); } }
