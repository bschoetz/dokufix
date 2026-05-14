# Plan: Bildupload + IndexedDB-Migration

**Stand:** 2026-05-14 · Eingangspunkt: PoC mit localStorage-Persistenz + drei Read-only-Export-Varianten.

**Ziel:** Bilder per Paste / Drag-and-Drop / Datei-Picker in dokufix-Dokumente einfügen. Speicherung als Blob in IndexedDB, content-adressiert per SHA-256, Referenzierung im Markdown über `#asset-{hash}`. Beim Speichern als „Mit Editor"-Datei werden alle vom Dokument referenzierten Assets in einen JSON-Block in die HTML gebacken; beim Empfänger werden sie auf dem ersten Öffnen in dessen IndexedDB übernommen.

**Out of scope diesmal:**
- Garbage-Collection alter Assets (Dedup über Content-Hash erledigt das Wesentliche)
- Bild-Editor-Funktionalität (Crop, Annotations)
- Plain-MD-Export-Dialog mit Asset-Strategie (separater Folgeschritt)

---

## Architektur

### IndexedDB-Layout

Eine Datenbank `dokufix-v1`, zwei Object Stores:

| Store | KeyPath | Wert |
|---|---|---|
| `docs` | `uuid` | `{ uuid, source, version, history[], commitBaseline, updatedAt }` |
| `assets` | `hash` | `{ hash, blob, mime, size, createdAt }` |

`docs` ersetzt die beiden bisherigen localStorage-Keys (`source` und `versions`) durch einen einzelnen Datensatz pro Dokument. `assets` speichert Bilder als nativen `Blob` (kein Base64-Bloat in der DB selbst). Content-Hash als Primary Key → automatische Deduplizierung, kein GC nötig.

### Markdown-Referenzsyntax

```markdown
![alt-text](#asset-a1b2c3d4e5f6...)
```

Der `#asset-`-Präfix wird zur Render-Zeit (Post-Marked-Pass) abgefangen und durch eine Object-URL aus IndexedDB ersetzt. Anchor-Links in Headings können nicht kollidieren — wir verbieten beim Slug-Erzeugen das Präfix `asset-` durch eine Sonderbehandlung in `slugify()`.

### Bake-Format

Neuer Script-Block neben `#dokufix-history`:

```html
<script type="application/json" id="dokufix-assets">
{"a1b2c3...": {"m":"image/webp","d":"<base64>"}}
</script>
```

Pro Asset einmal Base64-codiert (33 % Bloat — unvermeidbar für HTML-Embedding; kompakt-Variante komprimiert das später nochmal über gzip). Beim Öffnen einer empfangenen Datei wird der Block geparst und idempotent in die lokale IndexedDB übernommen (Hash existiert → no-op).

### Bild-Pipeline

