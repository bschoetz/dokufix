// The line jumps of src/app/line-jumps.js, on SVG parsed by linkedom: paths as
// bpmn-js writes them (M, L for each straight piece, C for each corner).

import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { addLineJumps } from '../src/app/line-jumps.js';

const svgOf = (...ds) => new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">' +
  ds.map((d, i) => '<g class="djs-element djs-connection" data-element-id="F' + i + '"><g class="djs-visual"><path d="' + d + '"/></g></g>').join('') +
  '</svg>', 'image/svg+xml').documentElement;
const dOf = (svg, i) => svg.querySelectorAll('.djs-visual > path')[i].getAttribute('d');

test('the horizontal piece jumps upwards over the vertical one, in either direction; the vertical one and the corners stay', () => {
  const svg = svgOf('M100,50L100,150', 'M0,100L200,100', 'M300,120L130,120C127.5,120,125,117.5,125,115L125,110', 'M120,0L120,200', 'M200,0L200,200');
  assert.equal(addLineJumps(svg), 3);
  assert.equal(dOf(svg, 0), 'M100,50L100,150');
  assert.equal(dOf(svg, 1), 'M0,100L95,100A5,5,0,0,1,105,100L115,100A5,5,0,0,1,125,100L200,100');
  // Going left: counter-clockwise, still upwards; the corner piece C is kept as it was.
  assert.equal(dOf(svg, 2), 'M300,120L205,120A5,5,0,0,0,195,120L130,120C127.5,120,125,117.5,125,115L125,110');
});

test('no jump near the end of a straight piece, none where the vertical one only touches, one for two crossings closer than a jump', () => {
  const svg = svgOf('M0,100L104,100', 'M100,50L100,150', 'M50,100L50,150', 'M200,50L200,150', 'M204,50L204,150', 'M150,100L300,100');
  assert.equal(addLineJumps(svg), 1);
  assert.equal(dOf(svg, 0), 'M0,100L104,100', 'the crossing is 4 px from its end');
  assert.equal(dOf(svg, 5), 'M150,100L195,100A5,5,0,0,1,205,100L300,100');
});
