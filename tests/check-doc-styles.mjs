// Fails when a style for document content sits anywhere but in its one source.
//
//   node tests/check-doc-styles.mjs [--src <dir>] [--built <file>]
//                    (defaults: ../src and ../dist/dokufix.html)
//
// Every style that travels with a document lives in src/doc.css. The build puts
// it into <style id="dokufix-doc-css">; the preview uses that block directly,
// the read-only exports embed its text. A document rule written anywhere else
// reaches some variants and not others, and nothing in a browser tells you.
// That is how the anchor positioning of the footnote preview once shipped in
// the editor and in no read-only export.
//
// The check reads the sources, because that is where a rule is written and
// where a line number helps:
//
//   doc.css      the block
//   app.css      the app stylesheet
//   search.css   the search panel's stylesheet, which the build puts behind
//                the app stylesheet and into the reader bundle of `schlank`
//                and `kompakt`; frame, like the panel
//   every .js    under src/, the script and its modules: the export frame
//                (READONLY_FRAME_CSS), the downloadReadonly… functions and
//                every <style> they write, in whichever module they stand
//   index.html   the page: the block's element with its slot, the preview
//
// and the built file for the one thing only it can show: that the block
// arrived. In the built file script and styles are minified and bundled, the
// names this check looks for are gone, so nothing else is read from it.
//
// Checks, one line each. Exit 0 when all hold, exit 1 otherwise. A problem
// names its file and line.
//
//   1. the page has the block's element exactly once, holding the doc.css slot
//   2. every selector in doc.css starts with .dokufix-doc (or .numbered
//      .dokufix-doc), or with .dokufix-rail; the one selector of
//      BLOCK_EXCEPTIONS stands as it is
//   3. no document rule outside doc.css. In the export frame: no selector
//      but the ones listed in FRAME_SELECTORS. In every other stylesheet: no
//      .dokufix-doc selector, no "#preview <descendant>", no dokufix- name and
//      no class or attribute name the block's own selectors use, unless
//      allowlisted
//   4. the content containers carry the shared class
//   5. every read-only export builds its stylesheet with readonlyCss()
//   6. the old twin READONLY_CSS is gone
//   7. the built file has exactly one block, and it is not empty
//
// The allowlists are the frame: things that exist only around a document, not in it.
// dokufix's own components are dokufix- prefixed (NFR5), but what marked,
// marked-footnote and Mermaid produce is not (.footnotes,
// [data-footnote-ref]). So the prefix alone is not the test: every class and
// attribute name that a selector of the block uses counts as a document construct.
//
// What the check cannot see: a rule that reaches document content through some
// other ancestor and names none of these (".pane-preview h5"), and CSS nesting,
// which this reader does not unfold.
//
// No dependencies. Plain text and a CSS reader just big enough for these files.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOCK_ID = 'dokufix-doc-css';
const DOC_CLASS = 'dokufix-doc';
const FRAME_CONST = 'READONLY_FRAME_CSS';
const HELPER = 'readonlyCss';
const OLD_TWIN = 'READONLY_CSS';
// How src/index.html names a source; build.mjs replaces it with the source.
const SLOT = name => '{{slot:' + name + '}}';

// dokufix- names a stylesheet outside the block may use. .dokufix-rail only where
// the selector is about layout (.has-items) or the scrollspy (a.active); its look
// is a document style. .dokufix-licences and .dokufix-licences-view are the link
// "license information" and its view (src/app/licences.js): frame, the element
// stands outside the content container. Each name is listed; another name that
// begins the same way is not allowed by that.
const ALLOWED_ALWAYS = new Set(['.dokufix-meta', '.dokufix-rail-pending', '.dokufix-licences', '.dokufix-licences-view']);
const railAllowed = sel => /\.has-items\b/.test(sel) || /\ba\.active\b/.test(sel);
// Selectors outside the block that may use a class or attribute name the block
// uses too, or one of its dokufix- names, because they style something else:
// the editor's version dialog, and the "diagram needs JavaScript" notice of the
// schlank export, which stands only where scripts are off.
const ALLOWED_OUTSIDE = new Set(['.version-modal[open]', '.dokufix-diagram-svg[data-gz]', '.dokufix-diagram-svg[data-gz]::before',
  // the noscript style of schlank: no line of downloads, the credit alone (story 2.10)
  '.dokufix-diagram-downloads', '.dokufix-diagram-downloads+.dokufix-diagram-credit']);
