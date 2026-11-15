import { describe, it, expect } from 'vitest';
import { generateContinuePrompt } from '../../src/export/continuePrompt';
import { planExport } from '../../src/export/budgeter';
import type { PassportV1 } from '../../src/domain/passport.schema';

describe('continuePrompt generator', () => {
  const mockPassport: PassportV1 = {
    schemaVersion: 1,
    project: {
      id: 'p-1',
      name: 'Alpha Handoff',
      goal: 'Autonomous handoff protocol',
      summary: 'Ensure zero-context-loss agent handoffs',
      status: 'in_progress',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    stack: [{ name: 'React', role: 'UI' }, { name: 'Dexie', role: 'Storage' }],
    requirements: [{ id: 'r1', text: 'All operations local', priority: 'must' }],
    decisions: [{ id: 'd1', decision: 'Use IndexedDB', reason: 'Zero telemetry', status: 'active' }],
    completed: [{ id: 'c1', text: 'Spec complete' }],
    tasks: [{ id: 't1', text: 'Implement export worker', status: 'todo', priority: 'high' }],
    bugs: [{ id: 'b1', text: 'Occasional memory spike', severity: 'low', status: 'open' }],
    bugsReviewed: true,
    instructions: ['Do not use external CDNs'],
    files: [{ path: 'src/main.ts', purpose: 'App entry', included: true, sizeBytes: 25 }],
    conversations: [],
    nextAction: 'Ship export tab UI',
    openQuestions: ['When to add cloud sync?'],
  };

  it('includes all 5 mandatory confirmation points and the pause-and-ask instruction', () => {
    const plan = planExport({ passport: mockPassport }, 30_000);
    const prompt = generateContinuePrompt(plan, 'lite');

    // 1. Project objective and scope
    expect(prompt).toContain('Project objective and scope');
    // 2. Active tech stack
    expect(prompt).toContain('Active tech stack and architecture');
    // 3. Key architectural and implementation decisions
    expect(prompt).toContain('Key architectural and implementation decisions');
    // 4. Current status, open questions, and active bugs
    expect(prompt).toContain('Current status, open questions, and active bugs');
    // 5. Next planned task
    expect(prompt).toContain('The immediate next planned task');

    // Pause instruction
    expect(prompt).toContain('Explicitly pause and ask about any ambiguities');
    expect(prompt).toContain('Ship export tab UI');
  });

  it('generates full bundle prompt with references to zip artifacts', () => {
    const plan = planExport({ passport: mockPassport }, 60_000);
    const prompt = generateContinuePrompt(plan, 'full');

    expect(prompt).toContain('project-passport.json');
    expect(prompt).toContain('PROJECT_STATE.md');
    expect(prompt).toContain('MANIFEST.json');
    expect(prompt).toContain('files/');
    expect(prompt).toContain('conversations/');
    expect(prompt).toContain('Explicitly pause and ask about any ambiguities');
  });

  it('is completely deterministic for identical plans', () => {
    const plan1 = planExport({ passport: mockPassport }, 30_000);
    const plan2 = planExport({ passport: mockPassport }, 30_000);

    const prompt1 = generateContinuePrompt(plan1, 'lite');
    const prompt2 = generateContinuePrompt(plan2, 'lite');

    expect(prompt1).toBe(prompt2);
  });
});
