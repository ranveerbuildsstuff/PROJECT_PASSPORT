# PROGRESS.md — Project Roadmap & Status

Current slice: none (Slice 1, 1b, 2, 2b, 2c, Tooling T1, T1b, Slice 3 & Slice 3b complete)

## Slices Checklist

- [x] Slice 1: Scaffold + domain model (schema, readiness, tokens, markdown renderer)
- [x] Slice 2: Local storage (Dexie, service layer, backup/restore)
- [x] Slice 2b: Storage hardening (fix + proof)
- [x] Tooling Ticket T1: Automated browser testing (Playwright)
- [x] Slice 2c: Storage fixes (name validation, ProjectNotFound, test consolidation)
- [x] Tooling Ticket T1b: Harness hardening (forbidOnly, helpers selftest)
- [x] Slice 3: App shell, design system, dashboard
- [x] Slice 3b: UI polish and test gaps
- [x] Slice 3c: Polish and test hygiene
- [x] Slice 4: Passport editor + live preview
- [x] Slice 4b: Editor UX fixes & review hygiene [CURRENT]
- [ ] Slice 5: Capture prompt, reconstruct prompt, paste-back + merge
- [ ] Slice 6: Conversation paste import
- [ ] Slice 7: ChatGPT / Claude export import
- [ ] Slice 8: Project files + secret scanner
- [ ] Slice 9: Checkpoints (timeline, compare, restore)
- [ ] Slice 10: Export package, destination presets, import package
- [ ] Slice 11: Polish, PWA, landing + privacy pages, deploy docs

---

## Decisions & Deviations

### Slice 1 & 1b: Scaffold, Domain Model & bugsReviewed
Initialized Vite + React 18 + TypeScript strict mode with Tailwind CSS v4 design tokens. Implemented pure Zod schema v1, UUID factory, token estimation, markdown generation, and 7-check readiness score. Added `bugsReviewed: boolean` to persist explicit user review state across reloads, removed fragile keyword text scanning, and enforced plain-language error formatting preventing raw Zod leaks.

### Slice 2 & 2b: Local Storage & Service Layer Hardening
Implemented Dexie database with 5 tables (`projects`, `passports`, `checkpoints`, `conversations`, `files`) and typed error classes. All multi-entity mutations run in atomic transactions. Used chunked base64 for binary files and `Uint8Array` over Blobs. Hardened `isAvailable()` to asynchronously probe `db.open()`, isolated test hooks to `src/storage/testing.ts`, implemented same-ID replacement on backup import, and verified rollback under injected failures.

### Tooling Ticket T1 & T1b: Automated E2E Browser Testing & Harness Hardening
Configured Playwright on dedicated port 4179 (webServer preview) with Chrome channel testing desktop (1280x800) and mobile-360 (360x640) viewports. Added axe-core accessibility scanner, screenshot utility, console error collector, and verified real IndexedDB Uint8Array persistence. Hardened with `forbidOnly: true` and selftests in `e2e/helpers.selftest.spec.ts` proving axe violations and console errors are caught.

### Slice 2c: Storage Fixes
Consolidated manual checklist tests into `storageService.test.ts` and deleted redundant test files. Added trimmed name validation to `createProject` and `renameProject` rejecting empty/whitespace names with `ValidationFailed`. Prevented `savePassport` from creating projects by requiring an existing project row or throwing typed `ProjectNotFound`.

### Slice 3: App Shell, Design System & Dashboard
- **Design System & Components:** Built reusable components in `src/ui/`: `Button` (variants/sizes/loading), `Card`, `Badge` (stamp style), `Dialog` (accessible with focus trap, Escape dismissal, and return focus to trigger), `Tabs`, `Input`, `Textarea`, `EmptyState`, `ProgressRing`, `Toast` (with `ToastProvider` and `useToast`), and `ThemeProvider` (with `useTheme` managing dark/light theme persisted solely under `theme` key in `localStorage`).
- **App Shell & Header:** Implemented `AppShell`, sticky `Header` with brand link, "Stored only on this device" badge, theme switcher, and `BackupDialog` (exporting timestamped JSON backup with 50MB warning indicator and importing with same-ID replacement confirmation).
- **Pages & Routing:** Implemented `DashboardPage` (`/`) with project cards, readiness rings, status stamps, last updated timestamps, and create/rename/delete dialogs. Implemented `ProjectPage` (`/project/:id/:tab?`) with functional Overview tab (7-point readiness checklist, quick stats, next action card) and placeholders for future slices, plus friendly Project Not Found screen. Implemented full-screen `StorageBlockedPage` shown when `isAvailable()` fails.
- **Architectural Isolation:** UI layer strictly interacts with `src/storage` functions and React hooks (`useProjects`, `useProject`), never importing Dexie directly. All touch targets >= 44x44px, no hover-only features, fully keyboard navigable, and 0 accessibility violations across desktop and mobile-360.

