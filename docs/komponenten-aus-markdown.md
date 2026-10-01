# Komponenten aus Markdown

Analyse eines HTML-Prozessdokuments, das eine Kollegin mit einem LLM gebaut hat („die Vorlage“), und Überlegungen, wie Dokufix solche Seiten aus Markdown erzeugen kann.
Stand 1. Oktober 2026. Dokufix selbst (`poc/`) ist unverändert. Alle Tests liegen in `spikes/komponenten-aus-markdown/`.

**Zum Beispielinhalt.** Die Vorlage ist ein internes Dokument und liegt nicht im Repo. Der Spike hat sie zunächst wortgleich nachgebaut; im Repo steht stattdessen ein frei erfundenes Beispiel (`beispiel-prozesse.md`, „Hof Sonnenfeld“) mit derselben Gliederung und derselben Anzahl jeder Komponente. Aussagen über die Vorlage in Teil 1 beschreiben deren Aufbau, nicht ihren Inhalt. Messwerte zu Größen und Diagrammbreiten sind am neutralen Beispiel neu gemessen. Der Wortabgleich und die Bildvergleiche mit der Vorlage sind am Original gelaufen und lassen sich aus dem Repo nicht wiederholen.

## Ergebnis in Kürze

- Die Vorlage lässt sich vollständig aus **reinem Markdown** nachbauen. Das Beispiel im Repo hat denselben Aufbau: 591 Zeilen Markdown (davon 223 Zeilen BPMN-XML), 13 Abschnitte, 14 Tabellen, 5 Diagramme (drei mehr als in der Vorlage). Ergebnis: `spikes/komponenten-aus-markdown/dist/beispiel-prozesse.nur-lesen.html` (kein `<script>`).
- Dafür reichen **drei Mechanismen**, keiner erfindet Markdown-Syntax:
  1. Konventionen, die es schon gibt (GitHub-Alerts, GFM-Tabellen, Mermaid-Codeblöcke).
  2. HTML-Kommentare als Markierung für den nächsten Block (`<!-- dokufix: cards -->`). Unsichtbar in Renderern, die Roh-HTML durchlassen (GitHub, marked, Pandoc).
  3. Kleine DOM-Pässe nach `marked.parse()`, wie beim Inhaltsverzeichnis und den Fußnoten im PoC.
- **Swimlanes gibt es seit Mermaid 12** (10. September 2026) als `swimlane-beta`. Der unveränderte PoC rendert sie heute schon, weil er Mermaid ohne Versionsangabe vom CDN lädt.
- Das Mermaid-Layout ist Beta. Lineare Prozesse mit Entscheidungen gelingen. Auffächerungen (ein Gateway auf vier Empfänger) verheddern sich.
- **Echtes BPMN 2.0** geht mit `bpmn-js` (182 KB). Es braucht XML mit Koordinaten, also aus einem Modeler. Aus Text allein gibt es keine fertige Lösung mit Bahnen: `bpmn-auto-layout` verwirft Bahnen.
- Ein Umweg funktioniert: Mermaid-Text → Mermaids Anordnung → BPMN-XML mit Bahnen.
- **Beide BPMN-Wege sind im Spike eingebaut.** Prozess 1 entsteht aus Mermaid-Text, Prozess 2 aus BPMN-XML mit von Hand gesetzten Koordinaten. Beide quer wie in der Vorlage, als echtes BPMN gezeichnet, mit Download der `.bpmn`-Datei.
- **Weitere BPMN-Symbole aus Mermaid-Text:** Prozess 4 hat ein Diagramm bekommen, das es in der Vorlage nicht gibt, und zum Vergleich dasselbe noch zweimal aus BPMN-XML: mit von Hand gesetzten Koordinaten und ganz ohne Koordinaten.
- **BPMN-XML ohne Koordinaten** rendert der Spike jetzt auch. Die Anordnung kommt wie beim Mermaid-Text aus Mermaids Swimlane-Layout, die Bahnen bleiben erhalten. Es nutzt Parallel-Gateway, Nachrichten-Ereignis, Sende-, Benutzer- und Service-Aufgabe und Aufruf-Aktivität. Nachrichtenflüsse zwischen Pools gehen über diesen Weg nicht.
- **Große Ansicht:** Ein Klick auf ein Diagramm öffnet es bildschirmfüllend. Ohne JavaScript als Bild mit vier Zoomstufen, also auch im Export. Mit JavaScript läuft dort der `bpmn-js`-Viewer selbst: Mausrad-Zoom, Ziehen, bpmn.io-Logo.
- **Anordner verglichen:** Für BPMN mit Bahnen liefert nur Mermaid ein taugliches Bild. `bpmn-auto-layout` kennt keine Bahnen, ELK hat keinen fertigen Weg dafür und wiegt 1610 KB. Stand und Folgen stehen unter „Zwischenstand“.
- Der Freitextfilter braucht JavaScript und fällt im JS-freien Export weg. Ein Facettenfilter (Auswahl nach Spaltenwert) geht ohne JavaScript.

## Teil 1: Was in der Vorlage steckt

### Steckbrief

| Merkmal | Wert |
|---|---|
| Größe | 46 KB, 578 Zeilen, davon 7 KB CSS und 1,5 KB JavaScript |
| Form | HTML-Fragment ohne `<!DOCTYPE>`, `<html>`, `<body>`. Das ist das Format eines Claude-Artifacts. Als Datei geöffnet läuft sie im Quirks-Modus |
| Externe Abhängigkeit | Google Fonts (IBM Plex Sans, Serif, Mono). Offline greifen die Ersatzschriften |
| Quelle des Inhalts | Keine. Text, Layout und Diagrammkoordinaten stehen in einer Datei. Ändern heißt HTML editieren oder neu generieren |
| Farbschema | Hell und Dunkel über CSS-Variablen, umschaltbar per `prefers-color-scheme` und `data-theme` |
| Diagrammbreite | Das SVG hat 900 px Mindestbreite, die Lesespalte bietet 882 px. Es scrollt also immer um 18 px |

### Komponenten

| # | Komponente | Anzahl | Aufbau | Verhalten |
|---|---|---|---|---|
| 1 | Seitenrahmen | 1 | Raster aus 248 px Navigation und einer Lesespalte, maximal 1240 px | Unter 860 px einspaltig |
| 2 | Seitennavigation | 13 Links in 4 Gruppen | Titel, Unterzeile, Gruppenlabel in Mono-Versalien, Links mit linker Linie | Klebt beim Scrollen. Aktiver Abschnitt wird per `IntersectionObserver` markiert. Mobil als Zeile von Inline-Links |
| 3 | Abschnitt | 13 | `<section>` mit Trennlinie, Eyebrow (Mono, Versalien, Akzentfarbe), Serifen-Überschrift | Sprungziel der Navigation |
| 4 | Vorspann | 1 | Erster Absatz, 17 px, gedämpfte Farbe, 62 Zeichen breit | – |
| 5 | Status-Chip | 11 | Pille in Mono-Versalien. Drei Farben: grün (in Betrieb), gelb (geplant, teilweise), grau (Übergangslösung) | Steht in Überschriften und Tabellenzellen |
| 6 | Karten | 6 in 3 Rastern | Rahmen, Titel, ein Absatz. `auto-fit` mit mindestens 210 px | Bricht selbst um |
| 7 | Tabelle | 14 | Kopf in kleinen Versalien, nur waagerechte Linien, Scroll-Hülle | Zeile färbt sich beim Überfahren. Einmal `colspan` |
| 8 | Zellen-Unterzeile | 4 | Zweite Zeile in Mono, klein, grau (`.who`) | – |
| 9 | Schlüsselwort | 57 | Mono mit Akzent-Hintergrund (`.k`), technisch ein `code` | Bricht nicht um |
| 10 | Hinweis | 7 neutral, 3 Warnung | Fläche mit farbiger linker Kante, fetter Einstieg | Warnung hat gelbe Kante |
| 11 | Schrittliste | 3 Listen, 17 Schritte | Nummer als Kachel über CSS-Zähler, darüber der Akteur in Mono | Bei 13 Schritten mit Akteur, bei 4 ohne |
| 12 | Filterbare Tabelle | 1 | Suchfeld, Zähler „14 Zeilen“, Tabelle mit 14 Zeilen | Tippen blendet Zeilen aus, die den Text nicht enthalten |
| 13 | Ablaufdiagramm | 2 | Handgeschriebenes SVG, je 5 KB, 4 Bahnen | Farben über CSS-Klassen, folgt dem Farbschema. Scrollt waagerecht |

