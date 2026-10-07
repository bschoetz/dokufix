// Schreibt das Korpus der heiklen Fälle nach korpus/*.bpmn. Ein Skript statt
// Handarbeit, weil BOM, \r\n und Steuerzeichen im Editor unsichtbar sind.
//
//   cd spikes/lmm/parsing && node korpus-erzeugen.mjs
//
// Jeder Fall ist ein kleines BPMN mit Prozess, Bahnen, Aufgaben, Flüssen und
// einer Textanmerkung, so dass readProcess() Namen, IDs, Verweise (flowNodeRef)
// und den Text der Anmerkung liest. Die Datei korpus/INDEX.md beschreibt jeden
// Fall und was er prüfen soll.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, 'korpus');
fs.mkdirSync(dir, { recursive: true });

const NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';

// Ein Prozess mit zwei Bahnen; p ist das Präfix ("bpmn:" oder ""), die
// Lücken (name1, note, extra…) füllen die Fälle.
function bpmn({ p = 'bpmn:', xmlns = ' xmlns:bpmn="' + NS + '"', decl = '<?xml version="1.0" encoding="UTF-8"?>\n', name1 = 'Antrag prüfen', name2 = 'Antrag ablegen', note = 'Eine Anmerkung', lane1 = 'Sachbearbeitung', lane2 = 'Archiv', before = '', inside = '', after = '', textOpen = '<' + p + 'text>', textClose = '</' + p + 'text>', ref1 = 'Task_1', ref2 = 'Task_2', nl = '\n', id1 = 'Task_1', id2 = 'Task_2', rootExtra = '', closing = '</' + p + 'definitions>' } = {}){
  const lines = [
    decl.replace(/\n$/, ''),
    before,
    '<' + p + 'definitions' + xmlns + rootExtra + ' id="Definitions_1" targetNamespace="http://example.com/bpmn">',
    '  <' + p + 'process id="Process_1" isExecutable="false">',
    '    <' + p + 'laneSet id="LaneSet_1">',
    '      <' + p + 'lane id="Lane_1" name="' + lane1 + '">',
    '        <' + p + 'flowNodeRef>StartEvent_1</' + p + 'flowNodeRef>',
    '        <' + p + 'flowNodeRef>' + ref1 + '</' + p + 'flowNodeRef>',
    '      </' + p + 'lane>',
    '      <' + p + 'lane id="Lane_2" name="' + lane2 + '">',
    '        <' + p + 'flowNodeRef>' + ref2 + '</' + p + 'flowNodeRef>',
    // Ein Fall, der eine Task_3 einfügt, bekommt ihren flowNodeRef, sonst wirft readProcess() "in keiner Bahn".
    /id\s*=\s*["']Task_3["']/.test(inside) ? '        <' + p + 'flowNodeRef>Task_3</' + p + 'flowNodeRef>' : '',
    '        <' + p + 'flowNodeRef>EndEvent_1</' + p + 'flowNodeRef>',
    '      </' + p + 'lane>',
    '    </' + p + 'laneSet>',
    '    <' + p + 'startEvent id="StartEvent_1" name="Antrag liegt vor"/>',
    '    <' + p + 'task id="' + id1 + '" name="' + name1 + '"/>',
    '    <' + p + 'task id="' + id2 + '" name="' + name2 + '"/>',
    '    <' + p + 'endEvent id="EndEvent_1" name="Fertig"/>',
    '    <' + p + 'sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="' + id1 + '"/>',
    '    <' + p + 'sequenceFlow id="Flow_2" name="geprüft" sourceRef="' + id1 + '" targetRef="' + id2 + '"/>',
    '    <' + p + 'sequenceFlow id="Flow_3" sourceRef="' + id2 + '" targetRef="EndEvent_1"/>',
    inside,
    '    <' + p + 'textAnnotation id="TextAnnotation_1">' + textOpen + note + textClose + '</' + p + 'textAnnotation>',
    '    <' + p + 'association id="Association_1" sourceRef="TextAnnotation_1" targetRef="' + id1 + '"/>',
    '  </' + p + 'process>',
    after,
    closing,
    '',
  ].filter(l => l !== '');
  return lines.join(nl) + nl;
}

const cases = {};
const put = (name, text, what) => { cases[name] = { text, what }; };

// --- Entitäten ---------------------------------------------------------------
put('entitaeten-name', bpmn({ name1: 'Prüfen &amp; ablegen &lt;sofort&gt; &quot;jetzt&quot; &apos;gleich&apos;', name2: 'Zeile A&#10;Zeile B&#9;Tab &#x41;&#65; &#xE4; &#128512; &#x1F600;' }),
  'Die fünf vordefinierten Entitäten und numerische Zeichenreferenzen in Attributen, darunter &#10; (Zeilenumbruch), &#9; (Tabulator) und ein Zeichen jenseits der BMP (Emoji, dezimal und hexadezimal).');
put('entitaeten-text', bpmn({ note: 'A &amp; B &lt; C &gt; D &quot;E&quot; &apos;F&apos; &amp;amp; &amp;lt; &#10;&#65;&#x1F600;' }),
  'Dieselben Entitäten im Text der Anmerkung, dazu doppelt kodiert (&amp;amp; muss als "&amp;" gelesen werden).');
put('entitaeten-grossschreibung', bpmn({ name1: 'A &AMP; B', note: 'C &LT; D' }),
  '&AMP; und &LT; sind in XML nicht definiert (Entitätsnamen sind schreibungsabhängig); saxen kennt sie trotzdem. Erwartung: Fehler.');
put('entitaeten-html', bpmn({ name1: 'Zeile&nbsp;eins', note: 'caf&eacute;' }),
  'HTML-Entitäten ohne DOCTYPE sind in XML undefiniert. Erwartung: Fehler; saxen und einige Tree-Parser lassen sie wörtlich stehen.');
put('entitaeten-ungueltige-zeichen', bpmn({ name1: 'Null&#0;Zeichen', note: 'Surrogat &#xD800; zu groß &#x110000;' }),
  'Zeichenreferenzen auf Zeichen, die XML 1.0 verbietet (U+0000, ein einzelnes Surrogat, jenseits von U+10FFFF). Erwartung: Fehler.');
put('entitaet-kaputt', bpmn({ name1: 'A & B', note: 'C &amp D' }),
  'Ein nacktes & in einem Attribut und eine Referenz ohne Semikolon. Erwartung: Fehler.');
put('entitaet-in-flowNodeRef', bpmn({ id1: 'Task&amp;1', ref1: 'Task&amp;1', note: 'x' }),
  'Eine ID mit & in Attribut und als Inhalt eines flowNodeRef, beide als &amp; geschrieben: sie müssen gleich gelesen werden, sonst steht die Aufgabe in keiner Bahn.');

// --- Normalisierung von Attributwerten --------------------------------------
put('attribut-zeilenumbruch', bpmn({ name1: 'Zeile 1\nZeile 2', name2: 'Tab\there', lane1: 'Bahn\n  eins' }),
  'Wörtlicher Zeilenumbruch und Tabulator in Attributwerten: XML 1.0 §3.3.3 ersetzt sie durch ein Leerzeichen (&#10; dagegen bleibt). clean() verwischt das für Namen, die Rohlesung unterscheidet sich.');
put('attribut-crlf', bpmn({ name1: 'Zeile 1\r\nZeile 2', nl: '\r\n', note: 'Erste Zeile\r\nZweite Zeile' }),
  'Zeilenenden \\r\\n in der Datei, im Attribut und im Text der Anmerkung: XML 1.0 §2.11 macht daraus \\n (im Attribut dann ein Leerzeichen). Der Text der Anmerkung geht wörtlich in die Größe der Notiz.');
put('zeilenenden-cr', bpmn({ nl: '\r', note: 'Zeile A\rZeile B' }),
  'Nur \\r als Zeilenende (alter Mac): ebenfalls zu \\n zu normalisieren.');
put('attribut-anfuehrungszeichen', bpmn({ name1: 'Größer > als', name2: "Mit 'Apostroph'", inside: "    <bpmn:task id='Task_3' name='Einfach &quot;zitiert&quot;'/>\n    <bpmn:sequenceFlow id='Flow_4' sourceRef='Task_1' targetRef='Task_3'/>", lane1: 'A>B' }),
  'Einfache Anführungszeichen, > in Attributwerten: für den Parser harmlos, für die Textregeln in appendDiagram() und relane() eine Falle.');
put('attribut-mehrzeilig', bpmn({ inside: '    <bpmn:task\n        id="Task_3"\n        name="Über\n        mehrere Zeilen"\n    />\n    <bpmn:sequenceFlow id="Flow_4"\n      sourceRef="Task_1"\n      targetRef="Task_3"/>' }),
  'Attribute über mehrere Zeilen verteilt, Tag mit Leerraum vor />.');

// --- Zeilenenden, BOM, Kodierung ---------------------------------------------
put('bom', '﻿' + bpmn(), 'UTF-8-BOM vor der XML-Deklaration: zulässig, muss übergangen werden.');
put('bom-ohne-deklaration', '﻿' + bpmn({ decl: '' }), 'BOM ohne XML-Deklaration.');
put('kodierung-latin1', bpmn({ decl: '<?xml version="1.0" encoding="ISO-8859-1"?>\n', name1: 'Prüfen – größer' }),
  'Kodierungsangabe ISO-8859-1, aber die Eingabe ist ein JS-String: die Angabe darf keine Wirkung haben.');
put('kodierung-utf16', bpmn({ decl: '<?xml version="1.0" encoding="UTF-16"?>\n' }), 'Kodierungsangabe UTF-16 bei String-Eingabe.');
put('xml-1-1', bpmn({ decl: '<?xml version="1.1"?>\n' }), 'XML 1.1 in der Deklaration. Browser lesen es; die Frage ist, ob ein eigener Leser es annimmt.');
put('deklaration-nach-leerraum', '\n  ' + bpmn(), 'Leerraum vor der XML-Deklaration: nach XML 1.0 ein Fehler (die Deklaration muss ganz am Anfang stehen).');
put('ohne-deklaration', bpmn({ decl: '' }), 'Keine XML-Deklaration: zulässig.');
put('standalone', bpmn({ decl: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' }), 'standalone="yes".');

// --- CDATA, Kommentare, PI, DOCTYPE -----------------------------------------
put('cdata-text', bpmn({ note: '<![CDATA[A <b> & C\nzweite Zeile]]>' }), 'CDATA im Text der Anmerkung: wörtlich, ohne Entitätsauflösung.');
put('cdata-mit-leerraum', bpmn({ note: '\n      <![CDATA[Nur dieser Text]]>\n    ' }),
  'CDATA mit Leerraum davor und danach: ein DOM liefert den Leerraum mit (textContent), bpmn-moddle wirft reine Leerraum-Textknoten weg.');
put('cdata-und-text', bpmn({ note: 'vorher <![CDATA[mitten]]> nachher &amp; <![CDATA[]]>Ende' }), 'CDATA gemischt mit Text und Entitäten, auch ein leeres CDATA.');
put('cdata-mit-close-tag', bpmn({ note: '<![CDATA[</bpmn:definitions> <bpmn:task id="Falsch"/>]]>' }),
  'Ein schließendes definitions-Tag und ein Tag mit id in CDATA: appendDiagram() darf sie nicht als XML lesen.');
put('kommentare', bpmn({ before: '<!-- Kopf: <bpmn:task id="Kommentar_1"/> </bpmn:definitions> -->', inside: '    <!-- <bpmn:task id="Task_9" name="im Kommentar"/> -->\n    <!-- id="Kommentar_2" -->', note: 'Vorn<!-- weg -->Hinten', after: '  <!-- Fuß -->' }),
  'Kommentare vor dem Wurzelelement, zwischen Elementen, im Text: sie sind kein Inhalt; ein Tag im Kommentar ist kein Element, eine id darin keine ID.');
put('kommentar-doppelstrich', bpmn({ inside: '    <!-- a -- b -->' }), '"--" im Kommentar: nach XML 1.0 §2.5 verboten. Erwartung: Fehler.');
put('verarbeitungsanweisungen', bpmn({ before: '<?xml-stylesheet type="text/xsl" href="x.xsl"?>', inside: '    <?editor hint="x"?>', note: 'A<?pi hier?>B', after: '<?ende?>' }),
  'Verarbeitungsanweisungen vor der Wurzel, zwischen Elementen, im Text und nach der Wurzel: kein Inhalt.');
put('doctype-leer', bpmn({ before: '<!DOCTYPE definitions>' }), 'Ein DOCTYPE ohne internen Teil.');
put('doctype-intern', bpmn({ before: '<!DOCTYPE definitions [\n  <!ENTITY firma "ACME GmbH">\n  <!ENTITY stern "&#x2605;">\n]>', name1: '&firma; prüfen', note: 'Für &firma; &stern;' }),
  'Eigene Entitäten im internen DTD-Teil: Browser lösen sie auf (libxml2, expat), saxen nicht. Welches Verhalten das Paket wählt, ist zu entscheiden.');
put('doctype-extern', bpmn({ before: '<!DOCTYPE definitions [\n  <!ENTITY geheim SYSTEM "file:///etc/hostname">\n]>', name1: 'Inhalt: &geheim;' }),
  'Eine externe Entität (XXE): Kein Parser darf sie laden. Browser ersetzen sie durch nichts oder melden einen Fehler.');
put('doctype-extern-inhalt', bpmn({ before: '<!DOCTYPE definitions [\n  <!ENTITY geheim SYSTEM "file:///etc/hostname">\n]>', note: 'Inhalt: &geheim;' }),
  'Dieselbe externe Entität, im Text statt im Attribut verwiesen: Browser laden sie nicht; ob sie still verschwindet oder ein Fehler ist, ist zu messen.');
put('zeichenreferenz-cr', bpmn({ note: 'Zeile A&#13;&#10;Zeile B&#xD;Ende', name1: 'A&#13;B' }),
  '&#13; und &#xD; (Wagenrücklauf als Referenz): sie bleiben nach §2.11 erhalten, nur wörtliche \\r werden normalisiert.');
put('billion-laughs', bpmn({ before: '<!DOCTYPE definitions [\n  <!ENTITY l0 "lol">\n  <!ENTITY l1 "&l0;&l0;&l0;&l0;&l0;&l0;&l0;&l0;&l0;&l0;">\n  <!ENTITY l2 "&l1;&l1;&l1;&l1;&l1;&l1;&l1;&l1;&l1;&l1;">\n  <!ENTITY l3 "&l2;&l2;&l2;&l2;&l2;&l2;&l2;&l2;&l2;&l2;">\n  <!ENTITY l4 "&l3;&l3;&l3;&l3;&l3;&l3;&l3;&l3;&l3;&l3;">\n  <!ENTITY l5 "&l4;&l4;&l4;&l4;&l4;&l4;&l4;&l4;&l4;&l4;">\n  <!ENTITY l6 "&l5;&l5;&l5;&l5;&l5;&l5;&l5;&l5;&l5;&l5;">\n  <!ENTITY l7 "&l6;&l6;&l6;&l6;&l6;&l6;&l6;&l6;&l6;&l6;">\n  <!ENTITY l8 "&l7;&l7;&l7;&l7;&l7;&l7;&l7;&l7;&l7;&l7;">\n]>', note: '&l8;' }),
  'Verschachtelte Entitäten (10^8 × "lol", 300 MB): ein Parser, der Entitäten auflöst, braucht eine Grenze.');

// --- Namensräume ------------------------------------------------------------
put('praefix-bpmn2', bpmn({ p: 'bpmn2:', xmlns: ' xmlns:bpmn2="' + NS + '"' }), 'Präfix bpmn2: (Eclipse BPMN2 Modeler).');
put('praefix-ohne', bpmn({ p: '', xmlns: ' xmlns="' + NS + '"' }), 'Standard-Namensraum ohne Präfix.');
put('praefix-gemischt', bpmn({ xmlns: ' xmlns:bpmn="' + NS + '" xmlns:b2="' + NS + '" xmlns="' + NS + '"', inside: '    <b2:task id="Task_3" name="Mit anderem Präfix"/>\n    <sequenceFlow id="Flow_4" sourceRef="Task_1" targetRef="Task_3"/>\n    <b2:textAnnotation id="TextAnnotation_2"><text>Zweite Notiz</text></b2:textAnnotation>\n    <association id="Association_2" sourceRef="TextAnnotation_2" targetRef="Task_3"/>' }),
  'Drei Schreibweisen (bpmn:, b2:, ohne Präfix) desselben Namensraums in einer Datei.');
put('praefix-falscher-namensraum', bpmn({ xmlns: ' xmlns:bpmn="http://schema.omg.org/spec/BPMN/1.0"' }),
  'Präfix bpmn: an einen fremden Namensraum gebunden. readProcess() liest nur lokale Namen und nimmt es an; bpmn-js lehnt es ab. Ein Leser mit Namensräumen könnte warnen.');
put('praefix-nicht-deklariert', bpmn({ xmlns: '' }), 'Präfix bpmn: ohne Deklaration: nach Namespaces in XML ein Fehler. Chromium meldet ihn; was ein Leser ohne Namensräume tut, ist zu sehen.');
put('praefix-lokal-deklariert', bpmn({ xmlns: '', rootExtra: '', before: '', p: 'bpmn:', inside: '', after: '' }).replace('<bpmn:definitions', '<bpmn:definitions xmlns:bpmn="' + NS + '"').replace('<bpmn:process ', '<bpmn:process xmlns:bpmn="' + NS + '" '),
  'Der Namensraum am Prozess erneut deklariert (zulässig).');
put('praefix-xml-reserviert', bpmn({ inside: '    <bpmn:task id="Task_3" name="Bewahrt" xml:space="preserve"/>\n    <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_1" targetRef="Task_3"/>' }), 'Das reservierte Präfix xml: (xml:space) ohne Deklaration: zulässig.');
put('fremde-elemente', bpmn({ xmlns: ' xmlns:bpmn="' + NS + '" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:signavio="http://www.signavio.com"', inside: '    <bpmn:extensionElements><camunda:properties><camunda:property name="x" value="y"/></camunda:properties></bpmn:extensionElements>\n    <signavio:task id="Task_9" name="Fremd"/>\n    <bpmn:task id="Task_3" name="Mit Erweiterung"><bpmn:extensionElements><camunda:formData/></bpmn:extensionElements></bpmn:task>\n    <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_1" targetRef="Task_3"/>' }),
  'Fremde Elemente (camunda:, signavio:task): readProcess() liest ein signavio:task als Aufgabe, weil es nur den lokalen Namen sieht; bpmn-js nicht. Mit Namensräumen wäre das zu unterscheiden.');

// --- Leerraum in <text> ----------------------------------------------------
put('text-eingerueckt', bpmn({ note: '\n      Erste Zeile\n      Zweite Zeile\n    ' }), 'Schön formatierter Text mit Einrückung: wörtlich zu behalten (bpmn-js zeichnet ihn so).');
put('text-leer', bpmn({ note: '' }), 'Leeres <text></text>: die Anmerkung hat keinen Text und wird ausgelassen.');
put('text-nur-leerraum', bpmn({ note: '   \n\t  ' }), 'Nur Leerraum im Text: ebenfalls "has no text".');
put('text-selbstschliessend', bpmn({ textOpen: '<bpmn:text/>', textClose: '', note: '' }), 'Selbstschließendes <text/>.');
put('text-fehlt', bpmn({ textOpen: '', textClose: '', note: '' }), 'Eine textAnnotation ohne <text>-Kind.');
put('text-mit-kindelement', bpmn({ note: 'Vorn <b>fett</b> hinten' }), 'Ein Element im Text: textContent liefert "Vorn fett hinten"; bpmn-moddle kennt kein solches Kind.');
put('text-xml-space', bpmn({ textOpen: '<bpmn:text xml:space="preserve">', note: '  zwei  Leerzeichen  ' }), 'xml:space="preserve" (hat für ein DOM keine Wirkung).');
put('text-unicode', bpmn({ note: 'Übergröße — „Anführung“ 🙂  geschütztes Leerzeichen Zeilentrenner' }), 'Nicht-ASCII, geschütztes Leerzeichen, U+2028: wörtlich zu behalten; clean() (\\s) nimmt U+00A0 und U+2028 als Leerraum.');

// --- Nicht wohlgeformt -----------------------------------------------------
put('kaputt-tag-nicht-geschlossen', bpmn({ inside: '    <bpmn:task id="Task_3" name="offen">' }), 'Ein Element ohne schließendes Tag.');
put('kaputt-falsch-verschachtelt', bpmn({ inside: '    <bpmn:task id="Task_3"><bpmn:documentation>x</bpmn:task></bpmn:documentation>' }), 'Falsch verschachtelte Tags.');
put('kaputt-attribut-ohne-anfuehrung', bpmn({ inside: '    <bpmn:task id=Task_3 name="x"/>' }), 'Attributwert ohne Anführungszeichen.');
put('kaputt-attribut-doppelt', bpmn({ inside: '    <bpmn:task id="Task_3" name="a" name="b"/>' }), 'Dasselbe Attribut zweimal: nach XML 1.0 ein Wohlgeformtheitsfehler.');
put('kaputt-kleiner-im-text', bpmn({ note: 'a < b' }), 'Nacktes < im Text.');
put('kaputt-zwei-wurzeln', bpmn() + '<bpmn:definitions xmlns:bpmn="' + NS + '"/>\n', 'Zwei Wurzelelemente.');
put('kaputt-text-nach-wurzel', bpmn() + 'Nachwort\n', 'Text nach dem Wurzelelement.');
put('kaputt-steuerzeichen', bpmn({ note: 'Glocke\u0007 und \u0001' }), 'Steuerzeichen U+0007, U+0001 im Text: in XML 1.0 verboten.');
put('kaputt-wurzel-offen', bpmn({ closing: '' }), 'Das schließende definitions-Tag fehlt.');
put('kaputt-close-tag-mit-leerraum', bpmn({ closing: '</bpmn:definitions >' }), 'Leerraum im schließenden Tag vor >: zulässig (§3.1 ETag erlaubt S).');
put('kaputt-leer', '', 'Leere Eingabe.');
put('kaputt-nur-leerraum', '  \n\t', 'Nur Leerraum.');
put('kaputt-nur-deklaration', '<?xml version="1.0"?>\n', 'Nur eine Deklaration, kein Element.');
put('kaputt-tagname-ungueltig', bpmn({ inside: '    <bpmn:1task id="Task_3"/>' }), 'Elementname beginnt mit Ziffer.');
put('kein-definitions', '<html><body>Hallo</body></html>', 'Wohlgeformt, aber kein BPMN: readProcess() gibt null.');
put('definitions-ohne-inhalt', '<bpmn:definitions xmlns:bpmn="' + NS + '" id="D"/>', 'Leere definitions: readProcess() wirft LAYOUT_NOTHING.');

// --- IDs, Verweise ----------------------------------------------------------
put('ids-sonderzeichen', bpmn({ id1: 'Aufgabe.eins-ä_1', ref1: 'Aufgabe.eins-ä_1', id2: 'definitions', ref2: 'definitions' }), 'IDs mit Punkt, Bindestrich, Umlaut; eine ID "definitions".');
put('ids-doppelt', bpmn({ inside: '    <bpmn:task id="Task_1" name="Doppelgänger"/>' }), 'Dieselbe ID zweimal: ohne DTD kein Wohlgeformtheitsfehler; readProcess() liest beide.');
put('flowNodeRef-leerraum', bpmn({ ref1: '\n          Task_1\n        ', ref2: '\tTask_2 ' }), 'Leerraum um den Inhalt eines flowNodeRef: readProcess() trimmt ihn.');
put('attribut-id-mit-leerraum', bpmn({ inside: '    <bpmn:task id = "Task_3" name = "x"/>\n    <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_1" targetRef="Task_3"/>' }), 'Leerraum um das = eines Attributs: zulässig.');
put('leerraum-im-starttag', bpmn({ inside: '    <bpmn:task\tid="Task_3"\n\tname="x"\t/>\n    <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_1" targetRef="Task_3"/>' }), 'Tabulatoren und Zeilenumbrüche zwischen Attributen.');

// --- Groß -------------------------------------------------------------------
function gross(n){
  let inside = '';
  for (let i = 3; i <= n; i++) inside += '    <bpmn:task id="Task_' + i + '" name="Aufgabe ' + i + ' &amp; mehr"/>\n    <bpmn:sequenceFlow id="Flow_' + (i + 10) + '" sourceRef="Task_' + (i - 1) + '" targetRef="Task_' + i + '"/>\n';
  let refs = '';
  for (let i = 3; i <= n; i++) refs += '        <bpmn:flowNodeRef>Task_' + i + '</bpmn:flowNodeRef>\n';
  return bpmn({ inside: inside.replace(/\n$/, '') }).replace('        <bpmn:flowNodeRef>Task_2</bpmn:flowNodeRef>\n', '        <bpmn:flowNodeRef>Task_2</bpmn:flowNodeRef>\n' + refs);
}
put('gross-5000', gross(5000), 'Eine Kette aus 5000 Aufgaben (rund 700 KB): Geschwindigkeit und Tiefe der Rekursion.');

// --- Schreiben --------------------------------------------------------------
for (const f of fs.readdirSync(dir)) if (f.endsWith('.bpmn')) fs.unlinkSync(path.join(dir, f));
const index = ['# Korpus der heiklen Fälle', '', 'Erzeugt von `korpus-erzeugen.mjs`. Jede Datei ein Fall.', '', '| Datei | Was sie prüft |', '|---|---|'];
for (const [name, { text, what }] of Object.entries(cases)){
  fs.writeFileSync(path.join(dir, name + '.bpmn'), text);
  index.push('| `' + name + '.bpmn` | ' + what.replace(/\|/g, '\\|') + ' |');
}
fs.writeFileSync(path.join(dir, 'INDEX.md'), index.join('\n') + '\n');
console.log(Object.keys(cases).length + ' Fälle geschrieben nach ' + dir);
