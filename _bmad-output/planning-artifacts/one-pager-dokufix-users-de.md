# Wer hat eigentlich das Word zum PDF?

**Ein Bürotag, den Sie kennen:** Die Richtlinie muss aktualisiert werden. Das PDF liegt in fünfzig Postfächern. Den Word-Quelltext findet niemand. Wer ihn zuletzt hatte, ist im März in Elternzeit gegangen.

## Das Problem

Diese Schleife läuft jedes Mal, wenn Sie ein Dokument schreiben, das länger lebt als ein Projekt. **Quellen verschwinden, PDFs bleiben, und jede Aktualisierung beginnt mit Archäologie.**

Die großen Werkzeuge — Confluence, Notion, SharePoint, Obsidian — wollen Konten, Installationsrechte, Netzwerk. Auf einem gesperrten Kundenlaptop, im Postfach einer Behörde, im Mail-Anhang an einen Wirtschaftsprüfer kommt davon nichts durch. Also frieren Sie das Dokument als PDF ein. Und verlieren die Quelle.

## Die Lösung

**dokufix ist eine einzige HTML-Datei, die gleichzeitig Viewer, Editor und Artefakt ist.** Sie laden die Datei herunter. Sie öffnen sie im Browser. Sie lesen, Sie editieren, Sie speichern eine neue Version. Keine Installation, kein Konto, kein Server, kein Internet.

- **Markdown nativ, Mermaid eingebaut.** Sie schreiben in der Syntax, die Sie ohnehin kennen. Diagramme und eingebettete Bilder rendern automatisch — ohne Plug-ins, ohne Konvertierung.
- **Eine Datei, komplett offline.** Marked und Mermaid sind in der HTML eingebacken, kein CDN, keine Internet-Abhängigkeit. Im Flugzeug, auf dem Kundenlaptop, überall.
- **Lesen und Editieren in derselben Datei.** Eine IndexedDB-Werkbank fängt jede Änderung ab, auch wenn der Tab zugeht. Speichern bleibt **eine bewusste Geste**, kein Auto-Save-Schreck.
- **Die Datei vermehrt sich selbst.** Aus jeder dokufix-Datei lässt sich eine neue, leere erzeugen. Eine Datei durch die Firewall — und Sie haben die ganze Werkbank im Kundennetz.
- **Andere Systeme einfach befüllen.** Sauberer Markdown-Export jederzeit; Confluence- und Jira-Syntax folgen als nächste Ausgabeformate. **Sie schreiben einmal — und spielen denselben Inhalt überall ein**, wo er gebraucht wird. Kein Plattform-Lock-in.
- **Das Dokument kennt seine eigenen Änderungen.** Optionale Commit-Nachrichten beim Speichern werden in der Datei mitgeschrieben — Versionszähler, Zeitstempel und Änderungsprotokoll stehen darin.

## Was sich ändert

| Bisher | Mit dokufix |
|---|---|
| Word verschollen, PDF kursiert | **Eine Datei** ist gleichzeitig lesbares Dokument und editierbare Quelle |
| Drei Anhänge pro Mail (Text, Bilder, Diagramme) | **Ein** HTML — Bilder und Diagramme sind drin |
| Word, Notion oder Obsidian auf dem Kundenlaptop installieren | Browser auf. **Mehr Werkzeug brauchen Sie nicht.** |
| Welche Version ist aktuell? Niemand weiß es | In der Datei selbst lesen — Versionszähler, Zeitstempel und Änderungsprotokoll stehen drin |
| Hoffen, dass das Format 2030 noch öffnet | HTML und Markdown. **Beide werden die nächsten zehn Doku-Plattformen überleben.** |

> dokufix ist ein **Träger für Inhalte.** Die HTML ist nur die aktuelle Hülle, jederzeit abwerfbar. Das Markdown darunter exportieren Sie, wann immer Sie wollen — Ihr Inhalt gehört Ihnen, nicht der Plattform.

## Ausprobieren

Laden Sie die aktuelle dokufix-Datei von GitHub, öffnen Sie sie im Browser, schreiben Sie los. Die Datei, die Sie gerade geladen haben, ist gleichzeitig der Editor für jede weitere dokufix-Datei, die Sie je anlegen werden.

→ **github.com/&lt;repo-path&gt;/dokufix** — Open Source, ohne Anmeldung, ohne Telemetrie, ohne Server. Eine Datei.
