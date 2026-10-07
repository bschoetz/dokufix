# Beschriftungsgrößen mit diagram-js: Analyse und Messung

Frage: Lässt sich das Messen der Beschriftungsgrößen im künftigen BPMN-Layout-Paket (LGPL-3.0, XML ohne Positionen rein, XML mit Positionen raus, gleiches Ergebnis im Browser wie in Node) mit **diagram-js** lösen, statt bpmn-js zu brauchen oder alles selbst zu bauen?

Gemessen am 7. Oktober 2026 in diesem Container: Chromium 141 (HeadlessChrome, `/opt/pw-browsers/chromium`), Node aus dem Repository, bpmn-js 18.31.0 aus dem CDN-Spiegel `tests/.cdn/`. Alle Zahlen unten stammen aus den Skripten dieses Ordners (Abschnitt 8); was nicht gemessen ist, steht in Abschnitt 7.

## 1. Zusammenfassung

- **bpmn-js 18.31.0 bündelt diagram-js 15.28.0.** Das Textlayout steckt vollständig in diagram-js (`lib/util/Text.js`); der `TextRenderer` von bpmn-js ist eine dünne Hülle mit den Konstanten (Box 90 px, Zeilenhöhe 1,2 × 12 px, Innenabstand 7 px, Mindesthöhe 40 px, Rundung).
- **Gemessen wird seit diagram-js 15.12.0 nicht mehr per Hilfs-SVG und `getBBox`, sondern per `canvas.measureText`** (ein `<canvas>`-Kontext, modulweit gemerkt). Das ändert nichts an der Antwort: Beides braucht einen Browser. In Node gibt es ohne native Module weder das eine noch das andere.
- **Variante (a), diagram-js im Browser:** exakt, 0 von 572 Messungen anders als `labelMeasurer(viewer)`, mit dem `TextRenderer` ohne Viewer ebenso wie mit `Text` von diagram-js allein. Aber: nur im Browser, und in der Systemschrift, also je Rechner anders.
- **Variante (b), Algorithmus von diagram-js mit ersetzter Messung:** Die Messfunktion lässt sich **nicht übergeben**; sie ist modulintern. Ersetzt man den Canvas-Kontext am `document` (linkedom oder ein 40-Zeilen-Stub), läuft das unveränderte `Text.js` in Node und liefert dieselben Größen wie der Prototyp (0 von 572 anders). Es ist ein Eingriff in das `document`, kein Eingriff in diagram-js.
- **Variante (c), Portierung mit Breitentabelle (Prototyp `messer.mjs`):** 110 Zeilen, 70 Zeilen Code, davon 35 aus diagram-js abgeleitet. Mit der Tabelle der Schrift, die Chromium hier zeichnet (Inter), trifft er **291 von 292 Beschriftungen und 280 von 280 Notizgrößen exakt**; alle 417 Größen der Fixtures exakt. **57 von 57 Fixtures** ergeben in Node dasselbe XML wie die Messung von bpmn-js in demselben Chromium. In Chromium und in Node liefert er dieselben 572 Größen.
- **Kerning ist nötig:** Ohne die Kerning-Paare der Tabelle stimmen nur 224 von 292 Beschriftungen und 37 von 57 Fixtures.
- **Die Schrift entscheidet, nicht der Algorithmus:** Mit der Tabelle einer anderen Schrift (Liberation Sans, während Chromium Inter zeichnet) stimmen nur 4 von 57 Fixtures; die auf einem anderen Rechner gemessenen Größen der Fixtures ergeben hier ebenfalls nur 4 von 57. Das heutige `labelSize()` trifft 1 von 57.
- **Versionskopplung gibt es bei jeder Variante:** Die Kürzungslogik ist seit diagram-js 14.0.0 unverändert, aber 15.12.0 hat die Messung gewechselt und 15.27.x die Passbedingung (`<` gerundet → `<=`); ein bpmn-js, das zeichnet, muss zum Algorithmus des Messers passen, ob der nun aus einer Abhängigkeit oder aus portiertem Code kommt.
- **Empfehlung:** Variante (c). Der MIT-Hinweis von diagram-js kommt in den Dateikopf, wie bei LMM der von Mermaid. Die Schriftfrage (Abschnitt 6) bleibt eine Entscheidung: Gleiches Layout überall gibt es nur mit einer Referenzschrift, und deckungsgleich mit der Zeichnung ist es nur, wenn bpmn-js in derselben Schrift zeichnet.

