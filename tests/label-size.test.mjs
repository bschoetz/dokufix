// The label measurer, run in Node: no browser, no bpmn-js.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/app/label-size.js replicates the text layout of diagram-js with a width
// table of Arial at 12 px, and gives the size of a label or a text annotation
// as bpmn-js draws it. Checked here: the table (every character of its ranges,
// whole font units, the kerning pairs of its characters), the width of a text
// (characters, kerning, the fallbacks), the lines as diagram-js breaks them
// (the author's line breaks, an empty line, leading and trailing blanks, a
// blank, a hyphen and a soft hyphen as places to break, the cut word, the fit
// condition "<=") and the sizes with the renderer's rounding and second pass.
// The expected values are the sizes and lines bpmn-js 18.31.0 gives in
// Chromium with Arial's metrics (Liberation Sans, 2026-10-07; each line here
// was compared with the tspans of its createText());
// tests/check-label-size.mjs compares the measurer with bpmn-js on every text
// of the fixtures and on the hard ones.

import test from 'node:test';
import assert from 'node:assert/strict';
import { measureLabel, labelBox, textWidth, layoutText, missingFromTable, LABEL_FONT, LABEL_SIZE_VERSION, LABEL_FONT_SIZE } from '../src/app/label-size.js';

const px = units => units * 12 / 2048;

test('the font and the versions the measurer follows', () => {
  assert.equal(LABEL_FONT, 'Arial, sans-serif');
  assert.deepEqual(LABEL_SIZE_VERSION, { 'diagram-js': '15.28.0', 'bpmn-js': '18.31.0' });
});

test('the table: every character of its ranges has a width in whole font units, none is missing, and the tab and the soft hyphen are in it', () => {
  const ranges = [[0x20, 0x7e], [0xa0, 0x17f], [0x2010, 0x2027], [0x2030, 0x203a], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x9, 0x9]];
  let count = 0;
  for (const [a, b] of ranges) for (let c = a; c <= b; c++){
    const ch = String.fromCharCode(c), units = textWidth(ch) * 2048 / 12;
    assert.deepEqual(missingFromTable(ch), [], 'U+' + c.toString(16));
    assert.equal(Math.abs(units - Math.round(units)) < 1e-9, true, 'U+' + c.toString(16) + ': ' + units);
    count++;
  }
  assert.equal(count, 357);
  assert.equal(textWidth('\u00AD'), 0, 'a soft hyphen takes no room');
  assert.equal(textWidth('\t'), px(569), 'a tab is as wide as a blank');
  assert.deepEqual(missingFromTable('ab\ncd\r\n請🎉'), ['請', '🎉'], 'a line break is no character of a line');
});

test('the width of a text: the advances added, the kerning of neighbouring pairs, Arial\'s metrics', () => {
  assert.equal(textWidth('a'), px(1139));
  assert.equal(textWidth('ja'), px(455 + 1139));
  assert.equal(textWidth('AV'), px(1366 + 1366 - 152), 'the pair AV is kerned');
  assert.equal(textWidth('A V'), px(1366 + 569 + 1366), 'not across a blank');
  assert.equal(textWidth('Medium von Hand prüfen'), 134.7421875, 'as canvas.measureText gives it in Chromium with Liberation Sans (2026-10-07)');
  assert.equal(textWidth(''), 0);
});

test('a character outside the table takes a fallback: an em for CJK, the emoji font\'s width for an emoji, the mean for the rest', () => {
  assert.equal(textWidth('請'), 12);
  assert.equal(textWidth('🎉'), 14.97247314453125);
  const mean = textWidth('Ѐ');
  assert.ok(mean > 5 && mean < 8, String(mean));
  assert.equal(textWidth('aЀ'), px(1139) + mean);
});

