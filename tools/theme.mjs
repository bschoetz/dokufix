// A theme for the build (story 6.2): node build.mjs --theme <folder> reads
// <folder>/theme.json, checks it and gives the second :root rule, the
// customer's name for title and header, and the meta line. See src/README.md,
// "Themes".
//
// What a theme may set is the first group of the :root rule at the head of
// src/doc.css, read from there: --dokufix-status-<kind>[-tint|-text] are the
// status kinds, --dokufix-font-body and -mono the font stacks, every other one
// a colour. The internal group, after the comment "internal: …", a theme does
// not set; DERIVED below says which of those follow a public one.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BuildError } from '../build.mjs';
import { contrast, lum } from '../src/bpmn-tools/theme.js';

const HEX6 = /^#[0-9a-f]{6}$/i;
const FONT_NAME = /^[A-Za-z0-9 _-]+$/;

// '#fff' → '#ffffff', for comparing and for contrast().
const long = v => /^#[0-9a-f]{3}$/i.test(v) ? '#' + [...v.slice(1)].map(c => c + c).join('') : v.toLowerCase();
const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = cs => '#' + cs.map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
const rgba = (hex, a) => 'rgba(' + channels(hex).join(',') + ',' + a + ')';
// Generic families stand bare; a keyword such as inherit or a name that is no
// identifier must be quoted, or the stack breaks.
const GENERIC = ['serif', 'sans-serif', 'monospace', 'system-ui', 'ui-monospace', 'ui-sans-serif', 'ui-serif', 'cursive', 'fantasy', '-apple-system', 'BlinkMacSystemFont'];
const KEYWORD = /^(inherit|initial|unset|revert|revert-layer|default)$/i;
const fontName = n => GENERIC.includes(n) || (/^-?[A-Za-z_][A-Za-z0-9_-]*$/.test(n) && !KEYWORD.test(n)) ? n : "'" + n + "'";

// The internal variables that follow a public one: name → [the public ones it
// reads, how]. Everything not listed stays fixed.
export const DERIVED = {
  'accent-hover': [['accent'], v => toHex(channels(v.accent).map(c => c * 0.888))],
  'accent-tint-12': [['accent'], v => rgba(v.accent, 0.12)],
  'accent-tint-30': [['accent'], v => rgba(v.accent, 0.30)],
  'accent-tint-35': [['accent'], v => rgba(v.accent, 0.35)],
  'link-tint-6': [['link'], v => rgba(v.link, 0.06)],
  'focus-strong': [['text'], v => v.text],
  'inverse': [['text'], v => v.text],
  'line-active': [['text'], v => v.text],
  'on-inverse': [['surface'], v => v.surface],
  'focus-accent': [['accent'], v => v.accent],
  'chrome-divider': [['chrome-raised'], v => v['chrome-raised']],
  // Lighter on a dark chrome, darker on a light one.
  'chrome-line-hover': [['chrome-line', 'chrome'], v => toHex(channels(v['chrome-line']).map(c => c + (lum(v.chrome) > 0.5 ? -14 : 14)))],
  'on-chrome-strong': [['on-chrome'], v => v['on-chrome']],
};

// [foreground, background, minimum]: text 4.5, the rest 3.0 (WCAG).
export const PAIRS = [
  ['text', 'surface', 4.5], ['text', 'surface-alt', 4.5], ['text-muted', 'surface', 4.5],
  ['link', 'surface', 4.5], ['on-accent', 'accent', 4.5], ['on-chrome', 'chrome', 4.5], ['text', 'mark', 4.5],
  ['focus', 'surface', 3.0], ['text-faint', 'surface', 3.0],
  // The BPMN stroke on a pool.
  ['link', 'surface-alt', 3.0],
  // States the theme moves: the hovered main button, the toolbar's buttons, its fixed grey text.
  ['on-accent', 'accent-hover', 4.5], ['on-chrome', 'chrome-raised', 4.5], ['on-chrome-faint', 'chrome', 3.0],
];

