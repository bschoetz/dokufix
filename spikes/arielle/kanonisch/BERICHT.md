# Kanonische Ordnung für das Raster: Prüfung des Versuchs und die empfohlene Sortierung

Stand 7. Oktober 2026. Geprüft wurde der Versuch `check/canon.mjs` (`canonical(model)`), danach wurden 90 Sortiervarianten an den 57 Fixtures gemessen, die besten auf Invarianz gegen Umordnung und Umbenennung des XML. Ergebnis ist das Modul `kanonisch.mjs` (`kanonisch(model)`). Im Repository wurde nichts geändert; alles liegt in `spikes/arielle/kanonisch/`.

## Ergebnis in Kürze

1. **Der Versuch ist korrekt und vollständig, aber falsch gewichtet.** Er sortiert alle Listen, die `layoutGeometry()` liest, Bahnen und Pools bleiben in ihrer Reihenfolge. Zwei Dinge daran sind verkehrt: Die **Flussreihenfolge nach den Enden** bedient die Gleichstände der Regeln schlechter als die XML-Reihenfolge der Autoren (demo6, r18, r15), und das **Sortieren der Notizen nach ID** wirft eine bewusste Entscheidung aus dem Review von 2.31 um (notiz-morgen). Die Knotenreihenfolge, die der Versuch am sorgfältigsten baut, ist für das Bild fast ohne Belang.
2. **Was die Regeln lesen, ist die Flussreihenfolge.** In allen vier gekippten Fixtures macht sie den Unterschied, meist über den Router: Flüsse gleicher Länge werden in Modellreihenfolge gelegt, und die Proben R12 bis R16 bauen auf diesem Bild auf.
3. **Die beste Ordnung:** Knoten in der Reihenfolge, in der arielle ihre Ränge vergibt; **Flüsse in der Reihenfolge, in der arielles Tiefensuche sie durchläuft** (Hauptweg zuerst, jede Ausnahme an ihrer Stelle); angeheftete Ereignisse nach Host; Notizen, Nachrichtenflüsse und Assoziationen unverändert. Gemessen (Messart `measured`): **Verstöße 44 → 43, Kreuzungen 48 → 46, Knicke 325 → 324**; Layoutänderung bei Umordnung **0 von 570**, bei Umbenennung **0 von 570**; 10 Fixtures ändern ihr Bild einmalig, keines wird schlechter. Mittel der Verstöße über die Umordnungen von arielle allein: 44,4; die Ordnung liegt darunter.
4. **Alternative „Ordnung als letzter Schlüssel in den Regeln“:** nicht empfohlen. Rund 30 Stellen in 15 Funktionen lesen die Modellreihenfolge; eine Sortierung am Eingang des Rasters ist nachweislich dasselbe Bild (57/57) und eine Stelle statt dreißig. Gemessen auf einer Kopie von `bpmn-layout.js`.
5. **Empfehlung:** `kanonisch(model)` nach `src/app/arielle.js`, zusammen mit `arielle()` aus einem Lauf; `layoutBpmn()` gibt das sortierte Modell an `layoutGeometry()` und das Modell des Autors an `appendDiagram()`, sodass das XML seine Reihenfolge behält.

## 1. Prüfung des Versuchs

### 1.1 Vollständigkeit: welche Listen das Layout liest

`layoutGeometry()` und `appendDiagram()` lesen aus dem Modell: `pools`, `lanes` (mit `lane.nodes`, `lane.pool`, `lane.synthetic`), `nodes`, `flows`, `boundaries`, `messages`, `notes`, `associations`, `plane`, `insert`. Ob ihre Reihenfolge wirkt:

