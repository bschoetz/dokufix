import { safeFilenameBase, triggerDownload } from './download.js';
import { buildExportBody, readonlyCss, bodyClassForExport, escTitle, buildMetaFooterHtml } from './export-body.js';

// --- Download #2a — pure read-only, no JS, fully open HTML ---
export async function downloadReadonlyOpen(){
  const { title, body, rail } = await buildExportBody();

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
${body}
${buildMetaFooterHtml()}
</main>
${rail}
</body>
</html>`;

  triggerDownload(safeFilenameBase() + '-nur-lesen.html', html);
}
