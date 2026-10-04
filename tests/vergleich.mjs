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
// and facet filter, the free-text filter, the figure of every diagram with its
// title, BPMN diagrams with their elements, colours and credit, a BPMN diagram
// laid out without coordinates with its counts and a clean drawing, the large
// view of a diagram in every variant and with scripts off, the live viewer of
// a BPMN diagram in the editor and in Mit Editor, touch on it in Chromium, and
// none in a read-only file, the licence
// information, the search in Mit Editor, schlank and kompakt, no <script> and
// nothing of the search in nur-lesen, nothing of bpmn-js and no editor rules
// in a read-only export). The font check of the BPMN labels (Chromium,
// nur-lesen) notes what does not fit or lies on a flow, with a picture, and
// does not fail.
// Besides the pictures of the page at rest and with every state switched on,
// the run takes one of the large view of the first diagram open, per variant
// at 1400 px in the light scheme, into <browser>/grossansicht/ (see
// compareRun()).
// Differing pixels alone do not fail the
// run unless --strict is given: some differences are decided, and the run lists
// them so a human can attribute each one. An image that only one side has counts
// as differing. A --compare folder that holds no run for a browser, or that is
// the --out folder itself, stops the run with exit 1 before anything is built.
// So does a library that is neither in tests/.cdn/ nor can be fetched. A
// library the page asks for that the file under test does not pin is refused
// and fails the run.
//
// Date and Math.random are replaced by deterministic stand-ins, because the
// read-only exports print their export time, Mermaid derives its SVG ids from
// Date.now(), and Mermaid 12 draws node outlines with randomised control points.
// Without that, two runs of the same file differ by a few dozen bytes and sizes
// could not be compared. The clock must still tick: with a frozen Date.now() every
// diagram gets the same id and Mermaid draws the second one into the first.
//
// One browser process per browser and run; every opening gets a browser
// context of its own, with fresh storage and the clock frozen anew, so no page
// inherits state from the one before it. The libraries the page loads from
// jsDelivr are served to every context from tests/.cdn/ (tests/cdn.mjs).
//
// The run waits on conditions, not on fixed times: after a change of the
// window's size, a style or a scroll position, two animation frames; after
// focusing a footnote marker, until its preview is fully shown; after a
// smooth scroll, until the browser fires "scrollend".
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
import { readMarker, judgeMarker, refusedMarker, repeatedMarker } from '../src/app/markers.js';
// What a facet marker comes to on a table, its controls or the reason it
// refuses, is asked where the product decides it, with the table as this run
// read it from the Markdown.
import { planFacets, FACET_ALL } from '../src/app/facets.js';
// What the free-text filter makes of a marker (its placeholder), which row
// matches a term and what the counter says, is asked where the product decides
// it, with the text of each row as this run read it from the Markdown.
import { markFilter, filterMatches, filterCountText, FILTER_LABEL } from '../src/app/filter.js';
// Whether a BPMN block holds coordinates, and what the warning of one that
// cannot be drawn says, is asked where the product decides it; for a block
// without coordinates, whether it can be laid out and what it holds, too.
import { hasCoordinates, bpmnWarningText, BPMN_CREDIT } from '../src/app/bpmn.js';
import { readProcess } from '../src/app/bpmn-layout.js';
// The names of the downloads below the diagrams and how a source stands in
// its link are asked where the product decides them (story 2.10).
import { diagramFileNames, sourceDataUrl, DOWNLOADS_LABEL } from '../src/app/diagram-downloads.js';
import { DIAGRAM_KINDS as KINDS } from '../src/app/diagrams.js';
import { DIAGRAM_LANGUAGES } from '../src/app/diagram-kinds.js';
// Which places of the preview a search lists, how many hits each holds and
// under which group headings they stand is asked where the product decides it,
// over the preview read back into linkedom.
import { parseHTML, DOMParser as XmlParser } from 'linkedom';
import { collectPlaces, groupResults, nodeRanges } from '../src/app/search-places.js';
import { findHits } from '../src/app/search-match.js';
import { prepareLibraries, librariesLine, versionOf } from './cdn.mjs';

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
  const exp = { frontmatter: false, digest: '', mermaid: 0, diagrams: [], toc: false, images: 0, missing: 0, multiRef: null, footnotes: 0,
                callouts: [], calloutHeadings: [], calloutHeadingsNumbered: 0,
                tocDepth: 0, chips: [], footnoteChips: [], chipHeadings: [], linkedChips: 0,
                cards: [], steps: [], markerWarnings: [], comments: 0, markersAsCode: 0, stepFootnotes: 0,
                facets: [], filters: [], tables: 0, wideTables: [], subLines: [], tableFootnotes: 0 };
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
  exp.diagrams = diagramExpectations(body);
  const toc = body.match(/^\[\[toc(?::([1-6]))?\]\][ \t]*$/m);
  exp.toc = !!toc;
  exp.tocDepth = toc ? Number(toc[1] || 3) : 0;
  // An image asset is shown when the file under test carries it in its block
  // (#dokufix-assets: the images of the demo text, as built), else it is missing.
  exp.missing = Array.from(body.matchAll(/!\[[^\]]*\]\(#asset-([0-9a-f]{12,64})\)/gi)).filter(m => !bakedAssets.has(m[1].toLowerCase())).length;
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
// ---------- diagrams, read from the Markdown ----------
// Every fenced block of a diagram kind, in the order of the document: its
// kind, and its title, the label of the last heading before it (diagrams.js):
// the heading's text with every code span put as its label, as the table of
// contents shows it, or "Diagramm". Read as far as the reference document needs
// it: a heading written with "#" at the beginning of its line, with no inline
// markup besides code spans. A heading in a quotation is not read, so one
// that stands in a plain quotation before a diagram would be missed. A BPMN
// block keeps its XML: whether it is drawn is judged once the browser has
// said whether the XML parses (judgeDiagrams()).
const DIAGRAM_KINDS = Object.keys(DIAGRAM_LANGUAGES);
function diagramExpectations(body){
  const CODE_SPAN = /(`+)(.+?)\1(?!`)/g;
  const spanText = raw => /^ .* $/.test(raw) && raw.trim() ? raw.slice(1, -1) : raw;
  const out = [];
  let fence = null, title = '';
  for (const line of body.split(/\r?\n/)){
    const f = line.match(/^(```|~~~)[ \t]*([\w-]*)/);
    if (f){
      if (fence === null){ fence = f[2]; if (DIAGRAM_KINDS.includes(f[2])) out.push({ kind: f[2], title: title || 'Diagramm', source: [], drawn: true }); }
      else { fence = null; if (out.length && Array.isArray(out[out.length - 1].source)) out[out.length - 1].source = out[out.length - 1].source.join('\n'); }
      continue;
    }
    if (fence !== null){ if (DIAGRAM_KINDS.includes(fence)) out[out.length - 1].source.push(line); continue; }
    const h = line.match(/^#{1,6}[ \t]+(.+?)[ \t]*$/);
    if (h) title = h[1].replace(CODE_SPAN, (all, ticks, raw) => { const status = readChip(spanText(raw)); return status ? status.label : spanText(raw); }).replace(/\s+/g, ' ').trim();
  }
  return out;
}

// Which BPMN diagram is drawn: one whose XML parses (wellFormed, as the
// browser's XML parser said, in the order of the blocks) and holds
// coordinates, or one without coordinates that readProcess() of the product
// can lay out (laidOut); its expected elements are then its flow nodes, flows
// and lanes, a pool only where a participant exists, never the synthetic
// lane, and model the process as read. reason: what the warning of one that
// is not drawn says as its detail, the layout's refusal, or null where that is
// the library's own message (XML that does not parse, no BPMN definitions).
// The run assumes the page has Mermaid; without it no block without
// coordinates is drawn.
function judgeDiagrams(exp, wellFormed){
  exp.diagrams.filter(d => d.kind === 'bpmn').forEach((d, i) => {
    Object.assign(d, { drawn: false, reason: null, laidOut: false, expected: null, model: null });
    if (!wellFormed[i]) return;
    if (hasCoordinates(d.source)){ Object.assign(d, { drawn: true, reason: '' }); return; }
    let read = null;
    try { read = readProcess(new XmlParser().parseFromString(d.source, 'text/xml')); }
    catch (e){ d.reason = e.message; return; }
    if (!read) return;
    const m = read.model;
    Object.assign(d, { drawn: true, reason: '', laidOut: true, model: m, expected: [
      ...(m.pool ? [{ id: m.pool.id, tag: 'participant' }] : []),
      ...m.lanes.filter(l => !l.synthetic).map(l => ({ id: l.id, tag: 'lane' })),
      ...m.nodes.map(n => ({ id: n.id, tag: n.tag })),
      ...m.flows.map(f => ({ id: f.id, tag: 'sequenceFlow' })),
    ] });
  });
  return exp;
}

function markerExpectations(body){
  const out = { cards: [], steps: [], facets: [], filters: [], markerWarnings: [], comments: 0, markersAsCode: 0, stepFootnotes: 0 };
  // Per block, by the line it starts at, the names of the markers applied to it.
  const applied = new Map();
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
  // blank nor only comments: its tag, and for a list its items. lines: the
  // document, or the lines of a list item with its indentation taken off.
  const blockAfter = (from, lines) => {
    let i = from;
    while (i < lines.length && !inFence[i] && (!lines[i].trim() || onlyComments(lines[i]))) i++;
    if (i >= lines.length || inFence[i]) return { tag: i < lines.length ? 'PRE' : '', at: i };
    const at = i;
    const start = BULLET.test(lines[i]) ? BULLET : NUMBERED.test(lines[i]) ? NUMBERED : null;
    if (!start){
      const table = tableAt(lines, i);
      return table ? { tag: 'TABLE', table, at } : { tag: 'P', at };
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
    return { tag: start === BULLET ? 'UL' : 'OL', items, at };
  };
  // The lines of a list item whose content is indented by this much: those
  // lines without it; blank lines stay blank, and a line that is not indented
  // so far ends the item.
  const itemLines = indent => lines.map(line => !line.trim() ? '' : line.startsWith(indent) ? line.slice(indent.length) : '\0');
  const titleOf = text => { const m = text.match(/^\*\*(?!\*)(.+?)\*\*(?!\*)/); return m ? m[1] : null; };
  // "*Website:*", or "***Website:***", the actor in bold as well.
  const actorOf = text => { const m = text.match(/^(?:\*\*\*([^*]*?\S)\s*:\s*\*\*\*(?!\*)|([*_])(?!\2)([^*_]*?\S)\s*:\s*\2(?!\2))/); return m ? m[1] || m[3] : null; };
  lines.forEach((line, i) => {
    if (inFence[i]) return;
    for (const m of line.matchAll(CODE_SPAN)) if (AS_CODE.test(m[2])) out.markersAsCode++;
    const bare = withoutCode(line);
    // A marker on a line of its own, at the beginning of the line or indented
    // in a list item; then its block is read in the item's lines.
    const indent = bare.match(/^[ \t]*/)[0];
    const alone = bare.slice(indent.length).startsWith('<!--') && onlyComments(line);
    for (const m of bare.matchAll(COMMENT)){
      const marker = readMarker(m[1]);
      if (!marker){ out.comments++; continue; }
      const block = alone ? blockAfter(i + 1, indent ? itemLines(indent) : lines) : { tag: '' };
      const verdict = judgeMarker(marker, block.tag);
      const names = verdict.entry ? applied.get(block.at) || new Set() : null;
      if (verdict.warning) out.markerWarnings.push(verdict.warning);
      // A component is applied to a block once; the same marker again is a warning.
      else if (names.has(verdict.entry.name)) out.markerWarnings.push(repeatedMarker(marker));
      else if (verdict.entry.name === 'cards') out.cards.push(block.items.map(item => titleOf(item.text)));
      else if (verdict.entry.name === 'steps'){
        out.steps.push(block.items.map((item, n) => ({ number: String(block.items[0].written + n), actor: actorOf(item.text) })));
        out.stepFootnotes += block.items.filter(item => /\[\^[^\]\s]+\]/.test(item.text)).length;
      }
      else if (verdict.entry.name === 'facets'){
        // The component may still refuse the table; a facet filter is applied
        // to a table once, as every component is to its block.
        const plan = facetPlan(marker.argument, block.table);
        if (plan.warning){ out.markerWarnings.push(refusedMarker(marker, plan.warning)); continue; }
        out.facets.push({ legend: plan.legend, controls: [[FACET_ALL, block.table.rows.length], ...plan.groups.map(g => [g.label, g.count])], keys: plan.keys, at: block.at });
      }
      else if (verdict.entry.name === 'filter'){
        // The placeholder is what the component writes onto its table.
        let placeholder = null;
        markFilter({ setAttribute: (name, value) => { placeholder = value; } }, marker.argument);
        out.filters.push({ placeholder, at: block.at, rows: filterRows(block.table), footnotes: filterFootnotes(block.table) });
      }
      else throw new Error('the run has no expectation for the marker "' + verdict.entry.name + '"');
      if (verdict.entry) applied.set(block.at, names.add(verdict.entry.name));
    }
  });
  // A filter and a facet filter on one table: the facets of the filter, and
  // whether a facet filter holds a field.
  for (const f of out.filters) f.facet = out.facets.findIndex(x => x.at === f.at);
  for (const x of out.facets) x.filtered = out.filters.some(f => f.at === x.at);
  // What each filter is typed with, and which rows it has to show then.
  const definitions = new Map(Array.from(body.matchAll(/^\[\^([^\]\s]+)\]:[ \t]*(.*)$/gm)).map(m => [m[1], m[2]]));
  for (const f of out.filters) Object.assign(f, filterTerms(f, definitions));
  // Beside a facet filter: a value and a term that each show more rows than
  // the two together, which show at least one.
  for (const f of out.filters){
    if (f.facet < 0) continue;
    const keys = out.facets[f.facet].keys, n = out.facets[f.facet].controls.length;
    const words = [...new Set(f.rows.flatMap(text => text.match(/[\p{L}\p{N}_]{4,}/gu) || []))];
    for (let control = 1; control < n && !f.combined; control++){
      for (const term of words){
        const byText = f.rows.map(text => filterMatches(term, text)), both = byText.map((m, i) => m && keys[i] === control);
        const count = list => list.filter(Boolean).length;
        if (count(both) > 0 && count(both) < count(byText) && count(both) < keys.filter(k => k === control).length){ f.combined = { control, term, shown: both }; break; }
      }
    }
  }
  return out;
}

// ---------- the free-text filter, read from the Markdown ----------
// The text of every data row as the filter searches it: its cells joined by a
// blank, a line break as a blank; a status code span is its label, other code
// its content; emphasis, a link and a masking backslash leave their text; a
// footnote marker leaves nothing. For a table written as HTML the cells' text.
function filterRows(table){
  const CODE_SPAN = /(`+)(.+?)\1(?!`)/g;
  const spanText = text => /^ .* $/.test(text) && text.trim() ? text.slice(1, -1) : text;
  const cellText = raw => {
    const code = [];
    return raw.replace(/<br\s*\/?>/gi, ' ')
      .replace(CODE_SPAN, (all, ticks, text) => { const status = readChip(spanText(text)); code.push(status ? status.label : spanText(text)); return '\0'; })
      .replace(/\[\^[^\]\s]+\]/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(\*{1,3}|~~)(?=\S)(.+?)(?<=\S)\1/g, '$2')
      .replace(/\\([!-\/:-@[-`{-~])/g, '$1')
      .replace(/\0/g, () => code.shift());
  };
  const htmlText = cell => cell.text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '');
  return table.rows.map(row => row.map(cell => table.html ? htmlText(cell) : cellText(cell)).join(' ').replace(/\s+/g, ' ').trim());
}
// What stands in a filter table that a reader does not see as its text: the
// word a status chip carries for assistive technology, and the labels of the
// footnotes its cells cite.
function filterFootnotes(table){
  const raw = table.rows.flat().map(cell => table.html ? cell.text : cell).join(' ');
  const chips = Array.from(raw.matchAll(/(`+)(.+?)\1(?!`)/g)).map(m => readChip(m[2])).filter(Boolean).map(status => status.colour);
  return { chips, labels: Array.from(raw.matchAll(/\[\^([^\]\s]+)\]/g)).map(m => m[1]) };
}
// The terms a filter is typed with and the rows each has to show, from
// filterMatches() of the product on the rows as read above:
//   term     the first word of four letters or more that some rows contain and
//            others do not, preferring one that more than one row contains
//   hidden   the words a reader does not see as text of the table: the word of
//            each of its chips, and from the definition of each footnote it
//            cites the first word of six letters or more that no row contains
function filterTerms(f, definitions){
  const total = f.rows.length;
  const shownFor = term => f.rows.map(text => filterMatches(term, text));
  const words = [...new Set(f.rows.flatMap(text => text.match(/[\p{L}\p{N}_]{4,}/gu) || []))];
  const count = word => shownFor(word).filter(Boolean).length;
  const term = words.find(w => count(w) > 1 && count(w) < total) || words.find(w => count(w) > 0 && count(w) < total) || null;
  const lower = f.rows.join(' ').toLocaleLowerCase('de');
  const hidden = [
    ...f.footnotes.chips.map(colour => CHIPS[colour].word),
    ...f.footnotes.labels.map(label => ((definitions.get(label) || '').match(/[\p{L}]{6,}/gu) || []).find(w => !lower.includes(w.toLocaleLowerCase('de')))).filter(Boolean),
  ];
  return { term, shown: term ? shownFor(term) : null, hidden: hidden.map(word => ({ word, shown: shownFor(word) })) };
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

// The libraries of the file under test, served from tests/.cdn/; set in main.
let libraries = null;
// A browser context of its own for one opening: fresh storage, the libraries
// served locally, and Date and Math.random frozen unless scripts are off.
async function openContext(browser, options){
  const context = await browser.newContext({ ...CONTEXT, ...options });
  await libraries.serve(context);
  if (options.javaScriptEnabled !== false) await freeze(context);
  return context;
}

// Two animation frames: whatever a change of size, style or scroll position
// sets off, layout and the handlers the page runs on the next frame, is done.
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// ---------- build: one document, four exports ----------
async function buildExports(browser, opts, md, dir, check){
  const context = await openContext(browser, { viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  // The libraries the page loaded, with the version their URL names: they are
  // served from tests/.cdn/, a file per URL of an exact version.
  const libs = [];
  page.on('response', r => {
    if (!r.url().includes('cdn.jsdelivr.net')) return;
    libs.push({ url: r.url(), status: r.status(), version: versionOf(r.url()) || '' });
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
  // The free-text filter typed while a file is written: the first that has a term.
  const planned = expectationsFor(source), typing = planned.filters;
  // Whether each BPMN block parses as XML, by the browser's parser.
  const wellFormed = await page.evaluate(xmls => xmls.map(x => new DOMParser().parseFromString(x, 'application/xml').getElementsByTagName('parsererror').length === 0),
    planned.diagrams.filter(d => d.kind === 'bpmn').map(d => d.source));
  const typedFilter = typing.findIndex(f => f.term);

  await page.click('#edit-btn'); // the download menu lives in the editor toolbar
  const sizes = {};
  const files = {};
  // A facet that is chosen while a file is written: the file has to open with
  // all rows all the same (assertTables()). Chosen anew before every download,
  // because a read-only download renders, and a render starts with all rows.
  const chosen = [];
  // And a term typed into a free-text filter: every file has to open with all
  // rows (assertFilters()). Typed anew before every download, because a
  // read-only download renders, and a render makes a new, empty field.
  const typed = [];
  // The large view of a diagram, open while each file is written.
  const views = [];
  const fieldState = () => page.evaluate(() => ({
    values: Array.from(document.querySelectorAll('#preview .dokufix-filter-input')).map(i => i.value),
    counts: Array.from(document.querySelectorAll('#preview .dokufix-filter-count')).map(c => c.textContent),
    out: document.querySelectorAll('#preview .dokufix-filter-out').length,
  }));
  for (const v of VARIANTS){
    chosen.push(await page.evaluate(() => {
      const input = document.querySelector('#preview .dokufix-facets .dokufix-facet-bar label:nth-of-type(2) input');
      if (!input) return null;
      input.closest('label').click();
      return input.checked;
    }));
    let term = null;
    if (typedFilter >= 0){
      const f = typing[typedFilter];
      await page.locator('#preview .dokufix-filter-input').nth(typedFilter).fill(f.term, { timeout: 5000 }).catch(() => {});
      // Its counter counts the rows that match and, where its table is the
      // first facet filter's, have the value chosen there: the key 1.
      const keys = f.facet === 0 && chosen[chosen.length - 1] ? planned.facets[0].keys : null;
      term = { variant: v.key, filter: typedFilter, typed: await fieldState(), count: filterCountText(f.shown.filter((m, i) => m && (!keys || keys[i] === 1)).length, f.rows.length) };
    }
    // And the large view of the first diagram, open at "150 %": every file has
    // to open with every view closed, at "Einpassen" (assertLargeView()).
    // Opened anew before every download: a read-only download renders, and a
    // render closes it. The view lies over the toolbar, so the download is
    // started through the DOM.
    const viewState = () => page.evaluate(() => {
      const f = document.querySelector('#preview figure.dokufix-diagram');
      return f && f.querySelector('.dokufix-diagram-toggle') ? { open: f.querySelector('.dokufix-diagram-toggle').checked, zoom: f.querySelector('.dokufix-diagram-zoom:checked').value,
                   views: Array.from(document.querySelectorAll('.dokufix-diagram-toggle')).filter(t => t.checked).length,
                   page: getComputedStyle(document.documentElement).overflow } : null;
    });
    const view = { variant: v.key, before: await page.evaluate(() => {
      const f = document.querySelector('#preview figure.dokufix-diagram');
      if (!f || !f.querySelector('.dokufix-diagram-toggle')) return null;
      if (!f.querySelector('.dokufix-diagram-toggle').checked) f.querySelector('.dokufix-diagram-stage').click();
      f.querySelector('.dokufix-diagram-step:nth-child(3)').click();
      return true;
    }) && await viewState() };
    await page.evaluate(() => document.getElementById('download-btn').click());
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.evaluate(sel => document.querySelector(sel).click(), 'button[data-download="' + v.download + '"]'),
    ]);
    const file = path.join(dir, v.key + '.html');
    await download.saveAs(file);
    await page.waitForFunction(() => !document.querySelector('button[data-download]:disabled'));
    files[v.key] = file;
    sizes[v.key] = fs.statSync(file).size;
    if (term){ term.after = await fieldState(); typed.push(term); }
    view.after = await viewState();
    views.push(view);
  }
  // The document rendered again, twice: one field per table each time.
  const rendered = [];
  for (let n = 0; n < 2; n++){
    await page.evaluate(() => {
      const marker = document.createElement('i');
      marker.id = 'vergleich-render-pending';
      document.getElementById('dokufix-rail').appendChild(marker);
      document.getElementById('render-btn').click();
    });
    await page.waitForFunction(() => !document.getElementById('vergleich-render-pending'), null, { timeout: 90000 });
    rendered.push(await page.evaluate(() => document.querySelectorAll('#preview .dokufix-filter').length));
  }
  // The live viewer of a BPMN diagram in the editor, in edit mode, and two
  // files written while it is open (story 2.11).
  await assertLiveViewer(page, check, judgeDiagrams(expectationsFor(source), wellFormed), 'editor', { dir });
  await context.close();
  libs.sort((x, y) => x.url.localeCompare(y.url));
  return { files, sizes, libs, errors, source, chosen, typed, views, rendered, wellFormed };
}

// ---------- reopen ----------
async function openVariant(browser, file, key, exp, width, scheme){
  const context = await openContext(browser, { viewport: { width, height: 1000 }, colorScheme: scheme });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(pathToFileURL(file).href);
  if (key === 'mit-editor'){
    // A saved file has an empty preview; content in it means init has run.
    // The render is through when every diagram is drawn in its figure, or
    // when the rail is built, the last thing a render does: a file that draws
    // diagrams otherwise, such as the PoC, is known by that.
    await page.waitForFunction(n =>
      (document.querySelectorAll('#preview .dokufix-diagram .dokufix-diagram-svg > svg').length >= n || !!document.querySelector('#dokufix-rail.has-items')) &&
      document.querySelector('#preview') && document.querySelector('#preview').children.length > 0,
      exp.diagrams.filter(d => d.drawn).length, { timeout: 90000 });
  } else if (key === 'schlank'){
    // The decoder unpacks the diagrams, then the source links (story 2.10).
    await page.waitForFunction(() => !document.querySelector('[data-gz], [data-gz-href]'), null, { timeout: 30000 });
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
  await frames(page);
  return { close: () => context.close(), page, errors };
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
  // The preview fades in (a transition of .12 s): wait until it is fully shown.
  // A page without one, or one whose preview does not appear, is photographed
  // as it is after the wait, as before.
  await settles(page, () => {
    const marker = document.querySelector('a[data-footnote-ref]');
    const preview = marker && marker.parentElement.querySelector(':scope > .dokufix-fn-preview');
    return !preview || Number(getComputedStyle(preview).opacity) === 1;
  });
  await frames(page);
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
  // The search's magnifier (story 5.10), where it is shown.
  const magnifier = document.querySelector('body > .search-magnifier');
  facts.magnifier = magnifier && magnifier.getClientRects().length ? box(magnifier) : null;
  facts.window = { width: document.documentElement.clientWidth, height: innerHeight, scrollY };
  if (opts.without) places.forEach(([x, parent, next]) => parent.insertBefore(x, next));
  return facts;
}, options);
const round = b => b ? [b.left, b.top, b.right, b.bottom].map(n => Math.round(n * 10) / 10).join(' ') : 'none';
const overlap = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
// What is wrong with the place of the link in read mode or in an export, as a
// list; empty when it stands where it should. In the empty top margin, above
// the first line, inside the window; its right edge on the right edge of the
// text column, so never above the rail. One exception, a narrow window: there
// "Editor ↩" and the magnifier of the search left of it stand in that corner
// of the editor file, and the link stands left of both; in an export the
// magnifier stands in it, 16 to 51 px from the right, and the link left of
// that corner, in `nur-lesen`, which has no magnifier, as well (story 5.10).
const MAGNIFIER_CORNER = 51;
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
  if (width <= NARROW && key === 'mit-editor'){
    if (!f.button || l.right > f.button.left) problems.push('not left of "Editor ↩" (link ' + round(l) + ', button ' + round(f.button) + ')');
    if (!f.magnifier || l.right > f.magnifier.left) problems.push('not left of the magnifier (link ' + round(l) + ', magnifier ' + round(f.magnifier) + ')');
  } else if (width <= NARROW){
    if (l.right > f.window.width - MAGNIFIER_CORNER) problems.push('not left of the magnifier\'s corner (link ' + round(l) + ', window ' + f.window.width + ')');
  } else if (Math.abs(l.right - c.right) > EPS){
    problems.push('its right edge is not the text column\'s (link ' + round(l) + ', column ends at ' + c.right + ')');
  }
  if (f.rail && l.right > f.rail.left) problems.push('it stands above the rail (link ' + round(l) + ', rail ' + round(f.rail) + ')');
  if (key === 'mit-editor' && overlap(l, f.button)) problems.push('it overlaps "Editor ↩" (link ' + round(l) + ', button ' + round(f.button) + ')');
  if (overlap(l, f.magnifier)) problems.push('it overlaps the magnifier of the search (link ' + round(l) + ', magnifier ' + round(f.magnifier) + ')');
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
async function assertLicenceWithoutScripts(browser, file, check){
  const context = await openContext(browser, { viewport: { width: 1400, height: 1000 }, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(file).href);
    const f = await licenceFacts(page);
    check('licence link with scripts off: visible, in the top margin, inside the window',
      f.linkVisible && f.linkText === LICENCES_LINK_TEXT && f.link.top >= 0 && f.link.bottom <= f.column.top + 0.6 && f.link.left >= 0 && f.link.right <= f.window.width,
      JSON.stringify({ visible: f.linkVisible, text: f.linkText, link: round(f.link), firstLine: f.column.top }));
    await assertLicenceOpens(page, check, 'details.dokufix-licences > summary', 'licence link with scripts off');
  } finally {
    await context.close();
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
  while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('.dokufix-diagram')) comments.push(walker.currentNode.data);
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
    await frames(page);
    const narrow = await markerFacts(page);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await frames(page);
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
  await frames(page);
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
  await frames(page);
  // Above its marker and over it, inside the window.
  const stands = x => x.shown && x.preview.bottom <= x.marker.top + 1 && x.preview.left <= x.marker.left + 1 && x.preview.right >= x.marker.right - 1 &&
    x.preview.left >= 0 && x.preview.right <= x.window.width + 0.6 && x.preview.top >= 0 && x.preview.bottom <= x.window.height && x.preview.right - x.preview.left > 50;
  // A document with no plain list citing a footnote in the same window, as the
  // demo text: the step's preview is judged on its own. Not in the Playwright
  // Firefox build, where a preview does not stand above its marker once the
  // page is scrolled (see above), with a note.
  if (step && !plain){
    const alone = !(label === 'firefox' && !stands(step));
    check('the preview of a footnote cited inside a step stands above its marker, inside the window (' + STEP_FOOTNOTE_WIDTH + ' px; no plain list to compare it with)',
      !alone || stands(step), 'in a step: ' + JSON.stringify(step),
      alone ? '' : 'not judged: no plain list to compare with, and the preview does not stand above its marker (known deviation of the Playwright Firefox build)');
    return;
  }
  if (!step || !plain){
    check('a footnote cited inside a step, and one in a numbered list without the component in the same window, to compare it with', false, 'in a step: ' + !!step + ', in a plain list: ' + !!plain);
    return;
  }
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
  const tables = Array.from(root.querySelectorAll('table')).filter(t => !t.closest('.dokufix-diagram'));
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
    await frames(page);
    const narrow = await tableFacts(page);
    await tag.evaluate(el => el.remove());
    await page.setViewportSize({ width: 1400, height: 1000 });
    await frames(page);
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
  // In an editor file a free-text filter on the same table puts its field
  // between the controls and the wrapper; a read-only export has none.
  const children = g => 'fieldset.dokufix-facet-bar ' + (FIELDED.has(key) && exp.facets[g].filtered ? 'div.dokufix-filter ' : '') + 'div.dokufix-table';
  const built = groups.filter((x, g) => !(x.children === children(g) && x.elements === 'div input label legend span' && x.inline === 0 &&
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
  await frames(page);
  const narrowFacets = (await tableFacts(page)).facets;
  await page.setViewportSize({ width: 1400, height: 1000 });
  await frames(page);
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

// ---------- the free-text filter: a field where a script runs ----------
// What a page shows of its free-text filters: per field its markup, its place
// above the wrapper of its table, its look and the rows of its table.
const filterFacts = page => page.evaluate(() => {
  const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
  const holds = el => { const cs = getComputedStyle(el); return [cs.position, cs.transform, cs.filter, cs.perspective, cs.contain, cs.containerType, cs.willChange, cs.backdropFilter || 'none'].join(' '); };
  const fields = Array.from(root.querySelectorAll('.dokufix-filter'));
  return {
    marks: root.querySelectorAll('[data-dokufix-filter]').length,
    out: root.querySelectorAll('.dokufix-filter-out').length,
    fields: fields.map(field => {
      const input = field.querySelector(':scope > input'), count = field.querySelector(':scope > .dokufix-filter-count');
      const wrapper = field.nextElementSibling;
      const table = wrapper && (wrapper.tagName === 'TABLE' ? wrapper : wrapper.querySelector('table'));
      const cs = getComputedStyle(field), fr = field.getBoundingClientRect(), wr = wrapper ? wrapper.getBoundingClientRect() : null;
      const cc = count ? getComputedStyle(count) : null;
      return {
        children: Array.from(field.children).map(c => c.tagName.toLowerCase()).join(' '),
        transient: field.hasAttribute('data-dokufix-transient'),
        before: wrapper ? wrapper.tagName.toLowerCase() + '.' + wrapper.className : '',
        inGroup: field.parentElement.classList.contains('dokufix-facets'),
        marked: !!table && table.hasAttribute('data-dokufix-filter') && wrapper.classList.contains('dokufix-table'),
        placeholder: input ? input.getAttribute('placeholder') : null, label: input ? input.getAttribute('aria-label') : null,
        type: input ? input.type : '', autocomplete: input ? input.getAttribute('autocomplete') : null, value: input ? input.value : null,
        role: count ? count.getAttribute('role') : null, count: count ? count.textContent : null,
        display: cs.display, visible: field.checkVisibility({ visibilityProperty: true }) && fr.width > 0 && fr.height > 0,
        holds: [field, input, count].filter(Boolean).map(holds),
        width: input ? Math.round(input.getBoundingClientRect().width * 10) / 10 : 0,
        // Above the wrapper and outside it, at its left edge.
        above: !!wr && fr.bottom <= wr.top + 0.5 && Math.abs(fr.left - wr.left) < 1,
        countLook: cc ? cc.fontSize + ' ' + cc.color : '',
        rows: table ? Array.from(table.tBodies).flatMap(b => Array.from(b.rows)).map(tr => getComputedStyle(tr).display !== 'none') : null,
      };
    }),
  };
});
// The state of the field at this place: its value, its counter, the rows of
// its table shown, and whether the field is.
const filterState = (page, g) => page.evaluate(g => {
  const field = document.querySelectorAll(':is(#preview, main.reader-body) .dokufix-filter')[g];
  // Its table: in the wrapper after it, or, where it does not stand where it should, the next table.
  const next = field.nextElementSibling;
  const table = next && (next.tagName === 'TABLE' ? next : next.querySelector('table'));
  return {
    value: field.querySelector('input').value, count: field.querySelector('.dokufix-filter-count').textContent, display: getComputedStyle(field).display,
    shown: table ? Array.from(table.tBodies).flatMap(b => Array.from(b.rows)).map(tr => getComputedStyle(tr).display !== 'none') : null,
  };
}, g);
const STATIC = 'static none none none none normal auto none';
// The variants that run the free-text filter: the editor file, and the two
// read-only exports that carry a script (Ben, 2026-10-03). nur-lesen has none.
const FIELDED = new Set(['mit-editor', 'schlank', 'kompakt']);
async function assertFilters(page, check, exp, key){
  const f = await filterFacts(page);
  const json = JSON.stringify;
  if (!FIELDED.has(key)){
    check('free-text filter: no field, no mark of a filter table and no hidden row (' + exp.filters.length + ' filter(s) in the document)',
      f.fields.length === 0 && f.marks === 0 && f.out === 0, json({ fields: f.fields.length, marks: f.marks, out: f.out }));
    return;
  }
  const count = list => list.filter(Boolean).length;
  check('free-text filters: one field per marker "filter" that can act, in the order of the document, with its placeholder and the name "' + FILTER_LABEL + '", empty, a search field, transient',
    f.fields.length === exp.filters.length && f.fields.every((x, g) => x.children === 'input span' && x.placeholder === exp.filters[g].placeholder && x.label === FILTER_LABEL &&
      x.type === 'search' && x.autocomplete === 'off' && x.value === '' && x.transient),
    json(f.fields.map(x => [x.children, x.placeholder, x.label, x.type, x.autocomplete, x.value, x.transient])) + ', expected ' + json(exp.filters.map(x => x.placeholder)));
  if (!exp.filters.length || f.fields.length !== exp.filters.length) return;
  check('every field stands directly above the wrapper of its table, outside it, at its left edge; beside a facet filter between its controls and the wrapper',
    f.fields.every((x, g) => x.before === 'div.dokufix-table' && x.marked && x.above && x.inGroup === (exp.filters[g].facet >= 0)),
    json(f.fields.map(x => [x.before, x.marked, x.above, x.inGroup])));
  check('as the file opens: all rows shown, and the counter, a status, says how many',
    f.fields.every((x, g) => x.role === 'status' && x.rows && x.rows.length === exp.filters[g].rows.length && x.rows.every(Boolean) && x.count === filterCountText(x.rows.length, x.rows.length)),
    json(f.fields.map(x => [x.role, x.count, x.rows])));
  check('the field is shown and styled: at most 320 px wide, the counter small and grey; nothing of it is positioned',
    f.fields.every(x => x.display === 'flex' && x.visible && x.width > 100 && x.width <= 320.5 && x.countLook === '12px rgb(110, 110, 115)' && x.holds.every(h => h === STATIC)),
    json(f.fields.map(x => [x.display, x.visible, x.width, x.countLook, x.holds])));

  // --- typing, as a reader does
  const input = g => page.locator(':is(#preview, main.reader-body) .dokufix-filter-input').nth(g);
  const fill = (g, term) => input(g).fill(term, { timeout: 5000 }).catch(() => {});
  const wrong = [], hiddenWrong = [];
  for (const [g, filter] of exp.filters.entries()){
    if (!filter.term) continue;
    const want = filterCountText(count(filter.shown), filter.rows.length);
    for (const term of [filter.term, '  ' + filter.term.toUpperCase() + '  ', filter.term.toLowerCase()]){
      await fill(g, term);
      const st = await filterState(page, g);
      if (!(sameList(st.shown, filter.shown) && st.count === want)) wrong.push(filter.placeholder + ', ' + json(term) + ': ' + json(st) + ', expected ' + json(filter.shown) + ' and ' + want);
    }
    for (const hidden of filter.hidden){
      await fill(g, hidden.word);
      const st = await filterState(page, g);
      if (!(sameList(st.shown, hidden.shown) && st.count === filterCountText(count(hidden.shown), filter.rows.length))) hiddenWrong.push(filter.placeholder + ', ' + json(hidden.word) + ': ' + json(st) + ', expected ' + json(hidden.shown));
    }
    await fill(g, '');
    const back = await filterState(page, g);
    if (!(back.shown.every(Boolean) && back.count === filterCountText(filter.rows.length, filter.rows.length))) wrong.push(filter.placeholder + ', emptied: ' + json(back));
  }
  check('typing into each field shows only the rows that contain the term, in any case and with blanks around it, and the counter says how many; an empty field shows all (' +
    exp.filters.filter(x => x.term).map(x => '"' + x.term + '"').join(', ') + ')', wrong.length === 0, wrong.join(' | '));
  const hidden = exp.filters.flatMap(x => x.hidden.map(h => h.word));
  if (hidden.length) check('a word a reader does not see as text of the table finds nothing there: the word a chip carries for assistive technology, the preview of a footnote cited in a cell (' + hidden.join(', ') + ')',
    hiddenWrong.length === 0, hiddenWrong.join(' | '));

  // --- beside a facet filter: both hold
  for (const [g, filter] of exp.filters.entries()){
    if (!filter.combined) continue;
    const facet = exp.facets[filter.facet], k = filter.combined.control;
    const group = exp.facets.indexOf(facet);
    const choose = c => page.evaluate(([group, c]) => {
      document.querySelectorAll(':is(#preview, main.reader-body) .dokufix-facets')[group].querySelectorAll(':scope > .dokufix-facet-bar > .dokufix-facet-controls > label')[c].click();
    }, [group, c]);
    await choose(k);
    await fill(g, filter.combined.term);
    const st = await filterState(page, g);
    await choose(0);
    await fill(g, '');
    const back = await filterState(page, g);
    check('beside a facet filter: with a value chosen and a term typed only the rows with both are shown, and the counter counts them out of all rows ("' + facet.controls[k][0] + '", "' + filter.combined.term + '")',
      sameList(st.shown, filter.combined.shown) && st.count === filterCountText(count(filter.combined.shown), filter.rows.length) && back.shown.every(Boolean),
      json(st) + ', expected ' + json(filter.combined.shown) + '; back ' + json(back));
  }

  // --- print: all rows and no field, whatever is typed
  const g = exp.filters.findIndex(x => x.term);
  if (g >= 0){
    await fill(g, exp.filters[g].term);
    const screen = await filterState(page, g);
    await page.emulateMedia({ media: 'print' });
    const print = await filterState(page, g);
    await page.emulateMedia({ media: null });
    await fill(g, '');
    check('in print, with a term typed: all rows are shown and the field is not printed',
      count(screen.shown) < screen.shown.length && print.shown.every(Boolean) && print.display === 'none', 'on screen ' + json(screen) + ', in print ' + json(print));

    // --- Escape: in a field with text it empties the field, and read mode stays;
    // in an empty field it leaves read mode, as everywhere.
    if (key === 'mit-editor'){
      await fill(g, exp.filters[g].term);
      await input(g).press('Escape');
      const once = { ...(await filterState(page, g)), read: await page.evaluate(() => document.body.classList.contains('mode-view')) };
      await input(g).press('Escape');
      const twice = await page.evaluate(() => document.body.classList.contains('mode-view'));
      check('Escape in a field with text empties it and shows all rows, and read mode stays; Escape in the empty field leaves read mode',
        once.value === '' && once.shown.every(Boolean) && once.read && !twice, json(once) + ', read mode after the second: ' + twice);
      // Back to read mode, which renders the document again.
      await page.click('#view-btn');
      await page.waitForFunction(() => document.body.classList.contains('mode-view'));
      await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement) document.activeElement.blur(); });
      await frames(page);
    } else {
      // A read-only export has no read mode: Escape empties the field.
      await fill(g, exp.filters[g].term);
      await input(g).press('Escape');
      const once = await filterState(page, g);
      check('Escape in a field with text empties it and shows all rows', once.value === '' && once.shown.every(Boolean), json(once));
      await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement) document.activeElement.blur(); });
      await frames(page);
    }
  }
}

