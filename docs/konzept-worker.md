# Konzept: das BPMN-Layout in einem Web Worker

Stand 7. Oktober 2026, auf Commit `e18e69d`, als Konzept. **Die Schritte 1 bis 5 sind am selben Tag gebaut** (Branch `claude/optimistic-allen-f7yfpw`, ab `2655a18`), dazu der BPMN-Assistent; was davon wie gebaut ist, was vom Konzept abweicht und was offen bleibt, steht im Abschnitt *Umsetzung* am Ende. Die Abschnitte 1 bis 8 sind das Konzept, wie es vor dem Bau stand. Die Zahlen unten sind an diesem Tag auf dieser Maschine gemessen (Node 22.22, Chromium 141 headless über Playwright 1.63 aus `/opt/pw-browsers/chromium-1194`); was nicht gemessen ist, steht als Annahme. Die Prüfskripte des Versuchs liegen außerhalb des Repositorys (`scratchpad/worker/`: `bundle.mjs`, `versuch.mjs`, `zeichnen.mjs`, `anteil.mjs`, `demo-zeit.mjs`).

**Anlass.** Bens Prozess hund3 (77 Knoten, 94 Flüsse) braucht beim Anordnen so lange, dass der Tab steht: in Spike 2.26 10 s in Chromium und 15 s in Firefox (`src/README.md:376`). Heute sind es mehr (unten). Solange `layoutGeometry()` rechnet, reagiert die Seite auf nichts.

## 1. Ausgangslage

**Wo das Layout läuft.** Der Renderer `renderBpmn()` (`src/app/bpmn.js:178`) prüft, ob das XML Koordinaten hat, und ordnet sonst synchron an, bevor bpmn-js es importiert: `src/app/bpmn.js:197` ruft `layoutBpmn()` (`src/app/bpmn.js:230`), das `parseXml()` → `readProcess()` → `kanonisch()` → `layoutGeometry()` → `appendDiagram()` hintereinander aufruft und das fertige XML mit der Id des eingefügten Diagramms zurückgibt. Alles davon ist reine Logik ohne DOM:

- `src/app/bpmn-layout.js` importiert nur `measureLabel` (`src/app/bpmn-layout.js:54`); `document`, `DOMParser`, `window`, `canvas` kommen in keinem der vier Module vor (`bpmn-layout.js`, `lmm.js`, `label-size.js`, `xml-parser.js`; geprüft mit `grep`). Der eigene XML-Leser (`src/app/xml-parser.js:138`) liefert das Dokument, das `readProcess()` liest; `appendDiagram()` arbeitet auf dem Text. Der Weg bis zum fertigen XML braucht also weder `document` noch `DOMParser`.
- Erst danach braucht es die Seite: `BpmnJS` zeichnet in einen Host in `<body>`, und der `DOMParser` der Seite liest das SVG von `saveSVG()` (`src/app/bpmn.js:200-209`).

Der Pass `Diagramme` zeichnet die Diagramme eines Dokuments nacheinander in Dokumentreihenfolge, jedes mit `await kind.render(diagram)` (`src/app/diagrams.js:256-270`); eines, das wirft, wird zur Warnung. `render()` wartet auf jeden Pass (`src/app/render.js:125-128`) und lässt nur einen Render zur Zeit zu (`src/app/render.js:88-96`). Die Kette ist also schon asynchron; nur das Layout selbst rechnet synchron auf dem Hauptthread.

**Wann es läuft.** Bei jedem Render: beim Öffnen des Editors (`src/app.js:135`), auf den Render-Knopf und Strg+Enter (`src/app/editor.js:9-19`), beim Wechsel in die Ansicht (`src/app/editor.js:76`), bei „Demo zurücksetzen“ und vor jedem Nur-Lese-Export (`src/app/downloads/export-body.js:61`). **Nicht beim Tippen:** `input` plant nur das Speichern und den Dirty-Status (`src/app/editor.js:12`). Jeder Render ordnet jedes BPMN-Diagramm ohne Koordinaten neu an, auch wenn sich nur Text geändert hat.

**In welchen Varianten.** Nur wo das App-Skript läuft: im Editor (`dist/dokufix.html`) und in jeder `Mit Editor`-Datei, die ihre Vorschau leer speichert und beim Öffnen neu rendert (`src/app/downloads/with-editor.js:119-121`). `nur-lesen`, `schlank` und `kompakt` tragen das fertige SVG und ordnen nichts an; ihr Leserbündel enthält von den vier Modulen nur eine Konstante aus `label-size.js` (68 B, esbuild-Metafile).

**Wie lange.** hund3 liegt unter `tools/bpmn-layout/eingaben/laufzeit/hund3.bpmn` (Satz `laufzeit`, `tools/bpmn-layout/README.md:52`).

| Eingabe | Node (`lauf.mjs --satz laufzeit`) | Chromium 141, Hauptthread | Chromium 141, im Worker |
|---|---|---|---|
| hund3 (77 Knoten) | 23,1 s; 248 Läufe von `finishGrid()` (R16 162, R12 70) | 17,2 bis 19,2 s | 17,7 bis 18,2 s |
| hund2 (57 Knoten, Fixture) | 1,1 s (`docs/konzept-ordnungsphase.md:30`) | 1,9 s | 1,85 s |
| ref3 (Fixture) | | 0,18 s | 0,15 bis 0,17 s |
| Demo-Text, 13 Layouts | zusammen 0,33 s, das größte 63 ms | | |
| `tests/referenz.md`, 12 Layouts | zusammen 0,25 s, das größte 154 ms | | |

hund3 ist heute also etwa doppelt so langsam wie in Spike 2.26; die Proben von R16 und R12 machen 232 der 248 Läufe aus. Die gewöhnlichen Diagramme sind schnell; das Problem sind einzelne große.

**Was auf dem Hauptthread bliebe.** bpmn-js braucht für das angeordnete hund3 (64 KB XML) 45 bis 96 ms für den Import, 5 bis 7 ms für `saveSVG()` und 6 ms für das Parsen des SVG (188 570 B, 1 738 Elemente; `zeichnen.mjs` mit `tests/.cdn/npm/bpmn-js@18.31.0`). Der Worker nimmt also praktisch die ganze Wartezeit vom Hauptthread.

