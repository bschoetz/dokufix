// Builds dist/dokufix.html, the one file that is dokufix, from the sources in src/,
// and beside it dist/dokufix-showcase.html, the same page with a demo text of its
// own: src/showcase.md, short, each core feature once, for a first look. The two
// files differ in the #dokufix-demo block alone; the demo text src/demo.md, with
// every variant and special case, stays the text of the regression checks.
//
//   node build.mjs            write dist/dokufix.html and dist/dokufix-showcase.html
//   node build.mjs --check    write nothing; exit 1 when either file is missing or
//                             not what the sources give
//   node build.mjs --dev      write dist/dokufix.dev.html instead: the same page
//                             with script and styles not minified and a source
//                             map in the script. For reading and debugging; not
//                             in git, never the committed file, and --check does
//                             not look at it. Of the demo text only: no showcase
//   node build.mjs --dev --watch
//                             the same, and again whenever a file under src/
//                             changes ("npm run watch")
//
// Options, for the tests, which build copies of src/:
//   --src <dir>    the sources (default: src/ beside this file)
//   --out <file>   the built file (default: dist/dokufix.html beside this file,
//                  with --dev dist/dokufix.dev.html)
//   --showcase-out <file>
//                  the showcase. Without --out and --showcase-out it is
//                  dist/dokufix-showcase.html beside this file; with either of
//                  them it is written, or checked, only where this one names it
//
// src/index.html is the page. It names each of the other sources once, as a slot:
//
//   {{slot:doc.css}}   document styles, minified, inside <style id="dokufix-doc-css">
//   {{slot:app.css}}   editor styles, minified, and behind them the styles of
//                      the search panel (src/search.css), minified
//   {{slot:app.js}}    the script: src/app.js with the modules it imports,
//                      bundled into one IIFE, minified
//   {{slot:demo.md}}   the demo text, as {"text": …} inside the #dokufix-demo block;
//                      in the showcase src/showcase.md
//   {{slot:reader.js}} the reader bundle of the read-only exports `schlank` and
//                      `kompakt`, the table filter and the search: src/reader.js
//                      with the modules it imports, bundled into one IIFE,
//                      minified also with --dev, inside
//                      <script type="text/plain" id="dokufix-reader-js">, where
//                      it does not run; the two exports copy it into their file.
//                      It carries src/search.css, minified, as the string
//                      SEARCH_CSS (an esbuild define), and adds it to the file
//                      it runs in: the panel has one stylesheet, in the page
//                      and in an export
//   {{slot:layout.js}} the layout of BPMN without coordinates as the script of
//                      a Web Worker: src/layout-worker.js with the modules it
//                      imports, bundled into one IIFE, minified also with
//                      --dev, inside <script type="text/plain"
//                      id="dokufix-layout-js">, where it does not run; the
//                      page makes a classic worker of it through a Blob URL
//                      (src/app/layout-client.js). The script carries the same
//                      modules for a page without a worker
//   {{slot:assets}}    the images of the demo text, from src/assets/, as
//                      {"<sha256>": {"m": mime, "d": base64}} inside the
//                      #dokufix-assets block, which the page seeds into its
//                      storage when it opens
//
// An image of the demo text lies in src/assets/ under its SHA-256, the name the
// demo text refers to it by: src/assets/<sha256>.webp, ![…](#asset-<sha256>).
// Both files carry every image of src/assets/; each demo text is checked against
// it on its own.
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
// The build exits 1, and writes nothing, neither file, when
//   - a source is missing;
//   - a slot is missing from the page, stands there twice, or is not one of the seven;
//   - a file in src/assets/ is not named <sha256>.<ext> by the SHA-256 of its
//     bytes, or has a type an image of the page cannot have; the page refuses
//     an image whose bytes do not give its hash;
//   - the demo text or the showcase text refers to an image (#asset-<hash>) that
//     src/assets/ does not hold; the message names the text;
//   - the minified script, the reader bundle or the layout's worker contains
//     "</script" or "<!--",
//     or a minified stylesheet "</style": each would break its element, in the
//     built file and in every file saved from it;
//   - esbuild reports an error, such as a module that imports a name the other
//     module does not export, or a file that is not there, or that assigns to a
//     name it imported.
//
// Two builds of the same sources are byte-identical, which is what --check and
// the committed dist/dokufix.html and dist/dokufix-showcase.html rely on: no
// time, no path and no random value goes into the file. (The --dev file carries the paths of the sources in its
// source map, relative to where it is written.)