## 2. Was bpmn-js 18.31.0 genau nutzt

### Versionen

| Paket | Version | Lizenz | Woher |
|---|---|---|---|
| bpmn-js | 18.31.0 (2026-10-01 09:57 UTC) | bpmn.io-Lizenz (MIT-Text plus Wasserzeichen-Klausel) | `npm pack`, Vendor-Ordner |
| diagram-js | **15.28.0** (2026-10-01 08:35 UTC) | MIT | `npm pack`, Vendor-Ordner |
| min-dash | 5.1.0 | MIT | Abhängigkeit beider |
| tiny-svg | 4.1.4 | MIT | Abhängigkeit von `Text.js` |

bpmn-js 18.31.0 verlangt `diagram-js ^15.28.0`; 15.28.0 erschien 80 Minuten vor bpmn-js und ist die einzige Fassung, die der Bereich am Tag des Bundles zuließ. Das Bundle im CDN-Spiegel (`bpmn-navigated-viewer.production.min.js`, 195 KB) enthält `measureText` und `fontBoundingBoxAscent`, also den Code von 15.28.0 (ab 15.12.0; vorher `getBBox`).

### Zusammenspiel

```text
BpmnImporter.addLabel()                       beim Import, je Beschriftung an Ereignis, Gateway, Fluss
  └ TextRenderer.getExternalLabelBounds(bounds, text)
      box = { width: max(bounds.width, 90), height: 30 }, style = externalStyle
      └ Text.getDimensions(text, { box, style })  →  { width: maxLineWidth, height: n × 14.4 }
      → { width: ceil(width), height: ceil(height) }
BpmnRenderer.renderExternalLabel()            beim Zeichnen
  └ Text.createText(text, { box: { width: label.width }, style: externalStyle })   bricht in der importierten Breite neu um
BpmnRenderer 'bpmn:TextAnnotation'            beim Zeichnen einer Notiz
  └ Text.createText(text, { box: bounds, align: 'left-top', padding: 7, style: defaultStyle })
TextRenderer.getTextAnnotationBounds(bounds, text)   (beim Modellieren; labelMeasurer() ruft es direkt)
  └ Text.getDimensions(..., padding 7) → height = max(40, round(n × 14.4 + 14))
```

`labelMeasurer()` in `src/app/bpmn.js` bildet genau das nach: Breite und Höhe aus `getExternalLabelBounds`, dann die Zeilen beim Zeichnen in der importierten Breite gezählt (`createText`, `tspan`s) und die Höhe darauf hochgerechnet; Notizen über `getTextAnnotationBounds`.

### Konstanten

| Was | Wert | Wo |
|---|---|---|
| Schrift | `defaultStyle.fontFamily`, dokufix: `BPMN_FONT`; `fontWeight: 'normal'` | `TextRenderer.js`, `BPMN_VIEWER_CONFIG` |
| Schriftgröße | 12 px; `externalStyle` wäre 11 px, dokufix setzt 12 | `TextRenderer.js`, `BPMN_VIEWER_CONFIG` |
| Zeilenhöhe | `lineHeight 1.2` × `parseInt(fontSize)` = **14,4 px** | `TextRenderer.js`, `Text.js getLineHeight()` |
| Box der Beschriftung | Breite max(DI-Breite, **90**), Höhe 30 (unbenutzt) | `LabelUtil.DEFAULT_LABEL_SIZE`, `TextRenderer.js` |
| Innenabstand der Notiz | **7 px** je Seite | `AnnotationUtil.TEXT_ANNOTATION_PADDING` |
| Mindesthöhe der Notiz | **40 px** | `TextRenderer.js` |
| Rundung | Beschriftung `ceil` (Breite, Höhe), Notiz `round`, Importer dann `round` | `TextRenderer.js`, `BpmnImporter.js` |
| Canvas-Font | `"normal 12px <fontFamily>"`, `letterSpacing '0px'` | `Text.js buildFont()` |

Die Höhe aus `measureText` (`fontBoundingBoxAscent + Descent`, hier Inter 12 + 3) wird nur ohne `lineHeight` genommen; bpmn-js setzt `lineHeight` immer, also **zählt für die Höhe nur die Zeilenzahl**.

### Wo gemessen wird

