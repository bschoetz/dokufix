// Variante (b): der unveränderte Algorithmus von diagram-js 15.28.0 (lib/util/Text.js, per esbuild aus der
// npm-Quelle im Vendor-Ordner gebündelt) in Node, die Messung ersetzt. Text.js misst in getTextBBox() über
// document.createElement('canvas').getContext('2d').measureText(); die Funktion ist modulintern und lässt sich nicht
// übergeben. Ersetzt wird deshalb der Canvas-Kontext am document:
//   (b1) linkedom als DOM, createElement('canvas') liefert einen Kontext aus der Breitentabelle
//   (b2) ohne DOM-Bibliothek: ein document-Stub mit createElementNS für tiny-svg und dem Canvas-Kontext
//   (b0) linkedom unverändert: getContext() gibt null, diagram-js misst 0 → nichts bricht um (zum Beleg)
// Verglichen wird gegen referenz-chromium.json und gegen den Prototyp (messer.mjs).
//   node variante-b.mjs
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { R, VENDOR, esbuildAlias } from './browser.mjs';
import { messer, breitenFunktion } from './messer.mjs';

const SCRATCH = '/tmp/claude-0/-home-user-dokufix/c7ad9c8e-4112-59bc-bff9-b496db1abe70/scratchpad/';
const read = f => JSON.parse(fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8'));
const REF = read('referenz-chromium.json'), INTER = read('breiten-inter-12px.json');
const { NOTE_WIDTHS } = await import(R + 'src/app/bpmn-layout.js');
const widthOf = breitenFunktion(INTER);

// Text.js als ESM-Datei im Scratchpad (fremder Code bleibt außerhalb des Repositorys).
const esbuild = await import(R + 'node_modules/esbuild/lib/main.js');
const bundleFile = SCRATCH + 'diagramjs-text-esm.mjs';
await esbuild.build({ entryPoints: [VENDOR + 'diagram-js/package/lib/util/Text.js'], alias: esbuildAlias, bundle: true, format: 'esm', outfile: bundleFile, charset: 'utf8', logLevel: 'silent' });

// Der Kontext, der misst wie Chromium mit der Tabelle; die Rechnung von getTextBBox() bleibt in diagram-js.
const fakeContext = () => ({ font: '', measureText: s => ({ width: widthOf(s), fontBoundingBoxAscent: INTER.ascent, fontBoundingBoxDescent: INTER.descent }) });

// Ein document-Stub: gerade so viel, wie tiny-svg für create/attr/append und Text.js für den Canvas brauchen.
function stubDocument(ctx){
  const element = () => ({ style: {}, children: [], textContent: '', setAttributeNS(ns, k, v){ this[k] = v; }, setAttribute(k, v){ this[k] = v; }, appendChild(c){ this.children.push(c); return c; }, querySelectorAll(sel){ return sel === 'tspan' ? this.children : []; } });
  return { createElement: tag => tag === 'canvas' ? { getContext: () => ctx } : element(), createElementNS: () => element() };
}

// Die Rechnung des TextRenderers (wie a2 in referenz.mjs) auf einem Text von diagram-js: der Messer dazu.
function messerAusText(Text){
  const defaultStyle = { fontFamily: 'Arial, sans-serif', fontSize: 12, fontWeight: 'normal', lineHeight: 1.2 };
  const text = new Text({ style: defaultStyle });
  return (t, width) => {
    if (width){ const d = text.getDimensions(t, { box: { width, height: 30 }, style: defaultStyle, align: 'left-top', padding: 7 }); return { w: width, h: Math.max(40, Math.round(d.height)) }; }
    const first = text.layoutText(t, { box: { width: 90, height: 30 }, style: defaultStyle });
    const w = Math.ceil(first.dimensions.width), h = Math.ceil(first.dimensions.height), lines1 = first.element.querySelectorAll('tspan').length;
    const lines2 = text.createText(t, { box: { width: w, height: 30 }, style: defaultStyle }).querySelectorAll('tspan').length;
    return { w, h: Math.ceil(h / Math.max(1, lines1) * lines2) };
  };
}

const keys = Object.keys(REF.referenz);
const proto = messer(widthOf);
function compare(name, measure){
  let vsRef = 0, vsProto = 0, failed = null;
  try {
    for (const k of keys){
      const m = /^note:(\d+):([\s\S]*)$/.exec(k);
      const got = m ? measure(m[2], +m[1]) : measure(k), ref = REF.referenz[k], p = m ? proto(m[2], +m[1]) : proto(k);
      if (got.w !== ref.w || got.h !== ref.h) vsRef++;
      if (got.w !== p.w || got.h !== p.h) vsProto++;
    }
  } catch (e){ failed = e.message; }
  console.log(name + ':', failed ? 'Fehler: ' + failed : `anders als Chromium-Referenz ${vsRef}/${keys.length}, anders als Prototyp ${vsProto}/${keys.length}`);
  return { vsRef, vsProto, failed };
}

const results = {};
// Jede Fassung in einem frischen Modul, weil Text.js seinen Canvas-Kontext modulweit merkt.
const freshText = async () => (await import(pathToFileURL(bundleFile).href + '?' + Math.random())).default;

// (b0) linkedom unverändert
const { parseHTML } = await import(R + 'node_modules/linkedom/esm/index.js');
globalThis.document = parseHTML('<html><body></body></html>').document;
results.b0 = compare('(b0) linkedom unverändert, getContext() = null', messerAusText(await freshText()));

// (b1) linkedom, Canvas ersetzt
{
  const { document } = parseHTML('<html><body></body></html>');
  const create = document.createElement.bind(document);
  const ctx = fakeContext();
  document.createElement = tag => tag === 'canvas' ? { getContext: () => ctx } : create(tag);
  globalThis.document = document;
  results.b1 = compare('(b1) linkedom, Canvas-Kontext aus der Tabelle', messerAusText(await freshText()));
}
// (b2) nur ein Stub
globalThis.document = stubDocument(fakeContext());
results.b2 = compare('(b2) document-Stub ohne DOM-Bibliothek', messerAusText(await freshText()));

console.log('Bündel Text.js (esm, unminifiziert):', fs.statSync(bundleFile).size, 'Bytes');
fs.writeFileSync(new URL('./variante-b.json', import.meta.url), JSON.stringify(results, null, 1));
