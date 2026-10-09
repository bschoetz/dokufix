// Die Layout-Werkbank (dist/bpmn-layout-werkbank.html, Stories 2.38 bis 2.40). Links die Liste der Fälle, rechts die
// Leinwand; im Kopf der Layout-Stand, die Prüfsumme der Module des Layouts, mit denen die Seite gebaut ist
// (logikOf() in tools/bpmn-layout/lib.mjs, dieselbe Zahl, die tools/bpmn-layout/lauf.mjs als Logik nennt).
//
// Die Seite trägt alle eigenen Eingaben der Sätze ohne Koordinaten (#werkbank-data, tools/werkbank/bauen.mjs) und
// nimmt sie beim Öffnen in ihren Speicher (src/werkbank/speicher.js): ein Fall je Fingerabdruck, eine geänderte
// Eingabe gleichen Namens als neue Revision. Dann ordnet sie im Hintergrund jeden Fall an, der an ihrem Stand noch
// keine Anordnung hat, im Worker des Layouts (makeA2Client(), src/bpmn-tools/layout.js), einen nach dem anderen, den
// gewählten zuerst, und friert jede Anordnung mit dem Stand ein. So gilt „geändert“ (anders als am letzten anderen
// Stand, geaendert() in src/werkbank/faelle.js) für die ganze Liste. Die Zeit je Lauf steht in der Liste, die aller
// im Kopf und in window.werkbankZeit.
//
// Die Ansicht (Story 2.40, Variante C, Ben 2026-10-09): links die Liste, darunter der gewählte Fall mit Kommentar
// und Archiv; rechts die Leinwand. Die Fassungen des Falls sind Ebenen einer Leinwand (src/werkbank/ebenen.js): die
// erzeugte am Stand (immer Ebene 1), Bens Fassung (die letzte, die er bearbeitet oder mitgebracht hat), die
// Anordnung am letzten anderen Stand, die Referenz, wo es eine gibt (ein Handlayout), und ein Eintrag des Archivs,
// den „Zeigen“ dazulegt. Tasten 1 bis 9 oder die Reiter schalten um, Zoom und Ausschnitt bleiben stehen;
// „Änderungen“ (Taste M) markiert, was anders liegt, gemessen wie in tools/bpmn-layout/feedback-auswerten.mjs
// (src/bpmn-tools/aenderungen.js); Pfeil hoch und runter gehen durch die Liste, 0 passt ein. „Bearbeiten“ öffnet die
// gezeigte Fassung im Modellierer auf der Leinwand; übernommen ist sie Bens Fassung des Falls am Stand, ohne
// Fingerabdruck: die Seite weiß, woher sie kommt. Der Kommentar zum Fall am Stand wird beim Tippen gespeichert.
//
// Eigene Fälle, unter „Neuer Fall“: „Zeichnen“ öffnet einen leeren Modellierer auf der Leinwand; die Zeichnung wird
// ein neuer Fall, sie selbst Bens Fassung, zuerst gezeigt, und er wird angeordnet. „Einfügen“ nimmt BPMN-XML aus dem
// Feld oder einer Datei, mit dem Schalter „Als neuen Fall anlegen“ (Ben, 2026-10-09): an, ein neuer Fall ohne
// Zuordnung; aus, er gehört zu einem Altfall, die Seite sucht ihn über den Fingerabdruck, dann ohne
// Bahnzugehörigkeit, und wo keiner eindeutig passt, wählt Ben ihn aus einer Liste (einordnen(), kandidaten(),
// zuordnen() in src/werkbank/faelle.js). Ein neuer Fall wird angeordnet wie die übrigen.
//
// Im Kopf: das Paket des Layout-Feedbacks am Stand herunterladen (paketBauen(), das Format der alten Feedback-Seite
// mit der Herkunft, tools/bpmn-layout/feedback-auswerten.mjs wertet es aus); unter „⋯“ den Arbeitsstand als Datei
// sichern und laden und den Import laden (tools/werkbank/import.mjs: die externen Eingaben, Bens letzte Fassungen
// aus den Paketen der alten Feedback-Seite als Reparatur, soll: false, und das Archiv). Das Archiv eines Falls steht
// eingeklappt unter dem Kommentar, nur zum Lesen: frühere Anordnungen mit ihren Ständen, ältere Bearbeitungen,
// Kommentare, Variantenvergleiche; „Zeigen“ legt eine Fassung daraus auf die Leinwand.
//
// Der Einstieg des Skripts der Seite, gebündelt über tools/seiten.mjs (tools/werkbank/bauen.mjs). Eine Seite, der
// der Browser einen Worker aus einer Blob-URL verweigert, ordnet selbst an (der Client sagt es, withoutWorker());
// eine Seite ohne IndexedDB hält die Fälle im Arbeitsspeicher und sagt es im Kopf.
import { BPMN_VIEWER_CONFIG } from '../app/bpmn.js';
import { decorate } from '../bpmn-tools/decorate.js';
import { openModeler, modelerOpen, closeModeler } from '../bpmn-tools/modeler.js';
import { readProcess } from '../app/bpmn-layout.js';
import { parseXml } from '../app/xml-parser.js';
import { fileBase } from '../bpmn-tools/downloads.js';
import { makeA2Client } from '../bpmn-tools/layout.js';
import { themeCss, PRESETS } from '../bpmn-tools/theme.js';
import { speicherOeffnen } from './speicher.js';
import { geaendert, anzeigeName, paketBauen, nameAus, zeichnungPruefen } from './faelle.js';
import { leinwand, markenFuer, ebeneFuerTaste } from './ebenen.js';

