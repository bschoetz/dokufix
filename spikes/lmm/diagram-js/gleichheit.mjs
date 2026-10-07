// Gleichheit über Umgebungen: der Prototyp (messer.mjs, Tabelle Inter) in Chromium, per esbuild in die Seite
// gebündelt, gegen denselben Prototyp in Node, für alle Messungen des Korpus. Erwartet: 0 Unterschiede.
//   node gleichheit.mjs
import fs from 'node:fs';
import { withPage, R } from './browser.mjs';
import { messer } from './messer.mjs';
import { korpus } from './korpus.mjs';

const INTER = JSON.parse(fs.readFileSync(new URL('./breiten-inter-12px.json', import.meta.url), 'utf8'));
const { NOTE_WIDTHS } = await import(R + 'src/app/bpmn-layout.js');
const K = korpus();
const esbuild = await import(R + 'node_modules/esbuild/lib/main.js');
const bundle = (await esbuild.build({
  stdin: { contents: "import { messer } from './messer.mjs';\nwindow.prototypMesser = messer;\n", resolveDir: new URL('.', import.meta.url).pathname, loader: 'js' },
  bundle: true, format: 'iife', write: false, charset: 'utf8', logLevel: 'silent',
})).outputFiles[0].text;

const inBrowser = await withPage(async page => {
  await page.addScriptTag({ content: bundle });
  return page.evaluate(({ labels, notes, widths, table }) => {
    const m = window.prototypMesser(table), r = {};
    for (const t of labels) r[t] = m(t);
    for (const t of notes) for (const w of widths) r['note:' + w + ':' + t] = m(t, w);
    return r;
  }, { labels: K.labels, notes: K.notes, widths: NOTE_WIDTHS, table: INTER });
}, { bundles: false });

const m = messer(INTER);
let differ = 0, n = 0;
for (const [k, b] of Object.entries(inBrowser)){
  const mm = /^note:(\d+):([\s\S]*)$/.exec(k);
  const s = mm ? m(mm[2], +mm[1]) : m(k);
  n++; if (s.w !== b.w || s.h !== b.h) differ++;
}
console.log('Prototyp in Chromium gegen Prototyp in Node:', differ, 'von', n, 'Messungen anders');
