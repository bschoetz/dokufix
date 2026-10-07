// Gives new ids to everything review/rename-xml.mjs renames (flow nodes, boundary events, sequence flows) and, beyond
// it, to the message flows, text annotations and associations, in random order, keeping every reference; back maps
// a new id to the old one. Lanes and pools keep their ids (as rename-xml.mjs).
const { DOMParser } = await import('/home/user/dokufix/node_modules/linkedom/esm/index.js');
const local = el => String(el.localName || '').replace(/^.*:/, '');
const RENAMED = /^(startEvent|endEvent|intermediateCatchEvent|intermediateThrowEvent|\w*Gateway|task|\w+Task|callActivity|subProcess|adHocSubProcess|transaction|boundaryEvent|sequenceFlow|messageFlow|textAnnotation|association)$/;
const REFS = ['sourceRef', 'targetRef', 'attachedToRef'];

export function renameAll(xml, rnd){
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const all = [...doc.querySelectorAll('*')];
  const map = new Map(), back = new Map();
  const used = new Set(all.map(el => el.getAttribute('id')).filter(Boolean));
  for (const el of all){
    if (!RENAMED.test(local(el)) || !el.getAttribute('id')) continue;
    let id; do { id = 'id_' + Math.floor(rnd() * 1e9).toString(36); } while (used.has(id));
    used.add(id); map.set(el.getAttribute('id'), id); back.set(id, el.getAttribute('id'));
    el.setAttribute('id', id);
  }
  for (const el of all){
    for (const a of REFS) if (map.has(el.getAttribute(a))) el.setAttribute(a, map.get(el.getAttribute(a)));
    if (local(el) === 'flowNodeRef' && map.has(el.textContent.trim())) el.textContent = map.get(el.textContent.trim());
  }
  return { xml: doc.toString(), back };
}
