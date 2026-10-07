// Erzeugt die Breitentabellen in Chromium: die Vorschubbreite jedes Zeichens bei "normal 12px <Schrift>" über
// canvas.measureText, genau wie getTextBBox() in diagram-js 15.28.0 misst, dazu die Kerning-Paare (Paare, deren
// gemessene Breite von der Summe der Einzelbreiten abweicht). Schriften: Inter (die Schrift, die dieses Chromium für
// BPMN_FONT nimmt) und Liberation Sans (metrisch gleich Arial/Helvetica). Beide SIL Open Font License 1.1.
// Schreibt breiten-<schrift>-12px.json und korpus-breiten-chromium.json (measureText jedes Korpustexts und Worts,
// zum Prüfen der Tabellen ohne Umbruchlogik).
//   node tabelle.mjs
import fs from 'node:fs';
import { withPage } from './browser.mjs';
import { korpus } from './korpus.mjs';

const FONTS = { 'inter': 'Inter', 'liberation-sans': 'Liberation Sans' };
// Die Zeichen der Tabelle: ASCII, Latin-1, Latin Extended-A, allgemeine Interpunktion, Währung, Buchstabenähnliche.
const ranges = [[0x20, 0x7e], [0xa0, 0x17f], [0x2010, 0x2027], [0x2030, 0x203a], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x9, 0x9]];
const chars = ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCharCode(a + i)));
// Die Paare für das Kerning: Buchstaben, Ziffern, häufige Satzzeichen und Umlaute.
const pairChars = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;-()/!?\'"ÄÖÜäöüß'];
const K = korpus();
const texts = [...new Set([...K.labels, ...K.notes])];

const out = await withPage(page => page.evaluate(({ FONTS, chars, pairChars, texts }) => {
  const ctx = document.createElement('canvas').getContext('2d');
  const result = { kerningDefault: ctx.fontKerning, tables: {}, korpus: {} };
  for (const [key, family] of Object.entries(FONTS)){
    ctx.font = 'normal 12px ' + family;
    const w = s => ctx.measureText(s).width;
    const widths = {};
    for (const c of chars) widths[c] = w(c);
    // Ein paar Zeichen außerhalb der Bereiche, für den Rückfall: CJK, Emoji, Geviert.
    const extra = {}; for (const c of ['請', '审', '核', '🎉', '­', ' ']) extra[c] = w(c);
    const kerning = {};
    for (const a of pairChars) for (const b of pairChars){
      const d = w(a + b) - widths[a] - widths[b];
      if (Math.abs(d) > 1e-6) kerning[a + b] = d;
    }
    const m = ctx.measureText('Hg');
    result.tables[key] = { family, widths, extra, kerning, ascent: m.fontBoundingBoxAscent, descent: m.fontBoundingBoxDescent };
    const kor = {};
    for (const t of texts){
      kor[t] = w(t.replace(/\s+$/, ''));
      for (const word of t.split(/\s+/).filter(Boolean)) if (!(word in kor)) kor[word] = w(word);
    }
    result.korpus[key] = kor;
  }
  return result;
}, { FONTS, chars, pairChars, texts }));

console.log('fontKerning in Chromium:', out.kerningDefault);
for (const [key, t] of Object.entries(out.tables)){
  const kerned = Object.keys(t.kerning).length;
  console.log(key + ':', Object.keys(t.widths).length, 'Zeichen,', kerned, 'Kerning-Paare von', pairChars.length ** 2, '| Hg ascent', t.ascent, 'descent', t.descent, '| Beispiele:', JSON.stringify({ a: t.widths.a, W: t.widths.W, i: t.widths.i, ' ': t.widths[' '], '-': t.widths['-'], soft: t.extra['­'], cjk: t.extra['請'], emoji: t.extra['🎉'] }));
  fs.writeFileSync(new URL('./breiten-' + key + '-12px.json', import.meta.url), JSON.stringify({
    schrift: t.family, lizenz: 'SIL Open Font License 1.1', groesse: '12px', gewicht: 'normal', gemessen: 'Chromium (HeadlessChrome 141, /opt/pw-browsers/chromium), canvas.measureText, fontKerning ' + out.kerningDefault,
    ascent: t.ascent, descent: t.descent, breiten: t.widths, weitere: t.extra, kerning: t.kerning,
  }, null, 0));
}
fs.writeFileSync(new URL('./korpus-breiten-chromium.json', import.meta.url), JSON.stringify(out.korpus, null, 0));
