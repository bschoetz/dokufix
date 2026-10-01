# Kisten-Prozesse

Hof Sonnenfeld · frei erfundenes Beispiel · Stand 1. Oktober 2026

## Einstieg

### Wie ein Kunde zum Hof findet

Es gibt zwei Wege, auf denen jemand von der Website zu uns kommt. Er bestellt eine Probekiste, oder er fragt ein Abo an. Diese Seite beschreibt beide Wege vollständig: was passiert, welches System es tut, und wer auf dem Hof etwas davon mitbekommt.

<!-- dokufix: cards -->
- **Weg A · Abo-Anfrage**\
  Jemand will regelmäßig beliefert werden. Die Anfrage geht sofort an die Tourenplanung und zusätzlich zur Ablage in die Kundenkartei.
- **Weg B · Probekiste**\
  Jemand will erst einmal probieren. Daraus wird erst dann ein Abo, wenn er selbst darum bittet.

#### Die beiden Systeme

| System | Wofür | Wie lange |
|---|---|---|
| **Bestellformular**<br>*auf der Website* | Die Abo-Anfrage, die Zustellung an die Tourenplanung und die Verteilung auf die Touren | bleibt |
| **Kundenkartei** | Die Probekisten-Bestellungen, die Ablage aller Kunden, die Merkmale und die automatischen Abläufe | `⚪ Übergangslösung`<br>bis die Warenwirtschaft steht |

> [!NOTE]
> **Der Grundsatz dahinter:** Eine Probekiste sagt, dass jemand neugierig ist. Sie sagt nicht, dass jemand jede Woche Gemüse will. Deshalb geht eine Probekiste nicht in die feste Tourenplanung, eine Abo-Anfrage schon.

#### Stand der fünf Prozesse

| Nr | Prozess | Auslöser | Stand |
|---|---|---|---|
| 1 | Probekiste | Besucher bestellt eine Probekiste | `🟢 in Betrieb` |
| 2 | Abo-Anfrage | Besucher sendet das Abo-Formular | `🟢 in Betrieb` |
| 3 | Erinnerungsmails | Probekunde mit Erlaubnis für Erinnerungen | `🟡 geplant` |
| 4 | Übergabe an die Tourenplanung | Reaktion auf eine Erinnerung | `🟡 teilweise` |
| 5 | Löschroutine | fester Termin je Quartal | `🟡 geplant` |

## Die fünf Prozesse

### Probekiste `🟢 in Betrieb`

Vier Kistenarten, vier Bestellseiten, ein Ablauf. Niemand auf dem Hof muss eingreifen, bis die Kiste gepackt wird.

<!-- dokufix: bpmn "Probekiste" -->
```mermaid
swimlane-beta LR
  accTitle: Ablaufdiagramm Probekiste mit vier Bahnen
  subgraph Kunde
    s((Probekiste<br>entdeckt))
    a[Bestellung ausfüllen<br>und absenden]
    c[Bestellung per Link<br>bestätigen]
    e(((Probekiste<br>erhalten)))
  end
  subgraph Website
    b[Bestätigungsmail senden<br>eine Vorlage für alle]
    g[Lieferauftrag an<br>die nächste Tour]
  end
  subgraph Kundenkartei
    d[Kunde anlegen<br>oder ergänzen]
    f[Kistenart, Datum<br>und Status eintragen]
    x{Erinnerungen<br>erlaubt?}
    n(((Einmalkunde, keine<br>Erinnerung)))
  end
  subgraph Hofbüro
    h[Erinnerungsmails<br>3 Mails, 3 Wochen]:::geplant
    y{Reaktion?}
    i[Übergabe an die<br>Tourenplanung, Prozess 2]:::geplant
    z(((Mails beendet,<br>bleibt erreichbar)))
  end
  s --> a
  a --> b
  b -. Bestätigungsmail .-> c
  c --> d
  d --> f
  d --> g
  g --> e
  f --> x
  x -- nein --> n
  x -- ja --> h
  h --> y
  y -- ja --> i
  y -- nein --> z
```

<!-- dokufix: steps -->
1. *Kunde:* Füllt die Bestellseite aus: Name, Adresse, E-Mail, Kistenart. Das Pflicht-Häkchen gilt der Lieferung, das zweite Häkchen erlaubt freiwillig spätere Erinnerungen.
2. *Website:* Verschickt die Bestätigungsmail aus der Vorlage `Bestätigung 2026`. Dieselbe Vorlage für alle vier Kistenarten, sie nennt noch keinen Liefertag.
3. *Kunde:* Klickt den Link in der Mail. Damit ist die Adresse nachweislich seine.
4. *Kundenkartei:* Legt den Kunden an oder ergänzt einen bestehenden und trägt ihn in die Liste `Probekunden` ein.
5. *Website:* Gibt den Lieferauftrag an die nächste passende Tour. Das ist die Auslieferung.
6. *Kundenkartei:* Der zugehörige Ablauf vermerkt, welche Kiste bestellt wurde, wann, und setzt den Status auf `PROBE`.

#### Danach trennen sich die Wege

<!-- dokufix: cards -->
- **Mit Erlaubnis**\
  Der Kunde bekommt später die Erinnerungsmails.
- **Ohne Erlaubnis**\
  Keine weitere Post. Der Kunde bleibt in der Kartei, er wird weder angeschrieben noch angerufen.

> [!WARNING]
> **Was heute nicht passiert:** Eine Probekiste löst keine Nachricht ans Hofbüro aus. Wer wissen will, wie viele bestellt wurden, schaut in die Liste `Probekunden`.

### Abo-Anfrage `🟢 in Betrieb`

