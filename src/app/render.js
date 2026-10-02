import { pruneAssetUrlCache, resolveAssetRefsInHtml } from './assets.js';
import { sourceEl, previewEl } from './dom.js';
import { splitFrontmatter, injectFrontmatterPanel } from './frontmatter.js';
import { buildCallouts } from './callouts.js';
import { assignHeadingIds, processInlineToc, attachTocClicks } from './toc.js';
import { attachFootnotePreviews, linkFootnoteReturnPaths } from './footnotes.js';
import { buildRail } from './rail.js';
import { runPasses } from './passes.js';
import { buildWarning, errorMessage } from './warning.js';
import { TRANSIENT_ATTR } from './transient.js';

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

let mermaidId = 0;

// Document passes produce the document: what a reader sees, and what an export
// takes along when it copies the preview. A pass gets the root that holds the
// document and the context of this render, { frontmatter }: what was split off
// the source before Markdown was parsed.
//
// The order matters in three places. Callouts come before the headings: which
// headings count depends on where a heading stands, and one inside a callout
// does not. Heading ids come before the inline table of contents and the
// rail, which need them. And attachFootnotePreviews() resolves each
// definition through the marker's href, while linkFootnoteReturnPaths()
// rewrites that href to point at the return arrow: retargeting first would
// build every preview out of the "↩" anchor instead of the footnote.
export const DOCUMENT_PASSES = [
  { name: 'Metadaten', run: (root, context) => injectFrontmatterPanel(root, context.frontmatter) },
  { name: 'Hinweise', run: buildCallouts },
  { name: 'Überschriften', run: assignHeadingIds },
  { name: 'Inhaltsverzeichnis', run: processInlineToc },
  { name: 'Fußnoten-Vorschau', run: attachFootnotePreviews },
  { name: 'Fußnoten-Rücksprung', run: linkFootnoteReturnPaths },
  { name: 'Diagramme', run: renderDiagrams },
];

// Run-time passes attach what exists only while the page runs: a listener
// today, later a filter field or a live viewer. Nothing they do is part of the
// document. An element such a pass adds carries data-dokufix-transient (see
// transient.js), so that no download takes it along.
export const RUNTIME_PASSES = [
  { name: 'Sprungmarken im Inhaltsverzeichnis', run: attachTocClicks },
];

// One render at a time. A render requested while another runs starts when
// that one is finished, and reads the source then; the preview ends as the
// last one's. The promise is fulfilled when this render is done and is never
// rejected: whatever fails ends as a warning in the document and a line in
// the console.
let lastRender = Promise.resolve();
export function render() {
  // renderOnce() contains its own failures; the second argument keeps the
  // queue alive even if it ever did not.
  lastRender = lastRender.then(renderOnce, renderOnce);
  return lastRender;
}

async function renderOnce() {
  try {
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

    const context = { frontmatter: fm };
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

// Document pass: every ```mermaid block becomes its diagram.
async function renderDiagrams(root) {
  // Convert <pre><code class="language-mermaid">…</code></pre> into <div class="mermaid">…</div>
  root.querySelectorAll('pre code.language-mermaid').forEach(block => {
    const div = root.ownerDocument.createElement('div');
    div.className = 'mermaid';
    div.id = 'mermaid-' + (++mermaidId);
    div.textContent = block.textContent;
    block.parentElement.replaceWith(div);
  });

  // One diagram at a time, each in its own containment: a diagram with an
  // error becomes a warning with Mermaid's message, and the others render.
  // Mermaid runs with suppressErrorRendering (src/app.js), so it throws
  // instead of drawing its error picture into the node.
  for (const node of root.querySelectorAll('.mermaid')) {
    try {
      await mermaid.run({ nodes: [node] });
    } catch (err) {
      console.error('Mermaid error:', err);
      node.replaceWith(buildWarning(root.ownerDocument, 'Ein Diagramm konnte nicht gezeichnet werden.', errorMessage(err)));
      // Mermaid draws into a temporary element named after the diagram's id.
      // Handed a node, it puts that element into the node, which is gone now;
      // one that a failed render left in <body> is removed here.
      document.querySelectorAll('body > [id^="dmermaid-"], body > [id^="imermaid-"]').forEach(el => el.remove());
    }
  }
}
