// Die Fälle der Layout-Werkbank (Story 2.39): reine Logik, in Node wie im Browser, ohne Speicher und ohne Seite.
//
//   ohneDi(xml)                       das XML ohne Diagrammteil (jedes BPMNDiagram)
//   hatDi(xml)                        ob das XML Positionen trägt (ein BPMNShape)
//   nameAus(xml)                      der Name, den die Eingabe sich gibt: Teilnehmer, Prozess, Definitionen
//   einordnen(xml, faelle, opts)      wohin eine Eingabe gehört: ein bekannter Fall, eine neue Revision, ein neuer Fall
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
// Ein Fall: { fall, kurz, name, herkunft, eingabe, revision, vorher, angelegt, referenz? }; herkunft `eigen` oder der
// Name des Satzes, eingabe das XML ohne Positionen.
// Eine Anordnung: { fall, stand, xml, angeordnet, ms?, brueche? }, je Fall und Stand eine, eingefroren.
// Ein Feedback: { fall, stand, kommentar, bearbeitet, geaendert, soll? }, je Fall und Stand eines; bearbeitet ist
// Bens Fassung an diesem Stand, soll false, wo sie nur eine Reparatur ist (Ben, 2026-10-09).
import { caseFingerprint } from '../app/fingerprint.js';

// Ein Element mit Namensraum-Präfix oder ohne, mit seinen Attributen (auch mit ">" in Anführungszeichen).
const ATTRS = '(?:[^>"\'/]|"[^"]*"|\'[^\']*\'|\\/(?!>))*';
const DIAGRAM = new RegExp('<((?:[\\w.-]+:)?BPMNDiagram)\\b' + ATTRS + '(?:\\/>|>[\\s\\S]*?<\\/\\1\\s*>)\\s*', 'g');
const SHAPE = /<(?:[\w.-]+:)?BPMNShape\b/;

export const ohneDi = xml => String(xml).replace(DIAGRAM, '');
export const hatDi = xml => SHAPE.test(String(xml));

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

// Wohin xml gehört. faelle: die Fälle, die es gibt. opts: { name, herkunft, jetzt }.
//   { fehler }                                         kein BPMN
//   { art: 'bekannt', fall, fassung }                  derselbe Fall; fassung Bens Fassung aus den Positionen, oder null
//   { art: 'revision' | 'neu', fall, fassung }         ein neuer Fall (revision: derselbe Name, anderer Fall)
export function einordnen(xml, faelle, { name, herkunft = 'eigen', jetzt = new Date().toISOString() } = {}){
  const text = String(xml ?? '');
  if (!text.trim()) return { fehler: 'Leere Eingabe.' };
  const fp = caseFingerprint(text);
  if (!fp) return { fehler: 'Kein BPMN: die Eingabe ist kein XML mit BPMN-Definitionen.' };
  const di = hatDi(text);
  const known = faelle.find(f => f.fall === fp.hash);
  if (known){
    const isRef = di && known.referenz && known.referenz.trim() === text.trim();
    return { art: 'bekannt', fall: known, fassung: di && !isRef ? text : null };
  }
  const nm = (name && String(name).trim()) || nameAus(text) || 'eigen-' + fp.short;
  // Die letzte Revision desselben Namens.
  const prev = faelle.filter(f => f.name === nm).sort((a, b) => b.revision - a.revision)[0];
  const fall = { fall: fp.hash, kurz: fp.short, name: nm, herkunft, eingabe: ohneDi(text), revision: prev ? prev.revision + 1 : 1, vorher: prev ? prev.fall : null, angelegt: jetzt };
  return { art: prev ? 'revision' : 'neu', fall, fassung: di ? text : null };
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