## 2. Der Worker in einer einzigen HTML-Datei, auch unter `file://`

Ein Worker braucht eine URL für sein Skript. dokufix ist eine Datei, meist von `file://` geöffnet. Vier Wege wurden mit einer einzigen HTML-Datei geprüft, die das Layout als `<script type="text/plain">`-Block trägt (wie das Leserbündel, `src/index.html:98`) und daraus den Worker macht (`versuch.mjs`, hund3, dasselbe XML wie synchron?):

| Weg | `file://` | `about:blank` (`setContent`) | `http://127.0.0.1` |
|---|---|---|---|
| Blob-URL, klassischer Worker | **geht**, XML byte-gleich | geht | geht |
| Blob-URL, Modul-Worker (`{ type: 'module' }`) | **scheitert** (`error`-Ereignis, kein Skript geladen) | scheitert | geht |
| `data:`-URL, klassischer Worker | geht, XML byte-gleich | geht | geht |
| `data:`-URL, Modul-Worker | geht, XML byte-gleich | geht | geht |

Der Modul-Worker aus einer Blob-URL scheitert genau dort, wo die Seite eine opake Herkunft hat (`file://` und `about:blank`), und geht über `http://`. Annahme zur Ursache: Ein Modulskript wird mit CORS geholt, und eine `blob:null/…`-URL gilt dann nicht als gleiche Herkunft; ein klassischer Worker aus einer Blob-URL ist ausdrücklich erlaubt. **Empfehlung: Blob-URL und klassischer Worker.** Die `data:`-URL ginge auch, kostet aber die Prozent- oder Base64-Kodierung von 98 KB bei jedem Start; der Blob kostet nichts.

- **Firefox: nicht gemessen.** Auf dieser Maschine liegt kein Playwright-Firefox (`~/.cache/ms-playwright` fehlt; `tests/durchlaeufe.mjs:182-188` sucht dort). Annahme: Firefox startet klassische Worker aus Blob- und `data:`-URLs auch von `file://`; zu messen mit dem ersten Firefox-Lauf, siehe Schritt 4.
- **Hauptthread frei:** Während der Worker 18 s rechnet, zählt ein `setInterval` von 50 ms 354 bis 364 Ticks, also fast jeden. Die Seite reagiert.
- **Anlaufpreis:** `new Worker()` bis zur ersten Antwort (ein winziges Layout eingeschlossen) 31 bis 45 ms, das Parsen der 98 KB inbegriffen. Ein winziges Layout kostet im Worker 11 bis 17 ms gegen 2,5 bis 3,3 ms synchron: rund 10 ms für den Nachrichtenweg. Für die Demo-Diagramme (bis 63 ms) ist das spürbar nur in der Summe; deshalb ein Worker für die Seite, der am Leben bleibt (Abschnitt 3).
- **`terminate()`** kehrt sofort zurück; danach kommt keine Nachricht mehr.

**Wie der Code ins Bündel kommt.** Die vier Module sind minifiziert 97 672 B von 195 914 B des App-Skripts (`bpmn-layout.js` 80 516, `xml-parser.js` 8 869, `lmm.js` 4 150, `label-size.js` 4 137; esbuild-Metafile, `anteil.mjs`), also die Hälfte. Als eigenes Worker-Bündel mit dem Nachrichtenprotokoll: 98 184 B minifiziert (36 606 B gzip).

| Weg | Was zu tun ist | Kosten in `dist/dokufix.html` (434 514 B) und jeder `Mit Editor`-Datei |
|---|---|---|
| **(a) zweiter Einstieg `src/layout-worker.js`**, von esbuild als zweite IIFE gebündelt (wie `src/reader.js`, `build.mjs:238-240`), in einen Block `<script type="text/plain" id="dokufix-layout-js">`; die Seite liest `textContent`, macht Blob und Worker | ein Slot mehr in `src/index.html` und `SLOTS` (`build.mjs:100`); die Prüfung auf `</script` und `<!--` auch für diesen Block (`build.mjs:125-128`); `bpmn.js` behält seine Importe für den Rückfall | **+98 KB** (die Module stehen dann zweimal in der Datei: in `app.js` für den Rückfall, im Block für den Worker) |
| (b) wie (a), aber `app.js` importiert die Module nicht mehr; der Rückfall ohne Worker wertet den Block in der Seite aus (`new Function(code + '; return dokufixLayout')()` mit esbuilds `globalName`), und `bpmn.js` bekommt die Layout-Funktion gereicht statt sie zu importieren | `bpmn.js` braucht eine Übergabe (`setLayout()` oder ein Parameter von `renderBpmn()`); `tests/bpmn.test.mjs` reicht die echten Module, wie es heute `BpmnJS` und `DOMParser` als Globale setzt (`tests/bpmn.test.mjs:158-169`) | **±0 KB** (die Module wandern von `app.js` in den Block) |
| (c) der Worker aus dem Text des App-Skripts selbst (`<script>` ohne Id, `src/index.html:122-124`) | geht nicht ohne Umbau: `src/app/dom.js:2-5` und andere greifen beim Laden auf `document` zu, und im Worker liefe die ganze App an | |
| (d) der Worker-Code als String per esbuild-`define` in `app.js`, wie `SEARCH_CSS` | ein Slot weniger, dafür JSON-Escaping | wie (a), plus einige Prozent fürs Escaping |

Für die Nur-Lese-Exporte ändert sich bei keinem Weg etwas: Sie kopieren die Vorschau und tragen das Leserbündel, nicht `app.js` und nicht den Block. **Empfehlung: (a) im ersten Schritt**, weil `bpmn.js`, seine Tests und der Rückfall bleiben, wie sie sind; **(b) als eigener Schritt danach**, wenn Ben die 98 KB nicht tragen will (offene Frage unten). Der Block wandert mit jeder `Mit Editor`-Datei, wie das Leserbündel: Die Speicherung klont das ganze Dokument (`src/app/downloads/with-editor.js:89`) und schreibt nur die vier Datenblöcke neu.

