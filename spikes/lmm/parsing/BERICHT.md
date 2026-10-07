# XML lesen im BPMN-Layout-Paket: Bestandsaufnahme, Messung, Prototyp, Empfehlung

Spike vom 7. Oktober 2026 zur Frage, wie das künftige Paket (Analyse, Abschnitt 4a) sein XML so liest, dass gleiches XML in jeder Umgebung dasselbe Modell und damit dasselbe Layout ergibt. Alles hier liegt in `spikes/lmm/parsing/`; `src/`, `tests/`, `docs/` und `dist/` sind unverändert, die Abhängigkeiten des Repositorys auch. Fremde Pakete liegen entpackt außerhalb des Repositorys (Abschnitt 8).

## Ergebnis in Kürze

- **`readProcess()` braucht wenig vom Dokument:** `documentElement`, je Element `localName` (bzw. `nodeName`), `getAttribute()`, `children`, `parentElement` und `textContent`; der Einstieg dazu `getElementsByTagName('parsererror')`. Berührt sind davon die Teile von XML 1.0, die Text in Attributen und Elementen bestimmen: Entitäten und Zeichenreferenzen, Normalisierung von Attributwerten, Zeilenenden, CDATA, Kommentare, PIs, DOCTYPE, und von Namespaces in XML die Präfixe.
- **Gemessen** (157 Fälle: 57 Fixtures, 14 Blöcke aus `tests/referenz.md`, 15 aus `src/demo.md`, 71 heikle Fälle im Korpus) weichen von Chromiums `DOMParser` ab: linkedom in 37 Fällen (darunter 4 Fixtures und 3 Referenzblöcke, alle wegen `&amp;` in Attributen), saxen (der Parser von bpmn-js) in 22, txml in 20, fast-xml-parser in 14, @xmldom/xmldom in 8. **Firefox** (auch gemessen) weicht in genau 1 Fall ab (`<?xml version="1.1"?>`). Bun liefert für jede Bibliothek dasselbe wie Node. Safari/WebKit ließ sich nicht starten (Abschnitt 3.4).
- **Prototyp `leser.mjs`** (469 Zeilen, 12,4 KB minifiziert, 4,8 KB gzip, keine Abhängigkeit) liest alle 157 Fälle wie Chromium, bis auf einen, in dem er absichtlich strenger ist (ein Verweis auf eine externe Entität ist ein Fehler, Chromium und Firefox lassen ihn still verschwinden). Unter Node und Bun identisch. Er macht die `&amp;`-Eigenheit von `readModel()` überflüssig: alle 57 Fixtures ergeben ohne die Ersetzung dasselbe Modell wie Chromium.
- **Empfehlung: Weg (b), der eigene Leser.** Einstieg `layout(xml, options)` mit einem String, ohne Parser-Option. `readProcess()` bekommt mit dem eigenen Leser Namensräume und sollte sie nutzen (bpmn-js tut es); der Text einer Anmerkung sollte so gelesen werden, wie bpmn-moddle ihn liest (Abschnitt 6).

## 1. Bestandsaufnahme: Was `readProcess()` vom Dokument braucht

`src/app/bpmn-layout.js`, Z. 77–105 und 165–387. Die Hilfsfunktionen und was sie vom DOM verlangen:

| Hilfe | Nutzt | Was sie braucht | XML-Standard dahinter |
|---|---|---|---|
| `local(el)` | `el.localName \|\| el.nodeName`, Präfix per Regex abgeschnitten | den Elementnamen; weil linkedom `bpmn:laneSet` als `localName` meldet, wird jedes Präfix abgeschnitten und **nie über den Namensraum** gesucht | Namespaces in XML 1.0 §3 (QName, Präfix, lokaler Teil) |
| `kids(el)` | `el.children` | die Kindelemente in Dokumentreihenfolge, ohne Text, Kommentare, PIs | §3 Elemente, §2.5 Kommentare, §2.6 PIs |
| `descendants(el)` | rekursiv über `children` | alle Nachkommen in Dokumentreihenfolge | – |
| `attr(el, name)` | `el.getAttribute(name)`, `null` → `''` | den Attributwert **nach** Entitätsauflösung und Normalisierung; die Namen sind unpräfixiert (`id`, `name`, `sourceRef`, …) | §3.3.3 Normalisierung von Attributwerten, §4.1 Zeichen- und Entitätsverweise, §4.6 vordefinierte Entitäten |
| `clean(text)` | `String.replace(/\s+/g, ' ').trim()` | macht jede Folge von Leerraum zu einem Leerzeichen; verwischt damit die Unterschiede in Attributen (Zeilenumbruch, Tabulator, `\r`) | – |
| `noteText(el)` | `textContent` des `<text>`-Kindes, **wörtlich** | alle Textknoten und CDATA-Abschnitte des Elements und seiner Nachkommen verkettet, Kommentare und PIs nicht; Zeilenenden normalisiert | §2.11 Zeilenenden, §2.7 CDATA, §4.4 Entitäten im Inhalt |
| `refsOf(el)` | `k.textContent.trim()` je `flowNodeRef` | den Inhalt eines Elements, Leerraum abgeschnitten | – |
| `readProcess(doc)` | `doc.documentElement`, `participants[0].parentElement` | das Wurzelelement; den Elternknoten eines Elements | §2.1 (genau ein Wurzelelement) |
| Einstieg (`layoutBpmn()`, Assistent) | `doc.getElementsByTagName('parsererror')` | die Fehlererkennung des Browsers: Chromium (libxml2) und Safari setzen ein `<parsererror>` in das Dokument, Firefox (expat) macht es zum Wurzelelement in einem eigenen Namensraum | kein Standard für die Form: der HTML Standard (`DOMParser.parseFromString`) verlangt bei einem Fehler nur ein Dokument mit einem `parsererror`-Element, Namensraum Mozilla, und überlässt den Rest dem Browser |

Nicht gebraucht: `nodeType`, `childNodes`, `attributes`, `querySelector`, `namespaceURI`, `ownerDocument`, Serialisierung. Das ist eine Schnittstelle von sieben Eigenschaften und Methoden.

