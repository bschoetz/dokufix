// The cases and the storage of the layout workbench (src/werkbank/faelle.js, src/werkbank/speicher.js, story 2.39),
// run in Node: no browser, the storage in memory over the same interface as IndexedDB.
//
//   npm test          (node --test tests/*.test.mjs)
//
// The cases: every row of the plan's matrix (a known case pasted with its ids reordered, a known case with its
// positions, a new revision, an unknown input, no BPMN, a reload with IndexedDB refused, the working state saved,
// cleared and loaded and a wrong one refused, the same input taken twice); the diagram part split off; the
// reference of a case not taken for Ben's version; "changed" against the latest other stand; the frozen layout; the
// package in the old page's format, with the origin.

import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { ohneDi, hatDi, nameAus, einordnen, geaendert, anzeigeName, paketBauen } from '../src/werkbank/faelle.js';
import { speicherImArbeitsspeicher, speicherOeffnen, pruefeZustand, ZUSTAND_FORMAT } from '../src/werkbank/speicher.js';
import { caseFingerprint } from '../src/app/fingerprint.js';
import { readFixture, expectedFile } from './bpmn-fixtures.mjs';
import fs from 'node:fs';

const STAND = 'aaaaaaaa', STAND2 = 'bbbbbbbb';
const T1 = '2026-10-09T10:00:00.000Z', T2 = '2026-10-09T11:00:00.000Z';
const eingabe = name => readFixture(name).xml;
const angeordnet = name => fs.readFileSync(expectedFile(name), 'utf8');

// The sequence flows of every process in reverse order: the same case, written otherwise.
function umgestellt(xml){
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  for (const p of doc.querySelectorAll('*')){
    if (p.localName.replace(/^.*:/, '') !== 'process') continue;
    const flows = [...p.children].filter(e => e.localName.replace(/^.*:/, '') === 'sequenceFlow');
    for (const f of flows.reverse()) p.appendChild(f);
  }
  return doc.toString();
}
// The first task renamed: another case of the same name.
const umbenannt = xml => xml.replace(/(<(?:[\w.-]+:)?task\b[^>]*\bname=")([^"]*)"/, '$1$2 neu"');

test('the diagram part is split off, the rest kept', () => {
  const mit = angeordnet('r01'), ohne = ohneDi(mit);
  assert.ok(hatDi(mit));
  assert.ok(!hatDi(ohne));
  assert.ok(!/BPMNDiagram/.test(ohne));
  assert.equal(caseFingerprint(ohne).hash, caseFingerprint(mit).hash);
  assert.equal(ohneDi(eingabe('r01')), eingabe('r01'));
});

test('the name an input gives itself', () => {
  assert.equal(nameAus('<definitions><process id="p" name=" Urlaub "/></definitions>'), 'Urlaub');
  assert.equal(nameAus('<definitions name="D"><process id="p"/></definitions>'), 'D');
  assert.equal(nameAus('<definitions><collaboration><participant id="a" name=\'Firma\'/></collaboration><process id="p" name="P"/></definitions>'), 'Firma');
  assert.equal(nameAus('<definitions/>'), null);
});

test('matrix: a known case pasted, ids reordered, joins its case; nothing new', async () => {
  const sp = speicherImArbeitsspeicher();
  const a = await sp.aufnehmen(eingabe('r01'), { name: 'r01', herkunft: 'sauber', stand: STAND, jetzt: T1 });
  assert.equal(a.art, 'neu');
  const xml = umgestellt(eingabe('r01'));
  assert.notEqual(xml, eingabe('r01'));
  const b = await sp.aufnehmen(xml, { stand: STAND, jetzt: T2 });
  assert.equal(b.art, 'bekannt');
  assert.equal(b.fall.fall, a.fall.fall);
  assert.equal(b.fassung, null);
  assert.equal((await sp.faelle()).length, 1);
  assert.equal((await sp.feedbacks()).length, 0);
});

