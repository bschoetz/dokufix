// Das Zählmodell der Ordnungsphase (docs/konzept-ordnungsphase.md, Schritte 1 und 2): Kreuzungen zwischen benachbarten
// Spalten, gezählt an Knoten und Hilfspunkten, so wie ein Ebenen-Layout sie zählt. Hier auf dem fertigen Bild des
// heutigen Layouts, um zu prüfen, ob die Zählung die gezeichneten Kreuzungen trifft (Teil b des ersten Schritts).
//
//   zaehlen(xml, model, regel) → { kreuzungen, kanten, gleicheSpalte, spalten }
//
// Aus dem Diagrammteil:
//   - Spalten: die x-Mitten der Flussknoten, auf 1 px zusammengefasst; das Raster zentriert die Knoten einer Spalte
//     auf eine x-Mitte. Ein angeheftetes Ereignis sitzt am Rand seines Hosts und bekommt die nächste Spalte.
//   - Lage in einer Spalte: die y-Mitte, über alle Bahnen und Pools (sie liegen untereinander).
// Ein Sequenzfluss von Spalte a nach Spalte b (a ≠ b; ein Rückfluss gilt umgekehrt) bekommt je Spalte dazwischen einen
// Hilfspunkt. Seine Lage dort gibt die Regel:
//   router  die y, auf der der gezeichnete Fluss die x der Spalte kreuzt: die obere Schranke, wie gut eine Zählung
//           zwischen benachbarten Spalten sein kann (der Fehler ist dann nur das Zählen selbst, nicht die Lage)
//   quelle  die y der Quelle: der Fluss läuft in ihrer Zeile und wendet am Ziel
//   ziel    die y des Ziels: der Fluss wendet an der Quelle
//   linear  zwischen beiden, gleichmäßig über die Spalten
// Mit „+spalte“ (etwa router+spalte) zählt ein Fluss innerhalb einer Spalte als senkrechtes Stück auf ihrer x: Er kreuzt
// jeden Fluss, der die Spalte mit einem Hilfspunkt strikt zwischen seinen beiden Enden durchquert.
// Zwei Stücke zwischen denselben benachbarten Spalten kreuzen sich, wenn ihre Reihenfolge links und rechts verschieden
// ist; ein gemeinsamer Endpunkt (gleiche y) ist keine Kreuzung. Ein Fluss innerhalb einer Spalte hat kein Stück
// zwischen Spalten; er wird gezählt (gleicheSpalte), aber nicht gekreuzt.

const attr = (tag, name) => { const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; };

// Formen (Mitte) und Wegpunkte aus dem Diagrammteil.
export function diagramm(xml){
  const formen = new Map(), wege = new Map();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?BPMNShape\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?BPMNShape>/g)){
    const b = /<(?:[\w-]+:)?Bounds\b([^>]*)\/?>/.exec(m[2]);
    if (!b) continue;
    const x = +attr(b[1], 'x'), y = +attr(b[1], 'y'), w = +attr(b[1], 'width'), h = +attr(b[1], 'height');
    formen.set(attr(m[1], 'bpmnElement'), { cx: x + w / 2, cy: y + h / 2 });
  }
  for (const m of xml.matchAll(/<(?:[\w-]+:)?BPMNEdge\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?BPMNEdge>/g))
    wege.set(attr(m[1], 'bpmnElement'), [...m[2].matchAll(/<(?:[\w-]+:)?waypoint\b([^>]*)\/?>/g)].map(w => [+attr(w[1], 'x'), +attr(w[1], 'y')]));
  return { formen, wege };
}

// Die y, auf der ein Weg die senkrechte Linie x kreuzt: das erste Stück, das x überdeckt; ein senkrechtes Stück genau
// auf x zählt mit seiner Mitte. null, wo der Weg x nicht erreicht.
function yBei(punkte, x){
  for (let i = 1; i < punkte.length; i++){
    const [x1, y1] = punkte[i - 1], [x2, y2] = punkte[i];
    if (x1 === x2){ if (Math.abs(x1 - x) < 0.5) return (y1 + y2) / 2; continue; }
    if (Math.min(x1, x2) <= x && x <= Math.max(x1, x2)) return y1 + (y2 - y1) * (x - x1) / (x2 - x1);
  }
  return null;
}

export const REGELN = ['router', 'quelle', 'ziel', 'linear', 'router+spalte', 'quelle+spalte'];

export function zaehlen(xml, model, regelName){
  const [regel, mitSpalte] = [regelName.replace('+spalte', ''), regelName.endsWith('+spalte')];
  const { formen, wege } = diagramm(xml);
  // Die Spalten aus den Flussknoten.
  const xs = [];
  for (const n of model.nodes){ const f = formen.get(n.id); if (f && !xs.some(x => Math.abs(x - f.cx) < 1)) xs.push(f.cx); }
  xs.sort((a, b) => a - b);
  const spalteVon = cx => { let best = 0; for (let k = 1; k < xs.length; k++) if (Math.abs(xs[k] - cx) < Math.abs(xs[best] - cx)) best = k; return best; };
  // Je Paar benachbarter Spalten (k, k+1) die Stücke als [y links, y rechts].
  const stuecke = xs.map(() => []), durch = xs.map(() => []), senkrecht = [];
  let kanten = 0, gleicheSpalte = 0;
  for (const f of model.flows){
    const a = formen.get(f.from), b = formen.get(f.to);
    if (!a || !b) continue;
    let [p, q] = [a, b];
    let sa = spalteVon(p.cx), sb = spalteVon(q.cx);
    if (sa === sb){ gleicheSpalte++; senkrecht.push([sa, Math.min(a.cy, b.cy), Math.max(a.cy, b.cy)]); continue; }
    if (sa > sb){ [p, q] = [q, p]; [sa, sb] = [sb, sa]; }
    kanten++;
    const punkte = wege.get(f.id) || [];
    const lage = k => {
      if (k === sa) return p.cy;
      if (k === sb) return q.cy;
      if (regel === 'router'){ const y = yBei(punkte, xs[k]); return y === null ? p.cy + (q.cy - p.cy) * (k - sa) / (sb - sa) : y; }
      if (regel === 'quelle') return p.cy;
      if (regel === 'ziel') return q.cy;
      return p.cy + (q.cy - p.cy) * (k - sa) / (sb - sa);
    };
    for (let k = sa; k < sb; k++) stuecke[k].push([lage(k), lage(k + 1)]);
    for (let k = sa + 1; k < sb; k++) durch[k].push(lage(k));
  }
  let kreuzungen = 0;
  for (const liste of stuecke) for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++)
    if ((liste[i][0] - liste[j][0]) * (liste[i][1] - liste[j][1]) < 0) kreuzungen++;
  if (mitSpalte) for (const [k, y1, y2] of senkrecht) for (const y of durch[k]) if (y > y1 && y < y2) kreuzungen++;
  return { kreuzungen, kanten, gleicheSpalte, spalten: xs.length };
}
