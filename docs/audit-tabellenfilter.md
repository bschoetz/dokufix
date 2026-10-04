# Audit der Tabellenfilter

Code-Review der beiden Tabellenfilter: der Freitextfilter `src/app/filter.js` und der Facettenfilter `src/app/facets.js`, ihr Zusammenspiel, dazu `src/app/tables.js` (der Wrapper), die Regeln in `src/doc.css`, die Reihenfolge der Passes in `src/app/render.js`, das Reader-Bundle `src/reader.js` und die Exportschritte in `src/app/downloads/`.
Stand 4. Oktober 2026, Commit `6eb0b39`. Alle Zeilenangaben beziehen sich auf diesen Stand. Das Review hat nichts am Code geändert; die Befunde sind Vorschläge.

## Ergebnis in Kürze

- **Kein schwerer Fehler.** Ausblenden, Zähler, Zusammenspiel mit dem Facettenfilter, Escape-Reihenfolge und Exportschritte tun, was die README beschreibt. Die 86 Tests von `tests/filter.test.mjs`, `tests/facets.test.mjs` und `tests/tables.test.mjs` laufen grün.
- **Keine Sicherheitslücke.** Feld, Zähler und Steuerelemente entstehen mit `createElement`, `setAttribute` und `textContent`; Platzhalter, Überschriften und Zellwerte erreichen die Seite nie als HTML.
- **Ein Befund mittlerer Schwere:** Zeichen, die gleich aussehen, aber anders kodiert sind (zerlegte Umlaute, weiches Trennzeichen, Nullbreitenzeichen), passen nicht zusammen. Der Leser sieht das Wort in der Tabelle und bekommt „0 von 14 Zeilen“.
- **Fünf Befunde niedriger Schwere:** Escape während einer IME-Komposition, Block-Elemente in einer Zelle verschmelzen zu einem Wort, `rowspan` verschiebt beim Ausblenden die Spalten, Laufzeit bei großen Tabellen, doppelt gepflegtes Klassenformat und ein doppelter `update()`-Aufruf.

## Vorgehen

1. **Lesen.** `src/app/filter.js`, `src/app/facets.js` und `src/app/tables.js` vollständig, dazu die Regeln der Tabellen, Facetten und des Freitextfilters in `src/doc.css`, `src/app/render.js` (Reihenfolge der Passes), `src/reader.js`, `src/app/footnotes.js` (wo die Vorschau einer Fußnote steht), die Escape-Handler in `src/app/search.js`, `src/app/large-view.js` und `src/app/editor.js`, `applyMarkerList()` in `src/app/markers.js`, die Abschnitte *Tables* und *Keys and events* der `src/README.md` und die Testnamen in `tests/filter.test.mjs`.
2. **Prüfen.** `npm ci`, dann `node --test tests/filter.test.mjs tests/facets.test.mjs tests/tables.test.mjs` (86 Tests, alle grün).
3. **Sondieren.** Ein Node-Skript gegen `linkedom` aus `node_modules`, das `filterMatches()`, `filterRowText()` und `applyFilter()` direkt aufruft. Kein Browserlauf. Die Fälle stehen unter *Sonde*, so dass sie sich nachstellen lassen.

## Aufbau, wie ich ihn vorgefunden habe

| Modul | Aufgabe | Rein |
|---|---|---|
| `facets.js` | `buildFacets()`: Steuerelemente über der Tabelle, Schlüsselklasse an jeder Datenzeile; `rowsOf()`: Kopf- und Datenzeilen einer Tabelle, auch für den Freitextfilter; `isFootnoteMarker()` | ja, arbeitet auf der übergebenen Tabelle |
| `filter.js` | `markFilter()`: markiert die Tabelle im Dokument; `filterRowText()`, `filterMatches()`, `filterCountText()`: Text einer Zeile, Vergleich, Zähler; `attachTableFilters()`: der Laufzeit-Pass mit Feld und Listenern; `showFilteredRows()`, `removeFilterMarks()`: Exportschritte | bis auf die Listener ja |
| `tables.js` | `buildTables()`: Wrapper um jede Tabelle, Klasse der Unterzeile | ja |
| `src/doc.css` | blendet Facetten per `:has()` aus, eine feste Regel je Schlüssel 1 bis 32; blendet `dokufix-filter-out` aus; beides nur `@media not print` | — |

