"""The script for language models, skill/dokufix/dokufix.py, without a browser.

    python3 -m unittest discover -s tests -p 'test_*.py'   (npm test runs it too)

The matrices of epic 3, stories 1 and 8, against dist/dokufix.html. A file saved in the
editor, {"gz": ...}, is made here as the page writes it; that the page writes
it so, tests/speichern.mjs shows in step 11, in a browser.
"""
import base64
import gzip
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'skill' / 'dokufix' / 'dokufix.py'
BLANK = ROOT / 'dist' / 'dokufix.html'

TRICKY = ('# Überschrift\n\n```html\n<script>alert(1)</script>\n<!-- kein Kommentar -->\n```\n\n'
          'Ein </script> im Text, $& und \\n und "Anführung", ein Backslash \\ am Ende')


def run(*args):
    return subprocess.run([sys.executable, str(SCRIPT), *map(str, args)], capture_output=True)


def block(html, block_id):
    m = re.search(r'<script type="application/json" id="' + block_id + r'">(.*?)</script>', html, re.S)
    assert m, 'no block #' + block_id
    return m.group(1)


class Script(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.tmp = Path(self.dir.name)

    def tearDown(self):
        self.dir.cleanup()

    def md(self, data, name='a.md'):
        p = self.tmp / name
        p.write_bytes(data if isinstance(data, bytes) else data.encode('utf-8'))
        return p

    def inject(self, data):
        target = self.tmp / 'x.html'
        r = run('inject', self.md(data), target)
        self.assertEqual(r.returncode, 0, r.stderr.decode())
        return target

    def extract(self, path):
        r = run('extract', path)
        self.assertEqual(r.returncode, 0, r.stderr.decode())
        return r.stdout.decode('utf-8')

    def refused(self, r, word):
        self.assertEqual(r.returncode, 1)
        self.assertEqual(r.stdout, b'')
        self.assertIn(word, r.stderr.decode())

    def test_round_trip_with_markup_umlauts_and_no_final_newline(self):
        target = self.inject(TRICKY)
        self.assertEqual(self.extract(target), TRICKY)

    def test_only_the_two_blocks_change_and_no_less_than_sign_stands_in_them(self):
        target = self.inject(TRICKY)
        html, blank = target.read_text(encoding='utf-8'), BLANK.read_text(encoding='utf-8')
        for b in ('dokufix-source', 'dokufix-history'):
            self.assertNotIn('<', block(html, b))
        strip = lambda s: re.sub(r'(id="dokufix-(?:source|history)">).*?</script>', r'\1</script>', s, flags=re.S)
        self.assertEqual(strip(html), strip(blank))
        self.assertEqual(json.loads(block(html, 'dokufix-source')), {'text': TRICKY})

    def test_each_file_gets_a_fresh_identifier(self):
        uuids = set()
        for name in ('x1.html', 'x2.html'):
            r = run('inject', self.md(TRICKY), self.tmp / name)
            self.assertEqual(r.returncode, 0, r.stderr.decode())
            history = json.loads(block((self.tmp / name).read_text(encoding='utf-8'), 'dokufix-history'))
            self.assertEqual((history['version'], history['history']), (0, []))
            uuids.add(history['uuid'])
        self.assertEqual(len(uuids), 2)

    def test_crlf_and_a_lone_cr_come_back_as_lf(self):
        target = self.inject(b'# A\r\n\r\nzwei\rdrei\r\n')
        self.assertEqual(self.extract(target), '# A\n\nzwei\ndrei\n')

    def test_a_byte_order_mark_is_dropped(self):
        self.assertEqual(self.extract(self.inject(b'\xef\xbb\xbf# Titel\n')), '# Titel\n')
        self.refused(run('inject', self.md(b'\xef\xbb\xbf'), self.tmp / 'y.html'), 'empty')

    def test_a_target_in_a_missing_folder_is_refused(self):
        self.refused(run('inject', self.md(TRICKY), self.tmp / 'fehlt' / 'x.html'), 'cannot be written')

    def test_a_damaged_gz_block_is_refused(self):
        html = self.inject(TRICKY).read_text(encoding='utf-8')
        gz = base64.b64encode(gzip.compress(TRICKY.encode('utf-8'))).decode('ascii')
        for bad in (gz[:20], base64.b64encode(b'\x1f\x8b\x08\x00' + b'\xff' * 30).decode('ascii')):
            saved = self.tmp / 'bad.html'
            saved.write_text(html.replace(block(html, 'dokufix-source'), json.dumps({'gz': bad})), encoding='utf-8')
            self.refused(run('extract', saved), 'cannot be read')

    def test_a_file_saved_in_the_editor(self):
        target = self.inject(TRICKY)
        html = target.read_text(encoding='utf-8')
        gz = base64.b64encode(gzip.compress(TRICKY.encode('utf-8'))).decode('ascii')
        saved = self.tmp / 'saved.html'
        saved.write_text(html.replace(block(html, 'dokufix-source'), json.dumps({'gz': gz})), encoding='utf-8')
        self.assertEqual(self.extract(saved), TRICKY)

    def test_empty_markdown_is_refused(self):
        for data in ('', ' \n\t\r\n'):
            r = run('inject', self.md(data), self.tmp / 'x.html')
            self.refused(r, 'empty')
            self.assertFalse((self.tmp / 'x.html').exists())

    def test_inject_into_an_existing_file_replaces_its_document_alone(self):
        # A file with an identifier, two versions and an image, as the editor saves it, with CRLF around its blocks.
        html = self.inject(TRICKY).read_text(encoding='utf-8')
        history = {'uuid': 'u-1', 'version': 2, 'history': [{'v': 1, 't': '2026-10-27T10:00:00Z', 'm': 'eins', 's': ''}, {'v': 2, 't': '2026-10-27T11:00:00Z', 'm': 'zwei', 's': ''}]}
        html = html.replace(block(html, 'dokufix-history'), json.dumps(history))
        html = html.replace(block(html, 'dokufix-assets'), json.dumps({'ab' * 32: {'m': 'image/png', 'd': 'iVBORw0K'}}))
        html = html.replace(block(html, 'dokufix-source'), json.dumps({'gz': base64.b64encode(gzip.compress(TRICKY.encode('utf-8'))).decode('ascii')}))
        target = self.tmp / 'x.html'
        target.write_bytes(html.replace('\n', '\r\n').encode('utf-8'))
        target.chmod(0o600)
        before = target.read_bytes()
        new = '# Neu\r\n\n![Bild](#asset-' + 'ab' * 32 + ')\n'
        r = run('inject', self.md(new, 'b.md'), target)
        self.assertEqual(r.returncode, 0, r.stderr.decode())
        self.assertEqual(self.extract(target), new.replace('\r\n', '\n'))
        after = target.read_bytes()
        strip = lambda b: re.sub(rb'(id="dokufix-source">).*?</script>', rb'\1</script>', b, flags=re.S)
        self.assertEqual(strip(after), strip(before))
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        self.assertEqual(sorted(p.name for p in self.tmp.iterdir()), ['a.md', 'b.md', 'x.html'])

    def test_inject_into_a_write_protected_file_is_refused(self):
        target = self.inject(TRICKY)
        target.chmod(0o444)
        self.refused(run('inject', self.md('# Neu\n', 'b.md'), target), 'write-protected')
        self.assertEqual(self.extract(target), TRICKY)

    def test_inject_into_a_file_in_a_write_protected_folder_leaves_it_alone(self):
        target, md = self.inject(TRICKY), self.md('# Neu\n', 'b.md')
        self.tmp.chmod(0o555)
        try:
            self.refused(run('inject', md, target), 'cannot be written')
        finally:
            self.tmp.chmod(0o755)
        self.assertEqual(self.extract(target), TRICKY)
        self.assertEqual(sorted(p.name for p in self.tmp.iterdir()), ['a.md', 'b.md', 'x.html'])

    def test_inject_into_what_is_no_dokufix_file_with_editor_leaves_it_alone(self):
        target = self.tmp / 'x.html'
        target.write_text('<!doctype html><title>x</title><p>vorher</p>', encoding='utf-8')
        self.refused(run('inject', self.md(TRICKY), target), 'no dokufix file with editor')
        self.assertEqual(target.read_text(encoding='utf-8'), '<!doctype html><title>x</title><p>vorher</p>')

    def test_inject_into_the_blank_is_refused(self):
        before = BLANK.read_bytes()
        self.refused(run('inject', self.md(TRICKY), BLANK), 'is the blank')
        self.assertEqual(BLANK.read_bytes(), before)

    def test_markdown_not_utf8_is_refused(self):
        self.refused(run('inject', self.md(b'# \xe4rger\n'), self.tmp / 'x.html'), 'UTF-8')
        self.assertFalse((self.tmp / 'x.html').exists())

    def test_extract_refuses_what_is_no_dokufix_file(self):
        other = self.tmp / 'other.html'
        other.write_text('<!doctype html><title>x</title><p>Hallo</p>', encoding='utf-8')
        self.refused(run('extract', other), 'no dokufix file')
        self.refused(run('extract', self.tmp / 'missing.html'), 'cannot be read')


if __name__ == '__main__':
    unittest.main()
