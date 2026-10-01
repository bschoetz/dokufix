// Lädt den UNVERÄNDERTEN PoC (poc/dokufix-poc.html), setzt nur den Editor-Inhalt im Browser
// und prüft, ob ein ```mermaid-Block mit `swimlane-beta` heute schon rendert. Schreibt nichts in poc/.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const poc = path.resolve(here, '../../../poc/dokufix-poc.html');
const body = fs.readFileSync(path.join(here, 'prozess1.mmd'), 'utf8');
const md = '# Test\n\nSwimlane im unveränderten PoC:\n\n```mermaid\nswimlane-beta LR\n' + body + '```\n\n> [!NOTE]\n> Callout-Test\n\n| a | b |\n|---|---|\n| 1 | `x` |\n';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto('file://' + poc);
await page.waitForFunction(() => typeof render === 'function' && typeof mermaid !== 'undefined');
await page.waitForTimeout(800);
const info = await page.evaluate(async (md) => {
  document.getElementById('source').value = md;
  await render();
  const svg = document.querySelector('#preview .mermaid svg');
  return { mermaid: (mermaid.version && (typeof mermaid.version === 'function' ? mermaid.version() : mermaid.version)) || '?',
           marked: (typeof marked.version !== 'undefined' ? marked.version : '?'),
           hasSvg: !!svg, lanes: document.querySelectorAll('#preview .mermaid .swimlane').length,
           foreignObjects: document.querySelectorAll('#preview .mermaid foreignObject').length,
           blockquote: document.querySelector('#preview blockquote')?.outerHTML.slice(0, 200) };
}, md);
console.log(JSON.stringify(info, null, 1));
await page.locator('#preview').screenshot({ path: path.join(here, 'out', 'poc-unveraendert-swimlane.png') });
await browser.close();
