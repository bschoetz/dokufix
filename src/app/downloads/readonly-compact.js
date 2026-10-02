import { gzipB64 } from '../gzip.js';
import { inlineAssetRefsAsDataUrls } from '../assets.js';
import { previewEl } from '../dom.js';
import { deriveDocTitle } from '../frontmatter.js';
import { render } from '../render.js';
import { buildStaticRailHtml } from '../footnotes.js';
import { safeFilenameBase, triggerDownload } from './menu.js';
import { readonlyCss, bodyClassForExport, escTitle, buildMetaFooterHtml } from './readonly-css.js';

// --- Download #2c — read-only, fully gzip-compressed, tiny JS decoder ---
export async function downloadReadonlyCompact(){
  await render();

  const title = deriveDocTitle('dokufix-Dokument');
  // Image refs become data: URLs before gzipping. Binary PNG/WebP doesn't
  // compress meaningfully a second time, but base64 itself shrinks by ~30 %
  // through gzip, so the overall cost vs an open export is modest.
  const inlinedBody = await inlineAssetRefsAsDataUrls(previewEl.innerHTML);
  const bodyHtml = inlinedBody + buildMetaFooterHtml();
  const payload = await gzipB64(bodyHtml);
  // Rail stays outside the compressed payload so it appears immediately
  // (no flash of empty navigation while the body decompresses).
  // Mark the rail as pending — clicks would race against decompression
  // (anchor targets don't exist until the body is filled). CSS dims it
  // and disables pointer events; the decoder removes the class on done.
  const railHtmlPending = buildStaticRailHtml(previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6'))
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
<noscript><p style="padding:40px 32px;color:#8b1300">Diese kompakte Variante benötigt JavaScript zum Entpacken. Wenn JavaScript nicht erlaubt ist, bitte die offene Variante (-nur-lesen.html) anfordern.</p></noscript>
<main class="reader-body dokufix-doc"><div id="d"></div></main>
${railHtmlPending}
<script type="text/plain" id="p">${payload}<\/script>
<script>
(async()=>{
  const b=document.getElementById('p').textContent.trim();
  const u=Uint8Array.from(atob(b),c=>c.charCodeAt(0));
  const r=new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip')));
  document.getElementById('d').innerHTML=await r.text();
  const rail=document.querySelector('.dokufix-rail-pending');
  if(rail) rail.classList.remove('dokufix-rail-pending');
})();
<\/script>
</body>
</html>`;

  triggerDownload(safeFilenameBase() + '-kompakt.html', html);
}
