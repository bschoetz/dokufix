// Das Zählmodell der Ordnungsphase (docs/konzept-ordnungsphase.md, Schritte 1 und 2): Kreuzungen, gezählt an Spalten
// statt an gezeichneten Wegen, so wie ein Ebenen-Layout sie zählt. Hier auf dem fertigen Bild des heutigen Layouts, um
// zu prüfen, ob die Zählung die gezeichneten Kreuzungen trifft (Teile b und b2 des ersten Schritts, BERICHT.md).
//
//   zaehlen(xml, model, regel) → { kreuzungen, kanten, gleicheSpalte, spalten }
//
// Aus dem Diagrammteil:
//   - Spalten: die x-Mitten der Flussknoten, auf 1 px zusammengefasst; das Raster zentriert die Knoten einer Spalte
//     auf eine x-Mitte. Ein angeheftetes Ereignis sitzt am Rand seines Hosts und bekommt die nächste Spalte. Ein Band
//     je Spalte, so breit wie ihr breitester Knoten.
//   - Lage: die y-Mitte, über alle Bahnen und Pools (sie liegen untereinander).
//
// Ein Sequenzfluss von Spalte a nach Spalte b (ein Rückfluss gilt umgekehrt, von links nach rechts gelesen) hat je
// Spalte k von a bis b eine Lage beim Eintritt ins Band und eine beim Austritt, yEin(k) und yAus(k): dazwischen läuft er
// in der Spalte senkrecht (ein Port oben oder unten, oder ein Knick in der Spalte), zwischen zwei Spalten von yAus(k)
// nach yEin(k+1). An der Quelle ist yEin ihre Mitte, am Ziel yAus seine. Gezählt wird:
//   - zwischen zwei benachbarten Spalten: zwei Stücke kreuzen sich, wenn ihre Reihenfolge links und rechts verschieden
//     ist (gleiche y ist keine Kreuzung, auch kein gemeinsamer Endpunkt);
//   - in einer Spalte: ein senkrechtes Stück kreuzt jeden Fluss, der die Spalte waagrecht durchquert (yEin = yAus,
//     weder Quelle noch Ziel dort), strikt zwischen seinen Enden. Ein Fluss mit beiden Enden in einer Spalte ist nur
//     ein senkrechtes Stück (gleicheSpalte).
//
// Die Regel gibt yEin und yAus:
//   router   wie der gezeichnete Weg die Ränder der Bänder kreuzt: die obere Schranke, wie gut eine Zählung an Spalten
//            sein kann; keine Vorhersage
//   quelle   in der Zeile der Quelle bis zum Ziel, dort senkrecht hinein
//   ziel     an der Quelle senkrecht in die Zeile des Ziels, dann waagrecht
//   bpmn     die Formen, die der Router in BPMN meist wählt (b2), abgelesen an den 1018 Flüssen über mehrere Spalten der 84 eigenen Eingaben
//            (BERICHT.md): vorwärts aus einem Split (Gateway mit mehreren Ausgängen) oder einem angehefteten Ereignis
//            senkrecht in die Zeile des Ziels, dann waagrecht; sonst in der Zeile der Quelle und am Ziel senkrecht
//            hinein (ein L; ein Z über eine Lücke wählt der Router fast nie). Ein Rückfluss aus derselben Zeile in der
//            Rinne oben, aus einer Zeile weiter oben in der Zeile der Quelle, aus einer weiter unten in der Rinne unten;
//            an den Enden senkrecht. Die Rinne liegt über (unter) allen Knoten seiner Bahn in den Spalten, die er
//            überspannt: der Router nimmt den äußeren Kanal, der keine senkrechten Stücke dazwischen kreuzt
//   mini     ein Router auf Spaltenebene (b2): je Fluss vier Kandidaten (Zeile der Quelle, Zeile des Ziels, Rinne oben,
//            Rinne unten), genommen der billigste: ein Knoten, durch den das Stück liefe, kostet 1000, eine Kreuzung mit
//            einem schon gelegten Fluss 1, die Vorlieben von bpmn entscheiden Gleichstände. Gelegt wie im Router:
//            vorwärts die kurzen zuerst, die Rückflüsse zuletzt. Keine Spuren, keine Ports an der Seite, kein zweiter
//            Durchgang

const attr = (tag, name) => { const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; };

// Formen (Mitte, Maße) und Wegpunkte aus dem Diagrammteil.
export function diagramm(xml){
  const formen = new Map(), wege = new Map();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?BPMNShape\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?BPMNShape>/g)){
    const b = /<(?:[\w-]+:)?Bounds\b([^>]*)\/?>/.exec(m[2]);
    if (!b) continue;
    const x = +attr(b[1], 'x'), y = +attr(b[1], 'y'), w = +attr(b[1], 'width'), h = +attr(b[1], 'height');
    formen.set(attr(m[1], 'bpmnElement'), { cx: x + w / 2, cy: y + h / 2, w, h, top: y, bottom: y + h });
  }
  for (const m of xml.matchAll(/<(?:[\w-]+:)?BPMNEdge\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?BPMNEdge>/g))
    wege.set(attr(m[1], 'bpmnElement'), [...m[2].matchAll(/<(?:[\w-]+:)?waypoint\b([^>]*)\/?>/g)].map(w => [+attr(w[1], 'x'), +attr(w[1], 'y')]));
  return { formen, wege };
}

