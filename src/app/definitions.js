import { fences } from './frontmatter.js';
import { buildWarning } from './warning.js';

// --- Labels defined twice ------------------------------------------------
// Pure logic: this module loads without a page. marked keeps the first
// definition of a link label and marked-footnote the first of a footnote
// label; a second one is dropped without a word. Across parts (frontmatter.js,
// readParts) that happens easily, so the document says so (Ben, 2026-10-28).
// shortcut: definitions inside a block quote or a list are not looked for;
// upgrade when a document needs them.

const FOOTNOTE_RE = /^ {0,3}\[\^([^\]]+)\]:/;
// A destination, an optional title, nothing more: "[Achtung]: Das ist wichtig." is prose.
const LINK_RE = /^ {0,3}\[((?:[^\]\\]|\\.)+)\]:[ \t]*(?:<[^>\n]*>|\S+)(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*\r?$/;
// A line after which a block starts: a heading, a thematic break, a setext
// underline, a fence.
const ENDS_BLOCK_RE = /^ {0,3}(?:#{1,6}(?:[ \t]|$)|([-*_])(?:[ \t]*\1){2,}[ \t]*\r?$|=+[ \t]*\r?$|`{3,}|~{3,})/;
const BLANK_RE = /^[ \t]*\r?$/;

// Each label defined more than once, in the order of its second definition:
// { kind: 'footnote' | 'link', label } as the author wrote it the first time.
// A definition opens a block: it stands at the start, after a blank line,
// another definition, a heading, a thematic break or a fence, never inside a
// paragraph or fenced code. Footnote labels compare as written, link labels
// as marked compares them: runs of blanks collapsed, case folded through
// upper case, so "Straße" and "STRASSE" are one label.
export function duplicateDefinitions(source){
  const code = fences(source), seen = new Map(), twice = [];
  let pos = 0, opens = true;
  for (const line of source.split('\n')){
    const inCode = code.some(k => pos >= k.start && pos < k.end);
    pos += line.length + 1;
    const fn = !inCode && opens && FOOTNOTE_RE.exec(line);
    const link = !inCode && opens && !fn && LINK_RE.exec(line);
    const def = fn ? ['footnote', fn[1], fn[1]] : link ? ['link', link[1], link[1].trim().replace(/\s+/g, ' ').toLowerCase().toUpperCase().toLowerCase()] : null;
    if (def){
      const key = def[0] + ' ' + def[2];
      if (!seen.has(key)) seen.set(key, def[1]);
      else if (!twice.some(t => t.key === key)) twice.push({ key, kind: def[0], label: seen.get(key) });
    }
    opens = BLANK_RE.test(line) || !!def || (!inCode && ENDS_BLOCK_RE.test(line));
  }
  return twice.map(({ kind, label }) => ({ kind, label }));
}

// A document pass: one notice at the top for each label defined twice, read
// from the Markdown marked parsed, where a part's body starts a block.
export function noteDuplicateDefinitions(root, context){
  const notes = duplicateDefinitions(context.markdown).map(d => buildWarning(root.ownerDocument, d.kind === 'footnote'
    ? 'Die Fußnote [^' + d.label + '] ist mehrfach definiert; es gilt die erste Definition.'
    : 'Der Linkverweis [' + d.label + '] ist mehrfach definiert; es gilt die erste Definition.'));
  root.prepend(...notes);
}
