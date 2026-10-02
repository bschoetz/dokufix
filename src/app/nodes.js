// --- Nodes -----------------------------------------------------------------
// What the marker pass and its components ask of a node (markers.js, cards.js,
// steps.js). Pure logic: nothing here touches a page.

// nodeType values; the global Node exists only in a page.
export const ELEMENT = 1, TEXT = 3, COMMENT = 8;

// A text node that holds white space only, such as the line break marked
// writes between two blocks.
export const isBlank = node => node.nodeType === TEXT && !node.data.trim();

// The first child that is not blank, or null.
export function firstReal(node){
  let first = node.firstChild;
  while (first && isBlank(first)) first = first.nextSibling;
  return first;
}

// Where the content of a list item starts. In a list with blank lines between
// its items marked wraps the content of every item in paragraphs; then it is
// the first paragraph, otherwise the item itself.
export function itemHost(li){
  const first = firstReal(li);
  return first && first.nodeType === ELEMENT && first.tagName === 'P' ? first : li;
}
