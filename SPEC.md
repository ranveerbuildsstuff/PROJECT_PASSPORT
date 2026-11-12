# SPEC.md — Product & Rules (Single Source of Truth)

## 1. What It Is

"Project Passport" (working name) is a local-first web application. A user keeps a structured, portable record of an AI-assisted project (goal, stack, decisions, tasks, bugs, key files, selected conversations) and exports a "handoff package" so they can continue the same project in a different AI (ChatGPT, Claude, Gemini, coding agents) without re-explaining anything.

The core philosophy: **The AI is replaceable; the project is not.**

## 2. What It Is NOT (Hard Non-Goals)

- **No subscription, quota, or limit bypasses:** It cannot and never claims to transfer subscriptions, quotas, or usage limits, or bypass model limits. It transfers context only.
- **No scraping or credential extraction:** No scraping of AI websites, no browser extensions reading AI pages, no asking for AI passwords, cookies, or session tokens.
- **No backend or remote AI dependency:** No backend, no accounts, no analytics, no AI API calls in the MVP. All data stays strictly in the user's browser (IndexedDB).
- **Strict input sources:** Input comes **ONLY** from:
  1. Text the user pastes manually.
  2. Files the user explicitly selects/uploads.
  3. Official data exports downloaded by the user themselves.

## 3. Core Flow

```text
[Capture] (AI-generated passport JSON pasted back)
    │
    ▼
[Structure] (Edit passport in editor / live preview)
    │
    ▼
[Checkpoint] (Local snapshot created)
    │
    ▼
[Export Package] (Handoff package sized for destination AI)
    │
    ▼
[Continue in New AI] (New AI reads continue prompt & context)
    │
    ▼
[Update Passport & Checkpoint Again]
```

## 4. Passport Schema v1

The schema is defined using Zod exclusively in `src/domain`. Static TypeScript types are derived solely via `z.infer<typeof ...>`. No manual duplicate interface declarations are permitted.

### Schema Specification (`schemaVersion: 1`)

- `schemaVersion`: Literal `1`
- `project`:
  - `id`: string (UUID)
  - `name`: string
  - `goal`: string
  - `summary`: string
  - `status`: `'idea'` | `'in_progress'` | `'paused'` | `'done'`
  - `createdAt`: string (ISO 8601)
  - `updatedAt`: string (ISO 8601)
- `stack`: Array of objects:
  - `name`: string
  - `role`: optional string
  - `version`: optional string
  - `notes`: optional string
- `requirements`: Array of objects:
  - `id`: string
  - `text`: string
  - `priority`: `'must'` | `'should'` | `'could'`
- `decisions`: Array of objects:
  - `id`: string
  - `decision`: string
  - `reason`: string
  - `date`: optional string
  - `status`: `'active'` | `'superseded'`
- `completed`: Array of objects:
  - `id`: string
  - `text`: string
- `tasks`: Array of objects:
  - `id`: string
  - `text`: string
  - `status`: `'todo'` | `'doing'` | `'blocked'` | `'done'`
  - `priority`: `'low'` | `'medium'` | `'high'`
- `bugs`: Array of objects:
  - `id`: string
  - `text`: string
  - `severity`: `'low'` | `'medium'` | `'high'`
  - `status`: `'open'` | `'fixed'`
- `bugsReviewed`: boolean (default `false`; `true` means the user confirms the bug list is complete, even if empty). `schemaVersion` stays 1 because the application is pre-release and no stored user data exists yet.
- `instructions`: Array of strings (user rules for the AI: style, conventions, constraints)
- `files`: Manifest array of objects:
  - `path`: string
  - `purpose`: string
  - `included`: boolean
  - `sizeBytes`: number
- `conversations`: Reference array of objects:
  - `id`: string
  - `title`: string
  - `source`: `'chatgpt'` | `'claude'` | `'gemini'` | `'paste'` | `'other'`
  - `messageCount`: number
  - `tokenEstimate`: number
  - `included`: boolean
- `nextAction`: string
- `openQuestions`: Array of strings

### Validation Error Display

Validation errors shown to users must always be translated into plain language (for example, *"Task 3 needs some text"*), never exposing raw Zod issue objects or stack traces.

## 5. Readiness Score (0–100)

