# Spike: Komponenten aus Markdown

Nachbau eines HTML-Prozessdokuments aus reinem Markdown. Die Vorlage, ein internes Dokument einer Kollegin, liegt nicht im Repo. Das Beispiel hier (`beispiel-prozesse.md`, „Hof Sonnenfeld“) ist frei erfunden und hat dieselbe Gliederung und dieselbe Anzahl jeder Komponente. Getrennt vom PoC, `poc/` wird nicht angefasst.
Auswertung: `docs/komponenten-aus-markdown.md`.

## Ansehen

| Datei | Was |
|---|---|
| `dist/beispiel-prozesse.nur-lesen.html` | Fertig gerendert, ohne JavaScript. Öffnen genügt. Lädt nur die Schriften von Google, offline greifen Ersatzschriften |
| `spike.html` | Rendert im Browser aus dem eingebetteten Markdown. Braucht Netz (marked, Mermaid, Schriften vom CDN). Hat zusätzlich Freitextfilter und Scrollspy |
| `beispiel-prozesse.md` | Die Quelle |
| `dist/screenshots/` | Der Export hell, dunkel und mobil. `diagramm-*` zeigt die Diagramme in Spalte und großer Ansicht |

## Bauen

```sh
npm install
node build.mjs
```

`build.mjs` setzt `spike.html` aus `src/` und dem Markdown zusammen (`assemble.mjs`), rendert sie im Headless-Chromium (`/usr/bin/chromium`, sonst `CHROMIUM=…`), schreibt den JS-freien Export und die Screenshots. Jede Erwartung wird geprüft, bei Abweichung endet der Lauf mit Exit-Code 1.

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/komponenten.js` | DOM-Pässe nach `marked.parse()`. `render()` ist statisch, `enhance()` ist Laufzeit-JS |
| `src/komponenten.css` | Stile, Farbwerte nach der Vorlage |
| `src/bpmn.js` | Mermaid-Text → BPMN-XML, BPMN-XML → SVG über `bpmn-js`, Viewer in der großen Ansicht |
| `src/template.html` | Seitengerüst, Mermaid-Konfiguration mit Theme über CSS-Variablen, Diagramm-Schleife |
| `assemble.mjs` | Setzt die Seite zusammen, enthält den JS-freien Export |
| `diagramme/abo-anfrage.mjs` | Erzeugt `abo-anfrage.bpmn` (Prozess 2 mit von Hand gesetzten Koordinaten). Das XML steht als Kopie im Markdown |
| `diagramme/uebergabe.mjs` | Erzeugt `uebergabe.bpmn` (Prozess 4, von Hand angeordnet). Vergleich zum Mermaid-Diagramm direkt darüber, Kopie im Markdown |
| `diagramme/uebergabe-ohne-koordinaten.bpmn` | Prozess 4 als BPMN-XML ohne Koordinaten, von Hand geschrieben. Kopie im Markdown |

## Syntax im Markdown

| Zweck | Schreibweise |
|---|---|
| Karten | `<!-- dokufix: cards -->` vor einer Liste, Titel fett |
| Schritte | `<!-- dokufix: steps -->` vor einer nummerierten Liste, Akteur als `*Website:*` am Anfang (der Doppelpunkt ist Pflicht) |
| Freitextfilter | `<!-- dokufix: filter "Platzhalter" -->` vor einer Tabelle |
| Facettenfilter | `<!-- dokufix: facets Spaltenname -->` vor einer Tabelle |
| Hinweis | `> [!NOTE]`, `> [!WARNING]`, auch `TIP`, `IMPORTANT`, `CAUTION`. Der Marker steht allein in der ersten Zeile |
| Status-Chip | `` `🟢 Text` ``, auch 🟡 🔴 ⚪ 🔵 |
| Unterzeile in Tabellenzelle | `<br>*Text*` |
| Swimlane | Codeblock `mermaid`, erste Zeile `swimlane-beta TB` oder `LR`, Bahnen als `subgraph` |
| Swimlane als BPMN | `<!-- dokufix: bpmn "Poolname" -->` vor dem Mermaid-Codeblock. Kreis = Start- oder Endereignis, Doppelkreis = Endereignis, Raute = Gateway, Rechteck = Aufgabe |
| Weitere BPMN-Symbole | Nur mit der Markierung `bpmn`. Gateway: `{+}` parallel, `{o}` inklusiv. Zeichen am Textanfang: `✉` `📨` `📥` `📤` Nachricht, `⏱` Timer, `👤` `⚙` `✋` Benutzer-, Service-, Handaufgabe. `[[…]]` = Aufruf-Aktivität. Tabelle in der Auswertung |
| BPMN aus einem Modeler | Codeblock `bpmn` mit dem XML samt Koordinaten |
| BPMN ohne Koordinaten | Codeblock `bpmn` mit XML ohne BPMN-DI. Ein Prozess, jedes Element mit `flowNodeRef` in einer Bahn. Die Anordnung entsteht beim Rendern |
| Große Ansicht | nichts zu schreiben: jedes Diagramm öffnet sich per Klick im Vollbild mit Zoom. Bei BPMN läuft dort mit JavaScript der `bpmn-js`-Viewer (Strg + Mausrad, Ziehen, Esc) |
| Geplante Aufgabe | `:::geplant` am Knoten |
| Gliederung | H1 = Titel, kurzer Absatz darunter = Unterzeile, H2 mit H3 darunter = Gruppe, H3 = Abschnitt, H4 = Zwischenüberschrift. Eine H2 ohne H3 ist selbst ein Abschnitt |

Die Markierung steht direkt vor dem Block. Ein unbekannter Name oder die falsche Blockart ergibt eine sichtbare Warnung im Dokument.

Review-Befunde und was davon offen ist: `REVIEW.md`.

## Einzeltests

Alle unter `tests/`, Ausgaben in `tests/out/`. `mermaid-test.mjs` zuerst laufen lassen, es legt die Testseite für die anderen Mermaid-Tests an.

| Skript | Frage |
|---|---|
| `mermaid-test.mjs` | Flowchart mit Subgraphen gegen `swimlane-beta` quer und hochkant |
| `mermaid-knobs.mjs` | Welche Einstellungen machen das Diagramm schmaler? |
| `mermaid-tb.mjs` | Maße von Prozess 1 in beiden Richtungen |
| `mermaid-p2.mjs`, `mermaid-p2-varianten.mjs` | Prozess 2 mit Auffächerung: Konfiguration gegen einfachere Modellierung |
| `poc-unveraendert.mjs` | Rendert der PoC `swimlane-beta` heute schon? (lädt `poc/dokufix-poc.html` nur, schreibt nichts) |
| `bpmn-test.mjs` | Mermaid-Text → Modell → BPMN-XML → `bpmn-js`, mit und ohne Auto-Layout |
| `elk-test.mjs` | Taugt ELK als Anordner für BPMN ohne Koordinaten? Vier Varianten an Prozess 4, mit Kennzahlen. Braucht vorher `node build.mjs` |
| `zwei-pools.mjs` | Lassen sich mehrere Pools mit Nachrichtenflüssen ohne Koordinaten anordnen? Zwei Beispiele aus `diagramme/` |
| `prozess4-vergleich.mjs` | Prozess 4 von Mermaid selbst gezeichnet und von `bpmn-auto-layout` angeordnet, zum Vergleich mit den Diagrammen 3 bis 5. Braucht das Bündel von unten |
| `svg-in-markdown.mjs` | Überlebt handgeschriebenes SVG den Weg durch marked? |
| `degradiert.mjs` | Wie sieht das Markdown ohne Dokufix aus? |
| `mermaid-groesse.mjs` | Bibliotheksgrößen |
| `firefox-probe.mjs` | Gleiches Ergebnis in Firefox? |
| `robustheit.mjs` | Hält der Spike anderes Markdown aus? 29 Fälle mit Prüfung, darunter BPMN und Tastatur |
| `diagramm-ansicht.mjs` | Große Ansicht: ohne JavaScript am Export, mit JavaScript am laufenden Viewer in `spike.html`. Braucht vorher `node build.mjs` |

`bpmn-test.mjs` braucht vorher das Bündel:

```sh
npx esbuild tests/_autolayout-entry.js --bundle --minify --format=iife --outfile=tests/out/bpmn-auto-layout.bundle.min.js
```
