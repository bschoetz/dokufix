---
stepsCompleted: []
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-dokufix.md
  - _bmad-output/planning-artifacts/product-brief-dokufix-distillate.md
  - poc/README.md
  - poc/dokufix-poc.html
  - docs/komponenten-aus-markdown.md
  - spikes/komponenten-aus-markdown/README.md
  - spikes/komponenten-aus-markdown/REVIEW.md
created: "2026-07-16T12:35:00+02:00"
---

# dokufix - Epic Breakdown

## Overview

This document provides the epic and story breakdown for dokufix.

**Note on provenance.** dokufix has no PRD. Work to date has been PoC-driven (brainstorming → product brief → distillate → `poc/dokufix-poc.html`), executed via quick-dev and code-review cycles rather than formal epics. This is the **first formal epic file**; it does not retro-document the existing PoC surface. Requirements below are derived from the product brief, the distillate's decided tech constraints, the PoC source, and a change request from the product owner (2026-07-16).

Epic numbering therefore starts at 1 with this change request, not with the PoC.

**Note on Epic 2 (added 2026-10-01).** Epic 2 is derived from a spike, not from a brief: `spikes/komponenten-aus-markdown/` rebuilds a colleague's hand-generated HTML process document from plain Markdown, and `docs/komponenten-aus-markdown.md` records the analysis, the measurements, and the product owner's decisions (section "Zwischenstand vom 1. Oktober, abends"). The colleague's document is internal and is not in the repository; the spike's example document is fictitious and has the same structure and the same number of each component. The spike is the reference for behaviour and for the regression cases. It is not code to merge; `poc/` was deliberately left untouched by it.

## Scope Justification — Reconciling with the "No Syntax Extensions" Non-Goal

The distillate lists **"Plugin systems / theme marketplaces / syntax extensions — out of scope, possibly forever"** as an explicit non-goal, and names *feature creep through enthusiasm* as the project's primary risk. Both stories in this epic must pass the **"body for information"** test before they are legitimate. They do, for distinct reasons:

**Story 1.1 (frontmatter) is a defect fix at least as much as a feature.** YAML frontmatter is not a dokufix invention and not a syntax extension — it is a de-facto standard emitted by every static-site generator, every documentation toolchain, and by LLMs producing Markdown. dokufix's *own* planning artifacts open with a `---` YAML block, including the product brief this epic is derived from. Today such a document renders as visible garbage (`<hr>` + `<h2>title: Foo</h2>` — see Story 1.1 Dev Notes), and the frontmatter's `#` comment lines can be silently mistaken for the document title. For the **"Author Whose Reader Hates Markdown"** persona — whose entire success criterion is *"one file that just opens and looks like a real document"* — leading garbage is a direct hit on the core promise. The non-goal protects against *inventing* syntax; this story is about *not corrupting* syntax the ecosystem already emits.

**Story 1.2 (footnote preview) adds no syntax at all.** Footnotes already parse and render in the PoC via `marked-footnote`. This story is a pure reading-comfort layer over an existing construct: no new markers, no new authoring rules, no parser changes.

Neither story adds a plugin system, a theme, or an authoring extension point. Both serve the information body rather than the skin.

## Scope Justification for Epic 2 — Components and BPMN

Epic 2 presses harder on the "no syntax extensions" non-goal than Epic 1 did, so each construct is judged separately. They fall into three groups.

**Existing conventions, rendered properly (Stories 2.2, 2.5 in part, 2.7, 2.8).** GitHub alerts (`> [!NOTE]`) are an established convention; today the PoC renders them as a blockquote with a visible `[!NOTE]` — the same class of defect as the frontmatter in Story 1.1. Tables are plain GFM. A fenced `bpmn` code block uses the mechanism the PoC already uses for `mermaid`, and its content is BPMN 2.0, an ISO standard that any modeler reads and writes. None of this invents syntax.

**Pure presentation (Stories 2.9, 2.10, 2.11).** The large view, the download link and the live viewer add nothing an author has to write.

**dokufix conventions (Stories 2.3, 2.4, 2.5 in part, 2.6).** The status chip (a code span that starts with a colour dot) and the block marker (`<!-- dokufix: name -->` before a list or a table) are conventions dokufix defines. This is the part that touches the non-goal. It is accepted on three conditions, all of which the spike met: the Markdown parser is not changed (everything happens in DOM passes after `marked.parse`, as with the table of contents and the footnotes); the source stays readable in a foreign renderer, where a marked list is still a list, a marked table still a table, and a chip a code span with an emoji; and a marker that does nothing must say so visibly instead of failing silently. The variant of each convention is still an open decision (see "Decisions needed before the first story").

Explicitly **not** accepted into scope: writing BPMN as Mermaid text with a marker and a character syntax for BPMN types (`{+}`, `[📤 …]`). The spike built it; the product owner dropped it on 2026-10-01 in favour of one writing format, BPMN XML. That removes the largest piece of invented syntax the spike contained.

## Requirements Inventory

### Functional Requirements

| ID | Requirement | Story |
|---|---|---|
| FR1 | A YAML frontmatter block at the start of the document renders as a styled metadata panel instead of as document content | 1.1 |
| FR2 | A JSON frontmatter block at the start of the document renders through the same panel | 1.1 |
| FR3 | The metadata panel is expandable/collapsible by the reader | 1.1 |
| FR4 | The collapsed panel shows a compact summary of the most useful keys; expanding reveals all key/value pairs | 1.1 |
| FR5 | Frontmatter is excluded from document-title and filename derivation | 1.1 |
| FR6 | Malformed or unparseable frontmatter degrades visibly but harmlessly — never crashes the render, never silently swallows content | 1.1 |
| FR7 | Hovering a footnote reference shows a preview of the footnote text without leaving the reading position | 1.2 |
| FR8 | The footnote preview is reachable by keyboard, not only by mouse | 1.2 |
| FR9 | The existing footnote section, its anchors, and its backrefs keep working. **Amended by Story 1.3:** the original wording said "unchanged", which 1.3 deliberately breaks — it gives each backref a stable id and repoints each reference at it, so that CSS alone can mark which arrow leads back. Behaviour is preserved (every marker still jumps to its definition, every arrow still returns to its marker); the markup is not. Story 1.2's AC5 is superseded accordingly. | 1.2, 1.3 |
| FR10 | A blockquote that starts with a GitHub alert marker (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) renders as a callout; the marker text is not shown | 2.2 |
| FR11 | A code span that starts with a colour dot (🟢 🟡 🔴 ⚪ 🔵) renders as a status chip, in running text, headings, and table cells | 2.3 |
| FR12 | Callout type and chip status are recognisable without relying on colour alone | 2.2, 2.3 |
| FR13 | A block marker (`<!-- dokufix: name [argument] -->`) applies a named component to the block that directly follows it | 2.4 |
| FR14 | A marked bullet list renders as cards, a marked numbered list as a step list with an optional actor per step | 2.4 |
| FR15 | A marker that cannot take effect (unknown name, wrong block type, block not directly following, column not found) produces a visible warning in the document | 2.4, 2.5, 2.6 |
| FR16 | Every table is wrapped so that a wide table scrolls on its own instead of widening the page; a cell can carry a subdued second line | 2.5 |
| FR17 | A marked table offers a facet filter over one column that works without JavaScript | 2.5 |
| FR18 | A marked table offers a free-text filter with a row counter where JavaScript is available; where it is not, the table is complete and unfiltered | 2.6 |
| FR19 | A fenced `bpmn` block containing BPMN 2.0 XML with coordinates renders as a BPMN diagram | 2.7 |
| FR20 | A fenced `bpmn` block containing BPMN 2.0 XML **without** coordinates renders as a BPMN diagram with its pool and lanes, laid out automatically | 2.8 |
| FR21 | A diagram that cannot be rendered produces a visible warning; the rest of the document, including other diagrams, renders normally | 2.7, 2.8 |
| FR22 | Any diagram (Mermaid or BPMN) opens in a full-viewport large view with zoom steps, without JavaScript | 2.9 |
| FR23 | Every BPMN diagram offers its XML, with coordinates, as a `.bpmn` download and carries the attribution "gerendert mit bpmn.io" | 2.10 |
| FR24 | Where JavaScript runs, the large view of a BPMN diagram is the running `bpmn-js` viewer with wheel zoom, dragging, and the bpmn.io logo; elsewhere it stays the static view of FR22 | 2.11 |
| FR25 | BPMN XML without coordinates that contains several pools and message flows between them renders with one frame per pool and the message flows drawn between the pools | 2.12 |