**Teile des Standards, die hineinspielen,** und wo es heute hakt:

- **Entitäten und Zeichenreferenzen** (§4.1, §4.4, §4.6): `name="A &amp; B"` muss `A & B` ergeben. linkedom liefert in Attributen `A &amp; B` (in Textknoten löst es auf). Daran hängt `readModel()` in `tests/bpmn-fixtures.mjs`. Zeichen jenseits der BMP (`&#128512;`) brauchen `fromCodePoint`; saxen nimmt `fromCharCode` und liefert Müll.
- **Normalisierung von Attributwerten** (§3.3.3): ein wörtlicher Zeilenumbruch oder Tabulator im Attribut wird ein Leerzeichen, `&#10;` bleibt ein Zeilenumbruch. `clean()` macht für Namen daraus dasselbe; für `id`, `sourceRef`, `targetRef`, `attachedToRef`, `processRef` nicht (dort wird nicht gesäubert). bpmn-moddle normalisiert nicht.
- **Zeilenenden** (§2.11): `\r\n` und `\r` werden `\n`, auch in CDATA. Der Text einer Anmerkung geht wörtlich in `noteSize()`; ein `\r` darin ist eine andere Zeichenkette, also ein anderer Schlüssel in den gemessenen Größen und eine andere Schätzung. linkedom, saxen, txml normalisieren nicht.
- **Namensräume**: der Browser liefert `localName` ohne Präfix, linkedom mit. Deshalb vergleicht `local()` abgeschnittene Namen und ein `signavio:task` oder ein `bpmn:` an einem fremden Namensraum gilt als BPMN (Korpus `fremde-elemente`, `praefix-falscher-namensraum`); bpmn-js weist beides ab.
- **Wohlgeformtheit**: der Browser weist kaputtes XML ab (`parsererror`), linkedom und saxen reparieren still. Welche Fehler ein Paket meldet, entscheidet heute die Umgebung.
- **BOM, Kodierung, Deklaration**: die Eingabe ist ein JS-String, die Kodierungsangabe hat keine Wirkung (alle Umgebungen gleich). Ein BOM muss übergangen werden (xmldom scheitert daran).

**`appendDiagram()` und die Textarbeit** (`relane()`, `insertCollaboration()`, Z. 3033–3145) arbeiten auf dem Originaltext, nicht auf dem Baum. Ihre Annahmen, geprüft im Durchlauf (Abschnitt 5.4):

| Annahme | Passt zum Parser? |
|---|---|
| Kommentare und CDATA werden vorher ausgeblendet (`<!--…-->`, `<![CDATA[…]]>` durch Leerzeichen ersetzt): ein `</bpmn:definitions>` oder ein `id="…"` darin zählt nicht | Ja. Korpus `kommentare`, `cdata-mit-close-tag`: das Diagramm landet vor dem echten schließenden Tag, die IDs im Kommentar stören nicht. Verarbeitungsanweisungen werden nicht ausgeblendet; ein `</bpmn:definitions>` in einer PI wäre eine Lücke, kommt aber in BPMN nicht vor |
| IDs: `fresh()` prüft gegen jedes `id="…"`/`id='…'` im Text (`\sid\s*=\s*…`), auch `id = "x"` | Ja. Die IDs sind im Text so geschrieben wie im Baum, solange sie keine Entitäten enthalten; `relane()` vergleicht `x.id === esc(n.id)` und schreibt `esc()`, also kommt `Task&amp;1` richtig an (Korpus `entitaet-in-flowNodeRef`) |
| Das schließende Tag ist `</(präfix:)?definitions\s*>` und das letzte seiner Art im Text | Ja, auch `</bpmn:definitions >` (Korpus `kaputt-close-tag-mit-leerraum`, zulässig nach §3.1) |
| Einfügen vor dem schließenden Tag, Zeilen mit `\n` | Ja; in einer `\r\n`-Datei entstehen gemischte Zeilenenden (Korpus `attribut-crlf`: 26 `\r\n`, 15 `\n`). Jeder XML-Parser normalisiert das weg, für `git diff` ist es unschön |
| BOM | Bleibt vorn stehen, weil nur eingefügt wird; harmlos |
| `relane()` liest Tags mit einem Regex, der Anführungszeichen beachtet (`"[^"]*"\|'[^']*'`) | Ja: `>` und `'` in Attributwerten (Korpus `attribut-anfuehrungszeichen`), Attribute über mehrere Zeilen (`attribut-mehrzeilig`), Tabulatoren (`leerraum-im-starttag`) gehen |
| `flowNodeRef`-Inhalt wird mit `\s*` um den Text gelesen | Ja (Korpus `flowNodeRef-leerraum`) |

Keine dieser Annahmen hängt am Parser. Was der Text braucht, ist nur: das XML, das der Parser angenommen hat, ist wohlgeformt, dann stimmen Tags und Anführungszeichen. Ein Parser, der kaputtes XML repariert (linkedom, saxen), bricht diese Voraussetzung: `appendDiagram()` fügt dann in einen Text ein, der kein XML ist.

## 2. Der Messaufbau

`lesen.mjs` ist der eine Weg vom String zum Ergebnis, in jeder Umgebung derselbe: `parse(xml)` (die Umgebung), dann `parsererror` prüfen wie `layoutBpmn()`, dann `readProcess()`. Ergebnis: `status` (ok, null = kein `definitions`, parsererror, error = `readProcess()` wirft) und bei ok das Modell und `leftOut` als JSON. Zwei Ergebnisse sind gleich, wenn Status und JSON gleich sind; zwei verschiedene Fehlermeldungen zählen als gleich.