`Text.js getTextBBox(text, style)`: `document.createElement('canvas').getContext('2d')` (einmal, modulweit in `_canvasContext`), `ctx.font = buildFont(style)`, `ctx.measureText(text ohne nachgestellte Leerzeichen).width`; eine leere Zeile ist 0 breit. Kein Hilfs-SVG, kein `getBBox`, nichts im DOM. Bis diagram-js 15.11.0 war es ein `<svg id="helper-svg">` in `document.body` mit einem `<text>`, `getBBox()`, Breite plus `2 × x` (Vendor-Ordner, `diagram-js-15.10.0`). Beide Wege brauchen eine Layout- bzw. Text-Engine; in linkedom gibt `getContext()` `null`, diagram-js misst dann 0 und bricht nichts um (Variante b0: 438 von 572 Größen falsch).

### Der Algorithmus (`Text.js`)

1. `layoutText`: Text an `­?\r?\n` in Zeilen trennen (weicher Trennstrich vor Zeilenumbruch fällt weg; `\r\n` und `\n` gleich; eine Leerzeile bleibt eine Zeile). `maxWidth = box.width − padding.left − padding.right`.
2. `layoutNext`: Die Zeile passt, wenn sie `' '` oder `''` ist, ihre Breite ≤ `maxWidth` ist oder sie kürzer als 2 Zeichen ist. Sonst `shortenLine`, und wieder messen.
3. `shortenLine`: Zielzahl Zeichen `length = max(line.length × maxWidth / width, 1)` (lineares Verhältnis, kein Suchen). `semanticShorten(line, length)`: an `\s`, `-` und `­` teilen (Trenner bleiben als Teile), Teile anhängen, solange `teil.length + bisher < length` (strikt); ein Bindestrich oder weicher Trennstrich, der nicht passt, nimmt den Teil davor mit; ein weicher Trennstrich am Ende wird `-`. Ergibt das nichts (etwa ein einzelnes langes Wort, oder eine Zeile, die mit Leerzeichen beginnt, weil der erste Teil `''` die Schleife beendet), wird **hart geschnitten**: `line.slice(0, max(round(length − 1), 1))`.
4. `fit`: Der Rest `original.slice(fitLine.length).trim()` geht an den Anfang der Zeilenliste zurück. Führende Leerzeichen einer Autorzeile bleiben also, Leerzeichen am Umbruch verschwinden.
5. Breite = breiteste Zeile (Gleitkommazahl), Höhe = Zeilen × 14,4 + Innenabstand. Ausrichtung (`center`/`left`, `fitBox`) wirkt nur auf die `x` der `tspan`s, nicht auf die Maße.

Eigenheiten, die der Prototyp übernimmt: Die Kürzung hängt von `maxWidth` ab, deshalb kann der zweite Umbruch beim Zeichnen (Box = importierte Breite statt 90) eine Zeile mehr ergeben, obwohl jede Zeile hineinpassen würde; `labelMeasurer()` zählt deshalb zweimal. Doppelte Leerzeichen beenden `semanticShorten` am leeren Teil. Ein Tab ist `\s` und damit ein Trenner.

Die Kürzung (`semanticShorten`, `shortenLine`, `fit`) ist seit diagram-js **14.0.0 unverändert** (0 Zeilen Unterschied zu 15.28.0). Zwei Dinge haben sich geändert, und beide betreffen das Ergebnis: In **15.12.0** (April 2026) kam `canvas.measureText` statt `getBBox`. In **15.27.1–15.27.3** (24.–30. September 2026, eine Woche vor bpmn-js 18.31.0) wurde die Passbedingung in `layoutNext` von `textBBox.width < Math.round(maxWidth)` zu `textBBox.width <= maxWidth`; `Text.js` ist von 15.12.0 bis 15.27.0 bis auf diese eine Zeile gleich und ab 15.27.3 byteweise gleich. Eine Zeile, die genau so breit ist wie die Box, oder ein Bruchteil bei gerundeter Box kippt dadurch zwischen den Versionen. Der Prototyp folgt 15.28.0; ein bpmn-js 18.20.0 bis 18.30.x (diagram-js ^15.19 bis ^15.27) kann an solchen Grenzfällen anders umbrechen.

## 3. Die Varianten

### (a) diagram-js als Abhängigkeit, Messen im Browser

Geprüft in derselben Chromium-Seite wie `labelMeasurer(viewer)` (`referenz.mjs`):

