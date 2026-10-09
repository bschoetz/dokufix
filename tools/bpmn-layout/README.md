# Layout-Werkzeuge

Werkzeuge zum Messen und Sichten des BPMN-Layouts ohne Koordinaten (`src/app/bpmn-layout.js`, `src/app/lmm.js`, `src/app/label-size.js`): die Eingaben anordnen, wie die Seite es tut, Brüche zählen, zwei Stände vergleichen und Ben die Bilder auf der Seite des Layout-Feedbacks vorlegen. Keines ist Teil des Builds.

Bis 2026-10-07 lagen sie im Store unter `spike-2-26/` (`werkzeug/`, `testtool/`, `pools/`, `pruefen/`) und brauchten je Eingabe Mermaids Rohpositionen (`.raw.json`) und gemessene Labelgrößen (`.sizes.json`). Seit LMM die Spalten gibt und das Layout die Beschriftungen selbst misst, braucht eine Eingabe nur ihr XML.

```sh
node tools/bpmn-layout/lauf.mjs                           # alle Sätze anordnen → arbeit/produkt/, arbeit/produkt.json
node tools/bpmn-layout/feedback-bauen.mjs                 # arbeit/bpmn-feedback.html (die Sammlung)
node tools/bpmn-layout/feedback-bauen.mjs --art Pools     # arbeit/bpmn-feedback-pools.html
node tools/bpmn-layout/feedback-auswerten.mjs <paket.json> # Bens Paket → arbeit/feedback/<satz>-<datum>/uebersicht.md
```

## Das Netz einer Layout-Story

Vor dem Bau den Stand von `main` anordnen, nach jedem Bau den Arbeitsbaum, dann vergleichen:

```sh
node tools/bpmn-layout/lauf.mjs --stand main               # → arbeit/stand-<commit>/
node tools/bpmn-layout/lauf.mjs                            # → arbeit/produkt/
node tools/bpmn-layout/vergleich.mjs stand-<commit> produkt
```

`vergleich.mjs` nennt jede Eingabe, deren angeordnetes XML anders ist, und ob das Bild oder nur das Prozess-XML anders ist; Exit 1, wenn sich ein Bild ändert. `--stand` geht ab `f0ff93e` (LMM); davor ordnete Mermaid an.

## Die Werkzeuge

| Datei | Was |
|---|---|
| `lib.mjs` | die Sätze, einen Stand laden (Arbeitsbaum oder `--stand <commit>`), seine Logik (`logikOf()`: SHA-1 über `bpmn-layout.js`, `lmm.js`, `label-size.js`, `xml-parser.js`, 8 Stellen, die Zahl, die ein Lauf als `logik` trägt), anordnen wie die Seite (`layoutJob()` in `src/app/bpmn-layout-job.js`, mit dem XML-Leser des Stands), Brüche, Größe, Blöcke, Kreuzungen und Knicke (`quality()`), Nähe zu einer Referenz, die Fingerabdrücke aller Eingaben (`fingerprints()`, einmal je Lauf) |
| `lauf.mjs` | ordnet an und misst, auch Kreuzungen, Knicke und wie oft `finishGrid()` je Regel lief (die Proben); `--lauf`, `--stand`, `--satz`, `--aus <regel,…>` (DEFAULT_RULES abschalten), Namen |
| `vergleich.mjs` | zwei Läufe Eingabe für Eingabe, Byte für Byte |
| `feedback-bauen.mjs`, `feedback-seite.js` | die Seite des Layout-Feedbacks: Bild, Modellierer, Kommentar, früheres Feedback, Export als Paket; `--art`, `--satz`, `--gegen`, `--varianten`, `--alle`, Namen |
| `feedback-auswerten.mjs` | ein Paket von der Seite oder der Werkbank: was Ben geändert hat, gemessen an der erzeugten Fassung (die Messung von Bahn, Reihenfolge, Zeile und Flussverlauf liegt seit Story 2.40 in `src/bpmn-tools/aenderungen.js`, das die Werkbank auf ihrer Leinwand markiert); je Beispiel die Herkunft, wo das Paket sie trägt, der Fingerabdruck des Falls und die Eingabe, die es ist, sonst die drei nach der Form nächsten |
| `vor-lmm.mjs`, `review-lmm.mjs` | die Stände vor LMM (8266ec4, und d296705 mit dem Messer, aber Mermaids Spalten) aus den aufbewahrten Rohpositionen, und die Review-Seite aller Bilder, die der Umbau vom 2026-10-07 geändert hat (`arbeit/bpmn-feedback-lmm.html`), mit dem Stand vor den Regeln aus Bens Feedback (Lauf `basis`, `--stand dd1dd25`) und den Handfassungen (Bens hund2, die Handlayouts der Quellen) |
| `pruefen.mjs` | bpmnlint und die Prüfung paralleler Gateways (ein paralleler Split schließt mit einem parallelen Join, oder seine Zweige laufen in Endereignissen aus, Ben, 2026-10-09); eine neue Eingabe kommt nur ohne Fehler in einen Satz, außer sie ist so falsch gezeichnet, wie Leute zeichnen: dann steht ihr Fehler unter `BEKANNT` und zählt nicht (x-wv6: Nachrichten-Start in einen parallelen Join, Ben, 2026-10-09). Danach die Eingaben mit gleichem Fall und gleicher Form (unten) |
| `kreuz.mjs` | gekreuzte Nachrichtenflüsse zwischen denselben zwei Symbolen (Story 2.12) |
| `browser-zeit.mjs` | die Laufzeit in Chromium und Firefox |

