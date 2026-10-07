// --- The size of a label, as bpmn-js will draw it ----------------------------
// The layout of BPMN without coordinates (src/app/bpmn-layout.js) places every
// label of an event, a gateway or a flow, and every text annotation, in the
// size bpmn-js gives it when it draws the XML. bpmn-js lays its text out with
// diagram-js (lib/util/Text.js): it fills a line while it is at most as wide
// as the box, shortens it at a blank, a hyphen or a soft hyphen, else cuts the
// word, and measures each line with canvas.measureText in its font. That needs
// a browser, and a browser measures in the font it has, so the same XML was
// laid out differently on every machine, and not at all in Node.
//
// This module is that text layout, replicated, with a table of the advance
// widths of one font in place of the canvas: pure arithmetic, the same result
// in Node and in every browser. The font is the one bpmn-js draws in by
// default, "Arial, sans-serif" at 12 px (TextRenderer.js of bpmn-js), so the
// XML is placed for the Camunda Modeler and any bpmn-js that opens it as it is,
// and dokufix draws in that font too (BPMN_FONT in src/app/bpmn.js). A machine
// without Arial draws in what "sans-serif" resolves to there: on Linux
// usually Liberation Sans, whose advance widths are those of Arial; another
// font draws the labels a little wider or narrower than their boxes.
//
// Replicated from diagram-js 15.28.0, lib/util/Text.js (layoutText(),
// layoutNext(), fit(), semanticShorten(), shortenLine(), getTextBBox()), the
// version bpmn-js 18.31.0 bundles, and from bpmn-js 18.31.0,
// lib/draw/TextRenderer.js (getExternalLabelBounds(),
// getTextAnnotationBounds()) with its constants (the box of 90 px of
// lib/util/LabelUtil.js, the padding of 7 px of lib/util/AnnotationUtil.js).
// The fit condition of layoutNext() changed in diagram-js 15.27.x ("<" of a
// rounded width to "<="), one week before bpmn-js 18.31.0, so the replica
// follows one version: LABEL_SIZE_VERSION. tests/check-label-size.mjs
// measures it against that bpmn-js in Chromium, and tests/licences.test.mjs
// fails when src/index.html pins another.
//
// diagram-js: The MIT License (MIT), Copyright (c) 2014-present Camunda
// Services GmbH. Permission is hereby granted, free of charge, to any person
// obtaining a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including without
// limitation the rights to use, copy, modify, merge, publish, distribute,
// sublicense, and/or sell copies of the Software, and to permit persons to
// whom the Software is furnished to do so, subject to the following
// conditions: The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software. THE
// SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.
// bpmn-js: the few constants and formulas taken from TextRenderer.js are under
// the bpmn.io licence, Copyright (c) 2014-present Camunda Services GmbH, whose
// text stands with the entry of bpmn-js in src/app/licences.js. Both notices
// are on the list behind the link "license information" of every dokufix file.
//
// Pure logic: no page, no library, no import. tests/label-size.test.mjs runs
// it in Node.

// The versions the replica follows. src/index.html pins the bpmn-js;
// tests/licences.test.mjs fails when the two differ, so a newer bpmn-js is
// only taken together with the check against it (npm run labels).
export const LABEL_SIZE_VERSION = { 'diagram-js': '15.28.0', 'bpmn-js': '18.31.0' };

// The font the table is of, and the one bpmn-js draws in by default.
export const LABEL_FONT = 'Arial, sans-serif';

