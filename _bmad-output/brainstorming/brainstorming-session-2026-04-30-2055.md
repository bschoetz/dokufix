---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'dokufix — a self-editing HTML file that exports Markdown + Mermaid as a styled, editable HTML artifact'
session_goals: 'Sharpen the Minimum Viable Magic — identify the smallest set of capabilities that make dokufix uniquely valuable; 20-minute focused session'
selected_approach: 'ai-recommended'
techniques_used: ['First Principles Thinking', 'Resource Constraints', 'Zombie Apocalypse Planning']
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Ben
**Date:** 2026-04-30

## Session Overview

**Topic:** dokufix — a self-editing HTML file that is simultaneously editor, viewer, and artifact. Users edit Markdown + Mermaid inside the HTML itself and re-export a new HTML file. Optional raw-Markdown export for portability. Designed for restrictive environments (e.g. consultants on locked-down customer laptops where no tooling can be installed).

**Goals:** Sharpen the Minimum Viable Magic — find the smallest, sharpest core that makes dokufix indispensable. 20-minute focused session.

### Session Setup

_See Technique Selection section below._

## Technique Selection

**Approach:** AI-Recommended Techniques
**Sequence:**
1. **First Principles Thinking** — strip dokufix to its fundamental truths
2. **Resource Constraints** — brutal subtraction to expose the core
3. **Zombie Apocalypse Planning** — stress-test under real restrictive-environment conditions (the consultant-on-locked-laptop scenario)

**AI Rationale:** All three techniques pull *toward* essence (subtraction, not addition) — the right shape for a "Minimum Viable Magic" goal in a 20-minute window.

## Phase 1 — First Principles Thinking

### Q1 — Unverhandelbares Fundament

1. **Zero-viewer readability** — non-technical users can read Markdown content without any separate viewer (the HTML *is* the rendered doc).
2. **Editor-free update & publish** — users can update existing docs and re-publish without installing an editor.
3. **Editor-free generation** — users can generate docs without an editor when they want to avoid bloat or unintended changes (provenance / change-control).
4. **Self-contained images** — base64-embedded images make the document more practical than pure Markdown (true single-file portability).

### Q2 — Warum HTML (und nichts anderes)?

5. **Universal runtime** — every laptop has a browser; HTML+JS+CSS is the one runtime guaranteed to be present, even on locked-down corporate machines.
6. **AV-friendly** — HTML files don't trip virus scanners the way `.exe` or signed binaries do; they pass through corporate email, file shares, and download gates.
7. **Free browser superpowers** — built-in full-text search (Ctrl+F), printing, zoom, accessibility tools, dev console — dokufix inherits all of it without writing a line of code.
8. **Anchor navigation for free** — every browser handles `#anchor` jumps, so a TOC and in-doc nav comes "free with the medium".
9. **Cross-document linking with zero infrastructure** — relative `href` links between dokufix files work straight out of the filesystem (no server, no app), turning a folder of HTML files into a navigable mini-wiki.
10. **Library embedding option** — pure vanilla works, but you can also embed libs (Mermaid, Marked, etc.) inline when needed — the format scales with ambition.

### Q3 — Magische Momente (User Feeling, nicht Features)

11. **"Wait — I can edit this HTML file *itself*? Cool!"** — the surprise that the artifact you received is also the editor. Receiver-becomes-author flip.
12. **"Finally — Markdown that looks readable!"** — relief for non-technical readers who normally see raw `# headings` and `**bold**` syntax in tickets/READMEs and bounce.
13. **"Oh, the images and diagrams are already in there — that's pretty!"** — the delight that nothing is missing, no broken `![](./img.png)` links, no "where's the diagram?" ZIP-archive dance.


## Phase 2 — Resource Constraints

### Q1 — Die 1-Trigger-Regel (UI-Subtraktion)

14. **Single toggle: viewer ↔ editor (minimum, NOT the recommended UX)** — at the bare minimum, dokufix can collapse to a single mode-toggle. Switching from editor back to viewer triggers writing the new file.
15. **Auto-export is not enough — browser storage is required too** — relying only on "leave edit mode = file generated" is bad UX. dokufix needs a browser-storage layer (localStorage / IndexedDB) so unsaved edits survive accidental closes, refreshes, and crashes. The exported file is the *artifact*; browser storage is the *workbench*.

### Q2 — Der Single-File-Test (was muss draußen bleiben)

16. **Real-time multi-user cooperation is out** — concurrent editing, presence cursors, comment threads, merge handling: all impossible without a server or sync layer. Accepted tradeoff. dokufix is a single-author / sequential-handoff tool, not a Google-Docs replacement.

### Q3 — Skalierungs-Schmerzen und ihre Antworten

