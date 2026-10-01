// BPMN-Tests:
//  D  echtes BPMN-2.0-XML mit Koordinaten (Prozess 2, von Hand angeordnet, wie aus einem Modeler) → bpmn-js
//  A  Mermaid-Quelltext → Modell → BPMN-XML ohne Koordinaten → bpmn-auto-layout → bpmn-js (Prozess mit laneSet)
//  B  wie A, aber als Collaboration/Pool
//  C  Mermaid-Quelltext → Modell + Koordinaten aus Mermaids Swimlane-Layout → BPMN-XML mit Bahnen → bpmn-js
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = f => path.join(here, 'out', f);
const mmd = 'flowchart LR\n' + fs.readFileSync(path.join(here, 'prozess1.mmd'), 'utf8');

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 800 } });
page.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
await page.goto('file://' + path.join(here, 'bpmn-page.html'));

const model = await page.evaluate(src => mermaidToModel(src, 'Probekiste'), mmd);
console.log('Mermaid-Parser → Modell:', model.nodes.length, 'Knoten,', model.flows.length, 'Kanten,', model.lanes.length, 'Bahnen');
console.log('  Typen:', model.nodes.map(n => n.id + '=' + n.type).join(' '));
console.log('  Bahnen:', model.lanes.map(l => l.name + '[' + l.nodes.join(',') + ']').join(' '));
fs.writeFileSync(out('prozess1.modell.json'), JSON.stringify(model, null, 1));

async function run(name, xml) {
  fs.writeFileSync(out(name + '.bpmn'), xml);
  const r = await page.evaluate(x => show(x).catch(e => ({ error: String(e && e.message || e).slice(0, 300) })), xml);
  if (r.svg) { fs.writeFileSync(out(name + '.svg'), r.svg); delete r.svg; }
  console.log(name.padEnd(34), 'xml', Buffer.byteLength(xml), 'B →', JSON.stringify(r));
  await page.locator('#canvas').screenshot({ path: out(name + '.png') });
}

// D: XML mit Koordinaten, wie ein Modeler es speichert (Prozess 2, erzeugt von diagramme/abo-anfrage.mjs)
await run('bpmn-D-mit-koordinaten', fs.readFileSync(path.join(here, '../diagramme/abo-anfrage.bpmn'), 'utf8'));

// A/B: ohne Koordinaten, Auto-Layout
for (const [name, collaboration] of [['bpmn-A-autolayout-prozess', false], ['bpmn-B-autolayout-pool', true]]) {
  const plain = await page.evaluate(([m, c]) => toBpmnXml(m, { collaboration: c }), [model, collaboration]);
  const laid = await page.evaluate(x => bpmnAutoLayout.layoutProcess(x).catch(e => 'FEHLER ' + (e && e.message || e)), plain);
  if (laid.startsWith('FEHLER')) { console.log(name, laid.slice(0, 300)); continue; }
  console.log('  ' + name + ': Lane-Shapes im DI nach Auto-Layout:', (laid.match(/bpmnElement="Lane_/g) || []).length, '| Participant-Shape:', /bpmnElement="Participant_1"/.test(laid));
  await run(name, laid);
}
// C: Koordinaten aus Mermaids Swimlane-Layout
for (const [label, file, title] of [['prozess1', 'prozess1.mmd', 'Probekiste'], ['prozess2', 'prozess2.mmd', 'Abo-Anfrage']]) {
  const body = fs.readFileSync(path.join(here, file), 'utf8');
  const res = await page.evaluate(async ([body, title]) => {
    try { const m = await mermaidToModel('flowchart LR\n' + body, title); const d = await mermaidLayoutToDi(body, m); return toBpmnXml(m, { collaboration: true, di: d }); }
    catch (e) { return 'FEHLER ' + (e && e.stack || e); }
  }, [body, title]);
  if (res.startsWith('FEHLER')) { console.log('C ' + label, res.slice(0, 400)); continue; }
  await run('bpmn-C-mermaid-layout-' + label, res);
}
await browser.close();
