/**
 * Package Import logic with integrity verification and security checks.
 *
 * Invariants:
 * - Validates zip safety via shared zipSafety module (entry limit, size limit, path traversal).
 * - Validates MANIFEST.json first.
 * - Verifies SHA-256 digest of every file against the manifest.
 * - Rejects any missing, unlisted, or tampered file with a plain-language error naming the path.
 * - Validates passport through migratePassport.
 * - Restores conversations with lossless parseConversationMarkdown.
 * - Scans project files with secretScanner; returns findings for user review.
 * - Pure, deterministic, zero logging.
 */

import JSZip from 'jszip';
import {
  createZipNameDecoder,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES,
  UNSAFE_ZIP_ERROR_MESSAGE,
  ZIP_TOO_LARGE_ERROR_MESSAGE,
  ZIP_PARSE_ERROR_MESSAGE,
} from './zipSafety';
import type { PassportV1 } from '../domain/passport.schema';
import { migratePassport } from '../domain/migrate';
import { parseConversationMarkdown } from '../export/conversationMarkdown';
import { normalizeFilePath, isHardBlocked } from '../domain/fileRules';
import { sha256Hex } from '../domain/hash';
import { scanText, type SecretFinding } from '../domain/secretScanner';
import type { PackageManifest } from '../export/packageBuilder';
import type { ConversationTurn } from '../domain/conversation';

export interface ImportedFileItem {
  path: string;
  purpose: string;
  content: string;
  sizeBytes: number;
  included: boolean;
}

export interface ImportedConversationItem {
  record: {
    id: string;
    title: string;
    source: 'chatgpt' | 'claude' | 'gemini' | 'paste' | 'other';
    messageCount: number;
    tokenEstimate: number;
    included: boolean;
  };
  turns: ConversationTurn[];
}

export type PackageImportSuccess = {
  ok: true;
  passport: PassportV1;
  files: ImportedFileItem[];
  conversations: ImportedConversationItem[];
  findings: Array<{ path: string; findings: SecretFinding[] }>;
};

export type PackageImportFailure = {
  ok: false;
  code:
    | 'unsafe_zip'
    | 'zip_too_large'
    | 'zip_parse_error'
    | 'manifest_missing'
    | 'manifest_invalid'
    | 'integrity_mismatch'
    | 'passport_invalid'
    | 'hard_blocked_file';
  message: string;
};

export type PackageImportResult = PackageImportSuccess | PackageImportFailure;

/**
 * Validates and extracts a Full Handoff Package (.zip).
 */
