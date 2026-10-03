// Proves what build.mjs promises: the same file from the same sources, exit 1
// with nothing written where a source would give a broken page, and a readable
// second file (--dev, --watch) that never takes the place of the committed one.
//
//   npm test          (node --test tests/*.test.mjs)
//
// Each case builds a copy of src/ into a temporary folder. Neither src/ nor
// dist/ is written to.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { assemble, BuildError, SLOTS } from '../build.mjs';
import { UNPACKED_EVENT } from '../src/app/search.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const srcDir = path.join(root, 'src');
const committed = path.join(root, 'dist/dokufix.html');
const original = name => fs.readFileSync(path.join(srcDir, name), 'utf8');

// Runs build.mjs on a copy of src/ in which the given files are replaced: a
// text or bytes, or null to remove the file.
// Returns the process result and, if the build wrote one, the built file's text.
function build(changed = {}, extraArgs = [], out = null){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dokufix-build-'));
  const copy = path.join(dir, 'src');
  fs.cpSync(srcDir, copy, { recursive: true });
  for (const [name, text] of Object.entries(changed)){
    if (text === null) fs.rmSync(path.join(copy, name));
    else fs.writeFileSync(path.join(copy, name), text);
  }
  const target = out || path.join(dir, 'dist/dokufix.html');
  const r = spawnSync(process.execPath, [path.join(root, 'build.mjs'), '--src', copy, '--out', target, ...extraArgs], { encoding: 'utf8' });
  const html = !out && fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  fs.rmSync(dir, { recursive: true });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, html };
}
function mutate(text, find, replacement){
  assert.ok(text.includes(find), 'mutation target not found');
  return text.replace(find, replacement);
}
// The text of a data block, read the way the HTML parser reads it: up to the
// first "</script".
function dataBlock(html, id){
  const open = '<script type="application/json" id="' + id + '">';
  const start = html.indexOf(open);
  assert.ok(start >= 0, 'block #' + id + ' not found');
  const from = start + open.length;
  return html.slice(from, html.toLowerCase().indexOf('</script', from));
}

// ---------- row 1: build ----------
test('unchanged sources give the committed file, byte for byte', () => {
  const r = build();
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.html === fs.readFileSync(committed, 'utf8'), 'the build of src/ differs from dist/dokufix.html; run "npm run build"');
});

// ---------- row 2: build check ----------
test('--check passes on the committed file', () => {
  const r = build({}, ['--check'], committed);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /up to date/);
});
// app/gzip.js stands for the modules under src/app/: the script is bundled from
// app.js and everything it imports.
for (const name of ['doc.css', 'app.css', 'search.css', 'app.js', 'app/gzip.js', 'reader.js', 'demo.md', 'index.html']){
  test('--check fails when ' + name + ' changed and dist/ was not rebuilt', () => {
    const addition = { 'doc.css': '.dokufix-doc h6{color:red}\n', 'app.css': '.x{color:red}\n', 'search.css': '.search-x{color:red}\n', 'app.js': 'console.log("x");\n', 'app/gzip.js': 'console.log("x");\n', 'reader.js': 'console.log("x");\n', 'demo.md': 'Ein Satz mehr.\n', 'index.html': '<!-- x -->\n' }[name];
    const before = fs.readFileSync(committed);
    const r = build({ [name]: original(name) + addition }, ['--check'], committed);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, /dokufix\.html is stale/);
    assert.ok(before.equals(fs.readFileSync(committed)), '--check wrote to the built file');
  });
}
test('--check fails when the built file is missing', () => {
  const r = build({}, ['--check']);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /is missing/);
  assert.equal(r.html, null);
});

