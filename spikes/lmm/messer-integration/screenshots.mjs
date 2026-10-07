// Die BPMN-Diagramme ohne Koordinaten des Demo-Texts, vorher und nachher, als Bilder: die gebaute Seite vor der
// Integration des Messers (Beschriftungen in der Systemschrift des Rechners gemessen und gezeichnet) und danach
// (Beschriftungen vom Messer in Arial-Maßen gemessen, gezeichnet in "Arial, sans-serif"), in Chromium mit dem
// CDN-Spiegel der Browserläufe (tests/cdn.mjs). Schreibt je Diagramm <n>-vorher.png und <n>-nachher.png hierher und
// bilder.json mit Titel, Größe des SVG und der Schrift, die Chromium für die Beschriftungen genommen hat.
//
//   node spikes/lmm/messer-integration/screenshots.mjs <vorher.html> [<nachher.html>]
//   CHROMIUM=/opt/pw-browsers/chromium
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '../../..');
const { chromium } = await import(path.join(root, 'node_modules/playwright-core/index.mjs'));
const { prepareLibraries } = await import(path.join(root, 'tests/cdn.mjs'));
const CHROMIUM = process.env.CHROMIUM || '/usr/bin/chromium';
const [vorher, nachher = path.join(root, 'dist/dokufix.html')] = process.argv.slice(2);
if (!vorher) throw new Error('usage: node screenshots.mjs <vorher.html> [<nachher.html>]');

const browser = await chromium.launch({ executablePath: CHROMIUM });
const report = {};
try {
  for (const [tag, file] of [['vorher', vorher], ['nachher', nachher]]){
    const libraries = await prepareLibraries(file);
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
    await libraries.serve(context);
    const page = await context.newPage();
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => !!document.querySelector('#dokufix-rail.has-items'), null, { timeout: 90000 });
    // Die Lesemodus-Ansicht, damit die Spalte die Breite der Exporte hat.
    const figures = page.locator('figure.dokufix-diagram-bpmn');
    const n = await figures.count();
    report[tag] = [];
    for (let i = 0; i < n; i++){
      const fig = figures.nth(i);
      const info = await fig.evaluate(el => {
        const svg = el.querySelector('svg');
        const text = svg && svg.querySelector('text');
        return { title: el.getAttribute('aria-label') || (svg && svg.getAttribute('aria-label')), width: svg && svg.getAttribute('style'), font: text ? getComputedStyle(text).fontFamily : null, labels: svg ? svg.querySelectorAll('text').length : 0 };
      });
      await fig.scrollIntoViewIfNeeded();
      const picture = path.join(here, String(i + 1).padStart(2, '0') + '-' + tag + '.png');
      await fig.screenshot({ path: picture });
      report[tag].push({ ...info, picture: path.basename(picture) });
    }
    await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(here, 'bilder.json'), JSON.stringify(report, null, 1) + '\n');
console.log(Object.entries(report).map(([tag, list]) => tag + ': ' + list.length + ' Diagramme, Schrift ' + [...new Set(list.map(x => x.font))].join(' | ')).join('\n'));
