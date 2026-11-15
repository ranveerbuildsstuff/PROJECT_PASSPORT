import { describe, it, expect, vi } from 'vitest';
import { parsePastedConversation } from '../../src/import/pasteParser';

// Shared plain-language validation error assertion helper
export function assertPlainLanguage(text: string): void {
  expect(text).not.toMatch(/invalid_|Expected|undefined|\[object|ZodError|\{/);
}

describe('pasteParser', () => {
  describe('table of marker and edge cases (25+ cases)', () => {
    // 1-9: Each marker alone in title/standard case
    const markers: Array<{ marker: string; expectedRole: 'user' | 'assistant'; expectedSource: string }> = [
      { marker: 'You said:', expectedRole: 'user', expectedSource: 'chatgpt' },
      { marker: 'ChatGPT said:', expectedRole: 'assistant', expectedSource: 'chatgpt' },
      { marker: 'Human:', expectedRole: 'user', expectedSource: 'claude' },
      { marker: 'Claude:', expectedRole: 'assistant', expectedSource: 'claude' },
      { marker: 'Gemini:', expectedRole: 'assistant', expectedSource: 'gemini' },
      { marker: 'Model:', expectedRole: 'assistant', expectedSource: 'gemini' },
      { marker: 'User:', expectedRole: 'user', expectedSource: 'paste' },
      { marker: 'Assistant:', expectedRole: 'assistant', expectedSource: 'paste' },
      { marker: 'Me:', expectedRole: 'user', expectedSource: 'paste' },
    ];

    markers.forEach(({ marker, expectedRole, expectedSource }, idx) => {
      it(`Case ${idx + 1}: parses standard marker alone: "${marker}"`, () => {
        const text = `${marker}\nHello from test ${idx + 1}`;
        const res = parsePastedConversation(text);
        expect(res.ok).toBe(true);
        if (res.ok) {
          expect(res.turns).toHaveLength(1);
          expect(res.turns[0]?.role).toBe(expectedRole);
          expect(res.turns[0]?.text).toBe(`Hello from test ${idx + 1}`);
          expect(res.source).toBe(expectedSource);
        }
      });
    });

    // 10-14: Lowercase markers
    it('Case 10: parses lowercase "you said:" and "chatgpt said:"', () => {
      const text = 'you said:\nWhat is local-first?\nchatgpt said:\nLocal-first keeps data on device.';
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.turns).toHaveLength(2);
        expect(res.turns[0]?.role).toBe('user');
        expect(res.turns[1]?.role).toBe('assistant');
        expect(res.source).toBe('chatgpt');
      }
    });

    it('Case 11: parses lowercase "human:" and "claude:"', () => {
      const text = 'human:\nHelp with React\nclaude:\nHere is a solution.';
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.turns).toHaveLength(2);
        expect(res.turns[0]?.role).toBe('user');
        expect(res.turns[1]?.role).toBe('assistant');
        expect(res.source).toBe('claude');
      }
    });

    it('Case 12: parses lowercase "model:" and "gemini:"', () => {
      const text = 'user:\nExplain indexing\nmodel:\nAn index speeds up lookup.';
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.turns).toHaveLength(2);
        expect(res.turns[0]?.role).toBe('user');
        expect(res.turns[1]?.role).toBe('assistant');
        expect(res.source).toBe('gemini');
      }
    });

    it('Case 13: parses lowercase "me:" and "assistant:"', () => {
      const text = 'me:\nStatus update\nassistant:\nAll tasks are complete.';
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.turns).toHaveLength(2);
        expect(res.turns[0]?.role).toBe('user');
        expect(res.turns[1]?.role).toBe('assistant');
        expect(res.source).toBe('paste');
      }
    });

    // 14-16: Mixed case markers
    it('Case 14: parses mixed case "YoU sAiD:" and "ChAtGpT sAiD:"', () => {
      const text = 'YoU sAiD: Hello\nChAtGpT sAiD: Hi';
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.turns).toHaveLength(2);
        expect(res.source).toBe('chatgpt');
      }
    });

    it('Case 15: parses mixed case "HuMaN:" and "cLaUdE:"', () => {
      const text = 'HuMaN: Question\ncLaUdE: Answer';
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.turns).toHaveLength(2);
        expect(res.source).toBe('claude');
      }
    });

    it('Case 16: ignores marker placed mid-line', () => {
      const text = 'User: I asked ChatGPT said: but it was inside a sentence.\nAssistant: Understood.';
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.turns).toHaveLength(2);
        expect(res.turns[0]?.text).toContain('ChatGPT said: but it was inside a sentence.');
      }
    });

    it('Case 17: treats marker inside a code block as a marker (pinned behavior)', () => {
      const text =
        'User: Here is some code:\n```typescript\nUser: let x = 1;\n```\nAssistant: Code received.';
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        // Because markers are line-oriented and intentionally not blocked by code fences,
        // 'User: let x = 1;' is recognized as a turn start
        expect(res.turns.length).toBeGreaterThan(2);
      }
    });

    it('Case 18: mixed vendor markers produce source="paste"', () => {
      const text = 'You said: Initial prompt\nClaude: I am responding now.';
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.source).toBe('paste');
      }
    });

    it('Case 19: text before first marker becomes a note and is prepended to first turn', () => {
      const text = 'Preamble note before anything starts\n\nUser: Actual first question\nAssistant: Reply';
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.notes).toContain('Text before the first speaker label was added to the first message.');
        expect(res.turns[0]?.text).toContain('Preamble note before anything starts');
        expect(res.turns[0]?.text).toContain('Actual first question');
      }
    });

    it('Case 20: normalizes CRLF line breaks to LF seamlessly', () => {
      const text = 'User:\r\nLine 1\r\nLine 2\r\n\r\nAssistant:\r\nAnswer line 1\r\nAnswer line 2';
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.turns).toHaveLength(2);
        expect(res.turns[0]?.text).toBe('Line 1\nLine 2');
        expect(res.turns[1]?.text).toBe('Answer line 1\nAnswer line 2');
      }
    });

    it('Case 21: returns empty code and plain-language message for empty or whitespace-only input', () => {
      const emptyRes = parsePastedConversation('');
      expect(emptyRes.ok).toBe(false);
      if (!emptyRes.ok) {
        expect(emptyRes.code).toBe('empty');
        expect(emptyRes.message).toBe(
          'Nothing to import yet. Paste a conversation into the box above, then choose Parse.'
        );
        assertPlainLanguage(emptyRes.message);
      }

      const whitespaceRes = parsePastedConversation('   \n\t   \r\n   ');
      expect(whitespaceRes.ok).toBe(false);
      if (!whitespaceRes.ok) {
        expect(whitespaceRes.code).toBe('empty');
      }
    });

    it('Case 22: returns too_large code for input over 1,000,000 characters', () => {
      const huge = 'A'.repeat(1_000_001);
      const res = parsePastedConversation(huge);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('too_large');
        expect(res.message).toBe('This text is over 1 MB. Paste one conversation at a time.');
        assertPlainLanguage(res.message);
      }
    });

    it('Case 23: returns fallback single user turn and note when no markers exist', () => {
      const text = 'Just some unstructured plain text log notes.\nLine two.\nLine three.';
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.turns).toHaveLength(1);
        expect(res.turns[0]?.role).toBe('user');
        expect(res.turns[0]?.text).toBe(text);
        expect(res.source).toBe('paste');
        expect(res.notes).toContain(
          'We couldn\'t find speaker labels such as "User:" or "ChatGPT said:". The text is kept as one message. Use Split to divide it, or flip its role.'
        );
      }
    });

    it('Case 24: parses a single turn cleanly', () => {
      const text = 'User: Only one message here with some content.';
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.turns).toHaveLength(1);
        expect(res.turns[0]?.role).toBe('user');
        expect(res.turns[0]?.text).toBe('Only one message here with some content.');
      }
    });

    it('Case 25: parses consecutive same-role turns into separate messages', () => {
      const text = 'User: First message\nUser: Second message\nUser: Third message';
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.turns).toHaveLength(3);
        expect(res.turns.every((t) => t.role === 'user')).toBe(true);
        expect(res.turns[0]?.text).toBe('First message');
        expect(res.turns[1]?.text).toBe('Second message');
        expect(res.turns[2]?.text).toBe('Third message');
      }
    });

    it('Case 26: handles unicode and emojis without corruption', () => {
      const text = 'User: 🚀 Project status update with emoji and unicode: 日本語 / العربية\nAssistant: Verified! ✨';
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.turns[0]?.text).toContain('🚀');
        expect(res.turns[0]?.text).toContain('日本語');
        expect(res.turns[1]?.text).toContain('✨');
      }
    });

    it('Case 27: handles very long lines gracefully', () => {
      const longLine = 'LongLineContent '.repeat(5000);
      const text = `User:\n${longLine}\nAssistant:\nOK`;
      const res = parsePastedConversation(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.turns).toHaveLength(2);
        expect(res.turns[0]?.text.length).toBeGreaterThan(50000);
      }
    });
  });

  describe('fuzz test (500 seeded PRNG mutations)', () => {
    // Seeded linear congruential generator (PRNG)
    function createPRNG(seed: number) {
      let state = seed;
      return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
      };
    }

    it('never throws and always returns a typed result across 500 mutations', () => {
      const rand = createPRNG(1337);
      const baseTranscript = `You said:
Let us test the conversation parser with random mutations.

ChatGPT said:
I will respond to whatever mutations occur.
\`\`\`typescript
const val = 42;
\`\`\`

You said:
Final note.`;

      for (let i = 0; i < 500; i++) {
        let mutated = baseTranscript;
        const mutationType = Math.floor(rand() * 5);

        if (mutationType === 0) {
          // Insert random control chars or newlines
          const pos = Math.floor(rand() * mutated.length);
          mutated = mutated.slice(0, pos) + '\r\n\t\0' + mutated.slice(pos);
        } else if (mutationType === 1) {
          // Truncate or slice randomly
          const cut = Math.floor(rand() * mutated.length);
          mutated = mutated.slice(cut);
        } else if (mutationType === 2) {
          // Insert partial marker mid-text
          const pos = Math.floor(rand() * mutated.length);
          mutated = mutated.slice(0, pos) + '\nChatGPT said:\n' + mutated.slice(pos);
        } else if (mutationType === 3) {
          // Replace chunks with unicode or whitespace
          const pos = Math.floor(rand() * mutated.length);
          mutated = mutated.slice(0, pos) + ' 🤖 🔥 \n\r\n ' + mutated.slice(pos + 5);
        } else {
          // Duplicate sections
          mutated = mutated + '\n' + mutated;
        }

        expect(() => {
          const result = parsePastedConversation(mutated);
          expect(typeof result.ok).toBe('boolean');
          if (result.ok) {
            expect(Array.isArray(result.turns)).toBe(true);
            expect(Array.isArray(result.notes)).toBe(true);
          } else {
            expect(typeof result.code).toBe('string');
            expect(typeof result.message).toBe('string');
          }
        }).not.toThrow();
      }
    });
  });

  describe('performance benchmark', () => {
    it('parses a 1,000,000-character transcript in under 100ms on the main thread', () => {
      // Build a 1,000,000 character string of realistic turns
      const turnChunk = 'You said:\nTesting performance at scale.\nChatGPT said:\nHere is a 1000 char response chunk '.padEnd(1000, '.') + '\n';
      const repeats = Math.floor(1_000_000 / turnChunk.length);
      const text = turnChunk.repeat(repeats);

      expect(text.length).toBeLessThanOrEqual(1_000_000);
      expect(text.length).toBeGreaterThan(900_000);

      const start = performance.now();
      const res = parsePastedConversation(text);
      const elapsed = performance.now() - start;

      expect(res.ok).toBe(true);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('safety: zero content logging', () => {
    it('never logs pasted conversation contents or sentinel strings to console', () => {
      const sentinel = 'SECRET_SENTINEL_CONTENT_DO_NOT_LOG_998877';
      const text = `User: My password is ${sentinel}\nAssistant: Acknowledged.`;

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const result = parsePastedConversation(text);
        expect(result.ok).toBe(true);

        const allCalls = [
          ...logSpy.mock.calls.flat(),
          ...errorSpy.mock.calls.flat(),
          ...warnSpy.mock.calls.flat(),
        ].map(String);

        for (const call of allCalls) {
          expect(call).not.toContain(sentinel);
        }
      } finally {
        logSpy.mockRestore();
        errorSpy.mockRestore();
        warnSpy.mockRestore();
      }
    });
  });
});