Jemand möchte regelmäßig beliefert werden. Das kann aus eigenem Antrieb geschehen oder über den Aufruf in der letzten Erinnerungsmail. Beides mündet in dasselbe Formular, deshalb gibt es für die Tourenplanung nur einen Eingang.

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" exporter="dokufix-spike">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Abo-Anfrage" processRef="Process_1"/>
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_Kunde" name="Kunde"><bpmn:flowNodeRef>Start</bpmn:flowNodeRef><bpmn:flowNodeRef>Formular</bpmn:flowNodeRef><bpmn:flowNodeRef>Eingang</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Lane_Bestellformular" name="Bestellformular"><bpmn:flowNodeRef>Pruefen</bpmn:flowNodeRef><bpmn:flowNodeRef>Bestaetigen</bpmn:flowNodeRef><bpmn:flowNodeRef>Tour</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Lane_Kundenkartei" name="Kundenkartei"><bpmn:flowNodeRef>Liste</bpmn:flowNodeRef><bpmn:flowNodeRef>Status</bpmn:flowNodeRef><bpmn:flowNodeRef>Erfasst</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Lane_Tourenplanung" name="Tourenplanung"><bpmn:flowNodeRef>TourNord</bpmn:flowNodeRef><bpmn:flowNodeRef>TourSued</bpmn:flowNodeRef><bpmn:flowNodeRef>TourStadt</bpmn:flowNodeRef><bpmn:flowNodeRef>TourHof</bpmn:flowNodeRef><bpmn:flowNodeRef>Einplanen</bpmn:flowNodeRef><bpmn:flowNodeRef>Eingeplant</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start" name="Möchte regelmäßig beliefert werden"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Formular" name="Abo-Formular ausfüllen, Tour wählen"><bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="Eingang" name="Bestätigung erhalten"><bpmn:incoming>Flow_4</bpmn:incoming></bpmn:endEvent>
    <bpmn:task id="Pruefen" name="Pflichtfelder und Adresse prüfen"><bpmn:incoming>Flow_2</bpmn:incoming><bpmn:outgoing>Flow_3</bpmn:outgoing><bpmn:outgoing>Flow_5</bpmn:outgoing><bpmn:outgoing>Flow_6</bpmn:outgoing></bpmn:task>
    <bpmn:task id="Bestaetigen" name="Bestätigung an den Kunden senden"><bpmn:incoming>Flow_3</bpmn:incoming><bpmn:outgoing>Flow_4</bpmn:outgoing></bpmn:task>
    <bpmn:exclusiveGateway id="Tour" name="Welche Tour?"><bpmn:incoming>Flow_5</bpmn:incoming><bpmn:outgoing>Flow_9</bpmn:outgoing><bpmn:outgoing>Flow_10</bpmn:outgoing><bpmn:outgoing>Flow_11</bpmn:outgoing><bpmn:outgoing>Flow_12</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:task id="Liste" name="Kunde in Liste Abo-Anfragen"><bpmn:incoming>Flow_6</bpmn:incoming><bpmn:outgoing>Flow_7</bpmn:outgoing></bpmn:task>
    <bpmn:task id="Status" name="Status auf ABO_ANFRAGE setzen"><bpmn:incoming>Flow_7</bpmn:incoming><bpmn:outgoing>Flow_8</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="Erfasst" name="erfasst"><bpmn:incoming>Flow_8</bpmn:incoming></bpmn:endEvent>
    <bpmn:task id="TourNord" name="Tour Nord: Dörfer am Fluss"><bpmn:incoming>Flow_9</bpmn:incoming><bpmn:outgoing>Flow_13</bpmn:outgoing></bpmn:task>
    <bpmn:task id="TourSued" name="Tour Süd: Stadtrand und Siedlung"><bpmn:incoming>Flow_10</bpmn:incoming><bpmn:outgoing>Flow_14</bpmn:outgoing></bpmn:task>
    <bpmn:task id="TourStadt" name="Tour Stadt: Innenstadt per Lastenrad"><bpmn:incoming>Flow_11</bpmn:incoming><bpmn:outgoing>Flow_15</bpmn:outgoing></bpmn:task>
    <bpmn:task id="TourHof" name="Abholung am Hof: alles andere"><bpmn:incoming>Flow_12</bpmn:incoming><bpmn:outgoing>Flow_16</bpmn:outgoing></bpmn:task>
    <bpmn:task id="Einplanen" name="Kiste einplanen, Status pflegen"><bpmn:incoming>Flow_13</bpmn:incoming><bpmn:incoming>Flow_14</bpmn:incoming><bpmn:incoming>Flow_15</bpmn:incoming><bpmn:incoming>Flow_16</bpmn:incoming><bpmn:outgoing>Flow_17</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="Eingeplant" name="eingeplant"><bpmn:incoming>Flow_17</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start" targetRef="Formular"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Formular" targetRef="Pruefen"/>
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Pruefen" targetRef="Bestaetigen"/>
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Bestaetigen" targetRef="Eingang"/>
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Pruefen" targetRef="Tour"/>
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Pruefen" targetRef="Liste"/>
    <bpmn:sequenceFlow id="Flow_7" sourceRef="Liste" targetRef="Status"/>
    <bpmn:sequenceFlow id="Flow_8" sourceRef="Status" targetRef="Erfasst"/>
    <bpmn:sequenceFlow id="Flow_9" sourceRef="Tour" targetRef="TourNord"/>
    <bpmn:sequenceFlow id="Flow_10" sourceRef="Tour" targetRef="TourSued"/>
    <bpmn:sequenceFlow id="Flow_11" sourceRef="Tour" targetRef="TourStadt"/>
    <bpmn:sequenceFlow id="Flow_12" sourceRef="Tour" targetRef="TourHof"/>
    <bpmn:sequenceFlow id="Flow_13" sourceRef="TourNord" targetRef="Einplanen"/>
    <bpmn:sequenceFlow id="Flow_14" sourceRef="TourSued" targetRef="Einplanen"/>
    <bpmn:sequenceFlow id="Flow_15" sourceRef="TourStadt" targetRef="Einplanen"/>
    <bpmn:sequenceFlow id="Flow_16" sourceRef="TourHof" targetRef="Einplanen"/>
    <bpmn:sequenceFlow id="Flow_17" sourceRef="Einplanen" targetRef="Eingeplant"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true"><dc:Bounds x="10" y="20" width="1290" height="830"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_Kunde_di" bpmnElement="Lane_Kunde" isHorizontal="true"><dc:Bounds x="40" y="20" width="1260" height="130"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_Bestellformular_di" bpmnElement="Lane_Bestellformular" isHorizontal="true"><dc:Bounds x="40" y="150" width="1260" height="150"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_Kundenkartei_di" bpmnElement="Lane_Kundenkartei" isHorizontal="true"><dc:Bounds x="40" y="300" width="1260" height="130"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_Tourenplanung_di" bpmnElement="Lane_Tourenplanung" isHorizontal="true"><dc:Bounds x="40" y="430" width="1260" height="420"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Start_di" bpmnElement="Start"><dc:Bounds x="92" y="67" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Formular_di" bpmnElement="Formular"><dc:Bounds x="190" y="45" width="120" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Eingang_di" bpmnElement="Eingang"><dc:Bounds x="632" y="67" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Pruefen_di" bpmnElement="Pruefen"><dc:Bounds x="190" y="185" width="120" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Bestaetigen_di" bpmnElement="Bestaetigen"><dc:Bounds x="390" y="185" width="120" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Tour_di" bpmnElement="Tour" isMarkerVisible="true"><dc:Bounds x="625" y="200" width="50" height="50"/><bpmndi:BPMNLabel><dc:Bounds x="602" y="168" width="96" height="28"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Liste_di" bpmnElement="Liste"><dc:Bounds x="190" y="325" width="120" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Status_di" bpmnElement="Status"><dc:Bounds x="390" y="325" width="120" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Erfasst_di" bpmnElement="Erfasst"><dc:Bounds x="632" y="347" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="TourNord_di" bpmnElement="TourNord"><dc:Bounds x="790" y="450" width="170" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="TourSued_di" bpmnElement="TourSued"><dc:Bounds x="790" y="550" width="170" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="TourStadt_di" bpmnElement="TourStadt"><dc:Bounds x="790" y="650" width="170" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="TourHof_di" bpmnElement="TourHof"><dc:Bounds x="790" y="750" width="170" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Einplanen_di" bpmnElement="Einplanen"><dc:Bounds x="1030" y="600" width="120" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Eingeplant_di" bpmnElement="Eingeplant"><dc:Bounds x="1212" y="622" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="128" y="85"/><di:waypoint x="190" y="85"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="250" y="125"/><di:waypoint x="250" y="185"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3"><di:waypoint x="310" y="225"/><di:waypoint x="390" y="225"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4"><di:waypoint x="450" y="185"/><di:waypoint x="450" y="85"/><di:waypoint x="632" y="85"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_5_di" bpmnElement="Flow_5"><di:waypoint x="290" y="265"/><di:waypoint x="290" y="285"/><di:waypoint x="650" y="285"/><di:waypoint x="650" y="250"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_6_di" bpmnElement="Flow_6"><di:waypoint x="230" y="265"/><di:waypoint x="230" y="325"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_7_di" bpmnElement="Flow_7"><di:waypoint x="310" y="365"/><di:waypoint x="390" y="365"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_8_di" bpmnElement="Flow_8"><di:waypoint x="510" y="365"/><di:waypoint x="632" y="365"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_9_di" bpmnElement="Flow_9"><di:waypoint x="675" y="225"/><di:waypoint x="735" y="225"/><di:waypoint x="735" y="490"/><di:waypoint x="790" y="490"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_10_di" bpmnElement="Flow_10"><di:waypoint x="675" y="225"/><di:waypoint x="735" y="225"/><di:waypoint x="735" y="590"/><di:waypoint x="790" y="590"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_11_di" bpmnElement="Flow_11"><di:waypoint x="675" y="225"/><di:waypoint x="735" y="225"/><di:waypoint x="735" y="690"/><di:waypoint x="790" y="690"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_12_di" bpmnElement="Flow_12"><di:waypoint x="675" y="225"/><di:waypoint x="735" y="225"/><di:waypoint x="735" y="790"/><di:waypoint x="790" y="790"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_13_di" bpmnElement="Flow_13"><di:waypoint x="960" y="490"/><di:waypoint x="995" y="490"/><di:waypoint x="995" y="640"/><di:waypoint x="1030" y="640"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_14_di" bpmnElement="Flow_14"><di:waypoint x="960" y="590"/><di:waypoint x="995" y="590"/><di:waypoint x="995" y="640"/><di:waypoint x="1030" y="640"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_15_di" bpmnElement="Flow_15"><di:waypoint x="960" y="690"/><di:waypoint x="995" y="690"/><di:waypoint x="995" y="640"/><di:waypoint x="1030" y="640"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_16_di" bpmnElement="Flow_16"><di:waypoint x="960" y="790"/><di:waypoint x="995" y="790"/><di:waypoint x="995" y="640"/><di:waypoint x="1030" y="640"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_17_di" bpmnElement="Flow_17"><di:waypoint x="1150" y="640"/><di:waypoint x="1212" y="640"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

