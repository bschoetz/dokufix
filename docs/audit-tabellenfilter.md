# Audit der Tabellenfilter

Code-Audit der beiden Tabellenfilter: der Freitextfilter `src/app/filter.js` und der Facettenfilter `src/app/facets.js`, ihr Zusammenspiel, dazu `src/app/tables.js` (der Wrapper), die Regeln in `src/doc.css`, die Reihenfolge der Passes in `src/app/render.js`, das Reader-Bundle `src/reader.js` und die Exportschritte in `src/app/downloads/`.
Stand 4. Oktober 2026, Commit `6eb0b39`. Alle Zeilenangaben beziehen sich auf diesen Stand. Der Audit hat nichts am Code geändert; die Befunde sind Vorschläge.

## Ergebnis in Kürze

- **Kein schwerer Fehler.** Ausblenden, Zähler, Zusammenspiel mit dem Facettenfilter, Escape-Reihenfolge und Exportschritte tun, was die README beschreibt. `npm test` läuft grün (631 Tests), darunter die 86 von `tests/filter.test.mjs`, `tests/facets.test.mjs` und `tests/tables.test.mjs`.
- **Keine Sicherheitslücke.** Feld, Zähler und Steuerelemente entstehen mit `createElement`, `setAttribute` und `textContent`; Platzhalter, Überschriften und Zellwerte erreichen die Seite nie als HTML.
- **Ein Befund mittlerer Schwere:** Zeichen, die gleich aussehen, aber anders kodiert sind (zerlegte Umlaute, weiches Trennzeichen, Nullbreitenzeichen), passen nicht zusammen. Der Leser sieht das Wort in der Tabelle und bekommt „0 von 14 Zeilen“.
- **Fünf Befunde niedriger Schwere:** Escape während einer IME-Komposition, Block-Elemente in einer Zelle ohne Trenner, `rowspan` verschiebt beim Ausblenden die Spalten, Laufzeit bei großen Tabellen, doppelt gepflegtes Klassenformat des Facettenschlüssels.
- **Bestehende Doku:** fünf kleine Ungenauigkeiten in der `src/README.md`, gesammelt am Ende.

## Vorgehen

1. **Lesen.** `src/app/filter.js`, `src/app/facets.js` und `src/app/tables.js` vollständig, dazu die Regeln der Tabellen, Facetten und des Freitextfilters in `src/doc.css`, `src/app/render.js` (Reihenfolge der Passes), `src/reader.js`, `src/app/footnotes.js` (wo die Vorschau einer Fußnote steht), `rowReading()` in `src/app/search-places.js`, `src/app/search-match.js`, die Escape-Handler in `src/app/search.js`, `src/app/large-view.js`, `src/app/editor.js` und `src/app/downloads/menu.js`, `applyMarkerList()` in `src/app/markers.js`, die Abschnitte *Tables*, *Search* und *Keys and events* der `src/README.md` und `tests/filter.test.mjs`.
2. **Prüfen.** `npm ci`, dann `npm test` (631 Tests, alle grün).
3. **Sondieren.** Ein Node-Skript gegen `linkedom` aus `node_modules`, das `filterMatches()`, `filterRowText()` und `applyFilter()` direkt aufruft. Kein Browserlauf. Die Fälle stehen unter *Sonde*, so dass sie sich nachstellen lassen.
4. **Gegenlesen.** Ein zweiter, unabhängiger Durchgang hat jede Zeilenangabe, jedes Zitat und jede Aussage über die README gegen den Code geprüft und die Sonden M1, N2 und die doppelte Auslösung (Beobachtungen) selbst nachgestellt. Seine Korrekturen sind eingearbeitet.

## Aufbau, wie ich ihn vorgefunden habe

| Modul | Aufgabe | Rein |
|---|---|---|
| `facets.js` | `buildFacets()`: Steuerelemente über der Tabelle, Schlüsselklasse an jeder Datenzeile; `rowsOf()`: Kopf- und Datenzeilen einer Tabelle, auch für den Freitextfilter; `isFootnoteMarker()` | ja, arbeitet auf der übergebenen Tabelle |
| `filter.js` | `markFilter()`: markiert die Tabelle im Dokument; `filterRowText()`, `filterMatches()`, `filterCountText()`: Text einer Zeile, Vergleich, Zähler; `attachTableFilters()`: der Laufzeit-Pass mit Feld und Listenern; `showFilteredRows()`, `removeFilterMarks()`: Exportschritte | bis auf die Listener ja |
| `tables.js` | `buildTables()`: Wrapper um jede Tabelle, Klasse der Unterzeile | ja |
| `src/doc.css` | blendet Facetten per `:has()` aus, eine feste Regel je Schlüssel 1 bis 32; blendet `dokufix-filter-out` aus; beides nur `@media not print` | — |

