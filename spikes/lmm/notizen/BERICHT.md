# Kanonische Ordnung der Textanmerkungen: wo ihre Reihenfolge wirkt, und die erweiterte Sortierung

Stand 7. Oktober 2026. Geprüft wurde, wo `layoutGeometry()` und `appendDiagram()` die Reihenfolge von `model.notes`, `model.associations` und `model.messages` lesen, dann wurden zehn Ordnungen der Notizen an den 57 Fixtures gemessen, gegen das Orakel „jede Reihenfolge“ gestellt und die besten auf Invarianz gegen Umordnung und Umbenennung geprüft. Ergebnis ist `kanonisch-notizen.mjs` (`kanonisch(model)` → `{ model, rank }`), das auf `kanonisch/kanonisch.mjs` aufsetzt und dessen Ordnung der Knoten, Flüsse und Ereignisse unverändert übernimmt. Die Komponente heißt LMM (vormals arielle; die Spike-Dateien heißen weiter `arielle…`). Im Repository wurde nichts geändert; alles liegt in `spikes/lmm/notizen/`.

## Ergebnis in Kürze

1. **Die Reihenfolge der Notizen wirkt an genau einer Stelle mit Gewicht:** in der Schleife `for (const n of notes)` (`bpmn-layout.js` Z. 2812). Jede Notiz nimmt den ersten freien Platz und meidet alle früher platzierten; wo zwei Notizen denselben Raum wollen, entscheidet die Reihenfolge, welche den nahen Platz bekommt und welche in die nächste Runde, an den Bahnrand (Streifen) oder auf eine andere Notiz geht. Dazu kommen der Stapel der Pool-Notizen (Z. 2996, sichtbar) und zwei Gleichstands-Stellen bei Nachrichtenflüssen (Router, Beschriftungen), die in den Fixtures nie kippen. Die erste Assoziation einer Notiz (`assocs.find`) bestimmt Partner und Pool; mehrere Assoziationen je Notiz hat kein Fixture.
2. **Die beste Ordnung:** Notizen an Knoten zuerst, dann die an angehefteten Ereignissen, Sequenz- und Nachrichtenflüssen; innerhalb jeder Art nach der Position des Partners in `kanonisch()` (Leserichtung des Prozesses), dann Text, dann ID. Nachrichtenflüsse nach der Position ihrer Enden, Assoziationen je Notiz nach dem Platz des Partners, Pool-Notizen nach Pool, Text, ID. Gemessen (Messart `measured`): **Verstöße 43 → 43, Kreuzungen 46 → 43, Knicke 324 → 324**, Notiz-Verstöße 1 → 1; Layoutänderung bei erweiterter Umordnung (Knoten, Flüsse, Ereignisse, Nachrichtenflüsse, Notizen, Assoziationen) **0 von 570** (vorher 6,0 %), bei erweiterter Umbenennung **0 von 570**. Drei Fixtures ändern ihr Bild, keines wird schlechter: notiz-r12 (Kreuzungen 3 → 2, kein Streifen mehr, 449 → 359 px hoch), notiz-bauantrag (Kreuzungen 10 → 8), notiz-zwei (zwei Notizen am selben Knoten tauschen, 3 px).
3. **Das Orakel** (jede Reihenfolge der Notizen, bis 120 je Fixture, sonst 150 zufällige): Die reine Partner-Ordnung ist in 7 von 9 Notiz-Fixtures bereits die beste erreichbare; in demo-notizen fehlt nur Abstand (Ø 56 statt 38 px bei gleichen Verstößen, Kreuzungen und Maßen), in notiz-bauantrag hängt die Höhe (1393 statt 1185 px) an einer einzelnen Kollision zweier Notizen, die keine der strukturellen Regeln trifft. „Knoten-Notizen zuerst“ holt dort die Kreuzungen (10 → 8), nicht die Höhe.
4. **Notizen an Pools:** Der Stapel in XML-Reihenfolge ist sichtbar, aber die Reihenfolge ist kein Modellinhalt: Kein Fixture hat zwei Notizen an einem Pool, ein Modellierer schreibt sie in Anlegereihenfolge, und niemand kann sie anders als durch Umsortieren des XML ändern. Empfehlung: ebenfalls kanonisch (Pool, Text, ID), damit Ziel (a) ohne Ausnahme gilt; die XML-Reihenfolge bleibt als Option `poolNotes: 'xml'` eine Zeile.
5. **Empfehlung:** `kanonisch()` aus `kanonisch-notizen.mjs` an die Stelle von `kanonisch/kanonisch.mjs` setzen (gleiche Schnittstelle, gleiche Ordnung der Knoten, Flüsse und Ereignisse, gleiche Ränge). `appendDiagram()` bekommt weiter das Modell des Autors.

