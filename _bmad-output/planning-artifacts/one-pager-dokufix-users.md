# Stop Losing the Word File Behind Your PDF

## The Problem

You wrote the policy. You exported it to PDF. Six months later, someone needs to update it — and nobody can find the source. The PDF is in every inbox. The Word file is on a laptop that left the company in March.

You face this loop every time you write a document that outlives a project. **Source documents disappear, PDFs survive, and updates become archaeology.** Modern tools — Confluence, Notion, SharePoint, Obsidian — want accounts, install rights, and network access. None of that travels through a customer's locked-down laptop, an auditor's USB stick, or a regulator's email inbox.

So your most important documents end up frozen as PDFs, with the editable source slowly drifting into nowhere.

## The Solution

**dokufix is a single self-contained HTML file that is the viewer, the editor, and the artifact — all at once.** You download one file. You open it in any browser. You read it, you edit it, you save a new version. No installation. No account. No server. No internet required.

- **Markdown-native, Mermaid built-in** — write what you already know how to write. Diagrams and embedded images render automatically, no plugins.
- **One file, fully offline** — the Markdown parser and the diagram renderer are bundled inside. Open the file on a plane, on a customer laptop, anywhere.
- **Viewer ↔ editor toggle** — the same HTML you open to read is the one you open to edit. An IndexedDB workbench keeps your edits safe across crashes; you save explicitly when you are ready to publish.
- **Self-replicating** — any dokufix file can spawn a new, blank dokufix file. Get one file through a corporate firewall, and the whole authoring stack is now inside.
- **Push your content into any system** — clean Markdown export ships today; Confluence and Jira markup are next on the roadmap. **Write your document once, then feed it into whichever system needs it.** No platform lock-in.
- **The document knows its own history** — optional commit messages on save are written directly into the file. Version counter, timestamp, and change log all live inside the artifact.

## What You Get

| Without dokufix | With dokufix |
|---|---|
| Lose the Word file behind every PDF | Keep **one file** that is both the readable doc *and* the editable source |
| Email three artifacts (doc + images + diagrams) | Send **one** HTML — images and diagrams baked in |
| Install Word, Notion, or Obsidian on a locked-down laptop | Open a browser. **That is the entire toolchain.** |
| Wonder which version is current | Read it off the file — version counter, timestamp, and change log live inside |
| Trust that the format will still open in 2030 | Trust HTML. Trust Markdown. **Both will outlive the next ten document platforms.** |

> dokufix is a **body for information.** The HTML is the current skin. Plain Markdown stays underneath, exportable any time — your content is always yours, never the platform's.

## Try It

Download the latest dokufix from the GitHub release page, open it in your browser, and start writing. The file you just downloaded is also the editor for every dokufix file you will ever create.

→ **github.com/&lt;repo-path&gt;/dokufix** — open source, no signup, no telemetry, no server. Just a file.
