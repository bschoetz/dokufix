---
title: "Product Brief Distillate: dokufix"
type: llm-distillate
source: "product-brief-dokufix.md"
created: "2026-04-30T22:20:00+02:00"
purpose: "Token-efficient context for downstream PRD creation"
---

# dokufix — Detail Pack

## Identity & Framing

- **One-line identity:** A single self-contained HTML file that is simultaneously viewer, editor, and artifact for technical documentation.
- **Conceptual frame (the test for every future feature):** *"Body for information."* The HTML is the current skin. Anything proposed must serve the body, not bloat the skin. Use this as the rejection test for scope creep.
- **Core architectural pattern:** Self-modifying single-file HTML application. Closest prior art = TiddlyWiki. dokufix is *document-shaped*, not *wiki-shaped*.
- **Project nature:** Open-source side project on GitHub. No commercial pressure. Single-author / sequential-handoff tool. License will follow the embedded libraries (likely MIT or Apache 2.0).

## The Unnegotiable Six (MVP Capabilities)

1. Render Markdown + Mermaid + base64-embedded images in any modern browser.
2. In-place editor with viewer ↔ editor toggle.
3. **IndexedDB-backed workbench** so edits persist across tab close / refresh / crash. No data loss between sessions.
4. **Explicit, user-initiated save** that writes a new HTML file. **Leaving edit mode is NOT a save.** Auto-save is opt-in only (e.g. via cookie/preference), never default.
5. Plain Markdown export with **user-chosen image strategy:** (a) `data:` URIs inline in the MD, (b) sibling files in a folder, (c) bundled ZIP. The user decides at export time.
6. Self-replication: any dokufix file can spawn a new, empty dokufix file. This is the bootstrap-into-restricted-environments mechanism.

## Embedded Metadata in Every Saved File

- **Version counter** (incremented on each save) — lives **inside the file**, not in the filename. Filenames stay stable across saves so cross-document `<a href>` links survive revisions.
- **Export timestamp** (ISO 8601, UTC).
- **Optional commit message** captured at save time → accumulates into an in-file version history. Big multiplier for the audit / compliance story.
- **Recoverable Markdown source** — embedded so the artifact is auditable on its own.

## Technical Direction (Not in the Brief, but Decided)

- **Markdown parser:** Marked (external library, embedded into the artifact at build time, NOT loaded from CDN).
- **Diagram rendering:** Mermaid (external, embedded, no CDN).
- **Layout / editor chrome:** Vanilla JS + CSS to keep the file lean.
- **No CDN dependencies anywhere** — the file must work fully offline. Critical for the locked-down-laptop use case.
- **Build pipeline:** Small build script bundles all sources (HTML template + JS + CSS + libs) into one distributable HTML file.
- **Browser target:** Browsers shipped from 2025 onward. **Actively use the latest browser features** (modern JS, IndexedDB, Web APIs) — don't write defensively for legacy browsers. The target users have current browsers; old-browser compatibility is not a goal.
- **Distribution:** GitHub releases. Plus a Pages-hosted live demo dokufix file so first-time visitors can play before downloading.
- **Phase:** Prototype mode. Speed > polish for v1.

## User Scenarios (Richer than the Exec Brief)

### Primary — Consultant on a Locked-Down Customer Laptop

- Arrives on site, hands handed locked-down laptop. No install rights, no SaaS access, no Notion, no VS Code, no Git.
- Email + browser + filesystem are guaranteed.
- Workflow: download dokufix.html from GitHub via browser (or mail it to themselves) → open → edit → save new HTML files as work progresses → at handoff email the result to the customer.
- **Tiered handover model** (consultant decides):
  - Baseline: HTML files only (read-anywhere artifact).
  - Friendly: + Markdown / future Confluence-Jira exports for portability.
  - Generous: + a blank dokufix file so the customer can keep authoring.
- Implies: dokufix must be lean enough to be one of many email attachments, must render correctly on first open, must not need any "trust this site" or permission dialogs.

### Secondary — Author whose Reader Hates Markdown

- Developer / policy owner / technical writer wants to send a doc to a non-technical recipient.
- Recipient won't install anything, won't learn syntax, won't trust SaaS.
- dokufix delivers "one file that just opens and looks like a real document."
- Implies: the rendered viewer must be visually clean enough to feel like a real document (not a "developer tool"). Typography, spacing, and reading width matter more than they would for a dev-only tool.

