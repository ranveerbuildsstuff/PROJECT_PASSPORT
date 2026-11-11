1/ The hardest part of building software with AI isn't prompting—it's context drift.

After 20+ turns with an LLM, context gets bloated with compiler errors and dead-end debugging loops. The model starts hallucinating interfaces you deleted hours ago.

Chat history is the wrong abstraction for project state.

2/ When you switch models (or hit a rate limit), pasting raw chat transcripts is the worst way to restore context:
- It wastes 30k+ tokens on transient debugging chatter
- Dilutes architectural rules
- Creates prompt injection and token window bottlenecks

An LLM needs a structured manifest, not your chat log.

3/ I'm building Project Passport to solve this: an open-source, local-first web app that packages portable project state for AI handoffs.

Core rule: The AI is replaceable; the project is not.

No accounts. Zero cloud telemetry. Everything lives in IndexedDB on your machine.

4/ Current build status (Day 3, Slices 0-4b done):
• Zod domain schema with 7-point readiness score
• Dexie local storage with atomic rollback transactions
• 11-section editor with debounced autosave & live preview
• 103 Vitest unit tests + 68 Playwright E2E tests (desktop + 360px mobile)

5/ Tomorrow we ship Slice 5: capture prompts that teach recipient LLMs how to extract and synthesize structured passport JSON directly from existing chats.

Documenting the full architecture journey in public.

Engineers pairing with LLMs daily: how do you currently preserve architectural intent across long sessions?
