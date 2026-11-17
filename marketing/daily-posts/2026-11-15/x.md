# Standalone Post (Option 1)

Pasting raw chat logs into an LLM fails because all tokens are treated equally. Dead-end debugging chatter crowds out architectural constraints.

We built a 4-tier priority budgeter for Project Passport: Tier 1 invariants are sacred; files & turns trim newest-first at boundaries.

---

# 3-Tweet Thread (Option 2)

Tweet 1:
Pasting raw chat logs into an LLM fails because all tokens are treated equally. Obsolete debugging chatter crowds out architectural rules.

To solve context dilution across models, we built a 4-tier deterministic priority budgeter for Project Passport.

A breakdown:

---

Tweet 2:
How the budgeter allocates tokens:
• Tier 1: Core stack, rules, next action (never trimmed)
• Tier 2: Active decisions & open bugs
• Tier 3: Code files in manifest order (whole files only)
• Tier 4: Recent turns (newest-first, trimmed strictly at message boundaries)

---

Tweet 3:
Today's milestone:
• Slices 9 & 10 closed (checkpoints, presets, full package export/import)
• 606 passing Vitest unit tests (55 files)
• Reproducible zip archives via fixed timestamps in a Web Worker
• Client-side secret gate

Everything local-first in IndexedDB.
