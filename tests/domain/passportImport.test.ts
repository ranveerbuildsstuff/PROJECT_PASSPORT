import { describe, it, expect } from 'vitest';
import {
  normalizeImportedPassport,
  PassportImportSchema,
  MERGE_SECTION_IDS,
} from '../../src/domain/passportImport';

/**
 * Shared helper asserting every error/issue string is free of forbidden substrings.
 * Invariant: Never contains /invalid_|Expected|undefined|\[object|ZodError|\{/
 */
export function assertCleanErrorString(msg: string): void {
  expect(msg).not.toMatch(/invalid_/);
  expect(msg).not.toMatch(/Expected/);
  expect(msg).not.toMatch(/undefined/);
  expect(msg).not.toMatch(/\[object/);
  expect(msg).not.toMatch(/ZodError/);
  expect(msg).not.toContain('{');
}

describe('PassportImportSchema', () => {
  it('exports all 10 merge section ids', () => {
    expect(MERGE_SECTION_IDS).toEqual([
      'basics',
      'stack',
      'requirements',
      'decisions',
      'completed',
      'tasks',
      'bugs',
      'instructions',
      'nextAction',
      'openQuestions',
    ]);
  });

  it('allows empty object since all sections are optional', () => {
    const res = PassportImportSchema.safeParse({});
    expect(res.success).toBe(true);
  });

  it('allows item ids to be omitted', () => {
    const res = PassportImportSchema.safeParse({
      requirements: [{ text: 'Req without ID', priority: 'must' }],
      tasks: [{ text: 'Task without ID', status: 'todo', priority: 'high' }],
      bugs: [{ text: 'Bug without ID', severity: 'low', status: 'open' }],
    });
    expect(res.success).toBe(true);
  });
});

describe('normalizeImportedPassport', () => {
  it('unwraps {"passport": {...}} one-level', () => {
    const raw = {
      passport: {
        project: { name: 'Unwrapped App', status: 'idea' },
        tasks: [{ text: 'First task' }],
      },
    };
    const res = normalizeImportedPassport(raw);
    expect(res.sections.basics?.name).toBe('Unwrapped App');
    expect(res.sections.tasks).toHaveLength(1);
    expect(res.presentSections).toContain('basics');
    expect(res.presentSections).toContain('tasks');
  });

  it('reports plain error when schemaVersion is not 1', () => {
    const raw = {
      schemaVersion: 2,
      project: { name: 'Future Version' },
    };
    const res = normalizeImportedPassport(raw);
    expect(res.issues).toHaveLength(1);
    expect(res.issues[0]).toBe('This reply uses passport version 2. This app reads version 1.');
    assertCleanErrorString(res.issues[0]!);
  });

  it('ignores schemaVersion: 1 and adds to ignoredKeys', () => {
    const raw = {
      schemaVersion: 1,
      project: { name: 'Valid Version' },
    };
    const res = normalizeImportedPassport(raw);
    expect(res.ignoredKeys).toContain('schemaVersion');
    expect(res.issues).toHaveLength(0);
  });

  it('ignores project.id, createdAt, updatedAt, files, conversations and unknown keys', () => {
    const raw = {
      id: 'root-id',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
      files: [{ path: 'src/main.ts', purpose: 'entry', included: true, sizeBytes: 100 }],
      conversations: [{ id: 'c1', title: 'Chat', source: 'chatgpt', messageCount: 5, tokenEstimate: 200, included: true }],
      customMetadata: 'should be ignored',
      project: {
        id: 'proj-id',
        name: 'App',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-02',
        extraField: 'ignore me',
      },
    };
    const res = normalizeImportedPassport(raw);

    expect(res.ignoredKeys).toContain('project.id');
    expect(res.ignoredKeys).toContain('createdAt');
    expect(res.ignoredKeys).toContain('updatedAt');
    expect(res.ignoredKeys).toContain('files');
    expect(res.ignoredKeys).toContain('conversations');
    expect(res.ignoredKeys).toContain('customMetadata');
    expect(res.ignoredKeys).toContain('project.extraField');
  });

  describe('Allowed Coercions', () => {
    it('coerces null to omitted', () => {
      const raw = {
        project: {
          name: 'App',
          goal: null,
          summary: null,
          status: 'in_progress',
        },
        stack: [
          { name: 'TypeScript', role: null, version: null, notes: null },
        ],
        nextAction: null,
      };
      const res = normalizeImportedPassport(raw);

      expect(res.sections.basics?.goal).toBeUndefined();
      expect(res.sections.basics?.summary).toBeUndefined();
      expect(res.sections.stack?.[0]?.role).toBeUndefined();
      expect(res.sections.stack?.[0]?.version).toBeUndefined();
      expect(res.sections.stack?.[0]?.notes).toBeUndefined();
      expect(res.sections.nextAction).toBeUndefined();
      expect(res.issues).toHaveLength(0);
    });

    it('coerces enums case-insensitively with spaces and hyphens turned to underscores', () => {
      const raw = {
        project: {
          name: 'Enum Test',
          status: 'IN-PROGRESS',
        },
        requirements: [
          { text: 'Must do', priority: 'MUST' },
        ],
        decisions: [
          { decision: 'Use TS', reason: 'Types', status: 'Super-Seded' },
        ],
        tasks: [
          { text: 'Deploy', status: 'IN PROGRESS', priority: 'HIGH' },
        ],
        bugs: [
          { text: 'Crash on start', severity: 'HIGH', status: 'FIXED' },
        ],
      };
      const res = normalizeImportedPassport(raw);

      expect(res.sections.basics?.status).toBe('in_progress');
      expect(res.sections.requirements?.[0]?.priority).toBe('must');
      expect(res.sections.decisions?.[0]?.status).toBe('superseded');
      expect(res.sections.tasks?.[0]?.priority).toBe('high');
      expect(res.sections.bugs?.items[0]?.severity).toBe('high');
      expect(res.sections.bugs?.items[0]?.status).toBe('fixed');
    });

    it('coerces single string to one-element array for instructions and openQuestions', () => {
      const raw = {
        instructions: 'Use TypeScript strict mode at all times.',
        openQuestions: 'Should we support mobile Safari?',
      };
      const res = normalizeImportedPassport(raw);

      expect(res.sections.instructions).toEqual(['Use TypeScript strict mode at all times.']);
      expect(res.sections.openQuestions).toEqual(['Should we support mobile Safari?']);
      expect(res.presentSections).toContain('instructions');
      expect(res.presentSections).toContain('openQuestions');
    });

    it('trims all strings', () => {
      const raw = {
        project: {
          name: '  Trimmed Project  ',
          goal: '  Trimmed Goal  ',
        },
        nextAction: '   Next step   ',
        instructions: ['  Trimmed instruction  '],
      };
      const res = normalizeImportedPassport(raw);

      expect(res.sections.basics?.name).toBe('Trimmed Project');
      expect(res.sections.basics?.goal).toBe('Trimmed Goal');
      expect(res.sections.nextAction).toBe('Next step');
      expect(res.sections.instructions).toEqual(['Trimmed instruction']);
    });

    it('coerces string "true"/"false" to boolean for bugsReviewed', () => {
      const raw1 = { bugsReviewed: 'true' };
      const res1 = normalizeImportedPassport(raw1);
      expect(res1.sections.bugsReviewed).toBe(true);
      expect(res1.sections.bugs?.bugsReviewed).toBe(true);

      const raw2 = { bugsReviewed: 'false' };
      const res2 = normalizeImportedPassport(raw2);
      expect(res2.sections.bugsReviewed).toBe(false);
      expect(res2.sections.bugs?.bugsReviewed).toBe(false);
    });

    it('drops empty-text items with a note', () => {
      const raw = {
        requirements: [
          { text: '   ', priority: 'must' },
          { text: 'Valid requirement', priority: 'should' },
        ],
        tasks: [
          { text: '', status: 'todo' },
          { text: 'Valid task', status: 'done' },
        ],
        bugs: [
          { text: '  ', severity: 'low' },
        ],
        completed: [
          { text: '   ' },
        ],
      };
      const res = normalizeImportedPassport(raw);

      expect(res.sections.requirements).toHaveLength(1);
      expect(res.sections.requirements?.[0]?.text).toBe('Valid requirement');
      expect(res.sections.tasks).toHaveLength(1);
      expect(res.sections.tasks?.[0]?.text).toBe('Valid task');
      expect(res.sections.bugs?.items).toHaveLength(0);
      expect(res.sections.completed).toHaveLength(0);

      expect(res.notes).toContain('Dropped empty requirement');
      expect(res.notes).toContain('Dropped empty task');
      expect(res.notes).toContain('Dropped empty bug');
      expect(res.notes).toContain('Dropped empty completed item');
    });

    it('regenerates missing and duplicate IDs using stub factory', () => {
      let counter = 100;
      const stubIdFactory = () => `gen-${++counter}`;

      const raw = {
        requirements: [
          { text: 'Req 1' }, // missing id
          { id: 'dup-id', text: 'Req 2' },
          { id: 'dup-id', text: 'Req 3' }, // duplicate id
        ],
        tasks: [
          { id: 'dup-id', text: 'Task 1' }, // duplicate id from requirements
          { text: 'Task 2' }, // missing id
        ],
      };

      const res = normalizeImportedPassport(raw, stubIdFactory);

      expect(res.sections.requirements?.[0]?.id).toBe('gen-101');
      expect(res.sections.requirements?.[1]?.id).toBe('dup-id');
      expect(res.sections.requirements?.[2]?.id).toBe('gen-102');
      expect(res.sections.tasks?.[0]?.id).toBe('gen-103');
      expect(res.sections.tasks?.[1]?.id).toBe('gen-104');
    });
  });

  describe('Validation & Invariants', () => {
    it('produces clean plain-language errors for invalid enum values', () => {
      const raw = {
        project: { name: 'App', status: 'invalid_status' },
        decisions: [{ decision: 'Arch', reason: 'Scale', status: 'wip' }],
      };
      const res = normalizeImportedPassport(raw);

      expect(res.issues.length).toBeGreaterThan(0);
      for (const issue of res.issues) {
        assertCleanErrorString(issue);
      }
      expect(res.issues.some((i) => i.includes('Project status must be one of'))).toBe(true);
      expect(res.issues.some((i) => i.includes('Decision 1 has an invalid status'))).toBe(true);
    });
  });
});
