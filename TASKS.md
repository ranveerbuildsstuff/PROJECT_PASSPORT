# TASKS.md — Slice Task Lists

> **Working Rule:** Build ONLY the slice explicitly requested by the user. Mark that slice as **`[CURRENT]`** while working. Do not build ahead.

---

## Slice 1: Scaffold + Domain Model

- [x] Initialize Vite app with React 18+ and TypeScript in strict mode.
- [x] Configure Tailwind CSS with custom design tokens from `DESIGN.md` (colors, fonts, radius).
- [x] Configure ESLint and Prettier with strict linting rules.
- [x] Configure Vitest and React Testing Library for testing.
- [x] Set up package scripts: `dev`, `build`, `typecheck`, `lint`, and `test`.
- [x] Configure typography tokens for Inter and JetBrains Mono (font packages deferred to Slice 3 per user instruction).
- [x] Implement placeholder home page route with React Router and write an RTL smoke test.
- [x] In `src/domain/passport.schema.ts`, implement Passport Schema v1 using Zod (`schemaVersion: 1`).
- [x] Derive static TypeScript types using `z.infer`.
- [x] Implement `createEmptyPassport()` generating a valid default passport object with UUID and timestamps.
- [x] Implement `validatePassport(data)` returning typed results with user-friendly plain-language error messages.
- [x] Implement `migratePassport(data)` validating v1 schema and ready for forward compatibility.
- [x] Implement `computeReadiness(passport)` returning 0–100 score across the 7 required checks.
- [x] Implement `estimateTokens(text)` calculating `Math.ceil(length / 4)`.
- [x] Implement `passportToMarkdown(passport)` with stable section ordering, omitting empty sections.
- [x] Create synthetic fixture (e-commerce project) in `tests/fixtures/ecommerce-passport.json` with a descriptive `README.md`.
- [x] **Tests added:** Unit tests for schema validation, empty factory, plain-language error formatting, migration, readiness scoring, token estimation, and markdown conversion.
- [x] **Docs updated:** Update `PROGRESS.md` with implementation details and decisions.
- [x] **Commit message:** `Slice 1: scaffold + domain model`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass with zero errors.
- All domain functions have 100% unit test coverage.
- Placeholder home page renders and passes smoke test.

---

## Slice 2: Local Storage & Service Layer

- [ ] Install Dexie and `fake-indexeddb` (for test suite).
- [ ] In `src/storage/db.ts`, declare the Dexie database schema for passports, checkpoints, files, and conversation metadata.
- [ ] In `src/storage/passportService.ts`, implement CRUD operations for project passports.
- [ ] Implement transactional integrity for passport mutations and metadata updates.
- [ ] Implement single-project JSON backup export and restore operations.
- [ ] Implement full database dump and restore mechanism with schema version verification.
- [ ] Provide storage quota query utility and human-readable size formatting.
- [ ] Write integration tests for storage operations using `fake-indexeddb`.
- [ ] **Tests added:** Unit and integration tests for CRUD, transactional updates, single-project backup/restore, and full database export/import.
- [ ] **Docs updated:** Document storage schema and service methods in `PROGRESS.md`.
- [ ] **Commit message:** `Slice 2: local storage and service layer`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- CRUD operations, backup, and restore functions are completely verified against `fake-indexeddb`.
- No storage logic leaks into React components (service layer isolation strictly maintained).

---

## Slice 3: App Shell, Design System & Dashboard

