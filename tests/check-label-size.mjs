// The label measurer (src/app/label-size.js) against bpmn-js, in Chromium: the
// size of every label and text annotation of the fixtures, and of texts that
// are hard to break, as bpmn-js's own text renderer gives it in the font the
// page draws in (BPMN_VIEWER_CONFIG), compared with what measureLabel() gives
// in Node. The measurer replicates the text layout of one diagram-js, the one
// its bpmn-js bundles (LABEL_SIZE_VERSION): a bpmn-js that breaks text
// otherwise shows here as sizes that differ, so a newer bpmn-js is taken
// together with this check.
//
//   npm run labels               compares; exit 1 on a size that differs, but
//                                for a text with characters outside the width
//                                table (CJK, emoji), whose width is a fallback
//                                and the browser's own: that is noted
//   npm run labels -- --table    prints the width table of the font anew, as
//                                src/app/label-size.js holds it (RANGES, KERNING)
//
// bpmn-js comes from the CDN mirror of the browser runs, tests/.cdn
// (tests/cdn.mjs), at the version src/index.html pins, fetched once if it is
// not there; no built page is needed. Chromium only: /usr/bin/chromium, or the
// path in CHROMIUM; without it the command stops with exit 1. The widths are
// the font's, so Chromium must draw "Arial, sans-serif" with Arial's metrics:
// Arial, or Liberation Sans in its place (fontconfig); the check says which
// font it measured, by the width of a probe.
//
// The reference measures as the page measured until the layout measured for
// itself: getExternalLabelBounds() in a box 90 px wide for a label's width and
// height, then the lines of createText() in that width, which can be one more
// (bpmn-js lays the text out again when it draws); getTextAnnotationBounds()
// for a text annotation in a width.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright-core';
import { prepareLibraries, LIBRARY_FOLDER } from './cdn.mjs';
import { fixtureNames, readFixture, readModel } from './bpmn-fixtures.mjs';
import { NOTE_WIDTHS } from '../src/app/bpmn-layout.js';
import { measureLabel, labelBox, missingFromTable, LABEL_SIZE_VERSION } from '../src/app/label-size.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROMIUM = process.env.CHROMIUM || '/usr/bin/chromium';
const INDEX = path.join(here, '../src/index.html');

// Texts that are hard to break: umlauts, a word longer than the box, hyphens,
// numbers, the author's line breaks, an empty line, an emoji, CJK, a tab, a
// soft hyphen, leading, doubled and trailing blanks, typographic quotes.
export const HARD_TEXTS = [
  'Überprüfung der Größenänderung', 'Donaudampfschifffahrtsgesellschaftskapitän', 'Rechnungsprüfungs-Workflow',
  'Ein-, Aus- und Durchgang', 'Kunden-Nr. 4711-0815', '1234567890 €', '12.345,67 EUR überwiesen',
  'Erste Zeile\nzweite Zeile', 'Zeile eins\r\nZeile zwei\n\nnach Leerzeile', 'Abschluss 🎉 gefeiert',
  '請求書を確認する', '审核申请并转发给团队负责人', 'Fehler!!! Sofort???', 'a', 'ab', ' führende Leerzeichen',
  'nachgestellte Leerzeichen   ', 'doppelte  Leerzeichen  innen', 'x'.repeat(40),
  'Qualitätssicherung abgeschlossen und freigegeben', 'Soft\u00ADbreak im Wort', 'Tab\tgetrennt', 'ÄÖÜ äöü ß',
  'e-mail-benachrichtigung-versendet', 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z', 'WWWWWWWWWWWWWWW',
  'iiiiiiiiiiiiiiiiiiiiiiiiiiiiii', 'AVATAR Wavy Toffee', 'Team-Leitung informiert (Frist: 3 Tage)',
  '„Anführungszeichen“ und ‚einfache‘', 'Prozentsatz 12,5 % – fertig', 'Alle Zitzen gemolken?',
];

// The texts the layout measures: the names of events, gateways, boundary
// events and flows as labels, the text annotations' texts in every width.
export function corpus(){
  const labels = new Set(), notes = new Set();
  for (const name of fixtureNames()){
    const { model } = readModel(readFixture(name).xml);
    for (const n of model.nodes) if (n.type !== 'task' && n.name) labels.add(n.name);
    for (const b of model.boundaries || []) if (b.name) labels.add(b.name);
    for (const f of model.flows.concat(model.messages || [])) if (f.name) labels.add(f.name);
    for (const n of model.notes || []) notes.add(n.text);
  }
  const fixtures = { labels: labels.size, notes: notes.size };
  for (const t of HARD_TEXTS){ labels.add(t); notes.add(t); }
  return { labels: [...labels], notes: [...notes].flatMap(text => NOTE_WIDTHS.map(width => ({ text, width }))), fixtures };
}

