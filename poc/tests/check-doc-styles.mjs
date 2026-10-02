// Fails when a style for document content sits anywhere but in its one source.
//
//   node poc/tests/check-doc-styles.mjs [file]      (default: ../dokufix-poc.html)
//
// Every style that travels with a document lives in <style id="dokufix-doc-css">.
// The preview uses that block directly, the read-only exports embed its text.
// A document rule written anywhere else reaches some variants and not others,
// and nothing in a browser tells you. That is how the anchor positioning of the
// footnote preview once shipped in the editor and in no read-only export.
//
// Checks, one line each. Exit 0 when all hold, exit 1 otherwise.
//
//   1. the block exists exactly once
//   2. every selector in the block starts with .dokufix-doc (or .numbered
//      .dokufix-doc), or with .dokufix-rail
//   3. no document rule outside the block. In the export frame: no selector
//      but the ones listed in FRAME_SELECTORS. In every other stylesheet: no
//      .dokufix-doc selector, no "#preview <descendant>", no dokufix- name and
//      no class or attribute name the block's own selectors use, unless
//      allowlisted
//   4. the content containers carry the shared class
//   5. every read-only export builds its stylesheet with readonlyCss()
//   6. the old twin READONLY_CSS is gone
//
// The allowlists are the frame: things that exist only around a document, not in it.
// dokufix's own components are dokufix- prefixed (NFR5), but what marked,
// marked-footnote and Mermaid produce is not (.footnotes, .mermaid,
// [data-footnote-ref]). So the prefix alone is not the test: every class and
// attribute name that a selector of the block uses counts as a document construct.
//
// What the check cannot see: a rule that reaches document content through some
// other ancestor and names none of these (".pane-preview h5"), and CSS nesting,
// which this reader does not unfold.
//
// No dependencies. Plain text and a CSS reader just big enough for this file.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOCK_ID = 'dokufix-doc-css';
const DOC_CLASS = 'dokufix-doc';
const FRAME_CONST = 'READONLY_FRAME_CSS';
const HELPER = 'readonlyCss';
const OLD_TWIN = 'READONLY_CSS';

// dokufix- names a stylesheet outside the block may use. .dokufix-rail only where
// the selector is about layout (.has-items) or the scrollspy (a.active); its look
// is a document style.
const ALLOWED_ALWAYS = new Set(['.dokufix-meta', '.dokufix-rail-pending']);
const railAllowed = sel => /\.has-items\b/.test(sel) || /\ba\.active\b/.test(sel);
// Selectors outside the block that may use a class or attribute name the block
// uses too, because they style something else: the editor's version dialog, and
// the "diagram needs JavaScript" notice of the schlank export.
const ALLOWED_OUTSIDE = new Set(['.version-modal[open]', '.mermaid[data-gz]', '.mermaid[data-gz]::before']);
// The export frame, selector by selector. Anything else in READONLY_FRAME_CSS
// fails: a rule for document content belongs into the block, and a new frame
// rule is added here on purpose.
const FRAME_SELECTORS = new Set([
  '*', 'body', '.reader-body', '.dokufix-meta', '.dokufix-meta p', 'noscript p',
  'body:has(aside.dokufix-rail.has-items)', 'body:has(aside.dokufix-rail.has-items) .reader-body',
  '.dokufix-rail.has-items', '.dokufix-rail-pending',
]);

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(process.argv[2] || path.join(here, '../dokufix-poc.html'));
const html = fs.readFileSync(file, 'utf8');
const lineOf = offset => html.slice(0, offset).split('\n').length;

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

