import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const body = fs.readFileSync(path.join(here, 'prozess2.mmd'), 'utf8');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.goto('file://' + path.join(here, 'out', '_mermaid.html'));
for (const dir of ['TB', 'LR']) {
  const r = await page.evaluate(async ([dir, src]) => {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose', flowchart: { rankSpacing: 36, nodeSpacing: 20 }, themeVariables: { fontSize: '13px' } });
    const out = document.getElementById('out');
    const { svg } = await mermaid.render('g' + Math.random().toString(36).slice(2), 'swimlane-beta ' + dir + '\n' + src);
    out.innerHTML = svg;
    const el = out.querySelector('svg'); const vb = el.viewBox.baseVal;
    el.style.maxWidth = 'none'; el.setAttribute('width', vb.width); el.setAttribute('height', vb.height);
    return Math.round(vb.width) + ' x ' + Math.round(vb.height);
  }, [dir, body]);
  console.log('Prozess 2', dir, r);
  await page.locator('#out svg').screenshot({ path: path.join(here, 'out', 'mermaid-p2-' + dir + '.png') });
}
await browser.close();
