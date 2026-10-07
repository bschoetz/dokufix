// Random models in the shape readProcess() gives, richer than ../random.mjs:
// several pools, lanes whose nodes stand in any order, empty lanes (hold),
// boundary events with flows (also back into the host), parallel flows of one
// pair (sometimes ten or more, for Mermaid's "L_a_b_10" < "L_a_b_2"), flows in
// both directions, isolated nodes, names q() turns into a blank.
export function makeRandom(seed0){
  let seed = seed0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = n => Math.floor(rnd() * n);
  return { rnd, pick };
}

export function randomModel(i, opts = {}){
  const { rnd, pick } = makeRandom(1000003 * (i + 1) + 17);
  const big = opts.big ?? rnd() < 0.15;
  const n = big ? 12 + pick(40) : 2 + pick(14);
  const poolCount = 1 + (rnd() < 0.3 ? pick(3) : 0);
  const types = ['task', 'task', 'task', 'gateway', 'inter'];
  const names = ['Schritt', 'ja', 'nein', '', '', '#', '"', '<b>', 'a & b', 'x `y`', '\\'];
  const flowName = () => { const r = rnd(); return r < 0.6 ? '' : r < 0.85 ? names[1 + pick(2)] : names[5 + pick(6)]; };
  const nodes = Array.from({ length: n }, (_, j) => ({ id: 'X' + j, name: 'Schritt ' + j, type: j === 0 ? 'start' : j === n - 1 ? 'end' : types[pick(types.length)], key: 'n' + (j + 1) }));
  const pools = Array.from({ length: poolCount }, (_, p) => ({ id: 'P' + p, name: 'Pool ' + p }));
  const lanes = [];
  for (let p = 0; p < poolCount; p++) for (let k = 1 + pick(3); k > 0; k--) lanes.push({ id: 'L' + lanes.length, name: 'Bahn ' + lanes.length, nodes: [], key: 'l' + (lanes.length + 1), pool: p });
  for (const nd of nodes) lanes[pick(lanes.length)].nodes.push(nd.id);
  // The nodes of a lane in any order, as flowNodeRef may list them.
  for (const l of lanes) for (let k = l.nodes.length - 1; k > 0; k--){ const j = pick(k + 1); [l.nodes[k], l.nodes[j]] = [l.nodes[j], l.nodes[k]]; }
  for (const l of lanes) if (!l.nodes.length) l.hold = 'h' + l.key.slice(1);
  // Boundary events on tasks, a few.
  const boundaries = [];
  for (const nd of nodes) if (nd.type === 'task' && rnd() < 0.15) boundaries.push({ id: 'B' + boundaries.length, name: rnd() < 0.5 ? 'Frist' : '', host: nd.id, cancel: true });
  const sources = nodes.map(nd => nd.id).concat(boundaries.map(b => b.id));
  const flows = []; let f = 0;
  const add = (from, to) => flows.push({ id: 'F' + f++, from, to, name: flowName() });
  for (let j = 1; j < n; j++) if (rnd() < 0.9) add('X' + pick(j), 'X' + j);
  for (let k = pick(Math.ceil(n / 2) + 1); k > 0; k--){ const a = sources[pick(sources.length)], b = 'X' + pick(n); if (a !== b) add(a, b); }
  // Flows of a boundary event, some back into the host (left out by Mermaid's text).
  for (const b of boundaries){ if (rnd() < 0.7) add(b.id, 'X' + pick(n)); if (rnd() < 0.2) add(b.id, b.host); }
  // Parallel flows: a pair repeated, now and then ten or more times.
  if (flows.length && rnd() < 0.4){ const fl = flows[pick(flows.length)]; for (let k = (rnd() < 0.1 ? 10 : 1) + pick(3); k > 0; k--) add(fl.from, fl.to); }
  // A flow in both directions.
  if (flows.length && rnd() < 0.3){ const fl = flows[pick(flows.length)]; if (!boundaries.some(b => b.id === fl.from)) add(fl.to, fl.from); }
  return { pools, lanes, nodes, flows, boundaries, messages: [], notes: [], associations: [] };
}

// The order of the ranks of the real nodes, as buildGrid() reads it: equal when every pair has the same sign.
export const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const sign = x => Math.abs(x) < 1 ? 0 : Math.sign(x);
export const sameOrder = (model, r1, r2) => { const k = model.nodes.map(n => n.key); return k.every(a => k.every(b => sign(r1[a] - r1[b]) === sign(r2[a] - r2[b]))); };
