import JSZip from 'jszip';
import {
  normalizeFilePath,
  isHardBlocked,
  shouldIgnore,
  DEFAULT_IGNORE_LIST,
  MAX_FILE_SIZE_BYTES,
} from '../domain/fileRules';
import {
  type SecretFinding,
  scanText,
  redactText,
  findingKey,
} from '../domain/secretScanner';
import {
  MAX_ZIP_ENTRIES,
  MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES,
  UNSAFE_ZIP_ERROR_MESSAGE,
  ZIP_PARSE_ERROR_MESSAGE,
  createZipNameDecoder,
} from './zipSafety';

export { MAX_ZIP_ENTRIES, MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES };

export interface WorkerIncomingFileInput {
  name: string;
  path?: string;
  size?: number;
  file?: File | Blob;
  text?: string;
  buffer?: ArrayBuffer;
  isZip?: boolean;
}

export interface StagedWorkerFile {
  path: string;
  rawContent: string;
  sizeBytes: number;
  findings: SecretFinding[];
}

export interface FilesWorkerState {
  stagedFiles: Map<string, StagedWorkerFile>;
  hardBlockedPaths: string[];
  ignoredFiles: Array<{ path: string; reason: string }>;
  allFindings: SecretFinding[];
}

export type FilesWorkerIncomingMessage =
  | {
      action: 'scan';
      files: WorkerIncomingFileInput[];
      ignoreList?: string[];
    }
  | {
      action: 'commit';
      redactions: SecretFinding[]; // findings user chose to redact
      excludedPaths: string[]; // paths user chose to exclude
      acknowledgedKeys: string[]; // findingKeys marked as false positive
    }
  | {
      action: 'clear';
    };

export type FilesWorkerOutgoingMessage =
  | {
      type: 'scan_result';
      result:
        | {
            ok: true;
            included: Array<{ path: string; sizeBytes: number; tokenEstimate: number }>;
            ignored: Array<{ path: string; reason: string }>;
            hardBlocked: string[];
            findings: SecretFinding[];
          }
        | {
            ok: false;
            code: 'unsafe_zip' | 'zip_too_large' | 'empty' | 'read_error' | 'zip_parse_error';
            message: string;
          };
    }
  | {
      type: 'commit_result';
      files: Array<{
        path: string;
        content?: string;
        sizeBytes: number;
        included: boolean;
        acknowledgedFindings: string[];
      }>;
    }
  | {
      type: 'cleared';
    }
  | {
      type: 'error';
      code: string;
      message: string;
    };

/**
 * Pure state reducer and processing logic for file ingestion and secret scanning.
 * Used off-thread in the Web Worker and directly in unit tests.
 */
