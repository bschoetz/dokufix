import { pathToFileURL } from 'node:url';
const R = '/home/user/dokufix/';
const { chromium } = await import(R + 'node_modules/playwright-core/index.mjs');
const { captureBundle } = await import(R + 'tests/capture-bpmn.mjs');
const { prepareLibraries } = await import(R + 'tests/cdn.mjs');
const { mermaidRanks } = await import('./ranks.mjs');
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648; const pick = n => Math.floor(rnd() * n);
function randomModel(i){
  const laneCount = 1 + pick(4), n = 3 + pick(22);
  const types = ['task', 'task', 'task', 'gateway', 'inter'];
  const nodes = Array.from({ length: n }, (_, j) => ({ id: 'X' + j, name: rnd() < 0.8 ? 'Schritt ' + j : '', type: j === 0 ? 'start' : j === n - 1 ? 'end' : types[pick(types.length)], key: 'n' + (j + 1) }));
  const lanes = Array.from({ length: laneCount }, (_, j) => ({ id: 'L' + j, name: 'Bahn ' + j, nodes: [], key: 'l' + (j + 1) }));
  for (const nd of nodes) lanes[pick(laneCount)].nodes.push(nd.id);
  for (const l of lanes) if (!l.nodes.length) l.hold = 'h' + l.key.slice(1);
  const flows = []; let f = 0;
  for (let j = 1; j < n; j++) flows.push({ id: 'F' + f++, from: 'X' + pick(j), to: 'X' + j, name: rnd() < 0.3 ? 'ja' : '' });
  for (let k = pick(Math.ceil(n / 2)); k > 0; k--){ const a = pick(n), b = pick(n); if (a !== b) flows.push({ id: 'F' + f++, from: 'X' + a, to: 'X' + b, name: rnd() < 0.3 ? 'nein' : '' }); }
  return { pools: [{ id: null, name: '', box: false }], lanes, nodes, flows, boundaries: [], messages: [], notes: [], associations: [] };
}
const PAGE = R + 'dist/dokufix.html';
const libraries = await prepareLibraries(PAGE);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  const context = await browser.newContext(); await libraries.serve(context);
  const page = await context.newPage();
  await page.goto(pathToFileURL(PAGE).href);
  await page.waitForFunction(() => !!document.querySelector('#dokufix-rail.has-items'), null, { timeout: 90000 });
  await page.addScriptTag({ content: await captureBundle() });
  const N = 300, models = Array.from({ length: N }, (_, i) => randomModel(i));
  const raws = await page.evaluate(async ({ models }) => { const out = []; for (let i = 0; i < models.length; i++){ try { out.push(await window.dokufixCapture.mermaidPositions(models[i], document, 'r' + i)); } catch (e){ out.push({ error: String(e.message || e).slice(0, 80) }); } } return out; }, { models });
  let same = 0, errors = 0; const bad = [];
  const sign = x => Math.abs(x) < 1 ? 0 : Math.sign(x);
  raws.forEach((raw, i) => {
    if (raw.error){ errors++; return; }
    const rank = mermaidRanks(models[i]), keys = models[i].nodes.map(n => n.key);
    const ok = keys.every(a => keys.every(b => raw.nodes[a] && raw.nodes[b] && sign(rank[a] - rank[b]) === sign(raw.nodes[a].cx - raw.nodes[b].cx)));
    if (ok) same++; else bad.push(i);
  });
  console.log('Zufallsmodelle:', N, 'gleich:', same, 'abweichend:', bad.length, bad.slice(0, 10), 'Mermaid-Fehler:', errors);
  const sizes = models.map(m => m.nodes.length); console.log('Knoten je Modell: min', Math.min(...sizes), 'max', Math.max(...sizes), 'Flüsse max', Math.max(...models.map(m => m.flows.length)));
} finally { await browser.close(); }