// ---------- the readable build ----------
// The page's own script: from the first <script> without attributes to the
// last </script> of the file.
const appScript = html => html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
test('--dev writes a second file: the same page, not minified, with a source map', () => {
  const before = fs.readFileSync(committed);
  const r = build({}, ['--dev']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /not minified, with a source map/);
  const min = fs.readFileSync(committed, 'utf8');
  const script = appScript(r.html);
  // Not minified: the names and the lines of the sources are there.
  assert.match(script, /^ {2}async function renderOnce\(\) \{$/m);
  assert.ok(script.split('\n').length > 1000, 'the script has its lines');
  assert.match(r.html, /^\.dokufix-doc \.dokufix-warning \{$/m);
  assert.ok(!/async function renderOnce/.test(appScript(min)), 'the committed file is the minified one');
  // The source map stands at the end of the script and names the modules.
  const map = script.match(/\n\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)\s*$/);
  assert.ok(map, 'the script ends with its source map');
  const parsed = JSON.parse(Buffer.from(map[1], 'base64').toString('utf8'));
  assert.ok(parsed.sources.some(s => s.endsWith('src/app/render.js')), parsed.sources.join(' '));
  assert.ok(parsed.sources.some(s => s.endsWith('src/app.js')), parsed.sources.join(' '));
  assert.equal(parsed.sourcesContent.length, parsed.sources.length);
  // What holds for the committed file holds for this one: nothing ends the script early.
  assert.ok(!/<\/script/i.test(script) && !script.includes('<!--'));
  // The page around the script is the same: its markup and its data blocks.
  assert.deepEqual(JSON.parse(dataBlock(r.html, 'dokufix-demo')), { text: original('demo.md') });
  const outside = html => {
    const script = appScript(html), at = html.indexOf(script);
    return (html.slice(0, at) + html.slice(at + script.length)).replace(/<style[\s\S]*?<\/style>/g, '<style></style>');
  };
  assert.ok(outside(min).length > 5000 && outside(r.html) === outside(min), 'outside its script and its styles the readable file is the committed one');
  assert.ok(before.equals(fs.readFileSync(committed)), '--dev wrote to the committed file');
});
test('--dev never writes the committed file', () => {
  const before = fs.readFileSync(committed);
  const r = spawnSync(process.execPath, [path.join(root, 'build.mjs'), '--dev', '--out', committed], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /--dev does not write dist\/dokufix\.html/);
  assert.ok(before.equals(fs.readFileSync(committed)));
});
test('--dev and --check do not go together, and --watch needs --dev', () => {
  const both = build({}, ['--dev', '--check']);
  assert.equal(both.status, 1, both.stdout);
  assert.match(both.stderr, /--dev and --check do not go together/);
  assert.equal(both.html, null);
  const watch = build({}, ['--watch']);
  assert.equal(watch.status, 1, watch.stdout);
  assert.match(watch.stderr, /--watch goes with --dev/);
  assert.equal(watch.html, null);
});
test('--check does not look at a readable file beside the committed one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dokufix-build-'));
  const out = path.join(dir, 'dokufix.html');
  fs.copyFileSync(committed, out);
  fs.writeFileSync(path.join(dir, 'dokufix.dev.html'), 'something else entirely');
  const r = spawnSync(process.execPath, [path.join(root, 'build.mjs'), '--check', '--out', out], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /up to date/);
});
test('--dev --watch builds, and builds again when a source changes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dokufix-build-'));
  const copy = path.join(dir, 'src'), out = path.join(dir, 'dokufix.dev.html');
  fs.cpSync(srcDir, copy, { recursive: true });
  const child = spawn(process.execPath, [path.join(root, 'build.mjs'), '--dev', '--watch', '--src', copy, '--out', out]);
  let said = '';
  child.stdout.on('data', d => { said += d; });
  child.stderr.on('data', d => { said += d; });
  const until = async (what, done) => {
    for (let i = 0; i < 300; i++){
      if (done()) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.fail('timed out waiting for ' + what + '; the build said:\n' + said);
  };
  try {
    await until('the watch to start', () => /watching /.test(said));
    assert.ok(fs.existsSync(out), 'the first build wrote the file');
    const sentence = 'Ein Satz, den erst die Beobachtung sieht.';
    assert.ok(!fs.readFileSync(out, 'utf8').includes(sentence));
    fs.appendFileSync(path.join(copy, 'demo.md'), '\n' + sentence + '\n');
    await until('the rebuild after a change to demo.md', () => fs.readFileSync(out, 'utf8').includes(sentence));
    // A source that does not build: the reason is printed, the last file stays, the watch goes on.
    const good = fs.readFileSync(path.join(copy, 'app/gzip.js'), 'utf8');
    fs.writeFileSync(path.join(copy, 'app/gzip.js'), 'import { nichtDa } from \'./state.js\';\nexport const x = nichtDa;\n' + good);
    await until('the message of the failed build', () => /No matching export/.test(said));
    assert.ok(fs.readFileSync(out, 'utf8').includes(sentence), 'the last good file is still there');
    fs.writeFileSync(path.join(copy, 'app/gzip.js'), good + '// wieder heil\n');
    await until('the rebuild after the repair', () => (said.match(/ written \(/g) || []).length >= 3);
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('package.json: the watch script, and the Node the tools need', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.watch, 'node build.mjs --dev --watch');
  assert.equal(typeof pkg.engines.node, 'string');
  assert.equal(pkg.devDependencies.linkedom, '0.18.13');
});

// ---------- the script's modules ----------
// esbuild links the modules while it bundles them. An import that leads nowhere
// and an assignment to an imported name are errors there, and the build ends
// with the module and the name. What esbuild does not see is in lint.test.mjs.
test('a module imports a name the other module does not export: exit 1, module and name named, nothing written', () => {
  const r = build({ 'app/rail.js': 'import { nichtDa } from \'./gzip.js\';\n' + original('app/rail.js') + 'export function probe(){ return nichtDa; }\n' });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /src\/app\/rail\.js:1:\d+: No matching export in "[^"]*src\/app\/gzip\.js" for import "nichtDa"/);
  assert.equal(r.html, null);
});
test('a module imports a file that does not exist: exit 1, module and file named, nothing written', () => {
  const r = build({ 'app/rail.js': 'import { nichtDa } from \'./gibt-es-nicht.js\';\n' + original('app/rail.js') + 'export function probe(){ return nichtDa; }\n' });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /src\/app\/rail\.js:1:\d+: Could not resolve "\.\/gibt-es-nicht\.js"/);
  assert.equal(r.html, null);
});
test('a module assigns to a name it imported: exit 1, module and name named, nothing written', () => {
  const r = build({ 'app/editor.js': original('app/editor.js') + 'export function probe(){ sourceEl = null; }\n' });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /src\/app\/editor\.js:\d+:\d+: Cannot assign to import "sourceEl"/);
  assert.equal(r.html, null);
});

