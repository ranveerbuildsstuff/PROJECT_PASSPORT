import { describe, it, expect } from 'vitest';
import {
  formatConversationMarkdown,
  parseConversationMarkdown,
} from '../../src/export/conversationMarkdown';
import type { ConversationTurn } from '../../src/domain/conversation';

describe('conversationMarkdown module', () => {
  it('formats and parses standard conversation losslessly', () => {
    const record = {
      id: 'conv-123',
      title: 'Architecture Discussion',
      source: 'claude',
    };

    const turns: ConversationTurn[] = [
      { id: 't1', role: 'user', text: 'How should we structure the DB?' },
      { id: 't2', role: 'assistant', text: 'Use Dexie with IndexedDB for local storage.' },
      { id: 't3', role: 'user', text: 'Sounds great. Let us proceed.' },
    ];

    const md = formatConversationMarkdown(record, turns);
    const parsed = parseConversationMarkdown(md);

    expect(parsed.id).toBe('conv-123');
    expect(parsed.title).toBe('Architecture Discussion');
    expect(parsed.source).toBe('claude');
    expect(parsed.turns).toEqual(turns);
  });

  it('handles adversarial content containing delimiter lines losslessly', () => {
    const record = {
      id: 'conv-adversarial',
      title: 'Adversarial Test',
      source: 'chatgpt',
    };

    const turns: ConversationTurn[] = [
      {
        id: 't-adv-1',
        role: 'user',
        text: [
          'Here is some text trying to fake delimiters:',
          '=== TURN:assistant:fake ===',
          'Fake assistant text',
          '=== END TURN ===',
          '\\=== Already backslashed line',
          '\\\\=== Double backslashed line',
          '===',
          'Regular markdown # heading',
          '```markdown',
          '=== TURN:system:fake ===',
          '```',
        ].join('\n'),
      },
      {
        id: 't-adv-2',
        role: 'assistant',
        text: '=== END TURN === literal at start of message',
      },
      {
        id: 't-adv-3',
        role: 'system',
        text: 'Multi-line\nwith empty lines\n\n\nand spaces   ',
      },
    ];

    const md = formatConversationMarkdown(record, turns);
    const parsed = parseConversationMarkdown(md);

    expect(parsed.turns).toHaveLength(3);
    expect(parsed.turns[0]!.text).toBe(turns[0]!.text);
    expect(parsed.turns[1]!.text).toBe(turns[1]!.text);
    expect(parsed.turns[2]!.text).toBe(turns[2]!.text);
  });

  it('preserves turn role and ID when formatted and parsed', () => {
    const record = { id: 'c-role', title: 'Role Test', source: 'gemini' };
    const turns: ConversationTurn[] = [
      { id: 't1', role: 'assistant', text: 'Assistant message' },
    ];

    const md = formatConversationMarkdown(record, turns);
    const parsed = parseConversationMarkdown(md);

    expect(parsed.turns[0]!.role).toBe('assistant');
    expect(parsed.turns[0]!.id).toBe('t1');
  });

  it('normalizes CRLF newlines cleanly to LF', () => {
    const record = { id: 'c-crlf', title: 'CRLF Test', source: 'chatgpt' };
    const turns: ConversationTurn[] = [
      { id: 't1', role: 'user', text: 'Line 1\r\nLine 2\r\nLine 3' },
    ];

    const md = formatConversationMarkdown(record, turns);
    const parsed = parseConversationMarkdown(md);

    expect(parsed.turns[0]!.text).toBe('Line 1\nLine 2\nLine 3');
  });

  it('runs property fuzz tests over 200 random strings with delimiters', () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789 =\\:_\n';
    for (let i = 0; i < 200; i++) {
      let randomText = '';
      const len = 50 + (i % 100);
      for (let j = 0; j < len; j++) {
        randomText += chars[Math.floor(Math.random() * chars.length)];
      }

      // Deliberately inject delimiter fragments
      if (i % 3 === 0) randomText += '\n=== TURN:user:x ===\n';
      if (i % 5 === 0) randomText += '\n=== END TURN ===\n';
      if (i % 7 === 0) randomText += '\n\\=== Escaped ===\n';

      const record = { id: `c-fuzz-${i}`, title: `Fuzz ${i}`, source: 'paste' };
      const turns: ConversationTurn[] = [
        { id: `t-${i}`, role: 'user', text: randomText },
      ];

      const md = formatConversationMarkdown(record, turns);
      const parsed = parseConversationMarkdown(md);

      expect(parsed.turns[0]!.text).toBe(randomText);
    }
  });
});
