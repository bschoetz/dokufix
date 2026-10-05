import { TRANSIENT_ATTR } from './transient.js';
import { DIAGRAM_LANGUAGES } from './diagram-kinds.js';

// --- Code blocks: lines, numbers and the copy button (story 5.19) ------------
// A code block is light, numbered and wraps its long lines (Ben, 2026-10-05,
// variant C). Its numbers are CSS alone; what the script does is to put each
// line into an element of its own, so a line that wraps can hang under its
// own text and the counter has something to count:
//
//   <pre><code class="language-js">a\n\nb\n</code></pre>
//
//   <pre class="dokufix-code" style="--dokufix-code-digits:1"><code class="language-js"><span class="dokufix-code-line">a\n</span><span class="dokufix-code-line">\n</span><span class="dokufix-code-line">b\n</span></code></pre>
//
// The text of the code stays what it was, character for character: every
// line keeps its own "\n", so code.textContent is the same before and after,
// and the search, its hits, the copied text and every export read the same
// characters. The empty last line marked's final "\n" would make is no line.
// The number of digits of the last line's number goes onto the pre as a
// custom property, the width of the gutter (src/doc.css).
//
// A code block is a `pre` whose one element child is a `code` with text
// only, as marked writes a fenced or an indented block. Not one: a `pre`
// without a `code` (raw HTML), a `code` with markup in it (raw HTML, whose
// markup would be lost), the fenced source of a diagram, the raw text of the
// metadata panel (`pre.dokufix-fm-raw`), the detail of a warning and
// anything transient. Each keeps the look it has.
//
// The copy button is no part of the document: a run-time pass puts it into
// every numbered block where a script runs, the page and the reader bundle of
// `schlank` and `kompakt` (src/reader.js), transient, so no save and no export
// takes it along. A click copies the code as it is written, without the
// numbers and without the final "\n", through the Clipboard API, else
// through a hidden textarea and execCommand('copy'). Then for 2 s its icon
// is a check and its name "Kopiert"; when neither way worked, its name is
// "Kopieren fehlgeschlagen" for 2 s and the console says why, once.
//
// Pure logic, apart from what runs at a click: both passes work on the root
// they are handed and make their elements with its document.
// tests/code-blocks.test.mjs runs them in Node.

export const CODE_CLASS = 'dokufix-code';
export const LINE_CLASS = 'dokufix-code-line';
export const DIGITS_PROPERTY = '--dokufix-code-digits';
export const COPY_CLASS = 'dokufix-code-copy';
export const COPY_LABEL = 'Code kopieren';
export const COPIED_LABEL = 'Kopiert';
export const FAILED_LABEL = 'Kopieren fehlgeschlagen';
// The classes of the button while it says what happened.
export const COPIED_CLASS = 'dokufix-code-copied';
export const FAILED_CLASS = 'dokufix-code-failed';
// How long it says so.
export const FEEDBACK_MS = 2000;

const isTag = (node, tag) => node.nodeType === 1 && node.tagName.toUpperCase() === tag;

// The code of a pre that is a code block, or null.
function codeOf(pre){
  const kids = Array.from(pre.childNodes).filter(n => n.nodeType === 1 || (n.nodeType === 3 && n.data.trim()));
  if (kids.length !== 1 || !isTag(kids[0], 'CODE')) return null;
  const code = kids[0];
  if (Object.keys(DIAGRAM_LANGUAGES).some(lang => code.classList.contains('language-' + lang))) return null;
  // Where a pre is no code block, whatever it holds (warning.js, frontmatter.js).
  if (pre.closest('.dokufix-warning, .dokufix-frontmatter, [' + TRANSIENT_ATTR + ']')) return null;
  return code;
}

// The lines of a text, each with its "\n"; the empty line after a final "\n"
// is none, and an empty text is one empty line.
export function codeLines(text){
  const lines = String(text).split('\n').map(line => line + '\n');
  const last = lines.length - 1;
  lines[last] = lines[last].slice(0, -1);
  if (lines.length > 1 && lines[last] === '') lines.pop();
  return lines;
}