// ---------- row 3: broken template ----------
for (const name of SLOTS){
  const slot = '{{slot:' + name + '}}';
  test('slot ' + name + ' missing: exit 1, slot named, nothing written', () => {
    const r = build({ 'index.html': mutate(original('index.html'), slot, '') });
    assert.equal(r.status, 1, r.stdout);
    assert.ok(r.stderr.includes('slot ' + slot + ' is missing'), r.stderr);
    assert.equal(r.html, null);
  });
  test('slot ' + name + ' doubled: exit 1, slot named, nothing written', () => {
    const r = build({ 'index.html': mutate(original('index.html'), slot, slot + slot) });
    assert.equal(r.status, 1, r.stdout);
    assert.ok(r.stderr.includes('slot ' + slot + ' stands 2 times'), r.stderr);
    assert.equal(r.html, null);
  });
}
test('unknown slot: exit 1, slot named, nothing written', () => {
  const r = build({ 'index.html': mutate(original('index.html'), '</head>', '{{slot:extra.css}}</head>') });
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stderr.includes('unknown slot {{slot:extra.css}}'), r.stderr);
  assert.equal(r.html, null);
});

// ---------- row 4: unsafe output ----------
// A custom property keeps its value as written, so this is a stylesheet that
// minifies to one containing "</style".
for (const name of ['doc.css', 'app.css', 'search.css']){
  test('"</style" in the minified ' + name + ': exit 1, nothing written', () => {
    const r = build({ [name]: original(name) + '.dokufix-doc{--x:</style>}\n' });
    assert.equal(r.status, 1, r.stdout);
    assert.ok(r.stderr.includes('the minified ' + name + ' contains "</style"'), r.stderr);
    assert.equal(r.html, null);
  });
}
// esbuild writes "</script" as "<\/script" wherever it meets it: in strings,
// templates, regular expressions and kept comments. So no source reaches the
// build's own test; it is shown here on the step that puts the page together.
test('the script source cannot bring "</script" into the built file', () => {
  const r = build({ 'app.js': original('app.js') + 'console.log("</script>", `</SCRIPT>`, /<\\/script>/, 1 </script>/.test(""));\n//! </script>\n' });
  assert.equal(r.status, 0, r.stderr);
  // The page's script runs from the first <script> without attributes to the
  // last </script> of the file.
  const app = r.html.slice(r.html.indexOf('<script>') + '<script>'.length, r.html.lastIndexOf('</script>'));
  assert.ok(app.length > 10000 && app.includes('<\\/SCRIPT>'), 'the script was found, with the added line in it');
  assert.ok(!/<\/script/i.test(app), 'no "</script" inside the script');
});
test('"</script" in the minified script: refused, with the reason', () => {
  const parts = { 'doc.css': 'a{}', 'app.css': 'b{}', 'app.js': 'x="</script>"', 'demo.md': '{"text":""}' };
  assert.throws(() => assemble(original('index.html'), parts), e => e instanceof BuildError && /the minified script contains "<\/script"/.test(e.message));
  assert.throws(() => assemble(original('index.html'), { ...parts, 'app.js': 'x="</SCRIPT >"' }), BuildError);
  assert.doesNotThrow(() => assemble(original('index.html'), { ...parts, 'app.js': 'x="<\\/script>"' }));
});

