# dokufix-Markdown: Anleitung für ein LLM

Du arbeitest Inhalte in Markdown für dokufix um. dokufix zeigt GitHub-Markdown (GFM) als lesbares Dokument und kennt dazu ein paar Bausteine. Nutze sie, wo sie dem Leser helfen, und halte dich genau an die Schreibweise. Alles, was hier nicht steht, ist gewöhnliches GFM. Was falsch geschrieben ist, erscheint im Dokument als Kasten „Warnung: …“ oder bleibt gewöhnlicher Text.

## Aufbau

- **Metadaten-Kopf** ganz oben, zwischen zwei Zeilen `---`. Erlaubt sind `key: value`, verschachtelte Schlüssel durch Einrückung mit Leerzeichen und Listen aus einfachen Werten (`- wert`). Nicht erlaubt sind `|` und `>`, Anker, Listen von Schlüssel-Wert-Paaren (`- key: v`), `{}` und `[]` sowie Tabs. Gib mindestens `title` an, dazu `version`, `date` oder `author`.
- **Eine H1** als Dokumenttitel. Sie bestimmt auch den Dateinamen beim Export.
- **H2 bis H4** gliedern. Daraus entstehen die Seitenleiste und die Gruppen der Suche. Halte die Überschriften kurz und eindeutig.
- **`[[toc]]`** als eigener Absatz setzt ein Inhaltsverzeichnis (H2 und H3). `[[toc:4]]` reicht bis H4.

```markdown
---
title: Ausleihe in der Stadtbibliothek
version: 3
date: 2026-10-05
author: Redaktion
---

# Ausleihe in der Stadtbibliothek

[[toc]]

## Überblick
```

## Hinweise

Ein Blockzitat, dessen erste Zeile **nur** die Marke enthält:

```markdown
> [!NOTE]
> Text, Listen und Code sind erlaubt.
```

Es gibt fünf Marken: `[!NOTE]` (Hinweis), `[!TIP]` (Tipp), `[!IMPORTANT]` (Wichtig), `[!WARNING]` (Achtung) und `[!CAUTION]` (Vorsicht). Steht Text in derselben Zeile wie die Marke, bleibt es ein gewöhnliches Zitat. Überschriften in einem Hinweis erscheinen nicht im Inhaltsverzeichnis.

## Status-Chips

Ein Inline-Code, der mit einem farbigen Punkt, einem Leerzeichen und einer Bezeichnung beginnt:

`` `🟢 in Betrieb` `` · `` `🟡 geplant` `` · `` `🔴 gestört` `` · `` `⚪ Übergang` `` · `` `🔵 im Test` ``

Nur diese fünf Punkte gelten. Ein Chip wirkt im Fließtext, in Tabellenzellen, Überschriften und Listen, nicht in Code-Blöcken. Ein Chip braucht eine Bezeichnung nach dem Punkt.

## Bausteine mit Markierung

Eine Markierung ist ein HTML-Kommentar direkt über dem Block. Leerzeilen dazwischen sind erlaubt, ein Absatz dazwischen nicht. Mehrere Markierungen können übereinander stehen.

**Karten:** über einer Aufzählung. Der fette Anfang eines Punkts wird zum Kartentitel.

```markdown
<!-- dokufix: cards -->
- **Ausleihe** Bis zu 20 Medien für vier Wochen.
- **Verlängerung** Zweimal online, wenn niemand vorgemerkt hat.
```

**Schrittliste:** über einer nummerierten Liste. Wer handelt, steht kursiv am Anfang, der Doppelpunkt **innerhalb** der Betonung.

```markdown
<!-- dokufix: steps -->
1. *Leserin:* Medium am Automaten zurückgeben.
2. *Theke:* Vormerkung prüfen.
3. Medium einstellen.
```