### Die Diagramme im Detail

Es ist kein BPMN, aber BPMN-Notation in Auswahl:

| Element | Darstellung | Diagramm 1 | Diagramm 2 |
|---|---|---|---|
| Bahn | Rechteck mit gedrehtem Titel links | 4 | 4 |
| Startereignis | Kreis, dünne Linie | 1 | 1 |
| Endereignis | Kreis, dicke Linie | 3 | 3 |
| Aufgabe | Abgerundetes Rechteck, zweizeilig | 6 | 10 |
| Geplante Aufgabe | Wie Aufgabe, gestrichelt und gelb | 2 | 0 |
| Exklusives Gateway | Raute mit Kreuz | 2 | 1 |
| Sequenzfluss | Durchgezogene Linie mit Pfeil, rechtwinklig | 12 | 17 |
| Nachrichtenfluss | Gestrichelte Linie | 1 | 1 |
| Kantenbeschriftung | Mono, fett („ja“, „nein“, „Bestätigungsmail“) | 5 | 0 |

Alle Koordinaten sind von Hand gesetzt, `viewBox` 1500 × 700 und 1500 × 760.

### Auffälligkeiten

| Befund | Wo | Folge |
|---|---|---|
| Drei Pfeile beginnen im Leeren | Diagramm 2, zu drei der vier Empfänger. Die senkrechte Sammellinie endet bei y = 470, die Abzweige liegen bei 530, 590, 650 | Im Screenshot sichtbar |
| Ein gestrichelter Pfeil endet im Leeren | Diagramm 2, über „Bestätigung an den Absender senden“ | Im Screenshot sichtbar |
| Zwei Linien liegen aufeinander | Diagramm 1, x = 620, Nachrichtenfluss und Sequenzfluss | Zwei Pfeilspitzen an einer Stelle |
| Pfeil läuft durch eine Beschriftung | Beide Diagramme, an Endereignissen | Die Beschriftung eines Endereignisses ist überdeckt |
| Schrift im Diagramm ist klein | 12,5 px bei 1500 Einheiten Breite, dargestellt auf 900 px (die Mindestbreite) | 7,5 px, gemessen. Dein Screenshot hat Skalierung 1,2, dort 9 Bildschirmpixel |
| Diagramm und Text weichen ab | Ein Schritt der Schrittliste ist im Diagramm keine Aufgabe | – |
| Schriften kommen von Google | `<link>` auf `fonts.googleapis.com` | Aufruf an Google bei jedem Öffnen, offline andere Schrift |

Die Diagrammfehler sind typisch für handgesetzte Koordinaten. Ein Layout aus einem Modell kann keine losen Enden erzeugen.

Gut gelöst: `aria-label` an den SVGs, verstecktes Label am Suchfeld, sichtbarer Fokus, `prefers-reduced-motion`.

## Teil 2: Umsetzung in Dokufix

### Leitplanken aus dem Projekt

| Leitplanke | Quelle | Folge für diese Komponenten |
|---|---|---|
| Keine Syntax-Erweiterungen | Distillate, Non-Goals | Nur vorhandene Konventionen und unsichtbare Markierungen |
| Jede Funktion in allen vier Export-Varianten, auch JS-frei | `epics.md` NFR1, NFR2 | Umformung beim Rendern, Ergebnis ist statisches HTML und CSS |
| Reines Markdown bleibt Fluchtweg | Unnegotiable Six, Nr. 5 | Die Quelle muss auch in GitHub lesbar sein |
| Kein CDN, eine Datei | Distillate | Jede Bibliothek kostet Dateigröße |
| CSS doppelt pflegen | NFR4, `READONLY_CSS` | Jede Komponente zahlt die Doppelpflege |

### Zuordnung Komponente → Markdown

So hat es der Spike umgesetzt.

| Komponente | Markdown | Mechanismus | Ohne JS | In fremden Renderern |
|---|---|---|---|---|
| Hinweis | `> [!NOTE]`, `> [!WARNING]` | DOM-Pass ersetzt das Blockzitat | ja | GitHub zeigt Alerts, sonst Blockzitat |
| Schlüsselwort | `` `PK_LETZTE` `` | Nur CSS | ja | Code-Span |
| Status-Chip | `` `🟢 in Betrieb` `` | DOM-Pass: Code-Span mit führendem 🟢 🟡 🔴 ⚪ 🔵 | ja | Code-Span mit Emoji |
| Karten | `<!-- dokufix: cards -->` vor einer Liste, Titel fett | Markierung setzt Klasse, Rest CSS | ja | Aufzählung |
| Schrittliste | `<!-- dokufix: steps -->` vor nummerierter Liste, Akteur als `*Website:*` | Markierung plus DOM-Pass für den Akteur | ja | Nummerierte Liste |
| Tabelle | GFM-Tabelle | DOM-Pass legt Scroll-Hülle an | ja | Tabelle |
| Zellen-Unterzeile | `<br>*auf der Website*` | Nur CSS (`td br + em`) | ja | Kursive zweite Zeile |
| Freitextfilter | `<!-- dokufix: filter "Platzhalter" -->` vor Tabelle | Laufzeit-JavaScript | **nein** | Tabelle |
| Facettenfilter | `<!-- dokufix: facets Typ -->` vor Tabelle | Radio-Buttons und erzeugte `:has()`-Regeln | ja | Tabelle |
| Navigation mit Gruppen | H1 = Titel, H2 = Gruppe, H3 = Abschnitt | DOM-Pass baut die Leiste | ja, ohne Scrollspy | Normale Überschriften |
| Eyebrow | – (aus der H2 abgeleitet) | DOM-Pass | ja | entfällt |
| Vorspann | – (erster Absatz nach der ersten H3) | Klasse beim Rendern | ja | Normaler Absatz |
| Ablaufdiagramm | Codeblock `mermaid` mit `swimlane-beta` | Mermaid 12 | ja, als SVG | Mermaid-Diagramm oder Code |
| Dasselbe als BPMN | `<!-- dokufix: bpmn "Name" -->` vor dem Mermaid-Codeblock | Mermaids Anordnung → BPMN-XML → `bpmn-js` | ja, als SVG | Mermaid-Diagramm oder Code |
| Weitere BPMN-Symbole | `{+}`, Zeichen am Textanfang (`((📨 …))`, `[📤 …]`, `[👤 …]`), `[[…]]` | Zuordnung beim Umwandeln in BPMN-XML | ja, als SVG | Raute mit Plus, Zeichen als Text im Knoten |
| BPMN aus einem Modeler | Codeblock `bpmn` mit dem XML | `bpmn-js` | ja, als SVG | Codeblock mit XML |
| BPMN ohne Koordinaten | Codeblock `bpmn` mit XML ohne BPMN-DI | XML → Mermaid-Text → Mermaids Anordnung → Koordinaten ins XML → `bpmn-js` | ja, als SVG | Codeblock mit XML |
| Geplante Aufgabe | `:::geplant` am Knoten | CSS | ja | Normale Aufgabe |
| Große Ansicht mit Zoom | – (jedes Diagramm) | Checkbox und Radio-Buttons, nur CSS. Mit JavaScript bei BPMN der laufende Viewer | ja, als Bild | entfällt |
| BPMN-Datei zum Herunterladen | – (jedes BPMN-Diagramm) | Link mit `data:`-Adresse | ja | entfällt |