Der Fluss: `input` im Feld oder `change` in der Facettengruppe → `applyFilter()` liest für jede Datenzeile den Text mit `filterRowText()`, vergleicht mit `filterMatches()`, setzt oder entfernt `dokufix-filter-out` und zählt die Zeilen, die zum Term passen und die gewählte Facette tragen. Den gewählten Facettenschlüssel liest `chosenFacetKey()` aus der Eigenschaft `checked` der Radiobuttons.

Eine Kopplung, die jede Änderung am Zeilentext betrifft: Die Suche liest eine Tabellenzeile mit `rowReading()` (`src/app/search-places.js:240`), das `filterRowText()` Regel für Regel spiegelt. `tests/search.test.mjs:574` verlangt, dass beide denselben Text ergeben. Wer `filterRowText()` ändert, ändert `rowReading()` mit.

Die Entwurfsentscheidungen, die der Audit als gegeben nimmt, weil die README sie festhält: Feld nur, wo ein Skript läuft (Ausnahme zu NFR1 und NFR2); Feld über dem Wrapper, nicht darin; ein Term trifft auch über Zellgrenzen („`ort text` finds a row whose first two cells read ‚ORT‘ and ‚Text‘“, getestet in `tests/filter.test.mjs:185`); die Zahlen an den Facetten bleiben die der ganzen Tabelle; ein Render leert das Feld; `markFilter()` lehnt nie eine Tabelle ab (`filter.js:113`).

## Befunde

Jeder Befund nennt Ort, Beobachtung, Nachweis und Vorschlag. Schwere: *mittel* heißt, ein Leser stößt in normalem Gebrauch darauf und bekommt keine Erklärung; *niedrig* heißt Randfall, Komfort oder Wartbarkeit.

### M1: Gleich aussehende Zeichen passen nicht zusammen (mittel)

**Ort:** `src/app/filter.js:67` bis `69`, `tidy()` und `folded()`:

```js
const tidy = text => String(text).replace(/\s+/g, ' ').trim();
…
const folded = text => tidy(text).toLocaleLowerCase('de');
```

**Beobachtung.** Verglichen wird nach Kleinschreibung und zusammengefassten Leerräumen, sonst Zeichen für Zeichen. Drei Fälle fallen dabei durch:

- *Zerlegte Umlaute.* Text aus macOS-Dateinamen, manchen PDFs oder Datenbankexporten trägt `ü` als `u` + U+0308 (NFD). Getippt wird `ü` als ein Zeichen (NFC).
- *Weiches Trennzeichen* U+00AD, etwa aus Word oder aus `&shy;` im Markdown. Unsichtbar, aber Teil des Textes.
- *Nullbreitenzeichen* U+200B, U+200C, U+2060. Ebenfalls unsichtbar und Teil des Textes. U+FEFF dagegen zählt in JavaScript zu `\s`; `tidy()` macht daraus schon heute ein Leerzeichen, so dass „Telefon\uFEFFnummer“ als „Telefon nummer“ verglichen wird.

In allen Fällen steht das Wort sichtbar in der Tabelle, und der Filter blendet die Zeile aus. Die README nennt unter *Tables*, *Known limits*, nur `ß` und Akzente („without folding accents or `ß`“); diese Fälle stehen dort nicht.

**Warum mittel.** Im Editor getippter Text ist NFC und ohne unsichtbare Zeichen. Betroffen ist eingefügter Text, aber genau das ist bei Dokumentationen der Regelfall: Tabellen werden aus Word, Confluence, Excel oder PDFs übernommen.

**Nachweis.** Sonde, Fälle 1 bis 3: `filterMatches('müller', 'Mu\u0308ller')`, `filterMatches('Telefonnummer', 'Telefon\u00ADnummer')` und `filterMatches('Telefonnummer', 'Telefon\u200Bnummer')` geben jeweils `false`.