| Liste | Wirkt die Reihenfolge? | Wo | Im Versuch |
|---|---|---|---|
| `nodes` | ja | `buildGrid()` (`cells`-Map, Startknoten der Tiefensuche, Z. 907), `byCol()` (stabiler Sort), `at()`, 20 Schleifen in den Regeln, `ruleCompact()`s `waiting`, R16, R11, der Paarversuch des Routers, die Beschriftungen | sortiert (Spalte, Bahn, Name, ID) |
| `flows` | ja, am stärksten | Tiefensuche in `buildGrid()`, `fwdOut`/`fwdIn` (daraus `branchRegions()`, R1 `preds.reduce`, R2 `stay`, R9 `firsts`, R12-Proben), R3, R13, `flowOrder` des Routers (stabiler Sort nach Länge), Ports, Beschriftungen | sortiert (Position der Enden, Name, ID) |
| `boundaries` | ja, wenig | `byHost` (Sort nach Richtung, Gleichstand), Beschriftungen der Ereignisse | sortiert (Host, Name, ID) |
| `lane.nodes` | nein | nur `laneOf` als Map; jeder Knoten steht nach `readProcess()` in genau einer Bahn | sortiert |
| `lanes`, `pools` | ja, mit Bedeutung | Bänder von oben nach unten, `poolOfLane`, Rahmen | **unverändert, richtig** |
| `messages` | ja | Router (Sort nach Spannweite, Gleichstand), Beschriftungen | nach ID sortiert |
| `notes`, `associations` | ja, mit Bedeutung | Notizen werden der Reihe nach platziert, die erste bekommt den besten Platz (Review 2.31: „those of a pool in the order of the XML“); `assocs.find()` nimmt je Notiz die erste Assoziation | nach ID sortiert, **das kostet den Verstoß in notiz-morgen** |
| `insert`, `plane` | nein | IDs | – |

Befund: Der Versuch erfasst alles, was wirkt. Bahnen und Pools behalten ihre Reihenfolge; die Bedeutung des Modells ändert er nicht (nur Listen werden umgestellt, kein Feld geändert; `permute-xml.mjs` bewegt dieselben Listen). Falsch ist allein, **was** er sortiert: Notizen, Assoziationen und Nachrichtenflüsse sollte er nicht anfassen. `permute-xml.mjs` bewegt sie auch nicht; die Reihenfolge der Notizen ist die des Autors und wird so gelesen.

### 1.2 Messung

`canon.mjs` misst mit `labelSize` (Messart `estimated`) und dem JSON von `layoutGeometry()`; `canon-quality.mjs` misst `measured`, vergleicht aber `JSON.stringify(A.di)` mit `C.di`, dessen Schlüsselreihenfolge der Modellreihenfolge folgt. Darum zählt seine Tabelle 48 Fixtures als „anders“, von denen 32 nur anders serialisiert sind. Mit `diagramKey()` (Diagrammteil je Element-ID, `measured`) nachgemessen:

| Messung | canon.mjs / canon-quality.mjs | hier (`messen.mjs col/ends/id`) |
|---|---|---|
| Layout geändert bei Umordnung (570) | 0 (`estimated`) | **0** (`measured`) |
| Layout geändert bei Umbenennung (570) | nicht gemessen | **0** |
| Fixtures mit anderem Bild | 15 | 16 (dazu demo-notizen) |
| Verstöße / Kreuzungen / Knicke | 46 / 47 / 331 | 46 (+6 / −4) / 47 / 331 |

Die Zahlen des Versuchs halten also, die Invarianz gilt auch auf der Ebene, die der Nutzer sieht. Die Umbenennung ist für diese Ordnung in den Fixtures unschädlich, obwohl sie Namen und IDs als Schlüssel nimmt: Zwei Knoten gleicher Spalte, Bahn und gleichen Namens kommen in den Fixtures nicht vor (20 Fixtures haben gleichnamige Knoten, meist unbenannte Gateways, aber nie in einer Spalte einer Bahn). Grundsätzlich hängt der Versuch an IDs, wo zwei Knoten in Spalte, Bahn und Name gleich sind, und bei Flüssen gleicher Enden und gleichen Namens.

### 1.3 Reproduziert

`_repro-canon.log`, `_repro-canon-quality.log`: 0/570, 42/57 „Original wie ohne Sortierung“, 46 / 47 / 331. Gleich wie in der Analyse.

## 2. Die Varianten

`varianten.mjs` baut jede Ordnung aus drei Teilen „Knoten/Flüsse/Rest“; `arielle-order.mjs` ist arielle mit offengelegten Ordnungen (gleiche Ränge wie `arielle()` auf 57 Fixtures und 2000 Zufallsmodellen, `arielle-order-check.mjs`).

