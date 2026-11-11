The hardest part of building software with AI isn't prompt engineering. It’s context drift.

Anyone who has spent three consecutive days pairing with an LLM on a non-trivial codebase knows this pattern:

In hour 1, the model is sharp. It respects your architectural boundaries, remembers your stack constraints, and writes clean code. 

By hour 20, the conversational context is bloated with hundreds of lines of ephemeral compiler traces, terminal outputs, and obsolete implementation attempts. The model starts hallucinating interfaces you deleted yesterday. It forgets that your storage layer has an atomic rollback requirement. It suggests dependencies you explicitly ruled out on day one.

And if you hit a rate limit or want to switch from Claude to ChatGPT or a specialized coding agent? You’re back at square zero, spending 45 minutes manually re-explaining your project from scratch.

Chat history is simply the wrong abstraction for project state.

An LLM doesn’t need your 80 conversational turns to be effective. It needs high-density, structured ground truth:
— The active architectural decisions and the exact reasoning behind them
— The current tech stack and version constraints
— The completed milestones versus open bugs
— A hash-verified file manifest
— A single, unambiguous next action

Over the past three days, I started building Project Passport to solve this. It's an open-source, local-first web application designed to create portable, structured handoff packages for AI-assisted projects.

The core philosophy is simple: The AI is replaceable; the project is not.

Because project context often touches proprietary code and private discussions, we established strict architectural constraints from commit #1:
1. Zero outbound network traffic. Everything runs in the browser via Dexie (IndexedDB). No backend servers, no analytics, no third-party telemetry.
2. Transactional integrity on the client. Every multi-table mutation (projects, passports, files, checkpoints) runs inside an atomic Dexie read-write transaction (`db.transaction('rw', ...)`). If anything fails, state rolls back cleanly without database corruption.
3. Schema authority through Zod. Runtime validation and TypeScript types are derived strictly from pure schemas in the domain layer, keeping UI primitives completely decoupled from storage logic.

As of today (Day 3), we’ve completed Slices 0 through 4b:
— Complete domain model with a 7-point handoff readiness score
— Resilient local storage layer with full database backup and atomic conflict resolution
— Accessible design system with dark/light palettes (zero axe-core violations)
— Multi-section passport editor with debounced autosave (600ms) and live markdown preview
— 103 Vitest unit tests and 68 Playwright E2E browser tests passing across desktop and 360x640 mobile viewports

Tomorrow, we tackle Slice 5: generating the capture prompts that instruct recipient LLMs how to parse and synthesize passport state directly from conversational history.

I’m documenting the entire engineering journey in public—the architecture decisions, the bugs that bit us, and the trade-offs of building local-first tools in the browser.

For those using AI assistants on complex codebases: How do you currently prevent architectural drift across long-running conversations? Do you keep a manual state markdown file, or do you restart fresh chats every few hours?

#SoftwareEngineering #WebDevelopment #LocalFirst #BuildInPublic
