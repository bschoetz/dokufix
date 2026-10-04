// --- Search: the match -------------------------------------------------------
// Where a term occurs in the text of one place of the document, as ranges of
// that text, and the part of the text a result shows around them. The places
// and their text come from search-places.js, the panel that shows the results
// from search.js; the table filter matches by it as well, with both options
// off (filterMatches() of filter.js, epic 5, story 11), so what the comparison
// does comes in as options, not as the panel's state.
//
//   findHits('tabelle', 'Eine Tabelle, noch eine Tabelle.')
//     → [{ start: 5, end: 12 }, { start: 24, end: 31 }]
//   findHits('statuschip', 'ein Status-Chip.', { fuzzy: true })
//     → [{ start: 4, end: 15 }]
//   findHits('tabelle', 'Tabelle', { caseSensitive: true }) → []
//
// Without options the term is compared with blanks collapsed, case ignored,
// German rules of case (toLocaleLowerCase('de')); the free-text filter
// compares so as well, by asking this module (filter.js). A blank at an edge
// of the term is no character of it but a word boundary (story 14): at its
// end the hit ends where the text ends or a character follows that is no
// letter or digit, at its start it starts behind such a one; "Klick " finds
// "Klick." and "Klick", not "Klicken", " Klick" not "Doppelklick". Every
// character but a letter or a digit stands at a boundary, a hyphen, "_" and an
// emoji too; a mark belongs to the character before it: a combining accent to
// its letter, so "Cafe " does not find "Cafe" + U+0301, a variation selector
// to its emoji, so " Klick" finds "⚠️Klick". The range is
// the word's, without the blank. A hit at no boundary is none, and the next
// one is looked for from its second character.
// Two options change that:
// - caseSensitive: case counts; nothing is lowered.
// - fuzzy, light fuzzy: white space, hyphens (-, U+2010, U+2011, the soft
//   hyphen U+00AD) and dots are ignored in the term and in the text, so
//   "statuschip", "Status Chip" and "status.chip" find "Status-Chip". Nothing
//   else: no umlaut folded, "oe" is no "ö", no letters swapped. Since it
//   ignores blanks, a blank at an edge of the term marks no boundary either.
// Lowering can change the length of a text, "İ" becomes "i̇", two UTF-16
// units, and fuzzy leaves characters out; so the text is compared one
// character at a time, and each unit compared remembers the character it came
// from. A range is always one of the original text and covers whole
// characters of it; a fuzzy hit spans from its first to its last matched
// character, the ignored ones between them included, none before or after.
// Where nothing of that can happen, without fuzzy, the text is lowered whole,
// which is one call in place of one per character: where that leaves its
// length as it is and the text holds no capital sigma "Σ". Lowered whole, a
// "Σ" at the end of a word becomes "ς", one at a time always "σ"; the term
// and the text stay compared one at a time there, as they always were. No
// other character of German case rules lowers by its neighbours, and one
// whose lowered form is longer changes the length. A surrogate pair maps both
// its units to the whole character, as one at a time.
//
// A term too short is not searched (tooShort()): it needs three letters or
// digits, unless it holds another character, an emoji, "#", or "-" without
// fuzzy, or is "ae", "oe", "ue" or "ss" in any case. A blank is neither a
// letter nor another character, so "a b" is too short. Under fuzzy the rule
// applies to what is compared: "S-C" is too short.
//
// Pure logic: strings in, numbers out.

const isHigh = code => code >= 0xD800 && code <= 0xDBFF;
const isLow = code => code >= 0xDC00 && code <= 0xDFFF;

// White space collapsed, none at the ends.
const tidy = text => String(text).replace(/\s+/g, ' ').trim();

// The characters light fuzzy ignores, in the term and in the text.
const IGNORED = /^[\s\-\u2010\u2011\u00AD.]$/u;

