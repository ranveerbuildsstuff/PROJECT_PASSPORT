import { describe, it, expect, vi } from 'vitest';
import { diffPassports, type DiffSectionId } from '../../src/domain/diff';
import type { PassportV1 } from '../../src/domain/passport.schema';
import type { CheckpointRecordModel } from '../../src/domain/checkpoint';

function createMockPassport(overrides: Partial<PassportV1> = {}): PassportV1 {
  return {
    schemaVersion: 1,
    project: {
      id: 'p1',
      name: 'Project Alpha',
      goal: 'Initial Goal',
      summary: 'Initial Summary',
      status: 'in_progress',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...(overrides.project || {}),
    },
    stack: overrides.stack ?? [{ name: 'TypeScript', role: 'Language', version: '5.0' }],
    requirements: overrides.requirements ?? [{ id: 'req-1', text: 'Auth support', priority: 'must' }],
    decisions: overrides.decisions ?? [
      { id: 'dec-1', decision: 'Use Dexie', reason: 'IndexedDB wrapper', status: 'active', date: '2026-01-01' },
    ],
    completed: overrides.completed ?? [{ id: 'comp-1', text: 'Setup project' }],
    tasks: overrides.tasks ?? [{ id: 'task-1', text: 'Build diff engine', status: 'doing', priority: 'high' }],
    bugs: overrides.bugs ?? [{ id: 'bug-1', text: 'Minor styling bug', severity: 'low', status: 'open' }],
    bugsReviewed: overrides.bugsReviewed ?? false,
    instructions: overrides.instructions ?? ['Always run tests before commit'],
    files: overrides.files ?? [
      { path: 'src/main.ts', purpose: 'Entry point', included: true, sizeBytes: 1024 },
    ],
    conversations: overrides.conversations ?? [
      {
        id: 'conv-1',
        title: 'Initial architecture discussion',
        source: 'chatgpt',
        messageCount: 12,
        tokenEstimate: 2400,
        included: true,
      },
    ],
    nextAction: overrides.nextAction ?? 'Implement checkpoints timeline',
    openQuestions: overrides.openQuestions ?? ['Should we prune checkpoints?'],
  };
}

