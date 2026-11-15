# Export Test Fixtures

This directory contains synthetic test fixtures used for testing ChatGPT and Claude export ingestion.

## Synthetic Data Guarantee
In accordance with AGENTS.md invariant 7, **no real user conversations, secrets, API keys, or proprietary data are present in this directory**. All files are synthetically generated for automated unit and end-to-end tests. Real user exports belong exclusively in `/private` (which is gitignored).

## Fixture Inventory

- `chatgpt-conversations.json`: Standard ChatGPT export fixture containing multiple conversations, active tree branch walking, tool calls, and system/hidden messages.
- `chatgpt-shard-001.json`: First shard of a split ChatGPT export file (`conversations-001.json`).
- `chatgpt-shard-002.json`: Second shard of a split ChatGPT export file (`conversations-002.json`) containing overlapping and new conversations for de-duplication testing.
- `claude-export.json`: Standard Claude conversation export fixture with top-level array format, `human` and `assistant` senders, text, and multimodal content blocks.
- `claude-object-export.json`: Claude export fixture wrapped in a `{ conversations: [...] }` root object.
- `invalid-export.json`: Synthetically corrupted JSON structure to test the diagnostics panel and safe error reporting.
- `fake-archive.zip`: Synthetic mock zip file to verify that the UI detects zip archives and guides the user to unzip first.
