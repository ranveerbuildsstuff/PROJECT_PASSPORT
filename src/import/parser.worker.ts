import {
  type ParsedConversation,
  type ParseOptions,
} from './chatgptParser';
import {
  type FileInput,
  type ParseExportFailure,
  parseExportFiles,
} from './parseExport';

export interface ParsedConversationSummary {
  id: string;
  title: string;
  createdAt?: string;
  source: 'chatgpt' | 'claude';
  messageCount: number;
  tokenEstimate: number;
  notes: string[];
}

export interface WorkerState {
  parsedConversations: Map<string, ParsedConversation>;
  detectedFormat?: 'chatgpt' | 'claude';
}

export type WorkerIncomingMessage =
  | {
      action: 'parse';
      files: Array<{ name: string; text?: string; json?: unknown }>;
      options?: ParseOptions;
    }
  | {
      action: 'extract';
      ids: string[];
    }
  | {
      action: 'clear';
    };

export type WorkerOutgoingMessage =
  | {
      type: 'parse_result';
      result:
        | {
            ok: true;
            format: 'chatgpt' | 'claude';
            summaries: ParsedConversationSummary[];
            totalConversations: number;
            notes: string[];
          }
        | ParseExportFailure;
    }
  | {
      type: 'extract_result';
      conversations: ParsedConversation[];
    }
  | {
      type: 'cleared';
    }
  | {
      type: 'error';
      code: string;
      message: string;
    };

/**
 * Pure state reducer for the export parsing worker.
 * Enables deterministic testing of the complete worker protocol in unit test suites.
 */
export function handleWorkerMessage(
  state: WorkerState,
  message: WorkerIncomingMessage
): { nextState: WorkerState; response: WorkerOutgoingMessage } {
  if (message.action === 'clear') {
    return {
      nextState: {
        parsedConversations: new Map(),
      },
      response: { type: 'cleared' },
    };
  }

  if (message.action === 'extract') {
    const selected: ParsedConversation[] = [];
    for (const id of message.ids) {
      const conv = state.parsedConversations.get(id);
      if (conv) {
        selected.push(conv);
      }
    }
    return {
      nextState: state,
      response: {
        type: 'extract_result',
        conversations: selected,
      },
    };
  }

  if (message.action === 'parse') {
    try {
      const parseResult = parseExportFiles(message.files as FileInput[], message.options);

      if (!parseResult.ok) {
        return {
          nextState: {
            parsedConversations: new Map(),
          },
          response: {
            type: 'parse_result',
            result: parseResult,
          },
        };
      }

      const map = new Map<string, ParsedConversation>();
      const summaries: ParsedConversationSummary[] = [];

      for (const conv of parseResult.conversations) {
        map.set(conv.id, conv);
        summaries.push({
          id: conv.id,
          title: conv.title,
          createdAt: conv.createdAt,
          source: conv.source,
          messageCount: conv.turns.length,
          tokenEstimate: conv.tokenEstimate,
          notes: conv.notes,
        });
      }

      return {
        nextState: {
          parsedConversations: map,
          detectedFormat: parseResult.format,
        },
        response: {
          type: 'parse_result',
          result: {
            ok: true,
            format: parseResult.format,
            summaries,
            totalConversations: summaries.length,
            notes: parseResult.notes,
          },
        },
      };
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Unknown worker error';
      const isOom =
        errMessage.includes('out of memory') ||
        errMessage.includes('Allocation failed');

      return {
        nextState: {
          parsedConversations: new Map(),
        },
        response: {
          type: 'parse_result',
          result: {
            ok: false,
            code: isOom ? 'out_of_memory' : 'not_json',
            message: isOom
              ? 'The file is too large to process in memory.'
              : 'The file could not be parsed as JSON.',
          },
        },
      };
    }
  }

  return {
    nextState: state,
    response: {
      type: 'error',
      code: 'invalid_action',
      message: 'Unrecognized worker action.',
    },
  };
}

// In the browser Worker thread, listen for messages and dispatch responses
if (typeof self !== 'undefined' && typeof (self as unknown as { postMessage: unknown }).postMessage === 'function') {
  let currentState: WorkerState = {
    parsedConversations: new Map(),
  };

  self.onmessage = (event: MessageEvent<WorkerIncomingMessage>) => {
    try {
      const { nextState, response } = handleWorkerMessage(currentState, event.data);
      currentState = nextState;
      self.postMessage(response);
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Internal worker error';
      const isOom =
        errMessage.includes('out of memory') ||
        errMessage.includes('Allocation failed');

      self.postMessage({
        type: 'parse_result',
        result: {
          ok: false,
          code: isOom ? 'out_of_memory' : 'not_json',
          message: isOom
            ? 'The file is too large to process in memory.'
            : 'The file could not be parsed as JSON.',
        },
      });
    }
  };
}
