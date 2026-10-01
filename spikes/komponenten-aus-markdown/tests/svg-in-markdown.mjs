// Überlebt ein handgeschriebenes SVG den Weg durch marked, wenn man es als Roh-HTML in Markdown einbettet?
import { marked } from 'marked';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
// Ein kleines handgeschriebenes SVG mit Leerzeilen zwischen den Gruppen, so wie man es von Hand gliedert.
const svg = `<svg viewBox="0 0 400 160" role="img" aria-label="Zwei Schritte">
  <g class="rahmen">
    <rect x="10" y="10" width="380" height="140" fill="none" stroke="#999"/>
  </g>

  <g class="schritte">
    <rect x="30" y="50" width="120" height="60" rx="8" fill="#fff" stroke="#0e7c86"/>
    <text x="90" y="85" text-anchor="middle">Bestellen</text>

    <rect x="250" y="50" width="120" height="60" rx="8" fill="#fff" stroke="#0e7c86"/>
    <text x="310" y="85" text-anchor="middle">Liefern</text>
  </g>

  <g class="kanten">
    <path d="M150 80 H250" stroke="#555"/>
    <polygon points="250,80 242,76 242,84" fill="#555"/>
  </g>
</svg>`;
const check = (label, src) => {
  const out = marked.parse('Text davor.\n\n' + src + '\n\nText danach.\n', { gfm: true });
  const inside = /<svg[\s\S]*<\/svg>/.exec(out);
  const body = inside ? inside[0] : out;
  console.log(label.padEnd(46), '| <p> im SVG:', (body.match(/<p>/g) || []).length, '| SVG-Elemente erhalten:', (body.match(/<(rect|path|circle|polygon|text)\b/g) || []).length, 'von', (src.match(/<(rect|path|circle|polygon|text)\b/g) || []).length);
};
console.log('Leerzeilen im SVG:', (svg.match(/\n\s*\n/g) || []).length);
check('SVG mit Leerzeilen', svg);
check('SVG ohne Leerzeilen', svg.replace(/\n\s*\n/g, '\n'));
check('in <div> gewickelt, mit Leerzeilen', '<div class="diagram">\n' + svg + '\n</div>');
check('in <div> gewickelt, ohne Leerzeilen', '<div class="diagram">\n' + svg.replace(/\n\s*\n/g, '\n') + '\n</div>');
const broken = marked.parse(svg, { gfm: true });
console.log('Mit Leerzeilen entstehen:', (broken.match(/<pre><code>/g) || []).length, 'Code-Blöcke,', (broken.match(/<p>/g) || []).length, 'Absätze,', (broken.match(/&lt;(path|rect|circle|text)/g) || []).length, 'SVG-Elemente als sichtbarer Text');
