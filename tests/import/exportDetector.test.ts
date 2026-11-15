import { describe, it, expect } from 'vitest';
import { detectExportFormat } from '../../src/import/exportDetector';

describe('detectExportFormat', () => {
  it('detects ChatGPT export from mapping and current_node markers', () => {
    const json = [
      {
        mapping: {},
        current_node: 'node-1',
        title: 'Chat title',
      },
    ];

    const result = detectExportFormat(json);
    expect(result.format).toBe('chatgpt');
    expect(result.diagnostics).toBeUndefined();
  });

  it('detects Claude export from chat_messages marker', () => {
    const json = [
      {
        uuid: 'uuid-1',
        name: 'Chat title',
        chat_messages: [],
      },
    ];

    const result = detectExportFormat(json);
    expect(result.format).toBe('claude');
    expect(result.diagnostics).toBeUndefined();
  });

  it('detects Claude export from { conversations: [...] } object root', () => {
    const json = {
      conversations: [
        {
          uuid: 'uuid-1',
          name: 'Chat title',
          chat_messages: [],
        },
      ],
    };

    const result = detectExportFormat(json);
    expect(result.format).toBe('claude');
  });

  it('detects Claude export with empty conversations array', () => {
    const json = {
      conversations: [],
    };

    const result = detectExportFormat(json);
    expect(result.format).toBe('claude');
  });

  it('returns unknown with diagnostics for unrecognized data structure', () => {
    const json = [
      {
        foo: 1,
        bar: 2,
      },
    ];

    const result = detectExportFormat(json);
    expect(result.format).toBe('unknown');
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics?.itemCount).toBe(1);
    expect(result.diagnostics?.detectedKeys).toEqual(['bar', 'foo']);
    expect(result.diagnostics?.expectedKeys.chatgpt).toContain('mapping');
    expect(result.diagnostics?.expectedKeys.claude).toContain('chat_messages');
  });

  it('CRITICAL SENTINEL: diagnostics NEVER leaks secret values, tokens, or message content', () => {
    const SECRET_KEY_VALUE = 'SUPER_SECRET_TOKEN_VALUE_XYZ_98765';
    const SECRET_PROMPT_CONTENT = 'Extremely confidential message content that must never appear in diagnostics';

    const inputWithSecrets = [
      {
        api_key_field: SECRET_KEY_VALUE,
        message_body_field: SECRET_PROMPT_CONTENT,
        password_hash_field: 'bcrypt$2a$12$secretHashValue',
      },
    ];

    const result = detectExportFormat(inputWithSecrets);
    expect(result.format).toBe('unknown');
    expect(result.diagnostics).toBeDefined();

    const diagnosticsJson = JSON.stringify(result.diagnostics);

    // Verify key names are extracted
    expect(result.diagnostics?.detectedKeys).toEqual([
      'api_key_field',
      'message_body_field',
      'password_hash_field',
    ]);

    // Invariant: Verify sentinel values NEVER leak into diagnostics JSON
    expect(diagnosticsJson).not.toContain(SECRET_KEY_VALUE);
    expect(diagnosticsJson).not.toContain(SECRET_PROMPT_CONTENT);
    expect(diagnosticsJson).not.toContain('bcrypt$2a$12$secretHashValue');
  });

  it('returns unknown diagnostics when input is null, primitive, or empty array', () => {
    expect(detectExportFormat(null).format).toBe('unknown');
    expect(detectExportFormat('string').format).toBe('unknown');
    expect(detectExportFormat(12345).format).toBe('unknown');
    expect(detectExportFormat([]).format).toBe('unknown');
  });
});
