// Die Seite des Layout-Feedbacks (siehe README.md hier). Gebaut von
// feedback-bauen.mjs, das davor SATZ, BEISPIELE und ICON setzt und T bündelt
// (BPMN_VIEWER_CONFIG und addBpmnTypeClasses aus src/app/bpmn.js).
//
// Je Beispiel: das Bild der Anordnung (erst gerendert, wenn es in Sicht
// kommt), der Modellierer, ein Kommentar und, getrennt davon, das Feedback zu
// demselben Beispiel aus früheren Sätzen. Gespeichert in IndexedDB je Satz und
// Beispiel; exportiert als ein JSON-Paket mit allem, was berührt wurde.
/* global BpmnJS, T, SATZ, BEISPIELE, SAETZE, ICON */
const $ = id => document.getElementById(id);
const byName = new Map(BEISPIELE.map(b => [b.name, b]));

// ---------- Speicher: IndexedDB, Schlüssel [satz, name] ----------
const DB_NAME = 'dokufix-layout-feedback', STORE = 'eintraege';
let db = null;
const mem = new Map(); // Ersatz, falls IndexedDB fehlt: nur bis zum Neuladen
function openDb(){
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore(STORE, { keyPath: ['satz', 'name'] }); s.createIndex('name', 'name'); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function tx(mode, fn){
  if (!db) return Promise.resolve(fn(null));
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  });
}
const allEntries = () => db ? tx('readonly', s => s.getAll()) : Promise.resolve([...mem.values()]);
// Ein Eintrag ohne Fassung und ohne Kommentar wird gelöscht.
function putEntry(e){
  const empty = !e.xml && !(e.comment || '').trim();
  if (!db){ const k = e.satz + '\u0000' + e.name; if (empty) mem.delete(k); else mem.set(k, e); return Promise.resolve(); }
  return tx('readwrite', s => empty ? s.delete([e.satz, e.name]) : s.put(e));
}

// state: name → { xml, comment, updated } des aktuellen Satzes; history: name → frühere Einträge
const state = new Map(), history = new Map();
async function load(){
  state.clear(); history.clear();
  for (const e of await allEntries()){
    if (!byName.has(e.name)) continue;
    if (e.satz === SATZ.id) state.set(e.name, e);
    else (history.get(e.name) || history.set(e.name, []).get(e.name)).push(e);
  }
  for (const list of history.values()) list.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}
const entryOf = name => state.get(name) || { satz: SATZ.id, name, variant: SATZ.variant, xml: null, comment: '', updated: null };
async function update(name, patch){
  const e = { ...entryOf(name), ...patch, updated: new Date().toISOString() };
  if (!e.xml && !(e.comment || '').trim()) state.delete(name); else state.set(name, e);
  await putEntry(e);
  refreshMarks(name);
}
const isEdited = name => !!(state.get(name) && state.get(name).xml);
const isCommented = name => !!(state.get(name) && (state.get(name).comment || '').trim());

// ---------- Bilder: ein Viewer außerhalb der Seite, einer nach dem anderen ----------
let queue = Promise.resolve();
function svgOf(xml){
  const job = queue.then(async () => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:4000px;height:3000px;overflow:hidden';
    document.body.appendChild(host);
    const v = new BpmnJS({ container: host, ...T.BPMN_VIEWER_CONFIG });
    try { await v.importXML(xml); T.addBpmnTypeClasses(v); return (await v.saveSVG()).svg; }
    finally { v.destroy(); host.remove(); }
  });
  queue = job.catch(() => {});
  return job;
}
// Die Fassung, die ein Abschnitt zeigt: die bearbeitete, solange es sie gibt und „Erzeugt“ nicht gewählt ist.
const view = new Map();
const shownXml = name => isEdited(name) && view.get(name) !== 'erzeugt' ? state.get(name).xml : byName.get(name).erzeugt;
async function draw(name){
  const sec = $('b-' + name), pic = sec.querySelector('.pic');
  sec.dataset.drawn = '1';
  pic.classList.add('busy');
  try { pic.innerHTML = await svgOf(shownXml(name)); }
  catch (e){ pic.innerHTML = ''; const d = document.createElement('div'); d.className = 'err'; d.textContent = (e && e.message) || String(e); pic.appendChild(d); }
  pic.classList.remove('busy');
  // Die Varianten (Story 2.31), einmal gezeichnet.
  for (const v of sec.querySelectorAll('.vars .pic[data-key]')){
    if (v.dataset.done) continue;
    v.dataset.done = '1';
    const x = byName.get(name).varianten.find(w => w.key === v.dataset.key).erzeugt;
    try { v.innerHTML = await svgOf(x); } catch (e){ v.textContent = (e && e.message) || String(e); }
  }
}
const seen = new IntersectionObserver(items => {
  for (const it of items) if (it.isIntersecting){ seen.unobserve(it.target); draw(it.target.dataset.name); }
}, { rootMargin: '600px 0px' });

