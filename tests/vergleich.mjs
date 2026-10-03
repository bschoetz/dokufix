// Comparison run for a dokufix file: dist/dokufix.html, or any other file that
// is a dokufix editor, such as the frozen poc/dokufix-poc.html.
//
// Builds all four download variants from ONE document in ONE run, reopens each
// like a recipient would, and records what they look like and how big they are:
//
//   node tests/vergleich.mjs --out tests/out/vorher
//   node tests/vergleich.mjs --out tests/out/nachher --compare tests/out/vorher
//
// Options
//   --out <dir>        where exports, screenshots and sizes.json go (required)
//   --compare <dir>    an earlier --out directory; reports differing pixels per image and size deltas
//   --browser <name>   chromium | firefox | all (default: all)
//   --file <file>      the file under test (default: ../dist/dokufix.html); --poc is an alias
//   --doc <file>       the Markdown to build from (default: referenz.md)
//   --demo             build from the built-in demo text instead of --doc
//   --strict           exit 1 when --compare finds any differing pixel
//
// Exit code 1 when an assertion fails (epic 1 behaviour, callouts, status chips,
// block markers with cards and step lists, tables with their wrapper, sub-lines
// and facet filter, the licence information, no <script> in nur-lesen, no
// editor rules in a read-only export).
// Differing pixels alone do not fail the
// run unless --strict is given: some differences are decided, and the run lists
// them so a human can attribute each one. An image that only one side has counts
// as differing. A --compare folder that holds no run for a browser, or that is
// the --out folder itself, stops the run with exit 1 before anything is built.
//
// Date and Math.random are replaced by deterministic stand-ins, because the
// read-only exports print their export time, Mermaid derives its SVG ids from
// Date.now(), and Mermaid 12 draws node outlines with randomised control points.
// Without that, two runs of the same file differ by a few dozen bytes and sizes
// could not be compared. The clock must still tick: with a frozen Date.now() every
// diagram gets the same id and Mermaid draws the second one into the first.
//
// Every reopened file gets its own browser process, so no page inherits state
// from the one before it.
//
// The run knows the page by its DOM only, never by a name of its script: the
// built file carries the script as one minified bundle, which has no global
// names. Three things it has to wait for, and what it watches instead:
//   - init is done:          #dokufix-rail has the class has-items. The rail is
//                            the last thing the first render builds.
//   - a render is finished:  the run puts a marker element into the rail and
//                            presses "Rendern". Every render ends by rewriting
//                            the rail, so the marker is gone when it is done.
//   - a download is through: no button[data-download] is disabled any more.
// That is why the same run works on the PoC, on the built file, and on a file
// whose script is cut differently.
//
// Known deviation, Firefox only. In the Playwright Firefox build the footnote
// preview does not appear on focus once a page has been open for about a second:
// the host matches :focus-within, the rule on its child does not take effect.
// Switching off position-try-fallbacks on the preview makes it appear. Measured
// on the untouched file, so it predates this harness. Where that happens the
// run switches the fallbacks off with a style tag, in the same way before and
// after, and says so in a note instead of failing. Chromium is never touched.
//
// Hover is deliberately not used: Playwright's synthetic mouse produced Firefox
// numbers that human review retracted (see src/README.md, Footnotes). The preview
// is revealed through :focus-within, which is the keyboard path and reliable.
//
// WebKit is not run. Its Playwright build does not start on this machine.

import { chromium, firefox } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
// The list behind the link "license information": what the view has to name.
// tests/licences.test.mjs checks the list itself; this run checks that every
// variant shows it.
import { NOTICES, LICENCE_TEXTS, LICENCES_LINK_TEXT } from '../src/app/licences.js';
// What a status is, is said in one module, and this run asks there: which code
// span of the Markdown is one, with which colour and label. And which anchor a
// heading's label gives is asked where the product makes it.
import { readChip } from '../src/app/chips.js';
import { slugify } from '../src/app/toc.js';
// What a comment says as a marker, and what a marker comes to before a block
// of a given kind, its component or the text of its warning, is asked where
// the product decides it. What the run reads itself is the Markdown: which
// markers stand in it, and which block follows each.
import { readMarker, judgeMarker, refusedMarker } from '../src/app/markers.js';
// What a facet marker comes to on a table, its controls or the reason it
// refuses, is asked where the product decides it, with the table as this run
// read it from the Markdown.
import { planFacets, FACET_ALL } from '../src/app/facets.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------- arguments ----------
function parseArgs(argv){
  const a = { browser: 'all', file: path.resolve(here, '../dist/dokufix.html'), doc: path.join(here, 'referenz.md'), demo: false, strict: false };
  for (let i = 0; i < argv.length; i++){
    const k = argv[i];
    if (k === '--demo') a.demo = true;
    else if (k === '--strict') a.strict = true;
    else if (['--out', '--compare', '--browser', '--file', '--poc', '--doc'].includes(k)){
      if (argv[i + 1] === undefined) throw new Error(k + ' needs a value');
      a[k === '--poc' ? 'file' : k.slice(2)] = argv[++i];
    }
    else throw new Error('unknown argument: ' + k);
  }
  if (!a.out) throw new Error('--out <dir> is required');
  if (!['chromium', 'firefox', 'all'].includes(a.browser)) throw new Error('--browser must be chromium, firefox or all');
  a.out = path.resolve(a.out);
  a.file = path.resolve(a.file);
  if (!fs.existsSync(a.file)) throw new Error('file under test not found: ' + a.file);
  a.doc = path.resolve(a.doc);
  if (a.compare) a.compare = path.resolve(a.compare);
  // The run empties its output folder first. Pointed at the baseline, it would
  // delete what it is about to compare with and then report "identical".
  if (a.compare && a.compare === a.out) throw new Error('--out and --compare are the same folder; the run would delete its own baseline');
  return a;
}

// ---------- browsers ----------
function findFirefox(){
  if (process.env.FIREFOX) return process.env.FIREFOX;
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  const dirs = fs.existsSync(cache)
    ? fs.readdirSync(cache).filter(d => /^firefox-\d+$/.test(d)).sort((x, y) => Number(y.split('-')[1]) - Number(x.split('-')[1]))
    : [];
  for (const d of dirs){
    const exe = path.join(cache, d, 'firefox', 'firefox');
    if (fs.existsSync(exe)) return exe;
  }
  throw new Error('No Firefox found. Set FIREFOX=/path/to/firefox or install the Playwright build.');
}
const BROWSERS = {
  chromium: () => chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium' }),
  firefox:  () => firefox.launch({ executablePath: findFirefox() }),
};

// ---------- run constants ----------
const FIXED_NOW = new Date('2026-10-02T08:00:00Z');
const CONTEXT = { locale: 'de-DE', timezoneId: 'Europe/Berlin' };
const VARIANTS = [
  { key: 'mit-editor', download: 'full',             label: 'Mit Editor' },
  { key: 'nur-lesen',  download: 'readonly-open',    label: 'nur-lesen' },
  { key: 'schlank',    download: 'readonly-slim',    label: 'schlank' },
  { key: 'kompakt',    download: 'readonly-compact', label: 'kompakt' },
];
const READONLY = new Set(['nur-lesen', 'schlank', 'kompakt']);
const WIDTHS = [1400, 1600];
const SCHEMES = [['hell', 'light'], ['dunkel', 'dark']];

// Selectors that belong to the editor interface. None may appear in the
// stylesheet of a read-only export.
const EDITOR_RULES = [
  /#preview\b/, /\.mode-view\b/, /\.pane\b/, /\.pane-/, /\.layout\b/, /\.hamburger\b/, /\.header-actions\b/,
  /\.menu\b/, /\.menu-wrap\b/, /\.version-/, /\.dirty-badge\b/, /\.toggle-back\b/, /\.toggle-on\b/,
  /\.commit-/, /\.img-btn\b/, /\.drop-overlay\b/, /\btextarea\b/, /\bheader\b/, /\.error\b/, /a\.active\b/,
];

// The five callout types: the word a reader sees and the colour of edge, label
// and symbol (src/app/callouts.js, src/doc.css).
const CALLOUTS = {
  note:      { label: 'Hinweis',  colour: 'rgb(9, 105, 218)',  fill: '#0969da' },
  tip:       { label: 'Tipp',     colour: 'rgb(26, 127, 55)',  fill: '#1a7f37' },
  important: { label: 'Wichtig',  colour: 'rgb(130, 80, 223)', fill: '#8250df' },
  warning:   { label: 'Achtung',  colour: 'rgb(154, 103, 0)',  fill: '#9a6700' },
  caution:   { label: 'Vorsicht', colour: 'rgb(207, 34, 46)',  fill: '#cf222e' },
};
// Controls for the numbering of headings after a callout; see assertVariant().
// The first forces what the document styles are meant to do, the second what
// they must not do: a heading inside a callout that is numbered and counts.
const CALLOUT_HEADINGS_OUT =
  '.numbered .dokufix-doc .dokufix-callout :is(h2,h3,h4){counter-reset:none !important}' +
  '.numbered .dokufix-doc .dokufix-callout :is(h2,h3,h4)::before{counter-increment:none !important;content:none !important}';
const CALLOUT_HEADINGS_IN =
  '.numbered .dokufix-doc .dokufix-callout h2{counter-reset:h3 !important}' +
  '.numbered .dokufix-doc .dokufix-callout h3{counter-reset:h4 !important}' +
  '.numbered .dokufix-doc .dokufix-callout h2::before{counter-increment:h2 !important;content:counter(h2) ". " !important}' +
  '.numbered .dokufix-doc .dokufix-callout h3::before{counter-increment:h3 !important;content:counter(h2) "." counter(h3) " " !important}' +
  '.numbered .dokufix-doc .dokufix-callout h4::before{counter-increment:h4 !important;content:counter(h2) "." counter(h3) "." counter(h4) " " !important}';

// The five colours of a status chip: the word a screen reader says, the
// colour of the label, which is the darker one, the colour of the mark, and
// the tint of the pill (src/app/chips.js, src/doc.css).
const CHIPS = {
  green:  { word: 'grün', text: 'rgb(17, 99, 41)',  colour: 'rgb(26, 127, 55)',  tint: 'rgb(218, 251, 225)' },
  yellow: { word: 'gelb', text: 'rgb(125, 78, 0)',  colour: 'rgb(154, 103, 0)',  tint: 'rgb(255, 248, 197)' },
  red:    { word: 'rot',  text: 'rgb(164, 14, 38)', colour: 'rgb(207, 34, 46)',  tint: 'rgb(255, 235, 233)' },
  grey:   { word: 'grau', text: 'rgb(66, 74, 83)',  colour: 'rgb(87, 96, 106)',  tint: 'rgb(234, 238, 242)' },
  blue:   { word: 'blau', text: 'rgb(5, 80, 174)',  colour: 'rgb(9, 105, 218)',  tint: 'rgb(221, 244, 255)' },
};
// For the pictures of the marks: every chip in one colour, so that what is
// left to tell two apart is the shape of the mark.
// And every chip at a whole pixel of its own: where a glyph or an edge falls
// between two pixels decides how it is smoothed, and two chips in one line of
// text do not fall alike.
const CHIPS_ONE_COLOUR =
  '#vergleich-chips{position:fixed;left:0;top:0;width:200px;height:400px;margin:0;background:#fff;z-index:2147483647}' +
  '#vergleich-chips .dokufix-chip{position:absolute;left:20px;color:#000 !important;background:#fff !important}' +
  '#vergleich-chips .dokufix-chip::before{color:#000 !important}';
// Two marks count as different shapes from this many differing pixels on. A
// circle and a square of 8 px differ in their four corners, about 14 pixels.
const MARK_MIN_DIFFERENCE = 8;

// Cards and step lists (story 2.4): the thin border of a card, the tint of a
// number tile and the colour of an actor (src/doc.css), and the look of the
// product's warning, which a marker that cannot act becomes.
const CARD_BORDER = '1px solid rgb(229, 229, 234)';
const STEP_TILE = 'rgb(240, 240, 243)';
const STEP_ACTOR = 'rgb(110, 110, 115)';
const WARNING_LOOK = { edge: '6px solid', background: 'rgb(255, 248, 225)' };
// The width at which cards have to stand below each other: two columns of
// 210 px with their gap do not fit into the text column of any variant.
const CARDS_NARROW = 400;

// Tables (story 2.5): the look of a sub-line and of the controls of a facet
// filter (src/doc.css), and the width at which the page is measured a second
// time: narrower than every table of the reference document.
const SUB_LINE = 'normal 12px rgb(110, 110, 115)';
const FACET_PILL = { border: '1px solid rgb(229, 229, 234)', chosen: '1px solid rgb(28, 28, 30)', radius: '13px', ring: '2px', ringChosen: '5px' };
const TABLES_NARROW = 600;
// A Markdown table with this many columns or more is taken for one that is
// wider than the text column: that is how the reference document and the demo
// text write theirs, with headings that cannot break.
const WIDE_COLUMNS = 7;
const FOOTNOTE_WIDTH = 900;
const PREVIEWS_OUT = '.dokufix-fn-preview{display:none !important}';

// The link "license information" (story 2.18). Every text its view has to show:
// per entry its name, version, the title of its licence and its copyright
// lines, and each licence text.
const LICENCE_TEXTS_SHOWN = [
  ...NOTICES.flatMap(n => [n.name, n.version, (LICENCE_TEXTS[n.licence] || { title: n.licence }).title, ...n.copyright]),
  ...Object.values(LICENCE_TEXTS).flatMap(t => [t.title, ...t.paragraphs]),
];
// The widths the place of the link is measured at, beyond the two of the
// screenshots: the narrow layout (up to 820 px), the first width of the wide
// one, widths narrower than the text column and wider, and around 1500 px,
// where the rail appears.
const LICENCE_WIDTHS = [320, 600, 820, 821, 900, 1000, 1200, 1400, 1499, 1500, 1562, 1600, 1900];
const NARROW = 820;