// The search of the reading view (epic 5, stories 1 to 7), in the editor file
// and in `schlank` and `kompakt`: "/" opens the panel, typed terms list one
// result per place of the content that holds them, grouped under the headings
// H2 to H4 with the numbers of each branch, the group headings stay at the
// top while the list scrolls, a click scrolls to its place, the panel stays
// open; the close button closes it and forgets the term, and in the editor
// file so does leaving read mode; a "/" in a field is typed. While it is open
// every hit is highlighted in the document (story 5), through the CSS Custom
// Highlight API: the run reads the ranges of CSS.highlights, their count and
// what each covers, and that the content's DOM is the same with the panel
// open; without the API the results are listed all the same. Which places
// there are, how many hits each holds, under which group headings they stand
// and what the ranges of their hits cover the run asks collectPlaces(),
// findHits(), groupResults() and nodeRanges() of the product, over the content
// container as the page shows it (the preview, or main.reader-body in an
// export), read back into linkedom; that the two read the same elements is
// checked first. Since story 7 a diagram is a place, its figure: its result
// says "BPMN-Diagramm: " or "Mermaid-Diagramm: ", a click brings the start of
// the figure into the window, and none of its hits is highlighted. Since
// story 8 the metadata panel and every code block are places: their results
// say "Metadaten: " and "Code: ", a click opens the closed panel and brings
// the first hit to the middle of the window, and the hits are highlighted,
// in dark text on the yellow.
const SEARCH_TERM = 'Tabelle';
// A term that occurs often in both documents: its list is longer than the
// panel. In the reference document it stands in a BPMN diagram as well.
const LONG_TERM = 'die';
// The kinds of a diagram's place (src/app/search-places.js), by the class of
// its figure: the labels of the languages (src/app/diagram-kinds.js).
const SEARCH_KINDS = Object.fromEntries(Object.entries(DIAGRAM_LANGUAGES).map(([lang, { label }]) => ['dokufix-diagram-' + lang, label]));
const isDiagramKind = kind => Object.values(SEARCH_KINDS).includes(kind);
// The height of a group heading in the panel (src/search.css).
const GROUP_ROW = 28;
// The name of the highlight of the hits (src/app/search.js, src/search.css).
const HIGHLIGHT = 'search-hit';
async function assertSearch(page, check, key){
  const json = JSON.stringify;
  const editor = key === 'mit-editor';
  const ROOT_SEL = editor ? '#preview' : 'main.reader-body';
  await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement) document.activeElement.blur(); });
  await frames(page);
  // Since story 6 every table row is a place as well, since story 7 every diagram's figure,
  // since story 8 every code block and the metadata panel.
  const PLACE_SEL = 'p, li, h1, h2, h3, h4, h5, h6, tr, figure.dokufix-diagram, pre, details.dokufix-frontmatter';
  const panelFacts = () => page.evaluate(rootSel => {
    const p = document.querySelector('body > .search-panel');
    const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
    const input = p && p.querySelector('input');
    return {
      exists: !!p, transient: !!p && p.hasAttribute('data-dokufix-transient'), inPreview: !!document.querySelector(rootSel + ' .search-panel'),
      shown: !!p && !p.hidden && getComputedStyle(p).display !== 'none', focused: !!input && document.activeElement === input,
      value: input ? input.value : null, summary: p ? p.querySelector('[role="status"]').textContent : null,
      results: p ? Array.from(p.querySelectorAll('.search-results .search-result')).map(b => ({ text: b.textContent, marks: Array.from(b.querySelectorAll('mark')).map(m => m.textContent),
        kind: (b.querySelector('.search-kind') || {}).textContent || null, hidden: !!b.querySelector('.search-hidden') })) : [],
      groups: p ? Array.from(p.querySelectorAll('.search-results .search-group')).map(li => {
        let depth = 0;
        for (let a = li.parentElement.closest('.search-group'); a; a = a.parentElement.closest('.search-group')) depth++;
        const head = li.querySelector(':scope > .search-group-head');
        return { level: Number((li.className.match(/\bsearch-group-h(\d)\b/) || [])[1]), depth,
          label: head ? head.querySelector('.search-group-title').textContent : null, count: head ? head.querySelector('.search-group-count').textContent : null,
          own: li.querySelectorAll(':scope > .search-group-list > li > .search-result').length, button: !!li.querySelector(':scope > .search-group-head button') };
      }) : [],
      label: p ? (p.querySelector('label') || {}).textContent : null,
      panel: box(p), button: box(document.getElementById('edit-btn')), rail: box(document.querySelector('aside.dokufix-rail.has-items')),
      onTop: (() => { if (!p || p.hidden) return false; const r = p.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && p.contains(t); })(),
      window: { width: innerWidth, height: innerHeight },
    };
  }, ROOT_SEL);
  const press = async k => { await page.keyboard.press(k); await frames(page); };
  // The highlight of the hits: whether the browser has the API, and each range
  // with the text it covers, as a Range over it reads, and whether it lies in
  // the content.
  const highlightFacts = () => page.evaluate(([rootSel, name]) => {
    if (!(window.CSS && CSS.highlights)) return { api: false, ranges: [] };
    const root = document.querySelector(rootSel);
    const h = CSS.highlights.get(name);
    return { api: true, ranges: h ? Array.from(h).map(s => {
      const r = document.createRange();
      r.setStart(s.startContainer, s.startOffset);
      r.setEnd(s.endContainer, s.endOffset);
      const inSvg = n => !!(n.nodeType === 1 ? n : n.parentElement).closest('svg');
      return { text: r.toString(), inRoot: root.contains(s.startContainer) && root.contains(s.endContainer), inSvg: inSvg(s.startContainer) || inSvg(s.endContainer) };
    }) : [] };
  }, [ROOT_SEL, HIGHLIGHT]);
  const rootHtml = () => page.evaluate(sel => document.querySelector(sel).outerHTML, ROOT_SEL);
  const untouched = await rootHtml();
  // Types a term into the panel's field and waits until the search has run:
  // the run puts a text of its own into the summary first, which every search
  // replaces.
  const PENDING = 'vergleich: search pending';
  const search = async term => {
    await page.evaluate(t => { document.querySelector('body > .search-panel [role="status"]').textContent = t; }, PENDING);
    await page.fill('body > .search-panel input', term);
    await page.waitForFunction(t => document.querySelector('body > .search-panel [role="status"]').textContent !== t, PENDING, { timeout: 5000 }).catch(() => {});
    return panelFacts();
  };

  // --- "/" opens the panel, in <body>, outside the preview, transient, the focus in its field
  await press('/');
  const opened = await panelFacts();
  check('search: "/"' + (editor ? ' in read mode' : '') + ' opens the panel, in <body> outside the ' + (editor ? 'preview' : 'content') + ', transient, empty, with the focus in its field',
    opened.exists && opened.transient && !opened.inPreview && opened.shown && opened.focused && opened.value === '' && opened.summary === '' && opened.results.length === 0 && opened.label === 'Im Dokument suchen',
    json({ ...opened, panel: undefined, button: undefined, rail: undefined }));
  if (!opened.shown) return;
  // --- where it stands: on the right below "Editor ↩", never over it, at most 380 px wide, as high as the window less margins;
  // in an export where it stands in the editor, 64 px from the top, the gap above it empty
  const below = f => editor ? !!f.button && f.panel.top >= f.button.bottom && !overlap(f.panel, f.button) : !f.button && Math.abs(f.panel.top - 64) < 1;
  const placed = f => !!f.panel && below(f) && f.panel.right <= f.window.width - 8 && f.panel.right >= f.window.width - 40 &&
    f.panel.right - f.panel.left <= 380.5 && f.panel.bottom <= f.window.height && f.panel.bottom - f.panel.top >= f.window.height - 120;
  const where = editor ? 'below "Editor ↩", not over it' : '64 px from the top, as in the editor';
  check('search: the panel stands on the right ' + where + ', at most 380 px wide and about as high as the window (1400 px)', placed(opened), round(opened.panel) + ', button ' + round(opened.button));
  // --- story 5.16, M3: the field stands in its label, which names it without
  // an id; with a heading "Search Input" in the document, whose anchor is the
  // id the field once had, a click on the label's text still focuses it
  await page.evaluate(rootSel => {
    const h = document.createElement('h2');
    h.id = 'search-input';
    h.textContent = 'Search Input';
    document.querySelector(rootSel).prepend(h);
    document.activeElement.blur();
  }, ROOT_SEL);
  // The label's text; a panel without it (before story 5.16) is clicked on its label.
  await page.click('body > .search-panel .search-label-text', { timeout: 2000 })
    .catch(() => page.click('body > .search-panel label', { timeout: 2000 }).catch(() => {}));
  const labelled = await page.evaluate(() => {
    const p = document.querySelector('body > .search-panel');
    const input = p.querySelector('input');
    const label = p.querySelector('label');
    const facts = { focused: document.activeElement === input, control: !!label && label.control === input, ids: Array.from(p.querySelectorAll('[id]')).map(el => el.id),
      byId: (document.getElementById('search-input') || {}).tagName || null };
    document.getElementById('search-input').remove();
    return facts;
  });
  check('search: the field stands in its label, no element of the panel has an id; beside a heading "Search Input" a click on the label focuses the field',
    labelled.focused && labelled.control && labelled.ids.length === 0 && labelled.byId === 'H2', json(labelled));

  // --- the term: one result per place that holds it, the summary in numbers that match
  const html = await rootHtml();
  const { document: doc } = parseHTML('<!DOCTYPE html><html><body>' + html + '</body></html>');
  const root = doc.querySelector(ROOT_SEL);
  const browserTags = await page.evaluate(([rootSel, sel]) => Array.from(document.querySelectorAll(rootSel + ' :is(' + sel + ')')).map(el => el.tagName), [ROOT_SEL, PLACE_SEL]);
  const nodeTags = Array.from(root.querySelectorAll(PLACE_SEL)).map(el => el.tagName.toUpperCase());
  check('search: the ' + (editor ? 'preview' : 'content') + ' read back in Node has the paragraphs, items and headings the page has', sameList(browserTags, nodeTags), browserTags.length + ' in the page, ' + nodeTags.length + ' in Node');
  const all = Array.from(root.querySelectorAll(PLACE_SEL));
  const expected = term => collectPlaces(root).map(p => ({ el: p.el, text: p.text, kind: p.kind, hits: findHits(term, p.text).length, at: all.indexOf(p.el) })).filter(p => p.hits);
  // The groups the product makes of these places, flat in the order of the
  // list, each with its depth, label, numbers and own results; the summary.
  const countOf = (hits, places) => hits + ' Treffer an ' + places + (places === 1 ? ' Stelle' : ' Stellen');
  const flatGroups = (groups, depth = 0) => groups.flatMap(g => [{ level: g.level, depth, label: g.label, count: countOf(g.hits, g.places), own: g.results.length, button: false }, ...flatGroups(g.children, depth + 1)]);
  const groupsOf = places => groupResults(root, places);
  const summaryOf = places => {
    const n = places.reduce((k, p) => k + p.hits, 0);
    if (!n) return 'Keine Treffer';
    const k = groupsOf(places).sections;
    return countOf(n, places.length) + ' in ' + k + (k === 1 ? ' Abschnitt' : ' Abschnitten');
  };
  // What the ranges of every hit of a term cover, in the order of the
  // document: the text of the text nodes between their ends.
  const textNodes = (node, out = []) => { for (let c = node.firstChild; c; c = c.nextSibling){ if (c.nodeType === 3) out.push(c); else textNodes(c, out); } return out; };
  const allText = textNodes(root);
  const coveredBy = r => {
    const from = allText.indexOf(r.startNode), to = allText.indexOf(r.endNode);
    if (from === to) return r.startNode.data.slice(r.startOffset, r.endOffset);
    return r.startNode.data.slice(r.startOffset) + allText.slice(from + 1, to).map(n => n.data).join('') + r.endNode.data.slice(0, r.endOffset);
  };
  const rangeTexts = (term, options = {}) => collectPlaces(root).flatMap(p => findHits(term, p.text, options).flatMap(hit => nodeRanges(p.map, hit).map(coveredBy)));
  const hitCount = places => places.reduce((n, p) => n + p.hits, 0);
  // The highlight of a term as the product makes it over the content read
  // back: one range per hit where nothing left out lies inside a hit, none in
  // a diagram.
  const litHits = places => hitCount(places.filter(p => !isDiagramKind(p.kind)));
  const litAs = (facts, term, options, places, alike) => {
    const want = rangeTexts(term, options);
    return facts.api && facts.ranges.length === litHits(places) && sameList(facts.ranges.map(r => r.text), want) &&
      facts.ranges.every(r => r.inRoot && !r.inSvg && alike(r.text));
  };
  const litLine = (facts, term, options, places) => json({ api: facts.api, ranges: facts.ranges.length, hits: litHits(places), texts: facts.ranges.slice(0, 6).map(r => r.text), expected: rangeTexts(term, options).slice(0, 6), outside: facts.ranges.filter(r => !r.inRoot).length, inSvg: facts.ranges.filter(r => r.inSvg).length });
  const want = expected(SEARCH_TERM);
  const wantSummary = summaryOf(want);
  const typed = await search(SEARCH_TERM);
  const lit = await highlightFacts();
  const searched = await rootHtml();
  // A result's text without its kind before it ("Tabelle: ", story 6), a
  // hidden row's mark after it, and the "…" of a cut.
  const KIND_SEP = ': ', HIDDEN_NOTE = ' (ausgeblendet)';
  const bodyOf = r => {
    let t = r.text;
    if (r.kind && t.startsWith(r.kind)) t = t.slice(r.kind.length);
    if (r.hidden && t.endsWith(HIDDEN_NOTE)) t = t.slice(0, -HIDDEN_NOTE.length);
    return t.replace(/^… /, '').replace(/ …$/, '');
  };
  const kindAs = (r, p) => r.kind === (p.kind ? p.kind + KIND_SEP : null) && r.text.startsWith(r.kind || '');
  const mismatched = typed.results.map((r, i) => (want[i] && kindAs(r, want[i]) && want[i].text.includes(bodyOf(r)) && r.marks.length >= 1 && r.marks.length <= want[i].hits && r.marks.every(m => m.toLowerCase() === SEARCH_TERM.toLowerCase())) ? null : i + ': ' + json(r)).filter(Boolean);
  check('search: "' + SEARCH_TERM + '" lists one result per place of the ' + (editor ? 'preview' : 'content') + ' that holds it, in order, each a part of its text with the term marked, a table row\'s after "Tabelle: "; the summary says "' + wantSummary + '"',
    want.length > 1 && typed.results.length === want.length && typed.summary === wantSummary && mismatched.length === 0,
    'summary ' + json(typed.summary) + ', ' + typed.results.length + ' results, expected ' + want.length + '; ' + mismatched.slice(0, 3).join(' | '));
  // --- story 4: the results under their headings, each with the numbers of its branch
  const wantGroups = flatGroups(groupsOf(want).groups);
  const groupLine = g => '  '.repeat(g.depth) + 'H' + g.level + ' ' + g.label + ' (' + g.count + (g.own ? ', ' + g.own + ' eigene' : '') + ')';
  check('search: the results of "' + SEARCH_TERM + '" stand under the group headings H2 to H4 that hold them or a group below them, nested as the headings are, each with the hits and places of its branch, as text and not as buttons',
    wantGroups.length > 0 && sameList(typed.groups.map(json), wantGroups.map(json)),
    typed.groups.map(groupLine).join(' | ') + (sameList(typed.groups.map(json), wantGroups.map(json)) ? '' : ' — expected ' + wantGroups.map(groupLine).join(' | ')));
  check('search: "' + SEARCH_TERM + '" occurs in two sections of different depth: a top group with results of its own, and one below a parent',
    typed.groups.some(g => g.depth === 0 && g.own) && typed.groups.some(g => g.depth > 0 && g.own),
    typed.groups.map(groupLine).join(' | '));
  // --- story 5: every hit highlighted in the document, the document's DOM unchanged
  check('search: every hit of "' + SEARCH_TERM + '" is highlighted in the ' + (editor ? 'preview' : 'content') + ', one range per hit over exactly the hit, ' + hitCount(want) + ' in all; the DOM of the ' + (editor ? 'preview' : 'content') + ' is the one it had before the panel opened',
    litAs(lit, SEARCH_TERM, {}, want, t => t.toLowerCase() === SEARCH_TERM.toLowerCase()) && searched === untouched && html === untouched,
    litLine(lit, SEARCH_TERM, {}, want) + ', DOM unchanged after opening ' + (html === untouched) + ', after the search ' + (searched === untouched));
  const lower = await search(SEARCH_TERM.toLowerCase());
  check('search: "' + SEARCH_TERM.toLowerCase() + '" finds the same as "' + SEARCH_TERM + '"', lower.summary === typed.summary && sameList(lower.results.map(r => r.text), typed.results.map(r => r.text)), json(lower.summary));
  const none = await search('xyzzy');
  const litNone = await highlightFacts();
  check('search: a term that does not occur says "Keine Treffer", lists nothing and highlights nothing: the highlight of the term before is gone', none.summary === 'Keine Treffer' && none.results.length === 0 && litNone.api && litNone.ranges.length === 0, json(none.summary) + ', ' + none.results.length + ', ' + litNone.ranges.length + ' ranges');
  const empty = await search('');
  const litEmpty = await highlightFacts();
  check('search: an emptied field says nothing, lists nothing and highlights nothing', empty.summary === '' && empty.results.length === 0 && litEmpty.ranges.length === 0, json(empty.summary) + ', ' + empty.results.length + ', ' + litEmpty.ranges.length + ' ranges');

  // --- the switches and the minimum length (story 2): a flipped switch searches again at once
  const SWITCH_SEL = 'body > .search-panel .search-switch input[type="checkbox"]';
  const TOO_SHORT = 'Zu kurz: mindestens drei Buchstaben oder Ziffern';
  const expectedWith = (term, options) => collectPlaces(root).map(p => ({ el: p.el, text: p.text, hits: findHits(term, p.text, options).length })).filter(p => p.hits);
  const flip = async n => {
    await page.evaluate(t => { document.querySelector('body > .search-panel [role="status"]').textContent = t; }, PENDING);
    await page.locator(SWITCH_SEL).nth(n).click();
    await page.waitForFunction(t => document.querySelector('body > .search-panel [role="status"]').textContent !== t, PENDING, { timeout: 5000 }).catch(() => {});
    return panelFacts();
  };
  const switchStates = () => page.locator(SWITCH_SEL).evaluateAll(els => els.map(el => el.checked));
  const startStates = await switchStates();
  check('search: two switches below the field, case-sensitive and light fuzzy, both off', sameList(startStates, [false, false]), json(startStates));
  const plainChip = await search('statuschip');
  const fuzzyChip = await flip(1);
  const litChip = await highlightFacts();
  const wantChip = expectedWith('statuschip', { fuzzy: true });
  const wantPlainChip = expectedWith('statuschip', {});
  const fuzzyStrip = t => t.replace(/[\s\-\u2010\u2011\u00AD.]/gu, '').toLowerCase();
  check('search: "statuschip" finds only itself so written; light fuzzy flipped on lists, without typing again, every place with "Status-Chip" as well, all eleven characters marked',
    plainChip.summary === summaryOf(wantPlainChip) && wantChip.length > wantPlainChip.length && fuzzyChip.summary === summaryOf(wantChip) && fuzzyChip.results.length === wantChip.length &&
      fuzzyChip.results.some(r => r.marks.includes('Status-Chip')) && fuzzyChip.results.every(r => r.marks.length >= 1 && r.marks.every(m => fuzzyStrip(m) === 'statuschip')),
    json({ plain: plainChip.summary, fuzzy: fuzzyChip.summary, expected: summaryOf(wantChip), marks: fuzzyChip.results.map(r => r.marks) }));
  check('search: light fuzzy flipped on, the highlight follows: every hit of "statuschip" highlighted, "Status-Chip" over its text nodes as one range',
    litAs(litChip, 'statuschip', { fuzzy: true }, wantChip, t => fuzzyStrip(t) === 'statuschip') && litChip.ranges.some(r => r.text === 'Status-Chip'),
    litLine(litChip, 'statuschip', { fuzzy: true }, wantChip));
  await flip(1);
  // --- a blank at the edge of the term marks a word boundary (story 14): "Klick " lists the places where
  // "Klick" ends a word, not those where it only begins one, and marks the word alone, without the blank
  const bounded = await search('Klick ');
  const litBounded = await highlightFacts();
  const wantBounded = expectedWith('Klick ', {}), wantKlick = expectedWith('Klick', {});
  const longer = wantKlick.some(p => /klick\p{L}/iu.test(p.text) && !findHits('Klick ', p.text).length);
  check('search: "Klick " with a blank at its end lists the places where "Klick" ends a word' + (longer ? ', fewer than "Klick"' : '') + '; every mark is the word alone',
    bounded.summary === summaryOf(wantBounded) && bounded.results.length === wantBounded.length && (!longer || wantBounded.length < wantKlick.length) &&
      (!litBounded.api || litBounded.ranges.every(r => r.text.toLowerCase() === 'klick')),
    json({ summary: bounded.summary, expected: summaryOf(wantBounded), klick: summaryOf(wantKlick), marks: litBounded.ranges.map(r => r.text) }));
  const leading = await search(' Klick');
  const wantLeading = expectedWith(' Klick', {});
  check('search: " Klick" with a blank at its start lists as many places as Node expects, every mark the word alone',
    leading.summary === summaryOf(wantLeading) && leading.results.length === wantLeading.length && leading.results.every(r => r.marks.every(m => m.toLowerCase() === 'klick')),
    json({ summary: leading.summary, expected: summaryOf(wantLeading), marks: leading.results.map(r => r.marks) }));
  await search('Klick ');
  const fuzzyBounded = await flip(1);
  const wantFuzzyBounded = expectedWith('Klick ', { fuzzy: true });
  check('search: light fuzzy flipped on, "Klick " lists as many places as "Klick" does under it: the blank marks no boundary',
    fuzzyBounded.summary === summaryOf(wantFuzzyBounded) && summaryOf(wantFuzzyBounded) === summaryOf(expectedWith('Klick', { fuzzy: true })), json({ summary: fuzzyBounded.summary, expected: summaryOf(wantFuzzyBounded) }));
  await flip(1);
  const short = await search('Ta');
  const litShort = await highlightFacts();
  check('search: "Ta" lists nothing, highlights nothing and the summary says it is too short', short.summary === TOO_SHORT && short.results.length === 0 && litShort.ranges.length === 0, json(short.summary) + ', ' + short.results.length + ', ' + litShort.ranges.length + ' ranges');
  const oe = await search('oe');
  const wantOe = expectedWith('oe', {});
  check('search: "oe" is searched although it has two letters' + (opts.demo ? ', and lists the one place of the demo text that holds it' : ''),
    oe.summary === summaryOf(wantOe) && oe.results.length === wantOe.length && (!opts.demo || (wantOe.length === 1 && oe.results[0].text.includes('Goethe'))),
    json(oe.summary) + ', ' + json(oe.results.map(r => r.text)));
  await search('tabelle');
  const caseOn = await flip(0);
  const litCaseOn = await highlightFacts();
  const caseTyped = await search(SEARCH_TERM);
  const litCase = await highlightFacts();
  const wantCase = expectedWith(SEARCH_TERM, { caseSensitive: true });
  check('search: case-sensitive flipped on, the highlight follows: none for "tabelle", every hit of "' + SEARCH_TERM + '" so written for "' + SEARCH_TERM + '"',
    litCaseOn.ranges.length === 0 && litAs(litCase, SEARCH_TERM, { caseSensitive: true }, wantCase, t => t === SEARCH_TERM),
    litCaseOn.ranges.length + ' ranges for "tabelle"; ' + litLine(litCase, SEARCH_TERM, { caseSensitive: true }, wantCase));
  check('search: case-sensitive flipped on, "tabelle" finds nothing; "' + SEARCH_TERM + '" lists the places that hold it so written',
    expectedWith('tabelle', { caseSensitive: true }).length === 0 && caseOn.summary === 'Keine Treffer' && caseOn.results.length === 0 &&
      caseTyped.summary === summaryOf(wantCase) && caseTyped.results.length === wantCase.length && caseTyped.results.every(r => r.marks.every(m => m === SEARCH_TERM)),
    json({ lower: caseOn.summary, typed: caseTyped.summary, expected: summaryOf(wantCase) }));
  await flip(0);
  const endStates = await switchStates();
  check('search: both switches are off again', sameList(endStates, [false, false]), json(endStates));

  // --- story 4: a long list scrolled; the heading of the group at the top and
  // the headings of its parents stay at the top of the list, stacked
  const long = await search(LONG_TERM);
  const wantLong = expectedWith(LONG_TERM, {});
  const stuck = await page.evaluate(async row => {
    const list = document.querySelector('body > .search-panel .search-results');
    const chainOf = el => { const chain = []; for (let li = el.closest('.search-group'); li; li = li.parentElement.closest('.search-group')) chain.unshift(li); return chain; };
    const portTop = () => list.getBoundingClientRect().top + list.clientTop;
    const max = list.scrollHeight - list.clientHeight;
    list.scrollTop = 0;
    const offset = el => el.getBoundingClientRect().top - portTop() + list.scrollTop;
    // A result, in the deepest group there is, that the list can be scrolled
    // to so that it stands right under the stack of its group headings while
    // the top of its group, and the heading's own place, are out of view.
    const target = Array.from(list.querySelectorAll('.search-result')).map(button => {
      const chain = chainOf(button);
      return { button, chain, at: offset(button) - chain.length * row - 4, inGroup: offset(button) - offset(chain[chain.length - 1]) };
    }).filter(t => t.chain.length >= 1 && t.inGroup > t.chain.length * row + 4 && t.at <= max && t.at > 0)
      .sort((a, b) => b.chain.length - a.chain.length)[0];
    const facts = { long: list.scrollHeight > list.clientHeight * 1.5, height: list.clientHeight, scrollHeight: list.scrollHeight };
    if (!target) return { ...facts, target: null };
    list.scrollTop = target.at;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const top = portTop();
    const heads = target.chain.map(li => { const h = li.querySelector(':scope > .search-group-head'); const r = h.getBoundingClientRect(); return { label: h.querySelector('.search-group-title').textContent, top: r.top - top, bottom: r.bottom - top }; });
    const b = target.button.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    const result = { ...facts, target: heads[heads.length - 1].label, depth: target.chain.length - 1, scrolled: list.scrollTop,
      groupTop: target.chain[target.chain.length - 1].getBoundingClientRect().top - top, heads, resultTop: b.top - top,
      resultShown: !!hit && target.button.contains(hit) };
    // A hand-over: a group below a parent scrolled to its end, so that its
    // heading leaves through the band of its parent's heading while the
    // parent goes on below it. The parent's heading lies on top in its band.
    list.scrollTop = 0;
    const leaving = Array.from(list.querySelectorAll('.search-group')).map(li => {
      const chain = chainOf(li);
      const parent = chain[chain.length - 2];
      if (!parent) return null;
      const depth = chain.length - 1;
      const bottom = li.getBoundingClientRect().bottom - portTop() + list.scrollTop;
      const parentBottom = parent.getBoundingClientRect().bottom - portTop() + list.scrollTop;
      return { li, parent, depth, at: bottom - ((depth - 1) * row + 20), rest: parentBottom - bottom };
    }).filter(t => t && t.rest >= row + 20 && t.at > 0 && t.at <= max).sort((a, b) => b.depth - a.depth)[0];
    if (leaving){
      list.scrollTop = leaving.at;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const lt = portTop();
      const parentHead = leaving.parent.querySelector(':scope > .search-group-head');
      const childHead = leaving.li.querySelector(':scope > .search-group-head');
      const y = lt + (leaving.depth - 1) * row + 10;
      const atBand = document.elementFromPoint(list.getBoundingClientRect().left + 40, y);
      const ch = childHead.getBoundingClientRect();
      result.handover = { depth: leaving.depth, parent: parentHead.querySelector('.search-group-title').textContent, child: childHead.querySelector('.search-group-title').textContent,
        childTop: ch.top - lt, childBottom: ch.bottom - lt, parentTop: parentHead.getBoundingClientRect().top - lt,
        overlaps: ch.top < y && ch.bottom > y, parentOnTop: !!atBand && parentHead.contains(atBand) };
    } else result.handover = null;
    list.scrollTop = 0;
    return result;
  }, GROUP_ROW);
  const stacked = !!stuck.target && stuck.heads.every((h, i) => Math.abs(h.top - (i ? stuck.heads[i - 1].bottom : 0)) <= 1 && Math.abs(h.bottom - h.top - GROUP_ROW) <= 1);
  // Both documents have a group below a parent with results enough to scroll,
  // and one that ends while its parent goes on; the demo text since its
  // special cases of the large view and the search.
  const handedOver = !!stuck.handover && stuck.handover.overlaps && stuck.handover.parentOnTop && Math.abs(stuck.handover.parentTop - (stuck.handover.depth - 1) * GROUP_ROW) <= 1;
  check('search: "' + LONG_TERM + '" lists more than the panel shows; scrolled into a group below a parent, its heading and the headings of its parents stay at the top of the list, stacked by depth, the group\'s results under them; where a group below a parent ends and its heading leaves, the parent\'s heading lies over it in its band',
    long.summary === summaryOf(wantLong) && long.results.length === wantLong.length && stuck.long && stuck.depth >= 1 && stuck.groupTop < 0 && stacked && stuck.resultShown && stuck.resultTop >= stuck.heads[stuck.heads.length - 1].bottom - 1 && handedOver,
    json({ summary: long.summary, expected: summaryOf(wantLong), ...stuck }));

  // --- a click scrolls to the place, and the panel stays open
  await search(SEARCH_TERM);
  const target = want[want.length - 1];
  await page.locator('body > .search-panel .search-results .search-result').last().click();
  await frames(page);
  const landed = await page.evaluate(([rootSel, sel, at]) => {
    const el = document.querySelectorAll(rootSel + ' :is(' + sel + ')')[at];
    const r = el.getBoundingClientRect();
    const p = document.querySelector('body > .search-panel');
    return { top: r.top, bottom: r.bottom, height: innerHeight, scrolled: Math.round(scrollY), open: !p.hidden, results: p.querySelectorAll('.search-results .search-result').length };
  }, [ROOT_SEL, PLACE_SEL, target.at]);
  check('search: a click on the last result scrolls the document to its place, and the panel stays open with its results',
    landed.scrolled > 0 && landed.top >= 0 && landed.bottom <= landed.height && landed.open && landed.results === want.length, json(landed));

  // --- story 5.16, N3: Enter in the field follows the first result; Down goes
  // to it, Down and Up through the results, Up on the first back to the field
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.focus('body > .search-panel input');
  await frames(page);
  const scrolledDown = await page.evaluate(() => Math.round(scrollY));
  await press('Enter');
  const focusAt = () => page.evaluate(() => {
    const p = document.querySelector('body > .search-panel'), a = document.activeElement;
    return a === p.querySelector('input') ? 'field' : Array.from(p.querySelectorAll('.search-result')).indexOf(a);
  });
  const entered = await page.evaluate(([rootSel, sel, at]) => {
    const r = document.querySelectorAll(rootSel + ' :is(' + sel + ')')[at].getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: innerHeight, scrolled: Math.round(scrollY) };
  }, [ROOT_SEL, PLACE_SEL, want[0].at]);
  const enterFocus = await focusAt();
  const walk = [];
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp']){ await press(k); walk.push(await focusAt()); }
  check('search: Enter in the field brings the first result\'s place into the window and leaves the focus in the field; Down goes to the first result, Down to the second, Up back, Up on the first to the field',
    scrolledDown > 0 && entered.scrolled < scrolledDown && entered.top >= 0 && entered.bottom <= entered.height && enterFocus === 'field' && sameList(walk.map(String), ['0', '1', '0', 'field']),
    json({ scrolledDown, entered, enterFocus, walk }));

  // --- story 5.16, N1: raw HTML put into the document for the moment, text
  // directly in a div, a dt and a dd, the summary of a details, a bare
  // blockquote and a figcaption: each a place of its own, found; an image's
  // alt is not
  const N1_TERM = 'Schwalbenschwanz';
  await page.evaluate(([rootSel, t]) => {
    const box = document.createElement('div');
    box.id = 'vergleich-n1';
    box.innerHTML = '<div>' + t + ' im div</div><dl><dt>' + t + ' im dt</dt><dd>' + t + ' im dd</dd></dl><details><summary>' + t + ' im summary</summary><p>' + t + ' im Absatz</p></details>' +
      '<blockquote>' + t + ' im blockquote</blockquote><figure><img alt="' + t + ' im alt"><figcaption>' + t + ' in figcaption</figcaption></figure>';
    document.querySelector(rootSel).append(box);
  }, [ROOT_SEL, N1_TERM]);
  const raw = await search(N1_TERM);
  await page.evaluate(() => document.getElementById('vergleich-n1').remove());
  const wantRaw = ['im div', 'im dt', 'im dd', 'im summary', 'im Absatz', 'im blockquote', 'in figcaption'].map(w => N1_TERM + ' ' + w);
  check('search: raw HTML with "' + N1_TERM + '" directly in a div, a dt, a dd, a summary, a bare blockquote and a figcaption lists each as a result of its own, and the paragraph in the details; an image\'s alt is no result',
    sameList(raw.results.map(r => r.text), wantRaw) && raw.summary === '7 Treffer an 7 Stellen in 1 Abschnitt', json({ summary: raw.summary, results: raw.results.map(r => r.text) }));

  // --- story 5.16, N8: the first facet table put into a closed <details> for
  // the moment, a word put into its first row: the row is not marked
  // "(ausgeblendet)", and a click opens the <details> and brings the row into
  // the window. All of it is taken back afterwards.
  const N8_TERM = 'Vergleichsfalter';
  const wrapped = await page.evaluate(([rootSel, t]) => {
    const g = document.querySelector(rootSel + ' .dokufix-facets');
    if (!g) return false;
    const d = document.createElement('details');
    d.id = 'vergleich-n8';
    d.append(document.createElement('summary'));
    d.firstChild.textContent = 'Zu';
    g.before(d);
    d.append(g);
    const word = document.createElement('span');
    word.id = 'vergleich-n8-word';
    word.textContent = ' ' + t;
    g.querySelector('tbody tr td').append(word);
    window.scrollTo(0, 0);
    return true;
  }, [ROOT_SEL, N8_TERM]);
  if (wrapped){
    const inDetails = await search(N8_TERM);
    await page.locator('body > .search-panel .search-results .search-result').first().click().catch(() => {});
    await frames(page);
    const opened = await page.evaluate(() => {
      const d = document.getElementById('vergleich-n8'), r = d.querySelector('tbody tr').getBoundingClientRect();
      return { open: d.open, top: r.top, bottom: r.bottom, height: innerHeight };
    });
    await page.evaluate(() => {
      document.getElementById('vergleich-n8-word').remove();
      const d = document.getElementById('vergleich-n8');
      d.replaceWith(d.querySelector('.dokufix-facets'));
      window.scrollTo(0, 0);
    });
    check('search: a row of a facet table in a closed <details> is listed without "(ausgeblendet)"; a click opens the <details> and brings the row into the window',
      inDetails.results.length === 1 && !inDetails.results[0].hidden && inDetails.results[0].kind === 'Tabelle: ' && opened.open && opened.bottom > opened.top && opened.top >= 0 && opened.bottom <= opened.height,
      json({ results: inDetails.results, opened }));
  }

  // --- story 6: hits in tables. A term from a table row: its result reads
  // "Tabelle: " before the row's text, a click centres the row, and the
  // highlight lies in the row's cells, one range per cell a hit touches.
  await assertSearchTables();
  // --- story 7: hits in diagrams. A diagram is one place, its figure; its
  // result says its kind, a click brings the figure's top into the window,
  // nothing in it is highlighted; its source and its frame are no text.
  await assertSearchDiagrams();
  // --- story 8: hits in the metadata panel and in code blocks. Each is one
  // place with its kind; a click opens the closed panel and centres the first
  // hit, which is highlighted, readable on the dark code background.
  await assertSearchMetaCode();

  // --- from 1500 px it lies over the rail, and still not over "Editor ↩"
  await page.setViewportSize({ width: 1600, height: 1000 });
  await frames(page);
  const wide = await panelFacts();
  check('search: at 1600 px the panel lies over the rail and stands ' + where,
    placed(wide) && (!wide.rail || (overlap(wide.panel, wide.rail) && wide.onTop)), round(wide.panel) + ', rail ' + round(wide.rail) + ', on top ' + wide.onTop);
  await page.setViewportSize({ width: 1400, height: 1000 });
  await frames(page);

  // --- the close button closes it and takes the highlight away; "/" opens it again, empty
  const litBefore = await highlightFacts();
  await page.click('body > .search-panel .search-close');
  await frames(page);
  const closed = await panelFacts();
  const litClosed = await highlightFacts();
  await press('/');
  const again = await panelFacts();
  const litAgain = await highlightFacts();
  check('search: the close button closes the panel and no hit stays highlighted; "/" opens it again with the field, the summary and the list empty, nothing highlighted',
    !closed.shown && again.shown && again.focused && again.value === '' && again.summary === '' && again.results.length === 0 && litBefore.ranges.length > 0 && litClosed.ranges.length === 0 && litAgain.ranges.length === 0,
    json({ closed: closed.shown, ranges: [litBefore.ranges.length, litClosed.ranges.length, litAgain.ranges.length], again: { ...again, panel: undefined, button: undefined, rail: undefined } }));

  // --- Escape closes the panel and nothing else: read mode stays, with the
  // focus in the field and with the focus outside the panel; in the editor the
  // next Escape leaves read mode
  const readMode = () => page.evaluate(() => document.body.classList.contains('mode-view'));
  await search(SEARCH_TERM);
  await press('Escape');
  const escField = { shown: (await panelFacts()).shown, read: await readMode(), ranges: (await highlightFacts()).ranges.length };
  // Back to read mode, should the Escape have left it, so the run goes on.
  if (editor && !escField.read){
    await page.click('#view-btn');
    await page.waitForFunction(() => document.body.classList.contains('mode-view'));
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await frames(page);
  }
  await press('/');
  await search(SEARCH_TERM);
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await press('Escape');
  const escOutside = { shown: (await panelFacts()).shown, read: await readMode() };
  let escNext = null;
  if (editor){
    await press('Escape');
    escNext = { read: await readMode() };
    await page.click('#view-btn');
    await page.waitForFunction(() => document.body.classList.contains('mode-view'));
    await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement) document.activeElement.blur(); });
    await frames(page);
  }
  check('search: Escape closes the panel, with the focus in its field and outside it, no hit stays highlighted, and ' + (editor ? 'read mode stays; the next Escape leaves read mode' : 'nothing else'),
    !escField.shown && !escOutside.shown && escField.ranges === 0 && (!editor || (escField.read && escOutside.read && !escNext.read)), json({ escField, escOutside, escNext }));
  await press('/');

  // --- leaving read mode closes it; in edit mode "/" opens nothing. An export has no edit mode.
  if (editor){
    await search(SEARCH_TERM);
    const litRead = (await highlightFacts()).ranges.length;
    await page.click('#edit-btn');
    await frames(page);
    const left = await panelFacts();
    const litLeft = (await highlightFacts()).ranges.length;
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await press('/');
    const inEdit = await panelFacts();
    await page.click('#view-btn');
    await page.waitForFunction(() => document.body.classList.contains('mode-view'));
    await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement) document.activeElement.blur(); });
    await frames(page);
    await press('/');
    const back = await panelFacts();
    check('search: leaving read mode closes the panel and no hit stays highlighted, "/" in edit mode opens nothing, and back in read mode "/" opens it empty',
      !left.shown && litRead > 0 && litLeft === 0 && !inEdit.shown && back.shown && back.value === '' && back.results.length === 0, json({ left: left.shown, ranges: [litRead, litLeft], inEdit: inEdit.shown, back: back.shown, value: back.value, results: back.results.length }));
  }
  // --- without the Highlight API the results are listed all the same, and nothing fails
  const hidden = await page.evaluate(() => {
    if (!window.CSS) return false;
    window.vergleichHighlights = Object.getOwnPropertyDescriptor(CSS, 'highlights');
    Object.defineProperty(CSS, 'highlights', { value: undefined, configurable: true });
    return CSS.highlights === undefined;
  });
  const consoleErrors = [];
  const onConsole = m => { if (m.type() === 'error') consoleErrors.push(m.text()); };
  page.on('console', onConsole);
  const bare = await search(SEARCH_TERM);
  page.off('console', onConsole);
  await page.evaluate(() => {
    if (window.vergleichHighlights) Object.defineProperty(CSS, 'highlights', window.vergleichHighlights);
    else delete CSS.highlights;
    delete window.vergleichHighlights;
  });
  check('search: without CSS.highlights "' + SEARCH_TERM + '" lists its results as with it, and nothing fails',
    hidden && bare.summary === wantSummary && bare.results.length === want.length && consoleErrors.length === 0,
    json({ hidden, summary: bare.summary, results: bare.results.length, errors: consoleErrors }));
  await page.click('body > .search-panel .search-close');
  // --- story 10: the magnifier
  await assertMagnifier(page, check, key);

  // Story 7, inside assertSearch for its helpers. In the demo text the terms
  // its special cases name: "Abholbereit" in a BPMN diagram, "nachfordern" in
  // a Mermaid diagram, "Stempeln" only in the source of one. In another
  // document a word of a diagram of each kind, the fewest places first.
  async function assertSearchDiagrams(){
    const placesOf = collectPlaces(root);
    const index = new Map(all.map((el, n) => [el, n]));
    const expected = (term, options = {}) => placesOf.map(p => ({ el: p.el, text: p.text, kind: p.kind, hits: findHits(term, p.text, options).length, at: index.get(p.el) })).filter(p => p.hits);
    const figures = Array.from(root.querySelectorAll('figure.dokufix-diagram'));
    const kindOf = el => SEARCH_KINDS[Object.keys(SEARCH_KINDS).find(c => el.classList.contains(c))];
    const diagrams = placesOf.filter(p => isDiagramKind(p.kind));
    if (!figures.length){
      // As the tables: the term it leaves searched for the checks after this one.
      const none = await search(SEARCH_TERM);
      check('search: a document without a drawn diagram lists no result as a diagram', diagrams.length === 0 && none.results.every(r => !r.kind || !isDiagramKind(r.kind.slice(0, -2))),
        json(none.results.map(r => r.kind)));
      return;
    }
    check('search: every diagram drawn is one place, its figure, of the kind its class names',
      diagrams.length === figures.length && diagrams.every((p, i) => p.el === figures[i] && p.kind === kindOf(p.el)),
      json({ figures: figures.length, places: diagrams.map(p => [p.kind, p.text.slice(0, 40)]) }));
    const words = text => text.match(/\p{L}{6,}/gu) || [];
    // A word of a diagram of the kind, the fewest places first.
    const labelWord = kind => {
      let best = null;
      for (const p of diagrams.filter(d => d.kind === kind)){
        for (const w of words(p.text)){
          const at = expected(w);
          if (!best || at.length < best.at.length) best = { term: w, at };
        }
      }
      return best;
    };
    const picks = (opts.demo ? [{ term: 'Abholbereit', at: expected('Abholbereit') }, { term: 'nachfordern', at: expected('nachfordern') }]
      : Object.values(SEARCH_KINDS).map(labelWord)).filter(Boolean);
    for (const { term, at: wantAt } of picks){
      const listed = await search(term);
      const n = wantAt.findIndex(p => isDiagramKind(p.kind));
      const lit = await highlightFacts();
      const ok = n >= 0 && listed.results.length === wantAt.length && listed.summary === summaryOf(wantAt) &&
        listed.results.every((r, i) => kindAs(r, wantAt[i]) && wantAt[i].text.includes(bodyOf(r)) && r.marks.length >= 1 && r.marks.every(m => m.toLowerCase() === term.toLowerCase())) &&
        (!opts.demo || wantAt.filter(p => isDiagramKind(p.kind)).length === 1);
      check('search: "' + term + '", a label of a ' + (n >= 0 ? wantAt[n].kind : 'diagram') + ', lists the diagram once, "' + (n >= 0 ? wantAt[n].kind : '?') + ': " and the labels around the hit; none of its hits is highlighted, the hits elsewhere are',
        ok && litAs(lit, term, {}, wantAt, t => t.toLowerCase() === term.toLowerCase()),
        json({ summary: listed.summary, results: listed.results.map(r => r.text.slice(0, 80)), expected: wantAt.map(p => [p.kind, p.hits]), lit: litLine(lit, term, {}, wantAt) }));
      if (n < 0) continue;
      await page.evaluate(() => window.scrollTo(0, 0));
      await frames(page);
      await page.locator('body > .search-panel .search-results .search-result').nth(n).click();
      await frames(page);
      const at = await page.evaluate(([rootSel, sel, at]) => {
        const el = document.querySelectorAll(rootSel + ' :is(' + sel + ')')[at];
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, top: r.top, height: innerHeight, scrolled: scrollY, max: document.documentElement.scrollHeight - innerHeight,
          open: !document.querySelector('body > .search-panel').hidden };
      }, [ROOT_SEL, PLACE_SEL, wantAt[n].at]);
      check('search: a click on the result of the diagram with "' + term + '" brings the top of its figure to the top of the window; the panel stays open',
        at.tag === 'FIGURE' && at.open && at.top >= -1 && at.top < at.height && (Math.abs(at.top) <= 1 || at.scrolled >= at.max - 1), json(at));
    }
    // A label bpmn-js draws over two lines: one ending in a blank, one glued
    // ("Vormerkung" over "gemeldet"), one at a hyphen; found with light fuzzy off.
    const lines = Array.from(root.querySelectorAll('figure.dokufix-diagram-bpmn svg text'))
      .map(t => Array.from(t.children).filter(c => c.tagName.toUpperCase() === 'TSPAN').map(c => c.textContent)).filter(l => l.length >= 2);
    const broken = [
      ['ending in a blank', lines.find(l => /\s$/.test(l[0])), l => l[0] + l[1]],
      ['glued', lines.find(l => /\p{L}$/u.test(l[0]) && /^\p{L}/u.test(l[1])), l => l[0] + ' ' + l[1]],
      ['at a hyphen', lines.find(l => /[-\u2010\u2011]$/.test(l[0])), l => l[0] + l[1]],
    ].filter(([, l]) => l);
    for (const [how, l, joined] of broken){
      const term = joined(l).replace(/\s+/g, ' ').trim();
      const listed = await search(term);
      check('search: "' + term + '", a BPMN label drawn over two lines ' + how + ', is found with light fuzzy off',
        listed.results.some(r => r.kind === DIAGRAM_LANGUAGES.bpmn.label + ': ' && r.marks.length >= 1), json({ lines: l, results: listed.results.map(r => r.text.slice(0, 80)) }));
    }
    // What is no label: the source of a diagram and its frame. A diagram is
    // listed for such a word only where one of its labels, the text and
    // foreignObject elements of its SVG, holds it as well ("Akte schließen").
    const labelsOf = el => Array.from(el.querySelectorAll('*')).filter(e => /^(text|foreignobject)$/i.test(e.tagName)).map(e => e.textContent).join(' ').toLowerCase();
    const noLabels = [...(opts.demo ? ['Stempeln', 'Prozess_Neu'] : []), 'isExecutable', 'Einpassen', 'Schließen', 'Gezeichnet'];
    const strays = [];
    for (const term of noLabels){
      const listed = await search(term);
      const wantNo = expected(term);
      const inLabels = wantNo.filter(p => isDiagramKind(p.kind));
      if (listed.results.length !== wantNo.length || !listed.results.every((r, i) => kindAs(r, wantNo[i])) || !inLabels.every(p => labelsOf(p.el).includes(term.toLowerCase())))
        strays.push({ term, results: listed.results.map(r => r.text.slice(0, 60)), expected: wantNo.map(p => p.kind || p.el.tagName) });
    }
    check('search: a word only in a diagram\'s source (' + noLabels.slice(0, -3).join(', ') + ') or in its frame (the large view\'s "Einpassen" and "Schließen", the credit\'s "Gezeichnet") lists no diagram for it, only one whose labels hold it',
      strays.length === 0, json(strays));
    // A term with hits for the checks after this one, as the tables leave one.
    await search(SEARCH_TERM);
  }

  // Story 8, inside assertSearch for its helpers. In the demo text the terms
  // its special cases name: "Beispiel-Autorin", a value of the metadata
  // panel, "gueltig_bis", a key of it, "renderMermaidIn" in the code block
  // under "Code-Block (kein Mermaid)", "Rückbuchungsbeleg" in a code block in
  // a list item. In another document a word of the panel's values and one of
  // a code block, the fewest places first, and the panel's first key.
  async function assertSearchMetaCode(){
    const placesOf = collectPlaces(root);
    const index = new Map(all.map((el, n) => [el, n]));
    const expected = term => placesOf.map(p => ({ el: p.el, text: p.text, kind: p.kind, hits: findHits(term, p.text).length, at: index.get(p.el) })).filter(p => p.hits);
    const META = 'Metadaten', CODE = 'Code';
    const PANEL_SEL = 'details.dokufix-frontmatter';
    const panels = Array.from(root.querySelectorAll(PANEL_SEL));
    // A code block: a pre with text outside the panel, a warning, a table row (text of the row), the footer of an export and anything transient, not a diagram's source.
    const pres = Array.from(root.querySelectorAll('pre')).filter(pre => !pre.closest(PANEL_SEL + ', .dokufix-warning, tr, .dokufix-meta, [data-dokufix-transient]') &&
      !Array.from(pre.children).some(c => /^code$/i.test(c.tagName) && /\blanguage-(mermaid|bpmn)\b/.test(c.className)) && pre.textContent.trim());
    const metas = placesOf.filter(p => p.kind === META), codes = placesOf.filter(p => p.kind === CODE);
    const at = els => els.map(el => index.get(el));
    check('search: the metadata panel is one place of the kind "' + META + '", every code block outside it, a warning, a table row and the footer of an export one of the kind "' + CODE + '"; a diagram\'s source is none',
      sameList(at(metas.map(p => p.el)), at(panels)) && sameList(at(codes.map(p => p.el)), at(pres)) && (!opts.demo || (panels.length === 1 && pres.length >= 3)),
      json({ panels: panels.length, metas: metas.length, pres: pres.length, codes: codes.length }));
    // The ranges of the highlight inside the elements of sel, with the box of each and whether it lies in the panel's summary.
    const litIn = sel => page.evaluate(([rootSel, name, sel]) => {
      const h = window.CSS && CSS.highlights && CSS.highlights.get(name);
      const els = Array.from(document.querySelectorAll(rootSel + ' ' + sel));
      return (h ? Array.from(h) : []).map(s => {
        const r = document.createRange();
        r.setStart(s.startContainer, s.startOffset);
        r.setEnd(s.endContainer, s.endOffset);
        const el = els.find(e => e.contains(s.startContainer));
        if (!el) return null;
        const b = r.getBoundingClientRect();
        const node = s.startContainer.nodeType === 1 ? s.startContainer : s.startContainer.parentElement;
        return { text: r.toString(), at: els.indexOf(el), top: b.top, bottom: b.bottom, height: b.height, inSummary: !!node.closest('summary') };
      }).filter(Boolean);
    }, [ROOT_SEL, HIGHLIGHT, sel]);
    // A word of the places of the kind, the fewest places first.
    const words = text => text.match(/\p{L}{6,}/gu) || [];
    const pick = (kind, term) => {
      if (term) return { term, at: expected(term) };
      let best = null;
      for (const p of placesOf.filter(d => d.kind === kind)){
        for (const w of words(p.text)){
          const where = expected(w);
          if (!best || where.length < best.at.length) best = { term: w, at: where };
        }
      }
      return best;
    };
    // A click on the result n: from the end of the document, so the click has to scroll. Where the place and its first hit are then.
    const clickResult = async (n, sel, place) => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await frames(page);
      await page.locator('body > .search-panel .search-results .search-result').nth(n).click();
      await frames(page);
      const lit = (await litIn(sel)).filter(r => r.at === place);
      return { ...(await page.evaluate(([rootSel, sel, place]) => {
        const el = document.querySelectorAll(rootSel + ' ' + sel)[place];
        return { open: el.tagName === 'DETAILS' ? el.open : null, height: innerHeight, scrolled: scrollY, max: document.documentElement.scrollHeight - innerHeight,
          panel: !document.querySelector('body > .search-panel').hidden };
      }, [ROOT_SEL, sel, place])), first: lit[0] || null, ranges: lit.length };
    };
    // The first hit in the middle of the window, or as near as the page scrolls; in view, drawn.
    const centred = f => !!f.first && f.first.height > 0 && f.first.top >= 0 && f.first.bottom <= f.height &&
      (Math.abs((f.first.top + f.first.bottom) / 2 - f.height / 2) <= 2 || (f.scrolled <= 1 && (f.first.top + f.first.bottom) / 2 < f.height / 2) || (f.scrolled >= f.max - 1 && (f.first.top + f.first.bottom) / 2 > f.height / 2));
    const kindOk = (listed, wantAt, term) => listed.summary === summaryOf(wantAt) && listed.results.length === wantAt.length &&
      listed.results.every((r, i) => kindAs(r, wantAt[i]) && wantAt[i].text.includes(bodyOf(r)) && r.marks.length >= 1 && r.marks.every(m => m.toLowerCase() === term.toLowerCase()));

    if (panels.length){
      const panelAt = index.get(panels[0]);
      const closePanel = () => page.evaluate(([rootSel, sel]) => { const d = document.querySelector(rootSel + ' ' + sel); if (d) d.open = false; }, [ROOT_SEL, PANEL_SEL]);
      await closePanel();
      const value = pick(META, opts.demo ? 'Beispiel-Autorin' : null);
      if (value){
        const { term, at: wantAt } = value;
        const listed = await search(term);
        const n = wantAt.findIndex(p => p.kind === META);
        const lit = await litIn(PANEL_SEL);
        const first = groupsOf(wantAt).groups[0];
        check('search: "' + term + '", a value of the metadata panel, closed, lists the panel once, "' + META + ': " and its keys and values around the hit, in the first group; its hits are highlighted in it',
          n >= 0 && kindOk(listed, wantAt, term) && !!first && first.results.some(r => r.el === panels[0]) && lit.length === wantAt[n].hits && (!opts.demo || wantAt.length === 1),
          json({ summary: listed.summary, results: listed.results.map(r => r.text.slice(0, 80)), expected: wantAt.map(p => [p.kind || p.el.tagName, p.hits]), first: first && first.label, lit: lit.length }));
        if (n >= 0){
          const landed = await clickResult(n, PANEL_SEL, 0);
          check('search: a click on the panel\'s result opens it, brings its first hit to the middle of the window, or as near as the page scrolls, highlighted; the search panel stays open',
            landed.open === true && landed.panel && centred(landed) && landed.ranges === wantAt[n].hits, json(landed));
          await closePanel();
        }
      }
      // A key of the panel: the panel is a result.
      const key = opts.demo ? 'gueltig_bis' : (panels[0].querySelector('dt') || {}).textContent;
      if (key){
        const listed = await search(key);
        const wantKey = expected(key);
        check('search: "' + key + '", a key of the metadata panel, lists the panel', kindOk(listed, wantKey, key) && listed.results.some(r => r.kind === META + ': '),
          json({ summary: listed.summary, results: listed.results.map(r => r.text.slice(0, 60)) }));
      }
      // Its frame: the label "Metadaten" and the digest are no text, so a title the digest repeats counts once.
      const label = await search(META);
      const wantLabel = expected(META);
      const digest = ((panels[0].querySelector('.dokufix-fm-digest') || {}).textContent || '').split(' · ')[0].trim();
      const digestPlace = digest && expected(digest).find(p => p.kind === META);
      let repeated = null;
      if (digest){
        const listed = await search(digest);
        const lit = await litIn(PANEL_SEL);
        repeated = { term: digest, listed: listed.results.filter(r => r.kind === META + ': ').length, hits: digestPlace ? digestPlace.hits : 0, lit: lit.length, inSummary: lit.filter(r => r.inSummary).length };
      }
      check('search: the frame of the panel is no text of it: "' + META + '" lists no panel, and ' + (digest ? 'the digest\'s "' + digest + '" counts in the panel as often as its rows hold it, never in the summary' : 'its digest holds no row'),
        !wantLabel.some(p => p.kind === META) && !label.results.some(r => r.kind === META + ': ') &&
          (!repeated || (repeated.lit === repeated.hits && repeated.inSummary === 0 && repeated.listed === (repeated.hits ? 1 : 0) && (!opts.demo || repeated.hits === 1))),
        json({ label: label.results.map(r => r.kind), repeated }));
    } else {
      const none = await search(SEARCH_TERM);
      check('search: a document without metadata lists no result as "' + META + ': "', metas.length === 0 && none.results.every(r => r.kind !== META + ': '), json(none.results.map(r => r.kind)));
    }

    if (pres.length){
      const code = pick(CODE, opts.demo ? 'renderMermaidIn' : null);
      if (code){
        const { term, at: wantAt } = code;
        const listed = await search(term);
        const n = wantAt.findIndex(p => p.kind === CODE);
        const lit = await highlightFacts();
        check('search: "' + term + '", a word of a code block, lists the block once, "' + CODE + ': " and its text around the hit; its hits are highlighted',
          n >= 0 && kindOk(listed, wantAt, term) && litAs(lit, term, {}, wantAt, t => t.toLowerCase() === term.toLowerCase()) && (!opts.demo || wantAt.length === 1),
          json({ summary: listed.summary, results: listed.results.map(r => r.text.slice(0, 80)), expected: wantAt.map(p => [p.kind || p.el.tagName, p.hits]), lit: litLine(lit, term, {}, wantAt) }));
        if (n >= 0){
          // Its index among the pre elements of the content, as the page counts them.
          const preAt = Array.from(root.querySelectorAll('pre')).indexOf(wantAt[n].el);
          const landed = await clickResult(n, 'pre', preAt);
          // Readable: the colour the highlight gives its text on screen, against the yellow and the block's own colours.
          const colours = await page.evaluate(([rootSel, name, place]) => {
            let color = null, background = null;
            const walk = rules => { for (const rule of rules){
              if (rule.media && rule.cssRules){ if (matchMedia(rule.media.mediaText).matches) walk(rule.cssRules); continue; }
              if (rule.selectorText === '::highlight(' + name + ')'){ color = rule.style.color || color; background = rule.style.backgroundColor || background; }
            } };
            for (const sheet of document.styleSheets){ try { walk(sheet.cssRules); } catch (e){ /* a sheet of another origin */ } }
            const pre = document.querySelectorAll(rootSel + ' pre')[place];
            const cs = getComputedStyle(pre);
            return { color, background, preColor: cs.color, preBackground: cs.backgroundColor };
          }, [ROOT_SEL, HIGHLIGHT, preAt]);
          const rgb = c => { const m = String(c).match(/\d+(\.\d+)?/g); return m ? m.slice(0, 3).map(Number) : null; };
          const lum = c => { const v = rgb(c); return v ? v.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0) : NaN; };
          const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
          const readable = !!colours.color && !!colours.background && contrast(colours.color, colours.background) >= 4.5 && contrast(colours.preColor, colours.background) < 4.5 && lum(colours.preBackground) < 0.1;
          check('search: a click on the code block\'s result brings its first hit to the middle of the window, or as near as the page scrolls, highlighted, in a dark text that reads on the yellow where the block\'s light text would not',
            preAt >= 0 && landed.panel && centred(landed) && landed.ranges === wantAt[n].hits && readable,
            json({ landed, colours, contrast: colours.color && colours.background ? Math.round(contrast(colours.color, colours.background) * 10) / 10 : null }));
        }
      }
      // A code block in a list item is no text of the item, and a place of its own.
      const inItems = pres.filter(pre => pre.closest('li'));
      const glued = inItems.filter(pre => { const li = placesOf.find(p => p.el === pre.closest('li')); return li && li.text.includes(pre.textContent.trim().split(/\s+/)[0]); });
      let item = null;
      if (opts.demo){
        const wantItem = expected('Rückbuchungsbeleg');
        const listed = await search('Rückbuchungsbeleg');
        item = { results: listed.results.map(r => r.text.slice(0, 60)), ok: wantItem.length === 1 && wantItem[0].kind === CODE && !!wantItem[0].el.closest('li') && kindOk(listed, wantItem, 'Rückbuchungsbeleg') };
      }
      check('search: a code block in a list item is a place of its own and no text of the item' + (opts.demo ? ': "Rückbuchungsbeleg" lists the block alone' : ''),
        glued.length === 0 && (!opts.demo || (inItems.length >= 1 && item.ok)), json({ inItems: inItems.length, glued: glued.length, item }));
    } else {
      const none = await search(SEARCH_TERM);
      check('search: a document without a code block lists no result as "' + CODE + ': "', codes.length === 0 && none.results.every(r => r.kind !== CODE + ': '), json(none.results.map(r => r.kind)));
    }
    // No code: the source of a diagram.
    const source = await search('isExecutable');
    check('search: a word only in a diagram\'s source lists no code block', !source.results.some(r => r.kind === CODE + ': '), json(source.results.map(r => r.text.slice(0, 60))));
    // A term with hits for the checks after this one, as the tables leave one.
    await search(SEARCH_TERM);
  }

  // Story 6, inside assertSearch for its helpers. In the demo text the terms
  // its special cases name: "Zitronenfalter" in a table of the section
  // "Suche", the hidden row "Karten" under the facet "Text". In another
  // document a term of a row that only rows hold, and the first row a facet
  // value hides.
  async function assertSearchTables(){
    const placesOf = collectPlaces(root);
    const index = new Map(all.map((el, n) => [el, n]));
    const expected = term => placesOf.map(p => ({ el: p.el, text: p.text, kind: p.kind, hits: findHits(term, p.text).length, at: index.get(p.el) })).filter(p => p.hits);
    // A row's kind; a diagram has one of its own since story 7.
    const rows = placesOf.filter(p => p.kind === 'Tabelle');
    if (!rows.length){
      const none = await search(SEARCH_TERM);
      check('search: a document without a table row lists no result as "Tabelle: "', none.results.every(r => r.kind !== 'Tabelle: '), json(none.results.map(r => r.kind)));
      return;
    }
    const words = text => text.match(/\p{L}{6,}/gu) || [];
    // A word of a row that only rows hold, the fewest places first.
    const rowWord = (places, ok = () => true) => {
      let best = null;
      for (const p of places){
        for (const w of words(p.text)){
          const at = expected(w);
          if (!at.length || !at.every(x => x.kind === 'Tabelle') || !ok(w, at)) continue;
          if (!best || at.length < best.at.length) best = { term: w, at };
        }
      }
      return best;
    };
    const pick = opts.demo ? { term: 'Zitronenfalter', at: expected('Zitronenfalter') } : rowWord(rows);
    if (!pick){ check('search: a word of a table row that only table rows hold, to search for', false, rows.length + ' rows'); return; }
    const term = pick.term, wantRows = pick.at;
    const listed = await search(term);
    const groupsRow = flatGroups(groupsOf(wantRows).groups);
    const demoOk = !opts.demo || (wantRows.length === 1 && listed.results.length === 1 && listed.results[0].text === 'Tabelle: Zitronenfalter' &&
      groupsRow.map(g => g.label).join(' > ') === 'Sonderfälle > Suche');
    check('search: "' + term + '", which only table rows hold, lists one result per row, each "Tabelle: " and the row\'s text with the term marked, the "Tabelle" before it unmarked' + (opts.demo ? ', one row under "Sonderfälle" > "Suche"' : ''),
      listed.results.length === wantRows.length && listed.results.every((r, i) => kindAs(r, wantRows[i]) && r.kind === 'Tabelle: ' && wantRows[i].text.includes(bodyOf(r)) && !r.hidden &&
        r.marks.length >= 1 && r.marks.every(m => m.toLowerCase() === term.toLowerCase())) && listed.summary === summaryOf(wantRows) && demoOk,
      json({ summary: listed.summary, results: listed.results, groups: groupsRow.map(g => g.label) }));
    // Each range of the highlight inside the row lies in one cell of it; as many as the product makes of the row's hits.
    const rowRanges = place => { const p = placesOf.find(x => x.el === place.el); return findHits(term, p.text).flatMap(hit => nodeRanges(p.map, hit).map(coveredBy)); };
    const target = wantRows[0];
    await page.locator('body > .search-panel .search-results .search-result').first().click();
    await frames(page);
    const at = await page.evaluate(([rootSel, sel, at, name]) => {
      const row = document.querySelectorAll(rootSel + ' :is(' + sel + ')')[at];
      const r = row.getBoundingClientRect();
      const max = document.documentElement.scrollHeight - innerHeight;
      const h = window.CSS && CSS.highlights ? CSS.highlights.get(name) : null;
      const cellOf = n => (n.nodeType === 1 ? n : n.parentNode).closest('td, th');
      const ranges = h ? Array.from(h).filter(s => row.contains(s.startContainer) || row.contains(s.endContainer)).map(s => {
        const range = document.createRange();
        range.setStart(s.startContainer, s.startOffset);
        range.setEnd(s.endContainer, s.endOffset);
        const a = cellOf(s.startContainer), b = cellOf(s.endContainer);
        return { text: range.toString(), oneCell: !!a && a === b && a.closest('tr') === row };
      }) : null;
      return { tag: row.tagName, top: r.top, bottom: r.bottom, middle: (r.top + r.bottom) / 2, height: innerHeight, scrolled: scrollY, max, ranges };
    }, [ROOT_SEL, PLACE_SEL, target.at, HIGHLIGHT]);
    const centred = at.top >= 0 && at.bottom <= at.height && (Math.abs(at.middle - at.height / 2) <= 2 || at.scrolled <= 0 || at.scrolled >= at.max - 1);
    const wantRanges = rowRanges(target);
    check('search: a click on the result of a table row scrolls the row to the middle of the window, and its hits are highlighted in its cells, each range inside one cell',
      at.tag === 'TR' && centred && !!at.ranges && sameList(at.ranges.map(r => r.text), wantRanges) && at.ranges.every(r => r.oneCell),
      json({ ...at, expected: wantRanges }));

    // --- the demo text's table of keys, with a free-text filter and no facet
    // filter: a row its field hides is marked, a click brings the field into
    // the window and leaves its term. The search field emptied first, so that
    // typing into the table's field runs no search of its own.
    if (opts.demo && FIELDED.has(key)){
      const KEYS_TERM = 'Pfeiltasten', KEYS_SEARCH = 'rendern';
      await search('');
      const n = await page.evaluate(rootSel => Array.from(document.querySelectorAll(rootSel + ' .dokufix-filter-input')).findIndex(f => {
        const field = f.closest('.dokufix-filter'), th = field.nextElementSibling && field.nextElementSibling.querySelector('th');
        return !field.closest('.dokufix-facets') && !!th && th.textContent.trim() === 'Taste';
      }), ROOT_SEL);
      const keysTable = Array.from(root.querySelectorAll('table')).find(t => { const th = t.querySelector('th'); return !!th && th.textContent.trim() === 'Taste'; });
      if (n < 0 || !keysTable){ check('search: the demo text\'s table of keys, with its own field and no facet filter', false, json({ n, table: !!keysTable })); }
      else {
        const field = page.locator(ROOT_SEL + ' .dokufix-filter-input').nth(n);
        await field.fill(KEYS_TERM);
        const hiddenRows = new Set(Array.from(keysTable.querySelectorAll('tbody > tr')).filter(tr => !filterMatches(KEYS_TERM, collectPlaces(root).find(p => p.el === tr).text)));
        const wantKeys = expected(KEYS_SEARCH);
        const k = wantKeys.findIndex(x => hiddenRows.has(x.el));
        const keyed = await search(KEYS_SEARCH);
        await page.evaluate(() => window.scrollTo(0, 0));
        await frames(page);
        if (k >= 0) await page.locator('body > .search-panel .search-results .search-result').nth(k).click();
        await frames(page);
        const toField = await page.evaluate(([rootSel, n]) => {
          const input = document.querySelectorAll(rootSel + ' .dokufix-filter-input')[n];
          const r = input.closest('.dokufix-filter').getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, height: innerHeight, scrolled: scrollY, value: input.value };
        }, [ROOT_SEL, n]);
        check('search: in the table of keys, with "' + KEYS_TERM + '" typed into its own field, "' + KEYS_SEARCH + '" lists the row the field hides with " (ausgeblendet)", no other result marked; a click on it brings the field into the window, its term unchanged',
          k >= 0 && keyed.results.length === wantKeys.length && sameList(keyed.results.map(r => r.hidden), wantKeys.map(x => hiddenRows.has(x.el))) &&
            keyed.results[k].kind === 'Tabelle: ' && keyed.results[k].text.endsWith(HIDDEN_NOTE) &&
            toField.scrolled > 0 && toField.top >= 0 && toField.bottom <= toField.height && toField.value === KEYS_TERM,
          json({ n, k, results: keyed.results.map(r => [r.text.slice(0, 40), r.hidden]), toField }));
        await search('');
        await field.fill('');
      }
    }

    // --- a row a facet filter hides: listed, marked "(ausgeblendet)"; a click
    // goes to the facet buttons and the filter stays; the filter changed while
    // the panel is open, the search runs again and the mark follows. The field
    // emptied first: with no term a change of a filter searches nothing, so no
    // search of its own runs into the ones the run waits for.
    await search('');
    const facet = await page.evaluate(([rootSel, sel, demo]) => {
      const all = Array.from(document.querySelectorAll(rootSel + ' :is(' + sel + ')'));
      for (const [g, group] of Array.from(document.querySelectorAll(rootSel + ' .dokufix-facets')).entries()){
        const labels = Array.from(group.querySelectorAll(':scope > .dokufix-facet-bar > .dokufix-facet-controls > label'));
        for (let k = 1; k < labels.length; k++){
          if (demo && !labels[k].textContent.startsWith('Text')) continue;
          labels[k].click();
          const hidden = Array.from(group.querySelectorAll('tr')).filter(tr => !tr.parentNode.closest('td, th') && !tr.getClientRects().length).map(tr => all.indexOf(tr));
          labels[0].click();
          if (hidden.length) return { g, k, hidden, control: labels[k].textContent };
        }
      }
      return null;
    }, [ROOT_SEL, PLACE_SEL, !!opts.demo]);
    if (!facet) return;
    const choose = c => page.evaluate(([rootSel, g, c]) => {
      document.querySelectorAll(rootSel + ' .dokufix-facets')[g].querySelectorAll(':scope > .dokufix-facet-bar > .dokufix-facet-controls > label')[c].click();
    }, [ROOT_SEL, facet.g, c]);
    const hiddenPlaces = new Set(facet.hidden);
    const hiddenPick = opts.demo ? { term: 'Karten', at: expected('Karten') }
      : rowWord(rows.filter(p => hiddenPlaces.has(index.get(p.el))), (w, at) => at.some(x => hiddenPlaces.has(x.at)));
    if (!hiddenPick){ check('search: a word of a row a facet filter hides, to search for', false, json(facet)); return; }
    const hiddenTerm = hiddenPick.term, wantHidden = hiddenPick.at;
    const i = wantHidden.findIndex(x => hiddenPlaces.has(x.at));
    await choose(facet.k);
    await frames(page);
    const marked = await search(hiddenTerm);
    const marks = marked.results.map(r => r.hidden);
    check('search: with the facet value "' + facet.control.trim() + '" chosen, "' + hiddenTerm + '" lists the row the filter hides like any row, "Tabelle: " before it and " (ausgeblendet)" after it; no other result is marked',
      marked.results.length === wantHidden.length && i >= 0 && sameList(marks, wantHidden.map(x => hiddenPlaces.has(x.at))) &&
        marked.results[i].kind === 'Tabelle: ' && marked.results[i].text.endsWith(HIDDEN_NOTE) && wantHidden[i].text.includes(bodyOf(marked.results[i])),
      json({ facet, results: marked.results, expected: wantHidden.map(x => x.text) }));
    const filterFacts = () => page.evaluate(([rootSel, sel, g, at]) => {
      const group = document.querySelectorAll(rootSel + ' .dokufix-facets')[g];
      const bar = group.querySelector(':scope > .dokufix-facet-bar').getBoundingClientRect();
      const row = document.querySelectorAll(rootSel + ' :is(' + sel + ')')[at];
      const r = row.getBoundingClientRect();
      const inputs = Array.from(group.querySelectorAll(':scope > .dokufix-facet-bar input'));
      return { bar: { top: bar.top, bottom: bar.bottom }, row: { top: r.top, bottom: r.bottom, shown: row.getClientRects().length > 0 }, height: innerHeight,
        chosen: inputs.findIndex(x => x.checked), open: !document.querySelector('body > .search-panel').hidden };
    }, [ROOT_SEL, PLACE_SEL, facet.g, wantHidden[i].at]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await frames(page);
    await page.locator('body > .search-panel .search-results .search-result').nth(i).click();
    await frames(page);
    const toBar = await filterFacts();
    check('search: a click on the hidden row scrolls to the facet buttons of its table, which stand in the window; the filter stays as it was, the row hidden, the panel open',
      toBar.bar.top >= 0 && toBar.bar.bottom <= toBar.height && toBar.chosen === facet.k && !toBar.row.shown && toBar.open, json(toBar));
    // "Alle" chosen while the panel is open: the search runs again by itself.
    await page.evaluate(t => { document.querySelector('body > .search-panel [role="status"]').textContent = t; }, PENDING);
    await choose(0);
    await page.waitForFunction(t => document.querySelector('body > .search-panel [role="status"]').textContent !== t, PENDING, { timeout: 5000 }).catch(() => {});
    const again = await panelFacts();
    await page.evaluate(() => window.scrollTo(0, 0));
    await frames(page);
    await page.locator('body > .search-panel .search-results .search-result').nth(i).click();
    await frames(page);
    const toRow = await filterFacts();
    check('search: the facet set back to "Alle" while the panel is open, the search runs again by itself: no result is marked hidden, and a click on the row scrolls to the row',
      again.summary === summaryOf(wantHidden) && again.results.length === wantHidden.length && again.results.every(r => !r.hidden) &&
        toRow.row.shown && toRow.row.top >= 0 && toRow.row.bottom <= toRow.height && toRow.chosen === 0,
      json({ summary: again.summary, marks: again.results.map(r => r.hidden), toRow }));
    // Typing into the table's free-text field, where it has one, does the same: the row it hides is marked.
    const field = page.locator(ROOT_SEL + ' .dokufix-facets').nth(facet.g).locator('.dokufix-filter-input');
    if (FIELDED.has(key) && await field.count()){
      await page.evaluate(t => { document.querySelector('body > .search-panel [role="status"]').textContent = t; }, PENDING);
      await field.fill('vergleich: kein Treffer');
      await page.waitForFunction(t => document.querySelector('body > .search-panel [role="status"]').textContent !== t, PENDING, { timeout: 5000 }).catch(() => {});
      const typedOut = await panelFacts();
      await page.evaluate(t => { document.querySelector('body > .search-panel [role="status"]').textContent = t; }, PENDING);
      await field.fill('');
      await page.waitForFunction(t => document.querySelector('body > .search-panel [role="status"]').textContent !== t, PENDING, { timeout: 5000 }).catch(() => {});
      const cleared = await panelFacts();
      const body = wantHidden.map(x => !!x.kind && x.el.parentNode && x.el.parentNode.tagName.toUpperCase() === 'TBODY' && x.el.closest('.dokufix-facets') === root.querySelectorAll('.dokufix-facets')[facet.g]);
      check('search: a term typed into the table\'s own field while the panel is open hides its rows, and the search marks them; emptied, the marks go',
        sameList(typedOut.results.map(r => r.hidden), body) && body.some(Boolean) && cleared.results.every(r => !r.hidden),
        json({ marks: typedOut.results.map(r => r.hidden), expected: body, cleared: cleared.results.map(r => r.hidden) }));
    }
  }

  // --- a "/" in the field of a table filter is typed, and opens nothing
  const field = page.locator(ROOT_SEL + ' .dokufix-filter-input').first();
  if (await field.count()){
    await field.fill('');
    await field.focus();
    await press('/');
    const slash = { value: await field.inputValue(), panel: (await panelFacts()).shown };
    await field.fill('');
    check('search: a "/" typed into the field of a table filter is a slash in the field, and the panel stays closed', slash.value === '/' && !slash.panel, json(slash));
  }
  await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement) document.activeElement.blur(); });
  await frames(page);
}

