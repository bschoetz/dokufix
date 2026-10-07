// Reorders everything whose order has no meaning in BPMN XML: what review/permute-xml.mjs moves (flow nodes, boundary
// events, sequence flows, flowNodeRef) and, beyond it, the message flows of the collaboration, the text annotations
// and the associations of each process and of the collaboration (as kanonisch/permute-mehr.mjs, which does not
// export its function). Lanes, pools and everything else keep their places.
//   permuteAll(xml, rnd)    → the reordered XML
// Besides the order, an association may be written in either direction (sourceRef the text annotation or the
// partner); flipAssociations() turns each one round with probability 1/2, since the layout reads both the same but
// for the direction of its waypoints (toNote). It is applied separately so that the two effects can be told apart.
import { permuteXml, makeRandom } from '../review/permute-xml.mjs';
export { makeRandom };
const { DOMParser } = await import('/home/user/dokufix/node_modules/linkedom/esm/index.js');
const local = el => String(el.localName || '').replace(/^.*:/, '');
const shuffle = (arr, rnd) => { const a = [...arr]; for (let k = a.length - 1; k > 0; k--){ const j = Math.floor(rnd() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
function reorder(parent, test, rnd, doc){
  const els = [...parent.children].filter(test);
  if (els.length < 2) return;
  const slots = els.map(e => { const p = doc.createComment('slot'); e.replaceWith(p); return p; });
  shuffle(els, rnd).forEach((e, i) => slots[i].replaceWith(e));
}
export function permuteAll(xml, rnd){
  const doc = new DOMParser().parseFromString(permuteXml(xml, rnd), 'text/xml');
  for (const el of [...doc.documentElement.children]){
    if (local(el) === 'collaboration') reorder(el, k => local(k) === 'messageFlow', rnd, doc);
    if (local(el) === 'process' || local(el) === 'collaboration'){
      reorder(el, k => local(k) === 'textAnnotation', rnd, doc);
      reorder(el, k => local(k) === 'association', rnd, doc);
    }
  }
  return doc.toString();
}
// Only the lists beyond permute-xml.mjs: message flows, text annotations, associations.
export function permuteNotesOnly(xml, rnd){
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  for (const el of [...doc.documentElement.children]){
    if (local(el) === 'collaboration') reorder(el, k => local(k) === 'messageFlow', rnd, doc);
    if (local(el) === 'process' || local(el) === 'collaboration'){
      reorder(el, k => local(k) === 'textAnnotation', rnd, doc);
      reorder(el, k => local(k) === 'association', rnd, doc);
    }
  }
  return doc.toString();
}
export function flipAssociations(xml, rnd){
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  for (const el of doc.querySelectorAll('*')){
    if (local(el) !== 'association' || rnd() < 0.5) continue;
    const s = el.getAttribute('sourceRef'), t = el.getAttribute('targetRef');
    el.setAttribute('sourceRef', t); el.setAttribute('targetRef', s);
  }
  return doc.toString();
}
