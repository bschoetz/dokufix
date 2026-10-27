#!/usr/bin/env python3
"""dokufix for language models: Markdown into a dokufix file and back out.

    python3 dokufix.py inject <markdown> <target>   writes a new dokufix file, or the document of one
    python3 dokufix.py extract <file>               prints its Markdown

Python 3 and its standard library alone. No command prints HTML. See
src/README.md, "The script for language models".
"""
import argparse
import base64
import contextlib
import gzip
import hashlib
import json
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
# ![alt](path "title"), the alt with one level of brackets, the path with one of parentheses or in <...>;
# reference-style images and <img> stay as written.
IMAGE = re.compile(r'(?<!\\)(!\[(?:[^\[\]\\]|\\.|\[[^\[\]]*\])*\]\()[ \t]*(?:<([^<>\n]*)>|((?:[^\s()<>]|\([^\s()<>]*\))+))'
                   r'''([ \t]+(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\([^()\n]*\)))?[ \t]*\)''')


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

    def image(m):
        dest = m.group(2) if m.group(2) is not None else m.group(3)
        # Web addresses, //... and #..., so #asset-..., stay as written (Ben, 2026-10-27).
        if re.match(r'[A-Za-z][\w+.-]*:|//|#', dest):
            return m.group(0)
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
        return m.group(1) + '#asset-' + h + (m.group(4) or '') + ')'

    out, i = [], 0
    for c in CODE.finditer(text):
        out += [IMAGE.sub(image, text[i:c.start()]), c.group(0)]
        i = c.end()
    out.append(IMAGE.sub(image, text[i:]))
    return ''.join(out), assets


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


def main(argv=None):
    parser = argparse.ArgumentParser(prog='dokufix.py', description='Markdown into a dokufix file and back out.')
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('inject', help='write Markdown into a new dokufix file, or as the document of an existing one')
    p.add_argument('markdown')
    p.add_argument('target')
    p = commands.add_parser('extract', help='print the Markdown of a dokufix file')
    p.add_argument('file')
    args = parser.parse_args(argv)
    try:
        if args.command == 'inject':
            inject(args.markdown, args.target)
        else:
            sys.stdout.buffer.write(extract(args.file).encode('utf-8'))
    except Refusal as e:
        print('dokufix.py: ' + str(e), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