// Die y, auf der ein Weg die senkrechte Linie x kreuzt: das erste waagrechte oder schräge Stück, das x überdeckt; ein
// senkrechtes Stück genau auf x zählt mit seiner Mitte. null, wo der Weg x nicht erreicht.
function yBei(punkte, x){
  for (let i = 1; i < punkte.length; i++){
    const [x1, y1] = punkte[i - 1], [x2, y2] = punkte[i];
    if (x1 === x2){ if (Math.abs(x1 - x) < 0.5) return (y1 + y2) / 2; continue; }
    if (Math.min(x1, x2) <= x && x <= Math.max(x1, x2)) return y1 + (y2 - y1) * (x - x1) / (x2 - x1);
  }
  return null;
}

export const REGELN = ['router', 'quelle', 'ziel', 'bpmn', 'mini'];

// Wie oft sich zwei Flüsse kreuzen, an ihren Lagen { sa, sb, yE, yA }: in jeder gemeinsamen Lücke, wenn ihre
// Reihenfolge links und rechts verschieden ist; in jeder gemeinsamen Spalte, wenn der eine dort senkrecht läuft und der
// andere sie waagrecht durchquert (weder Quelle noch Ziel dort), strikt zwischen den Enden des senkrechten Stücks.
function kreuzt(a, b){
  let n = 0;
  for (let k = Math.max(a.sa, b.sa); k < Math.min(a.sb, b.sb); k++)
    if ((a.yA.get(k) - b.yA.get(k)) * (a.yE.get(k + 1) - b.yE.get(k + 1)) < 0) n++;
  const senkrechtDurch = (s, d) => {
    let m = 0;
    for (let k = Math.max(s.sa, d.sa + 1); k <= Math.min(s.sb, d.sb - 1); k++){
      const e = s.yE.get(k), o = s.yA.get(k), y = d.yE.get(k);
      if (Math.abs(e - o) >= 1 && Math.abs(y - d.yA.get(k)) < 1 && y > Math.min(e, o) && y < Math.max(e, o)) m++;
    }
    return m;
  };
  return n + senkrechtDurch(a, b) + senkrechtDurch(b, a);
}

