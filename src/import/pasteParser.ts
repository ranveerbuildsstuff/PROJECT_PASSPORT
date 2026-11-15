import { newId, type ConversationSource, type ConversationTurn } from '../domain';

export type ParseSuccess = {
  ok: true;
  turns: ConversationTurn[];
  source: ConversationSource;
  notes: string[];
};

export type ParseFailure = {
  ok: false;
  code: 'empty' | 'too_large';
  message: string;
};

export type ParseResult = ParseSuccess | ParseFailure;

const MAX_CHAR_LIMIT = 1_000_000;

interface MarkerRule {
  role: 'user' | 'assistant';
  vendor?: 'chatgpt' | 'claude' | 'gemini';
}

const MARKER_RULES: Record<string, MarkerRule> = {
  'you said:': { role: 'user', vendor: 'chatgpt' },
  'chatgpt said:': { role: 'assistant', vendor: 'chatgpt' },
  'human:': { role: 'user', vendor: 'claude' },
  'claude:': { role: 'assistant', vendor: 'claude' },
  'gemini:': { role: 'assistant', vendor: 'gemini' },
  'model:': { role: 'assistant', vendor: 'gemini' },
  'user:': { role: 'user' },
  'assistant:': { role: 'assistant' },
  'me:': { role: 'user' },
};

// Line-start regex: optional leading horizontal whitespace, followed by a known marker and colon, then rest of line.
const LINE_MARKER_REGEX =
  /^[ \t]*(you said:|chatgpt said:|user:|assistant:|human:|claude:|gemini:|me:|model:)[ \t]*(.*)$/i;

/**
 * Parses a pasted conversation transcript into structured message turns.
 * Operates in strict linear O(n) time on the main thread, never recurses, and never throws.
 */
export function parsePastedConversation(
  text: string,
  idFactory: () => string = newId
): ParseResult {
  try {
    if (typeof text !== 'string') {
      return {
        ok: false,
        code: 'empty',
        message:
          'Nothing to import yet. Paste a conversation into the box above, then choose Parse.',
      };
    }

    if (text.length > MAX_CHAR_LIMIT) {
      return {
        ok: false,
        code: 'too_large',
        message: 'This text is over 1 MB. Paste one conversation at a time.',
      };
    }

    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    if (normalized.trim().length === 0) {
      return {
        ok: false,
        code: 'empty',
        message:
          'Nothing to import yet. Paste a conversation into the box above, then choose Parse.',
      };
    }

    const lines = normalized.split('\n');
    const notes: string[] = [];
    const detectedVendors = new Set<'chatgpt' | 'claude' | 'gemini'>();

    type DraftTurn = {
      id: string;
      role: 'user' | 'assistant';
      lines: string[];
    };

    const draftTurns: DraftTurn[] = [];
    const preMarkerLines: string[] = [];
    let hasEncounteredFirstMarker = false;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      if (line === undefined) continue;
      const match = LINE_MARKER_REGEX.exec(line);

      if (match && match[1]) {
        const markerKey = match[1].toLowerCase();
        const remainder = match[2] ?? '';
        const rule = MARKER_RULES[markerKey];

        if (rule) {
          if (rule.vendor) {
            detectedVendors.add(rule.vendor);
          }

          hasEncounteredFirstMarker = true;

          draftTurns.push({
            id: idFactory(),
            role: rule.role,
            lines: remainder.length > 0 ? [remainder] : [],
          });
          continue;
        }
      }

      if (!hasEncounteredFirstMarker) {
        preMarkerLines.push(line);
      } else {
        const currentTurn = draftTurns[draftTurns.length - 1];
        if (currentTurn) {
          currentTurn.lines.push(line);
        }
      }
    }

    // Fallback: If no speaker markers were found across the entire text
    if (draftTurns.length === 0) {
      notes.push(
        'We couldn\'t find speaker labels such as "User:" or "ChatGPT said:". The text is kept as one message. Use Split to divide it, or flip its role.'
      );
      return {
        ok: true,
        turns: [
          {
            id: idFactory(),
            role: 'user',
            text: normalized.trim(),
          },
        ],
        source: 'paste',
        notes,
      };
    }

    // Handle pre-marker text: prepend to first turn with a user-facing note
    const preMarkerText = preMarkerLines.join('\n').trim();
    if (preMarkerText.length > 0 && draftTurns.length > 0) {
      notes.push('Text before the first speaker label was added to the first message.');
      const firstTurn = draftTurns[0];
      if (firstTurn) {
        const existingFirstTurnText = firstTurn.lines.join('\n').trim();
        const combined =
          existingFirstTurnText.length > 0
            ? `${preMarkerText}\n\n${existingFirstTurnText}`
            : preMarkerText;
        firstTurn.lines = [combined];
      }
    }

    // Convert draft turns into finalized turns with trimmed edges
    const finalizedTurns: ConversationTurn[] = draftTurns.map((turn) => ({
      id: turn.id,
      role: turn.role,
      text: turn.lines.join('\n').trim(),
    }));

    // Vendor source detection
    let source: ConversationSource = 'paste';
    if (detectedVendors.size === 1) {
      const singleVendor = Array.from(detectedVendors)[0];
      if (singleVendor) {
        source = singleVendor;
      }
    }

    return {
      ok: true,
      turns: finalizedTurns,
      source,
      notes,
    };
  } catch {
    // Parser must NEVER throw under any input
    return {
      ok: false,
      code: 'empty',
      message:
        'Nothing to import yet. Paste a conversation into the box above, then choose Parse.',
    };
  }
}