| Fassung | Code | Größen anders als `labelMeasurer(viewer)` |
|---|---|---|
| (a1) `new TextRenderer(BPMN_VIEWER_CONFIG.textRenderer)` aus der npm-Quelle von bpmn-js, ohne Viewer, `labelMeasurer()` unverändert mit einem `{ get }`-Stub | 0 eigene Zeilen | **0 / 572** |
| (a2) nur `Text` von diagram-js, die Rechnung des `TextRenderers` nachgebaut | ~15 Zeilen | **0 / 572** |

Gewicht: `TextRenderer` + `Text` gebündelt und minifiziert **7,3 KB** (`Text` allein 6,3 KB), gegenüber 195 KB für den Viewer. Als npm-Abhängigkeit ist diagram-js aber 3,5 MB entpackt mit 9 Abhängigkeiten (bpmn-js 6,9 MB); gebraucht würde eine Datei. Versionskopplung: Das Paket müsste eine diagram-js-Version ≥ 15.12.0 festlegen; das bpmn-js, das zeichnet, bringt seine eigene mit. Solange `Text.js` gleich bleibt, sind beide gleich; ändert bpmn.io den Umbruch (zuletzt 15.27.x, die Passbedingung, Abschnitt 2), laufen sie auseinander, bis das Paket nachzieht. Das ist dieselbe Kopplung wie bei (c), nur über eine Abhängigkeit statt über Code.

Was (a) nicht löst: Es misst in der Schrift des Rechners. Die gespeicherten Größen der Fixtures (anderer Rechner) stimmen mit denen von hier in **1 von 57** Fixtures überein, und in Node läuft es gar nicht. Für das Ziel „gleiche Eingabe, gleiches Ergebnis überall“ ist (a) deshalb kein Weg, sondern höchstens ein Zusatz für den Browser.

### (b) Algorithmus von diagram-js, Messung ersetzt

Die Messfunktion `getTextBBox()` ist modulintern und nicht übergebbar; es gibt keine Option dafür. Ohne Eingriff in diagram-js bleibt nur, den Canvas-Kontext zu ersetzen, den `Text.js` sich beim ersten Messen von `document` holt (`variante-b.mjs`, `Text.js` per esbuild als ESM gebündelt):

| Fassung | läuft | Größen anders als Chromium-Referenz | anders als Prototyp (c) |
|---|---|---|---|
| (b0) linkedom unverändert | ja, `getContext()` = `null`, misst 0 | 438 / 572 | 438 / 572 |
| (b1) linkedom, `createElement('canvas')` gibt einen Kontext mit `measureText` aus der Breitentabelle | ja | **1 / 572** (CJK-Text, Rückfallbreite) | **0 / 572** |
| (b2) ohne DOM-Bibliothek, ein `document`-Stub (`createElementNS` für tiny-svg, Canvas-Kontext) | ja | **1 / 572** | **0 / 572** |

Es geht also in Node, mit linkedom oder ohne, aber nur über ein globales `document`, das vor dem ersten Import steht (der Kontext wird modulweit gemerkt), und mit den Abhängigkeiten min-dash und tiny-svg im Bündel (12,5 KB ESM). Das ist fragiler als (c) und bringt gegenüber (c) nichts: derselbe Algorithmus, dieselbe Tabelle, dieselben Größen.

### (c) Portierung mit Breitentabelle: der Prototyp

`messer.mjs`: 110 Zeilen mit Kopfkommentar, **70 Zeilen Code**. Davon sind **35 Zeilen Code (48 mit Kommentaren) aus `Text.js` abgeleitet** (`lineWidth`, `semanticShorten`, `shortenLine`, `layoutNext`, `layoutText`), 16 Zeilen aus `TextRenderer.js` und `labelMeasurer()` (Box 90, 14,4, Innenabstand, Mindesthöhe, Rundung, zweiter Umbruch), der Rest ist die Breitenfunktion aus der Tabelle. Keine Abhängigkeit, kein DOM. ESLint des Repositorys: keine Meldung.