So sieht dasselbe Markdown ohne Dokufix aus: `spikes/komponenten-aus-markdown/tests/out/degradiert-nur-marked.png`.

### Die Block-Markierung

```markdown
<!-- dokufix: cards -->
- **Weg A · Abo-Anfrage**\
  Jemand will regelmäßig beliefert werden.
- **Weg B · Probekiste**\
  Jemand will erst einmal probieren.
```

Ein Kommentar der Form `dokufix: name [argument]` gibt dem direkt folgenden Block die Klasse `dokufix-name`. Bekannt sind `cards`, `steps`, `filter`, `facets`. Ein unbekannter Name oder die falsche Blockart ergibt eine sichtbare Warnung im Dokument. Umsetzung: 20 Zeilen (`applyPragmas` in `src/komponenten.js`).

Alternativen:

| Variante | Beispiel | Verbreitung | In fremden Renderern |
|---|---|---|---|
| HTML-Kommentar | `<!-- dokufix: cards -->` | Eigene Konvention | unsichtbar, wenn Roh-HTML erlaubt ist. markdown-it in Grundeinstellung zeigt ihn als Text, MDX bricht ab |
| Attributliste | `{.cards}` nach dem Block | Pandoc, kramdown, markdown-it-attrs | sichtbarer Text `{.cards}` |
| Fenced Div | `::: cards` … `:::` | Pandoc, Quarto, Docusaurus, MyST | zwei sichtbare Zeilen `:::` |

Nachteile des Kommentars:

- Im Editor sieht man ihn, in der Vorschau nicht. Wer ihn löscht, bekommt wortlos eine normale Liste.
- Manche Import-Werkzeuge entfernen Kommentare.
- Er hängt daran, dass der Renderer Roh-HTML durchlässt. Dasselbe gilt für `<br>` in Tabellenzellen.

### Der Status-Chip

Vier Kandidaten. Der Spike nutzt den ersten.

| Variante | Beispiel | In fremden Renderern | Einwand |
|---|---|---|---|
| Code-Span mit Farbpunkt | `` `🟢 in Betrieb` `` | Code-Span mit Emoji | Emoji tippen ist umständlich. Code, der zufällig so beginnt (`` `🔴 = Fehler` ``), wird auch zum Chip. Der Punkt entfällt, die Bedeutung trägt dann nur noch die Farbe |
| Bracketed Span | `[in Betrieb]{.ok}` | sichtbar als Text | Fremdsyntax |
| Markierung | `==in Betrieb==` | je nach Renderer | Nur eine Farbe |
| Vokabular im Frontmatter | `status: { in Betrieb: ok }` | unsichtbar | Der YAML-Teilparser müsste Schlüssel mit Leerzeichen können |

### Tabellen

GFM deckt 13 von 14 Tabellen ab. Lücken:

| Lücke | Im Original | Im Spike | Mögliche Lösung |
|---|---|---|---|
| Verbundene Zellen | 1 × `colspan="2"` | Letzte Zelle leer | `marked-extended-tables` oder Roh-HTML für diese Tabelle |
| Zahlenspalte | Klasse `.num` | `tabular-nums` für alle Zellen | Reicht |
| Mehrere Schlüssel in einer Zelle | mehrere Schlüssel untereinander | `<br>` zwischen den Code-Spans | Reicht, ist aber in der Quelle eine lange Zeile |

### Filter

| Art | Bedienung | JS-frei | Kosten |
|---|---|---|---|
| Freitext | Suchfeld, Zähler | nein | 20 Zeilen Laufzeit-JS. Im `nur-lesen`-Export fehlt das Feld, die Tabelle bleibt vollständig |
| Facette | Knöpfe je Wert einer Spalte, mit Anzahl | ja | Je Wert eine erzeugte CSS-Regel, steht als `<style>` neben der Tabelle |

Beide zusammen wirken als UND. Geprüft mit abgeschaltetem JavaScript: 14 Zeilen, nach Klick auf „Datum“ 2 Zeilen.

Der Zähler des Freitextfilters weiß von der Facette nur mit JavaScript. Die Facette selbst zeigt feste Anzahlen.

### Navigation und Seitenrahmen

Dokufix hat die Leiste schon (rechts, H2 bis H4, mit Scrollspy und statischer Variante). Die Vorlage unterscheidet sich in drei Punkten:

| Unterschied | Vorlage | Dokufix heute | Spike |
|---|---|---|---|
| Position | links, klebend | rechts, ab 1500 px | links |
| Gruppen | 4 Gruppenlabel ohne eigenes Sprungziel | keine | H2 wird Gruppenlabel und Eyebrow, ist im Text nur für Screenreader da |
| Kurztitel | Die Navigation nennt einen kurzen Titel, die Überschrift den langen | Überschriftentext | Überschriftentext |

Das ist eine Layout-Entscheidung für das ganze Dokument, kein Inhalt. Sie gehört ins Frontmatter (etwa `layout: handbuch`) oder in die Ansichtseinstellungen, nicht in den Text.

### Diagramme und BPMN

Vier Wege, alle getestet.

| Weg | Eingabe in Markdown | Ergebnis | Größe | Befund |
|---|---|---|---|---|
| A. Mermaid-Flowchart mit Subgraphen | `flowchart LR` + `subgraph` | Kästen, keine Bahnen | schon da | Unbrauchbar als Swimlane. Bild: `tests/out/mermaid-flowchart-dagre.png` |
| B. Mermaid `swimlane-beta` | gleiche Syntax, anderes Schlüsselwort | Bahnen, rechtwinklige Kanten | schon da | Brauchbar mit Einschränkungen, siehe unten |
| C. `bpmn-js` mit BPMN-XML | Codeblock oder Asset mit XML aus einem Modeler | Normgerechtes BPMN mit Pool und Bahnen | +182 KB (51 KB gzip) | Sauber. Bild: `tests/out/bpmn-D-mit-koordinaten.png` |
| D. Text → BPMN-XML | Mermaid-Syntax | Echte `.bpmn`-Datei | +84 KB für Auto-Layout, oder 0 mit Mermaids Layout | Mit `bpmn-auto-layout` ohne Bahnen. Mit Mermaids Koordinaten mit Bahnen |

#### Weg B: Mermaid `swimlane-beta`

```
swimlane-beta TB
  subgraph Kunde
    s((Probekiste<br>entdeckt))
    a[Bestellung ausfüllen<br>und absenden]
  end
  subgraph Kundenkartei
    x{Erinnerungen<br>erlaubt?}
    h[Erinnerungsmails]:::geplant
  end
  s --> a
  a -. Bestätigungsmail .-> x
  x -- ja --> h
```

| Messung | Ergebnis |
|---|---|
| Unveränderter PoC | Rendert `swimlane-beta` mit 4 Bahnen. Er lädt Mermaid ohne Version, das CDN liefert 12.0.0. Bild: `tests/out/poc-unveraendert-swimlane.png` |
| Prozess 1 quer (`LR`) | 2611 × 1133 px. In einer 780-px-Spalte unlesbar oder scrollend |
| Prozess 1 hochkant (`TB`) | 889 × 1759 px. Passt in die Spalte |
| Abstände | `flowchart.rankSpacing` und `nodeSpacing` wirken. Quer bringt das nur 2611 → 2325 px |
| Farbschema | `themeCSS` mit CSS-Variablen. Das Diagramm folgt Hell und Dunkel ohne neues Rendern, auch im JS-freien Export |
| Prozess 2 mit Auffächerung auf 4 Empfänger | Kanten laufen außen um das Diagramm, Pfeile wirken falsch verbunden. Bilder: `tests/out/mermaid-p2-TB.png`, `mermaid-p2-LR.png` |
| Prozess 2, `ignoreCrossLaneEdges: false` | Besser, zwei Kanten laufen weiter außen herum, 1573 px breit |
| Prozess 2 vereinfacht (ein Zustellschritt statt Gateway und 4 Empfängern) | Sauber, 873 × 1046 px |
| Firefox 153 | Rendert gleich (2 Diagramme, 8 Bahnen, gleiche Maße) |