Umgebungen (`umgebungen/`): Chromium 141 und Firefox 155 (je `new DOMParser().parseFromString(xml, 'application/xml')` in einer Seite, gestartet mit playwright-core 1.63.0 aus `node_modules`), linkedom 0.18.13 aus `node_modules`, und entpackt außerhalb des Repositorys @xmldom/xmldom 0.9.12, saxen 11.2.0, txml 6.0.3, fast-xml-parser 5.11.2 (Abschnitt 8); dazu der Prototyp. Die Bibliotheken ohne DOM (saxen, txml, fast-xml-parser) bekommen einen kleinen Baum (`umgebungen/minidom.mjs`) mit genau der Schnittstelle aus Abschnitt 1. Jede Bibliothek lief unter Node 22.22.0 und Bun 1.4.2. Deno ist nicht installiert.

Fälle (`faelle.mjs`): die 57 Fixtures aus `tests/fixtures/bpmn-layout/`, die 14 ` ```bpmn `-Blöcke aus `tests/referenz.md`, die 15 aus `src/demo.md`, und 71 Fälle im Korpus (`korpus/`, erzeugt von `korpus-erzeugen.mjs`, beschrieben in `korpus/INDEX.md`): Entitäten und Zeichenreferenzen in Attribut und Text, Normalisierung, `\r\n`, `\r`, BOM, Kodierungsangaben, XML 1.1, CDATA, Kommentare, PIs, DOCTYPE mit internen, externen und verschachtelten Entitäten (Billion Laughs), Präfixe (`bpmn:`, `bpmn2:`, ohne, gemischt, falscher Namensraum, nicht deklariert), Leerraum in `<text>`, 22 Fälle, die ein konformer Parser abweist (14 Dateien `kaputt-*`, undefinierte und falsche Entitäten, `--` im Kommentar, nicht deklariertes Präfix, Deklaration nach Leerraum, externe Entität im Attribut, Billion Laughs), IDs mit Sonderzeichen, doppelte IDs, und eine Kette aus 5000 Aufgaben (700 KB).

`messen.mjs` schreibt `ergebnisse/ergebnisse.json`, `tabelle.mjs` vergleicht gegen Chromium und schreibt `ergebnisse/tabelle.md` (Übersicht, Fall × Umgebung mit Art jeder Abweichung, Laufzeiten).

## 3. Unterschiede zwischen den Umgebungen

### 3.1 Übersicht (gemessen)

Referenz Chromium 141 (DOMParser, libxml2). Abweichend = Status oder Modell anders.

| Umgebung | Fixtures (57) | referenz.md (14) | demo.md (15) | Korpus (71) | gesamt |
|---|---|---|---|---|---|
| Firefox 155 (DOMParser, expat) | gleich | gleich | gleich | 1 | 1 |
| Prototyp `leser.mjs` (Node, Bun) | gleich | gleich | gleich | 1 | 1 |
| @xmldom/xmldom 0.9.12 | gleich | gleich | gleich | 8 | 8 |
| fast-xml-parser 5.11.2 | gleich | gleich | gleich | 14 | 14 |
| txml 6.0.3 | gleich | 1 | gleich | 19 | 20 |
| saxen 11.2.0 (bpmn-js) | gleich | gleich | gleich | 22 | 22 |
| linkedom 0.18.13 (die Tests heute) | **4** | **3** | gleich | 30 | 37 |

Unter Bun ist jede Bibliothek in jedem Fall gleich mit sich selbst unter Node (Status, Modell, `leftOut`): die Laufzeit spielt keine Rolle, nur die Bibliothek. 113 der 157 Fälle lesen alle Umgebungen gleich, darunter 53 Fixtures, 11 Referenz- und alle 15 Demo-Blöcke.

### 3.2 Die Arten der Abweichung je Umgebung

Vollständig je Fall in `ergebnisse/tabelle.md`. Hier gebündelt nach Art, mit dem Korpusfall als Beleg.

**linkedom** (37):
- `&amp;`, `&lt;`, `&gt;` in **Attributen** bleiben wörtlich (`"Mahnung &amp; Gebühr"`); in Textknoten löst es auf. Betrifft die Fixtures `hund`, `ref8`, `hund2`, `notiz-hund2` und die Referenzblöcke Z. 746 und 1108, dazu `entitaeten-name`, `attribut-anfuehrungszeichen` (`A&gt;B`), `gross-5000`, `entitaet-in-flowNodeRef` (das Attribut `id="Task&amp;1"` bleibt `Task&amp;1`, der `flowNodeRef`-Text wird `Task&1`: die Aufgabe steht in keiner Bahn, `readProcess()` wirft).
- Keine Normalisierung der Zeilenenden: `\r\n` und `\r` bleiben im Text der Anmerkung (`attribut-crlf`, `zeilenenden-cr`).
- Entitäten aus dem DOCTYPE werden nicht aufgelöst (`&amp;firma;`), externe Entitäten und Billion Laughs stören nicht (sie werden nicht angefasst).
- **Kein einziger Parserfehler**: alle 22 Fälle, die Chromium abweist, werden still gelesen oder repariert (Tag nicht geschlossen, falsch verschachtelt, doppeltes Attribut, Attribut ohne Anführungszeichen, nacktes `<`, zwei Wurzeln, offene Wurzel, Text nach der Wurzel, Steuerzeichen, Tagname mit Ziffer, `--` im Kommentar, undefinierte Entitäten `&nbsp;`, `&AMP;`, Referenz ohne Semikolon, ungültige Zeichenreferenz, nicht deklariertes Präfix, Deklaration nach Leerraum, externe Entität, Billion Laughs). Leere Eingabe ergibt `null` statt eines Fehlers.
- `localName` mit Präfix, `namespaceURI` ist immer XHTML.

**saxen** (22), der Parser hinter bpmn-moddle und damit bpmn-js:
- Keine Normalisierung der Zeilenenden (`attribut-crlf`, `zeilenenden-cr`).
- `id = "Task_3"` (Leerraum um `=`) wird **nicht gelesen**; das Element verliert alle Attribute (`attribut-id-mit-leerraum`). bpmn-moddle meldet dann „unparsable content“ und bpmn-js zeichnet das Element nicht.
- Zeichenreferenzen jenseits der BMP liefern Müll (`fromCharCode`; `entitaeten-name`, `entitaeten-text`: 😀 fehlt).
- DOCTYPE-Entitäten bleiben wörtlich (`&firma;`); `&AMP;` wird aufgelöst (in XML nicht definiert), `&nbsp;` bleibt stehen.
- Still bei: doppeltem Attribut, Attribut ohne Anführungszeichen, Steuerzeichen, Tagname mit Ziffer, Text nach der Wurzel, zwei Wurzeln (es liest die zweite), `--` im Kommentar, nicht deklariertem Präfix (ohne `ns()`), Deklaration nach Leerraum.

**txml** (20): wie saxen ohne Zeilenende-Normalisierung und ohne DOCTYPE-Entitäten, still bei denselben kaputten Dateien und zusätzlich bei einer offenen Wurzel; `referenz.md` Z. 1074 (`<bpmn:definitions>kein BPMN`) wird gelesen statt abgewiesen.

**fast-xml-parser** (14): löst **numerische Zeichenreferenzen nicht auf** (`&#10;`, `&#x41;` bleiben wörtlich, in Attribut und Text: `entitaeten-name`, `entitaeten-text`, `zeichenreferenz-cr`); DOCTYPE-Entitäten nur, wenn ihr Wert keine Referenz enthält (`&stern;` bleibt); externe Entitäten sind ein Fehler (gut); still bei Steuerzeichen, Tagname mit Ziffer, zwei Wurzeln, `--` im Kommentar, nicht deklariertem Präfix, `&AMP;`, `&nbsp;`.

