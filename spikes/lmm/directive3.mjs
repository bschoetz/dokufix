import { pathToFileURL } from 'node:url';
const R = '/home/user/dokufix/';
const { chromium } = await import(R + 'node_modules/playwright-core/index.mjs');
const { captureBundle } = await import(R + 'tests/capture-bpmn.mjs');
const { prepareLibraries } = await import(R + 'tests/cdn.mjs');
const { readFixture, readModel } = await import(R + 'tests/bpmn-fixtures.mjs');
const PAGE = R + 'dist/dokufix.html';
const libraries = await prepareLibraries(PAGE);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  const context = await browser.newContext(); await libraries.serve(context);
  const page = await context.newPage();
  await page.goto(pathToFileURL(PAGE).href);
  await page.waitForFunction(() => !!document.querySelector('#dokufix-rail.has-items'), null, { timeout: 90000 });
  await page.addScriptTag({ content: await captureBundle() });
  const model = readModel(readFixture('r01').xml).model;
  const task = model.nodes.find(n => n.type === 'task');
  const flowNamed = model.flows.find(f => f.name);
  for (const label of ['Rabatt 5 %%', 'Wert %%{betrag}', 'Wert %%{betrag}%%', '%%{wrap}%%', 'Platzhalter %{x}', 'Vorlage %%{', '%%{init: {"theme": "dark"}}%%']){
    const m = structuredClone(model); m.nodes.find(n => n.id === task.id).name = label;
    const r = await page.evaluate(async ({ m, i }) => { try { const raw = await window.dokufixCapture.mermaidPositions(m, document, i); return 'angeordnet, ' + Object.keys(raw.nodes).length + ' Knoten'; } catch (e){ return 'Fehler: ' + String(e.message || e).split('\n')[0]; } }, { m, i: 'd' + label.length + Math.random().toString(36).slice(2) });
    console.log(JSON.stringify(label).padEnd(34), r);
  }
  if (flowNamed){ const m = structuredClone(model); m.flows.find(f => f.id === flowNamed.id).name = 'ja %%{'; console.log('Flussname "ja %%{"', await page.evaluate(async ({ m }) => { try { await window.dokufixCapture.mermaidPositions(m, document, 'fl'); return 'angeordnet'; } catch (e){ return 'Fehler: ' + String(e.message).split('\n')[0]; } }, { m })); }
} finally { await browser.close(); }
