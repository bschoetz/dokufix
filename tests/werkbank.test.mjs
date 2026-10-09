// The cases and the storage of the layout workbench (src/werkbank/faelle.js, src/werkbank/speicher.js, story 2.39),
// run in Node: no browser, the storage in memory over the same interface as IndexedDB.
//
//   npm test          (node --test tests/*.test.mjs)
//
// The cases: every row of the plan's matrix (a known case pasted with its ids reordered, a known case with its
// positions, a new revision, an unknown input, no BPMN, a reload with IndexedDB refused, the working state saved,
// cleared and loaded and a wrong one refused, the same input taken twice); the diagram part split off; the
// reference of a case not taken for Ben's version; "changed" against the latest other stand; the frozen layout; the
// package in the old page's format, with the origin. And the page as tools/werkbank/bauen.mjs builds it: every own
// input without coordinates; dist/ without any external input, by name or by case; --mit-extern with all. Paste and
// upload with the switch (Ben, 2026-10-09): to an old case by the fingerprint without lanes, as a new case without
// it, nothing stored where none fits, the choice, the assignment by hand. A pasted case's package evaluated by
// tools/bpmn-layout/feedback-auswerten.mjs, and an old package without the origin. The import from a work folder of
// its own (tools/werkbank/import.mjs): the latest edit as Ben's version with soll false, the rest archived, layouts
// once per content with their stands, variant comparisons as text; taken into the store twice without duplicates.
// The view of story 2.40 (src/werkbank/ebenen.js): every layer at its own origin, the view kept relative to it, so a
// version shifted as a whole does not jump; the fit to the common extent; the marking per layer, the same sets
// tools/bpmn-layout/feedback-auswerten.mjs lists (src/bpmn-tools/aenderungen.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser, parseHTML } from 'linkedom';
import { ohneDi, hatDi, nameAus, einordnen, geaendert, anzeigeName, paketBauen, ohneBahnen, kandidaten, zeichnungPruefen } from '../src/werkbank/faelle.js';
import { speicherImArbeitsspeicher, speicherOeffnen, pruefeZustand, ZUSTAND_FORMAT } from '../src/werkbank/speicher.js';
import { caseFingerprint } from '../src/app/fingerprint.js';
import { ursprung, ausdehnung, einpassen, relativ, absolut, markenFuer, leinwand, ebeneFuerTaste } from '../src/werkbank/ebenen.js';
import { aenderungen, readDi } from '../src/bpmn-tools/aenderungen.js';
import { readProcess } from '../src/app/bpmn-layout.js';
import { parseXml } from '../src/app/xml-parser.js';
import { readFixture, expectedFile } from './bpmn-fixtures.mjs';
import { INPUTS, ARBEIT, externFehlt, logikOf } from '../tools/bpmn-layout/lib.mjs';
import { bauen, eingaben as eingabenDerSeite, OUT_ALLES } from '../tools/werkbank/bauen.mjs';
import { REPO } from '../tools/seiten.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

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

test('many inputs at once: the cases read once, a known one joins, a changed one of the same name is a revision', async () => {
  const sp = speicherImArbeitsspeicher();
  const eingebaut = [{ xml: eingabe('r01'), name: 'r01', herkunft: 'sauber' }, { xml: eingabe('r02'), name: 'r02', herkunft: 'sauber' }];
  assert.deepEqual((await sp.aufnehmenViele(eingebaut, T1)).map(r => r.art), ['neu', 'neu']);
  assert.deepEqual((await sp.aufnehmenViele(eingebaut, T2)).map(r => r.art), ['bekannt', 'bekannt']);
  const r = await sp.aufnehmenViele([{ xml: umbenannt(eingabe('r01')), name: 'r01', herkunft: 'sauber' }, { xml: 'nix', name: 'kaputt' }], T2);
  assert.equal(r[0].art, 'revision');
  assert.equal(r[0].fall.herkunft, 'sauber');
  assert.ok(r[1].fehler);
  assert.equal((await sp.faelle()).length, 3);
});

// ---------- the page as built ----------
const dataOf = html => JSON.parse(parseHTML(html).document.getElementById('werkbank-data').textContent);
const eigene = [...INPUTS.values()].filter(i => !i.extern), externe = [...INPUTS.values()].filter(i => i.extern);

test('the inputs of the page: every own one without coordinates, hund2 with Ben\'s hand layout as reference', () => {
  const list = eingabenDerSeite();
  assert.deepEqual(list.map(e => e.name), eigene.map(i => i.name));
  assert.ok(list.length >= 94, String(list.length));
  for (const e of list) assert.ok(!hatDi(e.xml), e.name);
  assert.ok(list.find(e => e.name === 'hund2').referenz.includes('BPMNShape'));
  assert.ok(list.some(e => e.satz === 'laufzeit') && list.some(e => e.satz === 'einzeln'));
});

