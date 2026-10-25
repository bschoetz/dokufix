import fs from 'node:fs';
import path from 'node:path';
import { DOMParser } from 'linkedom';
import { breaksOf } from './bpmn-rules.mjs';
// node lay.mjs <module.js> <dir> <name> [out.bpmn]
const [mod, dir, name, out] = process.argv.slice(2);
const L = await import(path.resolve(mod));
globalThis.FALLBACK = [];
const xml = fs.readFileSync(path.join(dir, name + '.bpmn'), 'utf8');
const raw = JSON.parse(fs.readFileSync(path.join(dir, name + '.raw.json'), 'utf8'));
const sizes = JSON.parse(fs.readFileSync(path.join(dir, name + '.sizes.json'), 'utf8'));
const { model } = L.readProcess(new DOMParser().parseFromString(xml.replace(/&amp;/g, ' '), 'text/xml'));
const laid = L.appendDiagram(xml, model, L.layoutGeometry(model, raw, t => sizes[t] || L.labelSize(t))).xml;
if (out) fs.writeFileSync(out, laid);
const br = breaksOf(laid, model, sizes);
console.log(name, 'breaks', br.length, globalThis.FALLBACK.length ? 'FALLBACK ' + globalThis.FALLBACK.join(',') : '');
