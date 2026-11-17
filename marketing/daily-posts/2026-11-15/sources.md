# Sources & References — 2026-11-15

## Verified Commits
- `214c753`: Slice 6: conversation paste import and reconstruct prompt
- `81bf125`: Slice 6b: conversation import closeout
- `6fd07fc`: Slice 7: ChatGPT and Claude export import
- `19c3c8c`: Slice 7b: export import closeout
- `7880f92`: Slice 8: project files and secret scanner
- `53cd5d3`: Slice 8b: files and scanner closeout

## Key Source Files
- `src/import/files.worker.ts`: Web Worker orchestrating file/zip extraction, decodeFileName traversal hook, and secret detection.
- `src/domain/secretScanner.ts`: Deterministic regex patterns for credential detection and masking.
- `tests/import/filesWorker.test.ts`: Test proving hard-blocked files are never decompressed and zip archives containing relative source imports pass.
- `tests/domain/repoHygiene.test.ts`: Hygiene scan ensuring zero secret literals in repo codebase.

## Test Verification Output
- Vitest run: 556 tests passed across 46 test files.
- Command: `vitest run` (duration: 125.03s, 0 failed).