export async function handleFilesWorkerMessage(
  state: FilesWorkerState,
  message: FilesWorkerIncomingMessage
): Promise<{ nextState: FilesWorkerState; response: FilesWorkerOutgoingMessage }> {
  if (message.action === 'clear') {
    return {
      nextState: {
        stagedFiles: new Map(),
        hardBlockedPaths: [],
        ignoredFiles: [],
        allFindings: [],
      },
      response: { type: 'cleared' },
    };
  }

  if (message.action === 'commit') {
    const excludedSet = new Set(message.excludedPaths);
    const ackSet = new Set(message.acknowledgedKeys);

    // Group findings to redact by path
    const redactionMap = new Map<string, SecretFinding[]>();
    for (const f of message.redactions) {
      const list = redactionMap.get(f.path) ?? [];
      list.push(f);
      redactionMap.set(f.path, list);
    }

    const outputFiles: Array<{
      path: string;
      content?: string;
      sizeBytes: number;
      included: boolean;
      acknowledgedFindings: string[];
    }> = [];

    for (const [path, file] of state.stagedFiles.entries()) {
      const isExcluded = excludedSet.has(path);
      const fileAckKeys = file.findings
        .map(findingKey)
        .filter((k) => ackSet.has(k));

      if (isExcluded) {
        // Excluded files keep manifest row with included: false and store NO content
        outputFiles.push({
          path,
          sizeBytes: file.sizeBytes,
          included: false,
          acknowledgedFindings: fileAckKeys,
        });
      } else {
        // Apply redactions if any findings on this file were targeted for redaction
        const toRedact = redactionMap.get(path);
        let finalContent = file.rawContent;
        if (toRedact && toRedact.length > 0) {
          finalContent = redactText(finalContent, toRedact);
        }

        outputFiles.push({
          path,
          content: finalContent,
          sizeBytes: new Blob([finalContent]).size,
          included: true,
          acknowledgedFindings: fileAckKeys,
        });
      }
    }

    return {
      nextState: state,
      response: {
        type: 'commit_result',
        files: outputFiles,
      },
    };
  }

  if (message.action === 'scan') {
    const ignoreList = message.ignoreList ?? DEFAULT_IGNORE_LIST;
    const stagedFiles = new Map<string, StagedWorkerFile>();
    const hardBlockedPaths: string[] = [];
    const ignoredFiles: Array<{ path: string; reason: string }> = [];
    const allFindings: SecretFinding[] = [];

    if (!message.files || message.files.length === 0) {
      return {
        nextState: state,
        response: {
          type: 'scan_result',
          result: {
            ok: false,
            code: 'empty',
            message: 'Choose files, a folder or a .zip file from your project.',
          },
        },
      };
    }

    try {
      for (const item of message.files) {
        const isZip =
          item.isZip ||
          item.name.toLowerCase().endsWith('.zip') ||
          (item.file && item.file.type === 'application/zip');

        if (isZip) {
          // Process zip archive
          let zipData: ArrayBuffer;
          if (item.buffer) {
            zipData = item.buffer;
          } else if (item.file) {
            zipData = await item.file.arrayBuffer();
          } else if (item.text) {
            zipData = new TextEncoder().encode(item.text).buffer;
          } else {
            continue;
          }

          let hasTraversalInRawName = false;
          let zip: JSZip;
          try {
            zip = await JSZip.loadAsync(zipData, {
              decodeFileName: createZipNameDecoder(() => {
                hasTraversalInRawName = true;
              }),
            });
          } catch {
            return {
              nextState: state,
              response: {
                type: 'scan_result',
                result: {
                  ok: false,
                  code: 'zip_parse_error',
                  message: ZIP_PARSE_ERROR_MESSAGE,
                },
              },
            };
          }

          if (hasTraversalInRawName) {
            return {
              nextState: state,
              response: {
                type: 'scan_result',
                result: {
                  ok: false,
                  code: 'unsafe_zip',
                  message: UNSAFE_ZIP_ERROR_MESSAGE,
                },
              },
            };
          }

          const entries = Object.values(zip.files);
          if (entries.length > MAX_ZIP_ENTRIES) {
            return {
              nextState: state,
              response: {
                type: 'scan_result',
                result: {
                  ok: false,
                  code: 'zip_too_large',
                  message: 'This .zip expands to more than the app can handle safely. Choose a smaller folder or archive.',
                },
              },
            };
          }

          let totalUncompressed = 0;

          // Validate entry paths and check size declarations
          for (const entry of entries) {
            if (entry.dir) continue;

            let normalized: string;
            try {
              normalized = normalizeFilePath(entry.name);
            } catch {
              return {
                nextState: state,
                response: {
                  type: 'scan_result',
                  result: {
                    ok: false,
                    code: 'unsafe_zip',
                    message: "This .zip contains paths we can't use safely. Unzip it yourself and choose the folder instead.",
                  },
                },
              };
            }

            // Check hard block BEFORE any decompression
            if (isHardBlocked(normalized)) {
              if (!hardBlockedPaths.includes(normalized)) {
                hardBlockedPaths.push(normalized);
              }
              continue;
            }

            // Declared uncompressed size check if available
            // JSZip exposes entry metadata in internal object
            const declaredSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
            totalUncompressed += declaredSize;
            if (totalUncompressed > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) {
              return {
                nextState: state,
                response: {
                  type: 'scan_result',
                  result: {
                    ok: false,
                    code: 'zip_too_large',
                    message: 'This .zip expands to more than the app can handle safely. Choose a smaller folder or archive.',
                  },
                },
              };
            }

            // Check ignore filter BEFORE decompressing
            const ignoreCheck = shouldIgnore(normalized, declaredSize, ignoreList);
            if (ignoreCheck.ignore) {
              ignoredFiles.push({
                path: normalized,
                reason: ignoreCheck.reason || 'Ignored',
              });
              continue;
            }

            // Decompress entry
            const content = await entry.async('string');
            const actualSize = new Blob([content]).size;

            if (actualSize > MAX_FILE_SIZE_BYTES) {
              ignoredFiles.push({
                path: normalized,
                reason: 'File exceeds 500 KB limit',
              });
              continue;
            }

            // Scan decompressed content for secrets
            const findings = scanText(content, normalized);
            allFindings.push(...findings);

            stagedFiles.set(normalized, {
              path: normalized,
              rawContent: content,
              sizeBytes: actualSize,
              findings,
            });
          }
        } else {
          // Regular loose file or folder directory entry
          const rawPath = item.path || item.name;
          let normalized: string;
          try {
            normalized = normalizeFilePath(rawPath);
          } catch {
            ignoredFiles.push({
              path: rawPath,
              reason: 'Invalid path format',
            });
            continue;
          }

          // Hard-block check BEFORE reading content
          if (isHardBlocked(normalized)) {
            if (!hardBlockedPaths.includes(normalized)) {
              hardBlockedPaths.push(normalized);
            }
            continue;
          }

          const declaredSize = item.size ?? (item.file?.size || (item.text ? item.text.length : 0));
          const ignoreCheck = shouldIgnore(normalized, declaredSize, ignoreList);
          if (ignoreCheck.ignore) {
            ignoredFiles.push({
              path: normalized,
              reason: ignoreCheck.reason || 'Ignored',
            });
            continue;
          }

          // Read content
          let content = '';
          if (typeof item.text === 'string') {
            content = item.text;
          } else if (item.file) {
            content = await item.file.text();
          }

          const actualSize = new Blob([content]).size;
          if (actualSize > MAX_FILE_SIZE_BYTES) {
            ignoredFiles.push({
              path: normalized,
              reason: 'File exceeds 500 KB limit',
            });
            continue;
          }

          // Scan content for secrets
          const findings = scanText(content, normalized);
          allFindings.push(...findings);

          stagedFiles.set(normalized, {
            path: normalized,
            rawContent: content,
            sizeBytes: actualSize,
            findings,
          });
        }
      }

      const includedSummary = Array.from(stagedFiles.values()).map((f) => ({
        path: f.path,
        sizeBytes: f.sizeBytes,
        tokenEstimate: Math.ceil(f.sizeBytes / 4),
      }));

      const nextState: FilesWorkerState = {
        stagedFiles,
        hardBlockedPaths,
        ignoredFiles,
        allFindings,
      };

      return {
        nextState,
        response: {
          type: 'scan_result',
          result: {
            ok: true,
            included: includedSummary,
            ignored: ignoredFiles,
            hardBlocked: hardBlockedPaths,
            findings: allFindings,
          },
        },
      };
    } catch {
      return {
        nextState: state,
        response: {
          type: 'scan_result',
          result: {
            ok: false,
            code: 'read_error',
            message: 'An error occurred while reading the selected files.',
          },
        },
      };
    }
  }

  return {
    nextState: state,
    response: {
      type: 'error',
      code: 'invalid_action',
      message: 'Unrecognized files worker action.',
    },
  };
}

// In the browser Worker thread, listen for messages and dispatch responses
if (typeof self !== 'undefined' && typeof (self as unknown as { postMessage: unknown }).postMessage === 'function') {
  let currentState: FilesWorkerState = {
    stagedFiles: new Map(),
    hardBlockedPaths: [],
    ignoredFiles: [],
    allFindings: [],
  };

  self.onmessage = async (event: MessageEvent<FilesWorkerIncomingMessage>) => {
    try {
      const { nextState, response } = await handleFilesWorkerMessage(currentState, event.data);
      currentState = nextState;
      self.postMessage(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown worker error';
      self.postMessage({
        type: 'scan_result',
        result: {
          ok: false,
          code: 'read_error',
          message,
        },
      });
    }
  };
}
