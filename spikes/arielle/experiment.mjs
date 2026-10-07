// Experiment: how the global Mermaid config and directives in labels affect the BPMN layout.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import('/home/user/dokufix/node_modules/playwright-core/index.mjs');
const R = '/home/user/dokufix/';
const { captureBundle } = await import(R + 'tests/capture-bpmn.mjs');
const { prepareLibraries } = await import(R + 'tests/cdn.mjs');
const { mermaidSource } = await import(R + 'src/app/bpmn-layout.js');
const { fixtureNames, readFixture, readModel, layOut, expectedFile } = await import(R + 'tests/bpmn-fixtures.mjs');

const APP = { startOnLoad: false, theme: 'default', securityLevel: 'strict', suppressErrorRendering: true, flowchart: { curve: 'basis' } };
const deep = (a, b) => { const o = structuredClone(a); for (const [k, v] of Object.entries(b)) o[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? deep(o[k] || {}, v) : v; return o; };
const VARIANTS = {
  'app (Referenz)': APP,
  'flowchart.curve linear': deep(APP, { flowchart: { curve: 'linear' } }),
  'theme dark': deep(APP, { theme: 'dark' }),
  'securityLevel loose': deep(APP, { securityLevel: 'loose' }),
  'fontSize 20': deep(APP, { fontSize: 20, themeVariables: { fontSize: '20px' } }),
  'flowchart.nodeSpacing 20': deep(APP, { flowchart: { nodeSpacing: 20 } }),
  'flowchart.rankSpacing 40': deep(APP, { flowchart: { rankSpacing: 40 } }),
  'swimlane.ignoreCrossLaneEdges false': deep(APP, { swimlane: { ignoreCrossLaneEdges: false } }),
  'swimlane.optimizeRanksByCrossings false': deep(APP, { swimlane: { optimizeRanksByCrossings: false } }),
  'swimlane.automaticLaneOrdering true': deep(APP, { swimlane: { automaticLaneOrdering: true } }),
  'swimlane.lineHops false': deep(APP, { swimlane: { lineHops: false } }),
};
const names = fixtureNames();
const fxs = names.map(readFixture);
const PAGE = R + 'dist/dokufix.html';
const libraries = await prepareLibraries(PAGE);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const out = {};
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await libraries.serve(context);
  const page = await context.newPage();
  await page.goto(pathToFileURL(PAGE).href);
  await page.waitForFunction(() => !!document.querySelector('#dokufix-rail.has-items'), null, { timeout: 90000 });
  await page.addScriptTag({ content: await captureBundle() });
  const models = fxs.map(fx => readModel(fx.xml).model);
  let run = 0;
  const rawsFor = async (config, mods = models) => page.evaluate(async ({ config, models, run }) => {
    mermaid.initialize(config);
    const res = [];
    for (let i = 0; i < models.length; i++){
      try { res.push(await window.dokufixCapture.mermaidPositions(models[i], document, 'x' + run + '-' + i)); }
      catch (e){ res.push({ error: String(e && e.message || e) }); }
    }
    return res;
  }, { config, models: mods, run: ++run });
  const cols = raw => { const xs = [...new Set(Object.values(raw.nodes).map(n => Math.round(n.cx)))].sort((a, b) => a - b); return Object.fromEntries(Object.entries(raw.nodes).map(([k, n]) => [k, xs.indexOf(Math.round(n.cx))])); };
  for (const [label, config] of Object.entries(VARIANTS)){
    const t0 = Date.now();
    const raws = await rawsFor(config);
    const ms = Date.now() - t0;
    let rawSame = 0, cxSame = 0, colSame = 0, xmlSame = 0, errors = 0; const differ = [];
    raws.forEach((raw, i) => {
      if (raw.error){ errors++; differ.push(names[i] + ' (Fehler)'); return; }
      const fx = fxs[i];
      if (JSON.stringify(raw) === JSON.stringify(fx.raw)) rawSame++;
      if (Object.keys(fx.raw.nodes).every(k => raw.nodes[k] && raw.nodes[k].cx === fx.raw.nodes[k].cx)) cxSame++;
      if (JSON.stringify(cols(raw)) === JSON.stringify(cols(fx.raw))) colSame++;
      const xml = layOut({ ...fx, raw }, 'estimated');
      if (xml === fs.readFileSync(expectedFile(names[i], 'estimated'), 'utf8')) xmlSame++; else differ.push(names[i]);
    });
    out[label] = { n: raws.length, rawSame, cxSame, colSame, xmlSame, errors, ms, differ };
    console.log(label.padEnd(42), JSON.stringify(out[label]));
  }
  // Directive in a label: the first task of r01 gets one.
  await page.evaluate(c => mermaid.initialize(c), APP);
  const i = names.indexOf('r01');
  const base = models[i];
  const task = base.nodes.find(n => n.type === 'task');
  const injected = structuredClone(base);
  injected.nodes.find(n => n.id === task.id).name = task.name + " %%{init: {'swimlane': {'automaticLaneOrdering': true, 'optimizeRanksByCrossings': false}, 'flowchart': {'rankSpacing': 300}}}%%";
  const [a, b] = await rawsFor(APP, [base, injected]);
  console.log('directive r01: cx equal', JSON.stringify(a.nodes) === JSON.stringify(b.nodes), 'cols equal', JSON.stringify(cols(a)) === JSON.stringify(cols(b)));
  console.log('cx before', JSON.stringify(Object.fromEntries(Object.entries(a.nodes).map(([k, v]) => [k, v.cx]))));
  console.log('cx after ', JSON.stringify(Object.fromEntries(Object.entries(b.nodes).map(([k, v]) => [k, v.cx]))));
  // Does it leak into the next render?
  const [c] = await rawsFor(APP, [base]);
  console.log('next render unaffected', JSON.stringify(c.nodes) === JSON.stringify(a.nodes));
  // Timing: render vs extraction (getBBox, data-points)
  const timing = await page.evaluate(async ({ srcs }) => {
    let render = 0, nodes = 0, rest = 0;
    for (let i = 0; i < srcs.length; i++){
      const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0;width:4000px;height:3000px;overflow:hidden'; document.body.appendChild(host);
      const t0 = performance.now();
      const { svg } = await mermaid.render('tm-' + i, srcs[i], host);
      const t1 = performance.now();
      host.innerHTML = svg; const root = host.querySelector('svg');
      const t2 = performance.now();
      for (const g of root.querySelectorAll('g.node')) { g.getAttribute('transform'); g.getBBox(); }
      const t3 = performance.now();
      for (const g of root.querySelectorAll('g.cluster.swimlane[data-id]')) for (const r of g.querySelectorAll('rect.swimlane-body, rect.swimlane-title')) r.getBBox();
      for (const p of root.querySelectorAll('path[data-edge="true"][data-id]')) { try { JSON.parse(atob(p.getAttribute('data-points'))); } catch {} }
      const t4 = performance.now();
      render += t1 - t0; nodes += t3 - t2; rest += t4 - t3; host.remove();
    }
    return { render, nodes, rest };
  }, { srcs: models.map(mermaidSource) }).catch(e => String(e));
  console.log('timing', timing);
  fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'experiment.json'), JSON.stringify(out, null, 1));
} finally { await browser.close(); }
