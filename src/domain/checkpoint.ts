/**
 * Pure, deterministic domain models and helper functions for Checkpoints.
 *
 * Invariants:
 * - Depends ONLY on Zod (no React, no Dexie, no DOM APIs).
 * - Legacy checkpoints lacking conversationIds or files parse cleanly.
 * - Kind classification handles legacy description strings and new type fields.
 * - Sequence ordering numbers oldest as #1.
 */

import { z } from 'zod';
import { PassportSchemaV1, type PassportV1 } from './passport.schema';

export const CheckpointFileItemSchema = z.object({
  path: z.string(),
  purpose: z.string(),
  included: z.boolean(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().nullable(),
});
export type CheckpointFileItem = z.infer<typeof CheckpointFileItemSchema>;

export const CheckpointKindSchema = z.enum(['manual', 'before_merge', 'before_restore']);
export type CheckpointKindType = z.infer<typeof CheckpointKindSchema>;

export const CheckpointRecordSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  createdAt: z.string(),
  type: CheckpointKindSchema.optional(),
  note: z.string().optional(),
  description: z.string().optional(),
  passport: PassportSchemaV1,
  conversationIds: z.array(z.string()).optional(),
  files: z.array(CheckpointFileItemSchema).optional(),
});
export type CheckpointRecordModel = z.infer<typeof CheckpointRecordSchema>;

export type CheckpointDisplayKind = 'Manual' | 'Before AI merge' | 'Before restore';

/**
 * Maps any checkpoint record (new or legacy) to a human-readable display kind.
 */
export function checkpointKind(record: {
  type?: string;
  description?: string;
  note?: string;
}): CheckpointDisplayKind {
  if (record.type === 'before_restore') {
    return 'Before restore';
  }
  if (record.type === 'before_merge') {
    return 'Before AI merge';
  }

  const desc = (record.description || record.note || '').trim().toLowerCase();
  if (desc === 'before restore' || desc.startsWith('before restore')) {
    return 'Before restore';
  }
  if (desc === 'before ai merge' || desc.startsWith('before ai merge') || desc.includes('merge')) {
    return 'Before AI merge';
  }

  return 'Manual';
}

/**
 * Returns sequence numbers (#1 for oldest) for a list of checkpoints in a project.
 */
export function checkpointSequence(
  checkpoints: Array<{ id: string; createdAt: string }>
): Map<string, number> {
  // Sort oldest first to assign 1..N
  const sorted = [...checkpoints].sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });

  const sequenceMap = new Map<string, number>();
  sorted.forEach((cp, index) => {
    sequenceMap.set(cp.id, index + 1);
  });

  return sequenceMap;
}

/**
 * Counts non-empty sections in a passport for timeline summary.
 */
export function countActivePassportSections(passport: PassportV1): number {
  let count = 0;
  if (passport.project.goal || passport.project.summary) count++;
  if (passport.stack && passport.stack.length > 0) count++;
  if (passport.requirements && passport.requirements.length > 0) count++;
  if (passport.decisions && passport.decisions.length > 0) count++;
  if (passport.completed && passport.completed.length > 0) count++;
  if (passport.tasks && passport.tasks.length > 0) count++;
  if (passport.bugs && passport.bugs.length > 0) count++;
  if (passport.instructions && passport.instructions.length > 0) count++;
  if (passport.nextAction) count++;
  if (passport.openQuestions && passport.openQuestions.length > 0) count++;
  return count;
}
