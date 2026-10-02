import { pruneAssetUrlCache, resolveAssetRefsInHtml } from './assets.js';
import { sourceEl, previewEl } from './dom.js';
import { state } from './state.js';
import { splitFrontmatter, injectFrontmatterPanel } from './frontmatter.js';
import { assignHeadingIds, processInlineToc } from './toc.js';
import { attachFootnotePreviews, linkFootnoteReturnPaths } from './footnotes.js';
import { buildRail } from './rail.js';

export async function render() {
  const fm = splitFrontmatter(sourceEl.value);
  const md = fm.body;
  let html;
  try {
    html = marked.parse(md, { gfm: true, breaks: false });
  } catch (err) {
    previewEl.innerHTML = '<div class="error">Markdown-Fehler: ' + escapeHtml(err.message) + '</div>';
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
  injectFrontmatterPanel(fm);

  // Heading IDs first — both the inline ToC and the scrollspy rail need them.
  const headings = previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
  assignHeadingIds(headings);
  processInlineToc(headings);
  // Order matters: attachFootnotePreviews() resolves each definition through
  // the marker's href, and linkFootnoteReturnPaths() rewrites that href to
  // point at the return arrow. Retargeting first would build every preview
  // out of the "↩" anchor instead of the footnote.
  attachFootnotePreviews();
  linkFootnoteReturnPaths();

  // Convert <pre><code class="language-mermaid">…</code></pre> into <div class="mermaid">…</div>
  previewEl.querySelectorAll('pre code.language-mermaid').forEach(block => {
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.id = 'mermaid-' + (++state.mermaidId);
    div.textContent = block.textContent;
    block.parentElement.replaceWith(div);
  });

  // Render Mermaid diagrams (if any)
  const nodes = previewEl.querySelectorAll('.mermaid');
  if (nodes.length) {
    try {
      await mermaid.run({ nodes: Array.from(nodes) });
    } catch (err) {
      console.error('Mermaid error:', err);
    }
  }

  // Build the scrollspy rail (read-mode only; CSS gates visibility).
  buildRail(headings);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