// The characters of the width table, by their code points (src/app/label-size.js, RANGES).
const TABLE_RANGES = [[0x20, 0x7e], [0xa0, 0x17f], [0x2010, 0x2027], [0x2030, 0x203a], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x9, 0x9]];

// What goes into the page: the viewer's configuration of src/app/bpmn.js.
async function configBundle(){
  const result = await esbuild.build({
    stdin: { contents: "import { BPMN_VIEWER_CONFIG } from './src/app/bpmn.js';\nwindow.dokufixCheck = { BPMN_VIEWER_CONFIG };\n", resolveDir: path.join(here, '..'), loader: 'js' },
    bundle: true, format: 'iife', write: false, charset: 'utf8', logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

// The library file of the mirror at the version the measurer follows.
async function libraryFile(){
  const version = LABEL_SIZE_VERSION['bpmn-js'];
  const file = path.join(LIBRARY_FOLDER, 'npm', 'bpmn-js@' + version, 'dist', 'bpmn-navigated-viewer.production.min.js');
  if (!fs.existsSync(file)) await prepareLibraries(INDEX);
  if (!fs.existsSync(file)) throw new Error('no bpmn-js ' + version + ' in ' + path.relative(process.cwd(), LIBRARY_FOLDER) + ': src/index.html pins another version than the measurer follows (LABEL_SIZE_VERSION)');
  return file;
}

// Runs fn(page) in Chromium on a blank page with bpmn-js and the configuration loaded.
async function inChromium(fn){
  if (!fs.existsSync(CHROMIUM)) throw new Error('Chromium not found at ' + CHROMIUM + ': install it, or name its path in CHROMIUM');
  const library = await libraryFile(), bundle = await configBundle();
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.setContent('<!DOCTYPE html><html><body></body></html>');
    await page.addScriptTag({ content: fs.readFileSync(library, 'utf8') });
    await page.addScriptTag({ content: bundle });
    const out = await fn(page);
    if (errors.length) throw new Error('errors on the page: ' + errors.join('; '));
    return out;
  } finally { await browser.close(); }
}

// The sizes bpmn-js gives, and the font Chromium measures in.
function measureInPage({ labels, notes }){
  const { BPMN_VIEWER_CONFIG } = window.dokufixCheck;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:4000px;height:3000px;overflow:hidden';
  document.body.appendChild(host);
  const viewer = new BpmnJS({ container: host, ...BPMN_VIEWER_CONFIG });
  try {
    const tr = viewer.get('textRenderer'), style = tr.getExternalStyle();
    const lines = (text, width) => tr.createText(text, { box: { width, height: 30 }, style }).querySelectorAll('tspan').length;
    // A label with a word wider than 90 px is laid out in the wider box the measurer gives it (labelBox()), which
    // is then its width: the diagram gives bpmn-js that width, and it draws the lines in it.
    const label = (text, box) => {
      if (box > 90) return { w: box, h: Math.ceil(lines(text, box) * 1.2 * style.fontSize) };
      const b = tr.getExternalLabelBounds({ x: 0, y: 0, width: 90, height: 30 }, text);
      return { w: b.width, h: Math.ceil(b.height / Math.max(1, lines(text, 90)) * lines(text, b.width)) };
    };
    const note = (text, width) => ({ w: width, h: tr.getTextAnnotationBounds({ x: 0, y: 0, width, height: 30 }, text).height });
    const ctx = document.createElement('canvas').getContext('2d');
    const probe = family => { ctx.font = 'normal 12px ' + family; return ctx.measureText('Medium von Hand prüfen').width; };
    const family = tr.getDefaultStyle().fontFamily;
    return {
      font: { family, width: probe(family), arial: probe('Arial'), liberation: probe('Liberation Sans'), fallback: probe('sans-serif') },
      labels: labels.map(({ text, box }) => ({ text, size: label(text, box) })),
      notes: notes.map(({ text, width }) => ({ text, width, size: note(text, width) })),
    };
  } finally { viewer.destroy(); host.remove(); }
}

// The width table: every character's advance in font units, and every pair
// of them whose width is not the sum, printed as src/app/label-size.js holds it.
function tableInPage({ ranges, family }){
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = 'normal 12px ' + family;
  const w = s => ctx.measureText(s).width;
  const units = px => Math.round(px * 2048 / 12);
  const chars = ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCharCode(a + i)));
  const widths = {};
  for (const c of chars) widths[c] = w(c);
  const whole = chars.filter(c => Math.abs(units(widths[c]) * 12 / 2048 - widths[c]) > 1e-9).length;
  const kerning = {};
  for (const a of chars) for (const b of chars){ const d = w(a + b) - widths[a] - widths[b]; if (Math.abs(d) > 1e-6) kerning[a + b] = units(d); }
  return { lines: ranges.map(([a, b]) => '  [0x' + a.toString(16) + ', \'' + chars.filter(c => c.charCodeAt(0) >= a && c.charCodeAt(0) <= b).map(c => units(widths[c])).join(' ') + '\'],'),
           kerning: Object.entries(kerning).sort(), notWhole: whole, kerningDefault: ctx.fontKerning, emoji: w('🎉'), cjk: w('請') };
}