**Vorschlag.** In `tidy()`, also vor dem Zusammenfassen der Leerräume, erst `.normalize('NFC')` anwenden und dann `/[\u00AD\u200B\u200C\u2060]/g` entfernen; `tidy()` dient Term und Zeilentext (`filterRowText()` ruft es am Ende auf), so dass beide gleich behandelt werden. Nach `tidy()` wäre es zu spät: Aus „a \u200B b“ würde „a  b“ mit zwei Leerzeichen, und „a b“ fände die Zeile nicht mehr. U+200D (ZWJ) bleibt bewusst stehen: Entfernt man es, findet „👨👩“ die Familie „👨‍👩‍👧“.
Jeder heute richtige Treffer bleibt erhalten. Wegfallen können nur Treffer, die mitten in einem zerlegten Zeichen enden: Heute findet `mu` das zerlegte „Mu\u0308ller“, nach der Normalisierung nicht mehr, so wie es das zusammengesetzte „Müller“ schon heute nicht findet. Das ist eine Korrektur, kein Verlust.
Weil `filterRowText()` sich ändert, muss `rowReading()` in `search-places.js` dieselbe Behandlung bekommen (siehe *Aufbau*). Abstimmen mit der geplanten Umstellung des Filters auf `findHits()` aus `src/app/search-match.js` (README, *Search*, Story 5.11): `findHits()` ignoriert U+00AD nur unter „light fuzzy“ und normalisiert ebenfalls nicht. Wer M1 löst, sollte es an einer Stelle für beide lösen.

### N1: Escape während einer IME-Komposition leert das Feld (niedrig)

**Ort:** `src/app/filter.js:197` bis `203`:

```js
input.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !input.value) return;
  …
```

**Beobachtung.** Der Handler fragt `e.isComposing` nicht. Wer mit einer Eingabemethode tippt (Japanisch, Chinesisch, Koreanisch) und die laufende Komposition mit Escape abbricht, verliert damit den ganzen Term im Feld. Von den fünf übrigen Escape-Handlern fragen es die beiden, die vor dem Filter an der Reihe sind: `src/app/search.js:522` und `src/app/large-view.js:75`. Die beiden danach, das Download-Menü (`src/app/downloads/menu.js:23`) und das Verlassen des Lesemodus (`src/app/editor.js:87`), fragen es ebenfalls nicht; sie hängen nicht an einem Textfeld, sind also weniger betroffen.

**Nachweis.** Aus dem Code und der Konvention der Nachbarmodule abgeleitet, nicht im Browser nachgestellt. Ob ein Browser Escape während der Komposition mit `key === 'Escape'` und `isComposing === true` meldet, hängt von Plattform und Eingabemethode ab.

**Vorschlag.** `if (e.key !== 'Escape' || e.isComposing || !input.value) return;` und ein Test, der ein `keydown` mit `isComposing: true` schickt und das Feld unverändert erwartet.

### N2: Block-Elemente in einer Zelle ohne Trenner (niedrig)

**Ort:** `src/app/filter.js:78` bis `96`, `filterRowText()`.

**Beobachtung.** Ein Leerzeichen kommt nur vor und hinter `TD`/`TH` und für `BR` hinzu. Stehen zwei Absätze, Listenpunkte oder ein `<hr>` in einer Zelle ohne Leerraum dazwischen, werden ihre Texte ohne Trenner aneinandergehängt. Eine Markdown-Tabelle kann keine Blöcke in einer Zelle schreiben, eine HTML-Tabelle im Markdown aber schon. Mit Zeilenumbrüchen zwischen den Tags, wie man HTML meist schreibt, tritt es nicht auf: Der Umbruch ist Text und wird zum Leerzeichen.

**Nachweis.** Sonde, Fälle 5 und 6: `<td><ul><li>Alpha</li><li>Beta</li></ul></td>` und `<td><p>Alpha</p><p>Beta</p></td>` ergeben beide `"AlphaBeta"`; der Term „Alpha Beta“ findet die Zeile nicht, „AlphaBeta“ schon. Fall 5b, dieselbe Liste mit Zeilenumbrüchen zwischen den Tags, ergibt `"Alpha Beta"`.

**Vorschlag.** Ein Leerzeichen vor und hinter jedem Element, das kein Inline-Element ist, wie es heute für Zellen geschieht; `tidy()` fasst die doppelten Leerzeichen danach zusammen. Eine Liste der Inline-Elemente (`A`, `EM`, `STRONG`, `CODE`, `SPAN`, `SUP`, `SUB`, `MARK`, `ABBR`, `KBD`, `S`, `DEL`, `INS`, `IMG` …) ist kürzer und sicherer als eine der Blöcke. `rowReading()` in `search-places.js` ändert sich mit (siehe *Aufbau*).
Am Rand, ohne Handlungsdruck: Der `alt`-Text eines Bildes ist kein Text der Zeile (Sonde, Fall 7); ob er es sein soll, ist eine Entscheidung. Und `filterRowText()` liest auch den Inhalt von `<style>`, `<script>` und `<svg>` in einer Zelle, wie die Suche (siehe `docs/audit-suchfunktion.md`, N2).

