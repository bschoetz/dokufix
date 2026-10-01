# Review des Spikes

1. Oktober 2026. Zwei Durchgänge:

- **Abgleich mit der Vorlage:** sichtbarer Text und Screenshots, Seite für Seite. Gelaufen am ursprünglichen Nachbau der internen Vorlage; im Repo steht stattdessen ein frei erfundenes Beispiel gleicher Struktur.
- **Unabhängiger Code-Review:** ein zweiter Durchlauf ohne Kenntnis meiner Schlüsse, mit eigenem Test-Markdown im Headless-Chromium.

Der Spike war bis dahin nur mit dem einen Beispieldokument gelaufen.

## Abgleich mit der Vorlage

| Prüfung | Ergebnis |
|---|---|
| Sichtbarer Text, Vorlage gegen Spike | Wortgleich außerhalb der Diagramme, rund 2260 Wörter |
| Seite im Bild, hell, ganz durchgesehen | Keine Auffälligkeit außer den dokumentierten Abweichungen |
| Diagramm 2 gegen die Schrittliste | **Fehler:** Mein vereinfachtes Modell hatte zwei Schritte in anderer Reihenfolge als die Schrittliste. Behoben |
| Schriftgröße im Diagramm der Vorlage | **Fehler in der Doku:** 7,4 px war gerechnet. Gemessen sind es 7,5 px bei 900 px Breite. Behoben |

## Behoben

„Geprüft“ nennt den Fall in `tests/robustheit.mjs` oder `build.mjs`, der das absichert.

