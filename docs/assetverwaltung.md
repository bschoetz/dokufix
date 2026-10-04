# Assetverwaltung

Analyse, wie dokufix die Bilder eines Dokuments verwalten soll, und der Entwurf der Architektur dafür.
Stand 4. Oktober 2026. Alle Zeilenangaben beziehen sich auf Commit `9523e6d`. Am Code ist nichts geändert; dieses Dokument ist die Grundlage für die Stories, die daraus entstehen. Ein Review hat den Entwurf gegen den Code geprüft; seine Befunde sind eingearbeitet.

## Ergebnis in Kürze

- Die **Speicherschicht** ist da und trägt: Bilder liegen inhaltsadressiert (SHA-256) in IndexedDB, das Markdown verweist mit `#asset-<hash>` darauf, „Mit Editor“ schreibt sie in die Datei, und beim Öffnen werden sie mit erneut berechnetem Hash wieder eingelesen.
- Eine **Verwaltungsschicht** fehlt: Es gibt keine Übersicht, keine Metadaten, kein Ersetzen und kein Aufräumen. Man sieht auch nicht, welches Bild wie viel der Datei ausmacht. Außerdem wird der Typ eines Bildes aus einer fremden Datei ungeprüft übernommen.
- Vorschlag: **vier Schichten**. Der Blob-Speicher bleibt, darüber kommen ein Register der Metadaten je Dokument, ein abgeleiteter Verweis-Index und ein Dialog „Bilder“.
- Im Markdown bleibt der **Hash** der Verweis. Ersetzen ist eine Aktion des Editors, die die Bild-Verweise der aktuellen Quelle umschreibt.
- Das **Register** bestimmt mit, welche Bilder eine Datei mitträgt. Ein ungenutztes Bild bleibt in der Datei, wird als „ungenutzt“ gezeigt und lässt sich aufräumen.
- Beim Öffnen werden das Register der Datei und das des Browsers **zusammengeführt**. So gehen die Metadaten einer neueren Datei nicht verloren.
- Die **Historie** lässt sich kürzen, und Bilder alter Versionen lassen sich weglassen. Beides geschieht nur auf ausdrücklichen Wunsch, ist in der Datei vermerkt und übersteht ein Neuladen.
- Der Zustand **„geändert“** berücksichtigt künftig außer dem Text auch Register und Historie.
- Das **Aufräumen im Browser** läuft nur, wenn kein anderer dokufix-Tab offen ist.
- Der **Bildnachweis** aus dem Register kann als Bildunterschrift erscheinen. Das schaltet man je Bild ein; ohne diese Wahl bleibt alles, wie es ist.
- Nebenbefund: Wer den Versionsverlauf öffnet und dann speichert, hat die Versionsliste in der gespeicherten Datei (siehe Teil 6).

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
| Verweis | `![alt](#asset-<sha256>)` an der Cursorposition; der Alt-Text kommt aus dem bereinigten Dateinamen | `handleImageInsert`, `assets.js:145` |
| Anzeige | Nach `marked.parse()` werden die Verweise in `src="…"` zu Blob-URLs, unbekannte Hashes zu einem durchsichtigen Platzhalter mit `data-missing-asset` („Bild fehlt“). Gelesen wird nur IndexedDB | `resolveAssetRefsInHtml`, `render.js:115` |
| Export | Die drei Varianten zum Lesen ersetzen jeden Verweis durch eine `data:`-URL, ebenfalls nur aus IndexedDB | `inlineAssetRefsAsDataUrls`, `assets.js:249` |
| Speichern | „Mit Editor“ schreibt jedes Bild, auf das die aktuelle Quelle, eine Version der Historie oder der Demotext verweist, in den Block `#dokufix-assets`: `{ hash: { m, d } }`. Fehlt ein Bild in IndexedDB, nimmt es den Eintrag aus dem eigenen Block der Datei | `bakeAssetsForDocument`, `assets.js:304` |
| Öffnen | Nur wenn IndexedDB verfügbar ist (`src/app.js:98`). Jeder Eintrag des Blocks mit vollem 64-stelligem Hash, den IndexedDB noch nicht hat, wird dekodiert, neu gehasht und nur bei passendem Hash geschrieben. Vorhandene Einträge bleiben unberührt | `seedAssetsFromBakedBlock`, `assets.js:180` |
| Build | Jede Datei aus `src/assets/` kommt in den Block beider gebauten Dateien, ob der jeweilige Demotext sie nennt oder nicht. Erlaubt sind `<sha256>.webp`, `.png`, `.jpg`, `.jpeg` und `.gif` | `readAssets`, `build.mjs:163` |

Das Fundament ist richtig gewählt. Inhaltsadressierung macht Duplikate unmöglich, und der Hash macht Verweise unveränderlich. Die Prüfung beim Einlesen verhindert, dass eine Datei unter dem Hash eines anderen Dokuments andere Bytes ablegt. Inhalt und Typ der Bytes prüft sie nicht (L11).

## Teil 2: Lücken