Die Breitentabelle (`tabelle.mjs`, in Chromium über `canvas.measureText` erzeugt, genau wie diagram-js misst): 357 Zeichen (ASCII, Latin-1, Latin Extended-A, allgemeine Interpunktion, €, ™, Tab), dazu die Kerning-Paare über 82 Zeichen (Buchstaben, Ziffern, Satzzeichen, Umlaute), bei denen die gemessene Paarbreite von der Summe abweicht, und Probewerte für CJK, Emoji, weichen Trennstrich. Die Breite eines Strings ist die Summe der Zeichenbreiten plus Kerning der Nachbarpaare; unbekannte Zeichen fallen auf CJK-, Emoji- oder Mittelbreite zurück.

| Tabelle | Schrift | Lizenz | Zeichen | Kerning-Paare | Datei |
|---|---|---|---|---|---|
| Inter 12 px | Inter Regular (`/usr/share/fonts/opentype/inter/`), die Schrift, die **dieses Chromium für `BPMN_FONT` zeichnet** | SIL Open Font License 1.1 | 357 | 878 von 6724 | `breiten-inter-12px.json` (20 KB) |
| Liberation Sans 12 px | Liberation Sans Regular, metrisch gleich Arial/Helvetica | SIL Open Font License 1.1 | 357 | 88 von 6724 | `breiten-liberation-sans-12px.json` (7 KB) |

Warum Inter: Chromium löst `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif` hier über fontconfig (`/etc/fonts/conf.d/56-prefer-inter.conf`: `-apple-system`, `BlinkMacSystemFont`, `Segoe UI` → Inter) auf **Inter** auf; die Breite einer Probe mit `BPMN_FONT` ist identisch mit `Inter` (378,66 px) und verschieden von Liberation Sans (357,52), DejaVu Sans, FreeSans, Carlito. Nur mit der Tabelle der gezeichneten Schrift lässt sich der Algorithmus getrennt von der Schrift prüfen. Liberation Sans dient als Gegenprobe: eine Referenzschrift, die nicht die gezeichnete ist.

## 4. Messungen

Korpus (`korpus.mjs`): alle Texte der `*.sizes.json` (261 Beschriftungen, 39 Notiztexte) plus 31 heikle Texte (Umlaute, 42-Zeichen-Wort, Bindestriche, Zahlen, `\n` und `\r\n`, Leerzeile, Emoji, CJK, Tab, weicher Trennstrich, führende/doppelte/nachgestellte Leerzeichen, typografische Anführungszeichen), als Beschriftung und als Notiz. Zusammen 292 Beschriftungen und 70 Notiztexte × 4 Breiten = **572 Messungen**. Referenz: `labelMeasurer(viewer)` wie in `tests/capture-bpmn.mjs`, in Chromium 141 (`referenz.mjs`, `referenz-chromium.json`), mit der Zeilenzahl beim Zeichnen.

### 4.1 Größen gegen bpmn-js im selben Chromium (`vergleich.mjs`)

Alle 572 Messungen:

| Kandidat | Breite Ø | Breite max | Höhe Ø | Höhe max | Zeilen falsch | exakt gleich | Notiz Höhe Ø | Notiz Höhe max | Notiz Zeilen falsch | Notiz exakt |
|---|---|---|---|---|---|---|---|---|---|---|
| **Prototyp, Inter, mit Kerning** | **0,04 px** | 11 px | **0,00 px** | 0 px | **0 (0,0 %)** | **291/292** | **0,00 px** | 0 px | **0 (0,0 %)** | **280/280** |
| Prototyp, Inter, ohne Kerning | 0,45 px | 36 px | 0,15 px | 15 px | 3 (1,0 %) | 224/292 | 0,10 px | 14 px | 2 (0,7 %) | 278/280 |
| Prototyp, Liberation Sans (Chromium zeichnet Inter) | 4,71 px | 41 px | 1,18 px | 29 px | 23 (7,9 %) | 11/292 | 1,45 px | 29 px | 35 (12,5 %) | 245/280 |
| (a1) TextRenderer ohne Viewer, Chromium | 0,00 px | 0 px | 0,00 px | 0 px | 0 (0,0 %) | 292/292 | 0,00 px | 0 px | 0 (0,0 %) | 280/280 |
| heute: `labelSize()` | 5,47 px | 41,8 px | 2,63 px | 44 px | 38 (13,0 %) | 1/292 | 3,20 px | 53 px | 56 (20,0 %) | 119/280 |

