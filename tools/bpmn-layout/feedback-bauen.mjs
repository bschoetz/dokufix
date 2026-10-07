// Baut die Seite des Layout-Feedbacks (aus Spike 2.26 im Store übernommen, 2026-10-07, auf LMM umgestellt): die
// Anordnungen eines Laufs (lauf.mjs) für eine Auswahl von Beispielen untereinander, je mit Bild, Modellierer,
// Kommentar und früherem Feedback; Export als ein JSON-Paket, das feedback-auswerten.mjs liest.
//
//   node tools/bpmn-layout/feedback-bauen.mjs [--lauf <lauf>] [--art A|Pools] [--satz s,s] [--gegen <satz-id>]
//                                             [--ziel <datei.html>] [--varianten <datei.json>] [--alle | name…]
//
// --lauf       der Lauf, Vorgabe "produkt"; vorher lauf.mjs laufen lassen, wenn sich das Layout geändert hat
// --art        A (die Sammlung) oder Pools (Stories 2.12, 2.29 bis 2.31); die Art trennt die Archive, damit früheres
//              Feedback beim Beispiel steht. Vorgabe: Pools, wenn alle gewählten Eingaben aus den Pool-Sätzen
//              stammen, sonst A. Der Name A blieb von A2, dem Layout aus Spike 2.26. Eine andere Art, etwa LMM,
//              nur mit genannten Eingaben, auf bpmn-feedback-<art>.html
// --satz       alle Eingaben dieser Sätze (sauber, ben, extern, pools, blackbox, angeheftet, notizen)
// --gegen      vergleicht mit diesem Satz des Archivs statt mit dem letzten, zu dem Feedback kam
// --ziel       der Name der Seite in arbeit/, Vorgabe bpmn-feedback.html (A) und bpmn-feedback-pools.html (Pools)
// --varianten  weitere Anordnungen derselben Beispiele, je Beispiel unter dem Bild als eigenes Bild, zum
//              Entscheiden mit Bild: { "hinweis": "…", "varianten": [{ "key", "titel", "dir" }] }, dir relativ zu
//              arbeit/ mit <name>.bpmn je Beispiel, etwa ein anderer Lauf. Eine Variante, deren Anordnung der gezeigten
//              gleicht, steht nur als Zeile da.
// --alle       alle Eingaben des Laufs
//
// Ohne Namen die Sammlung (A: Ben, 2026-10-05) oder die Pool-Sätze mit Brüchen (Pools), dazu jede Eingabe, die je
// in einem Satz dieser Art war: Diagramme verschwinden nie ohne Bens Wort. Die Satz-Kennung (Art und Prüfsumme über
// die Anordnungen) trennt das Feedback zu verschiedenen Läufen; früheres steht beim Beispiel.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as esbuild from 'esbuild';
import { HERE, REPO, ARBEIT, INPUTS, POOL_SAETZE, namesOf, readInput, readLauf, laufDir, laufFile } from './lib.mjs';

const ERSTE_AUSWAHL = ['onboarding', 'rechnungsfreigabe', 'reklamation', 'urlaubsantrag', 'hund2', 'hund', 'ref3', 'ref4', 'ref8', 'demo2', 'demo3', 'demo5', 'demo6', 'mehrere', 'zwei', 'mitte', 'ereignis', 'reparatur'];