Einschränkungen:

- Ereignisse sind große Kreise mit Text innen, nicht kleine BPMN-Kreise mit Text darunter.
- Gateways haben kein Kreuz.
- Beschriftungen sind `foreignObject` (23 und 15 Stück). Das SVG taugt damit nicht als Bild für Word oder Confluence.
- Schrift per CSS nachträglich ändern schneidet Beschriftungen ab. Mermaid misst vor dem Rendern.
- Das Schlüsselwort heißt `-beta`. Es kann sich ändern.
- Jedes SVG trägt 8 KB eigenes CSS. Ein Diagramm wiegt rund 34 KB, eines der Vorlage 5 KB.

#### Weg C: `bpmn-js`

- `bpmn-viewer.production.min.js`: 182 KB, 51 KB gzip. Zum Vergleich Mermaid: 5445 KB, 1563 KB gzip.
- `saveSVG()` liefert 33 KB reines SVG mit `<text>`, ohne `foreignObject`.
- `bpmn-js` selbst braucht Koordinaten im XML (BPMN-DI). Das XML für Prozess 1 hat 9 KB. Fehlen sie, ordnet der Spike inzwischen selbst an, siehe „Im Spike eingebaut“.
- Lizenz, zwei Sätze (`node_modules/bpmn-js/LICENSE`): Der Code, der das bpmn.io-Logo einblendet, darf nicht entfernt oder geändert werden. Wo die Software in einer Website oder Anwendung läuft, muss das Logo voll sichtbar bleiben. Wie der Spike damit umgeht, steht unter „Im Spike eingebaut“.
- Passt zum Asset-Speicher: XML als Asset statt als 200 Zeilen im Text.

#### Weg D: Text → BPMN

- Mermaids Parser ist erreichbar: `mermaid.mermaidAPI.getDiagramFromText()` liefert Knoten, Kanten, Subgraphen. Kein zweiter Parser nötig.
- Abbildung: Kreis → Start- oder Endereignis, Doppelkreis → Endereignis, Raute → exklusives Gateway, Rechteck → Aufgabe, Subgraph → Bahn.
- `bpmn-auto-layout` 1.3.0: 0 Bahnen im Ergebnis, Beschriftungen überlappen. Bild: `tests/out/bpmn-A-autolayout-prozess.png`.
- Mermaids Swimlane-Koordinaten als BPMN-DI: valide Datei mit 4 Bahnen, `bpmn-js` meldet keine Warnungen. Bilder: `tests/out/bpmn-C-mermaid-layout-prozess1.png`, `…-prozess2.png`. Prozess 2 erbt das verhedderte Layout.
- Gestrichelte Kanten werden Sequenzflüsse. Nachrichtenflüsse erlaubt BPMN nur zwischen Pools, nicht zwischen Bahnen.

#### Im Spike eingebaut

Seit dem 1. Oktober abends rendert der Spike beide BPMN-Wege. Code: `src/bpmn.js` (43,3 KB mit Kommentaren).

| Diagramm | Eingabe | Breite | Ergebnis |
|---|---|---|---|
| Prozess 1, Probekiste | 37 Zeilen Mermaid-Text mit `<!-- dokufix: bpmn "Probekiste" -->` davor | 1485 px | BPMN mit Pool, 4 Bahnen, 14 Symbolen. Bild: `dist/screenshots/diagramm-1-gross-einpassen.png` |
| Prozess 2, Abo-Anfrage | 87 Zeilen BPMN-XML im Codeblock `bpmn`, erzeugt von `diagramme/abo-anfrage.mjs` mit von Hand gesetzten Koordinaten | 1300 px | Gateway mit 4 Empfängern, sauber. Bild: `dist/screenshots/diagramm-2-gross-einpassen.png` |
| Prozess 4, Übergabe an die Tourenplanung (nicht in der Vorlage) | 43 Zeilen Mermaid-Text mit `<!-- dokufix: bpmn "Übergabe an die Tourenplanung" -->` davor | 1811 px | BPMN mit Pool, 4 Bahnen, 16 Symbolen, darunter 2 Parallel-Gateways und 8 Symbole mit Nachricht, Benutzer, Service oder Aufruf. Bild: `dist/screenshots/diagramm-3-gross-einpassen.png` |
| Prozess 4 noch einmal, zum Vergleich | 89 Zeilen BPMN-XML im Codeblock `bpmn`, erzeugt von `diagramme/uebergabe.mjs` mit von Hand gesetzten Koordinaten | 1430 px | Dieselben 16 Symbole und 17 Kanten. Bild: `dist/screenshots/diagramm-4-gross-einpassen.png` |
| Prozess 4 ein drittes Mal | 47 Zeilen BPMN-XML ohne Koordinaten im Codeblock `bpmn`, von Hand geschrieben (`diagramme/uebergabe-ohne-koordinaten.bpmn`) | 1831 px | Dieselben 16 Symbole und 17 Kanten, angeordnet wie Diagramm 3. Bild: `dist/screenshots/diagramm-5-gross-einpassen.png` |

Zum Vergleich: Die Diagramme der Vorlage sind 1500 px breit, Mermaids eigenes Swimlane-Bild von Prozess 1 quer 2611 px.

**Wie aus Mermaid-Text ein kompaktes BPMN wird.** Mermaid entscheidet die Anordnung, Dokufix die Maße:

1. Mermaids Parser liefert Knoten, Kanten und Bahnen.
2. Mermaid zeichnet unsichtbar. Daraus kommen Positionen und Kantenverläufe.
3. Beide Achsen werden stückweise gestaucht: jede Spalte auf die Breite ihres größten BPMN-Symbols (Aufgabe 120 × 80, Ereignis 36, Gateway 50), jede Lücke auf 36 bis 70 px. Reihenfolgen und rechte Winkel bleiben erhalten.
4. Kantenenden docken an die kleineren Symbole an.
5. Fünf Korrekturen für Stellen, an denen Mermaid selbst unsauber routet: Kanten, die durch ein Nachbarsymbol liefen, laufen außen herum. Ein- und ausgehender Pfeil an derselben Stelle rücken auseinander. Beschriftungen bekommen feste Plätze. Zacken von wenigen Pixeln werden geglättet. Verlassen zwei Kanten ein Gateway an derselben Ecke, nimmt die abbiegende die freie Ecke, und die Beschriftungen wandern von der Ecke auf die Kantenmitte.
6. Das XML geht durch `bpmn-js`, heraus kommt ein SVG ohne `foreignObject`.

**Weitere Symbole aus Mermaid-Text.** Die Mermaid-Form legt die Grundart fest, ein Zeichen am Textanfang die genaue BPMN-Art. Das ist derselbe Mechanismus wie beim Status-Chip. Reines Mermaid zeigt das Zeichen als Text im Knoten.

| Mermaid | BPMN |
|---|---|
| `{Text}` | Exklusives Gateway (wie bisher) |
| `{+}` | Parallel-Gateway |
| `{o}` | Inklusives Gateway |
| `((✉ …))`, `((📨 …))`, `((📥 …))` | Nachrichten-Ereignis: am Start, als empfangendes Zwischenereignis, am Ende |
| `((📤 …))` | Sendendes Nachrichten-Zwischenereignis |
| `((⏱ …))` | Timer-Ereignis, am Start oder als Zwischenereignis |
| `[✉ …]`, `[📤 …]` | Sende-Aufgabe |
| `[📨 …]`, `[📥 …]` | Empfangs-Aufgabe |
| `[👤 …]`, `[⚙ …]`, `[✋ …]` | Benutzer-, Service-, Handaufgabe |
| `[[…]]` | Aufruf-Aktivität |

