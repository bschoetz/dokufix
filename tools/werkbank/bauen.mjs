// Baut dist/bpmn-layout-werkbank.html, die Layout-Werkbank (Story 2.38, der Rahmen): offline, links die Liste der
// Fälle, rechts die Leinwand, beide leer, der Worker des Layouts eingebaut und im Kopf der Layout-Stand, die
// Prüfsumme der Module des Layouts (logikOf() in tools/bpmn-layout/lib.mjs über src/app). So nennt die Werkbank
// denselben Stand, mit dem tools/bpmn-layout/lauf.mjs anordnet. Die Seite steht in src/werkbank/ (index.html,
// werkbank.css, main.js); gebaut mit dem gemeinsamen Seitenbauer der BPMN-Werkzeuge (tools/seiten.mjs).
//
//   npm run werkbank
import path from 'node:path';
import { BuildError } from '../../build.mjs';
import { logikOf } from '../bpmn-layout/lib.mjs';
import { buildPage, writePage, runAsCommand, REPO } from '../seiten.mjs';

const PAGE = path.join(REPO, 'src/werkbank');
export const OUT = path.join(REPO, 'dist/bpmn-layout-werkbank.html');

// Die Seite als Text.
export function bauen(){
  return buildPage({
    template: path.join(PAGE, 'index.html'),
    entry: path.join(PAGE, 'main.js'),
    css: path.join(PAGE, 'werkbank.css'),
    favicon: path.join(PAGE, 'favicon.svg'),
    parts: {
      'stand': { text: logikOf(path.join(REPO, 'src/app')) },
    },
  });
}

if (runAsCommand(import.meta.url)){
  try { writePage(OUT, await bauen()); }
  catch (e){ if (!(e instanceof BuildError)) throw e; console.error(e.message); process.exit(1); }
}
