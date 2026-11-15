export class StorageUnavailable extends Error {
  readonly nextStep: string;

  constructor(
    message = 'Local storage is unavailable or blocked in your browser.',
    nextStep = 'Please enable local storage or disable private/incognito mode to use Project Passport.'
  ) {
    super(message);
    this.name = 'StorageUnavailable';
    this.nextStep = nextStep;
  }
}

export class ValidationFailed extends Error {
  readonly errors: string[];
  readonly nextStep: string;

  constructor(
    message = 'The passport data is invalid.',
    errors: string[] = [],
    nextStep = 'Please review the highlighted validation errors and update the invalid fields before saving.'
  ) {
    super(message);
    this.name = 'ValidationFailed';
    this.errors = errors;
    this.nextStep = nextStep;
  }
}

export class QuotaExceeded extends Error {
  readonly nextStep: string;

  constructor(
    message = 'Local storage quota has been exceeded.',
    nextStep = 'Please free up disk space or export and delete older projects to continue.'
  ) {
    super(message);
    this.name = 'QuotaExceeded';
    this.nextStep = nextStep;
  }
}

export class BackupInvalid extends Error {
  readonly nextStep: string;

  constructor(
    message = 'The backup file is invalid or cannot be read.',
    nextStep = 'Please select a valid Project Passport backup JSON file.'
  ) {
    super(message);
    this.name = 'BackupInvalid';
    this.nextStep = nextStep;
  }
}

export class StaleWrite extends Error {
  readonly nextStep: string;

  constructor(
    message = 'This passport was changed somewhere else since you opened it.',
    nextStep = 'Please reload the latest version or review the changes before saving.'
  ) {
    super(message);
    this.name = 'StaleWrite';
    this.nextStep = nextStep;
  }
}

export class ProjectNotFound extends Error {
  readonly nextStep: string;

  constructor(
    projectIdOrMessage?: string,
    nextStep = 'Go back to your projects and try again.'
  ) {
    let message = 'The requested project was not found. It may have been deleted.';
    if (projectIdOrMessage) {
      message = projectIdOrMessage.includes(' ')
        ? projectIdOrMessage
        : `Project "${projectIdOrMessage}" was not found. It may have been deleted.`;
    }
    super(message);
    this.name = 'ProjectNotFound';
    this.nextStep = nextStep;
  }
}

export class ConversationNotFound extends Error {
  readonly nextStep: string;

  constructor(
    message = 'The requested conversation was not found. It may have been deleted.',
    nextStep = 'Go back to your conversations and try again.'
  ) {
    super(message);
    this.name = 'ConversationNotFound';
    this.nextStep = nextStep;
  }
}

/**
 * Maps any storage error to human-readable plain language with no raw IDs or stack traces.
 */
export function describeStorageError(err: unknown): string {
  if (err instanceof ProjectNotFound) {
    return 'This project was not found. It may have been deleted. Go back to your projects and try again.';
  }

  if (err instanceof ConversationNotFound) {
    return 'This conversation was not found. It may have been deleted.';
  }

  if (err instanceof ValidationFailed) {
    if (err.errors && err.errors.length > 0) {
      return `Validation failed: ${err.errors[0]}`;
    }
    return 'The passport data contains validation errors. Please review and update before saving.';
  }

  if (err instanceof StorageUnavailable) {
    return 'Local storage is unavailable or blocked in your browser. Please check your browser settings.';
  }

  if (err instanceof QuotaExceeded || (err instanceof Error && /quota/i.test(err.message))) {
    return 'Local storage quota has been exceeded. Please free up space or remove older projects.';
  }

  if (err instanceof BackupInvalid) {
    return 'The backup file is invalid or cannot be read.';
  }

  if (err instanceof StaleWrite) {
    return 'This passport was modified in another tab or window. Please reload to see the latest version.';
  }

  // Unknown or generic errors - never expose stack traces or raw technical internals
  return 'An unexpected storage error occurred. Your changes could not be saved.';
}

