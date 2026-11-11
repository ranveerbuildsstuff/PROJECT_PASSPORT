The hardest part of building software with AI isn't prompt engineering. It’s context drift.

In hour 1 of pairing with an LLM on a codebase, the model is sharp. It respects your architecture, remembers stack constraints, and writes clean code.

By hour 20, context is bloated with ephemeral compiler traces and dead-end attempts. The model starts hallucinating deleted interfaces, forgets your storage layer's rollback rules, and suggests dependencies you explicitly ruled out.

Switching models or hitting a rate limit puts you back at square zero, spending 45 minutes re-explaining project state.

Chat history is simply the wrong abstraction for project state.

An LLM doesn’t need your 80 conversational turns. It needs high-density, structured ground truth:
— Active architectural decisions and their trade-offs
— Version constraints and stack invariants
— Completed milestones vs. open bugs
— A hash-verified file manifest
— A single, unambiguous next action

Over the past three days, I started building Project Passport: an open-source, local-first web app that creates portable, structured handoff packages for AI-assisted engineering.

The core philosophy: The AI is replaceable; the project is not.

Because project context touches proprietary code, we enforced strict rules from commit #1:
• Zero outbound network traffic: runs locally in the browser via Dexie (IndexedDB). No backend, no telemetry.
• Client-side transactional integrity: every multi-table mutation runs in an atomic Dexie read-write transaction (`db.transaction('rw', ...)`), rolling back cleanly on failure.
• Schema authority through Zod: runtime validation and TypeScript types derive strictly from pure schemas in the domain layer.

As of today (Day 3), Slices 0 through 4b are complete:
• 11-section passport editor with 600ms debounced autosave, auto-growing textareas, and live markdown preview
• 7-point handoff readiness score and token estimator
• Full JSON backup and restore with atomic conflict resolution
• 103 Vitest unit tests + 68 Playwright E2E browser tests passing (desktop + 360px mobile, 0 a11y violations)

Tomorrow: Slice 5 (capture prompts teaching recipient LLMs how to extract structured passport JSON directly from chats).

Documenting the entire journey in public.

For engineers pairing with LLMs on non-trivial codebases: How do you currently prevent architectural drift across long sessions?

#SoftwareEngineering #LocalFirst #WebDev #BuildInPublic