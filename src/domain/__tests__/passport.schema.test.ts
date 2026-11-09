import { describe, it, expect } from 'vitest';
import {
  PassportSchemaV1,
  createEmptyPassport,
  validatePassport,
} from '../passport.schema';
import ecommerceFixture from '../../../tests/fixtures/ecommerce-passport.json';

describe('Passport Schema v1 & Validation', () => {
  it('validates a complete synthetic fixture successfully', () => {
    const parsed = PassportSchemaV1.safeParse(ecommerceFixture);
    expect(parsed.success).toBe(true);

    const validation = validatePassport(ecommerceFixture);
    expect(validation.success).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.data?.project.name).toBe('Aura Commerce Storefront');
  });

  it('createEmptyPassport generates a valid schema v1 object', () => {
    const empty = createEmptyPassport('New Project');
    expect(empty.schemaVersion).toBe(1);
    expect(empty.project.name).toBe('New Project');
    expect(empty.project.id).toBeDefined();
    expect(empty.project.createdAt).toBeDefined();
    expect(empty.project.status).toBe('in_progress');

    const validation = validatePassport(empty);
    expect(validation.success).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('generates distinct IDs on multiple createEmptyPassport calls', () => {
    const p1 = createEmptyPassport();
    const p2 = createEmptyPassport();
    expect(p1.project.id).not.toBe(p2.project.id);
  });

  it('rejects null and non-object inputs with plain language message', () => {
    const resNull = validatePassport(null);
    expect(resNull.success).toBe(false);
    expect(resNull.errors[0]).toBe('Input must be a valid passport object');

    const resString = validatePassport('hello');
    expect(resString.success).toBe(false);
    expect(resString.errors[0]).toBe('Input must be a valid passport object');
  });

  it('formats invalid task into plain-language error "Task 3 needs some text"', () => {
    const invalidData = {
      ...createEmptyPassport(),
      tasks: [
        { id: '1', text: 'Task 1', status: 'todo', priority: 'high' },
        { id: '2', text: 'Task 2', status: 'done', priority: 'low' },
        { id: '3', text: '', status: 'todo', priority: 'medium' },
      ],
    };

    const res = validatePassport(invalidData);
    expect(res.success).toBe(false);
    expect(res.errors).toContain('Task 3 needs some text');
  });

  it('formats invalid bug into plain-language error "Bug 2 needs a description"', () => {
    const invalidData = {
      ...createEmptyPassport(),
      bugs: [
        { id: '1', text: 'Bug 1', severity: 'low', status: 'open' },
        { id: '2', text: '', severity: 'high', status: 'open' },
      ],
    };

    const res = validatePassport(invalidData);
    expect(res.success).toBe(false);
    expect(res.errors).toContain('Bug 2 needs a description');
  });

  it('returns multiple plain-language errors simultaneously', () => {
    const invalidData = {
      ...createEmptyPassport(),
      project: {
        ...createEmptyPassport().project,
        name: '',
      },
      tasks: [
        { id: '1', text: '', status: 'invalid-status', priority: 'low' },
      ],
      bugs: [
        { id: '1', text: '', severity: 'low', status: 'open' },
      ],
      decisions: [
        { id: '1', decision: '', reason: '', status: 'active' },
      ],
      stack: [
        { name: '' },
      ],
    };

    const res = validatePassport(invalidData);
    expect(res.success).toBe(false);
    expect(res.errors).toContain('Project name cannot be empty');
    expect(res.errors).toContain('Task 1 needs some text');
    expect(res.errors).toContain('Task 1 has an invalid status');
    expect(res.errors).toContain('Bug 1 needs a description');
    expect(res.errors).toContain('Decision 1 needs a description');
    expect(res.errors).toContain('Decision 1 needs a reason');
    expect(res.errors).toContain('Stack item 1 needs a name');
  });
});
