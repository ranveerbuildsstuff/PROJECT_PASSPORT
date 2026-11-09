import { describe, it, expect } from 'vitest';
import { migratePassport } from '../migrate';
import { createEmptyPassport } from '../passport.schema';
import ecommerceFixture from '../../../tests/fixtures/ecommerce-passport.json';

describe('Passport Migration Engine', () => {
  it('successfully migrates valid v1 data', () => {
    const res = migratePassport(ecommerceFixture);
    expect(res.success).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.passport?.project.name).toBe('Aura Commerce Storefront');
  });

  it('successfully migrates empty passport v1', () => {
    const empty = createEmptyPassport('Migration Test');
    const res = migratePassport(empty);
    expect(res.success).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.passport?.project.name).toBe('Migration Test');
  });

  it('rejects unknown schema version with clear error and does not crash', () => {
    const futureData = {
      ...ecommerceFixture,
      schemaVersion: 2,
    };

    const res = migratePassport(futureData);
    expect(res.success).toBe(false);
    expect(res.passport).toBeUndefined();
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain('Unsupported schema version 2');
  });

  it('rejects missing schemaVersion property with clear error', () => {
    const noVersion = {
      project: { name: 'No version' },
    };

    const res = migratePassport(noVersion);
    expect(res.success).toBe(false);
    expect(res.errors[0]).toBe('Passport is missing a schemaVersion property');
  });

  it('rejects non-numeric schemaVersion property', () => {
    const badVersion = {
      schemaVersion: 'v1',
    };

    const res = migratePassport(badVersion);
    expect(res.success).toBe(false);
    expect(res.errors[0]).toBe('Passport schemaVersion must be a number');
  });

  it('rejects null or non-object input cleanly', () => {
    const resNull = migratePassport(null);
    expect(resNull.success).toBe(false);
    expect(resNull.errors[0]).toBe('Input data is not a valid object');
  });

  it('returns validation errors when v1 schema requirements are violated', () => {
    const invalidV1 = {
      schemaVersion: 1,
      project: {
        name: '',
      },
    };

    const res = migratePassport(invalidV1);
    expect(res.success).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