Der Fluss: `input` im Feld oder `change` in der Facettengruppe → `applyFilter()` liest für jede Datenzeile den Text mit `filterRowText()`, vergleicht mit `filterMatches()`, setzt oder entfernt `dokufix-filter-out` und zählt die Zeilen, die zum Term passen und die gewählte Facette tragen. Den gewählten Facettenschlüssel liest `chosenFacetKey()` aus der Eigenschaft `checked` der Radiobuttons.

Die Entwurfsentscheidungen, die das Review als gegeben nimmt, weil die README sie begründet: Feld nur, wo ein Skript läuft (Ausnahme zu NFR1 und NFR2); Feld über dem Wrapper, nicht darin; ein Term trifft auch über Zellgrenzen; `ß` und Akzente werden nicht gefaltet; die Zahlen an den Facetten bleiben die der ganzen Tabelle; ein Render leert das Feld.

## Befunde

Jeder Befund nennt Ort, Beobachtung, Nachweis und Vorschlag. Schwere: *mittel* heißt, ein Leser stößt in normalem Gebrauch darauf und bekommt keine Erklärung; *niedrig* heißt Randfall, Komfort oder Wartbarkeit.

### M1: Gleich aussehende Zeichen passen nicht zusammen (mittel)

**Ort:** `src/app/filter.js:67` bis `69`, `tidy()` und `folded()`:

```js
const tidy = text => String(text).replace(/\s+/g, ' ').trim();
const folded = text => tidy(text).toLocaleLowerCase('de');
```

**Beobachtung.** Verglichen wird nach Kleinschreibung und zusammengefassten Leerräumen, sonst Zeichen für Zeichen. Drei Fälle, die in kopierten Texten vorkommen, fallen dabei durch:

- *Zerlegte Umlaute.* Text aus macOS-Dateinamen, manchen PDFs oder Datenbankexporten trägt `ü` als `u` + U+0308 (NFD). Getippt wird `ü` als ein Zeichen (NFC).
- *Weiches Trennzeichen* U+00AD, etwa aus Word oder aus `&shy;` im Markdown. Unsichtbar, aber Teil des Textes.
- *Nullbreitenzeichen* U+200B bis U+200D, U+2060, U+FEFF, etwa aus Confluence oder Webseiten.

In allen drei Fällen steht das Wort sichtbar in der Tabelle, und der Filter blendet die Zeile aus. Die README nennt unter *Tables*, *Known limits*, nur `ß` und Akzente; diese drei Fälle stehen dort nicht.

**Nachweis.** Sonde, Fälle 1 bis 3: `filterMatches('müller', 'Müller')`, `filterMatches('Telefonnummer', 'Telefon­nummer')` und `filterMatches('Telefonnummer', 'Telefon​nummer')` geben jeweils `false`.

**Vorschlag.** In `folded()` vor dem Kleinschreiben `.normalize('NFC')` anwenden und `[­​-‍⁠﻿]` entfernen. Beides gilt für Term und Text gleich, ändert also nichts an Treffern, die heute stimmen. Abstimmen mit der geplanten Umstellung des Filters auf `findHits()` aus `src/app/search-match.js` (README, *Search*, „story 11“): `findHits()` ignoriert U+00AD nur unter „light fuzzy“ und normalisiert ebenfalls nicht. Wer M1 löst, sollte es an einer Stelle für beide lösen.

### N1: Escape während einer IME-Komposition leert das Feld (niedrig)

**Ort:** `src/app/filter.js:197` bis `203`:

```js
input.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !input.value) return;
  …
```

**Beobachtung.** Der Handler fragt `e.isComposing` nicht. Wer mit einer Eingabemethode tippt (Japanisch, Chinesisch, Koreanisch) und die laufende Komposition mit Escape abbricht, verliert damit den ganzen Term im Feld. Die beiden anderen Escape-Handler mit gleichem Anspruch fragen es: `src/app/search.js:522` und `src/app/large-view.js:75`.