Knoten: `xml` unverändert · `col` Spalte, Bahn, Name, ID (Versuch) · `ranked` Reihenfolge der Rangvergabe · `dfs` Reihenfolge der Tiefensuche · `lanecol` Bahn, Spalte, dann `ranked` (die Sicht des Autors: oben nach unten, links nach rechts) · `colrank` Spalte, Bahn, dann `ranked`.
Flüsse: `xml` · `ends` Position Quelle, Ziel, Name, ID (Versuch) · `ahead` Position der Quelle, dann arielles Ordnung der Ausgänge · `dfs` Reihenfolge, in der die Tiefensuche die Flüsse durchläuft · `target` Position Ziel, Quelle.
Rest: `xml` · `id` Ereignisse nach Host, Name, ID; Nachrichten, Notizen, Assoziationen nach ID (Versuch) · `host` nur Ereignisse nach Host.

### 2.1 Qualität an den 57 Fixtures (`measured`, `alle.mjs`, alle 90 Kombinationen in `alle-*.md/json`)

Verstöße gegen die Verstöße von arielle allein (neu / weg). Zeilen, die in jeder Zahl und im selben Satz geänderter Fixtures gleich sind, sind zusammengefasst.

| Knoten / Flüsse / Rest | Bild anders (57) | Verstöße (neu / weg) | Kreuzungen | Knicke |
|---|---|---|---|---|
| **arielle allein** (`xml/xml/xml`) | 0 | 44 | 48 | 325 |
| alle Knotenordnungen `/xml/xml` und `/xml/host` | 0 | 44 | 48 | 325 |
| alle Knotenordnungen `/xml/id` (nur Rest nach ID) | 4 | 45 (+1 / −0) | 45 | 325 |
| **Versuch** `col/ends/id` | 16 | 46 (+6 / −4) | 47 | 331 |
| `col/ends/host` (Versuch ohne Notizsortierung), auch `colrank`, `lanecol`; auch mit `ahead`, `target` | 12 | 45 (+5 / −4) | 50 | 331 |
| `xml/ends/host`, `xml/target/host` | 8 | 45 (+6 / −5) | 51 | 328 |
| `ranked/ends/host`, `ranked/ahead/host`, `ranked/target/host`, `xml/ahead/host`, `dfs/ahead/host` | 11 | 46 (+5 / −3) | 51 | 332 |
| `dfs/ends/host`, `dfs/target/host` | 12 | 47 (+8 / −5) | 49 | 330 |
| **alle sechs Knotenordnungen `/dfs/host` und `/dfs/xml`** | **10** | **43 (+3 / −4)** | **46** | **324** |
| alle Knotenordnungen `/dfs/id` | 14 | 44 (+4 / −4) | 43 | 324 |

Lesart:

- **Die Flussreihenfolge entscheidet.** Mit Flüssen in XML-Reihenfolge ändert keine Knotenordnung ein einziges Bild; mit Flüssen in Tiefensuch-Reihenfolge (`dfs`) ist das Bild bei allen sechs Knotenordnungen identisch (geprüft je Fixture, 55/55 ohne die beiden hund2). Nur bei `ends`/`target` wirkt die Knotenordnung mit, über die Positionen, aus denen diese Flussordnungen gebaut sind.
- **`dfs` ist die einzige Flussordnung, die besser ist als die XML-Reihenfolge**, in allen drei Maßen. `ends`, `ahead` und `target` sind alle schlechter.
- **Notizen nach ID** (`/id`) kostet immer den Verstoß in notiz-morgen; dass `/dfs/id` trotzdem 43 Kreuzungen zeigt, kommt aus notiz-bauantrag (10 → 8) und notiz-r12 (3 → 2), wo die ID-Reihenfolge zufällig günstiger liegt. Das ist Zufall einer Stichprobe, keine Regel; die Reihenfolge der Notizen ist die des Autors.
- Die Reihenfolge der angehefteten Ereignisse (`host` gegen `xml`) macht in keinem Fixture einen Unterschied.

### 2.2 Invarianz (`messen.mjs`, je Fixture 10 Umordnungen mit `permute-xml.mjs` und 10 Umbenennungen mit `rename-xml.mjs`, Diagrammteil je Element-ID, `measured`)

