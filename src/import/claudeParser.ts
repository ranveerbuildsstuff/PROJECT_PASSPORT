import {
  type ConversationTurn,
  conversationTokenEstimate,
} from '../domain/conversation';
import { newId } from '../domain/editor';
import { type ParsedConversation, type ParseOptions } from './chatgptParser';

export interface ClaudeMessageBlock {
  type?: string;
  text?: string;
  [key: string]: unknown;
}

export interface ClaudeMessage {
  uuid?: string;
  id?: string;
  sender?: string;
  text?: string | null;
  content?: Array<string | ClaudeMessageBlock>;
  created_at?: string | null;
  [key: string]: unknown;
}

export interface ClaudeConversation {
  uuid?: string;
  id?: string;
  name?: string | null;
  title?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  chat_messages?: ClaudeMessage[];
  [key: string]: unknown;
}

/**
 * Extracts plain text from Claude message content.
 * Prioritizes `text` property, falling back to joining text blocks in `content[]`
 * with `[image]` and `[non-text content]` placeholders for non-text items.
 */
function extractClaudeMessageText(msg: ClaudeMessage): string {
  if (typeof msg.text === 'string' && msg.text.trim().length > 0) {
    return msg.text.trim();
  }

  if (Array.isArray(msg.content)) {
    const parts = msg.content.map((c) => {
      if (typeof c === 'string') return c;
      if (c && typeof c === 'object') {
        const block = c as ClaudeMessageBlock;
        if (block.type === 'text' && typeof block.text === 'string') {
          return block.text;
        }
        if (
          block.type === 'image' ||
          block.type === 'image_asset' ||
          block.type === 'tool_result' && String(block.text || '').length === 0
        ) {
          return '[image]';
        }
        return '[non-text content]';
      }
      return '[non-text content]';
    });
    return parts.join('\n').trim();
  }

  return '';
}

/**
 * Pure, deterministic parser for official Claude exports.
 * Accepts either a top-level array of conversations or an object with a `conversations` array.
 */
export function parseClaudeExport(
  json: unknown,
  options?: ParseOptions
): ParsedConversation[] {
  let rawList: unknown[] = [];

  if (Array.isArray(json)) {
    rawList = json;
  } else if (
    json &&
    typeof json === 'object' &&
    Array.isArray((json as Record<string, unknown>).conversations)
  ) {
    rawList = (json as Record<string, unknown>).conversations as unknown[];
  } else {
    return [];
  }

  const results: ParsedConversation[] = [];

  for (let convIndex = 0; convIndex < rawList.length; convIndex++) {
    const rawConv = rawList[convIndex];
    if (!rawConv || typeof rawConv !== 'object') continue;

    const conv = rawConv as ClaudeConversation;
    const notes: string[] = [];

    const id =
      (typeof conv.uuid === 'string' && conv.uuid) ||
      (typeof conv.id === 'string' && conv.id) ||
      newId();
    const title =
      (typeof conv.name === 'string' && conv.name.trim()) ||
      (typeof conv.title === 'string' && conv.title.trim()) ||
      'Untitled conversation';

    let createdAt: string | undefined;
    if (typeof conv.created_at === 'string' && conv.created_at.trim().length > 0) {
      try {
        const parsed = new Date(conv.created_at);
        if (!Number.isNaN(parsed.getTime())) {
          createdAt = parsed.toISOString();
        }
      } catch {
        // Leave createdAt undefined if parsing fails
      }
    }

    const messages = Array.isArray(conv.chat_messages) ? conv.chat_messages : [];
    const turns: ConversationTurn[] = [];

    for (const msg of messages) {
      if (!msg || typeof msg !== 'object') continue;

      const rawSender = (msg.sender || '').toLowerCase().trim();
      let role: ConversationTurn['role'];

      if (rawSender === 'human') {
        role = 'user';
      } else if (rawSender === 'assistant') {
        role = 'assistant';
      } else if (rawSender === 'system') {
        role = 'system';
      } else {
        notes.push(`Skipped message with unknown sender "${msg.sender}".`);
        continue;
      }

      if (!options?.includeSystemHidden && role === 'system') {
        continue;
      }

      const text = extractClaudeMessageText(msg);
      if (text.length === 0) {
        continue;
      }

      turns.push({
        id: msg.uuid || msg.id || newId(),
        role,
        text,
      });
    }

    results.push({
      id,
      title,
      createdAt,
      source: 'claude',
      turns,
      tokenEstimate: conversationTokenEstimate(turns),
      notes,
    });
  }

  return results;
}
