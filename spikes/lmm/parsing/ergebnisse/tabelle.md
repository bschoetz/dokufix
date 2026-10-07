# Vergleich der Umgebungen gegen chromium

Referenz: Chromium 141.0.0.0 (DOMParser, libxml2). Verglichen wird das Ergebnis von `lesen()` (`lesen.mjs`): der Status (ok, null, parsererror, error) und bei ok das Modell und `leftOut` von `readProcess()` als JSON. Gleich = Status gleich und bei ok das JSON gleich; zwei verschiedene Fehlermeldungen zählen als gleich (beide Parserfehler).

## Übersicht

| Umgebung | fixture (57) | referenz (14) | demo (15) | korpus (69) | abweichend gesamt |
|---|---|---|---|---|---|
| node:linkedom (linkedom 0.18.13 (ISC) unter node 22.22.0) | 4 abweichend | 3 abweichend | alle gleich | 29 abweichend | 36 von 155 |
| node:xmldom (@xmldom/xmldom 0.9.12 (MIT) unter node 22.22.0) | alle gleich | alle gleich | alle gleich | 7 abweichend | 7 von 155 |
| node:saxen (saxen 11.2.0 (MIT) unter node 22.22.0) | alle gleich | alle gleich | alle gleich | 21 abweichend | 21 von 155 |
| node:txml (txml 6.0.3 (MIT) unter node 22.22.0) | alle gleich | 1 abweichend | alle gleich | 18 abweichend | 19 von 155 |
| node:fxp (fast-xml-parser 5.11.2 (MIT) unter node 22.22.0) | alle gleich | alle gleich | alle gleich | 12 abweichend | 12 von 155 |

## Fall × Umgebung

Nur Fälle, in denen mindestens eine Umgebung abweicht. "=" gleich; sonst die Art: `status → status (Meldung)` oder `pfad: erwartet → ist`.

