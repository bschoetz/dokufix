# Audit der Suchfunktion im Viewer

Code-Audit der Suche in der Leseansicht: die drei Module `src/app/search.js`, `src/app/search-match.js` und `src/app/search-places.js`, ihr Stylesheet `src/search.css`, die beiden Aufrufer `src/app.js` und `src/reader.js` sowie die Nachbarmodule, auf die die Suche zugreift (Tabellenfilter, Facettenfilter, Großansicht, Inhaltsverzeichnis, Diagramme, Export `schlank`).
Stand 4. Oktober 2026, Commit `3a0e014`. Alle Zeilenangaben beziehen sich auf diesen Stand. Der Audit hat nichts am Code geändert; die Befunde sind Vorschläge.

## Ergebnis in Kürze

- **Kein Fehler in der Trefferlogik.** Was die Suche findet, stimmt mit dem Dokument überein, auch bei Groß- und Kleinschreibung mit Längenänderung (`İ`, `ẞ`), bei Zeichen außerhalb der BMP, beim leichten Fuzzy über Knotengrenzen und bei Treffern über Zellgrenzen. Die 624 Tests von `npm test` und `npm run check` laufen grün.
- **Keine Sicherheitslücke.** Das Panel baut alles mit `createElement` und `textContent`; der Text des Dokuments erreicht es nie als HTML. Die Hervorhebung läuft über die CSS Custom Highlight API und verändert keinen Knoten des Dokuments. Beides sichern Tests ab.
- **Drei Befunde mittlerer Schwere**, alle im Browser reproduziert: eine stille Wartefalle, wenn ein Dokument im Editor das Markup eines gepackten Diagramms enthält; der Fokus geht beim Schließen des Panels verloren; die feste ID `search-input` kollidiert mit dem Anker einer Überschrift „Search Input".
- **Acht Befunde niedriger Schwere**: rohes HTML wird nicht durchsucht, Zeilen lesen auch `style` und `svg`, keine Tastaturführung im Panel, dünne Semantik der Ergebnisliste, Laufzeit bei großen Dokumenten, knapper Spielraum im Reader-Bundle, Regex-Tests auf den Quelltext statt auf das Verhalten, ein Randfall bei Facettentabellen in geschlossenen `<details>`.
- **Messung:** Bei 284 KB Markdown mit 1600 gefundenen Stellen dauert eine Suche 450 bis 560 ms inklusive der Tipp-Pause von 150 ms, also 300 bis 400 ms Rechenzeit auf dem Hauptthread.

## Vorgehen

1. **Lesen.** Die drei Suchmodule vollständig, dazu `src/search.css`, `src/app.js`, `src/reader.js`, `src/app/filter.js`, `src/app/facets.js`, `src/app/large-view.js`, `src/app/transient.js`, `src/app/toc.js` (Überschriften und Slugs), `src/app/render.js`, `src/app/downloads/readonly-slim.js` und `readonly-compact.js`, die Abschnitte *Search* und *Keys and events* der `src/README.md`, die Facetten- und Filterregeln in `src/doc.css`, und `tests/search.test.mjs` ganz.
2. **Prüfen.** `npm ci`, dann `npm test` (624 Tests, alle grün) und `npm run check` (Build aktuell, Stilprüfung grün, ESLint ohne Befund).
3. **Sondieren.** Fünf Playwright-Läufe in Chromium (Playwright 1.63, Chromium aus `/opt/pw-browsers`) gegen `dist/dokufix.html`, die Bibliotheken wie in den Browserläufen über `tests/cdn.mjs` lokal bedient. Jeder Lauf setzt einen Quelltext in `#source`, wechselt per `#view-btn` in den Lesemodus, öffnet das Panel mit `/` oder der Lupe und liest Zusammenfassung, Ergebnisliste, `CSS.highlights` und `document.activeElement`. Die Läufe sind unter *Sonden* beschrieben, so dass sie sich nachstellen lassen.

## Aufbau der Suche, wie ich ihn vorgefunden habe

