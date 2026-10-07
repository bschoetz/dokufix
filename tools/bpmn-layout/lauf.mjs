// Ordnet die Eingaben mit einem Stand des Layouts an, wie die Seite es tut, zählt Brüche (ohne Gateways und
// End-Ereignisse in einer anderen Bahn), misst Größe, Blöcke, Kreuzungen und Knicke (quality() in lib.mjs), wie oft
// finishGrid() je Regel lief (die Proben; seit dem 7. Oktober 2026) und die Nähe zu jeder Referenz von Hand, und
// schreibt arbeit/<lauf>/<name>.bpmn und arbeit/<lauf>.json.
//
//   node tools/bpmn-layout/lauf.mjs [--lauf <name>] [--stand <commit>] [--satz s,s] [--aus regel,regel] [--quiet] [name…]
//
// --lauf   der Name des Laufs, Vorgabe "produkt" (mit --stand: "stand-<commit>")
// --stand  ordnet mit src/app eines Commits an statt mit dem Arbeitsbaum (ab f0ff93e, LMM); so entsteht der
//          Vergleichsstand für vergleich.mjs
// --satz   nur diese Sätze (sauber, ben, extern, pools, blackbox, angeheftet, notizen, laufzeit); Vorgabe: alle außer
//          laufzeit
// --aus    schaltet diese Regeln für den Lauf ab (DEFAULT_RULES in src/app/bpmn-layout.js)
// Namen statt --satz: nur diese Eingaben.
import fs from 'node:fs';
import path from 'node:path';
import { INPUTS, STANDARD_SAETZE, externFehlt, EXTERN_ROOT, namesOf, readInput, loadStand, layOut, quality, rules, allBreaks, poolSize, closeness, blockStats, referenceOf, laufDir, laufFile, pct, args } from './lib.mjs';

const a = args(process.argv.slice(2), ['quiet']);
const stand = await loadStand(a.stand);
const lauf = a.lauf || (a.stand ? 'stand-' + stand.commit.slice(0, 8) : 'produkt');
const options = { ...stand.DEFAULT_RULES, ...Object.fromEntries((a.aus || '').split(',').filter(Boolean).map(k => { if (!(k in stand.DEFAULT_RULES)) throw new Error('keine Regel ' + k); return [k, false]; })) };
const breaksOf = await rules();
const out = laufDir(lauf);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const sets = a.satz ? a.satz.split(',') : STANDARD_SAETZE;
const names = a._.length ? a._ : namesOf(sets);
if (externFehlt()) console.log('Hinweis: keine externen Eingaben unter ' + EXTERN_ROOT + ' (DOKUFIX_EXTERN); nur die eigenen.');