const $ = id => document.getElementById(id);
const DATA = JSON.parse($('werkbank-data').textContent);
const STAND = DATA.stand;
// Der Stand auch im Titel des Tabs, damit zwei offene Werkbänke verschiedener Stände unterscheidbar sind.
document.title += ' · ' + STAND;
// Die Farben der Diagramme: die Vorlage Gelb, wie im BPMN Assistant voreingestellt.
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
  // Die Zeit gilt für diesen Durchgang der Schlange, nicht seit dem Öffnen der Seite.
  zeit.start = null; zeit.n = 0;
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
      // Ein Arbeitsstand, der inzwischen geladen ist, hat den Fall vielleicht nicht mehr: dann nichts einfrieren.
      if (await sp.fall(f.fall)){
        const a = await sp.einfrieren({ fall: f.fall, stand: STAND, xml: r.xml, angeordnet: new Date().toISOString(), ms });
        (anordnungen.get(f.fall) || anordnungen.set(f.fall, []).get(f.fall)).push(a);
        zeit.n++;
      }
      lauf.delete(f.fall);
    } catch (e){
      if (e && e.name === 'AbortError') lauf.set(f.fall, { art: 'wartet' });
      else lauf.set(f.fall, { art: 'fehler', fehler: (e && e.message) || String(e) });
    }
    laufend = null;
    markieren(f);
    if (f.fall === gewaehlt) zeigen();
  }
  pumpt = false;
  if (zeit.start !== null && zeit.n){
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
// Die Fassungen des gewählten Falls als Ebenen einer Leinwand (src/werkbank/ebenen.js): Zoom und Verschieben bleiben
// beim Umschalten stehen. Ebene 1 ist immer die erzeugte, auch solange sie noch angeordnet wird.
const EBENEN = leinwand($('canvas'), { Viewer: BpmnJS, config: BPMN_VIEWER_CONFIG, nachImport: v => decorate(v) });
// Für die Prüfung im Browser (wie window.werkbankZeit): die Ansicht je Ebene, relativ zu ihrem Ursprung.
window.werkbankAnsichten = () => EBENEN.ansichten();
let zeichnung = 0, gezeigt = null, kommentarVon = null, ebenenFehler = {}, arten = [], marken = new Map();
function waehlen(fall){
  const vorher = gewaehlt;
  gewaehlt = fall;
  try { localStorage.setItem(GEWAEHLT_KEY, fall); } catch {}
  for (const f of faelle) if (f.fall === vorher || f.fall === fall) markieren(f);
  const li = zeilen.get(fall);
  if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
  const f = faelle.find(x => x.fall === fall);
  // Ein anderer Fall läuft, der gewählte wartet: abbrechen, damit der gewählte drankommt.
  if (laufend && laufend.fall !== fall && f && offen(f)) laufend.ctl.abort();
  zeigen();
  pumpen();
}
// Die Anordnung am letzten anderen Stand, die jüngste.
const letzterStand = f => (anordnungen.get(f.fall) || []).filter(a => a.stand !== STAND).sort((a, b) => String(b.angeordnet).localeCompare(String(a.angeordnet)))[0] || null;
// Die Ebenen des Falls, in ihrer Reihenfolge (Taste 1, 2, …): { key, label, xml, info }.
function fassungenVon(f){
  const out = [];
  const a = anordnungAm(f), l = lauf.get(f.fall), g = geaendert(anordnungen.get(f.fall) || [], STAND);
  out.push({ key: 'erzeugt', label: 'Erzeugt', xml: a ? a.xml : null,
    info: a ? (a.ms != null ? sekunden(a.ms) : '') + (g.art === 'anders' ? ' · anders als am Stand ' + g.gegen : g.art === 'gleich' ? ' · gleich wie am Stand ' + g.gegen : '')
      : l && l.art === 'fehler' ? 'Fehler: ' + l.fehler : l && l.art === 'laeuft' ? 'wird angeordnet …' : 'wartet aufs Anordnen' });
  const e = bens.get(f.fall);
  if (e) out.push({ key: 'ben', label: 'Bens Fassung', xml: e.bearbeitet, info: 'Stand ' + e.stand + (e.geaendert ? ' · ' + String(e.geaendert).slice(0, 10) : '') + (e.soll === false ? ' · Reparatur, kein Soll' : '') });
  const s = letzterStand(f);
  if (s) out.push({ key: 'stand', label: 'Stand ' + s.stand, xml: s.xml, info: 'Erzeugt am Stand ' + s.stand + (s.angeordnet ? ' · ' + String(s.angeordnet).slice(0, 10) : '') });
  if (f.referenz) out.push({ key: 'referenz', label: 'Referenz', xml: f.referenz, info: 'Handlayout' });
  const x = fassung.startsWith('archiv:') ? archivListe.find(y => 'archiv:' + y.id === fassung) : null;
  if (x) out.push({ key: fassung, label: 'Archiv', xml: x.xml, info: 'Archiv · ' + (ARCHIV_ART[x.art] || x.art) + ' · ' + archivBeschreibung(x) + (x.art === 'bearbeitung' ? ' · Reparatur, kein Soll' : '') });
  return out;
}
// Das Archiv des gewählten Falls, eingeklappt; neu gelesen, wenn ein anderer Fall gewählt ist.
let archivListe = [], archivVon = null;
const ARCHIV_ORDNUNG = { bearbeitung: 0, kommentar: 1, anordnung: 2, varianten: 3 };
const ARCHIV_ART = { anordnung: 'Anordnung', bearbeitung: 'Bearbeitung', kommentar: 'Kommentar', varianten: 'Variantenvergleich' };
function archivBeschreibung(x){
  const dat = d => d ? String(d).slice(0, 10) : '';
  if (x.art === 'anordnung') return 'Stände ' + (x.staende.join(', ') || '–') + (x.angeordnet ? ' · ' + dat(x.angeordnet) : '') + (x.varianten.length ? ' · ' + x.varianten.join('; ') : '');
  if (x.art === 'bearbeitung' || x.art === 'kommentar') return 'Satz ' + x.satz + (x.stand !== x.satz ? ' · Stand ' + x.stand : '') + ' · ' + dat(x.geaendert);
  return x.datei;
}
function archivZeichnen(f){
  const box = $('archiv');
  box.hidden = !archivListe.length;
  box.querySelector('summary').textContent = 'Archiv (' + archivListe.length + ')';
  $('archiv-liste').replaceChildren(...[...archivListe].sort((a, b) => ARCHIV_ORDNUNG[a.art] - ARCHIV_ORDNUNG[b.art] || String(b.geaendert || b.angeordnet || '').localeCompare(String(a.geaendert || a.angeordnet || ''))).map(x => {
    const li = document.createElement('li');
    const was = document.createElement('span');
    was.className = 'was';
    const art = document.createElement('strong');
    art.textContent = ARCHIV_ART[x.art] || x.art;
    was.append(art, ' ' + archivBeschreibung(x));
    const text = x.art === 'varianten' ? x.hinweis + ' (' + x.varianten.map(v => v.titel).join(', ') + ')' : x.kommentar;
    if (text){ const t = document.createElement('div'); t.className = 'text'; t.textContent = text; was.append(t); }
    li.append(was);
    if (x.xml){
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = 'Zeigen';
      b.onclick = () => { fassung = 'archiv:' + x.id; zeigen(); };
      li.append(b);
    }
    return li;
  }));
  if (archivVon !== f.fall) box.open = false;
}
// Das Modell der Eingabe eines Falls, für die Messung der Änderungen; einmal je Fall gelesen.
const modelle = new Map();
function modelVon(f){
  if (!modelle.has(f.fall)){
    let m = null;
    try { m = readProcess(parseXml(f.eingabe)).model; } catch {}
    modelle.set(f.fall, m);
  }
  return modelle.get(f.fall);
}
// Die Leiste zur gewählten Ebene: Reiter, Zahl der Marken, Info.
function leiste(){
  const a = arten.find(x => x.key === fassung);
  for (const b of $('fassungen').children){
    b.setAttribute('aria-pressed', String(b.dataset.key === fassung));
    b.classList.toggle('fehler', !!ebenenFehler[b.dataset.key]);
    b.title = ebenenFehler[b.dataset.key] ? 'Nicht darstellbar: ' + ebenenFehler[b.dataset.key] : '';
  }
  const n = (marken.get(fassung) || new Set()).size;
  $('marken-zahl').textContent = $('markieren').checked && marken.has(fassung) ? '(' + n + ')' : '';
  $('info').textContent = !a ? '' : ebenenFehler[a.key] ? 'Nicht darstellbar: ' + ebenenFehler[a.key] : a.info;
  gezeigt = a && !ebenenFehler[a.key] ? a.xml : null;
  $('bearbeiten').disabled = !gezeigt;
}
// Eine andere Ebene des Falls: nur umschalten.
function fassungWaehlen(key){
  if (!arten.some(a => a.key === key)) return;
  fassung = key;
  EBENEN.zeigen(key);
  leiste();
}
async function zeigen(){
  const my = ++zeichnung;
  const f = faelle.find(x => x.fall === gewaehlt);
  $('titel').textContent = f ? anzeigeName(f) : '';
  $('bearbeiten').hidden = !f;
  $('kommentar').disabled = !f;
  if (!f){ $('info').textContent = ''; $('fall-info').textContent = ''; $('kommentar').value = ''; $('fassungen').replaceChildren(); $('archiv').hidden = true; arten = []; EBENEN.leeren(); return; }
  const a = anordnungAm(f), g = geaendert(anordnungen.get(f.fall) || [], STAND);
  $('fall-info').textContent = [f.herkunft, a && a.ms != null ? sekunden(a.ms) : '', g.art === 'anders' ? 'geändert' : ''].filter(Boolean).join(' · ');
  // Erst wenn der Kommentar des Falls im Feld steht, gilt das Feld für ihn (kommentarVon, das Ziel des Speicherns).
  if (kommentarVon !== f.fall){
    const e = await sp.feedback(f.fall, STAND);
    if (my !== zeichnung) return;
    $('kommentar').value = (e && e.kommentar) || '';
    kommentarVon = f.fall;
  }
  if (archivVon !== f.fall){
    archivListe = await sp.archiv(f.fall);
    if (my !== zeichnung) return;
    archivZeichnen(f);
    archivVon = f.fall;
  }
  arten = fassungenVon(f);
  if (!arten.some(x => x.key === fassung)) fassung = 'erzeugt';
  $('fassungen').replaceChildren(...arten.map((x, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.key = x.key;
    const k = document.createElement('kbd'); k.textContent = String(i + 1);
    b.append(k, x.label);
    b.onclick = () => fassungWaehlen(x.key);
    return b;
  }));
  ebenenFehler = {};
  marken = markenFuer(arten, modelVon(f));
  leiste();
  const fehler = await EBENEN.setzen(f.fall, arten.map(({ key, xml }) => ({ key, xml })));
  if (my !== zeichnung || !fehler) return;
  ebenenFehler = fehler;
  EBENEN.marken(marken, $('markieren').checked);
  EBENEN.zeigen(fassung);
  leiste();
}
$('markieren').onchange = () => { EBENEN.marken(marken, $('markieren').checked); leiste(); };
$('einpassen').onclick = () => EBENEN.einpassen();

// ---------- Tasten ----------
// Pfeil hoch und runter gehen durch die Liste, 1 bis 9 wählen die Ebene, M schaltet das Markieren, 0 passt ein; nicht
// beim Tippen, nicht mit Strg, Alt oder Meta, nicht bei offenem Modellierer oder Dialog.
const tippt = t => t && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === 'INPUT' && !/^(checkbox|radio|button)$/.test(t.type)));
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.defaultPrevented || tippt(e.target) || modelerOpen() || $('einfuegen').open) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
    const i = faelle.findIndex(f => f.fall === gewaehlt), j = i + (e.key === 'ArrowDown' ? 1 : -1);
    e.preventDefault();
    if (j >= 0 && j < faelle.length) waehlen(faelle[j].fall);
  } else if (ebeneFuerTaste(arten, e.key)){
    e.preventDefault();
    fassungWaehlen(ebeneFuerTaste(arten, e.key));
  } else if (e.key === 'm' || e.key === 'M'){
    e.preventDefault();
    $('markieren').checked = !$('markieren').checked;
    $('markieren').onchange();
  } else if (e.key === '0'){
    e.preventDefault();
    EBENEN.einpassen();
  }
});
// Die Menüs im Kopf: ein Klick daneben oder auf einen Eintrag schließt sie.
document.addEventListener('click', e => {
  for (const m of document.querySelectorAll('details.menu[open]')) if (!m.contains(e.target) || e.target.closest('.menu-liste button')) m.open = false;
});

