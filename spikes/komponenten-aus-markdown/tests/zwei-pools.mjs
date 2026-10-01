// Versuch: BPMN-XML mit zwei Pools und Nachrichtenflüssen, ohne Koordinaten.
// Alle Bahnen beider Pools gehen als eine Mermaid-Swimlane in die Anordnung, Nachrichtenflüsse als Kanten.
// Danach bekommt jeder Pool seinen Rahmen und einen Abstand zum nächsten.
// node tests/zwei-pools.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { assemble, here } from '../assemble.mjs';
const out = f => path.join(here, 'tests', 'out', f);
const fence = '```';
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['diagramme/abo-zwei-pools.bpmn', 'diagramme/bestellung-drei-pools.bpmn'];
const md = '# Zwei Pools\n\n## Versuch\n\n' + files.map(f => '### ' + path.basename(f, '.bpmn') + '\n\n' + fence + 'bpmn\n' + fs.readFileSync(path.join(here, f), 'utf8') + fence + '\n').join('\n');
const local = p => 'file://' + path.join(here, 'node_modules', p);
fs.writeFileSync(out('_zwei-pools.html'), assemble(md)
  .replace('https://cdn.jsdelivr.net/npm/marked@18/lib/marked.umd.js', local('marked/lib/marked.umd.js'))
  .replace('https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.min.js', local('mermaid/dist/mermaid.min.js'))
  .replace('https://cdn.jsdelivr.net/npm/bpmn-js@18/dist/bpmn-navigated-viewer.production.min.js', local('bpmn-js/dist/bpmn-navigated-viewer.production.min.js')));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 2600, height: 1400 } });
page.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
await page.goto('file://' + out('_zwei-pools.html'));
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
console.log('Warnungen:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.dokufix-warnung')].map(w => w.textContent))));
await page.evaluate(() => { document.querySelector('.dokufix-wrap').style.cssText = 'display:block;max-width:none'; document.querySelectorAll('.dokufix-stage').forEach(s => { s.style.maxWidth = 'none'; const svg = s.querySelector('svg'); svg.style.width = svg.viewBox.baseVal.width + 'px'; }); });
const figs = page.locator('figure.dokufix-diagram-bpmn');
for (let i = 0; i < await figs.count(); i++) {
  const name = path.basename(files[i], '.bpmn');
  const info = await figs.nth(i).evaluate(f => { const c = k => f.querySelectorAll('.dokufix-bpmn-' + k).length; const s = f.querySelector('svg'); return { breite: Math.round(s.viewBox.baseVal.width), hoehe: Math.round(s.viewBox.baseVal.height), pools: c('participant'), bahnen: c('lane'), sequenzfluesse: c('sequenceflow'), nachrichtenfluesse: c('messageflow') }; });
  console.log(name, JSON.stringify(info));
  await figs.nth(i).locator('.dokufix-stage svg').screenshot({ path: out(name + '.png') });
  fs.writeFileSync(out(name + '.bpmn'), await figs.nth(i).evaluate(f => decodeURIComponent(f.querySelector('a[download]').getAttribute('href').split(',').slice(1).join(','))));
}
await browser.close();
