# Story 1.3: Landing Highlight and Return-Path Disambiguation for Footnotes

Status: review

<!-- Added 2026-07-16 at the product owner's request, after 1.2 reached review. -->

## Story

As a reader following a footnote to the bottom of a long document,
I want the footnote I landed on to be visibly highlighted, and the specific return arrow that takes me back to be marked,
so that I can see instantly where I arrived and how to get back — without scanning a list of identical-looking arrows and guessing.

## Acceptance Criteria

1. **The landed-on footnote is highlighted.** Clicking a marker visibly highlights the definition the reader landed on; the highlight persists while it remains the target.
2. **The matching return arrow is marked.** For a footnote referenced from several places, exactly the arrow leading back to *that* marker is highlighted; the others are not.
3. **Both work without JavaScript.** Behaviour holds in the JS-free `nur-lesen` export, driven purely by CSS, with no `<script>` introduced.
4. **Return path still works, and is reciprocal.** Activating the highlighted arrow lands back at the originating marker.
5. **Ships through every variant.** Works in all four downloads; CSS exists in both the live `#preview` block and `READONLY_CSS`.
6. **Existing behaviour survives.** Story 1.2's hover previews unaffected; a link to the plain `#footnote-<id>` anchor still highlights the footnote; list, numbering and arrows otherwise unchanged.
7. **The accessibility trade-off is recorded.** The consequence for assistive technology is measured, documented in `poc/README.md` and `deferred-work.md`, and flagged; a reversal option is described and costed.

## Tasks / Subtasks

- [x] **Task 1: Retarget each reference to its own return arrow** (AC: 2, 4, 6)
  - [x] Add `linkFootnoteReturnPaths()` — a post-DOM pass, called from `render()` alongside the other footnote work.
  - [x] For each `.footnotes a[data-footnote-backref]`: read its `href` (`#footnote-ref-<id>[-N]`), derive a stable id (`footnote-back-<id>[-N]`), set it on the backref.
  - [x] Point the corresponding `a[data-footnote-ref]` at that new id.
  - [x] Skip cleanly when the ref cannot be resolved; never throw.
  - [x] ~~Order it before `attachFootnotePreviews()`~~ — **wrong, corrected during implementation:** it must run *after*. See Completion Notes.
- [x] **Task 2: Highlight CSS — twice** (AC: 1, 2, 3, 5, 6)
  - [x] `li:target` **and** `li:has(a[data-footnote-backref]:target)` → shade the definition. The first selector keeps external/legacy `#footnote-<id>` bookmarks working (AC6).
  - [x] `a[data-footnote-backref]:target` → mark the arrow with the lime accent.
  - [x] `scroll-margin-top` so the jump doesn't land under the editor header.
  - [x] Add to the main `<style>` block and its twin in `READONLY_CSS`.
  - [x] Use the existing palette; no CSS custom properties.
- [x] **Task 3: Verify** (AC: 1–6)
  - [x] Test a footnote referenced three times: each marker highlights its own arrow, the other two stay plain.
  - [x] All four variants; `nur-lesen` checked for absence of `<script>`.
  - [x] Legacy `#footnote-<id>` anchor still shades.
  - [x] Story 1.2 suite still green (guards AC6).
- [x] **Task 4: Record the accessibility trade-off** (AC: 7)
  - [x] Measure where focus/reading position lands after activating a marker.
  - [x] Document in `poc/README.md` and `deferred-work.md`, including the reversal option.

## Dev Notes

### The concrete defect (verified, not assumed)

`marked-footnote` renders every reference to a footnote with the **same visible number** and the **same href**:

```
Erste[^norm]. Zweite[^norm]. Dritte[^norm].

refs: id=footnote-ref-norm, footnote-ref-norm-2, footnote-ref-norm-3
      — all href="#footnote-norm", all rendered "1"

<li id="footnote-norm">
  <p>Die mehrfach referenzierte Fußnote.
     <a href="#footnote-ref-norm"   data-footnote-backref>↩</a>
     <a href="#footnote-ref-norm-2" data-footnote-backref>↩<sup>2</sup></a>
     <a href="#footnote-ref-norm-3" data-footnote-backref>↩<sup>3</sup></a></p>
</li>
```

So the return arrows are already distinct and already correct — the missing piece is knowing *which one is yours*.

### Why the reference href must change

`:target` matches the element identified by the current fragment. Clicking any of the three markers sets the fragment to `#footnote-norm`, so CSS sees the same state in all three cases and cannot distinguish them. There is no CSS mechanism for "where did the navigation originate".

Therefore the only JS-free way to mark the correct arrow is to make each marker navigate to a **distinct** anchor — its own arrow. The arrow becomes the `:target`, and:

- `a[data-footnote-backref]:target` → mark that arrow (AC2)
- `li:has(a[data-footnote-backref]:target)` → shade the containing definition (AC1)
- `li:target` → still shades when arriving via the plain `#footnote-<id>` anchor (AC6)

