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

- [x] Install Dexie and `fake-indexeddb` (for test suite).
- [x] In `src/storage/db.ts`, declare the Dexie database schema for passports, checkpoints, files, and conversation metadata.
- [x] In `src/storage/storageService.ts`, implement CRUD operations for projects, passports, conversations, and files.
- [x] Implement transactional integrity for passport mutations, project renaming, and cascade deletions.
- [x] Implement full database backup export and atomic restore mechanism with schema validation and chunked base64 binary encoding.
- [x] Provide storage quota query utility, persistent storage request, and human-readable size formatting.
- [x] Write integration tests for storage operations using `fake-indexeddb`.
- [x] **Tests added:** Integration tests for project lifecycle, cascade delete, validation rejection, bugsReviewed persistence, chunked binary roundtrip, invalid backup rejection, 50MB warning, and storage unavailability.
- [x] **Docs updated:** Document storage schema, error classes, and service methods in `PROGRESS.md`.
- [x] **Commit message:** `Slice 2: local storage`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- CRUD operations, backup, and restore functions are completely verified against `fake-indexeddb`.
- No storage logic leaks into React components (service layer isolation strictly maintained).

---

## Slice 2b: Storage Hardening (Fix + Proof)

- [x] Remove test hook `_setStorageAvailableForTesting` from `src/storage/index.ts` public barrel; move into dedicated `src/storage/testing.ts`.
- [x] Relocate generic binary/format helpers (`uint8ArrayToBase64`, `base64ToUint8Array`, `formatBytes`) to `src/lib`.
- [x] Harden `isAvailable()` to asynchronously probe and open the database catching blocked/private-mode errors.
- [x] Implement same-ID project replacement conflict behaviour in `importBackup` while preserving unrelated projects.
- [x] Add real failure injection rollback proof tests for `deleteProject`, `renameProject`, and `importBackup`.
- [x] Add tests for same-ID replacement (extra conversations removed) and importing into an empty database.
- [x] Add test verifying `savePassport` updates `project.updatedAt` to a later value and maintains strict ID/name sync.
- [x] Document storage & backup behavior in `SPEC.md` and `PROGRESS.md`.
- [x] **Commit message:** `Slice 2b: storage hardening`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass with zero errors.
- Rollback proof tests demonstrate full transaction rollback under failure injection.
- No test hooks or forbidden patterns leak across codebase.

---

## Tooling Ticket T1: Automated Browser Testing (Playwright)

- [x] Install devDependencies: `@playwright/test` and `@axe-core/playwright`.
- [x] Configure `playwright.config.ts` with dedicated port 4179, preview webServer, desktop (1280x800) and mobile-360 (360x640) projects, channel `chrome`.
- [x] Add `"test:e2e": "playwright test"` script in `package.json`.
- [x] Configure Vitest to exclude `e2e/**` in `vite.config.ts`.
- [x] Extend `tsconfig.json` to typecheck `e2e/` and `playwright.config.ts`.
- [x] Extend ESLint ignore list in `eslint.config.js` and `.gitignore` for E2E artifacts (`e2e-results/`, `playwright-report/`, `test-results/`).
- [x] Implement E2E helpers in `e2e/helpers.ts`: `shot(page, name)`, `expectNoSeriousA11y(page)`, `collectConsoleErrors(page)`.
- [x] Implement smoke spec in `e2e/smoke.spec.ts`: loads placeholder app with h1, zero console errors, axe scan passes, real-browser IndexedDB Uint8Array roundtrip + deletion proof, screenshots.
- [x] Update `AGENTS.md` per-slice process, hard rules, dedicated port 4179, and visual self-review.
- [x] **Tests added:** 4 E2E tests across desktop and mobile-360 covering app smoke, accessibility, and real-browser IndexedDB binary storage.
- [x] **Commit message:** `T1: Playwright E2E harness`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` all pass with zero errors.
- Port 4179 is confirmed free after tests complete.

---

## Slice 3: App Shell, Design System & Dashboard

- [x] Install `lucide-react`, `@fontsource/inter`, and `@fontsource/jetbrains-mono` for typography and iconography.
- [x] Implement core UI primitives in `src/ui/`: `Button`, `Card`, `Badge` (stamp badge), `Dialog` (focus trap, Escape closes, returns focus to trigger), `Tabs`, `Input`, `Textarea`, `EmptyState`, `Toast`, and `ProgressRing`.
- [x] Implement dark/light theme switching with CSS variables and local storage persistence.
- [x] Implement responsive App Shell with mobile-first navigation bar (360x640 support, touch targets >= 44px).
- [x] Implement Dashboard view listing all local projects with status badges, readiness rings, and last updated timestamps.
- [x] Implement "Create New Project" modal with validation and immediate routing to the new project.
- [x] Implement "Rename Project" modal with trimmed name validation.
- [x] Implement "Delete Project" confirmation modal with plain-language warning.
- [x] Implement empty state for dashboard when no projects exist.
- [x] Implement Project Page with Overview tab (readiness checklist, quick stats, next action) and placeholders for later slice tabs.
- [x] Implement Backup Dialog with JSON export and replacement warning import.
- [x] Implement friendly Storage Blocked screen.
- [x] **Tests added:** Unit/component tests for all UI primitives, hooks, pages, and backup flows (78 vitest tests); 34 Playwright E2E tests across desktop and mobile-360.
- [x] **Docs updated:** Record theme tokens, UI components, routes, and decisions in `PROGRESS.md`.
- [x] **Commit message:** `Slice 3: shell and dashboard`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` pass with zero errors.
- Projects can be created, navigated, renamed, and deleted from the dashboard.
- Theme switching toggles seamlessly between dark and light palettes.
- Mobile layout verified at 360px width without horizontal scroll or undersized touch targets.
- All axe accessibility scans pass with zero violations.

