// Der Import der Layout-Werkbank (Story 2.39): was außerhalb von git lebt, als eine JSON-Datei, die die Seite einmal in
// ihren Speicher nimmt („Import laden“). Nie in git: die Datei liegt in tools/bpmn-layout/arbeit/ (.gitignore), denn sie
// trägt die externen Eingaben.
//
//   node tools/werkbank/import.mjs [--aus <datei>]       → arbeit/werkbank-import.json
//
// Darin:
//   eingaben   die externen Eingaben ohne Koordinaten, mit ihren Handlayouts als Referenz, für die Seite in dist/, die
//              sie nicht trägt
//   faelle     Fälle, die keine heutige Eingabe sind (die Eingabe eines Pakets, die es nicht mehr gibt); heute keiner
//   fassungen  Bens letzte Bearbeitung je Fall aus den Paketen in arbeit/feedback/, als seine Fassung mit soll: false
//              (Ben, 2026-10-09: an manchen Stellen hat er nur das Gröbste repariert, sie ist nicht immer das Ziel),
//              mit Datum, Kommentar und Stand (die Logik des Satzes, ohne sie seine ID)
//   archiv     je Fall, nur zum Lesen: die Anordnungen aus arbeit/archiv/, eine je Inhalt mit allen Ständen (logik,
//              ohne sie die ID des Satzes), unter denen sie stand; die übrigen Bearbeitungen und Kommentare der Pakete;
//              die Variantenvergleiche (*-varianten.json) als Text, mit der Anordnung jeder Variante, wo sie keine
//              schon archivierte ist
//
// Zu welchem Fall etwas gehört, sagt der Fingerabdruck (src/app/fingerprint.js): die Eingabe eines Pakets genau, eine
// Anordnung ohne Bahnzugehörigkeit (ohneBahnen() in src/werkbank/faelle.js), denn das Layout schreibt einen Knoten, den
// es in eine andere Bahn setzt, dort in flowNodeRef; teilen mehrere Eingaben diesen Abdruck, die gleichen Namens. Die
// Eingabe eines Pakets, die keine heutige ist, wird ein Fall der Herkunft `archiv` (die Seite legt ihn als Revision des
// Namens an); eine Anordnung ohne Treffer geht an die heutige Eingabe ihres Namens, ohne sie fehlt sie und wird gezählt.
// Die Seite der alten Feedback-Seite und ihre Datenbank (dokufix-layout-feedback) liest das Skript nicht: deren Inhalt
// steht in ihren Paketen.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { INPUTS, ARBEIT, REPO, args } from '../bpmn-layout/lib.mjs';
import { caseFingerprint } from '../../src/app/fingerprint.js';
import { ohneDi, ohneBahnen } from '../../src/werkbank/faelle.js';
import { IMPORT_FORMAT } from '../../src/werkbank/speicher.js';
import { runAsCommand } from '../seiten.mjs';

