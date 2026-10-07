const R = '/home/user/dokufix/';
const src = (await import('node:fs')).readFileSync(new URL('./invariance.mjs', import.meta.url), 'utf8');
const { readFixture, readModel } = await import(R + 'tests/bpmn-fixtures.mjs');
const { DOMParser } = await import(R + 'node_modules/linkedom/esm/index.js');
const xml = readFixture('r05').xml;
const doc = new DOMParser().parseFromString(xml, 'text/xml');
const p = [...doc.getElementsByTagName('*')].find(e => /process$/.test(e.localName || e.nodeName));
console.log('process found:', !!p, p && (p.localName || p.nodeName), 'children:', p && p.children.length);
console.log('model order:', readModel(xml).model.nodes.map(n => n.id + '=' + n.key).join(' '));