## 1. Wo die Reihenfolge wirkt

### 1.1 `layoutGeometry()` → `finishLabelsAndFrame()` (Z. 2762–3020)

| Liste | Stelle | Wirkung |
|---|---|---|
| `notes` | Schleife `for (const n of notes)` (Z. 2812): je Notiz `notePlaces()` in den Runden `NOTE_ROUNDS`, der erste Platz, der frei ist von `symbols`, `segments`, `taken` (Beschriftungen und **frühere Notizen**), `borders`; sonst Streifen am Bahnrand (`openStripe()`, Z. 2851 ff., auch hier `onBox` gegen `taken`), sonst `bestPlace()` | **stark:** die frühere Notiz bekommt den nahen Platz; die spätere weicht in die nächste Runde, an den Rand (das Bild wächst um `size.h + NOTE_GAP`) oder, wenn jeder Streifenplatz Fehler hat, auf die frühere (notiz-morgen: `note-on-note`) |
| `notes` | `openStripe()` verschiebt alles unter dem Schnitt, auch früher platzierte Notizen und ihre `owners` | mittelbar: die Lage der früheren Notizen gegenüber dem Schnitt |
| `notes` | Pool-Notizen (Z. 2996): `atPools` stabil nach Pool-Index sortiert, dann untereinander gestapelt | **sichtbar:** die Reihenfolge im Stapel eines Pools |
| `notes` | `takenPool`, `notePool`, `shift()` (Z. 2947), `pointsOf()` | nein (Mengen) |
| `associations` | `assocs.find(x => x.note === n.id)` (Z. 2814, 2996, 3009): die **erste** Assoziation nennt Partner, Art und Ankerpunkt (`aimOf`) | nur bei mehreren Assoziationen je Notiz (in den Fixtures keine); dann auch `n.pool` aus `readNotes()` (Z. 287, ebenfalls die erste im XML) |
| `associations` | Schleife `for (const a of assocs)` (Z. 3005): nur Wegpunkte je Assoziation | nein |
| `messages` | Router (Z. 2354): Nachrichtenflüsse nach Spannweite sortiert, **stabil**, bei gleicher Spannweite in Modellreihenfolge; der erste bekommt Port und Spur (`portUse`, `assign()`) | möglich, in den Fixtures nie (auch `permute-mehr.mjs`: 0 Änderungen) |
| `messages` | `routes` in Router-Reihenfolge → Beschriftungen (Z. 2730, `taken`), `msgIn` (Z. 947), `msgEnds` (Z. 1980), Höhe der Lücke (Z. 2463) | Beschriftungen: nur über die Router-Reihenfolge; `msgIn`, `msgEnds`, Lücke: Mengen/Maxima, nein |

### 1.2 `appendDiagram()` (Z. 3110–3143)

Schreibt Shapes und Edges in Modellreihenfolge: `model.notes` (Z. 3130), `model.messages` (Z. 3135), `model.associations` (Z. 3139). Das ist nur die Reihenfolge der Elemente im Diagrammteil, keine Geometrie; `diagramKey()` misst je Element-ID und sieht sie nicht. Nach der Empfehlung von `kanonisch/BERICHT.md` bekommt `appendDiagram()` ohnehin das Modell des Autors; dann bleibt auch diese Reihenfolge die des XML. `relane()` und `insertCollaboration()` lesen keine der drei Listen.

### 1.3 Nicht die Reihenfolge, aber die Richtung

Eine Assoziation kann im XML in beide Richtungen stehen (`toNote`). Das Layout liest beide gleich und schreibt nur die Wegpunkte in der Richtung des XML. Gemessen (Modul, 45 Umdrehungen in den 9 Notiz-Fixtures, Wegpunkte ohne Richtung verglichen): 0 Änderungen. Das ist keine Volatilität, nur Treue zum XML.

## 2. Die Varianten

