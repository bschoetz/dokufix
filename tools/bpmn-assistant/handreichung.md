# BPMN für dokufix schreiben: Handreichung für LLMs

Stand: 2026-10-06, dokufix nach Story 2.29, Pools ohne eigenen Prozess (Black Box) und Nachrichtenflüsse an einem Pool (Layout `src/app/bpmn-layout.js`, Mermaid 12.0.0, bpmn-js 18.31.0).

Diese Handreichung sagt dir, welches BPMN-2.0-XML dokufix ohne Koordinaten zeichnet, was es weglässt und was es ablehnt. Halte dich an sie, wenn du auf Zuruf einen Prozess als BPMN in ein dokufix-Dokument schreibst.

## 1. Das Wichtigste in fünf Regeln

1. **Schreibe keine Koordinaten.** Kein `bpmndi:BPMNDiagram`, kein `BPMNShape`, kein `BPMNEdge`. dokufix ordnet das Diagramm selbst an. Geratene Koordinaten erzeugen Pfeile, die im Leeren beginnen und enden.
2. **Ein Pool je Beteiligtem, eine Bahn je Rolle.** Arbeiten Rollen einer Organisation zusammen, sind sie Bahnen (`lane`) eines Pools. Tauschen eigenständige Beteiligte Nachrichten aus (Kunde und Firma, Firma und Lieferant), bekommt jeder einen eigenen Pool (`participant`). Kennst du den Ablauf eines Beteiligten, bekommt sein Pool einen eigenen `process`; kennst du ihn nicht, ist sein Pool eine Black Box: ein `participant` ohne `processRef`.
3. **Mit Bahnen: jeder Knoten in genau einer Bahn.** Gibt es ein `laneSet`, muss jeder Flussknoten in einer `flowNodeRef` stehen. Sonst lehnt dokufix das Diagramm ab.
4. **Jede Verzweigung über ein Gateway.** Eine Aufgabe oder ein Ereignis hat genau einen ausgehenden Sequenzfluss.
5. **Flussknoten, Sequenzflüsse und Nachrichtenflüsse tragen den Ablauf.** Ein Sequenzfluss bleibt in seinem Pool; zwischen Pools läuft nur ein Nachrichtenfluss (`messageFlow`), von einem Flussknoten oder einem Pool zu einem Flussknoten oder Pool eines anderen Pools. Datenobjekte lässt dokufix weg (Abschnitt 4), Notizen zeichnet es neben ihr Ziel (Abschnitt 3). Baue nichts, was ohne Datenobjekte unverständlich wird.

## 2. So steht BPMN im Dokument

Das XML steht in einem eingezäunten Block mit der Sprache `bpmn`:

````markdown
## Urlaubsantrag

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions …>
  …
