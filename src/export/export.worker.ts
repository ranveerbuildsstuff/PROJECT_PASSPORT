/**
 * Web Worker for off-thread JSZip archive generation.
 *
 * Invariants:
 * - Runs entirely off the main UI thread.
 * - DEFLATE compression with fixed entry timestamps (reproducible byte identity).
 * - Hashes final zip with sha256Hex.
 * - Zero network requests, zero logging.
 * - handleExportWorkerMessage exported as pure function for Vitest testing.
 */

import JSZip from 'jszip';
import type { ExportPlan } from './budgeter';
import { buildPackageArtifacts } from './packageBuilder';
import { sha256Hex } from '../domain/hash';

export const FIXED_ZIP_DATE = new Date('2026-01-01T00:00:00.000Z');

export type ExportWorkerIncomingMessage = {
  action: 'build_zip';
  plan: ExportPlan;
};

export type ExportWorkerOutgoingMessage =
  | {
      type: 'zip_success';
      buffer: ArrayBuffer;
      filename: string;
      sizeBytes: number;
      sha256: string;
    }
  | {
      type: 'error';
      message: string;
    };

/**
 * Pure handler function for worker messages (testable in Vitest).
 */
export async function handleExportWorkerMessage(
  message: ExportWorkerIncomingMessage
): Promise<ExportWorkerOutgoingMessage> {
  if (message.action !== 'build_zip') {
    return {
      type: 'error',
      message: 'Unknown action received by export worker.',
    };
  }

  try {
    const { files, manifest } = await buildPackageArtifacts(message.plan);
    const zip = new JSZip();

    for (const file of files) {
      zip.file(file.path, file.content, {
        date: FIXED_ZIP_DATE,
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
    }

    const buffer = await zip.generateAsync({
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const sizeBytes = buffer.byteLength;
    const sha256 = await sha256Hex(new Uint8Array(buffer));

    const safeName = (manifest.projectName || 'project')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'passport';
    const filename = `${safeName}-passport.zip`;

    return {
      type: 'zip_success',
      buffer,
      filename,
      sizeBytes,
      sha256,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate package archive.';
    return {
      type: 'error',
      message,
    };
  }
}

// In worker runtime: attach message listener
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = async (e: MessageEvent<ExportWorkerIncomingMessage>) => {
    const res = await handleExportWorkerMessage(e.data);
    if (res.type === 'zip_success') {
      // Transfer buffer ownership for zero-copy performance
      (self as unknown as { postMessage: (msg: unknown, transfer?: Transferable[]) => void }).postMessage(res, [res.buffer]);
    } else {
      self.postMessage(res);
    }
  };
}