import * as esbuild from 'esbuild';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// The committed file, and the readable one beside it.
const COMMITTED = path.join(here, 'dist', 'dokufix.html');
const DEV = path.join(here, 'dist', 'dokufix.dev.html');
// The committed showcase: the same page with src/showcase.md as its demo text.
const SHOWCASE = path.join(here, 'dist', 'dokufix-showcase.html');

export const SLOTS = ['doc.css', 'app.css', 'app.js', 'reader.js', 'layout.js', 'demo.md', 'assets'];
const SLOT_RE = /\{\{slot:([^{}]*)\}\}/g;

export class BuildError extends Error {}

// JSON for a <script type="application/json"> block. Every "<" is written as
// <, so no text can end the block ("</script>") or open a comment in it
// ("<!--"). JSON.parse gives the text back unchanged.
export function jsonForDataBlock(value){
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// Puts the finished parts into the page. parts: { 'doc.css', 'app.css', 'app.js',
// 'reader.js', 'layout.js', 'demo.md', 'assets' }, each the text that replaces
// its slot.
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
  for (const [name, what] of [['app.js', 'the minified script'], ['reader.js', 'the reader bundle'], ['layout.js', 'the layout\'s worker']]){
    const text = parts[name] || '';
    if (/<\/script/i.test(text)) problems.push(what + ' contains "</script"; it would end the script element early');
    if (text.includes('<!--')) problems.push(what + ' contains "<!--"; together with a "<script" behind it, it would keep the script element from ending');
  }
  for (const name of ['doc.css', 'app.css']){
    if (/<\/style/i.test(parts[name])) problems.push('the minified ' + name + ' contains "</style"; it would end the style element early');
  }
  if (problems.length) throw new BuildError(problems.join('\n'));
  // A function as replacement: "$&" and "$1" in a source are text, not patterns.
  return template.replace(SLOT_RE, (m, name) => parts[name]);
}

function printWarnings(warnings, file){
  for (const w of warnings){
    // The location names the file the warning is in: for the script that is the
    // module, not the entry it was bundled from.
    const at = w.location ? w.location.file + ':' + w.location.line + ':' + w.location.column : file;
    console.error('warning: ' + at + ': ' + w.text);
  }
}

async function minifyCss(css, name, dev){
  const result = await esbuild.transform(css,
    { loader: 'css', minify: !dev, charset: 'utf8', sourcefile: name, logLevel: 'silent' });
  printWarnings(result.warnings, name);
  return result.code.trim();
}

// The images of the demo text, by type of file.
const ASSET_TYPES = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };
// How the page refers to an image: the hash after "#asset-" (src/app/assets.js).
const ASSET_REF_RE = /#asset-([0-9a-f]{12,64})/gi;

// The block of the images: every file in src/assets/, in the order of its name,
// checked against its name; and every image the demo text names, checked
// against the block. demoName: the demo text's file, for the message. Returns
// the object the block holds.
export function readAssets(dir, demo, demoName = 'demo.md'){
  const out = {};
  const problems = [];
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => !f.startsWith('.')).sort() : [];
  for (const file of files){
    const m = /^([0-9a-f]{64})(\.[a-z]+)$/.exec(file);
    const type = m && ASSET_TYPES[m[2]];
    if (!type){
      problems.push('src/assets/' + file + ': an image is named <sha256>.<ext>, with one of ' + Object.keys(ASSET_TYPES).join(' '));
      continue;
    }
    const bytes = fs.readFileSync(path.join(dir, file));
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (hash !== m[1]){
      problems.push('src/assets/' + file + ': its bytes hash to ' + hash + ', not to its name; the page would refuse it');
      continue;
    }
    out[hash] = { m: type, d: bytes.toString('base64') };
  }
  for (const ref of new Set(Array.from(demo.matchAll(ASSET_REF_RE), r => r[1].toLowerCase()))){
    if (!out[ref]) problems.push(demoName + ' refers to #asset-' + ref + ', which src/assets/ does not hold');
  }
  if (problems.length) throw new BuildError(problems.join('\n'));
  return out;
}

