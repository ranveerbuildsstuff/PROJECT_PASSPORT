import { describe, it, expect } from 'vitest';
import { newId, moveItem, applyEditorFields, validatePassportDetailed } from '../editor';
import { createEmptyPassport } from '../passport.schema';
import type { PassportV1 } from '../passport.schema';

describe('Domain: Editor pure functions', () => {
  describe('newId()', () => {
    it('generates a valid UUID string', () => {
      const id = newId();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('generates distinct IDs across consecutive calls', () => {
      const id1 = newId();
      const id2 = newId();
      expect(id1).not.toBe(id2);
    });

    it('falls back to RFC4122 v4 generator if crypto.randomUUID is undefined', () => {
      const original = crypto.randomUUID;
      try {
        Object.defineProperty(crypto, 'randomUUID', {
          value: undefined,
          configurable: true,
          writable: true,
        });
        const fallbackId = newId();
        expect(fallbackId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      } finally {
        Object.defineProperty(crypto, 'randomUUID', {
          value: original,
          configurable: true,
          writable: true,
        });
      }
    });
  });

  describe('moveItem()', () => {
    const original = ['A', 'B', 'C', 'D'];

    it('moves an item forward in the array', () => {
      const result = moveItem(original, 0, 2);
      expect(result).toEqual(['B', 'C', 'A', 'D']);
      expect(original).toEqual(['A', 'B', 'C', 'D']); // immutability
    });

    it('moves an item backward in the array', () => {
      const result = moveItem(original, 3, 1);
      expect(result).toEqual(['A', 'D', 'B', 'C']);
      expect(original).toEqual(['A', 'B', 'C', 'D']);
    });

    it('is a no-op when from equals to', () => {
      const result = moveItem(original, 2, 2);
      expect(result).toEqual(original);
      expect(result).not.toBe(original); // returns new copy
    });

    it('is a no-op when from is negative or out of bounds', () => {
      expect(moveItem(original, -1, 2)).toEqual(original);
      expect(moveItem(original, 99, 2)).toEqual(original);
    });

    it('is a no-op when to is negative or out of bounds', () => {
      expect(moveItem(original, 1, -1)).toEqual(original);
      expect(moveItem(original, 1, 99)).toEqual(original);
    });
  });

  describe('applyEditorFields()', () => {
    it('applies editor-owned fields from draft and preserves files, conversations, id, createdAt from latest', () => {
      const latest = createEmptyPassport('Latest Project');
      latest.project.id = 'orig-id-123';
      latest.project.createdAt = '2026-01-01T00:00:00.000Z';
      latest.files = [
        {
          path: 'src/main.ts',
          purpose: 'Entry point',
          included: true,
          sizeBytes: 1024,
        },
      ];
      latest.conversations = [
        {
          id: 'conv-1',
          title: 'Initial Architecture',
          source: 'claude',
          messageCount: 5,
          tokenEstimate: 500,
          included: true,
        },
      ];

      const draft: PassportV1 = {
        schemaVersion: 1,
        project: {
          id: 'draft-id-ignored',
          name: 'Draft Renamed Project',
          goal: 'Draft goal updated',
          summary: 'Draft summary updated',
          status: 'in_progress',
          createdAt: '2026-02-02T00:00:00.000Z', // ignored
          updatedAt: '2026-02-02T00:00:00.000Z',
        },
        stack: [{ name: 'Vite', role: 'Bundler', version: '6.0.0', notes: 'Fast' }],
        requirements: [{ id: 'req-1', text: 'Must be fast', priority: 'must' }],
        decisions: [
          {
            id: 'dec-1',
            decision: 'Use Dexie',
            reason: 'Local IndexedDB wrapper',
            date: '2026-01-02',
            status: 'active',
          },
        ],
        completed: [{ id: 'comp-1', text: 'Domain model' }],
        tasks: [{ id: 'task-1', text: 'Build editor', status: 'doing', priority: 'high' }],
        bugs: [{ id: 'bug-1', text: 'Overflow on mobile', severity: 'low', status: 'open' }],
        bugsReviewed: true,
        instructions: ['Follow design tokens strictly'],
        nextAction: 'Add accordion UI',
        openQuestions: ['Should we support keyboard shortcuts?'],
        // draft has fake or empty files/conversations:
        files: [],
        conversations: [],
      };

      const result = applyEditorFields(latest, draft);

      // Preserved from latest
      expect(result.project.id).toBe('orig-id-123');
      expect(result.project.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(result.files).toEqual(latest.files);
      expect(result.files).not.toBe(latest.files);
      expect(result.conversations).toEqual(latest.conversations);
      expect(result.conversations).not.toBe(latest.conversations);

      // Applied from draft
      expect(result.project.name).toBe('Draft Renamed Project');
      expect(result.project.goal).toBe('Draft goal updated');
      expect(result.project.summary).toBe('Draft summary updated');
      expect(result.project.status).toBe('in_progress');
      expect(result.stack).toEqual(draft.stack);
      expect(result.requirements).toEqual(draft.requirements);
      expect(result.decisions).toEqual(draft.decisions);
      expect(result.completed).toEqual(draft.completed);
      expect(result.tasks).toEqual(draft.tasks);
      expect(result.bugs).toEqual(draft.bugs);
      expect(result.bugsReviewed).toBe(true);
      expect(result.instructions).toEqual(draft.instructions);
      expect(result.nextAction).toBe('Add accordion UI');
      expect(result.openQuestions).toEqual(draft.openQuestions);

      // Immutability: modifying draft does not mutate result
      draft.stack.push({ name: 'Tailwind' });
      expect(result.stack).toHaveLength(1);
    });
  });

  describe('validatePassportDetailed()', () => {
    it('returns empty errors for a valid passport', () => {
      const valid = createEmptyPassport('Valid');
      const res = validatePassportDetailed(valid);
      expect(res.success).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(Object.keys(res.fieldErrors)).toHaveLength(0);
    });

    it('indexes errors by path including nested task paths', () => {
      const invalid = createEmptyPassport('Invalid');
      invalid.tasks = [
        { id: 't1', text: 'Task 1', status: 'todo', priority: 'medium' },
        { id: 't2', text: 'Task 2', status: 'doing', priority: 'high' },
        { id: 't3', text: '', status: 'todo', priority: 'low' }, // empty text!
      ];

      const res = validatePassportDetailed(invalid);
      expect(res.success).toBe(false);
      expect(res.errors).toContain('Task 3 needs some text');
      expect(res.fieldErrors['tasks.2.text']).toBe('Task 3 needs some text');
      expect(res.fieldErrors['tasks.2']).toBe('Task 3 needs some text');
      expect(res.fieldErrors['tasks']).toBe('Task 3 needs some text');
    });
  });
});