## 3. Schnittstelle

**Die Aufgabe, als reine Logik.** `layoutBpmn()` zieht aus `src/app/bpmn.js:230-240` in ein Modul reiner Logik, Arbeitsname `src/app/bpmn-layout-job.js`:

- `layoutJob(xml)` → `{ xml }` (XML, das der Leser ablehnt oder das kein BPMN ist: zurück wie es ist, bpmn-js formuliert den Grund, wie heute), `{ xml, open, leftOut }` (angeordnet; `leftOut` die Zeilen von `leftOutLine()`, `src/app/bpmn-layout.js:410`, statt `console.warn` im Modul), oder es wirft die Ablehnung des Layouts (`LAYOUT_NOTHING`, `layoutStrayText()`, `src/app/bpmn-layout.js:74-77`).
- `answerLayout(message)` → die Antwort auf eine Nachricht: `{ id, ok: true, result }` oder `{ id, ok: false, error: message }`. Ohne Worker-API, damit sie in Node getestet wird.

`bpmn.js` ruft im Rückfall `layoutJob()` direkt und schreibt `leftOut` auf die Konsole, wie heute (`src/app/bpmn.js:238`). Der Worker-Einstieg `src/layout-worker.js` ist drei Zeilen: `self.onmessage = e => self.postMessage(answerLayout(e.data))`.

**Nachrichten.** Hin: `{ id, xml }`. Zurück: `{ id, ok, result | error }`. `id` zählt je Anfrage, damit eine späte Antwort einer abgebrochenen Anfrage keiner neuen zugeordnet wird. Die Strings werden strukturiert kopiert (64 KB bei hund3); keine Transferables nötig.

**Der Client in der Seite**, Arbeitsname `src/app/layout-client.js`, reine Logik mit einer einsetzbaren Fabrik `makeWorker()` für die Tests:

- `layoutAsync(xml, { signal })` gibt ein Promise auf das Ergebnis von `layoutJob()` und wirft dieselben Fehler: Die Ablehnung kommt als `Error` mit der Nachricht aus `error`, damit `renderBpmn()` und seine Tests (`tests/bpmn.test.mjs:338-351`) dieselben Meldungen sehen.
- **Ein Worker für die Seite**, nicht einer je Diagramm: Er wird beim ersten Diagramm ohne Koordinaten gemacht (aus dem Block, Blob-URL, klassisch) und bleibt für die nächsten Render am Leben; so fällt der Anlaufpreis einmal an. Die Anfragen laufen **nacheinander** durch eine Warteschlange: Der Pass zeichnet ohnehin eines nach dem anderen, und bpmn-js zeichnet auf dem Hauptthread. Parallel rechnende Worker brächten bei mehreren großen Diagrammen etwas, kosten aber je Worker 98 KB geparsten Code; nicht im ersten Schritt.
- **Fehlerfälle:**
  - Kaputtes XML: `{ xml }` ohne `open`, bpmn-js formuliert den Fehler (wie heute, `tests/bpmn.test.mjs:355`).
  - Ablehnung des Layouts: `ok: false` mit der Meldung → `Error` im Client → Warnung mit Grund, kein Host (`tests/bpmn.test.mjs:338`).
  - Ausnahme im Worker (ein Fehler im Code, ein Stapelüberlauf): `ok: false` aus dem `try` in `answerLayout()`, oder das `error`-Ereignis des Workers, wenn das Skript selbst nicht lädt. Beides wird zur Warnung des Diagramms; der Client verwirft den Worker und macht beim nächsten Diagramm einen neuen.
  - Kein Worker: `typeof Worker !== 'function'`, der Block fehlt, `new Worker()` wirft (eine Umgebung, die Blob-URLs für Worker verbietet) → Rückfall auf `layoutJob()` synchron, einmal entschieden und als eine Zeile auf der Konsole vermerkt.
- **Zeitgrenze:** Eine Anfrage, die länger als `LAYOUT_TIME_LIMIT` läuft, wird abgebrochen: `terminate()`, der Worker wird neu gemacht, das Promise wirft „Das Layout hat die Zeitgrenze von … s überschritten.“, die Warnung des Diagramms nennt das. Vorschlag 60 s (hund3 braucht in Chromium 18 bis 20 s; Firefox ist nicht gemessen und war in Spike 2.26 anderthalbmal so langsam; eine Grenze, die Bens eigenen Prozess trifft, wäre falsch). Im Rückfall ohne Worker gibt es keine Grenze, weil sich synchroner Code nicht abbrechen lässt.
- **Abbruch durch einen neuen Render:** `render()` reiht einen zweiten Render hinter den laufenden (`src/app/render.js:88-96`). Heute merkt das niemand, weil der Hauptthread ohnehin steht; mit dem Worker reagiert die Seite, und ein Strg+Enter während eines 18-s-Layouts würde erst danach wirken. Vorschlag: `render()` gibt jedem Render einen `AbortController` und bricht den laufenden ab, sobald ein neuer angefordert wird; `context` bekommt `signal` neben `frontmatter`. `renderBpmn()` reicht es dem Client, der die laufende Anfrage mit `terminate()` beendet und wirft; der Pass setzt die Warnung in eine Vorschau, die der nächste Render sowieso ersetzt. Das ist ein eigener Schritt (Schritt 5), weil er `render.js` und den Kontext der Pässe berührt.
- **Was die Seite zeigt:** Heute steht die Quelle des Blocks als Text im SVG-Container, bis das Diagramm da ist (`src/app/diagrams.js:251`); bei einem blockierten Thread sieht das niemand, mit dem Worker 18 s lang rohes XML. Mermaid liest seine Quelle aus dem Container, BPMN nicht (`renderBpmn()` nimmt `diagram.source`). Für die Art `bpmn` schreibt der Pass deshalb den Hinweis „Diagramm wird angeordnet …“ in den Container; er wird durch das SVG oder die Warnung ersetzt, bevor irgendein Export die Vorschau kopiert (`buildExportBody()` wartet auf den Render, `src/app/downloads/export-body.js:61`). Kein Platzhalter erreicht eine Datei.

