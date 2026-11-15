import { describe, it, expect } from 'vitest';
import { evaluateSecretGate } from '../../src/domain/secretGate';
import { findingKey } from '../../src/domain/secretScanner';
import type { PassportV1 } from '../../src/domain/passport.schema';
import type { FileRecord, ConversationRecord } from '../../src/storage/db';

describe('secretGate domain module', () => {
  const cleanPassport: PassportV1 = {
    schemaVersion: 1,
    project: {
      id: 'p-clean',
      name: 'Clean Project',
      goal: 'Security testing',
      summary: 'Secret gate unit tests',
      status: 'in_progress',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    stack: [{ name: 'React', role: 'UI' }],
    requirements: [{ id: 'r1', text: 'All code safe', priority: 'must' }],
    decisions: [{ id: 'd1', decision: 'No secrets in repo', reason: 'Security', status: 'active' }],
    completed: [],
    tasks: [],
    bugs: [],
    bugsReviewed: true,
    instructions: [],
    files: [{ path: 'src/app.ts', purpose: 'App', included: true, sizeBytes: 50 }],
    conversations: [{ id: 'c1', title: 'Clean Chat', source: 'claude', messageCount: 1, tokenEstimate: 10, included: true }],
    nextAction: 'Ship safe export',
    openQuestions: [],
  };

  const sampleApiKey = [
    'A', 'I', 'z', 'a',
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
    '1', '2', '3', '4', '5'
  ].join('');

  it('passes when no secrets exist in files, conversations, or passport text', () => {
    const result = evaluateSecretGate({
      passport: cleanPassport,
      files: [
        {
          id: 'p-clean:src/app.ts',
          projectId: 'p-clean',
          path: 'src/app.ts',
          content: 'console.log("no secrets here");',
          sizeBytes: 30,
          mime: 'text/plain',
          acknowledgedFindings: [],
        },
      ],
      conversations: [
        {
          record: {
            id: 'c1',
            projectId: 'p-clean',
            title: 'Clean Chat',
            source: 'claude',
            messages: [],
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          turns: [{ id: 't1', role: 'user', text: 'Clean message' }],
        },
      ],
    });

    expect(result.isBlocked).toBe(false);
    expect(result.unresolvedFindings).toHaveLength(0);
    expect(result.summary).toContain('No unresolved secrets');
  });

  it('blocks export when an included file contains an unacknowledged secret', () => {
    const fileWithSecret: FileRecord = {
      id: 'p-clean:src/app.ts',
      projectId: 'p-clean',
      path: 'src/app.ts',
      content: `const key = "${sampleApiKey}";`,
      sizeBytes: 50,
      mime: 'text/plain',
      acknowledgedFindings: [],
    };

    const result = evaluateSecretGate({
      passport: cleanPassport,
      files: [fileWithSecret],
    });

    expect(result.isBlocked).toBe(true);
    expect(result.unresolvedFindings).toHaveLength(1);
    expect(result.unresolvedFindings[0]!.sourceType).toBe('file');
    expect(result.unresolvedFindings[0]!.location).toBe('src/app.ts');
    expect(result.unresolvedFindings[0]!.maskedValue).toMatch(/AIza12\.\.\.[0-9a-zA-Z]+/);

    // Security invariant: raw secret value NEVER appears in gate result
    const jsonStr = JSON.stringify(result);
    expect(jsonStr).not.toContain(sampleApiKey);
  });

  it('permits secret when it is in file.acknowledgedFindings (false positive)', () => {
    const rawFinding = {
      path: 'src/app.ts',
      category: 'Google API Key',
      line: 1,
      masked: 'AIza12...2345',
    };
    const key = findingKey(rawFinding);

    const fileWithAck: FileRecord = {
      id: 'p-clean:src/app.ts',
      projectId: 'p-clean',
      path: 'src/app.ts',
      content: `const key = "${sampleApiKey}";`,
      sizeBytes: 50,
      mime: 'text/plain',
      acknowledgedFindings: [key],
    };

    const result = evaluateSecretGate({
      passport: cleanPassport,
      files: [fileWithAck],
    });

    expect(result.isBlocked).toBe(false);
    expect(result.unresolvedFindings).toHaveLength(0);
  });

  it('ignores secrets in files where included is false', () => {
    const excludedPassport: PassportV1 = {
      ...cleanPassport,
      files: [{ path: 'src/excluded.ts', purpose: 'Test', included: false, sizeBytes: 50 }],
    };

    const fileRecord: FileRecord = {
      id: 'p-clean:src/excluded.ts',
      projectId: 'p-clean',
      path: 'src/excluded.ts',
      content: `const key = "${sampleApiKey}";`,
      sizeBytes: 50,
      mime: 'text/plain',
      acknowledgedFindings: [],
    };

    const result = evaluateSecretGate({
      passport: excludedPassport,
      files: [fileRecord],
    });

    expect(result.isBlocked).toBe(false);
    expect(result.unresolvedFindings).toHaveLength(0);
  });

  it('blocks export when a conversation turn contains a secret', () => {
    const convRecord: ConversationRecord = {
      id: 'c1',
      projectId: 'p-clean',
      title: 'Chat with key',
      source: 'claude',
      messages: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    const result = evaluateSecretGate({
      passport: cleanPassport,
      conversations: [
        {
          record: convRecord,
          turns: [{ id: 't1', role: 'user', text: `Here is the key: ${sampleApiKey}` }],
        },
      ],
    });

    expect(result.isBlocked).toBe(true);
    expect(result.unresolvedFindings).toHaveLength(1);
    expect(result.unresolvedFindings[0]!.sourceType).toBe('conversation');
  });

  it('blocks export when passport decision contains a secret', () => {
    const passportWithSecret: PassportV1 = {
      ...cleanPassport,
      decisions: [
        { id: 'd1', decision: `Use token ${sampleApiKey}`, reason: 'Temporary', status: 'active' },
      ],
    };

    const result = evaluateSecretGate({
      passport: passportWithSecret,
    });

    expect(result.isBlocked).toBe(true);
    expect(result.unresolvedFindings).toHaveLength(1);
    expect(result.unresolvedFindings[0]!.sourceType).toBe('passport');
    expect(result.unresolvedFindings[0]!.location).toContain('Decision');
  });
});
