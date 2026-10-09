// Die Fälle der Layout-Werkbank (Story 2.39): reine Logik, in Node wie im Browser, ohne Speicher und ohne Seite.
//
//   ohneDi(xml)                       das XML ohne Diagrammteil (jedes BPMNDiagram)
//   hatDi(xml)                        ob das XML Positionen trägt (ein BPMNShape)
//   nameAus(xml)                      der Name, den die Eingabe sich gibt: Teilnehmer, Prozess, Definitionen
//   ohneBahnen(xml)                   der Fall ohne Bahnzugehörigkeit (jedes flowNodeRef weg): { hash, short } oder null
//   einordnen(xml, faelle, opts)      wohin eine Eingabe gehört: ein bekannter Fall, eine neue Revision, ein neuer Fall,
//                                     oder offen, wo sie zu einem Altfall gehören soll und keiner eindeutig passt
//   kandidaten(xml, faelle, k)        die Fälle, zu denen eine offene Eingabe gehören könnte, für die Wahl von Hand
//   zuordnen(xml, ziel, faelle, opts) eine Eingabe dem Fall ziel zuordnen, den Ben gewählt hat
//   geaendert(layouts, stand)         ob die Anordnung eines Falls am Stand anders ist als am letzten Stand davor
//   anzeigeName(fall)                 der Name in der Liste, mit der Revision ab der zweiten
//   paketBauen(opts)                  das Paket des Layout-Feedbacks im Format der alten Seite, mit Herkunft
//   postenVon(opts)                   die Posten des Feedbacks eines Falls mit Bens Marke, offen bis er markiert (2.41)
//   letzteBewertung(opts)             die letzte Bewertung eines Falls und ob sich das Bild seitdem geändert hat (2.41)
//   merkmale(model)                   die Merkmale des Diagramms, für den Filter Art (2.41)
//   warum(davor, hier, model)         warum eine Anordnung anders ist als am Stand davor, in Worten (2.41)
//   filtern(eintraege, filter)        die Fälle nach Suche, Status, Satz, Art und Bewertung (2.41)
//   zeichnungPruefen(xml)             ob eine Zeichnung aus dem Modellierer ein Fall werden kann (ab zwei Knoten): die
//                                     Meldung oder null
//
// Ein Fall ist sein Fingerabdruck (caseFingerprint(), src/app/fingerprint.js): eine Eingabe mit und ohne Positionen
// ist derselbe Fall. Positionen, die eine Eingabe mitbringt, werden Bens Fassung des Falls, außer sie sind seine
// Referenz (das Handlayout einer externen Eingabe). Derselbe Name mit anderem Fingerabdruck ist eine neue Revision
// dieses Namens: ein eigener Fall, mit `vorher` auf den Fall davor, so dass der Speicher allein nach dem
// Fingerabdruck geht.
//
// Eingefügt oder hochgeladen (Ben, 2026-10-09) mit einem Schalter: als neuer Fall (modus 'neu'), ohne Zuordnung; oder
// zu einem Altfall (modus 'zuordnen'): zuerst der Fingerabdruck, dann der ohne Bahnzugehörigkeit, denn das Layout und
// der Modellierer schreiben einen Knoten, den sie in eine andere Bahn setzen, dort in flowNodeRef. Passt genau ein
// Fall, gehört die Eingabe zu ihm; sonst bleibt sie offen, nichts wird angelegt, und Ben wählt den Fall von Hand
// (kandidaten(), zuordnen()). Ein Fall, den es mit demselben Fingerabdruck schon gibt, wird nie doppelt angelegt.
//
// Ein Fall: { fall, kurz, name, herkunft, eingabe, revision, vorher, angelegt, referenz? }; herkunft `eigen` oder der
// Name des Satzes, eingabe das XML ohne Positionen.
// Eine Anordnung: { fall, stand, xml, angeordnet, ms?, brueche? }, je Fall und Stand eine, eingefroren.
// Ein Feedback: { fall, stand, kommentar, bearbeitet, geaendert, soll? }, je Fall und Stand eines; bearbeitet ist
// Bens Fassung an diesem Stand, soll false, wo sie nur eine Reparatur ist (Ben, 2026-10-09).
import { caseFingerprint, shapeOf, similarity } from '../app/fingerprint.js';
import { readProcess } from '../app/bpmn-layout.js';
import { parseXml } from '../app/xml-parser.js';
import { aenderungen } from '../bpmn-tools/aenderungen.js';