test('matrix: a known case with its positions joins its case, its DI kept as Ben\'s version', async () => {
  const sp = speicherImArbeitsspeicher();
  await sp.aufnehmen(eingabe('r01'), { name: 'r01', herkunft: 'sauber', stand: STAND, jetzt: T1 });
  const mit = angeordnet('r01');
  const r = await sp.aufnehmen(mit, { stand: STAND, jetzt: T2 });
  assert.equal(r.art, 'bekannt');
  assert.equal((await sp.faelle()).length, 1);
  const e = await sp.feedback(r.fall.fall, STAND);
  assert.equal(e.bearbeitet, mit);
  assert.equal(e.geaendert, T2);
  assert.equal(e.soll, null);
  // A comment stays when a version comes in, and the case keeps its input without positions.
  await sp.legeFeedback({ fall: r.fall.fall, stand: STAND, kommentar: 'zu breit' });
  await sp.aufnehmen(mit, { stand: STAND, jetzt: T2, soll: false });
  const e2 = await sp.feedback(r.fall.fall, STAND);
  assert.equal(e2.kommentar, 'zu breit');
  assert.equal(e2.soll, false);
  assert.ok(!hatDi((await sp.fall(r.fall.fall)).eingabe));
});

test('a case\'s reference is not taken for Ben\'s version; a new case with positions brings its version', async () => {
  const sp = speicherImArbeitsspeicher();
  const ref = angeordnet('r01');
  await sp.aufnehmen(eingabe('r01'), { name: 'x-r01', herkunft: 'extern', referenz: ref, stand: STAND, jetzt: T1 });
  assert.equal((await sp.aufnehmen(ref, { stand: STAND })).fassung, null);
  assert.equal((await sp.feedbacks()).length, 0);
  const n = await sp.aufnehmen(angeordnet('blackbox-kredit'), { stand: STAND, jetzt: T1 });
  assert.equal(n.art, 'neu');
  assert.equal((await sp.feedback(n.fall.fall, STAND)).bearbeitet, angeordnet('blackbox-kredit'));
});

test('matrix: a known name with another fingerprint is a new revision, linked to the one before', async () => {
  const sp = speicherImArbeitsspeicher();
  const a = await sp.aufnehmen(eingabe('r01'), { name: 'r01', herkunft: 'sauber', jetzt: T1 });
  const b = await sp.aufnehmen(umbenannt(eingabe('r01')), { name: 'r01', jetzt: T2 });
  assert.equal(b.art, 'revision');
  assert.notEqual(b.fall.fall, a.fall.fall);
  assert.equal(b.fall.vorher, a.fall.fall);
  assert.equal(b.fall.revision, 2);
  assert.equal(b.fall.herkunft, 'eigen');
  const c = await sp.aufnehmen(umbenannt(umbenannt(eingabe('r01'))), { name: 'r01', jetzt: T2 });
  assert.equal(c.fall.vorher, b.fall.fall);
  const liste = (await sp.faelle()).map(anzeigeName).sort();
  assert.deepEqual(liste, ['r01', 'r01 (2)', 'r01 (3)']);
});

test('matrix: an unknown input is a new case "eigen", laid out at the stand and frozen', async () => {
  const sp = speicherImArbeitsspeicher();
  const r = await sp.aufnehmen(eingabe('blackbox-kredit'), { jetzt: T1 });
  assert.equal(r.art, 'neu');
  assert.equal(r.fall.herkunft, 'eigen');
  assert.equal(r.fall.revision, 1);
  assert.equal(r.fall.vorher, null);
  assert.ok(r.fall.name);
  const erste = { fall: r.fall.fall, stand: STAND, xml: angeordnet('blackbox-kredit'), angeordnet: T1, ms: 12 };
  assert.deepEqual(await sp.einfrieren(erste), erste);
  // A second layout at the same stand does not replace the first.
  assert.deepEqual(await sp.einfrieren({ ...erste, xml: '<anders/>', angeordnet: T2 }), erste);
  assert.deepEqual(await sp.anordnung(r.fall.fall, STAND), erste);
});

