// Prüft BPMN-Eingaben mit bpmnlint unter den Regeln des Lageberichts vom 2026-10-04, Abschnitt 5, und mit einer
// eigenen Prüfung der parallelen Gateways (ein paralleler Split schließt mit einem parallelen Join). Eine neue
// Eingabe kommt nur in einen Satz, wenn sie hier ohne Fehler durchgeht: Layout wird nur an gültigem BPMN gemessen.
// Aus Spike 2.26 im Store übernommen (2026-10-07).
//
//   node tools/bpmn-layout/pruefen.mjs [--aehnlich] [--json <out.json>] [<datei.bpmn | ordner>…]
//
// Ohne Dateien alle Eingaben der Sätze (lib.mjs). Exit 1 bei einem Fehler, der nicht unter BEKANNT steht.
//
// Danach die Fingerabdrücke (src/app/fingerprint.js, Story 2.37): die Gruppen mit gleichem Fall (dieselbe Eingabe,
// anders geschrieben: Präfixe, Reihenfolge, Farben, Erweiterungen, Positionen) und mit gleicher Form (derselbe Prozess
// mit anderen IDs und Texten), je mit dem kurzen Fingerabdruck; in einer Formgruppe stehen Eingaben gleichen Falls mit
// "=" verbunden. --aehnlich nennt je Eingabe die drei nach der Form ähnlichsten mit Prozent. Beides auch in --json. Der
// Exit-Code bleibt der der Prüfung.
//
// Regeln: bpmnlint:recommended; no-bpmndi aus (Eingaben haben kein DI); fake-join (mehrere Flüsse in eine Aufgabe)
// eine Warnung; label-required, superfluous-label, superfluous-gateway und conditional-flows geduldet, also
// Warnungen. Die parallele Prüfung: die Ausgänge paralleler Splits gleich den Eingängen paralleler Joins je Prozess,
// und kein paralleler Join auf einer Schleife, die nicht alle seine Eingänge erreichen (er wartete ewig). Ein Ausgang,
// von dem aus kein paralleler Join erreichbar ist, dessen Zweig also in Endereignissen ausläuft, braucht keinen Join:
// das ist gültiges BPMN, der Prozess endet, wenn jedes Token ein Ende erreicht hat (Ben, 2026-10-09, morgenroutine:
// "Runde löst sich auf" endet in drei Endereignissen).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BpmnModdle } from 'bpmn-moddle';
import { Linter } from 'bpmnlint';
import NodeResolver from 'bpmnlint/lib/resolver/node-resolver.js';
import { caseFingerprint, shapeOf, nearest } from '../../src/app/fingerprint.js';

export const CONFIG = {
  extends: 'bpmnlint:recommended',
  rules: {
    'no-bpmndi': 'off',
    'fake-join': 'warn',
    'label-required': 'warn',
    'superfluous-label': 'warn',
    'superfluous-gateway': 'warn',
    'conditional-flows': 'warn',
  },
};

const moddle = new BpmnModdle();

// incoming/outgoing from sourceRef/targetRef, as bpmn-js does on import.
function link(el){
  const kids = el.flowElements || [];
  for (const f of kids) if (f.$type === 'bpmn:SequenceFlow'){
    for (const [n, key] of [[f.sourceRef, 'outgoing'], [f.targetRef, 'incoming']]) if (n){
      n.get(key);
      if (!n[key].some(x => x.id === f.id)) n[key].push(f);
    }
  }
  for (const k of kids) if (k.flowElements) link(k);
}

