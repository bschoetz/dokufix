// The XML parser of the BPMN layout, run in Node: no browser.
//
//   npm test          (node --test tests/*.test.mjs)
//   node tests/xml-parser.test.mjs --write
//                     writes the expected results of the corpus anew, after
//                     an intended change: git diff shows each change
//
// src/app/xml-parser.js reads the author's XML the way Chromium does, so that
// the layout gets the same model in Node as in every browser. The cases:
//   - the corpus of spike lmm/parsing (tests/fixtures/xml-parser/, INDEX.md
//     there says what each file tests): per file, whether the parser rejects
//     it, with the kind and place of the error, or what readProcess() reads
//     from it. tests/fixtures/xml-parser/expected.json holds it, frozen from
//     what Chromium read in the spike (spikes/lmm/parsing/ergebnisse/,
//     environment chromium), but where DIFFERS below says why it differs;
//     text-kommentar and cdata-zeilenumbruch came with the review of
//     2026-10-07, after the spike: their text nodes as Chromium gives them
//     (measured in the review), their note as bpmn-moddle reads it;
//   - what the corpus does not show on its own: a run of text and references
//     is one text node and a CDATA section one of its own, the error's code,
//     line and column, a deep document, the namespaces of elements and
//     attributes.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXml, XmlError, XML_ERROR_CODES } from '../src/app/xml-parser.js';
import { readProcess } from '../src/app/bpmn-layout.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(here, 'fixtures/xml-parser');
const EXPECTED = path.join(DIR, 'expected.json');

// Where the parser, or readProcess() on what it reads, differs from what
// Chromium read in the spike, and why. Everything else in expected.json is
// what Chromium read.
const DIFFERS = {
  'doctype-leer': 'a DOCTYPE is an error (Ben, 2026-10-07); Chromium reads it',
  'doctype-intern': 'a DOCTYPE is an error (Ben, 2026-10-07); Chromium expands its internal entities, bpmn-js does not',
  'doctype-extern-inhalt': 'a DOCTYPE is an error (Ben, 2026-10-07); Chromium drops the reference to the external entity in the content without a word',
  'cdata-mit-leerraum': 'the text of a note leaves out the text nodes that are blanks only, as bpmn-js does; Chromium keeps them',
  'text-mit-kindelement': 'the text of a note joins the text nodes of <text>, not the text of an element in it ("Vorn  hinten"); bpmn-js cannot open the file at all',
  'fremde-elemente': 'elements are read by their namespace, as bpmn-js reads them: a signavio:task is no task, so no task stands outside a lane; read by its local name, it made readProcess() throw',
  'praefix-falscher-namensraum': 'elements are read by their namespace, as bpmn-js reads them: definitions of another namespace are no BPMN (null)',
};

// What the parser and readProcess() make of one file: rejected (with the
// error's code, line and column), null (no BPMN definitions), error
// (readProcess() throws, with its message) or ok (with the model and what is
// left out).
function result(xml){
  let doc;
  try { doc = parseXml(xml); }
  catch (e){
    if (!(e instanceof XmlError)) throw e;
    return { status: 'rejected', code: e.code, line: e.line, column: e.column };
  }
  let read;
  try { read = readProcess(doc); }
  catch (e){ return { status: 'error', message: e.message }; }
  return read ? { status: 'ok', model: read.model, leftOut: read.leftOut } : { status: 'null' };
}

const cases = () => fs.readdirSync(DIR).filter(f => f.endsWith('.bpmn')).map(f => f.replace(/\.bpmn$/, '')).sort();
const resultOf = name => JSON.parse(JSON.stringify(result(fs.readFileSync(path.join(DIR, name + '.bpmn'), 'utf8'))));

