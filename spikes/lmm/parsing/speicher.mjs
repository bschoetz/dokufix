// The results file in a compact form: a result that reads the same model and leftOut as the reference (chromium),
// or as the same library under Node (bun:x → node:x), keeps its status and timings and says "wie" with the
// environment it equals instead of repeating the model. kompakt() before writing, voll() after reading;
// the reference itself (chromium) is never shortened. Shortened on 2026-10-07 from 15 MB, lossless.
const REFERENZ = 'chromium';
const same = (a, b) => a && b && a.status === b.status && JSON.stringify(a.model) === JSON.stringify(b.model) && JSON.stringify(a.leftOut) === JSON.stringify(b.leftOut);

export function kompakt(store){
  const out = { umgebungen: {} };
  for (const [env, slot] of Object.entries(store.umgebungen)){
    if (env === REFERENZ){ out.umgebungen[env] = slot; continue; }
    const node = env.startsWith('bun:') ? 'node:' + env.slice(4) : null;
    const candidates = [REFERENZ, node].filter(e => e && store.umgebungen[e]);
    const results = {};
    for (const [k, r] of Object.entries(slot.results)){
      const hit = r && !r.wie && candidates.find(e => same(r, store.umgebungen[e].results[k]));
      if (hit){ const { model, leftOut, ...rest } = r; results[k] = { ...rest, wie: hit }; }
      else results[k] = r;
    }
    out.umgebungen[env] = { ...slot, results };
  }
  return out;
}

export function voll(store){
  for (const slot of Object.values(store.umgebungen)){
    for (const [k, r] of Object.entries(slot.results)){
      if (!r || !r.wie) continue;
      const src = store.umgebungen[r.wie].results[k];
      const ref = src.wie ? store.umgebungen[src.wie].results[k] : src;
      const { wie, ...rest } = r;
      slot.results[k] = { ...rest, model: ref.model, leftOut: ref.leftOut };
    }
  }
  return store;
}
