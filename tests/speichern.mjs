// Save round trip for dist/dokufix.html: does a file saved as "Mit Editor" hold
// its document, and does a file saved from that file hold its own?
//
//   node tests/speichern.mjs
//
// Options
//   --file <file>      the file under test (default: ../dist/dokufix.html)
//   --browser <name>   chromium | firefox | all (default: all)
//   --out <dir>        where the saved files go (default: out/speichern, emptied first)
//
// Why this exists. "Mit Editor" writes the page into a new file, and the new
// file has to carry the document. The PoC did that by rewriting the text of its
// own script between comment marks. A build that minifies the script removes
// the marks, and the saved file then opened without an error and showed the
// demo text instead of the document. Now the document and the demo text live in
// two data blocks of the page (#dokufix-source, #dokufix-demo), and nothing
// reads or rewrites script text. This run is what notices if that breaks again:
// no screenshot would.
//
// What it does, per browser, every opening in a browser context of its own, so
// with fresh storage — the saved file must work from what is in it, not from
// what IndexedDB remembers:
//
//   1. open the file under test          the editor holds the demo text
//      type document A, save             → generation 1
//   2. open generation 1                 the editor holds A, version v1, clean
//      type document B, save             → generation 2
//   3. open generation 2                 the editor holds B, version v2
//      "Demo zurücksetzen"               the editor holds the original demo text
//   4. build a copy of src/ whose demo text contains </script>, <!-- and the
//      like, open it                     the editor holds that text unchanged
//
// It also reads the saved files as text: #dokufix-history parses and holds the
// version description as typed, both text blocks hold {"gz": …} that unpack to
// the document and to the demo text, and the script is the one of the file
// under test, byte for byte, in both generations.
//
// A and B contain what could break a block or a replacement: </script>, <!--,
// backticks, ${…}, $&, backslashes, quotes, non-ASCII. B ends without a newline.
// The version description contains "<!-- <script>" and "</script>".
//
// Exit code 1 when anything fails. The page is used the way an author uses it,
// through its buttons; the run waits on the DOM as tests/vergleich.mjs does.

import { chromium, firefox } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

// ---------- arguments ----------
function parseArgs(argv){
  const a = { browser: 'all', file: path.join(root, 'dist/dokufix.html'), out: path.join(here, 'out/speichern') };
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
const TRICKY = [
  'Umlaute und Zeichen: ä ö ü ß — „Anführung“ 🚧',
  'Ein `</script>`, ein `<!--`, ein `<script>` und ein `-->` im Text.',
  'Muster, die ein Ersetzen umschreiben würde: $& $1 $` $\' und ${quelle}.',
  'Rückstriche: \\n \\u003c \\\\ und Anführungen: \'einfach\' "doppelt".',
].join('\n\n');
const body = name => [
  '## Eins', 'Erster Abschnitt von ' + name + '.[^a]',
  '## Zwei', '```js\nconst s = `</script><!-- <script> ${x}`;\n```',
  '## Drei', '| a | b |\n|---|---|\n| 1 | 2 |',
  '## Vier', TRICKY,
  '[^a]: Fußnote von ' + name + '.',
].join('\n\n');
const DOC_A = '# Dokument A\n\n' + body('A') + '\n';
const DOC_B = '---\ntitle: Dokument B\nversion: 2\n---\n\n# Dokument B\n\nEin Absatz, den A nicht hat.\n\n' + body('B'); // no final newline
// The version description typed into every save. It goes into #dokufix-history
// as it is. "<!--" followed by "<script" is what makes a script element run on
// past its "</script>": written unescaped, the history block would swallow the
// demo block behind it, and the file would open as v0 with no demo text.
const DESCRIPTION = 'Stand aus speichern.mjs <!-- <script> und </script>';
const DEMO_EXTRA ='\n## Demo-Text mit Markup\n\nEin </script> ohne Rückstriche, ein <!-- und ein <script>, dazu $& und {{slot:app.js}}.\n';

// ---------- results ----------
const results = [];
const check = (scope, name, ok, detail) => results.push({ scope, name, ok: !!ok, detail: ok || detail === undefined ? '' : String(detail) });
// Where two texts first differ, short enough for one line.
function firstDifference(got, want){
  if (typeof got !== 'string') return 'got ' + JSON.stringify(got);
  let i = 0;
  while (i < got.length && i < want.length && got[i] === want[i]) i++;
  return 'lengths ' + got.length + ' and ' + want.length + ', first difference at ' + i + ': got ' +
    JSON.stringify(got.slice(i, i + 40)) + ', expected ' + JSON.stringify(want.slice(i, i + 40));
}
const same = (scope, name, got, want) => check(scope, name, got === want, got === want ? '' : firstDifference(got, want));

// ---------- the page, through its DOM ----------
// Opens a file in a context of its own and waits until init and the first
// render are done: the rail is the last thing a render builds.
async function open(browser, file){
  const context = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  // "Mit Editor" asks for a version description, "Demo zurücksetzen" for a confirmation.
  page.on('dialog', d => d.type() === 'prompt' ? d.accept(DESCRIPTION) : d.accept());
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => !!document.querySelector('#dokufix-rail.has-items'), null, { timeout: 90000 });
  return { context, page, errors };
}
const state = page => page.evaluate(() => ({
  source: document.getElementById('source').value,
  h1: (document.querySelector('#preview h1') || { textContent: '' }).textContent,
  version: document.getElementById('version-btn').textContent,
  dirty: document.body.classList.contains('is-dirty'),
}));
// Presses a button that ends in a render, and waits for the render: a marker
// put into the rail is gone when the rail has been rebuilt.
async function pressAndWaitForRender(page, selector){
  await page.evaluate(() => {
    const marker = document.createElement('i');
    marker.id = 'speichern-render-pending';
    document.getElementById('dokufix-rail').appendChild(marker);
  });
  await page.click(selector);
  await page.waitForFunction(() => !document.getElementById('speichern-render-pending'), null, { timeout: 90000 });
}
// Types a document into the editor, renders it and saves it as "Mit Editor".
async function editAndSave(page, text, file){
  if (await page.evaluate(() => document.body.classList.contains('mode-view'))) await page.click('#edit-btn');
  await page.fill('#source', text);
  await pressAndWaitForRender(page, '#render-btn');
  await page.click('#download-btn');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.click('button[data-download="full"]'),
  ]);
  await download.saveAs(file);
  await page.waitForFunction(() => !document.querySelector('button[data-download]:disabled'));
}