// Ein Element mit Namensraum-Präfix oder ohne, mit seinen Attributen (auch mit ">" in Anführungszeichen).
const ATTRS = '(?:[^>"\'/]|"[^"]*"|\'[^\']*\'|\\/(?!>))*';
const DIAGRAM = new RegExp('<((?:[\\w.-]+:)?BPMNDiagram)\\b' + ATTRS + '(?:\\/>|>[\\s\\S]*?<\\/\\1\\s*>)\\s*', 'g');
const SHAPE = /<(?:[\w.-]+:)?BPMNShape\b/;
const LANE_REF = new RegExp('<((?:[\\w.-]+:)?flowNodeRef)\\b' + ATTRS + '(?:\\/>|>[\\s\\S]*?<\\/\\1\\s*>)\\s*', 'g');

export const ohneDi = xml => String(xml).replace(DIAGRAM, '');
export const hatDi = xml => SHAPE.test(String(xml));
export const ohneBahnen = xml => caseFingerprint(ohneDi(xml).replace(LANE_REF, ''));
// Der Abdruck ohne Bahnen eines Falls; ein Fall aus einem älteren Arbeitsstand hat ihn nicht gespeichert.
const losVon = f => f.los || (f.los = (ohneBahnen(f.eingabe) || {}).hash);

// Der Name einer Eingabe aus ihr selbst: der erste Teilnehmer, sonst der erste Prozess, sonst die Definitionen.
export function nameAus(xml){
  const s = String(xml);
  for (const tag of ['participant', 'process', 'definitions']){
    const m = new RegExp('<(?:[\\w.-]+:)?' + tag + '\\b' + ATTRS + '\\/?>').exec(s);
    const n = m && /\bname\s*=\s*("([^"]*)"|'([^']*)')/.exec(m[0]);
    const name = n && (n[2] ?? n[3]).trim();
    if (name) return name;
  }
  return null;
}

// Wohin xml gehört. faelle: die Fälle, die es gibt. opts: { name, herkunft, jetzt, modus }; modus 'neu' (ohne
// Zuordnung, die Voreinstellung für die eingebauten Eingaben) oder 'zuordnen' (zu einem Altfall).
//   { fehler }                                         kein BPMN
//   { art: 'bekannt', fall, fassung, ueber }           ein Fall, den es gibt; fassung Bens Fassung aus den Positionen
//                                                      oder null; ueber 'fall' oder 'bahnen' (ohne Bahnzugehörigkeit)
//   { art: 'revision' | 'neu', fall, fassung }         ein neuer Fall (revision: derselbe Name, anderer Fall)
//   { art: 'offen', kandidaten }                       zuordnen, aber kein Fall passt eindeutig: nichts angelegt
export function einordnen(xml, faelle, { name, herkunft = 'eigen', jetzt = new Date().toISOString(), modus = 'neu' } = {}){
  const text = String(xml ?? '');
  if (!text.trim()) return { fehler: 'Leere Eingabe.' };
  const fp = caseFingerprint(text);
  if (!fp) return { fehler: 'Kein BPMN: die Eingabe ist kein XML mit BPMN-Definitionen.' };
  const known = faelle.find(f => f.fall === fp.hash);
  if (known) return { art: 'bekannt', fall: known, fassung: fassungFuer(text, known), ueber: 'fall' };
  if (modus === 'zuordnen'){
    const los = (ohneBahnen(text) || {}).hash;
    const treffer = los ? faelle.filter(f => losVon(f) === los) : [];
    if (treffer.length === 1) return { art: 'bekannt', fall: treffer[0], fassung: fassungFuer(text, treffer[0]), ueber: 'bahnen' };
    return { art: 'offen', kandidaten: treffer.length ? treffer.map(f => ({ fall: f, warum: 'gleich ohne Bahnzugehörigkeit' })) : kandidaten(text, faelle, 5, name) };
  }
  return neuerFall(text, fp, faelle, { name, herkunft, jetzt });
}
// Positionen werden Bens Fassung, außer sie sind die Referenz des Falls.
const fassungFuer = (text, f) => hatDi(text) && !(f.referenz && f.referenz.trim() === text.trim()) ? text : null;
function neuerFall(text, fp, faelle, { name, herkunft, jetzt, vorher }){
  const nm = (name && String(name).trim()) || nameAus(text) || 'eigen-' + fp.short;
  // Der Fall davor: der gewählte, sonst die letzte Revision desselben Namens.
  const prev = vorher || faelle.filter(f => f.name === nm).sort((a, b) => b.revision - a.revision)[0];
  const fall = { fall: fp.hash, kurz: fp.short, name: prev ? prev.name : nm, herkunft, eingabe: ohneDi(text), revision: prev ? prev.revision + 1 : 1, vorher: prev ? prev.fall : null, angelegt: jetzt };
  fall.los = (ohneBahnen(text) || {}).hash;
  return { art: prev ? 'revision' : 'neu', fall, fassung: hatDi(text) ? text : null };
}

