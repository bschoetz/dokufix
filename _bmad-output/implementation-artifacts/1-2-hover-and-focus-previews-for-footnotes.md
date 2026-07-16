# Story 1.2: Hover and Focus Previews for Footnotes

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reader working through a document with citations,
I want to see a footnote's text by hovering (or keyboard-focusing) its reference marker,
so that I can take in the aside without jumping to the bottom of the document and losing my reading position — including in the JavaScript-free reading copy.

## Acceptance Criteria

1. **Hover shows the footnote text in place.** Hovering a footnote reference marker shows a preview containing that footnote's text, anchored near the marker, without navigating away. The preview element follows the `dokufix-` class-prefix convention and disappears when the pointer leaves. [FR7]
2. **Implemented without JavaScript.** The preview appears in the JS-free `nur-lesen` export, driven purely by CSS. Base positioning must not depend on any CSS feature unsupported by current Firefox or Safari; progressive refinements must degrade to a still-usable preview. [FR7, NFR2, NFR7]
3. **Keyboard reachable.** When the footnote reference receives focus, the preview appears on the same terms as on hover. [FR8]
4. **Ships through every variant.** The preview works in `Mit Editor`, `nur-lesen`, `schlank`, and `kompakt`. Required CSS exists in both the live `#preview` block and in `READONLY_CSS`. [NFR1, NFR4]
5. **Existing footnote behaviour is preserved.** The footnote list at the document end, the reference anchors, and the backref links behave exactly as before; clicking a reference still jumps to the definition; a screen reader does not announce the footnote text twice. [FR9]
6. **Size impact is measured.** The export size delta for a representative footnote document is measured across all four variants and recorded in the completion notes; if material, noted in `poc/README.md` alongside the existing size table. [NFR6]

## Tasks / Subtasks