---

## Slice 3b: UI Polish & Test Gaps

- [x] Status stamp: show human label ("Idea", "In progress", "Paused", "Done") with no "STATUS:" prefix and no underscores via shared `formatProjectStatus()` function with unit tests.
- [x] Remove "↗" icon next to project name on dashboard cards; whole title is the link (min height 44px).
- [x] Long project names wrap to at most 2 lines (line-clamp-2) with full title attribute on dashboard cards and project page header.
- [x] Footer copy updated to "Your data never leaves this device", keeping "The AI is replaceable; the project is not".
- [x] Header backup button: icon plus visible "Backup" label from 640px (`sm:`) up; icon-only below with accessible name "Backup and restore".
- [x] Mobile badge: compact `ON DEVICE` badge with `aria-label` and `title="Stored only on this device"`.
- [x] Dialog titles in sentence case ("New project", "Rename project", "Delete project", "Backup & restore") with updated tests/locators.
- [x] `ProjectNotFound` error message updated to plain language with next step; updated tests.
- [x] Project page tab strip at 360px: horizontally scrollable with visible edge fade affordance and 44px targets; no page-level horizontal scroll.
- [x] Remove fixed sleeps (`setTimeout`/`waitForTimeout`) anywhere in `e2e/`.
- [x] Implement reusable `auditPageLayoutAndTouchTargets` helper in `e2e/helpers.ts` checking no horizontal overflow and all interactive elements >= 44x44px across empty dashboard, 3 projects, overview with tab strip, and all dialogs on desktop and mobile-360.
- [x] Add serious/critical axe scans for dashboard (3 projects, light theme), project overview (light theme), new project dialog (light theme), storage-blocked screen, rename/delete/backup dialogs, and placeholder tabs. Fix contrast token values without changing DESIGN.md token names.
- [x] `e2e/backup.spec.ts`: add same-ID replace E2E test, invalid JSON structure fixture test, unknown backupVersion fixture test in `tests/fixtures/`, and restore count assertion.
- [x] Update `shot()` to accept `{ fullPage: true }` and regenerate all screenshots for visual self-review.
- [x] **Commit message:** `Slice 3b: polish and test gaps`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` pass with zero errors.
- Zero fixed sleeps in `e2e/`.
- Touch target and overflow audit passes on all key views across desktop and mobile-360.
- All light and dark theme axe scans pass with zero serious/critical violations.
- Port 4179 is confirmed free.

---

## Slice 4: Passport Editor & Live Preview

- [x] Implement form controls in `src/ui/`: `Input`, `Textarea`, `Select`, and keyboard-accessible item list controls.
- [x] Create multi-section Passport Editor accordion layout (Basics, Tech stack, Requirements, Decisions, Completed, Tasks, Bugs, Instructions, Next action, Open questions, Attached context summary).
- [x] Implement dynamic array editors with add, edit, delete (with toast Undo), and keyboard reordering (Move up/down buttons).
- [x] Implement plain-language inline validation feedback as fields change and block autosave while invalid.
- [x] Implement auto-save to Dexie with debouncing (600ms) and accessible status indicator (Saved, Saving..., Not saved, Error).
- [x] Implement Live Markdown Preview panel displaying formatted passport state via `passportToMarkdown` with token estimate and Copy button.
- [x] Implement real-time Readiness Score ring updating dynamically as the user fills in sections.
- [x] Implement responsive split-pane or toggle view between Editor and Preview on mobile viewports with zero horizontal overflow.
- [x] **Tests added:** Unit and component tests for domain helpers (`newId`, `moveItem`, `applyEditorFields`), `useAutosave` hook, and all 11 editor sections (103 Vitest tests); 22 Playwright E2E tests across desktop and mobile-360 viewports with zero test skips or fixed sleeps.
- [x] **Docs updated:** Document editor architecture, merge safety, autosave hook, and router navigation interceptor in `PROGRESS.md`.
- [x] **Commit message:** `Slice 4: passport editor`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- All passport schema fields can be edited and are persisted to IndexedDB.
- Readiness ring updates immediately when editing required fields.
- Form displays clear plain-language errors on invalid inputs.

---

## Slice 4b: Editor UX Fixes & Review Hygiene

- [x] Header: Solid, opaque background in both dark and light themes (`bg-bg-surface`, alpha = 1, `backdrop-filter: none`). E2E assertions for both viewports and themes.
- [x] "ON DEVICE" badge: Never wraps (`whitespace-nowrap`), single line at 360px (height <= 32px), header does not overflow at 360px.
- [x] Free-text fields become auto-growing textareas (`min-h-[44px]`, `rows=1`, expanding with scrollHeight): requirement, decision, reason, completed, task, bug, instruction, open question, and stack notes. Short fields stay single-line. E2E on mobile-360 verifies 140-char decision and reason visible without scrollbar or horizontal overflow and layout audit passes.
- [x] Empty states in editor become compact: single line of text with small secondary action button; only Basics sections keep brass primary button; list Add buttons use secondary/outline style (at most one brass primary action per screen region). Updated `DESIGN.md`.
- [x] Sticky Autosave status: Stays visible while scrolling (inside sticky side panel header on desktop; slim sticky bar below app header at `top-16` on mobile). E2E verifies scrolling to bottom of long editor and editing a field keeps status in viewport (`toBeInViewport`) transitioning Saving to Saved.
- [x] Internal links "Open Files tab" / "Open Conversations tab" remove external-link icon; use `ArrowRight` (min-height 44px).
- [x] Test locators: Each list item card has `role="group"` with accessible name ("Decision 1", "Task 2", etc.) and unique labels within its group. `e2e/passport.spec.ts` rewritten to use group/label/role locators; zero `getByPlaceholder` in `e2e/`. Placeholders changed to domain-neutral examples without developer-specific wording.
- [x] Review screenshots hygiene: In `shot()`, sticky/fixed elements temporarily become static during `fullPage: true`. Added `shotViewportTop` helper (`*-viewport-top.png`). Regenerated and refreshed `e2e-results/review/` with 6 clean files.
- [x] **Tests added:** 4 new E2E tests (tests 12 and 13 in `passport.spec.ts`, test 15 in `shell.spec.ts`) bringing total to 68 Playwright tests (100% passing across desktop and mobile-360) and 103 Vitest unit tests.
- [x] **Docs updated:** Update `DESIGN.md`, `PROGRESS.md`, and write `e2e-results/review/slice-4b-report.md`.
- [x] **Commit message:** `Slice 4b: editor UX fixes`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` pass with zero errors.
- Zero forbidden patterns in `e2e/`.
- Review folder populated and opened in Explorer.
- Port 4179 confirmed free.