### NonFunctional Requirements

| ID | Requirement | Story |
|---|---|---|
| NFR1 | Every feature in this epic ships into all four download variants (`Mit Editor`, `nur-lesen`, `schlank`, `kompakt`). **Exception, Epic 2:** the free-text filter of Story 2.6 needs JavaScript and exists only in the live editor and in `Mit Editor`; see FR18. The live viewer of Story 2.11 is an enhancement on top of a large view that works in all four variants, not an exception | 1.1, 1.2, 1.3, 2.1–2.12 |
| NFR2 | Every feature in this epic works in the **JS-free** `nur-lesen` export — no `<script>` may be introduced into that variant. Same exception as NFR1 for Story 2.6 | 1.1, 1.2, 1.3, 2.1–2.12 |
| NFR3 | No new CDN dependency and no new runtime library. The production target is a single inlined file; a YAML library is not to be bundled (see Story 1.1 scope decision). **Relaxed for Epic 2 by NFR8** | 1.1, 2.1–2.6, 2.9, 2.10 |
| NFR4 | New CSS is added to **both** stylesheets — the `#preview`-prefixed live block (L7–569) and the unprefixed `READONLY_CSS` export twin (L2047–2118). Hand-maintained, with no drift detection: story 1.2 shipped its `@supports` block into the live sheet twice and the export twin zero times, and nothing caught it. Verify by grepping both, not by eye. **Superseded for Epic 2 by Story 2.1:** from Story 2.2 on, a rule for document content is written once and reaches the preview and the exports from that one place | 1.1, 1.2, 1.3, 2.1 |
| NFR5 | New document-content constructs follow the `dokufix-` class-prefix convention | 1.1, 1.2, 1.3, 2.2–2.10 |
| NFR6 | File-size impact stays proportionate; measured and recorded, not assumed. Measure all four variants through one build with one document, or the numbers are not comparable to each other. | 1.2, 1.3, 2.1, 2.5, 2.7, 2.8, 2.10 |
| NFR7 | Browser target remains "shipped from 2025 onward"; modern CSS is welcome, but a feature must not *depend* on a selector that Firefox or Safari lacks | 1.2, 1.3, 2.5, 2.9 |
| NFR8 | Epic 2 admits exactly one new runtime library: the `bpmn-js` viewer, in the build with zoom and pan that Story 2.11 needs (`bpmn-navigated-viewer.production.min.js`, 194 602 B; the build that only renders has 185 955 B). It runs only in the editor and in `Mit Editor`: to render a diagram, and as the live viewer in the large view; the three read-only exports carry the finished SVG and no library. No layout library is added: `bpmn-auto-layout` and ELK were measured and rejected (see `docs/komponenten-aus-markdown.md`, "Andere Anordner für XML ohne Koordinaten") | 2.7, 2.8, 2.11 |
| NFR9 | Library versions are pinned exactly: Mermaid 12.0.0, `marked` 18.0.14, `marked-footnote` 1.4.0. The layout of Story 2.8 depends on Mermaid's `swimlane-beta` diagram, a beta keyword that may change between releases; today the PoC loads all three libraries without a version (`poc/dokufix-poc.html` L832–834), so it switched from Mermaid 11 to 12 on 2026-09-10 without anyone changing anything | 2.1, 2.8, 2.12 |
| NFR10 | A failure in one render pass or one diagram must not take down the others. Each pass contains its own errors; a failed diagram becomes a visible warning. Mermaid's own error image must never be shipped as a diagram | 2.2–2.10 |
| NFR11 | Which element is a card title, an actor, a sub-line or a chip is decided in the DOM pass, which then sets a class; CSS styles the class. Structural selectors such as `li > strong:first-child` or `td br + em` cannot see intervening text and matched too much in the spike | 2.2–2.6 |

### Additional Requirements

- **Documentation debt.** Footnote support exists in the PoC but is undocumented in `poc/README.md`. Both stories update the README, and Story 1.2 additionally documents the pre-existing footnote capability.
- **The CSS duplication tax.** `READONLY_CSS` (L2047–2118) is a hand-maintained duplicate of the main `<style>` block with no drift detection. Both stories pay this tax. If a third construct-shaped feature queues up behind this epic, a refactor to generate one from the other becomes the highest-leverage cleanup available in this file — noted here as a candidate future epic, **not** in scope now.

**Additional requirements for Epic 2:**

- **The spike is the reference, not the implementation.** Behaviour, edge cases and measurements are in `docs/komponenten-aus-markdown.md`; the cases that broke the spike are listed in `spikes/komponenten-aus-markdown/REVIEW.md` and encoded in its `tests/robustheit.mjs` (29 cases). Each story carries the relevant cases over as its own regression checks.
- **Neutral example content.** The document the spike originally rebuilt is internal and stays out of the repository. The spike's example is fictitious; the demo text and every test fixture in `poc/` must be neutral as well.
- **The CSS duplication tax, again.** Epic 1 named a refactor of `READONLY_CSS` as the highest-leverage cleanup "if a third construct-shaped feature queues up". Epic 2 queues up nine component and diagram stories and roughly 14 KB of component CSS (spike figure). The product owner decided on 2026-10-01 to do that refactor first: it is Story 2.1.
- **Documentation.** Each story documents its Markdown convention in `poc/README.md`, including what the same source looks like in a renderer that is not dokufix.
- **Candidate future epic: sanitising pasted content.** dokufix passes raw HTML in Markdown through unchanged, into the preview and into every export. `<img src=x onerror=…>` or a `javascript:` link therefore reaches the JS-free `nur-lesen` export; the spike reproduced this, and the PoC behaves the same. With the use case "an LLM writes the document, the user pastes it", foreign content becomes the normal case. Useful raw HTML must survive (`<br>` in table cells, the block-marker comments, raw tables). Measured option: DOMPurify 3.4.16, 28 885 B (11 364 B gzip). Product owner, 2026-10-01: an epic of its own, at some later point; not part of Epic 2.

### UX Design Requirements

No UX design artifact exists for this change request. Design intent is taken from the product owner's request (2026-07-16) and constrained by the distillate's persona notes:

- *"The rendered viewer must be visually clean enough to feel like a real document (not a 'developer tool'). Typography, spacing, and reading width matter."*
- The metadata panel must read as **document furniture**, not as a debug dump of a data structure.
- The document should still look like a document at first glance: metadata is context, not the headline. Hence collapsed-by-default with a useful summary line.

For Epic 2 there is no UX design artifact either. The visual reference is the colleague's process document that the spike rebuilt; screenshots of the spike's export are in `spikes/komponenten-aus-markdown/dist/screenshots/`. Design intent:

- Components are document furniture in the existing dokufix frame. The page frame of the reference document (navigation on the left with groups) is **not** adopted; see "Out of scope" under Epic 2.
- A diagram in the reading column is an overview. At column width its text is about 7 px high; it is read in the large view (Story 2.9).
- Diagrams follow the colour scheme of the page, light and dark, without being rendered twice.

### FR Coverage Map

