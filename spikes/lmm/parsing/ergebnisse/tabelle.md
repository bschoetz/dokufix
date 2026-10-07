# Vergleich der Umgebungen gegen chromium

Referenz: Chromium 141.0.0.0 (DOMParser, libxml2). Verglichen wird das Ergebnis von `lesen()` (`lesen.mjs`): der Status (ok, null, parsererror, error) und bei ok das Modell und `leftOut` von `readProcess()` als JSON. Gleich = Status gleich und bei ok das JSON gleich; zwei verschiedene Fehlermeldungen zählen als gleich (beide Parserfehler).

## Übersicht

| Umgebung | fixture (57) | referenz (14) | demo (15) | korpus (71) | abweichend gesamt |
|---|---|---|---|---|---|
| node:linkedom (linkedom 0.18.13 (ISC) unter node 22.22.0) | 4 abweichend | 3 abweichend | alle gleich | 30 abweichend | 37 von 157 |
| node:xmldom (@xmldom/xmldom 0.9.12 (MIT) unter node 22.22.0) | alle gleich | alle gleich | alle gleich | 8 abweichend | 8 von 157 |
| node:saxen (saxen 11.2.0 (MIT) unter node 22.22.0) | alle gleich | alle gleich | alle gleich | 22 abweichend | 22 von 157 |
| node:txml (txml 6.0.3 (MIT) unter node 22.22.0) | alle gleich | 1 abweichend | alle gleich | 19 abweichend | 20 von 157 |
| node:fxp (fast-xml-parser 5.11.2 (MIT) unter node 22.22.0) | alle gleich | alle gleich | alle gleich | 14 abweichend | 14 von 157 |
| node:leser (leser.mjs (Prototyp, ohne Abhängigkeit) unter node 22.22.0) | alle gleich | alle gleich | alle gleich | 1 abweichend | 1 von 157 |
| bun:linkedom (linkedom 0.18.13 (ISC) unter bun 1.4.2) | 4 abweichend | 3 abweichend | alle gleich | 30 abweichend | 37 von 157 |
| bun:xmldom (@xmldom/xmldom 0.9.12 (MIT) unter bun 1.4.2) | alle gleich | alle gleich | alle gleich | 8 abweichend | 8 von 157 |
| bun:saxen (saxen 11.2.0 (MIT) unter bun 1.4.2) | alle gleich | alle gleich | alle gleich | 22 abweichend | 22 von 157 |
| bun:txml (txml 6.0.3 (MIT) unter bun 1.4.2) | alle gleich | 1 abweichend | alle gleich | 19 abweichend | 20 von 157 |
| bun:fxp (fast-xml-parser 5.11.2 (MIT) unter bun 1.4.2) | alle gleich | alle gleich | alle gleich | 14 abweichend | 14 von 157 |
| bun:leser (leser.mjs (Prototyp, ohne Abhängigkeit) unter bun 1.4.2) | alle gleich | alle gleich | alle gleich | 1 abweichend | 1 von 157 |
| firefox (Firefox 155.0 (DOMParser, expat)) | alle gleich | alle gleich | alle gleich | 1 abweichend | 1 von 157 |

## Fall × Umgebung

Nur Fälle, in denen mindestens eine Umgebung abweicht. "=" gleich; sonst die Art: `status → status (Meldung)` oder `pfad: erwartet → ist`. Die Meldung der Referenz steht gekürzt in der zweiten Spalte. Die Spalten bun:… fehlen: jeder Adapter liefert unter Bun in jedem Fall dasselbe wie unter Node (Status, Modell, leftOut).

