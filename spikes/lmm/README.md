# Spike: LMM (Arbeitstitel arielle)

Die Versuche zur Ablösung von Mermaid als Layout-Engine für BPMN ohne Koordinaten, gesichert aus dem Scratchpad der Sitzung vom 7. Oktober 2026. Die Komponente, die Mermaid dabei ersetzt, heißt **LMM** (kurz für „Little Mermaid“, ein Wortspiel auf LLM). Sie berechnet die Spalte jedes Knotens. Ihr Arbeitstitel war „arielle“; unter diesem Namen stehen die Dateien und Funktionen hier im Spike (`arielle()`, `arielleExakt()`). In `src/` heißt sie `src/app/lmm.js`: Seit dem 7. Oktober 2026 ist LMM dort mit `lmm()` und `kanonisch()` (der Fassung aus `notizen/kanonisch-notizen.mjs`) eingebaut und ersetzt Mermaid als Layout-Engine.

Auswertung und Begründungen: `docs/analyse-mermaid-im-bpmn-code.md`, vor allem die Abschnitte 2 bis 3b und 4a. Der ausführliche Bericht des Reviews: `review/BERICHT.md`.

Nichts hier ist Teil des Builds oder der Tests von dokufix. `src/` und `tests/` sind unverändert.

## Die Fassungen

| Datei | Export | Was |
|---|---|---|
| `review/ranks-optimiert.mjs` | `arielle(model)` | **Die empfohlene Fassung.** Mermaids Schichtung mit einer Ordnung aus der Struktur des Prozesses, ohne Beschriftungsspalte (Analyse, Abschnitt 3a) |
| `review/ranks-exakt.mjs` | `arielleExakt(model)` | Exakter Nachbau von Mermaid 12.0.0, korrigiert und gestrafft. Referenz |
| `ranks.mjs` | `mermaidRanks(model)` | Der erste, enge Nachbau. Er enthält den Fehler mit Beschriftungen, die `q()` leert (`review/BERICHT.md`, Abschnitt 1.3) |
| `kanonisch/kanonisch.mjs` | `kanonisch(model)` → `{ model, rank }` | **Die empfohlene Sortierung des Modells** vor `layoutGeometry()`: macht das fertige Layout stabil gegen Umordnung (Analyse, Abschnitt 3b). Braucht `kanonisch/arielle-order.mjs` |
| `check/canon.mjs` | `canonical(model)` (im Skript) | Der erste Versuch einer kanonischen Sortierung, durch `kanonisch()` überholt |

arielle beruht auf dem Swimlane-Layout von Mermaid 12.0.0 (MIT, Copyright (c) 2014 - 2022 Knut Sveidqvist). Bei der Übernahme nach `src/` wird LMM Teil der BPMN-Komponente, die unter der LGPL-3.0 steht. Mermaids MIT-Hinweis bleibt im Dateikopf erhalten (Analyse, Abschnitt 4a).

## Die Skripte

Alle Skripte laufen mit Node aus ihrem eigenen Ordner, also `cd spikes/lmm` (bzw. `review/`, `check/`), dann `node <skript>`. Sie importieren Module aus dem Repository über den absoluten Pfad `/home/user/dokufix/`. Wer das Repository woanders hat, passt diesen Pfad an. Vorausgesetzt ist `npm ci` im Repository.

Die Browser-Skripte brauchen außerdem `dist/dokufix.html`, den CDN-Spiegel aus `tests/cdn.mjs` (er lädt beim ersten Lauf vom CDN nach `tests/.cdn/`) und Chromium unter `/opt/pw-browsers/chromium`.

**Ordner `spikes/lmm/` (die eigenen Versuche):**

| Skript | Browser | Was |
|---|---|---|
| `ranks.mjs` | nein | Nachbau gegen die 57 Fixtures: Spaltenordnung, XML beider Messarten |
| `random.mjs` | ja | Nachbau gegen das echte Mermaid, 300 Zufallsprozesse |
| `plaincheck.mjs` | nein | `localeCompare` gegen einfachen Zeichenvergleich, 2 000 Zufallsprozesse (braucht `ranks-plain.mjs`, das `quirks.mjs` schreibt) |
| `quirks.mjs` | nein | Eigenheiten: Zeichenvergleich, ohne Beschriftungsknoten, Rückwärtsflüsse |
| `timing.mjs` | nein | Laufzeit des Nachbaus |
| `experiment.mjs`, `experiment.json` | ja | Konfigurationsvarianten von Mermaid gegen die Fixtures, Laufzeit von `mermaid.render()` (Analyse, Anhang B, Hinweise 2 und 3a) |
| `directive.mjs`, `directive2.mjs`, `directive3.mjs` | teils | Direktiven `%%{…}%%` in BPMN-Beschriftungen (Anhang B, Hinweis 3b) |
| `assistant.mjs` | ja | BPMN-Assistent mit und ohne Mermaid (Anhang B, Hinweis 4) |
| `compare.mjs` | nein | Funktionen im BPMN-Assistenten gegen die Quellen (Anhang B, Hinweis 5) |

