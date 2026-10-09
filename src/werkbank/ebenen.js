// Die Fassungen eines Falls als Ebenen einer Leinwand (Story 2.40): je Fassung ein Viewer, alle übereinander im
// selben Element, sichtbar nur die gewählte. Umschalten ändert nur die Sichtbarkeit, kein Import, kein Flackern.
//
// Ein gemeinsamer Ursprung: jede Fassung hat ihre linke obere Ecke (ursprung(), über Formen und Wegpunkte ihres
// Diagrammteils), und die Ansicht gilt relativ zu ihr ({ x, y, width, height } ab dem Ursprung). Eine Fassung, die als
// Ganzes 150 px weiter rechts liegt, springt beim Umschalten nicht; springen tut nur, was sich bewegt hat. Eingepasst
// wird einmal je Fall, auf die gemeinsame Ausdehnung aller Fassungen (ausdehnung(), einpassen()); Zoom und Verschieben
// bleiben danach beim Umschalten stehen, auch wenn eine Fassung später dazukommt.
//
// Markieren: je Ebene eine Menge von Ids, die die Ebene mit der Klasse werkbank-geaendert zeigt (die Ids rechnet
// main.js mit src/bpmn-tools/aenderungen.js aus, wie feedback-auswerten.mjs).
//
// Die Rechnungen sind rein und in Node geprüft (tests/werkbank.test.mjs); leinwand() braucht den Viewer der Seite.
import { readDi, aenderungen, geaenderteIds } from '../bpmn-tools/aenderungen.js';

