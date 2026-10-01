// Große Diagrammansicht. Teil 1 ohne JavaScript am Export (Bild mit CSS-Zoomstufen).
// Teil 2 mit JavaScript an spike.html (laufender bpmn-js-Viewer: Logo, Zoomstufen, Mausrad, Ziehen, Schließen).
// Maus und Tastatur sind hier synthetisch. Das Verhalten bitte zusätzlich von Hand ansehen.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { here } from '../assemble.mjs';
const out = path.join(here, 'dist', 'screenshots');
const file = 'file://' + path.join(here, 'dist', 'beispiel-prozesse.nur-lesen.html');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium' });
const results = {};
for (const [tag, opts] of [['hell', {}], ['dunkel', { colorScheme: 'dark' }]]) {
  const ctx = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce', viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  await page.goto(file);
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  const figs = page.locator('figure.dokufix-diagram');
  for (let i = 0; i < await figs.count(); i++) {
    const fig = figs.nth(i);
    await fig.scrollIntoViewIfNeeded();
    await fig.screenshot({ path: path.join(out, `diagramm-${i + 1}-spalte-${tag}.png`) });
    if (tag !== 'hell') continue;
    await fig.locator('.dokufix-stage').click();                        // Klick auf das Diagramm öffnet die große Ansicht
    await page.waitForTimeout(150);
    const open = await fig.evaluate(f => { const r = f.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), getComputedStyle(f).position]; });
    await page.screenshot({ path: path.join(out, `diagramm-${i + 1}-gross-einpassen.png`) });
    await fig.locator('.dokufix-zoom-bar label', { hasText: '150 %' }).click();
    await page.waitForTimeout(150);
    const w150 = await fig.locator('.dokufix-stage svg').evaluate(s => Math.round(s.getBoundingClientRect().width));
    await page.screenshot({ path: path.join(out, `diagramm-${i + 1}-gross-150.png`) });
    await fig.locator('.dokufix-zoom-close').click();
    await page.waitForTimeout(150);
    const closed = await fig.evaluate(f => getComputedStyle(f).position);
    results['Diagramm ' + (i + 1)] = { offen: open, breiteBei150: w150, natuerlich: await fig.evaluate(f => f.style.getPropertyValue('--w')), nachSchliessen: closed };
  }
  await ctx.close();
}
console.log('Große Ansicht ohne JavaScript:', JSON.stringify(results, null, 1));

// --- Mit JavaScript: die große Ansicht ist der laufende bpmn-js-Viewer ---
const failures = [];
const expect = (label, actual, wanted) => {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  console.log((ok ? 'ok    ' : 'FEHLER') + ' ' + label + (ok ? '' : ': ' + JSON.stringify(actual) + ' statt ' + JSON.stringify(wanted)));
  if (!ok) failures.push(label);
};
for (const [tag, opts] of [['hell', {}], ['dunkel', { colorScheme: 'dark' }]]) {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.goto('file://' + path.join(here, 'spike.html'));
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
  const figs = page.locator('figure.dokufix-diagram-bpmn');
  for (let i = 0; i < await figs.count(); i++) {
    const fig = figs.nth(i);
    const scale = () => fig.evaluate(f => { const m = /matrix\(([-\d.e]+)[ ,]+[-\d.e]+[ ,]+[-\d.e]+[ ,]+[-\d.e]+[ ,]+([-\d.e]+)/.exec(f.querySelector('.dokufix-live-canvas g.viewport').getAttribute('transform') || ''); return m ? [+(+m[1]).toFixed(2), Math.round(+m[2])] : null; });
    await fig.scrollIntoViewIfNeeded();
    await fig.locator('.dokufix-stage').click();
    await page.waitForSelector('.dokufix-live-canvas g.viewport', { timeout: 15000 });
    await page.waitForTimeout(200);
    const state = await fig.evaluate(f => {
      const logo = f.querySelector('.dokufix-live-canvas .bjs-powered-by'), r = logo && logo.getBoundingClientRect();
      const top = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        viewer: !!f.querySelector('.dokufix-live-canvas .djs-container'),
        bildVersteckt: getComputedStyle(f.querySelector('.dokufix-stage')).display === 'none',
        logoSichtbar: !!r && r.width > 10 && r.bottom <= innerHeight && r.right <= innerWidth && !!top && logo.contains(top),
        hinweis: !!f.querySelector('.dokufix-live-hint'),
        klassen: f.querySelectorAll('.dokufix-live-canvas .dokufix-bpmn-lane').length
      };
    });
    expect(`[${tag}] Diagramm ${i + 1}: Viewer läuft, Bild versteckt, Logo sichtbar und unverdeckt, 4 Bahnen`, state, { viewer: true, bildVersteckt: true, logoSichtbar: true, hinweis: true, klassen: 4 });
    if (i === 0) expect(`[${tag}] Diagramm 1: „geplant“ und „gestrichelt“ auch im Viewer`, await fig.evaluate(f => [f.querySelectorAll('.dokufix-live-canvas .dokufix-bpmn-geplant').length, f.querySelectorAll('.dokufix-live-canvas .dokufix-bpmn-gestrichelt').length]), [2, 1]);
    await page.screenshot({ path: path.join(out, `diagramm-${i + 1}-viewer-${tag}.png`) });
    if (tag === 'hell') {
      await fig.locator('.dokufix-zoom-bar label', { hasText: '150 %' }).click();
      expect(`Diagramm ${i + 1}: Stufe 150 % stellt den Viewer auf 1,5`, (await scale())[0], 1.5);
      await page.screenshot({ path: path.join(out, `diagramm-${i + 1}-viewer-150.png`) });
      const before = await scale();
      await page.mouse.move(700, 500);
      await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.keyboard.up('Control');
      await page.waitForTimeout(150);
      const zoomed = await scale();
      await page.mouse.move(700, 500); await page.mouse.down(); await page.mouse.move(560, 500, { steps: 6 }); await page.mouse.up();
      await page.waitForTimeout(150);
      const dragged = await scale();
      expect(`Diagramm ${i + 1}: Strg + Mausrad vergrößert, Ziehen verschiebt`, [zoomed[0] > before[0], dragged[1] < zoomed[1]], [true, true]);
      await page.keyboard.press('Escape');
    } else {
      await fig.locator('.dokufix-zoom-close').click();
    }
    await page.waitForTimeout(150);
    expect(`[${tag}] Diagramm ${i + 1}: nach dem Schließen ist der Viewer weg und das Bild zurück`, await fig.evaluate(f => [f.querySelectorAll('.dokufix-live-canvas, .dokufix-live-hint').length, f.classList.contains('dokufix-live'), getComputedStyle(f).position, getComputedStyle(f.querySelector('.dokufix-stage')).display]), [0, false, 'relative', 'block']);
  }
  expect(`[${tag}] keine Seitenfehler`, errors, []);
  await ctx.close();
}
await browser.close();
if (failures.length) { console.error(failures.length + ' Prüfung(en) fehlgeschlagen.'); process.exit(1); }