</bpmn:definitions>
```
````

- **Titel:** Der Titel des Diagramms ist die letzte Überschrift vor dem Block. Setze deshalb eine passende Überschrift direkt davor.
- **Name:** Gib `bpmn:definitions` ein Attribut `name` mit dem Namen des Ablaufs, etwa `name="Urlaubsantrag"`. Es benennt das ganze Modell, gleich ob mit Pools oder ohne, und gibt einer heruntergeladenen Datei ihren Namen.
- **Ein Diagramm je Block:** Zusammenhängende Pools mit ihren Nachrichtenflüssen stehen in einem Block. Voneinander unabhängige Abläufe schreibst du als mehrere Blöcke, jeden unter einer eigenen Überschrift.
- **Mit Koordinaten:** XML, das bereits ein `BPMNShape` enthält, zeichnet dokufix unverändert so, wie es ist. Dann gelten die Grenzen dieser Handreichung nicht. Schreibe Koordinaten trotzdem nur, wenn sie aus einem echten Modellierwerkzeug stammen, nie selbst gerechnet und nie nur für einen Teil der Elemente.

## 3. Was dokufix anordnet und zeichnet

| Struktur | XML-Elemente | Hinweise |
|---|---|---|
| Pool | ein `bpmn:collaboration` mit einem `bpmn:participant processRef="…"` | optional; ohne Teilnehmer gibt es keinen Pool-Rahmen |
| mehrere Pools | ein `bpmn:collaboration` mit einem `bpmn:participant` je Beteiligtem, mit `processRef` auf seinen eigenen `bpmn:process` | untereinander in der Reihenfolge der `participant`, mit Abstand; jeder Pool mit eigenen Bahnen oder ohne |
| Pool ohne eigenen Prozess (Black Box) | `bpmn:participant` ohne `processRef` | ein schmaler Rahmen ohne Bahnen, so breit wie die anderen Pools, an seinem Platz in der Reihenfolge der `participant`; mindestens ein Pool braucht einen Prozess |
| Nachrichtenfluss | `bpmn:messageFlow sourceRef="…" targetRef="…"` im `collaboration` | zwischen zwei Pools; jedes Ende ein Flussknoten oder die `id` eines `participant`; gestrichelt, senkrecht, an einem Pool bis an seinen Rand; `name` als Beschriftung |
| Bahnen | `bpmn:laneSet` mit `bpmn:lane` und `bpmn:flowNodeRef` | Reihenfolge im `laneSet` = von oben nach unten; eine leere Bahn ist erlaubt und wird gezeichnet |
| verschachtelte Bahnen | `bpmn:lane` mit `bpmn:childLaneSet` | nur die inneren Bahnen werden gezeichnet, die äußere nicht; besser vermeiden |
| ohne Bahnen | Prozess ohne `laneSet` | erlaubt; alle Knoten stehen in einer Bahn ohne Rahmen, mit Teilnehmer im Pool |
| Startereignis | `bpmn:startEvent` | mit oder ohne Definition (Zeit, Nachricht, Signal …) |
| Endereignis | `bpmn:endEvent` | auch `terminateEventDefinition`, `errorEventDefinition` usw. |
| Zwischenereignis | `bpmn:intermediateCatchEvent`, `bpmn:intermediateThrowEvent` | Zeit, Nachricht, Signal, Bedingung, Eskalation, Link; die Markierung zeichnet bpmn-js |
| Aufgabe | `bpmn:task`, `userTask`, `manualTask`, `serviceTask`, `sendTask`, `receiveTask`, `scriptTask`, `businessRuleTask` | jede Art mit ihrem Symbol |
| Aufruf | `bpmn:callActivity` | als Aufgabe angeordnet |
| Teilprozess | `bpmn:subProcess`, `adHocSubProcess`, `transaction` | als **ein** Symbol, zugeklappt; sein Inhalt wird nicht angeordnet |
| angeheftetes Ereignis | `bpmn:boundaryEvent attachedToRef="…"` mit Definition (Zeit, Fehler, Eskalation, Nachricht …) | auf der Unterkante seiner Aufgabe oder seines Teilprozesses; unterbrechend, mit `cancelActivity="false"` nicht (gestrichelt); mehrere an einer Aufgabe nebeneinander; der Ausnahmepfad steht eine Zeile darunter; Sequenzflüsse gehen von ihm aus, nie hinein |
| Gateway | `exclusiveGateway`, `parallelGateway`, `inclusiveGateway`, `eventBasedGateway`, `complexGateway` | jede Art; ein Gateway darf in jeder Bahn liegen |
| Sequenzfluss | `bpmn:sequenceFlow sourceRef="…" targetRef="…"` | `name` wird als Beschriftung gezeichnet; Rückflüsse (Schleifen) sind erlaubt |
| Notiz | `bpmn:textAnnotation` mit `<bpmn:text>…</bpmn:text>` und eine `bpmn:association` von oder zu ihr, im `process` oder im `collaboration` | Ziel: ein Flussknoten, ein angeheftetes Ereignis, ein Sequenz- oder Nachrichtenfluss oder ein `participant`; die Notiz steht neben ihrem Ziel, möglichst rechts davon, die Assoziation gepunktet; eine Notiz an einem Pool rechts neben dem Pool; Zeilenumbrüche im Text bleiben; kurze Notizen lesen sich am besten |
| Namen | Attribut `name` | Leerraum wird zusammengezogen; ein Label ist bis 90 px breit, kurze Namen lesen sich am besten |

Nicht nötig, aber unschädlich: `bpmn:incoming` und `bpmn:outgoing` in den Knoten (dokufix liest die Flüsse aus `sourceRef` und `targetRef`), `conditionExpression`, `documentation`, `isExecutable`, eigene Präfixe oder ein Standard-Namensraum ohne Präfix.

## 4. Was dokufix weglässt (das Diagramm erscheint ohne sie)

| Element | Folge |
|---|---|
| `bpmn:boundaryEvent` an etwas, das keine Aufgabe und kein Teilprozess ist | fehlt samt seinen Flüssen |
| Sequenzfluss in ein angeheftetes Ereignis, Nachrichtenfluss an einem | fehlt |
| `bpmn:dataObject`, `dataObjectReference`, `dataStoreReference` | fehlen |
| `dataInputAssociation`, `dataOutputAssociation` | fehlen |
| `bpmn:textAnnotation` ohne Text oder ohne `association` | fehlt |
| `bpmn:association` ohne Notiz an einem Ende | fehlt, etwa zwischen zwei Flussknoten (Signal-Wurf → Signal-Fang) oder zu einer Kompensationsaktivität |
| `bpmn:group` | fehlt |
| `participant` ohne `id` | fehlt samt den Nachrichtenflüssen zu ihm; mit Prozess wird der Prozess ohne Pool-Rahmen gezeichnet |
| `bpmn:messageFlow` innerhalb eines Pools | fehlt |
| Inhalt eines Teilprozesses | fehlt; der Teilprozess steht als ein Symbol |
| äußere Bahn verschachtelter Bahnen | fehlt; ihre inneren Bahnen stehen |
| Sequenzfluss von einem Knoten zu sich selbst | fehlt |
| Element oder Fluss ohne `id` | fehlt |
| Fluss, der an einem weggelassenen Element hängt | fehlt |

Daraus folgt für dein Modell:
- **Zeitüberschreitung oder Fehler an einer Aufgabe:** ein angeheftetes Ereignis an der Aufgabe (`boundaryEvent` mit `timerEventDefinition` oder `errorEventDefinition`), von dem der Ausnahmepfad ausgeht; soll die Aufgabe weiterlaufen, mit `cancelActivity="false"`. Eine Nachricht von einem anderen Pool empfängt besser eine Aufgabe oder ein Zwischenereignis als ein angeheftetes Ereignis: einen Nachrichtenfluss an einem angehefteten Ereignis lässt dokufix noch weg.
- **Nachricht zwischen Beteiligten:** ein Nachrichtenfluss von der sendenden Aufgabe (`sendTask`) oder dem sendenden Ereignis zur empfangenden (`receiveTask`, Nachrichten-Start- oder Zwischenereignis) im anderen Pool. Einen Beteiligten, dessen Ablauf du nicht kennst, gib als Black Box an: ein `participant` ohne `processRef`; die Nachrichtenflüsse zu ihm und von ihm haben seine `id` als `targetRef` oder `sourceRef`. Erfinde für ihn keinen Ablauf.
- **Signal zwischen Rollen eines Pools:** Wurf und Fang als Zwischenereignisse mit gleichem Namen, keine Linie dazwischen. Ein Nachrichtenfluss innerhalb eines Pools ist kein gültiges BPMN.
- **Hinweise zu einem Schritt:** eine kurze Notiz an ihm (`textAnnotation` mit `association`), etwa eine Frist oder eine Rechtsgrundlage; längere Erklärungen in den Text des Dokuments.
- **Daten:** in den Text des Dokuments, nicht ins Diagramm.

## 5. Was dokufix ablehnt (statt des Diagramms erscheint eine Warnung)

| Fall | Meldung |
|---|---|
| kein Flussknoten, oder nur Pools ohne eigenen Prozess | „Das BPMN-XML enthält kein Element, das sich anordnen lässt.“ |
| Bahnen vorhanden, aber ein Knoten in keiner Bahn | „Diese Elemente liegen in keiner Bahn: …“ |
| XML nicht lesbar, oder die Wurzel ist nicht `definitions` | Warnung mit dem Grund |

Der Rest des Dokuments und alle anderen Diagramme werden trotzdem gezeichnet.

Mehrere Prozesse ohne `collaboration` lehnt dokufix nicht ab: Es zeichnet jeden als Pool, untereinander, und fügt dafür eine `collaboration` mit einem `participant` je Prozess ins XML ein, benannt wie der Prozess. Schreibe die `collaboration` besser selbst, dann stehen die Namen der Pools fest.

## 6. Modellierregeln (gültiges BPMN)

dokufix prüft diese Regeln nicht, aber ein Diagramm, das sie bricht, ist falsches BPMN und wird schlechter angeordnet. Sie entsprechen `bpmnlint` (Empfehlungen) mit den Lockerungen, die für dokufix gelten.

1. **Ein Startereignis**, jeder Pfad endet in einem **Endereignis**. Kein Knoten ohne Ausgang außer Endereignissen.
2. **Keine implizite Verzweigung:** Eine Aufgabe oder ein Ereignis hat genau einen ausgehenden Fluss. Für mehrere Wege steht ein Gateway dahinter.
3. **Ein Gateway verzweigt oder führt zusammen, nie beides.** Für beides zwei Gateways hintereinander.
4. **Ein paralleler Split wird von einem parallelen Join geschlossen**, mit so vielen Eingängen wie der Split Ausgänge hat. Ein paralleler Join liegt nie auf einer Schleife.
5. **Keine zwei Flüsse zwischen demselben Paar** von Knoten.
6. **Nachrichtenflüsse nur zwischen Pools.** Ein Sequenzfluss verlässt seinen Pool nie; ein Nachrichtenfluss verbindet zwei verschiedene Pools, jedes Ende ein Flussknoten oder, bei einer Black Box, der `participant` selbst. Jeder Pool hat seinen eigenen Start und sein eigenes Ende; ein Prozess, der durch eine Nachricht beginnt, beginnt mit einem Nachrichten-Startereignis.
7. **Eindeutige `id`s** für jedes Element, über alle Pools hinweg.
8. **Schleifen** führen über ein exklusives Gateway zurück: entweder zu einem zusammenführenden Gateway vor dem Ziel (empfohlen) oder direkt zu einer Aufgabe. Mehrere Eingänge in eine Aufgabe sind erlaubt, ein Gateway davor liest sich klarer.
9. **Beschriftung:**
   - Aufgaben mit Verb und Objekt („Antrag prüfen“),
   - Ereignisse als Zustand („Antrag eingegangen“),
   - verzweigende exklusive Gateways als Frage („Genehmigt?“),
   - ihre ausgehenden Flüsse mit den Antworten („ja“, „nein“).
   - Zusammenführende und parallele Gateways brauchen keinen Namen.
   - Nachrichtenflüsse mit dem, was übergeben wird („Anfrage“, „Angebot“).

## 7. Für eine gute Anordnung

- **Reihenfolge:** Schreibe die Knoten und die Flüsse in der Reihenfolge des Ablaufs, den Hauptweg zuerst. Die Reihenfolge im XML beeinflusst die Anordnung, etwa welcher Fluss als Rückfluss gilt.
- **Gateways:** Lege ein Gateway in die Bahn des Knotens davor, also der Rolle, die die Entscheidung trifft oder den Ablauf teilt.
- **Kurze Namen:** drei bis fünf Wörter. Lange Namen werden mehrzeilig und machen das Diagramm hoch.
- **Größe:** Erprobt ist dokufix bis etwa 55 Flussknoten in fünf Bahnen. Größere Prozesse teilst du in mehrere Diagramme (Überblick plus Teilprozesse, je ein Block).
- **Bahnen:** eine Bahn je Rolle, so wenige wie nötig. Knoten einer Rolle stehen in ihrer Bahn.
- **Notizen:** kurz, ein Gedanke je Notiz, an dem Schritt, Fluss oder Pool, den sie betrifft; zwei oder drei je Diagramm lesen sich gut, mehr drängen sich. Der Text steht in `<bpmn:text>` am besten in einer Zeile, ohne Einrückung: dokufix und bpmn-js zeichnen ihn so, wie er dasteht.
- **Pools:** Die Reihenfolge der `participant` ist die Reihenfolge der Pools von oben nach unten, Black Boxes eingeschlossen. Lege Beteiligte, die viele Nachrichten tauschen, nebeneinander in diese Reihenfolge; eine Black Box, die nur mit einem Pool spricht, direkt über oder unter ihn (den Kunden meist oben, einen Lieferanten unten). Ein Nachrichtenfluss an einer Black Box läuft senkrecht vom Flussknoten bis an ihren Rand. Der Empfänger einer Nachricht steht frühestens in der Spalte des Senders, also direkt darunter oder darüber oder weiter rechts; schreibe Senden und Empfangen in beiden Prozessen an der passenden Stelle des Ablaufs.

## 8. Vorlagen

Drei vollständige, gültige Beispiele. Alle sind geprüft: bpmnlint ohne Fehler und Warnung, von dokufix ohne Bruch gezeichnet.

### Ein Pool mit Bahnen, einer Schleife, einem parallelen Block und zwei Notizen

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_Urlaub" name="Urlaubsantrag" targetNamespace="http://example.org/dokufix">
  <bpmn:collaboration id="Collaboration_Urlaub">
    <bpmn:participant id="Pool_Urlaub" name="Urlaubsantrag" processRef="Process_Urlaub"/>
  </bpmn:collaboration>
  <bpmn:process id="Process_Urlaub" isExecutable="false">
    <bpmn:laneSet id="LaneSet_Urlaub">
      <bpmn:lane id="Lane_MA" name="Mitarbeiterin">
        <bpmn:flowNodeRef>Start_Geplant</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Stellen</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Ueberarbeiten</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Vertretung</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_TL" name="Teamleitung">
        <bpmn:flowNodeRef>Gateway_Merge</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Pruefen</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Gateway_Genehmigt</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Gateway_Split</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_PA" name="Personalabteilung">
        <bpmn:flowNodeRef>Task_Eintragen</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Gateway_Join</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>End_Genehmigt</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start_Geplant" name="Urlaub geplant"/>
    <bpmn:userTask id="Task_Stellen" name="Antrag stellen"/>
    <bpmn:exclusiveGateway id="Gateway_Merge"/>
    <bpmn:userTask id="Task_Pruefen" name="Antrag prüfen"/>
    <bpmn:exclusiveGateway id="Gateway_Genehmigt" name="Genehmigt?"/>
    <bpmn:userTask id="Task_Ueberarbeiten" name="Antrag überarbeiten"/>
    <bpmn:parallelGateway id="Gateway_Split"/>
    <bpmn:serviceTask id="Task_Eintragen" name="Urlaub eintragen"/>
    <bpmn:sendTask id="Task_Vertretung" name="Vertretung informieren"/>
    <bpmn:parallelGateway id="Gateway_Join"/>
    <bpmn:endEvent id="End_Genehmigt" name="Urlaub genehmigt"/>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_Geplant" targetRef="Task_Stellen"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_Stellen" targetRef="Gateway_Merge"/>
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Gateway_Merge" targetRef="Task_Pruefen"/>
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_Pruefen" targetRef="Gateway_Genehmigt"/>
    <bpmn:sequenceFlow id="Flow_5" name="ja" sourceRef="Gateway_Genehmigt" targetRef="Gateway_Split"/>
    <bpmn:sequenceFlow id="Flow_6" name="nein" sourceRef="Gateway_Genehmigt" targetRef="Task_Ueberarbeiten"/>
    <bpmn:sequenceFlow id="Flow_7" sourceRef="Task_Ueberarbeiten" targetRef="Gateway_Merge"/>
    <bpmn:sequenceFlow id="Flow_8" sourceRef="Gateway_Split" targetRef="Task_Eintragen"/>
    <bpmn:sequenceFlow id="Flow_9" sourceRef="Gateway_Split" targetRef="Task_Vertretung"/>
    <bpmn:sequenceFlow id="Flow_10" sourceRef="Task_Eintragen" targetRef="Gateway_Join"/>
    <bpmn:sequenceFlow id="Flow_11" sourceRef="Task_Vertretung" targetRef="Gateway_Join"/>
    <bpmn:sequenceFlow id="Flow_12" sourceRef="Gateway_Join" targetRef="End_Genehmigt"/>
    <bpmn:textAnnotation id="Notiz_Pruefen"><bpmn:text>Spätestens nach drei Arbeitstagen</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="Assoc_Pruefen" sourceRef="Task_Pruefen" targetRef="Notiz_Pruefen"/>
    <bpmn:textAnnotation id="Notiz_Nein"><bpmn:text>Mit Begründung</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="Assoc_Nein" sourceRef="Flow_6" targetRef="Notiz_Nein"/>
  </bpmn:process>
</bpmn:definitions>
```