<!-- dokufix: steps -->
1. *Kunde:* Füllt aus: Name, Adresse, E-Mail, Telefon, Kistengröße, Tour, Wünsche und die Datenschutz-Zustimmung. Ein verborgenes Feld merkt sich, von welcher Seite die Anfrage kam.
2. *Bestellformular:* Prüft die Pflichtfelder und die Adresse.
3. *Bestellformular:* Schickt die Anfrage an die gewählte Tour. Rückfragen der Tour gehen direkt an den Kunden.
4. *Bestellformular:* Schickt dem Kunden eine Bestätigung.
5. *Bestellformular:* Überträgt den Kunden zusätzlich in die Kundenkartei, in die Liste `Abo-Anfragen`.
6. *Kundenkartei:* Der Ablauf `Abo-Anfrage eintragen` setzt den Status auf `ABO_ANFRAGE`.
7. *Tourenplanung:* Plant die Kiste ein und pflegt den Status.

> [!NOTE]
> **Warum der Umweg über die Kundenkartei:** Nur dadurch ist erkennbar, ob eine Abo-Anfrage aus einer früheren Probekiste entstanden ist. Die Kartei führt beide Vorgänge über die E-Mail-Adresse zusammen. Die Zustellung an die Tour hängt nicht daran, sie läuft unabhängig.

### Erinnerungsmails `🟡 geplant`

Drei Mails über drei Wochen mit genau einem Zweck: aus einer Probekiste einen zweiten Kontakt machen. Sie gehen nur an Kunden, die bei der Bestellung freiwillig zugestimmt haben.

| Wann | Zweck | Was drinsteht | Aufruf |
|---|---|---|---|
| Tag 3 | Nutzen | Ein Rezept zu dem Gemüse, das in der Kiste war | Einladung zu antworten |
| Tag 10 | Einblick | Ein Bericht vom Feld: was gerade wächst und was als Nächstes kommt | Link auf die Kistenübersicht |
| Tag 21 | Angebot | Das Abo, knapp erklärt, mit Abmeldemöglichkeit im selben Text | Abo anfragen |
| danach | Ende | Keine vierte Mail. Wer nicht reagiert, bleibt in der Kartei und ist zur nächsten Saison wieder erreichbar | |

> [!WARNING]
> **Zwei Bedingungen:** Die Mails dürfen erst nach der Prüfung des Zustimmungstexts verschickt werden. Und sie enden automatisch, sobald der Status nicht mehr auf `PROBE` steht, damit niemand Werbung bekommt, während die Tourenplanung schon mit ihm spricht.

### Übergabe an die Tourenplanung `🟡 teilweise`