// ---------- the width table ----------
// The advance widths of "normal 12px Arial, sans-serif", in font units (2048
// to the em: a width in px is units * 12 / 2048), measured on 2026-10-07 with
// canvas.measureText in Chromium 141 (/opt/pw-browsers/chromium, fontKerning
// "auto"), the way diagram-js measures (tests/check-label-size.mjs --table
// prints it anew). fontconfig gives Arial as Liberation Sans there; the widths
// are those of Liberation Sans Regular, which is made to the metrics of Arial,
// and every one is a whole number of units, so a line's width adds up exactly.
// Each range of code points is one string of numbers in their order: ASCII,
// Latin-1, Latin Extended-A, general punctuation, the euro and trade mark
// signs, and the tab.
const RANGES = [
  [0x20, '569 569 727 1139 1139 1821 1366 391 682 682 797 1196 569 682 569 569 1139 1139 1139 1139 1139 1139 1139 1139 1139 1139 569 569 1196 1196 1196 1139 2079 1366 1366 1479 1479 1366 1251 1593 1479 569 1024 1366 1139 1706 1479 1593 1366 1593 1479 1366 1251 1479 1366 1933 1366 1366 1251 569 569 569 961 1139 682 1139 1139 1024 1139 1139 569 1139 1139 455 455 1024 455 1706 1139 1139 1139 1139 682 1024 569 1139 1024 1479 1024 1024 1024 684 532 684 1196'],
  [0xa0, '569 682 1139 1139 1139 1139 532 1139 682 1509 758 1139 1196 0 1509 1131 819 1124 682 682 682 1180 1100 682 682 682 748 1139 1708 1708 1708 1251 1366 1366 1366 1366 1366 1366 2048 1479 1366 1366 1366 1366 569 569 569 569 1479 1479 1593 1593 1593 1593 1593 1196 1593 1479 1479 1479 1479 1366 1366 1251 1139 1139 1139 1139 1139 1139 1821 1024 1139 1139 1139 1139 569 569 569 569 1139 1139 1139 1139 1139 1139 1139 1124 1251 1139 1139 1139 1139 1024 1139 1024 1366 1139 1366 1139 1366 1139 1479 1024 1479 1024 1479 1024 1479 1024 1479 1259 1479 1139 1366 1139 1366 1139 1366 1139 1366 1139 1366 1139 1593 1139 1593 1139 1593 1139 1593 1139 1479 1139 1479 1139 569 569 569 569 569 569 569 455 569 569 1505 909 1024 455 1366 1024 1024 1139 455 1139 455 1139 597 1139 684 1139 455 1479 1139 1479 1139 1479 1139 1237 1481 1139 1593 1139 1593 1139 1593 1139 2048 1933 1479 682 1479 682 1479 682 1366 1024 1366 1024 1366 1024 1366 1024 1251 569 1251 768 1251 569 1479 1139 1479 1139 1479 1139 1479 1139 1479 1139 1479 1139 1933 1479 1366 1024 1366 1251 1024 1251 1024 1251 1024 455'],
  [0x2010, '682 682 1139 1139 2048 2048 846 1131 455 455 455 455 682 682 682 682 1139 1139 717 1152 590 1180 2048 590'],
  [0x2030, '2048 3459 384 725 725 456 906 1356 932 682 682'],
  [0x20ac, '1139'],
  [0x2122, '2048'],
  [0x9, '569'],
];
// The pairs of those characters whose measured width is not the sum of the
// two, and the difference, in font units: the font's kerning, which the canvas
// applies. Every other pair adds up.
const KERNING = {
  '11': -152, 'AT': -152, 'AV': -152, 'AW': -76, 'AY': -152, 'Av': -37, 'Aw': -37, 'Ay': -37, 'A’': -152,
  'F,': -227, 'F.': -227, 'FA': -113, 'LT': -152, 'LV': -152, 'LW': -152, 'LY': -152, 'Ly': -76, 'L’': -113,
  'P,': -264, 'P.': -264, 'PA': -152, 'RT': -37, 'RV': -37, 'RW': -37, 'RY': -37, 'T,': -227, 'T-': -113,
  'T.': -227, 'T:': -227, 'T;': -227, 'TA': -152, 'TO': -37, 'Ta': -227, 'Tc': -227, 'Te': -227, 'Ti': -76,
  'To': -227, 'Tr': -76, 'Ts': -227, 'Tu': -76, 'Tw': -113, 'Ty': -113, 'V,': -188, 'V-': -113, 'V.': -188,
  'V:': -76, 'V;': -76, 'VA': -152, 'Va': -152, 'Ve': -113, 'Vi': -37, 'Vo': -113, 'Vr': -76, 'Vu': -76,
  'Vy': -76, 'W,': -113, 'W-': -37, 'W.': -113, 'W:': -37, 'W;': -37, 'WA': -76, 'Wa': -76, 'We': -37, 'Wo': -37,
  'Wr': -37, 'Wu': -37, 'Wy': -18, 'Y,': -264, 'Y-': -188, 'Y.': -264, 'Y:': -113, 'Y;': -133, 'YA': -152,
  'Ya': -152, 'Ye': -188, 'Yi': -76, 'Yo': -188, 'Yp': -152, 'Yq': -188, 'Yu': -113, 'Yv': -113, 'ff': -37,
  'f’': 37, 'r,': -113, 'r.': -113, 'r’': 76, 'v,': -152, 'v.': -152, 'w,': -113, 'w.': -113, 'y,': -152,
  'y.': -152, '‘‘': -37, '’s': -37, '’’': -37,
};
const UNITS_PER_EM = 2048, FONT_SIZE = 12;
// A character outside the table takes a fallback: a CJK character the width of
// an em, an emoji what Chromium's emoji font gave here (14.97 px), anything
// else the mean of the table. What a machine has for these differs anyway.
const CJK = /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/;
const EMOJI = /[\u2600-\u27bf\u{1f000}-\u{1faff}]/u;
const CJK_WIDTH = 12, EMOJI_WIDTH = 14.97247314453125;

// The table by character, read from RANGES when it is first needed, and the
// mean of its widths: made on demand, not when the module loads, so that a
// bundle which imports this module for something else (the reader bundle of
// the exports, through src/app/bpmn.js) can leave the table out.
let table = null;
function units(){
  if (!table){
    const map = new Map();
    for (const [first, list] of RANGES) list.split(' ').forEach((u, i) => map.set(String.fromCharCode(first + i), Number(u)));
    table = { map, mean: [...map.values()].reduce((a, b) => a + b, 0) / map.size };
  }
  return table;
}