// ---------- what the document should produce ----------
function expectationsFor(md){
  const exp = { frontmatter: false, digest: '', mermaid: 0, toc: false, images: 0, missing: 0, multiRef: null, footnotes: 0,
                callouts: [], calloutHeadings: [], calloutHeadingsNumbered: 0,
                tocDepth: 0, chips: [], footnoteChips: [], chipHeadings: [], linkedChips: 0,
                cards: [], steps: [], markerWarnings: [], comments: 0, markersAsCode: 0, stepFootnotes: 0,
                facets: [], tables: 0, wideTables: [], subLines: [], tableFootnotes: 0 };
  let body = md;
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (fm){
    exp.frontmatter = true;
    body = md.slice(fm[0].length);
    exp.digest = ['title', 'version', 'date', 'author']
      .map(k => { const m = fm[1].match(new RegExp('^' + k + ':[ \\t]*(.+?)[ \\t]*$', 'mi')); return m ? m[1] : ''; })
      .filter(Boolean).join(' · ');
  }
  exp.mermaid = (body.match(/^```mermaid[ \t]*$/gm) || []).length;
  const toc = body.match(/^\[\[toc(?::([1-6]))?\]\][ \t]*$/m);
  exp.toc = !!toc;
  exp.tocDepth = toc ? Number(toc[1] || 3) : 0;
  exp.missing = (body.match(/!\[[^\]]*\]\(#asset-[0-9a-f]{12,64}\)/gi) || []).length;
  exp.images = (body.match(/!\[[^\]]*\]\(/g) || []).length - exp.missing;
  const cites = {};
  for (const m of body.matchAll(/\[\^([^\]\s]+)\](?!:)/g)) cites[m[1]] = (cites[m[1]] || 0) + 1;
  exp.footnotes = Object.keys(cites).length;
  exp.multiRef = Object.keys(cites).find(k => cites[k] >= 2) || null;
  // Callouts: a blockquote whose first line is only an alert marker, and the
  // headings inside one. Read line by line, and only for a quote that starts
  // at the beginning of its line and is not nested: that is how the reference
  // document writes them. Fenced code is skipped. Not read: a callout in a
  // list item or in a nested quote, and a masked marker ("> \[!NOTE\]"), which
  // the product turns into a callout. A document with one of these fails the
  // count below although the build is right; see src/README.md, "Comparison run".
  //
  // Status chips: every code span that chips.js reads as a status, in the
  // order of the document, with colour and label; the ones in a footnote
  // definition apart, because the footnotes stand at the end of the page
  // whatever the place of their definitions. And the headings that hold one,
  // with the label their entry in the table of contents and the rail has to
  // read: the heading's text with every code span put as its label. Read as
  // far as the reference document needs it: a code span on one line, outside
  // fenced code; a heading written with "#", outside a quote, with no inline
  // markup besides code spans. Not read: an indented code block, a code span
  // across two lines, a <code> written as HTML.
  const CODE_SPAN = /(`+)(.+?)\1(?!`)/g;
  // A code span loses one blank at each end when it has one at both.
  const spanText = raw => /^ .* $/.test(raw) && raw.trim() ? raw.slice(1, -1) : raw;
  let fenced = false, quote = false, callout = false;
  for (const line of body.split(/\r?\n/)){
    if (/^(```|~~~)/.test(line)){ fenced = !fenced; quote = callout = false; continue; }
    if (fenced) continue;
    const inFootnote = /^\[\^[^\]\s]+\]:/.test(line);
    for (const m of line.matchAll(CODE_SPAN)){
      const status = readChip(spanText(m[2]));
      if (status) (inFootnote ? exp.footnoteChips : exp.chips).push({ colour: status.colour, label: status.label });
    }
    // A status that is the text of a link, "[`🔵 im Test`](…)".
    for (const m of line.matchAll(/\[(`+)(.+?)\1\]\(/g)) if (readChip(spanText(m[2]))) exp.linkedChips++;
    const heading = line.match(/^(#{1,6})[ \t]+(.+?)[ \t]*$/);
    if (heading){
      let chips = 0;
      const label = heading[2].replace(CODE_SPAN, (all, ticks, raw) => {
        const status = readChip(spanText(raw));
        if (status) chips++;
        return status ? status.label : spanText(raw);
      });
      if (chips) exp.chipHeadings.push({ level: heading[1].length, label, chips });
    }
    if (!line.startsWith('>')){ quote = callout = false; continue; }
    const text = line.slice(1).trim();
    if (!quote){
      quote = true;
      const m = text.match(/^\[!(note|tip|important|warning|caution)\]$/i);
      callout = !!m;
      if (m) exp.callouts.push(m[1].toLowerCase());
      continue;
    }
    const h = callout && text.match(/^(#{1,6})[ \t]+(.+?)[ \t]*$/);
    if (!h) continue;
    exp.calloutHeadings.push(h[2]);
    // Numbering knows h2 to h4.
    if (h[1].length >= 2 && h[1].length <= 4) exp.calloutHeadingsNumbered++;
  }
  Object.assign(exp, markerExpectations(body));
  Object.assign(exp, tableExpectations(body));
  return exp;
}

// ---------- tables, read from the Markdown ----------
// As far as the reference document needs it: a Markdown table whose rows
// start with "|", at the beginning of the line, in a quotation ("> |") or
// indented in a list item, cells separated by "|" (a masked "\|" is none, a
// "|" in a code span is not read); and a table written as HTML that starts
// with "<table" at the beginning of a line and ends with "</table>", one
// <tr> with its cells per line, the header row in <thead>.
const stripPrefix = line => line.replace(/^[ \t]*(?:>[ \t]?)*[ \t]*/, '');
const isTableRow = line => /^\|.*\|[ \t]*$/.test(stripPrefix(line));
const isDelimiterRow = line => /^\|[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|[ \t]*$/.test(stripPrefix(line));
const splitRow = line => stripPrefix(line).trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim());
// The table that starts at line i, or null: { end, the first line behind it;
// header, the raw header cells, null when it has none; rows, the raw cells of
// each data row; html, whether it is written as HTML }. A cell of a table
// written as HTML is { text, span }.
function tableAt(lines, i){
  if (isTableRow(lines[i]) && i + 1 < lines.length && isDelimiterRow(lines[i + 1])){
    let end = i + 2;
    while (end < lines.length && isTableRow(lines[end])) end++;
    return { end, html: false, header: splitRow(lines[i]), rows: lines.slice(i + 2, end).map(splitRow) };
  }
  if (/^<table\b/i.test(lines[i])){
    let end = i;
    while (end < lines.length && !/<\/table>/i.test(lines[end])) end++;
    const text = lines.slice(i, end + 1).join('\n');
    const cellsOf = tr => Array.from(tr.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)).map(m => ({ text: m[3], span: Number((m[2].match(/colspan="(\d+)"/i) || [0, 1])[1]) || 1 }));
    const rowsIn = part => Array.from(part.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map(m => cellsOf(m[1]));
    const head = text.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i);
    const headRows = head ? rowsIn(head[1]) : [];
    return { end: end + 1, html: true, header: headRows[0] || null, rows: rowsIn(head ? text.replace(head[0], '') : text) };
  }
  return null;
}
// The value of a cell as the facet filter reads it: its first line as text.
// A status code span is its label, other code its content; emphasis, a link,
// a footnote marker and a masking backslash leave their text.
function cellValue(raw){
  const CODE_SPAN = /(`+)(.+?)\1(?!`)/g;
  const spanText = text => /^ .* $/.test(text) && text.trim() ? text.slice(1, -1) : text;
  const code = [];
  return raw.split(/<br\s*\/?>/i)[0]
    .replace(CODE_SPAN, (all, ticks, text) => { const status = readChip(spanText(text)); code.push(status ? status.label : spanText(text)); return '\0'; })
    .replace(/\[\^[^\]\s]+\]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*{1,3}|~~)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/\\([!-\/:-@[-`{-~])/g, '$1')
    .replace(/\0/g, () => code.shift())
    .replace(/\s+/g, ' ').trim();
}
// The value of a cell of a table written as HTML: its text up to the first <br>.
const htmlCellValue = text => text.split(/<br\s*\/?>/i)[0].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
// What the marker "facets" comes to on a table: planFacets() of the product
// decides, with the headings and the values of the table as read here.
function facetPlan(argument, table){
  if (!table.html){
    return planFacets(argument, table.header.map(cellValue), index => table.rows.map(row => cellValue(row[index] || '')));
  }
  const at = (row, index) => { let from = 0; for (const cell of row){ if (index < from + cell.span) return htmlCellValue(cell.text); from += cell.span; } return ''; };
  const headings = table.header && table.header.flatMap(cell => [htmlCellValue(cell.text), ...Array(cell.span - 1).fill('')]);
  return planFacets(argument, headings, index => table.rows.map(row => at(row, index)));
}
// Every table of the document, in its order: how many there are, which of
// them are wider than the text column, the sub-lines of their cells, the
// emphasised text directly after a "<br>", and how many cells cite a footnote.
// Not read: a sub-line in a table written as HTML, one written with "_" or
// around bold text, a table inside a footnote definition.
function tableExpectations(body){
  const out = { tables: 0, wideTables: [], subLines: [], tableFootnotes: 0 };
  const lines = body.split(/\r?\n/);
  let fenced = false;
  for (let i = 0; i < lines.length; i++){
    if (/^[ \t]*(```|~~~)/.test(lines[i])){ fenced = !fenced; continue; }
    if (fenced) continue;
    const table = tableAt(lines, i);
    if (!table) continue;
    if (!table.html){
      if (table.header.length >= WIDE_COLUMNS) out.wideTables.push(out.tables);
      for (const cell of [table.header, ...table.rows].flat()){
        for (const m of cell.matchAll(/<br\s*\/?>\s*\*(?![*\s])([^*]+?)\*(?!\*)/gi)) out.subLines.push(m[1]);
        if (/\[\^[^\]\s]+\]/.test(cell)) out.tableFootnotes++;
      }
    }
    out.tables++;
    i = table.end - 1;
  }
  return out;
}

// Block markers: every comment that markers.js reads as a marker, in the order
// of the document, with the block that follows it, and what judgeMarker() says
// it comes to: cards, a step list, or a warning with its text. For cards the
// title of each item, the bold text it starts with; for a step list the number
// of each item and its actor, the emphasised text with a colon it starts with.
// For a facet filter the legend, the controls with their counts and the key of
// every data row, or the warning of a marker its component refuses; both from
// planFacets() of the product, on the table as tableAt() reads it.
// Read as far as the reference document needs it: a comment on one line; a
// marker on a line of its own at the beginning of the line, alone or with
// other comments, has the block behind it, any other has none; a list whose
// items start at the beginning of a line with "-" or "1.", each item on one
// line, with blank lines between items or indented lines behind them; a table
// that starts with "|" or with "<table". Not read: a comment across several lines, a marker in
// a quotation or in a list item, an item that goes on in a line that is not
// indented, the same marker twice before one block. A document with one of
// these fails the counts although the build is right.
// Counted as well: the steps that cite a footnote; see assertStepFootnote().
// Counted beside them: the comments that are no markers, which have to stay,
// and the places where a marker stands as code, a code span or a fenced block.
function markerExpectations(body){
  const out = { cards: [], steps: [], facets: [], markerWarnings: [], comments: 0, markersAsCode: 0, stepFootnotes: 0 };
  const COMMENT = /<!--([\s\S]*?)-->/g;
  const CODE_SPAN = /(`+)(.+?)\1(?!`)/g;
  const AS_CODE = /<!--\s*dokufix:/i;
  const BULLET = /^[-*+][ \t]+(.*)$/, NUMBERED = /^(\d{1,9})[.)][ \t]+(.*)$/;
  const lines = body.split(/\r?\n/);
  // Which lines belong to fenced code, the fences included.
  let fenced = false, fenceHasMarker = false;
  const inFence = lines.map(line => {
    if (/^(```|~~~)/.test(line)){ fenced = !fenced; if (fenced) fenceHasMarker = false; return true; }
    if (fenced && AS_CODE.test(line) && !fenceHasMarker){ fenceHasMarker = true; out.markersAsCode++; }
    return fenced;
  });
  const withoutCode = line => line.replace(CODE_SPAN, '');
  const onlyComments = line => /<!--/.test(line) && withoutCode(line).replace(COMMENT, '').trim() === '';
  // The block that starts at the first line from `from` on that is neither
  // blank nor only comments: its tag, and for a list its items.
  const blockAfter = from => {
    let i = from;
    while (i < lines.length && !inFence[i] && (!lines[i].trim() || onlyComments(lines[i]))) i++;
    if (i >= lines.length || inFence[i]) return { tag: i < lines.length ? 'PRE' : '' };
    const start = BULLET.test(lines[i]) ? BULLET : NUMBERED.test(lines[i]) ? NUMBERED : null;
    if (!start){
      const table = tableAt(lines, i);
      return table ? { tag: 'TABLE', table } : { tag: 'P' };
    }
    const items = [];
    for (; i < lines.length && !inFence[i]; i++){
      const m = lines[i].match(start);
      if (m){ items.push(start === BULLET ? { text: m[1] } : { text: m[2], written: Number(m[1]) }); continue; }
      if (/^[ \t]+\S/.test(lines[i])) continue;                 // an indented line belongs to the item before it
      if (lines[i].trim()) break;
      // A blank line: the list goes on when an item or an indented line follows.
      let next = i + 1;
      while (next < lines.length && !lines[next].trim()) next++;
      if (next >= lines.length || inFence[next] || !(start.test(lines[next]) || /^[ \t]+\S/.test(lines[next]))) break;
    }
    return { tag: start === BULLET ? 'UL' : 'OL', items };
  };
  const titleOf = text => { const m = text.match(/^\*\*(?!\*)(.+?)\*\*(?!\*)/); return m ? m[1] : null; };
  const actorOf = text => { const m = text.match(/^([*_])(?!\1)([^*_]*?\S)\s*:\s*\1(?!\1)/); return m ? m[2] : null; };
  lines.forEach((line, i) => {
    if (inFence[i]) return;
    for (const m of line.matchAll(CODE_SPAN)) if (AS_CODE.test(m[2])) out.markersAsCode++;
    const bare = withoutCode(line);
    const alone = bare.startsWith('<!--') && onlyComments(line);
    for (const m of bare.matchAll(COMMENT)){
      const marker = readMarker(m[1]);
      if (!marker){ out.comments++; continue; }
      const block = alone ? blockAfter(i + 1) : { tag: '' };
      const verdict = judgeMarker(marker, block.tag);
      if (verdict.warning) out.markerWarnings.push(verdict.warning);
      else if (verdict.entry.name === 'cards') out.cards.push(block.items.map(item => titleOf(item.text)));
      else if (verdict.entry.name === 'steps'){
        out.steps.push(block.items.map((item, n) => ({ number: String(block.items[0].written + n), actor: actorOf(item.text) })));
        out.stepFootnotes += block.items.filter(item => /\[\^[^\]\s]+\]/.test(item.text)).length;
      }
      else if (verdict.entry.name === 'facets'){
        // The component may still refuse the table; a facet filter is applied
        // to a table once, as every component is to its block.
        const plan = facetPlan(marker.argument, block.table);
        if (plan.warning) out.markerWarnings.push(refusedMarker(marker, plan.warning));
        else out.facets.push({ legend: plan.legend, controls: [[FACET_ALL, block.table.rows.length], ...plan.groups.map(g => [g.label, g.count])], keys: plan.keys });
      }
      else throw new Error('the run has no expectation for the marker "' + verdict.entry.name + '"');
    }
  });
  return out;
}

// Deterministic Date and Math.random for one context; see the header. Every
// reading of the clock advances it by one millisecond, starting at FIXED_NOW.
async function freeze(context){
  await context.addInitScript(start => {
    let seed = 0x9e3779b9;
    Math.random = () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const RealDate = Date;
    let ticks = 0;
    globalThis.Date = class extends RealDate {
      constructor(...args){ if (args.length) super(...args); else super(start + ticks++); }
      static now(){ return start + ticks++; }
    };
  }, FIXED_NOW.getTime());
}

