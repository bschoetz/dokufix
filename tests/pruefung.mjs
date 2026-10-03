// The browser runs of one verification, started side by side, with a table of
// each run's exit and time at the end.
//
//   npm run pruefung
//   npm run pruefung -- --out tests/out/x --run neu="--compare tests/out/alt --strict"
//
// Options
//   --out <dir>                 the folder of the verification (default: out/pruefung); each run
//                               writes to a folder of its own in it, named after the run, and its
//                               output to <name>.log beside it
//   --run <name>=<arguments>    one comparison run more (tests/vergleich.mjs with these arguments);
//                               it counts like a standard run
//   --control <name>=<arguments> a comparison run that is a control: it is listed with its exit and
//                               its screenshot comparison, for a human to judge, and not counted
//
// The standard runs need no arguments: the comparison run on the reference
// document and on the demo text, the save round trip and the failure cases,
// each on dist/dokufix.html. The arguments of --run and --control are split at
// blanks and must not name --out.
//
// Exit code 1 when a standard run or a --run fails. A run that failed is
// repeated alone before it counts as a fault; the command for that is printed.
// Nothing is repeated here: a run is started once.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareLibraries } from './cdn.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function parseArgs(argv){
  const a = { out: path.join(here, 'out/pruefung'), runs: [
    { name: 'referenz',    kind: 'standard', script: 'vergleich.mjs',   args: [] },
    { name: 'demo',        kind: 'standard', script: 'vergleich.mjs',   args: ['--demo'] },
    { name: 'speichern',   kind: 'standard', script: 'speichern.mjs',   args: [] },
    { name: 'durchlaeufe', kind: 'standard', script: 'durchlaeufe.mjs', args: [] },
  ] };
  for (let i = 0; i < argv.length; i++){
    const k = argv[i];
    if (!['--out', '--run', '--control'].includes(k)) throw new Error('unknown argument: ' + k);
    const value = argv[++i];
    if (value === undefined) throw new Error(k + ' needs a value');
    if (k === '--out'){ a.out = value; continue; }
    const m = value.match(/^([\w.-]+)=(.*)$/s);
    if (!m) throw new Error(k + ' takes <name>=<arguments of tests/vergleich.mjs>, got ' + JSON.stringify(value));
    const args = m[2].trim() ? m[2].trim().split(/\s+/) : [];
    if (args.includes('--out')) throw new Error(k + ' ' + m[1] + ': --out is given by this command (' + m[1] + ' in its folder)');
    if (a.runs.some(r => r.name === m[1])) throw new Error('two runs named ' + m[1]);
    a.runs.push({ name: m[1], kind: k === '--run' ? 'run' : 'control', script: 'vergleich.mjs', args });
  }
  a.out = path.resolve(a.out);
  for (const r of a.runs) r.args = [...r.args, '--out', path.join(a.out, r.name)];
  return a;
}

// Starts one run; resolves with its exit and time once it has ended.
function start(run, out){
  const log = fs.openSync(path.join(out, run.name + '.log'), 'w');
  const began = performance.now();
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(here, run.script), ...run.args], { stdio: ['ignore', log, log] });
    const end = code => {
      fs.closeSync(log);
      const result = { ...run, exit: code, seconds: (performance.now() - began) / 1000 };
      console.log(run.name + ': exit ' + code + ' after ' + result.seconds.toFixed(0) + ' s');
      resolve(result);
    };
    child.on('error', e => { fs.writeSync(log, String(e) + '\n'); end(-1); });
    child.on('exit', (code, signal) => end(code === null ? signal : code));
  });
}

// What a run's log says, in one line: per browser the assertions and, with
// --compare, the screenshots; for the other two runs their count of checks.
function summary(file){
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const parts = [];
  let browser = '';
  for (const line of text.split('\n')){
    const b = line.match(/^== (\w+) /);
    if (b){ browser = b[1]; continue; }
    const a = line.match(/^assertions: (.+)$/);
    if (a){ parts.push(browser + ' ' + a[1]); continue; }
    const s = line.match(/^screenshots: (.+)$/);
    if (s){ parts.push('screenshots ' + s[1]); continue; }
    const g = line.match(/^(\d+ of \d+ green)/);
    if (g){ parts.push(g[1]); continue; }
    if (/^refused|^cannot fetch|^not pinned/.test(line)) parts.push(line);
  }
  if (!parts.length){
    const last = text.trim().split('\n').pop() || '(no output)';
    parts.push(last.slice(0, 160));
  }
  return parts.join('; ');
}

const opts = parseArgs(process.argv.slice(2));
// The libraries once, before the runs start side by side: a missing one is
// fetched here, and without the network the command stops here.
try { await prepareLibraries(path.join(root, 'dist/dokufix.html')); }
catch (e){ console.error(e.message); process.exit(1); }
fs.mkdirSync(opts.out, { recursive: true });

console.log(opts.runs.length + ' runs side by side, in ' + opts.out);
const began = performance.now();
const results = await Promise.all(opts.runs.map(run => start(run, opts.out)));
const total = (performance.now() - began) / 1000;

const rows = results.map(r => [r.name, r.kind, String(r.exit), r.seconds.toFixed(0) + ' s', summary(path.join(opts.out, r.name + '.log'))]);
const head = ['run', 'kind', 'exit', 'time', 'result'];
const widths = head.map((h, i) => Math.max(h.length, ...rows.map(row => row[i].length)));
const line = row => row.map((cell, i) => i === row.length - 1 ? cell : cell.padEnd(widths[i])).join('  ');
console.log('\n' + line(head));
for (const row of rows) console.log(line(row));
console.log('\nall runs: ' + total.toFixed(0) + ' s; logs: ' + opts.out + '/<run>.log');

const faults = results.filter(r => r.kind !== 'control' && r.exit !== 0);
const controls = results.filter(r => r.kind === 'control');
if (controls.length) console.log('controls, not counted: ' + controls.map(r => r.name + ' exit ' + r.exit).join(', '));
if (faults.length){
  console.log('\nfailed: ' + faults.map(r => r.name).join(', ') + '. Repeat alone before it counts as a fault:');
  const quote = s => /^[\w./=:@-]+$/.test(s) ? s : "'" + s.replace(/'/g, "'\\''") + "'";
  for (const r of faults) console.log('  node ' + path.relative(process.cwd(), path.join(here, r.script)) + ' ' + r.args.map(quote).join(' '));
}
process.exit(faults.length ? 1 : 0);