17. **Pure-HTML export mode** — to neutralize JS-in-attachment security concerns at scale, dokufix offers a "frozen" pure-HTML export with all JS stripped (read-only artifact for hostile environments).
18. **Built-in version counter + timestamp** — every generated file carries an incrementing version number and an export timestamp, so "which copy is current" is answerable by glancing at the file itself, not by guessing from filenames.
19. **Plaintext-grep-friendly by design** — because dokufix HTML is well-structured and the source markdown is recoverable, full-text grep across hundreds of files (ripgrep, Spotlight, even Outlook search) just works. No special index needed.
20. **Markdown export as portability escape hatch** — when content needs to leave dokufix for another system, raw markdown export is the canonical exit.
21. **Confluence / Jira markup export (future expansion)** — flexibility multiplier: one body of information, many possible "skins" for downstream systems. Makes dokufix a true authoring source-of-truth instead of a dead-end format.

### 💡 Emerging Essence Statement

> **"dokufix is a *body for information* — primarily a self-contained vessel that can also shed its skin (export markdown / Confluence markup / Jira markup) when content needs to migrate."**

This reframes dokufix from "a Markdown viewer/editor" to "a portable container for documentation that is readable everywhere, editable without tools, and exportable into any other format on demand."

## Phase 3 — Zombie Apocalypse Planning

### Q1 — Survival Workflow on a Locked-Down Customer Laptop

22. **Bootstrap via browser download or email** — the consultant pulls a single dokufix HTML file from GitHub (browser is almost always allowed) or, as fallback, mails it to themselves. This is the entire "installation".
23. **Self-replication: one file = factory for all future files** — once the consultant has *any* dokufix file open, they can use it to create new dokufix files. The format is its own bootstrapper. No second tool is ever needed in the customer environment.
24. **Tiered handover at delivery** — the consultant decides what to give the customer based on relationship:
    - **Baseline:** the resulting HTML files (artifact only — read-anywhere).
    - **Friendly:** + the markdown / Confluence / Jira exports (portable into customer systems).
    - **Generous:** + the dokufix editor file itself (customer can now author their own).

### 💡 Second Emerging Insight — Self-Replication

> **dokufix is virally self-distributing: any dokufix file is also the seed of every future dokufix file.** This eliminates the "how do I get the tool onto a locked-down machine?" problem permanently — once *one* file is through the perimeter, the entire authoring capability is too.


## Convergence — Confirmed Minimum Viable Magic

**Essence (one-sentence identity):**
> dokufix is a container format for documentation that wears HTML as its current skin, edits itself in place, replicates itself, and can shed its skin (Markdown / Confluence / Jira) when content needs to migrate.

**Confirmed MVP (the unnegotiable six):**

| # | Capability | Why it must be in MVP |
|---|---|---|
| 1 | Readable rendering of Markdown + Mermaid + base64-embedded images in the browser | Without this, it isn't a viewer at all. |
| 2 | In-place editor with viewer ↔ editor toggle | The unique-selling-point — receiver becomes author. |
| 3 | Browser-storage workbench + auto-export to a new HTML file on leaving editor mode | Edits must survive crashes; the artifact is the file, the workbench is the storage. |
| 4 | Markdown export as portability escape hatch | The "body" must be able to shed its skin. |
| 5 | Self-replication: any dokufix file can spawn a new empty dokufix file | Permanently solves bootstrapping into restricted environments. |
| 6 | Built-in version counter + timestamp on every export | Answers "which copy is current?" by glance, not guesswork. |

**Explicitly out of MVP (deferred or accepted as lost):**
- Real-time multi-user collaboration → accepted tradeoff (single-author tool)
- Confluence / Jira markup export → deferred to v2 (flexibility multiplier, not core)
- Pure-HTML / JS-stripped export → deferred to v2 (security hardening, not core)
- Plugin system, themes, customization → not in scope for MVP

**Two breakthrough framings discovered in session:**
1. **"Body for information"** — dokufix is a container, not an editor. This reframes the whole product.
2. **Viral self-distribution** — one dokufix file through the corporate perimeter = full authoring stack inside. The format is its own bootstrapper.

## Action Plan — Suggested Next Steps

1. **Validate the core toggle UX** — sketch the editor↔viewer transition (this is the most critical UX touchpoint, and "single toggle" was flagged as a minimum, not a recommendation).
2. **Decide browser-storage layer** — localStorage vs IndexedDB; what survives a tab close, what doesn't, and what triggers export.
3. **Design the version-counter + timestamp metadata block** — where it lives in the file, how it's incremented, whether it's user-visible or just embedded.
4. **Prototype self-replication** — the smallest demo that proves "this dokufix file can produce a new empty dokufix file" works.
5. **Capture the essence statement** in the project README so future feature decisions can be tested against "does this serve the body, or does it bloat the skin?"