Ein Probekunde wird zum Abo-Kunden, wenn er sich selbst meldet. Dafür gibt es zwei Wege, und sie unterscheiden sich im Aufwand erheblich.

<!-- dokufix: bpmn "Übergabe an die Tourenplanung" -->
```mermaid
swimlane-beta LR
  accTitle: Ablaufdiagramm Übergabe an die Tourenplanung mit vier Bahnen
  subgraph Kunde
    s((Reagiert auf<br>eine Erinnerung))
    w{Wie meldet<br>er sich?}
    r[📤 Auf die Mail<br>antworten]
  end
  subgraph Hofbüro
    m((📨 Antwort im<br>Postfach))
    x{Art der<br>Antwort?}
    i(((Abwesenheit,<br>nichts zu tun)))
    p{+}
    b[📤 Persönlich antworten<br>am selben Tag]
    j{+}
    g[📤 An die Tourenplanung<br>geben]
  end
  subgraph Kundenkartei
    u[👤 Abmeldung<br>sofort eintragen]
    eu(((Abgemeldet)))
    t[👤 Status auf<br>ABO_ANFRAGE setzen]
    n[⚙ Erinnerungen enden<br>automatisch]
  end
  subgraph Tourenplanung
    k[[Abo-Anfrage<br>Prozess 2]]
    e(((Bei der<br>Tourenplanung)))
  end
  s --> w
  w -- Antwort --> r
  w -- Formular --> k
  r -.-> m
  m --> x
  x -- Abwesenheit --> i
  x -- Abmeldung --> u
  u --> eu
  x -- Anfrage --> p
  p --> b
  p --> t
  t --> n
  b --> j
  n --> j
  j --> g
  g --> e
  k --> e
```