const argv = process.argv.slice(2);
let laufName = 'produkt', art = null, saetze = null;
const names = [];
let alle = false, gegen = null, ziel = null, varianten = null;
for (let i = 0; i < argv.length; i++){
  if (argv[i] === '--lauf') laufName = argv[++i];
  else if (argv[i] === '--art') art = argv[++i];
  else if (argv[i] === '--satz') saetze = argv[++i].split(',');
  else if (argv[i] === '--gegen') gegen = argv[++i];
  else if (argv[i] === '--alle') alle = true;
  else if (argv[i] === '--ziel') ziel = argv[++i];
  else if (argv[i] === '--varianten') varianten = JSON.parse(fs.readFileSync(argv[++i], 'utf8'));
  else names.push(argv[i]);
}
const lauf = readLauf(laufName);
const isPool = n => POOL_SAETZE.includes((INPUTS.get(n) || {}).set);
const explicit = names.length ? names : saetze ? namesOf(saetze) : alle ? Object.keys(lauf.inputs) : null;
if (!art) art = explicit && explicit.length && explicit.every(isPool) ? 'Pools' : 'A';
// Eine andere Art (etwa LMM, review-lmm.mjs) hat ihr eigenes Archiv und nimmt nur genannte Eingaben.
if (!['A', 'Pools'].includes(art) && !explicit) throw new Error('Art ' + art + ': nur mit Namen, --satz oder --alle');
if (!ziel) ziel = art === 'Pools' ? 'bpmn-feedback-pools.html' : art === 'A' ? 'bpmn-feedback.html' : 'bpmn-feedback-' + art.toLowerCase() + '.html';
const ofArt = n => art === 'Pools' ? isPool(n) : !isPool(n);
// Das Archiv der Sätze (arbeit/archiv/<satz>.json) und die Auswertungen (arbeit/feedback/<satz>-<datum>/).
const ARCHIV = path.join(ARBEIT, 'archiv');
const FEEDBACK = path.join(ARBEIT, 'feedback');
fs.mkdirSync(ARCHIV, { recursive: true });
const archiv = fs.readdirSync(ARCHIV).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(ARCHIV, f), 'utf8')));
const mitFeedback = new Set(fs.existsSync(FEEDBACK) ? fs.readdirSync(FEEDBACK).map(d => d.replace(/-\d{4}-\d{2}-\d{2}$/, '')) : []);

