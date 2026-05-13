---
title: "Code Review Findings — dokufix session 2026-05-13"
type: review-findings
range: "49234db..HEAD (11 commits)"
files: "poc/dokufix-poc.html, poc/README.md"
diff_lines: 973
review_mode: full
spec: "_bmad-output/planning-artifacts/product-brief-dokufix-distillate.md"
layers: "blind, edge, auditor"
date: "2026-05-13"
---

# Triage Buckets

- **decision-needed:** 3 → resolved
- **patch:** 24 (21 original + 3 from decisions) → 23 applied, 1 dismissed during patching
- **defer:** 3 → unchanged + 1 added (diff-based per-version history)
- **dismiss:** 14 → unchanged

## Decision-needed (resolved)

- [x] [Review][Decision] **Cross-document localStorage scheme** → **chose: per-document UUID baked into file at save time.** UUIDs live in the `#dokufix-history` JSON (`uuid` field). Both storage keys (`dokufix-doc-{uuid}-source` and `dokufix-doc-{uuid}-versions`) are UUID-suffixed. Files predating this feature use a deterministic location-based fallback (`loc-{hash}`) until first save, then upgrade to a real UUID via `crypto.randomUUID()` with a `Math.random` fallback; existing localStorage data is migrated to the new key during the upgrade.

- [x] [Review][Decision] **Per-version source preservation** → **chose: per-version gzip snapshot now, diff-based later.** Each `history` entry carries an `s` field with `gzipB64(sourceEl.value)` captured at commit time. The audit story is now fully delivered: every prior version is recoverable from the file alone. Diff-based encoding is in `deferred-work.md` as a size-optimization for high-version-count files.

- [x] [Review][Decision] **slugify scope** → **chose: NFKD-normalize with explicit ä/ö/ü/ß spelling.** `slugify` now does `replace(ä→ae, ö→oe, ü→ue, ß→ss)` first, then `normalize('NFKD')` to fold the remaining Latin diacritics (é→e, à→a, ñ→n, ç→c). CJK still falls to `section` (acceptable). Verified: `## Café → cafe`, `## Lieu Étrange → lieu-etrange`, `## Sehr böser König → sehr-boeser-koenig`.

## Patch

- [x] [Review][Patch] **Modal commit-only bypasses dirty-vs-commit check** [poc/dokufix-poc.html ~line 532] — Clicking "+ Neue Version festschreiben" when source == commitBaseline still bumps the counter. Add same guard as save flow.
- [x] [Review][Patch] **`</script>` in commit message breaks JSON block** [poc/dokufix-poc.html ~line 798] — User commit message containing `</script>` closes the JSON script element early. Receiver fails to parse, history resets to v0. Escape via `replace(/<\/script>/g, '<\\/script>')` before assignment.
- [x] [Review][Patch] **Phantom version on download failure / cancel** [poc/dokufix-poc.html ~line 784] — `commitNewVersion()` bumps + persists BEFORE `triggerDownload`. If download is blocked or serialization throws, version is bumped without a file artifact. Wrap clone+download in try, only commit on success.
- [x] [Review][Patch] **commitBaseline / source mismatch across storage keys** [poc/dokufix-poc.html ~line 458] — `commitBaseline` lives in a different localStorage key than the editor source. They can desync. Bake `commitBaseline` into the file too (or guarantee it equals current source after every persist).
- [x] [Review][Patch] **history entry shape not validated on load** [poc/dokufix-poc.html ~line 457] — `Array.isArray` checks the array but not entry shape. Corrupted entries crash `formatVersionDate(undefined)` and `escapeHtml(undefined)`. Filter for `{v: number, t: string, m: string}` shape.
- [x] [Review][Patch] **`JSON.parse('null')` crashes init** [poc/dokufix-poc.html ~line 442] — A file with `<script>null</script>` parses to null, then `Number(null.version)` throws. Guard with `typeof data === 'object' && data !== null`.
- [x] [Review][Patch] **localStorage quota error silently swallowed** [poc/dokufix-poc.html ~line 469] — Quota exhaustion only logs a console warning. User believes their commits persisted. Surface a visible signal (toast or badge pulse) on persist failure.
- [x] [Review][Patch] **Inline `[[toc]]` matches too broadly** [poc/dokufix-poc.html ~line 634] — `<p><code>[[toc]]</code></p>` (a paragraph that talks about the marker) and blockquote `> [[toc]]` both match. Use `innerHTML === '[[toc]]'` style check or compare against `firstChild` to exclude wrapped tokens.
- [Review][Dismiss-during-patching] **buildTocHtml mis-nests on heading-level jumps** [poc/dokufix-poc.html ~line 613] — Reviewed during implementation. Current output is structurally correct HTML (`<ol><li>H2<ol><li>H4</li></ol></li></ol>`); the only issue is that H4 visually sits at H3's typical indent when H3 is skipped. That's the conventional Markdown ToC behaviour (vs. padding with empty `<li>` placeholders that would look weird). Real-world heading-level skips are rare. Accepting as documented limitation.
- [x] [Review][Patch] **Rail click handler leaks across renders** [poc/dokufix-poc.html ~line 716] — `railEl.addEventListener('click', tocLinkHandler)` is attached on every `render()`. After N renders, N handlers fire per click. Move attachment outside `buildRail` (once at init) or remove the old handler before adding.
- [x] [Review][Patch] **Dirty `<title>` baked into "Mit Editor" clone** [poc/dokufix-poc.html ~line 800] — `documentElement.cloneNode(true)` captures `<title>` with leading `●` if dirty. Receiver opens with stale dirty marker in tab title. Reset title text in clone.
- [x] [Review][Patch] **Compact decoder race: rail click before body decompresses** [poc/dokufix-poc.html ~line 957] — Rail HTML sits outside gzip payload. Click before async decompression → `getElementById(id)` returns null → native anchor jumps to top. Either inline rail inside payload, or have the decoder enable the rail after fill.
- [x] [Review][Patch] **Concurrent downloads share `previewEl`** [poc/dokufix-poc.html ~line 899 / 919 / 946] — Rapid clicks on different variants race on `await render()`. Disable download buttons during in-flight downloads.
- [x] [Review][Patch] **Grid reserves rail column even with <4 headings** [poc/dokufix-poc.html ~line 302] — At ≥1500 px viewport with too few headings, body becomes grid with 425 px empty right column; content shifts visually left. Either enable grid only when `body.mode-view aside.dokufix-rail.has-items` is present (CSS `:has()` or JS toggle), or fall back to single column.
- [x] [Review][Patch] **v0 exports omit metadata footer entirely** [poc/dokufix-poc.html ~line 868] — `buildMetaFooterHtml` returns empty when `currentVersion === 0`. Spec wants timestamp as always-present metadata. Always emit at least an export timestamp.
- [x] [Review][Patch] **`version-modal-close` queried without null guard** [poc/dokufix-poc.html ~line 523] — Crash on malformed HTML. Use optional chaining.
- [x] [Review][Patch] **`showModal()` throws if dialog already open** [poc/dokufix-poc.html ~line 521] — Double-click on version badge throws. Check `versionModal.open` first.
- [x] [Review][Patch] **`history.replaceState` SecurityError on `file://`** [poc/dokufix-poc.html ~line 660] — Affects Safari and some older Chromium versions opening from disk. Wrap in try/catch.
- [x] [Review][Patch] **Download buttons clickable before init completes** [poc/dokufix-poc.html ~line 968] — `commitBaseline` is `''` until IIFE runs. Click during slow CDN load → phantom v1 against empty baseline. Set an `initDone` flag, guard buttons.
- [x] [Review][Patch] **Fractional / negative version values not normalized** [poc/dokufix-poc.html ~line 456] — Malformed `{"version": -5}` or `3.7` flows through; badge can display `v-5` or `v4.7`. Use `Math.max(0, Math.floor(Number(...) || 0))`.
- [x] [Review][Patch] **`[[toc:1]]` falls through as literal text** [poc/dokufix-poc.html ~line 637] — Regex is `[2-6]`, so `[[toc:1]]` doesn't match and stays as literal in the rendered output. Either accept and include H1, or strip unrecognized markers.

