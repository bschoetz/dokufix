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

Die Module von dokufix kommen frisch aus `src/` (Layout, Messer der Beschriftungen, Downloads, Client des Layouts) und aus `tests/bpmn-rules.mjs` (Brüche); der Worker des Layouts als fertiger Block `#dokufix-layout-js` aus `dist/dokufix.html`, so wie die App ihn trägt.

Beide Anordnungen laufen in einem Web Worker, damit die Seite bei großen Prozessen bedienbar bleibt (hund3: A2 etwa 20 s, bpmn.io etwa 17 s in Chromium): A2 im Worker der App (`src/layout-worker.js`), bpmn.io in einem eigenen aus dem Text seines Skripts, beide über denselben Client (`src/app/layout-client.js`) mit der Zeitgrenze von 120 s, und solange sie rechnen, zählt im Abschnitt der Hinweis „Diagramm wird angeordnet … 0 s“ die Sekunden. Ein neues Rendern bricht ein laufendes ab. Auf der Seite bleiben das Lesen des XML (für die nicht angeordneten Elemente und das Modell der Regelprüfung), die Behelfslinien (sie brauchen den `DOMParser`), die Brüche und das Zeichnen mit `bpmn-js`. Ohne Worker ordnet die Seite selbst an, wie zuvor; die Zeit im Kopf eines Abschnitts sagt „im Worker“ oder „(ohne Worker)“. Mehr in `src/README.md`, Absatz zu `dist/bpmn-assistant.html`.

Das Häkchen „X an zusammenführenden Gateways“ neben den Diagrammfarben ist gesetzt wie in der App; abgewählt zeichnet A2 exklusive Gateways, die zusammenführen (mindestens zwei Flüsse hinein, höchstens einer hinaus), als leere Raute (Option `mergeMarker` von `appendDiagram()`). Eine Änderung ordnet neu an, der Zustand bleibt im `localStorage`.
