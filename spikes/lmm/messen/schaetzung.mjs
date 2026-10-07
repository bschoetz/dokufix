import fs from 'node:fs';
const R = '/home/user/dokufix/';
const { fixtureNames, readFixture, expectedFile } = await import(R + 'tests/bpmn-fixtures.mjs');
const { labelSize } = await import(R + 'src/app/bpmn-layout.js');
const seen = new Map();
for (const n of fixtureNames()) for (const [k, v] of Object.entries(readFixture(n).sizes)) seen.set(k, v);
let L = { n: 0, dw: 0, dh: 0, lines: 0, w10: 0 }, N = { n: 0, dh: 0, lines: 0 };
for (const [k, m] of seen){
  const note = /^note:(\d+):([\s\S]*)$/.exec(k);
  if (note){ const e = labelSize(note[2], +note[1]); N.n++; N.dh += Math.abs(e.h - m.h); if (Math.abs(e.h - m.h) >= 10) N.lines++; continue; }
  const e = labelSize(k); L.n++; L.dw += Math.abs(e.w - m.w); L.dh += Math.abs(e.h - m.h);
  if (Math.round(e.h / 15) !== Math.round(m.h / 14)) L.lines++;
  if (Math.abs(e.w - m.w) > 10) L.w10++;
}
console.log('Beschriftungen:', L.n, '| mittlere Abweichung Breite', (L.dw / L.n).toFixed(1), 'px, Höhe', (L.dh / L.n).toFixed(1), 'px | Zeilenzahl anders:', L.lines, '| Breite > 10 px daneben:', L.w10);
console.log('Notizbreiten:', N.n, '| mittlere Abweichung Höhe', (N.dh / N.n).toFixed(1), 'px | Höhe >= 10 px daneben:', N.lines);
let diff = 0; for (const n of fixtureNames()) if (fs.readFileSync(expectedFile(n, 'measured'), 'utf8') !== fs.readFileSync(expectedFile(n, 'estimated'), 'utf8')) diff++;
console.log('Fixtures, deren Layout mit Schätzung anders ist als mit Messung:', diff, '/', fixtureNames().length);
const ex = [...seen].filter(([k]) => !k.startsWith('note:')).slice(0, 6).map(([k, m]) => k + ': gemessen ' + m.w + '×' + m.h + ', geschätzt ' + labelSize(k).w.toFixed(0) + '×' + labelSize(k).h);
console.log(ex.join('\n'));