test('the lines as diagram-js breaks them: at a blank, the blank kept at the line\'s end, trailing blanks not counted', () => {
  assert.deepEqual(layoutText('Abwesenheit, nichts zu tun', 90).map(l => l.text), ['Abwesenheit, ', 'nichts zu tun']);
  const [first] = layoutText('Abwesenheit, nichts zu tun', 90);
  assert.equal(first.width, textWidth('Abwesenheit,'), 'the width without the trailing blank');
  assert.deepEqual(layoutText('eine sehr lange Beschriftung eines Flusses, die bpmn-js auf mehrere Zeilen umbricht', 90).map(l => l.text),
    ['eine sehr lange ', 'Beschriftung ', 'eines Flusses, ', 'die bpmn-js auf ', 'mehrere Zeilen ', 'umbricht']);
});

test('the author\'s line breaks count, \\r\\n like \\n, an empty line is a line, a soft hyphen before a break falls away, leading blanks stay', () => {
  assert.deepEqual(layoutText('Erste Zeile\nzweite Zeile', 90).map(l => l.text), ['Erste Zeile', 'zweite Zeile']);
  assert.deepEqual(layoutText('Zeile eins\r\nZeile zwei\n\nnach Leerzeile', 90).map(l => l.text), ['Zeile eins', 'Zeile zwei', '', 'nach Leerzeile']);
  assert.deepEqual(layoutText('\n\neins', 86).map(l => ({ ...l })), [{ text: '', width: 0 }, { text: '', width: 0 }, { text: 'eins', width: textWidth('eins') }]);
  assert.deepEqual(layoutText('Softbreak\u00AD\nim Wort', 90).map(l => l.text), ['Softbreak', 'im Wort']);
  // A line that starts with a blank: its first part is empty, which ends the shortening at a blank, so the line is cut in the word.
  assert.deepEqual(layoutText(' führende Leerzeichen', 90).map(l => l.text), [' führende Leerz', 'eichen']);
  // Two blanks in a row: the empty part between them ends the shortening there; what is left is trimmed.
  assert.deepEqual(layoutText('doppelte  Leerzeichen  innen', 90).map(l => l.text), ['doppelte ', 'Leerzeichen ', 'innen']);
});

test('a hyphen and a soft hyphen are places to break; a word longer than the box is cut, and so is one whose part before the hyphen is; a line of one character always fits', () => {
  assert.deepEqual(layoutText('Ein-, Aus- und Durchgang', 90).map(l => l.text), ['Ein-, Aus-', 'und Durchgang']);
  assert.deepEqual(layoutText('Kunden-Nr. 4711-0815', 90).map(l => l.text), ['Kunden-Nr. ', '4711-0815']);
  assert.deepEqual(layoutText('e-mail-benachrichtigung-versendet', 90).map(l => l.text), ['e-mail-', 'benachrichtigun', 'g-versendet']);
  // The shortening takes whole parts while they fit the count of characters; a first part that does not leaves nothing, and the line is cut.
  assert.deepEqual(layoutText('Rechnungsprüfungs-Workflow', 90).map(l => l.text), ['Rechnungsprüfu', 'ngs-Workflow']);
  assert.deepEqual(layoutText('Donaudampfschifffahrtsgesellschaftskapitän', 90).map(l => l.text), ['Donaudampfsch', 'ifffahrtsgesellsc', 'haftskapitän']);
  assert.deepEqual(layoutText('x'.repeat(40), 90).map(l => l.text), ['x'.repeat(14), 'x'.repeat(14), 'x'.repeat(12)]);
  assert.deepEqual(layoutText('WWWWWWWWWWWWWWW', 90).map(l => l.text), ['WWWWWWW', 'WWWWWWW', 'W']);
  assert.deepEqual(layoutText('Soft\u00ADbreak im Wort', 30).map(l => l.text), ['Soft-', 'brea', 'k im ', 'Wort'], 'the soft hyphen at the end becomes a hyphen');
  assert.deepEqual(layoutText('a', 0).map(l => l.text), ['a']);
});

