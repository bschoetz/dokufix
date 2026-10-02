import { gzipB64 } from '../gzip.js';
import { safeFilenameBase, triggerDownload } from './download.js';
import { buildExportBody, readonlyCss, bodyClassForExport, escTitle, buildMetaFooterHtml } from './export-body.js';

// --- Download #2b — schlank: text plain, only Mermaid SVGs gzipped per-element ---
export async function downloadReadonlySlim(){
  // This export's own step: replace each Mermaid SVG with a placeholder div
  // that carries gzipped+base64 SVG payload. The text/HTML around it stays as
  // readable plaintext.
  let svgCount = 0;
  async function gzipDiagrams(copy){
    for (const div of copy.querySelectorAll('.mermaid')){
      const svg = div.querySelector('svg');
      if (!svg) continue;
      const gz = await gzipB64(svg.outerHTML);
      div.setAttribute('data-gz', gz);
      div.innerHTML = ''; // emptied — decoder fills it on load
      svgCount++;
    }
  }
  const { title, body, rail } = await buildExportBody([gzipDiagrams]);

  // Tiny inline decoder (only emitted if there are diagrams to expand)
  const decoder = svgCount > 0
    ? `<script>(async()=>{for(const el of document.querySelectorAll('[data-gz]')){try{const u=Uint8Array.from(atob(el.getAttribute('data-gz')),c=>c.charCodeAt(0));const r=new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip')));el.innerHTML=await r.text();el.removeAttribute('data-gz');}catch(e){console.error('SVG decode failed',e);}}})();<\/script>`
    : '';

  const noscript = svgCount > 0
    ? `<noscript><style>.mermaid[data-gz]{display:block;padding:24px;border:1px dashed #d8d8da;color:#8e8e92;text-align:center;font-size:14px;font-style:italic}.mermaid[data-gz]::before{content:"[Mermaid-Diagramm — JavaScript erforderlich, um es anzuzeigen]"}</style></noscript>`
    : '';

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
${body}
${buildMetaFooterHtml()}
${decoder}
</main>
${rail}
</body>
</html>`;

  triggerDownload(safeFilenameBase() + '-schlank.html', html);
}
