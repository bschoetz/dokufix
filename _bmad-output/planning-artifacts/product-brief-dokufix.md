---
title: "Product Brief: dokufix"
status: "complete"
created: "2026-04-30T21:55:23+02:00"
updated: "2026-04-30T22:15:00+02:00"
inputs:
  - _bmad-output/brainstorming/brainstorming-session-2026-04-30-2055.md
---

# Product Brief: dokufix

## Executive Summary

**dokufix is a single self-contained HTML file that is simultaneously the viewer, the editor, and the artifact for technical documentation.** Open it in any browser — read it, edit it, export a new version. No installation, no account, no server, no plugin, no internet. Markdown is the canonical format; Mermaid diagrams and base64-embedded images render natively; plain Markdown can be exported at any time as the portability escape hatch.

The product targets a chronic, universal pain that every consultant, technical writer, and policy owner has lived through: **a PDF circulates for years, but nobody can find — or trust — the source document it was generated from.** dokufix collapses the source, the viewer, and the deliverable into a single file that anyone can open and any author can update, even on locked-down corporate machines where no tooling can be installed.

dokufix is positioned as an open-source side project on GitHub. There is one architectural cousin worth naming honestly — TiddlyWiki — but its WikiText-first model, its plugin-based Markdown story, and its notoriously fragmented save UX make it a fit for personal wikis, not for transactional documentation handoff. dokufix occupies a different shape: **document, not wiki; Markdown-native, not WikiText; one file in your hand, not a knowledge base in your head.**

## The Problem

Every organization that produces written guidance lives some version of the same farce:

> *"We need to update the security policy."*
> *"OK — who has the Word file?"*
> *"All I can find is the PDF."*
> *"…"*

The PDF is everywhere. The source document is nowhere. Nobody knows who edited it last, where they saved it, or whether the version they had was current. Updating a document becomes an archaeology project before it becomes an editing project.

This isn't a tooling-poverty problem — it's the *opposite*. Modern documentation stacks (Confluence, Notion, SharePoint, MkDocs, Obsidian) are powerful, but they are also infrastructure: they require accounts, install rights, network access, and ongoing administration. They solve the "team writes a knowledge base" problem and create a new problem: the moment a document needs to leave the team — emailed to a customer, handed to an auditor, attached to a ticket on a locked-down laptop — the rich-tool world stops at the perimeter and the world of frozen PDFs begins.

The cost of this gap is paid daily:

- **Consultants on customer machines** can't install editors, can't reach SaaS tools, and end up writing into Notepad and emailing themselves Markdown they hope renders somewhere.
- **Non-technical readers** receive Markdown files and bounce off raw `# heading` and `**bold**` syntax, so authors get pressured into Word — and the version-source loop closes again.
- **Long-lived documents** (policies, runbooks, architecture decisions, customer-facing how-tos) drift away from their sources within months of publication.

The status quo is "publish a PDF, lose the source." dokufix exists to break that loop.

## The Solution

dokufix is one HTML file. You download it. You open it in any modern browser. It looks like a clean, rendered document — Markdown headings, Mermaid diagrams, embedded images, a navigable table of contents. Hit a key (or click a single toggle) and the same file flips into edit mode: a Markdown editor with live preview and an IndexedDB-backed local workbench, so edits persist across tab closes, refreshes, and crashes — without ever leaving the browser. When the author is ready to publish, an explicit save action writes a new HTML file containing the current state. Saving is always a deliberate act; leaving edit mode is not a save.

If the content needs to leave dokufix — to flow into Confluence, into a Git repo, or into another author's editor — there is a **plain Markdown export with the user in control of how images travel** (inline as `data:` URIs for true single-file portability, as a sibling folder of files, or bundled as a ZIP, depending on what the destination system needs). The HTML is the current skin; the Markdown underneath is always recoverable.

And because every dokufix file *is* the editor, **a single dokufix file is the only thing a new user ever needs to receive.** From that one file they can spawn a new, empty dokufix file and begin authoring their own. The format is its own bootstrapper: get one file through the corporate firewall, and the entire authoring stack is on the inside.

A version counter and an export timestamp live **inside** every generated dokufix file (not in the filename), which keeps filenames stable across exports — so a folder of dokufix files can cross-link via plain `<a href="other-doc.html">` and the links survive every revision.

The experience is deliberately small:

- One file in your filesystem.
- One toggle between read and edit.
- One **deliberate** save action that produces a new versioned HTML file (with an optional commit message, so the document accumulates its own version history).
- One escape hatch that produces clean Markdown (with explicit image-handling choice).
- One built-in version counter and timestamp inside the file so you can tell at a glance which copy is current.

That is dokufix. Everything else is bloat.

## What Makes This Different