Passt ein Zeichen nicht zur Form (Timer an einer Aufgabe), bleibt es sichtbar im Namen stehen. Anders als „geplant“ steht die Art im XML: Die heruntergeladene `.bpmn` enthält `parallelGateway`, `sendTask`, `messageEventDefinition`.

**BPMN-XML ohne Koordinaten.** Fehlt im XML der Koordinatenteil (kein `BPMNShape`), ordnet der Spike selbst an:

1. Das XML wird gelesen: Bahnen, Knoten, Sequenzflüsse. Unterstützt ist ein Prozess, mit oder ohne Pool.
2. Daraus entsteht intern Mermaid-Swimlane-Text, nur für die Anordnung.
3. Ab hier derselbe Weg wie beim Mermaid-Text: Mermaids Anordnung, gestaucht auf BPMN-Maße.
4. Das Original-XML bleibt unverändert und bekommt den Koordinatenteil angehängt. Der Download enthält also eine Datei mit Koordinaten.

Vorher endete solches XML mit der Warnung „no diagram to display“. Ein Element ohne Bahn oder ein zweiter Pool ergibt weiter eine sichtbare Warnung.

**Derselbe Ablauf dreimal.** Die Symbole sind in allen Fassungen dieselben, `build.mjs` prüft das. Der Unterschied liegt in der Anordnung und im Schreibaufwand.

| | Aus Mermaid-Text (Diagramm 3) | Aus BPMN-XML mit Koordinaten (Diagramm 4) | Aus BPMN-XML ohne Koordinaten (Diagramm 5) |
|---|---|---|---|
| Quelle | 43 Zeilen, 1,0 KB | 89 Zeilen XML, 12 KB, dazu 69 Zeilen Skript mit den Koordinaten | 47 Zeilen XML, 4,1 KB |
| Breite | 1811 px | 1430 px | 1831 px |
| Anordnung | Mermaid: jede Bahn eine Reihe, „Anfrage“ läuft unter dem Endereignis „Abwesenheit“ durch | von Hand: „Abwesenheit“ liegt über dem Hauptweg, „Anfrage“ läuft gerade | wie Diagramm 3, dieselbe Anordnung aus Mermaid |
| Gestrichelte Kante | ja, über `-.->` | nein, BPMN kennt das nicht | nein |
| ids im Download | erzeugt (`N1_s`, `F1`) | eigene | eigene |
| Ändern | Text ändern, Anordnung folgt | Koordinaten nachziehen, oder in einem Modeler | XML ändern, Anordnung folgt |
| In fremden Renderern | Mermaid-Diagramm oder Code | Codeblock mit XML | Codeblock mit XML |

**Große Ansicht.** Der Rahmen des Diagramms wird selbst zum Vollbild, es gibt kein zweites SVG. Eine Checkbox schaltet um. Was darin zu sehen ist, hängt davon ab, ob JavaScript und `bpmn-js` in der Seite sind:

| | Ohne JavaScript (Export `nur-lesen`) | Mit JavaScript (`spike.html`) |
|---|---|---|
| Inhalt | das Bild aus `saveSVG()` | der laufende `bpmn-js`-Viewer, aus dem XML im Download-Link |
| Zoom | Einpassen, 100 %, 150 %, 200 % über Radio-Buttons | dieselben Stufen, dazu Strg + Mausrad, + und − |
| Verschieben | Rollbalken | Ziehen mit der Maus |
| Schließen | Knopf „Schließen“ | Knopf oder Esc |
| bpmn.io-Logo | nicht enthalten, die Bibliothek läuft hier nicht | sichtbar unten rechts, vom Viewer selbst eingeblendet |
| „Geplant“, „gestrichelt“, Farbschema | ja | ja |

Mermaid-Diagramme ohne BPMN zeigen immer das Bild wie in der linken Spalte. Mit JavaScript kommen Esc sowie + und − dazu.

| Messung | Ergebnis |
|---|---|
| Schrift in der Spalte (882 px) | 7 px. Wie in der Vorlage eine Übersicht, gelesen wird in der großen Ansicht |
| Schrift in der großen Ansicht | 12 px bei 100 %, 18 px bei 150 % |
| Große Ansicht ohne JavaScript | Klick öffnet, 150 % ergibt 2228 px Breite bei Prozess 1, „Schließen“ schließt. In Chromium geprüft, Öffnen auch in Firefox 153 |
| Große Ansicht mit JavaScript | Viewer startet, Logo ist sichtbar und unverdeckt, 150 % stellt den Viewer auf 1,5, Strg + Mausrad vergrößert, Ziehen verschiebt, nach dem Schließen ist der Viewer entfernt. Hell und dunkel in Chromium, Start mit Logo auch in Firefox 153 |
| Farbschema | Farben sind CSS-Variablen im SVG. Hell und Dunkel ohne neues Rendern |
| `bpmn-js` | Wird nur geladen, wenn das Dokument BPMN enthält. Geladen wird der Viewer mit Zoom und Verschieben (195 KB, 55 KB gzip) |
| Größe | Die fünf SVGs wiegen 28, 29, 39, 39 und 39 KB. Die Download-Links tragen das XML noch einmal: 16, 18, 18, 19 und 17 KB |

Grenzen:

- Die Güte hängt weiter an Mermaids Anordnung. Die Auffächerung von Prozess 2 habe ich über diesen Weg nicht erneut versucht, sie läuft im Spike über XML.
- Nachrichtenflüsse gehen nicht. BPMN erlaubt sie nur zwischen Pools, und `swimlane-beta` kennt nur eine Ebene: Verschachtelte `subgraph` werden nicht zu Bahnen in einem zweiten Pool, die inneren verschwinden im Bild. Nachrichten gibt es deshalb nur als Ereignis und als Aufgabe.
- Mermaid stellt alle Knoten einer Bahn in eine Reihe. Parallele Zweige in derselben Bahn laufen deshalb hintereinander und verheddern sich. Sauber wird es, wenn die Zweige in verschiedenen Bahnen liegen.
- Im Diagramm zu Prozess 4 laufen „Persönlich antworten“ und „Status setzen“ parallel, in der Schrittliste darunter stehen sie nacheinander. Das ist eine Modellierungsentscheidung, um das Parallel-Gateway zu zeigen.
- Eine Kantenbeschriftung kann eine andere Kante kreuzen („Bestätigungsmail“ in Prozess 1).
- „Geplant“ und „gestrichelt“ sind nur Darstellung. In der heruntergeladenen `.bpmn` sind es normale Aufgaben und Sequenzflüsse.
- Hochkant (`swimlane-beta TB`) funktioniert, ist aber weniger ausgearbeitet.
- Die große Ansicht hält den Tastaturfokus nicht im Dialog fest.
- Mausrad, Ziehen und Tasten sind mit synthetischen Eingaben geprüft. Bitte von Hand ansehen.
- Ob die erzeugte `.bpmn` in Camunda Modeler oder Signavio sauber öffnet, ist nicht geprüft. `bpmn-js` liest sie ohne Warnung.
- Lizenz: `bpmn-js` ist unverändert. Der Export enthält nur die Ausgabe der offiziellen Exportfunktion `saveSVG()`, die Bibliothek läuft dort nicht. Wo sie läuft und etwas zeigt, in der großen Ansicht mit JavaScript, steht ihr Logo sichtbar. Beim Rendern selbst arbeitet sie kurz unsichtbar. Unter jedem BPMN-Diagramm bleibt zusätzlich der Verweis „gerendert mit bpmn.io“ (Entscheidung Ben, 1. Oktober). Das ist eine Lesart des Wortlauts, keine Rechtsauskunft.
- Das Logo ist fest dunkelgrau. Im Dunkelmodus liegt deshalb eine helle Fläche dahinter, das Logo selbst bleibt unangetastet.
- Dieser Teil ist nach dem Code-Review entstanden und hat keinen unabhängigen Review.

#### Andere Anordner für XML ohne Koordinaten

