import { gzipB64 } from '../gzip.js';
import { DIAGRAM_CLASS, DIAGRAM_SVG_CLASS } from '../diagrams.js';
import { DOWNLOADS_CLASS } from '../diagram-downloads.js';
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
  // And the source link below each diagram (story 2.10; Ben, 2026-10-03): its
  // href, the source as a data: URL, goes gzipped+base64 into data-gz-href and
  // is taken out, so the file carries no source as text (epic 3, entry 11, will
  // put the Markdown into it). The decoder sets it back; with scripts off the
  // line is not shown, as the diagram is not.
  let linkCount = 0;
  async function gzipSourceLinks(copy){
    for (const a of copy.querySelectorAll('.' + DOWNLOADS_CLASS + ' > a[href]')){
      a.setAttribute('data-gz-href', await gzipB64(a.getAttribute('href')));
      a.removeAttribute('href');
      linkCount++;
    }
  }
  const { title, body, rail } = await buildExportBody([gzipDiagrams, gzipSourceLinks]);

  // Tiny inline decoder (only emitted if there are diagrams or source links to
  // expand). It unpacks each SVG into its container and each source link's
  // href back onto the link. When it has gone through all of them, unpacked
  // or failed, it says so with an event on the document: a search waits for
  // it (search.js).
  const decoder = svgCount + linkCount > 0
    ? `<script>(async()=>{const un=async b=>{const u=Uint8Array.from(atob(b),c=>c.charCodeAt(0));return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text();};for(const el of document.querySelectorAll('[data-gz]')){try{el.innerHTML=await un(el.getAttribute('data-gz'));el.removeAttribute('data-gz');}catch(e){console.error('SVG decode failed',e);}}for(const a of document.querySelectorAll('a[data-gz-href]')){try{a.setAttribute('href',await un(a.getAttribute('data-gz-href')));a.removeAttribute('data-gz-href');}catch(e){console.error('Source link decode failed',e);}}document.dispatchEvent(new Event('${UNPACKED_EVENT}'));})();<\/script>`
    : '';

  // The reader bundle, the table filter and the search, in every file: it runs
  // behind the document and before the decoder, so the search listens for the
  // decoder's event before the decoder can send it.
  const readerCode = readerScript();
  const readerTag = readerCode ? '<script>' + readerCode + '<\/script>' : '';

  // With scripts off: the notice in place of each packed diagram, and no line
  // of downloads, whose source is packed and whose picture needs the script;
  // the credit of a BPMN diagram stands alone, centred, as in print.
  const noscript = svgCount + linkCount > 0
    ? `<noscript><style>.dokufix-diagram-svg[data-gz]{display:block;padding:24px;border:1px dashed #d8d8da;color:#8e8e92;text-align:center;font-size:14px;font-style:italic}.dokufix-diagram-svg[data-gz]::before{content:"[Diagramm — JavaScript erforderlich, um es anzuzeigen]"}.dokufix-diagram-downloads{display:none!important}.dokufix-diagram-downloads+.dokufix-diagram-credit{display:block;margin:4px 0 0}</style></noscript>`
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
