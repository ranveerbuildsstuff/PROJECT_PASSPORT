import { validatePassport, type PassportV1 } from './passport.schema';

export interface MigrationResult {
  success: boolean;
  passport?: PassportV1;
  errors: string[];
}

/**
 * Validates and migrates passport data to the current schema version (v1).
 * Forward-compatible architecture: as schema versions increase, version-to-version
 * upgrade functions will be chained here.
 *
 * For unknown or future schema versions, returns a clean error without crashing.
 */
export function migratePassport(data: unknown): MigrationResult {
  if (data === null || typeof data !== 'object') {
    return {
      success: false,
      errors: ['Input data is not a valid object'],
    };
  }

  const record = data as Record<string, unknown>;

  if (!('schemaVersion' in record)) {
    return {
      success: false,
      errors: ['Passport is missing a schemaVersion property'],
    };
  }

  const version = record.schemaVersion;

  if (typeof version !== 'number') {
    return {
      success: false,
      errors: ['Passport schemaVersion must be a number'],
    };
  }

  if (version === 1) {
    const validation = validatePassport(data);
    if (validation.success && validation.data) {
      return {
        success: true,
        passport: validation.data,
        errors: [],
      };
    }
    return {
      success: false,
      errors: validation.errors,
    };
  }

  return {
    success: false,
    errors: [
      `Unsupported schema version ${version}. This version of Project Passport supports schemaVersion 1.`,
    ],
  };
}
