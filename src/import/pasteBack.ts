import {
  extractJson,
  type ExtractionRepair,
} from './jsonExtractor';
import {
  normalizeImportedPassport,
  type ImportedSections,
  type MergeSectionId,
} from '../domain/passportImport';
import { createEmptyPassport, computeReadiness } from '../domain';

export type PasteBackResult =
  | {
      status: 'ok';
      sections: ImportedSections;
      presentSections: MergeSectionId[];
      repairs: ExtractionRepair[];
      ignored: string[];
      notes: string[];
      incomingReadiness: number;
    }
  | {
      status: 'error';
      title: string;
      message: string;
      nextStep: string;
      details?: string[];
    };

const KNOWN_SECTIONS = new Set([
  'basics',
  'project',
  'stack',
  'requirements',
  'decisions',
  'completed',
  'tasks',
  'bugs',
  'bugsReviewed',
  'instructions',
  'nextAction',
  'openQuestions',
]);

/**
 * Validates, unwraps, normalizes, and scores an AI paste-back response.
 * Pure function with plain-language error reporting.
 */
export function processPasteBack(
  text: string,
  idFactory?: () => string
): PasteBackResult {
  const extracted = extractJson(text);

  if (!extracted.ok) {
    let title = 'Check failed';
    let nextStep = 'Review the text in the box and try again.';

    if (extracted.code === 'empty') {
      title = 'Empty reply';
      nextStep = 'Paste the AI’s reply into the box and choose Check reply.';
    } else if (extracted.code === 'too_large') {
      title = 'Text too large';
      nextStep = 'Paste only the AI’s JSON response.';
    } else if (extracted.code === 'no_json_found') {
      title = 'No JSON found';
      nextStep = 'Copy the capture prompt and ask the AI to reply using the prompt exactly.';
    } else if (extracted.code === 'truncated') {
      title = 'Incomplete JSON';
      nextStep = 'Ask the AI to send the complete reply again.';
    } else if (extracted.code === 'not_an_object') {
      title = 'Unexpected format';
      nextStep = 'Ask the AI to wrap the passport in a single JSON object.';
    } else if (extracted.code === 'invalid_json') {
      title = 'Invalid JSON';
      nextStep = 'Fix the typo in the box or ask the AI to resend it.';
    }

    return {
      status: 'error',
      title,
      message: extracted.message,
      nextStep,
      details: extracted.excerpt ? [extracted.excerpt] : undefined,
    };
  }

  // One-level unwrap of {"passport": {...}}
  let raw = extracted.value;
  if (
    raw !== null &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    'passport' in raw &&
    typeof (raw as Record<string, unknown>).passport === 'object' &&
    (raw as Record<string, unknown>).passport !== null &&
    !Array.isArray((raw as Record<string, unknown>).passport)
  ) {
    raw = (raw as Record<string, unknown>).passport;
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      status: 'error',
      title: 'Unexpected format',
      message: 'The reply is a list, but we need one object describing the project.',
      nextStep: 'Ask the AI to provide a single JSON object.',
    };
  }

  const rawObj = raw as Record<string, unknown>;

  // Check schemaVersion
  if ('schemaVersion' in rawObj && rawObj.schemaVersion !== null && rawObj.schemaVersion !== undefined) {
    if (rawObj.schemaVersion !== 1) {
      return {
        status: 'error',
        title: 'Unsupported version',
        message: `This reply uses passport version ${rawObj.schemaVersion}. This app reads version 1.`,
        nextStep: 'Ask the AI to use passport schema version 1.',
      };
    }
  }

  // Reject JSON with none of the known sections, and list only key names
  const rawKeys = Object.keys(rawObj).filter(
    (k) => k !== 'schemaVersion' && k !== 'files' && k !== 'conversations' && k !== 'createdAt' && k !== 'updatedAt' && k !== 'id'
  );
  const hasKnownSection = rawKeys.some((k) => KNOWN_SECTIONS.has(k));
  if (!hasKnownSection) {
    const keysList = rawKeys.length > 0 ? rawKeys.join(', ') : 'none';
    return {
      status: 'error',
      title: 'Unknown shape',
      message: `This doesn’t look like a project passport. It contains: ${keysList}.`,
      nextStep: 'Ask the AI to reply using the capture prompt skeleton.',
    };
  }

  // Normalize
  const normalized = normalizeImportedPassport(rawObj, idFactory);

  if (normalized.issues.length > 0) {
    let details: string[];
    if (normalized.issues.length > 8) {
      details = [
        ...normalized.issues.slice(0, 8),
        `and ${normalized.issues.length - 8} more`,
      ];
    } else {
      details = normalized.issues;
    }

    return {
      status: 'error',
      title: 'Validation problem',
      message: details[0] || 'Some fields in the passport are invalid.',
      nextStep: 'Fix the items in the box or ask the AI to correct them.',
      details,
    };
  }

  // Compute incoming readiness score over default passport
  const defaultPassport = createEmptyPassport();
  if (normalized.sections.basics) {
    if (normalized.sections.basics.name) defaultPassport.project.name = normalized.sections.basics.name;
    if (normalized.sections.basics.goal) defaultPassport.project.goal = normalized.sections.basics.goal;
    if (normalized.sections.basics.summary) defaultPassport.project.summary = normalized.sections.basics.summary;
    if (normalized.sections.basics.status) defaultPassport.project.status = normalized.sections.basics.status;
  }
  if (normalized.sections.stack) {
    defaultPassport.stack = normalized.sections.stack;
  }
  if (normalized.sections.requirements) {
    defaultPassport.requirements = normalized.sections.requirements;
  }
  if (normalized.sections.decisions) {
    defaultPassport.decisions = normalized.sections.decisions;
  }
  if (normalized.sections.completed) {
    defaultPassport.completed = normalized.sections.completed;
  }
  if (normalized.sections.tasks) {
    defaultPassport.tasks = normalized.sections.tasks;
  }
  if (normalized.sections.bugs) {
    defaultPassport.bugs = normalized.sections.bugs.items;
    defaultPassport.bugsReviewed = normalized.sections.bugs.bugsReviewed;
  } else if (normalized.sections.bugsReviewed !== undefined) {
    defaultPassport.bugsReviewed = normalized.sections.bugsReviewed;
  }
  if (normalized.sections.instructions) {
    defaultPassport.instructions = normalized.sections.instructions;
  }
  if (normalized.sections.nextAction !== undefined) {
    defaultPassport.nextAction = normalized.sections.nextAction;
  }
  if (normalized.sections.openQuestions) {
    defaultPassport.openQuestions = normalized.sections.openQuestions;
  }

  const incomingReadiness = computeReadiness(defaultPassport).score;

  return {
    status: 'ok',
    sections: normalized.sections,
    presentSections: normalized.presentSections,
    repairs: extracted.repairs,
    ignored: normalized.ignoredKeys,
    notes: normalized.notes,
    incomingReadiness,
  };
}
