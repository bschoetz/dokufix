// Robustheit: Markdown, das NICHT das Beispieldokument ist. Jede Zeile ist ein Fall aus dem Code-Review.
// Teil 1 lädt nur marked + komponenten.js (lokal, ohne Netz). Teil 2 baut ganze Seiten wie build.mjs (braucht CDN).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { assemble, exportStatic, here } from '../assemble.mjs';

const out = path.join(here, 'tests', 'out');
const failures = [];
const expect = (label, actual, wanted) => {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  console.log((ok ? 'ok    ' : 'FEHLER') + ' ' + label + (ok ? '' : ': ' + JSON.stringify(actual) + ' statt ' + JSON.stringify(wanted)));
  if (!ok) failures.push(label);
};

const harness = `<!doctype html><meta charset="utf-8"><style>${fs.readFileSync(path.join(here, 'src/komponenten.css'), 'utf8')}</style>
<body><div class="dokufix-wrap"><nav class="dokufix-nav"></nav><main></main></div>
<script src="../../node_modules/marked/lib/marked.umd.js"></script>
<script>${fs.readFileSync(path.join(here, 'src/komponenten.js'), 'utf8')}</script>
<script>
window.run = (md) => {
  const main = document.querySelector('main'), nav = document.querySelector('nav');
  main.innerHTML = ''; nav.innerHTML = ''; window.alarm = 0;
  let error = null;
  try { main.innerHTML = marked.parse(md, { gfm: true }); DokufixKomponenten.render(main, nav); } catch (e) { error = String(e); }
  return error;
};
</script>`;
const harnessFile = path.join(out, '_robustheit.html');
fs.writeFileSync(harnessFile, harness);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file://' + harnessFile);
const run = (md, probe) => page.evaluate(([md, probe]) => { const error = window.run(md); return { error, ...(new Function('return (' + probe + ')()'))() }; }, [md, probe.toString()]);
const q = `document.querySelector.bind(document)`;

let r;
r = await run('### A\n\n```js\nconst a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\n```\n', () => ({ h: document.querySelector('pre').offsetHeight > 60 }));
expect('Codeblock behält seine Zeilen', [r.error, r.h], [null, true]);

r = await run('<!-- dokufix: side-note wichtig -->\nAbsatz.\n\n> [!NOTE]\n> x\n', () => ({ warn: document.querySelectorAll('.dokufix-warnung').length, callouts: document.querySelectorAll('.dokufix-callout').length }));
expect('Markierung mit Bindestrich und Argument bricht nichts ab', [r.error, r.warn, r.callouts], [null, 1, 1]);

r = await run('# Handbuch\n\nKurz.\n\n## Installation\n\nText.\n\n## Konfiguration\n\nText.\n', () => ({ visible: [...document.querySelectorAll('main h2')].map(h => h.offsetHeight > 10), links: document.querySelectorAll('.dokufix-nav > a').length, groups: document.querySelectorAll('.dokufix-navgrp').length }));
expect('Dokument nur mit H2: Überschriften sichtbar und verlinkt', [r.visible, r.links, r.groups], [[true, true], 2, 0]);

r = await run('## G\n\n### Übersicht\n\n### Übersicht\n\n### Übersicht 2\n\n<h3 id="mein-anker">Eigener Anker</h3>\n', () => ({ ids: [...document.querySelectorAll('main h3')].map(h => h.id), hrefs: [...document.querySelectorAll('.dokufix-nav > a')].map(a => a.getAttribute('href')) }));
expect('Überschriften-ids eindeutig, Autoren-id bleibt', [new Set(r.ids).size, r.ids[3], r.hrefs[3]], [4, 'mein-anker', '#mein-anker']);

r = await run('<!-- dokufix: facets Sprache -->\n| Name | Sprache |\n|---|---|\n| a | C |\n| b | C++ |\n| c | C# |\n| d | 日本語 |\n| e | 中文 |\n| f | |\n', () => ({ pills: [...document.querySelectorAll('.dokufix-facet-ui label')].map(l => l.textContent.trim().replace(/\s+/g, ' ')) }));
expect('Facetten trennen C / C++ / C# / Schriftzeichen / leer', r.pills, ['Alle 6', 'C 1', 'C++ 1', 'C# 1', '日本語 1', '中文 1', '— 1']);

