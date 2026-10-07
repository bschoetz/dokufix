// Vergleicht ergebnisse/ergebnisse.json gegen die Referenz (Chromium) und
// schreibt ergebnisse/tabelle.md: Übersicht je Umgebung, dann Fall × Umgebung
// mit der Art jeder Abweichung, dann die Laufzeiten.
//
//   node tabelle.mjs [--referenz chromium]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const store = JSON.parse(fs.readFileSync(path.join(here, 'ergebnisse', 'ergebnisse.json'), 'utf8'));
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const REF = arg('--referenz') || 'chromium';
const envs = Object.keys(store.umgebungen).filter(e => e !== REF);
const ref = store.umgebungen[REF].results;
const cases = Object.keys(ref);

const show = v => { const s = JSON.stringify(v); return s === undefined ? 'undefined' : s.length > 60 ? s.slice(0, 57) + '…' : s; };

// Der erste Unterschied zweier Werte als Pfad, tief.
function firstDiff(a, b, pfad = ''){
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return { pfad, erwartet: a, ist: b };
  if (Array.isArray(a) !== Array.isArray(b)) return { pfad, erwartet: a, ist: b };
  if (Array.isArray(a)){
    if (a.length !== b.length) return { pfad: pfad + '.length', erwartet: a.length, ist: b.length };
    for (let i = 0; i < a.length; i++){ const d = firstDiff(a[i], b[i], pfad + '[' + i + ']'); if (d) return d; }
    return null;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])){ const d = firstDiff(a[k], b[k], pfad + (pfad ? '.' : '') + k); if (d) return d; }
  return null;
}

// Die Art der Abweichung von r (Referenz) zu c (Kandidat), oder null.
export function vergleiche(r, c){
  if (!c) return 'kein Ergebnis';
  if (r.status !== c.status) return r.status + ' → ' + c.status + (c.message ? ' (' + c.message.slice(0, 80) + ')' : '') + (r.message ? ' [Referenz: ' + r.message.slice(0, 60) + ']' : '');
  if (r.status !== 'ok') return null; // beide fehlerhaft oder null: gleich
  const d = firstDiff({ model: r.model, leftOut: r.leftOut }, { model: c.model, leftOut: c.leftOut });
  if (!d) return null;
  return d.pfad + ': ' + show(d.erwartet) + ' → ' + show(d.ist);
}

const diffs = {}; // env → case → text
for (const e of envs){ diffs[e] = {}; for (const n of cases){ const d = vergleiche(ref[n], store.umgebungen[e].results[n]); if (d) diffs[e][n] = d; } }

const gruppe = n => n.split('-')[0];
const gruppen = [...new Set(cases.map(gruppe))];
let md = '# Vergleich der Umgebungen gegen ' + REF + '\n\nReferenz: ' + store.umgebungen[REF].info + '. Verglichen wird das Ergebnis von `lesen()` (`lesen.mjs`): der Status (ok, null, parsererror, error) und bei ok das Modell und `leftOut` von `readProcess()` als JSON. Gleich = Status gleich und bei ok das JSON gleich; zwei verschiedene Fehlermeldungen zählen als gleich (beide Parserfehler).\n\n';
md += '## Übersicht\n\n| Umgebung | ' + gruppen.map(g => g + ' (' + cases.filter(n => gruppe(n) === g).length + ')').join(' | ') + ' | abweichend gesamt |\n|---|' + gruppen.map(() => '---').join('|') + '|---|\n';
for (const e of envs){
  const per = gruppen.map(g => { const ns = cases.filter(n => gruppe(n) === g); const d = ns.filter(n => diffs[e][n]).length; return d ? d + ' abweichend' : 'alle gleich'; });
  md += '| ' + e + ' (' + store.umgebungen[e].info + ') | ' + per.join(' | ') + ' | ' + Object.keys(diffs[e]).length + ' von ' + cases.length + ' |\n';
}

md += '\n## Fall × Umgebung\n\nNur Fälle, in denen mindestens eine Umgebung abweicht. "=" gleich; sonst die Art: `status → status (Meldung)` oder `pfad: erwartet → ist`.\n\n';
const differing = cases.filter(n => envs.some(e => diffs[e][n]));
md += '| Fall | Referenz | ' + envs.join(' | ') + ' |\n|---|---|' + envs.map(() => '---').join('|') + '|\n';
for (const n of differing){
  const r = ref[n];
  md += '| ' + n + ' | ' + r.status + (r.message ? ' (' + r.message.slice(0, 70).replace(/\|/g, '\\|') + ')' : '') + ' | ' + envs.map(e => (diffs[e][n] || '=').replace(/\|/g, '\\|').replace(/\n/g, '\\n')).join(' | ') + ' |\n';
}
md += '\nGleich in allen Umgebungen: ' + (cases.length - differing.length) + ' von ' + cases.length + ' Fällen' + (cases.length - differing.length ? ' (' + cases.filter(n => !differing.includes(n)).map(n => gruppe(n)).reduce((m, g) => (m[g] = (m[g] || 0) + 1, m), {}) : '') + '.\n';
md = md.replace(/\(\[object Object\]\)/, '');

// Laufzeiten: Summe über die Fixtures, und der große Fall.
md += '\n## Laufzeit\n\nSumme von `lesen()` (Parsen und `readProcess()`) über die 57 Fixtures, und der Fall gross-5000 (eine Kette aus 5000 Aufgaben, 700 KB), je Umgebung, Millisekunden. Ein Lauf, ohne Aufwärmen, nur als Größenordnung.\n\n| Umgebung | Fixtures gesamt | davon Parsen | gross-5000 | davon Parsen |\n|---|---|---|---|---|\n';
for (const e of [REF, ...envs]){
  const res = store.umgebungen[e].results;
  const fx = cases.filter(n => gruppe(n) === 'fixture');
  const sum = k => fx.reduce((s, n) => s + (res[n] && res[n][k] || 0), 0);
  const g = res['korpus-gross-5000'] || {};
  md += '| ' + e + ' | ' + sum('ms').toFixed(1) + ' | ' + sum('msParse').toFixed(1) + ' | ' + (g.ms || 0).toFixed(1) + ' | ' + (g.msParse || 0).toFixed(1) + ' |\n';
}

fs.writeFileSync(path.join(here, 'ergebnisse', 'tabelle.md'), md);
console.log('Referenz ' + REF + ': ' + envs.map(e => e + ' ' + Object.keys(diffs[e]).length + ' abweichend').join(', ') + '; ' + differing.length + ' Fälle mit Abweichung');
for (const e of envs){ console.log('\n' + e); for (const [n, d] of Object.entries(diffs[e])) console.log('  ' + n + ': ' + d); }
