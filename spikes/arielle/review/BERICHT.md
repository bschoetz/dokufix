# Review: Nachbau von Mermaids Rangberechnung, Varianten, Volatilität und die Empfehlung für `arielle`

Stand 7. Oktober 2026. Geprüft wurde `scratchpad/ranks.mjs` (`mermaidRanks`) gegen den Quellcode von `mermaid@12.0.0` und gegen das echte Mermaid im Browser. Daraus entstanden zwei Fassungen in `review/`:

- `ranks-exakt.mjs`, Export `arielleExakt(model)`: der exakte Nachbau als **Referenz**, optimiert und mit einem korrigierten Fehler.
- `ranks-optimiert.mjs`, Export `arielle(model)`: die **empfohlene** Fassung, deren Spalten aus der Struktur des Prozesses folgen, nicht aus der Reihenfolge im XML.

Im Repository wurde nichts geändert. Alle Skripte und Protokolle liegen in `review/` (Liste am Ende).

## Ergebnis in Kürze

1. **Ein Fehler im Nachbau:** Eine Beschriftung, die `mermaidSource()`s `q()` zu einem Leerzeichen macht (Name nur aus `" < > & # \` \\`), ist für Mermaid **keine** Beschriftung; der Nachbau legt dafür einen Beschriftungsknoten an und verschiebt eine Spalte. Belegt im Browser (`browser.mjs`, gezielte Fälle `#`, `"`, `<>&`: abweichend) und an 400 Zufallsmodellen: alter Nachbau 237/400 gleich, alle 163 Abweichungen haben so eine Beschriftung; mit der Regel 400/400 gleich (`browser-eval.mjs`). Sonst wurde keine Abweichung gefunden (57/57 Fixtures, 20 000 Zufallsmodelle mit angehefteten Ereignissen, Parallelflüssen, mehreren Pools, gemischter Bahnreihenfolge).
2. **Volatilität gemessen** (`permute.mjs`, je Fixture 10 bedeutungslose Umordnungen des XML): Mit Mermaids Spalten ändern sich die **Spalten** in 24,0 % der Umordnungen (19 von 57 Fixtures) und das **fertige Layout** in 24,7 % (23 Fixtures). Mit kanonischen Spalten: Spalten 0,0 %, Layout 23,0 % (21 Fixtures). Die verbleibende Volatilität steckt zu praktisch 100 % im eigenen Raster (`src/`, unverändert gelassen): Mit festgehaltenen Spalten ändert sich das Layout in 23,7 % der Umordnungen; nur 6 von 131 dieser Änderungen fallen mit anderen Rückwärtsflüssen von `buildGrid()` zusammen, der Rest kommt aus Regeln, die bei Gleichstand der Modellreihenfolge folgen.
3. **Empfehlung für `arielle`:** die kanonische Sortierung mit Tie-Break Struktur → Flussname → Knotenname → Element-ID, **ohne** Beschriftungsspalte (`ranks-optimiert.mjs`, 81 Zeilen, 41 Zeilen Code). Spalten invariant gegen Umordnung (0,0 %) und, wo Namen die Wege unterscheiden, gegen Umbenennung der IDs (0,0 % in den Fixtures). Qualität an den 57 Fixtures: 2 angeordnete XML anders (ref3, notiz-hund2), beide nicht schlechter: Verstöße 45 → 44 (ein bekannter Verstoß weg, keiner neu), Kreuzungen 52 → 48, Knicke 327 → 325.
4. **Ablageort:** eigenes Modul `src/app/arielle.js` (Abschnitt 6).

## 1. Korrektheit des Nachbaus `ranks.mjs`

### 1.1 Gegen den Mermaid-Quellcode