---

## Slice 5a: Capture Prompt, Paste-back Parsing and Validation

- [x] In `src/export/prompts.ts`, implement `generateCapturePrompt()` strictly enforcing Schema v1 formatting (instructing the AI to set `bugsReviewed` to `true` only if confirmed no open bugs, otherwise `false`). (Note: Reconstruct prompt moved to Slice 6).
- [x] Implement Capture Dialog (`src/ui/CaptureDialog.tsx`) with one-click prompt copying (`~N tokens (estimate)`), clipboard fallback, privacy notice, min 8-row textarea, check reply button with loading state, and accessible success/error cards.
- [x] In `src/import/jsonExtractor.ts`, implement pure $O(n)$ iterative string-aware JSON extraction handling markdown code fences, raw text, smart quotes, trailing commas, comments, BOM/NBSP, literal newlines, and trailing prose (capped at 1,000,000 chars, no recursion).
- [x] In `src/domain/passportImport.ts`, derive `PassportImportSchema` from `PassportSchemaV1`, export `MERGE_SECTION_IDS`, implement `normalizeImportedPassport` with coercions and ignored keys tracking.
- [x] In `src/import/pasteBack.ts`, implement `processPasteBack` with plain-language errors, capped details (8 + "and N more"), and incoming readiness score.
- [x] Entry points: Secondary "Capture from AI" button on Passport tab toolbar and Overview next action area.
- [x] Synthetic test fixtures in `tests/fixtures/paste-back/` (`valid-reply.txt`, `truncated-reply.txt`, `README.md`).
- [x] Zero outbound network requests and zero IndexedDB storage writes verified.
- [x] **Tests added:** 100 new Vitest unit tests (202 total across 21 files); 12 Playwright E2E tests (120 total across 2 workers) covering all flows, accessibility, and zero network/storage impact.
- [x] **Docs updated:** Update `SPEC.md` §7, `PROGRESS.md`, and record failure disclosure and rationale.
- [x] **Commit message:** `Slice 5a: capture prompt, paste-back parsing and validation`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` pass with zero errors.
- Fuzz (500 seeded PRNG mutations) and safety tests green; zero outbound network requests proven.
- `SPEC.md` §7 updated with tolerance rules, ignored keys, and coercion list.
- `PROGRESS.md` updated with rationale and failure disclosures.
- Port 4179 is confirmed free.

---

## Slice 5b: Section-by-Section Merge UI, Visual Diff & Checkpoints

- [x] In `src/domain/merge.ts`, implement pure merge logic and diff calculations (`calculateSectionDiff`, `calculateAllSectionDiffs`, `mergePassport`) supporting Replace / Merge / Skip per section, matching lists by ID then normalized text, replacing scalars only when non-empty, and keeping `nextAction` as replace-or-skip only.
- [x] In `src/storage/errors.ts` and `src/storage/storageService.ts`, implement `StaleWrite` error class and `applyMergeWithCheckpoint` executing within an atomic Dexie transaction across `[projects, passports, checkpoints]` with pre-merge backup checkpoint creation and stale-write checking against concurrent tab modifications.
- [x] In `src/storage/storageService.ts`, implement checkpoint restore helper `restoreCheckpoint` (with automatic "Before restore" backup checkpoint) for single-click undo.
- [x] In `src/pages/passport/useAutosave.ts`, implement reactive storage baseline synchronization resetting draft state when project `updatedAt` changes externally via merge or restore.
- [x] In `src/ui/CaptureDialog.tsx`, implement section-by-section merge review UI with diff badges (added/changed/removed counts), 44px min-height action selectors (Merge, Replace, Skip), atomic "Apply merge" button with loading indicator, stale-write alert banner with "Reload latest" recovery button, and toast with "Undo" action.
- [x] **Tests added:** 17 unit tests for merge rules and diffs (`tests/domain/merge.test.ts`), 8 storage error tests including `StaleWrite` (`src/storage/__tests__/errors.test.ts`), 26 storage service tests verifying checkpoints and rollback on failure (`src/storage/__tests__/storageService.test.ts`), 7 RTL tests for `CaptureDialog` merge interactions (`tests/ui/CaptureDialog.test.tsx`), and 2 Playwright E2E tests for merge happy path with undo and stale-write conflict detection/recovery (16 E2E tests in `capture.spec.ts`).
- [x] **Docs updated:** Documented merge rules, transaction atomicity, stale-write detection, and failure disclosure in `PROGRESS.md`.
- [x] **Commit message:** `Slice 5b: section-by-section merge UI, checkpoints and stale-write protection`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` pass with zero errors.
- Merge UI allows selective section replacement, merge, and skip with plain-language diff badges.
- Automatic pre-merge backup checkpoint is created before writing to Dexie.
- Stale-write conflict detection prevents concurrent overwrites and provides reload recovery.
- Revert via toast Undo restores the pre-merge checkpoint cleanly.
- Port 4179 is confirmed free.

