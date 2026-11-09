import { describe, it, expect } from 'vitest';
import { computeReadiness } from '../readiness';
import { createEmptyPassport, PassportV1 } from '../passport.schema';
import ecommerceFixture from '../../../tests/fixtures/ecommerce-passport.json';

describe('Readiness Scoring Engine', () => {
  it('computes 0% score for a completely empty passport', () => {
    const empty = createEmptyPassport();
    const result = computeReadiness(empty);

    expect(result.score).toBe(0);
    expect(result.passedCount).toBe(0);
    expect(result.totalChecks).toBe(7);
    expect(result.checks.every((c) => !c.passed)).toBe(true);
  });

  it('computes 100% score for the complete synthetic e-commerce fixture', () => {
    const result = computeReadiness(ecommerceFixture as PassportV1);

    expect(result.score).toBe(100);
    expect(result.passedCount).toBe(7);
    expect(result.totalChecks).toBe(7);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('evaluates check 1 (objective) independently', () => {
    const p = createEmptyPassport();
    p.project.goal = 'Build a project';
    const result = computeReadiness(p);

    expect(result.checks.find((c) => c.id === 'objective')?.passed).toBe(true);
    expect(result.passedCount).toBe(1);
    expect(result.score).toBe(Math.round((1 / 7) * 100)); // 14
  });

  it('evaluates check 2 (stack) independently', () => {
    const p = createEmptyPassport();
    p.stack.push({ name: 'React' });
    const result = computeReadiness(p);

    expect(result.checks.find((c) => c.id === 'stack')?.passed).toBe(true);
    expect(result.passedCount).toBe(1);
  });

  it('evaluates check 3 (decisions) requiring at least one active decision', () => {
    const p = createEmptyPassport();
    p.decisions.push({
      id: 'd1',
      decision: 'Old choice',
      reason: 'Outdated',
      status: 'superseded',
    });
    let result = computeReadiness(p);
    expect(result.checks.find((c) => c.id === 'decisions')?.passed).toBe(false);

    p.decisions.push({
      id: 'd2',
      decision: 'Current choice',
      reason: 'Better fit',
      status: 'active',
    });
    result = computeReadiness(p);
    expect(result.checks.find((c) => c.id === 'decisions')?.passed).toBe(true);
  });

  it('evaluates check 4 (context) via file or conversation', () => {
    const p1 = createEmptyPassport();
    p1.files.push({ path: 'src/index.ts', purpose: 'entry', included: true, sizeBytes: 100 });
    expect(computeReadiness(p1).checks.find((c) => c.id === 'context')?.passed).toBe(true);

    const p2 = createEmptyPassport();
    p2.conversations.push({
      id: 'c1',
      title: 'Design chat',
      source: 'claude',
      messageCount: 5,
      tokenEstimate: 1200,
      included: true,
    });
    expect(computeReadiness(p2).checks.find((c) => c.id === 'context')?.passed).toBe(true);
  });

  it('evaluates check 5 (tasks) requiring a pending task', () => {
    const p = createEmptyPassport();
    p.tasks.push({ id: 't1', text: 'All done', status: 'done', priority: 'low' });
    let result = computeReadiness(p);
    expect(result.checks.find((c) => c.id === 'tasks')?.passed).toBe(false);

    p.tasks.push({ id: 't2', text: 'Work in progress', status: 'doing', priority: 'high' });
    result = computeReadiness(p);
    expect(result.checks.find((c) => c.id === 'tasks')?.passed).toBe(true);
  });

  it('evaluates check 6 (bugs) based strictly on bugs presence or bugsReviewed flag', () => {
    const p = createEmptyPassport();
    p.bugs = [];
    p.bugsReviewed = false;
    expect(computeReadiness(p).checks.find((c) => c.id === 'bugs')?.passed).toBe(false);

    p.bugsReviewed = true;
    expect(computeReadiness(p).checks.find((c) => c.id === 'bugs')?.passed).toBe(true);

    p.bugsReviewed = false;
    p.bugs.push({ id: 'b1', text: 'Bug 1', severity: 'low', status: 'open' });
    expect(computeReadiness(p).checks.find((c) => c.id === 'bugs')?.passed).toBe(true);

    const pWithInstruction = createEmptyPassport();
    pWithInstruction.bugs = [];
    pWithInstruction.bugsReviewed = false;
    pWithInstruction.instructions.push('There are no bugs and no known bugs in this system');
    expect(computeReadiness(pWithInstruction).checks.find((c) => c.id === 'bugs')?.passed).toBe(false);
  });

  it('evaluates check 7 (nextAction) independently', () => {
    const p = createEmptyPassport();
    p.nextAction = 'Start slice 2';
    const result = computeReadiness(p);

    expect(result.checks.find((c) => c.id === 'nextAction')?.passed).toBe(true);
    expect(result.passedCount).toBe(1);
  });
});
