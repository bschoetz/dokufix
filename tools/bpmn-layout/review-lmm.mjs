// Die Review-Seite der Bilder, die der Umbau außerhalb von BMad (2026-10-07) geändert hat: der Messer nach
// diagram-js in Arial (3597e43, 758b364) und LMM mit kanonisch() (f0ff93e). Jede Eingabe, deren Bild heute anders
// ist als vor dem Umbau (8266ec4), oben wie heute, darunter "nur Messer" (noch Mermaids Spalten) und "vorher".
// Der Filter "Anders erzeugt" zeigt die, die LMM über den Messer hinaus ändert.
//   node tools/bpmn-layout/vor-lmm.mjs && node tools/bpmn-layout/lauf.mjs && node tools/bpmn-layout/review-lmm.mjs
// Mit einem Lauf "basis" (lauf.mjs --lauf basis --stand dd1dd25) zeigt sie, wo die Regeln aus Bens Feedback vom
// 2026-10-07 das Bild noch einmal ändern; die Handfassungen (Bens hund2, die Handlayouts der Quellen) zuletzt.
// Schreibt arbeit/bpmn-feedback-lmm.html; das Paket von dort liest feedback-auswerten.mjs wie jedes andere.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HERE, ARBEIT, INPUTS, readLauf, laufDir } from './lib.mjs';