`varianten-notizen.mjs`: `kanonischWith(model, { notes, pools, messages, assocs })`, alles auf `kanonisch()` (Knoten, Flüsse, Ereignisse) aufgesetzt, Schlüssel sind Positionen im sortierten Modell, Texte, Namen, zuletzt IDs.

Notizen (nicht an Pools): `xml` unverändert · `id` · `text` Text, ID · `partner` Platz des Partners der ersten Assoziation, Text, ID; der Platz: Position des Knotens unter den Knoten, ein angeheftetes Ereignis nach seinem Host, ein Fluss nach seiner Quelle, ein Nachrichtenfluss nach dem früheren seiner Enden, dabei Knoten vor Ereignis vor Fluss vor Nachricht, darunter die Position in der jeweiligen Liste · `partner-id` dasselbe mit ID statt Text · `lanecol` Bahn, Spalte, dann `partner` · `kind` eingeschränktere Art zuerst (Ereignis, Fluss, Nachricht, Knoten), dann `partner` · `kind-rev` Knoten, Ereignis, Fluss, Nachricht, dann `partner` · `long` längerer Text zuerst, dann `partner` · `rpartner` `partner` rückwärts (Kontrolle).
Pools: `xml` Stapel in XML-Reihenfolge · `canon` Pool, Text, ID. Nachrichten: `xml` · `ends` Quelle, Ziel (ein Pool nach allen Knoten), Name, ID. Assoziationen: `xml` · `canon` je Notiz nach Platz des Partners, Richtung, ID; die erste bestimmt Partner und Pool der Notiz neu.

### 2.1 Qualität an den 9 Fixtures mit Notizen (`messen-notizen.mjs … --only=notes`, Messart `measured`)

Gegen `kanonisch()` heute (Notizen, Assoziationen, Nachrichtenflüsse unsortiert). „Abstand“: mittlerer Abstand zwischen Notizkasten und Partner (Kasten bzw. nächstes Flussstück), Pool-Notizen ausgenommen.

| Notizen / Pools / Nachrichten / Assoziationen | Bild anders (9) | Verstöße (neu / weg) | davon Notiz-Verstöße | Kreuzungen | Knicke | Ø Abstand (px) |
|---|---|---|---|---|---|---|
| **heute** (`kanonisch()`) | 0 | 16 | 1 | 19 | 75 | 75,1 |
| xml / canon / ends / canon | 0 | 16 (+0 / −0) | 1 | 19 | 75 | 75,1 |
| id / canon / ends / canon | 4 | 17 (+1 / −0) | 2 | 16 | 75 | 64,9 |
| text / … | 3 | 20 (+4 / −0) | 5 | 17 | 75 | 69,3 |
| partner / … | 2 | 16 (+0 / −0) | 1 | 18 | 75 | 70,9 |
| partner-id / … | 2 | 16 (+0 / −0) | 1 | 18 | 75 | 70,9 |
| lanecol / … | 3 | 19 (+3 / −0) | 4 | 18 | 75 | 70,1 |
| kind / … | 2 | 16 (+0 / −0) | 1 | 18 | 75 | 70,9 |
| **kind-rev / …** | **3** | **16 (+0 / −0)** | **1** | **16** | **75** | **69,5** |
| long / … | 4 | 17 (+1 / −0) | 2 | 17 | 75 | 67,3 |
| rpartner / … | 4 | 20 (+4 / −0) | 5 | 17 | 75 | 68,3 |

Lesart:

- **Pools `canon`, Nachrichten `ends`, Assoziationen `canon` ändern allein kein Bild** (Zeile `xml/canon/ends/canon`): Kein Fixture hat zwei Notizen an einem Pool, zwei Nachrichtenflüsse gleicher Spannweite, die um einen Port konkurrieren, oder zwei Assoziationen an einer Notiz. Ihre Sortierung ist nötig für die Invarianz, nicht für die Qualität.
- **Alle Ordnungen, die Notiz_Kreuzung vor Notiz_Taktung stellen, kosten in notiz-morgen `note-on-note`** (`id`, `text`, `long`, `rpartner`): Beide Notizen wollen den Raum rechts oben zwischen Kind_BadFrei und Kind_Schulweg; die zweite findet keinen freien Platz, der Streifen hat überall Fehler, und sie landet auf der ersten. In Leserichtung (Taktung → Kind_BadFrei vor Kreuzung → Kind_Schulweg) bekommt Taktung den Platz, Kreuzung weicht nach oben rechts (Abstand 177) und bleibt frei.
- **`text`, `lanecol`, `rpartner` kosten in notiz-bauantrag drei Verstöße** (TA_Rechtsbehelf vor TA_Ausnahme: die beiden wollen denselben Raum über Task_Ablehnung und Gateway_Ausnahme).
- **`partner`, `partner-id`, `kind`, `kind-rev` bringen keinen neuen Verstoß** und in notiz-r12 eine Kreuzung und den Streifen weniger. `kind-rev` holt zusätzlich in notiz-bauantrag zwei Kreuzungen (die Notiz am Nachrichtenfluss kommt zuletzt und findet einen Platz, dessen Assoziation nichts kreuzt). `kind` (eingeschränktere Art zuerst) ist in den Fixtures gleich `partner`.