test('dist/: the page holds no external input, by name or by case', async () => {
  const html = await bauen();
  const data = dataOf(html);
  assert.equal(data.mitExtern, false);
  assert.equal(data.stand, logikOf(path.join(REPO, 'src/app')));
  assert.deepEqual(data.eingaben.map(e => e.name), eigene.map(i => i.name));
  for (const i of externe) assert.ok(!html.includes(i.name), i.name);
  if (!externe.length) return;
  const fremd = new Set(externe.map(i => caseFingerprint(fs.readFileSync(i.file, 'utf8'))?.hash).filter(Boolean));
  for (const e of data.eingaben) assert.ok(!fremd.has(caseFingerprint(e.xml).hash), e.name);
  for (const h of fremd) assert.ok(!html.includes(h) && !html.includes(h.slice(0, 12)), h);
});

test('--mit-extern: the page holds every input, the external ones with their hand layouts', { skip: externFehlt() && 'no external inputs here' }, async () => {
  const data = dataOf(await bauen({ mitExtern: true }));
  assert.equal(data.mitExtern, true);
  assert.deepEqual(data.eingaben.map(e => e.name), [...INPUTS.keys()]);
  for (const i of externe) assert.equal(!!data.eingaben.find(e => e.name === i.name).referenz, !!i.ref, i.name);
  assert.equal(OUT_ALLES, path.join(ARBEIT, 'bpmn-layout-werkbank-alles.html'));
});

// ---------- paste and upload with the switch (Ben, 2026-10-09) ----------
test('to an old case: a laid-out version whose gateway moved lane joins by the fingerprint without lanes', async () => {
  const sp = speicherImArbeitsspeicher();
  const hund = (await sp.aufnehmen(eingabe('hund'), { name: 'hund', herkunft: 'sauber' })).fall;
  const mit = angeordnet('hund');
  assert.notEqual(caseFingerprint(mit).hash, hund.fall);
  assert.equal(ohneBahnen(mit).hash, ohneBahnen(eingabe('hund')).hash);
  const r = await sp.aufnehmen(mit, { modus: 'zuordnen', stand: STAND, jetzt: T2 });
  assert.equal(r.art, 'bekannt');
  assert.equal(r.ueber, 'bahnen');
  assert.equal(r.fall.fall, hund.fall);
  assert.equal((await sp.feedback(hund.fall, STAND)).bearbeitet, mit);
  assert.equal((await sp.faelle()).length, 1);
});

test('to an old case, several fit without lanes: open, each offered with why, assignable', async () => {
  const sp = speicherImArbeitsspeicher();
  await sp.aufnehmenViele(['r19', 'r20'].map(n => ({ xml: eingabe(n), name: n, herkunft: 'sauber' })));
  const ohneRefs = eingabe('r19').replace(/<((?:[\w.-]+:)?flowNodeRef)\b[^>]*>[\s\S]*?<\/\1>\s*/g, '');
  const r = await sp.aufnehmen(ohneRefs, { modus: 'zuordnen', stand: STAND });
  assert.equal(r.art, 'offen');
  assert.deepEqual(r.kandidaten.map(k => [k.fall.name, k.warum]).sort(), [['r19', 'gleich ohne Bahnzugehörigkeit'], ['r20', 'gleich ohne Bahnzugehörigkeit']]);
  const z = await sp.zuordnen(ohneRefs, r.kandidaten[0].fall.fall, { stand: STAND });
  assert.ok(!z.fehler);
});

test('as a new case: no matching without lanes; an identical case is still not stored twice', async () => {
  const sp = speicherImArbeitsspeicher();
  await sp.aufnehmen(eingabe('hund'), { name: 'hund', herkunft: 'sauber' });
  const r = await sp.aufnehmen(angeordnet('hund'), { name: 'hund-neu', modus: 'neu', stand: STAND });
  assert.equal(r.art, 'neu');
  assert.equal((await sp.faelle()).length, 2);
  const gleich = await sp.aufnehmen(umgestellt(eingabe('hund')), { name: 'hund-nochmal', modus: 'neu' });
  assert.equal(gleich.art, 'bekannt');
  assert.equal((await sp.faelle()).length, 2);
});

test('to an old case, none fits: nothing stored, the choice offers the same name first, then the nearest by shape', async () => {
  const sp = speicherImArbeitsspeicher();
  for (const n of ['r01', 'r02', 'hund', 'blackbox-kredit']) await sp.aufnehmen(eingabe(n), { name: n, herkunft: 'sauber' });
  const fremd = umbenannt(eingabe('r02'));
  const r = await sp.aufnehmen(fremd, { modus: 'zuordnen', stand: STAND });
  assert.equal(r.art, 'offen');
  assert.equal(r.kandidaten[0].fall.name, 'r02');
  assert.match(r.kandidaten[0].warum, /100 % nach der Form/);
  assert.equal((await sp.faelle()).length, 4);
  const benannt = kandidaten(fremd, await sp.faelle(), 2, 'hund');
  assert.deepEqual(benannt.map(k => k.warum.replace(/\d+ %/, 'n %')), ['gleicher Name', 'n % nach der Form', 'n % nach der Form']);
  assert.equal(benannt[0].fall.name, 'hund');
});

