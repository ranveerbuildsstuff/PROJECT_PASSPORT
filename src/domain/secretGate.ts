/**
 * Pure, deterministic secret gate evaluation across project files, conversations, and passport text.
 *
 * Invariants:
 * - Scans included files, included conversations, and passport fields.
 * - Files with acknowledged findings (marked False Positive in Slice 8) are permitted.
 * - Only MASKED values are returned. Raw secret strings are NEVER exposed or logged.
 * - Pure function, deterministic, zero logging.
 */

import type { PassportV1 } from './passport.schema';
import type { FileRecord, ConversationRecord } from '../storage/db';
import type { ConversationTurn } from './conversation';
import { scanText, findingKey } from './secretScanner';

export type SecretGateSourceType = 'file' | 'conversation' | 'passport';

export interface SecretGateFinding {
  sourceType: SecretGateSourceType;
  location: string;
  line?: number;
  ruleId: string;
  ruleName: string;
  maskedValue: string;
  findingKey: string;
}

export interface SecretGateResult {
  isBlocked: boolean;
  unresolvedFindings: SecretGateFinding[];
  summary: string;
}

export interface SecretGateInput {
  passport: PassportV1;
  files?: FileRecord[];
  conversations?: Array<{
    record: ConversationRecord;
    turns?: ConversationTurn[];
  }>;
}

/**
 * Evaluates whether export should be blocked by scanning project files, conversations, and passport text.
 */
export function evaluateSecretGate(input: SecretGateInput): SecretGateResult {
  const { passport, files = [], conversations = [] } = input;
  const unresolved: SecretGateFinding[] = [];

  // 1. Scan Included Files
  const fileManifestMap = new Map<string, boolean>();
  for (const f of passport.files || []) {
    fileManifestMap.set(f.path, f.included);
  }

  for (const file of files) {
    // Only scan files that are currently included in the manifest
    const isIncluded = fileManifestMap.get(file.path) ?? true;
    if (!isIncluded) continue;

    const contentStr = typeof file.content === 'string' ? file.content : new TextDecoder().decode(file.content);
    const rawFindings = scanText(contentStr, file.path);
    const ackSet = new Set(file.acknowledgedFindings || []);

    for (const rf of rawFindings) {
      const key = findingKey(rf);
      if (!ackSet.has(key)) {
        unresolved.push({
          sourceType: 'file',
          location: file.path,
          line: rf.line,
          ruleId: rf.category,
          ruleName: rf.category,
          maskedValue: rf.masked,
          findingKey: key,
        });
      }
    }
  }

  // 2. Scan Included Conversations
  const convManifestMap = new Map<string, boolean>();
  for (const c of passport.conversations || []) {
    convManifestMap.set(c.id, c.included);
  }

  for (const conv of conversations) {
    const isIncluded = convManifestMap.get(conv.record.id) ?? true;
    if (!isIncluded) continue;

    const convTitle = conv.record.title || 'Untitled';

    // Scan title
    const titleFindings = scanText(conv.record.title || '', convTitle);
    for (const tf of titleFindings) {
      unresolved.push({
        sourceType: 'conversation',
        location: `Conversation: "${convTitle}" (Title)`,
        line: tf.line,
        ruleId: tf.category,
        ruleName: tf.category,
        maskedValue: tf.masked,
        findingKey: findingKey(tf),
      });
    }

    // Scan turns
    const turns = conv.turns || [];
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i]!;
      const turnLocation = `Conversation: "${convTitle}" (Turn ${i + 1}, ${turn.role})`;
      const turnFindings = scanText(turn.text || '', turnLocation);
      for (const tf of turnFindings) {
        unresolved.push({
          sourceType: 'conversation',
          location: turnLocation,
          line: tf.line,
          ruleId: tf.category,
          ruleName: tf.category,
          maskedValue: tf.masked,
          findingKey: findingKey(tf),
        });
      }
    }
  }

  // 3. Scan Passport Text
  const passportFieldsToScan: Array<{ label: string; text: string }> = [
    { label: 'Project Name', text: passport.project.name || '' },
    { label: 'Project Goal', text: passport.project.goal || '' },
    { label: 'Project Summary', text: passport.project.summary || '' },
    { label: 'Next Action', text: passport.nextAction || '' },
  ];

  for (const r of passport.requirements || []) {
    passportFieldsToScan.push({ label: `Requirement: ${r.text}`, text: r.text });
  }

  for (const d of passport.decisions || []) {
    passportFieldsToScan.push({ label: `Decision: ${d.decision}`, text: `${d.decision} ${d.reason}` });
  }

  for (const t of passport.tasks || []) {
    passportFieldsToScan.push({ label: `Task: ${t.text}`, text: t.text });
  }

  for (const b of passport.bugs || []) {
    passportFieldsToScan.push({ label: `Bug: ${b.text}`, text: b.text });
  }

  for (const inst of passport.instructions || []) {
    passportFieldsToScan.push({ label: 'Instruction', text: inst });
  }

  for (const q of passport.openQuestions || []) {
    passportFieldsToScan.push({ label: 'Open Question', text: q });
  }

  for (const field of passportFieldsToScan) {
    if (!field.text) continue;
    const pfFindings = scanText(field.text, `Passport (${field.label})`);
    for (const pf of pfFindings) {
      unresolved.push({
        sourceType: 'passport',
        location: `Passport (${field.label})`,
        line: pf.line,
        ruleId: pf.category,
        ruleName: pf.category,
        maskedValue: pf.masked,
        findingKey: findingKey(pf),
      });
    }
  }

  const isBlocked = unresolved.length > 0;
  const summary = isBlocked
    ? `Export blocked: ${unresolved.length} potential secret${unresolved.length === 1 ? '' : 's'} detected. Review findings, redact, or exclude before exporting.`
    : 'No unresolved secrets detected.';

  return {
    isBlocked,
    unresolvedFindings: unresolved,
    summary,
  };
}