This supersedes Story 1.2's AC5 assertion that a click lands on `#footnote-<id>`. That story is in `review`; the change is recorded here rather than by editing 1.2's record.

### The accessibility trade-off (AC7) — decide with eyes open

Retargeting means a marker now navigates to the return arrow, which sits at the **end** of the footnote text. For a screen-reader user, activating a footnote marker will place the reading position on the "Back to reference" link rather than at the start of the footnote's prose. They can still read the footnote — it is immediately above — but the reading order is worse than landing on the definition itself.

For most documents the footnote is one or two lines, the whole definition is on screen, and the shading makes the landing obvious — so the visual outcome is good. The cost is borne specifically by assistive-technology users, in a product whose personas include policy and audit documents. **This must be written down and flagged, not buried.**

**Reversal option, costed:** drop `linkFootnoteReturnPaths()` and the `:has()` selector, keep `li:target` only. AC1 (landing highlight) still works fully and JS-free; AC2 (which arrow is mine) is lost. Roughly a 15-line revert.

**Better-but-heavier alternative, if AC7 becomes blocking:** insert one empty landing anchor per reference at the **start** of the definition (`<span id="footnote-back-norm-2" class="dokufix-fn-landing-2">`), retarget markers to those, and pair each landing with its arrow through a bounded set of static rules (`li:has(.dokufix-fn-landing-2:target) .dokufix-fn-back-2 { … }` for indices 1..N). Scroll and reading position then land at the definition's start, preserving reading order. Costs N static rule pairs in both stylesheets and silently loses the arrow highlight beyond index N. Not chosen now: more machinery than the problem warrants at PoC scale.

### Where this hooks in

`render()` DOM-transform half (string transforms end at `previewEl.innerHTML = resolution.html`):

| Step | Call |
|---|---|
| `previewEl.innerHTML = resolution.html` | string → DOM boundary |
| `injectFrontmatterPanel(fm)` | story 1.1 |
| `assignHeadingIds(headings)` | |
| `processInlineToc(headings)` | |
| `attachFootnotePreviews()` | story 1.2 |
| **`linkFootnoteReturnPaths()`** | ← this story, **after** `attachFootnotePreviews()` |

**This ordering note was wrong and the 1.2 regression suite caught it.** `attachFootnotePreviews()` resolves each definition *through the marker's href*. Retargeting first pointed that href at the return arrow, so every preview was built out of the `↩` anchor instead of the footnote. The correct order is previews first, retarget second. The duplicate-id concern that motivated the original note does not exist: the clone strips backrefs either way.

Everything ships to exports for free: every variant calls `await render()` and then reads `previewEl.innerHTML` back out. No export function needs touching.

### Styling conventions

- **CSS duplication tax:** rules land twice — `#preview`-prefixed in the main `<style>` block, unprefixed in `READONLY_CSS`.
- Palette: `#1c1c1e` text · `#f5f5f7` bg · `#e5e5ea` borders · `#8e8e92` muted · `#0066cc` links · `#d4ff00` lime accent. The lime is the brand accent and is the natural choice for marking the live return arrow; a low-alpha lime tint suits the definition shade.
- `:has()` is already used for layout in this file, so it is fair game.
- No CSS custom properties; the file has none.

### Testing standards

No test framework in the repo; verification is a browser harness in the scratchpad (as for 1.1/1.2), driving the real file and the real exports. At minimum:

- Footnote referenced 3× → click marker 2 → arrow 2 marked, arrows 1 and 3 plain, definition shaded.
- Click the marked arrow → back at marker 2 (AC4).
- Legacy `#footnote-<id>` anchor → definition shaded (AC6).
- Hover previews still work (run the 1.2 suite).
- All four variants; `nur-lesen` has no `<script>`.
- Chromium and Firefox.

### References

