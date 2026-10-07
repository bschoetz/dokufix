# Ordnungsphase, Teil b: Trägt das Zählmodell?

Stand 7. Oktober 2026, Teil b auf `154797a`, Teil b2 auf `5d051a2` (unten). Teil b des ersten Schritts aus `docs/konzept-ordnungsphase.md`: Zählt ein Ebenen-Modell (Kreuzungen zwischen benachbarten Spalten, an Knoten und Hilfspunkten) die Kreuzungen, die der Router zeichnet? Und erkennt es, welches von zwei Bildern weniger Kreuzungen hat? Das muss eine Rechnung leisten, die eine Probe ersetzt.

## Aufbau

- `zaehlmodell.mjs`: Spalten und Lagen aus dem fertigen Diagrammteil (x-Mitten der Flussknoten, y-Mitten); je Sequenzfluss über mehrere Spalten ein Hilfspunkt je Spalte dazwischen. Seine Lage gibt eine von vier Regeln:
  - `router`: die y, auf der der gezeichnete Fluss die Spalte kreuzt,
  - `quelle`: die y der Quelle,
  - `ziel`: die y des Ziels,
  - `linear`: dazwischen.

  Mit `+spalte` zählt ein Fluss innerhalb einer Spalte als senkrechtes Stück mit.
- `pruefen.mjs`: vergleicht die gezählten mit den gezeichneten Kreuzungen der Sequenzflüsse (`quality()` in `tools/bpmn-layout/lib.mjs`), je Bild und je Bildpaar.
- `diagnose.mjs`: ordnet jede gezeichnete Kreuzung nach der Art der beiden Flüsse und der Lage des Schnittpunkts ein.
- **Daten:** die 84 eigenen Eingaben, angeordnet mit `lauf.mjs` als `produkt` und fünfmal mit einer abgeschalteten Probe:
  - `--aus rowProbe` (R10),
  - `--aus crossProbe` (R12),
  - `--aus combProbe` (R14),
  - `--aus stepAside` (R13),
  - `--aus stagger` (R16).

  Das ergibt 123 verschiedene Bilder und 39 Paare, die sich unterscheiden. In 18 davon unterscheiden sich die gezeichneten Kreuzungen.

So wiederholen (Läufe nach `DOKUFIX_LAYOUT_ARBEIT`, Vorgabe `tools/bpmn-layout/arbeit/`):

```
node tools/bpmn-layout/lauf.mjs --quiet
for r in rowProbe crossProbe combProbe stepAside stagger; do node tools/bpmn-layout/lauf.mjs --quiet --lauf ohne-$r --aus $r; done
node spikes/ordnungsphase/pruefen.mjs
node spikes/ordnungsphase/diagnose.mjs
```

## Ergebnisse von b

Die Tabellen dieses Abschnitts stammen vom Zählmodell in `5d051a2`. Seit b2 heißen die Regeln anders: `router+spalte` von hier ist in b2 der Kern von `router`, das dort auch die Ports kennt.

**Wo die Kreuzungen liegen** (`diagnose.mjs`, `produkt`, 41 Kreuzungen):

| Art der beiden Flüsse | Kreuzungen |
|---|---|
| ein Fluss innerhalb einer Spalte beteiligt | 20 |
| ein Rückfluss beteiligt, kein Fluss innerhalb einer Spalte | 16 |
| zwei Vorwärtsflüsse | 5 |

Nur 5 von 41 sind die Art, für die ein klassisches Ebenen-Modell gebaut ist. Flüsse innerhalb einer Spalte stellen die Regeln selbst her: R4, R6 und R9 setzen Knoten in die Spalte ihres Gateways. Rückflüsse führt der Router über eine Rinne oben herum, nicht als umgedrehte Vorwärtsflüsse.

**Je Bild** (123 Bilder, 121 gezeichnete Kreuzungen in 45 Bildern):

| Regel | gleich | höchstens 1 daneben | Σ Abweichung | gezählt | Korrelation | Kreuzungen übersehen (Bilder) |
|---|---|---|---|---|---|---|
| router | 91 | 104 | 69 | 58 | 0,78 | 17 |
| quelle | 83 | 106 | 73 | 100 | 0,81 | 22 |
| ziel | 84 | 105 | 76 | 103 | 0,74 | 19 |
| linear | 77 | 94 | 107 | 166 | 0,80 | 15 |
| **router+spalte** | **98** | **117** | **38** | **89** | **0,88** | **10** |
| quelle+spalte | 81 | 94 | 127 | 170 | 0,80 | 21 |

**Je Paar** (18 Paare, in denen sich die gezeichneten Kreuzungen unterscheiden: Erkennt die Zählung die Richtung?):

