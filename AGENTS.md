# AGENTS.md — Engineering Rules

## 1. Read Order & File Map

When starting any slice or answering any question, always read files in this exact sequence:
1. `SPEC.md` — What the product is, product rules, and single source of truth.
2. `AGENTS.md` — How we build, technical rules, and architecture constraints.
3. `DESIGN.md` — Look and feel, palettes, typography, UI patterns, and restrictions.
4. `TASKS.md` — What the active slice contains, tasks checklist, and acceptance criteria.
5. `PROGRESS.md` — What currently exists, decisions made, deviations, and known issues.

## 2. Technical Stack

- **Architecture:** Single Vite web application (strictly **NOT** a monorepo).
- **Core:** React, TypeScript (strict mode enabled), Tailwind CSS, React Router.
- **Testing:** Vitest + React Testing Library (+ `fake-indexeddb` for storage testing); Playwright + `@axe-core/playwright` for automated E2E browser and accessibility testing.
- **Code Quality:** ESLint + Prettier.
- **Data Validation:** Zod (single source of truth for runtime and static types).
- **Client Storage:** Dexie (IndexedDB wrapper).
- **Archive Generation:** JSZip.
- **PWA (Slice 11):** `vite-plugin-pwa`.
- **Typography:** Self-hosted fonts via `@fontsource/inter` and `@fontsource/jetbrains-mono`.
- **Icons:** `lucide-react`.
- **Dependency Policy:** Dependencies must only be installed in the specific slice that requires them. **Never install any other package without explicit user permission.**
- **Platform Compatibility:** Must run on Windows PowerShell. No Bash-only shell scripts. Always use `npm` as the package manager.

## 3. Directory Layout & Dependency Direction

```text
src/
├── domain/       # Pure types and core business logic (imports only zod)
├── storage/      # Dexie database definitions and storage service layer
├── import/       # Parsing logic for pasted chats, ChatGPT/Claude exports, workers
├── export/       # Handoff packaging, prompt synthesis, zip generators
├── ui/           # Reusable presentational components (design system)
├── pages/        # Route components and view screens
└── lib/          # General pure utilities (date formatting, string helpers)

tests/
└── fixtures/     # Synthetic test fixtures ONLY, accompanied by a descriptive README.md

private/          # Gitignored directory for real user test files and exports
```

### Strict Architectural Boundaries

- **Direction of Dependencies:**
  `src/pages` and `src/ui` → `src/storage`, `src/import`, `src/export` → `src/domain`
- `src/domain` is strictly pure: it depends **only** on Zod. It must never import React, Dexie, DOM APIs, or UI libraries.
- The UI layer must **never** touch Dexie directly; it must interface solely with the storage service layer.

## 4. Engineering Rules & Invariants

1. **Schema Authority:**
   Zod schemas in `src/domain` are the sole source of truth for data models. Types are extracted solely via `z.infer`. No duplicate manual TypeScript interfaces.
2. **Pure Business Logic:**
   All parsing, merging, secret scanning, visual diffing, token budgeting, and Markdown generation must reside in pure, deterministic functions with thorough unit tests. UI components are thin wrappers that invoke these functions.
3. **Off-Thread Processing:**
   Heavy operations (Zip generation, parsing large conversation JSON archives, file scanning) must execute within a Web Worker to keep the UI responsive.
4. **Zero Outbound Data Transmission:**
   No network requests containing user data. No external analytics, telemetry, remote monitoring, or external CDNs (fonts and assets are bundled locally via npm packages).
5. **No Secrets in Repository:**
   No API keys, access tokens, or sensitive values in the repository or bundle. If a secret seems required, **STOP and ask the user immediately**.
6. **Zero Content Logging:**
   Never log user content (conversations, file contents, code, or passport fields) to `console.log`, `console.error`, or URLs.
7. **Synthetic Test Data Only:**
   Real user exports or project files belong in `/private` (which is gitignored). Automated test suites must use synthetic mock fixtures in `tests/fixtures/`.
8. **Plain-Language User Feedback:**
   Validation and system errors shown to users must be expressed in clear, human language with actionable next steps—never raw Zod error arrays or uncaught stack traces.
9. **Mobile-First & Accessible Design:**
   Designed for minimum viewport `360x640`. Touch targets must be at least `44x44px`. No hover-only interactions. Full keyboard accessibility, visible focus indicators, and strict WCAG contrast compliance.
