#!/usr/bin/env python3
"""dokufix for language models: Markdown into a dokufix file and back out.

    python3 dokufix.py inject <markdown> <target>   writes a new dokufix file, or the document of one
    python3 dokufix.py extract <file> [--part <n>]  prints its Markdown, or one part of it by number or name
    python3 dokufix.py overview <file>              prints per part its header and its headings as JSON

Python 3 and its standard library alone. No command prints HTML. See
src/README.md, "The script for language models".
"""
import argparse
import base64
import contextlib
import gzip
import hashlib
import json
import math
import os
import re
import shutil
import sys
import tempfile
import urllib.parse
import uuid
import zlib
from pathlib import Path

# shortcut: the blank is the repo's built file; story 12 puts it beside this script.
BLANK = Path(__file__).resolve().parents[2] / 'dist' / 'dokufix.html'


class Refusal(Exception):
    pass


def block_pattern(block_id):
    # A data block holds every < as \u003c, so its first </script> is its end.
    return re.compile(r'(<script type="application/json" id="' + block_id + r'">)(.*?)(</script>)', re.S)


def encode_block(obj):
    # As encodeJsonForScript (src/app/downloads/with-editor.js) writes a block.
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')


def replace_block(html, block_id, obj, where):
    found = block_pattern(block_id).findall(html)
    if len(found) != 1:
        raise Refusal('%s has %d blocks #%s, not one; it is no dokufix file with editor' % (where, len(found), block_id))
    # A function as replacement, so backslashes in the JSON stay as they are.
    return block_pattern(block_id).sub(lambda m: m.group(1) + encode_block(obj) + m.group(3), html, count=1)


# As ASSET_MAX_INPUT_BYTES in src/app/assets.js.
IMAGE_MAX_BYTES = 5 * 1024 * 1024
# Code as the editor's Markdown reads it: a fence, at any indent, to its closing fence or the end (a backtick
# fence holds no backtick after its run), a code span, a run of backticks not escaped to the next run as long,
# within a paragraph, and an HTML comment.
# shortcut: an indented code block is not told apart from a list's continuation; an image in one is embedded.
CODE = re.compile(r'^[ \t]*(`{3,}(?=[^`\n]*$)|~{3,}).*?(?:\n[ \t]*\1[`~]*[ \t]*$|\Z)'
                  r'|(?<![`\\])(`+)(?!`)(?:[^\n]|\n(?![ \t]*\n))+?(?<!`)\2(?!`)|<!--.*?-->', re.M | re.S)
# ![alt](path "title"), the alt with one level of brackets, the path with one of parentheses or in <...>.
ALT = r'(?:[^\[\]\\]|\\.|\[[^\[\]]*\])*'
TITLE = r'''([ \t]+(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\([^()\n]*\)))?'''
IMAGE = re.compile(r'(?<!\\)(!\[' + ALT + r'\]\()[ \t]*(?:<([^<>\n]*)>|((?:[^\s()<>]|\([^\s()<>]*\))+))' + TITLE + r'[ \t]*\)')
# ![alt][label], ![label][] and ![label]: their path stands in a definition [label]: path "title".
IMAGE_REF = re.compile(r'(?<!\\)!\[(' + ALT + r')\](?:\[([^\[\]]*)\])?(?![(\[:])')
# shortcut: a definition on one line; a link that shares it with an image points at the asset too.
DEFINITION = re.compile(r'^([ ]{0,3}\[([^\[\]]+)\]:[ \t]*)(?:<([^<>\n]*)>|(\S+))' + TITLE + r'[ \t]*$', re.M)
# <img src="path">: only src changes, quoted as the page resolves it (src/app/assets.js, ASSET_SRC_ATTR_RE).
IMG_TAG = re.compile(r'''(<img\b[^>]*?\s)src[ \t]*=[ \t]*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))''', re.I)


def label(text):
    # As the Markdown matches labels: case and runs of whitespace do not count.
    return ' '.join(text.split()).casefold()


def image_type(data):
    # The types the editor shows, by their first bytes; no SVG (Ben, 2026-10-27).
    for magic, mime in ((b'\x89PNG\r\n\x1a\n', 'image/png'), (b'\xff\xd8\xff', 'image/jpeg'), (b'GIF87a', 'image/gif'), (b'GIF89a', 'image/gif')):
        if data.startswith(magic):
            return mime
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    return None


