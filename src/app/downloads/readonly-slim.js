import { gzipB64 } from '../gzip.js';
import { inlineAssetRefsAsDataUrls } from '../assets.js';
import { previewEl } from '../dom.js';
import { deriveDocTitle } from '../frontmatter.js';
import { render } from '../render.js';
import { buildStaticRailHtml } from '../footnotes.js';
import { safeFilenameBase, triggerDownload } from './menu.js';
import { readonlyCss, bodyClassForExport, escTitle, buildMetaFooterHtml } from './readonly-css.js';

// --- Download #2b — schlank: text plain, only Mermaid SVGs gzipped per-element ---
export async function downloadReadonlySlim(){
  await render();

  const title = deriveDocTitle('dokufix-Dokument');

  // Work on a clone of the rendered preview, with image refs inlined as
  // data: URLs so the export is fully self-contained.
  const wrapper = document.createElement('div');
  wrapper.innerHTML = await inlineAssetRefsAsDataUrls(previewEl.innerHTML);

  // Replace each Mermaid SVG with a placeholder div that carries gzipped+base64 SVG payload.
  // The text/HTML around it stays as readable plaintext.
  let svgCount = 0;
  for (const div of wrapper.querySelectorAll('.mermaid')){
    const svg = div.querySelector('svg');
    if (!svg) continue;
    const gz = await gzipB64(svg.outerHTML);
    div.setAttribute('data-gz', gz);
    div.innerHTML = ''; // emptied — decoder fills it on load
    svgCount++;
  }

  // Tiny inline decoder (only emitted if there are diagrams to expand)
  const decoder = svgCount > 0
    ? `<script>(async()=>{for(const el of document.querySelectorAll('[data-gz]')){try{const u=Uint8Array.from(atob(el.getAttribute('data-gz')),c=>c.charCodeAt(0));const r=new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip')));el.innerHTML=await r.text();el.removeAttribute('data-gz');}catch(e){console.error('SVG decode failed',e);}}})();<\/script>`
    : '';

  const noscript = svgCount > 0
    ? `<noscript><style>.mermaid[data-gz]{display:block;padding:24px;border:1px dashed #d8d8da;color:#8e8e92;text-align:center;font-size:14px;font-style:italic}.mermaid[data-gz]::before{content:"[Mermaid-Diagramm — JavaScript erforderlich, um es anzuzeigen]"}</style></noscript>`
    : '';

  const railHtml = buildStaticRailHtml(previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6'));

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escTitle(title)}</title>
<style>${readonlyCss()}</style>
${noscript}
</head>
<body${bodyClassForExport()}>
<main class="reader-body dokufix-doc">
${wrapper.innerHTML}
${buildMetaFooterHtml()}
${decoder}
</main>
${railHtml}
</body>
</html>`;

  triggerDownload(safeFilenameBase() + '-schlank.html', html);
}