// ---------- where CSS lives in the file ----------
const sources = [];   // { kind, css, base }
let blockCount = 0, block = null;
// A match never runs across another "<style": a comment in the script that
// mentions the tag must not swallow the JavaScript up to the next </style>.
const STYLE_RE = /<style\b([^>]*)>((?:(?!<style\b)[\s\S])*?)<\/style>/g;
for (const m of html.matchAll(STYLE_RE)){
  const base = m.index + m[0].indexOf('>') + 1;
  if (new RegExp('\\bid=["\']' + BLOCK_ID + '["\']').test(m[1])){
    blockCount++;
    if (!block) block = { css: m[2], base };
    continue;
  }
  // ${…} is a template placeholder inside a script, not CSS.
  const css = m[2].replace(/\$\{[^}]*\}/g, s => ' '.repeat(s.length));
  const inScript = html.lastIndexOf('<script', m.index) > html.lastIndexOf('</script>', m.index);
  sources.push({ kind: inScript ? 'a <style> written by the script' : 'the app stylesheet', css, base });
}
const frame = html.match(new RegExp('\\b' + FRAME_CONST + '\\s*=\\s*`([\\s\\S]*?)`'));
if (frame) sources.push({ kind: 'the export frame (' + FRAME_CONST + ')', css: frame[1], base: frame.index + frame[0].indexOf('`') + 1, frame: true });

// ---------- checks ----------
const results = [];
function check(title, problems){
  results.push({ title, problems });
}

// 1
check('one <style id="' + BLOCK_ID + '"> block',
  blockCount === 1 ? [] : ['found ' + blockCount + ' blocks, expected exactly one']);

