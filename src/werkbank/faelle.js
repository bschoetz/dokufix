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

export const anzeigeName = f => f.revision > 1 ? f.name + ' (' + f.revision + ')' : f.name;

// Das Paket des Layout-Feedbacks (das Format von tools/bpmn-layout/feedback-seite.js, feedback-auswerten.mjs liest
// es) für die Fälle mit Feedback am stand. faelle, layouts, feedback: alles aus dem Speicher. Ein Fall mit Feedback,
// aber ohne Anordnung am Stand, kommt nicht hinein (ohneAnordnung). { paket, ohneAnordnung }, paket null, wo nichts
// hineinkommt.
export function paketBauen({ stand, faelle, layouts, feedback, jetzt = new Date().toISOString() }){
  const byFall = new Map(faelle.map(f => [f.fall, f]));
  const layoutOf = new Map(layouts.filter(l => l.stand === stand).map(l => [l.fall, l]));
  const beispiele = [], ohneAnordnung = [];
  const touched = feedback.filter(e => e.stand === stand && byFall.has(e.fall) && (e.bearbeitet || (e.kommentar || '').trim()));
  for (const e of touched){
    const f = byFall.get(e.fall), l = layoutOf.get(e.fall);
    if (!l){ ohneAnordnung.push(anzeigeName(f)); continue; }
    beispiele.push({
      name: anzeigeName(f), paket: f.herkunft, herkunft: f.herkunft, fall: f.fall,
      brueche: typeof l.brueche === 'number' ? l.brueche : null,
      eingabe: f.eingabe, erzeugt: l.xml, bearbeitet: e.bearbeitet || null, kommentar: e.kommentar || '', geaendert: e.geaendert,
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
