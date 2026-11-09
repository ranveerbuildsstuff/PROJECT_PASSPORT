# PROGRESS.md — Project Roadmap & Status

Current slice: none (Slice 1 complete)

## Slices Checklist

- [x] Slice 1: Scaffold + domain model (schema, readiness, tokens, markdown renderer)
- [ ] Slice 2: Local storage (Dexie, service layer, backup/restore)
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

---

## Known Issues

*None recorded yet.*
