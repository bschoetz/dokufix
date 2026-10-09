// Der Dokufix BPMN Assistant (dist/bpmn-assistant.html): BPMN-XML einfügen oder als Datei hochladen; oben das
// Original mit seinen eigenen Koordinaten (nur wenn es welche hat), darunter A2 angeordnet, das Modul des Produkts,
// src/app/bpmn-layout.js, mit allen Regeln, mit einem Satz, was die Ansicht ausmacht, Brüchen, Zeit, Großansicht wie
// in dokufix und Download als .bpmn, .svg und .png; ein Fehler steht an Stelle des Diagramms. Dazu die Handreichung für
// LLMs zum Kopieren und Herunterladen, sechs Beispiele und die Diagrammfarben (Vorlagen oder eigene), und die Anordnung
// von bpmn.io zum Vergleich.
//
// Der Einstieg des Skripts der Seite: tools/bpmn-assistant/bauen.mjs bündelt ihn über tools/seiten.mjs mit dem, was er
// importiert, zu einem IIFE in src/bpmn-assistant/index.html. Bis Story 2.38 stand er als Text im Bauskript; was der
// Assistent mit dem Layouter Audi und der Werkbank teilt, liegt seither in src/bpmn-tools/ (Großansicht, Modellierer,
// Downloads, Anordnungen, Dekoration, Farben). Hier bleibt, was nur der Assistent hat: der Farbwähler, die Beispiele,
// das Feld „Name“, die Häkchen, die Abschnitte und render().
//
// Die Beispiele, die Handreichung und die Version von bpmn.io stehen im Datenblock #assistant-data.
import { parseXml } from '../app/xml-parser.js';
import { readProcess } from '../app/bpmn-layout.js';
import { hasCoordinates } from '../app/bpmn.js';
import { pictureOf } from '../app/diagram-downloads.js';
import { showLayoutNotice } from '../app/layout-notice.js';
import { breaksOf } from '../../tests/bpmn-rules.mjs';
import { ICON } from '../bpmn-tools/icons.js';
import { TYPES, PROPS, KEYS, NAMES, HEX, valid, PRESETS, presetOf, migrate, applyTheme as applyThemeCss } from '../bpmn-tools/theme.js';
import { decorate, mergeMarkerOff, modelGraph, signalLines } from '../bpmn-tools/decorate.js';
import { draw as drawPicture, fileBase as baseOf, namesOf, withBackground, bpmnLink, svgLink, pngButton } from '../bpmn-tools/downloads.js';
import { openLarge, closeLarge, registerLargeView } from '../bpmn-tools/large-view.js';
import { openModeler, modelerOpen } from '../bpmn-tools/modeler.js';
import { makeA2Client, makeBalClient } from '../bpmn-tools/layout.js';

const $ = id => document.getElementById(id);
const { beispiele: BEISPIELE, handreichung: HANDREICHUNG, balVersion: BAL_VERSION } = JSON.parse($('assistant-data').textContent);
// Farben der Diagramme: die Vorlagen, die Schlüssel und der Stilblock in src/bpmn-tools/theme.js; hier die Wahl, ihr
// Speicher und der Farbwähler.
const PALETTE = [
  // Grau: OKLab L 0, .20, .295 … .96, 1, neutral
  '#000000', '#161616', '#2c2c2c', '#454545', '#5f5f5f', '#7a7a7a', '#979797', '#b4b4b4', '#d2d2d2', '#f2f2f2', '#ffffff',
  // Dunkel: L .45, C .13 (Braun .06), für Linien und Schrift, auf Weiß 7:1 und mehr
  '#90302e', '#834100', '#665400', '#475f00', '#00672c', '#00635b', '#005f79', '#2b519c', '#5c4295', '#853166', '#6e4d32',
  // Kräftig: L je Farbton (Gelb .88 bis Violett .52), C .14–.22, für Marker und Hervorhebung
  '#e62b34', '#f68000', '#fdd500', '#a1d206', '#00af50', '#00b7a8', '#00b5e4', '#2669ed', '#7640d2', '#d0399c', '#835935',
  // Hell: L .87, C .09, für Füllungen von Aufgaben
  '#ffc3bd', '#ffc7a1', '#efd369', '#c2e289', '#aae5b5', '#8ce8dc', '#95e1ff', '#bed5ff', '#d7ccff', '#ffbde1', '#ebceb7',
  // Sehr hell: L .95, C .035, für Pool, Bahnen und Hintergrund
  '#ffe9e6', '#ffeadc', '#f6efd5', '#e9f3da', '#dff6e2', '#d6f7f1', '#d9f4ff', '#e6efff', '#efebff', '#ffe7f3', '#f9ece1'];