| Schritt | Quelle (`mm/package/dist/chunks/mermaid.core/`) | Befund |
|---|---|---|
| Kanten-IDs | `chunk-7M6MHVWA.mjs` `addSingleLink` (Z. 276–316), `chunk-ZIGJFQKS.mjs` `getEdgeId` (Z. 543) | `L_<a>_<b>_0`, danach `L_<a>_<b>_<k+1>` mit `k` = Zahl der vorhandenen Kanten des Paares; `getData()` übernimmt die ID (`getEdgeId(…, rawEdge.id)` gibt sie zurück). Nachbau korrekt. |
| Knotenreihenfolge | `getData()` (Z. 954–1090), `toGraphView()` (`swimlanes-2SLR337P.mjs` Z. 116), `normalizeGraph()` (Z. 4802) | Wirksam ist die Reihenfolge von `layout.nodes` (`normalizeGraph` nimmt `nodeById.keys()`, nicht die zweimal gedrehte Liste aus `toGraphView`): Gruppen in umgekehrter Subgraph-Reihenfolge, dann die Vertices in Reihenfolge des ersten Auftretens, also Bahn für Bahn. Für die Ränge ist die Gruppenreihenfolge bedeutungslos. Nachbau korrekt. |
| Beschriftungsknoten | `createEdgeLabelNodes` (Z. 310–380) | ID `edge-label-<a>-<b>-<Kanten-ID>`, Bahn der Quelle, bei Bahnwechsel die des Ziels; Hilfskanten angehängt, die beschriftete Kante übersprungen. Nachbau korrekt. **Aber:** `edge.label` ist, was der Parser aus `\|" "\|` macht; das ist leer, also entsteht kein Knoten (Abschnitt 1.3). |
| Knoten in mehreren Bahnen | `addSubGraph` → `makeUniq` | Der erste Subgraph gewinnt. Von `readProcess()` nicht erreichbar (`placed`). Nachbau (`parent.has`) und beide Fassungen verhalten sich so. |
| Zyklen, Sortierung, Ränge | `removeCycles_DFS` (Z. 4955), `topoSortByGenerationIfAcyclic` (Z. 5934), `assignLayers_LaneAwareCompact` (Z. 5955), Hilfsfunktionen Z. 4836–4857 | Wie in der Analyse, Abschnitt 2. `rankOf[u] ?? 0` greift nie: In Generationenordnung ist jeder Vorgänger vor dem Nachfolger dran. |
| Platzhalter `h<n>` | — | Ohne Kanten; setzt `nextFree` nur in seiner leeren Bahn, in der nie ein Beschriftungsknoten liegt. Ohne Wirkung. |
| `normalizeGraph` | Z. 4802 | Dedupliziert nach `<id>:<src>-><dst>`; IDs sind eindeutig, es entfällt nie eine Kante. |
| `localeCompare` vs. `<` | ICU-Kollation | `_` und `-` sortieren in ICU anders als in ASCII, aber `_` wird nur zwischen Kanten-IDs mit gleichem Ziel verglichen (Unterschied nur in der Zählnummer), und `-` gegen Ziffer (`edge-label-n1-…` vs. `edge-label-n10-…`) sortiert gleich. Der Zeichenvergleich ist exakt; `plaincheck.mjs` 2000/2000. |

### 1.2 Grenzfälle

| Fall | Befund |
|---|---|
| Mehrere Flüsse zwischen demselben Paar, auch ≥ 10 (`L_a_b_10` < `L_a_b_2` als Zeichenkette) | Reihenfolge paralleler Kanten ist für die Ränge belanglos: Unbeschriftete stehen in der Adjazenz hintereinander und sehen denselben Farbzustand; parallele Beschriftungsknoten einer Bahn bekommen zwei aufeinanderfolgende Ränge, das Ziel nimmt das Maximum. Fuzz: 764 Modelle mit ≥ 10 Parallelflüssen gleich. |
| Angeheftete Ereignisse, Fluss zurück in den Host | Host-Mapping wie `mermaidSource()`; 9833 Fuzz-Modelle gleich; Browser 400/400. |
| Leere Bahnen, mehrere Pools | Ohne Wirkung; 3978 Fuzz-Modelle mit mehreren Pools gleich. |
| Knoten einer Bahn in beliebiger Reihenfolge (`flowNodeRef` ≠ XML-Reihenfolge der Knoten) | Wirkt auf die Startknoten der Tiefensuche. `random.mjs` und die Fixtures decken das kaum ab (Variante „XML-Reihenfolge“ in `eigenheiten.mjs`: Fixtures 57/57, Fuzz nur 2427/3000). `gen.mjs` mischt die Reihenfolge; der Nachbau nimmt die Bahnreihenfolge wie Mermaid. |
| **Beschriftung, die `q()` leert** | **Fehler im Nachbau**, siehe 1.3. |
| Knoten ohne Bahn, Fluss auf sich selbst | Von `readProcess()` ausgeschlossen. |

### 1.3 Empirisch gegen Mermaid 12.0.0 (Chromium)

`browser.mjs`: 18 gezielte Modelle und 400 Zufallsmodelle aus `gen.mjs` (2–51 Knoten, bis 71 Flüsse). Protokoll `browser2.log`, Rohpositionen `browser-raws.json`, Nachauswertung `browser-eval.mjs`.

| Fall | Ergebnis |
|---|---|
| Beschriftung `ja`, `a\|b`, `a %% b`, `x::y`, `(a) [b] {c}`, `a-->b`, `end`, `a;b`, `~~~`, `@{x}`, `äöü €`; Knotennamen `#`, `a\|b`, `(x)`, `end` | gleich; Mermaid liefert keinen Fehler |
| Beschriftung `#`, `"`, `<>&` (bei Mermaid `\|" "\|`) | **abweichend**: kein Beschriftungsknoten bei Mermaid |
| 400 Zufallsmodelle, alter Nachbau | 237 gleich; alle 163 Abweichungen enthalten eine solche Beschriftung |
| 400 Zufallsmodelle, Nachbau mit der Regel „leer nach `q()` ist keine Beschriftung“ | **400 gleich**, 0 Mermaid-Fehler |

Die Regel steht in `ranks-exakt.mjs` (Z. 45–46) und im Variantenbaustein; `../ranks.mjs` wurde nicht geändert (Fuzz vergleicht ihn mit bereinigten Namen). Für die empfohlene `arielle` ist die Frage gegenstandslos: Eine Beschriftung kostet dort keine Spalte.