def embed_images(text, markdown_path):
    """The text with each image file it names pointed at its asset, and those assets by hash (FR28)."""
    assets = {}

    def embed(dest):
        # Web addresses, //... and #..., so #asset-..., stay as written (Ben, 2026-10-27): None.
        if re.match(r'[A-Za-z][\w+.-]*:|//|#', dest):
            return None
        path = Path(markdown_path).parent / urllib.parse.unquote(dest)
        try:
            if path.stat().st_size > IMAGE_MAX_BYTES:
                raise Refusal('the image %s in %s is larger than 5 MB' % (dest, markdown_path))
            data = path.read_bytes()
        except OSError as e:
            raise Refusal('the image %s in %s cannot be read: %s' % (dest, markdown_path, e))
        mime = image_type(data)
        if not mime:
            raise Refusal('the image %s in %s is no PNG, JPEG, GIF or WebP' % (dest, markdown_path))
        h = hashlib.sha256(data).hexdigest()
        assets[h] = {'m': mime, 'd': base64.b64encode(data).decode('ascii')}
        return '#asset-' + h

    def image(m):
        ref = embed(m.group(2) if m.group(2) is not None else m.group(3))
        return m.group(1) + ref + (m.group(4) or '') + ')' if ref else m.group(0)

    def definition(m):
        ref = label(m.group(2)) in used and embed(m.group(3) if m.group(3) is not None else m.group(4))
        return m.group(1) + ref + (m.group(5) or '') if ref else m.group(0)

    def tag(m):
        ref = embed(next(g for g in m.groups()[1:] if g is not None))
        return m.group(1) + 'src="' + ref + '"' if ref else m.group(0)

    parts, i = [], 0
    for c in CODE.finditer(text):
        parts += [(text[i:c.start()], False), (c.group(0), True)]
        i = c.end()
    parts.append((text[i:], False))
    used = {label(m.group(2) or m.group(1)) for t, code in parts if not code for m in IMAGE_REF.finditer(t)}
    out = ''.join(t if code else IMG_TAG.sub(tag, DEFINITION.sub(definition, IMAGE.sub(image, t))) for t, code in parts)
    return out, assets


def add_assets(html, assets, where):
    # What the file holds stays; the block is written only for a new one, so a file without new images keeps it byte for byte.
    m = block_pattern('dokufix-assets').search(html)
    try:
        held = json.loads(m.group(2).strip() or '{}') if m else {}
    except ValueError as e:
        raise Refusal('%s: the block #dokufix-assets cannot be read: %s' % (where, e))
    if not isinstance(held, dict):
        raise Refusal('%s: the block #dokufix-assets holds no assets' % where)
    new = {h: a for h, a in assets.items() if h not in held}
    return replace_block(html, 'dokufix-assets', {**held, **new}, where) if new else html


def read_html(path):
    try:
        # Bytes, not text mode: its line endings stay as they are.
        return Path(path).read_bytes().decode('utf-8')
    except (OSError, UnicodeDecodeError) as e:
        raise Refusal('%s cannot be read: %s' % (path, e))


def inject(markdown_path, target_path):
    target = Path(target_path)
    try:
        # utf-8-sig: a byte order mark of a Windows editor is no part of the document.
        text = Path(markdown_path).read_bytes().decode('utf-8-sig')
    except UnicodeDecodeError:
        raise Refusal('%s is not UTF-8' % markdown_path)
    except OSError as e:
        raise Refusal('%s cannot be read: %s' % (markdown_path, e))
    # As a <textarea> keeps it: what the editor saves is what extract returns.
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    if not text.strip():
        raise Refusal('%s is empty or only whitespace; there is no document to write' % markdown_path)
    text, assets = embed_images(text, markdown_path)
    if target.exists():
        return inject_into(target.resolve(), text, assets)
    html = replace_block(read_html(BLANK), 'dokufix-source', {'text': text}, BLANK)
    html = replace_block(html, 'dokufix-history', {'uuid': str(uuid.uuid4()), 'version': 0, 'history': []}, BLANK)
    html = add_assets(html, assets, BLANK)
    try:
        with open(target, 'x', encoding='utf-8', newline='') as f:
            f.write(html)
    except OSError as e:
        raise Refusal('%s cannot be written: %s' % (target, e))


