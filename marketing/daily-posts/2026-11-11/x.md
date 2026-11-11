The hardest part of building software with AI isn't prompting—it's context drift.

After 20+ turns with an LLM, context gets cluttered with dead-end traces. The model starts hallucinating deleted interfaces.

Chat history is the wrong abstraction for project state.

---

When switching models or hitting rate limits, pasting raw transcripts is the worst way to restore context:
• Burns 30k+ tokens on debugging chatter
• Dilutes architectural rules
• Causes model confusion

An LLM needs a structured manifest, not a raw chat transcript.

---

I'm building Project Passport to fix this: an open-source, local-first web app packaging portable project state for AI handoffs.

Core rule: The AI is replaceable; the project is not.

Zero accounts. Zero cloud telemetry. Everything lives in IndexedDB on your machine.

---

Current build status (Day 3, Slices 0-4b done):
• Zod domain schema with 7-point readiness score
• Dexie local storage with atomic rollback
• 11-section editor with debounced autosave (600ms)
• 103 Vitest unit tests + 68 Playwright E2E tests (desktop + 360px mobile)

---

Next up is Slice 5: capture prompts teaching recipient LLMs how to extract structured passport JSON directly from chats.

Documenting the full architectural journey in public.

Engineers pairing with LLMs: how do you prevent architectural drift across sessions?