Nicht geprüft: Modelle mit mehr als 500 Flüssen (`maxEdges`) und sehr lange Texte (`maxTextSize`): Dort bricht Mermaid heute ab, der Ersatz ordnet an. Eine Verhaltensänderung, keine Abweichung der Ränge.

## 2. Der exakte Nachbau, optimiert (`ranks-exakt.mjs`, Referenz)

Gebraucht wird nur die Ordnung der Ränge der echten Knoten, die Eingabe kommt immer aus `readProcess()`:

| Idee | Ergebnis | Begründung |
|---|---|---|
| Gruppenknoten weglassen | übernommen | keine Kanten, in der Rangvergabe übersprungen |
| Platzhalter `hold` weglassen | übernommen | nur in leeren Bahnen, dort ohne Nachbarn |
| String-IDs durch Sortierpositionen ersetzen | übernommen | einmal alle Knoten in Mermaids ID-Ordnung sortieren (Beschriftungen vor Knoten; Beschriftungen nach Quelle, Ziel, Nummer; Knoten nach Schlüssel als Zeichenkette), dann nur Zahlen; `edge-label-…`, `L_…` werden nie gebaut |
| Beschriftungsknoten durch Gewichte ersetzen | für die Referenz nicht möglich | belegt `nextFree` seiner Bahn und wird vor den Knoten seiner Generation verarbeitet (`cases.mjs`, Fall 4); bleibt als Knoten ohne Schlüssel |
| O(V·E)-Suche der eingehenden Kanten | übernommen | `base` der Nachfolger wird beim Vorgänger hochgezogen |
| Zyklenauflösung und topologische Sortierung zusammenlegen | teils | die Tiefensuche liefert nicht Mermaids Generationenordnung; Generationensortierung und Rangvergabe sind aber eine Schleife |
| Startknoten der Tiefensuche | vereinfacht | nur echte Knoten; Beschriftungsknoten hängen an ihrer Quelle, die vorher dran ist |
| `localeCompare` | ersetzt durch `<` | Abschnitt 1.1 |

Belege: Fixtures 57/57 (Ordnung, XML `estimated` und `measured`), `fuzz.mjs` 20 000/20 000 gegen `../ranks.mjs` (Rangwerte exakt gleich), `cases.mjs` 10/10, Browser 400/400 (Abschnitt 1.3). Laufzeit (`timing.mjs`, Leerlauf): 57 Fixtures 1,9 ms statt 4,9 ms; 200 große Zufallsmodelle 18 ms statt 56 ms.

### Welche Eigenheiten Mermaids für das fertige Layout eine Rolle spielen

`eigenheiten.mjs`: je eine Eigenheit in der Referenz geändert, gegen Fixtures (Spaltenordnung; XML `estimated`) und gegen die Referenz auf 3000 Zufallsmodellen.

| Variante | Spaltenordnung gleich (57) | XML gleich (57) | Zufall gleich (3000) |
|---|---|---|---|
| ohne Beschriftungsknoten | 33 | 56 (anders: notiz-hund2) | 663 |
| Beschriftung über Bahngrenze in der Bahn der Quelle statt des Ziels | 51 | 57 | 1566 |
| Startknoten der Tiefensuche in XML- statt Bahnreihenfolge | 57 | 57 | 2427 |
| Tiefensuche ohne „zuerst Knoten ohne eingehenden Fluss“ | 55 | 57 | 2619 |
| Kanten der Tiefensuche in Flussreihenfolge statt nach Ziel | 56 | 57 | 2857 |
| Generation in Zahlenordnung (n2 vor n10) statt Zeichenkettenordnung | 53 | 57 | 1867 |
| Beschriftungen nach den Knoten statt davor | 53 | 57 | 1752 |
| Generation unsortiert (Entdeckungsreihenfolge) | 47 | 57 | 1320 |
| Fluss über Bahngrenze schiebt auch eine Spalte weiter | 30 | 55 (anders: pools-bestellung, angeheftet-antrag) | 1093 |

Lesart: Die Regeln R1–R17 gleichen die meisten Eigenheiten aus; das XML der Fixtures ändert nur, wer die Beschriftungsspalte streicht oder Bahnwechsel eine Spalte kosten lässt. Die Spalten**ordnung** ändert aber fast jede Eigenheit, und R7/R9 lesen diese Ordnung.

## 3. Varianten, gemessen an der Qualität des fertigen Layouts

Alle Varianten sind eine Funktion mit Optionen (`varianten.mjs`, `ranksWith(model, opts)`); „exakt“ ist nachweislich `arielleExakt` (5057/5057 Modelle gleich, `selfcheck.mjs`). Maße (`quality.mjs`, 57 Fixtures, Messart `measured` wie `tests/bpmn-rules.test.mjs`): wie viele angeordnete XML sich gegenüber `<n>.measured.bpmn` ändern; Regelverstöße aus `breaksOf()` gegen `known-breaks.json` (gesamt, neu, weg); Kreuzungen (ein waagerechtes und ein senkrechtes Stück zweier Flüsse schneiden sich innen) und Knicke (Wegpunkte über zwei) über alle Flüsse; Breite und Höhe der Bilder summiert.