**@xmldom/xmldom** (8): **weist ein BOM ab** (mit und ohne Deklaration), weist DOCTYPE-Entitäten ab („entity not found“), nimmt ungültige Zeichenreferenzen (`&#0;`) und Steuerzeichen an, macht aus U+2028 ein `\n` (das ist XML 1.1 §2.11, nicht 1.0), liest ein Attribut ohne Anführungszeichen.

**Firefox 155** (1): `<?xml version="1.1"?>` ist ein Fehler („XML declaration not well-formed“), Chromium liest es. Sonst in allen 156 Fällen gleich mit Chromium, auch: ein Verweis auf eine externe Entität im Inhalt verschwindet still (`"Inhalt: "`), im Attribut ist er ein Fehler; interne DOCTYPE-Entitäten werden aufgelöst; Billion Laughs ist ein Fehler; `&nbsp;`, `&AMP;` sind Fehler.

**Chromium 141** als Referenz, bemerkenswert: löst interne DOCTYPE-Entitäten auf (`ACME GmbH prüfen`); Billion Laughs: „Maximum entity amplification factor exceeded“ nach 13 ms; externe Entität im Attribut: Fehler, im Inhalt: still leer; XML 1.1: gelesen; `]]>` im Text, `--` im Kommentar, doppeltes Attribut, Steuerzeichen, undefinierte Entität, nicht deklariertes Präfix, Text nach der Wurzel: alles Fehler. Ein `<parsererror>` kommt als Element in das Dokument, `getElementsByTagName('parsererror')` findet es.

### 3.3 Was bpmn-js liest (gemessen mit bpmn-moddle)

`bpmnjs-liest.mjs` liest jeden Fall mit bpmn-moddle 10.3.1 (die Version, die bpmn-js 18.31.0 bindet; dazu moddle-xml 12.3.1, moddle 7.2.0, saxen 11.2.0, min-dash 5.1.0) und vergleicht die rohen Werte `name`, `text` (Anmerkung) und `flowNodeRef` mit dem Prototyp. Ergebnis `ergebnisse/bpmnjs-liest.md`: 123 gleich, 15 abweichend, 19 Fälle lehnt nur einer ab. Die Abweichungen, die das Layout betreffen:

| Fall | bpmn-moddle liest | Folge für Layout und Bild |
|---|---|---|
| `cdata-mit-leerraum`, `text-nur-leerraum` | **wirft Textknoten weg, die nur aus Leerraum bestehen** (`handleText`: `if (!text.trim()) return`): `<text>\n  <![CDATA[x]]>\n</text>` ist `x`, nicht `\n  x\n` | `noteText()` liefert mit jedem DOM den Leerraum mit. Die Notiz wird für einen dreizeiligen Text bemessen, bpmn-js zeichnet eine Zeile. **`readProcess()` sollte hier bpmn-moddle folgen** (Abschnitt 6) |
| `attribut-zeilenumbruch`, `attribut-mehrzeilig`, `attribut-crlf` | keine Normalisierung: `name="Zeile 1\nZeile 2"` behält `\n`; bpmn-js zeichnet zwei Zeilen | `clean()` macht eine Zeile daraus, die Beschriftung wird einzeilig geschätzt. Dasselbe gilt für `&#10;` im Namen, das jeder Parser als `\n` liefert: ein bestehender Unterschied im Modell, kein Parserthema |
| `attribut-id-mit-leerraum` | `id = "x"`: Element ohne Attribute, „unparsable content“, nicht gezeichnet | das Layout ordnet eine Aufgabe an, die bpmn-js nicht zeichnet |
| `ids-sonderzeichen`, `entitaet-in-flowNodeRef` | IDs mit Umlaut, Punkt oder `&` weist moddle ab (ungültige ID, „unparsable content“) | wie oben. Eine Prüfung der IDs auf NCName im Paket würde das vorher melden |
| `ids-doppelt` | behält das erste Element mit der ID, wirft das zweite weg | `readProcess()` liest beide |
| `flowNodeRef-leerraum` | trimmt nicht: der Verweis bleibt unaufgelöst | `readProcess()` trimmt, legt die Bahn fest; bpmn-js zeichnet die Form nach BPMN-DI ohnehin an der Stelle, kein Bildfehler |
| `doctype-intern` | `&firma;` wörtlich, Warnung „unparsable content ]>“ | Browser und Prototyp lösen auf. Praktisch kommt ein DOCTYPE in BPMN nicht vor |
| `entitaeten-name`, `entitaeten-text` | Emoji per Zeichenreferenz fehlt (saxen) | nur die Referenzform, ein wörtliches 😀 ist in Ordnung |
| `zeilenenden-cr`, `attribut-crlf` | `\r` bleibt im Text | diagram-js trennt Zeilen an `\n`; ein `\r` am Zeilenende ist unsichtbar. Für die Größe egal, für den Schlüssel in `sizes.json` nicht |
| `fremde-elemente`, `praefix-falscher-namensraum` | `signavio:task` wird übergangen; ein `bpmn:` am falschen Namensraum: „failed to parse document as <bpmn:Definitions>“ | `readProcess()` liest nach lokalem Namen und nimmt beides. Mit Namensräumen im Leser lässt sich das wie bpmn-js entscheiden |
| `text-mit-kindelement` | TypeError in moddle-xml | bpmn-js kann das XML nicht öffnen; das Layout läse es |
| `kodierung-latin1`, `kodierung-utf16` | Warnung, liest als UTF-8 | gleich |

