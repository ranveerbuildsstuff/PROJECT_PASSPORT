# Paste-Back Synthetic Test Fixtures

This directory contains synthetic fixtures for testing the AI capture prompt paste-back parsing, repair, and validation pipeline.

## Invariants

- **Synthetic Only:** All data in this directory is entirely fictional and synthetic. No real user exports, API keys, credentials, or proprietary information are stored here.
- **Pure Testing:** Used by Vitest unit tests and Playwright E2E browser tests to verify extraction resilience, error diagnostics, and offline integrity.

## Fixture Manifest

- `valid-reply.txt`: A valid markdown fenced JSON AI reply containing typographic smart double quotes (`“`, `”`), a trailing comma in the root object, and surrounding conversational prose. Exercises delimiter conversion, trailing comma removal, and successful section extraction.
- `truncated-reply.txt`: An incomplete markdown fenced JSON AI response that terminates abruptly mid-string without closing quotes or braces. Exercises the `truncated` error detection path with plain-language recovery guidance.
