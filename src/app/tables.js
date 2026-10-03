import { ELEMENT, isBlank } from './nodes.js';

// --- Tables ----------------------------------------------------------------
// Two things every table gets, whoever wrote it and wherever it stands.
//
// A wrapper that scrolls sideways on its own:
//
//   <div class="dokufix-table"><table> … </table></div>
//
// A table wider than the reading column then scrolls inside its wrapper, and
// the page stays as wide as the window. The wrapper is the scroll container
// and nothing else: it is not positioned, so the preview of a footnote cited
// in a cell is still placed against the page (see src/doc.css).
//
// And a sub-line: emphasis directly after a line break in a cell is a subdued
// second line of that cell. As marked emits a cell:
//
//   **Name**<br>*Zusatz*       <td><strong>Name</strong><br><em>Zusatz</em></td>     sub-line "Zusatz"
//   Name  <br>  *Zusatz*       <td>Name  <br>  <em>Zusatz</em></td>                  sub-line: blanks do not count
//   Name<br>normal *spät*      <td>Name<br>normal <em>spät</em></td>                 none: text stands between
//   *nur kursiv*               <td><em>nur kursiv</em></td>                          none: no line break before it
//
// Which element is a sub-line is decided here, by a class; the document
// styles (src/doc.css) style the class and never ask where an <em> stands.
//
// Pure logic: the pass works on the root it is handed and makes its elements
// with the document of that root, so this loads and runs without a page.

export const TABLE_CLASS = 'dokufix-table';
export const CELL_SUB_CLASS = 'dokufix-cell-sub';

const isElement = (node, ...tags) => !!node && node.nodeType === ELEMENT && tags.includes(node.tagName.toUpperCase());

// Document pass "Tabellen": every table under root gets its wrapper, once, and
// the sub-lines of its cells their class. It runs after the block markers: a
// marker finds its table as the element directly behind it, and the facet
// filter (facets.js) has put its controls above the table by then.
export function buildTables(root){
  const doc = root.ownerDocument;
  for (const table of Array.from(root.querySelectorAll('table'))){
    const parent = table.parentNode;
    if (isElement(parent, 'DIV') && parent.classList.contains(TABLE_CLASS)) continue;
    const wrapper = doc.createElement('div');
    wrapper.className = TABLE_CLASS;
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  }
  for (const em of Array.from(root.querySelectorAll('td > em, th > em'))){
    let before = em.previousSibling;
    while (before && isBlank(before)) before = before.previousSibling;
    if (isElement(before, 'BR')) em.classList.add(CELL_SUB_CLASS);
  }
}
