// The fingerprints and the similarity of BPMN inputs (src/app/fingerprint.js, story 2.37), run in Node.
//
//   npm test          (node --test tests/*.test.mjs)
//
// The cases:
//   - sha256() against node:crypto;
//   - every row of the plan's matrix on the fixtures of tests/fixtures/bpmn-layout/: reordered (both the same),
//     rewritten (prefix, attribute order, colours, extensions, positions, comments, tool attributes of the
//     definitions, blanks between tags: both the same), renamed (the case differs, the shape not), another kind of
//     gateway, a node in another lane, two lanes swapped (both differ), no BPMN (both null), nothing to lay out (a
//     case, no shape);
//   - each kind the cleaning sorts, reordered alone: text annotations, associations, message flows, data references,
//     data associations, incoming and outgoing;
//   - decision 2 (Ben, 2026-10-09): a data object made a data store changes the shape, cancelActivity does not;
//   - the mutations of tests/lmm.test.mjs with a fixed seed over every fixture: the reordering keeps both, the
//     renaming keeps the shape;
//   - hund2 written again with other ids and texts: the same shape, 100 %; the similarity and nearest().

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DOMParser } from 'linkedom';
import { sha256, caseFingerprint, shapeOf, similarity, nearest } from '../src/app/fingerprint.js';
import { fixtureNames, readFixture, expectedFile } from './bpmn-fixtures.mjs';

const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
const NAMES = fixtureNames();
const xmlOf = name => readFixture(name).xml;
const both = xml => ({ fall: caseFingerprint(xml), form: shapeOf(xml) });
const sameCase = (a, b) => caseFingerprint(a).hash === caseFingerprint(b).hash;
const sameShape = (a, b) => shapeOf(a).hash === shapeOf(b).hash;

// ---------- mutations ----------
// tests/lmm.test.mjs: a fixed sequence of numbers in [0, 1), from a seed, and its reorderings and renamings, with the
// incoming and outgoing of each flow node reordered as well.
const local = e => String(e.localName || '').replace(/^.*:/, '');
const NODE = /^(startEvent|endEvent|intermediateCatchEvent|intermediateThrowEvent|\w*Gateway|task|\w+Task|callActivity|subProcess|adHocSubProcess|transaction)$/;
const RENAMED = /^(startEvent|endEvent|intermediateCatchEvent|intermediateThrowEvent|\w*Gateway|task|\w+Task|callActivity|subProcess|adHocSubProcess|transaction|boundaryEvent|sequenceFlow|messageFlow|textAnnotation|association|dataObjectReference|dataStoreReference|dataInputAssociation|dataOutputAssociation)$/;
const random = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const parse = xml => new DOMParser().parseFromString(xml, 'text/xml');
// A document written back. linkedom writes a line break in an attribute as it is, which an XML parser reads as a
// blank (attribute value normalisation); written as "&#10;" it stays the name's line break (daten-namen).
const NL = '\uE000NL\uE000';
function write(doc){
  for (const e of doc.querySelectorAll('*')) for (const a of [...e.attributes]) if (a.value.includes('\n')) e.setAttribute(a.name, a.value.replaceAll('\n', NL));
  return doc.toString().replaceAll(NL, '&#10;');
}
function reorder(parent, pass, rnd, doc){
  const els = [...parent.children].filter(pass);
  if (els.length < 2) return;
  const slots = els.map(e => { const c = doc.createComment('slot'); e.replaceWith(c); return c; });
  for (let i = els.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [els[i], els[j]] = [els[j], els[i]]; }
  els.forEach((e, i) => slots[i].replaceWith(e));
}
// kinds: which of the kinds to reorder, all by default.
const KINDS = ['node', 'boundary', 'flow', 'data', 'dataAssociation', 'flowNodeRef', 'inOut', 'message', 'note', 'association'];
function permuted(xml, rnd, kinds = KINDS){
  const doc = parse(xml);
  const on = k => kinds.includes(k);
  for (const part of [...doc.documentElement.children]){
    const kind = local(part);
    if (kind === 'process'){
      if (on('node')) reorder(part, e => NODE.test(local(e)), rnd, doc);
      if (on('boundary')) reorder(part, e => local(e) === 'boundaryEvent', rnd, doc);
      if (on('flow')) reorder(part, e => local(e) === 'sequenceFlow', rnd, doc);
      if (on('data')) reorder(part, e => /^data(Object|Store)Reference$/.test(local(e)), rnd, doc);
      for (const node of [...part.children]){
        if (on('dataAssociation')) for (const k of ['dataInputAssociation', 'dataOutputAssociation']) reorder(node, e => local(e) === k, rnd, doc);
        if (on('inOut')) for (const k of ['incoming', 'outgoing']) reorder(node, e => local(e) === k, rnd, doc);
      }
      if (on('flowNodeRef')) for (const lane of part.querySelectorAll('*')) if (local(lane) === 'lane') reorder(lane, e => local(e) === 'flowNodeRef', rnd, doc);
    }
    if (kind === 'collaboration' && on('message')) reorder(part, e => local(e) === 'messageFlow', rnd, doc);
    if (kind === 'process' || kind === 'collaboration'){
      if (on('note')) reorder(part, e => local(e) === 'textAnnotation', rnd, doc);
      if (on('association')) reorder(part, e => local(e) === 'association', rnd, doc);
    }
  }
  return write(doc);
}
function renamed(xml, rnd){
  const doc = parse(xml);
  const all = [...doc.querySelectorAll('*')], map = new Map();
  const used = new Set(all.map(e => e.getAttribute('id')).filter(Boolean));
  for (const e of all){
    if (!RENAMED.test(local(e)) || !e.getAttribute('id')) continue;
    let id; do { id = 'id_' + Math.floor(rnd() * 1e9).toString(36); } while (used.has(id));
    used.add(id); map.set(e.getAttribute('id'), id);
    e.setAttribute('id', id);
  }
  for (const e of all){
    for (const a of ['sourceRef', 'targetRef', 'attachedToRef']) if (map.has(e.getAttribute(a))) e.setAttribute(a, map.get(e.getAttribute(a)));
    if (['flowNodeRef', 'sourceRef', 'targetRef', 'incoming', 'outgoing'].includes(local(e)) && map.has(e.textContent.trim())) e.textContent = map.get(e.textContent.trim());
  }
  return write(doc);
}
// Every name and every text annotation's text another.
function retexted(xml){
  const doc = parse(xml);
  let n = 0;
  for (const e of doc.querySelectorAll('*')){
    if (e.getAttribute('name')) e.setAttribute('name', 'Name ' + ++n);
    if (local(e) === 'text' && e.textContent.trim()) e.textContent = 'Text ' + ++n;
  }
  return write(doc);
}