- [ ] Install `lucide-react` for system iconography.
- [ ] Implement core UI primitives in `src/ui/`: `Button`, `Card`, `Badge` (stamp badge), `Tabs`, `EmptyState`, `Toast`, and `ProgressRing`.
- [ ] Implement dark/light theme switching with CSS variables and local storage persistence.
- [ ] Implement responsive App Shell with mobile-first navigation bar (360x640 support, touch targets >= 44px).
- [ ] Implement Dashboard view listing all local projects with status badges, readiness rings, and last updated timestamps.
- [ ] Implement "Create New Project" modal with validation and immediate routing to the new project.
- [ ] Implement "Delete Project" confirmation modal with plain-language warning.
- [ ] Implement empty state for dashboard when no projects exist.
- [ ] **Tests added:** Component tests for UI primitives, theme toggle, and dashboard project listing/creation/deletion.
- [ ] **Docs updated:** Record theme tokens and UI component patterns in `PROGRESS.md`.
- [ ] **Commit message:** `Slice 3: app shell, design system and dashboard`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- Projects can be created, navigated, and deleted from the dashboard.
- Theme switching toggles seamlessly between dark and light palettes.
- Mobile layout verified at 360px width without layout breakage.

---

## Slice 4: Passport Editor & Live Preview

- [ ] Implement form controls in `src/ui/`: `Input`, `Textarea`, select dropdowns, and key-value item lists.
- [ ] Create multi-section Passport Editor tabbed or stepped layout (Project info, Stack, Decisions, Tasks, Bugs, Instructions).
- [ ] Implement dynamic array editors for stack entries, requirements, decisions, tasks, and bugs.
- [ ] Implement plain-language inline validation feedback as fields change.
- [ ] Implement auto-save to Dexie with debouncing and subtle save status indicator.
- [ ] Implement Live Markdown Preview panel displaying formatted passport state via `passportToMarkdown`.
- [ ] Implement real-time Readiness Score ring updating dynamically as the user fills in sections.
- [ ] Implement responsive split-pane or toggle view between Editor and Preview on mobile viewports.
- [ ] **Tests added:** Unit and component tests for form state management, debounced autosave, validation indicators, and markdown preview updates.
- [ ] **Docs updated:** Document editor architecture and form state handling in `PROGRESS.md`.
- [ ] **Commit message:** `Slice 4: passport editor and live preview`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- All passport schema fields can be edited and are persisted to IndexedDB.
- Readiness ring updates immediately when editing required fields.
- Form displays clear plain-language errors on invalid inputs.

---

## Slice 5: Capture Prompt, Reconstruct Prompt, Paste-back & Merge

- [ ] In `src/export/prompts.ts`, implement `generateCapturePrompt()` strictly enforcing Schema v1 formatting.
- [ ] Implement `generateReconstructPrompt(conversations, tokenBudget)` with token cap warning.
- [ ] Implement Capture Dialog with one-click prompt copying and clear step-by-step instructions.
- [ ] In `src/import/jsonExtractor.ts`, implement pure JSON extraction handling markdown code fences, raw text, smart quotes, and trailing prose.
- [ ] Implement validation runner for extracted JSON providing plain-language explanations on failures.
- [ ] Implement section-by-section Merge UI showing diffs and controls for Replace / Merge / Skip per section.
- [ ] Implement automatic checkpoint creation before applying any paste-back merge.
- [ ] **Tests added:** Unit tests for prompt generation, resilient JSON extraction, edge-case parsing (smart quotes, trailing comments), and merge logic.
- [ ] **Docs updated:** Note prompt templates and extraction heuristics in `PROGRESS.md`.
- [ ] **Commit message:** `Slice 5: capture prompt, reconstruct prompt, paste-back and merge`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- Prompts generate correctly with strict instructions.
- Malformed and smart-quoted JSON strings are parsed reliably without uncaught exceptions.
- Merge UI allows selective section replacement and creates an auto-checkpoint before mutating.

---

## Slice 6: Conversation Paste Import

