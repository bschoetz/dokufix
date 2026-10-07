const { mermaidRanks } = await import('./ranks.mjs');
const { mermaidRanks: plainRanks } = await import('./ranks-plain.mjs');
const src = (await import('node:fs')).readFileSync(new URL('./random.mjs', import.meta.url), 'utf8');
const gen = src.slice(src.indexOf('let seed'), src.indexOf('const PAGE'));
const { randomModel } = await import('data:text/javascript,' + encodeURIComponent(gen + '\nexport { randomModel };'));
let same = 0; const sign = x => Math.sign(x);
for (let i = 0; i < 2000; i++){ const m = randomModel(i), a = mermaidRanks(m), b = plainRanks(m), k = m.nodes.map(n => n.key); if (k.every(x => k.every(y => sign(a[x] - a[y]) === sign(b[x] - b[y])))) same++; }
console.log('2000 Zufallsmodelle, localeCompare vs. Codepunkt: gleich', same);
