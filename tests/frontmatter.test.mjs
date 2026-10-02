// The frontmatter parser, run in Node: no browser, no page.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/frontmatter.js is a module of pure logic: it imports nothing that
// looks up an element when it is loaded, so this file can import it as it is.
// The cases are the ones src/README.md, "Frontmatter", states in prose: what is
// frontmatter and what is not, the YAML subset, and the five inputs on which
// "fail loudly" once failed quietly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { splitFrontmatter, deriveDocTitle } from '../src/app/frontmatter.js';

// The parsed data as a plain object: the parser builds maps without a
// prototype, which deepEqual would tell apart from a literal.
const plain = value => JSON.parse(JSON.stringify(value));
const doc = (header, body = '# Titel\n\nText.\n') => '---\n' + header + '\n---\n' + body;

// ---------- what is read ----------
test('key: value pairs, and the body behind the block', () => {
  const fm = splitFrontmatter(doc('title: Handbuch\nversion: 3'));
  assert.equal(fm.kind, 'yaml');
  assert.deepEqual(plain(fm.data), { title: 'Handbuch', version: '3' });
  assert.equal(fm.body, '# Titel\n\nText.\n');
  assert.equal(fm.raw, 'title: Handbuch\nversion: 3\n');
});
test('values stay strings: no type coercion', () => {
  const fm = splitFrontmatter(doc('title: x\nfreigegeben: no\nanzahl: 012\nleer:'));
  assert.deepEqual(plain(fm.data), { title: 'x', freigegeben: 'no', anzahl: '012', leer: '' });
});
test('nested maps by indentation', () => {
  const fm = splitFrontmatter(doc('title: x\nfreigabe:\n  rolle: Informationssicherheit\n  frist:\n    bis: 2027-06-30'));
  assert.deepEqual(plain(fm.data), { title: 'x', freigabe: { rolle: 'Informationssicherheit', frist: { bis: '2027-06-30' } } });
});
test('sequences of scalars, indented and flush with the key', () => {
  const indented = splitFrontmatter(doc('title: x\ntags:\n  - eins\n  - zwei'));
  const flush = splitFrontmatter(doc('title: x\ntags:\n- eins\n- zwei'));
  assert.deepEqual(plain(indented.data), { title: 'x', tags: ['eins', 'zwei'] });
  assert.deepEqual(plain(flush.data), plain(indented.data));
});
test('single- and double-quoted scalars with their escapes', () => {
  const fm = splitFrontmatter(doc('title: "Ein \\"Zitat\\" und\\tein Tab"\nautor: \'O\'\'Brien\'\n"mit Leerzeichen": "# kein Kommentar"'));
  assert.deepEqual(plain(fm.data), { title: 'Ein "Zitat" und\tein Tab', autor: "O'Brien", 'mit Leerzeichen': '# kein Kommentar' });
});
test('comments: a full line, a trailing one, and a # that is none', () => {
  const fm = splitFrontmatter(doc('# interner Entwurf\ntitle: Handbuch # vorläufig\nlink: https://example.org/#abschnitt'));
  assert.deepEqual(plain(fm.data), { title: 'Handbuch', link: 'https://example.org/#abschnitt' });
});
test('a key with a non-ASCII letter and a space', () => {
  const fm = splitFrontmatter(doc('Prüfer: Ben\nAutor Name: Ada'));
  assert.deepEqual(plain(fm.data), { 'Prüfer': 'Ben', 'Autor Name': 'Ada' });
});
test('JSON: sniffed by its first brace, and under an explicit fence', () => {
  const sniffed = splitFrontmatter('---\n{"title": "Handbuch", "tags": ["a", "b"]}\n---\nText');
  assert.equal(sniffed.kind, 'json');
  assert.deepEqual(sniffed.data, { title: 'Handbuch', tags: ['a', 'b'] });
  assert.equal(sniffed.body, 'Text');
  const fenced = splitFrontmatter('---json\n{"title": "Handbuch"}\n---\nText');
  assert.equal(fenced.kind, 'json');
  assert.deepEqual(fenced.data, { title: 'Handbuch' });
});
test('Windows line ends', () => {
  const fm = splitFrontmatter('---\r\ntitle: Handbuch\r\nversion: 3\r\n---\r\n# Titel\r\n');
  assert.equal(fm.kind, 'yaml');
  assert.deepEqual(plain(fm.data), { title: 'Handbuch', version: '3' });
  assert.equal(fm.body, '# Titel\r\n');
});

// ---------- what is not frontmatter: the source stays as it is ----------
const untouched = (name, src) => test('not frontmatter: ' + name, () => {
  const fm = splitFrontmatter(src);
  assert.equal(fm.kind, null);
  assert.equal(fm.body, src);
  assert.equal(fm.raw, '');
});
untouched('no block at all', '# Titel\n\nText.\n');
untouched('an empty source', '');
untouched('a document that opens with a thematic break', '---\n\n# Titel\n');
untouched('one prose line between two breaks', '---\nNote: this is a draft.\n---\nText');
untouched('prose without a key between two breaks', '---\nSome intro.\n---\nText');
untouched('an empty block without a fence', '---\n---\nText');
untouched('a block that is never closed', '---\ntitle: x\nversion: 1\n\nText ohne Ende.\n');
untouched('an unclosed block that runs into prose and a later break',
  '---\ntitle: x\nversion: 1\n\nEin Absatz, der zum Dokument gehört.\n\n---\n\nMehr Text.\n');
