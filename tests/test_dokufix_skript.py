"""The script for language models, skill/dokufix/dokufix.py, without a browser.

    python3 -m unittest discover -s tests -p 'test_*.py'   (npm test runs it too)

The matrices of epic 3, stories 1, 8, 9, 4 and 5, against dist/dokufix.html; the reader of parts against
every case of tests/fixtures/parts/, as tests/parts-cases.test.mjs runs the product's. A file saved in the
editor, {"gz": ...}, is made here as the page writes it; that the page writes
it so, tests/speichern.mjs shows in step 11, in a browser.
"""
import base64
import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'skill' / 'dokufix' / 'dokufix.py'
BLANK = ROOT / 'dist' / 'dokufix.html'
CASES = ROOT / 'tests' / 'fixtures' / 'parts'

sys.path.insert(0, str(SCRIPT.parent))
# No __pycache__ in the folder story 3.12 ships.
sys.dont_write_bytecode = True
from dokufix import covers, matches, read_parts  # noqa: E402

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


def case(name):
    # Bytes, not text mode: pt19's CRLF stays.
    return (CASES / name).read_bytes().decode('utf-8')


# Test commits without the machine's git config: commit.gpgsign or core.hooksPath would make them fail.
GIT_ENV = {**os.environ, 'GIT_CONFIG_GLOBAL': os.devnull, 'GIT_CONFIG_NOSYSTEM': '1'}