// The characters of a text the table does not have, each once: their width
// is a fallback, so the size of such a text is a guess (a line break is no
// character of a line). tests/check-label-size.mjs notes a difference in such
// a text instead of failing on it.
export const missingFromTable = text => [...new Set([...String(text)].filter(c => !units().map.has(c) && c !== '\n' && c !== '\r'))];

// The width in px of a text, as the canvas would measure it: the advance of
// each character plus the kerning of each pair of neighbours.
export function textWidth(text){
  const { map, mean } = units();
  let sum = 0, px = 0, prev = '';
  for (const c of text){
    const u = map.get(c);
    if (u !== undefined) sum += u;
    else px += CJK.test(c) ? CJK_WIDTH : EMOJI.test(c) ? EMOJI_WIDTH : mean * FONT_SIZE / UNITS_PER_EM;
    if (prev) sum += KERNING[prev + c] || 0;
    prev = c;
  }
  return sum * FONT_SIZE / UNITS_PER_EM + px;
}

// ---------- the text layout of diagram-js ----------
const SOFT_BREAK = '\u00AD';

// getTextBBox(): a line's width; an empty line is 0 wide, and trailing white
// space does not count.
const lineWidth = text => text === '' ? 0 : textWidth(text.replace(/\s+$/, ''));

// semanticShorten(): the line cut at a blank, a hyphen or a soft hyphen to
// fewer than maxLength characters; a hyphen that does not fit takes the part
// before it along, and a soft hyphen at the end becomes a hyphen. '' where no
// part fits, and where the line starts with a blank (the first part is '').
function semanticShorten(line, maxLength){
  const parts = line.split(/(\s|-|\u00AD)/g), shortened = [];
  let part, length = 0;
  if (parts.length > 1){
    while ((part = parts.shift())){
      if (part.length + length < maxLength){ shortened.push(part); length += part.length; }
      else { if (part === '-' || part === SOFT_BREAK) shortened.pop(); break; }
    }
  }
  const last = shortened[shortened.length - 1];
  if (last && last === SOFT_BREAK) shortened[shortened.length - 1] = '-';
  return shortened.join('');
}

// shortenLine(): how many characters should fit, from the ratio of the width
// wanted to the width measured; the word is cut where no break fits.
function shortenLine(line, width, maxWidth){
  const length = Math.max(line.length * (maxWidth / width), 1);
  return semanticShorten(line, length) || line.slice(0, Math.max(Math.round(length - 1), 1));
}

// layoutNext() and fit(): the next line, shortened until it fits; what it
// leaves goes back, trimmed, to the front of lines.
function layoutNext(lines, maxWidth){
  const original = lines.shift();
  let fitLine = original;
  for (;;){
    const width = fitLine ? lineWidth(fitLine) : 0;
    if (fitLine === ' ' || fitLine === '' || width <= maxWidth || fitLine.length < 2){
      if (fitLine.length < original.length) lines.unshift(original.slice(fitLine.length).trim());
      return { text: fitLine, width };
    }
    fitLine = shortenLine(fitLine, width, maxWidth);
  }
}

// layoutText(): the lines of a text in a box maxWidth wide (the box less its
// padding), as diagram-js breaks them: [{ text, width }]. The author's line
// breaks count, a soft hyphen before one falls away, an empty line is a line.
export function layoutText(text, maxWidth){
  const lines = String(text).split(/\u00AD?\r?\n/), layouted = [];
  while (lines.length) layouted.push(layoutNext(lines, maxWidth));
  return layouted;
}

// ---------- the text renderer of bpmn-js ----------
// The box a label is laid out in on import (DEFAULT_LABEL_SIZE), the height
// of a line (lineHeight 1.2 of the font size), a text annotation's padding and
// least height.
const LABEL_WIDTH = 90, LINE_HEIGHT = 1.2 * FONT_SIZE, NOTE_PADDING = 7, MIN_NOTE_HEIGHT = 40;

// The size { w, h } of an event's, a gateway's or a flow's label as bpmn-js
// draws it: on import it lays the text out in a box 90 px wide, the width the
// widest line and the height a line per line, both rounded up
// (getExternalLabelBounds()); when it draws, it lays the text out again in
// that width, which can take a line more, so the lines are counted a second
// time and the height follows them.
// With a width, the size of a text annotation that wide (story 2.31): the text
// from the top left, 7 px in, at least 40 px high (getTextAnnotationBounds()).
export function measureLabel(text, width){
  if (width){
    const n = layoutText(text, width - 2 * NOTE_PADDING).length;
    return { w: width, h: Math.max(MIN_NOTE_HEIGHT, Math.round(n * LINE_HEIGHT + 2 * NOTE_PADDING)) };
  }
  const imported = layoutText(text, LABEL_WIDTH);
  const w = Math.ceil(imported.reduce((m, l) => Math.max(m, l.width), 0));
  const h = Math.ceil(imported.length * LINE_HEIGHT);
  const drawn = layoutText(text, w).length;
  return { w, h: Math.ceil(h / Math.max(1, imported.length) * drawn) };
}