| Variante | XML geändert (57) | Verstöße | neu | weg | Kreuzungen | Knicke | Breite Σ | Höhe Σ |
|---|---|---|---|---|---|---|---|---|
| **exakt (Mermaid), Referenz** | 0 | 45 | 0 | 0 | 52 | 327 | 64363 | 25017 |
| ohne Beschriftungsspalte | 1 | 44 | 0 | 1 | 48 | 326 | 64463 | 24836 |
| Beschriftung als Gewicht (+2 in der Bahn, +1 über Bahnen) | 1 | 44 | 0 | 1 | 48 | 326 | 64463 | 24836 |
| XML-Reihenfolge wie `buildGrid()` | 0 | 45 | 0 | 0 | 52 | 327 | 64363 | 25017 |
| kanonisch, Tie-Break Element-ID | 0 | 45 | 0 | 0 | 52 | 327 | 64363 | 25017 |
| kanonisch, Tie-Break Name | 0 | 45 | 0 | 0 | 52 | 327 | 64363 | 25017 |
| kanonisch, Tie-Break Struktur | 1 | 45 | 0 | 0 | 52 | 326 | 64231 | 25097 |
| kanonisch, Tie-Break Bahn+Struktur | 1 | 45 | 0 | 0 | 52 | 326 | 64231 | 25097 |
| kanonisch, Tie-Break Struktur+Name | 1 | 45 | 0 | 0 | 52 | 326 | 64231 | 25097 |
| **kanonisch Struktur+Name, ohne Beschriftungsspalte (Empfehlung)** | 2 | 44 | 0 | 1 | 48 | 325 | 64331 | 24916 |
| kanonisch Struktur, Beschriftung als Gewicht | 2 | 44 | 0 | 1 | 48 | 325 | 64331 | 24916 |

Die Änderungen im Einzelnen (`quality.md`):

- **notiz-hund2** (jede Variante ohne Beschriftungsspalte): der bekannte Verstoß `association-through A_Temp Task_Verwerfen` fällt weg, kein neuer; Kreuzungen 8 → 4, Knicke 36 → 35, Bild 4526×1511 → 4626×1330.
- **ref3** (jede Variante mit Struktur-Tie-Break): Verstöße 1 → 1 (derselbe), Kreuzungen 0 → 0, Knicke 6 → 5, Bild 1678×700 → 1546×780. Der längere Weg nach dem Gateway bekommt die erste Spalte; das Bild wird schmaler und etwas höher.

Es gibt keine Variante mit mehr Verstößen oder mehr Kreuzungen als die Referenz. „Beschriftung als Gewicht“ und „ohne Beschriftungsspalte“ liefern dieselben Bilder: R7 schließt die leere Spalte ohnehin. Der Beschriftungsknoten ist damit für das fertige Layout entbehrlich, und ohne ihn entfällt in `arielle` die ganze Hilfsknoten-Mechanik.

## 4. Volatilität: der Permutationstest

### 4.1 Aufbau

`permute-xml.mjs` ordnet im XML um, was in BPMN keine Bedeutung hat: die Flussknoten eines Prozesses untereinander, die `boundaryEvent` untereinander, die `sequenceFlow` untereinander, die `flowNodeRef` jeder Bahn. Bahnen, Pools und alles andere behalten ihren Platz. Das Ergebnis wird mit `readModel()` neu gelesen, die Schlüssel `n1…`, `l1…` entstehen also wie in `readProcess()`. Round-Trip geprüft (`roundtrip.mjs`): ohne Umordnung derselbe Diagrammteil 57/57, mit Umordnung dieselben Elemente 57/57.

`permute.mjs`: je Fixture 10 Umordnungen (fester Startwert), je Variante:

- (a) Anteil der Umordnungen, deren **Spalten je Element-ID** (dicht, aus den Rängen) von denen des Originals abweichen,
- (b) Anteil, deren **fertiges Layout** abweicht: der Diagrammteil aus `layoutGeometry()`/`appendDiagram()` je Element-ID (Kästen, Beschriftungskästen, Wegpunkte), unabhängig von der Reihenfolge im XML-Text,
- (c) Verstöße über alle Umordnungen: Mittel, Maximum, Zahl der Fixtures mit mehr als einer Verstoßmenge; dazu Kreuzungen und Knicke im Mittel,
- (Raster) mit `--grid`: (b) mit den **Spalten des Originals je Element-ID festgehalten**, also was das Raster allein aus der Umordnung macht.

### 4.2 Ergebnis

