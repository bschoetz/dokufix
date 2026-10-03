import { ELEMENT, TEXT } from './nodes.js';
import { CHIP_STATUS_CLASS } from './chips.js';
import { FACET_BAR_CLASS, isFootnoteMarker } from './facets.js';
import { STEP_NUMBER_CLASS } from './steps.js';
import { documentHeadings } from './toc.js';
import { TRANSIENT_ATTR } from './transient.js';

// --- Search: the places --------------------------------------------------------
// The places of a document a search lists, each with the text it is searched
// in: every paragraph, list item, heading and table row of the preview, in the
// order of the document.
//
//   collectPlaces(root) → [{ el, text, map, kind }, …]
//   nodeRanges(map, { start, end }) → [{ startNode, startOffset, endNode, endOffset }, …]
//
// A place's text is read as the free-text filter reads a row (filter.js): a
// line break as a blank, without anything transient, without a footnote
// marker and its preview, without the word a status chip carries for
// assistive technology, without the controls of a facet filter, white space
// collapsed. A footnote's return arrows "↩" are left out as well: they are no
// text of the footnote; so is the number tile of a step (steps.js), which the
// list's numbering says. A heading's text is the one its entries show
// (headingLabelText() in toc.js), with the same things left out.
//
// A table row is a place, the header row included, and its text is the one
// filterRowText() in filter.js reads: its cells joined by a blank, with what
// that leaves out left out, and nothing more; a table nested in a cell is text
// of its row, and its own rows are no places. A row carries the kind KIND_ROW,
// "Tabelle", which the panel puts before its result; the kind is no text of
// the place, so the hits, their count and the part a result shows see the
// row's text alone. A paragraph, list item or heading has no kind.
//
// Beside its text a place carries the map of it: for every unit of the text
// the text node and offset it came from. It is made in the same walk that
// reads the text, so the two cannot drift. nodeRanges() turns the range of a
// hit in the text (search-match.js) into ranges of the document, which the
// panel draws (search.js); what the text leaves out, it leaves out as well.
//
// What is no place, nor holds one: a warning, a code block, a diagram and its
// credit, the metadata panel, the inline table of contents (its entries are
// the headings, which are places of their own), the heading of the list of
// footnotes, which the document styles hide, and whatever is transient. A
// table inside a warning or the metadata panel is no place either.
//
// A place inside a place is a place of its own and no text of the outer one: a
// list item of a loose list holds its text in a paragraph, which is the place,
// and the item itself adds none; an item that holds a nested list is read
// without it, and every item of the nested list is a place; an item that holds
// a table is read without it, and every row of the table is a place. Inside a
// row nothing is a place of its own: a paragraph or list in a cell is text of
// the row. A place without text is none.
//
// Pure logic: works on the root it is handed and changes nothing in it.

const PLACE_TAGS = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
// Read as places of their own, or as the lists and tables their items and
// rows are.
const OWN_TAGS = new Set([...PLACE_TAGS, 'UL', 'OL', 'TABLE']);
// No place, nor anything inside it.
const EXCLUDED_TAGS = new Set(['PRE', 'SVG', 'SCRIPT', 'STYLE', 'TEMPLATE']);
// What a table row is to the panel: the word before its result.
export const KIND_ROW = 'Tabelle';
const EXCLUDED_CLASSES = [
  CHIP_STATUS_CLASS, FACET_BAR_CLASS, STEP_NUMBER_CLASS,
  'dokufix-warning',        // warning.js
  'dokufix-fn-preview',     // footnotes.js, inside a marker; named for itself as well
  'dokufix-frontmatter',    // the metadata panel, frontmatter.js
  'dokufix-meta',           // the metadata of a read-only export
  'dokufix-toc',            // the inline table of contents, toc.js
  'mermaid',                // a Mermaid diagram
  'dokufix-diagram',        // a diagram's figure with its credit
];

const tagOf = node => node.nodeType === ELEMENT ? node.tagName.toUpperCase() : '';

