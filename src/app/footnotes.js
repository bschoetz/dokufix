import { previewEl } from './dom.js';
import { escapeHtml } from './render.js';
import { headingLabelText } from './toc.js';
import { RAIL_MIN_HEADINGS } from './rail.js';

// --- Footnote previews -------------------------------------------------
// Hovering (or focusing) a footnote marker shows its text in place, so the
// reader keeps their position. Reveal is pure CSS (:hover / :focus-within on
// the host <sup>) — no listener — which is what makes it work in the JS-free
// nur-lesen export. This pass only injects inert markup at render time.
//
// Footnote parsing itself is marked-footnote's job (see marked.use in src/app.js);
// this touches only presentation.

// Tags kept as-is inside a preview. Everything else is unwrapped to its
// children — including <a>, whose text we keep but whose link we drop: an
// aria-hidden subtree must not contain focusable elements.
const FN_KEEP_TAGS = new Set(['CODE','EM','STRONG','B','I','SUB','SUP','SMALL','MARK','ABBR','KBD','SAMP','VAR','DEL','INS','SPAN','BR']);
// Unwrapping these joins their content with a space so words don't collide.
const FN_BLOCK_TAGS = new Set(['P','DIV','UL','OL','LI','BLOCKQUOTE','PRE','TABLE','THEAD','TBODY','TR','TD','TH','H1','H2','H3','H4','H5','H6','SECTION','FIGURE','FIGCAPTION','DL','DT','DD','HR']);