const vor = readLauf('vor-lmm'), mitte = readLauf('nur-messer'), jetzt = readLauf('produkt');
// Der Stand mit LMM vor den Bauten zu Bens Feedback (R8, R1, R18; dd1dd25), wo es ihn gibt (lauf.mjs --lauf basis
// --stand dd1dd25).
const basis = (() => { try { return readLauf('basis'); } catch { return null; } })();
const block = (xml, tag) => (new RegExp('<(?:[\\w.-]+:)?' + tag + '\\b[\\s\\S]*?</(?:[\\w.-]+:)?' + tag + '\\s*>').exec(xml) || [''])[0];
const read = (lauf, n) => { const f = path.join(laufDir(lauf), n + '.bpmn'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; };
const bild = xml => block(xml || '', 'BPMNDiagram');
const SETS = ['sauber', 'ben', 'extern', 'pools', 'blackbox', 'angeheftet', 'notizen'];
const order = n => SETS.indexOf(INPUTS.get(n).set);

const changed = Object.keys(jetzt.inputs).filter(n => vor.inputs[n] && bild(read('vor-lmm', n)) !== bild(read('produkt', n)));
const byLmm = changed.filter(n => bild(read('nur-messer', n)) !== bild(read('produkt', n)));
const names = [...byLmm, ...changed.filter(n => !byLmm.includes(n))].sort((p, q) => (byLmm.includes(q) - byLmm.includes(p)) || order(p) - order(q) || p.localeCompare(q));
const br = (l, n) => (l.inputs[n] && l.inputs[n].breaks || []).length;

// Der Vergleichssatz: die Fassungen mit Messer und Mermaids Spalten, je mit einer Zeile, was das Bild geändert hat.
const satz = {
  id: 'lmm-nur-messer-' + mitte.stand.commit, variant: 'LMM', logik: mitte.logik, angeordnet: mitte.angeordnet,
  knopf: 'Nur Messer groß', titel: 'nur Messer, Mermaids Spalten (' + mitte.stand.commit + ')',
  erzeugt: Object.fromEntries(names.map(n => [n, read('nur-messer', n)])),
  zeilen: Object.fromEntries(names.map(n => [n, (byLmm.includes(n) ? 'LMM ändert das Bild, dazu der Messer.' : 'Nur der Messer ändert das Bild; die Spalten von LMM sind dieselben wie Mermaids.')
    + (basis && bild(read('basis', n)) !== bild(read('produkt', n)) ? ' Dazu die Regeln aus deinem Feedback vom 2026-10-07 (R8, R1, R18).' : '')
    + ` Brüche vorher ${br(vor, n)}, nur Messer ${br(mitte, n)}, jetzt ${br(jetzt, n)}.`])),
};
fs.mkdirSync(path.join(ARBEIT, 'archiv'), { recursive: true });
fs.writeFileSync(path.join(ARBEIT, 'archiv', satz.id + '.json'), JSON.stringify(satz) + '\n');

// Die Handfassungen: Bens hund2 (eingaben/referenzen/, gleich tests/fixtures/bpmn-layout/hund2.ben.bpmn) und die
// Handlayouts der Quellen der externen Eingaben (<name>.ref.bpmn), je in einen Ordner des Arbeitsordners.
for (const [dir, pick] of [['hand-ben', i => i.name === 'hund2'], ['hand-quelle', i => i.name !== 'hund2']]){
  fs.rmSync(path.join(ARBEIT, dir), { recursive: true, force: true });
  fs.mkdirSync(path.join(ARBEIT, dir), { recursive: true });
  for (const i of INPUTS.values()) if (i.ref && pick(i)) fs.copyFileSync(i.ref, path.join(ARBEIT, dir, i.name + '.bpmn'));
}
const byRules = basis ? names.filter(n => bild(read('basis', n)) !== bild(read('produkt', n))) : [];
const varianten = {
  hinweis: `Alle ${names.length} Bilder, die der Umbau vom 2026-10-07 geändert hat (von ${Object.keys(vor.inputs).length} Eingaben; ${Object.keys(vor.inputs).length - names.length} sind gleich geblieben). Oben das Bild wie heute (${jetzt.stand.commit.slice(0, 7)}: LMM und der Messer in Arial), darunter <b>nur Messer</b> (${mitte.stand.commit}: Beschriftungen nach diagram-js in Arial, Ereignisse, Gateways und Flüsse 11 px, aber noch Mermaids Spalten) und <b>vorher</b> (${vor.stand.commit}: Mermaids Spalten, Beschriftungen in der Schrift des Browsers gemessen). Zuerst die ${byLmm.length}, die LMM ändert (Filter „Anders erzeugt“), dann die ${names.length - byLmm.length}, die nur der Messer ändert.${byRules.length ? ` ${byRules.length} davon ändern dazu die Regeln aus deinem Feedback vom 2026-10-07 (R8, R1, R18: ${byRules.join(', ')}); dort steht auch <b>vor den Regeln</b> darunter.` : ''} Wo es eine Fassung von Hand gibt, steht sie zuletzt: <b>Bens Handlayout</b> bei hund2, das <b>Handlayout der Quelle</b> bei den externen Eingaben. Brüche zusammen: vorher ${Object.keys(vor.inputs).reduce((s, n) => s + br(vor, n), 0)}, nur Messer ${Object.keys(mitte.inputs).reduce((s, n) => s + br(mitte, n), 0)}, jetzt ${Object.keys(jetzt.inputs).reduce((s, n) => s + br(jetzt, n), 0)}.`,
  varianten: [
    { key: 'messer', titel: 'Nur Messer (' + mitte.stand.commit + ', Mermaids Spalten)', dir: 'nur-messer' },
    { key: 'vorher', titel: 'Vorher (' + vor.stand.commit + ')', dir: 'vor-lmm' },
    ...(basis ? [{ key: 'basis', titel: 'LMM vor den Regeln aus deinem Feedback (' + basis.stand.commit.slice(0, 7) + ')', dir: 'basis', nurAnders: true }] : []),
    { key: 'ben', titel: 'Bens Handlayout', dir: 'hand-ben', nurAnders: true },
    { key: 'quelle', titel: 'Handlayout der Quelle', dir: 'hand-quelle', nurAnders: true },
  ],
};
const vfile = path.join(ARBEIT, 'review-lmm-varianten.json');
fs.writeFileSync(vfile, JSON.stringify(varianten) + '\n');
console.log(`${names.length} geänderte Bilder, ${byLmm.length} davon durch LMM`);
execFileSync('node', [path.join(HERE, 'feedback-bauen.mjs'), '--art', 'LMM', '--gegen', satz.id, '--varianten', vfile, ...names], { stdio: 'inherit' });
