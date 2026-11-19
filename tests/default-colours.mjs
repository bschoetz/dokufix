// dokufix's default colours, as a browser computes them: every colour variable
// tests/vergleich.mjs asks for, with the value it had as a literal before the
// run read its colours from the file under test (story 6.3). They pin the
// default look: tests/default-colours.test.mjs holds them against the :root
// rule of src/doc.css, and vergleich.mjs falls back to them for a file whose
// doc-css block has no --dokufix- variables (the PoC).
export const DEFAULT_COLOURS = {
  'accent': 'rgb(212, 255, 0)',
  'accent-tint-30': 'rgba(212, 255, 0, 0.3)',
  'chip-grey': 'rgb(87, 96, 106)',
  'chip-grey-text': 'rgb(66, 74, 83)',
  'chip-grey-tint': 'rgb(234, 238, 242)',
  'code-bg': 'rgb(243, 246, 250)',
  'code-line': 'rgb(221, 228, 238)',
  'code-text': 'rgb(28, 39, 51)',
  'inverse': 'rgb(28, 28, 30)',
  'line': 'rgb(229, 229, 234)',
  'line-active': 'rgb(28, 28, 30)',
  'line-faint': 'rgb(142, 142, 146)',
  'link': 'rgb(0, 102, 204)',
  'notice-bg': 'rgb(255, 248, 225)',
  'status-caution': 'rgb(207, 34, 46)',
  'status-caution-text': 'rgb(164, 14, 38)',
  'status-caution-tint': 'rgb(255, 235, 233)',
  'status-important': 'rgb(130, 80, 223)',
  'status-note': 'rgb(9, 105, 218)',
  'status-note-text': 'rgb(5, 80, 174)',
  'status-note-tint': 'rgb(221, 244, 255)',
  'status-tip': 'rgb(26, 127, 55)',
  'status-tip-text': 'rgb(17, 99, 41)',
  'status-tip-tint': 'rgb(218, 251, 225)',
  'status-warning': 'rgb(154, 103, 0)',
  'status-warning-text': 'rgb(125, 78, 0)',
  'status-warning-tint': 'rgb(255, 248, 197)',
  'surface': 'rgb(255, 255, 255)',
  'surface-alt': 'rgb(250, 250, 250)',
  'surface-sunken': 'rgb(240, 240, 243)',
  'text': 'rgb(28, 28, 30)',
  'text-muted': 'rgb(110, 110, 115)',
  'text-soft': 'rgb(58, 58, 63)',
};

// A variable's value as a browser computes it: #rgb and #rrggbb as rgb(r, g, b),
// rgba() with the alpha as a number; anything else is null.
export function computedColour(v){
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m){
    const h = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1];
    return 'rgb(' + [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ') + ')';
  }
  m = v.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
  return m ? 'rgba(' + m[1] + ', ' + m[2] + ', ' + m[3] + ', ' + parseFloat(m[4]) + ')' : null;
}