| Regel | richtig | gezählt gleich | falsch herum | davon R10 (6 Paare) richtig |
|---|---|---|---|---|
| router | 9 | 9 | 0 | 3 |
| quelle | 5 | 13 | 0 | 0 |
| ziel | 9 | 6 | 3 | 1 |
| linear | 11 | 4 | 3 | 3 |
| **router+spalte** | **12** | **6** | **0** | **6** |
| quelle+spalte | 1 | 8 | 9 | 0 |

## Was daraus folgt

1. **Ein Ebenen-Modell trägt, wenn die Hilfspunkte so liegen wie im Router und Flüsse innerhalb einer Spalte mitzählen.** Mit `router+spalte` liegt die Korrelation bei 0,88, und die Zählung zeigt in keinem der 18 Paare in die falsche Richtung. Die 6 Entscheidungen von R10 erkennt sie alle.
2. **Die Lage der Hilfspunkte ist die eigentliche Schwierigkeit, nicht das Zählen.** Mit einer einfachen Regel für die Lage (`quelle+spalte`) liegt die Zählung in 9 der 18 Paare falsch herum. Sie ist damit schlechter als gar keine Rechnung. Die Phase braucht eine Lage der Hilfspunkte, die dem Router folgt: welche Zeile oder Rinne ein Fluss zwischen zwei Spalten nimmt, und auf welcher Seite er einen Knoten verlässt und erreicht (Ports).
3. **Was noch fehlt.** In 10 Bildern mit Kreuzungen zählt auch `router+spalte` keine. Diese Bilder haben 21 gezeichnete Kreuzungen:
   - 11 betreffen einen Rückfluss, meist in der Rinne über den Zeilen (Schleifen oben, R3),
   - 5 betreffen einen Fluss innerhalb einer Spalte, dessen Stück an einem Port oben oder unten liegt, nicht zwischen den Knotenmitten,
   - 5 liegen zwischen zwei Vorwärtsflüssen, die in derselben Lücke die Zeile wechseln, ohne ihre Reihenfolge an den Spalten zu tauschen (u3, u13).

   Ein Modell der Rinne, der Ports und der Spuren in einer Lücke gehört in die Phase.
4. **Für Schritt c)** heißt das: R10 als Rechnung ist nur so gut wie die Lage der Hilfspunkte nach dem Tausch. Eine Rechnung, die vom gezeichneten Bild eines einzigen Laufs ausgeht, liefert die Lage für alle Flüsse, die der Tausch nicht berührt. Für die Flüsse des getauschten Wegs muss sie die Lage vorhersagen.

## Grenzen

- Nur die 84 eigenen Eingaben; die externen fehlen in dieser Umgebung.
- 18 Paare sind wenig. Die Aussage „nie falsch herum“ gilt für diese 18.
- `router` liest die Lage aus dem gezeichneten Bild. Das ist die obere Schranke für ein Ebenen-Modell, kein Verfahren für die Phase.
- Nur Sequenzflüsse; Nachrichtenflüsse sind nicht gezählt.

## Teil b2: die Lage der Hilfspunkte wie der Router

**Frage:** Lässt sich die Lage der Hilfspunkte so vorhersagen, ohne zu routen, dass die Zählung die Richtung der Unterschiede trifft? Ziel aus dem Konzept: in den 18 Paaren nie falsch herum, die 6 von R10 richtig.

**Das Modell verallgemeinert** (`zaehlmodell.mjs`):
- Jeder Fluss hat je Spalte eine Lage beim Eintritt in ihr Band und eine beim Austritt (das Band so breit wie der breiteste Knoten der Spalte). Dazwischen läuft er senkrecht: ein Port oben oder unten.
- Kreuzungen zählen in den Lücken (Reihenfolge links und rechts verschieden) und in den Spalten (ein senkrechtes Stück gegen einen Fluss, der die Spalte waagrecht durchquert).
- `router` liest beide Lagen aus dem gezeichneten Bild ab; es ist die obere Schranke.

**Welche Formen der Router wählt** (`formen.mjs`, 1018 Sequenzflüsse über mehrere Spalten im Lauf `produkt`):

| Art des Flusses | häufigste Form | sonst |
|---|---|---|
| in derselben Zeile (716) | gerade (706) | Rinne oben 8, unten 2 |
| aus einem Split (75) | in der Zeile des Ziels (50) | Zeile der Quelle 11, Z 4, Rinne 3, anders 7 |
| in ein Merge (43) | in der Zeile der Quelle (32) | Rinne unten 5, Zeile des Ziels 3, Z 1, anders 2 |
| aus einem angehefteten Ereignis (24) | in der Zeile des Ziels (21) | Rinne unten 1, Z 1, Zeile der Quelle 1 |
| sonst vorwärts (30) | in der Zeile der Quelle (25) | Zeile des Ziels 3, Z 2 |
| rückwärts aus derselben Zeile (78) | Rinne oben (48) | Rinne unten 25, Zeile 5 |
| rückwärts von oben (38) | in der Zeile der Quelle (19) | Rinne oben 13, Rinne unten 2, anders 4 |
| rückwärts von unten (14) | Rinne unten (8) | Zeile der Quelle 6 |