- [ ] In `src/import/pasteParser.ts`, implement speaker marker detection at line start (`You said:`, `ChatGPT said:`, `User:`, `Assistant:`, etc.).
- [ ] Implement fallback single-block parser when no known speaker markers are present.
- [ ] In `src/ui/`, build Conversation Viewer displaying parsed message turns with role badges.
- [ ] Implement manual message editing tools: role flipping (User ↔ Assistant), message splitting, and merging.
- [ ] Implement token estimation per message and total conversation token counter (labeled "estimate").
- [ ] Store imported conversation in Dexie and link reference to the active passport.
- [ ] **Tests added:** Unit tests for speaker detection regexes, role flipping, splitting/merging operations, and conversation token estimation.
- [ ] **Docs updated:** Document conversation data structure and parser rules in `PROGRESS.md`.
- [ ] **Commit message:** `Slice 6: conversation paste import`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- Pasted transcripts from ChatGPT, Claude, and Gemini parse cleanly into structured message lists.
- Users can correct speaker roles and split/merge turns in the UI.

---

## Slice 7: ChatGPT & Claude Export Import

- [ ] In `src/import/chatgptParser.ts`, implement tree traversal for ChatGPT `conversations.json` (mapping nodes via `current_node`).
- [ ] Implement node filtering to exclude empty, system, and hidden messages (with toggle control).
- [ ] Implement placeholder substitution for non-text parts (e.g. `[image]`).
- [ ] In `src/import/claudeParser.ts`, implement parsing for Claude export format (`uuid`, `chat_messages`).
- [ ] Implement diagnostic fallback panel when unknown or malformed export formats are detected.
- [ ] Move heavy JSON parsing to a Web Worker (`src/import/parser.worker.ts`) to avoid UI freeze.
- [ ] Implement memory check and warning banner when file size exceeds 300 MB.
- [ ] Implement conversation selection modal allowing users to attach specific conversations to the passport.
- [ ] **Tests added:** Unit tests for ChatGPT tree reconstruction, Claude JSON parsing, worker communication, and malformed JSON diagnostic reporting.
- [ ] **Docs updated:** Document export schemas and parser edge-cases in `PROGRESS.md`.
- [ ] **Commit message:** `Slice 7: ChatGPT and Claude export import`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- ChatGPT and Claude export files import correctly through a Web Worker.
- Corrupted or unrecognized files trigger the diagnostics view without crashing the app.

---

## Slice 8: Project Files & Secret Scanner

- [ ] Implement file import handling: single/multi-file picker, folder directory upload, and zip archive upload.
- [ ] Implement user-editable default ignore list (`.git`, `node_modules`, `dist`, lockfiles, binaries, media, files > 500 KB).
- [ ] Enforce security hard-block on prohibited filenames (`.env*`, `*.pem`, `*.key`, `id_rsa*`, service accounts).
- [ ] In `src/domain/secretScanner.ts`, implement deterministic pure scanner for AWS keys, GitHub tokens, Google API keys, sk- keys, private key blocks, JWTs, and credential assignments.
- [ ] Implement finding masking (e.g. `sk-ant...9xQ2`) ensuring raw secrets are never displayed or logged.
- [ ] Implement Secret Review UI allowing user actions per finding: Redact, Exclude File, or Mark False Positive.
- [ ] Implement file manifest view displaying included files, purpose descriptions, and token estimates.
- [ ] **Tests added:** Unit tests for ignore filters, hard-block detection, secret pattern matching, masking, and redaction logic.
- [ ] **Docs updated:** Document secret scanner regexes and hard-blocked patterns in `PROGRESS.md`.
- [ ] **Commit message:** `Slice 8: project files and secret scanner`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- Prohibited files are unconditionally blocked with clear explanation.
- Secret scanner detects all specified patterns with masked outputs.
- Redaction scrubs secrets from stored copies before packaging.

---

## Slice 9: Checkpoints (Timeline, Compare, Restore)

