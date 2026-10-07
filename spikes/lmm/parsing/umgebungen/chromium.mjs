// Chromiums DOMParser: Playwright (playwright-core aus node_modules des
// Repositorys) startet /opt/pw-browsers/chromium, eine Seite unter einer
// erfundenen Adresse bekommt src/app/bpmn-layout.js und lesen.mjs vom
// Dateisystem; lesen() läuft dort mit new DOMParser().parseFromString(xml,
// 'application/xml'), wie layoutBpmn() in src/app/bpmn.js.
//   chromiumLesen(faelle) → { [name]: ergebnis }, dazu .info
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const R = '/home/user/dokufix/';
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(R + 'node_modules/playwright-core/index.mjs');

export const name = 'chromium';
const SRC = {
  '/bpmn-layout.js': R + 'src/app/bpmn-layout.js',
  '/lesen.mjs': path.join(here, '..', 'lesen.mjs'),
};
const PAGE = '<!doctype html><html><head><meta charset="utf-8"><title>parsing</title></head><body></body></html>';

export async function chromiumLesen(faelle, { log = () => {} } = {}){
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage();
    await page.route('https://parsing.local/**', route => {
      const p = new URL(route.request().url()).pathname;
      if (p === '/' || p === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
      if (SRC[p]) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(SRC[p], 'utf8') });
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto('https://parsing.local/index.html');
    const info = await page.evaluate(() => 'Chromium ' + (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1] + ' (DOMParser, libxml2)');
    const out = {};
    // In Häppchen, damit die Argumente der Auswertung klein bleiben.
    for (let i = 0; i < faelle.length; i += 20){
      const chunk = faelle.slice(i, i + 20).map(f => ({ name: f.name, xml: f.xml }));
      const res = await page.evaluate(async chunk => {
        const layout = await import('/bpmn-layout.js');
        const { lesen } = await import('/lesen.mjs');
        const parse = xml => new DOMParser().parseFromString(xml, 'application/xml');
        const out = {};
        for (const { name, xml } of chunk) out[name] = lesen(parse, layout.readProcess, xml);
        return out;
      }, chunk);
      Object.assign(out, res);
      log(name + ': ' + Math.min(i + 20, faelle.length) + '/' + faelle.length);
    }
    return { info, results: out };
  } finally { await browser.close(); }
}
