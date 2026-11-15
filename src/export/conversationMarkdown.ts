/**
 * Reversible Markdown serialization and parsing for conversation transcripts.
 *
 * Invariants:
 * - Losslessly reversible: parse(format(conv)) === conv for all text inputs.
 * - Delimiter-stuffing escaping prevents adversarial text containing delimiter strings
 *   from breaking structural parsing.
 * - Human-readable and AI-friendly formatting.
 * - Pure, deterministic, zero external dependencies.
 */

import type { ConversationTurn } from '../domain/conversation';

const TURN_START_REGEX = /^=== TURN:([a-zA-Z0-9_-]+):([a-zA-Z0-9_.:-]+) ===$/;
const TURN_END_DELIMITER = '=== END TURN ===';

/**
 * Escapes any line that begins with one or more backslashes followed by `===` or bare `===`.
 */
function escapeContentLine(line: string): string {
  if (/^\\*===/.test(line)) {
    return `\\${line}`;
  }
  return line;
}

/**
 * Unescapes a content line that was stuffed with a leading backslash.
 */
function unescapeContentLine(line: string): string {
  if (/^\\+===/.test(line)) {
    return line.slice(1);
  }
  return line;
}

export interface FormattedConversationData {
  title?: string;
  source?: string;
  id?: string;
  turns: ConversationTurn[];
}

/**
 * Formats a conversation and its turns into reversible Markdown.
 */
export function formatConversationMarkdown(
  record: { id: string; title: string; source: string },
  turns: ConversationTurn[]
): string {
  const lines: string[] = [];

  // Header metadata
  lines.push(`# Conversation: ${record.title || 'Untitled'}`);
  lines.push(`- ID: ${record.id}`);
  lines.push(`- Source: ${record.source}`);
  lines.push(`- Total Turns: ${turns.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Individual turns
  for (const turn of turns) {
    lines.push(`=== TURN:${turn.role}:${turn.id} ===`);

    const turnLines = turn.text.split('\n');
    for (const tl of turnLines) {
      lines.push(escapeContentLine(tl));
    }

    lines.push(TURN_END_DELIMITER);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Parses a conversation Markdown document back into structured turns and metadata.
 */
export function parseConversationMarkdown(markdown: string): FormattedConversationData {
  const lines = markdown.split(/\r?\n/);

  let title: string | undefined;
  let id: string | undefined;
  let source: string | undefined;

  const turns: ConversationTurn[] = [];

  let inTurn = false;
  let currentRole = 'user';
  let currentId = '';
  let currentTurnLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (!inTurn) {
      // Header matching
      if (line.startsWith('# Conversation: ')) {
        title = line.slice('# Conversation: '.length).trim();
      } else if (line.startsWith('- ID: ')) {
        id = line.slice('- ID: '.length).trim();
      } else if (line.startsWith('- Source: ')) {
        source = line.slice('- Source: '.length).trim();
      } else {
        const match = line.match(TURN_START_REGEX);
        if (match) {
          inTurn = true;
          currentRole = (match[1] || 'user').toLowerCase();
          currentId = match[2] || `turn-${turns.length + 1}`;
          currentTurnLines = [];
        }
      }
    } else {
      if (line === TURN_END_DELIMITER) {
        turns.push({
          id: currentId,
          role: currentRole as 'user' | 'assistant' | 'system',
          text: currentTurnLines.join('\n'),
        });
        inTurn = false;
        currentTurnLines = [];
      } else {
        currentTurnLines.push(unescapeContentLine(line));
      }
    }
  }

  // If file ended before explicit TURN_END_DELIMITER, close the open turn
  if (inTurn) {
    turns.push({
      id: currentId,
      role: currentRole as 'user' | 'assistant' | 'system',
      text: currentTurnLines.join('\n'),
    });
  }

  return {
    title,
    id,
    source,
    turns,
  };
}
