import { inlineAssetRefsAsDataUrls } from '../assets.js';
import { previewEl } from '../dom.js';
import { deriveDocTitle } from '../frontmatter.js';
import { render } from '../render.js';
import { buildStaticRailHtml } from '../footnotes.js';
import { safeFilenameBase, triggerDownload } from './menu.js';
import { readonlyCss, bodyClassForExport, escTitle, buildMetaFooterHtml } from './readonly-css.js';

// --- Download #2a — pure read-only, no JS, fully open HTML ---
export async function downloadReadonlyOpen(){
  await render(); // ensure preview reflects current source AND mermaid SVGs are inlined

  const title = deriveDocTitle('dokufix-Dokument');
  // Inline every image asset as a data: URL — the receiver of a read-only
  // export has no IDB and may not even have JS, so blob URLs (live preview)
  // and "#asset-…" refs (unresolved) both need to become self-contained.
  const bodyHtml = await inlineAssetRefsAsDataUrls(previewEl.innerHTML);
  const railHtml = buildStaticRailHtml(previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6'));

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escTitle(title)}</title>
<style>${readonlyCss()}</style>
</head>
<body${bodyClassForExport()}>
<main class="reader-body dokufix-doc">
${bodyHtml}
${buildMetaFooterHtml()}
</main>
${railHtml}
</body>
</html>`;

  triggerDownload(safeFilenameBase() + '-nur-lesen.html', html);
}