Nur die Texte der Fixtures (261 Beschriftungen, 156 Notizmessungen): Prototyp mit Kerning **261/261 und 156/156 exakt**; ohne Kerning 203/261 und 154/156; Liberation Sans 8/261 und 131/156; `labelSize()` 1/261 und 58/156 (Breite Ø 5,4 px, Zeilen falsch 27, Notizhöhe Ø 3,6 px, 27 Notizen ≥ 10 px daneben; das deckt sich mit `spikes/lmm/messen/schaetzung.mjs`).

Nur die heiklen Texte (31 Beschriftungen, 124 Notizmessungen): Prototyp mit Kerning 30/31 und 124/124. Der eine Fehler ist `請求書を確認する` (Referenz 73 × 29, Prototyp 84 × 29, beide zwei Zeilen): Die CJK-Zeichen bekommen die Rückfallbreite 12 px, die Rückfallschrift von Chromium (WenQuanYi) ist minimal anders, und `shortenLine` rechnet mit dem Verhältnis der Breiten. Emoji, Tab, weicher Trennstrich, Leerzeilen, `\r\n`, führende und doppelte Leerzeichen, das 42-Zeichen-Wort und die Bindestrich-Fälle stimmen exakt.

### 4.2 Die Breitenfunktion allein (ohne Umbruch, 784 Texte und Wörter des Korpus gegen `canvas.measureText`)

| Tabelle | Abweichung Ø | max | > 0,5 px |
|---|---|---|---|
| Inter mit Kerning, gegen Inter | 0,03 px | 13,9 px | 6 |
| Inter ohne Kerning, gegen Inter | 0,26 px | 14,3 px | 118 |
| Liberation Sans mit Kerning, gegen Liberation Sans | 0,02 px | 12,9 px | 3 |
| Liberation Sans gegen Inter (andere Schrift) | **4,49 px** | **73,6 px** | 736 |

Die 6 Ausreißer von Inter mit Kerning: drei Texte mit `\n`/`\r\n` im Ganzen gemessen (im Layout werden sie vorher getrennt, also ohne Folge), der CJK-Text, und die typografischen Anführungszeichen `„“‚‘` (0,5–1,3 px; sie liegen außerhalb der 82 Zeichen der Kerning-Paare). Der Vergleich zeigt: **Die Tabelle einer anderen Schrift ist der große Fehler (4,5 px Ø), die Tabelle selbst ein kleiner (0,03 px Ø).**

### 4.3 Wirkung auf das Layout der 57 Fixtures (`layout.mjs`)

Vergleichsgrößen: `tests/capture-bpmn.mjs --out` in diesem Chromium (Scratchpad `sizes-hier/`, 57 Fixtures). Referenz-XML: `readModel → layoutGeometry → appendDiagram` mit diesen Größen, in Node, mit den gespeicherten Rohpositionen (die Rohpositionen von hier ergeben in 57 von 57 Fällen dasselbe XML, obwohl ihre Zahlen nur in 5 von 57 Dateien gleich sind; nur die Ordnung zählt).

| Messer in Node | XML gleich der Chromium-Messung |
|---|---|
| **Prototyp, Inter, mit Kerning** | **57 / 57** |
| Prototyp, Inter, ohne Kerning | 37 / 57 |
| Prototyp, Liberation Sans (andere Schrift als gezeichnet) | 4 / 57 |
| heute: `labelSize()` | 1 / 57 |
| gespeicherte `.sizes.json` (anderer Rechner, andere Schrift) | 4 / 57 |

Zur Einordnung: Die gespeicherten `.measured.bpmn` der Fixtures stimmen mit dem Referenz-XML von hier in 4 von 57 überein, und die Größen hier gleichen den gespeicherten nur in 1 von 57 Dateien. Das ist die Spanne zwischen zwei Rechnern mit verschiedenen Schriften bei unverändertem Code.

### 4.4 Gleichheit über Umgebungen (`gleichheit.mjs`)

Der Prototyp mit der Inter-Tabelle, per esbuild in die Chromium-Seite gebündelt, gegen denselben Prototyp in Node: **0 von 572 Messungen anders.** Reines JavaScript auf Zahlen, nichts aus `document`, `canvas` oder `navigator`.

## 5. Bewertung