Zum Vergleich derselbe Ablauf als BPMN-XML, von Hand angeordnet:

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" exporter="dokufix-spike">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Übergabe an die Tourenplanung" processRef="Process_1"/>
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_Kunde" name="Kunde"><bpmn:flowNodeRef>Start</bpmn:flowNodeRef><bpmn:flowNodeRef>Weg</bpmn:flowNodeRef><bpmn:flowNodeRef>Antworten</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Lane_Hofbuero" name="Hofbüro"><bpmn:flowNodeRef>Postfach</bpmn:flowNodeRef><bpmn:flowNodeRef>Art</bpmn:flowNodeRef><bpmn:flowNodeRef>Abwesenheit</bpmn:flowNodeRef><bpmn:flowNodeRef>Teilen</bpmn:flowNodeRef><bpmn:flowNodeRef>PersoenlichAntworten</bpmn:flowNodeRef><bpmn:flowNodeRef>Zusammen</bpmn:flowNodeRef><bpmn:flowNodeRef>AnTouren</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Lane_Kundenkartei" name="Kundenkartei"><bpmn:flowNodeRef>Abmelden</bpmn:flowNodeRef><bpmn:flowNodeRef>Abgemeldet</bpmn:flowNodeRef><bpmn:flowNodeRef>Status</bpmn:flowNodeRef><bpmn:flowNodeRef>MailsEnden</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Lane_Tourenplanung" name="Tourenplanung"><bpmn:flowNodeRef>AboAnfrage</bpmn:flowNodeRef><bpmn:flowNodeRef>BeiTouren</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start" name="Reagiert auf eine Erinnerung"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:exclusiveGateway id="Weg" name="Wie meldet er sich?"><bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing><bpmn:outgoing>Flow_3</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:sendTask id="Antworten" name="Auf die Mail antworten"><bpmn:incoming>Flow_2</bpmn:incoming><bpmn:outgoing>Flow_4</bpmn:outgoing></bpmn:sendTask>
    <bpmn:intermediateCatchEvent id="Postfach" name="Antwort im Postfach"><bpmn:incoming>Flow_4</bpmn:incoming><bpmn:outgoing>Flow_5</bpmn:outgoing><bpmn:messageEventDefinition id="Postfach_def"/></bpmn:intermediateCatchEvent>
    <bpmn:exclusiveGateway id="Art" name="Art der Antwort?"><bpmn:incoming>Flow_5</bpmn:incoming><bpmn:outgoing>Flow_6</bpmn:outgoing><bpmn:outgoing>Flow_7</bpmn:outgoing><bpmn:outgoing>Flow_9</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:endEvent id="Abwesenheit" name="Abwesenheit, nichts zu tun"><bpmn:incoming>Flow_6</bpmn:incoming></bpmn:endEvent>
    <bpmn:parallelGateway id="Teilen"><bpmn:incoming>Flow_9</bpmn:incoming><bpmn:outgoing>Flow_10</bpmn:outgoing><bpmn:outgoing>Flow_11</bpmn:outgoing></bpmn:parallelGateway>
    <bpmn:sendTask id="PersoenlichAntworten" name="Persönlich antworten am selben Tag"><bpmn:incoming>Flow_10</bpmn:incoming><bpmn:outgoing>Flow_13</bpmn:outgoing></bpmn:sendTask>
    <bpmn:parallelGateway id="Zusammen"><bpmn:incoming>Flow_13</bpmn:incoming><bpmn:incoming>Flow_14</bpmn:incoming><bpmn:outgoing>Flow_15</bpmn:outgoing></bpmn:parallelGateway>
    <bpmn:sendTask id="AnTouren" name="An die Tourenplanung geben"><bpmn:incoming>Flow_15</bpmn:incoming><bpmn:outgoing>Flow_16</bpmn:outgoing></bpmn:sendTask>
    <bpmn:userTask id="Abmelden" name="Abmeldung sofort eintragen"><bpmn:incoming>Flow_7</bpmn:incoming><bpmn:outgoing>Flow_8</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="Abgemeldet" name="Abgemeldet"><bpmn:incoming>Flow_8</bpmn:incoming></bpmn:endEvent>
    <bpmn:userTask id="Status" name="Status auf ABO_ANFRAGE setzen"><bpmn:incoming>Flow_11</bpmn:incoming><bpmn:outgoing>Flow_12</bpmn:outgoing></bpmn:userTask>
    <bpmn:serviceTask id="MailsEnden" name="Erinnerungen enden automatisch"><bpmn:incoming>Flow_12</bpmn:incoming><bpmn:outgoing>Flow_14</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:callActivity id="AboAnfrage" name="Abo-Anfrage Prozess 2"><bpmn:incoming>Flow_3</bpmn:incoming><bpmn:outgoing>Flow_17</bpmn:outgoing></bpmn:callActivity>
    <bpmn:endEvent id="BeiTouren" name="Bei der Tourenplanung"><bpmn:incoming>Flow_16</bpmn:incoming><bpmn:incoming>Flow_17</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start" targetRef="Weg"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Weg" targetRef="Antworten" name="Antwort"/>
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Weg" targetRef="AboAnfrage" name="Formular"/>
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Antworten" targetRef="Postfach"/>
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Postfach" targetRef="Art"/>
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Art" targetRef="Abwesenheit" name="Abwesenheit"/>
    <bpmn:sequenceFlow id="Flow_7" sourceRef="Art" targetRef="Abmelden" name="Abmeldung"/>
    <bpmn:sequenceFlow id="Flow_8" sourceRef="Abmelden" targetRef="Abgemeldet"/>
    <bpmn:sequenceFlow id="Flow_9" sourceRef="Art" targetRef="Teilen" name="Anfrage"/>
    <bpmn:sequenceFlow id="Flow_10" sourceRef="Teilen" targetRef="PersoenlichAntworten"/>
    <bpmn:sequenceFlow id="Flow_11" sourceRef="Teilen" targetRef="Status"/>
    <bpmn:sequenceFlow id="Flow_12" sourceRef="Status" targetRef="MailsEnden"/>
    <bpmn:sequenceFlow id="Flow_13" sourceRef="PersoenlichAntworten" targetRef="Zusammen"/>
    <bpmn:sequenceFlow id="Flow_14" sourceRef="MailsEnden" targetRef="Zusammen"/>
    <bpmn:sequenceFlow id="Flow_15" sourceRef="Zusammen" targetRef="AnTouren"/>
    <bpmn:sequenceFlow id="Flow_16" sourceRef="AnTouren" targetRef="BeiTouren"/>
    <bpmn:sequenceFlow id="Flow_17" sourceRef="AboAnfrage" targetRef="BeiTouren"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true"><dc:Bounds x="10" y="20" width="1420" height="565"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_Kunde_di" bpmnElement="Lane_Kunde" isHorizontal="true"><dc:Bounds x="40" y="20" width="1390" height="130"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_Hofbuero_di" bpmnElement="Lane_Hofbuero" isHorizontal="true"><dc:Bounds x="40" y="150" width="1390" height="175"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_Kundenkartei_di" bpmnElement="Lane_Kundenkartei" isHorizontal="true"><dc:Bounds x="40" y="325" width="1390" height="160"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_Tourenplanung_di" bpmnElement="Lane_Tourenplanung" isHorizontal="true"><dc:Bounds x="40" y="485" width="1390" height="100"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Start_di" bpmnElement="Start"><dc:Bounds x="92" y="67" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Weg_di" bpmnElement="Weg" isMarkerVisible="true"><dc:Bounds x="175" y="60" width="50" height="50"/><bpmndi:BPMNLabel><dc:Bounds x="152" y="28" width="96" height="28"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Antworten_di" bpmnElement="Antworten"><dc:Bounds x="300" y="45" width="120" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Postfach_di" bpmnElement="Postfach"><dc:Bounds x="342" y="232" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Art_di" bpmnElement="Art" isMarkerVisible="true"><dc:Bounds x="445" y="225" width="50" height="50"/><bpmndi:BPMNLabel><dc:Bounds x="378" y="190" width="88" height="28"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Abwesenheit_di" bpmnElement="Abwesenheit"><dc:Bounds x="552" y="172" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="594" y="176" width="90" height="28"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Teilen_di" bpmnElement="Teilen"><dc:Bounds x="735" y="225" width="50" height="50"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="PersoenlichAntworten_di" bpmnElement="PersoenlichAntworten"><dc:Bounds x="850" y="210" width="120" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Zusammen_di" bpmnElement="Zusammen"><dc:Bounds x="1165" y="225" width="50" height="50"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="AnTouren_di" bpmnElement="AnTouren"><dc:Bounds x="1270" y="210" width="120" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Abmelden_di" bpmnElement="Abmelden"><dc:Bounds x="520" y="365" width="120" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Abgemeldet_di" bpmnElement="Abgemeldet"><dc:Bounds x="672" y="387" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Status_di" bpmnElement="Status"><dc:Bounds x="850" y="365" width="120" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="MailsEnden_di" bpmnElement="MailsEnden"><dc:Bounds x="1010" y="365" width="120" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="AboAnfrage_di" bpmnElement="AboAnfrage"><dc:Bounds x="260" y="495" width="120" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="BeiTouren_di" bpmnElement="BeiTouren"><dc:Bounds x="1312" y="517" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="128" y="85"/><di:waypoint x="175" y="85"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="225" y="85"/><di:waypoint x="300" y="85"/><bpmndi:BPMNLabel><dc:Bounds x="232" y="67" width="48" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3"><di:waypoint x="200" y="110"/><di:waypoint x="200" y="535"/><di:waypoint x="260" y="535"/><bpmndi:BPMNLabel><dc:Bounds x="206" y="118" width="54" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4"><di:waypoint x="360" y="125"/><di:waypoint x="360" y="232"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_5_di" bpmnElement="Flow_5"><di:waypoint x="378" y="250"/><di:waypoint x="445" y="250"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_6_di" bpmnElement="Flow_6"><di:waypoint x="470" y="225"/><di:waypoint x="470" y="190"/><di:waypoint x="552" y="190"/><bpmndi:BPMNLabel><dc:Bounds x="476" y="172" width="70" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_7_di" bpmnElement="Flow_7"><di:waypoint x="470" y="275"/><di:waypoint x="470" y="405"/><di:waypoint x="520" y="405"/><bpmndi:BPMNLabel><dc:Bounds x="476" y="290" width="62" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_8_di" bpmnElement="Flow_8"><di:waypoint x="640" y="405"/><di:waypoint x="672" y="405"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_9_di" bpmnElement="Flow_9"><di:waypoint x="495" y="250"/><di:waypoint x="735" y="250"/><bpmndi:BPMNLabel><dc:Bounds x="505" y="232" width="50" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_10_di" bpmnElement="Flow_10"><di:waypoint x="785" y="250"/><di:waypoint x="850" y="250"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_11_di" bpmnElement="Flow_11"><di:waypoint x="760" y="275"/><di:waypoint x="760" y="405"/><di:waypoint x="850" y="405"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_12_di" bpmnElement="Flow_12"><di:waypoint x="970" y="405"/><di:waypoint x="1010" y="405"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_13_di" bpmnElement="Flow_13"><di:waypoint x="970" y="250"/><di:waypoint x="1165" y="250"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_14_di" bpmnElement="Flow_14"><di:waypoint x="1130" y="405"/><di:waypoint x="1190" y="405"/><di:waypoint x="1190" y="275"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_15_di" bpmnElement="Flow_15"><di:waypoint x="1215" y="250"/><di:waypoint x="1270" y="250"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_16_di" bpmnElement="Flow_16"><di:waypoint x="1330" y="290"/><di:waypoint x="1330" y="517"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_17_di" bpmnElement="Flow_17"><di:waypoint x="380" y="535"/><di:waypoint x="1312" y="535"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