Auf den 57 Fixtures und den 29 Blöcken liest bpmn-moddle dieselben Werte wie der Prototyp.

### 3.4 Was nicht gemessen ist

- **Safari / WebKit:** Playwright hat WebKit 2359 geladen (ins Scratchpad, nicht ins Repository), aber der Start scheitert an fehlenden Systembibliotheken (libgtk-4, libgraphene, libevent, GStreamer, libavif, libwayland, libmanette). Aus der Dokumentation: WebKits `DOMParser` nutzt wie Chromium **libxml2** (WebCore `XMLDocumentParserLibxml2`), mit `XML_PARSE_NOENT` aus und ohne Laden externer Entitäten; die Fehlermeldungen sind dieselben libxml2-Meldungen, ein `<parsererror>` wird ins Dokument gesetzt. Es ist zu erwarten, dass Safari sich in diesem Korpus wie Chromium verhält, auch bei XML 1.1 und bei der Aufblähgrenze (libxml2 ≥ 2.11, `xmlCtxtSetMaxAmplification`); ältere Safari-Versionen mit älterem libxml2 hatten diese Grenze nicht, sondern nur die feste Billion-Laughs-Erkennung. Das ist **nicht gemessen**.
- **Firefox** ist gemessen (Playwright-Build 1543 = Firefox 155). Aus der Dokumentation dazu: expat lehnt `version="1.1"` ab und hat seit 2.4.1 eine eigene Aufblähgrenze (Faktor 100 ab 8 MiB); beides passt zum Messwert.
- **Deno:** nicht installiert. Deno hat wie Node keinen `DOMParser`; eine Bibliothek verhält sich dort wie unter Node und Bun, soweit sie keine Node-APIs braucht (der Prototyp braucht keine).

## 4. Die Lösungswege

| Kriterium | (a) Parser von außen, Ergebnis normalisieren (Adapter) | (b) eigener minimaler XML-Leser im Paket | (c) kleine gepinnte Abhängigkeit (saxen) |
|---|---|---|---|
| Gleichheit über Umgebungen | Nein. Ein Adapter kann Präfixe abschneiden und `\r` ersetzen, aber nicht nachholen, was der Parser verloren hat (linkedoms `&amp;` in Attributen: der Adapter müsste raten, ob `&amp;` vom Autor doppelt kodiert war), und nicht entscheiden, was der Parser still repariert hat. Der Browser-Parser bleibt der Maßstab, Node bleibt anders | **Ja, gemessen:** 156 von 157 Fällen wie Chromium, die Abweichung ist gewollt; Node = Bun; Firefox weicht nur bei XML 1.1 ab | Nur gegen sich selbst: saxen liest in 22 Fällen anders als der Browser (Zeilenenden, `id = "x"`, Emoji, DOCTYPE, kaputtes XML). Man müsste darum einen Normalisierer bauen, der fast so groß ist wie (b) |
| Korrektheit gegenüber XML 1.0 und BPMN | Die des jeweiligen Parsers; linkedom ist kein XML-Parser (HTML-nah, keine Fehler) | Soweit BPMN es braucht: Zeichen, Namen, Attribute, Referenzen, CDATA, Kommentare, PIs, DOCTYPE mit internen Entitäten, Namensräume, Wohlgeformtheit. Nicht: ATTLIST-Vorgaben, Parameter-Entitäten, Markup in Entitäten, externe DTDs (alles Fehler oder übergangen, dokumentiert) | saxen ist bewusst tolerant („forgiving“), kein konformer Parser: keine Normalisierung, keine Wohlgeformtheitsprüfung |
| Größe | 0 im Paket, aber die Doku muss erklären, welcher Parser taugt | 12,4 KB minifiziert, 4,8 KB gzip (`esbuild --minify`); `bpmn-layout.js` hat 3145 Zeilen, der Leser 469 | saxen 6,9 KB minifiziert plus eigener Baum und Normalisierung (≈ `umgebungen/saxen.mjs` + `minidom.mjs`, 3 KB) ≈ 10 KB, mit Abhängigkeit |
| Wartung | Jede Umgebung ist ein Sonderfall, jeder Bericht „bei mir anders“ landet beim Paket | Eine Datei, ein Korpus, ein Differenztest; XML 1.0 ändert sich nicht | Versionen pinnen, saxen-Änderungen verfolgen (11.x hat die Namensraumlogik umgebaut) |
| Lizenz zu LGPL-3.0 | – | Eigener Code unter LGPL | saxen MIT: verträglich, Hinweis muss mit |
| Fehlermeldungen bei kaputtem XML | Die des Parsers: Chromium gut, Firefox gut, linkedom keine | Zeile, Spalte und libxml2-nahe Meldung („Opening and ending tag mismatch: bpmn:task line 22 and bpmn:process“), in jeder Umgebung gleich | saxen meldet einige Fehler (Tagpaar, Schließtag), viele nicht (Abschnitt 3.2) |
| Geschwindigkeit (Node, ein Lauf, Abschnitt 3.1 in `tabelle.md`) | linkedom 37 ms Parsen für die 57 Fixtures, 100 ms für 5000 Aufgaben | **14,5 ms / 48 ms**; Chromium im Browser 10 / 35 ms | saxen 23 / 47 ms (mit Baum), txml 17 / 56 |
| Sicherheit | Die des Parsers: Browser begrenzen Entitäten und laden nichts; linkedom löst nichts auf; xmldom begrenzt | Keine externen Entitäten (Verweis ist ein Fehler), Aufblähgrenze wie libxml2 (Faktor 5 ab 1 MB), Schleifenerkennung, Tiefe 40; kein `eval`, kein Netz, kein DOM; Stapel statt Rekursion über die Tiefe | saxen löst keine DTD-Entitäten auf (sicher), Billion Laughs harmlos |
| Verhalten gegenüber bpmn-js | wie der Browser | wie der Browser; die Abweichungen von bpmn-moddle (Abschnitt 3.3) sind in beiden Fällen dieselben und werden in `readProcess()` behandelt, nicht im Parser | **Nicht** „wie bpmn-js“: bpmn-moddles Verhalten kommt zur Hälfte aus moddle-xml (Leerraum-Textknoten, ID-Prüfung, Namensräume), nicht aus saxen. Mit saxen allein liest man zwar `\r` wie bpmn-js, aber `name="…"` mit Zeilenumbruch auch, und das will das Layout nicht |