// The magnifier (story 10): a button the search makes at load, in <body>,
// transient, that opens the panel. At the top right at every width, with a
// rail or without (Ben, 2026-10-04): in the editor file left of "Editor ↩",
// in an export in the corner where that button stands in the editor; beside
// a rail (1600 px) not over its entries. It stays where it is while the page
// scrolls, a click opens the
// panel, a second one on the open panel closes nothing. In the editor file it
// is not shown in edit mode. Starts and ends at 1400 px with the panel closed.
const MAGNIFIER_MIN = 32;
async function assertMagnifier(page, check, key){
  const json = JSON.stringify;
  const editor = key === 'mit-editor';
  const facts = () => page.evaluate(() => {
    const box = el => { if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
    const all = document.querySelectorAll('.search-magnifier');
    const m = all[0] || null, p = document.querySelector('body > .search-panel');
    const r = box(m);
    const atCentre = r ? document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2) : null;
    const licence = Array.from(document.querySelectorAll('details.dokufix-licences')).find(d => d.getClientRects().length);
    return {
      count: all.length, inBody: !!m && m.parentNode === document.body, transient: !!m && m.hasAttribute('data-dokufix-transient'),
      visible: !!m && m.checkVisibility({ visibilityProperty: true }), title: m ? m.title : null, label: m ? m.getAttribute('aria-label') : null,
      magnifier: r, onTop: !!atCentre && !!m && m.contains(atCentre),
      button: box(document.getElementById('edit-btn')), rail: box(document.querySelector('aside.dokufix-rail.has-items')),
      licence: box(licence && licence.querySelector(':scope > summary')),
      panel: !!p && !p.hidden, focused: !!p && document.activeElement === p.querySelector('input'), term: p ? p.querySelector('input').value : null,
      results: p ? p.querySelectorAll('.search-results .search-result').length : 0,
      window: { width: document.documentElement.clientWidth, height: innerHeight }, scrollY: Math.round(scrollY),
    };
  });
  const EPS = 1;
  const big = f => !!f.magnifier && f.magnifier.right - f.magnifier.left >= MAGNIFIER_MIN && f.magnifier.bottom - f.magnifier.top >= MAGNIFIER_MIN;
  const free = f => !overlap(f.magnifier, f.button) && !overlap(f.magnifier, f.licence);
  // Where it stands at the size the page has, as a list of what is wrong.
  const misplaced = f => {
    const m = f.magnifier, problems = [];
    if (!m || !f.visible) return ['not visible'];
    if (!big(f)) problems.push('smaller than ' + MAGNIFIER_MIN + ' px (' + round(m) + ')');
    if (!f.onTop) problems.push('not on top at its centre');
    if (!free(f)) problems.push('overlaps "Editor ↩" or the licence link (' + round(m) + ', button ' + round(f.button) + ', link ' + round(f.licence) + ')');
    if (overlap(m, f.rail)) problems.push('lies over the rail (' + round(m) + ', rail ' + round(f.rail) + ')');
    if (editor){
      if (!f.button || m.right > f.button.left || f.button.left - m.right > 12 || Math.abs(m.top - f.button.top) > 2)
        problems.push('not left of "Editor ↩" (' + round(m) + ', button ' + round(f.button) + ')');
    } else if (Math.abs(m.top - 16) > EPS || Math.abs(f.window.width - m.right - 16) > EPS){
      problems.push('not in the top right corner, 16 px from the edges (' + round(m) + ', window ' + f.window.width + ')');
    }
    return problems;
  };
  await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement) document.activeElement.blur(); });
  await frames(page);
  const first = await facts();
  check('magnifier: one button in <body>, outside the ' + (editor ? 'preview' : 'content') + ', transient, visible, at least ' + MAGNIFIER_MIN + ' px square, with the tooltip "Suchen (/)"',
    first.count === 1 && first.inBody && first.transient && first.visible && big(first) && first.title === 'Suchen (/)' && first.label === 'Suchen' && !first.panel,
    json({ ...first, button: undefined, rail: undefined, licence: undefined }));
  // --- its place at 1600, 1400 and 1200 px, at the top and scrolled down
  const places = [];
  for (const width of [1600, 1400, 1200]){
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await frames(page);
    const top = await facts();
    await page.evaluate(() => window.scrollTo(0, Math.min(1500, (document.documentElement.scrollHeight - innerHeight) / 2)));
    await frames(page);
    const down = await facts();
    const problems = [...misplaced(top), ...misplaced(down).map(p => 'scrolled: ' + p)];
    if (!down.scrollY) problems.push('the page did not scroll');
    if (round(top.magnifier) !== round(down.magnifier)) problems.push('it moved while the page scrolled (' + round(top.magnifier) + ' → ' + round(down.magnifier) + ')');
    places.push({ width, rail: !!top.rail, problems });
  }
  check('magnifier: at 1600 px, ' + (places[0].rail ? 'beside the rail and not over it' : 'without a rail') + ', and at 1400 and 1200 px ' + (editor ? 'left of "Editor ↩"' : 'in the top right corner') +
    '; on top, over neither "Editor ↩" nor the licence link, and where it is while the page scrolls',
    places.every(p => !p.problems.length), json(places));
  // --- a click opens the panel with the focus in its field; a second one on the open panel closes nothing
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement) document.activeElement.blur(); });
  await frames(page);
  await page.click('body > .search-magnifier', { timeout: 5000 }).catch(() => {});
  await frames(page);
  const opened = await facts();
  if (opened.panel){
    await page.fill('body > .search-panel input', SEARCH_TERM);
    await page.waitForFunction(() => document.querySelectorAll('body > .search-panel .search-results .search-result').length > 0, null, { timeout: 5000 }).catch(() => {});
  }
  const typed = await facts();
  await page.click('body > .search-magnifier', { timeout: 5000 }).catch(() => {});
  await frames(page);
  const again = await facts();
  check('magnifier: a click opens the panel with the focus in its field; a click on the open panel closes nothing, the term and its results stay',
    opened.panel && opened.focused && opened.term === '' && typed.results > 0 && again.panel && again.focused && again.term === SEARCH_TERM && again.results === typed.results,
    json({ opened: [opened.panel, opened.focused, opened.term], typed: typed.results, again: [again.panel, again.focused, again.term, again.results] }));
  // --- story 5.16, M2: closed with the focus in it, the panel puts the focus
  // back on what opened it, else on the magnifier: opened by the magnifier,
  // Escape; opened by "/" with the focus on the body, "×"
  const focusFacts = () => page.evaluate(() => {
    const p = document.querySelector('body > .search-panel'), a = document.activeElement;
    return { panel: !!p && !p.hidden, magnifier: !!a && a.classList.contains('search-magnifier'), at: a ? a.tagName + (a.className ? '.' + a.className : '') : null };
  });
  await page.keyboard.press('Escape');
  await frames(page);
  const escaped = await focusFacts();
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.keyboard.press('/');
  await frames(page);
  await page.click('body > .search-panel .search-close', { timeout: 5000 }).catch(() => {});
  await frames(page);
  const crossed = await focusFacts();
  check('magnifier: closed with the focus in it, the panel puts the focus on the magnifier: opened by it and closed by Escape, opened by "/" from the body and closed by "×"',
    !escaped.panel && escaped.magnifier && !crossed.panel && crossed.magnifier, json({ escaped, crossed }));
  await page.evaluate(() => { const p = document.querySelector('body > .search-panel'); if (p && !p.hidden) p.querySelector('.search-close').click(); if (document.activeElement) document.activeElement.blur(); });
  await frames(page);
  // --- the editor file: not in edit mode
  if (editor){
    await page.click('#edit-btn');
    await frames(page);
    const inEdit = await facts();
    await page.click('#view-btn');
    await page.waitForFunction(() => document.body.classList.contains('mode-view'));
    await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement) document.activeElement.blur(); });
    await frames(page);
    const back = await facts();
    check('magnifier: not shown in edit mode, shown again in read mode', inEdit.count === 1 && !inEdit.visible && !inEdit.magnifier && back.visible, json({ edit: inEdit.visible, back: back.visible }));
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
async function assertTableFootnote(page, check, exp, label, key){
  if (!exp.tableFootnotes) return;
  await page.setViewportSize({ width: FOOTNOTE_WIDTH, height: 1000 });
  await frames(page);
  // Focuses a footnote marker, in a table cell (where: 'cell'), in a cell of a
  // table with a free-text filter, whose field stands above its wrapper
  // ('filter'), or in a paragraph outside every table and list, and says where
  // marker, preview and wrapper stand.
  const place = async kind => {
    const inCell = kind !== 'paragraph';
    const found = await page.evaluate(where => {
      const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
      if (document.activeElement) document.activeElement.blur();
      const inWindow = x => { const r = x.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; };
      const filtered = x => { const w = x.closest('.dokufix-table'); return !!w && !!w.previousElementSibling && w.previousElementSibling.classList.contains('dokufix-filter'); };
      const a = Array.from(root.querySelectorAll('a[data-footnote-ref]')).find(x => !x.closest('.footnotes, .dokufix-fn-preview, nav') &&
        (where === 'paragraph' ? !x.closest('table, li') && x.parentElement.parentElement.tagName === 'P' && inWindow(x) : !!x.closest('td, th') && (where === 'cell' || filtered(x))));
      if (!a) return false;
      a.setAttribute('data-vergleich-marker', '');
      if (where !== 'paragraph') a.scrollIntoView({ block: 'center' });
      a.focus({ preventScroll: true });
      return true;
    }, kind);
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
  // In an editor file, a footnote cited in a cell of a table with a
  // free-text filter as well: the field above the wrapper changes nothing.
  const cases = [['cell', 'a table cell']];
  if (FIELDED.has(key) && exp.filters.some(f => f.footnotes.labels.length)) cases.push(['filter', 'a cell of a table with a free-text filter']);
  let fallbacksOff = false;
  for (const [where, what] of cases){
    const both = async () => ({ cell: await place(where), plain: await place('paragraph') });
    let { cell, plain } = await both();
    if (label === 'firefox' && !fallbacksOff && cell && plain && !(cell.shown && plain.shown)){
      await page.addStyleTag({ content: NO_FALLBACKS }); // known deviation, see header
      fallbacksOff = true;
      ({ cell, plain } = await both());
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    const stands = x => x.shown && x.preview.bottom <= x.marker.top + 1 && x.preview.left <= x.marker.left + 1 && x.preview.right >= x.marker.right - 1 &&
      x.preview.left >= 0 && x.preview.right <= x.window.width + 0.6 && x.preview.top >= 0 && x.preview.bottom <= x.window.height && x.preview.right - x.preview.left > 50;
    const above = x => x.marker.top - x.preview.bottom;
    // A document with no paragraph citing a footnote in the same window, as
    // the demo text: the cell's preview is judged on its own, as in a step.
    if (cell && !plain){
      const alone = !(label === 'firefox' && !stands(cell));
      check('the preview of a footnote cited in ' + what + ' stands above its marker, inside the window; it reaches above the wrapper of its table and is not cut off there (' + FOOTNOTE_WIDTH + ' px; no paragraph to compare it with)',
        !alone || (stands(cell) && !cell.held && cell.painted > 100), 'in a cell: ' + JSON.stringify(cell),
        alone ? '' : 'not judged: no paragraph to compare with, and the preview does not stand above its marker (known deviation of the Playwright Firefox build)');
      continue;
    }
    if (!cell || !plain){
      check('a footnote cited in ' + what + ', and one in a paragraph in the same window, to compare it with', false, 'in a cell: ' + !!cell + ', in a paragraph: ' + !!plain);
      continue;
    }
    const judged = !(label === 'firefox' && !stands(plain));
    check('the preview of a footnote cited in ' + what + ' stands where it stands for a paragraph: above its marker, inside the window; it reaches above the wrapper of its table and is not cut off there (' + FOOTNOTE_WIDTH + ' px)',
      !judged || (stands(cell) && stands(plain) && Math.abs(above(cell) - above(plain)) <= 1 && !cell.held && cell.painted > 100),
      'in a cell: ' + JSON.stringify(cell) + '; in a paragraph: ' + JSON.stringify(plain),
      judged ? '' : 'not judged: the preview of the paragraph does not stand above its marker here either, preview ' + JSON.stringify(plain.preview) + ' for the marker ' + JSON.stringify(plain.marker) + ' (known deviation of the Playwright Firefox build)');
  }
  await page.setViewportSize({ width: 1400, height: 1000 });
  await frames(page);
}
// A read-only export with scripts switched off: the facet filter is there and
// filters, by mouse and by keyboard. Not kompakt: its document is packed, and
// without scripts there is no table to filter.
async function assertFacetsWithoutScripts(browser, file, check, exp){
  if (!exp.facets.length) return;
  const context = await openContext(browser, { viewport: { width: 1400, height: 1000 }, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(file).href);
    const f = await tableFacts(page);
    check('facet filters with scripts off: there, shown, all rows at first',
      f.facets.length === exp.facets.length && f.facets.every(x => x.bar === 'block' && x.barVisible && x.controls[0].checked && x.shown.every(Boolean)),
      JSON.stringify(f.facets.map(x => [x.legend, x.bar, x.barVisible, x.shown])));
    if (f.facets.length === exp.facets.length) await assertFacetChoosing(page, check, exp, 'with scripts off: ');
  } finally {
    await context.close();
  }
}
// A read-only export with scripts switched off: no search field, and every row
// of a filter table shown. Not kompakt, which shows nothing without scripts.
async function assertFiltersWithoutScripts(browser, file, check, exp){
  if (!exp.filters.length) return;
  const context = await openContext(browser, { viewport: { width: 1400, height: 1000 }, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(file).href);
    const f = await page.evaluate(() => {
      const root = document.querySelector('main.reader-body');
      return { fields: root.querySelectorAll('.dokufix-filter, input[type="search"]').length,
               rows: Array.from(root.querySelectorAll('table')).flatMap(t => Array.from(t.tBodies).flatMap(b => Array.from(b.rows))).filter(tr => getComputedStyle(tr).display === 'none').length,
 };
    });
    check('free-text filter with scripts off: no field, and every row of every table shown', f.fields === 0 && f.rows === 0, JSON.stringify(f));
  } finally {
    await context.close();
  }
}

// ---------- BPMN diagrams ----------
// The elements a BPMN block places: for a block laid out by dokufix what
// judgeDiagrams() expects; otherwise, from its XML, every bpmnElement of a
// BPMNShape or BPMNEdge, with the tag of the element it names ("userTask").
const placedOf = d => d.laidOut ? d.expected : bpmnPlaced(d.source);
function bpmnPlaced(xml){
  const tags = new Map();
  for (const m of xml.matchAll(/<(?:[\w.-]+:)?(\w+)\b[^>]*?\sid="([^"]+)"/g)) tags.set(m[2], m[1]);
  return [...xml.matchAll(/<(?:[\w.-]+:)?BPMN(?:Shape|Edge)\b[^>]*?\sbpmnElement="([^"]+)"/g)].map(m => ({ id: m[1], tag: tags.get(m[1]) || '' }));
}
// The properties of a clean drawing (story 2.8, AC2), each with its key in
// what bpmnLayoutProblems() reports.
const BPMN_AC2 = [
  ['outline', 'every flow starts and ends on the outline of its symbols'],
  ['through', 'no flow runs through a symbol, its own source and target included'],
  ['labels', 'no two flow labels lie on top of each other'],
  ['corner', 'flows that leave a gateway at one point are told apart, by route or by label'],
  // Story 2.20: a flow back within a row lay on the edges of its tasks, and a
  // gateway's label reached into its diamond or onto a flow.
  ['along', 'no piece of a flow runs along the outline of a symbol'],
  ['label', 'no event or gateway label lies on a flow or a symbol'],
];
// What is not clean in a laid-out drawing, one sentence per finding, each
// starting with the key of its property. model: the process as
// readProcess() read it; g: the geometry bpmnFacts() measured.
function bpmnLayoutProblems(model, g){
  const out = [];
  const type = new Map(model.nodes.map(n => [n.id, n.type]));
  const eps = 1.5;
  const onOutline = (p, box, kind) => {
    const [x, y, w, h] = box, cx = x + w / 2, cy = y + h / 2;
    if (kind === 'gateway') return Math.abs(Math.abs(p[0] - cx) / (w / 2) + Math.abs(p[1] - cy) / (h / 2) - 1) * Math.min(w, h) / 2 <= eps;
    if (kind === 'task') return p[0] >= x - eps && p[0] <= x + w + eps && p[1] >= y - eps && p[1] <= y + h + eps &&
      Math.min(Math.abs(p[0] - x), Math.abs(p[0] - x - w), Math.abs(p[1] - y), Math.abs(p[1] - y - h)) <= eps;
    return Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - w / 2) <= eps;
  };
  const fmt = p => p.map(v => Math.round(v)).join(',');
  for (const fl of model.flows){
    const pts = g.flows[fl.id], a = g.shapes[fl.from], b = g.shapes[fl.to];
    if (!pts || pts.length < 2 || !a || !b){ out.push('outline: ' + fl.id + ' is not drawn'); continue; }
    if (!onOutline(pts[0], a, type.get(fl.from))) out.push('outline: ' + fl.id + ' starts at ' + fmt(pts[0]) + ', off ' + fl.from);
    if (!onOutline(pts[pts.length - 1], b, type.get(fl.to))) out.push('outline: ' + fl.id + ' ends at ' + fmt(pts[pts.length - 1]) + ', off ' + fl.to);
    // Its own source and target too: a piece that leaves or reaches a symbol
    // on its outline does not enter the box shrunk by a pixel; one that runs
    // inside it does.
    for (const n of model.nodes){
      if (!g.shapes[n.id]) continue;
      const [x, y, w, h] = g.shapes[n.id];
      for (let i = 1; i < pts.length; i++){
        const [p, q] = [pts[i - 1], pts[i]];
        if (Math.max(p[0], q[0]) > x + 1 && Math.min(p[0], q[0]) < x + w - 1 && Math.max(p[1], q[1]) > y + 1 && Math.min(p[1], q[1]) < y + h - 1){
          out.push('through: ' + fl.id + ' runs through ' + n.id + ' from ' + fmt(p) + ' to ' + fmt(q));
          break;
        }
      }
    }
  }
  const labels = model.flows.filter(fl => g.labels[fl.id + '_label']).map(fl => [fl.id, g.labels[fl.id + '_label']]);
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++){
    const [a, b] = [labels[i][1], labels[j][1]];
    if (a[0] < b[0] + b[2] - 0.5 && b[0] < a[0] + a[2] - 0.5 && a[1] < b[1] + b[3] - 0.5 && b[1] < a[1] + a[3] - 0.5) out.push('labels: the labels of ' + labels[i][0] + ' and ' + labels[j][0] + ' overlap');
  }
  // Flows that leave a gateway at one point, in one direction: each needs a
  // label of its own; that they do not overlap is checked above.
  for (const n of model.nodes.filter(x => x.type === 'gateway')){
    const outs = model.flows.filter(fl => fl.from === n.id && g.flows[fl.id] && g.flows[fl.id].length > 1);
    const way = fl => { const [p, q] = g.flows[fl.id]; return Math.round(p[0]) + ',' + Math.round(p[1]) + ' ' + Math.sign(Math.round(q[0] - p[0])) + ',' + Math.sign(Math.round(q[1] - p[1])); };
    const groups = new Map();
    for (const fl of outs) groups.set(way(fl), (groups.get(way(fl)) || []).concat(fl));
    for (const group of groups.values()){
      if (group.length > 1 && group.some(fl => !g.labels[fl.id + '_label'])) out.push('corner: ' + group.map(fl => fl.id).join(' and ') + ' leave ' + n.id + ' at one point, and not each has a label');
    }
  }
  // A piece along an outline: parallel to a side of the symbol's box, less
  // than 3 px off it, inside or outside, and beside the side for more than
  // 3 px; a circle and a diamond touch their box only at the middle of a
  // side, so there the piece has to pass that point. A piece that docks
  // meets its side at a right angle and is not one.
  const pieces = model.flows.flatMap(fl => (g.flows[fl.id] || []).slice(1).map((q, i) => [fl.id, g.flows[fl.id][i], q]));
  for (const [id, p, q] of pieces){
    const flat = Math.abs(p[1] - q[1]) < 0.5, steep = Math.abs(p[0] - q[0]) < 0.5;
    if (flat === steep) continue;
    const [u, v] = flat ? [1, 0] : [0, 1];
    const lo = Math.min(p[v], q[v]), hi = Math.max(p[v], q[v]);
    for (const n of model.nodes){
      const b = g.shapes[n.id];
      if (!b) continue;
      const from = b[v], to = b[v] + b[v + 2], mid = (from + to) / 2;
      const beside = type.get(n.id) === 'task' ? Math.min(hi, to) - Math.max(lo, from) > 3 : lo < mid - 0.5 && hi > mid + 0.5;
      const side = [b[u], b[u] + b[u + 2]].find(e => Math.abs(p[u] - e) < 3);
      if (side !== undefined && beside){ out.push('along: a piece of ' + id + ' from ' + fmt(p) + ' to ' + fmt(q) + ' runs along ' + n.id); break; }
    }
  }
  // The label of an event or a gateway, the box of its text as drawn, on a
  // piece of any flow or on any symbol, its own included.
  const hits = (a, b) => a[0] < b[0] + b[2] - 0.5 && b[0] < a[0] + a[2] - 0.5 && a[1] < b[1] + b[3] - 0.5 && b[1] < a[1] + a[3] - 0.5;
  for (const n of model.nodes.filter(x => x.type !== 'task')){
    const box = g.labels[n.id + '_label'];
    if (!box) continue;
    const flow = pieces.find(([, p, q]) => hits(box, [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(1, Math.abs(p[0] - q[0])), Math.max(1, Math.abs(p[1] - q[1]))]));
    if (flow) out.push('label: the label of ' + n.id + ' lies on ' + flow[0]);
    const symbol = model.nodes.find(m => g.shapes[m.id] && hits(box, g.shapes[m.id]));
    if (symbol) out.push('label: the label of ' + n.id + ' lies on ' + symbol.id);
  }
  return out;
}
// The class an element of that tag has to carry: the one the document styles
// colour it by (src/doc.css).
const BPMN_KIND_CLASS = tag => tag === 'participant' ? 'dokufix-bpmn-pool' : tag === 'lane' ? 'dokufix-bpmn-lane' : tag === 'callActivity' ? 'dokufix-bpmn-callactivity'
  : /Task$|^task$/.test(tag) ? 'dokufix-bpmn-task' : /Gateway$/.test(tag) ? 'dokufix-bpmn-gateway' : /Event$/.test(tag) ? 'dokufix-bpmn-event'
  : 'dokufix-bpmn-' + tag.toLowerCase();