const result = { lauf, stand: { commit: stand.commit, dirty: stand.dirty, angefragt: a.stand || null }, logik: stand.logik, rules: options, angeordnet: new Date().toISOString(), inputs: {} };
const sum = { eigen: 0, extern: 0, errors: 0, kinds: {}, blocks: 0, blockForeignNodes: 0, blockForeignFlows: 0, blockInColumns: 0, quality: { crossings: 0, msgCrossings: 0, bends: 0, msgBends: 0 }, runs: {} };
const close = [];
const t0 = process.hrtime.bigint();
for (const name of names){
  const fx = readInput(name);
  let row = { set: fx.set, extern: fx.extern };
  try {
    const t = process.hrtime.bigint();
    const laid = layOut(stand, fx.xml, options);
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    fs.writeFileSync(path.join(out, name + '.bpmn'), laid.xml);
    const { breaks, movedGateways } = allBreaks(breaksOf, laid.xml, laid.model);
    row = { ...row, breaks, movedGateways, size: poolSize(laid.di), ms: Math.round(ms * 10) / 10, block: blockStats(laid.xml, laid.model), quality: quality(laid.xml, laid.model), runs: laid.runs, leftOut: laid.leftOut.map(l => l.tag + ' ' + l.id + ': ' + l.reason) };
    for (const [k, v] of Object.entries(row.quality)) sum.quality[k] += v;
    for (const [k, v] of Object.entries(row.runs)) sum.runs[k] = (sum.runs[k] || 0) + v;
    const ref = referenceOf(name);
    if (ref){ row.closeness = closeness(laid.xml, ref, laid.model); close.push(row.closeness); }
    sum[fx.extern ? 'extern' : 'eigen'] += breaks.length;
    for (const k of ['blocks', 'foreignNodes', 'foreignFlows', 'inColumns']) sum[k === 'blocks' ? 'blocks' : 'block' + k[0].toUpperCase() + k.slice(1)] += row.block[k];
    for (const b of breaks){ const k = b.split(' ')[0]; sum.kinds[k] = (sum.kinds[k] || 0) + 1; }
    const runs = Object.values(row.runs).reduce((n, v) => n + v, 0);
    if (!a.quiet) console.log(name.padEnd(28), fx.set.padEnd(11), String(row.size[0] + 'x' + row.size[1]).padEnd(11), (breaks.length + ' Brüche').padEnd(10), (row.quality.crossings + row.quality.msgCrossings + ' Kr.').padEnd(7), (row.quality.bends + row.quality.msgBends + ' Kn.').padEnd(8), ((runs || '–') + ' Läufe').padEnd(10), breaks.join(', '));
  } catch (e){
    sum.errors++;
    row.error = e.message;
    console.log(name.padEnd(28), 'FEHLER', e.stack.split('\n').slice(0, 3).join(' | '));
  }
  result.inputs[name] = row;
}
sum.ms = Math.round(Number(process.hrtime.bigint() - t0) / 1e6);
const mean = k => close.length ? close.reduce((s, c) => s + c[k], 0) / close.length : 0;
sum.closeness = Object.fromEntries(['lane', 'gwLane', 'rows', 'cols', 'channel', 'detour', 'ratio'].map(k => [k, mean(k)]));
result.sum = sum;
const bySet = {};
for (const r of Object.values(result.inputs)) bySet[r.set] = (bySet[r.set] || 0) + 1;
console.log(`--- ${lauf} (${stand.commit.slice(0, 8)}${stand.dirty ? ', src/app geändert' : ''}, Logik ${stand.logik}): ${names.length} Eingaben (${Object.entries(bySet).map(([s, n]) => s + ' ' + n).join(', ')})`);
console.log(`    Brüche eigen ${sum.eigen}, extern ${sum.extern}${sum.errors ? ', ' + sum.errors + ' Fehler' : ''}; Blöcke ${sum.blocks}, fremde Knoten ${sum.blockForeignNodes}, fremde Flüsse ${sum.blockForeignFlows}, in Gateway-Spalten ${sum.blockInColumns}; ${sum.ms} ms`);
console.log(`    Nähe (Mittel über ${close.length} Referenzen): Bahn ${pct(mean('lane'))}, Gateway-Bahn ${pct(mean('gwLane'))}, Zeilen ${pct(mean('rows'))}, Spalten ${pct(mean('cols'))}, Rückflüsse im Kanal ${pct(mean('channel'))}, Umweg ${mean('detour').toFixed(2)}×, Fläche ${mean('ratio').toFixed(2)}×`);
const q = sum.quality, runOrder = ['R18', 'R10', 'R12', 'R14', 'R13', 'R16', 'R11', 'final'];
const runsAll = Object.values(sum.runs).reduce((n, v) => n + v, 0);
console.log(`    Kreuzungen ${q.crossings} (Nachrichtenflüsse ${q.msgCrossings}), Knicke ${q.bends} (Nachrichtenflüsse ${q.msgBends})`);
console.log('    Läufe von finishGrid(): ' + (runsAll ? runsAll + ' (' + runOrder.filter(k => sum.runs[k]).map(k => k + ' ' + sum.runs[k]).join(', ') + ')' : 'nicht gezählt (Stand vor dem Zähler)'));
console.log('    Arten: ' + Object.entries(sum.kinds).sort((x, y) => y[1] - x[1]).map(([k, n]) => k + ' ' + n).join(', '));
fs.writeFileSync(laufFile(lauf), JSON.stringify(result, null, 1) + '\n');
if (INPUTS.size && sum.errors) process.exitCode = 1;
