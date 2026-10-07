// Misst readProcess() über alle Fälle in jeder Umgebung und schreibt
// ergebnisse/ergebnisse.json (je Umgebung: info und je Fall das Ergebnis von
// lesen()). Ein Lauf ergänzt die Datei, er löscht die anderen Umgebungen nicht.
//
//   cd spikes/lmm/parsing
//   node messen.mjs                       alle Umgebungen, die Node erreicht, und Chromium
//   node messen.mjs --umgebungen linkedom,leser --faelle korpus-   nur diese
//   bun messen.mjs --umgebungen linkedom,leser                      dasselbe unter Bun ("bun:…")
//
// Der Schlüssel einer Umgebung ist "<laufzeit>:<adapter>" (node:linkedom,
// bun:leser), Chromium heißt "chromium".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alleFaelle } from './faelle.mjs';
import { lesen } from './lesen.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const R = '/home/user/dokufix/';
const OUT = path.join(here, 'ergebnisse', 'ergebnisse.json');
const ADAPTERS = ['linkedom', 'xmldom', 'saxen', 'txml', 'fxp', 'leser'];

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const runtime = process.versions.bun ? 'bun' : process.versions.deno ? 'deno' : 'node';
const wanted = (arg('--umgebungen') || [...ADAPTERS, 'chromium'].join(',')).split(',').filter(Boolean);
const filter = arg('--faelle') ? new RegExp(arg('--faelle')) : null;

const faelle = alleFaelle().filter(f => !filter || filter.test(f.name));
const { readProcess } = await import(R + 'src/app/bpmn-layout.js');
const store = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { umgebungen: {} };
const merge = (key, info, results) => {
  const slot = store.umgebungen[key] || (store.umgebungen[key] = { info, results: {} });
  slot.info = info;
  Object.assign(slot.results, results);
};

for (const name of wanted){
  if (name === 'chromium'){
    if (runtime !== 'node'){ console.log('chromium: nur unter Node'); continue; }
    const { chromiumLesen } = await import('./umgebungen/chromium.mjs');
    const { info, results } = await chromiumLesen(faelle, { log: s => process.stdout.write('\r' + s + '   ') });
    merge('chromium', info, results);
    console.log('\rchromium: ' + Object.keys(results).length + ' Fälle, ' + info);
    continue;
  }
  let mod;
  try { mod = await import('./umgebungen/' + name + '.mjs'); } catch (e){ console.log(name + ': nicht geladen: ' + e.message); continue; }
  const results = {};
  for (const f of faelle){
    results[f.name] = lesen(mod.parse, readProcess, f.xml);
  }
  const key = runtime + ':' + name;
  merge(key, mod.info + ' unter ' + runtime + ' ' + (process.versions.bun || process.versions.node), results);
  console.log(key + ': ' + faelle.length + ' Fälle, ' + mod.info);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(store));
console.log('geschrieben: ' + OUT + ' (' + Object.keys(store.umgebungen).join(', ') + ')');