// The first :root rule of doc.css: { public, all }, each { name: value }
// without the prefix --dokufix-; public is the group before the comment.
export function themeDefaults(docCss){
  const rule = /:root\s*\{([^}]*)\}/.exec(docCss);
  const end = rule && rule[1].indexOf('internal: a theme does not set these');
  if (!rule || end < 0) throw new BuildError('doc.css: the :root rule with its comment "internal: a theme does not set these" was not found');
  const vars = text => Object.fromEntries(Array.from(text.matchAll(/--dokufix-([a-z0-9-]+)\s*:\s*([^;]+);/g), m => [m[1], m[2].trim()]));
  return { public: vars(rule[1].slice(0, end)), all: vars(rule[1]) };
}

const escapeHtml = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Reads and checks <dir>/theme.json against the defaults of docCss. Returns
// { id, name, tag, css, meta, title, header, inherited } or throws a
// BuildError naming every problem. css is '' when the theme changes nothing.
export function readTheme(dir, docCss){
  const file = path.join(dir, 'theme.json');
  if (!fs.existsSync(file)) throw new BuildError('theme not found: ' + file);
  const bytes = fs.readFileSync(file);
  let t;
  try { t = JSON.parse(bytes.toString('utf8')); }
  catch (e){ throw new BuildError('theme.json: not JSON: ' + e.message); }
  if (!isObject(t)) throw new BuildError('theme.json: not an object');

  const { public: defaults, all } = themeDefaults(docCss);
  const colourKeys = Object.keys(defaults).filter(k => !k.startsWith('status-') && !k.startsWith('font-'));
  const kinds = Object.keys(defaults).filter(k => /^status-[a-z]+$/.test(k)).map(k => k.slice(7));
  const problems = [];
  const unknown = (where, key, known) => problems.push('theme.json: unknown key ' + where + key + '; known: ' + known.join(', '));
  const colour = (where, v) => {
    if (typeof v === 'string' && HEX6.test(v)) return v.toLowerCase();
    problems.push('theme.json: ' + where + ' is ' + JSON.stringify(v) + ', expected a colour #rrggbb');
    return null;
  };

  for (const k of Object.keys(t)) if (!['id', 'name', 'tag', 'colors', 'status', 'fonts'].includes(k)) unknown('', k, ['id', 'name', 'tag', 'colors', 'status', 'fonts']);
  if (typeof t.id !== 'string' || !/^[a-z0-9-]+$/.test(t.id)) problems.push('theme.json: id is ' + JSON.stringify(t.id) + ', expected [a-z0-9-]+');
  const name = typeof t.name === 'string' ? t.name.trim() : t.name;
  const tag = typeof t.tag === 'string' ? t.tag.trim() : t.tag;
  if (typeof name !== 'string' || !name || name.length > 40) problems.push('theme.json: name is ' + JSON.stringify(t.name) + ', expected a text of 1 to 40 characters');
  if (tag !== undefined && (typeof tag !== 'string' || tag.length > 20)) problems.push('theme.json: tag is ' + JSON.stringify(t.tag) + ', expected a text of at most 20 characters');

  // set: the public variables the theme names, by variable name.
  const set = {};
  if (t.colors !== undefined){
    if (!isObject(t.colors)) problems.push('theme.json: colors is not an object');
    else for (const [k, v] of Object.entries(t.colors)){
      if (!colourKeys.includes(k)) unknown('colors.', k, colourKeys);
      else { const c = colour('colors.' + k, v); if (c) set[k] = c; }
    }
  }
  const setKinds = new Set();
  if (t.status !== undefined){
    if (!isObject(t.status)) problems.push('theme.json: status is not an object');
    else for (const [kind, props] of Object.entries(t.status)){
      if (!kinds.includes(kind)){ unknown('status.', kind, kinds); continue; }
      if (!isObject(props)){ problems.push('theme.json: status.' + kind + ' is not an object'); continue; }
      for (const [p, v] of Object.entries(props)){
        if (!['color', 'tint', 'text'].includes(p)){ unknown('status.' + kind + '.', p, ['color', 'tint', 'text']); continue; }
        const c = colour('status.' + kind + '.' + p, v);
        if (c){ set['status-' + kind + (p === 'color' ? '' : '-' + p)] = c; setKinds.add(kind); }
      }
    }
  }
  if (t.fonts !== undefined){
    if (!isObject(t.fonts)) problems.push('theme.json: fonts is not an object');
    else for (const [k, v] of Object.entries(t.fonts)){
      if (!['body', 'mono'].includes(k)){ unknown('fonts.', k, ['body', 'mono']); continue; }
      if (!Array.isArray(v) || !v.length || !v.every(n => typeof n === 'string' && FONT_NAME.test(n))){
        problems.push('theme.json: fonts.' + k + ' is ' + JSON.stringify(v) + ', expected a list of font names (letters, digits, space, _ and -)');
        continue;
      }
      set['font-' + k] = v.map(fontName).join(',');
    }
  }
  if (problems.length) throw new BuildError(problems.join('\n'));

  // Inheritance: an unset key keeps its default, except these, which follow
  // the theme's value of another.
  if (!set.focus && set.link) set.focus = set.link;
  if (!set['line-faint'] && set['text-faint']) set['line-faint'] = set['text-faint'];
  for (const kind of kinds){
    if (defaults['status-' + kind + '-text'] && !set['status-' + kind + '-text'] && set['status-' + kind]) set['status-' + kind + '-text'] = set['status-' + kind];
  }
  // The effective values: default, theme, and what follows a changed key.
  const v = {};
  for (const [k, d] of Object.entries(all)) v[k] = set[k] || (k.startsWith('font-') || !d.startsWith('#') ? d : long(d));
  const changed = new Set(Object.keys(set).filter(k => set[k] !== (k.startsWith('font-') ? defaults[k] : long(defaults[k]))));
  const derived = Object.entries(DERIVED).filter(([, [from]]) => from.some(f => changed.has(f))).map(([k, [, fn]]) => [k, fn(v)]);
  for (const [k, x] of derived) v[k] = x;

  // Light scheme only.
  if (lum(v.surface) <= lum(v.text)) problems.push('surface ' + v.surface + ' is not lighter than text ' + v.text + '; dokufix has a light scheme only');

  for (const [fg, bg, min] of [...PAIRS, ...kinds.flatMap(k => [['status-' + k, 'surface', 4.5], ['status-' + k + '-text', 'status-' + k + '-tint', 4.5]])]){
    if (!(fg in v) || !(bg in v)) continue;
    // A derived tint is rgba; the pairs read only #rrggbb values.
    if (!HEX6.test(v[fg]) || !HEX6.test(v[bg])) continue;
    const r = contrast(v[fg], v[bg]);
    if (r < min) problems.push(shown(fg) + ' ' + v[fg] + ' on ' + shown(bg) + ' ' + v[bg] + ': ' + r.toFixed(2) + ':1, needs ' + min.toFixed(1) + ':1');
  }
  if (problems.length) throw new BuildError(problems.join('\n'));

  // The rule: what differs from the default, and what follows it.
  const decl = [...Object.keys(defaults).filter(k => changed.has(k)).map(k => [k, set[k]]), ...derived];
  const css = decl.length ? ':root{' + decl.map(([k, x]) => '--dokufix-' + k + ':' + x).join(';') + '}' : '';

  const shownName = escapeHtml(name), shownTag = tag ? escapeHtml(tag) : '';
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  return {
    id: t.id, name, tag: tag || '', css,
    meta: '<meta name="dokufix-theme" content="' + t.id + ' ' + hash + '">',
    title: '<title>' + shownName + ' — dokufix</title>',
    header: '<h1>' + shownName + '</h1>\n  <span class="brand">dokufix</span>' + (shownTag ? '\n  <span class="tag">' + shownTag + '</span>' : ''),
    inherited: kinds.filter(k => !setKinds.has(k)),
  };
}

// The name in a message: status.note.color, status.note.tint, text.
function shown(k){
  const m = /^status-([a-z]+)(?:-(tint|text))?$/.exec(k);
  return m ? 'status.' + m[1] + '.' + (m[2] || 'color') : k;
}

// The themed page from the page of src/index.html: title, meta, header.
export function themeTemplate(template, theme){
  const swaps = [
    ['<title>dokufix — PoC</title>', theme.title + '\n' + theme.meta],
    ['<h1>dokufix</h1>\n  <span class="tag">PoC</span>', theme.header],
  ];
  for (const [from, to] of swaps){
    const n = template.split(from).length - 1;
    if (n !== 1) throw new BuildError('index.html: ' + JSON.stringify(from) + ' stands ' + n + ' times, expected once; the theme puts its name there');
    template = template.replace(from, () => to);
  }
  return template;
}
