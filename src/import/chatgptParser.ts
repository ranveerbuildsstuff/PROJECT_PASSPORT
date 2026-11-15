import {
  type ConversationTurn,
  conversationTokenEstimate,
} from '../domain/conversation';
import { newId } from '../domain/editor';

export interface ChatGptNode {
  id: string;
  parent?: string | null;
  children?: string[];
  message?: {
    id?: string;
    author?: {
      role?: string;
      name?: string | null;
      metadata?: Record<string, unknown>;
    };
    create_time?: number | null;
    update_time?: number | null;
    content?: {
      content_type?: string;
      parts?: unknown[];
      text?: string;
    };
    status?: string;
    metadata?: {
      is_visually_hidden_from_conversation?: boolean;
      [key: string]: unknown;
    };
  } | null;
}

export interface ChatGptConversation {
  id?: string;
  conversation_id?: string;
  uuid?: string;
  title?: string | null;
  create_time?: number | null;
  update_time?: number | null;
  mapping?: Record<string, ChatGptNode>;
  current_node?: string | null;
  [key: string]: unknown;
}

export interface ParsedConversation {
  id: string;
  title: string;
  createdAt?: string;
  source: 'chatgpt' | 'claude';
  turns: ConversationTurn[];
  tokenEstimate: number;
  notes: string[];
}

export interface ParseOptions {
  includeSystemHidden?: boolean;
}

/**
 * Extracts plain text from ChatGPT message content parts.
 * Non-text parts are substituted with clear placeholders:
 * - Image assets: `[image]`
 * - Other non-text content: `[non-text content]`
 */
function extractMessageText(message: NonNullable<ChatGptNode['message']>): string {
  const content = message.content;
  if (!content) return '';

  if (Array.isArray(content.parts)) {
    const parts = content.parts.map((p) => {
      if (typeof p === 'string') return p;
      if (p && typeof p === 'object') {
        const obj = p as Record<string, unknown>;
        const ct = String(obj.content_type || obj.type || '');
        if (
          ct.includes('image') ||
          ct.includes('asset_pointer') ||
          obj.asset_pointer != null
        ) {
          return '[image]';
        }
        return '[non-text content]';
      }
      return '[non-text content]';
    });
    return parts.join('\n').trim();
  }

  if (typeof content.text === 'string') {
    return content.text.trim();
  }

  return '';
}

/**
 * Pure, deterministic parser for official ChatGPT export data (`conversations.json`).
 * Walks `current_node` up through `parent` pointers to reconstruct the active branch,
 * reversing it to chronological order.
 *
 * Invariants:
 * - Cyclic or excessively deep trees are halted with a diagnostics note and never loop.
 * - Missing or invalid `current_node` falls back to the leaf with the latest `create_time`.
 * - Empty messages are skipped. System/hidden messages are skipped unless `includeSystemHidden` is true.
 * - Null/empty titles become "Untitled conversation".
 */
export function parseChatGptExport(
  json: unknown,
  options?: ParseOptions
): ParsedConversation[] {
  if (!Array.isArray(json)) {
    return [];
  }

  const results: ParsedConversation[] = [];

  for (let convIndex = 0; convIndex < json.length; convIndex++) {
    const rawConv = json[convIndex];
    if (!rawConv || typeof rawConv !== 'object') continue;

    const conv = rawConv as ChatGptConversation;
    const notes: string[] = [];

    const id =
      (typeof conv.id === 'string' && conv.id) ||
      (typeof conv.conversation_id === 'string' && conv.conversation_id) ||
      (typeof conv.uuid === 'string' && conv.uuid) ||
      newId();
    const title =
      (typeof conv.title === 'string' && conv.title.trim()) || 'Untitled conversation';

    let createdAt: string | undefined;
    if (typeof conv.create_time === 'number' && !Number.isNaN(conv.create_time)) {
      const ms = conv.create_time > 1e11 ? conv.create_time : conv.create_time * 1000;
      createdAt = new Date(ms).toISOString();
    }

    const mapping =
      conv.mapping && typeof conv.mapping === 'object' && !Array.isArray(conv.mapping)
        ? conv.mapping
        : {};
    const nodeEntries = Object.entries(mapping);

    if (nodeEntries.length === 0) {
      results.push({
        id,
        title,
        createdAt,
        source: 'chatgpt',
        turns: [],
        tokenEstimate: 0,
        notes,
      });
      continue;
    }

    // Determine starting leaf node
    let startNodeId = conv.current_node;
    if (!startNodeId || !mapping[startNodeId]) {
      // Find candidate leaves (nodes with no valid children in mapping)
      const allChildren = new Set<string>();
      for (const [, node] of nodeEntries) {
        if (Array.isArray(node.children)) {
          for (const ch of node.children) {
            allChildren.add(ch);
          }
        }
      }

      // Nodes that are not parents of any other node or have empty children
      let candidateLeaves = nodeEntries.filter(([, node]) => {
        const hasChildren =
          Array.isArray(node.children) &&
          node.children.some((childId) => mapping[childId] !== undefined);
        return !hasChildren;
      });

      if (candidateLeaves.length === 0) {
        // Fallback to any node if tree is cyclic
        candidateLeaves = nodeEntries;
      }

      // Pick the leaf with the latest message create_time
      candidateLeaves.sort(([, a], [, b]) => {
        const timeA = a.message?.create_time ?? 0;
        const timeB = b.message?.create_time ?? 0;
        return timeB - timeA;
      });

      if (candidateLeaves[0]) {
        startNodeId = candidateLeaves[0][0];
      }
      notes.push('current_node was missing or invalid; reconstructed from latest leaf node.');
    }

    // Traverse upwards from leaf to root
    const visited = new Set<string>();
    const path: ChatGptNode[] = [];
    let currId: string | null | undefined = startNodeId;
    const STEP_LIMIT = 100_000;
    let steps = 0;

    while (currId && mapping[currId]) {
      if (visited.has(currId)) {
        notes.push('Cycle detected in conversation tree; stopped traversal.');
        break;
      }
      if (steps >= STEP_LIMIT) {
        notes.push('Step limit exceeded during conversation tree traversal; stopped traversal.');
        break;
      }
      visited.add(currId);
      steps++;

      const node: ChatGptNode = mapping[currId]!;
      path.push(node);
      currId = node.parent;
    }

    // Reverse to chronological order (root to leaf)
    path.reverse();

    // Extract turns
    const turns: ConversationTurn[] = [];

    for (const node of path) {
      if (!node.message) continue;
      const msg = node.message;

      const authorRole = (msg.author?.role || '').toLowerCase();
      const isHidden = Boolean(msg.metadata?.is_visually_hidden_from_conversation);

      let role: ConversationTurn['role'];
      if (authorRole === 'user') {
        role = 'user';
      } else if (authorRole === 'assistant') {
        role = 'assistant';
      } else {
        // Tool, system, and other roles map to 'system'
        role = 'system';
      }

      // Default filtering: skip system and hidden messages unless toggle is active
      if (!options?.includeSystemHidden) {
        if (role === 'system' || isHidden) {
          continue;
        }
      }

      const text = extractMessageText(msg);
      // Skip empty messages
      if (text.length === 0) {
        continue;
      }

      turns.push({
        id: msg.id || newId(),
        role,
        text,
      });
    }

    results.push({
      id,
      title,
      createdAt,
      source: 'chatgpt',
      turns,
      tokenEstimate: conversationTokenEstimate(turns),
      notes,
    });
  }

  return results;
}
