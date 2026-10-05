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
// what IndexedDB remembers. One browser process per browser; the libraries
// the page loads from jsDelivr are served to every context from tests/.cdn/
// (tests/cdn.mjs):
//
//   1. open the file under test          the editor holds the demo text
//      type document A, save             → generation 1
//   2. open generation 1                 the editor holds A, version v1, clean
//      type document B, save             → generation 2
//   3. open generation 2                 the editor holds B, version v2
//      "Demo zurücksetzen"               the editor holds the original demo text,
//                                        and every image it names is shown: a
//                                        save carries the images of the demo text
//                                        (both generations hold them in their
//                                        #dokufix-assets block, by their hash)
//   4. build a copy of src/ whose demo text contains </script>, <!-- and the
//      like, open it                     the editor holds that text unchanged
//
// It also reads the saved files as text: #dokufix-history parses and holds the
// version description as typed, both text blocks hold {"gz": …} that unpack to
// the document and to the demo text, and the script is the one of the file
// under test, byte for byte, in both generations.
//
// And it compares each saved file with the file under test as a whole. A save
// clones the running page, so whatever the page gained while it ran can end up
// in the file: an element a library appended, a text a state left behind. A
// saved file is the browser's serialisation of that clone, so its text is not
// the built file's even when nothing leaked (hidden becomes hidden="", the line
// breaks around <html> and </body> move). So both files are opened with scripts
// switched off and read back from the DOM, which gives two texts in the same
// form. They must be equal apart from the differences in ALLOWED, each of which
// is listed there with its reason. Anything else fails the run and is shown.
// As a control the run adds one element to a copy of the first generation and
// expects the comparison to report it.
//
// Before the second save the run switches heading numbering on. It travels
// with a saved file, which is one of the allowed differences, and the second
// generation has to open numbered.
//
// Six more saves visit states of the page that leave marks on its own
// elements, and each saved file is compared with the built file the same way:
//
//   5. a narrow window, saved with the hamburger panel open (the download menu
//      sits inside that panel)
//   6. IndexedDB unavailable, so the storage banner is shown with its reason
//      and the version mark carries its warning. The run takes IndexedDB away
//      with an init script, before the page's script runs; the product has no
//      switch for it
//      After the save: the banner lies over the "Editor" button, its close
//      button hides it, and the "Editor" button can then be clicked
//   7. the view of the link "license information" open, in read mode and in
//      the toolbar. Both elements are made by the script and marked transient,
//      so the saved file has neither; opened, it makes them again, closed
//   8. the search panel open in read mode, with a term and its results, the
//      term a label of a Mermaid diagram holds as well (story 17). The
//      panel is made by the script and marked transient, so the saved file
//      has none; opened, it makes it again, closed and empty. Its hits are
//      highlighted in the preview (epic 5, story 5): the saved file is
//      compared as every other. `nur-lesen`, `schlank` and `kompakt` written
//      from the page with the panel open are byte for byte the files written
//      after it is closed, the clock of the page standing still so that their
//      export time is one. That shows the open panel changes nothing of what
//      an export writes; it does not show that the highlight stays out of the
//      document, because a read-only download renders the preview anew before
//      it clones it, and the clone of the preview is emptied, so the ranges
//      are over replaced nodes when the file is written. That the highlight
//      leaves the document's DOM as it is, tests/vergleich.mjs checks, with
//      the panel open ("DOM unchanged"). The document's code block has its
//      copy button (story 5.19), transient: neither the saved file nor an
//      export holds it
//   9. the large view of a BPMN diagram open in read mode, at "150 %", its
//      live viewer running (story 2.11), the lightbox of the bpmn.io logo open
//      in <body> and a drag going on, so the cursor class of bpmn-js is on
//      <body>: the saved file is the built file apart from the listed
//      differences, as every saved file is. The controls are document
//      content, and only their checked properties are set, never the
//      attributes; opened, the saved file shows the diagram closed, at
//      "Einpassen", no viewer, and the page scrolls. Each diagram has the
//      line of its downloads (story 2.10) with the picture button, which is
//      transient; opened, the saved file shows one again below each
//  10. the metadata panel opened by a click on its result in the search
//      (epic 5, story 8), which sets its `open`: the saved file is compared
//      as every other and opens with the panel closed, since "Mit Editor"
//      saves from the source; `nur-lesen`, `schlank` and `kompakt` written
//      after such a click are byte for byte the files written with the panel
//      and the search closed, since an export renders the document anew
//
// A and B contain what could break a block or a replacement: </script>, <!--,
// backticks, ${…}, $&, backslashes, quotes, non-ASCII. B ends without a newline.
// The version description contains "<!-- <script>" and "</script>".
//
// Exit code 1 when anything fails, and when the page asked for a library the
// file under test does not pin. The page is used the way an author uses it,
// through its buttons; the run waits on the DOM as tests/vergleich.mjs does.