// The export frame, selector by selector. Anything else in READONLY_FRAME_CSS
// fails: a rule for document content belongs into the block, and a new frame
// rule is added here on purpose.
const FRAME_SELECTORS = new Set([
  '*', 'body', '.reader-body', '.dokufix-meta', '.dokufix-meta p', 'noscript p',
  'body:has(aside.dokufix-rail.has-items)', 'body:has(aside.dokufix-rail.has-items) .reader-body',
  '.dokufix-rail.has-items', '.dokufix-rail-pending',
  // the link "license information" and its view
  '.dokufix-licences', '.dokufix-licences summary', '.dokufix-licences summary::-webkit-details-marker',
  '.dokufix-licences summary:hover', '.dokufix-licences-view', '.dokufix-licences-view p',
  '.dokufix-licences-view ul', '.dokufix-licences-view li',
  'body:has(aside.dokufix-rail.has-items) .dokufix-licences',
]);

// Selectors of the block that start with something else than the content
// container, each listed with its reason, as written. Only these: another
// selector that begins the same way fails like any other.
//   html:has(.dokufix-diagram-toggle:checked)   while the large view of a
//     diagram is open (story 2.9) the page behind it must not scroll. In read
//     mode and in the exports the page is what scrolls, and its root is the
//     only element that can stop that; the content container cannot.
// Their names are not taken for the block's (check 3): they are the frame's.
const BLOCK_EXCEPTIONS = new Set(['html:has(.dokufix-diagram-toggle:checked)']);

// ---------- arguments and files ----------
const here = path.dirname(fileURLToPath(import.meta.url));
const args = { src: path.join(here, '../src'), built: path.join(here, '../dist/dokufix.html') };
for (let i = 2; i < process.argv.length; i++){
  const k = process.argv[i];
  if ((k === '--src' || k === '--built') && process.argv[i + 1] !== undefined) args[k.slice(2)] = process.argv[++i];
  else { console.error('usage: node check-doc-styles.mjs [--src <dir>] [--built <file>]'); process.exit(1); }
}
const srcDir = path.resolve(args.src);
const builtFile = path.resolve(args.built);

// A source file: its text, and the name problems call it by ("src/app.css").
function source(name){
  const file = path.join(srcDir, name);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  return { name: path.join(path.basename(srcDir), name), text: text === null ? '' : text, missing: text === null };
}
const page = source('index.html'), docCss = source('doc.css'), appCss = source('app.css'), searchCss = source('search.css');
// The script is src/app.js and the modules it imports. Every .js under src/ is
// read, in a fixed order, and a problem names the module it was found in.
const entry = source('app.js');
const scripts = (fs.existsSync(srcDir) ? fs.readdirSync(srcDir, { recursive: true }) : [])
  .filter(name => name.endsWith('.js')).sort().map(source);
const allScripts = path.join(path.basename(srcDir), '**', '*.js');
const lineOf = (text, offset) => text.slice(0, offset).split('\n').length;
const at = (src, offset) => src.name + ' line ' + lineOf(src.text, offset);

// ---------- a CSS reader, just big enough ----------
// Blanks out comments and the inside of strings, keeping every offset, so that
// braces and commas in content:"…" cannot be mistaken for structure.
function neutralise(css){
  return css.replace(/\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g,
    m => m[0] === '/' ? m.replace(/[^\n]/g, ' ') : m[0] + m.slice(1, -1).replace(/[^\n]/g, '_') + m[0]);
}
function matchingBrace(css, open){
  let depth = 0;
  for (let i = open; i < css.length; i++){
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return i;
  }
  return css.length;
}
function splitSelectors(prelude){
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < prelude.length; i++){
    const c = prelude[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0){ out.push(prelude.slice(start, i)); start = i + 1; }
  }
  out.push(prelude.slice(start));
  return out.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
