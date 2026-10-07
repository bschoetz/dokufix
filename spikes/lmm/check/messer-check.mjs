// Independent check of diagram-js/messer.mjs: own corpus run through labelMeasurer() in Chromium vs messer() in Node.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const R = '/home/user/dokufix/';
const { chromium } = await import(R + 'node_modules/playwright-core/index.mjs');
const { prepareLibraries } = await import(R + 'tests/cdn.mjs');
const { captureBundle, labelTexts, noteTexts } = await import(R + 'tests/capture-bpmn.mjs');
const { fixtureNames, readFixture, readModel } = await import(R + 'tests/bpmn-fixtures.mjs');
const { messer } = await import('../diagram-js/messer.mjs');
const measure = messer(JSON.parse(fs.readFileSync(new URL('../diagram-js/breiten-inter-12px.json', import.meta.url))));
const items = new Map();
for (const n of fixtureNames()){ const m = readModel(readFixture(n).xml).model; for (const t of labelTexts(m)) items.set(t, { text: t }); for (const x of noteTexts(m)) items.set(x.key, { text: x.text, width: x.width }); }
// a few own texts the agent did not choose
for (const t of ['Rechnung prüfen und freigeben', 'Kundendatenverwaltungsprozess', 'Zahlung > 10.000 €?', 'Ja / Nein', 'Übergabe an die Tourenplanung (intern)', 'Bestätigung „OK“ erhalten', 'x', 'Prüfen - und dann weiter', 'Zweite\nZeile']) items.set('own:' + t, { text: t });
const list = [...items.values()];
const libraries = await prepareLibraries(R + 'dist/dokufix.html');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  const context = await browser.newContext(); await libraries.serve(context);
  const page = await context.newPage();
  await page.goto(pathToFileURL(R + 'dist/dokufix.html').href);
  await page.waitForFunction(() => !!document.querySelector('#dokufix-rail.has-items'), null, { timeout: 90000 });
  await page.addScriptTag({ content: await captureBundle() });
  const ref = await page.evaluate(list => {
    const { labelMeasurer, BPMN_VIEWER_CONFIG } = window.dokufixCapture;
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;width:4000px;height:3000px'; document.body.appendChild(host);
    const v = new BpmnJS({ container: host, ...BPMN_VIEWER_CONFIG }), m = labelMeasurer(v);
    const out = list.map(i => m(i.text, i.width)); v.destroy(); host.remove(); return out;
  }, list);
  let same = 0; const bad = [];
  list.forEach((i, k) => { const p = measure(i.text, i.width); if (p.w === ref[k].w && p.h === ref[k].h) same++; else bad.push(JSON.stringify(i.text) + (i.width ? ' @' + i.width : '') + ': bpmn-js ' + ref[k].w + '×' + ref[k].h + ', messer ' + p.w + '×' + p.h); });
  console.log('Messungen:', list.length, '| exakt gleich:', same, '| abweichend:', bad.length); bad.slice(0, 8).forEach(b => console.log('  ' + b));
} finally { await browser.close(); }
