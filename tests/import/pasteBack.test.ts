import { describe, it, expect } from 'vitest';
import { processPasteBack } from '../../src/import/pasteBack';
import { assertCleanErrorString } from '../domain/passportImport.test';

describe('processPasteBack', () => {
  it('successfully processes a valid markdown fenced response', () => {
    const text = `
Here is your passport:
\`\`\`json
{
  "project": {
    "name": "E-Commerce App",
    "goal": "Build modern online store",
    "summary": "Alpha stage with auth",
    "status": "in_progress"
  },
  "stack": [
    { "name": "Next.js", "version": "14" }
  ],
  "requirements": [
    { "text": "Stripe checkout", "priority": "must" }
  ],
  "decisions": [
    { "decision": "Use Tailwind", "reason": "Speed", "status": "active" }
  ],
  "tasks": [
    { "text": "Set up webhook", "status": "todo", "priority": "high" }
  ],
  "bugs": [
    { "text": "Cart reset on refresh", "severity": "high", "status": "open" }
  ],
  "bugsReviewed": false,
  "instructions": [
    "Follow functional React patterns"
  ],
  "nextAction": "Implement stripe webhook handler",
  "openQuestions": [
    "Should we support Apple Pay?"
  ]
}
\`\`\`
`;
    const res = processPasteBack(text);
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.sections.basics?.name).toBe('E-Commerce App');
      expect(res.sections.stack).toHaveLength(1);
      expect(res.sections.requirements).toHaveLength(1);
      expect(res.sections.decisions).toHaveLength(1);
      expect(res.sections.tasks).toHaveLength(1);
      expect(res.sections.bugs?.items).toHaveLength(1);
      expect(res.sections.bugsReviewed).toBe(false);
      expect(res.sections.instructions).toEqual(['Follow functional React patterns']);
      expect(res.sections.nextAction).toBe('Implement stripe webhook handler');
      expect(res.sections.openQuestions).toEqual(['Should we support Apple Pay?']);
      expect(res.presentSections).toContain('basics');
      expect(res.presentSections).toContain('stack');
      expect(res.presentSections).toContain('tasks');
      expect(res.presentSections).toContain('bugs');
      expect(res.incomingReadiness).toBeGreaterThan(0);
      expect(res.incomingReadiness).toBeLessThanOrEqual(100);
    }
  });

  it('rejects JSON with none of the known sections and lists only key names', () => {
    const text = '```json\n{"weather": "sunny", "temperature": 72, "city": "Seattle"}\n```';
    const res = processPasteBack(text);

    expect(res.status).toBe('error');
    if (res.status === 'error') {
      expect(res.title).toBe('Unknown shape');
      expect(res.message).toBe('This doesn’t look like a project passport. It contains: weather, temperature, city.');
      assertCleanErrorString(res.message);
    }
  });

  it('rejects unsupported schemaVersion with exact copy', () => {
    const text = '```json\n{"schemaVersion": 3, "project": {"name": "Future App"}}\n```';
    const res = processPasteBack(text);

    expect(res.status).toBe('error');
    if (res.status === 'error') {
      expect(res.title).toBe('Unsupported version');
      expect(res.message).toBe('This reply uses passport version 3. This app reads version 1.');
      assertCleanErrorString(res.message);
    }
  });

  it('caps validation details at 8 items then "and N more"', () => {
    // Generate 12 tasks with invalid status to produce 12 validation errors
    const text = JSON.stringify({
      project: { name: 'App' },
      tasks: Array.from({ length: 12 }, (_, i) => ({
        id: `task-${i}`,
        text: `Task description ${i + 1}`,
        status: 'invalid_status',
        priority: 'high',
      })),
    });

    const res = processPasteBack(text);
    expect(res.status).toBe('error');
    if (res.status === 'error') {
      expect(res.title).toBe('Validation problem');
      expect(res.details).toBeDefined();
      if (res.details) {
        expect(res.details.length).toBe(9); // 8 items + "and 4 more"
        expect(res.details[8]).toBe('and 4 more');
        for (const detail of res.details) {
          assertCleanErrorString(detail);
        }
      }
    }
  });

  it('handles empty input gracefully with exact copy', () => {
    const res = processPasteBack('   ');
    expect(res.status).toBe('error');
    if (res.status === 'error') {
      expect(res.message).toBe(
        'Nothing to check yet. Paste the AI’s reply into the box above, then choose Check reply.'
      );
      assertCleanErrorString(res.message);
    }
  });

  it('calculates incoming readiness as the reply’s own score', () => {
    // Bare minimum: name and goal only
    const text = JSON.stringify({
      project: { name: 'Simple App', goal: 'Basic goal' },
    });
    const res = processPasteBack(text);
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      // 1 of 7 checks passed (goal is non-empty) -> Math.round((1/7)*100) = 14
      expect(res.incomingReadiness).toBe(14);
    }
  });
});
