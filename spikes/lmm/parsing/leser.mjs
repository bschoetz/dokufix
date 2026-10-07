// Ein eigener XML-Leser, rein in JavaScript, ohne Abhängigkeit, ohne DOM der
// Umgebung: Prototyp für das BPMN-Layout-Paket (Lösungsweg b).
//
//   parseXml(text) → XmlDocument          wirft XmlError { message, line, column, offset }
//
// Das Dokument hat genau die Schnittstelle, die readProcess() in
// src/app/bpmn-layout.js braucht, in der Form, die ein Browser liefert:
//   doc.documentElement, doc.getElementsByTagName(name)
//   el.nodeName ("bpmn:task"), el.localName ("task"), el.prefix, el.namespaceURI,
//   el.getAttribute(name) → Wert oder null, el.hasAttribute(name), el.attributes,
//   el.children, el.childNodes, el.parentElement, el.textContent
// Kommentare und Verarbeitungsanweisungen kommen nicht in den Baum.
//
// Er hält sich an XML 1.0 (5. Auflage) und Namespaces in XML 1.0, soweit BPMN
// es braucht, und liest so, wie Chromium und Firefox lesen (gemessen gegen
// Chromium, siehe BERICHT.md):
//   - BOM übergangen; Zeilenenden \r\n und \r werden \n (§2.11)
//   - Zeichen, die XML verbietet (Steuerzeichen, einzelne Surrogate, U+FFFE/FFFF),
//     sind ein Fehler (§2.2), auch als Zeichenreferenz (§4.1)
//   - Attributwerte normalisiert (§3.3.3): Tabulator und Zeilenumbruch werden
//     ein Leerzeichen, &#10; bleibt ein Zeilenumbruch; kein < im Wert; jedes
//     Attribut nur einmal
//   - Text: kein nacktes < oder &, kein "]]>"; CDATA wörtlich
//   - die fünf vordefinierten Entitäten, Zeichenreferenzen dezimal und hexadezimal
//     (auch jenseits der BMP), Entitäten aus dem internen DTD-Teil mit Grenzen
//     für Verschachtelung und Aufblähung (Billion Laughs); externe Entitäten
//     werden nie geladen, ihr Verweis ist ein Fehler; Parameter-Entitäten und
//     Entitäten mit Markup im Ersatztext sind ein Fehler ("not supported")
//   - Namensräume: jedes Präfix muss deklariert sein (xml ist es immer), xmlns
//     darf nicht umdeklariert werden; localName ist der Name ohne Präfix
//   - genau ein Wurzelelement; danach nur Kommentare, PIs und Leerraum
//   - Die XML-Deklaration nur ganz am Anfang; version 1.0 oder 1.1 (gelesen
//     als 1.0, wie Chromium); die Kodierungsangabe ist ohne Wirkung, die
//     Eingabe ist schon ein String
//   - DOCTYPE: ATTLIST-Vorgaben werden nicht angewandt (Chromium täte es)
//
// Nicht rekursiv über die Tiefe des Dokuments (ein Stapel), daher auch für
// tiefe Dokumente ohne Stapelüberlauf.

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const PREDEFINED = { lt: '<', gt: '>', amp: '&', apos: "'", quot: '"' };

// Name (§2.3), als sticky-Regex; ein Name darf Doppelpunkte enthalten, die
// Namensraumregel prüft sie danach.
const NAME_START = '[:A-Z_a-z\\xC0-\\xD6\\xD8-\\xF6\\xF8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD]|[\\uD800-\\uDB7F][\\uDC00-\\uDFFF]';
const NAME_CHAR = NAME_START + '|[-.0-9\\xB7\\u0300-\\u036F\\u203F\\u2040]';
const NAME_RE = new RegExp('(?:' + NAME_START + ')(?:' + NAME_CHAR + ')*', 'y');
const NC_START_RE = new RegExp('^(?:' + NAME_START.replace('[:', '[') + ')');
const S_RE = /[ \t\n]+/y; // \r gibt es nach der Normalisierung nicht mehr
// Verbotene Zeichen (§2.2 Char): ein Surrogatpaar ist erlaubt und wird zuerst gegriffen.
const BAD_CHAR_RE = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\x00-\x08\x0B\x0C\x0E-\x1F\uD800-\uDFFF￾￿]/g;
const isChar = cp => cp === 0x9 || cp === 0xA || cp === 0xD || (cp >= 0x20 && cp <= 0xD7FF) || (cp >= 0xE000 && cp <= 0xFFFD) || (cp >= 0x10000 && cp <= 0x10FFFF);