test('assigned by hand: with positions Ben\'s version of the chosen case, without a new revision of it, no duplicate', async () => {
  const sp = speicherImArbeitsspeicher();
  const r02 = (await sp.aufnehmen(eingabe('r02'), { name: 'r02', herkunft: 'sauber' })).fall;
  const fremd = umbenannt(eingabe('r02'));
  const rev = await sp.zuordnen(fremd, r02.fall, { stand: STAND, jetzt: T2 });
  assert.equal(rev.art, 'revision');
  assert.equal(rev.fall.name, 'r02');
  assert.equal(rev.fall.vorher, r02.fall);
  assert.equal(rev.fall.revision, 2);
  // Again: the revision is known now; nothing new.
  assert.equal((await sp.zuordnen(fremd, r02.fall, { stand: STAND })).art, 'bekannt');
  // With positions of other content: Ben's version of the chosen case.
  const ben = await sp.zuordnen(umbenannt(umbenannt(angeordnet('r02'))), r02.fall, { stand: STAND, jetzt: T2 });
  assert.equal(ben.art, 'bekannt');
  assert.equal(ben.ueber, 'hand');
  assert.ok((await sp.feedback(r02.fall, STAND)).bearbeitet.includes('BPMNShape'));
  assert.equal((await sp.faelle()).length, 2);
  assert.ok((await sp.zuordnen(eingabe('r02'), 'gibt-es-nicht', {})).fehler);
});

