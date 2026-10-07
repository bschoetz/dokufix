# Grobkonzept: eine Ordnungsphase zwischen LMM und Raster

Stand 7. Oktober 2026, Commit `fb4b877`. Ein Grobkonzept, noch nicht verfeinert, nichts davon ist gebaut. Die Einschätzungen sind aus Code und Verlauf abgeleitet und nicht gemessen, wo nicht anders gesagt.

## Ausgangslage

Das Layout von BPMN ohne Koordinaten läuft heute in drei Schritten (`src/README.md`, *Diagrams*):

1. **LMM** (`src/app/lmm.js`): je Flussknoten eine Spalte, dazu das Modell in einer kanonischen Ordnung (`kanonisch()`). LMM baut die ersten zwei Phasen eines klassischen Ebenen-Layouts (Sugiyama) nach: Zyklen auflösen und Ebenen (Spalten) zuteilen.
2. **Das Raster** (`layoutGeometry()`, `layoutGrid()`, `finishGrid()` in `src/app/bpmn-layout.js`, die Variante A2 aus Spike 2.26): Es beginnt mit allen Knoten in Zeile 0 ihrer Bahn und gibt ihnen mit den Regeln R1 bis R18 Bahn, Zeile und Spalte. R7 verdichtet die Spalten, R8 hält Parallel-Blöcke frei.
3. **Der Router** zeichnet jeden Fluss auf dem Raster, dann Pixel, Beschriftungen, Notizen und der Diagrammteil (`appendDiagram()`).

Was fehlt, sind die dritte und die vierte Phase des Ebenen-Layouts: die **Reihenfolge innerhalb der Ebenen** (bei uns: welche Zeile seiner Bahn ein Knoten bekommt), gewählt so, dass wenig gekreuzt wird, und die **Koordinaten** (bei uns: das Nachschärfen der Spalten). Beides erledigen heute die Regeln des Rasters, einzeln und durch Ausprobieren.

## Das Problem

Ein guter Teil der Regeln gleicht vermutlich nur aus, was LMM nicht vorbereitet:

- **Spalten werden nachträglich repariert.** LMM kennt keine Parallel-Blöcke, keine Nachrichtenflüsse und keine Ports der Gateways. R7, R8, R9, R16 und R18 schieben danach Spalten. Die Regeln wurden ursprünglich an Mermaids Spalten abgestimmt, also an Vorgaben, die sich nicht ändern ließen; LMM gehört jetzt uns.
- **Zeilen werden durch Proben gesucht.** R10, R12, R13, R14, R16 und R18 sind Proben: Jede ordnet das ganze Bild an und behält ihre Änderung nur, wo es nicht schlechter wird. Das ist lokale Kreuzungsminimierung durch Ausprobieren, was die fehlende Phase global und gezielt täte.
- **Laufzeit.** Gemessen am 7. Oktober 2026 in Node: hund2 läuft 68-mal komplett durch `finishGrid()` (1,1 s), x-wv6 90-mal (0,6 s), ref3 32-mal. Bens hund3 (77 Knoten) braucht 10 s in Chromium und 15 s in Firefox (Spike 2.26).
- **Befunde vom 7. Oktober 2026.** Drei von vier Befunden aus Bens Feedback gingen auf die Vorbereitung durch LMM zurück und wurden nachträglich im Raster behoben:
  - ref3: Bei einem Gleichstand von Split und End-Event bekam der Split die erste Spalte (R8).
  - x-miwg4: Ein Merge stand in derselben Spalte wie sein Vorgänger aus einer anderen Bahn (R1).
  - b-wv2: Der Weg mit mehr Knoten bekam die Hauptzeile, der Weg mit den Nachrichten an die Black Box die Zeile weiter weg vom Pool (R10).

## Die Phase

**Eingabe:** die Spalten von LMM, die Bahnen des Autors, das Modell in LMMs Ordnung.

**Schritte:**

1. **Lange Flüsse zerlegen.** Ein Fluss über mehrere Spalten wird in Zwischenpunkte je Spalte geteilt, damit sich Kreuzungen überhaupt zählen lassen. Nachrichtenflüsse kommen als eigene, gewichtete Kanten dazu.
2. **Zeilen je Bahn festlegen.** Mehrere Durchgänge von links nach rechts und zurück; jeder Knoten wird nach der mittleren Lage seiner Nachbarn einsortiert (Baryzentrum oder Median), die Ordnung von LMM entscheidet bei Gleichstand, sodass das Ergebnis deterministisch bleibt. Feste Vorgaben halten dabei die Konventionen ein, die heute als Regeln stehen:
   - der Hauptweg gerade, Ausnahmen darunter (R2)
   - Schleifen oben (R3), ein Abzweig in eine andere Bahn auf deren Seite (R4)
   - die Arme eines Parallel-Blocks zusammen, nah am Split (R5)
   - die Wege nach angehefteten Ereignissen unter ihrem Host (R17)
   - Start-Ereignisse vorn, je in eigener Zeile (R15)
   - sendende und empfangende Knoten auf der Seite ihres Pools (b-wv2)