### Zwei Pools mit Nachrichtenflüssen

Kunde und Firma als zwei Pools; die Firma mit zwei Bahnen; drei Nachrichtenflüsse, Antwort oder Absage über ein ereignisbasiertes Gateway beim Kunden.

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_Angebot" name="Angebot" targetNamespace="http://example.org/dokufix">
  <bpmn:collaboration id="Collaboration_Angebot">
    <bpmn:participant id="Pool_Kunde" name="Kunde" processRef="Process_Kunde"/>
    <bpmn:participant id="Pool_Firma" name="Firma" processRef="Process_Firma"/>
    <bpmn:messageFlow id="Message_Anfrage" name="Anfrage" sourceRef="Task_Anfragen" targetRef="Start_Anfrage"/>
    <bpmn:messageFlow id="Message_Angebot" name="Angebot" sourceRef="Task_Senden" targetRef="Event_Angebot"/>
    <bpmn:messageFlow id="Message_Absage" name="Absage" sourceRef="End_Absage" targetRef="Event_Absage"/>
  </bpmn:collaboration>
  <bpmn:process id="Process_Kunde" isExecutable="false">
    <bpmn:startEvent id="Start_Bedarf" name="Bedarf erkannt"/>
    <bpmn:sendTask id="Task_Anfragen" name="Angebot anfragen"/>
    <bpmn:eventBasedGateway id="Gateway_Antwort"/>
    <bpmn:intermediateCatchEvent id="Event_Angebot" name="Angebot erhalten"><bpmn:messageEventDefinition id="Def_Angebot"/></bpmn:intermediateCatchEvent>
    <bpmn:intermediateCatchEvent id="Event_Absage" name="Absage erhalten"><bpmn:messageEventDefinition id="Def_Absage"/></bpmn:intermediateCatchEvent>
    <bpmn:userTask id="Task_Pruefen_Kunde" name="Angebot prüfen"/>
    <bpmn:endEvent id="End_Kunde_Angebot" name="Angebot liegt vor"/>
    <bpmn:endEvent id="End_Kunde_Absage" name="Anderswo anfragen"/>
    <bpmn:sequenceFlow id="Flow_K1" sourceRef="Start_Bedarf" targetRef="Task_Anfragen"/>
    <bpmn:sequenceFlow id="Flow_K2" sourceRef="Task_Anfragen" targetRef="Gateway_Antwort"/>
    <bpmn:sequenceFlow id="Flow_K3" sourceRef="Gateway_Antwort" targetRef="Event_Angebot"/>
    <bpmn:sequenceFlow id="Flow_K4" sourceRef="Gateway_Antwort" targetRef="Event_Absage"/>
    <bpmn:sequenceFlow id="Flow_K5" sourceRef="Event_Angebot" targetRef="Task_Pruefen_Kunde"/>
    <bpmn:sequenceFlow id="Flow_K6" sourceRef="Task_Pruefen_Kunde" targetRef="End_Kunde_Angebot"/>
    <bpmn:sequenceFlow id="Flow_K7" sourceRef="Event_Absage" targetRef="End_Kunde_Absage"/>
  </bpmn:process>
  <bpmn:process id="Process_Firma" isExecutable="false">
    <bpmn:laneSet id="LaneSet_Firma">
      <bpmn:lane id="Lane_Vertrieb" name="Vertrieb">
        <bpmn:flowNodeRef>Start_Anfrage</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Pruefen</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Gateway_Machbar</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Senden</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>End_Gesendet</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>End_Absage</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_Technik" name="Technik">
        <bpmn:flowNodeRef>Task_Kalkulieren</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start_Anfrage" name="Anfrage eingegangen"><bpmn:messageEventDefinition id="Def_Anfrage"/></bpmn:startEvent>
    <bpmn:userTask id="Task_Pruefen" name="Anfrage prüfen"/>
    <bpmn:exclusiveGateway id="Gateway_Machbar" name="Lieferbar?"/>
    <bpmn:userTask id="Task_Kalkulieren" name="Preis kalkulieren"/>
    <bpmn:sendTask id="Task_Senden" name="Angebot senden"/>
    <bpmn:endEvent id="End_Gesendet" name="Angebot gesendet"/>
    <bpmn:endEvent id="End_Absage" name="Absage gesendet"><bpmn:messageEventDefinition id="Def_Absage_Senden"/></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_F1" sourceRef="Start_Anfrage" targetRef="Task_Pruefen"/>
    <bpmn:sequenceFlow id="Flow_F2" sourceRef="Task_Pruefen" targetRef="Gateway_Machbar"/>
    <bpmn:sequenceFlow id="Flow_F3" name="ja" sourceRef="Gateway_Machbar" targetRef="Task_Kalkulieren"/>
    <bpmn:sequenceFlow id="Flow_F4" name="nein" sourceRef="Gateway_Machbar" targetRef="End_Absage"/>
    <bpmn:sequenceFlow id="Flow_F5" sourceRef="Task_Kalkulieren" targetRef="Task_Senden"/>
    <bpmn:sequenceFlow id="Flow_F6" sourceRef="Task_Senden" targetRef="End_Gesendet"/>
  </bpmn:process>
