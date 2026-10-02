// Comparison run for a dokufix file: dist/dokufix.html, or any other file that
// is a dokufix editor, such as the frozen poc/dokufix-poc.html.
//
// Builds all four download variants from ONE document in ONE run, reopens each
// like a recipient would, and records what they look like and how big they are:
//
//   node tests/vergleich.mjs --out tests/out/vorher
//   node tests/vergleich.mjs --out tests/out/nachher --compare tests/out/vorher
//
// Options
//   --out <dir>        where exports, screenshots and sizes.json go (required)
//   --compare <dir>    an earlier --out directory; reports differing pixels per image and size deltas
//   --browser <name>   chromium | firefox | all (default: all)
//   --file <file>      the file under test (default: ../dist/dokufix.html); --poc is an alias
//   --doc <file>       the Markdown to build from (default: referenz.md)
//   --demo             build from the built-in demo text instead of --doc
//   --strict           exit 1 when --compare finds any differing pixel
//
// Exit code 1 when an assertion fails (epic 1 behaviour, callouts, no <script> in
// nur-lesen, no editor rules in a read-only export). Differing pixels alone do not fail the
// run unless --strict is given: some differences are decided, and the run lists
// them so a human can attribute each one. An image that only one side has counts
// as differing. A --compare folder that holds no run for a browser, or that is
// the --out folder itself, stops the run with exit 1 before anything is built.
//
// Date and Math.random are replaced by deterministic stand-ins, because the
// read-only exports print their export time, Mermaid derives its SVG ids from
// Date.now(), and Mermaid 12 draws node outlines with randomised control points.
// Without that, two runs of the same file differ by a few dozen bytes and sizes
// could not be compared. The clock must still tick: with a frozen Date.now() every
// diagram gets the same id and Mermaid draws the second one into the first.
//
// Every reopened file gets its own browser process, so no page inherits state
// from the one before it.
//
// The run knows the page by its DOM only, never by a name of its script: the
// built file carries the script as one minified bundle, which has no global
// names. Three things it has to wait for, and what it watches instead:
//   - init is done:          #dokufix-rail has the class has-items. The rail is
//                            the last thing the first render builds.
//   - a render is finished:  the run puts a marker element into the rail and
//                            presses "Rendern". Every render ends by rewriting
//                            the rail, so the marker is gone when it is done.
//   - a download is through: no button[data-download] is disabled any more.
// That is why the same run works on the PoC, on the built file, and on a file
// whose script is cut differently.
//
// Known deviation, Firefox only. In the Playwright Firefox build the footnote
// preview does not appear on focus once a page has been open for about a second:
// the host matches :focus-within, the rule on its child does not take effect.
// Switching off position-try-fallbacks on the preview makes it appear. Measured
// on the untouched file, so it predates this harness. Where that happens the
// run switches the fallbacks off with a style tag, in the same way before and
// after, and says so in a note instead of failing. Chromium is never touched.
//
// Hover is deliberately not used: Playwright's synthetic mouse produced Firefox
// numbers that human review retracted (see src/README.md, Footnotes). The preview
// is revealed through :focus-within, which is the keyboard path and reliable.
//
// WebKit is not run. Its Playwright build does not start on this machine.

import { chromium, firefox } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------- arguments ----------
function parseArgs(argv){
  const a = { browser: 'all', file: path.resolve(here, '../dist/dokufix.html'), doc: path.join(here, 'referenz.md'), demo: false, strict: false };
  for (let i = 0; i < argv.length; i++){
    const k = argv[i];
    if (k === '--demo') a.demo = true;
    else if (k === '--strict') a.strict = true;
    else if (['--out', '--compare', '--browser', '--file', '--poc', '--doc'].includes(k)){
      if (argv[i + 1] === undefined) throw new Error(k + ' needs a value');
      a[k === '--poc' ? 'file' : k.slice(2)] = argv[++i];
    }
    else throw new Error('unknown argument: ' + k);
  }
  if (!a.out) throw new Error('--out <dir> is required');
  if (!['chromium', 'firefox', 'all'].includes(a.browser)) throw new Error('--browser must be chromium, firefox or all');
  a.out = path.resolve(a.out);
  a.file = path.resolve(a.file);
  if (!fs.existsSync(a.file)) throw new Error('file under test not found: ' + a.file);
  a.doc = path.resolve(a.doc);
  if (a.compare) a.compare = path.resolve(a.compare);
  // The run empties its output folder first. Pointed at the baseline, it would
  // delete what it is about to compare with and then report "identical".
  if (a.compare && a.compare === a.out) throw new Error('--out and --compare are the same folder; the run would delete its own baseline');
  return a;
}

// ---------- browsers ----------
function findFirefox(){
  if (process.env.FIREFOX) return process.env.FIREFOX;
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  const dirs = fs.existsSync(cache)
    ? fs.readdirSync(cache).filter(d => /^firefox-\d+$/.test(d)).sort((x, y) => Number(y.split('-')[1]) - Number(x.split('-')[1]))
    : [];
  for (const d of dirs){
    const exe = path.join(cache, d, 'firefox', 'firefox');
    if (fs.existsSync(exe)) return exe;
  }
  throw new Error('No Firefox found. Set FIREFOX=/path/to/firefox or install the Playwright build.');
}
const BROWSERS = {
  chromium: () => chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium' }),
  firefox:  () => firefox.launch({ executablePath: findFirefox() }),
};

// ---------- run constants ----------
const FIXED_NOW = new Date('2026-10-02T08:00:00Z');
const CONTEXT = { locale: 'de-DE', timezoneId: 'Europe/Berlin' };
const VARIANTS = [
  { key: 'mit-editor', download: 'full',             label: 'Mit Editor' },
  { key: 'nur-lesen',  download: 'readonly-open',    label: 'nur-lesen' },
  { key: 'schlank',    download: 'readonly-slim',    label: 'schlank' },
  { key: 'kompakt',    download: 'readonly-compact', label: 'kompakt' },
];
const READONLY = new Set(['nur-lesen', 'schlank', 'kompakt']);
const WIDTHS = [1400, 1600];
const SCHEMES = [['hell', 'light'], ['dunkel', 'dark']];

