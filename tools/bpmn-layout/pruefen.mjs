// Prüft BPMN-Eingaben mit bpmnlint unter den Regeln des Lageberichts vom 2026-10-04, Abschnitt 5, und mit einer
// eigenen Prüfung der parallelen Gateways (ein paralleler Split schließt mit einem parallelen Join). Eine neue
// Eingabe kommt nur in einen Satz, wenn sie hier ohne Fehler durchgeht: Layout wird nur an gültigem BPMN gemessen.
// Aus Spike 2.26 im Store übernommen (2026-10-07).
//
//   node tools/bpmn-layout/pruefen.mjs [--json <out.json>] [<datei.bpmn | ordner>…]
//
// Ohne Dateien alle Eingaben der Sätze (lib.mjs). Exit 1 bei einem Fehler.
//
// Regeln: bpmnlint:recommended; no-bpmndi aus (Eingaben haben kein DI); fake-join (mehrere Flüsse in eine Aufgabe)
// eine Warnung; label-required, superfluous-label, superfluous-gateway und conditional-flows geduldet, also
// Warnungen. Die parallele Prüfung: die Ausgänge paralleler Splits gleich den Eingängen paralleler Joins je Prozess,
// und kein paralleler Join auf einer Schleife, die nicht alle seine Eingänge erreichen (er wartete ewig).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BpmnModdle } from 'bpmn-moddle';
import { Linter } from 'bpmnlint';
import NodeResolver from 'bpmnlint/lib/resolver/node-resolver.js';

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
  const nOut = splits.reduce((s, g) => s + g.outgoing.length, 0);
  const nIn = joins.reduce((s, g) => s + g.incoming.length, 0);
  if (nOut !== nIn) out.push(`parallel-join ${proc.id}: ${nOut} split outs, ${nIn} join ins`);
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

const isInput = f => f.endsWith('.bpmn') && !/\.(ref|laid-out|ben)\.bpmn$/.test(f);
function files(args){
  return args.flatMap(a => fs.statSync(a).isDirectory()
    ? fs.readdirSync(a).filter(isInput).sort().map(f => path.join(a, f))
    : [a]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const args = process.argv.slice(2);
  const j = args.indexOf('--json');
  const jsonOut = j >= 0 ? args.splice(j, 2)[1] : null;
  const list = args.length ? files(args) : [...(await import('./lib.mjs')).INPUTS.values()].map(i => i.file);
  const result = {};
  let bad = 0;
  for (const file of list){
    const r = await check(fs.readFileSync(file, 'utf8'));
    result[file] = r;
    if (r.errors.length) bad++;
    const name = path.basename(file, '.bpmn');
    console.log(name.padEnd(28), r.errors.length ? 'E: ' + r.errors.map(e => e.split(':')[0]).join(', ') : 'ok');
  }
  console.log(`--- ${list.length} Dateien, ${bad} mit Fehlern`);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(result, null, 1) + '\n');
  if (bad) process.exitCode = 1;
}
