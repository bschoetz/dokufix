import { ELEMENT, TEXT, isBlank, firstReal, itemHost } from './nodes.js';

// --- Cards -----------------------------------------------------------------
// A bullet list with the marker "cards" before it becomes a row of cards, one
// per item, in a grid that wraps:
//
//   <!-- dokufix: cards -->          <ul class="dokufix-cards">
//   - **Selbstabholung** Am            <li><strong class="dokufix-card-title">Selbstabholung</strong> Am
//     Schalter, sofort.                  Schalter, sofort.</li>
//   - **Versand** Per Post.            <li><strong class="dokufix-card-title">Versand</strong> Per Post.</li>
//                                    </ul>
//
// The marker is read and applied in markers.js; this module is the entry for
// its list and what the component does to its block.
//
// The title of a card is the bold text its item starts with. Which element
// that is, is decided here, by a class; the document styles (src/doc.css) style
// the class and never ask where a <strong> stands. As marked emits an item:
//
//   - **Titel** Text      <li><strong>Titel</strong> Text</li>               title
//   - **Titel**: Text     <li><strong>Titel</strong>: Text</li>              title; the colon goes, as the
//                                                                            colon of a step's actor does
//   - **Titel**␣␣         <li><strong>Titel</strong><br>Text</li>            title; the break goes,
//     Text                                                                   the title is a line of its own
//   - **Titel** Text      <li><p><strong>Titel</strong> Text</p>\n</li>      title: a list with blank lines
//                                                                            between its items
//   - Vorab **fett**      <li>Vorab <strong>fett</strong></li>               a card without a title
//   - ***Titel*** Text    <li><em><strong>Titel</strong></em> Text</li>      a card without a title
//
// Pure logic: the component works on the list it is handed, so this loads and
// runs without a page.

export const CARDS_CLASS = 'dokufix-cards';
export const CARD_TITLE_CLASS = 'dokufix-card-title';

// Makes the bullet list a list of cards and marks the title of each.
export function buildCards(list){
  list.classList.add(CARDS_CLASS);
  for (const li of Array.from(list.children)){
    if (li.tagName !== 'LI') continue;
    const first = firstReal(itemHost(li));
    if (!first || first.nodeType !== ELEMENT || first.tagName !== 'STRONG') continue;
    first.classList.add(CARD_TITLE_CLASS);
    // The title is shown as a line of its own. A colon directly behind it
    // would open the line below, so it goes, with the blanks around it.
    let next = first.nextSibling;
    if (next && next.nodeType === TEXT){
      const rest = next.data.replace(/^\s*:\s*/, '');
      if (rest !== next.data){
        const text = next;
        if (rest) text.data = rest;
        else { next = text.nextSibling; text.remove(); }
      }
    }
    // A hard break behind the title would put an empty line between the
    // title and the text.
    while (next && isBlank(next)) next = next.nextSibling;
    if (next && next.nodeType === ELEMENT && next.tagName === 'BR') next.remove();
  }
}

// The entry for the list of markers (markers.js): the name an author writes,
// the block the marker expects directly after it, by tag, and that it takes no
// argument.
export const CARDS = { name: 'cards', block: 'UL', argument: 'none', apply: buildCards };