// ---------- Abschnitte ----------
const fmt = iso => iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '';
function section(b){
  const sec = document.createElement('section');
  sec.id = 'b-' + b.name; sec.dataset.name = b.name;
  sec.innerHTML = '<h2><span class="nm"></span><small></small><span class="marks"></span></h2>'
    + '<div class="tools"><span class="seg" role="group" aria-label="Fassung"><button type="button" data-v="erzeugt">Erzeugt</button><button type="button" data-v="bearbeitet">Bearbeitet</button></span>'
    + '<button type="button" class="small edit">' + ICON.pencil + ' Im Modellierer bearbeiten</button>'
    + '<a class="btn small dl" title="Die gezeigte Fassung als .bpmn herunterladen">' + ICON.download + ' .bpmn</a>'
    + '<button type="button" class="small undo">Änderung verwerfen</button><button type="button" class="small prev" hidden></button></div>'
    + '<p class="vorher hint" hidden></p>'
    + '<details class="br" hidden><summary></summary></details>'
    + '<div class="dokufix-doc holder"><figure class="dokufix-diagram dokufix-diagram-bpmn"><div class="pic" title="Klicken: Großansicht"></div></figure></div>'
    + '<div class="vars"></div>'
    + '<div class="hist" hidden></div>'
    + '<label class="kl"><span>Kommentar</span><span class="saved hint" aria-live="polite"></span></label><textarea class="kom" rows="3" spellcheck="true" placeholder="Was stimmt nicht, was soll anders sein, warum?"></textarea>';
  sec.querySelector('.nm').textContent = b.name;
  // Die Varianten: je ein Bild mit ihrem Titel, eine gleiche als Zeile.
  const vars = sec.querySelector('.vars');
  for (const v of b.varianten || []){
    if (!v.erzeugt){ const p = document.createElement('p'); p.className = 'same'; p.textContent = v.titel + ': ' + (v.fehlt ? 'nicht angeordnet' : 'gleich wie oben'); vars.appendChild(p); continue; }
    const f = document.createElement('figure'), c = document.createElement('figcaption'), d = document.createElement('div');
    c.textContent = v.titel;
    d.className = 'pic'; d.dataset.key = v.key; d.title = 'Klicken: Großansicht';
    d.onclick = () => openLarge(b.name + ' · ' + v.titel, v.erzeugt, false);
    f.className = 'dokufix-diagram dokufix-diagram-bpmn';
    f.append(c, d);
    const holder = document.createElement('div'); holder.className = 'dokufix-doc holder'; holder.appendChild(f);
    vars.appendChild(holder);
  }
  // Der Zähler der Brüche rot hinterlegt, wenn es welche gibt (Ben, 2026-10-05).
  const small = sec.querySelector('small'), count = document.createElement('span');
  count.textContent = b.breaks === null ? 'Brüche unbekannt' : b.breaks === 1 ? '1 Bruch' : b.breaks + ' Brüche';
  if (b.breaks) count.className = 'brz';
  small.replaceChildren(b.paket + ' · ', count);
  for (const btn of sec.querySelectorAll('.seg button')) btn.onclick = () => { view.set(b.name, btn.dataset.v); refreshMarks(b.name); draw(b.name); };
  sec.querySelector('.edit').onclick = () => openModeler(b.name);
  sec.querySelector('.dl').onclick = e => {
    const a = e.currentTarget;
    a.download = b.name + (isEdited(b.name) && view.get(b.name) !== 'erzeugt' ? '-bearbeitet' : '') + '.bpmn';
    a.href = URL.createObjectURL(new Blob([shownXml(b.name)], { type: 'application/xml' }));
  };
  sec.querySelector('.undo').onclick = async () => {
    if (!window.confirm('Die bearbeitete Fassung von „' + b.name + '“ verwerfen? Der Kommentar bleibt.')) return;
    view.delete(b.name);
    await update(b.name, { xml: null });
    draw(b.name);
  };
  sec.querySelector('.pic').onclick = () => openLarge(b.name, shownXml(b.name), true);
  // Die Brüche der erzeugten Fassung, aufklappbar wie im Assistant.
  if ((b.brueche || []).length){
    const d = sec.querySelector('details.br');
    d.hidden = false;
    d.querySelector('summary').textContent = 'Brüche der erzeugten Fassung (' + b.brueche.length + ')';
    for (const t of b.brueche){ const x = document.createElement('div'); x.textContent = t; d.appendChild(x); }
  }
  // Gegenüber dem letzten früheren Satz: was sich an der erzeugten Fassung geändert hat, und sie selbst zum Ansehen.
  if (b.vorher){
    const ART = { gleich: 'unverändert', bahnen: 'Bild gleich, nur die Bahnzugehörigkeit im XML anders', xml: 'Bild gleich, XML anders', bild: 'Bild anders' };
    const v = sec.querySelector('.vorher');
    v.hidden = false;
    v.textContent = b.vorher.zeile || 'Gegenüber Satz ' + b.vorher.satz + ': ' + ART[b.vorher.art] + '.';
    // Hervorgehoben, wenn sich das Ergebnis geändert hat (Ben, 2026-10-05).
    v.classList.toggle('neu', b.vorher.art !== 'gleich');
    const old = SAETZE[b.vorher.satz] && SAETZE[b.vorher.satz].erzeugt[b.name];
    if (old && b.vorher.art !== 'gleich'){
      const btn = sec.querySelector('.prev');
      btn.hidden = false; btn.textContent = b.vorher.knopf || 'Erzeugt in Satz ' + b.vorher.satz;
      btn.title = 'Die Anordnung aus dem früheren Satz, vor jeder Bearbeitung';
      btn.onclick = () => openLarge(b.name + ' · ' + (b.vorher.titel || 'erzeugt in Satz ' + b.vorher.satz), old, false);
    }
  }
  const kom = sec.querySelector('.kom'), saved = sec.querySelector('.saved');
  kom.value = entryOf(b.name).comment || '';
  let timer = null;
  kom.oninput = () => {
    saved.textContent = '…';
    clearTimeout(timer);
    timer = setTimeout(async () => { await update(b.name, { comment: kom.value }); saved.textContent = 'gespeichert'; }, 400);
  };
  return sec;
}
// Das Feedback zu diesem Beispiel aus früheren Sätzen, nur zum Lesen, getrennt vom Kommentarfeld.
function drawHistory(name){
  const box = $('b-' + name).querySelector('.hist'), list = history.get(name) || [];
  box.hidden = !list.length;
  box.replaceChildren();
  if (!list.length) return;
  const h = document.createElement('div');
  h.className = 'hh'; h.textContent = list.length === 1 ? 'Früheres Feedback' : 'Früheres Feedback (' + list.length + ')';
  box.appendChild(h);
  for (const e of list){
    const item = document.createElement('div');
    item.className = 'hi';
    const meta = document.createElement('div');
    meta.className = 'hint';
    meta.textContent = fmt(e.updated) + ' · Satz ' + e.satz + (e.xml ? ' · bearbeitet' : '');
    item.appendChild(meta);
    if ((e.comment || '').trim()){ const p = document.createElement('p'); p.textContent = e.comment; item.appendChild(p); }
    // Damals erzeugt (vor dem Eingriff, aus dem Archiv der Sätze) und Bens damalige Fassung.
    const row = document.createElement('div');
    row.className = 'hb';
    const old = SAETZE[e.satz] && SAETZE[e.satz].erzeugt[name];
    if (old){
      const g = document.createElement('button');
      g.type = 'button'; g.className = 'small'; g.textContent = 'Damals erzeugt ansehen';
      g.onclick = () => openLarge(name + ' · erzeugt in Satz ' + e.satz, old, false);
      row.appendChild(g);
    }
    if (e.xml){
      const v = document.createElement('button');
      v.type = 'button'; v.className = 'small'; v.textContent = 'Damals bearbeitet ansehen';
      v.onclick = () => openLarge(name + ' · bearbeitet in Satz ' + e.satz, e.xml, false);
      row.appendChild(v);
    }
    if (row.children.length) item.appendChild(row);
    box.appendChild(item);
  }
}
function refreshMarks(name){
  const sec = $('b-' + name);
  if (sec){
    const ed = isEdited(name), ko = isCommented(name);
    sec.querySelector('.marks').innerHTML = (ed ? '<span class="mark">geändert</span>' : '') + (ko ? '<span class="mark">kommentiert</span>' : '');
    sec.querySelector('.seg').hidden = !ed;
    sec.querySelector('.undo').hidden = !ed;
    const v = ed && view.get(name) !== 'erzeugt' ? 'bearbeitet' : 'erzeugt';
    for (const b of sec.querySelectorAll('.seg button')) b.setAttribute('aria-pressed', String(b.dataset.v === v));
    const chip = document.querySelector('#idx a[data-name="' + CSS.escape(name) + '"]');
    if (chip) chip.className = ed || ko ? 'touched' : '';
  }
  counts();
  applyFilter();
}
// Schnellfilter (Ben, 2026-10-05): „anders erzeugt“, wenn die Zeile „Gegenüber Satz …“ gelb ist; „mit Brüchen“,
// wenn die erzeugte Fassung Brüche hat.
const isChanged = b => !!(b.vorher && b.vorher.art !== 'gleich');
const hasBreaks = b => !!b.breaks;
function counts(){
  const n = BEISPIELE.length, ed = BEISPIELE.filter(b => isEdited(b.name)).length, ko = BEISPIELE.filter(b => isCommented(b.name)).length;
  const an = BEISPIELE.filter(isChanged).length, br = BEISPIELE.filter(hasBreaks).length;
  $('counts').textContent = n + (n === 1 ? ' Beispiel' : ' Beispiele') + ' · ' + ed + ' geändert · ' + ko + ' kommentiert · ' + an + ' anders erzeugt · ' + br + ' mit Brüchen';
}
let filter = 'alle';
function applyFilter(){
  for (const b of BEISPIELE){
    const ed = isEdited(b.name), ko = isCommented(b.name);
    const show = filter === 'alle' || (filter === 'geaendert' && ed) || (filter === 'kommentiert' && ko) || (filter === 'offen' && !ed && !ko)
      || (filter === 'anders' && isChanged(b)) || (filter === 'brueche' && hasBreaks(b));
    const sec = $('b-' + b.name);
    if (!sec) continue; // beim Aufbau noch nicht da
    sec.hidden = !show;
    const chip = document.querySelector('#idx a[data-name="' + CSS.escape(b.name) + '"]');
    if (chip) chip.hidden = !show;
  }
  for (const f of document.querySelectorAll('#filter button')) f.setAttribute('aria-pressed', String(f.dataset.f === filter));
}

