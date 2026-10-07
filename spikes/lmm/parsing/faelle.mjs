// Alle Fälle des Vergleichs: die 57 Fixtures, die BPMN-Blöcke aus
// tests/referenz.md und src/demo.md und das Korpus in korpus/.
//   alleFaelle() → [{ name, gruppe, xml }]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const R = '/home/user/dokufix/';
const here = path.dirname(fileURLToPath(import.meta.url));

// Die Blöcke ```bpmn … ``` einer Markdown-Datei, benannt nach der Zeile des Zauns.
export function bloecke(file, gruppe){
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++){
    if (!/^```bpmn\s*$/.test(lines[i])) continue;
    const start = i + 1;
    let j = start;
    while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
    out.push({ name: gruppe + '-L' + (i + 1), gruppe, xml: lines.slice(start, j).join('\n') + '\n' });
    i = j;
  }
  return out;
}

export function fixtures(){
  const dir = R + 'tests/fixtures/bpmn-layout/';
  const index = JSON.parse(fs.readFileSync(dir + 'index.json', 'utf8'));
  return Object.keys(index.fixtures).map(name => ({ name: 'fixture-' + name, gruppe: 'fixture', xml: fs.readFileSync(dir + name + '.bpmn', 'utf8') }));
}

export function korpus(){
  const dir = path.join(here, 'korpus');
  return fs.readdirSync(dir).filter(f => f.endsWith('.bpmn')).sort().map(f => ({ name: 'korpus-' + f.replace(/\.bpmn$/, ''), gruppe: 'korpus', xml: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

export function alleFaelle(){
  return [...fixtures(), ...bloecke(R + 'tests/referenz.md', 'referenz'), ...bloecke(R + 'src/demo.md', 'demo'), ...korpus()];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const all = alleFaelle();
  const n = {};
  for (const f of all) n[f.gruppe] = (n[f.gruppe] || 0) + 1;
  console.log(all.length + ' Fälle', n);
}
