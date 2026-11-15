import { describe, it, expect } from 'vitest';
import {
  parseClaudeExport,
  type ClaudeConversation,
} from '../../src/import/claudeParser';

describe('parseClaudeExport', () => {
  it('1. parses a standard top-level array of conversations', () => {
    const input: ClaudeConversation[] = [
      {
        uuid: 'cl-1',
        name: 'React Discussion',
        created_at: '2026-11-01T10:00:00.000Z',
        chat_messages: [
          { uuid: 'm-1', sender: 'human', text: 'Hello Claude' },
          { uuid: 'm-2', sender: 'assistant', text: 'Hello! How can I help?' },
        ],
      },
    ];

    const result = parseClaudeExport(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('cl-1');
    expect(result[0]!.title).toBe('React Discussion');
    expect(result[0]!.source).toBe('claude');
    expect(result[0]!.turns).toHaveLength(2);
    expect(result[0]!.turns[0]).toEqual({
      id: 'm-1',
      role: 'user',
      text: 'Hello Claude',
    });
    expect(result[0]!.turns[1]).toEqual({
      id: 'm-2',
      role: 'assistant',
      text: 'Hello! How can I help?',
    });
  });

  it('2. parses object root format with conversations array', () => {
    const input = {
      conversations: [
        {
          uuid: 'cl-obj',
          name: 'Wrapped Object',
          chat_messages: [
            { uuid: 'm-1', sender: 'human', text: 'Question' },
            { uuid: 'm-2', sender: 'assistant', text: 'Answer' },
          ],
        },
      ],
    };

    const result = parseClaudeExport(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('Wrapped Object');
    expect(result[0]!.turns).toHaveLength(2);
  });

  it('3. maps sender human to role user', () => {
    const input: ClaudeConversation[] = [
      {
        uuid: 'c3',
        chat_messages: [{ sender: 'human', text: 'Human prompt' }],
      },
    ];

    const result = parseClaudeExport(input);
    expect(result[0]!.turns[0]!.role).toBe('user');
  });

  it('4. maps sender assistant to role assistant', () => {
    const input: ClaudeConversation[] = [
      {
        uuid: 'c4',
        chat_messages: [{ sender: 'assistant', text: 'Assistant response' }],
      },
    ];

    const result = parseClaudeExport(input);
    expect(result[0]!.turns[0]!.role).toBe('assistant');
  });

  it('5. skips sender system by default', () => {
    const input: ClaudeConversation[] = [
      {
        uuid: 'c5',
        chat_messages: [
          { sender: 'system', text: 'System rules' },
          { sender: 'human', text: 'User prompt' },
        ],
      },
    ];

    const result = parseClaudeExport(input, { includeSystemHidden: false });
    expect(result[0]!.turns).toHaveLength(1);
    expect(result[0]!.turns[0]!.text).toBe('User prompt');
  });

  it('6. includes sender system when includeSystemHidden is true', () => {
    const input: ClaudeConversation[] = [
      {
        uuid: 'c6',
        chat_messages: [
          { sender: 'system', text: 'System rules' },
          { sender: 'human', text: 'User prompt' },
        ],
      },
    ];

    const result = parseClaudeExport(input, { includeSystemHidden: true });
    expect(result[0]!.turns).toHaveLength(2);
    expect(result[0]!.turns[0]!.role).toBe('system');
    expect(result[0]!.turns[0]!.text).toBe('System rules');
  });

  it('7. skips unknown senders and records note', () => {
    const input: ClaudeConversation[] = [
      {
        uuid: 'c7',
        chat_messages: [
          { sender: 'moderator_bot', text: 'Notice' },
          { sender: 'human', text: 'Hello' },
        ],
      },
    ];

    const result = parseClaudeExport(input);
    expect(result[0]!.turns).toHaveLength(1);
    expect(result[0]!.turns[0]!.text).toBe('Hello');
    expect(result[0]!.notes.some((n) => n.includes('moderator_bot'))).toBe(true);
  });

  it('8. prioritizes message.text over content[] when both exist', () => {
    const input: ClaudeConversation[] = [
      {
        uuid: 'c8',
        chat_messages: [
          {
            sender: 'human',
            text: 'Primary text message',
            content: [{ type: 'text', text: 'Fallback block' }],
          },
        ],
      },
    ];

    const result = parseClaudeExport(input);
    expect(result[0]!.turns[0]!.text).toBe('Primary text message');
  });

  it('9. extracts and joins text blocks from content[] when text is absent', () => {
    const input: ClaudeConversation[] = [
      {
        uuid: 'c9',
        chat_messages: [
          {
            sender: 'human',
            content: [
              { type: 'text', text: 'First paragraph.' },
              { type: 'text', text: 'Second paragraph.' },
            ],
          },
        ],
      },
    ];

    const result = parseClaudeExport(input);
    expect(result[0]!.turns[0]!.text).toBe('First paragraph.\nSecond paragraph.');
  });

  it('10. replaces image content blocks with [image]', () => {
    const input: ClaudeConversation[] = [
      {
        uuid: 'c10',
        chat_messages: [
          {
            sender: 'human',
            content: [
              { type: 'text', text: 'Here is the diagram:' },
              { type: 'image', source: {} },
            ],
          },
        ],
      },
    ];

    const result = parseClaudeExport(input);
    expect(result[0]!.turns[0]!.text).toBe('Here is the diagram:\n[image]');
  });

  it('11. replaces other non-text blocks with [non-text content]', () => {
    const input: ClaudeConversation[] = [
      {
        uuid: 'c11',
        chat_messages: [
          {
            sender: 'human',
            content: [
              { type: 'document_attachment', data: {} },
            ],
          },
        ],
      },
    ];

    const result = parseClaudeExport(input);
    expect(result[0]!.turns[0]!.text).toBe('[non-text content]');
  });

  it('12. converts null, missing, or empty name to "Untitled conversation"', () => {
    const input: ClaudeConversation[] = [
      {
        uuid: 'c12',
        name: null,
        chat_messages: [],
      },
      {
        uuid: 'c13',
        name: '   ',
        chat_messages: [],
      },
    ];

    const result = parseClaudeExport(input);
    expect(result[0]!.title).toBe('Untitled conversation');
    expect(result[1]!.title).toBe('Untitled conversation');
  });

  it('13. parses valid created_at string and leaves invalid date undefined', () => {
    const input: ClaudeConversation[] = [
      {
        uuid: 'c14',
        created_at: '2026-11-01T12:00:00.000Z',
        chat_messages: [],
      },
      {
        uuid: 'c15',
        created_at: 'not-a-valid-date',
        chat_messages: [],
      },
    ];

    const result = parseClaudeExport(input);
    expect(result[0]!.createdAt).toBe('2026-11-01T12:00:00.000Z');
    expect(result[1]!.createdAt).toBeUndefined();
  });

  it('14. skips empty turns and calculates accurate token estimate', () => {
    const input: ClaudeConversation[] = [
      {
        uuid: 'c16',
        chat_messages: [
          { sender: 'human', text: '   ' },
          { sender: 'assistant', text: 'A quick response with several words.' },
        ],
      },
    ];

    const result = parseClaudeExport(input);
    expect(result[0]!.turns).toHaveLength(1);
    expect(result[0]!.turns[0]!.text).toBe('A quick response with several words.');
    expect(result[0]!.tokenEstimate).toBeGreaterThan(3);
  });
});
