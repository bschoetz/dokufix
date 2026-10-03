// The downloads below a diagram (story 2.10), run in Node: no browser.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/diagram-downloads.js names the files, writes the source as a data:
// URL, resolves the custom properties of a picture and puts the picture
// button into the line. What needs a page, the picture itself and saving it,
// is checked by the browser runs (tests/vergleich.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { diagramFileName, diagramFileNames, sourceDataUrl, resolveCustomProperties, downloadsLine, attachSvgDownloads,
  DOWNLOADS_CLASS, DOWNLOADS_LABEL, FILE_NAME_DEFAULT } from '../src/app/diagram-downloads.js';
import { TRANSIENT_ATTR } from '../src/app/transient.js';

// ---------- names ----------
test('a title becomes a file name as a download\'s name does: what a file name cannot take and blanks are "-"', () => {
  assert.equal(diagramFileName('Rückgabe am Automaten'), 'Rückgabe-am-Automaten');
  assert.equal(diagramFileName('Frist: 2/3 erreicht?'), 'Frist--2-3-erreicht-');
  // "%" too: Firefox saves it as "_", Chromium keeps it.
  assert.equal(diagramFileName('Herunterladen: Gebühr 5 %/Tag?'), 'Herunterladen--Gebühr-5---Tag-');
  assert.equal(diagramFileName('a<b>c"d\\e|f*g\th'), 'a-b-c-d-e-f-g-h');
  assert.equal(diagramFileName('x'.repeat(100)).length, 80);
  assert.equal(diagramFileName(''), FILE_NAME_DEFAULT);
  assert.equal(FILE_NAME_DEFAULT, 'Diagramm');
});

test('the same title twice: the second gets -2, the third -3, compared without regard to case', () => {
  assert.deepEqual(diagramFileNames(['Ablauf', 'Ablauf', 'Rückgabe', 'ablauf']), ['Ablauf', 'Ablauf-2', 'Rückgabe', 'ablauf-3']);
  // A name another title already gives is not taken twice.
  assert.deepEqual(diagramFileNames(['Ablauf-2', 'Ablauf', 'Ablauf']), ['Ablauf-2', 'Ablauf', 'Ablauf-3']);
  // Two titles that only become one name once sanitised.
  assert.deepEqual(diagramFileNames(['A/B', 'A:B']), ['A-B', 'A-B-2']);
  assert.deepEqual(diagramFileNames(['Diagramm', 'Diagramm']), ['Diagramm', 'Diagramm-2']);
  assert.deepEqual(diagramFileNames([]), []);
});

// ---------- the source as a data: URL ----------
const body = url => url.slice(url.indexOf(',') + 1);

