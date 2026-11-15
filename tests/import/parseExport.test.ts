import { describe, it, expect } from 'vitest';
import { parseExportFiles } from '../../src/import/parseExport';

describe('parseExportFiles', () => {
  it('parses a single ChatGPT export file', () => {
    const files = [
      {
        name: 'conversations.json',
        text: JSON.stringify([
          {
            id: 'c1',
            title: 'Chat 1',
            mapping: {
              'n-1': {
                id: 'n-1',
                parent: null,
                children: [],
                message: { id: 'm-1', author: { role: 'user' }, content: { parts: ['Hello'] } },
              },
            },
            current_node: 'n-1',
          },
        ]),
      },
    ];

    const result = parseExportFiles(files);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.format).toBe('chatgpt');
      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0]?.title).toBe('Chat 1');
    }
  });

  it('parses a single Claude export file', () => {
    const files = [
      {
        name: 'claude-export.json',
        text: JSON.stringify([
          {
            uuid: 'cl-1',
            name: 'Claude Chat',
            chat_messages: [{ uuid: 'm-1', sender: 'human', text: 'Hi Claude' }],
          },
        ]),
      },
    ];

    const result = parseExportFiles(files);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.format).toBe('claude');
      expect(result.conversations).toHaveLength(1);
    }
  });

  it('sorts sharded files in alphabetical order and de-duplicates conversations by ID', () => {
    const shard2 = {
      name: 'conversations-002.json',
      text: JSON.stringify([
        {
          id: 'shared-id',
          title: 'Shard 2 Copy of Shared',
          mapping: {
            'n-1': {
              id: 'n-1',
              parent: null,
              children: [],
              message: { id: 'm-1', author: { role: 'user' }, content: { parts: ['Shard 2'] } },
            },
          },
          current_node: 'n-1',
        },
        {
          id: 'shard-2-unique',
          title: 'Shard 2 Unique',
          mapping: {
            'n-2': {
              id: 'n-2',
              parent: null,
              children: [],
              message: { id: 'm-2', author: { role: 'user' }, content: { parts: ['Unique in 2'] } },
            },
          },
          current_node: 'n-2',
        },
      ]),
    };

    const shard1 = {
      name: 'conversations-001.json',
      text: JSON.stringify([
        {
          id: 'shared-id',
          title: 'Shard 1 Copy of Shared',
          mapping: {
            'n-1': {
              id: 'n-1',
              parent: null,
              children: [],
              message: { id: 'm-1', author: { role: 'user' }, content: { parts: ['Shard 1'] } },
            },
          },
          current_node: 'n-1',
        },
      ]),
    };

    // Pass files in reverse order to verify alphabetical sorting
    const result = parseExportFiles([shard2, shard1]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.conversations).toHaveLength(2);
      // Because conversations-001.json is sorted first, its shared-id entry is kept
      expect(result.conversations[0]?.id).toBe('shared-id');
      expect(result.conversations[0]?.title).toBe('Shard 1 Copy of Shared');
      expect(result.conversations[1]?.id).toBe('shard-2-unique');
    }
  });

  it('rejects zip files with zip_not_supported code and exact plain-language copy', () => {
    const files = [
      {
        name: 'archive.zip',
        text: 'PK...',
      },
    ];

    const result = parseExportFiles(files);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('zip_not_supported');
      expect(result.message).toBe(
        'This is a .zip file. Unzip it first, then choose conversations.json.'
      );
    }
  });

  it('rejects empty file inputs with empty code', () => {
    const result = parseExportFiles([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('empty');
      expect(result.message).toBe('The selected file is empty.');
    }

    const emptyTextResult = parseExportFiles([{ name: 'empty.json', text: '   ' }]);
    expect(emptyTextResult.ok).toBe(false);
    if (!emptyTextResult.ok) {
      expect(emptyTextResult.code).toBe('empty');
      expect(emptyTextResult.message).toBe('The selected file is empty.');
    }
  });

  it('rejects malformed non-JSON files with not_json code', () => {
    const files = [
      {
        name: 'corrupted.json',
        text: '{ not valid json syntax ...',
      },
    ];

    const result = parseExportFiles(files);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('not_json');
      expect(result.message).toBe('The file could not be parsed as JSON.');
    }
  });

  it('rejects unrecognized format with unknown_format code and diagnostics', () => {
    const files = [
      {
        name: 'unknown.json',
        text: JSON.stringify([{ custom_unknown_field: true }]),
      },
    ];

    const result = parseExportFiles(files);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('unknown_format');
      expect(result.message).toBe('Unrecognized export format.');
      expect(result.diagnostics?.detectedKeys).toContain('custom_unknown_field');
    }
  });
});