| Variante | (a) Spalten geändert | Fixtures | (b) Layout geändert | Fixtures | Raster allein | (c) Verstöße Ø / max | Fixtures mit mehreren Verstoßmengen | Kreuzungen Ø | Knicke Ø |
|---|---|---|---|---|---|---|---|---|---|
| **exakt (Mermaid)** | **24,0 %** | 19 | **24,7 %** | 23 | 23,7 % | 0,79 / 7 | 9 | 0,88 | 5,8 |
| ohne Beschriftungsspalte | 24,2 % | 19 | 24,9 % | 23 | – | 0,79 / 7 | 9 | 0,86 | 5,7 |
| Beschriftung als Gewicht | 24,2 % | 19 | 24,9 % | 23 | – | 0,79 / 7 | 9 | 0,86 | 5,7 |
| XML-Reihenfolge wie `buildGrid()` | 24,6 % | 19 | 24,9 % | 23 | – | 0,79 / 7 | 9 | 0,87 | 5,8 |
| kanonisch, Element-ID | 0,0 % | 0 | 23,7 % | 22 | 23,7 % | 0,80 / 7 | 8 | 0,88 | 5,8 |
| kanonisch, Name | 0,0 % | 0 | 23,7 % | 22 | – | 0,80 / 7 | 8 | 0,88 | 5,8 |
| kanonisch, Struktur | 0,0 % | 0 | 23,9 % | 22 | 23,9 % | 0,80 / 7 | 8 | 0,88 | 5,8 |
| kanonisch, Bahn+Struktur | 0,0 % | 0 | 23,9 % | 22 | – | 0,80 / 7 | 8 | 0,88 | 5,8 |
| kanonisch, Struktur+Name | 0,0 % | 0 | 23,9 % | 22 | – | 0,80 / 7 | 8 | 0,88 | 5,8 |
| **kanonisch Struktur+Name, ohne Beschriftungsspalte** | **0,0 %** | 0 | **23,0 %** | 21 | – | 0,78 / 6 | 8 | 0,81 | 5,7 |
| kanonisch Struktur, Beschriftung als Gewicht | 0,0 % | 0 | 23,0 % | 21 | – | 0,78 / 6 | 8 | 0,81 | 5,7 |

Was das heißt:

- **Mermaids Spalten** ändern sich bei jeder vierten bedeutungslosen Umordnung, in einem Drittel der Fixtures. Beide Nachbau-Varianten mit Mermaids Ordnung (auch „wie `buildGrid()`“) sind genauso volatil, denn die Schlüssel folgen der XML-Reihenfolge.
- **Die kanonische Sortierung beseitigt die Spaltenvolatilität vollständig**, mit jedem der vier Tie-Breaks (bei eindeutigen IDs ist die Ordnung total, das ist konstruktionsbedingt).
- **Das Layout bleibt zu 23 % volatil, und das liegt im Raster.** Mit festgehaltenen Spalten ändert sich das Layout in 23,7 % der Umordnungen; arielle kann davon nichts beseitigen. `grid-share.mjs` (kanonische Spalten, 570 Umordnungen): 131 Layoutänderungen, davon nur 6 (alle in r05) mit anderen Rückwärtsflüssen von `buildGrid()`. Die übrigen kommen aus Regeln, die bei Gleichstand der Modellreihenfolge folgen, etwa `byCol` (`bpmn-layout.js:951`, stabiler Sort nach Spalte, Gleichstand in `model.nodes`-Reihenfolge), `at()` (Z. 922, die erste passende Zelle) und die Schleifen `for (const n of model.nodes)` / `for (const f of model.flows)` in den Regeln (44 solcher Stellen zwischen Z. 879 und 2000). Beispiel (`diag.mjs r05`): gleiche Spalten, nach der Umordnung stehen 10 Elemente anders, das Gateway `g` in einer anderen Zeile; die umgeordnete Fassung ist dabei sogar besser (Verstöße 2 → 1, Knicke 7 → 4). Betroffen sind 21–23 Fixtures, unter anderem ref3, demo6, r04, r05, r15, r17, r18, pools-bewerbung, notiz-bauantrag (je Fixture 4–9 von 10 Umordnungen).
- **Die Verstöße** streuen bei allen Varianten etwa gleich (Mittel 0,78–0,80, 8–9 Fixtures mit mehr als einer Verstoßmenge); auch das ist das Raster.

### 4.3 Die andere Seite: Umbenennung der IDs

`rename.mjs` / `rename-xml.mjs`: die IDs der Flussknoten, angehefteten Ereignisse und Flüsse werden in zufälliger Ordnung neu vergeben (wie ein Modeler-Export `Activity_0abc…`), Referenzen und Reihenfolge bleiben. Je Fixture 10 Umbenennungen.

| Variante | Spalten geändert | Layout geändert |
|---|---|---|
| exakt (Mermaid) | 0,0 % | 0,0 % (Schlüssel aus der Reihenfolge, IDs egal) |
| kanonisch, Element-ID | 22,5 % | 1,8 % (ref3, blackbox-reklamation) |
| kanonisch, Name | 0,0 % | 0,0 % |
| kanonisch, Struktur (→ Flussname → ID) | 6,3 % | 0,0 % |
| **kanonisch, Struktur+Name (→ Flussname → Knotenname → ID)** | **0,0 %** | **0,0 %** |
| kanonisch Struktur+Name, ohne Beschriftungsspalte | 0,0 % | 0,0 % |

Umordnung und Umbenennung sind komplementär: Mermaids Ordnung hängt nur an der Reihenfolge, der Tie-Break „Element-ID“ nur an den IDs. Struktur → Flussname → Knotenname → ID ist in den Fixtures gegen beides unempfindlich.