r = await run('<!-- dokufix: facets A \\<img src=x onerror=window.alarm=1\\> -->\n| A \\<img src=x onerror=window.alarm=1\\> | B |\n|---|---|\n| 1 | 2 |\n', () => ({ img: document.querySelectorAll('.dokufix-facet-ui img').length, alarm: window.alarm, legend: (document.querySelector('legend') || {}).textContent }));
expect('Facetten-Legende wird maskiert', [r.error, r.img, r.alarm], [null, 0, 0]);

r = await run('<!-- dokufix: facets B -->\n<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td colspan="2">beides</td></tr><tr><td>1</td><td>x</td></tr></tbody></table>\n\n### Danach\n', () => ({ nav: document.querySelectorAll('.dokufix-nav > a').length, pills: document.querySelectorAll('.dokufix-facet-ui label').length }));
expect('Facette auf Tabelle mit colspan wirft nicht', [r.error, r.nav, r.pills], [null, 1, 3]);

r = await run('<!-- dokufix: steps -->\n3. drei\n4. vier\n', () => ({ reset: document.querySelector('ol').style.counterReset }));
expect('Schrittliste ab 3 zählt ab 3', r.reset, 's 2');

r = await run('<!-- dokufix: steps -->\n1. *Nie* ohne Backup starten.\n2. *Kasse:* macht etwas.\n\n<!-- dokufix: steps -->\n1. *Kasse:* lose Liste.\n\n2. Zweiter Punkt.\n', () => ({ who: [...document.querySelectorAll('.dokufix-who')].map(e => e.textContent) }));
expect('Akteur nur mit Doppelpunkt, auch in losen Listen', r.who, ['Kasse', 'Kasse']);

r = await run('<!-- dokufix: cards -->\n- Vorab **fett** mittendrin\n- **Titel**\\\n  Text\n\n<!-- dokufix: cards -->\n- **Lose A**\n\n  Text A\n\n- **Lose B**\n\n  Text B\n', () => ({ titles: [...document.querySelectorAll('.dokufix-card-title')].map(e => e.textContent), br: document.querySelectorAll('ul.dokufix-cards br').length }));
expect('Kartentitel nur am Anfang, auch in losen Listen', [r.titles, r.br], [['Titel', 'Lose A', 'Lose B'], 0]);

r = await run('| A |\n|---|\n| Zeile<br>und ein *betontes* Wort |\n| Kopf<br>*Unterzeile* |\n', () => ({ sub: [...document.querySelectorAll('.dokufix-sub')].map(e => e.textContent) }));
expect('Unterzeile nur direkt nach dem Umbruch', r.sub, ['Unterzeile']);

r = await run('<!-- dokufix: crads -->\n- a\n\n<!-- dokufix: steps -->\n- kein ol\n\n<!-- dokufix: cards -->\nEinleitung:\n\n- b\n\n<!-- dokufix: filter-ui -->\nAbsatz\n\n<!-- dokufix: facets Tpy -->\n| Typ |\n|---|\n| x |\n', () => ({ warn: [...document.querySelectorAll('.dokufix-warnung')].map(e => e.textContent), stray: document.querySelectorAll('main [class*="dokufix-crads"], main p.dokufix-cards, main p.dokufix-filter-ui, main ul.dokufix-steps').length }));
expect('Tippfehler, falsche Blockart, interne Klassen: sichtbare Warnung statt stiller Wirkung', [r.warn.length, r.stray], [5, 0]);
console.log('       ' + r.warn.join('\n       '));

r = await run('> [!note]\n> klein geschrieben\n\n> [!NOTE] Text in derselben Zeile\n\n> [!TIP]\n> - Liste\n\n> Normales Zitat\n', () => ({ callouts: document.querySelectorAll('.dokufix-callout').length, quotes: document.querySelectorAll('blockquote').length, emptyP: [...document.querySelectorAll('.dokufix-callout p')].filter(p => !p.textContent.trim()).length }));
expect('Hinweise wie bei GitHub: Kleinschreibung ja, Text in der Markerzeile nein, kein leerer Absatz', [r.callouts, r.quotes, r.emptyP], [2, 2, 0]);