// Die Fälle, zu denen xml gehören könnte, für die Wahl von Hand: zuerst die gleichen Namens (name, sonst der Name der
// Eingabe), dann die nach der Form ähnlichsten; k nach der Form. [{ fall, warum }].
export function kandidaten(xml, faelle, k = 5, name){
  const nm = (name && String(name).trim()) || nameAus(xml);
  const gleich = faelle.filter(f => nm && f.name === nm).sort((a, b) => b.revision - a.revision);
  const form = shapeOf(ohneDi(xml));
  const nah = !form ? [] : faelle.filter(f => !gleich.includes(f))
    .map(f => ({ f, s: similarity(form, formVon(f)) }))
    .sort((a, b) => b.s - a.s || a.f.name.localeCompare(b.f.name)).slice(0, k);
  return [...gleich.map(f => ({ fall: f, warum: 'gleicher Name' })), ...nah.map(x => ({ fall: x.f, warum: Math.round(x.s * 100) + ' % nach der Form' }))];
}
const formen = new WeakMap();
const formVon = f => { if (!formen.has(f)) formen.set(f, shapeOf(f.eingabe)); return formen.get(f); };

// xml dem Fall ziel zuordnen, den Ben gewählt hat: derselbe Fall, wo der Fingerabdruck gleich ist; mit Positionen
// Bens Fassung von ziel; ohne Positionen und mit anderem Inhalt eine neue Revision von ziel. Ergebnis wie einordnen().
export function zuordnen(xml, ziel, faelle, { herkunft = 'eigen', jetzt = new Date().toISOString() } = {}){
  const text = String(xml ?? '');
  const fp = caseFingerprint(text);
  if (!fp) return { fehler: 'Kein BPMN: die Eingabe ist kein XML mit BPMN-Definitionen.' };
  const known = faelle.find(f => f.fall === fp.hash);
  if (known) return { art: 'bekannt', fall: known, fassung: fassungFuer(text, known), ueber: 'fall' };
  if (hatDi(text)) return { art: 'bekannt', fall: ziel, fassung: fassungFuer(text, ziel), ueber: 'hand' };
  // Die letzte Revision des gewählten Namens ist der Fall davor.
  const letzte = faelle.filter(f => f.name === ziel.name).sort((a, b) => b.revision - a.revision)[0] || ziel;
  return neuerFall(text, fp, faelle, { herkunft, jetzt, vorher: letzte });
}

// Ob die Anordnung am stand anders ist als die am letzten anderen Stand, der für den Fall gespeichert ist.
// layouts: die Anordnungen eines Falls. { art: 'neu' | 'gleich' | 'anders' | 'offen', gegen }: offen, solange
// am Stand nichts angeordnet ist; neu, wo es keinen anderen Stand gibt.
export function geaendert(layouts, stand){
  const hier = layouts.find(l => l.stand === stand);
  if (!hier) return { art: 'offen', gegen: null };
  const davor = layouts.filter(l => l.stand !== stand).sort((a, b) => String(b.angeordnet).localeCompare(String(a.angeordnet)))[0];
  if (!davor) return { art: 'neu', gegen: null };
  return { art: davor.xml === hier.xml ? 'gleich' : 'anders', gegen: davor.stand };
}

