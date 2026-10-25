// The shared modules of the BPMN tools and the pages built on them (story 2.38), run in Node: no browser.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/bpmn-tools/ holds what the BPMN Assistant, the Layouter Audi and the layout workbench share; tools/seiten.mjs
// builds their pages. Here: the pure helpers (the name of a download, the background of the SVG, the pool's head,
// the X of merges, the colours' CSS, the worker's text of bpmn.io, the XML out of a pasted answer), the stand of the
// layout (logikOf()), the page builder's rules, and the three pages as built: their blocks, nothing from the network,
// the workbench's stand. What
// needs a browser (the pictures, the large view, the modeler, the downloads) is compared by hand and by a scratch
// Playwright run against the pages built before the story.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser, parseHTML } from 'linkedom';
import { fileBase, withBackground, svgLink, bpmnLink } from '../src/bpmn-tools/downloads.js';
import { poolHeads, mergeMarkerOff } from '../src/bpmn-tools/decorate.js';
import { themeCss, applyTheme, PRESETS, KEYS, SEL, CHECKER, presetOf, migrate } from '../src/bpmn-tools/theme.js';
import { balAnswer, balWorkerSource } from '../src/bpmn-tools/layout.js';
import { nextStep, STEPS } from '../src/bpmn-tools/large-view.js';
import { ICON } from '../src/bpmn-tools/icons.js';
import { extractXml, ohneDi } from '../src/bpmn-tools/paste.js';
import { allBreaks, compact } from '../src/bpmn-tools/aenderungen.js';
import { logikOf, LOGIK_FILES, loadStand } from '../tools/bpmn-layout/lib.mjs';
import { buildPage } from '../tools/seiten.mjs';
import { BuildError } from '../build.mjs';
import { bauen as bauenAssistant, kernOf, promptXmlOf, DOCS, FRAME } from '../tools/bpmn-assistant/bauen.mjs';
import { check } from '../tools/bpmn-layout/pruefen.mjs';
import { bauen as bauenAudi } from '../tools/bpmn-assistant/audi.mjs';
import { bauen as bauenWerkbank } from '../tools/werkbank/bauen.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(here, '..');
const APP = path.join(REPO, 'src/app');

// ---------- the name of a download ----------
test('fileBase(): the name, cleaned as dokufix cleans a diagram\'s, and the time of the click', () => {
  const d = new Date(2026, 9, 7, 19, 15, 2);
  assert.equal(fileBase('Urlaubsantrag', d), 'Urlaubsantrag_2026-10-07_19-15-02');
  assert.equal(fileBase('Frist: 2/3', d), 'Frist--2-3_2026-10-07_19-15-02');
  assert.equal(fileBase('', d), 'Diagramm_2026-10-07_19-15-02');
  assert.equal(fileBase(undefined, new Date(2026, 0, 2, 3, 4, 5)), 'Diagramm_2026-01-02_03-04-05');
});

// ---------- the SVG's background ----------
test('withBackground(): a rectangle in the colour over the whole viewBox, first; transparent and a picture without size stay as they are', () => {
  globalThis.DOMParser = DOMParser;
  globalThis.XMLSerializer = class { serializeToString(n){ return n.toString(); } };
  try {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 10 200 100"><g id="d"/></svg>';
    assert.equal(withBackground(svg, 'transparent'), svg);
    assert.equal(withBackground(svg, undefined), svg);
    const out = withBackground(svg, '#fafafa');
    assert.match(out, /^<\?xml version="1.0" encoding="UTF-8"\?>\n/);
    assert.match(out, /\n$/);
    const root = new DOMParser().parseFromString(out.replace(/^<\?xml[^>]*\?>\n/, ''), 'image/svg+xml').documentElement;
    const [rect, g] = root.children;
    assert.deepEqual(['x', 'y', 'width', 'height', 'fill'].map(a => rect.getAttribute(a)), ['-5', '10', '200', '100', '#fafafa']);
    assert.equal(rect.localName, 'rect');
    assert.equal(g.getAttribute('id'), 'd');
    const flat = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0"/>';
    assert.equal(withBackground(flat, '#ffffff'), flat);
  } finally { delete globalThis.DOMParser; delete globalThis.XMLSerializer; }
});

