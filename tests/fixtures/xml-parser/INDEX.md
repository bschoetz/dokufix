# Korpus des XML-Lesers

Die heiklen Fälle aus Spike lmm/parsing (`spikes/lmm/parsing/korpus/`, erzeugt von `korpus-erzeugen.mjs`), ohne `gross-5000.bpmn`. Jede Datei ist ein Fall. `expected.json` hält je Fall fest, was `parseXml()` (`src/app/xml-parser.js`) und `readProcess()` daraus lesen. Es ist das, was Chromium im Spike gelesen hat, bis auf die gewollten Abweichungen, die `tests/xml-parser.test.mjs` je Fall begründet (`DIFFERS`). Die Beschreibungen unten stammen aus dem Spike; wo sie eine Frage offenlassen, steht die Entscheidung im Test.

| Datei | Was sie prüft |
|---|---|
| `entitaeten-name.bpmn` | Die fünf vordefinierten Entitäten und numerische Zeichenreferenzen in Attributen, darunter &#10; (Zeilenumbruch), &#9; (Tabulator) und ein Zeichen jenseits der BMP (Emoji, dezimal und hexadezimal). |
| `entitaeten-text.bpmn` | Dieselben Entitäten im Text der Anmerkung, dazu doppelt kodiert (&amp;amp; muss als "&amp;" gelesen werden). |
| `entitaeten-grossschreibung.bpmn` | &AMP; und &LT; sind in XML nicht definiert (Entitätsnamen sind schreibungsabhängig); saxen kennt sie trotzdem. Erwartung: Fehler. |
| `entitaeten-html.bpmn` | HTML-Entitäten ohne DOCTYPE sind in XML undefiniert. Erwartung: Fehler; saxen und einige Tree-Parser lassen sie wörtlich stehen. |
| `entitaeten-ungueltige-zeichen.bpmn` | Zeichenreferenzen auf Zeichen, die XML 1.0 verbietet (U+0000, ein einzelnes Surrogat, jenseits von U+10FFFF). Erwartung: Fehler. |
| `entitaet-kaputt.bpmn` | Ein nacktes & in einem Attribut und eine Referenz ohne Semikolon. Erwartung: Fehler. |
| `entitaet-in-flowNodeRef.bpmn` | Eine ID mit & in Attribut und als Inhalt eines flowNodeRef, beide als &amp; geschrieben: sie müssen gleich gelesen werden, sonst steht die Aufgabe in keiner Bahn. |
| `attribut-zeilenumbruch.bpmn` | Wörtlicher Zeilenumbruch und Tabulator in Attributwerten: XML 1.0 §3.3.3 ersetzt sie durch ein Leerzeichen (&#10; dagegen bleibt). clean() verwischt das für Namen, die Rohlesung unterscheidet sich. |
| `attribut-crlf.bpmn` | Zeilenenden \r\n in der Datei, im Attribut und im Text der Anmerkung: XML 1.0 §2.11 macht daraus \n (im Attribut dann ein Leerzeichen). Der Text der Anmerkung geht wörtlich in die Größe der Notiz. |
| `zeilenenden-cr.bpmn` | Nur \r als Zeilenende (alter Mac): ebenfalls zu \n zu normalisieren. |
| `attribut-anfuehrungszeichen.bpmn` | Einfache Anführungszeichen, > in Attributwerten: für den Parser harmlos, für die Textregeln in appendDiagram() und relane() eine Falle. |
| `attribut-mehrzeilig.bpmn` | Attribute über mehrere Zeilen verteilt, Tag mit Leerraum vor />. |
| `bom.bpmn` | UTF-8-BOM vor der XML-Deklaration: zulässig, muss übergangen werden. |
| `bom-ohne-deklaration.bpmn` | BOM ohne XML-Deklaration. |
| `kodierung-latin1.bpmn` | Kodierungsangabe ISO-8859-1, aber die Eingabe ist ein JS-String: die Angabe darf keine Wirkung haben. |
| `kodierung-utf16.bpmn` | Kodierungsangabe UTF-16 bei String-Eingabe. |
| `xml-1-1.bpmn` | XML 1.1 in der Deklaration. Browser lesen es; die Frage ist, ob ein eigener Leser es annimmt. |
| `deklaration-nach-leerraum.bpmn` | Leerraum vor der XML-Deklaration: nach XML 1.0 ein Fehler (die Deklaration muss ganz am Anfang stehen). |
| `ohne-deklaration.bpmn` | Keine XML-Deklaration: zulässig. |
| `standalone.bpmn` | standalone="yes". |
| `cdata-text.bpmn` | CDATA im Text der Anmerkung: wörtlich, ohne Entitätsauflösung. |
| `cdata-mit-leerraum.bpmn` | CDATA mit Leerraum davor und danach: ein DOM liefert den Leerraum mit (textContent), bpmn-moddle wirft reine Leerraum-Textknoten weg. |
| `cdata-und-text.bpmn` | CDATA gemischt mit Text und Entitäten, auch ein leeres CDATA. |
| `cdata-mit-close-tag.bpmn` | Ein schließendes definitions-Tag und ein Tag mit id in CDATA: appendDiagram() darf sie nicht als XML lesen. |
| `kommentare.bpmn` | Kommentare vor dem Wurzelelement, zwischen Elementen, im Text: sie sind kein Inhalt; ein Tag im Kommentar ist kein Element, eine id darin keine ID. |
| `kommentar-doppelstrich.bpmn` | "--" im Kommentar: nach XML 1.0 §2.5 verboten. Erwartung: Fehler. |
| `verarbeitungsanweisungen.bpmn` | Verarbeitungsanweisungen vor der Wurzel, zwischen Elementen, im Text und nach der Wurzel: kein Inhalt. |
| `doctype-leer.bpmn` | Ein DOCTYPE ohne internen Teil. |
| `doctype-intern.bpmn` | Eigene Entitäten im internen DTD-Teil: Browser lösen sie auf (libxml2, expat), saxen nicht. Welches Verhalten das Paket wählt, ist zu entscheiden. |
| `doctype-extern.bpmn` | Eine externe Entität (XXE): Kein Parser darf sie laden. Browser ersetzen sie durch nichts oder melden einen Fehler. |
| `doctype-extern-inhalt.bpmn` | Dieselbe externe Entität, im Text statt im Attribut verwiesen: Browser laden sie nicht; ob sie still verschwindet oder ein Fehler ist, ist zu messen. |
| `zeichenreferenz-cr.bpmn` | &#13; und &#xD; (Wagenrücklauf als Referenz): sie bleiben nach §2.11 erhalten, nur wörtliche \r werden normalisiert. |
| `billion-laughs.bpmn` | Verschachtelte Entitäten (10^8 × "lol", 300 MB): ein Parser, der Entitäten auflöst, braucht eine Grenze. |
| `praefix-bpmn2.bpmn` | Präfix bpmn2: (Eclipse BPMN2 Modeler). |
| `praefix-ohne.bpmn` | Standard-Namensraum ohne Präfix. |
| `praefix-gemischt.bpmn` | Drei Schreibweisen (bpmn:, b2:, ohne Präfix) desselben Namensraums in einer Datei. |
| `praefix-falscher-namensraum.bpmn` | Präfix bpmn: an einen fremden Namensraum gebunden. readProcess() liest nur lokale Namen und nimmt es an; bpmn-js lehnt es ab. Ein Leser mit Namensräumen könnte warnen. |
| `praefix-nicht-deklariert.bpmn` | Präfix bpmn: ohne Deklaration: nach Namespaces in XML ein Fehler. Chromium meldet ihn; was ein Leser ohne Namensräume tut, ist zu sehen. |
| `praefix-lokal-deklariert.bpmn` | Der Namensraum am Prozess erneut deklariert (zulässig). |
| `praefix-xml-reserviert.bpmn` | Das reservierte Präfix xml: (xml:space) ohne Deklaration: zulässig. |
| `fremde-elemente.bpmn` | Fremde Elemente (camunda:, signavio:task): readProcess() liest ein signavio:task als Aufgabe, weil es nur den lokalen Namen sieht; bpmn-js nicht. Mit Namensräumen wäre das zu unterscheiden. |
| `text-eingerueckt.bpmn` | Schön formatierter Text mit Einrückung: wörtlich zu behalten (bpmn-js zeichnet ihn so). |
| `text-kommentar.bpmn` | Neu nach dem Review vom 7. Oktober 2026: ein Kommentar und eine PI im Text. Sie trennen die Textknoten wie im Browser, auch wenn sie nicht im Baum stehen; der Leerraum vor dem Kommentar ist ein eigener Knoten und fällt weg, wie bei bpmn-js. |
| `cdata-zeilenumbruch.bpmn` | Neu nach dem Review: ein CDATA-Abschnitt, der nur einen Zeilenumbruch hält, zwischen zwei Zeilen. Er bleibt, wie in bpmn-moddle: zwei Zeilen. |
| `text-leer.bpmn` | Leeres <text></text>: die Anmerkung hat keinen Text und wird ausgelassen. |
| `text-nur-leerraum.bpmn` | Nur Leerraum im Text: ebenfalls "has no text". |
| `text-selbstschliessend.bpmn` | Selbstschließendes <text/>. |
| `text-fehlt.bpmn` | Eine textAnnotation ohne <text>-Kind. |
| `text-mit-kindelement.bpmn` | Ein Element im Text: textContent liefert "Vorn fett hinten"; bpmn-moddle kennt kein solches Kind. |
| `text-xml-space.bpmn` | xml:space="preserve" (hat für ein DOM keine Wirkung). |
| `text-unicode.bpmn` | Nicht-ASCII, geschütztes Leerzeichen, U+2028: wörtlich zu behalten; clean() (\s) nimmt U+00A0 und U+2028 als Leerraum. |
| `kaputt-tag-nicht-geschlossen.bpmn` | Ein Element ohne schließendes Tag. |
| `kaputt-falsch-verschachtelt.bpmn` | Falsch verschachtelte Tags. |
| `kaputt-attribut-ohne-anfuehrung.bpmn` | Attributwert ohne Anführungszeichen. |
| `kaputt-attribut-doppelt.bpmn` | Dasselbe Attribut zweimal: nach XML 1.0 ein Wohlgeformtheitsfehler. |
| `kaputt-kleiner-im-text.bpmn` | Nacktes < im Text. |
| `kaputt-zwei-wurzeln.bpmn` | Zwei Wurzelelemente. |
| `kaputt-text-nach-wurzel.bpmn` | Text nach dem Wurzelelement. |
| `kaputt-steuerzeichen.bpmn` | Steuerzeichen U+0007, U+0001 im Text: in XML 1.0 verboten. |
| `kaputt-wurzel-offen.bpmn` | Das schließende definitions-Tag fehlt. |
| `kaputt-close-tag-mit-leerraum.bpmn` | Leerraum im schließenden Tag vor >: zulässig (§3.1 ETag erlaubt S). |
| `kaputt-leer.bpmn` | Leere Eingabe. |
| `kaputt-nur-leerraum.bpmn` | Nur Leerraum. |
| `kaputt-nur-deklaration.bpmn` | Nur eine Deklaration, kein Element. |
| `kaputt-tagname-ungueltig.bpmn` | Elementname beginnt mit Ziffer. |
| `kein-definitions.bpmn` | Wohlgeformt, aber kein BPMN: readProcess() gibt null. |
| `definitions-ohne-inhalt.bpmn` | Leere definitions: readProcess() wirft LAYOUT_NOTHING. |
| `ids-sonderzeichen.bpmn` | IDs mit Punkt, Bindestrich, Umlaut; eine ID "definitions". |
| `ids-doppelt.bpmn` | Dieselbe ID zweimal: ohne DTD kein Wohlgeformtheitsfehler; readProcess() liest beide. |
| `flowNodeRef-leerraum.bpmn` | Leerraum um den Inhalt eines flowNodeRef: readProcess() trimmt ihn. |
| `attribut-id-mit-leerraum.bpmn` | Leerraum um das = eines Attributs: zulässig. |
| `leerraum-im-starttag.bpmn` | Tabulatoren und Zeilenumbrüche zwischen Attributen. |