untouched('a fence dokufix does not know', '---toml\ntitle = "x"\n---\nText');
untouched('a block that does not start on the first line', '\n---\ntitle: x\nversion: 1\n---\nText');
test('not a string: the value comes back as the body', () => {
  assert.deepEqual(splitFrontmatter(undefined), { raw: '', kind: null, data: null, body: undefined });
});
test('one recognised key is enough, one unknown key is not', () => {
  assert.equal(splitFrontmatter(doc('title: Handbuch')).kind, 'yaml');
  assert.equal(splitFrontmatter(doc('Title: Handbuch')).kind, 'yaml');
  assert.equal(splitFrontmatter(doc('status: Entwurf')).kind, null);
  assert.equal(splitFrontmatter(doc('status: Entwurf\nstand: heute')).kind, 'yaml');
});
test('an explicit but empty header is consumed and shows nothing', () => {
  const fm = splitFrontmatter('---json\n---\nText');
  assert.equal(fm.kind, null);
  assert.equal(fm.data, null);
  assert.equal(fm.body, 'Text');
});

// ---------- fail loudly: the raw block, never half of it ----------
// A block that is frontmatter and cannot be read comes back as kind 'raw': no
// data, the original text, the reason, and the body untouched.
function unreadable(name, header, reason, fence = ''){
  test('shown raw: ' + name, () => {
    const src = '---' + fence + '\n' + header + '\n---\n# Titel\n';
    const fm = splitFrontmatter(src);
    assert.equal(fm.kind, 'raw', JSON.stringify(fm));
    assert.equal(fm.data, null);
    assert.equal(fm.raw, header + '\n');
    assert.equal(fm.body, '# Titel\n');
    assert.match(fm.error, reason);
  });
}
// The five of the README. Four are refused …
unreadable('README 1, a key that stands twice', 'title: A\ntitle: B', /duplicate key: title/);
unreadable('README 3, a flow collection under an explicit ---yaml fence', '{a: 1}', /flow collections are not supported/, 'yaml');
unreadable('README 4, a sequence of maps whose key has a space', 'title: x\nleute:\n  - Autor Name: Ben', /sequences of maps are not supported/);
unreadable('README 5, an escape the parser does not decode', 'title: "caf\\u00e9"', /unsupported escape sequence: \\u/);
// … and the fifth is kept: "__proto__" used to vanish through the setter of
// Object.prototype. On a map without a prototype it is a key like any other.
test('README 2, the key __proto__ is an entry of its own and reaches no prototype', () => {
  const fm = splitFrontmatter(doc('title: x\n__proto__: y'));
  assert.equal(fm.kind, 'yaml');
  assert.deepEqual(Object.keys(fm.data), ['title', '__proto__']);
  assert.equal(fm.data['__proto__'], 'y');
  assert.equal(Object.getPrototypeOf(fm.data), null);
  assert.equal({}.y, undefined);
});
// The rest of the subset's border.
unreadable('a sequence of maps written across two lines', 'title: x\nleute:\n  -\n    name: Ben', /sequences of maps are not supported/);
unreadable('a block scalar', 'title: x\ntext: |\n  Zeile', /block scalars are not supported/);
unreadable('an anchor', 'title: x\nbasis: &a wert', /anchors and aliases are not supported/);
unreadable('a tag', 'title: x\nzahl: !!str 3', /tags are not supported/);
unreadable('a flow collection as a value', 'title: x\ntags: [a, b]', /flow collections are not supported/);
unreadable('tab indentation', 'title: x\nfreigabe:\n\trolle: y', /tab indentation is not supported/);
unreadable('an indentation that fits no level', 'title: x\nfreigabe:\n    rolle: y\n  frist: z', /indentation/);
unreadable('a quote that never closes', 'title: "offen', /unterminated quoted scalar/);
unreadable('text behind a closed quote', 'title: "zu" und mehr', /trailing content after quoted scalar/);
unreadable('a line that is neither entry nor item', 'title: x\nnur ein Wort', /unsupported line/);
unreadable('JSON that does not parse', '{"title": }', /./, 'json');
unreadable('JSON that is no object', '[1, 2]', /not a JSON object/, 'json');
unreadable('an empty JSON object', '{}', /empty mapping/);
test('multi-document streams are not supported: the first block is the header, the rest is body', () => {
  const fm = splitFrontmatter('---\na: 1\nb: 2\n---\nc: 3\n---\n');
  assert.deepEqual(plain(fm.data), { a: '1', b: '2' });
  assert.equal(fm.body, 'c: 3\n---\n');
});

// ---------- the title ----------
test('deriveDocTitle reads the first heading of the body, not a comment of the header', () => {
  assert.equal(deriveDocTitle(doc('# interner Entwurf\ntitle: x', '# Handbuch  \n\nText'), 'ohne'), 'Handbuch');
  assert.equal(deriveDocTitle('Text\n\n# Später\n', 'ohne'), 'Später');
  assert.equal(deriveDocTitle('Text ohne Überschrift\n## Nur zweite Ebene', 'ohne'), 'ohne');
  assert.equal(deriveDocTitle(doc('title: Aus dem Kopf', 'Text'), ' ohne '), 'ohne');
});
