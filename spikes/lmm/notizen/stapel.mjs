// The stack of text annotations at one pool: no fixture has two at the same pool, so a small collaboration is made
// here (notiz-pool.bpmn reduced, two annotations at the pool "Lieferant"), written in both XML orders, and laid out
// with the pool notes in the XML's order (kanonisch() today) and in the canonical one (varianten-notizen.mjs:
// pool index, then text, then id). Shows per order what the stack looks like, top to bottom.
import { fixtures, layoutWith } from '../review/measure.mjs';
import { kanonischWith } from './varianten-notizen.mjs';
import { labelSize } from '/home/user/dokufix/src/app/bpmn-layout.js';
const xmlWith = notes => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="http://example.org/n">
  <bpmn:collaboration id="C">
    <bpmn:participant id="PK" name="Kundin" processRef="PrK"/>
    <bpmn:participant id="PL" name="Lieferant" processRef="PrL"/>
    <bpmn:messageFlow id="m1" sourceRef="k2" targetRef="l1" name="Bestellung"/>
${notes.map(([id, text]) => `    <bpmn:textAnnotation id="${id}"><bpmn:text>${text}</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="a_${id}" sourceRef="PL" targetRef="${id}"/>`).join('\n')}
  </bpmn:collaboration>
  <bpmn:process id="PrK" isExecutable="false">
    <bpmn:startEvent id="k1" name="Bedarf"/>
    <bpmn:task id="k2" name="Bestellen"/>
    <bpmn:endEvent id="k5" name="Erledigt"/>
    <bpmn:sequenceFlow id="kf1" sourceRef="k1" targetRef="k2"/>
    <bpmn:sequenceFlow id="kf4" sourceRef="k2" targetRef="k5"/>
  </bpmn:process>
  <bpmn:process id="PrL" isExecutable="false">
    <bpmn:startEvent id="l1" name="Bestellung da"/>
    <bpmn:task id="l2" name="Kommissionieren"/>
    <bpmn:endEvent id="l4" name="Versendet"/>
    <bpmn:sequenceFlow id="lf1" sourceRef="l1" targetRef="l2"/>
    <bpmn:sequenceFlow id="lf3" sourceRef="l2" targetRef="l4"/>
  </bpmn:process>
</bpmn:definitions>`;
const A = ['n_vertrag', 'Rahmenvertrag 2026'], B = ['n_lager', 'Lager B, Zufahrt Nord'], C = ['n_zeit', 'Annahme 7 bis 15 Uhr'];
const orders = { 'Vertrag, Lager, Zeit': [A, B, C], 'Zeit, Vertrag, Lager': [C, A, B], 'Lager, Zeit, Vertrag': [B, C, A] };
const sizes = {};
for (const [, text] of [A, B, C]) for (const w of [150, 200, 250]) sizes['note:' + w + ':' + text] = labelSize(text, w);
for (const po of ['xml', 'canon']){
  console.log('## Notizen an Pools: ' + po + (po === 'xml' ? ' (kanonisch() heute: Stapel in XML-Reihenfolge)' : ' (nach Pool, Text, ID)'));
  const seen = new Set();
  for (const [name, notes] of Object.entries(orders)){
    const xml = xmlWith(notes), model = fixtures.readModel(xml).model;
    const k = kanonischWith(model, { notes: 'partner', pools: po, messages: 'ends', assocs: 'canon' });
    const L = layoutWith(xml, k.model, k.rank, sizes);
    const stack = Object.entries(L.di.shapes).filter(([id]) => id.startsWith('n_')).sort((a, b) => a[1][1] - b[1][1]).map(([id, b]) => id.slice(2) + ' (y ' + b[1] + ')');
    const key = stack.join(' · ');
    seen.add(key);
    console.log('   XML-Reihenfolge ' + name + ' → Stapel von oben: ' + key);
  }
  console.log('   verschiedene Bilder: ' + seen.size + ' von ' + Object.keys(orders).length);
}
