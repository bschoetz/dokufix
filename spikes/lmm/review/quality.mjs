// The quality of the finished layout per variant, on the 57 fixtures (measured mode): how many laid-out XML change
// against the expected, the breaks of the rules against known-breaks.json (new, gone, where), crossings, bends, size.
//   node quality.mjs            all variants, a Markdown table to stdout and quality.json
import fs from 'node:fs';
import { ranksWith, VARIANTS } from './varianten.mjs';
import { fixtures, rules, layoutWith } from './measure.mjs';
const names = fixtures.fixtureNames();
const known = rules.readKnownBreaks();
const loaded = names.map(name => { const fx = fixtures.readFixture(name); return { name, fx, model: fixtures.readModel(fx.xml).model, expected: fs.readFileSync(fixtures.expectedFile(name, 'measured'), 'utf8') }; });
const results = {};
for (const [variant, o] of Object.entries(VARIANTS)){
  const r = { xmlChanged: [], newBreaks: [], goneBreaks: [], breaks: 0, crossings: 0, bends: 0, width: 0, height: 0, perFixture: {} };
  for (const { name, fx, model, expected } of loaded){
    const out = layoutWith(fx.xml, model, ranksWith(model, o), fx.sizes);
    if (out.laid !== expected) r.xmlChanged.push(name);
    const lines = rules.compareBreaks(name, out.breaks, known[name]);
    for (const l of lines) (l.includes('new break') ? r.newBreaks : r.goneBreaks).push(l);
    r.breaks += out.breaks.length; r.crossings += out.crossings; r.bends += out.bends; r.width += out.width; r.height += out.height;
    r.perFixture[name] = { breaks: out.breaks.length, crossings: out.crossings, bends: out.bends, width: out.width, height: out.height, changed: out.laid !== expected };
  }
  results[variant] = r;
  process.stderr.write(variant + ' fertig\n');
}
fs.writeFileSync(new URL('./quality.json', import.meta.url), JSON.stringify(results, null, 1));
const ref = results['exakt (Mermaid)'];
console.log('| Variante | XML geändert (57) | Verstöße gesamt | neu | weg | Kreuzungen | Knicke | Breite gesamt | Höhe gesamt |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const [variant, r] of Object.entries(results)) console.log('| ' + variant + ' | ' + r.xmlChanged.length + ' | ' + r.breaks + ' | ' + r.newBreaks.length + ' | ' + r.goneBreaks.length + ' | ' + r.crossings + ' | ' + r.bends + ' | ' + r.width + ' | ' + r.height + ' |');
console.log('\nReferenz: ' + ref.breaks + ' Verstöße, ' + ref.crossings + ' Kreuzungen, ' + ref.bends + ' Knicke.\n');
for (const [variant, r] of Object.entries(results)){
  if (variant === 'exakt (Mermaid)') continue;
  console.log('### ' + variant);
  console.log('XML geändert: ' + (r.xmlChanged.join(', ') || 'keins'));
  for (const l of r.newBreaks) console.log('  + ' + l);
  for (const l of r.goneBreaks) console.log('  - ' + l);
  const worse = names.filter(n => r.perFixture[n].crossings > ref.perFixture[n].crossings), better = names.filter(n => r.perFixture[n].crossings < ref.perFixture[n].crossings);
  console.log('Kreuzungen mehr in: ' + (worse.map(n => n + ' (' + ref.perFixture[n].crossings + '→' + r.perFixture[n].crossings + ')').join(', ') || 'keinem') + '; weniger in: ' + (better.map(n => n + ' (' + ref.perFixture[n].crossings + '→' + r.perFixture[n].crossings + ')').join(', ') || 'keinem'));
  console.log();
}
