// The cases of parts and their headers, run in Node: src/README.md, "Parts and
// their headers", states the format; tests/fixtures/parts/ holds one Markdown
// file per case and expected.json what a reader of it must find. The product's
// reader, readParts() in src/app/frontmatter.js (story 3.3), runs every case:
// its parts, and the problems of the header; the problems of the fields are
// `check`'s (story 3.7). tests/test_dokufix_skript.py runs every case against
// the script's reader, read_parts() (story 3.4).
//
//   npm test          (node --test tests/*.test.mjs)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHTML } from 'linkedom';
import { splitFrontmatter, readParts, partsMarkdown, injectPartHeaders, deriveDocTitle } from '../src/app/frontmatter.js';

const DIR = new URL('./fixtures/parts/', import.meta.url);
const expected = JSON.parse(fs.readFileSync(new URL('expected.json', DIR), 'utf8'));
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md')).sort();
const CODES = ['header-missing', 'header-unclosed', 'header-unreadable', 'kind-unknown', 'state-form', 'source-path', 'field-type'];
const BOUNDARY = /^---part[ \t]*$/i;
const plain = value => JSON.parse(JSON.stringify(value));

test('every case file has its expectation, and every expectation its file', () => {
  assert.deepEqual(Object.keys(expected).sort(), files);
});

for (const file of files){
  const doc = fs.readFileSync(new URL(file, DIR), 'utf8');
  // A final line break ends the last line; it starts no line of its own.
  const lines = doc.replace(/\r?\n$/, '').split('\n').map(l => l.replace(/\r$/, ''));
  const { parts, problems } = expected[file];

  test(`${file}: parts start at line 1 or at a boundary, in order`, () => {
    assert.ok(parts.length >= 1);
    assert.equal(parts[0].line, 1);
    parts.forEach((p, i) => {
      if (i) assert.ok(p.line > parts[i - 1].line);
      if (i || BOUNDARY.test(lines[0])) assert.match(lines[p.line - 1], BOUNDARY);
      assert.ok(p.name === null || typeof p.name === 'string');
    });
  });

  test(`${file}: problems name a known code and a line of the document`, () => {
    for (const p of problems){
      assert.ok(CODES.includes(p.code), p.code);
      assert.ok(p.line >= 1 && p.line <= lines.length);
    }
  });

  test(`${file}: readParts() finds the parts and the problems of their headers`, () => {
    const read = readParts(doc);
    assert.deepEqual(read.map(p => ({ line: p.line, name: p.name, header: p.fm && p.fm.data ? plain(p.fm.data) : null })), parts);
    assert.deepEqual(read.filter(p => p.problem).map(p => ({ line: p.line, code: p.problem })),
      problems.filter(p => p.code.startsWith('header-')));
  });

  if (parts.length === 1 && !BOUNDARY.test(lines[0])){
    test(`${file}: a document of one part has the header splitFrontmatter reads`, () => {
      const data = splitFrontmatter(doc).data;
      assert.deepEqual(data ? plain(data) : null, parts[0].header);
    });
  }
}

// ---------- the parts in the page ----------
const read = file => fs.readFileSync(new URL(file, DIR), 'utf8');
// The placeholders as marked keeps an HTML block, the rest left out.
function rootOf(markdown){
  const { document } = parseHTML('<!doctype html><html><body><main></main></body></html>');
  const root = document.querySelector('main');
  root.innerHTML = markdown.split('\n').filter(l => l.startsWith('<div data-dokufix-part=')).join('');
  return root;
}

test('every part with a header or a problem gets a placeholder of this render, the others none', () => {
  const source = read('pt03-two-parts.md'), parts = readParts(source);
  const md = partsMarkdown(source, parts, 5);
  assert.match(md, /^<div data-dokufix-part="5-0"><\/div>\n\n# Ausleihe\n/);
  assert.match(md, /\n\n<div data-dokufix-part="5-1"><\/div>\n\n\n## Rückgabe am Automaten/);
  assert.doesNotMatch(md, /title:|---part/);
  // A document of one part without a header is parsed as it stands.
  const plainDoc = read('pt01-plain.md');
  assert.equal(partsMarkdown(plainDoc, readParts(plainDoc), 5), plainDoc);
  // An explicit empty header is consumed, as splitFrontmatter() does.
  const empty = read('pt27-empty-explicit-header.md');
  assert.equal(partsMarkdown(empty, readParts(empty), 5), '# Titel\n\nText.\n');
  // The lines of a header left open stay text.
  const open = read('pt11-unclosed.md');
  assert.match(partsMarkdown(open, readParts(open), 5), /<div data-dokufix-part="5-1"><\/div>\n\ntitle: X\n/);
});

test('the pass puts a panel, a raw panel or a notice where each placeholder stood', () => {
  for (const [file, want] of [
    ['pt03-two-parts.md', ['dokufix-frontmatter', 'dokufix-frontmatter']],
    ['pt10-missing.md', ['dokufix-warning', 'dokufix-warning', 'dokufix-warning']],
    ['pt11-unclosed.md', ['dokufix-warning', 'dokufix-warning', 'dokufix-warning']],
    ['pt12-unreadable.md', ['dokufix-frontmatter dokufix-fm-unparsed', 'dokufix-frontmatter dokufix-fm-unparsed', 'dokufix-frontmatter dokufix-fm-unparsed']],
  ]){
    const source = read(file), parts = readParts(source);
    const root = rootOf(partsMarkdown(source, parts, 3));
    injectPartHeaders(root, { parts, partToken: 3 });
    assert.deepEqual(Array.from(root.children).map(el => el.className), want, file);
  }
  const notices = (() => {
    const s = read('pt10-missing.md') + '\n---part\ntitle: offen\n', parts = readParts(s), root = rootOf(partsMarkdown(s, parts, 1));
    injectPartHeaders(root, { parts, partToken: 1 });
    return Array.from(root.querySelectorAll('.dokufix-warning-title')).map(p => p.textContent);
  })();
  assert.equal(notices[0], 'Warnung: Für diesen Teil sind keine Metadaten angegeben.');
  assert.equal(notices.at(-1), 'Warnung: Die Metadaten dieses Teils sind nicht abgeschlossen, es fehlt die Zeile „---“. Sie werden darum als Text gezeigt.');
});

test('a placeholder of another render, or one an author wrote, is left alone', () => {
  const source = read('pt03-two-parts.md'), parts = readParts(source);
  const root = rootOf(partsMarkdown(source, parts, 2));
  root.insertAdjacentHTML('beforeend', '<div data-dokufix-part="9-1"></div>');
  injectPartHeaders(root, { parts, partToken: 2 });
  assert.equal(root.querySelectorAll('details.dokufix-frontmatter').length, 2);
  assert.ok(root.querySelector('div[data-dokufix-part="9-1"]'));
});

test('the title of the file is read past every header, a YAML comment in one included', () => {
  assert.equal(deriveDocTitle(read('pt14-names.md'), 'leer'), 'leer');
  assert.equal(deriveDocTitle('---part\n# intern\nkind: process\n---\n# Ablauf\n', 'leer'), 'Ablauf');
  assert.equal(deriveDocTitle(read('pt03-two-parts.md'), 'leer'), 'Ausleihe');
});