import { chromium, firefox } from 'playwright-core';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareLibraries, librariesLine } from './cdn.mjs';

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
// A BPMN diagram with coordinates, for step 9: its large view starts the live viewer (story 2.11).
const BPMN_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitionen" targetNamespace="http://example.org/dokufix">',
  '  <bpmn:process id="Prozess" isExecutable="false">',
  '    <bpmn:startEvent id="Start" name="Los"/>',
  '    <bpmn:task id="Tun" name="Etwas tun"/>',
  '    <bpmn:endEvent id="Ende" name="Fertig"/>',
  '    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Tun"/>',
  '    <bpmn:sequenceFlow id="F2" sourceRef="Tun" targetRef="Ende"/>',
  '  </bpmn:process>',
  '  <bpmndi:BPMNDiagram id="Diagramm">',
  '    <bpmndi:BPMNPlane id="Ebene" bpmnElement="Prozess">',
  '      <bpmndi:BPMNShape id="Start_di" bpmnElement="Start"><dc:Bounds x="32" y="32" width="36" height="36"/></bpmndi:BPMNShape>',
  '      <bpmndi:BPMNShape id="Tun_di" bpmnElement="Tun"><dc:Bounds x="120" y="10" width="100" height="80"/></bpmndi:BPMNShape>',
  '      <bpmndi:BPMNShape id="Ende_di" bpmnElement="Ende"><dc:Bounds x="272" y="32" width="36" height="36"/></bpmndi:BPMNShape>',
  '      <bpmndi:BPMNEdge id="F1_di" bpmnElement="F1"><di:waypoint x="68" y="50"/><di:waypoint x="120" y="50"/></bpmndi:BPMNEdge>',
  '      <bpmndi:BPMNEdge id="F2_di" bpmnElement="F2"><di:waypoint x="220" y="50"/><di:waypoint x="272" y="50"/></bpmndi:BPMNEdge>',
  '    </bpmndi:BPMNPlane>',
  '  </bpmndi:BPMNDiagram>',
  '</bpmn:definitions>',
].join('\n');
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
// The same for two long texts: with what stands in front of the difference,
// enough to see which element it is in.
function differenceInContext(got, want){
  let i = 0;
  while (i < got.length && i < want.length && got[i] === want[i]) i++;
  const from = Math.max(0, i - 120);
  return 'lengths ' + got.length + ' and ' + want.length + ', first difference at ' + i + ', after ' + JSON.stringify(got.slice(from, i)) +
    ': saved file has ' + JSON.stringify(got.slice(i, i + 160)) + ', built file has ' + JSON.stringify(want.slice(i, i + 160));
}

