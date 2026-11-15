import { describe, it, expect } from 'vitest';
import { parseChatGptExport } from '../../src/import/chatgptParser';
import { parseClaudeExport } from '../../src/import/claudeParser';
import { parseExportFiles } from '../../src/import/parseExport';

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('fuzzExport tests', () => {
  it('handles 500 seeded pseudo-random mutations without throwing or crashing', () => {
    const rng = seededRandom(42);

    const baseChatGpt = [
      {
        id: 'fuzz-c1',
        title: 'Fuzz Base',
        create_time: 1700000000,
        mapping: {
          'n-1': {
            id: 'n-1',
            parent: null,
            children: ['n-2'],
            message: { id: 'm-1', author: { role: 'user' }, content: { parts: ['Hello'] } },
          },
          'n-2': {
            id: 'n-2',
            parent: 'n-1',
            children: [],
            message: { id: 'm-2', author: { role: 'assistant' }, content: { parts: ['World'] } },
          },
        },
        current_node: 'n-2',
      },
    ];

    const baseClaude = [
      {
        uuid: 'fuzz-cl-1',
        name: 'Fuzz Claude',
        created_at: '2026-11-01T10:00:00.000Z',
        chat_messages: [
          { uuid: 'm-1', sender: 'human', text: 'Prompt' },
          { uuid: 'm-2', sender: 'assistant', text: 'Response' },
        ],
      },
    ];

    for (let i = 0; i < 500; i++) {
      const mode = Math.floor(rng() * 3);

      if (mode === 0) {
        // Mutate ChatGPT export
        const mutated = JSON.parse(JSON.stringify(baseChatGpt));
        const action = Math.floor(rng() * 7);

        if (action === 0) mutated[0].current_node = null;
        else if (action === 1) mutated[0].current_node = 'non-existent';
        else if (action === 2) mutated[0].mapping = null;
        else if (action === 3) mutated[0].mapping['n-2'].parent = 'n-2'; // direct self-loop
        else if (action === 4) mutated[0].mapping['n-1'].message = null;
        else if (action === 5) mutated[0].mapping['n-1'].message.content = null;
        else if (action === 6) mutated[0].title = 12345;

        expect(() => parseChatGptExport(mutated)).not.toThrow();
      } else if (mode === 1) {
        // Mutate Claude export
        const mutated = JSON.parse(JSON.stringify(baseClaude));
        const action = Math.floor(rng() * 6);

        if (action === 0) mutated[0].chat_messages = null;
        else if (action === 1) mutated[0].chat_messages[0].sender = 'weird_sender_' + i;
        else if (action === 2) mutated[0].chat_messages[0].text = null;
        else if (action === 3) mutated[0].chat_messages[0].content = [{ type: 'unknown_type' }];
        else if (action === 4) mutated[0].name = null;
        else if (action === 5) mutated[0].created_at = 'invalid-timestamp-string';

        expect(() => parseClaudeExport(mutated)).not.toThrow();
      } else {
        // Fuzz parseExportFiles with random strings and corrupted JSON
        const rawStrings = [
          '',
          '   ',
          '{',
          '[]',
          '{"foo": "bar"}',
          '{"conversations": null}',
          'null',
          '12345',
          JSON.stringify({ random_key: 'value' }),
        ];
        const chosen = rawStrings[Math.floor(rng() * rawStrings.length)];

        expect(() =>
          parseExportFiles([{ name: `fuzz-${i}.json`, text: chosen }])
        ).not.toThrow();
      }
    }
  });
});