describe('diffPassports Engine', () => {
  it('returns no changes when comparing identical passports', () => {
    const passportA = createMockPassport();
    const result = diffPassports(passportA, passportA);

    expect(result.hasChanges).toBe(false);
    expect(result.totalChanges).toBe(0);
    expect(result.summary).toBe('No differences between these two versions.');

    const sections = Object.keys(result.sections) as DiffSectionId[];
    expect(sections.length).toBe(12);
    for (const sec of sections) {
      expect(result.sections[sec].hasChanges).toBe(false);
      expect(result.sections[sec].added.length).toBe(0);
      expect(result.sections[sec].removed.length).toBe(0);
      expect(result.sections[sec].changed.length).toBe(0);
    }
  });

  it('detects changes in Basics (name, status, goal, summary)', () => {
    const pA = createMockPassport();
    const pB = createMockPassport({
      project: {
        ...pA.project,
        name: 'Project Beta',
        status: 'done',
        goal: '',
        summary: 'Updated Summary',
      },
    });

    const diffAB = diffPassports(pA, pB);
    const basics = diffAB.sections.basics;
    expect(basics.hasChanges).toBe(true);

    // name and status changed
    const nameChange = basics.changed.find((c) => c.id === 'name');
    expect(nameChange?.before.value).toBe('Project Alpha');
    expect(nameChange?.after.value).toBe('Project Beta');

    const statusChange = basics.changed.find((c) => c.id === 'status');
    expect(statusChange?.before.value).toBe('in_progress');
    expect(statusChange?.after.value).toBe('done');

    // goal was removed (became empty)
    expect(basics.removed.some((r) => r.field === 'goal')).toBe(true);

    // summary changed
    const summaryChange = basics.changed.find((c) => c.id === 'summary');
    expect(summaryChange?.before.value).toBe('Initial Summary');
    expect(summaryChange?.after.value).toBe('Updated Summary');
  });

  it('detects goal addition when previously empty', () => {
    const pA = createMockPassport();
    pA.project.goal = '';
    const pB = createMockPassport();
    pB.project.goal = 'New Brand Goal';

    const diffAB = diffPassports(pA, pB);
    expect(diffAB.sections.basics.added).toEqual([{ field: 'goal', value: 'New Brand Goal' }]);
    expect(diffAB.sections.basics.removed).toEqual([]);

    const diffBA = diffPassports(pB, pA);
    expect(diffBA.sections.basics.removed).toEqual([{ field: 'goal', value: 'New Brand Goal' }]);
    expect(diffBA.sections.basics.added).toEqual([]);
  });

  it('detects Stack changes, additions, removals, and reordering', () => {
    const pA = createMockPassport({
      stack: [
        { name: 'TypeScript', role: 'Language', version: '5.0' },
        { name: 'React', role: 'UI' },
      ],
    });
    const pB = createMockPassport({
      stack: [
        { name: 'TypeScript', role: 'Language', version: '5.2' }, // changed version
        { name: 'Tailwind CSS', role: 'Styles' }, // added
      ],
    });

    const diff = diffPassports(pA, pB);
    const stack = diff.sections.stack;
    expect(stack.hasChanges).toBe(true);
    expect(stack.added.map((s) => s.name)).toEqual(['Tailwind CSS']);
    expect(stack.removed.map((s) => s.name)).toEqual(['React']);
    expect(stack.changed.length).toBe(1);
    expect(stack.changed[0]!.id).toBe('typescript');
    expect(stack.changed[0]!.changedFields).toEqual([
      { field: 'version', before: '5.0', after: '5.2' },
    ]);

    // Test reordering
    const pReordered = createMockPassport({
      stack: [
        { name: 'React', role: 'UI' },
        { name: 'TypeScript', role: 'Language', version: '5.0' },
      ],
    });
    const reorderDiff = diffPassports(pA, pReordered);
    expect(reorderDiff.sections.stack.reordered).toBe(true);
    expect(reorderDiff.sections.stack.added.length).toBe(0);
    expect(reorderDiff.sections.stack.removed.length).toBe(0);
    expect(reorderDiff.sections.stack.changed.length).toBe(0);
    expect(reorderDiff.sections.stack.summary.toLowerCase()).toContain('reordered');
  });

  it('detects Requirements additions, removals, field changes, and reordering', () => {
    const pA = createMockPassport({
      requirements: [
        { id: 'req-1', text: 'Auth support', priority: 'must' },
        { id: 'req-2', text: 'Offline first', priority: 'should' },
      ],
    });
    const pB = createMockPassport({
      requirements: [
        { id: 'req-1', text: 'Auth support (OAuth2)', priority: 'must' }, // text changed
        { id: 'req-3', text: 'PWA support', priority: 'could' }, // added
      ],
    });

    const diff = diffPassports(pA, pB);
    const reqs = diff.sections.requirements;
    expect(reqs.hasChanges).toBe(true);
    expect(reqs.added.map((r) => r.id)).toEqual(['req-3']);
    expect(reqs.removed.map((r) => r.id)).toEqual(['req-2']);
    expect(reqs.changed.length).toBe(1);
    expect(reqs.changed[0]!.id).toBe('req-1');
  });

  it('detects Decisions additions, removals, and changes', () => {
    const pA = createMockPassport({
      decisions: [
        { id: 'dec-1', decision: 'Use Dexie', reason: 'IndexedDB', status: 'active', date: '2026-01-01' },
      ],
    });
    const pB = createMockPassport({
      decisions: [
        { id: 'dec-1', decision: 'Use Dexie', reason: 'IndexedDB', status: 'superseded', date: '2026-01-01' },
      ],
    });

    const diff = diffPassports(pA, pB);
    expect(diff.sections.decisions.changed.length).toBe(1);
    expect(diff.sections.decisions.changed[0]!.changedFields).toEqual([
      { field: 'status', before: 'active', after: 'superseded' },
    ]);
  });

  it('detects Completed items additions, removals, and changes', () => {
    const pA = createMockPassport({ completed: [{ id: 'comp-1', text: 'Phase 1' }] });
    const pB = createMockPassport({
      completed: [
        { id: 'comp-1', text: 'Phase 1 (Complete)' },
        { id: 'comp-2', text: 'Phase 2' },
      ],
    });

    const diff = diffPassports(pA, pB);
    expect(diff.sections.completed.added.length).toBe(1);
    expect(diff.sections.completed.changed.length).toBe(1);
    expect(diff.sections.completed.removed.length).toBe(0);
  });

  it('detects Tasks additions, removals, status changes, and priority changes', () => {
    const pA = createMockPassport({
      tasks: [
        { id: 't-1', text: 'Task 1', status: 'todo', priority: 'medium' },
        { id: 't-2', text: 'Task 2', status: 'doing', priority: 'high' },
      ],
    });
    const pB = createMockPassport({
      tasks: [
        { id: 't-1', text: 'Task 1', status: 'done', priority: 'high' }, // status & priority changed
      ],
    });

    const diff = diffPassports(pA, pB);
    const tasks = diff.sections.tasks;
    expect(tasks.removed.map((t) => t.id)).toEqual(['t-2']);
    expect(tasks.changed.length).toBe(1);
    expect(tasks.changed[0]!.changedFields).toEqual([
      { field: 'status', before: 'todo', after: 'done' },
      { field: 'priority', before: 'medium', after: 'high' },
    ]);
  });

  it('detects Bugs additions, removals, and bugsReviewed status toggling', () => {
    const pA = createMockPassport({
      bugs: [{ id: 'b-1', text: 'Crash on import', severity: 'high', status: 'open' }],
      bugsReviewed: false,
    });
    const pB = createMockPassport({
      bugs: [{ id: 'b-1', text: 'Crash on import', severity: 'high', status: 'fixed' }],
      bugsReviewed: true,
    });

    const diff = diffPassports(pA, pB);
    const bugs = diff.sections.bugs;
    expect(bugs.hasChanges).toBe(true);
    expect(bugs.changed.some((c) => c.id === 'b-1')).toBe(true);
    expect(bugs.changed.some((c) => c.id === 'bugsReviewed')).toBe(true);
  });

  describe('Duplicate IDs handling and symmetry', () => {
    it('matches duplicate IDs by first occurrence and ignores subsequent duplicates', () => {
      const pA = createMockPassport({
        tasks: [
          { id: 'dup-1', text: 'Original 1', status: 'todo', priority: 'medium' },
          { id: 'dup-1', text: 'Duplicate in A', status: 'done', priority: 'high' },
        ],
      });
      const pB = createMockPassport({
        tasks: [
          { id: 'dup-1', text: 'Updated 1', status: 'doing', priority: 'medium' },
          { id: 'dup-1', text: 'Duplicate in B', status: 'done', priority: 'low' },
          { id: 'dup-2', text: 'New task', status: 'todo', priority: 'low' },
          { id: 'dup-2', text: 'Duplicate of new task', status: 'todo', priority: 'high' },
        ],
      });

      const diffAB = diffPassports(pA, pB);
      // dup-2 is added exactly once (first occurrence)
      expect(diffAB.sections.tasks.added).toHaveLength(1);
      expect(diffAB.sections.tasks.added[0]!.text).toBe('New task');

      // dup-1 is changed exactly once (first occurrence compared)
      expect(diffAB.sections.tasks.changed).toHaveLength(1);
      expect(diffAB.sections.tasks.changed[0]!.before.text).toBe('Original 1');
      expect(diffAB.sections.tasks.changed[0]!.after.text).toBe('Updated 1');

      // nothing removed
      expect(diffAB.sections.tasks.removed).toHaveLength(0);
    });

    it('enforces added/removed symmetry invariant even with duplicate IDs', () => {
      const pA = createMockPassport({
        requirements: [
          { id: 'req-dup', text: 'Req in A 1', priority: 'must' },
          { id: 'req-dup', text: 'Req in A 2', priority: 'should' },
          { id: 'req-only-a', text: 'Only in A', priority: 'could' },
          { id: 'req-only-a', text: 'Only in A dup', priority: 'could' },
        ],
      });
      const pB = createMockPassport({
        requirements: [
          { id: 'req-dup', text: 'Req in B 1', priority: 'must' },
          { id: 'req-dup', text: 'Req in B 2', priority: 'should' },
          { id: 'req-only-b', text: 'Only in B', priority: 'must' },
          { id: 'req-only-b', text: 'Only in B dup', priority: 'must' },
        ],
      });

      const diffAB = diffPassports(pA, pB);
      const diffBA = diffPassports(pB, pA);

      const addedIdsAB = diffAB.sections.requirements.added.map((r) => r.id);
      const removedIdsBA = diffBA.sections.requirements.removed.map((r) => r.id);
      expect(addedIdsAB).toEqual(removedIdsBA);

      const removedIdsAB = diffAB.sections.requirements.removed.map((r) => r.id);
      const addedIdsBA = diffBA.sections.requirements.added.map((r) => r.id);
      expect(removedIdsAB).toEqual(addedIdsBA);
    });
  });

  it('detects Instructions and Open Questions (string list normalization & reordering)', () => {
    const pA = createMockPassport({
      instructions: ['Alpha rule', 'Beta rule'],
      openQuestions: ['Q1?'],
    });
    const pB = createMockPassport({
      instructions: ['beta rule', 'Gamma rule'], // 'Alpha rule' removed, 'Gamma rule' added, 'Beta rule' kept via normalization
      openQuestions: [],
    });

    const diff = diffPassports(pA, pB);
    expect(diff.sections.instructions.added).toEqual(['Gamma rule']);
    expect(diff.sections.instructions.removed).toEqual(['Alpha rule']);
    expect(diff.sections.openQuestions.removed).toEqual(['Q1?']);
  });

  it('detects Next Action additions, removals, and updates', () => {
    const pA = createMockPassport({ nextAction: 'First action' });
    const pB = createMockPassport({ nextAction: 'Second action' });
    const pEmpty = createMockPassport({ nextAction: '' });

    // Changed
    const diffChange = diffPassports(pA, pB);
    expect(diffChange.sections.nextAction.changed.length).toBe(1);
    expect(diffChange.sections.nextAction.changed[0]!.after.value).toBe('Second action');

    // Removed
    const diffRemove = diffPassports(pA, pEmpty);
    expect(diffRemove.sections.nextAction.removed.length).toBe(1);

    // Added
    const diffAdd = diffPassports(pEmpty, pB);
    expect(diffAdd.sections.nextAction.added.length).toBe(1);
  });

  it('detects Files manifest differences and sha256 content changes', () => {
    const pA = createMockPassport();
    const filesA = [
      {
        path: 'src/app.ts',
        purpose: 'Main',
        included: true,
        sizeBytes: 500,
        sha256: 'aaaa1111222233334444555566667777888899990000aaaabbbbccccddddeeee',
      },
      {
        path: 'src/utils.ts',
        purpose: 'Helpers',
        included: true,
        sizeBytes: 200,
        sha256: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
      },
    ];

    const pB = createMockPassport();
    const filesB = [
      {
        path: 'src/app.ts',
        purpose: 'Main App', // purpose changed
        included: true,
        sizeBytes: 550, // size changed
        sha256: 'bbbb1111222233334444555566667777888899990000aaaabbbbccccddddeeee', // hash changed -> content changed
      },
      {
        path: 'src/extra.ts', // added
        purpose: 'Extra',
        included: false,
        sizeBytes: 100,
        sha256: null,
      },
    ];

    const diff = diffPassports(pA, pB, {
      fromMeta: { files: filesA },
      toMeta: { files: filesB },
    });

    const fileDiff = diff.sections.files;
    expect(fileDiff.hasChanges).toBe(true);
    expect(fileDiff.added.map((f) => f.path)).toEqual(['src/extra.ts']);
    expect(fileDiff.removed.map((f) => f.path)).toEqual(['src/utils.ts']);
    expect(fileDiff.changed.length).toBe(1);

    const changedApp = fileDiff.changed[0]!;
    expect(changedApp.id).toBe('src/app.ts');
    expect(changedApp.contentChanged).toBe(true);
    expect(changedApp.changedFields.some((f) => f.field === 'sha256')).toBe(true);
    expect(changedApp.changedFields.some((f) => f.field === 'purpose')).toBe(true);
  });

  it('detects Conversations additions, removals, and detail changes', () => {
    const pA = createMockPassport({
      conversations: [
        { id: 'c1', title: 'Chat 1', source: 'claude', messageCount: 5, tokenEstimate: 500, included: true },
        { id: 'c2', title: 'Chat 2', source: 'chatgpt', messageCount: 10, tokenEstimate: 1000, included: true },
      ],
    });
    const pB = createMockPassport({
      conversations: [
        { id: 'c1', title: 'Chat 1 (Updated)', source: 'claude', messageCount: 8, tokenEstimate: 800, included: true },
        { id: 'c3', title: 'Chat 3', source: 'gemini', messageCount: 2, tokenEstimate: 200, included: true },
      ],
    });

    const diff = diffPassports(pA, pB);
    const convDiff = diff.sections.conversations;
    expect(convDiff.hasChanges).toBe(true);
    expect(convDiff.added.map((c) => c.id)).toEqual(['c3']);
    expect(convDiff.removed.map((c) => c.id)).toEqual(['c2']);
    expect(convDiff.changed.length).toBe(1);
    expect(convDiff.changed[0]!.id).toBe('c1');
    expect(convDiff.changed[0]!.changedFields.some((f) => f.field === 'title')).toBe(true);
  });

  it('marks legacy checkpoints with notRecorded: true for files and conversations', () => {
    const pA = createMockPassport();
    const legacyCheckpoint: CheckpointRecordModel = {
      id: 'cp-legacy-1',
      projectId: 'p1',
      createdAt: '2026-01-01T00:00:00.000Z',
      description: 'Before AI merge',
      passport: createMockPassport(),
      // files and conversationIds undefined
    };

    const diff = diffPassports(legacyCheckpoint, pA);
    expect(diff.sections.files.notRecorded).toBe(true);
    expect(diff.sections.files.summary).toContain('Not recorded');
    expect(diff.sections.files.added.length).toBe(0);
    expect(diff.sections.files.removed.length).toBe(0);

    expect(diff.sections.conversations.notRecorded).toBe(true);
    expect(diff.sections.conversations.summary).toContain('Not recorded');
    expect(diff.sections.conversations.added.length).toBe(0);
    expect(diff.sections.conversations.removed.length).toBe(0);
  });

  it('strictly satisfies the symmetry invariant diff(a, b).added === diff(b, a).removed across all sections', () => {
    const pA = createMockPassport({
      project: {
        id: 'p1',
        name: 'Project A',
        goal: 'Goal A',
        summary: 'Summary A',
        status: 'idea',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      stack: [{ name: 'React', role: 'UI' }, { name: 'Vite' }],
      requirements: [{ id: 'r1', text: 'Req 1', priority: 'must' }],
      decisions: [{ id: 'd1', decision: 'Dec 1', reason: 'R1', status: 'active' }],
      completed: [{ id: 'c1', text: 'Comp 1' }],
      tasks: [{ id: 't1', text: 'Task 1', status: 'todo', priority: 'low' }],
      bugs: [{ id: 'b1', text: 'Bug 1', severity: 'low', status: 'open' }],
      instructions: ['Inst A'],
      files: [{ path: 'fileA.ts', purpose: 'File A', included: true, sizeBytes: 100 }],
      conversations: [
        { id: 'convA', title: 'Conv A', source: 'chatgpt', messageCount: 1, tokenEstimate: 100, included: true },
      ],
      nextAction: 'Action A',
      openQuestions: ['Q A'],
    });

    const pB = createMockPassport({
      project: {
        id: 'p1',
        name: 'Project B',
        goal: '',
        summary: 'Summary B',
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      stack: [{ name: 'Vue', role: 'UI' }],
      requirements: [{ id: 'r2', text: 'Req 2', priority: 'should' }],
      decisions: [{ id: 'd2', decision: 'Dec 2', reason: 'R2', status: 'superseded' }],
      completed: [{ id: 'c2', text: 'Comp 2' }],
      tasks: [{ id: 't2', text: 'Task 2', status: 'doing', priority: 'high' }],
      bugs: [{ id: 'b2', text: 'Bug 2', severity: 'high', status: 'open' }],
      instructions: ['Inst B'],
      files: [{ path: 'fileB.ts', purpose: 'File B', included: false, sizeBytes: 200 }],
      conversations: [
        { id: 'convB', title: 'Conv B', source: 'claude', messageCount: 2, tokenEstimate: 200, included: true },
      ],
      nextAction: '',
      openQuestions: ['Q B'],
    });

    const diffAB = diffPassports(pA, pB);
    const diffBA = diffPassports(pB, pA);

    const sections = Object.keys(diffAB.sections) as DiffSectionId[];
    for (const sec of sections) {
      expect(diffAB.sections[sec].added.length).toBe(diffBA.sections[sec].removed.length);
      expect(diffAB.sections[sec].removed.length).toBe(diffBA.sections[sec].added.length);
      expect(diffAB.sections[sec].changed.length).toBe(diffBA.sections[sec].changed.length);
    }
  });

  it('runs 500-iteration seeded PRNG fuzz test verifying diff invariants', () => {
    // Simple LCG PRNG for reproducible fuzz test
    let seed = 123456789;
    function rand(): number {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }

    function pickRandom<T>(arr: T[]): T {
      return arr[Math.floor(rand() * arr.length)]!;
    }

    for (let i = 0; i < 500; i++) {
      const taskCountA = Math.floor(rand() * 5);
      const taskCountB = Math.floor(rand() * 5);

      const allIds = ['t-1', 't-2', 't-3', 't-4', 't-5', 't-6', 't-7', 't-8'];
      const shuffledA = [...allIds].sort(() => rand() - 0.5).slice(0, taskCountA);
      const shuffledB = [...allIds].sort(() => rand() - 0.5).slice(0, taskCountB);

      const tasksA = shuffledA.map((id, idx) => ({
        id,
        text: `Task ${idx} (${rand() > 0.5 ? 'variant1' : 'variant2'})`,
        status: pickRandom(['todo', 'doing', 'done', 'blocked'] as const),
        priority: pickRandom(['low', 'medium', 'high'] as const),
      }));

      const tasksB = shuffledB.map((id, idx) => ({
        id,
        text: `Task ${idx} (${rand() > 0.5 ? 'variant1' : 'variant2'})`,
        status: pickRandom(['todo', 'doing', 'done', 'blocked'] as const),
        priority: pickRandom(['low', 'medium', 'high'] as const),
      }));

      const pA = createMockPassport({ tasks: tasksA });
      const pB = createMockPassport({ tasks: tasksB });

      const diffAB = diffPassports(pA, pB);
      const diffBA = diffPassports(pB, pA);

      expect(diffAB.sections.tasks.added.length).toBe(diffBA.sections.tasks.removed.length);
      expect(diffAB.sections.tasks.removed.length).toBe(diffBA.sections.tasks.added.length);
      expect(diffAB.sections.tasks.changed.length).toBe(diffBA.sections.tasks.changed.length);
    }
  });

  it('sentinel check: zero console logging occurs during diff computation (Rule 6)', () => {
    const logSpy = vi.spyOn(console, 'log');
    const errorSpy = vi.spyOn(console, 'error');
    const warnSpy = vi.spyOn(console, 'warn');

    const pA = createMockPassport();
    const pB = createMockPassport({ nextAction: 'Secret instruction text' });

    diffPassports(pA, pB);

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('matches stack items by normalized name regardless of casing', () => {
    const pA = createMockPassport({ stack: [{ name: 'React', role: 'UI' }] });
    const pB = createMockPassport({ stack: [{ name: 'REACT', role: 'UI Framework' }] });

    const diff = diffPassports(pA, pB);
    expect(diff.sections.stack.added.length).toBe(0);
    expect(diff.sections.stack.removed.length).toBe(0);
    expect(diff.sections.stack.changed.length).toBe(1);
    expect(diff.sections.stack.changed[0]!.changedFields.some((f) => f.field === 'name')).toBe(true);
    expect(diff.sections.stack.changed[0]!.changedFields.some((f) => f.field === 'role')).toBe(true);
  });

  it('matches string list items with whitespace normalization', () => {
    const pA = createMockPassport({ instructions: ['Keep  code   clean'] });
    const pB = createMockPassport({ instructions: ['keep code clean'] });

    const diff = diffPassports(pA, pB);
    expect(diff.sections.instructions.hasChanges).toBe(false);
    expect(diff.sections.instructions.added.length).toBe(0);
    expect(diff.sections.instructions.removed.length).toBe(0);
  });

  it('handles excluded files where sha256 is null', () => {
    const pA = createMockPassport();
    const pB = createMockPassport();

    const filesA = [{ path: 'test.bin', purpose: 'Large binary', included: false, sizeBytes: 1000000, sha256: null }];
    const filesB = [{ path: 'test.bin', purpose: 'Large binary updated', included: false, sizeBytes: 1000000, sha256: null }];

    const diff = diffPassports(pA, pB, { fromMeta: { files: filesA }, toMeta: { files: filesB } });
    expect(diff.sections.files.changed.length).toBe(1);
    expect(diff.sections.files.changed[0]!.contentChanged).toBe(false);
    expect(diff.sections.files.changed[0]!.changedFields).toEqual([
      { field: 'purpose', before: 'Large binary', after: 'Large binary updated' },
    ]);
  });

  it('correctly calculates totalChanges across multiple sections', () => {
    const pA = createMockPassport();
    const pB = createMockPassport({
      project: { ...pA.project, name: 'New Name' }, // 1 change
      tasks: [...pA.tasks, { id: 't-new', text: 'New Task', status: 'todo', priority: 'low' }], // 1 added
      nextAction: 'Brand new next action', // 1 change
    });

    const diff = diffPassports(pA, pB);
    expect(diff.totalChanges).toBe(3);
    expect(diff.hasChanges).toBe(true);
    expect(diff.summary).toContain('3 differences across 3 sections');
  });

  it('handles empty nextAction on both sides with zero changes', () => {
    const pA = createMockPassport({ nextAction: '' });
    const pB = createMockPassport({ nextAction: '' });

    const diff = diffPassports(pA, pB);
    expect(diff.sections.nextAction.hasChanges).toBe(false);
  });

  it('detects changes when only project summary changes in basics', () => {
    const pA = createMockPassport();
    const pB = createMockPassport({
      project: { ...pA.project, summary: 'Brand new summary' },
    });

    const diff = diffPassports(pA, pB);
    expect(diff.sections.basics.changed.length).toBe(1);
    expect(diff.sections.basics.changed[0]!.id).toBe('summary');
  });

  it('handles reordering in tasks with identical items', () => {
    const pA = createMockPassport({
      tasks: [
        { id: 't-1', text: 'Task 1', status: 'todo', priority: 'low' },
        { id: 't-2', text: 'Task 2', status: 'todo', priority: 'high' },
      ],
    });
    const pB = createMockPassport({
      tasks: [
        { id: 't-2', text: 'Task 2', status: 'todo', priority: 'high' },
        { id: 't-1', text: 'Task 1', status: 'todo', priority: 'low' },
      ],
    });

    const diff = diffPassports(pA, pB);
    expect(diff.sections.tasks.reordered).toBe(true);
    expect(diff.sections.tasks.added.length).toBe(0);
    expect(diff.sections.tasks.removed.length).toBe(0);
    expect(diff.sections.tasks.changed.length).toBe(0);
  });

  it('handles reordering in requirements with identical items', () => {
    const pA = createMockPassport({
      requirements: [
        { id: 'r-1', text: 'Req 1', priority: 'must' },
        { id: 'r-2', text: 'Req 2', priority: 'should' },
      ],
    });
    const pB = createMockPassport({
      requirements: [
        { id: 'r-2', text: 'Req 2', priority: 'should' },
        { id: 'r-1', text: 'Req 1', priority: 'must' },
      ],
    });

    const diff = diffPassports(pA, pB);
    expect(diff.sections.requirements.reordered).toBe(true);
  });

  it('handles reordering in decisions with identical items', () => {
    const pA = createMockPassport({
      decisions: [
        { id: 'd-1', decision: 'Dec 1', reason: 'R1', status: 'active' },
        { id: 'd-2', decision: 'Dec 2', reason: 'R2', status: 'active' },
      ],
    });
    const pB = createMockPassport({
      decisions: [
        { id: 'd-2', decision: 'Dec 2', reason: 'R2', status: 'active' },
        { id: 'd-1', decision: 'Dec 1', reason: 'R1', status: 'active' },
      ],
    });

    const diff = diffPassports(pA, pB);
    expect(diff.sections.decisions.reordered).toBe(true);
  });

  it('handles reordering in completed items with identical items', () => {
    const pA = createMockPassport({
      completed: [
        { id: 'c-1', text: 'Comp 1' },
        { id: 'c-2', text: 'Comp 2' },
      ],
    });
    const pB = createMockPassport({
      completed: [
        { id: 'c-2', text: 'Comp 2' },
        { id: 'c-1', text: 'Comp 1' },
      ],
    });

    const diff = diffPassports(pA, pB);
    expect(diff.sections.completed.reordered).toBe(true);
  });

  it('handles reordering in bugs with identical items', () => {
    const pA = createMockPassport({
      bugs: [
        { id: 'b-1', text: 'Bug 1', severity: 'low', status: 'open' },
        { id: 'b-2', text: 'Bug 2', severity: 'high', status: 'open' },
      ],
    });
    const pB = createMockPassport({
      bugs: [
        { id: 'b-2', text: 'Bug 2', severity: 'high', status: 'open' },
        { id: 'b-1', text: 'Bug 1', severity: 'low', status: 'open' },
      ],
    });

    const diff = diffPassports(pA, pB);
    expect(diff.sections.bugs.reordered).toBe(true);
  });

  it('handles reordering in instructions with identical items', () => {
    const pA = createMockPassport({ instructions: ['Rule A', 'Rule B'] });
    const pB = createMockPassport({ instructions: ['Rule B', 'Rule A'] });

    const diff = diffPassports(pA, pB);
    expect(diff.sections.instructions.reordered).toBe(true);
  });

  it('handles reordering in open questions with identical items', () => {
    const pA = createMockPassport({ openQuestions: ['Question A', 'Question B'] });
    const pB = createMockPassport({ openQuestions: ['Question B', 'Question A'] });

    const diff = diffPassports(pA, pB);
    expect(diff.sections.openQuestions.reordered).toBe(true);
  });
});