// ---------- the page, through its DOM ----------
// Opens a file in a context of its own and waits until init and the first
// render are done: the rail is the last thing a render builds.
// options: { viewport, initScript }, for the states of steps 5 and 6.
async function open(browser, file, options = {}){
  const context = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: options.viewport || { width: 1400, height: 1000 }, acceptDownloads: true });
  await libraries.serve(context);
  if (options.initScript) await context.addInitScript(options.initScript);
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
  numbered: document.body.classList.contains('numbered'),
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
// Types a document into the editor, renders it and saves it as "Mit Editor";
// with numbering, heading numbering is switched on before the save.
async function editAndSave(page, text, file, numbering = false){
  if (await page.evaluate(() => document.body.classList.contains('mode-view'))) await page.click('#edit-btn');
  await page.fill('#source', text);
  await pressAndWaitForRender(page, '#render-btn');
  if (numbering) await page.click('#numbering-btn');
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
// ---------- a saved file, as the browser reads it ----------
// What a saved file may differ in from the built file, and why. Each entry
// names elements and what is set to the same value in both files before they
// are compared. Nothing is on this list without a reason: a difference that
// is not here is a leftover, and the place to remove it is the clean-up of the
// clone in src/app/downloads/with-editor.js.
const ALLOWED = [
  { why: 'the data blocks are what a save writes: history, demo text, document, images',
    selector: 'script[type="application/json"]', text: '' },
  { why: 'the version mark shows the version the file was saved as',
    selector: '#version-btn', text: '' },
  { why: 'heading numbering travels with a saved file (decision of 2026-10-02): the class on <body>',
    selector: 'body', removeClass: 'numbered' },
  { why: 'heading numbering, as above: the state of its button',
    selector: '#numbering-btn', removeClass: 'toggle-on', attribute: ['aria-pressed', 'false'] },
  { why: 'where "hidden" stands among the attributes of the storage banner: a banner that was shown lost the attribute, and the save puts it back behind the others. That it is there is compared',
    selector: '#storage-error', lastAttribute: 'hidden' },
];
// A file as the browser serialises it with scripts off, the allowed differences
// taken out; and what the version mark said before that.
async function serialised(browser, file){
  const context = await browser.newContext({ javaScriptEnabled: false });
  await libraries.serve(context);
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(file).href);
    return await page.evaluate(allowed => {
      const mark = document.getElementById('version-btn');
      const versionMark = mark ? mark.textContent : null;
      for (const a of allowed){
        for (const el of document.querySelectorAll(a.selector)){
          if ('text' in a) el.textContent = a.text;
          if (a.removeClass) el.classList.remove(a.removeClass);
          if (a.attribute) el.setAttribute(a.attribute[0], a.attribute[1]);
          if (a.lastAttribute && el.hasAttribute(a.lastAttribute)){
            const value = el.getAttribute(a.lastAttribute);
            el.removeAttribute(a.lastAttribute);
            el.setAttribute(a.lastAttribute, value);
          }
        }
      }
      return { html: '<!DOCTYPE html>\n' + document.documentElement.outerHTML, versionMark };
    }, ALLOWED);
  } finally {
    await context.close();
  }
}
async function checkAgainstBuiltFile(scope, browser, file, built, version){
  const saved = await serialised(browser, file);
  check(scope, 'file: the version mark reads v' + version, saved.versionMark === 'v' + version, JSON.stringify(saved.versionMark));
  check(scope, 'file: apart from the ' + ALLOWED.length + ' listed differences it is the built file, as the browser serialises both',
    saved.html === built.html, saved.html === built.html ? '' : differenceInContext(saved.html, built.html));
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
    const built = await serialised(browser, opts.file);
    check(name + ' file under test', 'read back with scripts off, it is a page with its script', built.html.length > 10000 && built.html.includes('id="dokufix-source"'), built.html.length + ' characters');

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
    await checkAgainstBuiltFile(name + ' generation 1', browser, gen1, built, 1);
    // Control: the comparison has to notice an element that does not belong there.
    const leftover = path.join(dir, 'generation-1-mit-rest.html');
    const gen1Text = fs.readFileSync(gen1, 'utf8');
    fs.writeFileSync(leftover, gen1Text.slice(0, gen1Text.lastIndexOf('</body>')) + '<div class="rest"></div>' + gen1Text.slice(gen1Text.lastIndexOf('</body>')));
    const withLeftover = await serialised(browser, leftover);
    check(name + ' generation 1', 'control: a copy with one element more is reported as different', withLeftover.html !== built.html && withLeftover.html.includes('<div class="rest">'));

    // 2. first generation
    scope = name + ' generation 1';
    o = await open(browser, gen1);
    let s = await state(o.page);
    same(scope, 'opened with fresh storage, the editor holds document A', s.source, DOC_A);
    check(scope, 'the preview shows document A', s.h1 === 'Dokument A', JSON.stringify(s.h1));
    check(scope, 'version v1, not marked as changed', s.version === 'v1' && !s.dirty, JSON.stringify({ version: s.version, dirty: s.dirty }));
    check(scope, 'headings not numbered', !s.numbered);
    await editAndSave(o.page, DOC_B, gen2, true);
    check(scope, 'no page error', o.errors.length === 0, o.errors.join(' | '));
    await o.context.close();
    checkSavedFile(name + ' generation 2', gen2, original, DOC_B, demo, 2);
    await checkAgainstBuiltFile(name + ' generation 2', browser, gen2, built, 2);

    // 3. second generation
    scope = name + ' generation 2';
    o = await open(browser, gen2);
    s = await state(o.page);
    same(scope, 'opened with fresh storage, the editor holds document B', s.source, DOC_B);
    check(scope, 'the preview shows document B', s.h1 === 'Dokument B', JSON.stringify(s.h1));
    check(scope, 'version v2, not marked as changed', s.version === 'v2' && !s.dirty, JSON.stringify({ version: s.version, dirty: s.dirty }));
    check(scope, 'heading numbering, switched on before the save, came along', s.numbered);
    await o.page.click('#edit-btn');
    await pressAndWaitForRender(o.page, '#reset-btn');
    s = await state(o.page);
    same(scope, '"Demo zurücksetzen" gives the original demo text', s.source, demo);
    // The images the demo text names: in the file's block, and shown, although
    // neither document A nor B names one and the storage is fresh.
    const demoImages = [...new Set(Array.from(demo.matchAll(/#asset-([0-9a-f]{64})/g), m => m[1]))];
    for (const [label, file] of [['generation 1', gen1], ['generation 2', gen2]]){
      const block = fs.readFileSync(file, 'utf8').match(/<script type="application\/json" id="dokufix-assets">([\s\S]*?)<\/script>/);
      const held = block ? JSON.parse(block[1]) : {};
      const wrong = demoImages.filter(h => !held[h] || crypto.createHash('sha256').update(Buffer.from(held[h].d, 'base64')).digest('hex') !== h);
      check(name + ' ' + label, 'the file carries every image the demo text names, its bytes giving its hash (' + demoImages.length + ')', wrong.length === 0, wrong.join(' '));
    }
    const images = await o.page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll('#preview img'));
      await Promise.all(imgs.map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
      return imgs.map(img => ({ missing: img.hasAttribute('data-missing-asset'), width: img.naturalWidth, src: img.src.slice(0, 5) }));
    });
    check(scope, 'after "Demo zurücksetzen" every image of the demo text is shown, none is a missing-image placeholder (' + demoImages.length + ')',
      images.length === demoImages.length && images.every(i => !i.missing && i.width > 1 && i.src === 'blob:'), JSON.stringify(images));
    check(scope, 'no page error', o.errors.length === 0, o.errors.join(' | '));
    await o.context.close();

    // 5. a narrow window, saved with the hamburger panel open
    scope = name + ' narrow window';
    const narrow = path.join(dir, 'schmal.html');
    o = await open(browser, opts.file, { viewport: { width: 600, height: 900 } });
    await o.page.click('#edit-btn');
    await o.page.fill('#source', DOC_A);
    await o.page.click('#hamburger');
    await o.page.click('#download-btn');
    const panelOpen = await o.page.evaluate(() => document.getElementById('header-actions').classList.contains('open')
      && document.getElementById('hamburger').getAttribute('aria-expanded') === 'true');
    const [narrowDownload] = await Promise.all([
      o.page.waitForEvent('download', { timeout: 60000 }),
      o.page.click('button[data-download="full"]'),
    ]);
    await narrowDownload.saveAs(narrow);
    check(scope, 'the hamburger panel was open when the file was saved', panelOpen);
    check(scope, 'no page error', o.errors.length === 0, o.errors.join(' | '));
    await o.context.close();
    await checkAgainstBuiltFile(scope, browser, narrow, built, 1);

    // 6. IndexedDB unavailable
    scope = name + ' storage unavailable';
    const degraded = path.join(dir, 'ohne-speicher.html');
    o = await open(browser, opts.file, { initScript: () => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); } });
    const marks = await o.page.evaluate(() => ({
      banner: !document.getElementById('storage-error').hidden,
      reason: document.querySelector('#storage-error .storage-error-msg').textContent,
      title: document.getElementById('version-btn').title,
    }));
    check(scope, 'the page shows the storage banner with its reason, and the version mark its warning',
      marks.banner && marks.reason.trim().length > 2 && marks.title.startsWith('Achtung'), JSON.stringify(marks));
    // Through the DOM: the banner lies over the toolbar.
    const [degradedDownload] = await Promise.all([
      o.page.waitForEvent('download', { timeout: 60000 }),
      o.page.evaluate(text => {
        const source = document.getElementById('source');
        source.value = text;
        source.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('button[data-download="full"]').click();
      }, DOC_A),
    ]);
    await degradedDownload.saveAs(degraded);
    // The banner lies over the "Editor" button, so it can be closed: with real
    // clicks, which only land on what is on top.
    const covered = await o.page.evaluate(() => {
      const r = document.getElementById('edit-btn').getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && !!top.closest('#storage-error');
    });
    check(scope, 'the banner lies over the "Editor" button', covered);
    await o.page.click('#storage-error .storage-error-close');
    check(scope, 'its close button hides the banner', await o.page.evaluate(() => document.getElementById('storage-error').hidden));
    await o.page.click('#edit-btn', { timeout: 5000 });
    check(scope, 'the "Editor" button can then be clicked', await o.page.evaluate(() => !document.body.classList.contains('mode-view')));
    // The console says that storage is missing; that is this state. A page error would be something else.
    const pageErrors = o.errors.filter(e => !e.startsWith('console: '));
    check(scope, 'no page error', pageErrors.length === 0, pageErrors.join(' | '));
    await o.context.close();
    await checkAgainstBuiltFile(scope, browser, degraded, built, 1);

    // 7. saved with the licence view open, the one of read mode and the one in the toolbar
    scope = name + ' licence view open';
    const withView = path.join(dir, 'lizenz-offen.html');
    const licences = page => page.evaluate(() => Array.from(document.querySelectorAll('details.dokufix-licences')).map(d => d.open));
    o = await open(browser, opts.file);
    await o.page.click('body > details.dokufix-licences > summary');
    await o.page.click('#edit-btn');
    await o.page.fill('#source', DOC_A);
    await o.page.click('#header-actions > details.dokufix-licences > summary');
    const viewsOpen = await licences(o.page);
    await o.page.click('#download-btn');
    const [viewDownload] = await Promise.all([
      o.page.waitForEvent('download', { timeout: 60000 }),
      o.page.click('button[data-download="full"]'),
    ]);
    await viewDownload.saveAs(withView);
    check(scope, 'both views were open when the file was saved', viewsOpen.length === 2 && viewsOpen.every(Boolean), JSON.stringify(viewsOpen));
    check(scope, 'and are still open in the running page', JSON.stringify(await licences(o.page)) === '[true,true]');
    check(scope, 'no page error', o.errors.length === 0, o.errors.join(' | '));
    await o.context.close();
    await checkAgainstBuiltFile(scope, browser, withView, built, 1);
    o = await open(browser, withView);
    s = await state(o.page);
    same(scope, 'the saved file holds document A', s.source, DOC_A);
    check(scope, 'opened, it has the link twice again, both closed', JSON.stringify(await licences(o.page)) === '[false,false]', JSON.stringify(await licences(o.page)));
    check(scope, 'no page error', o.errors.length === 0, o.errors.join(' | '));
    await o.context.close();

    // 8. saved with the search panel open and a term typed into it, which a
    // label of a Mermaid diagram holds as well (story 17: highlighted in its SVG)
    scope = name + ' search open';
    const withSearch = path.join(dir, 'suche-offen.html');
    const DOC_S = DOC_A + '\n## Fünf\n\n```mermaid\nflowchart LR\n  a[Abschnitt im Bild] --> b[Ende]\n```\n';
    const searchState = page => page.evaluate(() => {
      const p = document.querySelector('body > .search-panel');
      const h = window.CSS && CSS.highlights && CSS.highlights.get('search-hit');
      const live = h ? Array.from(h).filter(r => r.startContainer.isConnected) : [];
      return p ? { open: !p.hidden, term: p.querySelector('input').value, results: p.querySelectorAll('.search-results .search-result').length,
        highlighted: live.length, inSvg: live.filter(r => !!r.startContainer.parentElement.closest('svg')).length } : null;
    });
    o = await open(browser, opts.file);
    await o.page.evaluate(text => {
      const source = document.getElementById('source');
      source.value = text;
      source.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('render-btn').click();
    }, DOC_S);
    await o.page.waitForFunction(() => /Dokument A/.test(document.querySelector('#preview h1')?.textContent || '') &&
      !!document.querySelector('#preview figure.dokufix-diagram .dokufix-diagram-svg svg'), null, { timeout: 30000 });
    await o.page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await o.page.keyboard.press('/');
    await o.page.keyboard.type('Abschnitt');
    await o.page.waitForFunction(() => document.querySelectorAll('body > .search-panel .search-results .search-result').length > 0, null, { timeout: 5000 }).catch(() => {});
    const searchOpen = await searchState(o.page);
    // Through the DOM: in read mode the toolbar is hidden, and leaving read mode closes the panel.
    const [searchDownload] = await Promise.all([
      o.page.waitForEvent('download', { timeout: 60000 }),
      o.page.evaluate(() => document.querySelector('button[data-download="full"]').click()),
    ]);
    await searchDownload.saveAs(withSearch);
    check(scope, 'the panel was open with a term, its results and its hits highlighted in the preview, one in the diagram\'s SVG, when the file was saved', !!searchOpen && searchOpen.open && searchOpen.term === 'Abschnitt' && searchOpen.results > 0 && searchOpen.highlighted >= searchOpen.results && searchOpen.inSvg >= 1, JSON.stringify(searchOpen));
    check(scope, 'and is still open in the running page', JSON.stringify(await searchState(o.page)) === JSON.stringify(searchOpen), JSON.stringify(await searchState(o.page)));
    // Without its scripts and styles: the page's script and the reader bundle in
    // its data block name the panel's classes, and so does the stylesheet.
    const withoutCode = file => fs.readFileSync(file, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/g, '');
    // The code block of the document has its copy button in the running page (story 5.19), transient.
    const copyButtons = await o.page.evaluate(() => Array.from(document.querySelectorAll('#preview pre.dokufix-code > button.dokufix-code-copy')).map(b => b.hasAttribute('data-dokufix-transient')));
    check(scope, 'the running page has the copy button in the code block, transient', JSON.stringify(copyButtons) === '[true]', JSON.stringify(copyButtons));
    check(scope, 'the saved file holds no panel, no magnifier, no highlight and no copy button', !/search-panel|search-input|search-magnifier|search-hit|dokufix-code-copy/.test(withoutCode(withSearch)));
    // The read-only exports, with the panel open, then with it closed. The
    // term is typed again before each, so its hits are highlighted when the
    // download starts; the download renders the preview anew before it clones
    // it, so the ranges are over replaced nodes by the time the file is
    // written. What this shows: the open panel changes nothing of the files.
    // That the highlight never reaches the document is vergleich.mjs's check
    // of the DOM with the panel open.
    await o.page.clock.setFixedTime(new Date('2026-10-03T12:00:00+02:00'));
    const READONLY = ['readonly-open', 'readonly-slim', 'readonly-compact'];
    const exportAll = async (suffix, open) => {
      const out = {};
      for (const kind of READONLY){
        if (open){
          if (!(await searchState(o.page)).open){
            await o.page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
            await o.page.keyboard.press('/');
          }
          await o.page.fill('body > .search-panel input', '');
          await o.page.fill('body > .search-panel input', 'Abschnitt');
          await o.page.waitForFunction(() => {
            const h = window.CSS && CSS.highlights && CSS.highlights.get('search-hit');
            return !!h && Array.from(h).some(r => r.startContainer.isConnected);
          }, null, { timeout: 5000 }).catch(() => {});
        }
        const at = await searchState(o.page);
        const [download] = await Promise.all([
          o.page.waitForEvent('download', { timeout: 60000 }),
          o.page.evaluate(k => document.querySelector('button[data-download="' + k + '"]').click(), kind),
        ]);
        const file = path.join(dir, kind + '-' + suffix + '.html');
        await download.saveAs(file);
        await o.page.waitForFunction(() => !document.querySelector('button[data-download]:disabled'));
        out[kind] = { file, state: at };
      }
      return out;
    };
    const whileOpen = await exportAll('suche-offen', true);
    await o.page.click('body > .search-panel .search-close');
    const afterClose = await exportAll('suche-zu', false);
    check(scope, 'nur-lesen, schlank and kompakt were started with the panel open and its hits highlighted, and the second time with it closed and nothing highlighted',
      READONLY.every(k => whileOpen[k].state.open && whileOpen[k].state.highlighted > 0 && !afterClose[k].state.open && afterClose[k].state.highlighted === 0),
      JSON.stringify(READONLY.map(k => [k, whileOpen[k].state, afterClose[k].state])));
    for (const kind of READONLY){
      const a = fs.readFileSync(whileOpen[kind].file), b = fs.readFileSync(afterClose[kind].file);
      check(scope, kind + ' written from the page with the panel open is the file written after it is closed, byte for byte, and holds no panel, no magnifier and no copy button',
        a.equals(b) && !/search-panel|search-input|search-magnifier|search-hit|dokufix-code-copy/.test(withoutCode(whileOpen[kind].file)), a.length + ' B and ' + b.length + ' B');
    }
    check(scope, 'no page error', o.errors.length === 0, o.errors.join(' | '));
    await o.context.close();
    await checkAgainstBuiltFile(scope, browser, withSearch, built, 1);
    o = await open(browser, withSearch);
    s = await state(o.page);
    same(scope, 'the saved file holds document A with its diagram', s.source, DOC_S);
    const reopened = await searchState(o.page);
    check(scope, 'opened, its panel is closed and empty', !!reopened && !reopened.open && reopened.term === '' && reopened.results === 0, JSON.stringify(reopened));
    check(scope, 'no page error', o.errors.length === 0, o.errors.join(' | '));
    await o.context.close();

    // 9. saved with the large view of a BPMN diagram open, at "150 %", its live viewer running
    scope = name + ' large view open';
    const withView9 = path.join(dir, 'grossansicht-offen.html');
    const DOC_D = DOC_A + '\n## Fünf\n\n```mermaid\nflowchart LR\n  a[Anfang] --> b[Ende]\n```\n\n## Sechs\n\n```bpmn\n' + BPMN_XML + '\n```\n';
    const FIG9 = '#preview figure.dokufix-diagram-bpmn';
    const viewState = (page, sel) => page.evaluate(sel => {
      const f = document.querySelector(sel);
      if (!f) return null;
      const zoom = f.querySelector('.dokufix-diagram-zoom:checked');
      return { open: f.querySelector('.dokufix-diagram-toggle').checked, zoom: zoom ? zoom.value : null,
               fixed: getComputedStyle(f.querySelector('.dokufix-diagram-view')).position === 'fixed',
               page: getComputedStyle(document.documentElement).overflow };
    }, sel);
    // The live viewer of the large view (story 2.11) and what bpmn-js leaves in <body>.
    const viewerState = page => page.evaluate(() => {
      const g = document.querySelector('.dokufix-diagram-live .djs-container > svg > g.viewport');
      const m = g ? (g.getAttribute('transform') || '').match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) || [] : [];
      return { viewer: !!g, scale: m.length >= 6 ? Number(m[0]) : null, lightbox: document.querySelectorAll('body > .bjs-powered-by-lightbox').length,
               cursor: Array.from(document.body.classList).filter(c => /^djs-cursor-/.test(c)).length > 0 };
    });
    o = await open(browser, opts.file);
    await o.page.evaluate(text => {
      const source = document.getElementById('source');
      source.value = text;
      source.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('render-btn').click();
    }, DOC_D);
    await o.page.waitForFunction(() => document.querySelectorAll('#preview figure.dokufix-diagram .dokufix-diagram-svg svg').length === 2, null, { timeout: 30000 });
    await o.page.click(FIG9 + ' .dokufix-diagram-stage');
    await o.page.waitForFunction(sel => !!document.querySelector(sel + ' .dokufix-diagram-hint'), FIG9, { timeout: 20000 }).catch(() => {});
    await o.page.click(FIG9 + ' .dokufix-diagram-step:nth-child(3)');
    // A drag that goes on while the file is saved, and the lightbox of the
    // logo open, by events, so the mouse stays free.
    await o.page.evaluate(sel => {
      const live = document.querySelector(sel + ' .dokufix-diagram-live');
      if (!live) return;
      const r = live.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const at = dx => ({ bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x + dx, clientY: y, view: window });
      document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('mousedown', at(0)));
      for (let dx = -5; dx >= -60; dx -= 5) document.dispatchEvent(new MouseEvent('mousemove', at(dx)));
      live.querySelector('.bjs-powered-by').click();
    }, FIG9);
    const viewOpen = await viewState(o.page, FIG9);
    const viewerOpen = await viewerState(o.page);
    // Through the DOM: the view lies over the page, and in read mode the toolbar is hidden.
    const [viewDownload9] = await Promise.all([
      o.page.waitForEvent('download', { timeout: 60000 }),
      o.page.evaluate(() => document.querySelector('button[data-download="full"]').click()),
    ]);
    await viewDownload9.saveAs(withView9);
    check(scope, 'the view was open at "150 %" when the file was saved, over the window, the page not scrolling', JSON.stringify(viewOpen) === JSON.stringify({ open: true, zoom: '150', fixed: true, page: 'hidden' }), JSON.stringify(viewOpen));
    check(scope, 'its live viewer ran at scale 1.5, the lightbox of the logo open in <body> and a drag going on, the cursor class of bpmn-js on <body>',
      JSON.stringify(viewerOpen) === JSON.stringify({ viewer: true, scale: 1.5, lightbox: 1, cursor: true }), JSON.stringify(viewerOpen));
    check(scope, 'and all of it is still there in the running page', JSON.stringify(await viewState(o.page, FIG9)) === JSON.stringify(viewOpen) && JSON.stringify(await viewerState(o.page)) === JSON.stringify(viewerOpen),
      JSON.stringify([await viewState(o.page, FIG9), await viewerState(o.page)]));
    await o.page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 })));
    const pictureButtons = page => page.evaluate(() => Array.from(document.querySelectorAll('figure.dokufix-diagram > .dokufix-diagram-downloads > button'))
      .map(b => b.textContent + ' ' + b.hasAttribute('data-dokufix-transient')));
    check(scope, 'the running page has the picture button below each diagram, transient', JSON.stringify(await pictureButtons(o.page)) === '[".svg true",".svg true"]', JSON.stringify(await pictureButtons(o.page)));
    check(scope, 'no page error', o.errors.length === 0, o.errors.join(' | '));
    await o.context.close();
    // The file saved with the viewer open is the built file, apart from the listed differences, as every saved file is.
    await checkAgainstBuiltFile(scope, browser, withView9, built, 1);
    o = await open(browser, withView9);
    s = await state(o.page);
    same(scope, 'the saved file holds the document with its diagrams', s.source, DOC_D);
    await o.page.waitForFunction(() => document.querySelectorAll('#preview figure.dokufix-diagram .dokufix-diagram-svg svg').length === 2, null, { timeout: 30000 }).catch(() => {});
    const closed9 = await viewState(o.page, FIG9);
    check(scope, 'opened, its BPMN diagram is closed, at "Einpassen", and the page scrolls', JSON.stringify(closed9) === JSON.stringify({ open: false, zoom: 'fit', fixed: false, page: 'visible' }), JSON.stringify(closed9));
    const viewerClosed = await viewerState(o.page);
    check(scope, 'opened, no viewer runs, and nothing of bpmn-js is in <body>', JSON.stringify(viewerClosed) === JSON.stringify({ viewer: false, scale: null, lightbox: 0, cursor: false }), JSON.stringify(viewerClosed));
    check(scope, 'opened, it shows the picture button below each diagram again', JSON.stringify(await pictureButtons(o.page)) === '[".svg true",".svg true"]', JSON.stringify(await pictureButtons(o.page)));
    check(scope, 'no page error', o.errors.length === 0, o.errors.join(' | '));
    await o.context.close();

    // 10. saved and exported after a click on a result of the search opened the metadata panel
    scope = name + ' metadata panel opened by the search';
    const withMeta = path.join(dir, 'metadaten-offen.html');
    const metaState = page => page.evaluate(() => {
      const d = document.querySelector('#preview details.dokufix-frontmatter');
      const p = document.querySelector('body > .search-panel');
      return { panel: !!d, open: !!d && d.open, search: !!p && !p.hidden };
    });
    const META_RESULT = 'body > .search-panel .search-results .search-result';
    // The search opened, "version" typed, which only the panel holds in B, and its result clicked.
    const openByClick = async () => {
      await o.page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
      if (!(await searchState(o.page)).open) await o.page.keyboard.press('/');
      await o.page.fill('body > .search-panel input', '');
      await o.page.fill('body > .search-panel input', 'version');
      await o.page.waitForFunction(sel => Array.from(document.querySelectorAll(sel + ' .search-kind')).some(k => k.textContent === 'Metadaten: '), META_RESULT, { timeout: 5000 }).catch(() => {});
      await o.page.locator(META_RESULT, { hasText: 'Metadaten: ' }).first().click({ timeout: 5000 }).catch(() => {});
      return metaState(o.page);
    };
    o = await open(browser, opts.file);
    await o.page.evaluate(text => {
      const source = document.getElementById('source');
      source.value = text;
      source.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('render-btn').click();
    }, DOC_B);
    await o.page.waitForFunction(() => /Dokument B/.test(document.querySelector('#preview h1')?.textContent || '') && !!document.querySelector('#preview details.dokufix-frontmatter'), null, { timeout: 30000 });
    await o.page.clock.setFixedTime(new Date('2026-10-03T12:00:00+02:00'));
    const OPENED = JSON.stringify({ panel: true, open: true, search: true });
    const metaOpen = await openByClick();
    // Through the DOM: in read mode the toolbar is hidden, and leaving read mode closes the search.
    const [metaDownload] = await Promise.all([
      o.page.waitForEvent('download', { timeout: 60000 }),
      o.page.evaluate(() => document.querySelector('button[data-download="full"]').click()),
    ]);
    await metaDownload.saveAs(withMeta);
    check(scope, 'the metadata panel, closed at first, was opened by a click on its result in the search when the file was saved', JSON.stringify(metaOpen) === OPENED, JSON.stringify(metaOpen));
    // The read-only exports after such a click, then with the panel and the search closed, byte for byte the same.
    const metaExports = {};
    for (const kind of READONLY){
      const out = {};
      for (const [suffix, byClick] of [['metadaten-offen', true], ['metadaten-zu', false]]){
        let at;
        if (byClick) at = await openByClick();
        else {
          await o.page.evaluate(() => { const d = document.querySelector('#preview details.dokufix-frontmatter'); if (d) d.open = false; });
          if ((await searchState(o.page)).open) await o.page.click('body > .search-panel .search-close');
          at = await metaState(o.page);
        }
        const [download] = await Promise.all([
          o.page.waitForEvent('download', { timeout: 60000 }),
          o.page.evaluate(k => document.querySelector('button[data-download="' + k + '"]').click(), kind),
        ]);
        const file = path.join(dir, kind + '-' + suffix + '.html');
        await download.saveAs(file);
        await o.page.waitForFunction(() => !document.querySelector('button[data-download]:disabled'));
        out[suffix] = { file, state: at };
      }
      metaExports[kind] = out;
    }
    check(scope, 'nur-lesen, schlank and kompakt were started once with the panel opened by a click on its result, and once with the panel and the search closed',
      READONLY.every(k => JSON.stringify(metaExports[k]['metadaten-offen'].state) === OPENED && JSON.stringify(metaExports[k]['metadaten-zu'].state) === JSON.stringify({ panel: true, open: false, search: false })),
      JSON.stringify(READONLY.map(k => [k, metaExports[k]['metadaten-offen'].state, metaExports[k]['metadaten-zu'].state])));
    for (const kind of READONLY){
      const a = fs.readFileSync(metaExports[kind]['metadaten-offen'].file), b = fs.readFileSync(metaExports[kind]['metadaten-zu'].file);
      const text = a.toString('utf8');
      // kompakt carries its document packed; the others show the panel closed.
      const closedPanel = kind === 'readonly-compact' || (/<details class="dokufix-frontmatter">/.test(text) && !/<details class="dokufix-frontmatter"[^>]*\bopen\b/.test(text));
      check(scope, kind + ' written after the click is the file written with the panel closed, byte for byte, its panel closed',
        a.equals(b) && closedPanel, a.length + ' B and ' + b.length + ' B, panel closed ' + closedPanel);
    }
    check(scope, 'no page error', o.errors.length === 0, o.errors.join(' | '));
    await o.context.close();
    await checkAgainstBuiltFile(scope, browser, withMeta, built, 1);
    o = await open(browser, withMeta);
    s = await state(o.page);
    same(scope, 'the saved file holds document B', s.source, DOC_B);
    await o.page.waitForFunction(() => !!document.querySelector('#preview details.dokufix-frontmatter'), null, { timeout: 30000 }).catch(() => {});
    const reopenedMeta = await metaState(o.page);
    check(scope, 'opened, its metadata panel is closed', JSON.stringify(reopenedMeta) === JSON.stringify({ panel: true, open: false, search: false }), JSON.stringify(reopenedMeta));
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
// The libraries, served to every context from tests/.cdn/ (tests/cdn.mjs); a
// missing one is fetched once, before anything is built.
let libraries;
try { libraries = await prepareLibraries(opts.file); }
catch (e){ console.error(e.message); process.exit(1); }
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
// The browsers run side by side, each in its own folder. Their checks land in
// one list in the order they happen; the report lists them per browser.
await Promise.all(names.map(name => runBrowser(name, opts, demoFile, demoWithMarkup)));

const byBrowser = r => names.findIndex(n => r.scope.startsWith(n));
results.sort((a, b) => byBrowser(a) - byBrowser(b));
const failed = results.filter(r => !r.ok);
for (const r of results) console.log((r.ok ? 'ok    ' : 'FAIL  ') + r.scope + ': ' + r.name + (r.detail ? ' — ' + r.detail : ''));
console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' green; saved files: ' + opts.out);
console.log(librariesLine(libraries));
// A library the page asked for that is not pinned in the file under test was not fetched.
if (libraries.refused.length) console.log('refused, not pinned in the file under test: ' + libraries.refused.join(', '));
process.exit(failed.length || libraries.refused.length ? 1 : 0);
