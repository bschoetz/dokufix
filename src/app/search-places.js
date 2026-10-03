import { ELEMENT, TEXT } from './nodes.js';
import { CHIP_STATUS_CLASS } from './chips.js';
import { FACET_BAR_CLASS, isFootnoteMarker } from './facets.js';
import { STEP_NUMBER_CLASS } from './steps.js';
import { headingLabelText } from './toc.js';
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
