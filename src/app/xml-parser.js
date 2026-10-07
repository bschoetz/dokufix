// --- The XML parser of the BPMN layout ----------------------------------------
// The layout of BPMN without coordinates (src/app/bpmn-layout.js) reads the
// author's XML into a model. It used to read a document the environment
// parsed: the browser's DOMParser in the page, linkedom in the tests. The two
// differ (linkedom keeps "&amp;" in an attribute as it stands, keeps "\r\n",
// rejects nothing, reports "bpmn:task" as the local name), and so the same
// XML gave a different model in Node than in the page. This parser is the one
// way from the text to the document, the same in every browser and in Node:
// pure logic, no page, no library.
//
//   parseXml(text) → XmlDocument, or throws XmlError
//
// The document has the part of the DOM readProcess() walks, in the form a
// browser gives it: documentElement; per element nodeName ("bpmn:task"),
// prefix, localName ("task"), namespaceURI, getAttribute(), attributes,
// children, childNodes, parentElement, textContent. Comments and processing
// instructions are not kept. Text nodes are: a run of text and references is
// one node, a CDATA section one of its own, as in a browser, so that a note's
// text can leave out the nodes that are blanks only, as bpmn-js does.
//
// It reads XML 1.0 (fifth edition) with namespaces as far as BPMN needs it,
// and the way Chromium reads it; spike lmm/parsing measured the prototype of
// this parser against Chromium on 157 cases, the 57 fixtures among them
// (spikes/lmm/parsing/BERICHT.md, docs/analyse-mermaid-im-bpmn-code.md,
// section 4c). tests/xml-parser.test.mjs holds the cases with what Chromium
// read, and where this parser reads otherwise, on purpose:
//   - a byte order mark is passed over; "\r\n" and "\r" become "\n" (§2.11)
//   - a character XML forbids (control characters, a lone surrogate, U+FFFE,
//     U+FFFF) is an error (§2.2), as a character reference too (§4.1)
//   - attribute values are normalised (§3.3.3): a tab or line break becomes a
//     blank, "&#10;" stays a line break; no "<" in a value, no attribute twice
//   - text: no bare "<" or "&", no "]]>"; CDATA as it stands
//   - references: the five predefined entities and character references,
//     decimal and hexadecimal, beyond the BMP too (Ben, 2026-10-07)
//   - a DOCTYPE is an error (Ben, 2026-10-07). BPMN has none, and the browsers
//     would expand its internal entities, which bpmn-js does not: the same
//     XML would be laid out with a text bpmn-js does not draw. Without a
//     DOCTYPE no entity can be declared, so none can be external or grow
//     without bound ("billion laughs"); any reference but the five
//     predefined ones is an error, as in every browser. This is where it
//     reads otherwise than a browser, which reads a DOCTYPE
//   - namespaces: every prefix must be declared (xml always is), xmlns may not
//     be; localName is the name without its prefix
//   - one root element; after it only comments, PIs and blanks
//   - the XML declaration only at the very start; version 1.0 or 1.1, read as
//     1.0, as Chromium does (Ben, 2026-10-07; Firefox rejects 1.1). 1.1
//     differs only in characters and line ends BPMN does not use, and a tool
//     that writes 1.1 should not fail the layout. The encoding is of no
//     effect: the input is a string already
// An error names its line and column in the message, in English as the
// browsers' do, and its kind in code, one of XML_ERROR_CODES, for a page
// that wants to say it in its own words (Ben, 2026-10-07). dokufix does not
// show it: XML this parser rejects goes to bpmn-js unchanged, which says
// what is wrong with it.
//
// It walks the document with a stack, not by recursion, so a deep document
// cannot overflow the call stack. Like src/app/lmm.js it does nothing when it
// loads, so that the reader bundle, which reaches it through src/app/bpmn.js
// without calling it, does not carry it (tests/build.test.mjs).

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const PREDEFINED = { lt: '<', gt: '>', amp: '&', apos: "'", quot: '"' };

// The kinds of error, in code of an XmlError.
export const XML_ERROR_CODES = ['char', 'reference', 'declaration', 'doctype', 'comment', 'pi', 'cdata', 'name', 'attribute', 'namespace', 'tag', 'structure'];