| Modul | Aufgabe | Rein |
|---|---|---|
| `search-match.js` | `findHits()`: Trefferbereiche eines Terms im Text einer Stelle, nicht überlappend; `tooShort()`: Mindestlänge; `excerpt()`: der Ausschnitt eines Ergebnisses | ja, Strings rein, Zahlen raus |
| `search-places.js` | `collectPlaces()`: die Stellen unter dem Root mit Text, Abbildung auf Textknoten (`map`) und Art (`kind`); `nodeRanges()`: Trefferbereiche als Knotenbereiche; `groupResults()`: Ergebnisse unter den Überschriften H2 bis H4 | ja, liest den Root und ändert nichts |
| `search.js` | Panel, Lupe, Taste `/`, Escape, Warten auf den Decoder von `schlank`, Hervorhebung, Neusuche bei Filteränderung | nein, baut Panel und Lupe in `<body>` |

Der Fluss einer Suche: `input` im Feld → 150 ms Pause → `search()` liest den Root mit `collectPlaces()`, vergleicht jede Stelle mit `findHits()`, gruppiert mit `groupResults()`, baut die Liste neu und zeichnet eine `Highlight` aus `StaticRange`-Objekten über `nodeRanges()`. Ein Klick auf ein Ergebnis scrollt zur Stelle; eine Zeile, die ein Filter ausblendet, zur Filtersteuerung; ein Codeblock oder das Metadaten-Panel zum ersten Treffer.