function excluded(el){
  return el.hasAttribute(TRANSIENT_ATTR) || isFootnoteMarker(el) || EXCLUDED_TAGS.has(tagOf(el)) ||
    (tagOf(el) === 'A' && el.hasAttribute('data-footnote-backref')) ||
    // The heading marked-footnote puts above the footnotes: hidden by src/doc.css.
    (HEADING_TAGS.has(tagOf(el)) && tagOf(el.parentNode) === 'SECTION' && el.parentNode.classList.contains('footnotes')) ||
    EXCLUDED_CLASSES.some(cls => el.classList.contains(cls));
}

// A place's text is read unit by unit, and each unit remembers where it came
// from: the text node and the offset in it, or null for a blank the reading
// puts in itself (a line break, the word of a status chip in a heading). A
// part is counted up wherever the reading leaves something out (a footnote
// marker, a chip's word, a step's tile, a place, list or table inside the
// place) and at the edge of a table cell: two units of one part have nothing
// left out and no cell's edge between them in the document.
function reading(){
  return { raw: '', nodes: [], offsets: [], parts: [], part: 0 };
}
function readText(r, node){
  const data = node.data;
  for (let i = 0; i < data.length; i++){ r.nodes.push(node); r.offsets.push(i); r.parts.push(r.part); }
  r.raw += data;
}
function readBlank(r, ch){
  r.raw += ch;
  r.nodes.push(null); r.offsets.push(0); r.parts.push(r.part);
}

const SPACE = /\s/;

// The text of a reading, white space collapsed to one blank and none at its
// ends, as the free-text filter tidies a row's text, with the map of each of
// its units: a blank that stands for a run of white space maps to the first
// unit of the run that came from a node.
function finish(r){
  const { raw } = r;
  let text = '';
  const nodes = [], offsets = [], parts = [];
  const take = (ch, i) => { text += ch; nodes.push(r.nodes[i]); offsets.push(r.offsets[i]); parts.push(r.parts[i]); };
  let i = 0;
  while (i < raw.length && SPACE.test(raw[i])) i++;
  while (i < raw.length){
    if (!SPACE.test(raw[i])){ take(raw[i], i); i++; continue; }
    let from = i;
    while (i < raw.length && SPACE.test(raw[i])){ if (!r.nodes[from] && r.nodes[i]) from = i; i++; }
    if (i < raw.length) take(' ', from);
  }
  return { text, map: { nodes, offsets, parts } };
}

// The text of a paragraph or list item, without the places and lists inside it.
function blockText(block){
  const r = reading();
  const read = node => {
    for (let child = node.firstChild; child; child = child.nextSibling){
      if (child.nodeType === TEXT){ readText(r, child); continue; }
      if (child.nodeType !== ELEMENT) continue;
      const tag = tagOf(child);
      if (tag === 'BR'){ readBlank(r, ' '); continue; }
      if (excluded(child) || OWN_TAGS.has(tag)){ r.part++; continue; }
      read(child);
    }
  };
  read(block);
  return finish(r);
}

// U+0000 marks where a chip's word stood; a parsed document never holds one.
const CHIP_MARK = '\0';

// The text of a heading: its label as headingLabelText() in toc.js reads it,
// without what is left out. A chip's word gives a blank where it touches the
// text before it, and none where a blank stands before it or it opens the
// heading: "## Bestellung:`🟢 Live`" reads "Bestellung: Live".
function headingReading(h){
  const r = reading();
  const read = node => {
    for (let child = node.firstChild; child; child = child.nextSibling){
      if (child.nodeType === TEXT){ readText(r, child); continue; }
      if (child.nodeType !== ELEMENT) continue;
      if (tagOf(child) === 'BR'){ readBlank(r, ' '); continue; }
      if (child.classList.contains(CHIP_STATUS_CLASS)){ r.part++; readBlank(r, CHIP_MARK); r.part++; continue; }
      if (excluded(child) || tagOf(child) === 'TABLE'){ r.part++; continue; }
      read(child);
    }
  };
  read(h);
  // Each mark by the unit before it as it was read, as the replacement in
  // headingLabelText() goes: /(^|\s)\0/ to nothing, every other one to a blank.
  const out = reading();
  for (let i = 0; i < r.raw.length; i++){
    if (r.raw[i] !== CHIP_MARK){
      out.raw += r.raw[i]; out.nodes.push(r.nodes[i]); out.offsets.push(r.offsets[i]); out.parts.push(r.parts[i]);
    } else if (i > 0 && !SPACE.test(r.raw[i - 1])){
      out.raw += ' '; out.nodes.push(null); out.offsets.push(0); out.parts.push(r.parts[i]);
    }
  }
  return finish(out);
}

