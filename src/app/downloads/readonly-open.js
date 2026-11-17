import { escapeHtml } from '../html.js';
import { licencesHtml } from '../licences.js';
import { safeFilenameBase, triggerDownload } from './download.js';
import { buildExportBody, markdownCarrier, readonlyCss, bodyClassForExport, buildMetaFooterHtml } from './export-body.js';
import { removeFilterMarks } from '../filter.js';

// --- Download #2a — pure read-only, no JS, fully open HTML ---
export async function downloadReadonlyOpen(){
  // No script, so no search field: the mark of a filter table goes as well.
  const { title, body, rail, markdown } = await buildExportBody([removeFilterMarks]);
  const carrier = await markdownCarrier('nur-lesen', markdown);

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${readonlyCss()}</style>
${carrier}
</head>
<body${bodyClassForExport()}>
${licencesHtml()}
<main class="reader-body dokufix-doc">
${body}
${buildMetaFooterHtml()}
</main>
${rail}
</body>
</html>`;

  triggerDownload(safeFilenameBase() + '-nur-lesen.dokufix.html', html);
}