## 4. Folgen für das Rendern

- **Reihenfolge und Warnungen:** unverändert. `drawDiagrams()` wartet schon je Diagramm (`src/app/diagrams.js:259`); eines, das wirft, wird zur Warnung mit dem Grund, die anderen werden gezeichnet. Die Diagramme erscheinen nacheinander, statt alle auf einmal nach dem letzten Layout. Die Breite der Figur und die Zeile der Downloads werden wie heute nach dem Zeichnen gesetzt. `leftOut` kommt als Liste zurück und geht in der Seite auf die Konsole, wie heute.
- **Exporte:** `buildExportBody()` rendert und kopiert dann (`src/app/downloads/export-body.js:61-64`); mit dem Worker dauert der Klick auf einen Export genauso lang wie heute, aber die Seite reagiert, und die Knöpfe sind währenddessen gesperrt (`src/app/downloads/menu.js:42`). Die Nur-Lese-Exporte bekommen dasselbe SVG wie heute, weil der Worker dasselbe XML liefert (byte-gleich geprüft).
- **Speichern (`Mit Editor`):** Die Vorschau wird leer gespeichert, der Empfänger rendert neu (`with-editor.js:119-121`); ein Speichern während eines laufenden Layouts klont den Hinweistext mit, leert die Vorschau aber ohnehin. Der neue Block wandert mit der Datei; `tests/speichern.mjs` muss ihn als Teil der gebauten Datei sehen, was er automatisch tut, weil er nicht umgeschrieben wird.
- **Live-Viewer und Großansicht:** Der Viewer liest das XML aus dem Quell-Link der Figur (`src/app/live-viewer.js:198`) und startet nur, wenn ein SVG im Container steht (`live-viewer.js:192`). Beides gibt es erst nach dem Zeichnen; die Großansicht eines Diagramms, das noch angeordnet wird, zeigt den Hinweis in der statischen Ansicht. Keine Änderung nötig.
- **Suche:** Ein `MutationObserver` auf der Wurzel verwirft die gelesenen Stellen bei jeder Änderung, ausdrücklich auch bei „einem spät gezeichneten Diagramm“ (`src/app/search.js:432-436`). Keine Änderung nötig.
- **Browser-Durchläufe:** Sie nehmen „die Leiste wurde neu gebaut“ als „der Render ist fertig“ (`tests/durchlaeufe.mjs:455-463`, `pressAndWaitForRender()`), und `render()` wartet weiter auf alle Pässe. Die Zeitgrenze von 90 s dort reicht für hund3; die Prüfdokumente haben keins dieser Größe.
- **Der BPMN-Assistent** (`tools/bpmn-assistant/bauen.mjs:39-48`) bündelt die Module selbst in seine Seite und ordnet auf dem Hauptthread an. Er gehört nicht zum Produkt und nicht zu diesem Konzept; er könnte später `layoutJob()` und denselben Worker-Einstieg nehmen.

## 5. Rückfall

Wo es keinen Worker gibt, läuft `layoutJob()` synchron, derselbe Code, dieselben Fehler:

- **Node:** `typeof Worker` ist `undefined` (Node 22, gemessen; `node:worker_threads` ist kein Global). `tests/bpmn.test.mjs` ruft `renderBpmn()` mit dem Stand-in für `BpmnJS` und erwartet das Layout im selben Aufruf (`tests/bpmn.test.mjs:234-260`); das bleibt so, ohne dass ein Test etwas einstellt. `tests/bpmn-fixtures.mjs:29-31` und `tools/bpmn-layout/lib.mjs:123-130` importieren die Module direkt und berühren weder `bpmn.js` noch den Client.
- **Browser ohne Worker** oder mit einer Umgebung, die den Worker nicht starten lässt: dieselbe Verzweigung, eine Zeile auf der Konsole.
- **Neue Tests in Node:** `layoutJob()` und `answerLayout()` mit den Eingaben der heutigen `layoutBpmn()`-Tests; der Client mit einem gefälschten Worker (`postMessage`, `onmessage`, `onerror`, `terminate`), der antwortet, schweigt (Zeitgrenze), wirft oder abgebrochen wird. `renderBpmn()` mit einer eingesetzten Fabrik, die den gefälschten Worker liefert, damit der asynchrone Weg in Node geprüft ist, und ohne Fabrik für den Rückfall.

## 6. Was sich nicht ändert

- **Das Layout selbst und die Bilder.** Kein Modul der vier wird angefasst; `npm run fixtures` bleibt grün, und die 57 Fixtures byte-gleich. Der Versuch hat für hund3, hund2 und ref3 bestätigt, dass der Worker dasselbe XML liefert wie der synchrone Weg.
- **Das Leserbündel** bleibt unberührt: Es trägt weder `bpmn.js` noch den Client, und die neuen Module werden nur von `bpmn.js` und `src/layout-worker.js` importiert. Es misst heute 33 955 Zeichen bei einer Schranke von 34 000 (`tests/build.test.mjs:467`); 45 Zeichen Luft, also darf kein Import in `diagram-kinds.js`, `diagrams.js`-Konstanten oder `large-view.js` dazukommen. Der Build-Test misst das.
- **bpmn-js**, seine Konfiguration, die Klassen, `finishBpmnSvg()`, die Downloads, die Lizenzliste (der Worker bringt keine fremde Bibliothek).
- Die Nur-Lese-Exporte in Inhalt und Größe.

## 7. Verhältnis zur Obergrenze (N3)

`docs/analyse-mermaid-im-bpmn-code.md`, Abschnitt 7, lässt offen, ob das Layout ab einer Zahl an Knoten ablehnt, weil ein fremdes Dokument den Tab blockieren kann (400 Aufgaben in einer Kette 1,3 s, 1 600 geschätzt 12 s, 5 000 Minuten). Der Worker nimmt das Blockieren weg, nicht die Arbeit: Ein fremdes Dokument rechnet dann minutenlang in einem Worker, der CPU und Akku kostet, und das Diagramm kommt nie. Deshalb **beides, aber in anderer Form als eine Knotenzahl:**