def run(*args, env=None):
    return subprocess.run([sys.executable, str(SCRIPT), *map(str, args)], capture_output=True,
                          env=env and {**os.environ, **env})


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
        target = self.tmp / 'x.dokufix.html'
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
        for name in ('x1.dokufix.html', 'x2.dokufix.html'):
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
        self.refused(run('inject', self.md(b'\xef\xbb\xbf'), self.tmp / 'y.dokufix.html'), 'empty')

    def test_a_target_in_a_missing_folder_is_refused(self):
        self.refused(run('inject', self.md(TRICKY), self.tmp / 'fehlt' / 'x.dokufix.html'), 'cannot be written')

    def test_a_damaged_gz_block_is_refused(self):
        html = self.inject(TRICKY).read_text(encoding='utf-8')
        gz = base64.b64encode(gzip.compress(TRICKY.encode('utf-8'))).decode('ascii')
        for bad in (gz[:20], base64.b64encode(b'\x1f\x8b\x08\x00' + b'\xff' * 30).decode('ascii')):
            saved = self.tmp / 'bad.html'
            saved.write_text(html.replace(block(html, 'dokufix-source'), json.dumps({'gz': bad})), encoding='utf-8')
            self.refused(run('extract', saved), 'cannot be read')

    def test_a_gzip_bomb_is_refused_where_the_script_unpacks(self):
        # 60 MB of zeros pack to about 60 KB; the script unpacks at most 50 MB (UNPACKED_MAX_BYTES).
        bomb = base64.b64encode(gzip.compress(b'\0' * (60 * 1024 * 1024))).decode('ascii')
        html = self.inject(TRICKY).read_text(encoding='utf-8')
        editor = self.tmp / 'bombe-editor.html'
        editor.write_text(html.replace(block(html, 'dokufix-source'), json.dumps({'gz': bomb})), encoding='utf-8')
        self.refused(run('extract', editor), 'more than 50 MB')
        export = self.export(TRICKY, 'nur-lesen')
        export.write_text(re.sub(r'(<template id="dokufix-markdown"[^>]*>).*?(</template>)', lambda m: m.group(1) + json.dumps({'gz': bomb}) + m.group(2),
                                 export.read_text(encoding='utf-8'), flags=re.S), encoding='utf-8')
        self.refused(run('extract', export), 'more than 50 MB')
        data = IMAGES['logo.png']
        kompakt = self.export('# Bild\n', 'kompakt', data)
        kompakt.write_text(re.sub(r'(<script type="text/plain" id="p">).*?(</script>)', lambda m: m.group(1) + bomb + m.group(2),
                                  kompakt.read_text(encoding='utf-8'), flags=re.S), encoding='utf-8')
        a = self.md('![Logo](#asset-%s)\n' % sha(data), 'bombe.md')
        self.refused(run('inject', a, self.tmp / 'neu-bombe.dokufix.html', '--images-from', kompakt), 'more than 50 MB')
        self.assertFalse((self.tmp / 'neu-bombe.dokufix.html').exists())

    def test_a_file_saved_in_the_editor(self):
        target = self.inject(TRICKY)
        html = target.read_text(encoding='utf-8')
        gz = base64.b64encode(gzip.compress(TRICKY.encode('utf-8'))).decode('ascii')
        saved = self.tmp / 'saved.html'
        saved.write_text(html.replace(block(html, 'dokufix-source'), json.dumps({'gz': gz})), encoding='utf-8')
        self.assertEqual(self.extract(saved), TRICKY)

    def test_empty_markdown_is_refused(self):
        for data in ('', ' \n\t\r\n'):
            r = run('inject', self.md(data), self.tmp / 'x.dokufix.html')
            self.refused(r, 'empty')
            self.assertFalse((self.tmp / 'x.dokufix.html').exists())

    def test_inject_into_an_existing_file_replaces_its_document_alone(self):
        # A file with an identifier, two versions and an image, as the editor saves it, with CRLF around its blocks.
        html = self.inject(TRICKY).read_text(encoding='utf-8')
        history = {'uuid': 'u-1', 'version': 2, 'history': [{'v': 1, 't': '2026-10-27T10:00:00Z', 'm': 'eins', 's': ''}, {'v': 2, 't': '2026-10-27T11:00:00Z', 'm': 'zwei', 's': ''}]}
        html = html.replace(block(html, 'dokufix-history'), json.dumps(history))
        html = html.replace(block(html, 'dokufix-assets'), json.dumps({'ab' * 32: {'m': 'image/png', 'd': 'iVBORw0K'}}))
        html = html.replace(block(html, 'dokufix-source'), json.dumps({'gz': base64.b64encode(gzip.compress(TRICKY.encode('utf-8'))).decode('ascii')}))
        target = self.tmp / 'x.dokufix.html'
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
        self.assertEqual(sorted(p.name for p in self.tmp.iterdir()), ['a.md', 'b.md', 'x.dokufix.html'])

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
        self.assertEqual(sorted(p.name for p in self.tmp.iterdir()), ['a.md', 'b.md', 'x.dokufix.html'])

    def test_inject_into_what_is_no_dokufix_file_with_editor_leaves_it_alone(self):
        target = self.tmp / 'x.dokufix.html'
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
        existing = self.tmp / 'da.dokufix.html'
        run('inject', self.md(TRICKY, 'da.md'), existing)
        before = existing.read_bytes()
        for ref, word in [('fehlt.png', 'cannot be read'), ('bild.svg', 'no PNG, JPEG, GIF or WebP'),
                          ('notiz.txt', 'no PNG, JPEG, GIF or WebP'), ('gross.png', 'larger than 5 MB')]:
            for target in [self.tmp / 'x.dokufix.html', existing]:
                with self.subTest(ref=ref, target=target.name):
                    r = run('inject', self.md('# T\n\n![Ok](ok.png) ![X](%s)\n' % ref), target)
                    self.refused(r, word)
                    self.assertIn(ref, r.stderr.decode())
        self.assertFalse((self.tmp / 'x.dokufix.html').exists())
        self.assertEqual(existing.read_bytes(), before)

    def test_markdown_not_utf8_is_refused(self):
        self.refused(run('inject', self.md(b'# \xe4rger\n'), self.tmp / 'x.dokufix.html'), 'UTF-8')
        self.assertFalse((self.tmp / 'x.dokufix.html').exists())

    def part(self, target, wanted):
        return self.extract_args(target, '--part', wanted)

    def extract_args(self, target, *args):
        r = run('extract', target, *args)
        self.assertEqual(r.returncode, 0, r.stderr.decode())
        return r.stdout.decode('utf-8')

    def overview(self, target):
        r = run('overview', target)
        self.assertEqual(r.returncode, 0, r.stderr.decode())
        self.assertNotIn(b'\\u00', r.stdout)
        return json.loads(r.stdout.decode('utf-8'))

    def test_a_part_by_number_or_by_name_and_the_parts_give_the_document(self):
        for name in ('pt03-two-parts.md', 'pt21-same-name.md'):
            doc = case(name)
            target = self.inject(doc)
            self.assertEqual(self.part(target, '1') + self.part(target, '2'), doc)
        target = self.inject(case('pt03-two-parts.md'))
        second = case('pt03-two-parts.md').split('\n---part\n')[1]
        self.assertEqual(self.part(target, '2'), '---part\n' + second)
        self.assertEqual(self.part(target, 'Rückgabe'), '---part\n' + second)
        self.assertEqual(self.part(target, '01'), self.part(target, 'Ausleihe'))
        self.assertEqual(self.extract_args(target), case('pt03-two-parts.md'))
        one = self.inject(case('pt01-plain.md'))
        self.assertEqual(self.part(one, '1'), case('pt01-plain.md'))

    def test_a_part_shared_missing_or_out_of_range_is_refused(self):
        r = run('extract', self.inject(case('pt21-same-name.md')), '--part', 'Ablauf')
        self.refused(r, 'parts 1 (line 1) and 2 (line 6) are both named Ablauf')
        target = self.inject(case('pt03-two-parts.md'))
        for wanted in ('3', '0', 'Fehlt', '-1', '２', 'rückgabe'):
            with self.subTest(wanted=wanted):
                self.refused(run('extract', target, '--part', wanted), 'it has 2 parts')

    def test_overview_lists_headers_and_headings_and_no_text(self):
        got = self.overview(self.inject(case('pt03-two-parts.md')))
        self.assertEqual(got, {'parts': [
            {'number': 1, 'line': 1, 'name': 'Ausleihe', 'header': {'title': 'Ausleihe', 'kind': 'reference'}, 'problem': None,
             'headings': [{'level': 1, 'text': 'Ausleihe', 'line': 5}]},
            {'number': 2, 'line': 9, 'name': 'Rückgabe', 'header': {'title': 'Rückgabe', 'kind': 'how-to', 'functions': ['Rückgabe am Automaten'],
             'sources': ['src/rueckgabe.py', 'src/automat/'], 'state': '3464d1c'}, 'problem': None,
             'headings': [{'level': 2, 'text': 'Rückgabe am Automaten', 'line': 20}]}]})

    def test_overview_of_headers_missing_unclosed_unreadable_and_a_heading_in_code(self):
        for name, problem in (('pt10-missing.md', 'header-missing'), ('pt11-unclosed.md', 'header-unclosed'),
                              ('pt12-unreadable.md', 'header-unreadable')):
            with self.subTest(case=name):
                parts = self.overview(self.inject(case(name)))['parts']
                self.assertEqual([(p['header'], p['problem']) for p in parts], [(None, None)] + [(None, problem)] * (len(parts) - 1))
        parts = self.overview(self.inject(case('pt11-unclosed.md')))['parts']
        self.assertEqual(parts[1]['headings'], [{'level': 2, 'text': 'Rückgabe', 'line': 8}])
        parts = self.overview(self.inject(case('pt14-names.md')))['parts']
        self.assertEqual([p['headings'] for p in parts], [[{'level': 2, 'text': 'Rückgabe', 'line': 4}], [], [], [{'level': 2, 'text': 'Ablauf', 'line': 22}]])
        self.assertEqual(parts[1]['name'], None)

    def test_overview_of_a_json_header_with_a_huge_number_or_a_lone_surrogate_is_json(self):
        r = run('overview', self.inject('---json\n{"title": "T", "n": 1e999, "s": "\\ud800x"}\n---\n'))
        self.assertEqual(r.returncode, 0, r.stderr.decode())
        self.assertIn(b'"s": "\\ud800x"', r.stdout)
        header = json.loads(r.stdout.decode('utf-8'))['parts'][0]['header']
        self.assertEqual((header['n'], header['s']), (None, '\ud800x'))

    def test_overview_and_a_part_of_a_file_saved_in_the_editor(self):
        doc = case('pt03-two-parts.md')
        html = self.inject(doc).read_text(encoding='utf-8')
        saved = self.tmp / 'saved.html'
        gz = base64.b64encode(gzip.compress(doc.encode('utf-8'))).decode('ascii')
        saved.write_text(html.replace(block(html, 'dokufix-source'), json.dumps({'gz': gz})), encoding='utf-8')
        self.assertEqual(self.part(saved, 'Ausleihe'), doc.split('---part\n')[0])
        self.assertEqual(self.overview(saved), self.overview(self.tmp / 'x.dokufix.html'))

    def export(self, doc, variant, images=b''):
        # A read-only export as the page writes it (story 3.11): no block #dokufix-source, the Markdown in a template
        # in <head>, the images as data: URLs, in kompakt inside the packed body #p. tests/speichern.mjs shows the
        # page writes it so, in a browser.
        html = self.inject(doc).read_text(encoding='utf-8')
        # No script of the editor: its code holds the template of kompakt's #p. The build keeps "</script" out of each.
        html = re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.S)
        gz = base64.b64encode(gzip.compress(doc.encode('utf-8'))).decode('ascii')
        html = html.replace('<head>', '<head><template id="dokufix-markdown" data-variant="%s">%s</template>' % (variant, json.dumps({'gz': gz})), 1)
        img = '<p><img src="data:image/png;base64,%s" alt="x"></p>' % base64.b64encode(images).decode('ascii') if images else ''
        if variant == 'kompakt' and img:
            img = '<script type="text/plain" id="p">%s</script>' % base64.b64encode(gzip.compress(img.encode('utf-8'))).decode('ascii')
        export = self.tmp / ('e-' + variant + '.html')
        export.write_text(html.replace('</body>', img + '</body>', 1), encoding='utf-8')
        return export

    def test_extract_reads_every_read_only_export_and_part_and_overview_only_on_request(self):
        doc = case('pt03-two-parts.md')
        editor = self.inject(doc)
        part2 = self.part(editor, '2')
        for variant in ('nur-lesen', 'schlank', 'kompakt'):
            with self.subTest(variant=variant):
                export = self.export(doc, variant)
                self.assertEqual(self.extract(export), doc)
                self.refused(run('extract', export, '--part', '2'), '--read-only')
                self.refused(run('overview', export), '--read-only')
                self.assertEqual(self.extract_args(export, '--part', '2', '--read-only'), part2)
                r = run('overview', export, '--read-only')
                self.assertEqual(r.returncode, 0, r.stderr.decode())
                self.assertEqual(json.loads(r.stdout.decode('utf-8')), self.overview(self.inject(doc)))

    def test_inject_into_a_read_only_export_is_refused_by_its_variant(self):
        for variant in ('nur-lesen', 'schlank', 'kompakt'):
            with self.subTest(variant=variant):
                export = self.export(TRICKY, variant)
                before = export.read_bytes()
                self.refused(run('inject', self.md('# Neu\n'), export), 'read-only export (%s)' % variant)
                self.assertEqual(export.read_bytes(), before)

    def test_an_export_without_its_markdown_is_refused(self):
        # An export from before story 3.11: the document as HTML alone.
        export = self.export(TRICKY, 'nur-lesen')
        export.write_text(re.sub(r'<template id="dokufix-markdown".*?</template>', '', export.read_text(encoding='utf-8'), flags=re.S), encoding='utf-8')
        for args in (('extract', export), ('overview', export, '--read-only'), ('extract', export, '--part', '1')):
            self.refused(run(*args), 'no Markdown')

    def test_a_carrier_damaged_or_naming_no_export_is_refused(self):
        export = self.export(TRICKY, 'schlank')
        html = export.read_text(encoding='utf-8')
        export.write_text(re.sub(r'"gz": "[^"]*"', '"gz": "kaputt"', html), encoding='utf-8')
        self.refused(run('extract', export), 'cannot be read')
        export.write_text(html.replace('data-variant="schlank"', 'data-variant="editor"'), encoding='utf-8')
        self.refused(run('extract', export), 'no Markdown')

    def test_images_from_an_export_go_into_a_new_or_an_existing_file_with_their_bytes(self):
        data = IMAGES['logo.png']
        md = '# Bild\n\n![Logo](#asset-%s)\n' % sha(data)
        for variant in ('nur-lesen', 'schlank', 'kompakt'):
            with self.subTest(variant=variant):
                export = self.export(md, variant, data)
                a = self.md(self.extract(export), 'aus-export.md')
                existing = self.inject(TRICKY)
                for target in (self.tmp / ('neu-' + variant + '.dokufix.html'), existing):
                    r = run('inject', a, target, '--images-from', export)
                    self.assertEqual(r.returncode, 0, r.stderr.decode())
                    self.assertEqual(self.extract(target), md)
                    self.assertEqual(assets_of(target)[sha(data)], {'m': 'image/png', 'd': base64.b64encode(data).decode('ascii')})

    def test_images_from_keep_what_the_target_holds_and_take_an_image_file_beside_the_markdown(self):
        (self.tmp / 'logo.png').write_bytes(IMAGES['logo.png'])
        (self.tmp / 'other.png').write_bytes(b'\x89PNG\r\n\x1a\n-other')
        existing = self.inject('# Bild\n\n![Logo](logo.png)\n')
        before = assets_of(existing)
        export = self.export('# Leer\n', 'nur-lesen')
        md = self.md('![a](#asset-%s) ![b](other.png) und `#asset-%s` im Code\n' % (sha(IMAGES['logo.png']), 'ef' * 32), 'b.md')
        r = run('inject', md, existing, '--images-from', export)
        self.assertEqual(r.returncode, 0, r.stderr.decode())
        other = b'\x89PNG\r\n\x1a\n-other'
        self.assertEqual(assets_of(existing), {**before, sha(other): {'m': 'image/png', 'd': base64.b64encode(other).decode('ascii')}})

    def test_images_from_what_is_no_export_or_a_kompakt_without_its_packed_body_are_refused(self):
        md = self.md('![X](#asset-%s)\n' % sha(IMAGES['logo.png']), 'b.md')
        other = self.tmp / 'other.html'
        other.write_text('<!doctype html><title>x</title><p>Hallo</p>', encoding='utf-8')
        self.refused(run('inject', md, self.tmp / 'neu.dokufix.html', '--images-from', other), 'no read-only dokufix export')
        self.refused(run('inject', md, self.tmp / 'neu.dokufix.html', '--images-from', self.export('# K\n', 'kompakt')), 'kompakt without its packed body')
        self.assertFalse((self.tmp / 'neu.dokufix.html').exists())

    def test_images_from_an_editor_file_or_a_hash_found_nowhere_are_refused(self):
        (self.tmp / 'logo.png').write_bytes(IMAGES['logo.png'])
        editor = self.inject('# Bild\n\n![Logo](logo.png)\n')
        a = self.md(self.extract(editor), 'aus-editor.md')
        self.refused(run('inject', a, self.tmp / 'neu.dokufix.html', '--images-from', editor), 'it has its images itself')
        missing = 'cd' * 32
        export = self.export('# Bild\n', 'nur-lesen', IMAGES['foto.jpg'])
        existing = self.inject(TRICKY)
        before = existing.read_bytes()
        for target in (self.tmp / 'neu.dokufix.html', existing):
            r = run('inject', self.md('![X](#asset-%s)\n' % missing, 'b.md'), target, '--images-from', export)
            self.refused(r, missing)
        self.assertFalse((self.tmp / 'neu.dokufix.html').exists())
        self.assertEqual(existing.read_bytes(), before)

    def test_extract_refuses_what_is_no_dokufix_file(self):
        other = self.tmp / 'other.html'
        other.write_text('<!doctype html><title>x</title><p>Hallo</p>', encoding='utf-8')
        self.refused(run('extract', other), 'no dokufix file')
        self.refused(run('extract', self.tmp / 'missing.html'), 'cannot be read')


