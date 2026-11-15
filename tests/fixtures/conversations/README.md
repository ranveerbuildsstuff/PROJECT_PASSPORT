# Conversation Test Fixtures

All conversation files in this directory are strictly synthetic test fixtures generated for unit and E2E test suites. They contain no real user data, credentials, secrets, proprietary code, or production transcripts.

## Fixture Descriptions

- `chatgpt-transcript.txt`: A synthetic transcript using OpenAI ChatGPT speaker markers (`You said:` and `ChatGPT said:`), containing markdown code blocks and technical discussions.
- `claude-transcript.txt`: A synthetic transcript using Anthropic Claude speaker markers (`Human:` and `Claude:`).
- `gemini-transcript.txt`: A synthetic transcript using Google Gemini speaker markers (`User:` and `Model:`).
- `no-markers-transcript.txt`: A continuous technical log with no speaker labels, used to test the single-turn fallback parser and manual split workflows.
- `oversized-transcript.txt`: A synthetic transcript with multiple large message turns designed to test reconstruct prompt token capping and oldest-turn trimming.
