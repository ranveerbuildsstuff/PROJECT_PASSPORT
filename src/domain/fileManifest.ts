import { type SecretFinding, findingKey } from './secretScanner';

export interface FileManifestRow {
  path: string;
  purpose: string;
  included: boolean;
  sizeBytes: number;
  tokenEstimate: number;
}

/**
 * Builds a manifest row representation for an attached project file.
 */
export function buildFileManifestRow(
  path: string,
  sizeBytes: number,
  purpose = '',
  included = true
): FileManifestRow {
  // Approximate tokens by dividing size bytes by 4 (rough 4 chars per token)
  const tokenEstimate = Math.ceil(sizeBytes / 4);

  return {
    path,
    purpose,
    included,
    sizeBytes,
    tokenEstimate,
  };
}

export interface FileItemWithFindings {
  path: string;
  findings?: SecretFinding[];
  acknowledgedKeys?: string[] | Set<string>;
}

/**
 * Pure selector for unresolved secret findings across a collection of files.
 * Used by Slice 10's Secret Gate to determine whether package export should be blocked.
 */
export function unresolvedFindings(files: FileItemWithFindings[]): SecretFinding[] {
  const unresolved: SecretFinding[] = [];

  for (const file of files) {
    if (!file.findings || file.findings.length === 0) continue;

    const ackSet = file.acknowledgedKeys instanceof Set
      ? file.acknowledgedKeys
      : new Set(file.acknowledgedKeys ?? []);

    for (const finding of file.findings) {
      const key = findingKey(finding);
      if (!ackSet.has(key)) {
        unresolved.push(finding);
      }
    }
  }

  return unresolved;
}