| # | Lücke | Folge |
|---|---|---|
| L1 | **Keine Übersicht.** Es gibt keine Liste der Bilder eines Dokuments. | Ein Bild lässt sich nur wiederverwenden, wenn man es erneut hochlädt oder den Hash aus der Quelle kopiert. |
| L2 | **Keine Metadaten.** Der Datensatz kennt nur Hash, Typ, Größe und Zeitpunkt. Ursprünglicher Dateiname, Abmessungen, Quelle, Urheber und Lizenz fehlen. | Die Lizenzangabe des Demofotos steht von Hand im Demotext. Ein Export nach reinem Markdown hätte keine sprechenden Dateinamen. |
| L3 | **Kein Ersetzen.** Ein geändertes Bild hat einen neuen Hash. | Jeder Verweis muss von Hand angepasst werden. |
| L4 | **Kein Aufräumen.** Der Store gilt für den ganzen Origin, also für alle Dokumente, die je in diesem Browser offen waren, und wächst nur (`idb.js:4`: „no GC needed“). Auch Dokument-Datensätze werden nie gelöscht, außer beim Umschlüsseln einer `loc-`-UUID beim ersten Speichern (`with-editor.js:46`). Eine verschobene, nie gespeicherte Datei bekommt eine neue `loc-`-UUID (`document.js:49`), ihr alter Datensatz bleibt. `navigator.storage.persist()` wird nicht angefordert. | Verwaiste Bilder und Datensätze sammeln sich an. Der Browser darf den Speicher im Modus „best effort“ räumen, und zwar für den ganzen Origin. Dann ist alles verloren, was nur im Browser liegt: ungespeicherte Entwürfe mit ihren Bildern und Versionen, die nur über die Schaltfläche im Versionsverlauf angelegt wurden und noch in keiner Datei stehen. |
| L5 | **Kein Zusammenhang zwischen Dokument und Bild.** Welche Bilder zu einem Dokument gehören, ergibt sich nur aus Regex-Treffern in Quelle, Historie und Demotext, jedes Mal neu. | Es gibt keinen Status wie „benutzt“, „nur in alten Versionen“ oder „fehlt“. Ein fehlendes Bild bemerkt man erst in der Vorschau. |
| L6 | **Die Datei wächst unsichtbar.** Jede Version der Historie hält ihre Bilder in der Datei fest. | Ein Bild, das in einer Version stand, bleibt für immer in jeder gespeicherten Datei, auch wenn es längst ersetzt ist. Wie viele KB das ausmacht, zeigt nichts an. |
| L7 | **Doppelte Bytes im Export.** `inlineAssetRefsAsDataUrls` berechnet die `data:`-URL eines Bildes einmal, setzt sie aber bei jedem Vorkommen ein (`assets.js:269–283`). | Ein Bild, das zweimal im Dokument steht, steckt in `offen`, `schlank` und `kompakt` zweimal vollständig. Ein Bild in einer Fußnote steht immer doppelt, weil die Fußnoten-Vorschau die Definition klont (`footnotes.js:60`). |
| L8 | **Ein Format für alles.** Jedes Bild wird verlustbehaftetes WebP mit Qualität 0.85 (`assets.js:14`). | Screenshots mit Text, in technischer Doku der häufigste Bildtyp, bekommen Artefakte an den Kanten der Schrift. Ob das stört, ist nicht gemessen. SVG, PDF und andere Anhänge gehen gar nicht. |
| L9 | **Verweise werden per Regex über den ganzen Text gesucht.** Der Regex nimmt 12 bis 64 Hex-Zeichen an (`assets.js:21`), nachgeschlagen wird aber nur der volle Hash. Er trifft auch `#asset-…` in Code-Spans, Codeblöcken und Links `[x](#asset-…)` (`assets.js:61–68`). Aufgelöst wird dagegen nur `src="#asset-…"` (`assets.js:23`). Derselbe Regex steht ein zweites Mal in `build.mjs:157`. | Kurze Hashes lösen nie auf. Ein Code-Beispiel, das einen Verweis zeigt, hält sein Bild in der Datei fest. Zwei Stellen definieren, was ein Verweis ist, und können auseinanderlaufen. |
| L10 | **Alte Versionen sind nur Daten.** Der Versionsverlauf listet Nummer, Datum und Beschreibung (`persistence.js:185`), zeigt eine alte Version aber nicht an und stellt sie nicht wieder her. | Dass die Bilder alter Versionen in der Datei liegen, nützt heute nur jemandem, der den Block selbst ausliest. Für E3 heißt das: Bilder alter Versionen wegzulassen kostet heute keine sichtbare Funktion, wohl aber das Versprechen, jede Version sei aus der Datei allein wiederherstellbar. |
| L11 | **Der Typ eines eingelesenen Bildes wird nicht geprüft.** `m` aus einer fremden Datei landet ungeprüft in `new Blob(…, { type })` (`assets.js:175`, `191`) und als `data:<m>` in den Exporten (`assets.js:274`). | Eine Datei kann `text/html` oder `image/svg+xml` als Bild mitbringen. Im `<img>` richtet das nichts an. Ruft man aber die `blob:`-URL selbst auf, etwa über „Bild in neuem Tab öffnen“, liefe ein Skript darin vermutlich im Origin der Seite und hätte Zugriff auf IndexedDB aller Dokumente. Das ist nicht im Browser geprüft. |

## Teil 3: Architektur

### Vier Schichten

```
┌───────────────────────────────────────────────────────────┐
│ 4  Oberfläche    Dialog „Bilder“, Render-Pass Bildnachweis │
├───────────────────────────────────────────────────────────┤
│ 3  Verweis-      abgeleitet aus Quelle, Historie, Demotext │
│    index         und Register; nie gespeichert             │
├───────────────────────────────────────────────────────────┤
│ 2  Register      Metadaten je Dokument, im Datensatz und   │
│                  im Block #dokufix-assets                  │
├───────────────────────────────────────────────────────────┤
│ 1  Blob-         IndexedDB `assets`, inhaltsadressiert,    │
│    speicher      unveränderlich (wie heute)                │
└───────────────────────────────────────────────────────────┘
```

