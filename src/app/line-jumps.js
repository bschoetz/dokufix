// --- Line jumps where two flows cross (prototype) ---------------------------
// Where a straight horizontal piece of a flow crosses a straight vertical one,
// the horizontal one jumps over it with a half circle, always upwards (Ben,
// 2026-10-07: only the horizontal one jumps, a message flow as well; slanted
// pieces are left out; a dashed line jumps as a solid one, and an association
// as a flow, since the layout leads none across a flow). It is drawing only:
// the XML, its waypoints and the layout stay as they are, so a modeler opening
// the .bpmn sees no jumps.
//
// It works on what bpmn-js has drawn, in a viewer's container after the import
// (and so in what saveSVG() gives) or in that SVG: the path of every
// connection, g.djs-connection > g.djs-visual > path, whose d bpmn-js writes as
// M, then L for each straight piece and C for each rounded corner. Corners are
// left as they are. A crossing nearer than r + END to the end of a straight
// piece gets no jump, so neither a corner nor an arrowhead does; one nearer
// than 2 r + END to the jump before it on the same piece neither, so two do
// not overlap. Pure DOM, no viewer: Node runs it on linkedom
// (tests/line-jumps.test.mjs).

export const JUMP_RADIUS = 5;
const END = 3;

const piecesOf = d => {
  const pieces = [];
  let at = null;
  for (const [, op, args] of d.matchAll(/([MLC])([^MLC]*)/g)){
    const end = args.split(/[\s,]+/).filter(Boolean).map(Number).slice(-2);
    if (op === 'L' && at) pieces.push({ a: at, b: end, op, args });
    else pieces.push({ op, args });
    at = end;
  }
  return pieces;
};

// root: an element holding the connections. Returns the number of jumps.
export function addLineJumps(root, r = JUMP_RADIUS){
  const paths = [...root.querySelectorAll('.djs-connection > .djs-visual > path')]
    .filter(p => /^M[^A-Za-z]*(?:[LC][^A-Za-z]*)*$/.test((p.getAttribute('d') || '').trim()))
    .map(path => ({ path, pieces: piecesOf(path.getAttribute('d')) }));
  const straight = paths.flatMap(p => p.pieces.filter(s => s.a));
  const horizontal = straight.filter(s => s.a[1] === s.b[1] && s.a[0] !== s.b[0]);
  const vertical = straight.filter(s => s.a[0] === s.b[0] && s.a[1] !== s.b[1]);
  const inside = (v, p, q, room) => v > Math.min(p, q) + room && v < Math.max(p, q) - room;
  let count = 0;
  for (const h of horizontal){
    const y = h.a[1], dir = Math.sign(h.b[0] - h.a[0]);
    const xs = vertical
      .filter(v => inside(v.a[0], h.a[0], h.b[0], r + END) && inside(y, v.a[1], v.b[1], END))
      .map(v => v.a[0])
      .sort((p, q) => (p - q) * dir);
    const jumps = [];
    for (const x of xs) if (!jumps.length || Math.abs(x - jumps[jumps.length - 1]) >= 2 * r + END) jumps.push(x);
    if (!jumps.length) continue;
    // Upwards: clockwise when going right, counter-clockwise when going left.
    const sweep = dir > 0 ? 1 : 0;
    h.jumps = jumps.map(x => 'L' + (x - dir * r) + ',' + y + 'A' + r + ',' + r + ',0,0,' + sweep + ',' + (x + dir * r) + ',' + y).join('');
    count += jumps.length;
  }
  for (const p of paths){
    if (!p.pieces.some(s => s.jumps)) continue;
    p.path.setAttribute('d', p.pieces.map(s => (s.jumps || '') + s.op + s.args.trim()).join(''));
  }
  return count;
}
