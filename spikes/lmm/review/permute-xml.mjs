// Reorders what has no meaning in BPMN XML: the flow nodes and boundary events of a process among their places, the
// sequence flows among theirs, the flowNodeRef of each lane. Lanes, pools and everything else keep their places.
// The result is read anew with readModel(), so the keys n1…, l1… are given as readProcess() gives them.
const { DOMParser } = await import('/home/user/dokufix/node_modules/linkedom/esm/index.js');
const local = el => String(el.localName || '').replace(/^.*:/, '');
const NODE = /^(startEvent|endEvent|intermediateCatchEvent|intermediateThrowEvent|\w*Gateway|task|\w+Task|callActivity|subProcess|adHocSubProcess|transaction|boundaryEvent)$/;

export function makeRandom(seed0){
  let seed = seed0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  return rnd;
}
const shuffle = (arr, rnd) => { const a = [...arr]; for (let k = a.length - 1; k > 0; k--){ const j = Math.floor(rnd() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };

// The elements of parent that test() accepts, each put where another of them stood.
function reorder(parent, test, rnd, doc){
  const els = [...parent.children].filter(test);
  if (els.length < 2) return;
  const slots = els.map(e => { const p = doc.createComment('slot'); e.replaceWith(p); return p; });
  shuffle(els, rnd).forEach((e, i) => slots[i].replaceWith(e));
}

export function permuteXml(xml, rnd){
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  for (const proc of [...doc.documentElement.children].filter(el => local(el) === 'process')){
    reorder(proc, el => NODE.test(local(el)) && local(el) !== 'boundaryEvent', rnd, doc);
    reorder(proc, el => local(el) === 'boundaryEvent', rnd, doc);
    reorder(proc, el => local(el) === 'sequenceFlow', rnd, doc);
    for (const lane of proc.querySelectorAll('*')) if (local(lane) === 'lane') reorder(lane, el => local(el) === 'flowNodeRef', rnd, doc);
  }
  return doc.toString();
}
