// Why a picture changes with the order of the text annotations: per fixture and variant the order the text
// annotations are placed in, where each stands (side of its partner, gap, box), the size of the picture, its breaks.
//   node warum-notizen.mjs <fixture> [variant…]     variant: "notes/pools/messages/assocs" or "heute"
import { fixtures } from '../review/measure.mjs';
import { lay, noteGaps } from './messen-notizen.mjs';
const [name, ...vs] = process.argv.slice(2);
const variants = vs.length ? vs : ['heute', 'partner/canon/ends/canon'];
const fx = fixtures.readFixture(name), model = fixtures.readModel(fx.xml).model;
const side = ([x, y, w, h], [X, Y, W, H]) => {
  const cx = x + w / 2, cy = y + h / 2, CX = X + W / 2, CY = Y + H / 2;
  const dx = cx - CX, dy = cy - CY;
  const horiz = x >= X + W ? 'rechts' : x + w <= X ? 'links' : '';
  const vert = y >= Y + H ? 'unten' : y + h <= Y ? 'oben' : '';
  return (vert + ' ' + horiz).trim() || ('überlappt ' + dx.toFixed(0) + '/' + dy.toFixed(0));
};
const partnerBox = (L, a) => a.kind === 'flow' || a.kind === 'message' ? (pts => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; })(L.di.flows[a.partner]) : a.kind === 'pool' ? L.di.shapes[a.partner] : L.di.shapes[a.partner];
for (const v of variants){
  const L = lay(fx.xml, model, fx.sizes, v), gaps = noteGaps(L);
  console.log('## ' + name + ' · ' + v + ': ' + L.width + '×' + L.height + ', Verstöße ' + L.breaks.length + ', Kreuzungen ' + L.crossings + ', Knicke ' + L.bends);
  for (const b of L.breaks) console.log('   ! ' + b);
  let g = 0;
  L.model.notes.forEach((n, i) => {
    const a = L.model.associations.find(x => x.note === n.id), box = L.di.shapes[n.id], pb = partnerBox(L, a);
    console.log('   ' + (i + 1) + '. ' + n.id + ' → ' + a.kind + ' ' + a.partner + ': ' + side(box, pb) + (a.kind === 'pool' ? '' : ', Abstand ' + gaps[g++].toFixed(0)) + ', Box ' + JSON.stringify(box) + ' Partner ' + JSON.stringify(pb) + ' „' + n.text.slice(0, 40).replace(/\n/g, ' ') + '“');
  });
}
