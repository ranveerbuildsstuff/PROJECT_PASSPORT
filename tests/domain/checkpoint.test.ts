import { describe, it, expect } from 'vitest';
import {
  CheckpointRecordSchema,
  checkpointKind,
  checkpointSequence,
  countActivePassportSections,
} from '../../src/domain/checkpoint';
import type { PassportV1 } from '../../src/domain/passport.schema';

const mockPassport: PassportV1 = {
  schemaVersion: 1,
  project: {
    id: 'p1',
    name: 'Test Project',
    goal: 'Test Goal',
    summary: 'Test Summary',
    status: 'in_progress',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  stack: [{ name: 'React', role: 'UI' }],
  requirements: [{ id: 'r1', text: 'Req 1', priority: 'must' }],
  decisions: [{ id: 'd1', decision: 'Dec 1', reason: 'Why', date: '2026-01-01', status: 'active' }],
  completed: [{ id: 'c1', text: 'Done 1' }],
  tasks: [{ id: 't1', text: 'Task 1', status: 'todo', priority: 'high' }],
  bugs: [{ id: 'b1', text: 'Bug 1', severity: 'low', status: 'open' }],
  bugsReviewed: true,
  instructions: ['Inst 1'],
  files: [{ path: 'src/main.ts', purpose: 'Entry', included: true, sizeBytes: 120 }],
  conversations: [
    {
      id: 'conv1',
      title: 'Chat 1',
      source: 'chatgpt',
      messageCount: 5,
      tokenEstimate: 500,
      included: true,
    },
  ],
  nextAction: 'Next steps',
  openQuestions: ['Question 1'],
};

describe('Checkpoint Domain', () => {
  it('parses valid checkpoint records with extra fields', () => {
    const raw = {
      id: 'cp-1',
      projectId: 'p1',
      createdAt: '2026-01-01T00:00:00.000Z',
      type: 'manual',
      note: 'User note',
      passport: mockPassport,
      conversationIds: ['conv1'],
      files: [
        {
          path: 'src/main.ts',
          purpose: 'Entry',
          included: true,
          sizeBytes: 120,
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
      ],
    };

    const parsed = CheckpointRecordSchema.parse(raw);
    expect(parsed.id).toBe('cp-1');
    expect(parsed.conversationIds).toEqual(['conv1']);
    expect(parsed.files?.[0]?.sha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('parses legacy checkpoints cleanly without conversationIds or files', () => {
    const legacyRaw = {
      id: 'cp-legacy',
      projectId: 'p1',
      createdAt: '2026-01-01T00:00:00.000Z',
      description: 'Before AI merge',
      passport: mockPassport,
    };

    const parsed = CheckpointRecordSchema.parse(legacyRaw);
    expect(parsed.id).toBe('cp-legacy');
    expect(parsed.conversationIds).toBeUndefined();
    expect(parsed.files).toBeUndefined();
    expect(checkpointKind(parsed)).toBe('Before AI merge');
  });

  it('correctly classifies checkpoint kinds from type or description', () => {
    expect(checkpointKind({ type: 'before_restore' })).toBe('Before restore');
    expect(checkpointKind({ type: 'before_merge' })).toBe('Before AI merge');
    expect(checkpointKind({ type: 'manual' })).toBe('Manual');

    // Legacy descriptions
    expect(checkpointKind({ description: 'Before restore' })).toBe('Before restore');
    expect(checkpointKind({ description: 'before restore (auto)' })).toBe('Before restore');
    expect(checkpointKind({ description: 'Before AI merge' })).toBe('Before AI merge');
    expect(checkpointKind({ description: 'Merge with incoming chat' })).toBe('Before AI merge');
    expect(checkpointKind({ note: 'Manual savepoint' })).toBe('Manual');
    expect(checkpointKind({})).toBe('Manual');
  });

  it('numbers checkpoints sequentially with #1 as oldest', () => {
    const list = [
      { id: 'cp-3', createdAt: '2026-01-03T10:00:00.000Z' },
      { id: 'cp-1', createdAt: '2026-01-01T10:00:00.000Z' },
      { id: 'cp-2', createdAt: '2026-01-02T10:00:00.000Z' },
    ];

    const seq = checkpointSequence(list);
    expect(seq.get('cp-1')).toBe(1);
    expect(seq.get('cp-2')).toBe(2);
    expect(seq.get('cp-3')).toBe(3);
  });

  it('counts active passport sections correctly', () => {
    expect(countActivePassportSections(mockPassport)).toBe(10);

    const emptyPassport: PassportV1 = {
      ...mockPassport,
      project: {
        ...mockPassport.project,
        goal: '',
        summary: '',
      },
      stack: [],
      requirements: [],
      decisions: [],
      completed: [],
      tasks: [],
      bugs: [],
      instructions: [],
      nextAction: '',
      openQuestions: [],
    };
    expect(countActivePassportSections(emptyPassport)).toBe(0);
  });
});