// Die linke obere Ecke und die Größe des Diagrammteils: { x, y, w, h }; ohne Diagrammteil null.
export function ursprung(xml){
  const di = typeof xml === 'string' ? readDi(xml) : xml;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const nimm = (x, y) => { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; };
  for (const s of Object.values(di.shapes)) if (Number.isFinite(s.x + s.y + s.w + s.h)){ nimm(s.x, s.y); nimm(s.x + s.w, s.y + s.h); }
  for (const pts of Object.values(di.flows)) for (const [x, y] of pts) if (Number.isFinite(x + y)) nimm(x, y);
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
// Die gemeinsame Ausdehnung, jede Fassung an ihren Ursprung gelegt: { w, h }.
export const ausdehnung = boxen => boxen.filter(Boolean).reduce((a, b) => ({ w: Math.max(a.w, b.w), h: Math.max(a.h, b.h) }), { w: 0, h: 0 });
// Die relative Ansicht, die die Ausdehnung in ein Feld von cw × ch Pixeln einpasst, mit Rand, höchstens 100 %, mittig
// (wie zoom('fit-viewport', 'auto') von bpmn-js).
export function einpassen(aus, cw, ch, rand = 24){
  const w = aus.w + 2 * rand, h = aus.h + 2 * rand;
  const scale = Math.min(1, cw / w, ch / h);
  const width = cw / scale, height = ch / scale;
  return { x: (aus.w - width) / 2, y: (aus.h - height) / 2, width, height };
}
// Von der Ansicht eines Viewers zur relativen und zurück.
export const relativ = (vb, u) => ({ x: vb.x - u.x, y: vb.y - u.y, width: vb.width, height: vb.height });
export const absolut = (rel, u) => ({ x: rel.x + u.x, y: rel.y + u.y, width: rel.width, height: rel.height });

// Was je Ebene anders liegt, als Map key → Set der Ids: jede Ebene gegen die erzeugte, die erzeugte gegen den letzten
// anderen Stand (key 'stand'); eine Ebene ohne Bild oder ohne Gegenstück hat keinen Eintrag. arten: [{ key, xml }],
// model: readProcess() der Eingabe.
export function markenFuer(arten, model){
  const out = new Map();
  if (!model) return out;
  const xmlVon = k => (arten.find(a => a.key === k) || {}).xml;
  for (const a of arten){
    const gegen = a.key === 'erzeugt' ? xmlVon('stand') : xmlVon('erzeugt');
    if (!a.xml || !gegen) continue;
    try { out.set(a.key, geaenderteIds(aenderungen(gegen, a.xml, model))); } catch {}
  }
  return out;
}

// Die Ebene zur Taste 1 bis 9: die an dieser Stelle der Reiter; wo der Fall weniger hat, keine (null).
export const ebeneFuerTaste = (arten, taste) => /^[1-9]$/.test(taste) && arten[Number(taste) - 1] ? arten[Number(taste) - 1].key : null;

// Die Leinwand im Element host. Viewer: der Konstruktor der Seite (window.BpmnJS), config seine Einstellungen,
// nachImport(viewer): was nach dem Import geschieht (decorate()).
export function leinwand(host, { Viewer, config, nachImport = () => {} }){
  let ebenen = [];        // { key, xml, el, viewer, u, fehler, bereit }
  let sichtbar = null, rel = null, fall = null, markiert = new Map(), markieren = false, zug = 0;
  const groesse = () => ({ cw: host.clientWidth || 800, ch: host.clientHeight || 500 });

  function ansichtSetzen(e){
    if (!e || !e.bereit || !e.u || !rel) return;
    e.setzt = true;
    e.viewer.get('canvas').viewbox(absolut(rel, e.u));
    e.setzt = false;
  }
  function markerSetzen(e){
    if (!e.bereit) return;
    const canvas = e.viewer.get('canvas'), reg = e.viewer.get('elementRegistry');
    for (const id of e.marken || []) if (reg.get(id)) canvas.removeMarker(id, 'werkbank-geaendert');
    e.marken = markieren ? [...(markiert.get(e.key) || [])].filter(id => reg.get(id)) : [];
    for (const id of e.marken) canvas.addMarker(id, 'werkbank-geaendert');
  }
  function zeigen(key){
    // Die Ansicht der sichtbaren Ebene jetzt lesen: bpmn-js meldet canvas.viewbox.changed erst 300 ms nach dem letzten
    // Zoomen oder Verschieben, ein schnelles Umschalten käme sonst mit der alten Ansicht.
    const da = ebenen.find(e => e.key === sichtbar && e.bereit && e.u);
    if (da && rel && key !== sichtbar) rel = relativ(da.viewer.get('canvas').viewbox(), da.u);
    sichtbar = key;
    for (const e of ebenen){
      if (!e.el) continue;
      e.el.style.visibility = e.key === key ? 'visible' : 'hidden';
      if (e.key === key) ansichtSetzen(e);
    }
  }
  function einpassenJetzt(){
    const { cw, ch } = groesse();
    rel = einpassen(ausdehnung(ebenen.map(e => e.u)), cw, ch);
    for (const e of ebenen) ansichtSetzen(e);
  }
  async function laden(e){
    e.el = document.createElement('div');
    e.el.className = 'ebene';
    e.el.style.visibility = 'hidden';
    host.appendChild(e.el);
    e.viewer = new Viewer({ container: e.el, ...config });
    try {
      await e.viewer.importXML(e.xml);
      nachImport(e.viewer);
      e.bereit = true;
      e.viewer.on('canvas.viewbox.changed', ({ viewbox }) => {
        // Nur die sichtbare Ebene führt; die anderen folgen beim Umschalten.
        if (e.setzt || e.key !== sichtbar || !e.u) return;
        rel = relativ(viewbox, e.u);
      });
    } catch (err){
      e.fehler = (err && err.message) || String(err);
    }
  }
  function weg(e){
    try { e.viewer && e.viewer.destroy(); } catch {}
    e.el && e.el.remove();
  }

  return {
    // Die Ebenen eines Falls: [{ key, xml }]; xml null für eine Ebene ohne Bild (wartet, Fehler). Derselbe Fall:
    // nur geänderte Ebenen neu, die Ansicht bleibt; ein anderer: alles neu, eingepasst. Gibt { key: fehler } zurück.
    async setzen(neuerFall, liste){
      const my = ++zug;
      if (neuerFall !== fall){ for (const e of ebenen) weg(e); ebenen = []; rel = null; fall = neuerFall; }
      // Die neue Liste gilt sofort, damit ein zweiter Aufruf während des Imports auf ihr aufsetzt; jede Ebene lädt einmal.
      const next = liste.map(({ key, xml }) => ebenen.find(e => e.key === key && e.xml === xml) || { key, xml, u: xml ? ursprung(xml) : null, bereit: false });
      for (const e of ebenen) if (!next.includes(e)) weg(e);
      ebenen = next;
      for (const e of next) if (!e.geladen) e.geladen = e.xml ? laden(e) : Promise.resolve();
      await Promise.all(next.map(e => e.geladen));
      if (my !== zug) return null;
      if (!rel && ebenen.some(e => e.bereit && e.u)) einpassenJetzt();
      for (const e of ebenen) markerSetzen(e);
      zeigen(ebenen.some(e => e.key === sichtbar) ? sichtbar : ebenen.length ? ebenen[0].key : null);
      return Object.fromEntries(ebenen.filter(e => e.fehler).map(e => [e.key, e.fehler]));
    },
    zeigen,
    einpassen: einpassenJetzt,
    // Die Marken: Map key → Set der Ids; an: ob sie gezeigt werden.
    marken(map, an){ markiert = map; markieren = an; for (const e of ebenen) markerSetzen(e); },
    get sichtbar(){ return sichtbar; },
    // Für die Prüfung von Hand: die Ansicht relativ zum Ursprung, gemeinsam und je geladener Ebene.
    get ansicht(){ return rel; },
    ansichten(){ return ebenen.filter(e => e.bereit && e.u).map(e => ({ key: e.key, sichtbar: e.key === sichtbar, rel: relativ(e.viewer.get('canvas').viewbox(), e.u) })); },
    leeren(){ zug++; for (const e of ebenen) weg(e); ebenen = []; rel = null; fall = null; sichtbar = null; },
  };
}