async function main(argv){
  if (argv.includes('--table')){
    const { BPMN_VIEWER_CONFIG } = await import('../src/app/bpmn.js');
    const t = await inChromium(page => page.evaluate(tableInPage, { ranges: TABLE_RANGES, family: BPMN_VIEWER_CONFIG.textRenderer.defaultStyle.fontFamily }));
    console.log('// RANGES\n' + t.lines.join('\n'));
    console.log('// KERNING (' + t.kerning.length + ' pairs; fontKerning ' + t.kerningDefault + ')\n  ' + t.kerning.map(([p, d]) => JSON.stringify(p).replace(/^"|"$/g, '\'') + ': ' + d).join(', '));
    console.log('// fallbacks: emoji ' + t.emoji + ' px, CJK ' + t.cjk + ' px' + (t.notWhole ? '\n// WARNING: ' + t.notWhole + ' widths are no whole number of font units' : ''));
    return 0;
  }
  const unknown = argv.filter(a => a !== '--table');
  if (unknown.length) throw new Error('unknown argument: ' + unknown.join(' '));
  const texts = corpus();
  const r = await inChromium(page => page.evaluate(measureInPage, { labels: texts.labels.map(text => ({ text, box: labelBox(text) })), notes: texts.notes }));
  const font = r.font.width === r.font.arial && r.font.arial !== r.font.fallback ? 'Arial' : r.font.width === r.font.liberation ? 'Liberation Sans' : 'another font (' + r.font.width + ' px for the probe; Arial ' + r.font.arial + ', Liberation Sans ' + r.font.liberation + ', sans-serif ' + r.font.fallback + ')';
  const same = (a, b) => a.w === b.w && a.h === b.h;
  const differing = [];
  for (const { text, size } of r.labels){ const own = measureLabel(text); if (!same(own, size)) differing.push({ text, width: null, bpmn: size, own }); }
  for (const { text, width, size } of r.notes){ const own = measureLabel(text, width); if (!same(own, size)) differing.push({ text, width, bpmn: size, own }); }
  const failing = differing.filter(d => !missingFromTable(d.text).length), noted = differing.filter(d => missingFromTable(d.text).length);
  for (const d of differing){
    console.log((noted.includes(d) ? 'noted, characters outside the table (' + missingFromTable(d.text).join('') + '): ' : '') + (d.width ? 'text annotation in ' + d.width + ' px' : 'label') + ' ' + JSON.stringify(d.text) + ': bpmn-js ' + d.bpmn.w + ' × ' + d.bpmn.h + ', measurer ' + d.own.w + ' × ' + d.own.h);
  }
  const counts = r.labels.length + ' labels (' + texts.fixtures.labels + ' of the fixtures) and ' + r.notes.length + ' text annotation sizes (' + texts.fixtures.notes + ' texts of the fixtures, each in ' + NOTE_WIDTHS.length + ' widths)';
  console.log('bpmn-js ' + LABEL_SIZE_VERSION['bpmn-js'] + ' in Chromium, "' + r.font.family + '" drawn as ' + font + ': ' + counts + ', ' +
    (failing.length ? failing.length + ' differ from the measurer' : 'all as the measurer gives them') + (noted.length ? ', ' + noted.length + ' with characters outside the table noted' : ''));
  return failing.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, err => { console.error(err.message); process.exitCode = 1; });
}
