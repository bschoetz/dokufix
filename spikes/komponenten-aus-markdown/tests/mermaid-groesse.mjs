// Schätzt, wie groß Mermaid wäre, wenn nur flowchart + swimlane gebündelt würden:
// statische Import-Hülle der minifizierten ESM-Chunks ab Kern + den beiden Diagramm-Chunks + Layouts.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../node_modules/mermaid/dist');
const entry = path.join(dist, 'mermaid.esm.min.mjs');
const chunkDir = path.join(dist, 'chunks/mermaid.esm.min');
const all = fs.readdirSync(chunkDir).filter(f => f.endsWith('.mjs'));
const closure = (starts) => {
  const seen = new Set(), todo = [...starts];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*"(\.[^"]+\.mjs)"/g)) todo.push(path.resolve(path.dirname(f), m[1]));   // nur statische Importe
  }
  return [...seen];
};
const size = files => { const buf = Buffer.concat(files.map(f => fs.readFileSync(f))); return [buf.length, zlib.gzipSync(buf).length]; };
const kb = n => (n / 1024).toFixed(0) + ' KB';
const pick = re => all.filter(f => re.test(f)).map(f => path.join(chunkDir, f));
const report = (label, files) => { const [raw, gz] = size(files); console.log(label.padEnd(58), String(files.length).padStart(3), 'Dateien', kb(raw).padStart(9), 'roh', kb(gz).padStart(8), 'gzip'); };
report('Kern (mermaid.esm.min.mjs + statische Importe)', closure([entry]));
report('Kern + flowchart', closure([entry, ...pick(/^flowDiagram/)]));
report('Kern + flowchart + dagre-Layout', closure([entry, ...pick(/^flowDiagram/), ...pick(/^dagre/)]));
report('Kern + flowchart + swimlanes (Diagramm + Layout)', closure([entry, ...pick(/^flowDiagram/), ...pick(/^dagre/), ...pick(/^swimlanes/)]));
report('alle ESM-Chunks', [entry, ...all.map(f => path.join(chunkDir, f))]);
const one = f => { const b = fs.readFileSync(f); console.log(path.basename(f).padEnd(58), '             ', kb(b.length).padStart(9), 'roh', kb(zlib.gzipSync(b).length).padStart(8), 'gzip'); };
one(path.join(dist, 'mermaid.min.js'));
one(path.resolve(here, '../node_modules/bpmn-js/dist/bpmn-viewer.production.min.js'));
one(path.resolve(here, 'out/bpmn-auto-layout.bundle.min.js'));
one(path.resolve(here, '../node_modules/marked/lib/marked.umd.js'));
console.log('Chunk-Namen (Auszug):', all.filter(f => /flow|dagre|swim|elk|cose/i.test(f)).join(', '));