---

## Slice 5c: Autosave Stale-Write Guard, Undo Safety & Slow-Test Split

- [x] **Autosave stale-write guard:** Made `savePassport` support atomic stale-write validation via `{ expectedUpdatedAt?: string }` inside a single Dexie transaction on `[projects, passports]`, throwing `StaleWrite` on timestamp mismatch.
- [x] **Autosave conflict handling:** Mapped `StaleWrite` in `useAutosave` to the existing `'conflict'` status with "Reload latest" and "Keep my version" buttons. "Keep my version" rebases onto the stored record and retries through the atomic guard.
- [x] **Undo-after-merge safety:** Selected Option B; clicking Undo in the merge toast flushes autosave first (`flushActiveAutosave`), creating a "Before restore" checkpoint that preserves newer edits, and notifying the user in toast copy.
- [x] **Rollback test:** Verified failure-injection Vitest test for `applyMergeWithCheckpoint` in `src/storage/__tests__/storageService.test.ts` proving full rollback on failed write.
- [x] **Slow-test splitting & optimization:** Split `passport.spec.ts` tests 2, 6, 7, 16 into smaller focused sub-tests; seeded initial data in 6a, 7b, 16a directly into IndexedDB, reducing test execution times below the 12s ceiling with no test skips or timeout increases.
- [x] **Full test suite passes:** Vitest (230 tests in 22 files), Playwright E2E (134 tests in 6.9m, 0 failures, 0 skipped).
- [x] **Docs updated:** Recorded transaction state analysis, guard design, undo decision, slowest-test rankings, and failure disclosures in `PROGRESS.md`.
- [x] **Commit message:** `Slice 5c: autosave stale-write guard, undo safety and slow-test split`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` pass with zero errors.
- Autosave and merge share one atomic stale-write guard with test verification.
- Undo can no longer silently discard newer edits with test verification.
- PROGRESS.md and TASKS.md updated; port 4179 is confirmed free.

---

## Slice 6: Conversation Paste Import & Reconstruct Prompt

- [x] In `src/import/pasteParser.ts`, implement $O(n)$ speaker marker detection at line start (`You said:`, `ChatGPT said:`, `User:`, `Assistant:`, `Human:`, `Claude:`, `Gemini:`, `Me:`, `Model:`), vendor source detection, CRLF normalization, and 1 MB cap.
- [x] Implement fallback single-block parser when no known speaker markers are present, capturing pre-marker text into first turn notes.
- [x] In `src/domain/conversation.ts`, implement pure turn operations (`flipRole`, `splitTurn`, `mergeWithNext`, `removeTurn`) and token estimation with conservation invariants.
- [x] In `src/export/prompts.ts`, implement `generateReconstructPrompt` (version 1) sharing Schema v1 rules with capture prompt, token cap budgeting (default 30,000 tokens estimate), newest-first inclusion, and structured delimiter protection.
- [x] In `src/storage/storageService.ts`, implement atomic storage operations (`addPastedConversation`, `updateConversationTurns`, `setConversationIncluded`, `removeConversation`, `restoreConversation`) in single transactions across `[projects, passports, conversations]` with stale-write protection.
- [x] In `src/ui/ConversationViewer.tsx`, build accessible Conversation Viewer displaying turns with role badges, token estimates, 44px min-target controls (Flip role, Split, Merge with next, Delete), and native selection tracking.
- [x] Implement `PasteConversationDialog.tsx` with 2-step review flow, `ReconstructPromptDialog.tsx` with copy toast and trim warnings, and `EditConversationDialog.tsx`.
- [x] Implement `/project/:id/conversations` tab with compact empty state, attached conversation cards, include toggles, view/edit action, and removal with toast Undo.
- [x] Update project overview and passport attached-context summaries dynamically on conversation attach/removal.
- [x] **Tests added:** 98 new Vitest unit tests (328 total across 27 files) covering parser matrix (25+ cases), fuzzing (500 seeded mutations), turn operations, token math, reconstruct prompt, and storage rollback/stale-write guards; 18 Playwright E2E tests in `e2e/conversations.spec.ts` (152 total across suite) passing across desktop and mobile-360 with zero axe violations.
- [x] **Docs updated:** Update `SPEC.md` §7 and §8, `PROGRESS.md`, and record failure disclosures and design decisions.
- [x] **Commit message:** `Slice 6: conversation paste import and reconstruct prompt`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` pass with zero errors.
- Pasted transcripts from ChatGPT, Claude, Gemini, and plain text parse cleanly into structured message lists.
- Users can correct speaker roles, split turns at cursor positions, and merge turns via mouse and keyboard.
- Reconstruct prompt generates deterministic Schema v1 instructions bounded by token cap.
- All axe accessibility scans pass with zero violations across desktop and mobile-360 viewports.
- Port 4179 is confirmed free.