Jede Schicht liest nur die Schichten darunter. Geschrieben wird nur von zwei Stellen: von der Oberfläche, wenn jemand eine Aktion auslöst, und vom Speichern („Mit Editor“). Der Index liest das Register, schreibt aber nie hinein. Register und Index sind reine Logik ohne Seite und laufen in den Node-Tests.

### Verweis: der Hash bleibt (E1)

Im Markdown steht weiter `![alt](#asset-<sha256>)`.

- Jede Version der Historie verweist auf genau die Bytes, die sie damals hatte. Bei logischen Namen (`#asset-logo`) müsste jede Version ihr eigenes Register mitführen, sonst zeigte eine alte Version das neue Logo.
- Es passt zur Regel des Projekts: Was sich ändert, steht in Datenblöcken, und was einmal geschrieben ist, bleibt, wie es ist.
- Lesbar bleibt die Quelle über den Alt-Text und den optionalen Titel (`![Anmeldemaske](#asset-… "Anmeldung")`). Der Dialog „Bilder“ zeigt zu jedem Hash den Namen aus dem Register.

**Was ein Verweis ist.** Ein Verweis ist ein Bild in Markdown-Syntax mit genau 64 Hex-Zeichen: `![…](#asset-<64 hex>)` oder eine Referenz-Definition `[id]: #asset-<64 hex>`, auf die ein Bild zeigt. Nicht dazu gehören Treffer in Code-Spans und Codeblöcken sowie, bis Phase 4, Links `[x](#asset-…)`. Das Modul `assets/refs.js` erkennt das ohne `marked`, denn `marked` kommt nur vom CDN und fehlt im Build und in den Node-Tests. Es überspringt Codeblöcke und Code-Spans und erkennt die Bildsyntax selbst. Ein Test im Browser vergleicht das Ergebnis mit den Bildern, die `marked` aus `tests/referenz.md` macht.

Folge für alte Dateien: Ein Bild, auf das nur ein Code-Beispiel verweist, gilt künftig als unverwiesen. Hat es keinen Register-Eintrag, fällt es beim nächsten Speichern weg. Der Dialog zeigt es vorher nicht an, weil es weder Verweis noch Register-Eintrag hat. Das ist gewollt: Ein Code-Beispiel ist kein Bild.

**Ersetzen** ist eine Aktion des Editors:

- Sie schreibt alle Bild-Verweise der *aktuellen* Quelle vom alten auf den neuen Hash um. Verweise in Code bleiben, wie sie sind, und die Historie bleibt unberührt.
- Sie schreibt über `document.execCommand('insertText')`, damit das Rückgängig des Browsers den Schritt erfasst. Eine direkte Zuweisung an `textarea.value`, wie heute in `insertAtCursor` (`assets.js:139`), erfasst es nicht. Ob `insertText` in allen drei Browsern einen Rückgängig-Schritt ergibt, ist zu prüfen. Wenn nicht, bekommt Ersetzen einen eigenen Rückgängig-Knopf im Dialog.
- Name, Quelle, Urheber, Lizenz und `nachweis` gehen auf den neuen Hash über. Der alte Eintrag behält seine Metadaten und bekommt danach den Status „nur Historie“ oder „ungenutzt“.
- Der Zustand wird „geändert“, wie bei jeder Textänderung.

### Schicht 1: Blob-Speicher

Bleibt, wie er ist: ein Store für den ganzen Origin, Schlüssel ist der Hash, ein Eintrag ändert sich nie. Neu sind vier Dinge.

**Typen prüfen (L11).** Beim Einlesen gilt eine Liste erlaubter Typen, heute `image/webp`, `image/png`, `image/jpeg` und `image/gif`, dieselbe wie `ASSET_TYPES` in `build.mjs:155`. Ein Eintrag mit anderem `m` wird übersprungen und gemeldet wie ein falscher Hash. Dieselbe Prüfung gilt beim Speichern und Exportieren für den Fall, dass IndexedDB schon solche Einträge hat.

**Rückfall auf den eigenen Block.** Anzeige und Export greifen wie das Speichern auf den Block `#dokufix-assets` der geöffneten Datei zurück, wenn IndexedDB ein Bild nicht hat. Dann zeigt ein offener Tab seine Bilder auch dann, wenn IndexedDB geräumt wurde oder nicht verfügbar ist.

**Aufräumen im Browser.** Das ist Mark-and-Sweep über den Store `docs`.

