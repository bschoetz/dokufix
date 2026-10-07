// The licence information, run in Node: no browser, no page.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/licences.js is a module of pure logic, so this file imports it as it
// is. It holds the one list of notices behind the link "license information":
// what a dokufix file loads or carries, in which version, under which licence,
// with which copyright lines. The cases:
//
//   - the list is complete: the seven entries, each with every field, and the
//     copyright lines as their projects publish them;
//   - the versions are the ones the file really uses: every jsDelivr npm URL
//     in src/index.html, whatever tag it stands in, the Octicons version
//     named in src/doc.css, the diagram-js version the label measurer
//     follows (src/app/label-size.js) and the Mermaid version LMM replicates
//     (src/app/lmm.js). Raise one of those and leave the list
//     alone, and the case fails and names the entry. Not covered: a library
//     from another host, and one the script itself would import or load;
//   - every licence an entry names has its text, the bpmn.io licence in the
//     wording of the package;
//   - the markup: a closed <details>, no <script>, every text escaped;
//   - the built file holds every copyright line.
//
// Where the link stands and that the view opens in a browser is checked by
// tests/vergleich.mjs, in all four variants.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { NOTICES, LICENCE_TEXTS, LICENCES_CLASS, LICENCES_LINK_TEXT, licencesHtml } from '../src/app/licences.js';
// The Mermaid version whose layering LMM replicates for the columns of BPMN without coordinates.
import { LMM_MERMAID_VERSION } from '../src/app/lmm.js';
// The diagram-js whose text layout the label measurer replicates, and the bpmn-js that bundles it.
import { LABEL_SIZE_VERSION } from '../src/app/label-size.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(here, '..', name), 'utf8');

// The element as a browser would hold it.
function parsed(html){
  const { document } = parseHTML('<!DOCTYPE html><html><body>' + html + '</body></html>');
  return document.body;
}

// ---------- the list ----------
// As published, fetched 2026-10-02 from jsDelivr and GitHub. A second copy on
// purpose: a line changed by accident in the list does not pass.
const PUBLISHED = {
  'marked': { package: 'marked', use: 'cdn', licence: 'MIT', copyright: [
    'Copyright (c) 2018+, MarkedJS (https://github.com/markedjs/)',
    'Copyright (c) 2011-2018, Christopher Jeffrey (https://github.com/chjj/)',
  ] },
  'marked-footnote': { package: 'marked-footnote', use: 'cdn', licence: 'MIT', copyright: [
    'Copyright (c) 2023-2024 Stilearning (https://stilearning.com)',
  ] },
  'Mermaid': { package: 'mermaid', use: 'cdn', licence: 'MIT', copyright: [
    'Copyright (c) 2014 - 2022 Knut Sveidqvist',
  ] },
  // The file LICENSE of the package, fetched 2026-10-03 from jsDelivr.
  'bpmn-js': { package: 'bpmn-js', use: 'cdn', licence: 'bpmn.io', copyright: [
    'Copyright (c) 2014-present Camunda Services GmbH',
  ] },
  // The file LICENSE of diagram-js@15.28.0, from the package (npm pack, 2026-10-07).
  'diagram-js': { package: 'diagram-js', use: 'embedded', licence: 'MIT', copyright: [
    'Copyright (c) 2014-present Camunda Services GmbH',
  ] },
  // The file LICENSE of mermaid@12.0.0, as the entry of Mermaid.
  "Mermaid's swimlane layout": { package: 'mermaid', use: 'embedded', licence: 'MIT', copyright: [
    'Copyright (c) 2014 - 2022 Knut Sveidqvist',
  ] },
  'Octicons': { package: '@primer/octicons', use: 'embedded', licence: 'MIT', copyright: [
    'Copyright (c) 2026 GitHub Inc.',
  ] },
};

test('the list has the seven entries, in this order', () => {
  assert.deepEqual(NOTICES.map(n => n.name), ['marked', 'marked-footnote', 'Mermaid', 'bpmn-js', 'diagram-js', "Mermaid's swimlane layout", 'Octicons']);
});

