import { ELEMENT, TEXT } from './nodes.js';
import { CHIP_STATUS_CLASS } from './chips.js';
import { FACET_BAR_CLASS, isFootnoteMarker } from './facets.js';
import { STEP_NUMBER_CLASS } from './steps.js';
import { documentHeadings, headingLabelText } from './toc.js';
import { TRANSIENT_ATTR } from './transient.js';

// --- Search: the places --------------------------------------------------------
// The places of a document a search lists, each with the text it is searched
// in: every paragraph, list item and heading of the preview, in the order of
// the document.
//
//   collectPlaces(root) → [{ el, text }, …]
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
// What is no place, nor holds one: a warning, a table with its cells, a code
// block, a diagram and its credit, the metadata panel, the inline table of
// contents (its entries are the headings, which are places of their own), the
// heading of the list of footnotes, which the document styles hide, and
// whatever is transient.
//
// A place inside a place is a place of its own and no text of the outer one: a
// list item of a loose list holds its text in a paragraph, which is the place,
// and the item itself adds none; an item that holds a nested list is read
// without it, and every item of the nested list is a place. A place without
// text is none.
//
// Pure logic: works on the root it is handed and changes nothing in it.

const PLACE_TAGS = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
// Read as places of their own, or as the lists their items are.
const OWN_TAGS = new Set([...PLACE_TAGS, 'UL', 'OL']);
// No place, nor anything inside it.
const EXCLUDED_TAGS = new Set(['TABLE', 'PRE', 'SVG', 'SCRIPT', 'STYLE', 'TEMPLATE']);
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
const tidy = text => String(text).replace(/\s+/g, ' ').trim();

function excluded(el){
  return el.hasAttribute(TRANSIENT_ATTR) || isFootnoteMarker(el) || EXCLUDED_TAGS.has(tagOf(el)) ||
    (tagOf(el) === 'A' && el.hasAttribute('data-footnote-backref')) ||
    // The heading marked-footnote puts above the footnotes: hidden by src/doc.css.
    (HEADING_TAGS.has(tagOf(el)) && tagOf(el.parentNode) === 'SECTION' && el.parentNode.classList.contains('footnotes')) ||
    EXCLUDED_CLASSES.some(cls => el.classList.contains(cls));
}

// The text of a paragraph or list item, without the places and lists inside it.
function blockText(block){
  let text = '';
  const read = node => {
    for (let child = node.firstChild; child; child = child.nextSibling){
      if (child.nodeType === TEXT){ text += child.data; continue; }
      if (child.nodeType !== ELEMENT) continue;
      const tag = tagOf(child);
      if (tag === 'BR'){ text += ' '; continue; }
      if (excluded(child) || OWN_TAGS.has(tag)) continue;
      read(child);
    }
  };
  read(block);
  return tidy(text);
}

// The text of a heading: its label, from a copy without what is left out.
function headingText(h){
  const copy = h.cloneNode(true);
  for (const el of Array.from(copy.querySelectorAll('*'))){
    if (tagOf(el) === 'BR') el.replaceWith(copy.ownerDocument.createTextNode(' '));
    else if (excluded(el) && !el.classList.contains(CHIP_STATUS_CLASS)) el.remove();
  }
  return tidy(headingLabelText(copy));
}

// The places under root, in the order of the document.
export function collectPlaces(root){
  const places = [];
  const visit = node => {
    for (let child = node.firstElementChild; child; child = child.nextElementSibling){
      if (excluded(child)) continue;
      const tag = tagOf(child);
      if (PLACE_TAGS.has(tag)){
        const text = HEADING_TAGS.has(tag) ? headingText(child) : blockText(child);
        if (text) places.push({ el: child, text });
      }
      visit(child);
    }
  };
  visit(root);
  return places;
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