### Slice 3b: UI Polish & Test Gaps
- **Status Stamp & Human Labels:** Implemented `formatProjectStatus(status)` mapping `'idea' -> 'Idea'`, `'in_progress' -> 'In progress'`, `'paused' -> 'Paused'`, `'done' -> 'Done' without prefixes or underscores. Removed forced `uppercase` in `src/ui/Badge.tsx` so status badges render cleanly in human-readable sentence case.
- **Card & Header Navigation Polish:** Removed the `"↗"` icon from dashboard project cards; made the entire title a link with `min-h-[44px]`. Applied `line-clamp-2` with `title` attributes for long project names. Updated footer to `"Your data never leaves this device"`.
- **Responsive Header & Mobile Badge:** Added visible `"Backup"` text from 640px (`sm:`) up while maintaining accessible name `"Backup and restore"` across all viewports. Replaced mobile header badge with `"ON DEVICE"` badge with `aria-label` and `title="Stored only on this device"`.
- **Dialog Titles in Sentence Case:** Converted all dialog titles to sentence case (`"New project"`, `"Rename project"`, `"Delete project"`, `"Backup & restore"`).
- **Error Messages in Plain Language:** Updated `ProjectNotFound` constructor and throw sites to plain language: `"Project \"{id}\" was not found. It may have been deleted. Go back to your projects and try again."`.
- **Responsive Horizontally Scrollable Tab Strip:** Added a smooth scroll wrapper to `src/ui/Tabs.tsx` with a right-edge gradient fade affordance (`from-bg-app to-transparent`) indicating scrollability at 360px without page-level horizontal overflow.
- **Elimination of Fixed Sleeps:** Removed `setTimeout` from `e2e/smoke.spec.ts` and `e2e/helpers.selftest.spec.ts`, replacing with deterministic event listeners (`page.waitForEvent('pageerror')`) and microtasks.
- **Reusable Touch-Target & Layout Audit:** Created `auditPageLayoutAndTouchTargets(page, contextName)` in `e2e/helpers.ts` asserting no page horizontal overflow (`scrollWidth <= innerWidth`) and all visible interactive elements (`button`, `a`, `[role=tab]`, `input`, `textarea`) meet `width >= 43.5 && height >= 43.5`. Identified and fixed a 32x32px toast dismiss button violation by upgrading to `min-h-[44px] min-w-[44px]`.
- **Light Theme Contrast & Axe Audits:** Added comprehensive serious/critical axe scans in light and dark themes across dashboard with 3 projects, project overview, all dialogs, storage blocked page, and placeholder tabs. Tuned light mode `--accent-brass` to `#745706` and introduced `--accent-brass-contrast` CSS token (`#000000` in dark mode, `#ffffff` in light mode) ensuring WCAG AA contrast (> 6.3:1) without changing DESIGN.md token names.
- **Backup Tests & Synthetic Fixtures:** Added `tests/fixtures/invalid-structure-backup.json` and `tests/fixtures/unknown-version-backup.json`. Added same-ID replacement test (create -> export -> rename -> import restores original name and maintains exactly 1 project), invalid structure test, unknown backup version test, and restored project count assertion to `e2e/backup.spec.ts`.
- **Full-Page Screenshots & Visual Self-Review:** Enhanced `shot()` helper to accept `{ fullPage?: boolean }`, capturing complete full-height snapshots of the dashboard and project overview screens.

