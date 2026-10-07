// Independent check of parsing/leser.mjs: readProcess() on the reader's tree vs on Chromium's DOMParser.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const R = '/home/user/dokufix/';
const { chromium } = await import(R + 'node_modules/playwright-core/index.mjs');
const esbuild = await import(R + 'node_modules/esbuild/lib/main.js');
const { readProcess } = await import(R + 'src/app/bpmn-layout.js');
const { parseXml } = await import('../parsing/leser.mjs');
const { fixtureNames, fixtureFile } = await import(R + 'tests/bpmn-fixtures.mjs');
const cases = fixtureNames().map(n => [n, fs.readFileSync(fixtureFile(n, '.bpmn'), 'utf8')]);
const B = (body, attrs = '') => `<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D"${attrs}><bpmn:process id="P">${body}</bpmn:process></bpmn:definitions>`;
const flow = '<bpmn:startEvent id="s" name="Start"/><bpmn:sequenceFlow id="f" sourceRef="s" targetRef="t"/>';
cases.push(
  ['eigen-amp', B(flow + '<bpmn:task id="t" name="Mahnung &amp; Gebühr &lt;neu&gt;"/>')],
  ['eigen-crlf', B(flow + '<bpmn:task id="t" name="A"/><bpmn:textAnnotation id="n"><bpmn:text>Zeile 1\r\nZeile 2</bpmn:text></bpmn:textAnnotation><bpmn:association id="a" sourceRef="n" targetRef="t"/>').replace(/\n/g, '\r\n')],
  ['eigen-cdata', B(flow + '<bpmn:task id="t" name="A"/><bpmn:textAnnotation id="n"><bpmn:text><![CDATA[x < y & z]]></bpmn:text></bpmn:textAnnotation><bpmn:association id="a" sourceRef="n" targetRef="t"/>')],
  ['eigen-charref', B(flow + '<bpmn:task id="t" name="&#x1F600; &#228;&#10;neu"/>')],
  ['eigen-attr-nl', B(flow + '<bpmn:task id="t" name="zwei\n\tteile"/>')],
  ['eigen-default-ns', '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D"><process id="P"><startEvent id="s"/><task id="t" name="Ohne Präfix"/><sequenceFlow id="f" sourceRef="s" targetRef="t"/></process></definitions>'],
  ['eigen-bom', '﻿' + B(flow + '<bpmn:task id="t" name="BOM"/>')],
);
const ours = cases.map(([n, x]) => { try { const d = parseXml(x); return JSON.stringify(readProcess(d)); } catch (e){ return 'Fehler: ' + e.message.split('\n')[0]; } });
const bundle = (await esbuild.build({ stdin: { contents: "import { readProcess } from './src/app/bpmn-layout.js'; window.rp = readProcess;", resolveDir: R, loader: 'js' }, bundle: true, format: 'iife', write: false, logLevel: 'silent' })).outputFiles[0].text;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  const page = await browser.newPage(); await page.setContent('<html><body></body></html>'); await page.addScriptTag({ content: bundle });
  const theirs = await page.evaluate(cases => cases.map(([n, x]) => { const d = new DOMParser().parseFromString(x, 'application/xml'); if (d.getElementsByTagName('parsererror').length) return 'Fehler'; try { return JSON.stringify(window.rp(d)); } catch (e){ return 'Fehler: ' + e.message; } }), cases);
  let same = 0; const diff = [];
  cases.forEach(([n], i) => { if (ours[i] === theirs[i]) same++; else diff.push(n + ': ' + ours[i].slice(0, 90) + ' | Chromium: ' + theirs[i].slice(0, 90)); });
  console.log('Fälle:', cases.length, '| gleich wie Chromium:', same); diff.forEach(d => console.log('  ' + d));
} finally { await browser.close(); }