// Yields { selector, atRule, offset }: one entry per selector of every style
// rule, and one entry per at-rule that has a name of its own (@position-try,
// @keyframes …). Descends into @media and @supports.
function* walk(cssRaw, base){
  const css = neutralise(cssRaw);
  let i = 0;
  while (i < css.length){
    const open = css.indexOf('{', i);
    const semi = css.indexOf(';', i);
    if (open < 0) break;
    if (semi >= 0 && semi < open){ i = semi + 1; continue; }   // @import and friends
    const prelude = css.slice(i, open);
    const offset = base + i + (prelude.length - prelude.trimStart().length);
    const close = matchingBrace(css, open);
    const head = prelude.trim();
    if (/^@(media|supports|layer|container)\b/.test(head)){
      yield* walk(cssRaw.slice(open + 1, close), base + open + 1);
    } else if (head.startsWith('@')){
      yield { atRule: head.replace(/\s+/g, ' '), selector: '', offset };
    } else {
      for (const selector of splitSelectors(head)) yield { selector, atRule: '', offset };
    }
    i = close + 1;
  }
}

// ---------- where CSS lives ----------
// A match never runs across another "<style": a comment in the script that
// mentions the tag must not swallow the JavaScript up to the next </style>.
const STYLE_RE = /<style\b([^>]*)>((?:(?!<style\b)[\s\S])*?)<\/style>/g;
const IS_BLOCK = new RegExp('\\bid=["\']' + BLOCK_ID + '["\']');

// The block is doc.css, all of it. Everything else that holds CSS is a
// stylesheet outside the block: { kind, css, base, src }.
const block = { css: docCss.text, base: 0, src: docCss };
const sheets = [{ kind: 'the app stylesheet', css: appCss.text, base: 0, src: appCss },
  { kind: 'the stylesheet of the search panel', css: searchCss.text, base: 0, src: searchCss }];
// In the page: the block's element, the element of the app stylesheet, and
// whatever else somebody may write there.
const pageBlocks = [];
for (const m of page.text.matchAll(STYLE_RE)){
  const base = m.index + m[0].indexOf('>') + 1;
  if (IS_BLOCK.test(m[1])){ pageBlocks.push({ content: m[2], offset: m.index }); continue; }
  if (m[2].trim() === SLOT('app.css')) continue;
  const css = m[2].replace(/\{\{slot:[^{}]*\}\}/g, s => ' '.repeat(s.length));
  sheets.push({ kind: 'a <style> in the page', css, base, src: page });
}
let frameFound = false;
for (const script of scripts){
  for (const m of script.text.matchAll(STYLE_RE)){
    // ${…} is a template placeholder inside a script, not CSS.
    const css = m[2].replace(/\$\{[^}]*\}/g, s => ' '.repeat(s.length));
    sheets.push({ kind: 'a <style> written by the script', css, base: m.index + m[0].indexOf('>') + 1, src: script });
  }
  const frame = script.text.match(new RegExp('\\b' + FRAME_CONST + '\\s*=\\s*`([\\s\\S]*?)`'));
  if (frame){
    frameFound = true;
    sheets.push({ kind: 'the export frame (' + FRAME_CONST + ')', css: frame[1], base: frame.index + frame[0].indexOf('`') + 1, src: script, frame: true });
  }
}

// ---------- checks ----------
const results = [];
function check(title, problems){
  results.push({ title, problems });
}
const missing = [page, docCss, appCss, searchCss, entry].filter(s => s.missing).map(s => s.name + ' not found');

// 1
{
  const problems = [...missing];
  if (pageBlocks.length !== 1) problems.push(page.name + ': found ' + pageBlocks.length + ' blocks, expected exactly one');
  for (const b of pageBlocks){
    if (b.content.trim() !== SLOT('doc.css')){
      problems.push(at(page, b.offset) + ': the block holds something other than ' + SLOT('doc.css') + '; document styles are written in doc.css, and the build puts them here');
    }
  }
  const slots = page.text.split(SLOT('doc.css')).length - 1;
  if (pageBlocks.length === 1 && slots !== 1) problems.push(page.name + ': ' + SLOT('doc.css') + ' stands ' + slots + ' times, expected once, inside the block');
  check('one <style id="' + BLOCK_ID + '"> block in the page, filled from doc.css', problems);
}