| Kriterium | (a) diagram-js im Browser | (b) diagram-js, Messung ersetzt | (c) Portierung + Tabelle |
|---|---|---|---|
| Gleichheit Browser/Node | nein: nur Browser, Systemschrift | ja, mit globalem `document`-Stub vor dem Import | **ja**, gemessen 572/572 |
| Nähe zur Zeichnung | exakt (0/572) in der Schrift des Rechners | exakt, wenn bpmn-js in der Tabellenschrift zeichnet (1/572 CJK) | **exakt, wenn bpmn-js in der Tabellenschrift zeichnet** (1/572 CJK); sonst Schriftfehler (Abschnitt 6) |
| Abhängigkeiten | diagram-js (3,5 MB, 9 Abhängigkeiten; gebündelt 6–7 KB) | diagram-js + min-dash + tiny-svg, ESM-Bündel 12,5 KB | **keine**; Tabelle 20 KB JSON |
| Versionskopplung | an diagram-js ≥ 15.12; das zeichnende bpmn-js bringt sein eigenes mit | wie (a), plus Kopplung an die interne Canvas-Nutzung | an den Algorithmus: Kürzung seit 14.0.0 unverändert, Passbedingung in 15.27.x geändert, Messung in 15.12.0 |
| Größe | 7,3 KB minifiziert | 12,5 KB | **70 Zeilen** + Tabelle |
| Lizenz | MIT-Abhängigkeit, verträglich mit LGPL-3.0 | wie (a) | abgeleiteter Code (35 Zeilen), **MIT-Hinweis im Dateikopf**, verträglich mit LGPL-3.0 (wie LMM/Mermaid) |
| Wartung | bpmn.io pflegt; Änderungen kommen ungefragt | wie (a), plus Bruch, sobald diagram-js anders misst | Änderungen am Umbruch von Hand nachziehen; `vergleich.mjs` gegen das aktuelle bpmn-js zeigt sie |

## 6. Empfehlung

**(c): die Portierung mit Breitentabelle** als Messer des Pakets, mit der MIT-Zeile von diagram-js (Copyright (c) 2014-present Camunda Services GmbH) im Dateikopf. Dazu `tabelle.mjs` als Werkzeug, das die Tabelle für eine Schrift in Chromium erzeugt, und `vergleich.mjs`/`referenz.mjs` als Test gegen das jeweils gezeichnete bpmn-js (so wie `tests/capture-bpmn.mjs` heute die Fixtures erzeugt). (a) lohnt nicht als Zusatz im Browser: Es wäre dort exakt, aber je Rechner anders, und genau das soll das Paket vermeiden. (b) ist (c) mit mehr Gepäck.

**Zur Schriftfrage.** Die Messungen zeigen zwei getrennte Dinge: Der Algorithmus ist mit einer Tabelle exakt reproduzierbar (Abschnitt 4.1, 4.4), aber eine Tabelle gilt für **eine** Schrift, und bpmn-js zeichnet in der Systemschrift (hier Inter; auf Windows Segoe UI, auf macOS die Systemschrift, anderswo Roboto/Liberation). Mit der falschen Schrift ist der Fehler so groß wie heute mit `labelSize()` (4 von 57 Fixtures statt 1). Daraus folgt:

1. **Das Paket** legt eine Referenzschrift fest und liefert ihre Tabelle mit (nur Zahlen, keine Schriftdatei; die OFL erlaubt beides). Damit ist „gleiche Eingabe, gleiches Ergebnis“ überall erfüllt. Es sollte die Tabelle austauschbar machen (`messer(tabelle)`), damit ein Nutzer die Tabelle seiner Zeichenschrift erzeugen kann.
2. **Wer zeichnet, sollte in der Referenzschrift zeichnen**, sonst fallen Zeilenzahl und Breite beim Zeichnen anders aus als beim Layout (bpmn-js bricht beim Import und beim Zeichnen neu um, Abschnitt 2). Für dokufix heißt das: `BPMN_FONT` auf die Referenzschrift setzen und die Schrift per `@font-face` mitliefern, im Dokument wie im Export. Inter Regular ist als OTF 605 KB, als WOFF2 mit lateinischem Teil deutlich kleiner; das wäre nachzumessen, und es ist eine Entscheidung über die Größe von `dokufix.html` und die Optik der Seite, die ich nicht treffe. Ohne mitgelieferte Schrift bleibt das Layout überall gleich, aber die Zeichnung weicht auf Rechnern ohne die Schrift ab, in der Größenordnung der Zeile „gespeicherte Größen (anderer Rechner)“ oben.
3. Welche Schrift: Inter (OFL 1.1) ist hier die gezeichnete und hat mit 878 Kerning-Paaren die anspruchsvollere Tabelle; Liberation Sans (OFL 1.1) ist metrisch Arial und damit näher an dem, was `Arial, sans-serif` (die Vorgabe von bpmn-js) auf vielen Rechnern zeichnet, ohne dass die Schrift mitgeliefert ist. Beides geht mit demselben Werkzeug.