r = await run('## G\n\n### `🟢 ok`\n\n> [!NOTE]\n> ### Überschrift im Hinweis\n\n### Zweite\n', () => ({ labels: [...document.querySelectorAll('.dokufix-nav > a')].map(a => a.textContent), eyebrowInCallout: document.querySelectorAll('.dokufix-callout .dokufix-eyebrow').length }));
expect('Navigation: kein leerer Link, keine Überschriften aus Hinweisen', [r.labels, r.eyebrowInCallout], [['ok', 'Zweite'], 0]);

r = await run('> # Zitierte Überschrift\n\n# Titel\n\n' + 'Ein ganz normaler langer Einleitungsabsatz, der nicht in die schmale Navigation gehört. '.repeat(3) + '\n\n## A\n\n### B\n', () => ({ brand: (document.querySelector('.dokufix-nav h1') || {}).textContent, sub: document.querySelectorAll('.dokufix-nav .dokufix-brand-sub').length, emptyQuote: [...document.querySelectorAll('main blockquote')].filter(b => !b.textContent.trim()).length }));
expect('Nur die H1 der obersten Ebene wird Marke, lange Einleitung bleibt im Text', [r.brand, r.sub, r.emptyQuote], ['Titel', 0, 0]);
await page.close();

// --- Teil 2: ganze Seiten ---
const full = async (name, md) => {
  const file = path.join(out, '_robust-' + name + '.html');
  fs.writeFileSync(file, assemble(md));
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('file://' + file);
  await p.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
  return p;
};
const fence = '```';
let p = await full('script-im-text', '# T\n\n## G\n\n### Vor dem Code\n\nKommentare beginnen mit `<!--`, Skripte mit `<script>`.\n\n' + fence + 'html\n<script src="app.js"></script>\n' + fence + '\n\n### Nach dem Code\n\nEnde.\n');
expect('Markdown mit <script> und <!-- im Text zerlegt die Seite nicht', await p.evaluate(() => [[...document.querySelectorAll('.dokufix-nav > a')].map(a => a.textContent), document.body.innerText.includes('### Nach dem Code')]), [['Vor dem Code', 'Nach dem Code'], false]);
await p.close();

p = await full('mermaid-fehler', '# T\n\n## G\n\n### D\n\n' + fence + 'mermaid\nswimlane-beta TB\n  subgraph A\n    x[[[kaputt\n  end\n' + fence + '\n\n' + fence + 'mermaid\nflowchart LR\n  a --> b\n' + fence + '\n');
expect('Mermaid-Syntaxfehler wird sichtbare Warnung, das zweite Diagramm rendert', await p.evaluate(() => [document.querySelectorAll('.dokufix-warnung[data-fehler="mermaid"]').length, document.querySelectorAll('svg[aria-roledescription="error"]').length, document.querySelectorAll('.dokufix-diagram svg').length]), [1, 0, 1]);
await p.screenshot({ path: path.join(out, 'robust-mermaid-fehler.png') });
await p.close();

p = await full('roh-html', '# T\n\n## G\n\n### X\n\n<img src="x" onerror="window.alarm=1">\n\n<a href="javascript:alert(1)">Link</a>\n');
const ex = await p.evaluate(exportStatic);
console.log('       Roh-HTML im Markdown: Export enthält ' + ex.handlers + ' on*-Attribut(e) und ' + ex.jsUrls + ' javascript:-URL(s). Bekannt und offen: weder Spike noch PoC säubern Roh-HTML. build.mjs meldet das jetzt.');
await p.close();