const THEME_KEY = 'bpmn-assistant-farben';
let theme = { preset: 'gelb', ...PRESETS.gelb };
try {
  const t = JSON.parse(localStorage.getItem(THEME_KEY) || 'null');
  const m = t && migrate(t);
  if (m && KEYS.every(k => valid(k, m[k]))) theme = { ...Object.fromEntries(KEYS.map(k => [k, m[k]])), preset: presetOf(m) };
} catch {}
let activeKey = 'task-fill';
// Eigener Farbwähler (Ben, 2026-10-05): er beginnt immer bei der Farbe des
// gewählten Felds. Der des Browsers (unter Linux der GTK-Dialog) beginnt eine
// neue eigene Farbe bei einem festen Rot. Die Fläche zeigt wahlweise HSV
// (Sättigung nach rechts, Helligkeit/Value nach oben) oder HSL (Sättigung nach
// rechts, Helligkeit/Lightness nach oben, die reine Farbe in halber Höhe).
// pickHue: Farbton 0–360; er bleibt bei Grau, Schwarz und Weiß, wie er war.
// pickPos: die Stelle in der Fläche (x, y 0–1) und die Farbe, die sie ergab;
// solange das Feld diese Farbe hat, bleibt der Punkt dort.
const FIELD_KEY = 'bpmn-assistant-farbfeld';
let fieldMode = 'hsv';
try { if (localStorage.getItem(FIELD_KEY) === 'hsl') fieldMode = 'hsl'; } catch {}
let pickHue = 0, pickPos = null;
function hexToHsv(hex){
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d){ h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, max ? d / max : 0, max];
}
function hsvToHex([h, s, v]){
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
function hexToHsl(hex){
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  return [hexToHsv(hex)[0], d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
}
function hslToHex([h, s, l]){
  const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
// Die Farbe an der Stelle (x, y) der Fläche, y von oben.
const colorAt = (x, y) => fieldMode === 'hsl' ? hslToHex([pickHue, x, 1 - y]) : hsvToHex([pickHue, x, 1 - y]);
function themeMsg(text, bad){ const m = $('theme-msg'); m.textContent = text; m.classList.toggle('bad', !!bad); }
const themeStyle = document.createElement('style');
document.head.appendChild(themeStyle);
function applyTheme(){
  applyThemeCss(themeStyle, theme);
  try { localStorage.setItem(THEME_KEY, JSON.stringify(theme)); } catch {}
  syncThemeForm();
}
function setKey(k, v){
  theme = { ...theme, [k]: v.toLowerCase() };
  theme.preset = presetOf(theme);
  applyTheme();
}
const paint = (el, v) => { el.classList.toggle('checker', v === 'transparent'); el.style.background = v === 'transparent' ? '' : v; };
function syncThemeForm(){
  $('theme-name').textContent = 'Aktuell gewählt: ' + (PRESETS[theme.preset] ? PRESETS[theme.preset].name : 'Eigene');
  // Ein Quadrat je Typ: seine Linie, sonst seine Füllung.
  $('theme-sw').replaceChildren(...TYPES.map(([t, n, ps]) => {
    const q = document.createElement('i'), k = t + '-' + (ps.includes('s') ? 'stroke' : 'fill');
    paint(q, theme[k]);
    q.title = [...ps].map(p => n + ' · ' + PROPS[p][1] + ': ' + theme[t + '-' + PROPS[p][0]]).join('\n');
    return q;
  }));
  for (const r of document.querySelectorAll('#theme .presets input')) r.checked = r.value === theme.preset;
  for (const b of document.querySelectorAll('#roles .sw')){
    paint(b, theme[b.dataset.k]);
    b.title = NAMES[b.dataset.k] + ': ' + theme[b.dataset.k];
    b.setAttribute('aria-pressed', String(b.dataset.k === activeKey));
  }
  const v = theme[activeKey], hex = $('pick-hex');
  $('pick-name').textContent = NAMES[activeKey];
  if (document.activeElement !== hex){ hex.value = v; hex.classList.remove('bad'); }
  // Der Farbwähler steht auf der Farbe des Felds (transparent: auf Weiß).
  const c = HEX.test(v) ? v : '#ffffff';
  if (!pickPos || pickPos.hex !== c){
    const [h, s, b] = hexToHsv(c);
    if (s && b) pickHue = h;
    const [, x, y] = fieldMode === 'hsl' ? hexToHsl(c) : [h, s, b];
    pickPos = { x, y: 1 - y, hex: c };
  }
  $('sv').dataset.mode = fieldMode;
  $('sv').style.setProperty('--h', pickHue);
  $('sv-dot').style.left = pickPos.x * 100 + '%'; $('sv-dot').style.top = pickPos.y * 100 + '%';
  $('hue').value = pickHue;
  // Die drei Werte als Zahlen: H in Grad, S und V oder L in Prozent; ein Feld, in dem gerade getippt wird, bleibt.
  $('num3').textContent = fieldMode === 'hsl' ? 'L' : 'V';
  const nums = [pickHue, pickPos.x * 100, (1 - pickPos.y) * 100];
  for (const n of document.querySelectorAll('#nums input')) if (document.activeElement !== n){ n.value = Math.round(nums[n.dataset.i]); n.classList.remove('bad'); }
  for (const b of document.querySelectorAll('#field-mode button')) b.setAttribute('aria-pressed', String(b.dataset.m === fieldMode));
  $('bg-none').checked = theme['bg-fill'] === 'transparent';
  // Die Farben des Themas, je Farbe ein Feld in der Reihenfolge der Tabelle, ohne transparent; beim Darüberfahren, wo sie vorkommt.
  const used = new Map();
  for (const k of KEYS) if (HEX.test(theme[k])) (used.get(theme[k]) || used.set(theme[k], []).get(theme[k])).push(NAMES[k]);
  $('used').replaceChildren(...[...used].map(([c, where]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.style.background = c; b.title = c + '\n' + where.join('\n'); b.setAttribute('aria-label', c);
    b.onclick = () => setKey(activeKey, c);
    return b;
  }));
}
(function buildThemeForm(){
  const pre = document.querySelector('#theme .presets');
  for (const [k, c] of [...Object.entries(PRESETS), ['eigene', { name: 'Eigene' }]]){
    const l = document.createElement('label');
    l.innerHTML = '<input type="radio" name="preset" value="' + k + '"> ' + c.name;
    l.querySelector('input').onchange = () => { if (PRESETS[k]){ theme = { ...PRESETS[k], preset: k }; delete theme.name; applyTheme(); } };
    pre.appendChild(l);
  }
  // Eine Tabelle: eine Zeile je Typ, Spalten Füllung, Linie, Schrift; ein Klick auf ein Feld wählt es.
  const grid = $('roles');
  grid.innerHTML = '<span></span>' + Object.values(PROPS).map(([, n]) => '<span class="colh">' + n + '</span>').join('');
  for (const [t, n, ps] of TYPES){
    const name = document.createElement('span');
    name.textContent = n;
    if (t === 'bg'){
      // Transparent: ohne Fläche hinter dem Diagramm; im Werkzeug als Schachbrett, im SVG ohne Hintergrund.
      const l = document.createElement('label');
      l.innerHTML = '<input type="checkbox" id="bg-none"> transparent';
      let before = '#ffffff';
      l.querySelector('input').onchange = e => {
        activeKey = 'bg-fill';
        if (e.target.checked){ if (HEX.test(theme['bg-fill'])) before = theme['bg-fill']; setKey('bg-fill', 'transparent'); }
        else setKey('bg-fill', before);
      };
      name.appendChild(l);
    }
    grid.appendChild(name);
    for (const p of 'fsli'){
      if (!ps.includes(p)){ grid.appendChild(document.createElement('span')); continue; }
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sw'; b.dataset.k = t + '-' + PROPS[p][0];
      b.setAttribute('aria-label', NAMES[b.dataset.k]);
      b.onclick = () => { activeKey = b.dataset.k; syncThemeForm(); };
      grid.appendChild(b);
    }
  }
  const hex = $('pick-hex');
  hex.oninput = () => { let v = hex.value.trim().toLowerCase(); if (v !== 'transparent' && !v.startsWith('#')) v = '#' + v; const ok = valid(activeKey, v); hex.classList.toggle('bad', !ok); if (ok) setKey(activeKey, v); };
  hex.onblur = () => syncThemeForm();
  // Der eigene Farbwähler: die Fläche (HSV oder HSL), darunter der Farbton.
  const sv = $('sv'), clamp = x => Math.min(1, Math.max(0, x));
  const put = (x, y) => { const hex = colorAt(x, y); pickPos = { x, y, hex }; setKey(activeKey, hex); };
  const fromPointer = e => { const r = sv.getBoundingClientRect(); put(clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)); };
  sv.onpointerdown = e => { sv.setPointerCapture(e.pointerId); fromPointer(e); sv.onpointermove = fromPointer; };
  sv.onpointerup = sv.onpointercancel = () => { sv.onpointermove = null; };
  $('hue').oninput = e => { pickHue = +e.target.value; put(pickPos.x, pickPos.y); };
  for (const n of document.querySelectorAll('#nums input')){
    n.oninput = () => {
      const v = n.value.trim() === '' ? NaN : Number(n.value), max = n.dataset.i === '0' ? 360 : 100;
      const ok = Number.isFinite(v) && v >= 0 && v <= max;
      n.classList.toggle('bad', !ok);
      if (!ok) return;
      if (n.dataset.i === '0'){ pickHue = v; put(pickPos.x, pickPos.y); }
      else if (n.dataset.i === '1') put(v / 100, pickPos.y);
      else put(pickPos.x, 1 - v / 100);
    };
    n.onblur = () => syncThemeForm();
  }
  for (const b of document.querySelectorAll('#field-mode button')) b.onclick = () => {
    fieldMode = b.dataset.m; pickPos = null;
    try { localStorage.setItem(FIELD_KEY, fieldMode); } catch {}
    syncThemeForm();
  };
  // Export und Import als .json: die Farben in der Reihenfolge der Tabelle, dazu ihre Namen zum Lesen.
  $('theme-export').onclick = () => {
    const data = { format: 'dokufix-bpmn-assistant-farben', version: 1, vorlage: PRESETS[theme.preset] ? PRESETS[theme.preset].name : 'Eigene',
      farben: Object.fromEntries(KEYS.map(k => [k, theme[k]])), bedeutung: NAMES };
    const a = document.createElement('a');
    a.download = 'diagrammfarben-' + theme.preset + '.json';
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    themeMsg('Exportiert als ' + a.download + '.');
  };
  $('theme-import').onclick = () => $('theme-file').click();
  $('theme-file').onchange = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      let j;
      try { j = JSON.parse(await f.text()); } catch { throw new Error('keine gültige JSON-Datei.'); }
      if (!j || typeof j !== 'object') throw new Error('Keine Farben gefunden.');
      const t = migrate({ ...(j.farben && typeof j.farben === 'object' ? j.farben : j) });
      const known = KEYS.filter(k => typeof t[k] === 'string');
      if (!known.length) throw new Error('Keine Farben gefunden.');
      const bad = known.filter(k => !valid(k, t[k].trim().toLowerCase()));
      if (bad.length) throw new Error('ungültig: ' + bad.map(k => NAMES[k] + ' (' + t[k] + ')').join(', '));
      // Fehlende Farben bleiben, wie sie sind.
      theme = { ...theme, ...Object.fromEntries(known.map(k => [k, t[k].trim().toLowerCase()])) };
      theme.preset = presetOf(theme);
      applyTheme();
      themeMsg(known.length === KEYS.length ? 'Importiert: ' + f.name + '.' : 'Importiert: ' + known.length + ' von ' + KEYS.length + ' Farben aus ' + f.name + ', die übrigen bleiben.');
    } catch (err){ themeMsg('Import fehlgeschlagen: ' + err.message, true); }
  };
  for (const c of PALETTE){
    const b = document.createElement('button');
    b.type = 'button'; b.style.background = c; b.title = c; b.setAttribute('aria-label', c);
    b.onclick = () => setKey(activeKey, c);
    $('palette').appendChild(b);
  }
  $('theme-btn').onclick = () => { themeMsg(''); syncThemeForm(); $('theme').showModal(); };
  $('theme-reset').onclick = () => { theme = { ...PRESETS.gelb, preset: 'gelb' }; delete theme.name; applyTheme(); };
})();
theme = { ...theme }; delete theme.name;
applyTheme();

