// Wertet ein Paket des Layout-Feedbacks aus (feedback-bauen.mjs; aus Spike 2.26 im Store übernommen, 2026-10-07,
// auf LMM umgestellt): legt je Beispiel Eingabe, erzeugte und bearbeitete Fassung und den Kommentar ab und schreibt
// eine Übersicht, was Ben geändert hat, gemessen an der erzeugten Fassung: Brüche vorher und nachher, Nähe (wie
// closeness() für die Referenzen), Knoten mit anderer Bahn, Paare mit anderer Reihenfolge links–rechts oder
// oben–unten in einer Bahn, Flüsse mit anderem Verlauf und ihre Knicke.
//   node tools/bpmn-layout/feedback-auswerten.mjs <paket.json> [--out <ordner>]
// Ohne --out: arbeit/feedback/<satz>-<datum des Exports>/; feedback-bauen.mjs erkennt daran, zu welchem Satz Feedback
// kam.
import fs from 'node:fs';
import path from 'node:path';
import { REPO, ARBEIT, loadStand, readModel, rules, allBreaks as breaksAll, compact, readDi, closeness, pct, args } from './lib.mjs';

const a = args(process.argv.slice(2));
if (!a._[0]) throw new Error('Aufruf: node tools/bpmn-layout/feedback-auswerten.mjs <paket.json> [--out <ordner>]');
const pkg = JSON.parse(fs.readFileSync(a._[0], 'utf8'));
if (pkg.format !== 'dokufix-layout-feedback') throw new Error('Kein Paket des Layout-Feedbacks.');
// Gelesen wird mit dem Stand im Arbeitsbaum.
const mod = await loadStand();
const breaksOf = await rules();
const out = a.out || path.join(ARBEIT, 'feedback', pkg.satz.id + '-' + String(pkg.exportiert).slice(0, 10));
fs.mkdirSync(out, { recursive: true });

const allBreaks = (xml, model) => breaksAll(breaksOf, compact(xml), model).breaks;
const bends = pts => Math.max(0, (pts || []).length - 2);

const lines = [`# Layout-Feedback ${pkg.satz.id}`, '', `Variante ${pkg.satz.variant}, exportiert ${pkg.exportiert}, ${pkg.beispiele.length} Beispiele.`, ''];
for (const b of pkg.beispiele){
  const dir = path.join(out, b.name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'eingabe.bpmn'), b.eingabe);
  fs.writeFileSync(path.join(dir, 'erzeugt.bpmn'), b.erzeugt);
  if (b.bearbeitet) fs.writeFileSync(path.join(dir, 'bearbeitet.bpmn'), b.bearbeitet);
  if ((b.kommentar || '').trim()) fs.writeFileSync(path.join(dir, 'kommentar.md'), b.kommentar.trim() + '\n');

  lines.push(`## ${b.name}`, '', `${b.paket}; ${b.bearbeitet ? 'bearbeitet' : 'nicht bearbeitet'}${(b.kommentar || '').trim() ? ', kommentiert' : ''}; geändert ${b.geaendert}.`, '');
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

  const g = readDi(b.erzeugt), e = readDi(b.bearbeitet);
  const lanes = model.lanes.filter(l => !l.synthetic).map(l => l.id);
  const laneOf = (di, id) => { const s = di.shapes[id]; return (s && lanes.find(l => { const L = di.shapes[l]; return L && s.cy >= L.y && s.cy <= L.y + L.h; })) || null; };
  const ids = model.nodes.map(n => n.id).filter(id => g.shapes[id] && e.shapes[id]);
  const laneMoves = ids.filter(id => laneOf(g, id) !== laneOf(e, id));
  if (laneMoves.length) lines.push('Andere Bahn:', '', ...laneMoves.map(id => `- ${nameOf(id)}: ${laneName(laneOf(g, id))} → ${laneName(laneOf(e, id))}`), '');
  // Paare mit anderer Beziehung (links–rechts über alle, oben–unten in derselben Bahn); jedes Paar zählt für
  // den Knoten, der sich in dieser Richtung mehr bewegt hat. Aufgeführt je Knoten, mit Verschiebung und Zahl der Paare.
  const rel = (u, v, tol) => Math.abs(u - v) < tol ? 0 : Math.sign(u - v);
  const moved = { x: new Map(), y: new Map() };
  const blame = (axis, p, q) => {
    const d = id => Math.abs(e.shapes[id]['c' + axis] - g.shapes[id]['c' + axis]);
    const who = d(p) >= d(q) ? p : q, other = who === p ? q : p;
    (moved[axis].get(who) || moved[axis].set(who, []).get(who)).push(other);
  };
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++){
    const p = ids[i], q = ids[j];
    if (rel(g.shapes[p].cx, g.shapes[q].cx, 30) !== rel(e.shapes[p].cx, e.shapes[q].cx, 30)) blame('x', p, q);
    if (laneOf(e, p) && laneOf(e, p) === laneOf(e, q) && rel(g.shapes[p].cy, g.shapes[q].cy, 20) !== rel(e.shapes[p].cy, e.shapes[q].cy, 20)) blame('y', p, q);
  }
  const cap = (list, n) => list.length > n ? [...list.slice(0, n), `- … und ${list.length - n} weitere`] : list;
  const listOf = axis => [...moved[axis]].sort((u, v) => v[1].length - u[1].length).map(([id, others]) => {
    const d = Math.round(e.shapes[id]['c' + axis] - g.shapes[id]['c' + axis]);
    return `- ${nameOf(id)}: ${axis === 'x' ? 'waagerecht' : 'senkrecht'} ${d > 0 ? '+' : ''}${d} px, andere Lage zu ${others.length} ${others.length === 1 ? 'Knoten' : 'Knoten'} (${others.slice(0, 4).map(nameOf).join(', ')}${others.length > 4 ? ', …' : ''})`;
  });
  const cols = listOf('x'), rows = listOf('y');
  if (cols.length) lines.push('Andere Reihenfolge links–rechts:', '', ...cap(cols, 12), '');
  if (rows.length) lines.push('Andere Zeile in derselben Bahn:', '', ...cap(rows, 12), '');
  const flows = model.flows.filter(f => g.flows[f.id] && e.flows[f.id] && JSON.stringify(g.flows[f.id]) !== JSON.stringify(e.flows[f.id]));
  if (flows.length) lines.push(`Anderer Verlauf (${flows.length} Flüsse):`, '', ...cap(flows.map(f => `- ${f.id} (${nameOf(f.from)} → ${nameOf(f.to)}): Knicke ${bends(g.flows[f.id])} → ${bends(e.flows[f.id])}`), 20), '');
  if (!laneMoves.length && !cols.length && !rows.length && !flows.length) lines.push('Keine Änderung an Bahnen, Reihenfolge oder Flüssen gefunden (nur Verschiebungen innerhalb der Toleranz oder Beschriftungen).', '');
}
fs.writeFileSync(path.join(out, 'uebersicht.md'), lines.join('\n') + '\n');
console.log(path.relative(REPO, path.join(out, 'uebersicht.md')), pkg.beispiele.length, 'Beispiele');
