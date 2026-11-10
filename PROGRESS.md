# PROGRESS.md — Project Roadmap & Status

Current slice: none (Slice 1, 1b, 2, 2b, 2c, Tooling T1, T1b & Slice 3 complete)

## Slices Checklist

- [x] Slice 1: Scaffold + domain model (schema, readiness, tokens, markdown renderer)
- [x] Slice 2: Local storage (Dexie, service layer, backup/restore)
- [x] Slice 2b: Storage hardening (fix + proof)
- [x] Tooling Ticket T1: Automated browser testing (Playwright)
- [x] Slice 2c: Storage fixes (name validation, ProjectNotFound, test consolidation)
- [x] Tooling Ticket T1b: Harness hardening (forbidOnly, helpers selftest)
- [x] Slice 3: App shell, design system, dashboard
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

---

## Known Issues

*None recorded yet.*
