# Deferred Work

Items intentionally postponed from reviews and audits. Each entry: source review, date, one-line description, link back to full finding.

## Deferred from: code review of product-brief-dokufix-distillate (2026-05-13)

- **Heading ID stability across edits** — Slugify is deterministic per heading text, but reordering or renaming headings shifts dedupe counters. External bookmarks to `#einleitung-2` go stale when an earlier colliding heading is renamed. Fundamental tradeoff. Requires content-addressed approach (e.g., hash heading text + position). Document the limitation in README; revisit when bookmarking emerges as a user request. [poc/dokufix-poc.html ~line 562]

- **`prompt()` unavailable in sandboxed iframes / dismissal-blocked contexts** — Native `prompt()` returns null silently in embedded contexts without `allow-modals`, and browsers can mute it after repeated dismissals. The MVP plan already specifies replacing it with a custom modal, so the issue resolves itself when that work happens. [poc/dokufix-poc.html ~line 786]

- **Empty SAMPLE/DEMO fallback would silently bake an empty source** — Edge case where neither SAMPLE nor DEMO has content; current PoC always has a non-empty DEMO, so the path is unreachable. Concern reappears only if a future "stripped template" build path exists; address there. [poc/dokufix-poc.html ~line 967]

- **Diff-based per-version history (instead of full snapshots)** — Once the in-file version history grows past ~10 entries on a typical document, full gzip snapshots per version become the dominant size cost. Storing a gzipped patch against the previous version would cut size by ~10× for typical edits but requires a diff library (e.g., `diff-match-patch`, ~30 KB) bundled into the artifact. Defer to MVP when bundling work happens anyway; revisit after observing real growth patterns. [poc/dokufix-poc.html ~line 798]

## Deferred from: story 1-2 footnote hover previews (2026-07-16)

- **Preview overflows the viewport at middling widths** — the preview is centred over its marker (`position:absolute; left:50%; translateX(-50%)`). Measured: fine at 1400/1600 px (the 1000 px column is centred, leaving margin) and at 390 px (`max-width:min(32rem,90vw)` caps it), but at **~900 px a marker near the right edge pushes the box ~200 px off-screen**. A centred box cannot fit when the marker sits closer to the edge than half the box width, and pure CSS cannot detect that. **CSS anchor positioning is the intended fix but is not gate-able today:** Firefox 151 returns `true` for `CSS.supports('anchor-name','--x')` and `('position-try-fallbacks','flip-inline')`, yet the fallbacks do not take effect (verified — the tooltip still overflowed identically), so an `@supports` block would replace the verified base with an untested one in Firefox. Chromium also dropped `position-try-fallbacks: position-area(...)` as invalid syntax (computed to `none`); `@position-try` custom options would be needed. Revisit when anchor positioning is reliably shipped across engines, or accept a JS nudge for the live/`Mit Editor` variants only (the JS-free export would keep the residual). [`.dokufix-fn-preview` CSS, both stylesheets]

- **Touch devices have no hover** — tapping a marker focuses the anchor (firing `:focus-within`, so the preview flashes) and simultaneously navigates to the definition. The existing anchor jump is the touch fallback and is acceptable; engineering a tap-to-preview would need JS and would not work in the JS-free export anyway.

- **Preview text is not selectable** — `pointer-events:none` keeps the preview from swallowing clicks on the marker and makes it disappear as the pointer moves toward it (standard tooltip behaviour). The consequence is that the preview text cannot be selected or copied; the definition list at the document end remains the copyable source.

- **Images inside footnotes are dropped from the preview** — `fnFlattenInline` keeps only phrasing content, and `<img>` is unwrapped to nothing. Rare in practice (a footnote with an image), and the definition still shows it. Revisit only if it comes up.

## Deferred from: story 1-1 frontmatter metadata panel (2026-07-16)

- **YAML subset boundary — sequences of maps, block scalars, anchors, tags, flow collections** — all deliberately unsupported; the parser throws and the panel shows the raw block verbatim under a "nicht lesbar" summary. Bundling a YAML library (~30 KB against a ~16 KB artifact) fails the "body for information" test. Documented as a table in `poc/README.md`. Revisit only if real documents hit the boundary often; the honest raw fallback is the mitigation. [`parseYamlSubset`]

- **Empty `---\n---` block renders as two thematic breaks** — the two-tier detection requires the block to *look* like frontmatter (first meaningful line is a `key:` or `{`), so an empty block is not frontmatter and renders exactly as before. Consistent with AC8 but arguably surprising if someone stubs out a header intending to fill it in later. Left as-is: guessing intent here would risk swallowing legitimate thematic breaks. [`fmLooksLikeFrontmatter`]

- **Frontmatter `title:` is not used as the document title** — `deriveDocTitle()` deliberately reads only the body's first `# Heading`, per story AC6 ("never from inside the frontmatter block"). Using a frontmatter `title` as a fallback when the body has no H1 would be a reasonable enhancement, but it was out of scope and would need a decision on precedence. [`deriveDocTitle`]

- **No frontmatter editing UI** — the panel is render-only; the Markdown source stays the single source of truth. Explicitly out of scope for Epic 1.

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