**Tabelle mit Filter:** über einer Tabelle mit Kopfzeile. `facets` nennt eine Spalte und erzeugt Knöpfe für ihre Werte; erlaubt sind höchstens 32 verschiedene Werte, gezählt wird der Text bis zum ersten `<br>`. `filter` setzt ein Suchfeld, mit oder ohne Platzhalter in Anführungszeichen. Jede Markierung darf vor einer Tabelle nur einmal stehen.

```markdown
<!-- dokufix: filter "Medium suchen …" -->
<!-- dokufix: facets Art -->
| Medium | Art | Leihfrist |
|---|---|---|
| Roman | Buch | 4 Wochen |
| Hörbuch | CD | 2 Wochen |
```

Mehr Marken gibt es nicht: `cards`, `steps`, `facets <Spalte>` und `filter`. Eine andere Marke oder eine Marke vor dem falschen Block wird zur Warnung.

**Unterzeile in einer Zelle:** `Text<br>*kursive Ergänzung*`.

## Fußnoten, Code, Bilder

- **Fußnoten:** `Text[^1]` und irgendwo `[^1]: Erklärung.` Der Leser sieht die Erklärung beim Darüberfahren. Halte sie kurz; Links in der Vorschau werden zu Text.
- **Code-Blöcke** mit Sprachangabe, etwa ` ```json `. Sie bekommen Zeilennummern, Umbruch und einen Kopier-Knopf. Färbung nach Sprache gibt es nicht. `mermaid` und `bpmn` sind für Diagramme reserviert.
- **Bilder:** Ein LLM kann keine eingebetteten Bilder erzeugen, denn `#asset-…` ist eine Prüfsumme, die der Editor beim Einfügen vergibt. Lass Bilder weg, oder markiere die Stelle als Text, damit ein Mensch das Bild im Editor einfügt. Eine `https://`-Adresse funktioniert nur mit Netz.

## Mermaid

` ```mermaid ` mit `flowchart LR`, `flowchart TD` oder `sequenceDiagram`. Andere Diagrammarten sind nicht geprüft. Klick-Aktionen mit Skript werden nicht ausgeführt. Zeilenumbrüche in Beschriftungen schreibst du als `<br>`. Der Titel eines Diagramms ist die letzte Überschrift davor, also gehört über jedes Diagramm eine eigene, sprechende Überschrift.

## BPMN

` ```bpmn ` mit BPMN-2.0-XML. Zwei Wege:

**1. Ohne Koordinaten** (empfohlen; dokufix ordnet das Diagramm an). Das XML enthält kein `bpmndi:BPMNShape`. Dabei gilt:

- **Pools und Bahnen:** Rollen einer Organisation sind **Bahnen (`lane`) eines Pools**; eine Übergabe zwischen ihnen ist ein `sequenceFlow`. Eigenständige Beteiligte, die Nachrichten tauschen (Kunde und Firma), sind **mehrere Pools**: ein `collaboration` mit einem `participant` je Beteiligtem, mit `processRef` auf seinen eigenen `process`. Kennst du den Ablauf eines Beteiligten nicht (etwa den des Kunden), ist sein Pool eine **Black Box**: ein `participant` ohne `processRef`; erfinde keinen Ablauf für ihn. dokufix stellt die Pools in der Reihenfolge der `participant` untereinander, eine Black Box als schmalen Rahmen ohne Bahnen; mindestens ein Pool braucht einen Prozess.
- **Nachrichtenflüsse** (`messageFlow` im `collaboration`) verbinden zwei Pools, etwa eine `sendTask` mit einem Nachrichten-Startereignis; jedes Ende ist ein Flussknoten oder, bei einer Black Box, die `id` des `participant`. An einem Pool läuft der Nachrichtenfluss senkrecht bis an seinen Rand. Ein Sequenzfluss verlässt seinen Pool nie. Ein Nachrichtenfluss innerhalb eines Pools wird weggelassen.
- **Mehrere Prozesse ohne `collaboration`** zeichnet dokufix als Pools und fügt die `collaboration` selbst ein. Schreib sie besser selbst, dann stehen die Namen der Pools fest.
- **Angeordnet wird:** `participant` als Pool, `startEvent`, `endEvent`, `intermediateCatchEvent`, `intermediateThrowEvent`, alle `*Gateway`, `task` und alle `*Task`, `callActivity`, `subProcess` (nur zugeklappt, sein Inhalt fehlt), `boundaryEvent` an einer Aufgabe oder einem Teilprozess (auf dessen Unterkante, unterbrechend oder mit `cancelActivity="false"` nicht), `sequenceFlow` und `messageFlow` mit `name`, `laneSet`/`lane`/`flowNodeRef`.
- **Angeheftete Ereignisse** (`boundaryEvent` mit `attachedToRef`) für Frist, Fehler oder Eskalation an einer Aufgabe: dokufix setzt sie auf die Unterkante der Aufgabe und den Ausnahmepfad eine Zeile darunter. Ein Sequenzfluss geht von ihm aus, nie hinein; ein Nachrichtenfluss an einem angehefteten Ereignis wird noch weggelassen.
- **Ohne Hinweis weggelassen:** Textanmerkungen, Datenobjekte und Datenspeicher, Assoziationen, Gruppen, der Inhalt von Teilprozessen sowie jeder Fluss, der eines dieser Elemente berührt. Bau den Ablauf ohne diese Elemente.
- **Bahnen:** Jeder Knoten muss in genau einer Bahn stehen (`flowNodeRef`), sonst gibt es die Warnung „Diese Elemente liegen in keiner Bahn“. Zweige einer Verzweigung bekommen innerhalb einer Bahn eigene Zeilen; parallele Zweige dürfen also in derselben Bahn stehen. Gateways und Endereignisse darf dokufix in eine andere Bahn stellen als die, der du sie zuordnest, meist in die ihres Vorgängers; im heruntergeladenen XML stehen sie dann dort.
- **Ids** sind gültige XML-Namen: mit einem Buchstaben anfangen, keine Leerzeichen. Jeder Knoten und Fluss braucht eine `id`. Gib Knoten und Flüssen einen `name`, das ist ihre Beschriftung.
- **Gut lesbar bleibt es**, wenn ein Gateway wenige Ausgänge hat (2 bis 3), Schleifen zurück sparsam sind und keine Flüsse von einem Knoten zu sich selbst führen.

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://example.org/dokufix">
  <bpmn:collaboration id="Zusammenarbeit">
    <bpmn:participant id="Pool" name="Rückgabe" processRef="P_Rueckgabe"/>
  </bpmn:collaboration>
  <bpmn:process id="P_Rueckgabe" isExecutable="false">
    <bpmn:laneSet id="Bahnen">
      <bpmn:lane id="L_Leserin" name="Leserin"><bpmn:flowNodeRef>Start</bpmn:flowNodeRef><bpmn:flowNodeRef>Abgeben</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="L_Theke" name="Theke"><bpmn:flowNodeRef>Pruefen</bpmn:flowNodeRef><bpmn:flowNodeRef>Frage</bpmn:flowNodeRef><bpmn:flowNodeRef>Benachrichtigen</bpmn:flowNodeRef><bpmn:flowNodeRef>Einstellen</bpmn:flowNodeRef><bpmn:flowNodeRef>Ende</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start" name="Leihfrist endet"/>
    <bpmn:manualTask id="Abgeben" name="Medium abgeben"/>
    <bpmn:task id="Pruefen" name="Medium prüfen"/>
    <bpmn:exclusiveGateway id="Frage" name="Vorgemerkt?"/>
    <bpmn:sendTask id="Benachrichtigen" name="Nächste Leserin benachrichtigen"/>
    <bpmn:task id="Einstellen" name="Medium einstellen"/>
    <bpmn:endEvent id="Ende" name="Erledigt"/>
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Abgeben"/>
    <bpmn:sequenceFlow id="F2" sourceRef="Abgeben" targetRef="Pruefen"/>
    <bpmn:sequenceFlow id="F3" sourceRef="Pruefen" targetRef="Frage"/>
    <bpmn:sequenceFlow id="F4" sourceRef="Frage" targetRef="Benachrichtigen" name="ja"/>
    <bpmn:sequenceFlow id="F5" sourceRef="Frage" targetRef="Einstellen" name="nein"/>
    <bpmn:sequenceFlow id="F6" sourceRef="Benachrichtigen" targetRef="Ende"/>
    <bpmn:sequenceFlow id="F7" sourceRef="Einstellen" targetRef="Ende"/>
  </bpmn:process>