</bpmn:definitions>
```

### Ein Pool mit zwei Black Boxes

Der Onlineshop mit zwei Bahnen; Kunde und Paketdienst als Black Boxes, weil ihr Ablauf unbekannt ist: der Kunde oben, der Paketdienst unten. Vier Nachrichtenflüsse, jeder zwischen einem Flussknoten des Shops und dem Rahmen einer Black Box.

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_Bestellung" name="Bestellung" targetNamespace="http://example.org/dokufix">
  <bpmn:collaboration id="Collaboration_Bestellung">
    <bpmn:participant id="Pool_Kunde" name="Kunde"/>
    <bpmn:participant id="Pool_Shop" name="Onlineshop" processRef="Process_Shop"/>
    <bpmn:participant id="Pool_Paketdienst" name="Paketdienst"/>
    <bpmn:messageFlow id="Message_Bestellung" name="Bestellung" sourceRef="Pool_Kunde" targetRef="Start_Bestellung"/>
    <bpmn:messageFlow id="Message_Absage" name="Absage" sourceRef="Task_Absagen" targetRef="Pool_Kunde"/>
    <bpmn:messageFlow id="Message_Bestaetigung" name="Bestätigung" sourceRef="Task_Bestaetigen" targetRef="Pool_Kunde"/>
    <bpmn:messageFlow id="Message_Paket" name="Paket" sourceRef="Task_Uebergeben" targetRef="Pool_Paketdienst"/>
  </bpmn:collaboration>
  <bpmn:process id="Process_Shop" isExecutable="false">
    <bpmn:laneSet id="LaneSet_Shop">
      <bpmn:lane id="Lane_Vertrieb" name="Vertrieb">
        <bpmn:flowNodeRef>Start_Bestellung</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Pruefen</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Gateway_Lieferbar</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Absagen</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>End_Abgesagt</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Bestaetigen</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_Lager" name="Lager">
        <bpmn:flowNodeRef>Task_Verpacken</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Uebergeben</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>End_Versandt</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start_Bestellung" name="Bestellung eingegangen"><bpmn:messageEventDefinition id="Def_Bestellung"/></bpmn:startEvent>
    <bpmn:userTask id="Task_Pruefen" name="Bestellung prüfen"/>
    <bpmn:exclusiveGateway id="Gateway_Lieferbar" name="Lieferbar?"/>
    <bpmn:sendTask id="Task_Bestaetigen" name="Bestellung bestätigen"/>
    <bpmn:manualTask id="Task_Verpacken" name="Ware verpacken"/>
    <bpmn:sendTask id="Task_Uebergeben" name="Paket übergeben"/>
    <bpmn:endEvent id="End_Versandt" name="Ware versandt"/>
    <bpmn:sendTask id="Task_Absagen" name="Absage senden"/>
    <bpmn:endEvent id="End_Abgesagt" name="Abgesagt"/>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_Bestellung" targetRef="Task_Pruefen"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_Pruefen" targetRef="Gateway_Lieferbar"/>
    <bpmn:sequenceFlow id="Flow_3" name="ja" sourceRef="Gateway_Lieferbar" targetRef="Task_Bestaetigen"/>
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_Bestaetigen" targetRef="Task_Verpacken"/>
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Task_Verpacken" targetRef="Task_Uebergeben"/>
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Task_Uebergeben" targetRef="End_Versandt"/>
    <bpmn:sequenceFlow id="Flow_7" name="nein" sourceRef="Gateway_Lieferbar" targetRef="Task_Absagen"/>
    <bpmn:sequenceFlow id="Flow_8" sourceRef="Task_Absagen" targetRef="End_Abgesagt"/>
  </bpmn:process>
</bpmn:definitions>
```