// Selectors that belong to the editor interface. None may appear in the
// stylesheet of a read-only export.
const EDITOR_RULES = [
  /#preview\b/, /\.mode-view\b/, /\.pane\b/, /\.pane-/, /\.layout\b/, /\.hamburger\b/, /\.header-actions\b/,
  /\.menu\b/, /\.menu-wrap\b/, /\.version-/, /\.dirty-badge\b/, /\.toggle-back\b/, /\.toggle-on\b/,
  /\.commit-/, /\.img-btn\b/, /\.drop-overlay\b/, /\btextarea\b/, /\bheader\b/, /\.error\b/, /a\.active\b/,
];

// The five callout types: the word a reader sees and the colour of edge, label
// and symbol (src/app/callouts.js, src/doc.css).
const CALLOUTS = {
  note:      { label: 'Hinweis',  colour: 'rgb(9, 105, 218)',  fill: '#0969da' },
  tip:       { label: 'Tipp',     colour: 'rgb(26, 127, 55)',  fill: '#1a7f37' },
  important: { label: 'Wichtig',  colour: 'rgb(130, 80, 223)', fill: '#8250df' },
  warning:   { label: 'Achtung',  colour: 'rgb(154, 103, 0)',  fill: '#9a6700' },
  caution:   { label: 'Vorsicht', colour: 'rgb(207, 34, 46)',  fill: '#cf222e' },
};
// Controls for the numbering of headings after a callout; see assertVariant().
// The first forces what the document styles are meant to do, the second what
// they must not do: a heading inside a callout that is numbered and counts.
const CALLOUT_HEADINGS_OUT =
  '.numbered .dokufix-doc .dokufix-callout :is(h2,h3,h4){counter-reset:none !important}' +
  '.numbered .dokufix-doc .dokufix-callout :is(h2,h3,h4)::before{counter-increment:none !important;content:none !important}';
const CALLOUT_HEADINGS_IN =
  '.numbered .dokufix-doc .dokufix-callout h2{counter-reset:h3 !important}' +
  '.numbered .dokufix-doc .dokufix-callout h3{counter-reset:h4 !important}' +
  '.numbered .dokufix-doc .dokufix-callout h2::before{counter-increment:h2 !important;content:counter(h2) ". " !important}' +
  '.numbered .dokufix-doc .dokufix-callout h3::before{counter-increment:h3 !important;content:counter(h2) "." counter(h3) " " !important}' +
  '.numbered .dokufix-doc .dokufix-callout h4::before{counter-increment:h4 !important;content:counter(h2) "." counter(h3) "." counter(h4) " " !important}';

