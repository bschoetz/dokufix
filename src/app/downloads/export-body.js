import { inlineAssetRefsAsDataUrls } from '../assets.js';
import { sourceEl, previewEl } from '../dom.js';
import { deriveDocTitle } from '../frontmatter.js';
import { buildStaticRailHtml } from '../footnotes.js';
import { escapeHtml } from '../html.js';
import { formatVersionDate } from '../persistence.js';
import { render } from '../render.js';
import { state } from '../state.js';
import { removeTransient } from '../transient.js';
import { showFilteredRows } from '../filter.js';

// --- The one export path ----------------------------------------
// What the three read-only exports share: where their content comes from,
// their stylesheet and their footer. An export module holds its template and
// what only it does (gzip of the diagrams, of the whole body), nothing else.
//
// buildExportBody() renders, takes a detached copy of the preview and runs the
// export steps on that copy, in order. A step is a function that gets the copy
// and changes it; it may be async. Whatever has to be taken out of a document
// or changed in it when it leaves the page is a step in EXPORT_STEPS, written
// once, and reaches all three exports from there. The live preview is never
// touched.
//
// A step that throws ends the export: a file with a step left out would be a
// wrong file that looks right. The menu catches what a download throws and
// tells the user that no file was written, and why.

// Elements that exist only while the page runs; see transient.js.
function removeTransientElements(copy){
  removeTransient(copy);
}

// Every image asset becomes a data: URL — the receiver of a read-only export
// has no IDB and may not even have JS, so blob URLs (live preview) and
// "#asset-…" refs (unresolved) both need to become self-contained.
async function inlineImages(copy){
  const html = copy.innerHTML;
  const inlined = await inlineAssetRefsAsDataUrls(html);
  if (inlined !== html) copy.innerHTML = inlined;
}

// The free-text filter (filter.js) hides rows by a class: no read-only export
// takes a hidden row along. The field itself has gone with the transient
// elements; the mark of a filter table stays for `schlank` and `kompakt`, which
// build their field from it, and `nur-lesen` hands in removeFilterMarks itself.
const EXPORT_STEPS = [removeTransientElements, showFilteredRows, inlineImages];

// The reader bundle (src/reader.js), the table filter and the search, read
// from the page's data block #dokufix-reader-js: the script `schlank` and
// `kompakt` run when they open, in every file they write. The build
// guarantees it holds no "</script".
export function readerScript(){
  const block = document.getElementById('dokufix-reader-js');
  return block ? block.textContent.trim() : '';
}

// Returns { title, body, rail }: the document's title, its content as HTML and
// the static rail, '' where the document has too few headings for one.
// extraSteps run after EXPORT_STEPS: what one export alone does to the copy.
export async function buildExportBody(extraSteps = []){
  await render(); // the preview reflects the current source AND Mermaid SVGs are inlined
  // The copy is taken in the same turn the render ends in: a render that was
  // requested meanwhile has not started yet.
  const copy = previewEl.cloneNode(true);
  const title = deriveDocTitle(sourceEl.value, 'dokufix-Dokument');
  for (const step of [...EXPORT_STEPS, ...extraSteps]) await step(copy);
  return { title, body: copy.innerHTML, rail: buildStaticRailHtml(copy) };
}