// The prefix bound to BPMN's namespace ('' for the default namespace).
const prefixOf = xml => { const m = /xmlns:([\w.-]+)="http:\/\/www\.omg\.org\/spec\/BPMN\/20100524\/MODEL"/.exec(xml); return m ? m[1] : ''; };
// The elements of BPMN's namespace under another prefix, or none.
function reprefixed(xml, to){
  const p = prefixOf(xml);
  assert.ok(p, 'the fixture binds a prefix');
  const tag = to ? to + ':' : '';
  return xml.replace(new RegExp('xmlns:' + p + '="', 'g'), to ? 'xmlns:' + to + '="' : 'xmlns="')
    .replace(new RegExp('<(/?)' + p + ':', 'g'), '<$1' + tag);
}
// Every start tag with its attributes the other way round.
const reversedAttributes = xml => xml.replace(/<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))+)\s*(\/?)>/g, (all, name, attrs, close) =>
  '<' + name + [...attrs.matchAll(/\s+([\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))/g)].map(m => ' ' + m[1]).reverse().join('') + close + '>');
// The definitions' start tag with more on it.
const onRoot = (xml, more) => xml.replace(/<([\w.-]+:)?definitions\b/, m => m + ' ' + more);
const NODE_TAG = '(?:startEvent|endEvent|intermediateCatchEvent|intermediateThrowEvent|\\w*Gateway|task|\\w+Task|callActivity|subProcess)';
// Colours on every flow node, as bpmn-js and the Camunda Modeler write them.
const coloured = xml => onRoot(xml, 'xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0" xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0"')
  .replace(new RegExp('<((?:[\\w.-]+:)?' + NODE_TAG + ')(\\s)', 'g'), '<$1 bioc:fill="#ffe0b2" bioc:stroke="#fb8c00" color:background-color="#ffe0b2"$2');
