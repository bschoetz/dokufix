import { buildWarning, errorMessage } from './warning.js';
import { ELEMENT, COMMENT, isBlank } from './nodes.js';
import { CARDS } from './cards.js';
import { STEPS } from './steps.js';
import { FACETS } from './facets.js';

// --- Block markers -----------------------------------------------------------
// A comment that starts with "dokufix:" applies a named component to the block
// that directly follows it (decision D1 of 2026-10-01):
//
//   <!-- dokufix: cards -->
//   - **Selbstabholung** Am Schalter, sofort.
//   - **Versand** Per Post.
//
// A marker may take an argument, what follows its name:
//
//   <!-- dokufix: facets Typ -->
//   | Merkmal | Typ |
//
// dokufix adds no syntax and leaves the tokens of marked alone: marked lets raw
// HTML through, so the comment arrives as a comment node in front of its
// block, and this pass works on the rendered document. A renderer that lets
// HTML comments through as well shows the block without the marker: a plain
// list. A comment that does not start with "dokufix:" is none of this pass's
// business and stays where it is. A marker written as code, in a code span or
// a code block, is text and no comment.
//
// As marked emits it:
//
//   <!-- dokufix: cards -->         <!-- dokufix: cards -->\n<ul>…         the list becomes cards
//   - a
//   <!-- dokufix: cards -->         <!-- dokufix: cards --><ul>…           the same: blank lines do not count
//   (blank line)
//   - a
//   <!-- dokufix: a -->             <!-- dokufix: a -->\n<!-- dokufix: b -->\n<ul>…
//   <!-- dokufix: b -->                                                     both apply to the list
//   - a
//   <!-- dokufix: cards -->         <!-- dokufix: cards -->\n<p>Text</p>\n<ul>…
//   Text                                                                    warning: not directly before
//   (blank line)
//   - a
//   Text <!-- dokufix: cards -->    <p>Text <!-- dokufix: cards --></p>\n<ul>…
//   (blank line)                                                            warning, after the paragraph
//   - a
//   `<!-- dokufix: cards -->`       <code>&lt;!-- dokufix: cards --&gt;</code>    code, left alone
//
// A marker that can take effect is applied and removed from the document. One
// that cannot becomes the product's warning (warning.js) at its place, and the
// block stays what it was: an unknown name, a block of another kind, no block
// directly after it, something after the name that the marker does not take,
// the same marker a second time before one block, a component that refuses
// its block.
// Nothing fails silently, and nothing fails loudly either: no marker stops the
// ones after it, and none reaches the containment of the pass runner.
//
// An author cannot set a class through a marker. Only a name of the list
// below acts, and what it does is what its component does.
//
// Pure logic: the pass works on the root it is handed and makes its warnings
// with the document of that root, so this loads and runs without a page.

// The known markers: the one list. Each entry is
//
//   name      what an author writes after "dokufix:", in small letters
//   block     the tag of the block it expects directly after it; BLOCKS has
//             the word a warning uses for it
//   argument  how what follows the name is read: 'none', the marker takes
//             nothing and warns when something stands there; 'text', it is
//             handed to apply as readMarker() read it
//   apply     (block, argument): what the component does to its block. A
//             component that cannot act on this block changes nothing and
//             returns { warning: reason }; the reason ends the sentence
//             "Die Markierung „…“ …" and becomes the marker's warning
//
// A story that brings a component with a marker adds its entry here and, if
// the block is of a kind no marker expected so far, its word to BLOCKS.
export const MARKERS = [CARDS, STEPS, FACETS];

// The blocks a marker can expect, by tag, as a warning names them: "… erwartet
// direkt danach eine Aufzählung".
export const BLOCKS = {
  UL: 'eine Aufzählung',
  OL: 'eine nummerierte Liste',
  TABLE: 'eine Tabelle',
};

// A warning names its marker as written, on one line and not without end.
const WRITTEN_MAX = 80;
const IS_MARKER = /^\s*dokufix:/i;
// The name: a letter, then letters, digits and hyphens. After it nothing, or
// white space and the argument.
const MARKER = /^\s*dokufix:\s*([a-z][a-z0-9-]*)(?:\s+([\s\S]*?))?\s*$/i;

// What a comment says, by its text. null when it is no marker. Otherwise
//
//   written   the marker as its author wrote it, for a warning
//   name      the name in small letters; '' when none can be read
//   argument  what follows the name, without the double quotes around it
//   quoted    whether it stood in double quotes
//
// "dokufix:" and the name are read in any case, like the marker of a callout.
export function readMarker(text){
  const data = String(text);
  if (!IS_MARKER.test(data)) return null;
  const line = data.trim().replace(/\s+/g, ' ');
  const written = line.length > WRITTEN_MAX ? line.slice(0, WRITTEN_MAX) + '…' : line;
  const m = MARKER.exec(data);
  if (!m) return { written, name: '', argument: '', quoted: false };
  const raw = m[2] || '';
  const quote = /^"([\s\S]*)"$/.exec(raw);
  return { written, name: m[1].toLowerCase(), argument: quote ? quote[1] : raw, quoted: !!quote };
}

// The texts of the warnings. German, like everything a reader sees.
const known = markers => 'Bekannt sind: ' + markers.map(m => m.name).join(', ') + '.';
const WARNINGS = {
  noName: (marker, markers) => 'Die Markierung „' + marker.written + '“ nennt keine Komponente. ' + known(markers),
  unknown: (marker, markers) => 'Unbekannte Markierung „' + marker.written + '“. ' + known(markers),
  argument: marker => 'Die Markierung „' + marker.written + '“ nimmt keine Angabe hinter ihrem Namen.',
  block: (marker, entry) => 'Die Markierung „' + marker.written + '“ erwartet direkt danach ' + BLOCKS[entry.block] + '.',
  twice: marker => 'Die Markierung „' + marker.written + '“ steht mehr als einmal vor demselben Block.',
  failed: marker => 'Die Markierung „' + marker.written + '“ konnte nicht angewendet werden.',
  refused: (marker, reason) => 'Die Markierung „' + marker.written + '“ ' + reason,
};

