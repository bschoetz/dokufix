// Welche Stellschrauben machen das Swimlane-Diagramm kompakter? Misst die viewBox je Konfiguration.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const body = fs.readFileSync(path.join(here, 'prozess1.mmd'), 'utf8');
const compactEvents = body
  .replace('s((Probekiste<br>entdeckt))', 's([Probekiste entdeckt])')
  .replace(/\(\(\((.+?)\)\)\)/g, (_, t) => '([' + t.replace(/<br>/g, ' ') + '])');
const cases = {
  'default': [{}, body],
  'rank40-node20': [{ flowchart: { rankSpacing: 40, nodeSpacing: 20 } }, body],
  'rank20-node10': [{ flowchart: { rankSpacing: 20, nodeSpacing: 10 } }, body],
  'rank40-node20-font13': [{ flowchart: { rankSpacing: 40, nodeSpacing: 20 }, themeVariables: { fontSize: '13px' } }, body],
  'rank40-node20-ereignisse-als-pille': [{ flowchart: { rankSpacing: 40, nodeSpacing: 20 } }, compactEvents],
  'rank40-node20-pille-ranks-aus': [{ flowchart: { rankSpacing: 40, nodeSpacing: 20 }, swimlane: { optimizeRanksByCrossings: false } }, compactEvents],
  'rank40-node20-pille-crosslane': [{ flowchart: { rankSpacing: 40, nodeSpacing: 20 }, swimlane: { ignoreCrossLaneEdges: false } }, compactEvents],
};
const page0 = path.join(here, 'out', '_mermaid.html');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.goto('file://' + page0);
for (const [name, [cfg, src]] of Object.entries(cases)) {
  const r = await page.evaluate(async ([cfg, src]) => {
    mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose', ...cfg });
    const out = document.getElementById('out');
    try { const { svg } = await mermaid.render('g' + Math.random().toString(36).slice(2), 'swimlane-beta LR\n' + src); out.innerHTML = svg; }
    catch (e) { out.textContent = String(e); return String(e).slice(0, 200); }
    const vb = out.querySelector('svg').viewBox.baseVal;
    return Math.round(vb.width) + ' x ' + Math.round(vb.height);
  }, [cfg, src]);
  console.log(name.padEnd(40), r);
  await page.locator('#out').screenshot({ path: path.join(here, 'out', 'knobs-' + name + '.png') });
}
await browser.close();
