// Die Layout-Werkbank (dist/bpmn-layout-werkbank.html, Stories 2.38 und 2.39). Links die Liste der Fälle, rechts die
// Leinwand; im Kopf der Layout-Stand, die Prüfsumme der Module des Layouts, mit denen die Seite gebaut ist (logikOf()
// in tools/bpmn-layout/lib.mjs, dieselbe Zahl, die tools/bpmn-layout/lauf.mjs als Logik nennt).
//
// Die Seite trägt alle eigenen Eingaben der Sätze ohne Koordinaten (#werkbank-data, tools/werkbank/bauen.mjs) und
// nimmt sie beim Öffnen in ihren Speicher (src/werkbank/speicher.js): ein Fall je Fingerabdruck, eine geänderte
// Eingabe gleichen Namens als neue Revision. Dann ordnet sie im Hintergrund jeden Fall an, der an ihrem Stand noch
// keine Anordnung hat, im Worker des Layouts (makeA2Client(), src/bpmn-tools/layout.js), einen nach dem anderen, den
// gewählten zuerst, und friert jede Anordnung mit dem Stand ein. So gilt „geändert“ (anders als am letzten anderen
// Stand, geaendert() in src/werkbank/faelle.js) für die ganze Liste. Die Zeit je Lauf steht in der Liste, die aller
// im Kopf und in window.werkbankZeit.
//
// Die Leinwand zeigt den gewählten Fall: die erzeugte Fassung am Stand, Bens Fassung (die letzte, die er bearbeitet
// oder mitgebracht hat) und die Referenz, wo es eine gibt (ein Handlayout). „Im Modellierer bearbeiten“ öffnet die
// gezeigte Fassung; übernommen ist sie Bens Fassung des Falls am Stand, ohne Fingerabdruck: die Seite weiß, woher sie
// kommt. Darunter der Kommentar zum Fall am Stand, gespeichert beim Tippen.
//
// Eigene Fälle: „Einfügen“ nimmt BPMN-XML aus dem Feld oder einer Datei, mit dem Schalter „Als neuen Fall anlegen“
// (Ben, 2026-10-09): an, ein neuer Fall ohne Zuordnung; aus, er gehört zu einem Altfall, die Seite sucht ihn über den
// Fingerabdruck, dann ohne Bahnzugehörigkeit, und wo keiner eindeutig passt, wählt Ben ihn aus einer Liste
// (einordnen(), kandidaten(), zuordnen() in src/werkbank/faelle.js). Ein neuer Fall wird angeordnet wie die übrigen.
//
// Im Kopf: das Paket des Layout-Feedbacks am Stand herunterladen (paketBauen(), das Format der alten Feedback-Seite mit
// der Herkunft, tools/bpmn-layout/feedback-auswerten.mjs wertet es aus), den Arbeitsstand als Datei sichern und laden.
//
// Der Einstieg des Skripts der Seite, gebündelt über tools/seiten.mjs (tools/werkbank/bauen.mjs). Eine Seite, der der
// Browser einen Worker aus einer Blob-URL verweigert, ordnet selbst an (der Client sagt es, withoutWorker()); eine
// Seite ohne IndexedDB hält die Fälle im Arbeitsspeicher und sagt es im Kopf.
import { BPMN_VIEWER_CONFIG } from '../app/bpmn.js';
import { decorate } from '../bpmn-tools/decorate.js';
import { openModeler } from '../bpmn-tools/modeler.js';
import { fileBase } from '../bpmn-tools/downloads.js';
import { makeA2Client } from '../bpmn-tools/layout.js';
import { themeCss, PRESETS } from '../bpmn-tools/theme.js';
import { speicherOeffnen } from './speicher.js';
import { geaendert, anzeigeName, paketBauen } from './faelle.js';

const $ = id => document.getElementById(id);
const DATA = JSON.parse($('werkbank-data').textContent);
const STAND = DATA.stand;
// Der Stand auch im Titel des Tabs, damit zwei offene Werkbänke verschiedener Stände unterscheidbar sind.
document.title += ' · ' + STAND;
// Die Farben der Diagramme: die Vorlage Gelb, wie im BPMN Assistant voreingestellt; die gestaltete Ansicht kommt mit
// Eintrag 40.
const farben = document.createElement('style');
farben.textContent = themeCss(PRESETS.gelb, { background: false });
document.head.appendChild(farben);

