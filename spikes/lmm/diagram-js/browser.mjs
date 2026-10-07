// Die gebaute Seite dist/dokufix.html in Chromium, mit den Bibliotheken aus dem CDN-Spiegel (tests/cdn.mjs),
// wie tests/capture-bpmn.mjs und spikes/lmm/messen/probe.mjs. Dazu zwei Bündel, die in die Seite gehen:
//  - window.dokufixCapture: labelMeasurer() und BPMN_VIEWER_CONFIG aus src/app/bpmn.js (captureBundle() der Tests)
//  - window.vendorText: TextRenderer von bpmn-js 18.31.0 und Text von diagram-js 15.28.0 aus den npm-Quellen
//    im Vendor-Ordner des Scratchpads, per esbuild gebündelt (fremder Code, bleibt außerhalb des Repositorys).
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';

export const R = '/home/user/dokufix/';
export const VENDOR = '/tmp/claude-0/-home-user-dokufix/c7ad9c8e-4112-59bc-bff9-b496db1abe70/scratchpad/diagramjs-vendor/';
export const CHROMIUM = '/opt/pw-browsers/chromium';

export const esbuildAlias = {
  'diagram-js': VENDOR + 'diagram-js/package',
  'min-dash': VENDOR + 'min-dash/package/dist/index.js',
  'tiny-svg': VENDOR + 'tiny-svg/package/dist/index.js',
};

// Das Bündel der Vendor-Quellen: TextRenderer (bpmn-js) und Text (diagram-js) als window.vendorText.
export async function vendorBundle(minify = false){
  const esbuild = await import(R + 'node_modules/esbuild/lib/main.js');
  const result = await esbuild.build({
    stdin: {
      contents: "import TextRenderer from './lib/draw/TextRenderer';\nimport Text from 'diagram-js/lib/util/Text';\nwindow.vendorText = { TextRenderer, Text };\n",
      resolveDir: VENDOR + 'bpmn-js/package', loader: 'js',
    },
    alias: esbuildAlias, bundle: true, format: 'iife', write: false, charset: 'utf8', logLevel: 'silent', minify,
  });
  return result.outputFiles[0].text;
}

// Öffnet die Seite und ruft fn(page); die Bündel sind geladen.
export async function withPage(fn, { bundles = true } = {}){
  const { chromium } = await import(R + 'node_modules/playwright-core/index.mjs');
  const { prepareLibraries } = await import(R + 'tests/cdn.mjs');
  const { captureBundle } = await import(R + 'tests/capture-bpmn.mjs');
  const PAGE = R + 'dist/dokufix.html';
  if (!fs.existsSync(PAGE)) throw new Error('keine gebaute Seite: ' + PAGE);
  const libraries = await prepareLibraries(PAGE);
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await libraries.serve(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(pathToFileURL(PAGE).href);
    await page.waitForFunction(() => !!document.querySelector('#dokufix-rail.has-items'), null, { timeout: 90000 });
    if (bundles){
      await page.addScriptTag({ content: await captureBundle() });
      await page.addScriptTag({ content: await vendorBundle() });
    }
    const out = await fn(page);
    if (errors.length) throw new Error('Fehler auf der Seite: ' + errors.join('; '));
    if (libraries.refused.length) throw new Error('abgewiesene Anfragen: ' + libraries.refused.join(', '));
    return out;
  } finally { await browser.close(); }
}