- [ ] Implement checkpoint snapshot creation: passport + included conversation IDs + file manifest with SHA-256 hashes.
- [ ] In `src/domain/diff.ts`, implement structured diff engine computing changes per passport section.
- [ ] Build Checkpoint Timeline UI displaying chronological checkpoints with stamp badges and notes.
- [ ] Build Visual Diff Modal comparing any checkpoint to the current state or another checkpoint.
- [ ] Implement checkpoint restore workflow: **ALWAYS** auto-creates a `"Before restore"` checkpoint prior to applying.
- [ ] Write integration tests for snapshot creation, diff generation, and restore safety invariant.
- [ ] **Tests added:** Unit tests for SHA-256 hash generation, structured diff logic, and restore safeguards.
- [ ] **Docs updated:** Document checkpoint schema and diff algorithms in `PROGRESS.md`.
- [ ] **Commit message:** `Slice 9: checkpoints timeline, compare and restore`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- Checkpoints capture exact snapshots of passport, file hashes, and conversation links.
- Diff viewer accurately highlights additions, modifications, and deletions.
- Restoring a checkpoint creates the safety checkpoint automatically.

---

## Slice 10: Export Package, Destination Presets & Package Import

- [ ] In `src/export/presets.ts`, configure destination presets with editable token budgets: Lite paste (6k), ChatGPT (30k), Claude (60k), Gemini (100k), Coding Agent (40k), Custom.
- [ ] In `src/export/budgeter.ts`, implement priority truncation when content exceeds destination budget.
- [ ] Build Truncation Inspection UI displaying included items, trimmed turns, and omitted files with clear explanations.
- [ ] Implement Lite Export: generates `CONTINUE_PROMPT` markdown and copies directly to clipboard.
- [ ] Implement Full Package Export using JSZip: bundles `project-passport.json`, `PROJECT_STATE.md`, `CONTINUE_PROMPT.md`, `files/`, `conversations/`, and `MANIFEST.json`.
- [ ] Enforce Secret Gate: export is blocked when unresolved findings exist, unless overridden with explicit user warning acknowledgment.
- [ ] Implement Package Import: imports a full `.zip` package and verifies round-trip fidelity.
- [ ] **Tests added:** Unit tests for token budget enforcement, priority truncation, zip generation, and round-trip export/import identity.
- [ ] **Docs updated:** Document destination presets and package bundle layout in `PROGRESS.md`.
- [ ] **Commit message:** `Slice 10: export package, destination presets and package import`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- Lite package copies complete structured prompt within budget.
- Full zip generates complete valid handoff bundle.
- Round-trip test (export zip -> import zip) produces an identical passport data structure.
- Secret gate blocks unconfirmed secret exports.

---

## Slice 11: Polish, PWA, Landing + Privacy Pages & Deploy Docs

- [ ] Configure `vite-plugin-pwa` with web manifest, offline service worker caching, and application icons.
- [ ] Build clean, informative Landing Page explaining the concept without hype or misleading claims.
- [ ] Build standalone Privacy & Security Page detailing zero-cloud architecture, local IndexedDB storage, and client-side processing.
- [ ] Perform accessibility audit: verify 44px minimum touch targets, keyboard navigation, visible focus indicators, and WCAG contrast.
- [ ] Perform responsive layout verification on viewport sizes 360x640 up to 4K displays.
- [ ] Write production build and deployment documentation in `DEPLOY.md`.
- [ ] Final end-to-end regression testing across all user workflows.
- [ ] **Tests added:** End-to-end workflow verification tests and routing tests for landing and privacy pages.
- [ ] **Docs updated:** Finalize `PROGRESS.md` with full project roadmap completion.
- [ ] **Commit message:** `Slice 11: polish, PWA, landing and privacy pages, deploy docs`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- App works fully offline as an installable PWA.
- All accessibility and mobile responsiveness criteria are satisfied.
- Deployment instructions verified.

---

## Parking Lot (NOT in MVP; Do Not Build, Do Not Block)

- Cloud synchronization across devices.
- User accounts, authentication, or cloud database profiles.
- Payment processing or subscription tiers.
- Direct GitHub / GitLab / Bitbucket API integration.
- Model Context Protocol (MCP) server integration.
- Multi-user / team collaboration features.
- Automated provider usage-limit detection.
- Automatic multi-conversation algorithmic merging.
- In-app AI summarization powered by user-provided API keys.
