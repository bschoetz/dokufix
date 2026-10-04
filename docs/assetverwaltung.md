# Assetverwaltung

Analyse, wie dokufix die Bilder eines Dokuments verwalten soll, und der Entwurf der Architektur dafür.
Stand 4. Oktober 2026, Commit `9523e6d`. Alle Zeilenangaben beziehen sich auf diesen Stand. Am Code ist nichts geändert; dieses Dokument ist die Grundlage für die Stories, die daraus entstehen.

## Ergebnis in Kürze

- Die **Speicherschicht** ist da und trägt: Bilder liegen inhaltsadressiert (SHA-256) in IndexedDB, das Markdown verweist mit `#asset-<hash>` darauf, „Mit Editor“ schreibt sie in die Datei, und beim Öffnen werden sie mit erneut berechnetem Hash wieder eingelesen.
- Eine **Verwaltungsschicht** fehlt: Es gibt keine Übersicht, keine Metadaten, kein Ersetzen und kein Aufräumen. Man sieht auch nicht, welches Bild wie viel der Datei ausmacht.
- Vorschlag: **vier Schichten**. Der Blob-Speicher bleibt, darüber kommen ein abgeleiteter Verweis-Index, ein Register der Metadaten je Dokument und ein Dialog „Bilder“.
- Im Markdown bleibt der **Hash** der Verweis. Ersetzen ist eine Aktion des Editors, die die Verweise der aktuellen Quelle umschreibt.
- Das **Register** bestimmt, welche Bilder eine Datei mitträgt. Ein ungenutztes Bild bleibt in der Datei, wird als „ungenutzt“ gezeigt und lässt sich aufräumen.
- Die **Historie** lässt sich kürzen, und Bilder alter Versionen lassen sich weglassen. Beides geschieht nur auf ausdrücklichen Wunsch und ist in der Datei vermerkt.
- Der **Bildnachweis** aus dem Register kann als Bildunterschrift erscheinen. Das schaltet man je Bild ein; ohne diese Wahl bleibt alles, wie es ist.

## Entscheidungen

Getroffen am 4. Oktober 2026, auf Grundlage der Analyse unten.

| # | Frage | Entscheidung |
|---|---|---|
| E1 | Hash oder logischer Name als Verweis im Markdown? | **Hash.** Logische Namen gibt es nur im Register, zur Anzeige und für Dateinamen beim Export. |
| E2 | Tragen Dateien Bilder mit, auf die nichts mehr verweist? | **Ja.** Sie erscheinen im Dialog als „ungenutzt“, und es gibt eine Funktion zum Aufräumen. |
| E3 | Soll man die Historie kürzen oder Bilder alter Versionen weglassen können? | **Ja**, beides. |
| E4 | Bildnachweis automatisch als Bildunterschrift? | **Optional**, die Nutzerin oder der Nutzer schaltet ihn je Bild ein. |

## Teil 1: Was es heute gibt

Ein Bild durchläuft heute diese Stationen (`src/app/assets.js`, `src/app/idb.js`, Beschreibung in `src/README.md`, „Image assets“):

| Station | Wie | Wo |
|---|---|---|
| Aufnahme | Einfügen aus der Zwischenablage, Drag & Drop oder `+ Bild`. Höchstens 5 MB und 25 Megapixel; auf 1600 px Breite verkleinert und als WebP mit Qualität 0.85 neu kodiert, EXIF-Daten fallen dabei weg | `addImageFromBlob`, `assets.js:78` |
| Ablage | IndexedDB `dokufix-v1`, Store `assets`, Schlüssel ist der SHA-256 der WebP-Bytes. Datensatz: `{ hash, blob, mime, size, createdAt }` | `assets.js:122` |
| Verweis | `![alt](#asset-<sha256>)` an der Cursorposition; der Alt-Text kommt aus dem bereinigten Dateinamen | `handleImageInsert` |
| Anzeige | Nach `marked.parse()` werden die Verweise zu Blob-URLs, unbekannte Hashes zu einem durchsichtigen Platzhalter mit `data-missing-asset` („Bild fehlt“) | `resolveAssetRefsInHtml`, `render.js:115` |
| Export | Die drei Varianten zum Lesen ersetzen jeden Verweis durch eine `data:`-URL | `inlineAssetRefsAsDataUrls`, `assets.js:249` |
| Speichern | „Mit Editor“ schreibt jedes Bild, auf das die aktuelle Quelle, eine Version der Historie oder der Demotext verweist, in den Block `#dokufix-assets`: `{ hash: { m, d } }` | `bakeAssetsForDocument`, `assets.js:304` |
| Öffnen | Jeder Eintrag des Blocks wird dekodiert, neu gehasht und nur bei passendem Hash in IndexedDB geschrieben | `seedAssetsFromBakedBlock` |
| Build | Die Bilder des Demotexts liegen als `src/assets/<sha256>.webp` und kommen in denselben Block | `build.mjs:157` ff. |