| Fall | Referenz | linkedom | xmldom | saxen | txml | fxp | leser | firefox |
|---|---|---|---|---|---|---|---|---|
| fixture-hund | ok | model.nodes[2].name: "Zitzen reinigen & Euter massieren" → "Zitzen reinigen &amp; Euter massieren" | = | = | = | = | = | = |
| fixture-ref8 | ok | model.nodes[0].name: "Mahnung & Gebühr" → "Mahnung &amp; Gebühr" | = | = | = | = | = | = |
| fixture-hund2 | ok | model.nodes[1].name: "Melkstand & Equipment desinfizieren" → "Melkstand &amp; Equipment desinfizieren" | = | = | = | = | = | = |
| fixture-notiz-hund2 | ok | model.nodes[1].name: "Melkstand & Equipment desinfizieren" → "Melkstand &amp; Equipment desinfizieren" | = | = | = | = | = | = |
| referenz-L746 | ok | model.nodes[2].name: "Zitzen reinigen & Euter massieren" → "Zitzen reinigen &amp; Euter massieren" | = | = | = | = | = | = |
| referenz-L1074 | parsererror (error on line 1 at column 18: Namespace prefix bpmn on definitions is not define) | parsererror → error (Das BPMN-XML enthält kein Element, das sich anordnen lässt.) | = | = | parsererror → error (Das BPMN-XML enthält kein Element, das sich anordnen lässt.) | = | = | = |
| referenz-L1108 | ok | model.nodes[0].name: "Mahnung & Gebühr" → "Mahnung &amp; Gebühr" | = | = | = | = | = | = |
| korpus-attribut-anfuehrungszeichen | ok | model.lanes[0].name: "A>B" → "A&gt;B" | = | = | = | = | = | = |
| korpus-attribut-crlf | ok | model.notes[0].text: "Erste Zeile\nZweite Zeile" → "Erste Zeile\r\nZweite Zeile" | = | model.notes[0].text: "Erste Zeile\nZweite Zeile" → "Erste Zeile\r\nZweite Zeile" | model.notes[0].text: "Erste Zeile\nZweite Zeile" → "Erste Zeile\r\nZweite Zeile" | = | = | = |
| korpus-attribut-id-mit-leerraum | ok | = | = | model.lanes[1].nodes.length: 3 → 2 | = | = | = | = |
| korpus-billion-laughs | parsererror (error on line 1 at column 17: Maximum entity amplification factor exceeded, see ) | parsererror → ok | = | parsererror → ok | parsererror → ok | parsererror → ok | = | = |
| korpus-bom-ohne-deklaration | ok | = | ok → parsererror (xmldom: error: Unexpected content outside root element: ' ') | = | = | = | = | = |
| korpus-bom | ok | = | ok → parsererror (xmldom: processing instruction at position 1 is an xml declaration which is only) | = | = | = | = | = |
| korpus-deklaration-nach-leerraum | parsererror (error on line 2 at column 8: XML declaration allowed only at the start of the do) | parsererror → ok | = | parsererror → ok | parsererror → ok | = | = | = |
| korpus-doctype-extern-inhalt | ok | model.notes[0].text: "Inhalt: " → "Inhalt: &geheim;" | ok → parsererror (xmldom: error: entity not found:&geheim;) | model.notes[0].text: "Inhalt: " → "Inhalt: &geheim;" | model.notes[0].text: "Inhalt: " → "Inhalt: &geheim;" | ok → parsererror (fxp: External entities are not supported) | ok → parsererror (error on line 24 at column 67: External entity 'geheim' is not loaded) | = |
| korpus-doctype-extern | parsererror (error on line 18 at column 50: Attribute references external entity 'geheim') | parsererror → ok | = | parsererror → ok | parsererror → ok | = | = | = |
| korpus-doctype-intern | ok | model.nodes[1].name: "ACME GmbH prüfen" → "&amp;firma; prüfen" | ok → parsererror (xmldom: error: entity not found:&firma; \| error: entity not found:&firma; \| erro) | model.nodes[1].name: "ACME GmbH prüfen" → "&firma; prüfen" | model.nodes[1].name: "ACME GmbH prüfen" → "&firma; prüfen" | model.notes[0].text: "Für ACME GmbH ★" → "Für ACME GmbH &stern;" | = | = |
| korpus-entitaet-in-flowNodeRef | ok | ok → error (Diese Elemente liegen in keiner Bahn: Task&amp;1.) | = | = | = | = | = | = |
| korpus-entitaet-kaputt | parsererror (error on line 15 at column 37: xmlParseEntityRef: no name) | parsererror → ok | = | parsererror → ok | parsererror → ok | = | = | = |
| korpus-entitaeten-grossschreibung | parsererror (error on line 15 at column 41: Entity 'AMP' not defined) | parsererror → ok | = | parsererror → ok | parsererror → ok | parsererror → ok | = | = |
| korpus-entitaeten-html | parsererror (error on line 15 at column 45: Entity 'nbsp' not defined) | parsererror → ok | = | parsererror → ok | parsererror → ok | parsererror → ok | = | = |
| korpus-entitaeten-name | ok | model.nodes[1].name: "Prüfen & ablegen <sofort> \"jetzt\" 'gleich'" → "Prüfen &amp; ablegen &lt;sofort&gt; \"jetzt\" 'gleich'" | = | model.nodes[2].name: "Zeile A Zeile B Tab AA ä 😀 😀" → "Zeile A Zeile B Tab AA ä  " | = | model.nodes[2].name: "Zeile A Zeile B Tab AA ä 😀 😀" → "Zeile A&#10;Zeile B&#9;Tab &#x41;&#65; &#xE4; &#128512; … | = | = |
| korpus-entitaeten-text | ok | = | = | model.notes[0].text: "A & B < C > D \"E\" 'F' &amp; &lt; \nA😀" → "A & B < C > D \"E\" 'F' &amp; &lt; \nA" | = | model.notes[0].text: "A & B < C > D \"E\" 'F' &amp; &lt; \nA😀" → "A & B < C > D \"E\" 'F' &amp; &lt; &#10;&#65;&#x1F600;" | = | = |
| korpus-entitaeten-ungueltige-zeichen | parsererror (error on line 15 at column 42: xmlParseCharRef: invalid xmlChar value 0) | parsererror → ok | parsererror → ok | parsererror → ok | parsererror → ok | parsererror → ok | = | = |
| korpus-gross-5000 | ok | model.nodes[4].name: "Aufgabe 3 & mehr" → "Aufgabe 3 &amp; mehr" | = | = | = | = | = | = |
| korpus-kaputt-attribut-doppelt | parsererror (error on line 22 at column 45: Attribute name redefined) | parsererror → ok | = | parsererror → ok | parsererror → ok | = | = | = |
| korpus-kaputt-attribut-ohne-anfuehrung | parsererror (error on line 21 at column 19: AttValue: " or ' expected) | parsererror → error (Diese Elemente liegen in keiner Bahn: Task_3.) | parsererror → error (Diese Elemente liegen in keiner Bahn: Task_3.) | parsererror → ok | parsererror → error (Diese Elemente liegen in keiner Bahn: Task_3.) | = | = | = |
| korpus-kaputt-falsch-verschachtelt | parsererror (error on line 22 at column 61: Opening and ending tag mismatch: documentation li) | parsererror → ok | = | = | = | = | = | = |
| korpus-kaputt-kleiner-im-text | parsererror (error on line 21 at column 62: StartTag: invalid element name) | parsererror → ok | = | = | = | = | = | = |
| korpus-kaputt-leer | parsererror (error on line 1 at column 1: Document is empty) | parsererror → null | = | = | = | = | = | = |
| korpus-kaputt-nur-deklaration | parsererror (error on line 2 at column 1: Start tag expected, '<' not found) | parsererror → null | = | = | = | = | = | = |
| korpus-kaputt-nur-leerraum | parsererror (error on line 2 at column 2: Start tag expected, '<' not found) | parsererror → null | = | = | = | = | = | = |
| korpus-kaputt-steuerzeichen | parsererror (error on line 21 at column 65: PCDATA invalid Char value 7) | parsererror → ok | parsererror → ok | parsererror → ok | parsererror → ok | parsererror → ok | = | = |
| korpus-kaputt-tag-nicht-geschlossen | parsererror (error on line 25 at column 18: Opening and ending tag mismatch: task line 22 and) | parsererror → ok | = | = | = | = | = | = |
| korpus-kaputt-tagname-ungueltig | parsererror (error on line 22 at column 16: Failed to parse QName 'bpmn:1task') | parsererror → ok | = | parsererror → ok | parsererror → ok | parsererror → ok | = | = |
| korpus-kaputt-text-nach-wurzel | parsererror (error on line 25 at column 1: Extra content at the end of the document) | parsererror → ok | = | parsererror → ok | parsererror → ok | = | = | = |
| korpus-kaputt-wurzel-offen | parsererror (error on line 24 at column 1: Premature end of data in tag definitions line 2) | parsererror → ok | = | = | parsererror → ok | = | = | = |
| korpus-kaputt-zwei-wurzeln | parsererror (error on line 25 at column 1: Extra content at the end of the document) | parsererror → ok | = | parsererror → error (Das BPMN-XML enthält kein Element, das sich anordnen lässt.) | = | parsererror → ok | = | = |
| korpus-kommentar-doppelstrich | parsererror (error on line 21 at column 12: Double hyphen within comment: <!-- a) | parsererror → ok | = | parsererror → ok | parsererror → ok | parsererror → ok | = | = |
| korpus-praefix-nicht-deklariert | parsererror (error on line 2 at column 79: Namespace prefix bpmn on definitions is not define) | parsererror → ok | = | parsererror → ok | parsererror → ok | parsererror → ok | = | = |
| korpus-text-unicode | ok | = | model.notes[0].text: "Übergröße — „Anführung“ 🙂  geschütztes Leerzeichen Zeil… → "Übergröße — „Anführung“ 🙂  geschütztes Leerzeichen\nZei… | = | = | = | = | = |
| korpus-xml-1-1 | ok | = | = | = | = | = | = | ok → parsererror (XML Parsing Error: XML declaration not well-formed Location: https://parsing.loc) |
| korpus-zeichenreferenz-cr | ok | = | = | = | = | model.nodes[1].name: "A B" → "A&#13;B" | = | = |
| korpus-zeilenenden-cr | ok | model.notes[0].text: "Zeile A\nZeile B" → "Zeile A\rZeile B" | = | model.notes[0].text: "Zeile A\nZeile B" → "Zeile A\rZeile B" | model.notes[0].text: "Zeile A\nZeile B" → "Zeile A\rZeile B" | = | = | = |

Gleich in allen Umgebungen: 113 von 157 Fällen (fixture 53, referenz 11, demo 15, korpus 34).

## Laufzeit

Summe von `lesen()` (Parsen und `readProcess()`) über die 57 Fixtures, und der Fall gross-5000 (eine Kette aus 5000 Aufgaben, 700 KB), je Umgebung, Millisekunden. Ein Lauf, ohne Aufwärmen, nur als Größenordnung.

| Umgebung | Fixtures gesamt | davon Parsen | gross-5000 | davon Parsen |
|---|---|---|---|---|
| chromium | 30.9 | 10.1 | 122.3 | 34.7 |
| node:linkedom | 68.3 | 36.7 | 189.7 | 100.5 |
| node:xmldom | 64.8 | 44.5 | 205.9 | 135.3 |
| node:saxen | 30.7 | 22.7 | 73.5 | 47.4 |
| node:txml | 29.2 | 16.8 | 77.2 | 55.7 |
| node:fxp | 64.1 | 56.1 | 177.6 | 137.1 |
| node:leser | 24.4 | 14.5 | 78.1 | 47.6 |
| bun:linkedom | 37.7 | 18.7 | 102.2 | 42.8 |
| bun:xmldom | 67.3 | 48.4 | 200.3 | 98.7 |
| bun:saxen | 21.0 | 12.4 | 70.2 | 29.6 |
| bun:txml | 21.9 | 14.9 | 65.5 | 36.8 |
| bun:fxp | 49.2 | 42.8 | 145.6 | 119.4 |
| bun:leser | 26.0 | 13.4 | 83.1 | 47.6 |
| firefox | 50.0 | 22.0 | 102.0 | 43.0 |