| | Confluence / Notion / HedgeDoc | Obsidian / MkDocs / Quarto | StackEdit / Markdeep / Marp | TiddlyWiki | **dokufix** |
|---|---|---|---|---|---|
| Works on a locked-down laptop with no install | ❌ | ❌ | ⚠️ partial | ✅ | ✅ |
| One file in, one file out | ❌ | ❌ | ⚠️ viewer-only | ✅ | ✅ |
| Edit without a separate editor | ❌ | ❌ | ❌ | ✅ | ✅ |
| Markdown-native (not via plugin) | ⚠️ | ✅ | ✅ | ❌ | ✅ |
| Mermaid built-in | ⚠️ | ⚠️ plugin | ❌ | ❌ plugin | ✅ |
| Plain Markdown export as escape hatch | ⚠️ | ✅ | ✅ | ❌ awkward | ✅ |
| Designed for transactional handoff, not as a knowledge base | ❌ | ❌ | ⚠️ | ❌ | ✅ |
| Sane save UX (no extension/desktop-app/server) | n/a | n/a | n/a | ❌ | ✅ |

The closest architectural cousin is **TiddlyWiki** — the same single-file self-modifying HTML pattern, alive and maintained for two decades. dokufix differs in three meaningful ways:

1. **Markdown is the canonical format**, not a plugin overlay on WikiText. Every consultant, developer, and technical writer already knows Markdown; nobody learns WikiText for a one-off document.
2. **The save story is a single path**, not a five-option matrix. dokufix uses IndexedDB as the workbench so edits persist across crashes and refreshes, and the user explicitly publishes a new HTML file when they choose to — no TiddlyDesktop, no browser extension, no Node server, and no surprise saves on tab switch.
3. **The shape is "document," not "wiki."** TiddlyWiki is a personal knowledge base of small interlinked tiddlers; dokufix is a deliverable. One file = one document. Closer to a Word file than a Notion workspace.

The deeper unfair advantage is **virality through self-replication**. Once any dokufix file is on a machine, every future dokufix file can be authored from inside it. The "how do I install the tool?" problem disappears permanently. No competitor in this space is shaped to take advantage of that — TiddlyWiki has the architecture but not the use-case framing; everyone else has the use-case but not the architecture.

### Built for the AI-Authoring Era

dokufix is shaped, almost incidentally, for how documents are written and read in 2026. The HTML carries readable Markdown source inside it; the Markdown export is canonical and clean; nothing is locked behind proprietary serialization. That means:

- **An LLM can ingest a dokufix file directly** and produce a faithful summary, a redlined revision, or a translated version, without intermediate conversion.
- **An LLM can produce content** that pastes straight into dokufix's editor and renders correctly on first try — Markdown + Mermaid is the lingua franca of LLM output today.
- **Authors get human + AI co-authoring on a locked-down laptop** without sending document content to a SaaS — the LLM can run anywhere, dokufix runs in the browser, the file never leaves the user's control.

This is not a feature to build; it is a property the format already has. The brief calls it out because it is one of the strongest latent advantages dokufix carries into the next few years.

### Auditable on its Own

Every dokufix file carries its own version counter, its own export timestamp, its own recoverable Markdown source, and — optionally — its own commit-message history, captured at the moment of each save. That means a dokufix file in an email attachment, on a USB stick, or in a regulator's evidence folder is **self-describing**: you can open it and answer *which version is this*, *when was it generated*, *why was each change made*, and *what is the canonical text* without consulting any external system.

For regulated environments — policy documents, SOPs, audit trails, regulatory submissions — this property turns dokufix from "convenient" into "fit for purpose." The artifact, its provenance, and its change history are the same file.

## Who This Serves

**Primary user — the Consultant on the Customer Laptop.**
A consultant arrives on site, is handed a locked-down laptop, and is asked to produce a 30-page architecture document with diagrams. They cannot install anything. Email and a browser are all they have. They download a dokufix file from GitHub (or mail it to themselves), open it, and write. At handover, they email the customer a self-contained HTML — and, depending on relationship, also the plain Markdown and a blank dokufix file the customer can use to keep authoring. The consultant's success looks like: *delivering a doc the customer can read on day one and update on day three hundred.*

**Secondary user — the Author Whose Reader Hates Markdown.**
A developer, policy owner, or technical writer needs to hand a document to someone non-technical — a manager, a client, an auditor — without forcing them to install a viewer, learn a syntax, or trust a SaaS. dokufix lets them send one file that "just opens" and looks like a real document. Their success looks like: *the recipient reads it, doesn't ask "how do I open this?", and can lightly edit if needed.*

**Tertiary user — the Solo Author Tired of the Source-Loss Loop.**
The person who has been burned one time too many by "the PDF is everywhere but the Word file is gone." They want one file that is both the readable artifact and the editable source — and that they can still get clean Markdown out of when life demands it.

## Success Criteria

This is an open-source side project; success is not measured in MRR or seat counts. It is measured in moments where the source-loss loop stops happening:

- **Lived-experience signal (the north star):** the author of dokufix uses it on real consulting engagements without falling back to Word, and recipients can actually re-open and update the documents months later. If this fails, nothing else matters.
- **Adoption signal:** GitHub stars and forks at a level consistent with other indie self-contained tools (qualitative — "the right kind of people are finding it").
- **Replacement signal:** unsolicited reports from users that they used dokufix to retire a Word→PDF pipeline at their organization.
- **Endurance aspiration (vision-level, not v1 commitment):** a dokufix file generated in version N+0 still opens, renders, and round-trips through edit/export in version N+5. v1 lays the groundwork; durable backward compatibility is a long-term ambition, not a launch promise.

Explicitly *not* a success metric: feature count, plugin ecosystem size, Hacker News rank.

## Scope

**In, for the first version (the unnegotiable six):**

1. Readable rendering of Markdown + Mermaid diagrams + base64-embedded images in any modern browser.
2. In-place editor with a viewer ↔ editor toggle.
3. IndexedDB-backed workbench so edits persist across tab closes, refreshes, and crashes — and an explicit, user-initiated save that writes a new HTML file (with optional commit message captured into the file's embedded version history). Auto-save is opt-in only, never the default.
4. Plain Markdown export as the portability escape hatch, with explicit user choice over how images travel: `data:` URIs inline, sibling files, or bundled ZIP.
5. Self-replication: any dokufix file can spawn a new, empty dokufix file.
6. Built-in version counter and export timestamp embedded **inside the file** (so filenames stay stable and cross-document links survive revisions).

**Also part of the v1 launch surface (not part of the artifact, but part of the project):**

- A README on the GitHub repo that explains the product in one screen.
- A live demo dokufix file hosted via GitHub Pages so first-time visitors can open and play with one before downloading.

**Explicitly out, for the first version:**

- Real-time multi-user collaboration. Accepted tradeoff — dokufix is a single-author, sequential-handoff tool. If you need collaborative editing, use a different product.
- Confluence / Jira markup export. Deferred to v2. Attractive multiplier, but not core to the source-loss-loop story.
- Pure-HTML / JS-stripped export for hostile environments. Deferred to v2 once the core UX has stabilized.
- Plugin systems, theme marketplaces, syntax extensions. Not in scope, possibly never.

**Technical approach (high level):**

- External, well-maintained libraries for Markdown parsing (Marked) and Mermaid rendering — no reinvention of those wheels. Embedded into the artifact, not loaded from a CDN, so the file works offline.
- Vanilla JavaScript for layout and editor chrome to keep the file lean.
- A small build script bundles all sources into a single distributable HTML.
- License will be chosen to remain compatible with the embedded libraries (likely MIT or Apache 2.0).
- Distribution: GitHub releases + a Pages-hosted live demo file.

## Risks

The honest risk is not technical. It is **scope discipline.**

The product owner has explicitly named this risk: *"that I keep having new ideas that are toootaaaally genius and definitely not feature creep."* dokufix's value proposition is small-and-sharp; its biggest threat is the temptation to grow into a TiddlyWiki-style universal-purpose container. Every feature added past the unnegotiable six erodes the simplicity that makes the product worth using on a locked-down laptop in the first place.

Mitigation is structural: the **"body for information"** framing — *the HTML is the current skin; everything that wants to be added must serve the body, not bloat the skin* — is the single test every future feature must pass.

Secondary risks worth naming:

- **Browser save model edge cases.** Each explicit save downloads a new HTML, which produces filename-collision questions and "is this overwrite or new version?" confusion. Solvable with a stable filename, the in-file version counter, an optional commit message, and a clear "saved as" prompt — but UX work is needed.
- **File-size growth from base64-embedded images.** Acceptable for typical documents (≤30 pages, modest imagery), problematic for image-heavy reports. Out-of-scope to fully solve in v1 — document the limit clearly in the README.
- **TiddlyWiki overlap perception.** Users who already know TiddlyWiki may dismiss dokufix as "TiddlyWiki with Markdown." The README and the launch communication must explicitly acknowledge TiddlyWiki and explain the different shape (transactional document, not personal wiki).

## Vision

If dokufix succeeds, the small win is that some number of authors stop losing their source documents. The larger win is a category shift in how organizations think about documents-as-artifacts:

- **A folder of dokufix files becomes an infrastructure-free wiki.** Cross-document `<a href="...">` links between dokufix HTMLs work straight off the filesystem — no server, no platform, no admin. Confluence-shaped knowledge without Confluence-shaped overhead.
- **The document is its own provenance.** Version counter, timestamp, optional commit-message history, and recoverable Markdown source mean a dokufix file is auditable on its own — no separate "where is the source" question, and no separate "why was this changed" question either.
- **The format becomes a quiet default** for the kind of documentation that should outlive the tooling that created it: policies, runbooks, architecture decision records, consultant deliverables, regulatory submissions.

The broader story dokufix tells is older than software: documents should be readable without a reader, editable without an editor, and theirs to keep — not the platform's. dokufix is one small, sharp implementation of that idea.
