import { pathToFileURL } from 'node:url';
const R = '/home/user/dokufix/';
const { chromium } = await import(R + 'node_modules/playwright-core/index.mjs');
const { prepareLibraries } = await import(R + 'tests/cdn.mjs');
const PAGE = R + 'dist/bpmn-assistant.html';
const libraries = await prepareLibraries(R + 'dist/dokufix.html');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  for (const block of [false, true]){
    const context = await browser.newContext();
    await libraries.serve(context);
    if (block) await context.route(/npm\/mermaid@/, r => r.abort());
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
    await page.goto(pathToFileURL(PAGE).href); await page.waitForTimeout(4000);
    const info = await page.evaluate(() => ({ svgs: document.querySelectorAll('svg').length, mermaid: typeof mermaid, buttons: document.querySelectorAll('button').length, text: document.body.innerText.slice(0, 120).replace(/\s+/g, ' ') }));
    console.log(block ? 'Mermaid blockiert:' : 'Mermaid geladen:  ', JSON.stringify(info), 'Fehler:', JSON.stringify(errors));
    await context.close();
  }
} finally { await browser.close(); }
