// Browser run for what a render and an export do when something fails, when two
// renders meet, and when the page holds an element that is not the document.
//
//   node tests/durchlaeufe.mjs
//
// Options
//   --file <file>      the file under test (default: ../dist/dokufix.html)
//   --browser <name>   chromium | firefox | all (default: all)
//   --out <dir>        where exports and saved files go (default: out/durchlaeufe, emptied first)
//
// Why this exists. tests/vergleich.mjs shows that a valid document looks as it
// did. It says nothing about a document that is not valid, or about a pass that
// breaks: before story 2.15 a pass that threw stopped every step after it and
// left half a preview without a word, and a Mermaid block with an error shipped
// Mermaid's error picture into every export. This run is the check for the
// other side: every failure ends as a warning in the document, the rest of the
// document renders, the rail is rebuilt, and the warning travels.
//
// What it does, per browser, on the file under test:
//
//   1. a diagram with an error   one Mermaid block with a syntax error between
//                                two valid ones: that block is a warning with
//                                Mermaid's message, the other two are drawn,
//                                no error picture and nothing of Mermaid's
//                                outside the preview; then all four downloads,
//                                reopened: the warning is in each, styled
//   2. overlapping renders       a second render is requested while the first
//                                is in its passes: they run one after the
//                                other, and the preview ends as the second's
//   3. a transient element       elements marked data-dokufix-transient in
//                                <head>, in <body> and inside the interface:
//                                none is in the saved "Mit Editor" file
//   4. Markdown cannot be parsed marked is made to throw: the warning is
//                                all the preview holds, the rail is rebuilt and
//                                empty; then the three read-only exports
//
// and on a copy of src/ built with two passes more, as tests/speichern.mjs
// builds a copy with another demo text (the product has no switch for this):
//
//   5. a pass throws             a document pass that throws stands in the
//                                middle of the list: one warning names it at
//                                the top, every other pass did its work, the
//                                rail is built; the three read-only exports
//                                carry the warning. A run-time pass that adds a
//                                transient element and then throws: its warning
//                                and its element are in the page and in no export
//
// In every case the error is on the console and no promise is rejected: the
// run collects console errors and page errors and looks at both.
//
// The page is known by its DOM only, as in tests/vergleich.mjs: a render is
// finished when a marker put into the rail is gone. marked is the library the
// page loads, a global of the page and not a name of its script; case 4 gives
// it, from outside and through its own marked.use(), a hook that throws.
//
// Exit code 1 when anything fails.

import { chromium, firefox } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