export class XmlError extends Error {
  constructor(message, text, offset){
    const before = text.slice(0, offset);
    const line = (before.match(/\n/g) || []).length + 1;
    const column = offset - before.lastIndexOf('\n');
    super('error on line ' + line + ' at column ' + column + ': ' + message);
    this.name = 'XmlError';
    this.reason = message;
    this.line = line; this.column = column; this.offset = offset;
  }
}

export class XmlText {
  constructor(data, cdata = false){ this.nodeType = cdata ? 4 : 3; this.nodeName = cdata ? '#cdata-section' : '#text'; this.data = data; this.parentNode = null; }
  get textContent(){ return this.data; }
  get nodeValue(){ return this.data; }
}

export class XmlElement {
  constructor(name, prefix, localName){
    this.nodeType = 1;
    this.nodeName = name; this.tagName = name;
    this.prefix = prefix; this.localName = localName; this.namespaceURI = null;
    this.attributes = [];
    this.children = []; this.childNodes = [];
    this.parentElement = null; this.parentNode = null;
  }
  getAttribute(name){ const a = this.attributes.find(a => a.name === name); return a ? a.value : null; }
  getAttributeNS(ns, local){ const a = this.attributes.find(a => a.localName === local && (a.namespaceURI || null) === (ns || null)); return a ? a.value : null; }
  hasAttribute(name){ return this.attributes.some(a => a.name === name); }
  get firstElementChild(){ return this.children[0] || null; }
  get textContent(){
    let out = '';
    const stack = [...this.childNodes].reverse();
    while (stack.length){ const n = stack.pop(); if (n.nodeType === 1) for (let i = n.childNodes.length - 1; i >= 0; i--) stack.push(n.childNodes[i]); else out += n.data; }
    return out;
  }
  getElementsByTagName(name){ return collect(this, name); }
  getElementsByTagNameNS(ns, local){ return collect(this, null, ns, local); }
}

export class XmlDocument {
  constructor(){ this.nodeType = 9; this.nodeName = '#document'; this.documentElement = null; this.declaration = null; this.doctype = null; }
  getElementsByTagName(name){ return this.documentElement ? collect(this.documentElement, name, undefined, undefined, true) : []; }
  getElementsByTagNameNS(ns, local){ return this.documentElement ? collect(this.documentElement, null, ns, local, true) : []; }
  get textContent(){ return null; }
}

function collect(root, name, ns, local, self = false){
  const out = [];
  const stack = self ? [root] : [...root.children].reverse();
  while (stack.length){
    const el = stack.pop();
    if (name !== null ? (name === '*' || el.nodeName === name) : ((ns === '*' || (el.namespaceURI || null) === (ns || null)) && (local === '*' || el.localName === local))) out.push(el);
    for (let i = el.children.length - 1; i >= 0; i--) stack.push(el.children[i]);
  }
  return out;
}

