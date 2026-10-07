import { pruneAssetUrlCache, resolveAssetRefsInHtml } from './assets.js';
import { sourceEl, previewEl } from './dom.js';
import { splitFrontmatter, injectFrontmatterPanel } from './frontmatter.js';
import { buildCallouts } from './callouts.js';
import { buildChips } from './chips.js';
import { applyMarkers } from './markers.js';
import { buildTables } from './tables.js';
import { attachTableFilters } from './filter.js';
import { assignHeadingIds, processInlineToc, attachTocClicks } from './toc.js';
import { attachFootnotePreviews, linkFootnoteReturnPaths } from './footnotes.js';
import { buildRail } from './rail.js';
import { runPasses } from './passes.js';
import { buildWarning, errorMessage } from './warning.js';
import { TRANSIENT_ATTR } from './transient.js';
import { renderDiagrams } from './diagrams.js';
import { attachSvgDownloads } from './diagram-downloads.js';
import { buildCodeLines, attachCodeCopy } from './code-blocks.js';
import { attachLiveViewers, stopLiveViewers } from './live-viewer.js';
import { makeRenderQueue } from './render-queue.js';

// --- From source to preview ------------------------------------------------
// One render is four steps:
//
//   1. parse           Markdown to HTML, into the preview
//   2. document passes what the exports serialise
//   3. run-time passes what only a running page has
//   4. the rail        always, whatever failed before it
//
// A component plugs in by adding its pass to one of the two lists below, at
// its place in the order. See src/README.md, "Render passes".

// Document passes produce the document: what a reader sees, and what an export
// takes along when it copies the preview. A pass gets the root that holds the
// document and the context of this render, { frontmatter, signal }: what was
// split off the source before Markdown was parsed, and the AbortSignal of this
// render, aborted once a newer render is requested (below).
//
// The order matters in eight places. Callouts come before the headings: which
// headings count depends on where a heading stands, and one inside a callout
// does not. Status chips come before the headings as well: a heading's anchor
// and its entry in the table of contents are made from the heading as it
// stands then, and a code span that is still to become a chip would put its
// colour dot into the entry. Heading ids come before the inline table of
// contents and the rail, which need them. Tables come directly after the block
// markers: a marker finds its block as the element directly behind it, and the
// wrapper every table gets would stand between the two; the facet filter has
// put its controls above its table by then, so the wrapper holds the table
// alone. Callouts, status chips, block markers and tables all come before the
// footnote previews: a preview is a copy of its definition as that stands when
// the copy is made. And attachFootnotePreviews()
// resolves each definition through the marker's href, while
// linkFootnoteReturnPaths() rewrites that href to point at the return arrow:
// retargeting first would build every preview out of the "↩" anchor instead
// of the footnote. Diagrams come after callouts and status chips: a diagram's
// title is the label of the document heading before it, as the table of
// contents shows it (diagrams.js). Code blocks come last: the diagrams have
// taken their fenced sources out by then, and a footnote preview has copied
// its definition, a code block in it flattened to its text (code-blocks.js).
export const DOCUMENT_PASSES = [
  { name: 'Metadaten', run: (root, context) => injectFrontmatterPanel(root, context.frontmatter) },
  { name: 'Hinweise', run: buildCallouts },
  { name: 'Status-Chips', run: buildChips },
  { name: 'Markierungen', run: applyMarkers },
  { name: 'Tabellen', run: buildTables },
  { name: 'Überschriften', run: assignHeadingIds },
  { name: 'Inhaltsverzeichnis', run: processInlineToc },
  { name: 'Fußnoten-Vorschau', run: attachFootnotePreviews },
  { name: 'Fußnoten-Rücksprung', run: linkFootnoteReturnPaths },
  { name: 'Diagramme', run: renderDiagrams },
  { name: 'Code-Blöcke', run: buildCodeLines },
];

// Run-time passes attach what exists only while the page runs: a listener, the
// search field of a table, the picture button below a diagram, the copy button
// of a code block, the live viewer in the large view of a BPMN diagram. Nothing they do is part of the
// document. An element such a pass adds carries data-dokufix-transient (see
// transient.js), so that no download takes it along. They run after every
// document pass: the free-text filter finds each table in its wrapper, and the
// preview of a footnote cited in a cell already in the cell, which it leaves
// out of the row's text.
export const RUNTIME_PASSES = [
  { name: 'Sprungmarken im Inhaltsverzeichnis', run: attachTocClicks },
  { name: 'Tabellenfilter', run: attachTableFilters },
  { name: 'Diagramm-Bilder', run: attachSvgDownloads },
  { name: 'Code kopieren', run: attachCodeCopy },
  { name: 'BPMN-Ansicht', run: attachLiveViewers },
];

// One render at a time, the newest aborting the one before it; the promise
// is fulfilled when the preview is the newest render's, and is never
// rejected: whatever fails ends as a warning in the document and a line in
// the console. The queue is makeRenderQueue()'s (src/app/render-queue.js).
export const render = makeRenderQueue(renderOnce);

async function renderOnce(signal) {
  try {
    // A live viewer still running goes first: whatever this render does, the
    // figure it stands in is replaced (src/app/live-viewer.js).
    stopLiveViewers();
    const fm = splitFrontmatter(sourceEl.value);
    let html;
    try {
      html = marked.parse(fm.body, { gfm: true, breaks: false });
    } catch (err) {
      console.error('Markdown error:', err);
      previewEl.replaceChildren(buildWarning(document, 'Das Markdown konnte nicht verarbeitet werden.', errorMessage(err)));
      return;
    }
    // Resolve #asset-<hash> image refs: pull the matching Blobs from IDB and
    // rewrite the html string before insertion so the browser never tries to
    // load the bogus "#asset-…" URL. Unresolved hashes get a transparent
    // placeholder src + data-missing-asset attribute. Prune cache entries
    // for hashes no longer referenced — long sessions would otherwise hold
    // decoded image memory for every image ever inserted.
    const resolution = await resolveAssetRefsInHtml(html);
    pruneAssetUrlCache(resolution.resolved);
    previewEl.innerHTML = resolution.html;

    const context = { frontmatter: fm, signal };
    await runPasses(previewEl, DOCUMENT_PASSES, context);
    // A run-time pass that fails leaves the document complete. Its warning is
    // for the reader of this page, so it is transient: no export carries it.
    const failed = await runPasses(previewEl, RUNTIME_PASSES, context);
    for (const f of failed) f.warning.setAttribute(TRANSIENT_ATTR, '');
  } catch (err) {
    // Outside every containment above: say so in the document as well.
    console.error('Render failed:', err);
    previewEl.prepend(buildWarning(document, 'Das Dokument konnte nicht vollständig dargestellt werden.', errorMessage(err)));
  } finally {
    // Build the scrollspy rail (read-mode only; CSS gates visibility). Last,
    // and always: see buildRail().
    try { buildRail(previewEl); }
    catch (err) { console.error('Rail failed:', err); }
  }
}