// Die Handreichung für LLMs: als .md herunterladen oder in die Zwischenablage kopieren.
$('llm-dl').href = URL.createObjectURL(new Blob([HANDREICHUNG], { type: 'text/markdown;charset=utf-8' }));
$('llm-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(HANDREICHUNG); }
  catch {
    // Ohne Zugriff auf die Zwischenablage (etwa file:// in manchen Browsern): über ein unsichtbares Feld.
    const t = document.createElement('textarea'); t.value = HANDREICHUNG; t.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
  }
  $('llm-ok').textContent = 'kopiert';
  setTimeout(() => { $('llm-ok').textContent = ''; }, 2000);
};
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const stripDi = xml => xml.replace(/<([\w.-]+:)?BPMNDiagram\b[\s\S]*?<\/([\w.-]+:)?BPMNDiagram>\s*/g, '');
const hasDi = xml => /<(?:[\w.-]+:)?BPMNDiagram\b/.test(xml.replace(/<!--[\s\S]*?-->/g, ''));
// Koordinaten hat ein XML, sobald es eine Form trägt: hasCoordinates() der App (src/app/bpmn.js).
let viewers = [], run = 0;
// Der Client des Layouts: ein Worker für die Seite, beim ersten Rendern gemacht. Jedes Rendern bricht das vorige ab,
// auch ein Layout, das noch im Worker läuft.
const LAYOUT = makeA2Client();
let aborter = null;
// Die Anordnung von bpmn.io in ihrem eigenen Worker (src/bpmn-tools/layout.js).
const BAL_LAYOUT = makeBalClient();
try { const s = localStorage.getItem('bpmn-testtool-xml'); if (s) $('xml').value = s; } catch {}
for (const b of [...BEISPIELE].reverse()){
  const k = document.createElement('button');
  k.innerHTML = ICON.doc + ' '; k.append(b.label); k.title = 'Beispiel laden und rendern: ' + b.label;
  k.onclick = () => { $('xml').value = b.xml; render(); };
  $('ex').after(k);
}
$('go').onclick = () => render();
// Das Feld „Name“ (Ben, 2026-10-07; zuerst der Name der Kollaboration, die nicht jedes XML hat): der Name des Modells,
// das Attribut name von definitions; ohne einen der Ersatz der Downloads (namesOf()) als Platzhalter. Geändert (Enter
// oder das Feld verlassen) steht er im Tag von definitions, leer ohne das Attribut; der Rest des XML bleibt, wie er
// ist, und die Seite rendert neu. Ein Tag in einem Kommentar zählt nicht.
const ROOT_TAG = /<((?:[\w.-]+:)?)definitions\b([^>]*?)(\/?)>/;
function setModelName(xml, name){
  const m = ROOT_TAG.exec(xml.replace(/<!--[\s\S]*?-->/g, c => ' '.repeat(c.length)));
  if (!m) return xml;
  let attrs = m[2].replace(/\s+name\s*=\s*("[^"]*"|'[^']*')/, '');
  if (name) attrs += ' name="' + name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') + '"';
  return xml.slice(0, m.index) + '<' + m[1] + 'definitions' + attrs + m[3] + '>' + xml.slice(m.index + m[0].length);
}
function syncName(){
  const n = namesOf($('xml').value);
  $('name').value = n.own;
  $('name').placeholder = n.fallback || 'Diagramm';
}
$('name').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); $('name').blur(); } });
$('name').onchange = () => {
  $('xml').value = setModelName($('xml').value, $('name').value.trim());
  render();
};
$('xml').addEventListener('change', syncName);
syncName();
$('up').onclick = () => $('file').click();
$('file').onchange = async () => {
  const f = $('file').files[0];
  if (!f) return;
  $('xml').value = await f.text();
  $('file').value = '';
  render();
};
$('xml').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); render(); } });
// Das X an zusammenführenden exklusiven Gateways (mergeMarker von appendDiagram(), src/app/bpmn-layout.js): gesetzt wie
// in der App; abgewählt zeichnet A2 solche Gateways als leere Raute. Gemerkt wie die übrigen Einstellungen; eine
// Änderung ordnet neu an wie eine neue Eingabe.
const MERGE_X_KEY = 'bpmn-assistant-merge-x';
try { if (localStorage.getItem(MERGE_X_KEY) === 'aus') $('merge-x').checked = false; } catch {}
$('merge-x').onchange = () => {
  try { localStorage.setItem(MERGE_X_KEY, $('merge-x').checked ? 'an' : 'aus'); } catch {}
  render();
};
// Das Häkchen gilt auch fürs Original (Ben, 2026-10-08), nach der Regel von mergeMarkerOff() (src/bpmn-tools/decorate.js),
// gezählt im Modell, das readProcess() liest; auch im .bpmn-Download und im Modellierer.
// Sprungbögen (src/app/line-jumps.js, Prototyp): gesetzt wie in der App, in Bild und Großansicht; der Modellierer
// zeichnet ohne. Gemerkt wie das Häkchen davor; eine Änderung zeichnet neu.
const JUMPS_KEY = 'bpmn-assistant-sprungboegen';
try { if (localStorage.getItem(JUMPS_KEY) === 'aus') $('jumps').checked = false; } catch {}
$('jumps').onchange = () => {
  try { localStorage.setItem(JUMPS_KEY, $('jumps').checked ? 'an' : 'aus'); } catch {}
  render();
};