**Was gegen (a) spricht,** über die Tabelle hinaus: Der Einstieg mit `globalThis.DOMParser` als Vorgabe (Analyse 4a) bedeutet, dass die Tests des Pakets unter Node einen anderen Parser nehmen als die Nutzer im Browser. Genau das ist heute der Zustand, und die `&amp;`-Eigenheit ist sein Preis: die Fixtures speichern Modelle, die der Browser nie erzeugt.

**Was gegen (c) spricht:** saxen ist das Fundament von bpmn-js, aber bpmn-js' Lesart entsteht erst in moddle-xml. Wer saxen nimmt, bekommt weder den Browser noch bpmn-js, sondern ein drittes Verhalten, und eine Abhängigkeit dazu.

## 5. Der Prototyp und der Differenztest

### 5.1 `leser.mjs`

`parseXml(text) → XmlDocument`, wirft `XmlError { message, line, column, offset }`. Das Dokument bietet `documentElement`, `getElementsByTagName()`; jedes Element `nodeName` (`bpmn:task`), `localName` (`task`), `prefix`, `namespaceURI`, `attributes` (mit Präfix, lokalem Namen, Namensraum), `getAttribute()`, `getAttributeNS()`, `hasAttribute()`, `children`, `childNodes`, `parentElement`, `textContent`. Kommentare und PIs kommen nicht in den Baum. `readProcess()` läuft darauf **unverändert**.

Was er tut, steht im Dateikopf. Entscheidungen, die über den Standard hinaus zu treffen waren, und warum so:

| Frage | Chromium | Firefox | Prototyp | Begründung |
|---|---|---|---|---|
| `<?xml version="1.1"?>` | liest | Fehler | liest (als 1.0) | XML 1.0 §2.8 erlaubt beides; XML 1.1 unterscheidet sich nur in exotischen Zeichen und Zeilenenden, die in BPMN nicht vorkommen. Ein BPMN-Werkzeug, das 1.1 schreibt, soll nicht am Layout scheitern. Die Mehrheit der gemessenen Browser (Chromium, nach Dokumentation auch Safari) liest es |
| Verweis auf eine externe Entität im Inhalt | still leer | still leer | **Fehler** | Der Autor wollte einen Text, der nicht da ist; still leer heißt eine Notiz mit anderem Text als gedacht, und bpmn-js zeigt `&geheim;`. Ein Fehler sagt, was fehlt. Das ist die eine bewusste Abweichung vom Browser; sie betrifft nur Dateien mit DOCTYPE und SYSTEM-Entität, die es in BPMN nicht gibt |
| Verweis auf eine externe Entität im Attribut | Fehler | Fehler | Fehler | gleich |
| Interne DOCTYPE-Entitäten | aufgelöst | aufgelöst | aufgelöst | Standard; bpmn-js lässt sie wörtlich (Abschnitt 3.3). Das Paket könnte warnen, wenn ein DOCTYPE Entitäten deklariert, dann weiß der Aufrufer, dass bpmn-js anders zeichnet |
| Billion Laughs | Fehler (Aufblähung) | Fehler | Fehler ab Faktor 5 über 1 MB | wie libxml2 |
| `bpmn:1task` | Fehler (kein QName) | Fehler | Fehler | Namespaces in XML §3: beide Teile sind NCNames; ein XML-Name allein erlaubt das, deshalb hatte die erste Fassung des Prototyps es gelesen (im Differenztest aufgefallen und behoben) |
| `parsererror` | Element im Dokument | Wurzelelement im Mozilla-Namensraum | Ausnahme mit Zeile und Spalte | Ein Paket wirft; der Aufrufer braucht nicht zu suchen. `lesen.mjs` zeigt, wie der Einstieg beide Browserformen erkennt, falls ein Parser von außen je wieder erlaubt wird |
| ATTLIST-Vorgaben im internen DTD-Teil | angewandt | angewandt | übergangen | Ein `<!ATTLIST bpmn:task name CDATA "x">` gäbe im Browser jedem Task einen Namen. Nicht gebaut, nicht gemessen, dokumentiert; im Korpus kein Fall |
| Parameter-Entitäten, Markup im Ersatztext | verarbeitet | verarbeitet | Fehler „not supported“ | bewusst klein; ein klarer Fehler statt halber Unterstützung |

### 5.2 Differenztest gegen Chromium

`messen.mjs` + `tabelle.mjs`: Prototyp unter Node und Bun gegen Chromium in allen 157 Fällen gleich bis auf `korpus-doctype-extern-inhalt` (Abschnitt 5.1, gewollt). Darunter alle 57 Fixtures, alle 29 Blöcke, alle 22 Fälle, die Chromium abweist (gleicher Status; die Meldungen sind ähnlich, nicht gleich), BOM, `\r\n`, `\r`, CDATA, Kommentare, PIs, alle Präfixformen, alle Entitätsfälle, Billion Laughs, 5000 Aufgaben. Firefox weicht vom Prototyp in zwei Fällen ab (XML 1.1 und die externe Entität).