// ---------- build: one document, four exports ----------
async function buildExports(browser, opts, md, dir){
  const context = await browser.newContext({ ...CONTEXT, viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  await freeze(context);
  const page = await context.newPage();
  const libs = [];
  page.on('response', r => {
    if (!r.url().includes('cdn.jsdelivr.net')) return;
    libs.push({ url: r.url(), status: r.status(), version: r.headers()['x-jsd-version'] || '' });
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  // The "Mit Editor" download asks for a version description.
  page.on('dialog', d => d.accept('Referenzstand'));

  await page.goto(pathToFileURL(opts.file).href);
  // The rail is the last thing the first render builds, and that render is the
  // last step of init: with the rail filled, init is done and nothing is still
  // rendering. Wait for that before touching the source.
  await page.waitForFunction(() => !!document.querySelector('#dokufix-rail.has-items'), null, { timeout: 90000 });

  if (md !== null){
    // The page is in view mode and its toolbar hidden, so "Rendern" is pressed
    // through the DOM. The marker in the rail is gone once the render is done.
    await page.evaluate(text => {
      const el = document.getElementById('source');
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      const marker = document.createElement('i');
      marker.id = 'vergleich-render-pending';
      document.getElementById('dokufix-rail').appendChild(marker);
      document.getElementById('render-btn').click();
    }, md);
    await page.waitForFunction(() => !document.getElementById('vergleich-render-pending'), null, { timeout: 90000 });
  }
  const source = await page.evaluate(() => document.getElementById('source').value);

  await page.click('#edit-btn'); // the download menu lives in the editor toolbar
  const sizes = {};
  const files = {};
  // A facet that is chosen while a file is written: the file has to open with
  // all rows all the same (assertTables()). Chosen anew before every download,
  // because a read-only download renders, and a render starts with all rows.
  const chosen = [];
  for (const v of VARIANTS){
    chosen.push(await page.evaluate(() => {
      const input = document.querySelector('#preview .dokufix-facets .dokufix-facet-bar label:nth-of-type(2) input');
      if (!input) return null;
      input.closest('label').click();
      return input.checked;
    }));
    await page.click('#download-btn');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.click('button[data-download="' + v.download + '"]'),
    ]);
    const file = path.join(dir, v.key + '.html');
    await download.saveAs(file);
    await page.waitForFunction(() => !document.querySelector('button[data-download]:disabled'));
    files[v.key] = file;
    sizes[v.key] = fs.statSync(file).size;
  }
  await context.close();
  libs.sort((x, y) => x.url.localeCompare(y.url));
  return { files, sizes, libs, errors, source, chosen };
}

// ---------- reopen ----------
async function openVariant(launch, file, key, exp, width, scheme){
  const browser = await launch();
  const context = await browser.newContext({ ...CONTEXT, viewport: { width, height: 1000 }, colorScheme: scheme });
  await freeze(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(pathToFileURL(file).href);
  if (key === 'mit-editor'){
    // A saved file has an empty preview; content in it means init has run.
    await page.waitForFunction(n =>
      document.querySelectorAll('#preview .mermaid svg').length >= n &&
      document.querySelector('#preview') && document.querySelector('#preview').children.length > 0,
      exp.mermaid, { timeout: 90000 });
  } else if (key === 'schlank'){
    await page.waitForFunction(() => !document.querySelector('[data-gz]'), null, { timeout: 30000 });
  } else if (key === 'kompakt'){
    await page.waitForFunction(() => {
      const d = document.getElementById('d');
      return d && d.children.length > 0 && !document.querySelector('.dokufix-rail-pending');
    }, null, { timeout: 30000 });
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
  });
  await page.waitForTimeout(250);
  return { close: () => browser.close(), page, errors };
}

const NO_FALLBACKS = '.dokufix-fn-preview{position-try-fallbacks:none !important}';

const shot = (page, file) => page.screenshot({ path: file, fullPage: true, animations: 'disabled', caret: 'hide' });

// Every state the document styles cover that a screenshot at rest does not show:
// heading numbering, the open metadata panel, a revealed footnote preview and the
// landing highlight with its marked return arrow.
async function enterStates(page, browserName){
  if (browserName === 'firefox') await page.addStyleTag({ content: NO_FALLBACKS }); // see header
  await page.evaluate(() => {
    document.body.classList.add('numbered');
    const fm = document.querySelector('details.dokufix-frontmatter');
    if (fm) fm.open = true;
    const li = Array.from(document.querySelectorAll('.footnotes li'))
      .find(x => x.querySelectorAll('a[data-footnote-backref]').length > 1);
    const back = li && li.querySelectorAll('a[data-footnote-backref]')[1];
    if (back && back.id) location.hash = '#' + back.id;
    // Back to the top: Firefox does not paint a preview whose marker is scrolled
    // out of view, and the first marker sits in the first paragraph.
    window.scrollTo(0, 0);
    const marker = document.querySelector('a[data-footnote-ref]');
    if (marker) marker.focus({ preventScroll: true });
  });
  await page.waitForTimeout(500);
}

// ---------- the link "license information" ----------
// What a page shows of the link and its view, and where the document stands.
// The element is a <details>: the link is its summary, the view its content.
// An editor file has two, one in the toolbar and one in <body> for read mode;
// "shown" is the one that is rendered. options.without: measure the document
// with every such element taken out of the page, and put them back.
const licenceFacts = (page, options = {}) => page.evaluate(opts => {
  const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  // Rendered and not hidden: not display:none, not inside a closed <details>,
  // not visibility:hidden, and with a size.
  const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return el.checkVisibility({ visibilityProperty: true }) && r.width > 0 && r.height > 0; };
  const all = Array.from(document.querySelectorAll('details.dokufix-licences'));
  const places = all.map(el => [el, el.parentNode, el.nextSibling]);
  const where = all.map(el => ({
    parent: el.parentElement.tagName.toLowerCase() + (el.parentElement.id ? '#' + el.parentElement.id : ''),
    first: el === el.parentElement.firstElementChild,
    next: el.nextElementSibling ? el.nextElementSibling.tagName.toLowerCase() + (el.nextElementSibling.id ? '#' + el.nextElementSibling.id : '') : '',
    transient: el.hasAttribute('data-dokufix-transient'), open: el.open,
  }));
  const el = all.find(d => d.getClientRects().length > 0) || null;
  const summary = el && el.querySelector(':scope > summary');
  const view = el && el.querySelector(':scope > .dokufix-licences-view');
  const facts = {
    where, shownIn: el ? where[all.indexOf(el)].parent : '', open: el ? el.open : null,
    link: box(summary), linkVisible: visible(summary), linkText: summary ? summary.textContent : null,
    view: box(view), viewVisible: visible(view), viewText: view ? view.textContent : '',
    entries: view ? Array.from(view.querySelectorAll('li > strong:first-child')).map(x => x.textContent) : [],
    // What lies on top in the middle of the view: the view itself when it lies over the page.
    viewOnTop: (() => {
      if (!visible(view)) return false;
      const r = view.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + r.height / 2, innerHeight - 2));
      return !!top && view.contains(top);
    })(),
  };
  if (opts.without) all.forEach(x => x.remove());
  // The content container: the preview in the editor file, <main> in a read-only export.
  const root = document.querySelector('#preview') || document.querySelector('main.reader-body');
  const rs = getComputedStyle(root), rr = root.getBoundingClientRect();
  const first = root.firstElementChild;
  const rail = document.querySelector('.dokufix-rail');
  // The text column: the content container without its padding. Its top is
  // where the first line of the document can start.
  facts.column = { left: rr.left + parseFloat(rs.paddingLeft), right: rr.right - parseFloat(rs.paddingRight), top: rr.top + parseFloat(rs.paddingTop) };
  // Where the document stands. All of it is the same with the element taken
  // out, closed and open, or the element moves something.
  facts.doc = {
    root: [rr.left, rr.top, rr.width, rr.height].join(' '),
    first: first ? (() => { const r = first.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].join(' '); })() : '',
    rail: rail ? (() => { const r = rail.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].join(' '); })() : '',
    toolbar: ['header', '#numbering-btn', '#view-btn'].map(sel => { const x = document.querySelector(sel); if (!x) return ''; const r = x.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].join(' '); }).join(' | '),
    page: document.documentElement.scrollWidth + ' x ' + document.documentElement.scrollHeight,
  };
  facts.rail = rail && rail.getClientRects().length ? box(rail) : null;
  facts.button = box(document.getElementById('edit-btn'));
  facts.window = { width: document.documentElement.clientWidth, height: innerHeight, scrollY };
  if (opts.without) places.forEach(([x, parent, next]) => parent.insertBefore(x, next));
  return facts;
}, options);
const round = b => b ? [b.left, b.top, b.right, b.bottom].map(n => Math.round(n * 10) / 10).join(' ') : 'none';
const overlap = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
// What is wrong with the place of the link in read mode or in an export, as a
// list; empty when it stands where it should. In the empty top margin, above
// the first line, inside the window; its right edge on the right edge of the
// text column, so never above the rail. One exception, the editor file in a
// narrow window: there "Editor ↩" stands in that corner, and the link stands
// left of it.
function licencePlaceProblems(f, key, width){
  const problems = [];
  const l = f.link, c = f.column, EPS = 0.6;
  if (!l || !f.linkVisible) return ['the link is not visible'];
  if (f.linkText !== LICENCES_LINK_TEXT) problems.push('it reads ' + JSON.stringify(f.linkText));
  if (f.open) problems.push('its view is open');
  if (f.shownIn !== 'body') problems.push('it stands in ' + f.shownIn + ', not in <body>');
  if (l.top < 0 || l.bottom > c.top + EPS) problems.push('not in the top margin above the first line (link ' + round(l) + ', first line at ' + c.top + ')');
  if (l.left < 0 || l.right > f.window.width + EPS) problems.push('not inside the window (link ' + round(l) + ', window ' + f.window.width + ')');
  if (l.left < c.left - EPS || l.right > c.right + EPS) problems.push('not inside the text column (link ' + round(l) + ', column ' + c.left + '–' + c.right + ')');
  const besideButton = key === 'mit-editor' && width <= NARROW;
  if (besideButton){
    if (!f.button || l.right > f.button.left) problems.push('not left of "Editor ↩" (link ' + round(l) + ', button ' + round(f.button) + ')');
  } else if (Math.abs(l.right - c.right) > EPS){
    problems.push('its right edge is not the text column\'s (link ' + round(l) + ', column ends at ' + c.right + ')');
  }
  if (f.rail && l.right > f.rail.left) problems.push('it stands above the rail (link ' + round(l) + ', rail ' + round(f.rail) + ')');
  if (key === 'mit-editor' && overlap(l, f.button)) problems.push('it overlaps "Editor ↩" (link ' + round(l) + ', button ' + round(f.button) + ')');
  return problems;
}
// What the open view has to show, as a list of what is missing or wrong.
function licenceViewProblems(f){
  const problems = [];
  if (!f.open || !f.viewVisible) return ['the view is not open (open ' + f.open + ', visible ' + f.viewVisible + ')'];
  if (JSON.stringify(f.entries) !== JSON.stringify(NOTICES.map(n => n.name))) problems.push('entries ' + JSON.stringify(f.entries));
  const missing = LICENCE_TEXTS_SHOWN.filter(t => !f.viewText.includes(t));
  if (missing.length) problems.push('missing: ' + missing.map(t => JSON.stringify(t.slice(0, 50))).join(', '));
  if (f.view.left < 0 || f.view.right > f.window.width + 0.6 || f.view.top < 0) problems.push('not inside the window (view ' + round(f.view) + ', window ' + f.window.width + ')');
  return problems;
}
// The link and its view in one page, at the size the page has: the document
// stands where it stands without the element; a click on the link opens the
// view over the page and moves nothing; a second click closes it.
// selector: the summary to click.
async function assertLicenceOpens(page, check, selector, what){
  const without = await licenceFacts(page, { without: true });
  const closed = await licenceFacts(page);
  // A file without the link, or with a link nobody can see: one failed check,
  // and no click that would wait for it.
  if (!closed.linkVisible){
    check(what + ': there is a link to click', false, 'the link is not visible');
    return { closed, open: closed };
  }
  check(what + ': the document stands where it stands without the link', JSON.stringify(closed.doc) === JSON.stringify(without.doc),
    'with ' + JSON.stringify(closed.doc) + ', without ' + JSON.stringify(without.doc));
  await page.click(selector, { timeout: 5000 }).catch(() => {});
  const open = await licenceFacts(page);
  const viewProblems = licenceViewProblems(open);
  check(what + ': a click opens the view, which names the ' + NOTICES.length + ' entries with version, licence and copyright lines, and the licence text',
    viewProblems.length === 0, viewProblems.join('; '));
  check(what + ': the open view lies over the page and moves nothing', open.viewOnTop && JSON.stringify(open.doc) === JSON.stringify(closed.doc) && round(open.link) === round(closed.link),
    'on top ' + open.viewOnTop + '; closed ' + JSON.stringify(closed.doc) + ', open ' + JSON.stringify(open.doc) + '; link ' + round(closed.link) + ' → ' + round(open.link));
  await page.click(selector, { timeout: 5000 }).catch(() => {});
  const again = await licenceFacts(page);
  check(what + ': a second click closes it', again.open === false && !again.viewVisible && JSON.stringify(again.doc) === JSON.stringify(closed.doc),
    'open ' + again.open + ', view visible ' + again.viewVisible);
  return { closed, open };
}
// A read-only export with scripts switched off: the link is there, opens and closes.
async function assertLicenceWithoutScripts(launch, file, check){
  const browser = await launch();
  try {
    const context = await browser.newContext({ ...CONTEXT, viewport: { width: 1400, height: 1000 }, javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(pathToFileURL(file).href);
    const f = await licenceFacts(page);
    check('licence link with scripts off: visible, in the top margin, inside the window',
      f.linkVisible && f.linkText === LICENCES_LINK_TEXT && f.link.top >= 0 && f.link.bottom <= f.column.top + 0.6 && f.link.left >= 0 && f.link.right <= f.window.width,
      JSON.stringify({ visible: f.linkVisible, text: f.linkText, link: round(f.link), firstLine: f.column.top }));
    await assertLicenceOpens(page, check, 'details.dokufix-licences > summary', 'licence link with scripts off');
  } finally {
    await browser.close();
  }
}

// ---------- status chips ----------
// What a page shows of its chips. Three places: the document, the footnotes at
// its end, and the previews of the footnotes, which are copies and hidden at
// rest. What only a visible chip can show is asked of the first two.
const chipFacts = page => page.evaluate(() => {
  const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
  const colourOf = el => (el.className.match(/dokufix-chip-(?!status)([a-z]+)/) || [0, ''])[1];
  const fact = chip => {
    const word = chip.querySelector(':scope > .dokufix-chip-status');
    const cs = getComputedStyle(chip), ms = getComputedStyle(chip, '::before'), ws = word && getComputedStyle(word);
    const r = chip.getBoundingClientRect(), wr = word && word.getBoundingClientRect();
    const last = chip.lastChild;
    return {
      colour: colourOf(chip), tag: chip.tagName,
      // The label is the chip's own text, behind the word.
      label: last && last.nodeType === 3 ? last.data : null,
      visible: chip.checkVisibility({ visibilityProperty: true }) && r.width > 0 && r.height > 0,
      text: cs.color, tint: cs.backgroundColor, radius: cs.borderTopLeftRadius, display: cs.display,
      font: cs.fontSize + ' ' + cs.fontWeight + ' ' + cs.textTransform, family: cs.fontFamily,
      linked: !!chip.closest('a[href]'), underlined: /underline/.test(cs.textDecorationLine),
      // The word is placed against its chip: it scrolls with it wherever the chip stands.
      position: cs.position, wordInChip: !!word && word.offsetParent === chip,
      mark: { content: ms.content, display: ms.display, width: parseFloat(ms.width), height: parseFloat(ms.height), image: ms.backgroundImage, colour: ms.color },
      word: word ? word.textContent : null, wordFirst: !!word && word === chip.firstChild,
      // Hidden from the eye, not from a screen reader: it is rendered, it is
      // not visibility:hidden, and it takes no more room than one pixel.
      wordRendered: !!word && ws.display !== 'none' && ws.visibility === 'visible' && !word.closest('[aria-hidden="true"]'),
      wordBox: word ? Math.round(wr.width * 10) / 10 + ' x ' + Math.round(wr.height * 10) / 10 : '',
      wordHidden: !!word && ws.position === 'absolute' && ws.overflow === 'hidden' && ws.clipPath === 'inset(50%)' && wr.width <= 1 && wr.height <= 1,
      wordCase: ws ? ws.textTransform : '',
    };
  };
  const all = Array.from(root.querySelectorAll('.dokufix-chip'));
  const inPreview = c => !!c.closest('.dokufix-fn-preview'), inFootnotes = c => !!c.closest('.footnotes');
  // The label of a heading as its entries have to read it: its text without
  // the word of a chip and without a footnote preview.
  const labelOf = h => { const c = h.cloneNode(true); c.querySelectorAll('.dokufix-chip-status, .dokufix-fn-preview').forEach(n => n.remove()); return c.textContent; };
  const entry = (sel, id) => { const a = Array.from(document.querySelectorAll(sel)).find(x => x.getAttribute('href') === '#' + id); return a ? a.textContent : null; };
  return {
    body: all.filter(c => !inPreview(c) && !inFootnotes(c)).map(fact),
    footnotes: all.filter(c => !inPreview(c) && inFootnotes(c)).map(fact),
    // A preview is a copy of its definition: as many chips in it as there.
    previews: Array.from(root.querySelectorAll('sup.dokufix-fn-host')).map(sup => {
      const href = (sup.querySelector(':scope > a[data-footnote-ref]') || { getAttribute: () => '' }).getAttribute('href') || '';
      const target = href.length > 1 ? document.getElementById(href.slice(1)) : null;
      const li = target && target.closest('.footnotes li');
      const preview = sup.querySelector(':scope > .dokufix-fn-preview');
      return { definition: li ? li.querySelectorAll('.dokufix-chip').length : -1, preview: preview ? preview.querySelectorAll('.dokufix-chip').length : -1 };
    }).filter(x => x.definition !== 0 || x.preview !== 0),
    // Every inline code element that is left, by its text: none of them a status.
    code: Array.from(root.querySelectorAll('code')).filter(c => !c.closest('pre')).map(c => c.textContent),
    headings: Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(h => !h.closest('.dokufix-callout') && h.querySelector('.dokufix-chip')).map(h => ({
      level: Number(h.tagName[1]), id: h.id, label: labelOf(h), text: h.textContent, chips: h.querySelectorAll('.dokufix-chip').length,
      toc: entry('nav.dokufix-toc a', h.id), rail: entry('.dokufix-rail a', h.id),
    })),
    emptyEntries: Array.from(document.querySelectorAll('nav.dokufix-toc a, .dokufix-rail a')).filter(a => !a.textContent.trim()).map(a => a.getAttribute('href')),
    hasToc: !!document.querySelector('nav.dokufix-toc'), railLinks: document.querySelectorAll('.dokufix-rail a').length,
  };
});
// The marks, photographed. For each colour the page has, a copy of its first
// chip with the label "x", all in one colour (CHIPS_ONE_COLOUR), and a second
// copy of the first as the control. Two pictures of the same chip have to be
// equal, two of different colours have to differ by the shape of the mark.
async function chipMarkPictures(page, colours, keep){
  const tag = await page.addStyleTag({ content: CHIPS_ONE_COLOUR });
  await page.evaluate(list => {
    const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
    const row = document.createElement('div');
    row.id = 'vergleich-chips';
    [...list, list[0]].forEach((colour, i) => {
      const copy = root.querySelector('.dokufix-chip-' + colour + ':not(.dokufix-fn-preview *)').cloneNode(true);
      copy.lastChild.data = 'x';
      copy.style.top = (20 + i * 40) + 'px';
      row.append(copy);
    });
    root.appendChild(row);
  }, colours);
  const pictures = [];
  try {
    for (let i = 0; i <= colours.length; i++) pictures.push(await page.locator('#vergleich-chips > .dokufix-chip').nth(i).screenshot({ animations: 'disabled' }));
    // Kept beside the exports when the run is asked to: what the check looked at.
    if (keep) pictures.forEach((png, i) => fs.writeFileSync(keep + '-' + (i < colours.length ? colours[i] : 'kontrolle') + '.png', png));
  } finally {
    await page.evaluate(() => { const row = document.getElementById('vergleich-chips'); if (row) row.remove(); window.scrollTo(0, 0); });
    await tag.evaluate(el => el.remove());
  }
  return pictures;
}
async function assertChips(page, check, exp, keep){
  const f = await chipFacts(page);
  const short = list => JSON.stringify(list.map(c => c.colour + ' ' + c.label));
  const sorted = list => list.map(c => c.colour + ' ' + c.label).sort();
  const stillCode = f.code.filter(text => readChip(text));
  check('status chips: one per status code span, in the order of the document, each with the colour of its dot and its label; none left as code',
    short(f.body) === short(exp.chips) && JSON.stringify(sorted(f.footnotes)) === JSON.stringify(sorted(exp.footnoteChips)) && stillCode.length === 0,
    short(f.body) + ', expected ' + short(exp.chips) + '; in footnotes ' + short(f.footnotes) + ', expected ' + short(exp.footnoteChips) + '; still code: ' + JSON.stringify(stillCode));
  check('no entry of the table of contents or the rail is empty', f.emptyEntries.length === 0, JSON.stringify(f.emptyEntries));
  const shown = [...f.body, ...f.footnotes];
  if (!exp.chips.length && !exp.footnoteChips.length) return;

  const bad = (what, test) => shown.filter(c => !test(c, CHIPS[c.colour] || {})).map(c => c.colour + ' ' + JSON.stringify(c.label) + ': ' + JSON.stringify(what(c)));
  const labels = bad(c => [c.tag, c.visible, c.label], c => c.tag === 'SPAN' && c.visible && !!c.label && c.label.trim() === c.label);
  check('every chip shows its label: visible, the dot gone', labels.length === 0, labels.join(' | '));
  const styles = bad(c => [c.text, c.tint, c.radius, c.display, c.font, c.family, c.mark],
    (c, want) => c.text === want.text && c.mark.colour === want.colour && c.tint === want.tint && c.radius === '10px' && c.display === 'inline-block' && c.font === '11px 400 uppercase' && /monospace/.test(c.family) &&
      (c.mark.content === '""' || c.mark.content === "''") && c.mark.display === 'inline-block' && c.mark.width >= 8 && c.mark.height >= 8 && c.mark.image === 'none');
  check('every chip is styled: a pill in small capitals of the monospace stack, the label in the dark shade of its class and the mark in its colour on its tint, the mark drawn without an image', styles.length === 0, styles.join(' | '));
  const words = bad(c => [c.word, c.wordFirst, c.wordRendered, c.wordHidden, c.wordBox, c.wordCase],
    (c, want) => c.word === want.word + ': ' && c.wordFirst && c.wordRendered && c.wordHidden && c.wordCase === 'none');
  check('every chip names its colour as text for assistive technology: before the label, rendered, and not visible', words.length === 0, words.join(' | '));
  const placed = bad(c => [c.position, c.wordInChip], c => c.position === 'relative' && c.wordInChip);
  check('the hidden text of every chip is placed against its chip, not against the page', placed.length === 0, placed.join(' | '));
  // A chip has its own colour and is a box of its own, so the underline of a
  // link around it does not reach it. It has to carry one itself.
  const links = shown.filter(c => c.linked !== c.underlined);
  check('a chip in a link is underlined, and no other chip is: ' + exp.linkedChips + ' in the document',
    links.length === 0 && shown.filter(c => c.linked).length === exp.linkedChips,
    shown.filter(c => c.linked).length + ' chips in a link; wrong: ' + short(links));
  // What a screen reader is handed, as far as a run can ask: the accessible
  // text of the first chip of each colour, as Playwright reads it from the page.
  const colours = Object.keys(CHIPS).filter(colour => shown.some(c => c.colour === colour));
  const spoken = [];
  for (const colour of colours){
    const want = CHIPS[colour].word + ': ' + shown.find(c => c.colour === colour).label;
    const snapshot = await page.locator('.dokufix-chip-' + colour + ':not(.dokufix-fn-preview *)').first().ariaSnapshot().catch(e => 'no snapshot: ' + e.message.split('\n')[0]);
    if (!snapshot.toLowerCase().includes(want.toLowerCase())) spoken.push(colour + ': ' + JSON.stringify(snapshot) + ', expected ' + JSON.stringify(want));
  }
  check('the accessible text of a chip is the name of its colour and its label', spoken.length === 0, spoken.join(' | '));
  const sameLabel = shown.filter(c => shown.some(d => d.label === c.label && d.colour !== c.colour));
  if (sameLabel.length){
    const alike = sameLabel.filter(c => sameLabel.some(d => d.label === c.label && d.colour !== c.colour && d.word === c.word));
    check('two chips with the same label and different colours differ in their text for assistive technology', alike.length === 0, short(alike));
  }
  if (f.previews.length){
    const unequal = f.previews.filter(x => x.definition !== x.preview);
    check('a chip in a footnote is a chip in the preview of that footnote', unequal.length === 0, JSON.stringify(f.previews));
  }

  // --- without colour: the marks differ pairwise in their shape
  if (colours.length > 1){
    const pictures = await chipMarkPictures(page, colours, keep);
    const control = comparePng(pictures[0], pictures[colours.length], null).differing;
    const close = [];
    for (let i = 0; i < colours.length; i++){
      for (let j = i + 1; j < colours.length; j++){
        const d = comparePng(pictures[i], pictures[j], null).differing;
        if (d < MARK_MIN_DIFFERENCE) close.push(colours[i] + ' and ' + colours[j] + ': ' + d + ' px');
      }
    }
    check('all in one colour, the chips of ' + colours.length + ' colours still differ pairwise: the mark of each has a shape of its own',
      control === 0 && close.length === 0, 'two pictures of the same chip differ in ' + control + ' px; ' + close.join(' | '));
  }

  // --- a chip in a heading: the entry reads the label, the anchor is the one of that text
  const want = exp.chipHeadings;
  check('headings with a chip: the ones the document has, each entry reading the heading\'s text with the chip\'s label and nothing of its colour',
    JSON.stringify(f.headings.map(h => [h.level, h.label, h.chips])) === JSON.stringify(want.map(h => [h.level, h.label, h.chips])),
    JSON.stringify(f.headings.map(h => [h.level, h.label, h.chips])) + ', expected ' + JSON.stringify(want.map(h => [h.level, h.label, h.chips])));
  if (f.headings.length){
    const anchors = f.headings.filter(h => { const slug = slugify(h.label, new Set()); return !(h.id === slug || (h.id.startsWith(slug + '-') && /^\d+$/.test(h.id.slice(slug.length + 1)))); });
    check('headings with a chip: the anchor is the one of the entry\'s text', anchors.length === 0, JSON.stringify(anchors.map(h => [h.label, h.id])));
    const entries = f.headings.filter(h =>
      (f.hasToc && h.level >= 2 && h.level <= exp.tocDepth && h.toc !== h.label) ||
      (f.railLinks > 0 && h.level >= 2 && h.level <= 4 && h.rail !== h.label) ||
      !h.label.trim() || h.text === h.label);
    check('headings with a chip: in the table of contents and in the rail under that text, never empty; the heading itself keeps the word for assistive technology',
      entries.length === 0, JSON.stringify(entries));
  }
}

// ---------- block markers: cards, step lists, warnings ----------
// What a page shows of its cards, its step lists and its warnings, and which
// comments are left in the document.
const markerFacts = page => page.evaluate(() => {
  const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
  const round = n => Math.round(n * 10) / 10;
  const box = el => { const r = el.getBoundingClientRect(); return { left: round(r.left), top: round(r.top), right: round(r.right), bottom: round(r.bottom), width: round(r.width), height: round(r.height) }; };
  const visible = el => { const r = el.getBoundingClientRect(); return el.checkVisibility({ visibilityProperty: true }) && r.width > 0 && r.height > 0; };
  const edges = cs => ['Top', 'Right', 'Bottom', 'Left'].map(side => cs['border' + side + 'Width'] + ' ' + cs['border' + side + 'Style'] + ' ' + cs['border' + side + 'Color']);
  // The first node of an item that is not blank, looked for in its first
  // paragraph when it has one; a step's number does not count.
  const lead = li => {
    const real = node => { let n = node.firstChild; while (n && ((n.nodeType === 3 && !n.data.trim()) || (n.nodeType === 1 && n.classList.contains('dokufix-step-number')))) n = n.nextSibling; return n; };
    const first = real(li);
    return first && first.nodeType === 1 && first.tagName === 'P' ? real(first) : first;
  };
  // Where the text behind an element starts, inside the element's parent.
  const textAfter = el => {
    const range = document.createRange();
    range.setStartAfter(el);
    range.setEndAfter(el.parentNode.lastChild);
    const rect = Array.from(range.getClientRects()).find(r => r.width > 0 && r.height > 0);
    return rect ? { left: round(rect.left), top: round(rect.top) } : null;
  };
  const comments = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('.mermaid')) comments.push(walker.currentNode.data);
  return {
    window: document.documentElement.clientWidth,
    comments,
    // A marker that stands as code: the code elements that hold its text.
    asCode: Array.from(root.querySelectorAll('code')).filter(c => /<!--\s*dokufix:/i.test(c.textContent)).length,
    cards: Array.from(root.querySelectorAll('.dokufix-cards')).map(list => {
      const cs = getComputedStyle(list);
      return {
        tag: list.tagName, display: cs.display, marker: cs.listStyleType, box: box(list),
        items: Array.from(list.children).map(li => {
          const ls = getComputedStyle(li), first = lead(li);
          const title = first && first.nodeType === 1 && first.classList.contains('dokufix-card-title') ? first : null;
          return {
            tag: li.tagName, visible: visible(li), box: box(li), edges: edges(ls), radius: ls.borderTopLeftRadius,
            title: title ? title.textContent : null, titleTag: title ? title.tagName : '', titleDisplay: title ? getComputedStyle(title).display : '',
            // Its text starts below the title, when it has both.
            below: title && textAfter(title) ? textAfter(title).top >= box(title).bottom - 1 : null,
            // A title the pass marked that is not the first thing in its item.
            strayTitles: li.querySelectorAll('.dokufix-card-title').length - (title ? 1 : 0),
          };
        }),
      };
    }),
    steps: Array.from(root.querySelectorAll('.dokufix-steps')).map(list => {
      const cs = getComputedStyle(list);
      return {
        tag: list.tagName, marker: cs.listStyleType, start: list.getAttribute('start'),
        items: Array.from(list.children).map(li => {
          const ls = getComputedStyle(li), number = li.querySelector(':scope > .dokufix-step-number');
          const ns = number && getComputedStyle(number), first = lead(li);
          const actor = first && first.nodeType === 1 && first.classList.contains('dokufix-step-actor') ? first : null;
          const as = actor && getComputedStyle(actor);
          // Where the step's own text starts: behind the actor, or behind the number.
          const text = actor ? textAfter(actor) : (number && (() => {
            const range = document.createRange();
            range.selectNodeContents(li);
            range.setStartAfter(number);
            const rect = Array.from(range.getClientRects()).find(r => r.width > 0 && r.height > 0);
            return rect ? { left: round(rect.left), top: round(rect.top) } : null;
          })());
          return {
            tag: li.tagName, box: box(li), position: ls.position, indent: parseFloat(ls.paddingLeft),
            number: number ? number.textContent : null, numberFirst: !!number && number === li.firstChild, numberTag: number ? number.tagName : '',
            numberVisible: !!number && visible(number), tile: number ? box(number) : null, tint: ns ? ns.backgroundColor : '', placed: ns ? ns.position : '',
            actor: actor ? actor.textContent : null, actorTag: actor ? actor.tagName : '', actorBox: actor ? box(actor) : null,
            actorLook: as ? [as.display, as.fontStyle, as.textTransform, as.color].join(' ') : '',
            text, strayActors: li.querySelectorAll(':scope > .dokufix-step-actor, :scope > p > .dokufix-step-actor').length - (actor ? 1 : 0),
            inline: li.querySelectorAll('[style]').length + (li.hasAttribute('style') ? 1 : 0),
          };
        }),
      };
    }),
    warnings: Array.from(root.querySelectorAll('.dokufix-warning')).map(w => {
      const cs = getComputedStyle(w);
      return {
        text: w.textContent, visible: visible(w), edge: cs.borderLeftWidth + ' ' + cs.borderLeftStyle, background: cs.backgroundColor,
        // A warning is a block: it stands in nothing that holds text only.
        inText: !!w.parentElement.closest('p, h1, h2, h3, h4, h5, h6'),
        next: w.nextElementSibling ? w.nextElementSibling.tagName.toLowerCase() + (w.nextElementSibling.className ? '.' + String(w.nextElementSibling.className).split(' ')[0] : '') : '',
      };
    }),
  };
});
async function assertMarkers(page, check, exp){
  const f = await markerFacts(page);
  const json = JSON.stringify;
  // --- every marker is gone: applied, or replaced by its warning
  const left = f.comments.filter(text => readMarker(text));
  check('block markers: none is left as a comment; the ' + exp.comments + ' other comment(s) of the document stay; a marker written as code stays code, ' + exp.markersAsCode + ' time(s)',
    left.length === 0 && f.comments.length - left.length === exp.comments && f.asCode === exp.markersAsCode,
    'markers left: ' + json(left) + '; other comments: ' + (f.comments.length - left.length) + ' of ' + exp.comments + '; as code: ' + f.asCode + ' of ' + exp.markersAsCode);
  // --- with a document that has none, the counts are the check
  const titles = f.cards.map(list => list.items.map(item => item.title));
  check('cards: one list per marker "cards" before a bullet list, in the order of the document; each item a card, its title the bold text it starts with',
    json(titles) === json(exp.cards) && f.cards.every(list => list.tag === 'UL' && list.items.every(item => item.tag === 'LI' && item.strayTitles === 0)),
    json(titles) + ', expected ' + json(exp.cards));
  const steps = f.steps.map(list => list.items.map(item => ({ number: item.number, actor: item.actor })));
  check('step lists: one per marker "steps" before a numbered list; each item with its number, counted from the list\'s start value, and its actor without the colon',
    json(steps) === json(exp.steps) && f.steps.every(list => list.tag === 'OL' && list.items.every(item => item.tag === 'LI' && item.strayActors === 0)),
    json(steps) + ', expected ' + json(exp.steps));
  const warnings = f.warnings.filter(w => /Markierung/.test(w.text));
  check('markers that cannot act: one warning each, in the order of the document, naming the marker and what it expects',
    json(warnings.map(w => w.text)) === json(exp.markerWarnings.map(text => 'Warnung: ' + text)),
    json(warnings.map(w => w.text)) + ', expected ' + json(exp.markerWarnings.map(text => 'Warnung: ' + text)));
  if (warnings.length){
    const bad = warnings.filter(w => !w.visible || w.inText || w.edge !== WARNING_LOOK.edge || w.background !== WARNING_LOOK.background);
    check('every such warning is the product\'s warning: visible, styled by the document styles, a block of its own and inside no paragraph', bad.length === 0, json(bad));
  }

  if (f.cards.length){
    const cards = f.cards.flatMap(list => list.items);
    const lists = f.cards.filter(list => list.display !== 'grid' || list.marker !== 'none');
    const boxes = cards.filter(c => !c.visible || c.radius !== '6px' || c.edges.some(e => e !== CARD_BORDER));
    check('every card is styled: its list a grid without list markers, the card with a thin border all round', lists.length === 0 && boxes.length === 0,
      json(lists.map(l => [l.display, l.marker])) + ' ' + json(boxes.map(c => [c.title, c.visible, c.radius, c.edges])));
    const titled = cards.filter(c => c.title !== null);
    const badTitles = titled.filter(c => c.titleTag !== 'STRONG' || c.titleDisplay !== 'block' || c.below === false);
    check('the title of a card is a line of its own, the text below it: ' + titled.length + ' of ' + cards.length + ' cards have one', badTitles.length === 0,
      json(badTitles.map(c => [c.title, c.titleTag, c.titleDisplay, c.below])));
    // --- a grid that wraps. Wide: the cards of a list stand beside each other
    // and inside their list. Narrow: below each other, as wide as the list.
    const several = f.cards.filter(list => list.items.length > 1);
    const inside = (c, l) => c.left >= l.left - 0.6 && c.right <= l.right + 0.6;
    const notBeside = several.filter(list => !(list.items[1].box.top === list.items[0].box.top && list.items[1].box.left > list.items[0].box.right) || !list.items.every(c => inside(c.box, list.box)));
    await page.setViewportSize({ width: CARDS_NARROW, height: 1000 });
    await page.waitForTimeout(100);
    const narrow = await markerFacts(page);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.waitForTimeout(100);
    const notBelow = narrow.cards.filter(list => list.items.length > 1).filter(list =>
      !list.items.every((c, i) => inside(c.box, list.box) && c.box.left === list.items[0].box.left && Math.abs(c.box.width - list.box.width) <= 1 && (i === 0 || c.box.top >= list.items[i - 1].box.bottom)));
    check('cards stand in a grid that wraps: beside each other at ' + f.window + ' px, below each other at ' + CARDS_NARROW + ' px, always inside their list (' + several.length + ' lists with more than one card)',
      several.length > 0 && notBeside.length === 0 && notBelow.length === 0 && narrow.cards.length === f.cards.length,
      'not beside: ' + json(notBeside.map(l => l.items.map(c => c.box.left + '/' + c.box.top))) + '; not below: ' + json(notBelow.map(l => l.items.map(c => c.box.left + '/' + c.box.top + '/' + c.box.width))));
  }

  if (f.steps.length){
    const items = f.steps.flatMap(list => list.items);
    const lists = f.steps.filter(list => list.marker !== 'none');
    // The tile: the first thing in its item, visible, on its tint, left of
    // the step's text and not over it. Neither the tile nor its item is
    // positioned: a positioned item would be the containing block of the
    // preview of a footnote cited in the step (assertStepFootnote()).
    const badTiles = items.filter(s => !(s.numberFirst && s.numberTag === 'SPAN' && s.numberVisible && s.tint === STEP_TILE && s.placed === 'static' && s.position === 'static' &&
      s.tile.left >= s.box.left - 0.6 && s.tile.right <= s.box.left + s.indent + 0.6 && s.tile.top >= s.box.top - 0.6 && s.tile.bottom <= s.box.bottom + 0.6 &&
      s.tile.width >= 20 && s.tile.height >= 20 && !!s.text && s.text.left >= s.tile.right && s.inline === 0));
    check('every step shows its number as a tile: the list without its own markers, the number the first thing in its item, on its tint, left of the text, neither it nor its item positioned, with no inline style',
      lists.length === 0 && badTiles.length === 0, json(lists.map(l => l.marker)) + ' ' + json(badTiles.map(s => [s.number, s.numberFirst, s.numberVisible, s.tint, s.placed, s.position, s.tile, s.box, s.indent, s.text, s.inline])));
    const starts = f.steps.filter(list => String(Number(list.start || 1)) !== list.items[0].number);
    check('a step list keeps its start value, and its first tile shows it', starts.length === 0, json(starts.map(l => [l.start, l.items[0].number])));
    const acting = items.filter(s => s.actor !== null);
    if (acting.length){
      const badActors = acting.filter(s => !(s.actorTag === 'EM' && s.actorLook === 'block normal uppercase ' + STEP_ACTOR && !/:\s*$/.test(s.actor) &&
        !!s.text && s.text.top >= s.actorBox.bottom - 1 && s.actorBox.left >= s.tile.right));
      check('the actor of a step stands above the step as a label of its own, without its colon: ' + acting.length + ' of ' + items.length + ' steps name one', badActors.length === 0,
        json(badActors.map(s => [s.actor, s.actorTag, s.actorLook, s.actorBox, s.text])));
    }
  }
}

// A footnote cited inside a step. Its preview is placed against the page, by
// its marker; a step that is positioned would be its containing block instead,
// and the preview would lie over its own marker and the step. So the preview
// has to stand where the preview of the same kind of marker stands in a
// numbered list without the component: above its marker, over it, inside the
// window. Measured at 900 px, where the text column nearly fills the window.
// The two are measured at one scroll position: the step's marker is scrolled
// to the middle of the window, and the marker of the plain list has to be in
// the window then, so the reference document puts that list directly below
// the step list.
// Not judged in the Playwright Firefox build, with a note instead. There a
// preview does not appear with its fallbacks (see the header), and with them
// switched off it does not follow its marker down a scrolled page: measured
// on this document, the preview of the plain list lies about 5000 px above
// the window, as the one of the step does. A browser that cannot place the
// preview of a plain list says nothing about a step. Chromium carries this
// check.
const STEP_FOOTNOTE_WIDTH = 900;
async function assertStepFootnote(page, check, exp, label){
  if (!exp.stepFootnotes) return;
  await page.setViewportSize({ width: STEP_FOOTNOTE_WIDTH, height: 1000 });
  await page.waitForTimeout(100);
  // Focuses a footnote marker in a list of that kind and says where marker
  // and preview stand; null when there is none. scroll: the first such marker
  // is scrolled to the middle of the window; otherwise the first one that is
  // inside the window as it stands is taken.
  const place = async (list, scroll) => {
    const found = await page.evaluate(([sel, scroll]) => {
      const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
      if (document.activeElement) document.activeElement.blur();
      const inWindow = x => { const r = x.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; };
      const a = Array.from(root.querySelectorAll(sel + ' > li a[data-footnote-ref]')).find(x => !x.closest('.footnotes, .dokufix-fn-preview, nav') && (scroll || inWindow(x)));
      if (!a) return false;
      a.setAttribute('data-vergleich-marker', '');
      if (scroll) a.scrollIntoView({ block: 'center' });
      a.focus({ preventScroll: true });
      return true;
    }, [list, scroll]);
    if (!found) return null;
    const shown = await settles(page, () => {
      const cs = getComputedStyle(document.querySelector('[data-vergleich-marker]').parentElement.querySelector(':scope > .dokufix-fn-preview'));
      return cs.visibility === 'visible' && Number(cs.opacity) === 1;
    });
    const where = await page.evaluate(() => {
      const a = document.querySelector('[data-vergleich-marker]');
      const box = el => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left * 10) / 10, top: Math.round(r.top * 10) / 10, right: Math.round(r.right * 10) / 10, bottom: Math.round(r.bottom * 10) / 10 }; };
      const out = { marker: box(a), preview: box(a.parentElement.querySelector(':scope > .dokufix-fn-preview')), window: { width: document.documentElement.clientWidth, height: innerHeight } };
      a.removeAttribute('data-vergleich-marker');
      a.blur();
      return out;
    });
    return { shown, ...where };
  };
  const both = async () => ({ step: await place('ol.dokufix-steps', true), plain: await place('ol:not(.dokufix-steps)', false) });
  let { step, plain } = await both();
  if (label === 'firefox' && step && plain && !(step.shown && plain.shown)){
    await page.addStyleTag({ content: NO_FALLBACKS }); // known deviation, see header
    ({ step, plain } = await both());
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.waitForTimeout(100);
  if (!step || !plain){
    check('a footnote cited inside a step, and one in a numbered list without the component in the same window, to compare it with', false, 'in a step: ' + !!step + ', in a plain list: ' + !!plain);
    return;
  }
  // Above its marker and over it, inside the window.
  const stands = x => x.shown && x.preview.bottom <= x.marker.top + 1 && x.preview.left <= x.marker.left + 1 && x.preview.right >= x.marker.right - 1 &&
    x.preview.left >= 0 && x.preview.right <= x.window.width + 0.6 && x.preview.top >= 0 && x.preview.bottom <= x.window.height && x.preview.right - x.preview.left > 50;
  // The same place against the marker: as far above it, and as far to its side.
  const offset = x => [x.marker.top - x.preview.bottom, (x.preview.left + x.preview.right) / 2 - (x.marker.left + x.marker.right) / 2];
  const same = Math.abs(offset(step)[0] - offset(plain)[0]) <= 1 && Math.abs(offset(step)[1] - offset(plain)[1]) <= 1;
  // See above: where this build cannot place the preview of the plain list,
  // there is nothing to compare the step with.
  const judged = !(label === 'firefox' && !stands(plain));
  check('the preview of a footnote cited inside a step stands where it stands for a numbered list without the component: above its marker, inside the window (' + STEP_FOOTNOTE_WIDTH + ' px)',
    !judged || (stands(step) && stands(plain) && same), 'in a step: ' + JSON.stringify(step) + '; in a plain list: ' + JSON.stringify(plain),
    judged ? '' : 'not judged: the preview of the plain list does not stand above its marker here either, preview ' + JSON.stringify(plain.preview) + ' for the marker ' + JSON.stringify(plain.marker) + ' (known deviation of the Playwright Firefox build)');
}