| FR | Covered by | AC |
|---|---|---|
| FR1 | Story 1.1 | AC1, AC2 |
| FR2 | Story 1.1 | AC3 |
| FR3 | Story 1.1 | AC4 |
| FR4 | Story 1.1 | AC5 |
| FR5 | Story 1.1 | AC6 |
| FR6 | Story 1.1 | AC7, AC8 |
| FR7 | Story 1.2 | AC1, AC2 |
| FR8 | Story 1.2 | AC3 |
| FR9 | Story 1.2 · Story 1.3 | 1.2 AC5 (superseded by 1.3) · 1.3 AC4, AC6 |
| FR9 (amended) | Story 1.3 | AC1, AC2 — landing highlight and return-path disambiguation |
| FR10 | Story 2.2 | AC1, AC2, AC3 |
| FR11 | Story 2.3 | AC1, AC2, AC3 |
| FR12 | Story 2.2 · Story 2.3 | 2.2 AC4 · 2.3 AC4 |
| FR13 | Story 2.4 | AC1 |
| FR14 | Story 2.4 | AC2, AC3 |
| FR15 | Story 2.4 · Story 2.5 · Story 2.6 | 2.4 AC4 · 2.5 AC6 · 2.6 AC1 |
| FR16 | Story 2.5 | AC1, AC2 |
| FR17 | Story 2.5 | AC3, AC4, AC5 |
| FR18 | Story 2.6 | AC2, AC3, AC4 |
| FR19 | Story 2.7 | AC1, AC2, AC3 |
| FR20 | Story 2.8 | AC1, AC2, AC3 |
| FR21 | Story 2.7 · Story 2.8 | 2.7 AC5 · 2.8 AC5 |
| FR22 | Story 2.9 | AC1, AC2, AC3 |
| FR23 | Story 2.10 | AC1, AC2, AC3 |
| FR24 | Story 2.11 | AC1, AC2, AC3, AC5 |
| FR25 | Story 2.12 | AC1, AC2, AC3 |
| NFR1 | Story 1.1 AC9 · Story 1.2 AC4 · Story 1.3 AC5 | |
| NFR1, NFR2 (Epic 2) | Story 2.1 AC2, AC4 · the "Ships through every variant" AC of each story 2.2–2.10; exception 2.6 AC3 | |
| NFR4 (as superseded for Epic 2) | Story 2.1 AC1, AC6 | |
| NFR6 (Epic 2) | Story 2.1 AC5 · Story 2.5 AC7 · Story 2.7 AC6 · Story 2.10 AC5 | |
| NFR8 | Story 2.7 AC4, AC6 · Story 2.11 AC5, AC8 | |
| NFR9 | Story 2.1 AC7 · Story 2.8 AC6 · Story 2.12 AC6 | |
| NFR10 | Story 2.4 AC5 · Story 2.7 AC5 · Story 2.8 AC5 | |
| NFR11 | Story 2.4 AC2, AC3 · Story 2.5 AC2 | |
| NFR2 | Story 1.1 AC9 · Story 1.2 AC4 · Story 1.3 AC3 | |
| NFR3 | Story 1.1 AC7 | |
| NFR4 | Story 1.1 AC9 · Story 1.2 AC4 · Story 1.3 AC5 | |
| NFR5 | Story 1.1 AC1 · Story 1.2 AC1 · Story 1.3 AC1 | |
| NFR6 | Story 1.2 AC6 | |
| NFR7 | Story 1.2 AC2 · Story 1.3 AC3 (`:has()` — Safari 15.4+, Firefox 121+) | |

## Epic List

| Epic | Title | Stories | Status |
|---|---|---|---|
| 1 | Metadata Headers and Footnote Previews | 1.1, 1.2, 1.3 | in-progress |
| 2 | Document Components and BPMN Diagrams | 2.1–2.12 | backlog |

## Epic 1: Metadata Headers and Footnote Previews

**Goal:** Make dokufix render two constructs that real-world Markdown documents already contain — a metadata header and footnotes — the way a reader expects, rather than the way a parser happens to emit them. A document carrying YAML frontmatter must open looking like a document, not like a parse accident; a footnote must be readable without losing your place in the text.

**Business value:** Both defend the *"one file that just opens and looks like a real document"* promise that the secondary persona (Author Whose Reader Hates Markdown) is entirely built on, and both strengthen the audit/provenance story the brief calls "fit for purpose" for regulated environments — frontmatter is where a policy document's title, owner, and classification actually live, and footnotes are where its citations do.

**Sequencing:** The two stories are technically independent and touch disjoint code paths (Story 1.1 intercepts *before* `marked.parse`; Story 1.2 post-processes the rendered DOM *after* it). They share only the CSS-duplication requirement (NFR4). Either order works. 1.1 is recommended first because it carries the larger architectural decision (the `splitFrontmatter` seam) and fixes an active defect.

**Out of scope for this epic:**

- Editing frontmatter through a form UI. The Markdown source stays the single source of truth; the panel is render-only.
- TOML frontmatter (`+++`). Not requested, not common in this ecosystem.
- A general-purpose YAML parser. See Story 1.1's deliberate subset scope.
- Footnote previews for anything other than footnotes (link previews, abbreviation tooltips, cross-reference previews).
- Fixing the `READONLY_CSS` duplication itself (see Additional Requirements).

### Story 1.1: Collapsible Metadata Panel for YAML and JSON Frontmatter

As an author handing a document to a non-technical reader,
I want a YAML or JSON header block at the top of my Markdown to render as a tidy, collapsible metadata panel,
So that the document opens looking like a finished document instead of leaking its header as broken markup — and so the reader can still see title, owner, and version when they want them.

**Acceptance Criteria:**

**AC1 — YAML frontmatter renders as a panel**
**Given** a document whose first line is `---`, followed by YAML key/value lines, followed by a closing `---`
**When** the document renders
**Then** the block does not appear as document content (no `<hr>`, no `<h2>` made from the closing delimiter)
**And** it is replaced by a single `<details class="dokufix-frontmatter">` element rendered at the top of the preview, above the first heading
**And** the element's class names follow the `dokufix-` prefix convention.

**AC2 — Key/value pairs are laid out legibly**
**Given** a rendered metadata panel
**When** the reader expands it
**Then** each key/value pair is presented as a labelled row (key and value visually distinguished), not as raw text
**And** nested maps and sequences are rendered as nested rows rather than flattened or dumped as `[object Object]`
**And** values are HTML-escaped.

**AC3 — JSON frontmatter renders through the same panel**
**Given** a document whose frontmatter block contains a JSON object (either fenced as `---json` … `---`, or a `---` … `---` block whose content begins with `{`)
**When** the document renders
**Then** it produces the same panel treatment as the YAML case, via the same rendering path.

**AC4 — Collapsible without JavaScript**
**Given** a rendered metadata panel in any variant, including the JS-free `nur-lesen` export
**When** the reader activates the panel's summary by mouse **or** by keyboard
**Then** the panel expands and collapses
**And** no `<script>` element has been introduced into the `nur-lesen` export to achieve this.

**AC5 — Collapsed state is informative, not blank**
**Given** frontmatter containing recognisable document metadata
**When** the panel is in its default collapsed state
**Then** the summary line shows a compact digest of the most useful available keys rather than only a generic label
**And** the panel is collapsed by default, so the document still reads as a document on first open.

**AC6 — Frontmatter never becomes the document title or filename**
**Given** a document with frontmatter that contains a `#` character at line start (e.g. a YAML comment `# internal draft`) and a real `# Heading` further down
**When** a filename is derived for download, or a `<title>` is derived for a read-only export
**Then** both are taken from the real `# Heading` in the document body, never from inside the frontmatter block.

**AC7 — Unparseable frontmatter degrades safely**
**Given** a frontmatter block whose content cannot be parsed as either JSON or the supported YAML subset
**When** the document renders
**Then** the render does not throw and the rest of the document renders normally
**And** the block's raw text is preserved and shown verbatim inside the panel rather than being silently discarded
**And** no content is lost from the Markdown source.

**AC8 — A leading thematic break is not mistaken for frontmatter**
**Given** a document that legitimately begins with a `---` thematic break, or where the `---` block does not resolve to a key/value mapping
**When** the document renders
**Then** the source is left untouched and renders exactly as it does today.