- **Markiert** ist jeder Hash, auf den Quelle, Historie oder Register eines Datensatzes verweisen. Wegen E2 gehören dazu auch ungenutzte Bilder, solange sie im Register stehen. Dazu kommen die Bilder des Demotexts.
- **Gelöscht** wird, was nicht markiert ist und dessen Karenzzeit abgelaufen ist. Vorschlag: 24 Stunden nach dem späteren von `createdAt` und `seenAt`. `seenAt` setzt das Einlesen beim Öffnen auch für Einträge, die IndexedDB schon hat.
- **Nur ohne andere Tabs.** Jeder dokufix-Tab hält für seine Lebenszeit eine geteilte Sperre über die Web Locks API. Zum Aufräumen gibt der eigene Tab seine Sperre ab, schreibt seinen Entwurf sofort (ohne die 250 ms aus `persistence.js:135`) und fordert die Sperre exklusiv mit `ifAvailable` an. Bekommt er sie nicht, ist ein anderer Tab offen: Das Aufräumen bricht mit dieser Meldung ab. Danach nimmt der Tab wieder die geteilte Sperre. Ob Web Locks auf `file://` in allen drei Browsern verfügbar ist, ist zu prüfen. Wo nicht, wird die Aktion nicht angeboten.
- **Warum es sicher ist:** Eine gespeicherte Datei trägt ihre Bilder selbst. Öffnet man sie wieder, kommen die Bilder aus ihrem Block zurück.
- **Wofür die Karenzzeit bleibt:** Die Sperre schützt offene Tabs. Die Karenzzeit fängt den Fall ab, dass ein Tab ohne Sperre läuft, etwa eine ältere dokufix-Datei, die keine Sperre kennt.
- **Bedienung:** Es läuft nur auf Klick („Speicher dieses Browsers aufräumen“), nie von selbst, und meldet vorher, wie viele Bilder und wie viele MB es löschen wird.

**Dokumente in diesem Browser.** Ohne eine Möglichkeit, Datensätze zu löschen, gibt das Aufräumen kaum etwas frei: Was je in einem Entwurf stand, bleibt markiert. Deshalb gehört eine Liste aller Datensätze in `docs` dazu: UUID, Titel, letzte Änderung, Größe, und ob die geöffnete Datei dazugehört. Einzelne Einträge lassen sich löschen, nach Bestätigung, die sagt, dass ungespeicherte Entwürfe damit verloren sind. Verwaiste `loc-`-Datensätze sind dort als solche zu erkennen.

**Dauerhafter Speicher.** Die Seite fordert `navigator.storage.persist()` beim ersten Schreiben eines Entwurfs an, nicht erst beim ersten Bild. Gefährdet sind auch reine Text-Entwürfe (L4). Firefox fragt dabei vermutlich nach (nicht geprüft), deshalb geschieht es erst bei einer Aktion der Nutzerin oder des Nutzers, nicht beim Öffnen. Der Dialog zeigt `navigator.storage.estimate()`: belegt und verfügbar.

**Aufnahme je Typ.** Die Aufnahme wird eine Strategie je Eingabetyp, die `{ blob, mime, meta }` liefert (siehe Teil 4, Phase 4). Der Store selbst bleibt dabei unverändert.

### Schicht 2: Register

Je Dokument eine Zuordnung vom Hash zu den Metadaten. Zusammen mit den Verweisen bestimmt es, welche Bilder eine Datei mitträgt.

**Was hineinkommt.**

- Jedes Bild, das über `+ Bild`, Einfügen oder Drag & Drop aufgenommen wird, sofort.
- Beim Speichern („Mit Editor“) jeder volle 64-stellige Hash, auf den die aktuelle Quelle verweist, dessen Bytes vorhanden sind und den das Register noch nicht kennt. Das betrifft etwa Markdown, das aus einem anderen Dokument eingefügt wurde. Der Eintrag hat dann noch keine Metadaten außer Abmessungen und Zeitpunkt.
- Nicht beim Rendern. Sonst entstünden beim Tippen eines Hashes Einträge für jeden Teil-Hash, die wegen E2 als „ungenutzt“ stehen blieben.

**Was eine Datei mitträgt (E2, E3).** Beim Speichern schreibt „Mit Editor“ in den Block:

- jedes Bild, auf das die aktuelle Quelle verweist,
- jedes Bild aus dem Register,
- jedes Bild, auf das eine Version *ohne* `bx` verweist,
- jedes Bild des Demotexts.

Das ändert das heutige Verhalten: Ein Bild, das eingefügt und im Text wieder gelöscht wurde, ohne je in einer Version zu stehen, fiel bisher beim Speichern weg. Jetzt bleibt es in der Datei, bis man aufräumt.

Ein Register-Eintrag, dessen Bytes beim Speichern weder in IndexedDB noch im eigenen Block liegen, kann nicht geschrieben werden. Er wird ausgelassen. Der Dialog zeigt ihn vorher als „fehlt“, und das Speichern nennt ihn in einer Meldung.

**Aufräumen im Dokument (E2).** Der Dialog bietet zwei Wege:

- „Ungenutzte Bilder entfernen“ für alle Bilder mit Status „ungenutzt“,
- „Entfernen“ für ein einzelnes.

Das löscht den Eintrag aus dem Register und merkt den Hash in der Liste `entfernt` des Datensatzes. Beim nächsten Speichern fehlt das Bild in der Datei. Die Liste verhindert, dass das Zusammenführen beim Öffnen (siehe unten) das Bild aus der noch nicht neu gespeicherten Datei zurückholt. Fügt man dasselbe Bild später wieder ein, verschwindet es aus der Liste.

Bilder mit Status „benutzt“, „Demotext“ oder „nur Historie“ lassen sich so nicht entfernen. Für „nur Historie“ ist die Historie zuständig (siehe unten).

**Wo es steht.**

- In IndexedDB als Feld `register` des Dokument-Datensatzes in `docs`, daneben die Liste `entfernt`. Es braucht keine neue Version des Datenbankschemas und keine Migration: Einträge in `docs` haben kein festes Schema. `persistDoc` muss die Felder aber ausdrücklich mitschreiben, denn es schreibt den Datensatz feldweise neu (`persistence.js:118–124`).
- In der Datei als Feld `n` der vorhandenen Einträge in `#dokufix-assets`. Ein Eintrag mit `n` ist ein Register-Eintrag; ein Eintrag ohne `n` trägt nur Bytes für Verweise aus Quelle, Historie oder Demotext.

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