Readiness measures handoff preparedness across 7 equally-weighted checks:
1. **Objective:** `project.goal` is non-empty.
2. **Stack:** At least one stack entry recorded (`stack.length > 0`).
3. **Decisions:** At least one active decision (`decisions` has an entry with `status === 'active'`).
4. **Context Attached:** At least one file or conversation attached (`files.length > 0 || conversations.length > 0`).
5. **Pending Tasks:** At least one pending task (`tasks` has an entry with `status === 'todo' || status === 'doing' || status === 'blocked'`).
6. **Bugs / Limitations:** Bugs recorded, or explicitly marked none (`bugs.length > 0 || bugsReviewed === true`).
7. **Next Action:** `nextAction` is non-empty.

**Calculation:** `score = Math.round((passedChecks / 7) * 100)`

## 6. Token Estimation

- **Formula:** `estimateTokens(text) = Math.ceil(text.length / 4)`
- **UI Rule:** All token figures displayed in the interface must be explicitly labelled with the word **"estimate"** (e.g., `~1,250 tokens (estimate)`).

## 7. Capture (No Remote AI API)

- **Capture Prompt:**
  A system-generated prompt that the user copies and pastes into their current AI assistant. It instructs the AI to:
  - Reply with **ONLY** a single valid JSON object enclosed in a single markdown code block (` ```json ... ``` `).
  - Strictly follow Passport Schema v1.
  - Leave fields empty or omitted rather than fabricating details.
  - Record decisions with explicit reasons.
  - Accurately list completed items, pending tasks, and open bugs.
  - Set `bugsReviewed` to `true` only if it knows there are no open bugs, otherwise `false`.
  - Define an explicit `nextAction`.
  - **Never** include secrets, credentials, API keys, or passwords.
- **Reconstruct Prompt:**
  Used when the original AI conversation is no longer accessible. It packages selected imported conversation turns (bounded by a token cap with a clear warning) and asks a destination AI to synthesize the initial Passport Schema v1 JSON.
- **Paste-back Processing:**
  - Extracts JSON from markdown fenced code blocks (` ```json `, ` ```JSON `, or bare ` ``` `) or raw unescaped text via an iterative $O(n)$ string-aware scanner (capped at 1,000,000 characters; never recursive).
  - Handles one-level unwrap of `{"passport": {...}}`. Any `schemaVersion` other than 1 is rejected with a plain-language error.
  - Tolerates trailing commentary, prose introductions, and automatically repairs formatting quirks (reported by repair count):
    - Smart double quotes (`“`, `”`) as structural delimiters (smart quotes inside ASCII-quoted strings are preserved as content).
    - Smart single quotes (`‘`, `’`) in structural positions.
    - Trailing commas in arrays and objects.
    - Single-line (`//`) and multi-line (`/* ... */`) comments outside strings.
    - BOM (`\uFEFF`), zero-width characters (`\u200B`, `\u200C`, `\u200D`, `\uFEFF`), and non-breaking spaces (`\u00A0`).
    - Unescaped literal newlines inside JSON strings.
  - **Allowed Coercions:**
    - `null` values are treated as omitted fields.
    - Enums are normalized case-insensitively, converting spaces and hyphens to underscores.
    - Single strings for `instructions` and `openQuestions` are coerced into one-element arrays.
    - All strings are trimmed.
    - String literals `"true"` and `"false"` are coerced to boolean for `bugsReviewed`.
    - Empty-text list items are cleanly dropped with a note.
    - Missing or duplicate item IDs are regenerated using client UUID generation.
  - **Ignored Fields:**
    - Pasted JSON may omit `id` (on items and project), `createdAt`, `updatedAt`, `schemaVersion`, `files`, and `conversations`.
    - If present, `project.id`, `createdAt`, `updatedAt`, `schemaVersion`, `files`, `conversations`, and unknown keys are never imported; they are ignored and listed to the user.
  - Validates against `PassportImportSchema` (derived from Schema v1 covering editor-owned sections).
  - Explains all validation or parsing failures in human-friendly language without raw Zod traces.
  - Computes and displays the incoming reply's own readiness score over default values.
  - Merging arrives in Slice 5b (Slice 5a focuses on capture prompt, extraction, normalisation, and verification reporting).

## 8. Conversation Import

- **Pasted Text:**
  - Detects common speaker markers at line beginnings (case-insensitive):
    `"You said:"`, `"ChatGPT said:"`, `"User:"`, `"Assistant:"`, `"Human:"`, `"Claude:"`, `"Gemini:"`, `"Me:"`, `"Model:"`.
  - If no speaker markers are detected, the input is preserved as a single message turn with manual split controls.
  - Users can flip roles (User ↔ Assistant) and split or merge messages manually.
- **ChatGPT Export (`conversations.json` / sharded `conversations-000.json`):**
  - Traverses the conversation tree: each item has `title`, `create_time`, `mapping`, and `current_node`.
  - Reconstructs the active branch by walking `current_node` up through parent pointers, then reversing.
  - Skips empty, system, and hidden messages by default (configurable via toggle).
  - Replaces non-text parts (e.g. image payloads) with readable placeholders like `[image]`.
- **Claude Export:**
  - Parses export objects containing `uuid`, `name`, `created_at`, and `chat_messages` (`sender: 'human' | 'assistant'`, `text`, `content[]`).
- **Resilience & Parsing Safety:**
  - Export formats change over time; parsers must be defensively tolerant.
  - Unknown or partially malformed formats must **NEVER** crash the application. Instead, display a diagnostics panel showing detected top-level keys versus expected structure.
  - Heavy parsing tasks run off-thread inside a Web Worker.
  - Display a prominent memory warning for files exceeding 300 MB.

## 9. Project Files & Secret Scanner

- **File Sources:**
  Accepts a project `.zip` archive, multiple selected files, or a folder upload (via directory picker).
- **Default Ignore List (Editable by User):**
  `.git`, `node_modules`, `dist`, `build`, `.next`, `.venv`, `__pycache__`, lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, etc.), binary formats, media/images, and any individual file exceeding 500 KB.