Und noch einmal als BPMN-XML ohne Koordinaten, die Anordnung entsteht beim Rendern:

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Übergabe an die Tourenplanung" processRef="Process_1"/>
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_Kunde" name="Kunde"><bpmn:flowNodeRef>Start</bpmn:flowNodeRef><bpmn:flowNodeRef>Weg</bpmn:flowNodeRef><bpmn:flowNodeRef>Antworten</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Lane_Hofbuero" name="Hofbüro"><bpmn:flowNodeRef>Postfach</bpmn:flowNodeRef><bpmn:flowNodeRef>Art</bpmn:flowNodeRef><bpmn:flowNodeRef>Abwesenheit</bpmn:flowNodeRef><bpmn:flowNodeRef>Teilen</bpmn:flowNodeRef><bpmn:flowNodeRef>PersoenlichAntworten</bpmn:flowNodeRef><bpmn:flowNodeRef>Zusammen</bpmn:flowNodeRef><bpmn:flowNodeRef>AnTouren</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Lane_Kundenkartei" name="Kundenkartei"><bpmn:flowNodeRef>Abmelden</bpmn:flowNodeRef><bpmn:flowNodeRef>Abgemeldet</bpmn:flowNodeRef><bpmn:flowNodeRef>Status</bpmn:flowNodeRef><bpmn:flowNodeRef>MailsEnden</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Lane_Tourenplanung" name="Tourenplanung"><bpmn:flowNodeRef>AboAnfrage</bpmn:flowNodeRef><bpmn:flowNodeRef>BeiTouren</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start" name="Reagiert auf eine Erinnerung"/>
    <bpmn:exclusiveGateway id="Weg" name="Wie meldet er sich?"/>
    <bpmn:sendTask id="Antworten" name="Auf die Mail antworten"/>
    <bpmn:intermediateCatchEvent id="Postfach" name="Antwort im Postfach"><bpmn:messageEventDefinition id="Postfach_def"/></bpmn:intermediateCatchEvent>
    <bpmn:exclusiveGateway id="Art" name="Art der Antwort?"/>
    <bpmn:endEvent id="Abwesenheit" name="Abwesenheit, nichts zu tun"/>
    <bpmn:parallelGateway id="Teilen"/>
    <bpmn:sendTask id="PersoenlichAntworten" name="Persönlich antworten am selben Tag"/>
    <bpmn:parallelGateway id="Zusammen"/>
    <bpmn:sendTask id="AnTouren" name="An die Tourenplanung geben"/>
    <bpmn:userTask id="Abmelden" name="Abmeldung sofort eintragen"/>
    <bpmn:endEvent id="Abgemeldet" name="Abgemeldet"/>
    <bpmn:userTask id="Status" name="Status auf ABO_ANFRAGE setzen"/>
    <bpmn:serviceTask id="MailsEnden" name="Erinnerungen enden automatisch"/>
    <bpmn:callActivity id="AboAnfrage" name="Abo-Anfrage Prozess 2"/>
    <bpmn:endEvent id="BeiTouren" name="Bei der Tourenplanung"/>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start" targetRef="Weg"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Weg" targetRef="Antworten" name="Antwort"/>
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Weg" targetRef="AboAnfrage" name="Formular"/>
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Antworten" targetRef="Postfach"/>
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Postfach" targetRef="Art"/>
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Art" targetRef="Abwesenheit" name="Abwesenheit"/>
    <bpmn:sequenceFlow id="Flow_7" sourceRef="Art" targetRef="Abmelden" name="Abmeldung"/>
    <bpmn:sequenceFlow id="Flow_8" sourceRef="Abmelden" targetRef="Abgemeldet"/>
    <bpmn:sequenceFlow id="Flow_9" sourceRef="Art" targetRef="Teilen" name="Anfrage"/>
    <bpmn:sequenceFlow id="Flow_10" sourceRef="Teilen" targetRef="PersoenlichAntworten"/>
    <bpmn:sequenceFlow id="Flow_11" sourceRef="Teilen" targetRef="Status"/>
    <bpmn:sequenceFlow id="Flow_12" sourceRef="Status" targetRef="MailsEnden"/>
    <bpmn:sequenceFlow id="Flow_13" sourceRef="PersoenlichAntworten" targetRef="Zusammen"/>
    <bpmn:sequenceFlow id="Flow_14" sourceRef="MailsEnden" targetRef="Zusammen"/>
    <bpmn:sequenceFlow id="Flow_15" sourceRef="Zusammen" targetRef="AnTouren"/>
    <bpmn:sequenceFlow id="Flow_16" sourceRef="AnTouren" targetRef="BeiTouren"/>
    <bpmn:sequenceFlow id="Flow_17" sourceRef="AboAnfrage" targetRef="BeiTouren"/>
  </bpmn:process>