- Ein Eintrag braucht `d`. Einträge ohne `d` überspringt das Einlesen wie heute (`assets.js:177`). Einen Register-Eintrag ohne Bytes gibt es in der Datei also nicht.
- Alle bisherigen Dateien bleiben lesbar: Ihre Einträge haben kein `n` und sind damit keine Register-Einträge.

**Zusammenführen beim Öffnen.** Einen Datensatz zur UUID gibt es fast immer: Er entsteht bei jeder Eingabe (`editor.js:12`), bei „Demo zurücksetzen“ (`editor.js:26`) und nach jedem Speichern. Würde der Datensatz einfach gewinnen, wie bei der Quelle, läse man das Register der Datei nur beim allerersten Öffnen in einem Browser. Die Metadaten einer neueren Datei von jemand anderem gingen dann verloren. Deshalb:

- Das Register ist die Vereinigung aus Block und Datensatz, ohne die Hashes in `entfernt`.
- Bei gleichem Hash gelten die Metadaten des Datensatzes.
- Ein Datensatz ohne Feld `register`, geschrieben von älterem Code, zählt als „kein Register“, nicht als „leeres Register“. Dann gilt das Register der Datei.

**Prüfen, was hereinkommt.** Die Felder sind Daten aus einer womöglich fremden Datei.

- Alle Texte werden beim Anzeigen escapt und nie als HTML eingesetzt.
- `quelle` wird mit `new URL()` geprüft und nur als Link gesetzt, wenn das Protokoll `http:` oder `https:` ist; sonst erscheint sie als Text.
- `w` und `h` werden nur als endliche positive Zahlen übernommen. Sonst bestimmt das Einlesen sie aus den Bytes.
- `name` wird für die Verwendung als Dateiname bereinigt: keine `/`, `\`, `..` und Steuerzeichen.

**Bilder des Demotexts.** Der Build kann ihre Metadaten aus einer Datei neben dem Bild lesen, `src/assets/<sha256>.json`. Dann stünde der Nachweis des Demofotos im Register statt von Hand im Text. Dafür muss die Prüfung in `build.mjs:166–172` mitgeändert werden: Heute lässt jede Datei in `src/assets/`, die nicht `<sha256>.<Bildendung>` heißt, den Build scheitern.

### Schicht 3: Verweis-Index

Ein Modul `src/app/assets/refs.js` ist die einzige Stelle, die Verweise findet und umschreibt (Definition oben unter „Was ein Verweis ist“). `build.mjs` importiert es. Damit verschwindet der zweite Regex, und der tote Pfad für kurze Hashes ebenso, weil ein Verweis genau 64 Zeichen hat (L9).

Aus Quelle, Historie, Demotext und Register rechnet der Index für jeden Hash:

- Anzahl und Positionen in der aktuellen Quelle,
- die Versionsnummern, in denen er vorkommt, getrennt nach Versionen mit und ohne `bx`,
- ob der Demotext ihn benutzt,
- ob das Register ihn kennt,
- ob IndexedDB oder der Block der Datei die Bytes hat.

Daraus folgt genau ein Status. Es gilt der **erste** zutreffende:

| Rang | Status | Bedingung | Im Dialog |
|---|---|---|---|
| 1 | fehlt | Quelle, Demotext, eine Version ohne `bx` oder das Register verweist darauf, aber keine Bytes sind vorhanden | rot, wie „Bild fehlt“ in der Vorschau |
| 2 | benutzt | Die aktuelle Quelle verweist darauf | normal |
| 3 | Demotext | Der Demotext verweist darauf | gedämpft, nicht aufräumbar |
| 4 | nur Historie | Eine Version ohne `bx` verweist darauf | gedämpft, mit Versionsnummern |
| 5 | ungenutzt | Im Register, sonst kein Verweis | hervorgehoben, aufräumbar |
| 6 | entfernt | Nur Versionen mit `bx` verweisen darauf | gedämpft, Hinweis „mit alten Versionen entfernt“; wird nicht mitgespeichert |

Damit hat jeder Hash, der in irgendeiner Quelle vorkommt, genau einen Status. Ein Hash, den der Demotext und alte Versionen nennen, ist „Demotext“. Ein verwiesener Hash ohne Bytes ist „fehlt“, nicht zugleich „benutzt“.

Der Index wird nie gespeichert. Jedes Rendern rechnet ihn neu, daher kann er nicht veralten. Die Historie muss dafür entpackt werden. Das Ergebnis je Version lässt sich für die Sitzung zwischenspeichern, weil sich eine Version nie ändert.

### Historie kürzen und Bilder alter Versionen weglassen (E3)

Zwei Aktionen, beide im Versionsverlauf, beide mit Bestätigung.

1. **Historie kürzen:** Versionen vor einer gewählten Version werden gelöscht. Die Versionsnummern der übrigen bleiben, der Zähler läuft weiter.
   - Bilder, auf die danach nichts mehr verweist und die im Register stehen, bekommen den Status „ungenutzt“.
   - Bilder ohne Register-Eintrag, etwa aus einer älteren Datei, haben danach keinen Status und fallen beim nächsten Speichern still weg.
   - Die Bestätigung nennt beide Gruppen mit ihren KB. Ein Häkchen „ungenutzte Bilder gleich mit entfernen“ räumt in einem Schritt mit auf.
2. **Bilder alter Versionen weglassen:** Der Text aller Versionen bleibt. Ihre Bilder mit Status „nur Historie“ fallen weg, samt ihren Register-Einträgen. Bilder, die Quelle oder Demotext brauchen, bleiben.
   - Die betroffenen Einträge in `#dokufix-history` bekommen `"bx": true`. Ihre Bilder haben danach den Status „entfernt“ und werden nicht mehr mitgespeichert.
   - Würde eine alte Version später angezeigt (L10), zeigt sie statt „Bild fehlt“ den Hinweis „Bilder dieser Version wurden entfernt“.
   - Die Bestätigung nennt, wie viele KB die Datei kleiner wird.

