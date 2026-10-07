// Was bpmn-js liest: bpmn-moddle 10.3.1 (die Version, die bpmn-js 18.31.0
// bindet) mit moddle-xml 12.3.1 und saxen 11.2.0, entpackt außerhalb des
// Repositorys. Je Fall die rohen Werte, die das Layout braucht (name jedes
// Knotens, jeder Bahn und jedes Teilnehmers; der Text jeder Textanmerkung;
// die flowNodeRef jeder Bahn), aus bpmn-moddle und aus dem Prototyp
// leser.mjs; wo sie sich unterscheiden, passen Layout und Bild nicht
// zusammen. Schreibt ergebnisse/bpmnjs-liest.md.
//
//   node bpmnjs-liest.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alleFaelle } from './faelle.mjs';
import { parseXml } from './leser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const STACK = '/tmp/claude-0/-home-user-dokufix/c7ad9c8e-4112-59bc-bff9-b496db1abe70/scratchpad/parsing-vendor/bpmnjs-stack/node_modules/';
const { BpmnModdle } = await import(STACK + 'bpmn-moddle/dist/index.js');
const versions = ['bpmn-moddle', 'moddle-xml', 'moddle', 'saxen', 'min-dash'].map(p => p + ' ' + JSON.parse(fs.readFileSync(STACK + p + '/package.json', 'utf8')).version).join(', ');

const NAMED = /^(startEvent|endEvent|intermediateCatchEvent|intermediateThrowEvent|\w+Gateway|task|\w+Task|callActivity|subProcess|adHocSubProcess|transaction|boundaryEvent|sequenceFlow|messageFlow|lane|participant)$/;

// Die rohen Werte aus dem Prototyp: Schlüssel "name:<id>", "text:<id>", "refs:<id>".
function ausLeser(xml){
  const doc = parseXml(xml);
  const out = {};
  const walk = el => {
    const t = el.localName;
    const id = el.getAttribute('id');
    if (id && NAMED.test(t)) out['name:' + id] = el.getAttribute('name');
    if (id && t === 'textAnnotation'){ const te = el.children.find(k => k.localName === 'text'); out['text:' + id] = te ? te.textContent : null; }
    if (id && t === 'lane') out['refs:' + id] = el.children.filter(k => k.localName === 'flowNodeRef').map(k => k.textContent);
    for (const k of el.children) walk(k);
  };
  walk(doc.documentElement);
  return out;
}

// Dieselben Werte aus bpmn-moddle: name, text, flowNodeRef (dort schon zu Objekten aufgelöst; ein Verweis auf nichts bleibt ein Platzhalter mit id).
async function ausModdle(xml){
  const moddle = new BpmnModdle();
  const { rootElement, warnings, references } = await moddle.fromXML(xml);
  const out = {};
  const seen = new Set();
  const walk = el => {
    if (!el || typeof el !== 'object' || seen.has(el)) return;
    seen.add(el);
    const t = el.$type ? el.$type.replace(/^bpmn:/, '') : '';
    t && (t[0].toLowerCase() + t.slice(1));
    const tag = t ? t[0].toLowerCase() + t.slice(1) : '';
    if (el.id && NAMED.test(tag)) out['name:' + el.id] = el.name === undefined ? null : el.name;
    if (el.id && tag === 'textAnnotation') out['text:' + el.id] = el.text === undefined ? null : el.text;
    if (el.id && tag === 'lane') out['refs:' + el.id] = (el.flowNodeRef || []).map(r => r.id);
    for (const k of Object.keys(el)){
      if (k.startsWith('$')) continue;
      const v = el[k];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object' && v.$type) walk(v);
    }
  };
  walk(rootElement);
  // Unaufgelöste Verweise (flowNodeRef auf nichts) stehen in references ohne Ziel; moddle lässt sie aus den Listen weg.
  const unresolved = (references || []).filter(r => !r.element.get(r.property) || !r.element.get(r.property).includes?.(r.id)).map(r => r.property + '→' + r.id);
  return { out, warnings: (warnings || []).map(w => String(w.message || w).split('\n')[0].slice(0, 120)), unresolved };
}

const rows = [];
let same = 0, differ = 0, failed = 0;
for (const f of alleFaelle()){
  let a, b, err = null;
  try { a = ausLeser(f.xml); } catch (e){ a = { error: 'leser: ' + e.message }; }
  try { b = await ausModdle(f.xml); } catch (e){ err = String(e && e.message || e).split('\n')[0].slice(0, 140); }
  if (a.error && err){ same++; continue; } // beide lehnen ab
  if (a.error || err){ failed++; rows.push([f.name, a.error ? 'Prototyp lehnt ab: ' + a.error.slice(0, 100) : 'bpmn-moddle lehnt ab: ' + err, '']); continue; }
  const keys = new Set([...Object.keys(a), ...Object.keys(b.out)]);
  const diffs = [];
  for (const k of keys){
    const x = JSON.stringify(a[k] ?? null), y = JSON.stringify(b.out[k] ?? null);
    if (x !== y) diffs.push(k + ': Prototyp ' + x.slice(0, 60) + ' / bpmn-moddle ' + y.slice(0, 60));
  }
  if (diffs.length){ differ++; rows.push([f.name, diffs.join('<br>'), b.warnings.join('<br>')]); }
  else { same++; if (b.warnings.length) rows.push([f.name, '= (gleich)', b.warnings.join('<br>')]); }
}
let md = '# Was bpmn-js liest, verglichen mit dem Prototyp\n\n' + versions + ', in Node ' + process.versions.node + '. Verglichen werden je Fall die rohen Werte name (Knoten, Bahnen, Teilnehmer, Flüsse), text (Textanmerkungen) und flowNodeRef (Bahnen), so wie bpmn-moddle sie liefert (`fromXML`) und wie der Prototyp sie liest. Ein Fall, den beide ablehnen, zählt als gleich.\n\n';
md += 'Gleich: ' + same + ', abweichend: ' + differ + ', nur einer lehnt ab: ' + failed + ' (von ' + alleFaelle().length + ').\n\n| Fall | Unterschied | Warnungen von bpmn-moddle |\n|---|---|---|\n';
for (const r of rows) md += '| ' + r.map(c => String(c).replace(/\|/g, '\\|').replace(/\n/g, '\\n')).join(' | ') + ' |\n';
fs.writeFileSync(path.join(here, 'ergebnisse', 'bpmnjs-liest.md'), md);
console.log('gleich ' + same + ', abweichend ' + differ + ', nur einer lehnt ab ' + failed);
for (const r of rows) console.log(r[0] + ': ' + r[1].replace(/<br>/g, '\n    ') + (r[2] ? '\n    warn: ' + r[2].replace(/<br>/g, '; ') : ''));
