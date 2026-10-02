// --- Transient elements ----------------------------------------------------
// An element that exists only while the page runs carries this attribute: a
// filter field, a live viewer, anything a component puts into the page that is
// not the document. Nothing that leaves the page takes such an element along:
// "Mit Editor" removes them from its clone of the page, the read-only exports
// from their copy of the preview. A component marks what it adds and does not
// touch either download.
//
// Pure logic: works on the root it is handed.
export const TRANSIENT_ATTR = 'data-dokufix-transient';

export function removeTransient(root){
  root.querySelectorAll('[' + TRANSIENT_ATTR + ']').forEach(el => el.remove());
}