**Nachweis.** Aus dem Code und der Konvention der Nachbarmodule abgeleitet, nicht im Browser nachgestellt. Ob ein Browser Escape während der Komposition mit `key === 'Escape'` und `isComposing === true` meldet, hängt von Plattform und Eingabemethode ab.

**Vorschlag.** `if (e.key !== 'Escape' || e.isComposing || !input.value) return;` und ein Test, der ein `keydown` mit `isComposing: true` schickt und das Feld unverändert erwartet.

### N2: Block-Elemente in einer Zelle verschmelzen zu einem Wort (niedrig)

**Ort:** `src/app/filter.js:78` bis `96`, `filterRowText()`.

**Beobachtung.** Ein Leerzeichen kommt nur vor und hinter `TD`/`TH` und für `BR` hinzu. Zwei Absätze oder Listenpunkte in einer Zelle werden ohne Trenner aneinandergehängt. Eine Markdown-Tabelle kann keine Absätze oder Listen in einer Zelle schreiben, eine HTML-Tabelle im Markdown aber schon.

**Nachweis.** Sonde, Fälle 5 und 6: `<td><ul><li>Alpha</li><li>Beta</li></ul></td>` und `<td><p>Alpha</p><p>Beta</p></td>` ergeben beide `"AlphaBeta"`. Der Term „Alpha Beta“ findet die Zeile nicht, „AlphaBeta“ schon.

**Vorschlag.** Auch an Block-Elementen (`P`, `LI`, `DIV`, `UL`, `OL`, `DL`, `DT`, `DD`, `TR`, `H1` bis `H6`, `PRE`, `BLOCKQUOTE`) ein Leerzeichen davor und dahinter einfügen, wie es heute für Zellen geschieht. `tidy()` fasst die doppelten Leerzeichen danach ohnehin zusammen. Am Rand: Der `alt`-Text eines Bildes ist kein Text der Zeile (Sonde, Fall 7). Ob er es sein soll, ist eine Entscheidung, kein Fehler.

### N3: `rowspan` verschiebt beim Ausblenden die Spalten (niedrig)

**Ort:** `src/app/filter.js:156`, `row.classList.toggle(FILTER_OUT_CLASS, !match)`, zusammen mit `.dokufix-filter-out{display:none}` in `src/doc.css`. Gleiches gilt für die Facettenregel.

**Beobachtung.** Blendet ein Filter die Zeile aus, die eine Zelle mit `rowspan` trägt, verschwindet die Zelle mit. Die Folgezeilen, die diese Zelle überspannte, haben dann eine Spalte zu wenig, und ihre Zellen rutschen nach links unter falsche Überschriften. Außerdem zählt der Text der überspannenden Zelle nur zur ersten Zeile: Eine Suche nach ihm zeigt nur diese. Die README nennt unter *Known limits* „`rowspan` is not followed“ für den Wert einer Zelle, nicht für das Layout beim Ausblenden.

**Nachweis.** Aus dem Verhalten von `display:none` auf `<tr>` abgeleitet, nicht im Browser nachgestellt. Markdown kann kein `rowspan` schreiben; betroffen sind nur HTML-Tabellen.

**Vorschlag.** Mindestens ein Satz unter *Known limits*: Eine Zeile mit `rowspan`, die ein Filter ausblendet, nimmt ihre Zelle mit, und die Zeilen darunter verrutschen. Weiter ginge eine Warnung von `markFilter()` und `buildFacets()` bei einer Tabelle mit `rowspan` in den Datenzeilen, so wie `FACET_REFUSALS` heute andere Fälle ablehnt.

### N4: Laufzeit bei großen Tabellen (niedrig)

**Ort:** `src/app/filter.js:150` bis `161`, `applyFilter()`.

**Beobachtung.** Jeder Tastendruck baut den Text jeder Datenzeile mit `filterRowText()` neu auf und senkt ihn mit `folded()`. Der Zeilentext ändert sich zur Laufzeit nicht: Nur ein Render ersetzt die Tabelle, und dann baut der Pass ein neues Feld. Es gibt keine Tipp-Pause wie die 150 ms der Suche.