Das Fundament ist richtig gewählt. Inhaltsadressierung macht Duplikate unmöglich, der Hash macht Verweise unveränderlich, und die Prüfung beim Einlesen verhindert untergeschobene Bytes.

## Teil 2: Lücken

| # | Lücke | Folge |
|---|---|---|
| L1 | **Keine Übersicht.** Es gibt keine Liste der Bilder eines Dokuments. | Ein Bild lässt sich nur wiederverwenden, wenn man es erneut hochlädt oder den Hash aus der Quelle kopiert. |
| L2 | **Keine Metadaten.** Der Datensatz kennt nur Hash, Typ, Größe und Zeitpunkt. Ursprünglicher Dateiname, Abmessungen, Quelle, Urheber und Lizenz fehlen. | Die Lizenzangabe des Demofotos steht von Hand im Demotext. Ein Export nach reinem Markdown hätte keine sprechenden Dateinamen. |
| L3 | **Kein Ersetzen.** Ein geändertes Bild hat einen neuen Hash. | Jeder Verweis muss von Hand angepasst werden. |
| L4 | **Kein Aufräumen.** Der Store gilt für den ganzen Origin, also für alle Dokumente, die je in diesem Browser offen waren, und wächst nur (`idb.js:4`: „no GC needed“). `navigator.storage.persist()` wird nicht angefordert. | Verwaiste Bilder sammeln sich an. Der Browser darf den Speicher im Modus „best effort“ räumen; dann sind nur die Bilder ungespeicherter Entwürfe verloren, weil jede gespeicherte Datei ihre Bilder selbst trägt. |
| L5 | **Kein Zusammenhang zwischen Dokument und Bild.** Welche Bilder zu einem Dokument gehören, ergibt sich nur aus Regex-Treffern in Quelle, Historie und Demotext, jedes Mal neu. | Es gibt keinen Status wie „benutzt“, „nur in alten Versionen“ oder „fehlt“. Ein fehlendes Bild bemerkt man erst in der Vorschau. |
| L6 | **Die Datei wächst unsichtbar.** Jede Version der Historie hält ihre Bilder in der Datei fest. | Ein einmal eingefügtes und wieder ersetztes Bild bleibt für immer in jeder gespeicherten Datei. Wie viele KB das ausmacht, zeigt nichts an. |
| L7 | **Doppelte Bytes im Export.** `inlineAssetRefsAsDataUrls` setzt für jedes Vorkommen eine eigene `data:`-URL ein. | Ein Bild, das zweimal im Dokument steht, steckt in `offen`, `schlank` und `kompakt` zweimal vollständig. |
| L8 | **Ein Format für alles.** Jedes Bild wird verlustbehaftetes WebP mit Qualität 0.85 (`assets.js:14`). | Screenshots mit Text, in technischer Doku der häufigste Bildtyp, bekommen Artefakte an den Kanten der Schrift. Ob das stört, ist nicht gemessen. SVG, PDF und andere Anhänge gehen gar nicht. |
| L9 | **Kurze Hashes lösen nie auf.** Der Regex nimmt 12 bis 64 Hex-Zeichen an (`assets.js:21`), nachgeschlagen wird aber nur der volle Hash, und beim Einlesen gilt nur der volle Hash. | Toter Pfad. Derselbe Regex steht außerdem ein zweites Mal in `build.mjs:157`; die beiden können auseinanderlaufen. |
| L10 | **Alte Versionen sind nur Daten.** Der Versionsverlauf listet Nummer, Datum und Beschreibung (`persistence.js:185`), zeigt eine alte Version aber nicht an und stellt sie nicht wieder her. | Dass die Bilder alter Versionen in der Datei liegen, nützt heute nur jemandem, der den Block selbst ausliest. Für E3 heißt das: Bilder alter Versionen wegzulassen kostet heute keine sichtbare Funktion, wohl aber das Versprechen, jede Version sei aus der Datei allein wiederherstellbar. |