// ---------- the pool's head ----------
// A viewer as poolHeads() asks it: the registry's participants and their graphics, drawn as bpmn-js draws a pool.
function fakeViewer(pools){
  const { document } = parseHTML('<html><body></body></html>');
  const els = pools.map(({ id, width, height, horizontal, collapsed }) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.innerHTML = '<g class="djs-visual"><rect width="' + width + '" height="' + height + '" style="stroke-width: 1.5px"></rect>' + (collapsed ? '' : '<polyline points="30,0 30,' + height + '"></polyline>') + '<text>Pool</text></g>';
    return { el: { id, type: 'bpmn:Participant', width, height, di: { isHorizontal: horizontal } }, g };
  });
  const registry = { filter: f => els.map(e => e.el).filter(f), getGraphics: el => els.find(e => e.el === el).g };
  return { viewer: { get: () => registry }, gfx: id => els.find(e => e.el.id === id).g };
}
test('svgLink(), bpmnLink(): the blob: URL is made at the click and freed 1.5 s later, none before (audit 2026-10-25, finding 18)', t => {
  const made = [], freed = [];
  t.mock.method(URL, 'createObjectURL', () => { made.push('blob:' + made.length); return made.at(-1); });
  t.mock.method(URL, 'revokeObjectURL', url => freed.push(url));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const had = globalThis.document;
  globalThis.document = parseHTML('<html><body></body></html>').document;
  t.after(() => { globalThis.document = had; });
  const links = [svgLink(() => 'bild', () => '<svg/>', 'A2'), bpmnLink(() => 'prozess', '<definitions/>', 'A2')];
  assert.deepEqual(made, []);
  for (const a of links) a.onclick();
  assert.deepEqual(links.map(a => [a.download, a.href]), [['bild.svg', 'blob:0'], ['prozess.bpmn', 'blob:1']]);
  assert.deepEqual(freed, []);
  t.mock.timers.tick(1500);
  assert.deepEqual(freed, ['blob:0', 'blob:1']);
});

test('poolHeads(): a head behind the frame of a pool, inset by half the stroke; a collapsed pool has none and is a box', () => {
  const { viewer, gfx } = fakeViewer([
    { id: 'p1', width: 600, height: 250, horizontal: true },
    { id: 'p2', width: 400, height: 300, horizontal: false },
    { id: 'p3', width: 600, height: 60, horizontal: true, collapsed: true },
  ]);
  poolHeads(viewer);
  const head = id => gfx(id).querySelector('.dokufix-bpmn-head');
  const attrs = r => Object.fromEntries(['x', 'y', 'width', 'height', 'style'].map(a => [a, r.getAttribute(a)]));
  assert.deepEqual(attrs(head('p1')), { x: '0.75', y: '0.75', width: '29.25', height: '248.5', style: 'fill:var(--dokufix-bpmn-head);stroke:none' });
  assert.equal(head('p1').previousElementSibling.localName, 'rect', 'right behind the frame, under the line and the label');
  // Across: the head is the strip at the top.
  assert.deepEqual(attrs(head('p2')), { x: '0.75', y: '0.75', width: '398.5', height: '29.25', style: 'fill:var(--dokufix-bpmn-head);stroke:none' });
  assert.equal(head('p3'), null);
  assert.ok(gfx('p3').classList.contains('dokufix-bpmn-box'));
  assert.ok(!gfx('p1').classList.contains('dokufix-bpmn-box'));
});

// ---------- the X of merges ----------
const shape = (id, visible) => '<bpmndi:BPMNShape id="' + id + '_di" bpmnElement="' + id + '"' + (visible === undefined ? '' : ' isMarkerVisible="' + visible + '"') + '><dc:Bounds x="0" y="0" width="50" height="50"/></bpmndi:BPMNShape>';
const graph = { gateways: new Set(['split', 'merge']), flows: [{ from: 'a', to: 'split' }, { from: 'split', to: 'b' }, { from: 'split', to: 'c' }, { from: 'b', to: 'merge' }, { from: 'c', to: 'merge' }, { from: 'merge', to: 'd' }] };
test('mergeMarkerOff(): where every exclusive gateway shows its X, a merge loses it; the split keeps it', () => {
  const xml = shape('split', 'true') + shape('merge', 'true') + shape('b');
  const r = mergeMarkerOff(xml, graph);
  assert.equal(r.count, 1);
  assert.equal(r.xml, shape('split', 'true') + shape('merge') + shape('b'));
});
test('mergeMarkerOff(): a gateway without the attribute, or with "false", leaves the file as the author drew it (null)', () => {
  assert.equal(mergeMarkerOff(shape('split', 'true') + shape('merge'), graph), null);
  assert.equal(mergeMarkerOff(shape('split', 'true') + shape('merge', 'false'), graph), null);
  assert.equal(mergeMarkerOff(shape('b') + shape('c'), graph), null, 'no gateway drawn');
});
test('mergeMarkerOff(): a merge with two ways out is no merge; only the flows handed in count', () => {
  const g = { ...graph, flows: [...graph.flows, { from: 'merge', to: 'e' }] };
  assert.equal(mergeMarkerOff(shape('split', 'true') + shape('merge', 'true'), g).count, 0);
  const one = { ...graph, flows: graph.flows.filter(f => !(f.from === 'c' && f.to === 'merge')) };
  assert.equal(mergeMarkerOff(shape('split', 'true') + shape('merge', 'true'), one).count, 0);
});