**Nachweis.** Sonde, Fall 8: Tabelle mit 3000 Zeilen zu je drei Zellen mit `strong`, `br`, `em` und `code`; vier Terme nacheinander; im Mittel 25 ms je Aufruf in `linkedom`. Im Browser kommt die Neuberechnung der Styles durch die Klassenwechsel dazu. Nicht im Browser gemessen.

**Vorschlag.** In `attachTableFilters()` den gefalteten Text jeder Zeile einmal berechnen (eine `Map` oder `WeakMap` von Zeile auf Text) und `applyFilter()` nur noch vergleichen lassen. Das bringt mehr als eine Tipp-Pause und hält die sofortige Rückmeldung. `applyFilter()` bleibt exportiert und muss für Tests weiter ohne Speicher laufen, etwa mit einem optionalen dritten Argument.

### N5: Klassenformat des Facettenschlüssels an zwei Stellen (niedrig)

**Ort:** `src/app/filter.js:143`

```js
const m = input && /(?:^|\s)dokufix-facet-(\d+)(?:\s|$)/.exec(input.className);
```

und `src/app/facets.js:62`, `facetKeyClass = key => 'dokufix-facet-' + key`.

**Beobachtung.** `filter.js` liest den Schlüssel mit einem eigenen regulären Ausdruck zurück. Ändert jemand das Format in `facets.js`, findet `chosenFacetKey()` keinen Schlüssel mehr und gibt 0 zurück: Der Zähler zählt dann alle Zeilen, die zum Term passen, auch die, die die Facette ausblendet. Kein Test schlägt dabei zwingend fehl, wenn er nur das Ausblenden prüft.

**Vorschlag.** Die Gegenfunktion in `facets.js` neben `facetKeyClass` legen (etwa `facetKeyOf(element)`) und in `filter.js` benutzen.

### N6: `change` des Suchfelds löst `update()` ein zweites Mal aus (niedrig)

**Ort:** `src/app/filter.js:204` bis `205`:

```js
const group = facetGroupOf(table);
if (group) group.addEventListener('change', update);
```

**Beobachtung.** Neben einem Facettenfilter steht das Suchfeld in der Facettengruppe, zwischen den Steuerelementen und dem Wrapper. Ein `<input type="search">` feuert `change` beim Verlassen und bei Enter; das Ereignis steigt zur Gruppe auf und ruft `update()` noch einmal, obwohl `input` schon gefiltert hat. Das Ergebnis ist dasselbe, die Arbeit doppelt.

**Vorschlag.** Im Listener nur Radiobuttons beachten: `group.addEventListener('change', e => { if (e.target.type === 'radio') update(); })`.

## Beobachtungen ohne Handlungsdruck

- **Treffer über Zellgrenzen.** „ort text“ findet eine Zeile mit den Zellen „ORT“ und „Text“. Gewollt, in der README beschrieben und getestet (`tests/filter.test.mjs:185`). Es kann überraschen, wenn ein Term mit Leerzeichen zufällig das Ende einer Zelle und den Anfang der nächsten trifft.
- **`ß` und Akzente.** „strasse“ findet „Straße“ nicht (Sonde, Fall 4). In der README unter *Known limits* dokumentiert.
- **Zahlen an den Facetten.** Sie bleiben die der ganzen Tabelle, auch während ein Term die Zeilen einschränkt; „Liste 1“ steht dann auch, wenn keine Liste mehr sichtbar ist. In der README unter *Beside a facet filter* festgehalten.
- **Bekannter Rand von `:has()`.** Ohne `:has()` ist die Facettenleiste versteckt, keine Facette lässt sich wählen, und `chosenFacetKey()` gibt 0. Der Zähler stimmt also auch dort.
- **Zähler als `role="status"`.** Jeder Tastendruck ändert seinen Text, ein Screenreader kann also bei jedem Buchstaben ansagen. Das ist bei Suchfeldern üblich; eine Tipp-Pause aus N4 würde es nebenbei dämpfen.

