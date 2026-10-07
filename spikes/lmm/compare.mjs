import fs from 'node:fs';
const R = '/home/user/dokufix/';
const esbuild = await import(R + 'node_modules/esbuild/lib/main.js');
const built = (await esbuild.build({ stdin: { contents: "export * from './src/app/bpmn.js'; export * from './src/app/bpmn-layout.js';", resolveDir: R, loader: 'js' }, bundle: true, format: 'iife', globalName: 'X', write: false, charset: 'utf8', logLevel: 'silent' })).outputFiles[0].text;
const assistant = fs.readFileSync(R + 'dist/bpmn-assistant.html', 'utf8');
const body = (text, name) => {
  const m = new RegExp('(?:async )?function ' + name + '\\(').exec(text); if (!m) return null;
  let i = text.indexOf('{', m.index), d = 0;
  for (let j = i; j < text.length; j++){ if (text[j] === '{') d++; else if (text[j] === '}' && --d === 0) return text.slice(m.index, j + 1).replace(/\s+/g, ' '); }
};
const names = [...new Set([...built.matchAll(/function (\w+)\(/g)].map(m => m[1]))];
let same = 0, diff = [], missing = [];
for (const n of names){ const a = body(built, n), b = body(assistant, n); if (!b) missing.push(n); else if (a === b) same++; else diff.push(n); }
console.log('functions in src bundle:', names.length, 'identical:', same, 'different:', diff.length, diff.slice(0, 20), 'missing in assistant:', missing.length, missing.slice(0, 20));
for (const c of ['MERMAID_LAYOUT_VERSION', 'BPMN_NO_MERMAID']) { const r = new RegExp('var ' + c + ' = ([^;]+);'); console.log(c, (r.exec(built) || [])[1], '|', (r.exec(assistant) || [])[1]); }
console.log('mermaid.initialize in assistant:', (assistant.match(/mermaid\.initialize\(\{[^}]*\{[^}]*\}[^}]*\}\)/) || [])[0]);
for (const n of ['mermaidSource', 'mermaidPositions', 'buildGrid', 'readProcess', 'layoutGeometry', 'offscreenHost', 'labelMeasurer']) console.log(n, body(built, n) === body(assistant, n));
const a = body(built, 'ruleStagger'), b = body(assistant, 'ruleStagger');
let k = 0; while (a[k] === b[k]) k++; console.log('ruleStagger src:', a.slice(k - 80, k + 160)); console.log('ruleStagger asst:', b.slice(k - 80, k + 160));
const c = body(built, 'ruleCompact'), d = body(assistant, 'ruleCompact');
k = 0; while (c[k] === d[k]) k++; console.log('ruleCompact src:', c.slice(k - 60, k + 140)); console.log('ruleCompact asst:', d.slice(k - 60, k + 140));
const norm = s => s.replace(/\b([A-Za-z_$][A-Za-z_$]*)\d+\b/g, '$1');
console.log('after removing esbuild suffixes, still different:', diff.filter(n => norm(body(built, n)) !== norm(body(assistant, n))));
{ const a = norm(body(built, 'finishLabelsAndFrame')), b = norm(body(assistant, 'finishLabelsAndFrame')); let k = 0; while (a[k] === b[k]) k++; console.log('FLF src :', a.slice(k - 100, k + 200)); console.log('FLF asst:', b.slice(k - 100, k + 200)); }
