#!/usr/bin/env python3
"""dokufix for language models: Markdown into a dokufix file and back out.

    python3 dokufix.py inject <markdown> <target>   writes a new dokufix file
    python3 dokufix.py extract <file>               prints its Markdown

Python 3 and its standard library alone. No command prints HTML. See
src/README.md, "The script for language models".
"""
import argparse
import base64
import gzip
import json
import re
import sys
import uuid
import zlib
from pathlib import Path

# shortcut: the blank is the repo's built file; story 12 puts it beside this script.
BLANK = Path(__file__).resolve().parents[2] / 'dist' / 'dokufix.html'


class Refusal(Exception):
    pass


def block_pattern(block_id):
    # A data block holds every < as <, so its first </script> is its end.
    return re.compile(r'(<script type="application/json" id="' + block_id + r'">)(.*?)(</script>)', re.S)


def encode_block(obj):
    # As encodeJsonForScript (src/app/downloads/with-editor.js) writes a block.
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')


def replace_block(html, block_id, obj):
    found = block_pattern(block_id).findall(html)
    if len(found) != 1:
        raise Refusal('the blank has %d blocks #%s, not one: %s' % (len(found), block_id, BLANK))
    # A function as replacement, so backslashes in the JSON stay as they are.
    return block_pattern(block_id).sub(lambda m: m.group(1) + encode_block(obj) + m.group(3), html, count=1)


def inject(markdown_path, target_path):
    target = Path(target_path)
    if target.exists():
        raise Refusal('%s exists; inject into an existing file is not built yet (epic 3, story 8)' % target)
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
    try:
        html = BLANK.read_text(encoding='utf-8')
    except OSError as e:
        raise Refusal('the blank cannot be read: %s' % e)
    html = replace_block(html, 'dokufix-source', {'text': text})
    html = replace_block(html, 'dokufix-history', {'uuid': str(uuid.uuid4()), 'version': 0, 'history': []})
    try:
        with open(target, 'x', encoding='utf-8', newline='') as f:
            f.write(html)
    except FileExistsError:
        raise Refusal('%s exists; inject into an existing file is not built yet (epic 3, story 8)' % target)
    except OSError as e:
        raise Refusal('%s cannot be written: %s' % (target, e))


def extract(file_path):
    try:
        html = Path(file_path).read_text(encoding='utf-8')
    except (OSError, UnicodeDecodeError) as e:
        raise Refusal('%s cannot be read: %s' % (file_path, e))
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
    p = commands.add_parser('inject', help='write Markdown into a new dokufix file')
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