SOURCES = '''---
title: Eins
sources: src/x.py
---
# Eins

---part
title: Zwei
kind: reference
functions: Ausleihe
sources:
  - src/
  - ./src/x.py
---

---part
title: Drei
kind: reference
sources:
  - src/xy.py
---
'''


class Project(unittest.TestCase):
    """list and query across a project (story 3.5)."""
    setUp, tearDown, md, inject, export, refused = Script.setUp, Script.tearDown, Script.md, Script.inject, Script.export, Script.refused

    @property
    def root(self):
        return self.tmp / 'projekt'

    def put(self, rel, doc):
        target = self.root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        r = run('inject', self.md(doc), target)
        self.assertEqual(r.returncode, 0, r.stderr.decode())
        return target

    def ok(self, *args, env=None):
        r = run(*args, env=env)
        self.assertEqual(r.returncode, 0, r.stderr.decode())
        self.assertNotIn(b'<', r.stdout)
        return json.loads(r.stdout.decode('utf-8'))

    def listed(self, root=None, env=None):
        return {f['path']: f['variant'] for f in self.ok('list', root or self.root, env=env)['files']}

    def found(self, *args):
        return [(p['file'], p['number']) for p in self.ok('query', self.root, *args)['parts']]

    def test_list_finds_dokufix_files_by_their_ending_and_by_their_content(self):
        self.put('a.dokufix.html', SOURCES)
        self.put('b.dokufix.html', '# B\n').rename(self.root / 'b.html')
        (self.root / 'sub').mkdir()
        shutil.move(self.export(SOURCES, 'nur-lesen'), self.root / 'sub' / 'a-export.htm')
        (self.root / 'andere.html').write_text('<!doctype html><p>Hallo</p>', encoding='utf-8')
        (self.root / 'sub' / 'zweite.HTML').write_text('<!doctype html><p>auch</p>', encoding='utf-8')
        self.assertEqual(self.listed(), {'a.dokufix.html': 'editor', 'b.html': 'editor', 'sub/a-export.htm': 'nur-lesen'})

    def test_a_damaged_named_file_shows_and_what_cannot_be_read_does_not(self):
        self.root.mkdir()
        (self.root / 'kaputt.dokufix.html').write_text('<!doctype html><p>nichts</p>', encoding='utf-8')
        (self.root / 'latin.dokufix.html').write_bytes(b'<p>\xe4</p>')
        (self.root / 'ordner.dokufix.html').mkdir()
        self.assertEqual(self.ok('list', self.root), {'files': [{'path': 'kaputt.dokufix.html', 'variant': None, 'parts': None}]})

    def test_list_gives_per_part_its_name_kind_and_state(self):
        self.put('a.dokufix.html', case('pt03-two-parts.md'))
        self.put('leer.dokufix.html', '---\nkind:\nstate:\n---\n# Ohne\n')
        files = self.ok('list', self.root)['files']
        self.assertEqual(files[0]['parts'], [{'number': 1, 'name': 'Ausleihe', 'kind': 'reference', 'state': None},
                                             {'number': 2, 'name': 'Rückgabe', 'kind': 'how-to', 'state': '3464d1c'}])
        self.assertEqual(files[1]['parts'], [{'number': 1, 'name': 'Ohne', 'kind': None, 'state': None}])

    def test_query_by_source_covers_and_gives_each_part_once_with_its_header(self):
        self.put('a.dokufix.html', SOURCES)
        r = self.ok('query', self.root, '--source', 'src/x.py')
        self.assertEqual([(p['file'], p['number'], p['line'], p['name']) for p in r['parts']],
                         [('a.dokufix.html', 1, 1, 'Eins'), ('a.dokufix.html', 2, 7, 'Zwei')])
        self.assertEqual(r['parts'][1]['header']['sources'], ['src/', './src/x.py'])
        self.assertEqual(self.found('--source', './src/xy.py/'), [('a.dokufix.html', 2), ('a.dokufix.html', 3)])
        self.assertEqual(self.found('--source', 'lib/x.py'), [])

    def test_query_by_kind_and_function_and_all_criteria_at_once(self):
        self.put('a.dokufix.html', SOURCES)
        self.assertEqual(self.found('--kind', 'reference'), [('a.dokufix.html', 2), ('a.dokufix.html', 3)])
        self.assertEqual(self.found('--function', 'Ausleihe'), [('a.dokufix.html', 2)])
        self.assertEqual(self.found('--function', 'Ausl'), [])
        self.assertEqual(self.found('--kind', 'reference', '--source', 'src/x.py'), [('a.dokufix.html', 2)])

    def test_query_reads_read_only_exports_only_on_request(self):
        self.put('a.dokufix.html', SOURCES)
        shutil.move(self.export(SOURCES, 'kompakt'), self.root / 'a-kompakt.dokufix.html')
        self.assertEqual(self.found('--source', 'src/x.py'), [('a.dokufix.html', 1), ('a.dokufix.html', 2)])
        self.assertEqual(self.found('--source', 'src/x.py', '--read-only'),
                         [('a-kompakt.dokufix.html', 1), ('a-kompakt.dokufix.html', 2), ('a.dokufix.html', 1), ('a.dokufix.html', 2)])

    def test_query_refuses_a_path_not_from_the_root_and_a_query_without_criterion(self):
        self.put('a.dokufix.html', SOURCES)
        for path in ('/home/x/src/x.py', 'C:/src/x.py', '../src/x.py', 'src/../x.py', 'src\\x.py'):
            with self.subTest(path=path):
                self.refused(run('query', self.root, '--source', path), 'from the root of the repository')
        r = run('query', self.root)
        self.refused(r, '--kind')
        self.assertIn('--function', r.stderr.decode())
        self.assertIn('--source', r.stderr.decode())

    @unittest.skipUnless(shutil.which('git'), 'no git')
    def test_in_git_its_files_tracked_or_new_and_not_ignored_and_neither_output_nor_nested_repositories(self):
        git = lambda where, *a: subprocess.run(['git', '-C', where, *a], check=True, capture_output=True, env=GIT_ENV)
        self.root.mkdir()
        git(self.root, 'init', '-q')
        (self.root / '.gitignore').write_text('out/\n', encoding='utf-8')
        for rel in ('a.dokufix.html', 'weg.dokufix.html', 'sub/s.dokufix.html'):
            self.put(rel, '# T\n')
        git(self.root, 'add', 'a.dokufix.html', 'weg.dokufix.html', 'sub/s.dokufix.html')
        # Tracked, though ignored: git lists it.
        self.put('out/getrackt.dokufix.html', '# G\n')
        git(self.root, 'add', '-f', 'out/getrackt.dokufix.html')
        git(self.root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'eins')
        (self.root / 'weg.dokufix.html').unlink()
        self.put('neu.dokufix.html', '# N\n')
        self.put('out/o.dokufix.html', '# O\n')
        git(self.root, 'init', '-q', 'nested')
        self.put('nested/n.dokufix.html', '# N\n')
        want = {'a.dokufix.html': 'editor', 'neu.dokufix.html': 'editor', 'out/getrackt.dokufix.html': 'editor', 'sub/s.dokufix.html': 'editor'}
        self.assertEqual(self.listed(), want)
        self.assertEqual(self.listed(self.root / 'sub'), {'s.dokufix.html': 'editor'})
        # As a Git hook runs it: GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE of another repository do not decide.
        other = self.tmp / 'anders'
        other.mkdir()
        git(other, 'init', '-q')
        (other / '.git' / 'info' / 'exclude').write_text('a.dokufix.html\n', encoding='utf-8')
        for env in ({'GIT_DIR': str(other / '.git')}, {'GIT_INDEX_FILE': str(other / '.git' / 'index')}):
            self.assertEqual(self.listed(env=env), want)
        self.assertEqual(self.listed(env={'GIT_DIR': str(other / '.git'), 'GIT_WORK_TREE': str(other),
                                          'GIT_INDEX_FILE': str(other / '.git' / 'index')}), want)

    def test_without_git_the_folder_is_walked_without_dot_folders_and_node_modules(self):
        self.put('a.dokufix.html', '# A\n')
        self.put('out/o.dokufix.html', '# O\n')
        self.put('.versteckt/v.dokufix.html', '# V\n')
        self.put('node_modules/m.dokufix.html', '# M\n')
        # So that git finds no repository, also when the temp folder lies inside one.
        self.assertEqual(self.listed(env={'GIT_CEILING_DIRECTORIES': str(self.tmp.parent)}),
                         {'a.dokufix.html': 'editor', 'out/o.dokufix.html': 'editor'})

    def test_a_root_that_is_no_folder_is_refused(self):
        self.put('a.dokufix.html', '# A\n')
        self.refused(run('list', self.tmp / 'fehlt'), 'is no folder')
        self.refused(run('query', self.root / 'a.dokufix.html', '--kind', 'x'), 'is no folder')

    def test_an_empty_criterion_is_refused_and_a_colon_in_a_path_is_no_drive(self):
        self.put('a.dokufix.html', '---\ntitle: A\nsources: a:b.py\n---\n')
        for args in (('--kind', ''), ('--function', ''), ('--source', ''), ('--source', '.'), ('--source', './')):
            with self.subTest(args=args):
                self.refused(run('query', self.root, *args), 'query %s is empty' % args[0])
        self.assertEqual(self.found('--source', 'a:b.py'), [('a.dokufix.html', 1)])

    def test_a_header_nested_too_deep_does_not_stop_list_and_query(self):
        self.put('a.dokufix.html', '---\nkind: reference\ntitle: A\n---\n')
        self.put('tief.dokufix.html', '---json\n' + '{"a":' * 100000 + '1' + '}' * 100000 + '\n---\n# Tief\n')
        # split_frontmatter() takes its RecursionError for an unreadable header.
        self.assertEqual(self.ok('list', self.root)['files'][1]['parts'], [{'number': 1, 'name': 'Tief', 'kind': None, 'state': None}])
        self.assertEqual(self.found('--kind', 'reference'), [('a.dokufix.html', 1)])

    def test_inject_writes_a_new_file_only_with_the_ending_and_an_existing_one_by_any_name(self):
        self.root.mkdir()
        for name in ('neu.html', 'neu.dokufix.htm'):
            # The name is checked first: neither the missing Markdown nor the export is read.
            self.refused(run('inject', self.tmp / 'fehlt.md', self.root / name, '--images-from', self.tmp / 'fehlt.html'), '.dokufix.html')
            self.assertFalse((self.root / name).exists())
        self.put('GROSS.DOKUFIX.HTML', '# Gross\n')
        self.put('b.dokufix.html', '# B\n').rename(self.root / 'b.html')
        r = run('inject', self.md('# Anders\n'), self.root / 'b.html')
        self.assertEqual(r.returncode, 0, r.stderr.decode())
        self.assertEqual(run('extract', self.root / 'b.html').stdout, b'# Anders\n')

    def test_the_covering_rule(self):
        for header, path, want in [('src/x.py', 'src/x.py', True), ('src', 'src/x.py', True), ('src/', 'src/x.py', True),
                                   ('./src/app', 'src/app/x.js', True), ('src/app', './src/app/', True),
                                   ('src/app', 'src/apps.js', False), ('src/x.py', 'src', False), ('', 'src', False),
                                   ('./', 'src', False)]:
            with self.subTest(header=header, path=path):
                self.assertEqual(covers(header, path), want)
        self.assertTrue(matches({'sources': 'src'}, source='src/x.py'))
        self.assertTrue(matches({'functions': 'Suche'}, function='Suche'))
        for header in ({'sources': None}, {'sources': ''}, {'sources': []}, {}, None, ['src']):
            with self.subTest(header=header):
                self.assertFalse(matches(header, source='src/x.py'))
        self.assertFalse(matches({'kind': 'how-to', 'sources': 'src'}, kind='reference', source='src/x.py'))