// Flatten to phrasing content. This is load-bearing, not cosmetic: the
// preview sits in a <sup> inside the paragraph that carries the marker, and a
// <p> (or <ul>, …) nested in a <p> makes the HTML parser close the outer
// paragraph early. That would quietly shred the document structure of every
// exported file, where the markup is serialised and re-parsed.
function fnFlattenInline(src, out){
  for (const child of src.childNodes){
    if (child.nodeType === Node.TEXT_NODE){
      out.appendChild(child.cloneNode(false));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    // Uppercase explicitly: tagName is only normalised for HTML-namespace
    // elements, so inline SVG/MathML reports "svg"/"title" verbatim and would
    // miss both sets, falling through to the unwrap default — which renders an
    // <svg><title> accessible name as body copy.
    const tag = child.tagName.toUpperCase();
    if (FN_KEEP_TAGS.has(tag)){
      const el = child.cloneNode(false);
      // cloneNode copies every attribute. An id would be duplicated into the
      // document once per marker (breaking getElementById and in-document
      // links), and tabindex would put a focusable element inside the
      // aria-hidden subtree that unwrapping <a> exists to keep unfocusable.
      el.removeAttribute('id');
      el.removeAttribute('tabindex');
      el.removeAttribute('name');
      fnFlattenInline(child, el);
      out.appendChild(el);
    } else {
      if (FN_BLOCK_TAGS.has(tag) && out.lastChild && !/\s$/.test(out.textContent || '')){
        out.appendChild(document.createTextNode(' '));
      }
      fnFlattenInline(child, out);
    }
  }
}

function buildFootnotePreview(li){
  const clone = li.cloneNode(true);
  // Drop the "↩" return link — it belongs to the definition list, not here.
  clone.querySelectorAll('a[data-footnote-backref]').forEach(a => a.remove());
  // Drop nested markers so a footnote citing a footnote can't nest previews.
  clone.querySelectorAll('a[data-footnote-ref]').forEach(a => {
    const sup = a.parentElement;
    (sup && sup.tagName === 'SUP' ? sup : a).remove();
  });
  const span = document.createElement('span');
  span.className = 'dokufix-fn-preview';
  span.setAttribute('aria-hidden', 'true');
  fnFlattenInline(clone, span);
  // Whitespace from the source markup collapses via CSS (white-space:normal).
  if (!(span.textContent || '').trim()) return null;
  return span;
}

// Point every footnote marker at its OWN return arrow.
//
// marked-footnote renders each reference to a footnote with the same visible
// number and the same href: three citations of [^norm] all read "1" and all
// link to #footnote-norm, while the definition grows three arrows ↩ ↩² ↩³.
// On arrival you cannot tell which arrow leads back to where you came from.
//
// :target only ever knows the current fragment, so CSS cannot distinguish the
// three cases — the only JS-free fix is to give each marker a distinct target.
// The arrow itself becomes that target, which lets CSS mark exactly the right
// one (a[data-footnote-backref]:target) and shade the definition around it
// (li:has(...)). The plain #footnote-<id> anchor keeps working via li:target.
//
// TRADE-OFF: the marker now lands on the arrow, which sits at the END of the
// footnote text, so assistive tech reads "Back to reference" before the prose.
// Documented in src/README.md; see deferred-work.md for the reversal option.
// Pairing goes through each definition, NOT through the arrow's href id.
// marked-footnote does not guarantee footnote-ref-<label>-N is unique: a document
// with both [^bgb] (cited twice) and [^bgb-2] mints id="footnote-ref-bgb-2" twice,
// and resolving by id takes whichever comes first in tree order — which repointed
// [^bgb-2]'s marker at footnote bgb's arrow and landed the reader on the wrong
// footnote, while its hover preview still showed the right text. A marker's href
// names its definition unambiguously, so pair the Nth marker of a definition with
// its Nth arrow: both are in reference order.
export function linkFootnoteReturnPaths(){
  const refs = Array.from(previewEl.querySelectorAll('a[data-footnote-ref]'));
  for (const li of previewEl.querySelectorAll('.footnotes li[id]')){
    const arrows = li.querySelectorAll('a[data-footnote-backref]');
    if (!arrows.length) continue;
    const markers = refs.filter(a => a.getAttribute('href') === '#' + li.id);
    arrows.forEach((back, n) => {
      const ref = markers[n];
      if (!ref) return;                                // orphan arrow → leave alone
      const backId = 'footnote-back-' + li.id.replace(/^footnote-/, '') + (n ? '-' + (n + 1) : '');
      // footnote-back-* shares one flat namespace with the definitions
      // (footnote-<label>) and with each other, so [^back-x] beside [^x], or
      // [^bgb] beside [^bgb-2], can mint an id that already exists. slugify()
      // guards its reserved "asset-" namespace the same way. On a collision,
      // leave the marker pointing at its definition: the jump still works and
      // only the arrow marking is lost for that one reference.
      if (previewEl.querySelector('#' + CSS.escape(backId))) return;
      back.id = backId;
      ref.setAttribute('href', '#' + backId);
    });
  }
}

export function attachFootnotePreviews(){
  const refs = previewEl.querySelectorAll('a[data-footnote-ref]');
  for (const ref of refs){
    const sup = ref.parentElement;
    if (!sup || sup.tagName !== 'SUP') continue;
    if (sup.querySelector(':scope > .dokufix-fn-preview')) continue; // idempotent
    const href = ref.getAttribute('href') || '';
    if (!href.startsWith('#') || href.length < 2) continue;
    // "li#": resolve only to a definition, never to whatever else carries that id.
    // This is what keeps the pass order-independent. It must run before
    // linkFootnoteReturnPaths() retargets these hrefs at the return arrows; if it
    // ever ran after, an unqualified "#id" would resolve to the ↩ anchor and every
    // preview would silently render as "↩" — no error, just wrong. Now it resolves
    // to nothing and the preview is skipped. CSS.escape is total over strings and
    // cannot throw, so no try/catch is needed here.
    const li = previewEl.querySelector('.footnotes li#' + CSS.escape(href.slice(1)));
    if (!li) continue; // definition missing → no preview, ref still jumps
    const span = buildFootnotePreview(li);
    if (!span) continue;
    sup.classList.add('dokufix-fn-host');
    sup.appendChild(span);
  }
}

export function tocLinkHandler(e){
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href').slice(1);
  const target = document.getElementById(id);
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Some browsers (older Safari, file:// in some Chromium builds) throw
  // SecurityError on history API in non-http contexts. Smooth scroll has
  // already happened — just swallow the hash-update failure.
  try { history.replaceState(null, '', '#' + id); }
  catch (err) { /* ignore */ }
}

// Build a static rail HTML string (no scrollspy) for read-only exports.
// Same structure as the live rail; just anchor links, no JS dependency.
export function buildStaticRailHtml(headings){
  const items = Array.from(headings).filter(h => /^H[234]$/.test(h.tagName));
  if (items.length < RAIL_MIN_HEADINGS) return '';
  let html = '<aside class="dokufix-rail has-items" aria-label="Navigation"><ol>';
  for (const h of items){
    html += '<li class="rail-' + h.tagName.toLowerCase() + '">' +
            '<a href="#' + h.id + '">' + escapeHtml(headingLabelText(h)) + '</a></li>';
  }
  html += '</ol></aside>';
  return html;
}
