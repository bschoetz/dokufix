// Quality of every combination of node, flow and rest order, without the invariance runs; one process per rest order:
//   node alle.mjs <rest>   → alle-<rest>.json and a Markdown table
import fs from 'node:fs';
import { measure, row, head } from './messen.mjs';
import { NODE_ORDERS, FLOW_ORDERS } from './varianten.mjs';
const rest = process.argv[2];
const results = [];
console.log(head);
for (const n of NODE_ORDERS) for (const f of FLOW_ORDERS){
  const r = measure([n, f, rest].join('/'), { inv: false });
  results.push(r);
  console.log(row(r) + ' ' + (r.changed.length ? r.changed.join(', ') : ''));
}
fs.writeFileSync(new URL('./alle-' + rest + '.json', import.meta.url), JSON.stringify(results, null, 1));