// The colours the document styles give, as a browser computes them.
const BPMN_COLOURS = {
  task: 'rgb(0, 102, 204)', taskFill: 'rgb(255, 255, 255)', gateway: 'rgb(0, 102, 204)', start: 'rgb(0, 102, 204)', end: 'rgb(28, 28, 30)',
  pool: 'rgb(142, 142, 146) / rgb(250, 250, 250)', lane: 'rgb(142, 142, 146)',
  sequence: 'rgb(58, 58, 63)', message: 'rgb(110, 110, 115)', label: 'rgb(28, 28, 30)',
};
const BPMN_CREDIT_HTML = '<figcaption class="dokufix-diagram-credit">' + BPMN_CREDIT.before + '<a href="' + BPMN_CREDIT.href + '">' + BPMN_CREDIT.text + '</a></figcaption>';
const BPMN_CREDIT_LINE = BPMN_CREDIT.before + BPMN_CREDIT.text;
const bpmnFacts = page => page.evaluate(() => {
  const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
  const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const ids = Array.from(document.querySelectorAll('[id]')).map(e => e.id);
  return {
    figures: Array.from(root.querySelectorAll('figure.dokufix-diagram-bpmn')).map(f => {
      const svg = f.querySelector('.dokufix-diagram-svg > svg');
      const cap = f.querySelector(':scope > figcaption.dokufix-diagram-credit');
      const link = cap && cap.querySelector(':scope > a');
      const colour = (sel, prop) => { const el = svg && svg.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
      // Every fill and stroke the SVG writes, as an attribute or in a style.
      const written = [];
      if (svg) for (const el of svg.querySelectorAll('*')){
        for (const prop of ['fill', 'stroke']){
          const a = el.getAttribute(prop); if (a) written.push(a.trim());
          const v = el.style ? el.style.getPropertyValue(prop) : ''; if (v) written.push(v.trim());
        }
      }
      return {
        title: f.getAttribute('aria-label'),
        svg: !!svg, role: svg && svg.getAttribute('role'), name: svg && svg.getAttribute('aria-label'),
        size: svg ? svg.getAttribute('width') + ' ' + (svg.hasAttribute('height') ? svg.getAttribute('height') : 'no height') + ' ' + svg.style.maxWidth : '',
        foreign: svg ? svg.querySelectorAll('foreignObject').length : 0, hits: svg ? svg.querySelectorAll('.djs-hit').length : 0,
        elements: svg ? Array.from(svg.querySelectorAll('[data-element-id]')).map(g => ({ id: g.getAttribute('data-element-id'), cls: g.getAttribute('class') || '' })) : [],
        // What bpmn-js drew, in the SVG's own units, by data-element-id: the
        // box of each shape's first visual element, the points of each flow,
        // the box of each label's text.
        geometry: svg ? (() => {
          const offset = g => {
            const t = g.getAttribute('transform') || '';
            let m = t.match(/matrix\(([^)]+)\)/);
            if (m){ const v = m[1].trim().split(/[\s,]+/).map(Number); return [v[4], v[5]]; }
            m = t.match(/translate\(\s*([-\d.eE]+)[\s,]+([-\d.eE]+)/);
            return m ? [Number(m[1]), Number(m[2])] : [0, 0];
          };
          const out = { shapes: {}, flows: {}, labels: {} };
          for (const g of svg.querySelectorAll('g.djs-element[data-element-id]')){
            const id = g.getAttribute('data-element-id'), visual = g.querySelector(':scope > .djs-visual');
            if (!visual || !visual.firstElementChild) continue;
            const [ox, oy] = offset(g);
            if (g.classList.contains('djs-connection')){
              const nums = ((visual.querySelector(':scope > path') || { getAttribute: () => '' }).getAttribute('d') || '').match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) || [];
              const pts = [];
              for (let i = 0; i + 1 < nums.length; i += 2) pts.push([Number(nums[i]), Number(nums[i + 1])]);
              out.flows[id] = pts;
            } else if (/_label$/.test(id)){
              const text = visual.querySelector('text');
              if (text && text.textContent.trim()){ const b = text.getBBox(); out.labels[id] = [b.x + ox, b.y + oy, b.width, b.height]; }
            } else {
              const b = visual.firstElementChild.getBBox();
              out.shapes[id] = [b.x + ox, b.y + oy, b.width, b.height];
            }
          }
          return out;
        })() : null,
        fixed: [...new Set(written.filter(v => v !== 'none' && !/^var\(--dokufix-bpmn-(fill|stroke|label)\)$/.test(v)))],
        credit: link ? { text: link.textContent, href: link.getAttribute('href'), caption: cap.textContent,
                         visible: link.checkVisibility({ visibilityProperty: true }) && box(link).width > 0, below: !!svg && box(cap).top >= box(svg).bottom - 0.5,
                         look: getComputedStyle(link).fontSize + ' ' + getComputedStyle(link).color } : null,
        colours: {
          task: colour('.dokufix-bpmn-task > .djs-visual > rect', 'stroke'), taskFill: colour('.dokufix-bpmn-task > .djs-visual > rect', 'fill'),
          gateway: colour('.dokufix-bpmn-gateway > .djs-visual > polygon', 'stroke'), start: colour('.dokufix-bpmn-startevent > .djs-visual > circle', 'stroke'),
          end: colour('.dokufix-bpmn-endevent > .djs-visual > circle', 'stroke'),
          pool: svg && svg.querySelector('.dokufix-bpmn-pool') ? colour('.dokufix-bpmn-pool > .djs-visual > rect', 'stroke') + ' / ' + colour('.dokufix-bpmn-pool > .djs-visual > rect', 'fill') : null,
          lane: colour('.dokufix-bpmn-lane > .djs-visual > rect', 'stroke'),
          sequence: colour('.dokufix-bpmn-sequenceflow > .djs-visual > path', 'stroke'), message: colour('.dokufix-bpmn-messageflow > .djs-visual > path', 'stroke'),
          label: colour('.dokufix-bpmn-task > .djs-visual > text', 'fill'),
        },
      };
    }),
    duplicateIds: [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))],
    // The host bpmn-js draws into, if one were left in the page. The search's
    // magnifier (story 5.10) is transient and fixed as well, and no host.
    hosts: Array.from(document.querySelectorAll('body > [data-dokufix-transient]:not(.search-magnifier)')).filter(el => getComputedStyle(el).position === 'fixed').length,
    warnings: Array.from(root.querySelectorAll('.dokufix-warning')).map(w => ({
      title: (w.querySelector('.dokufix-warning-title') || { textContent: '' }).textContent,
      detail: (w.querySelector('.dokufix-warning-detail') || { textContent: '' }).textContent,
      next: w.nextElementSibling ? w.nextElementSibling.tagName : '', before: w.previousElementSibling ? w.previousElementSibling.tagName + ':' + w.previousElementSibling.textContent : '' })),
  };
});
async function assertBpmn(page, check, exp, key, text, label, dir){
  const want = exp.diagrams.filter(d => d.kind === 'bpmn' && d.drawn), refused = exp.diagrams.filter(d => d.kind === 'bpmn' && !d.drawn);
  const f = await bpmnFacts(page);
  const json = JSON.stringify;
  check('BPMN: every block with coordinates is drawn in its figure, an SVG of role img named by its title: ' + json(want.map(d => d.title)),
    json(f.figures.map(x => [x.title, x.svg, x.role, x.name])) === json(want.map(d => [d.title, true, 'img', d.title])), json(f.figures.map(x => [x.title, x.svg, x.role, x.name])));
  const unnamed = [];
  for (const d of want) if (await page.getByRole('img', { name: d.title, exact: true }).count() !== 1) unnamed.push(d.title);
  check('BPMN: the accessibility tree has each diagram as an image with its title', unnamed.length === 0, unnamed.join(', '));
  // Every element the XML places, drawn with the class of its kind.
  const missing = [];
  want.forEach((d, i) => {
    const drawn = f.figures[i] ? f.figures[i].elements : [];
    for (const el of placedOf(d)){
      const g = drawn.find(x => x.id === el.id);
      if (!g) missing.push(d.title + ': ' + el.tag + ' ' + el.id + ' not drawn');
      else if (!g.cls.split(' ').includes(BPMN_KIND_CLASS(el.tag))) missing.push(d.title + ': ' + el.tag + ' ' + el.id + ' has "' + g.cls + '"');
    }
  });
  const placed = want.reduce((n, d) => n + placedOf(d).length, 0);
  check('BPMN: every element the XML places is drawn, with the class of its kind (' + placed + ' elements)', want.length === f.figures.length && missing.length === 0, missing.slice(0, 8).join(' | '));
  // A diagram laid out by dokufix (story 2.8): its counts, and the drawing
  // clean (AC2), measured on the SVG bpmn-js drew.
  want.forEach((d, i) => {
    if (!d.laidOut) return;
    const g = f.figures[i] && f.figures[i].geometry;
    const m = d.model, drawn = id => !!(g && (g.shapes[id] || g.flows[id]));
    const counts = [m.pool ? 1 : 0, m.lanes.filter(l => !l.synthetic).length, m.nodes.length, m.flows.length];
    const got = [m.pool && drawn(m.pool.id) ? 1 : 0, m.lanes.filter(l => !l.synthetic && drawn(l.id)).length, m.nodes.filter(n => drawn(n.id)).length, m.flows.filter(fl => drawn(fl.id)).length];
    check('BPMN laid out, "' + d.title + '": pool, lanes, symbols and flows drawn: ' + counts.join(', '), json(got) === json(counts), json(got));
    const problems = g ? bpmnLayoutProblems(m, g) : ['no SVG'];
    for (const [key, text] of BPMN_AC2){
      const mine = problems.filter(p => p.startsWith(key + ':'));
      check('BPMN laid out, "' + d.title + '": ' + text, mine.length === 0, mine.slice(0, 6).join(' | '));
    }
  });
  const shapes = f.figures.filter(x => x.foreign || x.hits || !/^100% no height \d+px$/.test(x.size)).map(x => x.title + ': ' + json([x.foreign, x.hits, x.size]));
  check('BPMN: the SVG has no foreignObject and no hit areas, is 100 % wide with no height and no wider than drawn', shapes.length === 0, shapes.join(' | '));
  const fixed = f.figures.filter(x => x.fixed.length).map(x => x.title + ': ' + x.fixed.join(', '));
  check('BPMN: no colour is written into the SVG, only the three properties of the document styles', fixed.length === 0, fixed.join(' | '));
  const colours = f.figures.flatMap(x => Object.entries(x.colours).filter(([k, v]) => v !== null && v !== BPMN_COLOURS[k]).map(([k, v]) => x.title + ' ' + k + ': ' + v + ', expected ' + BPMN_COLOURS[k]));
  const seen = new Set(f.figures.flatMap(x => Object.entries(x.colours).filter(([, v]) => v !== null).map(([k]) => k)));
  check('BPMN: the colours are the ones the document styles give: ' + [...seen].join(', '), colours.length === 0 && (!want.length || seen.size >= 8), colours.join(' | ') || 'seen only ' + [...seen].join(', '));
  const credits = f.figures.filter(x => !x.credit || x.credit.text !== BPMN_CREDIT.text || x.credit.href !== BPMN_CREDIT.href || x.credit.caption !== BPMN_CREDIT_LINE || !x.credit.visible || !x.credit.below || x.credit.look !== '12px rgb(110, 110, 115)')
    .map(x => x.title + ': ' + json(x.credit));
  check('BPMN: "' + BPMN_CREDIT_LINE + '" below every BPMN diagram, "' + BPMN_CREDIT.text + '" a visible link to ' + BPMN_CREDIT.href, credits.length === 0 && f.figures.length === want.length, credits.join(' | '));
  // A block that cannot be drawn: the warning in its place, naming its title, with the reason.
  const wrong = refused.filter(d => !f.warnings.some(w => w.title === 'Warnung: ' + bpmnWarningText(d.title) && (d.reason === null ? w.detail.trim().length > 0 : w.detail === d.reason)))
    .map(d => d.title);
  check('BPMN: each block that cannot be drawn is a warning naming its title, with the reason: ' + json(refused.map(d => d.title + ' (' + (d.reason || 'the library\'s message') + ')')),
    wrong.length === 0 && f.warnings.filter(w => /„.*“ konnte nicht gezeichnet werden/.test(w.title)).length === refused.length, wrong.join(', ') + ' ' + json(f.warnings.filter(w => /Diagramm/.test(w.title))));
  check('no id stands twice in the page', f.duplicateIds.length === 0, f.duplicateIds.join(', '));
  check('BPMN: no host of the drawing is left in the page', f.hosts === 0, f.hosts);
  if (READONLY.has(key)){
    // The library itself never goes into a read-only file: no script tag or
    // URL of it, none of its code (its global, its bundle's name), not the
    // comment its export function writes. Its name may stand as text: in the
    // licence information, in the credit, in what the author wrote.
    const hits = text.match(/.{0,40}(BpmnJS|bpmn-navigated-viewer|npm\/bpmn-js|created with bpmn-js).{0,40}/g) || [];
    check('BPMN: the file carries nothing of bpmn-js: no tag, no URL, no code, not the comment of its export', hits.length === 0, hits.slice(0, 3).join(' | '));
  }
  if (key === 'schlank'){
    check('BPMN: in schlank the credit stands as readable text outside what is gzipped, once per diagram',
      text.split(BPMN_CREDIT_HTML).length - 1 === want.length, (text.split(BPMN_CREDIT_HTML).length - 1) + ' of ' + want.length);
  }
  if (label === 'chromium' && key === 'nur-lesen' && want.length) await assertBpmnFonts(page, check, dir);
}

