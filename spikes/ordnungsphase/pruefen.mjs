// Teil b des ersten Schritts (docs/konzept-ordnungsphase.md): Trifft das Zählmodell die gezeichneten Kreuzungen?
//
//   node tools/bpmn-layout/lauf.mjs --quiet                                  # → produkt
//   node tools/bpmn-layout/lauf.mjs --quiet --lauf ohne-rowProbe --aus rowProbe   (ebenso crossProbe, combProbe,
//                                                                            stepAside, stagger)
//   node spikes/ordnungsphase/pruefen.mjs [lauf…]                            # Vorgabe: produkt und die fünf ohne-…
//
// Je Lauf und Eingabe: die gezeichneten Kreuzungen der Sequenzflüsse (quality() in tools/bpmn-layout/lib.mjs) und die
// gezählten nach jeder Regel des Zählmodells (zaehlmodell.mjs). Zwei Fragen:
//   1. Je Bild: Wie gut trifft die Zählung die gezeichneten Kreuzungen (gleich, Fehler, Korrelation)?
//   2. Je Paar (ein Lauf ohne Probe gegen produkt, nur wo sich das Bild unterscheidet): Erkennt die Zählung, welches
//      Bild weniger Kreuzungen hat? Das ist, was eine Rechnung statt einer Probe leisten muss.
// Die Läufe liegen in DOKUFIX_LAYOUT_ARBEIT (wie bei lauf.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { loadStand, readInput, readModel, readLauf, laufDir, quality } from '../../tools/bpmn-layout/lib.mjs';
import { zaehlen, REGELN } from './zaehlmodell.mjs';

const PROBEN = ['rowProbe', 'crossProbe', 'combProbe', 'stepAside', 'stagger'];
const laeufe = process.argv.slice(2).length ? process.argv.slice(2) : ['produkt', ...PROBEN.map(p => 'ohne-' + p)];
const stand = await loadStand();
const modelle = new Map();
const modellVon = name => { if (!modelle.has(name)) modelle.set(name, readModel(stand, readInput(name).xml).model); return modelle.get(name); };

// lauf → name → { xml, gezeichnet, gezaehlt: { regel → n } }
const daten = new Map();
for (const lauf of laeufe){
  const json = readLauf(lauf), je = new Map();
  for (const name of Object.keys(json.inputs)){
    const datei = path.join(laufDir(lauf), name + '.bpmn');
    if (!fs.existsSync(datei)) continue;
    const xml = fs.readFileSync(datei, 'utf8'), model = modellVon(name);
    je.set(name, { xml, gezeichnet: quality(xml, model).crossings, gezaehlt: Object.fromEntries(REGELN.map(r => [r, zaehlen(xml, model, r).kreuzungen])) });
  }
  daten.set(lauf, je);
}

// 1. Je Bild, jedes verschiedene Bild einmal.
const bilder = new Map();
for (const je of daten.values()) for (const [name, d] of je) bilder.set(name + '\0' + d.xml, d);
const pearson = (xs, ys) => {
  const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++){ sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
};
const liste = [...bilder.values()];
const gz = liste.map(d => d.gezeichnet);
console.log(`1. Je Bild: ${liste.length} verschiedene Bilder aus ${laeufe.length} Läufen, gezeichnet zusammen ${gz.reduce((s, v) => s + v, 0)} Kreuzungen, in ${gz.filter(Boolean).length} Bildern`);
console.log('   Regel    gleich   ±1      Fehler Σ|Δ|   gezählt Σ   Korrelation   gezählt > 0 bei gezeichnet 0   gezählt 0 bei gezeichnet > 0');
for (const r of REGELN){
  const zz = liste.map(d => d.gezaehlt[r]);
  const gleich = liste.filter(d => d.gezaehlt[r] === d.gezeichnet).length, nah = liste.filter(d => Math.abs(d.gezaehlt[r] - d.gezeichnet) <= 1).length;
  const fehler = liste.reduce((s, d) => s + Math.abs(d.gezaehlt[r] - d.gezeichnet), 0);
  const falschAlarm = liste.filter(d => !d.gezeichnet && d.gezaehlt[r]).length, verpasst = liste.filter(d => d.gezeichnet && !d.gezaehlt[r]).length;
  console.log('   ' + r.padEnd(8) + ' ' + String(gleich).padStart(4) + '   ' + String(nah).padStart(4) + '    ' + String(fehler).padStart(6) + '        ' + String(zz.reduce((s, v) => s + v, 0)).padStart(5) + '       ' + pearson(gz, zz).toFixed(2).padStart(5) + '        ' + String(falschAlarm).padStart(5) + '                          ' + String(verpasst).padStart(5));
}

// 2. Je Paar.
if (daten.has('produkt')){
  console.log('\n2. Je Paar (ohne Probe gegen produkt, wo das Bild anders ist): die Richtung des Unterschieds');
  console.log('   Lauf                Paare   gezeichnet anders   Regel: Richtung gleich / gezählt gleich / entgegen');
  const basis = daten.get('produkt');
  const summe = Object.fromEntries(REGELN.map(r => [r, [0, 0, 0]]));
  let paareAlle = 0, andersAlle = 0;
  for (const [lauf, je] of daten){
    if (lauf === 'produkt') continue;
    let paare = 0, anders = 0;
    const zahl = Object.fromEntries(REGELN.map(r => [r, [0, 0, 0]]));
    for (const [name, d] of je){
      const b = basis.get(name);
      if (!b || b.xml === d.xml) continue;
      paare++;
      const dg = Math.sign(d.gezeichnet - b.gezeichnet);
      if (!dg) continue;
      anders++;
      for (const r of REGELN){
        const dz = Math.sign(d.gezaehlt[r] - b.gezaehlt[r]);
        zahl[r][dz === dg ? 0 : dz === 0 ? 1 : 2]++;
      }
    }
    paareAlle += paare; andersAlle += anders;
    for (const r of REGELN) for (let k = 0; k < 3; k++) summe[r][k] += zahl[r][k];
    console.log('   ' + lauf.padEnd(20) + String(paare).padStart(5) + String(anders).padStart(16) + '        ' + REGELN.map(r => r + ' ' + zahl[r].join('/')).join('  '));
  }
  console.log('   ' + 'zusammen'.padEnd(20) + String(paareAlle).padStart(5) + String(andersAlle).padStart(16) + '        ' + REGELN.map(r => r + ' ' + summe[r].join('/')).join('  '));
}