| Variante | Umordnung: Layout anders | Fixtures | Umbenennung: Layout anders | Fixtures | Verstöße Ø über einen Umordnungssatz (57 Fixtures) |
|---|---|---|---|---|---|
| arielle allein | 23,0 % (131/570) | 21 | 0,0 % | 0 | **44,4** |
| Versuch `col/ends/id` | 0,0 % | 0 | 0,0 % | 0 | 46,0 |
| `ranked/dfs/host` | 0,0 % | 0 | 0,0 % | 0 | 43,0 |
| `ranked/dfs/xml` | 0,0 % | 0 | 0,0 % | 0 | 43,0 |
| `col/dfs/host` | 0,0 % | 0 | 0,0 % | 0 | 43,0 |
| `lanecol/dfs/host` | 0,0 % | 0 | 0,0 % | 0 | 43,0 |
| **`kanonisch()`** (`kanonisch.mjs`) | **0,0 %** | 0 | **0,0 %** | 0 | **43,0** |

Jede Variante mit einer totalen Ordnung ist konstruktionsbedingt invariant gegen Umordnung; die Messung bestätigt es. Gegen Umbenennung sind in den Fixtures alle unempfindlich; grundsätzlich hängen `ranked` und `dfs` nur dort an IDs, wo arielles eigener Tie-Break es tut (zwei Wege gleich in Reichweite, Flussname, Knotenname), `col` zusätzlich bei Knoten gleicher Spalte, Bahn und gleichen Namens. Darum nimmt `kanonisch()` `ranked` und `dfs`.

**Erweiterte Umordnung** (`permute-mehr.mjs`, K = 5: zusätzlich Nachrichtenflüsse, Textanmerkungen und Assoziationen gemischt): arielle allein 27,4 % (24 Fixtures), `kanonisch()` 4,9 %, nur die fünf Notiz-Fixtures (notiz-morgen 3/5, notiz-zwei 3/5, notiz-r12 1/5, demo-notizen 3/5, notiz-bauantrag 4/5). Das ist die Reihenfolge der Textanmerkungen, die das Layout absichtlich als die des Autors liest. Nachrichtenflüsse ändern nichts.

**Messart `estimated`** für `kanonisch()`: Kreuzungen 47 → 45, Knicke 325 → 324, dieselben 10 Fixtures anders. (Verstöße sind nur für `measured` definiert.)

## 3. Warum die Fixtures kippen

Werkzeug: `warum.mjs <Variante> <Fixture>…`. Es sortiert je Liste einzeln, schaltet je Regel einzeln aus und alle zusammen (dann bleiben R7 und der Router), und zeigt, was sich bewegt. In acht der zehn Bildänderungen von `kanonisch()` und in drei der vier gekippten Fixtures des Versuchs gilt: **Mit allen Regeln aus bleibt jeder Knoten, wo er ist; nur der Router legt einige Flüsse anders.** Die Ausnahmen beginnen bei R1 (demo6, angeheftet-antrag) und R2 (pools-bestellung); notiz-morgen bei den Notizen. Der Router sortiert die Flüsse nach Rückwärts/Vorwärts und Länge (`flowOrder`, Z. 2231), stabil, also bei gleicher Länge in Modellreihenfolge; der zuerst gelegte Fluss bekommt den besseren Port und die bessere Spur. Die Proben R12, R13, R16, R11 rechnen auf diesem Bild und nehmen bei gleicher Güte die erste Probe. So wandert die Volatilität vom Router in die Zeilen und Spalten.

### Die vier Fixtures des Versuchs (`col/ends/id`)

