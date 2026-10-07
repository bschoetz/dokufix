// Die Laufzeit des Layouts in Chromium und Firefox, so wie die Seite anordnet (readProcess(), kanonisch(),
// layoutGeometry(), appendDiagram(); layoutBpmn() in src/app/bpmn.js), je drei Läufe; eine Zeile je Browser und
// Eingabe. Aus Spike 2.26 im Store übernommen (Story 2.12), 2026-10-07 auf LMM umgestellt.
//   node tools/bpmn-layout/browser-zeit.mjs [--satz s,s] [name…]
// Vorgabe: die Pool-Sätze. CHROMIUM und FIREFOX setzen die Browser; sonst /usr/bin/chromium und das Firefox von
// Playwright unter ~/.cache/ms-playwright.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as esbuild from 'esbuild';
import { chromium, firefox } from 'playwright-core';
import { REPO, POOL_SAETZE, namesOf, readInput, args } from './lib.mjs';

const a = args(process.argv.slice(2));
const names = a._.length ? a._ : namesOf(a.satz ? a.satz.split(',') : POOL_SAETZE);
const bundle = (await esbuild.build({
  stdin: { contents: "import { readProcess, layoutGeometry, appendDiagram } from './src/app/bpmn-layout.js'; import { kanonisch, lmmPositions } from './src/app/lmm.js'; window.L = { readProcess, layoutGeometry, appendDiagram, kanonisch, lmmPositions };", resolveDir: REPO, loader: 'js' },
  bundle: true, format: 'iife', write: false, logLevel: 'silent',
})).outputFiles[0].text;
const inputs = names.map(n => ({ name: n, xml: readInput(n).xml }));
const ff = process.env.FIREFOX || (() => { const d = path.join(os.homedir(), '.cache/ms-playwright'); const v = fs.readdirSync(d).filter(x => x.startsWith('firefox-')).sort().pop(); return path.join(d, v, 'firefox/firefox'); })();
for (const [label, launch] of [['chromium', () => chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium' })], ['firefox', () => firefox.launch({ executablePath: ff })]]){
  const browser = await launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>t</title>');
  await page.addScriptTag({ content: bundle });
  for (const x of inputs){
    const ms = await page.evaluate(({ xml }) => {
      const out = [];
      for (let i = 0; i < 3; i++){
        const t0 = performance.now();
        const { model } = window.L.readProcess(new DOMParser().parseFromString(xml, 'application/xml'));
        const sorted = window.L.kanonisch(model);
        window.L.appendDiagram(xml, model, window.L.layoutGeometry(sorted.model, window.L.lmmPositions(sorted.model, sorted.rank)));
        out.push(Math.round(performance.now() - t0));
      }
      return out;
    }, x);
    console.log(label, x.name, 'ms', ms.join(' '));
  }
  await browser.close();
}