// paare, wenn gegeben: je gezählte Kreuzung [fluss, fluss, wo], zum Nachsehen.
export function zaehlen(xml, model, regel, paare = null){
  const { formen, wege } = diagramm(xml);
  const xs = [], halb = [];
  for (const n of model.nodes){
    const f = formen.get(n.id);
    if (!f) continue;
    const k = xs.findIndex(x => Math.abs(x - f.cx) < 1);
    if (k === -1){ xs.push(f.cx); halb.push(f.w / 2); } else halb[k] = Math.max(halb[k], f.w / 2);
  }
  const ordnung = xs.map((x, k) => k).sort((a, b) => xs[a] - xs[b]);
  const X = ordnung.map(k => xs[k]), H = ordnung.map(k => halb[k]);
  const spalteVon = cx => { let best = 0; for (let k = 1; k < X.length; k++) if (Math.abs(X[k] - cx) < Math.abs(X[best] - cx)) best = k; return best; };
  const aus = new Map(), ein = new Map();
  for (const f of model.flows){ aus.set(f.from, (aus.get(f.from) || 0) + 1); ein.set(f.to, (ein.get(f.to) || 0) + 1); }
  const typ = new Map(model.nodes.map(n => [n.id, n.type]));
  const split = id => typ.get(id) === 'gateway' && (aus.get(id) || 0) > 1;
  const angeheftet = new Set((model.boundaries || []).map(b => b.id));
  // Die Bahnen (ihre Formen im Diagrammteil) und je Knoten seine Bahn und Spalte, für die Rinne.
  const bahnen = (model.lanes || []).map(l => formen.get(l.id)).filter(Boolean);
  const bahnVon = f => bahnen.findIndex(b => f.cy > b.top && f.cy < b.bottom);
  const knoten = model.nodes.map(n => formen.get(n.id)).filter(Boolean).map(f => ({ f, spalte: spalteVon(f.cx), bahn: bahnVon(f) }));

  // Je Fluss seine Lage: { id, sa, sb, yE, yA } mit sa ≤ sb, links nach rechts; ein Fluss in einer Spalte hat sa = sb.
  const lagen = [], offen = [];
  let kanten = 0, gleicheSpalte = 0;
  for (const f of model.flows){
    const a = formen.get(f.from), b = formen.get(f.to);
    if (!a || !b) continue;
    let sa = spalteVon(a.cx), sb = spalteVon(b.cx);
    if (sa === sb){ gleicheSpalte++; lagen.push({ id: f.id, sa, sb, yE: new Map([[sa, a.cy]]), yA: new Map([[sa, b.cy]]) }); continue; }
    kanten++;
    const rueck = sa > sb;
    const [L, R] = rueck ? [b, a] : [a, b];
    if (rueck) [sa, sb] = [sb, sa];
    if (regel === 'router'){
      const punkte = wege.get(f.id) || [], yE = new Map(), yA = new Map();
      const bei = (x, ersatz) => { const y = yBei(punkte, x); return y === null ? ersatz : y; };
      for (let k = sa; k <= sb; k++){
        const lin = L.cy + (R.cy - L.cy) * (k - sa) / (sb - sa);
        yE.set(k, k === sa ? L.cy : bei(X[k] - H[k], lin));
        yA.set(k, k === sb ? R.cy : bei(X[k] + H[k], lin));
      }
      lagen.push({ id: f.id, sa, sb, yE, yA });
      continue;
    }
    const bahn = bahnVon(L), dort = knoten.filter(n => n.bahn === bahn && n.spalte >= sa && n.spalte <= sb).map(n => n.f);
    const oben = Math.min(L.top, R.top, ...dort.map(n => n.top)) - 10, unten = Math.max(L.bottom, R.bottom, ...dort.map(n => n.bottom)) + 10;
    const gleich = Math.abs(L.cy - R.cy) < 1;
    // Die Vorlieben aus den gezeichneten Formen (BERICHT.md), als kleine Kosten je Kandidat: [y, Vorliebe].
    let kandidaten;
    if (!rueck) kandidaten = gleich ? [[L.cy, 0]] : split(f.from) || angeheftet.has(f.from) ? [[R.cy, 0], [L.cy, 0.01]] : [[L.cy, 0], [R.cy, 0.01]];
    else if (gleich) kandidaten = [[oben, 0], [unten, 0.01], [L.cy, 0.05]];
    else if (R.cy < L.cy) kandidaten = [[R.cy, 0], [L.cy, 0.03]];
    else kandidaten = [[R.cy, 0.01], [L.cy, 0.03]];
    if (!rueck || !gleich) kandidaten.push([oben, rueck && R.cy < L.cy ? 0.01 : rueck ? 0.02 : 0.05], [unten, rueck && R.cy > L.cy ? 0 : rueck ? 0.02 : 0.06]);
    offen.push({ id: f.id, sa, sb, L, R, rueck, kandidaten });
  }
  const lageMit = (o, y) => {
    const yE = new Map(), yA = new Map();
    for (let k = o.sa; k <= o.sb; k++){ yE.set(k, k === o.sa ? o.L.cy : y); yA.set(k, k === o.sb ? o.R.cy : y); }
    return { id: o.id, sa: o.sa, sb: o.sb, yE, yA };
  };
  if (regel === 'quelle' || regel === 'ziel' || regel === 'bpmn')
    for (const o of offen) lagen.push(lageMit(o, regel === 'quelle' ? (o.rueck ? o.R.cy : o.L.cy) : regel === 'ziel' ? (o.rueck ? o.L.cy : o.R.cy) : o.kandidaten[0][0]));
  else if (regel === 'mini'){
    // Ein Router auf Spaltenebene: je Fluss der Kandidat mit den geringsten Kosten, ein geschnittener Knoten 1000, eine
    // Kreuzung mit einem schon gelegten Fluss 1, dazu die Vorliebe; vorwärts die kurzen zuerst, Rückflüsse zuletzt.
    const nachSpalte = X.map(() => []);
    for (const n of knoten) nachSpalte[n.spalte].push(n.f);
    const schneidet = (k, y1, y2, ausser) => nachSpalte[k].filter(n => n !== ausser && n.bottom > Math.min(y1, y2) + 1 && n.top < Math.max(y1, y2) - 1).length;
    offen.sort((a, b) => (a.rueck - b.rueck) || ((a.sb - a.sa) - (b.sb - b.sa)));
    for (const o of offen){
      let best = null;
      for (const [y, vorliebe] of o.kandidaten){
        const lage = lageMit(o, y);
        let kosten = vorliebe;
        for (let k = o.sa + 1; k < o.sb; k++) kosten += 1000 * nachSpalte[k].filter(n => n.top - 1 < y && y < n.bottom + 1).length;
        kosten += 1000 * (schneidet(o.sa, o.L.cy, y, o.L) + schneidet(o.sb, o.R.cy, y, o.R));
        for (const andere of lagen) kosten += kreuzt(lage, andere);
        if (!best || kosten < best.kosten) best = { kosten, lage };
      }
      lagen.push(best.lage);
    }
  }
  let kreuzungen = 0;
  for (let i = 0; i < lagen.length; i++) for (let j = i + 1; j < lagen.length; j++){
    const n = kreuzt(lagen[i], lagen[j]);
    if (n){ kreuzungen += n; if (paare) paare.push([lagen[i].id, lagen[j].id, n]); }
  }
  return { kreuzungen, kanten, gleicheSpalte, spalten: X.length };
}
