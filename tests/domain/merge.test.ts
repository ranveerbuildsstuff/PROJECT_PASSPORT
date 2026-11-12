import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  calculateSectionDiff,
  calculateAllSectionDiffs,
  mergePassport,
  type MergeChoices,
  type IncomingSections,
} from '../../src/domain/merge';
import { createEmptyPassport } from '../../src/domain/passport.schema';

describe('Domain: merge.ts', () => {
  describe('normalizeText', () => {
    it('normalizes whitespace and casing', () => {
      expect(normalizeText('  Hello   World  ')).toBe('hello world');
      expect(normalizeText('TypeScript / React')).toBe('typescript / react');
    });
  });

  describe('calculateSectionDiff', () => {
    it('returns zero changes when action is skip', () => {
      const current = createEmptyPassport('Project Alpha');
      const incoming: IncomingSections = {
        stack: [{ name: 'React', role: 'Frontend' }],
      };
      const diff = calculateSectionDiff('stack', current, incoming, 'skip');
      expect(diff).toEqual({
        added: 0,
        changed: 0,
        removed: 0,
        summary: 'No changes (skipped)',
      });
    });

    it('calculates scalar changes for basics', () => {
      const current = createEmptyPassport('Project Alpha');
      current.project.goal = 'Old goal';

      const incoming: IncomingSections = {
        basics: {
          name: 'Project Beta',
          goal: 'New goal',
          summary: 'New summary',
        },
      };

      // Merge: name changed, goal changed, summary added
      const mergeDiff = calculateSectionDiff('basics', current, incoming, 'merge');
      expect(mergeDiff.changed).toBe(2); // name, goal
      expect(mergeDiff.added).toBe(1); // summary
      expect(mergeDiff.removed).toBe(0);

      // Replace: empty status doesn't remove, but undefined fields in incoming remove if present
      const replaceDiff = calculateSectionDiff('basics', current, { basics: { name: 'Only Name' } }, 'replace');
      expect(replaceDiff.changed).toBe(1); // name
      expect(replaceDiff.removed).toBe(1); // goal removed
    });

    it('calculates list diffs for stack by id and normalized name', () => {
      const current = createEmptyPassport('Project Alpha');
      current.stack = [
        { name: 'React', role: 'UI' },
        { name: 'Tailwind', role: 'CSS' },
      ];

      const incoming: IncomingSections = {
        stack: [
          { name: 'React', role: 'UI Framework' }, // changed role
          { name: 'tailwind', role: 'CSS' }, // matched by normalized name, unchanged
          { name: 'Vite', role: 'Bundler' }, // added
        ],
      };

      const mergeDiff = calculateSectionDiff('stack', current, incoming, 'merge');
      expect(mergeDiff.added).toBe(1); // Vite
      expect(mergeDiff.changed).toBe(1); // React role
      expect(mergeDiff.removed).toBe(0);

      const replaceDiff = calculateSectionDiff('stack', current, { stack: [{ name: 'Vite', role: 'Bundler' }] }, 'replace');
      expect(replaceDiff.added).toBe(1);
      expect(replaceDiff.removed).toBe(2);
    });

    it('calculates string list diffs for instructions and openQuestions', () => {
      const current = createEmptyPassport('Project Alpha');
      current.instructions = ['Follow AGENTS.md', 'Test thoroughly'];

      const incoming: IncomingSections = {
        instructions: ['follow agents.md', 'New instruction'],
      };

      const mergeDiff = calculateSectionDiff('instructions', current, incoming, 'merge');
      expect(mergeDiff.added).toBe(1); // 'New instruction'
      expect(mergeDiff.changed).toBe(0);
      expect(mergeDiff.removed).toBe(0);

      const replaceDiff = calculateSectionDiff('instructions', current, incoming, 'replace');
      expect(replaceDiff.added).toBe(1);
      expect(replaceDiff.removed).toBe(1); // 'Test thoroughly' removed
    });

    it('calculates nextAction diff', () => {
      const current = createEmptyPassport('Project Alpha');
      current.nextAction = 'Start Slice 5';

      const incoming: IncomingSections = {
        nextAction: 'Start Slice 5b',
      };

      const replaceDiff = calculateSectionDiff('nextAction', current, incoming, 'replace');
      expect(replaceDiff.changed).toBe(1);
      expect(replaceDiff.added).toBe(0);
      expect(replaceDiff.removed).toBe(0);

      const currentEmpty = createEmptyPassport('Project Alpha');
      const addDiff = calculateSectionDiff('nextAction', currentEmpty, incoming, 'replace');
      expect(addDiff.added).toBe(1);
    });

    it('calculates bugs diff including bugsReviewed', () => {
      const current = createEmptyPassport('Project Alpha');
      current.bugsReviewed = false;
      current.bugs = [{ id: 'b1', text: 'Bug 1', severity: 'low', status: 'open' }];

      const incoming: IncomingSections = {
        bugs: [{ id: 'b1', text: 'Bug 1', severity: 'high', status: 'open' }],
        bugsReviewed: true,
      };

      const diff = calculateSectionDiff('bugs', current, incoming, 'merge');
      expect(diff.changed).toBe(2); // bug 1 severity changed, and bugsReviewed changed
    });
  });

  describe('calculateAllSectionDiffs', () => {
    it('calculates diffs for all 10 sections', () => {
      const current = createEmptyPassport('Test');
      const incoming: IncomingSections = {
        basics: { name: 'New Name' },
        nextAction: 'New Next Action',
      };
      const diffs = calculateAllSectionDiffs(current, incoming, { basics: 'merge', nextAction: 'replace' });
      expect(Object.keys(diffs)).toHaveLength(10);
      expect(diffs.basics.changed).toBe(1);
      expect(diffs.nextAction.added).toBe(1);
      expect(diffs.stack.summary).toBe('No changes');
    });
  });

  describe('mergePassport', () => {
    it('preserves immutable fields: project.id, createdAt, schemaVersion, files, conversations', () => {
      const current = createEmptyPassport('Original');
      current.project.id = 'proj-fixed-id';
      current.project.createdAt = '2026-01-01T00:00:00.000Z';
      current.files = [{ path: 'src/index.ts', purpose: 'Source code', included: true, sizeBytes: 100 }];
      current.conversations = [{ id: 'c1', title: 'Chat 1', source: 'claude', messageCount: 5, tokenEstimate: 500, included: true }];

      const incoming: IncomingSections = {
        basics: { name: 'Changed Name' },
        stack: [{ name: 'React', role: 'Frontend' }],
      };

      const choices: MergeChoices = { basics: 'replace', stack: 'replace' };
      const merged = mergePassport(current, incoming, choices);

      expect(merged.project.id).toBe('proj-fixed-id');
      expect(merged.project.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(merged.schemaVersion).toBe(1);
      expect(merged.files).toEqual(current.files);
      expect(merged.conversations).toEqual(current.conversations);
      expect(merged.project.name).toBe('Changed Name');
    });

    it('merges basics scalar fields: replaces only non-empty incoming values in merge mode', () => {
      const current = createEmptyPassport('Original Name');
      current.project.goal = 'Original Goal';
      current.project.summary = 'Original Summary';

      const incoming: IncomingSections = {
        basics: {
          name: '   ', // empty string -> ignored in merge
          goal: 'Updated Goal', // non-empty -> applied
          summary: undefined, // omitted -> kept
        },
      };

      const merged = mergePassport(current, incoming, { basics: 'merge' });
      expect(merged.project.name).toBe('Original Name');
      expect(merged.project.goal).toBe('Updated Goal');
      expect(merged.project.summary).toBe('Original Summary');
    });

    it('replaces basics fields in replace mode', () => {
      const current = createEmptyPassport('Original Name');
      current.project.goal = 'Original Goal';

      const incoming: IncomingSections = {
        basics: {
          name: 'New Name',
          goal: '', // empty in replace mode clears optional field
        },
      };

      const merged = mergePassport(current, incoming, { basics: 'replace' });
      expect(merged.project.name).toBe('New Name');
      expect(merged.project.goal).toBe('');
    });

    it('merges lists by id first, then by normalized text, appending unmatched items', () => {
      const current = createEmptyPassport('App');
      current.tasks = [
        { id: 't1', text: 'Task 1', status: 'todo', priority: 'medium' },
        { id: 't2', text: 'Task 2', status: 'todo', priority: 'low' },
      ];

      const incoming: IncomingSections = {
        tasks: [
          // Matches t1 by id, updates status
          { id: 't1', text: 'Task 1 Updated', status: 'done', priority: 'medium' },
          // Matches t2 by normalized text, updates priority
          { id: 't2', text: 'task 2', status: 'todo', priority: 'high' },
          // Unmatched, new item
          { id: 't3', text: 'Task 3', status: 'todo', priority: 'low' },
        ],
      };

      let idCounter = 100;
      const stubId = () => `gen-${idCounter++}`;

      const merged = mergePassport(current, incoming, { tasks: 'merge' }, stubId);
      expect(merged.tasks).toHaveLength(3);
      expect(merged.tasks[0]).toEqual({
        id: 't1',
        text: 'Task 1 Updated',
        status: 'done',
        priority: 'medium',
      });
      expect(merged.tasks[1]).toEqual({
        id: 't2',
        text: 'task 2',
        status: 'todo',
        priority: 'high',
      });
      expect(merged.tasks[2]).toEqual({
        id: 't3',
        text: 'Task 3',
        status: 'todo',
        priority: 'low',
      });
    });

    it('replaces lists in replace mode', () => {
      const current = createEmptyPassport('App');
      current.tasks = [{ id: 't1', text: 'Old Task', status: 'todo', priority: 'low' }];

      const incoming: IncomingSections = {
        tasks: [{ id: 'fresh', text: 'Fresh Task', status: 'todo', priority: 'high' }],
      };

      const stubId = () => 'new-id';
      const merged = mergePassport(current, incoming, { tasks: 'replace' }, stubId);
      expect(merged.tasks).toHaveLength(1);
      expect(merged.tasks[0]).toEqual({
        id: 'fresh',
        text: 'Fresh Task',
        status: 'todo',
        priority: 'high',
      });
    });

    it('skips section when action is skip', () => {
      const current = createEmptyPassport('App');
      current.decisions = [{ id: 'd1', decision: 'Keep SQLite', reason: 'Simple', date: '2026-01-01', status: 'active' }];

      const incoming: IncomingSections = {
        decisions: [{ id: 'd2', decision: 'Switch to Postgres', reason: 'Scale', date: '2026-02-01', status: 'active' }],
      };

      const merged = mergePassport(current, incoming, { decisions: 'skip' });
      expect(merged.decisions).toEqual(current.decisions);
    });

    it('merges instructions and openQuestions by union deduplication', () => {
      const current = createEmptyPassport('App');
      current.instructions = ['Use TypeScript', 'Write unit tests'];
      current.openQuestions = ['Which DB?'];

      const incoming: IncomingSections = {
        instructions: ['use typescript', 'Run linter'],
        openQuestions: ['which db?', 'Which UI framework?'],
      };

      const merged = mergePassport(current, incoming, { instructions: 'merge', openQuestions: 'merge' });
      expect(merged.instructions).toEqual(['Use TypeScript', 'Write unit tests', 'Run linter']);
      expect(merged.openQuestions).toEqual(['Which DB?', 'Which UI framework?']);
    });

    it('handles nextAction: replace or skip only', () => {
      const current = createEmptyPassport('App');
      current.nextAction = 'Old next action';

      const incoming: IncomingSections = {
        nextAction: 'New next action',
      };

      // Replace
      const replaced = mergePassport(current, incoming, { nextAction: 'replace' });
      expect(replaced.nextAction).toBe('New next action');

      // Merge (treated as replace)
      const mergedWithMerge = mergePassport(current, incoming, { nextAction: 'merge' });
      expect(mergedWithMerge.nextAction).toBe('New next action');

      // Skip
      const skipped = mergePassport(current, incoming, { nextAction: 'skip' });
      expect(skipped.nextAction).toBe('Old next action');
    });

    it('merges bugs and updates bugsReviewed correctly', () => {
      const current = createEmptyPassport('App');
      current.bugsReviewed = false;
      current.bugs = [{ id: 'b1', text: 'Bug A', severity: 'low', status: 'open' }];

      const incoming: IncomingSections = {
        bugs: [{ id: 'b2', text: 'Bug B', severity: 'high', status: 'open' }],
        bugsReviewed: true,
      };

      const merged = mergePassport(current, incoming, { bugs: 'merge' }, () => 'b2');
      expect(merged.bugs).toHaveLength(2);
      expect(merged.bugsReviewed).toBe(true);
    });
  });
});