// dev: not minified, and the source map stands at the end of the script as a
// data: URL, so the one file is still all there is. outFile is where the page
// will be written; the map names the sources relative to it. define: names the
// script uses that the build replaces with a value, as esbuild's define.
async function bundleScript(file, dev, outFile, define = {}){
  const result = await esbuild.build({
    entryPoints: [file],
    bundle: true,
    format: 'iife',
    minify: !dev,
    // Without this esbuild writes every non-ASCII character as an escape.
    charset: 'utf8',
    write: false,
    logLevel: 'silent',
    define,
    ...(dev ? { sourcemap: 'inline', outfile: outFile.replace(/\.html$/, '') + '.js' } : {}),
  });
  printWarnings(result.warnings, path.basename(file));
  // See the header: "<!--" must not stand in a script element.
  return result.outputFiles[0].text.trim().replaceAll('<!--', '\\x3c!--');
}

// The built page as a string. options: { dev, out }, see bundleScript(), and
// demo, the file of the demo text in srcDir: 'demo.md', or 'showcase.md' for
// the showcase.
export async function build(srcDir, options = {}){
  const dev = !!options.dev;
  const demoName = options.demo || 'demo.md';
  const read = name => {
    const file = path.join(srcDir, name);
    if (!fs.existsSync(file)) throw new BuildError('source not found: ' + file);
    return fs.readFileSync(file, 'utf8');
  };
  const template = read('index.html');
  const demo = read(demoName);
  const docCss = read('doc.css'), appCss = read('app.css'), searchCss = read('search.css');
  read('app.js');   // esbuild reads them itself; this is for the message when one is missing
  read('reader.js');
  read('layout-worker.js');
  let parts;
  try {
    // The panel's styles, minified once for the reader bundle, which is
    // minified with --dev as well; the page takes the same text, or with
    // --dev the readable one.
    const searchMin = await minifyCss(searchCss, 'search.css', false);
    const searchPage = dev ? await minifyCss(searchCss, 'search.css', true) : searchMin;
    if (/<\/style/i.test(searchMin)) throw new BuildError('the minified search.css contains "</style"; it would end the style element early');
    parts = {
      'doc.css': await minifyCss(docCss, 'doc.css', dev),
      'app.css': (await minifyCss(appCss, 'app.css', dev)) + '\n' + searchPage,
      'app.js': await bundleScript(path.join(srcDir, 'app.js'), dev, options.out || DEV),
      // Minified with --dev as well: an export carries it as it is.
      'reader.js': await bundleScript(path.join(srcDir, 'reader.js'), false, null, { SEARCH_CSS: JSON.stringify(searchMin) }),
      // Minified with --dev as well: the --dev script carries the same modules
      // readable, for the page without a worker.
      'layout.js': await bundleScript(path.join(srcDir, 'layout-worker.js'), false, null),
      'demo.md': jsonForDataBlock({ text: demo }),
      'assets': jsonForDataBlock(readAssets(path.join(srcDir, 'assets'), demo, demoName)),
    };
  } catch (e){
    if (!e || !Array.isArray(e.errors)) throw e;
    throw new BuildError(e.errors.map(x =>
      (x.location ? x.location.file + ':' + x.location.line + ':' + x.location.column + ': ' : '') + x.text).join('\n'));
  }
  return assemble(template, parts);
}

