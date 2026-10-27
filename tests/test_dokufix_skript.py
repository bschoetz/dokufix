"""The script for language models, skill/dokufix/dokufix.py, without a browser.

    python3 -m unittest discover -s tests -p 'test_*.py'   (npm test runs it too)

The matrices of epic 3, stories 1, 8 and 9, against dist/dokufix.html. A file saved in the
editor, {"gz": ...}, is made here as the page writes it; that the page writes
it so, tests/speichern.mjs shows in step 11, in a browser.
"""
import base64
import gzip
import hashlib
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


# The first bytes the script tells the types by; the rest need not be an image.
IMAGES = {'logo.png': b'\x89PNG\r\n\x1a\n-png', 'foto.jpg': b'\xff\xd8\xff-jpeg', 'alt.gif': b'GIF87a-gif',
          'neu.gif': b'GIF89a-gif', 'w.webp': b'RIFF\x00\x00\x00\x00WEBP-webp'}
TYPES = {'logo.png': 'image/png', 'foto.jpg': 'image/jpeg', 'alt.gif': 'image/gif', 'neu.gif': 'image/gif', 'w.webp': 'image/webp'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def assets_of(path):
    return json.loads(block(path.read_text(encoding='utf-8'), 'dokufix-assets'))


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

    def test_images_are_embedded_with_their_bytes_and_type(self):
        (self.tmp / 'bilder').mkdir()
        for name, data in IMAGES.items():
            (self.tmp / 'bilder' / name).write_bytes(data)
        (self.tmp / 'Mein Bild.png').write_bytes(b'\x89PNG\r\n\x1a\n-leerzeichen')
        (self.tmp / 'bilder' / 'foto(1).png').write_bytes(IMAGES['logo.png'])
        md = ('# Bilder\n\n![Logo](bilder/logo.png "Titel") und ![Noch einmal]( ./bilder/lo%67o.png )\n\n'
              '![J](bilder/foto.jpg) ![G](bilder/alt.gif) ![G2](bilder/neu.gif \'t\') ![W](bilder/w.webp)\n\n'
              '![Bild](<Mein Bild.png>)\n\n'
              'Im Code: `![a](fehlt.png)` und ``![b](`fehlt.png`)``\n\n'
              '1. Schritt\n\n    ```md\n    ![c](fehlt.png)\n    ```\n\n'
              '~~~\n![d](fehlt.png)\n~~~\n\n'
              '<!-- ![e](fehlt.png) --> Ein \\` und ```x``` im Satz\n\n'
              '![Web](https://example.org/x.png) ![Da](#asset-' + 'ab' * 32 + ') \\![kein Bild](fehlt.png)\n\n'
              '![a [b] c](bilder/foto(1).png "x \\"y\\"")\n')
        target = self.inject(md)
        want = (md.replace('bilder/logo.png "Titel"', '#asset-%s "Titel"' % sha(IMAGES['logo.png']))
                  .replace('( ./bilder/lo%67o.png )', '(#asset-%s)' % sha(IMAGES['logo.png']))
                  .replace('<Mein Bild.png>', '#asset-' + sha(b'\x89PNG\r\n\x1a\n-leerzeichen'))
                  .replace('bilder/foto(1).png', '#asset-' + sha(IMAGES['logo.png'])))
        for name in ['foto.jpg', 'alt.gif', 'neu.gif', 'w.webp']:
            want = want.replace('bilder/' + name, '#asset-' + sha(IMAGES[name]))
        self.assertEqual(self.extract(target), want)
        assets, blank = assets_of(target), json.loads(block(BLANK.read_text(encoding='utf-8'), 'dokufix-assets'))
        for name, data in IMAGES.items():
            self.assertEqual(assets[sha(data)], {'m': TYPES[name], 'd': base64.b64encode(data).decode('ascii')})
        self.assertEqual(len(assets), len(blank) + len(IMAGES) + 1)
        self.assertTrue(all(assets[h] == a for h, a in blank.items()))

    def test_reference_style_images_and_img_tags_are_embedded(self):
        (self.tmp / 'bilder').mkdir()
        for name, data in IMAGES.items():
            (self.tmp / 'bilder' / name).write_bytes(data)
        md = ('# Referenzen\n\n![Logo][logo], ![Foto][] und ![w] und ein Link [Spezifikation][spec]\n\n'
              '<img src="bilder/alt.gif" width="200" alt="Alt"> <IMG alt=\'n\' SRC = \'bilder/neu.gif\'> <img src="https://x.org/a.png">\n\n'
              '`<img src="fehlt.png">` und ` ![c][code] `\n\n'
              '[LOGO]: bilder/logo.png "Titel"\n'
              '[foto]: <bilder/foto.jpg>\n'
              '[W]: bilder/w.webp\n'
              '[spec]: docs/spec.md\n'
              '[code]: fehlt.png\n')
        target = self.inject(md)
        want = (md.replace('bilder/logo.png "Titel"', '#asset-%s "Titel"' % sha(IMAGES['logo.png']))
                  .replace('<bilder/foto.jpg>', '#asset-' + sha(IMAGES['foto.jpg']))
                  .replace('[W]: bilder/w.webp', '[W]: #asset-' + sha(IMAGES['w.webp']))
                  .replace('src="bilder/alt.gif"', 'src="#asset-%s"' % sha(IMAGES['alt.gif']))
                  .replace("SRC = 'bilder/neu.gif'", 'src="#asset-%s"' % sha(IMAGES['neu.gif'])))
        self.assertEqual(self.extract(target), want)
        assets = assets_of(target)
        for name, data in IMAGES.items():
            self.assertEqual(assets[sha(data)], {'m': TYPES[name], 'd': base64.b64encode(data).decode('ascii')})

    def test_inject_into_an_existing_file_adds_a_new_image_to_its_own(self):
        (self.tmp / 'logo.png').write_bytes(IMAGES['logo.png'])
        target = self.inject(TRICKY)
        before = assets_of(target)
        r = run('inject', self.md('# Neu\n\n![Logo](logo.png)\n', 'b.md'), target)
        self.assertEqual(r.returncode, 0, r.stderr.decode())
        after = assets_of(target)
        self.assertEqual(after, {**before, sha(IMAGES['logo.png']): {'m': 'image/png', 'd': base64.b64encode(IMAGES['logo.png']).decode('ascii')}})
        # The image once more: the file holds it, so its block stays byte for byte.
        held = block(target.read_text(encoding='utf-8'), 'dokufix-assets')
        r = run('inject', self.md('# Wieder\n\n![Logo](logo.png)\n', 'c.md'), target)
        self.assertEqual(r.returncode, 0, r.stderr.decode())
        self.assertEqual(block(target.read_text(encoding='utf-8'), 'dokufix-assets'), held)

    def test_an_image_missing_of_another_type_or_too_large_is_refused(self):
        (self.tmp / 'ok.png').write_bytes(IMAGES['logo.png'])
        (self.tmp / 'bild.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg"/>', encoding='utf-8')
        with open(self.tmp / 'gross.png', 'wb') as f:
            f.write(IMAGES['logo.png'])
            f.truncate(5 * 1024 * 1024 + 1)
        (self.tmp / 'notiz.txt').write_text('kein Bild', encoding='utf-8')
        existing = self.tmp / 'da.html'
        run('inject', self.md(TRICKY, 'da.md'), existing)
        before = existing.read_bytes()
        for ref, word in [('fehlt.png', 'cannot be read'), ('bild.svg', 'no PNG, JPEG, GIF or WebP'),
                          ('notiz.txt', 'no PNG, JPEG, GIF or WebP'), ('gross.png', 'larger than 5 MB')]:
            for target in [self.tmp / 'x.html', existing]:
                with self.subTest(ref=ref, target=target.name):
                    r = run('inject', self.md('# T\n\n![Ok](ok.png) ![X](%s)\n' % ref), target)
                    self.refused(r, word)
                    self.assertIn(ref, r.stderr.decode())
        self.assertFalse((self.tmp / 'x.html').exists())
        self.assertEqual(existing.read_bytes(), before)

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
