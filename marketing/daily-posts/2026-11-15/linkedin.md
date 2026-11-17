When preparing codebase context for an AI assistant, raw chat logs and naive file dumps fail for the same reason: they treat all tokens as having equal priority.

If you paste an entire 40,000-token conversation history into Claude or ChatGPT to resume work, obsolete debugging chatter and dead-end stack traces crowd out the architectural invariants. When the context window fills up, critical constraints get silently clipped.

Today we closed out Slices 9 and 10 of Project Passport, completing our local-first context packaging and checkpoint engines. This brings our test suite to 606 passing Vitest unit tests across 55 files, running completely client-side in the browser.

To solve context dilution across models with different context economics (from a 6k Lite paste to a 100k Gemini export), we implemented a deterministic 4-tier priority budgeter:

• Tier 1 (Sacred Baseline): Tech stack, architectural rules, current project status, and immediate next action. This tier is never trimmed; if Tier 1 alone exceeds the target budget, the export immediately flags an over-budget error.
• Tier 2 (Active Work): Active decisions, pending checklist tasks, open bugs, and open questions.
• Tier 2b: Superseded decisions and completed historical items.
• Tier 3 (Files): Included codebase files in manifest priority order. Files are bundled whole—the budgeter stops cleanly at the first file that exceeds the remaining allowance, preserving priority.
• Tier 4 (Conversations): Recent conversation turns, ordered newest-first, truncated strictly at turn boundaries rather than splitting midway through a message.

To make full package export reproducible, archive bundling runs off-thread in a Web Worker with JSZip using a fixed timestamp (2026-01-01T00:00:00.000Z). This guarantees identical project states yield byte-for-byte deterministic archives and matching SHA-256 manifests.

Before any zip or prompt is generated, a client-side Secret Gate scans files, conversations, and passport text for unredacted credentials (AWS, GitHub, Google API keys), preventing accidental leakage to external LLMs.

When switching LLM sessions or coding agents, how do you decide which historical artifacts get trimmed first?

#SoftwareEngineering #LocalFirst #WebDev #BuildInPublic