- Die **Zeitgrenze im Client** (Abschnitt 3) ist die Obergrenze: Sie misst, was wirklich zählt, bricht ab, ohne die Seite zu stören, und erklärt sich dem Leser. Eine Knotenzahl müsste groß genug für hund3 und klein genug für den Fall aus dem Review sein; die Laufzeit hängt an den Proben, nicht nur an der Zahl der Knoten (hund3 mit 77 Knoten: 248 Läufe).
- Eine **sehr grobe Schranke vor dem Layout** bleibt sinnvoll, weil der Rückfall ohne Worker keine Zeitgrenze hat: etwa einige tausend Flussknoten, geprüft in `readProcess()` oder `layoutJob()`, mit eigener Meldung. Sie trifft kein echtes Dokument und lässt sich in Node testen. Ob sie nötig ist, hängt davon ab, wie oft der Rückfall vorkommt; Vorschlag: erst die Zeitgrenze, die Schranke als offene Frage an Ben.
- Die Ordnungsphase (`docs/konzept-ordnungsphase.md`) senkt die Laufzeit selbst; sie ersetzt den Worker nicht, denn auch ein Ebenen-Layout ist nicht linear, und umgekehrt ersetzt der Worker sie nicht: 18 s auf ein Diagramm zu warten bleibt lang, auch wenn die Seite dabei reagiert.

## 8. Vorgehen in Schritten

Jeder Schritt lässt `npm test`, `npm run check` und `npm run fixtures` grün; die Browser-Durchläufe (`tests/durchlaeufe.mjs`, `tests/vergleich.mjs`) am Ende von Schritt 4 und 5 in Chromium und Firefox.

| Schritt | Ergebnis | Prüfung |
|---|---|---|
| **1. Die Aufgabe als reine Logik.** `layoutBpmn()` wird `layoutJob()` und `answerLayout()` in `src/app/bpmn-layout-job.js`; `bpmn.js` ruft `layoutJob()` synchron | kein sichtbarer Unterschied; die Fixtures byte-gleich | neue Tests in Node für beide Funktionen; `tests/bpmn.test.mjs` unverändert grün; `npm run fixtures` |
| **2. Der Block im Build.** `src/layout-worker.js`, zweite IIFE, Slot `layout.js`, Block in `src/index.html`; die Prüfung auf `</script` und `<!--`; ein Größentest wie der des Leserbündels (`tests/build.test.mjs:460-467`); `src/README.md`, *Build* und *Die Module des Skripts* | `dist/dokufix.html` trägt den Block; +98 KB | `npm run check`, `npm run build`; `tests/speichern.mjs` sieht den Block als Teil der gebauten Datei |
| **3. Der Client.** `src/app/layout-client.js`: Worker aus dem Block, Warteschlange, Zeitgrenze, Rückfall, einsetzbare Fabrik; `renderBpmn()` wartet auf `layoutAsync()`; der Hinweis im Container | hund3 blockiert den Tab nicht mehr; Node läuft wie heute | Tests mit gefälschtem Worker; `tests/bpmn.test.mjs` (Rückfall) grün; von Hand: hund3 im Editor, Scrollen und Tippen währenddessen |
| **4. Browser-Durchläufe.** Ein Fall in `tests/durchlaeufe.mjs`: Ein großes Diagramm wird angeordnet, währenddessen reagiert die Seite (ein Klick wird verarbeitet); mit `Worker` aus der Seite genommen zeichnet der Rückfall dasselbe; eine künstlich kurze Zeitgrenze ergibt die Warnung. Die Firefox-Messung aus Abschnitt 2 nachholen (`tools/bpmn-layout/browser-zeit.mjs` hat die Vorlage) | alle Durchläufe grün in Chromium und Firefox; die Firefox-Zeile der Tabelle gefüllt | `npm run pruefung`, `tests/durchlaeufe.mjs`, `tests/vergleich.mjs --strict` gegen den Stand davor: Bilder und Exporte unverändert |
| **5. Abbruch durch einen neuen Render.** `AbortController` je Render in `render.js`, `signal` im Kontext der Pässe, `terminate()` im Client | Strg+Enter während eines Layouts wirkt sofort | Tests in Node für den Client; ein Fall in den Durchläufen |
| **6. Optional: ohne Dopplung (Weg b).** Die Module aus `app.js` heraus, der Rückfall wertet den Block aus, `bpmn.js` bekommt die Funktion gereicht | `dist/dokufix.html` wieder bei heutiger Größe | `npm test`, `npm run check`, Durchläufe |
| **7. Optional: ein Zwischenspeicher** je Quelle (`Map` von XML auf Ergebnis, begrenzt auf die Diagramme des letzten Renders) | ein Render nach einer Textänderung ordnet nichts neu an | Tests in Node; Speicher: hund3 angeordnet 64 KB |

**Aufwand**, grob: Schritte 1 bis 4 zwei bis drei Arbeitstage, davon der größte Teil Client, Tests und Durchläufe; Schritt 5 ein halber bis ein Tag; Schritt 6 ein Tag; Schritt 7 ein halber Tag.

## Risiken

