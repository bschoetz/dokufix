// Labels defined twice, run in Node: src/app/definitions.js. marked keeps the
// first definition of a label and drops the rest without a word; the document
// says so (src/README.md, "Parts and their headers", across parts).
//
//   npm test          (node --test tests/*.test.mjs)

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { duplicateDefinitions, noteDuplicateDefinitions } from '../src/app/definitions.js';
import { readParts, partsMarkdown } from '../src/app/frontmatter.js';

test('a footnote label and a link label defined twice, each named once', () => {
  assert.deepEqual(duplicateDefinitions('a[^1] [L][x]\n\n[^1]: eins\n[x]: https://eins.example\n\n## B\n\n[^1]: zwei\n[x]: https://zwei.example\n[^1]: drei\n'),
    [{ kind: 'footnote', label: '1' }, { kind: 'link', label: 'x' }]);
});

test('link labels compare without case and runs of blanks, footnote labels as written', () => {
  assert.deepEqual(duplicateDefinitions('[Gross  Klein]: u\n[ gross klein ]: v\n\n[^A]: a\n[^a]: b\n'), [{ kind: 'link', label: 'Gross  Klein' }]);
});

test('no definition inside fenced code or inside a paragraph, and none defined once', () => {
  assert.deepEqual(duplicateDefinitions('[x]: u\n\n```\n[x]: v\n```\n\nText\n[x]: w\n\n[y]: u\n[^1]: eins\n'), []);
});

test('the pass puts one notice per label at the top', () => {
  const { document } = parseHTML('<!doctype html><html><body><main><h1>T</h1></main></body></html>');
  const root = document.querySelector('main');
  noteDuplicateDefinitions(root, { markdown: '[^1]: a\n[^1]: b\n[x]: u\n[X]: v\n' });
  assert.deepEqual(Array.from(root.querySelectorAll('.dokufix-warning-title')).map(p => p.textContent), [
    'Warnung: Die Fußnote [^1] ist mehrfach definiert; es gilt die erste Definition.',
    'Warnung: Der Linkverweis [x] ist mehrfach definiert; es gilt die erste Definition.',
  ]);
  assert.equal(root.lastElementChild.tagName, 'H1');
});

test('a definition right under the header of a part starts a block in what marked parses', () => {
  const source = '[^1]: eins\n\n---part\ntitle: B\n---\n[^1]: zwei\n';
  assert.deepEqual(duplicateDefinitions(partsMarkdown(source, readParts(source), 1)), [{ kind: 'footnote', label: '1' }]);
});

test('as marked reads them: a block starts after a heading, a break or a fence; prose is no definition; case folds through upper case', () => {
  assert.deepEqual(duplicateDefinitions('a [l][x] b[^1]\n\n## A\n[x]: http://u\n\n## B\n[x]: http://v\n\n***\n[^1]: eins\n\n```\n[^1]: code\n```\n[^1]: zwei\n'),
    [{ kind: 'link', label: 'x' }, { kind: 'footnote', label: '1' }]);
  assert.deepEqual(duplicateDefinitions('[Achtung]: Das ist wichtig.\n\n[Achtung]: Das auch.\n'), []);
  assert.deepEqual(duplicateDefinitions('[a]: <b c> "Titel"\n[A]: /d (Titel)\n'), [{ kind: 'link', label: 'a' }]);
  assert.deepEqual(duplicateDefinitions('[Straße]: /a\n[STRASSE]: /b\n'), [{ kind: 'link', label: 'Straße' }]);
  // After the indented lines that continue a footnote, a definition starts a block; after a paragraph line not.
  assert.deepEqual(duplicateDefinitions('[^b]: b\n    weiter\n[^a]: erste\n\n[^a]: zweite\n'), [{ kind: 'footnote', label: 'a' }]);
  assert.deepEqual(duplicateDefinitions('[^b]: b\n\n    weiter\n[^a]: erste\n\n[^a]: zweite\n'), [{ kind: 'footnote', label: 'a' }]);
  assert.deepEqual(duplicateDefinitions('[^b]: b\nweiter\n[^a]: erste\n\n[^a]: zweite\n'), []);
});