// --- Teil 3: BPMN ---
const lanes = body => fence + 'mermaid\nswimlane-beta LR\n  subgraph Eins\n' + body + '\n  end\n  subgraph Zwei\n    q[Andere Bahn]\n  end\n' + fence + '\n';
p = await full('bpmn', '# T\n\n## G\n\n### Ziffern als ids\n\n<!-- dokufix: bpmn -->\n' + lanes('    1((Start)) --> 2[Aufgabe] --> 3(((Ende)))') +
  '\n### ids wie im XML\n\n<!-- dokufix: bpmn -->\n' + lanes('    Process_1((Start)) --> Flow_1[Aufgabe] --> Lane_X(((Ende)))') +
  '\n### Zwischenereignis\n\n<!-- dokufix: bpmn -->\n' + lanes('    s((Start)) --> m((Zwischen)) --> t[Aufgabe]') +
  '\n### Zwei Kanten zwischen denselben Knoten\n\n<!-- dokufix: bpmn -->\n' + lanes('    a{Frage?} -- ja --> b[Ziel]\n    a -- nein --> b') +
  '\n### Hochkant\n\n<!-- dokufix: bpmn "Hochkant" -->\n' + lanes('    s((Start)) --> t[Aufgabe] --> x{Ok?}\n    x -- ja --> e(((Ende)))\n    x -- nein --> q').replace('swimlane-beta LR', 'swimlane-beta TB') +
  '\n### Kaputtes XML\n\n' + fence + 'bpmn\n<bpmn:definitions>kein BPMN\n' + fence + '\n' +
  '\n### XML ohne Koordinaten\n\n' + fence + 'bpmn\n<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="x"><bpmn:process id="P"><bpmn:task id="T" name="A"/></bpmn:process></bpmn:definitions>\n' + fence + '\n' +
  '\n### XML ohne Koordinaten, Element ohne Bahn\n\n' + fence + 'bpmn\n<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="x"><bpmn:process id="P"><bpmn:laneSet id="S"><bpmn:lane id="L" name="Eins"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet><bpmn:task id="A" name="A"/><bpmn:task id="B" name="B"/></bpmn:process></bpmn:definitions>\n' + fence + '\n' +
  '\n### Markierung vor falschem Block\n\n<!-- dokufix: bpmn -->\n' + fence + 'js\nconst a = 1;\n' + fence + '\n' +
  '\n### Ohne Bahnen\n\n<!-- dokufix: bpmn -->\n' + fence + 'mermaid\nflowchart LR\n  a --> b\n' + fence + '\n' +
  '\n### Gateway-Arten\n\n<!-- dokufix: bpmn -->\n' + lanes('    s((Start)) --> a{+} --> b{o} --> c{Frage?} --> d{+ mehr} --> e(((Ende)))') +
  '\n### Nachricht und Timer\n\n<!-- dokufix: bpmn -->\n' + lanes('    s((✉ Eingang)) --> m((📤 Senden)) --> c((📨 Empfang)) --> w((⏱ 3 Tage)) --> e(((✉️ Versandt)))') +
  '\n### Aufgabenarten\n\n<!-- dokufix: bpmn -->\n' + lanes('    s((⏱️ Montags)) --> a[✉ Senden] --> b[📥 Empfangen] --> c[👤 Prüfen] --> d[⚙️ Rechnen] --> e[✋ Ablegen] --> f[[👤 Unterprozess]] --> g[⏱ Warten] --> h(((⏱ Ende)))'));