- **Browserunterschiede bei Worker-URLs.** Der Versuch zeigt, dass ein Weg (Blob + Modul) in Chromium unter `file://` scheitert. Firefox und Safari sind nicht gemessen. Der Rückfall fängt jeden Fall, in dem der Worker nicht startet; schlimmstenfalls ist es dort wie heute.
- **98 KB mehr in jeder `Mit Editor`-Datei** (Weg a), bis Schritt 6. Die Größenrechnung in `src/README.md` zählt jedes Byte; Ben entscheidet.
- **Zeitgrenze zu knapp.** Ohne Firefox-Messung ist 60 s eine Setzung. Zu knapp, und Bens hund3 wird auf einem langsamen Rechner zur Warnung.
- **Der Worker rechnet weiter, obwohl niemand mehr wartet,** wenn Schritt 5 fehlt und ein Export oder ein zweiter Render folgt; ohne Zeitgrenze bliebe ein hängendes Diagramm für immer. Beides ist durch die Zeitgrenze begrenzt.
- **Zwei Codewege** (Worker und Rückfall) für dieselbe Aufgabe. Begrenzt, weil beide `layoutJob()` rufen und nur der Transport verschieden ist; der Test mit dem gefälschten Worker deckt den Transport ab.
- **Das Leserbündel** hat 45 Zeichen Luft bis zur Schranke; ein unbedachter Import in einem geteilten Modul bricht den Build-Test. Das ist gewollt und fällt sofort auf.

## Offene Fragen an Ben

1. Sind +98 KB in `dist/dokufix.html` und jeder `Mit Editor`-Datei für den ersten Schritt tragbar, oder soll Weg (b) gleich mitgebaut werden?
2. Zeitgrenze: 60 s? Oder gar keine Grenze, solange die Seite reagiert, und nur ein Hinweis im Diagramm mit „Abbrechen“?
3. Soll das Diagramm während des Layouts den Hinweis „Diagramm wird angeordnet …“ zeigen, oder ein leerer Platzhalter in der Höhe des späteren Bildes (die Höhe ist vor dem Layout unbekannt; der Text ist einfacher)?
4. Braucht der Rückfall ohne Worker die grobe Knotenschranke aus N3, oder reicht die Zeitgrenze im Worker?
5. Gehört der Zwischenspeicher (Schritt 7) in dieses Vorhaben? Er macht jeden Render nach einer Textänderung schneller, auch für die 13 kleinen Diagramme des Demo-Textes, hat aber mit dem Worker nur den Anlass gemein.
6. Soll der BPMN-Assistent denselben Worker-Einstieg nehmen?

## Umsetzung (7. Oktober 2026)

Gebaut sind die Schritte 1 bis 5 aus Abschnitt 8 und der BPMN-Assistent, nach Bens Entscheidungen vom selben Tag. Schritt 6 (Weg b) und Schritt 7 (Zwischenspeicher) sind nicht gebaut.

**Bens Entscheidungen** (die Antworten auf die offenen Fragen oben):

1. Weg (a): zweiter Einstieg `src/layout-worker.js`, als IIFE in den Block `<script type="text/plain" id="dokufix-layout-js">`, daraus per Blob-URL ein klassischer Worker. `app.js` behält die vier Module für den Rückfall; die Dopplung von etwa 98 KB ist angenommen.
2. Zeitgrenze **120 s** (nicht 60 s): danach `terminate()`, ein neuer Worker für die nächste Anfrage, und das Diagramm ist die Warnung „Das Layout hat die Zeitgrenze von 120 s überschritten.“
3. Der Hinweis „Diagramm wird angeordnet … 0 s“ im Container des Diagramms, dessen Sekunden sichtbar jede Sekunde hochzählen; nie in einer Datei, transient, sein Zeitgeber endet in jedem Fall.
4. **Keine Knotenschranke**, auch nicht im Rückfall (die grobe Schranke aus Abschnitt 7 entfällt).
5. Kein Zwischenspeicher.
6. Der BPMN-Assistent bekommt denselben Weg mit: gleicher Worker-Einstieg und gleiches Protokoll, Zeitgrenze, Zähler.

**Was gebaut ist**, in Commits:

| Schritt | Commit | Was |
|---|---|---|
| 1 | `2655a18` | `src/app/bpmn-layout-job.js`: `layoutJob()` gibt `{ xml }` oder `{ xml, open, leftOut }` (die Zeilen von `leftOutLine()`), oder wirft die Ablehnung; `answerLayout()` die Antwort `{ id, ok, result \| error }`, die nie wirft. `layoutBpmn()` in `bpmn.js` ist weg. Test: `tests/bpmn-layout-job.test.mjs`, alle 57 Fixtures durch `layoutJob()` byte-gleich. |
| 2 | `afb3f97` | `src/layout-worker.js` (eine Zeile um `answerLayout()`), der Slot `layout.js` in `SLOTS` und `src/index.html`, die Prüfung auf `</script` und `<!--` auch für diesen Block. Größentest in `tests/build.test.mjs` (80 000 bis 108 000 Zeichen) und ein Lauf des Blocks in `vm` mit nichts als `self`: er schweigt beim Laden und antwortet wie `layoutJob()`. |
| 3 | `eeea0a2` | `src/app/layout-client.js` (`makeLayoutClient()`, `pageWorker()`), `src/app/layout-notice.js` (`showLayoutNotice()`); `renderBpmn(diagram, { client, timers, now })` wartet auf den Client. Tests: `tests/layout-client.test.mjs`, `tests/layout-notice.test.mjs`, neue Fälle in `tests/bpmn.test.mjs`. |
| 5 | `8722c8b` | `render()` gibt jedem Render einen `AbortController`, `context.signal` geht an jeden Pass, der Pass `Diagramme` reicht es jedem Diagramm. |
| 4 | `ff269d1` | Fälle 15 und 16 in `tests/durchlaeufe.mjs` (unten). |
| Assistent | `cd26d52` | beide Anordnungen im Worker (unten). |

**Abweichungen vom Konzept**, mit Grund:

- *Wer den Hinweis schreibt.* Nicht der Pass für jeden BPMN-Block (Abschnitt 3), sondern `renderBpmn()`, und nur, wenn es anordnet: Ein Diagramm mit Koordinaten wird nicht angeordnet, und ein Zähler, der bei einem wartenden Diagramm auf 0 s stehen bliebe, beunruhigt mehr, als er sagt. Der Container eines BPMN-Diagramms, das auf seine Reihe wartet, bleibt **leer** (die Art `bpmn` trägt `sourceInHolder: false` in `src/app/diagrams.js`), statt bis zu 64 KB XML als Text zu zeigen, solange die Diagramme davor gezeichnet werden. Mermaid behält seine Quelle dort, weil es sie dort liest.
- *Barrierefreiheit des Hinweises* (entschieden, wie Ben es offenließ): `role="status"`, eine höfliche Live-Region, die den Hinweis einmal ansagt, wenn er kommt; die Sekunden stehen in einem `<span aria-hidden="true">`, weil eine Live-Region, deren Text sich jede Sekunde ändert, jede Sekunde vorgelesen würde, und die Zahl nichts sagt, was der Hinweis nicht schon sagt. Die Sekunden werden an der Uhr gemessen, nicht an den Ticks gezählt (ein später Tick zeigt die vergangene Zeit), mit `tabular-nums`, damit die Zeile nicht springt.
- *Das Aussehen des Hinweises* steht in seinem `style`-Attribut, nicht in einem Stylesheet: `src/doc.css` reist in jedes Exportbündel mit, das ihn nie zeigt, und die Stilprüfung verbietet Regeln für den Inhalt der Vorschau in `src/app.css` (`tests/check-doc-styles.mjs`). Die Klasse heißt deshalb `layout-notice`, ohne das Präfix der Dokumentbausteine.
- *Ein Worker, der ausfällt, bevor er je geantwortet hat,* gilt als einer, der auf dieser Seite nicht startet: Die Seite ordnet ab da selbst an, die laufende Anfrage eingeschlossen, mit einer Zeile auf der Konsole. Abschnitt 3 sah dafür eine Warnung vor; die *Risiken* versprachen, dass der Rückfall jeden Fall fängt, in dem der Worker nicht startet. Fällt er nach einer Antwort aus, wird die Anfrage zur Warnung „Das Layout ist im Hintergrund fehlgeschlagen.“ mit dem Grund, und die nächste bekommt einen neuen Worker. (Nach dem Review entscheidet das die Seite, nicht der einzelne Worker; siehe unten.)
- *Das Promise von `render()`* erfüllt sich erst, wenn die Vorschau die des neuesten Renders ist (Schritt 5 brachte sonst eine Lücke): Ein Export, der während eines Layouts angefordert wird, bricht das laufende ab, rendert neu und wartet darauf; er kopiert nie eine Vorschau mit dem Hinweis oder mit der Warnung eines abgebrochenen Layouts. Ein Render, der abgebrochen wird, bevor er dran ist, läuft gar nicht. Ein abgebrochenes Diagramm wurde zur Warnung „Das Layout wurde abgebrochen.“ in einer Vorschau, die der neue Render ersetzt; nach dem Review bekommt es keine Warnung mehr (unten).
- *`--dev`* minifiziert den Block auch, wie das Leserbündel; die Module stehen in der `--dev`-Datei lesbar im Skript, das der Rückfall ausführt.
- *Der Assistent* nimmt den Block fertig aus `dist/dokufix.html`, wie schon die Dokumentstile; so ist es byte-gleich der Worker der App. Und **auch bpmn.io läuft im Worker**: `bpmn-auto-layout` ist reine Logik (bpmn-moddle, kein DOM; im Bündel steht nur `window.BAL=`) und brauchte für hund3 auf der Seite 17 s, die den Tab nach A2 noch einmal anhielten. Es läuft in einem eigenen klassischen Worker aus dem Text seines Skripts (`var window = self;` davor), über denselben Client und dasselbe Protokoll; dafür nimmt `makeLayoutClient()` die Aufgabe, die die Seite ohne Worker ausführt, als Option `job` (Vorgabe `layoutJob()`).
- *Die Konsolenzeile in Node.* Node hat keinen `Worker`; der Client vermerkt den Rückfall einmal je Prozess mit `console.info`, die in `npm test` als eine Zeile `# BPMN layout on the page, without a worker: the page has no Worker` erscheint. Kein Test stellt etwas ein.

**Was im Assistenten wo läuft:** Im Worker die reine Logik, die die Zeit kostet: Lesen, LMM, Raster, Diagrammteil (`layoutJob()`), und die Anordnung von bpmn.io. Auf der Seite, was die Seite braucht oder schnell ist: das Lesen des XML für die nicht angeordneten Elemente und für das Modell der Regelprüfung, die Behelfslinien der Assoziationen zwischen Flussknoten (`DOMParser`), die Brüche (`breaksOf()`), das Zeichnen mit `bpmn-js`, Großansicht und Modellierer. Ein neues Rendern bricht ein laufendes ab; die Zeit im Kopf eines Abschnitts sagt „im Worker“ oder „(ohne Worker)“.

**Gemessen** (Chromium 141 headless über Playwright 1.63, `/opt/pw-browsers/chromium`, unter `file://`; Skripte außerhalb des Repositorys, `scratchpad/worker-bau/`):

| Was | Ergebnis |
|---|---|
| `dist/dokufix.html` | 434 514 → 536 167 B (+101 653 B: Block 98 064 B, gzip 36 551 B; Skript +3 305 B; Tags und Kommentar 284 B) |
| `dist/bpmn-assistant.html` | 507 176 → 614 232 B |
| Leserbündel der Exporte | 33 955 Zeichen, unverändert (Schranke 34 000) |
| hund3 in `dist/dokufix.html` | Render 20,9 s; der Hinweis zählt 0 bis 20 s; ein Intervall von 50 ms läuft 415 von 418 Ticks (längste Lücke 230 ms, beim Zeichnen am Ende); ein Klick auf „1.2.3“ währenddessen in 42 ms verarbeitet |
| hund3 ohne `Worker` (Rückfall) | dasselbe XML; die Seite steht wie vorher |
| ein Render während hund3 (Fall 15) | sofort gezeichnet, das Layout davor abgebrochen |
| hund3 im Assistenten | A2 im Worker 20,8 s, bpmn.io danach im Worker 16,6 s; 759 von 755 erwarteten Ticks in 37,8 s, längste Lücke 207 ms; der Farbdialog öffnet sich währenddessen auf einen Klick (71 ms); 1 und 24 Brüche wie vorher |
| Assistent, hund2 und r01 | A2 byte-gleich der Fixture, bpmn.io im Worker byte-gleich bpmn.io auf der Seite |