// ---------- arguments ----------
function parseArgs(argv){
  const a = { browser: 'all', file: path.join(root, 'dist/dokufix.html'), out: path.join(here, 'out/durchlaeufe') };
  for (let i = 0; i < argv.length; i++){
    const k = argv[i];
    if (['--file', '--browser', '--out'].includes(k)){
      if (argv[i + 1] === undefined) throw new Error(k + ' needs a value');
      a[k.slice(2)] = argv[++i];
    }
    else throw new Error('unknown argument: ' + k);
  }
  if (!['chromium', 'firefox', 'all'].includes(a.browser)) throw new Error('--browser must be chromium, firefox or all');
  a.file = path.resolve(a.file);
  a.out = path.resolve(a.out);
  if (!fs.existsSync(a.file)) throw new Error('file under test not found: ' + a.file);
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

// ---------- the documents ----------
const FENCE = '```';
const diagram = lines => FENCE + 'mermaid\n' + lines.join('\n') + '\n' + FENCE;
const GOOD_FLOW = diagram(['flowchart LR', '    A[Anfang] --> B[Ende]']);
const GOOD_SEQUENCE = diagram(['sequenceDiagram', '    Anna->>Ben: Hallo']);
const BAD_FLOW = diagram(['flowchart LR', '    A[ --> B']);
// Three diagrams, the one in the middle with a syntax error.
const DOC_DIAGRAMS = [
  '# Drei Diagramme', '[[toc]]',
  '## Eins', GOOD_FLOW,
  '## Zwei', BAD_FLOW,
  '## Drei', GOOD_SEQUENCE,
  '## Vier', 'Ein Absatz mit Fußnote.[^a]',
  '[^a]: Die Fußnote.',
].join('\n\n') + '\n';
// Two documents for the overlap, told apart by every heading.
const overlapDoc = name => [
  '# Dokument ' + name,
  '## ' + name + ' eins', GOOD_FLOW,
  '## ' + name + ' zwei', GOOD_SEQUENCE,
  '## ' + name + ' drei', 'Text.',
  '## ' + name + ' vier', 'Text.',
].join('\n\n') + '\n';
const MARKED_MESSAGE = 'Absicht: marked.parse wirft (durchlaeufe)';

// ---------- the copy of src/ with two passes more ----------
const THROWING_PASS = 'Prüfschritt';
const THROWING_MESSAGE = 'Absicht: der Prüfschritt wirft (durchlaeufe)';
const RUNTIME_PASS = 'Laufzeit-Prüfschritt';
const RUNTIME_MESSAGE = 'Absicht: der Laufzeit-Prüfschritt wirft (durchlaeufe)';
const TRANSIENT_ID = 'durchlaeufe-nur-zur-laufzeit';
// Each entry: the line of src/app/render.js the new pass is put next to.
const PASS_EDITS = [
  { before: "  { name: 'Inhaltsverzeichnis', run: processInlineToc },\n",
    add: "  { name: '" + THROWING_PASS + "', run(){ throw new Error('" + THROWING_MESSAGE + "'); } },\n" },
  { after: "  { name: 'Sprungmarken im Inhaltsverzeichnis', run: attachTocClicks },\n",
    add: "  { name: '" + RUNTIME_PASS + "', run(root){ const el = root.ownerDocument.createElement('p'); el.id = '" + TRANSIENT_ID +
         "'; el.setAttribute(TRANSIENT_ATTR, ''); el.textContent = 'nur in der laufenden Seite'; root.appendChild(el); throw new Error('" + RUNTIME_MESSAGE + "'); } },\n" },
];
function buildCopyWithThrowingPasses(outDir){
  const srcCopy = path.join(outDir, 'src');
  fs.cpSync(path.join(root, 'src'), srcCopy, { recursive: true });
  const file = path.join(srcCopy, 'app/render.js');
  let text = fs.readFileSync(file, 'utf8');
  for (const edit of PASS_EDITS){
    const anchor = edit.before || edit.after;
    if (text.split(anchor).length !== 2) throw new Error('src/app/render.js: expected exactly once, to put a pass next to it: ' + anchor.trim());
    text = text.replace(anchor, () => edit.before ? edit.add + anchor : anchor + edit.add);
  }
  fs.writeFileSync(file, text);
  const built = path.join(outDir, 'mit-werfenden-schritten.html');
  const r = spawnSync(process.execPath, [path.join(root, 'build.mjs'), '--src', srcCopy, '--out', built], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('could not build the copy with the throwing passes:\n' + r.stderr);
  fs.rmSync(srcCopy, { recursive: true });
  return built;
}

// ---------- results ----------
const results = [];
const check = (scope, name, ok, detail) => results.push({ scope, name, ok: !!ok, detail: ok || detail === undefined ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });

// ---------- the page, through its DOM ----------
const READONLY = [
  { key: 'nur-lesen', download: 'readonly-open' },
  { key: 'schlank',   download: 'readonly-slim' },
  { key: 'kompakt',   download: 'readonly-compact' },
];
// Opens a file in a context of its own, with what the console and the page
// report as errors collected. ready: what to wait for.
async function open(browser, file, ready){
  const context = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = [], pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('dialog', d => d.type() === 'prompt' ? d.accept('Stand aus durchlaeufe.mjs') : d.accept());
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(ready, null, { timeout: 90000 });
  return { context, page, consoleErrors, pageErrors };
}
// An editor file: init and the first render are done when the rail is filled.
const editorReady = () => !!document.querySelector('#dokufix-rail.has-items');
const READY = {
  'mit-editor': editorReady,
  'nur-lesen': () => true,
  'schlank': () => !document.querySelector('[data-gz]'),
  'kompakt': () => { const d = document.getElementById('d'); return !!d && d.children.length > 0 && !document.querySelector('.dokufix-rail-pending'); },
};
// Presses a button that ends in a render and waits for the render: a marker
// put into the rail is gone when the rail has been rebuilt.
async function pressAndWaitForRender(page, selector){
  await page.evaluate(() => {
    const marker = document.createElement('i');
    marker.id = 'durchlaeufe-render-pending';
    document.getElementById('dokufix-rail').appendChild(marker);
  });
  await page.click(selector);
  await page.waitForFunction(() => !document.getElementById('durchlaeufe-render-pending'), null, { timeout: 90000 });
}
async function editMode(page){
  if (await page.evaluate(() => document.body.classList.contains('mode-view'))) await page.click('#edit-btn');
}
async function typeAndRender(page, text){
  await editMode(page);
  await page.fill('#source', text);
  await pressAndWaitForRender(page, '#render-btn');
}
async function download(page, variant, file){
  await editMode(page);
  await page.click('#download-btn');
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.click('button[data-download="' + variant + '"]'),
  ]);
  await dl.saveAs(file);
  await page.waitForFunction(() => !document.querySelector('button[data-download]:disabled'));
}

