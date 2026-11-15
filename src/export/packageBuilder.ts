/**
 * Pure, deterministic builder for Full Handoff Packages (.zip archive layout).
 *
 * Invariants:
 * - Deterministic output: fixed file ordering, sorted manifest.
 * - No timestamps in MANIFEST.json (reproducible byte identity).
 * - Hard-blocked files (.env*, *.key, etc.) NEVER appear in package.
 * - All file paths normalized via normalizeFilePath.
 * - Pure, deterministic, zero logging.
 */

import type { ExportPlan } from './budgeter';
import { passportToMarkdown } from '../domain/markdown';
import { generateContinuePrompt } from './continuePrompt';
import { formatConversationMarkdown } from './conversationMarkdown';
import { normalizeFilePath, isHardBlocked } from '../domain/fileRules';
import { sha256Hex } from '../domain/hash';

export const MANIFEST_VERSION = 1;

export interface PackageManifestEntry {
  path: string;
  sizeBytes: number;
  sha256: string;
}

export interface PackageManifest {
  manifestVersion: number;
  schemaVersion: number;
  projectId: string;
  projectName: string;
  entries: PackageManifestEntry[];
}

export interface PackageFilePayload {
  path: string;
  content: string;
  sizeBytes: number;
  sha256: string;
}

export interface PackageArtifactsResult {
  files: PackageFilePayload[];
  manifest: PackageManifest;
  manifestJson: string;
}

/**
 * Builds all file payloads and MANIFEST.json for the export zip package.
 */
export async function buildPackageArtifacts(plan: ExportPlan): Promise<PackageArtifactsResult> {
  const { filteredPassport, includedFiles, includedConversations } = plan;
  const files: PackageFilePayload[] = [];

  // 1. project-passport.json
  const passportJson = JSON.stringify(filteredPassport, null, 2);
  const passportBytes = new TextEncoder().encode(passportJson).length;
  const passportHash = await sha256Hex(passportJson);
  files.push({
    path: 'project-passport.json',
    content: passportJson,
    sizeBytes: passportBytes,
    sha256: passportHash,
  });

  // 2. PROJECT_STATE.md
  const projectStateMd = passportToMarkdown(filteredPassport);
  const stateBytes = new TextEncoder().encode(projectStateMd).length;
  const stateHash = await sha256Hex(projectStateMd);
  files.push({
    path: 'PROJECT_STATE.md',
    content: projectStateMd,
    sizeBytes: stateBytes,
    sha256: stateHash,
  });

  // 3. CONTINUE_PROMPT.md
  const continuePromptMd = generateContinuePrompt(plan, 'full');
  const continueBytes = new TextEncoder().encode(continuePromptMd).length;
  const continueHash = await sha256Hex(continuePromptMd);
  files.push({
    path: 'CONTINUE_PROMPT.md',
    content: continuePromptMd,
    sizeBytes: continueBytes,
    sha256: continueHash,
  });

  // 4. files/ directory
  for (const file of includedFiles) {
    let normPath: string;
    try {
      normPath = normalizeFilePath(file.path);
    } catch {
      continue;
    }

    // Security check: Never export hard-blocked files
    if (isHardBlocked(normPath)) {
      continue;
    }

    const fullEntryPath = `files/${normPath}`;
    const fileBytes = new TextEncoder().encode(file.content).length;
    const fileHash = await sha256Hex(file.content);
    files.push({
      path: fullEntryPath,
      content: file.content,
      sizeBytes: fileBytes,
      sha256: fileHash,
    });
  }

  // 5. conversations/ directory
  for (const conv of includedConversations) {
    const safeTitle = (conv.title || 'chat')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'conversation';
    const convEntryPath = `conversations/${conv.id}-${safeTitle}.md`;
    const convMarkdown = formatConversationMarkdown(
      { id: conv.id, title: conv.title, source: conv.source },
      conv.turns
    );
    const convBytes = new TextEncoder().encode(convMarkdown).length;
    const convHash = await sha256Hex(convMarkdown);
    files.push({
      path: convEntryPath,
      content: convMarkdown,
      sizeBytes: convBytes,
      sha256: convHash,
    });
  }

  // Sort files deterministically by path
  files.sort((a, b) => a.path.localeCompare(b.path));

  // Build MANIFEST.json from all included files
  const manifestEntries: PackageManifestEntry[] = files.map((f) => ({
    path: f.path,
    sizeBytes: f.sizeBytes,
    sha256: f.sha256,
  }));

  const manifest: PackageManifest = {
    manifestVersion: MANIFEST_VERSION,
    schemaVersion: filteredPassport.schemaVersion,
    projectId: filteredPassport.project.id,
    projectName: filteredPassport.project.name,
    entries: manifestEntries,
  };

  const manifestJson = JSON.stringify(manifest, null, 2);

  // Add MANIFEST.json itself to the package files list
  const manifestBytes = new TextEncoder().encode(manifestJson).length;
  const manifestHash = await sha256Hex(manifestJson);
  files.push({
    path: 'MANIFEST.json',
    content: manifestJson,
    sizeBytes: manifestBytes,
    sha256: manifestHash,
  });

  // Re-sort to maintain clean lexicographical ordering
  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    files,
    manifest,
    manifestJson,
  };
}
