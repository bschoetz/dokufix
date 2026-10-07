// @xmldom/xmldom 0.9.12 (MIT), entpackt außerhalb des Repositorys.
import { createRequire } from 'node:module';

const V = '/tmp/claude-0/-home-user-dokufix/c7ad9c8e-4112-59bc-bff9-b496db1abe70/scratchpad/parsing-vendor/xmldom-xmldom-0.9.12/package/';
const require = createRequire(import.meta.url);
const { DOMParser } = require(V + 'lib/index.js');
const pkg = require(V + 'package.json');

export const name = 'xmldom';
export const info = '@xmldom/xmldom ' + pkg.version + ' (' + pkg.license + ')';
export function parse(xml){
  const errors = [];
  const parser = new DOMParser({ onError: (level, message) => { if (level !== 'warning') errors.push(level + ': ' + message); } });
  let doc;
  try { doc = parser.parseFromString(xml, 'application/xml'); } catch (e){ throw new Error('xmldom: ' + (e && e.message || e)); }
  if (errors.length) throw new Error('xmldom: ' + errors.join(' | '));
  return doc;
}