// What a page shows, in the editor file as in an export.
const facts = page => page.evaluate(() => {
  // The content container: the preview in the editor file, <main> in an export
  // (in kompakt the unpacked body sits in #d inside it).
  const container = document.querySelector('#preview') || document.querySelector('main.reader-body #d') || document.querySelector('main.reader-body');
  const warnings = Array.from(container.querySelectorAll('.dokufix-warning'));
  const styleOf = w => {
    const cs = getComputedStyle(w), detail = w.querySelector('.dokufix-warning-detail'), ds = detail && getComputedStyle(detail);
    return { border: cs.borderLeftWidth + ' ' + cs.borderLeftStyle, background: cs.backgroundColor, padding: cs.paddingLeft,
             detail: ds ? ds.whiteSpace + ' on ' + ds.backgroundColor : 'none' };
  };
  const kids = Array.from(container.children);
  const rail = document.querySelector('.dokufix-rail');
  return {
    warnings: warnings.map(w => ({
      text: w.textContent, label: (w.querySelector('.dokufix-warning-title > strong') || { textContent: '' }).textContent,
      transient: w.hasAttribute('data-dokufix-transient'), style: styleOf(w),
      before: w.previousElementSibling ? w.previousElementSibling.tagName + '#' + w.previousElementSibling.id : '',
    })),
    children: kids.map(k => k.tagName.toLowerCase() + (k.className ? '.' + String(k.className).split(' ')[0] : '')),
    diagrams: container.querySelectorAll('.mermaid svg').length,
    // Mermaid's error picture: an SVG with this role and this sentence in it.
    errorPictures: document.querySelectorAll('svg[aria-roledescription="error"], .error-icon, .error-text').length +
      (document.body.textContent.includes('Syntax error in text') ? 1 : 0),
    // Mermaid names its drawing and its temporary elements after the diagram's id.
    mermaidOutside: Array.from(document.querySelectorAll('[id^="dmermaid"], [id^="imermaid"], [id^="mermaid-"]'))
      .filter(el => !container.contains(el)).map(el => el.tagName + '#' + el.id),
    transient: document.querySelectorAll('[data-dokufix-transient]').length,
    panel: !!container.querySelector('details.dokufix-frontmatter'),
    headingsWithoutId: Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(h => !h.id).length,
    tocLinks: container.querySelectorAll('nav.dokufix-toc a').length,
    markers: container.querySelectorAll('a[data-footnote-ref]').length,
    previews: container.querySelectorAll('sup.dokufix-fn-host > .dokufix-fn-preview').length,
    returnPaths: container.querySelectorAll('a[data-footnote-backref][id^="footnote-back-"]').length,
    railLinks: rail ? rail.querySelectorAll('a').length : 0,
    railHasItems: !!rail && rail.classList.contains('has-items'),
    footer: !!document.querySelector('footer.dokufix-meta'),
  };
});
const STYLED = { border: '6px solid', background: 'rgb(255, 248, 225)', padding: '16px', detail: 'pre-wrap on rgba(0, 0, 0, 0)' };
const isStyled = w => Object.keys(STYLED).every(k => w.style[k] === STYLED[k]);
// The one warning a case expects, by the texts it has to contain.
function checkWarning(scope, f, texts, what){
  const visible = f.warnings.filter(w => !w.transient);
  const w = visible[0];
  check(scope, 'one warning, ' + what, visible.length === 1 && texts.every(t => w.text.includes(t)), f.warnings.map(x => x.text));
  if (!w) return;
  check(scope, 'the warning says "Warnung:" in its text, so it is recognisable without colour', w.label === 'Warnung:' && w.text.startsWith('Warnung: '), w.text.slice(0, 60));
  check(scope, 'the warning is styled by the document styles', isStyled(w), w.style);
}
function checkErrors(scope, o, expected){
  check(scope, 'the error is on the console', expected.every(t => o.consoleErrors.some(e => e.includes(t))), o.consoleErrors.join(' | ').slice(0, 400) || 'nothing logged');
  check(scope, 'no page error and no rejected promise', o.pageErrors.length === 0, o.pageErrors.join(' | '));
}
// Saves the given read-only exports of the page as it is and checks each reopened.
async function checkExports(scope, browser, page, dir, prefix, variants, each){
  for (const v of variants){
    const file = path.join(dir, prefix + '-' + v.key + '.html');
    await download(page, v.download, file);
    const o = await open(browser, file, READY[v.key]);
    try {
      const f = await facts(o.page);
      each(scope + ', ' + v.key, f, fs.readFileSync(file, 'utf8'));
      check(scope + ', ' + v.key, 'opens without an error', o.pageErrors.length === 0 && o.consoleErrors.length === 0, o.pageErrors.concat(o.consoleErrors).join(' | '));
    } finally { await o.context.close(); }
  }
}

