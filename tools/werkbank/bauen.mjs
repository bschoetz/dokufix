// Baut die Layout-Werkbank (Stories 2.38 und 2.39): offline, links die Liste der Fälle, rechts die Leinwand, der
// Worker des Layouts eingebaut und im Kopf der Layout-Stand, die Prüfsumme der Module des Layouts (logikOf() in
// tools/bpmn-layout/lib.mjs über src/app). So nennt die Werkbank denselben Stand, mit dem tools/bpmn-layout/lauf.mjs
// anordnet. Die Seite steht in src/werkbank/ (index.html, werkbank.css, main.js); gebaut mit dem gemeinsamen
// Seitenbauer der BPMN-Werkzeuge (tools/seiten.mjs).
//
// Eingebaut sind alle eigenen Eingaben der Sätze (INPUTS in tools/bpmn-layout/lib.mjs, laufzeit und einzeln
// eingeschlossen) als XML ohne Koordinaten, keine angeordnete Fassung: die Seite ordnet sie selbst an, in ihrem
// Worker, mit ihrem Stand. hund2 trägt Bens Handlayout als Referenz. Mit --mit-extern dazu die externen Eingaben mit
// ihren Handlayouts als Referenz; diese Seite geht nach tools/bpmn-layout/arbeit/ (nicht im Repository), damit Ben
// immer sieht, was im Ganzen geschieht (Ben, 2026-10-09). dist/ trägt nie eine externe Eingabe.
//
//   npm run werkbank                   → dist/bpmn-layout-werkbank.html
//   npm run werkbank -- --mit-extern   → tools/bpmn-layout/arbeit/bpmn-layout-werkbank-alles.html
import fs from 'node:fs';
import path from 'node:path';
import { BuildError } from '../../build.mjs';
import { logikOf, INPUTS, ARBEIT, externFehlt, EXTERN_ROOT } from '../bpmn-layout/lib.mjs';
import { buildPage, writePage, runAsCommand, REPO } from '../seiten.mjs';
import { ohneDi } from '../../src/werkbank/faelle.js';

const PAGE = path.join(REPO, 'src/werkbank');
export const OUT = path.join(REPO, 'dist/bpmn-layout-werkbank.html');
export const OUT_ALLES = path.join(ARBEIT, 'bpmn-layout-werkbank-alles.html');

// Die Eingaben der Seite, in der Reihenfolge der Sätze: [{ name, satz, xml, referenz? }], xml ohne Koordinaten.
export function eingaben({ mitExtern = false } = {}){
  const out = [];
  for (const i of INPUTS.values()){
    if (i.extern && !mitExtern) continue;
    const e = { name: i.name, satz: i.set, xml: ohneDi(fs.readFileSync(i.file, 'utf8')) };
    if (i.ref) e.referenz = fs.readFileSync(i.ref, 'utf8');
    out.push(e);
  }
  return out;
}

// Die Seite als Text.
export function bauen({ mitExtern = false } = {}){
  if (mitExtern && externFehlt()) throw new BuildError('--mit-extern: die externen Eingaben fehlen (' + path.relative(REPO, path.join(EXTERN_ROOT, 'extern')) + ', oder DOKUFIX_EXTERN)');
  const stand = logikOf(path.join(REPO, 'src/app'));
  return buildPage({
    template: path.join(PAGE, 'index.html'),
    entry: path.join(PAGE, 'main.js'),
    css: path.join(PAGE, 'werkbank.css'),
    favicon: path.join(PAGE, 'favicon.svg'),
    parts: {
      'stand': { text: stand },
      'werkbank-data': { json: { stand, mitExtern, eingaben: eingaben({ mitExtern }) } },
    },
  });
}

if (runAsCommand(import.meta.url)){
  const mitExtern = process.argv.includes('--mit-extern');
  try { writePage(mitExtern ? OUT_ALLES : OUT, await bauen({ mitExtern })); }
  catch (e){ if (!(e instanceof BuildError)) throw e; console.error(e.message); process.exit(1); }
}
