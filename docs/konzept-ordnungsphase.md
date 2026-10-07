# Grobkonzept: eine Ordnungsphase zwischen LMM und Raster

Stand 7. Oktober 2026. Entstanden auf Commit `fb4b877`, überarbeitet nach einem Review am selben Tag (auf `bd8e9c7`); die Teile a), b) und b2) des ersten Schritts sind umgesetzt, mit den Messwerten unten. Ein Grobkonzept, nichts davon ist gebaut. Die Einschätzungen sind aus Code und Verlauf abgeleitet und nicht gemessen, wo nicht anders gesagt.

## Ausgangslage

Das Layout von BPMN ohne Koordinaten läuft heute in drei Schritten (`src/README.md`, *Diagrams*):

1. **LMM** (`src/app/lmm.js`) gibt jedem Flussknoten eine Spalte und liefert das Modell in einer kanonischen Ordnung (`kanonisch()`).
2. **Das Raster** (`layoutGeometry()`, `layoutGrid()`, `finishGrid()` in `src/app/bpmn-layout.js`, die Variante A2 aus Spike 2.26) beginnt mit allen Knoten in Zeile 0 ihrer Bahn. Die Regeln R1 bis R18 geben jedem Knoten Bahn, Zeile und Spalte. R7 verdichtet die Spalten, R8 hält Parallel-Blöcke frei.
3. **Der Router** zeichnet jeden Fluss auf dem Raster. Danach kommen Pixel, Beschriftungen, Notizen und der Diagrammteil (`appendDiagram()`).

Gemessen an einem klassischen Ebenen-Layout (Sugiyama) mit dem Fluss von links nach rechts:

| Phase | Was sie leistet | Bei uns |
|---|---|---|
| 1 Zyklen auflösen | Rückflüsse umdrehen | LMM |
| 2 Ebenen zuteilen | je Knoten eine Ebene, also eine **Spalte** | LMM; im Raster nachträglich verschoben (R7, R8, R9, R16, R18) |
| 3 Reihenfolge je Ebene | die Knoten einer Spalte von oben nach unten ordnen, mit wenig Kreuzungen | fehlt; die Regeln und Proben des Rasters erledigen es einzeln |
| 4 Koordinaten | die y-Lage, also die **Zeile**: Ketten über die Spalten hinweg auf eine Linie bringen, damit der Hauptweg gerade läuft | fehlt; R2, R3, R5, R15, R17 setzen Zeilen einzeln |

Wichtig für den Entwurf ist der Unterschied zwischen Phase 3 und 4. Eine Reihenfolge gilt je Spalte, eine Zeile im Raster aber über alle Spalten. Aus der Reihenfolge allein folgt noch keine Zeile: Damit der Hauptweg gerade bleibt, muss ein eigener Schritt die Zeilen über die Spalten hinweg ausrichten. Das Nachschärfen der Spalten ist dagegen keine Phase 4, sondern eine Verfeinerung von Phase 2.

## Das Problem

Ein guter Teil der Regeln gleicht vermutlich nur aus, was LMM nicht vorbereitet:

- **Spalten werden nachträglich repariert.** LMM kennt keine Parallel-Blöcke, keine Nachrichtenflüsse und keine Ports der Gateways. R7, R8, R9, R16 und R18 schieben danach Spalten. Die Regeln wurden ursprünglich an Mermaids Spalten abgestimmt, also an Vorgaben, die sich nicht ändern ließen; LMM gehört jetzt uns.
- **Zeilen werden durch Proben gesucht.** R10, R12, R13, R14, R16 und R18 sind Proben: Jede ordnet das ganze Bild an und behält ihre Änderung nur, wo es nicht schlechter wird. Das ist lokale Kreuzungsminimierung durch Ausprobieren. Die fehlende Phase täte es global und gezielt. Der Vorteil der Proben: Sie messen die Kreuzungen, die der Router wirklich zeichnet.
- **Laufzeit.** Gemessen am 7. Oktober 2026 in Node: hund2 läuft 68-mal komplett durch `finishGrid()` (1,1 s), x-wv6 90-mal (0,6 s), ref3 32-mal. Bens hund3 (77 Knoten) braucht 10 s in Chromium und 15 s in Firefox (Spike 2.26). Der Security-Review des Parsers hat dasselbe als offenen Punkt N3 benannt: Ein fremdes Dokument von wenigen hundert KB blockiert den Tab über die Laufzeit von `layoutGeometry()` (`docs/analyse-mermaid-im-bpmn-code.md`, Abschnitt 7). Die Phase senkt die Laufzeit, ersetzt aber keine Obergrenze, denn auch ein Ebenen-Layout ist nicht linear.
- **Befunde vom 7. Oktober 2026.** Drei von vier Befunden aus Bens Feedback gingen auf die Vorbereitung durch LMM zurück und wurden nachträglich im Raster behoben:
  - ref3: Bei einem Gleichstand von Split und End-Event bekam der Split die erste Spalte (R8).
  - x-miwg4: Ein Merge stand in derselben Spalte wie sein Vorgänger aus einer anderen Bahn (R1).
  - b-wv2: Der Weg mit mehr Knoten bekam die Hauptzeile, der Weg mit den Nachrichten an die Black Box die Zeile weiter weg vom Pool (R10).

## Die Phase

**Eingabe:** die Spalten von LMM, die Bahnen nach R1, das Modell in LMMs Ordnung.

R1 läuft vor der Phase, nicht im Raster danach: Die Bahn eines Knotens ist Eingabe der Reihenfolge je Bahn. Wer sie danach noch ändert, macht die Ordnung ungültig.

**Schritte:**

1. **Lange Flüsse zerlegen, mit einem Router auf Spaltenebene.** Ein Fluss über mehrere Spalten bekommt je Spalte eine Lage beim Eintritt in ihr Band und eine beim Austritt; dazwischen läuft er senkrecht (ein Port oben oder unten). Die Lage gibt keine feste Regel je Art des Flusses, sondern ein kleiner Router: je Fluss die Kandidaten Zeile der Quelle, Zeile des Ziels, Rinne oben, Rinne unten, genommen der billigste nach Hindernissen und Kreuzungen mit dem schon Gelegten (b2, `mini`). Nachrichtenflüsse kommen als eigene, gewichtete Kanten dazu.
2. **Reihenfolge je Spalte.** Mehrere Durchgänge von links nach rechts und zurück; jeder Knoten und Hilfspunkt wird nach der mittleren Lage seiner Nachbarn einsortiert (Baryzentrum oder Median), immer innerhalb seiner Bahn. Gleichstände entscheidet LMMs Ordnung, sodass das Ergebnis deterministisch und unabhängig von der Reihenfolge im XML bleibt.
   Die Konventionen, die heute als Regeln stehen, sind dabei harte Vorgaben:
   - der Hauptweg gerade, Ausnahmen darunter (R2)
   - Schleifen oben (R3), ein Abzweig in eine andere Bahn auf deren Seite (R4)
   - die Arme eines Parallel-Blocks zusammen, nah am Split (R5)
   - die Wege nach angehefteten Ereignissen unter ihrem Host (R17)
   - Start-Ereignisse vorn, je in eigener Zeile (R15)
   - sendende und empfangende Knoten auf der Seite ihres Pools (b-wv2)

   Ein reines Baryzentrum hält solche Vorgaben nicht ein. Es braucht eine eingeschränkte Kreuzungsminimierung: die Vorgaben als Teilordnung je Spalte, das Baryzentrum ordnet nur innerhalb dieser Teilordnung (Forster, „A Fast and Simple Heuristic for Constrained Two-Level Crossing Reduction“). Die Alternative sind Strafgewichte, die eine Verletzung teuer machen, aber nicht verbieten. Welcher Weg trägt, ist die eigentliche Frage des Spikes.
