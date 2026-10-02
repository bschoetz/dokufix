import { ELEMENT, TEXT, firstReal, itemHost } from './nodes.js';

// --- Step lists ------------------------------------------------------------
// A numbered list with the marker "steps" before it becomes a step list: each
// item shows its number as a tile, and an item may name who acts in it:
//
//   <!-- dokufix: steps -->
//   1. *Leserin:* Medium einlegen.
//   2. Beleg mitnehmen.
//
//   <ol class="dokufix-steps">
//   <li><span class="dokufix-step-number">1</span><em class="dokufix-step-actor">Leserin</em> Medium einlegen.</li>
//   <li><span class="dokufix-step-number">2</span>Beleg mitnehmen.</li>
//   </ol>
//
// The marker is read and applied in markers.js; this module is the entry for
// its list and what the component does to its block.
//
// The number is text in the markup, written here. The list's own marker is
// switched off in the document styles, and a counter of the styles would start
// at 1 whatever the list says: so the number is worked out as a browser does
// it, from the start value of the list ("3." as the first item gives
// <ol start="3">) and from a value attribute of an item, and needs no inline
// style. A screen reader reads it as the text it is.
//
// The actor is the emphasised text an item starts with, when that text ends
// with a colon inside the emphasis. The colon goes; the actor stands above the
// step. As marked emits an item:
//
//   1. *Website:* Text    <li><em>Website:</em> Text</li>               actor "Website"
//   1. *Website:* Text    <li><p><em>Website:</em> Text</p>\n</li>      actor: a list with blank lines
//                                                                       between its items
//   1. *Nie* ohne …       <li><em>Nie</em> ohne …</li>                  no actor, the emphasis stays
//   1. *CRM*: Text        <li><em>CRM</em>: Text</li>                   no actor: the colon stands outside
//   1. Text *Website:*    <li>Text <em>Website:</em></li>               no actor: not at the start
//
// Which element is the number and which the actor is decided here, by a class;
// the document styles (src/doc.css) style the classes.
//
// Pure logic: the component works on the list it is handed and makes its
// elements with the document of that list, so this loads and runs without a page.

export const STEPS_CLASS = 'dokufix-steps';
export const STEP_NUMBER_CLASS = 'dokufix-step-number';
export const STEP_ACTOR_CLASS = 'dokufix-step-actor';

// An attribute that holds an integer, as HTML reads one; the fallback when it
// is missing or holds none.
function integer(value, fallback){
  const m = /^\s*([+-]?\d+)/.exec(value === null || value === undefined ? '' : String(value));
  return m ? parseInt(m[1], 10) : fallback;
}

// True when the emphasis names an actor: text, then a colon at its end. Takes
// the colon out, with the blanks around it.
function takeColon(em){
  if (!/\S\s*:\s*$/.test(em.textContent)) return false;
  // The colon stands at the end of the last text in the emphasis, however
  // deep: "***Website:***" is <em><strong>Website:</strong></em>.
  let last = em;
  while (last.lastChild) last = last.lastChild;
  if (last.nodeType !== TEXT) return false;
  const colon = /\s*:\s*$/.exec(last.data);
  if (!colon) return false;
  last.data = last.data.slice(0, colon.index);
  return true;
}

// Makes the numbered list a step list: writes the number of each item into it
// and marks the actor of an item that names one.
export function buildSteps(list){
  const doc = list.ownerDocument;
  list.classList.add(STEPS_CLASS);
  let number = integer(list.getAttribute('start'), 1) - 1;
  for (const li of Array.from(list.children)){
    if (li.tagName !== 'LI') continue;
    number = integer(li.getAttribute('value'), number + 1);
    const first = firstReal(itemHost(li));
    if (first && first.nodeType === ELEMENT && first.tagName === 'EM' && takeColon(first)) first.classList.add(STEP_ACTOR_CLASS);
    const tile = doc.createElement('span');
    tile.className = STEP_NUMBER_CLASS;
    tile.textContent = String(number);
    li.insertBefore(tile, li.firstChild);
  }
}

// The entry for the list of markers (markers.js): the name an author writes,
// the block the marker expects directly after it, by tag, and that it takes no
// argument.
export const STEPS = { name: 'steps', block: 'OL', argument: 'none', apply: buildSteps };