test('matrix: no BPMN makes no case, with a message', async () => {
  const sp = speicherImArbeitsspeicher();
  for (const xml of ['<root><process/></root>', 'kein XML <', '', '<definitions xmlns="urn:x"/>']){
    const r = await sp.aufnehmen(xml, { stand: STAND });
    assert.ok(r.fehler, xml);
    assert.equal(r.fall, undefined);
  }
  assert.equal((await sp.faelle()).length, 0);
  assert.ok(einordnen('<a/>', []).fehler);
});

test('matrix: IndexedDB refused gives the store in memory, with a warning', async () => {
  const refused = { open(){ const req = {}; setTimeout(() => { req.error = new Error('SecurityError'); req.onerror(); }); return req; } };
  const sp = await speicherOeffnen({ idb: refused });
  assert.equal(sp.art, 'arbeitsspeicher');
  assert.match(sp.warnung, /SecurityError/);
  const throws = await speicherOeffnen({ idb: { open(){ throw new Error('InvalidStateError'); } } });
  assert.match(throws.warnung, /InvalidStateError/);
  const none = await speicherOeffnen({ idb: null });
  assert.match(none.warnung, /IndexedDB/);
  await none.aufnehmen(eingabe('r01'), {});
  assert.equal((await none.faelle()).length, 1);
});

// A store with two cases, a layout at two stands, comments and an edit.
async function gefuellt(){
  const sp = speicherImArbeitsspeicher();
  const a = (await sp.aufnehmen(eingabe('r01'), { name: 'r01', herkunft: 'sauber', jetzt: T1 })).fall;
  const b = (await sp.aufnehmen(eingabe('blackbox-kredit'), { jetzt: T1 })).fall;
  await sp.einfrieren({ fall: a.fall, stand: STAND, xml: angeordnet('r01'), angeordnet: T1, ms: 5, brueche: 0 });
  await sp.einfrieren({ fall: a.fall, stand: STAND2, xml: angeordnet('r01'), angeordnet: T2, ms: 5, brueche: 0 });
  await sp.einfrieren({ fall: b.fall, stand: STAND2, xml: angeordnet('blackbox-kredit'), angeordnet: T2, ms: 9, brueche: 1 });
  await sp.legeFeedback({ fall: a.fall, stand: STAND2, kommentar: 'gut', geaendert: T2 });
  await sp.legeFeedback({ fall: b.fall, stand: STAND2, bearbeitet: angeordnet('blackbox-kredit'), kommentar: '', geaendert: T2 });
  await sp.legeArchiv({ fall: a.fall, id: 'a-1', art: 'anordnung', xml: '<alt/>' });
  return { sp, a, b };
}

test('matrix: after a reload every case is there (the same interface again)', async () => {
  const { sp } = await gefuellt();
  const z = await sp.zustand(T2);
  // A reload is a new page over the same data: here a new store loaded with what the first held.
  const neu = speicherImArbeitsspeicher();
  await neu.laden(z);
  assert.deepEqual(await neu.zustand(T2), z);
});

test('matrix: the working state saved, cleared and loaded is the same store; a wrong one is refused', async () => {
  const { sp } = await gefuellt();
  const z = JSON.parse(JSON.stringify(await sp.zustand(T2)));
  assert.equal(z.format, ZUSTAND_FORMAT);
  assert.equal(z.faelle.length, 2);
  assert.equal(z.anordnungen.length, 3);
  assert.equal(z.feedback.length, 2);
  assert.equal(z.archiv.length, 1);
  await sp.leeren();
  assert.equal((await sp.faelle()).length, 0);
  await sp.laden(z);
  assert.deepEqual(await sp.zustand(T2), z);
  for (const bad of [null, {}, { format: 'dokufix-layout-feedback', version: 1 }, { ...z, version: 2 }, { ...z, faelle: 'x' },
    { ...z, anordnungen: [{ fall: 'nope', stand: STAND, xml: '' }] }, { ...z, feedback: [{ fall: z.faelle[0].fall }] }]){
    await assert.rejects(sp.laden(bad), /Kein Arbeitsstand der Werkbank/);
    assert.deepEqual(await sp.zustand(T2), z);
  }
  assert.throws(() => pruefeZustand({ format: ZUSTAND_FORMAT, version: 1, faelle: [{ fall: 'f' }] }), /ohne Name/);
});

