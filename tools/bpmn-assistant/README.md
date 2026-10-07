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

Die Module von dokufix kommen frisch aus `src/` (Layout, Messer der Beschriftungen, Downloads) und aus `tests/bpmn-rules.mjs` (Brüche). Mehr in `src/README.md`, Absatz zu `dist/bpmn-assistant.html`.