test('a line fits when it is at most as wide as the box (diagram-js 15.27.3 and later: "<=", not "<" of the rounded width)', () => {
  const w = textWidth('Erledigt');
  assert.deepEqual(layoutText('Erledigt', w).map(l => l.text), ['Erledigt'], 'exactly as wide as the box');
  assert.deepEqual(layoutText('Erledigt', w - 0.001).map(l => l.text), ['Erledig', 't']);
});

test('a label, in 11 px: the widest line and the lines of 13.2 px, both rounded up, in a box of 90 px', () => {
  assert.equal(LABEL_FONT_SIZE, 11);
  assert.deepEqual(measureLabel('ja'), { w: 9, h: 14 });
  assert.deepEqual(measureLabel('nein'), { w: 21, h: 14 });
  assert.deepEqual(measureLabel('Wunsch eingegangen'), { w: 64, h: 27 });
  assert.deepEqual(measureLabel('Vorrätig?'), { w: 45, h: 14 });
  assert.deepEqual(measureLabel('Nach zehn Arbeitstagen ohne Entscheidung'), { w: 67, h: 53 });
  assert.deepEqual(measureLabel(''), { w: 0, h: 14 });
});

test('a label is laid out again in its own width when bpmn-js draws it, which can take a line more: the height follows the lines as drawn', () => {
  // "Alle Zitzen gemolken?" in 11 px: two lines in 90 px, 54 px wide; in 54 px three lines.
  assert.deepEqual(layoutText('Alle Zitzen gemolken?', 90, LABEL_FONT_SIZE).map(l => l.text), ['Alle Zitzen ', 'gemolken?']);
  assert.deepEqual(layoutText('Alle Zitzen gemolken?', 54, LABEL_FONT_SIZE).map(l => l.text), ['Alle ', 'Zitzen ', 'gemolken?']);
  assert.deepEqual(measureLabel('Alle Zitzen gemolken?'), { w: 54, h: 41 });
});

test('a label with a word wider than 90 px is laid out in a box as wide as its words need, which is its width: no word is cut (Ben, 2026-10-07, nz19-pool1)', () => {
  assert.equal(labelBox('Wunsch eingegangen'), 90);
  assert.deepEqual(layoutText('Verzögerungsmeldung', 90, LABEL_FONT_SIZE).map(l => l.text), ['Verzögerungsmel', 'dung']);
  assert.equal(labelBox('Verzögerungsmeldung\nerhalten'), 111);
  assert.deepEqual(measureLabel('Verzögerungsmeldung\nerhalten'), { w: 111, h: 27 });
  assert.deepEqual(measureLabel('Verzögerungsmitteilung\nan Vertriebsmitarbeiter'), { w: 115, h: 27 });
  // Where diagram-js, shortening by the ratio of the widths, would still cut a word in the widest word's width, the box grows until it cuts none.
  const box = labelBox('Zahlung an Inkassodienstleister übergeben');
  assert.ok(box > Math.ceil(layoutText('Inkassodienstleister', 200, LABEL_FONT_SIZE)[0].width));
  assert.equal(layoutText('Zahlung an Inkassodienstleister übergeben', box, LABEL_FONT_SIZE).map(l => l.text.trim()).join(' '), 'Zahlung an Inkassodienstleister übergeben');
});

test('a text annotation, in 12 px: its lines in the width less 7 px either side, 14.4 px each and 14 px of padding, rounded, at least 40 px', () => {
  assert.deepEqual(measureLabel('kurz', 100), { w: 100, h: 40 });
  assert.deepEqual(measureLabel('eins\nzwei\ndrei', 100), { w: 100, h: 57 });
  assert.deepEqual(measureLabel('Bei Großkunden Vertrag prüfen!!', 100), { w: 100, h: 57 });
  assert.deepEqual(measureLabel('Bei Großkunden Vertrag prüfen!!', 150), { w: 150, h: 43 });
  assert.deepEqual(measureLabel('Vier-Augen-Prinzip ab 5.000 Euro', 100), { w: 100, h: 57 });
  assert.deepEqual(measureLabel('Vier-Augen-Prinzip ab 5.000 Euro', 200), { w: 200, h: 40 });
});
