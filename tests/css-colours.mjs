// The colours of dokufix are variables of the :root rule at the head of
// src/doc.css (story 6.1). Tests that judge a colour read a stylesheet with
// every var(--dokufix-…) replaced by its value there.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src');
const doc = fs.readFileSync(path.join(src, 'doc.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const root = doc.match(/(?:^|[}\s]):root\s*\{([^}]*)\}/);
if (!root) throw new Error('tests/css-colours.mjs: no :root rule in src/doc.css');
export const ROOT_VARS = Object.fromEntries([...root[1].matchAll(/(--dokufix-[\w-]+)\s*:([^;]+)/g)].map(m => [m[1], m[2].trim()]));
// Resolved until nothing changes, so a variable that reads another one ends in its value.
export function resolveColours(css){
  let out = css, before;
  do {
    before = out;
    out = out.replace(/var\(\s*(--dokufix-[\w-]+)\s*\)/g, (all, name) => ROOT_VARS[name] ?? all);
  } while (out !== before);
  return out;
}
// A stylesheet under src/, its colours resolved.
export const readCss = name => resolveColours(fs.readFileSync(path.join(src, name), 'utf8'));