**AC9 — Ships through every variant**
**Given** a document with frontmatter
**When** it is downloaded as `Mit Editor`, `nur-lesen`, `schlank`, and `kompakt`
**Then** the panel is present, styled, and collapsible in all four
**And** the required CSS exists in both the live `#preview` block and in `READONLY_CSS`.

### Story 1.2: Hover and Focus Previews for Footnotes

As a reader working through a document with citations,
I want to see a footnote's text by hovering (or keyboard-focusing) its reference marker,
So that I can take in the aside without jumping to the bottom of the document and losing my reading position — including in the JavaScript-free reading copy.

**Acceptance Criteria:**

**AC1 — Hover shows the footnote text in place**
**Given** a rendered document containing a footnote reference (`[^id]`) and its definition (`[^id]: …`)
**When** the reader hovers the reference marker
**Then** a preview containing that footnote's text appears anchored near the marker, without navigating away
**And** the preview element follows the `dokufix-` class-prefix convention
**And** the preview disappears when the pointer leaves.

**AC2 — Implemented without JavaScript**
**Given** the `nur-lesen` export, which contains no JavaScript at all
**When** the reader hovers a footnote reference
**Then** the preview appears, driven purely by CSS
**And** the base positioning does not depend on any CSS feature unsupported by current Firefox or Safari; progressive refinements must degrade to a still-usable preview where unsupported.

**AC3 — Keyboard reachable**
**Given** a reader navigating by keyboard
**When** the footnote reference receives focus
**Then** the preview appears, on the same terms as on hover.

**AC4 — Ships through every variant**
**Given** a document with footnotes
**When** it is downloaded as `Mit Editor`, `nur-lesen`, `schlank`, and `kompakt`
**Then** the preview works in all four
**And** the required CSS exists in both the live `#preview` block and in `READONLY_CSS`.

**AC5 — Existing footnote behaviour is preserved**
**Given** the footnote section that `marked-footnote` already generates
**When** the change is in place
**Then** the footnote list at the document end, the reference anchors, and the backref links all behave exactly as before
**And** clicking a reference still jumps to the definition
**And** a screen reader does not announce the footnote text twice as a result of the preview.

**AC6 — Size impact is measured**
**Given** the preview duplicates footnote text inline in the markup
**When** a representative document with footnotes is exported in all four variants
**Then** the resulting size delta is measured and recorded in the story's completion notes
**And** if the delta is material, it is noted in `poc/README.md` alongside the existing size table.

### Story 1.3: Landing Highlight and Return-Path Disambiguation for Footnotes

*Added 2026-07-16 at the product owner's request, after 1.2 reached review. Scope extension to Epic 1 rather than a re-open of 1.2.*

As a reader following a footnote to the bottom of a long document,
I want the footnote I landed on to be visibly highlighted, and the specific return arrow that takes me back to be marked,
So that I can see instantly where I arrived and how to get back — without scanning a list of identical-looking arrows and guessing.

**Context — the concrete defect.** `marked-footnote` renders every reference to the same footnote with the **same visible number**, all pointing at the same `href`. A footnote cited three times produces three markers that all read `1` and all link to `#footnote-norm`, and a definition carrying three return arrows: `↩ ↩² ↩³`. On arrival there is no indication of which arrow leads back to the marker you came from, and (for a long footnote list) no indication of which entry you landed on at all.

Verified against the PoC:

```
Erste[^norm]. Zweite[^norm]. Dritte[^norm].

→ refs: id=footnote-ref-norm, -norm-2, -norm-3 — all href="#footnote-norm", all rendered "1"
→ <li id="footnote-norm"> … <a href="#footnote-ref-norm">↩</a>
                             <a href="#footnote-ref-norm-2">↩<sup>2</sup></a>
                             <a href="#footnote-ref-norm-3">↩<sup>3</sup></a>
```

**The design constraint that shapes this story.** `:target` only ever knows the current fragment (`#footnote-norm`). It cannot know *which* reference the reader came from. Highlighting the correct return arrow without JavaScript is therefore only possible if each reference navigates to a **distinct** anchor. That is a deliberate change to the reference `href` that `marked-footnote` generates, and it supersedes Story 1.2's AC5 assertion that a click lands on `#footnote-<id>` — noted explicitly so the change is a decision, not a regression.

**Acceptance Criteria:**

**AC1 — The landed-on footnote is highlighted**
**Given** a document with several footnotes
**When** the reader clicks a footnote marker
**Then** the footnote definition they landed on is visibly highlighted against the rest of the list
**And** the highlight persists while that footnote remains the target, so the reader can look away and back.

**AC2 — The matching return arrow is marked**
**Given** a footnote referenced from several places, rendering several return arrows
**When** the reader arrives from one specific marker
**Then** exactly the arrow that leads back to *that* marker is highlighted
**And** the other arrows of the same footnote are not.

**AC3 — Both work without JavaScript**
**Given** the JS-free `nur-lesen` export
**When** the reader clicks a footnote marker
**Then** both highlights behave as above, driven purely by CSS
**And** no `<script>` is introduced into that export.

**AC4 — Return path still works, and is reciprocal**
**Given** a highlighted return arrow
**When** the reader activates it
**Then** they land back at the marker they originally came from.

**AC5 — Ships through every variant**
**Given** a document with footnotes
**When** it is exported as `Mit Editor`, `nur-lesen`, `schlank`, and `kompakt`
**Then** both highlights work in all four
**And** the CSS exists in both the live `#preview` block and in `READONLY_CSS`.

**AC6 — Existing behaviour survives**
**Given** the changes to reference targets
**When** the document renders
**Then** the hover previews from Story 1.2 still work and are unaffected
**And** a link to the plain `#footnote-<id>` anchor (an external bookmark, or a copied URL from before this change) still highlights the footnote
**And** the footnote list, its numbering, and its arrows are otherwise unchanged.

**AC7 — The accessibility trade-off is recorded**
**Given** the reference target is changed so that CSS can disambiguate the return path
**When** the implementation lands
**Then** the consequence for assistive technology is measured, written down in `poc/README.md` and `deferred-work.md`, and flagged for the product owner
**And** an alternative that preserves the original target semantics is described, so reversing the decision is a known, costed option.

## Epic 2: Document Components and BPMN Diagrams

**Goal:** Let a plain Markdown document produce the building blocks of a process handbook — callouts, status chips, cards, step lists, filterable tables, and BPMN diagrams — so that a document an LLM writes in one go, and a user pastes into dokufix, comes out looking like the hand-built HTML page it replaces.

**Business value:** The reference case is real. A colleague had an LLM generate a 46 KB HTML process document; it looks good and has no source — changing a step means editing HTML or regenerating everything, and its hand-placed diagram coordinates left arrows starting and ending in mid-air. The spike rebuilt the same page from Markdown with the same component counts. This epic turns that into product: the source stays Markdown, stays editable, and still exports as one file.

**The use case that shapes the diagram stories.** *An LLM writes the complete documentation as Markdown; the user pastes it into dokufix.* Three consequences, confirmed by the product owner on 2026-10-01:

- BPMN lives **in the text**, as a fenced `bpmn` block. An asset reference cannot be produced by an LLM.
- Coordinates are **optional**. An LLM that has to place coordinates guesses them; that is how the reference document got its broken arrows. So BPMN without coordinates must render (Story 2.8).
- There is **one writing format** for BPMN: BPMN 2.0 XML. Mermaid text stays what it is today, a Mermaid diagram.

**How BPMN without coordinates is laid out.** `bpmn-js` draws; it does not lay out. Where coordinates are missing, Mermaid computes them: the XML is read, rewritten internally as Mermaid swimlane text, rendered off-screen, and only the positions are taken over; the Mermaid picture is discarded and `bpmn-js` draws. Mermaid is the layout engine here — not the writing format and not the renderer. The product owner's finding after comparing layout engines on the same process: only Mermaid produces usable results with lanes.

**Sequencing:**

