// arielle and the exact replica against the real Mermaid 12.0.0 in Chromium: targeted models first (a label q()
// turns into a blank, names Mermaid's parser may refuse), then random models of gen.mjs.
//   node browser.mjs [count]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { arielleExakt as arielle } from './ranks-exakt.mjs';
import { mermaidRanks } from '../ranks.mjs';
import { randomModel, sameOrder } from './gen.mjs';
const R = '/home/user/dokufix/';
const { chromium } = await import(R + 'node_modules/playwright-core/index.mjs');
const { captureBundle } = await import(R + 'tests/capture-bpmn.mjs');
const { prepareLibraries } = await import(R + 'tests/cdn.mjs');
const N = Number(process.argv[2] || 400);

// One lane, a → b named, a → c unnamed: with a label vertex the order is a, c, b; without it a, b, c.
const labelCase = (name, nodeName = 'Schritt') => ({
  pools: [{ id: 'P', name: 'P' }],
  lanes: [{ id: 'L', name: 'Bahn', nodes: ['A', 'B', 'C'], key: 'l1', pool: 0 }],
  nodes: [{ id: 'A', name: nodeName, type: 'start', key: 'n1' }, { id: 'B', name: nodeName, type: 'task', key: 'n2' }, { id: 'C', name: nodeName, type: 'task', key: 'n3' }],
  flows: [{ id: 'F1', from: 'A', to: 'B', name }, { id: 'F2', from: 'A', to: 'C', name: '' }],
  boundaries: [], messages: [], notes: [], associations: [],
});
const targeted = [
  ['Beschriftung "ja"', labelCase('ja')],
  ['Beschriftung "#" (q() macht ein Leerzeichen daraus)', labelCase('#')],
  ['Beschriftung "\\""', labelCase('"')],
  ['Beschriftung "<>&"', labelCase('<>&')],
  ['Beschriftung "a|b"', labelCase('a|b')],
  ['Beschriftung "a %% b"', labelCase('a %% b')],
  ['Beschriftung "x::y"', labelCase('x::y')],
  ['Beschriftung "(a) [b] {c}"', labelCase('(a) [b] {c}')],
  ['Beschriftung "a-->b"', labelCase('a-->b')],
  ['Beschriftung "end"', labelCase('end')],
  ['Beschriftung "a;b"', labelCase('a;b')],
  ['Beschriftung "~~~"', labelCase('~~~')],
  ['Beschriftung "@{x}"', labelCase('@{x}')],
  ['Beschriftung "\\u00e4\\u00f6\\u00fc \\u20ac"', labelCase('äöü €')],
  ['Knotenname "#"', labelCase('ja', '#')],
  ['Knotenname "a|b"', labelCase('ja', 'a|b')],
  ['Knotenname "(x)"', labelCase('ja', '(x)')],
  ['Knotenname "end"', labelCase('ja', 'end')],
];
const models = targeted.map(([, m]) => m).concat(Array.from({ length: N }, (_, i) => randomModel(i)));
const PAGE = R + 'dist/dokufix.html';
const libraries = await prepareLibraries(PAGE);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  const context = await browser.newContext(); await libraries.serve(context);
  const page = await context.newPage();
  await page.goto(pathToFileURL(PAGE).href);
  await page.waitForFunction(() => !!document.querySelector('#dokufix-rail.has-items'), null, { timeout: 90000 });
  await page.addScriptTag({ content: await captureBundle() });
  const raws = [];
  for (let start = 0; start < models.length; start += 50){
    const part = await page.evaluate(async ({ models, start }) => {
      const out = [];
      for (let i = 0; i < models.length; i++){
        try { out.push(await window.dokufixCapture.mermaidPositions(models[i], document, 'r' + (start + i))); }
        catch (e){ out.push({ error: String(e.message || e).replace(/\s+/g, ' ').slice(0, 100) }); }
      }
      return out;
    }, { models: models.slice(start, start + 50), start });
    raws.push(...part);
    process.stdout.write('.');
  }
  console.log();
  fs.writeFileSync(new URL('./browser-raws.json', import.meta.url), JSON.stringify({ targeted: targeted.length, N, raws }));
  const compare = (model, raw) => {
    const cx = Object.fromEntries(model.nodes.map(n => [n.key, raw.nodes[n.key] && raw.nodes[n.key].cx]));
    if (Object.values(cx).some(x => typeof x !== 'number')) return { arielle: false, replica: false, note: 'Mermaid hat nicht alle Knoten angeordnet' };
    return { arielle: sameOrder(model, arielle(model), cx), replica: sameOrder(model, mermaidRanks(model), cx) };
  };
  console.log('Gezielte Fälle:');
  targeted.forEach(([what, model], i) => {
    const raw = raws[i];
    if (raw.error){ console.log('  ' + what + ': Mermaid-Fehler: ' + raw.error); return; }
    const c = compare(model, raw);
    console.log('  ' + what + ': arielle ' + (c.arielle ? 'gleich' : 'ABWEICHEND') + ', Nachbau ' + (c.replica ? 'gleich' : 'ABWEICHEND') + (c.note ? ' (' + c.note + ')' : ''));
  });
  let sameA = 0, sameR = 0, errors = 0; const badA = [], badR = [], errs = [];
  raws.slice(targeted.length).forEach((raw, i) => {
    if (raw.error){ errors++; errs.push(i + ': ' + raw.error); return; }
    const c = compare(models[targeted.length + i], raw);
    if (c.arielle) sameA++; else badA.push(i);
    if (c.replica) sameR++; else badR.push(i);
  });
  console.log('Zufallsmodelle: ' + N + ', Mermaid-Fehler: ' + errors + ', arielle gleich: ' + sameA + ', Nachbau gleich: ' + sameR + (badA.length ? ', arielle abweichend: ' + badA.slice(0, 10).join(', ') : '') + (badR.length ? ', Nachbau abweichend: ' + badR.slice(0, 10).join(', ') : ''));
  for (const e of errs.slice(0, 10)) console.log('  Fehler ' + e);
  const sizes = models.slice(targeted.length).map(m => m.nodes.length);
  console.log('Knoten je Modell: min ' + Math.min(...sizes) + ', max ' + Math.max(...sizes) + '; Flüsse max ' + Math.max(...models.map(m => m.flows.length)));
} finally { await browser.close(); }
