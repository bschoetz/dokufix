// Proves what tools/theme.mjs and build.mjs --theme promise (story 6.2): the
// schema, the inheritance, the contrast pairs, the themed page.
//
//   npm test          (node --test tests/*.test.mjs)
//
// Each case writes its theme into a temporary folder; the example theme is
// built with --dry or into a temporary folder. Nothing in the repo is written.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readTheme, DERIVED, PAIRS, themeDefaults } from '../tools/theme.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const docCss = fs.readFileSync(path.join(root, 'src/doc.css'), 'utf8');

const temps = [];
test.after(() => { for (const d of temps) fs.rmSync(d, { recursive: true, force: true }); });
const tempDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dokufix-theme-')); temps.push(d); return d; };
function themeDir(theme){
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'theme.json'), typeof theme === 'string' ? theme : JSON.stringify(theme));
  return dir;
}
const read = theme => readTheme(themeDir(theme), docCss);
const refused = (theme, re) => assert.throws(() => read(theme), e => { assert.match(e.message, re); return true; });
const base = { id: 'probe', name: 'Probe' };

test('a theme with only id and name passes every contrast pair and changes no variable', () => {
  const t = read(base);
  assert.equal(t.css, '');
  assert.deepEqual(t.inherited, ['note', 'tip', 'important', 'warning', 'caution']);
  assert.match(t.meta, /^<meta name="dokufix-theme" content="probe [0-9a-f]{12}">$/);
});

test('an unknown key is refused with the known ones', () => {
  refused({ ...base, colors: { txet: '#000000' } }, /theme\.json: unknown key colors\.txet; known: text, text-muted/);
});

test('a bad value names key and value', () => {
  refused({ ...base, colors: { text: '#12345' } }, /colors\.text is "#12345"/);
  refused({ ...base, colors: { text: 'red' } }, /colors\.text is "red"/);
  refused({ ...base, id: 'Beispiel' }, /id is "Beispiel"/);
  refused({ ...base, name: 'x'.repeat(41) }, /name is/);
});