- 2.1 comes first. It pins the libraries, and every later story writes its CSS once and relies on it.
- 2.2 and 2.3 are independent of each other and of the rest.
- 2.4 introduces the block-marker mechanism and its warnings; 2.5 and 2.6 build on it.
- 2.7 comes before 2.8 and 2.10. 2.9 can start on Mermaid diagrams alone and picks up BPMN once 2.7 exists.
- 2.11 needs 2.7 and 2.9.
- 2.12 builds on 2.8 and can be accepted, or postponed, on its own.
- 2.8 carries the largest risk in the epic (layout heuristics on top of a beta Mermaid feature) and is the only story with a mandatory independent code review.

**Decisions needed before the first story:**

| # | Decision | Default if not decided, or the decision taken | Affects |
|---|---|---|---|
| D1 | Block marker: HTML comment, attribute list (`{.cards}`), or fenced div (`::: cards`) | **Decided 2026-10-01: HTML comment** (`<!-- dokufix: name -->`). It is the only variant that leaves nothing visible on GitHub, and it needs no change to the parser | 2.4, 2.5, 2.6 |
| D2 | Status chip: colour dot in a code span, or one of the alternatives in the analysis | **Decided 2026-10-01: colour dot in a code span**, as a starting point. The product owner expects that a better syntax may replace it later, so the recognition of a chip must live in one place and not be assumed elsewhere | 2.3 |
| D3 | Refactor `READONLY_CSS` so that document styles exist once, before the component stories — or pay the duplication in every story | **Decided 2026-10-01: refactor first, as Story 2.1** | all |
| D4 | Which Mermaid version to pin | **Decided 2026-10-01: exactly 12.0.0**, not "latest 12.x". A newer version is taken deliberately, with the regression check of Story 2.8. `marked` is pinned to **18.0.14** and `marked-footnote` to **1.4.0** in the same step; the PoC loads all three without a version today and currently receives `marked` 15.0.12, because the file its URL names no longer exists in newer versions. The jump to 18 brings six fixes that touch exactly the constructs of this epic (lists after blockquotes, hard line breaks, backtick precedence) and several security and run-time fixes. Pinning is the first step of Story 2.1 | 2.1, 2.8 |
| D5 | Is the planned use of `bpmn-js` consistent with its licence, and should bpmn.io be asked to confirm? The licence forbids removing or changing the code that shows the bpmn.io watermark, and requires the watermark to stay fully visible where the software is used in a website or application | **Decided 2026-10-01: build as planned, no enquiry.** The library is unmodified; its logo is visible in the live viewer (Story 2.11); rendering for the text column happens off-screen; the exports contain only the output of the library's export function; every BPMN diagram carries the link "gerendert mit bpmn.io". The product owner considers this defensible | 2.7, 2.10, 2.11 |

**Out of scope for this epic:**

- **The page frame of the reference document** — navigation on the left with group labels, eyebrow lines, lead paragraph. Product owner, 2026-10-01: not now, probably never. dokufix keeps its table of contents on the right.
- **Mermaid text as a source for BPMN**, with a marker and a character syntax for BPMN types. Built in the spike, dropped in favour of one format.
- **BPMN XML as an asset** instead of in the text. A possible later convenience for authors who keep editing; it cannot be the input format.
- **Editing BPMN** inside dokufix. Confirmed by the product owner, 2026-10-01. The way to change a diagram is to download the `.bpmn`, edit it in a modeler, and paste the XML back.
- **Other layout engines.** `bpmn-auto-layout` does not read lanes; ELK has no ready way to stack lanes and weighs 1 610 KB.
- **Merged table cells** (`colspan`). Confirmed by the product owner, 2026-10-01: only when it is really needed. An author who must have one can write that table as raw HTML today; the facet filter copes with it.
- **Fonts.** Confirmed by the product owner, 2026-10-01: no change to fonts in this epic; theming comes at some later point. dokufix keeps the system font stack, and diagrams use it too, not the fonts the spike loaded for its comparison.
- **Sanitising raw HTML in Markdown.** Confirmed by the product owner, 2026-10-01: not in this epic; it becomes an epic of its own at some later point (see "Additional requirements for Epic 2"). Until then, "no JavaScript in `nur-lesen`" holds for what dokufix generates, not for raw HTML an author pastes.

### Story 2.1: Pinned Libraries and One Source for Document Styles

*Added 2026-10-01 by decisions D3 and D4. An enabling story in two steps: first the libraries are pinned, then the styles are unified. Neither is meant to change what a reader sees.*

As the maintainer of dokufix,
I want the styles for rendered document content to exist once and to be used by the preview and by every export,
So that a component cannot look right in the editor and be missing from the file that actually travels.

**Context — the defect this prevents.** Today every rule for document content is written twice by hand: in the main stylesheet with a `#preview` prefix (`poc/dokufix-poc.html` L7–743, 27.5 KB) and again in `READONLY_CSS` (L2749, 9.4 KB), which the three read-only exports use. Nothing compares the two. In Epic 1 one block ended up in the main stylesheet twice and in `READONLY_CSS` not at all; the exports lacked the feature, and the measurements taken from them were void (see `deferred-work.md`, "`READONLY_CSS` drift has no detector"). The stories that follow add roughly 14 KB of component CSS.

The technique is a development decision. NFR7 applies to whatever is chosen.

**Acceptance Criteria:**

**AC1 — One source**
**Given** the styles that apply to rendered document content
**When** this story lands
**Then** each such rule is defined in exactly one place
**And** the preview and the three read-only exports get their document styles from that place
**And** styles of the editor interface itself stay separate and are not shipped in read-only exports.

**AC2 — Nothing changes for the reader**
**Given** a reference document that uses every construct dokufix renders today — frontmatter panel, footnotes with previews, table of contents, tables, code, images, Mermaid diagrams
**When** it is exported as `Mit Editor`, `nur-lesen`, `schlank`, and `kompakt` before and after the change
**Then** each variant looks the same before and after, in light and in dark, compared by screenshot
**And** any remaining difference is listed and accepted by the product owner.

**AC3 — Epic 1 still works**
**Given** the behaviours accepted in Epic 1
**When** the change is in place
**Then** the metadata panel, the footnote previews, the landing highlight and the marked return arrow work in all four variants as before.

**AC4 — `nur-lesen` stays free of JavaScript**
**Given** the `nur-lesen` export
**When** it is produced after the change
**Then** it contains no `<script>`
**And** its styles are complete inside the file; nothing is derived when the file is opened.

**AC5 — The size effect is measured**
**Given** one reference document
**When** all four variants are built before and after the change
**Then** the sizes are recorded side by side.

**AC6 — Drift cannot return unnoticed**
**Given** a developer adds a style for document content
**When** they follow the documented way
**Then** they write it once
**And** a check fails if a rule for document content exists for the preview but not for the exports, or the other way round
**And** `poc/README.md` describes where document styles go from now on.

**AC7 — Libraries are pinned and Mermaid is set to strict first, and checked on their own**
**Given** the PoC loads `marked`, `marked-footnote` and Mermaid without a version
**When** this story starts
**Then** the three are loaded as exactly `marked` 18.0.14, `marked-footnote` 1.4.0 and Mermaid 12.0.0 (decision D4)
**And** Mermaid runs with `securityLevel: 'strict'` instead of `'loose'` (`poc/dokufix-poc.html` L840). Measured on Mermaid 12.0.0 with flowchart, sequence and swimlane diagrams: line breaks, bold text and ordinary links at nodes behave the same; what goes away are `javascript:` links and nodes that call a JavaScript function of the page on click. Other diagram types were not measured
**And** this happens before the style change, as a separate step
**And** the reference document of AC2 is compared before and after this step alone, so that a difference can be attributed to the version jump of `marked` from 15.0.12 or to the style change, not to both
**And** the behaviours of AC3 are confirmed on `marked` 18.0.14, which Epic 1 was not accepted on.

### Story 2.2: Callouts from GitHub Alert Blockquotes

As an author writing notes and warnings the way GitHub documents do,
I want `> [!NOTE]` and its siblings to render as callouts,
So that a warning reads as a warning instead of as a quotation that begins with a stray `[!WARNING]`.

**Acceptance Criteria:**

