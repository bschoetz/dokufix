---
title: Referenzdokument Stadtbibliothek
version: 3
date: 2026-10-02
author: Testautorin
status: Entwurf
tags:
  - referenz
  - vergleich
  - neutral
freigabe:
  rolle: Redaktion
  gueltig_bis: 2027-12-31
---

# Referenzdokument Stadtbibliothek

Dieses Dokument ist erfunden. Es dient nur dazu, alle vier Auslieferungen von dokufix mit **demselben Inhalt** zu bauen und Bild für Bild zu vergleichen. Die Ausleihe einer fiktiven Stadtbibliothek liefert den Stoff[^quelle]; fachlich stimmt daran nichts.

Es enthält jedes Element, für das dokufix eine Formatierung mitbringt: *kursiv*, **fett**, ~~durchgestrichen~~, `Inline-Code`, einen [Verweis](https://example.org/bibliothek) und eine Fußnote mit längerem Text[^lang].

[[toc]]

## Ausleihe

Wer ein Medium ausleiht, zeigt den Ausweis vor und nennt die Signatur. Die Frist beträgt vier Wochen[^quelle] und lässt sich zweimal verlängern.

### Voraussetzungen

- gültiger Bibliotheksausweis
- kein offenes Entgelt über 10 Euro
- höchstens 20 Medien gleichzeitig
  - davon höchstens 5 Spiele
  - davon höchstens 2 Geräte

### Ablauf

1. Medium am Regal entnehmen
2. Ausweis am Automaten scannen
3. Medium auf die Ablage legen
4. Beleg mitnehmen

```mermaid
flowchart LR
    A[Medium entnehmen] --> B{Ausweis gültig?}
    B -- ja --> C[Automat verbucht]
    B -- nein --> D[Theke]
    D --> C
    C --> E([Beleg])
```

#### Sonderfall Fernleihe

Medien aus anderen Häusern kommen über die Fernleihe. Die Frist setzt das gebende Haus[^quelle], nicht die Stadtbibliothek.

## Fristen und Entgelte

| Medium | Frist | Verlängerung | Entgelt je Woche Verzug |
|---|---|---|---|
| Buch | 28 Tage | zweimal | 1,00 € |
| Zeitschrift | 14 Tage | einmal | 0,50 € |
| Spiel | 14 Tage | keine | 2,00 € |
| Gerät | 7 Tage | keine | 5,00 € |

> **Merksatz.** Eine Verlängerung zählt ab dem Tag, an dem sie beantragt wird, nicht ab dem Ende der alten Frist.
>
> Das gilt auch für die Fernleihe.

### Abbildungen

Ein eingebettetes Bild, als `data:`-URI direkt im Quelltext:

![Farbstreifen als Platzhalter für einen Lageplan](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAABQCAIAAACoK28rAAABQUlEQVR42u3SwQmAMBQFwV9IsDyr9WgLuXgPOcYugk8GtoJlqrVD+k1lgYCWgJY2g75XRTTGjKvOK67en4iABhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEG+gugpfSAFtAS0NKGXo5eXcKHoytHAAAAAElFTkSuQmCC)

Ein Verweis auf ein Bild, das im Speicher fehlt:

![Fehlender Lageplan](#asset-0000000000000000000000000000000000000000000000000000000000000000)

## Rückgabe

Die Rückgabe läuft über den Automaten im Eingang oder über die Klappe an der Außenwand.

```mermaid
sequenceDiagram
    autonumber
    Leserin->>Automat: Medium einlegen
    Automat->>Katalog: Signatur melden
    Katalog-->>Automat: Konto entlastet
    Automat-->>Leserin: Beleg
```

### Schnittstelle des Automaten

Der Automat meldet jede Rückgabe als eine Zeile:

```json
{
  "signatur": "Gb 412/7",
  "zeitpunkt": "2026-10-02T09:30:00+02:00",
  "zustand": "in Ordnung"
}
```

## Status

Ein Status steht als Code-Spanne, die mit einem Farbpunkt, einem Leerzeichen und einem Text beginnt. Der Automat im Eingang ist `🟢 in Betrieb`, die Klappe an der Außenwand `🟡 gestört`, der Automat im Lesesaal `🔴 außer Betrieb`, der im Magazin `⚪ geplant` und der an der Theke `🔵 im Test`.[^status]

Derselbe Text in zwei Farben: `🟢 Test` neben `🔴 Test`, `⚪ x` neben `🔵 x`. Gewöhnlicher Code bleibt Code: `x`, `x 🟢`, `🟢` und `🟢x`.

| Gerät | Standort | Status |
|---|---|---|
| Automat 1 | Eingang | `🟢 in Betrieb` |
| Automat 2 | Lesesaal | `🔴 außer Betrieb` |
| Klappe | Außenwand | `🟡 gestört` |
| Automat 3 | Magazin | `⚪ geplant` |
| Automat 4 | Theke | `🔵 im Test` |

- in einer Liste: `🟢 in Betrieb`
- in einem Verweis: [`🔵 im Test`](https://example.org/automat)
- fett: **`🔴 außer Betrieb`**

Im Codeblock bleibt die Zeile, wie sie ist:

```text
🟢 in Betrieb
```

### Automat im Eingang `🟢 in Betrieb`

Eine Überschrift mit einem Status.

### `⚪️ geplant`

Eine Überschrift, die nur aus einem Status besteht; ihr Farbpunkt trägt einen Variantenselektor.

## Hinweise

Fünf Arten von Hinweisen, geschrieben wie die Alerts von GitHub: ein Zitat, dessen erste Zeile nur die Marke trägt.

> [!NOTE]
> Der Automat druckt den Beleg auf Wunsch ein zweites Mal. Maßgeblich ist das **Konto**, nicht der Beleg. Der Belegdrucker ist `🟢 in Betrieb`.

> [!TIP]
> Wer die Frist im Kalender führt, trägt den Tag der Verlängerung ein, nicht das Ende der alten Frist.

### Vor der Rückgabe

> [!IMPORTANT]
> ### Geräte vollständig abgeben
>
> Zu einem Gerät gehören Netzteil, Hülle und Anleitung. Fehlt ein Teil, bleibt das Konto belastet.

### Nach der Rückgabe

> [!WARNING]
> - Die Klappe an der Außenwand nimmt keine Geräte an.
> - Ist die Klappe voll, bleibt das Medium ausgeliehen.

> [!CAUTION]
> Beschädigte Akkus gehören nicht in den Automaten, sondern an die Theke.

## Karten

Ein Kommentar, der mit `dokufix:` beginnt, macht aus dem Block direkt danach einen Baustein. Vor einer Aufzählung macht `cards` aus jedem Eintrag eine Karte; der fette Text am Anfang ist ihr Titel.

<!-- dokufix: cards -->
- **Selbstverbuchung** Am Automaten im Eingang, ohne Wartezeit. Der Automat ist `🟢 in Betrieb`.
- **Theke** Mit Beratung, zu den Öffnungszeiten.
- **Fernleihe**  
  Über das Formular; die Frist setzt das gebende Haus.
- Vorab **fett** mittendrin: eine Karte ohne Titel.

Eine Aufzählung mit Leerzeilen zwischen den Einträgen, und eine Leerzeile zwischen Markierung und Liste:

<!-- dokufix: cards -->

- **Lesesaal** Ruhig, mit einer Steckdose an jedem Platz.

- **Gruppenraum** Für bis zu sechs Personen.

  Die Buchung läuft über die Theke.

## Schritte

Vor einer nummerierten Liste macht `steps` aus den Einträgen Schritte. Ein kursiver Anfang mit Doppelpunkt nennt, wer handelt.

<!-- dokufix: steps -->
1. *Leserin:* Medium auf die Ablage legen.
2. *Automat:* Signatur lesen und das Konto entlasten.[^automat]
3. *Nie* ein Medium ohne Beleg zurücklassen.
4. Beleg mitnehmen.

Zum Vergleich dieselbe Fußnote in einer nummerierten Liste ohne Markierung:

1. Signatur lesen und das Konto entlasten.[^automat]
2. Beleg mitnehmen.

Eine Liste, die mit 3 beginnt, zählt ab 3; ihre Einträge sind durch Leerzeilen getrennt:

<!-- dokufix: steps -->
3. *Katalog:* Vormerkung prüfen.

4. Medium in das Abholregal stellen.

### Zwei Markierungen vor einem Block

Jede wirkt für sich auf denselben Block: `cards` macht die Aufzählung zu Karten, `steps` wird zur Warnung.

<!-- dokufix: cards -->
<!-- dokufix: steps -->
- **Erste Karte** Die Markierung `cards` wirkt.
- **Zweite Karte** Die Markierung `steps` erwartet eine nummerierte Liste.

### Markierungen ohne Wirkung

Ein unbekannter Name:

<!-- dokufix: crads -->
- Diese Aufzählung bleibt eine Aufzählung.
- Die Warnung steht über ihr.

Der falsche Block, einmal eine Aufzählung und einmal eine Tabelle:

<!-- dokufix: steps -->
- eine Aufzählung, keine nummerierte Liste

<!-- dokufix: cards -->
| Raum | Plätze |
|---|---|
| Lesesaal | 40 |
| Gruppenraum | 6 |

Ein Absatz zwischen Markierung und Liste:

<!-- dokufix: cards -->
Dieser Absatz steht dazwischen.

- Auch diese Aufzählung bleibt eine Aufzählung.

Etwas hinter dem Namen, das die Markierung nicht kennt, ein Name mit Bindestrich und eine Markierung ohne Namen:

<!-- dokufix: cards zwei -->
- erster Eintrag

<!-- dokufix: side-note wichtig -->
- zweiter Eintrag

<!-- dokufix: -->
- dritter Eintrag

Eine Markierung mitten in einem Absatz <!-- dokufix: steps --> hat keinen Block hinter sich; ihre Warnung steht hinter dem Absatz.

Die Markierungen danach wirken weiter:

<!-- dokufix: steps -->
1. Dieser Schritt steht hinter allen Warnungen dieses Abschnitts.

### Was keine Markierung ist

Als Code bleibt die Markierung Text: `<!-- dokufix: cards -->`, auch im Codeblock:

```markdown
<!-- dokufix: steps -->
1. Erster Schritt
```

Ein anderer Kommentar bleibt, was er ist, und die Liste hinter ihm eine Liste:

<!-- Notiz der Redaktion: vor der Freigabe prüfen -->
- ein gewöhnlicher Eintrag

## Tabellen

Jede Tabelle steht in einer Hülle, die für sich seitwärts rollt. Eine Tabelle, die breiter ist als die Lesespalte, rollt dort, und die Seite bleibt so breit wie das Fenster:

| signatur_des_mediums | zeitpunkt_der_rueckgabe | zustand_bei_rueckgabe | standort_des_automaten | kennung_des_lesekontos | entgelt_je_woche_verzug | bearbeitungsvermerk |
|---|---|---|---|---|---|---|
| Gb 412/7 | 2026-10-02T09:30:00+02:00 | in Ordnung | Eingang | 0004711 | 1,00 € | keiner |
| Zs 88/3 | 2026-10-02T09:41:00+02:00 | Einband lose | Lesesaal | 0004712 | 0,50 € | an die Buchbinderei |

Auch in einem Hinweis und in einer Aufzählung steht eine Tabelle in ihrer Hülle:

> [!TIP]
> | Tag | Öffnung |
> |---|---|
> | Sonntag | geschlossen |

- an Feiertagen:

  | Tag | Öffnung |
  |---|---|
  | Neujahr | geschlossen |

### Unterzeile

Kursiver Text direkt nach einem Zeilenumbruch in einer Zelle wird zur Unterzeile. Kursiver Text an anderer Stelle bleibt, was er ist.

| Medium | Frist |
|---|---|
| **Buch**<br>*auch als Hörbuch* | 28 Tage |
| Zeitschrift  <br>  *nur das aktuelle Heft* | 14 Tage |
| Spiel<br>vollständig *und unbeschädigt* | 14 Tage |
| *Gerät* | 7 Tage |

Außerhalb einer Tabelle gibt es keine Unterzeile: ein Absatz mit Umbruch<br>*und kursivem Text danach.*

### Fußnote in einer Zelle

| Medium | Signatur |
|---|---|
| Buch[^zelle] | Gb 412/7 |
| Spiel | Sp 17/2 |

Zum Vergleich dieselbe Fußnote in einem Absatz direkt unter der Tabelle.[^zelle]

### Facetten

Die Markierung `facets` nennt eine Spalte. Über der Tabelle steht dann je Wert dieser Spalte ein Knopf, und wer einen wählt, sieht nur die Zeilen mit diesem Wert. Der Wert einer Zelle ist ihre erste Zeile.

<!-- dokufix: facets Typ -->
| Merkmal | Typ | Wer füllt es |
|---|---|---|
| `signatur` | Text | Katalog |
| `standort` | Kategorie | Katalog |
| `ausgeliehen_am` | Datum | Automat |
| `verlaengert`<br>`vorgemerkt` | Ja/Nein<br>*je eines* | Automat |
| `mahnstufe` | Zahl | Katalog |
| `zustand` | Kategorie | Theke |
| `rueckgabe_am` | Datum | Automat |
| `gesperrt` | Ja/Nein | Theke |
| `vermerk` | Text | Theke |

Über einer Spalte mit Status-Chips ist der Wert der Text des Chips:

<!-- dokufix: facets Status -->
| Gerät | Status |
|---|---|
| Automat 1 | `🟢 in Betrieb` |
| Automat 2 | `🔴 außer Betrieb`<br>*seit Montag* |
| Klappe | `🟢 in Betrieb` |
| Automat 3 | `⚪ geplant` |

Werte bleiben getrennt, auch wenn sie sich ähneln, in einer anderen Schrift stehen oder fehlen:

<!-- dokufix: facets Sprache -->
| Titel | Sprache |
|---|---|
| Handbuch A | C |
| Handbuch B | C++ |
| Handbuch C | C# |
| Handbuch D | 日本語 |
| Handbuch E | 中文 |
| Handbuch F | |

Was in einer Überschrift oder in einer Zelle wie HTML aussieht, bleibt Text, auch im Knopf:

<!-- dokufix: facets Zustand <img src=x onerror=window.dokufixAlarm=1> -->
| Zustand \<img src=x onerror=window.dokufixAlarm=1\> | Zahl |
|---|---|
| \<b\>neu\</b\> | 3 |
| gebraucht | 5 |

Eine Tabelle, die als HTML geschrieben ist, mit einer verbundenen Zelle:

<!-- dokufix: facets Plätze -->
<table>
<thead><tr><th>Raum</th><th>Plätze</th></tr></thead>
<tbody>
<tr><td colspan="2">Magazin, kein Zutritt</td></tr>
<tr><td>Lesesaal</td><td>40</td></tr>
<tr><td>Gruppenraum</td><td>6</td></tr>
</tbody>
</table>

Zwei Markierungen vor einer Tabelle: `facets` wirkt, `cards` wird zur Warnung.

<!-- dokufix: cards -->
<!-- dokufix: facets Öffnung -->
| Tag | Öffnung |
|---|---|
| Montag | 10 bis 18 Uhr |
| Dienstag | 10 bis 18 Uhr |
| Samstag | 10 bis 14 Uhr |

### Facetten ohne Wirkung

Eine Spalte, die es in der Tabelle nicht gibt, und eine Markierung, die keine Spalte nennt:

<!-- dokufix: facets Tpy -->
| Merkmal | Typ |
|---|---|
| `signatur` | Text |

<!-- dokufix: facets -->
| Merkmal | Typ |
|---|---|
| `standort` | Kategorie |

Der falsche Block, einmal eine Aufzählung und einmal ein Absatz:

<!-- dokufix: facets Typ -->
- eine Aufzählung, keine Tabelle

<!-- dokufix: facets Typ -->
Ein Absatz, keine Tabelle.

Mehr verschiedene Werte, als sich filtern lassen:

<!-- dokufix: facets Regal -->
| Regal | Sachgruppe |
|---|---|
| Regal 1 | Belletristik |
| Regal 2 | Biografien |
| Regal 3 | Erdkunde |
| Regal 4 | Geschichte |
| Regal 5 | Recht |
| Regal 6 | Wirtschaft |
| Regal 7 | Sprache |
| Regal 8 | Naturwissenschaft |
| Regal 9 | Medizin |
| Regal 10 | Technik |
| Regal 11 | Landwirtschaft |
| Regal 12 | Kunst |
| Regal 13 | Musik |
| Regal 14 | Sport |
| Regal 15 | Religion |
| Regal 16 | Philosophie |
| Regal 17 | Kinderbuch |
| Regal 18 | Comic |
| Regal 19 | Hörbuch |
| Regal 20 | Reise |
| Regal 21 | Kochen |
| Regal 22 | Garten |
| Regal 23 | Handwerk |
| Regal 24 | Film |
| Regal 25 | Spiele |
| Regal 26 | Fotografie |
| Regal 27 | Astronomie |
| Regal 28 | Mathematik |
| Regal 29 | Informatik |
| Regal 30 | Pädagogik |
| Regal 31 | Psychologie |
| Regal 32 | Politik |
| Regal 33 | Lyrik |

### Freitextfilter

Die Markierung `filter` gibt einer Tabelle ein Suchfeld, wo ein Skript läuft: im Editor, in der Datei mit Editor und in den Fassungen schlank und kompakt. Wer etwas eintippt, sieht nur die Zeilen, in denen der Text vorkommt. Die offene Fassung ohne Skript zeigt die ganze Tabelle ohne Suchfeld. Neben `facets` wirken beide zusammen:

<!-- dokufix: filter "Feld oder Zweck suchen …" -->
<!-- dokufix: facets Typ -->
| Feld | Typ | Wofür |
|---|---|---|
| `kennung` | Text | Eindeutige Nummer des Lesekontos, steht auf dem Ausweis |
| `name` | Text | Anrede auf dem Beleg und in Mahnungen |
| `geburtsjahr` | Zahl | Prüft, ob ein Medium mit Altersfreigabe ausgeliehen werden darf |
| `ausweis_bis`<br>`gebuehr_bis` | Datum<br>*je eines* | Ablauf von Ausweis und Jahresgebühr |
| `sperre` | Ja/Nein | Gesetzt nach der dritten Mahnung; die Theke hebt die Sperre auf |
| `mahnstufe` | Zahl | Wie oft gemahnt wurde |
| `vormerkungen` | Zahl | Offene Vormerkungen, höchstens fünf |
| `ort` | Text | Zweigstelle, in der Vormerkungen bereitliegen |
| `benachrichtigung` | Kategorie | Wie das Konto Nachricht bekommt: Post, E-Mail oder keine |
| `status` | Kategorie | `🟢 aktiv` oder ruhend |
| `newsletter` | Ja/Nein | Ob die Bibliothek Veranstaltungen ankündigen darf |
| `angelegt_am` | Datum | Wann das Konto eröffnet wurde |
| `notiz` | Text | Freier Vermerk der Theke, nie auf dem Beleg |
| `tarif` | Kategorie | Erwachsene, Ermäßigt oder Familie |

Ein Suchfeld allein, mit einer Fußnote in einer Zelle:

<!-- dokufix: filter "Zweigstelle suchen …" -->
| Zweigstelle | Öffnung | Rückgabe |
|---|---|---|
| Mitte[^suche] | Montag bis Samstag | Automat im Eingang |
| Nord | Dienstag bis Freitag | Theke |
| Süd | Montag, Mittwoch, Freitag | Klappe |
| Hafen | Samstag | Theke |

Zum Vergleich dieselbe Fußnote in einem Absatz direkt unter der Tabelle.[^suche]

Ohne Angabe hinter dem Namen hat das Suchfeld seinen gewöhnlichen Platzhalter:

<!-- dokufix: filter -->
| Ausweis | Jahresgebühr |
|---|---|
| Erwachsene | 20 € |
| Ermäßigt | 10 € |
| Familie | 30 € |

### Freitextfilter ohne Wirkung

Vor einer Aufzählung, vor einem Absatz und zweimal vor derselben Tabelle:

<!-- dokufix: filter "Suchen …" -->
- eine Aufzählung, keine Tabelle

<!-- dokufix: filter -->
Ein Absatz, keine Tabelle.

<!-- dokufix: filter "Erste Suche …" -->
<!-- dokufix: filter "Zweite Suche …" -->
| Raum | Plätze |
|---|---|
| Lesesaal | 40 |
| Gruppenraum | 6 |

## Prozessmodelle

Ein Prozess aus einem BPMN-Werkzeug, als XML mit Koordinaten: zwei Pools, drei Bahnen, Ereignisse, Gateways, Aufgaben verschiedener Art, eine Aufrufaktivität, Sequenz- und Nachrichtenflüsse.

### Rückgabe am Automaten

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitionen" targetNamespace="http://example.org/dokufix">
  <bpmn:collaboration id="Zusammenarbeit">
    <bpmn:participant id="Leserin" name="Leserin" processRef="Prozess_Leserin"/>
    <bpmn:participant id="Bibliothek" name="Stadtbibliothek" processRef="Prozess_Bibliothek"/>
    <bpmn:messageFlow id="N1" name="Medium" sourceRef="L_Einlegen" targetRef="B_Start"/>
    <bpmn:messageFlow id="N2" name="Beleg" sourceRef="B_Drucken" targetRef="L_Beleg"/>
    <bpmn:messageFlow id="N3" name="Nachricht" sourceRef="B_Ende" targetRef="Leserin"/>
  </bpmn:collaboration>
  <bpmn:process id="Prozess_Leserin" isExecutable="false">
    <bpmn:startEvent id="L_Start" name="Rückgabe fällig"/>
    <bpmn:manualTask id="L_Einlegen" name="Medium einlegen"/>
    <bpmn:intermediateCatchEvent id="L_Beleg" name="Beleg erhalten"><bpmn:messageEventDefinition id="L_Beleg_Def"/></bpmn:intermediateCatchEvent>
    <bpmn:endEvent id="L_Ende" name="Erledigt"/>
    <bpmn:sequenceFlow id="F1" sourceRef="L_Start" targetRef="L_Einlegen"/>
    <bpmn:sequenceFlow id="F2" sourceRef="L_Einlegen" targetRef="L_Beleg"/>
    <bpmn:sequenceFlow id="F3" sourceRef="L_Beleg" targetRef="L_Ende"/>
  </bpmn:process>
  <bpmn:process id="Prozess_Bibliothek" isExecutable="false">
    <bpmn:laneSet id="Prozess_Bibliothek_Bahnen">
      <bpmn:lane id="Automat" name="Automat"><bpmn:flowNodeRef>B_Start</bpmn:flowNodeRef><bpmn:flowNodeRef>B_Lesen</bpmn:flowNodeRef><bpmn:flowNodeRef>B_Lesbar</bpmn:flowNodeRef><bpmn:flowNodeRef>B_Buchen</bpmn:flowNodeRef><bpmn:flowNodeRef>B_Zusammen</bpmn:flowNodeRef><bpmn:flowNodeRef>B_Drucken</bpmn:flowNodeRef><bpmn:flowNodeRef>B_Teilen</bpmn:flowNodeRef><bpmn:flowNodeRef>B_Zaehlen</bpmn:flowNodeRef><bpmn:flowNodeRef>B_Vereinen</bpmn:flowNodeRef><bpmn:flowNodeRef>B_Ende</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Theke" name="Theke"><bpmn:flowNodeRef>T_Pruefen</bpmn:flowNodeRef><bpmn:flowNodeRef>T_Gebuehr</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Magazin" name="Magazin"><bpmn:flowNodeRef>M_Annehmen</bpmn:flowNodeRef><bpmn:flowNodeRef>M_Einstellen</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="B_Start" name="Medium eingelegt"><bpmn:messageEventDefinition id="B_Start_Def"/></bpmn:startEvent>
    <bpmn:serviceTask id="B_Lesen" name="Etikett lesen"/>
    <bpmn:exclusiveGateway id="B_Lesbar" name="Etikett lesbar?"/>
    <bpmn:scriptTask id="B_Buchen" name="Rückgabe buchen"/>
    <bpmn:exclusiveGateway id="B_Zusammen"/>
    <bpmn:sendTask id="B_Drucken" name="Beleg drucken"/>
    <bpmn:parallelGateway id="B_Teilen"/>
    <bpmn:task id="B_Zaehlen" name="Statistik zählen"/>
    <bpmn:parallelGateway id="B_Vereinen"/>
    <bpmn:endEvent id="B_Ende" name="Vormerkung gemeldet"><bpmn:messageEventDefinition id="B_Ende_Def"/></bpmn:endEvent>
    <bpmn:userTask id="T_Pruefen" name="Medium von Hand prüfen"/>
    <bpmn:businessRuleTask id="T_Gebuehr" name="Gebühr berechnen"/>
    <bpmn:receiveTask id="M_Annehmen" name="Medium annehmen"/>
    <bpmn:callActivity id="M_Einstellen" name="Medium einstellen"/>
    <bpmn:sequenceFlow id="F4" sourceRef="B_Start" targetRef="B_Lesen"/>
    <bpmn:sequenceFlow id="F5" sourceRef="B_Lesen" targetRef="B_Lesbar"/>
    <bpmn:sequenceFlow id="F6" name="ja" sourceRef="B_Lesbar" targetRef="B_Buchen"/>
    <bpmn:sequenceFlow id="F7" name="nein" sourceRef="B_Lesbar" targetRef="T_Pruefen"/>
    <bpmn:sequenceFlow id="F8" sourceRef="T_Pruefen" targetRef="T_Gebuehr"/>
    <bpmn:sequenceFlow id="F9" sourceRef="T_Gebuehr" targetRef="B_Zusammen"/>
    <bpmn:sequenceFlow id="F10" sourceRef="B_Buchen" targetRef="B_Zusammen"/>
    <bpmn:sequenceFlow id="F11" sourceRef="B_Zusammen" targetRef="B_Drucken"/>
    <bpmn:sequenceFlow id="F12" sourceRef="B_Drucken" targetRef="B_Teilen"/>
    <bpmn:sequenceFlow id="F13" sourceRef="B_Teilen" targetRef="B_Zaehlen"/>
    <bpmn:sequenceFlow id="F14" sourceRef="B_Teilen" targetRef="M_Annehmen"/>
    <bpmn:sequenceFlow id="F15" sourceRef="M_Annehmen" targetRef="M_Einstellen"/>
    <bpmn:sequenceFlow id="F16" sourceRef="B_Zaehlen" targetRef="B_Vereinen"/>
    <bpmn:sequenceFlow id="F17" sourceRef="M_Einstellen" targetRef="B_Vereinen"/>
    <bpmn:sequenceFlow id="F18" sourceRef="B_Vereinen" targetRef="B_Ende"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagramm">
    <bpmndi:BPMNPlane id="Ebene" bpmnElement="Zusammenarbeit">
      <bpmndi:BPMNShape id="Leserin_di" bpmnElement="Leserin" isHorizontal="true"><dc:Bounds x="0" y="0" width="1590" height="120"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Bibliothek_di" bpmnElement="Bibliothek" isHorizontal="true"><dc:Bounds x="0" y="180" width="1590" height="390"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Automat_di" bpmnElement="Automat" isHorizontal="true"><dc:Bounds x="30" y="180" width="1560" height="130"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Theke_di" bpmnElement="Theke" isHorizontal="true"><dc:Bounds x="30" y="310" width="1560" height="130"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Magazin_di" bpmnElement="Magazin" isHorizontal="true"><dc:Bounds x="30" y="440" width="1560" height="130"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="L_Start_di" bpmnElement="L_Start"><dc:Bounds x="72" y="42" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="45" y="83" width="90" height="27"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="L_Einlegen_di" bpmnElement="L_Einlegen"><dc:Bounds x="165" y="20" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="L_Beleg_di" bpmnElement="L_Beleg"><dc:Bounds x="822" y="42" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="795" y="10" width="90" height="27"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="L_Ende_di" bpmnElement="L_Ende"><dc:Bounds x="947" y="42" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="920" y="83" width="90" height="27"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="B_Start_di" bpmnElement="B_Start"><dc:Bounds x="227" y="227" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="200" y="268" width="90" height="27"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="B_Lesen_di" bpmnElement="B_Lesen"><dc:Bounds x="320" y="205" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="B_Lesbar_di" bpmnElement="B_Lesbar" isMarkerVisible="true"><dc:Bounds x="470" y="220" width="50" height="50"/><bpmndi:BPMNLabel><dc:Bounds x="450" y="188" width="90" height="27"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="B_Buchen_di" bpmnElement="B_Buchen"><dc:Bounds x="570" y="205" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="B_Zusammen_di" bpmnElement="B_Zusammen" isMarkerVisible="true"><dc:Bounds x="783" y="220" width="50" height="50"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="B_Drucken_di" bpmnElement="B_Drucken"><dc:Bounds x="883" y="205" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="B_Teilen_di" bpmnElement="B_Teilen"><dc:Bounds x="1033" y="220" width="50" height="50"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="B_Zaehlen_di" bpmnElement="B_Zaehlen"><dc:Bounds x="1133" y="205" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="B_Vereinen_di" bpmnElement="B_Vereinen"><dc:Bounds x="1408" y="220" width="50" height="50"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="B_Ende_di" bpmnElement="B_Ende"><dc:Bounds x="1540" y="227" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="1513" y="268" width="90" height="27"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="T_Pruefen_di" bpmnElement="T_Pruefen"><dc:Bounds x="570" y="335" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="T_Gebuehr_di" bpmnElement="T_Gebuehr"><dc:Bounds x="695" y="335" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="M_Annehmen_di" bpmnElement="M_Annehmen"><dc:Bounds x="1133" y="465" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="M_Einstellen_di" bpmnElement="M_Einstellen"><dc:Bounds x="1258" y="465" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="F1_di" bpmnElement="F1"><di:waypoint x="108" y="60"/><di:waypoint x="165" y="60"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F2_di" bpmnElement="F2"><di:waypoint x="265" y="60"/><di:waypoint x="822" y="60"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F3_di" bpmnElement="F3"><di:waypoint x="858" y="60"/><di:waypoint x="947" y="60"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F4_di" bpmnElement="F4"><di:waypoint x="263" y="245"/><di:waypoint x="320" y="245"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F5_di" bpmnElement="F5"><di:waypoint x="420" y="245"/><di:waypoint x="470" y="245"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F6_di" bpmnElement="F6"><di:waypoint x="520" y="245"/><di:waypoint x="570" y="245"/><bpmndi:BPMNLabel><dc:Bounds x="535" y="228" width="20" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F7_di" bpmnElement="F7"><di:waypoint x="495" y="270"/><di:waypoint x="495" y="375"/><di:waypoint x="570" y="375"/><bpmndi:BPMNLabel><dc:Bounds x="501" y="316" width="28" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F8_di" bpmnElement="F8"><di:waypoint x="670" y="375"/><di:waypoint x="695" y="375"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F9_di" bpmnElement="F9"><di:waypoint x="795" y="375"/><di:waypoint x="808" y="375"/><di:waypoint x="808" y="270"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F10_di" bpmnElement="F10"><di:waypoint x="670" y="245"/><di:waypoint x="783" y="245"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F11_di" bpmnElement="F11"><di:waypoint x="833" y="245"/><di:waypoint x="883" y="245"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F12_di" bpmnElement="F12"><di:waypoint x="983" y="245"/><di:waypoint x="1033" y="245"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F13_di" bpmnElement="F13"><di:waypoint x="1083" y="245"/><di:waypoint x="1133" y="245"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F14_di" bpmnElement="F14"><di:waypoint x="1058" y="270"/><di:waypoint x="1058" y="505"/><di:waypoint x="1133" y="505"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F15_di" bpmnElement="F15"><di:waypoint x="1233" y="505"/><di:waypoint x="1258" y="505"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F16_di" bpmnElement="F16"><di:waypoint x="1233" y="245"/><di:waypoint x="1408" y="245"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F17_di" bpmnElement="F17"><di:waypoint x="1358" y="505"/><di:waypoint x="1433" y="505"/><di:waypoint x="1433" y="270"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F18_di" bpmnElement="F18"><di:waypoint x="1458" y="245"/><di:waypoint x="1540" y="245"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="N1_di" bpmnElement="N1"><di:waypoint x="215" y="100"/><di:waypoint x="215" y="164"/><di:waypoint x="245" y="164"/><di:waypoint x="245" y="227"/><bpmndi:BPMNLabel><dc:Bounds x="221" y="125" width="44" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="N2_di" bpmnElement="N2"><di:waypoint x="933" y="205"/><di:waypoint x="933" y="142"/><di:waypoint x="840" y="142"/><di:waypoint x="840" y="78"/><bpmndi:BPMNLabel><dc:Bounds x="939" y="166" width="34" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="N3_di" bpmnElement="N3"><di:waypoint x="1558" y="227"/><di:waypoint x="1558" y="120"/><bpmndi:BPMNLabel><dc:Bounds x="1564" y="167" width="56" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

### Wöchentliches Sortieren

Ein Prozess ohne Pool, mit Zeitereignissen und inklusiven Gateways.

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitionen" targetNamespace="http://example.org/dokufix">
  <bpmn:process id="Prozess_Sortieren" isExecutable="false">
    <bpmn:startEvent id="S_Start" name="Montags"><bpmn:timerEventDefinition id="S_Start_Def"/></bpmn:startEvent>
    <bpmn:inclusiveGateway id="S_Was" name="Was ist zu tun?"/>
    <bpmn:task id="S_Regal" name="Regal ordnen"/>
    <bpmn:task id="S_Liste" name="Liste drucken"/>
    <bpmn:inclusiveGateway id="S_Fertig"/>
    <bpmn:intermediateCatchEvent id="S_Warten" name="Eine Stunde"><bpmn:timerEventDefinition id="S_Warten_Def"/></bpmn:intermediateCatchEvent>
    <bpmn:intermediateThrowEvent id="S_Gemeldet" name="Fertig gemeldet"><bpmn:messageEventDefinition id="S_Gemeldet_Def"/></bpmn:intermediateThrowEvent>
    <bpmn:endEvent id="S_Ende" name="Sortiert"/>
    <bpmn:sequenceFlow id="G1" sourceRef="S_Start" targetRef="S_Was"/>
    <bpmn:sequenceFlow id="G2" sourceRef="S_Was" targetRef="S_Regal"/>
    <bpmn:sequenceFlow id="G3" sourceRef="S_Was" targetRef="S_Liste"/>
    <bpmn:sequenceFlow id="G4" sourceRef="S_Regal" targetRef="S_Fertig"/>
    <bpmn:sequenceFlow id="G5" sourceRef="S_Liste" targetRef="S_Fertig"/>
    <bpmn:sequenceFlow id="G6" sourceRef="S_Fertig" targetRef="S_Warten"/>
    <bpmn:sequenceFlow id="G7" sourceRef="S_Warten" targetRef="S_Gemeldet"/>
    <bpmn:sequenceFlow id="G8" sourceRef="S_Gemeldet" targetRef="S_Ende"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagramm">
    <bpmndi:BPMNPlane id="Ebene" bpmnElement="Prozess_Sortieren">
      <bpmndi:BPMNShape id="S_Start_di" bpmnElement="S_Start"><dc:Bounds x="32" y="62" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="5" y="103" width="90" height="27"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="S_Was_di" bpmnElement="S_Was"><dc:Bounds x="145" y="55" width="50" height="50"/><bpmndi:BPMNLabel><dc:Bounds x="75" y="23" width="90" height="27"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="S_Regal_di" bpmnElement="S_Regal"><dc:Bounds x="240" y="-5" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="S_Liste_di" bpmnElement="S_Liste"><dc:Bounds x="240" y="85" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="S_Fertig_di" bpmnElement="S_Fertig"><dc:Bounds x="385" y="55" width="50" height="50"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="S_Warten_di" bpmnElement="S_Warten"><dc:Bounds x="512" y="62" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="485" y="103" width="90" height="27"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="S_Gemeldet_di" bpmnElement="S_Gemeldet"><dc:Bounds x="632" y="62" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="605" y="103" width="90" height="27"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="S_Ende_di" bpmnElement="S_Ende"><dc:Bounds x="752" y="62" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="725" y="103" width="90" height="27"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="G1_di" bpmnElement="G1"><di:waypoint x="68" y="80"/><di:waypoint x="145" y="80"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="G2_di" bpmnElement="G2"><di:waypoint x="170" y="55"/><di:waypoint x="170" y="35"/><di:waypoint x="240" y="35"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="G3_di" bpmnElement="G3"><di:waypoint x="170" y="105"/><di:waypoint x="170" y="125"/><di:waypoint x="240" y="125"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="G4_di" bpmnElement="G4"><di:waypoint x="340" y="35"/><di:waypoint x="410" y="35"/><di:waypoint x="410" y="55"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="G5_di" bpmnElement="G5"><di:waypoint x="340" y="125"/><di:waypoint x="410" y="125"/><di:waypoint x="410" y="105"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="G6_di" bpmnElement="G6"><di:waypoint x="435" y="80"/><di:waypoint x="512" y="80"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="G7_di" bpmnElement="G7"><di:waypoint x="548" y="80"/><di:waypoint x="632" y="80"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="G8_di" bpmnElement="G8"><di:waypoint x="668" y="80"/><di:waypoint x="752" y="80"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

### Übergabe an die Tourenplanung

BPMN-XML ohne Koordinaten, wie es ein Sprachmodell schreibt: ein Pool, vier Bahnen, 16 Symbole, 17 Flüsse. dokufix ordnet es selbst an; das XML bleibt, wie es ist, und bekommt nur den Koordinatenteil dazu.

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

### Ohne Bahnen

Ein Prozess ohne Pool und ohne Bahnen, ohne Koordinaten: alles in einer Reihe.

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitionen" targetNamespace="http://example.org/dokufix">
  <bpmn:process id="Prozess" isExecutable="false">
    <bpmn:startEvent id="Los" name="Medium zurück"/>
    <bpmn:task id="Aufgabe" name="Etikett scannen"/>
    <bpmn:intermediateCatchEvent id="Warten" name="Zwei Tage"><bpmn:timerEventDefinition id="Warten_Def"/></bpmn:intermediateCatchEvent>
    <bpmn:task id="Regal" name="Zurück ins Regal"/>
    <bpmn:endEvent id="Fertig" name="Wieder ausleihbar"/>
    <bpmn:sequenceFlow id="O1" sourceRef="Los" targetRef="Aufgabe"/>
    <bpmn:sequenceFlow id="O2" sourceRef="Aufgabe" targetRef="Warten"/>
    <bpmn:sequenceFlow id="O3" sourceRef="Warten" targetRef="Regal"/>
    <bpmn:sequenceFlow id="O4" sourceRef="Regal" targetRef="Fertig"/>
  </bpmn:process>
</bpmn:definitions>
```

### Zwei Schleifen

Ein erfundener Prozess mit zwei Schleifen in derselben Bahn, ohne Koordinaten: ein Pool, drei Bahnen, 14 Symbole, 15 Flüsse. Beide Rückflüsse laufen um die Reihe herum, jeder mindestens 12 px von den Aufgaben entfernt und durch keine Raute; die Beschriftungen der beiden Gateways stehen frei von Pfeilen und Symbolen.

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="Definitions_Hundemelken"
                  targetNamespace="http://example.com/bpmn">

  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_Melkbetrieb" name="Hundemelkbetrieb" processRef="Process_Hundemelken" />
  </bpmn:collaboration>

  <bpmn:process id="Process_Hundemelken" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_Melker" name="Melker">
        <bpmn:flowNodeRef>Start_Melkzeit</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Rufen</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Reinigen</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>GW_Ruhig</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Beruhigen</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Melken</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>GW_Alle</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Belohnen</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_Huendin" name="Hündin">
        <bpmn:flowNodeRef>Task_Kommen</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Abgeben</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_Verarbeitung" name="Verarbeitung">
        <bpmn:flowNodeRef>Task_Filtern</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Kuehlen</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Dokumentieren</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>End_Fertig</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>

    <!-- Lane Melker -->
    <bpmn:startEvent id="Start_Melkzeit" name="Melkzeit erreicht">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_Rufen" name="Hündin zum Melkstand rufen">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_Reinigen" name="Zitzen reinigen &amp; Euter massieren">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:incoming>Flow_7</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:task>
    <bpmn:exclusiveGateway id="GW_Ruhig" name="Hündin ruhig?">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
      <bpmn:outgoing>Flow_6</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:task id="Task_Beruhigen" name="Beruhigen &amp; Leckerli geben">
      <bpmn:incoming>Flow_6</bpmn:incoming>
      <bpmn:outgoing>Flow_7</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_Melken" name="Eine Zitze von Hand melken">
      <bpmn:incoming>Flow_5</bpmn:incoming>
      <bpmn:incoming>Flow_10</bpmn:incoming>
      <bpmn:outgoing>Flow_8</bpmn:outgoing>
    </bpmn:task>
    <bpmn:exclusiveGateway id="GW_Alle" name="Alle Zitzen gemolken?">
      <bpmn:incoming>Flow_9</bpmn:incoming>
      <bpmn:outgoing>Flow_10</bpmn:outgoing>
      <bpmn:outgoing>Flow_11</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:task id="Task_Belohnen" name="Hündin belohnen &amp; entlassen">
      <bpmn:incoming>Flow_11</bpmn:incoming>
      <bpmn:outgoing>Flow_12</bpmn:outgoing>
    </bpmn:task>

    <!-- Lane Hündin -->
    <bpmn:task id="Task_Kommen" name="Zum Melkstand kommen &amp; ablegen">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_Abgeben" name="Stillhalten &amp; Milch abgeben">
      <bpmn:incoming>Flow_8</bpmn:incoming>
      <bpmn:outgoing>Flow_9</bpmn:outgoing>
    </bpmn:task>

    <!-- Lane Verarbeitung -->
    <bpmn:task id="Task_Filtern" name="Milch filtern">
      <bpmn:incoming>Flow_12</bpmn:incoming>
      <bpmn:outgoing>Flow_13</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_Kuehlen" name="Auf 4 °C kühlen">
      <bpmn:incoming>Flow_13</bpmn:incoming>
      <bpmn:outgoing>Flow_14</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_Dokumentieren" name="Menge wiegen &amp; dokumentieren">
      <bpmn:incoming>Flow_14</bpmn:incoming>
      <bpmn:outgoing>Flow_15</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="End_Fertig" name="Milch eingelagert">
      <bpmn:incoming>Flow_15</bpmn:incoming>
    </bpmn:endEvent>

    <!-- Sequenzflüsse -->
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_Melkzeit" targetRef="Task_Rufen" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_Rufen" targetRef="Task_Kommen" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_Kommen" targetRef="Task_Reinigen" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_Reinigen" targetRef="GW_Ruhig" />
    <bpmn:sequenceFlow id="Flow_5" name="ja" sourceRef="GW_Ruhig" targetRef="Task_Melken" />
    <bpmn:sequenceFlow id="Flow_6" name="nein" sourceRef="GW_Ruhig" targetRef="Task_Beruhigen" />
    <bpmn:sequenceFlow id="Flow_7" sourceRef="Task_Beruhigen" targetRef="Task_Reinigen" />
    <bpmn:sequenceFlow id="Flow_8" sourceRef="Task_Melken" targetRef="Task_Abgeben" />
    <bpmn:sequenceFlow id="Flow_9" sourceRef="Task_Abgeben" targetRef="GW_Alle" />
    <bpmn:sequenceFlow id="Flow_10" name="nein" sourceRef="GW_Alle" targetRef="Task_Melken" />
    <bpmn:sequenceFlow id="Flow_11" name="ja" sourceRef="GW_Alle" targetRef="Task_Belohnen" />
    <bpmn:sequenceFlow id="Flow_12" sourceRef="Task_Belohnen" targetRef="Task_Filtern" />
    <bpmn:sequenceFlow id="Flow_13" sourceRef="Task_Filtern" targetRef="Task_Kuehlen" />
    <bpmn:sequenceFlow id="Flow_14" sourceRef="Task_Kuehlen" targetRef="Task_Dokumentieren" />
    <bpmn:sequenceFlow id="Flow_15" sourceRef="Task_Dokumentieren" targetRef="End_Fertig" />
  </bpmn:process>
</bpmn:definitions>
```

### Schleife über mehrere Schritte

Ein Rückfluss über drei Aufgaben hinweg zurück zur ersten: er läuft um die Reihe herum und dockt oben oder unten an.

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitionen" targetNamespace="http://example.org/dokufix">
  <bpmn:collaboration id="Zusammenarbeit">
    <bpmn:participant id="Mahnstelle" name="Mahnung" processRef="Prozess_Mahnung"/>
  </bpmn:collaboration>
  <bpmn:process id="Prozess_Mahnung" isExecutable="false">
    <bpmn:startEvent id="M_Start" name="Frist abgelaufen"/>
    <bpmn:task id="M_Erinnern" name="Leserin erinnern"/>
    <bpmn:task id="M_Notieren" name="Neue Frist notieren"/>
    <bpmn:task id="M_Pruefen" name="Rückgabe prüfen"/>
    <bpmn:exclusiveGateway id="M_Frage" name="Zurückgegeben?"/>
    <bpmn:endEvent id="M_Ende" name="Erledigt"/>
    <bpmn:sequenceFlow id="M1" sourceRef="M_Start" targetRef="M_Erinnern"/>
    <bpmn:sequenceFlow id="M2" sourceRef="M_Erinnern" targetRef="M_Notieren"/>
    <bpmn:sequenceFlow id="M3" sourceRef="M_Notieren" targetRef="M_Pruefen"/>
    <bpmn:sequenceFlow id="M4" sourceRef="M_Pruefen" targetRef="M_Frage"/>
    <bpmn:sequenceFlow id="M5" sourceRef="M_Frage" targetRef="M_Ende" name="ja"/>
    <bpmn:sequenceFlow id="M6" sourceRef="M_Frage" targetRef="M_Erinnern" name="nein"/>
  </bpmn:process>
</bpmn:definitions>
```

### Zwei Rückflüsse in einer Reihe

Zwei Rückflüsse auf derselben Seite der Reihe, einer um den anderen herum; ein dritter Weg vom ersten Gateway führt nach unten in die andere Bahn: jeder Rückfluss bekommt eine eigene Höhe, der kürzere liegt innen, keine zwei auf einer Linie.

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitionen" targetNamespace="http://example.org/dokufix">
  <bpmn:collaboration id="Zusammenarbeit">
    <bpmn:participant id="Erwerbung" name="Anschaffungswunsch" processRef="Prozess_Erwerbung"/>
  </bpmn:collaboration>
  <bpmn:process id="Prozess_Erwerbung" isExecutable="false">
    <bpmn:laneSet id="Bahnen">
      <bpmn:lane id="Z_Erwerbung" name="Erwerbung"><bpmn:flowNodeRef>Z_Start</bpmn:flowNodeRef><bpmn:flowNodeRef>Z_Aufnehmen</bpmn:flowNodeRef><bpmn:flowNodeRef>Z_Suchen</bpmn:flowNodeRef><bpmn:flowNodeRef>Z_Gefunden</bpmn:flowNodeRef><bpmn:flowNodeRef>Z_Preis</bpmn:flowNodeRef><bpmn:flowNodeRef>Z_Frei</bpmn:flowNodeRef><bpmn:flowNodeRef>Z_Bestellen</bpmn:flowNodeRef><bpmn:flowNodeRef>Z_Ende</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Z_Leserin" name="Leserin"><bpmn:flowNodeRef>Z_Absage</bpmn:flowNodeRef><bpmn:flowNodeRef>Z_Abgesagt</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Z_Start" name="Wunsch eingegangen"/>
    <bpmn:task id="Z_Aufnehmen" name="Wunsch aufnehmen"/>
    <bpmn:task id="Z_Suchen" name="Titel suchen"/>
    <bpmn:exclusiveGateway id="Z_Gefunden" name="Gefunden?"/>
    <bpmn:task id="Z_Preis" name="Preis prüfen"/>
    <bpmn:exclusiveGateway id="Z_Frei" name="Freigegeben?"/>
    <bpmn:task id="Z_Bestellen" name="Bestellen"/>
    <bpmn:endEvent id="Z_Ende" name="Bestellt"/>
    <bpmn:sendTask id="Z_Absage" name="Absage schreiben"/>
    <bpmn:endEvent id="Z_Abgesagt" name="Abgesagt"/>
    <bpmn:sequenceFlow id="Z1" sourceRef="Z_Start" targetRef="Z_Aufnehmen"/>
    <bpmn:sequenceFlow id="Z2" sourceRef="Z_Aufnehmen" targetRef="Z_Suchen"/>
    <bpmn:sequenceFlow id="Z3" sourceRef="Z_Suchen" targetRef="Z_Gefunden"/>
    <bpmn:sequenceFlow id="Z4" sourceRef="Z_Gefunden" targetRef="Z_Preis" name="ja"/>
    <bpmn:sequenceFlow id="Z5" sourceRef="Z_Gefunden" targetRef="Z_Suchen" name="nein"/>
    <bpmn:sequenceFlow id="Z10" sourceRef="Z_Gefunden" targetRef="Z_Absage" name="vergriffen"/>
    <bpmn:sequenceFlow id="Z6" sourceRef="Z_Preis" targetRef="Z_Frei"/>
    <bpmn:sequenceFlow id="Z7" sourceRef="Z_Frei" targetRef="Z_Bestellen" name="ja"/>
    <bpmn:sequenceFlow id="Z8" sourceRef="Z_Frei" targetRef="Z_Aufnehmen" name="nein"/>
    <bpmn:sequenceFlow id="Z9" sourceRef="Z_Bestellen" targetRef="Z_Ende"/>
    <bpmn:sequenceFlow id="Z11" sourceRef="Z_Absage" targetRef="Z_Abgesagt"/>
  </bpmn:process>
</bpmn:definitions>
```

### Rückfluss in einer mittleren Bahn

Ein Rückfluss in der mittleren von drei Bahnen: sein Weg bleibt in seiner Bahn, mindestens 12 px von ihrem Rand; wo der Platz fehlt, wird die Bahn höher.

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitionen" targetNamespace="http://example.org/dokufix">
  <bpmn:collaboration id="Zusammenarbeit">
    <bpmn:participant id="Fernleihe" name="Fernleihe" processRef="Prozess_Fernleihe"/>
  </bpmn:collaboration>
  <bpmn:process id="Prozess_Fernleihe" isExecutable="false">
    <bpmn:laneSet id="Bahnen">
      <bpmn:lane id="F_Leserin" name="Leserin"><bpmn:flowNodeRef>F_Start</bpmn:flowNodeRef><bpmn:flowNodeRef>F_Abholen</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="F_Theke" name="Theke"><bpmn:flowNodeRef>F_Aufnehmen</bpmn:flowNodeRef><bpmn:flowNodeRef>F_Pruefen</bpmn:flowNodeRef><bpmn:flowNodeRef>F_Frage</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="F_Leihverkehr" name="Leihverkehr"><bpmn:flowNodeRef>F_Senden</bpmn:flowNodeRef><bpmn:flowNodeRef>F_Ende</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="F_Start" name="Titel fehlt"/>
    <bpmn:task id="F_Aufnehmen" name="Bestellung aufnehmen"/>
    <bpmn:task id="F_Pruefen" name="Angaben prüfen"/>
    <bpmn:exclusiveGateway id="F_Frage" name="Angaben vollständig?"/>
    <bpmn:sendTask id="F_Senden" name="An den Leihverkehr senden"/>
    <bpmn:manualTask id="F_Abholen" name="Buch abholen"/>
    <bpmn:endEvent id="F_Ende" name="Bestellt"/>
    <bpmn:sequenceFlow id="F1" sourceRef="F_Start" targetRef="F_Aufnehmen"/>
    <bpmn:sequenceFlow id="F2" sourceRef="F_Aufnehmen" targetRef="F_Pruefen"/>
    <bpmn:sequenceFlow id="F3" sourceRef="F_Pruefen" targetRef="F_Frage"/>
    <bpmn:sequenceFlow id="F4" sourceRef="F_Frage" targetRef="F_Aufnehmen" name="nein"/>
    <bpmn:sequenceFlow id="F5" sourceRef="F_Frage" targetRef="F_Senden" name="ja"/>
    <bpmn:sequenceFlow id="F6" sourceRef="F_Senden" targetRef="F_Abholen"/>
    <bpmn:sequenceFlow id="F7" sourceRef="F_Senden" targetRef="F_Ende"/>
  </bpmn:process>
</bpmn:definitions>
```

### Rückfluss an einem Ereignis

Ein Rückfluss von einem Zwischenereignis zurück zu einem anderen: er dockt oben oder unten in der Mitte der Kreise an.

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitionen" targetNamespace="http://example.org/dokufix">
  <bpmn:process id="Prozess_Vormerkung" isExecutable="false">
    <bpmn:startEvent id="E_Start" name="Buch vorgemerkt"/>
    <bpmn:intermediateCatchEvent id="E_Warten" name="Buch zurück"><bpmn:messageEventDefinition id="E_Warten_Def"/></bpmn:intermediateCatchEvent>
    <bpmn:task id="E_Benachrichtigen" name="Leserin benachrichtigen"/>
    <bpmn:exclusiveGateway id="E_Frage" name="Abgeholt?"/>
    <bpmn:intermediateCatchEvent id="E_Frist" name="Eine Woche"><bpmn:timerEventDefinition id="E_Frist_Def"/></bpmn:intermediateCatchEvent>
    <bpmn:endEvent id="E_Ende" name="Ausgeliehen"/>
    <bpmn:sequenceFlow id="E1" sourceRef="E_Start" targetRef="E_Warten"/>
    <bpmn:sequenceFlow id="E2" sourceRef="E_Warten" targetRef="E_Benachrichtigen"/>
    <bpmn:sequenceFlow id="E3" sourceRef="E_Benachrichtigen" targetRef="E_Frage"/>
    <bpmn:sequenceFlow id="E4" sourceRef="E_Frage" targetRef="E_Ende" name="ja"/>
    <bpmn:sequenceFlow id="E5" sourceRef="E_Frage" targetRef="E_Frist" name="nein"/>
    <bpmn:sequenceFlow id="E6" sourceRef="E_Frist" targetRef="E_Warten"/>
  </bpmn:process>
</bpmn:definitions>
```

### BPMN ohne Wirkung

Die drei Blöcke werden zu je einer Warnung mit dem Grund, die Diagramme davor bleiben gezeichnet.

#### Kaputtes XML

```bpmn
<bpmn:definitions>kein BPMN
```

#### Mehrere Pools

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitionen" targetNamespace="http://example.org/dokufix">
  <bpmn:collaboration id="Zusammenarbeit">
    <bpmn:participant id="Leser" name="Leser" processRef="Prozess_Leser"/>
    <bpmn:participant id="Bib" name="Bibliothek" processRef="Prozess_Bib"/>
  </bpmn:collaboration>
  <bpmn:process id="Prozess_Leser" isExecutable="false">
    <bpmn:task id="Bestellen" name="Buch bestellen"/>
  </bpmn:process>
  <bpmn:process id="Prozess_Bib" isExecutable="false">
    <bpmn:task id="Liefern" name="Buch bereitlegen"/>
  </bpmn:process>
</bpmn:definitions>
```

#### Element ohne Bahn

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitionen" targetNamespace="http://example.org/dokufix">
  <bpmn:process id="Prozess" isExecutable="false">
    <bpmn:laneSet id="Bahnen">
      <bpmn:lane id="Theke" name="Theke"><bpmn:flowNodeRef>Annehmen</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>
    <bpmn:task id="Annehmen" name="Medium annehmen"/>
    <bpmn:task id="Verbuchen" name="Rückgabe verbuchen"/>
    <bpmn:sequenceFlow id="E1" sourceRef="Annehmen" targetRef="Verbuchen"/>
  </bpmn:process>
</bpmn:definitions>
```

## Herunterladen

Unter jedem gezeichneten Diagramm stehen kleine Knöpfe zum Herunterladen: die Quelle, `.mmd` oder `.bpmn`, und, wo ein Skript läuft, das Bild als `.svg`. Unter einer Warnung steht keiner.

### Gleicher Titel

Ein Mermaid-Diagramm, dessen Text `#`, `%`, `&` und Umlaute enthält, und ein BPMN-Prozess ohne Koordinaten unter derselben Überschrift: Ihre Dateien heißen `Gleicher-Titel.mmd` und `Gleicher-Titel-2.bpmn`.

```mermaid
flowchart LR
    %% Zeichen, die die URL kodieren muss: # % & ' " < >
    A["Mahnung #1 & Gebühr"] --> B["5 % Aufschlag über Öffnungszeit"]
```

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitionen" targetNamespace="http://example.org/dokufix">
  <bpmn:process id="Prozess" isExecutable="false">
    <bpmn:startEvent id="G_Start" name="Mahnung &amp; Gebühr"/>
    <bpmn:task id="G_Zahlen" name="5 % zahlen"/>
    <bpmn:endEvent id="G_Ende" name="Erledigt"/>
    <bpmn:sequenceFlow id="G1" sourceRef="G_Start" targetRef="G_Zahlen"/>
    <bpmn:sequenceFlow id="G2" sourceRef="G_Zahlen" targetRef="G_Ende"/>
  </bpmn:process>
</bpmn:definitions>
```

### Frist: 2/3 erreicht?

Ein Titel mit Zeichen, die ein Dateiname nicht trägt: `Frist--2-3-erreicht-.mmd`.

```mermaid
flowchart LR
    X[Frist] --> Y[Erinnerung]
```

---

## Schluss

Mehr steht hier nicht. Das Dokument endet mit den Fußnoten und, in den Auslieferungen ohne Editor, mit der Exportzeile.[^hinweis]

[^quelle]: Benutzungsordnung der fiktiven Stadtbibliothek, Abschnitt 4. Diese Fußnote wird absichtlich an drei Stellen zitiert, damit unten drei Rückwärtspfeile stehen.

[^lang]: Eine längere Fußnote mit `Code`, *Hervorhebung* und genug Text, dass die Vorschau umbrechen muss: Die Bibliothek führt für jedes Medium eine Signatur, einen Standort und einen Zustand; alle drei Angaben erscheinen auf dem Beleg, den der Automat bei Ausleihe und Rückgabe druckt.

[^automat]: Der Automat liest die Signatur vom Etikett des Mediums. Die Fußnote wird in einem Schritt und gleich darunter in einer gewöhnlichen nummerierten Liste zitiert.

[^zelle]: Die Signatur steht auf dem Etikett am Buchrücken. Diese Fußnote wird in einer Tabellenzelle und gleich darunter in einem Absatz zitiert; ihre Vorschau reicht über den Rand der Tabelle hinaus und darf dort nicht abgeschnitten sein.

[^suche]: Die Zweigstelle Mitte ist die Zentrale; dort liegen die Vormerkungen aller Zweigstellen zuerst. Diese Fußnote wird in einer Zelle einer Tabelle mit Suchfeld und gleich darunter in einem Absatz zitiert; ihre Vorschau steht dort, wo sie ohne Suchfeld stünde.

[^status]: Auch in einer Fußnote steht ein Status: `🟡 gestört` heißt, dass die Theke aushilft.

[^hinweis]: Die Exportzeile trägt Datum und Uhrzeit; der Vergleichslauf gibt die Uhrzeit deshalb vor.
