// --- The XML out of a pasted answer (story 2.46) -----------------------------
// A language model often answers with more than the XML: a heading, a
// sentence before, a fenced code block, an explanation after. extractXml()
// cuts the XML out of such a text, for the BPMN Assistant's render().
//
// Code block first: where the text holds fenced blocks (``` or ~~~, three or
// more, up to three spaces of indent; a block without its closing fence runs
// to the end), the first block that holds a whole root is the text the cut
// works on, else the first that holds an opening definitions tag. Then the
// root: the opening definitions tag with any prefix and the next closing tag
// with the same prefix after it; of several opening tags before that closing
// tag the last (definitions never nest, so the earlier ones are prose); a
// self-closing root is whole. Tags inside XML comments and CDATA sections do
// not count. An XML declaration (<?xml and white space) with only white
// space, comments, a DOCTYPE or processing instructions between it and the
// root belongs to the cut, and so do comments right before it and right after
// the root, so that a text that is only XML comes back byte-identical.
//
// Returns { xml, before, after, more, cutOff }: before and after are the
// lines with text removed before and after the XML; more, whether the text
// held another root after the one taken; cutOff, the closing tag the XML
// lacks (an opening root with no closing definitions tag of any prefix after
// it), else null, and then xml is the text unchanged. Without any opening
// root, or with a closing tag of another prefix, the text comes back
// unchanged, for the parser to report.
//
// ohneDi(xml) gives the XML without its diagram part, every BPMNDiagram, the
// self-closing empty one too (audit 2026-10-25, finding 10): the assistant
// lays out without it, the workbench stores a case without it.
// Pure, for Node and the browser.
//
// Nothing done on loading.

const DEF = /<(\/?)((?:[\w.-]+:)?)definitions\b[^>]*?(\/?)>/g;
// Comments and CDATA sections blanked with spaces of the same length: tags inside them do not count.
const blank = s => s.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, c => ' '.repeat(c.length));
const hasRoot = s => /<(?:[\w.-]+:)?definitions\b/.test(blank(s));
// Between declaration and root only white space, comments, a DOCTYPE and processing instructions (each never past its
// own end); comments at the end, at the start.
const COMMENT = '<!--(?:(?!-->)[\\s\\S])*-->';
const PI = '<\\?(?:(?!\\?>)[\\s\\S])*\\?>';
const DOCTYPE = '<!DOCTYPE(?:[^\\[>]|\\[[^\\]]*\\])*>';
const GAP = new RegExp('^(?:\\s|' + COMMENT + '|' + PI + '|' + DOCTYPE + ')*$');
const LEAD = new RegExp('(?:' + COMMENT + '\\s*)+$');
const TRAIL = new RegExp('^(?:\\s*' + COMMENT + ')+');

// The fenced blocks of a text: { start, end } of each one's content.
function fences(text){
  const blocks = [];
  const lines = text.split('\n');
  let pos = 0, open = null;
  for (const line of lines){
    const next = pos + line.length + 1;
    const l = line.replace(/\r$/, '');
    if (!open){
      const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(l);
      if (m && !(m[1][0] === '`' && m[2].includes('`'))) open = { ch: m[1][0], len: m[1].length, start: Math.min(next, text.length) };
    } else {
      const m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(l);
      if (m && m[1][0] === open.ch && m[1].length >= open.len){ blocks.push({ start: open.start, end: pos }); open = null; }
    }
    pos = next;
  }
  if (open) blocks.push({ start: open.start, end: text.length });
  return blocks;
}

// The root in a text: { start, end, more } or { cutOff } or null. Cut off only where no closing definitions tag, of any
// prefix, follows the last opening one; one with another prefix leaves the text to the parser.
function root(text){
  const b = blank(text);
  let last = null, pair = null, more = false, closed = false;
  for (const m of b.matchAll(DEF)){
    const [tag, closing, prefix, selfClosing] = m;
    if (pair){ if (!closing){ more = true; break; } continue; }
    if (!closing && selfClosing) pair = { start: m.index, end: m.index + tag.length };
    else if (!closing){ last = { index: m.index, prefix }; closed = false; }
    else if (last && prefix === last.prefix) pair = { start: last.index, end: m.index + tag.length };
    else if (last) closed = true;
  }
  if (pair) return { ...pair, more };
  return last && !closed ? { cutOff: '</' + last.prefix + 'definitions>' } : null;
}

const linesWithText = s => s.split('\n').filter(l => /\S/.test(l)).length;

export function extractXml(text){
  const none = { xml: text, before: 0, after: 0, more: false, cutOff: null };
  let from = 0, to = text.length, more = false;
  const blocks = fences(text);
  // The first block with a whole root, else the first with an opening tag.
  let i = blocks.findIndex(k => root(text.slice(k.start, k.end))?.end !== undefined);
  if (i < 0) i = blocks.findIndex(k => hasRoot(text.slice(k.start, k.end)));
  if (i >= 0){
    ({ start: from, end: to } = blocks[i]);
    more = blocks.slice(i + 1).some(k => hasRoot(text.slice(k.start, k.end)));
  }
  const work = text.slice(from, to);
  const r = root(work);
  if (!r) return none;
  if (r.cutOff) return { ...none, cutOff: r.cutOff };
  let start = r.start, end = r.end;
  // The declaration before the root (<?xml and white space, not <?xml-stylesheet), with only the gap between.
  const decl = [...blank(work).slice(0, start).matchAll(/<\?xml\s/g)].pop()?.index ?? -1;
  if (decl >= 0){
    const close = work.indexOf('?>', decl);
    if (close >= 0 && close + 2 <= start && GAP.test(work.slice(close + 2, start))) start = decl;
  }
  // Comments right before and right after.
  const lead = LEAD.exec(work.slice(0, start));
  if (lead) start = lead.index;
  const trail = TRAIL.exec(work.slice(end));
  if (trail) end += trail[0].length;
  from += start;
  to = from + (end - start);
  return {
    xml: text.slice(from, to),
    before: linesWithText(text.slice(0, from)),
    after: linesWithText(text.slice(to)),
    more: more || r.more,
    cutOff: null,
  };
}

// An element with a namespace prefix or without, with its attributes (also with ">" in quotes).
export const ATTRS = '(?:[^>"\'/]|"[^"]*"|\'[^\']*\'|\\/(?!>))*';
const DIAGRAM = new RegExp('<((?:[\\w.-]+:)?BPMNDiagram)\\b' + ATTRS + '(?:\\/>|>[\\s\\S]*?<\\/\\1\\s*>)\\s*', 'g');
export const ohneDi = xml => String(xml).replace(DIAGRAM, '');
