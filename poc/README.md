# dokufix — Proof of Concept

A working prototype of the **dokufix** vision: one HTML file that is simultaneously the viewer, the editor, and the artifact for technical documentation written in Markdown + Mermaid.

Open `dokufix-poc.html` in any modern browser. No install, no server, no account.

## What this PoC demonstrates

- **Markdown + Mermaid rendering** in the browser via `marked` and `mermaid` (loaded from CDN — production will inline these).
- **Viewer ↔ Editor toggle.** Default mode is the reader experience; a discreet "Editor ↩" button in the corner reveals the editing UI.
- **IndexedDB persistence** — one record per dokufix file (keyed by UUID) holds the live markdown source, version history, and commit baseline. Image assets live in a separate object store, keyed by SHA-256 content hash. Documents that were saved by an older localStorage-based build of the PoC are migrated transparently on first open with the new code.
- **Image upload (paste, drag-and-drop, file picker)** — drop a file onto the editor, paste a screenshot from the clipboard, or use the `+ Bild` button. The image is decoded via `createImageBitmap` (with `imageOrientation: 'from-image'` so EXIF orientation is applied to the pixels), optionally downscaled to a max of 1600 px wide, re-encoded as WebP @ 0.85, hashed, and stored in IndexedDB. The canvas roundtrip is what strips EXIF metadata as a side effect; `createImageBitmap` itself doesn't strip anything. The markdown gets a `![alt](#asset-<hash>)` reference; the render pass swaps that reference for a Blob URL pulled from IndexedDB. Read-only exports replace `#asset-` and `blob:` URLs with inline `data:` URLs so the recipient has no IDB or runtime dependency. `Mit Editor` downloads include every asset referenced by the current source **or by any history snapshot** in a separate `<script type="application/json" id="dokufix-assets">` block — content-addressed, so a re-seed of an identical hash is a no-op.
- **Explicit save** — leaving edit mode does **not** auto-save; saving is a deliberate user action via the Download menu.
- **Self-replication** — the "Mit Editor" download produces a new HTML file with the user's content baked in (gzip-compressed). The receiver opens that file and starts from there.
- **Three read-only export tiers** — open / schlank / kompakt, each with different size-vs-portability tradeoffs.
- **Footnotes with hover previews** — GFM footnote syntax (`[^id]` / `[^id]:`) via `marked-footnote`, plus a preview that appears when the reader hovers or keyboard-focuses a marker, so an aside can be read without jumping to the bottom of the document. Pure CSS, so it works in the JS-free export. See *Footnotes* below.
- **Frontmatter metadata panel** — a leading YAML or JSON header block renders as a collapsible panel instead of leaking into the document as markup. Native `<details>`, so it collapses without JavaScript and survives the JS-free export. See *Frontmatter* below.
- **Heading numbering toggle** — opt-in 1.2.3 outline numbering via pure CSS counters.
- **Two-layer Table of Contents** — author-placed inline `[[toc]]` marker (renders as a static nested list inside the document, ships through every export variant) plus a JS-driven right-side scrollspy rail in read mode on wide viewports.
- **Dirty-state indicator** — a header badge (and a `●` prefix in the browser tab title) shows whether the editor content matches what is baked into the file. Resets to clean after a "Mit Editor" download.
- **In-file version history with per-version source snapshots** — each "Mit Editor" download and each "commit-only" action appends a `{v, t (ISO), m (message), s (gzipped source)}` entry to a JSON block embedded in the file (`<script type="application/json" id="dokufix-history">` — non-executing, just data). A clickable `v{N}` badge in the header opens a modal listing every saved version, newest first. The full source of any prior version is recoverable from the file alone — the artifact is auditable on its own. Read-only exports inherit a small `Version N · DD.MM.YYYY HH:MM · message · exportiert <date>` footer at the end of the document.
- **Per-document identity** — each saved file carries a UUID in its history JSON. The IndexedDB doc record is keyed by this UUID, so two dokufix files in the same browser no longer share storage. Files without a UUID (older or never-saved) use a deterministic `loc-{hash}` fallback derived from `location.origin + location.pathname` (URL hash and query are deliberately excluded so ToC anchor clicks don't relocate the storage on the next reload); on first save the fallback upgrades to a real `crypto.randomUUID()` and the IndexedDB record is rekeyed to the new identifier.
- **Mobile-friendly** — hamburger menu collapses the editor toolbar on narrow viewports.

## Download variants

| Variant | What's in the file | Receiver can re-edit? | JS required to open? | Approx. size (demo content) |
|---|---|---|---|---|
| **Mit Editor** | Full editor + gzipped Markdown source + immutable demo-text reset capability | ✅ Yes | ✅ (via CDN libs) | ~16 KB + libs |
| **Ohne Editor — offen** (`-nur-lesen.html`) | Pre-rendered HTML + inline SVG diagrams, no JavaScript at all | ❌ No | ❌ | ~30 KB |
| **Ohne Editor — schlank** (`-schlank.html`) | Plaintext HTML + Mermaid SVGs gzip-compressed individually, tiny inline decoder | ❌ No | ⚠️ For diagrams only — text remains readable | ~10 KB |
| **Ohne Editor — kompakt** (`-kompakt.html`) | Entire body gzip-compressed + tiny decoder | ❌ No | ✅ | ~6 KB |

## Architecture notes

### `DEMO` vs `SAMPLE`

Two distinct concepts, deliberately separated:

- **`DEMO`** — the immutable original demo text, shipped gzip-compressed in every downloaded file. The "Demo zurücksetzen" button always restores from this. It is never overwritten on re-download.
- **`SAMPLE`** — this file's per-document default (what gets loaded on first open if no IndexedDB record exists yet for this document UUID). On `Mit Editor` download, this is replaced with the user's current content.

Loading order on open: IndexedDB doc record (live draft) > `SAMPLE` (file's baked content) > `DEMO`.

### Footnotes

Standard GFM footnotes work: `[^id]` places a marker, `[^id]:` defines it, and `marked-footnote` (registered via the single `marked.use()` call in the file) renders the definition list at the document end with return arrows. dokufix adds no syntax here.

**Hover / focus preview.** Each marker carries a preview of its footnote, revealed on `:hover` or `:focus-within` of the host `<sup class="dokufix-fn-host">`. The reveal is **pure CSS** — there is no listener — which is what lets it work in the JS-free `nur-lesen` export. `attachFootnotePreviews()` only injects inert markup at render time; because every export variant calls `render()` and then reads `previewEl.innerHTML` back out, the previews travel into all four downloads without any export-specific code.

**Preview content is flattened to inline.** This is load-bearing, not cosmetic. The preview `<span>` lives in the `<sup>` that sits inside the paragraph carrying the marker. A footnote definition is block content (`<p>`, sometimes lists) — and a `<p>` nested inside a `<p>` makes the HTML parser close the outer paragraph early. In the live DOM you would not notice; in an *export*, where the markup is serialised and re-parsed by the recipient's browser, it would quietly shred the document structure. So `fnFlattenInline()` unwraps block elements (joining them with a space) and keeps only phrasing content. Links are unwrapped to their text as well, for a second reason: the preview is `aria-hidden="true"` (the footnote text is already reachable through the marker's own link, and announcing it twice is noise), and an `aria-hidden` subtree must not contain focusable elements. Backrefs and nested markers are stripped, the latter so a footnote citing a footnote cannot nest previews.

**Positioning, and the trade-off it carries.** A centred box cannot fit when its marker sits closer to the viewport edge than half the box width — at ~900 px (where the content column nearly fills the window) a right-edge marker pushed the preview ~200 px off-screen. Plain CSS cannot detect that without JavaScript.

CSS anchor positioning fixes it: `@position-try` with `position-area: block-start span-inline-start / span-inline-end` keeps the box on screen at every tested width (1600/1200/900/800/600/390) in both engines, each preview anchored to its own marker. Two non-obvious requirements, both load-bearing:

- the host `<sup>` must **not** be `position:relative` inside the `@supports` block — a tiny containing block leaves the try-fallbacks nothing to evaluate against and they silently never fire;
- the `transition` must stay — without it Firefox does not reveal the preview at all.

**Engine behaviour (measured against the real exports, polling at 100 ms):**

| | Chromium / Edge | Firefox 151 |
|---|---|---|
| `nur-lesen` / `schlank` / `kompakt` (what recipients get) | ~104 ms | ~104 ms |
| live editor and `Mit Editor` file | ~105 ms | preview does not appear |
| un-hover hides the preview | yes | not under synthetic input |

**Product decision (Ben, 2026-07-16): shipped.** Recipients are overwhelmingly on Chromium/Edge, and the read-only exports — the artifacts that actually travel — behave correctly in Firefox too. The Firefox deviations are confined to the *app* contexts (the editor page and the `Mit Editor` variant), where the editor chrome's containing blocks appear to defeat anchor positioning. **Caveat on the evidence:** all of this was measured with Playwright's synthetic mouse; the un-hover result in particular may be an artifact of synthetic input rather than real-mouse behaviour, which is why the feature is shipped for hands-on evaluation rather than judged from the harness alone. Revisit if it misbehaves in practice — deleting the `@supports` block from **both** stylesheets restores a ~16 ms reveal everywhere and reinstates the ~900 px clipping. Tracked in `_bmad-output/implementation-artifacts/deferred-work.md`.

**Landing highlight and return-path disambiguation.** `marked-footnote` renders every reference to the same footnote with the *same visible number* and the *same href*: three citations of `[^norm]` all read `1` and all link to `#footnote-norm`, while the definition grows three return arrows `↩ ↩² ↩³`. On arrival you cannot tell which entry you landed on, nor which arrow leads back to where you came from.

`:target` only ever knows the current fragment, so CSS cannot distinguish the three cases. The only JS-free fix is to give each marker a **distinct** target: `linkFootnoteReturnPaths()` gives every arrow a stable id (`footnote-back-<id>[-N]`) and points the matching marker at it. Then

- `a[data-footnote-backref]:target` marks exactly the arrow that leads back, and
- `li:has(a[data-footnote-backref]:target)` shades the definition around it, while
- `li:target` still shades when arriving via the plain `#footnote-<id>` anchor (external bookmarks, copied URLs).

All pure CSS, so it works in the JS-free export. `attachFootnotePreviews()` must run **before** the retarget — it resolves each definition through the marker's href, so retargeting first would build every preview out of the `↩` anchor instead of the footnote.

**Accessibility trade-off — the cost of doing this without JavaScript.** The marker now lands on the return arrow, which sits at the *end* of the footnote text. Measured on a real export: `:target` resolves to `<a id="footnote-back-norm-2" aria-label="Back to reference norm">`, so a screen-reader user activating a footnote marker hears *"Back to reference"* before the footnote's prose, and must navigate backwards to read it. The definition is fully visible on screen and shaded, so sighted readers are unaffected — the cost falls specifically on assistive-technology users, in a product whose personas include policy and audit documents. It is shipped knowingly, not overlooked.

*Reversal (≈15 lines):* drop `linkFootnoteReturnPaths()` and the `:has()` selector, keep `li:target`. The landing highlight survives intact and JS-free; only "which arrow is mine" is lost. *Heavier alternative:* one empty landing anchor per reference at the **start** of each definition, paired to its arrow through a bounded set of static rules (`li:has(.dokufix-fn-landing-2:target) .dokufix-fn-back-2`), which restores reading order at the cost of N rule pairs in both stylesheets. Tracked in `_bmad-output/implementation-artifacts/deferred-work.md`.

**Size cost.** The preview duplicates each footnote's text inline, roughly doubling it. Measured on a document with three short footnotes: `nur-lesen` +1050 B (+12.5 %), `kompakt` +770 B (+9.0 %) — gzip absorbs much of the duplication, which is exactly the kind of redundancy it is good at. The `Mit Editor` variant grows by ~5.7 KB, but that is the feature's code (JS + the duplicated CSS), a fixed cost rather than per-footnote. Footnote-heavy documents pay proportionally more; the per-footnote marginal cost is about the length of the footnote's own text.

### Frontmatter (YAML / JSON metadata header)

A metadata block at the very top of the document renders as a collapsible panel above the first heading, not as document content.

Without this, marked treats the block as ordinary Markdown: per CommonMark a lone `---` is a thematic break, *except* when it follows paragraph text, where it becomes a setext H2 underline. So `---\ntitle: Foo\n---` rendered as `<hr>` plus `<h2>title: Foo</h2>` — visible garbage in the preview and in every export.

**Delimiters.** The first line must be exactly `---` (sniffed as JSON when the content starts with `{`, YAML otherwise), or explicitly `---json` / `---yaml`. A closing `---` line must follow. TOML (`+++`) is not supported.

**Panel.** `<details class="dokufix-frontmatter">`, collapsed by default — the document should read as a document on first open. The summary line shows a digest built from the first available of `title`, `version`, `date`, `author` (case-insensitive), falling back to an entry count. Expanding reveals every key/value pair; nested maps become indented sub-rows, sequences become lists. Everything is HTML-escaped. Because it's a native `<details>`, it is keyboard-operable and needs no JavaScript — it works in the `nur-lesen` export.

**The YAML subset — and its limits.** dokufix does *not* bundle a YAML library. One (~30 KB) against a ~16 KB artifact fails the "body for information" test. Instead there is a deliberate subset covering what document frontmatter actually contains:

| Supported | Not supported |
|---|---|
| `key: value` pairs | block scalars (`\|`, `>`) |
| nested maps by indentation | anchors / aliases (`&`, `*`) |
| sequences of scalars (`- item`), indented or flush with the key | sequences of maps (`- key: value`) |
| single- and double-quoted scalars | tags (`!!str`) |
| `#` comments, full-line and trailing | flow collections (`{a: 1}`, `[a, b]`) — except as the JSON path |
| | tab indentation, multi-document streams |

Anything outside the subset makes the parser fail **loudly rather than partially**: the panel then shows the raw block verbatim under a "nicht lesbar" summary. A half-parsed panel that silently dropped a key would be a data-integrity failure; showing the original text is honest and loses nothing. There is deliberately no type coercion — values stay strings, so YAML's `no`-becomes-`false` class of surprises can't occur. The values are displayed, never computed on.

**Not mistaken for a thematic break.** A document may legitimately open with `---`. Detection therefore runs two tiers: the block must first *look* like frontmatter (its first meaningful line is a `key:` or a `{`), and only then is it parsed. `---\nSome intro.\n---` and an empty `---\n---` are left completely untouched and render exactly as they always did. A block that looks like frontmatter but fails to parse gets the raw panel; a block that doesn't look like frontmatter at all is not frontmatter.

**Title derivation.** `deriveDocTitle()` is the single source of truth for "what is this document called?", used by the download filename and all three read-only export `<title>`s. It reads the **body**, i.e. the source with frontmatter split off. Previously each of those four sites ran `/^#\s+(.+?)\s*$/m` against the raw source, so a YAML comment like `# internal draft` won against the document's real `# Heading` — files downloaded as `internal-draft.html`. Splitting the frontmatter off fixes that.

### Table of Contents (two layers)

Two complementary mechanisms, deliberately separate:

- **Inline `[[toc]]` marker** — write `[[toc]]` (default H2+H3) or `[[toc:N]]` for `N` in 1–6 (depth) on its own line in the markdown. The marker only fires when the paragraph contains nothing but the literal text — wrapping it in inline elements (e.g., `` `[[toc]]` `` to *talk about* the marker) leaves it as visible content. At render time, the matching paragraph is replaced with a nested `<nav class="dokufix-toc">` list. The list is **static HTML** — it travels through every export variant including the JS-free `nur-lesen` one, and the numbering toggle reaches it via a dedicated `tocH2/tocH3/tocH4` counter scope (no double-counting with body headings).
- **Right-side rail** — auto-generated from H2/H3/H4 headings, visible above ~1500 px viewport when the document has ≥ 4 such headings. At wide viewports the body switches to a 2-column **grid**: a 1000 px content column (centered in its track) and a 425 px rail column, sharing the same horizontal budget with a 73 px gap instead of overlapping. The body caps at 1562 px (1000 + 73 + 425 + 64 padding), so from 1562 px upward both columns hit their exact target widths; between 1500 and 1561 px the content track flexes a little while the rail stays pinned. The rail uses `position: sticky; top: 80px` so it stays in view during scroll while still participating in the grid for sizing. Two flavors of the same UI:
  - **Live (editor / `Mit Editor` downloads):** scroll-based "reading line" scrollspy picks the last heading whose top edge sits at or above 25 % of the viewport — so there is always exactly one active entry (the first heading before scrolling, the last after the document ends, the just-scrolled-past one in between). The active link is auto-scrolled into view inside the rail's own scroll container so it stays visible in long tables of contents. Smooth-scrolls on click. Visible only in read mode.
  - **Static (read-only downloads — `nur-lesen`, `schlank`, `kompakt`):** pre-built HTML emitted at export time with the same heading list and CSS, but no JS dependency. Clicking jumps via native anchor — no scrollspy, no smooth scroll. Survives the JS-free `nur-lesen` variant.

Heading IDs are slugified deterministically. German `ä/ö/ü/ß` (and uppercase variants) are explicitly spelled out, then `String.prototype.normalize('NFKD')` folds the remaining Latin diacritics (`é → e`, `à → a`, `ñ → n`, `ç → c`) before stripping combining marks. CJK and other non-Latin scripts that don't decompose under NFKD collapse to `section`, deduped with `-N` suffixes. Anchor links remain stable across re-renders for the same heading text.

### Version history

The history block (`#dokufix-history`) shape:

```json
{
  "uuid": "987d2a3b-d26c-4d07-b3ff-b4e3ae0c6615",
  "version": 3,
  "history": [
    { "v": 1, "t": "2026-05-13T14:32:00.000Z", "m": "Erste Fassung",   "s": "<gzip+base64>" },
    { "v": 2, "t": "2026-05-13T15:45:00.000Z", "m": "",                "s": "<gzip+base64>" },
    { "v": 3, "t": "2026-05-14T09:12:00.000Z", "m": "Audit ergänzt",   "s": "<gzip+base64>" }
  ]
}
```

The `s` field of each entry is `gzipB64()` of the markdown source at that version — captured at commit time. Every prior version is fully recoverable from the file alone (basis of the audit story).

Two ways to create a new entry:

1. **"Mit Editor" download (canonical save).** Asks for an optional message via `prompt()`. Cancel aborts entirely; Enter on an empty input proceeds without a message. The counter bumps, the entry lands in the history list (including a gzipped snapshot of the current source), and the file is emitted with everything baked in. Counter increment and persistence happen *after* `triggerDownload` returns, so a popup-blocker or serialization failure can't leave a phantom version with no on-disk artifact.
2. **Commit-only (button in the version modal).** Same prompt, same bump, same history append — but no file is produced. The new state is persisted to `localStorage` (under the UUID-scoped versions key) so it survives a reload. Later "Mit Editor" downloads pick up all accumulated commits in a single file.

Both flows are **skipped silently when the source matches the last committed/saved state** (the `commitBaseline`). Clicking "Mit Editor" on an unchanged document re-emits the same version without a prompt or counter bump; clicking the commit button when nothing has changed shake-animates instead of prompting. By design, every prompt corresponds to actual uncommitted changes.

On load, version state comes from whichever of two sources is more recent: the file's baked-in `<script type="application/json" id="dokufix-history">` block, or `localStorage`. localStorage wins when commit-onlys have happened since the last download. History entries are shape-validated on load (well-formed `{v, t}` minimum); malformed entries are silently filtered out rather than crashing init. `null`, negative, or fractional `version` values normalize to `0`. Files without the history block (older dokufix files predating this feature) load as `version: 0, history: []`; the first save bootstraps the history at `v1`.

`</script>` substrings in commit messages or source snapshots are escaped to `<\/script>` before being written into the JSON block, so the HTML parser doesn't close the script tag early.

If `localStorage` setItem fails (quota exhausted, private-mode disabled), the version badge gains a red `.persist-failed` class with a pulse animation and an accessible title attribute — silent data loss is no longer possible.

Read-only downloads do *not* bump the version — they ship a `Version N · DD.MM.YYYY HH:MM · message · exportiert <date>` footer at the end of the document. Files with `version: 0` still emit a footer carrying just the export timestamp (the spec wants timestamps as always-present metadata). For the `kompakt` variant the footer lives inside the gzip payload so it survives decompression.

### Dirty-state baseline

The dirty indicator compares the live editor against `cleanBaseline`, which is set to `SAMPLE || DEMO` at load time — i.e. whatever is actually baked into *this* HTML file on disk. Consequences:

- An IndexedDB draft that differs from the baked content reads as **geändert** immediately on open. That's the intended "you have unsynced work" signal after a crash or tab close.
- A successful "Mit Editor" download resets `cleanBaseline` to the just-saved content → badge flips to clean. The downloaded HTML file also carries the new baseline, so the receiver opens it as clean.
- The other download variants (read-only) don't touch the baseline, since they don't carry editable source out the door.

### Persistence (IndexedDB)

One database per origin, named `dokufix-v1`, with two object stores:

- **`docs`** (keyPath: `uuid`) — one record per dokufix file: `{ uuid, source, version, history, commitBaseline, updatedAt }`. The whole record is rewritten on every persist; markdown + history JSON is small enough that this is cheap.
- **`assets`** (keyPath: `hash`) — image Blobs, keyed by SHA-256 hex. Content-addressed → uploading the same image twice deduplicates automatically; no GC needed in the PoC.

On first load of a doc whose UUID has a pre-existing `dokufix-doc-<uuid>-source` / `…-versions` pair in the old localStorage layout, the data is migrated into the IDB doc record and the legacy keys are deleted. Idempotent — the migration only fires when no IDB record exists yet for the UUID.

The heading-numbering preference (`dokufix-poc-numbering`) deliberately stays in localStorage. It's doc-independent UX state and has no business cluttering the per-document IDB record.

If IndexedDB is unavailable (some browser private modes, restrictive site settings), the init code surfaces a banner and continues in a degraded read-only mode — the baked SAMPLE/DEMO content is still loaded into the editor so the user can read what they just opened, but `persistDoc` calls will keep flipping the persist-failed flag. There is no localStorage fallback in this PoC, since storing images there would be a non-starter anyway.

### Image assets

Images live in IndexedDB and are referenced from the markdown source via `![alt](#asset-<sha256>)`. Three input pathways converge on a single pipeline:

1. **Paste** — clipboard `paste` event on the textarea. Captures `it.kind === 'file' && it.type.startsWith('image/')`. Lets normal text paste through untouched.
2. **Drag & drop** — `dragenter`/`dragover`/`drop` on the source pane. A drop overlay highlights the target during the drag.
3. **`+ Bild` button** — hidden `<input type="file" accept="image/*" multiple>` triggered by a toolbar button.

The pipeline: `createImageBitmap({ imageOrientation: 'from-image' })` decodes and applies EXIF orientation. Two size guards run before allocating the canvas: a 5 MB per-file input cap (cheap to check, blocks pathological inputs early) and a 25-megapixel decoded-pixel cap (a 4.9 MB heavily-compressed JPEG can decode to 12000×8000 = 96 MP and OOM the tab during `drawImage`; the encoded-byte cap doesn't protect against that). If the bitmap is wider than 1600 px, it's downscaled. The result is drawn to an `OffscreenCanvas` and re-encoded as WebP @ 0.85 (fallback to `<canvas>.toBlob` if OffscreenCanvas isn't available). The output bytes are SHA-256-hashed via `crypto.subtle.digest`; the hex digest becomes both the IDB key and the markdown reference. The decoded `ImageBitmap` is released via `bitmap.close()` in a `finally` block so a failed encoding pass doesn't leak the native buffer. Alt-text derived from the filename is sanitized — characters that would otherwise break out of the markdown image syntax (`[`, `]`, `(`, `)`, `\`, `` ` ``, `<`, `>`) are stripped, so a malicious filename like `x](http://attacker.com/track.png).png` can't inject an attacker-controlled `src`.

**Render-time resolution.** After `marked.parse(md)`, the HTML string is run through `resolveAssetRefsInHtml`, which `idbBatchGetAssets`-fetches every `#asset-<hash>` referenced in the document. Each match is rewritten to a Blob URL via `URL.createObjectURL`. Unresolved hashes get a transparent 1×1 GIF data URL as the `src` plus a `data-missing-asset` attribute; CSS turns those into a red "Bild fehlt" placeholder. (Using `src=""` for missing assets would trigger the browser to fetch the document URL itself, which is a footgun.) After each render, `pruneAssetUrlCache` revokes Blob URLs whose hashes are no longer referenced from the source — without this, every distinct image inserted in a session would hold its decoded pixels in memory until tab close. The same missing-asset CSS rule ships in the read-only export stylesheet, so a recipient who opens an export with a stale or missing asset sees the same "Bild fehlt" placeholder rather than an empty image element.

**Heading-slug guard.** Heading anchors and asset references share the `#`-fragment namespace. `slugify` explicitly rejects any heading slug that would start with `asset-` (or be exactly `asset`), prefixing it to `h-asset-…`. Without this, a heading literally titled "Asset Inventory" could otherwise be resolved as an image ref.

**Baking on "Mit Editor" download.** `bakeAssetsForDocument` collects every asset hash referenced by the current source *and by every history snapshot* (each snapshot is gzipped markdown — we decompress and re-scan). Every matched Blob is Base64-encoded into a JSON map `{ hash → { m: mime, d: base64 } }` and serialized into the `<script type="application/json" id="dokufix-assets">` block in the document clone. If the bake fails (transaction abort, base64 conversion error on a corrupt asset), the download is aborted with a user-facing message rather than silently emitting a broken file. On the receiver's first open, `seedAssetsFromBakedBlock` parses that block and writes each entry into IndexedDB — but only after **re-hashing the decoded bytes** and verifying the result matches the asserted hash. Mismatched entries are logged and skipped: a hostile sender can't pair an attacker-supplied blob with an arbitrary lookup key. Content-addressed dedup keeps re-seeds of identical hashes idempotent.

**Read-only export inlining.** `inlineAssetRefsAsDataUrls` runs on the cloned preview HTML before serialization for all three read-only variants. It handles both `src="#asset-<hash>"` (unresolved) and `src="blob:<url>"` (already resolved by the live render pass — the cache's reverse map gives back the hash). Output is `src="data:image/webp;base64,…"`. Missing assets keep the same transparent placeholder + `data-missing-asset` shape used in the live preview, so the receiver sees the same "Bild fehlt" treatment in the export. For the `kompakt` variant this is further gzipped along with the rest of the body; binary image bytes don't compress meaningfully a second time, but the Base64 envelope itself shrinks by ~30 %.

### Compression

All compression uses native browser **`CompressionStream('gzip')`** — no library dependency.

Brotli would compress 15–25% better, but is currently *missing* from `CompressionStream` in Chrome / Edge as of May 2026 (Firefox 147 and Safari 18.4 have shipped it). We stay on gzip until Chrome catches up. Migration is a one-line swap.

### `</script>` escaping

Template literals embedded inside the main `<script>` element use `<\/script>` to avoid the HTML parser prematurely closing the outer script tag. Classic gotcha — escape both the payload-holder tag and the inner decoder script.

### Self-replication mechanism

The script wraps two reassignable blocks with comment markers:

```js
// === DEMO-START ===
let DEMO = `…demo text…`;
let DEMO_GZ = '';
// === DEMO-END ===

// === SAMPLE-START ===
let SAMPLE = '';
let SAMPLE_GZ = '';
// === SAMPLE-END ===
```

On "Mit Editor" download, both blocks are rewritten in the cloned document:

- `DEMO_GZ` ← gzipped immutable demo
- `SAMPLE_GZ` ← gzipped current source

The receiver's async-init decompresses both before first render.

### `<script type="text/plain">` payload

The "kompakt" variant ships gzip+base64-encoded HTML inside a `<script type="text/plain">` element. This works because the browser does not execute the script (wrong MIME), but the contents are accessible via `textContent`. Decoder reads, decompresses via `DecompressionStream`, sets `innerHTML`.

## Known PoC limitations (deferred to MVP)

- **CDN-loaded libraries** — production target is single-file inline. Will roughly 200× the editor variant's file size from ~16 KB to ~3 MB once Mermaid is bundled.
- **No File System Access API integration** — Chromium-only, optional power-user path. Not in PoC. See product brief distillate for design.
- **Mermaid SVG bloat unaddressed** — each SVG ships a redundant 1.5–3 KB `<style>` block. Future optimization: dedupe to a single document-level `<style>`.
- **Heading ID stability** — slugify is deterministic per heading text, but reordering or renaming headings shifts the `-N` dedupe suffix for other slugs. External bookmarks to `#einleitung-2` go stale when an earlier colliding heading is renamed. Tracked in `_bmad-output/implementation-artifacts/deferred-work.md`; a content-addressed slug (hash of text + position) would be the principled fix.
- **Per-version history grows linearly with snapshots** — full gzip snapshots per version dominate file size once a document accumulates many versions. A diff-based encoding (gzipped patch against prior version, ~10× smaller) is in the backlog for the MVP build pipeline.

## File layout

```
poc/
├── dokufix-poc.html    The PoC itself. Open in browser.
└── README.md           This file.
```

The PoC is intentionally a single file. Everything you see when you open it (HTML, CSS, JS, demo content, assets) lives inside that one file.

## Related artifacts

- Product brief: `../_bmad-output/planning-artifacts/product-brief-dokufix.md`
- Distillate (technical decisions, open questions): `../_bmad-output/planning-artifacts/product-brief-dokufix-distillate.md`
- One-pager pitches (DE/EN): `../_bmad-output/planning-artifacts/one-pager-dokufix-users*.md`
- Landing page: `../_bmad-output/planning-artifacts/landing-dokufix.html`
- Original brainstorming: `../_bmad-output/brainstorming/brainstorming-session-2026-04-30-2055.md`