if (process.argv.includes('--write')){
  const out = {};
  for (const name of cases()) out[name] = { ...(DIFFERS[name] ? { differs: DIFFERS[name] } : {}), ...resultOf(name) };
  fs.writeFileSync(EXPECTED, JSON.stringify(out, null, 1) + '\n');
  console.log(Object.keys(out).length + ' cases written to ' + path.relative(process.cwd(), EXPECTED));
} else {
  const expected = JSON.parse(fs.readFileSync(EXPECTED, 'utf8'));

  test('the corpus: every file has its expectation, and every deviation from Chromium its reason', () => {
    assert.deepEqual(Object.keys(expected).sort(), cases());
    for (const [name, e] of Object.entries(expected)) assert.equal(e.differs, DIFFERS[name], name);
  });

  for (const name of cases()) test('corpus ' + name + ': read as expected', () => {
    const { differs, ...want } = expected[name] || {};
    void differs;
    assert.deepEqual(resultOf(name), want);
  });

  test('a run of text and references is one text node, a CDATA section one of its own', () => {
    const t = parseXml('<a>x &amp; &#65;<![CDATA[ <y> ]]>z</a>').documentElement;
    assert.deepEqual(t.childNodes.map(k => [k.nodeType, k.data]), [[3, 'x & A'], [4, ' <y> '], [3, 'z']]);
    assert.equal(t.textContent, 'x & A <y> z');
  });

  test('a comment or a PI ends a text node, though neither is kept, as in a browser', () => {
    const t = parseXml('<a>\n  <!-- c -->\n  x<?p?>y</a>').documentElement;
    assert.deepEqual(t.childNodes.map(k => k.data), ['\n  ', '\n  x', 'y']);
  });

  test('attribute values: references resolved, line breaks and tabs normalised, \\r\\n read as \\n', () => {
    const a = parseXml('<a n="A &amp; B&#10;C\td\r\ne" m=\'&quot;&#x1F600;\'/>').documentElement;
    assert.equal(a.getAttribute('n'), 'A & B\nC d e');
    assert.equal(a.getAttribute('m'), '"😀');
    assert.equal(a.getAttribute('x'), null);
  });

  test('namespaces: the default one and prefixes resolved, attributes without a prefix in none', () => {
    const NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
    const doc = parseXml('<definitions xmlns="' + NS + '" xmlns:b="' + NS + '" xmlns:x="urn:x"><b:task id="T" x:y="1"/><x:task/></definitions>');
    const [task, other] = doc.documentElement.children;
    assert.deepEqual([doc.documentElement.namespaceURI, task.namespaceURI, task.localName, task.nodeName, other.namespaceURI], [NS, NS, 'task', 'b:task', 'urn:x']);
    assert.deepEqual(task.attributes.map(a => [a.name, a.namespaceURI]), [['id', null], ['x:y', 'urn:x']]);
    assert.equal(task.parentElement, doc.documentElement);
  });

  test('an error: an XmlError with its code, line and column, the place in the message', () => {
    const cases = [
      ['<a>\n  <b></a>', 'tag', 2, 6],
      ['<a>&nbsp;</a>', 'reference', 1, 4],
      ['<!DOCTYPE a>\n<a/>', 'doctype', 1, 1],
      ['<a/>\n<b/>', 'structure', 2, 1],
      ['', 'structure', 1, 1],
      ['<a b="1" b="2"/>', 'attribute', 1, 10],
      ['<x:a/>', 'namespace', 1, 1],
      ['<a>\u0007</a>', 'char', 1, 4],
      ['<?xml version="2.0"?><a/>', 'declaration', 1, 1],
      ['<?xml\u00A0version="1.0"?><a/>', 'declaration', 1, 1],
      ['<a b:x="1" c:x="2" xmlns:b="u" xmlns:c="u"/>', 'attribute', 1, 1],
      ['<a xmlns="http://www.w3.org/XML/1998/namespace"/>', 'namespace', 1, 4],
      ['<a xmlns="http://www.w3.org/2000/xmlns/"/>', 'namespace', 1, 4],
      ['<a xmlns:p="http://www.w3.org/2000/xmlns/"/>', 'namespace', 1, 4],
    ];
    for (const [xml, code, line, column] of cases){
      assert.throws(() => parseXml(xml), e => e instanceof XmlError && e.code === code && e.line === line && e.column === column &&
        e.message.startsWith('error on line ' + line + ' at column ' + column + ': ') && XML_ERROR_CODES.includes(e.code), JSON.stringify(xml));
    }
  });

  test('XML 1.1 is read as 1.0, as Chromium does; a byte order mark is passed over', () => {
    assert.equal(parseXml('﻿<?xml version="1.1"?><a/>').declaration.version, '1.1');
    assert.equal(parseXml('﻿<a/>').documentElement.nodeName, 'a');
  });

  test('a document 100 000 elements deep: read without overflowing the stack', () => {
    const depth = 100000;
    const doc = parseXml('<a>'.repeat(depth) + 'x' + '</a>'.repeat(depth));
    assert.equal(doc.documentElement.textContent, 'x');
  });
}
