// Proves that check-doc-styles.mjs fails where it has to.
//
//   node --test poc/tests/
//
// Each case copies the PoC, breaks one thing, and expects exit 1 with the
// offending selector or function named. The PoC itself is never written to.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const poc = path.join(here, '../dokufix-poc.html');
const original = fs.readFileSync(poc, 'utf8');
const APP_SHEET = '<style>\n';
const FRAME = 'const READONLY_FRAME_CSS = `';
const BLOCK = /<style id="dokufix-doc-css">[\s\S]*?<\/style>\n/;
const BLOCK_OPEN = '<style id="dokufix-doc-css">\n';

function run(html){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dokufix-check-'));
  const file = path.join(dir, 'poc.html');
  fs.writeFileSync(file, html);
  const r = spawnSync(process.execPath, [path.join(here, 'check-doc-styles.mjs'), file], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true });
  return r;
}
// Replaces the first occurrence and insists that there was one, so a case
// cannot pass because its mutation silently missed.
function mutate(find, replacement){
  assert.ok(typeof find === 'string' ? original.includes(find) : find.test(original), 'mutation target not found');
  return original.replace(find, replacement);
}
function fails(name, html, expected){
  test(name, () => {
    const r = run(html);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, expected);
  });
}

test('the PoC as it is passes', () => {
  const r = run(original);
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.stdout.trim().split('\n').length, 6);
});

fails('#preview descendant rule in the app stylesheet', mutate(APP_SHEET, APP_SHEET + '  #preview h5{color:red}\n'), /"#preview h5".*the app stylesheet|the app stylesheet.*"#preview h5"/);
fails('dokufix- rule in the app stylesheet', mutate(APP_SHEET, APP_SHEET + '  .dokufix-x{color:red}\n'), /the app stylesheet.*"\.dokufix-x"/);
fails('#preview descendant rule in the export frame', mutate(FRAME, FRAME + '#preview h5{color:red}\n'), /the export frame.*"#preview h5"/);
fails('dokufix- rule in the export frame', mutate(FRAME, FRAME + '.dokufix-x{color:red}\n'), /the export frame.*"\.dokufix-x"/);
fails('document rule with an ancestor in the export frame', mutate(FRAME, FRAME + '.reader-body h5{color:red}\n'), /the export frame.*"\.reader-body h5"/);
fails('unprefixed document construct in the app stylesheet', mutate(APP_SHEET, APP_SHEET + '  .footnotes li{color:red}\n'), /the app stylesheet.*"\.footnotes li".*\.footnotes/);
fails('editor selector in front of .dokufix-doc in the block', mutate(BLOCK_OPEN, BLOCK_OPEN + '  body.mode-view .dokufix-doc h5{color:red}\n'), /"body\.mode-view \.dokufix-doc h5" does not start with \.dokufix-doc/);
fails('export that no longer embeds the document styles', mutate('<style>${readonlyCss()}</style>', '<style>${READONLY_FRAME_CSS}</style>'), /downloadReadonlyOpen\(\).*does not embed/);
fails('block missing', mutate(BLOCK, ''), /found 0 blocks/);
fails('block doubled', mutate(BLOCK, m => m + m), /found 2 blocks/);
