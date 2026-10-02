// --- Status chips ----------------------------------------------------------
// A code span that starts with a colour dot, a blank and a label becomes a
// status chip:
//
//   `🟢 Live`      <span class="dokufix-chip dokufix-chip-green">
//                    <span class="dokufix-chip-status">grün: </span>Live
//                  </span>
//
// The five dots are 🟢 🟡 🔴 ⚪ 🔵. dokufix adds no syntax; a renderer that does
// not know the convention shows the code span with its emoji. The convention
// is a starting point (decision D2 of 2026-10-01): a better syntax may replace
// it, and then only this module changes. It is the one place that tests for a
// colour dot.
//
// The status is not carried by colour alone. The chip's class names the
// colour, and the document styles (src/doc.css) draw a mark before the label
// whose shape differs per colour. The inner span holds the colour's German
// name as text; it is visually hidden, so a screen reader says "grün: Live".
// That text is no part of a heading's label or anchor: toc.js leaves it out,
// by the class exported here.
//
// Recognition works on what marked emits, not on the Markdown:
//
//   `🟢 Live`        <code>🟢 Live</code>              chip
//   `⚪️ geplant`     <code>⚪️ geplant</code>           chip: the dot may carry a variation selector
//   `x`, `x 🟢`      <code>x 🟢</code>                 ordinary code
//   `🟢`, `🟢x`      <code>🟢x</code>                  ordinary code: no blank, or no label
//   ` 🟢 x`          <code> 🟢 x</code>                ordinary code: the dot is not the first character
//   a line "🟢 x"    <pre><code>🟢 x\n</code></pre>    a code block stays as it is
//
// Known limit: a code span that only happens to start like one, `🔴 = Fehler`,
// becomes a chip. The way round it is anything before the dot, a blank is
// enough: ` 🔴 = Fehler`. See src/README.md, "Status chips".
//
// Pure logic: the pass works on the root it is handed and makes its elements
// with the document of that root, so this loads and runs without a page.

export const CHIP_CLASS = 'dokufix-chip';
// The text for assistive technology inside a chip. toc.js reads this.
export const CHIP_STATUS_CLASS = 'dokufix-chip-status';

// Per dot: the colour its class names, and the word a screen reader says.
export const CHIP_COLOURS = {
  '🟢': { colour: 'green', word: 'grün' },
  '🟡': { colour: 'yellow', word: 'gelb' },
  '🔴': { colour: 'red', word: 'rot' },
  '⚪': { colour: 'grey', word: 'grau' },
  '🔵': { colour: 'blue', word: 'blau' },
};

// A dot, optionally the variation selector that asks for its emoji form, at
// least one blank, then a label that is not empty. Blanks around the label do
// not belong to it.
const CHIP = new RegExp('^(' + Object.keys(CHIP_COLOURS).join('|') + ')\\uFE0F? +(\\S(?:[\\s\\S]*\\S)?)\\s*$', 'u');

// { colour, word, label } when the text of a code span is a status, null when
// it is ordinary code.
export function readChip(text){
  const m = CHIP.exec(String(text));
  if (!m) return null;
  return { ...CHIP_COLOURS[m[1]], label: m[2] };
}

// The chip element for a status, made with the given document.
export function buildChip(doc, status){
  const chip = doc.createElement('span');
  chip.className = CHIP_CLASS + ' ' + CHIP_CLASS + '-' + status.colour;
  const word = doc.createElement('span');
  word.className = CHIP_STATUS_CLASS;
  word.textContent = status.word + ': ';
  chip.appendChild(word);
  chip.appendChild(doc.createTextNode(status.label));
  return chip;
}

// Document pass: every code span that is a status becomes a chip, wherever it
// stands: in running text, a table cell, a heading, a link, bold text, a list
// item, a callout. A code block is no code span. Neither is a <code> that
// holds markup: marked emits a code span as text alone, so that one was
// written as HTML and stays as its author wrote it.
export function buildChips(root){
  const doc = root.ownerDocument;
  for (const code of Array.from(root.querySelectorAll('code'))){
    if (code.closest('pre') || code.children.length) continue;
    const status = readChip(code.textContent);
    if (status) code.replaceWith(buildChip(doc, status));
  }
}