// Die Sammlung: die erste Auswahl und, auf Bens Wunsch (2026-10-05, bei R10 und R5), drei externe Referenzen.
// ref4, ref8 und demo3 sind zu trivial (Ben, 2026-10-05, Paket zu a-defa9c74); an ihrer Stelle die drei größten
// Eingaben, die noch nicht in der Sammlung waren: r18, x-miwg4, x-wv6. Dazu u13 (Ben, 2026-10-05: der neue Bruch durch R12) und Bens morgenroutine und krankheit; dazu jede externe Eingabe mit Brüchen (Ben, 2026-10-05: x-dg2, x-miwg3, x-rg1, x-rg3; x-wv6 ist schon drin).
const TRIVIAL = ['ref4', 'ref8', 'demo3'];
const SAMMLUNG = art === 'Pools' ? [] : [...ERSTE_AUSWAHL.filter(n => !TRIVIAL.includes(n)), 'x-rg2', 'x-wv4', 'x-wv3', 'r18', 'x-miwg4', 'x-wv6', 'u13', 'morgenroutine', 'x-dg2', 'x-miwg3', 'x-rg1', 'x-rg3', 'krankheit'];
// Dazu jede Eingabe dieser Art, deren erzeugte Fassung Brüche hat (Ben, 2026-10-05: „generell alle diagramme mit brüchen“).
const MIT_BRUECHEN = Object.keys(lauf.inputs).filter(n => ofArt(n) && (lauf.inputs[n].breaks || []).length && !SAMMLUNG.includes(n));
// Und alles, was je auf einer Seite dieser Art war, damit beim Review nichts herausfällt, das sich geändert hat, etwa
// weil es keine Brüche mehr hat (Ben, 2026-10-05: „bitte keine diagramme entfernen, außer ich sage es. VOR ALLEM WENN
// SIE SICH GEÄNDERT HABEN“): jedes, das je in einem Satz war, bleibt; nur TRIVIAL nicht.
const VORHER = [...new Set(archiv.filter(x => x.variant === art).flatMap(x => Object.keys(x.erzeugt)))].filter(n => lauf.inputs[n] && !TRIVIAL.includes(n));
const chosen = explicit || [...new Set([...SAMMLUNG, ...MIT_BRUECHEN, ...VORHER])];
const paketOf = n => { const i = INPUTS.get(n) || {}; return i.extern ? 'extern' : ERSTE_AUSWAHL.includes(n) || i.set === 'ben' ? 'Handbuch und Beispiele' : isPool(n) ? i.set : 'erzeugt'; };
// Die Brüche wie im Assistant: je Bruch die Regel und die beteiligten Elemente, hier mit ihrem Namen
// (sonst der Id) aus dem XML, damit sie im Bild zu finden sind.
function bruchListe(breaks, xml){
  const ART = { sequenceFlow: 'Fluss', messageFlow: 'Nachrichtenfluss', exclusiveGateway: 'exklusives Gateway', parallelGateway: 'paralleles Gateway', inclusiveGateway: 'inklusives Gateway', eventBasedGateway: 'ereignisbasiertes Gateway', complexGateway: 'komplexes Gateway', startEvent: 'Startereignis', endEvent: 'Endereignis', intermediateCatchEvent: 'Zwischenereignis', intermediateThrowEvent: 'Zwischenereignis', boundaryEvent: 'angeheftetes Ereignis', lane: 'Bahn', participant: 'Pool' };
  const el = new Map();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?(\w+)\b[^>]*?\sid="([^"]+)"[^>]*>/g)){
    const at = k => { const r = new RegExp('\\s' + k + '="([^"]*)"').exec(m[0]); return r ? r[1].replace(/&#10;|\s+/g, ' ').trim() : ''; };
    if (!el.has(m[2])) el.set(m[2], { tag: m[1], name: at('name'), from: at('sourceRef'), to: at('targetRef') });
  }
  const plain = id => { const e = el.get(id); if (!e) return id; return e.name ? '„' + e.name + '“' : (ART[e.tag] || (/Task$/.test(e.tag) ? 'Aufgabe' : e.tag)) + ' ohne Namen'; };
  const label = id => {
    const e = el.get(id);
    if (e && (e.tag === 'sequenceFlow' || e.tag === 'messageFlow')) return (ART[e.tag]) + (e.name ? ' „' + e.name + '“' : '') + ' (' + plain(e.from) + ' → ' + plain(e.to) + ')';
    return plain(id);
  };
  return breaks.map(b => { const [rule, ...ids] = b.split(' '); return rule + ': ' + ids.map(label).join('; '); });
}
const beispiele = [];
for (const name of chosen){
  const file = path.join(laufDir(laufName), name + '.bpmn');
  if (!fs.existsSync(file)){ console.log('übersprungen (keine Anordnung):', name); continue; }
  const row = lauf.inputs[name] || {};
  const x = fs.readFileSync(file, 'utf8');
  beispiele.push({ name, paket: paketOf(name), breaks: Array.isArray(row.breaks) ? row.breaks.length : null, brueche: Array.isArray(row.breaks) ? bruchListe(row.breaks, x) : [], eingabe: readInput(name).xml, erzeugt: x });
}
if (!beispiele.length) throw new Error('Keine Beispiele.');
// Die Varianten je Beispiel: ihre Anordnung, oder null, wo sie der gezeigten gleicht.
if (varianten) for (const b of beispiele) b.varianten = varianten.varianten.map(v => {
  const file = path.join(ARBEIT, v.dir, b.name + '.bpmn');
  const x = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  return { key: v.key, titel: v.titel, erzeugt: x === b.erzeugt ? null : x, fehlt: !x };
});
const hash = crypto.createHash('sha1');
for (const b of beispiele) hash.update(b.name + '\0' + b.erzeugt + '\0');
// Die Logik eines Satzes: die Prüfsumme des Laufs über die Module des Layouts (lib.mjs, loadStand()). Verglichen wird
// mit dem letzten früheren Satz anderer Logik, damit ein Neubau ohne Regeländerung (etwa eine größere Sammlung) die
// Änderung des letzten Patches nicht verdeckt.
const satz = {
  id: art.toLowerCase() + '-' + hash.digest('hex').slice(0, 8), variant: art, rules: lauf.rules || null,
  angeordnet: lauf.angeordnet || fs.statSync(laufFile(laufName)).mtime.toISOString(), beispiele: beispiele.map(b => b.name), logik: lauf.logik,
};

