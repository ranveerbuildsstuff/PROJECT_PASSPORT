import { describe, it, expect } from 'vitest';
import {
  type ConversationTurn,
  flipRole,
  splitTurn,
  mergeWithNext,
  removeTurn,
  turnTokenEstimate,
  conversationTokenEstimate,
} from '../../src/domain/conversation';
import { estimateTokens } from '../../src/domain/tokens';

describe('conversation domain operations', () => {
  const sampleTurns: ConversationTurn[] = [
    { id: 'turn-1', role: 'user', text: 'Hello world' },
    { id: 'turn-2', role: 'assistant', text: 'Hi there! How can I help you today?' },
    { id: 'turn-3', role: 'user', text: 'Here is some more details about the project.' },
  ];

  describe('flipRole', () => {
    it('flips user to assistant and assistant to user', () => {
      const flipped = flipRole(sampleTurns, 0);
      expect(flipped[0]?.role).toBe('assistant');
      expect(flipped[0]?.text).toBe('Hello world');
      expect(flipped[1]?.role).toBe('assistant');

      const flipped2 = flipRole(sampleTurns, 1);
      expect(flipped2[1]?.role).toBe('user');
    });

    it('flip twice is the identity operation', () => {
      const twice = flipRole(flipRole(sampleTurns, 1), 1);
      expect(twice).toEqual(sampleTurns);
    });

    it('out of range indices are no-ops returning a copy', () => {
      expect(flipRole(sampleTurns, -1)).toEqual(sampleTurns);
      expect(flipRole(sampleTurns, 99)).toEqual(sampleTurns);
    });
  });

  describe('splitTurn', () => {
    it('splits a turn into two turns at offset', () => {
      const turnToSplit = [{ id: 't1', role: 'user' as const, text: 'First part\n\nSecond part' }];
      const result = splitTurn(turnToSplit, 0, 11, () => 'new-id');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 't1',
        role: 'user',
        text: 'First part',
      });
      expect(result[1]).toEqual({
        id: 'new-id',
        role: 'user',
        text: 'Second part',
      });
    });

    it('split then merge reproduces the original text', () => {
      const original = [{ id: 't1', role: 'user' as const, text: 'Part One\n\nPart Two' }];
      const split = splitTurn(original, 0, 9, () => 't2');
      const merged = mergeWithNext(split, 0);

      expect(merged[0]?.text).toBe(original[0]?.text);
    });

    it('rejects a split that leaves an empty half', () => {
      const single = [{ id: 't1', role: 'user' as const, text: 'Hello' }];
      // Splitting at index 0 or index 5 leaves an empty part after trim
      const splitAtStart = splitTurn(single, 0, 0);
      expect(splitAtStart).toEqual(single);

      const splitAtEnd = splitTurn(single, 0, 5);
      expect(splitAtEnd).toEqual(single);

      // Splitting inside whitespace where either part trims to empty
      const whitespaceTurn = [{ id: 't1', role: 'user' as const, text: '   Hello' }];
      const splitInLeadingWhitespace = splitTurn(whitespaceTurn, 0, 2);
      expect(splitInLeadingWhitespace).toEqual(whitespaceTurn);
    });

    it('out of range index is a no-op', () => {
      expect(splitTurn(sampleTurns, -1, 5)).toEqual(sampleTurns);
      expect(splitTurn(sampleTurns, 100, 5)).toEqual(sampleTurns);
    });
  });

  describe('mergeWithNext', () => {
    it('joins turn i and i+1 with double newline', () => {
      const result = mergeWithNext(sampleTurns, 0);
      expect(result).toHaveLength(2);
      expect(result[0]?.text).toBe('Hello world\n\nHi there! How can I help you today?');
      expect(result[0]?.role).toBe('user');
      expect(result[1]?.id).toBe('turn-3');
    });

    it('merge on the last turn is a no-op', () => {
      const lastIndex = sampleTurns.length - 1;
      const result = mergeWithNext(sampleTurns, lastIndex);
      expect(result).toEqual(sampleTurns);
    });

    it('out of range index is a no-op', () => {
      expect(mergeWithNext(sampleTurns, -1)).toEqual(sampleTurns);
      expect(mergeWithNext(sampleTurns, 50)).toEqual(sampleTurns);
    });
  });

  describe('removeTurn', () => {
    it('removes turn at given index', () => {
      const result = removeTurn(sampleTurns, 1);
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('turn-1');
      expect(result[1]?.id).toBe('turn-3');
    });

    it('out of range index is a no-op', () => {
      expect(removeTurn(sampleTurns, -1)).toEqual(sampleTurns);
      expect(removeTurn(sampleTurns, 99)).toEqual(sampleTurns);
    });
  });

  describe('tokens', () => {
    it('per-turn and total estimates use the shared formula', () => {
      const t1 = sampleTurns[0]!;
      const t2 = sampleTurns[1]!;
      const t3 = sampleTurns[2]!;

      expect(turnTokenEstimate(t1)).toBe(estimateTokens(t1.text));
      expect(turnTokenEstimate(t2)).toBe(estimateTokens(t2.text));
      expect(turnTokenEstimate(t3)).toBe(estimateTokens(t3.text));

      const expectedTotal =
        estimateTokens(t1.text) + estimateTokens(t2.text) + estimateTokens(t3.text);
      expect(conversationTokenEstimate(sampleTurns)).toBe(expectedTotal);
    });

    it('total text length is conserved across split and merge', () => {
      const turn = [{ id: 't1', role: 'user' as const, text: 'Alpha\n\nBeta' }];
      const split = splitTurn(turn, 0, 6, () => 't2');
      const merged = mergeWithNext(split, 0);

      expect(merged[0]?.text.length).toBe(turn[0]?.text.length);
    });
  });
});
