import fs from 'node:fs';
const R = '/home/user/dokufix/';
const { fixtureNames, readFixture, readModel, layOut, expectedFile } = await import(R + 'tests/bpmn-fixtures.mjs');
const src = fs.readFileSync(new URL('./ranks.mjs', import.meta.url), 'utf8');
// Variant with plain code-unit comparison instead of localeCompare
fs.writeFileSync(new URL('./ranks-plain.mjs', import.meta.url), src.replace("const cmp = (a, b) => a.localeCompare(b);", "const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;"));
const { mermaidRanks } = await import('./ranks.mjs');
const { mermaidRanks: plainRanks } = await import('./ranks-plain.mjs');
const names = fixtureNames();
const sign = x => Math.abs(x) < 1 ? 0 : Math.sign(x);
const same = (model, r1, r2) => { const k = model.nodes.map(n => n.key); return k.every(a => k.every(b => sign(r1[a] - r1[b]) === sign(r2[a] - r2[b]))); };
let plainOrder = 0, plainXml = 0, labelDiff = [], backDiff = [], laneCounts = [], maxPerLaneCol = 0, crossSame = 0;
for (const name of names){
  const fx = readFixture(name), model = readModel(fx.xml).model;
  const r = mermaidRanks(model), p = plainRanks(model);
  if (same(model, r, p)) plainOrder++;
  const raw = rk => ({ nodes: Object.fromEntries(model.nodes.map(n => [n.key, { cx: rk[n.key] * 100 }])) });
  if (layOut({ ...fx, raw: raw(p) }, 'estimated') === fs.readFileSync(expectedFile(name, 'estimated'), 'utf8')) plainXml++;
  const nl = mermaidRanks(model, { labelNodes: false });
  if (layOut({ ...fx, raw: raw(nl) }, 'estimated') !== fs.readFileSync(expectedFile(name, 'estimated'), 'utf8')) labelDiff.push(name);
  // Back edges: layout's DFS (from nodes without incoming flow, flows in XML order) vs Mermaid's (sorted by target key)
  const hostOf = new Map((model.boundaries || []).map(b => [b.id, b.host]));
  const flows = model.flows.map(f => ({ ...f, from: hostOf.get(f.from) ?? f.from })).filter(f => f.from !== f.to);
  const out = new Map(model.nodes.map(n => [n.id, []])); for (const f of flows) out.get(f.from).push(f);
  const st = new Map(), back = new Set(); const visit = id => { st.set(id, 1); for (const f of out.get(id)){ const s = st.get(f.to); if (s === 1) back.add(f.id); else if (!s) visit(f.to); } st.set(id, 2); };
  const hasIn = new Set(flows.map(f => f.to)); for (const n of model.nodes) if (!hasIn.has(n.id) && !st.has(n.id)) visit(n.id); for (const n of model.nodes) if (!st.has(n.id)) visit(n.id);
  // Mermaid's: a flow is backward when the ranks go backwards
  const key = new Map(model.nodes.map(n => [n.id, n.key]));
  const mBack = new Set(flows.filter(f => r[key.get(f.to)] <= r[key.get(f.from)] && model.lanes.find(l => l.nodes.includes(f.from)) === model.lanes.find(l => l.nodes.includes(f.to))).map(f => f.id));
  const lBackSameLane = new Set([...back].filter(id => { const f = flows.find(x => x.id === id); return model.lanes.find(l => l.nodes.includes(f.from)) === model.lanes.find(l => l.nodes.includes(f.to)); }));
  if ([...mBack].sort().join() !== [...lBackSameLane].sort().join()) backDiff.push(name);
}
console.log('localeCompare -> Codepunkt-Vergleich: Ordnung gleich', plainOrder + '/' + names.length, 'XML gleich', plainXml);
console.log('ohne Beschriftungsknoten abweichendes XML:', labelDiff);
console.log('Rückwärtskanten (innerhalb einer Bahn) verschieden:', backDiff.length, backDiff);