const headingText = h => headingReading(h).text;

// The text of a table row, as filterRowText() in filter.js reads it, and in
// the same order of rules: a line break as a blank; left out what is
// transient, a footnote marker with its preview, the word of a status chip and
// the controls of a facet filter; a blank before and after every cell, a cell
// of a table nested in a cell as well. Nothing else is left out: what a row
// holds is text of the row, as the filter searches it. The part is counted up
// at every cell's edge, so that no range of a hit (nodeRanges()) runs from one
// cell into the next. tests/search.test.mjs holds the two readings together.
function rowReading(row){
  const r = reading();
  const read = node => {
    for (let child = node.firstChild; child; child = child.nextSibling){
      if (child.nodeType === TEXT){ readText(r, child); continue; }
      if (child.nodeType !== ELEMENT) continue;
      const tag = tagOf(child);
      if (tag === 'BR'){ readBlank(r, ' '); continue; }
      if (child.hasAttribute(TRANSIENT_ATTR) || isFootnoteMarker(child) ||
          child.classList.contains(CHIP_STATUS_CLASS) || child.classList.contains(FACET_BAR_CLASS)){ r.part++; continue; }
      const cell = tag === 'TD' || tag === 'TH';
      if (cell){ r.part++; readBlank(r, ' '); }
      read(child);
      if (cell){ readBlank(r, ' '); r.part++; }
    }
  };
  read(row);
  return finish(r);
}

// The places under root, in the order of the document. Beside its text each
// carries its map: for every unit of the text the node and offset it came
// from, and its part (see reading() above); nodeRanges() makes node ranges
// of it. A row carries its kind as well.
export function collectPlaces(root){
  const places = [];
  const visit = node => {
    for (let child = node.firstElementChild; child; child = child.nextElementSibling){
      if (excluded(child)) continue;
      const tag = tagOf(child);
      // A row is read whole, a table in one of its cells with it.
      if (tag === 'TR'){
        const { text, map } = rowReading(child);
        if (text) places.push({ el: child, text, map, kind: KIND_ROW });
        continue;
      }
      if (PLACE_TAGS.has(tag)){
        const { text, map } = HEADING_TAGS.has(tag) ? headingReading(child) : blockText(child);
        if (text) places.push({ el: child, text, map });
      }
      visit(child);
    }
  };
  visit(root);
  return places;
}

// The ranges of the document that a hit of a place's text covers, as
//
//   nodeRanges(map, { start, end }) → [{ startNode, startOffset, endNode, endOffset }, …]
//
// one range for a hit with nothing left out inside it, however many text
// nodes it runs over (emphasis, a link, a line break), and one range per
// stretch between what is left out otherwise, so that no range covers a
// footnote marker, a chip's word or a step's tile; in a table row one range
// per cell a hit touches, so that none runs over a cell's edge. A range begins at the
// first character of its stretch that came from a node and is no white
// space, and ends behind the last such one: white space the text collapsed
// lies inside a range, never at its ends, and a blank the reading put in
// itself is none. Pure: no Range is made, the caller makes its own.
export function nodeRanges(map, { start, end }){
  const ranges = [];
  let current = null;
  for (let i = start; i < end; i++){
    const node = map.nodes[i];
    if (!node || SPACE.test(node.data[map.offsets[i]])) continue;
    if (current && map.parts[i] === current.part){
      current.endNode = node;
      current.endOffset = map.offsets[i] + 1;
      continue;
    }
    current = { part: map.parts[i], startNode: node, startOffset: map.offsets[i], endNode: node, endOffset: map.offsets[i] + 1 };
    ranges.push(current);
  }
  return ranges.map(({ startNode, startOffset, endNode, endOffset }) => ({ startNode, startOffset, endNode, endOffset }));
}