### Tertiary — Solo Author, Source-Loss Survivor

- Has been burned repeatedly by "the PDF circulates but the Word file is gone."
- Wants the artifact and the editable source to be the same file forever.
- Implies: the recoverable-Markdown promise must hold round-trip — edit → save → reopen → edit → save → ... must not silently corrupt formatting.

## North-Star Success Vision (User-Stated)

- "Success is when the madness stops — *who has the Word file the PDF was generated from, the one we now need to update, and nobody knows who had it last.*"
- Use this exact framing in marketing/README copy. It is the most concrete pain anchor available.

## Risks (with Mitigation Notes)

- **Feature creep through enthusiasm** (user-acknowledged: *"that I keep having new ideas that are toootaaaally genius and definitely not feature creep"*). Mitigation: the "body for information" test on every proposed feature. Defer aggressively to v2+.
- **Browser save model edge cases:** filename collisions on every download, "is this overwrite or new version?" confusion. Mitigation candidates: stable filename, in-file version counter, optional commit message prompt at save, clear "saved as X" toast.
- **File-size growth from base64 images:** acceptable for ≤30-page typical consultant docs, painful for image-heavy reports. v1 mitigation = document the practical limit in the README and let v2 explore alternatives (sidecar images? optional external image references?).
- **TiddlyWiki overlap perception:** users who know TiddlyWiki will dismiss dokufix as "TiddlyWiki with Markdown." Mitigation: README must explicitly acknowledge TiddlyWiki and explain the different shape (transactional document vs personal wiki, single-path save vs five-option matrix, Markdown-native vs WikiText-native, Mermaid built-in vs plugin).

## Explicit Non-Goals (Rejected for v1, Some Forever)

- **Real-time multi-user collaboration** — server or sync layer would kill the single-file proposition. Accepted permanent tradeoff.
- **Confluence / Jira markup export** — attractive, deferred to v2. Not core to the source-loss-loop story.
- **Pure-HTML / JS-stripped export for hostile environments** — deferred to v2. Useful as a security-hardening posture but not part of the core UX.
- **Plugin systems / theme marketplaces / syntax extensions** — out of scope, possibly forever. The "small and sharp" framing rejects extensibility-as-strategy.
- **Auto-save as a default** — opt-in only via user preference. The default UX is "explicit save."
- **Multi-document workspace UI** — dokufix is one file = one document. A folder of files becomes a wiki via plain `<a href>`, not via a workspace shell.

## Surfaced but Not Yet Decided (Open Questions for PRD Phase)