## 9. Prüfliste vor der Ausgabe

- [ ] Kein `BPMNDiagram`, kein `BPMNShape`, kein `BPMNEdge`.
- [ ] Ein `participant` je Pool; mit `processRef` auf seinen eigenen `process` mit Inhalt, oder ohne `processRef` als Black Box, wenn sein Ablauf unbekannt ist; mindestens ein Pool mit Prozess.
- [ ] Jeder Flussknoten hat eine eindeutige `id` und, wo es Bahnen gibt, genau eine `flowNodeRef`.
- [ ] Jeder Fluss hat `id`, `sourceRef` und `targetRef`, die auf vorhandene Flussknoten zeigen.
- [ ] Sequenzflüsse bleiben in ihrem Pool; jeder Nachrichtenfluss verbindet zwei verschiedene Pools, an einer Black Box mit ihrer `participant`-`id`.
- [ ] Je Pool ein Start, jeder Pfad endet in einem Ende.
- [ ] Jede Verzweigung über ein Gateway; kein Gateway verzweigt und führt zugleich zusammen.
- [ ] Jeder parallele Split hat seinen parallelen Join.
- [ ] Keine Datenobjekte oder Gruppen, auf die der Ablauf angewiesen ist; jede Notiz mit Text und einer Assoziation zu ihrem Ziel; jedes angeheftete Ereignis an einer Aufgabe oder einem Teilprozess, kein Fluss hinein, kein Nachrichtenfluss an ihm.
- [ ] Eine Überschrift direkt vor dem Block nennt den Prozess.