### Slice 3c: Polish and Test Hygiene
- **DESIGN.md & Design Tokens:** Updated light mode accent token to `#745706` matching the WCAG AA contrast value used, documented `--accent-brass-contrast` (`#000000` in dark mode, `#ffffff` in light mode), and documented that status stamps use human-readable sentence-case labels. Verified `src/index.css` matches `DESIGN.md` token for token with zero drift.
- **E2E Test Architecture & Performance:** Created `seedProjects(page, n)` helper in `e2e/helpers.ts` to create projects via UI without duplicating setup code. Split long `shell.spec.ts` test 12 & 13 into three independent tests: dark theme axe scans (test 12), light theme axe scans (test 13), and full screenshot suite (test 14). Removed `test.slow()`.
- **Storage-Blocked Screen Axe Scans:** Added light theme and dark theme serious/critical axe accessibility scans for the full-screen storage blocked error view on both desktop and mobile-360 viewports.
- **Pluralization & Toast Copy:** Updated restore toast in `src/ui/BackupDialog.tsx` to "Restored 1 project" / "Restored {n} projects" (proper singular/plural without "project(s)") and updated `e2e/backup.spec.ts`.
- **Project Not Found UI Copy:** Updated `src/pages/ProjectPage.tsx` empty state description to avoid displaying the raw internal project ID to the user: "This project was not found. It may have been deleted. Go back to your projects and try again." Updated both unit and E2E tests.
- **Playwright Workers:** Tested raising workers to 4 in `playwright.config.ts`. With 4 concurrent Chrome instances running axe evaluation trees, heavy CPU starvation produced test timeouts (>30s on desktop test 12). Reverted workers to 2, where all 40 tests execute stably and pass in 2.9m.

### Slice 4: Passport Editor & Live Preview
- **Route & Layout Architecture:** Implemented `/project/:id/passport` replacing the placeholder tab. Built a responsive layout with an accordion-based editor on the left and a sticky `SidePanel` on the right (desktop); on mobile (360x640), the panel stacks below the editor with collapsible sections, maintaining zero horizontal overflow.
- **Domain Utilities (`src/domain/editor.ts`):**
  - `newId()`: Generates unique string IDs using `crypto.randomUUID()` with fallback.
  - `moveItem(list, from, to)`: Pure immutable array reordering (out-of-range is a no-op).
  - `applyEditorFields(latest, draft)`: Merges editor-owned fields (`project`, `stack`, `requirements`, `decisions`, `completed`, `tasks`, `bugs`, `bugsReviewed`, `instructions`, `nextAction`, `openQuestions`) into `latest` while strictly preserving storage-managed arrays (`files`, `conversations`) and metadata (`id`, `createdAt`).
  - `validatePassportDetailed(draft)`: Produces plain-language field-level errors (e.g. "Task 1 needs some text") and maps them to input keys.
- **Accessible UI Primitives:**
  - `src/ui/Select.tsx`: Accessible dropdown component with associated label, error message, helper text, and 44px min-height target.
  - `src/ui/Accordion.tsx`: Accessible accordion section container with `aria-expanded`, item count badges, and smooth state toggling.
  - `Toast` Actions: Enhanced `Toast` with action buttons, powering instant item deletion with accessible Undo toasts.
- **Editor Sections:** Implemented 11 modular sections under `src/pages/passport/sections/`:
  1. `BasicsSection`: Project name, status select, project goal, and executive summary.
  2. `StackSection`: Name, role, version, notes with add, edit, delete (Undo), and keyboard reordering.
  3. `RequirementsSection`: Text, priority (`must`/`should`/`could`) with list controls.
  4. `DecisionsSection`: Architectural decision, reason, date, and status (`active`/`superseded`). Superseded decisions render with dimmed opacity (60%) and explicit "Superseded" badge.
  5. `CompletedSection`: Shipped milestones and completed tasks with list controls.
  6. `TasksSection`: Task description, status (`todo`/`doing`/`blocked`/`done`), and priority (`low`/`medium`/`high`).
  7. `BugsSection`: Bug description, severity (`low`/`medium`/`high`), status (`open`/`fixed`), and an explicit "I reviewed bugs and there are none" checkbox bound to `bugsReviewed`.
  8. `InstructionsSection`: Rule/instruction strings for AI assistants.
  9. `NextActionSection`: Immediate next action textarea providing instant orientation.
  10. `OpenQuestionsSection`: Outstanding technical and product questions.
  11. `ContextSummarySection`: Read-only summary cards showing count of attached files and conversations, with links to their respective tabs.
