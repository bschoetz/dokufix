// Setzt aus src/ und einem Markdown-Text eine einzelne HTML-Seite zusammen.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const here = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(here, f), 'utf8');

export function assemble(markdown) {
  return read('src/template.html')
    .replace('/*{{CSS}}*/', () => read('src/komponenten.css'))
    .replace('/*{{JS}}*/', () => read('src/komponenten.js') + '\n' + read('src/bpmn.js'))
    .replace('{{MD_JSON}}', () => JSON.stringify(markdown).replace(/</g, '\\u003c'));
}

// Dasselbe, was build.mjs für den JS-freien Export tut. Läuft im Browser-Kontext (page.evaluate).
export function exportStatic() {
  const doc = document.documentElement.cloneNode(true);
  doc.querySelectorAll('script, .dokufix-filter-ui').forEach(el => el.remove());
  doc.removeAttribute('data-ready');
  // Zustand aus der Laufzeit darf nicht in den Export wandern
  doc.querySelectorAll('.dokufix-nav > a').forEach(a => { a.classList.remove('on'); a.removeAttribute('aria-current'); });
  doc.querySelectorAll('tbody tr[hidden]').forEach(tr => tr.removeAttribute('hidden'));
  doc.querySelectorAll('.dokufix-live-canvas, .dokufix-live-hint').forEach(el => el.remove());
  doc.querySelectorAll('.dokufix-live').forEach(el => el.classList.remove('dokufix-live'));
  const handlers = [...doc.querySelectorAll('*')].reduce((n, el) => n + [...el.attributes].filter(a => /^on/i.test(a.name)).length, 0);
  const jsUrls = doc.querySelectorAll('[href^="javascript:" i], [src^="javascript:" i]').length;
  return { html: '<!DOCTYPE html>\n' + doc.outerHTML, scripts: 0, handlers, jsUrls };
}
