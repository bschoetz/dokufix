// The cases of parts and their headers, run in Node: src/README.md, "Parts and
// their headers", states the format; tests/fixtures/parts/ holds one Markdown
// file per case and expected.json what a reader of it must find. The readers
// come later (the product in story 3.3, the script in story 3.4, `check` in
// story 3.7); until then this keeps the cases consistent and checks the ones of
// a single part against today's reader of the top header.
//
//   npm test          (node --test tests/*.test.mjs)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { splitFrontmatter } from '../src/app/frontmatter.js';

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

  if (parts.length === 1 && !BOUNDARY.test(lines[0])){
    test(`${file}: a document of one part has the header splitFrontmatter reads`, () => {
      const data = splitFrontmatter(doc).data;
      assert.deepEqual(data ? plain(data) : null, parts[0].header);
    });
  }
}
