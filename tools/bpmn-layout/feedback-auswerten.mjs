// Wertet ein Paket des Layout-Feedbacks aus (feedback-bauen.mjs; aus Spike 2.26 im Store übernommen, 2026-10-07,
// auf LMM umgestellt): legt je Beispiel Eingabe, erzeugte und bearbeitete Fassung und den Kommentar ab und schreibt
// eine Übersicht, was Ben geändert hat, gemessen an der erzeugten Fassung: Brüche vorher und nachher, Nähe (wie
// closeness() für die Referenzen), Knoten mit anderer Bahn, Paare mit anderer Reihenfolge links–rechts oder
// oben–unten in einer Bahn, Flüsse mit anderem Verlauf und ihre Knicke. Je Beispiel dazu der Fingerabdruck des Falls
// (src/app/fingerprint.js, Story 2.37) und die Eingabe der Sammlung, die es ist, sonst die drei nach der Form nächsten.
// Ein Paket der Layout-Werkbank (Story 2.39) trägt je Beispiel seine Herkunft, eigen oder den Satz; sie steht beim
// Beispiel.
//   node tools/bpmn-layout/feedback-auswerten.mjs <paket.json> [--out <ordner>]
// Ohne --out: arbeit/feedback/<satz>-<datum des Exports>/; feedback-bauen.mjs erkennt daran, zu welchem Satz Feedback
// kam.
import fs from 'node:fs';
import path from 'node:path';
import { REPO, ARBEIT, loadStand, readModel, rules, allBreaks as breaksAll, compact, closeness, pct, args, fingerprints } from './lib.mjs';
import { aenderungen } from '../../src/bpmn-tools/aenderungen.js';
import { caseFingerprint, shapeOf, nearest } from '../../src/app/fingerprint.js';

const a = args(process.argv.slice(2));
if (!a._[0]) throw new Error('Aufruf: node tools/bpmn-layout/feedback-auswerten.mjs <paket.json> [--out <ordner>]');
const pkg = JSON.parse(fs.readFileSync(a._[0], 'utf8'));
if (pkg.format !== 'dokufix-layout-feedback') throw new Error('Kein Paket des Layout-Feedbacks.');
// Gelesen wird mit dem Stand im Arbeitsbaum.
const mod = await loadStand();
const breaksOf = await rules();
const out = a.out || path.join(ARBEIT, 'feedback', pkg.satz.id + '-' + String(pkg.exportiert).slice(0, 10));
fs.mkdirSync(out, { recursive: true });

// Welche Eingabe der Sammlung ein Beispiel ist: gleicher Fall, sonst die drei nach der Form nächsten.
const fps = fingerprints();
function whichInput(xml){
  const fall = caseFingerprint(xml);
  if (!fall) return 'Fall: kein BPMN.';
  const same = [...fps].filter(([, fp]) => fp.fall && fp.fall.hash === fall.hash).map(([name]) => name);
  if (same.length) return `Fall ${fall.short}: die Eingabe ${same.join(' = ')}.`;
  const form = shapeOf(xml), near = form ? nearest(form, fps) : [];
  return `Fall ${fall.short}: keine Eingabe der Sammlung` + (near.length ? `; nach der Form am nächsten ${near.map(n => `${n.name} ${Math.round(n.similarity * 100)} %`).join(', ')}` : '') + '.';
}

const allBreaks = (xml, model) => breaksAll(breaksOf, compact(xml), model).breaks;

