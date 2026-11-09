import type { PassportV1 } from './passport.schema';

export interface ReadinessCheck {
  id: 'objective' | 'stack' | 'decisions' | 'context' | 'tasks' | 'bugs' | 'nextAction';
  label: string;
  passed: boolean;
  description: string;
}

export interface ReadinessResult {
  score: number;
  passedCount: number;
  totalChecks: 7;
  checks: ReadinessCheck[];
}

export interface ReadinessOptions {
  explicitNoBugs?: boolean;
}

/**
 * Computes readiness score (0–100) based on 7 equal checks:
 * 1. objective: project.goal non-empty
 * 2. stack recorded: stack.length > 0
 * 3. active decision: at least one decision with status 'active'
 * 4. context attached: at least one file or conversation attached
 * 5. pending task: at least one task with status 'todo' | 'doing' | 'blocked'
 * 6. bugs/limitations recorded: bugs.length > 0 or explicitly marked none
 * 7. nextAction set: nextAction non-empty
 */
export function computeReadiness(
  passport: PassportV1,
  options?: ReadinessOptions,
): ReadinessResult {
  const objectivePassed = Boolean(passport.project.goal && passport.project.goal.trim().length > 0);
  const stackPassed = passport.stack.length > 0;
  const decisionsPassed = passport.decisions.some((d) => d.status === 'active');
  const contextPassed = passport.files.length > 0 || passport.conversations.length > 0;
  const tasksPassed = passport.tasks.some(
    (t) => t.status === 'todo' || t.status === 'doing' || t.status === 'blocked',
  );
  const bugsPassed =
    passport.bugs.length > 0 ||
    Boolean(options?.explicitNoBugs) ||
    passport.instructions.some(
      (i) => i.toLowerCase().includes('no bugs') || i.toLowerCase().includes('no known bugs'),
    );
  const nextActionPassed = Boolean(passport.nextAction && passport.nextAction.trim().length > 0);

  const checks: ReadinessCheck[] = [
    {
      id: 'objective',
      label: 'Objective defined',
      passed: objectivePassed,
      description: 'Project goal is specified and non-empty.',
    },
    {
      id: 'stack',
      label: 'Stack recorded',
      passed: stackPassed,
      description: 'At least one tech stack component is recorded.',
    },
    {
      id: 'decisions',
      label: 'Active decisions',
      passed: decisionsPassed,
      description: 'At least one active architecture or project decision is documented.',
    },
    {
      id: 'context',
      label: 'Context attached',
      passed: contextPassed,
      description: 'At least one project file or conversation is attached.',
    },
    {
      id: 'tasks',
      label: 'Pending tasks',
      passed: tasksPassed,
      description: 'At least one pending task (todo, doing, or blocked) is listed.',
    },
    {
      id: 'bugs',
      label: 'Bugs or limitations noted',
      passed: bugsPassed,
      description: 'Bugs or known limitations are recorded (or explicitly marked none).',
    },
    {
      id: 'nextAction',
      label: 'Next action defined',
      passed: nextActionPassed,
      description: 'Immediate next action is clearly identified.',
    },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / 7) * 100);

  return {
    score,
    passedCount,
    totalChecks: 7,
    checks,
  };
}