### 5.3 Die `&amp;`-Eigenheit von `readModel()`

`amp-eigenheit.mjs`, Ergebnis in `ergebnisse/amp-eigenheit.md`: 4 der 57 Fixtures enthalten `&amp;` (`hund`, `ref8`, `hund2`, `notiz-hund2`). Heute (linkedom nach Ersetzung) weicht das Modell dieser 4 von Chromium ab (`"Zitzen reinigen Euter massieren"` statt `"Zitzen reinigen & Euter massieren"`); mit dem Prototyp ohne Ersetzung sind alle 57 gleich mit Chromium. **Die Eigenheit wird überflüssig.** Beim Umstellen ändert sich das angeordnete XML von `ref8.measured.bpmn` (Form `G_Start`): die gemessenen Größen in `ref8.sizes.json` sind unter dem Schlüssel `"Mahnung Gebühr"` gespeichert, mit dem echten Namen `"Mahnung & Gebühr"` greift die Schätzung. Die drei anderen bleiben gleich. `npm run capture` einmal neu, dann `--write`.

### 5.4 Durchlauf bis `appendDiagram()`

`durchlauf.mjs`, Ergebnis in `ergebnisse/durchlauf.md`: für jeden Fall mit Modell (128; ohne `gross-5000`, dessen `layoutGeometry()` Minuten braucht) Prototyp → `readProcess()` → `kanonisch()` (`spikes/lmm/kanonisch`) → `layoutGeometry()` → `appendDiagram()`, ohne Browser, ohne Mermaid. Jedes Ergebnis ist wohlgeformt, Chromium liest **alle 128 Ergebnisse** zu demselben Modell wie der Prototyp, das Diagramm steht vor dem letzten schließenden `definitions`-Tag, die neuen IDs stoßen mit keiner des Autors zusammen (auch nicht in `cdata-mit-close-tag`, `kommentare`), BOM bleibt. Befunde: vier Blöcke aus `referenz.md`/`demo.md` bringen ein eigenes Diagramm mit und haben danach zwei (die App ordnet solche nicht an, `hasCoordinates()`); `attribut-crlf` bekommt gemischte Zeilenenden; `ids-doppelt` behält die doppelte ID des Autors.

## 6. Empfehlung

**Weg (b): der eigene Leser kommt ins Paket**, als Datei neben `bpmn-layout.js` und `lmm.js`, unter LGPL, ohne Option für einen fremden Parser.

**Schnittstelle:**

```
layout(xml: string, options?) → { xml, diagram, leftOut }
  options.measure   (text, width) → { width, height }   Messfunktion, sonst labelSize()
  options.rules     wie heute DEFAULT_RULES
wirft XmlError (Zeile, Spalte, Meldung) bei nicht wohlgeformtem XML,
wirft bei nichts Anordenbarem (LAYOUT_NOTHING) und bei Knoten ohne Bahn (wie heute),
gibt { xml, diagram: null, leftOut: [] } zurück, wenn das XML schon Positionen hat
   (hasCoordinates()) oder kein BPMN ist (readProcess() === null)
```

Kein `parser`-Parameter: die Gleichheit ist der Zweck des Pakets, eine Option dagegen wäre die Tür zurück zum heutigen Zustand. Wer ein Dokument hat, serialisiert es. `readProcess(doc)` bleibt als Funktion erhalten, aber als innere; wer sie exportiert, dokumentiert die sieben Eigenschaften aus Abschnitt 1.

**Was sich an `readProcess()` ändert:**