// ---------- what the document should produce ----------
function expectationsFor(md){
  const exp = { frontmatter: false, digest: '', mermaid: 0, toc: false, images: 0, missing: 0, multiRef: null, footnotes: 0,
                callouts: [], calloutHeadings: [], calloutHeadingsNumbered: 0 };
  let body = md;
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (fm){
    exp.frontmatter = true;
    body = md.slice(fm[0].length);
    exp.digest = ['title', 'version', 'date', 'author']
      .map(k => { const m = fm[1].match(new RegExp('^' + k + ':[ \\t]*(.+?)[ \\t]*$', 'mi')); return m ? m[1] : ''; })
      .filter(Boolean).join(' · ');
  }
  exp.mermaid = (body.match(/^```mermaid[ \t]*$/gm) || []).length;
  exp.toc = /^\[\[toc(?::[1-6])?\]\][ \t]*$/m.test(body);
  exp.missing = (body.match(/!\[[^\]]*\]\(#asset-[0-9a-f]{12,64}\)/gi) || []).length;
  exp.images = (body.match(/!\[[^\]]*\]\(/g) || []).length - exp.missing;
  const cites = {};
  for (const m of body.matchAll(/\[\^([^\]\s]+)\](?!:)/g)) cites[m[1]] = (cites[m[1]] || 0) + 1;
  exp.footnotes = Object.keys(cites).length;
  exp.multiRef = Object.keys(cites).find(k => cites[k] >= 2) || null;
  // Callouts: a blockquote whose first line is only an alert marker, and the
  // headings inside one. Read line by line, and only for a quote that starts
  // at the beginning of its line and is not nested: that is how the reference
  // document writes them. Fenced code is skipped. Not read: a callout in a
  // list item or in a nested quote, and a masked marker ("> \[!NOTE\]"), which
  // the product turns into a callout. A document with one of these fails the
  // count below although the build is right; see src/README.md, "Comparison run".
  let fenced = false, quote = false, callout = false;
  for (const line of body.split(/\r?\n/)){
    if (/^(```|~~~)/.test(line)){ fenced = !fenced; quote = callout = false; continue; }
    if (fenced) continue;
    if (!line.startsWith('>')){ quote = callout = false; continue; }
    const text = line.slice(1).trim();
    if (!quote){
      quote = true;
      const m = text.match(/^\[!(note|tip|important|warning|caution)\]$/i);
      callout = !!m;
      if (m) exp.callouts.push(m[1].toLowerCase());
      continue;
    }
    const h = callout && text.match(/^(#{1,6})[ \t]+(.+?)[ \t]*$/);
    if (!h) continue;
    exp.calloutHeadings.push(h[2]);
    // Numbering knows h2 to h4.
    if (h[1].length >= 2 && h[1].length <= 4) exp.calloutHeadingsNumbered++;
  }
  return exp;
}

// Deterministic Date and Math.random for one context; see the header. Every
// reading of the clock advances it by one millisecond, starting at FIXED_NOW.
async function freeze(context){
  await context.addInitScript(start => {
    let seed = 0x9e3779b9;
    Math.random = () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const RealDate = Date;
    let ticks = 0;
    globalThis.Date = class extends RealDate {
      constructor(...args){ if (args.length) super(...args); else super(start + ticks++); }
      static now(){ return start + ticks++; }
    };
  }, FIXED_NOW.getTime());
}

// ---------- build: one document, four exports ----------
async function buildExports(browser, opts, md, dir){
  const context = await browser.newContext({ ...CONTEXT, viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  await freeze(context);
  const page = await context.newPage();
  const libs = [];
  page.on('response', r => {
    if (!r.url().includes('cdn.jsdelivr.net')) return;
    libs.push({ url: r.url(), status: r.status(), version: r.headers()['x-jsd-version'] || '' });
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  // The "Mit Editor" download asks for a version description.
  page.on('dialog', d => d.accept('Referenzstand'));

  await page.goto(pathToFileURL(opts.file).href);
  // The rail is the last thing the first render builds, and that render is the
  // last step of init: with the rail filled, init is done and nothing is still
  // rendering. Wait for that before touching the source.
  await page.waitForFunction(() => !!document.querySelector('#dokufix-rail.has-items'), null, { timeout: 90000 });

  if (md !== null){
    // The page is in view mode and its toolbar hidden, so "Rendern" is pressed
    // through the DOM. The marker in the rail is gone once the render is done.
    await page.evaluate(text => {
      const el = document.getElementById('source');
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      const marker = document.createElement('i');
      marker.id = 'vergleich-render-pending';
      document.getElementById('dokufix-rail').appendChild(marker);
      document.getElementById('render-btn').click();
    }, md);
    await page.waitForFunction(() => !document.getElementById('vergleich-render-pending'), null, { timeout: 90000 });
  }
  const source = await page.evaluate(() => document.getElementById('source').value);

  await page.click('#edit-btn'); // the download menu lives in the editor toolbar
  const sizes = {};
  const files = {};
  for (const v of VARIANTS){
    await page.click('#download-btn');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.click('button[data-download="' + v.download + '"]'),
    ]);
    const file = path.join(dir, v.key + '.html');
    await download.saveAs(file);
    await page.waitForFunction(() => !document.querySelector('button[data-download]:disabled'));
    files[v.key] = file;
    sizes[v.key] = fs.statSync(file).size;
  }
  await context.close();
  libs.sort((x, y) => x.url.localeCompare(y.url));
  return { files, sizes, libs, errors, source };
}

// ---------- reopen ----------
async function openVariant(launch, file, key, exp, width, scheme){
  const browser = await launch();
  const context = await browser.newContext({ ...CONTEXT, viewport: { width, height: 1000 }, colorScheme: scheme });
  await freeze(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(pathToFileURL(file).href);
  if (key === 'mit-editor'){
    // A saved file has an empty preview; content in it means init has run.
    await page.waitForFunction(n =>
      document.querySelectorAll('#preview .mermaid svg').length >= n &&
      document.querySelector('#preview') && document.querySelector('#preview').children.length > 0,
      exp.mermaid, { timeout: 90000 });
  } else if (key === 'schlank'){
    await page.waitForFunction(() => !document.querySelector('[data-gz]'), null, { timeout: 30000 });
  } else if (key === 'kompakt'){
    await page.waitForFunction(() => {
      const d = document.getElementById('d');
      return d && d.children.length > 0 && !document.querySelector('.dokufix-rail-pending');
    }, null, { timeout: 30000 });
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
  });
  await page.waitForTimeout(250);
  return { close: () => browser.close(), page, errors };
}

const NO_FALLBACKS = '.dokufix-fn-preview{position-try-fallbacks:none !important}';

const shot = (page, file) => page.screenshot({ path: file, fullPage: true, animations: 'disabled', caret: 'hide' });

// Every state the document styles cover that a screenshot at rest does not show:
// heading numbering, the open metadata panel, a revealed footnote preview and the
// landing highlight with its marked return arrow.
async function enterStates(page, browserName){
  if (browserName === 'firefox') await page.addStyleTag({ content: NO_FALLBACKS }); // see header
  await page.evaluate(() => {
    document.body.classList.add('numbered');
    const fm = document.querySelector('details.dokufix-frontmatter');
    if (fm) fm.open = true;
    const li = Array.from(document.querySelectorAll('.footnotes li'))
      .find(x => x.querySelectorAll('a[data-footnote-backref]').length > 1);
    const back = li && li.querySelectorAll('a[data-footnote-backref]')[1];
    if (back && back.id) location.hash = '#' + back.id;
    // Back to the top: Firefox does not paint a preview whose marker is scrolled
    // out of view, and the first marker sits in the first paragraph.
    window.scrollTo(0, 0);
    const marker = document.querySelector('a[data-footnote-ref]');
    if (marker) marker.focus({ preventScroll: true });
  });
  await page.waitForTimeout(500);
}

// ---------- assertions ----------
function makeChecker(results, scope){
  return (name, ok, detail, note) => {
    results.push({ scope, name, ok: !!ok, detail: ok ? '' : (detail === undefined ? '' : String(detail)), note: ok && note ? note : '' });
  };
}

async function settles(page, fn, arg){
  try { await page.waitForFunction(fn, arg, { timeout: 4000 }); return true; }
  catch (e){ return false; }
}

async function assertVariant(launch, file, key, exp, results, label){
  const check = makeChecker(results, label + ' ' + key);
  const text = fs.readFileSync(file, 'utf8');

  if (key === 'nur-lesen') check('contains no <script>', !/<script/i.test(text));
  if (READONLY.has(key)){
    const style = (text.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
    check('has a stylesheet', style.length > 500, style.length + ' bytes');
    const hits = EDITOR_RULES.filter(re => re.test(style)).map(String);
    check('stylesheet has no editor rules', hits.length === 0, hits.join(' '));
  }

  const { close, page, errors } = await openVariant(launch, file, key, exp, 1400, 'light');
  try {
    const s = await page.evaluate(() => {
      // The content container: the preview in the editor file, <main> in a read-only export.
      const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
      const fm = document.querySelector('details.dokufix-frontmatter');
      const digest = fm && fm.querySelector('.dokufix-fm-digest');
      const cs = fm && getComputedStyle(fm);
      const imgs = Array.from(document.images);
      const placeholder = document.querySelector('img[data-missing-asset]');
      return {
        mermaid: document.querySelectorAll('.mermaid svg').length,
        tocLinks: document.querySelectorAll('nav.dokufix-toc a').length,
        tocBorder: (() => { const n = document.querySelector('nav.dokufix-toc'); return n ? getComputedStyle(n).borderTopWidth : ''; })(),
        fm: !!fm, fmOpen: fm ? fm.open : null, digest: digest ? digest.textContent : '',
        fmBorder: cs ? cs.borderTopWidth : '', fmBg: cs ? cs.backgroundColor : '',
        images: imgs.filter(i => !i.hasAttribute('data-missing-asset') && i.naturalWidth > 1).length,
        missing: imgs.filter(i => i.hasAttribute('data-missing-asset')).length,
        placeholderBorder: placeholder ? getComputedStyle(placeholder).borderTopStyle : '',
        hosts: document.querySelectorAll('sup.dokufix-fn-host > .dokufix-fn-preview').length,
        markers: document.querySelectorAll('a[data-footnote-ref]').length,
        h1Size: (() => { const h = root.querySelector('h1'); return h ? getComputedStyle(h).fontSize : ''; })(),
        callouts: Array.from(root.querySelectorAll('.dokufix-callout')).map(c => {
          const label = c.querySelector(':scope > .dokufix-callout-label');
          const cs = getComputedStyle(c), ls = label && getComputedStyle(label), bs = label && getComputedStyle(label, '::before');
          const r = label && label.getBoundingClientRect();
          return {
            type: (c.className.match(/dokufix-callout-([a-z]+)/) || [0, ''])[1],
            tag: c.tagName, role: c.getAttribute('role'),
            label: label ? label.textContent : null, labelFirst: !!label && label === c.firstElementChild,
            labelVisible: !!label && r.width > 0 && r.height > 0 && ls.visibility === 'visible' && ls.display !== 'none',
            labelColour: ls ? ls.color : '',
            edge: cs.borderLeftWidth + ' ' + cs.borderLeftStyle + ' ' + cs.borderLeftColor,
            otherEdges: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth].join(' '),
            symbol: bs ? bs.backgroundImage : '', symbolBox: bs ? bs.width + ' ' + bs.height : '',
            markerLeft: /\[!/.test(c.textContent),
            emptyParagraphs: Array.from(c.querySelectorAll('p')).filter(p => !p.textContent.trim() && !p.children.length).length,
          };
        }),
        calloutHeadings: Array.from(root.querySelectorAll('.dokufix-callout :is(h1, h2, h3, h4, h5, h6)')).map(h => {
          const text = h.textContent.trim();
          const named = sel => Array.from(document.querySelectorAll(sel)).some(a => a.textContent.trim() === text);
          return { text, id: h.id, inToc: named('nav.dokufix-toc a'), inRail: named('.dokufix-rail a') };
        }),
        markerQuotes: Array.from(root.querySelectorAll('blockquote')).filter(q => /^\s*\[!(note|tip|important|warning|caution)\]\s*(\n|$)/i.test(q.textContent)).length,
      };
    });
    check('document styles apply (h1 is 34px)', s.h1Size === '34px', s.h1Size);
    check('Mermaid diagrams rendered', s.mermaid === exp.mermaid, s.mermaid + ' of ' + exp.mermaid);
    if (exp.toc) check('inline table of contents', s.tocLinks > 0 && s.tocBorder === '1px', s.tocLinks + ' links, border ' + s.tocBorder);
    check('embedded images shown', s.images === exp.images, s.images + ' of ' + exp.images);
    check('missing-image placeholders', s.missing === exp.missing && (exp.missing === 0 || s.placeholderBorder === 'dashed'),
      s.missing + ' of ' + exp.missing + ', border ' + s.placeholderBorder);

    // --- callouts (story 2.2). With a document that has none, the count is the check.
    check('callouts: one per alert blockquote, in the order of the document',
      JSON.stringify(s.callouts.map(c => c.type)) === JSON.stringify(exp.callouts) && s.markerQuotes === 0,
      JSON.stringify(s.callouts.map(c => c.type)) + ', expected ' + JSON.stringify(exp.callouts) + '; blockquotes still opening with a marker: ' + s.markerQuotes);
    if (exp.callouts.length){
      const bad = (what, test) => s.callouts.filter(c => !test(c, CALLOUTS[c.type] || {})).map(c => c.type + ': ' + JSON.stringify(what(c)));
      const labels = bad(c => [c.tag, c.role, c.label, c.labelFirst, c.labelVisible, c.markerLeft, c.emptyParagraphs],
        (c, want) => c.tag === 'DIV' && c.role === 'note' && c.label === want.label && c.labelFirst && c.labelVisible && !c.markerLeft && c.emptyParagraphs === 0);
      check('every callout is labelled: the word of its type, visible, as its first line, the marker gone', labels.length === 0, labels.join(' | '));
      const styles = bad(c => [c.edge, c.otherEdges, c.labelColour, c.symbolBox],
        (c, want) => c.edge === '4px solid ' + want.colour && c.otherEdges === '0px 0px 0px' && c.labelColour === want.colour && c.symbolBox === '16px 16px');
      check('every callout is styled: an edge on the left only, edge and label in the colour of the type', styles.length === 0, styles.join(' | '));
      // The symbol is a data: URI in the document styles. That the rule arrived
      // says little; the picture has to be one a browser draws.
      const symbols = await page.evaluate(async list => {
        const out = [];
        for (const c of list){
          const m = c.symbol.match(/^url\("(data:image\/svg\+xml,[^"]*)"\)$/);
          if (!m){ out.push({ type: c.type, problem: 'no data: URI: ' + c.symbol.slice(0, 80) }); continue; }
          const img = new Image();
          const loaded = await new Promise(resolve => { img.onload = () => resolve(true); img.onerror = () => resolve(false); img.src = m[1]; });
          out.push({ type: c.type, loaded, size: img.naturalWidth + 'x' + img.naturalHeight, svg: decodeURIComponent(m[1].slice(m[1].indexOf(',') + 1)) });
        }
        return out;
      }, s.callouts.map(c => ({ type: c.type, symbol: c.symbol })));
      const badSymbols = symbols.filter(y => y.problem || !y.loaded || y.size !== '16x16' || !y.svg.includes("fill='" + (CALLOUTS[y.type] || {}).fill + "'") || !/<path d='M[^']+Z'\/>/.test(y.svg))
        .map(y => y.type + ': ' + (y.problem || (y.loaded ? y.size : 'does not load')));
      const distinct = new Set(symbols.map(y => y.svg)).size === new Set(s.callouts.map(c => c.type)).size;
      check('every callout has its symbol: an SVG of 16 px in the colour of the type, one per type', badSymbols.length === 0 && distinct,
        badSymbols.join(' | ') || 'two types share a symbol');
    }
    // --- a heading inside a callout is no document heading
    check('headings inside callouts: the ones the document has',
      JSON.stringify(s.calloutHeadings.map(h => h.text)) === JSON.stringify(exp.calloutHeadings),
      JSON.stringify(s.calloutHeadings.map(h => h.text)) + ', expected ' + JSON.stringify(exp.calloutHeadings));
    if (exp.calloutHeadings.length){
      const listed = s.calloutHeadings.filter(h => h.id || h.inToc || h.inRail);
      check('a heading inside a callout has no id and is in neither table of contents nor rail', listed.length === 0, JSON.stringify(listed));
    }
    // --- a [!WARNING] callout beside the product's own warning: more than colour apart
    if (exp.callouts.includes('warning')){
      const pair = await page.evaluate(() => {
        const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
        const callout = root.querySelector('.dokufix-callout-warning');
        if (!callout) return null;   // the count above has failed already
        // The warning as buildWarning() makes it, put beside the callout for the measurement.
        callout.insertAdjacentHTML('afterend', '<div class="dokufix-warning" role="note"><p class="dokufix-warning-title"><strong>Warnung:</strong> Ein Diagramm konnte nicht gezeichnet werden.</p></div>');
        const warning = callout.nextElementSibling;
        const box = el => { const cs = getComputedStyle(el); return { top: cs.borderTopWidth, right: cs.borderRightWidth, bottom: cs.borderBottomWidth, left: cs.borderLeftWidth }; };
        const cLabel = callout.querySelector(':scope > .dokufix-callout-label'), wLabel = warning.querySelector('.dokufix-warning-title > strong');
        const out = {
          callout: { ...box(callout), word: cLabel.textContent, labelDisplay: getComputedStyle(cLabel).display,
                     ownLine: !cLabel.nextElementSibling || cLabel.getBoundingClientRect().bottom <= cLabel.nextElementSibling.getBoundingClientRect().top,
                     symbol: getComputedStyle(cLabel, '::before').backgroundImage !== 'none' },
          warning: { ...box(warning), word: wLabel.textContent, labelDisplay: getComputedStyle(wLabel).display,
                     ownLine: wLabel.parentElement.textContent.trim() === wLabel.textContent.trim(),
                     symbol: getComputedStyle(wLabel, '::before').backgroundImage !== 'none' },
        };
        warning.remove();
        return out;
      });
      const c = pair ? pair.callout : {}, w = pair ? pair.warning : {};
      check('a WARNING callout and the product\'s warning differ in more than colour: the word, a box against an edge, the label\'s line, the symbol',
        !!pair && c.word === 'Achtung' && w.word === 'Warnung:' &&
        c.top === '0px' && c.right === '0px' && c.bottom === '0px' && w.top === '1px' && w.right === '1px' && w.bottom === '1px' && w.left !== c.left &&
        c.ownLine && !w.ownLine && c.labelDisplay !== w.labelDisplay && c.symbol && !w.symbol, JSON.stringify(pair));
    }

    // --- metadata panel (story 1.1)
    if (exp.frontmatter){
      check('metadata panel present and collapsed', s.fm && s.fmOpen === false, 'present ' + s.fm + ', open ' + s.fmOpen);
      check('metadata digest', s.digest === exp.digest, JSON.stringify(s.digest));
      check('metadata panel styled', s.fmBorder === '1px' && s.fmBg === 'rgb(250, 250, 250)', s.fmBorder + ' ' + s.fmBg);
      await page.click('details.dokufix-frontmatter > summary');
      const opened = await page.evaluate(() => {
        const fm = document.querySelector('details.dokufix-frontmatter');
        const rows = fm.querySelector('dl.dokufix-fm-rows');
        return { open: fm.open, rows: rows ? rows.getBoundingClientRect().height : 0, grid: rows ? getComputedStyle(rows).display : '' };
      });
      check('metadata panel opens on click', opened.open && opened.rows > 0 && opened.grid === 'grid', JSON.stringify(opened));
    }

    // --- footnote preview (story 1.2), through the keyboard path
    if (exp.footnotes){
      check('every marker carries a preview', s.hosts === s.markers && s.hosts > 0, s.hosts + ' previews, ' + s.markers + ' markers');
      const rest = await page.evaluate(() => {
        const a = document.querySelector('sup.dokufix-fn-host > a[data-footnote-ref]');
        const box = a.parentElement.querySelector(':scope > .dokufix-fn-preview');
        a.scrollIntoView({ block: 'center' });
        const cs = getComputedStyle(box);
        return { visibility: cs.visibility, position: cs.position, text: box.textContent.trim().length };
      });
      check('preview hidden at rest', rest.visibility === 'hidden' && rest.position === 'absolute' && rest.text > 0, JSON.stringify(rest));
      const focusMarker = () => page.evaluate(() => {
        if (document.activeElement) document.activeElement.blur();
        document.querySelector('sup.dokufix-fn-host > a[data-footnote-ref]').focus({ preventScroll: true });
      });
      const revealed = () => settles(page, () => {
        const box = document.querySelector('sup.dokufix-fn-host > .dokufix-fn-preview');
        const cs = getComputedStyle(box);
        return cs.visibility === 'visible' && Number(cs.opacity) === 1;
      });
      await focusMarker();
      let shown = await revealed();
      let note = '';
      if (!shown && label === 'firefox'){
        await page.addStyleTag({ content: NO_FALLBACKS }); // known deviation, see header
        await focusMarker();
        shown = await revealed();
        note = 'only with position-try-fallbacks switched off (known deviation of the Playwright Firefox build)';
      }
      const rect = await page.evaluate(() => {
        const r = document.querySelector('sup.dokufix-fn-host > .dokufix-fn-preview').getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight };
      });
      check('preview appears on focus', shown, '', note);
      // Not judged where the fallbacks had to be switched off: the box is then
      // placed without them, which is not what a reader gets.
      if (!note) check('preview stays inside the viewport',
        rect.left >= 0 && rect.right <= rect.w && rect.top >= 0 && rect.bottom <= rect.h && rect.right - rect.left > 50, JSON.stringify(rect));
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
    }

    // --- landing highlight and marked return arrow (story 1.3)
    if (exp.multiRef){
      const ids = await page.evaluate(() => {
        const li = Array.from(document.querySelectorAll('.footnotes li'))
          .find(x => x.querySelectorAll('a[data-footnote-backref]').length > 1);
        return li ? { li: li.id, arrows: Array.from(li.querySelectorAll('a[data-footnote-backref]')).map(a => a.id) } : null;
      });
      check('multiply cited footnote has one arrow per citation', ids && ids.arrows.length >= 2 && ids.arrows.every(Boolean), JSON.stringify(ids));
      if (ids && ids.arrows[1]){
        await page.click('a[data-footnote-ref][href="#' + ids.arrows[1] + '"]');
        const YELLOW = 'rgb(212, 255, 0)', SHADE = 'rgba(212, 255, 0, 0.3)';
        const landed = await settles(page, ([arrowId, liId, yellow, shade]) => {
          const arrow = document.getElementById(arrowId), li = document.getElementById(liId);
          return location.hash === '#' + arrowId
            && getComputedStyle(arrow).backgroundColor === yellow
            && getComputedStyle(li).backgroundColor === shade;
        }, [ids.arrows[1], ids.li, YELLOW, SHADE]);
        const colours = await page.evaluate(([liId]) => {
          const li = document.getElementById(liId);
          return { li: getComputedStyle(li).backgroundColor,
                   arrows: Array.from(li.querySelectorAll('a[data-footnote-backref]')).map(a => getComputedStyle(a).backgroundColor) };
        }, [ids.li]);
        check('second citation lands on its own arrow, definition shaded', landed, JSON.stringify(colours));
        check('only that arrow is marked', colours.arrows.filter(c => c === YELLOW).length === 1 && colours.arrows[1] === YELLOW, JSON.stringify(colours.arrows));

        await page.evaluate(id => { location.hash = '#' + id; }, ids.li);
        const plain = await settles(page, ([liId, yellow, shade]) => {
          const li = document.getElementById(liId);
          return getComputedStyle(li).backgroundColor === shade
            && Array.from(li.querySelectorAll('a[data-footnote-backref]')).every(a => getComputedStyle(a).backgroundColor !== yellow);
        }, [ids.li, YELLOW, SHADE]);
        check('plain #footnote anchor shades the definition, no arrow marked', plain);
      }
    }

    // --- heading numbering reaches headings and the table of contents
    const numbered = await page.evaluate(() => {
      document.body.classList.add('numbered');
      const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
      const h2 = root.querySelector('h2:not(.footnotes h2)');
      const toc = document.querySelector('nav.dokufix-toc > ol > li > a');
      const out = { h2: h2 ? getComputedStyle(h2, '::before').content : '', toc: toc ? getComputedStyle(toc, '::before').content : null };
      document.body.classList.remove('numbered');
      return out;
    });
    check('heading numbering', /counter\(h2\)/.test(numbered.h2) && (numbered.toc === null || /counter\(tocH2\)/.test(numbered.toc)), JSON.stringify(numbered));
    // --- numbering leaves out a heading inside a callout. A browser does not
    // say which number a counter shows, so the page is photographed three
    // times with numbering on: as it is, with the heading forced out of the
    // count, and with it forced in. As it is, it has to be the first of the
    // two and not the second; the second proves that the picture would show it.
    // Only with a heading of level 2 to 4 inside a callout: h1, h5 and h6 are
    // not numbered anywhere, so there is nothing to tell apart.
    if (exp.calloutHeadingsNumbered){
      const computed = await page.evaluate(() => {
        document.body.classList.add('numbered');
        if (document.activeElement) document.activeElement.blur();
        window.scrollTo(0, 0);
        const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
        return Array.from(root.querySelectorAll('.dokufix-callout :is(h2, h3, h4)')).map(h => {
          const b = getComputedStyle(h, '::before');
          return { text: h.textContent.trim(), reset: getComputedStyle(h).counterReset, increment: b.counterIncrement, content: b.content };
        });
      });
      const counted = computed.filter(h => h.reset !== 'none' || h.increment !== 'none' || h.content !== 'none');
      check('a heading inside a callout gets no number and does not count', computed.length === exp.calloutHeadingsNumbered && counted.length === 0, JSON.stringify(computed));
      const photo = async css => {
        const tag = css ? await page.addStyleTag({ content: css }) : null;
        const png = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
        if (tag) await tag.evaluate(el => el.remove());
        return png;
      };
      const asItIs = await photo(''), forcedOut = await photo(CALLOUT_HEADINGS_OUT), forcedIn = await photo(CALLOUT_HEADINGS_IN);
      await page.evaluate(() => document.body.classList.remove('numbered'));
      check('the headings after a callout are numbered as they are without its heading',
        asItIs.equals(forcedOut) && !asItIs.equals(forcedIn),
        'as it is = forced out of the count: ' + asItIs.equals(forcedOut) + '; as it is = forced into it: ' + asItIs.equals(forcedIn));
    }
    check('no script errors', errors.length === 0, errors.join(' | '));
  } finally {
    await close();
  }
}

// ---------- one browser ----------
async function runBrowser(name, opts, md){
  const dir = path.join(opts.out, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'exports'), { recursive: true });
  const launch = BROWSERS[name];
  const browser = await launch();
  const results = [];
  try {
    const built = await buildExports(browser, opts, md, path.join(dir, 'exports'));
    const exp = expectationsFor(built.source);
    const check = makeChecker(results, name + ' build');
    check('no script errors while building', built.errors.length === 0, built.errors.join(' | '));

    for (const v of VARIANTS){
      for (const width of WIDTHS){
        for (const [schemeName, scheme] of SCHEMES){
          const base = v.key + '-' + width + '-' + schemeName;
          const { close, page } = await openVariant(launch, built.files[v.key], v.key, exp, width, scheme);
          try {
            if (scheme === 'light'){
              const rail = await page.evaluate(() => {
                const r = document.querySelector('.dokufix-rail');
                return r ? { display: getComputedStyle(r).display, links: r.querySelectorAll('a').length } : null;
              });
              const want = width >= 1500 ? 'block' : 'none';
              makeChecker(results, name + ' ' + v.key)('rail is ' + want + ' at ' + width + ' px',
                rail && rail.display === want && rail.links > 0, JSON.stringify(rail));
            }
            await shot(page, path.join(dir, base + '.png'));
            await enterStates(page, name);
            await shot(page, path.join(dir, base + '-zustand.png'));
          } finally { await close(); }
        }
      }
      await assertVariant(launch, built.files[v.key], v.key, exp, results, name);
    }

    // The preview pane inside the editor: same document rules, the editor's frame.
    for (const [schemeName, scheme] of SCHEMES){
      const { close, page } = await openVariant(launch, built.files['mit-editor'], 'mit-editor', exp, 1400, scheme);
      try {
        await page.click('#edit-btn');
        const h = await page.evaluate(() => {
          const p = document.getElementById('preview');
          if (document.activeElement) document.activeElement.blur();
          return Math.ceil(p.getBoundingClientRect().top + p.scrollHeight) + 2;
        });
        await page.setViewportSize({ width: 1400, height: Math.min(h, 15000) });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(dir, 'mit-editor-bearbeiten-1400-' + schemeName + '.png'), animations: 'disabled', caret: 'hide' });
      } finally { await close(); }
    }

    const info = { browser: name, version: browser.version(), file: opts.file, document: opts.demo ? '(demo text)' : opts.doc,
                   clockStart: FIXED_NOW.toISOString(), libraries: built.libs, sizes: built.sizes };
    fs.writeFileSync(path.join(dir, 'sizes.json'), JSON.stringify(info, null, 2) + '\n');
    return { name, dir, info, results };
  } finally {
    await browser.close();
  }
}