- **First-run UX of a fresh dokufix file:** what does the user see on first open — empty editor, demo content, onboarding card? Tradeoff between immediate utility and clutter.
- **Filename strategy on save:** stable filename + version counter inside vs `name-vN.html` filename pattern. Decision lean: stable filename (preserves cross-doc links). Confirm.
- **Commit message UX:** mandatory? optional with placeholder? skippable? collapsed-by-default? Tradeoff between friction and value of the version history.
- **Cross-document link feature scope:** is "infrastructure-free wiki via `<a href>` between dokufix files" a marketed v1 feature or just a happy emergent behavior? If marketed, requires testing of relative-path resolution in `file://` contexts across browsers.
- **Indexing / discoverability across multiple dokufix files** in a folder — out of scope for v1, but a candidate v2 feature (a generated index dokufix file?).
- **Image-export-as-ZIP:** does dokufix bundle a ZIP library (jszip ~30KB minified) into the artifact for the ZIP option, or only offer (a) inline / (b) sibling files in v1 and add ZIP later? Size cost vs feature completeness.
- **Smuggle source into "Ohne Editor" exports for round-trip recovery:** the read-only export variants are deliberately one-way (rendered HTML only — the Markdown source isn't recoverable from a rendered table or code block). Idea: optionally append the gzip+base64 Markdown source as a single HTML comment at the bottom of the file (`<!-- dokufix-source-gz: BASE64 -->`). The file stays JS-free and visually identical, but a future "Open in dokufix" loader could detect and extract the source. Resurrects edit-ability without compromising the no-JS promise. Decide: opt-in checkbox in the download menu, or always-on, or never (privacy: comment IS still readable in any text editor — leakage of "draft" content into a "final" artifact is a non-trivial concern for legal/compliance contexts). Likely v2.
- **Versioning of the dokufix format itself:** how are old dokufix files re-edited by newer dokufix builds? Format-version field embedded? Migration on first edit? Important for the "endurance aspiration" but not blocking v1.

## Competitive Intelligence (Worth Preserving)

- **TiddlyWiki** — closest cousin. WikiText-first. Save UX is the well-known wart (TiddlyDesktop, TiddlyFox-successor extensions, Node server, "save changes" download button). Markdown via plugin. Mermaid via plugin. Active community. Personal-wiki-shaped, not document-shaped.
- **Markdeep** — single-file viewer, ASCII diagrams (no Mermaid), no in-browser editor. Not a competitor for the editor use case.
- **StackEdit** — in-browser MD editor, but produces MD output, not a self-contained shareable HTML artifact. PWA-installable but not a portable file.
- **HedgeDoc / CodiMD / HackMD** — server-based collaborative MD editors. Server requirement kills the locked-down-laptop scenario. HackMD has static HTML export but it is viewer-only.
- **Marp** — Markdown-to-slides. Can export self-contained HTML slides but no in-export editor. Slides shape, not docs.
- **Obsidian Publish / Notion Export / MkDocs / Quarto** — all produce static sites or hosted pages, none produce a self-editing HTML artifact.
- **Silverbullet.md / Logseq / Decker (HyperCard revivalist scene)** — adjacent niche tools. Decker is the most spiritually similar (single-file self-editing stacks) but uses a HyperCard-style stack metaphor, not Markdown documents.

## Decided Tech Constraints (with Why-Now reasoning)

- **Compression algorithm: gzip** (via browser-native `CompressionStream('gzip')`). Decision date: 2026-05-01.
  - **Why:** As of May 2026, native brotli in `CompressionStream` is shipped in Firefox 147 and Safari 18.4, but **NOT in Chrome / Edge** (caniuse `mdn-api_compressionstream_compressionstream_brotli` shows Chrome unsupported through v150). Brotli would save ~15–25 % vs gzip on text/SVG payloads, but the savings are dwarfed by the cost of unreliable round-trips for Chrome users — who are the dominant browser among the consultant-on-locked-laptop primary persona.
  - **When to revisit:** Once caniuse shows brotli green for Chrome / Edge in `CompressionStream`. The migration is a string swap (`'gzip'` → `'brotli'`) in two functions; no architectural rework. Until then: gzip everywhere.
  - **Forward-compatibility nudge:** Worth considering a single-byte format discriminator at the head of every compressed payload (e.g. `0x01 = gzip`, `0x02 = brotli`) so future dokufix files can mix formats without breaking the decoder. Cheap insurance.

## Latent Strategic Properties (Not Features to Build, but Stories to Tell)

- **AI/LLM-friendly format by accident.** Markdown source is recoverable, HTML is plain enough for LLM ingest, MD output pastes straight back into the editor. dokufix is shaped for a 2026 AI-coauthoring world without doing anything special. Use this in marketing copy.
- **Self-distributing through the corporate firewall.** "One dokufix file through the perimeter = full authoring stack inside." This is structurally true and worth saying out loud.
- **Auditable on its own.** Version counter + timestamp + (optional) commit history + recoverable MD source = self-describing artifact. Compelling for regulated industries even though dokufix isn't pitched at them.
- **Folder of dokufix files = infrastructure-free wiki.** Latent feature, depends on stable filenames and relative-link convention.

## Marketing / Communication Hooks

- The "who has the Word file?" anecdote — primary pain anchor.
- "Body for information" — identity slogan.
- "Markdown-native, single-file, self-editing, self-replicating, no-install" — positioning summary.
- "TiddlyWiki for documents" — useful in dev-savvy circles to anchor the architectural pattern, then differentiate.
- "AI-coauthoring on a locked-down laptop without sending content to a SaaS" — forward-looking angle.

## Source Documents

- Brainstorming session: `_bmad-output/brainstorming/brainstorming-session-2026-04-30-2055.md` (24 ideas across First Principles → Resource Constraints → Zombie Apocalypse Planning, plus convergence on the Unnegotiable Six and the Action Plan).
- Product Brief: `_bmad-output/planning-artifacts/product-brief-dokufix.md`.
