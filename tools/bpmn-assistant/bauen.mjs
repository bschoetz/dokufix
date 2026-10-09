// Baut dist/bpmn-assistant.html, den Dokufix BPMN Assistant: BPMN-XML einfügen oder als Datei hochladen; oben das
// Original mit seinen eigenen Koordinaten (nur wenn es welche hat), darunter A2 angeordnet, das Modul des Produkts,
// darunter zum Vergleich die Anordnung von bpmn.io. Die Seite steht in src/bpmn-assistant/ (index.html,
// assistant.css, main.js), das mit dem Layouter Audi und der Werkbank Geteilte in src/bpmn-tools/; dieses Skript
// reicht nur, was die Seite aus diesem Ordner braucht, an den gemeinsamen Seitenbauer (tools/seiten.mjs). Seit
// Story 2.38 braucht es dist/dokufix.html nicht mehr: die Dokumentstile kommen aus src/doc.css, der Worker des Layouts
// aus src/layout-worker.js, beide frisch gebündelt.
//
//   npm run assistant
//
// Wie die App: bpmn-js 18.31.0 (die Version von src/index.html), seit 2026-10-07 in die Seite eingebettet statt vom
// CDN, damit sie ohne Netz läuft; A2 ordnet im Worker des Layouts an (docs/konzept-worker.md, Ben, 2026-10-07),
// derselbe Block #dokufix-layout-js, derselbe Client (src/app/layout-client.js). Dazu die Anordnung von bpmn.io,
// bpmn-auto-layout 2.0.0-alpha.2, gebündelt in die Seite, ohne CDN, mit den Lizenzhinweisen der gebündelten Pakete
// davor.
//
// Herkunft: das Bauskript des Spikes 2.26 (spike-2-26/testtool/bauen.mjs im Store), am 2026-10-07 ins Repository
// übernommen. Was es aus dem Store las, liegt seither hier: die Handreichung (handreichung.md), die Beispiele
// (beispiele/, mit beispiele.json für Reihenfolge und Beschriftung) und bpmn-auto-layout mit seinen Abhängigkeiten,
// fertig gebündelt und minifiziert (vendor/bpmn-auto-layout.min.js, vendor/bpmn-auto-layout.LIZENZEN.txt): Das
// Paket ist keine Abhängigkeit des Produkts und bleibt es so. Ein neueres bpmn-auto-layout wird im Store gebündelt
// und als Datei hier ersetzt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BuildError } from '../../build.mjs';
import { buildPage, writePage, runAsCommand, vendorFile, comment, layoutNotice, NODE_STUBS, REPO, VENDOR } from '../seiten.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(REPO, 'src/bpmn-assistant');
export const OUT = path.join(REPO, 'dist/bpmn-assistant.html');

// Die Seite als Text.
export async function bauen(){
  // bpmn-auto-layout von bpmn.io, die Vorabversion (Ben, 2026-10-06: „die alpha … ohne cdn einbetten“), mit seinen
  // Abhängigkeiten (bpmn-moddle, moddle, moddle-xml, saxen, min-dash) fertig gebündelt aus vendor/, davor ihre
  // Lizenzhinweise, wie der Spike sie aus den Paketen las (bpmn-auto-layout hat keine Lizenzdatei, MIT steht in seiner
  // package.json und seiner README).
  const balNotice = fs.readFileSync(path.join(VENDOR, 'bpmn-auto-layout.LIZENZEN.txt'), 'utf8');
  const balVersion = /bpmn-auto-layout ([^)\s]+)\)/.exec(balNotice)[1];
  // Die Beispiele (Ben, 2026-10-06; seit Story 2.31 drei mit Textanmerkungen): Reihenfolge und Beschriftung in
  // beispiele/beispiele.json, das XML je Datei daneben. Die Handreichung für LLMs: handreichung.md.
  const beispiele = JSON.parse(fs.readFileSync(path.join(HERE, 'beispiele', 'beispiele.json'), 'utf8'))
    .map(({ label, datei }) => ({ label, xml: fs.readFileSync(path.join(HERE, 'beispiele', datei), 'utf8') }));
  const handreichung = fs.readFileSync(path.join(HERE, 'handreichung.md'), 'utf8');
  return buildPage({
    template: path.join(PAGE, 'index.html'),
    entry: path.join(PAGE, 'main.js'),
    css: path.join(PAGE, 'assistant.css'),
    favicon: path.join(PAGE, 'favicon.svg'),
    // Im Skript stecken das Layout (für die Seite ohne Worker) und die Regelprüfung.
    notice: layoutNotice(),
    plugins: [NODE_STUBS],
    parts: {
      'data': { json: { beispiele, handreichung, balVersion } },
      'bpmn-io.js': { script: comment(balNotice.trimEnd()) + vendorFile(path.join(VENDOR, 'bpmn-auto-layout.min.js')) },
    },
  });
}

if (runAsCommand(import.meta.url)){
  try { writePage(OUT, await bauen()); }
  catch (e){ if (!(e instanceof BuildError)) throw e; console.error(e.message); process.exit(1); }
}