3. **Spalten nachschärfen.** Die gerade Übergabe einer Entscheidung (R18), die Breite eines Parallel-Blocks (R8), die ersten Knoten der Wege in einer Spalte (R9) und das Verdichten (R7) in einem Durchgang, als Bedingungen statt als Proben.

**Ausgabe:** je Knoten Bahn, Zeile und Spalte statt nur der Spalte.

## Was sich ändern müsste

- **Ein neues Modul,** neben LMM oder als dessen Erweiterung. Es wäre ganz eigener Code; der von Mermaid übernommene Teil bliebe in `lmm.js` (Lizenz: `docs/analyse-mermaid-im-bpmn-code.md`, Abschnitt 4a).
- **Die Schnittstelle zum Raster:** `layoutGeometry()` bekommt die Zeilen mitgeliefert, nicht nur die Spalten (`raw`), und sucht sie nicht mehr selbst.
- **Die Regeln**, vorläufige Zuordnung:

  | Regel | Heute | Mit der Phase |
  |---|---|---|
  | R1 | Bahn von Gateways und End-Ereignissen | bleibt (BPMN-Konvention) |
  | R2, R5 | Zeilen für Wege und Arme | Vorgaben der Phase |
  | R3, R4, R6, R15, R17 | Schleifen, Abzweige, Sprünge, Starts, angeheftete Wege | Vorgaben der Phase |
  | R7, R8, R9 | Verdichten, Block-Breite, erste Knoten in einer Spalte | Nachschärfen der Spalten, als Bedingungen |
  | R10, R12, R13, R14, R16 | Proben auf Zeilen, Bahnen und Spalten | entfallen oder schrumpfen |
  | R11 | Enden ausrichten | bleibt (Bens Stilvorgabe) |
  | R18 | gerade Übergabe einer Entscheidung | Nachschärfen der Spalten |
  | Router | | bleibt |

- **Die Laufzeit** sollte deutlich sinken, weil die vielen Probe-Durchläufe wegfallen.
- **Tests:** Die Fixtures ändern sich fast alle; `npm run fixtures -- --write` schreibt sie neu, nachdem Ben die Bilder gesehen hat. Die Regeltests in `tests/bpmn-layout.test.mjs` werden zu Tests der Vorgaben.

## Vorgehen

Fast alle Bilder würden sich ändern. Deshalb zuerst als Spike neben dem heutigen Layout, wie Spike 2.26 es für A2 war. Die Werkzeuge in `tools/bpmn-layout/` haben dafür alles:

- `lauf.mjs` und `vergleich.mjs` über die 137 Eingaben: Brüche, Knicke, Knicke der Nachrichtenflüsse, Nähe zu den Handlayouts, Laufzeit
- `lauf.mjs --aus <regel>` zeigt, welche Regel mit der Phase noch etwas bewirkt; was nichts mehr bewirkt, kann gehen
- die Feedback-Seiten (`feedback-bauen.mjs`) für Bens Urteil am Bild, mit den Handfassungen daneben

Abnahme, vorläufig: nicht mehr Brüche als heute (33), Kreuzungen und Knicke nicht mehr, die Laufzeit von hund3 deutlich unter heute, und Bens Urteil an den Bildern.

## Risiken

- **Bens Feedback steckt in den Regeln.** Viele Kommentare im Code tragen „Ben, 2026-10-0x“ und eine Begründung am Beispiel. Diese Entscheidungen müssen als Vorgaben in die neue Phase wandern, sonst gehen sie verloren. Eine Liste aller solchen Stellen gehört an den Anfang des Spikes.
- **Alle Bilder ändern sich.** Auch die, die heute gut sind. Ben sieht sie, bevor etwas ins Produkt geht.
- **Zwei Wege gleichzeitig.** Solange der Spike läuft, entwickeln sich Raster und Phase nebeneinander; Änderungen an den Regeln in dieser Zeit müssen in beide.

## Offene Fragen

- Baryzentrum oder Median, und wie viele Durchgänge? Bei kleinen Prozessen auch exakt (alle Reihenfolgen probieren)?
- Wie stark wiegen Nachrichtenflüsse gegenüber Sequenzflüssen?
- Sollen Bahnwechsel von Gateways (R1) in die Phase, damit die Zeilen sie schon kennen?
- Kommt die Phase in `lmm.js` (dann „LMM“ als ganzes Ebenen-Layout) oder in ein eigenes Modul?
- Wie viel Nachschärfen der Spalten ist als Bedingung lösbar, und wo braucht es weiter eine Probe?