const lines = [`# Layout-Feedback ${pkg.satz.id}`, '', `Variante ${pkg.satz.variant}, exportiert ${pkg.exportiert}, ${pkg.beispiele.length} Beispiele.`, ''];
for (const b of pkg.beispiele){
  // Der Ordner des Beispiels: sein Name ohne Pfadzeichen (ein Name aus der Werkbank kann "/" tragen oder ".." sein).
  const dir = path.join(out, String(b.name).replace(/[\/\\:]/g, '_').replace(/^\.+/, '_') || '_');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'eingabe.bpmn'), b.eingabe);
  fs.writeFileSync(path.join(dir, 'erzeugt.bpmn'), b.erzeugt);
  if (b.bearbeitet) fs.writeFileSync(path.join(dir, 'bearbeitet.bpmn'), b.bearbeitet);
  if ((b.kommentar || '').trim()) fs.writeFileSync(path.join(dir, 'kommentar.md'), b.kommentar.trim() + '\n');

  // Die Herkunft (Story 2.39): eigen oder der Satz, aus dem das Beispiel stammt; ältere Pakete haben sie nicht.
  lines.push(`## ${b.name}`, '', `${b.herkunft ? 'Herkunft ' + b.herkunft : b.paket}; ${b.bearbeitet ? 'bearbeitet' : 'nicht bearbeitet'}${(b.kommentar || '').trim() ? ', kommentiert' : ''}; geändert ${b.geaendert}.`, '');
  lines.push(whichInput(b.eingabe), '');
  if ((b.kommentar || '').trim()) lines.push('Kommentar:', '', ...b.kommentar.trim().split('\n').map(l => '> ' + l), '');
  if (!b.bearbeitet){ lines.push(''); continue; }

  const { model } = readModel(mod, b.eingabe);
  const nameOf = id => { const n = model.nodes.find(x => x.id === id); return n && n.name ? `${n.name} (${id})` : id; };
  const laneName = id => { const l = model.lanes.find(x => x.id === id); return l ? (l.name || l.id) : id; };
  // Die bearbeitete Fassung mit ihrem eigenen Modell: verschiebt Ben einen Knoten in eine andere Bahn, schreibt der
  // Modellierer ihn dort ein; mit dem Modell der Eingabe wäre das ein Bruch, der keiner ist.
  const edited = readModel(mod, b.bearbeitet).model;
  const vor = allBreaks(b.erzeugt, model), nach = allBreaks(b.bearbeitet, edited);
  lines.push(`Brüche: ${vor.length} → ${nach.length}` + (vor.filter(x => !nach.includes(x)).length ? `; behoben: ${vor.filter(x => !nach.includes(x)).join(', ')}` : '') + (nach.filter(x => !vor.includes(x)).length ? `; neu: ${nach.filter(x => !vor.includes(x)).join(', ')}` : ''), '');
  const c = closeness(b.erzeugt, b.bearbeitet, model);
  lines.push(`Nähe der erzeugten zur bearbeiteten Fassung: Bahn ${pct(c.lane)}, Gateway-Bahn ${pct(c.gwLane)}, Zeilen ${pct(c.rows)}, Spalten ${pct(c.cols)}, Rückflüsse im Kanal ${pct(c.channel)}, Umweg ${c.detour.toFixed(2)}×, Fläche ${c.ratio.toFixed(2)}×`, '');

  // Was sich geändert hat, mit dem gemeinsamen Modul (Story 2.40), das auch die Werkbank auf ihrer Leinwand markiert.
  const ae = aenderungen(b.erzeugt, b.bearbeitet, model);
  const laneMoves = ae.lanes;
  if (laneMoves.length) lines.push('Andere Bahn:', '', ...laneMoves.map(m => `- ${nameOf(m.id)}: ${laneName(m.von)} → ${laneName(m.nach)}`), '');
  // Paare mit anderer Beziehung (links–rechts über alle, oben–unten in derselben Bahn); jedes Paar zählt für
  // den Knoten, der sich in dieser Richtung mehr bewegt hat. Aufgeführt je Knoten, mit Verschiebung und Zahl der Paare.
  const cap = (list, n) => list.length > n ? [...list.slice(0, n), `- … und ${list.length - n} weitere`] : list;
  const listOf = axis => ae[axis].map(({ id, d, mit: others }) =>
    `- ${nameOf(id)}: ${axis === 'x' ? 'waagerecht' : 'senkrecht'} ${d > 0 ? '+' : ''}${d} px, andere Lage zu ${others.length} ${others.length === 1 ? 'Knoten' : 'Knoten'} (${others.slice(0, 4).map(nameOf).join(', ')}${others.length > 4 ? ', …' : ''})`);
  const cols = listOf('x'), rows = listOf('y');
  if (cols.length) lines.push('Andere Reihenfolge links–rechts:', '', ...cap(cols, 12), '');
  if (rows.length) lines.push('Andere Zeile in derselben Bahn:', '', ...cap(rows, 12), '');
  const flows = ae.flows;
  if (flows.length) lines.push(`Anderer Verlauf (${flows.length} Flüsse):`, '', ...cap(flows.map(f => `- ${f.id} (${nameOf(f.from)} → ${nameOf(f.to)}): Knicke ${f.vor} → ${f.nach}`), 20), '');
  if (!laneMoves.length && !cols.length && !rows.length && !flows.length) lines.push('Keine Änderung an Bahnen, Reihenfolge oder Flüssen gefunden (nur Verschiebungen innerhalb der Toleranz oder Beschriftungen).', '');
}
fs.writeFileSync(path.join(out, 'uebersicht.md'), lines.join('\n') + '\n');
console.log(path.relative(REPO, path.join(out, 'uebersicht.md')), pkg.beispiele.length, 'Beispiele');
