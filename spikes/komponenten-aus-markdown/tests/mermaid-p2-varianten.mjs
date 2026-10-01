// Prozess 2: Lässt sich das verhedderte Layout per Konfiguration oder einfacherer Modellierung beheben?
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const full = fs.readFileSync(path.join(here, 'prozess2.mmd'), 'utf8');
const simple = fs.readFileSync(path.join(here, 'prozess2-vereinfacht.mmd'), 'utf8');
const base = { flowchart: { rankSpacing: 36, nodeSpacing: 20 }, themeVariables: { fontSize: '13px' } };
const cases = {
  'voll-crosslane-beachten': [{ ...base, swimlane: { ignoreCrossLaneEdges: false } }, full],
  'voll-ohne-rangoptimierung': [{ ...base, swimlane: { optimizeRanksByCrossings: false } }, full],
  'voll-beides': [{ ...base, swimlane: { ignoreCrossLaneEdges: false, optimizeRanksByCrossings: false } }, full],
  'vereinfacht': [base, simple],
};
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.goto('file://' + path.join(here, 'out', '_mermaid.html'));
for (const [name, [cfg, src]] of Object.entries(cases)) {
  const r = await page.evaluate(async ([cfg, src]) => {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose', ...cfg });
    const out = document.getElementById('out');
    const { svg } = await mermaid.render('g' + Math.random().toString(36).slice(2), 'swimlane-beta TB\n' + src);
    out.innerHTML = svg;
    const el = out.querySelector('svg'); const vb = el.viewBox.baseVal;
    el.style.maxWidth = 'none'; el.setAttribute('width', vb.width); el.setAttribute('height', vb.height);
    return Math.round(vb.width) + ' x ' + Math.round(vb.height);
  }, [cfg, src]);
  console.log(name.padEnd(30), r);
  await page.locator('#out svg').screenshot({ path: path.join(here, 'out', 'mermaid-p2-TB-' + name + '.png') });
}
await browser.close();
