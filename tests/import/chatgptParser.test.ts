import { describe, it, expect } from 'vitest';
import {
  parseChatGptExport,
  type ChatGptConversation,
  type ChatGptNode,
} from '../../src/import/chatgptParser';

describe('parseChatGptExport', () => {
  it('1. parses a linear conversation from root to leaf in chronological order', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c1',
        title: 'Linear Chat',
        create_time: 1700000000,
        mapping: {
          'n-root': { id: 'n-root', parent: null, children: ['n-1'], message: null },
          'n-1': {
            id: 'n-1',
            parent: 'n-root',
            children: ['n-2'],
            message: {
              id: 'm-1',
              author: { role: 'user' },
              create_time: 1700000010,
              content: { content_type: 'text', parts: ['First user message'] },
            },
          },
          'n-2': {
            id: 'n-2',
            parent: 'n-1',
            children: [],
            message: {
              id: 'm-2',
              author: { role: 'assistant' },
              create_time: 1700000020,
              content: { content_type: 'text', parts: ['First assistant message'] },
            },
          },
        },
        current_node: 'n-2',
      },
    ];

    const result = parseChatGptExport(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('Linear Chat');
    expect(result[0]!.source).toBe('chatgpt');
    expect(result[0]!.turns).toHaveLength(2);
    expect(result[0]!.turns[0]).toEqual({
      id: 'm-1',
      role: 'user',
      text: 'First user message',
    });
    expect(result[0]!.turns[1]).toEqual({
      id: 'm-2',
      role: 'assistant',
      text: 'First assistant message',
    });
  });

  it('2. follows active branch pointed to by current_node', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c2',
        title: 'Branching Chat',
        mapping: {
          'n-root': { id: 'n-root', parent: null, children: ['n-u1'], message: null },
          'n-u1': {
            id: 'n-u1',
            parent: 'n-root',
            children: ['n-branch-a', 'n-branch-b'],
            message: {
              id: 'm-u1',
              author: { role: 'user' },
              content: { parts: ['Prompt'] },
            },
          },
          'n-branch-a': {
            id: 'n-branch-a',
            parent: 'n-u1',
            children: [],
            message: {
              id: 'm-a1',
              author: { role: 'assistant' },
              content: { parts: ['Answer A'] },
            },
          },
          'n-branch-b': {
            id: 'n-branch-b',
            parent: 'n-u1',
            children: [],
            message: {
              id: 'm-b1',
              author: { role: 'assistant' },
              content: { parts: ['Answer B'] },
            },
          },
        },
        current_node: 'n-branch-b',
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.turns).toHaveLength(2);
    expect(result[0]!.turns[0]!.text).toBe('Prompt');
    expect(result[0]!.turns[1]!.text).toBe('Answer B');
  });

  it('3. excludes dead/unselected branches', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c3',
        title: 'Exclude Dead Branches',
        mapping: {
          'n-root': { id: 'n-root', parent: null, children: ['n-1'], message: null },
          'n-1': {
            id: 'n-1',
            parent: 'n-root',
            children: ['n-alive', 'n-dead'],
            message: { id: 'm-1', author: { role: 'user' }, content: { parts: ['Question'] } },
          },
          'n-dead': {
            id: 'n-dead',
            parent: 'n-1',
            children: [],
            message: { id: 'm-dead', author: { role: 'assistant' }, content: { parts: ['Dead answer'] } },
          },
          'n-alive': {
            id: 'n-alive',
            parent: 'n-1',
            children: [],
            message: { id: 'm-alive', author: { role: 'assistant' }, content: { parts: ['Active answer'] } },
          },
        },
        current_node: 'n-alive',
      },
    ];

    const result = parseChatGptExport(input);
    const texts = result[0]!.turns.map((t) => t.text);
    expect(texts).toContain('Active answer');
    expect(texts).not.toContain('Dead answer');
  });

  it('4. falls back to leaf with latest create_time when current_node is missing', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c4',
        title: 'Missing Current Node',
        mapping: {
          'n-root': { id: 'n-root', parent: null, children: ['n-leaf1', 'n-leaf2'], message: null },
          'n-leaf1': {
            id: 'n-leaf1',
            parent: 'n-root',
            children: [],
            message: {
              id: 'm-leaf1',
              author: { role: 'assistant' },
              create_time: 100,
              content: { parts: ['Old leaf'] },
            },
          },
          'n-leaf2': {
            id: 'n-leaf2',
            parent: 'n-root',
            children: [],
            message: {
              id: 'm-leaf2',
              author: { role: 'assistant' },
              create_time: 200,
              content: { parts: ['New leaf'] },
            },
          },
        },
        current_node: null,
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.turns).toHaveLength(1);
    expect(result[0]!.turns[0]!.text).toBe('New leaf');
    expect(result[0]!.notes.some((n) => n.includes('current_node was missing'))).toBe(true);
  });

  it('5. falls back to leaf when current_node is dangling/invalid', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c5',
        title: 'Dangling Current Node',
        mapping: {
          'n-root': { id: 'n-root', parent: null, children: ['n-only'], message: null },
          'n-only': {
            id: 'n-only',
            parent: 'n-root',
            children: [],
            message: {
              id: 'm-only',
              author: { role: 'user' },
              content: { parts: ['Only turn'] },
            },
          },
        },
        current_node: 'non-existent-node-id',
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.turns).toHaveLength(1);
    expect(result[0]!.turns[0]!.text).toBe('Only turn');
    expect(result[0]!.notes.some((n) => n.includes('current_node was missing or invalid'))).toBe(true);
  });

  it('6. detects cycles in mapping and terminates traversal with diagnostic note', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c6',
        title: 'Cyclic Tree',
        mapping: {
          'n-1': {
            id: 'n-1',
            parent: 'n-2', // cycle: 1 -> 2 -> 1
            children: ['n-2'],
            message: { id: 'm-1', author: { role: 'user' }, content: { parts: ['Turn 1'] } },
          },
          'n-2': {
            id: 'n-2',
            parent: 'n-1',
            children: ['n-1'],
            message: { id: 'm-2', author: { role: 'assistant' }, content: { parts: ['Turn 2'] } },
          },
        },
        current_node: 'n-2',
      },
    ];

    const result = parseChatGptExport(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.notes.some((n) => n.includes('Cycle detected'))).toBe(true);
  });

  it('7. safely handles deep mapping chains up to step limit without crashing', () => {
    // Generate a deep chain of 500 nodes
    const mapping: Record<string, ChatGptNode> = {};
    for (let i = 0; i < 500; i++) {
      mapping[`node-${i}`] = {
        id: `node-${i}`,
        parent: i === 0 ? null : `node-${i - 1}`,
        children: i === 499 ? [] : [`node-${i + 1}`],
        message: {
          id: `msg-${i}`,
          author: { role: i % 2 === 0 ? 'user' : 'assistant' },
          content: { parts: [`Text ${i}`] },
        },
      };
    }

    const input: ChatGptConversation[] = [
      {
        id: 'c7',
        title: 'Deep Chain',
        mapping,
        current_node: 'node-499',
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.turns).toHaveLength(500);
    expect(result[0]!.turns[0]!.text).toBe('Text 0');
    expect(result[0]!.turns[499]!.text).toBe('Text 499');
  });

  it('8. skips system messages by default', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c8',
        title: 'System Default',
        mapping: {
          'n-1': {
            id: 'n-1',
            parent: null,
            children: ['n-2'],
            message: { id: 'm-sys', author: { role: 'system' }, content: { parts: ['Instructions'] } },
          },
          'n-2': {
            id: 'n-2',
            parent: 'n-1',
            children: [],
            message: { id: 'm-u', author: { role: 'user' }, content: { parts: ['Hi'] } },
          },
        },
        current_node: 'n-2',
      },
    ];

    const result = parseChatGptExport(input, { includeSystemHidden: false });
    expect(result[0]!.turns).toHaveLength(1);
    expect(result[0]!.turns[0]!.role).toBe('user');
  });

  it('9. includes system messages when includeSystemHidden is true', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c9',
        title: 'System Included',
        mapping: {
          'n-1': {
            id: 'n-1',
            parent: null,
            children: ['n-2'],
            message: { id: 'm-sys', author: { role: 'system' }, content: { parts: ['Instructions'] } },
          },
          'n-2': {
            id: 'n-2',
            parent: 'n-1',
            children: [],
            message: { id: 'm-u', author: { role: 'user' }, content: { parts: ['Hi'] } },
          },
        },
        current_node: 'n-2',
      },
    ];

    const result = parseChatGptExport(input, { includeSystemHidden: true });
    expect(result[0]!.turns).toHaveLength(2);
    expect(result[0]!.turns[0]!.role).toBe('system');
    expect(result[0]!.turns[0]!.text).toBe('Instructions');
    expect(result[0]!.turns[1]!.role).toBe('user');
  });

  it('10. maps tool messages to role system', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c10',
        title: 'Tool Message',
        mapping: {
          'n-1': {
            id: 'n-1',
            parent: null,
            children: [],
            message: {
              id: 'm-tool',
              author: { role: 'tool' },
              content: { parts: ['Tool execution output'] },
            },
          },
        },
        current_node: 'n-1',
      },
    ];

    const result = parseChatGptExport(input, { includeSystemHidden: true });
    expect(result[0]!.turns).toHaveLength(1);
    expect(result[0]!.turns[0]!.role).toBe('system');
    expect(result[0]!.turns[0]!.text).toBe('Tool execution output');
  });

  it('11. skips visually hidden messages by default', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c11',
        title: 'Hidden Message',
        mapping: {
          'n-1': {
            id: 'n-1',
            parent: null,
            children: ['n-2'],
            message: {
              id: 'm-hidden',
              author: { role: 'user' },
              metadata: { is_visually_hidden_from_conversation: true },
              content: { parts: ['Secret instruction'] },
            },
          },
          'n-2': {
            id: 'n-2',
            parent: 'n-1',
            children: [],
            message: { id: 'm-visible', author: { role: 'assistant' }, content: { parts: ['Visible reply'] } },
          },
        },
        current_node: 'n-2',
      },
    ];

    const result = parseChatGptExport(input, { includeSystemHidden: false });
    expect(result[0]!.turns).toHaveLength(1);
    expect(result[0]!.turns[0]!.text).toBe('Visible reply');
  });

  it('12. includes visually hidden messages when includeSystemHidden is true', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c12',
        title: 'Hidden Included',
        mapping: {
          'n-1': {
            id: 'n-1',
            parent: null,
            children: [],
            message: {
              id: 'm-hidden',
              author: { role: 'user' },
              metadata: { is_visually_hidden_from_conversation: true },
              content: { parts: ['Hidden message'] },
            },
          },
        },
        current_node: 'n-1',
      },
    ];

    const result = parseChatGptExport(input, { includeSystemHidden: true });
    expect(result[0]!.turns).toHaveLength(1);
    expect(result[0]!.turns[0]!.text).toBe('Hidden message');
  });

  it('13. substitutes image parts with [image]', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c13',
        title: 'Image message',
        mapping: {
          'n-1': {
            id: 'n-1',
            parent: null,
            children: [],
            message: {
              id: 'm-1',
              author: { role: 'user' },
              content: {
                content_type: 'multimodal_text',
                parts: [{ content_type: 'image_asset_pointer', asset_pointer: 'file-123' }],
              },
            },
          },
        },
        current_node: 'n-1',
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.turns[0]!.text).toBe('[image]');
  });

  it('14. preserves text alongside [image] for multimodal messages', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c14',
        title: 'Multimodal',
        mapping: {
          'n-1': {
            id: 'n-1',
            parent: null,
            children: [],
            message: {
              id: 'm-1',
              author: { role: 'user' },
              content: {
                parts: ['Check this design mockup:', { content_type: 'image_asset_pointer' }],
              },
            },
          },
        },
        current_node: 'n-1',
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.turns[0]!.text).toBe('Check this design mockup:\n[image]');
  });

  it('15. substitutes non-text non-image objects with [non-text content]', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c15',
        title: 'Unknown part',
        mapping: {
          'n-1': {
            id: 'n-1',
            parent: null,
            children: [],
            message: {
              id: 'm-1',
              author: { role: 'user' },
              content: {
                parts: [{ content_type: 'audio_pointer' }],
              },
            },
          },
        },
        current_node: 'n-1',
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.turns[0]!.text).toBe('[non-text content]');
  });

  it('16. extracts text from message content.text property if parts array is absent', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c16',
        title: 'Direct Text',
        mapping: {
          'n-1': {
            id: 'n-1',
            parent: null,
            children: [],
            message: {
              id: 'm-1',
              author: { role: 'user' },
              content: { text: 'Direct string text' },
            },
          },
        },
        current_node: 'n-1',
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.turns[0]!.text).toBe('Direct string text');
  });

  it('17. skips turns that have empty text', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c17',
        title: 'Empty Turns',
        mapping: {
          'n-1': {
            id: 'n-1',
            parent: null,
            children: ['n-2'],
            message: { id: 'm-empty', author: { role: 'user' }, content: { parts: ['   '] } },
          },
          'n-2': {
            id: 'n-2',
            parent: 'n-1',
            children: [],
            message: { id: 'm-valid', author: { role: 'assistant' }, content: { parts: ['Valid text'] } },
          },
        },
        current_node: 'n-2',
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.turns).toHaveLength(1);
    expect(result[0]!.turns[0]!.text).toBe('Valid text');
  });

  it('18. converts null or missing title to "Untitled conversation"', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c18',
        title: null,
        mapping: {},
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.title).toBe('Untitled conversation');
  });

  it('19. converts whitespace-only title to "Untitled conversation"', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c19',
        title: '   ',
        mapping: {},
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.title).toBe('Untitled conversation');
  });

  it('20. parses create_time in seconds to ISO timestamp string', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c20',
        title: 'Timestamp Seconds',
        create_time: 1700000000,
        mapping: {},
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.createdAt).toBe('2023-11-14T22:13:20.000Z');
  });

  it('21. parses create_time in milliseconds to ISO timestamp string', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c21',
        title: 'Timestamp MS',
        create_time: 1700000000000,
        mapping: {},
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.createdAt).toBe('2023-11-14T22:13:20.000Z');
  });

  it('22. leaves createdAt undefined when create_time is null or NaN', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c22',
        title: 'No timestamp',
        create_time: null,
        mapping: {},
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.createdAt).toBeUndefined();
  });

  it('23. handles empty mapping gracefully returning 0 turns', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c23',
        title: 'Empty Mapping',
        mapping: {},
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.turns).toHaveLength(0);
    expect(result[0]!.tokenEstimate).toBe(0);
  });

  it('24. returns empty array when input is not an array', () => {
    expect(parseChatGptExport(null)).toEqual([]);
    expect(parseChatGptExport({})).toEqual([]);
    expect(parseChatGptExport('invalid')).toEqual([]);
  });

  it('25. computes non-zero token estimate for parsed turns', () => {
    const input: ChatGptConversation[] = [
      {
        id: 'c25',
        title: 'Token Count',
        mapping: {
          'n-1': {
            id: 'n-1',
            parent: null,
            children: [],
            message: {
              id: 'm-1',
              author: { role: 'user' },
              content: { parts: ['A quick brown fox jumps over the lazy dog.'] },
            },
          },
        },
        current_node: 'n-1',
      },
    ];

    const result = parseChatGptExport(input);
    expect(result[0]!.tokenEstimate).toBeGreaterThan(5);
  });

  it('26. parses a 50,000-node ChatGPT chain without stack overflow', () => {
    const N = 50_000;
    const mapping: Record<string, ChatGptNode> = {};
    for (let i = 0; i < N; i++) {
      const id = `node-${i}`;
      const parent = i === 0 ? null : `node-${i - 1}`;
      const children = i === N - 1 ? [] : [`node-${i + 1}`];
      mapping[id] = {
        id,
        parent,
        children,
        message: {
          id: `msg-${i}`,
          author: { role: i % 2 === 0 ? 'user' : 'assistant' },
          content: { parts: [`Turn ${i}`] },
        },
      };
    }
    const input: ChatGptConversation[] = [
      {
        id: 'c-deep-50k',
        title: '50k Deep Chain',
        mapping,
        current_node: `node-${N - 1}`,
      },
    ];

    const result = parseChatGptExport(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.turns).toHaveLength(N);
    expect(result[0]!.turns[0]!.text).toBe('Turn 0');
    expect(result[0]!.turns[N - 1]!.text).toBe(`Turn ${N - 1}`);
  });
});