// ---------- Status, Bewertung, Filter (Story 2.41) ----------
// Die Posten des Feedbacks eines Falls: je Stand, an dem Ben kommentiert oder bearbeitet hat, einer ('feedback:' und
// der Stand), und je Kommentar oder Bearbeitung im Archiv einer ('archiv:' und die ID des Eintrags), die früheren
// Runden. Jeder ist offen, bis Ben ihn als erledigt oder verworfen markiert, und bleibt markiert, bis Ben es ändert
// (Eintrag 41, Ben 2026-10-08: offen bleibt offen, bis er es markiert; die Seite rät nicht). andereLogik: von einem
// anderen Stand als dem der Seite. Die jüngsten zuerst.
// feedbacks, archiv, marken: die des Falls aus dem Speicher; stand: der der Seite.
export function postenVon({ feedbacks = [], archiv = [], marken = [], stand }){
  const mark = new Map(marken.map(m => [m.id, m]));
  const out = [];
  for (const e of feedbacks) if ((e.kommentar || '').trim() || e.bearbeitet)
    out.push({ id: 'feedback:' + e.stand, stand: e.stand, geaendert: e.geaendert || null, kommentar: (e.kommentar || '').trim(), bearbeitet: !!e.bearbeitet, soll: e.soll ?? null, archiv: false });
  for (const x of archiv) if (x.art === 'kommentar' || x.art === 'bearbeitung')
    out.push({ id: 'archiv:' + x.id, stand: x.stand || x.satz || null, satz: x.satz || null, geaendert: x.geaendert || null, kommentar: (x.kommentar || '').trim(), bearbeitet: x.art === 'bearbeitung', soll: false, archiv: true });
  for (const p of out){
    const m = mark.get(p.id);
    p.status = m ? m.status : 'offen';
    p.andereLogik = p.stand !== stand;
  }
  return out.sort((a, b) => String(b.geaendert || '').localeCompare(String(a.geaendert || '')));
}

// Die letzte Bewertung eines Falls (1 bis 10, am Feedback eines Stands, bewertet: wann): { wert, stand,
// bildGeaendert } oder null. bildGeaendert: ob die Anordnung am Stand der Seite eine andere ist als am bewerteten;
// null, wo eine der beiden fehlt.
export function letzteBewertung({ feedbacks = [], layouts = [], stand }){
  const r = feedbacks.filter(e => Number.isInteger(e.bewertung)).sort((a, b) => String(b.bewertet || '').localeCompare(String(a.bewertet || '')))[0];
  if (!r) return null;
  const dort = layouts.find(l => l.stand === r.stand), hier = layouts.find(l => l.stand === stand);
  return { wert: r.bewertung, stand: r.stand, bildGeaendert: dort && hier ? dort.xml !== hier.xml : null };
}

// Die Merkmale eines Diagramms, aus dem Modell von readProcess() (Ben, 2026-10-09: die Art im Filter).
export const MERKMALE = ['Pools', 'Black Box', 'Bahnen', 'Daten', 'Notizen', 'Angeheftete Ereignisse'];
export function merkmale(model){
  if (!model) return [];
  const has = {
    'Pools': (model.pools || []).length > 1,
    'Black Box': (model.pools || []).some(p => p.box),
    'Bahnen': (model.lanes || []).some(l => !l.synthetic),
    'Daten': (model.data || []).length > 0,
    'Notizen': (model.notes || []).length > 0,
    'Angeheftete Ereignisse': (model.boundaries || []).length > 0,
  };
  return MERKMALE.filter(m => has[m]);
}

// Warum die Anordnung hier anders ist als davor, mit den Maßen von aenderungen(): in Worten, leer, wo es nichts
// zu nennen gibt.
export function warum(davor, hier, model){
  let a;
  try { a = aenderungen(davor, hier, model); } catch { return ''; }
  const teile = [[a.lanes.length, 'in anderer Bahn'], [a.x.length, 'andere Reihenfolge'], [a.y.length, 'andere Zeile'], [a.flows.length, a.flows.length === 1 ? 'Fluss anders geführt' : 'Flüsse anders geführt']]
    .filter(([n]) => n).map(([n, t]) => n + ' ' + t);
  return teile.length ? teile.join(', ') : 'nur Abstände oder Beschriftungen';
}