Die Layout-Werkbank (`dist/bpmn-layout-werkbank.html`, `npm run werkbank`, Stories 2.38 bis 2.40) trägt die eigenen Eingaben ohne Koordinaten, ordnet sie im Browser mit ihrem Stand an und nimmt Bens Feedback auf; ihr Paket hat das Format der Seite des Layout-Feedbacks, mit der Herkunft je Beispiel (`eigen` oder der Satz), und `feedback-auswerten.mjs` wertet es aus wie ein anderes. `npm run werkbank -- --mit-extern` baut sie mit allen Eingaben nach `arbeit/bpmn-layout-werkbank-alles.html`. Was außerhalb von git lebt (die externen Eingaben, Bens Fassungen aus den Paketen in `arbeit/feedback/`, das Archiv, die Variantenvergleiche), schreibt `node tools/werkbank/import.mjs` nach `arbeit/werkbank-import.json`; die Werkbank nimmt die Datei mit „Import laden“ in ihren Speicher. Bens letzte Bearbeitung je Fall ist dort seine Fassung mit `soll: false`, eine Reparatur, kein Ziel (Ben, 2026-10-09). Sie zeigt im Kopf ihren Layout-Stand: `logikOf()` über `src/app` beim Bauen, also dieselbe Zahl, die `lauf.mjs` für den Arbeitsbaum als Logik nennt. Steht dort eine andere als im letzten Lauf, ist die Werkbank mit anderen Modulen gebaut; neu bauen. Seit Story 2.40 liegen die Fassungen eines Falls als Ebenen auf einer Leinwand (Tasten 1 bis 9, Zoom und Ausschnitt bleiben stehen), „Änderungen“ (Taste M) markiert, was `feedback-auswerten.mjs` als geändert listen würde, und „Neuer Fall“ → „Zeichnen“ legt einen gezeichneten Fall an. Seit Story 2.41: Suche (Taste /) und Filter über der Liste, offenes Feedback, bis Ben es markiert, eine Bewertung 1 bis 10 je Stand, die im Paket als `bewertung` steht und die `feedback-auswerten.mjs` beim Beispiel nennt, und die drei ähnlichsten Fälle.

Nicht mitgekommen sind, was nur mit Mermaids Rohpositionen ging: die eingefrorenen Varianten main, A und B von Spike 2.26 mit ihrer Sichtung (`sichtung.mjs`, `bilder.mjs`), die Wege G und M der Pools (Story 2.12) und das alte Bauskript des Assistant (jetzt `tools/bpmn-assistant/`).

## Gleicher Fall, gleiche Form

`src/app/fingerprint.js` (Story 2.37) gibt jeder Eingabe zwei Fingerabdrücke. Der **Fall** ist ein SHA-256 über das bereinigte XML: ohne Diagrammteil, Farben, Erweiterungen der Werkzeuge, Kommentare, Leerraum zwischen den Tags und `name`, `exporter`, `exporterVersion`, `targetNamespace` der Definitionen, die Präfixe vereinheitlicht, die Attribute sortiert und nach ID sortiert, was in BPMN keine Reihenfolge hat und für das Layout keine (Knoten, angeheftete Ereignisse, Flüsse, `flowNodeRef`, Notizen, Assoziationen, Nachrichtenflüsse, Datenreferenzen und -assoziationen, `incoming`/`outgoing`, Datenobjekte und, was BPMN nur über die ID anspricht und das Layout nie liest: Nachrichten, Signale, Fehler und die übrigen Definitionen neben Prozessen und Zusammenarbeit; die Prozesse selbst bleiben in ihrer Reihenfolge, ohne Zusammenarbeit ist sie die der Pools); IDs, Namen und die Reihenfolge der Bahnen und Pools bleiben. Gleicher Fall heißt: dieselbe Eingabe, anders geschrieben. Die **Form** ist der Prozess ohne IDs und Texte (Weisfeiler–Lehman über das Modell von `readProcess()`): Klassen, Art der Ereignisse und Gateways, Flüsse mit Richtung, Nachrichtenflüsse, Assoziationen, die Bahn jedes Knotens, die Reihenfolge der Bahnen und Pools, ob ein Pool mit Rahmen gezeichnet wird (ein Prozess ohne Teilnehmer nicht), angeheftete Ereignisse an ihrem Wirt, Black Box oder nicht, Datenobjekt oder Datenspeicher; Aufgabentypen, Ereignisdefinitionen und `cancelActivity` nicht. Gleiche Form heißt sehr ähnlich, nicht dasselbe Bild: Texte wirken über die Größe der Beschriftungen und als Entscheid unter Gleichen. Aus den Merkmalen der Form folgt eine Ähnlichkeit (0 bis 100 %).