### 2.2 Das Orakel: was eine Reihenfolge überhaupt erreichen kann (`oracle.mjs`, `oracle.md/json`)

Je Fixture jede Reihenfolge der Notizen, die nicht an Pools hängen (bis 120), sonst 150 zufällige; die Knoten, Flüsse, Ereignisse, Nachrichtenflüsse und Assoziationen kanonisch. Rang: Verstöße, Kreuzungen, Knicke, Höhe, Abstand.

| Fixture | Notizen | Ordnungen | beste (V / K / Kn / Höhe / Ø Abstand) | schlechteste | verschiedene Bilder | heute | partner | kind-rev | long | id |
|---|---|---|---|---|---|---|---|---|---|---|
| demo5 | 1 | 1 | 0 / 0 / 2 / 189 / 35 | = | 1 | 1 | 1 | 1 | 1 | 1 |
| notiz-morgen | 3 | 6 | 3 / 0 / 5 / 620 / 106 | 4 / 0 / 5 / 573 / 55 | 2 | 1 | 1 | 1 | 4 | 4 |
| notiz-zwei | 5 | 120 | 1 / 0 / 3 / 482 / 47 | 1 / 0 / 3 / 502 / 47 | 4 | 41 | 1 | 1 | 81 | 41 |
| notiz-fluss | 3 | 6 | 0 / 0 / 1 / 318 / 48 | = | 1 | 1 | 1 | 1 | 1 | 1 |
| notiz-pool | 2 | 2 | 0 / 1 / 0 / 473 / 30 | = | 1 | 1 | 1 | 1 | 1 | 1 |
| notiz-r12 | 3 | 6 | 2 / 2 / 5 / 359 / 45 | 2 / 3 / 5 / 449 / 94 | 2 | 4 | 1 | 1 | 4 | 1 |
| demo-notizen | 5 | 120 | 0 / 1 / 4 / 732 / 38 | 0 / 1 / 4 / 804 / 49 | 8 | 21 | 21 | 21 | 81 | 111 |
| notiz-hund2 | 4 | 24 | 6 / 4 / 35 / 1330 / 71 | = | 1 | 1 | 1 | 1 | 1 | 1 |
| notiz-bauantrag | 9 | 150 | 4 / 8 / 20 / 1185 / 95 | 7 / 10 / 20 / 1393 / 107 | 14 | 54 | 54 | 36 | 8 | 13 |

(Zahlen in den Variantenspalten: Platz unter den Ordnungen, 1 = beste. `oracle.md` hat die Werte selbst.)

- In **5 von 9** Fixtures ist das Bild von der Reihenfolge unabhängig (1 Bild). notiz-morgen und notiz-r12 haben je 2 Bilder, eines gut, eines schlecht; die Partner-Ordnung trifft beide Male das gute.
- **notiz-bauantrag** (9 Notizen, 14 Bilder): Paarweise ausgewertet (`oracle.json`) kommt die Höhe 1185 statt 1393 allein daher, dass TA_Beteiligung (86 px hoch) vor TA_Rechtsgrundlage platziert wird: Rechtsgrundlage nimmt sonst den Platz unter Task_PruefenRecht, der Beteiligungs Platz unter Task_Beteiligung anschneidet; Beteiligung geht in Runde 100, ragt aus der Bahn, der Rahmen wächst um 208 px. Das ist gegen die Leserichtung (PruefenRecht kommt vor Beteiligung) und für „größere zuerst“ (`long`), das aber notiz-morgen den Verstoß kostet. Eine Ordnung aus der Struktur, die beides trifft, habe ich nicht gefunden; die Kollision ist eine Frage der Platzierung, nicht der Reihenfolge (Abschnitt 6).
- **demo-notizen:** 110 von 120 Ordnungen sind gleich gut bis auf den Abstand; die Partner-Ordnung liegt bei Ø 56 px, die beste bei 38 (N_Notiz_Fluss nach rechts statt nach unten). Verstöße, Kreuzungen, Knicke und Maße gleich.

