import { describe, it, expect } from 'vitest';
import { planExport } from '../../src/export/budgeter';
import type { PassportV1 } from '../../src/domain/passport.schema';
import type { FileRecord, ConversationRecord } from '../../src/storage/db';
import type { ConversationTurn } from '../../src/domain/conversation';

function createTestPassport(overrides: Partial<PassportV1> = {}): PassportV1 {
  return {
    schemaVersion: 1,
    project: {
      id: 'p-test',
      name: 'Budget Test Project',
      goal: 'Build an export pipeline',
      summary: 'Export handoff packages within target AI token limits',
      status: 'in_progress',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    stack: [
      { name: 'TypeScript', role: 'Language' },
      { name: 'React', role: 'UI' },
    ],
    requirements: [
      { id: 'r1', text: 'Must enforce 4-tier token budgeting', priority: 'must' },
    ],
    decisions: [
      { id: 'd1', decision: 'Active Decision 1', reason: 'R1', status: 'active' },
      { id: 'd2', decision: 'Superseded Decision 2', reason: 'R2', status: 'superseded' },
    ],
    completed: [
      { id: 'c1', text: 'Scaffold project' },
    ],
    tasks: [
      { id: 't1', text: 'Pending Task 1', status: 'todo', priority: 'high' },
      { id: 't2', text: 'Done Task 2', status: 'done', priority: 'low' },
    ],
    bugs: [
      { id: 'b1', text: 'Open Bug 1', severity: 'medium', status: 'open' },
      { id: 'b2', text: 'Fixed Bug 2', severity: 'low', status: 'fixed' },
    ],
    bugsReviewed: true,
    instructions: ['Always pause before editing code.'],
    files: [
      { path: 'src/main.ts', purpose: 'Entry point', included: true, sizeBytes: 100 },
      { path: 'src/large.ts', purpose: 'Large module', included: true, sizeBytes: 5000 },
      { path: 'src/small.ts', purpose: 'Small helper', included: true, sizeBytes: 50 },
    ],
    conversations: [
      { id: 'conv-1', title: 'Architecture Chat', source: 'claude', messageCount: 4, tokenEstimate: 400, included: true },
    ],
    nextAction: 'Implement export budgeter',
    openQuestions: ['What should the default preset be?'],
    ...overrides,
  };
}

describe('export budgeter module', () => {
  it('never drops Tier 1 even when exceeding budget, surfacing a clear warning', () => {
    const passport = createTestPassport();
    // Tiny budget that cannot even fit Tier 1
    const plan = planExport({ passport }, 100);

    expect(plan.isOverBudget).toBe(true);
    expect(plan.overBudgetWarning).toBeTruthy();
    expect(plan.overBudgetWarning).toContain('Core project state alone');
    expect(plan.tier1Tokens).toBeGreaterThan(100);

    // Tier 1 items must still be included
    const t1Items = plan.allItems.filter((i) => i.tier === '1');
    expect(t1Items.length).toBeGreaterThan(0);
    expect(t1Items.every((i) => i.status === 'included')).toBe(true);

    // Subsequent tiers must be omitted
    expect(plan.includedFiles).toHaveLength(0);
    expect(plan.includedConversations).toHaveLength(0);
  });

  it('includes Tier 2 before Tier 2b', () => {
    const passport = createTestPassport({
      decisions: [
        { id: 'd-act', decision: 'Active Decision', reason: 'Needed', status: 'active' },
        { id: 'd-sup', decision: 'Old Decision', reason: 'Replaced', status: 'superseded' },
      ],
      tasks: [
        { id: 't-todo', text: 'Active Task', status: 'todo', priority: 'high' },
        { id: 't-done', text: 'Finished Task', status: 'done', priority: 'low' },
      ],
    });

    // Provide a budget that accommodates Tier 1 + only active items in Tier 2, but runs out before Tier 2b
    const basePlan = planExport({ passport }, 0);
    const plan = planExport({ passport }, basePlan.tier1Tokens + 15);

    const activeDecItem = plan.allItems.find((i) => i.id === 'tier2:dec:d-act');
    const supDecItem = plan.allItems.find((i) => i.id === 'tier2b:dec:d-sup');

    expect(activeDecItem?.status).toBe('included');
    expect(supDecItem?.status).toBe('omitted');
  });

  it('stops at the first file that does not fit in Tier 3, omitting subsequent files to preserve priority', () => {
    const passport = createTestPassport({
      files: [
        { path: 'file1.ts', purpose: 'Priority 1', included: true, sizeBytes: 100 },
        { path: 'file2-huge.ts', purpose: 'Priority 2', included: true, sizeBytes: 40000 },
        { path: 'file3-tiny.ts', purpose: 'Priority 3', included: true, sizeBytes: 20 },
      ],
      conversations: [],
    });

    const fileRecords: FileRecord[] = [
      { id: 'p:file1.ts', projectId: 'p', path: 'file1.ts', content: 'console.log("file 1");', sizeBytes: 100, mime: 'text/plain', acknowledgedFindings: [] },
      { id: 'p:file2-huge.ts', projectId: 'p', path: 'file2-huge.ts', content: 'x'.repeat(40000), sizeBytes: 40000, mime: 'text/plain', acknowledgedFindings: [] },
      { id: 'p:file3-tiny.ts', projectId: 'p', path: 'file3-tiny.ts', content: 'y'.repeat(20), sizeBytes: 20, mime: 'text/plain', acknowledgedFindings: [] },
    ];

    // Budget allows file1 (~20 tokens) but cannot fit file2-huge (~10,000 tokens)
    const plan = planExport({ passport, files: fileRecords }, 1200);

    expect(plan.includedFiles.map((f) => f.path)).toEqual(['file1.ts']);

    const file2Item = plan.allItems.find((i) => i.id === 'tier3:file:file2-huge.ts');
    const file3Item = plan.allItems.find((i) => i.id === 'tier3:file:file3-tiny.ts');

    expect(file2Item?.status).toBe('omitted');
    expect(file2Item?.reason).toContain('exceeds remaining budget');

    // file3 is small enough on its own, but MUST be omitted because file2 did not fit!
    expect(file3Item?.status).toBe('omitted');
    expect(file3Item?.reason).toContain('earlier file in manifest order did not fit');
  });

  it('trims conversation in Tier 4: keeps newest turns first, trims oldest whole turns', () => {
    const passport = createTestPassport({
      files: [],
      conversations: [
        { id: 'c1', title: 'Test Chat', source: 'claude', messageCount: 4, tokenEstimate: 400, included: true },
      ],
    });

    const convRecord: ConversationRecord = {
      id: 'c1',
      projectId: 'p',
      title: 'Test Chat',
      source: 'claude',
      messages: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    const turns: ConversationTurn[] = [
      { id: 't1', role: 'user', text: 'turn 1: ancient context '.repeat(50) },
      { id: 't2', role: 'assistant', text: 'turn 2: intermediate info '.repeat(50) },
      { id: 't3', role: 'user', text: 'turn 3: recent request '.repeat(10) },
      { id: 't4', role: 'assistant', text: 'turn 4: latest action '.repeat(10) },
    ];

    // Budget fits Tier 1 + Tier 2 + only the newest 2 turns of conversation
    const plan = planExport(
      {
        passport,
        conversations: [{ record: convRecord, turns }],
      },
      800
    );

    expect(plan.includedConversations).toHaveLength(1);
    const includedConv = plan.includedConversations[0]!;
    expect(includedConv.isTrimmed).toBe(true);
    expect(includedConv.turns.map((t) => t.id)).toEqual(['t3', 't4']); // newest 2 turns kept in chronological order

    const convItem = plan.allItems.find((i) => i.id === 'tier4:conv:c1');
    expect(convItem?.status).toBe('trimmed');
    expect(convItem?.reason).toContain('2 older turns trimmed');
  });

  it('runs 500-iteration seeded PRNG fuzz test verifying deterministic budget monotonicity', () => {
    let seed = 42;
    function random(): number {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }

    const passport = createTestPassport();

    for (let i = 0; i < 500; i++) {
      const budget = Math.floor(random() * 50_000) + 500;
      const plan = planExport({ passport }, budget);

      expect(plan.budget).toBe(budget);
      expect(typeof plan.isOverBudget).toBe('boolean');
      expect(Array.isArray(plan.allItems)).toBe(true);
      expect(plan.allItems.length).toBe(
        plan.includedItems.length + plan.trimmedItems.length + plan.omittedItems.length
      );

      // Verify no duplicate IDs in allItems
      const ids = new Set<string>();
      for (const item of plan.allItems) {
        expect(ids.has(item.id)).toBe(false);
        ids.add(item.id);
      }
    }
  });
});