// ---------- a saved file, as text ----------
function dataBlock(html, id){
  const m = html.match(new RegExp('<script type="application/json" id="' + id + '">([\\s\\S]*?)</script>'));
  return m ? m[1] : null;
}
// The text a block holds, and whether it holds it gzipped.
function blockText(html, id){
  const raw = dataBlock(html, id);
  if (raw === null) return { found: false };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.gz === 'string') return { found: true, gz: true, text: zlib.gunzipSync(Buffer.from(parsed.gz, 'base64')).toString('utf8') };
    return { found: true, gz: false, text: parsed.text };
  } catch (e){ return { found: true, error: String(e) }; }
}
// The page's own script: from the first <script> without attributes (the data
// blocks and the libraries before it all carry some) to the last </script> of
// the file. Not "the last <script>": the script itself contains that text, in
// the templates of the read-only exports.
function appScript(html){
  const start = html.indexOf('<script>'), end = html.lastIndexOf('</script>');
  return start < 0 || end < start ? null : html.slice(start + '<script>'.length, end);
}
function checkSavedFile(scope, file, original, doc, demo, version){
  const html = fs.readFileSync(file, 'utf8');
  let history = null, historyError = '';
  try { history = JSON.parse(dataBlock(html, 'dokufix-history')); }
  catch (e){ historyError = String(e); }
  check(scope, 'file: #dokufix-history parses', history !== null, historyError);
  if (history !== null){
    const descriptions = Array.isArray(history.history) ? history.history.map(e => e.m) : [];
    check(scope, 'file: #dokufix-history holds version ' + version + ', every entry with the description as typed',
      history.version === version && descriptions.length === version && descriptions.every(m => m === DESCRIPTION),
      JSON.stringify({ version: history.version, descriptions }));
  }
  const source = blockText(html, 'dokufix-source'), demoBlock = blockText(html, 'dokufix-demo');
  check(scope, 'file: #dokufix-source holds {"gz": …}', source.found && source.gz, JSON.stringify(source).slice(0, 200));
  if (source.gz) same(scope, 'file: #dokufix-source unpacks to the document', source.text, doc);
  check(scope, 'file: #dokufix-demo holds {"gz": …}', demoBlock.found && demoBlock.gz, JSON.stringify(demoBlock).slice(0, 200));
  if (demoBlock.gz) same(scope, 'file: #dokufix-demo unpacks to the demo text', demoBlock.text, demo);
  const script = appScript(html);
  check(scope, 'file: the script is the one of the file under test, byte for byte',
    script !== null && script.length > 10000 && script === appScript(original), script === null ? 'no script found' : script.length + ' characters');
}