### N3: `rowspan` verschiebt beim Ausblenden die Spalten (niedrig)

**Ort:** `src/app/filter.js:156`, `row.classList.toggle(FILTER_OUT_CLASS, !match)`, zusammen mit `.dokufix-filter-out{display:none}` in `src/doc.css`. Gleiches gilt für die Facettenregel.

**Beobachtung.** Blendet ein Filter die Zeile aus, die eine Zelle mit `rowspan` trägt, verschwindet die Zelle mit. Die Folgezeilen, die diese Zelle überspannte, haben dann eine Spalte zu wenig, und ihre Zellen rutschen nach links unter falsche Überschriften. Außerdem zählt der Text der überspannenden Zelle nur zur ersten Zeile: Eine Suche nach ihm zeigt nur diese. Die README nennt unter *Known limits* „`rowspan` is not followed“ für den Wert einer Zelle, nicht für das Layout beim Ausblenden.

**Nachweis.** Aus dem Verhalten von `display:none` auf `<tr>` abgeleitet, nicht im Browser nachgestellt. Markdown kann kein `rowspan` schreiben; betroffen sind nur HTML-Tabellen.

**Vorschlag.** Ein Satz unter *Known limits*: Eine Zeile mit `rowspan`, die ein Filter ausblendet, nimmt ihre Zelle mit, und die Zeilen darunter verrutschen. Darüber hinaus gibt es zwei Wege, die sich in der Wirkung unterscheiden. Der eine ist eine Warnung neben einem Filter, der trotzdem arbeitet; das widerspricht dem Entwurf „never refuses a table“ von `markFilter()` nicht, bräuchte aber einen neuen Warnungstyp. Der andere ist eine Ablehnung wie bei `FACET_REFUSALS`: Die Tabelle bleibt ohne Filter. Für `facets` passt die Ablehnung zum bestehenden Muster, für `filter` wäre sie eine Änderung des Entwurfs.

### N4: Laufzeit bei großen Tabellen (niedrig)

**Ort:** `src/app/filter.js:150` bis `161`, `applyFilter()`.

**Beobachtung.** Jeder Tastendruck baut den Text jeder Datenzeile mit `filterRowText()` neu auf und senkt ihn mit `folded()`. Auch der erste Aufruf mit leerem Term tut das: `filter.js:155` liest den Zeilentext, bevor `filterMatches()` den leeren Term erkennt. Es gibt keine Tipp-Pause wie die 150 ms der Suche.

**Nachweis.** Sonde, Fall 8: Tabelle mit 3000 Zeilen zu je drei Zellen mit `strong`, `br`, `em` und `code`; vier Terme nacheinander; im Mittel 16 bis 25 ms je Aufruf in `linkedom`, je nach Maschine. Im Browser kommt die Neuberechnung der Styles durch die Klassenwechsel dazu. Nicht im Browser gemessen.

**Vorschlag.** Zwei Schritte. Erstens bei leerem Term den Zeilentext gar nicht lesen. Zweitens den gefalteten Text jeder Zeile zwischenspeichern (eine `WeakMap` von Zeile auf Text) und `applyFilter()` nur noch vergleichen lassen; das bringt mehr als eine Tipp-Pause und hält die sofortige Rückmeldung. Der Speicher wird erst beim ersten nicht leeren Term gefüllt, nicht beim Anlegen des Feldes: In `schlank` läuft das Reader-Skript vor dem Decoder der Diagramme (README, *Tables*, „in front of the decoder“), und ein Diagramm in einer Zelle ändert seinen Text, wenn es entpackt wird. `applyFilter()` bleibt exportiert und muss für Tests weiter ohne Speicher laufen, etwa mit einem optionalen Argument.

### N5: Klassenformat des Facettenschlüssels an mehreren Stellen (niedrig)

**Ort:** `src/app/filter.js:143`

```js
const m = input && /(?:^|\s)dokufix-facet-(\d+)(?:\s|$)/.exec(input.className);
```

