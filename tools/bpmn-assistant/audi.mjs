// Baut dist/bpmn-layouter-audi.html, den BPMN-Layouter Audi (Ben, 2026-10-08): die abgespeckte Fassung des
// Assistenten (bauen.mjs daneben). Hochgeladene .bpmn-Dateien mit ihren eigenen Koordinaten, unverändert angeordnet,
// in den Farben der Vorlage „Audi-Stil“; wählbar nur das X an zusammenführenden Gateways und die Sprungbögen. Die Seite
// steht in src/bpmn-audi/ (index.html, audi.css, main.js) und zeichnet mit den Modulen, die sie mit dem Assistenten
// teilt (src/bpmn-tools/); bis Story 2.38 trug dieses Skript Kopien daraus. bpmn-js 18.31.0, der Viewer, eingebettet
// aus vendor/bpmn-js/ wie im Assistenten, damit die Seite ohne Netz läuft; die Dokumentstile aus src/doc.css.
//
//   npm run layouter-audi
import path from 'node:path';
import { BuildError } from '../../build.mjs';
import { PRESETS, themeCss } from '../../src/bpmn-tools/theme.js';
import { buildPage, writePage, runAsCommand, REPO } from '../seiten.mjs';

const PAGE = path.join(REPO, 'src/bpmn-audi');
export const OUT = path.join(REPO, 'dist/bpmn-layouter-audi.html');

// Die Seite als Text.
export function bauen(){
  return buildPage({
    template: path.join(PAGE, 'index.html'),
    entry: path.join(PAGE, 'main.js'),
    css: path.join(PAGE, 'audi.css'),
    favicon: path.join(PAGE, 'favicon.svg'),
    // Im Bündel stecken wenige Konstanten des Textrenderers von bpmn-js (src/app/label-size.js); Kommentare fallen beim
    // Bündeln weg, deshalb der Hinweis hier.
    notice: 'In diesem Skript stecken wenige Konstanten des Textrenderers von bpmn-js 18.31.0 (bpmn.io License, Copyright (c) 2014-present Camunda Services GmbH), über src/app/label-size.js von dokufix.',
    parts: {
      // Die Farben des Audi-Stils, einmal beim Bauen; ohne die Fläche hinter dem Bild, die Seite zeichnet auf Weiß.
      'theme.css': { text: themeCss(PRESETS.audi, { background: false }) },
    },
  });
}

if (runAsCommand(import.meta.url)){
  try { writePage(OUT, await bauen()); }
  catch (e){ if (!(e instanceof BuildError)) throw e; console.error(e.message); process.exit(1); }
}
