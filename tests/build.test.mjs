// Proves what build.mjs promises: the same file from the same sources, and exit 1
// with nothing written where a source would give a broken page.
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
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assemble, BuildError, SLOTS } from '../build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const srcDir = path.join(root, 'src');
const committed = path.join(root, 'dist/dokufix.html');
const original = name => fs.readFileSync(path.join(srcDir, name), 'utf8');

// Runs build.mjs on a copy of src/ in which the given files are replaced.
// Returns the process result and, if the build wrote one, the built file's text.
function build(changed = {}, extraArgs = [], out = null){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dokufix-build-'));
  const copy = path.join(dir, 'src');
  fs.cpSync(srcDir, copy, { recursive: true });
  for (const [name, text] of Object.entries(changed)) fs.writeFileSync(path.join(copy, name), text);
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
for (const name of ['doc.css', 'app.css', 'app.js', 'demo.md', 'index.html']){
  test('--check fails when ' + name + ' changed and dist/ was not rebuilt', () => {
    const addition = { 'doc.css': '.dokufix-doc h6{color:red}\n', 'app.css': '.x{color:red}\n', 'app.js': 'console.log("x");\n', 'demo.md': 'Ein Satz mehr.\n', 'index.html': '<!-- x -->\n' }[name];
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
for (const name of ['doc.css', 'app.css']){
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