---

## Slice 7: ChatGPT & Claude Export Import

- [x] In `src/import/chatgptParser.ts`, implement tree traversal for ChatGPT `conversations.json` (mapping nodes via `current_node`).
- [x] Implement node filtering to exclude empty, system, and hidden messages (with toggle control).
- [x] Implement placeholder substitution for non-text parts (e.g. `[image]`).
- [x] In `src/import/claudeParser.ts`, implement parsing for Claude export format (`uuid`, `chat_messages`).
- [x] Implement diagnostic fallback panel when unknown or malformed export formats are detected.
- [x] Move heavy JSON parsing to a Web Worker (`src/import/parser.worker.ts`) to avoid UI freeze.
- [x] Implement memory check and warning banner when file size exceeds 300 MB.
- [x] Implement conversation selection modal allowing users to attach specific conversations to the passport.
- [x] **Tests added:** Unit tests for ChatGPT tree reconstruction, Claude JSON parsing, worker communication, and malformed JSON diagnostic reporting.
- [x] **Docs updated:** Document export schemas and parser edge-cases in `PROGRESS.md`.
- [x] **Commit message:** `Slice 7: ChatGPT and Claude export import`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- ChatGPT and Claude export files import correctly through a Web Worker.
- Corrupted or unrecognized files trigger the diagnostics view without crashing the app.
- npm run test:e2e, a Playwright spec per UI flow, and an axe scan per new screen