const LAYOUT = makeA2Client();
const GEWAEHLT_KEY = 'werkbank-gewaehlt';
let sp = null;
// Die Fälle in der Reihenfolge der Liste, und je Fall seine Anordnungen (alle Stände) und Bens letzte Fassung.
let faelle = [];
const anordnungen = new Map(), bens = new Map(), zeilen = new Map();
// Je Fall der Lauf in dieser Sitzung: { art: 'wartet' | 'laeuft' | 'fehler', fehler }; ohne Eintrag angeordnet.
const lauf = new Map();
let gewaehlt = null, fassung = 'erzeugt';

const sekunden = ms => (ms / 1000).toFixed(1).replace('.', ',') + ' s';
const anordnungAm = f => (anordnungen.get(f.fall) || []).find(a => a.stand === STAND) || null;

// ---------- die Liste ----------
function zeile(f){
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.innerHTML = '<span class="n"></span><span class="m"></span><span class="s"></span><span class="t"></span>';
  b.querySelector('.n').textContent = anzeigeName(f);
  b.querySelector('.s').textContent = f.herkunft;
  b.onclick = () => waehlen(f.fall);
  li.appendChild(b);
  zeilen.set(f.fall, li);
  markieren(f);
  return li;
}
function markieren(f){
  const li = zeilen.get(f.fall);
  if (!li) return;
  const a = anordnungAm(f), l = lauf.get(f.fall), g = geaendert(anordnungen.get(f.fall) || [], STAND);
  const m = li.querySelector('.m'), t = li.querySelector('.t');
  m.textContent = g.art === 'anders' ? 'geändert' : '';
  m.title = g.art === 'anders' ? 'Anders angeordnet als am Stand ' + g.gegen : '';
  t.textContent = a ? (a.ms != null ? sekunden(a.ms) : '') : l && l.art === 'laeuft' ? 'ordnet an …' : l && l.art === 'fehler' ? 'Fehler' : 'wartet';
  t.title = l && l.art === 'fehler' ? l.fehler : '';
  li.classList.toggle('anders', g.art === 'anders');
  li.classList.toggle('fehler', !!(l && l.art === 'fehler'));
  li.querySelector('button').setAttribute('aria-current', String(f.fall === gewaehlt));
}
function liste(){
  $('faelle').replaceChildren(...faelle.map(zeile));
}

// ---------- der Speicher ----------
async function lesen(){
  const reihe = new Map(DATA.eingaben.map((e, i) => [e.name, i]));
  const nr = f => f.herkunft !== 'eigen' && reihe.has(f.name) ? reihe.get(f.name) : Infinity;
  faelle = (await sp.faelle()).sort((a, b) => nr(a) - nr(b) || a.name.localeCompare(b.name) || a.revision - b.revision);
  anordnungen.clear(); bens.clear();
  for (const a of await sp.anordnungen()) (anordnungen.get(a.fall) || anordnungen.set(a.fall, []).get(a.fall)).push(a);
  for (const e of await sp.feedbacks()){
    if (!e.bearbeitet) continue;
    const da = bens.get(e.fall);
    if (!da || String(e.geaendert) > String(da.geaendert)) bens.set(e.fall, e);
  }
}

// ---------- das Anordnen im Hintergrund ----------
// Ein Lauf im Worker zur Zeit; der gewählte Fall zuerst. Wählt Ben einen wartenden Fall, während ein anderer läuft,
// wird der abgebrochen und kommt nach dem gewählten wieder dran.
let laufend = null, pumpt = false;
const zeit = { start: null, n: 0, ms: 0 };
const offen = f => !anordnungAm(f) && !(lauf.get(f.fall) && lauf.get(f.fall).art === 'fehler');
function naechster(){
  const g = faelle.find(f => f.fall === gewaehlt);
  return g && offen(g) ? g : faelle.find(offen) || null;
}
async function pumpen(){
  if (pumpt) return;
  pumpt = true;
  let f;
  while ((f = naechster())){
    if (zeit.start === null) zeit.start = performance.now();
    const ctl = new AbortController();
    laufend = { fall: f.fall, ctl };
    lauf.set(f.fall, { art: 'laeuft' });
    markieren(f); fortschritt();
    const t0 = performance.now();
    try {
      const r = await LAYOUT.layout(f.eingabe, { signal: ctl.signal });
      const ms = Math.round(performance.now() - t0);
      const a = await sp.einfrieren({ fall: f.fall, stand: STAND, xml: r.xml, angeordnet: new Date().toISOString(), ms });
      (anordnungen.get(f.fall) || anordnungen.set(f.fall, []).get(f.fall)).push(a);
      lauf.delete(f.fall);
      zeit.n++;
    } catch (e){
      if (e && e.name === 'AbortError') lauf.set(f.fall, { art: 'wartet' });
      else lauf.set(f.fall, { art: 'fehler', fehler: (e && e.message) || String(e) });
    }
    laufend = null;
    markieren(f);
    if (f.fall === gewaehlt) zeigen();
  }
  pumpt = false;
  if (zeit.start !== null){
    zeit.ms = Math.round(performance.now() - zeit.start);
    // Für die Messung in Chromium und Firefox (README): wie viele in dieser Sitzung angeordnet wurden und in welcher Zeit.
    window.werkbankZeit = { n: zeit.n, ms: zeit.ms, ohneWorker: LAYOUT.withoutWorker(), fertig: true };
  }
  fortschritt();
}
function fortschritt(){
  const da = faelle.filter(anordnungAm).length, fehler = faelle.filter(f => lauf.get(f.fall) && lauf.get(f.fall).art === 'fehler').length;
  const wie = LAYOUT.withoutWorker() ? ' (ohne Worker)' : '';
  let text = da + ' von ' + faelle.length + ' angeordnet';
  if (pumpt && zeit.start !== null) text += ' · ' + sekunden(performance.now() - zeit.start) + wie;
  else if (zeit.n) text += ' · ' + zeit.n + ' in dieser Sitzung in ' + sekunden(zeit.ms) + wie;
  if (fehler) text += ' · ' + fehler + ' mit Fehler';
  $('fortschritt').textContent = text;
}