// ---------- Export und Import ----------
function exportPackage(){
  const touched = BEISPIELE.filter(b => state.has(b.name));
  if (!touched.length){ msg('Noch nichts geändert oder kommentiert.'); return; }
  const pkg = {
    format: 'dokufix-layout-feedback', version: 1, exportiert: new Date().toISOString(), satz: SATZ,
    beispiele: touched.map(b => {
      const e = state.get(b.name);
      return { name: b.name, paket: b.paket, brueche: b.breaks, eingabe: b.eingabe, erzeugt: b.erzeugt, bearbeitet: e.xml || null, kommentar: e.comment || '', geaendert: e.updated };
    }),
  };
  const a = document.createElement('a');
  a.download = 'layout-feedback-' + SATZ.variant.toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.json';
  a.href = URL.createObjectURL(new Blob([JSON.stringify(pkg, null, 1) + '\n'], { type: 'application/json' }));
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  msg('Exportiert: ' + touched.length + (touched.length === 1 ? ' Beispiel' : ' Beispiele') + ' als ' + a.download + '.');
}
async function importPackage(file){
  let pkg;
  try { pkg = JSON.parse(await file.text()); } catch { msg('Import fehlgeschlagen: keine gültige JSON-Datei.', true); return; }
  if (!pkg || pkg.format !== 'dokufix-layout-feedback' || !pkg.satz || !Array.isArray(pkg.beispiele)){ msg('Import fehlgeschlagen: kein Paket des Layout-Feedbacks.', true); return; }
  let n = 0, fremd = 0;
  for (const b of pkg.beispiele){
    if (!b || typeof b.name !== 'string') continue;
    await putEntry({ satz: pkg.satz.id, name: b.name, variant: pkg.satz.variant, xml: b.bearbeitet || null, comment: b.kommentar || '', updated: b.geaendert || pkg.exportiert });
    n++; if (!byName.has(b.name)) fremd++;
  }
  await load();
  for (const b of BEISPIELE){
    const sec = $('b-' + b.name);
    sec.querySelector('.kom').value = entryOf(b.name).comment || '';
    drawHistory(b.name);
    refreshMarks(b.name);
    if (sec.dataset.drawn) draw(b.name);
  }
  const same = pkg.satz.id === SATZ.id;
  msg('Importiert: ' + n + (n === 1 ? ' Beispiel' : ' Beispiele') + (same ? '.' : ' aus Satz ' + pkg.satz.id + '; sie stehen als früheres Feedback bei den Beispielen.') + (fremd ? ' ' + fremd + ' davon gibt es in diesem Satz nicht.' : ''));
}
function msg(text, bad){ const m = $('msg'); m.textContent = text; m.classList.toggle('bad', !!bad); }