// ---------- tables: wrapper, sub-lines, facet filter ----------
// What a page shows of its tables: the wrapper of each, the sub-lines of the
// cells, and the groups of the facet filters with their controls and rows.
const tableFacts = page => page.evaluate(() => {
  const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
  const round = n => Math.round(n * 10) / 10;
  const visible = el => { const r = el.getBoundingClientRect(); return el.checkVisibility({ visibilityProperty: true }) && r.width > 0 && r.height > 0; };
  // Whatever would make an element the containing block of something placed
  // inside it. All of it at its initial value: "static none none none …".
  const holds = el => { const cs = getComputedStyle(el); return [cs.position, cs.transform, cs.filter, cs.perspective, cs.contain, cs.containerType, cs.willChange, cs.backdropFilter || 'none'].join(' '); };
  const border = cs => cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor;
  const tables = Array.from(root.querySelectorAll('table')).filter(t => !t.closest('.mermaid'));
  return {
    window: document.documentElement.clientWidth, page: document.documentElement.scrollWidth,
    wrappers: root.querySelectorAll('.dokufix-table').length,
    tables: tables.map(table => {
      const w = table.parentElement, cs = getComputedStyle(w), r = w.getBoundingClientRect(), outer = w.parentElement.getBoundingClientRect();
      return {
        wrapped: w.tagName === 'DIV' && w.classList.contains('dokufix-table'), alone: w.children.length === 1,
        twice: !!w.parentElement && w.parentElement.classList.contains('dokufix-table'),
        overflow: cs.overflowX, holds: holds(w), inline: w.hasAttribute('style') || w.hasAttribute('id'),
        scrolls: w.scrollWidth > w.clientWidth + 1, tall: w.scrollHeight > w.clientHeight + 1,
        width: w.scrollWidth + ' in ' + w.clientWidth, inside: r.left >= outer.left - 0.6 && r.right <= outer.right + 0.6,
        margins: cs.marginBottom + ' ' + getComputedStyle(table).marginBottom,
      };
    }),
    subs: Array.from(root.querySelectorAll('.dokufix-cell-sub')).filter(el => !el.closest('.dokufix-fn-preview')).map(el => {
      const cell = el.parentElement, cs = getComputedStyle(el);
      const range = document.createRange();
      range.selectNodeContents(cell);
      const first = Array.from(range.getClientRects()).find(r => r.width > 0 && r.height > 0);
      return {
        text: el.textContent, tag: el.tagName, inCell: /^T[DH]$/.test(cell.tagName), visible: visible(el),
        look: cs.fontStyle + ' ' + cs.fontSize + ' ' + cs.color, cellSize: getComputedStyle(cell).fontSize,
        // A second line: it starts below the top of the cell's first line.
        below: !!first && el.getBoundingClientRect().top > first.top + 5,
      };
    }),
    facets: Array.from(root.querySelectorAll('.dokufix-facets')).map(group => {
      const bar = group.querySelector(':scope > fieldset.dokufix-facet-bar');
      const labels = bar ? Array.from(bar.querySelectorAll(':scope > .dokufix-facet-controls > label')) : [];
      // Where each line of controls starts: the left edge of the first label
      // of every line. All lines start at one place, beside the legend.
      const legendBox = bar && bar.querySelector(':scope > legend') ? bar.querySelector(':scope > legend').getBoundingClientRect() : null;
      const starts = [];
      let lineTop = null;
      for (const label of labels){ const r = label.getBoundingClientRect(); if (lineTop === null || r.top > lineTop + 1){ starts.push(Math.round(r.left * 10) / 10); lineTop = r.top; } }
      const rows = Array.from(group.querySelectorAll('tr.dokufix-facet-row'));
      const controls = labels.map(label => {
        const input = label.querySelector(':scope > input'), count = label.querySelector(':scope > .dokufix-facet-count');
        const ls = getComputedStyle(label), ms = getComputedStyle(label, '::before'), is = input && getComputedStyle(input), ir = input && input.getBoundingClientRect();
        return {
          text: Array.from(label.childNodes).filter(n => n.nodeType === 3).map(n => n.data).join('').trim(), count: count ? Number(count.textContent) : null,
          type: input ? input.type : '', name: input ? input.name : '', key: input ? (input.className.match(/^dokufix-facet-(\d+)$/) || [0, ''])[1] : '',
          checked: !!input && input.checked, attribute: !!input && input.hasAttribute('checked'),
          visible: visible(label), pill: ls.display + ' ' + ls.position + ' ' + ls.borderTopLeftRadius, border: border(ls), ring: ms.borderTopWidth,
          countFont: count ? getComputedStyle(count).fontFamily : '',
          // The radio button: rendered, operable, not seen, placed against its label.
          hidden: !!input && is.display !== 'none' && is.visibility === 'visible' && is.position === 'absolute' && is.opacity === '0' && ir.width <= 1 && ir.height <= 1 && input.offsetParent === label,
        };
      });
      return {
        legend: bar && bar.querySelector(':scope > legend') ? bar.querySelector(':scope > legend').textContent : null,
        children: Array.from(group.children).map(c => c.tagName.toLowerCase() + '.' + c.className).join(' '),
        bar: bar ? getComputedStyle(bar).display : '', barVisible: !!bar && visible(bar), holds: holds(group),
        // Only text in the bar: nothing an author wrote became an element.
        elements: bar ? [...new Set(Array.from(bar.querySelectorAll('*')).map(el => el.tagName.toLowerCase()))].sort().join(' ') : '',
        // Nothing made for this one table: no <style> element in the group, and
        // on the group, its controls and its rows no id and no inline style.
        // (An empty style attribute is the harness's: Playwright leaves one on
        // an input it has looked at. An id inside a cell is the author's.)
        inline: group.querySelectorAll('style').length + [group, ...(bar ? bar.querySelectorAll('*') : []), ...rows].filter(el => el.hasAttribute('id') || (el.getAttribute('style') || '').trim()).length,
        lines: starts, legendRight: legendBox ? Math.round(legendBox.right * 10) / 10 : null,
        controls, keys: rows.map(tr => Number((tr.className.match(/dokufix-facet-(\d+)/) || [0, -1])[1])),
        shown: rows.map(tr => getComputedStyle(tr).display !== 'none'),
        // The table is below the controls, and as wide as it would be without them.
        below: !!bar && !!group.querySelector(':scope > .dokufix-table') && group.querySelector(':scope > .dokufix-table').getBoundingClientRect().top >= bar.getBoundingClientRect().bottom - 1,
      };
    }),
    alarm: typeof window.dokufixAlarm,
  };
});
// Chooses every control of every group in turn, through its label, and says
// which rows are shown each time; ends with the control for all rows.
const walkFacets = page => page.evaluate(() => {
  const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
  return Array.from(root.querySelectorAll('.dokufix-facets')).map(group => {
    const labels = Array.from(group.querySelectorAll(':scope > .dokufix-facet-bar > .dokufix-facet-controls > label'));
    const rows = Array.from(group.querySelectorAll('tr.dokufix-facet-row'));
    const state = () => ({ chosen: labels.map((l, i) => l.querySelector('input').checked ? i : -1).filter(i => i >= 0), shown: rows.map(tr => getComputedStyle(tr).display !== 'none') });
    const steps = labels.map(label => { label.click(); return state(); });
    if (labels.length) labels[0].click();
    return { steps, back: state() };
  });
});
// The state of one group: which control is chosen, which rows are shown,
// whether the bar is shown.
const facetState = (page, g) => page.evaluate(g => {
  const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
  const group = root.querySelectorAll('.dokufix-facets')[g];
  const inputs = Array.from(group.querySelectorAll(':scope > .dokufix-facet-bar > .dokufix-facet-controls > label > input'));
  return {
    chosen: inputs.findIndex(i => i.checked), focused: inputs.indexOf(document.activeElement),
    shown: Array.from(group.querySelectorAll('tr.dokufix-facet-row')).map(tr => getComputedStyle(tr).display !== 'none'),
    bar: getComputedStyle(group.querySelector(':scope > .dokufix-facet-bar')).display,
    outline: inputs.map(i => getComputedStyle(i.parentElement).outlineStyle),
  };
}, g);
// Which rows a group has to show with the control at this place chosen.
const rowsFor = (facet, control) => facet.keys.map(key => control === 0 || key === control);
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Choosing by mouse and by the arrow keys, in the first group that has more
// than one value: a click on the label of the first value, then the arrow
// keys forward and back. what: a word for the name of the check.
async function assertFacetChoosing(page, check, exp, what){
  const g = exp.facets.findIndex(f => f.controls.length > 2);
  if (g < 0) return;
  const facet = exp.facets[g], n = facet.controls.length;
  const label = k => page.locator('.dokufix-facets').nth(g).locator('.dokufix-facet-bar > .dokufix-facet-controls > label').nth(k);
  await label(1).click({ timeout: 5000 }).catch(() => {});
  const clicked = await facetState(page, g);
  check(what + 'a click on the control of a value chooses it, and only the rows with that value are shown',
    clicked.chosen === 1 && sameList(clicked.shown, rowsFor(facet, 1)), JSON.stringify(clicked) + ', expected the rows ' + JSON.stringify(rowsFor(facet, 1)));
  // The keyboard: the focus is on the chosen radio button, and an arrow key
  // moves the choice to the next one of the group.
  await page.evaluate(g => {
    const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
    root.querySelectorAll('.dokufix-facets')[g].querySelector('.dokufix-facet-bar input:checked').focus();
  }, g);
  await page.keyboard.press('ArrowRight');
  const forward = await facetState(page, g);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  const back = await facetState(page, g);
  check(what + 'the arrow keys choose: forward to the next value, back to the control for all rows, which shows them all; the focused control is marked',
    forward.chosen === 2 % n && forward.focused === forward.chosen && sameList(forward.shown, rowsFor(facet, 2 % n)) && forward.outline[forward.chosen] !== 'none' &&
    back.chosen === 0 && back.focused === 0 && back.shown.every(Boolean),
    'forward ' + JSON.stringify(forward) + ', back ' + JSON.stringify(back));
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
}
async function assertTables(page, check, exp, key){
  const f = await tableFacts(page);
  const json = JSON.stringify;
  // --- the wrapper. With a document that has no table, the count is the check.
  const unwrapped = f.tables.filter(t => !t.wrapped || !t.alone || t.twice || t.overflow !== 'auto' || t.inline);
  check('tables: every table stands in one wrapper of its own, ' + exp.tables + ' in the document',
    f.tables.length === exp.tables && f.wrappers === exp.tables && unwrapped.length === 0, f.tables.length + ' tables, ' + f.wrappers + ' wrappers; ' + json(unwrapped));
  if (exp.tables){
    const held = f.tables.filter(t => t.holds !== 'static none none none none normal auto none');
    check('the wrapper of a table is not positioned and holds nothing that is placed in it', held.length === 0, json(held.map(t => t.holds)));
    const margins = f.tables.filter(t => !/ 0px$/.test(t.margins));
    check('the bottom margin of a table stands on its wrapper', margins.length === 0, json(f.tables.map(t => t.margins)));
    const wide = f.tables.filter((t, i) => exp.wideTables.includes(i)), others = f.tables.filter((t, i) => !exp.wideTables.includes(i));
    check('a table wider than the text column scrolls inside its wrapper (' + exp.wideTables.length + ' in the document), no other wrapper scrolls, none scrolls up and down, and the page is not wider than the window (' + f.window + ' px)',
      wide.every(t => t.scrolls) && others.every(t => !t.scrolls) && f.tables.every(t => !t.tall && t.inside) && f.page <= f.window,
      'page ' + f.page + ' in ' + f.window + '; tables ' + json(f.tables.map(t => [t.width, t.scrolls, t.tall, t.inside])));
    // The same in a narrow window. There the hidden previews of the footnotes
    // are taken out of the page for the measurement: at this width they reach
    // past the window's right edge and make the page wider, with a table in
    // the document or without, and before this story as after it (measured on
    // the built file before it: 663 px in a window of 600).
    await page.setViewportSize({ width: TABLES_NARROW, height: 1000 });
    const tag = await page.addStyleTag({ content: PREVIEWS_OUT });
    await page.waitForTimeout(100);
    const narrow = await tableFacts(page);
    await tag.evaluate(el => el.remove());
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.waitForTimeout(100);
    check('at ' + TABLES_NARROW + ' px as well: the wide table scrolls, every wrapper stays inside its place, the page is not wider than the window (the footnote previews set aside)',
      narrow.tables.length === f.tables.length && narrow.tables.every((t, i) => t.inside && !t.tall && (!exp.wideTables.includes(i) || t.scrolls)) && narrow.page <= narrow.window,
      'page ' + narrow.page + ' in ' + narrow.window + '; tables ' + json(narrow.tables.map(t => [t.width, t.scrolls, t.tall, t.inside])));
  }

  // --- sub-lines
  check('sub-lines: the emphasis directly after a line break in a cell, ' + exp.subLines.length + ' in the document, and no other emphasis',
    json(f.subs.map(s => s.text)) === json(exp.subLines), json(f.subs.map(s => s.text)) + ', expected ' + json(exp.subLines));
  if (exp.subLines.length){
    const bad = f.subs.filter(s => !(s.tag === 'EM' && s.inCell && s.visible && s.look === SUB_LINE && s.cellSize === '14px' && s.below));
    check('every sub-line is a second line of its cell: subdued, smaller, upright', bad.length === 0, json(bad));
  }

  // --- the facet filter
  const shape = facets => facets.map(x => ({ legend: x.legend, controls: x.controls.map(c => [c.text === undefined ? c[0] : c.text, c.count === undefined ? c[1] : c.count]), keys: x.keys }));
  check('facet filters: one per marker "facets" that can act, in the order of the document; the legend the column\'s heading, one control per distinct value with its row count in the order of first appearance, before them the control for all rows; every data row with the key of its value',
    json(shape(f.facets)) === json(shape(exp.facets)), json(shape(f.facets)) + ', expected ' + json(shape(exp.facets)));
  if (!exp.facets.length || f.facets.length !== exp.facets.length) return;

  const groups = f.facets;
  // As the file opens: a facet was chosen in the page while it was written.
  const opened = groups.filter(x => !(x.controls[0].checked && x.controls.filter(c => c.checked).length === 1 && x.controls.filter(c => c.attribute).length === 1 && x.controls[0].attribute && x.shown.every(Boolean)));
  check('as the file opens, every facet filter has the control for all rows chosen, by its attribute alone, and shows all rows', opened.length === 0, json(opened.map(x => [x.legend, x.controls.map(c => [c.checked, c.attribute]), x.shown])));
  const built = groups.filter((x, g) => !(x.children === 'fieldset.dokufix-facet-bar div.dokufix-table' && x.elements === 'div input label legend span' && x.inline === 0 &&
    x.controls.every((c, k) => c.type === 'radio' && c.key === String(k) && c.name === groups[g].controls[0].name) && groups.filter(y => y.controls[0].name === x.controls[0].name).length === 1));
  check('every facet filter is a group of radio buttons of its own, each in its label, above the wrapper of its table; the keys count from 0; nothing an author wrote became an element; no <style>, no inline style, no id',
    built.length === 0 && f.alarm === 'undefined', json(built.map(x => [x.children, x.elements, x.inline, x.controls.map(c => [c.type, c.key, c.name])])) + '; a handler ran: ' + (f.alarm !== 'undefined'));
  const controls = groups.flatMap(x => x.controls);
  // A control is an item of the flex container that holds the controls, so
  // its display is computed as "block".
  const look = controls.filter(c => !(c.visible && c.pill === 'block relative ' + FACET_PILL.radius && c.hidden && /monospace/.test(c.countFont) &&
    (c.checked ? c.border === FACET_PILL.chosen && c.ring === FACET_PILL.ringChosen : c.border === FACET_PILL.border && c.ring === FACET_PILL.ring)));
  const bars = groups.filter(x => !(x.bar === 'block' && x.barVisible && x.below && x.holds === 'static none none none none normal auto none'));
  // Every line of controls starts at the same place, right of the legend.
  // Measured here and in a narrow window, where the controls of a filter
  // with many values take more than one line: two of the reference
  // document's do at 600 px.
  const misaligned = facets => facets.filter(x => !(x.lines.length > 0 && x.lines.every(left => left === x.lines[0]) && x.legendRight !== null && x.lines[0] >= x.legendRight));
  await page.setViewportSize({ width: TABLES_NARROW, height: 1000 });
  await page.waitForTimeout(100);
  const narrowFacets = (await tableFacts(page)).facets;
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.waitForTimeout(100);
  check('every line of controls starts at the same place, beside the legend, at 1400 px and at ' + TABLES_NARROW + ' px (' + narrowFacets.filter(x => x.lines.length > 1).length + ' filter(s) take more than one line there)',
    misaligned(groups).length === 0 && misaligned(narrowFacets).length === 0,
    JSON.stringify([...groups, ...narrowFacets].map(x => [x.legend, x.legendRight, x.lines])));
  check('the controls are styled: the bar shown above the table, each control a pill, the radio button not seen and placed against its label, the chosen one with a dark border and a filled ring; the group not positioned',
    look.length === 0 && bars.length === 0, json(look.map(c => [c.text, c.visible, c.pill, c.border, c.ring, c.hidden, c.countFont])) + ' ' + json(bars.map(x => [x.legend, x.bar, x.barVisible, x.below, x.holds])));

  // --- choosing: every control of every group in turn
  const walk = await walkFacets(page);
  const wrong = [];
  walk.forEach((group, g) => {
    group.steps.forEach((step, k) => {
      if (!(sameList(step.chosen, [k]) && sameList(step.shown, rowsFor(exp.facets[g], k)))) wrong.push(exp.facets[g].legend + ', control ' + k + ': chosen ' + json(step.chosen) + ', rows ' + json(step.shown));
    });
    if (!(sameList(group.back.chosen, [0]) && group.back.shown.every(Boolean))) wrong.push(exp.facets[g].legend + ', back to all rows: ' + json(group.back));
  });
  check('choosing a control shows only the rows with its value, in every facet filter and for every value; the control for all rows shows all (' + controls.length + ' controls)', wrong.length === 0, wrong.join(' | '));
  await assertFacetChoosing(page, check, exp, '');

  // --- print: all rows, no controls, whatever is chosen
  const g = exp.facets.findIndex(x => x.controls.length > 2);
  if (g >= 0){
    const choose = k => page.evaluate(([g, k]) => {
      const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
      root.querySelectorAll('.dokufix-facets')[g].querySelectorAll('.dokufix-facet-bar > .dokufix-facet-controls > label')[k].click();
    }, [g, k]);
    await choose(1);
    const screen = await facetState(page, g);
    await page.emulateMedia({ media: 'print' });
    const print = await facetState(page, g);
    await page.emulateMedia({ media: null });
    check('in print, with a value chosen: all rows are shown and the controls are not printed',
      screen.chosen === 1 && sameList(screen.shown, rowsFor(exp.facets[g], 1)) && print.chosen === 1 && print.shown.every(Boolean) && print.bar === 'none', 'on screen ' + json(screen) + ', in print ' + json(print));
    // --- a browser without :has(). No such browser is run; what it does not
    // apply is the block "@supports selector(:has(a))" of the document
    // styles, so that block is taken out of the page for the measurement and
    // put back: the controls have to be gone and every row shown.
    const without = await page.evaluate(g => {
      const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
      const group = root.querySelectorAll('.dokufix-facets')[g], bar = group.querySelector('.dokufix-facet-bar');
      const state = () => ({ bar: getComputedStyle(bar).display, shown: Array.from(group.querySelectorAll('tr.dokufix-facet-row')).map(tr => getComputedStyle(tr).display !== 'none') });
      const found = [];
      const visit = parent => {
        Array.from(parent.cssRules).forEach((rule, index) => {
          if (rule instanceof CSSSupportsRule && /:has\(/.test(rule.conditionText)) found.push({ parent, index, text: rule.cssText, condition: rule.conditionText });
          else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) visit(rule);
        });
      };
      for (const sheet of Array.from(document.styleSheets)){ try { visit(sheet); } catch (e){ /* a sheet of another origin */ } }
      const before = state();
      for (const x of found.slice().reverse()) x.parent.deleteRule(x.index);
      const gone = state();
      for (const x of found) x.parent.insertRule(x.text, x.index);
      return { blocks: found.map(x => x.condition), before, gone, after: state() };
    }, g);
    check('without the block that asks for :has(), as in a browser that does not know it: the controls are not shown and every row is',
      without.blocks.length === 1 && without.before.bar === 'block' && sameList(without.before.shown, rowsFor(exp.facets[g], 1)) && without.gone.bar === 'none' && without.gone.shown.every(Boolean) && sameList(without.after, without.before),
      json(without));
    await choose(0);
  }
}