// AC7: a diagram is measured with the author's font when it is drawn; a reader
// may see it in another. The finished SVG is shown with each of these system
// fonts in turn, and every label is measured against what holds it: a label
// inside a task, a call activity, a pool or a lane against that shape; a label
// outside its symbol (an event, a gateway, a flow) against the picture, where
// it would be cut off, and against every flow but its own, which it must not
// lie on (story 2.8, AC9). What does not fit is noted with a picture, for the
// product owner; it does not fail the run, unless a label is cut off or runs
// out of its symbol as drawn. The fonts are installed on the machine of the
// run; one that is not is noted.
const FONT_CHECK = ['DejaVu Sans', 'Noto Sans'];
async function assertBpmnFonts(page, check, dir){
  const results = [];
  for (const font of [null, ...FONT_CHECK]){
    const css = font ? '.dokufix-diagram-bpmn svg text{font-family:"' + font + '" !important}' : '';
    const tag = css ? await page.addStyleTag({ content: css }) : null;
    await frames(page);
    const r = await page.evaluate(font => {
      // Is the font there? A text in it is as wide as in the fallback only when it is not.
      const c = document.createElement('canvas').getContext('2d');
      const width = f => { c.font = '12px ' + f; return c.measureText('Medium von Hand prüfen').width; };
      const installed = !font || (width('"' + font + '", monospace') !== width('monospace'));
      const out = { font: font || '(as drawn)', installed, labels: 0, problems: [] };
      document.querySelectorAll('figure.dokufix-diagram-bpmn').forEach((fig, figure) => {
        const svg = fig.querySelector('svg');
        const pic = svg.getBoundingClientRect();
        // Every piece of every flow, on the screen, with the flow's id.
        const pieces = [];
        for (const g of svg.querySelectorAll('g.djs-connection[data-element-id]')){
          const path = g.querySelector(':scope > .djs-visual > path');
          if (!path) continue;
          const nums = (path.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) || [];
          const ctm = path.getScreenCTM();
          const pts = [];
          for (let i = 0; i + 1 < nums.length; i += 2) pts.push(new DOMPoint(Number(nums[i]), Number(nums[i + 1])).matrixTransform(ctm));
          for (let i = 1; i < pts.length; i++) pieces.push({ id: g.getAttribute('data-element-id'), a: pts[i - 1], b: pts[i] });
        }
        for (const text of svg.querySelectorAll('text')){
          if (!text.textContent.trim()) continue;
          out.labels++;
          const t = text.getBoundingClientRect();
          const visual = text.closest('.djs-visual');
          const g = visual && visual.parentElement;
          const id = g ? g.getAttribute('data-element-id') : '?';
          // The shape that holds an inner label: the first rect of its visual.
          const holder = g && /dokufix-bpmn-(task|callactivity|subprocess|pool|lane)\b/.test(g.getAttribute('class') || '') ? visual.querySelector(':scope > rect') : null;
          const frame = holder ? holder.getBoundingClientRect() : pic;
          const eps = 0.5;
          if (t.left < frame.left - eps || t.right > frame.right + eps || t.top < frame.top - eps || t.bottom > frame.bottom + eps){
            out.problems.push({ figure, kind: holder ? 'symbol' : 'picture', text: fig.getAttribute('aria-label') + ' / ' + id + ' "' + text.textContent.trim() + '" ' + (holder ? 'runs out of its symbol' : 'is cut off by the picture') +
              ' by ' + Math.round(Math.max(frame.left - t.left, t.right - frame.right, frame.top - t.top, t.bottom - frame.bottom) * 10) / 10 + ' px' });
          }
          // A label outside its symbol on a flow other than its own.
          if (!holder){
            const own = id.replace(/_label$/, '');
            const hit = pieces.find(p => p.id !== own && Math.max(p.a.x, p.b.x) > t.left + eps && Math.min(p.a.x, p.b.x) < t.right - eps && Math.max(p.a.y, p.b.y) > t.top + eps && Math.min(p.a.y, p.b.y) < t.bottom - eps);
            if (hit) out.problems.push({ figure, kind: 'flow', text: fig.getAttribute('aria-label') + ' / ' + id + ' "' + text.textContent.trim() + '" lies on the flow ' + hit.id });
          }
        }
      });
      return out;
    }, font);
    // One picture per figure with a label that does not fit in this font,
    // named by the font and the figure's place among the BPMN figures.
    for (const figure of new Set(r.problems.map(x => x.figure))){
      const picture = path.join(dir, 'schrift-' + (font || 'wie-gezeichnet').replace(/\s+/g, '-').toLowerCase() + '-' + (figure + 1) + '.png');
      await page.locator('figure.dokufix-diagram-bpmn').nth(figure).screenshot({ path: picture }).catch(() => {});
      r.problems.filter(x => x.figure === figure).forEach(x => { x.picture = path.relative(process.cwd(), picture); });
    }
    if (tag) await tag.evaluate(el => el.remove());
    results.push(r);
  }
  await frames(page);
  const summary = results.map(r => r.font + (r.installed ? '' : ' (not installed)') + ': ' + (r.problems.length ? r.problems.length + ' of ' + r.labels + ' labels do not fit (' + r.problems.map(x => x.text + ', picture ' + x.picture).join('; ') + ')' : 'all ' + r.labels + ' labels fit')).join(' | ');
  fs.writeFileSync(path.join(dir, 'schrift.json'), JSON.stringify(results, null, 2) + '\n');
  check('BPMN, the font check (AC7 of 2.7, AC9 of 2.8): every label measured with the font as drawn and with ' + FONT_CHECK.join(' and ') + ', and whether one lies on a flow',
    results.every(r => r.labels > 0) && results[0].problems.filter(x => x.kind !== 'flow').length === 0, summary, summary);
}
// schlank with scripts off: each BPMN diagram is the notice that it needs
// JavaScript, and its credit is there, readable.
async function assertDiagramsWithoutScripts(browser, file, check, exp){
  const drawn = exp.diagrams.filter(d => d.drawn);
  if (!drawn.length) return;
  const context = await openContext(browser, { viewport: { width: 1400, height: 1000 }, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(file).href);
    const f = await page.evaluate(() => {
      const root = document.querySelector('main.reader-body');
      return {
        notices: Array.from(root.querySelectorAll('figure.dokufix-diagram .dokufix-diagram-svg[data-gz]')).map(h => getComputedStyle(h, '::before').content),
        svgs: root.querySelectorAll('figure.dokufix-diagram svg').length,
        credits: Array.from(root.querySelectorAll('figure.dokufix-diagram-bpmn > figcaption > a')).map(a => { const r = a.getBoundingClientRect(); return a.parentElement.textContent + ' | ' + a.textContent + ' ' + (r.width > 0 && r.height > 0); }),
        // The line of each diagram: its source link packed (no href, the packed
        // one in data-gz-href), the line not shown, no picture button; the credit beside it shown.
        sources: Array.from(root.querySelectorAll('figure.dokufix-diagram > .dokufix-diagram-downloads')).map(line => {
          const a = line.querySelector(':scope > a[download]'), r = line.getBoundingClientRect();
          return (a ? a.getAttribute('download') + ' ' + a.hasAttribute('href') + ' ' + a.hasAttribute('data-gz-href') : '-') + ' ' + (r.width > 0 && r.height > 0) + ' ' + line.querySelectorAll('button').length;
        }),
      };
    });
    const bpmn = drawn.filter(d => d.kind === 'bpmn').length;
    check('diagrams with scripts off: each is the notice that it needs JavaScript, and every BPMN diagram keeps its credit, visible',
      f.svgs === 0 && f.notices.length === drawn.length && f.notices.every(n => n === '"[Diagramm — JavaScript erforderlich, um es anzuzeigen]"') &&
      f.credits.length === bpmn && f.credits.every(c => c === BPMN_CREDIT_LINE + ' | ' + BPMN_CREDIT.text + ' true'), JSON.stringify(f));
    // Ben, 2026-10-03: in schlank the source is packed like the diagram, so with scripts off no download is offered.
    const want = downloadNames(exp).filter((n, i) => exp.diagrams[i].drawn).map((n, i) => n + KINDS[drawn[i].kind].download.ext + ' false true false 0');
    check('diagrams with scripts off (story 2.10): no line of downloads is shown, every source link is packed (no href), no picture button; the credit stays visible (above)',
      JSON.stringify(f.sources) === JSON.stringify(want), JSON.stringify(f.sources) + ', expected ' + JSON.stringify(want));
  } finally {
    await context.close();
  }
}

