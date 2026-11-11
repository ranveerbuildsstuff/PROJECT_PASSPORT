# Project Passport — Brand & Content Guidelines

## 1. Brand Identity

### Tagline
**"The AI is replaceable; the project is not."**

### One-Liner
Project Passport is a local-first web app that creates portable, structured project context so developers can continue AI-assisted work across any tool — without re-explaining everything.

### Visual Identity
- **Primary palette:** Dark (`#0E1116` background, `#E6EDF3` text) with brass accent (`#C9A227`)
- **Secondary palette:** Light (`#F6F8FA` background, `#1F2328` text) with brass (`#745706`)
- **Typography:** Inter (body), JetBrains Mono (code/technical)
- **Style:** Clean, precise, technical, minimal — like an engineer's workbench
- **Anti-patterns:** No neon gradients, no glassmorphism, no flashy AI aesthetics, no stock photos

### Tone of Voice
- Honest, factual, engineering-first — zero hype, zero fluff
- High technical density — explain architecture, edge cases, data structures, and trade-offs
- Personal and grounded — an authentic developer speaking openly from the terminal
- Educational — every post must teach a concrete concept (state machines, schema invariants, storage rollbacks, token budgeting)
- Direct and respectful of reader time

---

## 2. Strict Anti-AI Writing Standards

Posts that look "AI-generated" immediately repel developers and technical leaders. To ensure all content sounds authentically human and senior-engineer credible, enforce these rules:

### Forbidden AI Tropes & Patterns
1. **The Formulaic Melodrama Hook:**
   - ❌ "I spent 47 hours doing X. Then tragedy struck."
   - ❌ "Most developers think X. They couldn't be more wrong."
   - ❌ "Here is what nobody tells you about X..."
   - ✅ Open directly with the architectural dilemma, surprising code behavior, or practical workflow bottleneck.
2. **Emoji Pollution:**
   - ❌ No rocket ships (🚀), pointing fingers (👇), lightbulbs (💡), fire (🔥), or checkmark walls (✅).
   - ✅ Minimalist, natural punctuation. Standard dashes (`—`) or clean bullets (`•`) when listing items.
3. **Cheesy Transitions & Filler Phrases:**
   - ❌ "Think about it." / "Here's the kicker." / "Let that sink in." / "The plot thickens." / "Fast forward to today..."
   - ❌ "In today's fast-paced AI world..." / "As a software engineer, I always strive to..."
   - ✅ Seamless technical transitions that advance the argument or narrative naturally.
4. **Hype & Superlatives:**
   - ❌ "Revolutionary", "game-changing", "supercharge", "effortless", "magical", "seamless".
   - ✅ Describe exact mechanics: "reduces token overhead by ~60%", "atomically rolls back failed mutations in IndexedDB", "enforces strict schema boundaries".
5. **Syrupy Engagement Bait:**
   - ❌ "Agree? Let me know in the comments below! 👇"
   - ❌ "What's your secret superpower when debugging?"
   - ✅ Ask a genuine, technically interesting question about architecture, workflows, or toolchain friction that peers would actually discuss.

---

## 3. Target Audience & Reader Value

| Segment | What They Care About | How We Hook Them |
|---------|---------------------|------------------|
| **Senior Developers & Architects** | System resilience, schema design, data integrity, local-first tradeoffs | Deep dives into IndexedDB transactional rollback, Zod schema validation, off-thread workers |
| **Indie Hackers & Solo Founders** | Shipping velocity, building in public without vanity metrics, tooling decisions | Realistic progress logs, test coverage rigor, building local-first tools without monthly SaaS burn |
| **Engineers using AI Assistants** | Context drift, token limits, re-prompting fatigue, model switching | Clear explanations of how structured context files preserve intent better than raw chat dumps |
| **Frontend & Fullstack Devs** | Modern React, TypeScript strict mode, accessible UI primitives, performance | Concrete examples of auto-growing textareas, debounced autosave state machines, WCAG AA compliance |

---

## 4. Content Pillars

### Pillar 1: Build-in-Public Engineering Reality (35%)
Real code diffs, unexpected edge cases, test suite progressions, honest architectural pivots.

### Pillar 2: Technical Deep Dives (35%)
How local-first storage actually works in browsers, schema migration without backends, token estimation heuristics, secret redaction engines.

### Pillar 3: Problem Space & AI Workflow Friction (20%)
Why long chat contexts hallucinate, why raw chat export JSONs are noisy, and how structured project manifests fix AI amnesia.

### Pillar 4: Tooling & Industry Reflections (10%)
Reflections on local-first vs cloud architectures, privacy-first software design, and open development.

---

## 5. Platform-Specific Publishing Rules

### LinkedIn (Long-Form Technical Memo)
- **Target:** 1,200–2,200 characters.
- **Form:** Structured like a senior engineering post or technical blog excerpt.
- **Style:** Clear paragraphs (2–4 sentences each), whitespace for readability, precise technical vocabulary.
- **Hashtags:** 3–4 focused tags: `#SoftwareEngineering #LocalFirst #WebDev #BuildInPublic`

### X / Twitter (High-Signal Technical Thread or Punchy Post)
- **Target:** 3–6 tweet thread or punchy standalone post.
- **Style:** Direct, high-density, no thread-hooks ("A thread 🧵👇"). Let tweet 1 stand on its own as a valuable thought.
- **Hashtags:** Max 1–2 or none.

---

## 6. Visual Content Standards

- **Dimensions:** 1200×675px (16:9)
- **Palette:** `#0E1116` (bg), `#E6EDF3` (text), `#C9A227` (brass accent), `#2A313C` (subtle border)
- **Content:** Architecture diagrams, schema trees, state machines, clean code snippets, or actual app screenshots.
- **Requirement:** Clean typography, generous margins, zero visual noise or neon decorations. Always include descriptive alt text.

---

## 7. Composio MCP Publishing Pipeline

- **Server:** `composio_composio`
- **LinkedIn Tool:** `LINKEDIN_CREATE_LINKED_IN_POST` via `COMPOSIO_MULTI_EXECUTE_TOOL`
  - Author URN: `urn:li:person:EFi4Y6e1mo` (Ranveer Singh Rajput)
- **X Tool:** `TWITTER_CREATION_OF_A_POST` via `COMPOSIO_MULTI_EXECUTE_TOOL`
  - Setup link when needed: `https://dashboard.composio.dev/~/org/connect/apps/twitter?open=true`