| Fixture | Liste | Regel | Was passiert |
|---|---|---|---|
| **demo6** (neu `node-outside-lane N_Ende N_Magazin`, Knicke 3 → 8) | Flüsse | **R1** `preds.reduce` (Z. 979) | `ends` stellt N4 (vom angehefteten Ereignis, Host N_Pruefen, Position 1) vor N3 (von N_Einarbeiten, Position 2). Beide Vorgänger des Endes stehen in Spalte 1 (der Fluss über die Bahngrenze erlaubt dieselbe Spalte). Bei Gleichstand gewinnt der erste Vorgänger: statt in die Bahn des Teilprozesses (Magazin) geht das Ende in die Bahn des Hosts (Theke), der Fluss N3 muss von unten hoch. Im XML und in der Tiefensuche steht N3 vor N4 (Hauptweg zuerst), das Ende bleibt im Magazin. |
| **r18** (neu `on-one-line-foreign`, Kreuzungen 3 → 7) | Flüsse | Router, dann R13/R16 | `ends` reiht die sieben Rückwärtsflüsse r1–r7 nach der Position ihrer Quelle neu (F23, F21, F20, F24 vor F18, F19, F22). Mit allen Regeln aus wechseln 9 Flüsse die Spur, kein Knoten bewegt sich; mit den Regeln nehmen R13 und R16 andere Proben, 14 Knoten rücken. Die Tiefensuche ordnet die Flüsse ebenfalls um (Kette für Kette, m vor o, die Rückwärtsflüsse dort, wo ihr Ausgang an die Reihe kommt: r1 r2 r5 r3 r7 r4 r6), und dennoch ist das Bild dasselbe wie mit der XML-Reihenfolge (gemessen, `warum.mjs kanonisch/-/- r18`: gleich). |
| **notiz-morgen** (neu `note-on-note Notiz_Kreuzung Notiz_Taktung`) | Rest | Platzierung der Notizen (`finishLabelsAndFrame()`, Z. 2812) | Nach ID kommt Notiz_Kreuzung vor Notiz_Taktung; sie nimmt den Platz, Taktung landet auf ihr. Die XML-Reihenfolge (Taktung, MamaBad, Kreuzung) ist die des Autors. `permute-xml.mjs` bewegt Notizen nicht; sortieren ist hier unnötig und schädlich. |
| **r15** (zwei weg, drei neu) | Flüsse | Router (Rückwärtsflüsse gleicher Länge), dann R13 | Drei Rückwärtsflüsse haben Länge 2: F9 (gb → b3), F10 (b3 → b1), F11 (b4 → b2). XML: F9, F10, F11; `ends`: F10, F11, F9. F9 wird zuletzt gelegt, nimmt andere Ports, die Beschriftung `r5` von F11 liegt auf b4 statt `r4` auf b3, und zwei andere Flüsse teilen eine Linie. Mit `dfs` (F9, F11, F10) ein Tausch derselben Art (siehe unten), Knicke 13 → 12. |

### Die Fixtures von `kanonisch()` (10 Bilder anders, 7 davon ohne Änderung an Verstößen, Kreuzungen oder Knicken)

| Fixture | Vorher → nachher | Erklärung |
|---|---|---|
| **angeheftet-antrag** | Verstöße 1 → 0 (weg: `node-outside-lane Gateway_Zusammen Lane_Sachbearbeitung`), Kreuzungen 1 → 0, Knicke 6 → 5 | Dieselbe R1-Stelle wie in demo6, hier zum Guten: Die Vorgänger des Gateways, Task_Abgleich (IT) und Task_VonHandPruefen (Sachbearbeitung), stehen beide in Spalte 1. Im XML steht Flow_3 (von Task_Abgleich) zuerst, das Gateway geht in die IT-Bahn. Die Tiefensuche nimmt an Task_Abgleich den Weg mit größerer Reichweite zuerst, den über das angeheftete Ereignis, und erreicht das Gateway über Flow_5: Es bleibt in der Bahn des Autors. |
| **r17** | Verstöße 2 → 2 (`label-on-flow F7_c_a F10_e_a` → `label-on-flow F9_e_c F10_e_a`), Kreuzungen 2 → 1 | Die Rückwärtsflüsse F7, F8, F9 haben Länge 2; XML F7, F8, F9, Tiefensuche F9, F8, F7 (von e aus zuerst). F9 bekommt die innere Spur, die Beschriftung `x4` liegt jetzt auf F9 statt auf F7; eine Kreuzung weniger. Kein Knoten bewegt sich. |
| **r15** | Verstöße 2 → 2 (Tausch: `label-on-node` b3 → b4, `on-one-line-shared` F7/F9 → F8/F9), Knicke 13 → 12 | Wie oben: F11 vor F10 in der Rückwärtsreihe; die Beschriftung `r5` statt `r4` liegt auf einem Knoten, ein anderes Paar teilt die Linie. Gleich viele Verstöße derselben Art, ein Knick weniger. |
| **ref3** | Verstöße 1 → 1 (derselbe), Kreuzungen 0 → 0, Knicke 5 → 6 | Mit allen Regeln aus legen 4 Flüsse anders, kein Knoten bewegt sich. Mit den Regeln nimmt R12 (Kreuzungsprobe) eine andere, gleich gute Probe: Der Hauptweg nach „Art“ (Teilen → … → BeiTouren) bekommt die Zeile über der Backbone, das Ende „Abwesenheit“ bleibt in der Zeile des Gateways; vorher umgekehrt. Ein Knick mehr, sonst gleich. |
| demo5, r06, r21, pools-bewerbung, angeheftet-stoerung | alles gleich | Flüsse gleicher Länge in anderer Reihenfolge gelegt; andere Spuren oder Ports, gleiche Maße (mit allen Regeln aus bereits anders). |
| pools-bestellung | alles gleich | **R2** (`rulePathRows()`): Die Wege einer Entscheidung kommen aus `branchRegions()` in Flussreihenfolge; bei gleich vielen Knoten bleibt der erste in der Zeile (`stay`), die anderen bekommen neue Zeilen in dieser Reihenfolge. Mit R2 aus ist das Bild gleich. |