// --- Search: the results under their headings ---------------------------------
// The results of a search, grouped under the headings they stand under.
//
//   groupResults(root, results) → { groups: [group, …], sections }
//   results: [{ el, hits, … }, …], in the order of the document: el a place
//     under root (any element), hits how many hits it holds
//   group:   { heading, level, label, results, children, hits, places }
//
// The group headings are exactly the headings the rail lists (rail.js): the
// headings of the document (documentHeadings() in toc.js) of the levels H2 to
// H4, labelled as their entries are, with what a heading's place text leaves
// out left out as well (headingText() above). A result belongs to the last of
// them before it in the order of the document; a heading that holds the term
// is a result in its own group. An H5 or H6 heading and what stands under it
// belong to the H4 (or H3, H2) above it; a heading inside a callout is no group
// heading, so a result in it belongs to the group the callout stands in.
//
// What stands before the first group heading forms a group of its own: first,
// at the level of an H2, labelled with the text of the H1 before it, else
// FIRST_GROUP_LABEL. An H3 or H4 before the first H2 is a child of it.
//
// A group is listed when it holds a result or one of its children is listed;
// its results, the ones that belong to it, in the order of the document, stand
// before its children. hits and places count its branch: its own results and
// those of every group below it, so a parent listed only for its children
// does not read "0 Treffer". sections counts the listed groups that hold a
// result of their own.
//
// The groups go by the order of the document alone, not by the kind of a
// place: any element under root can be a result. Pure logic, like
// collectPlaces(): it reads root and changes nothing in it.

export const FIRST_GROUP_LABEL = 'Am Anfang';
const GROUP_TAG = /^H[234]$/;

const levelOf = h => Number(tagOf(h).slice(1));
const makeGroup = (heading, level, label) => ({ heading, level, label, results: [], children: [], hits: 0, places: 0 });

export function groupResults(root, results){
  const heads = documentHeadings(root);
  const groupHeads = new Set(heads.filter(h => GROUP_TAG.test(tagOf(h))));
  const titles = new Set(heads.filter(h => tagOf(h) === 'H1'));
  const byEl = new Map();
  for (const r of results){
    if (!byEl.has(r.el)) byEl.set(r.el, []);
    byEl.get(r.el).push(r);
  }

  const first = makeGroup(null, 2, '');
  let title = null;
  const top = [first];
  // The open groups, outermost first: where the next heading's group goes.
  const open = [first];
  let current = first;
  const visit = node => {
    for (let el = node.firstElementChild; el; el = el.nextElementSibling){
      if (groupHeads.has(el)){
        const level = levelOf(el);
        while (open.length && open[open.length - 1].level >= level) open.pop();
        current = makeGroup(el, level, headingText(el));
        (open.length ? open[open.length - 1].children : top).push(current);
        open.push(current);
      } else if (!title && titles.has(el) && current === first){
        title = el;
      }
      const own = byEl.get(el);
      if (own) current.results.push(...own);
      visit(el);
    }
  };
  visit(root);
  first.label = (title && headingText(title)) || FIRST_GROUP_LABEL;

  let sections = 0;
  // Counts a group's branch and keeps it when it holds anything; false to drop it.
  const keep = group => {
    group.children = group.children.filter(keep);
    group.places = group.results.length;
    group.hits = group.results.reduce((n, r) => n + r.hits, 0);
    for (const child of group.children){ group.places += child.places; group.hits += child.hits; }
    if (group.results.length) sections++;
    return group.places > 0;
  };
  return { groups: top.filter(keep), sections };
}