| Fall | Referenz | node:linkedom | node:xmldom | node:saxen | node:txml | node:fxp |
|---|---|---|---|---|---|---|
| fixture-hund | ok | model.nodes[2].name: "Zitzen reinigen & Euter massieren" → "Zitzen reinigen &amp; Euter massieren" | = | = | = | = |
| fixture-ref8 | ok | model.nodes[0].name: "Mahnung & Gebühr" → "Mahnung &amp; Gebühr" | = | = | = | = |
| fixture-hund2 | ok | model.nodes[1].name: "Melkstand & Equipment desinfizieren" → "Melkstand &amp; Equipment desinfizieren" | = | = | = | = |
| fixture-notiz-hund2 | ok | model.nodes[1].name: "Melkstand & Equipment desinfizieren" → "Melkstand &amp; Equipment desinfizieren" | = | = | = | = |
| referenz-L746 | ok | model.nodes[2].name: "Zitzen reinigen & Euter massieren" → "Zitzen reinigen &amp; Euter massieren" | = | = | = | = |
| referenz-L1074 | parsererror (This page contains the following errors:error on line 1 at column 18: ) | parsererror → error (Das BPMN-XML enthält kein Element, das sich anordnen lässt.) [Referenz: This page contains the following errors:error on line 1 at c] | = | = | parsererror → error (Das BPMN-XML enthält kein Element, das sich anordnen lässt.) [Referenz: This page contains the following errors:error on line 1 at c] | = |
| referenz-L1108 | ok | model.nodes[0].name: "Mahnung & Gebühr" → "Mahnung &amp; Gebühr" | = | = | = | = |
| korpus-attribut-anfuehrungszeichen | ok | model.lanes[0].name: "A>B" → "A&gt;B" | = | = | = | = |
| korpus-attribut-crlf | ok | model.notes[0].text: "Erste Zeile\nZweite Zeile" → "Erste Zeile\r\nZweite Zeile" | = | model.notes[0].text: "Erste Zeile\nZweite Zeile" → "Erste Zeile\r\nZweite Zeile" | model.notes[0].text: "Erste Zeile\nZweite Zeile" → "Erste Zeile\r\nZweite Zeile" | = |
| korpus-attribut-id-mit-leerraum | ok | = | = | model.lanes[1].nodes.length: 3 → 2 | = | = |
| korpus-billion-laughs | parsererror (This page contains the following errors:error on line 1 at column 17: ) | parsererror → ok [Referenz: This page contains the following errors:error on line 1 at c] | = | parsererror → ok [Referenz: This page contains the following errors:error on line 1 at c] | parsererror → ok [Referenz: This page contains the following errors:error on line 1 at c] | parsererror → ok [Referenz: This page contains the following errors:error on line 1 at c] |
| korpus-bom-ohne-deklaration | ok | = | ok → parsererror (xmldom: error: Unexpected content outside root element: ' ') | = | = | = |
| korpus-bom | ok | = | ok → parsererror (xmldom: processing instruction at position 1 is an xml declaration which is only) | = | = | = |
| korpus-deklaration-nach-leerraum | parsererror (This page contains the following errors:error on line 2 at column 8: X) | parsererror → ok [Referenz: This page contains the following errors:error on line 2 at c] | = | parsererror → ok [Referenz: This page contains the following errors:error on line 2 at c] | parsererror → ok [Referenz: This page contains the following errors:error on line 2 at c] | = |
| korpus-doctype-extern | parsererror (This page contains the following errors:error on line 18 at column 50:) | parsererror → ok [Referenz: This page contains the following errors:error on line 18 at ] | = | parsererror → ok [Referenz: This page contains the following errors:error on line 18 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 18 at ] | = |
| korpus-doctype-intern | ok | model.nodes[1].name: "ACME GmbH prüfen" → "&amp;firma; prüfen" | ok → parsererror (xmldom: error: entity not found:&firma; \| error: entity not found:&firma; \| erro) | model.nodes[1].name: "ACME GmbH prüfen" → "&firma; prüfen" | model.nodes[1].name: "ACME GmbH prüfen" → "&firma; prüfen" | model.notes[0].text: "Für ACME GmbH ★" → "Für ACME GmbH &stern;" |
| korpus-entitaet-in-flowNodeRef | ok | ok → error (Diese Elemente liegen in keiner Bahn: Task&amp;1.) | = | = | = | = |
| korpus-entitaet-kaputt | parsererror (This page contains the following errors:error on line 15 at column 37:) | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] | = | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] | = |
| korpus-entitaeten-grossschreibung | parsererror (This page contains the following errors:error on line 15 at column 41:) | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] | = | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] |
| korpus-entitaeten-html | parsererror (This page contains the following errors:error on line 15 at column 45:) | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] | = | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] |
| korpus-entitaeten-name | ok | model.nodes[1].name: "Prüfen & ablegen <sofort> \"jetzt\" 'gleich'" → "Prüfen &amp; ablegen &lt;sofort&gt; \"jetzt\" 'gleich'" | = | model.nodes[2].name: "Zeile A Zeile B Tab AA ä 😀 😀" → "Zeile A Zeile B Tab AA ä  " | = | model.nodes[2].name: "Zeile A Zeile B Tab AA ä 😀 😀" → "Zeile A&#10;Zeile B&#9;Tab &#x41;&#65; &#xE4; &#128512; … |
| korpus-entitaeten-text | ok | = | = | model.notes[0].text: "A & B < C > D \"E\" 'F' &amp; &lt; \nA😀" → "A & B < C > D \"E\" 'F' &amp; &lt; \nA" | = | model.notes[0].text: "A & B < C > D \"E\" 'F' &amp; &lt; \nA😀" → "A & B < C > D \"E\" 'F' &amp; &lt; &#10;&#65;&#x1F600;" |
| korpus-entitaeten-ungueltige-zeichen | parsererror (This page contains the following errors:error on line 15 at column 42:) | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 15 at ] |
| korpus-gross-5000 | ok | model.nodes[4].name: "Aufgabe 3 & mehr" → "Aufgabe 3 &amp; mehr" | = | = | = | = |
| korpus-kaputt-attribut-doppelt | parsererror (This page contains the following errors:error on line 22 at column 45:) | parsererror → ok [Referenz: This page contains the following errors:error on line 22 at ] | = | parsererror → ok [Referenz: This page contains the following errors:error on line 22 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 22 at ] | = |
| korpus-kaputt-attribut-ohne-anfuehrung | parsererror (This page contains the following errors:error on line 21 at column 19:) | parsererror → error (Diese Elemente liegen in keiner Bahn: Task_3.) [Referenz: This page contains the following errors:error on line 21 at ] | parsererror → error (Diese Elemente liegen in keiner Bahn: Task_3.) [Referenz: This page contains the following errors:error on line 21 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 21 at ] | parsererror → error (Diese Elemente liegen in keiner Bahn: Task_3.) [Referenz: This page contains the following errors:error on line 21 at ] | = |
| korpus-kaputt-falsch-verschachtelt | parsererror (This page contains the following errors:error on line 22 at column 61:) | parsererror → ok [Referenz: This page contains the following errors:error on line 22 at ] | = | = | = | = |
| korpus-kaputt-kleiner-im-text | parsererror (This page contains the following errors:error on line 21 at column 62:) | parsererror → ok [Referenz: This page contains the following errors:error on line 21 at ] | = | = | = | = |
| korpus-kaputt-leer | parsererror (This page contains the following errors:error on line 1 at column 1: D) | parsererror → null [Referenz: This page contains the following errors:error on line 1 at c] | = | = | = | = |
| korpus-kaputt-nur-deklaration | parsererror (This page contains the following errors:error on line 2 at column 1: S) | parsererror → null [Referenz: This page contains the following errors:error on line 2 at c] | = | = | = | = |
| korpus-kaputt-nur-leerraum | parsererror (This page contains the following errors:error on line 2 at column 2: S) | parsererror → null [Referenz: This page contains the following errors:error on line 2 at c] | = | = | = | = |
| korpus-kaputt-steuerzeichen | parsererror (This page contains the following errors:error on line 21 at column 65:) | parsererror → ok [Referenz: This page contains the following errors:error on line 21 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 21 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 21 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 21 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 21 at ] |
| korpus-kaputt-tag-nicht-geschlossen | parsererror (This page contains the following errors:error on line 25 at column 18:) | parsererror → ok [Referenz: This page contains the following errors:error on line 25 at ] | = | = | = | = |
| korpus-kaputt-tagname-ungueltig | parsererror (This page contains the following errors:error on line 22 at column 16:) | parsererror → ok [Referenz: This page contains the following errors:error on line 22 at ] | = | parsererror → ok [Referenz: This page contains the following errors:error on line 22 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 22 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 22 at ] |
| korpus-kaputt-text-nach-wurzel | parsererror (This page contains the following errors:error on line 25 at column 1: ) | parsererror → ok [Referenz: This page contains the following errors:error on line 25 at ] | = | parsererror → ok [Referenz: This page contains the following errors:error on line 25 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 25 at ] | = |
| korpus-kaputt-wurzel-offen | parsererror (This page contains the following errors:error on line 24 at column 1: ) | parsererror → ok [Referenz: This page contains the following errors:error on line 24 at ] | = | = | parsererror → ok [Referenz: This page contains the following errors:error on line 24 at ] | = |
| korpus-kaputt-zwei-wurzeln | parsererror (This page contains the following errors:error on line 25 at column 1: ) | parsererror → ok [Referenz: This page contains the following errors:error on line 25 at ] | = | parsererror → error (Das BPMN-XML enthält kein Element, das sich anordnen lässt.) [Referenz: This page contains the following errors:error on line 25 at ] | = | parsererror → ok [Referenz: This page contains the following errors:error on line 25 at ] |
| korpus-kommentar-doppelstrich | parsererror (This page contains the following errors:error on line 21 at column 12:) | parsererror → ok [Referenz: This page contains the following errors:error on line 21 at ] | = | parsererror → ok [Referenz: This page contains the following errors:error on line 21 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 21 at ] | parsererror → ok [Referenz: This page contains the following errors:error on line 21 at ] |
| korpus-praefix-nicht-deklariert | parsererror (This page contains the following errors:error on line 2 at column 79: ) | parsererror → ok [Referenz: This page contains the following errors:error on line 2 at c] | = | parsererror → ok [Referenz: This page contains the following errors:error on line 2 at c] | parsererror → ok [Referenz: This page contains the following errors:error on line 2 at c] | parsererror → ok [Referenz: This page contains the following errors:error on line 2 at c] |
| korpus-text-unicode | ok | = | model.notes[0].text: "Übergröße — „Anführung“ 🙂  geschütztes Leerzeichen Zeil… → "Übergröße — „Anführung“ 🙂  geschütztes Leerzeichen\nZei… | = | = | = |
| korpus-zeilenenden-cr | ok | model.notes[0].text: "Zeile A\nZeile B" → "Zeile A\rZeile B" | = | model.notes[0].text: "Zeile A\nZeile B" → "Zeile A\rZeile B" | model.notes[0].text: "Zeile A\nZeile B" → "Zeile A\rZeile B" | = |

Gleich in allen Umgebungen: 114 von 155 Fällen ([object Object].

## Laufzeit

Summe von `lesen()` (Parsen und `readProcess()`) über die 57 Fixtures, und der Fall gross-5000 (eine Kette aus 5000 Aufgaben, 700 KB), je Umgebung, Millisekunden. Ein Lauf, ohne Aufwärmen, nur als Größenordnung.

| Umgebung | Fixtures gesamt | davon Parsen | gross-5000 | davon Parsen |
|---|---|---|---|---|
| chromium | 30.7 | 11.1 | 107.3 | 32.2 |
| node:linkedom | 68.1 | 38.5 | 196.3 | 102.6 |
| node:xmldom | 71.0 | 49.5 | 207.9 | 123.4 |
| node:saxen | 29.6 | 18.4 | 68.5 | 42.6 |
| node:txml | 26.0 | 21.5 | 66.1 | 41.4 |
| node:fxp | 63.7 | 57.5 | 180.1 | 149.7 |
