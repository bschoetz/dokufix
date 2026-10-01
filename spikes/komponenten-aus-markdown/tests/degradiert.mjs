// Fluchtweg-Probe: dasselbe Markdown durch marked OHNE die Dokufix-Pässe (so sieht es ein fremder Renderer).
import { marked } from 'marked';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const md = fs.readFileSync(path.resolve(here, '../beispiel-prozesse.md'), 'utf8');
const html = '<!doctype html><meta charset="utf-8"><body style="font:15px/1.5 system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px">' +
  '<style>table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}blockquote{border-left:4px solid #ccc;margin-left:0;padding-left:12px;color:#444}pre{background:#f4f4f4;padding:10px;overflow:auto;max-height:160px}code{background:#f4f4f4}</style>' +
  marked.parse(md, { gfm: true });
const f = path.join(here, 'out', 'degradiert-nur-marked.html');
fs.writeFileSync(f, html);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 900, height: 1500 } });
await page.goto('file://' + f);
await page.screenshot({ path: path.join(here, 'out', 'degradiert-nur-marked.png') });
await page.evaluate(() => document.querySelectorAll('h3')[1].scrollIntoView());
await page.screenshot({ path: path.join(here, 'out', 'degradiert-nur-marked-2.png') });
await browser.close();