// Was jede Ansicht ausmacht, ein Satz unter ihrer Überschrift.
const ABOUT = {
  'Original BPMN': 'Das Diagramm mit den Koordinaten aus der Datei, so wie es gezeichnet wurde.',
  ['bpmn.io (' + BAL_VERSION + ')']: 'Zum Vergleich die Anordnung der Bibliothek bpmn-auto-layout von bpmn.io in der Vorabversion ' + BAL_VERSION + ', unverändert in diese Seite eingebettet: sie liest das XML selbst und setzt Pools, Bahnen, Nachrichtenflüsse und Black Boxes nach eigenen Regeln. Brüche zählt dieselbe Regelprüfung wie bei A2.',
  A2: 'Die Anordnung von dokufix (A2): ein eigener Router auf einem Raster aus Zeilen und Spalten; Gateways und Blöcke zentriert, Zweige einer Entscheidung in eigenen Zeilen, Starts links bündig, Enden rechts, Proben gegen Kreuzungen, Knicke und geteilte Ports; mehrere Pools untereinander, Nachrichtenflüsse senkrecht zwischen ihnen.',
};
function section(title){
  const s = document.createElement('section');
  s.innerHTML = '<h2>' + esc(title) + ' <small></small></h2>' + (ABOUT[title] ? '<p class="about">' + esc(ABOUT[title]) + '</p>' : '');
  $('out').appendChild(s);
  return s;
}
function error(s, msg){ const d = document.createElement('div'); d.className = 'err'; d.textContent = msg; s.appendChild(d); }

