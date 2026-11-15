export type ExportFormat = 'chatgpt' | 'claude' | 'unknown';

export interface ExportDiagnostics {
  detectedKeys: string[];
  expectedKeys: {
    chatgpt: string[];
    claude: string[];
  };
  itemCount: number;
}

export interface DetectionResult {
  format: ExportFormat;
  diagnostics?: ExportDiagnostics;
}

const CHATGPT_EXPECTED_KEYS = ['mapping', 'current_node', 'title', 'create_time'];
const CLAUDE_EXPECTED_KEYS = ['chat_messages', 'uuid', 'name', 'created_at'];

/**
 * Detects whether an arbitrary parsed JSON data structure corresponds to a ChatGPT or Claude export.
 *
 * Invariant:
 * When detection fails (returning 'unknown'), the returned diagnostics contains strictly
 * schema key identifiers and count metadata. It NEVER exposes string values, payloads,
 * or message text.
 */
export function detectExportFormat(json: unknown): DetectionResult {
  const diagnostics: ExportDiagnostics = {
    detectedKeys: [],
    expectedKeys: {
      chatgpt: CHATGPT_EXPECTED_KEYS,
      claude: CLAUDE_EXPECTED_KEYS,
    },
    itemCount: 0,
  };

  if (!json || typeof json !== 'object') {
    return {
      format: 'unknown',
      diagnostics,
    };
  }

  // Case 1: Array of conversation objects (typical for both ChatGPT conversations.json and Claude arrays)
  if (Array.isArray(json)) {
    diagnostics.itemCount = json.length;

    if (json.length === 0) {
      return {
        format: 'unknown',
        diagnostics,
      };
    }

    const first = json[0];
    if (!first || typeof first !== 'object' || Array.isArray(first)) {
      return {
        format: 'unknown',
        diagnostics,
      };
    }

    const keys = Object.keys(first).sort();
    diagnostics.detectedKeys = keys;

    // Check ChatGPT markers
    const hasMapping = keys.includes('mapping');
    const hasCurrentNode = keys.includes('current_node');
    const hasTitle = keys.includes('title');

    if (hasMapping && (hasCurrentNode || hasTitle)) {
      return { format: 'chatgpt' };
    }

    // Check Claude markers
    const hasChatMessages = keys.includes('chat_messages');
    const hasUuid = keys.includes('uuid');
    const hasName = keys.includes('name');

    if (hasChatMessages || (hasUuid && hasName)) {
      return { format: 'claude' };
    }

    return {
      format: 'unknown',
      diagnostics,
    };
  }

  // Case 2: Object with top-level keys (e.g. { conversations: [...] })
  const topKeys = Object.keys(json).sort();
  diagnostics.detectedKeys = topKeys;

  const rawObj = json as Record<string, unknown>;

  if (Array.isArray(rawObj.conversations)) {
    const list = rawObj.conversations;
    diagnostics.itemCount = list.length;

    if (list.length === 0) {
      // Claude export wrapper object with 0 conversations
      return { format: 'claude' };
    }

    const firstItem = list[0];
    if (firstItem && typeof firstItem === 'object' && !Array.isArray(firstItem)) {
      const itemKeys = Object.keys(firstItem);
      if (itemKeys.includes('chat_messages') || itemKeys.includes('uuid')) {
        return { format: 'claude' };
      }
      if (itemKeys.includes('mapping')) {
        return { format: 'chatgpt' };
      }
    }
  }

  return {
    format: 'unknown',
    diagnostics,
  };
}
