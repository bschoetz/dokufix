import { escapeHtml } from './html.js';

// --- Frontmatter -------------------------------------------------------
// Pure logic: this module loads without a page. The parser works on text, the
// panel on the root it is handed. tests/frontmatter.test.mjs runs it in Node.
//
// A leading YAML/JSON metadata block is not document content. Left alone,
// marked renders "---\ntitle: X\n---" as an <hr> plus a setext <h2> (the
// closing delimiter underlines the last line) — visible garbage in the
// preview and in every export. We split the block off before parsing and
// render it as a collapsible panel instead.
//
// Deliberately NOT a full YAML implementation: a library (~30 KB) against a
// ~16 KB artifact fails the "body for information" test. Supported subset is
// documented in src/README.md. Anything outside it throws, and the block
// falls back to being shown verbatim — never partially parsed, never
// silently dropped.

// A '#' only opens a comment when preceded by whitespace or at line start,
// so "https://x.com#frag" keeps its fragment.
function fmStripComment(s){
  const m = s.match(/(?:^|\s)#/);
  return m ? s.slice(0, m.index) : s;
}

function fmFindQuoteEnd(s, q){
  for (let i = 1; i < s.length; i++){
    if (q === '"' && s[i] === '\\'){ i++; continue; }
    if (q === "'" && s[i] === "'" && s[i+1] === "'"){ i++; continue; }
    if (s[i] === q) return i;
  }
  return -1;
}

const FM_DQ_ESCAPES = { '"':'"', '\\':'\\', '/':'/', n:'\n', r:'\r', t:'\t' };

function fmScalar(raw){
  const s = raw.trim();
  if (!s) return '';
  const q = s[0];
  if (q === '"' || q === "'"){
    const end = fmFindQuoteEnd(s, q);
    if (end < 0) throw new Error('unterminated quoted scalar');
    const inner = s.slice(1, end);
    if (fmStripComment(s.slice(end + 1)).trim()) throw new Error('trailing content after quoted scalar');
    return q === '"'
      // Every escape we don't decode must throw, not pass through: a literal
      // "café" in the panel is a silent mis-render, and this parser's
      // contract is to fail loudly so the raw block is shown instead.
      ? inner.replace(/\\(.)/g, (_, c) => {
          if (!Object.prototype.hasOwnProperty.call(FM_DQ_ESCAPES, c)) throw new Error('unsupported escape sequence: \\' + c);
          return FM_DQ_ESCAPES[c];
        })
      : inner.replace(/''/g, "'");
  }
  const v = fmStripComment(s).trim();
  // Out-of-subset constructs: fail loudly so the caller can show the raw block.
  if (/^[|>]/.test(v)) throw new Error('block scalars are not supported');
  if (/^[&*]/.test(v)) throw new Error('anchors and aliases are not supported');
  if (/^!/.test(v)) throw new Error('tags are not supported');
  if (/^[[{]/.test(v)) throw new Error('flow collections are not supported');
  // No type coercion on purpose — values are displayed, not computed on.
  return v;
}

function fmUnquoteKey(k){
  const s = k.trim();
  if (s.length > 1 && ((s[0] === '"' && s[s.length-1] === '"') || (s[0] === "'" && s[s.length-1] === "'"))) return s.slice(1, -1);
  return s;
}

function fmIsSeqItem(text){ return text === '-' || text.startsWith('- '); }

// One key alphabet for the whole feature. Three used to disagree: the sniffer's
// [A-Za-z0-9_.-] rejected keys the map parser reads fine ("Prüfer: Ben" reverted
// a whole German header to <hr>+<h2> garbage), and the sequence guard's [\w.-]
// missed keys the map parser accepts ("- Autor Name: Ben" became a scalar). This
// mirrors fmParseMap's own [^:#]+? — anything it calls a key, everyone calls a key.
const FM_KEY_LINE_RE = /^[ \t]*[^:#\s][^:#]*?[ \t]*:(?:[ \t]|$)/;

function fmParseNode(lines, i, indent){
  return fmIsSeqItem(lines[i].text) ? fmParseSeq(lines, i, indent) : fmParseMap(lines, i, indent);
}

// Object.create(null), not {}: "__proto__: x" on a plain object hits the
// inherited setter, so the key never becomes an own property and vanishes from
// the panel with no error. And a repeated key must throw rather than overwrite —
// both are the "half-parsed panel that silently dropped a key" this parser's
// fail-loudly contract rules out. A null-prototype object also makes `key in out`
// an honest own-key test.
function fmDefine(out, key, value){
  if (key in out) throw new Error('duplicate key: ' + key);
  out[key] = value;
}

function fmParseMap(lines, i, indent){
  const out = Object.create(null);
  while (i < lines.length){
    const ln = lines[i];
    if (ln.indent < indent) break;
    if (ln.indent > indent) throw new Error('unexpected indentation on line ' + ln.line);
    if (fmIsSeqItem(ln.text)) break;
    const m = ln.text.match(/^([^:#]+?)\s*:(?:\s+(.*))?$/);
    if (!m) throw new Error('unsupported line: ' + ln.text);
    const key = fmUnquoteKey(m[1]);
    let rest = (m[2] === undefined ? '' : m[2]).trim();
    if (rest.startsWith('#')) rest = '';
    i++;
    if (rest === ''){
      const nxt = lines[i];
      if (nxt && nxt.indent > indent){
        const r = fmParseNode(lines, i, nxt.indent);
        fmDefine(out, key, r.value); i = r.next;
      } else if (nxt && nxt.indent === indent && fmIsSeqItem(nxt.text)){
        // Sequence written flush with its key — the other common YAML style.
        const r = fmParseSeq(lines, i, indent);
        fmDefine(out, key, r.value); i = r.next;
      } else {
        fmDefine(out, key, '');
      }
    } else {
      fmDefine(out, key, fmScalar(rest));
    }
  }
  return { value: out, next: i };
}

function fmParseSeq(lines, i, indent){
  const out = [];
  while (i < lines.length){
    const ln = lines[i];
    if (ln.indent < indent) break;
    if (ln.indent > indent) throw new Error('unexpected indentation on line ' + ln.line);
    if (!fmIsSeqItem(ln.text)) break;
    const rest = (ln.text === '-' ? '' : ln.text.slice(2)).trim();
    i++;
    // "- key: value" (sequence of maps) is outside the subset. Without this
    // guard it would silently become the scalar string "key: value".
    if (FM_KEY_LINE_RE.test(rest)) throw new Error('sequences of maps are not supported');
    if (rest === ''){
      const nxt = lines[i];
      if (nxt && nxt.indent > indent){
        const r = fmParseNode(lines, i, nxt.indent);
        // The same construct spelled across two lines ("-" then an indented
        // "key: value"). Reject both spellings or neither — README lists the
        // construct as unsupported, not one way of writing it.
        if (r.value && typeof r.value === 'object' && !Array.isArray(r.value)) throw new Error('sequences of maps are not supported');
        out.push(r.value); i = r.next;
      } else {
        out.push('');
      }
    } else {
      out.push(fmScalar(rest));
    }
  }
  return { value: out, next: i };
}

function parseYamlSubset(text){
  const lines = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    if (/^[ \t]*$/.test(raw)) return;
    if (/^[ \t]*#/.test(raw)) return;
    const lead = raw.match(/^[ \t]*/)[0];
    if (lead.includes('\t')) throw new Error('tab indentation is not supported');
    lines.push({ indent: lead.length, text: raw.slice(lead.length).replace(/\s+$/, ''), line: idx + 1 });
  });
  if (!lines.length) throw new Error('empty block');
  const r = fmParseNode(lines, 0, lines[0].indent);
  if (r.next !== lines.length) throw new Error('inconsistent indentation');
  return r.value;
}

// Doubles as the detection signal below: a block carrying one of these is
// frontmatter even with a single entry, because no one opens a document with a
// prose line called "title:".
const FM_SUMMARY_KEYS = ['title', 'version', 'date', 'author'];

// Intent test, kept separate from parsability. A block that doesn't even look
// like a mapping is a thematic break and must render exactly as it always has
// (a doc may legitimately open with "---"). A block that DOES look like
// frontmatter but fails to parse is shown raw rather than reverted to garbage.
//
// "First line is shaped key:" is not enough on its own, because that shape is
// equally an ordinary sentence: "---\nNote: this is a draft.\n---" used to be
// reinterpreted as a one-entry mapping, which moved the author's prose out of
// the body and into a collapsed panel. The tie must never break toward hiding
// body text, so a second signal is required: either two entries, or one
// recognized metadata key. One prose line satisfies neither.
function fmLooksLikeFrontmatter(raw){
  const lines = raw.split(/\r?\n/).filter(l => !/^[ \t]*$/.test(l) && !/^[ \t]*#/.test(l));
  if (!lines.length) return false;
  if (/^[ \t]*\{/.test(lines[0])) return true; // JSON — unambiguous on its own
  let entries = 0;
  let recognized = false;
  for (const line of lines){
    if (/^[ \t]/.test(line)) continue;         // nested value, not a top-level entry
    const m = line.match(FM_KEY_LINE_RE);
    if (!m) continue;
    entries++;
    const key = fmUnquoteKey(line.slice(0, line.indexOf(':'))).toLowerCase();
    if (FM_SUMMARY_KEYS.includes(key)) recognized = true;
  }
  return recognized || entries >= 2;
}

// An unterminated block is the other way body text gets swallowed: the closing
// "---" search is document-wide, so it latches onto the next thematic break and
// drags whole paragraphs into the candidate, which then fails to parse and buries
// them in the "nicht lesbar" panel. Frontmatter never contains blank-line-separated
// prose; a document does. Reject on that signature and the block renders as the
// malformed source it is, with the prose left in the body where the author put it.
function fmHasProseParagraph(raw){
  let blank = false;
  for (const line of raw.split(/\r?\n/)){
    if (/^[ \t]*$/.test(line)){ blank = true; continue; }
    if (/^[ \t]*#/.test(line)) continue;
    const structural = /^[ \t]/.test(line) || fmIsSeqItem(line.trim()) || FM_KEY_LINE_RE.test(line);
    if (blank && !structural) return true;
    blank = false;
  }
  return false;
}

export function splitFrontmatter(src){
  const none = { raw: '', kind: null, data: null, body: src };
  if (typeof src !== 'string' || !src) return none;
  const open = src.match(/^---([A-Za-z]*)[ \t]*\r?\n/);
  if (!open) return none;
  const fence = open[1].toLowerCase();
  if (fence && fence !== 'json' && fence !== 'yaml') return none;
  const rest = src.slice(open[0].length);
  const close = rest.match(/^---[ \t]*(?:\r?\n|$)/m);
  if (!close) return none;
  const raw = rest.slice(0, close.index);
  const body = rest.slice(close.index + close[0].length);
  const explicit = !!fence;
  // An explicit but empty header ("---json\n---") has nothing to show. Announcing
  // "nicht lesbar" over an empty <pre> is a lie; consume the block and render
  // nothing. Without a fence an empty block is not frontmatter at all, so it stays
  // two thematic breaks (see deferred-work.md).
  if (!raw.trim()) return explicit ? { raw, kind: null, data: null, body } : none;
  if (!explicit && !fmLooksLikeFrontmatter(raw)) return none;
  if (!explicit && fmHasProseParagraph(raw)) return none;
  const trimmed = raw.trim();
  try {
    if (fence === 'json' || (!fence && trimmed.startsWith('{'))){
      const data = JSON.parse(trimmed);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not a JSON object');
      if (!Object.keys(data).length) throw new Error('empty mapping');
      return { raw, kind: 'json', data, body };
    }
    // Reachable only under an explicit ---yaml fence (the unfenced form is routed
    // to JSON.parse above and throws there). Without it, fmParseMap's lazy key
    // match reads "{a: 1}" as key "{a" / value "1}" — a confident-looking panel
    // over half-parsed data, and the fmScalar flow-collection guard never sees it
    // because it only ever inspects values.
    if (/^[[{]/.test(trimmed)) throw new Error('flow collections are not supported');
    const data = parseYamlSubset(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not a mapping');
    if (!Object.keys(data).length) throw new Error('empty mapping');
    return { raw, kind: 'yaml', data, body };
  } catch (err){
    return { raw, kind: 'raw', data: null, body, error: err.message };
  }
}

// Single source of truth for "what is this document called?" — used by the
// download filename and by all three read-only export <title>s. Reads the
// BODY, so a "#"-prefixed YAML comment can't masquerade as the heading.
export function deriveDocTitle(source, fallback){
  const m = splitFrontmatter(source).body.match(/^#\s+(.+?)\s*$/m);
  return (m ? m[1] : fallback).trim();
}

function fmLookup(data, name){
  const k = Object.keys(data).find(key => key.toLowerCase() === name);
  return k === undefined ? undefined : data[k];
}

function buildFrontmatterSummary(data){
  const parts = [];
  for (const name of FM_SUMMARY_KEYS){
    const v = fmLookup(data, name);
    if (v === null || v === undefined || typeof v === 'object') continue;
    const s = String(v).trim();
    if (s) parts.push(s);
  }
  return parts.join(' · ');
}

function buildFrontmatterValueHtml(v){
  if (v === null || v === undefined || v === '') return '<span class="dokufix-fm-empty">—</span>';
  if (Array.isArray(v)){
    if (!v.length) return '<span class="dokufix-fm-empty">—</span>';
    return '<ul class="dokufix-fm-list">' + v.map(x => '<li>' + buildFrontmatterValueHtml(x) + '</li>').join('') + '</ul>';
  }
  if (typeof v === 'object') return buildFrontmatterRowsHtml(v);
  return escapeHtml(String(v));
}

function buildFrontmatterRowsHtml(obj){
  const keys = Object.keys(obj);
  if (!keys.length) return '<span class="dokufix-fm-empty">—</span>';
  let html = '<dl class="dokufix-fm-rows">';
  for (const k of keys){
    html += '<dt>' + escapeHtml(k) + '</dt><dd>' + buildFrontmatterValueHtml(obj[k]) + '</dd>';
  }
  return html + '</dl>';
}

function buildFrontmatterHtml(fm){
  if (!fm || !fm.kind) return '';
  if (fm.kind === 'raw'){
    return '<details class="dokufix-frontmatter dokufix-fm-unparsed">' +
      '<summary><span class="dokufix-fm-label">Metadaten</span>' +
      '<span class="dokufix-fm-digest">nicht lesbar — Originaltext</span></summary>' +
      '<div class="dokufix-fm-body"><pre class="dokufix-fm-raw">' +
      escapeHtml(fm.raw.replace(/\s+$/, '')) + '</pre></div></details>';
  }
  const count = Object.keys(fm.data).length;
  const digest = buildFrontmatterSummary(fm.data) || (count + (count === 1 ? ' Eintrag' : ' Einträge'));
  return '<details class="dokufix-frontmatter">' +
    '<summary><span class="dokufix-fm-label">Metadaten</span>' +
    '<span class="dokufix-fm-digest">' + escapeHtml(digest) + '</span></summary>' +
    '<div class="dokufix-fm-body">' + buildFrontmatterRowsHtml(fm.data) + '</div></details>';
}

// A document pass, mirroring processInlineToc: every export variant renders
// and then takes a copy of the preview, so mutating the rendered document
// here is what makes the panel ship into all four downloads for free.
// Emits no headings, so assignHeadingIds/buildRail stay unaffected.
export function injectFrontmatterPanel(root, fm){
  const html = buildFrontmatterHtml(fm);
  if (html) root.insertAdjacentHTML('afterbegin', html);
}