## Defer

- [x] [Review][Defer] **Heading ID stability across edits** [poc/dokufix-poc.html ~line 562] — deferred, fundamental tradeoff. Slugify is deterministic per text, but reordering or renaming headings shifts dedupe counters, breaking external bookmarks. Requires content-addressed approach (hash of heading + position) to fix. Out of scope for PoC; document the limitation in README.
- [x] [Review][Defer] **`prompt()` unavailable in sandboxed iframes** [poc/dokufix-poc.html ~line 786] — deferred, PoC-stage compromise. The MVP plan replaces `prompt()` with a custom modal anyway; revisit then.
- [x] [Review][Defer] **Empty SAMPLE/DEMO fallback creates empty save** [poc/dokufix-poc.html ~line 967] — deferred, doesn't occur in current PoC (DEMO is non-empty). Build-time concern when stripped templates appear.

## Dismissed (noise / acceptable / documented intentional)

- CDN-loaded libraries fail silently → pre-acknowledged PoC compromise; MVP will inline
- "No prompt on clean save" + "commit-only without download" → explicit user-requested features, documented
- Dirty badge stays "geändert" after commit-only → documented intentional (badge tracks dirty-vs-file, not dirty-vs-commit)
- Hash desync between click-set-hash and scrollspy → minor UX, defensible
- `[[toc]]` introduces a Markdown dialect → deliberate, single non-pluggable feature, not extensibility-as-strategy
- Rail visually resembles docs sidebar at ≥1500 px → deliberate; only triggers wide viewport + ≥4 headings
- German date format in footer → PoC, German-locale
- Various style / cosmetic items (mixed array idioms, `section-2` vs `section-1`, dead variable name)
- Theoretical XSS via raw heading-id injection → no extension currently auto-assigns IDs
- "kompakt" read-only variant requires JS → documented design constraint
- Drag-to-close modal interaction → acceptable

## Resolution

All 24 patch findings handled in a single commit. The diff (`49234db..HEAD`) was reviewed at three layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) and produced 39 total findings after deduplication. 23 were applied as code patches; 1 (the heading-jump ToC nesting) was downgraded to "accept as documented limitation" during patching; 3 were deferred to MVP work; 14 were dismissed as noise or documented intentional behaviour. Independent end-to-end browser tests verify the new behaviour: dirty-vs-commit skip-logic, commit-only persistence across reload, per-file UUID isolation, NFKD-folded heading slugs, version snapshots present in baked JSON, no-prompt-when-clean save flow, read-only export footer carries version metadata.