- **Autosave & Concurrency Hardening (`useAutosave.ts`):**
  - 600ms debounce timer with accessible live status indicator: `Saved`, `Saving...`, `Not saved: <reason>`, and `Error: <reason>`.
  - Transitions immediately to `Saving...` when draft is dirty and valid; resets to `Saved` if an edit is undone back to the last saved snapshot.
  - Before saving, re-reads latest passport from storage and merges via `applyEditorFields` to prevent clobbering files/conversations.
  - Flushes pending edits synchronously on unmount and listens to `pagehide` and `beforeunload`.
  - Blocks autosave while draft has validation errors, keeping draft safely in memory.
- **Navigation Guard:** Implemented an in-app navigation interceptor in `ProjectPage.tsx` and `PassportEditor.tsx`. Attempting to navigate to another tab or back to dashboard while the draft contains validation errors triggers an accessible confirmation dialog ("Discard unsaved changes?"). Clicking "Keep editing" retains the invalid draft; clicking "Discard changes" discards and navigates.
- **Side Panel & Live Metrics (`SidePanel.tsx`):**
  - Dynamic Handoff Readiness ring and 7-check checklist updated on every keystroke.
  - Live preview of `PROJECT_STATE.md` generated via `passportToMarkdown` with token estimation (`~N tokens (estimate)`).
  - One-click "Copy markdown" button with clipboard fallback and toast feedback.
- **Background Fetch Refinement (`hooks.ts`):**
  - Updated `useProject` to accept `isBackground = true` on storage event updates, preventing `isLoading` state from unmounting `PassportEditor` during background autosave notifications.

### Slice 4b: Editor UX Fixes & Review Hygiene
- **Opaque Header & Badge Stability:**
  - Set app header background to solid `bg-bg-surface` with explicit inline `backdropFilter: 'none'`, ensuring 100% opacity (alpha = 1) across dark and light themes without glassmorphism or content showing through.
  - Tuned header title and badge spacing to ensure the `"ON DEVICE"` badge never wraps (`whitespace-nowrap shrink-0`) and remains single-line (height <= 32px) without header horizontal overflow at 360px.
- **Auto-Growing Textareas:**
  - Upgraded `src/ui/Textarea.tsx` with dynamic auto-grow logic (`autoGrow = true`, default `rows = 1`, `min-h-[44px]`, `resize-none overflow-hidden break-words`), calculating `scrollHeight + borderTop + borderBottom` on input, value change, and window resize.
  - Converted multi-line text fields (requirement description, decision, reason, completed text, task description, bug description, instruction rule, open question, and stack notes) to auto-growing textareas while keeping short single-line inputs (name, role, version, date, selects).
- **Compact Empty States & Button Restraint:**
  - Implemented `CompactEmptyState` displaying a single line of text with a small secondary action button, removing large dashed cards and oversized icons.
  - Updated `DESIGN.md` establishing the button hierarchy restraint rule: at most one brass primary button per screen region (reserved for Basics); all list add actions use secondary or outline styling.
- **Sticky Autosave Status:**
  - On mobile (<1024px), rendered a slim sticky bar below the app header at `top-16 z-30` displaying live autosave status and an "Expand all / Collapse all" toggle button.
  - On desktop (>=1024px), rendered a dedicated sticky header above the side panel at `top-20 z-20` keeping autosave status continuously visible in the viewport (`toBeInViewport()`) across the entire scroll length.
- **Navigation Affordances & Accessible Locators:**
  - Replaced `ExternalLink` icon with `ArrowRight` on internal context links ("Open Files tab" / "Open Conversations tab") with min-height 44px targets.
  - Assigned `role="group"` with accessible names ("Decision 1", "Task 2", etc.) to every list card, with unique label associations. Eliminated `getByPlaceholder` from all test suites. Replaced developer-specific placeholders with domain-neutral examples.
- **Screenshot Hygiene & Test Harness:**
  - Enhanced `shot()` helper to temporarily set sticky/fixed elements to `position: static !important` during full-page captures, ensuring elements render at their natural document positions.
  - Added `shotViewportTop()` helper capturing viewport-only tops of screens.
  - Configured `playwright.config.ts` with `timeout: 60000` to provide adequate headroom for tests running multiple full-page axe-core audits on Windows environments.

---

## Known Issues

*None recorded yet.*
