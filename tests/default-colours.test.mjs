// The default colours tests/vergleich.mjs expects are the ones the :root rule
// of src/doc.css gives: a change to a default colour fails here, not silently.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOT_VARS } from './css-colours.mjs';
import { DEFAULT_COLOURS, computedColour } from './default-colours.mjs';

test('the :root rule of src/doc.css gives exactly the default colours of the comparison run', () => {
  const got = Object.fromEntries(Object.keys(DEFAULT_COLOURS).map(name =>
    [name, ROOT_VARS['--dokufix-' + name] === undefined ? 'missing' : computedColour(ROOT_VARS['--dokufix-' + name])]));
  assert.deepEqual(got, DEFAULT_COLOURS);
});

test('computedColour gives the browser form', () => {
  assert.equal(computedColour('#fff'), 'rgb(255, 255, 255)');
  assert.equal(computedColour('#0066cc'), 'rgb(0, 102, 204)');
  assert.equal(computedColour('rgba(212,255,0,.30)'), 'rgba(212, 255, 0, 0.3)');
  assert.equal(computedColour('red'), null);
});
