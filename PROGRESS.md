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
- [ ] Slice 4: Passport editor + live preview
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

---

## Known Issues

*None recorded yet.*
