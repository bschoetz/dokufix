// Writes THIRD_PARTY_NOTICES.md: the work of others the files of this repository carry or load, for GitHub.
// From the product's list (NOTICES and LICENCE_TEXTS in src/app/licences.js) and the list bundled with
// bpmn-auto-layout (tools/bpmn-assistant/vendor/bpmn-auto-layout.LIZENZEN.txt), so neither is kept twice.
//
//   node tools/notices.mjs           write the file
//   node tools/notices.mjs --check   write nothing; exit 1 when the file is not what it would write
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTICES, LICENCE_TEXTS } from '../src/app/licences.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'THIRD_PARTY_NOTICES.md');
const AUTO_LAYOUT = 'tools/bpmn-assistant/vendor/bpmn-auto-layout.LIZENZEN.txt';

const cell = s => String(s).replace(/\|/g, '\\|');
const row = cells => '| ' + cells.map(cell).join(' | ') + ' |';
const table = (head, rows) => [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');
const entry = (pkg, use) => {
  const e = NOTICES.find(n => n.package === pkg && (!use || n.use === use));
  if (!e) throw new Error('no entry for ' + pkg + ' in src/app/licences.js');
  return e;
};
const title = key => LICENCE_TEXTS[key].title;

// The packages of the bundle, one block each between lines "----": its first line "<name> <version>", its
// copyright lines as the package publishes them. bpmn-auto-layout has none; its block names its authors.
function autoLayoutPackages(){
  return fs.readFileSync(path.join(REPO, AUTO_LAYOUT), 'utf8').split(/^----$/m).map(block => {
    const head = block.match(/^(\S+) (\d\S*)$/m);
    if (!head) throw new Error(AUTO_LAYOUT + ': a block without "<name> <version>"');
    const copyright = block.match(/^Copyright .*$/gm)?.map(l => l.replace(/\s{2,}/g, ' ')) ?? ['bpmn.io contributors (the package has no licence file)'];
    return { name: head[1], version: head[2], copyright };
  });
}

export function notices(){
  const product = NOTICES.map(n => [n.name, n.version, title(n.licence), n.copyright.join('<br>'),
    n.use === 'cdn' ? 'loaded by the editor from a CDN' : 'carried by the file']);
  const bpmnJs = entry('bpmn-js'), djs = entry('diagram-js'), lmm = entry('mermaid', 'embedded'), oct = entry('@primer/octicons');
  const tools = [
    ['bpmn-js (viewer; modeler in Assistant and workbench)', bpmnJs.version, title(bpmnJs.licence), bpmnJs.copyright.join('<br>'), 'all three'],
    [djs.name + ', its text layout replicated', djs.version, title(djs.licence), djs.copyright.join('<br>'), 'Assistant, workbench'],
    [lmm.name + ', replicated', lmm.version, title(lmm.licence), lmm.copyright.join('<br>'), 'Assistant, workbench'],
    [oct.name, oct.version, title(oct.licence), oct.copyright.join('<br>'), 'all three'],
    ...autoLayoutPackages().map(p => [p.name, p.version, 'MIT License', p.copyright.join('<br>'), 'Assistant']),
  ];
  const texts = Object.values(LICENCE_TEXTS).map(t => '### ' + t.title + '\n\n' + t.paragraphs.join('\n\n'));
  return [
    '# Third-party notices',
    'dokufix itself is under the MIT License, see [LICENSE](LICENSE). Its files carry or load work of others, listed here. ' +
      'Tools that only run for the build or the tests (esbuild, ESLint, Playwright, linkedom, bpmnlint, bpmn-moddle) are in no file and are not listed.',
    'Written by `node tools/notices.mjs` from `src/app/licences.js` and `' + AUTO_LAYOUT + '`; `npm run check` fails when it is out of date.',
    '## dokufix\n\n`dist/dokufix.html`, `dist/dokufix-showcase.html` and every file they save or export. ' +
      'Each of these files shows the same list behind its link "license information".',
    table(['Component', 'Version', 'Licence', 'Copyright', 'How'], product),
    '## BPMN tool pages\n\n`dist/bpmn-assistant.html`, `dist/bpmn-layout-werkbank.html` and `dist/bpmn-layouter-audi.html`. ' +
      'Their code is embedded, so the pages work offline. The bundle of bpmn-auto-layout carries its licence texts in `' + AUTO_LAYOUT + '`.',
    table(['Component', 'Version', 'Licence', 'Copyright', 'Pages'], tools),
    '## Licence texts',
    ...texts,
  ].join('\n\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)){
  const text = notices();
  if (process.argv.includes('--check')){
    const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (now !== text){ console.error('THIRD_PARTY_NOTICES.md is out of date: run node tools/notices.mjs'); process.exit(1); }
  } else fs.writeFileSync(OUT, text);
}