// Die Fälle, die zu Suche und Filtern passen; alle Bedingungen zugleich. eintraege: [{ name, herkunft, geaendert,
// offen, merkmale, bewertung }] (name der angezeigte, offen die Zahl offener Posten, bewertung die Zahl oder null).
// filter: { suche, status: '' | 'geaendert' | 'offen' | 'ruhig', satz, art, bewertung: '' | 'ohne' | 'ab8' | 'ab5' |
// 'unter5' }; ruhig: weder geändert noch offen.
export function filtern(eintraege, { suche = '', status = '', satz = '', art = '', bewertung = '' } = {}){
  const q = suche.trim().toLowerCase();
  const passt = e => {
    if (q && !e.name.toLowerCase().includes(q)) return false;
    if (status === 'geaendert' && !e.geaendert) return false;
    if (status === 'offen' && !e.offen) return false;
    if (status === 'ruhig' && (e.geaendert || e.offen)) return false;
    if (satz && e.herkunft !== satz) return false;
    if (art && !(e.merkmale || []).includes(art)) return false;
    const b = e.bewertung;
    if (bewertung === 'ohne' && b != null) return false;
    if (bewertung === 'ab8' && !(b >= 8)) return false;
    if (bewertung === 'ab5' && !(b >= 5)) return false;
    if (bewertung === 'unter5' && !(b != null && b < 5)) return false;
    return true;
  };
  return eintraege.filter(passt);
}

// Ob eine Zeichnung aus dem Modellierer ein Fall werden kann (Story 2.40): kein BPMN oder kein Knoten, die Meldung;
// sonst null.
export function zeichnungPruefen(xml){
  let model = null;
  try { model = readProcess(parseXml(String(xml))).model; } catch {}
  if (!model || !caseFingerprint(xml)) return 'Die Zeichnung ist kein BPMN; nichts angelegt.';
  // Der leere Modellierer bringt ein Startereignis mit: erst ab zwei Knoten ist etwas gezeichnet.
  if (model.nodes.length < 2) return 'In der Zeichnung ist nichts gezeichnet; nichts angelegt.';
  return null;
}
export const anzeigeName = f => f.revision > 1 ? f.name + ' (' + f.revision + ')' : f.name;

// Das Paket des Layout-Feedbacks (das Format von tools/bpmn-layout/feedback-seite.js, feedback-auswerten.mjs liest
// es) für die Fälle mit Feedback am stand, die Bewertung (1 bis 10) als bewertung, wo es eine gibt. faelle, layouts, feedback: alles aus dem Speicher. Ein Fall mit Feedback,
// aber ohne Anordnung am Stand, kommt nicht hinein (ohneAnordnung). { paket, ohneAnordnung }, paket null, wo nichts
// hineinkommt.
export function paketBauen({ stand, faelle, layouts, feedback, jetzt = new Date().toISOString() }){
  const byFall = new Map(faelle.map(f => [f.fall, f]));
  const layoutOf = new Map(layouts.filter(l => l.stand === stand).map(l => [l.fall, l]));
  const beispiele = [], ohneAnordnung = [];
  // Kommentiert, bearbeitet oder bewertet am Stand (die Bewertung seit Story 2.41).
  const touched = feedback.filter(e => e.stand === stand && byFall.has(e.fall) && (e.bearbeitet || (e.kommentar || '').trim() || Number.isInteger(e.bewertung)));
  for (const e of touched){
    const f = byFall.get(e.fall), l = layoutOf.get(e.fall);
    if (!l){ ohneAnordnung.push(anzeigeName(f)); continue; }
    beispiele.push({
      name: anzeigeName(f), paket: f.herkunft, herkunft: f.herkunft, fall: f.fall,
      brueche: typeof l.brueche === 'number' ? l.brueche : null,
      eingabe: f.eingabe, erzeugt: l.xml, bearbeitet: e.bearbeitet || null, kommentar: e.kommentar || '', geaendert: e.geaendert || e.bewertet,
      ...(Number.isInteger(e.bewertung) ? { bewertung: e.bewertung } : {}),
    });
  }
  beispiele.sort((a, b) => a.name.localeCompare(b.name));
  if (!beispiele.length) return { paket: null, ohneAnordnung };
  const angeordnet = beispiele.map(b => layoutOf.get(b.fall).angeordnet).sort().pop();
  return {
    paket: {
      format: 'dokufix-layout-feedback', version: 1, exportiert: jetzt,
      satz: { id: 'werkbank-' + stand, variant: 'werkbank', rules: null, angeordnet, beispiele: beispiele.map(b => b.name), logik: stand },
      beispiele,
    },
    ohneAnordnung,
  };
}
