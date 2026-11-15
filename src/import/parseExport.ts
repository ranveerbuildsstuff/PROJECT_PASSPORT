import {
  parseChatGptExport,
  type ParsedConversation,
  type ParseOptions,
} from './chatgptParser';
import { parseClaudeExport } from './claudeParser';
import {
  detectExportFormat,
  type ExportDiagnostics,
} from './exportDetector';

export interface FileInput {
  name: string;
  text?: string;
  json?: unknown;
}

export interface ParseExportSuccess {
  ok: true;
  format: 'chatgpt' | 'claude';
  conversations: ParsedConversation[];
  notes: string[];
}

export type ParseExportErrorCode =
  | 'empty'
  | 'not_json'
  | 'unknown_format'
  | 'zip_not_supported'
  | 'out_of_memory';

export interface ParseExportFailure {
  ok: false;
  code: ParseExportErrorCode;
  message: string;
  diagnostics?: ExportDiagnostics;
}

export type ParseExportResult = ParseExportSuccess | ParseExportFailure;

/**
 * High-level pure export parser.
 * Handles single files or multi-file sharded exports (sorted alphabetically by filename),
 * de-duplicating conversations across shards by conversation ID.
 *
 * Invariants:
 * - Never throws.
 * - Detects zip archives and guides user to unzip first.
 * - Empty or malformed inputs return typed failure codes with human-readable error messages.
 * - Format mismatches return structured key diagnostics without disclosing payload content.
 */
export function parseExportFiles(
  files: FileInput[],
  options?: ParseOptions
): ParseExportResult {
  if (!files || files.length === 0) {
    return {
      ok: false,
      code: 'empty',
      message: 'The selected file is empty.',
    };
  }

  // Check for zip files first
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      return {
        ok: false,
        code: 'zip_not_supported',
        message: 'This is a .zip file. Unzip it first, then choose conversations.json.',
      };
    }
  }

  // Sort files in ascending order by name to guarantee deterministic shard merging
  const sortedFiles = [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );

  let detectedFormat: 'chatgpt' | 'claude' | null = null;
  const aggregatedConversations: ParsedConversation[] = [];
  const seenConversationIds = new Set<string>();
  const aggregatedNotes: string[] = [];

  for (const file of sortedFiles) {
    let parsedJson: unknown;

    if (file.json !== undefined) {
      parsedJson = file.json;
    } else {
      const rawText = file.text ?? '';
      if (rawText.trim().length === 0) {
        return {
          ok: false,
          code: 'empty',
          message: 'The selected file is empty.',
        };
      }

      try {
        parsedJson = JSON.parse(rawText);
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : '';
        const isOom =
          errMessage.includes('out of memory') ||
          errMessage.includes('Allocation failed') ||
          errMessage.includes('JavaScript heap out of memory');

        if (isOom) {
          return {
            ok: false,
            code: 'out_of_memory',
            message: 'The file is too large to process in memory.',
          };
        }

        return {
          ok: false,
          code: 'not_json',
          message: 'The file could not be parsed as JSON.',
        };
      }
    }

    const detection = detectExportFormat(parsedJson);

    if (detection.format === 'unknown') {
      return {
        ok: false,
        code: 'unknown_format',
        message: 'Unrecognized export format.',
        diagnostics: detection.diagnostics,
      };
    }

    if (detectedFormat === null) {
      detectedFormat = detection.format;
    }

    const conversations =
      detectedFormat === 'chatgpt'
        ? parseChatGptExport(parsedJson, options)
        : parseClaudeExport(parsedJson, options);

    for (const conv of conversations) {
      if (!seenConversationIds.has(conv.id)) {
        seenConversationIds.add(conv.id);
        aggregatedConversations.push(conv);
      }
    }
  }

  return {
    ok: true,
    format: detectedFormat || 'chatgpt',
    conversations: aggregatedConversations,
    notes: aggregatedNotes,
  };
}
