import { describe, it, expect } from 'vitest';
import {
  handleWorkerMessage,
  type WorkerState,
  type WorkerIncomingMessage,
} from '../../src/import/parser.worker';

describe('parser.worker handleWorkerMessage', () => {
  it('implements 2-step protocol: parse returns summaries, extract returns full turns', () => {
    let state: WorkerState = {
      parsedConversations: new Map(),
    };

    const chatGptJson = JSON.stringify([
      {
        id: 'conv-1',
        title: 'Title 1',
        mapping: {
          'n-1': {
            id: 'n-1',
            parent: null,
            children: [],
            message: { id: 'm-1', author: { role: 'user' }, content: { parts: ['Hello world'] } },
          },
        },
        current_node: 'n-1',
      },
      {
        id: 'conv-2',
        title: 'Title 2',
        mapping: {
          'n-2': {
            id: 'n-2',
            parent: null,
            children: [],
            message: { id: 'm-2', author: { role: 'user' }, content: { parts: ['Second conversation'] } },
          },
        },
        current_node: 'n-2',
      },
    ]);

    // Step 1: Parse
    const parseStep = handleWorkerMessage(state, {
      action: 'parse',
      files: [{ name: 'conversations.json', text: chatGptJson }],
    });

    state = parseStep.nextState;
    expect(parseStep.response.type).toBe('parse_result');
    if (parseStep.response.type === 'parse_result' && parseStep.response.result.ok) {
      expect(parseStep.response.result.summaries).toHaveLength(2);
      expect(parseStep.response.result.summaries[0]?.title).toBe('Title 1');
      expect(parseStep.response.result.summaries[1]?.title).toBe('Title 2');
      // Summaries should not have the raw turns array to keep memory minimal
      expect('turns' in (parseStep.response.result.summaries[0] ?? {})).toBe(false);
    }

    // Step 2: Extract selected conversation turns only
    const extractStep = handleWorkerMessage(state, {
      action: 'extract',
      ids: ['conv-2'],
    });

    expect(extractStep.response.type).toBe('extract_result');
    if (extractStep.response.type === 'extract_result') {
      expect(extractStep.response.conversations).toHaveLength(1);
      expect(extractStep.response.conversations[0]?.id).toBe('conv-2');
      expect(extractStep.response.conversations[0]?.turns).toHaveLength(1);
      expect(extractStep.response.conversations[0]?.turns[0]?.text).toBe('Second conversation');
    }

    // Clear state
    const clearStep = handleWorkerMessage(state, { action: 'clear' });
    expect(clearStep.response.type).toBe('cleared');
    expect(clearStep.nextState.parsedConversations.size).toBe(0);
  });

  it('returns typed error result when parsing invalid JSON', () => {
    const state: WorkerState = { parsedConversations: new Map() };
    const step = handleWorkerMessage(state, {
      action: 'parse',
      files: [{ name: 'invalid.json', text: 'not json' }],
    });

    expect(step.response.type).toBe('parse_result');
    if (step.response.type === 'parse_result') {
      expect(step.response.result.ok).toBe(false);
      if (!step.response.result.ok) {
        expect(step.response.result.code).toBe('not_json');
      }
    }
  });

  it('returns error on unknown action', () => {
    const state: WorkerState = { parsedConversations: new Map() };
    const step = handleWorkerMessage(
      state,
      { action: 'unknown_action' } as unknown as WorkerIncomingMessage
    );
    expect(step.response.type).toBe('error');
  });
});