// 2
// ".dokufix-doc" or ".numbered .dokufix-doc", then a space or the end; or
// ".dokufix-rail" as a whole class name, so not ".dokufix-rail-pending".
const IN_BLOCK = new RegExp('^(?:(?:\\.numbered )?\\.' + DOC_CLASS + '(?= |$)|\\.dokufix-rail(?![\\w-]))');
{
  const problems = [];
  if (block){
    for (const r of walk(block.css, block.base)){
      if (r.atRule) continue;
      if (!IN_BLOCK.test(r.selector)){
        problems.push('line ' + lineOf(r.offset) + ': "' + r.selector + '" does not start with .' + DOC_CLASS + ' or .dokufix-rail; in the block a selector starts with the content container and nothing in front of it');
      }
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
  const where = (src, r) => 'line ' + lineOf(r.offset) + ', ' + src.kind + ': ';
  // What the block styles, by name. .dokufix-doc and .numbered are the scope,
  // not a construct; dokufix- names are judged by their own rule below.
  const blockNames = new Set();
  if (block){
    for (const r of walk(block.css, block.base)){
      if (!IN_BLOCK.test(r.selector)) continue;   // check 2 reports it; its names are not the block's
      for (const n of namesIn(r.selector)){
        if (n !== '.' + DOC_CLASS && n !== '.numbered' && !n.startsWith('.dokufix-')) blockNames.add(n);
      }
    }
  }
  for (const src of sources){
    for (const r of walk(src.css, src.base)){
      const text = r.selector || r.atRule;
      const quoted = '"' + text + '"';
      if (src.frame){
        if (!FRAME_SELECTORS.has(text)){
          problems.push(where(src, r) + quoted + ' is not one of the frame\'s selectors; a rule for document content goes into #' + BLOCK_ID + ' as .' + DOC_CLASS + ' …');
        }
        continue;
      }
      if (new RegExp('\\.' + DOC_CLASS + '\\b').test(text)){
        problems.push(where(src, r) + quoted + ' is a document rule; move it into #' + BLOCK_ID);
        continue;
      }
      // "#preview" followed by a combinator and more: a rule for content inside
      // the preview. "#preview" itself, at the end of a selector, is the frame.
      if (/#preview(?![\w-])[^,]*?[\s>+~]+[^\s>+~,{]/.test(text.replace(/:(?:has|not|is|where)\([^()]*\)/g, ''))){
        problems.push(where(src, r) + quoted + ' styles content inside the preview; write it as .' + DOC_CLASS + ' … in #' + BLOCK_ID);
        continue;
      }
      const names = text.match(/(?:\.|--)dokufix-[\w-]+/g) || [];
      const bad = names.filter(n => !(ALLOWED_ALWAYS.has(n) || (n === '.dokufix-rail' && railAllowed(text))));
      if (bad.length){
        problems.push(where(src, r) + quoted + ' uses ' + [...new Set(bad)].join(', ') + ', a document construct; move it into #' + BLOCK_ID);
        continue;
      }
      const shared = [...new Set(namesIn(text).filter(n => blockNames.has(n)))];
      if (shared.length && !ALLOWED_OUTSIDE.has(text)){
        problems.push(where(src, r) + quoted + ' uses ' + shared.join(', ') + ', which the document styles use; move it into #' + BLOCK_ID);
      }
    }
  }
  if (!frame) problems.push('the export frame ' + FRAME_CONST + ' was not found');
  check('no document rule outside the block', problems);
}

// 4 and 5 need the export functions. A function ends at a line that is exactly
// "}": the "})();" inside an export's template is not the end.
const exportFns = [...html.matchAll(/^(?:async\s+)?function\s+(downloadReadonly\w*)\s*\([^)]*\)\s*\{[\s\S]*?^\}$/gm)]
  .map(m => ({ name: m[1], body: m[0], offset: m.index }));

// 4
{
  const problems = [];
  const preview = html.match(/<article\b[^>]*\bid="preview"[^>]*>/);
  if (!preview || !new RegExp('\\bclass="[^"]*\\b' + DOC_CLASS + '\\b').test(preview[0])){
    problems.push('#preview does not carry class "' + DOC_CLASS + '"');
  }
  for (const fn of exportFns){
    const main = fn.body.match(/<main\b[^>]*>/);
    if (!main || !new RegExp('\\bclass="[^"]*\\b' + DOC_CLASS + '\\b').test(main[0])){
      problems.push(fn.name + '(), line ' + lineOf(fn.offset) + ': its <main> does not carry class "' + DOC_CLASS + '"');
    }
  }
  check('the content containers carry class "' + DOC_CLASS + '"', problems);
}

// 5
{
  const problems = [];
  if (!exportFns.length) problems.push('no downloadReadonly…() function found');
  if (!new RegExp('function\\s+' + HELPER + '\\s*\\(').test(html)) problems.push('the helper ' + HELPER + '() is missing');
  else if (!new RegExp('function\\s+' + HELPER + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?' + BLOCK_ID + '[\\s\\S]*?^\\}$', 'm').test(html)){
    problems.push(HELPER + '() does not read #' + BLOCK_ID);
  }
  for (const fn of exportFns){
    const styles = [...fn.body.matchAll(/<style\b[^>]*>((?:(?!<style\b)[\s\S])*?)<\/style>/g)].filter(m => !/<noscript>\s*$/.test(fn.body.slice(0, m.index)));
    const uses = styles.some(m => m[1].trim() === '${' + HELPER + '()}');
    if (!uses) problems.push(fn.name + '(), line ' + lineOf(fn.offset) + ': does not embed the document styles; its template needs <style>${' + HELPER + '()}</style>');
    else if (styles.length > 1) problems.push(fn.name + '(), line ' + lineOf(fn.offset) + ': has a second <style> beside ${' + HELPER + '()}');
  }
  check('every read-only export uses ' + HELPER + '()', problems);
}

// 6
{
  const hits = [...html.matchAll(new RegExp('\\b' + OLD_TWIN + '\\b', 'g'))];
  check(OLD_TWIN + ' is gone', hits.map(m => 'line ' + lineOf(m.index) + ': ' + OLD_TWIN + ' is back'));
}

// ---------- report ----------
let failed = 0;
for (const r of results){
  if (!r.problems.length){ console.log('ok    ' + r.title); continue; }
  failed++;
  console.log('FAIL  ' + r.title);
  for (const p of r.problems) console.log('        ' + p);
}
if (failed) console.log('\n' + failed + ' of ' + results.length + ' checks failed in ' + path.relative(process.cwd(), file));
process.exit(failed ? 1 : 0);
