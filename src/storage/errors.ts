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

