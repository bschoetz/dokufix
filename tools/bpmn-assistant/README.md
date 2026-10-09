# BPMN Assistant

Baut `dist/bpmn-assistant.html`, den Dokufix BPMN Assistant: BPMN-XML einfügen oder hochladen und von dokufix anordnen lassen, zum Vergleich neben der Anordnung von bpmn.io.

```sh
npm run assistant      # schreibt dist/bpmn-assistant.html
npm run layouter-audi  # schreibt dist/bpmn-layouter-audi.html
```

Die Seite steht seit Story 2.38 (2026-10-09) als Module in `src/bpmn-assistant/` (`index.html` mit Slots, `assistant.css`, `main.js`, `favicon.svg`), das mit dem Layouter Audi und der Layout-Werkbank Geteilte in `src/bpmn-tools/` (Großansicht, Modellierer, Downloads, die Anordnungen A2 und bpmn.io, Dekoration, Farben, Symbole). Gebaut wird sie vom gemeinsamen Seitenbauer `tools/seiten.mjs` mit demselben esbuild-Weg wie die App; `dist/dokufix.html` braucht der Bau nicht mehr. Mehr in `src/README.md`, *Build*, Absatz „The pages of the BPMN tools“.

| Datei | Was |
|---|---|
| `bauen.mjs` | das Bauskript, aus dem Spike 2.26 im Store übernommen (2026-10-07); seit Story 2.38 reicht es nur Beispiele, Handreichung und bpmn-auto-layout an `tools/seiten.mjs` |
| `audi.mjs` | das Bauskript des Layouters Audi (unten), ebenso über `tools/seiten.mjs` |
| `handreichung.md` | die Handreichung für LLMs, die die Seite zum Kopieren und Herunterladen anbietet |
| `beispiele/` | die Beispieldiagramme; `beispiele.json` gibt Reihenfolge und Beschriftung |
| `vendor/bpmn-auto-layout.min.js` | bpmn-auto-layout 2.0.0-alpha.2 von bpmn.io mit seinen Abhängigkeiten, fertig gebündelt (fremder Code, MIT) |
| `vendor/bpmn-auto-layout.LIZENZEN.txt` | die Lizenzhinweise dieser Pakete, so wie sie vor dem Bündel in der Seite stehen |
| `vendor/bpmn-js/` | bpmn-js 18.31.0, unverändert aus dem Paket: Viewer und Modellierer (`*.production.min.js`) mit ihren Stylesheets (`diagram-js.css`, `bpmn-js.css`, `bpmn-embedded.css` mit der Schrift der Werkzeugleiste); fremder Code, bpmn.io License |

Die Module von dokufix kommen frisch aus `src/` (Layout, Messer der Beschriftungen, Downloads, Client des Layouts) und aus `tests/bpmn-rules.mjs` (Brüche); der Worker des Layouts als Block `#dokufix-layout-js`, so wie die App ihn trägt, seit Story 2.38 frisch aus `src/layout-worker.js` gebündelt statt aus `dist/dokufix.html` geschnitten, ebenso die Dokumentstile aus `src/doc.css`.

Beide Anordnungen laufen in einem Web Worker, damit die Seite bei großen Prozessen bedienbar bleibt (hund3: A2 etwa 20 s, bpmn.io etwa 17 s in Chromium): A2 im Worker der App (`src/layout-worker.js`), bpmn.io in einem eigenen aus dem Text seines Skripts, beide über denselben Client (`src/app/layout-client.js`) mit der Zeitgrenze von 120 s, und solange sie rechnen, zählt im Abschnitt der Hinweis „Diagramm wird angeordnet … 0 s“ die Sekunden. Ein neues Rendern bricht ein laufendes ab. Auf der Seite bleiben das Lesen des XML (für die nicht angeordneten Elemente und das Modell der Regelprüfung), die Behelfslinien (sie brauchen den `DOMParser`), die Brüche und das Zeichnen mit `bpmn-js`. Ohne Worker ordnet die Seite selbst an, wie zuvor; die Zeit im Kopf eines Abschnitts sagt „im Worker“ oder „(ohne Worker)“. Mehr in `src/README.md`, Absatz zu `dist/bpmn-assistant.html`.

Das Häkchen „X an zusammenführenden Gateways“ neben den Diagrammfarben ist gesetzt wie in der App; abgewählt zeichnet A2 exklusive Gateways, die zusammenführen (mindestens zwei Flüsse hinein, höchstens einer hinaus), als leere Raute (Option `mergeMarker` von `appendDiagram()`). Das Original folgt dem Häkchen, wenn jedes exklusive Gateway der Datei `isMarkerVisible="true"` trägt, wie bpmn-js es beim Modellieren setzt; dann verlieren die Merges das Attribut, auch im `.bpmn`-Download und im Modellierer. Fehlt es an einem Gateway, hat der Autor gewählt, und das Original bleibt, wie es ist. Eine Änderung ordnet neu an, der Zustand bleibt im `localStorage`.