### 2.3 Qualität und Invarianz an allen 57 Fixtures (`messen-notizen.mjs`, K = 10, `inv-notizen.md/json`)

Umordnung mit `permute-notizen.mjs` (alles aus `permute-xml.mjs`, dazu Nachrichtenflüsse, Notizen, Assoziationen), Umbenennung mit `rename-notizen.mjs` (dieselben Listen, dazu die IDs der Nachrichtenflüsse, Notizen, Assoziationen).

| Variante | Bild anders (57) | Verstöße (neu / weg) | Notiz-Verstöße | Kreuzungen | Knicke | Ø Abstand | Umordnung: Layout anders (Fixtures) | Umbenennung: Layout anders |
|---|---|---|---|---|---|---|---|---|
| **heute** (`kanonisch()`) | 0 | 43 | 1 | 46 | 324 | 75,1 | **6,0 % (5)** | 0,0 % |
| partner / canon / ends / canon | 2 | 43 (+0 / −0) | 1 | 45 | 324 | 70,9 | 0,0 % | 0,0 % |
| partner / xml / ends / canon | 2 | 43 (+0 / −0) | 1 | 45 | 324 | 70,9 | 0,0 % | 0,0 % |
| **kind-rev / canon / ends / canon** = `kanonisch-notizen.mjs` | 3 | 43 (+0 / −0) | 1 | **43** | 324 | 69,5 | **0,0 %** | **0,0 %** |

Zur Zeile `partner/xml`: Pool-Notizen in XML-Reihenfolge sind in den Fixtures ebenfalls invariant, weil kein Fixture zwei Notizen an einem Pool hat; der Unterschied zeigt sich nur im Stapelversuch (Abschnitt 4).

(Die Zeile heißt in `inv-notizen.md` noch `kind/canon/ends/canon`: Der Lauf begann, bevor diese Ordnung in `kind-rev` umbenannt wurde; `kind` ist seither die eingeschränktere Art zuerst.)

Das Prüfskript `pruefen.mjs` misst das Modul unabhängig von `messen-notizen.mjs` (eigene Startwerte, K = 10, `pruefen.log`): Verstöße 43 → 43 (Notiz-Verstöße 1 → 1), Kreuzungen 46 → 43, Knicke 324 → 324, drei Bilder anders (notiz-zwei, notiz-r12, notiz-bauantrag), keine Verstöße neu oder weg; **Umordnung 0/570, Umbenennung 0/570.** Mit `--xml-pools` (K = 2, `pruefen-xml-pools.log`): dieselbe Qualität, 0/114 und 0/114.

**Messart `estimated`** (Modul gegen `kanonisch()` heute, Verstöße dort nicht definiert): zwei Bilder anders, notiz-zwei (1152 × 646 → 1176 × 581) und notiz-bauantrag (Kreuzungen 10 → 8); notiz-r12 ändert sich in dieser Messart nicht (andere Kastengrößen, kein Streifen).

## 3. Die geänderten Notiz-Fixtures (`warum-notizen.mjs`)

