// Reicht Bens eigene Fälle aus der Layout-Werkbank in den Satz werkbank ein (Story 2.42): aus einem Arbeitsstand
// („Arbeitsstand speichern“, jeder eigene Fall) oder einem Paket („Paket herunterladen“, die Fälle mit Feedback am
// Stand), nur die Fälle der Herkunft eigen. Jeder geht durch check() von tools/bpmn-layout/pruefen.mjs; wer durchgeht,
// wird tools/bpmn-layout/eingaben/werkbank/wbNN-<name>.bpmn, ohne Koordinaten. So ordnen lauf.mjs und vergleich.mjs
// ihn bei jedem Layout-Bau an, und der nächste Bau der Werkbank trägt ihn; die Seite gibt dem gespeicherten eigenen
// Fall dann Namen und Satz der Eingabe (src/werkbank/speicher.js).
//
//   node tools/werkbank/einreichen.mjs <datei>                 die eigenen Fälle, ihre Prüfung und ihr Dateiname
//   node tools/werkbank/einreichen.mjs <datei> <name>…         diese einreichen
//   node tools/werkbank/einreichen.mjs <datei> --alle          alle eigenen, die noch keine Eingabe sind
//
// Die Nummer ist die nächste nach der höchsten, die der Ordner je hatte (die Dateien darin und, was git dort je
// angelegt hat): eine Nummer wird nie wieder vergeben. Ein Fall, dessen Fingerabdruck schon eine Eingabe eines Satzes
// ist, wird übersprungen. Eine externe Eingabe kommt nie in den Satz: ein Fall, der eine Revision einer externen
// Eingabe ist oder ihren Namen trägt, wird abgelehnt, und ohne die externen Eingaben (externFehlt()) schreibt das
// Werkzeug nichts, denn dann ist das nicht prüfbar. Exit 1, wenn ein genannter Fall fehlt, extern ist oder die Prüfung
// ihn ablehnt; die übrigen werden trotzdem geschrieben.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { INPUTS, WERKBANK_EINGABEN, REPO, EXTERN_ROOT, externFehlt, args } from '../bpmn-layout/lib.mjs';
import { check } from '../bpmn-layout/pruefen.mjs';
import { caseFingerprint } from '../../src/app/fingerprint.js';
import { anzeigeName, ohneDi } from '../../src/werkbank/faelle.js';
import { ZUSTAND_FORMAT } from '../../src/werkbank/speicher.js';
import { runAsCommand } from '../seiten.mjs';

export const PAKET_FORMAT = 'dokufix-layout-feedback';

// Die eigenen Fälle einer Datei der Werkbank: [{ name, eingabe, fall, bezug }], name wie in der Liste der Seite,
// bezug die Namen, auf denen der Fall beruht: sein eigener ohne Revision und, im Arbeitsstand, die der Fälle davor
// (vorher; eine Revision, die Ben einem Fall zuordnet, ist eigen, auch wo der Fall extern ist). Wirft, wo die Datei
// weder ein Arbeitsstand noch ein Paket ist.
export function eigeneFaelle(datei){
  const ist = (x, format) => x && typeof x === 'object' && x.format === format;
  const ohneRevision = name => String(name).replace(/ \(\d+\)$/, '');
  let roh;
  if (ist(datei, ZUSTAND_FORMAT) && Array.isArray(datei.faelle)){
    const vonFall = new Map(datei.faelle.filter(f => f && f.fall).map(f => [f.fall, f]));
    const kette = f => { const out = []; for (let x = f, n = 0; x && n < 1000; x = vonFall.get(x.vorher), n++) out.push(x.name); return out; };
    roh = datei.faelle.filter(f => f && f.herkunft === 'eigen').map(f => ({ name: anzeigeName(f), eingabe: f.eingabe, bezug: kette(f) }));
  }
  else if (ist(datei, PAKET_FORMAT) && Array.isArray(datei.beispiele)) roh = datei.beispiele.filter(b => b && b.herkunft === 'eigen').map(b => ({ name: b.name, eingabe: b.eingabe, bezug: [ohneRevision(b.name)] }));
  else throw new Error('Weder ein Arbeitsstand noch ein Paket der Werkbank.');
  const out = [];
  for (const { name, eingabe, bezug } of roh){
    const fp = typeof eingabe === 'string' && typeof name === 'string' ? caseFingerprint(eingabe) : null;
    if (fp && !out.some(f => f.fall === fp.hash)) out.push({ name, eingabe: ohneDi(eingabe), fall: fp.hash, bezug: [...new Set(bezug.filter(n => typeof n === 'string').map(ohneRevision))] });
  }
  return out;
}

// Der Name in der Datei: klein, ASCII, alles andere "-", höchstens 40 Zeichen.
export function kurzname(name){
  const s = String(name).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40).replace(/-+$/, '');
  return s || 'fall';
}
export const dateiName = (nr, name) => 'wb' + String(nr).padStart(2, '0') + '-' + kurzname(name) + '.bpmn';

