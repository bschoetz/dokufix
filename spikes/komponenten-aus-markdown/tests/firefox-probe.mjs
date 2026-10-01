// Rendert spike.html in Firefox (Playwright-Build) und zählt dieselben Komponenten wie build.mjs.
import { firefox } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await firefox.launch({ executablePath: process.env.FIREFOX || (process.env.HOME + '/.cache/ms-playwright/firefox-1538/firefox/firefox') });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 200)));
await page.goto('file://' + path.resolve(here, '../spike.html'));
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
console.log('Firefox', browser.version(), JSON.stringify(await page.evaluate(() => ({
  diagrams: document.querySelectorAll('.dokufix-diagram svg').length, lanes: document.querySelectorAll('.dokufix-bpmn-lane').length,
  chips: document.querySelectorAll('.dokufix-chip').length, callouts: document.querySelectorAll('.dokufix-callout').length,
  widths: [...document.querySelectorAll('.dokufix-diagram svg')].map(s => Math.round(s.viewBox.baseVal.width)) }))));
await page.locator('.dokufix-facet-ui label', { hasText: 'Datum' }).click();
console.log('Facette "Datum" sichtbar:', await page.locator('.dokufix-table[id] tbody tr:visible').count(), 'Zeilen');
await page.locator('figure.dokufix-diagram .dokufix-stage').first().click();
console.log('Große Ansicht in Firefox:', await page.locator('figure.dokufix-diagram').first().evaluate(f => getComputedStyle(f).position));
await page.waitForSelector('.dokufix-live-canvas .bjs-powered-by', { timeout: 15000 });
console.log('Viewer mit Logo in Firefox:', await page.locator('.dokufix-live-canvas .bjs-powered-by').count());
await page.screenshot({ path: path.join(here, 'out', 'spike-firefox.png') });
await browser.close();