const bp = await p.evaluate(() => {
  const figs = [...document.querySelectorAll('figure.dokufix-diagram-bpmn')];
  const count = (f, cls) => f.querySelectorAll('.dokufix-bpmn-' + cls).length;
  const xmlOf = f => decodeURIComponent(f.querySelector('a[download]').getAttribute('href').split(',').slice(1).join(','));
  const way = (xml, id) => (xml.match(new RegExp('bpmnElement="' + id + '">(.*?)</bpmndi:BPMNEdge>')) || [])[1];
  const x4 = xmlOf(figs[3]);
  return {
    figures: figs.length,
    ziffern: [count(figs[0], 'startevent'), count(figs[0], 'task'), count(figs[0], 'endevent'), count(figs[0], 'sequenceflow')],
    xmlIds: [count(figs[1], 'startevent'), count(figs[1], 'task'), count(figs[1], 'endevent'), count(figs[1], 'sequenceflow')],
    zwischen: count(figs[2], 'intermediatethrowevent'),
    parallel: [count(figs[3], 'sequenceflow'), way(x4, 'F1') !== way(x4, 'F2')],
    hochkant: [count(figs[4], 'lane'), /isHorizontal="false"/.test(xmlOf(figs[4]))],
    gateways: ['parallelgateway', 'inclusivegateway', 'exclusivegateway'].map(c => count(figs[6], c)).concat([(xmlOf(figs[6]).match(/Gateway id="[^"]*" name="([^"]*)"/g) || []).length]),
    ereignisse: ['startEvent', 'intermediateThrowEvent', 'intermediateCatchEvent', 'intermediateCatchEvent', 'endEvent'].map((tag, i) => new RegExp('<bpmn:' + tag + ' id="[^"]*" name="' + ['Eingang', 'Senden', 'Empfang', '3 Tage', 'Versandt'][i] + '">.*?<bpmn:' + (i === 3 ? 'timer' : 'message') + 'EventDefinition').test(xmlOf(figs[7]))),
    aufgaben: ['sendtask', 'receivetask', 'usertask', 'servicetask', 'manualtask', 'callactivity', 'task'].map(c => count(figs[8], c)).concat([/<bpmn:startEvent id="[^"]*" name="Montags">.*?<bpmn:timerEventDefinition/.test(xmlOf(figs[8]))]),
    unpassend: ['<bpmn:callActivity id="[^"]*" name="👤 Unterprozess"', '<bpmn:task id="[^"]*" name="⏱ Warten"', '<bpmn:endEvent id="[^"]*" name="⏱ Ende"><bpmn:incoming>[^<]*</bpmn:incoming></bpmn:endEvent>'].map(re => new RegExp(re).test(xmlOf(figs[8]))),
    ohneKoordinaten: [count(figs[5], 'task'), count(figs[5], 'lane'), /<bpmndi:BPMNShape [^>]*bpmnElement="T"/.test(xmlOf(figs[5]))],
    warnungen: [...document.querySelectorAll('.dokufix-warnung')].map(w => w.textContent.slice(0, 90)),
    reste: document.querySelectorAll('body > [id^="dokufix-bpmn-layout-"], body > [id^="ddokufix-"]').length
  };
});
expect('BPMN: Mermaid-ids aus Ziffern', bp.ziffern, [1, 2, 1, 2]);
expect('BPMN: Mermaid-ids, die wie XML-ids aussehen', bp.xmlIds, [1, 2, 1, 2]);
expect('BPMN: Kreis mit ein- und ausgehender Kante wird Zwischenereignis', bp.zwischen, 1);
expect('BPMN: zwei Kanten zwischen denselben Knoten bekommen eigene Wege', bp.parallel, [2, true]);
expect('BPMN: hochkant mit senkrechten Bahnen', bp.hochkant, [2, true]);
expect('BPMN: `{+}` wird Parallel-Gateway, `{o}` inklusives, Text bleibt exklusiv (2 mit Namen)', bp.gateways, [1, 1, 2, 2]);
expect('BPMN: Zeichen am Textanfang macht Nachrichten- und Timer-Ereignisse, der Name steht ohne Zeichen', bp.ereignisse, [true, true, true, true, true]);
expect('BPMN: Sende-, Empfangs-, Benutzer-, Service-, Handaufgabe, Aufruf-Aktivität, 2 normale Aufgaben, Timer-Start', bp.aufgaben, [1, 1, 1, 1, 1, 1, 2, true]);
expect('BPMN: Zeichen, das nicht zur Form passt, bleibt sichtbar im Namen', bp.unpassend, [true, true, true]);
expect('BPMN: XML ohne Koordinaten wird angeordnet, auch ohne Bahnen, der Download bekommt die Koordinaten', bp.ohneKoordinaten, [1, 0, true]);
expect('BPMN: neun Diagramme, vier sichtbare Warnungen, keine Reste im Dokument', [bp.figures, bp.warnungen.length, bp.reste], [9, 4, 0]);
console.log('       ' + bp.warnungen.join('\n       '));
await p.screenshot({ path: path.join(out, 'robust-bpmn.png'), fullPage: true });

// Große Ansicht mit Tastatur (mit JavaScript): Leertaste öffnet, + zoomt, Esc schließt
const toggle = p.locator('.dokufix-zoom-toggle').first();
await toggle.focus();
await p.keyboard.press('Space');
const offen = await p.locator('figure.dokufix-diagram').first().evaluate(f => getComputedStyle(f).position);
await p.keyboard.press('+');
const stufe = await p.locator('figure.dokufix-diagram').first().evaluate(f => f.querySelector('.dokufix-zoom-bar input:checked').value);
await p.keyboard.press('Escape');
const zu = await p.locator('figure.dokufix-diagram').first().evaluate(f => getComputedStyle(f).position);
expect('Große Ansicht per Tastatur: Leertaste öffnet, + zoomt, Esc schließt', [offen, stufe, zu], ['fixed', '100', 'relative']);
await p.close();

await browser.close();
if (failures.length) { console.error(failures.length + ' Fall/Fälle fehlgeschlagen.'); process.exit(1); }
console.log('Alle Fälle bestanden.');