Ein Z, das in einer Lücke die Zeile wechselt, wählt der Router fast nie (9 von 1018); er macht ein L mit einem senkrechten Stück an einem Port. Die Rinne eines Rückflusses liegt meist ganz außen in der Bahn, über oder unter allen Knoten der überspannten Spalten, nicht knapp über den beiden Enden.

**Drei Vorhersagen** (Kreuzungen der Sequenzflüsse, wie oben):
- `bpmn`: je Art die häufigste Form aus der Tabelle, fest.
- `mini`: ein Router auf Spaltenebene. Je Fluss bewertet er vier Kandidaten: Zeile der Quelle, Zeile des Ziels, Rinne oben, Rinne unten. Ein Knoten, durch den ein Stück liefe, kostet 1000, eine Kreuzung mit einem schon gelegten Fluss 1, die Vorlieben aus der Tabelle entscheiden Gleichstände. Gelegt wird wie im Router: vorwärts die kurzen zuerst, die Rückflüsse zuletzt. Keine Spuren, keine Ports an der Seite, kein zweiter Durchgang.
- Zum Vergleich `quelle` und `ziel`: jeder Fluss in der Zeile seiner Quelle bzw. seines Ziels.

**Je Bild** (123 Bilder, 121 gezeichnete Kreuzungen):

| Regel | gleich | höchstens 1 daneben | Σ Abweichung | gezählt | Korrelation |
|---|---|---|---|---|---|
| router | 105 | 118 | 30 | 91 | 0,89 |
| quelle | 82 | 100 | 79 | 86 | 0,72 |
| ziel | 80 | 96 | 96 | 137 | 0,77 |
| bpmn | 80 | 105 | 73 | 80 | 0,76 |
| mini | 80 | 106 | 73 | 64 | 0,78 |

**Je Paar** (18 Paare mit verschiedenen gezeichneten Kreuzungen):

| Regel | richtig | gezählt gleich | falsch herum | davon R10 (6) richtig |
|---|---|---|---|---|
| router | 14 | 4 | 0 | 6 |
| quelle | 5 | 6 | 7 | 4 |
| ziel | 0 | 8 | 10 | 0 |
| bpmn | 3 | 9 | 6 | 3 |
| **mini** | **9** | **9** | **0** | **6** |

**Was daraus folgt:**
1. **Das Ziel von b2 ist erreicht, mit `mini`.** Die Rechnung liegt in keinem der 18 Paare falsch herum und trifft alle 6 Entscheidungen von R10. Eine feste Form je Art (`bpmn`) reicht nicht: Sie lag in 6 Paaren falsch. Woran es lag, zeigt ein Beispiel: In `review-hund2-angeheftet` gehen zwei lange Vorwärtsflüsse über die äußere Rinne statt durch das Bild (`Flow_23` von einem Split nach oben herum, `Flow_17` nach unten herum). Das entscheidet der Router nach den Hindernissen, nicht nach der Art des Flusses.
2. **Die Phase braucht also einen kleinen Router**, keine feste Lage je Fluss. Er muss nicht pixelgenau sein: Kandidaten je Fluss, Hindernisse, Kreuzungen mit dem schon Gelegten, die Reihenfolge des Routers.
3. **`mini` zählt zu wenig** (64 statt 121) und sieht in 9 Paaren keinen Unterschied, vor allem bei R12 (5 von 7). Was fehlt: die Spuren in einem Kanal (zwei Flüsse in derselben Zeile liegen nebeneinander und kreuzen sich, wenn sie die Reihenfolge tauschen), die Ports an der Seite einer Aufgabe (30 px auseinander) und Rückflüsse, die eine Zeile höher laufen. Für eine Rechnung, die eine Probe ersetzt, ist „gleich“ unschädlich: Sie behält dann das Bild, wie es ist, wie die Probe ohne Verbesserung.
4. **Die 6 Paare von R10 sind schmal:** 5 davon sind hund2 und vier seiner Abwandlungen, das sechste ist u4. Vor dem Produkt braucht es mehr Fälle, am besten die externen Eingaben.

**Für Schritt c)** heißt das: R10 als Rechnung kann mit `mini` gebaut werden. Je Gruppe von Zeilen aus R2 wird die Seite gewählt, deren Zählung kleiner ist; bei Gleichstand bleibt R2s Seite. Dazu braucht `mini` die Lagen aus dem Raster statt aus dem Diagrammteil, also eine Fassung im Layout selbst, hinter dem Schalter `rowOrder`.

