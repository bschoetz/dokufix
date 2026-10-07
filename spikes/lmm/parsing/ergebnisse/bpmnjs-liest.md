# Was bpmn-js liest, verglichen mit dem Prototyp

bpmn-moddle 10.3.1, moddle-xml 12.3.1, moddle 7.2.0, saxen 11.2.0, min-dash 5.1.0, in Node 22.22.0. Verglichen werden je Fall die rohen Werte name (Knoten, Bahnen, Teilnehmer, Flüsse), text (Textanmerkungen) und flowNodeRef (Bahnen), so wie bpmn-moddle sie liefert (`fromXML`) und wie der Prototyp sie liest. Ein Fall, den beide ablehnen, zählt als gleich.

Gleich: 123, abweichend: 15, nur einer lehnt ab: 19 (von 157).

| Fall | Unterschied | Warnungen von bpmn-moddle |
|---|---|---|
| korpus-attribut-crlf | name:Task_1: Prototyp "Zeile 1 Zeile 2" / bpmn-moddle "Zeile 1\r\nZeile 2"<br>text:TextAnnotation_1: Prototyp "Erste Zeile\nZweite Zeile" / bpmn-moddle "Erste Zeile\r\nZweite Zeile" |  |
| korpus-attribut-id-mit-leerraum | refs:Lane_2: Prototyp ["Task_2","Task_3","EndEvent_1"] / bpmn-moddle ["Task_2","EndEvent_1"]<br>name:Task_3: Prototyp "x" / bpmn-moddle null | unparsable content <bpmn:task> detected<br>unparsable content <bpmn:task> detected<br>unparsable content <bpmn:task> detected<br>unparsable content <bpmn:task> detected<br>unparsable content <bpmn:task> detected<br>unparsable content <bpmn:task> detected<br>unparsable content <bpmn:task> detected<br>unparsable content <bpmn:task> detected<br>unparsable content <bpmn:task> detected<br>unparsable content <bpmn:task> detected<br>unparsable content <bpmn:task> detected<br>unparsable content <bpmn:task> detected<br>unresolved reference <Task_3><br>unresolved reference <Task_3> |
| korpus-attribut-mehrzeilig | name:Task_3: Prototyp "Über         mehrere Zeilen" / bpmn-moddle "Über\n        mehrere Zeilen" |  |
| korpus-attribut-zeilenumbruch | name:Lane_1: Prototyp "Bahn   eins" / bpmn-moddle "Bahn\n  eins"<br>name:Task_1: Prototyp "Zeile 1 Zeile 2" / bpmn-moddle "Zeile 1\nZeile 2"<br>name:Task_2: Prototyp "Tab here" / bpmn-moddle "Tab\there" |  |
| korpus-billion-laughs | Prototyp lehnt ab: leser: error on line 32 at column 59: Maximum entity amplification factor exceeded |  |
| korpus-cdata-mit-leerraum | text:TextAnnotation_1: Prototyp "\n      Nur dieser Text\n    " / bpmn-moddle "Nur dieser Text" |  |
| korpus-deklaration-nach-leerraum | Prototyp lehnt ab: leser: error on line 2 at column 3: XML declaration allowed only at the start of the document |  |
| korpus-doctype-extern-inhalt | Prototyp lehnt ab: leser: error on line 24 at column 67: External entity 'geheim' is not loaded |  |
| korpus-doctype-extern | Prototyp lehnt ab: leser: error on line 18 at column 42: Attribute references external entity 'geheim' is not loaded |  |
| korpus-doctype-intern | name:Task_1: Prototyp "ACME GmbH prüfen" / bpmn-moddle "&firma; prüfen"<br>text:TextAnnotation_1: Prototyp "Für ACME GmbH ★" / bpmn-moddle "Für &firma; &stern;" | unparsable content ]> |
| korpus-entitaet-in-flowNodeRef | refs:Lane_1: Prototyp ["StartEvent_1","Task&1"] / bpmn-moddle ["StartEvent_1"]<br>name:Task&1: Prototyp "Antrag prüfen" / bpmn-moddle null | unparsable content <bpmn:task> detected<br>unresolved reference <Task&1><br>unresolved reference <Task&1><br>unresolved reference <Task&1><br>unresolved reference <Task&1> |
| korpus-entitaet-kaputt | Prototyp lehnt ab: leser: error on line 15 at column 36: EntityRef: expecting ';' |  |
| korpus-entitaeten-grossschreibung | Prototyp lehnt ab: leser: error on line 15 at column 36: Entity 'AMP' not defined |  |
| korpus-entitaeten-html | Prototyp lehnt ab: leser: error on line 15 at column 39: Entity 'nbsp' not defined |  |
| korpus-entitaeten-name | name:Task_2: Prototyp "Zeile A\nZeile B\tTab AA ä 😀 😀" / bpmn-moddle "Zeile A\nZeile B\tTab AA ä  " |  |
| korpus-entitaeten-text | text:TextAnnotation_1: Prototyp "A & B < C > D \"E\" 'F' &amp; &lt; \nA😀" / bpmn-moddle "A & B < C > D \"E\" 'F' &amp; &lt; \nA" |  |
| korpus-entitaeten-ungueltige-zeichen | Prototyp lehnt ab: leser: error on line 15 at column 38: xmlParseCharRef: invalid xmlChar value 0 |  |
| korpus-flowNodeRef-leerraum | refs:Lane_1: Prototyp ["StartEvent_1","\n          Task_1\n        "] / bpmn-moddle ["StartEvent_1"]<br>refs:Lane_2: Prototyp ["\tTask_2 ","EndEvent_1"] / bpmn-moddle ["EndEvent_1"] | unresolved reference <<br>unresolved reference <	Task_2 > |
| korpus-fremde-elemente | name:Task_9: Prototyp "Fremd" / bpmn-moddle null | unparsable content <signavio:task> detected |
| korpus-ids-doppelt | name:Task_1: Prototyp "Doppelgänger" / bpmn-moddle "Antrag prüfen" | unparsable content <bpmn:task> detected |
| korpus-ids-sonderzeichen | refs:Lane_1: Prototyp ["StartEvent_1","Aufgabe.eins-ä_1"] / bpmn-moddle ["StartEvent_1"]<br>name:Aufgabe.eins-ä_1: Prototyp "Antrag prüfen" / bpmn-moddle null | unparsable content <bpmn:task> detected<br>unresolved reference <Aufgabe.eins-ä_1><br>unresolved reference <Aufgabe.eins-ä_1><br>unresolved reference <Aufgabe.eins-ä_1><br>unresolved reference <Aufgabe.eins-ä_1> |
| korpus-kaputt-attribut-doppelt | Prototyp lehnt ab: leser: error on line 22 at column 37: Attribute name redefined |  |
| korpus-kaputt-attribut-ohne-anfuehrung | Prototyp lehnt ab: leser: error on line 21 at column 19: AttValue: " or ' expected |  |
| korpus-kaputt-steuerzeichen | Prototyp lehnt ab: leser: error on line 21 at column 65: Char 0x7 out of allowed range |  |
| korpus-kaputt-tagname-ungueltig | Prototyp lehnt ab: leser: error on line 22 at column 5: Failed to parse QName 'bpmn:1task' |  |
| korpus-kaputt-text-nach-wurzel | Prototyp lehnt ab: leser: error on line 25 at column 1: Extra content at the end of the document |  |
| korpus-kaputt-zwei-wurzeln | Prototyp lehnt ab: leser: error on line 25 at column 1: Extra content at the end of the document |  |
| korpus-kein-definitions | bpmn-moddle lehnt ab: failed to parse document as <bpmn:Definitions> |  |
| korpus-kodierung-latin1 | = (gleich) | unsupported document encoding <ISO-8859-1>, falling back to UTF-8 |
| korpus-kodierung-utf16 | = (gleich) | unsupported document encoding <UTF-16>, falling back to UTF-8 |
| korpus-kommentar-doppelstrich | Prototyp lehnt ab: leser: error on line 21 at column 12: Double hyphen within comment |  |
| korpus-praefix-falscher-namensraum | bpmn-moddle lehnt ab: failed to parse document as <bpmn:Definitions> |  |
| korpus-praefix-nicht-deklariert | Prototyp lehnt ab: leser: error on line 2 at column 1: Namespace prefix bpmn on definitions is not defined |  |
| korpus-text-mit-kindelement | bpmn-moddle lehnt ab: Cannot read properties of undefined (reading 'handleEnd') |  |
| korpus-text-nur-leerraum | text:TextAnnotation_1: Prototyp "   \n\t  " / bpmn-moddle "" |  |
| korpus-zeilenenden-cr | text:TextAnnotation_1: Prototyp "Zeile A\nZeile B" / bpmn-moddle "Zeile A\rZeile B" |  |