// "<!--" in a script element, followed by the "<script" of the export templates,
// keeps the real "</script>" from closing it. esbuild does not guard that, so
// the build writes it as "\x3c!--".
test('"<!--" in a string, a template and a regular expression: built without it, same values', () => {
  const probe = 'globalThis.probe = [\'<!-- a -->\', `<!-- ${1 + 1} -->`, "<" + "!--", /<!--\\s*(\\w+)/u.exec("x <!-- dokufix: y -->")[1], "x <!-- y".replace(/<!--/gu, "#")];\n';
  // In the page's own script, in front of the export templates: it builds, and no "<!--" is left.
  // In the module the entry imports first, because what stands in app.js itself
  // is bundled behind every module, so behind the templates.
  const whole = build({ 'app/idb.js': probe + original('app/idb.js') });
  assert.equal(whole.status, 0, whole.stderr);
  const app = whole.html.slice(whole.html.indexOf('<script>') + '<script>'.length, whole.html.lastIndexOf('</script>'));
  assert.ok(app.length > 10000 && app.includes('\\x3c!--'), 'the script was found, with the added lines in it');
  assert.ok(app.indexOf('\\x3c!--') < app.indexOf('<script'), 'the added lines stand in front of the export templates');
  assert.ok(!app.includes('<!--'), 'no "<!--" inside the script');
  // On its own, where it can be run: the values are what the source says.
  const r = build({ 'app.js': probe });
  assert.equal(r.status, 0, r.stderr);
  const script = r.html.slice(r.html.indexOf('<script>') + '<script>'.length, r.html.lastIndexOf('</script>'));
  assert.ok(!script.includes('<!--'), 'no "<!--" inside the script');
  const sandbox = {};
  vm.runInNewContext(script, sandbox);
  assert.deepEqual([...sandbox.probe], ['<!-- a -->', '<!-- 2 -->', '<!--', 'dokufix', 'x # y']);
});
test('"<!--" in the minified script: refused, with the reason', () => {
  const parts = { 'doc.css': 'a{}', 'app.css': 'b{}', 'app.js': 'x="<!--"', 'demo.md': '{"text":""}' };
  assert.throws(() => assemble(original('index.html'), parts), e => e instanceof BuildError && /the minified script contains "<!--"/.test(e.message));
  assert.doesNotThrow(() => assemble(original('index.html'), { ...parts, 'app.js': 'x="\\x3c!--"' }));
});

