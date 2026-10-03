import { escapeHtml } from './html.js';

// --- Licence information ---------------------------------------------------
// What a dokufix file loads or carries that is somebody else's work, and under
// which licence: the list behind the link "license information". It is the one
// place the notices stand in. The editor puts the element into its toolbar and
// into the page of its read mode (registerLicences() in editor.js); every
// read-only export writes it into its own page (the readonly-*.js modules).
//
// "Loads or carries" is the measure. The tools of the build (esbuild, ESLint,
// Playwright) are in no file, so they are not here.
//
// A story that adds a library adds one entry here, and its licence text below
// if it is not there yet. tests/licences.test.mjs compares every version with
// the place it is pinned at, src/index.html for what comes from the CDN and
// src/doc.css for the Octicons, and fails on an entry that fell behind. The
// path of the magnifier in src/app/search.js names the Octicons version too;
// the test does not read it, so it is kept alike with this entry by hand.
//
// Pure logic: this module imports html.js only, touches no page, and loads in
// Node as it is.

// name       what a reader calls it
// package    its name on npm, which is what the CDN URL and the comment in
//            src/doc.css carry
// version    the pinned version
// licence    a key of LICENCE_TEXTS
// copyright  the copyright lines as published, one per holder
// use        'cdn': the editor loads it from the CDN when the file is opened
//            'embedded': the file carries it
export const NOTICES = [
  {
    name: 'marked', package: 'marked', version: '18.0.14', licence: 'MIT', use: 'cdn',
    copyright: [
      'Copyright (c) 2018+, MarkedJS (https://github.com/markedjs/)',
      'Copyright (c) 2011-2018, Christopher Jeffrey (https://github.com/chjj/)',
    ],
  },
  {
    // The npm package has no licence file; the line is from the file "license"
    // of its repository, bent10/marked-extensions.
    name: 'marked-footnote', package: 'marked-footnote', version: '1.4.0', licence: 'MIT', use: 'cdn',
    copyright: ['Copyright (c) 2023-2024 Stilearning (https://stilearning.com)'],
  },
  {
    name: 'Mermaid', package: 'mermaid', version: '12.0.0', licence: 'MIT', use: 'cdn',
    copyright: ['Copyright (c) 2014 - 2022 Knut Sveidqvist'],
  },
  {
    // The navigated viewer of bpmn-js. Its licence is MIT with one more
    // condition, about the bpmn.io watermark; the text is the file LICENSE of
    // the package, bpmn-js@18.31.0.
    name: 'bpmn-js', package: 'bpmn-js', version: '18.31.0', licence: 'bpmn.io', use: 'cdn',
    copyright: ['Copyright (c) 2014-present Camunda Services GmbH'],
  },
  {
    // The path data of seven icons: six in the document styles (src/doc.css),
    // the five symbols of the callouts and the download symbol below a diagram,
    // and the seventh, "search", the magnifier of the search, in src/app/search.js,
    // whose version comment is kept alike with this one by hand.
    name: 'Octicons', package: '@primer/octicons', version: '19.38.0', licence: 'MIT', use: 'embedded',
    copyright: ['Copyright (c) 2026 GitHub Inc.'],
  },
];

// The text of each licence an entry names, once: its title and its paragraphs,
// in the licence's own wording.
export const LICENCE_TEXTS = {
  MIT: {
    title: 'MIT License',
    paragraphs: [
      'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:',
      'The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.',
      'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.',
    ],
  },
  // The file LICENSE of bpmn-js@18.31.0, its lines joined into paragraphs; the
  // copyright line stands with the entry. The file has no title.
  'bpmn.io': {
    title: 'bpmn.io License',
    paragraphs: [
      'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:',
      'The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.',
      'The source code responsible for displaying the bpmn.io project watermark that links back to https://bpmn.io as part of rendered diagrams MUST NOT be removed or changed. When this software is being used in a website or application, the watermark must stay fully visible and not visually overlapped by other elements.',
      'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.',
    ],
  },
};

export const LICENCES_CLASS = 'dokufix-licences';
export const LICENCES_LINK_TEXT = 'license information';

// "a", "a and b", "a, b and c".
function listed(names){
  return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

// One sentence on how the entries get into a file.
function usageSentence(notices){
  const named = use => notices.filter(n => n.use === use).map(n => n.name);
  const loaded = named('cdn'), carried = named('embedded');
  const parts = [];
  if (loaded.length) parts.push('The dokufix editor loads ' + listed(loaded) + ' from a CDN');
  if (carried.length) parts.push((parts.length ? 'the' : 'The') + ' file itself carries ' + listed(carried));
  return parts.length ? parts.join('; ') + '.' : '';
}

// The element: a closed <details> whose summary is the link and whose content
// is the view. Opening and closing is the browser's, so it works where no
// script runs. Every text is escaped. The same markup everywhere; where it
// stands and what it looks like is the frame's business (src/app.css in the
// editor, READONLY_FRAME_CSS in an export).
// The parameters are there for the test; the product calls it without any.
export function licencesHtml(notices = NOTICES, texts = LICENCE_TEXTS){
  const entries = notices.map(n => {
    const text = texts[n.licence];
    const pkg = n.package && n.package.toLowerCase() !== n.name.toLowerCase() ? ' (' + escapeHtml(n.package) + ')' : '';
    return '<li><strong>' + escapeHtml(n.name) + '</strong>' + pkg + ' ' + escapeHtml(n.version) +
      ', ' + escapeHtml(text ? text.title : n.licence) +
      n.copyright.map(line => '<br>' + escapeHtml(line)).join('') + '</li>';
  }).join('');
  // Each licence that an entry names, once, in the order the entries name them.
  const used = [...new Set(notices.map(n => n.licence))].filter(key => texts[key]);
  const licences = used.map(key =>
    '<p><strong>' + escapeHtml(texts[key].title) + '</strong></p>' +
    texts[key].paragraphs.map(p => '<p>' + escapeHtml(p) + '</p>').join('')).join('');
  const usage = usageSentence(notices);
  return '<details class="' + LICENCES_CLASS + '"><summary>' + LICENCES_LINK_TEXT + '</summary>' +
    '<div class="' + LICENCES_CLASS + '-view">' +
    '<p><strong>License information</strong></p>' +
    (usage ? '<p>' + escapeHtml(usage) + '</p>' : '') +
    '<ul>' + entries + '</ul>' +
    licences +
    '</div></details>';
}