- **Hard-Blocked Files (Security Invariant):**
  The following files are **never** read, uploaded, or stored in IndexedDB under any circumstance:
  `.env*`, `*.pem`, `*.key`, `id_rsa*`, and service-account style JSON files (`*service-account*.json`, `*credentials*.json`).
  If encountered, a plain-language explanation is displayed immediately.
- **Secret Scanner (Deterministic Pure Function):**
  Scans all included files for sensitive patterns:
  - AWS Access Key IDs (`AKIA...`)
  - GitHub Personal Access Tokens (`ghp_...`, `github_pat_...`)
  - Google API Keys (`AIza...`)
  - `sk-` prefixed API keys (OpenAI, Anthropic, etc.)
  - Private key blocks (`-----BEGIN ... PRIVATE KEY-----`)
  - JSON Web Tokens (`eyJ...`)
  - Literal assignments: `password=...`, `secret=...`, `token=...`, `api_key=...`
- **Scanner Findings & Actions:**
  - Displays file path, line number, pattern category, and a **MASKED** snippet only (e.g., `sk-ant...9xQ2`).
  - Available user actions per finding:
    1. **Redact:** Scrub secret from stored copy.
    2. **Exclude File:** Remove file from handoff package.
    3. **Mark False Positive:** Retain with user acknowledgment.

## 10. Checkpoints

- **Snapshot Contents:**
  Current passport state + included conversation IDs + file manifest including SHA-256 content hashes.
- **Comparison Engine:**
  Structured visual diff generated per passport section.
- **Safety Invariant:**
  - Restoring a checkpoint **ALWAYS** creates an automated *"Before restore"* checkpoint first.
  - Applying a paste-back merge **ALWAYS** creates an automated checkpoint before mutations take effect.

## 11. Export (Handoff Package)

- **Destination Presets (Editable Token Budgets):**
  - **Lite paste:** 6,000 tokens
  - **ChatGPT:** 30,000 tokens
  - **Claude:** 60,000 tokens
  - **Gemini:** 100,000 tokens
  - **Coding Agent:** 40,000 tokens
  - **Custom:** User-specified budget
- **Budget Truncation Priority (When Over Budget):**
  1. `PROJECT_STATE.md` + core passport metadata (always retained first)
  2. Active decisions, pending tasks, and open bugs
  3. Included files (prioritized by explicit manifest order)
  4. Conversation excerpts (most recent turns first, oldest trimmed)
  *The UI must explicitly display what was included, trimmed, or omitted, along with the rationale.*