// Der Name eines Downloads (src/bpmn-tools/downloads.js): der Name des Modells, ohne ihn sein Ersatz (namesOf()), und
// die Zeit des Klicks.
function fileBase(xml){
  const n = namesOf(xml);
  return baseOf(n.own || n.fallback);
}
// Was jedes Bild und die Großansicht nach dem Import bekommen; die Sprungbögen nach dem Häkchen.
const decorateHere = viewer => decorate(viewer, { jumps: $('jumps').checked });
const titleOf = s => s.querySelector('h2').firstChild.textContent.trim();
// Der Modellierer: „Als Original übernehmen“ setzt das XML ein, rendert und springt nach oben.
function edit(title, xml){
  openModeler(title, xml, { fileBase, take: x => { $('xml').value = x; render(); window.scrollTo({ top: 0 }); } });
}
// Die Großansicht, mit „Bearbeiten“, das den Modellierer öffnet; ihre Tasten nicht, solange der Farbdialog oder der
// Modellierer über ihr liegt.
const large = (title, xml) => openLarge(title, xml, { decorate: decorateHere, edit: () => edit(title, xml) });
registerLargeView(document, { blocked: () => $('theme').open || modelerOpen() });
// Das Bild eines Abschnitts mit .bpmn, .svg (wie in dokufix, pictureOf(), die Farben der Dokumentstile fest
// eingesetzt, mit dem Seitenhintergrund) und .png, dahinter „Im Modellierer bearbeiten“.
async function draw(s, xml, name){
  const pic = await drawPicture(s, xml, { decorate: decorateHere, open: () => large(titleOf(s), xml) });
  const svg = () => withBackground(pictureOf(pic.querySelector('svg')), theme['bg-fill']);
  const dl = document.createElement('span');
  dl.className = 'dls'; dl.append(bpmnLink(() => fileBase(xml), xml, name), svgLink(() => fileBase(xml), svg, name), pngButton(() => fileBase(xml), svg));
  const ed = document.createElement('button');
  ed.className = 'small'; ed.innerHTML = ICON.pencil + ' Im Modellierer bearbeiten';
  ed.onclick = () => edit(titleOf(s), xml);
  s.querySelector('h2').append(dl, ed);
}