**AC1 — The five alert types render as callouts**
**Given** a blockquote whose first line consists only of `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]`
**When** the document renders
**Then** it renders as a callout element with a `dokufix-`-prefixed class naming its type
**And** the marker text itself is not shown
**And** the content after the marker keeps its Markdown formatting, including lists and nested blocks.

**AC2 — Matching follows GitHub**
**Given** the variants `[!note]` (lower case) and `> [!NOTE] text on the same line`
**When** the document renders
**Then** the lower-case marker is recognised
**And** the same-line variant stays an ordinary blockquote, as on GitHub.

**AC3 — No debris**
**Given** a callout whose marker is followed directly by a list
**When** it renders
**Then** no empty paragraph is left where the marker was
**And** an ordinary blockquote elsewhere in the document is unchanged
**And** a heading inside a callout does not appear in the table of contents.

**AC4 — The type is not carried by colour alone**
**Given** two callouts of different types
**When** they render
**Then** each shows its type through a visible label or icon in addition to its colour
**And** assistive technology is given the type as text.

**AC5 — Ships through every variant**
**Given** a document with callouts
**When** it is exported as `Mit Editor`, `nur-lesen`, `schlank`, and `kompakt`
**Then** the callouts are present and styled in all four
**And** its CSS is defined once and reaches the preview and every export through the mechanism of Story 2.1.

### Story 2.3: Status Chips

As an author tracking the state of processes or systems in a document,
I want to mark a status inline and in tables with a short coloured label,
So that a reader scanning a table sees at a glance what is live, planned, or temporary.

*Decision D2 (product owner, 2026-10-01): colour dot in a code span, as a starting point that may be replaced by a better syntax later.*

**Acceptance Criteria:**

**AC1 — A code span with a leading colour dot becomes a chip**
**Given** a code span whose text starts with 🟢, 🟡, 🔴, ⚪ or 🔵 followed by a space and a label
**When** the document renders
**Then** it renders as a chip with a `dokufix-`-prefixed class naming its colour
**And** an ordinary code span is unchanged.

**AC2 — Works where statuses are written**
**Given** chips in running text, in a table cell, in a heading, inside a link, and inside bold text
**When** the document renders
**Then** each renders as a chip.

**AC3 — Headings stay usable**
**Given** a heading that contains a chip, and a heading that consists only of a chip
**When** the table of contents and the heading anchors are built
**Then** neither produces an empty entry
**And** the heading anchors are unique and stable.

**AC4 — The status is not carried by colour alone**
**Given** two chips with the same label and different colours, and the pair ⚪ and 🔵
**When** they render
**Then** a reader who cannot distinguish the colours can still tell them apart
**And** assistive technology is given the status as text.

**AC5 — The false positive is documented**
**Given** a code span that happens to start with a colour dot, such as `` `🔴 = Fehler` ``
**When** the document renders
**Then** it becomes a chip, and `poc/README.md` says so and shows how to avoid it.

**AC6 — Ships through every variant**
**Given** a document with chips
**When** it is exported in all four variants
**Then** the chips are present and styled in all four
**And** its CSS is defined once and reaches the preview and every export through the mechanism of Story 2.1.

### Story 2.4: Cards and Step Lists via the Block Marker

As an author laying out alternatives side by side and procedures step by step,
I want to turn a plain list into cards or into a numbered step list by putting one marker line in front of it,
So that the source stays an ordinary Markdown list and the rendered page gets the structure a handbook needs.

*Decision D1 (product owner, 2026-10-01): the marker is an HTML comment.*

**Acceptance Criteria:**

**AC1 — The marker applies to the block that directly follows**
**Given** a line `<!-- dokufix: cards -->` or `<!-- dokufix: steps -->` directly before a list
**When** the document renders
**Then** the list gets the named component
**And** the marker itself is not visible
**And** a marker that appears inside a code span or a code block is left alone.

**AC2 — Cards**
**Given** a marked bullet list whose items start with bold text
**When** it renders
**Then** each item is a card, laid out in a grid that wraps on its own
**And** the bold text at the very start of an item is its title, also when the list has blank lines between items
**And** bold text in the middle of an item is not treated as a title.

**AC3 — Step lists**
**Given** a marked numbered list
**When** it renders
**Then** each item shows its number as a tile, and numbering honours the list's start value
**And** an item that starts with `*Name:*` shows that name as the step's actor
**And** emphasis without the colon (`*Nie* ohne Backup`) is not treated as an actor.

**AC4 — A marker that does nothing says so**
**Given** an unknown marker name, a marker before the wrong kind of block, or a marker separated from its block by another paragraph
**When** the document renders
**Then** a visible warning appears at that place, naming the problem
**And** nothing is styled by accident
**And** an author cannot set dokufix-internal classes through a marker.

**AC5 — One broken marker does not break the page**
**Given** a marker with unexpected content, such as a hyphenated name with an argument
**When** the document renders
**Then** no exception escapes the pass, and every other component and diagram on the page still renders.

**AC6 — Ships through every variant**
**Given** a document with cards and step lists
**When** it is exported in all four variants
**Then** both render in all four, and the warnings of AC4 are part of the export
**And** its CSS is defined once and reaches the preview and every export through the mechanism of Story 2.1.

### Story 2.5: Tables — Scroll Wrapper, Sub-Line, and Facet Filter

As a reader of a reference table with many rows,
I want wide tables to scroll on their own and long tables to be narrowed down to one category with a click,
So that I find the rows I need — also in the reading copy without JavaScript.

**Acceptance Criteria:**

**AC1 — Wide tables scroll, the page does not**
**Given** a table wider than the reading column
**When** the document renders
**Then** the table scrolls horizontally inside its own wrapper and the page does not widen.

**AC2 — A cell can carry a sub-line**
**Given** a cell written as `**Name**<br>*Zusatz*`
**When** it renders
**Then** the emphasised text directly after the line break is shown as a subdued second line
**And** emphasis elsewhere in a cell is not.

**AC3 — Facet filter**
**Given** a table preceded by `<!-- dokufix: facets Typ -->`
**When** the document renders
**Then** above the table there is one control per distinct value of the column `Typ`, each with its row count, plus one for all rows
**And** choosing a value shows only the rows with that value.

**AC4 — Without JavaScript, by keyboard, and in print**
**Given** the `nur-lesen` export with JavaScript disabled
**When** the reader chooses a facet by mouse or by keyboard
**Then** the table filters
**And** in print all rows are shown regardless of the chosen facet
**And** in a browser without `:has()` the controls are hidden rather than shown without effect.

**AC5 — Values are kept apart and are safe**
**Given** a column with the values `C`, `C++`, `C#`, values in non-Latin script, and empty cells
**When** the facet controls are built
**Then** each distinct value gets its own control
**And** a column heading or cell containing escaped HTML is shown as text, never interpreted
**And** a raw-HTML table with merged cells does not throw.

**AC6 — A facet marker that cannot work says so**
**Given** a facet marker naming a column that does not exist, or placed before something that is not a table
**When** the document renders
**Then** a visible warning appears, as in Story 2.4.

**AC7 — Ships through every variant, and the cost is measured**
**Given** a document with a facet table
**When** it is exported in all four variants
**Then** the filter works in all four, and its CSS is defined once (Story 2.1)
**And** the size added per table by the generated filter rules is measured and recorded.

### Story 2.6: Free-Text Filter for Tables

As a reader working in the editor copy of a document,
I want to type into a field above a table and see only the rows that contain my text,
So that I can search a long reference table without leaving the page.

**Acceptance Criteria:**

**AC1 — The marker**
**Given** a table preceded by `<!-- dokufix: filter "Suchen …" -->`
**When** the document renders with JavaScript available
**Then** a search field with that placeholder and an accessible label appears above the table
**And** a marker before something that is not a table produces a visible warning, as in Story 2.4.

**AC2 — Filtering and counting**
**Given** a table with 14 rows
**When** the reader types a term that 3 rows contain
**Then** only those rows are shown and a counter reads "3 von 14 Zeilen"
**And** the counter is announced to assistive technology when it changes
**And** together with a facet filter on the same table, both conditions apply.

