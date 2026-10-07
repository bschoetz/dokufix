// saxen 11.2.0 (MIT), der SAX-Parser von bpmn-moddle, entpackt außerhalb des
// Repositorys. Aus seinen Ereignissen entsteht ein Baum (minidom), so wie
// moddle-xml einen Elementbaum baut: Text über decodeEntities(), CDATA
// wörtlich. Ohne ns(): bpmn-moddle schaltet Namensräume ein; für die
// lokalen Namen, die readProcess() vergleicht, macht das keinen Unterschied.
import { createRequire } from 'node:module';
import { Element, Document } from './minidom.mjs';

const V = '/tmp/claude-0/-home-user-dokufix/c7ad9c8e-4112-59bc-bff9-b496db1abe70/scratchpad/parsing-vendor/saxen-11.2.0/package/';
const require = createRequire(import.meta.url);
const { Parser } = require(V + 'dist/index.cjs');
const pkg = require(V + 'package.json');

export const name = 'saxen';
export const info = 'saxen ' + pkg.version + ' (' + pkg.license + ')';
export function parse(xml){
  const doc = new Document();
  let cur = null;
  const errors = [], warnings = [];
  const parser = new Parser({ proxy: true });
  parser
    .on('openTag', (obj, decode, selfClosing) => {
      const attrs = {};
      for (const [k, v] of Object.entries(obj.attrs || {})) attrs[k] = decode(v);
      const el = new Element(obj.name, attrs, cur);
      if (!cur) doc.documentElement = el;
      if (!selfClosing) cur = el;
    })
    .on('closeTag', () => { cur = cur ? cur.parentElement : null; })
    .on('text', (t, decode) => { if (cur) cur.addText(decode(t)); })
    .on('cdata', t => { if (cur) cur.addText(t); })
    .on('error', (err, getContext) => { errors.push(String(err && err.message || err) + ' @' + JSON.stringify(ctx(getContext))); })
    .on('warn', (err, getContext) => { warnings.push(String(err && err.message || err)); });
  parser.parse(xml);
  if (errors.length) throw new Error('saxen: ' + errors.join(' | '));
  if (!doc.documentElement) throw new Error('saxen: kein Wurzelelement');
  doc.warnings = warnings;
  return doc;
}
const ctx = get => { try { const c = get(); return { line: c.line, column: c.column }; } catch { return null; } };