---

## Slice 8: Project Files & Secret Scanner

- [x] Implement file import handling: single/multi-file picker, folder directory upload, and zip archive upload.
- [x] Implement user-editable default ignore list (`.git`, `node_modules`, `dist`, lockfiles, binaries, media, files > 500 KB).
- [x] Enforce security hard-block on prohibited filenames (`.env*`, `*.pem`, `*.key`, `id_rsa*`, service accounts).
- [x] In `src/domain/secretScanner.ts`, implement deterministic pure scanner for AWS keys, GitHub tokens, Google API keys, sk- keys, private key blocks, JWTs, and credential assignments.
- [x] Implement finding masking (e.g. `sk-ant...9xQ2`) ensuring raw secrets are never displayed or logged.
- [x] Implement Secret Review UI allowing user actions per finding: Redact, Exclude File, or Mark False Positive.
- [x] Implement file manifest view displaying included files, purpose descriptions, and token estimates.
- [x] **Tests added:** Unit tests for ignore filters, hard-block detection, secret pattern matching, masking, and redaction logic.
- [x] **Docs updated:** Document secret scanner regexes and hard-blocked patterns in `PROGRESS.md`.
- [x] **Commit message:** `Slice 8: project files and secret scanner`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- Prohibited files are unconditionally blocked with clear explanation.
- Secret scanner detects all specified patterns with masked outputs.
- Redaction scrubs secrets from stored copies before packaging.
- npm run test:e2e, a Playwright spec per UI flow, and an axe scan per new screen

---

## Slice 9: Checkpoints (Timeline, Compare, Restore)

