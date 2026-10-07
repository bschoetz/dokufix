const R = '/home/user/dokufix/';
const { mermaidRanks } = await import('./ranks.mjs');
const { fixtureNames, readFixture, readModel } = await import(R + 'tests/bpmn-fixtures.mjs');
const ms = fixtureNames().map(n => readModel(readFixture(n).xml).model);
const t = performance.now(); for (let i = 0; i < 10; i++) for (const m of ms) mermaidRanks(m);
console.log('alle 57 Fixtures:', ((performance.now() - t) / 10).toFixed(1), 'ms je Durchlauf');