// The downloads below a diagram (story 2.10). The base names of the files of
// every diagram block of the document, drawn or not, in its order, as the
// product names them.
const downloadNames = exp => diagramFileNames(exp.diagrams.map(d => d.title));
// What a downloaded source has to hold: the block's text as marked hands it
// on, with its line feed at the end; for BPMN laid out by dokufix the
// author's XML with the diagram part dokufix put in.
const LAID_OUT_PART = /  <bpmndi:BPMNDiagram xmlns:bpmndi="http:\/\/www\.omg\.org\/spec\/BPMN\/20100524\/DI"[\s\S]*?<\/bpmndi:BPMNDiagram>\n/;
function sourceProblem(d, got){
  const want = d.source + '\n';
  if (!d.laidOut) return got === want ? '' : 'differs from the block\'s text at ' + [...want].findIndex((c, i) => got[i] !== c);
  if (!/<bpmndi:BPMNShape\b/.test(got)) return 'no BPMNShape';
  return got.replace(LAID_OUT_PART, '') === want ? '' : 'without its diagram part not the author\'s XML';
}
// The picture button where a script runs: the editor file, schlank and kompakt.
const PICTURED = new Set(['mit-editor', 'schlank', 'kompakt']);
async function assertDiagramDownloads(page, check, exp, key, text, label, dir){
  const drawn = exp.diagrams.filter(d => d.drawn);
  const names = downloadNames(exp).filter((n, i) => exp.diagrams[i].drawn);
  const json = JSON.stringify;
  const f = await page.evaluate(async () => {
    const root = document.querySelector('#preview') || document.querySelector('main.reader-body') || document.body;
    return {
      lines: await Promise.all(Array.from(root.querySelectorAll('figure.dokufix-diagram')).map(async fig => {
        const line = fig.querySelector(':scope > .dokufix-diagram-downloads');
        if (!line) return null;
        const a = line.querySelector(':scope > a'), button = line.querySelector(':scope > button');
        const look = el => { if (!el) return null; const cs = getComputedStyle(el), b = getComputedStyle(el, '::before'), r = el.getBoundingClientRect();
          return { font: cs.fontSize, border: cs.borderTopWidth + ' ' + cs.borderTopStyle, radius: cs.borderTopLeftRadius, symbol: b.backgroundImage.startsWith('url("data:image/svg+xml') && b.width + ' ' + b.height, visible: r.width > 0 && r.height > 0 }; };
        let content = null;
        try { content = a ? await (await fetch(a.getAttribute('href'))).text() : null; } catch (e){ content = 'fetch failed: ' + e.message; }
        return {
          role: line.getAttribute('role'), label: line.getAttribute('aria-label'), inView: !!line.closest('.dokufix-diagram-view'),
          children: Array.from(line.children).map(k => k.tagName.toLowerCase()).join(' '),
          download: a ? a.getAttribute('download') : null, text: a ? a.textContent : null, title: a ? a.getAttribute('title') : null, content,
          button: button ? { text: button.textContent, type: button.getAttribute('type'), transient: button.hasAttribute('data-dokufix-transient'), title: button.getAttribute('title') } : null,
          look: [look(a), look(button)],
          below: (() => { const v = fig.querySelector('.dokufix-diagram-view').getBoundingClientRect(), l = line.getBoundingClientRect(); return l.top >= v.bottom - 0.5; })(),
          // Below a BPMN diagram the credit stands in the line of the downloads, to their right (Ben, 2026-10-03).
          beside: (() => { const cap = fig.querySelector(':scope > .dokufix-diagram-credit'); if (!cap) return null;
            const l = line.getBoundingClientRect(), c = cap.getBoundingClientRect();
            return Math.abs((l.top + l.bottom) / 2 - (c.top + c.bottom) / 2) <= 2 && c.left >= l.right; })(),
        };
      })),
      warningLines: root.querySelectorAll('.dokufix-warning .dokufix-diagram-downloads').length,
    };
  });
  const lines = f.lines;
  check('downloads: a line below every drawn diagram, outside its large view, a group named "' + DOWNLOADS_LABEL + '", with the source link named by its title (' + names.length + ')',
    lines.length === drawn.length && lines.every((l, i) => l && l.role === 'group' && l.label === DOWNLOADS_LABEL && !l.inView && l.below && l.download === names[i] + KINDS[drawn[i].kind].download.ext && l.text === KINDS[drawn[i].kind].download.ext) && f.warningLines === 0,
    json(lines.map(l => l && [l.download, l.text, l.role, l.label, l.inView, l.below])) + ', expected ' + json(names));
  check('downloads: below a BPMN diagram the credit stands in one line with the downloads, to their right, vertically centred with them',
    lines.every((l, i) => !l || (drawn[i].kind === 'bpmn' ? l.beside === true : l.beside === null)), json(lines.map(l => l && l.beside)));
  const lower = names.map(n => n.toLowerCase());
  check('downloads: two diagrams never share a name, the same title gets -2', new Set(lower).size === lower.length, json(names));
  const wrong = lines.map((l, i) => l && l.content !== null ? sourceProblem(drawn[i], l.content) : 'no content').map((p, i) => p ? names[i] + ': ' + p : '').filter(Boolean);
  check('downloads: every source, read through its data: URL, is the block\'s text, byte for byte; BPMN laid out by dokufix its XML with the diagram part (BPMNShape)', wrong.length === 0, wrong.join(' | '));
  if (key === 'nur-lesen'){
    // As the file writes it: the attribute holds the minimal encoding, nothing escaped.
    const verbatim = drawn.map((d, i) => d.laidOut ? '' : (text.includes('href="' + sourceDataUrl(d.source + '\n', KINDS[d.kind].download.mime) + '"') ? '' : names[i])).filter(Boolean);
    check('downloads: the file writes each source link as the minimal encoding of the block\'s text, nothing escaped', verbatim.length === 0, verbatim.join(', '));
  }
  if (key === 'schlank'){
    // Packed (Ben, 2026-10-03): each link in the file has no href and its
    // packed one in data-gz-href; no source stands in the file as text.
    const esc = n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const packed = names.map((n, i) => {
      const m = text.match(new RegExp('<a download="' + esc(n + KINDS[drawn[i].kind].download.ext) + '"([^>]*)>'));
      return m && / data-gz-href="[A-Za-z0-9+/=]+"/.test(m[1]) && !/ href=/.test(m[1]) ? '' : n + ': ' + (m ? m[0].slice(0, 120) : 'no link');
    }).filter(Boolean);
    const plain = drawn.filter(d => !d.laidOut && text.includes(sourceDataUrl(d.source + '\n', KINDS[d.kind].download.mime))).map(d => d.title);
    check('downloads: schlank writes every source link packed, no href, its source gzipped in data-gz-href, and no source as text', packed.length === 0 && plain.length === 0 && !/<a download="[^"]*" href="data:/.test(text),
      packed.concat(plain).join(' | '));
  }
  const buttons = lines.filter(l => l && l.button);
  if (PICTURED.has(key)){
    check('downloads: every line has its picture button, a transient button ".svg" named by its file, behind the source link',
      lines.every((l, i) => l && l.children === 'a button' && l.button && l.button.text === '.svg' && l.button.type === 'button' && l.button.transient && l.button.title === 'Bild herunterladen: ' + names[i] + '.svg'),
      json(lines.map(l => l && [l.children, l.button])));
  } else {
    check('downloads: no picture button where no script runs', buttons.length === 0 && lines.every(l => l && l.children === 'a'), json(lines.map(l => l && l.children)));
  }
  const looks = lines.flatMap(l => l ? l.look.filter(Boolean) : []).filter(x => !(x.font === '12px' && x.border === '1px solid' && x.radius === '4px' && x.symbol === '12px 12px' && x.visible));
  check('downloads: each is a small button with the download symbol, 12 px', looks.length === 0, json(looks));

  // One file of each kind through the browser's download: the source of a
  // Mermaid and of a BPMN diagram, and where a script runs their pictures.
  const saved = path.join(dir, 'herunterladen');
  fs.mkdirSync(saved, { recursive: true });
  const grab = async (index, which) => {
    const loc = page.locator('figure.dokufix-diagram').nth(index).locator(':scope > .dokufix-diagram-downloads > ' + which);
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), loc.click()]);
    const file = path.join(saved, key + '-' + download.suggestedFilename());
    await download.saveAs(file);
    return { name: download.suggestedFilename(), file };
  };
  const results = [];
  for (const kind of Object.keys(DIAGRAM_LANGUAGES)){
    const i = drawn.findIndex(d => d.kind === kind);
    if (i < 0) continue;
    try {
      const src = await grab(i, 'a');
      const problem = src.name !== names[i] + KINDS[kind].download.ext ? 'named ' + src.name : sourceProblem(drawn[i], fs.readFileSync(src.file, 'utf8'));
      results.push(kind + ' source ' + src.name + (problem ? ': ' + problem : ''));
      check('downloads: the ' + kind + ' source through the browser, ' + src.name + ', is the block\'s text' + (drawn[i].laidOut ? ' with its diagram part' : ''), !problem, problem);
    } catch (e){ check('downloads: the ' + kind + ' source through the browser', false, e.message.split('\n')[0]); }
    if (!PICTURED.has(key)) continue;
    try {
      const pic = await grab(i, 'button');
      const svgText = fs.readFileSync(pic.file, 'utf8');
      const alone = await page.context().newPage();
      try {
        await alone.goto(pathToFileURL(pic.file).href);
        const r = await alone.evaluate(() => {
          const svg = document.documentElement, box = svg.getBoundingClientRect();
          const colour = (sel, prop) => { const el = svg.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
          return { root: svg.localName, size: Math.round(box.width) + 'x' + Math.round(box.height), viewBox: svg.getAttribute('viewBox'), width: svg.getAttribute('width'), height: svg.getAttribute('height'), maxWidth: svg.style.maxWidth,
                   colours: { task: colour('.dokufix-bpmn-task > .djs-visual > rect', 'stroke'), sequence: colour('.dokufix-bpmn-sequenceflow > .djs-visual > path', 'stroke'), end: colour('.dokufix-bpmn-endevent > .djs-visual > circle', 'stroke'), label: colour('.dokufix-bpmn-task > .djs-visual > text', 'fill') } };
        });
        await alone.screenshot({ path: pic.file.replace(/\.svg$/, '.png') });
        const box = String(r.viewBox || '').split(/[\s,]+/).map(Number);
        const sized = box.length === 4 && Number(r.width) === box[2] && Number(r.height) === box[3] && Math.abs(Number(r.size.split('x')[0]) - box[2]) <= 1 && !r.maxWidth;
        const colours = kind === 'bpmn' ? Object.entries(r.colours).filter(([k, v]) => v !== null && v !== BPMN_COLOURS[k]).map(([k, v]) => k + ' ' + v) : [];
        const ok = pic.name === names[i] + '.svg' && r.root === 'svg' && sized && !svgText.includes('var(') && colours.length === 0 && (kind !== 'bpmn' || r.colours.task === BPMN_COLOURS.task);
        results.push(kind + ' picture ' + pic.name);
        check('downloads: the ' + kind + ' picture, ' + pic.name + ', opened alone, renders at the size of its viewBox' + (kind === 'bpmn' ? ', no var( left, in the colours of the document (task stroke ' + BPMN_COLOURS.task + ')' : ', no var( left'),
          ok, json({ name: pic.name, ...r, vars: (svgText.match(/var\(/g) || []).length, colours }));
      } finally { await alone.close(); }
    } catch (e){ check('downloads: the ' + kind + ' picture through the browser', false, e.message.split('\n')[0]); }
  }
  // The source of the first diagram whose title has characters a file name
  // cannot take (the demo text's "Herunterladen: Gebühr 5 %/Tag?", the reference
  // document's "Frist: 2/3 erreicht?"): saved under the name the product gives
  // it, in both browsers (Firefox saves a "%" as "_").
  const odd = drawn.findIndex(d => /[%/?]/.test(d.title));
  if (odd >= 0){
    try {
      const src = await grab(odd, 'a');
      const want = names[odd] + KINDS[drawn[odd].kind].download.ext;
      const problem = src.name !== want ? 'named ' + src.name + ', expected ' + want : sourceProblem(drawn[odd], fs.readFileSync(src.file, 'utf8'));
      results.push('source ' + src.name);
      check('downloads: the source of "' + drawn[odd].title + '" through the browser is saved as ' + want + ' and is the block\'s text', !problem, problem);
    } catch (e){ check('downloads: the source of "' + drawn[odd].title + '" through the browser', false, e.message.split('\n')[0]); }
  }
  // A click on them opened no view.
  const open = await page.evaluate(() => Array.from(document.querySelectorAll('.dokufix-diagram-toggle')).filter(t => t.checked).length);
  check('downloads: the clicks on source and picture opened no large view', open === 0, open, results.join('; '));
  // With the view open the line lies under it, not in it.
  if (drawn.length){
    const covered = await page.evaluate(() => {
      const fig = document.querySelector('figure.dokufix-diagram'), line = fig && fig.querySelector(':scope > .dokufix-diagram-downloads');
      if (!line || !fig.querySelector('.dokufix-diagram-toggle')) return { line: false };
      fig.querySelector('.dokufix-diagram-toggle').checked = true;
      const r = line.getBoundingClientRect(), view = fig.querySelector('.dokufix-diagram-view');
      const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
      const top = document.elementFromPoint(x, y);
      const out = { inView: view.contains(line), onTop: !!top && line.contains(top), viewOnTop: !!top && view.contains(top) };
      fig.querySelector('.dokufix-diagram-toggle').checked = false;
      return out;
    });
    check('downloads: with the large view open the line is not in it and lies beneath it', !covered.inView && !covered.onTop && covered.viewOnTop, json(covered));
  }
}

// The large view of a diagram (story 2.9), in every variant: a click on a
// diagram opens it over the whole window, with its title, the zoom steps and
// "Schließen", at "Einpassen", and the page behind does not scroll; the steps
// give 1, 1.5 and 2 times the width as drawn, "Einpassen" the whole diagram
// at most at 150 %; "Schließen" and a second click close it. Tab reaches the
// diagram with a focus ring, Space opens it, the arrows choose a step and
// Space on its checkbox closes it. Where a script runs, Escape closes the view
// and nothing else, also before an open search panel, "+" and "-" change the
// step, held at the ends, and "/" opens no search over it; in nur-lesen
// these keys do nothing. In the editor file: in edit mode the view lies over
// the toolbar and the preview pane does not scroll behind it, and a render
// closes it. In print there is no control and the diagram stands in the
// column. Every file opens with every view closed, at "Einpassen", although
// each was written with a view open at "150 %" (buildExports()).
const STEP_TEXTS = ['Einpassen', '100 %', '150 %', '200 %'];
async function assertLargeView(page, check, exp, key){
  const drawn = exp.diagrams.filter(d => d.drawn);
  const json = JSON.stringify;
  const editor = key === 'mit-editor';
  const scripted = key !== 'nur-lesen';
  const ROOT_SEL = editor ? '#preview' : 'main.reader-body';
  const FIG = ROOT_SEL + ' figure.dokufix-diagram';
  const reset = async () => {
    await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement) document.activeElement.blur(); });
    await frames(page);
  };
  await reset();
  // --- as the file opens: every figure with its controls, every view closed, at "Einpassen"; a warning has none
  const start = await page.evaluate(sel => {
    const figures = Array.from(document.querySelectorAll(sel));
    return {
      figures: figures.length,
      closed: figures.filter(f => { const t = f.querySelector(':scope > .dokufix-diagram-toggle'); return t && !t.checked; }).length,
      fit: figures.filter(f => { const z = f.querySelector(':scope > .dokufix-diagram-zoom:checked'); return z && z.value === 'fit'; }).length,
      inWarnings: document.querySelectorAll('.dokufix-warning :is(.dokufix-diagram-toggle, .dokufix-diagram-zoom, .dokufix-diagram-view)').length,
      page: getComputedStyle(document.documentElement).overflow,
    };
  }, FIG);
  check('large view: every figure has its controls, and the file opens with every view closed, at "Einpassen"; no warning carries a control of one',
    start.figures === drawn.length && start.closed === drawn.length && start.fit === drawn.length && start.inWarnings === 0 && start.page === 'visible', json(start));
  // A file without the controls (one from before story 2.9) has failed here, and nothing below can run.
  if (!drawn.length || start.closed !== drawn.length) return;

  // What the view of the n-th figure is like now.
  const facts = n => page.evaluate(([sel, n]) => {
    const f = document.querySelectorAll(sel)[n];
    const t = f.querySelector(':scope > .dokufix-diagram-toggle'), view = f.querySelector(':scope > .dokufix-diagram-view');
    const bar = view.querySelector('.dokufix-diagram-bar'), stage = view.querySelector('.dokufix-diagram-stage'), svg = stage.querySelector('svg');
    const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const cs = getComputedStyle(view), ss = getComputedStyle(stage);
    const steps = Array.from(view.querySelectorAll('.dokufix-diagram-step'));
    const ring = el => { const c = getComputedStyle(el); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 2; };
    const inView = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && view.contains(e); };
    const vb = svg && svg.viewBox && svg.viewBox.baseVal;
    const s = box(svg);
    const pad = parseFloat(ss.paddingLeft);
    return {
      open: t.checked, openViews: Array.from(document.querySelectorAll('.dokufix-diagram-toggle')).filter(x => x.checked).length,
      zoom: (f.querySelector(':scope > .dokufix-diagram-zoom:checked') || {}).value || null,
      position: cs.position, zIndex: cs.zIndex, view: box(view), window: { width: innerWidth, height: innerHeight },
      // The middle and the corners of the window, and the middle of the search's magnifier where it is shown (story 5.10).
      onTop: [[innerWidth / 2, innerHeight / 2], [innerWidth - 8, 8], [8, innerHeight - 8], [innerWidth - 8, innerHeight - 8],
        ...Array.from(document.querySelectorAll('body > .search-magnifier')).filter(m => m.getClientRects().length).map(m => { const r = m.getBoundingClientRect(); return [(r.left + r.right) / 2, (r.top + r.bottom) / 2]; })].every(([x, y]) => inView(x, y)),
      bar: getComputedStyle(bar).display, name: (bar.querySelector('.dokufix-diagram-name') || {}).textContent, title: f.getAttribute('aria-label'),
      steps: steps.map(s => s.textContent), close: (bar.querySelector('.dokufix-diagram-close') || {}).textContent,
      chosen: steps.filter(s => getComputedStyle(s).backgroundColor === 'rgb(28, 28, 30)').map(s => s.textContent),
      rings: { stage: ring(stage), close: ring(bar.querySelector('.dokufix-diagram-close')), steps: steps.map(ring) },
      focus: document.activeElement === t ? 'toggle' : (document.activeElement && document.activeElement.classList.contains('dokufix-diagram-zoom') && f.contains(document.activeElement) ? 'zoom ' + document.activeElement.value : (document.activeElement || {}).tagName),
      svg: s, inner: box(stage) && { left: box(stage).left + pad, top: box(stage).top + pad, right: box(stage).left + stage.clientWidth - pad, bottom: box(stage).top + stage.clientHeight - pad },
      scrolls: { x: stage.scrollWidth > stage.clientWidth + 1, y: stage.scrollHeight > stage.clientHeight + 1 },
      width: parseFloat(getComputedStyle(f).getPropertyValue('--dokufix-diagram-width')) || 0,
      viewBox: vb ? [vb.width, vb.height] : null,
      page: { overflow: getComputedStyle(document.documentElement).overflow, scrollY: Math.round(scrollY) },
      preview: document.getElementById('preview') ? { overflow: getComputedStyle(document.getElementById('preview')).overflowY, scrollTop: Math.round(document.getElementById('preview').scrollTop) } : null,
      search: !!document.querySelector('body > .search-panel:not([hidden])'),
      read: document.body.classList.contains('mode-view'),
      header: (() => { const h = document.querySelector('body > header'); if (!h || !h.getClientRects().length) return null; const r = h.getBoundingClientRect(); return inView(r.left + r.width / 2, r.top + r.height / 2); })(),
    };
  }, [FIG, n]);
  const n = 0;
  const STAGE = page.locator(FIG).nth(n).locator('.dokufix-diagram-stage');
  const step = async k => { await page.locator(FIG).nth(n).locator('.dokufix-diagram-step').nth(k).click(); await frames(page); return facts(n); };
  const press = async k => { await page.keyboard.press(k); await frames(page); return facts(n); };
  const fullWindow = f => f.position === 'fixed' && f.zIndex === '100' && Math.abs(f.view.left) < 1 && Math.abs(f.view.top) < 1 && Math.abs(f.view.right - f.window.width) < 1 && Math.abs(f.view.bottom - f.window.height) < 1;
  const inside = (a, b) => !!a && !!b && a.left >= b.left - 1 && a.top >= b.top - 1 && a.right <= b.right + 1 && a.bottom <= b.bottom + 1;
  const near = (a, b) => Math.abs(a - b) <= 1;
  // Every view closed and back at "Einpassen", by the properties, as a file opens.
  const close = async () => {
    await page.evaluate(sel => {
      for (const f of document.querySelectorAll(sel)){
        f.querySelector(':scope > .dokufix-diagram-toggle').checked = false;
        f.querySelector(':scope > .dokufix-diagram-zoom[value="fit"]').checked = true;
      }
    }, FIG);
    await frames(page);
  };

  // Whether "/" reached the end of its way prevented: Firefox opens its quick find on one that is not.
  const slashPrevented = async () => {
    await page.evaluate(() => { window.vergleichSlash = null; window.addEventListener('keydown', e => { if (e.key === '/') window.vergleichSlash = e.defaultPrevented; }, { once: true }); });
    const f = await press('/');
    return { ...f, prevented: await page.evaluate(() => window.vergleichSlash) };
  };
  // A click low on the tallest diagram while its top lies above the window
  // (in a window 400 px high), opening it, and the same click closing it:
  // the mouse alone, so nothing but the page scrolls the page. The scroller is
  // the page, or the preview pane in edit mode. Returns its scroll position
  // before, with the view open and closed again.
  const lowClick = async inPane => {
    await page.setViewportSize({ width: 1400, height: 400 });
    await frames(page);
    const at = await page.evaluate(([sel, inPane]) => {
      // Where the live viewer runs, a click on a BPMN diagram does not close
      // its view (story 2.11): the tallest of the others.
      const figures = Array.from(document.querySelectorAll(sel)).filter(f => !(document.getElementById('preview') && f.classList.contains('dokufix-diagram-bpmn')));
      const heights = figures.map(f => f.querySelector('.dokufix-diagram-stage').getBoundingClientRect().height);
      const k = heights.indexOf(Math.max(...heights));
      const stage = figures[k].querySelector('.dokufix-diagram-stage');
      const scroller = inPane ? document.getElementById('preview') : document.scrollingElement;
      const edge = inPane ? scroller.getBoundingClientRect().top : 0;
      // The top of the figure 120 px above the scroller's upper edge.
      scroller.scrollTop += figures[k].getBoundingClientRect().top - edge + 120;
      const r = stage.getBoundingClientRect();
      return { k, x: r.left + r.width / 2, y: Math.min(r.bottom - 10, innerHeight - 10), height: Math.round(r.height), above: Math.round(edge - figures[k].getBoundingClientRect().top) };
    }, [FIG, inPane]);
    await frames(page);
    const where = () => page.evaluate(inPane => Math.round(inPane ? document.getElementById('preview').scrollTop : scrollY), inPane);
    const before = await where();
    await page.mouse.click(at.x, at.y);
    await frames(page);
    const open = { at: await where(), views: await page.evaluate(() => Array.from(document.querySelectorAll('.dokufix-diagram-toggle')).filter(t => t.checked).length) };
    await page.mouse.click(at.x, at.y);
    await frames(page);
    const closed = { at: await where(), views: await page.evaluate(() => Array.from(document.querySelectorAll('.dokufix-diagram-toggle')).filter(t => t.checked).length) };
    await close();
    await page.setViewportSize({ width: 1400, height: 1000 });
    await frames(page);
    return { at, before, open, closed };
  };
  const unmoved = r => r.at.above === 120 && r.at.y > 0 && r.open.views === 1 && r.closed.views === 0 && r.open.at === r.before && r.closed.at === r.before;

  // --- open by mouse
  await STAGE.scrollIntoViewIfNeeded();
  const before = await facts(n);
  await STAGE.click();
  await frames(page);
  const opened = await facts(n);
  check('large view: a click on the diagram opens it over the whole window, above everything else: its title in the bar, the steps ' + json(STEP_TEXTS) + ', "Schließen", at "Einpassen"',
    !before.open && opened.open && opened.openViews === 1 && fullWindow(opened) && opened.onTop && opened.bar === 'flex' && opened.name === opened.title && opened.title === drawn[n].title &&
      json(opened.steps) === json(STEP_TEXTS) && opened.close === 'Schließen' && opened.zoom === 'fit' && json(opened.chosen) === json(['Einpassen']),
    json({ ...opened, svg: undefined, inner: undefined }));
  // Fit: the whole diagram inside the stage, in width and height, never larger than 150 %.
  const scale = f => f.viewBox && f.svg ? Math.min(f.svg.width / f.viewBox[0], f.svg.height / f.viewBox[1]) : 0;
  const most = f => f.viewBox && f.width ? 1.5 * f.width / f.viewBox[0] : 0;
  check('large view, "Einpassen": the whole diagram is visible in width and height, at most at 150 % of its width as drawn',
    inside(opened.svg, opened.inner) && !opened.scrolls.x && !opened.scrolls.y && opened.width > 0 && scale(opened) > 0 && scale(opened) <= most(opened) + 0.005,
    json({ svg: round(opened.svg), stage: round(opened.inner), scale: scale(opened), most: most(opened), width: opened.width, viewBox: opened.viewBox }));
  // The page behind does not scroll.
  await page.mouse.move(opened.window.width / 2, opened.window.height / 2);
  await page.mouse.wheel(0, 800);
  await frames(page);
  const wheeled = await facts(n);
  check('large view: the page behind it does not scroll, by the wheel either', opened.page.overflow === 'hidden' && wheeled.page.scrollY === before.page.scrollY && opened.page.scrollY === before.page.scrollY,
    json({ before: before.page, opened: opened.page, wheeled: wheeled.page }));

  // --- the zoom steps by mouse
  const z100 = await step(1), z150 = await step(2), z200 = await step(3);
  const zoomed = [[z100, 1], [z150, 1.5], [z200, 2]].map(([f, k]) => ({ zoom: f.zoom, chosen: f.chosen.join(), width: Math.round(f.svg.width * 10) / 10, want: Math.round(f.width * k * 10) / 10, scrolls: f.scrolls.x, wider: f.svg.width > f.inner.right - f.inner.left + 1 }));
  check('large view: "100 %", "150 %" and "200 %" draw the diagram at 1, 1.5 and 2 times its width as drawn, and the view scrolls where it is larger',
    json(zoomed.map(z => [z.zoom, z.chosen])) === json([['100', '100 %'], ['150', '150 %'], ['200', '200 %']]) && zoomed.every(z => near(z.width, z.want) && z.scrolls === z.wider) && zoomed[2].wider,
    json(zoomed));
  const fitAgain = await step(0);
  check('large view: "Einpassen" again fits it', fitAgain.zoom === 'fit' && inside(fitAgain.svg, fitAgain.inner), json({ zoom: fitAgain.zoom, svg: round(fitAgain.svg) }));

  // --- the keys
  if (scripted){
    const plus = [];
    for (let i = 0; i < 4; i++) plus.push((await press('+')).zoom);
    const minus = [];
    for (let i = 0; i < 4; i++) minus.push((await press('-')).zoom);
    const modified = [];
    for (const mod of ['ctrlKey', 'altKey', 'metaKey']){
      await page.evaluate(m => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '+', [m]: true, bubbles: true, cancelable: true })), mod);
      modified.push((await facts(n)).zoom);
    }
    check('large view: "+" and "-" choose the next and the previous step, held at the ends; with Ctrl, Alt or Meta they do nothing',
      json(plus) === json(['100', '150', '200', '200']) && json(minus) === json(['150', '100', 'fit', 'fit']) && json(modified) === json(['fit', 'fit', 'fit']), json({ plus, minus, modified }));
    const slash = await slashPrevented();
    check('large view: "/" opens no search over it, and the browser\'s own "/" is held back', slash.open && !slash.search && slash.prevented === true, json({ open: slash.open, search: slash.search, prevented: slash.prevented }));
    // Should it have opened one, it is closed again, so the run goes on.
    await page.evaluate(() => { const p = document.querySelector('body > .search-panel'); if (p && !p.hidden) p.querySelector('.search-close').click(); });
    await press('+');
    const esc = await press('Escape');
    check('large view: Escape closes it and nothing else' + (editor ? ': read mode stays' : '') + '; the page scrolls again where it was',
      !esc.open && esc.page.overflow === 'visible' && esc.page.scrollY === before.page.scrollY && (!editor || esc.read), json({ open: esc.open, page: esc.page, read: esc.read }));
    if (editor){
      const next = await press('Escape');
      check('large view: the next Escape leaves read mode', !next.read, json({ read: next.read }));
      await close();
      if (!next.read){
        await page.click('#view-btn');
        await page.waitForFunction(() => document.body.classList.contains('mode-view'));
      }
      await reset();
    }
    // An open search panel: the view closes first, then the panel.
    await close();
    await STAGE.scrollIntoViewIfNeeded();
    await page.keyboard.press('/');
    await frames(page);
    await STAGE.click({ position: { x: 12, y: 12 } });
    await frames(page);
    const both = await facts(n);
    const first = await press('Escape');
    const second = await press('Escape');
    check('large view: with the search panel open as well, the first Escape closes the view, the second the panel' + (editor ? ', and read mode stays' : ''),
      both.open && both.search && !first.open && first.search && !second.search && (!editor || second.read), json({ both: [both.open, both.search], first: [first.open, first.search], second: [second.open, second.search, second.read] }));
    // Whatever is left open is closed, and the editor is back in read mode, so the run goes on.
    await page.evaluate(() => { const p = document.querySelector('body > .search-panel'); if (p && !p.hidden) p.querySelector('.search-close').click(); });
    if (editor && !second.read){
      await close();
      await page.click('#view-btn');
      await page.waitForFunction(() => document.body.classList.contains('mode-view'));
    }
  } else {
    const keys = [(await press('+')).zoom, (await press('Escape')).open];
    check('large view in nur-lesen, without a script: "+" and Escape do nothing, the view stays open at its step', json(keys) === json(['fit', true]), json(keys));
  }
  await close();
  await reset();

  // --- closing by mouse: "Schließen", and a second click on the diagram
  await STAGE.click();
  await frames(page);
  await page.locator(FIG).nth(n).locator('.dokufix-diagram-close').click();
  await frames(page);
  const byClose = await facts(n);
  await STAGE.click();
  await frames(page);
  await STAGE.click();
  await frames(page);
  const byStage = await facts(n);
  check('large view: "Schließen" closes it, and so does a second click on the diagram', !byClose.open && !byStage.open && byStage.page.overflow === 'visible', json({ byClose: byClose.open, byStage: byStage.open, page: byStage.page }));
  // --- the click itself scrolls nothing: low on a diagram whose top is above the window
  await reset();
  const low = await lowClick(false);
  check('large view: a click low on a diagram whose top lies above the window opens it, and a second click closes it, and the page stays where it was',
    unmoved(low), json(low));
  await reset();

  // --- the keyboard: Tab to the diagram, Space, the arrows, Space on the checkbox
  await close();
  await reset();
  await page.locator(FIG).nth(n).locator('.dokufix-diagram-toggle').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await frames(page);
  const tabbed = await facts(n);
  const spaced = await press(' ');
  const tabIn = await press('Tab');
  const arrow = await press('ArrowRight');
  // Where a script runs, "+" and "-" take the focus of a step along.
  let keyed = null;
  if (scripted){
    const plus = await press('+'), right = await press('ArrowRight'), minus = await press('-');
    keyed = [plus, right, minus].map(f => ({ zoom: f.zoom, focus: f.focus, rings: f.rings.steps }));
    check('large view by keyboard: "+" and "-" move the focus of a step with the step chosen, so an arrow goes on from there, the ring on its label',
      json(keyed) === json([{ zoom: '150', focus: 'zoom 150', rings: [false, false, true, false] }, { zoom: '200', focus: 'zoom 200', rings: [false, false, false, true] }, { zoom: '150', focus: 'zoom 150', rings: [false, false, true, false] }]),
      json(keyed));
  }
  const back = await press('Shift+Tab');
  const shut = await press(' ');
  check('large view by keyboard: Tab reaches the diagram, with a focus ring on it; Space opens it, the ring on "Schließen"; Tab goes to the steps and an arrow chooses the next, the ring on its label; Space on the checkbox closes it',
    tabbed.focus === 'toggle' && !tabbed.open && tabbed.rings.stage &&
      spaced.open && spaced.focus === 'toggle' && spaced.rings.close && !spaced.rings.stage &&
      tabIn.focus === 'zoom fit' && tabIn.rings.steps[0] &&
      arrow.zoom === '100' && arrow.focus === 'zoom 100' && arrow.rings.steps[1] && !arrow.rings.steps[0] &&
      back.focus === 'toggle' && back.open && !shut.open && shut.focus === 'toggle' && shut.rings.stage,
    json([tabbed, spaced, tabIn, arrow, back, shut].map(f => ({ open: f.open, zoom: f.zoom, focus: f.focus, rings: f.rings }))));
  await close();
  await reset();

  // --- print: no control, the diagram in the column
  await STAGE.click();
  await frames(page);
  await page.emulateMedia({ media: 'print' });
  await frames(page);
  const printed = await page.evaluate(sel => {
    const f = document.querySelector(sel);
    const shown = el => el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    const svg = f.querySelector('svg').getBoundingClientRect(), fig = f.getBoundingClientRect();
    return { position: getComputedStyle(f.querySelector('.dokufix-diagram-view')).position, controls: Array.from(f.querySelectorAll('input, .dokufix-diagram-bar')).filter(shown).length,
             inColumn: svg.width > 0 && svg.left >= fig.left - 1 && svg.right <= fig.right + 1, page: getComputedStyle(document.documentElement).overflow };
  }, FIG);
  await page.emulateMedia({ media: null });
  await close();
  check('large view in print, open: no control is printed, and the diagram stands in the column', printed.position === 'static' && printed.controls === 0 && printed.inColumn && printed.page === 'visible', json(printed));

  // --- the editor file in edit mode: over the toolbar, the pane does not scroll; a render closes it
  if (editor){
    await page.click('#edit-btn');
    await frames(page);
    await STAGE.scrollIntoViewIfNeeded();
    const paneBefore = await facts(n);
    await STAGE.click();
    await frames(page);
    const edit = await facts(n);
    await page.mouse.move(edit.window.width / 2, edit.window.height / 2);
    await page.mouse.wheel(0, 800);
    await frames(page);
    const editWheeled = await facts(n);
    check('large view in edit mode: over the whole window, the toolbar included; the preview pane does not scroll behind it',
      edit.open && fullWindow(edit) && edit.onTop && edit.header === true && edit.preview.overflow === 'hidden' && editWheeled.preview.scrollTop === paneBefore.preview.scrollTop && editWheeled.page.scrollY === 0,
      json({ header: edit.header, preview: [paneBefore.preview, edit.preview, editWheeled.preview], page: editWheeled.page }));
    const editSlash = await slashPrevented();
    check('large view in edit mode: "/" opens no search over it, and the browser\'s own "/" is held back', editSlash.open && !editSlash.search && editSlash.prevented === true,
      json({ open: editSlash.open, search: editSlash.search, prevented: editSlash.prevented }));
    const editEsc = await press('Escape');
    check('large view in edit mode: Escape closes it, and edit mode stays', !editEsc.open && !editEsc.read && editEsc.preview.overflow === 'auto', json({ open: editEsc.open, read: editEsc.read, preview: editEsc.preview }));
    // The download menu, open in edit mode: Escape closes it, and edit mode stays (story 5.9).
    await page.click('#download-btn');
    const menu = () => page.evaluate(() => ({ open: document.getElementById('download-wrap').classList.contains('open'), read: document.body.classList.contains('mode-view') }));
    const menuOpen = await menu();
    await page.keyboard.press('Escape');
    const menuEsc = await menu();
    check('download menu in edit mode: Escape closes it, and edit mode stays', menuOpen.open && !menuEsc.open && !menuEsc.read, json({ menuOpen, menuEsc }));
    // The click itself scrolls nothing in the pane either.
    const paneLow = await lowClick(true);
    check('large view in edit mode: a click low on a diagram whose top lies above the pane opens it, and a second click closes it, and the pane stays where it was',
      unmoved(paneLow), json(paneLow));
    // A render while it is open: Ctrl+Enter in the source.
    await STAGE.click();
    await frames(page);
    const openForRender = await facts(n);
    await page.evaluate(() => {
      const marker = document.createElement('i');
      marker.id = 'vergleich-render-pending';
      document.getElementById('dokufix-rail').appendChild(marker);
    });
    await page.focus('#source');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => !document.getElementById('vergleich-render-pending'), null, { timeout: 90000 });
    await page.waitForFunction(n => document.querySelectorAll('#preview figure.dokufix-diagram .dokufix-diagram-svg > svg').length >= n, drawn.length, { timeout: 90000 }).catch(() => {});
    await frames(page);
    const rendered = await facts(n);
    check('large view: a render while it is open (Ctrl+Enter) replaces the figure, and the view is closed and the pane scrolls again',
      openForRender.open && !rendered.open && rendered.openViews === 0 && rendered.preview.overflow === 'auto' && rendered.page.overflow === 'visible',
      json({ before: openForRender.open, after: rendered.open, views: rendered.openViews, preview: rendered.preview, page: rendered.page }));
    await page.click('#view-btn');
    await page.waitForFunction(() => document.body.classList.contains('mode-view'));
  }
  await reset();
}