// --- Styles of the read-only exports ---------------------------
// A read-only export gets two things, in this order:
//   1. the document styles, read from the #dokufix-doc-css block in <head>
//      when the file is written — the same block the preview is using, so
//      the two cannot drift apart;
//   2. the frame below: reset, page margins, the footer, the rail grid.
// "noscript p" is frame too: the kompakt export's "needs JavaScript" notice sits
// outside the content container, and without this rule the rail beside it would
// stand 17 px higher than it did when p{} was an unscoped rule.
// The link "license information" with its view is frame as well (licences.js):
// it stands outside the content container, placed against the page in the
// empty top margin, at the right edge of the text column. <body> is not
// positioned, on purpose: it would become the containing block of the footnote
// previews and change where they appear in a narrow window. So that edge is
// worked out from the page's width: the body is 950 px wide and centred with
// 32 px of padding (50 % - 443 px, at least 32 px), 22 px of padding in a
// narrow window, and beside a rail a grid of at most 1562 px whose padding,
// rail and gap are 530 px. In a narrow window the link stands left of the
// corner where `schlank` and `kompakt` put the search's magnifier (16 to 51 px
// from the right, src/search.css), and its view reaches back to 22 px from the
// edge; `nur-lesen`, which has no magnifier, shares the rule. These rules are
// the second copy of the ones in src/app.css, kept alike by hand; the editor's
// toolbar and "Editor ↩" are what only that file knows.
// Each export writes the element fresh from licencesHtml(), directly after
// <body>: closed, whatever the editor shows, and outside what kompakt packs,
// so it opens there without JavaScript too.
// A rule for document content does NOT go into the frame. It goes into the
// block in <head>, or the editor and "Mit Editor" never see it.
// tests/check-doc-styles.mjs fails when one turns up here.
const READONLY_FRAME_CSS = `*{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  color:#1c1c1e;background:#fff;line-height:1.5;
  max-width:950px;margin:0 auto;padding:80px 32px 120px;
  font-size:17px;-webkit-font-smoothing:antialiased;
}
.reader-body{min-width:0}
.dokufix-meta{margin-top:4em;padding-top:1.5em;border-top:1px solid #e5e5ea;font-size:.85em;color:#8e8e92}
.dokufix-meta p{margin:0}
noscript p{margin-bottom:1em}
@media (min-width:1500px){
  body:has(aside.dokufix-rail.has-items){max-width:1562px;display:grid;grid-template-columns:minmax(0, 1fr) 425px;column-gap:73px;padding:80px 32px 120px}
  body:has(aside.dokufix-rail.has-items) .reader-body{max-width:1000px;margin:0 auto;width:100%}
  .dokufix-rail.has-items{display:block;position:sticky;top:80px;max-height:calc(100vh - 100px);align-self:start}
}
.dokufix-rail-pending{pointer-events:none;opacity:.4;transition:opacity .25s ease}
@media (max-width:820px){body{padding:64px 22px 96px;font-size:16px}}
.dokufix-licences{position:absolute;z-index:40;top:56px;right:max(32px, calc(50% - 443px));font-size:12px;line-height:1.4;color:#6e6e73}
.dokufix-licences summary{display:block;cursor:pointer;text-decoration:underline;white-space:nowrap}
.dokufix-licences summary::-webkit-details-marker{display:none}
.dokufix-licences summary:hover{color:#1c1c1e}
.dokufix-licences-view{position:absolute;top:calc(100% + 6px);right:0;width:min(560px, calc(100vw - 44px));max-height:70vh;overflow:auto;padding:14px 16px;background:#fff;color:#1c1c1e;border:1px solid #d1d1d6;border-radius:6px;box-shadow:0 8px 28px rgba(0,0,0,0.18);font-size:13px;line-height:1.5;overflow-wrap:anywhere}
.dokufix-licences-view p{margin-bottom:.7em}
.dokufix-licences-view ul{list-style:none;margin-bottom:.7em}
.dokufix-licences-view li{margin-bottom:.5em}
@media (min-width:1500px){body:has(aside.dokufix-rail.has-items) .dokufix-licences{right:calc(max(0px, 50% - 781px) + 530px)}}
@media (max-width:820px){.dokufix-licences{top:40px;right:59px}.dokufix-licences-view{right:-37px}}`;

// Comments out, whitespace down to what CSS needs. Quoted strings are left
// alone: content:"Bild fehlt: " must keep its space.
function compactCss(css){
  const STR = '("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')';
  return css
    .replace(new RegExp(STR + '|\\/\\*[\\s\\S]*?\\*\\/|\\s+', 'g'), (m, str) => str || (m[0] === '/' ? '' : ' '))
    .replace(new RegExp(STR + '|\\s*([{};])\\s*', 'g'), (m, str, punct) => str || punct)
    .replace(new RegExp(STR + '|;}', 'g'), (m, str) => str || '}')
    .trim();
}

// The complete stylesheet of a read-only export. Every export template must
// use this and nothing else for its <style>.
export function readonlyCss(){
  const block = document.getElementById('dokufix-doc-css');
  return compactCss(block ? block.textContent : '') + '\n' + READONLY_FRAME_CSS;
}

export function bodyClassForExport(){
  return document.body.classList.contains('numbered') ? ' class="numbered"' : '';
}

export function escTitle(s){ return String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }

// Small metadata block appended to read-only exports. Always emits at least
// an export timestamp — even on files that have never been saved (v0) — so
// every read-only artifact carries a "when was this generated" anchor.
export function buildMetaFooterHtml(){
  const nowStr = escapeHtml(formatVersionDate(new Date().toISOString()));
  if (state.currentVersion === 0 || !state.versionHistory.length){
    return '<footer class="dokufix-meta"><p>Exportiert: ' + nowStr + ' · ungespeicherte Fassung</p></footer>';
  }
  const last = state.versionHistory[state.versionHistory.length - 1];
  const dateStr = escapeHtml(formatVersionDate(last.t));
  const msgStr = last.m ? ' · ' + escapeHtml(last.m) : '';
  return '<footer class="dokufix-meta"><p>Version ' + last.v + ' · ' + dateStr + msgStr +
         ' · exportiert ' + nowStr + '</p></footer>';
}