def inject_into(target, text, assets):
    # The document alone: identifier, version history and images stay, and no version is added (FR27).
    if target == BLANK.resolve():
        raise Refusal('%s is the blank; inject into a new file instead' % target)
    if not os.access(target, os.W_OK):
        raise Refusal('%s cannot be written: it is write-protected' % target)
    html = add_assets(replace_block(read_html(target), 'dokufix-source', {'text': text}, target), assets, target)
    # Written beside it with its mode and moved over it, so that a failed write leaves the file as it was.
    # shortcut: a new file replaces it, so hard links, ACLs and the owner are not kept; write in place if one needs them.
    tmp = None
    try:
        fd, tmp = tempfile.mkstemp(dir=target.parent, prefix='.' + target.name + '.', suffix='.dokufix-inject')
        with os.fdopen(fd, 'w', encoding='utf-8', newline='') as f:
            f.write(html)
        shutil.copymode(target, tmp)
        os.replace(tmp, target)
    except OSError as e:
        if tmp:
            with contextlib.suppress(OSError):
                os.unlink(tmp)
        raise Refusal('%s cannot be written: %s' % (target, e))


def extract(file_path):
    html = read_html(file_path)
    m = block_pattern('dokufix-source').search(html)
    if not m:
        raise Refusal('%s is no dokufix file with editor: it has no block #dokufix-source' % file_path)
    # As readTextBlock (src/app/document.js) reads it: gz before text.
    try:
        block = json.loads(m.group(2).strip() or '{}')
        if isinstance(block.get('gz'), str) and block['gz']:
            return gzip.decompress(base64.b64decode(block['gz'])).decode('utf-8')
        if isinstance(block.get('text'), str):
            return block['text']
    except (ValueError, OSError, EOFError, zlib.error, AttributeError) as e:
        raise Refusal('%s: the block #dokufix-source cannot be read: %s' % (file_path, e))
    raise Refusal('%s: the block #dokufix-source holds no document' % file_path)


# --- Parts ----------------------------------------------------------------
# A port of the reader of parts in src/app/frontmatter.js, by src/README.md, "Parts and their headers"; each
# function names its original, so a change to one is found from the other. tests/test_dokufix_skript.py runs it
# against the cases of tests/fixtures/parts/, as tests/parts-cases.test.mjs runs the original.
# shortcut: Python's strip() and \s are JavaScript's trim() and \s but for \ufeff (JavaScript's only) and \x1c-\x1f,
# \x85 (Python's only); a lone \r, \u2028 or \u2029 ends a line for JavaScript's . ^ $ alone; JavaScript lists a
# header's integer-like keys first. No case holds these; port a helper of JavaScript's rules when one must.

def fm_strip_comment(s):  # fmStripComment
    # A '#' opens a comment only after whitespace or at the start, so "https://x.com#frag" keeps its fragment.
    m = re.search(r'(?:^|\s)#', s)
    return s[:m.start()] if m else s


def fm_find_quote_end(s, q):  # fmFindQuoteEnd
    i = 1
    while i < len(s):
        if (q == '"' and s[i] == '\\') or (q == "'" and s[i:i + 2] == "''"):
            i += 2
            continue
        if s[i] == q:
            return i
        i += 1
    return -1


FM_DQ_ESCAPES = {'"': '"', '\\': '\\', '/': '/', 'n': '\n', 'r': '\r', 't': '\t'}  # FM_DQ_ESCAPES


def fm_scalar(raw):  # fmScalar
    s = raw.strip()
    if not s:
        return ''
    q = s[0]
    if q in '"\'':
        end = fm_find_quote_end(s, q)
        if end < 0:
            raise ValueError('unterminated quoted scalar')
        inner = s[1:end]
        if fm_strip_comment(s[end + 1:]).strip():
            raise ValueError('trailing content after quoted scalar')
        if q == "'":
            return inner.replace("''", "'")

        def unescape(m):
            if m.group(1) not in FM_DQ_ESCAPES:
                raise ValueError('unsupported escape sequence: \\' + m.group(1))
            return FM_DQ_ESCAPES[m.group(1)]
        return re.sub(r'\\(.)', unescape, inner)
    v = fm_strip_comment(s).strip()
    for start, what in (('[|>]', 'block scalars'), ('[&*]', 'anchors and aliases'), ('!', 'tags'), (r'[\[{]', 'flow collections')):
        if re.match(start, v):
            raise ValueError(what + ' are not supported')
    return v


def fm_unquote_key(k):  # fmUnquoteKey
    s = k.strip()
    if len(s) > 1 and s[0] == s[-1] and s[0] in '"\'':
        return s[1:-1]
    return s


