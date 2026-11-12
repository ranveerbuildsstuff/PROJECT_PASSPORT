import { describe, it, expect } from 'vitest';
import {
  describeStorageError,
  ProjectNotFound,
  ValidationFailed,
  StorageUnavailable,
  QuotaExceeded,
  BackupInvalid,
  StaleWrite,
} from '../errors';

describe('describeStorageError', () => {
  it('maps ProjectNotFound to plain language without internal IDs', () => {
    const err = new ProjectNotFound('proj-secret-1234');
    const msg = describeStorageError(err);
    expect(msg).toBe('This project was not found. It may have been deleted. Go back to your projects and try again.');
    expect(msg).not.toContain('proj-secret-1234');
  });

  it('maps ValidationFailed to plain language without technical stack', () => {
    const err = new ValidationFailed('Validation error', ['Task 1 needs some text']);
    const msg = describeStorageError(err);
    expect(msg).toBe('Validation failed: Task 1 needs some text');
  });

  it('maps StorageUnavailable to plain language', () => {
    const err = new StorageUnavailable();
    const msg = describeStorageError(err);
    expect(msg).toContain('Local storage is unavailable or blocked');
  });

  it('maps QuotaExceeded to plain language', () => {
    const err = new QuotaExceeded();
    const msg = describeStorageError(err);
    expect(msg).toContain('quota has been exceeded');
  });

  it('maps BackupInvalid to plain language', () => {
    const err = new BackupInvalid();
    const msg = describeStorageError(err);
    expect(msg).toBe('The backup file is invalid or cannot be read.');
  });

  it('maps StaleWrite to plain language without technical internals', () => {
    const err = new StaleWrite();
    const msg = describeStorageError(err);
    expect(msg).toBe('This passport was modified in another tab or window. Please reload to see the latest version.');
    expect(err.nextStep).toBe('Please reload the latest version or review the changes before saving.');
  });

  it('maps unknown errors to generic plain language without stack traces', () => {
    const err = new Error('Raw technical DB stack: internal failure at row 42');
    const msg = describeStorageError(err);
    expect(msg).toBe('An unexpected storage error occurred. Your changes could not be saved.');
    expect(msg).not.toContain('row 42');
  });

  it('maps unexpected errors to plain text containing neither secret sentinels nor UUIDs', () => {
    const err = new Error('secret-sentinel 123e4567-e89b-12d3-a456-426614174000');
    const msg = describeStorageError(err);
    expect(msg).toBe('An unexpected storage error occurred. Your changes could not be saved.');
    expect(msg).not.toContain('secret-sentinel');
    expect(msg).not.toContain('123e4567-e89b-12d3-a456-426614174000');
  });
});
