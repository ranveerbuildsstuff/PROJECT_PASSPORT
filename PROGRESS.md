# PROGRESS.md — Project Roadmap & Status

Current slice: none (Slice 1, 1b & 2 complete)

## Slices Checklist

- [x] Slice 1: Scaffold + domain model (schema, readiness, tokens, markdown renderer)
- [x] Slice 2: Local storage (Dexie, service layer, backup/restore)
- [ ] Slice 3: App shell, design system, dashboard
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

### Slice 1: Scaffold + Domain Model
- **What was built:**
  - Initialized Vite + React + TypeScript in strict mode (`noUncheckedIndexedAccess: true`).
  - Configured stable Tailwind CSS v4 (`tailwindcss@4.3.5` + `@tailwindcss/vite@4.3.5`) with design tokens from `DESIGN.md` in `src/index.css`.
  - Configured ESLint 9 (flat config) and Prettier.
  - Configured Vitest + React Testing Library + `jsdom`.
  - Implemented pure domain module in `src/domain/`:
    - `passport.schema.ts`: Zod schema v1, types derived via `z.infer`, `createEmptyPassport` (UUID + ISO dates), `validatePassport` with plain-language error formatting.
    - `readiness.ts`: 7-check 0–100 scoring engine based on SPEC.md.
    - `tokens.ts`: `estimateTokens` (`Math.ceil(chars / 4)`) and `formatTokenEstimate`.
    - `markdown.ts`: `passportToMarkdown` with stable deterministic section order, omitting empty sections.
    - `migrate.ts`: `migratePassport` validating v1 data with clean errors on unknown versions.
    - `index.ts`: Barrel export for all domain utilities.
  - Implemented synthetic test fixture in `tests/fixtures/ecommerce-passport.json` with descriptive `tests/fixtures/README.md`.
  - Implemented placeholder Home Page with React Router in `src/App.tsx` and smoke test in `src/__tests__/App.test.tsx`.
- **Key file paths:**
  - `src/domain/passport.schema.ts`
  - `src/domain/readiness.ts`
  - `src/domain/tokens.ts`
  - `src/domain/markdown.ts`
  - `src/domain/migrate.ts`
  - `src/domain/index.ts`
  - `src/App.tsx`
  - `src/main.tsx`
  - `src/index.css`
  - `tests/fixtures/ecommerce-passport.json`
  - `tests/fixtures/README.md`
- **Decisions & Deviations:**
  - *Tailwind CSS Setup:* Used current stable Tailwind v4 (`@tailwindcss/vite` 4.3.5) with CSS theme variables (`@theme` in `src/index.css`), eliminating PostCSS configuration overhead.
  - *Font packages:* Deferred installation of `@fontsource/inter` and `@fontsource/jetbrains-mono` to Slice 3 (App shell & Design System) per explicit prompt instruction ("Do not add dexie, jszip or fonts yet").
  - *Dependencies:* Restricted strictly to slice 1 requirements (`react`, `react-dom`, `react-router-dom`, `zod`, `tailwindcss`, `@tailwindcss/vite`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `eslint`, `typescript-eslint`, `prettier`).

### Slice 1b: Persist bugsReviewed & Plain-Language Fallback
- **What was changed:**
  - Added top-level boolean field `bugsReviewed` (default `false`) to Passport Schema v1 (`PassportSchemaV1`), factory (`createEmptyPassport`), and synthetic fixture (`ecommerce-passport.json`).
  - Removed `ReadinessOptions` and its `explicitNoBugs` parameter along with all fragile `instructions` text scanning from `src/domain/readiness.ts`. Check 6 now passes purely if `bugs.length > 0 || bugsReviewed === true`.
  - Updated `src/domain/markdown.ts`: when `bugs` is empty and `bugsReviewed` is `true`, renders `## Bugs & Issues\n\nNone reported (confirmed by the user)`. When `bugs` is empty and `bugsReviewed` is `false`, omits the section.
  - Overhauled `formatZodIssueToPlainLanguage` in `src/domain/passport.schema.ts`: added field label map and eliminated all raw Zod issue message leaks (such as "Expected string, received number"). Fallback now generates human-readable path-based text (`The field "<path>" has an invalid value`) with explicit type explanations for lists, objects, text, and booleans.
  - Updated `SPEC.md`, `TASKS.md` (Slice 5 capture/merge requirements), and fixture documentation.