def fm_is_seq_item(text):  # fmIsSeqItem
    return text == '-' or text.startswith('- ')


FM_KEY_LINE_RE = re.compile(r'[ \t]*[^:#\s][^:#]*?[ \t]*:(?:[ \t]|$)')  # FM_KEY_LINE_RE


def fm_parse_node(lines, i, indent):  # fmParseNode; lines of (indent, text, line)
    return (fm_parse_seq if fm_is_seq_item(lines[i][1]) else fm_parse_map)(lines, i, indent)


def fm_define(out, key, value):  # fmDefine
    if key in out:
        raise ValueError('duplicate key: ' + key)
    out[key] = value


def fm_parse_map(lines, i, indent):  # fmParseMap
    out = {}
    while i < len(lines):
        ind, text, line = lines[i]
        if ind < indent:
            break
        if ind > indent:
            raise ValueError('unexpected indentation on line %d' % line)
        if fm_is_seq_item(text):
            break
        m = re.match(r'([^:#]+?)\s*:(?:\s+(.*))?$', text)
        if not m:
            raise ValueError('unsupported line: ' + text)
        key = fm_unquote_key(m.group(1))
        rest = (m.group(2) or '').strip()
        if rest.startswith('#'):
            rest = ''
        i += 1
        if rest:
            fm_define(out, key, fm_scalar(rest))
            continue
        nxt = lines[i] if i < len(lines) else None
        if nxt and nxt[0] > indent:
            value, i = fm_parse_node(lines, i, nxt[0])
        elif nxt and nxt[0] == indent and fm_is_seq_item(nxt[1]):
            # A sequence written flush with its key.
            value, i = fm_parse_seq(lines, i, indent)
        else:
            value = ''
        fm_define(out, key, value)
    return out, i


def fm_parse_seq(lines, i, indent):  # fmParseSeq
    out = []
    while i < len(lines):
        ind, text, line = lines[i]
        if ind < indent:
            break
        if ind > indent:
            raise ValueError('unexpected indentation on line %d' % line)
        if not fm_is_seq_item(text):
            break
        rest = ('' if text == '-' else text[2:]).strip()
        i += 1
        if FM_KEY_LINE_RE.match(rest):
            raise ValueError('sequences of maps are not supported')
        nxt = lines[i] if i < len(lines) else None
        if rest or not (nxt and nxt[0] > indent):
            out.append(fm_scalar(rest))
            continue
        value, i = fm_parse_node(lines, i, nxt[0])
        # The same sequence of maps spelled across two lines.
        if isinstance(value, dict):
            raise ValueError('sequences of maps are not supported')
        out.append(value)
    return out, i


def parse_yaml_subset(text):  # parseYamlSubset
    lines = []
    for n, raw in enumerate(re.split(r'\r?\n', text)):
        if re.match(r'[ \t]*(?:#|$)', raw):
            continue
        lead = re.match(r'[ \t]*', raw).group(0)
        if '\t' in lead:
            raise ValueError('tab indentation is not supported')
        lines.append((len(lead), raw[len(lead):].rstrip(), n + 1))
    if not lines:
        raise ValueError('empty block')
    value, nxt = fm_parse_node(lines, 0, lines[0][0])
    if nxt != len(lines):
        raise ValueError('inconsistent indentation')
    return value


FM_SUMMARY_KEYS = ('title', 'version', 'date', 'author')  # FM_SUMMARY_KEYS


def fm_looks_like_frontmatter(raw):  # fmLooksLikeFrontmatter
    lines = [l for l in re.split(r'\r?\n', raw) if not re.match(r'[ \t]*(?:#|$)', l)]
    if not lines:
        return False
    if re.match(r'[ \t]*\{', lines[0]):
        return True
    entries, recognized = 0, False
    for line in lines:
        if re.match(r'[ \t]', line) or not FM_KEY_LINE_RE.match(line):
            continue
        entries += 1
        recognized = recognized or fm_unquote_key(line[:line.index(':')]).lower() in FM_SUMMARY_KEYS
    return recognized or entries >= 2


def fm_has_prose_paragraph(raw):  # fmHasProseParagraph
    blank = False
    for line in re.split(r'\r?\n', raw):
        if re.match(r'[ \t]*$', line):
            blank = True
            continue
        if re.match(r'[ \t]*#', line):
            continue
        structural = re.match(r'[ \t]', line) or fm_is_seq_item(line.strip()) or FM_KEY_LINE_RE.match(line)
        if blank and not structural:
            return True
        blank = False
    return False