dazu `facetKeyClass` und `facetGroupName` in `src/app/facets.js:62` und `:64`, die 32 Regeln in `src/doc.css:557` bis `588` und die Tests, die das Format selbst schreiben (`tests/filter.test.mjs:254`, `tests/vergleich.mjs:1570` und `:1590`).

**Beobachtung.** `filter.js` liest den Schlüssel mit einem eigenen regulären Ausdruck zurück, statt eine Funktion aus `facets.js` zu benutzen. Ändert jemand das Format in `facets.js` und `doc.css`, gibt `chosenFacetKey()` 0 zurück, und der Zähler zählt auch die Zeilen, die die Facette ausblendet. Der Test bei `tests/filter.test.mjs:258` („4 von 14 Zeilen“, „2 von 14 Zeilen“) fängt das ab; es bleibt eine Frage der Wartbarkeit, nicht der Korrektheit.

**Vorschlag.** Die Gegenfunktion in `facets.js` neben `facetKeyClass` legen (etwa `facetKeyOf(element)`) und in `filter.js` benutzen.

## Beobachtungen ohne Handlungsdruck

- **`change` des Suchfelds löst `update()` ein zweites Mal aus.** Neben einem Facettenfilter steht das Suchfeld in der Facettengruppe (`FIELDSET.dokufix-facet-bar`, `DIV.dokufix-filter`, `DIV.dokufix-table`). Ein `<input type="search">` feuert `change` beim Verlassen oder bei Enter, wenn sich der Wert geändert hat; das Ereignis steigt zum Listener der Gruppe auf (`filter.js:205`) und filtert ein zweites Mal mit demselben Ergebnis. Eine doppelte Berechnung je Bestätigung, nachgestellt in `linkedom`. Wer es ändern will: `if (e.target !== input) update();` im Listener der Gruppe.
- **`ß` und Akzente.** „strasse“ findet „Straße“ nicht (Sonde, Fall 4). Die README nennt es unter *Known limits* als Grenze, ohne Begründung.
- **Bekannter Rand von `:has()`.** Ohne `:has()` ist die Facettenleiste versteckt, keine Facette lässt sich wählen, und `chosenFacetKey()` gibt 0. Der Zähler stimmt also auch dort.
- **Zähler als `role="status"`.** Jeder Tastendruck ändert seinen Text, ein Screenreader kann also bei jedem Buchstaben ansagen. Bei Suchfeldern üblich.

## Was gut gelöst ist

- **Getrennte Klassen.** Freitext- und Facettenfilter blenden über je eigene Mittel aus; keiner überschreibt den anderen. Der Zähler liest beides aus Klassen und der Eigenschaft `checked` und braucht kein Layout.
- **Ein Feld je Tabelle.** Der Schutz in `attachTableFilters()` prüft neben der Klasse auch `data-dokufix-transient`, fällt also nicht auf ein Element des Autors mit derselben Klasse herein. Ein zweiter Lauf des Passes ändert nichts.
- **Text der Zeile.** `filterRowText()` lässt das Wort des Status-Chips für Screenreader, die Fußnotenmarke samt Vorschau (die Vorschau hängt in der `sup`, `src/app/footnotes.js:148`), die Facettenleiste und alles Transiente weg. Eine verschachtelte Tabelle ist Text ihrer Zelle. Ein Test hält Filter und Suche beim selben Zeilentext.
- **Exporte.** `showFilteredRows()` steht in `EXPORT_STEPS` nach dem Entfernen des Transienten und nimmt die Klasse einer ausgeblendeten Zeile aus allen drei Nur-Lesen-Exporten; `removeFilterMarks()` gibt allein `nur-lesen` mit. Im Druck ist nie eine Zeile versteckt.
- **Escape-Reihenfolge.** Großansicht, Suchpanel, Filterfeld mit Text, Download-Menü, Lesemodus: eine Taste schließt eine Sache. Die Reihenfolge folgt aus Phase und Ziel der Listener und steht in der README unter *Keys and events*.

## Sonde

Ein Node-Skript, das `linkedom` aus `node_modules` lädt (bei einem Skript außerhalb des Repos mit absolutem Pfad auf `node_modules/linkedom/esm/index.js`) und `filterMatches`, `filterRowText` und `applyFilter` aus `src/app/filter.js` importiert. Zeilen entstehen als `<table><tbody><tr>…</tr></tbody></table>` über `innerHTML`.

