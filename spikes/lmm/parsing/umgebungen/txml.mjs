// txml 6.0.3 (MIT), entpackt außerhalb des Repositorys. Sein Baum
// ({ tagName, attributes, children: [string | node] }) wird zum minidom.
// Optionen: Leerraum behalten, Entitäten auflösen, Kommentare weglassen.
import { createRequire } from 'node:module';
import { Element, Document } from './minidom.mjs';

const V = '/tmp/claude-0/-home-user-dokufix/c7ad9c8e-4112-59bc-bff9-b496db1abe70/scratchpad/parsing-vendor/txml-6.0.3/package/';
const { parse: txmlParse } = await import(V + 'dist/txml.mjs');
const pkg = createRequire(import.meta.url)(V + 'package.json');

export const name = 'txml';
export const info = 'txml ' + pkg.version + ' (' + pkg.license + ')';
export function parse(xml){
  let nodes;
  try { nodes = txmlParse(xml, { keepWhitespace: true, decodeEntities: true, keepComments: false }); } catch (e){ throw new Error('txml: ' + (e && e.message || e)); }
  const doc = new Document();
  const build = (node, parent) => {
    const el = new Element(node.tagName, Object.fromEntries(Object.entries(node.attributes || {}).map(([k, v]) => [k, v === null ? '' : v])), parent);
    for (const c of node.children || []){
      if (typeof c === 'string') el.addText(c);
      else if (c && c.tagName && c.tagName[0] !== '?') build(c, el);
    }
    return el;
  };
  const roots = nodes.filter(n => typeof n === 'object' && n && n.tagName && n.tagName[0] !== '?');
  if (!roots.length) throw new Error('txml: kein Wurzelelement');
  if (roots.length > 1) throw new Error('txml: mehrere Wurzelelemente (' + roots.length + ')');
  doc.documentElement = build(roots[0], null);
  return doc;
}