def refuse_constant(name):
    # JSON.parse knows no NaN, Infinity or -Infinity.
    raise ValueError(name + ' is no JSON')


def split_frontmatter(src):  # splitFrontmatter
    none = {'raw': '', 'kind': None, 'data': None, 'body': src}
    m = re.match(r'---([A-Za-z]*)[ \t]*\r?\n', src)
    if not m:
        return none
    fence = m.group(1).lower()
    if fence not in ('', 'json', 'yaml'):
        return none
    rest = src[m.end():]
    close = re.search(r'^---[ \t]*(?:\r?\n|$)', rest, re.M)
    if not close:
        return none
    raw, body = rest[:close.start()], rest[close.end():]
    if not raw.strip():
        # An explicit empty header is consumed; without a fence it is two thematic breaks.
        return {'raw': raw, 'kind': None, 'data': None, 'body': body} if fence else none
    if not fence and (not fm_looks_like_frontmatter(raw) or fm_has_prose_paragraph(raw)):
        return none
    trimmed = raw.strip()
    try:
        if fence == 'json' or (not fence and trimmed.startswith('{')):
            # A number too large for a float is null, as JSON.stringify writes Infinity; overview prints JSON.
            kind, data = 'json', json.loads(trimmed, parse_constant=refuse_constant,
                                            parse_float=lambda f: float(f) if math.isfinite(float(f)) else None)
        else:
            if re.match(r'[\[{]', trimmed):
                raise ValueError('flow collections are not supported')
            kind, data = 'yaml', parse_yaml_subset(raw)
        if not isinstance(data, dict):
            raise ValueError('not a mapping')
        if not data:
            raise ValueError('empty mapping')
        return {'raw': raw, 'kind': kind, 'data': data, 'body': body}
    except (ValueError, RecursionError) as e:
        return {'raw': raw, 'kind': 'raw', 'data': None, 'body': body, 'error': str(e)}


def fences(text):  # fences
    """The fenced blocks of a text, (start, end) of each one's content, as marked reads them."""
    blocks, pos, opened = [], 0, None
    for line in text.split('\n'):
        nxt = pos + len(line) + 1
        l = line[:-1] if line.endswith('\r') else line
        if not opened:
            m = re.match(r' {0,3}(`{3,}|~{3,})(.*)$', l)
            if m and not (m.group(1)[0] == '`' and '`' in m.group(2)):
                opened = (m.group(1)[0], len(m.group(1)), min(nxt, len(text)))
        else:
            m = re.match(r' {0,3}(`{3,}|~{3,}) *$', l)
            if m and m.group(1)[0] == opened[0] and len(m.group(1)) >= opened[1]:
                blocks.append((opened[2], pos))
                opened = None
        pos = nxt
    if opened:
        blocks.append((opened[2], len(text)))
    return blocks


PART_RE = re.compile(r'---part[ \t]*$', re.I)
CLOSE_RE = re.compile(r'---[ \t]*$')
BLANK_RE = re.compile(r'[ \t]*$')
HEADING_RE = re.compile(r'(#{1,6})\s+(.+?)\s*$')


def in_code(code, at):
    return any(start <= at < end for start, end in code)


def headings(lines, start, end):
    """The ATX headings of lines [start, end) outside fenced code, as readParts looks for a name."""
    # shortcut: no setext headings, none in a block quote or a list; Claude writes ATX headings (docs/dokufix-fuer-llms.md).
    body, out, at = lines[start:end], [], 0
    code = fences('\n'.join(body))
    for n, l in enumerate(body):
        m = not in_code(code, at) and HEADING_RE.match(l)
        if m:
            out.append({'level': len(m.group(1)), 'text': m.group(2), 'line': start + n + 1})
        at += len(l) + 1
    return out