// The large view with scripts off, in nur-lesen and schlank: a click opens it
// over the window, a step label chooses its zoom, "Schließen" closes it. In
// schlank the diagram stays packed: the view shows the notice in its place.
async function assertLargeViewWithoutScripts(browser, file, check, exp, key){
  const drawn = exp.diagrams.filter(d => d.drawn);
  if (!drawn.length) return;
  const context = await openContext(browser, { viewport: { width: 1400, height: 1000 }, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(file).href);
    const FIG = 'main.reader-body figure.dokufix-diagram';
    if (!await page.locator(FIG + ' .dokufix-diagram-stage').count()){
      check('large view with scripts off: the figure has the controls of its large view', false, 'none');
      return;
    }
    const facts = () => page.evaluate(sel => {
      const f = document.querySelector(sel), view = f.querySelector('.dokufix-diagram-view'), holder = view.querySelector('.dokufix-diagram-svg');
      const r = view.getBoundingClientRect(), svg = holder.querySelector('svg');
      const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return { open: f.querySelector('.dokufix-diagram-toggle').checked, zoom: f.querySelector('.dokufix-diagram-zoom:checked').value,
               full: getComputedStyle(view).position === 'fixed' && Math.abs(r.width - innerWidth) < 1 && Math.abs(r.height - innerHeight) < 1 && !!e && view.contains(e),
               notice: holder.hasAttribute('data-gz') ? getComputedStyle(holder, '::before').content : null,
               svg: svg ? Math.round(svg.getBoundingClientRect().width) : 0, width: parseFloat(getComputedStyle(f).getPropertyValue('--dokufix-diagram-width')) || 0,
               page: getComputedStyle(document.documentElement).overflow };
    }, FIG);
    const stage = page.locator(FIG).first().locator('.dokufix-diagram-stage');
    await stage.click();
    const opened = await facts();
    await page.locator(FIG).first().locator('.dokufix-diagram-step').nth(2).click();
    const zoomed = await facts();
    await page.locator(FIG).first().locator('.dokufix-diagram-close').click();
    const closed = await facts();
    const shows = key === 'schlank'
      ? opened.notice === '"[Diagramm — JavaScript erforderlich, um es anzuzeigen]"'
      : opened.notice === null && Math.abs(zoomed.svg - 1.5 * zoomed.width) <= 1;
    check('large view with scripts off: a click opens it over the window' + (key === 'schlank' ? ', with the notice in place of the packed diagram' : '') + '; "150 %" chooses its step; "Schließen" closes it',
      opened.open && opened.full && opened.zoom === 'fit' && opened.page === 'hidden' && shows && zoomed.zoom === '150' && !closed.open && closed.page === 'visible',
      JSON.stringify({ opened, zoomed, closed }));
  } finally {
    await context.close();
  }
}

// The live viewer in the large view of a BPMN diagram (story 2.11). In the
// editor (key "editor": the page that wrote the files, in edit mode) and in
// a `Mit Editor` file (read mode): opening a BPMN diagram starts bpmn-js in a
// transient container before the stage, which it hides; the logo of the
// library is visible and on top; the hint stands in the bar; the viewer draws
// the elements of the picture, with its classes and colours, the laid-out
// diagram where the author wrote no coordinates. "150 %" gives scale 1.5,
// "+" the next step, the same step chosen again applies again; Ctrl+wheel
// raises the scale, a drag moves the diagram, and neither closes the view;
// in Chromium one finger moves it and two zoom it (liveViewerTouch()).
// "Schließen", Escape and Space on the checkbox close it and leave nothing of
// it: no container, no hint, no lightbox of the logo, no cursor class on
// <body>; so does a render while it is open. A Mermaid diagram keeps the
// static view. In the editor, files written with the viewer open carry
// nothing of it. In a read-only file nothing of a viewer starts.
const LIVE_HINT_TEXT = 'Strg + Mausrad: zoomen · Ziehen: verschieben';
// Text of a file without its scripts and styles, which name these classes as code.
const markup = text => text.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/g, '');
const VIEWER_TRACES = /dokufix-diagram-live|dokufix-diagram-hint|djs-container|bjs-container|bjs-powered-by|djs-cursor-/;
async function assertLiveViewer(page, check, exp, key, opts = {}){
  const json = JSON.stringify;
  const scripted = key === 'editor' || key === 'mit-editor';
  const ROOT_SEL = scripted ? '#preview' : 'main.reader-body';
  const drawn = exp.diagrams.filter(d => d.drawn);
  const bpmnAt = drawn.map((d, i) => d.kind === 'bpmn' ? i : -1).filter(i => i >= 0);
  const mermaidAt = drawn.findIndex(d => d.kind === 'mermaid');
  const FIG = ROOT_SEL + ' figure.dokufix-diagram';
  const fig = i => page.locator(FIG).nth(i);
  // What is left of any viewer in the whole page.
  const leftovers = () => page.evaluate(() => ({
    live: document.querySelectorAll('.dokufix-diagram-live').length, hint: document.querySelectorAll('.dokufix-diagram-hint').length,
    containers: document.querySelectorAll('.djs-container, .bjs-container').length, lightbox: document.querySelectorAll('.bjs-powered-by-lightbox').length,
    cursor: Array.from(document.body.classList).filter(c => /^djs-cursor-/.test(c)),
    open: Array.from(document.querySelectorAll('.dokufix-diagram-toggle')).filter(t => t.checked).length,
  }));
  const clean = l => l.live === 0 && l.hint === 0 && l.containers === 0 && l.lightbox === 0 && l.cursor.length === 0 && l.open === 0;
  const openStage = async i => {
    await fig(i).locator('.dokufix-diagram-stage').scrollIntoViewIfNeeded();
    await fig(i).locator('.dokufix-diagram-stage').click();
    await frames(page);
  };
  const closeByButton = async i => { await fig(i).locator('.dokufix-diagram-close').click(); await frames(page); };
  // The static view of the i-th figure: open, its picture shown, no viewer.
  const staticView = i => page.evaluate(([sel, i]) => {
    const f = document.querySelectorAll(sel)[i], stage = f.querySelector('.dokufix-diagram-stage');
    return { open: f.querySelector('.dokufix-diagram-toggle').checked, stage: getComputedStyle(stage).display, picture: stage.querySelector('svg').getBoundingClientRect().width > 0,
             live: document.querySelectorAll('.dokufix-diagram-live, .djs-container').length, hint: document.querySelectorAll('.dokufix-diagram-hint').length };
  }, [FIG, i]);
  const isStatic = s => s.open && s.stage === 'block' && s.picture && s.live === 0 && s.hint === 0;

  if (!scripted){
    if (!bpmnAt.length) return;
    await openStage(bpmnAt[0]);
    await page.waitForTimeout(300);
    const s = await staticView(bpmnAt[0]);
    await closeByButton(bpmnAt[0]);
    check('live viewer: none in a read-only file; a BPMN diagram opens in the static view of story 2.9', isStatic(s), json(s));
    return;
  }

  // --- a Mermaid diagram keeps the static view
  if (mermaidAt >= 0){
    await openStage(mermaidAt);
    await page.waitForTimeout(300);
    const s = await staticView(mermaidAt);
    await closeByButton(mermaidAt);
    check('live viewer: a Mermaid diagram opens in the static view, without a viewer', isStatic(s) && clean(await leftovers()), json(s));
  }
  if (!bpmnAt.length) return;

  // The viewer of the i-th figure once it is ready: the hint is put into the bar last.
  const ready = i => page.waitForFunction(([sel, i]) => !!document.querySelectorAll(sel)[i].querySelector('.dokufix-diagram-hint'), [FIG, i], { timeout: 20000 });
  const viewer = i => page.evaluate(([sel, i]) => {
    const f = document.querySelectorAll(sel)[i];
    const live = f.querySelector('.dokufix-diagram-live'), stage = f.querySelector('.dokufix-diagram-stage');
    const g = live && live.querySelector('.djs-container > svg > g.viewport');
    const m = g ? (g.getAttribute('transform') || '').match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) || [] : [];
    const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return { open: f.querySelector('.dokufix-diagram-toggle').checked, zoom: f.querySelector('.dokufix-diagram-zoom:checked').value,
             scale: m.length >= 6 ? Math.round(Number(m[0]) * 1000) / 1000 : null, x: m.length >= 6 ? Number(m[4]) : null, y: m.length >= 6 ? Number(m[5]) : null,
             live: live ? box(live) : null, drawing: g ? box(g) : null, centre: live ? [box(live).left + box(live).width / 2, box(live).top + box(live).height / 2] : null,
             stage: getComputedStyle(stage).display };
  }, [FIG, i]);
  // Everything about a viewer just opened, against the picture beside it.
  const opened = i => page.evaluate(([sel, i]) => {
    const f = document.querySelectorAll(sel)[i];
    const live = f.querySelector('.dokufix-diagram-live'), stage = f.querySelector('.dokufix-diagram-stage'), picture = stage.querySelector('.dokufix-diagram-svg svg');
    const hint = f.querySelector('.dokufix-diagram-hint');
    const logo = live && live.querySelector('.bjs-powered-by'), r = logo && logo.getBoundingClientRect();
    const top = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const ids = root => Array.from(root.querySelectorAll('g.djs-element[data-element-id]')).map(g => g.getAttribute('data-element-id')).sort();
    const classes = root => Array.from(root.querySelectorAll('[class*="dokufix-bpmn-"]')).map(e => e.getAttribute('data-element-id') + ':' + Array.from(e.classList).filter(c => c.startsWith('dokufix-bpmn-')).join('+')).sort();
    // Every fill and stroke as computed, per element and part, in both.
    const paints = root => Array.from(root.querySelectorAll('g.djs-element[data-element-id] > .djs-visual > *')).map(e => {
      const c = getComputedStyle(e);
      return e.closest('[data-element-id]').getAttribute('data-element-id') + ' ' + e.tagName + ' ' + c.fill + ' ' + c.stroke;
    }).sort();
    const liveIds = live ? ids(live) : [], pictureIds = ids(picture);
    const livePaints = live ? paints(live) : [], picturePaints = paints(picture);
    return {
      container: !!live && live.hasAttribute('data-dokufix-transient') && live.nextElementSibling === stage && live.parentElement === f.querySelector('.dokufix-diagram-view'),
      viewer: !!live && !!live.querySelector('.djs-container svg g.viewport'), stage: getComputedStyle(stage).display,
      logo: !!r && r.width > 10 && r.height > 5 && r.bottom <= innerHeight && r.right <= innerWidth && !!top && logo.contains(top) && getComputedStyle(logo).visibility === 'visible' && getComputedStyle(logo).opacity === '1',
      hint: hint ? [hint.textContent, hint.hasAttribute('data-dokufix-transient'), hint.parentElement.classList.contains('dokufix-diagram-bar'), hint.getBoundingClientRect().width > 0] : null,
      elements: [liveIds.length, pictureIds.length], sameElements: liveIds.join() === pictureIds.join(),
      sameClasses: live ? classes(live).join() === classes(picture).join() : false,
      paints: livePaints.length, otherPaints: livePaints.filter((p, k) => p !== picturePaints[k]).slice(0, 3).concat(picturePaints.length !== livePaints.length ? ['counts ' + livePaints.length + ' / ' + picturePaints.length] : []),
    };
  }, [FIG, i]);

  // --- every BPMN diagram opens in the viewer, the one in it the picture's
  const problems = [];
  for (const i of bpmnAt){
    await openStage(i);
    try { await ready(i); } catch { problems.push(drawn[i].title + ': no viewer'); await closeByButton(i); continue; }
    const o = await opened(i), v = await viewer(i);
    const inside = !!v.drawing && v.drawing.left >= v.live.left - 1 && v.drawing.top >= v.live.top - 1 && v.drawing.right <= v.live.right + 1 && v.drawing.bottom <= v.live.bottom + 1;
    if (!(o.container && o.viewer && o.stage === 'none' && o.logo && json(o.hint) === json([LIVE_HINT_TEXT, true, true, true]) && o.sameElements && o.elements[0] > 0 && o.sameClasses && o.paints > 0 && !o.otherPaints.length
          && v.zoom === 'fit' && v.scale > 0 && v.scale <= 1.5 && inside))
      problems.push(drawn[i].title + (drawn[i].laidOut ? ' (laid out)' : '') + ': ' + json({ ...o, zoom: v.zoom, scale: v.scale, inside }));
    await closeByButton(i);
    const l = await leftovers();
    if (!clean(l)) problems.push(drawn[i].title + ', after "Schließen": ' + json(l));
  }
  check('live viewer: every BPMN diagram opens in bpmn-js, in a transient container before the stage, which it hides; the logo visible and on top; the hint "' + LIVE_HINT_TEXT + '" in the bar; '
    + 'the elements, classes and colours of the picture (the laid-out diagram where there were no coordinates); at "Einpassen" the whole diagram, at most at 150 %; "Schließen" leaves nothing of it (' + bpmnAt.length + ' diagrams)',
    problems.length === 0, problems.join(' | '));

  // A file without the viewer (one from before story 2.11) has failed here, and nothing below can run.
  if (problems.some(p => p.endsWith(': no viewer'))) return;
  // --- a narrow window: "Schließen" stays fully inside it, the hint gives way
  await openStage(bpmnAt[0]);
  await ready(bpmnAt[0]);
  await page.setViewportSize({ width: 420, height: 800 });
  await frames(page);
  const narrow = await page.evaluate(([sel, i]) => {
    const f = document.querySelectorAll(sel)[i], r = f.querySelector('.dokufix-diagram-close').getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { close: [Math.round(r.left), Math.round(r.right), Math.round(r.top), Math.round(r.bottom)], window: [innerWidth, innerHeight],
             inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && r.width > 0, onTop: !!top && f.querySelector('.dokufix-diagram-close').contains(top) };
  }, [FIG, bpmnAt[0]]);
  await closeByButton(bpmnAt[0]).catch(() => {});
  const narrowClosed = await leftovers();
  await page.setViewportSize({ width: 1400, height: 1000 });
  await frames(page);
  check('live viewer in a window 420 px wide: "Schließen" stands fully inside the window, on top, and closes the view by mouse',
    narrow.inside && narrow.onTop && clean(narrowClosed), json({ narrow, narrowClosed }));
  try {
    await liveViewerUse(page, check, key, opts, { FIG, fig, n: bpmnAt[0], openStage, ready, viewer, leftovers, clean });
  } catch (e){
    check('live viewer: the checks of its use ran to their end', false, String(e && e.message || e).split('\n')[0]);
  }
}

// The use of the live viewer of the first BPMN diagram: steps, wheel, drag,
// click, keys, the logo, a render, and in the editor two files written while
// it is open. See assertLiveViewer().
async function liveViewerUse(page, check, key, opts, { FIG, fig, n, openStage, ready, viewer, leftovers, clean }){
  const json = JSON.stringify;
  const step = async k => { await fig(n).locator('.dokufix-diagram-step').nth(k).click(); await frames(page); return viewer(n); };
  await openStage(n);
  await ready(n);
  const atFit = await viewer(n);
  const s150 = await step(2), s100 = await step(1), s200 = await step(3), sFit = await step(0);
  check('live viewer: "150 %", "100 %", "200 %" and "Einpassen" set the scale of the viewer: 1.5, 1, 2 and that of the opening (to 0.005: the box of the drawing is measured anew each time)',
    s150.scale === 1.5 && s100.scale === 1 && s200.scale === 2 && Math.abs(sFit.scale - atFit.scale) <= 0.005 && sFit.zoom === 'fit', json([atFit, s150, s100, s200, sFit].map(v => [v.zoom, v.scale])));
  const [cx, cy] = sFit.centre;
  await page.mouse.move(cx, cy);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await page.waitForTimeout(150);
  const wheeled = await viewer(n);
  const again = await step(0);
  check('live viewer: Ctrl+wheel raises the scale and the view stays open, the step marked as it was; "Einpassen" chosen again fits it again',
    wheeled.open && wheeled.scale > sFit.scale && wheeled.zoom === 'fit' && Math.abs(again.scale - sFit.scale) <= 0.005, json({ fit: sFit.scale, wheeled: [wheeled.open, wheeled.scale, wheeled.zoom], again: again.scale }));
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 140, cy, { steps: 8 });
  const during = await page.evaluate(() => Array.from(document.body.classList).filter(c => /^djs-cursor-/.test(c)));
  await page.mouse.up();
  await frames(page);
  const dragged = await viewer(n);
  const after = await page.evaluate(() => Array.from(document.body.classList).filter(c => /^djs-cursor-/.test(c)));
  await page.mouse.click(cx, cy);
  await frames(page);
  const clicked = await viewer(n);
  check('live viewer: a drag moves the diagram, a click on it moves nothing, and the view stays open after both; the cursor class bpmn-js sets on <body> while dragging is gone after it',
    dragged.open && Math.abs(dragged.x - (again.x - 140)) <= 2 && Math.abs(dragged.y - again.y) <= 0.5 && Math.abs(dragged.scale - again.scale) <= 0.005 && clicked.open && Math.abs(clicked.x - dragged.x) <= 0.5 && during.length > 0 && after.length === 0,
    json({ before: [again.x, again.y], dragged: [dragged.open, dragged.x, dragged.y], clicked: [clicked.open, clicked.x], during, after }));
  await liveViewerTouch(page, check, { FIG, n, step });
  await step(2);
  await page.keyboard.press('+');
  await frames(page);
  const plus = await viewer(n);
  await page.keyboard.press('Escape');
  await frames(page);
  const byEscape = await leftovers();
  check('live viewer: at "150 %", "+" takes it to "200 %", scale 2; Escape closes it and leaves nothing of it', plus.zoom === '200' && plus.scale === 2 && clean(byEscape), json({ plus: [plus.zoom, plus.scale], byEscape }));

  // --- Space on the checkbox
  await openStage(n);
  await ready(n);
  await fig(n).locator('.dokufix-diagram-toggle').focus();
  await page.keyboard.press(' ');
  await frames(page);
  const bySpace = await leftovers();
  check('live viewer: Space on the checkbox closes it and leaves nothing of it', clean(bySpace), json(bySpace));

  // --- the logo: its lightbox, then Escape
  await openStage(n);
  await ready(n);
  await fig(n).locator('.bjs-powered-by').click();
  await frames(page);
  const box = await page.evaluate(() => document.querySelectorAll('body > .bjs-powered-by-lightbox').length);
  await page.keyboard.press('Escape');
  await frames(page);
  const byLogo = await leftovers();
  check('live viewer: a click on the logo opens the lightbox of bpmn-js; Escape then closes the view, and the lightbox is gone too', box === 1 && clean(byLogo), json({ box, byLogo }));

  // --- a render while it is open, the lightbox open as well
  await openStage(n);
  await ready(n);
  await fig(n).locator('.bjs-powered-by').click();
  const beforeRender = await leftovers();
  await page.evaluate(() => {
    const marker = document.createElement('i');
    marker.id = 'vergleich-render-pending';
    document.getElementById('dokufix-rail').appendChild(marker);
    document.getElementById('render-btn').click();
  });
  await page.waitForFunction(() => !document.getElementById('vergleich-render-pending'), null, { timeout: 90000 });
  await frames(page);
  const rendered = await leftovers();
  check('live viewer: a render while it is open destroys it, the lightbox with it', beforeRender.live === 1 && beforeRender.lightbox === 1 && clean(rendered), json({ beforeRender, rendered }));

  // --- in the editor, files written while it is open, a drag going on and the lightbox open
  if (key === 'editor' && opts.dir){
    for (const v of [{ key: 'nur-lesen', download: 'readonly-open' }, { key: 'mit-editor', download: 'full' }]){
      await openStage(n);
      await ready(n);
      const c = (await viewer(n)).centre;
      // A drag that goes on while the file is written, and the lightbox of the
      // logo open over it, by events: the mouse of the run has to stay free.
      await page.evaluate(([sel, n, x, y]) => {
        const target = document.elementFromPoint(x, y);
        const at = dx => ({ bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x + dx, clientY: y, view: window });
        target.dispatchEvent(new MouseEvent('mousedown', at(0)));
        for (let dx = -5; dx >= -60; dx -= 5) document.dispatchEvent(new MouseEvent('mousemove', at(dx)));
        document.querySelectorAll(sel)[n].querySelector('.dokufix-diagram-live .bjs-powered-by').click();
      }, [FIG, n, c[0], c[1]]);
      const before = await leftovers();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60000 }),
        page.evaluate(d => { document.getElementById('download-btn').click(); document.querySelector('button[data-download="' + d + '"]').click(); }, v.download),
      ]);
      const file = path.join(opts.dir, 'mit-viewer-' + v.key + '.html');
      await download.saveAs(file);
      await page.waitForFunction(() => !document.querySelector('button[data-download]:disabled'));
      const afterSave = await leftovers();
      await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 })));
      const text = markup(fs.readFileSync(file, 'utf8'));
      const trace = (text.match(new RegExp('.{0,60}(' + VIEWER_TRACES.source + ').{0,60}')) || [''])[0];
      const read = v.key !== 'mit-editor';
      check('live viewer: "' + v.key + '" written while it is open, the lightbox open and a drag going on, carries nothing of it' + (read ? '; the render of the download destroys the viewer' : '; the viewer runs on'),
        before.live === 1 && before.lightbox === 1 && before.cursor.length > 0 && !trace && (read ? clean(afterSave) : afterSave.live === 1),
        json({ before, afterSave, trace }));
      if (!read){
        await page.keyboard.press('Escape');
        await frames(page);
        const closed = await leftovers();
        check('live viewer: closed after the save, nothing of it is left', clean(closed), json(closed));
      }
    }
  }
}

