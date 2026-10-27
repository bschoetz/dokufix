// The Python tests of the script for language models (tests/test_dokufix_skript.py),
// so that npm test runs them with the rest. They need python3 and nothing else.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the Python tests of skill/dokufix/dokufix.py pass', () => {
  const r = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.error, undefined, String(r.error));
  assert.equal(r.status, 0, r.stderr);
});
