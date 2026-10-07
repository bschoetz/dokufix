// fast-xml-parser 5.11.2 (MIT), entpackt außerhalb des Repositorys. Erst der
// XMLValidator, dann der XMLParser mit preserveOrder, Attributen, ohne
// Trimmen und ohne Typumwandlung; der Baum wird zum minidom.
import { createRequire } from 'node:module';
import { Element, Document } from './minidom.mjs';

const V = '/tmp/claude-0/-home-user-dokufix/c7ad9c8e-4112-59bc-bff9-b496db1abe70/scratchpad/parsing-vendor/fast-xml-parser-5.11.2/package/';
const { XMLParser, XMLValidator } = createRequire(import.meta.url)(V + 'lib/fxp.cjs');
const pkg = createRequire(import.meta.url)(V + 'package.json');

export const name = 'fxp';
export const info = 'fast-xml-parser ' + pkg.version + ' (' + pkg.license + ')';
const parser = new XMLParser({
  preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', trimValues: false, parseTagValue: false, parseAttributeValue: false,
  processEntities: true, htmlEntities: false, cdataPropName: '#cdata', commentPropName: '#comment', ignoreDeclaration: true, ignorePiTags: true,
  alwaysCreateTextNode: true, removeNSPrefix: false, allowBooleanAttributes: false,
});
export function parse(xml){
  const v = XMLValidator.validate(xml);
  if (v !== true) throw new Error('fxp: ' + (v && v.err ? v.err.code + ' ' + v.err.msg + ' (Zeile ' + v.err.line + ')' : JSON.stringify(v)));
  let nodes;
  try { nodes = parser.parse(xml); } catch (e){ throw new Error('fxp: ' + (e && e.message || e)); }
  const doc = new Document();
  const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? ('#text' in n ? String(n['#text']) : '') : String(n ?? '');
  const build = (node, parent) => {
    const tag = Object.keys(node).find(k => k !== ':@');
    const el = new Element(tag, Object.fromEntries(Object.entries(node[':@'] || {}).map(([k, v]) => [k, String(v)])), parent);
    for (const c of node[tag] || []){
      if ('#text' in c) el.addText(String(c['#text']));
      else if ('#cdata' in c) el.addText(text(c['#cdata']));
      else if ('#comment' in c) continue;
      else build(c, el);
    }
    return el;
  };
  const roots = nodes.filter(n => !('#text' in n) && !('#comment' in n) && !('#cdata' in n));
  if (!roots.length) throw new Error('fxp: kein Wurzelelement');
  doc.documentElement = build(roots[0], null);
  return doc;
}
