// Erzeugt diagramme/uebergabe.bpmn: Prozess 4 als BPMN 2.0 mit Koordinaten, so wie ein Modeler sie speichert.
// Dasselbe Modell wie der Mermaid-Text in beispiel-prozesse.md, aber von Hand angeordnet. Dient dem Vergleich beider Wege.
// node diagramme/uebergabe.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { toXml } = vm.runInNewContext(fs.readFileSync(path.join(here, '../src/bpmn.js'), 'utf8') + '\nDokufixBpmn');

const ev = (cx, cy) => [cx - 18, cy - 18, 36, 36], gw = (cx, cy) => [cx - 25, cy - 25, 50, 50], task = (cx, cy) => [cx - 60, cy - 40, 120, 80];
const N = (id, type, name, box, tag, def) => ({ id, type, name, box, tag, def });
const nodes = [
  N('Start', 'start', 'Reagiert auf eine Erinnerung', ev(110, 85)),
  N('Weg', 'gateway', 'Wie meldet er sich?', gw(200, 85)),
  N('Antworten', 'task', 'Auf die Mail antworten', task(360, 85), 'sendTask'),
  N('Postfach', 'inter', 'Antwort im Postfach', ev(360, 250), 'intermediateCatchEvent', 'message'),
  N('Art', 'gateway', 'Art der Antwort?', gw(470, 250)),
  N('Abwesenheit', 'end', 'Abwesenheit, nichts zu tun', ev(570, 190)),
  N('Teilen', 'gateway', '', gw(760, 250), 'parallelGateway'),
  N('PersoenlichAntworten', 'task', 'Persönlich antworten am selben Tag', task(910, 250), 'sendTask'),
  N('Zusammen', 'gateway', '', gw(1190, 250), 'parallelGateway'),
  N('AnTouren', 'task', 'An die Tourenplanung geben', task(1330, 250), 'sendTask'),
  N('Abmelden', 'task', 'Abmeldung sofort eintragen', task(580, 405), 'userTask'),
  N('Abgemeldet', 'end', 'Abgemeldet', ev(690, 405)),
  N('Status', 'task', 'Status auf ABO_ANFRAGE setzen', task(910, 405), 'userTask'),
  N('MailsEnden', 'task', 'Erinnerungen enden automatisch', task(1070, 405), 'serviceTask'),
  N('AboAnfrage', 'task', 'Abo-Anfrage Prozess 2', task(320, 535), 'callActivity'),
  N('BeiTouren', 'end', 'Bei der Tourenplanung', ev(1330, 535))
];
const F = (from, to, name, ...points) => ({ from, to, name, points });
const flows = [
  F('Start', 'Weg', '', [128, 85], [175, 85]),
  F('Weg', 'Antworten', 'Antwort', [225, 85], [300, 85]),
  F('Weg', 'AboAnfrage', 'Formular', [200, 110], [200, 535], [260, 535]),
  F('Antworten', 'Postfach', '', [360, 125], [360, 232]),
  F('Postfach', 'Art', '', [378, 250], [445, 250]),
  F('Art', 'Abwesenheit', 'Abwesenheit', [470, 225], [470, 190], [552, 190]),
  F('Art', 'Abmelden', 'Abmeldung', [470, 275], [470, 405], [520, 405]),
  F('Abmelden', 'Abgemeldet', '', [640, 405], [672, 405]),
  F('Art', 'Teilen', 'Anfrage', [495, 250], [735, 250]),
  F('Teilen', 'PersoenlichAntworten', '', [785, 250], [850, 250]),
  F('Teilen', 'Status', '', [760, 275], [760, 405], [850, 405]),
  F('Status', 'MailsEnden', '', [970, 405], [1010, 405]),
  F('PersoenlichAntworten', 'Zusammen', '', [970, 250], [1165, 250]),
  F('MailsEnden', 'Zusammen', '', [1130, 405], [1190, 405], [1190, 275]),
  F('Zusammen', 'AnTouren', '', [1215, 250], [1270, 250]),
  F('AnTouren', 'BeiTouren', '', [1330, 290], [1330, 517]),
  F('AboAnfrage', 'BeiTouren', '', [380, 535], [1312, 535])
].map((f, i) => ({ ...f, id: 'Flow_' + (i + 1) }));
const lanes = [
  { id: 'Lane_Kunde', name: 'Kunde', box: [40, 20, 1390, 130], nodes: ['Start', 'Weg', 'Antworten'] },
  { id: 'Lane_Hofbuero', name: 'Hofbüro', box: [40, 150, 1390, 175], nodes: ['Postfach', 'Art', 'Abwesenheit', 'Teilen', 'PersoenlichAntworten', 'Zusammen', 'AnTouren'] },
  { id: 'Lane_Kundenkartei', name: 'Kundenkartei', box: [40, 325, 1390, 160], nodes: ['Abmelden', 'Abgemeldet', 'Status', 'MailsEnden'] },
  { id: 'Lane_Tourenplanung', name: 'Tourenplanung', box: [40, 485, 1390, 100], nodes: ['AboAnfrage', 'BeiTouren'] }
];
const label = { Flow_2: [232, 67, 48, 14], Flow_3: [206, 118, 54, 14], Flow_6: [476, 172, 70, 14], Flow_7: [476, 290, 62, 14], Flow_9: [505, 232, 50, 14] };
const di = {
  pool: [10, 20, 1420, 565],
  lanes: Object.fromEntries(lanes.map(l => [l.id, l.box])),
  nodes: Object.fromEntries(nodes.map(n => [n.id, n.box])),
  // Beschriftungen dorthin, wo kein Pfeil läuft: über dem ersten Gateway, links über dem zweiten, rechts neben dem Endereignis
  labels: { Weg: [152, 28, 96, 28], Art: [378, 190, 88, 28], Abwesenheit: [594, 176, 90, 28] },
  flows: Object.fromEntries(flows.map(f => [f.id, f.points])),
  flowLabels: label
};
const xml = toXml({ name: 'Übergabe an die Tourenplanung', vertical: false, nodes, flows, lanes }, di);
fs.writeFileSync(path.join(here, 'uebergabe.bpmn'), xml);
console.log('uebergabe.bpmn:', Buffer.byteLength(xml), 'Bytes,', xml.split('\n').length, 'Zeilen');
