---
stepsCompleted: []
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-dokufix.md
  - _bmad-output/planning-artifacts/product-brief-dokufix-distillate.md
  - poc/README.md
  - poc/dokufix-poc.html
created: "2026-07-16T12:35:00+02:00"
---

# dokufix - Epic Breakdown

## Overview

This document provides the epic and story breakdown for dokufix.

**Note on provenance.** dokufix has no PRD. Work to date has been PoC-driven (brainstorming → product brief → distillate → `poc/dokufix-poc.html`), executed via quick-dev and code-review cycles rather than formal epics. This is the **first formal epic file**; it does not retro-document the existing PoC surface. Requirements below are derived from the product brief, the distillate's decided tech constraints, the PoC source, and a change request from the product owner (2026-07-16).

Epic numbering therefore starts at 1 with this change request, not with the PoC.

## Scope Justification — Reconciling with the "No Syntax Extensions" Non-Goal

The distillate lists **"Plugin systems / theme marketplaces / syntax extensions — out of scope, possibly forever"** as an explicit non-goal, and names *feature creep through enthusiasm* as the project's primary risk. Both stories in this epic must pass the **"body for information"** test before they are legitimate. They do, for distinct reasons:

**Story 1.1 (frontmatter) is a defect fix at least as much as a feature.** YAML frontmatter is not a dokufix invention and not a syntax extension — it is a de-facto standard emitted by every static-site generator, every documentation toolchain, and by LLMs producing Markdown. dokufix's *own* planning artifacts open with a `---` YAML block, including the product brief this epic is derived from. Today such a document renders as visible garbage (`<hr>` + `<h2>title: Foo</h2>` — see Story 1.1 Dev Notes), and the frontmatter's `#` comment lines can be silently mistaken for the document title. For the **"Author Whose Reader Hates Markdown"** persona — whose entire success criterion is *"one file that just opens and looks like a real document"* — leading garbage is a direct hit on the core promise. The non-goal protects against *inventing* syntax; this story is about *not corrupting* syntax the ecosystem already emits.

**Story 1.2 (footnote preview) adds no syntax at all.** Footnotes already parse and render in the PoC via `marked-footnote`. This story is a pure reading-comfort layer over an existing construct: no new markers, no new authoring rules, no parser changes.

Neither story adds a plugin system, a theme, or an authoring extension point. Both serve the information body rather than the skin.

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
| FR9 | The existing footnote section, its anchors, and its backrefs continue to work unchanged | 1.2 |

### NonFunctional Requirements

| ID | Requirement | Story |
|---|---|---|
| NFR1 | Both features ship into all four download variants (`Mit Editor`, `nur-lesen`, `schlank`, `kompakt`) | 1.1, 1.2 |
| NFR2 | Both features work in the **JS-free** `nur-lesen` export — no `<script>` may be introduced into that variant | 1.1, 1.2 |
| NFR3 | No new CDN dependency and no new runtime library. The production target is a single inlined file; a YAML library is not to be bundled (see Story 1.1 scope decision) | 1.1 |
| NFR4 | New CSS is added to **both** stylesheets — the `#preview`-prefixed live block (L7–569) and the unprefixed `READONLY_CSS` export twin (L2047–2118) | 1.1, 1.2 |
| NFR5 | New document-content constructs follow the `dokufix-` class-prefix convention | 1.1, 1.2 |
| NFR6 | File-size impact stays proportionate; measured and recorded, not assumed | 1.2 |
| NFR7 | Browser target remains "shipped from 2025 onward"; modern CSS is welcome, but a feature must not *depend* on a selector that Firefox or Safari lacks | 1.2 |

### Additional Requirements

- **Documentation debt.** Footnote support exists in the PoC but is undocumented in `poc/README.md`. Both stories update the README, and Story 1.2 additionally documents the pre-existing footnote capability.
- **The CSS duplication tax.** `READONLY_CSS` (L2047–2118) is a hand-maintained duplicate of the main `<style>` block with no drift detection. Both stories pay this tax. If a third construct-shaped feature queues up behind this epic, a refactor to generate one from the other becomes the highest-leverage cleanup available in this file — noted here as a candidate future epic, **not** in scope now.

### UX Design Requirements

No UX design artifact exists for this change request. Design intent is taken from the product owner's request (2026-07-16) and constrained by the distillate's persona notes:

- *"The rendered viewer must be visually clean enough to feel like a real document (not a 'developer tool'). Typography, spacing, and reading width matter."*
- The metadata panel must read as **document furniture**, not as a debug dump of a data structure.
- The document should still look like a document at first glance: metadata is context, not the headline. Hence collapsed-by-default with a useful summary line.

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
| FR9 | Story 1.2 | AC5 |
| NFR1 | Story 1.1 AC9 · Story 1.2 AC4 | |
| NFR2 | Story 1.1 AC9 · Story 1.2 AC4 | |
| NFR3 | Story 1.1 AC7 | |
| NFR4 | Story 1.1 AC9 · Story 1.2 AC4 | |
| NFR5 | Story 1.1 AC1 · Story 1.2 AC1 | |
| NFR6 | Story 1.2 AC6 | |
| NFR7 | Story 1.2 AC2 | |

## Epic List

| Epic | Title | Stories | Status |
|---|---|---|---|
| 1 | Metadata Headers and Footnote Previews | 1.1, 1.2 | in-progress |

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