// ---------- one browser ----------
async function runBrowser(name, opts, demoFile, demoWithMarkup){
  const dir = path.join(opts.out, name);
  fs.mkdirSync(dir, { recursive: true });
  const gen1 = path.join(dir, 'generation-1.html'), gen2 = path.join(dir, 'generation-2.html');
  const original = fs.readFileSync(opts.file, 'utf8');
  const browser = await BROWSERS[name]();
  try {
    // 1. the file under test
    let scope = name + ' file under test';
    let o = await open(browser, opts.file);
    const demo = (await state(o.page)).source;
    check(scope, 'the editor holds a demo text', demo.length > 0);
    const demoSource = path.join(root, 'src/demo.md');
    if (fs.existsSync(demoSource)) same(scope, 'the demo text is src/demo.md, unchanged', demo, fs.readFileSync(demoSource, 'utf8'));
    await editAndSave(o.page, DOC_A, gen1);
    check(scope, 'no page error', o.errors.length === 0, o.errors.join(' | '));
    await o.context.close();
    checkSavedFile(name + ' generation 1', gen1, original, DOC_A, demo, 1);

    // 2. first generation
    scope = name + ' generation 1';
    o = await open(browser, gen1);
    let s = await state(o.page);
    same(scope, 'opened with fresh storage, the editor holds document A', s.source, DOC_A);
    check(scope, 'the preview shows document A', s.h1 === 'Dokument A', JSON.stringify(s.h1));
    check(scope, 'version v1, not marked as changed', s.version === 'v1' && !s.dirty, JSON.stringify({ version: s.version, dirty: s.dirty }));
    await editAndSave(o.page, DOC_B, gen2);
    check(scope, 'no page error', o.errors.length === 0, o.errors.join(' | '));
    await o.context.close();
    checkSavedFile(name + ' generation 2', gen2, original, DOC_B, demo, 2);

    // 3. second generation
    scope = name + ' generation 2';
    o = await open(browser, gen2);
    s = await state(o.page);
    same(scope, 'opened with fresh storage, the editor holds document B', s.source, DOC_B);
    check(scope, 'the preview shows document B', s.h1 === 'Dokument B', JSON.stringify(s.h1));
    check(scope, 'version v2, not marked as changed', s.version === 'v2' && !s.dirty, JSON.stringify({ version: s.version, dirty: s.dirty }));
    await o.page.click('#edit-btn');
    await pressAndWaitForRender(o.page, '#reset-btn');
    s = await state(o.page);
    same(scope, '"Demo zurücksetzen" gives the original demo text', s.source, demo);
    check(scope, 'no page error', o.errors.length === 0, o.errors.join(' | '));
    await o.context.close();

    // 4. a demo text that contains markup
    scope = name + ' demo text with markup';
    o = await open(browser, demoFile);
    s = await state(o.page);
    same(scope, 'the editor holds the demo text unchanged', s.source, demoWithMarkup);
    check(scope, 'no page error', o.errors.length === 0, o.errors.join(' | '));
    await o.context.close();
  } finally {
    await browser.close();
  }
}

// ---------- main ----------
const opts = parseArgs(process.argv.slice(2));
fs.rmSync(opts.out, { recursive: true, force: true });
fs.mkdirSync(opts.out, { recursive: true });

// The build for step 4: a copy of src/ with more in its demo text.
const srcCopy = path.join(opts.out, 'src');
fs.cpSync(path.join(root, 'src'), srcCopy, { recursive: true });
const demoWithMarkup = fs.readFileSync(path.join(srcCopy, 'demo.md'), 'utf8') + DEMO_EXTRA;
fs.writeFileSync(path.join(srcCopy, 'demo.md'), demoWithMarkup);
const demoFile = path.join(opts.out, 'demo-mit-markup.html');
const built = spawnSync(process.execPath, [path.join(root, 'build.mjs'), '--src', srcCopy, '--out', demoFile], { encoding: 'utf8' });
if (built.status !== 0){
  console.error('could not build the file for the demo text with markup:\n' + built.stderr);
  process.exit(1);
}
fs.rmSync(srcCopy, { recursive: true });

const names = opts.browser === 'all' ? ['chromium', 'firefox'] : [opts.browser];
for (const name of names) await runBrowser(name, opts, demoFile, demoWithMarkup);

const failed = results.filter(r => !r.ok);
for (const r of results) console.log((r.ok ? 'ok    ' : 'FAIL  ') + r.scope + ': ' + r.name + (r.detail ? ' — ' + r.detail : ''));
console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' green; saved files: ' + opts.out);
process.exit(failed.length ? 1 : 0);
