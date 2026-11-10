import React, { useState, useRef } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { useToast } from './useToast';
import {
  exportEverything,
  importBackup,
  type BackupData,
  BackupInvalid,
} from '../storage';
import { formatBytes } from '../lib';

export interface BackupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreComplete?: () => void;
}

export function BackupDialog({ isOpen, onClose, onRestoreComplete }: BackupDialogProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [exportStats, setExportStats] = useState<{ sizeStr: string; warn: boolean } | null>(null);

  const [pendingBackup, setPendingBackup] = useState<{
    data: BackupData;
    fileName: string;
    projectCount: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const resetState = () => {
    setPendingBackup(null);
    setImportError(null);
    setExportStats(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleExport = async () => {
    setIsExporting(true);
    setImportError(null);
    try {
      const backup = await exportEverything();
      const json = JSON.stringify(backup, null, 2);
      const byteSize = new Blob([json]).size;
      const sizeStr = formatBytes(byteSize);
      const isOver50Mb = byteSize > 50 * 1024 * 1024;

      setExportStats({ sizeStr, warn: isOver50Mb });

      const today = new Date().toISOString().slice(0, 10);
      const filename = `project-passport-backup-${today}.json`;

      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`Exported ${backup.projects.length} project(s) (${sizeStr})`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export backup.';
      setImportError(message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = typeof file.text === 'function'
        ? await file.text()
        : await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
          });

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new BackupInvalid(
          'The selected file is not valid JSON.',
          'Please ensure the file is an uncorrupted Project Passport backup JSON file.'
        );
      }

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('backupVersion' in parsed) ||
        !('projects' in parsed) ||
        !Array.isArray((parsed as { projects?: unknown }).projects)
      ) {
        throw new BackupInvalid(
          'The backup file format is not recognized.',
          'Please select a valid Project Passport backup file with schema version 1.'
        );
      }

      if ((parsed as { backupVersion?: unknown }).backupVersion !== 1) {
        throw new BackupInvalid(
          `Unsupported backup version: ${String((parsed as { backupVersion?: unknown }).backupVersion)}. Only backupVersion 1 is supported.`,
          'Please use a backup exported from a compatible version of Project Passport.'
        );
      }

      const backupData = parsed as BackupData;
      setPendingBackup({
        data: backupData,
        fileName: file.name,
        projectCount: backupData.projects.length,
      });
    } catch (err) {
      if (err instanceof BackupInvalid) {
        setImportError(`${err.message} ${err.nextStep}`);
      } else {
        const message = err instanceof Error ? err.message : 'Failed to read backup file.';
        setImportError(message);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingBackup) return;
    setIsImporting(true);
    setImportError(null);

    try {
      const result = await importBackup(pendingBackup.data);
      showToast(`Restored ${result.projectsImported} project(s) successfully.`, 'success');
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
      onRestoreComplete?.();
      handleClose();
    } catch (err) {
      if (err instanceof BackupInvalid) {
        setImportError(`${err.message} ${err.nextStep}`);
      } else {
        const message = err instanceof Error ? err.message : 'Failed to restore backup.';
        setImportError(message);
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Backup & restore"
      description="Export your entire local workspace or restore from a previously exported backup archive."
    >
      <div className="flex flex-col gap-6">
        {importError && (
          <div
            role="alert"
            className="p-4 rounded-lg bg-color-danger/10 border border-color-danger text-color-danger text-sm flex flex-col gap-1"
          >
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Import error</span>
            </div>
            <p className="text-sm leading-relaxed">{importError}</p>
          </div>
        )}

        {/* Export Section */}
        <div className="flex flex-col gap-3 p-4 rounded-lg border border-border-subtle bg-bg-app/50">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="font-semibold text-sm text-text-primary">Export Everything</h4>
              <p className="text-xs text-text-muted mt-0.5">
                Download a JSON backup of all projects, passports, files, and checkpoints.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              isLoading={isExporting}
              onClick={handleExport}
              aria-label="Export backup file"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Export</span>
            </Button>
          </div>

          {exportStats && (
            <div className="text-xs mt-1 text-text-muted flex flex-col gap-1">
              <span>Backup size: {exportStats.sizeStr}</span>
              {exportStats.warn && (
                <span className="text-color-warning flex items-center gap-1 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                  Warning: Backup size exceeds 50 MB.
                </span>
              )}
            </div>
          )}
        </div>

        {/* Import Section */}
        <div className="flex flex-col gap-3 p-4 rounded-lg border border-border-subtle bg-bg-app/50">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="font-semibold text-sm text-text-primary">Restore from Backup</h4>
              <p className="text-xs text-text-muted mt-0.5">
                Load a previously saved JSON backup file.
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
                id="backup-file-input"
                aria-label="Select backup JSON file"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                <span>Select file</span>
              </Button>
            </div>
          </div>

          {/* Import Confirmation Dialog Content */}
          {pendingBackup && (
            <div className="mt-3 p-4 rounded-lg border border-color-warning/50 bg-color-warning/10 text-text-primary flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-color-warning shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold text-color-warning uppercase tracking-wider">
                    Confirm Project Replacement
                  </p>
                  <p className="text-sm leading-relaxed">
                    Found <strong>{pendingBackup.projectCount}</strong> project(s) in{' '}
                    <code className="font-mono text-xs">{pendingBackup.fileName}</code>.
                  </p>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Projects in this backup sharing the same ID as existing local projects will be{' '}
                    <strong className="text-color-warning">REPLACED</strong>. Unrelated local projects will remain untouched.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-color-warning/20">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPendingBackup(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  disabled={isImporting}
                  aria-label="Cancel restore"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={isImporting}
                  onClick={handleConfirmImport}
                >
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>Confirm and restore</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