// 2
// ".dokufix-doc" or ".numbered .dokufix-doc", then a space, a pseudo-class
// of the container itself (".dokufix-doc:has(…)") or the end; or
// ".dokufix-rail" as a whole class name, so not ".dokufix-rail-pending".
const IN_BLOCK = new RegExp('^(?:(?:\\.numbered )?\\.' + DOC_CLASS + '(?=[ :]|$)|\\.dokufix-rail(?![\\w-]))');
{
  const problems = [];
  for (const r of walk(block.css, block.base)){
    if (r.atRule) continue;
    if (!IN_BLOCK.test(r.selector) && !BLOCK_EXCEPTIONS.has(r.selector)){
      problems.push(at(block.src, r.offset) + ': "' + r.selector + '" does not start with .' + DOC_CLASS + ' or .dokufix-rail; in the block a selector starts with the content container and nothing in front of it');
    }
  }
  check('every selector in the block starts with .' + DOC_CLASS + ' or .dokufix-rail', problems);
}

// 3
// Class names (".footnotes") and attribute names ("[data-footnote-ref]") of a selector.
const namesIn = sel => [
  ...(sel.match(/\.-?[A-Za-z_][\w-]*/g) || []),
  ...[...sel.matchAll(/\[\s*([\w-]+)/g)].map(m => '[' + m[1] + ']'),
];
{
  const problems = [];
  const where = (sheet, r) => at(sheet.src, r.offset) + ', ' + sheet.kind + ': ';
  // What the block styles, by name. .dokufix-doc and .numbered are the scope,
  // not a construct; dokufix- names are judged by their own rule below.
  const blockNames = new Set();
  for (const r of walk(block.css, block.base)){
    if (!IN_BLOCK.test(r.selector)) continue;   // check 2 reports it; its names are not the block's
    for (const n of namesIn(r.selector)){
      if (n !== '.' + DOC_CLASS && n !== '.numbered' && !n.startsWith('.dokufix-')) blockNames.add(n);
    }
  }
  for (const sheet of sheets){
    for (const r of walk(sheet.css, sheet.base)){
      const text = r.selector || r.atRule;
      const quoted = '"' + text + '"';
      if (sheet.frame){
        if (!FRAME_SELECTORS.has(text)){
          problems.push(where(sheet, r) + quoted + ' is not one of the frame\'s selectors; a rule for document content goes into doc.css as .' + DOC_CLASS + ' …');
        }
        continue;
      }
      if (new RegExp('\\.' + DOC_CLASS + '\\b').test(text)){
        problems.push(where(sheet, r) + quoted + ' is a document rule; move it into doc.css');
        continue;
      }
      // "#preview" followed by a combinator and more: a rule for content inside
      // the preview. "#preview" itself, at the end of a selector, is the frame.
      if (/#preview(?![\w-])[^,]*?[\s>+~]+[^\s>+~,{]/.test(text.replace(/:(?:has|not|is|where)\([^()]*\)/g, ''))){
        problems.push(where(sheet, r) + quoted + ' styles content inside the preview; write it as .' + DOC_CLASS + ' … in doc.css');
        continue;
      }
      const names = text.match(/(?:\.|--)dokufix-[\w-]+/g) || [];
      const bad = names.filter(n => !(ALLOWED_ALWAYS.has(n) || (n === '.dokufix-rail' && railAllowed(text))));
      if (bad.length && !ALLOWED_OUTSIDE.has(text)){
        problems.push(where(sheet, r) + quoted + ' uses ' + [...new Set(bad)].join(', ') + ', a document construct; move it into doc.css');
        continue;
      }
      const shared = [...new Set(namesIn(text).filter(n => blockNames.has(n)))];
      if (shared.length && !ALLOWED_OUTSIDE.has(text)){
        problems.push(where(sheet, r) + quoted + ' uses ' + shared.join(', ') + ', which the document styles use; move it into doc.css');
      }
    }
  }
  if (!frameFound) problems.push(allScripts + ': the export frame ' + FRAME_CONST + ' was not found');
  check('no document rule outside the block', problems);
}

// 4 and 5 need the export functions. A function ends at a line that is exactly
// "}": the "})();" inside an export's template is not the end.
const exportFns = scripts.flatMap(script =>
  [...script.text.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+(downloadReadonly\w*)\s*\([^)]*\)\s*\{[\s\S]*?^\}$/gm)]
    .map(m => ({ name: m[1], body: m[0], offset: m.index, src: script })));

