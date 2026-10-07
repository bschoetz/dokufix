// Prototyp (c): das Textlayout von diagram-js 15.28.0 (lib/util/Text.js: layoutText, layoutNext, fit,
// semanticShorten, shortenLine) portiert, mit einer Breitentabelle statt canvas.measureText, und darauf die Rechnung
// des TextRenderers von bpmn-js 18.31.0 (lib/draw/TextRenderer.js: getExternalLabelBounds, getTextAnnotationBounds)
// und von labelMeasurer() (src/app/bpmn.js). Reines JavaScript, ohne DOM, in Node wie im Browser gleich.
//
// Abgeleitet von diagram-js, The MIT License (MIT), Copyright (c) 2014-present Camunda Services GmbH, und von
// bpmn-js (bpmn.io License, MIT-artig, Copyright (c) 2014-present Camunda Services GmbH). Der Hinweis bleibt im
// Dateikopf, wie bei LMM der von Mermaid (docs/analyse-mermaid-im-bpmn-code.md, Abschnitt 4a).
//
//   const measure = messer(tabelle);        tabelle: breiten-<schrift>-12px.json (tabelle.mjs)
//   measure(text)        → { w, h }         Beschriftung an Ereignis, Gateway, Fluss, wie labelMeasurer(viewer)
//   measure(text, width) → { w, h }         Textanmerkung in der Breite width
//   layoutText(text, maxWidth, widthOf)     die Zeilen, wie diagram-js sie bricht: [{ text, width }]

const SOFT_BREAK = '­';

// ---- Der Teil aus diagram-js (Text.js), Messen durch widthOf(text) ersetzt ----

// getTextBBox(): die Breite einer Zeile; eine leere Zeile ist 0 breit, nachgestellte Leerzeichen zählen nicht.
const lineWidth = (text, widthOf) => text === '' ? 0 : widthOf(text.replace(/\s+$/, ''));

// semanticShorten(): kürzt an Leerzeichen, Bindestrichen und weichen Trennstrichen auf höchstens maxLength Zeichen.
function semanticShorten(line, maxLength){
  const parts = line.split(/(\s|-|­)/g), shortened = [];
  let part, length = 0;
  if (parts.length > 1){
    while ((part = parts.shift())){
      if (part.length + length < maxLength){ shortened.push(part); length += part.length; }
      else { if (part === '-' || part === SOFT_BREAK) shortened.pop(); break; }
    }
  }
  const last = shortened[shortened.length - 1];
  if (last && last === SOFT_BREAK) shortened[shortened.length - 1] = '-';
  return shortened.join('');
}

// shortenLine(): die Zielzahl Zeichen aus dem Verhältnis von Soll- zu Istbreite; sonst wird das Wort geschnitten.
function shortenLine(line, width, maxWidth){
  const length = Math.max(line.length * (maxWidth / width), 1);
  return semanticShorten(line, length) || line.slice(0, Math.max(Math.round(length - 1), 1));
}

// layoutNext() + fit(): die nächste Zeile; was nicht passt, geht getrimmt zurück an den Anfang von lines.
function layoutNext(lines, maxWidth, widthOf){
  const original = lines.shift();
  let fitLine = original;
  for (;;){
    const width = fitLine ? lineWidth(fitLine, widthOf) : 0;
    if (fitLine === ' ' || fitLine === '' || width <= maxWidth || fitLine.length < 2){
      if (fitLine.length < original.length) lines.unshift(original.slice(fitLine.length).trim());
      return { text: fitLine, width };
    }
    fitLine = shortenLine(fitLine, width, maxWidth);
  }
}

// layoutText(): die Zeilen eines Texts in maxWidth (Box minus Innenabstand). Zeilenumbrüche des Autors trennen,
// ein weicher Trennstrich davor fällt weg.
export function layoutText(text, maxWidth, widthOf){
  const lines = String(text).split(/­?\r?\n/), layouted = [];
  while (lines.length) layouted.push(layoutNext(lines, maxWidth, widthOf));
  return layouted;
}

// ---- Die Breite eines Strings aus der Tabelle ----

const CJK = /[⺀-鿿가-힯豈-﫿＀-￯]/;
const EMOJI = /[☀-➿\u{1f000}-\u{1faff}]/u;

// widthOf(text) aus einer Tabelle (tabelle.mjs): Summe der Zeichenbreiten plus Kerning der Nachbarpaare.
// Unbekannte Zeichen: CJK und Emoji nach den Probewerten der Tabelle, sonst die mittlere Breite.
export function breitenFunktion(tabelle, { kerning = true } = {}){
  const widths = tabelle.breiten, pairs = kerning ? tabelle.kerning || {} : {};
  const values = Object.values(widths);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const extra = tabelle.weitere || {};
  const fallback = c => CJK.test(c) ? (extra['請'] ?? 12) : EMOJI.test(c) ? (extra['🎉'] ?? 15) : mean;
  return text => {
    let sum = 0, prev = '';
    for (const c of text){
      sum += widths[c] ?? fallback(c);
      if (prev && pairs[prev + c]) sum += pairs[prev + c];
      prev = c;
    }
    return sum;
  };
}

// ---- Der Teil aus bpmn-js (TextRenderer.js) und labelMeasurer() (src/app/bpmn.js) ----

const LABEL_WIDTH = 90, NOTE_PADDING = 7, MIN_NOTE_HEIGHT = 40;

export function messer(tabelle, { fontSize = 12, lineHeight = 1.2, kerning = true } = {}){
  const widthOf = typeof tabelle === 'function' ? tabelle : breitenFunktion(tabelle, { kerning });
  const lh = lineHeight * parseInt(fontSize, 10);
  return (text, width) => {
    if (width){
      // getTextAnnotationBounds(): links oben, 7 px innen, mindestens 40 hoch.
      const n = layoutText(text, width - 2 * NOTE_PADDING, widthOf).length;
      return { w: width, h: Math.max(MIN_NOTE_HEIGHT, Math.round(n * lh + 2 * NOTE_PADDING)) };
    }
    // getExternalLabelBounds(): die Box 90 breit, Breite und Höhe aufgerundet; dann, wie labelMeasurer(), die
    // Zeilen beim Zeichnen in der importierten Breite noch einmal gezählt.
    const first = layoutText(text, LABEL_WIDTH, widthOf);
    const w = Math.ceil(first.reduce((m, l) => Math.max(m, l.width), 0));
    const h = Math.ceil(first.length * lh);
    const drawn = layoutText(text, w, widthOf).length;
    return { w, h: Math.ceil(h / Math.max(1, first.length) * drawn) };
  };
}
