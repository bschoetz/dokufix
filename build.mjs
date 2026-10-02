// Builds dist/dokufix.html, the one file that is dokufix, from the sources in src/.
//
//   node build.mjs            write dist/dokufix.html
//   node build.mjs --check    write nothing; exit 1 when dist/dokufix.html is not
//                             what the sources give
//
// Options, for the tests, which build copies of src/:
//   --src <dir>    the sources (default: src/ beside this file)
//   --out <file>   the built file (default: dist/dokufix.html beside this file)
//
// src/index.html is the page. It names each of the other sources once, as a slot:
//
//   {{slot:doc.css}}   document styles, minified, inside <style id="dokufix-doc-css">
//   {{slot:app.css}}   editor styles, minified
//   {{slot:app.js}}    the script: bundled into one IIFE, minified
//   {{slot:demo.md}}   the demo text, as {"text": …} inside the #dokufix-demo block
//
// The page's own markup goes into the built file as it is written.
//
// One thing is done to the script after esbuild: every "<!--" in it is written
// as "\x3c!--". Inside a script element "<!--" followed by "<script" (which the
// templates of the read-only exports contain) keeps the real "</script>" from
// closing the element, and the page's script then never runs. esbuild guards
// "</script" but not this: minifying, it prints "<"+"!--" and "\x3c!--" as
// "<!--" again. In code it writes "<! --" itself, so what is left stands in a
// string, a template or a regular expression, and there \x3c is the same
// character. (Only the raw text of a tagged template would see the difference.)
//
// The build exits 1, and writes nothing, when
//   - a source is missing;
//   - a slot is missing from the page, stands there twice, or is not one of the four;
//   - the minified script contains "</script" or "<!--", or a minified stylesheet
//     "</style": each would break its element, in the built file and in every
//     file saved from it;
//   - esbuild reports an error.
//
// Two builds of the same sources are byte-identical, which is what --check and
// the committed dist/dokufix.html rely on: no time, no path and no random value
// goes into the file.

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const SLOTS = ['doc.css', 'app.css', 'app.js', 'demo.md'];
const SLOT_RE = /\{\{slot:([^{}]*)\}\}/g;

export class BuildError extends Error {}

// JSON for a <script type="application/json"> block. Every "<" is written as
// <, so no text can end the block ("</script>") or open a comment in it
// ("<!--"). JSON.parse gives the text back unchanged.
export function jsonForDataBlock(value){
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// Puts the finished parts into the page. parts: { 'doc.css', 'app.css', 'app.js',
// 'demo.md' }, each the text that replaces its slot.
export function assemble(template, parts){
  const found = [...template.matchAll(SLOT_RE)].map(m => m[1]);
  const problems = [];
  for (const name of SLOTS){
    const n = found.filter(f => f === name).length;
    if (n === 0) problems.push('slot {{slot:' + name + '}} is missing in index.html');
    if (n > 1) problems.push('slot {{slot:' + name + '}} stands ' + n + ' times in index.html, expected once');
  }
  for (const name of new Set(found.filter(f => !SLOTS.includes(f)))){
    problems.push('unknown slot {{slot:' + name + '}} in index.html; the slots are ' + SLOTS.join(', '));
  }
  if (/<\/script/i.test(parts['app.js'])) problems.push('the minified script contains "</script"; it would end the script element early');
  if (parts['app.js'].includes('<!--')) problems.push('the minified script contains "<!--"; together with a "<script" behind it, it would keep the script element from ending');
  for (const name of ['doc.css', 'app.css']){
    if (/<\/style/i.test(parts[name])) problems.push('the minified ' + name + ' contains "</style"; it would end the style element early');
  }
  if (problems.length) throw new BuildError(problems.join('\n'));
  // A function as replacement: "$&" and "$1" in a source are text, not patterns.
  return template.replace(SLOT_RE, (m, name) => parts[name]);
}

function printWarnings(warnings, file){
  for (const w of warnings){
    const at = w.location ? ':' + w.location.line + ':' + w.location.column : '';
    console.error('warning: ' + file + at + ': ' + w.text);
  }
}

async function minifyCss(css, name){
  const result = await esbuild.transform(css,
    { loader: 'css', minify: true, charset: 'utf8', sourcefile: name, logLevel: 'silent' });
  printWarnings(result.warnings, name);
  return result.code.trim();
}

async function bundleScript(file){
  const result = await esbuild.build({
    entryPoints: [file],
    bundle: true,
    format: 'iife',
    minify: true,
    // Without this esbuild writes every non-ASCII character as an escape.
    charset: 'utf8',
    write: false,
    logLevel: 'silent',
  });
  printWarnings(result.warnings, path.basename(file));
  // See the header: "<!--" must not stand in a script element.
  return result.outputFiles[0].text.trim().replaceAll('<!--', '\\x3c!--');
}

// The built page as a string.
export async function build(srcDir){
  const read = name => {
    const file = path.join(srcDir, name);
    if (!fs.existsSync(file)) throw new BuildError('source not found: ' + file);
    return fs.readFileSync(file, 'utf8');
  };
  const template = read('index.html');
  const demo = read('demo.md');
  const docCss = read('doc.css'), appCss = read('app.css');
  read('app.js');   // esbuild reads it itself; this is for the message when it is missing
  let parts;
  try {
    parts = {
      'doc.css': await minifyCss(docCss, 'doc.css'),
      'app.css': await minifyCss(appCss, 'app.css'),
      'app.js': await bundleScript(path.join(srcDir, 'app.js')),
      'demo.md': jsonForDataBlock({ text: demo }),
    };
  } catch (e){
    if (!e || !Array.isArray(e.errors)) throw e;
    throw new BuildError(e.errors.map(x =>
      (x.location ? x.location.file + ':' + x.location.line + ':' + x.location.column + ': ' : '') + x.text).join('\n'));
  }
  return assemble(template, parts);
}

function parseArgs(argv){
  const a = { check: false, src: path.join(here, 'src'), out: path.join(here, 'dist', 'dokufix.html') };
  for (let i = 0; i < argv.length; i++){
    const k = argv[i];
    if (k === '--check') a.check = true;
    else if (k === '--src' || k === '--out'){
      if (argv[i + 1] === undefined) throw new BuildError(k + ' needs a value');
      a[k.slice(2)] = path.resolve(argv[++i]);
    }
    else throw new BuildError('unknown argument: ' + k);
  }
  return a;
}

async function main(){
  const opts = parseArgs(process.argv.slice(2));
  const html = await build(opts.src);
  const shown = path.relative(process.cwd(), opts.out) || opts.out;
  const size = Buffer.byteLength(html).toLocaleString('en-US').replace(/,/g, ' ') + ' B';
  if (opts.check){
    if (!fs.existsSync(opts.out)) throw new BuildError(shown + ' is missing; run "npm run build"');
    if (fs.readFileSync(opts.out, 'utf8') !== html) throw new BuildError(shown + ' is stale: it is not what the sources give; run "npm run build" and commit the result');
    console.log(shown + ' is up to date (' + size + ')');
    return;
  }
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, html);
  console.log(shown + ' written (' + size + ')');
}

// Run as a command, not imported. The real path: started through a symlink,
// argv[1] names the link and import.meta.url the file behind it.
if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href){
  try {
    await main();
  } catch (e){
    if (!(e instanceof BuildError)) throw e;
    console.error(e.message);
    process.exit(1);
  }
}