Die Entwurfsentscheidungen, die der Audit als gegeben nimmt, weil die README sie begründet: Treffer in Diagrammen werden nicht hervorgehoben; die Art einer Stelle („Tabelle: ") ist kein Text der Stelle; die Suche kennt keinen Modus und fragt ihren Aufrufer; Escape schließt genau eine Sache in der dokumentierten Reihenfolge.

## Befunde

Jeder Befund nennt Ort, Beobachtung, Nachweis und Vorschlag. Schwere: *mittel* heißt, ein Leser oder Autor stößt in normalem Gebrauch darauf und bekommt keine Erklärung; *niedrig* heißt Randfall, Komfort oder Wartbarkeit.

### M1: Stille Wartefalle bei `data-gz` (mittel)

**Ort:** `src/app/search.js:337`, `search()`:

```js
if (!unpacked && root && root.querySelector(PACKED_SEL)) return;
```

**Beobachtung.** `unpacked` wird nur durch das Ereignis `dokufix-diagrams-unpacked` auf `true` gesetzt (`search.js:501` bis `504`, Listener mit `once: true`). Dieses Ereignis sendet allein der Decoder einer `schlank`-Datei (`src/app/downloads/readonly-slim.js:47`). Im Editor, in `Mit Editor` und in `kompakt` gibt es keinen Decoder, also auch nie das Ereignis. Steht dort ein Element `.dokufix-diagram-svg[data-gz]` im Root, kehrt `search()` vor allem anderen zurück: keine Ergebnisse, keine Zusammenfassung, kein Fehler auf der Konsole. Ein Autor erzeugt das Element mit einer Zeile rohem HTML im Markdown; marked reicht es durch, kein Pass entfernt es.

In `schlank` selbst ist das Warten richtig, aber stumm: Wer tippt, bevor der Decoder fertig ist, sieht ein leeres Panel ohne Hinweis. Bei vielen Diagrammen dauert das Entpacken sichtbar lange.

**Nachweis.** Sonde 2: Quelltext `<div class="dokufix-diagram-svg" data-gz="AAAA"></div>` und ein Absatz mit „Zitronenfalter". Nach 1,5 s: Zusammenfassung leer, 0 Ergebnisse, `#preview` enthält das gepackte Element.

**Vorschlag.** Zwei Teile. Erstens soll die Suche nur warten, wenn ein Decoder läuft: der Aufrufer kann es sagen (`registerSearch({ waitForUnpack: true })` aus `reader.js` nur, wenn die Datei den Decoder trägt; der Decoder könnte dazu ein Attribut am `<main>` setzen), oder die Suche wartet nur, wenn ein `<script>` mit dem Decoder im Dokument steht. Zweitens soll das Warten eine Statuszeile zeigen, etwa „Diagramme werden entpackt …" in `.search-summary`, damit das leere Panel erklärt ist. Ein Timeout wäre ein dritter Weg, aber ein schwächerer: Er rät, statt zu wissen.

### M2: Fokus geht beim Schließen verloren (mittel)

**Ort:** `src/app/search.js:470`, `closeSearch()`:

```js
if (hadFocus) document.activeElement.blur();
```

**Beobachtung.** Schließt der Leser das Panel mit Escape oder „×", während der Fokus darin liegt, landet der Fokus auf `<body>`. Wer mit der Tastatur arbeitet, muss von vorn tabben; ein Screenreader verliert die Position im Dokument. Üblich ist die Rückkehr zum Element, das das Panel geöffnet hat (die Lupe), oder zur zuletzt angesprungenen Stelle, wenn ein Ergebnis geklickt wurde.

**Nachweis.** Sonde 4: Panel per Lupe geöffnet, Term eingegeben, Escape. Danach `document.activeElement.tagName === 'BODY'`, Panel `hidden`, Lesemodus bleibt, Hervorhebung ist weg. Die beiden letzten Punkte sind korrekt.

**Vorschlag.** Beim Öffnen das Element merken, das den Fokus hatte (`document.activeElement` in `openSearch()`), und beim Schließen dorthin zurückkehren, wenn es noch im Dokument steht; sonst zur Lupe. Hat der Leser zuletzt ein Ergebnis geklickt, ist die angesprungene Stelle das bessere Ziel; sie ist kein fokussierbares Element, aber ein `tabindex="-1"` nur für den Moment des Fokussierens ist in `nur-lesen` nicht nötig, weil es dort keine Suche gibt, und im Lesemodus unschädlich, weil die Suche das Dokument ohnehin nur liest. Falls das als Eingriff ins Dokument gilt, bleibt die Lupe als Ziel.

### M3: Feste ID `search-input` kollidiert mit Überschriften (mittel)

**Ort:** `src/app/search.js:389` (`label.htmlFor = 'search-input'`) und `:401` (`input.id = 'search-input'`).

**Beobachtung.** `slugify()` in `src/app/toc.js:26` macht aus der Überschrift „Search Input" den Anker `search-input`. Dann stehen zwei Elemente mit dieser ID in der Seite, die Überschrift zuerst in der Dokumentreihenfolge, weil das Panel am Ende von `<body>` hängt. `document.getElementById('search-input')` liefert die H1, `label.control` ist `null`: Ein Klick auf die Beschriftung fokussiert das Feld nicht, und die Zuordnung von Beschriftung und Feld für Hilfstechnik ist weg. Die Suche selbst funktioniert, weil `search.js` sein Feld über die Variable `input` hält.

Die README weiß um dasselbe Muster bei den IDs `p`, `f` und `d` der `kompakt`-Datei („an element of the document could carry the same id"); für die Suche ist es nicht vermerkt.

**Nachweis.** Sonde 3: Quelltext `# Search Input`. Nach dem Öffnen des Panels: `[id="search-input"]` liefert `['H1', 'INPUT']`, `getElementById` die H1, `label.control` ist `null`.

**Vorschlag.** Entweder eine ID mit Präfix, die kein Slug erzeugt, zum Beispiel `dokufix-search-input` (Slugs enthalten nur `[\w-]`, also wäre auch das erreichbar; sicher ist ein Zeichen, das `slugify()` entfernt, oder ein Präfix wie `dokufix:search`, da `:` aus dem Slug fällt), oder das Feld in das `<label>` legen, dann braucht es keine ID. Der zweite Weg ist der robustere und ändert das Markup des Panels nur um eine Verschachtelung.

### N1: Rohes HTML wird nicht durchsucht (niedrig)

**Ort:** `src/app/search-places.js:97`:

```js
const PLACE_TAGS = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
```

**Beobachtung.** Eine Stelle ist ein Absatz, ein Listenpunkt, eine Überschrift, eine Tabellenzeile, ein `pre`, eine Diagrammfigur oder das Metadaten-Panel. Text, der direkt in einem anderen Blockelement steht, ist für die Suche unsichtbar: `div`, `dl` mit `dt` und `dd`, `summary` eines Autoren-`details`, `figcaption`, ein nacktes `blockquote` ohne `p`, `address`, `center`, und der `alt`-Text eines Bildes. Aus Markdown entsteht so etwas nicht, aus rohem HTML im Markdown schon, und die README ermutigt zu rohem HTML (Markierungen in Kommentaren, `<details>`).

**Nachweis.** Sonde 5a: sechs solche Stellen mit „Zitronenfalter" plus ein normaler Absatz. Gefunden: 2 Treffer an 2 Stellen, nämlich der Absatz im `<details>` (ein Markdown-Absatz, also ein `p`) und der normale Absatz. Nicht gefunden: `div`, `dt`, `summary`, `blockquote`, `figcaption`, `alt`.

**Vorschlag.** Mindestens die README unter *What a place is* um den Satz ergänzen, dass Text direkt in anderen Blockelementen keine Stelle ist. Besser: eine Auffangregel in `collectPlaces()`, die ein Blockelement, das keine Stelle ist und keine enthält, aber Textknoten hat, als Stelle liest (mit `blockText()`, das Unterstellen schon auslässt). `dl`, `summary` und `figcaption` wären damit abgedeckt, `alt` bliebe bewusst außen vor.

### N2: Zeilen lesen auch `style`, `script` und `svg` (niedrig)

**Ort:** `src/app/search-places.js:240`, `rowReading()`.

**Beobachtung.** `blockText()` und `ownReading()` lassen die Tags aus `EXCLUDED_TAGS` (`SVG`, `SCRIPT`, `STYLE`, `TEMPLATE`) aus, `rowReading()` nicht. Das ist Absicht: `rowReading()` spiegelt `filterRowText()` aus `filter.js:78` Regel für Regel, und `tests/search.test.mjs` hält beide zusammen. Die Folge ist, dass ein `<svg><text>…</text></svg>` oder ein `<style>` in einer Zelle in beiden als Zeilentext zählt: Die Suche findet CSS-Text, der Filter auch.

**Vorschlag.** Nichts ändern oder beides zugleich: `EXCLUDED_TAGS` in `filterRowText()` und `rowReading()` auslassen und den gemeinsamen Test anpassen. Ein Markdown-Autor schreibt so etwas kaum; die Stelle ist eher für die Konsistenzprüfung notiert.

### N3: Keine Tastaturführung im Panel (niedrig)

**Ort:** `src/app/search.js`, `buildPanel()`.

**Beobachtung.** Enter im Feld tut nichts, Pfeil-ab tut nichts. Das erste Ergebnis ist drei Tabs entfernt, weil die beiden Schalter in der Tab-Reihenfolge zwischen Feld und Liste liegen. Für einen Leser, der tippt und zum ersten Treffer will, sind das vier Tastendrücke statt einem.

**Nachweis.** Sonde 5b: Enter lässt den Fokus im Feld und `scrollY` bei 0; Pfeil-ab ebenso; nach drei Tabs liegt der Fokus auf dem ersten `.search-result`.

**Vorschlag.** Enter im Feld klickt das erste Ergebnis; Pfeil-ab im Feld fokussiert das erste Ergebnis, Pfeil-ab und Pfeil-auf in der Liste gehen weiter; `Escape` bleibt wie es ist. Ergänzend `enterkeyhint="go"` am Feld. Diese Tasten gehören dann in die Tabelle *Keys and events* der README.

### N4: Semantik der Ergebnisliste (niedrig)

**Ort:** `src/app/search.js`, `groupItem()`; `src/search.css`, `.search-results`.

**Beobachtung.** Die Gruppenköpfe sind `div`-Elemente ohne Rolle, nicht Überschriften; ein Screenreader kann nicht nach Abschnitten springen. `.search-results` ist ein `ol` mit `list-style:none`; Safari und VoiceOver lassen dann die Listensemantik fallen, der Leser hört nicht „Liste, 12 Einträge". Die Zusammenfassung hat `role="status"` und ist damit gut gelöst; das Panel hat `role="search"` und einen Namen.

**Vorschlag.** Gruppenkopf als `h3`/`h4` nach Ebene, oder `role="heading"` mit `aria-level`; `role="list"` auf `.search-results` und `.search-group-list`, was die Semantik trotz `list-style:none` erhält. Keine Änderung am Aussehen.

### N5: Laufzeit bei großen Dokumenten (niedrig)

**Ort:** `src/app/search.js:345` (`collectPlaces()` je Suche), `src/app/search-places.js:464` (`groupResults()` läuft durch jedes Element des Roots, auch durch jedes SVG-Innere), `src/app/search-match.js:52` (`toLocaleLowerCase('de')` pro Codepunkt).

**Beobachtung.** Jede Suche liest das Dokument neu, auch wenn sich seit der letzten nichts geändert hat. Der Vergleich senkt jeden Codepunkt einzeln, damit die Abbildung auf den Originaltext bei Längenänderungen stimmt. Das ist korrekt, aber bei langem Text teuer, weil jeder Aufruf ICU durchläuft.

**Nachweis.** Sonde 1, Chromium, 284 187 Zeichen Markdown, 400 Abschnitte mit je einem Absatz, einer Liste, einer Tabelle und einem Unterabschnitt:

| Suche | Dauer, inklusive der Pause von 150 ms | Ergebnis |
|---|---|---|
| erste Suche nach einem Begriff in 1600 Stellen | 483 ms | 1600 Treffer an 1600 Stellen, 1600 Bereiche hervorgehoben |
| zweite Suche im offenen Panel | 447 ms | 400 Treffer |
| Begriff in jedem Absatz | 558 ms | 4400 Treffer an 1600 Stellen in 800 Abschnitten, 1600 Ergebnisknöpfe |
| 3000 Treffer in einem einzigen Absatz | 182 ms | 3000 Treffer an 1 Stelle, 23 Marken im Ausschnitt, 3000 Bereiche hervorgehoben |

Für den PoC ist das in Ordnung; die Pause von 150 ms fängt schnelles Tippen ab. Die Hauptthread-Blockade von 300 bis 400 ms je Suche ist aber bei jedem Buchstaben spürbar, sobald ein Dokument diese Größe hat.

**Vorschlag,** in der Reihenfolge des Nutzens: (1) Die Stellen pro Render zwischenspeichern: Der Lesemodus ändert das Dokument nicht, nur ein Render ersetzt es, und das kann den Speicher leeren (im Editor über den vorhandenen `MutationObserver` auf `<body>` oder eine Funktion, die `render.js` nicht kennen muss, etwa ein Ereignis auf dem Root). Die Filterklassen und das Ausblenden lesen `rowHidden()` ohnehin zur Laufzeit. (2) `groupResults()` soll Figuren, `pre` und das Metadaten-Panel nicht betreten; sie enthalten keine Gruppenüberschriften. (3) `compared()` senkt den ganzen Text einmal und bildet nur dann zeichenweise ab, wenn die Länge sich geändert hat; im Normalfall deutscher Texte ändert sie sich nicht.

### N6: Spielraum im Reader-Bundle (niedrig)

**Ort:** `tests/build.test.mjs:463`: `code.length < 25000`.

**Beobachtung.** Das Bundle hat 24 251 Zeichen (aus `dist/dokufix.html` gelesen, Block `#dokufix-reader-js`). Es bleiben 749 Zeichen. Die Vorschläge M1 bis N5 kosten jeder einige hundert Zeichen; N3 und N5 (1) zusammen überschreiten die Grenze.

**Vorschlag.** Vor der nächsten Story im Bundle die Grenze bewusst anheben und in der README unter *In `schlank` und `kompakt`* fortschreiben, wie es die Story 2.10 getan hat. Die Grenze schützt vor Wildwuchs, nicht vor Wachstum.

### N7: Tests auf den Quelltext statt auf das Verhalten (niedrig)

**Ort:** `tests/search.test.mjs`, unter anderem die Tests ab Zeile 226 (`a diagram's result scrolls …`), 337 (`a click on the result of the metadata panel …`), 449 bis 500 (`the sources`).

**Beobachtung.** `npm test` deckt `search-match.js` und `search-places.js` gründlich ab. `search.js` wird dort nur durch reguläre Ausdrücke auf den Quelltext geprüft: dass eine bestimmte Zeile so dasteht. Das bricht bei jeder Umformulierung, auch bei einer gleichwertigen, und prüft nicht, was die Zeile tut. Das Verhalten des Panels steckt allein in `tests/vergleich.mjs`, das Chromium und Firefox braucht und mehrere Minuten läuft.

**Vorschlag.** `search.js` nutzt `document` und `window` nur innerhalb von Funktionen, nicht beim Laden. Mit linkedom und zwei Shims (`CSS.highlights` und `Highlight` als Map und Set, `getClientRects` als leere Liste) ließe sich `registerSearch()` in Node aufrufen und das Panel prüfen: Pause, Zusammenfassung, Gruppen, „(ausgeblendet)", die Wartefalle aus M1, der Fokus aus M2. Die Regex-Tests könnten dann wegfallen.

### N8: Facettentabelle in einem geschlossenen `<details>` (niedrig)

**Ort:** `src/app/search.js:203`, `rowHidden()`, und `controlsOf()` ab `:210`.

**Beobachtung.** Eine Zeile einer Facettentabelle gilt als ausgeblendet, wenn sie keine Box hat. Steht die ganze Tabelle in einem geschlossenen Autoren-`<details>`, hat jede Zeile keine Box: Jedes Ergebnis trägt „(ausgeblendet)", und der Klick zielt auf die Facettenleiste, die ebenso keine Box hat; `scrollIntoView()` tut dann nichts. Die README beschreibt den Fall für Zeilen außerhalb einer Facettentabelle („counts as shown"), für Facettentabellen nicht.

**Vorschlag.** `rowHidden()` kann prüfen, ob das Facettengruppe selbst eine Box hat; ohne Box ist nicht der Filter die Ursache. Der Klick könnte, wie `centreHit()` es für das Metadaten-Panel tut, ein geschlossenes `<details>` auf dem Weg öffnen. Beides ist ein Randfall; die Notiz in der README reicht auch.

## Beobachtungen ohne Handlungsdruck

- **Gedankenstrich.** Das leichte Fuzzy ignoriert `-`, U+2010, U+2011 und U+00AD, nicht den Gedankenstrich U+2013, den deutsche Typografie als „Status – Chip" setzt. So in FR46 festgelegt; wer das erweitert, ändert `IGNORED` in `search-match.js:41` und `LINE_JOINED` in `search-places.js` zusammen.
- **Schluss-Sigma.** Das zeichenweise Senken kennt keinen Kontext: `Σ` wird zu `σ`, nie zu `ς`. Term und Text werden gleich behandelt, also ist es konsistent; ein getipptes `ς` findet aber kein `Σ`. Für deutsche Dokumente ohne Belang.
- **Alte Bereiche nach einem Render.** Ersetzt ein Render die Knoten, zeigen die `StaticRange`-Objekte der Hervorhebung bis zur nächsten Suche auf Knoten, die nicht mehr im Dokument sind; sie zeichnen nichts. Im Lesemodus löst nichts ein Render aus, und ein Klick auf ein Ergebnis sucht neu. Dokumentiert.
- **`typesText()` und `:not()` mit Selektorliste** (`search.js:475`): braucht Selectors Level 4, in Chromium 88, Firefox 84 und Safari 9 vorhanden, also innerhalb von NFR7.
- **`toLocaleLowerCase('de')`** wird in `filter.js` und `search-match.js` gleich benutzt. Die beiden Vergleiche bleiben so deckungsgleich, bis die Story 5.11 den Filter auf `findHits()` umstellt.
- **Reihenfolge von `/`.** Der Handler fragt die Großansicht vor dem Lesemodus und verhindert in beiden Modi die Schnellsuche von Firefox über einer offenen Großansicht. Das ist absichtlich und in der README beschrieben.

## Was gut gelöst ist

- **Trennung.** Zwei reine Module, ein Modul mit Seiteneffekten; das Panel kennt keinen Modus und kein Element der Seite, sondern bekommt Root und Prädikat vom Aufrufer. `render.js`, `frontmatter.js`, `diagrams.js` und `filter.js` wissen nichts von der Suche, und Tests sichern das.
- **Abbildung auf den Originaltext.** `compared()` merkt sich für jede verglichene Einheit das Zeichen, aus dem sie stammt; `reading()` und `finish()` merken sich für jede Einheit des Stellentexts Knoten, Offset und Teil. Beide Abbildungen entstehen im selben Durchlauf wie der Text, so dass sie nicht auseinanderlaufen können. Treffer über `İ`, `ẞ`, Surrogatpaare, Emphase, Fußnotenmarken, Chips und Zellgrenzen kommen richtig heraus; die Tests decken jeden dieser Fälle ab.
- **Dokument unberührt.** Keine Klasse, kein Attribut, kein `<mark>` im Dokument; eine Datei, die bei offenem Panel gespeichert oder exportiert wird, ist dieselbe wie ohne Panel. `tests/speichern.mjs` prüft das byteweise.
- **Fehlertoleranz.** Ein Fehler in der Suche landet in `.search-summary` und auf der Konsole und bricht kein Render; ein Fehler beim Hervorheben nimmt die Hervorhebung weg und lässt die Liste stehen.
- **Scrollen.** `centreHit()` scrollt das Fenster. Das stimmt, weil `#preview` im Lesemodus `overflow:visible` hat (`src/app.css:372` bis `377`); in den Exporten scrollt ohnehin das Fenster. Ein Codeblock wird vorher seitwärts zum Treffer gescrollt.
- **Schichtung.** Fußnotenvorschau z-index 20, Schiene 40, Lupe 42, Panel 45, „Editor ↩" 50, Großansicht 100. Nichts Unbeabsichtigtes liegt über dem Panel; die Lizenzansicht mit 60 steht nur in der Werkzeugleiste, die der Lesemodus ausblendet.
- **Escape.** Eine Taste schließt eine Sache, in der Reihenfolge Großansicht, Panel, Filterfeld mit Text, Download-Menü, Lesemodus. Die Reihenfolge folgt aus Phase und Ziel der Listener und ist in der README begründet; `tests/vergleich.mjs` prüft sie in drei Dateiarten.

## Sonden

Die fünf Läufe, so dass sie sich mit `playwright-core` aus `node_modules` und dem Chromium unter `/opt/pw-browsers` nachstellen lassen. Gemeinsamer Rahmen: `prepareLibraries(dist/dokufix.html)` aus `tests/cdn.mjs`, dann `libraries.serve(context)` auf einem Browser-Kontext von 1400 × 900 px; die Seite per `file:`-URL laden, warten bis `marked` da ist, den Quelltext in `#source` setzen und `input` auslösen, `#view-btn` per Skript klicken (der Knopf ist in diesem Viewport im Menü und für Playwright nicht sichtbar), warten bis `body.mode-view` steht.

1. **Große Dokumente.** 400 Abschnitte, jeder mit H2, einem Absatz mit dreimal „Zitronenfalter", einer Liste, einer Tabelle mit „Zitronenfalter" und „Hirschkäfer" und einem H3 mit einem Absatz ohne den Begriff. `/`, dann `fill('#search-input', 'zitronenfalter')`, Zeit bis `.search-summary` nicht mehr leer ist; danach `hirschkäfer` und `absatz` im offenen Panel. Zusätzlich `CSS.highlights.get('search-hit').size` und die Zahl der `.search-result`. Ergebnisse in N5.
2. **Wartefalle.** Quelltext mit `<div class="dokufix-diagram-svg" data-gz="AAAA"></div>` und einem Absatz mit „Zitronenfalter"; nach dem Tippen 1,5 s warten; Zusammenfassung und Ergebniszahl lesen. Ergebnis in M1.
3. **ID-Kollision.** Quelltext `# Search Input`; nach dem Öffnen alle `[id="search-input"]`, `getElementById('search-input').tagName` und `label.control` lesen. Ergebnis in M3.
4. **Fokus.** Panel per Klick auf `.search-magnifier` öffnen, Term tippen, Escape; `document.activeElement.tagName`, `panel.hidden`, `body.mode-view`, `CSS.highlights.has('search-hit')` lesen. Ergebnis in M2.
5. **Rohes HTML und Tasten.** (a) Quelltext mit `div`, `dl`, `details`/`summary` mit einem Markdown-Absatz darin, nacktem `blockquote`, `figure` mit `alt` und `figcaption`, dazu ein normaler Absatz, alle mit „Zitronenfalter"; Zusammenfassung und Ergebnistexte lesen. (b) Zwei Absätze; nach dem Tippen Enter, Pfeil-ab, dreimal Tab; jeweils `document.activeElement` lesen. Ergebnisse in N1 und N3.

Die Skripte liegen nicht im Repo; sie wären als `tests/`-Sonden mit etwa 120 Zeilen nachzubauen, falls sie dauerhaft gebraucht werden.

## Empfohlene Reihenfolge

1. M3, die ID: kleinste Änderung, klarer Gewinn, kein Risiko.
2. M2, der Fokus: zwei Zeilen in `openSearch()` und `closeSearch()`.
3. M1, die Wartefalle: zuerst die Statuszeile, dann die Bedingung fürs Warten.
4. N6 vor jeder weiteren Story im Bundle.
5. N3 und N4 zusammen als eine Story zur Bedienbarkeit des Panels.
6. N5 (1), der Zwischenspeicher, sobald Dokumente der Größenordnung aus Sonde 1 vorkommen.
7. N1, N2, N7, N8 nach Gelegenheit; N1 mindestens als Satz in der README.