**AC3 — The documented exception to NFR1 and NFR2**
**Given** the three read-only exports
**When** a document with a filter marker is exported
**Then** `nur-lesen`, `schlank` and `kompakt` contain no search field and show the complete table
**And** `Mit Editor` contains the working field
**And** `poc/README.md` states this difference.

**AC4 — Runtime state never reaches an export**
**Given** a filter that is currently hiding rows
**When** any variant is exported
**Then** the export contains every row and no row is marked hidden.

**AC5 — Set up once**
**Given** the document re-renders after an edit
**When** the filter is set up again
**Then** there is still exactly one search field per table.

### Story 2.7: BPMN Diagrams from XML with Coordinates

As an author who models a process in a BPMN modeler,
I want to paste the XML into a fenced `bpmn` block and get the diagram in my document,
So that the document shows standard BPMN — pool, lanes, events, gateways, task types — and still exports as one file.

**Acceptance Criteria:**

**AC1 — The block renders as a diagram**
**Given** a fenced code block with the language `bpmn` that contains BPMN 2.0 XML including its diagram part (BPMN-DI)
**When** the document renders
**Then** the block is replaced by the diagram as inline SVG inside a figure with a `dokufix-`-prefixed class
**And** the SVG is the output of `bpmn-js`'s export function, contains no `foreignObject`, and carries an accessible name
**And** everything the XML places is drawn: pools, lanes, events, gateways, task types, call activities, sequence and message flows.

**AC2 — The diagram follows the colour scheme**
**Given** a rendered BPMN diagram
**When** the page switches between light and dark
**Then** the diagram's colours follow without the diagram being rendered again, in every variant.

**AC3 — Ships through every variant, like a Mermaid diagram**
**Given** a document with a BPMN diagram
**When** it is exported as `Mit Editor`, `nur-lesen`, `schlank`, and `kompakt`
**Then** the diagram is present in all four
**And** each variant treats the BPMN SVG the way it treats a Mermaid SVG
**And** its CSS is defined once and reaches the preview and every export through the mechanism of Story 2.1.

**AC4 — The library stays out of the read-only exports**
**Given** the three read-only exports of a document with BPMN
**When** they are inspected
**Then** none of them contains `bpmn-js`
**And** `nur-lesen` contains no `<script>`.

**AC5 — A broken diagram is a visible warning**
**Given** a `bpmn` block whose content is not valid BPMN XML, next to a valid diagram
**When** the document renders
**Then** the broken block is replaced by a visible warning that names the diagram and the reason
**And** the valid diagram and the rest of the document render
**And** nothing is left behind in the page from the failed attempt.

**AC6 — The cost of the library is measured**
**Given** one document with one BPMN diagram
**When** all four variants are built
**Then** the size of each is recorded with and without the diagram
**And** the size of `bpmn-js` and where it is carried is recorded in `poc/README.md`.

**AC7 — Labels hold on a machine with another font**
**Given** a diagram is turned into a finished picture on the author's machine, where text is measured with the author's system font, and a reader on another system sees it in a different font
**When** an exported diagram is viewed with at least two different system fonts
**Then** no label is cut off or runs out of its symbol
**And** if one does, the case is recorded with a picture and flagged for the product owner.

### Story 2.8: BPMN Diagrams from XML without Coordinates

As a user pasting a document that an LLM wrote,
I want BPMN that contains only the process — lanes, steps, flows — to be laid out for me,
So that nobody has to place coordinates by hand, and no arrow ends in mid-air because someone guessed them.

**Context.** This story is the reason Mermaid stays involved in BPMN at all; see "How BPMN without coordinates is laid out" above. The layout code exists in the spike (`src/bpmn.js`: `layoutXml`, `layoutFromMermaid` and the routing corrections around it) and has **not** had an independent review. The reference input is `spikes/komponenten-aus-markdown/diagramme/uebergabe-ohne-koordinaten.bpmn`: 47 lines, 4 lanes, 16 symbols, 17 flows.

**Acceptance Criteria:**

**AC1 — XML without a diagram part is laid out**
**Given** a `bpmn` block whose XML contains one process with a lane set, flow nodes and sequence flows, and no BPMN-DI
**When** the document renders
**Then** a BPMN diagram appears with the pool, every lane, every flow node in its lane, and every sequence flow
**And** a process without lanes is laid out as well.

**AC2 — The result is a clean drawing**
**Given** the reference input
**When** it is laid out
**Then** every flow starts and ends on the outline of its source and target symbol
**And** no flow runs through a symbol it does not belong to
**And** flow labels do not lie on top of each other
**And** flows that leave a gateway at the same corner are told apart, by route or by label position.

**AC3 — The author's XML is kept**
**Given** XML without coordinates
**When** it is laid out
**Then** the elements and ids of the original are unchanged
**And** only the diagram part is added.

**AC4 — Ships through every variant**
**Given** a document with a laid-out BPMN diagram
**When** it is exported in all four variants
**Then** the diagram is present in all four, as in Story 2.7
**And** the read-only exports contain neither `bpmn-js` nor Mermaid on account of this diagram.

**AC5 — What cannot be laid out says so**
**Given** XML without coordinates that contains more than one pool (until Story 2.12 lands), or a flow node that no lane references although lanes exist
**When** the document renders
**Then** a visible warning names the reason
**And** the off-screen Mermaid rendering leaves nothing behind in the page
**And** Mermaid's error image is never shown as a diagram.

**AC6 — The layout is guarded against a change of Mermaid**
**Given** the layout depends on Mermaid's `swimlane-beta`, and Mermaid is pinned to 12.0.0 by Story 2.1
**When** this story lands
**Then** the pinned version is only ever changed together with this check
**And** a regression check renders the reference input and compares pool, lane and symbol counts and the properties of AC2.

**AC7 — Independent review**
**Given** the layout and routing code
**When** the story is offered for acceptance
**Then** an independent code review with its own test inputs has been done, and its findings are fixed or recorded in `deferred-work.md`.

**AC8 — The limits are written down**
**Given** the known limits of Mermaid's arrangement
**When** the story lands
**Then** `poc/README.md` states them: all nodes of a lane are placed in one row, so parallel branches belong in different lanes; a gateway that fans out to many targets can tangle; only one pool is laid out until Story 2.12 lands.

**AC9 — Labels hold on a machine with another font**
**Given** the layout sizes symbols and places labels using the author's system font
**When** the reference input is laid out and the export is viewed with at least two different system fonts
**Then** no label is cut off, runs out of its symbol, or lies on a flow
**And** if one does, the case is recorded with a picture and flagged for the product owner.

### Story 2.9: Large View for Diagrams

As a reader looking at a process diagram that is too small to read in the text column,
I want to open it across the whole window and zoom it,
So that I can read the labels — in the reading copy without JavaScript as well.

**Acceptance Criteria:**

**AC1 — A click opens the diagram large**
**Given** any rendered diagram, Mermaid or BPMN
**When** the reader clicks it
**Then** the diagram fills the viewport, with its title, zoom controls and a close control
**And** the page behind does not scroll
**And** the same figure becomes the large view; the SVG is not duplicated in the file.

**AC2 — Zoom steps**
**Given** the large view
**When** the reader chooses "Einpassen", "100 %", "150 %" or "200 %"
**Then** the diagram is shown at that size and can be scrolled when it exceeds the viewport.

**AC3 — Without JavaScript**
**Given** the `nur-lesen` export with JavaScript disabled
**When** the reader opens, zooms and closes the large view by mouse
**Then** all three work, driven by CSS alone
**And** no `<script>` is introduced into that export.

**AC4 — Keyboard**
**Given** a reader using the keyboard
**When** the diagram's control has focus
**Then** it can be opened and closed, and the zoom steps can be chosen, with a visible focus indicator
**And** where JavaScript is available, Escape closes the large view and `+` and `−` change the zoom step
**And** the fact that focus is not held inside the large view is recorded as a known limit.

