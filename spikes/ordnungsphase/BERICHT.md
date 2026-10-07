# Ordnungsphase, Teil b: Trägt das Zählmodell?

Stand 7. Oktober 2026, auf `154797a`. Teil b des ersten Schritts aus `docs/konzept-ordnungsphase.md`: Zählt ein Ebenen-Modell (Kreuzungen zwischen benachbarten Spalten, an Knoten und Hilfspunkten) die Kreuzungen, die der Router zeichnet? Und erkennt es, welches von zwei Bildern weniger Kreuzungen hat? Das muss eine Rechnung leisten, die eine Probe ersetzt.

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

## Ergebnisse

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