## 5. Die Sortierlogik von `arielle` und ihr Tie-Break

### 5.1 Wo die XML-Reihenfolge in Mermaids Algorithmus eingeht

Deine Liste stimmt; hier geprüft und ergänzt:

1. Schlüssel `n1…`/`l1…` in XML-Reihenfolge (`readProcess()`): ja, `key: 'n' + (before.length + nodes.length + 1)` in Reihenfolge der Kinder des Prozesses.
2. `localeCompare` auf den Schlüsseln, rein lexikografisch („n10“ < „n9“), bestimmt die Reihenfolge innerhalb einer Generation und damit, wer in einer Bahn die frühere Spalte bekommt: ja. Zusatz: Beschriftungsknoten stehen durch ihr Präfix `edge-label-` **vor** allen Knoten ihrer Generation, und ihre Reihenfolge untereinander folgt Quelle, Ziel und Kanten-Nummer, also wieder den Schlüsseln.
3. Tiefensuche nach Ziel-Schlüssel sortiert, Start in Knotenreihenfolge: ja; die Knotenreihenfolge ist dabei die der **Bahnen** (`flowNodeRef`), nicht die der Prozesskinder, weil `mermaidSource()` die Knoten in den Subgraphen nennt. Beide Reihenfolgen sind bedeutungslos.
4. Kanten-ID-Zähler und Flussreihenfolge: für die Ränge belanglos (Abschnitt 1.2); die Flussreihenfolge wirkt aber über die Beschriftungsknoten (Punkt 2) und über Mermaid-fremd: `buildGrid()`.
5. Das eigene Raster: `buildGrid()` bestimmt Rückwärtsflüsse in Flussreihenfolge ab den Knoten ohne eingehenden Fluss in `model.nodes`-Reihenfolge; dazu die Gleichstände der Regeln (Abschnitt 4.2). Gemessen: 23,7 % Layoutänderungen bei festen Spalten, davon nur 6 von 131 mit anderen Rückwärtsflüssen.

### 5.2 Die kanonische Ordnung

Der Algorithmus bleibt Mermaids Schichtung (Tiefensuche für Zyklen, Generationen, bahnweise Verdichtung). Nur die Stellen, an denen Mermaid auf die Schlüssel zurückgreift, nehmen Struktur:

- **Startknoten der Tiefensuche**: Knoten ohne eingehenden Fluss zuerst, nach **Bahn** (oben zuerst), dann Tie-Break; danach die übrigen.
- **Kanten eines Knotens** (Tiefensuche und Entdeckung): nach Tie-Break.
- **Reihenfolge in einer Generation**: die Reihenfolge der Entdeckung. Ein Knoten gibt seine Position an seine Nachfolger weiter; die Generation wird nicht mehr global nach Schlüssel sortiert. Innerhalb einer Generation konkurrieren nur Knoten derselben Bahn um `nextFree`, und die stehen dann in der Reihenfolge ihrer Vorgänger.

### 5.3 Bewertung der Tie-Breaks

Ein Tie-Break wird nur gebraucht, wo die Struktur zwei Wege nicht unterscheidet: die Ausgänge eines Knotens, die Startknoten einer Bahn.

| Tie-Break | Umordnung | Umbenennung der IDs | Qualität Fixtures | Bewertung |
|---|---|---|---|---|
| Element-ID | stabil | **22,5 % Spalten**, 1,8 % Layout | wie Referenz | Stabil, aber ein Re-Export aus einem Modeler (neue IDs) würfelt die Spalten neu. Nur als letzte Stufe. |
| Name (Flussname → Knotenname → ID) | stabil | stabil | wie Referenz | Inhaltlich willkürlich (alphabetisch), aber stabil; ändert sich nur, wenn der Autor benennt, also bei einer bedeutungsvollen Änderung. Bei „ja“/„nein“ steht „ja“ vorn. Unbenannte Flüsse und Gateways fallen auf die ID zurück. |
| Struktur (Reichweite → Flussname → ID) | stabil | 6,3 % Spalten | 1 XML anders (ref3, nicht schlechter) | Der Weg, der mehr Knoten erreicht, zuerst: der Hauptweg vor der kurzen Ausnahme. Das ist eine Aussage über den Prozess, nicht über die Datei. Bei gleich langen Wegen ohne Flussnamen fällt er auf die ID zurück, daher 6,3 %. |
| Bahn+Struktur | stabil | – | wie Struktur | Der Weg, der in der Bahn bleibt, zuerst: wirkt in den Fixtures nicht anders als Struktur (nur gleiche Bahn konkurriert um Spalten). Kein Mehrwert. |
| **Struktur → Flussname → Knotenname → ID** | **stabil** | **stabil** | wie Struktur | Struktur zuerst, dann der Inhalt, die ID als letzte Stufe. **Empfohlen.** |

**Wo keine Invarianz möglich ist:**