## Teil 3: Architektur

### Vier Schichten

```
┌───────────────────────────────────────────────────────────┐
│ 4  Oberfläche    Dialog „Bilder“, Render-Pass Bildnachweis │
├───────────────────────────────────────────────────────────┤
│ 3  Register      Metadaten je Dokument, im Datensatz und   │
│                  im Block #dokufix-assets                  │
├───────────────────────────────────────────────────────────┤
│ 2  Verweis-      abgeleitet aus Quelle, Historie, Demotext │
│    index         und Register; nie gespeichert             │
├───────────────────────────────────────────────────────────┤
│ 1  Blob-         IndexedDB `assets`, inhaltsadressiert,    │
│    speicher      unveränderlich (wie heute)                │
└───────────────────────────────────────────────────────────┘
```

Jede Schicht kennt nur die darunter. Die Schichten 2 und 3 sind reine Logik ohne Seite und laufen in den Node-Tests.

### Verweis: der Hash bleibt (E1)

Im Markdown steht weiter `![alt](#asset-<sha256>)`.

- Jede Version der Historie verweist auf genau die Bytes, die sie damals hatte. Bei logischen Namen (`#asset-logo`) müsste jede Version ihr eigenes Register mitführen, sonst zeigte eine alte Version das neue Logo.
- Es passt zur Regel des Projekts: Was sich ändert, steht in Datenblöcken, und was einmal geschrieben ist, bleibt, wie es ist.
- **Ersetzen** ist eine Aktion des Editors. Sie schreibt alle Verweise der *aktuellen* Quelle vom alten auf den neuen Hash um, als gewöhnliche Textänderung: Der Zustand wird „geändert“, die Änderung lässt sich rückgängig machen, die Historie bleibt unberührt. Das alte Bild bekommt danach den Status „nur Historie“ oder „ungenutzt“.
- Lesbar bleibt die Quelle über den Alt-Text und den optionalen Titel (`![Anmeldemaske](#asset-… "Anmeldung")`). Der Dialog „Bilder“ zeigt zu jedem Hash den Namen aus dem Register.

### Schicht 1: Blob-Speicher

Bleibt, wie er ist: ein Store für den ganzen Origin, Schlüssel ist der Hash, ein Eintrag ändert sich nie. Neu sind drei Dinge.

**Aufräumen im Browser.** Mark-and-Sweep über den Store `docs`: Markiert ist jeder Hash, auf den Quelle, Historie oder **Register** eines Datensatzes verweist (wegen E2 auch ungenutzte Bilder, solange sie im Register stehen), dazu die Bilder des Demotexts. Gelöscht wird, was nicht markiert und älter als eine Karenzzeit ist, Vorschlag 24 Stunden nach `createdAt`.

- Das ist sicher, weil eine gespeicherte Datei ihre Bilder selbst trägt. Öffnet man sie wieder, kommen die Bilder aus ihrem Block zurück.
- Die Karenzzeit schützt vor einem Wettlauf: Ein eingefügtes Bild steht in IndexedDB, bevor der Entwurf 250 ms später gespeichert wird (`persistence.js:135`). Ein Aufräumen in einem anderen Tab in diesem Fenster sähe es sonst als verwaist.
- Es läuft nur auf Klick („Speicher dieses Browsers aufräumen“), nie von selbst, und meldet vorher, wie viele Bilder und wie viele MB es löschen wird.

**Dauerhafter Speicher.** Die Seite fordert beim ersten eingefügten Bild `navigator.storage.persist()` an. Der Dialog zeigt `navigator.storage.estimate()`: belegt und verfügbar.

**Aufnahme je Typ.** Die Aufnahme wird eine Strategie je Eingabetyp, die `{ blob, mime, meta }` liefert (siehe Teil 4, Phase 4). Der Store selbst bleibt dabei unverändert.

