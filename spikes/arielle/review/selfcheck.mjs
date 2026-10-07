import { arielle } from './ranks-optimiert.mjs';
import { ranksWith, VARIANTS } from './varianten.mjs';
import { randomModel } from './gen.mjs';
const R = '/home/user/dokufix/';
const { fixtureNames, readFixture, readModel } = await import(R + 'tests/bpmn-fixtures.mjs');
const models = fixtureNames().map(n => readModel(readFixture(n).xml).model).concat(Array.from({ length: 5000 }, (_, i) => randomModel(i)));
let same = 0; const bad = [];
models.forEach((m, i) => { if (JSON.stringify(ranksWith(m, VARIANTS['kanonisch Struktur+Name, ohne Beschriftungsspalte'])) === JSON.stringify(arielle(m))) same++; else bad.push(i); });
console.log('arielle (ranks-optimiert.mjs) = ranksWith(kanonisch Struktur+Name, ohne Beschriftungsspalte): ' + same + '/' + models.length, bad.slice(0, 5));