- Zwei Wege, die in Reichweite, Flussnamen und Knotennamen gleich sind (etwa zwei unbenannte Zweige eines parallelen Gateways mit gleich benannten Aufgaben): Die Ordnung folgt der ID. Sie ist dann stabil gegen Umordnung, aber nicht gegen Umbenennung. Eine Ordnung, die gegen beides stabil ist, gibt es für solche Zwillinge nicht, weil nichts sie unterscheidet; welche Spalte zuerst kommt, kann nur eine Konvention sein (hier: die kleinere ID). Das Bild ist in beiden Fällen gleich gut, nur gespiegelt.
- Die Reichweite ist in einer Schleife für alle Knoten der Schleife gleich (jeder erreicht jeden). Dort entscheiden Namen und ID.
- Die Volatilität des Rasters (23 %) bleibt in jedem Fall, bis `buildGrid()` und die Gleichstände der Regeln eine eigene kanonische Ordnung bekommen; das ist eine eigene Story in `src/`. Ein naheliegender Weg: Die Regeln nehmen die Spalten und `arielle`s Ordnung statt der Modellreihenfolge als letzten Schlüssel.

## 6. Die empfohlene Fassung

`review/ranks-optimiert.mjs`, Export `arielle(model)`: 81 Zeilen mit Kopfkommentar, 41 Zeilen Code. Rückgabe `{ n1: rang, … }` für jeden Knoten des Modells. Reine Logik, keine Abhängigkeit, ESLint des Repos (`--stdin-filename src/app/arielle.js`) ohne Meldung.

Aufbau:

1. **Knoten und Kanten.** Je Knoten `{ id, key, name, lane, out, in, base }`; ein angeheftetes Ereignis zeigt auf seinen Host; ein Knoten steht in der ersten Bahn, die ihn nennt; Flüsse mit gleichen Enden entfallen. Keine Hilfsknoten.
2. **Reichweite** je Knoten (erreichbare Knoten, Zyklen inklusive), daraus die beiden Vergleiche `ahead` (Kanten eines Knotens) und `first` (Startknoten: Bahn zuerst).
3. **Zyklen.** Tiefensuche in dieser Ordnung; Rückwärtskanten werden gedreht.
4. **Ränge.** Generation für Generation in Entdeckungsreihenfolge; `base` des Nachfolgers wird beim Vorgänger hochgezogen (+1 in derselben Bahn, +0 über Bahnen); der Knoten nimmt `max(base, nextFree[bahn])`.

Belege: `selfcheck.mjs` (gleich der parametrierten Variante auf 5057 Modellen), `quality.mjs` (Abschnitt 3), `permute.mjs`/`rename.mjs` (Abschnitt 4), `node --test cases-arielle.mjs` 10/10 (je Regel ein Fall; Invarianz gegen 20 Umordnungen je Fixture und gegen Umbenennung). Laufzeit (`timing.mjs`, Leerlauf): 57 Fixtures 3,2 ms, 200 große Zufallsmodelle 18 ms; eine Kette aus 5000 Knoten 0,86 s, weil die Reichweite O(V·(V+E)) kostet. Für BPMN-Größen belanglos; wer will, ersetzt sie durch eine Zählung über die Zusammenhangskomponenten.

Anschluss an `layoutGeometry()` ohne Änderung dort: `raw = { nodes: Object.fromEntries(Object.entries(arielle(model)).map(([k, r]) => [k, { cx: r }])) }`. Die Ränge sind ganze Zahlen, `buildGrid()` trennt ab Abstand 1.

### Lesbarkeit und Stil

Englische Kommentare, die das Warum erklären (Kopf: die Regeln in Worten, Herkunft der Schichtung; je Schritt ein Satz), Pfeilfunktionen, `Map`, kompakte Zeilen wie in `bpmn-layout.js`. Zwei Stellen, die beim Übernehmen ein Auge verdienen: `v.in` dient erst als „hat einen eingehenden Fluss“, dann als Restgrad (die Zeile `for (const v of nodes){ v.out = []; v.in = 0; }` setzt zurück); `visit()` rekursiert so tief wie der längste Pfad, wie Mermaid auch.

### Ablageort: eigenes Modul `src/app/arielle.js`

Importiert von `src/app/bpmn.js` an der Stelle von `mermaidPositions()`, später direkt von `layoutGeometry()`. Gründe:

- `bpmn-layout.js` hat 3145 Zeilen; `arielle` ist ein abgeschlossener Schritt mit einer Schnittstelle (Modell → Ränge) und eigenem Namen, in `src/README.md` ein Eintrag der Modultabelle.
- Eigene Tests (`tests/arielle.test.mjs` aus `cases-arielle.mjs`, mit dem Permutations-Invarianztest), dazu der Fixture-Vergleich in `tests/bpmn-fixtures.test.mjs`; `raw.json` entfällt.
- Austauschbar: Die Referenz `arielleExakt` und spätere Verbesserungen sind je ein Modul; ein Differenztest ist ein Import.
- Keine Abhängigkeit in `bpmn-layout.js` hinein; umgekehrt nur das `raw`-Format.

Dagegen spricht nur, dass `bpmn-layout.js` heute „alles Reine“ bündelt. Der Schritt „Spalten“ war dort aber immer die Lücke, die `bpmn.js` mit Mermaid füllte; ein Modul mit eigenem Namen macht sie sichtbar.

