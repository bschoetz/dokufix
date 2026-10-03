import { gzipB64 } from '../gzip.js';
import { licencesHtml } from '../licences.js';
import { safeFilenameBase, triggerDownload } from './download.js';
import { buildExportBody, readonlyCss, bodyClassForExport, escTitle, buildMetaFooterHtml, filterScriptFor } from './export-body.js';

// --- Download #2c — read-only, fully gzip-compressed, tiny JS decoder ---
export async function downloadReadonlyCompact(){
  // Image refs are data: URLs before gzipping (an export step). Binary PNG/WebP
  // doesn't compress meaningfully a second time, but base64 itself shrinks by
  // ~30 % through gzip, so the overall cost vs an open export is modest.
  const { title, body, rail } = await buildExportBody();
  const bodyHtml = body + buildMetaFooterHtml();
  const payload = await gzipB64(bodyHtml);
  // Rail stays outside the compressed payload so it appears immediately
  // (no flash of empty navigation while the body decompresses).
  // Mark the rail as pending — clicks would race against decompression
  // (anchor targets don't exist until the body is filled). CSS dims it
  // and disables pointer events; the decoder removes the class on done.
  // The free-text filter, when the document has a filter table: a data block
  // the decoder reads before it unpacks (an element of the document could
  // carry the same id) and runs after.
  const filterCode = filterScriptFor(body);
  const filterBlock = filterCode ? '\n<script type="text/plain" id="f">' + filterCode + '<\/script>' : '';
  const railHtmlPending = rail
    .replace(/class="dokufix-rail has-items"/, 'class="dokufix-rail has-items dokufix-rail-pending"');

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escTitle(title)}</title>
<style>${readonlyCss()}</style>
</head>
<body${bodyClassForExport()}>
${licencesHtml()}
<noscript><p style="padding:40px 32px;color:#8b1300">Diese kompakte Variante benötigt JavaScript zum Entpacken. Wenn JavaScript nicht erlaubt ist, bitte die offene Variante (-nur-lesen.html) anfordern.</p></noscript>
<main class="reader-body dokufix-doc"><div id="d"></div></main>
${railHtmlPending}
<script type="text/plain" id="p">${payload}<\/script>${filterBlock}
<script>
(async()=>{
  const b=document.getElementById('p').textContent.trim();
  const f=document.getElementById('f');
  const filter=f?f.textContent:'';
  const u=Uint8Array.from(atob(b),c=>c.charCodeAt(0));
  const r=new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip')));
  document.getElementById('d').innerHTML=await r.text();
  if(filter){const s=document.createElement('script');s.textContent=filter;document.body.appendChild(s);}
  const rail=document.querySelector('.dokufix-rail-pending');
  if(rail) rail.classList.remove('dokufix-rail-pending');
})();
<\/script>
</body>
</html>`;

  triggerDownload(safeFilenameBase() + '-kompakt.html', html);
}