```
File/Blob (paste, drop, picker)
  → createImageBitmap (decodiert, EXIF-Orientierung korrekt)
  → OffscreenCanvas (optional Downscale auf max. 1600 px Breite)
  → convertToBlob({ type: 'image/webp', quality: 0.85 })
  → crypto.subtle.digest('SHA-256') → hex
  → IDB assets.put({ hash, blob, mime, size, createdAt })
  → Insert `![alt](#asset-${hash})` an Cursor-Position
  → scheduleSave + render
```

EXIF wird durch den Canvas-Roundtrip automatisch entfernt (Privacy-Nebeneffekt). Format-Default: WebP @ 0.85 (kleinste Dateigröße bei akzeptabler Qualität). Re-encode-Toggle „Original behalten" kommt in einem Folgeschritt.

### Render-Zeit: Asset-Auflösung

Nach `marked.parse(md)`:

1. `previewEl.querySelectorAll('img[src^="#asset-"]')`
2. Eindeutige Hashes sammeln
3. Batch-Get aus IDB
4. Für jedes Bild: `URL.createObjectURL(blob)` → `img.src` setzen
5. Session-weites Cache `hash → blobUrl`, beim Doc-Wechsel und `beforeunload` revoken
6. Fehlende Assets: `img` behält den `#asset-`-src, CSS markiert „Bild fehlt"

### Read-only-Export

Bei `nur-lesen`, `schlank`, `kompakt`:
- Vor der Serialisierung: alle `<img>` mit `#asset-`-src oder Blob-URL durchgehen
- Original-Blob aus dem In-Memory-Cache holen (oder neu aus IDB nachladen, async)
- Per `FileReader.readAsDataURL` zu `data:image/webp;base64,…` konvertieren
- `img.src` direkt setzen — Empfänger braucht weder JS noch IDB

Für `kompakt` läuft das Ganze danach ohnehin durch gzip — Base64-Bloat reduziert sich geringfügig.

### Migration aus localStorage

Beim ersten Init mit der neuen Codebase, pro Dokument-UUID:
1. IDB-`docs.get(uuid)` — existiert ein Datensatz? Falls ja: fertig.
2. Falls nein: `localStorage.getItem('dokufix-doc-' + uuid + '-source')` und `…-versions` lesen
3. Vorhandene Daten konsolidieren und in IDB schreiben
4. localStorage-Keys löschen

Idempotent: wer die neue Version erstmals lädt, bekommt eine Migration; danach läuft alles aus IDB.

### Fallback / Fehler

IndexedDB ist in allen relevanten Browsern verfügbar. Wenn IDB-Open scheitert: klarer Banner („Speicher nicht verfügbar — Browser im Privatmodus?"), keine localStorage-Notlösung. PoC-Phase, modern-only.

---

## Implementierungs-Reihenfolge

1. **IDB-Layer** — Open + Schema, `getDoc / putDoc / putAsset / getAsset / batchGetAssets`. Sauber gekapselt am Anfang der Script-Sektion, async.
2. **Persistenz umstellen** — `loadFromStorage / saveToStorage / persistVersionHistory / loadVersionHistory` auf IDB. Bisherige Funktionssignaturen so weit möglich beibehalten, damit die Aufrufstellen minimal angefasst werden.
3. **localStorage-Migration** — einmaliger Migrationspfad in `loadVersionHistory`. Bestehende `dokufix-doc-*` Keys werden in IDB überführt, dann gelöscht. Heading-Numbering-Pref (`dokufix-poc-numbering`) bleibt in localStorage — kleiner, doc-unabhängig.
4. **Asset-Store-Block lesen** — beim Init `#dokufix-assets` parsen, Einträge in IDB seeden.
5. **Asset-Pipeline** — `addImageFromBlob(file, alt)`: validieren, downscale, reencode, hashen, persistieren, Source aktualisieren.
6. **Editor-Eingabewege** — `paste`-Event auf Textarea, `drop`-Event auf Textarea-Wrapper, Toolbar-Button mit `<input type=file accept="image/*" multiple>`.
7. **Render-Auflösung** — `#asset-`-imgs nach `marked.parse` durch Blob-URLs ersetzen. Slug-Kollisions-Schutz in `slugify`.
8. **Asset-Bake beim „Mit Editor"-Download** — alle Assets, die das aktuelle Dokument referenziert (inkl. Snapshots in der History?? → siehe Open Question), in `#dokufix-assets`-Block schreiben.
9. **Read-only-Export-Inlining** — `<img>`-Walks in allen drei Read-only-Funktionen, Data-URL-Substitution.
10. **Limits & UX** — max. 5 MB pro Datei, Fehlermeldung bei Überschreitung, Größenanzeige beim Einfügen.

## Open Questions, beim Implementieren entschieden

- **History-Snapshots referenzieren möglicherweise Assets, die heute nicht mehr im Source vorkommen.** Wenn wir nur „aktuell referenzierte" Assets baken, geht der Audit-Wert vergangener Versionen für Bilder verloren. Lösung: bei jedem „Mit Editor"-Save **alle** Assets baken, die das Doc je angefasst hat (Union aller Asset-Hashes über alle History-Snapshots + Current Source). Pragmatisch implementierbar als „alle Assets aus IDB, die in irgendeinem History-Source-Snapshot vorkommen".
- **Soll der Default-Download-Modus „WebP" wirklich sein?** WebP ist seit 2021 universell unterstützt (Chrome/FF/Safari/Edge), also ja. Falls jemand bei Screenshots auf PNG besteht: Folgeschritt.
- **Max-Dimensions auch für Diagramm-Screenshots?** 1600 px lassen lesbaren Text intakt — pro-Bild-Override später.

## Bezüge

- Vorgängerskizze: Konversation 2026-05-14, Memory-Eintrag [[feedback-skip-transitional-phases]].
- Bestehende Persistenz: `poc/dokufix-poc.html` Zeile 773–789 (localStorage-Layer), 808–876 (Version History), 1324–1463 (Download mit Editor).
- README-Doku, die nach Abschluss nachgezogen werden muss: `poc/README.md`.

## Review Findings

Code review run on 2026-05-14, three parallel layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Findings deduplicated across layers; sources noted in brackets.

### Patches

- [ ] [Review][Patch] Unresolved/missing asset refs produce `src=""` — browser self-loads the document URL; in read-only exports the failure is silent (no `data-missing-asset` propagated). Fix: emit a stable sentinel (transparent 1×1 data URL or preserve `#asset-` literal) and carry the missing-asset attribute through `inlineAssetRefsAsDataUrls`. [blind+edge+auditor; `poc/dokufix-poc.html:resolveAssetRefsInHtml`, `inlineAssetRefsAsDataUrls`]
- [ ] [Review][Patch] Init bails when IndexedDB is unavailable without populating the textarea or running render — user in private mode sees the banner AND an empty editor instead of the baked SAMPLE/DEMO content. Fix: when openDB fails, still load fallback content and render read-only. [blind+edge; `poc/dokufix-poc.html` init IIFE]
- [ ] [Review][Patch] Filename-derived alt text is injected raw into markdown — `x](http://attacker.com/track.png).png` produces a markdown image with attacker-controlled URL after marked parses past the first `](`. Defeats offline-first guarantee. Fix: strip/escape `]`, `(`, and `)` in `altBase` before insertion. [blind+edge; `poc/dokufix-poc.html:addImageFromBlob`]
- [ ] [Review][Patch] `assetUrlCache` grows monotonically — every distinct image insert in a session adds a blob URL that is never revoked even after the markdown ref is deleted; long sessions hold decoded images forever until `beforeunload`. Fix: on each render, revoke URLs for hashes no longer referenced by the current source. [blind+edge; `poc/dokufix-poc.html:assetUrlFor`, render]
- [ ] [Review][Patch] Rekey-during-debounced-save race in `downloadWithEditor` — `docUuid = generateDocUuid()` runs before `await idbGetDoc(oldUuid)`; if the 250 ms keystroke debounce fires during that await, `persistDoc` writes the current source under the NEW uuid and is then overwritten by `idbPutDoc({...oldRec, uuid: docUuid})` with the stale oldRec source. Fix: read oldRec first, then reassign docUuid. [blind; `poc/dokufix-poc.html:downloadWithEditor`]
- [ ] [Review][Patch] Deliberately-empty source treated as "no draft" on reload — when the user clears the textarea, `storedSource` resolves to `null` and SAMPLE/DEMO is re-substituted. User intent silently lost. Fix: use record-presence (`dbRec !== undefined`) not source-non-empty to distinguish "no draft" from "empty draft". [blind; `poc/dokufix-poc.html:loadDocState`]
- [ ] [Review][Patch] Migration writes `commitBaseline: ''` for legacy records lacking the field — then `loadDocState`'s `typeof === 'string'` check passes empty string, baseline ends up empty, and the post-migration editor reads dirty against everything. Fix: drop empty-string commitBaseline at migration or fall back to `initialSource` when commitBaseline is falsy. [blind; `migrateLegacyLocalStorage` + `loadDocState`]
- [ ] [Review][Patch] `seedAssetsFromBakedBlock` trusts sender-supplied hashes — a malicious dokufix file can pair hash `abc123…` with bytes that hash to something else; receiver stores them at the asserted key without verification. Fix: hash the decoded bytes and reject mismatches (cheap: one SHA-256 per seeded asset on init). [edge; `poc/dokufix-poc.html:seedAssetsFromBakedBlock`]
- [ ] [Review][Patch] 5 MB input cap doesn't guard against decoded-pixel blow-ups — a 4.9 MB JPEG can decode to 12000×8000 pixels (~384 MB RGBA buffer in canvas). Risk: tab OOM mid-`drawImage`. Fix: after `createImageBitmap`, reject when `width * height` exceeds a sensible cap (e.g. 25 MP) before allocating the canvas. [edge; `poc/dokufix-poc.html:addImageFromBlob`]
- [ ] [Review][Patch] `bakeAssetsForDocument` throwing aborts "Mit Editor" download — no try/catch around the call in `downloadWithEditor`. Fix: wrap and produce a clear user-facing error rather than a silent download-no-show. [edge; `poc/dokufix-poc.html:downloadWithEditor`]
- [ ] [Review][Patch] README inaccuracy: "createImageBitmap strips EXIF" — EXIF stripping happens via the canvas roundtrip, not via `createImageBitmap` itself (which just applies orientation when asked). One-line README fix. [auditor; `poc/README.md`]

### Deferred (pre-existing or PoC-scope tradeoffs)

- [x] [Review][Defer] Drag-depth desync — `dragleave` `hasFile(e)` check is unreliable in some browsers and can leave the drop overlay stuck. Standard HTML5 DnD wart; no clean fix without a heavier state machine. [blind+edge]
- [x] [Review][Defer] `crypto.subtle` / `crypto.randomUUID` unavailable in some non-secure contexts (Firefox `file://` without `dom.securecontext.allowlist`) — image upload fails with cryptic alert. Defer until offline UX is in scope. [blind]
- [x] [Review][Defer] Paste handler drops accompanying text when clipboard contains both image and text — niche scenario (screenshot copied from rich source). [blind+edge]
- [x] [Review][Defer] Selecting multiple non-image files in the picker produces back-to-back alert dialogs. Defer until batch-error aggregation is added. [edge]
- [x] [Review][Defer] Cryptic errors on unsupported formats (HEIC, SVG with scripts, animated GIF flattened to first frame, zero-byte files). Defer until expanded format support / clearer error messages are in scope. [edge]
- [x] [Review][Defer] `OffscreenCanvas.getContext('2d')` not null-checked — low-memory devices may return null. Edge case in modern browsers. [blind]
- [x] [Review][Defer] Batch paste of N images triggers N sequential renders, freezing the UI for the duration. Fix is a render-debounce; defer because batch insert is rare in PoC use. [edge]
- [x] [Review][Defer] 500-asset seed blocks init serially; 200-version bake holds N×snapshot in memory. Both are PoC-scale concerns; rework into bulk transactions / streaming later. [edge]
- [x] [Review][Defer] Quota exceeded on `persistDoc` only flips a tooltip flag — typed text since the first failure is lost on reload. Persist-failed badge is visible signal; full recovery (e.g. local export) deferred. [edge]
- [x] [Review][Defer] Spec implementation-order item 10 "Größenanzeige beim Einfügen" not implemented — only the cap-error is surfaced. Defer until upload UX gets a follow-up pass. [auditor]
- [x] [Review][Defer] Concurrent `render()` invocations can interleave on `previewEl` — pre-existing race not introduced by this change. [edge]
- [x] [Review][Defer] `onblocked` rejection caches as a stuck rejected `_dbPromise` — only relevant on future IDB version bumps. [edge]

