# BPMN Assistant

Baut `dist/bpmn-assistant.html`, den Dokufix BPMN Assistant: BPMN-XML einfügen oder hochladen und von dokufix anordnen lassen, zum Vergleich neben der Anordnung von bpmn.io.

```sh
npm run build        # dist/dokufix.html, aus dessen Dokumentstilen die Farben kommen
npm run assistant    # schreibt dist/bpmn-assistant.html
```

| Datei | Was |
|---|---|
| `bauen.mjs` | das Bauskript, aus dem Spike 2.26 im Store übernommen (2026-10-07) |
| `handreichung.md` | die Handreichung für LLMs, die die Seite zum Kopieren und Herunterladen anbietet |
| `beispiele/` | die Beispieldiagramme; `beispiele.json` gibt Reihenfolge und Beschriftung |
| `vendor/bpmn-auto-layout.min.js` | bpmn-auto-layout 2.0.0-alpha.2 von bpmn.io mit seinen Abhängigkeiten, fertig gebündelt (fremder Code, MIT) |
| `vendor/bpmn-auto-layout.LIZENZEN.txt` | die Lizenzhinweise dieser Pakete, so wie sie vor dem Bündel in der Seite stehen |
| `vendor/bpmn-js/` | bpmn-js 18.31.0, unverändert aus dem Paket: Viewer und Modellierer (`*.production.min.js`) mit ihren Stylesheets (`diagram-js.css`, `bpmn-js.css`, `bpmn-embedded.css` mit der Schrift der Werkzeugleiste); fremder Code, bpmn.io License |

Die Module von dokufix kommen frisch aus `src/` (Layout, Messer der Beschriftungen, Downloads, Client des Layouts) und aus `tests/bpmn-rules.mjs` (Brüche); der Worker des Layouts als fertiger Block `#dokufix-layout-js` aus `dist/dokufix.html`, so wie die App ihn trägt.

Beide Anordnungen laufen in einem Web Worker, damit die Seite bei großen Prozessen bedienbar bleibt (hund3: A2 etwa 20 s, bpmn.io etwa 17 s in Chromium): A2 im Worker der App (`src/layout-worker.js`), bpmn.io in einem eigenen aus dem Text seines Skripts, beide über denselben Client (`src/app/layout-client.js`) mit der Zeitgrenze von 120 s, und solange sie rechnen, zählt im Abschnitt der Hinweis „Diagramm wird angeordnet … 0 s“ die Sekunden. Ein neues Rendern bricht ein laufendes ab. Auf der Seite bleiben das Lesen des XML (für die nicht angeordneten Elemente und das Modell der Regelprüfung), die Behelfslinien (sie brauchen den `DOMParser`), die Brüche und das Zeichnen mit `bpmn-js`. Ohne Worker ordnet die Seite selbst an, wie zuvor; die Zeit im Kopf eines Abschnitts sagt „im Worker“ oder „(ohne Worker)“. Mehr in `src/README.md`, Absatz zu `dist/bpmn-assistant.html`.

Das Häkchen „X an zusammenführenden Gateways“ neben den Diagrammfarben ist gesetzt wie in der App; abgewählt zeichnet A2 exklusive Gateways, die zusammenführen (mindestens zwei Flüsse hinein, höchstens einer hinaus), als leere Raute (Option `mergeMarker` von `appendDiagram()`). Das Original folgt dem Häkchen, wenn jedes exklusive Gateway der Datei `isMarkerVisible="true"` trägt, wie bpmn-js es beim Modellieren setzt; dann verlieren die Merges das Attribut, auch im `.bpmn`-Download und im Modellierer. Fehlt es an einem Gateway, hat der Autor gewählt, und das Original bleibt, wie es ist. Eine Änderung ordnet neu an, der Zustand bleibt im `localStorage`.

Das Häkchen „Sprungbögen“ daneben (Prototyp, `src/app/line-jumps.js`) ist gesetzt wie in der App: Wo sich zwei Linien kreuzen, springt die waagrechte mit einem kleinen Bogen über die senkrechte, in Bild und Großansicht; der Modellierer und der `.bpmn`-Download haben keine Bögen. Eine Änderung zeichnet neu, der Zustand bleibt im `localStorage`.

Die Diagrammfarben beginnen mit der Vorlage „Gelb“ (von Ben gestaltet, 2026-10-07): Sie steht als erste in der Liste, gilt ohne gespeicherte Wahl und nach „Zurücksetzen“. „Blau (dokufix)“, die Farben der App, folgt als zweite. „Schwarzweiß mit Grau“ ist entfallen (2026-10-07). Eine im `localStorage` gespeicherte Wahl bleibt, auch eine dieser entfallenen Vorlage, dann als „Eigene“.

Das Favicon ist ein exklusives Gateway mit Fragezeichen in den Gateway-Farben der Vorlage „Gelb“, als SVG in der Seite (`FAVICON` in `bauen.mjs`).

Der Assistent braucht kein Netz (seit 2026-10-07): bpmn-js, Viewer wie Modellierer, ist mit seinen Stylesheets in die Seite eingebettet, vor ihm der Text der bpmn.io License; der Modellierer wird erst beim ersten „Bearbeiten“ ausgeführt. Die Seite wird dadurch rund 0,9 MB größer. Nur die Links der Seite (Camunda Modeler, demo.bpmn.io) führen ins Netz.

Eine heruntergeladene `.bpmn` oder `.svg`, auch die aus dem Modellierer, heißt nach dem Namen des Modells und der Zeit des Klicks, etwa `Urlaubsantrag_2026-10-07_19-15-02.bpmn`. Der Name des Modells ist das Attribut `name` von `definitions`, der Wurzel, die jede BPMN-Datei hat; ohne ihn gilt der Name der Kollaboration, sonst der des ersten Prozesses, sonst die Namen der Pools (höchstens drei, mit „-“), sonst „Diagramm“.

Das Feld „Name“ in der Leiste unter dem XML zeigt diesen Namen; ohne einen steht der Ersatz grau darin. Enter oder das Verlassen des Felds schreibt ihn als Attribut `name` in das Tag von `definitions` (leer: ohne es), der Rest des XML bleibt, und die Seite rendert neu. Die sechs Beispiele und die Vorlagen der Handreichung tragen einen Namen, und die Handreichung bittet das LLM, einen zu setzen.