// ---------- the package, evaluated ----------
function auswerten(pkg){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'werkbank-paket-'));
  fs.writeFileSync(path.join(dir, 'paket.json'), JSON.stringify(pkg));
  execFileSync(process.execPath, [path.join(REPO, 'tools/bpmn-layout/feedback-auswerten.mjs'), path.join(dir, 'paket.json'), '--out', path.join(dir, 'aus')], { encoding: 'utf8' });
  const out = { uebersicht: fs.readFileSync(path.join(dir, 'aus/uebersicht.md'), 'utf8'), dir: path.join(dir, 'aus') };
  return out;
}
test('a pasted case, laid out, edited and commented, gives a package feedback-auswerten.mjs evaluates like a given one', async () => {
  const sp = speicherImArbeitsspeicher();
  const f = (await sp.aufnehmen(umbenannt(eingabe('r01')), { name: 'ws01', modus: 'neu' })).fall;
  const erzeugt = umbenannt(angeordnet('r01'));
  await sp.einfrieren({ fall: f.fall, stand: STAND, xml: erzeugt, angeordnet: T1, ms: 3 });
  // Ben moves a shape: another x for the first task.
  const bearbeitet = erzeugt.replace(/(<(?:[\w.-]+:)?BPMNShape\b[^>]*bpmnElement="[^"]*"[^>]*>\s*<(?:[\w.-]+:)?Bounds x=")(\d+)/, (m, a, x) => a + (Number(x) + 200));
  assert.notEqual(bearbeitet, erzeugt);
  await sp.legeFeedback({ fall: f.fall, stand: STAND, bearbeitet, kommentar: 'zu eng', geaendert: T2 });
  const { paket } = paketBauen({ stand: STAND, faelle: await sp.faelle(), layouts: await sp.anordnungen(), feedback: await sp.feedbacks(), jetzt: T2 });
  const { uebersicht, dir } = auswerten(paket);
  assert.match(uebersicht, /^# Layout-Feedback werkbank-aaaaaaaa/);
  assert.match(uebersicht, /## ws01\n\nHerkunft eigen; bearbeitet, kommentiert/);
  assert.match(uebersicht, /Brüche: \d+ → \d+/);
  assert.match(uebersicht, /Nähe der erzeugten zur bearbeiteten Fassung/);
  assert.match(uebersicht, /> zu eng/);
  for (const file of ['eingabe.bpmn', 'erzeugt.bpmn', 'bearbeitet.bpmn', 'kommentar.md']) assert.ok(fs.existsSync(path.join(dir, 'ws01', file)), file);
  // A name from the workbench with path characters stays one folder inside the output.
  const schief = auswerten({ ...paket, beispiele: paket.beispiele.map(b => ({ ...b, name: '../Ein-/Verkauf' })) });
  assert.ok(fs.existsSync(path.join(schief.dir, '__Ein-_Verkauf', 'eingabe.bpmn')), fs.readdirSync(schief.dir).join(','));
  assert.ok(!fs.existsSync(path.join(schief.dir, '..', 'eingabe.bpmn')));
  // An old package, without the origin, still reads.
  const alt = { ...paket, beispiele: paket.beispiele.map(({ herkunft, fall, ...b }) => ({ ...b, paket: 'erzeugt' })) };
  assert.match(auswerten(alt).uebersicht, /## ws01\n\nerzeugt; bearbeitet, kommentiert/);
});

// ---------- the import from arbeit/ ----------
// A work folder of its own: two packages (r01 edited in both, the later one wins; r02 commented), two archived sets
// with the same layout of r01 under two stands and hund laid out (a gateway in another lane), and a comparison of two
// variants of which r01 differs.
function arbeitAufZeit(){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'werkbank-arbeit-'));
  const w = (f, x) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), typeof x === 'string' ? x : JSON.stringify(x)); };
  const L1 = angeordnet('r01'), L2 = L1.replace(/(<(?:[\w.-]+:)?Bounds x=")(\d+)/, (m, a, x) => a + (Number(x) + 300));
  const A = L1.replace(/(<(?:[\w.-]+:)?Bounds x=")(\d+)/, (m, a, x) => a + (Number(x) + 10)), B = L1.replace(/(<(?:[\w.-]+:)?Bounds x=")(\d+)/, (m, a, x) => a + (Number(x) + 20));
  const bsp = (name, extra) => ({ name, paket: 'erzeugt', brueche: 0, eingabe: eingabe(name), erzeugt: angeordnet(name), bearbeitet: null, kommentar: '', ...extra });
  w('feedback/s1-2026-10-01/paket.json', { format: 'dokufix-layout-feedback', version: 1, exportiert: T1, satz: { id: 's1', variant: 'A', logik: '1111aaaa' }, beispiele: [bsp('r01', { bearbeitet: A, kommentar: 'alt', geaendert: T1 }), bsp('r02', { kommentar: 'nur Kommentar', geaendert: T1 })] });
  w('feedback/s2-2026-10-02/paket.json', { format: 'dokufix-layout-feedback', version: 1, exportiert: T2, satz: { id: 's2', variant: 'A' }, beispiele: [bsp('r01', { bearbeitet: B, kommentar: 'neu', geaendert: T2 })] });
  w('feedback/leer/uebersicht.md', '#');
  w('archiv/s1.json', { id: 's1', variant: 'A', logik: '1111aaaa', angeordnet: T1, erzeugt: { r01: L1, hund: angeordnet('hund'), r19: angeordnet('r19'), r20: angeordnet('r20') } });
  // An input of r03 that is no input today: Ben's edit of it is a case of its own, not r03's version.
  const alt = umbenannt(eingabe('r03'));
  w('feedback/s3-2026-10-03/paket.json', { format: 'dokufix-layout-feedback', version: 1, exportiert: T1, satz: { id: 's3', variant: 'A' }, beispiele: [{ ...bsp('r03'), eingabe: alt, bearbeitet: umbenannt(angeordnet('r03')), geaendert: T1 }] });
  w('archiv/s2.json', { id: 's2', variant: 'A', angeordnet: T2, erzeugt: { r01: L1 } });
  w('x-varianten.json', { hinweis: '<b>Bau 1</b> &amp; Bau 2', varianten: [{ key: 'v1', titel: 'Erster', dir: 'v1' }, { key: 'v2', dir: 'v2' }] });
  w('v1/r01.bpmn', L1); w('v1/r02.bpmn', angeordnet('r02'));
  w('v2/r01.bpmn', L2); w('v2/r02.bpmn', angeordnet('r02'));
  w('v2.json', { logik: '2222bbbb' });
  return { dir, A, B, L1, L2 };
}
const fallOf = name => caseFingerprint(eingabe(name)).hash;

test('the import from arbeit/: the latest edit per case as Ben\'s version, soll false; the rest archived, layouts once per content', () => {
  const { dir, A, B, L1, L2 } = arbeitAufZeit();
  const out = path.join(dir, 'imp.json');
  const vorher = execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' });
  execFileSync(process.execPath, [path.join(REPO, 'tools/werkbank/import.mjs'), '--aus', out], { env: { ...process.env, DOKUFIX_LAYOUT_ARBEIT: dir }, encoding: 'utf8' });
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' }), vorher);
  const imp = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(imp.format, 'dokufix-layout-werkbank-import');
  assert.deepEqual(imp.eingaben.map(e => e.name), externe.map(i => i.name));
  for (const e of imp.eingaben) assert.ok(!hatDi(e.xml), e.name);
  const altFall = caseFingerprint(umbenannt(eingabe('r03'))).hash;
  assert.deepEqual(imp.faelle.map(f => [f.fall, f.name, f.herkunft]), [[altFall, 'r03', 'archiv']]);
  assert.deepEqual(imp.fehlt, []);
  assert.deepEqual(imp.fassungen.find(f => f.fall === fallOf('r01')), { fall: fallOf('r01'), stand: 's2', bearbeitet: B, kommentar: 'neu', geaendert: T2, soll: false, quelle: 's2' });
  assert.deepEqual(imp.fassungen.map(f => f.fall).sort(), [fallOf('r01'), altFall].sort());
  assert.ok(!imp.fassungen.some(f => f.fall === fallOf('r03')));
  const von = (name, art) => imp.archiv.filter(x => x.fall === fallOf(name) && x.art === art);
  assert.deepEqual(von('r01', 'bearbeitung').map(x => [x.xml === A, x.kommentar, x.stand, x.satz]), [[true, 'alt', '1111aaaa', 's1']]);
  assert.deepEqual(von('r02', 'kommentar').map(x => x.kommentar), ['nur Kommentar']);
  const lay = von('r01', 'anordnung');
  assert.equal(lay.length, 2);
  const l1 = lay.find(x => x.xml === L1), l2 = lay.find(x => x.xml === L2);
  assert.deepEqual(l1.staende, ['1111aaaa', 's2']);
  assert.deepEqual(l1.saetze, ['s1', 's2']);
  assert.deepEqual(l1.varianten, ['A', 'x-varianten: Erster']);
  assert.equal(l1.angeordnet, T1);
  assert.deepEqual(l2.staende, ['2222bbbb']);
  assert.deepEqual(l2.varianten, ['x-varianten: v2']);
  // hund laid out moved a gateway to another lane: its case all the same.
  assert.equal(von('hund', 'anordnung').length, 1);
  // r19 and r20 share the fingerprint without lanes: each layout goes to the input of its name.
  assert.equal(ohneBahnen(eingabe('r19')).hash, ohneBahnen(eingabe('r20')).hash);
  assert.deepEqual(von('r19', 'anordnung').map(x => x.xml === angeordnet('r19')), [true]);
  assert.deepEqual(von('r20', 'anordnung').map(x => x.xml === angeordnet('r20')), [true]);
  // The comparison as text, where the variants differ: r01, not r02.
  assert.deepEqual(von('r01', 'varianten').map(x => [x.hinweis, x.varianten.map(v => v.titel)]), [['Bau 1 & Bau 2', ['Erster', 'v2']]]);
  assert.equal(von('r02', 'varianten').length, 0);
});

test('the import taken into the store: external inputs as cases, Ben\'s version a repair, the archive per case; twice, nothing doubled', async () => {
  const { dir, B } = arbeitAufZeit();
  const out = path.join(dir, 'imp.json');
  execFileSync(process.execPath, [path.join(REPO, 'tools/werkbank/import.mjs'), '--aus', out], { env: { ...process.env, DOKUFIX_LAYOUT_ARBEIT: dir }, encoding: 'utf8' });
  const imp = JSON.parse(fs.readFileSync(out, 'utf8'));
  const sp = speicherImArbeitsspeicher();
  await sp.aufnehmenViele(eingabenDerSeite().map(e => ({ xml: e.xml, name: e.name, herkunft: e.satz, referenz: e.referenz })));
  const r = await sp.importieren(imp);
  const faelle = new Set(externe.map(i => caseFingerprint(fs.readFileSync(i.file, 'utf8'))?.hash).filter(Boolean));
  assert.equal(r.neu, [...faelle].filter(h => !eingabenDerSeite().some(e => caseFingerprint(e.xml).hash === h)).length + 1);
  assert.equal(r.fassungen, 2);
  assert.equal(r.ohneFall, 0);
  // The old input of r03 a revision of r03, with Ben's edit.
  const rev = (await sp.faelle()).find(f => f.fall === caseFingerprint(umbenannt(eingabe('r03'))).hash);
  assert.equal(anzeigeName(rev), 'r03 (2)');
  assert.equal(rev.vorher, fallOf('r03'));
  const e = await sp.feedback(fallOf('r01'), 's2');
  assert.equal(e.bearbeitet, B);
  assert.equal(e.soll, false);
  assert.equal(e.kommentar, 'neu');
  assert.equal((await sp.archiv(fallOf('r01'))).length, imp.archiv.filter(x => x.fall === fallOf('r01')).length);
  const z1 = await sp.zustand(T2);
  await sp.importieren(imp);
  assert.deepEqual(await sp.zustand(T2), z1);
  // A newer edit at the same stand stays.
  await sp.legeFeedback({ fall: fallOf('r01'), stand: 's2', bearbeitet: '<neuer/>', geaendert: '2026-10-10T00:00:00.000Z' });
  await sp.importieren(imp);
  assert.equal((await sp.feedback(fallOf('r01'), 's2')).bearbeitet, '<neuer/>');
  for (const bad of [null, { format: 'x' }, { ...imp, version: 2 }, { ...imp, archiv: 'x' }, { ...imp, fassungen: [{ fall: 'f' }] }]){
    await assert.rejects(sp.importieren(bad), /Kein Import der Werkbank/);
  }
});

// ---------- the view: layers on one canvas (story 2.40) ----------
// Every coordinate of the diagram part moved by dx, dy: the same picture, elsewhere.
const verschoben = (xml, dx, dy) => xml.replace(/(<(?:[\w.-]+:)?(?:Bounds|waypoint)\b[^>]*?)\bx="([-\d.]+)"([^>]*?)\by="([-\d.]+)"/g, (m, a, x, b, y) => `${a}x="${Number(x) + dx}"${b}y="${Number(y) + dy}"`);
const modelOf = xml => readProcess(parseXml(xml)).model;

test('matrix: a version shifted as a whole keeps the view; switching shows the same spot', () => {
  const g = angeordnet('r02'), b = verschoben(g, 150, 40);
  const ug = ursprung(g), ub = ursprung(b);
  assert.deepEqual({ x: ub.x - ug.x, y: ub.y - ug.y, w: ub.w, h: ub.h }, { x: 150, y: 40, w: ug.w, h: ug.h });
  // Zoomed and panned on the generated version, then switched: Ben's shows the same part of the diagram.
  const vb = { x: ug.x + 120, y: ug.y + 30, width: 400, height: 250 };
  const rel = relativ(vb, ug);
  assert.deepEqual(absolut(rel, ub), { x: vb.x + 150, y: vb.y + 40, width: 400, height: 250 });
  assert.deepEqual(relativ(absolut(rel, ub), ub), rel);
  // Shifted as a whole, no node is marked: lanes and order are relative. The flows are, as feedback-auswerten.mjs
  // compares their waypoints as they stand.
  const model = modelOf(eingabe('r02')), a = aenderungen(g, b, model);
  assert.deepEqual([a.lanes, a.x, a.y], [[], [], []]);
  assert.deepEqual([...markenFuer([{ key: 'erzeugt', xml: g }, { key: 'ben', xml: b }], model).get('ben')].sort(), a.flows.map(f => f.id).sort());
});

test('the fit: the common extent, centred, at most 100 %', () => {
  assert.equal(ursprung('<definitions/>'), null);
  assert.deepEqual(ausdehnung([{ x: 0, y: 0, w: 300, h: 100 }, null, { x: 9, y: 9, w: 200, h: 400 }]), { w: 300, h: 400 });
  // Small: 100 %, the extent in the middle of the field.
  const klein = einpassen({ w: 200, h: 100 }, 1000, 500);
  assert.deepEqual(klein, { x: -400, y: -200, width: 1000, height: 500 });
  // Large: scaled to fit with its margin, the aspect of the field kept.
  const gross = einpassen({ w: 4000, h: 1000 }, 1000, 500, 0);
  assert.equal(gross.width / gross.height, 2);
  assert.equal(gross.width, 4000);
  assert.equal(gross.y, (1000 - gross.height) / 2);
});

test('matrix: a task moved to another lane marks the task and its rerouted flow, nothing else; no change marks nothing', () => {
  const g = angeordnet('r02'), model = modelOf(eingabe('r02'));
  const di = readDi(g), lanes = model.lanes.filter(l => !l.synthetic);
  const laneOf = id => lanes.find(l => { const L = di.shapes[l.id], s = di.shapes[id]; return s.cy >= L.y && s.cy <= L.y + L.h; });
  // A task and a lane it is not in.
  const task = model.nodes.find(n => n.type === 'task' && di.shapes[n.id] && laneOf(n.id));
  const ziel = di.shapes[lanes.find(l => l.id !== laneOf(task.id).id).id];
  const s = di.shapes[task.id];
  const dy = Math.round(ziel.y + ziel.h / 2 - s.cy);
  // Only the task's shape moved, then one of its flows rerouted.
  const shapeRe = new RegExp('(<(?:[\\w.-]+:)?BPMNShape\\b[^>]*bpmnElement="' + task.id + '"[^>]*>\\s*<(?:[\\w.-]+:)?Bounds\\b[^>]*?\\by=")([-\\d.]+)');
  let b = g.replace(shapeRe, (m, a, y) => a + (Number(y) + dy));
  assert.notEqual(b, g);
  const flow = model.flows.find(f => f.from === task.id || f.to === task.id);
  const edgeRe = new RegExp('(<(?:[\\w.-]+:)?BPMNEdge\\b[^>]*bpmnElement="' + flow.id + '"[^>]*>\\s*<(?:[\\w.-]+:)?waypoint\\b[^>]*?\\by=")([-\\d.]+)');
  b = b.replace(edgeRe, (m, a, y) => a + (Number(y) + dy));
  const a = aenderungen(g, b, model);
  assert.deepEqual(a.lanes.map(m => m.id), [task.id]);
  assert.deepEqual(a.flows.map(f => f.id), [flow.id]);
  const marken = markenFuer([{ key: 'erzeugt', xml: g }, { key: 'ben', xml: b }], model);
  assert.deepEqual([...marken.get('ben')].sort(), [task.id, flow.id].sort());
  // The generated layer has nothing to compare with (no other stand); with one, identical, nothing marked.
  assert.equal(marken.has('erzeugt'), false);
  assert.equal(markenFuer([{ key: 'erzeugt', xml: g }, { key: 'stand', xml: g }], model).get('erzeugt').size, 0);
  // A layer without a picture (waiting) has no entry.
  assert.equal(markenFuer([{ key: 'erzeugt', xml: null }, { key: 'ben', xml: b }], model).size, 0);
});

// The ids the evaluation lists for one example, read from its section of uebersicht.md: node lines name the node as
// "name (id)" or "id", flow lines begin with the flow's id.
function gelisteteIds(abschnitt, model, ids){
  const name = id => { const n = model.nodes.find(x => x.id === id); return n && n.name ? `${n.name} (${id})` : id; };
  const zeilen = abschnitt.split('\n').filter(l => l.startsWith('- '));
  const gefunden = new Set();
  for (const l of zeilen){
    const id = [...ids].find(i => l.startsWith(`- ${name(i)}: `) || l.startsWith(`- ${i} (`));
    assert.ok(id, 'listed, not marked: ' + l);
    gefunden.add(id);
  }
  return gefunden;
}
test('the marking is what feedback-auswerten.mjs lists, for the edited examples of the packages in arbeit/feedback/', () => {
  const ordner = path.join(ARBEIT, 'feedback');
  const pakete = fs.existsSync(ordner) ? fs.readdirSync(ordner).map(d => path.join(ordner, d, 'paket.json')).filter(f => fs.existsSync(f)) : [];
  // The packages in arbeit/ where there are some, and always a fixture of the tests.
  const beispiele = [];
  for (const f of pakete.slice(0, 4)){
    const pkg = JSON.parse(fs.readFileSync(f, 'utf8'));
    const { uebersicht } = auswerten(pkg);
    for (const b of pkg.beispiele.filter(x => x.bearbeitet)) beispiele.push({ b, abschnitt: uebersicht.split('\n## ').find(t => t.startsWith(b.name + '\n')) });
  }
  {
    // Task b of r03 moved 500 px to the right: another order, its flows as they were.
    const g = angeordnet('r03'), b = g.replace(/(<(?:[\w.-]+:)?BPMNShape\b[^>]*bpmnElement="b"[^>]*>\s*<(?:[\w.-]+:)?Bounds\b[^>]*?\bx=")([-\d.]+)/, (m, a, x) => a + (Number(x) + 500));
    assert.notEqual(b, g);
    const pkg = { format: 'dokufix-layout-feedback', version: 1, exportiert: T1, satz: { id: 'fx', variant: 'A' }, beispiele: [{ name: 'fx-r03', paket: 'erzeugt', eingabe: eingabe('r03'), erzeugt: g, bearbeitet: b, kommentar: '', geaendert: T1 }] };
    beispiele.push({ b: pkg.beispiele[0], abschnitt: auswerten(pkg).uebersicht.split('\n## ')[1] });
  }
  let geprueft = 0;
  for (const { b, abschnitt } of beispiele){
    assert.ok(abschnitt, b.name);
    // A list cut short ("… und n weitere") names fewer than are marked.
    if (/… und \d+ weitere/.test(abschnitt)) continue;
    const model = modelOf(b.eingabe);
    const marken = markenFuer([{ key: 'erzeugt', xml: b.erzeugt }, { key: 'ben', xml: b.bearbeitet }], model).get('ben');
    assert.deepEqual([...gelisteteIds(abschnitt, model, marken)].sort(), [...marken].sort(), b.name);
    if (b.name === 'fx-r03') assert.ok(marken.has('b'), 'the moved task is marked');
    geprueft++;
  }
  assert.ok(geprueft > 0);
});

// A viewer as bpmn-js's, as far as the canvas uses it: the import (refused without a diagram part), the view, the
// markers, the event of a changed view.
class Probeviewer {
  static alle = [];
  constructor({ container }){ this.container = container; this.vb = { x: 0, y: 0, width: 800, height: 500 }; this.h = {}; this.marken = new Set(); Probeviewer.alle.push(this); }
  async importXML(xml){ if (!/BPMNShape/.test(xml)) throw new Error('kein Diagramm'); this.xml = xml; }
  get(name){
    if (name === 'elementRegistry') return { get: id => ({ id }) };
    return {
      viewbox: b => { if (b){ this.vb = { ...b }; for (const f of this.h['canvas.viewbox.changed'] || []) f({ viewbox: this.vb }); } return this.vb; },
      addMarker: id => this.marken.add(id), removeMarker: id => this.marken.delete(id),
    };
  }
  on(e, f){ (this.h[e] ||= []).push(f); }
  destroy(){ this.zerstoert = true; }
}
test('matrix: switching keeps the view, a missing layer is no key, an unreadable layer is named and the others work', async () => {
  const { document } = parseHTML('<!doctype html><div id="h"></div>');
  const vorher = globalThis.document;
  globalThis.document = document;
  try {
    Probeviewer.alle = [];
    const host = document.getElementById('h');
    const L = leinwand(host, { Viewer: Probeviewer, config: {} });
    const g = angeordnet('r02'), b = verschoben(g, 150, 40);
    const fehler = await L.setzen('f1', [{ key: 'erzeugt', xml: g }, { key: 'ben', xml: b }, { key: 'kaputt', xml: '<definitions/>' }]);
    assert.deepEqual(fehler, { kaputt: 'kein Diagramm' });
    const [vg, vb] = Probeviewer.alle;
    L.zeigen('erzeugt');
    assert.deepEqual([...host.children].map(e => e.style.visibility), ['visible', 'hidden', 'hidden']);
    // Ben zooms and pans on the generated version, then switches: the same spot of Ben's.
    const ug = ursprung(g);
    vg.get('canvas').viewbox({ x: ug.x + 100, y: ug.y + 50, width: 400, height: 250 });
    L.zeigen('ben');
    assert.deepEqual(vb.vb, { x: ug.x + 250, y: ug.y + 90, width: 400, height: 250 });
    assert.deepEqual([...host.children].map(e => e.style.visibility), ['hidden', 'visible', 'hidden']);
    // The unreadable layer shows nothing; switching back works.
    L.zeigen('kaputt');
    L.zeigen('erzeugt');
    assert.deepEqual(vg.vb, { x: ug.x + 100, y: ug.y + 50, width: 400, height: 250 });
    // A layer that joins later (the last stand) neither refits nor moves the view; the layers kept are not imported again.
    await L.setzen('f1', [{ key: 'erzeugt', xml: g }, { key: 'ben', xml: b }, { key: 'stand', xml: g }]);
    assert.equal(Probeviewer.alle.length, 4);
    assert.deepEqual(L.ansicht, { x: 100, y: 50, width: 400, height: 250 });
    L.zeigen('stand');
    assert.deepEqual(Probeviewer.alle[3].vb, { x: ug.x + 100, y: ug.y + 50, width: 400, height: 250 });
    // Marking: the ids of a layer on its viewer, gone when switched off.
    L.marken(new Map([['ben', new Set(['a', 'b'])]]), true);
    assert.deepEqual([...vb.marken].sort(), ['a', 'b']);
    L.marken(new Map([['ben', new Set(['a', 'b'])]]), false);
    assert.equal(vb.marken.size, 0);
    // Another case: everything anew, fitted again.
    await L.setzen('f2', [{ key: 'erzeugt', xml: g }]);
    assert.ok(vg.zerstoert && vb.zerstoert);
    assert.deepEqual(L.ansicht, einpassen(ausdehnung([ug]), 800, 500));
  } finally { globalThis.document = vorher; }
  // The keys: the layer at that place of the tabs; where the case has fewer, none.
  const arten = [{ key: 'erzeugt' }, { key: 'referenz' }];
  assert.equal(ebeneFuerTaste(arten, '2'), 'referenz');
  assert.equal(ebeneFuerTaste(arten, '3'), null);
  assert.equal(ebeneFuerTaste(arten, 'x'), null);
});

test('matrix: a drawing that is no BPMN or has no node becomes no case, with a message', () => {
  assert.match(zeichnungPruefen('kein xml'), /kein BPMN/);
  assert.match(zeichnungPruefen('<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d"><bpmn:process id="p"/></bpmn:definitions>'), /kein BPMN|keinen Knoten/);
  // The empty modeler's start event alone: nothing drawn.
  const nurStart = '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="d"><bpmn:process id="p"><bpmn:startEvent id="s"/></bpmn:process><bpmndi:BPMNDiagram id="dd"><bpmndi:BPMNPlane id="pl" bpmnElement="p"><bpmndi:BPMNShape id="s_di" bpmnElement="s"><dc:Bounds x="100" y="100" width="36" height="36"/></bpmndi:BPMNShape></bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>';
  assert.match(zeichnungPruefen(nurStart), /nichts gezeichnet/);
  assert.equal(zeichnungPruefen(angeordnet('r01')), null);
});