### Schicht 2: Verweis-Index

Ein Modul `src/app/assets/refs.js` ist die einzige Stelle, die Verweise findet und umschreibt. `build.mjs` importiert den Regex von dort (behebt L9 nebenbei). Aus Quelle, Historie, Demotext und Register rechnet es für jeden Hash:

- Anzahl und Positionen in der aktuellen Quelle,
- die Versionsnummern, in denen er vorkommt,
- ob der Demotext ihn benutzt,
- ob das Register ihn kennt und ob der Blob-Speicher oder der Block der Datei die Bytes hat.

Daraus folgt genau ein Status:

| Status | Bedingung | Im Dialog |
|---|---|---|
| benutzt | Die aktuelle Quelle verweist darauf | normal |
| Demotext | Nur der Demotext verweist darauf | gedämpft, nicht aufräumbar |
| nur Historie | Nur Versionen der Historie verweisen darauf | gedämpft, mit Versionsnummern |
| ungenutzt | Im Register, aber kein Verweis | hervorgehoben, aufräumbar |
| fehlt | Verwiesen, aber keine Bytes vorhanden | rot, wie „Bild fehlt“ in der Vorschau |

Der Index wird nie gespeichert. Jedes Rendern rechnet ihn neu, daher kann er nicht veralten. Die Historie muss dafür entpackt werden; das Ergebnis je Version lässt sich für die Sitzung zwischenspeichern, weil sich eine Version nie ändert.

### Schicht 3: Register

Je Dokument eine Zuordnung vom Hash zu den Metadaten. Es ist ab jetzt das, was bestimmt, welche Bilder eine Datei mitträgt.

**Was hineinkommt.** Jedes eingefügte Bild. Außerdem jeder Hash, auf den die Quelle verweist und den das Register noch nicht kennt, zum Beispiel weil Markdown aus einem anderen Dokument eingefügt wurde: Der Index legt ihn ohne Metadaten an.

**Was eine Datei mitträgt (E2).** Beim Speichern schreibt „Mit Editor“ jedes Bild aus dem Register, jedes Bild der Historie und jedes Bild des Demotexts in den Block. Das ändert das heutige Verhalten: Ein Bild, das eingefügt und im Text wieder gelöscht wurde, fiel bisher beim Speichern weg und bleibt jetzt in der Datei, bis man aufräumt.

**Aufräumen im Dokument (E2).** Der Dialog bietet „Ungenutzte Bilder entfernen“ für alle Bilder mit Status „ungenutzt“ und „Entfernen“ für ein einzelnes. Das löscht den Eintrag aus dem Register; beim nächsten Speichern fehlt das Bild in der Datei. Bilder mit Status „benutzt“, „Demotext“ oder „nur Historie“ lassen sich so nicht entfernen; für die letzten ist die Historie zuständig (siehe unten).

**Wo es steht.**

- In IndexedDB als Feld `assets` des Dokument-Datensatzes in `docs`. Es braucht keine neue Version des Datenbankschemas und keine Migration.
- In der Datei als Feld `n` der vorhandenen Einträge in `#dokufix-assets`:

```json
{
  "<sha256>": {
    "m": "image/webp",
    "d": "<base64>",
    "n": {
      "name": "anmeldemaske",
      "orig": "Bildschirmfoto 2026-10-01.png",
      "w": 1280, "h": 720,
      "added": "2026-10-04T09:12:00.000Z",
      "quelle": "https://…", "urheber": "…", "lizenz": "CC0 1.0",
      "nachweis": false
    }
  }
}
```

- Ein Eintrag ohne `n` ist gültig. So bleiben alle bisherigen Dateien lesbar, und ein Eintrag nur aus der Historie braucht keine Metadaten.
- Beim Öffnen gilt dieselbe Regel wie für die Quelle: Hat IndexedDB einen Entwurf zu dieser UUID, gilt dessen Register; sonst wird es aus dem Block gelesen.
- Für die Bilder des Demotexts kann der Build die Metadaten aus einer Datei neben dem Bild lesen, etwa `src/assets/<sha256>.json`. Dann stünde der Nachweis des Demofotos im Register statt von Hand im Text.
- Die Felder sind Daten aus einer womöglich fremden Datei. Sie werden beim Anzeigen escapt und nie als HTML eingesetzt, und `quelle` wird nur als Link gesetzt, wenn sie mit `http:` oder `https:` beginnt.