// Der aktuelle Satz kommt beim Bauen ins Archiv. Für die Auswahl eingebettet werden alle früheren Sätze derselben
// Art, damit Ben das damals Erzeugte ansehen kann (vor seinem Eingriff) und sieht, was sich gegenüber dem letzten
// Satz geändert hat.
const archivFile = path.join(ARCHIV, satz.id + '.json');
if (!fs.existsSync(archivFile)) fs.writeFileSync(archivFile, JSON.stringify({ id: satz.id, variant: satz.variant, logik: satz.logik, angeordnet: satz.angeordnet, erzeugt: Object.fromEntries(beispiele.map(b => [b.name, b.erzeugt])) }) + '\n');
const frueher = archiv.filter(x => x.id !== satz.id && x.variant === satz.variant).sort((p, q) => q.angeordnet.localeCompare(p.angeordnet));
const SAETZE = Object.fromEntries(frueher.map(x => [x.id, { angeordnet: x.angeordnet, erzeugt: Object.fromEntries(beispiele.filter(b => x.erzeugt[b.name]).map(b => [b.name, x.erzeugt[b.name]])) }]));
// Gegenüber dem letzten früheren Satz mit diesem Beispiel: gleich, nur die Bahnzugehörigkeit oder sonst das
// Prozess-XML anders (Bild gleich), oder das Bild anders (das DI).
const block = (xml, tag) => (new RegExp('<(?:[\\w.-]+:)?' + tag + '\\b[\\s\\S]*?</(?:[\\w.-]+:)?' + tag + '\\s*>').exec(xml) || [''])[0];
// Verglichen wird mit dem letzten Satz, zu dem Ben Feedback geschickt hat (Ben, 2026-10-05: „was sich seit
// meinem Feedback geändert hat“; erkannt am Ordner der Auswertung arbeit/feedback/<satz>-<datum>/), oder mit dem
// Satz aus --gegen. Ein Beispiel, das dort nicht dabei war, wie bisher mit dem letzten Satz anderer Logik.
const bezug = gegen ? frueher.find(x => x.id === gegen) : frueher.find(x => mitFeedback.has(x.id));
if (gegen && !bezug) throw new Error('Satz ' + gegen + ' ist nicht im Archiv.');
for (const b of beispiele){
  const vor = bezug && bezug.erzeugt[b.name] ? bezug : frueher.find(x => x.erzeugt[b.name] && x.logik !== satz.logik);
  if (!vor) continue;
  const alt = vor.erzeugt[b.name];
  const art = alt === b.erzeugt ? 'gleich' : block(alt, 'BPMNDiagram') !== block(b.erzeugt, 'BPMNDiagram') ? 'bild' : block(alt, 'laneSet') !== block(b.erzeugt, 'laneSet') ? 'bahnen' : 'xml';
  // Ein Vergleichssatz kann Knopf, Titel der Großansicht und je Beispiel die Zeile selbst benennen.
  b.vorher = { satz: vor.id, art, knopf: vor.knopf || null, titel: vor.titel || null, zeile: (vor.zeilen || {})[b.name] || null };
}

const bundle = (await esbuild.build({
  stdin: { contents: `import { BPMN_VIEWER_CONFIG, addBpmnTypeClasses } from './src/app/bpmn.js'; window.T = { BPMN_VIEWER_CONFIG, addBpmnTypeClasses };`, resolveDir: REPO, loader: 'js' },
  bundle: true, format: 'iife', write: false, charset: 'utf8', logLevel: 'silent',
})).outputFiles[0].text;
const dist = fs.readFileSync(path.join(REPO, 'dist/dokufix.html'), 'utf8');
const docCss = /<style id="dokufix-doc-css">([\s\S]*?)<\/style>/.exec(dist)[1];
const seite = fs.readFileSync(path.join(HERE, 'feedback-seite.js'), 'utf8');

const svgIcon = d => '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const ICON = {
  pencil: svgIcon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
  upload: svgIcon('<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>'),
  download: svgIcon('<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>'),
  check: svgIcon('<path d="M5 12l5 5L20 7"/>'),
};
// JSON in einem <script>: ein „<“ als <, damit kein </script> darin steht.
const data = v => JSON.stringify(v).replace(/</g, '\\u003c');