// ---------- the colours ----------
test('themeCss(): the variables per type under the diagram, the icons, the pool\'s head; the area behind only where asked', () => {
  const css = themeCss(PRESETS.gelb);
  const d = '.dokufix-doc .dokufix-diagram-bpmn';
  assert.ok(css.startsWith(d + '{--dokufix-bpmn-fill:#fffbdb;--dokufix-bpmn-stroke:#3a3a3f;--dokufix-bpmn-label:#1c1c1e;--assistant-bg:' + CHECKER + '}'));
  for (const sel of Object.values(SEL)) assert.ok(css.includes(d + ' ' + sel + '{'), sel);
  assert.ok(css.includes(d + ' .dokufix-bpmn-task .dokufix-bpmn-icon{--dokufix-bpmn-stroke:#000000}'));
  assert.ok(css.includes(d + ' .dokufix-bpmn-pool{--dokufix-bpmn-fill:#ffffff;--dokufix-bpmn-stroke:#2c2c2c;--dokufix-bpmn-label:#ffffff;--dokufix-bpmn-head:#000000}'));
  assert.ok(css.endsWith(d + ' .dokufix-bpmn-pool.dokufix-bpmn-box{--dokufix-bpmn-label:#1c1c1e;}'));
  assert.match(themeCss(PRESETS.blau), /--assistant-bg:#ffffff\}/);
  const audi = themeCss(PRESETS.audi, { background: false });
  assert.doesNotMatch(audi, /--assistant-bg/);
  assert.ok(audi.startsWith(d + '{--dokufix-bpmn-fill:#ffffff;--dokufix-bpmn-stroke:#4c4c4c;--dokufix-bpmn-label:#1a1a1a;}'));
  const style = { textContent: '' };
  applyTheme(style, PRESETS.audi, { background: false });
  assert.equal(style.textContent, audi);
});
test('the presets: every key a colour, each found again by presetOf(); an older choice migrates to today\'s keys', () => {
  for (const [k, p] of Object.entries(PRESETS)){
    for (const key of KEYS) assert.match(p[key], /^#[0-9a-f]{6}$|^transparent$/, k + ' ' + key);
    assert.equal(presetOf(p), k);
  }
  assert.equal(presetOf({ ...PRESETS.gelb, 'task-fill': '#123456' }), 'eigene');
  // The version with ten roles and a preset: the preset.
  assert.equal(presetOf(migrate({ preset: 'sw', sym: '#000000' })), 'sw');
  // A version before the colours of data and groups: a preset takes their values.
  const old = Object.fromEntries(Object.entries(PRESETS.audi).filter(([k]) => !/^(data|group|note|assoc)-|^(flow|msg)-fill$/.test(k)));
  assert.equal(presetOf(migrate(old)), 'audi');
});

// ---------- the large view's steps ----------
test('nextStep(): + and - from a step, from a free zoom the nearest step, held at the ends', () => {
  assert.deepEqual(STEPS, ['fit', '1', '1.5', '2']);
  assert.equal(nextStep('fit', 0.4, true), '1');
  assert.equal(nextStep('2', 2, true), '2');
  assert.equal(nextStep('fit', 0.4, false), 'fit');
  assert.equal(nextStep(null, 1.3, true), '2');
  assert.equal(nextStep(null, 0.7, false), 'fit');
});

// ---------- bpmn.io's worker ----------
test('the worker of bpmn.io: its text answers as balAnswer() does, and says "ready" once loaded', async () => {
  const posted = [];
  const self = { postMessage: m => posted.push(m) };
  const script = 'self.BAL = { layoutProcess: async x => { if (x === "bad") throw new Error("kaputt"); return { xml: x + "!", warnings: [{ code: "c", message: "m" }, { message: "nur m" }, "w"] }; } };';
  new Function('self', balWorkerSource(script).join(''))(self);
  assert.deepEqual(posted, [{ ready: true }]);
  await self.onmessage({ data: { id: 1, xml: '<x/>' } });
  await self.onmessage({ data: { id: 2, xml: 'bad' } });
  const want = balAnswer({ xml: '<x/>!', warnings: [{ code: 'c', message: 'm' }, { message: 'nur m' }, 'w'] });
  assert.deepEqual(want, { xml: '<x/>!', warnings: ['c: m', 'nur m', 'w'] });
  assert.deepEqual(posted.slice(1), [{ id: 1, ok: true, result: want }, { id: 2, ok: false, error: 'kaputt' }]);
});

// ---------- the stand of the layout ----------
test('logikOf(): SHA-1 over the four modules of the layout, 8 places, as loadStand() gives it to a run', async () => {
  assert.deepEqual(LOGIK_FILES, ['bpmn-layout.js', 'lmm.js', 'label-size.js', 'xml-parser.js']);
  const hash = crypto.createHash('sha1');
  for (const f of LOGIK_FILES) hash.update(fs.readFileSync(path.join(APP, f)));
  assert.equal(logikOf(APP), hash.digest('hex').slice(0, 8));
  assert.equal((await loadStand()).logik, logikOf(APP));
});
test('logikOf(): a change in a module of the layout is another stand', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logik-'));
  try {
    for (const f of LOGIK_FILES) fs.copyFileSync(path.join(APP, f), path.join(dir, f));
    assert.equal(logikOf(dir), logikOf(APP));
    fs.appendFileSync(path.join(dir, 'lmm.js'), '\n');
    assert.notEqual(logikOf(dir), logikOf(APP));
    assert.match(logikOf(dir), /^[0-9a-f]{8}$/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- the XML out of a pasted answer ----------
const XML = '<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" name="Urlaub">\n  <bpmn:process id="p">\n    <bpmn:startEvent id="s"/>\n  </bpmn:process>\n</bpmn:definitions>';
const ROOT = XML.slice(XML.indexOf('<bpmn:definitions'));
const plain = { before: 0, after: 0, more: false, cutOff: null };
test('ohneDi(): a self-closing empty BPMNDiagram goes too, so the assistant\'s A2 XML holds exactly one diagram (audit 2026-10-25, finding 10)', () => {
  const di = '<bpmndi:BPMNDiagram id="D" name="a>b"/>\n  <bpmndi:BPMNDiagram id="E"><bpmndi:BPMNPlane id="P" bpmnElement="p"/></bpmndi:BPMNDiagram>\n';
  const input = ROOT.replace('</bpmn:definitions>', di + '</bpmn:definitions>');
  assert.equal(ohneDi(input), ROOT);
});

test('ohneDi(): a diagram tag in a comment is no diagram, and broken openings cost linear time (ponytail review of 2026-10-25)', () => {
  const di = '<bpmndi:BPMNDiagram id="E"><bpmndi:BPMNPlane id="P" bpmnElement="p"/></bpmndi:BPMNDiagram>\n';
  const commented = ROOT.replace('<bpmn:process', '<!-- <bpmndi:BPMNDiagram> folgt unten -->\n  <bpmn:process').replace('</bpmn:definitions>', di + '</bpmn:definitions>');
  assert.equal(ohneDi(commented), commented.replace(di, ''));
  // 400 KB of openings without their ends: quadratic before, 16 s.
  const broken = '<bpmn:definitions>' + '<bpmndi:BPMNDiagram a="'.repeat(17000) + '</bpmn:definitions>';
  const t0 = performance.now();
  ohneDi(broken);
  assert.ok(performance.now() - t0 < 1000, Math.round(performance.now() - t0) + ' ms');
});
test('allBreaks(): the rule check and overlapping nodes, without a gateway or an end event in another lane; the assistant counts with it (audit 2026-10-25, finding 13)', () => {
  const box = (id, x) => '<bpmndi:BPMNShape id="' + id + '_di" bpmnElement="' + id + '">\n  <dc:Bounds x="' + x + '" y="0" width="100" height="80" />\n</bpmndi:BPMNShape>';
  const xml = compact([box('t1', 0), box('t2', 90), box('g1', 300), box('e1', 500)].join('\n'));
  const model = { nodes: [{ id: 't1', type: 'task' }, { id: 't2', type: 'task' }, { id: 'g1', type: 'gateway' }, { id: 'e1', type: 'event', tag: 'endEvent' }] };
  const rules = () => ['node-outside-lane g1', 'node-outside-lane e1', 'node-outside-lane t1'];
  assert.deepEqual(allBreaks(rules, xml, model), { breaks: ['node-outside-lane t1', 'node-overlap t1 t2'], movedGateways: 2 });
  // The assistant has no count of its own: A2 and bpmn.io both through allBreaks().
  const main = fs.readFileSync(path.join(REPO, 'src/bpmn-assistant/main.js'), 'utf8');
  assert.equal(main.match(/allBreaks\(breaksOf, /g)?.length, 2);
  assert.doesNotMatch(main, /node-outside-lane/);
});

test('extractXml(): a fenced answer gives the block\'s XML and counts the lines with text before and after', () => {
  const text = '## BPMN\n\nHier ist das Diagramm:\n\n```xml\n' + XML + '\n```\n\nDer Prozess beginnt mit dem Antrag.\nViel Erfolg!';
  assert.deepEqual(extractXml(text), { ...plain, xml: XML, before: 3, after: 3 });
  // ~~~, four backticks, indent of up to three spaces.
  assert.equal(extractXml('Text\n~~~\n' + XML + '\n~~~').xml, XML);
  assert.equal(extractXml('Text\n   ````xml\n' + XML + '\n   ````\nmehr').xml, XML);
  // A block without its closing fence runs to the end.
  assert.deepEqual(extractXml('Hier:\n```xml\n' + XML + '\n'), { ...plain, xml: XML, before: 2 });
  // The first block that holds a root; a block before without one does not count.
  assert.equal(extractXml('```sh\nnpm run assistant\n```\n```xml\n' + XML + '\n```').xml, XML);
});
test('extractXml(): prose around XML without a fence gives the XML from <?xml or the root to the closing tag', () => {
  assert.deepEqual(extractXml('Hier ist das XML:\n' + XML + '\nViel Erfolg'), { ...plain, xml: XML, before: 1, after: 1 });
  assert.deepEqual(extractXml('Hier ist das XML: ' + ROOT + ' Viel Erfolg'), { ...plain, xml: ROOT, before: 1, after: 1 });
});
test('extractXml(): a tag named in prose before the XML is not the root', () => {
  const r = extractXml('Das `<bpmn:definitions>`-Element umfasst alles.\n\n' + XML + '\n');
  assert.deepEqual(r, { ...plain, xml: XML, before: 1 });
  assert.deepEqual(extractXml('Es endet mit `</bpmn:definitions>`.\n' + XML), { ...plain, xml: XML, before: 1 });
  // In a comment or a CDATA section, a tag does not count.
  for (const c of ['<!-- </bpmn:definitions> -->', '<bpmn:documentation><![CDATA[endet mit </bpmn:definitions>]]></bpmn:documentation>']){
    const xml = ROOT.replace('<bpmn:process', c + '<bpmn:process');
    assert.deepEqual(extractXml('So:\n' + xml + '\nEnde'), { ...plain, xml, before: 1, after: 1 }, c);
  }
});
test('extractXml(): the declaration, with white space or comments before the root, belongs to the cut', () => {
  const xml = '<?xml version="1.0"?>\n<!-- von einem LLM -->\n' + ROOT;
  assert.deepEqual(extractXml('Bitte sehr:\n' + xml + '\nFertig.'), { ...plain, xml, before: 1, after: 1 });
  // A DOCTYPE and processing instructions between them too; <?xml-stylesheet is no declaration.
  const more = '<?xml version="1.0"?>\n<?xml-stylesheet href="bpmn.css" type="text/css"?>\n<!DOCTYPE definitions [ <!ENTITY a "b"> ]>\n' + ROOT;
  assert.deepEqual(extractXml(more), { ...plain, xml: more });
  assert.deepEqual(extractXml('Hier:\n' + more), { ...plain, xml: more, before: 1 });
  assert.equal(extractXml('<?xml-stylesheet href="bpmn.css"?> und\n' + ROOT).xml, ROOT);
  // Prose between declaration and root: the cut starts at the root.
  assert.equal(extractXml('<?xml version="1.0"?>\nund dann\n' + ROOT).xml, ROOT);
});
test('extractXml(): the prefix bpmn2: and none', () => {
  const b2 = ROOT.replace(/bpmn:/g, 'bpmn2:').replace('xmlns:bpmn=', 'xmlns:bpmn2=');
  assert.deepEqual(extractXml('Antwort:\n' + b2 + '\n</bpmn:definitions> war gemeint'), { ...plain, xml: b2, before: 1, after: 1 });
  const none = '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="p"/></definitions>';
  assert.equal(extractXml('So:\n' + none).xml, none);
  // A self-closing root is whole.
  assert.equal(extractXml('So: <definitions id="d"/> und fertig').xml, '<definitions id="d"/>');
});
test('extractXml(): of two diagrams the first, and more says the input held another', () => {
  const two = ROOT.replace('name="Urlaub"', 'name="Zwei"');
  assert.deepEqual(extractXml('Erstes:\n```xml\n' + ROOT + '\n```\nZweites:\n```xml\n' + two + '\n```'), { ...plain, xml: ROOT, before: 2, after: 9, more: true });
  assert.deepEqual(extractXml(ROOT + '\n\n' + two), { ...plain, xml: ROOT, after: 5, more: true });
});
test('extractXml(): cut off, an opening root with no closing tag after it: nothing guessed, cutOff the closing tag it lacks', () => {
  const text = 'Hier:\n```xml\n' + XML.slice(0, XML.indexOf('</bpmn:process>'));
  assert.deepEqual(extractXml(text), { ...plain, xml: text, cutOff: '</bpmn:definitions>' });
  const b2 = '<bpmn2:definitions id="d"><bpmn2:process id="p">';
  assert.equal(extractXml(b2).cutOff, '</bpmn2:definitions>');
  // A closing tag of another prefix is no cut-off: the text goes on unchanged, for the parser to report.
  const other = 'So:\n' + ROOT.replace('</bpmn:definitions>', '</definitions>');
  assert.deepEqual(extractXml(other), { ...plain, xml: other });
});
test('extractXml(): of fenced blocks the first with a whole root, before one that only shows the opening tag', () => {
  const text = 'Die Wurzel:\n```xml\n<bpmn:definitions …>\n```\nDas ganze XML:\n```xml\n' + XML + '\n```';
  assert.deepEqual(extractXml(text), { ...plain, xml: XML, before: 6, after: 1 });
});
test('extractXml(): the whole XML without a fence, then a block that only shows the opening tag: the XML, not cut off (audit 2026-10-25, finding 19)', () => {
  const text = 'Hier das XML:\n' + XML + '\nDie Wurzel noch einmal:\n```xml\n<bpmn:definitions …>\n```';
  assert.deepEqual(extractXml(text), { ...plain, xml: XML, before: 1, after: 4, more: true });
});
test('extractXml(): only XML comes back byte-identical, with no line removed', () => {
  for (const xml of [XML, ROOT, '<!-- Kopf -->\n' + XML + '\n<!-- Ende -->', XML.replace(/\n/g, '\r\n')]){
    assert.deepEqual(extractXml(xml), { ...plain, xml });
  }
  for (const name of fs.readdirSync(path.join(REPO, 'tools/bpmn-assistant/beispiele')).filter(n => n.endsWith('.bpmn'))){
    const xml = fs.readFileSync(path.join(REPO, 'tools/bpmn-assistant/beispiele', name), 'utf8').trim();
    assert.deepEqual(extractXml(xml), { ...plain, xml }, name);
  }
});
test('extractXml(): without a definitions root the input goes on unchanged', () => {
  for (const text of ['Nur Text, kein XML.', '<bpmn:process id="p"><bpmn:startEvent id="s"/></bpmn:process>', '```xml\n<process id="p"/>\n```', '&lt;bpmn:definitions&gt;', '<!-- <bpmn:definitions> -->']){
    assert.deepEqual(extractXml(text), { ...plain, xml: text }, text);
  }
});

// ---------- the page builder ----------
async function pageOf(html, parts = {}){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seite-'));
  try {
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    fs.writeFileSync(path.join(dir, 'main.js'), 'document.title = "x";\n');
    fs.writeFileSync(path.join(dir, 'page.css'), 'body { color: red }\n');
    return await buildPage({ template: path.join(dir, 'index.html'), entry: path.join(dir, 'main.js'), css: path.join(dir, 'page.css'), parts });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('buildPage(): fills the slots and the icons; a data block writes "<" as \\u003c', async () => {
  const html = await pageOf('<style>{{slot:page.css}}</style><b>{{icon:copy}}</b><script type="application/json" id="d">{{slot:d}}</script><script>{{slot:page.js}}</script>', { d: { json: { t: '</script><!--' } } });
  assert.match(html, /^<style>body\{color:red\}<\/style>/);
  assert.ok(html.includes('<b>' + ICON.copy + '</b>'));
  assert.ok(html.includes('{"t":"\\u003c/script>\\u003c!--"}'));
  assert.match(html, /<script>\(\(\)=>\{document\.title="x";\}\)\(\);<\/script>$/, 'an IIFE, minified');
});
test('buildPage(): a slot missing, twice, unknown, a script that ends its element, an unknown icon: an error naming it', async () => {
  const fails = async (html, parts, re) => { await assert.rejects(pageOf(html, parts), e => e instanceof BuildError && re.test(e.message)); };
  await fails('<p>{{slot:page.css}}{{slot:page.css}}</p>', {}, /page\.css\}\} steht 2-mal/);
  await fails('<p></p>', { d: { text: 'x' } }, /Slot \{\{slot:d\}\} fehlt/);
  await fails('<p>{{slot:wer}}</p>', {}, /unbekannter Slot \{\{slot:wer\}\}/);
  await fails('<p>{{slot:s}}</p>', { s: { script: 'a("</script>")' } }, /Slot s enthält "<\/script"/);
  await fails('<p>{{slot:s}}</p>', { s: { script: 'a("<!--")' } }, /Slot s enthält "<!--"/);
  await fails('<p>{{icon:nix}}</p>', {}, /unbekanntes Symbol \{\{icon:nix\}\}/);
});

// ---------- the pages as built ----------
const pages = { assistant: await bauenAssistant(), audi: await bauenAudi(), werkbank: await bauenWerkbank() };
const scriptsOf = html => [...html.matchAll(/<script\b([^>]*)>/g)].map(m => m[1]);
for (const [name, html] of Object.entries(pages)){
  test(name + ': offline, no script and no stylesheet from the network, no slot left', () => {
    for (const attrs of scriptsOf(html)) assert.doesNotMatch(attrs, /\bsrc=/, attrs);
    assert.doesNotMatch(html, /<link\b[^>]*rel="?stylesheet/i);
    assert.doesNotMatch(html, /@import/);
    // The one link in the head is the favicon, as a data: URL.
    for (const m of html.matchAll(/<link\b[^>]*>/g)) assert.match(m[0], /href="data:image\/svg\+xml,/);
    assert.doesNotMatch(html, /\{\{(slot|icon):/);
    // The viewer of bpmn-js, its licence before it, and the document styles.
    assert.match(html, /<script>\/\*\nbpmn-js 18\.31\.0\n/);
    assert.ok(html.includes('.dokufix-doc'), 'doc.css');
  });
}
test('assistant: the blocks it needs, the six examples and the two prompts in its data block', () => {
  const { document } = parseHTML(pages.assistant);
  for (const id of ['dokufix-layout-js', 'bpmn-modeler-js', 'bpmn-modeler-css']){
    const b = document.getElementById(id);
    assert.equal(b && b.getAttribute('type'), 'text/plain', id);
    assert.ok(b.textContent.length > 1000, id);
  }
  assert.ok(document.getElementById('bpmn-io-js').textContent.includes('bpmn-auto-layout'));
  const data = JSON.parse(document.getElementById('assistant-data').textContent);
  assert.equal(data.beispiele.length, 6);
  assert.match(data.promptXml, /^(Stand: \d{4}-\d\d-\d\d\n\n)?# BPMN-XML für dokufix/);
  assert.match(data.promptMarkdown, /^(Stand: \d{4}-\d\d-\d\d\n\n)?# dokufix-Markdown/);
  assert.equal(data.promptMarkdown.replace(/^(Stand: \d{4}-\d\d-\d\d\n\n)?/, ''), fs.readFileSync(DOCS, 'utf8'));
  assert.equal(data.balVersion, '2.0.0-alpha.2');
  // The element ids the page script and Ben's habits rely on.
  for (const id of ['xml', 'go', 'up', 'file', 'name', 'theme-btn', 'merge-x', 'jumps', 'theme', 'out', 'llm-copy', 'llm-dl', 'llm-ok', 'llm-md-copy', 'llm-md-dl', 'llm-md-ok', 'ex', 'xml-cut']) assert.ok(document.getElementById(id), id);
  // Every id of the page once.
  const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  assert.equal(document.querySelectorAll('main').length, 1);
});
// ---------- the two prompts for LLMs (story 2.47) ----------
// One BPMN core, in docs/dokufix-fuer-llms.md between the markers: prompt A is tools/bpmn-assistant/prompt-xml.md with
// the core at its place, prompt B the docs file itself.
const DOCS_TEXT = fs.readFileSync(DOCS, 'utf8');
const KERN = kernOf(DOCS_TEXT, DOCS);
const withoutFences = text => text.replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '');
test('prompts: A holds the core verbatim, B is the docs file, both with the id rule', () => {
  const data = JSON.parse(parseHTML(pages.assistant).document.getElementById('assistant-data').textContent);
  assert.ok(KERN.startsWith('### Das Wichtigste'), KERN.slice(0, 40));
  assert.ok(KERN.trimEnd().endsWith('kein Nachrichtenfluss an ihm.'), KERN.slice(-60));
  assert.ok(data.promptXml.includes(KERN));
  assert.doesNotMatch(data.promptXml, /\{\{kern:bpmn\}\}|<!-- \/?kern:bpmn -->/);
  for (const p of [data.promptXml, data.promptMarkdown]) assert.match(p, /ASCII/);
});
test('prompts: outside the markers no row of the element table, so no second copy of the core in the docs file', () => {
  const outside = DOCS_TEXT.slice(0, DOCS_TEXT.indexOf('<!-- kern:bpmn -->')) + DOCS_TEXT.slice(DOCS_TEXT.indexOf('<!-- /kern:bpmn -->'));
  const table = KERN.split('### Was dokufix anordnet und zeichnet')[1].split('\n###')[0];
  const rows = table.split('\n').filter(l => /^\| [^-]/.test(l) && !l.startsWith('| Struktur'));
  assert.ok(rows.length > 20, rows.length);
  for (const r of rows) assert.ok(!outside.includes(r), r);
  // The old guide is gone.
  assert.ok(!fs.existsSync(path.join(REPO, 'tools/bpmn-assistant/handreichung.md')));
});
test('prompts: A says nothing of a document, a heading or a block outside its XML', () => {
  const a = withoutFences(promptXmlOf(fs.readFileSync(FRAME, 'utf8'), KERN));
  for (const word of [/Dokument/, /Überschrift/, /\bBlock\b/]) assert.doesNotMatch(a, word);
});
test('prompts: every template of the core passes check()', async () => {
  const blocks = [...KERN.matchAll(/^```bpmn\n([\s\S]*?)^```$/gm)].map(m => m[1]).filter(x => x.includes('xmlns:bpmn'));
  assert.equal(blocks.length, 3);
  for (const xml of blocks) assert.deepEqual((await check(xml)).errors, [], xml.slice(0, 200));
});
// Story 2.48: the outline for a process documentation, outside the core, so only in prompt B.
test('prompts: the section on process documentation stands after the core, only in B, its example in the syntax of the docs', async () => {
  const data = JSON.parse(parseHTML(pages.assistant).document.getElementById('assistant-data').textContent);
  const at = DOCS_TEXT.indexOf('\n## Prozessdokumentation\n');
  assert.ok(at > DOCS_TEXT.indexOf('<!-- /kern:bpmn -->') && at < DOCS_TEXT.indexOf('\n## Ausgabe\n'), String(at));
  const section = DOCS_TEXT.slice(at, DOCS_TEXT.indexOf('\n## Ausgabe\n'));
  assert.doesNotMatch(data.promptXml, /Prozessdokumentation/);
  const example = section.match(/^````markdown\n([\s\S]*?)^````$/m)[1];
  // Chips with one of the five dots and a label; the notice alone on its line; steps with the actor in italics, colon inside.
  const chipsOf = text => [...text.matchAll(/`([^\x00-\x7F`\s]+) [^`]+`/g)].map(m => m[1]);
  assert.ok(chipsOf(example).length >= 1);
  for (const dot of chipsOf(section)) assert.ok(['🟢', '🟡', '🔴', '⚪', '🔵'].includes(dot), dot);
  assert.match(example, /^> \[!IMPORTANT\]\n> \S/m);
  const steps = example.split('<!-- dokufix: steps -->\n')[1].split('\n\n')[0].split('\n');
  assert.ok(steps.length >= 2);
  for (const s of steps) assert.match(s, /^\d+\. \*[^*]+:\* \S/);
  const xml = example.match(/^```bpmn\n([\s\S]*?)^```$/m)[1];
  assert.deepEqual((await check(xml)).errors, []);
});
test('check(): ids starting with a digit or holding an umlaut are errors, not a crash', async () => {
  const model = id => `<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" name="T" targetNamespace="http://example.org/dokufix"><bpmn:process id="P" isExecutable="false"><bpmn:startEvent id="S" name="Los"/><bpmn:task id="${id}" name="Prüfen"/><bpmn:endEvent id="E" name="Fertig"/><bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="${id}"/><bpmn:sequenceFlow id="F2" sourceRef="${id}" targetRef="E"/></bpmn:process></bpmn:definitions>`;
  assert.deepEqual((await check(model('Task_Pruefen'))).errors, []);
  for (const id of ['00_x', 'Task_Prüfen']) assert.ok((await check(model(id))).errors.length, id);
  // The root itself unreadable: before, check() crashed on the missing rootElements.
  assert.ok((await check(model('Task_Pruefen').replace('id="D"', 'id="00_D"'))).errors.length);
});
test('kernOf(), promptXmlOf(): a marker missing, doubled or out of order, or the place in the frame, fails the build with the file', () => {
  const ok = 'a\n<!-- kern:bpmn -->\n\nKern\n\n<!-- /kern:bpmn -->\nz';
  assert.equal(kernOf(ok, DOCS), 'Kern');
  for (const bad of ['ohne Marken', ok.replace('<!-- /kern:bpmn -->', ''), ok + '\n<!-- kern:bpmn -->', '<!-- /kern:bpmn -->\n<!-- kern:bpmn -->'])
    assert.throws(() => kernOf(bad, DOCS), e => e instanceof BuildError && e.message.includes('docs/dokufix-fuer-llms.md'), bad);
  assert.equal(promptXmlOf('A\n{{kern:bpmn}}\nB', 'K'), 'A\nK\nB');
  for (const bad of ['A', 'A {{kern:bpmn}} {{kern:bpmn}}'])
    assert.throws(() => promptXmlOf(bad, 'K'), e => e instanceof BuildError && e.message.includes('tools/bpmn-assistant/prompt-xml.md'), bad);
});
test('audi: the viewer and the colours of the Audi-Stil, no modeler, no layout', () => {
  assert.ok(pages.audi.includes('<style>' + themeCss(PRESETS.audi, { background: false }) + '</style>'));
  assert.doesNotMatch(pages.audi, /id="(dokufix-layout-js|bpmn-modeler-js|bpmn-io-js)"/);
});
test('werkbank: two empty columns, the worker of the layout, and the stand logikOf() gives for src/app', () => {
  const { document } = parseHTML(pages.werkbank);
  assert.equal(document.getElementById('faelle').children.length, 0);
  assert.equal(document.getElementById('canvas').children.length, 0);
  assert.ok(document.getElementById('liste') && document.getElementById('leinwand'));
  const worker = document.getElementById('dokufix-layout-js');
  assert.equal(worker.getAttribute('type'), 'text/plain');
  assert.match(worker.textContent, /postMessage\(\{ready:!0\}\)/);
  assert.equal(document.getElementById('stand').textContent, 'Layout-Stand ' + logikOf(APP));
});