test('low contrast names both keys, both values and the ratio', () => {
  refused({ ...base, colors: { text: '#999999' } }, /text #999999 on surface #ffffff: 2\.85:1, needs 4\.5:1/);
});

test('a partial status builds and lists the inherited kinds; text follows color', () => {
  const t = read({ ...base, status: { note: { color: '#0b5f8a' } } });
  assert.deepEqual(t.inherited, ['tip', 'important', 'warning', 'caution']);
  assert.match(t.css, /--dokufix-status-note-text:#0b5f8a/);
});

test('focus follows link, line-faint follows text-faint, derived values follow', () => {
  const t = read({ ...base, colors: { link: '#0b6b70', 'text-faint': '#5c5c5c', accent: '#d4ff00', chrome: '#ffffff', 'chrome-raised': '#e5e5ea', 'on-chrome': '#1c1c1e' } });
  assert.match(t.css, /--dokufix-focus:#0b6b70/);
  assert.match(t.css, /--dokufix-line-faint:#5c5c5c/);
  assert.match(t.css, /--dokufix-link-tint-6:rgba\(11,107,112,0\.06\)/);
  // The accent at its default changes nothing; a light chrome darkens the hover line.
  assert.doesNotMatch(t.css, /accent/);
  assert.match(t.css, /--dokufix-chrome-line-hover:#2c2c2e/);
});

test('a missing folder or theme.json is named', () => {
  assert.throws(() => readTheme(path.join(os.tmpdir(), 'dokufix-nix-' + process.pid), docCss), /theme not found: .*theme\.json/);
});

test('a name with markup is escaped in title and header', () => {
  const t = read({ ...base, name: 'A & <B>' });
  assert.equal(t.title, '<title>A &amp; &lt;B&gt; — dokufix</title>');
  assert.match(t.header, /^<h1>A &amp; &lt;B&gt;<\/h1>/);
});

test('the example theme builds beside itself, not into dist/; --check then passes; exit 1 on a bad theme', () => {
  const dir = tempDir();
  fs.copyFileSync(path.join(root, 'themes/beispiel/theme.json'), path.join(dir, 'theme.json'));
  const committed = fs.readFileSync(path.join(root, 'dist/dokufix.html'));
  const run = (...args) => spawnSync(process.execPath, [path.join(root, 'build.mjs'), '--theme', dir, ...args], { encoding: 'utf8' });
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'dist')).sort(), ['dokufix-beispiel-showcase.html', 'dokufix-beispiel.html']);
  assert.ok(fs.readFileSync(path.join(root, 'dist/dokufix.html')).equals(committed));
  assert.equal(run('--check').status, 0);
  const out = path.join(dir, 'dist/dokufix-beispiel.html');
  assert.match(r.stdout, /callout kinds inherited from dokufix: important, warning, caution/);
  const html = fs.readFileSync(out, 'utf8');
  const block = /<style id="dokufix-doc-css">\n([\s\S]*?)\n<\/style>/.exec(html)[1];
  assert.match(block, /\n:root\{--dokufix-text:#1f2933;[^}]*\}$/);
  assert.match(html, /<title>Beispiel GmbH Doku — dokufix<\/title>\n<meta name="dokufix-theme" content="beispiel [0-9a-f]{12}">/);
  assert.match(html, /<h1>Beispiel GmbH Doku<\/h1>\n {2}<span class="brand">dokufix<\/span>\n {2}<span id="dirty-badge"/);

  const bad = themeDir({ ...base, colors: { txet: '#000000' } });
  const r2 = spawnSync(process.execPath, [path.join(root, 'build.mjs'), '--theme', bad, '--dry'], { encoding: 'utf8' });
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /unknown key colors\.txet/);
  assert.ok(!fs.existsSync(path.join(bad, 'dist')));
});

test('a status tint equal to its color is refused', () => {
  refused({ ...base, status: { note: { color: '#0b5f8a', tint: '#0b5f8a' } } }, /status\.note\.text #0b5f8a on status\.note\.tint #0b5f8a/);
});

test('status.important.tint is accepted and written; an empty kind still counts as inherited', () => {
  const t = read({ ...base, status: { important: { tint: '#f6efff' }, note: {} } });
  assert.match(t.css, /--dokufix-status-important-tint:#f6efff/);
  assert.ok(t.inherited.includes('note') && !t.inherited.includes('important'));
});

test('font names: a name with a space or a keyword is quoted, generic families stay bare', () => {
  assert.match(read({ ...base, fonts: { body: ['Beispiel Sans', 'Arial', 'sans-serif'] } }).css, /--dokufix-font-body:'Beispiel Sans',Arial,sans-serif(;|\})/);
  assert.match(read({ ...base, fonts: { body: ['inherit', 'sans-serif'] } }).css, /--dokufix-font-body:'inherit',sans-serif/);
});

test('the tag is escaped and limited; the name is trimmed', () => {
  const t = read({ ...base, name: '  Probe  ', tag: 'A<b' });
  assert.match(t.header, /<span class="tag">A&lt;b<\/span>$/);
  assert.equal(t.title, '<title>Probe — dokufix</title>');
  refused({ ...base, tag: 'x'.repeat(21) }, /tag is/);
});

test('a dark scheme is refused', () => {
  refused({ ...base, colors: { surface: '#1c1c1e', text: '#f5f5f7', 'surface-alt': '#2c2c2e', 'text-muted': '#c7c7cc', 'text-faint': '#aeaeb2', link: '#4da3ff', mark: '#5c4a00' } }, /surface #1c1c1e is not lighter than text #f5f5f7/);
});

test('the states the theme moves are checked: on-accent on the derived hover, on-chrome on chrome-raised, the fixed grey on chrome', () => {
  refused({ ...base, colors: { accent: '#757575', 'on-accent': '#000000' } }, /on-accent #000000 on accent-hover #686868/);
  refused({ ...base, colors: { 'chrome-raised': '#e0e0e0' } }, /on-chrome #f5f5f7 on chrome-raised #e0e0e0/);
  refused({ ...base, colors: { chrome: '#eeeeee', 'on-chrome': '#1c1c1e', 'chrome-raised': '#d0d0d0' } }, /on-chrome-faint #8e8e92 on chrome #eeeeee/);
});

test('every DERIVED and PAIRS key is a variable of the :root rule in src/doc.css', () => {
  const { all } = themeDefaults(docCss);
  for (const k of [...Object.keys(DERIVED), ...Object.values(DERIVED).flatMap(([from]) => from), ...PAIRS.flatMap(([a, b]) => [a, b])]) assert.ok(k in all, k);
});