// 4
{
  const problems = [];
  const preview = page.text.match(/<article\b[^>]*\bid="preview"[^>]*>/);
  if (!preview || !new RegExp('\\bclass="[^"]*\\b' + DOC_CLASS + '\\b').test(preview[0])){
    problems.push((preview ? at(page, preview.index) : page.name) + ': #preview does not carry class "' + DOC_CLASS + '"');
  }
  for (const fn of exportFns){
    const main = fn.body.match(/<main\b[^>]*>/);
    if (!main || !new RegExp('\\bclass="[^"]*\\b' + DOC_CLASS + '\\b').test(main[0])){
      problems.push(at(fn.src, fn.offset) + ', ' + fn.name + '(): its <main> does not carry class "' + DOC_CLASS + '"');
    }
  }
  check('the content containers carry class "' + DOC_CLASS + '"', problems);
}

// 5
{
  const problems = [];
  if (!exportFns.length) problems.push(allScripts + ': no downloadReadonly…() function found');
  const helperIn = scripts.find(script => new RegExp('function\\s+' + HELPER + '\\s*\\(').test(script.text));
  if (!helperIn) problems.push(allScripts + ': the helper ' + HELPER + '() is missing');
  else if (!new RegExp('function\\s+' + HELPER + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?' + BLOCK_ID + '[\\s\\S]*?^\\}$', 'm').test(helperIn.text)){
    problems.push(helperIn.name + ': ' + HELPER + '() does not read #' + BLOCK_ID);
  }
  for (const fn of exportFns){
    const styles = [...fn.body.matchAll(/<style\b[^>]*>((?:(?!<style\b)[\s\S])*?)<\/style>/g)].filter(m => !/<noscript>\s*$/.test(fn.body.slice(0, m.index)));
    const uses = styles.some(m => m[1].trim() === '${' + HELPER + '()}');
    if (!uses) problems.push(at(fn.src, fn.offset) + ', ' + fn.name + '(): does not embed the document styles; its template needs <style>${' + HELPER + '()}</style>');
    else if (styles.length > 1) problems.push(at(fn.src, fn.offset) + ', ' + fn.name + '(): has a second <style> beside ${' + HELPER + '()}');
  }
  check('every read-only export uses ' + HELPER + '()', problems);
}

// 6
{
  const problems = [];
  for (const src of [...scripts, page]){
    for (const m of src.text.matchAll(new RegExp('\\b' + OLD_TWIN + '\\b', 'g'))) problems.push(at(src, m.index) + ': ' + OLD_TWIN + ' is back');
  }
  check(OLD_TWIN + ' is gone', problems);
}

// 7
{
  const problems = [];
  const shown = path.relative(process.cwd(), builtFile) || builtFile;
  if (!fs.existsSync(builtFile)) problems.push(shown + ' not found; run "npm run build"');
  else {
    const built = fs.readFileSync(builtFile, 'utf8');
    const blocks = [...built.matchAll(STYLE_RE)].filter(m => IS_BLOCK.test(m[1]));
    // An opening tag without its match above is a block too: one that never closes.
    const opened = (built.match(new RegExp('<style\\b[^>]*\\bid=["\']' + BLOCK_ID + '["\']', 'g')) || []).length;
    if (blocks.length !== 1 || opened !== 1) problems.push(shown + ': found ' + Math.max(blocks.length, opened) + ' blocks, expected exactly one');
    for (const m of blocks){
      if (!m[2].trim()) problems.push(shown + ' line ' + lineOf(built, m.index) + ': the block is empty; the exports would carry no document styles');
    }
  }
  check('the built file has one <style id="' + BLOCK_ID + '"> block, not empty', problems);
}

// ---------- report ----------
let failed = 0;
for (const r of results){
  if (!r.problems.length){ console.log('ok    ' + r.title); continue; }
  failed++;
  console.log('FAIL  ' + r.title);
  for (const p of r.problems) console.log('        ' + p);
}
if (failed) console.log('\n' + failed + ' of ' + results.length + ' checks failed');
process.exit(failed ? 1 : 0);
