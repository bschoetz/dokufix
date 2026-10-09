// --- The diagram colours of the BPMN tools ----------------------------------
// The colour variables src/doc.css sets per kind of element, overridden in a
// style element of their own after the document styles; they reach the
// picture, the large view and the SVG download. Per type a fill, a line and a
// label, as far as the type has them (Ben, 2026-10-05). A key is type-property,
// task-fill for one; only bg-fill may also be transparent.
//
// The BPMN Assistant chooses among the presets or its own colours
// (src/bpmn-assistant/main.js, with the picker); the Layouter Audi draws in the
// preset "Audi-Stil" (src/bpmn-audi/main.js). Until story 2.38 the Audi carried
// a copy of SEL, the preset and the CSS.
//
// Pure logic: themeCss() gives the text, applyTheme() puts it into the style
// element it is handed. Nothing done on loading; Node imports it too.

export const TYPES = [
  ['task', 'Aufgabe', 'fsli'],
  ['sub', 'Teilprozess und Aufruf', 'fsl'],
  ['start', 'Startereignis', 'fsli'],
  ['inter', 'Zwischenereignis', 'fsli'],
  ['end', 'Endereignis', 'fsli'],
  ['gwx', 'Gateway exklusiv', 'fsli'],
  ['gwp', 'Gateway parallel', 'fsli'],
  ['gwo', 'Gateway inklusiv', 'fsli'],
  ['gwe', 'Gateway ereignisbasiert, komplex', 'fsli'],
  ['flow', 'Sequenzfluss', 'fsl'],
  ['msg', 'Nachrichtenfluss', 'fsl'],
  ['assoc', 'Assoziation', 's'],
  ['note', 'Textanmerkung', 'sl'],
  ['data', 'Datenobjekt und Datenspeicher', 'fsl'],
  ['group', 'Gruppe', 'sl'],
  ['pool', 'Pool', 'fs'],
  ['head', 'Poolkopf', 'fl'],
  ['lane', 'Bahn', 'fsl'],
  ['bg', 'Seitenhintergrund', 'f'],
];
export const PROPS = { f: ['fill', 'Füllung'], s: ['stroke', 'Linie'], l: ['label', 'Schrift'], i: ['icon', 'Symbol'] };
export const KEYS = TYPES.flatMap(([t, , ps]) => [...ps].map(p => t + '-' + PROPS[p][0]));
export const NAMES = Object.fromEntries(TYPES.flatMap(([t, n, ps]) => [...ps].map(p => [t + '-' + PROPS[p][0], n + ' · ' + PROPS[p][1]])));
// The classes addBpmnTypeClasses() gives per type (src/app/bpmn.js).
export const SEL = {
  task: '.dokufix-bpmn-task',
  sub: ':is(.dokufix-bpmn-subprocess,.dokufix-bpmn-callactivity)',
  start: '.dokufix-bpmn-startevent',
  inter: ':is(.dokufix-bpmn-intermediatecatchevent,.dokufix-bpmn-intermediatethrowevent,.dokufix-bpmn-boundaryevent)',
  end: '.dokufix-bpmn-endevent',
  gwx: '.dokufix-bpmn-exclusivegateway',
  gwp: '.dokufix-bpmn-parallelgateway',
  gwo: '.dokufix-bpmn-inclusivegateway',
  gwe: ':is(.dokufix-bpmn-eventbasedgateway,.dokufix-bpmn-complexgateway)',
  flow: '.dokufix-bpmn-sequenceflow',
  msg: '.dokufix-bpmn-messageflow',
  assoc: ':is(.dokufix-bpmn-association,.dokufix-bpmn-datainputassociation,.dokufix-bpmn-dataoutputassociation)',
  note: '.dokufix-bpmn-textannotation',
  data: ':is(.dokufix-bpmn-dataobjectreference,.dokufix-bpmn-datastorereference)',
  group: '.dokufix-bpmn-group',
  lane: '.dokufix-bpmn-lane',
};
export const HEX = /^#[0-9a-f]{6}$/i;
export const valid = (k, v) => HEX.test(v) || (k === 'bg-fill' && v === 'transparent');
// Contrast after WCAG, for the label in the pool's head of an older choice.
function lum(hex){
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const headLabel = r => contrast(r.label, r.head) >= 4.5 ? r.label : contrast('#ffffff', r.head) >= contrast('#000000', r.head) ? '#ffffff' : '#000000';
// From the ten roles of the earlier version every variable, and what a theme sets otherwise per type.
export function fromRoles(r, over = {}){
  const t = {};
  for (const k of ['task', 'sub', 'start', 'inter']) Object.assign(t, { [k + '-fill']: r.fill, [k + '-stroke']: r.sym, [k + '-label']: r.label });
  Object.assign(t, {
    'end-fill': r.fill, 'end-stroke': r.end, 'end-label': r.label,
    'task-icon': r.sym,
    'flow-fill': r.fill, 'flow-stroke': r.line, 'flow-label': r.label,
    'msg-fill': r.fill, 'msg-stroke': r.line, 'msg-label': r.label,
    'assoc-stroke': r.line, 'note-stroke': r.line, 'note-label': r.label,
    'data-fill': r.fill, 'data-stroke': r.line, 'data-label': r.label,
    'group-stroke': r.poolLine, 'group-label': r.label,
    'pool-fill': r.poolFill, 'pool-stroke': r.poolLine,
    'head-fill': r.head || r.poolFill, 'head-label': headLabel({ label: r.label, head: r.head || r.poolFill }),
    'lane-fill': r.poolFill, 'lane-stroke': r.poolLine, 'lane-label': r.label,
    'bg-fill': r.bg || '#ffffff',
  });
  for (const g of ['gwx', 'gwp', 'gwo', 'gwe']) Object.assign(t, { [g + '-fill']: r.fill, [g + '-stroke']: r.gw || r.sym, [g + '-label']: r.label });
  // The symbol (task top left, the sign in an event and a gateway) follows the line where the theme does not set it.
  const out = { ...t, ...over };
  for (const [k, , ps] of TYPES) if (ps.includes('i') && !((k + '-icon') in over)) out[k + '-icon'] = out[k + '-stroke'];
  return out;
}
export const PRESETS = {
  // Gelb: designed by Ben in the tool and exported as .json (2026-10-07), every value explicit; since then the
  // assistant's default. Tasks light yellow with ochre, exclusive gateways blue, parallel and the others violet,
  // message flows and intermediate events ochre, the pool's head black; background transparent.
  gelb: { name: 'Gelb',
    'task-fill': '#fffbdb', 'task-stroke': '#b3a00f', 'task-label': '#1c1c1e', 'task-icon': '#000000',
    'sub-fill': '#ffffff', 'sub-stroke': '#0066cc', 'sub-label': '#1c1c1e', 'start-fill': '#ffffff',
    'start-stroke': '#000000', 'start-label': '#1c1c1e', 'start-icon': '#c38209', 'inter-fill': '#ffffff',
    'inter-stroke': '#c38209', 'inter-label': '#1c1c1e', 'inter-icon': '#000000', 'end-fill': '#ffffff',
    'end-stroke': '#1c1c1e', 'end-label': '#1c1c1e', 'end-icon': '#1c1c1e', 'gwx-fill': '#f0f8ff',
    'gwx-stroke': '#0066cc', 'gwx-label': '#1c1c1e', 'gwx-icon': '#004080', 'gwp-fill': '#faf3fc',
    'gwp-stroke': '#ad33cc', 'gwp-label': '#1c1c1e', 'gwp-icon': '#8a29a3', 'gwo-fill': '#ffffff',
    'gwo-stroke': '#ad33cc', 'gwo-label': '#1c1c1e', 'gwo-icon': '#8a29a3', 'gwe-fill': '#ffffff',
    'gwe-stroke': '#ad33cc', 'gwe-label': '#1c1c1e', 'gwe-icon': '#8a29a3', 'flow-stroke': '#3a3a3f',
    'flow-label': '#1c1c1e', 'msg-stroke': '#c38209', 'msg-label': '#1c1c1e', 'pool-fill': '#ffffff',
    'flow-fill': '#ffffff', 'msg-fill': '#ffffff', 'assoc-stroke': '#6e6e73', 'note-stroke': '#3a3a3f',
    'note-label': '#1c1c1e', 'data-fill': '#ffffff', 'data-stroke': '#3a3a3f', 'data-label': '#1c1c1e',
    'group-stroke': '#6e6e73', 'group-label': '#1c1c1e',
    'pool-stroke': '#2c2c2c', 'head-fill': '#000000', 'head-label': '#ffffff', 'lane-fill': '#ffffff',
    'lane-stroke': '#2c2c2c', 'lane-label': '#1c1c1e', 'bg-fill': 'transparent' },
  // As dokufix draws (src/doc.css:269–274), message flows there #6e6e73.
  blau: { name: 'Blau (dokufix)', ...fromRoles({ sym: '#0066cc', end: '#1c1c1e', line: '#3a3a3f', poolLine: '#8e8e92', poolFill: '#fafafa', head: '#fafafa', fill: '#ffffff', label: '#1c1c1e', bg: '#ffffff' }, { 'msg-stroke': '#6e6e73' }) },
  sw: { name: 'Schwarzweiß', ...fromRoles({ sym: '#000000', end: '#000000', line: '#000000', poolLine: '#000000', poolFill: '#ffffff', head: '#ffffff', fill: '#ffffff', label: '#000000', bg: '#ffffff' }) },
  synthwave: { name: 'Synthwave', ...fromRoles({ sym: '#00f0ff', gw: '#f9f871', end: '#ff2a6d', line: '#b967ff', poolLine: '#ff2fd6', poolFill: '#1a0b2e', head: '#ff2fd6', fill: '#2a1050', label: '#fdf0ff', bg: '#0f0520' },
    { 'sub-stroke': '#b967ff', 'inter-stroke': '#f9f871', 'task-icon': '#ff2fd6', 'gwp-stroke': '#00f0ff', 'gwo-stroke': '#b967ff', 'msg-stroke': '#ff2fd6', 'flow-label': '#d9b8ff', 'head-label': '#0f0520', 'lane-fill': '#1a0b2e' }) },
  // Audi-Stil: designed by Ben in the tool and exported as .json (2026-10-05), every value explicit. Greys from
  // Audi's CI guide, black and white, red #f50537 (Audi's "Progressive Red") on start and end events, gateways and
  // the sign of intermediate events; background transparent. The Layouter Audi draws in it.
  audi: { name: 'Audi-Stil',
    'task-fill': '#ffffff', 'task-stroke': '#333333', 'task-label': '#1a1a1a', 'task-icon': '#000000', 'sub-fill': '#ffffff', 'sub-stroke': '#333333',
    'sub-label': '#1a1a1a', 'start-fill': '#ffffff', 'start-stroke': '#f50537', 'start-label': '#1a1a1a', 'start-icon': '#4c4c4c', 'inter-fill': '#ffffff',
    'inter-stroke': '#000000', 'inter-label': '#1a1a1a', 'inter-icon': '#f50537', 'end-fill': '#ffffff', 'end-stroke': '#f50537', 'end-label': '#1a1a1a',
    'end-icon': '#4c4c4c', 'gwx-fill': '#ffffff', 'gwx-stroke': '#f50537', 'gwx-label': '#1a1a1a', 'gwx-icon': '#4c4c4c', 'gwp-fill': '#ffffff',
    'gwp-stroke': '#f50537', 'gwp-label': '#1a1a1a', 'gwp-icon': '#4c4c4c', 'gwo-fill': '#ffffff', 'gwo-stroke': '#f50537', 'gwo-label': '#1a1a1a',
    'gwo-icon': '#4c4c4c', 'gwe-fill': '#ffffff', 'gwe-stroke': '#f50537', 'gwe-label': '#1a1a1a', 'gwe-icon': '#4c4c4c', 'flow-stroke': '#4c4c4c',
    'flow-label': '#4c4c4c', 'msg-stroke': '#808080', 'msg-label': '#1a1a1a', 'pool-fill': '#f2f2f2', 'pool-stroke': '#000000', 'head-fill': '#000000',
    'head-label': '#ffffff', 'lane-fill': '#f2f2f2', 'lane-stroke': '#b3b3b3', 'lane-label': '#1a1a1a', 'bg-fill': 'transparent',
    'flow-fill': '#ffffff', 'msg-fill': '#ffffff', 'assoc-stroke': '#808080', 'note-stroke': '#4c4c4c', 'note-label': '#1a1a1a',
    'data-fill': '#ffffff', 'data-stroke': '#333333', 'data-label': '#1a1a1a', 'group-stroke': '#808080', 'group-label': '#1a1a1a' },
  // STI Consulting: the colours of the theme stylesheet of sti-consulting.com (2026-10-05): primary olive #7E904C,
  // dark blue #1D2C49 of the dark sections (here the pool's head as well), text #333, headings #1a1a1a, background #FAFAFA.
  sti: { name: 'STI Consulting', ...fromRoles({ sym: '#7e904c', end: '#1d2c49', line: '#333333', poolLine: '#1d2c49', poolFill: '#fafafa', head: '#1d2c49', fill: '#ffffff', label: '#1a1a1a', bg: '#ffffff' },
    { 'flow-label': '#333333', 'lane-label': '#1d2c49', 'msg-stroke': '#1d2c49', 'task-icon': '#1d2c49', 'gwp-stroke': '#1d2c49' }) },
};
// The background "transparent" in the tool: a checkerboard; the SVG has none.
export const CHECKER = 'repeating-conic-gradient(#e5e5ea 0 25%,#fff 0 50%) 0 0/16px 16px';
export const presetOf = t => (Object.entries(PRESETS).find(([, c]) => KEYS.every(k => c[k] === t[k])) || ['eigene'])[0];
// A choice from an older version (stored or imported) in the keys of today.
export function migrate(t){
  // The version with ten roles: a preset stays the preset, own colours are converted.
  if (!t['task-fill'] && HEX.test(t.sym || '')) t = PRESETS[t.preset] ? { ...PRESETS[t.preset] } : fromRoles(t);
  // The version with one gateway type and no task symbol: every kind of gateway as the gateway, the symbol as the line.
  if (t['gw-fill'] && !t['gwx-fill']) for (const g of ['gwx', 'gwp', 'gwo', 'gwe']) for (const p of ['fill', 'stroke', 'label']) t[g + '-' + p] = t['gw-' + p];
  // A version without a symbol of its own (task, events, gateways): the symbol as the line.
  for (const [k, , ps] of TYPES) if (ps.includes('i') && t[k + '-stroke'] && !t[k + '-icon']) t[k + '-icon'] = t[k + '-stroke'];
  // A version before the colours for the flows' fill, association, text annotation, data and group (2026-10-08): a
  // preset takes their new values, own colours keep their picture, the defaults these elements had until then (fill
  // and label as tasks, line as sequence flows).
  const missing = KEYS.filter(k => !(k in t));
  if (missing.length){
    const base = Object.values(PRESETS).find(p => KEYS.every(k => missing.includes(k) || p[k] === t[k]));
    for (const k of missing) t[k] = base ? base[k] : t[k.endsWith('-fill') ? 'task-fill' : k.endsWith('-label') ? 'task-label' : 'flow-stroke'];
  }
  return t;
}

// The style block of a theme t. background: whether the block sets --assistant-bg, the area behind a picture
// (the assistant's; the Audi draws on white).
export function themeCss(t, { background = true } = {}){
  const d = '.dokufix-doc .dokufix-diagram-bpmn';
  const vars = (f, s, l) => (f ? '--dokufix-bpmn-fill:' + f + ';' : '') + (s ? '--dokufix-bpmn-stroke:' + s + ';' : '') + (l ? '--dokufix-bpmn-label:' + l + ';' : '');
  // Defaults for everything without a type of its own: as tasks, lines as sequence flows.
  let css = d + '{' + vars(t['task-fill'], t['flow-stroke'], t['task-label']) + (background ? '--assistant-bg:' + (t['bg-fill'] === 'transparent' ? CHECKER : t['bg-fill']) : '') + '}';
  for (const [k, sel] of Object.entries(SEL)) css += d + ' ' + sel + '{' + vars(t[k + '-fill'], t[k + '-stroke'], t[k + '-label']) + '}';
  // The symbol (decorate() marks it): its line, and what bpmn-js fills in it in the line's colour.
  css += d + ' .dokufix-bpmn-task .dokufix-bpmn-icon{--dokufix-bpmn-stroke:' + t['task-icon'] + '}';
  for (const [k, sel] of Object.entries(SEL)) if (t[k + '-icon'] && k !== 'task') css += d + ' ' + sel + ' .dokufix-bpmn-icon{--dokufix-bpmn-stroke:' + t[k + '-icon'] + '}';
  // The pool: its label stands in its head.
  css += d + ' .dokufix-bpmn-pool{' + vars(t['pool-fill'], t['pool-stroke'], t['head-label']) + '--dokufix-bpmn-head:' + t['head-fill'] + '}';
  // A collapsed pool (black box, story 2.29) has no head; its name stands on the pool's area, in the colour of the
  // lanes' label (Ben, 2026-10-06).
  css += d + ' .dokufix-bpmn-pool.dokufix-bpmn-box{' + vars(null, null, t['lane-label']) + '}';
  return css;
}
// Puts the theme's block into the style element.
export function applyTheme(style, t, options){
  style.textContent = themeCss(t, options);
}