10. **Test Coverage per Slice:**
    Every slice must deliver comprehensive Vitest unit tests verifying all logic introduced.
11. **Single Source of Truth Maintenance:**
    Maintain `SPEC.md` as the ultimate authority. When behavior or product decisions change, update `SPEC.md` within the same slice and record the rationale in `PROGRESS.md`.
12. **Automated E2E Testing & Browser Invariants:**
    - Playwright launches its own throwaway headless browser. NEVER use MCP chrome-devtools tools, browser subagents, remote debugging ports, or the user's real Chrome profile (no `launchPersistentContext` with a user data dir, no `--remote-debugging-port`, never close or restart the user's Chrome).
    - Dedicated E2E web server runs strictly on port `4179` (`127.0.0.1:4179`), started and stopped automatically by Playwright's `webServer` configuration.
    - Two projects must be tested: `desktop` (1280x800) and `mobile-360` (viewport 360x640, `isMobile: true`, `hasTouch: true`).
13. **Test Integrity Rules:**
    - **No conditional guards around assertions:** Never wrap an assertion in `if (await x.isVisible())` or similar guards; branch strictly on deterministic metadata like `test.info().project.name`.
    - **No `.catch(() => {})` in specs:** Catch-all error swallowing is strictly forbidden in test specs, except for explicitly documented resource cleanup (e.g. removing temporary style tags injected for screenshots).
    - **Selftests for parsed/normalized assertions:** Any assertion or helper that parses, normalizes, or transforms a value (such as canvas background alpha extraction or contrast metrics) must include automated selftests in `e2e/helpers.selftest.spec.ts` proving it fails on non-conforming values.
    - **Exact text assertions on counts:** Text assertions verifying item or restored entity counts must use exact matching (e.g. `getByText('Restored 1 project', { exact: true })`).
    - **Execution time ceiling:** No individual test may exceed 20 seconds. Heavy tests spanning multiple views or dialogs must be split into dedicated per-screen tests with one accessibility scan each.
    - **Deterministic state transitions:** Observe state changes and transitions using DOM observers (such as `MutationObserver`) or distinct event listeners rather than loose regexes matching either the starting or ending state (e.g. no `/Saving|Saved/`).
    - **Failure disclosure (Rule 13.7):** Any failed run during a ticket is reported with its error text and the change that fixed it, even if a later run passes.

## 5. Per-Slice Execution Process

For every implementation ticket, follow this exact workflow:
1. **Read:** Examine `SPEC.md`, `AGENTS.md`, `DESIGN.md`, `TASKS.md`, and `PROGRESS.md`.
2. **Plan:** Post a concise plan (maximum 10 lines outlining files to touch and clarifying any ambiguities). If ambiguous, ask before writing code; otherwise proceed.
3. **Scope Control:** Touch nothing outside the assigned slice scope. Do not build ahead.
4. **Implementation & E2E Testing:**
   Every slice that changes the UI ships Playwright specs in `e2e/` for each user-visible flow it adds (run on desktop and mobile-360), including empty, error and keyboard-only paths, and an axe scan of each new screen. Run `npm run test:e2e` yourself, fix the CODE until green (fix a test only if the test is wrong, and say why; never weaken, skip or delete a test), and report the raw list-reporter output. Do NOT hand me a manual test checklist for anything that can be automated; list separately only what genuinely cannot be (a real phone, subjective look).
5. **Visual Self-Review:**
   After screenshots are produced, if you can view images, inspect them against `DESIGN.md` and list issues found and fixed.
6. **Verification Gate:**
   Before finalizing, ensure the following commands pass with zero errors:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - `npm run build`
   - `npm run test:e2e`
   Update `PROGRESS.md`, check off completed items in `TASKS.md`, and commit:
   `git commit -m "Slice N: <title>"` (or ticket prefix, e.g. `T1: <title>`).
7. **Completion Report:**
   Conclude by reporting:
   - Summary of accomplishments
   - List of created and modified files
   - Raw list-reporter output of `npm run test:e2e`
   - Vitest test suite count and pass status
   - Any non-automatable observations (if applicable)
8. **Stop:** Cease execution and await the user's direction.

*Note on contradictions:* If a user ticket explicitly contradicts `SPEC.md`, the ticket wins. Update `SPEC.md` in that ticket and document the modification under "Decisions & deviations" in `PROGRESS.md`.
