// Rendert prozess1.mmd mit verschiedenen Mermaid-Kopfzeilen/Layouts und macht Screenshots.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const body = fs.readFileSync(path.join(here, 'prozess1.mmd'), 'utf8');
const variants = {
  'flowchart-dagre': 'flowchart LR\n' + body,
  'swimlane-beta-LR': 'swimlane-beta LR\n' + body,
  'swimlane-beta-TB': 'swimlane-beta TB\n' + body,
};
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;font-family:sans-serif">
<script src="../../node_modules/mermaid/dist/mermaid.min.js"></script>
<div id="out"></div>
<script>
window.run = async (src) => {
  mermaid.initialize({ startOnLoad:false, theme:'default', securityLevel:'loose' });
  const out = document.getElementById('out');
  try { const { svg } = await mermaid.render('g' + Date.now(), src); out.innerHTML = svg; return { ok:true, bytes: svg.length }; }
  catch (e) { out.innerHTML = '<pre>' + String(e && e.message || e) + '</pre>'; return { ok:false, err:String(e && e.message || e) }; }
};
</script>`;
const page0 = path.join(here, 'out', '_mermaid.html');
fs.writeFileSync(page0, html);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('console', m => { if (m.type() === 'error') console.log('console.error:', m.text().slice(0, 300)); });
await page.goto('file://' + page0);
for (const [name, src] of Object.entries(variants)) {
  const t0 = Date.now();
  const r = await page.evaluate(s => window.run(s), src);
  console.log(name, JSON.stringify(r), (Date.now() - t0) + ' ms');
  await page.locator('#out').screenshot({ path: path.join(here, 'out', 'mermaid-' + name + '.png') });
  if (r.ok) fs.writeFileSync(path.join(here, 'out', 'mermaid-' + name + '.svg'), await page.evaluate(() => document.querySelector('#out').innerHTML));
}
await browser.close();