test('matrix: the same input taken twice makes no duplicate', async () => {
  const sp = speicherImArbeitsspeicher();
  for (let i = 0; i < 2; i++){
    await sp.aufnehmen(eingabe('r01'), { name: 'r01', herkunft: 'sauber', stand: STAND, jetzt: T1 });
    await sp.aufnehmen(angeordnet('r01'), { stand: STAND, jetzt: T1, soll: false });
  }
  const z = await sp.zustand(T1);
  assert.equal(z.faelle.length, 1);
  assert.equal(z.feedback.length, 1);
});

test('"changed" is measured against the latest other stand stored', async () => {
  const L = (stand, xml, at) => ({ fall: 'f', stand, xml, angeordnet: at });
  assert.deepEqual(geaendert([], STAND), { art: 'offen', gegen: null });
  assert.deepEqual(geaendert([L(STAND, 'x', T1)], STAND), { art: 'neu', gegen: null });
  assert.deepEqual(geaendert([L(STAND, 'x', T1), L(STAND2, 'x', T2)], STAND2), { art: 'gleich', gegen: STAND });
  assert.deepEqual(geaendert([L(STAND, 'x', T1), L(STAND2, 'y', T2)], STAND2), { art: 'anders', gegen: STAND });
  // Against the latest of the other stands, not the first.
  assert.deepEqual(geaendert([L('c', 'y', T1), L(STAND, 'x', T2), L(STAND2, 'x', '2026-10-09T12:00:00.000Z')], STAND2), { art: 'gleich', gegen: STAND });
});

test('the package in the old page\'s format, with the origin, for the cases with feedback at the stand', async () => {
  const { sp, a, b } = await gefuellt();
  const { paket, ohneAnordnung } = paketBauen({ stand: STAND2, faelle: await sp.faelle(), layouts: await sp.anordnungen(), feedback: await sp.feedbacks(), jetzt: T2 });
  assert.deepEqual(ohneAnordnung, []);
  assert.equal(paket.format, 'dokufix-layout-feedback');
  assert.equal(paket.version, 1);
  assert.equal(paket.exportiert, T2);
  assert.deepEqual(paket.satz, { id: 'werkbank-' + STAND2, variant: 'werkbank', rules: null, angeordnet: T2, beispiele: [b.name, 'r01'].sort((x, y) => x.localeCompare(y)), logik: STAND2 });
  const byName = Object.fromEntries(paket.beispiele.map(x => [x.name, x]));
  assert.equal(byName.r01.herkunft, 'sauber');
  assert.equal(byName.r01.bearbeitet, null);
  assert.equal(byName.r01.kommentar, 'gut');
  assert.equal(byName.r01.erzeugt, angeordnet('r01'));
  assert.equal(byName.r01.eingabe, a.eingabe);
  assert.equal(byName[b.name].herkunft, 'eigen');
  assert.equal(byName[b.name].brueche, 1);
  for (const x of paket.beispiele) for (const k of ['name', 'paket', 'brueche', 'eingabe', 'erzeugt', 'bearbeitet', 'kommentar', 'geaendert', 'herkunft']) assert.ok(k in x, k);
  // Nothing at the first stand but a layout: no package. Feedback without a layout at the stand stays out.
  assert.equal(paketBauen({ stand: STAND, faelle: await sp.faelle(), layouts: await sp.anordnungen(), feedback: await sp.feedbacks() }).paket, null);
  await sp.legeFeedback({ fall: b.fall, stand: STAND, kommentar: 'ohne Bild' });
  assert.deepEqual(paketBauen({ stand: STAND, faelle: await sp.faelle(), layouts: await sp.anordnungen(), feedback: await sp.feedbacks() }).ohneAnordnung, [b.name]);
});