export const OUT = path.join(ARBEIT, 'werkbank-import.json');
const sha = text => crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
const lesen = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const text = html => String(html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

// Der Import als Objekt. arbeit: der Arbeitsordner; jetzt: die Zeit, die er trägt.
export function importBauen({ arbeit = ARBEIT, jetzt = new Date().toISOString() } = {}){
  // Die heutigen Eingaben: name → fall, und die Abdrücke, genau und ohne Bahnen.
  // los: je Abdruck ohne Bahnen die Eingaben, die ihn haben ([{ name, fall }]; r19 und r20 teilen einen).
  const genau = new Map(), los = new Map(), vonName = new Map();
  for (const i of INPUTS.values()){
    const xml = fs.readFileSync(i.file, 'utf8'), fp = caseFingerprint(xml);
    if (!fp) continue;
    if (!genau.has(fp.hash)) genau.set(fp.hash, fp.hash);
    const l = ohneBahnen(xml);
    if (l) (los.get(l.hash) || los.set(l.hash, []).get(l.hash)).push({ name: i.name, fall: fp.hash });
    vonName.set(i.name, fp.hash);
  }
  const faelle = new Map(), fehlt = [];
  // Der Fall einer Eingabe (eines Pakets) oder einer Anordnung, oder null.
  function fallVon({ name, eingabe, xml, herkunft }){
    if (eingabe){
      const fp = caseFingerprint(eingabe);
      if (fp && genau.has(fp.hash)) return fp.hash;
    }
    // Ohne Bahnen: ein Treffer, oder unter mehreren der gleichen Namens; sonst keiner.
    const l = ohneBahnen(eingabe || xml), treffer = l ? los.get(l.hash) || [] : [];
    const fall = new Set(treffer.map(t => t.fall)).size === 1 ? treffer[0].fall : (treffer.find(t => t.name === name) || {}).fall;
    if (fall) return fall;
    // Der Name nur für eine Anordnung ohne Eingabe; die Eingabe eines Pakets, die keine heutige ist, wird ein Fall für
    // sich (die Seite legt ihn als Revision des Namens an).
    if (!eingabe && vonName.has(name)) return vonName.get(name);
    if (eingabe){
      const fp = caseFingerprint(eingabe);
      if (!fp) return null;
      if (!faelle.has(fp.hash)) faelle.set(fp.hash, { fall: fp.hash, name, herkunft, eingabe: ohneDi(eingabe) });
      genau.set(fp.hash, fp.hash);
      return fp.hash;
    }
    return null;
  }

  // Die externen Eingaben.
  const eingaben = [];
  for (const i of INPUTS.values()){
    if (!i.extern) continue;
    const e = { name: i.name, satz: i.set, xml: ohneDi(fs.readFileSync(i.file, 'utf8')) };
    if (i.ref) e.referenz = fs.readFileSync(i.ref, 'utf8');
    eingaben.push(e);
  }

  // Die Pakete: je Fall die letzte Bearbeitung als Fassung, alles andere ins Archiv.
  const archiv = new Map();
  const ablegen = rec => archiv.set(rec.fall + '|' + rec.id, rec);
  const eintraege = [];
  const fbDir = path.join(arbeit, 'feedback');
  for (const d of fs.existsSync(fbDir) ? fs.readdirSync(fbDir).sort() : []){
    const file = path.join(fbDir, d, 'paket.json');
    if (!fs.existsSync(file)) continue;
    const pkg = lesen(file);
    if (pkg.format !== 'dokufix-layout-feedback' || !pkg.satz || !Array.isArray(pkg.beispiele)) continue;
    const stand = pkg.satz.logik || pkg.satz.id;
    for (const b of pkg.beispiele){
      const fall = fallVon({ name: b.name, eingabe: b.eingabe, xml: b.erzeugt, herkunft: 'archiv' });
      if (!fall){ fehlt.push(d + '/' + b.name); continue; }
      eintraege.push({ fall, name: b.name, satz: pkg.satz.id, stand, geaendert: b.geaendert || pkg.exportiert, bearbeitet: b.bearbeitet || null, kommentar: (b.kommentar || '').trim(), erzeugt: b.erzeugt || null });
    }
  }
  const fassungen = [];
  const letzte = new Map();
  for (const e of eintraege) if (e.bearbeitet && (!letzte.has(e.fall) || String(e.geaendert) > String(letzte.get(e.fall).geaendert))) letzte.set(e.fall, e);
  for (const e of letzte.values()) fassungen.push({ fall: e.fall, stand: e.stand, bearbeitet: e.bearbeitet, kommentar: e.kommentar, geaendert: e.geaendert, soll: false, quelle: e.satz });
  for (const e of eintraege){
    if (letzte.get(e.fall) === e) continue;
    if (e.bearbeitet) ablegen({ fall: e.fall, id: 'bearbeitung-' + e.satz + '-' + sha(e.bearbeitet), art: 'bearbeitung', satz: e.satz, stand: e.stand, geaendert: e.geaendert, xml: e.bearbeitet, kommentar: e.kommentar });
    else if (e.kommentar) ablegen({ fall: e.fall, id: 'kommentar-' + e.satz + '-' + sha(e.kommentar), art: 'kommentar', satz: e.satz, stand: e.stand, geaendert: e.geaendert, kommentar: e.kommentar });
  }

  // Die Anordnungen des Archivs: eine je Fall und Inhalt, mit allen Ständen, unter denen sie stand.
  const anordnungen = new Map();
  function anordnung(fall, xml, { stand, satz, variante, angeordnet }){
    const id = 'anordnung-' + sha(xml), key = fall + '|' + id;
    const a = anordnungen.get(key) || anordnungen.set(key, { fall, id, art: 'anordnung', staende: [], saetze: [], varianten: [], angeordnet: angeordnet || null, xml }).get(key);
    if (stand && !a.staende.includes(stand)) a.staende.push(stand);
    if (satz && !a.saetze.includes(satz)) a.saetze.push(satz);
    if (variante && !a.varianten.includes(variante)) a.varianten.push(variante);
    if (angeordnet && (!a.angeordnet || angeordnet < a.angeordnet)) a.angeordnet = angeordnet;
    return a;
  }
  const arDir = path.join(arbeit, 'archiv');
  for (const f of fs.existsSync(arDir) ? fs.readdirSync(arDir).filter(f => f.endsWith('.json')).sort() : []){
    const x = lesen(path.join(arDir, f));
    for (const [name, xml] of Object.entries(x.erzeugt || {})){
      const fall = fallVon({ name, xml });
      if (!fall){ fehlt.push('archiv/' + f + '/' + name); continue; }
      anordnung(fall, xml, { stand: x.logik || x.id, satz: x.id, variante: x.variant, angeordnet: x.angeordnet });
    }
  }
  // Die Variantenvergleiche: jede Variante mit ihrer Anordnung; der Hinweis als Text je Datei bei den Fällen, deren
  // Varianten sich unterscheiden (bei den übrigen zeigte der Vergleich dasselbe Bild).
  for (const f of fs.existsSync(arbeit) ? fs.readdirSync(arbeit).filter(f => f.endsWith('-varianten.json')).sort() : []){
    const v = lesen(path.join(arbeit, f)), datei = f.replace(/\.json$/, ''), bilder = new Map();
    for (const va of v.varianten || []){
      const dir = path.join(arbeit, va.dir);
      if (!fs.existsSync(dir)) continue;
      const laufFile = dir + '.json', logik = fs.existsSync(laufFile) ? lesen(laufFile).logik : null;
      for (const file of fs.readdirSync(dir).filter(x => x.endsWith('.bpmn'))){
        const name = file.slice(0, -5), xml = fs.readFileSync(path.join(dir, file), 'utf8');
        const fall = fallVon({ name, xml });
        if (!fall) continue;
        anordnung(fall, xml, { stand: logik, variante: datei + ': ' + (va.titel ? text(va.titel) : va.key) });
        (bilder.get(fall) || bilder.set(fall, new Set()).get(fall)).add(sha(xml));
      }
    }
    for (const [fall, set] of bilder) if (set.size > 1) ablegen({ fall, id: 'varianten-' + datei, art: 'varianten', datei: f, hinweis: text(v.hinweis), varianten: (v.varianten || []).map(x => ({ key: x.key, titel: text(x.titel || x.key), dir: x.dir })) });
  }
  for (const a of anordnungen.values()) ablegen(a);

  return {
    format: IMPORT_FORMAT, version: 1, erstellt: jetzt, quelle: path.relative(REPO, arbeit),
    eingaben, faelle: [...faelle.values()], fassungen,
    archiv: [...archiv.values()].sort((a, b) => a.fall.localeCompare(b.fall) || a.id.localeCompare(b.id)),
    fehlt,
  };
}

if (runAsCommand(import.meta.url)){
  const a = args(process.argv.slice(2));
  const imp = importBauen();
  const out = a.aus || OUT;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(imp) + '\n');
  const zahl = art => imp.archiv.filter(x => x.art === art).length;
  console.log(path.relative(process.cwd(), out), (fs.statSync(out).size / 1e6).toFixed(1).replace('.', ',') + ' MB:', imp.eingaben.length, 'externe Eingaben,', imp.fassungen.length, 'Fassungen,', zahl('anordnung'), 'Anordnungen,', zahl('bearbeitung'), 'ältere Bearbeitungen,', zahl('kommentar'), 'Kommentare,', zahl('varianten'), 'Variantenvergleiche im Archiv' + (imp.faelle.length ? ', ' + imp.faelle.length + ' Fälle ohne heutige Eingabe' : '') + (imp.fehlt.length ? '; ohne Fall: ' + imp.fehlt.join(', ') : ''));
}