// Name (§2.3) as a sticky pattern. A name may hold colons; the namespace rule
// checks them afterwards. Made on the first parse, not when the module loads:
// a string built at the top would stay in every bundle that imports the
// module, the reader bundle too.
let patterns = null;
function getPatterns(){
  if (patterns) return patterns;
  const start = '[:A-Z_a-z\\xC0-\\xD6\\xD8-\\xF6\\xF8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD]|[\\uD800-\\uDB7F][\\uDC00-\\uDFFF]';
  const char = start + '|[-.0-9\\xB7\\u0300-\\u036F\\u203F\\u2040]';
  patterns = {
    name: new RegExp('(?:' + start + ')(?:' + char + ')*', 'y'),
    ncStart: new RegExp('^(?:' + start.replace('[:', '[') + ')'),
  };
  return patterns;
}
const S_RE = /[ \t\n]+/y; // no "\r" is left after the line ends are normalised
// A character XML forbids (§2.2 Char); a surrogate pair is allowed and taken first.
const BAD_CHAR_RE = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\x00-\x08\x0B\x0C\x0E-\x1F\uD800-\uDFFF￾￿]/g;
const REFERENCE_RE = /&(?:#(?:x([0-9A-Fa-f]+)|([0-9]+))|([^;&<\s]+));/y;
const isChar = cp => cp === 0x9 || cp === 0xA || cp === 0xD || (cp >= 0x20 && cp <= 0xD7FF) || (cp >= 0xE000 && cp <= 0xFFFD) || (cp >= 0x10000 && cp <= 0x10FFFF);

export class XmlError extends Error {
  constructor(code, reason, text, offset){
    const before = text.slice(0, offset);
    const line = (before.match(/\n/g) || []).length + 1;
    const column = offset - before.lastIndexOf('\n');
    super('error on line ' + line + ' at column ' + column + ': ' + reason);
    this.name = 'XmlError';
    this.code = code;
    this.reason = reason;
    this.line = line; this.column = column; this.offset = offset;
  }
}

class XmlText {
  constructor(data, cdata){ this.nodeType = cdata ? 4 : 3; this.nodeName = cdata ? '#cdata-section' : '#text'; this.data = data; this.parentNode = null; }
  get textContent(){ return this.data; }
}

class XmlElement {
  constructor(name, prefix, localName){
    this.nodeType = 1;
    this.nodeName = name;
    this.prefix = prefix; this.localName = localName; this.namespaceURI = null;
    this.attributes = [];
    this.children = []; this.childNodes = [];
    this.parentElement = null; this.parentNode = null;
  }
  getAttribute(name){ const a = this.attributes.find(a => a.name === name); return a ? a.value : null; }
  get textContent(){
    let out = '';
    const stack = [...this.childNodes].reverse();
    while (stack.length){
      const node = stack.pop();
      if (node.nodeType === 1) for (let k = node.childNodes.length - 1; k >= 0; k--) stack.push(node.childNodes[k]);
      else out += node.data;
    }
    return out;
  }
}

class XmlDocument {
  constructor(){ this.nodeType = 9; this.nodeName = '#document'; this.documentElement = null; this.declaration = null; }
}

export function parseXml(input){
  const { name: NAME_RE, ncStart: NC_START_RE } = getPatterns();
  let text = String(input);
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  if (text.indexOf('\r') !== -1) text = text.replace(/\r\n?/g, '\n');
  const n = text.length;
  const fail = (code, reason, at) => { throw new XmlError(code, reason, text, at); };
  // Forbidden characters first (§2.2), at the place of the first.
  BAD_CHAR_RE.lastIndex = 0;
  for (let m; (m = BAD_CHAR_RE.exec(text));) if (m[0].length === 1) fail('char', 'Char 0x' + m[0].charCodeAt(0).toString(16).toUpperCase() + ' out of allowed range', m.index);

  const doc = new XmlDocument();
  let i = 0;
  const at = (s, pos = i) => text.startsWith(s, pos);
  const skipS = () => { S_RE.lastIndex = i; if (S_RE.test(text)){ i = S_RE.lastIndex; return true; } return false; };
  const name = () => { NAME_RE.lastIndex = i; const m = NAME_RE.exec(text); if (!m) return null; i = NAME_RE.lastIndex; return m[0]; };
  const expect = (s, code, reason) => { if (!at(s)) fail(code, reason, i); i += s.length; };

  // --- References -------------------------------------------------------------
  // What the reference at k in source stands for, and where it ends; pos is
  // where an error is reported.
  const reference = (source, k, pos) => {
    REFERENCE_RE.lastIndex = k;
    const r = REFERENCE_RE.exec(source);
    if (!r) fail('reference', 'EntityRef: expecting \';\'', pos);
    if (r[3]){
      if (!Object.hasOwn(PREDEFINED, r[3])) fail('reference', "Entity '" + r[3] + "' not defined", pos);
      return [PREDEFINED[r[3]], REFERENCE_RE.lastIndex];
    }
    const cp = r[1] ? parseInt(r[1], 16) : parseInt(r[2], 10);
    if (!isChar(cp)) fail('char', 'xmlParseCharRef: invalid xmlChar value ' + cp, pos);
    return [String.fromCodePoint(cp), REFERENCE_RE.lastIndex];
  };

  // --- Attribute value (§3.3.3) ----------------------------------------------
  const attValue = () => {
    const q = text[i];
    if (q !== '"' && q !== "'") fail('attribute', 'AttValue: " or \' expected', i);
    const start = ++i;
    const end = text.indexOf(q, start);
    if (end === -1) fail('attribute', 'AttValue: \' expected', start - 1);
    const raw = text.slice(start, end);
    i = end + 1;
    if (raw.indexOf('<') !== -1) fail('attribute', "Unescaped '<' not allowed in attributes values", start + raw.indexOf('<'));
    if (raw.indexOf('&') === -1 && raw.indexOf('\n') === -1 && raw.indexOf('\t') === -1) return raw;
    let out = '';
    for (let k = 0; k < raw.length;){
      const c = raw[k];
      if (c === '&'){ const [value, next] = reference(raw, k, start + k); out += value; k = next; }
      else { out += c === '\t' || c === '\n' ? ' ' : c; k++; }
    }
    return out;
  };

  // --- Prolog -------------------------------------------------------------------
  if (at('<?xml') && /[ \t\n?]/.test(text[5] || '')){
    const end = text.indexOf('?>');
    if (end === -1) fail('declaration', 'parsing XML declaration: \'?>\' expected', 0);
    const m = /^\s+version\s*=\s*(?:"([^"]*)"|'([^']*)')(?:\s+encoding\s*=\s*(?:"([^"]*)"|'([^']*)'))?(?:\s+standalone\s*=\s*(?:"(yes|no)"|'(yes|no)'))?\s*$/.exec(text.slice(5, end));
    if (!m) fail('declaration', 'Malformed XML declaration', 0);
    const version = m[1] ?? m[2], encoding = m[3] ?? m[4] ?? null, standalone = m[5] ?? m[6] ?? null;
    if (version !== '1.0' && version !== '1.1') fail('declaration', 'Unsupported version \'' + version + '\'', 0);
    if (encoding !== null && !/^[A-Za-z][A-Za-z0-9._-]*$/.test(encoding)) fail('declaration', 'Invalid XML encoding name', 0);
    doc.declaration = { version, encoding, standalone };
    i = end + 2;
  }
  const comment = () => {
    const start = i;
    const end = text.indexOf('-->', i + 4);
    if (end === -1) fail('comment', 'Comment not terminated', start);
    const body = text.slice(i + 4, end);
    if (body.indexOf('--') !== -1) fail('comment', 'Double hyphen within comment', i + 4 + body.indexOf('--'));
    if (body.endsWith('-')) fail('comment', 'Comment must not end with \'-\'', end - 1);
    i = end + 3;
  };
  const pi = () => {
    const start = i;
    i += 2;
    const target = name();
    if (!target) fail('pi', 'xmlParsePI : no target name', start);
    if (target === 'xml') fail('declaration', 'XML declaration allowed only at the start of the document', start);
    if (target.toLowerCase() === 'xml') fail('pi', 'xmlParsePI : target \'' + target + '\' is reserved', start);
    const end = text.indexOf('?>', i);
    if (end === -1) fail('pi', 'ParsePI: PI ' + target + ' never end ...', start);
    if (end > i && !/[ \t\n]/.test(text[i])) fail('pi', 'ParsePI: PI ' + target + ' space expected', i);
    i = end + 2;
  };
  // Misc* (§2.8): comments, PIs, blanks.
  const misc = () => {
    for (;;){
      if (skipS()) continue;
      if (at('<!--')){ comment(); continue; }
      if (at('<?')){ pi(); continue; }
      return;
    }
  };
  misc();
  if (at('<!DOCTYPE')) fail('doctype', 'DOCTYPE is not supported', i);
  if (i >= n) fail('structure', text.trim() ? 'Start tag expected, \'<\' not found' : 'Document is empty', i);
  if (text[i] !== '<') fail('structure', 'Start tag expected, \'<\' not found', i);

  // --- Elements and content -----------------------------------------------------
  // Each frame of the stack: { el, ns (Map prefix → URI, inherited), pos }.
  const stack = [];
  let cur = null, curNs = new Map([['xml', XML_NS]]);
  const lineOf = pos => (text.slice(0, pos).match(/\n/g) || []).length + 1;
  // Text joins the text node before it, as in a browser: "A &amp; B" is one
  // node. A CDATA section is a node of its own.
  const addText = (data, cdata) => {
    const last = cur.childNodes[cur.childNodes.length - 1];
    if (!cdata && last && last.nodeType === 3){ last.data += data; return; }
    const node = new XmlText(data, cdata);
    node.parentNode = cur;
    cur.childNodes.push(node);
  };
  // QName → [prefix, local name]; both must be NCNames (Namespaces in XML §3):
  // "bpmn:1task" is an XML name but no QName.
  const splitName = (qname, pos) => {
    const c = qname.indexOf(':');
    if (c === -1){ if (!NC_START_RE.test(qname)) fail('name', 'Failed to parse QName \'' + qname + '\'', pos); return [null, qname]; }
    if (c === 0 || c === qname.length - 1 || qname.indexOf(':', c + 1) !== -1 || !NC_START_RE.test(qname) || !NC_START_RE.test(qname.slice(c + 1))) fail('name', 'Failed to parse QName \'' + qname + '\'', pos);
    return [qname.slice(0, c), qname.slice(c + 1)];
  };
  // After the root closes: only Misc may follow.
  const afterRoot = () => { cur = null; misc(); if (i < n) fail('structure', 'Extra content at the end of the document', i); };

  while (i < n){
    const c = text[i];
    if (c === '<'){
      if (at('</')){
        const start = i;
        if (!cur) fail('structure', 'Start tag expected, \'<\' not found', start);
        i += 2;
        const ename = name();
        if (!ename) fail('name', 'expected name after </', i);
        if (ename !== cur.nodeName) fail('tag', 'Opening and ending tag mismatch: ' + cur.nodeName + ' line ' + lineOf(stack[stack.length - 1].pos) + ' and ' + ename, start);
        skipS();
        expect('>', 'tag', 'expected \'>\'');
        stack.pop();
        if (stack.length){ cur = stack[stack.length - 1].el; curNs = stack[stack.length - 1].ns; }
        else afterRoot();
        continue;
      }
      if (at('<!--')){ comment(); continue; }
      if (at('<![CDATA[')){
        if (!cur) fail('structure', 'Start tag expected, \'<\' not found', i);
        const end = text.indexOf(']]>', i + 9);
        if (end === -1) fail('cdata', 'CData section not finished', i);
        addText(text.slice(i + 9, end), true);
        i = end + 3;
        continue;
      }
      if (at('<?')){ pi(); continue; }
      if (at('<!DOCTYPE')) fail('doctype', 'DOCTYPE is not supported', i);
      if (at('<!')) fail('name', 'StartTag: invalid element name', i);
      // A start tag.
      const start = i;
      i++;
      const qname = name();
      if (!qname) fail('name', 'StartTag: invalid element name', start);
      const [prefix, local] = splitName(qname, start);
      const el = new XmlElement(qname, prefix, local);
      const seen = new Set();
      let ns = curNs, selfClosing = false;
      for (;;){
        const blank = skipS();
        if (at('/>')){ selfClosing = true; i += 2; break; }
        if (at('>')){ i++; break; }
        if (i >= n) fail('tag', 'Couldn\'t find end of Start Tag ' + qname + ' line ' + lineOf(start), start);
        if (!blank) fail('attribute', 'attributes construct error', i);
        const apos = i;
        const aname = name();
        if (!aname) fail('attribute', 'error parsing attribute name', apos);
        skipS();
        expect('=', 'attribute', 'Specification mandates value for attribute ' + aname);
        skipS();
        const value = attValue();
        if (seen.has(aname)) fail('attribute', 'Attribute ' + aname + ' redefined', apos);
        seen.add(aname);
        const [ap, al] = splitName(aname, apos);
        if (aname === 'xmlns' || ap === 'xmlns'){
          if (ap === 'xmlns' && al === 'xmlns') fail('namespace', 'xml namespace prefix mapped to wrong URI', apos);
          if (ap === 'xmlns' && al === 'xml' && value !== XML_NS) fail('namespace', 'xml namespace prefix mapped to wrong URI', apos);
          if (ap === 'xmlns' && al !== 'xml' && value === XML_NS) fail('namespace', 'reuse of the xml namespace name', apos);
          if (ap === 'xmlns' && value === '') fail('namespace', 'xmlns:' + al + ': Empty XML namespace is not allowed', apos);
          if (ns === curNs) ns = new Map(curNs);
          ns.set(ap ? al : '', value);
          el.attributes.push({ name: aname, prefix: ap, localName: al, namespaceURI: XMLNS_NS, value });
        } else el.attributes.push({ name: aname, prefix: ap, localName: al, namespaceURI: null, value });
      }
      // The namespaces (Namespaces in XML 1.0 §6), now that the tag's own
      // declarations are known.
      if (prefix){ if (!ns.has(prefix)) fail('namespace', 'Namespace prefix ' + prefix + ' on ' + local + ' is not defined', start); el.namespaceURI = ns.get(prefix); }
      else el.namespaceURI = ns.get('') || null;
      for (const a of el.attributes){
        if (a.namespaceURI === XMLNS_NS || !a.prefix) continue;
        if (!ns.has(a.prefix)) fail('namespace', 'Namespace prefix ' + a.prefix + ' for ' + a.localName + ' on ' + local + ' is not defined', start);
        a.namespaceURI = ns.get(a.prefix);
      }
      if (cur){ el.parentElement = cur; el.parentNode = cur; cur.children.push(el); cur.childNodes.push(el); }
      else doc.documentElement = el;
      if (!selfClosing){ stack.push({ el, ns, pos: start }); cur = el; curNs = ns; }
      else if (!stack.length) afterRoot();
      continue;
    }
    if (c === '&'){
      const start = i;
      if (at('&#')){ const [value, next] = reference(text, i, start); addText(value, false); i = next; continue; }
      i++;
      const ename = name();
      if (!ename) fail('reference', 'xmlParseEntityRef: no name', start);
      expect(';', 'reference', 'EntityRef: expecting \';\'');
      if (!Object.hasOwn(PREDEFINED, ename)) fail('reference', "Entity '" + ename + "' not defined", start);
      addText(PREDEFINED[ename], false);
      continue;
    }
    // Text up to the next "<" or "&".
    let end = i;
    for (; end < n; end++){ const d = text.charCodeAt(end); if (d === 60 || d === 38) break; }
    const run = text.slice(i, end), bad = run.indexOf(']]>');
    if (bad !== -1) fail('structure', 'Sequence \']]>\' not allowed in content', i + bad);
    addText(run, false);
    i = end;
  }
  if (stack.length) fail('tag', 'Premature end of data in tag ' + cur.nodeName + ' line ' + lineOf(stack[stack.length - 1].pos), n);
  return doc;
}