// A tool's extensions: an extensionElements as the first child of every process and flow node, and an attribute.
function extended(xml){
  const p = prefixOf(xml), t = p ? p + ':' : '';
  const ext = '<' + t + 'extensionElements><camunda:properties><camunda:property name="a" value="b"/></camunda:properties></' + t + 'extensionElements>';
  return onRoot(xml, 'xmlns:camunda="http://camunda.org/schema/1.0/bpmn"')
    .replace(new RegExp('<(' + t + '(?:process|' + NODE_TAG + '))(\\s[^>]*[^/])>', 'g'), '<$1 camunda:asyncBefore="true"$2>' + ext);
}
// Comments between the tags and in the texts of text annotations.
const commented = xml => xml.replace(/(<([\w.-]+:)?(process|laneSet|collaboration)\b[^>]*>)/g, '$1<!-- ein Kommentar -->')
  .replace(/(<\/([\w.-]+:)?text>)/g, '<!-- im Text -->$1');
// The definitions with what a tool writes there: name, exporter, its version, another target namespace.
const exported = xml => onRoot(xml.replace(/\stargetNamespace="[^"]*"/, ' targetNamespace="http://bpmn.io/schema/bpmn"'), 'name="Modell" exporter="Camunda Modeler" exporterVersion="5.31.0"');
// The blanks between tags: none, and another indentation.
const compact = xml => xml.replace(/>\s+</g, '><');
const indented = xml => xml.replace(/>\s*</g, '>\n\t\t<');

// The lanes of one lane set: [lane elements] of the first lane set with two lanes at least without lanes inside.
function laneSetOf(doc){
  for (const set of doc.querySelectorAll('*')){
    if (local(set) !== 'laneSet') continue;
    const lanes = [...set.children].filter(e => local(e) === 'lane' && ![...e.querySelectorAll('*')].some(k => local(k) === 'lane'));
    if (lanes.length >= 2) return lanes;
  }
  return null;
}
// Two lanes swapped; null where the fixture has no two.
function lanesSwapped(xml){
  const doc = parse(xml), lanes = laneSetOf(doc);
  if (!lanes) return null;
  const [a, b] = lanes, ca = doc.createComment('a'), cb = doc.createComment('b');
  a.replaceWith(ca); b.replaceWith(cb); ca.replaceWith(b); cb.replaceWith(a);
  return write(doc);
}
// The first node of a lane that names more than one moved to the next lane; null where there is none.
function nodeMoved(xml){
  const doc = parse(xml), lanes = laneSetOf(doc);
  if (!lanes) return null;
  const from = lanes.find(l => [...l.children].filter(e => local(e) === 'flowNodeRef').length > 1);
  if (!from) return null;
  const to = lanes[(lanes.indexOf(from) + 1) % lanes.length];
  to.appendChild([...from.children].find(e => local(e) === 'flowNodeRef'));
  return write(doc);
}
const tagsRenamed = (xml, from, to) => xml.replace(new RegExp('(</?(?:[\\w.-]+:)?)' + from + '\\b', 'g'), '$1' + to);

// ---------- SHA-256 ----------
test('sha256() gives what node:crypto gives, for every length around a block and for text beyond ASCII', () => {
  const texts = ['', 'abc', 'äöü ß', '😀 emoji', 'x'.repeat(100000), '\u0000\n\r\t', 'Ein Prozess mit &#10; und <tags>'];
  for (let n = 0; n <= 130; n++) texts.push('a'.repeat(n));
  for (const t of texts) assert.equal(sha256(t), crypto.createHash('sha256').update(t, 'utf8').digest('hex'), 'length ' + t.length);
});

// ---------- the matrix ----------
test('every fixture has both fingerprints, the short one 12 hex digits of the long one', () => {
  for (const name of NAMES){
    const { fall, form } = both(xmlOf(name));
    assert.match(fall.hash, /^[0-9a-f]{64}$/, name);
    assert.equal(fall.short, fall.hash.slice(0, 12), name);
    assert.match(form.hash, /^[0-9a-f]{64}$/, name);
    assert.equal(form.short, form.hash.slice(0, 12), name);
    assert.ok(Object.keys(form.features).length > 0, name);
  }
});

test('reordered: flow nodes, boundary events, sequence flows and flowNodeRef shuffled keep both fingerprints', () => {
  for (const [i, name] of NAMES.entries()){
    const xml = xmlOf(name), rnd = random(2000 + i);
    const shuffled = permuted(xml, rnd, ['node', 'boundary', 'flow', 'flowNodeRef']);
    assert.deepEqual(both(shuffled), both(xml), name);
  }
});

test('each further kind the cleaning sorts, reordered alone, keeps both fingerprints', () => {
  // Per kind the fixtures where the reordering changed the XML: each kind is met at least once.
  const met = Object.fromEntries(['data', 'dataAssociation', 'inOut', 'message', 'note', 'association'].map(k => [k, 0]));
  for (const [i, name] of NAMES.entries()){
    const xml = xmlOf(name);
    for (const kind of Object.keys(met)){
      // Several tries, so that a reordering of two that leaves them in place does not count as one.
      for (let seed = 0; seed < 4; seed++){
        const shuffled = permuted(xml, random(3000 + 10 * i + seed), [kind]);
        assert.deepEqual(both(shuffled), both(xml), name + ', ' + kind);
        if (shuffled !== permuted(xml, random(1), [])) { met[kind]++; break; }
      }
    }
  }
  for (const [kind, n] of Object.entries(met)) assert.ok(n > 0, kind + ' was reordered in no fixture');
});

test('incoming and outgoing of a node reordered keep both fingerprints', () => {
  const xml = '<definitions xmlns="' + BPMN_NS + '" id="D"><process id="P">' +
    '<startEvent id="S"><outgoing>F1</outgoing><outgoing>F2</outgoing></startEvent>' +
    '<task id="A"><incoming>F1</incoming><outgoing>F3</outgoing></task><task id="B"><incoming>F2</incoming><outgoing>F4</outgoing></task>' +
    '<endEvent id="E"><incoming>F3</incoming><incoming>F4</incoming></endEvent>' +
    '<sequenceFlow id="F1" sourceRef="S" targetRef="A"/><sequenceFlow id="F2" sourceRef="S" targetRef="B"/>' +
    '<sequenceFlow id="F3" sourceRef="A" targetRef="E"/><sequenceFlow id="F4" sourceRef="B" targetRef="E"/></process></definitions>';
  const swapped = xml.replace('<outgoing>F1</outgoing><outgoing>F2</outgoing>', '<outgoing>F2</outgoing><outgoing>F1</outgoing>')
    .replace('<incoming>F3</incoming><incoming>F4</incoming>', '<incoming>F4</incoming><incoming>F3</incoming>');
  assert.notEqual(swapped, xml);
  assert.deepEqual(both(swapped), both(xml));
  // A reference's text with blanks around it, as readProcess() trims it.
  assert.deepEqual(both(xml.replace('<incoming>F1</incoming>', '<incoming>\n  F1\n</incoming>')), both(xml));
  // And the incoming before the outgoing or after: no order there either.
  const turned = xml.replace('<incoming>F1</incoming><outgoing>F3</outgoing>', '<outgoing>F3</outgoing><incoming>F1</incoming>');
  assert.deepEqual(both(turned), both(xml));
});

test('rewritten: another prefix or none, attribute order, colours, extensions, comments, tool attributes and blanks keep both', () => {
  const ways = { bpmn2: x => reprefixed(x, 'bpmn2'), 'no prefix': x => reprefixed(x, ''), 'attribute order': reversedAttributes,
    colours: coloured, extensions: extended, comments: commented, exporter: exported, compact, indented,
    'all at once': x => indented(commented(exported(extended(coloured(reversedAttributes(reprefixed(x, 'bpmn2'))))))) };
  for (const name of NAMES){
    const xml = xmlOf(name), want = both(xml);
    for (const [way, f] of Object.entries(ways)){
      if (!prefixOf(xml) && (way === 'bpmn2' || way === 'no prefix' || way === 'all at once')) continue;
      const rewritten = f(xml);
      assert.notEqual(rewritten, xml, name + ', ' + way + ' changed nothing');
      assert.deepEqual(both(rewritten), want, name + ', ' + way);
    }
  }
});

test('rewritten: positions, the laid-out XML of a fixture, have the case of the author\'s where only the diagram part was added', () => {
  let n = 0;
  for (const name of NAMES){
    const xml = xmlOf(name), laid = fs.readFileSync(expectedFile(name), 'utf8');
    const without = laid.replace(/<([\w.-]+:)?BPMNDiagram\b[\s\S]*<\/([\w.-]+:)?BPMNDiagram>/, '');
    // Where a rule moved a node to another lane, or a collaboration was inserted, the laid-out XML is another case.
    if (without.replace(/\s+/g, '') !== xml.replace(/\s+/g, '')) continue;
    n++;
    assert.deepEqual(both(laid), both(xml), name);
  }
  assert.ok(n >= 40, 'only ' + n + ' fixtures with the diagram part alone added');
});

test('renamed: another id changes the case and keeps the shape, as another name or text does', () => {
  for (const [i, name] of NAMES.entries()){
    const xml = xmlOf(name), r = renamed(xml, random(4000 + i)), t = retexted(xml);
    assert.ok(!sameCase(r, xml), name + ', ids');
    assert.ok(sameShape(r, xml), name + ', ids');
    if (t !== write(parse(xml))){
      assert.ok(!sameCase(t, xml), name + ', texts');
      assert.ok(sameShape(t, xml), name + ', texts');
    }
  }
});

test('other kind: another kind of gateway, or a node in another lane, changes both', () => {
  let gateways = 0, moved = 0;
  for (const name of NAMES){
    const xml = xmlOf(name);
    if (/exclusiveGateway/.test(xml)){
      gateways++;
      const other = tagsRenamed(xml, 'exclusiveGateway', 'inclusiveGateway');
      assert.ok(!sameCase(other, xml) && !sameShape(other, xml), name + ', gateway kind');
    }
    const m = nodeMoved(xml);
    if (m){
      moved++;
      assert.ok(!sameCase(m, xml) && !sameShape(m, xml), name + ', a node in another lane');
    }
  }
  assert.ok(gateways >= 20 && moved >= 20, gateways + ' fixtures with a gateway, ' + moved + ' with a node moved');
});

test('lanes swapped: two lanes in the other order change both', () => {
  let n = 0;
  for (const name of NAMES){
    const xml = xmlOf(name), s = lanesSwapped(xml);
    if (!s) continue;
    n++;
    assert.ok(!sameCase(s, xml), name);
    assert.ok(!sameShape(s, xml), name);
  }
  assert.ok(n >= 20, 'only ' + n + ' fixtures with two lanes');
});

test('no BPMN: no definitions, or XML the parser rejects, gives null for both and throws nothing', () => {
  for (const xml of ['', 'kein XML', '<a><b></a>', '<foo/>', '<definitions xmlns="http://example.org/other"><process id="P"><task id="T"/></process></definitions>',
    '<!DOCTYPE x><definitions xmlns="' + BPMN_NS + '"/>', '<bpmn:definitions xmlns:bpmn="' + BPMN_NS + '"><bpmn:process>', null, undefined]){
    assert.deepEqual(both(xml), { fall: null, form: null }, String(xml));
  }
});

test('nothing to lay out: where readProcess() throws, a case fingerprint and no shape', () => {
  const empty = '<definitions xmlns="' + BPMN_NS + '" id="D"><process id="P"/></definitions>';
  const stray = '<definitions xmlns="' + BPMN_NS + '" id="D"><process id="P"><laneSet id="LS"><lane id="L"><flowNodeRef>A</flowNodeRef></lane></laneSet>' +
    '<task id="A"/><task id="B"/></process></definitions>';
  for (const xml of [empty, stray]){
    const { fall, form } = both(xml);
    assert.match(fall.hash, /^[0-9a-f]{64}$/);
    assert.equal(form, null);
  }
  assert.notEqual(caseFingerprint(empty).hash, caseFingerprint(stray).hash);
});

test('a deep document is cleaned without running out of stack', () => {
  const depth = 20000;
  const xml = '<definitions xmlns="' + BPMN_NS + '" id="D"><documentation>' + '<x>'.repeat(depth) + '</x>'.repeat(depth) + '</documentation></definitions>';
  // The <x> are BPMN elements of no meaning, kept as they stand.
  assert.match(caseFingerprint(xml).hash, /^[0-9a-f]{64}$/);
});

// ---------- decision 2 ----------
test('decision 2: a data object made a data store changes the shape; cancelActivity does not', () => {
  let objects = 0, boundaries = 0;
  for (const name of NAMES){
    const xml = xmlOf(name);
    if (/dataObjectReference/.test(xml) && shapeOf(xml).features){
      objects++;
      const store = tagsRenamed(xml, 'dataObjectReference', 'dataStoreReference');
      assert.ok(!sameShape(store, xml), name + ', data object to store');
      assert.ok(!sameCase(store, xml), name + ', data object to store');
    }
    if (/boundaryEvent/.test(xml)){
      boundaries++;
      const doc = parse(xml);
      for (const e of doc.querySelectorAll('*')) if (local(e) === 'boundaryEvent') e.setAttribute('cancelActivity', e.getAttribute('cancelActivity') === 'false' ? 'true' : 'false');
      const other = write(doc);
      assert.ok(sameShape(other, xml), name + ', cancelActivity');
      assert.ok(!sameCase(other, xml), name + ', cancelActivity');
    }
  }
  assert.ok(objects >= 5 && boundaries >= 5, objects + ' fixtures with data objects, ' + boundaries + ' with boundary events');
});

test('the ends of a data association with blanks around the id keep the case, as readProcess() reads them trimmed', () => {
  const xml = '<definitions xmlns="' + BPMN_NS + '" id="D"><process id="P"><dataObjectReference id="DO" dataObjectRef="O"/><dataObject id="O"/>' +
    '<startEvent id="S"/><task id="T"><dataInputAssociation id="I"><sourceRef>DO</sourceRef><targetRef>T</targetRef></dataInputAssociation></task>' +
    '<sequenceFlow id="F" sourceRef="S" targetRef="T"/></process></definitions>';
  const spaced = xml.replace('<sourceRef>DO</sourceRef><targetRef>T</targetRef>', '<sourceRef>\n  DO\n  </sourceRef><targetRef> T </targetRef>');
  assert.notEqual(spaced, xml);
  assert.deepEqual(both(spaced), both(xml));
});

test('data objects and the definitions referred to by id alone, reordered, keep both; a data object moved to another process changes the case', () => {
  const head = '<definitions xmlns="' + BPMN_NS + '" id="D">';
  const procA = (objs) => '<process id="A"><startEvent id="S"/><task id="T"/><sequenceFlow id="F" sourceRef="S" targetRef="T"/>' + objs + '</process>';
  const defs = ['<message id="M1" name="Anfrage"/>', '<signal id="G1"/>', '<error id="E1" errorCode="x"/>', '<itemDefinition id="I1"/>', '<dataStore id="DS1"/>', '<escalation id="X1"/>'];
  const objs = '<dataObject id="O1"/><dataObject id="O2"/><dataObject id="O3"/>';
  const xml = head + defs.join('') + procA(objs) + '</definitions>';
  const shuffled = head + [defs[3], defs[0], defs[5]].join('') + procA('<dataObject id="O3"/><dataObject id="O1"/><dataObject id="O2"/>') + [defs[2], defs[4], defs[1]].join('') + '</definitions>';
  assert.deepEqual(both(shuffled), both(xml));
  // A data object belongs to its process: in another process it is another case.
  const two = head + procA('<dataObject id="O1"/>') + '<process id="B"><startEvent id="S2"/></process></definitions>';
  const moved = head + procA('') + '<process id="B"><startEvent id="S2"/><dataObject id="O1"/></process></definitions>';
  assert.notEqual(caseFingerprint(two).hash, caseFingerprint(moved).hash);
  // The processes keep their order: without a collaboration it is the order of the pools.
  const swapped = head + '<process id="B"><startEvent id="S2"/></process>' + procA('<dataObject id="O1"/>') + '</definitions>';
  assert.notEqual(caseFingerprint(two).hash, caseFingerprint(swapped).hash);
});

test('a long chain: the pass stops after 32 rounds, so a chain of 1000 tasks takes no longer than a few seconds', () => {
  const n = 1000;
  const tasks = Array.from({ length: n }, (_, i) => '<task id="T' + i + '"/>').join('');
  const flows = Array.from({ length: n - 1 }, (_, i) => '<sequenceFlow id="F' + i + '" sourceRef="T' + i + '" targetRef="T' + (i + 1) + '"/>').join('');
  const xml = '<definitions xmlns="' + BPMN_NS + '" id="D"><process id="P">' + tasks + flows + '</process></definitions>';
  const t = Date.now(), shape = shapeOf(xml);
  assert.match(shape.hash, /^[0-9a-f]{64}$/);
  assert.ok(Date.now() - t < 5000, (Date.now() - t) + ' ms');
});

test('a pool: the same process with a participant, drawn with a frame, and without one has another shape', () => {
  const proc = '<process id="P"><startEvent id="S"/><task id="T"/><endEvent id="E"/>' +
    '<sequenceFlow id="F1" sourceRef="S" targetRef="T"/><sequenceFlow id="F2" sourceRef="T" targetRef="E"/></process>';
  const bare = '<definitions xmlns="' + BPMN_NS + '" id="D">' + proc + '</definitions>';
  const framed = '<definitions xmlns="' + BPMN_NS + '" id="D"><collaboration id="C"><participant id="PA" processRef="P"/></collaboration>' + proc + '</definitions>';
  assert.ok(!sameShape(bare, framed));
  assert.ok(similarity(shapeOf(bare), shapeOf(framed)) < 1);
});

// ---------- the mutations of tests/lmm.test.mjs ----------
for (const [i, name] of NAMES.entries()){
  test(name + ': reordered as tests/lmm.test.mjs reorders, both the same; renamed as well, the shape the same', () => {
    const xml = xmlOf(name), rnd = random(1000 + i), want = both(xml);
    assert.deepEqual(both(permuted(xml, rnd)), want, 'reordered');
    const r = renamed(permuted(xml, rnd), rnd);
    assert.equal(shapeOf(r).hash, want.form.hash, 'reordered and renamed');
    assert.deepEqual(shapeOf(r).features, want.form.features, 'reordered and renamed');
  });
}

// ---------- similarity ----------
test('hund2 with other ids and texts: the same shape, similarity 100 %, another case', () => {
  const xml = xmlOf('hund2'), copy = retexted(renamed(xml, random(7)));
  assert.ok(!sameCase(copy, xml));
  assert.equal(shapeOf(copy).hash, shapeOf(xml).hash);
  assert.equal(similarity(shapeOf(copy), shapeOf(xml)), 1);
  assert.equal(nearest(shapeOf(copy), new Map([['hund2', shapeOf(xml)], ['hund', shapeOf(xmlOf('hund'))]]))[0].similarity, 1);
});

test('similarity(): between 0 and 1, the same both ways, 1 only for the same features; nearest() the most alike first', () => {
  const shapes = new Map(NAMES.map(n => [n, shapeOf(xmlOf(n))]));
  const list = [...shapes];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++){
    const [a, x] = list[i], [b, y] = list[j], s = similarity(x, y);
    assert.ok(s >= 0 && s <= 1, a + ' ' + b);
    assert.equal(s, similarity(y, x), a + ' ' + b);
    assert.equal(s === 1, x.hash === y.hash || JSON.stringify(x.features) === JSON.stringify(y.features), a + ' ' + b);
    // Features are counts, so similarity() takes them alone as well.
    assert.equal(similarity(x.features, y.features), s);
  }
  const near = nearest('hund2', shapes);
  assert.equal(near.length, 3);
  assert.ok(near.every(n => n.name !== 'hund2'));
  assert.ok(near[0].similarity >= near[1].similarity && near[1].similarity >= near[2].similarity);
  // The same with { fall, form } as lib.mjs keeps them, a null shape left out, and k.
  const fps = new Map([...shapes].map(([n, form]) => [n, { fall: null, form }]));
  fps.set('ohne', { fall: null, form: null });
  assert.deepEqual(nearest('hund2', fps), near);
  assert.equal(similarity(fps.get('hund2'), fps.get('hund')), similarity(shapes.get('hund2'), shapes.get('hund')));
  assert.equal(nearest('hund2', fps, 10).length, 10);
  assert.ok(!nearest('hund2', fps, 1000).some(n => n.name === 'ohne'));
  assert.deepEqual(nearest('ohne', fps), []);
  assert.deepEqual(nearest('fehlt', fps), []);
});

test('the module imports nothing but the parser and the layout\'s reader, and does nothing when it loads', () => {
  const src = fs.readFileSync(new URL('../src/app/fingerprint.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\/.*$/gm, '');
  assert.deepEqual([...src.matchAll(/^import .* from '(.*)';$/gm)].map(m => m[1]), ['./xml-parser.js', './bpmn-layout.js']);
  assert.doesNotMatch(code, /crypto\.subtle|\bawait\b|\bdocument\b|\bwindow\b/);
  // Nothing in the page imports it yet.
  const dir = new URL('../src/', import.meta.url);
  for (const f of fs.readdirSync(dir, { recursive: true })) if (/\.js$/.test(f) && !f.endsWith('fingerprint.js')) assert.doesNotMatch(fs.readFileSync(new URL(f, dir), 'utf8'), /fingerprint\.js/, f);
});