// ---------- PNG, just enough to compare two screenshots ----------
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function decodePng(file){
  const buf = fs.readFileSync(file);
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG: ' + file);
  let width = 0, height = 0, channels = 0;
  const idat = [];
  for (let p = 8; p < buf.length;){
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR'){
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || (data[9] !== 2 && data[9] !== 6) || data[12] !== 0) throw new Error('unsupported PNG format: ' + file);
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++){
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride, up = dst - stride;
    for (let i = 0; i < stride; i++){
      const a = i >= channels ? px[dst + i - channels] : 0;
      const b = y > 0 ? px[up + i] : 0;
      const c = (y > 0 && i >= channels) ? px[up + i - channels] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4){
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      px[dst + i] = (raw[src + i] + pred) & 255;
    }
  }
  return { width, height, channels, px };
}
function encodePngRgb(width, height, rgb){
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// Differing pixels between two images. Where the sizes differ, everything outside
// the common area counts as differing. diffFile gets a white image with every
// differing pixel in red.
function comparePng(beforeFile, afterFile, diffFile){
  const a = decodePng(beforeFile), b = decodePng(afterFile);
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  const mask = Buffer.alloc(w * h * 3, 255);
  let differing = 0, top = -1, bottom = -1, left = w, right = -1;
  for (let y = 0; y < h; y++){
    for (let x = 0; x < w; x++){
      let diff = x >= a.width || x >= b.width || y >= a.height || y >= b.height;
      if (!diff){
        const i = (y * a.width + x) * a.channels, j = (y * b.width + x) * b.channels;
        diff = a.px[i] !== b.px[j] || a.px[i + 1] !== b.px[j + 1] || a.px[i + 2] !== b.px[j + 2];
      }
      if (!diff) continue;
      differing++;
      if (top < 0) top = y;
      bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
      const m = (y * w + x) * 3;
      mask[m] = 220; mask[m + 1] = 0; mask[m + 2] = 0;
    }
  }
  if (differing && diffFile){
    fs.mkdirSync(path.dirname(diffFile), { recursive: true });
    fs.writeFileSync(diffFile, encodePngRgb(w, h, mask));
  }
  return { differing, before: a.width + 'x' + a.height, after: b.width + 'x' + b.height,
           box: differing ? { left, top, right, bottom } : null };
}

function compareRun(run, baselineRoot){
  const baseDir = path.join(baselineRoot, run.name);
  const out = { images: [], sizes: null, libraries: null };
  const pngs = dir => fs.readdirSync(dir).filter(f => f.endsWith('.png'));
  const names = pngs(run.dir);
  // An image only the baseline has is a difference too, not a smaller comparison.
  const all = [...new Set([...names, ...pngs(baseDir)])].sort();
  for (const f of all){
    const before = path.join(baseDir, f);
    if (!names.includes(f)){ out.images.push({ image: f, missingRun: true }); continue; }
    if (!fs.existsSync(before)){ out.images.push({ image: f, missingBaseline: true }); continue; }
    out.images.push({ image: f, ...comparePng(before, path.join(run.dir, f), path.join(run.dir, 'diff', f)) });
  }
  const sizesFile = path.join(baseDir, 'sizes.json');
  if (fs.existsSync(sizesFile)){
    const base = JSON.parse(fs.readFileSync(sizesFile, 'utf8'));
    out.sizes = Object.fromEntries(VARIANTS.map(v => [v.key, { before: base.sizes[v.key], after: run.info.sizes[v.key] }]));
    out.libraries = base.libraries;
  }
  fs.writeFileSync(path.join(run.dir, 'vergleich.json'), JSON.stringify(out, null, 2) + '\n');
  return out;
}

// ---------- report ----------
const fmtBytes = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' B';
const libLine = libs => libs.map(l => l.url.replace('https://cdn.jsdelivr.net/npm/', '') + (l.version ? ' → ' + l.version : '') + (l.status !== 200 ? ' [' + l.status + ']' : '')).join(', ');

function report(run, cmp){
  console.log('\n== ' + run.name + ' ' + run.info.version + ' ==');
  console.log('libraries: ' + libLine(run.info.libraries));
  if (cmp && cmp.libraries) console.log('baseline:  ' + libLine(cmp.libraries));
  console.log('sizes:');
  for (const v of VARIANTS){
    const after = run.info.sizes[v.key];
    let line = '  ' + v.label.padEnd(11) + fmtBytes(after).padStart(12);
    if (cmp && cmp.sizes && cmp.sizes[v.key].before !== undefined){
      const before = cmp.sizes[v.key].before, d = after - before;
      line += '   before ' + fmtBytes(before).padStart(11) + '   ' + (d >= 0 ? '+' : '−') + fmtBytes(Math.abs(d)) +
              ' (' + (d >= 0 ? '+' : '−') + Math.abs(d / before * 100).toFixed(1) + ' %)';
    }
    console.log(line);
  }
  const failed = run.results.filter(r => !r.ok);
  console.log('assertions: ' + (run.results.length - failed.length) + ' of ' + run.results.length + ' green');
  for (const r of failed) console.log('  FAIL ' + r.scope + ': ' + r.name + (r.detail ? ' — ' + r.detail : ''));
  for (const r of run.results.filter(x => x.note)) console.log('  note ' + r.scope + ': ' + r.name + ' — ' + r.note);
  let differing = 0;
  if (cmp){
    const same = cmp.images.filter(i => i.differing === 0).length;
    console.log('screenshots: ' + same + ' of ' + cmp.images.length + ' identical to the baseline');
    for (const i of cmp.images){
      if (i.missingBaseline){ console.log('  ' + i.image + ': no baseline image'); differing++; continue; }
      if (i.missingRun){ console.log('  ' + i.image + ': only in the baseline'); differing++; continue; }
      if (!i.differing) continue;
      differing++;
      console.log('  ' + i.image + ': ' + i.differing + ' px differ, rows ' + i.box.top + '–' + i.box.bottom +
        ', columns ' + i.box.left + '–' + i.box.right + (i.before !== i.after ? ', size ' + i.before + ' → ' + i.after : ''));
    }
  }
  return { failed: failed.length, differing };
}

// ---------- main ----------
const opts = parseArgs(process.argv.slice(2));
const md = opts.demo ? null : fs.readFileSync(opts.doc, 'utf8');
const names = opts.browser === 'all' ? ['chromium', 'firefox'] : [opts.browser];
// A baseline that is not there cannot be compared with. Say so before anything
// is built or deleted, and fail: "nothing differs" would be a false result.
if (opts.compare){
  const missing = names.filter(n => !fs.existsSync(path.join(opts.compare, n, 'sizes.json')));
  if (missing.length){
    console.error('no baseline for ' + missing.join(' and ') + ' in ' + opts.compare + ' (expected <browser>/sizes.json from an earlier --out run)');
    process.exit(1);
  }
}
let failed = 0, differing = 0;
for (const name of names){
  const run = await runBrowser(name, opts, md);
  const cmp = opts.compare ? compareRun(run, opts.compare) : null;
  const r = report(run, cmp);
  failed += r.failed; differing += r.differing;
}
console.log('\nexports and screenshots: ' + opts.out);
if (failed) console.log(failed + ' assertion(s) failed');
if (opts.compare && differing) console.log(differing + ' screenshot(s) differ from the baseline; red-on-white masks are in <browser>/diff/');
process.exit(failed || (opts.strict && differing) ? 1 : 0);