// ---------- Meldungen und Downloads ----------
function meldung(text, schlecht){ const m = $('meldung'); m.textContent = text; m.classList.toggle('schlecht', !!schlecht); }
function herunterladen(name, text, type = 'application/json'){
  const a = document.createElement('a');
  a.download = name;
  a.href = URL.createObjectURL(new Blob([text], { type }));
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
// Der Modellierer liegt auf der Leinwand (Story 2.40), nicht über dem Fenster; die Liste bleibt sichtbar.
// Was nicht gespeichert werden konnte, geht als .bpmn in die Downloads, damit nichts verloren ist.
function retten(xml, base, text){
  herunterladen(base + '.bpmn', xml, 'application/xml');
  meldung(text + ' Sie liegt als ' + base + '.bpmn in deinen Downloads.', true);
}
// Ein offener Modellierer mit Änderungen fragt, bevor etwas anderes ihn ersetzt; false: Ben will ihn behalten.
function modelliererFrei(){
  if (modelerOpen()) closeModeler(false);
  return !modelerOpen();
}
$('bearbeiten').onclick = () => {
  const f = faelle.find(x => x.fall === gewaehlt);
  if (!f || !gezeigt || !modelliererFrei()) return;
  openModeler(anzeigeName(f), gezeigt, {
    container: $('leinwand'), fileBase: () => fileBase(f.name), takeLabel: 'Als meine Fassung übernehmen',
    take: async x => {
      let e;
      try { e = await sp.legeFeedback({ fall: f.fall, stand: STAND, bearbeitet: x, geaendert: new Date().toISOString(), soll: null }); }
      catch (err){ retten(x, fileBase(f.name), 'Deine Fassung von ' + anzeigeName(f) + ' ist nicht gespeichert: ' + ((err && err.message) || String(err))); return; }
      bens.set(f.fall, e);
      fassung = 'ben';
      markieren(f);
      // Ben kann während des Bearbeitens in der Liste einen anderen Fall gewählt haben: zurück zum bearbeiteten.
      if (gewaehlt !== f.fall) waehlen(f.fall); else zeigen();
      meldung('Deine Fassung von ' + anzeigeName(f) + ' am Stand ' + STAND + ' gespeichert.');
    },
  });
};
// Zeichnen: ein leerer Modellierer auf der Leinwand; übernommen ist die Zeichnung ein neuer Fall, sie selbst Bens
// Fassung, und der Fall wird angeordnet. Zuerst steht die Zeichnung da, der Vorschlag kommt als Ebene 1 dazu (Ben,
// 2026-10-09).
$('zeichnen-btn').onclick = () => {
  if (!modelliererFrei()) return;
  const name = 'zeichnung-' + new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  openModeler('Neuer Fall', null, {
    container: $('leinwand'), fileBase: x => fileBase(nameAus(x) || name), takeLabel: 'Als neuen Fall übernehmen',
    take: async x => {
      const fehler = zeichnungPruefen(x);
      if (fehler){ meldung(fehler, true); return; }
      let r;
      try { r = await sp.aufnehmen(x, { name: nameAus(x) || name, herkunft: 'eigen', modus: 'neu', stand: STAND }); }
      catch (err){ retten(x, fileBase(nameAus(x) || name), 'Die Zeichnung ist nicht gespeichert: ' + ((err && err.message) || String(err))); return; }
      if (r.fehler){ retten(x, fileBase(nameAus(x) || name), 'Die Zeichnung ist nicht angelegt: ' + r.fehler); return; }
      fassung = 'ben';
      meldung((r.art === 'neu' ? 'Neuer Fall ' : r.art === 'revision' ? 'Neue Revision ' : 'Gehört zu ') + anzeigeName(r.fall) + '. Deine Zeichnung ist deine Fassung; der Vorschlag kommt als Ebene 1, sobald er angeordnet ist.');
      await neu(r.fall.fall);
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
  if (!modelliererFrei() || !window.confirm('Der Arbeitsstand ersetzt alles im Speicher der Werkbank. Laden?')) return;
  // Ein Kommentar, der noch auf sein Speichern wartet, und ein Layout, das läuft, gehören zum Speicher davor.
  clearTimeout(tippen);
  if (laufend) laufend.ctl.abort();
  try { await sp.laden(z); } catch (e){ meldung('Laden fehlgeschlagen: ' + e.message + ' Der Speicher ist unverändert.', true); return; }
  // Die eingebauten Eingaben kommen wieder dazu, wo der Arbeitsstand sie nicht hat; die übrigen sind schon da.
  await eingebauteAufnehmen();
  lauf.clear(); kommentarVon = null; archivVon = null;
  meldung('Arbeitsstand geladen: ' + (z.faelle || []).length + ' Fälle.');
  await neu(gewaehlt);
};

$('import-btn').onclick = () => $('import-datei').click();
$('import-datei').onchange = async () => {
  const file = $('import-datei').files[0];
  $('import-datei').value = '';
  if (!file) return;
  meldung('Lese den Import …');
  if (!modelliererFrei()){ meldung(''); return; }
  let imp;
  try { imp = JSON.parse(await file.text()); } catch { meldung('Import fehlgeschlagen: keine JSON-Datei.', true); return; }
  let r;
  try { r = await sp.importieren(imp); } catch (e){ meldung('Import fehlgeschlagen: ' + e.message, true); return; }
  archivVon = null;
  await neu(gewaehlt);
  meldung('Import geladen: ' + r.neu + ' neue Fälle, ' + r.fassungen + ' Fassungen (Reparatur, kein Soll), ' + r.archiv + ' Einträge im Archiv' + (r.ohneFall ? '; ' + r.ohneFall + ' ohne Fall' : '') + '.');
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