async function render(){
  const my = ++run;
  if (aborter) aborter.abort();
  const signal = (aborter = new AbortController()).signal;
  closeLarge();
  for (const v of viewers) try { v.destroy(); } catch {}
  viewers = [];
  $('out').replaceChildren();
  const input = $('xml').value.trim();
  syncName();
  try { localStorage.setItem('bpmn-testtool-xml', input); } catch {}
  if (!input){ error(section('Eingabe'), 'Kein XML.'); return; }
  const xml = hasDi(input) ? stripDi(input) : input;
  // Mit dem Leser des Layouts (src/app/xml-parser.js), wie layoutJob() in der App (src/app/bpmn-layout-job.js), nicht mit
  // dem DOMParser der Seite.
  let doc;
  try { doc = parseXml(xml); } catch (e){ error(section('Eingabe'), 'Das XML ist nicht lesbar:\n' + e.message); return; }
  // Vor dem Original gelesen, denn das Häkchen zum X zählt die Flüsse im Modell; der Fehler erst nach dem Original.
  let read, readError;
  try {
    read = readProcess(doc);
    if (!read) throw new Error('Keine BPMN-Definitionen (das Wurzelelement ist nicht definitions).');
    // Die Spalten gibt LMM, die Beschriftungen misst das Layout selbst (measureLabel(), wie in der App): weder Mermaid
    // noch ein Viewer zum Messen.
  } catch (e){ readError = e; }
  // Zuerst das Original, wenn die Datei eigene Koordinaten hat: so gezeichnet, in der gewählten Palette; sonst kein
  // Abschnitt (Ben, 2026-10-06: „nur noch Original (falls vorhanden) und A2“).
  if (hasCoordinates(input)){
    const orig = section('Original BPMN');
    const own = (read && !$('merge-x').checked && mergeMarkerOff(input, modelGraph(read.model))) || { xml: input, count: 0 };
    if (own.count) orig.querySelector('small').textContent = own.count + (own.count === 1 ? ' zusammenführendes Gateway' : ' zusammenführende Gateways') + ' ohne X';
    try { await draw(orig, own.xml, 'original'); } catch (e){ error(orig, (e && e.message) || String(e)); }
  }
  if (my !== run) return;
  if (readError){ error(section('Eingabe'), readError.message || String(readError)); return; }
  if (read.leftOut.length){
    const d = document.createElement('details');
    d.innerHTML = '<summary>' + read.leftOut.length + ' Elemente nicht angeordnet (wie in der App)</summary>' + read.leftOut.map(l => esc(l.tag + ' ' + (l.id || '') + ': ' + l.reason)).join('<br>');
    $('out').appendChild(d);
  }
  // A2, ein Abschnitt und keine Schleife über Varianten: der Worker der App ordnet nur A2 an, eine zweite Variante
  // bekäme dort still A2s Bild.
  {
    const name = 'A2', s = section(name);
    // Im Worker, wie in der App (layoutJob() in src/app/bpmn-layout-job.js): das Modell in LMMs Ordnung mit seinen
    // Spalten fürs Raster, das des Autors für den Diagrammteil. Solange er rechnet, zählt der Hinweis die Sekunden, und
    // die Seite bleibt bedienbar; nach 120 s gibt der Client auf, mit dem Grund an Stelle des Diagramms.
    const wait = document.createElement('div');
    s.appendChild(wait);
    const notice = showLayoutNotice(wait);
    let laid = null, ms;
    try {
      const t0 = performance.now();
      laid = await LAYOUT.layout(xml, { signal, options: { mergeMarker: $('merge-x').checked } });
      ms = performance.now() - t0;
    } catch (e){
      // Abgebrochen von einem neueren Rendern: dessen Abschnitte stehen schon da.
      if (my !== run) return;
      error(s, (e && e.message) || String(e));
    } finally { notice.stop(); wait.remove(); }
    if (my !== run) return;
    // Abgelehnt (der Grund steht im Abschnitt): weiter mit bpmn.io.
    if (laid) try {
      // Das Modell des Autors, auf der Seite gelesen (read oben), für die Behelfslinien und die Regelprüfung.
      const sig = signalLines(laid.xml, read.model);
      let info = Math.round(ms) + ' ms' + (LAYOUT.withoutWorker() ? ' (ohne Worker)' : ' im Worker') + (sig.count ? ' · ' + sig.count + ' Assoziationen zwischen Flussknoten als Gerade (Behelf)' : '');
      try {
        // Gateways und End-Ereignisse dürfen in jeder Bahn liegen (wie splitBreaks() im Lauf; A2 setzt auch Enden um).
        const breaks = breaksOf(laid.xml, read.model, {}).filter(b => !(b.startsWith('node-outside-lane ') && read.model.nodes.some(n => (n.type === 'gateway' || n.tag === 'endEvent') && n.id === b.split(' ')[1])));
        info = breaks.length + ' Brüche · ' + info;
        if (breaks.length){ const d = document.createElement('details'); d.innerHTML = '<summary>Brüche</summary>' + breaks.map(esc).join('<br>'); s.appendChild(d); }
      } catch (e){ info += ' · Regelprüfung: ' + e.message; }
      s.querySelector('small').textContent = info;
      await draw(s, sig.xml, name);
    } catch (e){ error(s, (e && e.stack) || String(e)); }
    if (my !== run) return;
  }
  // Die Anordnung von bpmn.io (Ben, 2026-10-06), unter A2; die Brüche mit dem Modell, das dokufix liest.
  const title = 'bpmn.io (' + BAL_VERSION + ')', s = section(title);
  const wait = document.createElement('div');
  s.appendChild(wait);
  const notice = showLayoutNotice(wait);
  let res, ms;
  try {
    const t0 = performance.now();
    // layoutProcess() gibt { xml, warnings } zurück; die Warnungen der Bibliothek stehen unter dem Bild.
    res = await BAL_LAYOUT.layout(xml, { signal });
    ms = performance.now() - t0;
  } catch (e){
    if (my === run) error(s, (e && e.message) || String(e));
    return;
  } finally { notice.stop(); wait.remove(); }
  if (my !== run) return;
  try {
    const out = res.xml, warn = res.warnings;
    let info = Math.round(ms) + ' ms' + (BAL_LAYOUT.withoutWorker() ? ' (ohne Worker)' : ' im Worker') + (warn.length ? ' · ' + warn.length + ' Warnungen' : '');
    if (warn.length){ const d = document.createElement('details'); d.innerHTML = '<summary>Warnungen von bpmn.io</summary>' + warn.map(esc).join('<br>'); s.appendChild(d); }
    try {
      // Die Regelprüfung liest das DI in der Form, die dokufix schreibt: ein Element je Zeile, ohne Leerraum vor />.
      const flat = out.replace(/>\s+</g, '><').replace(/\s+\/>/g, '/>');
      const breaks = breaksOf(flat, read.model, {}).filter(b => !(b.startsWith('node-outside-lane ') && read.model.nodes.some(n => (n.type === 'gateway' || n.tag === 'endEvent') && n.id === b.split(' ')[1])));
      info = breaks.length + ' Brüche · ' + info;
      if (breaks.length){ const d = document.createElement('details'); d.innerHTML = '<summary>Brüche</summary>' + breaks.map(esc).join('<br>'); s.appendChild(d); }
    } catch (e){ info += ' · Regelprüfung: ' + e.message; }
    if (my !== run) return;
    s.querySelector('small').textContent = info;
    await draw(s, out, 'bpmn-io');
  } catch (e){ error(s, (e && e.message) || String(e)); }
}