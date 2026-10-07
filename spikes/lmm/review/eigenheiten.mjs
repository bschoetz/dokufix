// Which of Mermaid's peculiarities matter for the columns: the exact replica with one peculiarity changed at a time, against the fixtures
// (column order of Mermaid's raw positions; laid-out XML, estimated) and against arielle on random models.
import fs from 'node:fs';
import { arielleExakt as arielle } from './ranks-exakt.mjs';
import { randomModel, sameOrder } from './gen.mjs';
const R = '/home/user/dokufix/';
const { fixtureNames, readFixture, readModel, layOut, expectedFile } = await import(R + 'tests/bpmn-fixtures.mjs');
const src = fs.readFileSync(new URL('./ranks-exakt.mjs', import.meta.url), 'utf8');
const variants = {
  'ohne Beschriftungsknoten (Beschriftung kostet keine Spalte)': [["if (!f.name.replace(/[\"<>&#`\\\\]/g, ' ').trim()){", "if (true){"]],
  'Beschriftung über Bahngrenze in der Bahn der Quelle statt des Ziels': [["lane: a.lane === b.lane ? a.lane : b.lane", "lane: a.lane"]],
  'Startknoten der Tiefensuche in XML-Reihenfolge statt Bahnreihenfolge': [["const vertices = [...nodes, ...labels];", "nodes.sort((p, q) => cmp(p.key.length, q.key.length) || cmp(p.key, q.key)); const vertices = [...nodes, ...labels];"]],
  'Tiefensuche ohne „zuerst Knoten ohne eingehenden Fluss“': [["[...nodes.filter(v => !v.in), ...nodes.filter(v => v.in)]", "nodes"]],
  'Kanten der Tiefensuche in Flussreihenfolge statt nach Ziel sortiert': [["for (const v of vertices) v.out.sort((p, q) => byPos(p.dst, q.dst));", ""]],
  'Generation in Zahlenordnung der Schlüssel (n2 vor n10) statt Zeichenkettenordnung': [["sort: [1, n.key]", "sort: [1, Number(n.key.slice(1))]"]],
  'Beschriftungen nach den Knoten statt davor': [["sort: [0, a.key", "sort: [2, a.key"]],
  'Generation unsortiert (Entdeckungsreihenfolge)': [["let frontier = vertices.filter(v => !v.in).sort(byPos);", "let frontier = vertices.filter(v => !v.in);"], ["frontier = next.sort(byPos);", "frontier = next;"]],
  'Fluss über Bahngrenze schiebt auch eine Spalte weiter': [["r + (w.lane === v.lane ? 1 : 0)", "r + 1"]],
};
const names = fixtureNames();
const fixtures = names.map(name => { const fx = readFixture(name); return { name, fx, model: readModel(fx.xml).model, expected: fs.readFileSync(expectedFile(name, 'estimated'), 'utf8') }; });
const randoms = Array.from({ length: 3000 }, (_, i) => randomModel(i));
const rows = [];
for (const [what, replacements] of Object.entries(variants)){
  let text = src;
  for (const [a, b] of replacements){ if (!text.includes(a)) throw new Error(what + ': ' + a); text = text.replace(a, b); }
  const { arielleExakt: variant } = await import('data:text/javascript,' + encodeURIComponent(text));
  let order = 0, xml = 0, rnd = 0; const differing = [];
  for (const { name, fx, model, expected } of fixtures){
    const rank = variant(model);
    if (sameOrder(model, rank, Object.fromEntries(model.nodes.map(n => [n.key, fx.raw.nodes[n.key].cx])))) order++;
    const raw = { nodes: Object.fromEntries(model.nodes.map(n => [n.key, { cx: rank[n.key] * 100 }])) };
    if (layOut({ ...fx, raw }, 'estimated') === expected) xml++; else differing.push(name);
  }
  for (const m of randoms) if (sameOrder(m, variant(m), arielle(m))) rnd++;
  rows.push([what, order, xml, rnd, differing]);
}
console.log('| Variante | Spaltenordnung gleich (57) | XML gleich (57) | Zufall gleich (3000) | XML anders bei |');
console.log('|---|---|---|---|---|');
for (const [what, order, xml, rnd, differing] of rows) console.log('| ' + what + ' | ' + order + ' | ' + xml + ' | ' + rnd + ' | ' + (differing.length > 6 ? differing.length + ' Fixtures' : differing.join(', ')) + ' |');