</bpmn:definitions>
```

Zwei Beteiligte als Pools, mit Nachrichtenflüssen zwischen ihnen:

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://example.org/dokufix">
  <bpmn:collaboration id="Zusammenarbeit">
    <bpmn:participant id="Pool_Leserin" name="Leserin" processRef="P_Leserin"/>
    <bpmn:participant id="Pool_Bibliothek" name="Bibliothek" processRef="P_Bibliothek"/>
    <bpmn:messageFlow id="N1" name="Vormerkung" sourceRef="Vormerken" targetRef="Eingang"/>
    <bpmn:messageFlow id="N2" name="Abholbereit" sourceRef="Melden" targetRef="Bereit"/>
  </bpmn:collaboration>
  <bpmn:process id="P_Leserin" isExecutable="false">
    <bpmn:startEvent id="L_Start" name="Buch verliehen"/>
    <bpmn:sendTask id="Vormerken" name="Buch vormerken"/>
    <bpmn:intermediateCatchEvent id="Bereit" name="Abholbereit"><bpmn:messageEventDefinition id="Bereit_Def"/></bpmn:intermediateCatchEvent>
    <bpmn:manualTask id="Abholen" name="Buch abholen"/>
    <bpmn:endEvent id="L_Ende" name="Buch da"/>
    <bpmn:sequenceFlow id="L1" sourceRef="L_Start" targetRef="Vormerken"/>
    <bpmn:sequenceFlow id="L2" sourceRef="Vormerken" targetRef="Bereit"/>
    <bpmn:sequenceFlow id="L3" sourceRef="Bereit" targetRef="Abholen"/>
    <bpmn:sequenceFlow id="L4" sourceRef="Abholen" targetRef="L_Ende"/>
  </bpmn:process>
  <bpmn:process id="P_Bibliothek" isExecutable="false">
    <bpmn:startEvent id="Eingang" name="Vormerkung da"><bpmn:messageEventDefinition id="Eingang_Def"/></bpmn:startEvent>
    <bpmn:manualTask id="Zurueck" name="Buch zurücklegen"/>
    <bpmn:sendTask id="Melden" name="Leserin benachrichtigen"/>
    <bpmn:endEvent id="B_Ende" name="Benachrichtigt"/>
    <bpmn:sequenceFlow id="B1" sourceRef="Eingang" targetRef="Zurueck"/>
    <bpmn:sequenceFlow id="B2" sourceRef="Zurueck" targetRef="Melden"/>
    <bpmn:sequenceFlow id="B3" sourceRef="Melden" targetRef="B_Ende"/>
  </bpmn:process>
</bpmn:definitions>
```

**2. Mit Koordinaten:** Enthält das XML einen vollständigen `bpmndi:BPMNDiagram` mit Lagen für jedes Element, etwa aus dem Camunda Modeler, wird es genau so gezeichnet. Erfinde Koordinaten nicht selbst. Schon ein einziges `BPMNShape` schaltet die automatische Anordnung ab; was dann ohne Lage ist, fehlt im Bild.

## Stil

- Lieber Tabellen, Karten und Schrittlisten als lange Absätze. Jedes Element nur dort, wo es dem Leser hilft.
- Chips für Zustände, die sich ändern, Hinweise für das, was der Leser nicht übersehen darf. Ein Hinweis pro Abschnitt reicht.
- Über jedes Diagramm eine Überschrift, sie wird zu seinem Titel.