test('"</script" or "<!--" in the reader bundle: refused, with the reason', () => {
  const parts = { 'doc.css': 'a{}', 'app.css': 'b{}', 'app.js': 'x=1', 'reader.js': 'x="</script>"', 'demo.md': '{"text":""}', 'assets': '{}' };
  assert.throws(() => assemble(original('index.html'), parts), e => e instanceof BuildError && /the reader bundle contains "<\/script"/.test(e.message));
  assert.throws(() => assemble(original('index.html'), { ...parts, 'reader.js': 'x="<!--"' }), e => e instanceof BuildError && /the reader bundle contains "<!--"/.test(e.message));
  assert.doesNotThrow(() => assemble(original('index.html'), { ...parts, 'reader.js': 'x="<\\/script>"' }));
});

// ---------- the reader bundle: table filter and search ----------
const readerBlock = html => {
  const open = '<script type="text/plain" id="dokufix-reader-js">';
  const from = html.indexOf(open) + open.length;
  assert.ok(from >= open.length, 'block #dokufix-reader-js not found');
  return html.slice(from, html.toLowerCase().indexOf('</script', from));
};
// Runs the bundle in a document as an export has it, the content container
// holding the given markup. Returns the document, its window and the panel.
function runReader(code, content){
  const { document, window } = parseHTML('<!DOCTYPE html><html><head><style>body{}</style></head><body><main class="reader-body dokufix-doc">' + content + '</main></body></html>');
  vm.runInNewContext(code, { document, window, setTimeout, clearTimeout, console });
  return { document, window, panel: document.querySelector('body > .search-panel') };
}
// "/" pressed outside a field, then a term typed; resolves once the pause of
// the search has passed.
async function slashAndType(document, window, term){
  const key = new window.Event('keydown', { bubbles: true, cancelable: true });
  key.key = '/';
  document.dispatchEvent(key);
  const input = document.querySelector('body > .search-panel .search-input');
  input.value = term;
  input.dispatchEvent(new window.Event('input'));
  await new Promise(resolve => setTimeout(resolve, 300));
  return key.defaultPrevented;
}
const summaryOf = panel => panel.querySelector('.search-summary').textContent;
// src/reader.js with what it imports, one minified IIFE in the data block
// #dokufix-reader-js, which `schlank` and `kompakt` copy into their file.
test('the built file carries the reader bundle in a block that does not run; it gives a marked table its field, adds the panel\'s styles and opens the search with "/"', async () => {
  const html = fs.readFileSync(committed, 'utf8');
  assert.equal(html.split('<script type="text/plain" id="dokufix-reader-js">').length, 2, 'one block, of a type that does not run');
  assert.ok(!html.includes('dokufix-filter-js'), 'the block of the filter alone is gone');
  const code = readerBlock(html);
  assert.ok(code.length > 6000 && code.length < 16000, code.length + ' B');
  assert.match(code, /^\(\(\)=>\{[\s\S]*\}\)\(\);$/, 'one minified IIFE');
  assert.ok(!/<\/script/i.test(code) && !code.includes('<!--'));
  // Nothing of the editor's elements: dom.js is not in the bundle.
  assert.ok(!/getElementById\("(preview|source)"\)|mode-view/.test(code), 'the bundle looks up no element of the editor');
  // Run in a document as an export has it: the content container holds a marked table.
  const { document, window, panel } = runReader(code, '<p>Eine Tabelle, noch eine Tabelle.</p><div class="dokufix-table"><table data-dokufix-filter="Ort suchen …"><thead><tr><th>Ort</th></tr></thead><tbody><tr><td>Nord</td></tr><tr><td>Süd</td></tr></tbody></table></div><ul><li>Tabelle</li></ul>');
  const field = document.querySelector('main > .dokufix-filter[data-dokufix-transient]');
  assert.ok(field, 'the field stands above the wrapper');
  assert.equal(field.querySelector('input').getAttribute('placeholder'), 'Ort suchen …');
  assert.equal(field.querySelector('.dokufix-filter-count').textContent, '2 Zeilen');
  const input = field.querySelector('input');
  input.value = 'nord';
  input.dispatchEvent(new window.Event('input'));
  assert.equal(field.querySelector('.dokufix-filter-count').textContent, '1 von 2 Zeilen');
  // The panel's styles: the minified src/search.css, behind the file's own stylesheet.
  const styles = document.head.querySelectorAll('style');
  assert.equal(styles.length, 2);
  assert.match(styles[1].textContent, /^\.search-panel\{display:none\}\.search-panel:not\(\[hidden\]\)\{/);
  assert.ok(html.includes(styles[1].textContent), 'the page carries the same text behind its editor styles');
  // The search: a closed panel in <body>, outside the content, transient; "/" opens it.
  assert.ok(panel && panel.hidden && panel.hasAttribute('data-dokufix-transient') && !document.querySelector('main .search-panel'));
  assert.ok(await slashAndType(document, window, 'Tabelle'), '"/" is taken by the search');
  assert.ok(!panel.hidden, 'open');
  assert.equal(summaryOf(panel), '3 Treffer an 2 Stellen in 1 Abschnitt');
  assert.equal(panel.querySelectorAll('.search-results .search-result').length, 2);
  // Without a heading the results stand in one group, "Am Anfang", with their numbers.
  assert.deepEqual(Array.from(panel.querySelectorAll('.search-group-head')).map(h => h.textContent), ['Am Anfang3 Treffer an 2 Stellen']);
  panel.querySelector('.search-close').click();
  assert.ok(panel.hidden && panel.querySelector('.search-input').value === '', '"×" closes it and forgets the term');
});
test('the reader bundle: a search over a packed diagram waits for the decoder\'s event, and runs after it, whether the diagram came out or not', async () => {
  const code = readerBlock(fs.readFileSync(committed, 'utf8'));
  const content = '<p>Eine Tabelle.</p><figure class="dokufix-diagram"><div class="dokufix-diagram-svg" data-gz="H4sIAAAAAAAA"></div></figure><p>Noch eine Tabelle.</p>';
  const { document, window, panel } = runReader(code, content);
  await slashAndType(document, window, 'Tabelle');
  assert.equal(summaryOf(panel), '', 'nothing is searched while a diagram is packed');
  assert.equal(panel.querySelectorAll('.search-results .search-result').length, 0);
  // The decoder failed on the diagram: the attribute stays, the event comes.
  document.dispatchEvent(new window.Event('dokufix-diagrams-unpacked'));
  assert.equal(summaryOf(panel), '2 Treffer an 2 Stellen in 1 Abschnitt', 'the waiting search runs on the event');
  // Without a packed diagram nothing waits.
  const plain = runReader(code, '<p>Eine Tabelle.</p>');
  await slashAndType(plain.document, plain.window, 'Tabelle');
  assert.equal(summaryOf(plain.panel), '1 Treffer an 1 Stelle in 1 Abschnitt');
});
// The decoder of a `schlank` file as src/app/downloads/readonly-slim.js writes
// it, with the name of its event filled in.
function slimDecoder(){
  const src = fs.readFileSync(path.join(srcDir, 'app/downloads/readonly-slim.js'), 'utf8');
  const m = src.match(/`<script>(\(async\(\)=>\{[\s\S]*?\}\)\(\);)<\\\/script>`/);
  assert.ok(m, 'the decoder was found in readonly-slim.js');
  assert.ok(m[1].includes('${UNPACKED_EVENT}'), 'the decoder names the event by the constant of search.js');
  return m[1].replace('${UNPACKED_EVENT}', UNPACKED_EVENT);
}
test('the reader bundle with the real decoder of schlank: one diagram unpacks, one does not; the event comes once, and the waiting search runs', async () => {
  const code = readerBlock(fs.readFileSync(committed, 'utf8'));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Diagramm</text></svg>';
  const good = zlib.gzipSync(svg).toString('base64');
  const content = '<p>Eine Tabelle.</p>' +
    '<figure class="dokufix-diagram"><div class="dokufix-diagram-svg" data-gz="' + good + '"></div></figure>' +
    '<figure class="dokufix-diagram"><div class="dokufix-diagram-svg" data-gz="bm9jaCBrZWluIGd6aXA="></div></figure>' +
    '<p>Noch eine Tabelle.</p>';
  // As in the file: the bundle first, then the decoder.
  const { document, window, panel } = runReader(code, content);
  let events = 0;
  document.addEventListener(UNPACKED_EVENT, () => { events++; });
  await slashAndType(document, window, 'Tabelle');
  assert.equal(summaryOf(panel), '', 'nothing is searched while the diagrams are packed');
  const failures = [];
  const arrived = new Promise(resolve => document.addEventListener(UNPACKED_EVENT, resolve, { once: true }));
  vm.runInNewContext(slimDecoder(), { document, Event: window.Event, atob, Uint8Array, Response, Blob, DecompressionStream, console: { error: (...a) => failures.push(a.join(' ')) } });
  await arrived;
  await new Promise(resolve => setTimeout(resolve, 50));
  const boxes = document.querySelectorAll('.dokufix-diagram-svg');
  assert.ok(!boxes[0].hasAttribute('data-gz') && boxes[0].innerHTML === svg, 'the first diagram is unpacked');
  assert.ok(boxes[1].hasAttribute('data-gz') && failures.length === 1 && /SVG decode failed/.test(failures[0]), 'the second stays packed, its failure on the console');
  assert.equal(events, 1, 'the event comes once');
  assert.equal(summaryOf(panel), '2 Treffer an 2 Stellen in 1 Abschnitt', 'the waiting search ran on the event');
});
test('the reader bundle: an attribute data-gz the author wrote outside a diagram is no reason to wait', async () => {
  const code = readerBlock(fs.readFileSync(committed, 'utf8'));
  const { document, window, panel } = runReader(code, '<p>Eine Tabelle.</p><div data-gz="x"><p>Noch eine Tabelle.</p></div>');
  await slashAndType(document, window, 'Tabelle');
  assert.equal(summaryOf(panel), '2 Treffer an 2 Stellen in 1 Abschnitt');
});
test('the reader bundle is the same with --dev: minified, so the readable file carries what an export carries', () => {
  const r = build({}, ['--dev']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readerBlock(r.html), readerBlock(fs.readFileSync(committed, 'utf8')));
});

// ---------- a missing source, and the build started through a symlink ----------
for (const name of ['index.html', 'doc.css', 'app.css', 'search.css', 'app.js', 'reader.js', 'demo.md']){
  test(name + ' missing: exit 1, "source not found", nothing written', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dokufix-build-'));
    fs.cpSync(srcDir, path.join(dir, 'src'), { recursive: true });
    fs.rmSync(path.join(dir, 'src', name));
    const out = path.join(dir, 'dokufix.html');
    const r = spawnSync(process.execPath, [path.join(root, 'build.mjs'), '--src', path.join(dir, 'src'), '--out', out], { encoding: 'utf8' });
    const written = fs.existsSync(out);
    fs.rmSync(dir, { recursive: true });
    assert.equal(r.status, 1, r.stdout);
    assert.ok(r.stderr.startsWith('source not found: ') && r.stderr.trim().endsWith(name), r.stderr);
    assert.ok(!written);
  });
}
test('started through a symlink, the build still runs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dokufix-build-'));
  const link = path.join(dir, 'build-link.mjs');
  fs.symlinkSync(path.join(root, 'build.mjs'), link);
  const r = spawnSync(process.execPath, [link, '--check'], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /up to date/);
});

