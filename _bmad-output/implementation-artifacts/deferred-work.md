# Deferred Work

Items intentionally postponed from reviews and audits. Each entry: source review, date, one-line description, link back to full finding.

## Deferred from: code review of product-brief-dokufix-distillate (2026-05-13)

- **Heading ID stability across edits** — Slugify is deterministic per heading text, but reordering or renaming headings shifts dedupe counters. External bookmarks to `#einleitung-2` go stale when an earlier colliding heading is renamed. Fundamental tradeoff. Requires content-addressed approach (e.g., hash heading text + position). Document the limitation in README; revisit when bookmarking emerges as a user request. [poc/dokufix-poc.html ~line 562]

- **`prompt()` unavailable in sandboxed iframes / dismissal-blocked contexts** — Native `prompt()` returns null silently in embedded contexts without `allow-modals`, and browsers can mute it after repeated dismissals. The MVP plan already specifies replacing it with a custom modal, so the issue resolves itself when that work happens. [poc/dokufix-poc.html ~line 786]

- **Empty SAMPLE/DEMO fallback would silently bake an empty source** — Edge case where neither SAMPLE nor DEMO has content; current PoC always has a non-empty DEMO, so the path is unreachable. Concern reappears only if a future "stripped template" build path exists; address there. [poc/dokufix-poc.html ~line 967]

- **Diff-based per-version history (instead of full snapshots)** — Once the in-file version history grows past ~10 entries on a typical document, full gzip snapshots per version become the dominant size cost. Storing a gzipped patch against the previous version would cut size by ~10× for typical edits but requires a diff library (e.g., `diff-match-patch`, ~30 KB) bundled into the artifact. Defer to MVP when bundling work happens anyway; revisit after observing real growth patterns. [poc/dokufix-poc.html ~line 798]