**AC5 — Browser support is verified, not assumed**
**Given** the large view relies on `:has()`
**When** the story lands
**Then** it has been opened in current Firefox and in Safari, or the missing check is recorded in `deferred-work.md` and flagged for the product owner.

**AC6 — Ships through every variant**
**Given** a document with diagrams
**When** it is exported in all four variants
**Then** the large view works in all four
**And** its CSS is defined once and reaches the preview and every export through the mechanism of Story 2.1.

### Story 2.10: BPMN Download and Attribution

As a reader who wants to continue working with a process model,
I want to download the diagram as a BPMN file,
So that I can open it in a modeler — with coordinates, even when the document's author wrote none.

**Acceptance Criteria:**

**AC1 — Download**
**Given** a rendered BPMN diagram
**When** the reader activates "BPMN 2.0 herunterladen" below it
**Then** a `.bpmn` file is saved whose name is derived from the diagram's title
**And** the file contains the XML including coordinates; for a diagram from Story 2.8 these are the computed ones
**And** the download works without JavaScript.

**AC2 — Attribution**
**Given** a rendered BPMN diagram, in any variant
**When** the reader looks below it
**Then** a link "gerendert mit bpmn.io" to `https://bpmn.io` is shown
**And** it is present under every BPMN diagram (product owner's decision, 2026-10-01).

**AC3 — The licence position is written down**
**Given** `bpmn-js` requires its logo to stay visible where the library runs and displays
**When** the story lands
**Then** `poc/README.md` states where the library runs, where its logo is visible, and that the exports contain only the output of its export function
**And** it records the product owner's assessment that this use is consistent with the licence (decision D5).

**AC4 — The file opens elsewhere**
**Given** a downloaded file from a diagram of Story 2.7 and one from Story 2.8
**When** each is opened in a modeler other than bpmn.io's own
**Then** it opens without errors, or the result is recorded and flagged for the product owner.

**AC5 — Ships through every variant, and the cost is measured**
**Given** a document with BPMN diagrams
**When** it is exported in all four variants
**Then** download and attribution are present in all four
**And** the size the embedded XML adds per diagram is measured and recorded (spike: 16 to 19 KB per diagram, uncompressed).

### Story 2.11: Live BPMN Viewer in the Large View

*Added 2026-10-01 at the product owner's request. An earlier draft of this epic listed the viewer as out of scope; that was a proposal the product owner had not agreed to.*

As a reader studying a large process diagram in the editor copy,
I want the large view to let me zoom with the mouse wheel and drag the diagram,
So that I can move around a big process the way I would in a modeler — and so that the bpmn.io logo is visible where the library is at work.

**Context.** Built in the spike (`enhance` in `src/bpmn.js`) and covered there by the checks in `tests/diagramm-ansicht.mjs`. Those checks use synthetic mouse and keyboard input; the spike was never operated by hand.

**Acceptance Criteria:**

**AC1 — With JavaScript, the large view of a BPMN diagram is the running viewer**
**Given** a BPMN diagram in the live editor or in a `Mit Editor` file
**When** the reader opens its large view
**Then** the `bpmn-js` viewer starts in place of the static image, from the same XML the download offers
**And** it shows the same diagram with the same colours, in light and in dark.

**AC2 — Zoom and pan**
**Given** the running viewer
**When** the reader chooses a zoom step, turns the mouse wheel with Ctrl held, or drags the diagram
**Then** the zoom steps of Story 2.9 set the viewer's scale, the wheel zooms, and dragging moves the diagram
**And** a short hint names wheel and drag.

**AC3 — The logo is visible**
**Given** the running viewer
**When** it is shown, in light or in dark
**Then** the bpmn.io logo that the library itself displays is fully visible and not covered by anything
**And** the library's code for it is neither removed nor changed.

**AC4 — Closing leaves nothing behind**
**Given** the running viewer
**When** the reader closes the large view by its control or with Escape
**Then** the viewer is destroyed and the static image is back
**And** an export made while the viewer is open contains no trace of it.

**AC5 — Only where it can run, and never instead of the JS-free view**
**Given** the three read-only exports, and Mermaid diagrams in any variant
**When** their large view is opened
**Then** it is the static image with the zoom steps of Story 2.9
**And** the read-only exports do not contain `bpmn-js`.

**AC6 — A viewer that cannot start is not an error for the reader**
**Given** the viewer fails to start
**When** the large view is opened
**Then** the static image view of Story 2.9 is shown instead.

**AC7 — Operated by hand**
**Given** the spike verified wheel, drag and keys only with synthetic input
**When** this story is offered for acceptance
**Then** it has been operated by hand with a real mouse and keyboard in Chromium and Firefox.

**AC8 — The cost is measured**
**Given** the viewer needs the `bpmn-js` build with zoom and pan
**When** `Mit Editor` is built with a BPMN document
**Then** the size is recorded against the build that only renders (spike figures: 194 602 B against 185 955 B).

### Story 2.12: Several Pools and Message Flows without Coordinates

*Added 2026-10-01 at the product owner's request, after an experiment in the spike (`docs/komponenten-aus-markdown.md`, "Mehrere Pools ohne Koordinaten (Versuch)"). A separate story so that it can be accepted, or postponed, independently of Story 2.8.*

As a user pasting a document that an LLM wrote,
I want a process with two or more participants and the messages between them to be laid out as well,
So that the form an LLM tends to choose for "customer asks, company answers" — two pools and message flows — gives me a diagram and not a warning.

**Context.** Mermaid knows lanes but not pools; nested lanes disappear in its picture. The experiment therefore hands all lanes of all pools to Mermaid as one flat swimlane, with the message flows as edges, so that sending and receiving end up above one another. Afterwards each pool gets its own frame and a gap to the next. Reference inputs: `spikes/komponenten-aus-markdown/diagramme/abo-zwei-pools.bpmn` (2 pools, 3 lanes, 3 message flows; clean) and `bestellung-drei-pools.bpmn` (3 pools, 2 lanes, 5 message flows; readable, with the weaknesses named in the analysis). Both were written by the developer of the layout, which is weak evidence.

**Acceptance Criteria:**

**AC1 — Several pools are laid out**
**Given** a `bpmn` block without BPMN-DI whose collaboration has two or more participants, each with its own process
**When** the document renders
**Then** each pool is drawn with its own frame, its lanes inside it, and a visible gap to the next pool
**And** a pool without lanes is laid out as well.

**AC2 — Message flows**
**Given** message flows between flow nodes of different pools
**When** the diagram is laid out
**Then** each message flow is drawn, as a message flow, from its source to its target
**And** it reaches its target from the side it comes from, above or below, and does not lie on a sequence flow that arrives there
**And** its name is shown.

**AC3 — Sequence flows stay in their pool**
**Given** the laid-out diagram
**When** it is inspected
**Then** no sequence flow runs in the gap between two pools or on a pool's frame.

**AC4 — The result is a clean drawing, on more than the developer's examples**
**Given** the two reference inputs, and at least three further inputs written by an LLM that was given only the task and the rule "BPMN 2.0 XML without coordinates"
**When** they are laid out
**Then** the properties of Story 2.8 AC2 hold
**And** no flow runs through a label
**And** what does not hold is listed with a picture and decided by the product owner.

**AC5 — What cannot be laid out says so**
**Given** a pool that has no process of its own, or a message flow attached to a pool instead of to a flow node
**When** the document renders
**Then** a visible warning names the reason.

**AC6 — A single pool is laid out exactly as before**
**Given** the reference input of Story 2.8
**When** it is laid out after this story has landed
**Then** the result is identical to the result before.

**AC7 — Independent review**
**Given** this story adds routing corrections of its own
**When** it is offered for acceptance
**Then** they have been covered by an independent code review, as in Story 2.8 AC7.

**AC8 — Ships through every variant**
**Given** a document with such a diagram
**When** it is exported in all four variants
**Then** the diagram is present in all four
**And** the download of Story 2.10 contains the coordinates of every pool and every message flow.
