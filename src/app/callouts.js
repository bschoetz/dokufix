// --- Callouts ------------------------------------------------------------
// A blockquote whose first line is only an alert marker becomes a callout:
//
//   > [!NOTE]              <div class="dokufix-callout dokufix-callout-note" role="note">
//   > Text.                  <p class="dokufix-callout-label">Hinweis</p>
//                            <p>Text.</p>
//                          </div>
//
// The five markers are the ones GitHub knows for its alerts, so a document
// reads the same there: NOTE, TIP, IMPORTANT, WARNING, CAUTION, in any case.
// dokufix adds no syntax; a renderer that does not know the convention shows a
// quotation that begins with the marker.
//
// The type is text in the markup: the label is the callout's first child and
// carries the word. The colour and the symbol beside it (src/doc.css) are
// decoration. [!WARNING] reads "Achtung", so that the word "Warnung" belongs
// to the product's own warning alone (warning.js).
//
// Recognition works on what marked emits, not on the Markdown:
//
//   > [!NOTE]              <blockquote>\n<p>[!NOTE]\ntext</p>      callout
//   > text
//   > [!WARNING]           <p>[!WARNING]</p>\n<ul>                 callout, the emptied paragraph goes
//   > - a
//   > [!IMPORTANT]␣␣       <p>[!IMPORTANT]<br>text</p>             callout, the break goes
//   > text
//   > [!NOTE] text         <p>[!NOTE] text</p>                     ordinary blockquote
//   > [!FOO]               <p>[!FOO]</p>                           ordinary blockquote
//
// Known limit: a masked marker, "> \[!NOTE\]", arrives as the same markup as an
// unmasked one and becomes a callout. Telling the two apart needs the tokens,
// not the DOM.
//
// A heading inside a callout is no document heading: documentHeadings() in
// toc.js leaves it out, by the class exported here.
//
// Pure logic: the pass works on the root it is handed and makes its elements
// with the document of that root, so this loads and runs without a page.

export const CALLOUT_CLASS = 'dokufix-callout';

// What a reader sees, by type. The order is the one GitHub lists them in.
export const CALLOUT_LABELS = {
  note: 'Hinweis',
  tip: 'Tipp',
  important: 'Wichtig',
  warning: 'Achtung',
  caution: 'Vorsicht',
};

// The marker at the start of the first text of the first paragraph, alone on
// its line: after it only blanks, then the end of the line or of the text.
const MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*(\n|$)/i;

// nodeType values; the global Node exists only in a page.
const ELEMENT = 1, TEXT = 3;
const isBlank = node => node.nodeType === TEXT && !node.data.trim();

// { type, paragraph, text, length } when the blockquote opens with a marker
// line, null when it is an ordinary quotation.
function readMarker(quote){
  let first = quote.firstChild;
  while (first && isBlank(first)) first = first.nextSibling;
  if (!first || first.nodeType !== ELEMENT || first.tagName !== 'P') return null;
  const text = first.firstChild;
  if (!text || text.nodeType !== TEXT) return null;
  const m = MARKER.exec(text.data);
  if (!m) return null;
  // The marker ran to the end of its text node. Then the line ended there only
  // if the paragraph ends too, or a hard break follows; anything else, such as
  // <strong>, stands on the marker's line.
  if (!m[2]){
    const next = text.nextSibling;
    if (next && !(next.nodeType === ELEMENT && next.tagName === 'BR')) return null;
  }
  return { type: m[1].toLowerCase(), paragraph: first, text, length: m[0].length };
}

// Takes the marker line out of its paragraph, and the paragraph out of the
// quote when nothing else stood in it.
function removeMarker(found){
  const { paragraph, text } = found;
  const rest = text.data.slice(found.length);
  if (rest) text.data = rest;
  else {
    const next = text.nextSibling;
    text.remove();
    // The hard break that ended the marker's line.
    if (next && next.nodeType === ELEMENT && next.tagName === 'BR') next.remove();
  }
  if (!paragraph.children.length && !paragraph.textContent.trim()){
    const after = paragraph.nextSibling;
    if (after && isBlank(after)) after.remove();
    paragraph.remove();
  }
}

// Document pass: every blockquote that opens with an alert marker becomes a
// callout, at any depth: in a quote, in a list item, in another callout.
export function buildCallouts(root){
  const doc = root.ownerDocument;
  for (const quote of Array.from(root.querySelectorAll('blockquote'))){
    const found = readMarker(quote);
    if (!found) continue;
    removeMarker(found);
    const box = doc.createElement('div');
    box.className = CALLOUT_CLASS + ' ' + CALLOUT_CLASS + '-' + found.type;
    box.setAttribute('role', 'note');
    const label = doc.createElement('p');
    label.className = CALLOUT_CLASS + '-label';
    label.textContent = CALLOUT_LABELS[found.type];
    box.appendChild(label);
    while (quote.firstChild) box.appendChild(quote.firstChild);
    quote.replaceWith(box);
  }
}