// ---------- die Leinwand ----------
let viewer = null, zeichnung = 0, gezeigt = null, kommentarVon = null;
function waehlen(fall){
  const vorher = gewaehlt;
  gewaehlt = fall;
  try { localStorage.setItem(GEWAEHLT_KEY, fall); } catch {}
  for (const f of faelle) if (f.fall === vorher || f.fall === fall) markieren(f);
  const f = faelle.find(x => x.fall === fall);
  // Ein anderer Fall läuft, der gewählte wartet: abbrechen, damit der gewählte drankommt.
  if (laufend && laufend.fall !== fall && f && offen(f)) laufend.ctl.abort();
  zeigen();
  pumpen();
}
function fassungenVon(f){
  const out = [['erzeugt', 'Erzeugt']];
  if (bens.has(f.fall)) out.push(['ben', 'Bens Fassung']);
  if (f.referenz) out.push(['referenz', 'Referenz']);
  return out;
}
async function zeigen(){
  const my = ++zeichnung;
  const f = faelle.find(x => x.fall === gewaehlt);
  $('titel').textContent = f ? anzeigeName(f) : '';
  const arten = f ? fassungenVon(f) : [];
  if (!arten.some(([k]) => k === fassung)) fassung = 'erzeugt';
  $('fassungen').replaceChildren(...arten.map(([k, label]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.setAttribute('aria-pressed', String(k === fassung));
    b.onclick = () => { fassung = k; zeigen(); };
    return b;
  }));
  $('bearbeiten').hidden = !f;
  $('kommentar').disabled = !f;
  if (!f){ $('info').textContent = ''; $('kommentar').value = ''; return; }
  if (kommentarVon !== f.fall){
    kommentarVon = f.fall;
    const e = await sp.feedback(f.fall, STAND);
    if (my !== zeichnung) return;
    $('kommentar').value = (e && e.kommentar) || '';
  }
  let xml = null, info = '';
  if (fassung === 'erzeugt'){
    const a = anordnungAm(f), l = lauf.get(f.fall), g = geaendert(anordnungen.get(f.fall) || [], STAND);
    if (a){
      xml = a.xml;
      info = (a.ms != null ? sekunden(a.ms) : '') + (g.art === 'anders' ? ' · anders als am Stand ' + g.gegen : g.art === 'gleich' ? ' · gleich wie am Stand ' + g.gegen : '');
    } else info = l && l.art === 'fehler' ? 'Fehler: ' + l.fehler : l && l.art === 'laeuft' ? 'wird angeordnet …' : 'wartet aufs Anordnen';
  } else if (fassung === 'ben'){
    const e = bens.get(f.fall);
    xml = e.bearbeitet;
    info = 'Stand ' + e.stand + (e.geaendert ? ' · ' + String(e.geaendert).slice(0, 10) : '') + (e.soll === false ? ' · Reparatur, kein Soll' : '');
  } else {
    xml = f.referenz;
    info = 'Handlayout';
  }
  $('info').textContent = info;
  gezeigt = xml;
  $('bearbeiten').disabled = !xml;
  if (!viewer) viewer = new BpmnJS({ container: $('canvas'), ...BPMN_VIEWER_CONFIG });
  if (!xml){ viewer.clear(); return; }
  try {
    await viewer.importXML(xml);
    if (my !== zeichnung) return;
    decorate(viewer);
    viewer.get('canvas').zoom('fit-viewport', 'auto');
  } catch (e){
    if (my === zeichnung) $('info').textContent = 'Nicht darstellbar: ' + ((e && e.message) || String(e));
  }
}