**Prüfungen:** `npm test` 1 102 grün; `npm run check`, `npm run fixtures` (57 ohne Abweichung), `npm run build`, `npm run assistant` grün; `tests/durchlaeufe.mjs --browser chromium` 481 von 481 grün (alle sechzehn Fälle, in 1 min 36 s). **Firefox ist nicht gemessen und nicht gelaufen:** Auf dieser Maschine liegt kein Playwright-Firefox. `tests/vergleich.mjs` ist nicht gelaufen.

**Nach dem Review** (7. Oktober 2026). Ein Code-Review fand vier Befunde (M1 bis M4) und sechs kleinere (N1 bis N6); behoben ist jeder mit einem Test, in den Commits `23323ca` bis `1510f39`:

- *M1, die Großansicht während des Layouts.* Der Hinweis steht in der Bühne, einem Label des Häkchens; ein Klick darauf öffnet die Großansicht, bevor der Laufzeit-Pass zuhört, und danach startete kein Live-Viewer. Jetzt startet `attachLiveViewers()` den Viewer einer Ansicht, die schon offen ist. Gesperrt wird die Großansicht nicht: Wer klickt, will sie, und sieht den Hinweis groß, dann den Viewer; ein Klick ohne sichtbare Wirkung sagte weniger, und eine Sperre wäre ein Zustand am Häkchen, also im Dokument. In Chromium belegt (hund2, Klick auf den Hinweis): vorher statisches Bild, jetzt Viewer und Hinweiszeile, Escape schließt.
- *M2, ein Abbruch ist kein Fehler.* `renderBpmn()` protokolliert bei abgebrochenem Signal nichts, `drawDiagrams()` gibt dem abgebrochenen Diagramm keine Warnung und zeichnet kein weiteres, `renderOnce()` überspringt die Laufzeit-Pässe. Die Leiste baut auch der abgebrochene Render (Fall 2 der Durchläufe erkennt die Reihenfolge der Renders an ihren Leisten). Fall 15 beobachtet jetzt die Mutationen der Vorschau und die Konsole nach beiden Abbrüchen, dem des Exports und dem des Renders. Vorher in Chromium: zwei Warnungen „… Das Layout wurde abgebrochen.“ für einen Augenblick und zwei Zeilen `BPMN error: AbortError`; jetzt keine.
- *M3, der Rückfall gilt für die Seite.* Statt `answered` je Worker ein `everHeard` je Client: Hat einmal ein Worker geantwortet oder sich gemeldet, ist ein Fehler eines Ersatz-Workers ein Fehler seiner Anfrage, kein dauerhafter Rückfall ohne Zeitgrenze.
- *M4, die Warteschlange von `render()`* ist reine Logik in `src/app/render-queue.js` (`makeRenderQueue(renderOnce)`), mit Tests in Node. Mit `return lastRender` statt `return newest()` wird der Export-Test rot, ohne die Prüfung vor dem Zug die zwei anderen.
- *N1:* `messageerror` gilt wie `error`. *N2:* Der Kommentar zum Weg ohne Worker sagt jetzt, dass eine Aufgabe mit Promise (bpmn.io im Assistenten) nicht abgewartet wird und ein Abbruch sie nicht mehr erreicht; kein Umbau. *N3:* zwei veraltete Verweise auf `layoutBpmn()`. *N4:* Der Assistent zeichnet A2 ohne Schleife über Varianten, sodass keine zweite still A2s Bild bekäme.
- *N5:* Der Absatz mit `role="status"` kommt leer in die Seite, sein Text einen Frame später, damit die Live-Region eine Änderung ansagen kann. Geprüft ist die Reihenfolge (Node und Fall 15); mit einem Screenreader ist es nicht geprüft, auf dieser Maschine gibt es keinen.
- *N6, der Start-Handshake.* Der Worker meldet nach dem Laden `{ ready: true }`, auch der bpmn.io-Worker des Assistenten. Ohne Meldung binnen `LAYOUT_START_LIMIT` = 5 s (der Start dauerte 31 bis 45 ms; 5 s lassen das Hundertfache und ersparen einer Seite, deren Worker nie startet, die 120 s) gilt er als nicht gestartet, nach der Regel von M3: dauerhaft synchron, wenn die Seite noch nie von einem Worker gehört hat, sonst die Warnung „Das Layout im Hintergrund ist nicht innerhalb von 5 s gestartet.“ für diese Anfrage. Die Frist ist als `startLimit` einsetzbar.

Gleich geblieben: die Bilder (`npm run fixtures`, 57 ohne Abweichung), die vier Layout-Module, das Leserbündel der Exporte (33 955 Zeichen), Bens Entscheidungen. Größen: `dist/dokufix.html` 536 167 → 536 828 B (Block des Workers 98 043 → 98 072 Zeichen, die Meldung „ready“), `dist/bpmn-assistant.html` 614 232 → 615 601 B. Prüfungen: `npm test` 1 119 grün, `npm run check`, `npm run build`, `npm run assistant` grün, `tests/durchlaeufe.mjs --browser chromium` 486 von 486 grün. Firefox und `tests/vergleich.mjs` sind weiter nicht gelaufen.

**Offen:**

- Firefox: die Tabelle in Abschnitt 2 (klassischer Worker aus einer Blob-URL unter `file://`), die Laufzeit von hund3 und die Durchläufe 15 und 16, sobald ein Firefox da ist; Safari ebenso.
- `tests/vergleich.mjs --strict` gegen den Stand vor dem Worker (`745b24b`), in Chromium und Firefox: Bilder und Exporte sollten gleich sein, weil der Worker dasselbe XML liefert und die Exporte auf den Render warten.
- Schritt 6, Weg (b) ohne Dopplung, wenn die 98 KB je `Mit Editor`-Datei zu viel werden.
- Schritt 7, der Zwischenspeicher (Ben: nicht jetzt).
- Ein Knopf „Abbrechen“ im Hinweis: heute bricht nur ein neuer Render ab oder die Zeitgrenze.