def part(name, state=None, sources=None):
    if isinstance(sources, list):
        sources = ''.join('\n  - ' + s for s in sources)
    head = ''.join('%s: %s\n' % kv for kv in (('title', name), ('state', state), ('sources', sources)) if kv[1] is not None)
    return '---part\n%s---\n# %s\n\n' % (head, name)


@unittest.skipUnless(shutil.which('git'), 'no git')
class Stale(unittest.TestCase):
    """stale: the parts whose sources have commits since their state (story 3.6)."""
    setUp, tearDown, md, inject, export, refused = Script.setUp, Script.tearDown, Script.md, Script.inject, Script.export, Script.refused
    root, put = Project.root, Project.put

    def git(self, *args, env=None):
        return subprocess.run(['git', '-C', self.root, '-c', 'user.name=t', '-c', 'user.email=t@t', *args], check=True,
                              capture_output=True, env={**GIT_ENV, **(env or {})}).stdout.decode().strip()

    def commit(self, date, *paths, time='12:00:00'):
        for rel in paths:
            f = self.root / rel
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(f.read_text() + 'x\n' if f.exists() else 'x\n')
        self.git('add', *paths)
        stamp = date + 'T' + time + '+0000'
        self.git('commit', '-q', '-m', date, env={'GIT_AUTHOR_DATE': stamp, 'GIT_COMMITTER_DATE': stamp})
        return self.git('rev-parse', 'HEAD')

    def history(self):
        """c1 on 2026-01-05 with four files and tag v1, src/a.py changed on 01-10 at 12:00 and 23:30, src/a.py, src/b.py and
        src/x/y.py on 01-12."""
        self.root.mkdir()
        self.git('init', '-q')
        first = self.commit('2026-01-05', 'src/a.py', 'src/b.py', 'src/c.py', 'src/x/y.py')
        self.git('tag', 'v1')
        self.commit('2026-01-10', 'src/a.py')
        self.commit('2026-01-10', 'src/a.py', time='23:30:00')
        self.commit('2026-01-12', 'src/a.py', 'src/b.py', 'src/x/y.py')
        return first

    def stale(self, *args, root=None):
        r = run('stale', root or self.root, *args, env={'TZ': 'UTC'})
        self.assertEqual(r.returncode, 0, r.stderr.decode())
        self.assertNotIn(b'<', r.stdout)
        return json.loads(r.stdout.decode('utf-8'))

    def changed(self, *args, root=None):
        return [(p['file'], p['name'], [(c['source'], c['commits']) for c in p['changed']])
                for p in self.stale(*args, root=root)['parts']]

    def test_the_ticket_check_a_changed_source_is_listed_an_unchanged_one_not(self):
        self.history()
        self.put('a.dokufix.html', part('A', 'v1', 'src/a.py') + part('B', 'v1', 'src/c.py'))
        out = self.stale()
        self.assertEqual(out, {'parts': [{'file': 'a.dokufix.html', 'number': 1, 'line': 1, 'name': 'A', 'state': 'v1',
                                          'changed': [{'source': 'src/a.py', 'commits': 3}]}], 'unchecked': []})

    def test_a_folder_several_sources_dates_and_a_commit_as_state(self):
        first = self.history()
        self.put('a.dokufix.html', part('Ordner', first, 'src') + part('Mehrere', 'v1', ['src/a.py', './src/b.py', 'src/c.py'])
                 + part('Datum', '2026-01-10', 'src/a.py') + part('Vorher', '2000-01-01', 'src/a.py')
                 + part('Doppelt', 'v1', ['src/a.py', './src/a.py', './', '/']))
        # Datum: the commit at 23:30 on the state's day is covered by the state.
        self.assertEqual(self.changed(), [('a.dokufix.html', 'Ordner', [('src', 3)]),
                                          ('a.dokufix.html', 'Mehrere', [('src/a.py', 3), ('./src/b.py', 1)]),
                                          ('a.dokufix.html', 'Datum', [('src/a.py', 1)]),
                                          ('a.dokufix.html', 'Vorher', [('src/a.py', 4)]),
                                          ('a.dokufix.html', 'Doppelt', [('src/a.py', 3)])])

    def test_what_git_does_not_know_is_unchecked_and_a_part_without_sources_or_state_is_left_out(self):
        self.history()
        self.put('a.dokufix.html', part('Commit', 'deadbee', 'src/a.py') + part('Tag', 'v9', 'src/a.py')
                 + part('Option', '--all', 'src/a.py') + part('Fehlt', 'v1', ['src/c.py', 'src/fehlt.py'])
                 + part('Stern', 'v1', "'src/*.py'") + part('Nur Quelle', sources='src/a.py') + part('Nur Stand', 'v1')
                 + part('Februar', '2026-02-30', 'src/a.py') + part('Monat', '2026-13-01', 'src/a.py')
                 + part('Gemischt', 'v1', ['src/a.py', 'src/fehlt.py', 'src/fehlt2.py']))
        out = self.stale()
        self.assertEqual([(p['name'], p['changed']) for p in out['parts']], [('Gemischt', [{'source': 'src/a.py', 'commits': 3}])])
        self.assertEqual([(p['name'], p['reason']) for p in out['unchecked']],
                         [('Commit', 'git does not know the state deadbee'), ('Tag', 'git does not know the state v9'),
                          ('Option', 'git does not know the state --all'), ('Fehlt', 'no file src/fehlt.py at HEAD'),
                          ('Stern', 'no file src/*.py at HEAD'), ('Februar', 'git does not know the state 2026-02-30'),
                          ('Monat', 'git does not know the state 2026-13-01'),
                          ('Gemischt', 'no file src/fehlt.py, src/fehlt2.py at HEAD')])

    def test_a_source_moved_before_the_state_is_unchecked_one_deleted_after_it_changed(self):
        self.history()
        self.git('mv', 'src/c.py', 'src/d.py')
        stamp = '2026-01-13T12:00:00+0000'
        self.git('commit', '-q', '-m', 'mv', env={'GIT_AUTHOR_DATE': stamp, 'GIT_COMMITTER_DATE': stamp})
        self.put('a.dokufix.html', part('Umbenannt', self.git('rev-parse', 'HEAD'), 'src/c.py') + part('Geloescht', 'v1', 'src/c.py'))
        out = self.stale()
        self.assertEqual([(p['name'], p['changed']) for p in out['parts']], [('Geloescht', [{'source': 'src/c.py', 'commits': 1}])])
        self.assertEqual([(p['name'], p['reason']) for p in out['unchecked']], [('Umbenannt', 'no file src/c.py at HEAD')])

    def test_a_root_in_a_subfolder_and_exports_only_on_request(self):
        self.history()
        self.put('docs/a.dokufix.html', part('A', 'v1', 'src/a.py'))
        shutil.move(self.export(part('A', 'v1', 'src/a.py'), 'nur-lesen'), self.root / 'docs' / 'a-nur-lesen.dokufix.html')
        self.assertEqual([p[0] for p in self.changed(root=self.root / 'docs')], ['a.dokufix.html'])
        self.assertEqual([p[0] for p in self.changed('--read-only', root=self.root / 'docs')],
                         ['a-nur-lesen.dokufix.html', 'a.dokufix.html'])

    def test_outside_a_repository_it_is_refused(self):
        self.put('a.dokufix.html', part('A', 'v1', 'src/a.py'))
        r = run('stale', self.root, env={'GIT_CEILING_DIRECTORIES': str(self.tmp.parent)})
        self.refused(r, 'git repository')
        (self.tmp / 'leer').mkdir()
        self.refused(run('stale', self.root, env={'PATH': str(self.tmp / 'leer')}), 'git repository')


class Parts(unittest.TestCase):
    def test_every_case_against_read_parts(self):
        expected = json.loads((CASES / 'expected.json').read_text(encoding='utf-8'))
        files = sorted(p.name for p in CASES.glob('*.md'))
        self.assertEqual(sorted(expected), files)
        for name in files:
            with self.subTest(case=name):
                doc, want = case(name), expected[name]
                parts = read_parts(doc)
                self.assertEqual([{'line': p['line'], 'name': p['name'], 'header': p['header']} for p in parts], want['parts'])
                # The problems of the fields are check's (story 3.7).
                self.assertEqual([{'line': p['line'], 'code': p['problem']} for p in parts if p['problem']],
                                 [p for p in want['problems'] if p['code'].startswith('header-')])
                self.assertEqual(''.join(p['text'] for p in parts), doc)


if __name__ == '__main__':
    unittest.main()