// Die nächste Nummer nach der höchsten unter den Dateinamen namen (wb01-… → 1).
export function naechsteNummer(namen){
  let hoch = 0;
  for (const n of namen){ const m = /^wb(\d+)-/.exec(path.basename(n)); if (m) hoch = Math.max(hoch, Number(m[1])); }
  return hoch + 1;
}
// Die Dateinamen, die der Ordner hat oder in git je hatte; außerhalb von git nur die im Ordner.
export function vergebeneNamen(ordner){
  const da = fs.existsSync(ordner) ? fs.readdirSync(ordner) : [];
  let frueher = [];
  try {
    frueher = execFileSync('git', ['log', '--all', '--format=', '--name-only', '--diff-filter=A', '--', path.relative(REPO, ordner)], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch { /* kein git oder der Ordner liegt außerhalb */ }
  return [...da, ...frueher];
}

// Die Fingerabdrücke der Eingaben aller Sätze: fall → { name, satz }.
export function eingabenNachFall(){
  const out = new Map();
  for (const i of INPUTS.values()){ const fp = caseFingerprint(fs.readFileSync(i.file, 'utf8')); if (fp && !out.has(fp.hash)) out.set(fp.hash, { name: i.name, satz: i.set }); }
  return out;
}
// Die Namen der externen Eingaben.
export const externeNamen = () => new Set([...INPUTS.values()].filter(i => i.extern).map(i => i.name));

// Prüft die Fälle und schreibt, wo schreiben, die gültigen nach ordner. faelle: eigeneFaelle(); vorhanden:
// eingabenNachFall(); extern: externeNamen(). [{ name, als? ({ name, satz }: schon diese Eingabe), extern? (beruht auf
// dieser externen Eingabe), errors?, datei? (Dateiname, geschrieben oder vorgeschlagen) }].
export async function einreichen(faelle, { ordner = WERKBANK_EINGABEN, vorhanden = eingabenNachFall(), extern = externeNamen(), schreiben = false } = {}){
  let nr = naechsteNummer(vergebeneNamen(ordner));
  const out = [];
  for (const f of faelle){
    if (vorhanden.has(f.fall)){ out.push({ name: f.name, als: vorhanden.get(f.fall) }); continue; }
    const fremd = (f.bezug || []).find(n => extern.has(n));
    if (fremd){ out.push({ name: f.name, extern: fremd }); continue; }
    const { errors } = await check(f.eingabe);
    if (errors.length){ out.push({ name: f.name, errors }); continue; }
    const datei = dateiName(nr++, f.name);
    if (schreiben){
      fs.mkdirSync(ordner, { recursive: true });
      fs.writeFileSync(path.join(ordner, datei), f.eingabe.trimEnd() + '\n');
    }
    out.push({ name: f.name, datei });
  }
  return out;
}

if (runAsCommand(import.meta.url)){
  const a = args(process.argv.slice(2), ['alle']);
  const [file, ...namen] = a._;
  const fail = text => { console.error(text); process.exit(1); };
  if (!file) fail('Aufruf: node tools/werkbank/einreichen.mjs <arbeitsstand-oder-paket.json> [<name>… | --alle]');
  let faelle;
  try { faelle = eigeneFaelle(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch (e){ fail(file + ': ' + e.message); }
  const schreiben = a.alle || namen.length > 0;
  if (schreiben && externFehlt()) fail('Die externen Eingaben fehlen (' + path.relative(process.cwd(), path.join(EXTERN_ROOT, 'extern')) + ', oder DOKUFIX_EXTERN): ob ein Fall extern ist, ist nicht prüfbar. Nichts geschrieben.');
  const fehlen = namen.filter(n => !faelle.some(f => f.name === n));
  const gewaehlt = a.alle ? faelle : namen.length ? faelle.filter(f => namen.includes(f.name)) : faelle;
  if (!faelle.length) console.log('Keine eigenen Fälle in ' + file + '.');
  const rel = d => path.relative(process.cwd(), path.join(WERKBANK_EINGABEN, d));
  let abgelehnt = 0;
  for (const r of await einreichen(gewaehlt, { schreiben })){
    if (r.als) console.log(r.name.padEnd(30), 'schon im Satz', r.als.satz, 'als', r.als.name);
    else if (r.extern){ abgelehnt++; console.log(r.name.padEnd(30), 'abgelehnt: beruht auf der externen Eingabe', r.extern); }
    else if (r.errors){ abgelehnt++; console.log(r.name.padEnd(30), 'abgelehnt:', r.errors.length, 'Fehler'); for (const e of r.errors) console.log('    ' + e); }
    else console.log(r.name.padEnd(30), schreiben ? 'geschrieben:' : 'gültig, würde', rel(r.datei));
  }
  for (const n of fehlen) console.log(n.padEnd(30), 'kein eigener Fall in', file);
  if (!schreiben && faelle.length) console.log('--- Einreichen mit den Namen oder --alle.');
  if (fehlen.length || (schreiben && abgelehnt)) process.exitCode = 1;
}