// ---------- Meldungen und Downloads ----------
function meldung(text, schlecht){ const m = $('meldung'); m.textContent = text; m.classList.toggle('schlecht', !!schlecht); }
function herunterladen(name, text){
  const a = document.createElement('a');
  a.download = name;
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
const heute = () => new Date().toISOString().slice(0, 10);
// Nach einer Änderung des Speichers: neu lesen, die Liste neu, den Fall wählen, anordnen, was fehlt.
async function neu(fall){
  await lesen();
  liste();
  waehlen(fall && faelle.some(f => f.fall === fall) ? fall : gewaehlt);
}
const eingebauteAufnehmen = () => sp.aufnehmenViele(DATA.eingaben.map(e => ({ xml: e.xml, name: e.name, herkunft: e.satz, referenz: e.referenz })));

// ---------- Modellierer und Kommentar ----------
$('bearbeiten').onclick = () => {
  const f = faelle.find(x => x.fall === gewaehlt);
  if (!f || !gezeigt) return;
  openModeler(anzeigeName(f), gezeigt, {
    fileBase: () => fileBase(f.name), takeLabel: 'Als meine Fassung übernehmen',
    take: async x => {
      const e = await sp.legeFeedback({ fall: f.fall, stand: STAND, bearbeitet: x, geaendert: new Date().toISOString(), soll: null });
      bens.set(f.fall, e);
      fassung = 'ben';
      markieren(f);
      zeigen();
      meldung('Deine Fassung von ' + anzeigeName(f) + ' am Stand ' + STAND + ' gespeichert.');
    },
  });
};
let tippen = null;
$('kommentar').addEventListener('input', () => {
  const fall = kommentarVon, text = $('kommentar').value;
  clearTimeout(tippen);
  tippen = setTimeout(() => { sp.legeFeedback({ fall, stand: STAND, kommentar: text, geaendert: new Date().toISOString() }).catch(e => meldung('Kommentar nicht gespeichert: ' + e.message, true)); }, 400);
});

// ---------- Einfügen ----------
const dlg = $('einfuegen');
$('einfuegen-btn').onclick = () => { $('zuordnung').hidden = true; $('ein-meldung').textContent = ''; dlg.showModal(); $('xml').focus(); };
$('ein-abbrechen').onclick = () => dlg.close();
$('ein-datei-btn').onclick = () => $('ein-datei').click();
$('ein-datei').onchange = async () => {
  const file = $('ein-datei').files[0];
  if (!file) return;
  $('xml').value = await file.text();
  if (!$('ein-name').value.trim()) $('ein-name').value = file.name.replace(/\.(bpmn|xml)$/i, '');
  $('ein-datei').value = '';
};
// Was ein Einordnen oder Zuordnen ergab, als Meldung; bei einem Fall wird er gewählt.
async function ergebnis(r){
  if (r.fehler){ $('ein-meldung').textContent = r.fehler; return; }
  if (r.art === 'offen'){ zuordnungZeigen(r.kandidaten); return; }
  dlg.close();
  $('xml').value = ''; $('ein-name').value = '';
  const name = anzeigeName(r.fall);
  const text = r.art === 'neu' ? 'Neuer Fall ' + name + '.'
    : r.art === 'revision' ? 'Neue Revision ' + name + ' (der Fall davor: ' + (faelle.find(f => f.fall === r.fall.vorher) ? anzeigeName(faelle.find(f => f.fall === r.fall.vorher)) : 'unbekannt') + ').'
    : 'Gehört zu ' + name + (r.ueber === 'bahnen' ? ' (erkannt ohne Bahnzugehörigkeit: ein Knoten liegt in einer anderen Bahn)' : r.ueber === 'hand' ? ' (von dir zugeordnet)' : '') + '.';
  if (r.fassung) fassung = 'ben';
  meldung(text + (r.fassung ? ' Die Positionen sind deine Fassung am Stand ' + STAND + '.' : r.art === 'bekannt' ? ' Nichts Neues.' : ''));
  await neu(r.fall.fall);
}
$('ein-ok').onclick = async () => {
  const xml = $('xml').value;
  const r = await sp.aufnehmen(xml, { name: $('ein-name').value.trim() || undefined, herkunft: 'eigen', modus: $('ein-neu').checked ? 'neu' : 'zuordnen', stand: STAND });
  await ergebnis(r);
};
// Kein Fall passt eindeutig: die Vorschläge (gleicher Name, die nach der Form ähnlichsten) und alle Fälle zur Wahl.
function zuordnungZeigen(vorschlaege){
  const box = $('zuordnung');
  box.hidden = false;
  $('ein-meldung').textContent = 'Keinem Fall eindeutig zuzuordnen. Wähle den Fall, zu dem es gehört; nichts ist angelegt.';
  const zu = fall => async () => ergebnis(await sp.zuordnen($('xml').value, fall, { herkunft: 'eigen', stand: STAND }));
  $('vorschlaege').replaceChildren(...vorschlaege.map(k => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = anzeigeName(k.fall) + ' · ' + k.warum;
    b.onclick = zu(k.fall.fall);
    return b;
  }));
  $('alle').replaceChildren(...faelle.map(f => { const o = document.createElement('option'); o.value = f.fall; o.textContent = anzeigeName(f) + ' · ' + f.herkunft; return o; }));
  $('zuordnen-ok').onclick = () => zu($('alle').value)();
}