| Fall | Aufruf | Ergebnis |
|---|---|---|
| 1 | `filterMatches('müller', 'Mu\u0308ller')` | `false` |
| 2 | `filterMatches('Telefonnummer', 'Telefon\u00ADnummer')` | `false` |
| 3 | `filterMatches('Telefonnummer', 'Telefon\u200Bnummer')` | `false` |
| 4 | `filterMatches('strasse', 'Straße')` | `false` |
| 5 | `filterRowText()` einer Zeile `<td><ul><li>Alpha</li><li>Beta</li></ul></td>` | `"AlphaBeta"` |
| 5b | dieselbe Liste mit Zeilenumbrüchen zwischen den Tags | `"Alpha Beta"` |
| 6 | `filterRowText()` einer Zeile `<td><p>Alpha</p><p>Beta</p></td>` | `"AlphaBeta"` |
| 7 | `filterRowText()` einer Zeile `<td><img alt="Logo ACME"></td>` | `""` |
| 8 | `applyFilter(table, term, null)` für `k`, `k1`, `k12`, `k123` auf 3000 Zeilen der Form `<td><strong>K1</strong><br><em>sub</em></td><td><code>x1</code> text text</td><td>lorem ipsum …</td>` | im Mittel 16 bis 25 ms je Aufruf |

Die Skripte liegen nicht im Repo. Die Fälle 1 bis 3, 5 und 6 eignen sich als Tests in `tests/filter.test.mjs`, sobald M1 und N2 behoben werden, dann mit umgekehrter Erwartung; Fall 5b als Test, dass es so bleibt; Fall 4 hält die dokumentierte Grenze fest. Fall 7 ist offen, Fall 8 gehört nicht in die Unit-Tests.

## Auffälligkeiten in der bestehenden Doku

Beim Abgleich mit dem Code aufgefallen, ohne Änderung.

- **`src/README.md:1112`, Build-Tabelle.** Das Reader-Bundle heißt dort `src/reader.js` „with `src/app/filter.js` and `src/app/search.js`“ und „the table filter and the search“. Es enthält auch `large-view.js` und `diagram-downloads.js` (`src/reader.js:31` bis `34`); README:772 nennt alle vier.
- **`src/README.md:807`, *Known limits*.** „A table nested in a cell gives its text to the value of that cell: ‚einsIpq‘“ gilt für den Facettenwert (`tests/facets.test.mjs:387`). Der Freitextfilter liest dieselbe Zelle als „eins I pq“ (`tests/filter.test.mjs:218`). In einer Liste, die beide Filter betrifft, ist das mehrdeutig; besser „the facet value of that cell“.
- **`src/README.md:785`, *What matches*.** Dass Blöcke in einer Zelle ohne Leerraum ohne Trenner zusammengehängt werden (N2), steht weder dort noch unter *Known limits*.
- **`src/README.md:882` und `docs/audit-suchfunktion.md:167`.** Die README sagt, `findHits()` vergleiche „as the free-text filter compares it“, das Such-Audit nennt beide „deckungsgleich“. Nicht ganz: `filterMatches()` senkt den ganzen String und wendet dabei die Regel des Schluss-Sigmas an, `findHits()` senkt Zeichen für Zeichen. `filterMatches('οδοσ', 'ΟΔΟΣ')` gibt `false`, `findHits()` einen Treffer; mit dem Term `οδος` ist es umgekehrt. Für deutsche Dokumente ohne Belang, aber die Aussage sollte „bis auf das Schluss-Sigma“ heißen.
- **`src/README.md`, *Search*.** Die Stories des Epics 5 heißen dort mal „story 11“, „story 10“, mal „story 5.3“; das Such-Audit schreibt „Story 5.11“. *What it is not yet* (README:932) nennt die geplante Umstellung des Filters auf `findHits()` nicht.

Die Kommentare in `filter.js` und `facets.js` stimmen mit dem Code überein.

## Empfohlene Reihenfolge

1. N1, Escape bei IME: eine Bedingung, ein Test, kein Risiko.
2. N3 als Satz unter *Known limits* in der README, sofort; zusammen mit den Korrekturen aus *Auffälligkeiten in der bestehenden Doku*.
3. M1 und N2 zusammen: beide ändern `filterRowText()` und damit `rowReading()`, sie gehören in eine Änderung mit gemeinsamen Tests. Vorher klären, ob sie in die Umstellung auf `findHits()` (Story 5.11) gehören.
4. N5 bei der nächsten Änderung an `filter.js` oder `facets.js`.
5. N4, zuerst der leere Term, dann der Zwischenspeicher, sobald Tabellen mit mehreren tausend Zeilen vorkommen.