export async function parsePackageZip(zipBuffer: ArrayBuffer): Promise<PackageImportResult> {
  let hasTraversal = false;
  let zip: JSZip;

  try {
    zip = await JSZip.loadAsync(zipBuffer, {
      decodeFileName: createZipNameDecoder(() => {
        hasTraversal = true;
      }),
    });
  } catch {
    return {
      ok: false,
      code: 'zip_parse_error',
      message: ZIP_PARSE_ERROR_MESSAGE,
    };
  }

  if (hasTraversal) {
    return {
      ok: false,
      code: 'unsafe_zip',
      message: UNSAFE_ZIP_ERROR_MESSAGE,
    };
  }

  const entries = Object.values(zip.files).filter((e) => !e.dir);
  if (entries.length > MAX_ZIP_ENTRIES) {
    return {
      ok: false,
      code: 'zip_too_large',
      message: ZIP_TOO_LARGE_ERROR_MESSAGE,
    };
  }

  // 1. Find and validate MANIFEST.json
  const manifestFile = zip.file('MANIFEST.json');
  if (!manifestFile) {
    return {
      ok: false,
      code: 'manifest_missing',
      message: 'The package is missing MANIFEST.json. Please provide a valid Project Passport package.',
    };
  }

  let manifest: PackageManifest;
  try {
    const manifestText = await manifestFile.async('text');
    manifest = JSON.parse(manifestText) as PackageManifest;
    if (
      typeof manifest !== 'object' ||
      manifest === null ||
      manifest.manifestVersion !== 1 ||
      !Array.isArray(manifest.entries)
    ) {
      throw new Error('Invalid manifest schema');
    }
  } catch {
    return {
      ok: false,
      code: 'manifest_invalid',
      message: 'The package manifest is corrupted or unsupported.',
    };
  }

  // 2. Build map of expected entries from manifest
  const manifestEntryMap = new Map<string, { sizeBytes: number; sha256: string }>();
  for (const entry of manifest.entries) {
    manifestEntryMap.set(entry.path, {
      sizeBytes: entry.sizeBytes,
      sha256: entry.sha256.toLowerCase(),
    });
  }

  // Check for unlisted files in the zip
  for (const entry of entries) {
    if (entry.name === 'MANIFEST.json') continue;
    if (!manifestEntryMap.has(entry.name)) {
      return {
        ok: false,
        code: 'integrity_mismatch',
        message: `Package integrity check failed: unlisted file "${entry.name}".`,
      };
    }
  }

  let totalUncompressed = 0;

  // 3. Verify SHA-256 for all manifest entries
  const fileContents = new Map<string, string>();

  for (const [entryPath, expectedMeta] of manifestEntryMap.entries()) {
    const zipEntry = zip.file(entryPath);
    if (!zipEntry) {
      return {
        ok: false,
        code: 'integrity_mismatch',
        message: `Package integrity check failed: missing file "${entryPath}".`,
      };
    }

    const contentText = await zipEntry.async('text');
    const contentBytes = new TextEncoder().encode(contentText).length;
    totalUncompressed += contentBytes;

    if (totalUncompressed > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) {
      return {
        ok: false,
        code: 'zip_too_large',
        message: ZIP_TOO_LARGE_ERROR_MESSAGE,
      };
    }

    const actualHash = (await sha256Hex(contentText)).toLowerCase();
    if (actualHash !== expectedMeta.sha256) {
      return {
        ok: false,
        code: 'integrity_mismatch',
        message: `Package integrity check failed: SHA-256 hash mismatch for "${entryPath}".`,
      };
    }

    fileContents.set(entryPath, contentText);
  }

  // 4. Validate project-passport.json
  const passportRaw = fileContents.get('project-passport.json');
  if (!passportRaw) {
    return {
      ok: false,
      code: 'manifest_missing',
      message: 'Package is missing project-passport.json.',
    };
  }

  let parsedPassportJson: unknown;
  try {
    parsedPassportJson = JSON.parse(passportRaw);
  } catch {
    return {
      ok: false,
      code: 'passport_invalid',
      message: 'project-passport.json contains invalid JSON.',
    };
  }

  const migrationRes = migratePassport(parsedPassportJson);
  if (!migrationRes.success || !migrationRes.passport) {
    return {
      ok: false,
      code: 'passport_invalid',
      message: (migrationRes.errors && migrationRes.errors.join('; ')) || 'project-passport.json failed schema validation.',
    };
  }
  const passport = migrationRes.passport;

  // 5. Extract files
  const importedFiles: ImportedFileItem[] = [];
  const findings: Array<{ path: string; findings: SecretFinding[] }> = [];

  const manifestFileMap = new Map<string, { purpose: string; included: boolean }>();
  for (const f of passport.files || []) {
    manifestFileMap.set(f.path, { purpose: f.purpose, included: f.included });
  }

  for (const [entryPath, content] of fileContents.entries()) {
    if (!entryPath.startsWith('files/')) continue;
    const relPath = entryPath.slice('files/'.length);

    let normPath: string;
    try {
      normPath = normalizeFilePath(relPath);
    } catch {
      return {
        ok: false,
        code: 'unsafe_zip',
        message: UNSAFE_ZIP_ERROR_MESSAGE,
      };
    }

    if (isHardBlocked(normPath)) {
      return {
        ok: false,
        code: 'hard_blocked_file',
        message: `Package contains hard-blocked security file "${normPath}".`,
      };
    }

    const meta = manifestFileMap.get(normPath);
    const sizeBytes = new TextEncoder().encode(content).length;

    // Scan for secrets
    const fileFindings = scanText(content, normPath);
    if (fileFindings.length > 0) {
      findings.push({ path: normPath, findings: fileFindings });
    }

    importedFiles.push({
      path: normPath,
      purpose: meta?.purpose || '',
      content,
      sizeBytes,
      included: meta?.included ?? true,
    });
  }

  // 6. Extract conversations
  const importedConversations: ImportedConversationItem[] = [];
  const manifestConvMap = new Map<string, { source: string; included: boolean; title: string }>();
  for (const c of passport.conversations || []) {
    manifestConvMap.set(c.id, { source: c.source, included: c.included, title: c.title });
  }

  for (const [entryPath, content] of fileContents.entries()) {
    if (!entryPath.startsWith('conversations/')) continue;
    const parsedConv = parseConversationMarkdown(content);

    // Extract conversation ID from filename or markdown
    const filename = entryPath.slice('conversations/'.length);
    const idFromFilename = filename.split('-')[0] || '';
    const convId = parsedConv.id || idFromFilename;

    const meta = manifestConvMap.get(convId);
    const validSources = ['chatgpt', 'claude', 'gemini', 'paste', 'other'] as const;
    const rawSource = parsedConv.source || meta?.source || 'other';
    const source = validSources.includes(rawSource as typeof validSources[number])
      ? (rawSource as typeof validSources[number])
      : 'other';

    const turns = parsedConv.turns;
    const totalTokens = turns.reduce(
      (acc, t) => acc + Math.ceil(t.text.length / 4),
      0
    );

    importedConversations.push({
      record: {
        id: convId,
        title: parsedConv.title || meta?.title || 'Imported Conversation',
        source,
        messageCount: turns.length,
        tokenEstimate: totalTokens,
        included: meta?.included ?? true,
      },
      turns,
    });
  }

  return {
    ok: true,
    passport,
    files: importedFiles,
    conversations: importedConversations,
    findings,
  };
}