- **Key file paths:**
  - `SPEC.md`
  - `src/domain/passport.schema.ts`
  - `src/domain/readiness.ts`
  - `src/domain/markdown.ts`
  - `tests/fixtures/ecommerce-passport.json`
  - `tests/fixtures/README.md`
  - `src/domain/__tests__/readiness.test.ts`
  - `src/domain/__tests__/passport.schema.test.ts`
  - `src/domain/__tests__/markdown.test.ts`
  - `TASKS.md`
  - `PROGRESS.md`
- **Decisions & Deviations:**
  - *Removal of `ReadinessOptions` and text scanning:* The initial implementation relied on ephemeral runtime options (`options.explicitNoBugs`) and fragile string matching in `instructions` (`"no bugs"`, `"no known bugs"`). These states were not preserved across reload, checkpoint save/restore, or export/import. Introducing `bugsReviewed: boolean` in the schema persists this explicit user confirmation state.
  - *Schema version remains 1:* Because the application is in pre-release and no persistent stored user data exists yet, `schemaVersion` remains `1`. Backward compatibility is preserved via Zod's `.default(false)`.
  - *Plain-Language Fallback:* Replaced `issue.message` fallback with path-aware plain-language translations (`The field "<path>" has an invalid value`, `${label} must be a list`, `${label} must be text`), strictly adhering to SPEC.md invariant forbidding raw Zod messages to end users.

### Slice 2: Local Storage & Service Layer
- **What was built:**
  - Installed `dexie` (`^4.4.7`) and dev dependency `fake-indexeddb` (`^6.2.8`).
  - Configured `src/test/setup.ts` with `fake-indexeddb/auto` and jsdom fallback for `structuredClone`.
  - Implemented Dexie database definition in `src/storage/db.ts` (version 1) with 5 tables: `projects`, `passports`, `checkpoints`, `conversations`, and `files`.
  - Implemented typed domain storage errors with plain-language explanations and actionable next steps in `src/storage/errors.ts`: `StorageUnavailable`, `ValidationFailed`, `QuotaExceeded`, and `BackupInvalid`.
  - Implemented storage service module in `src/storage/storageService.ts`:
    - Project CRUD: `createProject`, `listProjects`, `getProject`, `renameProject` (single transaction updating project and passport), `deleteProject` (single transaction cascading to passport, checkpoints, conversations, files).
    - Passport operations: `getPassport` (runs `migratePassport` on read), `savePassport` (validates with `validatePassport`, updates `project.updatedAt`).
    - Conversations & Files: `add/list/get/remove` for conversations and files, storing file content as string or `Uint8Array` (Blob strictly avoided).
    - Backup & Restore: `exportEverything` and `importBackup` supporting chunked (~32 KB) base64 binary encoding, atomic all-or-nothing transaction, passport migration validation, version checks, and 50 MB warning threshold.
    - Persistence & Environment utilities: `isAvailable` (with graceful fallback if IndexedDB is blocked or in private mode), `requestPersistentStorage`, `getStorageUsage`, `formatBytes`.
  - Implemented public storage barrel export in `src/storage/index.ts` maintaining strict service-layer isolation (Dexie instance never leaked to UI).
  - Wrote comprehensive integration test suite in `src/storage/__tests__/storageService.test.ts` (13 tests) verifying all lifecycle operations, cascade deletions, validation rejections, sync guarantees, binary chunking, and error handling.
- **Key file paths:**
  - `src/storage/db.ts`
  - `src/storage/errors.ts`
  - `src/storage/storageService.ts`
  - `src/storage/index.ts`
  - `src/storage/__tests__/storageService.test.ts`
  - `src/test/setup.ts`
  - `TASKS.md`
  - `PROGRESS.md`
- **Decisions & Deviations:**
  - *Uint8Array over Blob:* File contents are stored strictly as `string` for text or `Uint8Array` for binary data. Blobs were excluded to avoid cross-realm identity bugs in testing and browser variations.
  - *Chunked Base64 Encoding:* Binary files in full backups are converted to base64 in 32 KB chunks to prevent JavaScript call-stack overflow (`Maximum call stack size exceeded`) on large files.
  - *All-or-Nothing Import Transaction:* `importBackup` runs in a single read-write Dexie transaction across all 5 tables after performing up-front validation on every project and passport, guaranteeing that corrupted backups leave existing data completely untouched.

---

## Known Issues

*None recorded yet.*
