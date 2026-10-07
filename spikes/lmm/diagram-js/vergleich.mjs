// Vergleicht die Größen gegen die Messung von bpmn-js in Chromium (referenz-chromium.json):
//   - Prototyp (messer.mjs) mit der Tabelle Inter, mit und ohne Kerning, und mit Liberation Sans (andere Schrift als gezeichnet)
//   - Variante (a1): TextRenderer von bpmn-js ohne Viewer, im selben Chromium gemessen (referenz.mjs)
//   - das heutige labelSize() aus src/app/bpmn-layout.js
// Maße: mittlere und maximale Abweichung von Breite und Höhe, Anteil falscher Zeilenzahlen, Anteil exakt gleicher Größen.
// Dazu die Breitenfunktion allein gegen canvas.measureText (korpus-breiten-chromium.json). Schreibt ergebnisse.json.
//   node vergleich.mjs
import fs from 'node:fs';
import { messer, layoutText, breitenFunktion } from './messer.mjs';
import { HEIKEL } from './korpus.mjs';

const R = '/home/user/dokufix/';
const { labelSize } = await import(R + 'src/app/bpmn-layout.js');
const read = f => JSON.parse(fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8'));
const REF = read('referenz-chromium.json'), INTER = read('breiten-inter-12px.json'), LIB = read('breiten-liberation-sans-12px.json'), KB = read('korpus-breiten-chromium.json');
const heikel = new Set(HEIKEL);

// Die Zeilenzahl, wie referenz.mjs sie zählt: beim Zeichnen, also in der importierten Breite bzw. Notizbreite minus 14.
const protoLines = (widthOf, text, width, size) => layoutText(text, width ? width - 14 : size.w, widthOf).length;
const estimateLines = (text, width, size) => width ? (size.h <= 40 ? 1 : Math.round((size.h - 14) / 15)) : Math.round(size.h / 15);

const candidates = {
  'Prototyp, Inter, mit Kerning': (() => { const w = breitenFunktion(INTER), m = messer(w); return (t, wd) => { const s = m(t, wd); return { ...s, lines: protoLines(w, t, wd, s) }; }; })(),
  'Prototyp, Inter, ohne Kerning': (() => { const w = breitenFunktion(INTER, { kerning: false }), m = messer(w); return (t, wd) => { const s = m(t, wd); return { ...s, lines: protoLines(w, t, wd, s) }; }; })(),
  'Prototyp, Liberation Sans (Chromium zeichnet Inter)': (() => { const w = breitenFunktion(LIB), m = messer(w); return (t, wd) => { const s = m(t, wd); return { ...s, lines: protoLines(w, t, wd, s) }; }; })(),
  '(a1) TextRenderer ohne Viewer, Chromium': (t, wd) => REF.a1[wd ? 'note:' + wd + ':' + t : t],
  'heute: labelSize()': (t, wd) => { const s = labelSize(t, wd); return { ...s, lines: estimateLines(t, wd, s) }; },
};

function stats(keys, measure){
  const L = { n: 0, dw: 0, dh: 0, maxW: 0, maxH: 0, lines: 0, exact: 0 }, N = { n: 0, dh: 0, maxH: 0, lines: 0, exact: 0 };
  const worst = [];
  for (const k of keys){
    const m = /^note:(\d+):([\s\S]*)$/.exec(k);
    const ref = REF.referenz[k], got = m ? measure(m[2], +m[1]) : measure(k);
    const S = m ? N : L;
    S.n++;
    const dh = Math.abs(got.h - ref.h); S.dh += dh; S.maxH = Math.max(S.maxH, dh);
    if (!m){ const dw = Math.abs(got.w - ref.w); S.dw += dw; S.maxW = Math.max(S.maxW, dw); }
    if (got.lines !== ref.lines) S.lines++;
    if (got.w === ref.w && got.h === ref.h) S.exact++;
    if (dh || (!m && got.w !== ref.w)) worst.push({ k, ref, got, d: dh + (m ? 0 : Math.abs(got.w - ref.w)) });
  }
  worst.sort((a, b) => b.d - a.d);
  return {
    labels: { n: L.n, meanW: L.dw / L.n, maxW: L.maxW, meanH: L.dh / L.n, maxH: L.maxH, wrongLines: L.lines, exact: L.exact },
    notes: { n: N.n, meanH: N.dh / N.n, maxH: N.maxH, wrongLines: N.lines, exact: N.exact },
    worst: worst.slice(0, 5),
  };
}

const keys = Object.keys(REF.referenz);
const isHeikel = k => { const m = /^note:\d+:([\s\S]*)$/.exec(k); return heikel.has(m ? m[1] : k); };
const subsets = { 'alle': keys, 'nur Fixtures': keys.filter(k => !isHeikel(k)), 'nur heikle Texte': keys.filter(isHeikel) };
const results = {};
const f = x => x.toFixed(2);
for (const [subset, ks] of Object.entries(subsets)){
  results[subset] = {};
  console.log('\n### ' + subset + ' (' + ks.filter(k => !k.startsWith('note:')).length + ' Beschriftungen, ' + ks.filter(k => k.startsWith('note:')).length + ' Notizmessungen)\n');
  console.log('| Kandidat | Breite Ø | Breite max | Höhe Ø | Höhe max | Zeilen falsch | exakt gleich | Notiz Höhe Ø | Notiz Höhe max | Notiz Zeilen falsch | Notiz exakt |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [name, measure] of Object.entries(candidates)){
    const s = stats(ks, measure); results[subset][name] = s;
    const l = s.labels, n = s.notes;
    console.log(`| ${name} | ${f(l.meanW)} px | ${l.maxW} px | ${f(l.meanH)} px | ${l.maxH} px | ${l.wrongLines} (${(100 * l.wrongLines / l.n).toFixed(1)} %) | ${l.exact}/${l.n} | ${f(n.meanH)} px | ${n.maxH} px | ${n.wrongLines} (${(100 * n.wrongLines / n.n).toFixed(1)} %) | ${n.exact}/${n.n} |`);
  }
}
console.log('\nGrößte Abweichungen des Prototyps (Inter, mit Kerning), alle Texte:');
for (const w of results.alle['Prototyp, Inter, mit Kerning'].worst) console.log(' ', JSON.stringify(w.k), 'Referenz', w.ref.w + '×' + w.ref.h + '/' + w.ref.lines, 'Prototyp', w.got.w + '×' + w.got.h + '/' + w.got.lines);

// Die Breitenfunktion allein: Tabelle gegen canvas.measureText für jeden Korpustext und jedes Wort.
console.log('\n### Breitenfunktion gegen canvas.measureText (Texte und Wörter des Korpus, ohne Umbruch)\n');
console.log('| Tabelle | n | Abweichung Ø | max | > 0,5 px |');
console.log('|---|---|---|---|---|');
results.breiten = {};
for (const [name, tab, opts, ref] of [['Inter mit Kerning', INTER, {}, 'inter'], ['Inter ohne Kerning', INTER, { kerning: false }, 'inter'], ['Liberation Sans mit Kerning (gegen Liberation Sans)', LIB, {}, 'liberation-sans'], ['Liberation Sans (gegen Inter: Schrift anders)', LIB, {}, 'inter']]){
  const w = breitenFunktion(tab, opts);
  let n = 0, sum = 0, max = 0, over = 0, worst = null;
  for (const [t, m] of Object.entries(KB[ref])){ const d = Math.abs(w(t.replace(/\s+$/, '')) - m); n++; sum += d; if (d > max){ max = d; worst = t; } if (d > 0.5) over++; }
  results.breiten[name] = { n, mean: sum / n, max, over, worst };
  console.log(`| ${name} | ${n} | ${f(sum / n)} px | ${f(max)} px (${JSON.stringify(worst)}) | ${over} |`);
}
fs.writeFileSync(new URL('./ergebnisse.json', import.meta.url), JSON.stringify(results, null, 1));