| # | Fehler | Auslöser | Geprüft |
|---|---|---|---|
| 1 | Codeblöcke fielen auf eine Zeile zusammen | Jeder Codeblock außer `mermaid`. `white-space:nowrap` traf auch `pre code` | Codeblock behält seine Zeilen |
| 2 | Leere Seite | `<!-- dokufix: side-note wichtig -->`. Ein Name mit Bindestrich plus Argument warf eine Ausnahme, danach lief kein Pass mehr | Markierung mit Bindestrich |
| 3 | Kein Fehlerfang im Seitengerüst | Jede Ausnahme in einem Pass. Mermaid lief nicht, die Seite blieb halb fertig | – (Fehler erscheint jetzt als Warnung auf der Seite) |
| 4 | Überschriften verschwanden | Dokument nur mit H1 und H2. Jede H2 wurde als Gruppe versteckt | Dokument nur mit H2 |
| 5 | Doppelte ids | `### Übersicht`, `### Übersicht`, `### Übersicht 2` ergab zweimal `uebersicht-2` | Überschriften-ids eindeutig |
| 6 | Autoren-ids überschrieben | `<h3 id="mein-anker">` | Autoren-id bleibt |
| 7 | Facette warf Werte zusammen | „C“, „C++“, „C#“ wurden ein Knopf „C 3“. Ebenso alle Werte ohne lateinische Buchstaben | Facetten trennen |
| 8 | HTML-Einschleusung in der Facetten-Legende | Spaltenkopf mit maskiertem `\<img onerror=…\>`. Im Test lief der Handler | Legende wird maskiert |
| 9 | Ausnahme bei verbundenen Zellen | Facette auf Roh-HTML-Tabelle mit `colspan` | Facette mit colspan |
| 10 | Seite zerfiel | Markdown, das `<script>` in einem Codeblock oder `<!--` im Text enthält. Die Quelle stand roh in einem Skript-Element | Markdown mit `<script>` |
| 11 | Schrittliste zählte neu ab 1 | Liste, die mit `3.` beginnt | Schrittliste ab 3 |
| 12 | Mermaid-Fehlerbild wurde als Diagramm ausgeliefert | Syntaxfehler im Diagramm | Mermaid-Syntaxfehler |
| 13 | Betonung wurde zum Akteur | `1. *Nie* ohne Backup starten.` | Akteur nur mit Doppelpunkt |
| 14 | Druck zeigte gefilterte Tabelle | Facette gewählt, dann drucken | Druckansicht (in `build.mjs`) |
| 15 | Kartentitel mitten im Satz | `- Vorab **fett** mittendrin`. `strong:first-child` sieht den Text davor nicht | Kartentitel nur am Anfang |
| 16 | Kartentitel fehlte | Liste mit Leerzeilen zwischen den Einträgen | Kartentitel in losen Listen |
| 17 | Betonung wurde zur Unterzeile | Zelle `Zeile<br>und ein *betontes* Wort` | Unterzeile nur nach Umbruch |
| 18 | Links im Titel sahen aus wie Navigationspunkte | Link in der H1 | – (Selektor auf `.dokufix-nav > a` verengt) |
| 19 | Markierung wirkte still nicht | Tippfehler `crads`, `steps` vor einer Aufzählung, Einleitungszeile zwischen Markierung und Liste, Spalte nicht gefunden | Tippfehler, falsche Blockart |
| 20 | Autor konnte interne Klassen setzen | `<!-- dokufix: filter-ui -->` vor einem Absatz. Der Export löschte den Absatz | Interne Klassen |
| 21 | Export nahm Laufzeit-Zustand mit | Filter benutzt, dann exportiert: Zeilen blieben für immer versteckt | Export bei aktivem Filter (in `build.mjs`) |
| 22 | `build.mjs` prüfte nichts | Ein kaputter Filter endete mit Exit-Code 0 | Jede Erwartung wird geprüft |
| 23 | Hinweise wichen von GitHub ab | `[!note]` klein wurde nicht erkannt. `> [!NOTE] Text in derselben Zeile` wurde erkannt | Hinweise wie bei GitHub |
| 24 | Leerer Absatz im Hinweis | `> [!NOTE]`, darunter eine Liste | Kein leerer Absatz |
| 25 | Leerer Navigationslink | Überschrift, die nur aus einem Chip besteht | Kein leerer Link |
| 26 | Überschriften aus Hinweisen und Listen landeten in der Navigation | `### …` in einem Hinweis | Keine Überschriften aus Hinweisen |
| 27 | Falsche H1 wurde zur Marke | H1 in einem Zitat. Ein langer Einleitungsabsatz wanderte in die schmale Leiste | Nur die H1 der obersten Ebene |
| 28 | Facetten-Knöpfe ohne Wirkung | Browser ohne `:has()` | – (`@supports`-Regel blendet sie aus, nicht im alten Browser getestet) |
| 29 | Fehlende Grundstile | Großes Bild sprengte die Seite. `pre` und normales Zitat ohne Stil | – |
| 30 | Kleinigkeiten | `enhance()` zweimal aufgerufen ergab zwei Suchfelder. Umlaute in zerlegter Unicode-Form ergaben andere ids. Scrollspy ohne `aria-current`, Zähler ohne `aria-live` | – |

## Bekannt und offen

