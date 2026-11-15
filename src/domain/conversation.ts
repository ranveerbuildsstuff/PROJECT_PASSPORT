import { z } from 'zod';
import { newId } from './editor';
import { estimateTokens } from './tokens';

/**
 * Zod schema defining a single conversation turn.
 * Single source of truth for runtime validation and static TypeScript types.
 */
export const ConversationTurnRoleSchema = z.enum(['user', 'assistant', 'system']);
export type ConversationTurnRole = z.infer<typeof ConversationTurnRoleSchema>;

export const ConversationTurnSchema = z.object({
  id: z.string().min(1, 'Turn ID is required'),
  role: ConversationTurnRoleSchema,
  text: z.string(),
});

export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

/**
 * Returns estimated tokens for a single conversation turn.
 */
export function turnTokenEstimate(turn: ConversationTurn): number {
  return estimateTokens(turn.text);
}

/**
 * Returns total estimated tokens for an array of conversation turns.
 */
export function conversationTokenEstimate(turns: readonly ConversationTurn[]): number {
  return turns.reduce((acc, turn) => acc + estimateTokens(turn.text), 0);
}

/**
 * Flips the speaker role ('user' <-> 'assistant') at index i.
 * Out-of-range index is a no-op (returns shallow copy of turns).
 * Calling flip twice is the identity operation.
 */
export function flipRole(
  turns: readonly ConversationTurn[],
  i: number
): ConversationTurn[] {
  if (i < 0 || i >= turns.length) {
    return [...turns];
  }
  return turns.map((turn, index) => {
    if (index === i) {
      if (turn.role === 'system') {
        return { ...turn };
      }
      return {
        ...turn,
        role: turn.role === 'user' ? 'assistant' : 'user',
      };
    }
    return { ...turn };
  });
}

/**
 * Splits a turn at index i into two turns at character `offset`.
 * Both parts must be non-empty after trimming, otherwise the operation is rejected
 * and returns a copy of `turns`.
 *
 * Invariant: Splitting at a boundary and subsequently calling `mergeWithNext` on the
 * first part reproduces the original turn text.
 */
export function splitTurn(
  turns: readonly ConversationTurn[],
  i: number,
  offset: number,
  idFactory: () => string = newId
): ConversationTurn[] {
  if (i < 0 || i >= turns.length) {
    return [...turns];
  }

  const targetTurn = turns[i];
  if (!targetTurn || offset <= 0 || offset >= targetTurn.text.length) {
    return [...turns];
  }

  const part1 = targetTurn.text.slice(0, offset).trim();
  const part2 = targetTurn.text.slice(offset).trim();

  // A split that leaves an empty half is rejected
  if (part1.length === 0 || part2.length === 0) {
    return [...turns];
  }

  const firstTurn: ConversationTurn = {
    id: targetTurn.id,
    role: targetTurn.role,
    text: part1,
  };

  const secondTurn: ConversationTurn = {
    id: idFactory(),
    role: targetTurn.role,
    text: part2,
  };

  const next = [...turns];
  next.splice(i, 1, firstTurn, secondTurn);
  return next;
}

/**
 * Merges turn i with turn i + 1, joining their text with `\n\n`.
 * If i is out of range or i is the last turn in the array, it is a no-op.
 */
export function mergeWithNext(
  turns: readonly ConversationTurn[],
  i: number
): ConversationTurn[] {
  if (i < 0 || i >= turns.length - 1) {
    return [...turns];
  }

  const current = turns[i];
  const next = turns[i + 1];
  if (!current || !next) {
    return [...turns];
  }

  const mergedTurn: ConversationTurn = {
    id: current.id,
    role: current.role,
    text: `${current.text}\n\n${next.text}`,
  };

  const result = [...turns];
  result.splice(i, 2, mergedTurn);
  return result;
}

/**
 * Removes the turn at index i.
 * Out-of-range index is a no-op.
 */
export function removeTurn(
  turns: readonly ConversationTurn[],
  i: number
): ConversationTurn[] {
  if (i < 0 || i >= turns.length) {
    return [...turns];
  }
  return turns.filter((_, index) => index !== i).map((t) => ({ ...t }));
}