| Fixture | Vorher → nachher | Erklärung |
|---|---|---|
| **notiz-r12** | Kreuzungen 3 → 2, Höhe 449 → 359, Ø Abstand 94 → 45; Verstöße 2 → 2 (dieselben, keiner an Notizen) | XML: N_b (Knoten b), N_f4 (Rückwärtsfluss F4), N_bt (Ereignis bt an b). N_f4 nimmt zuerst den Platz unter dem Fluss, N_bt findet dann rund um das Ereignis nichts Freies und geht in einen Streifen unter der Bahn (Abstand 181, die Bahn wächst um 90 px). Kanonisch: N_b, N_bt (Ereignis nach seinem Host), dann N_f4: N_bt steht direkt unter dem Ereignis (Abstand 50), N_f4 unten links am Fluss (Abstand 34), kein Streifen, eine Kreuzung weniger. |
| **notiz-bauantrag** | Kreuzungen 10 → 8; Verstöße 4 → 4 (dieselben, eine Notiz-Assoziation `association-through` bleibt), Höhe gleich | Die XML-Reihenfolge der neun Notizen ist schon die Leserichtung (ein LLM hat sie mit dem Prozess geschrieben); `partner` ändert nichts. Mit Knoten-Notizen zuerst kommt TA_Nachforderung (am Nachrichtenfluss MF_Nachforderung) zuletzt und findet den Platz links der Nachricht (Abstand 50 statt 99), wo ihre Assoziation keine zwei Flüsse mehr kreuzt. Die Höhe (1393) bleibt; siehe Orakel. |
| **notiz-zwei** | Höhe 485 → 482, sonst gleich (Verstöße 1 → 1, der bekannte `node-outside-lane`) | n1 und n2 hängen beide an t1. Kanonisch nach Text kommt „Bei Großkunden …“ (n2, 43 px hoch) vor „Checkliste A …“ (n1, 40 px): n2 nimmt oben rechts, n1 oben; der Rahmen wird 3 px niedriger. Gleich gut, nur die Zuordnung der beiden Plätze tauscht. Ohne Umbenennung bleiben beide Varianten stabil; hier entscheidet der Text, nicht die ID. |

notiz-morgen, notiz-fluss, notiz-pool, demo-notizen, notiz-hund2 und demo5 behalten ihr Bild. Alle übrigen 48 Fixtures ohne Notizen sind unberührt (Knoten, Flüsse, Ereignisse wie `kanonisch()`; die Nachrichten-Ordnung `ends` ändert in den 11 Fixtures mit Nachrichtenflüssen nichts).

## 4. Notizen an Pools: XML-Reihenfolge oder kanonisch

`stapel.mjs` baut eine kleine Kollaboration mit drei Notizen am Pool „Lieferant“ in drei XML-Reihenfolgen:

| Pool-Notizen | XML Vertrag, Lager, Zeit | XML Zeit, Vertrag, Lager | XML Lager, Zeit, Vertrag | Bilder |
|---|---|---|---|---|
| `xml` (heute) | Vertrag · Lager · Zeit | Zeit · Vertrag · Lager | Lager · Zeit · Vertrag | 3 |
| `canon` (Pool, Text, ID) | Zeit · Lager · Vertrag | dieselben | dieselben | 1 |

Was für die XML-Reihenfolge spricht: Der Stapel ist das eine Bild, in dem ein Leser eine Reihenfolge sieht, und wer das XML von Hand schreibt, schreibt die Notizen in irgendeiner Folge, vielleicht einer gewollten. Was dagegen spricht: (1) BPMN gibt der Reihenfolge von `textAnnotation`-Elementen keine Bedeutung, und Modellierungswerkzeuge schreiben sie in Anlegereihenfolge, nicht in Leseordnung; ein Autor, der im Werkzeug eine Notiz nach oben zieht, ändert das XML nicht. (2) Die Textanmerkung ist ohnehin kein geordneter Inhalt: An Knoten entscheidet das Layout den Platz, nicht der Autor; nur am Pool wäre die XML-Folge sichtbar, eine Ausnahme, die man erklären müsste. (3) Ziel (a) verlangt 0 % auch für Notizen; mit `xml` bleibt der Stapel die eine Stelle, an der das Bild vom XML abhängt. (4) Kein Fixture und kein Beispiel aus den Spikes hat zwei Notizen an einem Pool; es gibt keinen Beleg für eine gewollte Reihenfolge.

Entscheidung: **kanonisch (`poolNotes: 'canon'`, Pool, Text, ID).** Die Textordnung ist für den Autor nachvollziehbar (alphabetisch), stabil gegen alles außer dem Text selbst. Die XML-Reihenfolge bleibt im Modul als Option `poolNotes: 'xml'` (eine Zeile), falls ein Fall auftaucht, in dem ein Autor sie wirklich will; `pruefen.mjs --xml-pools` misst sie.

## 5. Nachrichtenflüsse und Assoziationen

Beide brauchen eine eigene Ordnung, nicht nur die der Notizen:

