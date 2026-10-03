// --- Search: the match -------------------------------------------------------
// Where a term occurs in the text of one place of the document, as ranges of
// that text, and the part of the text a result shows around them. The places
// and their text come from search-places.js, the panel that shows the results
// from search.js.
//
//   findHits('tabelle', 'Eine Tabelle, noch eine Tabelle.')
//     → [{ start: 5, end: 12 }, { start: 24, end: 31 }]
//
// The term is compared as the free-text filter compares it (filter.js): blanks
// collapsed and none at its ends, case ignored, German rules of case
// (toLocaleLowerCase('de')). Lowercasing can change the length of a text, "İ"
// becomes "i̇", two UTF-16 units; so the text is lowered one character at a
// time and each lowered unit remembers the character it came from. A range is
// always one of the original text, and covers whole characters of it.
//
// Pure logic: strings in, numbers out.

// White space collapsed, none at the ends.
const tidy = text => String(text).replace(/\s+/g, ' ').trim();

// The text lowered, and for each unit of the result where the character it
// came from starts and ends in the original text.
function lowered(text){
  let low = '';
  const from = [], to = [];
  let at = 0;
  for (const ch of text){
    const part = ch.toLocaleLowerCase('de');
    for (let k = 0; k < part.length; k++){ from.push(at); to.push(at + ch.length); }
    low += part;
    at += ch.length;
  }
  return { low, from, to };
}

// Every occurrence of the term in the text, in order and not overlapping, as
// { start, end } of the text: end is the index after the hit. [] for an empty
// term and for a term that does not occur.
export function findHits(term, text){
  const wanted = lowered(tidy(term)).low;
  if (!wanted) return [];
  const { low, from, to } = lowered(String(text));
  const hits = [];
  let end = 0;
  for (let i = low.indexOf(wanted); i >= 0; i = low.indexOf(wanted, i + 1)){
    const start = from[i];
    // A hit that begins inside the character the last one ended in.
    if (start < end) continue;
    end = to[i + wanted.length - 1];
    hits.push({ start, end });
    i += wanted.length - 1;
  }
  return hits;
}

const isLow = code => code >= 0xDC00 && code <= 0xDFFF;

// The part of the text a result shows: at most max units around the first
// hit, a quarter of it before the hit, cut at a blank where one is near, and
// the hits that lie in it, clipped to it, as ranges of that part. cutStart
// and cutEnd say whether text was left out before and after it. A text up to
// max units is shown whole.
//
//   excerpt(text, hits, max) → { text, hits: [{ start, end }], cutStart, cutEnd }
export function excerpt(text, hits, max){
  text = String(text);
  let from = 0, to = text.length;
  if (text.length > max){
    const first = hits.length ? hits[0] : { start: 0, end: 0 };
    from = Math.max(0, first.start - Math.floor(max / 4));
    to = Math.min(text.length, from + max);
    from = Math.max(0, to - max);
    // At a blank where one is near, and never into the first hit.
    if (from > 0){
      const blank = text.indexOf(' ', from);
      if (blank >= 0 && blank + 1 <= first.start && blank - from < 20) from = blank + 1;
    }
    if (to < text.length){
      const blank = text.lastIndexOf(' ', to);
      if (blank > from && blank >= first.end && to - blank < 20) to = blank;
    }
    // Never between the two halves of a character outside the BMP.
    if (from > 0 && isLow(text.charCodeAt(from))) from++;
    if (to < text.length && isLow(text.charCodeAt(to))) to--;
  }
  const inside = [];
  for (const hit of hits){
    const start = Math.max(hit.start, from), end = Math.min(hit.end, to);
    if (start < end) inside.push({ start: start - from, end: end - from });
  }
  return { text: text.slice(from, to), hits: inside, cutStart: from > 0, cutEnd: to < text.length };
}