test('every entry is complete: name, package, version, licence, copyright lines, how it gets into a file', () => {
  for (const n of NOTICES){
    const where = 'entry "' + n.name + '"';
    assert.deepEqual(Object.keys(n).sort(), ['copyright', 'licence', 'name', 'package', 'use', 'version'], where + ': its fields');
    for (const key of ['name', 'package', 'version', 'licence']){
      assert.ok(typeof n[key] === 'string' && n[key].trim() === n[key] && n[key].length > 0, where + ': ' + key + ' is a text');
    }
    assert.match(n.version, /^\d+\.\d+\.\d+$/, where + ': the version is an exact one');
    assert.ok(['cdn', 'embedded'].includes(n.use), where + ': use is "cdn" or "embedded"');
    assert.ok(Array.isArray(n.copyright) && n.copyright.length > 0, where + ': at least one copyright line');
    for (const line of n.copyright) assert.match(line, /^Copyright \(c\) \d{4}/, where + ': a copyright line with its year');
  }
});

test('the entries say what their projects publish', () => {
  for (const n of NOTICES){
    const want = PUBLISHED[n.name];
    assert.ok(want, 'entry "' + n.name + '" is not one this test knows; add what its project publishes to PUBLISHED');
    assert.deepEqual({ package: n.package, use: n.use, licence: n.licence, copyright: n.copyright }, want, 'entry "' + n.name + '"');
  }
});