Das Häkchen „Sprungbögen“ daneben (Prototyp, `src/app/line-jumps.js`) ist gesetzt wie in der App: Wo sich zwei Linien kreuzen, springt die waagrechte mit einem kleinen Bogen über die senkrechte, in Bild und Großansicht; der Modellierer und der `.bpmn`-Download haben keine Bögen. Eine Änderung zeichnet neu, der Zustand bleibt im `localStorage`.

Die Diagrammfarben beginnen mit der Vorlage „Gelb“ (von Ben gestaltet, 2026-10-07): Sie steht als erste in der Liste, gilt ohne gespeicherte Wahl und nach „Zurücksetzen“. „Blau (dokufix)“, die Farben der App, folgt als zweite. „Schwarzweiß mit Grau“ ist entfallen (2026-10-07). Eine im `localStorage` gespeicherte Wahl bleibt, auch eine dieser entfallenen Vorlage, dann als „Eigene“.

Seit 2026-10-08 haben auch die Füllung von Sequenz- und Nachrichtenfluss (Raute am bedingten Fluss, Kreis und Pfeilspitze am Nachrichtenfluss), Assoziationen (auch die zu Daten), Textanmerkungen, Datenobjekte und Datenspeicher sowie Gruppen eigene Farben; vorher galten für sie die Füllung und Schrift der Aufgaben und die Linie der Sequenzflüsse. Ein älterer gespeicherter oder importierter Stand nimmt für sie die Werte seiner Vorlage, eigene Farben die bisherigen Grundwerte.

Das Favicon ist ein exklusives Gateway mit Fragezeichen in den Gateway-Farben der Vorlage „Gelb“, als SVG in der Seite (`src/bpmn-assistant/favicon.svg`).

Der Assistent braucht kein Netz (seit 2026-10-07): bpmn-js, Viewer wie Modellierer, ist mit seinen Stylesheets in die Seite eingebettet, vor ihm der Text der bpmn.io License; der Modellierer wird erst beim ersten „Bearbeiten“ ausgeführt. Die Seite wird dadurch rund 0,9 MB größer. Nur die Links der Seite (Camunda Modeler, demo.bpmn.io) führen ins Netz.

Eine heruntergeladene `.bpmn`, `.svg` oder `.png` (das Bild in doppelter Größe, Ben, 2026-10-08), auch die `.bpmn` aus dem Modellierer, heißt nach dem Namen des Modells und der Zeit des Klicks, etwa `Urlaubsantrag_2026-10-07_19-15-02.bpmn`. Der Name des Modells ist das Attribut `name` von `definitions`, der Wurzel, die jede BPMN-Datei hat; ohne ihn gilt der Name der Kollaboration, sonst der des ersten Prozesses, sonst die Namen der Pools (höchstens drei, mit „-“), sonst „Diagramm“.

Das Feld „Name“ in der Leiste unter dem XML zeigt diesen Namen; ohne einen steht der Ersatz grau darin. Enter oder das Verlassen des Felds schreibt ihn als Attribut `name` in das Tag von `definitions` (leer: ohne es), der Rest des XML bleibt, und die Seite rendert neu. Die sechs Beispiele und die Vorlagen der Handreichung tragen einen Namen, und die Handreichung bittet das LLM, einen zu setzen.

## BPMN-Layouter Audi

`dist/bpmn-layouter-audi.html` (Ben, 2026-10-08) ist die abgespeckte Fassung: eine oder mehrere `.bpmn`-Dateien hochladen oder auf die Seite ziehen, und jede erscheint mit ihren eigenen Koordinaten, unverändert, in den Farben der Vorlage „Audi-Stil“. Wählbar sind nur das X an zusammenführenden Gateways (dieselbe Regel wie fürs Original oben) und die Sprungbögen; dazu die Großansicht und der Download als `.svg` und `.png`. Kein Anordnen, kein Modellierer, kein `.bpmn`-Download, keine Beispiele, keine Handreichung, keine Farbwahl. Eine Datei ohne Koordinaten bekommt einen Hinweis statt eines Bilds. Gebaut mit `npm run layouter-audi` (`tools/bpmn-assistant/audi.mjs`) aus `src/bpmn-audi/`; was es zeichnet, kommt seit Story 2.38 aus denselben Modulen wie beim Assistenten (`src/bpmn-tools/`: `decorate()`, `mergeMarkerOff()`, die Großansicht, die Downloads, die Vorlage `PRESETS.audi`), die Kopien sind entfallen. Eine Änderung dort gilt für beide; beide neu bauen.
