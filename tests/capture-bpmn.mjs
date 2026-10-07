// Takes the raw positions of BPMN XML without coordinates from the built page,
// in Chromium: the input of the fixtures (tests/bpmn-fixtures.mjs) that Node
// cannot make, for a new input or a new Mermaid version.
//
//   npm run capture -- <author.bpmn>…                  writes <n>.raw.json beside each
//   npm run capture -- --out <dir> <author.bpmn>…      writes them into <dir>
//
// The XML is read in Node as the fixtures read it (readModel()). The page is
// dist/dokufix.html, for its libraries, served from tests/.cdn (tests/cdn.mjs),
// and its mermaid.initialize(). Into it goes, bundled by esbuild, what
// src/app/bpmn.js lays out with, not a copy: mermaidPositions() gives the raw
// positions. The label sizes need no page any more: the layout measures them
// itself (src/app/label-size.js); tests/check-label-size.mjs checks that
// measurer against bpmn-js in Chromium.
//
// An input that already has a diagram part (a BPMNDiagram, such as the laid-out
// <n>.laid-out.bpmn of the fixtures) is no author XML: it is skipped, with a
// line naming it, so that tests/fixtures/bpmn-layout/*.bpmn captures the
// author XML alone.
//
// Chromium only: it is /usr/bin/chromium, or the path in CHROMIUM; without it
// the command stops with exit 1. Exit 1 also when an input cannot be read or
// laid out by Mermaid.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright-core';
import { prepareLibraries } from './cdn.mjs';
import { readModel } from './bpmn-fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(here, '../dist/dokufix.html');
const CHROMIUM = process.env.CHROMIUM || '/usr/bin/chromium';
const shown = file => { const r = path.relative(process.cwd(), file); return r.startsWith('..') ? file : r; };

// What goes into the page: the function of src/app/bpmn.js, as window.dokufixCapture.
export async function captureBundle(){
  const result = await esbuild.build({
    stdin: { contents: "import { mermaidPositions } from './src/app/bpmn.js';\nwindow.dokufixCapture = { mermaidPositions };\n", resolveDir: path.join(here, '..'), loader: 'js' },
    bundle: true, format: 'iife', write: false, charset: 'utf8', logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

// Whether the XML has a diagram part: a BPMNDiagram, whatever its prefix,
// outside comments and CDATA sections.
export const hasDiagram = xml => /<(?:[\w.-]+:)?BPMNDiagram\b/.test(String(xml).replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, ''));

function parseArgs(argv){
  const a = { out: null, files: [] };
  for (let i = 0; i < argv.length; i++){
    if (argv[i] === '--out'){ a.out = argv[++i]; if (!a.out) throw new Error('--out needs a folder'); }
    else if (argv[i].startsWith('--')) throw new Error('unknown argument: ' + argv[i]);
    else a.files.push(argv[i]);
  }
  if (!a.files.length) throw new Error('usage: npm run capture -- [--out <dir>] <author.bpmn>…');
  return a;
}

async function main(argv){
  const args = parseArgs(argv);
  const inputs = args.files.filter(file => {
    if (!hasDiagram(fs.readFileSync(file, 'utf8'))) return true;
    console.log('skipped, it has a diagram part: ' + shown(file));
    return false;
  }).map(file => {
    const read = readModel(fs.readFileSync(file, 'utf8'));
    if (!read) throw new Error(file + ': no BPMN definitions');
    const base = path.basename(file).replace(/\.bpmn$/, '');
    return { file, model: read.model, out: path.join(args.out || path.dirname(file), base) };
  });
  if (!inputs.length) return;
  if (!fs.existsSync(PAGE)) throw new Error('no built page at ' + shown(PAGE) + ': npm run build first');
  if (!fs.existsSync(CHROMIUM)) throw new Error('Chromium not found at ' + CHROMIUM + ': install it, or name its path in CHROMIUM');
  const bundle = await captureBundle();
  const libraries = await prepareLibraries(PAGE);
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await libraries.serve(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(pathToFileURL(PAGE).href);
    // The rail is the last thing the page's first render builds: then nothing else is laid out.
    await page.waitForFunction(() => !!document.querySelector('#dokufix-rail.has-items'), null, { timeout: 90000 });
    await page.addScriptTag({ content: bundle });
    if (args.out) fs.mkdirSync(args.out, { recursive: true });
    let n = 0;
    for (const input of inputs){
      const raw = await page.evaluate(({ model, index }) => window.dokufixCapture.mermaidPositions(model, document, index), { model: input.model, index: 'capture-' + (++n) });
      // A flow from a boundary event back into its host is no edge of Mermaid's (mermaidSource()).
      const hostOf = new Map((input.model.boundaries || []).map(b => [b.id, b.host]));
      const missing = input.model.nodes.filter(m => !raw.nodes[m.key]).map(m => m.id).concat(input.model.flows.filter((f, i) => !raw.edges[i] && (hostOf.get(f.from) ?? f.from) !== f.to).map(f => f.id));
      if (missing.length) throw new Error(input.file + ': Mermaid did not lay out ' + missing.join(', '));
      fs.writeFileSync(input.out + '.raw.json', JSON.stringify(raw, null, 1));
      console.log(shown(input.out) + '.raw.json');
    }
    if (errors.length) throw new Error('errors on the page: ' + errors.join('; '));
  } finally {
    await browser.close();
  }
  if (libraries.refused.length) throw new Error('requests refused: ' + libraries.refused.join(', '));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  main(process.argv.slice(2)).catch(err => { console.error(err.message); process.exitCode = 1; });
}