## 7. Abstand zu Mermaids Code

`ranks.mjs` ist eine enge Portierung (gleiche Phasen, Namen, String-IDs, `incoming`-Filter, Gruppen und Platzhalter). `arielleExakt` ist strukturell eigenständiger: kein Normalisieren, keine Gruppen, keine Platzhalter, keine String-IDs, eine Schleife für Sortierung und Ränge mit inkrementellem `base`. `arielle` geht weiter: keine Hilfsknoten, eine eigene, strukturelle Ordnung, Kommentare in Worten des BPMN-Layouts. Die Schichtung selbst (Tiefensuche, Generationen, bahnweise Verdichtung) ist Mermaids; der Kopfkommentar nennt die Herkunft (MIT). Eine „Clean-Room“-Unabhängigkeit ist es nicht; beide Fassungen sind mit Kenntnis des Mermaid-Codes geschrieben. Ob ein Eintrag in der Lizenzliste nötig ist, bleibt die offene Entscheidung aus Abschnitt 7 der Analyse.

## 8. Offene Punkte

- **Die Volatilität des Rasters (23 %)** ist mit `arielle` nicht zu beseitigen; sie braucht eine eigene Story in `src/` (`buildGrid()`-Rückwärtsflüsse, Gleichstände der Regeln). Die Messung hier (`permute.mjs --grid`, `grid-share.mjs`) ist die Grundlage.
- **Der Browser-Differenztest** gilt für die Referenz (400/400). Die empfohlene Fassung weicht absichtlich ab; ihr Maßstab sind die Fixtures (2 XML anders, nicht schlechter) und die Invarianz.
- **Umstellung der Fixtures:** Mit `arielle` ändern sich `ref3.measured/estimated.bpmn` und `notiz-hund2.*`, und `known-breaks.json` verliert einen Eintrag (`npm run fixtures -- --write`). Die `estimated`-Messart wurde für die Varianten nicht eigens gemessen (nur für die Referenz, 57/57).
- **Tie-Break-Konvention:** Bei Zwillingen entscheidet die kleinere ID. Wer lieber den Flussnamen vor der Reichweite hätte („ja“ immer vor „nein“, auch wenn „nein“ der längere Weg ist), tauscht in `ahead` die ersten beiden Glieder; die Messwerte dafür stehen in der Zeile „kanonisch, Tie-Break Name“ (ohne Reichweite).
- **Reichweite** in Schleifen ohne Aussage; eine Kette aus 5000 Knoten braucht 0,86 s.
- Nicht gemessen: Modelle über 500 Flüsse (Mermaid bricht heute ab), die Durchläufe `tests/durchlaeufe.mjs` und `tests/vergleich.mjs` (brauchen die Einbindung in `src/`).

## Dateien in `review/`

| Datei | Zweck |
|---|---|
| `ranks-optimiert.mjs` | **`arielle(model)`**, die empfohlene kanonische Fassung |
| `ranks-exakt.mjs` | `arielleExakt(model)`, die Referenz: exakter Nachbau, optimiert, mit Leerzeichen-Regel |
| `varianten.mjs` | `ranksWith(model, opts)` und `VARIANTS`: alle Varianten in einer Funktion |
| `gen.mjs` | Zufallsmodelle in der Form von `readProcess()`; `sameOrder()`, `cmp` |
| `measure.mjs` | Layout mit gegebenen Rängen (`measured`), Diagrammteil je ID, Verstöße, Kreuzungen, Knicke, Bildgröße |
| `permute-xml.mjs`, `rename-xml.mjs` | bedeutungslose Umordnung bzw. Umbenennung im XML (linkedom) |
| `fixtures.mjs` | Referenz gegen die 57 Fixtures (Ordnung, XML beider Messarten) |
| `fuzz.mjs [n]` | Referenz gegen `../ranks.mjs` auf n Zufallsmodellen |
| `browser.mjs [n]`, `browser-eval.mjs` | gezielte Fälle und n Zufallsmodelle gegen Mermaid in Chromium; Nachauswertung der gespeicherten Rohpositionen (`browser-raws.json`); Protokolle `browser.log`, `browser2.log` |
| `eigenheiten.mjs` | je eine Eigenheit Mermaids geändert (Abschnitt 2) |
| `quality.mjs` → `quality.md`, `quality.json` | Qualität je Variante (Abschnitt 3) |
| `permute.mjs`, `run-permute.sh` → `permute.log`, `permute2.log`, `permute-<n>.json` | Permutationstest (Abschnitt 4.2) |
| `rename.mjs`, `run-rename.sh` → `rename.log` | Umbenennungstest (4.3) und `grid-share.mjs` (Anteil des Rasters) |
| `diag.mjs <fixture>…` | eine Umordnung mit Layoutänderung bei gleichen Spalten im Detail |
| `roundtrip.mjs`, `selfcheck.mjs` | Round-Trip der Umordnung; `arielle` = parametrierte Variante |
| `cases.mjs`, `cases-arielle.mjs` | handgeschriebene Fälle für Referenz und `arielle` (`node --test`) |
| `timing.mjs` | Laufzeiten |