function parallelCheck(proc){
  const out = [];
  const nodes = (proc.flowElements || []).filter(e => e.$type !== 'bpmn:SequenceFlow');
  const splits = nodes.filter(n => n.$type === 'bpmn:ParallelGateway' && (n.outgoing || []).length > 1);
  const joins = nodes.filter(n => n.$type === 'bpmn:ParallelGateway' && (n.incoming || []).length > 1);
  // Ob von einem Knoten aus ein paralleler Join erreichbar ist; ein Ausgang ohne einen läuft in Enden aus.
  const toJoin = (from, seen = new Set()) => {
    if (!from || seen.has(from)) return false;
    seen.add(from);
    if (joins.includes(from)) return true;
    return (from.outgoing || []).some(f => toJoin(f.targetRef, seen));
  };
  const nOut = splits.reduce((s, g) => s + g.outgoing.filter(f => toJoin(f.targetRef)).length, 0);
  const nIn = joins.reduce((s, g) => s + g.incoming.length, 0);
  if (nOut !== nIn) out.push(`parallel-join ${proc.id}: ${nOut} split outs into a join, ${nIn} join ins`);
  const reach = (from, to, seen = new Set()) => {
    if (!from) return false;
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (from.outgoing || []).some(f => reach(f.targetRef, to, seen));
  };
  for (const j of joins) for (const f of j.incoming)
    if (reach(j, f.sourceRef) && !j.incoming.every(g => reach(j, g.sourceRef)))
      out.push(`parallel-join ${j.id}: on a loop (in ${f.id})`);
  return [...new Set(out)];
}

// { errors: ["rule id: message"], warnings: [...] }, or { errors: ["read: …"] }.
export async function check(xml){
  let rootElement;
  try {
    ({ rootElement } = await moddle.fromXML(xml));
  } catch (e){
    return { errors: [`read: ${e.message.split('\n')[0]}`], warnings: [] };
  }
  const procs = rootElement.rootElements.filter(r => r.$type === 'bpmn:Process');
  for (const p of procs) link(p);
  const res = await new Linter({ config: CONFIG, resolver: new NodeResolver() }).lint(rootElement);
  const errors = [], warnings = [];
  for (const [rule, reps] of Object.entries(res)) for (const r of reps)
    (r.category === 'error' ? errors : warnings).push(`${rule} ${r.id}: ${r.message}`);
  errors.push(...procs.flatMap(parallelCheck));
  return { errors, warnings };
}

// Bekannte Fehler: Eingaben, die so falsch gezeichnet sind, wie Leute zeichnen, und darum im Satz bleiben (Ben,
// 2026-10-09: "weil Leute so falsch malen"). Je Eingabe die Fehler, wie check() sie meldet; nur genau diese zählen
// nicht, ein anderer oder weiterer Fehler schon.
//   x-wv6  drei Anfragen als Nachrichten-Endereignisse, die Angebote als drei Nachrichten-Startereignisse in einen
//          parallelen Join: jedes Startereignis beginnt eine eigene Instanz, der Join wartet ewig.
export const BEKANNT = {
  'x-wv6': ['parallel-join sid-8642B8A1-91BC-4760-9DE6-291644FA9C0B: 2 split outs into a join, 5 join ins'],
};

const isInput = f => f.endsWith('.bpmn') && !/\.(ref|laid-out|ben)\.bpmn$/.test(f);
function files(args){
  return args.flatMap(a => fs.statSync(a).isDirectory()
    ? fs.readdirSync(a).filter(isInput).sort().map(f => path.join(a, f))
    : [a]);
}

// Die Gruppen gleichen Falls und gleicher Form, aus name → { fall, form }: { fall: [{ short, names }], form: [{ short,
// names, cases }] }, cases die Namen je Fall in der Formgruppe; nur Gruppen von zweien an, eine Formgruppe nur, wo
// mehr als ein Fall darin ist (sonst steht sie schon unter dem gleichen Fall). In der Reihenfolge der Eingaben.
export function groups(fps){
  const by = key => {
    const out = new Map();
    for (const [name, fp] of fps) if (fp[key]){
      if (!out.has(fp[key].hash)) out.set(fp[key].hash, { short: fp[key].short, names: [] });
      out.get(fp[key].hash).names.push(name);
    }
    return [...out.values()].filter(g => g.names.length > 1);
  };
  const form = by('form').map(g => {
    const cases = new Map();
    for (const name of g.names){ const h = fps.get(name).fall.hash; if (!cases.has(h)) cases.set(h, []); cases.get(h).push(name); }
    return { ...g, cases: [...cases.values()] };
  }).filter(g => g.cases.length > 1);
  return { fall: by('fall'), form };
}