// ---------- one browser ----------
async function runBrowser(name, opts, copyWithPasses){
  const dir = path.join(opts.out, name);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await BROWSERS[name]();
  // A case that ends in an exception (a wait that times out, say) is a failed
  // check; the cases after it still run.
  const attempt = async (label, fn) => {
    try { await fn(); }
    catch (e){ check(label, 'the case ran to its end', false, String(e && e.message || e).split('\n')[0]); }
  };
  try {
    // ----- 1. a diagram with an error
    await attempt(name + ' diagram with an error', async () => {
      const scope = name + ' diagram with an error';
      let o = await open(browser, opts.file, editorReady);
      const bodyBefore = await o.page.evaluate(() => Array.from(document.body.children).length);
      await typeAndRender(o.page, DOC_DIAGRAMS);
      const f = await facts(o.page);
      checkWarning(scope, f, ['Ein Diagramm konnte nicht gezeichnet werden.', 'Parse error'], 'with Mermaid\'s message');
      check(scope, 'the warning stands where the diagram would be', f.warnings.length === 1 && f.warnings[0].before === 'H2#zwei', f.warnings.map(w => w.before));
      check(scope, 'the other two diagrams are drawn', f.diagrams === 2, f.diagrams + ' of 2');
      check(scope, 'no Mermaid error picture anywhere', f.errorPictures === 0, f.errorPictures);
      const bodyAfter = await o.page.evaluate(() => Array.from(document.body.children).length);
      check(scope, 'nothing of Mermaid\'s is left outside the preview', f.mermaidOutside.length === 0 && bodyAfter === bodyBefore, { outside: f.mermaidOutside, bodyChildren: [bodyBefore, bodyAfter] });
      check(scope, 'the passes around it ran and the rail is built', f.tocLinks >= 4 && f.previews === 1 && f.returnPaths === 1 && f.railHasItems && f.railLinks >= 4, f);
      checkErrors(scope, o, ['Mermaid error']);
      const diagramExport = (s, x, text) => {
        checkWarning(s, x, ['Ein Diagramm konnte nicht gezeichnet werden.', 'Parse error'], 'with Mermaid\'s message');
        check(s, 'two diagrams, no error picture', x.diagrams === 2 && x.errorPictures === 0, { diagrams: x.diagrams, errorPictures: x.errorPictures });
        if (s.endsWith('nur-lesen')) check(s, 'contains no <script>', !/<script/i.test(text));
      };
      await checkExports(scope, browser, o.page, dir, 'diagramm', READONLY, diagramExport);
      // "Mit Editor": the saved file renders its document again when it is opened.
      const saved = path.join(dir, 'diagramm-mit-editor.html');
      await download(o.page, 'full', saved);
      await o.context.close();
      o = await open(browser, saved, editorReady);
      diagramExport(scope + ', mit-editor', await facts(o.page), '');
      checkErrors(scope + ', mit-editor', o, ['Mermaid error']);
      await o.context.close();
    });

    // ----- 2. overlapping renders
    await attempt(name + ' overlapping renders, a transient element', async () => {
      let scope = name + ' overlapping renders';
      const o = await open(browser, opts.file, editorReady);
      await o.page.evaluate(([a, b]) => {
        const source = document.getElementById('source'), button = document.getElementById('render-btn');
        const preview = document.getElementById('preview'), rail = document.getElementById('dokufix-rail');
        const h1 = () => (preview.querySelector('h1') || { textContent: '' }).textContent;
        const log = window.durchlaeufe = { rails: [], railsWhenSecondWasRequested: null };
        // Every rebuild of the rail, with what the preview showed at that moment.
        new MutationObserver(() => {
          log.rails.push({ rail: (rail.querySelector('a') || { textContent: '' }).textContent, preview: h1() });
        }).observe(rail, { childList: true });
        // The first render has put document A into the preview and is in its
        // passes: now request the second.
        const first = new MutationObserver(() => {
          if (h1() !== 'Dokument A') return;
          first.disconnect();
          log.railsWhenSecondWasRequested = log.rails.length;
          source.value = b;
          button.click();
        });
        first.observe(preview, { childList: true });
        source.value = a;
        button.click();
      }, [overlapDoc('A'), overlapDoc('B')]);
      await o.page.waitForFunction(() => window.durchlaeufe.rails.some(r => r.rail === 'B eins'), null, { timeout: 90000 });
      await o.page.waitForTimeout(500);   // a render still running would show up as one more rail
      const log = await o.page.evaluate(() => ({ ...window.durchlaeufe, h1: document.querySelector('#preview h1').textContent,
        diagrams: document.querySelectorAll('#preview .mermaid svg').length }));
      check(scope, 'the second render was requested while the first ran', log.railsWhenSecondWasRequested === 0, log);
      check(scope, 'they ran one after the other: each rail was built from the document the preview showed',
        JSON.stringify(log.rails) === JSON.stringify([{ rail: 'A eins', preview: 'Dokument A' }, { rail: 'B eins', preview: 'Dokument B' }]), log.rails);
      check(scope, 'the preview ends as the second one\'s, complete', log.h1 === 'Dokument B' && log.diagrams === 2, log);
      check(scope, 'no error', o.pageErrors.length === 0 && o.consoleErrors.length === 0, o.pageErrors.concat(o.consoleErrors).join(' | '));

      // ----- 3. a transient element (same page)
      scope = name + ' transient element';
      const placed = await o.page.evaluate(() => {
        const make = (tag, id, marked) => {
          const el = document.createElement(tag);
          el.id = id;
          if (marked) el.setAttribute('data-dokufix-transient', '');
          el.textContent = tag === 'style' ? '.durchlaeufe{color:red}' : 'durchlaeufe';
          return el;
        };
        document.head.appendChild(make('style', 'durchlaeufe-t-head', true));
        document.body.appendChild(make('div', 'durchlaeufe-t-body', true));
        document.getElementById('header-actions').appendChild(make('span', 'durchlaeufe-t-header', true));
        const nested = make('div', 'durchlaeufe-t-outer', true);
        nested.appendChild(make('b', 'durchlaeufe-t-inner', false));
        document.querySelector('.pane-preview').appendChild(nested);
        // Not marked: this one is a leftover, and the save takes it along.
        document.body.appendChild(make('i', 'durchlaeufe-nicht-markiert', false));
        return document.querySelectorAll('[data-dokufix-transient]').length;
      });
      const withTransient = path.join(dir, 'transient-mit-editor.html');
      await download(o.page, 'full', withTransient);
      const savedText = fs.readFileSync(withTransient, 'utf8');
      check(scope, 'the page held four marked elements when it was saved', placed === 4, placed);
      check(scope, 'the marked elements are still in the running page', await o.page.evaluate(() => document.querySelectorAll('[data-dokufix-transient]').length) === 4);
      await o.context.close();
      // The saved file, read with scripts off: its script names the attribute, so
      // the text of the file cannot be searched for it.
      const off = await browser.newContext({ javaScriptEnabled: false });
      const offPage = await off.newPage();
      await offPage.goto(pathToFileURL(withTransient).href);
      const left = await offPage.evaluate(() => ({
        marked: document.querySelectorAll('[data-dokufix-transient]').length,
        ids: Array.from(document.querySelectorAll('[id^="durchlaeufe-"]')).map(el => el.id),
      }));
      await off.close();
      check(scope, 'no marked element, and nothing inside one, is in the saved file', left.marked === 0 && !savedText.includes('durchlaeufe-t-'), left);
      check(scope, 'control: the element that was not marked is in the saved file', left.ids.join(' ') === 'durchlaeufe-nicht-markiert', left);
    });

    // ----- 4. Markdown cannot be parsed
    await attempt(name + ' Markdown cannot be parsed', async () => {
      const scope = name + ' Markdown cannot be parsed';
      const o = await open(browser, opts.file, editorReady);
      await o.page.evaluate(message => { marked.use({ hooks: { preprocess(){ throw new Error(message); } } }); }, MARKED_MESSAGE);
      await typeAndRender(o.page, DOC_DIAGRAMS);
      const f = await facts(o.page);
      checkWarning(scope, f, ['Das Markdown konnte nicht verarbeitet werden.', MARKED_MESSAGE], 'with the message of marked');
      check(scope, 'the warning replaces the content', f.children.join(' ') === 'div.dokufix-warning', f.children);
      check(scope, 'the rail is rebuilt, and empty', !f.railHasItems && f.railLinks === 0, { railHasItems: f.railHasItems, railLinks: f.railLinks });
      checkErrors(scope, o, ['Markdown error']);
      await checkExports(scope, browser, o.page, dir, 'markdown', READONLY, (s, x, text) => {
        checkWarning(s, x, ['Das Markdown konnte nicht verarbeitet werden.', MARKED_MESSAGE], 'with the message of marked');
        check(s, 'the warning and the export\'s footer, no rail', x.children[0] === 'div.dokufix-warning' && x.footer && x.railLinks === 0, { children: x.children, footer: x.footer, railLinks: x.railLinks });
        if (s.endsWith('nur-lesen')) check(s, 'contains no <script>', !/<script/i.test(text));
      });
      await o.context.close();
    });

    // ----- 5. a pass throws (the copy with two passes more)
    await attempt(name + ' a pass throws', async () => {
      const scope = name + ' a pass throws';
      const o = await open(browser, copyWithPasses, editorReady);
      const f = await facts(o.page);   // the demo text: metadata, table of contents, footnotes, two diagrams
      checkWarning(scope, f, ['Der Schritt „' + THROWING_PASS + '“ ist fehlgeschlagen.', THROWING_MESSAGE], 'naming the pass');
      const firstContent = f.children.findIndex(c => c !== 'div.dokufix-warning');
      check(scope, 'the warnings stand at the top of the document', firstContent === f.warnings.length && f.children[firstContent] === 'details.dokufix-frontmatter', f.children.slice(0, 5));
      check(scope, 'every other document pass ran: metadata, heading ids, table of contents, footnote previews, return paths, diagrams',
        f.panel && f.headingsWithoutId === 0 && f.tocLinks > 0 && f.markers > 0 && f.previews === f.markers && f.returnPaths > 0 && f.diagrams === 2 && f.errorPictures === 0, f);
      check(scope, 'the rail is built', f.railHasItems && f.railLinks >= 4, { railHasItems: f.railHasItems, railLinks: f.railLinks });
      const live = f.warnings.filter(w => w.transient);
      check(scope, 'the run-time pass that threw has its warning in the page, marked transient',
        live.length === 1 && live[0].text.includes('„' + RUNTIME_PASS + '“') && live[0].text.includes(RUNTIME_MESSAGE) && isStyled(live[0]), f.warnings);
      check(scope, 'and the element it added is in the page', await o.page.evaluate(id => !!document.querySelector('#preview #' + id + '[data-dokufix-transient]'), TRANSIENT_ID));
      // The names only: Firefox prints an error object on the console as "Error".
      checkErrors(scope, o, ['Pass "' + THROWING_PASS + '" failed', 'Pass "' + RUNTIME_PASS + '" failed']);
      await checkExports(scope, browser, o.page, dir, 'schritt', READONLY, (s, x, text) => {
        checkWarning(s, x, ['Der Schritt „' + THROWING_PASS + '“ ist fehlgeschlagen.', THROWING_MESSAGE], 'naming the pass');
        check(s, 'it is the first thing in the document, and the rest is there', x.children[0] === 'div.dokufix-warning' && x.children[1] === 'details.dokufix-frontmatter' && x.tocLinks > 0 && x.diagrams === 2, x.children.slice(0, 4));
        check(s, 'nothing transient: neither the run-time warning nor the element of the run-time pass',
          x.transient === 0 && x.warnings.length === 1 && !text.includes(TRANSIENT_ID) && !text.includes('data-dokufix-transient') && !text.includes(RUNTIME_PASS), x.warnings.map(w => w.text));
        if (s.endsWith('nur-lesen')) check(s, 'contains no <script>', !/<script/i.test(text));
      });
      await o.context.close();
    });
  } finally {
    await browser.close();
  }
}

// ---------- main ----------
const opts = parseArgs(process.argv.slice(2));
fs.rmSync(opts.out, { recursive: true, force: true });
fs.mkdirSync(opts.out, { recursive: true });
const copyWithPasses = buildCopyWithThrowingPasses(opts.out);

const names = opts.browser === 'all' ? ['chromium', 'firefox'] : [opts.browser];
for (const name of names) await runBrowser(name, opts, copyWithPasses);

const failed = results.filter(r => !r.ok);
for (const r of results) console.log((r.ok ? 'ok    ' : 'FAIL  ') + r.scope + ': ' + r.name + (r.detail ? ' — ' + r.detail : ''));
console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' green; exports and saved files: ' + opts.out);
process.exit(failed.length ? 1 : 0);
