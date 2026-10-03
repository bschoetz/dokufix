import { gzipB64 } from '../gzip.js';
import { DIAGRAM_CLASS, DIAGRAM_SVG_CLASS } from '../diagrams.js';
import { licencesHtml } from '../licences.js';
import { UNPACKED_EVENT } from '../search.js';
import { safeFilenameBase, triggerDownload } from './download.js';
import { buildExportBody, readonlyCss, bodyClassForExport, escTitle, buildMetaFooterHtml, readerScript } from './export-body.js';

// --- Download #2b — schlank: text plain, only the diagrams' SVGs gzipped per-element ---
export async function downloadReadonlySlim(){
  // This export's own step: the SVG container of each diagram's figure
  // (diagrams.js), wherever in the figure it stands, is emptied and carries its SVG as gzipped+base64 payload.
  // The text/HTML around it, the figure and whatever else it holds, stays
  // readable plaintext.
  let svgCount = 0;
  async function gzipDiagrams(copy){
    for (const div of copy.querySelectorAll('.' + DIAGRAM_CLASS + ' .' + DIAGRAM_SVG_CLASS)){
      const svg = div.querySelector('svg');
      if (!svg) continue;
      const gz = await gzipB64(svg.outerHTML);
      div.setAttribute('data-gz', gz);
      div.innerHTML = ''; // emptied — decoder fills it on load
      svgCount++;
    }
  }
  const { title, body, rail } = await buildExportBody([gzipDiagrams]);

  // Tiny inline decoder (only emitted if there are diagrams to expand). When
  // it has gone through every diagram, unpacked or failed, it says so with an
  // event on the document: a search waits for it (search.js).
  const decoder = svgCount > 0
    ? `<script>(async()=>{for(const el of document.querySelectorAll('[data-gz]')){try{const u=Uint8Array.from(atob(el.getAttribute('data-gz')),c=>c.charCodeAt(0));const r=new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip')));el.innerHTML=await r.text();el.removeAttribute('data-gz');}catch(e){console.error('SVG decode failed',e);}}document.dispatchEvent(new Event('${UNPACKED_EVENT}'));})();<\/script>`
    : '';

  // The reader bundle, the table filter and the search, in every file: it runs
  // behind the document and before the decoder, so the search listens for the
  // decoder's event before the decoder can send it.
  const readerCode = readerScript();
  const readerTag = readerCode ? '<script>' + readerCode + '<\/script>' : '';

  const noscript = svgCount > 0
    ? `<noscript><style>.dokufix-diagram-svg[data-gz]{display:block;padding:24px;border:1px dashed #d8d8da;color:#8e8e92;text-align:center;font-size:14px;font-style:italic}.dokufix-diagram-svg[data-gz]::before{content:"[Diagramm — JavaScript erforderlich, um es anzuzeigen]"}</style></noscript>`
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
${licencesHtml()}
<main class="reader-body dokufix-doc">
${body}
${buildMetaFooterHtml()}
${readerTag}
${decoder}
</main>
${rail}
</body>
</html>`;

  triggerDownload(safeFilenameBase() + '-schlank.html', html);
}