// The warning of a marker whose component refused its block, with the reason
// the component gave. The comparison run asks here as well.
export function refusedMarker(marker, reason){
  return WARNINGS.refused(marker, reason);
}

// What a marker comes to, before anything is changed: { entry }, its entry of
// the list, when it can act on a block with that tag, or { warning }, the text
// that takes its place. blockTag is the tag of the element directly after it,
// '' when there is none. The comparison run asks here as well, so that it does
// not say a second time what a marker does.
export function judgeMarker(marker, blockTag, markers = MARKERS){
  if (!marker.name) return { warning: WARNINGS.noName(marker, markers) };
  // Looked up in the list, never as a property of an object: "constructor" is
  // a name like any other, and unknown.
  const entry = markers.find(m => m.name === marker.name);
  if (!entry) return { warning: WARNINGS.unknown(marker, markers) };
  if (entry.argument === 'none' && (marker.argument || marker.quoted)) return { warning: WARNINGS.argument(marker) };
  if (blockTag !== entry.block) return { warning: WARNINGS.block(marker, entry) };
  return { entry };
}

// Every comment under root, in the order of the document.
function commentsIn(root){
  const found = [];
  const walk = node => {
    for (let child = node.firstChild; child; child = child.nextSibling){
      if (child.nodeType === COMMENT) found.push(child);
      else if (child.nodeType === ELEMENT) walk(child);
    }
  };
  walk(root);
  return found;
}

// The block a marker applies to: the element directly after it. Only blanks
// and other comments, markers among them, may stand between the two.
function blockAfter(comment){
  let next = comment.nextSibling;
  while (next && (next.nodeType === COMMENT || isBlank(next))) next = next.nextSibling;
  return next && next.nodeType === ELEMENT ? next : null;
}

// Elements that may hold a block, and so a warning, which is a <div>. A marker
// that stands in anything else, in a paragraph or a heading, puts its warning
// after that element: a <div> inside a <p> ends the paragraph when an export
// is parsed again, and one inside a heading would be part of the heading.
const HOLDS_BLOCKS = new Set(['DIV', 'LI', 'BLOCKQUOTE', 'TD', 'TH', 'DD', 'SECTION', 'ARTICLE', 'ASIDE', 'MAIN', 'DETAILS', 'FIGURE', 'HEADER', 'FOOTER', 'NAV']);

// Puts the warning where the marker stood and takes the marker out. placed
// remembers the last warning put after an element, so that two markers in one
// paragraph keep their order.
function replaceWithWarning(root, comment, warning, placed){
  let at = comment;
  for (let host = comment.parentNode; host && host !== root && !HOLDS_BLOCKS.has(host.tagName); host = host.parentNode) at = host;
  if (at === comment){
    comment.replaceWith(warning);
    return;
  }
  const before = placed.get(at) || at;
  before.parentNode.insertBefore(warning, before.nextSibling);
  placed.set(at, warning);
  comment.remove();
}

// Takes a marker that acted out of the document, with the line break behind it.
function removeMarker(comment){
  const next = comment.nextSibling;
  if (next && isBlank(next)) next.remove();
  comment.remove();
}

// Applies every marker under root from the given list. First all of them are
// read, each with the block that follows it; then each is applied or becomes
// its warning. So what one marker does to the document does not change what
// the next one finds: two markers before one block both get that block. A
// component is applied to a block once: the same marker a second time before
// that block becomes a warning. A component may move its block into a new
// parent, as the facet filter does with its table: the markers after it hold
// the block itself, not its place.
export function applyMarkerList(root, markers){
  const doc = root.ownerDocument;
  const found = [];
  for (const comment of commentsIn(root)){
    const marker = readMarker(comment.data);
    if (marker) found.push({ comment, marker, block: blockAfter(comment) });
  }
  const placed = new Map();
  // Per block, the names of the markers that were applied to it.
  const applied = new Map();
  for (const { comment, marker, block } of found){
    const verdict = judgeMarker(marker, block ? block.tagName : '', markers);
    if (verdict.warning){
      replaceWithWarning(root, comment, buildWarning(doc, verdict.warning), placed);
      continue;
    }
    const names = applied.get(block) || new Set();
    if (names.has(verdict.entry.name)){
      replaceWithWarning(root, comment, buildWarning(doc, WARNINGS.twice(marker)), placed);
      continue;
    }
    let outcome;
    try {
      outcome = verdict.entry.apply(block, marker.argument);
    } catch (error){
      // A component that throws on its block: this marker becomes a warning
      // with the message, and the markers after it are applied all the same.
      console.error('Marker "' + marker.written + '" failed:', error);
      replaceWithWarning(root, comment, buildWarning(doc, WARNINGS.failed(marker), errorMessage(error)), placed);
      continue;
    }
    // A component that refuses its block: it changed nothing and said why.
    // That is no failure and nothing for the console.
    if (outcome && outcome.warning){
      replaceWithWarning(root, comment, buildWarning(doc, WARNINGS.refused(marker, String(outcome.warning))), placed);
      continue;
    }
    applied.set(block, names.add(verdict.entry.name));
    removeMarker(comment);
  }
}

// Document pass "Markierungen": the markers of the list above.
export function applyMarkers(root){
  applyMarkerList(root, MARKERS);
}