// Document pass "Code-Blöcke": every code block under root that has no lines
// yet gets them, its pre the class and the width of its gutter.
export function buildCodeLines(root){
  for (const pre of Array.from(root.querySelectorAll('pre'))){
    if (pre.classList.contains(CODE_CLASS)) continue;
    const code = codeOf(pre);
    if (!code || code.children.length) continue;
    const doc = pre.ownerDocument;
    const lines = codeLines(code.textContent);
    code.replaceChildren(...lines.map(text => {
      const line = doc.createElement('span');
      line.className = LINE_CLASS;
      line.textContent = text;
      return line;
    }));
    pre.classList.add(CODE_CLASS);
    const style = (pre.getAttribute('style') || '').trim();
    pre.setAttribute('style', (style ? style.replace(/;?$/, ';') : '') + DIGITS_PROPERTY + ':' + String(lines.length).length);
  }
}

// The text the button copies: the code as written, without its final "\n".
export function copiedText(code){
  return code.textContent.replace(/\n$/, '');
}

// Copies text through a textarea that is not seen and execCommand('copy');
// true when the browser says it did. The focus goes back where it was.
function copyThroughTextarea(doc, text){
  const back = doc.activeElement;
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.setAttribute(TRANSIENT_ATTR, '');
  area.setAttribute('style', 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none');
  doc.body.appendChild(area);
  try {
    if (typeof area.select === 'function') area.select();
    return doc.execCommand('copy') === true;
  } finally {
    area.remove();
    if (back && typeof back.focus === 'function') back.focus();
  }
}

// Copies text: the Clipboard API, else the textarea. Resolves with null when
// it worked, else with what went wrong.
export async function copyText(doc, text){
  const clipboard = doc.defaultView && doc.defaultView.navigator && doc.defaultView.navigator.clipboard;
  const why = err => String(err && err.message || err);
  let failed = 'no Clipboard API';
  if (clipboard && typeof clipboard.writeText === 'function'){
    try { await clipboard.writeText(text); return null; }
    catch (err){ failed = why(err); }
  }
  try {
    if (copyThroughTextarea(doc, text)) return null;
    failed += '; execCommand("copy") did not copy';
  } catch (err){ failed += '; ' + why(err); }
  return new Error(failed);
}

// The button's name and class: at rest, after a copy, after a failure.
function name(button, label, cls){
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.classList.remove(COPIED_CLASS, FAILED_CLASS);
  if (cls) button.classList.add(cls);
}

// Run-time pass "Code kopieren", and the reader bundle of `schlank` and
// `kompakt`: every numbered code block under root gets its copy button, once.
export function attachCodeCopy(root){
  for (const pre of Array.from(root.querySelectorAll('pre.' + CODE_CLASS))){
    if (Array.from(pre.children).some(el => el.classList.contains(COPY_CLASS))) continue;
    const code = Array.from(pre.children).find(el => isTag(el, 'CODE'));
    if (!code) continue;
    const doc = pre.ownerDocument;
    const button = doc.createElement('button');
    button.setAttribute('type', 'button');
    button.className = COPY_CLASS;
    button.setAttribute(TRANSIENT_ATTR, '');
    name(button, COPY_LABEL, null);
    let timer = null;
    button.addEventListener('click', async () => {
      const failed = await copyText(doc, copiedText(code));
      if (failed) console.error('Code copy failed:', failed.message);
      name(button, failed ? FAILED_LABEL : COPIED_LABEL, failed ? FAILED_CLASS : COPIED_CLASS);
      const win = doc.defaultView;
      if (timer !== null) win.clearTimeout(timer);
      timer = win.setTimeout(() => { timer = null; name(button, COPY_LABEL, null); }, FEEDBACK_MS);
    });
    pre.appendChild(button);
  }
}