Die drei „neuen“ Verstöße sind also Tausche gleicher Art in r15 und r17, wo die Qualität sonst besser wird (Knicke 13 → 12, Kreuzungen 2 → 1); der vierte weggefallene (angeheftet-antrag) ist ein echter Gewinn. demo6, r18 und notiz-morgen ändern sich nicht.

**Warum die Tiefensuch-Reihenfolge den Regeln liegt:** Sie ist die Reihenfolge, in der ein Autor einen Prozess aufschreibt: dem Hauptweg bis zum Ende folgen, dann die Ausnahmen, jeder Rückwärtsfluss dort, wo sein Ausgang vorkommt. Die Regeln wurden an so geordneten Fixtures abgestimmt (R9 sagt es ausdrücklich: „the middle one, in the order of the flows“). In 44 der 57 Fixtures weicht die XML-Reihenfolge der Flüsse von der Tiefensuche ab, aber nur 10 Bilder ändern sich; die Ordnung trifft also die Absicht der Autoren meist auch dort, wo sie nicht dieselbe ist. `ends`, `ahead` und `target` zerreißen dagegen die Wege: Sie reihen Flüsse nach Positionen, sodass ein Rückwärtsfluss zwischen die Vorwärtsflüsse seiner Kette rückt und die Ausnahme vor dem Hauptweg kommt.

## 4. Alternative: die Ordnung als letzter Schlüssel in den Regeln

Was sich in `bpmn-layout.js` ändern müsste, wenn das Modell unsortiert bleibt und jede Regel bei Gleichstand arielles Ordnung nimmt (aus der Liste der Stellen, Z. 879–3145):

| Funktion | Stellen | Was zu tun wäre |
|---|---|---|
| `buildGrid()` | 4 | `cells` in Ordnung anlegen (dann sind `at()`, `rowsOf()`, `cells.values()` überall geordnet), Startknoten und `out`-Listen der Tiefensuche sortieren |
| `byCol()` | 1 | zweiter Schlüssel |
| R1 `preds.reduce`, `parallelBlocks()`, `exclusiveBlock()`, `branchRegions()` | 5 | `fwdOut`/`fwdIn` sortiert anlegen (einmal in `buildGrid()`) |
| R2, R3, R9, R13 (Schleifen über `model.flows`, `firsts`, `own`) | 5 | aus den sortierten `fwdOut`, oder `model.flows` sortiert lesen |
| R6, R12, R14, R13 (Geschwister), R15, `redockStarts()` (Schleifen über `model.nodes`) | 6 | sortiert lesen |
| R7 `waiting` | 1 | dritter Schlüssel |
| R16 `all`, R11 `ends`, R8 `inside` | 3 | sortiert |
| Router `flowOrder`, Paarversuch (`model.nodes`, `into`), Nachrichtenflüsse, Spuren (`assign`), `byHost`, Ports | 6 | dritter Schlüssel bzw. sortiert |
| Beschriftungen, Notizen (`routes`, `model.nodes`, `boundaries`) | 3 | folgen `routed`/`model.nodes` |

Etwa 30 Stellen in 15 Funktionen, dazu müsste die Ordnung als Positionsmap in `g` liegen. Jede Stelle ist ein eigener Fehlerort, und wie r18 zeigt, reicht eine vergessene (etwa der stabile Sort des Routers), damit das Bild volatil bleibt. Dem steht gegenüber: **Alle diese Stellen lesen nur `model.nodes`, `model.flows`, `model.boundaries` und die daraus gebauten `cells`.** Eine Sortierung dieser drei Listen am Eingang ist dasselbe wie der letzte Schlüssel überall.