- Footnote plugin registration: [Source: poc/dokufix-poc.html#L671-L672]
- Existing footnote CSS (live / export twin): [Source: poc/dokufix-poc.html#L362-L379, #L2104-L2111]
- Preview pass this story orders against: [Source: poc/dokufix-poc.html — `attachFootnotePreviews`, `buildFootnotePreview`]
- Post-DOM marker precedent: [Source: poc/dokufix-poc.html — `processInlineToc`]
- Story 1.2 AC5 (superseded assertion about the landing hash): [Source: _bmad-output/implementation-artifacts/1-2-hover-and-focus-previews-for-footnotes.md#Acceptance Criteria]
- Epic entry and full BDD ACs: [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3: Landing Highlight and Return-Path Disambiguation for Footnotes]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

Verification harness (scratchpad, not committed): `test-story-1-3.js` drives the real file and re-opens every exported variant.

- RED confirmed before implementation (arrows had no ids; all markers pointed at `#footnote-norm`).
- Final: **26 assertions, 0 failures, in Chromium and Firefox.**
- Regression: story 1.1 (71) and story 1.2 (76 Chromium / 75 + 1 known FF deviation) still green; demo document unchanged, zero page errors.
- `probe-multi.js` established the multi-reference DOM before any code was written.
- `a11y.js` measured the AC7 consequence on a real export.

### Completion Notes List

- **All 7 ACs satisfied and machine-verified**, including clicking marker 2 of 3 and asserting that arrow 2 is marked while arrows 1 and 3 stay plain — in the live page *and* in each of the four exported files.
- **The defect was verified, not assumed.** `probe-multi.js` confirmed that three citations of `[^norm]` produce three markers that all read `1` and all link to `#footnote-norm`, against a definition carrying `↩ ↩² ↩³`. The arrows were already distinct and correct; the missing piece was only *which one is yours*.
- **The href change is forced, not stylistic.** `:target` knows the fragment and nothing else, so all three markers look identical to CSS. Giving each marker its own anchor is the only JS-free way to mark the matching arrow. `li:target` is kept alongside `li:has(a[data-footnote-backref]:target)` so plain `#footnote-<id>` bookmarks still shade the definition (AC6).
- **A real integration bug, caught by the story 1.2 regression suite.** The story's Dev Notes told me to retarget *before* `attachFootnotePreviews()`. That is wrong: the preview pass resolves each definition **through the marker's href**, so retargeting first built every preview out of the `↩` anchor instead of the footnote — the previews silently became "↩". The 1.2 suite failed on `AC5: backref arrow text stripped too → "↩"`, which is exactly what a regression suite is for. Correct order is previews first, retarget second; the duplicate-id worry that motivated the original note does not exist, since the clone strips backrefs either way. The Dev Notes above are corrected rather than quietly fixed.
- **AC7 measured, not asserted.** On a real export, `:target` resolves to `<a id="footnote-back-norm-2" aria-label="Back to reference norm">`, so assistive tech announces *"Back to reference"* before the footnote's prose. The definition is fully on screen and shaded, so sighted readers are unaffected — the cost lands specifically on AT users. Documented in `poc/README.md` and `deferred-work.md` with two costed exits: a ~15-line reversal that keeps the landing highlight and drops only the arrow disambiguation, and a heavier landing-anchor design that restores reading order at the cost of N static rule pairs.
- **Story 1.2's AC5 is deliberately superseded**, not silently broken: a click no longer lands on `#footnote-<id>` but on the marker's own arrow inside that definition. The 1.2 suite was updated to assert the invariant that still matters (the click lands the reader at the footnote) and accepts either hash, with the supersession commented in place.
- **Ships to exports for free** via the existing architecture — `render()` mutates the live preview, every export re-reads `previewEl.innerHTML`. No export function was touched.
- **CSS duplication tax paid** (NFR4): rules in both stylesheets. `scroll-margin-top: 90px` keeps the jump clear of the editor header. Lime accent `#d4ff00` marks the live arrow; a 30 % lime tint shades the definition — both from the existing palette, no custom properties introduced.

### File List

- `poc/dokufix-poc.html` — modified. Added `linkFootnoteReturnPaths()` before `attachFootnotePreviews()` in source order and called **after** it in `render()`; added landing/arrow highlight CSS to the main `<style>` block and its twin in `READONLY_CSS`.
- `poc/README.md` — modified. *Footnotes* section extended with the landing highlight, the forced href change, the ordering constraint, and the measured accessibility trade-off with both exits.
- `_bmad-output/implementation-artifacts/deferred-work.md` — modified. Three deferred items from this story.
- `_bmad-output/planning-artifacts/epics.md` — modified. Story 1.3 added to Epic 1 with full BDD ACs.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — modified. Story 1.3 tracked.

## Change Log

| Date | Change |
|---|---|
| 2026-07-16 | Implemented story 1.3. Clicking a footnote marker now shades the definition it lands on and marks exactly the return arrow that leads back — the disambiguation that `marked-footnote` cannot provide, since it renders every reference with the same number and the same href. Achieved JS-free by giving each arrow a stable id and pointing its marker at it; `li:target` retained so plain `#footnote-<id>` anchors still work. 26 assertions green in both engines; 1.1 and 1.2 suites still green. Status → review. |
| 2026-07-16 | **Flagged for the product owner — acknowledged 2026-07-16, taken as a separate item by Ben ("das a11y-thema muss ich mir gesondert ansehen"). Not a blocker for code review.** The JS-free approach costs screen-reader reading order — a marker now lands on the "Back to reference" arrow at the end of the footnote rather than at its prose. Measured, documented, and reversible in ~15 lines (keeping the landing highlight, losing only the arrow marking). Decide whether the trade is acceptable for policy/audit documents. |
| 2026-07-16 | **Hands-on human review passed** (Ben, on the demo data): "besteht meinen test, sieht ordentlich aus". Status stays `review` pending the code-review workflow. |