def read_parts(source):  # readParts
    """The parts of a document, each with its first line (from 1), its header (the data, or None), its problem
    ('header-missing', 'header-unclosed', 'header-unreadable' or None), its name, its body as line indexes
    [body, end), its headings, and its text: its lines with their endings, so the texts give the document."""
    raw = source.split('\n')
    lines = [l[:-1] if l.endswith('\r') else l for l in raw]
    code, starts, offsets = fences(source), [], [0]
    for i, l in enumerate(lines):
        if PART_RE.match(l) and not in_code(code, offsets[-1]):
            starts.append(i)
        offsets.append(offsets[-1] + len(raw[i]) + 1)
    if not starts or starts[0] != 0:
        starts.insert(0, 0)
    parts = []
    for n, s in enumerate(starts):
        end = starts[n + 1] if n + 1 < len(starts) else len(lines)
        part = {'line': s + 1, 'header': None, 'problem': None, 'name': None, 'body': s, 'end': end,
                'text': source[offsets[s]:offsets[end]]}
        if PART_RE.match(lines[s]):
            close = -1
            for j in range(s + 1, end):
                if BLANK_RE.match(lines[j]):
                    break
                if CLOSE_RE.match(lines[j]):
                    close = j
                    break
            if s + 1 == end or BLANK_RE.match(lines[s + 1]) or close == s + 1:
                part['problem'] = 'header-missing'
                part['body'] = s + 2 if close == s + 1 else s + 1
            elif close < 0:
                part['problem'] = 'header-unclosed'
                part['body'] = s + 1
            else:
                head = '\n'.join(lines[s + 1:close])
                fm = split_frontmatter(('---json\n' if head.strip().startswith('{') else '---yaml\n') + head + '\n---\n')
                part['header'] = fm['data']
                part['problem'] = 'header-unreadable' if fm['kind'] == 'raw' else None
                part['body'] = close + 1
        else:
            text = '\n'.join(lines[s:end])
            fm = split_frontmatter(text)
            part['header'] = fm['data']
            part['problem'] = 'header-unreadable' if fm['kind'] == 'raw' else None
            part['body'] = s + text[:len(text) - len(fm['body'])].count('\n')
        part['headings'] = headings(lines, part['body'], end)
        title = (part['header'] or {}).get('title')
        if isinstance(title, str) and title.strip():
            part['name'] = title
        elif part['headings']:
            part['name'] = part['headings'][0]['text']
        parts.append(part)
    return parts


def find_part(parts, wanted, where):
    """The part a number, from 1, or a name asks for."""
    count = '%d part%s' % (len(parts), '' if len(parts) == 1 else 's')
    if re.fullmatch(r'[0-9]+', wanted):
        if 1 <= int(wanted) <= len(parts):
            return parts[int(wanted) - 1]
        raise Refusal('%s has no part %s: it has %s' % (where, wanted, count))
    named = ['%d (line %d)' % (n, p['line']) for n, p in enumerate(parts, 1) if p['name'] == wanted]
    if not named:
        raise Refusal('%s has no part named %s: it has %s' % (where, wanted, count))
    if len(named) > 1:
        raise Refusal('%s: parts %s and %s are %s named %s; ask for one by its number' % (
            where, ', '.join(named[:-1]), named[-1], 'both' if len(named) == 2 else 'all', wanted))
    return next(p for p in parts if p['name'] == wanted)


def overview(document):
    """Per part its header and its headings, none of the text below them (FR32)."""
    return {'parts': [{'number': n, 'line': p['line'], 'name': p['name'], 'header': p['header'], 'problem': p['problem'],
                       'headings': p['headings']} for n, p in enumerate(read_parts(document), 1)]}


def main(argv=None):
    parser = argparse.ArgumentParser(prog='dokufix.py', description='Markdown into a dokufix file and back out.')
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('inject', help='write Markdown into a new dokufix file, or as the document of an existing one')
    p.add_argument('markdown')
    p.add_argument('target')
    p = commands.add_parser('extract', help='print the Markdown of a dokufix file, or of one part of it')
    p.add_argument('file')
    p.add_argument('--part', help='the number of the part, from 1, or its name; a name starting with - as --part=<name>')
    p = commands.add_parser('overview', help='print per part its header and its headings as JSON')
    p.add_argument('file')
    args = parser.parse_args(argv)
    try:
        if args.command == 'inject':
            inject(args.markdown, args.target)
        elif args.command == 'overview':
            out = json.dumps(overview(extract(args.file)), ensure_ascii=False) + '\n'
            # A lone surrogate of a JSON header is written as its escape, as JSON.stringify writes it.
            sys.stdout.buffer.write(out.encode('utf-8', errors='backslashreplace'))
        else:
            text = extract(args.file)
            if args.part is not None:
                text = find_part(read_parts(text), args.part, args.file)['text']
            sys.stdout.buffer.write(text.encode('utf-8'))
    except Refusal as e:
        print('dokufix.py: ' + str(e), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
