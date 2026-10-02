// Proves that the lint over src/ fails where it has to, and only there.
//
//   npm test          (node --test tests/*.test.mjs)
//
// The script is cut into modules, and esbuild bundles them without asking where
// a name comes from: a name that a module neither declares nor imports is taken
// for a global, and an import nothing uses is dropped unread. ESLint, with the
// rules of eslint.config.mjs, is the check for both. Each case copies
// src/, breaks one thing in the copy, and expects exit 1 with the module, the
// line and the name. The sources themselves are never written to.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const srcDir = path.join(root, 'src');
const original = name => fs.readFileSync(path.join(srcDir, name), 'utf8');
const lineCount = text => text.split('\n').length - 1;

// Runs ESLint on a copy of src/ in which the given files are replaced. The
// config is the repository's; the copy's folder is the working directory, so
// that "src/**/*.js" in the config means the copy.
function lint(changed = {}){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dokufix-lint-'));
  fs.cpSync(srcDir, path.join(dir, 'src'), { recursive: true });
  for (const [name, text] of Object.entries(changed)) fs.writeFileSync(path.join(dir, 'src', name), text);
  const r = spawnSync(process.execPath,
    [path.join(root, 'node_modules/eslint/bin/eslint.js'), '--config', path.join(root, 'eslint.config.mjs'), 'src'],
    { cwd: dir, encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true });
  return r;
}
function mutate(text, find, replacement){
  assert.ok(text.includes(find), 'mutation target not found');
  return text.replace(find, replacement);
}
// One problem, reported as ESLint prints it: the file on a line of its own, then
// "line:column  error  message  rule".
function fails(name, changed, file, line, message, rule){
  test(name, () => {
    const r = lint(changed);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const esc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    assert.match(r.stdout, new RegExp(esc('src/' + file) + '\\n +' + line + ':\\d+ +error +' + esc(message) + ' +' + esc(rule) + '\\n'));
    assert.match(r.stdout, /\b1 problem\b/);
  });
}

test('the sources as they are pass', () => {
  const r = lint();
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test('"npm run check" runs the lint over src/', () => {
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  assert.match(scripts.check, /&& eslint src$/);
});

// ---------- an undeclared name ----------
// The split's own mistake: the function moved, its import did not.
{
  const importLine = "import { escapeHtml } from './html.js';\n";
  const text = original('app/toc.js');
  const used = lineCount(text.slice(0, text.indexOf('escapeHtml(', text.indexOf(importLine) + importLine.length))) + 1;
  fails('a module uses a name it no longer imports', { 'app/toc.js': mutate(text, importLine, '\n') },
    'app/toc.js', used, "'escapeHtml' is not defined", 'no-undef');
}
// What was a variable of the one script is a property of state now.
fails('a module uses a name of the shared state without "state."',
  { 'app/toc.js': original('app/toc.js') + 'export function probe(){ return currentVersion; }\n' },
  'app/toc.js', lineCount(original('app/toc.js')) + 1, "'currentVersion' is not defined", 'no-undef');
fails('a module uses a name nobody declares',
  { 'app/gzip.js': original('app/gzip.js') + 'nichtDeklariert();\n' },
  'app/gzip.js', lineCount(original('app/gzip.js')) + 1, "'nichtDeklariert' is not defined", 'no-undef');

// ---------- an assignment to an import ----------
fails('a module assigns to a name it imported',
  { 'app/editor.js': original('app/editor.js') + 'export function probe(){ sourceEl = null; }\n' },
  'app/editor.js', lineCount(original('app/editor.js')) + 1, "'sourceEl' is read-only", 'no-import-assign');

// ---------- an import nothing uses ----------
// esbuild drops it unread, so the build passes even when the name is not
// exported at all; in the page nothing would fail either. It is still a line
// that says something untrue about the module.
fails('a module imports a name it does not use',
  { 'app/rail.js': "import { gzipB64 } from './gzip.js';\n" + original('app/rail.js') },
  'app/rail.js', 1, "'gzipB64' is imported but never used", 'dokufix/no-unused-imports');
fails('a module imports a name it does not use, and the other module does not export it',
  { 'app/rail.js': "import { nichtDa } from './gzip.js';\n" + original('app/rail.js') },
  'app/rail.js', 1, "'nichtDa' is imported but never used", 'dokufix/no-unused-imports');

// ---------- a namespace import ----------
// With import * as x, esbuild only warns when x.name is not exported ("will
// always be undefined"), writes the file and exits 0, and no-undef has nothing
// to say about a member. So the form itself fails. (ESLint prints the message
// without its last full stop.)
fails('a module imports another as a namespace',
  { 'app/rail.js': "import * as G from './gzip.js';\n" + original('app/rail.js') + 'export function probe(){ return G.nichtDa; }\n' },
  'app/rail.js', 1, 'Import the names you use: import { a, b } from …. With import * as x, a member the other module does not export is undefined at run time and the build does not fail', 'no-restricted-syntax');

// ---------- and only there ----------
test('a function nobody calls, a parameter and a local nobody reads pass: the rule is about imports', () => {
  const r = lint({ 'app/gzip.js': original('app/gzip.js') + 'function niemandRuftMich(a){ const unbenutzt = 1; }\n' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