// Je Eingabe mit Form die drei ähnlichsten: name → [{ name, prozent }].
export function similar(fps){
  return new Map([...fps].filter(([, fp]) => fp.form).map(([name]) => [name, nearest(name, fps).map(n => ({ name: n.name, prozent: Math.round(n.similarity * 100) }))]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const args = process.argv.slice(2);
  const j = args.indexOf('--json');
  const jsonOut = j >= 0 ? args.splice(j, 2)[1] : null;
  const s = args.indexOf('--aehnlich');
  const aehnlich = s >= 0 && !!args.splice(s, 1);
  const lib = args.length ? null : await import('./lib.mjs');
  const list = lib ? [...lib.INPUTS.values()].map(i => i.file) : files(args);
  const result = {};
  let bad = 0, known = 0;
  for (const file of list){
    const r = await check(fs.readFileSync(file, 'utf8'));
    result[file] = r;
    const name = path.basename(file, '.bpmn');
    const bekannt = r.errors.filter(e => (BEKANNT[name] || []).includes(e)), neu = r.errors.filter(e => !bekannt.includes(e));
    if (neu.length) bad++;
    if (bekannt.length) known++;
    console.log(name.padEnd(28), neu.length ? 'E: ' + neu.map(e => e.split(':')[0]).join(', ') : bekannt.length ? 'bekannt: ' + bekannt.map(e => e.split(':')[0]).join(', ') : 'ok');
  }
  console.log(`--- ${list.length} Dateien, ${bad} mit Fehlern` + (known ? `, ${known} mit bekannten` : ''));

  // Die Fingerabdrücke: der Eingaben aus lib.mjs (einmal je Lauf), oder der genannten Dateien, je unter ihrem Namen
  // (ihrem Pfad, wo zwei denselben haben).
  let fps;
  if (lib) fps = lib.fingerprints();
  else {
    fps = new Map();
    for (const file of list){
      const xml = fs.readFileSync(file, 'utf8'), base = path.basename(file, '.bpmn');
      fps.set(fps.has(base) ? path.relative(process.cwd(), file) : base, { fall: caseFingerprint(xml), form: shapeOf(xml) });
    }
  }
  const g = groups(fps);
  console.log(`--- gleicher Fall: ${g.fall.length ? g.fall.length + (g.fall.length === 1 ? ' Gruppe' : ' Gruppen') : 'keine'}`);
  for (const x of g.fall) console.log(x.short.padEnd(14), x.names.join(', '));
  console.log(`--- gleiche Form: ${g.form.length ? g.form.length + (g.form.length === 1 ? ' Gruppe' : ' Gruppen') : 'keine'}`);
  for (const x of g.form) console.log(x.short.padEnd(14), x.cases.map(c => c.join(' = ')).join(', '));
  const ohne = [...fps].filter(([, fp]) => !fp.form).map(([name]) => name);
  if (ohne.length) console.log(`--- ohne Form (kein BPMN oder nichts anzuordnen): ${ohne.join(', ')}`);
  const near = similar(fps);
  if (aehnlich){
    console.log('--- ähnlich (nach der Form)');
    for (const [name, list] of near) console.log(name.padEnd(28), list.map(n => `${n.name} ${n.prozent} %`).join(', '));
  }
  if (jsonOut){
    const fp = Object.fromEntries([...fps].map(([name, x]) => [name, { fall: x.fall && x.fall.short, form: x.form && x.form.short }]));
    fs.writeFileSync(jsonOut, JSON.stringify({ pruefung: result, fingerabdruck: fp, gleicherFall: g.fall, gleicheForm: g.form, aehnlich: Object.fromEntries(near) }, null, 1) + '\n');
  }
  if (bad) process.exitCode = 1;
}