Beides nimmt das Versprechen zurück, jede Version sei aus der Datei allein vollständig wiederherstellbar. Das ist gewollt, aber es muss sichtbar sein: in der Bestätigung, in der Markierung und in `src/README.md`, „Version history“.

**Damit es ein Neuladen übersteht.** Beide Aktionen ändern die Versionsnummer nicht. `loadDocState` nimmt die Historie aus IndexedDB aber nur, wenn deren Version höher ist als die der Datei (`persistence.js:84`). Ohne Vorkehrung wäre nach einem Neuladen die ungekürzte Historie aus der Datei zurück, und die `bx`-Marken wären weg. Deshalb:

- Datensatz und `#dokufix-history` bekommen einen Zähler `rev`, den beide Aktionen erhöhen.
- Der Datensatz gewinnt, wenn seine Version höher ist, oder bei gleicher Version, wenn sein `rev` höher ist.

Beides wirkt auf die nächste gespeicherte Datei. Eine früher gespeicherte Datei behält ihre Historie.

Wenn die Historie später als Diff gegen die Vorversion gespeichert wird („Known PoC limitations“ in `src/README.md`), muss Kürzen die erste verbleibende Version vorher als vollständige Fassung neu aufbauen.

### Zustand „geändert“

Heute vergleicht der Zustand nur den Text mit dem, was die Datei trägt (`persistence.js:249`). Nach Umbenennen, Lizenz eintragen, Aufräumen oder Kürzen stünde „wie in Datei“, obwohl die nächste gespeicherte Datei anders wäre. „Mit Editor“ ohne Textänderung schreibt diese Änderungen zwar (`with-editor.js:54–57`), aber nichts fordert zum Speichern auf.

Künftig gilt „geändert“, sobald Text, Register oder Historie von dem abweichen, was die Datei trägt. Für Register und Historie genügt ein Vergleich je eines Fingerabdrucks, berechnet aus dem kanonisch serialisierten Inhalt beim Öffnen und nach jedem Speichern.

### Schicht 4: Oberfläche

**Dialog „Bilder“**, ein `<dialog>` wie der Versionsverlauf, geöffnet über eine Schaltfläche neben `+ Bild`. Ein Raster aus Vorschaubildern, pro Bild:

- Vorschau, Name, Abmessungen, Größe in der Datei, Status aus Schicht 3,
- Aktionen: **Einfügen** an der Cursorposition, **Umbenennen**, **Alt-Text** (Vorgabe für das nächste Einfügen), **Quelle, Urheber, Lizenz**, **Bildnachweis anzeigen** (E4), **Ersetzen**, **Herunterladen** über `<a download>`, **Zu den Stellen springen**, **Entfernen** (nur bei „ungenutzt“).

Darüber ein Filter nach Status. Darunter die Summen: wie viel die Bilder in der Datei ausmachen, getrennt nach „benutzt“, „ungenutzt“, „nur Historie“ und „Demotext“. Daneben „Ungenutzte Bilder entfernen“ und, kleiner, „Speicher dieses Browsers aufräumen“ und „Dokumente in diesem Browser“.

**Der Dialog darf nicht in die gespeicherte Datei.** „Mit Editor“ klont die ganze Seite (`with-editor.js:89`). Dass der Dialog außerhalb der Vorschau liegt, hält ihn also nicht heraus. Deshalb:

- Die Hülle in `src/index.html` bleibt leer.
- Der Inhalt entsteht beim Öffnen als Element mit `data-dokufix-transient` und wird beim Speichern mit den anderen flüchtigen Elementen entfernt.
- `tests/speichern.mjs` bekommt einen Durchlauf „gespeichert, nachdem der Dialog Bilder und der Versionsverlauf geöffnet waren“. Heute prüft es keinen Zustand mit offenem Dialog. Der Versionsverlauf hat genau diese Lücke schon (Teil 6).

**Bildnachweis (E4).** Ein Dokument-Pass in `src/app/render.js`:

- Ist bei einem Bild `nachweis` eingeschaltet, kommt es in eine `figure` mit `figcaption`, Text aus `urheber`, `quelle` und `lizenz`.
- Woran der Pass das Bild erkennt: Die Verweise werden aufgelöst, bevor die Dokument-Pässe laufen (`render.js:115–120`). Ein Pass sieht also `src="blob:…"`, keinen Hash. Deshalb setzt das Auflösen an jedes Bild `data-asset="<hash>"`. Das Attribut gelangt in die Exporte, und der Vergleichslauf braucht einmal eine neue Grundlage.
- Er steht in `DOCUMENT_PASSES` vor „Fußnoten-Vorschau“, die Definitionen klont (`render.js:62`, `footnotes.js:60`). So trägt auch die Vorschau einer Fußnote den Nachweis.
- Weil es ein Dokument-Pass ist, tragen ihn alle Exporte, auch `offen` ohne JavaScript. Die Stile gehören nach `src/doc.css`.
- Vorgabe ist aus: Bestehende Dokumente sehen danach aus wie vorher.
- Ein Bild, das allein in einem Absatz steht, wird zur `figure`. Ein Bild mitten im Text bekommt den Nachweis nicht, sonst bräche die Zeile.