3. **Zeilen ausrichten.** Aus der Reihenfolge je Spalte werden Zeilen je Bahn. Ketten von Knoten, die der Hauptweg verbindet, kommen auf eine Zeile; dazwischen wird nur so weit verschoben, wie die Reihenfolge es erlaubt. Das klassische Vorbild ist Brandes und Köpf („Fast and Simple Horizontal Coordinate Assignment“), hier auf ganzzahlige Zeilen statt Pixel.
4. **Spalten nachschärfen.** Die gerade Übergabe einer Entscheidung (R18), die Breite eines Parallel-Blocks (R8), die ersten Knoten der Wege in einer Spalte (R9) und das Verdichten (R7), in einem Durchgang und als Bedingungen statt als Proben. Das verfeinert Phase 2. Ändert es eine Spalte so, dass sich die Nachbarschaft ändert, laufen die Schritte 2 und 3 noch einmal für die betroffenen Spalten.

**Ausgabe:** je Knoten Bahn, Zeile und Spalte statt nur der Spalte.

**Gezählt gegen gezeichnet.** Die Phase zählt Kreuzungen zwischen Hilfspunkten benachbarter Spalten. Der Router zeichnet orthogonal, mit Ports, Kanälen und Spuren. Beides kann auseinanderlaufen, dann optimiert die Phase ein Ersatzmaß. Der Spike misst deshalb über die Eingaben, wie gut die gezählten mit den gezeichneten Kreuzungen übereinstimmen. Eine einzelne Probe am Ende auf dem fertigen Bild darf bleiben, wo der Zusammenhang schwach ist.

## Was sich ändern müsste

- **Ein neues Modul neben `lmm.js`**, nicht dessen Erweiterung. Es wäre ganz eigener Code, und der von Mermaid übernommene Teil bliebe klar getrennt, auch lizenzrechtlich (`docs/analyse-mermaid-im-bpmn-code.md`, Abschnitt 4a). Die BPMN-Komponente soll unter LGPL-3.0 erscheinen; das neue Modul gehört dazu.
- **Die Schnittstelle zum Raster:** `layoutGeometry()` bekommt die Zeilen mitgeliefert, nicht nur die Spalten (`raw`), und sucht sie nicht mehr selbst.
- **Die Regeln**, vorläufige Zuordnung:

  | Regel | Heute | Mit der Phase |
  |---|---|---|
  | R1 | Bahn von Gateways und End-Ereignissen | bleibt (BPMN-Konvention), läuft aber vor der Phase |
  | R2, R5 | Zeilen für Wege und Arme | Vorgaben der Phase |
  | R3, R4, R6, R15, R17 | Schleifen, Abzweige, Sprünge, Starts, angeheftete Wege | Vorgaben der Phase |
  | R7, R8, R9 | Verdichten, Block-Breite, erste Knoten in einer Spalte | Nachschärfen der Spalten, als Bedingungen |
  | R10, R12, R13, R14, R16 | Proben auf Zeilen, Bahnen und Spalten | entfallen oder schrumpfen |
  | R11 | Enden ausrichten | bleibt (Bens Stilvorgabe) |
  | R18 | gerade Übergabe einer Entscheidung | Nachschärfen der Spalten |
  | Router | | bleibt |

- **Die Laufzeit** sollte deutlich sinken, weil die vielen Probe-Durchläufe wegfallen.
- **Tests:** Die Fixtures ändern sich fast alle; `npm run fixtures -- --write` schreibt sie neu, nachdem Ben die Bilder gesehen hat. Die Regeltests in `tests/bpmn-layout.test.mjs` werden zu Tests der Vorgaben. Der Test auf Unabhängigkeit von Reihenfolge und Namen (`tests/lmm.test.mjs`) bleibt unverändert und muss weiter grün sein.

## Vorgehen

Fast alle Bilder würden sich ändern. Deshalb zuerst als Spike neben dem heutigen Layout, wie Spike 2.26 es für A2 war. Die Werkzeuge in `tools/bpmn-layout/` haben dafür fast alles:

- `lauf.mjs` und `vergleich.mjs` über die 137 Eingaben: Brüche, Nähe zu den Handlayouts, Laufzeit
- `lauf.mjs --aus <regel>` zeigt, welche Regel mit der Phase noch etwas bewirkt; was nichts mehr bewirkt, kann gehen
- die Feedback-Seiten (`feedback-bauen.mjs`) für Bens Urteil am Bild, mit den Handfassungen daneben

Seit Teil a) des ersten Schritts misst `lauf.mjs` auch Kreuzungen und Knicke (`quality()` in `lib.mjs`) und zählt, wie oft `finishGrid()` je Regel läuft.

**Abnahme**, vorläufig:

| Größe | Heute | Ziel |
|---|---|---|
| Brüche, alle 137 Eingaben | 33 | höchstens 33 |
| Brüche, die 84 eigenen Eingaben (ohne die externen, gemessen auf `bd8e9c7`) | 13 | höchstens 13 |
| Kreuzungen der Sequenzflüsse, 84 eigene Eingaben | 41 | höchstens 41 |
| Kreuzungen der Nachrichtenflüsse, 84 eigene Eingaben | 15 | höchstens 15 |
| Knicke der Sequenzflüsse, 84 eigene Eingaben | 495 | höchstens 495 |
| Knicke der Nachrichtenflüsse, 84 eigene Eingaben | 18 | höchstens 18 |
| Läufe von `finishGrid()`, 84 eigene Eingaben | 1668 | deutlich weniger |
| Laufzeit der 84 eigenen Eingaben in Node (`lauf.mjs`) | 21 s | höchstens die Hälfte |
| Laufzeit von hund3 in Chromium | 10 s | unter 1 s |
| Unabhängig von Reihenfolge und Namen im XML (`tests/lmm.test.mjs`) | gegeben | bleibt |
| Bens Urteil an den Bildern | | angenommen |

## Risiken

- **Bens Feedback steckt in den Regeln.** Viele Kommentare im Code tragen „Ben, 2026-10-0x“ und eine Begründung am Beispiel. Diese Entscheidungen müssen als Vorgaben in die neue Phase wandern, sonst gehen sie verloren. Die Liste lässt sich vorab mit `grep` aus `src/app/bpmn-layout.js` erzeugen und gehört als Tabelle (Regel, Beispiel, Vorgabe in der Phase) an den Anfang des Spikes.
- **Alle Bilder ändern sich.** Auch die, die heute gut sind. Ben sieht sie, bevor etwas ins Produkt geht.
- **Zwei Wege gleichzeitig.** Solange der Spike läuft, entwickeln sich Raster und Phase nebeneinander. Vorschlag: Die Regeln werden für die Dauer des Spikes eingefroren. Wo das nicht geht, steht jede Regeländerung auf einer Liste, die der Spike abarbeitet.
- **Ersatzmaß.** Gezählte und gezeichnete Kreuzungen können auseinanderlaufen (siehe oben). Das misst der Spike, bevor er auf das Zählmodell baut.
- **Unabhängigkeit von Reihenfolge und Namen.** Gleichstände nach LMMs Ordnung zu entscheiden reicht nur, wenn auch die Hilfspunkte kanonisch geordnet sind, etwa nach dem Fluss, zu dem sie gehören, in LMMs Ordnung der Flüsse.

## Erster Schritt (Vorschlag)

Ein erster Schritt soll schon Ergebnisse liefern, ohne alle Bilder zu ändern und ohne die Schnittstelle zum Raster anzufassen. Vorschlag: **R10 als Rechnung statt als Probe**, davor die Messung, die man dafür ohnehin braucht.