```sh
node tools/bpmn-layout/pruefen.mjs                       # nach den Zeilen der Prüfung: gleicher Fall, gleiche Form
node tools/bpmn-layout/pruefen.mjs --aehnlich            # dazu je Eingabe die drei ähnlichsten mit Prozent
node tools/bpmn-layout/pruefen.mjs --json <out.json>     # alles auch als JSON
```

Eine Gruppe steht unter dem kurzen Fingerabdruck (12 Stellen). Unter „gleiche Form“ nur Gruppen mit mehr als einem Fall; Eingaben gleichen Falls darin mit „=“ verbunden. Der Exit-Code bleibt der der Prüfung.

## Die Eingaben

Die Sätze, wie Spike 2.26 und die Stories 2.12 und 2.29 bis 2.32 sie gebildet haben:

| Satz | Eigene (hier) | Externe | Was |
|---|---|---|---|
| `sauber` | 48: 19 Fixtures aus `tests/fixtures/bpmn-layout/`, 29 in `eingaben/sauber/` | | der saubere Satz von Spike 2.26, gültig nach `pruefen.mjs` |
| `ben` | 2 | | Bens morgenroutine und krankheit |
| `extern` | | 20 (`x-…`) | von Menschen gezeichnete Prozesse, je mit Handlayout als Referenz |
| `pools`, `blackbox`, `angeheftet`, `notizen`, `daten` | 5, 8, 11, 9, 9 | 10, 7, 3, 12, 14 | die Sätze der Stories 2.12, 2.29 bis 2.32 |
| `laufzeit` | 1 | | Bens hund3 (77 Knoten), nur auf Nennung |
| `einzeln` | 1 | | Diagramme, über die Ben einzeln sprechen will, nur auf Nennung: `lauf.mjs --lauf <name> <name>`, `feedback-bauen.mjs --lauf <name> --art <name> <name>` |

Der Satz von 70 aus Spike 2.26 ist `sauber`, `ben` und `extern`. `eingaben/referenzen/hund2.bpmn` ist Bens Handlayout von hund2, die Referenz für `closeness()`.

**Externe Eingaben** sind Fremddateien und kommen nicht ins Repository. Die Werkzeuge lesen sie aus dem Ordner von Spike 2.26 im Store (`_bmad-output/initiative-dokufix/spike-2-26/extern/`, dazu `eingaben/notizen/nz23-x-tm1.bpmn`, eine Notizfassung eines externen Prozesses), oder aus `DOKUFIX_EXTERN`. Fehlt der Ordner, laufen sie mit den eigenen.

## Der Arbeitsordner

`arbeit/` ist nicht im Repository (`.gitignore`): Läufe und Seiten enthalten die angeordneten externen Eingaben. Darin:

- `<lauf>/`, `<lauf>.json`: die angeordneten Eingaben und ihre Zahlen, mit Commit und Prüfsumme der Layout-Module (`logik`)
- `archiv/`: jeder Satz, der je auf einer Feedback-Seite war; die Seite vergleicht damit und lässt nie ein Diagramm fallen, das schon einmal da war (Ben, 2026-10-05)
- `feedback/<satz>-<datum>/`: die Auswertungen; daran erkennt die Seite, zu welchem Satz Ben Feedback geschickt hat
- `staende/<commit>/`: die Module eines Stands für `--stand`
- die Seiten `bpmn-feedback*.html` und `bpmn-layout-werkbank-alles.html` (die Werkbank mit allen Eingaben)
- `werkbank-ansicht/`: die gerenderten Varianten A, B, C der Ansicht der Werkbank (Story 2.40); Ben wählte C
- `werkbank-import.json`: der Import der Werkbank (`tools/werkbank/import.mjs`), etwa 24 MB

Archiv und Auswertungen wurden am 2026-10-07 aus dem Store übernommen (`spike-2-26/testtool/feedback-saetze/`, `spike-2-26/out/feedback/`), damit das frühere Feedback beim Beispiel steht. `DOKUFIX_LAYOUT_ARBEIT` setzt einen anderen Ordner.