- **Nachrichtenflüsse** werden im Router stabil nach Spannweite sortiert; zwei gleich weite in Modellreihenfolge. In den Fixtures kippt das nie (auch `permute-mehr.mjs` fand nichts), aber es ist derselbe Mechanismus wie bei den Sequenzflüssen gleicher Länge, der dort 8 von 10 Bildänderungen verursachte. Ordnung: Position der Quelle, des Ziels (ein Pool nach allen Knoten), Name, ID. Mit `ends` sind die 11 Fixtures mit Nachrichtenflüssen bildgleich.
- **Assoziationen** wirken nur über `assocs.find()`: die erste je Notiz. Ohne Sortierung hinge bei zwei Assoziationen an einer Notiz Partner und Pool am XML. Ordnung: je Notiz nach dem Platz des Partners, dann die zur Notiz hin geschriebene zuerst, dann ID; der Pool der Notiz wird aus dieser ersten neu bestimmt, wie `readNotes()` es aus der ersten im XML tut. In den Fixtures hat jede Notiz eine Assoziation; die Regel ist gemessen invariant, aber ihr Nutzen ist nicht an einem Fixture belegt.

## 6. Offene Punkte

- **Die Kollision in notiz-bauantrag** (TA_Beteiligung gegen TA_Rechtsgrundlage, 208 px Höhe) löst keine Reihenfolge aus der Struktur; „größere Notiz zuerst“ löst sie, kostet aber notiz-morgen. Eine Platzierungsregel in `finishLabelsAndFrame()` (etwa: die Notizen in zwei Durchgängen, erst die mit freiem Platz in Runde 0, dann der Rest; oder bei Gleichstand der Runden die Notiz mit den wenigsten freien Plätzen zuerst) wäre eine eigene Story in `src/`; sie wäre von der Reihenfolge unabhängig und die kanonische Ordnung bliebe als Tie-Break.
- **Abstand in demo-notizen** (Ø 56 statt 38 px): dieselbe Art Frage, N_Notiz_Fluss könnte rechts vom Fluss stehen statt darunter, wenn sie vor N_Notiz_Frist käme. Keine der strukturellen Ordnungen trifft das ohne Nebenwirkung; nicht weiter verfolgt.
- **Umbenennung:** 0 % in den Fixtures. Grundsätzlich hängt die Ordnung an IDs nur, wo zwei Notizen am selben Partner denselben Text haben, zwei Nachrichtenflüsse dieselben Enden und denselben Namen, oder zwei Assoziationen einer Notiz denselben Partner und dieselbe Richtung.
- **Nicht gemessen:** `tests/durchlaeufe.mjs`, `tests/vergleich.mjs` (brauchen die Einbindung in `src/`); Modelle mit zwei Assoziationen an einer Notiz, zwei Notizen an einem Pool (nur der Stapelversuch) oder zwei Nachrichtenflüssen gleicher Spannweite um einen Port; Verstöße in Messart `estimated` (nicht definiert).
- **Die Pool-Entscheidung** ist eine Abwägung, keine Messung: Beide Einstellungen sind in den Fixtures gleich.

## Dateien in `notizen/`

| Datei | Zweck |
|---|---|
| `kanonisch-notizen.mjs` | **`kanonisch(model, { poolNotes, notes })` → `{ model, rank }`**, die erweiterte Fassung; `rawOf()` durchgereicht |
| `varianten-notizen.mjs` | `kanonischWith(model, { notes, pools, messages, assocs })`, alle Ordnungen |
| `messen-notizen.mjs` | Qualität, Notiz-Verstöße, Abstand, Umordnung, Umbenennung je Variante → `inv-notizen.md/json`, `qualitaet-notizen.json` |
| `oracle.mjs` → `oracle.md/json` | jede Reihenfolge der Notizen je Fixture, Platz der Varianten |
| `warum-notizen.mjs` | je Fixture und Variante: Platzierungsreihenfolge, Seite, Abstand, Kasten |
| `stapel.mjs` | der Stapel an einem Pool in drei XML-Reihenfolgen |
| `permute-notizen.mjs`, `rename-notizen.mjs` | erweiterte Umordnung und Umbenennung (Nachrichtenflüsse, Notizen, Assoziationen) |
| **`pruefen.mjs`** → `pruefen.log` | das schlanke Prüfskript: Qualität und Invarianz des Moduls, `--k=N`, `--xml-pools` |

Alle Skripte laufen mit `cd spikes/lmm/notizen && node <skript>` und importieren das Repository über `/home/user/dokufix/`.