**a) Messen (umgesetzt, 7. Oktober 2026).**
- `lauf.mjs` misst Kreuzungen und Knicke, auch die der Nachrichtenflüsse, aus dem Diagrammteil (`quality()` in `tools/bpmn-layout/lib.mjs`), für jeden Stand gleich.
- `lauf.mjs` zählt, wie oft `finishGrid()` je Regel läuft. Dazu füllt `layoutGeometry()` ein optionales Objekt `options.runs`, ohne Wirkung auf das Bild (Test in `tests/bpmn-layout.test.mjs`; die 84 Bilder sind byte-gleich mit `bd8e9c7`).
- Die Grundlinie steht in der Abnahme oben. Die Läufe von `finishGrid()` über die 84 eigenen Eingaben, nach der Regel, deren Proben sie auslösten:

  | R16 | R12 | R11 | R13 | R14 | R18 | R10 | zusammen |
  |---|---|---|---|---|---|---|---|
  | 490 | 322 | 236 | 218 | 178 | 170 | 54 | 1668 |

  Jede Probe ordnet zweimal an (mit und ohne zweiten Durchgang des Routers). R11 schließt mit dem Bild ab, das zurückgegeben wird; deshalb erscheint „final“ nicht eigens.
- **Befund:** R10 kostet nur gut 3 % der Läufe. Die Zeit steckt in R16 (zwei Gateways übereinander, eines eine Spalte weiter probiert), R12 (Kreuzungsprobe) und R11 (Enden ausrichten). Für die Laufzeit bringt c) also wenig; das ändert die Reihenfolge danach (siehe unten).

**b) Das Zählmodell prüfen.**
- Die Schritte 1 und 2 der Phase in einem eigenen Modul unter `spikes/`: Hilfspunkte je Spalte und Kreuzungen zwischen benachbarten Spalten. Gezählt wird auf dem fertigen Raster des heutigen Layouts.
- Diese Zahl wird je Eingabe mit den gezeichneten Kreuzungen aus a) verglichen.
- Ergebnis: ob das Ersatzmaß trägt, mit Zahlen. Das ist das größte Risiko der ganzen Phase, und es lässt sich so prüfen, bevor etwas am Produkt geändert ist.

**Ergebnis von b) (umgesetzt, 7. Oktober 2026, `spikes/ordnungsphase/BERICHT.md`):**
- Von den 41 gezeichneten Kreuzungen liegen nur 5 zwischen zwei Vorwärtsflüssen, also dort, wo ein klassisches Ebenen-Modell zählt. 20 betreffen einen Fluss innerhalb einer Spalte (R4, R6 und R9 setzen Knoten in die Spalte ihres Gateways), 16 einen Rückfluss in der Rinne.
- Liegen die Hilfspunkte wie im gezeichneten Bild und zählen Flüsse innerhalb einer Spalte als senkrechte Stücke mit, trägt die Zählung: Die Korrelation liegt bei 0,88 über 123 Bilder. In 18 Bildpaaren, die sich in den Kreuzungen unterscheiden, zeigt sie nie in die falsche Richtung, und die 6 Entscheidungen von R10 erkennt sie alle.
- Mit einer einfachen Regel für die Lage (Zeile der Quelle) liegt sie in 9 der 18 Paare falsch herum.
- **Folge:** Die eigentliche Schwierigkeit der Phase ist die Lage der Hilfspunkte, nicht das Zählen. Die Phase muss vorhersagen, welche Zeile oder Rinne der Router zwischen zwei Spalten nimmt und welche Ports. Das wird ein eigener Schritt b2), vor c).