function parseArgs(argv){
  const a = { check: false, dev: false, watch: false, src: path.join(here, 'src'), out: null, showcaseOut: null };
  const valued = { '--src': 'src', '--out': 'out', '--showcase-out': 'showcaseOut' };
  for (let i = 0; i < argv.length; i++){
    const k = argv[i];
    if (k === '--check' || k === '--dev' || k === '--watch') a[k.slice(2)] = true;
    else if (Object.hasOwn(valued, k)){
      if (argv[i + 1] === undefined) throw new BuildError(k + ' needs a value');
      a[valued[k]] = path.resolve(argv[++i]);
    }
    else throw new BuildError('unknown argument: ' + k);
  }
  if (a.dev && a.check) throw new BuildError('--dev and --check do not go together: the check is about the committed file, which is the minified one');
  if (a.watch && !a.dev) throw new BuildError('--watch goes with --dev: the committed file is built on purpose, not on every change');
  if (a.dev && a.showcaseOut !== null) throw new BuildError('--dev and --showcase-out do not go together: the readable file is of the demo text only');
  // Without either output named: both committed files, or with --dev the readable one.
  if (a.out === null && a.showcaseOut === null && !a.dev) a.showcaseOut = SHOWCASE;
  if (a.out === null) a.out = a.dev ? DEV : COMMITTED;
  // The readable file must never take the place of a committed one.
  for (const file of [COMMITTED, SHOWCASE]){
    if (a.dev && a.out === file) throw new BuildError('--dev does not write ' + path.relative(here, file) + ': that is a committed file, and it is a minified one');
  }
  if (a.out === a.showcaseOut) throw new BuildError('--out and --showcase-out name the same file: ' + a.out);
  return a;
}

const shownPath = file => path.relative(process.cwd(), file) || file;
const shownSize = html => Buffer.byteLength(html).toLocaleString('en-US').replace(/,/g, ' ') + ' B';

// What a run builds: [file, html] for the built file and, if one is asked for,
// the showcase. Both are built before either is written or compared, so a
// source that breaks one of them leaves both files as they were.
async function buildAll(opts){
  const jobs = [[opts.out, build(opts.src, { dev: opts.dev, out: opts.out })]];
  if (opts.showcaseOut) jobs.push([opts.showcaseOut, build(opts.src, { demo: 'showcase.md' })]);
  const htmls = await Promise.all(jobs.map(([, job]) => job));
  return jobs.map(([file], i) => [file, htmls[i]]);
}

async function buildAndWrite(opts){
  for (const [file, html] of await buildAll(opts)){
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
    console.log(shownPath(file) + ' written (' + shownSize(html) + (opts.dev ? ', not minified, with a source map' : '') + ')');
  }
}

// Builds, then builds again whenever something under the sources changes. A
// build that fails says why and leaves the last file; the watch goes on.
async function watch(opts){
  let running = false, again = false, timer = null;
  const once = async () => {
    if (running){ again = true; return; }
    running = true;
    try { await buildAndWrite(opts); }
    catch (e){ console.error(e instanceof BuildError ? e.message : e); }
    running = false;
    if (again){ again = false; once(); }
  };
  await once();
  // An editor writes a file in several steps; one build for all of them.
  fs.watch(opts.src, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(once, 100);
  });
  console.log('watching ' + shownPath(opts.src) + ' (Ctrl+C ends it)');
}

async function main(){
  const opts = parseArgs(process.argv.slice(2));
  if (opts.watch) return watch(opts);
  if (opts.check){
    // Every file is looked at, and every one that is not current named.
    const problems = [];
    for (const [file, html] of await buildAll(opts)){
      const shown = shownPath(file);
      if (!fs.existsSync(file)) problems.push(shown + ' is missing; run "npm run build"');
      else if (fs.readFileSync(file, 'utf8') !== html) problems.push(shown + ' is stale: it is not what the sources give; run "npm run build" and commit the result');
      else console.log(shown + ' is up to date (' + shownSize(html) + ')');
    }
    if (problems.length) throw new BuildError(problems.join('\n'));
    return;
  }
  await buildAndWrite(opts);
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
