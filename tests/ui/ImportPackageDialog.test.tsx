import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import JSZip from 'jszip';
import { ToastProvider } from '../../src/ui/Toast';
import { ImportPackageDialog } from '../../src/ui/ImportPackageDialog';
import { createEmptyPassport } from '../../src/domain';
import { db } from '../../src/storage/db';
import { sha256Hex } from '../../src/domain/hash';

function renderDialog(props: {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: (projectId: string) => void;
}) {
  return render(
    <ToastProvider>
      <ImportPackageDialog {...props} />
    </ToastProvider>
  );
}

describe('ImportPackageDialog (RTL)', () => {
  beforeEach(async () => {
    await db.projects.clear();
    await db.passports.clear();
    await db.files.clear();
    await db.conversations.clear();
  });

  it('renders upload dropzone when open and calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    renderDialog({ isOpen: true, onClose });

    expect(screen.getByText('Import Handoff Package')).toBeInTheDocument();
    expect(screen.getByText('Choose .zip handoff package')).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows verification error if uploaded file is corrupted or not a valid zip package', async () => {
    const onClose = vi.fn();
    renderDialog({ isOpen: true, onClose });

    // Upload an invalid text file pretending to be zip
    const badFile = new File(['not a zip content'], 'corrupted.zip', {
      type: 'application/zip',
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput, { target: { files: [badFile] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Verification Failed/i)).toBeInTheDocument();
    });
  });

  it('verifies and imports valid package successfully without collision', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    const passport = createEmptyPassport('Packaged App');
    passport.project.id = 'imported-pkg-1';
    passport.project.goal = 'Restore testing';
    const passportJson = JSON.stringify(passport, null, 2);
    const passportHash = await sha256Hex(passportJson);

    const zip = new JSZip();
    zip.file('project-passport.json', passportJson);
    zip.file(
      'MANIFEST.json',
      JSON.stringify({
        manifestVersion: 1,
        schemaVersion: 1,
        entries: [
          {
            path: 'project-passport.json',
            sizeBytes: new TextEncoder().encode(passportJson).length,
            sha256: passportHash,
          },
        ],
      })
    );

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const validFile = new File([zipBuffer], 'handoff.zip', { type: 'application/zip' });

    renderDialog({ isOpen: true, onClose, onImportSuccess: onSuccess });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(screen.getByText('Packaged App')).toBeInTheDocument();
      expect(screen.getByText('Verified Archive')).toBeInTheDocument();
    });

    // No conflict dialog should be present
    expect(
      screen.queryByText(/A project with this ID already exists locally/i)
    ).toBeNull();

    // Click Import project
    const importBtn = screen.getByRole('button', { name: /Import project/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('imported-pkg-1');
      expect(onClose).toHaveBeenCalled();
    });

    // Check database
    const savedProject = await db.projects.get('imported-pkg-1');
    expect(savedProject).toBeDefined();
    expect(savedProject?.name).toBe('Packaged App');
  });

  it('detects existing same-ID project and allows choosing between copy and replace', async () => {
    const existingId = 'existing-pkg-id';
    await db.projects.put({
      id: existingId,
      name: 'Existing Project Name',
      updatedAt: new Date().toISOString(),
      status: 'in_progress',
    });

    const passport = createEmptyPassport('Imported Newer Name');
    passport.project.id = existingId;
    passport.project.goal = 'Conflict resolution test';
    const passportJson = JSON.stringify(passport, null, 2);
    const passportHash = await sha256Hex(passportJson);

    const zip = new JSZip();
    zip.file('project-passport.json', passportJson);
    zip.file(
      'MANIFEST.json',
      JSON.stringify({
        manifestVersion: 1,
        schemaVersion: 1,
        entries: [
          {
            path: 'project-passport.json',
            sizeBytes: new TextEncoder().encode(passportJson).length,
            sha256: passportHash,
          },
        ],
      })
    );

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const validFile = new File([zipBuffer], 'conflict.zip', { type: 'application/zip' });

    const onSuccess = vi.fn();
    renderDialog({ isOpen: true, onClose: vi.fn(), onImportSuccess: onSuccess });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(
        screen.getByText(/A project with this ID already exists locally:/i)
      ).toBeInTheDocument();
    });

    // Radio options
    const copyRadio = screen.getByLabelText(/Import as a copy/i);
    const replaceRadio = screen.getByLabelText(/Replace existing project/i);
    expect(copyRadio).toBeChecked();
    expect(replaceRadio).not.toBeChecked();

    // Select replace
    fireEvent.click(replaceRadio);
    expect(replaceRadio).toBeChecked();

    const importBtn = screen.getByRole('button', { name: /Import project/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(existingId);
    });

    const replaced = await db.projects.get(existingId);
    expect(replaced?.name).toBe('Imported Newer Name');
  });
});