**b2) Die Lage der Hilfspunkte wie der Router (umgesetzt, 7. Oktober 2026, `spikes/ordnungsphase/BERICHT.md`, Teil b2).**
- Das Zählmodell kennt jetzt auch senkrechte Stücke in einer Spalte (Ports oben und unten). Mit der Lage aus dem gezeichneten Bild steigt die obere Schranke auf eine Korrelation von 0,89 und 14 von 18 Paaren richtig.
- Eine feste Form je Art des Flusses reicht nicht; sie lag in 6 Paaren falsch herum. Der Router entscheidet nach Hindernissen: Lange Vorwärtsflüsse gehen über die äußere Rinne, wenn das Bild dazwischen voll ist.
- **Ein Router auf Spaltenebene trägt** (`mini`): vier Kandidaten je Fluss (Zeile der Quelle, Zeile des Ziels, Rinne oben, Rinne unten), ein geschnittener Knoten kostet 1000, eine Kreuzung mit dem schon Gelegten 1, die Vorlieben aus den gezeichneten Formen entscheiden Gleichstände. In den 18 Paaren liegt er nie falsch herum (9 richtig, 9 gleich) und trifft alle 6 Entscheidungen von R10.
- Er zählt zu wenig (64 statt 121): Spuren in einem Kanal, Ports an der Seite einer Aufgabe und manche Rückflüsse fehlen. Bei R12 sieht er 5 von 7 Unterschieden nicht.
- **Folge für die Phase:** Schritt 1 ist kein Zerlegen mit fester Lage, sondern ein kleiner Router auf Spaltenebene. Die 6 Paare von R10 sind schmal (5 davon hund2 und seine Abwandlungen); vor dem Produkt braucht es mehr Fälle, am besten die externen Eingaben.

**c) R10 durch eine Rechnung ersetzen.**
- R10 heute (`ruleRowProbe()`): Für jede Gruppe von Zeilen, die R2 einem Weg gibt, ordnet R10 das ganze Bild ein weiteres Mal an, mit dem Weg auf der anderen Seite. Es behält das nur, wenn die Kreuzungen weniger werden. Das kostet einen vollen Lauf je Gruppe.
- Die Rechnung: Für jede Gruppe zählt `mini` (b2) beide Seiten auf dem Raster, ohne zu routen; genommen wird die Seite mit weniger Kreuzungen, bei Gleichstand bleibt die Seite von R2. Nachrichtenflüsse zählen gewichtet zur Seite ihres Pools (die Vorgabe aus b-wv2). Dazu braucht `mini` eine Fassung im Layout, die mit Zellen (Bahn, Zeile, Spalte) statt mit dem Diagrammteil arbeitet.
- Hinter einem eigenen Schalter in `DEFAULT_RULES` (etwa `rowOrder`), sodass `lauf.mjs --aus rowOrder` und `vergleich.mjs` alt und neu nebeneinanderstellen.
- Ergebnis:
  - wie viele Bilder sich ändern und ob sie besser oder schlechter werden (Brüche, Kreuzungen, Knicke),
  - wie viele Läufe von `finishGrid()` wegfallen,
  - ob Bens Befund b-wv2 ohne Probe so ausfällt wie heute.

Warum R10 trotzdem zuerst: Es ist die Probe, die am klarsten Phase 3 ist (die Seite eines Wegs innerhalb seiner Bahn), sie hängt an einer einzigen Stelle, und ihr Ergebnis ist schon heute auf Kreuzungen gemessen. Das macht den Vergleich eindeutig, und es prüft das Zählmodell an einem kleinen Fall. Für die Laufzeit zählen danach R16 und R12: R16 gehört zum Nachschärfen der Spalten (Schritt 4 der Phase), R12 zur Reihenfolge je Spalte (Schritt 2). Trägt die Rechnung bei R10, folgt R12 mit demselben Zählmodell, dann R16 als Bedingung. Trägt sie nicht, zeigt b), ob das Zählmodell oder die Vorgabe schuld ist.

## Offene Fragen

- Baryzentrum oder Median, und wie viele Durchgänge? Exakt (alle Reihenfolgen probieren) wächst je Spalte faktoriell; wenn überhaupt, dann nur bis zu einer festen Schranke, etwa 6 Knoten je Bahn und Spalte.
- Wie stark wiegen Nachrichtenflüsse gegenüber Sequenzflüssen?
- Teilordnung (Forster) oder Strafgewichte für die Vorgaben?
- Wie viel Nachschärfen der Spalten ist als Bedingung lösbar, und wo braucht es weiter eine Probe?
- Welche Obergrenze für die Größe des Layouts (Analyse, Abschnitt 7), unabhängig von der Phase?