// ---------- Paket und Arbeitsstand ----------
$('paket-btn').onclick = async () => {
  const { paket, ohneAnordnung } = paketBauen({ stand: STAND, faelle, layouts: await sp.anordnungen(), feedback: await sp.feedbacks() });
  const ohne = ohneAnordnung.length ? ' Ohne Anordnung am Stand, nicht im Paket: ' + ohneAnordnung.join(', ') + '.' : '';
  if (!paket){ meldung('Am Stand ' + STAND + ' ist noch nichts bearbeitet oder kommentiert.' + ohne, !!ohne); return; }
  const name = 'layout-feedback-werkbank-' + STAND + '-' + heute() + '.json';
  herunterladen(name, JSON.stringify(paket, null, 1) + '\n');
  meldung('Heruntergeladen: ' + name + ', ' + paket.beispiele.length + (paket.beispiele.length === 1 ? ' Beispiel' : ' Beispiele') + '. Nenne mir den Pfad; feedback-auswerten.mjs wertet es aus.' + ohne);
};
$('sichern-btn').onclick = async () => {
  const z = await sp.zustand();
  const name = 'werkbank-arbeitsstand-' + heute() + '.json';
  herunterladen(name, JSON.stringify(z) + '\n');
  meldung('Arbeitsstand gesichert: ' + name + ', ' + z.faelle.length + ' Fälle.');
};
$('laden-btn').onclick = () => $('laden-datei').click();
$('laden-datei').onchange = async () => {
  const file = $('laden-datei').files[0];
  $('laden-datei').value = '';
  if (!file) return;
  let z;
  try { z = JSON.parse(await file.text()); } catch { meldung('Laden fehlgeschlagen: keine JSON-Datei. Der Speicher ist unverändert.', true); return; }
  if (!window.confirm('Der Arbeitsstand ersetzt alles im Speicher der Werkbank. Laden?')) return;
  try { await sp.laden(z); } catch (e){ meldung('Laden fehlgeschlagen: ' + e.message + ' Der Speicher ist unverändert.', true); return; }
  // Die eingebauten Eingaben kommen wieder dazu, wo der Arbeitsstand sie nicht hat; die übrigen sind schon da.
  await eingebauteAufnehmen();
  lauf.clear(); kommentarVon = null;
  meldung('Arbeitsstand geladen: ' + (z.faelle || []).length + ' Fälle.');
  await neu(gewaehlt);
};

// ---------- Start ----------
async function start(){
  sp = await speicherOeffnen();
  if (sp.warnung){
    $('warnung').hidden = false;
    $('warnung').textContent = sp.warnung + ': die Fälle gelten nur, solange die Seite offen ist.';
  }
  await eingebauteAufnehmen();
  await lesen();
  liste();
  let erst = null;
  try { erst = localStorage.getItem(GEWAEHLT_KEY); } catch {}
  waehlen(faelle.some(f => f.fall === erst) ? erst : faelle.length ? faelle[0].fall : null);
}
start().catch(e => { $('warnung').hidden = false; $('warnung').textContent = 'Die Werkbank ist nicht gestartet: ' + ((e && e.message) || String(e)); });