const css = `
:root{--bg:#fff;--fg:#1d1d1f;--mute:#6e6e73;--line:#e5e5ea;--acc:#0066cc;--err:#a50e0e;--errbg:#fce8e6}
*{box-sizing:border-box}
[hidden]{display:none !important}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:28px 40px 0}
h1{font-size:24px;font-weight:650;letter-spacing:-.01em;margin:0}
.tag{color:var(--mute);margin:4px 0 0;max-width:820px}
#meta{color:var(--mute);font-size:13px;margin:6px 0 0}
.top{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line);padding:12px 40px;display:flex;gap:10px 16px;align-items:center;flex-wrap:wrap}
#counts{font-size:14px}
#msg{flex:1 1 200px;color:var(--mute);font-size:13px}
#msg.bad{color:var(--err)}
#idx{display:flex;flex-wrap:wrap;gap:4px 12px;padding:12px 40px 0;font-size:13px}
#idx a{color:var(--mute);text-decoration:none}
#idx a:hover{color:var(--acc)}
#idx a.touched{color:var(--fg);font-weight:600}
main{padding:0 40px 48px}
@media (max-width:700px){header,.top,#idx,main{padding-left:16px;padding-right:16px}}
section{border-top:1px solid var(--line);padding:22px 0 14px;scroll-margin-top:64px}
section:first-child{border-top:0}
h2{font-size:17px;font-weight:650;margin:0 0 8px;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
h2 small{font-weight:400;color:var(--mute);font-size:13px}
.marks{display:inline-flex;gap:6px}
.mark{font-size:12px;font-weight:600;color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:0 8px}
.tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 10px}
button,a.btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;font:inherit;font-size:14px;color:var(--fg);background:#fff;border:1px solid #d2d2d7;border-radius:7px;cursor:pointer;text-decoration:none;white-space:nowrap}
button:hover,a.btn:hover{background:#f5f5f7}
button:focus-visible,a.btn:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
button.primary{background:var(--acc);border-color:var(--acc);color:#fff;font-weight:600}
button.primary:hover{background:#0055aa}
button.small,a.btn.small{height:28px;padding:0 10px;font-size:13px;font-weight:400}
.ic{flex:none}
.seg{display:inline-flex}
.seg[hidden]{display:none}
.seg button,#filter button{height:28px;padding:0 10px;font-size:13px;border-radius:0;margin-left:-1px}
.seg button:first-child,#filter button:first-child{border-radius:7px 0 0 7px;margin-left:0}
.seg button:last-child,#filter button:last-child{border-radius:0 7px 7px 0}
.seg button[aria-pressed=true],#filter button[aria-pressed=true]{background:#1d1d1f;border-color:#1d1d1f;color:#fff}
#filter{display:inline-flex}
.holder{max-width:none;margin:0;padding:0}
.holder figure{margin:0}
.pic{cursor:zoom-in;border:1px solid var(--line);border-radius:8px;padding:8px;background:#fff;min-height:120px}
.pic.busy{opacity:.5}
.pic svg{display:block;max-width:100%;height:auto}
.err{background:var(--errbg);color:var(--err);padding:10px 12px;border-radius:8px;white-space:pre-wrap;font:13px/1.4 ui-monospace,monospace}
.hint{color:var(--mute);font-size:13px}
.vars{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:12px;margin:10px 0 0}
.vars figure{margin:0}
.vars figcaption{font-size:13px;font-weight:600;margin:0 0 4px}
.vars .same{font-size:13px;color:var(--mute);margin:0;grid-column:1/-1}
.vhint{max-width:900px;margin:8px 0 0;font-size:14px}
.hist{margin:12px 0 0;padding:0 0 0 12px;border-left:3px solid var(--line)}
.hist .hh{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);margin:0 0 4px}
.hist .hi{margin:0 0 10px}
.hist .hb{display:flex;gap:8px;flex-wrap:wrap}
.brz{color:var(--err);background:var(--errbg);border-radius:4px;padding:1px 6px;font-weight:600}
.vorher{margin:-4px 0 10px}
.vorher.neu{display:inline-block;color:var(--fg);background:#fff1b8;border-radius:4px;padding:1px 8px}
details.br{font-size:13px;color:var(--mute);margin:-4px 0 10px}
details.br summary{cursor:pointer}
details.br div{margin:2px 0 0 14px}
.hist p{margin:2px 0 6px;white-space:pre-wrap;font-size:14px}
.kl{display:flex;gap:10px;align-items:baseline;margin:12px 0 4px;font-size:13px;font-weight:600}
.kom{width:100%;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;padding:8px 10px;border:1px solid var(--line);border-radius:8px;resize:vertical}
.kom:focus{outline:2px solid var(--acc);outline-offset:-1px}
#large{position:fixed;inset:0;z-index:10;background:#fff;display:flex;flex-direction:column}
#large .lbar,#modeler .mbar{display:flex;gap:12px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
#large .lbar strong,#modeler .mbar strong{font-size:17px}
#large .lbar .hint,#modeler .mbar .hint{flex:1}
#large .steps{display:flex}#large .steps button{border-radius:0;margin-left:-1px}#large .steps button:first-child{border-radius:7px 0 0 7px;margin-left:0}#large .steps button:last-child{border-radius:0 7px 7px 0}
#large .steps button[aria-pressed=true]{background:var(--acc);color:#fff;border-color:var(--acc)}
#large .lwrap{flex:1;max-width:none;margin:0;padding:0;min-height:0;display:flex}
#large .lcanvas{flex:1;min-height:0}
#modeler{position:fixed;inset:0;z-index:20;background:#fff;display:flex;flex-direction:column}
#modeler .mcanvas{flex:1;min-height:0;position:relative}
`;

