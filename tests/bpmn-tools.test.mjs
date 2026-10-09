// The shared modules of the BPMN tools and the pages built on them (story 2.38), run in Node: no browser.
//
//   npm test          (node --test tests/*.test.mjs)
//
// src/bpmn-tools/ holds what the BPMN Assistant, the Layouter Audi and the layout workbench share; tools/seiten.mjs
// builds their pages. Here: the pure helpers (the name of a download, the background of the SVG, the pool's head,
// the X of merges, the colours' CSS, the worker's text of bpmn.io), the stand of the layout (logikOf()), the page
// builder's rules, and the three pages as built: their blocks, nothing from the network, the workbench's stand. What
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
import { fileBase, withBackground } from '../src/bpmn-tools/downloads.js';
import { poolHeads, mergeMarkerOff } from '../src/bpmn-tools/decorate.js';
import { themeCss, applyTheme, PRESETS, KEYS, SEL, CHECKER, presetOf, migrate } from '../src/bpmn-tools/theme.js';
import { balAnswer, balWorkerSource } from '../src/bpmn-tools/layout.js';
import { nextStep, STEPS } from '../src/bpmn-tools/large-view.js';
import { ICON } from '../src/bpmn-tools/icons.js';
import { logikOf, LOGIK_FILES, loadStand } from '../tools/bpmn-layout/lib.mjs';
import { buildPage } from '../tools/seiten.mjs';
import { BuildError } from '../build.mjs';
import { bauen as bauenAssistant } from '../tools/bpmn-assistant/bauen.mjs';
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
test('assistant: the blocks it needs, the six examples and the guide in its data block', () => {
  const { document } = parseHTML(pages.assistant);
  for (const id of ['dokufix-layout-js', 'bpmn-modeler-js', 'bpmn-modeler-css']){
    const b = document.getElementById(id);
    assert.equal(b && b.getAttribute('type'), 'text/plain', id);
    assert.ok(b.textContent.length > 1000, id);
  }
  assert.ok(document.getElementById('bpmn-io-js').textContent.includes('bpmn-auto-layout'));
  const data = JSON.parse(document.getElementById('assistant-data').textContent);
  assert.equal(data.beispiele.length, 6);
  assert.match(data.handreichung, /^# BPMN für dokufix/);
  assert.equal(data.balVersion, '2.0.0-alpha.2');
  // The element ids the page script and Ben's habits rely on.
  for (const id of ['xml', 'go', 'up', 'file', 'name', 'theme-btn', 'merge-x', 'jumps', 'theme', 'out', 'llm-copy', 'llm-dl', 'ex']) assert.ok(document.getElementById(id), id);
  // Every id of the page once.
  const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  assert.equal(document.querySelectorAll('main').length, 1);
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