- [x] Implement checkpoint snapshot creation: passport + included conversation IDs + file manifest with SHA-256 hashes (`src/domain/checkpoint.ts`, `src/domain/hash.ts`, `src/storage/storageService.ts`).
- [x] In `src/domain/diff.ts`, implement structured diff engine computing changes per passport section with match rules and legacy backwards compatibility.
- [x] Build Checkpoint Timeline UI displaying chronological checkpoints with stamp badges, notes, summaries, and action triggers (`src/pages/checkpoints/CheckpointsTab.tsx`).
- [x] Build Visual Diff Modal comparing any checkpoint to the current state or another checkpoint (`src/ui/CompareDialog.tsx`).
- [x] Implement checkpoint restore workflow: **ALWAYS** auto-creates a `"Before restore"` checkpoint prior to applying and replaces editor-owned fields only (`src/ui/RestoreCheckpointDialog.tsx`, `src/storage/storageService.ts`).
- [x] Write integration tests for snapshot creation, diff generation, and restore safety invariant (`src/storage/__tests__/checkpointStorage.test.ts`, `tests/domain/diff.test.ts`, `tests/ui/CheckpointsTab.test.tsx`).
- [x] **Tests added:** 46 Vitest test suites (556 tests pass); 11 Playwright E2E scenarios across desktop and mobile-360 (24 tests pass in `e2e/checkpoints.spec.ts`, 214 total E2E suite tests).
- [x] **Docs updated:** Document checkpoint schema, diff algorithms, restore decision, and failure disclosures in `PROGRESS.md` and `SPEC.md`.
- [x] **Commit message:** `Slice 9: checkpoints timeline, compare and restore`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- Checkpoints capture exact snapshots of passport, file hashes, and conversation links.
- Diff viewer accurately highlights additions, modifications, and deletions.
- Restoring a checkpoint creates the safety checkpoint automatically.
- npm run test:e2e, a Playwright spec per UI flow, and an axe scan per new screen

---

## Slice 10: Export Package, Destination Presets & Package Import

- [x] In `src/export/presets.ts`, configure destination presets with editable token budgets: Lite paste (6k), ChatGPT (30k), Claude (60k), Gemini (100k), Coding Agent (40k), Custom.
- [x] In `src/export/budgeter.ts`, implement priority truncation when content exceeds destination budget.
- [x] Build Truncation Inspection UI displaying included items, trimmed turns, and omitted files with clear explanations.
- [x] Implement Lite Export: generates `CONTINUE_PROMPT` markdown and copies directly to clipboard.
- [x] Implement Full Package Export using JSZip: bundles `project-passport.json`, `PROJECT_STATE.md`, `CONTINUE_PROMPT.md`, `files/`, `conversations/`, and `MANIFEST.json`.
- [x] Enforce Secret Gate: export is blocked when unresolved findings exist, unless overridden with explicit user warning acknowledgment.
- [x] Implement Package Import: imports a full `.zip` package and verifies round-trip fidelity.
- [x] **Tests added:** Unit tests for token budget enforcement, priority truncation, zip generation, and round-trip export/import identity.
- [x] **Docs updated:** Document destination presets and package bundle layout in `PROGRESS.md`.
- [x] **Commit message:** `Slice 10: export package, destination presets and package import`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- Lite package copies complete structured prompt within budget.
- Full zip generates complete valid handoff bundle.
- Round-trip test (export zip -> import zip) produces an identical passport data structure.
- Secret gate blocks unconfirmed secret exports.
- npm run test:e2e, a Playwright spec per UI flow, and an axe scan per new screen

---

## Slice 11: Polish, PWA, Landing + Privacy Pages & Deploy Docs

- [x] Configure `vite-plugin-pwa` with web manifest, offline service worker caching, and application icons.
- [x] Build clean, informative Landing Page explaining the concept without hype or misleading claims.
- [x] Build standalone Privacy & Security Page detailing zero-cloud architecture, local IndexedDB storage, and client-side processing.
- [x] Perform accessibility audit: verify 44px minimum touch targets, keyboard navigation, visible focus indicators, and WCAG contrast.
- [x] Perform responsive layout verification on viewport sizes 360x640 up to 4K displays.
- [x] Write production build and deployment documentation in `DEPLOY.md`.
- [x] Final end-to-end regression testing across all user workflows.
- [x] **Tests added:** End-to-end workflow verification tests and routing tests for landing and privacy pages.
- [x] **Docs updated:** Finalize `PROGRESS.md` with full project roadmap completion.
- [x] **Commit message:** `Slice 11: polish, PWA, landing and privacy pages, deploy docs`

**Done when:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- App works fully offline as an installable PWA.
- All accessibility and mobile responsiveness criteria are satisfied.
- Deployment instructions verified.
- npm run test:e2e, a Playwright spec per UI flow, and an axe scan per new screen

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