// The text as it is compared, and for each unit of it where the character it
// came from starts and ends in the original text: lowered unless case counts,
// without the characters fuzzy ignores.
function compared(text, { caseSensitive = false, fuzzy = false } = {}){
  const from = [], to = [];
  if (!fuzzy){
    const whole = caseSensitive ? text : text.toLocaleLowerCase('de');
    if (whole.length === text.length && !text.includes('Σ')){
      for (let i = 0; i < text.length; i++){
        const pair = isHigh(text.charCodeAt(i)) && isLow(text.charCodeAt(i + 1));
        from.push(i); to.push(i + (pair ? 2 : 1));
        if (pair){ from.push(i); to.push(i + 2); i++; }
      }
      return { out: whole, from, to };
    }
  }
  let out = '';
  let at = 0;
  for (const ch of text){
    if (!(fuzzy && IGNORED.test(ch))){
      const part = caseSensitive ? ch : ch.toLocaleLowerCase('de');
      for (let k = 0; k < part.length; k++){ from.push(at); to.push(at + ch.length); }
      out += part;
    }
    at += ch.length;
  }
  return { out, from, to };
}

// What a word is made of: letters and digits. Every other character stands at
// a word boundary. A mark (a combining accent, an emoji's variation selector)
// belongs to the character before it.
const WORD = /[\p{L}\p{N}]/u;
const MARK = /\p{M}/u;
// The character that ends before index at of text, a surrogate pair as one.
function charBefore(text, at){
  const pair = at > 1 && isLow(text.charCodeAt(at - 1)) && isHigh(text.charCodeAt(at - 2));
  return text.slice(at - (pair ? 2 : 1), at);
}
// Whether a word goes on before index at of text: the character there, past
// the marks it carries, is a letter or a digit; at the start there is none.
function wordBefore(text, at){
  while (at > 0){
    const ch = charBefore(text, at);
    if (!MARK.test(ch)) return WORD.test(ch);
    at -= ch.length;
  }
  return false;
}
// Whether a word goes on at index at of text: a letter or a digit stands
// there, or a mark, which belongs to the character the hit ends with, so the
// hit ends inside it; at the end of the text there is none.
function wordAt(text, at){
  if (at >= text.length) return false;
  const ch = String.fromCodePoint(text.codePointAt(at));
  return WORD.test(ch) || MARK.test(ch);
}

// The term as it is compared: tidied, without what fuzzy ignores.
const termOf = (term, fuzzy) => {
  const t = tidy(term);
  return fuzzy ? Array.from(t).filter(ch => !IGNORED.test(ch)).join('') : t;
};

// The short terms searched all the same: the usual spellings of ä, ö, ü, ß.
const EXEMPT = new Set(['ae', 'oe', 'ue', 'ss']);
// How many letters or digits a term needs.
const MIN_LETTERS = 3;

// Whether a term is too short to be searched, by the rule above. An empty
// term is too short as well; the panel says nothing for an empty field before
// it asks.
export function tooShort(term, { fuzzy = false } = {}){
  const t = termOf(term, fuzzy);
  if (EXEMPT.has(t.toLowerCase())) return false;
  let letters = 0;
  for (const ch of t){
    if (/[\p{L}\p{N}]/u.test(ch)) letters++;
    // A combining mark belongs to its letter; a blank is neither.
    else if (!/[\s\p{M}]/u.test(ch)) return false;
  }
  return letters < MIN_LETTERS;
}

// Every occurrence of the term in the text, in order and not overlapping, as
// { start, end } of the text: end is the index after the hit. [] for an empty
// term, one that fuzzy leaves empty, and a term that does not occur. Whether
// the term is long enough is tooShort()'s to say, not this.
export function findHits(term, text, options = {}){
  const wanted = compared(termOf(term, options.fuzzy), options).out;
  if (!wanted) return [];
  text = String(text);
  // The word boundaries a blank at an edge of the term asks for, not under fuzzy.
  const raw = String(term);
  const atStart = !options.fuzzy && /^\s/.test(raw), atEnd = !options.fuzzy && /\s$/.test(raw);
  const { out, from, to } = compared(text, options);
  const hits = [];
  let end = 0;
  for (let i = out.indexOf(wanted); i >= 0; i = out.indexOf(wanted, i + 1)){
    const start = from[i];
    // A hit that begins inside the character the last one ended in.
    if (start < end) continue;
    const stop = to[i + wanted.length - 1];
    if ((atStart && wordBefore(text, start)) || (atEnd && wordAt(text, stop))) continue;
    end = stop;
    hits.push({ start, end });
    i += wanted.length - 1;
  }
  return hits;
}


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
