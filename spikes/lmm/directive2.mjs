import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const R = '/home/user/dokufix/';
const { chromium } = await import(R + 'node_modules/playwright-core/index.mjs');
const { captureBundle } = await import(R + 'tests/capture-bpmn.mjs');
const { prepareLibraries } = await import(R + 'tests/cdn.mjs');
const { readFixture, readModel, layOut, expectedFile } = await import(R + 'tests/bpmn-fixtures.mjs');
const PAGE = R + 'dist/dokufix.html';
const libraries = await prepareLibraries(PAGE);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await libraries.serve(context);
  const page = await context.newPage();
  const logs = []; page.on('console', m => logs.push(m.type() + ': ' + m.text().slice(0, 160)));
  await page.goto(pathToFileURL(PAGE).href);
  await page.waitForFunction(() => !!document.querySelector('#dokufix-rail.has-items'), null, { timeout: 90000 });
  await page.addScriptTag({ content: await captureBundle() });
  for (const name of ['r19', 'r20', 'pools-bestellung', 'angeheftet-antrag']){
    const fx = readFixture(name), model = readModel(fx.xml).model;
    const task = model.nodes.find(n => n.type === 'task');
    for (const [label, suffix] of [['ohne', ''], ['Direktive', " %%{init: {'swimlane': {'ignoreCrossLaneEdges': false}}}%%"], ['kaputt', ' %%{init: {kaputt']]){
      const m = structuredClone(model); m.nodes.find(n => n.id === task.id).name = task.name + suffix;
      const raw = await page.evaluate(async ({ m, i }) => { try { return await window.dokufixCapture.mermaidPositions(m, document, i); } catch (e){ return { error: String(e.message || e) }; } }, { m, i: name + label });
      if (raw.error){ console.log(name, label, 'Fehler:', raw.error); continue; }
      const same = layOut({ ...fx, raw }, 'estimated') === fs.readFileSync(expectedFile(name, 'estimated'), 'utf8');
      console.log(name.padEnd(18), label.padEnd(10), 'Layout wie Fixture:', same);
    }
  }
  console.log(logs.filter(l => /directive|ERROR/i.test(l)).slice(0, 4).join('\n'));
} finally { await browser.close(); }