## Was gut gelöst ist

- **Getrennte Klassen.** Freitext- und Facettenfilter blenden über je eigene Mittel aus; keiner überschreibt den anderen. Der Zähler liest beides aus Klassen und der Eigenschaft `checked` und braucht kein Layout.
- **Ein Feld je Tabelle.** Der Schutz in `attachTableFilters()` prüft neben der Klasse auch `data-dokufix-transient`, fällt also nicht auf ein Element des Autors mit derselben Klasse herein. Ein zweiter Lauf des Passes ändert nichts.
- **Text der Zeile.** `filterRowText()` lässt das Wort des Status-Chips für Screenreader, die Fußnotenmarke samt Vorschau (die Vorschau steht in der `sup`, `src/app/footnotes.js:147`), die Facettenleiste und alles Transiente weg. Eine verschachtelte Tabelle ist Text ihrer Zelle.
- **Exporte.** `showFilteredRows()` steht in `EXPORT_STEPS` nach dem Entfernen des Transienten und nimmt die Klasse einer ausgeblendeten Zeile aus allen drei Nur-Lesen-Exporten; `removeFilterMarks()` gibt allein `nur-lesen` mit. Im Druck ist nie eine Zeile versteckt.
- **Escape-Reihenfolge.** Großansicht, Suchpanel, Filterfeld mit Text, Download-Menü, Lesemodus: eine Taste schließt eine Sache. Die Reihenfolge folgt aus Phase und Ziel der Listener und steht in der README unter *Keys and events*.

## Sonde

Ein Node-Skript, das `linkedom` aus `node_modules` lädt (bei einem Skript außerhalb des Repos mit absolutem Pfad auf `node_modules/linkedom/esm/index.js`) und `filterMatches`, `filterRowText` und `applyFilter` aus `src/app/filter.js` importiert. Zeilen entstehen als `<table><tbody><tr>…</tr></tbody></table>` über `innerHTML`.

| Fall | Aufruf | Ergebnis |
|---|---|---|
| 1 | `filterMatches('müller', 'Müller')` | `false` |
| 2 | `filterMatches('Telefonnummer', 'Telefon­nummer')` | `false` |
| 3 | `filterMatches('Telefonnummer', 'Telefon​nummer')` | `false` |
| 4 | `filterMatches('strasse', 'Straße')` | `false` |
| 5 | `filterRowText()` einer Zeile `<td><ul><li>Alpha</li><li>Beta</li></ul></td>` | `"AlphaBeta"` |
| 6 | `filterRowText()` einer Zeile `<td><p>Alpha</p><p>Beta</p></td>` | `"AlphaBeta"` |
| 7 | `filterRowText()` einer Zeile `<td><img alt="Logo ACME"></td>` | `""` |
| 8 | `applyFilter(table, term, null)` für `k`, `k1`, `k12`, `k123` auf 3000 Zeilen der Form `<td><strong>K1</strong><br><em>sub</em></td><td><code>x1</code> text text</td><td>lorem ipsum …</td>` | im Mittel 25 ms je Aufruf |

Das Skript liegt nicht im Repo. Die Fälle 1 bis 7 ließen sich unverändert als Tests in `tests/filter.test.mjs` übernehmen, sobald die Befunde behoben werden; Fall 8 gehört nicht in die Unit-Tests.

## Empfohlene Reihenfolge

1. N1, Escape bei IME: eine Bedingung, ein Test, kein Risiko.
2. M1, Normalform und unsichtbare Zeichen: klein im Code, deutlich für Leser kopierter Dokumente. Mit der Umstellung auf `findHits()` abstimmen.
3. N3 als Satz unter *Known limits* in der README, sofort; eine Warnung später, wenn HTML-Tabellen mit `rowspan` vorkommen.
4. N2, Block-Elemente: zusammen mit M1, beide ändern, was eine Zeile als Text hat.
5. N5 und N6 bei der nächsten Änderung an `filter.js`.
6. N4, der Zwischenspeicher, sobald Tabellen mit mehreren tausend Zeilen vorkommen.