| # | Punkt | Warum offen |
|---|---|---|
| 1 | Roh-HTML im Markdown wird nicht gesäubert. `<img onerror=…>` und `javascript:`-Links landen im „JS-freien“ Export | Grundsatzfrage, der PoC verhält sich genauso. `build.mjs` zählt solche Stellen jetzt und schlägt fehl |
| 2 | Die Kommentar-Markierung ist nicht überall unsichtbar. markdown-it in Grundeinstellung zeigt sie als Text, MDX bricht ab | Eigenschaft der Variante. Die Doku behauptete „in jedem Renderer“, das ist korrigiert. Vom Review reproduziert, von mir nicht nachgestellt |
| 3 | Code, der mit einem Farbpunkt beginnt, wird zum Chip (`` `🔴 = Fehler` ``) | Eigenschaft der Variante |
| 4 | Status nur an der Farbe erkennbar. `` `🟢 Server` `` und `` `🔴 Server` `` lesen sich für Screenreader gleich. ⚪ und 🔵 sehen gleich aus | Braucht eine Entscheidung zum Textäquivalent |
| 5 | Hinweisart nur an der Randfarbe erkennbar. WARNING und IMPORTANT teilen eine Farbe | wie 4 |
| 6 | Nur Flowchart und Swimlane folgen dem Farbschema. Sequenzdiagramm und Tortendiagramm sind im Dunkelmodus unlesbar | Das Theme deckt nur die Klassen dieser beiden Typen ab |
| 7 | `> \[!NOTE\]` (bewusst maskiert) wird trotzdem zum Hinweis | Im DOM nicht mehr unterscheidbar. Bräuchte eine marked-Erweiterung auf Token-Ebene |
| 8 | GitHub-Anker passen nicht. `#löschroutine--geplant` gegen `#loeschroutine` | Der Spike nutzt das Slug-Schema des PoC |
| 9 | Navigation ist eine Folge von Absätzen und Links, keine Liste | Für den Spike belassen |
| 10 | H3 ohne H2 davor bekommt eine leere Eyebrow-Zeile. Eine zweite H1 bleibt ungestaltet | Randfälle des Layouts |
| 11 | `table{min-width:520px}` gilt auch für zweispaltige Tabellen | Aus dem CSS der Vorlage übernommen |
| 12 | Texte sind fest deutsch („Alle“, „Zeilen“). Nur doppelte Anführungszeichen im Argument. Führendes `<br>` in einer Facettenzelle landet bei „—“ | Kleinigkeiten |
| 13 | `tests/bpmn-page.html`: ids ungeprüft im XML, Kreis mit eingehender Kante wird immer Endereignis, parallele Kanten teilen einen Pfad, „geplant“ und „gestrichelt“ gehen verloren | Die Testseite bleibt, wie sie war. In `src/bpmn.js` sind die ersten drei Punkte behoben und getestet. „Geplant“ und „gestrichelt“ sind dort nur Darstellung, nicht im XML |

Punkte 2 bis 8, 10 und 13 stammen aus dem unabhängigen Review und sind dort reproduziert. Ich habe sie am Code nachvollzogen, aber nicht einzeln nachgestellt.

## Nach dem Review ergänzt

BPMN (`src/bpmn.js`) und die große Diagrammansicht kamen nach beiden Review-Durchgängen dazu. Dazu gehört der laufende `bpmn-js`-Viewer in der großen Ansicht. Später kamen die weiteren BPMN-Symbole dazu (Parallel-Gateway, Nachricht, Timer, Aufgabenarten, Aufruf-Aktivität), drei Diagramme zu Prozess 4 (aus Mermaid-Text, aus XML mit und ohne Koordinaten), das Anordnen von XML ohne Koordinaten und zwei Routing-Korrekturen (Zacken glätten, Abgänge an einer Gateway-Ecke trennen). Abgesichert ist das durch 12 eigene Fälle in `tests/robustheit.mjs`, 34 Prüfungen in `tests/diagramm-ansicht.mjs` und 3 Prüfungen in `build.mjs`. Einen **unabhängigen Review** gab es dafür nicht.

## Geprüft und in Ordnung

- Gerendertes DOM übersteht Serialisieren und erneutes Parsen unverändert, auch mit Hinweis und Tabelle in Listeneinträgen.
- Facettenfilter mit der Tastatur: Tab erreicht die Gruppe, Pfeiltasten schalten und filtern, Fokusring sichtbar.
- Tabelle ohne Zeilen, doppelte Spaltennamen, zwei Facetten-Tabellen auf einer Seite, Filter und Facette zusammen.
- Markierungen in Code-Spans und Codeblöcken bleiben unberührt.
- Hinweise in verschachtelten Zitaten, Chips in Links und fettem Text.
- Ohne Google-Schriften schneiden die Diagrammbeschriftungen nicht ab (mit „Segoe UI“ als Ersatz, andere Ersatzschriften ungetestet).

## Was der Review nicht abdeckt

- Safari, Screenreader.
- Die vier Export-Varianten des PoC. Der Spike hat einen eigenen Export.
- Alle Messungen stammen aus Playwright. Bedienung bitte von Hand ansehen.