1. **Namensräume statt abgeschnittener Präfixe.** `local()` wird `el.namespaceURI === BPMN_NS ? el.localName : ''`; der Kommentar am Dateianfang über linkedom entfällt. Ein `signavio:task` ist dann kein Task, ein `bpmn:definitions` am falschen Namensraum ist kein BPMN (`null`, wie bpmn-js' Meldung). Attribute bleiben unpräfixiert.
2. **Text der Anmerkung wie bpmn-moddle:** `noteText()` verkettet die Text- und CDATA-Kinder des `<text>`-Elements und lässt die weg, die nur aus Leerraum bestehen (Abschnitt 3.3). Für `<text>\n  Erste Zeile\n  Zweite Zeile\n</text>` ändert sich nichts (ein Knoten, nicht nur Leerraum); für CDATA mit Leerraum drumherum wird die Notiz so bemessen, wie bpmn-js sie zeichnet. Ein Fixture mit so einem Fall fehlt noch.
3. **Optional, als Hinweise in `leftOut` oder einer neuen Liste `hints`:** IDs, die kein NCName sind (bpmn-js zeichnet das Element nicht), doppelte IDs (bpmn-js nimmt das erste), ein DOCTYPE mit Entitäten (bpmn-js löst nicht auf), `name` mit Zeilenumbruch (bpmn-js zeichnet mehrzeilig, die Schätzung ist einzeilig). Nichts davon ist ein Parserthema, alles ließe sich mit dem eigenen Leser erkennen.
4. `flowNodeRef`: trimmen bleibt (bpmn-js trimmt nicht, aber der Verweis wirkt nur auf die Bahn, die das Layout setzt).

**Tests, die fest ins Paket gehören:**

- Das Korpus (`korpus/` mit `INDEX.md`) als Fixtures des Lesers, mit erwartetem Status und Modell je Fall, aus den Chromium-Ergebnissen dieses Spikes eingefroren (`ergebnisse/ergebnisse.json`, Umgebung `chromium`): ein Test ohne Browser, der jede Änderung am Leser gegen den Browser-Stand hält.
- Der Differenztest gegen einen echten Browser (`messen.mjs --umgebungen chromium,firefox` + `tabelle.mjs`) als Entwicklungswerkzeug mit playwright-core, wie heute `capture-bpmn.mjs`; nicht in `npm test`.
- Ein kleiner Konformitätstest für den Leser selbst (Namen, Referenzen, Normalisierung, Fehlerpositionen), unabhängig von BPMN; die W3C XML Conformance Test Suite (`xmlconf`, ≈ 2000 Fälle, Lizenz W3C) wäre als Entwicklungswerkzeug denkbar, nicht als Teil des Pakets.
- `bpmnjs-liest.mjs` gegen die bpmn-moddle-Version, die dokufix nutzt, bei jedem Versionswechsel von bpmn-js.
- Die bestehenden 57 Fixtures, nach `capture` und `--write` ohne die `&amp;`-Ersetzung.

**Für dokufix bis dahin:** `readModel()` in `tests/bpmn-fixtures.mjs` kann den Prototyp statt linkedom nehmen, sobald der Leser in `src/app/` liegt; die Ersetzung entfällt, `ref8` wird neu erfasst.

## 7. Offene Punkte

- **XML 1.1 lesen oder abweisen?** Chromium liest, Firefox weist ab; der Prototyp liest. Eine Entscheidung für das Paket.
- **Externe Entität im Inhalt:** Fehler (Prototyp) oder still leer (beide Browser)? Der Bericht empfiehlt den Fehler.
- **DOCTYPE überhaupt zulassen?** Ein DOCTYPE in BPMN ist praktisch nicht vorhanden; ein Paket könnte ihn ganz abweisen und 60 Zeilen sparen. Dann weicht es von jedem Browser ab, der ihn liest.
- **ATTLIST-Vorgaben** sind nicht gebaut und nicht gemessen.
- **Safari** ist nur aus der Dokumentation beurteilt. Ein Lauf auf einem Mac mit `playwright webkit` oder ein Lauf dieses Korpus in Safari selbst wäre der Nachweis; `umgebungen/chromium.mjs` kann WebKit starten, sobald die Bibliotheken da sind.
- **Fehlermeldungen** des Lesers sind englisch und libxml2-nah; für die Oberfläche braucht die App Codes oder eine Übersetzung (Analyse 4a, „Vor der Veröffentlichung“).
- **Geschwindigkeit großer Dateien** liegt beim Layout, nicht beim Leser: 5000 Aufgaben parst der Leser in 48 ms, `layoutGeometry()` braucht dafür Minuten.
- Der Prototyp ist in einer Sitzung entstanden und gegen 157 Fälle geprüft, nicht gegen eine Konformitätssuite.

## 8. Dateien, Pakete, Herkunft der Aussagen

In `spikes/lmm/parsing/`:

| Datei | Was |
|---|---|
| `BERICHT.md` | dieser Bericht |
| `leser.mjs` | der Prototyp |
| `lesen.mjs` | der eine Weg String → Ergebnis, in Node, Bun und Browser derselbe |
| `faelle.mjs` | sammelt Fixtures, Markdown-Blöcke, Korpus |
| `korpus-erzeugen.mjs`, `korpus/*.bpmn`, `korpus/INDEX.md` | das Korpus, 71 Fälle |
| `umgebungen/` | `chromium.mjs` (Chromium, Firefox, WebKit per Playwright), `linkedom.mjs`, `xmldom.mjs`, `saxen.mjs`, `txml.mjs`, `fxp.mjs`, `leser.mjs`, `minidom.mjs` |
| `messen.mjs` | misst, schreibt `ergebnisse/ergebnisse.json` (`node messen.mjs`, `bun messen.mjs --umgebungen …`) |
| `tabelle.mjs` | vergleicht gegen Chromium, schreibt `ergebnisse/tabelle.md` |
| `bpmnjs-liest.mjs` | bpmn-moddle gegen den Prototyp, schreibt `ergebnisse/bpmnjs-liest.md` |
| `amp-eigenheit.mjs` | die `&amp;`-Eigenheit, schreibt `ergebnisse/amp-eigenheit.md` |
| `durchlauf.mjs` | bis `appendDiagram()` und zurück durch Chromium, schreibt `ergebnisse/durchlauf.md` |

Fremde Pakete, mit `npm pack` geholt und entpackt unter `/tmp/claude-0/-home-user-dokufix/c7ad9c8e-4112-59bc-bff9-b496db1abe70/scratchpad/parsing-vendor/` (nicht im Repository; nur die Einstiegsdatei importiert, nichts daraus ausgeführt, das nachlädt):

| Paket | Version | Lizenz | Wofür |
|---|---|---|---|
| saxen | 11.2.0 | MIT | Umgebung; Parser von bpmn-moddle |
| @xmldom/xmldom | 0.9.12 | MIT | Umgebung |
| txml | 6.0.3 | MIT | Umgebung |
| fast-xml-parser | 5.11.2 | MIT | Umgebung |
| bpmn-moddle | 10.3.1 | MIT | was bpmn-js liest (bpmn-js 18.31.0 bindet `^10.3.1`) |
| moddle-xml | 12.3.1 | MIT | von bpmn-moddle gebraucht |
| moddle | 7.2.0 | MIT | von bpmn-moddle gebraucht |
| min-dash | 5.1.0 | MIT | von bpmn-moddle gebraucht |

Aus `node_modules` des Repositorys: linkedom 0.18.13 (ISC), playwright-core 1.63.0 (Apache-2.0), esbuild (nur für die Größenmessung). Browser: Chromium 141 aus `/opt/pw-browsers/chromium`; Firefox 155 (Playwright-Build 1543) und WebKit (Build 2359, nicht startbar) per `playwright-core install` ins Scratchpad unter `pw-browsers/` geladen.

**Gemessen:** alles in den Abschnitten 3.1–3.3, 5.2–5.4 und die Laufzeiten. **Aus Dokumentation und Quelltext, nicht gemessen:** Safari/WebKit (Abschnitt 3.4), Deno, ATTLIST-Vorgaben in Browsern, das Verhalten älterer libxml2-Versionen, expats Aufblähgrenze (nur ihr Ergebnis in Firefox ist gemessen).