## 7. Was gemessen ist und was nicht

Gemessen: alles in Abschnitt 4, in Chromium 141 und Node in diesem Container, mit bpmn-js 18.31.0 (CDN-Spiegel) und den npm-Quellen 18.31.0/15.28.0. Die Versionsaussagen stammen aus `npm view` und aus den gepackten Fassungen 14.0.0, 15.0.0, 15.10.0, 15.11.0, 15.12.0, 15.15.0, 15.17.0–15.27.0, 15.27.3, 15.28.0 (15.27.1 und 15.27.2 nicht gepackt; der Wechsel der Passbedingung liegt in einer von dreien).

Nicht gemessen:

- **Andere Browser und andere Rechner.** Ob `canvas.measureText` in Firefox oder WebKit mit derselben Schrift dieselben Bruchteile liefert, und wie weit die Zeichnung in Segoe UI oder der macOS-Systemschrift vom Layout mit einer Inter-Tabelle abweicht. Einziger Anhaltspunkt: die gespeicherten Fixtures des anderen Rechners (4 von 57 gleich).
- **Ältere bpmn-js** (diagram-js < 15.12.0, `getBBox` mit `width + 2x`): Ob deren Größen von denen der Canvas-Messung abweichen.
- **CJK und Emoji** sind nur über Rückfallbreiten abgedeckt (1 Fehler in 572); Kerning außerhalb der 82 Paarzeichen (typografische Anführungszeichen) fehlt in der Tabelle. Beides ließe sich durch eine größere Tabelle beheben.
- **Die Größe einer mitgelieferten Schriftdatei** (WOFF2-Teilmenge) und die Wirkung auf `dist/dokufix.html`.
- Die Zeichnung selbst (SVG-Pixel) habe ich nicht verglichen, nur die Größen, die `labelMeasurer()` liefert, und das daraus angeordnete XML.

## 8. Dateien

Alle Skripte laufen mit `cd spikes/lmm/diagram-js && node <skript>`; die Browser-Skripte brauchen `dist/dokufix.html`, den CDN-Spiegel und `/opt/pw-browsers/chromium`. Fremder Code (npm-Pakete) liegt außerhalb des Repositorys im Vendor-Ordner des Scratchpads (`…/scratchpad/diagramjs-vendor/<paket>/package/`, je Paket ein Ordner; keine Installationsskripte ausgeführt) und wird nur importiert oder per esbuild gebündelt. Nichts in `src/`, `tests/`, `docs/`, `dist/` ist geändert.

| Datei | Browser | Was |
|---|---|---|
| `messer.mjs` | nein | **Der Prototyp (c)**: `messer(tabelle)`, `layoutText()`, `breitenFunktion()`; MIT-Hinweis im Kopf |
| `korpus.mjs` | nein | der Korpus: Fixture-Texte plus `HEIKEL` |
| `browser.mjs` | – | Seite in Chromium mit den Bündeln `window.dokufixCapture` (aus `src/app/bpmn.js`) und `window.vendorText` (TextRenderer, Text aus dem Vendor-Ordner) |
| `referenz.mjs` → `referenz-chromium.json` | ja | Referenz `labelMeasurer(viewer)`, Varianten (a1), (a2), Schriftauflösung |
| `tabelle.mjs` → `breiten-inter-12px.json`, `breiten-liberation-sans-12px.json`, `korpus-breiten-chromium.json` | ja | Breitentabellen und Kerning; `measureText` jedes Korpustexts |
| `vergleich.mjs` → `ergebnisse.json` | nein | Abschnitt 4.1 und 4.2 |
| `variante-b.mjs` → `variante-b.json` | nein | Variante (b): echtes `Text.js` in Node mit ersetztem Canvas |
| `layout.mjs` → `layout.json` | nein | Abschnitt 4.3; braucht `sizes-hier/` im Scratchpad aus `tests/capture-bpmn.mjs --out` |
| `gleichheit.mjs` | ja | Abschnitt 4.4 |