Geprüft an Prozess 4 (16 Symbole, 17 Kanten, 4 Bahnen). Kennzahlen aus dem erzeugten BPMN-DI, berechnet von `tests/elk-test.mjs`.

| Anordner | Bahnen | Breite × Höhe | Kreuzungen | Knicke | Kanten aufeinander | Bild |
|---|---|---|---|---|---|---|
| von Hand (Diagramm 4) | 4 | 1420 × 565 | 0 | 5 | 0 px | `dist/screenshots/diagramm-4-gross-einpassen.png` |
| Mermaid `swimlane-beta` (Diagramm 5, wie gebaut) | 4 | 1821 × 517 | 0 | 7 | 63 px | `dist/screenshots/diagramm-5-gross-einpassen.png` |
| `bpmn-auto-layout` 1.3.0 | keine | – | – | – | – | `tests/out/prozess4-bpmn-auto-layout.png` |
| ELK, flach ohne Bahnen | keine | 1948 × 479 | 0 | 12 | 0 px | `tests/out/elk-flach.png` |
| ELK, Bahnen als Gruppenknoten | 4, aber nebeneinander statt untereinander | 2182 × 429 | 1 | 22 | 0 px | `tests/out/elk-gruppen.png` |
| ELK, Gruppenknoten mit Ankern in erster und letzter Schicht | 4, drei Überlappungen | 2192 × 505 | 1 | 22 | 0 px | `tests/out/elk-anker.png` |
| ELK, Bahnhöhen vorgegeben (`INTERACTIVE`) | 4, untereinander | 1986 × 792 | 4 | 42 | 0 px | `tests/out/elk-vorgabe.png` |

- `bpmn-auto-layout` liest Bahnen nicht (`laneSet` kommt im Code nicht vor). Es ordnet nach Verzweigung in ein Raster, die Zeile sagt „wievielter Zweig“, nicht „wer“. Es braucht außerdem `incoming` und `outgoing` an jedem Element, sonst zeichnet es keine Kante.
- ELK (`elkjs` 0.12.0) wiegt 1610 KB, 469 KB gzip. Das Layout selbst braucht 25 bis 150 ms.
- ELK ohne Bahnen ist sauber. Mit Bahnen gibt es keinen fertigen Weg: Gruppenknoten werden wie Knoten im Fluss angeordnet, also nebeneinander. Die Partitionierung von ELK wirkt entlang der Flussrichtung, Bahnen liegen quer dazu.
- Mit vorgegebenen Höhen stehen die Bahnen richtig, aber lange Kanten laufen Umwege über die oberste Bahn. Ihre Hilfsknoten haben keine Vorgabe und landen oben. Ein Knoten ragt 4 px aus seiner Bahn.
- Nicht versucht: ELK nur für die Schichten nehmen und Höhen und Kanten selbst setzen. Das wäre ein eigener Anordner mit 1,6 MB Bibliothek für den leichtesten Teil.

#### Mehrere Pools ohne Koordinaten (Versuch)

Am 1. Oktober abends ausprobiert, weil ein LLM für „Kunde fragt an, Firma antwortet“ gern zwei Pools mit Nachrichtenflüssen schreibt. Mermaid kennt nur eine Ebene, verschachtelte Bahnen verschwinden dort. Der Versuch geht deshalb so vor:

1. Alle Bahnen aller Pools gehen als eine flache Swimlane an Mermaid. Ein Pool ohne Bahnen zählt als eine Bahn.
2. Nachrichtenflüsse gehen als Kanten mit. Dadurch stehen Senden und Empfangen in beiden Pools an passender Stelle.
3. Danach bekommt jeder Pool seinen eigenen Rahmen, zwischen zwei Pools kommen 40 px Abstand.
4. Drei Korrekturen: Nachrichtenflüsse docken von unten oder oben an statt von der Seite. Sequenzflüsse bleiben in ihrem Pool. Ein Abgang, der ein Gateway auf der Seite der ankommenden Kante verlässt, startet an der Ecke in seiner Richtung.

| Beispiel | Pools | Bahnen | Sequenzflüsse | Nachrichtenflüsse | Breite × Höhe | Bild |
|---|---|---|---|---|---|---|
| `diagramme/abo-zwei-pools.bpmn` | 2 | 3 | 14 | 3 | 1599 × 571 | `tests/out/abo-zwei-pools.png` |
| `diagramme/bestellung-drei-pools.bpmn` | 3 | 2 | 19 | 5 | 2324 × 593 | `tests/out/bestellung-drei-pools.png` |

Befund: Das erste Beispiel ist sauber. Das zweite ist lesbar, hat aber sichtbare Schwächen:

- Im Pool „Kunde“ kommt eine Kante von oben in ein Ereignis, dessen Beschriftung dort steht, weil von unten der Nachrichtenfluss ankommt.
- Ein Sequenzfluss läuft dicht am unteren Poolrand und wird dort von einem Nachrichtenfluss gekreuzt.
- Das Diagramm ist 2324 px breit.

Grenzen: Ein Pool ohne eigenen Prozess (Black Box) und Nachrichtenflüsse, die an einem Pool statt an einem Element hängen, ergeben eine Warnung. Geprüft sind nur diese zwei Beispiele. Die bisherigen Diagramme bleiben unverändert (Diagramm 5 ist bytegleich). Aufruf: `node tests/zwei-pools.mjs`.

#### Roh-SVG im Markdown

Ein handgeschriebenes SVG als Roh-HTML in Markdown: geht nur ohne Leerzeilen. Am SVG der Vorlage machte marked mit dessen 3 Leerzeilen aus 46 der 74 Elemente sichtbaren Code. `tests/svg-in-markdown.mjs` zeigt denselben Effekt an einem kleinen eigenen SVG (2 von 7 Elementen). Als Bild-Asset scheidet es aus, der PoC wandelt Bilder in WebP.

### Größen

| Datei | roh | gzip |
|---|---|---|
| Die Vorlage (nicht im Repo) | 46 KB | 13 KB |
| Das Beispiel als Markdown, mit den drei Diagrammen zu Prozess 4 | 47 KB, davon 28 KB BPMN-XML | – |
| Spike-Export ohne JS | 309 KB | 45 KB |
| davon die fünf BPMN-SVGs | 172 KB | – |
| davon die fünf BPMN-Downloads | 88 KB | – |
| Komponenten-Code im Spike | 16,4 KB + 43,3 KB (BPMN) JS, 14,0 KB CSS | – |
| Mermaid 12 komplett | 5445 KB | 1563 KB |
| Mermaid, nur Kern + Flowchart + Swimlane (Schätzung über statische Importe, nicht gebaut) | 974 KB | 272 KB |
| `elkjs` 0.12.0 (nur geprüft, nicht eingebaut) | 1610 KB | 469 KB |
| `bpmn-js` Viewer | 182 KB | 51 KB |
| `bpmn-js` Viewer mit Zoom und Verschieben (im Spike geladen) | 195 KB | 55 KB |
| marked 18 | 46 KB | 14 KB |

Das README des PoC nennt für gebündeltes Mermaid „rund 3 MB“. Mit Version 12 sind es 5,4 MB.

## Teil 3: Was getestet wurde

Alles in `spikes/komponenten-aus-markdown/`. Aufruf: `npm install`, dann `node build.mjs`.