### Historie kürzen und Bilder alter Versionen weglassen (E3)

Zwei Aktionen, beide im Versionsverlauf, beide mit Bestätigung, die vorher nennt, wie viele KB die Datei kleiner wird.

1. **Historie kürzen:** Versionen vor einer gewählten Version werden gelöscht. Die Versionsnummern der übrigen bleiben, der Zähler läuft weiter. Bilder, auf die danach nichts mehr verweist, bekommen den Status „ungenutzt“ und gehen mit dem Aufräumen.
2. **Bilder alter Versionen weglassen:** Der Text aller Versionen bleibt, ihre Bilder fallen weg, soweit die aktuelle Quelle, der Demotext oder das Register sie nicht brauchen. Die betroffenen Einträge bekommen eine Markierung, Vorschlag `"bx": true` im Eintrag in `#dokufix-history`. Würde eine alte Version später angezeigt (L10), zeigt sie statt „Bild fehlt“ den Hinweis „Bilder dieser Version wurden entfernt“.

Beides nimmt das Versprechen zurück, jede Version sei aus der Datei allein vollständig wiederherstellbar. Das ist gewollt, aber es muss sichtbar sein: in der Bestätigung, in der Markierung, und in `src/README.md`, „Version history“.

Beides wirkt auf die nächste gespeicherte Datei. Eine früher gespeicherte Datei behält ihre Historie.

### Schicht 4: Oberfläche

**Dialog „Bilder“**, gebaut wie der Versionsverlauf (`<dialog>`), geöffnet über eine Schaltfläche neben `+ Bild`. Ein Raster aus Vorschaubildern, pro Bild:

- Vorschau, Name, Abmessungen, Größe in der Datei, Status aus Schicht 2,
- Aktionen: **Einfügen** an der Cursorposition, **Umbenennen**, **Alt-Text** (Vorgabe für das nächste Einfügen), **Quelle, Urheber, Lizenz**, **Bildnachweis anzeigen** (E4), **Ersetzen**, **Herunterladen**, **Zu den Stellen springen**, **Entfernen** (nur bei „ungenutzt“).

Darüber ein Filter nach Status, darunter die Summen: wie viel die Bilder in der Datei ausmachen, getrennt nach „benutzt“, „ungenutzt“, „nur Historie“ und „Demotext“. Daneben „Ungenutzte Bilder entfernen“ und, kleiner, „Speicher dieses Browsers aufräumen“.

Der Dialog gehört zum Editor. Er ist ein Element mit `data-dokufix-transient` oder liegt außerhalb der Vorschau, sodass er weder in einen Export noch in eine gespeicherte Datei gerät; `tests/speichern.mjs` prüft das ohnehin.

**Bildnachweis (E4).** Ein Dokument-Pass in `src/app/render.js`: Ist bei einem Bild `nachweis` eingeschaltet, kommt es in eine `figure` mit `figcaption`, Text aus `urheber`, `quelle` und `lizenz`. Weil es ein Dokument-Pass ist, tragen ihn alle Exporte, auch `offen` ohne JavaScript. Die Stile gehören nach `src/doc.css`. Vorgabe ist aus: Bestehende Dokumente sehen danach aus wie vorher. Ein Bild, das allein in einem Absatz steht, wird zur `figure`; ein Bild mitten im Text bekommt den Nachweis nicht, sonst bräche die Zeile.

### Module

`assets.js` mischt heute Aufnahme, Auflösen, Speichern, Einlesen und Eingabe (417 Zeilen). Nach der Regel „ein Modul pro Belang“ und „reine Logik lädt ohne Seite“:

| Modul | Zuständigkeit | Braucht |
|---|---|---|
| `assets/refs.js` | Verweise finden und umschreiben, Index, Status | nichts (Node-Tests) |
| `assets/register.js` | Register lesen, schreiben, prüfen | nichts (Node-Tests) |
| `assets/store.js` | Zugriff auf IndexedDB, Aufräumen, `persist`, `estimate` | IndexedDB |
| `assets/ingest.js` | Aufnahme, eine Strategie je Typ | Canvas |
| `assets/bake.js` | Block schreiben und einlesen, Hash prüfen | IndexedDB |
| `assets/resolve.js` | Blob-URLs, `data:`-URLs, Cache | DOM |
| `assets/input.js` | Einfügen, Drag & Drop, `+ Bild` | Seite |
| `assets/panel.js` | Dialog „Bilder“ | Seite |
| `assets/caption.js` | Dokument-Pass Bildnachweis | DOM |

## Teil 4: Phasen

Jede Phase ist für sich nutzbar und ändert das Datenformat höchstens um ein Feld, das ältere Dateien nicht brauchen.

| Phase | Inhalt | Datenformat | Prüfung |
|---|---|---|---|
| 1 Übersicht | `refs.js` herauslösen, `build.mjs` darauf umstellen. Dialog „Bilder“ zeigt die Bilder mit Status und kann einfügen. | unverändert | Node-Tests für Index und Status; Vergleichslauf unverändert |
| 2 Register | Register in Datensatz und Block, Bearbeiten im Dialog, Ersetzen, ungenutzte Bilder mittragen und aufräumen (E2), Bildnachweis als Pass (E4), Metadaten für die Bilder des Demotexts | Feld `n` in `#dokufix-assets`, Feld `assets` im Datensatz | `speichern.mjs`: Register übersteht Speichern und erneutes Speichern; ungenutztes Bild bleibt in der Datei, nach dem Aufräumen nicht mehr; Nachweis erscheint in allen Exporten |
| 3 Speicher und Historie | Aufräumen im Browser mit Karenzzeit, `persist` und `estimate`, Größen je Status, Historie kürzen und Bilder alter Versionen weglassen (E3), doppelte Bilder in den Exporten nur einmal (L7) | Feld `bx` in `#dokufix-history` | `speichern.mjs` für beide Aktionen der Historie; Messung der Exportgrößen vorher und nachher |
| 4 Typen und Export | verlustfreie Aufnahme für Screenshots (L8), SVG nur als `<img>`, Anhänge wie PDF als Link, Export nach reinem Markdown mit `bilder/<name>.<ext>` | `m` mit weiteren Typen | Messung WebP verlustbehaftet gegen verlustfrei an echten Screenshots; Prüfung, dass ein SVG mit Skript keines ausführt |

Zu L7: In `schlank` und `kompakt` läuft JavaScript; dort genügt ein Block mit jedem Bild einmal, den ein kleiner Lader auflöst. Für `offen` ohne JavaScript gibt es keinen offensichtlichen Weg, ein Bild an zwei Stellen aus einer Quelle zu zeigen. Ob sich das lohnt, entscheidet eine Messung an Dokumenten, in denen Bilder tatsächlich mehrfach vorkommen.

Zu Phase 4, SVG: Als `<img>` eingebunden führt ein SVG kein Skript aus. Eingebettet als Element im Dokument täte es das. Deshalb nie inline, auch nicht für die Großansicht.

## Teil 5: Offene Punkte

- **Karenzzeit für das Aufräumen im Browser:** 24 Stunden sind eine Annahme. Kürzer ginge, wenn der Entwurf vor dem Bild gespeichert würde; das würde aber die Reihenfolge in `handleImageInsert` umdrehen.
- **Alt-Text im Register oder im Markdown:** Der Alt-Text steht heute je Vorkommen im Markdown, und das soll so bleiben, weil dasselbe Bild an zwei Stellen Verschiedenes zeigen kann. Das Register hält nur eine Vorgabe für das nächste Einfügen.
- **Anzeige alter Versionen (L10):** Gehört nicht zur Assetverwaltung, bestimmt aber, wie viel E3 die Nutzer kostet. Sobald es eine Anzeige gibt, braucht sie den Hinweis aus `bx`.
- **Mehrere Tabs desselben Dokuments:** Zwei Tabs schreiben beide den ganzen Datensatz (`persistDoc`). Mit dem Register darin kann ein Tab die Änderungen des anderen überschreiben. Das gilt heute schon für die Quelle; das Register macht es nicht schlimmer, aber auch nicht besser.
