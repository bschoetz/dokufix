// arielleOrder() gives the same ranks as arielle() on every fixture and on 2000 random models of gen.mjs.
const R = '/home/user/dokufix/';
const { fixtureNames, readFixture, readModel } = await import(R + 'tests/bpmn-fixtures.mjs');
const { arielle } = await import('../review/ranks-optimiert.mjs');
const { arielleOrder } = await import('./arielle-order.mjs');
const gen = await import('../review/gen.mjs');
let same = 0, n = 0;
const check = (model, what) => { n++; if (JSON.stringify(arielle(model)) === JSON.stringify(arielleOrder(model).rank)) same++; else console.log('anders:', what); };
for (const name of fixtureNames()) check(readModel(readFixture(name).xml).model, name);
const rnd = gen.makeRandom ? gen.makeRandom(7) : null;
const make = gen.randomModel || gen.generate || gen.model || null;
if (make){ for (let i = 0; i < 2000; i++) check(make(rnd ? rnd : i), 'Zufall ' + i); }
else console.log('gen.mjs exportiert:', Object.keys(gen).join(', '));
console.log('gleiche Ränge:', same + '/' + n);