- [x] **Task 1: Build the preview injection pass** (AC: 1, 5)
  - [x] Add `attachFootnotePreviews()` — a post-DOM pass over `previewEl`, following the `processInlineToc` pattern (L1564).
  - [x] For each `a[data-footnote-ref]`, resolve its target `<li>` in `section.footnotes` via the ref's `href` fragment.
  - [x] Clone the target's content, **strip the backref link** (`a[data-footnote-backref]`) from the clone, and strip any nested `a[data-footnote-ref]` markers to avoid recursive previews.
  - [x] Wrap/insert a `<span class="dokufix-fn-preview" aria-hidden="true">` as a sibling of the ref anchor inside its `<sup>`. See Dev Notes → *Why `aria-hidden`* (AC5).
  - [x] Call it from `render()` after `previewEl.innerHTML = resolution.html` (L1470) — anywhere in the DOM-transform half, e.g. next to `processInlineToc` (L1475).
  - [x] Make it a no-op when the document has no footnotes, and tolerate a missing/unresolvable definition (skip that ref, don't throw).
- [x] **Task 2: CSS-only show/hide — twice** (AC: 1, 2, 3, 4)
  - [x] Add `#preview`-prefixed rules to the main `<style>` block near the existing footnote rules (L362–379).
  - [x] Add the unprefixed twin to `READONLY_CSS` next to its footnote rules (L2104–2111).
  - [x] Hide by default; reveal on `:hover` **and** `:focus-within` on the containing `<sup>` (AC3 comes free from `:focus-within` — the ref is a focusable `<a>`).
  - [x] Position with classic `position: absolute` inside a `position: relative` `<sup>`. Constrain with `max-width: min(32rem, 90vw)`. Do **not** make base positioning depend on CSS anchor positioning (Dev Notes → *Positioning*).
  - [x] Use `visibility`/`opacity` rather than `display:none` so a transition is possible; keep it consistent with the file's existing decorative `:hover` transitions.
  - [x] Match the existing palette; do not introduce CSS custom properties.
- [x] **Task 3: Verify all four export variants** (AC: 2, 4)
  - [x] Export a footnote document as all four variants and hover-test each.
  - [x] **Explicitly confirm `nur-lesen` still contains no `<script>` tag** and that previews work there.
  - [x] Check the preview is not clipped by an ancestor `overflow` and renders above following content (`z-index`), especially inside the 2-column grid read mode.
- [x] **Task 4: Measure size impact** (AC: 6)
  - [x] Export a representative footnote-bearing document before and after; record the delta per variant in Completion Notes.
  - [x] If material, add a note to `poc/README.md` near the size table.
- [x] **Task 5: Documentation**
  - [x] Document the preview in `poc/README.md`.
  - [x] **Also document the pre-existing footnote support**, which is currently undocumented (Dev Notes → *Documentation debt*).
  - [x] Record deferred edge cases (e.g. touch behaviour, viewport-edge overflow) in `_bmad-output/implementation-artifacts/deferred-work.md`.

## Dev Notes

### Footnotes already work — this story adds only the preview

**Do not build footnote parsing.** `marked-footnote` is already loaded and registered:

- CDN script tag: L659 — `https://cdn.jsdelivr.net/npm/marked-footnote/dist/index.umd.min.js`
- Registration: L671–672
  ```js
  // Enable GFM footnotes ([^id] inline + [^id]: definition)
  if (typeof markedFootnote === 'function') {
    marked.use(markedFootnote());
  }
  ```
  Note the `typeof` guard — a CDN failure degrades silently rather than throwing.
- This is also the **only** `marked.use()` in the file. There is no custom renderer, no `walkTokens`, no custom tokenizer; options are passed per-call at L1457.

**Existing rendered shape.** `[^id]` → `<sup><a data-footnote-ref href="#footnote-id" id="footnote-ref-id">1</a></sup>`; `[^id]: …` → a `<section class="footnotes">` at document end containing an `<ol>` of `<li>` with `<a data-footnote-backref>` return arrows. Confirm the exact `id`/`href` shape in the browser before coding against it — it comes from the plugin, not from this codebase.

**Existing CSS, already duplicated in both stylesheets:**

- Live, L362–379:
  ```css
  #preview .footnotes{margin-top:3em;padding-top:1.5em;border-top:1px solid #e5e5ea;font-size:.9em;color:#3a3a3f;}
  #preview .footnotes h2{display:none}
  #preview sup a, #preview a[data-footnote-ref]{text-decoration:none;font-weight:700;padding:0 2px;color:#0066cc;}
  #preview a[data-footnote-backref]{text-decoration:none;margin-left:4px;opacity:.55;}
  ```
- Export twin, L2104–2111 — same rules, `#preview` stripped.
- `.footnotes h2{display:none}` (L368, L2105) hides the plugin's generated heading.

Live demo content already exercises footnotes: L1151 references `[^selbstbezug]`, L1153 defines it. Use it for manual testing.

### Why post-DOM injection ships to exports for free

Every export variant calls `await render()` and then reads `previewEl.innerHTML` back out:

- `downloadReadonlyOpen()` L2142–2169 (reads at L2143/2149)
- `downloadReadonlySlim()` L2173–2226 (L2174/2181)
- `downloadReadonlyCompact()` L2229–2273 (L2230/2237)

So a DOM mutation performed during `render()` lands in all exports automatically — no export-specific code. `processInlineToc` (L1564–1586) relies on exactly this; the only live-only part it keeps is a smooth-scroll click listener (L1584), which exports simply drop in favour of native anchor jumps. **Mirror that discipline: the preview must be complete without any listener.**

`render()` structure — steps 2–5 are string transforms, steps 6–11 are DOM transforms on `#preview`:

| # | Step | Line |
|---|---|---|
| 2 | `marked.parse(...)` | 1457 |
| 6 | `previewEl.innerHTML = resolution.html` — string→DOM boundary | **1470** |
| 7 | `assignHeadingIds(headings)` | 1474 |
| 8 | `processInlineToc(headings)` | **1475** ← insert the new pass around here |
| 10 | `await mermaid.run({ nodes })` | 1487–1494 |
| 11 | `buildRail(headings)` — live-only | 1497 |

### JS-free export constraint — confirmed

`downloadReadonlyOpen()` (L2142–2169) emits `<!DOCTYPE html>` + `<style>${READONLY_CSS}</style>` + `<main class="reader-body">${bodyHtml}</main>` + meta footer + rail, with **no `<script>` tag in the template** (verified L2153–2168). Only `schlank` (1-line gzip SVG decoder at L2197, emitted only when `svgCount > 0`) and `kompakt` (payload + decoder, L2259–2270) carry script.

AC2 is therefore satisfied by construction **only if the reveal is pure CSS**. The injection pass runs at render time in the authoring session; what lands in the export is inert markup plus CSS. Do not reach for a JS positioning/show-hide handler — that would work in `Mit Editor` and silently fail in `nur-lesen`, which is the variant the product owner specifically asked about.

### Why `aria-hidden` on the preview (AC5)

The footnote text will exist **twice** in the DOM: once in the preview span, once in the `section.footnotes` list. The ref anchor already points assistive tech at the definition. Marking the preview `aria-hidden="true"` prevents the same text being announced twice while leaving it fully visible to sighted hover/focus users. The preview is decorative duplication of content that is already reachable — that is precisely the case `aria-hidden` exists for.

Do not put the preview inside the `<a>`: that would make the link's accessible name the entire footnote text. Keep it a **sibling of the anchor**, inside the `<sup>`, and hang `:hover`/`:focus-within` off the `<sup>`.

### Positioning (the one real design risk)

- **Base:** `position: absolute` inside `position: relative` on the `<sup>`, e.g. `left: 50%; transform: translateX(-50%)`, plus `max-width: min(32rem, 90vw)` and a `z-index` above body content. Works in every target browser.
- **CSS anchor positioning** (`anchor-name` / `position-try-fallbacks`) would solve viewport-edge flipping elegantly, but as of 2026 it is **not available across Firefox and Safari**. NFR7 forbids depending on it. If you want the refinement, add it behind `@supports (position-try-fallbacks: flip-block)` so unsupported browsers keep the working base — never the other way round.
- **Accepted limitation:** a footnote ref at the far edge of the content column may clip or overflow slightly. The content column is 1000 px centered (grid read mode; see `poc/README.md` → *Table of Contents (two layers)*), so there is usually margin to spare. If it proves ugly, prefer a CSS-only mitigation (clamp width, bias the transform) over introducing JS. Record the residual in `deferred-work.md`.
- **Overflow/clipping:** check ancestors for `overflow` that would clip an absolutely-positioned child, particularly in the 2-column grid read mode and inside the rail-adjacent layout (`:has()` layout rules at L546, L2088–2089).
- **Touch:** `:hover` does not exist on touch. Tapping the ref focuses the `<a>` (firing `:focus-within`) *and* navigates to the definition — the existing anchor jump remains the touch fallback, which is acceptable. Note it in the README rather than engineering around it.

### Styling conventions (L7–569 and L2047–2118)

- **The CSS duplication tax applies.** `READONLY_CSS` (L2047–2118) is a hand-maintained duplicate of the main `<style>` block with `#preview` stripped and editor chrome dropped, with no sharing mechanism and no drift detection. **Every rule this story adds lands twice** — next to the footnote rules in each (L362–379 live / L2104–2111 export).
- **No CSS custom properties, no `:root`, no `var()`, no dark mode** in this file. Do not introduce them here.
- Palette: `#1c1c1e` text · `#f5f5f7` background · `#e5e5ea` borders · `#8e8e92` muted · `#0066cc` links · `#d4ff00` lime accent · `#fafafa` panel background. Footnote text already uses `#3a3a3f` at `.9em` (L366) — the preview should feel like the same family.
- **Naming:** `dokufix-` prefix for constructs that ship into exports (`dokufix-toc` L322, `dokufix-rail` L501, `dokufix-meta` L2085). Hence `dokufix-fn-preview`.
- Existing `:hover` usage is decorative only (color/opacity/border transitions — L347, L379, L534, L2081, L2100, L2111). **No `:hover` tooltip pattern exists yet**; this story introduces the first one.
- `:has()` is already used for layout (L546, L2088–2089), so modern selectors are acceptable within NFR7.

### Documentation debt

**Footnote support is entirely undocumented in `poc/README.md`** despite being live in the PoC and used by the demo content. Task 5 fixes this: document both the pre-existing footnote capability and the new preview. The repo has a consistent README-follows-feature habit (commits `41e7857`, `e5bd8f0`).

### Known robustness note (not this story's scope)

The CDN dependency is **unpinned** (L658–660: `npm/marked`, `npm/marked-footnote`, `npm/mermaid` — no version) and the footnote plugin is silently optional (L671). A breaking upstream release, or a CDN failure, would silently drop footnotes — and with them, these previews. This is flagged rather than fixed: the PoC's CDN usage is a known, documented limitation (`poc/README.md` → *Known PoC limitations*, and the L657 comment *"CDN libraries (PoC only — production bundle will inline these)"*), and pinning/inlining belongs to the MVP build-pipeline work, not here. **If the preview pass depends on the plugin's DOM shape, guard it** so a missing plugin yields no previews rather than an exception.

### Project Structure Notes

- Single-file PoC by design: all changes land in `poc/dokufix-poc.html`. No new files, no build step (`poc/README.md:179`).
- No persistence change: previews are derived at render time from the source; nothing new is stored. Do not touch the IndexedDB schema.
- Independent of Story 1.1: that story intercepts *before* `marked.parse`; this one post-processes *after* it. They overlap only in both needing CSS added to both stylesheets. Either order works; if 1.1 has already landed, rebase onto its `render()` shape.

### Testing standards

No automated test suite exists (`_bmad-output/test-artifacts/` is empty) and no framework is configured. Verification is manual browser testing, consistent with all prior work. At minimum exercise:

- The demo document's existing footnote (L1151/L1153) — hover, and Tab-focus (AC1, AC3).
- A document with no footnotes → pass is a no-op, nothing breaks (AC5).
- Multi-paragraph footnote content, and a footnote containing a link or inline code → preview renders, backref stripped (AC1).
- Reference near the right edge of the content column → note behaviour (positioning limitation).
- Clicking a ref still jumps to the definition; backref still returns (AC5).
- All four download variants; `nur-lesen` checked for absence of `<script>` (AC2, AC4).
- Cross-browser: at minimum Chrome and Firefox, given NFR7.
- Size delta measured per variant (AC6).

### References

- Footnote plugin load and registration: [Source: poc/dokufix-poc.html#L657-L660, #L671-L672]
- Existing footnote CSS (live): [Source: poc/dokufix-poc.html#L362-L379]
- Existing footnote CSS (export twin): [Source: poc/dokufix-poc.html#L2104-L2111]
- Demo content using a footnote: [Source: poc/dokufix-poc.html#L1151, #L1153]
- Render pipeline and DOM-transform half: [Source: poc/dokufix-poc.html#L1453-L1498]
- DOM injection point: [Source: poc/dokufix-poc.html#L1470-L1475]
- Post-DOM marker precedent `processInlineToc`: [Source: poc/dokufix-poc.html#L1564-L1586]
- `READONLY_CSS` export stylesheet: [Source: poc/dokufix-poc.html#L2047-L2118]
- JS-free export template: [Source: poc/dokufix-poc.html#L2142-L2169]
- Read-only exports re-reading `previewEl.innerHTML`: [Source: poc/dokufix-poc.html#L2142-L2273]
- Grid read-mode layout and content-column width: [Source: poc/README.md#Table of Contents (two layers)]
- Known PoC limitations incl. CDN libraries: [Source: poc/README.md#Known PoC limitations (deferred to MVP)]
- Browser-target and no-CDN constraints: [Source: _bmad-output/planning-artifacts/product-brief-dokufix-distillate.md#Technical Direction (Not in the Brief, but Decided)]
- "Body for information" scope test: [Source: _bmad-output/planning-artifacts/product-brief-dokufix-distillate.md#Identity & Framing]
- Epic and scope justification: [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: Metadata Headers and Footnote Previews]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

Verification harness (scratchpad, not committed — the repo has no test framework and adding one was out of scope):
`test-story-1-2.js` drives the real `poc/dokufix-poc.html` in a real browser via playwright-core, then exports all four variants, re-opens each produced file and hover-tests it there.

- RED confirmed before implementation (all AC1/AC5 structure assertions failing).
- Final: **52 assertions, 0 failures, in both Chromium 1228 and Firefox 151.** Story 1.1's 71 assertions still green in both → 246 total.
- Regression (`regress.js`): demo document unchanged — 8 headings, inline ToC, 2 Mermaid SVGs, footnotes section, 1 footnote ref, rail present, zero page errors.
- `probe-fn.js` established the plugin's real DOM shape before coding against it: `<sup><a id="footnote-ref-a" href="#footnote-a" data-footnote-ref aria-describedby="footnote-label">1</a></sup>` and `<li id="footnote-a"><p>… <a href="#footnote-ref-a" data-footnote-backref>↩</a></p></li>`.
- `edge-fn.js` measured preview overflow across viewport widths (1600/1400/900/390).
- `anchor-exp.html` + `anchor-test.js` + `dbg.js` evaluated CSS anchor positioning as a refinement; rejected, see notes.
- One Firefox-only failure during development turned out to be a **harness artifact, not a product bug**: Firefox queues anchor navigation, so reading `location.hash` synchronously after `.click()` returned `""` and then `#footnote-a` 500 ms later (`probe-click.js`). A real user click jumps and scrolls correctly. The assertion now uses a real click plus a tick, and additionally asserts the definition scrolled into view.

### Completion Notes List

- **All 6 ACs satisfied and machine-verified**, including hover-testing each of the four *exported files* rather than only the live page.
- **No footnote parsing was written.** `marked-footnote` already handles it (`marked.use()` at L671–672); this story is presentation only, exactly as the story framed it.
- **Flattening the preview to inline content is the load-bearing decision, and it is a correctness fix, not styling.** The preview `<span>` sits in a `<sup>` inside the paragraph carrying the marker. Footnote definitions are block content (`<p>`, sometimes lists). A `<p>` nested inside a `<p>` makes the HTML parser close the outer paragraph early — invisible in the live DOM, but every export serialises the markup and the recipient's browser **re-parses** it, which would silently shred the document structure. `fnFlattenInline()` unwraps block elements (joining with a space) and keeps only phrasing content. There is a dedicated assertion per export variant that the marker's paragraph survived re-parsing with its text intact.
- **Links are unwrapped to text** for a second, independent reason: the preview is `aria-hidden="true"` (the text is already reachable via the marker's link; announcing it twice is noise), and an `aria-hidden` subtree must not contain focusable elements. Asserted: zero focusable elements inside the preview.
- **Preview is a sibling of the ref anchor, not inside it** — putting it inside would make the link's accessible name the entire footnote text. Asserted: the anchor's accessible name is still `1`.
- **Nested markers stripped**, so a footnote citing a footnote cannot nest previews. Missing definitions are skipped rather than throwing; the ref still jumps. Re-render is idempotent (asserted).
- **AC2 met by construction:** no listener at all. Verified by asserting the `nur-lesen` export contains no `<script>` tag, then opening it and hover-testing.
- **⚠️ AC2's positioning clause — an honest limitation, not a clean pass.** Measured overflow of the centred preview: none at 1600/1400 px (the 1000 px column is centred, leaving margin) and none at 390 px (`max-width:min(32rem,90vw)` caps it), but at **~900 px a marker near the right edge pushes the preview ~200 px off-screen**. A centred box cannot fit when the marker is closer to the edge than half the box width; CSS cannot detect that without JS.
  **CSS anchor positioning was evaluated and deliberately rejected.** Firefox 151 returns `true` for both `CSS.supports('anchor-name','--x')` and `('position-try-fallbacks','flip-inline')`, but the fallbacks do not take effect — the tooltip overflowed identically. An `@supports` gate would therefore *replace the verified base with an untested one in Firefox*, which is precisely the failure mode AC2's "must degrade to a still-usable preview" clause is guarding against. (Chromium separately dropped `position-try-fallbacks: position-area(...)` as invalid, computing to `none`; `@position-try` custom options would be required.) The story's guidance was to prefer a CSS-only mitigation over JS and record the residual — no CSS-only mitigation exists that works cross-engine today, so the residual is recorded in `deferred-work.md` and `poc/README.md`. **This is the one point in the epic worth a product decision** (see Change Log).
- **AC6 measured, not estimated.** Document with three short footnotes: `nur-lesen` 8421 → 9471 B (**+1050 B, +12.5 %**), `kompakt` 8555 → 9325 B (**+770 B, +9.0 %**), `Mit Editor` 112544 → 118210 B (**+5666 B, +5.0 %**). Isolating fixed from marginal cost via a footnote-free document: the read-only delta is ~600 B of CSS (fixed) plus roughly the length of each footnote's own text (the preview duplicates it once). `kompakt` grows least because gzip absorbs duplication — which is exactly what this feature produces. The `Mit Editor` delta is the feature's code and does not scale with footnote count. Noted in `poc/README.md`.
- **AC5 verified against the real risk:** definitions keep their own block structure (only the *preview* is flattened), ids/backrefs/hrefs unchanged, clicking a ref still jumps *and* scrolls the definition into view (`pointer-events:none` keeps the preview from swallowing the click).
- **CSS duplication tax paid** (NFR4): rules in both stylesheets. **Documentation debt cleared** (NFR: the story's Task 5) — `poc/README.md` now documents the pre-existing footnote support, which had never been written down, alongside the preview.
- **Cross-browser green** in Chromium and Firefox; no CSS custom properties introduced; `font-size` uses `rem` deliberately so the host `<sup>`'s `font-size:smaller` does not shrink the preview.

### File List

- `poc/dokufix-poc.html` — modified. Added `FN_KEEP_TAGS`, `FN_BLOCK_TAGS`, `fnFlattenInline`, `buildFootnotePreview`, `attachFootnotePreviews` before `tocLinkHandler`; call added in `render()` after `processInlineToc`; preview CSS added to the main `<style>` block and its twin to `READONLY_CSS`.
- `poc/README.md` — modified. New *Footnotes* architecture section (pre-existing GFM support, preview mechanics, the inline-flattening rationale, the positioning limitation, measured size cost) plus a bullet in *What this PoC demonstrates*.
- `_bmad-output/implementation-artifacts/deferred-work.md` — modified. Four deferred items from this story.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — modified. Story status transitions.

## Change Log

| Date | Change |
|---|---|
| 2026-07-16 | Implemented story 1.2. Footnote markers now show a hover/focus preview, revealed by pure CSS so it works in the JS-free `nur-lesen` export. Preview content is flattened to phrasing content — required, because a `<p>` inside the marker's `<sup>` would break the outer paragraph when an export is re-parsed. Documented the pre-existing (previously undocumented) footnote support. 52 assertions green in Chromium and Firefox; no regression. Status → review. |
| 2026-07-16 | CSS anchor positioning added so the preview never leaves the viewport (it was clipped ~200 px at ~900 px widths). Shipped per product decision. |
| 2026-07-16 | **Resolved by human review.** The harness reported Firefox as slow (~700 ms) and as leaving previews stuck open; neither reproduces with a real mouse — hands-on review found the preview appears immediately. Both were synthetic-mouse artifacts, and my earlier write-ups of them were wrong. One real behaviour confirmed and accepted: clicking a marker keeps its preview open (the click focuses the anchor; `:focus-within` is what makes the feature keyboard-reachable and touch-usable), dismissed by clicking elsewhere. Recorded in `deferred-work.md`. **Lesson: hover behaviour in this feature is not trustworthy under automation.** |
| 2026-07-16 | **Hands-on human review passed** (Ben, on the demo data): "besteht meinen test, sieht ordentlich aus". Status stays `review` pending the code-review workflow. |