// ---------- Großansicht (wie im Assistant) ----------
let large = null;
async function openLarge(title, xml, editable){
  closeLarge();
  const box = document.createElement('div');
  box.id = 'large';
  box.innerHTML = '<div class="lbar"><strong></strong><span class="hint">Strg+Mausrad zoomt, Mausrad und Ziehen verschieben, + und - wechseln die Stufe, Escape schließt</span><span class="steps"><button data-z="fit">Einpassen</button><button data-z="1">100 %</button><button data-z="1.5">150 %</button><button data-z="2">200 %</button></span>'
    + (editable ? '<button class="edit">' + ICON.pencil + ' Bearbeiten</button>' : '') + '<button class="close">Schließen</button></div><div class="dokufix-doc lwrap"><div class="dokufix-diagram dokufix-diagram-bpmn lcanvas"></div></div>';
  box.querySelector('strong').textContent = title;
  document.body.appendChild(box);
  document.documentElement.style.overflow = 'hidden';
  const viewer = new BpmnJS({ container: box.querySelector('.lcanvas'), ...T.BPMN_VIEWER_CONFIG });
  large = { box, viewer };
  box.querySelector('.close').onclick = closeLarge;
  if (editable) box.querySelector('.edit').onclick = () => { closeLarge(); openModeler(title); };
  for (const b of box.querySelectorAll('.steps button')) b.onclick = () => step(b.dataset.z);
  try {
    await viewer.importXML(xml);
    T.addBpmnTypeClasses(viewer);
    step('fit');
    viewer.on('canvas.viewbox.changed', () => mark());
  } catch (e){ closeLarge(); alert(e.message); }
}
const STEPS = ['fit', '1', '1.5', '2'];
function step(z){
  if (!large) return;
  const c = large.viewer.get('canvas');
  if (z === 'fit') c.zoom('fit-viewport', 'auto');
  else { const vb = c.viewbox(); c.zoom(Number(z), { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 }); }
  large.step = z; large.zoom = c.zoom();
  mark();
}
function mark(){
  if (!large) return;
  if (Math.abs(large.viewer.get('canvas').zoom() - large.zoom) > 1e-3) large.step = null;
  for (const b of large.box.querySelectorAll('.steps button')) b.setAttribute('aria-pressed', String(b.dataset.z === large.step));
}
function closeLarge(){
  if (!large) return;
  try { large.viewer.destroy(); } catch {}
  large.box.remove(); large = null;
  document.documentElement.style.overflow = '';
}
document.addEventListener('keydown', e => {
  if (!large || modeler) return;
  if (e.key === 'Escape'){ e.preventDefault(); closeLarge(); }
  else if (e.key === '+' || e.key === '-'){
    e.preventDefault();
    let i = STEPS.indexOf(large.step);
    if (i < 0){ const z = large.viewer.get('canvas').zoom(); i = z < 1 ? 0 : z < 1.25 ? 1 : z < 1.75 ? 2 : 3; }
    step(STEPS[Math.max(0, Math.min(STEPS.length - 1, i + (e.key === '+' ? 1 : -1)))]);
  }
});