### Module

`assets.js` mischt heute Aufnahme, Auflösen, Speichern, Einlesen und Eingabe (417 Zeilen). Nach der Regel „ein Modul pro Belang“ und „reine Logik lädt ohne Seite“:

| Modul | Zuständigkeit | Braucht |
|---|---|---|
| `assets/refs.js` | Verweise finden und umschreiben, Index, Status | nichts (Node-Tests, Build) |
| `assets/register.js` | Register lesen, schreiben, zusammenführen, prüfen | nichts (Node-Tests) |
| `assets/store.js` | Zugriff auf IndexedDB, Typprüfung, Aufräumen, Sperre, `persist`, `estimate` | IndexedDB, Web Locks |
| `assets/ingest.js` | Aufnahme, eine Strategie je Typ | Canvas |
| `assets/bake.js` | Block schreiben und einlesen, Hash und Typ prüfen | IndexedDB |
| `assets/resolve.js` | Blob-URLs, `data:`-URLs, Cache, Rückfall auf den eigenen Block, `data-asset` | DOM |
| `assets/input.js` | Einfügen, Drag & Drop, `+ Bild` | Seite |
| `assets/panel.js` | Dialog „Bilder“, Dokumente in diesem Browser | Seite |
| `assets/caption.js` | Dokument-Pass Bildnachweis | DOM |

## Teil 4: Phasen

Jede Phase ist für sich nutzbar. Sie ändert das Datenformat nur um Felder, die ältere Dateien nicht brauchen und älterer Code ignoriert. Was älterer Code beim *Speichern* mit diesen Feldern macht, steht in Teil 5.

| Phase | Inhalt | Datenformat | Prüfung |
|---|---|---|---|
| 1 Übersicht | `refs.js` mit der neuen Definition eines Verweises, `build.mjs` darauf umstellen. Typprüfung beim Einlesen (L11). Rückfall auf den eigenen Block bei Anzeige und Export. Dialog „Bilder“ als flüchtiges Element: zeigt die Bilder mit Status und kann einfügen. Ohne Register gibt es noch keine Namen und keinen Status „ungenutzt“, nur „benutzt“, „Demotext“, „nur Historie“ und „fehlt“. | unverändert | Node-Tests für Verweise, Index und Status; Browser-Test gegen `marked`; Vergleichslauf unverändert; `speichern.mjs` mit geöffnetem Dialog |
| 2 Register | Register in Datensatz und Block, Zusammenführen beim Öffnen, Liste `entfernt`, Bearbeiten im Dialog, Ersetzen, ungenutzte Bilder mittragen und aufräumen (E2), Zustand „geändert“ für das Register, `data-asset` und Bildnachweis als Pass (E4), Metadaten für die Bilder des Demotexts | Feld `n` in `#dokufix-assets`; Felder `register` und `entfernt` im Datensatz; geänderte Regel, was eine Datei mitträgt (E2); Build nimmt `src/assets/<sha256>.json` an | `speichern.mjs`: Register übersteht Speichern und erneutes Speichern; neuere Datei bringt ihre Metadaten in einen Browser mit älterem Entwurf; ungenutztes Bild bleibt in der Datei, nach dem Aufräumen nicht mehr; Nachweis erscheint in allen Exporten; Vergleichslauf mit neuer Grundlage wegen `data-asset` |
| 3 Speicher und Historie | Aufräumen im Browser mit Sperre und Karenzzeit, `seenAt`, Dokumente in diesem Browser, `persist` und `estimate`, Größen je Status. Historie kürzen und Bilder alter Versionen weglassen (E3), Zustand „geändert“ für die Historie. Nach Messung: doppelte Bilder in `kompakt` nur einmal (L7) | Felder `bx` und `rev` in `#dokufix-history` und im Datensatz; `seenAt` in `assets` | `speichern.mjs` für beide Aktionen der Historie, auch nach Neuladen vor dem Speichern; Aufräumen mit zwei offenen Tabs bricht ab |
| 4 Typen und Export | verlustfreie Aufnahme für Screenshots (L8), SVG, Anhänge wie PDF, Export nach reinem Markdown mit `bilder/<name>.<ext>` | `m` mit weiteren Typen; neue Art Verweis `[x](#asset-…)` für Anhänge, die Auflösen und Export als `href` behandeln | Messung WebP verlustbehaftet gegen verlustfrei an echten Screenshots; Prüfung, dass ein SVG mit Skript keines ausführt, auch nicht über „in neuem Tab öffnen“ |

Zu L7: In `kompakt` läuft ohnehin JavaScript; dort genügt ein Block mit jedem Bild einmal, den der Lader auflöst. In `schlank` sind die Bilder heute ohne Skript sichtbar, nur die Diagramme sind gepackt. Ein solcher Block würde dort die Bilder vom Skript abhängig machen; deshalb nicht in `schlank`. Für `offen` ohne JavaScript gibt es keinen offensichtlichen Weg, ein Bild an zwei Stellen aus einer Quelle zu zeigen. Ob sich der Umbau in `kompakt` lohnt, entscheidet eine Messung an Dokumenten, in denen Bilder tatsächlich mehrfach vorkommen.

