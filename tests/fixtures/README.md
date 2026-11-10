# Synthetic Test Fixtures

This directory contains strictly synthetic, non-sensitive mock datasets designed for automated Vitest unit and integration test suites.

> **Security & Privacy Invariant:** Never commit real user data, private project exports, API keys, credentials, or personal conversations to `tests/fixtures/`. Real user test files belong exclusively in `/private` (which is gitignored).

---

## Fixtures Directory

### 1. `ecommerce-passport.json`
- **Description:** A synthetic, realistic Project Passport (Schema v1) representing a fictional e-commerce storefront project called *"Aura Commerce Storefront"*.
- **Key Characteristics:**
  - `schemaVersion`: 1
  - Realistic multi-item tech stack (Next.js, TypeScript, Tailwind CSS, Prisma, Stripe).
  - Explicit requirements across all three priority tiers (`must`, `should`, `could`).
  - Active and superseded architectural decisions with explicit justifications.
  - Completed items and ongoing tasks with various statuses (`doing`, `todo`, `blocked`).
  - Open and fixed bug reports with varying severities (`low`, `medium`, `high`).
  - `bugsReviewed`: `false` (bugs are actively listed, satisfying readiness check 6 via `bugs.length > 0`).
  - AI instructions and constraints.
  - Manifest of key files with purpose descriptions and byte sizes.
  - Conversation references from ChatGPT and Claude with token estimates.
  - Explicit next action and open questions.
- **Readiness Score:** 100% (satisfies all 7 readiness criteria).

### 2. `corrupted-backup.json`
- **Description:** Malformed JSON file (missing closing bracket) used to verify that file import displays plain-language syntax error feedback.

### 3. `invalid-structure-backup.json`
- **Description:** Valid JSON file missing mandatory backup root properties (`backupVersion` and `projects`), used to verify that structure format errors are caught with plain-language guidance.

### 4. `unknown-version-backup.json`
- **Description:** Valid JSON backup archive with an unsupported `backupVersion` (99), used to verify that version mismatch errors report plain-language explanations without crashes.