- **Package Formats:**
  - **Lite Package:** Single formatted `CONTINUE_PROMPT` markdown text copied directly to clipboard.
  - **Full Package (.zip archive):**
    - `project-passport.json` (raw valid passport schema)
    - `PROJECT_STATE.md` (human/AI-readable executive project summary)
    - `CONTINUE_PROMPT.md` (instructions for the target AI model)
    - `files/` (directory of included project source files)
    - `conversations/` (directory of included conversations formatted as Markdown)
    - `MANIFEST.json` (file and artifact hashes for integrity verification)
- **CONTINUE_PROMPT Instructions:**
  Must instruct the recipient AI to first confirm, in its own words:
  1. Project objective and scope.
  2. Active tech stack.
  3. Key architectural and implementation decisions.
  4. Current status and active bugs.
  5. Next planned task.
  *The AI must pause and ask about any ambiguities before modifying code or proposing new architecture.*
- **Secret Gate:**
  Export generation is strictly blocked whenever unresolved scanner findings exist, unless the user explicitly acknowledges a security warning override.
- **Package Import:**
  A Full `.zip` package can be imported on another machine or browser instance. Round-trip export then import must yield an identical passport data structure.

## 12. Local Storage & Full Database Backup

- **Storage Engine:**
  Dexie (IndexedDB wrapper) running strictly locally in the browser with zero remote transmission.
- **Transactional Atomicity:**
  All multi-entity mutations (`createProject`, `renameProject`, `deleteProject`, `savePassport`, `importBackup`) execute within single atomic Dexie read-write transactions (`db.transaction('rw', [...], ...)`). If any operation fails partway through, all affected tables are completely rolled back to their pre-transaction state.
- **Full Database Backup & Conflict Behaviour:**
  - Database exports produce a JSON backup archive containing projects, passports, conversations, files (with chunked base64 binary encoding), and checkpoints.
  - When importing a backup (`importBackup`), mutations execute inside a single atomic transaction spanning all storage tables.
  - **Conflict Behaviour:** When an imported backup project shares the same `id` as an existing local project, the existing project's data (passport, conversations, files, checkpoints) is atomically **REPLACED** with the backup project's data within the single transaction. Unrelated local projects with different IDs are preserved. Any old records belonging to the replaced project (such as extra conversations or files not present in the backup) are completely removed upon restore.
  - Importing into an empty database restores all included projects cleanly.
  - If writing any project within the backup fails, the entire transaction rolls back, leaving pre-existing data untouched.

## 13. Privacy Rule

User content (conversations, file contents, code snippets, passport text) **never** leaves the local device. It is **never** sent to any external server, never logged to the browser console, never included in URLs, and never included in error reports shown to third parties.

## 14. Roadmap

Build **ONE** slice per ticket. Never build ahead, but never make architecture choices that block subsequent slices.

1. **Slice 1:** Scaffold + domain model (schema, readiness, tokens, markdown renderer)
2. **Slice 2:** Local storage (Dexie, service layer, backup/restore)
3. **Slice 3:** App shell, design system, dashboard
4. **Slice 4:** Passport editor + live preview
5. **Slice 5:** Capture prompt, reconstruct prompt, paste-back + merge
6. **Slice 6:** Conversation paste import
7. **Slice 7:** ChatGPT / Claude export import
8. **Slice 8:** Project files + secret scanner
9. **Slice 9:** Checkpoints (timeline, compare, restore)
10. **Slice 10:** Export package, destination presets, import package
11. **Slice 11:** Polish, PWA, landing + privacy pages, deploy docs

## 15. Parking Lot (NOT in MVP; Do Not Build, Do Not Block)

- Cloud synchronization across devices
- User accounts, authentication, or cloud database profiles
- Payment processing or premium tiers
- Direct GitHub / GitLab / Bitbucket API integration
- Model Context Protocol (MCP) server integration
- Multi-user / team collaboration features
- Automated provider usage-limit detection
- Automatic multi-conversation algorithmic merging
- In-app AI summarization powered by user-provided API keys