Zu Phase 4, SVG: Ein SVG wird nur als `data:`-URL in einem `<img>` gezeigt, nie als `blob:`-URL und nie als Element im Dokument. Eine `blob:`-URL hat den Origin der Seite; ruft man sie direkt auf, liefe ein Skript im SVG dort. Eine `data:`-URL lässt sich nicht als Seite aufrufen. Das gilt auch für die Großansicht.

Zu Phase 4, Export nach reinem Markdown: Eine Datei `.md` mit einem Ordner `bilder/` ist mehr als ein Download. Sie braucht entweder ein ZIP, das die Seite selbst schreibt (ohne Kompression genügt ein kleiner Schreiber), oder die File System Access API, die es nur in Chromium gibt. Der Name aus dem Register wird dabei Dateiname, bereinigt wie oben beschrieben und bei Gleichheit nummeriert.

## Teil 5: Ältere dokufix-Dateien

Der Code reist mit der Datei. Eine ältere Datei bekommt die neuen Funktionen also nie, teilt aber IndexedDB mit neuen Dateien desselben Origins. Was dabei geschieht, ist am Code auf Stand `9523e6d` nachgelesen:

| Fall | Was geschieht |
|---|---|
| Alter Code liest eine neue Datei | Fehlerfrei. `n` wird ignoriert (`assets.js:175–177`), `bx` und `rev` reicht `isValidEntry` durch (`persistence.js:109–114`). |
| Alter Code speichert eine neue Datei | Er schreibt nur verwiesene Bilder (`assets.js:305–315`) und nur `m` und `d` (`assets.js:330`, `334`, `349`). `n` geht verloren, ungenutzte Bilder fallen weg. Die Bilder von `bx`-Versionen nimmt er wieder auf, solange IndexedDB sie hat. `bx` und `rev` bleiben in der Historie stehen. |
| Alter Code bearbeitet ein Dokument derselben UUID im selben Browser | `persistDoc` schreibt den Datensatz ohne `register` und `entfernt`. Der neue Code liest danach „kein Register“ und nimmt das Register aus der Datei. Was nur im Browser stand, etwa neue Metadaten, die noch in keiner Datei sind, ist verloren. |
| Alter Code läuft in einem Tab, während der neue aufräumt | Der alte Tab hält keine Sperre. Die Karenzzeit schützt seine Bilder 24 Stunden lang ab dem Öffnen; danach kann sie das Aufräumen löschen. Dann zeigt der alte Tab „Bild fehlt“, und nur „Mit Editor“ fällt auf den eigenen Block zurück. |

Das ist hinnehmbar, solange es bekannt ist. In die Bestätigung des Aufräumens im Browser gehört der Satz, dass ältere dokufix-Dateien in offenen Tabs ihre Bilder verlieren können.

## Teil 6: Nebenbefund – Versionsliste in der gespeicherten Datei

Beim Review gefunden, unabhängig von der Assetverwaltung, und am Code bestätigt. Es ist ein bestehender Fehler und gehört in eine eigene Story.

- **Was geschieht:** `renderVersionModalBody` füllt beim Öffnen des Versionsverlaufs `.version-modal-body` mit der Liste der Versionen (`persistence.js:186–200`). In `src/index.html:78` ist dieses Element leer.
- **Warum es in die Datei gerät:** „Mit Editor“ klont die ganze Seite und leert das Element nicht. Es trägt auch kein `data-dokufix-transient`.
- **Folge:** Wer den Verlauf geöffnet hat und danach speichert, hat die Liste in der gespeicherten Datei. Damit ist die Datei nicht mehr „das gebaute File mit anderen Datenblöcken“.
- **Warum der Test es nicht findet:** `tests/speichern.mjs` speichert in keinem Zustand mit geöffnetem Dialog.
- **Behebung:** Die Liste beim Öffnen als Element mit `data-dokufix-transient` einsetzen, oder `.version-modal-body` beim Speichern leeren. Dazu den Durchlauf in `speichern.mjs` aus Schicht 4.

## Teil 7: Offene Punkte

- **Karenzzeit:** 24 Stunden sind eine Annahme. Mit der Sperre schützt sie nur noch Tabs älterer Dateien (Teil 5).
- **Web Locks auf `file://`:** Ob die API dort in Chromium, Firefox und Safari verfügbar ist, ist nicht geprüft. Ohne sie gibt es kein Aufräumen im Browser.
- **Rückgängig beim Ersetzen:** Ob `execCommand('insertText')` in allen drei Browsern einen Rückgängig-Schritt im Textfeld ergibt, ist nicht geprüft.
- **Alt-Text im Register oder im Markdown:** Der Alt-Text steht heute je Vorkommen im Markdown, und das soll so bleiben, weil dasselbe Bild an zwei Stellen Verschiedenes zeigen kann. Das Register hält nur eine Vorgabe für das nächste Einfügen.
- **Anzeige alter Versionen (L10):** Gehört nicht zur Assetverwaltung, bestimmt aber, wie viel E3 die Nutzer kostet. Sobald es eine Anzeige gibt, braucht sie den Hinweis aus `bx`.
- **Mehrere Tabs desselben Dokuments:** Zwei Tabs schreiben beide den ganzen Datensatz (`persistDoc`), und der zuletzt schreibende gewinnt. Das gilt heute schon für die Quelle und künftig auch für Register, `entfernt` und `rev`. Das Zusammenführen hilft nur zwischen Datei und Browser, nicht zwischen zwei Tabs. Das Aufräumen im Browser ist durch die Sperre geschützt.
