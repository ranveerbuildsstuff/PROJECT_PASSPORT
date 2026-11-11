# Sources & Fact-Check Notes — November 11, 2026 (Introductory Architecture Post)

## Technical Claims and Repo Ground Truth

| Claim in Post | Codebase Ground Truth | Verification Status |
|---------------|------------------------|---------------------|
| Project Passport is local-first with zero cloud telemetry | `SPEC.md` Section 2 ("No backend or remote AI dependency... zero outbound data transmission") and Section 13 ("Privacy Rule") | Verified ✅ |
| Storage layer uses Dexie (IndexedDB) with atomic transactions | `src/storage/db.ts` & `src/storage/storageService.ts` (`db.transaction('rw', [...], ...)`) | Verified ✅ |
| Pure Zod domain schema as single source of truth | `src/domain/passport.schema.ts` (`z.infer<typeof ...>`) | Verified ✅ |
| 7-point handoff readiness score | `src/domain/readiness.ts` (computes score across 7 checks) | Verified ✅ |
| Slices 0 through 4b completed | `PROGRESS.md` & `TASKS.md` (Slice 4b marked `[x]`) | Verified ✅ |
| 103 Vitest unit tests passing | `PROGRESS.md` line 181 (103 Vitest tests passing) | Verified ✅ |
| 68 Playwright E2E tests passing on desktop and 360x640 mobile | `PROGRESS.md` line 181 (68 Playwright tests passing) | Verified ✅ |
| Zero axe-core accessibility violations | `e2e/helpers.ts` (`expectNoSeriousA11y(page)`) & `TASKS.md` | Verified ✅ |
| Debounced autosave (600ms) with merge-on-save | `src/pages/passport/useAutosave.ts` (600ms debounce timer) | Verified ✅ |
| Next milestone is Slice 5 (capture prompt & merge UI) | `TASKS.md` line 193 ("Slice 5: Capture Prompt, Reconstruct Prompt, Paste-back & Merge") | Verified ✅ |
| Tagline: "The AI is replaceable; the project is not." | `SPEC.md` Section 1, line 7 | Verified ✅ |

All claims match repository artifacts with zero fictionalization or metric exaggeration.