| Test | Datei | Ergebnis |
|---|---|---|
| Das Beispiel aus Markdown | `build.mjs`, `beispiel-prozesse.md` | 13 Links, 4 Gruppen, 6 Karten, 17 Schritte, 13 Akteure, 10 Hinweise, 11 Chips, 14 Tabellen, 5 Diagramme mit 20 Bahnen. Gleiche Zahlen wie in der Vorlage, dazu die drei Diagramme zu Prozess 4 |
| Export ohne JavaScript | `build.mjs` | 0 `<script>`, 0 `on…`-Attribute, 0 `javascript:`-Adressen. Dunkelmodus und Mobilansicht funktionieren |
| Facettenfilter ohne JS | `build.mjs` | 14 → 2 Zeilen. Im Druck trotzdem alle 14 |
| Freitextfilter | `build.mjs` | „tour“ → 4 von 14 Zeilen |
| Fremder Renderer | `tests/degradiert.mjs` | Lesbar als Listen, Tabellen, Blockzitate |
| Mermaid-Layouts | `tests/mermaid-test.mjs`, `mermaid-knobs.mjs`, `mermaid-tb.mjs`, `mermaid-p2*.mjs` | siehe Weg B |
| Unveränderter PoC | `tests/poc-unveraendert.mjs` | Swimlane rendert, `[!NOTE]` nicht |
| BPMN | `tests/bpmn-test.mjs` | siehe Wege C und D |
| Roh-SVG durch marked | `tests/svg-in-markdown.mjs` | Bricht bei Leerzeilen |
| Bibliotheksgrößen | `tests/mermaid-groesse.mjs` | siehe Größen |
| Firefox | `tests/firefox-probe.mjs` | Gleiches Ergebnis wie Chromium |
| Anderes Markdown als das Beispiel | `tests/robustheit.mjs` | 29 Fälle, alle bestanden: 17 aus dem Review, 11 zu BPMN (davon 4 zu den weiteren Symbolen, 1 zu XML ohne Koordinaten), 1 zur Tastatur in der großen Ansicht |
| Große Ansicht, ohne und mit JavaScript | `tests/diagramm-ansicht.mjs` | Ohne JS: Öffnen, Zoom, Schließen. Mit JS: 34 Prüfungen am laufenden Viewer, alle bestanden. Bilder unter `dist/screenshots/diagramm-*` |

Bilder des Exports: `dist/screenshots/export-hell.png`, dazu `-dunkel` und `-mobil`. Die Vergleichsbilder mit der Vorlage liegen nicht im Repo.

### Abweichungen des Spikes vom Original

| Punkt | Original | Spike |
|---|---|---|
| Diagrammrichtung | quer | quer |
| Diagrammnotation | BPMN-ähnlich, von Hand | BPMN 2.0 über `bpmn-js` |
| Diagramm 2 | Gateway und 4 Empfänger, mit losen Pfeilenden | Gateway und 4 Empfänger, eigene Koordinaten, Pfeile geschlossen |
| Diagramme zu Prozess 4 | keines | Drei: BPMN aus Mermaid-Text mit Parallel-Gateway und Nachrichten-Symbolen, derselbe Ablauf aus BPMN-XML mit Koordinaten und aus BPMN-XML ohne Koordinaten. Dazwischen zwei Sätze, die nicht im Original stehen |
| Eyebrow der Prozesse | „Prozess 1“ … | Gruppenname „Die fünf Prozesse“ |
| Navigationstexte | Kurztitel mit Nummer | Überschriftentext |
| Verbundene Zelle | `colspan` | leere Zelle |
| Schriften | Google Fonts | ebenfalls Google Fonts, nur für den Vergleich |

### Nicht geprüft

- Safari. Die große Ansicht und der Facettenfilter hängen an `:has()`.
- Ob die erzeugten `.bpmn`-Dateien in einem Modeler außerhalb von bpmn.io öffnen.
- Ob GitHub, VS Code und Obsidian `swimlane-beta` schon rendern. Das hängt an deren Mermaid-Version.
- Die vier Export-Varianten des PoC mit den neuen Komponenten. Der Spike hat einen eigenen Export.
- Screenreader. Die Tastaturbedienung des Facettenfilters hat der Review geprüft (Tab, Pfeiltasten), Sprachausgabe nicht.
- Alle Messungen stammen aus Playwright. Klick- und Hover-Verhalten bitte von Hand ansehen.

## Review des Spikes

Zwei Durchgänge am 1. Oktober: Abgleich von Text und Bild gegen das Original, dazu ein unabhängiger Code-Review mit eigenem Test-Markdown. Vollständige Liste: `spikes/komponenten-aus-markdown/REVIEW.md`.

| Ergebnis | Anzahl |
|---|---|
| Text des Spikes gegen das Original | wortgleich außerhalb der Diagramme (rund 2260 Wörter) |
| Fehler gefunden und behoben | 32 (30 aus dem Code-Review, 2 aus dem Abgleich) |
| Bekannt und offen | 13 |

Der Spike war nur mit dem einen Beispieldokument gelaufen. Mit anderem Markdown brach er an mehreren Stellen, teils mit leerer Seite. Das ist behoben und durch `tests/robustheit.mjs` abgesichert.

Was davon für eine echte Umsetzung zählt:

| Erkenntnis | Folge |
|---|---|
| CSS-Selektoren wie `li > strong:first-child` oder `td br + em` sehen keinen Text dazwischen und treffen zu viel | Die Zuordnung gehört in den DOM-Pass, CSS bekommt eine Klasse |
| Stille Wirkungslosigkeit bei Tippfehlern in der Markierung | Sichtbare Warnung, wie beim Frontmatter („nicht lesbar“) |
| Facettenwerte über einen Slug zu bilden wirft „C“, „C++“ und „C#“ zusammen | Schlüssel durchzählen, nicht aus dem Text ableiten |
| Ein Fehler in einem Pass ließ alle folgenden ausfallen | Jeder Pass braucht seinen eigenen Fehlerfang |
| Mermaid liefert bei Syntaxfehlern ein Fehlerbild als SVG | Vor dem Export prüfen, sonst wandert es in die Datei |
| Roh-HTML im Markdown bringt `onerror` und `javascript:` in den „JS-freien“ Export | Gilt genauso für den PoC. Er säubert nichts und setzt Mermaid auf `securityLevel: 'loose'` |
| Status und Hinweisart sind nur an der Farbe erkennbar | Für Screenreader fehlt ein Textäquivalent |

## Nebenbefunde zum PoC

| Befund | Beleg |
|---|---|
| Der PoC lädt Mermaid ohne Version. Seit dem Release vom 10. September liefert das CDN 12.0.0 statt 11.x | `poc/dokufix-poc.html:834`, CDN-Header `x-jsd-version: 12.0.0` |
| Dieselbe Adresse für marked liefert 15.0.12, aktuell ist 18.0.14 | `poc/dokufix-poc.html:832`, CDN-Header |
| `> [!NOTE]` rendert im PoC als Blockzitat mit sichtbarem `[!NOTE]` | `tests/out/poc-unveraendert-swimlane.png` |
| Diagramme werden auf Spaltenbreite gestaucht, ohne Untergrenze | gleiches Bild, Schrift im Diagramm kaum lesbar |

## Zwischenstand vom 1. Oktober, abends

Nach dem ersten Commit (`9b23d3d`) kam dazu, alles uncommittet:

| Was | Wo |
|---|---|
| Weitere BPMN-Symbole aus Mermaid-Text (Parallel-Gateway, Nachricht, Timer, Aufgabenarten, Aufruf-Aktivität) | `src/bpmn.js`, Tabelle unter „Im Spike eingebaut“ |
| Prozess 4 dreimal: aus Mermaid-Text, aus BPMN-XML mit Koordinaten, aus BPMN-XML ohne Koordinaten | `beispiel-prozesse.md`, Diagramme 3 bis 5 |
| BPMN-XML ohne Koordinaten wird angeordnet | `layoutXml` in `src/bpmn.js` |
| Vergleich der Anordner: Mermaid, `bpmn-auto-layout`, ELK in vier Varianten | „Andere Anordner für XML ohne Koordinaten“, `tests/elk-test.mjs` |

### Wie BPMN ohne Koordinaten entsteht

`bpmn-js` zeichnet nur, es ordnet nicht an. Fehlen die Koordinaten, rechnet Mermaid sie aus:

1. Das BPMN-XML wird gelesen und intern in Mermaid-Swimlane-Text umgeschrieben.
2. Mermaid zeichnet diesen Text außerhalb des sichtbaren Bereichs.
3. Nur die Positionen werden übernommen, das Mermaid-Bild wird verworfen.
4. Die Positionen kommen als Koordinaten ins XML, `bpmn-js` zeichnet.

Mermaid ist hier also Anordner, nicht Zeichner und nicht Schreibformat. Derselbe Rechenweg steckt seit dem ersten Commit hinter Diagramm 1. Deshalb sehen die Diagramme 3 und 5 gleich aus.

### Festgestellt und entschieden

| Punkt | Stand | Von |
|---|---|---|
| Anordner für BPMN mit Bahnen | Nur Mermaid produziert taugliche Ergebnisse. `bpmn-auto-layout` und ELK scheiden aus | Ben, nach dem Vergleich |
| Usecase „LLM schreibt die ganze Doku als Markdown, der Nutzer fügt sie in Dokufix ein“ | Muss funktionieren, auch mit Diagrammen | Ben |
| Folge daraus: BPMN-XML nur als Asset | Scheidet aus. Ein LLM kann kein Asset liefern. Der Codeblock `bpmn` bleibt das Eingabeformat, Auslagern ins Asset wäre später ein Angebot | abgeleitet, von Ben bestätigt |
| Folge daraus: Koordinaten als Pflicht | Passt nicht zum Usecase. Ein LLM müsste die Koordinaten raten, das ergibt Fehler wie in den Diagrammen der Vorlage. XML ohne Koordinaten muss gehen | abgeleitet, von Ben bestätigt |
| Folge für Mermaid | Mermaid muss geladen sein, sobald ein Dokument BPMN ohne Koordinaten enthält. Die Version gehört festgelegt (Entscheidung 6), weil die Anordnung an `swimlane-beta` hängt | abgeleitet, von Ben bestätigt |
| Schreibformat für BPMN | Nur BPMN-XML im Codeblock `bpmn`, mit oder ohne Koordinaten. Mermaid-Text mit Markierung `bpmn` und die Zeichen-Syntax (`{+}`, `[📤 …]`) entfallen. Mermaid-Text bleibt ein normales Mermaid-Diagramm | Ben |
| Epic-Schnitt | Alles in ein Epic: Komponenten und BPMN | Ben |
| Handbuch-Layout (Navigation links mit Gruppen, Eyebrow, Vorspann) | Nicht ins Epic, vermutlich nie | Ben |
| Freitextfilter | Ins Epic, obwohl er in den Exporten ohne JavaScript fehlt | Ben |
| Epic 2 | Geschrieben: `_bmad-output/planning-artifacts/epics.md`, „Document Components and BPMN Diagrams“, Stories 2.1 bis 2.12 | – |
| Mehrere Pools ohne Koordinaten | Nach dem Versuch ins Epic, als eigene Story 2.12, damit sie getrennt abgenommen oder verschoben werden kann | Ben |
| Block-Markierung (D1) | HTML-Kommentar | Ben |
| Status-Chip (D2) | Farbpunkt im Code-Span als Start, eine bessere Syntax kann später kommen | Ben |
| Doppeltes Stylesheet (D3) | Umbau vorab, als Story 2.1. Die übrigen Stories sind entsprechend umnummeriert | Ben |
| Laufender `bpmn-js`-Viewer in der großen Ansicht | Bleibt, als Story 2.11. Ich hatte ihn ohne Bens Zustimmung als „nicht im Umfang“ eingetragen; das ist zurückgenommen | Ben |
| Lizenz von `bpmn-js` (D5) | So bauen wie geplant, keine Nachfrage bei bpmn.io. Bibliothek unverändert, Logo im laufenden Viewer sichtbar, Zeichnen für die Textspalte unsichtbar, Exporte nur mit dem Bild, Textlink unter jedem Diagramm. Der Product Owner hält das für vertretbar | Ben |
| BPMN in Dokufix bearbeiten | Außerhalb von Epic 2 | Ben |
| Verbundene Tabellenzellen | Außerhalb, erst wenn wirklich benötigt | Ben |
| Schriften | Keine Anpassung, Theming irgendwann. Dafür ein Prüfpunkt in Story 2.7 und 2.8: Diagramm-Beschriftungen mit zwei verschiedenen Systemschriften ansehen | Ben |
| Roh-HTML im Markdown säubern | Außerhalb von Epic 2, eigenes Epic irgendwann. Im Epic als Kandidat vermerkt, mit DOMPurify als gemessener Möglichkeit (29 KB) | Ben |
| Mermaid-Sicherheitsstufe | `strict` statt `loose`, in Story 2.1. Gemessen: es entfallen nur `javascript:`-Links und Klick-Funktionen | Ben |
| Bibliotheksversionen (D4) | Mermaid genau 12.0.0, `marked` 18.0.14, `marked-footnote` 1.4.0. Der PoC bekommt heute `marked` 15.0.12. Das Festlegen ist der erste Schritt von Story 2.1 und wird getrennt vom CSS-Umbau geprüft | Ben |

### Offen für den Epic-Schnitt

- D1 bis D5 sind entschieden, alle Einträge unter „Out of scope“ sind von Ben bestätigt. Offen ist nur, ob Black-Box-Pools in Story 2.12 angeordnet werden sollen (heute: Warnung).
- Die Anordnung samt Routing-Korrekturen hat keinen unabhängigen Review. Im Epic ist er Pflicht (Story 2.8).

## Offene Entscheidungen

1. Block-Markierung: HTML-Kommentar, Attributliste oder Fenced Div? Entschieden am 1. Oktober: HTML-Kommentar (D1 im Epic).
2. Status-Chip: Farbpunkt im Code-Span oder eine der Alternativen? Entschieden am 1. Oktober: Farbpunkt als Start, eine bessere Syntax kann später kommen (D2 im Epic).
3. Handbuch-Layout mit Gruppen: als Schalter im Frontmatter, als Ansichtsoption, oder gar nicht? Stand: gar nicht, siehe „Zwischenstand“.
4. Freitextfilter: akzeptabel, dass er im JS-freien Export fehlt? Oder nur die Facette? Stand: akzeptabel, er kommt ins Epic, siehe „Zwischenstand“.
5. Diagramme: Mermaid `swimlane-beta` pur, oder `bpmn-js` dazunehmen (195 KB) für BPMN-Optik, XML aus Modelern und die große Ansicht mit Viewer?
   - Falls ja: BPMN-XML im Markdown-Text oder als Asset? Stand: im Text, wegen des LLM-Usecase, siehe „Zwischenstand“.
   - Falls ja: Wer ordnet an, wenn Koordinaten fehlen? Stand: Mermaid, siehe „Zwischenstand“.
   - Falls ja: Schreibformat nur BPMN-XML, oder auch Mermaid-Text mit Markierung? Stand: nur BPMN-XML, siehe „Zwischenstand“. Die Frage nach Zeichen oder Klassen für BPMN-Arten entfällt damit.
   - Falls ja: Die Lesart der Lizenz (siehe „Im Spike eingebaut“) bei Bedarf von bpmn.io bestätigen lassen. Entschieden am 1. Oktober: keine Nachfrage, siehe „Zwischenstand“.
6. Mermaid-Version festlegen? Ohne Festlegung ändert sich das Rendering mit jedem Release. Entschieden am 1. Oktober: genau 12.0.0, `marked` 18.0.14 und `marked-footnote` 1.4.0 gleich mit (D4 im Epic).
7. Schriften: Systemschriften oder eingebettete Schrift? Die Wirkung der Vorlage hängt stark an IBM Plex. Entschieden am 1. Oktober: keine Anpassung, Theming irgendwann.
8. Roh-HTML im Markdown: durchlassen wie bisher oder säubern? Davon hängt ab, ob „ohne JavaScript“ für fremde Dokumente stimmt. Entschieden am 1. Oktober: nicht in Epic 2, eigenes Epic irgendwann.