// Touch on the live viewer (story 2.23), Chromium only: its touches come by
// CDP (Input.dispatchTouchEvent), which Firefox has not; there the check says
// so in its name. At "Einpassen": one finger moves the diagram by its own way;
// two fingers that begin on two different shapes pinch out in small steps,
// then a third lands and the two go on, then a pinch beyond scale 4 and
// pinches below 0.2, then a tap on the logo, which opens its lightbox.
// At every step the diagram point under the fingers' middle before lies under
// their middle after (to 2 px), so the diagram moves by no more than the
// fingers did; at the end the scale is that of the start times the ratio of
// the distances (to 0.01), between 0.2 and 4, and the view is open. The
// container's touch-action is none, and every touchmove in the viewer is
// prevented, as a listener on window hears it after the viewer's own. The
// fingers of two shapes are two touch lists of one: read from
// e.targetTouches, the scale stays far below 1.6 times the start, and the
// diagram jumps when the third finger lands.
async function liveViewerTouch(page, check, { FIG, n, step }){
  const json = JSON.stringify;
  const NAME = 'live viewer, touch (Chromium only, by CDP): one finger moves the diagram, two that begin on two shapes zoom it at their middle by the ratio of their distances, '
    + 'a third finger changes nothing, the scale stops at 4 and at 0.2, a tap on the logo opens its lightbox; no step jumps, the view stays open; the container has touch-action none and every touchmove in it is prevented';
  if (page.context().browser().browserType().name() !== 'chromium'){
    check('live viewer, touch: not checked in Firefox, which has no CDP to dispatch touches; Chromium checks it', true);
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await step(0);
  // The viewport of the canvas: its scale, its offset and the corner of its container, in the page.
  const view = () => page.evaluate(([sel, n]) => {
    const f = document.querySelectorAll(sel)[n], c = f.querySelector('.dokufix-diagram-live .djs-container');
    const g = c && c.querySelector('svg > g.viewport');
    const m = g ? g.getCTM() : null, r = c ? c.getBoundingClientRect() : null;
    return { open: f.querySelector('.dokufix-diagram-toggle').checked, s: m ? m.a : null, e: m ? m.e : null, f: m ? m.f : null,
             left: r ? r.left : null, top: r ? r.top : null };
  }, [FIG, n]);
  // A point of the page in the diagram, and back.
  const toDiagram = (v, p) => ({ x: (p.x - v.left - v.e) / v.s, y: (p.y - v.top - v.f) / v.s });
  const toPage = (v, d) => ({ x: v.left + v.e + d.x * v.s, y: v.top + v.f + d.y * v.s });
  const far = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const middle = ([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ x: p.x, y: p.y, id: p.id, radiusX: 1, radiusY: 1, force: 1 })) });
  const problems = [];
  const v0 = await view();
  // Whether each touchmove in the viewer was prevented, heard on window in the
  // bubble phase, after the viewer's own listener; and the container's touch-action.
  const touchAction = await page.evaluate(([sel, n]) => {
    const live = document.querySelectorAll(sel)[n].querySelector('.dokufix-diagram-live');
    window.vergleichMoves = [];
    window.vergleichMoveListener = e => { if (live.contains(e.target)) window.vergleichMoves.push(e.defaultPrevented); };
    window.addEventListener('touchmove', window.vergleichMoveListener, { passive: true });
    return getComputedStyle(live).touchAction;
  }, [FIG, n]);
  if (touchAction !== 'none') problems.push('the container has touch-action ' + touchAction + ', not none');
  const stopListening = () => page.evaluate(() => {
    window.removeEventListener('touchmove', window.vergleichMoveListener, { passive: true });
    if (window.vergleichTouchListener) document.removeEventListener('touchstart', window.vergleichTouchListener, { capture: true });
    const moves = window.vergleichMoves;
    for (const k of ['vergleichMoves', 'vergleichMoveListener', 'vergleichTouches', 'vergleichTouchListener']) delete window[k];
    return moves;
  });

  // --- one finger
  const live = await page.evaluate(([sel, n]) => { const r = document.querySelectorAll(sel)[n].querySelector('.dokufix-diagram-live').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [FIG, n]);
  await touch('touchStart', [{ ...live, id: 1 }]);
  for (let k = 1; k <= 8; k++) await touch('touchMove', [{ x: live.x - 15 * k, y: live.y + 5 * k, id: 1 }]);
  await touch('touchEnd', []);
  await frames(page);
  const panned = await view();
  if (!(Math.abs(panned.e - (v0.e - 120)) <= 1 && Math.abs(panned.f - (v0.f + 40)) <= 1 && Math.abs(panned.s - v0.s) <= 0.0005))
    problems.push('one finger moved by (-120, 40): ' + json({ before: [v0.e, v0.f, v0.s], after: [panned.e, panned.f, panned.s] }));

  // --- two fingers on the two nearest shapes, inside the viewer, in steps
  await step(0);
  const shapes = await page.evaluate(([sel, n]) => {
    const live = document.querySelectorAll(sel)[n].querySelector('.dokufix-diagram-live'), b = live.getBoundingClientRect();
    return Array.from(live.querySelectorAll('g.djs-element.djs-shape[data-element-id]')).map(g => {
      const r = g.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { id: g.getAttribute('data-element-id'), x, y, own: !!hit && g.contains(hit) && !Array.from(g.querySelectorAll('g.djs-element')).some(c => c.contains(hit)),
               inside: x > b.left + b.width * 0.2 && x < b.right - b.width * 0.2 && y > b.top + b.height * 0.2 && y < b.bottom - b.height * 0.2 };
    }).filter(p => p.own && p.inside && !p.id.endsWith('_label'));
  }, [FIG, n]);
  let pair = null;
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++){
    const d = far(shapes[i], shapes[j]);
    if (d >= 40 && (!pair || d < pair.d)) pair = { a: shapes[i], b: shapes[j], d };
  }
  if (!pair){
    check(NAME, false, 'no two shapes of their own inside the viewer to begin on: ' + json(shapes.map(s => s.id)));
    await stopListening();
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp.detach();
    return;
  }
  const start = await view();
  const m0 = middle([pair.a, pair.b]), d0 = far(pair.a, pair.b), under0 = toDiagram(start, m0);
  const RATIO = 1.6, SHIFT = { x: 30, y: 20 }, STEPS = 16;
  // The two fingers at t of the way, 0 to 1: out along their line from the middle, the middle shifted.
  const at = t => {
    const r = 1 + (RATIO - 1) * t, mx = m0.x + SHIFT.x * t, my = m0.y + SHIFT.y * t;
    return [{ x: mx + (pair.a.x - m0.x) * r, y: my + (pair.a.y - m0.y) * r, id: 2 }, { x: mx + (pair.b.x - m0.x) * r, y: my + (pair.b.y - m0.y) * r, id: 3 }];
  };
  const third = { x: m0.x + 5, y: m0.y + 60, id: 4 };
  let prev = at(0), v = start;
  // The shape each finger's touch began on, as the page heard it.
  await page.evaluate(() => {
    window.vergleichTouches = {};
    window.vergleichTouchListener = e => { for (const t of e.changedTouches){ const g = t.target.closest && t.target.closest('[data-element-id]'); window.vergleichTouches[t.identifier] = g ? g.getAttribute('data-element-id') : t.target.nodeName; } };
    document.addEventListener('touchstart', window.vergleichTouchListener, { capture: true, passive: true });
  });
  await touch('touchStart', [prev[0]]);
  await touch('touchStart', prev);
  const began = await page.evaluate(() => Object.values(window.vergleichTouches));
  if (json(began.slice().sort()) !== json([pair.a.id, pair.b.id].sort()))
    problems.push('the two fingers did not begin on ' + pair.a.id + ' and ' + pair.b.id + ': ' + json(began));
  for (let k = 1; k <= STEPS; k++){
    if (k === STEPS / 2 + 1) await touch('touchStart', prev.concat(third));
    const now = at(k / STEPS);
    await touch('touchMove', k > STEPS / 2 ? now.concat(third) : now);
    const w = await view();
    const was = middle(prev), is = middle(now), moved = Math.max(far(prev[0], now[0]), far(prev[1], now[1]));
    const landed = toPage(w, toDiagram(v, was));
    if (far(landed, is) > 2 || far(landed, was) > moved + 2)
      problems.push('step ' + k + ': the point under the middle went to ' + json([Math.round(landed.x), Math.round(landed.y)]) + ', the middle to ' + json([Math.round(is.x), Math.round(is.y)]) + ', the fingers moved ' + Math.round(moved) + ' px');
    prev = now; v = w;
  }
  await touch('touchEnd', []);
  await frames(page);
  const pinched = await view();
  const m1 = middle(prev), under1 = toPage(pinched, under0);
  if (Math.abs(pinched.s - start.s * RATIO) > 0.01 || far(under1, m1) > 2)
    problems.push('pinch: scale ' + pinched.s.toFixed(3) + ' for ' + (start.s * RATIO).toFixed(3) + ', the start middle\'s point ' + Math.round(far(under1, m1)) + ' px from the end middle');

  // --- a pinch far beyond scale 4
  const c = middle([pair.a, pair.b]);
  await touch('touchStart', [{ x: c.x - 20, y: c.y, id: 5 }]);
  await touch('touchStart', [{ x: c.x - 20, y: c.y, id: 5 }, { x: c.x + 20, y: c.y, id: 6 }]);
  for (let k = 1; k <= 10; k++) await touch('touchMove', [{ x: c.x - 20 - 28 * k, y: c.y, id: 5 }, { x: c.x + 20 + 28 * k, y: c.y, id: 6 }]);
  await touch('touchEnd', []);
  await frames(page);
  const limit = await view();
  if (Math.abs(limit.s - 4) > 0.0005) problems.push('a pinch to 15 times the distance from scale ' + pinched.s.toFixed(3) + ' stops at ' + limit.s.toFixed(3) + ', not at 4');

  // --- a pinch far below scale 0.2: from 600 px apart to 20, three times
  for (let r = 0; r < 3; r++){
    await touch('touchStart', [{ x: c.x - 300, y: c.y, id: 7 + 2 * r }]);
    await touch('touchStart', [{ x: c.x - 300, y: c.y, id: 7 + 2 * r }, { x: c.x + 300, y: c.y, id: 8 + 2 * r }]);
    for (let k = 1; k <= 10; k++) await touch('touchMove', [{ x: c.x - 300 + 29 * k, y: c.y, id: 7 + 2 * r }, { x: c.x + 300 - 29 * k, y: c.y, id: 8 + 2 * r }]);
    await touch('touchEnd', []);
  }
  await frames(page);
  const least = await view();
  if (Math.abs(least.s - 0.2) > 0.0005) problems.push('a pinch to a thirtieth of the distance, three times, from scale 4 stops at ' + least.s.toFixed(3) + ', not at 0.2');

  // --- a tap on the logo stays a tap: its lightbox opens, as at a click
  const logo = await page.evaluate(([sel, n]) => { const r = document.querySelectorAll(sel)[n].querySelector('.dokufix-diagram-live .bjs-powered-by').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [FIG, n]);
  await touch('touchStart', [{ ...logo, id: 20 }]);
  await touch('touchEnd', []);
  await frames(page);
  const tapped = await page.evaluate(() => document.querySelectorAll('body > .bjs-powered-by-lightbox').length);
  if (tapped !== 1) problems.push('a tap on the logo opened ' + tapped + ' lightboxes, not 1');
  await page.evaluate(() => { const b = document.querySelector('body > .bjs-powered-by-lightbox .backdrop'); if (b) b.click(); });
  await frames(page);
  const lightboxLeft = await page.evaluate(() => document.querySelectorAll('body > .bjs-powered-by-lightbox').length);
  if (lightboxLeft) problems.push('the lightbox stayed after a click on its backdrop');
  if (!limit.open || !(await view()).open) problems.push('the view closed');
  const moves = await stopListening();
  if (!moves.length || !moves.every(Boolean)) problems.push(moves.filter(p => !p).length + ' of ' + moves.length + ' touchmoves in the viewer not prevented');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await cdp.detach();
  check(NAME, problems.length === 0, 'begun on ' + pair.a.id + ' and ' + pair.b.id + ', ' + Math.round(d0) + ' px apart: ' + problems.slice(0, 4).join(' | '));
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

async function assertVariant(browser, file, key, exp, results, label){
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

  const { close, page, errors } = await openVariant(browser, file, key, exp, 1400, 'light');
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
        mermaid: document.querySelectorAll('figure.dokufix-diagram-mermaid .dokufix-diagram-svg > svg').length,
        // Every diagram's figure, in the order of the document: its classes,
        // its title, the elements it holds and whether its SVG is there, in the
        // SVG container in the stage of its large view.
        figures: Array.from(root.querySelectorAll('figure.dokufix-diagram')).map(f => ({
          kind: (f.className.match(/\bdokufix-diagram-(?!svg\b|credit\b)(\w+)/) || [0, ''])[1], title: f.getAttribute('aria-label'),
          children: Array.from(f.children).map(k => k.tagName.toLowerCase() + '.' + k.className).join(' '),
          svg: !!f.querySelector(':scope > .dokufix-diagram-view > .dokufix-diagram-stage > .dokufix-diagram-svg > svg'),
          box: (() => { const cs = getComputedStyle(f); return cs.marginTop + ' ' + cs.marginRight + ' ' + cs.marginBottom + ' ' + cs.marginLeft + ' ' + cs.textAlign; })(),
        })),
        // A diagram of Mermaid's outside a figure: its own class, or an SVG it drew.
        diagramsOutside: Array.from(root.querySelectorAll('.mermaid, svg[aria-roledescription]')).filter(el => !el.closest('figure.dokufix-diagram')).length,
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
    // --- the one figure every diagram stands in (story 2.7)
    const wantFigures = exp.diagrams.filter(d => d.drawn).map(d => d.kind + ': ' + d.title);
    check('every diagram stands in its figure, in the order of the document, its title the heading before it: ' + JSON.stringify(wantFigures),
      JSON.stringify(s.figures.map(f => f.kind + ': ' + f.title)) === JSON.stringify(wantFigures) && s.diagramsOutside === 0,
      JSON.stringify(s.figures.map(f => f.kind + ': ' + f.title)) + ', outside a figure: ' + s.diagramsOutside);
    const figureProblems = s.figures.filter(f => !f.svg || !/^input\.dokufix-diagram-toggle( input\.dokufix-diagram-zoom){4} div\.dokufix-diagram-view div\.dokufix-diagram-downloads( figcaption\.dokufix-diagram-credit)?$/.test(f.children) || f.box !== '24px 0px 24px 0px center')
      .map(f => f.title + ': ' + JSON.stringify(f));
    check('every figure holds the controls of its large view, its SVG in the SVG container and the line of its downloads, and stands with the margin a diagram had, centred', figureProblems.length === 0, figureProblems.join(' | '));
    // The accessible name, as the accessibility tree computes it.
    const unnamed = [];
    for (const d of exp.diagrams.filter(x => x.drawn)){
      const n = await page.getByRole('figure', { name: d.title, exact: true }).count();
      if (n !== exp.diagrams.filter(x => x.drawn && x.title === d.title).length) unnamed.push(d.title + ' (' + n + ')');
    }
    check('every figure has its title as its accessible name', unnamed.length === 0, [...new Set(unnamed)].join(', '));
    // --- BPMN diagrams (story 2.7). With a document that has none, the counts are the check.
    await assertBpmn(page, check, exp, key, text, label, path.dirname(file));
    // --- the large view of a diagram (story 2.9)
    await assertLargeView(page, check, exp, key);
    // --- the downloads below a diagram (story 2.10)
    await assertDiagramDownloads(page, check, exp, key, text, label, path.dirname(file));
    // --- the live viewer of a BPMN diagram (story 2.11): in Mit Editor, and in no read-only file
    await assertLiveViewer(page, check, exp, key);
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
    // --- the free-text filter (story 2.6): a field in the editor file, in schlank and in kompakt, nothing of it in nur-lesen.
    await assertFilters(page, check, exp, key);
    // --- the search of the reading view (epic 5, stories 1 to 4): the editor file, schlank and kompakt; nothing of it in nur-lesen.
    if (key === 'nur-lesen'){
      const style = (text.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
      const live = await page.evaluate(() => ({ panels: document.querySelectorAll('.search-panel').length, magnifiers: document.querySelectorAll('.search-magnifier').length, sheets: Array.from(document.querySelectorAll('style')).filter(el => el.textContent.includes('.search-')).length }));
      check('search: no panel, no magnifier and no rule of them, in the file or in the open page', !/\.search-/.test(style) && !text.includes('search-magnifier') && live.panels === 0 && live.magnifiers === 0 && live.sheets === 0, JSON.stringify(live));
    } else await assertSearch(page, check, key);
    if (key === 'schlank'){
      // --- story 5.16, M1: the file writes its content container with the mark
      // of its decoder, which the decoder takes when it is done; while the mark
      // is there a search lists nothing and says so, and it runs on the
      // decoder's event. The mark is put back here, the event sent by hand.
      const written = /<main class="reader-body dokufix-doc" data-dokufix-unpacking>/.test(text) && text.includes('DecompressionStream');
      const taken = await page.evaluate(() => !document.querySelector('main.reader-body').hasAttribute('data-dokufix-unpacking'));
      await page.evaluate(() => { document.querySelector('main.reader-body').setAttribute('data-dokufix-unpacking', ''); window.scrollTo(0, 0); if (document.activeElement) document.activeElement.blur(); });
      await page.keyboard.press('/');
      await page.fill('body > .search-panel input', SEARCH_TERM);
      await page.waitForFunction(() => document.querySelector('body > .search-panel [role="status"]').textContent !== '', null, { timeout: 5000 }).catch(() => {});
      const summary = () => page.evaluate(() => ({ summary: document.querySelector('body > .search-panel [role="status"]').textContent, results: document.querySelectorAll('body > .search-panel .search-result').length }));
      const waiting = await summary();
      await page.evaluate(() => { document.querySelector('main.reader-body').removeAttribute('data-dokufix-unpacking'); document.dispatchEvent(new Event('dokufix-diagrams-unpacked')); });
      const ran = await summary();
      await page.evaluate(() => { const p = document.querySelector('body > .search-panel'); if (!p.hidden) p.querySelector('.search-close').click(); if (document.activeElement) document.activeElement.blur(); });
      check('search: the file writes <main> with the mark of its decoder, which the decoder takes; with the mark a search lists nothing and says "Diagramme werden entpackt …", and on the decoder\'s event it runs',
        written && taken && waiting.summary === 'Diagramme werden entpackt …' && waiting.results === 0 && /Treffer/.test(ran.summary) && ran.results > 0, JSON.stringify({ written, taken, waiting, ran }));
    }
    // Outside its stylesheet, which carries the rules of every component, and
    // outside its scripts, which carry the reader bundle's code.
    const outsideStyle = text.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    if (key === 'nur-lesen') check('free-text filter: outside its stylesheet the file holds nothing of it, no field, no mark, no hidden row', !/dokufix-filter/.test(outsideStyle), (outsideStyle.match(/.{0,60}dokufix-filter.{0,60}/) || [''])[0]);
    if (key === 'schlank' || key === 'kompakt'){
      // The reader bundle, the filter and the search, as the page's block holds
      // it, runs in every such file when it opens, with a filter table or without.
      const block = (fs.readFileSync(opts.file, 'utf8').match(/<script type="text\/plain" id="dokufix-reader-js">([\s\S]*?)<\/script>/) || [, ''])[1];
      const carried = !!block && text.includes(block);
      check('reader bundle: the file carries the code of the page\'s block once' + (key === 'schlank' ? ', in front of the decoder of the diagrams' : ', as a block the decoder runs after it has unpacked'),
        carried && text.split(block).length === 2 && (key === 'schlank'
          ? text.includes('<script>' + block + '</script>') && (!text.includes('DecompressionStream') || text.indexOf(block) < text.indexOf('DecompressionStream'))
          : text.includes('<script type="text/plain" id="f">' + block + '</script>')),
        'block ' + block.length + ' B, in the file: ' + carried);
      if (key === 'schlank') check('free-text filter: outside its stylesheet and scripts the file holds no field and no hidden row', !/dokufix-filter-out|class="dokufix-filter"/.test(outsideStyle), (outsideStyle.match(/.{0,60}dokufix-filter.{0,60}/) || [''])[0]);
    }

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
      await assertTableFootnote(page, check, exp, label, key);
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
      await frames(page);
      const problems = licencePlaceProblems(await licenceFacts(page), key, width);
      if (problems.length) misplaced.push(width + ' px: ' + problems.join('; '));
    }
    check('licence link from ' + LICENCE_WIDTHS[0] + ' to ' + LICENCE_WIDTHS[LICENCE_WIDTHS.length - 1] + ' px: in the top margin, inside the window, at the right edge of the text column, up to ' + NARROW + ' px left of the top right corner' +
      (key === 'mit-editor' ? ', never over "Editor ↩"' : '') + (key === 'nur-lesen' ? '' : ', never over the magnifier of the search'), misplaced.length === 0, misplaced.join(' | '));
    // The view in a narrow window: inside it.
    await page.setViewportSize({ width: 600, height: 1000 });
    await frames(page);
    await assertLicenceOpens(page, check, 'body > details.dokufix-licences > summary', 'licence link at 600 px');
    await page.setViewportSize({ width: 1400, height: 1000 });
    await frames(page);

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
        // The scroll is smooth: wait until the preview has moved and stands
        // still, which the browser says with "scrollend". The position alone
        // does not say it: Firefox holds it for two and three frames in the
        // middle of a smooth scroll and a pixel before its end. The two frames
        // first let the "scrollend" of the preview's instant scrolls above go
        // by, which the browser fires on the next frame.
        await frames(page);
        await page.evaluate(() => {
          const preview = document.getElementById('preview');
          window.vergleichScrolled = false;
          preview.addEventListener('scrollend', () => { window.vergleichScrolled = true; }, { once: true });
          const links = preview.querySelectorAll('nav.dokufix-toc a');
          links[Math.floor(links.length / 2)].click();
        });
        await page.waitForFunction(() => window.vergleichScrolled, null, { timeout: 5000 }).catch(() => {});
        const after = await place();
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
      await frames(page);
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
      await assertLicenceWithoutScripts(browser, file, check);
      if (key !== 'kompakt') await assertFacetsWithoutScripts(browser, file, check, exp);
      if (key === 'schlank') await assertFiltersWithoutScripts(browser, file, check, exp);
      if (key === 'schlank') await assertDiagramsWithoutScripts(browser, file, check, exp);
      if (key !== 'kompakt') await assertLargeViewWithoutScripts(browser, file, check, exp, key);
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
  const browser = await BROWSERS[name]();
  const results = [];
  try {
    const built = await buildExports(browser, opts, md, path.join(dir, 'exports'), makeChecker(results, name + ' editor'));
    const exp = judgeDiagrams(expectationsFor(built.source), built.wellFormed);
    const check = makeChecker(results, name + ' build');
    check('no script errors while building', built.errors.length === 0, built.errors.join(' | '));
    if (exp.facets.length) check('a facet was chosen in the page while each of the four files was written', built.chosen.length === VARIANTS.length && built.chosen.every(c => c === true), JSON.stringify(built.chosen));
    if (exp.filters.some(f => f.term)){
      const term = exp.filters.find(f => f.term).term;
      check('in the editor, a term was typed into a free-text filter while each of the four files was written ("' + term + '"), and the counter said how many rows it shows',
        built.typed.length === VARIANTS.length && built.typed.every(t => t.typed.values[t.filter] === term && t.typed.counts[t.filter] === t.count && t.typed.out > 0), JSON.stringify(built.typed));
      check('a read-only download renders first: the page\'s fields are empty again and no row is hidden',
        built.typed.filter(t => READONLY.has(t.variant)).every(t => t.after.values.length === exp.filters.length && t.after.values.every(x => x === '') && t.after.out === 0), JSON.stringify(built.typed.map(t => [t.variant, t.after])));
    }
    if (exp.filters.length) check('in the editor, the document rendered again, twice: one field per free-text filter each time', built.rendered.every(n => n === exp.filters.length), JSON.stringify(built.rendered) + ', expected ' + exp.filters.length);
    if (exp.diagrams.some(d => d.drawn)){
      check('in the editor, the large view of the first diagram was open at "150 %" while each of the four files was written, the page not scrolling',
        built.views.length === VARIANTS.length && built.views.every(w => w.before && w.before.open && w.before.zoom === '150' && w.before.views === 1 && w.before.page === 'hidden'), JSON.stringify(built.views.map(w => [w.variant, w.before])));
      check('a read-only download renders first: the figure is replaced, its view is closed and the page scrolls again',
        built.views.filter(w => READONLY.has(w.variant)).every(w => w.after && !w.after.open && w.after.zoom === 'fit' && w.after.views === 0 && w.after.page === 'visible'), JSON.stringify(built.views.map(w => [w.variant, w.after])));
    }

    for (const v of VARIANTS){
      for (const width of WIDTHS){
        for (const [schemeName, scheme] of SCHEMES){
          const base = v.key + '-' + width + '-' + schemeName;
          const { close, page } = await openVariant(browser, built.files[v.key], v.key, exp, width, scheme);
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
            // The large view of the first diagram, open, the window as it is
            // (1400 px, light). In a folder of its own: see compareRun().
            if (width === WIDTHS[0] && scheme === 'light' && exp.diagrams.some(d => d.drawn)){
              const opened = await page.evaluate(() => {
                const stage = document.querySelector('.dokufix-doc figure.dokufix-diagram .dokufix-diagram-stage');
                // The click puts the focus on the view's checkbox; without a ring
                // in the picture, as after a click of the mouse.
                if (stage){ window.scrollTo(0, 0); stage.click(); if (document.activeElement) document.activeElement.blur(); }
                return !!stage;
              });
              if (opened){
                await frames(page);
                fs.mkdirSync(path.join(dir, LARGE_VIEW_DIR), { recursive: true });
                await page.screenshot({ path: path.join(dir, LARGE_VIEW_DIR, base + '.png'), animations: 'disabled', caret: 'hide' });
              }
            }
          } finally { await close(); }
        }
      }
      await assertVariant(browser, built.files[v.key], v.key, exp, results, name);
    }

    // The preview pane inside the editor: same document rules, the editor's frame.
    for (const [schemeName, scheme] of SCHEMES){
      const { close, page } = await openVariant(browser, built.files['mit-editor'], 'mit-editor', exp, 1400, scheme);
      try {
        await page.click('#edit-btn');
        const h = await page.evaluate(() => {
          const p = document.getElementById('preview');
          if (document.activeElement) document.activeElement.blur();
          return Math.ceil(p.getBoundingClientRect().top + p.scrollHeight) + 2;
        });
        await page.setViewportSize({ width: 1400, height: Math.min(h, 15000) });
        await frames(page);
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

// The pictures of the open large view of a diagram (story 2.9) stand in a
// folder of their own. They are compared where the baseline has that folder
// too; against a baseline from before the story, which has none, they are
// listed as new and not counted, so that the pictures of the closed page can
// be compared with --strict.
const LARGE_VIEW_DIR = 'grossansicht';
function compareRun(run, baselineRoot){
  const baseDir = path.join(baselineRoot, run.name);
  const out = { images: [], sizes: null, libraries: null, uncompared: [] };
  const inFolder = (dir, sub) => fs.existsSync(path.join(dir, sub)) ? fs.readdirSync(path.join(dir, sub)).filter(f => f.endsWith('.png')).map(f => sub + '/' + f) : [];
  const withView = fs.existsSync(path.join(baseDir, LARGE_VIEW_DIR));
  if (!withView) out.uncompared = inFolder(run.dir, LARGE_VIEW_DIR);
  const pngs = dir => [...fs.readdirSync(dir).filter(f => f.endsWith('.png')), ...(withView ? inFolder(dir, LARGE_VIEW_DIR) : [])];
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
    if (cmp.uncompared.length) console.log('  not compared, the baseline has no ' + LARGE_VIEW_DIR + '/: ' + cmp.uncompared.join(', '));
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
// The images the file under test carries (its #dokufix-assets block): an
// #asset- reference to one of them is shown, any other is a missing image.
const bakedAssets = (() => {
  const m = fs.readFileSync(opts.file, 'utf8').match(/<script type="application\/json" id="dokufix-assets">([\s\S]*?)<\/script>/);
  try { return new Set(Object.keys(JSON.parse(m ? m[1] : '{}')).map(h => h.toLowerCase())); }
  catch (e){ return new Set(); }
})();
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
// The libraries, from tests/.cdn/; a missing one is fetched once, before anything is built.
try { libraries = await prepareLibraries(opts.file); }
catch (e){ console.error(e.message); process.exit(1); }
let failed = 0, differing = 0;
// The browsers run side by side: each has its own folder and its own browser
// process, and nothing in a run is shared with the other. The report comes
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
console.log(librariesLine(libraries));
// A library the page asked for that is not pinned in the file under test was
// not fetched; the page went on without it.
if (libraries.refused.length) console.log('refused, not pinned in the file under test: ' + libraries.refused.join(', '));
process.exit(failed || libraries.refused.length || (opts.strict && differing) ? 1 : 0);