// ---------- Modellierer (bpmn-js Modeler 18.31.0, beim ersten Öffnen geladen) ----------
const MODELER_CDN = 'https://cdn.jsdelivr.net/npm/bpmn-js@18.31.0/dist/';
let Modeler = null, modeler = null;
function loadModeler(){
  if (Modeler) return Promise.resolve(Modeler);
  for (const css of ['assets/bpmn-js.css', 'assets/bpmn-font/css/bpmn-embedded.css']){
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = MODELER_CDN + css; document.head.appendChild(l);
  }
  const Viewer = window.BpmnJS;
  return new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = MODELER_CDN + 'bpmn-modeler.production.min.js';
    sc.onload = () => { Modeler = window.BpmnJS; window.BpmnJS = Viewer; resolve(Modeler); };
    sc.onerror = () => { window.BpmnJS = Viewer; reject(new Error('Der Modellierer konnte nicht geladen werden (keine Verbindung zum CDN?).')); };
    document.head.appendChild(sc);
  });
}
// Öffnet die gezeigte Fassung; „Übernehmen“ speichert sie als bearbeitete Fassung des Beispiels.
async function openModeler(name){
  closeModeler(true);
  const box = document.createElement('div');
  box.id = 'modeler';
  box.innerHTML = '<div class="mbar"><strong></strong><span class="hint">Elemente ziehen, verbinden, doppelklicken zum Beschriften; Strg+Z macht rückgängig.</span>'
    + '<button class="primary take">' + ICON.check + ' Übernehmen</button><button class="dl">' + ICON.download + ' als .bpmn herunterladen</button><button class="close">Schließen</button></div><div class="mcanvas"></div>';
  box.querySelector('strong').textContent = 'Modellierer: ' + name;
  document.body.appendChild(box);
  document.documentElement.style.overflow = 'hidden';
  modeler = { box, m: null, dirty: false };
  box.querySelector('.close').onclick = () => closeModeler(false);
  try {
    const M = await loadModeler();
    if (!modeler || modeler.box !== box) return;
    const m = new M({ container: box.querySelector('.mcanvas'), keyboard: { bindTo: document } });
    modeler.m = m;
    await m.importXML(shownXml(name));
    m.get('canvas').zoom('fit-viewport', 'auto');
    m.on('commandStack.changed', () => { if (modeler) modeler.dirty = true; });
  } catch (e){
    const d = document.createElement('div'); d.className = 'err'; d.style.margin = '16px'; d.textContent = (e && e.message) || String(e);
    box.querySelector('.mcanvas').replaceChildren(d);
    return;
  }
  const current = async () => (await modeler.m.saveXML({ format: true })).xml;
  box.querySelector('.take').onclick = async () => {
    const x = await current();
    closeModeler(true);
    view.delete(name);
    await update(name, { xml: x });
    draw(name);
    $('b-' + name).scrollIntoView({ block: 'start' });
  };
  box.querySelector('.dl').onclick = async () => {
    const a = document.createElement('a');
    a.download = name + '-bearbeitet.bpmn';
    a.href = URL.createObjectURL(new Blob([await current()], { type: 'application/xml' }));
    a.click();
  };
}
function closeModeler(force){
  if (!modeler) return;
  if (!force && modeler.dirty && !window.confirm('Ihre Änderungen im Modellierer gehen verloren. Trotzdem schließen?')) return;
  try { modeler.m && modeler.m.destroy(); } catch {}
  modeler.box.remove(); modeler = null;
  document.documentElement.style.overflow = '';
}

// ---------- Start ----------
(async function start(){
  try { db = await openDb(); }
  catch { msg('Der Browser erlaubt hier keinen dauerhaften Speicher (IndexedDB). Änderungen gelten nur bis zum Neuladen; vorher exportieren.', true); }
  await load();
  $('meta').textContent = 'Variante ' + SATZ.variant + ' · Satz ' + SATZ.id + ' · angeordnet ' + fmt(SATZ.angeordnet);
  const idx = $('idx'), out = $('out');
  for (const b of BEISPIELE){
    const a = document.createElement('a');
    a.href = '#b-' + b.name; a.dataset.name = b.name; a.textContent = b.name;
    idx.appendChild(a);
    const sec = section(b);
    out.appendChild(sec);
    drawHistory(b.name);
    refreshMarks(b.name);
    seen.observe(sec);
  }
  for (const f of document.querySelectorAll('#filter button')) f.onclick = () => { filter = f.dataset.f; applyFilter(); };
  $('export').onclick = exportPackage;
  $('import').onclick = () => $('file').click();
  $('file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await importPackage(f); };
  counts();
  applyFilter();
})();