**Ordner `check/` (Nachprüfung des Reviews und Raster-Versuch):**

| Skript | Was |
|---|---|
| `invariance.mjs` | unabhängiger Permutationstest: Spalten von `arielleExakt` und `arielle` bei Umordnung des XML |
| `canon.mjs` | Layoutänderung bei Umordnung, mit und ohne kanonisch sortiertes Modell |
| `canon-quality.mjs` | Regelverstöße, Kreuzungen und Knicke mit kanonisch sortiertem Modell, je Fixture |
| `leser-check.mjs` | unabhängige Nachprüfung des XML-Lesers aus `parsing/` gegen Chromiums `DOMParser` |
| `messer-check.mjs` | unabhängige Nachprüfung des Messers aus `diagram-js/` gegen bpmn-js in Chromium |
| `kanonisch-check.mjs` | unabhängige Nachprüfung von `kanonisch()`: Layout bei Umordnung, Verstöße, Kreuzungen, Knicke |
| `debug.mjs` | Hilfsskript zum Lesen des XML mit linkedom |

**Ordner `messen/` (Größe der Beschriftungen):**

| Skript | Browser | Was |
|---|---|---|
| `probe.mjs` | ja | Was bpmn-js beim Messen nutzt: nur den Textrenderer, der auch nach dem Zerstören des Viewers weiter misst |
| `schaetzung.mjs` | nein | Wie weit die Schätzung `labelSize()` von den gemessenen Größen der Fixtures abweicht |

**Ordner `parsing/`:** das fünfte Review: XML in jeder Umgebung gleich lesen. Prototyp eines eigenen XML-Lesers (`leser.mjs`), Korpus heikler Fälle (`korpus/`), Messungen gegen Chromium, Firefox, linkedom, saxen und weitere Bibliotheken (`ergebnisse/`), Bericht `parsing/BERICHT.md`. `ergebnisse/ergebnisse.json` ist kompakt gespeichert (`speicher.mjs`): Ein Ergebnis, das dasselbe Modell liest wie Chromium oder wie dieselbe Bibliothek unter Node, verweist darauf, statt das Modell zu wiederholen. Das ist verlustfrei, die Datei schrumpfte von 15 MB auf 2,3 MB, und `messen.mjs` und `tabelle.mjs` lesen und schreiben das Format selbst. Die Vergleichsbibliotheken und die Browser Firefox und WebKit liegen außerhalb des Repositorys (Pfade in den Skripten).

**Ordner `diagram-js/`:** das vierte Review: Beschriftungsgrößen mit einem Nachbau des Textlayouts von diagram-js und einer Breitentabelle (`messer.mjs`, `breiten-*-12px.json`, Bericht `diagram-js/BERICHT.md`). `groessen-hier/` hält die in diesem Chromium erfassten Größen und Rohpositionen der 57 Fixtures fest, gegen die `layout.mjs` vergleicht. `browser.mjs` und `variante-b.mjs` brauchen die npm-Pakete `bpmn-js@18.31.0` und `diagram-js@15.28.0` außerhalb des Repositorys (`npm pack`); der Pfad steht im Skript.

**Ordner `kanonisch/`:** das zweite Review, das der kanonischen Sortierung. Bericht, Varianten, Messdaten und die Kopie `bpmn-layout-intern.js` für die Alternative „Ordnung als Schlüssel in den Regeln“ stehen in `kanonisch/BERICHT.md`.

**Ordner `review/`:** die Skripte, Protokolle und Messdaten des Reviews. Die Liste mit Erklärungen steht am Ende von `review/BERICHT.md`. `browser-raws.json` hält die Rohpositionen aus dem Browserlauf fest, damit `browser-eval.mjs` ohne Browser auswerten kann.

## Nicht gesichert

- Das npm-Paket `mermaid@12.0.0` (149 MB), aus dem der Algorithmus gelesen wurde. Es ist fremder Code und lässt sich jederzeit mit `npm pack mermaid@12.0.0` wieder holen. Die Analyse nennt die Quellpfade.
- Ein Entwurf des Hauptteils der Analyse; er steht vollständig in `docs/analyse-mermaid-im-bpmn-code.md`.