// ---------- the versions ----------
// What the sources pin: every package the page names on jsDelivr's npm path,
// with its version, the Octicons version in the comment of src/doc.css, the
// diagram-js version the label measurer follows (LABEL_SIZE_VERSION of
// src/app/label-size.js, in layout) and the Mermaid version LMM replicates
// (LMM_MERMAID_VERSION of src/app/lmm.js, in layout as mermaid). That one is
// no pin of the page: the Mermaid the page loads for the Mermaid diagrams may
// be raised alone, LMM stays a replica of 12.0.0. Every such URL in
// src/index.html counts, whatever the tag and the attribute it stands in:
// <script src>, <link href>, with other attributes in front, in a comment. A
// URL without a version counts as version "none", so it cannot agree with an
// entry. Not seen: a library from another host, and one the script itself
// imports or loads; nothing does that today.
const LAYOUT_VERSIONS = { mermaid: LMM_MERMAID_VERSION, ...LABEL_SIZE_VERSION };
function pinned(indexHtml, docCss, layout = LAYOUT_VERSIONS){
  const cdn = [];
  for (const m of indexHtml.matchAll(/cdn\.jsdelivr\.net\/npm\/((?:@[\w.-]+\/)?[\w.-]+?)(?:@([^/"'\s<>]+))?(?=[/"'\s<>])/g)){
    const pin = { package: m[1], version: m[2] || 'none', where: 'src/index.html' };
    if (!cdn.some(x => x.package === pin.package && x.version === pin.version)) cdn.push(pin);
  }
  const octicons = docCss.match(/@primer\/octicons (\d+\.\d+\.\d+)/);
  const embedded = [...(octicons ? [{ package: '@primer/octicons', version: octicons[1], where: 'src/doc.css' }] : []),
                    { package: 'diagram-js', version: layout['diagram-js'], where: 'src/app/label-size.js' },
                    { package: 'mermaid', version: layout.mermaid, where: 'src/app/lmm.js' }];
  return { cdn, embedded };
}
// Every way the list and the sources can disagree, each as one sentence that
// names the entry. And a guard: the bpmn-js the page pins is the one the
// label measurer follows, raised only together with the check of the measurer
// against it (npm run labels), and then LABEL_SIZE_VERSION with it. Mermaid
// has no such guard since LMM gives the columns of BPMN without coordinates
// (src/app/lmm.js): the page's Mermaid draws only the Mermaid diagrams. A
// package with two entries, Mermaid loaded and Mermaid carried, is matched to
// the entry of the same use.
function versionProblems(notices, indexHtml, docCss, layout = LAYOUT_VERSIONS){
  const pins = pinned(indexHtml, docCss, layout);
  const problems = [];
  for (const bpmn of pins.cdn.filter(pin => pin.package === 'bpmn-js' && pin.version !== layout['bpmn-js'])){
    problems.push('src/index.html pins bpmn-js ' + bpmn.version + ', and the labels of BPMN without coordinates are measured as bpmn-js ' + layout['bpmn-js'] +
      ' draws them (LABEL_SIZE_VERSION, src/app/label-size.js): raise both together, with the check of the measurer against bpmn-js (npm run labels)');
  }
  for (const use of ['cdn', 'embedded']){
    for (const pin of pins[use]){
      const n = notices.find(x => x.package === pin.package && x.use === use) || notices.find(x => x.package === pin.package);
      if (!n) problems.push(pin.where + ' uses ' + pin.package + ' ' + pin.version + ', and the list has no entry for it');
      else if (n.use !== use) problems.push('entry "' + n.name + '": the list says "' + n.use + '", but ' + pin.where + ' has it as "' + use + '"');
      else if (n.version !== pin.version) problems.push('entry "' + n.name + '": the list says ' + n.version + ', ' + pin.where + ' uses ' + pin.version);
    }
    for (const n of notices.filter(x => x.use === use)){
      if (!pins[use].some(pin => pin.package === n.package)) problems.push('entry "' + n.name + '": ' + (use === 'cdn' ? 'src/index.html' : 'no source') + ' does not name ' + n.package);
    }
  }
  return problems;
}

test('the sources pin four libraries on the CDN, the Octicons, the text layout of diagram-js and the layering of Mermaid', () => {
  const pins = pinned(read('src/index.html'), read('src/doc.css'));
  assert.deepEqual(pins.cdn.map(p => p.package), ['marked', 'marked-footnote', 'mermaid', 'bpmn-js']);
  assert.deepEqual(pins.embedded.map(p => [p.package, p.where]), [['@primer/octicons', 'src/doc.css'], ['diagram-js', 'src/app/label-size.js'], ['mermaid', 'src/app/lmm.js']]);
});

test('every version in the list is the one the sources use', () => {
  assert.deepEqual(versionProblems(NOTICES, read('src/index.html'), read('src/doc.css')), []);
});

test('a version raised in the sources and not in the list is reported with the entry\'s name', () => {
  const indexHtml = read('src/index.html'), docCss = read('src/doc.css');
  const raisedCdn = indexHtml.replace('/npm/mermaid@12.0.0/', '/npm/mermaid@12.0.1/');
  assert.notEqual(raisedCdn, indexHtml, 'mutation target not found');
  assert.deepEqual(versionProblems(NOTICES, raisedCdn, docCss), ['entry "Mermaid": the list says 12.0.0, src/index.html uses 12.0.1']);
  const raisedIcons = docCss.replace('@primer/octicons 19.38.0', '@primer/octicons 19.39.0');
  assert.notEqual(raisedIcons, docCss, 'mutation target not found');
  assert.deepEqual(versionProblems(NOTICES, indexHtml, raisedIcons), ['entry "Octicons": the list says 19.38.0, src/doc.css uses 19.39.0']);
});

test('the Mermaid the page loads and the one LMM replicates are two entries: the page\'s raised alone is reported against the first only, LMM\'s against the second', () => {
  const indexHtml = read('src/index.html'), docCss = read('src/doc.css');
  assert.equal(LMM_MERMAID_VERSION, '12.0.0');
  // The page and its entry raised together: agreed, LMM stays a replica of 12.0.0 (no guard of story 2.8 any more).
  const raised = indexHtml.replace('/npm/mermaid@12.0.0/', '/npm/mermaid@12.1.0/');
  assert.notEqual(raised, indexHtml, 'mutation target not found');
  const list = NOTICES.map(n => n.package === 'mermaid' && n.use === 'cdn' ? { ...n, version: '12.1.0' } : n);
  assert.deepEqual(versionProblems(list, raised, docCss), []);
  // LMM replicated anew from another version, and the list not: its entry is named.
  assert.deepEqual(versionProblems(NOTICES, indexHtml, docCss, { ...LAYOUT_VERSIONS, mermaid: '12.1.0' }),
    ['entry "Mermaid\'s swimlane layout": the list says 12.0.0, src/app/lmm.js uses 12.1.0']);
  // Without its entry, the part of Mermaid the file carries is reported.
  assert.deepEqual(versionProblems(NOTICES.filter(n => !(n.package === 'mermaid' && n.use === 'embedded')), indexHtml, docCss),
    ['entry "Mermaid": the list says "cdn", but src/app/lmm.js has it as "embedded"']);
});

test('the bpmn-js pin and the version the label measurer follows are one: raising either alone is reported, and so is a diagram-js the list does not know', () => {
  const indexHtml = read('src/index.html'), docCss = read('src/doc.css');
  assert.deepEqual(LABEL_SIZE_VERSION, { 'diagram-js': '15.28.0', 'bpmn-js': '18.31.0' });
  // The page and the list raised, the measurer not: the guard alone speaks.
  const raised = indexHtml.replace('/npm/bpmn-js@18.31.0/', '/npm/bpmn-js@18.32.0/');
  assert.notEqual(raised, indexHtml, 'mutation target not found');
  const list = NOTICES.map(n => n.package === 'bpmn-js' ? { ...n, version: '18.32.0' } : n);
  assert.deepEqual(versionProblems(list, raised, docCss), [
    'src/index.html pins bpmn-js 18.32.0, and the labels of BPMN without coordinates are measured as bpmn-js 18.31.0 draws them (LABEL_SIZE_VERSION, src/app/label-size.js): raise both together, with the check of the measurer against bpmn-js (npm run labels)']);
  // The measurer raised with them: agreed. Its diagram-js raised too, and the list not: the entry is named.
  assert.deepEqual(versionProblems(list, raised, docCss, { ...LAYOUT_VERSIONS, 'bpmn-js': '18.32.0' }), []);
  assert.deepEqual(versionProblems(list, raised, docCss, { ...LAYOUT_VERSIONS, 'bpmn-js': '18.32.0', 'diagram-js': '15.29.0' }),
    ['entry "diagram-js": the list says 15.28.0, src/app/label-size.js uses 15.29.0']);
});

test('a library the page loads and the list does not name is reported, and so is an entry the sources do not know', () => {
  const indexHtml = read('src/index.html'), docCss = read('src/doc.css');
  const more = indexHtml.replace('<script src="https://cdn.jsdelivr.net/npm/mermaid@', '<script src="https://cdn.jsdelivr.net/npm/dmn-js@17.4.0/dist/dmn-viewer.production.min.js"></script>\n<script src="https://cdn.jsdelivr.net/npm/mermaid@');
  assert.notEqual(more, indexHtml, 'mutation target not found');
  assert.deepEqual(versionProblems(NOTICES, more, docCss), ['src/index.html uses dmn-js 17.4.0, and the list has no entry for it']);
  const less = indexHtml.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/marked-footnote@[^>]*><\/script>\n/, '');
  assert.notEqual(less, indexHtml, 'mutation target not found');
  assert.deepEqual(versionProblems(NOTICES, less, docCss), ['entry "marked-footnote": src/index.html does not name marked-footnote']);
});

test('a jsDelivr URL counts in whatever tag and attribute it stands: a stylesheet, a script with attributes in front, a URL without a version', () => {
  const indexHtml = read('src/index.html'), docCss = read('src/doc.css');
  const withTag = tag => {
    const changed = indexHtml.replace('</head>', tag + '\n</head>');
    assert.notEqual(changed, indexHtml, 'mutation target not found');
    return versionProblems(NOTICES, changed, docCss);
  };
  assert.deepEqual(withTag('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/diagram-js@15.4.0/assets/diagram-js.css">'),
    ['entry "diagram-js": the list says "embedded", but src/index.html has it as "cdn"'], 'diagram-js is on the list as the embedded text layout');
  assert.deepEqual(withTag('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/dmn-js-shared@17.4.0/dist/assets/dmn-js-shared.css">'),
    ['src/index.html uses dmn-js-shared 17.4.0, and the list has no entry for it']);
  assert.deepEqual(withTag('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bpmn-js@18.6.2/dist/assets/bpmn-js.css">'),
    ['src/index.html pins bpmn-js 18.6.2, and the labels of BPMN without coordinates are measured as bpmn-js 18.31.0 draws them (LABEL_SIZE_VERSION, src/app/label-size.js): raise both together, with the check of the measurer against bpmn-js (npm run labels)',
     'entry "bpmn-js": the list says 18.31.0, src/index.html uses 18.6.2']);
  assert.deepEqual(withTag('<script defer src="https://cdn.jsdelivr.net/npm/@scope/some.lib@1.2.3/dist/index.min.js"></script>'),
    ['src/index.html uses @scope/some.lib 1.2.3, and the list has no entry for it']);
  assert.deepEqual(withTag("<link rel='stylesheet' href='//cdn.jsdelivr.net/npm/mermaid@12.0.1/dist/mermaid.css'>"),
    ['entry "Mermaid": the list says 12.0.0, src/index.html uses 12.0.1']);
  assert.deepEqual(withTag('<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>'),
    ['entry "marked": the list says 18.0.14, src/index.html uses none']);
});

// ---------- the licence texts ----------
test('every licence an entry names has its text', () => {
  for (const n of NOTICES){
    const text = LICENCE_TEXTS[n.licence];
    assert.ok(text, 'entry "' + n.name + '": no text for the licence "' + n.licence + '"');
    assert.ok(typeof text.title === 'string' && text.title.length > 0, n.licence + ': a title');
    assert.ok(Array.isArray(text.paragraphs) && text.paragraphs.length > 0 && text.paragraphs.every(p => typeof p === 'string' && p.length > 0), n.licence + ': its paragraphs');
  }
});

test('the MIT text is the permission notice in its wording', () => {
  const { title, paragraphs } = LICENCE_TEXTS.MIT;
  assert.equal(title, 'MIT License');
  assert.equal(paragraphs.length, 3);
  assert.ok(paragraphs[0].startsWith('Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction,'));
  assert.ok(paragraphs[0].endsWith('and to permit persons to whom the Software is furnished to do so, subject to the following conditions:'));
  assert.equal(paragraphs[1], 'The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.');
  assert.ok(paragraphs[2].startsWith('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,'));
  assert.ok(paragraphs[2].endsWith('ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.'));
  // The whole notice, by its hash: the paragraphs joined by a blank, white space
  // as single blanks. The value was taken on 2026-10-02 from the text here after
  // it was found, in that form, in the licence files of esbuild, ESLint and
  // globals under node_modules/.
  const notice = paragraphs.join(' ').replace(/\s+/g, ' ').trim();
  assert.equal(crypto.createHash('sha256').update(notice).digest('hex'), 'fe2a9817987f862eaced948f0468c7f51d2fedfc48c5c505b246a49a3870e9a5');
});

test('the bpmn.io text is the file LICENSE of bpmn-js 18.31.0, without its copyright line', () => {
  const { title, paragraphs } = LICENCE_TEXTS['bpmn.io'];
  assert.equal(title, 'bpmn.io License');
  assert.equal(paragraphs.length, 4);
  assert.ok(paragraphs[2].startsWith('The source code responsible for displaying the bpmn.io project watermark that links back to https://bpmn.io'));
  // The hash of the file's text after its first line, white space as single
  // blanks, taken on 2026-10-03 from the file as jsDelivr serves it.
  const notice = paragraphs.join(' ').replace(/\s+/g, ' ').trim();
  assert.equal(crypto.createHash('sha256').update(notice).digest('hex'), 'd133530f730832895cdd8652d1858a6fdadb61838ff75cae4c6c75047089ec13');
});

// ---------- the markup ----------
test('the markup is one closed <details> whose summary is the link', () => {
  const html = licencesHtml();
  assert.ok(html.startsWith('<details class="' + LICENCES_CLASS + '"><summary>' + LICENCES_LINK_TEXT + '</summary>'), html.slice(0, 80));
  assert.ok(html.endsWith('</div></details>'));
  assert.equal(LICENCES_LINK_TEXT, 'license information');
  const body = parsed(html);
  assert.equal(body.children.length, 1, 'one element');
  const details = body.firstElementChild;
  assert.equal(details.tagName, 'DETAILS');
  assert.equal(details.hasAttribute('open'), false, 'closed');
  assert.deepEqual(Array.from(details.attributes).map(a => a.name), ['class'], 'no attribute but its class: not open, not marked transient');
  assert.deepEqual(Array.from(details.children).map(k => k.tagName + (k.className ? '.' + k.className : '')), ['SUMMARY', 'DIV.dokufix-licences-view']);
  assert.equal(details.firstElementChild.textContent, 'license information');
});

test('the markup has no <script>, no style and no handler', () => {
  const html = licencesHtml();
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /\son\w+=|\sstyle=/i);
  assert.equal(parsed(html).querySelectorAll('script, style, link, a, button, h1, h2, h3, h4, h5, h6').length, 0);
});

test('the view names every entry with version, licence and copyright lines, and each licence text once', () => {
  const view = parsed(licencesHtml()).querySelector('.dokufix-licences-view');
  const items = Array.from(view.querySelectorAll('ul > li'));
  assert.equal(items.length, NOTICES.length);
  NOTICES.forEach((n, i) => {
    const text = items[i].textContent;
    assert.equal(items[i].querySelector('strong').textContent, n.name);
    assert.ok(text.includes(n.version), n.name + ': its version');
    assert.ok(text.includes(LICENCE_TEXTS[n.licence].title), n.name + ': its licence');
    for (const line of n.copyright) assert.ok(text.includes(line), n.name + ': ' + line);
  });
  assert.ok(items[NOTICES.findIndex(n => n.name === 'Octicons')].textContent.includes('@primer/octicons'), 'the Octicons with the name of their package');
  const whole = view.textContent;
  assert.ok(whole.includes('The dokufix editor loads marked, marked-footnote, Mermaid and bpmn-js from a CDN; the file itself carries diagram-js, Mermaid\'s swimlane layout and Octicons.'), whole.slice(0, 200));
  for (const key of ['MIT', 'bpmn.io']){
    const title = LICENCE_TEXTS[key].title;
    assert.equal(whole.split(title).length - 1, NOTICES.filter(n => n.licence === key).length + 1, title + ': once per entry, once above its text');
    for (const p of LICENCE_TEXTS[key].paragraphs) assert.ok(whole.includes(p), key + ': ' + p.slice(0, 40));
  }
  assert.equal(whole.split('Permission is hereby granted').length - 1, 2, 'the permission notice once per licence text');
});

test('every text is escaped', () => {
  // The licence texts carry quotation marks.
  const html = licencesHtml();
  assert.ok(html.includes('&quot;AS IS&quot;') && !html.includes('"AS IS"'));
  // A list that carries markup: it arrives as text.
  const notices = [{ name: '<script>alert(1)</script>', package: 'a&b<i>', version: '1"2', licence: 'X', use: 'embedded', copyright: ['<b>©</b> & "co"'] }];
  const texts = { X: { title: '<em>T</em>', paragraphs: ['a < b > c & "d" \'e\''] } };
  const odd = licencesHtml(notices, texts);
  assert.doesNotMatch(odd, /<script|<b>|<i>|<em>/);
  const body = parsed(odd);
  assert.equal(body.querySelectorAll('script, b, i, em').length, 0);
  const text = body.textContent;
  for (const raw of ['<script>alert(1)</script>', 'a&b<i>', '1"2', '<b>©</b> & "co"', '<em>T</em>', 'a < b > c & "d" \'e\'']){
    assert.ok(text.includes(raw), 'as text: ' + raw);
  }
});

test('an entry whose licence has no text is still shown, with the licence\'s name', () => {
  const html = licencesHtml([{ name: 'x', package: 'x', version: '1.0.0', licence: 'ISC', use: 'cdn', copyright: ['Copyright (c) 2026 X'] }], {});
  const text = parsed(html).textContent;
  assert.ok(text.includes('x 1.0.0, ISC') && text.includes('Copyright (c) 2026 X'), text);
});

// ---------- the built file ----------
test('the built file holds the link\'s text and every copyright line', () => {
  const built = read('dist/dokufix.html');
  assert.ok(built.includes(LICENCES_LINK_TEXT), 'the text of the link');
  for (const n of NOTICES){
    for (const line of n.copyright) assert.ok(built.includes(line), 'entry "' + n.name + '": ' + line);
  }
  assert.ok(built.includes('Permission is hereby granted, free of charge, to any person obtaining a copy'), 'the permission notice');
});
