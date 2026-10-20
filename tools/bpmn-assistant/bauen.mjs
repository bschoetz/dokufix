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
// übernommen. Was es aus dem Store las, liegt seither hier: die Beispiele (beispiele/, mit beispiele.json für
// Reihenfolge und Beschriftung) und bpmn-auto-layout mit seinen Abhängigkeiten,
// fertig gebündelt und minifiziert (vendor/bpmn-auto-layout.min.js, vendor/bpmn-auto-layout.LIZENZEN.txt): Das
// Paket ist keine Abhängigkeit des Produkts und bleibt es so. Ein neueres bpmn-auto-layout wird im Store gebündelt
// und als Datei hier ersetzt.
//
// Die beiden Prompts für LLMs (Story 2.47; bis dahin die Handreichung, handreichung.md): Der Kern zu BPMN steht einmal,
// in docs/dokufix-fuer-llms.md zwischen <!-- kern:bpmn --> und <!-- /kern:bpmn -->. Prompt A, nur das XML fürs Feld,
// ist der Rahmen prompt-xml.md mit dem Kern an der Stelle {{kern:bpmn}}; Prompt B, ein dokufix-Dokument, ist die
// Datei in docs/ selbst. Beide beginnen mit „Stand: JJJJ-MM-TT“, dem Datum des jüngsten Commits ihrer Quellen, dem
// heutigen, wenn eine geändert ist, ohne git ohne Zeile. Fehlt eine Marke oder steht sie doppelt, bricht der Bau ab.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { BuildError } from '../../build.mjs';
import { buildPage, writePage, runAsCommand, vendorFile, comment, layoutNotice, NODE_STUBS, REPO, VENDOR } from '../seiten.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(REPO, 'src/bpmn-assistant');
export const OUT = path.join(REPO, 'dist/bpmn-assistant.html');
export const DOCS = path.join(REPO, 'docs/dokufix-fuer-llms.md');
export const FRAME = path.join(HERE, 'prompt-xml.md');
const KERN_AUF = '<!-- kern:bpmn -->', KERN_ZU = '<!-- /kern:bpmn -->', KERN_STELLE = '{{kern:bpmn}}';
const count = (text, s) => text.split(s).length - 1;

// Der Kern zu BPMN aus dem Text von file: was zwischen den beiden Marken steht, ohne die Leerzeilen an seinen Rändern.
// Jede Marke genau einmal, die öffnende vor der schließenden, sonst ein BuildError mit dem Namen der Datei.
export function kernOf(text, file){
  const rel = path.relative(REPO, file);
  if (count(text, KERN_AUF) !== 1 || count(text, KERN_ZU) !== 1)
    throw new BuildError(`${rel}: ${KERN_AUF} und ${KERN_ZU} müssen je genau einmal stehen (gefunden ${count(text, KERN_AUF)} und ${count(text, KERN_ZU)}).`);
  const a = text.indexOf(KERN_AUF) + KERN_AUF.length, z = text.indexOf(KERN_ZU);
  if (z < a) throw new BuildError(`${rel}: ${KERN_ZU} steht vor ${KERN_AUF}.`);
  return text.slice(a, z).replace(/^\s*\n/, '').replace(/\s+$/, '');
}

// Prompt A: der Rahmen mit dem Kern an seiner Stelle, die genau einmal stehen muss.
export function promptXmlOf(frame, kern, file = FRAME){
  if (count(frame, KERN_STELLE) !== 1)
    throw new BuildError(`${path.relative(REPO, file)}: ${KERN_STELLE} muss genau einmal stehen (gefunden ${count(frame, KERN_STELLE)}).`);
  return frame.replace(KERN_STELLE, () => kern);
}

// Der Stand von Quelldateien: das Datum (JJJJ-MM-TT) des jüngsten Commits, der eine von ihnen ändert, das heutige,
// wenn eine nicht eingecheckte Änderungen hat oder nicht eingecheckt ist, null ohne git.
export function standOf(files){
  const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const heute = () => { const d = new Date(); return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-'); };
  try {
    const rel = files.map(f => path.relative(REPO, f));
    if (git('status', '--porcelain', '--', ...rel)) return heute();
    return rel.map(f => git('log', '-1', '--format=%cs', '--', f) || heute()).sort().at(-1);
  } catch { return null; }
}
const mitStand = (text, stand) => stand ? `Stand: ${stand}\n\n${text}` : text;

// Die beiden Prompts als Text: { promptXml, promptMarkdown }.
export function prompts(){
  const docs = fs.readFileSync(DOCS, 'utf8'), frame = fs.readFileSync(FRAME, 'utf8');
  const kern = kernOf(docs, DOCS);
  return {
    promptXml: mitStand(promptXmlOf(frame, kern), standOf([FRAME, DOCS])),
    promptMarkdown: mitStand(docs, standOf([DOCS])),
  };
}

// Die Seite als Text.
export async function bauen(){
  // bpmn-auto-layout von bpmn.io, die Vorabversion (Ben, 2026-10-06: „die alpha … ohne cdn einbetten“), mit seinen
  // Abhängigkeiten (bpmn-moddle, moddle, moddle-xml, saxen, min-dash) fertig gebündelt aus vendor/, davor ihre
  // Lizenzhinweise, wie der Spike sie aus den Paketen las (bpmn-auto-layout hat keine Lizenzdatei, MIT steht in seiner
  // package.json und seiner README).
  const balNotice = fs.readFileSync(path.join(VENDOR, 'bpmn-auto-layout.LIZENZEN.txt'), 'utf8');
  const balVersion = /bpmn-auto-layout ([^)\s]+)\)/.exec(balNotice)[1];
  // Die Beispiele (Ben, 2026-10-06; seit Story 2.31 drei mit Textanmerkungen): Reihenfolge und Beschriftung in
  // beispiele/beispiele.json, das XML je Datei daneben. Die beiden Prompts für LLMs: prompts() oben.
  const beispiele = JSON.parse(fs.readFileSync(path.join(HERE, 'beispiele', 'beispiele.json'), 'utf8'))
    .map(({ label, datei }) => ({ label, xml: fs.readFileSync(path.join(HERE, 'beispiele', datei), 'utf8') }));
  const { promptXml, promptMarkdown } = prompts();
  return buildPage({
    template: path.join(PAGE, 'index.html'),
    entry: path.join(PAGE, 'main.js'),
    css: path.join(PAGE, 'assistant.css'),
    favicon: path.join(PAGE, 'favicon.svg'),
    // Im Skript stecken das Layout (für die Seite ohne Worker) und die Regelprüfung.
    notice: layoutNotice(),
    plugins: [NODE_STUBS],
    parts: {
      'data': { json: { beispiele, promptXml, promptMarkdown, balVersion } },
      'bpmn-io.js': { script: comment(balNotice.trimEnd()) + vendorFile(path.join(VENDOR, 'bpmn-auto-layout.min.js')) },
    },
  });
}

if (runAsCommand(import.meta.url)){
  try { writePage(OUT, await bauen()); }
  catch (e){ if (!(e instanceof BuildError)) throw e; console.error(e.message); process.exit(1); }
}
