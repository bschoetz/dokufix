# Deferred Work

Items intentionally postponed from reviews and audits. Each entry: source review, date, one-line description, link back to full finding.

## Deferred from: code review of product-brief-dokufix-distillate (2026-05-13)

- **Heading ID stability across edits** — Slugify is deterministic per heading text, but reordering or renaming headings shifts dedupe counters. External bookmarks to `#einleitung-2` go stale when an earlier colliding heading is renamed. Fundamental tradeoff. Requires content-addressed approach (e.g., hash heading text + position). Document the limitation in README; revisit when bookmarking emerges as a user request. [poc/dokufix-poc.html ~line 562]

- **`prompt()` unavailable in sandboxed iframes / dismissal-blocked contexts** — Native `prompt()` returns null silently in embedded contexts without `allow-modals`, and browsers can mute it after repeated dismissals. The MVP plan already specifies replacing it with a custom modal, so the issue resolves itself when that work happens. [poc/dokufix-poc.html ~line 786]

- **Empty SAMPLE/DEMO fallback would silently bake an empty source** — Edge case where neither SAMPLE nor DEMO has content; current PoC always has a non-empty DEMO, so the path is unreachable. Concern reappears only if a future "stripped template" build path exists; address there. [poc/dokufix-poc.html ~line 967]

- **Diff-based per-version history (instead of full snapshots)** — Once the in-file version history grows past ~10 entries on a typical document, full gzip snapshots per version become the dominant size cost. Storing a gzipped patch against the previous version would cut size by ~10× for typical edits but requires a diff library (e.g., `diff-match-patch`, ~30 KB) bundled into the artifact. Defer to MVP when bundling work happens anyway; revisit after observing real growth patterns. [poc/dokufix-poc.html ~line 798]

## Deferred from: code review of plan-images-indexeddb (2026-05-14)

- **Drag-depth desync** — `dragleave` `hasFile(e)` check is unreliable across browsers; can leave the drop overlay visible until next drop or reload. Standard HTML5 DnD wart; clean fix would require a heavier state machine tracking active drag-source.
- **`crypto.subtle` / `crypto.randomUUID` unavailable in some non-secure contexts** — Firefox on `file://` without `dom.securecontext.allowlist` lacks `crypto.subtle`, breaking image-hash and rekey UUID generation with cryptic alerts. Defer until cross-browser offline UX is in scope.
- **Paste handler drops accompanying text when clipboard contains both image and text** — niche scenario (screenshot copied from rich source). Fix would require partitioned handling per item type; not worth the complexity at PoC scale.
- **Selecting multiple non-image files in the picker produces back-to-back alert dialogs** — one alert per file. Defer until batch-error aggregation is added (collect failures, show one summary).
- **Cryptic errors on unsupported formats** (HEIC, SVG with scripts, animated GIF flattened to first frame, zero-byte files) — error path bubbles a generic message. Defer until expanded format support and clearer error UX.
- **`OffscreenCanvas.getContext('2d')` not null-checked** — null context on low-memory devices would throw an opaque TypeError on `drawImage`. Rare in modern browsers.
- **Batch paste of N images triggers N sequential renders** — UI freezes for the duration. Fix is a render debounce after the batch; defer because batch insert is rare in PoC use.
- **500-asset seed blocks init serially; 200-version bake holds N×snapshot in memory** — PoC-scale concerns. Rework into bulk IDB transactions / streaming later. [`seedAssetsFromBakedBlock`, `bakeAssetsForDocument`]
- **Quota exceeded on `persistDoc` silently loses typed text on reload** — `setPersistFailed` flips a tooltip flag, but new keystrokes after the first failure are not surfaced as unrecoverable. Persist-failed badge is the only visible signal; full recovery (local export, retry) deferred.
- **Spec implementation-order item 10 "Größenanzeige beim Einfügen" not implemented** — only the cap-error is surfaced; on successful insert the size is computed but not shown. Defer until upload UX gets a follow-up pass.
- **Concurrent `render()` invocations can interleave on `previewEl`** — pre-existing race condition (this change merely exposes it more by adding more render triggers). Fix would need a render queue or single-flight guard.
- **`onblocked` rejection caches `_dbPromise` as stuck rejection** — only matters when a future IDB_VERSION bump runs against an old tab still open. Trivially fixable with a retry on rejection, but irrelevant at v1.