// ---------- row 5: demo text with markup ----------
test('demo text with </script>, <!-- and replacement patterns: the block stays intact', () => {
  const demo = original('demo.md') + '\nEin `</script>` und ein <!-- Kommentar, <script>alert(1)</script>, $& $1 $\' {{slot:app.js}}   Ende.\n';
  const r = build({ 'demo.md': demo });
  assert.equal(r.status, 0, r.stderr);
  const block = dataBlock(r.html, 'dokufix-demo');
  assert.ok(!block.includes('<'), 'a "<" inside the block is written as \\u003c');
  assert.deepEqual(JSON.parse(block), { text: demo });
  // Nothing behind the block moved: the next block and the script are where they were.
  assert.deepEqual(JSON.parse(dataBlock(r.html, 'dokufix-source')), { text: '' });
  const unchanged = build();
  assert.equal(r.html.slice(r.html.indexOf('id="dokufix-source"')), unchanged.html.slice(unchanged.html.indexOf('id="dokufix-source"')));
});
test('the built demo block holds src/demo.md unchanged', () => {
  assert.deepEqual(JSON.parse(dataBlock(fs.readFileSync(committed, 'utf8'), 'dokufix-demo')), { text: original('demo.md') });
});

// ---------- the images of the demo text ----------
// src/assets/<sha256>.<ext>, written into the #dokufix-assets block as
// { "<sha256>": { "m": mime, "d": base64 } }.
const assetFiles = fs.readdirSync(path.join(srcDir, 'assets')).sort();
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
test('the built file carries every image of src/assets/ under the SHA-256 of its bytes, and the demo text names each one', () => {
  const block = JSON.parse(dataBlock(fs.readFileSync(committed, 'utf8'), 'dokufix-assets'));
  assert.ok(assetFiles.length > 0, 'src/assets/ holds an image');
  assert.deepEqual(Object.keys(block), assetFiles.map(f => f.replace(/\.[a-z]+$/, '')));
  for (const file of assetFiles){
    const bytes = fs.readFileSync(path.join(srcDir, 'assets', file));
    const hash = file.replace(/\.[a-z]+$/, '');
    assert.equal(sha256(bytes), hash, file + ': its name is its hash');
    assert.deepEqual(block[hash], { m: 'image/webp', d: bytes.toString('base64') });
    assert.ok(original('demo.md').includes('(#asset-' + hash + ')'), 'the demo text shows ' + file);
  }
});
test('an image whose bytes do not give its name: exit 1, file named, nothing written', () => {
  const file = assetFiles[0];
  const bytes = Buffer.from(fs.readFileSync(path.join(srcDir, 'assets', file)));
  bytes[bytes.length - 1] ^= 1;
  const r = build({ ['assets/' + file]: bytes });
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stderr.includes('src/assets/' + file + ': its bytes hash to ' + sha256(bytes)), r.stderr);
  assert.equal(r.html, null);
});
test('the demo text names an image src/assets/ does not hold: exit 1, hash named, nothing written', () => {
  const missing = 'ab'.repeat(32);
  const r = build({ 'demo.md': original('demo.md') + '\n![x](#asset-' + missing + ')\n' });
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stderr.includes('demo.md refers to #asset-' + missing + ', which src/assets/ does not hold'), r.stderr);
  assert.equal(r.html, null);
  // Without the file the demo text names, the same.
  const gone = build({ ['assets/' + assetFiles[0]]: null });
  assert.equal(gone.status, 1, gone.stdout);
  assert.ok(gone.stderr.includes('demo.md refers to #asset-' + assetFiles[0].replace(/\.[a-z]+$/, '')), gone.stderr);
});
test('a file in src/assets/ that is not named <sha256>.<ext> of an image type: exit 1, file named', () => {
  for (const name of ['kuchen.webp', 'ab'.repeat(32) + '.svg']){
    const r = build({ ['assets/' + name]: 'x' });
    assert.equal(r.status, 1, name + ': ' + r.stdout);
    assert.ok(r.stderr.includes('src/assets/' + name + ': an image is named <sha256>.<ext>'), r.stderr);
  }
});