export function parseXml(input, options = {}){
  let text = String(input);
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  if (text.indexOf('\r') !== -1) text = text.replace(/\r\n?/g, '\n');
  const n = text.length;
  const fail = (message, at) => { throw new XmlError(message, text, at); };
  // Verbotene Zeichen vorab (§2.2), mit der Stelle des ersten.
  BAD_CHAR_RE.lastIndex = 0;
  for (let m; (m = BAD_CHAR_RE.exec(text));) if (m[0].length === 1) fail('Char 0x' + m[0].charCodeAt(0).toString(16).toUpperCase() + ' out of allowed range', m.index);

  const maxAmplification = options.maxAmplification || 5, minExpansion = options.minExpansion || 1_000_000, maxDepth = 40;
  const doc = new XmlDocument();
  const entities = new Map(); // Name → { value } (intern) | { external: true }
  let expanded = 0;
  let i = 0;

  const at = (s, pos = i) => text.startsWith(s, pos);
  const skipS = () => { S_RE.lastIndex = i; if (S_RE.test(text)){ i = S_RE.lastIndex; return true; } return false; };
  const name = () => { NAME_RE.lastIndex = i; const m = NAME_RE.exec(text); if (!m) return null; i = NAME_RE.lastIndex; return m[0]; };
  const expect = (s, message) => { if (!at(s)) fail(message || "'" + s + "' expected", i); i += s.length; };

  // --- Referenzen --------------------------------------------------------------
  // Eine Zeichenreferenz ab i ("&#…;"), geliefert als Zeichen; i steht danach.
  const charRef = () => {
    const start = i;
    const m = /&#(?:x([0-9A-Fa-f]+)|([0-9]+));/y; m.lastIndex = i;
    const r = m.exec(text);
    if (!r) fail('xmlParseCharRef: invalid value', start);
    const cp = r[1] ? parseInt(r[1], 16) : parseInt(r[2], 10);
    if (!isChar(cp)) fail('xmlParseCharRef: invalid xmlChar value ' + cp, start);
    i = m.lastIndex;
    return String.fromCodePoint(cp);
  };
  // Der Ersatztext einer Entität, Zeichenreferenzen und Entitätsverweise
  // darin aufgelöst (§4.4): inAttribute normalisiert Leerraum (§3.3.3) und
  // verbietet <; im Inhalt ist Markup im Ersatztext nicht unterstützt.
  const expandEntity = (ename, inAttribute, depth, chain, pos) => {
    if (Object.hasOwn(PREDEFINED, ename)) return PREDEFINED[ename];
    const e = entities.get(ename);
    if (!e) fail("Entity '" + ename + "' not defined", pos);
    if (e.external) fail((inAttribute ? 'Attribute references external entity' : 'External entity') + " '" + ename + "' is not loaded", pos);
    if (chain.includes(ename)) fail('Detected an entity reference loop', pos);
    if (depth > maxDepth) fail('Entity nesting too deep', pos);
    expanded += e.value.length;
    if (expanded > minExpansion && expanded > maxAmplification * n) fail('Maximum entity amplification factor exceeded', pos);
    return expandText(e.value, inAttribute, depth + 1, [...chain, ename], pos);
  };
  const expandText = (value, inAttribute, depth, chain, pos) => {
    if (inAttribute && value.indexOf('<') !== -1) fail("'<' in attribute value (from entity '" + chain[chain.length - 1] + "')", pos);
    if (!inAttribute && value.indexOf('<') !== -1) fail("Markup in the replacement text of entity '" + chain[chain.length - 1] + "' is not supported", pos);
    let out = '';
    for (let k = 0; k < value.length;){
      const c = value[k];
      if (c === '&'){
        const m = /&(?:#(?:x([0-9A-Fa-f]+)|([0-9]+))|([^;&<\s]+));/y; m.lastIndex = k;
        const r = m.exec(value);
        if (!r) fail('EntityRef: expecting \';\'', pos);
        k = m.lastIndex;
        if (r[3]) out += expandEntity(r[3], inAttribute, depth, chain, pos);
        else { const cp = r[1] ? parseInt(r[1], 16) : parseInt(r[2], 10); if (!isChar(cp)) fail('xmlParseCharRef: invalid xmlChar value ' + cp, pos); out += String.fromCodePoint(cp); }
      } else if (inAttribute && (c === '\t' || c === '\n')){ out += ' '; k++; }
      else { out += c; k++; }
    }
    return out;
  };

  // --- Attributwert (§3.3.3) ------------------------------------------------------
  const attValue = () => {
    const q = text[i];
    if (q !== '"' && q !== "'") fail('AttValue: " or \' expected', i);
    const start = ++i;
    const end = text.indexOf(q, start);
    if (end === -1) fail('AttValue: \' expected', start - 1);
    const raw = text.slice(start, end);
    i = end + 1;
    if (raw.indexOf('<') !== -1) fail("Unescaped '<' not allowed in attributes values", start + raw.indexOf('<'));
    if (raw.indexOf('&') === -1 && raw.indexOf('\n') === -1 && raw.indexOf('\t') === -1) return raw;
    let out = '';
    for (let k = 0; k < raw.length;){
      const c = raw[k];
      if (c === '&'){
        const m = /&(?:#(?:x([0-9A-Fa-f]+)|([0-9]+))|([^;&<\s]+));/y; m.lastIndex = k;
        const r = m.exec(raw);
        if (!r) fail('EntityRef: expecting \';\'', start + k);
        if (r[3]) out += expandEntity(r[3], true, 0, [], start + k);
        else { const cp = r[1] ? parseInt(r[1], 16) : parseInt(r[2], 10); if (!isChar(cp)) fail('xmlParseCharRef: invalid xmlChar value ' + cp, start + k); out += String.fromCodePoint(cp); }
        k = m.lastIndex;
      } else if (c === '\t' || c === '\n'){ out += ' '; k++; }
      else { out += c; k++; }
    }
    return out;
  };

  // --- Prolog -------------------------------------------------------------------
  if (at('<?xml') && /[ \t\n?]/.test(text[5] || '')){
    const start = i;
    const end = text.indexOf('?>', i);
    if (end === -1) fail('parsing XML declaration: \'?>\' expected', start);
    const decl = text.slice(i + 5, end);
    const m = /^\s+version\s*=\s*(?:"([^"]*)"|'([^']*)')(?:\s+encoding\s*=\s*(?:"([^"]*)"|'([^']*)'))?(?:\s+standalone\s*=\s*(?:"(yes|no)"|'(yes|no)'))?\s*$/.exec(decl);
    if (!m) fail('Malformed XML declaration', start);
    const version = m[1] ?? m[2], encoding = m[3] ?? m[4] ?? null, standalone = m[5] ?? m[6] ?? null;
    if (version !== '1.0' && version !== '1.1') fail('Unsupported version \'' + version + '\'', start);
    if (encoding !== null && !/^[A-Za-z][A-Za-z0-9._-]*$/.test(encoding)) fail('Invalid XML encoding name', start);
    doc.declaration = { version, encoding, standalone };
    i = end + 2;
  }
  const comment = () => {
    const start = i;
    const end = text.indexOf('-->', i + 4);
    if (end === -1) fail('Comment not terminated', start);
    const body = text.slice(i + 4, end);
    if (body.indexOf('--') !== -1) fail('Double hyphen within comment', i + 4 + body.indexOf('--'));
    if (body.endsWith('-')) fail('Comment must not end with \'-\'', end - 1);
    i = end + 3;
  };
  const pi = () => {
    const start = i;
    i += 2;
    const target = name();
    if (!target) fail('xmlParsePI : no target name', start);
    if (target.toLowerCase() === 'xml') fail(target === 'xml' ? 'XML declaration allowed only at the start of the document' : 'xmlParsePI : target \'' + target + '\' is reserved', start);
    const end = text.indexOf('?>', i);
    if (end === -1) fail('ParsePI: PI ' + target + ' never end ...', start);
    if (end > i && !/[ \t\n]/.test(text[i])) fail('ParsePI: PI ' + target + ' space expected', i);
    i = end + 2;
  };
  // Misc* (§2.8): Kommentare, PIs, Leerraum.
  const misc = () => {
    for (;;){
      if (skipS()) continue;
      if (at('<!--')){ comment(); continue; }
      if (at('<?')){ pi(); continue; }
      return;
    }
  };
  // Ein Literal in Anführungszeichen ab i, roh.
  const literal = what => {
    const q = text[i];
    if (q !== '"' && q !== "'") fail(what + ': " or \' expected', i);
    const end = text.indexOf(q, i + 1);
    if (end === -1) fail(what + ' not terminated', i);
    const v = text.slice(i + 1, end);
    i = end + 1;
    return v;
  };
  const doctype = () => {
    const start = i;
    i += 9;
    if (!skipS()) fail('Space required after \'<!DOCTYPE\'', i);
    const dname = name();
    if (!dname) fail('xmlParseDocTypeDecl : no DOCTYPE name !', i);
    skipS();
    if (at('SYSTEM') || at('PUBLIC')){
      const pub = at('PUBLIC'); i += 6;
      if (!skipS()) fail('Space required after \'' + (pub ? 'PUBLIC' : 'SYSTEM') + '\'', i);
      if (pub){ literal('PubidLiteral'); if (!skipS()) fail('Space required after the Public Identifier', i); }
      literal('SystemLiteral');
      skipS();
    }
    if (at('[')){
      i++;
      for (;;){
        if (skipS()) continue;
        if (at(']')){ i++; break; }
        if (at('<!--')){ comment(); continue; }
        if (at('<?')){ pi(); continue; }
        if (at('%')) fail('Parameter entity references are not supported', i);
        if (at('<!ENTITY')){
          const estart = i;
          i += 8;
          if (!skipS()) fail('Space required after \'<!ENTITY\'', i);
          let parameter = false;
          if (at('%')){ parameter = true; i++; if (!skipS()) fail('Space required after \'%\'', i); }
          const ename = name();
          if (!ename) fail('xmlParseEntityDecl: no name', i);
          if (!skipS()) fail('Space required after the entity name', i);
          let entity;
          if (at('SYSTEM') || at('PUBLIC')){
            const pub = at('PUBLIC'); i += 6;
            if (!skipS()) fail('Space required after \'' + (pub ? 'PUBLIC' : 'SYSTEM') + '\'', i);
            if (pub){ literal('PubidLiteral'); if (!skipS()) fail('Space required after the Public Identifier', i); }
            literal('SystemLiteral');
            if (skipS() && at('NDATA')){ i += 5; if (!skipS()) fail('Space required after \'NDATA\'', i); if (!name()) fail('xmlParseEntityDecl: no NDATA name', i); skipS(); }
            entity = { external: true };
          } else {
            // EntityValue (§4.2.2): Zeichenreferenzen werden jetzt aufgelöst, Entitätsverweise bleiben für später (§4.4.5/§4.4.8), %-Verweise sind nicht unterstützt.
            const vstart = i;
            let raw = literal('EntityValue');
            if (raw.indexOf('%') !== -1) fail('Parameter entity references are not supported', vstart);
            raw = raw.replace(/&#(?:x([0-9A-Fa-f]+)|([0-9]+));/g, (all, h, d) => { const cp = h ? parseInt(h, 16) : parseInt(d, 10); if (!isChar(cp)) fail('xmlParseCharRef: invalid xmlChar value ' + cp, vstart); return String.fromCodePoint(cp); });
            entity = { value: raw };
          }
          skipS();
          expect('>', 'xmlParseEntityDecl: entity ' + ename + ' not terminated');
          if (!parameter && !entities.has(ename)) entities.set(ename, entity); // die erste Deklaration gilt (§4.2)
          continue;
        }
        if (at('<!ELEMENT') || at('<!ATTLIST') || at('<!NOTATION')){
          // Übersprungen bis zum schließenden > außerhalb von Anführungszeichen.
          let k = i + 2, q = null;
          for (; k < n; k++){
            const c = text[k];
            if (q){ if (c === q) q = null; }
            else if (c === '"' || c === "'") q = c;
            else if (c === '>') break;
          }
          if (k >= n) fail('Declaration not terminated', i);
          i = k + 1;
          continue;
        }
        fail('xmlParseInternalSubset: error detected in Markup declaration', i);
      }
      skipS();
    }
    expect('>', 'DOCTYPE improperly terminated');
    doc.doctype = { name: dname, entities: [...entities.keys()] };
    void start;
  };
  misc();
  if (at('<!DOCTYPE')){ doctype(); misc(); }
  if (i >= n) fail(text.trim() ? 'Start tag expected, \'<\' not found' : 'Document is empty', i);
  if (text[i] !== '<') fail('Start tag expected, \'<\' not found', i);

  // --- Elemente und Inhalt ----------------------------------------------------------
  // Jeder Rahmen des Stapels: { el, ns (Map Präfix → URI, geerbt), line }
  const stack = [];
  let cur = null, curNs = new Map([['xml', XML_NS]]);
  const lineOf = pos => { let l = 1; for (let k = 0; k < pos; k++) if (text.charCodeAt(k) === 10) l++; return l; };
  const addText = (data, cdata) => {
    if (!cur) return; // nur nach Leerraumprüfung aufgerufen
    const node = new XmlText(data, cdata);
    node.parentNode = cur;
    cur.childNodes.push(node);
  };
  // QName → [Präfix, lokaler Name]; beide müssen NCNames sein (Namespaces in XML
  // §3): "bpmn:1task" ist ein XML-Name, aber kein QName.
  const splitName = (qname, pos) => {
    const c = qname.indexOf(':');
    if (c === -1){ if (!NC_START_RE.test(qname)) fail('Failed to parse QName \'' + qname + '\'', pos); return [null, qname]; }
    if (c === 0 || c === qname.length - 1 || qname.indexOf(':', c + 1) !== -1 || !NC_START_RE.test(qname) || !NC_START_RE.test(qname.slice(c + 1))) fail('Failed to parse QName \'' + qname + '\'', pos);
    return [qname.slice(0, c), qname.slice(c + 1)];
  };

  while (i < n){
    const c = text[i];
    if (c === '<'){
      if (at('</')){
        const start = i;
        i += 2;
        const ename = name();
        if (!ename) fail('expected name after </', i);
        if (!cur) fail('Extra content at the end of the document', start);
        if (ename !== cur.nodeName) fail('Opening and ending tag mismatch: ' + cur.nodeName + ' line ' + lineOf(stack[stack.length - 1].pos) + ' and ' + ename, start);
        skipS();
        expect('>', 'expected \'>\'');
        stack.pop();
        if (stack.length){ cur = stack[stack.length - 1].el; curNs = stack[stack.length - 1].ns; }
        else {
          cur = null;
          misc();
          if (i < n) fail('Extra content at the end of the document', i);
        }
        continue;
      }
      if (at('<!--')){ comment(); continue; }
      if (at('<![CDATA[')){
        if (!cur) fail('Extra content at the end of the document', i);
        const end = text.indexOf(']]>', i + 9);
        if (end === -1) fail('CData section not finished', i);
        addText(text.slice(i + 9, end), true);
        i = end + 3;
        continue;
      }
      if (at('<?')){ pi(); continue; }
      if (at('<!')) fail(at('<!DOCTYPE') ? 'DOCTYPE allowed only in the prolog' : 'StartTag: invalid element name', i);
      // Starttag
      const start = i;
      i++;
      const qname = name();
      if (!qname) fail('StartTag: invalid element name', start);
      if (!cur && doc.documentElement) fail('Extra content at the end of the document', start);
      const [prefix, local] = splitName(qname, start);
      const el = new XmlElement(qname, prefix, local);
      const seen = new Set();
      let ns = curNs, selfClosing = false;
      for (;;){
        const had = skipS();
        if (at('/>')){ selfClosing = true; i += 2; break; }
        if (at('>')){ i++; break; }
        if (i >= n) fail('Couldn\'t find end of Start Tag ' + qname + ' line ' + lineOf(start), start);
        if (!had) fail('attributes construct error', i);
        const apos = i;
        const aname = name();
        if (!aname) fail('error parsing attribute name', apos);
        skipS();
        expect('=', 'Specification mandates value for attribute ' + aname);
        skipS();
        const value = attValue();
        if (seen.has(aname)) fail('Attribute ' + aname + ' redefined', apos);
        seen.add(aname);
        const [ap, al] = splitName(aname, apos);
        if (aname === 'xmlns' || ap === 'xmlns'){
          if (ap === 'xmlns' && al === 'xmlns') fail('xml namespace prefix mapped to wrong URI', apos);
          if (ap === 'xmlns' && al === 'xml' && value !== XML_NS) fail('xml namespace prefix mapped to wrong URI', apos);
          if (ap === 'xmlns' && al !== 'xml' && value === XML_NS) fail('reuse of the xml namespace name', apos);
          if (ap === 'xmlns' && value === '') fail('xmlns:' + al + ': Empty XML namespace is not allowed', apos);
          if (ns === curNs) ns = new Map(curNs);
          ns.set(ap ? al : '', value);
          el.attributes.push({ name: aname, prefix: ap, localName: al, namespaceURI: XMLNS_NS, value });
        } else el.attributes.push({ name: aname, prefix: ap, localName: al, namespaceURI: null, value });
      }
      // Namensräume auflösen (Namespaces in XML 1.0 §6).
      if (prefix){ if (!ns.has(prefix)) fail('Namespace prefix ' + prefix + ' on ' + local + ' is not defined', start); el.namespaceURI = ns.get(prefix); }
      else el.namespaceURI = ns.get('') || null;
      for (const a of el.attributes){
        if (a.namespaceURI === XMLNS_NS || !a.prefix) continue;
        if (!ns.has(a.prefix)) fail('Namespace prefix ' + a.prefix + ' for ' + a.localName + ' on ' + local + ' is not defined', start);
        a.namespaceURI = ns.get(a.prefix);
      }
      if (cur){ el.parentElement = cur; el.parentNode = cur; cur.children.push(el); cur.childNodes.push(el); }
      else doc.documentElement = el;
      if (!selfClosing){ stack.push({ el, ns, pos: start }); cur = el; curNs = ns; }
      else if (!stack.length){ cur = null; misc(); if (i < n) fail('Extra content at the end of the document', i); }
      continue;
    }
    if (c === '&'){
      if (!cur) fail('Extra content at the end of the document', i);
      const start = i;
      if (at('&#')) addText(charRef(), false);
      else {
        i++;
        const ename = name();
        if (!ename) fail('xmlParseEntityRef: no name', start);
        expect(';', 'EntityRef: expecting \';\'');
        addText(expandEntity(ename, false, 0, [], start), false);
      }
      continue;
    }
    // Text bis zum nächsten < oder &.
    let end = i;
    for (; end < n; end++){ const d = text.charCodeAt(end); if (d === 60 || d === 38) break; }
    const run = text.slice(i, end);
    if (!cur){
      if (run.trim()) fail(doc.documentElement ? 'Extra content at the end of the document' : 'Start tag expected, \'<\' not found', i);
    } else {
      const bad = run.indexOf(']]>');
      if (bad !== -1) fail('Sequence \']]>\' not allowed in content', i + bad);
      addText(run, false);
    }
    i = end;
  }
  if (stack.length) fail('Premature end of data in tag ' + cur.nodeName + ' line ' + lineOf(stack[stack.length - 1].pos), n);
  if (!doc.documentElement) fail('Start tag expected, \'<\' not found', n);
  return doc;
}
