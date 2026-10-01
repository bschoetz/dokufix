// Erzeugt diagramme/abo-anfrage.bpmn: Prozess 2 als BPMN 2.0 mit Koordinaten, so wie ein Modeler sie speichert.
// Die Koordinaten sind von Hand gesetzt. Das Diagramm zeigt den Fall, an dem Mermaids Anordnung scheitert:
// ein Gateway, das auf vier Empfänger auffächert.
// node diagramme/abo-anfrage.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { toXml } = vm.runInNewContext(fs.readFileSync(path.join(here, '../src/bpmn.js'), 'utf8') + '\nDokufixBpmn');

const ev = (cx, cy) => [cx - 18, cy - 18, 36, 36], gw = (cx, cy) => [cx - 25, cy - 25, 50, 50], task = (cx, cy) => [cx - 60, cy - 40, 120, 80];
const N = (id, type, name, box) => ({ id, type, name, box });
const tours = [['Nord', 'Tour Nord: Dörfer am Fluss', 490], ['Sued', 'Tour Süd: Stadtrand und Siedlung', 590], ['Stadt', 'Tour Stadt: Innenstadt per Lastenrad', 690], ['Hof', 'Abholung am Hof: alles andere', 790]];
const nodes = [
  N('Start', 'start', 'Möchte regelmäßig beliefert werden', ev(110, 85)),
  N('Formular', 'task', 'Abo-Formular ausfüllen, Tour wählen', task(250, 85)),
  N('Eingang', 'end', 'Bestätigung erhalten', ev(650, 85)),
  N('Pruefen', 'task', 'Pflichtfelder und Adresse prüfen', task(250, 225)),
  N('Bestaetigen', 'task', 'Bestätigung an den Kunden senden', task(450, 225)),
  N('Tour', 'gateway', 'Welche Tour?', gw(650, 225)),
  N('Liste', 'task', 'Kunde in Liste Abo-Anfragen', task(250, 365)),
  N('Status', 'task', 'Status auf ABO_ANFRAGE setzen', task(450, 365)),
  N('Erfasst', 'end', 'erfasst', ev(650, 365)),
  ...tours.map(([id, name, cy]) => N('Tour' + id, 'task', name, [790, cy - 40, 170, 80])),
  N('Einplanen', 'task', 'Kiste einplanen, Status pflegen', task(1090, 640)),
  N('Eingeplant', 'end', 'eingeplant', ev(1230, 640))
];
const F = (from, to, ...points) => ({ from, to, points });
const flows = [
  F('Start', 'Formular', [128, 85], [190, 85]),
  F('Formular', 'Pruefen', [250, 125], [250, 185]),
  F('Pruefen', 'Bestaetigen', [310, 225], [390, 225]),
  F('Bestaetigen', 'Eingang', [450, 185], [450, 85], [632, 85]),
  F('Pruefen', 'Tour', [290, 265], [290, 285], [650, 285], [650, 250]),
  F('Pruefen', 'Liste', [230, 265], [230, 325]),
  F('Liste', 'Status', [310, 365], [390, 365]),
  F('Status', 'Erfasst', [510, 365], [632, 365]),
  ...tours.map(([id, , cy]) => F('Tour', 'Tour' + id, [675, 225], [735, 225], [735, cy], [790, cy])),
  ...tours.map(([id, , cy]) => F('Tour' + id, 'Einplanen', [960, cy], [995, cy], [995, 640], [1030, 640])),
  F('Einplanen', 'Eingeplant', [1150, 640], [1212, 640])
].map((f, i) => ({ ...f, id: 'Flow_' + (i + 1), name: '' }));
const lanes = [
  { id: 'Lane_Kunde', name: 'Kunde', box: [40, 20, 1260, 130], nodes: ['Start', 'Formular', 'Eingang'] },
  { id: 'Lane_Bestellformular', name: 'Bestellformular', box: [40, 150, 1260, 150], nodes: ['Pruefen', 'Bestaetigen', 'Tour'] },
  { id: 'Lane_Kundenkartei', name: 'Kundenkartei', box: [40, 300, 1260, 130], nodes: ['Liste', 'Status', 'Erfasst'] },
  { id: 'Lane_Tourenplanung', name: 'Tourenplanung', box: [40, 430, 1260, 420], nodes: [...tours.map(t => 'Tour' + t[0]), 'Einplanen', 'Eingeplant'] }
];
const di = {
  pool: [10, 20, 1290, 830],
  lanes: Object.fromEntries(lanes.map(l => [l.id, l.box])),
  nodes: Object.fromEntries(nodes.map(n => [n.id, n.box])),
  // Beschriftung des Gateways dorthin, wo kein Pfeil läuft
  labels: { Tour: [602, 168, 96, 28] },
  flows: Object.fromEntries(flows.map(f => [f.id, f.points]))
};
const xml = toXml({ name: 'Abo-Anfrage', vertical: false, nodes, flows, lanes }, di);
fs.writeFileSync(path.join(here, 'abo-anfrage.bpmn'), xml);
console.log('abo-anfrage.bpmn:', Buffer.byteLength(xml), 'Bytes,', xml.split('\n').length, 'Zeilen');