const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dokufix Layout-Feedback</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bpmn-js@18.31.0/dist/assets/diagram-js.css">
<script src="https://cdn.jsdelivr.net/npm/bpmn-js@18.31.0/dist/bpmn-navigated-viewer.production.min.js"></script>
<style>${docCss}</style>
<style>${css}</style>
</head>
<body>
<header>
<h1>Dokufix Layout-Feedback</h1>
<p class="tag">Die Anordnungen einer Variante sichten, im Modellierer verbessern und kommentieren. Das Paket mit allem, was geändert oder kommentiert ist, geht zum Nachschärfen der Regeln zurück.</p>
<p id="meta"></p>
${varianten && varianten.hinweis ? '<p class="vhint">' + varianten.hinweis + '</p>' : ''}
</header>
<div class="top">
<span id="counts"></span>
<span id="filter" role="group" aria-label="Filter"><button type="button" data-f="alle">Alle</button><button type="button" data-f="geaendert">Geändert</button><button type="button" data-f="kommentiert">Kommentiert</button><button type="button" data-f="offen">Offen</button><button type="button" data-f="anders">Anders erzeugt</button><button type="button" data-f="brueche">Mit Brüchen</button></span>
<span id="msg" role="status"></span>
<button type="button" id="import" title="Ein Paket laden, etwa aus einem anderen Browser">${ICON.upload} Paket importieren</button><input type="file" id="file" accept=".json,application/json" hidden>
<button type="button" class="primary" id="export" title="Alles Geänderte und Kommentierte als .json herunterladen">${ICON.download} Paket exportieren</button>
</div>
<nav id="idx" aria-label="Beispiele"></nav>
<main id="out"></main>
<script>${bundle}</script>
<script>const SATZ = ${data(satz)}; const BEISPIELE = ${data(beispiele)}; const SAETZE = ${data(SAETZE)}; const ICON = ${data(ICON)};</script>
<script>${seite}</script>
</body>
</html>
`;
// Die Seite liegt in arbeit/, neben dem Archiv: sie bettet die angeordneten externen Eingaben ein.
const target = path.join(ARBEIT, ziel);
fs.writeFileSync(target, html);
console.log(path.relative(REPO, target), Buffer.byteLength(html), 'B,', beispiele.length, 'Beispiele, Art ' + art + ', Satz', satz.id + (frueher.length ? ', frühere: ' + frueher.length : ''));
