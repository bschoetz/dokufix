// Prozess 4 auf zwei Wegen, die der Spike NICHT nutzt, zum Vergleich mit den Diagrammen 3 bis 5:
//   prozess4-mermaid-pur.png        derselbe Mermaid-Text, von Mermaid selbst gezeichnet (ohne die Markierung „bpmn“)
//   prozess4-bpmn-auto-layout.png   das BPMN-XML ohne Koordinaten, angeordnet von bpmn-auto-layout (verliert Pool und Bahnen)
// Braucht das Bündel aus der README (tests/out/bpmn-auto-layout.bundle.min.js).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { assemble, here } from '../assemble.mjs';
const out = f => path.join(here, 'tests', 'out', f);
const local = p => 'file://' + path.join(here, 'node_modules', p);
const md = fs.readFileSync(path.join(here, 'beispiel-prozesse.md'), 'utf8');
const a = md.indexOf('swimlane-beta LR', md.indexOf('dokufix: bpmn "Übergabe')), mermaidText = md.slice(a, md.indexOf('\n```', a));
const fence = '```';
fs.writeFileSync(out('_prozess4-mermaid.html'), assemble('# T\n\n## G\n\n### Mermaid pur\n\n' + fence + 'mermaid\n' + mermaidText + '\n' + fence + '\n')
  .replace('https://cdn.jsdelivr.net/npm/marked@18/lib/marked.umd.js', local('marked/lib/marked.umd.js'))
  .replace('https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.min.js', local('mermaid/dist/mermaid.min.js')));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium' });
let page = await browser.newPage({ viewport: { width: 3400, height: 1200 } });
await page.goto('file://' + out('_prozess4-mermaid.html'));
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
await page.evaluate(() => { document.querySelector('.dokufix-wrap').style.cssText = 'display:block;max-width:none'; const s = document.querySelector('.dokufix-stage'); s.style.maxWidth = 'none'; const svg = s.querySelector('svg'); svg.style.width = svg.viewBox.baseVal.width + 'px'; });
console.log('Mermaid pur:', await page.evaluate(() => { const v = document.querySelector('.dokufix-stage svg').viewBox.baseVal; return Math.round(v.width) + ' x ' + Math.round(v.height); }));
await page.locator('.dokufix-stage svg').screenshot({ path: out('prozess4-mermaid-pur.png') });
await page.close();

// bpmn-auto-layout braucht incoming/outgoing an jedem Element. Die liefert die erzeugte Datei, hier ohne ihren Koordinatenteil.
const plain = fs.readFileSync(path.join(here, 'diagramme/uebergabe.bpmn'), 'utf8').replace(/  <bpmndi:BPMNDiagram[\s\S]*<\/bpmndi:BPMNDiagram>\n/, '');
fs.writeFileSync(out('_prozess4-autolayout.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><div id="c" style="width:2400px;height:700px"></div>' +
  '<script src="' + local('bpmn-js/dist/bpmn-viewer.production.min.js') + '"></script><script src="bpmn-auto-layout.bundle.min.js"></script>');
page = await browser.newPage({ viewport: { width: 2400, height: 700 } });
await page.goto('file://' + out('_prozess4-autolayout.html'));
console.log('bpmn-auto-layout:', JSON.stringify(await page.evaluate(async x => {
  const laid = await bpmnAutoLayout.layoutProcess(x);
  const v = new BpmnJS({ container: '#c' }); await v.importXML(laid); v.get('canvas').zoom('fit-viewport');
  return { formen: (laid.match(/<bpmndi:BPMNShape /g) || []).length, kanten: (laid.match(/<bpmndi:BPMNEdge /g) || []).length, bahnen: (laid.match(/bpmnElement="Lane_/g) || []).length, pool: /bpmnElement="Participant_1"/.test(laid) };
}, plain)));
await page.screenshot({ path: out('prozess4-bpmn-auto-layout.png') });
await browser.close();