Gemessen (`intern.mjs`, `bpmn-layout-intern.js`: eine Kopie, in der `gridModel()` die drei Listen selbst aus `raw.nodes[key].seq` und `raw.flows[id]` sortiert, das Modell des Aufrufers unverändert lässt): **Diagrammteil gleich 57/57** gegenüber dem vorab sortierten Modell, und **das geschriebene XML hält die Reihenfolge der Kästen wie der Autor 57/57**.

Einschätzung: Die Alternative „in jeder Regel“ bringt nichts, was die Sortierung am Eingang nicht bringt, und kostet dreißig Änderungen in einer 3145-Zeilen-Datei. Sinnvoll ist nur die Frage, **wo** die eine Sortierung steht (Abschnitt 5). Ein Vorteil der Sortierung innerhalb von `layoutGeometry()` wäre, dass jeder Aufrufer sie automatisch bekommt; der Preis wäre eine Abhängigkeit von `bpmn-layout.js` auf arielle oder eine Erweiterung von `raw` um die Ordnung.

## 5. Empfehlung

**Variante:** `kanonisch(model)` aus `kanonisch.mjs`: Knoten in der Reihenfolge der Rangvergabe, Flüsse in der Reihenfolge der Tiefensuche (Flüsse von einem Knoten auf sich selbst zuletzt, in Modellreihenfolge), angeheftete Ereignisse nach Host, dann nach ihrem ersten Fluss in der Tiefensuche, Name, ID; `lane.nodes` wie die Knoten; Bahnen, Pools, Nachrichtenflüsse, Notizen und Assoziationen unverändert. Rückgabe `{ model, rank }`, weil die Ränge aus demselben Lauf kommen.

**Ablageort: `src/app/arielle.js`.** Die Ordnung ist ein Nebenprodukt von arielles Lauf (Reihenfolge der Rangvergabe, Reihenfolge der Tiefensuche); getrennt müsste sie den Lauf wiederholen. Nicht in `readProcess()`: Das Modell dort ist das des Autors, und `appendDiagram()` soll es so schreiben. Nicht in `layoutGeometry()`: keine Abhängigkeit auf arielle hinein, und die Tests mit erfundenen Positionen bleiben, wie sie sind. Anschluss in `layoutBpmn()` (`src/app/bpmn.js`):

```js
const { model, rank } = kanonisch(read.model);           // arielle.js: ein Lauf, Ordnung und Ränge
const raw = { nodes: Object.fromEntries(model.nodes.map(n => [n.key, { cx: rank[n.key] }])) };
const laidOut = appendDiagram(xml, read.model, layoutGeometry(model, raw, measurer()));
```

`appendDiagram()` bekommt das Modell des Autors: Der Diagrammteil behält dessen Reihenfolge, `npm run fixtures` meldet nur die 10 Fixtures mit anderem Bild. Genau diesen Aufbau hat `intern.mjs` gemessen (57/57).

Im Modul sollte `arielle(model)` die Ränge weiter allein liefern (wie entschieden) und `kanonisch(model)` den gemeinsamen Lauf aufrufen; `arielle-order.mjs` zeigt, wie der Lauf beide Ordnungen nebenher einsammelt (vier Zeilen mehr als `ranks-optimiert.mjs`).

**Test** (`tests/arielle.test.mjs`, zusätzlich zu den Fällen aus dem Review):

1. Ein handgeschriebenes Modell mit Hauptweg, Ausnahme, Schleife und angeheftetem Ereignis: `kanonisch()` liefert die Flüsse in der Reihenfolge der Tiefensuche, Bahnen, Pools, Notizen und Nachrichtenflüsse unverändert, `rank` gleich `arielle()`.
2. Invarianz des **fertigen Diagrammteils**: je Fixture K Umordnungen (`permute-xml.mjs` nach `tests/`, fester Startwert) und K Umbenennungen (`rename-xml.mjs`): `readDiagram()` je Element-ID gleich. Mit K = 10 dauert das rund 2,5 Minuten (notiz-hund2 braucht 4 s je Layout); für `npm test` K = 2 ohne die beiden hund2-Fixtures (etwa 15 s), die volle Messung als Skript neben `tests/durchlaeufe.mjs`.
3. `npm run fixtures`: genau ref3, demo5, r06, r15, r17, r21, pools-bestellung, pools-bewerbung, angeheftet-antrag, angeheftet-stoerung ändern sich (beide Messarten); `known-breaks.json`: angeheftet-antrag verliert einen Eintrag, r15 und r17 tauschen je zwei bzw. einen.

