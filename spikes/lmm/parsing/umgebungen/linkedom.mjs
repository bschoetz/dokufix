// linkedom, wie tests/bpmn-fixtures.mjs es nutzt (aus node_modules des Repositorys).
import { DOMParser } from '/home/user/dokufix/node_modules/linkedom/esm/index.js';
import { createRequire } from 'node:module';

const pkg = createRequire(import.meta.url)('/home/user/dokufix/node_modules/linkedom/package.json');
export const name = 'linkedom';
export const info = 'linkedom ' + pkg.version + ' (' + pkg.license + ')';
export const parse = xml => new DOMParser().parseFromString(xml, 'application/xml');
