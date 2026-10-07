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
| `lib.mjs` | die Sätze, einen Stand laden (Arbeitsbaum oder `--stand <commit>`), anordnen wie die Seite (`layoutJob()` in `src/app/bpmn-layout-job.js`, mit dem XML-Leser des Stands), Brüche, Größe, Blöcke, Kreuzungen und Knicke (`quality()`), Nähe zu einer Referenz |
| `lauf.mjs` | ordnet an und misst, auch Kreuzungen, Knicke und wie oft `finishGrid()` je Regel lief (die Proben); `--lauf`, `--stand`, `--satz`, `--aus <regel,…>` (DEFAULT_RULES abschalten), Namen |
| `vergleich.mjs` | zwei Läufe Eingabe für Eingabe, Byte für Byte |
| `feedback-bauen.mjs`, `feedback-seite.js` | die Seite des Layout-Feedbacks: Bild, Modellierer, Kommentar, früheres Feedback, Export als Paket; `--art`, `--satz`, `--gegen`, `--varianten`, `--alle`, Namen |
| `feedback-auswerten.mjs` | ein Paket von der Seite: was Ben geändert hat, gemessen an der erzeugten Fassung |
| `vor-lmm.mjs`, `review-lmm.mjs` | die Stände vor LMM (8266ec4, und d296705 mit dem Messer, aber Mermaids Spalten) aus den aufbewahrten Rohpositionen, und die Review-Seite aller Bilder, die der Umbau vom 2026-10-07 geändert hat (`arbeit/bpmn-feedback-lmm.html`), mit dem Stand vor den Regeln aus Bens Feedback (Lauf `basis`, `--stand dd1dd25`) und den Handfassungen (Bens hund2, die Handlayouts der Quellen) |
| `pruefen.mjs` | bpmnlint und die Prüfung paralleler Gateways; eine neue Eingabe kommt nur ohne Fehler in einen Satz |
| `kreuz.mjs` | gekreuzte Nachrichtenflüsse zwischen denselben zwei Symbolen (Story 2.12) |
| `browser-zeit.mjs` | die Laufzeit in Chromium und Firefox |

Nicht mitgekommen sind, was nur mit Mermaids Rohpositionen ging: die eingefrorenen Varianten main, A und B von Spike 2.26 mit ihrer Sichtung (`sichtung.mjs`, `bilder.mjs`), die Wege G und M der Pools (Story 2.12) und das alte Bauskript des Assistant (jetzt `tools/bpmn-assistant/`).

## Die Eingaben

Die Sätze, wie Spike 2.26 und die Stories 2.12 und 2.29 bis 2.31 sie gebildet haben:

| Satz | Eigene (hier) | Externe | Was |
|---|---|---|---|
| `sauber` | 48: 19 Fixtures aus `tests/fixtures/bpmn-layout/`, 29 in `eingaben/sauber/` | | der saubere Satz von Spike 2.26, gültig nach `pruefen.mjs` |
| `ben` | 2 | | Bens morgenroutine und krankheit |
| `extern` | | 20 (`x-…`) | von Menschen gezeichnete Prozesse, je mit Handlayout als Referenz |
| `pools`, `blackbox`, `angeheftet`, `notizen` | 5, 8, 11, 10 | 10, 7, 3, 13 | die Sätze der Stories 2.12, 2.29, 2.30, 2.31 |
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
- die Seiten `bpmn-feedback*.html`

Archiv und Auswertungen wurden am 2026-10-07 aus dem Store übernommen (`spike-2-26/testtool/feedback-saetze/`, `spike-2-26/out/feedback/`), damit das frühere Feedback beim Beispiel steht. `DOKUFIX_LAYOUT_ARBEIT` setzt einen anderen Ordner.