Abnahme gegen Abschnitt 6 der Analyse: Layoutänderung bei Umordnung 0 %; Verstöße 43 ≤ Mittel der Umordnungen 44,4.

## 6. Offene Punkte

- **R1 bei Gleichstand** (`preds.reduce`, Z. 979): Zwei Vorgänger in derselben Spalte, der erste gewinnt. demo6 und angeheftet-antrag kippen daran in beide Richtungen. Die kanonische Ordnung macht die Wahl nur deterministisch; eine inhaltliche Regel (etwa: der Vorgänger in der Bahn des Autors, oder der Vorgänger, der nicht über ein angeheftetes Ereignis kommt) wäre eine eigene Story.
- **Der Router** legt Flüsse gleicher Länge in Modellreihenfolge und entscheidet damit, welcher Fluss den besseren Port bekommt; acht der zehn Bildänderungen beginnen dort, eine bei R1 und eine bei R2 (`stay` bei gleich vielen Knoten). Ein eigener Schlüssel (Rückwärtsflüsse mit längerem Weg zuerst, oder nach Zahl der Konflikte) könnte die Qualität unabhängig von der Reihenfolge heben.
- **Notizen:** Ihre Reihenfolge bleibt die des Autors (4,9 % Layoutänderung bei erweiterter Umordnung, nur die fünf Notiz-Fixtures). Wer auch das kanonisch will, braucht eine Regel aus dem Bild (etwa Notizen nach der Position ihres Partners), nicht nach ID.
- **Umbenennung:** 0 % in den Fixtures; grundsätzlich hängt die Ordnung an IDs genau dort, wo arielle es tut (Zwillinge). Nichts Neues gegenüber dem Review.
- **Nicht gemessen:** `tests/durchlaeufe.mjs`, `tests/vergleich.mjs` (brauchen die Einbindung in `src/`); Modelle über 500 Flüsse; die Kreuzungen und Knicke über die Umordnungen (nur die Verstöße, 44,4 gegen 43,0; das Review nennt für arielle allein Ø 0,81 Kreuzungen und 5,7 Knicke je Fixture, also etwa 46 und 325, worauf `kanonisch()` mit 46 und 324 liegt).
- `arielle-order.mjs` rekursiert in der Tiefensuche wie `ranks-optimiert.mjs`; für die Übernahme gilt derselbe Hinweis wie im Review.

## Dateien in `kanonisch/`

| Datei | Zweck |
|---|---|
| `kanonisch.mjs` | **`kanonisch(model)` → `{ model, rank }`**, die empfohlene Sortierung; `rawOf()` |
| `arielle-order.mjs` | arielle mit offengelegten Ordnungen (`ranked`, `dfs`, `edgeSeq`, `back`, `ahead`); `arielle-order-check.mjs` belegt gleiche Ränge (2057/2057) |
| `varianten.mjs` | `canonicalWith(model, { nodes, flows, rest })`, alle Ordnungen |
| `messen.mjs` | Qualität, Umordnung, Umbenennung je Variante → Tabelle, JSON (`inv-*.md/json`); Variante `kanonisch/-/-` misst das Modul |
| `alle.mjs` | alle 90 Kombinationen, nur Qualität → `alle-<rest>.md/json` |
| `warum.mjs` | Diagnose je Fixture: Liste, Regel, Rückwärtsflüsse, was sich bewegt |
| `intern.mjs`, `bpmn-layout-intern.js` | Aufgabe 3: Sortierung in `gridModel()` auf einer Kopie, Vergleich mit dem vorab sortierten Modell |
| `permute-mehr.mjs` → `permute-mehr.log` | erweiterte Umordnung (Nachrichtenflüsse, Notizen, Assoziationen) |
| `_repro-canon.log`, `_repro-canon-quality.log` | Reproduktion des Versuchs mit den Skripten aus `check/` |

Alle Skripte laufen mit `cd spikes/arielle/kanonisch && node <skript>` und importieren das Repository über `/home/user/dokufix/`.
