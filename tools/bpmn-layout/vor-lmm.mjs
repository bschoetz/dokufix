// Die Stände vor LMM, für die Sichtung der Bilder, die der Umbau außerhalb von BMad (2026-10-07) geändert hat. Jede
// Eingabe angeordnet mit Mermaids Rohpositionen, die Spike 2.26 und die Git-Geschichte der Fixtures aufbewahrt haben:
//   vor-lmm     8266ec4 (Story 2.31 done): die Labelgrößen im Browser gemessen, wie die Seite damals zeichnete
//   nur-messer  d296705 (vor f0ff93e): schon der Messer nach diagram-js in Arial (3597e43, 758b364), noch
//               Mermaids Spalten und die Reihenfolge des XML
// Von vor-lmm nach nur-messer ändert der Messer das Bild, von nur-messer nach produkt LMM und kanonisch().
// Schreibt die Läufe arbeit/<lauf>/ und arbeit/<lauf>.json, für vergleich.mjs und die Review-Seite (review-lmm.mjs).
//   node tools/bpmn-layout/vor-lmm.mjs
// Braucht den Store (die Rohpositionen der übrigen Eingaben liegen nur dort). Prüft sich selbst: die Fixtures
// ergeben je Stand das angeordnete XML, das dieser Commit für sie hält.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DOMParser } from 'linkedom';
import { REPO, ARBEIT, EXTERN_ROOT, INPUTS, laufDir, laufFile, rules, allBreaks } from './lib.mjs';

const STAENDE = [
  { lauf: 'vor-lmm', commit: '8266ec4', files: ['bpmn-layout.js'], expected: '.measured.bpmn', sizes: true },
  { lauf: 'nur-messer', commit: 'd296705', files: ['bpmn-layout.js', 'label-size.js'], expected: '.laid-out.bpmn', sizes: false },
];
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
const breaksOf = await rules();
const SPIKE = EXTERN_ROOT;
const EINGABEN = JSON.parse(fs.readFileSync(path.join(SPIKE, 'eingaben/eingaben.json'), 'utf8')).eingaben;
const FIX = 'tests/fixtures/bpmn-layout/';
// Die Rohpositionen der Fixtures, aus dem letzten Commit, der sie hielt.
const fixtures = Object.keys(JSON.parse(git('show', '8266ec4:' + FIX + 'index.json')).fixtures);
const fixtureJson = (n, ending) => JSON.parse(git('show', '8266ec4:' + FIX + n + ending));

// Rohpositionen und Größen einer Eingabe, wo sie damals lagen.
function rawOf(i){
  const json = f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  const pair = (dir, n) => ({ raw: json(path.join(dir, n + '.raw.json')), sizes: json(path.join(dir, n + '.sizes.json')) });
  if (['pools', 'blackbox', 'angeheftet', 'notizen'].includes(i.set)){
    const base = path.dirname(i.file).startsWith(path.join(REPO, 'tools')) ? path.join(SPIKE, 'eingaben', i.set) : path.dirname(i.file);
    return pair(path.join(base, 'raw-g'), i.name);
  }
  if (i.set === 'extern') return pair(path.join(SPIKE, 'extern/auswahl'), i.name);
  // Eine reparierte Fassung (spike-2-26/eingaben/repariert) hat ihre eigenen Rohpositionen, auch wo ein Fixture
  // desselben Namens die ungültige Fassung hält; die Fixtures des sauberen Satzes nur aus der Git-Geschichte.
  const e = EINGABEN[i.name];
  if (e && !e.dir.endsWith(FIX.slice(0, -1))) return pair(path.resolve(SPIKE, e.dir), i.name);
  if (fixtures.includes(i.name)) return { raw: fixtureJson(i.name, '.raw.json'), sizes: fixtureJson(i.name, '.sizes.json') };
  return { raw: null };
}

for (const st of STAENDE){
  const dir = path.join(ARBEIT, 'staende', st.commit + '-mermaid');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of st.files) fs.writeFileSync(path.join(dir, f), git('show', st.commit + ':src/app/' + f));
  const mod = await import(pathToFileURL(path.join(dir, 'bpmn-layout.js')).href);
  const layOut = (xml, raw, sizes) => {
    const { model } = mod.readProcess(new DOMParser().parseFromString(xml.replace(/&amp;/g, ' '), 'text/xml'));
    const measure = st.sizes ? (t, w) => (w ? sizes['note:' + w + ':' + t] : sizes[t]) || mod.labelSize(t, w) : undefined;
    return { xml: mod.appendDiagram(xml, model, mod.layoutGeometry(model, raw, measure)).xml, model };
  };

  // Selbstprüfung an den Fixtures dieses Commits.
  const own = Object.keys(JSON.parse(git('show', st.commit + ':' + FIX + 'index.json')).fixtures);
  let ok = 0;
  for (const n of own){
    const got = layOut(git('show', st.commit + ':' + FIX + n + '.bpmn'), fixtureJson(n, '.raw.json'), st.sizes ? fixtureJson(n, '.sizes.json') : {}).xml;
    if (got === git('show', st.commit + ':' + FIX + n + st.expected)) ok++; else console.log(st.lauf + ': Fixture anders als in ' + st.commit + ':', n);
  }
  console.log(`${st.lauf}: Selbstprüfung ${ok} von ${own.length} Fixtures wie ${st.commit}`);
  if (ok !== own.length) process.exit(1);

  const out = laufDir(st.lauf);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const result = { lauf: st.lauf, stand: { commit: st.commit, dirty: false, angefragt: st.commit }, logik: 'mermaid-' + st.commit, rules: null, angeordnet: new Date().toISOString(), inputs: {} };
  let missing = 0, errors = 0;
  for (const i of INPUTS.values()){
    if (i.set === 'laufzeit') continue;
    const { raw, sizes } = rawOf(i);
    if (!raw){ missing++; console.log('keine Rohpositionen:', i.name); continue; }
    try {
      const laid = layOut(fs.readFileSync(i.file, 'utf8'), raw, sizes || {});
      fs.writeFileSync(path.join(out, i.name + '.bpmn'), laid.xml);
      result.inputs[i.name] = { set: i.set, extern: i.extern, breaks: allBreaks(breaksOf, laid.xml, laid.model).breaks };
    } catch (e){ errors++; result.inputs[i.name] = { set: i.set, extern: i.extern, error: e.message }; console.log(st.lauf, i.name, 'FEHLER', e.message); }
  }
  fs.writeFileSync(laufFile(st.lauf), JSON.stringify(result, null, 1) + '\n');
  console.log(`${st.lauf}: ${Object.keys(result.inputs).length - errors} Eingaben angeordnet${missing ? ', ' + missing + ' ohne Rohpositionen' : ''}${errors ? ', ' + errors + ' Fehler' : ''}`);
}
