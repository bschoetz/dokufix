// Die Referenz: was bpmn-js 18.31.0 in diesem Chromium misst, für den ganzen Korpus (korpus.mjs), und daneben
// Variante (a) in derselben Seite. Schreibt referenz-chromium.json:
//   referenz[text]        { w, h, lines }        labelMeasurer(viewer) wie in tests/capture-bpmn.mjs, mit der Zeilenzahl
//   referenz['note:<b>:<text>'] { w, h, lines }  dito für Notizen in den Breiten NOTE_WIDTHS
//   a1[...]               dasselbe mit labelMeasurer() auf dem TextRenderer von bpmn-js ohne Viewer (npm-Quelle, gebündelt)
//   a2[...]               dasselbe nur mit Text von diagram-js und der Rechnung des TextRenderers nachgebaut (30 Zeilen)
//   font                  welche Schrift Chromium für BPMN_FONT nimmt (canvas.measureText gegen Kandidaten)
//   node:   cd spikes/lmm/diagram-js && node referenz.mjs
import fs from 'node:fs';
import { withPage, R } from './browser.mjs';
import { korpus } from './korpus.mjs';

const { NOTE_WIDTHS } = await import(R + 'src/app/bpmn-layout.js');
const K = korpus();

const out = await withPage(page => page.evaluate(({ labels, notes, widths }) => {
  const { labelMeasurer, BPMN_VIEWER_CONFIG } = window.dokufixCapture;
  const { TextRenderer, Text } = window.vendorText;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:4000px;height:3000px;overflow:hidden';
  document.body.appendChild(host);
  const viewer = new BpmnJS({ container: host, ...BPMN_VIEWER_CONFIG });
  // Zeilen, wie labelMeasurer() sie zählt: tspans von createText().
  const linesOf = (tr, text, width) => {
    if (width) return tr.createText(text, { box: { width, height: 30 }, align: 'left-top', padding: 7, style: tr.getDefaultStyle() }).querySelectorAll('tspan').length;
    const style = tr.getExternalStyle();
    const imported = tr.getExternalLabelBounds({ x: 0, y: 0, width: 90, height: 30 }, text);
    return tr.createText(text, { box: { width: imported.width, height: 30 }, style }).querySelectorAll('tspan').length;
  };
  const all = (measure, tr) => {
    const r = {};
    for (const t of labels){ const s = measure(t); r[t] = { w: s.w, h: s.h, lines: linesOf(tr, t) }; }
    for (const t of notes) for (const w of widths){ const s = measure(t, w); r['note:' + w + ':' + t] = { w: s.w, h: s.h, lines: linesOf(tr, t, w) }; }
    return r;
  };
  let referenz, a1, a2, font;
  try {
    const trViewer = viewer.get('textRenderer');
    referenz = all(labelMeasurer(viewer), trViewer);
    // (a1): der TextRenderer von bpmn-js aus der npm-Quelle, ohne Viewer, mit derselben Konfiguration.
    const tr = new TextRenderer(BPMN_VIEWER_CONFIG.textRenderer);
    a1 = all(labelMeasurer({ get: n => { if (n !== 'textRenderer') throw new Error(n); return tr; } }), tr);
    // (a2): nur Text von diagram-js; die Rechnung des TextRenderers (Box 90, Stil, Rundung, Notiz-Innenabstand 7, min 40) nachgebaut.
    const defaultStyle = { fontFamily: 'Arial, sans-serif', fontSize: 12, fontWeight: 'normal', lineHeight: 1.2, ...BPMN_VIEWER_CONFIG.textRenderer.defaultStyle };
    const externalStyle = { ...defaultStyle, fontSize: parseInt(defaultStyle.fontSize, 10) - 1, ...BPMN_VIEWER_CONFIG.textRenderer.externalStyle };
    const text = new Text({ style: defaultStyle });
    const tr2 = {
      getExternalStyle: () => externalStyle, getDefaultStyle: () => defaultStyle,
      createText: (t, o) => text.createText(t, o),
      getExternalLabelBounds: (b, t) => { const d = text.getDimensions(t, { box: { width: Math.max(b.width, 90), height: 30 }, style: externalStyle }); return { x: 0, y: 0, width: Math.ceil(d.width), height: Math.ceil(d.height) }; },
      getTextAnnotationBounds: (b, t) => { const d = text.getDimensions(t, { box: b, style: defaultStyle, align: 'left-top', padding: 7 }); return { x: 0, y: 0, width: b.width, height: Math.max(40, Math.round(d.height)) }; },
    };
    a2 = all(labelMeasurer({ get: () => tr2 }), tr2);
    // Welche Schrift: canvas.measureText mit BPMN_FONT gegen Kandidaten, auf einem Satz mit vielen Zeichen.
    const ctx = document.createElement('canvas').getContext('2d');
    const probe = 'Antrag prüfen und weiterleiten ÄÖÜ 0123456789 Wavy AVATAR .,;-';
    const width = family => { ctx.font = 'normal 12px ' + family; return ctx.measureText(probe).width; };
    const stack = BPMN_VIEWER_CONFIG.textRenderer.defaultStyle.fontFamily;
    font = { stack, stackWidth: width(stack), candidates: {} };
    for (const f of ['Liberation Sans', 'Inter', 'DejaVu Sans', 'FreeSans', 'Carlito', 'WenQuanYi Zen Hei', 'Arial', 'Helvetica', 'Roboto', "'Segoe UI'", 'sans-serif']) font.candidates[f] = width(f);
    font.checks = Object.fromEntries(['Roboto', 'Segoe UI', 'Helvetica', 'Arial', 'Liberation Sans', 'Inter'].map(f => [f, document.fonts.check('12px "' + f + '"')]));
  } finally { viewer.destroy(); host.remove(); }
  return { referenz, a1, a2, font, userAgent: navigator.userAgent };
}, { labels: K.labels, notes: K.notes, widths: NOTE_WIDTHS }));

const same = (a, b) => Object.keys(out.referenz).filter(k => a[k].w !== b[k].w || a[k].h !== b[k].h).length;
console.log('Chromium:', out.userAgent);
console.log('Korpus:', K.labels.length, 'Beschriftungen,', K.notes.length, 'Notiztexte ×', NOTE_WIDTHS.length, 'Breiten =', Object.keys(out.referenz).length, 'Messungen');
console.log('Schrift für BPMN_FONT: Breite der Probe', out.font.stackWidth, '| Kandidaten:', JSON.stringify(out.font.candidates), '| fonts.check:', JSON.stringify(out.font.checks));
console.log('(a1) TextRenderer ohne Viewer, Größen anders als Referenz:', same(out.referenz, out.a1));
console.log('(a2) nur Text von diagram-js, Größen anders als Referenz:', same(out.referenz, out.a2));
fs.writeFileSync(new URL('./referenz-chromium.json', import.meta.url), JSON.stringify({ chromium: out.userAgent, font: out.font, korpus: K.fixtures, referenz: out.referenz, a1: out.a1, a2: out.a2 }, null, 1));
