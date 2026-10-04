// How long a search takes in a large document: probe 1 of the audit of the
// search (docs/audit-suchfunktion.md), as a script, so that a build before a
// change and one after it can be measured alike (story 5.16, finding N5).
//
//   node tests/messung-suche.mjs                       # dist/dokufix.html
//   node tests/messung-suche.mjs --file <file>         # any other built file, a baseline say
//   node tests/messung-suche.mjs --rounds 7            # searches per term (default 5)
//
// Chromium from /usr/bin/chromium (CHROMIUM overrides it), the libraries
// served from tests/.cdn/ as in the browser runs (tests/cdn.mjs). The page
// renders the document of the audit's probe 1 (probe() below), 284 187
// characters of Markdown. In read mode "/" opens the panel; then the terms
// of the audit's table are typed in turn, each `rounds` times:
// "zitronenfalter", "hirschkäfer", "absatz", "wespen". A search is timed from the
// `input` event of its typing to the change of the summary, the pause of
// 150 ms included, as the audit timed it, and without it, which is the
// search itself; beside that the longest task on the main thread in that time
// (PerformanceObserver "longtask", which lists only tasks of 50 ms and more:
// 0 for none). The very first search after the render is reported apart: it
// is the one that reads the document first.
//
// Prints one line per term with the median and the spread, and the first
// search; exit 0 unless the page does not come up.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { prepareLibraries } from './cdn.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const file = path.resolve(arg('--file', path.join(here, '../dist/dokufix.html')));
const rounds = Number(arg('--rounds', 5));
const TERMS = ['zitronenfalter', 'hirschkäfer', 'absatz', 'wespen'];

// The document of probe 1, as the audit counts it (its section "Sonden",
// the table under N5): 400 sections, each an H2; a paragraph with "Absatz"
// four times; a list of three items, each with "Zitronenfalter"; a table whose
// header names an "Absatzart" and whose one row holds "Zitronenfalter" and
// "Hirschkäfer"; an H3 with "Absatz" and a paragraph with "Absatz" five times
// and neither animal. Then an appendix, one paragraph with "Wespen" 3 000
// times. So "zitronenfalter" has 1 600 hits at 1 600 places, "hirschkäfer"
// 400 at 400, "absatz" 4 400 at 1 600 places in 800 sections, "wespen" 3 000
// at one place; the filler brings the Markdown to the audit's 284 187
// characters.
function probe(){
  const parts = ['# Große Datei', ''];
  for (let n = 1; n <= 400; n++){
    parts.push('## Abschnitt ' + n, '',
      'Erster Absatz im Abschnitt ' + n + '. Ein Absatz, noch ein Absatz und ein letzter Absatz, dazu Worte über Wiesen, Hecken und Weiden am Bach.', '',
      '- Ein Zitronenfalter am Waldrand, früh im Jahr unterwegs',
      '- Ein Zitronenfalter auf dem Blatt einer Brennnessel',
      '- Ein Zitronenfalter an den Blüten der Salweide', '',
      '| Absatzart | Art | Fundort |', '|---|---|---|',
      '| Notiz | Zitronenfalter und Hirschkäfer | Eichenstumpf ' + n + ' |', '',
      '### Unterabschnitt ' + n + ' mit Absatz', '',
      'Ein Absatz ohne die gesuchten Tiere; Absatz zwei, Absatz drei, Absatz vier und Absatz fünf über Wind, Wetter und die Uhrzeit.' +
      ' Am Abend zog Regen auf, und die Beobachtung endete hinter der Scheune.', '');
  }
  parts.push('## Anhang', '', 'Wespen '.repeat(3000).trim(), '');
  const text = parts.join('\n');
  // The rest, a last paragraph of filler, none of the terms in it.
  const rest = AUDIT_LENGTH - text.length - 2;
  return rest > 0 ? text + '\n' + 'Rest '.repeat(rest).slice(0, rest).trimEnd().padEnd(rest, '.') + '\n' : text;
}
// The length of the audit's Markdown.
const AUDIT_LENGTH = 284187;

const median = xs => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
// The pause of the search after typing (PAUSE in src/app/search.js).
const PAUSE = 150;
const ms = x => Math.round(x) + ' ms';

const libraries = await prepareLibraries(file);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium' });
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'de-DE' });
  await libraries.serve(context);
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => !!document.querySelector('#dokufix-rail.has-items'), null, { timeout: 90000 });
  const md = probe();
  await page.evaluate(text => {
    const el = document.getElementById('source');
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const marker = document.createElement('i');
    marker.id = 'messung-render-pending';
    document.getElementById('dokufix-rail').appendChild(marker);
    document.getElementById('render-btn').click();
  }, md);
  await page.waitForFunction(() => !document.getElementById('messung-render-pending'), null, { timeout: 90000 });
  await page.evaluate(() => { document.getElementById('view-btn').click(); });
  await page.waitForFunction(() => document.body.classList.contains('mode-view'));
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.keyboard.press('/');
  await page.waitForFunction(() => { const p = document.querySelector('body > .search-panel'); return p && !p.hidden; });

  // One search: the term typed at once, timed to the change of the summary.
  const searchOnce = term => page.evaluate(t => new Promise(resolve => {
    const p = document.querySelector('body > .search-panel');
    const input = p.querySelector('input'), summary = p.querySelector('[role="status"]');
    summary.textContent = 'messung: pending';
    let longest = 0;
    const tasks = new PerformanceObserver(list => { for (const e of list.getEntries()) longest = Math.max(longest, e.duration); });
    tasks.observe({ type: 'longtask' });
    const start = performance.now();
    const seen = new MutationObserver(() => {
      if (summary.textContent === 'messung: pending') return;
      const total = performance.now() - start;
      seen.disconnect();
      // The longtask entry comes after its task: one frame later.
      setTimeout(() => { tasks.disconnect(); const lit = window.CSS && CSS.highlights && CSS.highlights.get('search-hit'); resolve({ total, task: longest, summary: summary.textContent, results: p.querySelectorAll('.search-result').length, marks: p.querySelectorAll('.search-result mark').length, ranges: lit ? lit.size : 0 }); }, 50);
    });
    seen.observe(summary, { childList: true, characterData: true, subtree: true });
    input.value = t;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }), term);

  const first = await searchOnce(TERMS[0]);
  const times = Object.fromEntries(TERMS.map(t => [t, []]));
  const seen = {};
  for (let r = 0; r < rounds; r++){
    for (const term of TERMS){
      const t = await searchOnce(term);
      times[term].push(t);
      seen[term] = t.summary + ', ' + t.results + ' results, ' + t.marks + ' marks, ' + t.ranges + ' ranges highlighted';
    }
  }
  console.log('file: ' + path.relative(process.cwd(), file) + ' (' + fs.statSync(file).size + ' B), Markdown ' + md.length + ' characters, ' + rounds + ' searches per term');
  console.log('first search, "' + TERMS[0] + '": ' + ms(first.total) + ' with the pause, ' + ms(first.total - PAUSE) + ' without it, longest task ' + ms(first.task) + '; ' + first.summary);
  for (const term of TERMS){
    const total = times[term].map(t => t.total), task = times[term].map(t => t.task);
    console.log('"' + term + '": median ' + ms(median(total)) + ' with the pause (' + ms(Math.min(...total)) + ' to ' + ms(Math.max(...total)) + '), ' + ms(median(total) - PAUSE) + ' without it, longest task median ' + ms(median(task)) + '; ' + seen[term]);
  }
} finally {
  await browser.close();
}
