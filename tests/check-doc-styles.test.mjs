// Proves that check-doc-styles.mjs fails where it has to.
//
//   npm test          (node --test tests/*.test.mjs)
//
// Each case copies src/, breaks one thing in the copy, and expects exit 1 with
// the file, the line and the offending selector or function named. The sources
// themselves are never written to. Two more cases break a copy of the built file.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '../src');
const builtFile = path.join(here, '../dist/dokufix.html');
const original = name => fs.readFileSync(path.join(srcDir, name), 'utf8');
const built = fs.readFileSync(builtFile, 'utf8');

// The module that holds the export frame, and the one of the "offen" export.
const FRAME_FILE = 'app/downloads/export-body.js';
const OPEN_FILE = 'app/downloads/readonly-open.js';
const FRAME = 'const READONLY_FRAME_CSS = `';
const BLOCK = '<style id="dokufix-doc-css">\n{{slot:doc.css}}\n</style>\n';
const BUILT_BLOCK = /<style id="dokufix-doc-css">[\s\S]*?<\/style>\n/;

// Runs the check on a copy of src/ in which the given files are replaced, and
// on the built file or the given replacement of it.
function run(changed = {}, builtText = null){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dokufix-check-'));
  const copy = path.join(dir, 'src');
  fs.cpSync(srcDir, copy, { recursive: true });
  for (const [name, text] of Object.entries(changed)) fs.writeFileSync(path.join(copy, name), text);
  const args = [path.join(here, 'check-doc-styles.mjs'), '--src', copy];
  if (builtText !== null){
    fs.writeFileSync(path.join(dir, 'dokufix.html'), builtText);
    args.push('--built', path.join(dir, 'dokufix.html'));
  }
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true });
  return r;
}
// Replaces the first occurrence and insists that there was one, so a case
// cannot pass because its mutation silently missed.
function mutate(text, find, replacement){
  assert.ok(typeof find === 'string' ? text.includes(find) : find.test(text), 'mutation target not found');
  return text.replace(find, replacement);
}
const prepend = (name, rule) => ({ [name]: rule + original(name) });
const inFile = (name, find, replacement) => ({ [name]: mutate(original(name), find, replacement) });
function fails(name, changed, expected, builtText = null){
  test(name, () => {
    const r = run(changed, builtText);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, expected);
  });
}

test('the sources and the built file as they are pass', () => {
  const r = run();
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.stdout.trim().split('\n').length, 7);
});

fails('#preview descendant rule in the app stylesheet', prepend('app.css', '#preview h5{color:red}\n'), /src\/app\.css line 1, the app stylesheet: "#preview h5"/);
fails('dokufix- rule in the app stylesheet', prepend('app.css', '.dokufix-x{color:red}\n'), /src\/app\.css line 1, the app stylesheet: "\.dokufix-x"/);
fails('#preview descendant rule in the export frame', inFile(FRAME_FILE, FRAME, FRAME + '#preview h5{color:red}\n'), /src\/app\/downloads\/export-body\.js line \d+, the export frame.*"#preview h5"/);
fails('dokufix- rule in the export frame', inFile(FRAME_FILE, FRAME, FRAME + '.dokufix-x{color:red}\n'), /src\/app\/downloads\/export-body\.js line \d+, the export frame.*"\.dokufix-x"/);
fails('document rule with an ancestor in the export frame', inFile(FRAME_FILE, FRAME, FRAME + '.reader-body h5{color:red}\n'), /src\/app\/downloads\/export-body\.js line \d+, the export frame.*"\.reader-body h5"/);
fails('unprefixed document construct in the app stylesheet', prepend('app.css', '.footnotes li{color:red}\n'), /src\/app\.css line 1, the app stylesheet: "\.footnotes li".*\.footnotes/);
fails('editor selector in front of .dokufix-doc in the block', prepend('doc.css', 'body.mode-view .dokufix-doc h5{color:red}\n'), /src\/doc\.css line 1: "body\.mode-view \.dokufix-doc h5" does not start with \.dokufix-doc/);
fails('export that no longer embeds the document styles', inFile(OPEN_FILE, '<style>${readonlyCss()}</style>', '<style>${READONLY_FRAME_CSS}</style>'), /src\/app\/downloads\/readonly-open\.js line \d+, downloadReadonlyOpen\(\).*does not embed/);
fails('block missing from the page', inFile('index.html', BLOCK, ''), /src\/index\.html: found 0 blocks/);
fails('block doubled in the page', inFile('index.html', BLOCK, BLOCK + BLOCK), /src\/index\.html: found 2 blocks/);

fails('document rule in a <style> of the page', inFile('index.html', '</head>', '<style>.dokufix-doc h5{color:red}</style>\n</head>'), /src\/index\.html line \d+, a <style> in the page: "\.dokufix-doc h5"/);
fails('document rules written into the block\'s element instead of doc.css', inFile('index.html', BLOCK, BLOCK.replace('{{slot:doc.css}}', '{{slot:doc.css}}\n.dokufix-doc h5{color:red}')), /src\/index\.html line \d+: the block holds something other than \{\{slot:doc\.css\}\}/);
fails('built file without the block', {}, /found 0 blocks/, mutate(built, BUILT_BLOCK, ''));
fails('built file with an empty block', {}, /dokufix\.html line \d+: the block is empty/, mutate(built, BUILT_BLOCK, '<style id="dokufix-doc-css">\n</style>\n'));
fails('built file with the block doubled', {}, /found 2 blocks/, mutate(built, BUILT_BLOCK, m => m + m));