test('the source as a data: URL: only what has to be is percent-encoded, and decoding gives the text back', () => {
  const text = 'flowchart LR\r\n  A["5 % & #1 <b>"] --> B[\'Öffnungszeit\']\tß 😀\n';
  const url = sourceDataUrl(text, 'text/plain;charset=utf-8');
  assert.ok(url.startsWith('data:text/plain;charset=utf-8,'));
  assert.equal(decodeURIComponent(body(url)), text);
  // Blanks, letters, digits and the rest of ASCII stay as they are.
  assert.ok(body(url).startsWith('flowchart LR%0D%0A  A[%225 %25 %26 %231 %3Cb%3E%22] --%3E B[%27%C3%96ffnungszeit%27]%09%C3%9F %F0%9F%98%80%0A'), body(url));
  // Nothing the attribute's serialisation would escape, nothing that ends the URL.
  assert.doesNotMatch(body(url), /[&"'<>#\t\n\r]/);
  assert.doesNotMatch(body(url), /[^\x20-\x7e]/);
});

test('the source as a data: URL: control characters are encoded, and blanks at the very end, which a URL parser strips', () => {
  const text = 'a\x00b\x1fc\x7f  d  ';
  const url = sourceDataUrl(text, 'application/xml;charset=utf-8');
  assert.equal(body(url), 'a%00b%1Fc%7F  d%20%20');
  assert.equal(decodeURIComponent(body(url)), text);
  // As a browser reads it: the URL parser and percent-decoding as UTF-8.
  const parsed = new URL(url);
  assert.equal(decodeURIComponent(parsed.pathname.slice(parsed.pathname.indexOf(',') + 1)), text);
});

test('the source as a data: URL: XML with a declaration, namespaces and entities round trips byte for byte', () => {
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D">\n  <bpmn:task id="T" name="Prüfen &amp; buchen"/>\n</bpmn:definitions>\n';
  const url = sourceDataUrl(xml, 'application/xml;charset=utf-8');
  assert.equal(decodeURIComponent(body(url)), xml);
  assert.equal(Buffer.from(decodeURIComponent(body(url)), 'utf8').equals(Buffer.from(xml, 'utf8')), true);
  // About a quarter more: the measure of the spike's files.
  assert.ok(body(url).length < xml.length * 1.5, body(url).length + ' for ' + xml.length);
});

// ---------- custom properties ----------
test('every var() is replaced by the value looked up, or its fallback; one with neither stays', () => {
  const values = { '--dokufix-bpmn-stroke': ' #0066cc', '--dokufix-bpmn-fill': '#fff' };
  const lookup = name => values[name] || '';
  assert.equal(resolveCustomProperties('stroke: var(--dokufix-bpmn-stroke); fill: var(--dokufix-bpmn-fill);', lookup), 'stroke: #0066cc; fill: #fff;');
  assert.equal(resolveCustomProperties('var(--fehlt, #123456)', lookup), '#123456');
  assert.equal(resolveCustomProperties('var( --dokufix-bpmn-fill , red )', lookup), '#fff');
  assert.equal(resolveCustomProperties('var(--fehlt, var(--dokufix-bpmn-stroke))', lookup), '#0066cc');
  assert.equal(resolveCustomProperties('fill: var(--fehlt)', lookup), 'fill: var(--fehlt)');
  assert.equal(resolveCustomProperties('fill: red', lookup), 'fill: red');
});

// ---------- the line ----------
function doc(){
  return parseHTML('<!DOCTYPE html><html><body><article id="root" class="dokufix-doc"></article></body></html>').document;
}

test('the line: a group named "Herunterladen" with the source link, named by its file, the extension as its text', () => {
  const d = doc();
  const line = downloadsLine(d, 'Ablauf-2', { ext: '.bpmn', mime: 'application/xml;charset=utf-8', what: 'BPMN-XML', text: '<a x="1"/>\n' });
  // Attributes compared as sets: linkedom writes them in an order of its own.
  const attrs = el => Object.fromEntries(Array.from(el.attributes).map(a => [a.name, a.value]));
  assert.deepEqual(attrs(line), { class: DOWNLOADS_CLASS, role: 'group', 'aria-label': DOWNLOADS_LABEL });
  assert.equal(line.children.length, 1);
  const link = line.firstElementChild;
  assert.equal(link.tagName, 'A');
  assert.deepEqual(attrs(link), { download: 'Ablauf-2.bpmn', href: 'data:application/xml;charset=utf-8,%3Ca x=%221%22/%3E%0A', title: 'BPMN-XML herunterladen: Ablauf-2.bpmn' });
  assert.equal(link.textContent, '.bpmn');
  assert.equal(DOWNLOADS_LABEL, 'Herunterladen');
});

test('the picture button: added once to every line, transient, behind the source link, named as the source', () => {
  const d = doc();
  const root = d.getElementById('root');
  root.innerHTML = '<figure class="dokufix-diagram"><div class="dokufix-diagram-view"></div>' +
    downloadsLine(d, 'Große-Ansicht-2', { ext: '.mmd', mime: 'text/plain;charset=utf-8', what: 'Mermaid-Text', text: 'flowchart LR\n' }).outerHTML +
    '</figure><figure class="dokufix-diagram"></figure>';
  attachSvgDownloads(root);
  attachSvgDownloads(root);
  const line = root.querySelector('.' + DOWNLOADS_CLASS);
  assert.deepEqual(Array.from(line.children).map(c => c.tagName.toLowerCase() + ' ' + c.textContent), ['a .mmd', 'button .svg']);
  const button = line.querySelector('button');
  assert.equal(button.getAttribute('type'), 'button');
  assert.equal(button.hasAttribute(TRANSIENT_ATTR), true);
  assert.equal(button.getAttribute('title'), 'Bild herunterladen: Große-Ansicht-2.svg');
  // A figure without a line, a warning or a diagram not drawn, gets nothing.
  assert.equal(root.querySelectorAll('button').length, 1);
});

test('the picture button of a figure without an SVG, as in `schlank` when a diagram could not be unpacked: a click saves nothing and says so on the console', () => {
  const d = doc();
  const root = d.getElementById('root');
  root.innerHTML = '<figure class="dokufix-diagram"><div class="dokufix-diagram-svg" data-gz="x"></div>' +
    downloadsLine(d, 'Ablauf', { ext: '.mmd', mime: 'text/plain;charset=utf-8', what: 'Mermaid-Text', text: 'flowchart LR\n' }).outerHTML +
    '</figure>';
  attachSvgDownloads(root);
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    root.querySelector('button').dispatchEvent(new d.defaultView.Event('click'));
  } finally {
    console.error = original;
  }
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no SVG.*Ablauf\.svg/);
  // Nothing was handed to the browser: no link of a download was put into the page.
  assert.equal(d.querySelectorAll('a[download]').length, 1);
});