</bpmn:definitions>
```

<!-- dokufix: cards -->
- **Weg A · automatisch**\
  Er klickt den Aufruf in der dritten Mail und füllt das Abo-Formular aus. Ab da gilt Prozess 2 unverändert, ohne jede Handarbeit.
- **Weg B · von Hand**\
  Er antwortet direkt auf eine Mail. Die Antwort landet im Postfach des Hofbüros und muss weitergegeben werden.

#### Was bei einer Antwort zu tun ist

<!-- dokufix: steps -->
1. Art der Antwort bestimmen. Abwesenheitsnotizen ignorieren. Eine **Abmeldung wird sofort eingetragen**, das hat Vorrang vor allem anderen.
2. Noch am selben Tag persönlich antworten, aus dem Hofbüro. Es hat jemand auf eine Mail geantwortet, die einen Namen trug.
3. In der Kundenkartei den Status auf `ABO_ANFRAGE` setzen. Dadurch enden die Erinnerungen automatisch.
4. An die Tourenplanung geben, immer mit denselben Angaben: Name, Adresse, E-Mail, bestellte Probekiste mit Datum, Erlaubnis ja oder nein, Wortlaut der Antwort.

### Löschroutine `🟡 geplant`

Die Kundenkartei löscht nichts von selbst. Ohne festen Termin wächst der Bestand unbegrenzt, und das ist weder nötig noch erlaubt.

| Fall | Frist | Was passiert |
|---|---|---|
| Probekunde ohne Erlaubnis | 12 Monate ohne Bestellung | löschen |
| Probekunde mit Erlaubnis, ohne Reaktion | 24 Monate ohne Bestellung | löschen |
| Abo-Anfrage, bearbeitet, ohne Abo | 12 Monate nach Abschluss | löschen |
| Kunde hat ein Abo | hier keine Frist | folgt dem Abo |
| **Abmeldung oder Widerruf** | dauerhaft | **nicht löschen, sperren** |
| Unzustellbare Adresse, Testeinträge | sofort | löschen |

> [!NOTE]
> **Die vorletzte Zeile wird am häufigsten falsch gemacht.** Wer sich abmeldet, darf nicht gelöscht werden. Sonst fehlt beim nächsten Einlesen die Angabe, dass diese Person keine Post will, und sie bekommt wieder welche. Dafür ist die Sperrliste da.

Als Bestellung zählt jede Kiste, jede Abo-Anfrage und jede Antwort auf eine Mail. Jede davon setzt die Frist neu. Jeder Durchlauf wird in einer Zeile festgehalten: Datum, Anzahl, angewandte Regel.

## Was im System steht

### Formulare

#### Vier Bestellseiten für Probekisten

Benannt nach dem Schema `PK 01 …` bis `PK 04 …`. Alle gleich aufgebaut, sie unterscheiden sich in genau zwei Dingen: der Überschrift und der Kistenart, die bestellt wird.

| Feld | Pflicht | Zweck |
|---|---|---|
| Anrede | nein | Ansprache in späteren Mails. Lässt sich nicht nachholen |
| Vorname, Nachname | ja | Ansprache und Lieferschein |
| E-Mail | ja | Bestätigung und Zusammenführung beider Wege |
| Lieferadresse | ja | Zuordnung zu einer Tour |
| Zustimmung Lieferung | **ja** | Erlaubnis, die Angaben für die Lieferung zu verwenden |
| Zustimmung Erinnerungen | **nein** | Freiwillig. Nur wer hier zustimmt, bekommt später Post |
| Sicherheitsabfrage | — | Schutz vor automatischen Einträgen |

> [!NOTE]
> **Warum das zweite Häkchen freiwillig bleiben muss:** Die Erlaubnis für Werbung darf keine Bedingung für die bestellte Kiste sein. Wäre sie Pflicht, wäre sie erzwungen und damit nichts wert. Das Ergebnis wären weniger Bestellungen und trotzdem keine belastbare Erlaubnis.

#### Das Abo-Formular auf der Website

| Feld | Pflicht | Zweck |
|---|---|---|
| Vorname, Nachname | nein | Ansprache |
| E-Mail | ja | Antwort und Zusammenführung |
| Telefon | nein | Rückruf bei Fragen zur Lieferung |
| Lieferadresse | ja | Zuordnung zu einer Tour |
| Tour | **ja** | Steuert, welche Tour die Anfrage bekommt |
| Wünsche | nein | Was nicht in die Kiste soll |
| Datenschutz-Zustimmung | ja | Erlaubnis, die Anfrage zu bearbeiten |
| `Herkunft der Anfrage` | verborgen | Merkt sich die Seite, auf der das Formular stand |

### Die beiden Listen in der Kundenkartei

Eine Liste sagt, zu welcher Gruppe jemand gehört. Sie sagt nichts darüber, was wir ihm schicken dürfen, das steht im Merkmal für die Erlaubnis.

| Liste | Wer landet darin | Woher | Wofür sie gebraucht wird |
|---|---|---|---|
| `Probekunden` | Jeder, der eine Probekiste bestellt und seine Adresse bestätigt hat | die vier Bestellseiten | Grundmenge für die Erinnerungsmails und für Auswertungen je Kistenart |
| `Abo-Anfragen` | Jeder, der das Abo-Formular abgeschickt hat | Bestellformular | Ablage, und sie löst den Ablauf aus, der den Status setzt |

> [!NOTE]
> Ein Mensch kann in beiden Listen stehen. Genau das ist der interessante Fall: Er hat erst eine Probekiste bestellt und später ein Abo angefragt. Die Kartei führt beides über die E-Mail-Adresse auf einem Kunden zusammen.

### Kundenmerkmale

Merkmale sind die Felder am Kunden. Sie tragen alles, was wir über einen Menschen wissen, und sie sind der Grund, warum ein Kunde später nicht nur ein Name in einer Liste ist. Namen und Typen lassen sich in der Kartei nachträglich nicht ändern.

<!-- dokufix: filter "Merkmal oder Zweck suchen …" -->
<!-- dokufix: facets Typ -->
| Merkmal | Typ | Wer füllt es | Wofür |
|---|---|---|---|
| `PK_LETZTE` | Kategorie | Ablauf | Welche Probekiste zuletzt bestellt wurde. Das Feld für die Tourenplanung, es zeigt immer den aktuellen Anlass |
| `PK_LETZTE_AM` | Datum | Ablauf | Wann. Eine Bestellung von gestern ist etwas anderes als eine von vor acht Monaten |
| `PK_GEMUESE`<br>`PK_OBST`<br>`PK_GEMISCHT`<br>`PK_SAISON` | Ja/Nein<br>*je eines* | Ablauf | Die vollständige Bestellhistorie. Vier Felder, eines je Kistenart, sie werden nie zurückgesetzt. Wer zwei Kistenarten probiert hat, hat zwei davon auf Ja |
| `ERLAUBNIS_ERINNERUNG` | Ja/Nein | Besucher im Formular | Das wichtigste Feld überhaupt. Es entscheidet, ob wir diesen Menschen anschreiben dürfen |
| `ANREDE` | Kategorie | Besucher im Formular | Ansprache. Fehlt sie, lässt sie sich für Altkunden nicht nachholen |
| `ORT` | Text | Besucher im Formular | Die wichtigste Angabe für die Zuordnung zu einer Tour |
| `TELEFON` | Text | Besucher im Abo-Formular | Rückruf. Bewusst Text und kein Zahlenfeld, weil Vorwahlen und Leerzeichen erhalten bleiben sollen |
| `QUELLE_SEITE` | Text | verborgenes Formularfeld | Von welcher Seite die Anfrage kam. Trennt die Anfrage von einer Rezeptseite von der aus dem Menü |
| `WUNSCH_TOUR` | Text | Besucher im Abo-Formular | Die gewählte Tour. Zeigt später, welche Touren überhaupt gefragt sind |
| `ANFRAGE_AM` | Datum | — | Angelegt, bleibt vorerst leer. Das Abo-Formular hat kein Datumsfeld, und der Zeitpunkt steht ohnehin in der Historie |
| `STATUS` | Kategorie | Ablauf, später von Hand | Wo der Kunde steht. Mögliche Werte: PROBE, ABO_ANFRAGE, IN_PLANUNG, ABO, KEIN_BEDARF. Beendet außerdem die Erinnerungsmails, sobald er nicht mehr auf PROBE steht |
| `ABO_KUNDE` | Ja/Nein | von Hand | Wer schon ein Abo hat, gehört nicht in die Erinnerungsmails |
| `TOUR_FAHRER` | Benutzer | von Hand | Zuständiger Fahrer, sofern die Tourenplanung in der Kartei angelegt ist |
| `VORLIEBE` | Kategorie | — | Angelegt, aber zurückgestellt. Die Zuordnung erfolgt derzeit über die bestellte Kistenart |

#### Die vier Probekisten und ihre Kürzel

| Nr | Probekiste | Kürzel |
|---|---|---|
| 01 | Gemüsekiste, klein | `GEMUESE` |
| 02 | Obstkiste | `OBST` |
| 03 | Gemischte Kiste für zwei | `GEMISCHT` |
| 04 | Saisonkiste mit Rezept | `SAISON` |

### Abläufe in der Kundenkartei

Fünf Stück. Vier davon sind Geschwister, sie unterscheiden sich nur in den Werten, die sie setzen.

#### Vier Abläufe für Probekisten

Benannt nach dem Schema `PK 01 …`. Jeder hört auf genau eine Bestellseite, daher weiß er, welche Kiste bestellt wurde.

| Schritt | Was |
|---|---|
| Auslöser | Die zugehörige Bestellseite wurde gesendet |
| Aktion 1 | `PK_LETZTE` auf das Kürzel der Kiste setzen |
| Aktion 2 | Das Ja-Nein-Feld dieser Kiste auf Ja setzen |
| Aktion 3 | `PK_LETZTE_AM` auf das Bestelldatum setzen |
| Aktion 4 | `STATUS` auf `PROBE` setzen |

#### Ein Ablauf für Abo-Anfragen

| Name | Auslöser | Aktion |
|---|---|---|
| `Abo-Anfrage eintragen` | Kunde wird zur Liste `Abo-Anfragen` hinzugefügt | `STATUS` auf `ABO_ANFRAGE` setzen |

> [!NOTE]
> **Warum es diesen Ablauf gibt:** Das Bestellformular kann Kategorie-Merkmale in der Kartei nicht beschreiben. Der Status lässt sich deshalb nicht direkt aus dem Formular setzen. Die Kartei erledigt es stattdessen selbst, sobald der Kunde in der Liste landet. Das ist zugleich die robustere Lösung, weil die Logik vollständig in einem System liegt.

### Tourenregeln

Vier Auswahlmöglichkeiten im Formular, vier Regeln in der Zustellung. Weil das Feld Pflicht ist und genau vier Werte hat, trifft jede Anfrage genau eine Regel. Es kann keine durchfallen.

| Was der Besucher wählt | Gespeicherter Wert | Geht an |
|---|---|---|
| Dörfer am Fluss<br>*Auenbach, Weidenau, Mühlfurt* | `TOUR_NORD` | Tour Nord |
| Stadtrand und Siedlung<br>*Gartenviertel, Am Hang, Neue Siedlung* | `TOUR_SUED` | Tour Süd |
| Innenstadt<br>*Lieferung per Lastenrad* | `TOUR_STADT` | Tour Stadt |
| Ich hole selbst ab, oder noch unklar | `ABHOLUNG` | Hofladen |

> [!NOTE]
> **Die Regeln hängen am gespeicherten Wert, nicht am sichtbaren Text.** Die Beschriftungen im Formular lassen sich jederzeit umformulieren, ohne dass die Zustellung bricht. Ändern sich dagegen Touren oder Zuständigkeiten, müssen diese vier Regeln angepasst werden. Sie liegen unsichtbar in einem Formular, und von allein denkt niemand daran.

## Betrieb

### Wenn etwas ausfällt

| Ausfall | Was trotzdem läuft | Was fehlt |
|---|---|---|
| Kundenkartei nicht erreichbar | Abo-Anfragen gehen weiter an die Tourenplanung, das Formular speichert jeden Eintrag | Probekisten-Bestellungen, Kundenablage, Merkmale |
| **Zugang zur Kartei abgelaufen oder gesperrt** | Formular und Mail an die Tour laufen völlig unverändert | **Der Kunde erscheint nicht in der Kartei, und zwar ohne jede Fehlermeldung** |
| Website ausgefallen | Bestehende Abos laufen weiter, sie hängen nur an der Tourenplanung | Neue Probekisten und Abo-Anfragen insgesamt |

> [!WARNING]
> **Der mittlere Fall ist der gefährliche**, weil nichts kaputt aussieht. Deshalb gehört er in die monatliche Routine: Stimmt die Zahl der Einträge im Formular mit der Zahl neuer Kunden in der Liste `Abo-Anfragen` überein?

### Was noch offen ist

| Punkt | Warum es zählt | Wer |
|---|---|---|
| Prüfung von Zustimmungstext, Zweck und Löschfristen | Ab der neuen Saison wird in Serie gesammelt. Eine Lücke wächst mit | Hofbüro |
| Beschluss über den Ablauf mit Hofleitung und Tourenplanung | Ohne Beschluss entstehen zwei Abläufe nebeneinander | Hofbüro, Hofleitung |
| Drei Sammeladressen für die Touren | Sammeladressen, keine Personen. Sonst liegt eine Anfrage während eines Urlaubs | Hofbüro |
| Bestellseiten für Obst- und Saisonkiste verlinken | Die Hälfte der Bestellseiten ist von der Startseite aus nicht erreichbar | Website |
| Rezepte für die erste Erinnerungsmail sammeln | Ohne Rezept hat die erste Mail keinen Inhalt | Hofbüro, Küche |
| Absender der Erinnerungsmails samt Vertretung | Antworten landen in seinem Postfach. Ohne Vertretung gehen sie im Urlaub verloren | Hofbüro |