// A footnote cited in a table cell. The wrapper of the table scrolls, so it
// cuts off whatever is placed inside it; the preview is placed against the
// page, by its marker, and has to reach out of the wrapper uncut. So it has
// to stand where the preview of the same footnote stands for a marker in a
// paragraph: above its marker and over it, inside the window; it has to reach
// above the wrapper's upper edge, which the reference document sees to with a
// marker in the first row and a long footnote; and that part has to be
// painted: the page is photographed there with the preview revealed and
// without, and the two pictures have to differ. Measured at 900 px, the two
// markers at one scroll position: the reference document puts the paragraph
// directly below the table.
// Not judged in the Playwright Firefox build where it cannot place the
// preview of the paragraph either, with a note; see assertStepFootnote().
async function assertTableFootnote(page, check, exp, label){
  if (!exp.tableFootnotes) return;
  await page.setViewportSize({ width: FOOTNOTE_WIDTH, height: 1000 });
  await page.waitForTimeout(100);
  // Focuses a footnote marker, in a table cell or in a paragraph outside
  // every table and list, and says where marker, preview and wrapper stand.
  const place = async inCell => {
    const found = await page.evaluate(inCell => {
      const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
      if (document.activeElement) document.activeElement.blur();
      const inWindow = x => { const r = x.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; };
      const a = Array.from(root.querySelectorAll('a[data-footnote-ref]')).find(x => !x.closest('.footnotes, .dokufix-fn-preview, nav') &&
        (inCell ? !!x.closest('td, th') : !x.closest('table, li') && x.parentElement.parentElement.tagName === 'P' && inWindow(x)));
      if (!a) return false;
      a.setAttribute('data-vergleich-marker', '');
      if (inCell) a.scrollIntoView({ block: 'center' });
      a.focus({ preventScroll: true });
      return true;
    }, inCell);
    if (!found) return null;
    const shown = await settles(page, () => {
      const cs = getComputedStyle(document.querySelector('[data-vergleich-marker]').parentElement.querySelector(':scope > .dokufix-fn-preview'));
      return cs.visibility === 'visible' && Number(cs.opacity) === 1;
    });
    const where = await page.evaluate(() => {
      const a = document.querySelector('[data-vergleich-marker]');
      const box = el => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left * 10) / 10, top: Math.round(r.top * 10) / 10, right: Math.round(r.right * 10) / 10, bottom: Math.round(r.bottom * 10) / 10 }; };
      const preview = a.parentElement.querySelector(':scope > .dokufix-fn-preview'), wrapper = a.closest('.dokufix-table');
      return { marker: box(a), preview: box(preview), wrapper: wrapper ? box(wrapper) : null,
               // The element the preview is placed against stands inside the wrapper.
               held: !!wrapper && !!preview.offsetParent && wrapper.contains(preview.offsetParent),
               window: { width: document.documentElement.clientWidth, height: innerHeight } };
    });
    // The part of the preview above the wrapper, photographed with the preview revealed and without.
    let painted = null;
    if (inCell && shown && where.wrapper && where.preview.top < where.wrapper.top - 4 && where.preview.top >= 0){
      const clip = { x: Math.max(0, Math.floor(where.preview.left)), y: Math.floor(where.preview.top), width: Math.floor(where.preview.right - where.preview.left), height: Math.floor(Math.min(where.preview.bottom, where.wrapper.top) - where.preview.top) };
      const revealed = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
      await page.evaluate(() => document.querySelector('[data-vergleich-marker]').blur());
      await settles(page, () => getComputedStyle(document.querySelector('[data-vergleich-marker]').parentElement.querySelector(':scope > .dokufix-fn-preview')).visibility === 'hidden');
      const hidden = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
      painted = comparePng(hidden, revealed, null).differing;
    }
    await page.evaluate(() => { const a = document.querySelector('[data-vergleich-marker]'); a.removeAttribute('data-vergleich-marker'); a.blur(); });
    return { shown, painted, ...where };
  };
  const both = async () => ({ cell: await place(true), plain: await place(false) });
  let { cell, plain } = await both();
  if (label === 'firefox' && cell && plain && !(cell.shown && plain.shown)){
    await page.addStyleTag({ content: NO_FALLBACKS }); // known deviation, see header
    ({ cell, plain } = await both());
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.waitForTimeout(100);
  if (!cell || !plain){
    check('a footnote cited in a table cell, and one in a paragraph in the same window, to compare it with', false, 'in a cell: ' + !!cell + ', in a paragraph: ' + !!plain);
    return;
  }
  const stands = x => x.shown && x.preview.bottom <= x.marker.top + 1 && x.preview.left <= x.marker.left + 1 && x.preview.right >= x.marker.right - 1 &&
    x.preview.left >= 0 && x.preview.right <= x.window.width + 0.6 && x.preview.top >= 0 && x.preview.bottom <= x.window.height && x.preview.right - x.preview.left > 50;
  const above = x => x.marker.top - x.preview.bottom;
  const judged = !(label === 'firefox' && !stands(plain));
  check('the preview of a footnote cited in a table cell stands where it stands for a paragraph: above its marker, inside the window; it reaches above the wrapper of its table and is not cut off there (' + FOOTNOTE_WIDTH + ' px)',
    !judged || (stands(cell) && stands(plain) && Math.abs(above(cell) - above(plain)) <= 1 && !cell.held && cell.painted > 100),
    'in a cell: ' + JSON.stringify(cell) + '; in a paragraph: ' + JSON.stringify(plain),
    judged ? '' : 'not judged: the preview of the paragraph does not stand above its marker here either, preview ' + JSON.stringify(plain.preview) + ' for the marker ' + JSON.stringify(plain.marker) + ' (known deviation of the Playwright Firefox build)');
}
// A read-only export with scripts switched off: the facet filter is there and
// filters, by mouse and by keyboard. Not kompakt: its document is packed, and
// without scripts there is no table to filter.
async function assertFacetsWithoutScripts(launch, file, check, exp){
  if (!exp.facets.length) return;
  const browser = await launch();
  try {
    const context = await browser.newContext({ ...CONTEXT, viewport: { width: 1400, height: 1000 }, javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(pathToFileURL(file).href);
    const f = await tableFacts(page);
    check('facet filters with scripts off: there, shown, all rows at first',
      f.facets.length === exp.facets.length && f.facets.every(x => x.bar === 'block' && x.barVisible && x.controls[0].checked && x.shown.every(Boolean)),
      JSON.stringify(f.facets.map(x => [x.legend, x.bar, x.barVisible, x.shown])));
    if (f.facets.length === exp.facets.length) await assertFacetChoosing(page, check, exp, 'with scripts off: ');
  } finally {
    await browser.close();
  }
}

// ---------- assertions ----------
function makeChecker(results, scope){
  return (name, ok, detail, note) => {
    results.push({ scope, name, ok: !!ok, detail: ok ? '' : (detail === undefined ? '' : String(detail)), note: ok && note ? note : '' });
  };
}

async function settles(page, fn, arg){
  try { await page.waitForFunction(fn, arg, { timeout: 4000 }); return true; }
  catch (e){ return false; }
}

async function assertVariant(launch, file, key, exp, results, label){
  const check = makeChecker(results, label + ' ' + key);
  const text = fs.readFileSync(file, 'utf8');

  if (key === 'nur-lesen') check('contains no <script>', !/<script/i.test(text));
  if (READONLY.has(key)){
    const style = (text.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
    check('has a stylesheet', style.length > 500, style.length + ' bytes');
    const hits = EDITOR_RULES.filter(re => re.test(style)).map(String);
    check('stylesheet has no editor rules', hits.length === 0, hits.join(' '));
    // The licence element as the export writes it: once, directly after <body>,
    // closed, and not packed, so it is there before any script has run.
    const elements = text.match(/<details class="dokufix-licences"[^>]*>/g) || [];
    check('licence element: written once, directly after <body>, closed',
      elements.length === 1 && elements[0] === '<details class="dokufix-licences">' && /<body[^>]*>\n<details class="dokufix-licences"><summary>/.test(text),
      JSON.stringify(elements));
  }

  const { close, page, errors } = await openVariant(launch, file, key, exp, 1400, 'light');
  try {
    const s = await page.evaluate(() => {
      // The content container: the preview in the editor file, <main> in a read-only export.
      const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
      const fm = document.querySelector('details.dokufix-frontmatter');
      const digest = fm && fm.querySelector('.dokufix-fm-digest');
      const cs = fm && getComputedStyle(fm);
      const imgs = Array.from(document.images);
      const placeholder = document.querySelector('img[data-missing-asset]');
      return {
        mermaid: document.querySelectorAll('.mermaid svg').length,
        tocLinks: document.querySelectorAll('nav.dokufix-toc a').length,
        tocBorder: (() => { const n = document.querySelector('nav.dokufix-toc'); return n ? getComputedStyle(n).borderTopWidth : ''; })(),
        fm: !!fm, fmOpen: fm ? fm.open : null, digest: digest ? digest.textContent : '',
        fmBorder: cs ? cs.borderTopWidth : '', fmBg: cs ? cs.backgroundColor : '',
        images: imgs.filter(i => !i.hasAttribute('data-missing-asset') && i.naturalWidth > 1).length,
        missing: imgs.filter(i => i.hasAttribute('data-missing-asset')).length,
        placeholderBorder: placeholder ? getComputedStyle(placeholder).borderTopStyle : '',
        hosts: document.querySelectorAll('sup.dokufix-fn-host > .dokufix-fn-preview').length,
        markers: document.querySelectorAll('a[data-footnote-ref]').length,
        h1Size: (() => { const h = root.querySelector('h1'); return h ? getComputedStyle(h).fontSize : ''; })(),
        callouts: Array.from(root.querySelectorAll('.dokufix-callout')).map(c => {
          const label = c.querySelector(':scope > .dokufix-callout-label');
          const cs = getComputedStyle(c), ls = label && getComputedStyle(label), bs = label && getComputedStyle(label, '::before');
          const r = label && label.getBoundingClientRect();
          return {
            type: (c.className.match(/dokufix-callout-([a-z]+)/) || [0, ''])[1],
            tag: c.tagName, role: c.getAttribute('role'),
            label: label ? label.textContent : null, labelFirst: !!label && label === c.firstElementChild,
            labelVisible: !!label && r.width > 0 && r.height > 0 && ls.visibility === 'visible' && ls.display !== 'none',
            labelColour: ls ? ls.color : '',
            edge: cs.borderLeftWidth + ' ' + cs.borderLeftStyle + ' ' + cs.borderLeftColor,
            otherEdges: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth].join(' '),
            symbol: bs ? bs.backgroundImage : '', symbolBox: bs ? bs.width + ' ' + bs.height : '',
            markerLeft: /\[!/.test(c.textContent),
            emptyParagraphs: Array.from(c.querySelectorAll('p')).filter(p => !p.textContent.trim() && !p.children.length).length,
          };
        }),
        calloutHeadings: Array.from(root.querySelectorAll('.dokufix-callout :is(h1, h2, h3, h4, h5, h6)')).map(h => {
          const text = h.textContent.trim();
          const named = sel => Array.from(document.querySelectorAll(sel)).some(a => a.textContent.trim() === text);
          return { text, id: h.id, inToc: named('nav.dokufix-toc a'), inRail: named('.dokufix-rail a') };
        }),
        markerQuotes: Array.from(root.querySelectorAll('blockquote')).filter(q => /^\s*\[!(note|tip|important|warning|caution)\]\s*(\n|$)/i.test(q.textContent)).length,
      };
    });
    check('document styles apply (h1 is 34px)', s.h1Size === '34px', s.h1Size);
    check('Mermaid diagrams rendered', s.mermaid === exp.mermaid, s.mermaid + ' of ' + exp.mermaid);
    if (exp.toc) check('inline table of contents', s.tocLinks > 0 && s.tocBorder === '1px', s.tocLinks + ' links, border ' + s.tocBorder);
    check('embedded images shown', s.images === exp.images, s.images + ' of ' + exp.images);
    check('missing-image placeholders', s.missing === exp.missing && (exp.missing === 0 || s.placeholderBorder === 'dashed'),
      s.missing + ' of ' + exp.missing + ', border ' + s.placeholderBorder);

    // --- callouts (story 2.2). With a document that has none, the count is the check.
    check('callouts: one per alert blockquote, in the order of the document',
      JSON.stringify(s.callouts.map(c => c.type)) === JSON.stringify(exp.callouts) && s.markerQuotes === 0,
      JSON.stringify(s.callouts.map(c => c.type)) + ', expected ' + JSON.stringify(exp.callouts) + '; blockquotes still opening with a marker: ' + s.markerQuotes);
    if (exp.callouts.length){
      const bad = (what, test) => s.callouts.filter(c => !test(c, CALLOUTS[c.type] || {})).map(c => c.type + ': ' + JSON.stringify(what(c)));
      const labels = bad(c => [c.tag, c.role, c.label, c.labelFirst, c.labelVisible, c.markerLeft, c.emptyParagraphs],
        (c, want) => c.tag === 'DIV' && c.role === 'note' && c.label === want.label && c.labelFirst && c.labelVisible && !c.markerLeft && c.emptyParagraphs === 0);
      check('every callout is labelled: the word of its type, visible, as its first line, the marker gone', labels.length === 0, labels.join(' | '));
      const styles = bad(c => [c.edge, c.otherEdges, c.labelColour, c.symbolBox],
        (c, want) => c.edge === '4px solid ' + want.colour && c.otherEdges === '0px 0px 0px' && c.labelColour === want.colour && c.symbolBox === '16px 16px');
      check('every callout is styled: an edge on the left only, edge and label in the colour of the type', styles.length === 0, styles.join(' | '));
      // The symbol is a data: URI in the document styles. That the rule arrived
      // says little; the picture has to be one a browser draws.
      const symbols = await page.evaluate(async list => {
        const out = [];
        for (const c of list){
          const m = c.symbol.match(/^url\("(data:image\/svg\+xml,[^"]*)"\)$/);
          if (!m){ out.push({ type: c.type, problem: 'no data: URI: ' + c.symbol.slice(0, 80) }); continue; }
          const img = new Image();
          const loaded = await new Promise(resolve => { img.onload = () => resolve(true); img.onerror = () => resolve(false); img.src = m[1]; });
          out.push({ type: c.type, loaded, size: img.naturalWidth + 'x' + img.naturalHeight, svg: decodeURIComponent(m[1].slice(m[1].indexOf(',') + 1)) });
        }
        return out;
      }, s.callouts.map(c => ({ type: c.type, symbol: c.symbol })));
      const badSymbols = symbols.filter(y => y.problem || !y.loaded || y.size !== '16x16' || !y.svg.includes("fill='" + (CALLOUTS[y.type] || {}).fill + "'") || !/<path d='M[^']+Z'\/>/.test(y.svg))
        .map(y => y.type + ': ' + (y.problem || (y.loaded ? y.size : 'does not load')));
      const distinct = new Set(symbols.map(y => y.svg)).size === new Set(s.callouts.map(c => c.type)).size;
      check('every callout has its symbol: an SVG of 16 px in the colour of the type, one per type', badSymbols.length === 0 && distinct,
        badSymbols.join(' | ') || 'two types share a symbol');
    }
    // --- a heading inside a callout is no document heading
    check('headings inside callouts: the ones the document has',
      JSON.stringify(s.calloutHeadings.map(h => h.text)) === JSON.stringify(exp.calloutHeadings),
      JSON.stringify(s.calloutHeadings.map(h => h.text)) + ', expected ' + JSON.stringify(exp.calloutHeadings));
    if (exp.calloutHeadings.length){
      const listed = s.calloutHeadings.filter(h => h.id || h.inToc || h.inRail);
      check('a heading inside a callout has no id and is in neither table of contents nor rail', listed.length === 0, JSON.stringify(listed));
    }
    // --- a [!WARNING] callout beside the product's own warning: more than colour apart
    if (exp.callouts.includes('warning')){
      const pair = await page.evaluate(() => {
        const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
        const callout = root.querySelector('.dokufix-callout-warning');
        if (!callout) return null;   // the count above has failed already
        // The warning as buildWarning() makes it, put beside the callout for the measurement.
        callout.insertAdjacentHTML('afterend', '<div class="dokufix-warning" role="note"><p class="dokufix-warning-title"><strong>Warnung:</strong> Ein Diagramm konnte nicht gezeichnet werden.</p></div>');
        const warning = callout.nextElementSibling;
        const box = el => { const cs = getComputedStyle(el); return { top: cs.borderTopWidth, right: cs.borderRightWidth, bottom: cs.borderBottomWidth, left: cs.borderLeftWidth }; };
        const cLabel = callout.querySelector(':scope > .dokufix-callout-label'), wLabel = warning.querySelector('.dokufix-warning-title > strong');
        const out = {
          callout: { ...box(callout), word: cLabel.textContent, labelDisplay: getComputedStyle(cLabel).display,
                     ownLine: !cLabel.nextElementSibling || cLabel.getBoundingClientRect().bottom <= cLabel.nextElementSibling.getBoundingClientRect().top,
                     symbol: getComputedStyle(cLabel, '::before').backgroundImage !== 'none' },
          warning: { ...box(warning), word: wLabel.textContent, labelDisplay: getComputedStyle(wLabel).display,
                     ownLine: wLabel.parentElement.textContent.trim() === wLabel.textContent.trim(),
                     symbol: getComputedStyle(wLabel, '::before').backgroundImage !== 'none' },
        };
        warning.remove();
        return out;
      });
      const c = pair ? pair.callout : {}, w = pair ? pair.warning : {};
      check('a WARNING callout and the product\'s warning differ in more than colour: the word, a box against an edge, the label\'s line, the symbol',
        !!pair && c.word === 'Achtung' && w.word === 'Warnung:' &&
        c.top === '0px' && c.right === '0px' && c.bottom === '0px' && w.top === '1px' && w.right === '1px' && w.bottom === '1px' && w.left !== c.left &&
        c.ownLine && !w.ownLine && c.labelDisplay !== w.labelDisplay && c.symbol && !w.symbol, JSON.stringify(pair));
    }

    // --- status chips (story 2.3). With a document that has none, the count is the check.
    await assertChips(page, check, exp, path.join(path.dirname(file), 'marken-' + key));

    // --- block markers, cards and step lists (story 2.4). With a document that has none, the counts are the check.
    await assertMarkers(page, check, exp);

    // --- tables: wrapper, sub-lines, facet filter (story 2.5). With a document that has none, the counts are the check.
    await assertTables(page, check, exp, key);

    // --- metadata panel (story 1.1)
    if (exp.frontmatter){
      check('metadata panel present and collapsed', s.fm && s.fmOpen === false, 'present ' + s.fm + ', open ' + s.fmOpen);
      check('metadata digest', s.digest === exp.digest, JSON.stringify(s.digest));
      check('metadata panel styled', s.fmBorder === '1px' && s.fmBg === 'rgb(250, 250, 250)', s.fmBorder + ' ' + s.fmBg);
      await page.click('details.dokufix-frontmatter > summary');
      const opened = await page.evaluate(() => {
        const fm = document.querySelector('details.dokufix-frontmatter');
        const rows = fm.querySelector('dl.dokufix-fm-rows');
        return { open: fm.open, rows: rows ? rows.getBoundingClientRect().height : 0, grid: rows ? getComputedStyle(rows).display : '' };
      });
      check('metadata panel opens on click', opened.open && opened.rows > 0 && opened.grid === 'grid', JSON.stringify(opened));
    }

    // --- footnote preview (story 1.2), through the keyboard path
    if (exp.footnotes){
      check('every marker carries a preview', s.hosts === s.markers && s.hosts > 0, s.hosts + ' previews, ' + s.markers + ' markers');
      const rest = await page.evaluate(() => {
        const a = document.querySelector('sup.dokufix-fn-host > a[data-footnote-ref]');
        const box = a.parentElement.querySelector(':scope > .dokufix-fn-preview');
        a.scrollIntoView({ block: 'center' });
        const cs = getComputedStyle(box);
        return { visibility: cs.visibility, position: cs.position, text: box.textContent.trim().length };
      });
      check('preview hidden at rest', rest.visibility === 'hidden' && rest.position === 'absolute' && rest.text > 0, JSON.stringify(rest));
      const focusMarker = () => page.evaluate(() => {
        if (document.activeElement) document.activeElement.blur();
        document.querySelector('sup.dokufix-fn-host > a[data-footnote-ref]').focus({ preventScroll: true });
      });
      const revealed = () => settles(page, () => {
        const box = document.querySelector('sup.dokufix-fn-host > .dokufix-fn-preview');
        const cs = getComputedStyle(box);
        return cs.visibility === 'visible' && Number(cs.opacity) === 1;
      });
      await focusMarker();
      let shown = await revealed();
      let note = '';
      if (!shown && label === 'firefox'){
        await page.addStyleTag({ content: NO_FALLBACKS }); // known deviation, see header
        await focusMarker();
        shown = await revealed();
        note = 'only with position-try-fallbacks switched off (known deviation of the Playwright Firefox build)';
      }
      const rect = await page.evaluate(() => {
        const r = document.querySelector('sup.dokufix-fn-host > .dokufix-fn-preview').getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight };
      });
      check('preview appears on focus', shown, '', note);
      // Not judged where the fallbacks had to be switched off: the box is then
      // placed without them, which is not what a reader gets.
      if (!note) check('preview stays inside the viewport',
        rect.left >= 0 && rect.right <= rect.w && rect.top >= 0 && rect.bottom <= rect.h && rect.right - rect.left > 50, JSON.stringify(rect));
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      // --- and of a footnote cited inside a step (story 2.4)
      await assertStepFootnote(page, check, exp, label);
      // --- and of a footnote cited in a table cell (story 2.5)
      await assertTableFootnote(page, check, exp, label);
    }

    // --- landing highlight and marked return arrow (story 1.3)
    if (exp.multiRef){
      const ids = await page.evaluate(() => {
        const li = Array.from(document.querySelectorAll('.footnotes li'))
          .find(x => x.querySelectorAll('a[data-footnote-backref]').length > 1);
        return li ? { li: li.id, arrows: Array.from(li.querySelectorAll('a[data-footnote-backref]')).map(a => a.id) } : null;
      });
      check('multiply cited footnote has one arrow per citation', ids && ids.arrows.length >= 2 && ids.arrows.every(Boolean), JSON.stringify(ids));
      if (ids && ids.arrows[1]){
        await page.click('a[data-footnote-ref][href="#' + ids.arrows[1] + '"]');
        const YELLOW = 'rgb(212, 255, 0)', SHADE = 'rgba(212, 255, 0, 0.3)';
        const landed = await settles(page, ([arrowId, liId, yellow, shade]) => {
          const arrow = document.getElementById(arrowId), li = document.getElementById(liId);
          return location.hash === '#' + arrowId
            && getComputedStyle(arrow).backgroundColor === yellow
            && getComputedStyle(li).backgroundColor === shade;
        }, [ids.arrows[1], ids.li, YELLOW, SHADE]);
        const colours = await page.evaluate(([liId]) => {
          const li = document.getElementById(liId);
          return { li: getComputedStyle(li).backgroundColor,
                   arrows: Array.from(li.querySelectorAll('a[data-footnote-backref]')).map(a => getComputedStyle(a).backgroundColor) };
        }, [ids.li]);
        check('second citation lands on its own arrow, definition shaded', landed, JSON.stringify(colours));
        check('only that arrow is marked', colours.arrows.filter(c => c === YELLOW).length === 1 && colours.arrows[1] === YELLOW, JSON.stringify(colours.arrows));

        await page.evaluate(id => { location.hash = '#' + id; }, ids.li);
        const plain = await settles(page, ([liId, yellow, shade]) => {
          const li = document.getElementById(liId);
          return getComputedStyle(li).backgroundColor === shade
            && Array.from(li.querySelectorAll('a[data-footnote-backref]')).every(a => getComputedStyle(a).backgroundColor !== yellow);
        }, [ids.li, YELLOW, SHADE]);
        check('plain #footnote anchor shades the definition, no arrow marked', plain);
      }
    }

    // --- heading numbering reaches headings and the table of contents
    const numbered = await page.evaluate(() => {
      document.body.classList.add('numbered');
      const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
      const h2 = root.querySelector('h2:not(.footnotes h2)');
      const toc = document.querySelector('nav.dokufix-toc > ol > li > a');
      const out = { h2: h2 ? getComputedStyle(h2, '::before').content : '', toc: toc ? getComputedStyle(toc, '::before').content : null };
      document.body.classList.remove('numbered');
      return out;
    });
    check('heading numbering', /counter\(h2\)/.test(numbered.h2) && (numbered.toc === null || /counter\(tocH2\)/.test(numbered.toc)), JSON.stringify(numbered));
    // --- numbering leaves out a heading inside a callout. A browser does not
    // say which number a counter shows, so the page is photographed three
    // times with numbering on: as it is, with the heading forced out of the
    // count, and with it forced in. As it is, it has to be the first of the
    // two and not the second; the second proves that the picture would show it.
    // Only with a heading of level 2 to 4 inside a callout: h1, h5 and h6 are
    // not numbered anywhere, so there is nothing to tell apart.
    if (exp.calloutHeadingsNumbered){
      const computed = await page.evaluate(() => {
        document.body.classList.add('numbered');
        if (document.activeElement) document.activeElement.blur();
        window.scrollTo(0, 0);
        const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
        return Array.from(root.querySelectorAll('.dokufix-callout :is(h2, h3, h4)')).map(h => {
          const b = getComputedStyle(h, '::before');
          return { text: h.textContent.trim(), reset: getComputedStyle(h).counterReset, increment: b.counterIncrement, content: b.content };
        });
      });
      const counted = computed.filter(h => h.reset !== 'none' || h.increment !== 'none' || h.content !== 'none');
      check('a heading inside a callout gets no number and does not count', computed.length === exp.calloutHeadingsNumbered && counted.length === 0, JSON.stringify(computed));
      const photo = async css => {
        const tag = css ? await page.addStyleTag({ content: css }) : null;
        const png = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
        if (tag) await tag.evaluate(el => el.remove());
        return png;
      };
      const asItIs = await photo(''), forcedOut = await photo(CALLOUT_HEADINGS_OUT), forcedIn = await photo(CALLOUT_HEADINGS_IN);
      await page.evaluate(() => document.body.classList.remove('numbered'));
      check('the headings after a callout are numbered as they are without its heading',
        asItIs.equals(forcedOut) && !asItIs.equals(forcedIn),
        'as it is = forced out of the count: ' + asItIs.equals(forcedOut) + '; as it is = forced into it: ' + asItIs.equals(forcedIn));
    }
    // --- the link "license information" and its view (story 2.18)
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); window.scrollTo(0, 0); });
    const lf = await licenceFacts(page);
    const wantWhere = READONLY.has(key)
      ? [{ parent: 'body', first: true, transient: false, open: false }]
      // The editor makes two at load and marks them transient: the first of the
      // toolbar's actions, and one in <body> before "Editor ↩" for read mode.
      : [{ parent: 'div#header-actions', first: true, transient: true, open: false }, { parent: 'body', first: false, next: 'button#edit-btn', transient: true, open: false }];
    const whereOk = lf.where.length === wantWhere.length && wantWhere.every((w, i) => Object.keys(w).every(k => lf.where[i][k] === w[k]));
    check('licence element: where it belongs, closed' + (READONLY.has(key) ? ', part of the file' : ', made by the script and marked transient'), whereOk, JSON.stringify(lf.where));
    await assertLicenceOpens(page, check, 'body > details.dokufix-licences > summary', 'licence link');
    // Its place at every width: the two of the screenshots are checked where
    // they are taken; here the same page is resized through the layouts.
    const misplaced = [];
    for (const width of LICENCE_WIDTHS){
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(100);
      const problems = licencePlaceProblems(await licenceFacts(page), key, width);
      if (problems.length) misplaced.push(width + ' px: ' + problems.join('; '));
    }
    check('licence link from ' + LICENCE_WIDTHS[0] + ' to ' + LICENCE_WIDTHS[LICENCE_WIDTHS.length - 1] + ' px: in the top margin, inside the window, at the right edge of the text column' +
      (key === 'mit-editor' ? ', never over "Editor ↩"' : ''), misplaced.length === 0, misplaced.join(' | '));
    // The view in a narrow window: inside it.
    await page.setViewportSize({ width: 600, height: 1000 });
    await page.waitForTimeout(100);
    await assertLicenceOpens(page, check, 'body > details.dokufix-licences > summary', 'licence link at 600 px');
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.waitForTimeout(100);

    if (key === 'mit-editor'){
      // --- edit mode: the link is one of the toolbar's actions
      await page.click('#edit-btn');
      // --- edit mode: the preview scrolls inside its pane, and the page does
      // not scroll at all. Something of the document that is placed against
      // the page instead of against its own place in the preview, such as a
      // hidden text that is position:absolute with no positioned ancestor,
      // does not scroll with the preview and makes the page higher than the
      // window.
      // The footnote previews are placed that way themselves (anchor
      // positioning, the host is not positioned). In edit mode the box below
      // the toolbar is their containing block and cuts off what reaches past
      // it (src/app.css), so the page has nothing to scroll with them in it.
      const pageSize = () => page.evaluate(() => {
        const p = document.getElementById('preview'), d = document.documentElement;
        p.scrollTop = p.scrollHeight;
        const out = { page: d.scrollHeight + ' x ' + d.scrollWidth, window: d.clientHeight + ' x ' + d.clientWidth, previewScrolledBy: p.scrollTop,
                      scrollable: d.scrollHeight > d.clientHeight || d.scrollWidth > d.clientWidth };
        p.scrollTop = 0;
        return out;
      });
      // Both measurements are taken with the page as it ships: the style that
      // switches the fallbacks off in Playwright's Firefox (NO_FALLBACKS) is
      // out of action for them. With it in the page the previews are placed
      // otherwise, and the file before the rule passed in that browser.
      const helperStyles = on => page.evaluate(([css, on]) => {
        for (const el of document.querySelectorAll('style')) if (el.textContent === css && el.sheet) el.sheet.disabled = !on;
      }, [NO_FALLBACKS, on]);
      await helperStyles(false);
      const scroll = await pageSize();
      check('edit mode, the preview scrolled to its end: the page itself cannot be scrolled', !scroll.scrollable && scroll.previewScrolledBy > 0, JSON.stringify(scroll));
      // --- edit mode: a click on an entry of the inline table of contents
      // scrolls the preview to its heading and nothing else. Before the rule
      // above the page scrolled too, and the toolbar left the window.
      if (exp.toc){
        const place = () => page.evaluate(() => {
          const top = sel => Math.round(document.querySelector(sel).getBoundingClientRect().top);
          return { toolbar: top('body > header'), paneHeader: top('.pane-preview .pane-header'), pageScrolledBy: Math.round(scrollY),
                   layoutScrolledBy: document.querySelector('.layout').scrollTop, previewScrolledBy: Math.round(document.getElementById('preview').scrollTop) };
        });
        const before = await place();
        await page.evaluate(() => { const links = document.querySelectorAll('#preview nav.dokufix-toc a'); links[Math.floor(links.length / 2)].click(); });
        // The scroll is smooth: wait until the preview has moved and stands still.
        await page.waitForFunction(() => document.getElementById('preview').scrollTop > 0, null, { timeout: 5000 }).catch(() => {});
        let after = await place();
        for (let i = 0; i < 20; i++){
          await page.waitForTimeout(200);
          const now = await place();
          if (now.previewScrolledBy === after.previewScrolledBy){ after = now; break; }
          after = now;
        }
        check('edit mode, a click on an entry of the table of contents in the preview: the preview scrolls to the heading, and toolbar and pane header stay where they are',
          after.previewScrolledBy > 0 && after.toolbar === before.toolbar && after.paneHeader === before.paneHeader && after.pageScrolledBy === 0 && after.layoutScrolledBy === 0,
          'before ' + JSON.stringify(before) + ', after ' + JSON.stringify(after));
        // Back to where the page was: the click wrote the heading's anchor into the address.
        await page.evaluate(() => {
          history.replaceState(null, '', location.pathname + location.search);
          document.getElementById('preview').scrollTo({ top: 0, behavior: 'instant' });
          scrollTo({ top: 0, behavior: 'instant' });
        });
      }
      await helperStyles(true);
      const tf = await licenceFacts(page);
      const header = await page.evaluate(() => { const r = document.querySelector('header').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
      check('edit mode: the link stands in the toolbar, visible, and the one of read mode is not shown',
        tf.linkVisible && tf.linkText === LICENCES_LINK_TEXT && tf.shownIn === 'div#header-actions' && tf.link.top >= header.top && tf.link.bottom <= header.bottom && tf.link.left >= 0 && tf.link.right <= tf.window.width,
        JSON.stringify({ visible: tf.linkVisible, text: tf.linkText, shownIn: tf.shownIn, link: round(tf.link), toolbar: round(header) }));
      const toolbar = await assertLicenceOpens(page, check, '#header-actions > details.dokufix-licences > summary', 'edit mode, licence link');
      check('edit mode: the open view hangs below the toolbar', toolbar.open.viewVisible && toolbar.open.view.top >= header.bottom - 1, round(toolbar.open.view) + ', toolbar ' + round(header));
      // --- a narrow window: the actions are a panel behind the hamburger
      await page.setViewportSize({ width: 600, height: 900 });
      await page.waitForTimeout(100);
      const hidden = await licenceFacts(page);
      await page.click('#hamburger');
      const panel = await page.evaluate(() => { const r = document.getElementById('header-actions').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
      const pf = await licenceFacts(page);
      const inside = (a, b) => !!a && a.left >= b.left - 0.6 && a.right <= b.right + 0.6 && a.top >= b.top - 0.6 && a.bottom <= b.bottom + 0.6;
      check('edit mode at 600 px: the link is in the hamburger panel, and only there',
        !hidden.linkVisible && pf.linkVisible && pf.shownIn === 'div#header-actions' && inside(pf.link, panel) && panel.left >= 0 && panel.right <= pf.window.width + 0.6,
        JSON.stringify({ beforePanelOpened: hidden.linkVisible, visible: pf.linkVisible, link: round(pf.link), panel: round(panel) }));
      if (pf.linkVisible){
        await page.click('#header-actions > details.dokufix-licences > summary');
        const po = await licenceFacts(page);
        const panelOpen = await page.evaluate(() => { const r = document.getElementById('header-actions').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
        const viewProblems = licenceViewProblems(po);
        check('edit mode at 600 px: the view opens inside the panel, as wide as the panel was', viewProblems.length === 0 && inside(po.view, panelOpen) && round(panelOpen).split(' ')[0] === round(panel).split(' ')[0] && panelOpen.bottom <= po.window.height,
          viewProblems.join('; ') + ' view ' + round(po.view) + ', panel ' + round(panel) + ' → ' + round(panelOpen));
        // With the download menu open as well the panel is taller than the
        // window, and the page does not scroll in edit mode. So the panel has
        // to end inside the window and scroll inside itself: every action in
        // it is brought into view by scrolling the panel, and only the panel,
        // and then has to lie between the window's upper and lower edge, with
        // its middle inside the window and nothing over it. Its right edge is
        // not judged: the download menu stands beside its button in the panel
        // and runs past the window's right edge, as it did before this story.
        await page.click('#download-btn');
        const reach = await page.evaluate(() => {
          const p = document.getElementById('header-actions');
          const actions = Array.from(p.querySelectorAll('summary, button'));
          const unreachable = [];
          for (const el of actions){
            let b = el.getBoundingClientRect();
            const r = p.getBoundingClientRect();
            if (b.bottom > r.bottom) p.scrollTop += Math.ceil(b.bottom - r.bottom);
            else if (b.top < r.top) p.scrollTop -= Math.ceil(r.top - b.top);
            b = el.getBoundingClientRect();
            const x = b.left + b.width / 2, y = b.top + b.height / 2;
            const top = document.elementFromPoint(x, y);
            if (!(b.top >= -1 && b.bottom <= innerHeight + 1 && x >= 0 && x <= innerWidth && !!top && el.contains(top))){
              unreachable.push((el.id || el.dataset.download || el.tagName.toLowerCase()) + ' at ' + Math.round(b.top) + '–' + Math.round(b.bottom));
            }
          }
          p.scrollTop = 0;
          const r = p.getBoundingClientRect();
          return {
            actions: actions.length, unreachable, panel: Math.round(r.top) + '–' + Math.round(r.bottom), inside: r.top >= 0 && r.bottom <= innerHeight + 0.6,
            content: p.scrollHeight, window: innerHeight,
            menuOpen: !!p.querySelector('.menu-wrap.open'), viewOpen: !!p.querySelector('details.dokufix-licences[open]'),
            pageScrolled: scrollY !== 0 || document.documentElement.scrollTop !== 0 || document.body.scrollTop !== 0,
          };
        });
        check('edit mode at 600 px, licence view and download menu both open: the panel stays inside the window, and every action in it can be reached by scrolling the panel',
          reach.menuOpen && reach.viewOpen && reach.actions >= 10 && reach.unreachable.length === 0 && reach.inside && !reach.pageScrolled, JSON.stringify(reach));
        await page.click('#download-btn');
        await page.click('#header-actions > details.dokufix-licences > summary');
      }
      await page.click('#hamburger');
    } else {
      await assertLicenceWithoutScripts(launch, file, check);
      if (key !== 'kompakt') await assertFacetsWithoutScripts(launch, file, check, exp);
    }
    check('no script errors', errors.length === 0, errors.join(' | '));
  } finally {
    await close();
  }
}

// ---------- one browser ----------
async function runBrowser(name, opts, md){
  const dir = path.join(opts.out, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'exports'), { recursive: true });
  const launch = BROWSERS[name];
  const browser = await launch();
  const results = [];
  try {
    const built = await buildExports(browser, opts, md, path.join(dir, 'exports'));
    const exp = expectationsFor(built.source);
    const check = makeChecker(results, name + ' build');
    check('no script errors while building', built.errors.length === 0, built.errors.join(' | '));
    if (exp.facets.length) check('a facet was chosen in the page while each of the four files was written', built.chosen.length === VARIANTS.length && built.chosen.every(c => c === true), JSON.stringify(built.chosen));

    for (const v of VARIANTS){
      for (const width of WIDTHS){
        for (const [schemeName, scheme] of SCHEMES){
          const base = v.key + '-' + width + '-' + schemeName;
          const { close, page } = await openVariant(launch, built.files[v.key], v.key, exp, width, scheme);
          try {
            if (scheme === 'light'){
              const rail = await page.evaluate(() => {
                const r = document.querySelector('.dokufix-rail');
                return r ? { display: getComputedStyle(r).display, links: r.querySelectorAll('a').length } : null;
              });
              const want = width >= 1500 ? 'block' : 'none';
              makeChecker(results, name + ' ' + v.key)('rail is ' + want + ' at ' + width + ' px',
                rail && rail.display === want && rail.links > 0, JSON.stringify(rail));
              // The link "license information", where the screenshot shows it.
              const misplaced = licencePlaceProblems(await licenceFacts(page), v.key, width);
              makeChecker(results, name + ' ' + v.key)('licence link at ' + width + ' px: visible, reads "' + LICENCES_LINK_TEXT + '", above the document, at the right edge of the text column',
                misplaced.length === 0, misplaced.join('; '));
            }
            await shot(page, path.join(dir, base + '.png'));
            await enterStates(page, name);
            await shot(page, path.join(dir, base + '-zustand.png'));
          } finally { await close(); }
        }
      }
      await assertVariant(launch, built.files[v.key], v.key, exp, results, name);
    }

    // The preview pane inside the editor: same document rules, the editor's frame.
    for (const [schemeName, scheme] of SCHEMES){
      const { close, page } = await openVariant(launch, built.files['mit-editor'], 'mit-editor', exp, 1400, scheme);
      try {
        await page.click('#edit-btn');
        const h = await page.evaluate(() => {
          const p = document.getElementById('preview');
          if (document.activeElement) document.activeElement.blur();
          return Math.ceil(p.getBoundingClientRect().top + p.scrollHeight) + 2;
        });
        await page.setViewportSize({ width: 1400, height: Math.min(h, 15000) });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(dir, 'mit-editor-bearbeiten-1400-' + schemeName + '.png'), animations: 'disabled', caret: 'hide' });
      } finally { await close(); }
    }

    const info = { browser: name, version: browser.version(), file: opts.file, document: opts.demo ? '(demo text)' : opts.doc,
                   clockStart: FIXED_NOW.toISOString(), libraries: built.libs, sizes: built.sizes };
    fs.writeFileSync(path.join(dir, 'sizes.json'), JSON.stringify(info, null, 2) + '\n');
    return { name, dir, info, results };
  } finally {
    await browser.close();
  }
}

// ---------- PNG, just enough to compare two screenshots ----------
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
// file: a path, or the picture itself as a Buffer.
function decodePng(file){
  const buf = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
  if (Buffer.isBuffer(file)) file = '(a screenshot in memory)';
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG: ' + file);
  let width = 0, height = 0, channels = 0;
  const idat = [];
  for (let p = 8; p < buf.length;){
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR'){
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || (data[9] !== 2 && data[9] !== 6) || data[12] !== 0) throw new Error('unsupported PNG format: ' + file);
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++){
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride, up = dst - stride;
    for (let i = 0; i < stride; i++){
      const a = i >= channels ? px[dst + i - channels] : 0;
      const b = y > 0 ? px[up + i] : 0;
      const c = (y > 0 && i >= channels) ? px[up + i - channels] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4){
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      px[dst + i] = (raw[src + i] + pred) & 255;
    }
  }
  return { width, height, channels, px };
}
function encodePngRgb(width, height, rgb){
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// Differing pixels between two images. Where the sizes differ, everything outside
// the common area counts as differing. diffFile gets a white image with every
// differing pixel in red.
function comparePng(beforeFile, afterFile, diffFile){
  const a = decodePng(beforeFile), b = decodePng(afterFile);
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  const mask = Buffer.alloc(w * h * 3, 255);
  let differing = 0, top = -1, bottom = -1, left = w, right = -1;
  for (let y = 0; y < h; y++){
    for (let x = 0; x < w; x++){
      let diff = x >= a.width || x >= b.width || y >= a.height || y >= b.height;
      if (!diff){
        const i = (y * a.width + x) * a.channels, j = (y * b.width + x) * b.channels;
        diff = a.px[i] !== b.px[j] || a.px[i + 1] !== b.px[j + 1] || a.px[i + 2] !== b.px[j + 2];
      }
      if (!diff) continue;
      differing++;
      if (top < 0) top = y;
      bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
      const m = (y * w + x) * 3;
      mask[m] = 220; mask[m + 1] = 0; mask[m + 2] = 0;
    }
  }
  if (differing && diffFile){
    fs.mkdirSync(path.dirname(diffFile), { recursive: true });
    fs.writeFileSync(diffFile, encodePngRgb(w, h, mask));
  }
  return { differing, before: a.width + 'x' + a.height, after: b.width + 'x' + b.height,
           box: differing ? { left, top, right, bottom } : null };
}

function compareRun(run, baselineRoot){
  const baseDir = path.join(baselineRoot, run.name);
  const out = { images: [], sizes: null, libraries: null };
  const pngs = dir => fs.readdirSync(dir).filter(f => f.endsWith('.png'));
  const names = pngs(run.dir);
  // An image only the baseline has is a difference too, not a smaller comparison.
  const all = [...new Set([...names, ...pngs(baseDir)])].sort();
  for (const f of all){
    const before = path.join(baseDir, f);
    if (!names.includes(f)){ out.images.push({ image: f, missingRun: true }); continue; }
    if (!fs.existsSync(before)){ out.images.push({ image: f, missingBaseline: true }); continue; }
    out.images.push({ image: f, ...comparePng(before, path.join(run.dir, f), path.join(run.dir, 'diff', f)) });
  }
  const sizesFile = path.join(baseDir, 'sizes.json');
  if (fs.existsSync(sizesFile)){
    const base = JSON.parse(fs.readFileSync(sizesFile, 'utf8'));
    out.sizes = Object.fromEntries(VARIANTS.map(v => [v.key, { before: base.sizes[v.key], after: run.info.sizes[v.key] }]));
    out.libraries = base.libraries;
  }
  fs.writeFileSync(path.join(run.dir, 'vergleich.json'), JSON.stringify(out, null, 2) + '\n');
  return out;
}

// ---------- report ----------
const fmtBytes = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' B';
const libLine = libs => libs.map(l => l.url.replace('https://cdn.jsdelivr.net/npm/', '') + (l.version ? ' → ' + l.version : '') + (l.status !== 200 ? ' [' + l.status + ']' : '')).join(', ');

function report(run, cmp){
  console.log('\n== ' + run.name + ' ' + run.info.version + ' ==');
  console.log('libraries: ' + libLine(run.info.libraries));
  if (cmp && cmp.libraries) console.log('baseline:  ' + libLine(cmp.libraries));
  console.log('sizes:');
  for (const v of VARIANTS){
    const after = run.info.sizes[v.key];
    let line = '  ' + v.label.padEnd(11) + fmtBytes(after).padStart(12);
    if (cmp && cmp.sizes && cmp.sizes[v.key].before !== undefined){
      const before = cmp.sizes[v.key].before, d = after - before;
      line += '   before ' + fmtBytes(before).padStart(11) + '   ' + (d >= 0 ? '+' : '−') + fmtBytes(Math.abs(d)) +
              ' (' + (d >= 0 ? '+' : '−') + Math.abs(d / before * 100).toFixed(1) + ' %)';
    }
    console.log(line);
  }
  const failed = run.results.filter(r => !r.ok);
  console.log('assertions: ' + (run.results.length - failed.length) + ' of ' + run.results.length + ' green');
  for (const r of failed) console.log('  FAIL ' + r.scope + ': ' + r.name + (r.detail ? ' — ' + r.detail : ''));
  for (const r of run.results.filter(x => x.note)) console.log('  note ' + r.scope + ': ' + r.name + ' — ' + r.note);
  let differing = 0;
  if (cmp){
    const same = cmp.images.filter(i => i.differing === 0).length;
    console.log('screenshots: ' + same + ' of ' + cmp.images.length + ' identical to the baseline');
    for (const i of cmp.images){
      if (i.missingBaseline){ console.log('  ' + i.image + ': no baseline image'); differing++; continue; }
      if (i.missingRun){ console.log('  ' + i.image + ': only in the baseline'); differing++; continue; }
      if (!i.differing) continue;
      differing++;
      console.log('  ' + i.image + ': ' + i.differing + ' px differ, rows ' + i.box.top + '–' + i.box.bottom +
        ', columns ' + i.box.left + '–' + i.box.right + (i.before !== i.after ? ', size ' + i.before + ' → ' + i.after : ''));
    }
  }
  return { failed: failed.length, differing };
}

// ---------- main ----------
const opts = parseArgs(process.argv.slice(2));
const md = opts.demo ? null : fs.readFileSync(opts.doc, 'utf8');
const names = opts.browser === 'all' ? ['chromium', 'firefox'] : [opts.browser];
// A baseline that is not there cannot be compared with. Say so before anything
// is built or deleted, and fail: "nothing differs" would be a false result.
if (opts.compare){
  const missing = names.filter(n => !fs.existsSync(path.join(opts.compare, n, 'sizes.json')));
  if (missing.length){
    console.error('no baseline for ' + missing.join(' and ') + ' in ' + opts.compare + ' (expected <browser>/sizes.json from an earlier --out run)');
    process.exit(1);
  }
}
let failed = 0, differing = 0;
// The browsers run side by side: each has its own folder and its own browser
// processes, and nothing in a run is shared with the other. The report comes
// afterwards, one browser after the other, in the order of the names.
const runs = await Promise.all(names.map(name => runBrowser(name, opts, md)));
for (const run of runs){
  const cmp = opts.compare ? compareRun(run, opts.compare) : null;
  const r = report(run, cmp);
  failed += r.failed; differing += r.differing;
}
console.log('\nexports and screenshots: ' + opts.out);
if (failed) console.log(failed + ' assertion(s) failed');
if (opts.compare && differing) console.log(differing + ' screenshot(s) differ from the baseline; red-on-white masks are in <browser>/diff/');
process.exit(failed || (opts.strict && differing) ? 1 : 0);
